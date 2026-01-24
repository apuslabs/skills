---
name: arweave
description: Upload files and websites to permanent storage on Arweave (permaweb), and manage ArNS domain records. Use when the user wants to publish content to Arweave, deploy a static site to the permaweb, or attach a transaction to an ArNS name (ar.io).
compatibility: Requires Node.js 18+, internet access, and an Arweave wallet (JWK format)
metadata:
  author: rakis
  version: "0.0.1"
---

# Arweave Upload & ArNS Skill

Upload files and websites to permanent storage on Arweave, and manage ArNS (Arweave Name System) domain records.

## Phrase Mappings

| User Request | Command |
|--------------|---------|
| "use arweave to upload `<file>`" | `upload` |
| "use arweave to upload `<dir>`" | `upload-site` |
| "use arweave to attach `<txId>` to `<name>`" | `attach` |

## Wallet Handling

**Important**: This skill requires an Arweave wallet file (JWK format).

- If the user has not provided a wallet path, **ask them for it** before proceeding
- Pass the wallet path via `--wallet <path>` argument
- **Never expose or log wallet contents**

## Commands

### Upload a Single File

```sh
node skills/arweave/index.js upload "<file>" --wallet "<path/to/wallet.json>"
```

### Upload a Website/Directory

```sh
node skills/arweave/index.js upload-site "<directory>" --index "index.html" --wallet "<path/to/wallet.json>"
```

- `--index` specifies the default file served at the root (defaults to `index.html`)
- The returned `txId` is the **manifest transaction** that serves the entire site

### Attach Transaction to ArNS Name

```sh
node skills/arweave/index.js attach "<txId>" "<name>" --wallet "<path/to/wallet.json>" --yes
```

**Options:**
- `--ttl <seconds>` - Time-to-live in seconds (default: 3600)
- `--network <mainnet|testnet>` - Network to use (default: mainnet)
- `--ario-process <id>` - Override network with specific ARIO process ID
- `--yes` - Skip confirmation prompts

**Propagation:** Updates usually appear within a few minutes, but can take up to ~30 minutes to reflect everywhere (gateway/operator caches and client TTLs).

## ArNS Name Format

- Names with underscore like `hello_rakis` mean **undername** `hello` on base name `rakis`
- Strip `.ar.io` suffix if present (e.g., `rakis.ar.io` becomes `rakis`)

Examples:
- `rakis` - base name (updates `@` record)
- `hello_rakis` - undername `hello` under base `rakis`
- `docs_myproject` - undername `docs` under base `myproject`

## Network Selection

By default, the skill uses **mainnet**. You can specify a different network:

```sh
# Use mainnet (default)
node skills/arweave/index.js attach "<txId>" "<name>" --network mainnet --wallet "..." --yes

# Use testnet
node skills/arweave/index.js attach "<txId>" "<name>" --network testnet --wallet "..." --yes

# Use specific ARIO process ID (overrides --network)
node skills/arweave/index.js attach "<txId>" "<name>" --ario-process "<processId>" --wallet "..." --yes
```

## Output Handling

After successful upload, report back:

1. **Transaction ID** (`txId`)
2. **Gateway URL**: `https://arweave.net/<txId>`

Example response to user:
```
Uploaded successfully!
- Transaction ID: abc123xyz...
- View at: https://arweave.net/abc123xyz...
```

For site uploads, clarify that the txId represents the manifest transaction serving the entire site.

## Example Invocations

```sh
# Upload a single markdown file
node skills/arweave/index.js upload "foo.md" --wallet "/path/to/wallet.json"

# Upload a website directory
node skills/arweave/index.js upload-site "./mywebsite" --index "index.html" --wallet "/path/to/wallet.json"

# Attach a transaction to an ArNS undername (mainnet)
node skills/arweave/index.js attach "<txId>" "hello_rakis" --ttl 3600 --network mainnet --wallet "/path/to/wallet.json" --yes

# Attach to testnet
node skills/arweave/index.js attach "<txId>" "hello_rakis" --network testnet --wallet "/path/to/wallet.json" --yes

# Attach using specific ARIO process
node skills/arweave/index.js attach "<txId>" "hello_rakis" --ario-process testnet --wallet "/path/to/wallet.json" --yes
```
