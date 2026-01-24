```
    _                                        ____  _    _ _ _ 
   / \   _ ____      _____  __ ___   _____  / ___|| | _(_) | |
  / _ \ | '__\ \ /\ / / _ \/ _` \ \ / / _ \ \___ \| |/ / | | |
 / ___ \| |   \ V  V /  __/ (_| |\ V /  __/  ___) |   <| | | |
/_/   \_\_|    \_/\_/ \___|\__,_| \_/ \___| |____/|_|\_\_|_|_|
```

Upload files and websites to permanent storage on Arweave, and manage ArNS domain records.

## Installation

Install the skill into your project using the `skills` CLI:

```sh
npx skills add https://github.com/permaweb/skills --skill arweave
```

This will add the skill to your project's `.claude/skills/` or `.opencode/skills/` directory.

## Requirements

- Node.js 18+
- Internet access
- Arweave wallet (JWK format)

## Usage with Claude Code

Once installed, simply ask Claude Code to use Arweave:

### Upload a file

```
use arweave to upload ./my-document.md
```

### Upload a website

```
use arweave to upload ./dist
```

### Attach to an ArNS name

```
use arweave to attach <txId> to myname
```

### Attach to an undername

```
use arweave to attach <txId> to docs_myname
```

Claude Code will prompt you for your wallet path if not already configured.

## Manual CLI Usage

You can also run the CLI directly:

```sh
# Upload a file
node skills/arweave/index.js upload ./file.md --wallet ./wallet.json

# Upload a website
node skills/arweave/index.js upload-site ./dist --wallet ./wallet.json

# Attach to ArNS name
node skills/arweave/index.js attach <txId> myname --wallet ./wallet.json --yes

# Attach to undername (hello.myname.arweave.net)
node skills/arweave/index.js attach <txId> hello_myname --wallet ./wallet.json --yes
```

## CLI Options

| Option | Description |
|--------|-------------|
| `--wallet <path>` | Path to Arweave wallet keyfile (JWK) |
| `--index <file>` | Index file for site uploads (default: index.html) |
| `--ttl <seconds>` | TTL for ArNS records (default: 3600) |
| `--network <net>` | Network: mainnet or testnet (default: mainnet) |
| `--ario-process <id>` | ARIO process ID (overrides --network) |
| `--force` | Continue upload-site even if index file missing |
| `--yes, -y` | Skip confirmation prompts |

## Environment Variables

| Variable | Description |
|----------|-------------|
| `ARWEAVE_WALLET` | Path to wallet keyfile (alternative to --wallet) |

## ArNS Name Format

- `myname` - base name (updates `@` record at myname.arweave.net)
- `sub_myname` - undername `sub` under base `myname` (sub_myname.arweave.net)

## License

MIT
