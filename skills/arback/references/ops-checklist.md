# arback — Operational Guardrails

## Before every backup

- [ ] Verify `AR_WALLET_PATH` or `AR_WALLET_JSON` is set and readable
- [ ] Run `--dry-run` to confirm cost estimate and file list
- [ ] Confirm `--filter` matches only intended files
- [ ] Check Turbo balance with `topup --balance` before large uploads

## Security rules (never violate)

- Never log `AR_WALLET_PATH` contents or `AR_WALLET_JSON` value
- Never print derived encryption key or discovery secret
- Never upload unencrypted memory files
- Fail closed: if encryption, checksum, or manifest verification fails — abort
- Reject restore when `manifest_signature` verification fails
- Reject restore when bundle SHA256 does not match manifest

## Recovery procedure

If local index is lost:
1. `python scripts/arweave_discover.py` — queries Arweave GraphQL by owner_hash
2. Use returned `manifest_tx` ID with `restore --manifest-tx <id> --tx-id <bundle_id>`

## Turbo balance low

If `topup --balance` shows insufficient credits:
1. `topup --ar <amount>` — pay with AR from wallet (instant)
2. `topup --fiat usd <amount>` — Stripe checkout (minutes)
3. Pre-fund at https://turbo.ar.io manually

## Integrity verification (after restore)

```bash
# Verify file count matches manifest
cat manifest.json | python3 -c "import json,sys; m=json.load(sys.stdin); print(m['inventory']['file_count'], 'files expected')"

# Spot-check a file
sha256sum restored/user.md
```

## What is stored on Arweave

- An encrypted bundle (tar.gz encrypted with ChaCha20-Poly1305)
- A signed JSON manifest with checksums, file inventory, and AR address
- Both are tagged with `App-Name: ARBACK` and `Owner-Hash`
- Nothing is stored in plaintext — not file names, not content
