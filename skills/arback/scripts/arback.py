#!/usr/bin/env python3
"""
arback — unified CLI for Arweave memory backup.

Commands:
  backup   Encrypt memory directory and upload to Arweave
  restore  Download and decrypt a backup
  list     Show local backup index
  status   Show Turbo balance and wallet address
  topup    Top up Turbo Credits (balance / AR / fiat / token)
  init     Install Node.js dependencies

Env:
  AR_WALLET_PATH   Path to AR JWK wallet file (recommended)
  AR_WALLET_JSON   AR JWK wallet as JSON string (fallback)
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import subprocess
import sys
import tempfile
import webbrowser
from pathlib import Path

SCRIPTS_DIR = Path(__file__).parent
TURBO_DIR = SCRIPTS_DIR / "turbo"
TOPUP_MJS = TURBO_DIR / "topup.mjs"

# Local index stores backup history (tx IDs, sequences, etc.)
DEFAULT_INDEX = Path.home() / ".arback" / "index.json"


# ---------------------------------------------------------------------------
# Wallet helpers
# ---------------------------------------------------------------------------

def get_wallet_src(args_wallet: str | None) -> str:
    src = (
        args_wallet
        or os.environ.get("AR_WALLET_PATH")
        or os.environ.get("AR_WALLET_JSON")
    )
    if not src:
        print(
            "Error: AR_WALLET_PATH or AR_WALLET_JSON is required.\n"
            "  export AR_WALLET_PATH=/path/to/wallet.json",
            file=sys.stderr,
        )
        sys.exit(1)
    return src


def wallet_env(wallet_src: str) -> dict:
    env = os.environ.copy()
    if wallet_src.strip().startswith('{'):
        env["AR_WALLET_JSON"] = wallet_src
        env.pop("AR_WALLET_PATH", None)
    else:
        env["AR_WALLET_PATH"] = wallet_src
        env.pop("AR_WALLET_JSON", None)
    return env


# ---------------------------------------------------------------------------
# Local index
# ---------------------------------------------------------------------------

def load_index(index_path: Path = DEFAULT_INDEX) -> dict:
    if index_path.exists():
        return json.loads(index_path.read_text())
    return {"backups": []}


def save_index(index: dict, index_path: Path = DEFAULT_INDEX) -> None:
    index_path.parent.mkdir(parents=True, exist_ok=True)
    index_path.write_text(json.dumps(index, indent=2))


def add_to_index(entry: dict, index_path: Path = DEFAULT_INDEX) -> None:
    index = load_index(index_path)
    index["backups"].append(entry)
    save_index(index, index_path)


def latest_sequence(index: dict) -> int:
    if not index["backups"]:
        return 0
    return max(b.get("sequence", 0) for b in index["backups"])


# ---------------------------------------------------------------------------
# Node.js helpers
# ---------------------------------------------------------------------------

def ensure_node_deps() -> bool:
    node_modules = TURBO_DIR / "node_modules"
    turbo_sdk = node_modules / "@ardrive" / "turbo-sdk"
    if node_modules.exists() and turbo_sdk.exists():
        return True
    print("Installing Node.js dependencies...", file=sys.stderr)
    result = subprocess.run(
        ["npm", "install"],
        cwd=TURBO_DIR,
        capture_output=True,
        text=True,
    )
    if result.returncode != 0:
        print(f"npm install failed:\n{result.stderr}", file=sys.stderr)
        return False
    return True


def run_topup_node(args_list: list[str], wallet_src: str) -> dict:
    if not ensure_node_deps():
        sys.exit(1)
    env = wallet_env(wallet_src)
    result = subprocess.run(
        ["node", str(TOPUP_MJS)] + args_list,
        capture_output=True,
        text=True,
        env=env,
    )
    if result.returncode != 0:
        print(f"Turbo error:\n{result.stderr}\n{result.stdout}", file=sys.stderr)
        sys.exit(1)
    return json.loads(result.stdout.strip())


def winc_to_credits(winc_str: str) -> str:
    """Convert WINC string to human-readable credits (1 credit = 1e12 WINC)."""
    try:
        winc = int(winc_str)
        credits = winc / 1e12
        return f"{credits:.6f} Credits ({winc_str} WINC)"
    except (ValueError, TypeError):
        return winc_str


# ---------------------------------------------------------------------------
# Commands
# ---------------------------------------------------------------------------

def cmd_init(args):
    # Python deps via uv
    result = subprocess.run(
        ["uv", "pip", "install", "-r",
         str(Path(__file__).parent.parent / "requirements.txt")],
        capture_output=True, text=True,
    )
    if result.returncode != 0:
        print(f"uv install failed:\n{result.stderr}", file=sys.stderr)
        sys.exit(1)
    print("Python dependencies installed.")

    if ensure_node_deps():
        print("Node.js dependencies ready.")
    else:
        sys.exit(1)


def cmd_backup(args):
    from encrypt_pack import encrypt_pack
    from arweave_upload import upload

    wallet_src = get_wallet_src(args.wallet)
    input_dir = Path(args.input)
    if not input_dir.is_dir():
        print(f"Error: {input_dir} is not a directory", file=sys.stderr)
        sys.exit(1)

    filter_pattern = args.filter

    with tempfile.TemporaryDirectory() as tmpdir:
        tmp = Path(tmpdir)
        bundle_path = tmp / "bundle.enc"
        manifest_path = tmp / "manifest.json"

        index = load_index()
        seq = latest_sequence(index)

        manifest = encrypt_pack(
            input_dir=input_dir,
            out_bundle=bundle_path,
            out_manifest=manifest_path,
            wallet_src=wallet_src,
            filter_pattern=filter_pattern,
            existing_sequence=seq,
        )

        print(f"Packed {manifest['inventory']['file_count']} file(s), "
              f"{manifest['bundle_size_bytes']} bytes encrypted")

        if args.dry_run:
            result = upload(
                bundle_path=bundle_path,
                manifest_path=manifest_path,
                owner_hash=manifest["owner_hash"],
                bundle_sha256=manifest["bundle_sha256"],
                dry_run=True,
                wallet_src=wallet_src,
            )
            bundle_cost = result.get("estimated_winc", {}).get("bundle")
            manifest_cost = result.get("estimated_winc", {}).get("manifest")
            total_winc = (int(bundle_cost or 0) + int(manifest_cost or 0))
            print(f"\nDry-run estimate:")
            print(f"  Bundle:   {winc_to_credits(str(bundle_cost))}")
            print(f"  Manifest: {winc_to_credits(str(manifest_cost))}")
            print(f"  Total:    {winc_to_credits(str(total_winc))}")
            print(f"  Balance:  {winc_to_credits(result.get('balance_winc', '?'))}")
            return

        result = upload(
            bundle_path=bundle_path,
            manifest_path=manifest_path,
            owner_hash=manifest["owner_hash"],
            bundle_sha256=manifest["bundle_sha256"],
            dry_run=False,
            wallet_src=wallet_src,
        )

        # Update manifest with tx IDs
        import time as _time
        manifest["arweave_tx_id"] = result["bundle_tx_id"]
        manifest["arweave_manifest_tx_id"] = result["manifest_tx_id"]
        manifest["arweave_uploaded_at"] = int(_time.time())

        # Save to local index
        add_to_index({
            "sequence": manifest["sequence"],
            "created_at": manifest["created_at"],
            "bundle_tx": result["bundle_tx_id"],
            "manifest_tx": result["manifest_tx_id"],
            "file_count": manifest["inventory"]["file_count"],
            "bundle_size_bytes": manifest["bundle_size_bytes"],
            "filter": filter_pattern,
            "ar_address": manifest["ar_address"],
        })

        print(f"\nBackup complete!")
        print(f"  Bundle TX:   {result['bundle_tx_id']}")
        print(f"  Manifest TX: {result['manifest_tx_id']}")
        print(f"  Sequence:    {manifest['sequence']}")
        print(f"  View: https://arweave.net/{result['bundle_tx_id']}")


def cmd_restore(args):
    from arweave_download import download_tx
    from decrypt_unpack import decrypt_unpack

    wallet_src = get_wallet_src(args.wallet)
    out_dir = Path(args.out)

    bundle_tx = args.tx_id
    manifest_tx = args.manifest_tx

    if args.latest:
        index = load_index()
        if not index["backups"]:
            # Try discovering from Arweave
            print("No local index found, discovering from Arweave...", file=sys.stderr)
            from arweave_discover import discover_manifests
            manifests = discover_manifests(wallet_src, limit=1)
            if not manifests:
                print("No backups found on Arweave for this wallet.", file=sys.stderr)
                sys.exit(1)
            latest = manifests[0]
            bundle_tx = latest["bundle_tx"]
            manifest_tx = latest["id"]
        else:
            latest = sorted(index["backups"], key=lambda b: b.get("sequence", 0))[-1]
            bundle_tx = latest["bundle_tx"]
            manifest_tx = latest["manifest_tx"]

    if not bundle_tx or not manifest_tx:
        print("Error: provide --tx-id and --manifest-tx, or use --latest", file=sys.stderr)
        sys.exit(1)

    with tempfile.TemporaryDirectory() as tmpdir:
        tmp = Path(tmpdir)
        bundle_path = tmp / "bundle.enc"
        manifest_path = tmp / "manifest.json"

        print(f"Downloading bundle {bundle_tx} ...", file=sys.stderr)
        download_tx(bundle_tx, bundle_path)

        print(f"Downloading manifest {manifest_tx} ...", file=sys.stderr)
        download_tx(manifest_tx, manifest_path)

        count = decrypt_unpack(
            bundle_path=bundle_path,
            manifest_path=manifest_path,
            out_dir=out_dir,
            wallet_src=wallet_src,
        )

    print(f"Restored {count} file(s) to {out_dir}")


def cmd_list(args):
    index = load_index()
    backups = index.get("backups", [])
    if not backups:
        print("No local backup history. Run 'arback backup' first.")
        return

    print(f"{'#':<4} {'Sequence':<10} {'Files':<7} {'Size':<12} {'Bundle TX':<54} Created")
    print("-" * 110)
    for i, b in enumerate(sorted(backups, key=lambda x: x.get("sequence", 0))):
        import datetime
        ts = b.get("created_at", 0)
        dt = datetime.datetime.fromtimestamp(ts).strftime("%Y-%m-%d %H:%M") if ts else "?"
        print(
            f"{i+1:<4} {b.get('sequence','?'):<10} {b.get('file_count','?'):<7} "
            f"{b.get('bundle_size_bytes', 0):<12,} {b.get('bundle_tx','?'):<54} {dt}"
        )


def cmd_status(args):
    wallet_src = get_wallet_src(args.wallet)

    # Show AR address
    from encrypt_pack import load_ar_wallet, derive_ar_address
    jwk = load_ar_wallet(wallet_src)
    address = derive_ar_address(jwk)
    print(f"AR Address: {address}")

    # Show Turbo balance
    result = run_topup_node(["balance"], wallet_src)
    print(f"Turbo Balance: {winc_to_credits(result.get('winc', '?'))}")

    # Show local index summary
    index = load_index()
    count = len(index.get("backups", []))
    print(f"Local backups: {count}")
    if count > 0:
        latest = sorted(index["backups"], key=lambda b: b.get("sequence", 0))[-1]
        print(f"Latest sequence: {latest.get('sequence')} — {latest.get('bundle_tx','?')}")


def cmd_topup(args):
    wallet_src = get_wallet_src(args.wallet)

    if args.balance:
        result = run_topup_node(["balance"], wallet_src)
        print(f"Turbo Balance: {winc_to_credits(result.get('winc', '?'))}")

    elif args.ar is not None:
        print(f"Topping up with {args.ar} AR ...")
        result = run_topup_node(["ar", str(args.ar)], wallet_src)
        print(f"TX ID:         {result.get('tx_id')}")
        print(f"WINC received: {winc_to_credits(str(result.get('winc_received', '?')))}")
        print(f"Status:        {result.get('status')}")

    elif args.fiat:
        currency, amount = args.fiat[0], args.fiat[1]
        print(f"Creating Stripe checkout for {amount} {currency.upper()} ...")
        result = run_topup_node(["fiat", currency, amount], wallet_src)
        url = result.get("url")
        print(f"Will receive:  {winc_to_credits(str(result.get('winc_to_receive', '?')))}")
        print(f"Checkout URL:  {url}")
        if url:
            try:
                webbrowser.open(url)
                print("(Opened in browser)")
            except Exception:
                print("(Could not open browser — please visit URL manually)")

    elif args.token:
        token_type, amount = args.token[0], args.token[1]
        print(f"Topping up with {amount} {token_type} ...")
        result = run_topup_node(["token", token_type, amount], wallet_src)
        print(f"TX ID:         {result.get('tx_id')}")
        print(f"WINC received: {winc_to_credits(str(result.get('winc_received', '?')))}")
        print(f"Status:        {result.get('status')}")

    elif args.price is not None:
        result = run_topup_node(["price", str(args.price)], wallet_src)
        print(f"Estimated cost for {args.price:,} bytes: {winc_to_credits(str(result.get('winc','?')))}")

    else:
        # Default: show balance
        result = run_topup_node(["balance"], wallet_src)
        print(f"Turbo Balance: {winc_to_credits(result.get('winc', '?'))}")
        print()
        print("Top-up options:")
        print("  --ar <amount>              Pay with AR tokens  (e.g. --ar 0.01)")
        print("  --fiat <currency> <amount> Credit card via Stripe (e.g. --fiat usd 10)")
        print("  --token <type> <amount>    Other crypto (e.g. --token solana 0.1)")
        print("  --price <bytes>            Estimate cost for N bytes")
        print()
        print("Supported fiat: usd eur gbp cad aud inr sgd hkd brl jpy")
        print("Supported tokens: arweave solana ethereum matic pol kyve base-eth base-usdc usdc polygon-usdc ario base-ario")


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    parser = argparse.ArgumentParser(
        prog="arback",
        description="Arweave memory backup for AI agents",
    )
    parser.add_argument("--wallet", help="AR wallet path/JSON (overrides env)")
    sub = parser.add_subparsers(dest="command", required=True)

    # init
    p_init = sub.add_parser("init", help="Install Node.js dependencies")
    p_init.set_defaults(func=cmd_init)

    # backup
    p_backup = sub.add_parser("backup", help="Encrypt and upload memory directory")
    p_backup.add_argument("--input", required=True, help="Directory to back up")
    p_backup.add_argument("--filter", default="*.md",
                          help="File filter pattern (default: *.md)")
    p_backup.add_argument("--dry-run", action="store_true",
                          help="Estimate cost without uploading")
    p_backup.set_defaults(func=cmd_backup)

    # restore
    p_restore = sub.add_parser("restore", help="Download and decrypt a backup")
    p_restore.add_argument("--out", required=True, help="Output directory")
    p_restore.add_argument("--latest", action="store_true",
                           help="Restore most recent backup")
    p_restore.add_argument("--tx-id", help="Bundle transaction ID")
    p_restore.add_argument("--manifest-tx", help="Manifest transaction ID")
    p_restore.set_defaults(func=cmd_restore)

    # list
    p_list = sub.add_parser("list", help="List local backup history")
    p_list.set_defaults(func=cmd_list)

    # status
    p_status = sub.add_parser("status", help="Show wallet address and Turbo balance")
    p_status.set_defaults(func=cmd_status)

    # topup
    p_topup = sub.add_parser("topup", help="Top up Turbo Credits")
    p_topup.add_argument("--balance", action="store_true", help="Show current balance")
    p_topup.add_argument("--ar", type=float, metavar="AMOUNT",
                         help="Top up with AR tokens (e.g. 0.01)")
    p_topup.add_argument("--fiat", nargs=2, metavar=("CURRENCY", "AMOUNT"),
                         help="Credit card top-up (e.g. usd 10)")
    p_topup.add_argument("--token", nargs=2, metavar=("TYPE", "AMOUNT"),
                         help="Other crypto top-up (e.g. solana 0.1)")
    p_topup.add_argument("--price", type=int, metavar="BYTES",
                         help="Estimate upload cost for N bytes")
    p_topup.set_defaults(func=cmd_topup)

    args = parser.parse_args()
    args.func(args)


if __name__ == "__main__":
    main()
