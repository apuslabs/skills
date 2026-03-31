"""
Integrity tests: tamper detection, wrong wallet, checksum failures.
"""

import json
from pathlib import Path

import pytest

from encrypt_pack import encrypt_pack
from decrypt_unpack import decrypt_unpack


@pytest.fixture
def fresh_backup(memory_dir, tmp_path, test_wallet_src):
    bundle = tmp_path / "bundle.enc"
    manifest = tmp_path / "manifest.json"
    encrypt_pack(memory_dir, bundle, manifest, test_wallet_src, "*.md")
    return bundle, manifest


class TestTampering:
    def test_tampered_bundle_fails(self, fresh_backup, tmp_path, test_wallet_src):
        bundle, manifest = fresh_backup
        data = bytearray(bundle.read_bytes())
        data[-1] ^= 0xFF  # flip last byte
        bundle.write_bytes(bytes(data))
        out = tmp_path / "out"
        with pytest.raises(ValueError, match="checksum|Decryption"):
            decrypt_unpack(bundle, manifest, out, test_wallet_src)

    def test_tampered_nonce_fails(self, fresh_backup, tmp_path, test_wallet_src):
        bundle, manifest = fresh_backup
        data = bytearray(bundle.read_bytes())
        data[0] ^= 0xFF  # flip first byte of nonce
        bundle.write_bytes(bytes(data))
        out = tmp_path / "out"
        with pytest.raises(ValueError):
            decrypt_unpack(bundle, manifest, out, test_wallet_src)

    def test_tampered_manifest_signature_fails(self, fresh_backup, tmp_path, test_wallet_src):
        bundle, manifest = fresh_backup
        m = json.loads(manifest.read_text())
        m["file_count"] = 999  # change a field
        manifest.write_text(json.dumps(m))
        out = tmp_path / "out"
        with pytest.raises(ValueError, match="signature"):
            decrypt_unpack(bundle, manifest, out, test_wallet_src)

    def test_wrong_wallet_rejected(self, fresh_backup, tmp_path, test_wallet_src2):
        bundle, manifest = fresh_backup
        out = tmp_path / "out"
        # Wrong wallet → address mismatch or decryption failure
        with pytest.raises(ValueError):
            decrypt_unpack(bundle, manifest, out, test_wallet_src2)

    def test_bundle_checksum_mismatch(self, fresh_backup, tmp_path, test_wallet_src):
        bundle, manifest = fresh_backup
        # Corrupt manifest's expected bundle checksum
        m = json.loads(manifest.read_text())
        m["manifest_signature"] = None  # reset sig so signature check passes first
        original_sig_data = {k: v for k, v in m.items()
                             if k not in {"manifest_signature","arweave_tx_id","arweave_uploaded_at","arweave_manifest_tx_id"}}
        import hashlib, hmac, json as json_mod
        from encrypt_pack import derive_key
        key, _, _ = derive_key(test_wallet_src)
        canonical = json_mod.dumps(original_sig_data, separators=(',', ':'), sort_keys=True).encode()
        # Now tamper bundle_sha256
        m["bundle_sha256"] = "0" * 64
        data = {k: v for k, v in m.items()
                if k not in {"manifest_signature","arweave_tx_id","arweave_uploaded_at","arweave_manifest_tx_id"}}
        canonical2 = json_mod.dumps(data, separators=(',', ':'), sort_keys=True).encode()
        m["manifest_signature"] = hmac.new(key, canonical2, hashlib.sha256).hexdigest()
        manifest.write_text(json.dumps(m))

        out = tmp_path / "out"
        with pytest.raises(ValueError, match="checksum"):
            decrypt_unpack(bundle, manifest, out, test_wallet_src)


class TestManifestFields:
    def test_manifest_has_required_fields(self, memory_dir, tmp_path, test_wallet_src):
        bundle = tmp_path / "bundle.enc"
        manifest_path = tmp_path / "manifest.json"
        m = encrypt_pack(memory_dir, bundle, manifest_path, test_wallet_src, "*.md")

        required = [
            "version", "sequence", "created_at", "ar_address", "owner_hash",
            "cipher", "kdf", "kdf_salt_version", "checksum_algorithm", "filter",
            "aad_sha256", "bundle_sha256", "bundle_size_bytes", "inventory",
            "manifest_signature",
        ]
        for field in required:
            assert field in m, f"Missing field: {field}"

    def test_no_memos_traces(self, memory_dir, tmp_path, test_wallet_src):
        """Ensure no MemOS branding leaks into manifest or bundle."""
        bundle = tmp_path / "bundle.enc"
        manifest_path = tmp_path / "manifest.json"
        encrypt_pack(memory_dir, bundle, manifest_path, test_wallet_src, "*.md")

        manifest_text = manifest_path.read_text().lower()
        assert "memos" not in manifest_text
        assert "0xrelayer" not in manifest_text
        assert "eth_address" not in manifest_text

    def test_salt_version_is_arback(self, memory_dir, tmp_path, test_wallet_src):
        bundle = tmp_path / "bundle.enc"
        manifest_path = tmp_path / "manifest.json"
        m = encrypt_pack(memory_dir, bundle, manifest_path, test_wallet_src, "*.md")
        assert m["kdf_salt_version"] == "arback-v1"
