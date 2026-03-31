#!/usr/bin/env python3
"""
arback — download bundle and manifest from Arweave by transaction IDs.
"""

import argparse
import json
import sys
import urllib.request
from pathlib import Path

ARWEAVE_GATEWAY = "https://arweave.net"


def download_tx(tx_id: str, out_path: Path) -> int:
    """Download transaction data by ID. Returns byte count."""
    url = f"{ARWEAVE_GATEWAY}/{tx_id}"
    req = urllib.request.Request(url, headers={"Accept": "*/*"})
    with urllib.request.urlopen(req, timeout=60) as resp:
        data = resp.read()
    out_path.write_bytes(data)
    return len(data)


def main():
    parser = argparse.ArgumentParser(
        description="arback: download bundle and manifest from Arweave"
    )
    parser.add_argument("--bundle-tx", required=True, help="Bundle transaction ID")
    parser.add_argument("--manifest-tx", required=True, help="Manifest transaction ID")
    parser.add_argument("--bundle-out", required=True, help="Output path for bundle")
    parser.add_argument("--manifest-out", required=True, help="Output path for manifest")
    args = parser.parse_args()

    bundle_path = Path(args.bundle_out)
    manifest_path = Path(args.manifest_out)
    bundle_path.parent.mkdir(parents=True, exist_ok=True)
    manifest_path.parent.mkdir(parents=True, exist_ok=True)

    print(f"Downloading bundle {args.bundle_tx} ...", file=sys.stderr)
    bundle_bytes = download_tx(args.bundle_tx, bundle_path)

    print(f"Downloading manifest {args.manifest_tx} ...", file=sys.stderr)
    manifest_bytes = download_tx(args.manifest_tx, manifest_path)

    print(json.dumps({
        "bundle_tx": args.bundle_tx,
        "manifest_tx": args.manifest_tx,
        "bundle_bytes": bundle_bytes,
        "manifest_bytes": manifest_bytes,
    }))


if __name__ == "__main__":
    main()
