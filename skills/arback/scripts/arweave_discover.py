#!/usr/bin/env python3
"""
arback — discover backup manifests on Arweave via GraphQL.
Queries using Owner-Hash so the wallet address is never revealed.
"""

import argparse
import base64
import hashlib
import json
import os
import sys
import urllib.request
from pathlib import Path

from cryptography.hazmat.primitives.hashes import SHA256
from cryptography.hazmat.primitives.kdf.hkdf import HKDF

CURRENT_SALT_VERSION = "arback-v1"
ARWEAVE_GRAPHQL = "https://arweave.net/graphql"

QUERY_MANIFESTS = """
query($ownerHash: String!, $limit: Int!) {
  transactions(
    tags: [
      { name: "App-Name", values: ["ARBACK"] }
      { name: "Type", values: ["manifest"] }
      { name: "Owner-Hash", values: [$ownerHash] }
    ]
    first: $limit
    sort: HEIGHT_DESC
  ) {
    edges {
      node {
        id
        tags { name value }
        block { timestamp height }
      }
    }
  }
}
"""


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


def compute_owner_hash(wallet_src: str, salt_version: str = CURRENT_SALT_VERSION) -> str:
    """Derive owner_hash from AR JWK (matches what encrypt_pack.py produces)."""
    jwk = load_ar_wallet(wallet_src)
    d_bytes = base64.urlsafe_b64decode(jwk['d'] + '==')
    seed = hashlib.sha256(d_bytes).digest()
    address = derive_ar_address(jwk)

    hkdf_disc = HKDF(
        algorithm=SHA256(),
        length=32,
        salt=salt_version.encode(),
        info=b"arback:discovery",
    )
    discovery_secret = hkdf_disc.derive(seed)
    return hashlib.sha256(address.encode() + discovery_secret).hexdigest()


def graphql_query(query: str, variables: dict) -> dict:
    payload = json.dumps({"query": query, "variables": variables}).encode()
    req = urllib.request.Request(
        ARWEAVE_GRAPHQL,
        data=payload,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=30) as resp:
        return json.loads(resp.read())


def discover_manifests(wallet_src: str, limit: int = 50) -> list[dict]:
    """
    Find all ARBACK manifest transactions for this wallet on Arweave.
    Returns list of { id, bundle_tx, timestamp, height } dicts.
    """
    owner_hash = compute_owner_hash(wallet_src)
    result = graphql_query(QUERY_MANIFESTS, {"ownerHash": owner_hash, "limit": limit})

    edges = result.get("data", {}).get("transactions", {}).get("edges", [])
    manifests = []
    for edge in edges:
        node = edge["node"]
        tags = {t["name"]: t["value"] for t in node.get("tags", [])}
        manifests.append({
            "id": node["id"],
            "bundle_tx": tags.get("Bundle-TX"),
            "timestamp": node.get("block", {}).get("timestamp"),
            "height": node.get("block", {}).get("height"),
        })

    return manifests


def main():
    parser = argparse.ArgumentParser(
        description="arback: discover backups on Arweave"
    )
    parser.add_argument("--limit", type=int, default=50,
                        help="Max manifests to return (default: 50)")
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

    manifests = discover_manifests(wallet_src, limit=args.limit)
    print(json.dumps({"count": len(manifests), "manifests": manifests}))


if __name__ == "__main__":
    main()
