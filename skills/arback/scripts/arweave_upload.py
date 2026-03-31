#!/usr/bin/env python3
"""
arback — Python wrapper for Turbo upload (calls Node.js upload.mjs).
"""
from __future__ import annotations

import json
import os
import subprocess
import sys
from pathlib import Path

TURBO_DIR = Path(__file__).parent / "turbo"
UPLOAD_MJS = TURBO_DIR / "upload.mjs"


def check_node_deps() -> bool:
    node_modules = TURBO_DIR / "node_modules"
    turbo_sdk = node_modules / "@ardrive" / "turbo-sdk"
    return node_modules.exists() and turbo_sdk.exists()


def install_node_deps() -> bool:
    print("Installing Turbo dependencies...", file=sys.stderr)
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


def upload(
    bundle_path: Path,
    manifest_path: Path,
    owner_hash: str,
    bundle_sha256: str,
    dry_run: bool = False,
    wallet_src: str | None = None,
) -> dict:
    """
    Upload bundle + manifest to Arweave via Turbo.
    Returns dict with bundle_tx_id, manifest_tx_id (or dry-run estimates).
    """
    if not check_node_deps():
        if not install_node_deps():
            raise RuntimeError(
                "Failed to install Turbo dependencies.\n"
                "Fix: cd scripts/turbo && npm install"
            )

    env = os.environ.copy()
    if wallet_src:
        if wallet_src.strip().startswith('{'):
            env["AR_WALLET_JSON"] = wallet_src
            env.pop("AR_WALLET_PATH", None)
        else:
            env["AR_WALLET_PATH"] = wallet_src
            env.pop("AR_WALLET_JSON", None)

    cmd = [
        "node", str(UPLOAD_MJS),
        str(bundle_path),
        str(manifest_path),
        owner_hash,
        bundle_sha256,
    ]
    if dry_run:
        cmd.append("--dry-run")

    result = subprocess.run(cmd, capture_output=True, text=True, env=env)
    if result.returncode != 0:
        raise RuntimeError(f"Upload failed:\n{result.stderr}\n{result.stdout}")

    return json.loads(result.stdout.strip())
