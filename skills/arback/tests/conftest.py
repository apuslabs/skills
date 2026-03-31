"""
Shared test fixtures for arback.
Generates a fresh RSA-2048 AR JWK wallet for each test session.
"""

import base64
import json
import sys
from pathlib import Path

import pytest

# Make scripts importable
sys.path.insert(0, str(Path(__file__).parent.parent / "scripts"))

try:
    from cryptography.hazmat.primitives.asymmetric import rsa
    from cryptography.hazmat.backends import default_backend
except ImportError:
    rsa = None


def _b64url(n: int) -> str:
    """Encode integer as base64url without padding."""
    length = (n.bit_length() + 7) // 8
    return base64.urlsafe_b64encode(n.to_bytes(length, 'big')).rstrip(b'=').decode()


def generate_test_jwk() -> dict:
    """Generate a minimal AR-compatible RSA-2048 JWK for testing."""
    if rsa is None:
        pytest.skip("cryptography library not installed")
    private_key = rsa.generate_private_key(
        public_exponent=65537,
        key_size=2048,
        backend=default_backend(),
    )
    priv = private_key.private_numbers()
    pub = priv.public_numbers
    return {
        "kty": "RSA",
        "n": _b64url(pub.n),
        "e": _b64url(pub.e),
        "d": _b64url(priv.d),
        "p": _b64url(priv.p),
        "q": _b64url(priv.q),
        "dp": _b64url(priv.dmp1),
        "dq": _b64url(priv.dmq1),
        "qi": _b64url(priv.iqmp),
    }


@pytest.fixture(scope="session")
def test_jwk():
    return generate_test_jwk()


@pytest.fixture(scope="session")
def test_jwk2():
    """A second, distinct wallet for cross-wallet tests."""
    return generate_test_jwk()


@pytest.fixture(scope="session")
def test_wallet_src(test_jwk):
    return json.dumps(test_jwk)


@pytest.fixture(scope="session")
def test_wallet_src2(test_jwk2):
    return json.dumps(test_jwk2)


@pytest.fixture
def memory_dir(tmp_path):
    """A small test memory directory with .md and non-.md files."""
    d = tmp_path / "memory"
    d.mkdir()
    (d / "user.md").write_text("# User\nname: Tester")
    (d / "project.md").write_text("# Project\nworking on arback")
    (d / "notes.md").write_text("# Notes\nsome notes here")
    (d / "skip.txt").write_text("should be excluded by default filter")
    (d / "config.json").write_text('{"key": "value"}')
    return d
