"""
Tests for AR JWK key derivation consistency and correctness.
"""

import base64
import hashlib
import json

import pytest

from encrypt_pack import derive_key, derive_ar_address, load_ar_wallet, CURRENT_SALT_VERSION


class TestDeriveArAddress:
    def test_produces_string(self, test_jwk):
        addr = derive_ar_address(test_jwk)
        assert isinstance(addr, str)
        assert len(addr) > 0

    def test_deterministic(self, test_jwk):
        assert derive_ar_address(test_jwk) == derive_ar_address(test_jwk)

    def test_base64url_format(self, test_jwk):
        addr = derive_ar_address(test_jwk)
        # Should be valid base64url (no padding, no +/)
        assert '+' not in addr
        assert '/' not in addr
        assert '=' not in addr

    def test_different_wallets_different_address(self, test_jwk, test_jwk2):
        addr1 = derive_ar_address(test_jwk)
        addr2 = derive_ar_address(test_jwk2)
        assert addr1 != addr2


class TestDeriveKey:
    def test_returns_tuple(self, test_wallet_src):
        key, address, owner_hash = derive_key(test_wallet_src)
        assert isinstance(key, bytes)
        assert isinstance(address, str)
        assert isinstance(owner_hash, str)

    def test_key_length(self, test_wallet_src):
        key, _, _ = derive_key(test_wallet_src)
        assert len(key) == 32  # 256 bits for ChaCha20-Poly1305

    def test_deterministic(self, test_wallet_src):
        key1, addr1, oh1 = derive_key(test_wallet_src)
        key2, addr2, oh2 = derive_key(test_wallet_src)
        assert key1 == key2
        assert addr1 == addr2
        assert oh1 == oh2

    def test_different_wallets_different_keys(self, test_wallet_src, test_wallet_src2):
        key1, addr1, oh1 = derive_key(test_wallet_src)
        key2, addr2, oh2 = derive_key(test_wallet_src2)
        assert key1 != key2
        assert addr1 != addr2
        assert oh1 != oh2

    def test_owner_hash_is_hex(self, test_wallet_src):
        _, _, owner_hash = derive_key(test_wallet_src)
        assert len(owner_hash) == 64  # SHA256 hex = 64 chars
        int(owner_hash, 16)  # should not raise

    def test_salt_version_changes_key(self, test_wallet_src):
        key1, _, _ = derive_key(test_wallet_src, salt_version="arback-v1")
        key2, _, _ = derive_key(test_wallet_src, salt_version="arback-v2")
        assert key1 != key2

    def test_load_from_json_string(self, test_wallet_src):
        key, address, _ = derive_key(test_wallet_src)
        assert len(key) == 32
        assert len(address) > 0

    def test_load_from_file(self, test_jwk, tmp_path):
        wallet_file = tmp_path / "wallet.json"
        wallet_file.write_text(json.dumps(test_jwk))
        key, address, _ = derive_key(str(wallet_file))
        assert len(key) == 32

    def test_consistent_across_modules(self, test_wallet_src):
        """derive_key in encrypt_pack and decrypt_unpack must agree."""
        from encrypt_pack import derive_key as enc_derive
        from decrypt_unpack import derive_key as dec_derive
        key_e, addr_e, oh_e = enc_derive(test_wallet_src)
        key_d, addr_d, oh_d = dec_derive(test_wallet_src)
        assert key_e == key_d
        assert addr_e == addr_d
        assert oh_e == oh_d
