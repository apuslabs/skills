"""
Security tests: path traversal, symlinks, hardlinks.
"""

import os
from pathlib import Path

import pytest

from encrypt_pack import encrypt_pack, collect_files, pack_directory
from decrypt_unpack import decrypt_unpack


class TestPathTraversal:
    def test_collect_files_no_escape(self, tmp_path):
        src = tmp_path / "src"
        src.mkdir()
        (src / "ok.md").write_text("fine")
        files = collect_files(src, "*.md")
        for f in files:
            assert src in f.parents or f.parent == src

    def test_symlink_in_input_rejected(self, tmp_path, test_wallet_src):
        src = tmp_path / "src"
        src.mkdir()
        real = tmp_path / "real.md"
        real.write_text("real content")
        link = src / "link.md"
        try:
            link.symlink_to(real)
        except NotImplementedError:
            pytest.skip("Symlinks not supported on this platform")

        with pytest.raises(ValueError, match="Symlinks"):
            pack_directory(src, "*.md")

    def test_tar_path_traversal_rejected(self, tmp_path, test_wallet_src):
        """A crafted tar with ../ paths must be rejected on extraction."""
        import io, tarfile, json, os, time
        from cryptography.hazmat.primitives.ciphers.aead import ChaCha20Poly1305
        from encrypt_pack import derive_key

        key, address, owner_hash = derive_key(test_wallet_src)

        # Build a malicious tar
        buf = io.BytesIO()
        with tarfile.open(fileobj=buf, mode='w:gz') as tar:
            content = b"evil content"
            info = tarfile.TarInfo(name="../evil.md")
            info.size = len(content)
            tar.addfile(info, io.BytesIO(content))
        tar_bytes = buf.getvalue()

        # Encrypt it manually
        created_at = int(time.time())
        aad = json.dumps(
            {"version": 1, "ar_address": address, "timestamp": created_at},
            separators=(',', ':'), sort_keys=True,
        ).encode()

        nonce = os.urandom(12)
        cipher = ChaCha20Poly1305(key)
        bundle_bytes = nonce + cipher.encrypt(nonce, tar_bytes, aad)

        import hashlib, hmac as hmac_mod
        EXCLUDED = frozenset({"manifest_signature","arweave_tx_id","arweave_uploaded_at","arweave_manifest_tx_id"})

        manifest = {
            "version": 1, "sequence": 1, "created_at": created_at,
            "ar_address": address, "owner_hash": owner_hash,
            "cipher": "chacha20poly1305", "kdf": "hkdf-sha256",
            "kdf_salt_version": "arback-v1", "checksum_algorithm": "sha256",
            "filter": "*.md",
            "aad_sha256": hashlib.sha256(aad).hexdigest(),
            "bundle_sha256": hashlib.sha256(bundle_bytes).hexdigest(),
            "bundle_size_bytes": len(bundle_bytes),
            "inventory": {"file_count": 1, "files": [{"path": "../evil.md", "size": 12}]},
            "manifest_signature": None,
            "arweave_tx_id": None, "arweave_uploaded_at": None, "arweave_manifest_tx_id": None,
        }
        data = {k: v for k, v in manifest.items() if k not in EXCLUDED}
        canonical = json.dumps(data, separators=(',', ':'), sort_keys=True).encode()
        manifest["manifest_signature"] = hmac_mod.new(key, canonical, hashlib.sha256).hexdigest()

        bundle_path = tmp_path / "evil.enc"
        manifest_path = tmp_path / "evil_manifest.json"
        bundle_path.write_bytes(bundle_bytes)
        manifest_path.write_text(json.dumps(manifest))

        out = tmp_path / "out"
        with pytest.raises(ValueError, match="Unsafe tar member"):
            decrypt_unpack(bundle_path, manifest_path, out, test_wallet_src)
