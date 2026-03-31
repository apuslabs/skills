---
name: arback
description: >
  Back up and restore AI agent memory to Arweave permanently, encrypted with an AR wallet.
  Use this skill whenever the user mentions backing up memory, saving agent state, restoring
  a previous snapshot, checking backup history, or wanting their memory to survive a wipe or
  platform change — even if they say just "save my memory", "I lost my memory", "backup", or
  "restore". Also trigger when the user asks about Arweave storage costs, Turbo Credits, or
  wants to set up memory persistence for the first time.
compatibility: Requires Python 3.9+, Node.js 18+, uv, and an AR wallet (JWK format)
metadata:
  author: apuslabs
  version: "1.0.0"
---

# arback

Permanently back up agent memory (the `memory/` directory) to Arweave, encrypted end-to-end
with your AR wallet. Restore any backup at any time from the same wallet. No ETH, no accounts,
no third-party custody — your wallet is the only key.

---

## Step 0: Check prerequisites

Run this first to confirm the environment is ready:

```bash
python scripts/arback.py status
```

If it fails, work through the issues in order:

**Wallet not configured** — ask the user for their AR wallet path, then:

```bash
export AR_WALLET_PATH="/path/to/wallet.json"
# Or if they have the raw JWK JSON string:
export AR_WALLET_JSON='{"kty":"RSA","n":"...","d":"...",...}'
```

**Dependencies not installed** — run once:

```bash
python scripts/arback.py init
```

This installs both Python (via `uv`) and Node.js (via `npm`) dependencies automatically.

---

## Backup

Always start with a dry run so the user can confirm file list and cost before any upload:

```bash
# Dry run — shows file list and estimated Turbo Credit cost, no upload
python scripts/arback.py backup --input memory/ --dry-run

# Real upload — only *.md files by default, which covers most agent memory setups
python scripts/arback.py backup --input memory/
```

Only proceed to the real upload after the user confirms the dry-run output. After a
successful backup, report:
- Bundle TX hash (permanent Arweave ID)
- Number of files backed up
- How to restore: `restore --latest --out memory/`

To back up all file types, not just `.md`:

```bash
python scripts/arback.py backup --input memory/ --filter "*"
```

---

## Restore

**Important:** restoring overwrites the current `memory/` directory. Warn the user if it
contains unsaved changes before running.

```bash
# Restore the most recent backup (looks up Arweave if local index is missing)
python scripts/arback.py restore --latest --out memory/

# Restore a specific backup by TX IDs
python scripts/arback.py restore \
  --tx-id <bundle_tx_id> \
  --manifest-tx <manifest_tx_id> \
  --out memory/
```

After restoring, confirm: file count and which files were recovered.

---

## Status and history

```bash
python scripts/arback.py status   # wallet address, Turbo balance, latest backup
python scripts/arback.py list     # full local backup history with TX IDs
```

---

## Top up Turbo Credits

Turbo Credits pay for Arweave uploads. The cost is very small (typically under 0.00001 Credits
per backup). If the balance runs low:

```bash
python scripts/arback.py topup --balance            # check current balance

# Pay with AR tokens from the wallet — simplest, no extra accounts needed
python scripts/arback.py topup --ar 0.01

# Credit card via Stripe — opens a browser checkout page
python scripts/arback.py topup --fiat usd 10

# Estimate cost before backing up N bytes
python scripts/arback.py topup --price <bytes>
```

Other supported tokens: `solana`, `ethereum`, `matic`, `pol`, `kyve`, `base-eth`,
`base-usdc`, `usdc`, `polygon-usdc`, `ario`, `base-ario`

Supported fiat currencies: `usd`, `eur`, `gbp`, `cad`, `aud`, `inr`, `sgd`, `hkd`, `brl`, `jpy`

---

## Security notes

- The AR wallet never leaves the local machine. Private keys are used only for signing and key
  derivation; they are never transmitted to any remote endpoint.
- Every backup is encrypted with ChaCha20-Poly1305. File names and content are fully encrypted
  — nothing is stored in plaintext on Arweave.
- Each backup carries a sequence number and HMAC-signed manifest to detect tampering or replay.
- If encryption, checksum, or signature verification fails during restore, the operation aborts.

For the full operational checklist, see `references/ops-checklist.md`.
