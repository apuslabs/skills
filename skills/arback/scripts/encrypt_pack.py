#!/usr/bin/env python3
"""
arback — encrypt and pack memory directory for Arweave backup.
Uses AR (Arweave) JWK wallet for key derivation.
"""
from __future__ import annotations

import argparse
import base64
import fnmatch
import hashlib
import hmac
import io
import json
import os
import sys
import tarfile
import time
from pathlib import Path

from cryptography.hazmat.primitives.ciphers.aead import ChaCha20Poly1305
from cryptography.hazmat.primitives.hashes import SHA256
from cryptography.hazmat.primitives.kdf.hkdf import HKDF

CURRENT_SALT_VERSION = "arback-v1"

# Fields excluded when computing manifest HMAC signature (set post-upload)
EXCLUDED_FROM_SIGNATURE = frozenset({
    "manifest_signature",
    "arweave_tx_id",
    "arweave_uploaded_at",
    "arweave_manifest_tx_id",
})


def load_ar_wallet(wallet_src: str) -> dict:
    """Load AR JWK from a file path or a raw JSON string."""
    s = wallet_src.strip()
    if s.startswith('{'):
        return json.loads(s)
    with open(s) as f:
        return json.load(f)


def derive_ar_address(jwk: dict) -> str:
    """
    Derive Arweave wallet address from JWK.
    AR address = base64url-no-padding( SHA256( n_bytes ) )
    where n_bytes is the RSA public modulus decoded from JWK['n'].
    """
    n_bytes = base64.urlsafe_b64decode(jwk['n'] + '==')
    digest = hashlib.sha256(n_bytes).digest()
    return base64.urlsafe_b64encode(digest).rstrip(b'=').decode()


def derive_key(
    wallet_src: str,
    salt_version: str = CURRENT_SALT_VERSION,
) -> tuple[bytes, str, str]:
    """
    Derive encryption key and owner hash from AR JWK.

    Strategy:
      - Extract private exponent d (base64url), hash it with SHA-256 to get a
        fixed 32-byte seed.  This is deterministic and never stores d directly.
      - Run two independent HKDF rounds: one for the encryption key, one for
        the discovery secret (used in owner_hash Arweave tag).

    Returns: (key: bytes, ar_address: str, owner_hash: str)
    """
    jwk = load_ar_wallet(wallet_src)
    d_bytes = base64.urlsafe_b64decode(jwk['d'] + '==')
    seed = hashlib.sha256(d_bytes).digest()   # always 32 bytes

    address = derive_ar_address(jwk)

    hkdf_enc = HKDF(
        algorithm=SHA256(),
        length=32,
        salt=salt_version.encode(),
        info=f"arback:encryption:{address}".encode(),
    )
    key = hkdf_enc.derive(seed)

    hkdf_disc = HKDF(
        algorithm=SHA256(),
        length=32,
        salt=salt_version.encode(),
        info=b"arback:discovery",
    )
    discovery_secret = hkdf_disc.derive(seed)

    owner_hash = hashlib.sha256(address.encode() + discovery_secret).hexdigest()
    return key, address, owner_hash


def collect_files(input_dir: Path, filter_pattern: str = "*.md") -> list[Path]:
    """
    Collect files matching filter_pattern (fnmatch against filename only).
    Sorted for determinism. Rejects anything outside input_dir.
    """
    files = []
    for f in sorted(input_dir.rglob('*')):
        if not f.is_file():
            continue
        try:
            f.relative_to(input_dir)
        except ValueError:
            continue
        if filter_pattern != '*' and not fnmatch.fnmatch(f.name, filter_pattern):
            continue
        files.append(f)
    return files


def pack_directory(
    input_dir: Path,
    filter_pattern: str = "*.md",
) -> tuple[bytes, list[dict]]:
    """
    Create an in-memory tar.gz of files matching filter_pattern.
    Symlinks and hardlinks are rejected.

    Returns: (tar_bytes, inventory_list)
    """
    buf = io.BytesIO()
    inventory = []

    files = collect_files(input_dir, filter_pattern)
    if not files:
        raise ValueError(f"No files matching '{filter_pattern}' found in {input_dir}")

    with tarfile.open(fileobj=buf, mode='w:gz') as tar:
        for f in files:
            rel = f.relative_to(input_dir)
            rel_str = rel.as_posix()

            if rel_str.startswith('/') or '..' in rel_str.split('/'):
                raise ValueError(f"Unsafe path rejected: {rel_str}")
            if f.is_symlink():
                raise ValueError(f"Symlinks not allowed: {rel_str}")

            size = f.stat().st_size
            tar.add(f, arcname=rel_str, recursive=False)
            inventory.append({"path": rel_str, "size": size})

    return buf.getvalue(), inventory


def sign_manifest(manifest_data: dict, encryption_key: bytes) -> str:
    """HMAC-SHA256 over canonical (sorted, no spaces) manifest JSON."""
    data = {k: v for k, v in manifest_data.items() if k not in EXCLUDED_FROM_SIGNATURE}
    canonical = json.dumps(data, separators=(',', ':'), sort_keys=True).encode()
    return hmac.new(encryption_key, canonical, hashlib.sha256).hexdigest()


def encrypt_pack(
    input_dir: Path,
    out_bundle: Path,
    out_manifest: Path,
    wallet_src: str,
    filter_pattern: str = "*.md",
    salt_version: str = CURRENT_SALT_VERSION,
    existing_sequence: int = 0,
) -> dict:
    """
    Pack input_dir, encrypt with ChaCha20-Poly1305, write bundle + manifest.
    Returns the manifest dict.
    """
    key, address, owner_hash = derive_key(wallet_src, salt_version)

    tar_bytes, inventory = pack_directory(input_dir, filter_pattern)

    created_at = int(time.time())
    sequence = existing_sequence + 1

    # AAD: authenticated metadata (not encrypted, but integrity-protected)
    aad = json.dumps({
        "version": 1,
        "ar_address": address,
        "timestamp": created_at,
    }, separators=(',', ':'), sort_keys=True).encode()

    nonce = os.urandom(12)
    cipher = ChaCha20Poly1305(key)
    ciphertext = cipher.encrypt(nonce, tar_bytes, aad)
    bundle_bytes = nonce + ciphertext

    out_bundle.write_bytes(bundle_bytes)

    manifest = {
        "version": 1,
        "sequence": sequence,
        "created_at": created_at,
        "ar_address": address,
        "owner_hash": owner_hash,
        "cipher": "chacha20poly1305",
        "kdf": "hkdf-sha256",
        "kdf_salt_version": salt_version,
        "checksum_algorithm": "sha256",
        "filter": filter_pattern,
        "aad_sha256": hashlib.sha256(aad).hexdigest(),
        "bundle_sha256": hashlib.sha256(bundle_bytes).hexdigest(),
        "bundle_size_bytes": len(bundle_bytes),
        "inventory": {
            "file_count": len(inventory),
            "files": inventory,
        },
        "manifest_signature": None,
        "arweave_tx_id": None,
        "arweave_uploaded_at": None,
        "arweave_manifest_tx_id": None,
    }

    manifest["manifest_signature"] = sign_manifest(manifest, key)
    out_manifest.write_text(json.dumps(manifest, indent=2))
    return manifest


def main():
    parser = argparse.ArgumentParser(
        description="arback: encrypt and pack memory directory"
    )
    parser.add_argument("--input", required=True, help="Input directory to pack")
    parser.add_argument("--out", required=True, help="Output encrypted bundle path")
    parser.add_argument("--manifest", required=True, help="Output manifest JSON path")
    parser.add_argument("--filter", default="*.md", dest="filter_pattern",
                        help="File filter (default: *.md)")
    parser.add_argument("--wallet", help="AR wallet path/JSON (overrides env)")
    parser.add_argument("--sequence", type=int, default=0,
                        help="Previous sequence number (for rollback protection)")
    args = parser.parse_args()

    wallet_src = (
        args.wallet
        or os.environ.get("AR_WALLET_PATH")
        or os.environ.get("AR_WALLET_JSON")
    )
    if not wallet_src:
        print("Error: set AR_WALLET_PATH or AR_WALLET_JSON", file=sys.stderr)
        sys.exit(1)

    manifest = encrypt_pack(
        input_dir=Path(args.input),
        out_bundle=Path(args.out),
        out_manifest=Path(args.manifest),
        wallet_src=wallet_src,
        filter_pattern=args.filter_pattern,
        existing_sequence=args.sequence,
    )

    print(json.dumps({
        "bundle": args.out,
        "manifest": args.manifest,
        "file_count": manifest["inventory"]["file_count"],
        "bundle_size_bytes": manifest["bundle_size_bytes"],
        "ar_address": manifest["ar_address"],
        "sequence": manifest["sequence"],
    }))


if __name__ == "__main__":
    main()
