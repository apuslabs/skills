#!/usr/bin/env python3
"""
arback — decrypt and restore Arweave memory backup.
"""
from __future__ import annotations

import argparse
import base64
import hashlib
import hmac
import io
import json
import os
import sys
import tarfile
from pathlib import Path

from cryptography.exceptions import InvalidTag
from cryptography.hazmat.primitives.ciphers.aead import ChaCha20Poly1305
from cryptography.hazmat.primitives.hashes import SHA256
from cryptography.hazmat.primitives.kdf.hkdf import HKDF

CURRENT_SALT_VERSION = "arback-v1"

EXCLUDED_FROM_SIGNATURE = frozenset({
    "manifest_signature",
    "arweave_tx_id",
    "arweave_uploaded_at",
    "arweave_manifest_tx_id",
})


def load_ar_wallet(wallet_src: str) -> dict:
    s = wallet_src.strip()
    if s.startswith('{'):
        return json.loads(s)
    with open(s) as f:
        return json.load(f)


def derive_ar_address(jwk: dict) -> str:
    n_bytes = base64.urlsafe_b64decode(jwk['n'] + '==')
    digest = hashlib.sha256(n_bytes).digest()
    return base64.urlsafe_b64encode(digest).rstrip(b'=').decode()


def derive_key(
    wallet_src: str,
    salt_version: str = CURRENT_SALT_VERSION,
) -> tuple[bytes, str, str]:
    jwk = load_ar_wallet(wallet_src)
    d_bytes = base64.urlsafe_b64decode(jwk['d'] + '==')
    seed = hashlib.sha256(d_bytes).digest()
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


def verify_manifest_signature(manifest: dict, key: bytes) -> bool:
    stored_sig = manifest.get("manifest_signature")
    if not stored_sig:
        return False
    data = {k: v for k, v in manifest.items() if k not in EXCLUDED_FROM_SIGNATURE}
    canonical = json.dumps(data, separators=(',', ':'), sort_keys=True).encode()
    expected = hmac.new(key, canonical, hashlib.sha256).hexdigest()
    return hmac.compare_digest(stored_sig, expected)


def decrypt_unpack(
    bundle_path: Path,
    manifest_path: Path,
    out_dir: Path,
    wallet_src: str,
) -> int:
    """
    Decrypt bundle and restore files to out_dir.
    Returns count of restored files.
    Raises ValueError or InvalidTag on any integrity failure.
    """
    manifest = json.loads(manifest_path.read_text())

    salt_version = manifest.get("kdf_salt_version", CURRENT_SALT_VERSION)
    key, address, _ = derive_key(wallet_src, salt_version)

    # Verify wallet matches
    manifest_addr = manifest.get("ar_address")
    if manifest_addr and manifest_addr != address:
        raise ValueError(
            f"Wallet mismatch: manifest has {manifest_addr}, "
            f"provided wallet derives {address}"
        )

    # Verify manifest HMAC
    if not verify_manifest_signature(manifest, key):
        raise ValueError("Manifest signature invalid — possible tampering detected")

    # Read bundle and verify SHA256
    bundle_bytes = bundle_path.read_bytes()
    computed_sha = hashlib.sha256(bundle_bytes).hexdigest()
    if computed_sha != manifest["bundle_sha256"]:
        raise ValueError(
            f"Bundle checksum mismatch: expected {manifest['bundle_sha256']}, "
            f"got {computed_sha}"
        )

    # Reconstruct AAD (must match exactly what was used during encryption)
    aad = json.dumps({
        "version": 1,
        "ar_address": address,
        "timestamp": manifest["created_at"],
    }, separators=(',', ':'), sort_keys=True).encode()

    # Verify AAD checksum
    aad_sha = hashlib.sha256(aad).hexdigest()
    if aad_sha != manifest.get("aad_sha256"):
        raise ValueError("AAD checksum mismatch — manifest may be corrupted")

    # Decrypt (raises InvalidTag if ciphertext or AAD was tampered)
    nonce = bundle_bytes[:12]
    ciphertext = bundle_bytes[12:]
    cipher = ChaCha20Poly1305(key)
    try:
        plain = cipher.decrypt(nonce, ciphertext, aad)
    except InvalidTag:
        raise ValueError("Decryption failed: bundle integrity check failed (InvalidTag)")

    # Unpack tar with path traversal protection
    out_dir.mkdir(parents=True, exist_ok=True)
    count = 0

    with tarfile.open(fileobj=io.BytesIO(plain), mode='r:gz') as tar:
        for member in tar.getmembers():
            # Block path traversal
            parts = member.name.replace('\\', '/').split('/')
            if member.name.startswith('/') or '..' in parts:
                raise ValueError(f"Unsafe tar member rejected: {member.name}")
            if member.issym() or member.islnk():
                raise ValueError(f"Symlinks/hardlinks rejected: {member.name}")

            dest = out_dir / member.name
            dest.parent.mkdir(parents=True, exist_ok=True)

            if member.isfile():
                with tar.extractfile(member) as src, open(dest, 'wb') as dst:
                    dst.write(src.read())
                count += 1

    return count


def main():
    parser = argparse.ArgumentParser(
        description="arback: decrypt and restore memory backup"
    )
    parser.add_argument("--bundle", required=True, help="Encrypted bundle path")
    parser.add_argument("--manifest", required=True, help="Manifest JSON path")
    parser.add_argument("--out", required=True, help="Output directory")
    parser.add_argument("--wallet", help="AR wallet path/JSON (overrides env)")
    args = parser.parse_args()

    wallet_src = (
        args.wallet
        or os.environ.get("AR_WALLET_PATH")
        or os.environ.get("AR_WALLET_JSON")
    )
    if not wallet_src:
        print("Error: set AR_WALLET_PATH or AR_WALLET_JSON", file=sys.stderr)
        sys.exit(1)

    count = decrypt_unpack(
        bundle_path=Path(args.bundle),
        manifest_path=Path(args.manifest),
        out_dir=Path(args.out),
        wallet_src=wallet_src,
    )
    print(json.dumps({"restored_files": count, "out_dir": args.out}))


if __name__ == "__main__":
    main()
