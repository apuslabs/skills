```
╔═╗╔═╗╦═╗╔╦╗╔═╗╦ ╦╔═╗╔╗   ╔═╗╦╔═╦╦  ╦  ╔═╗
╠═╝║╣ ╠╦╝║║║╠═╣║║║║╣ ╠╩╗  ╚═╗╠╩╗║║  ║  ╚═╗
╩  ╚═╝╩╚═╩ ╩╩ ╩╚╩╝╚═╝╚═╝  ╚═╝╩ ╩╩╩═╝╩═╝╚═╝
```

A collection of Permaweb CLI skills for [Claude Code](https://claude.ai/code) and [OpenCode](https://opencode.ai).

## Skills

| Skill | Description | Docs |
|-------|-------------|------|
| `arweave` | Upload files/sites to Arweave + manage ArNS records | [skills/arweave/SKILL.md](skills/arweave/SKILL.md) |
| `arback` | Encrypted AR-wallet backup and restore for agent memory | [skills/arback/SKILL.md](skills/arback/SKILL.md) |
| `monitor` | AO Task Monitor client (summaries, alerts, logs) | [skills/monitor/SKILL.md](skills/monitor/SKILL.md) |
| `trade-audit` | Mandatory audit gate for trading & transfer decisions via Apus TEE | [skills/trade-audit/SKILL.md](skills/trade-audit/SKILL.md) |

## Installation

Paste any of these into your agent (Claude Code, OpenCode, OpenClaw, etc.):

```
install this skill for me https://github.com/apuslabs/skills/tree/main/skills/arweave
```

```
install this skill for me https://github.com/apuslabs/skills/tree/main/skills/arback
```

```
install this skill for me https://github.com/apuslabs/skills/tree/main/skills/monitor
```

```
install this skill for me https://github.com/apuslabs/skills/tree/main/skills/trade-audit
```

Or install all skills at once:

```
Fetch and follow instructions from https://raw.githubusercontent.com/apuslabs/skills/refs/heads/main/INSTALL.md
```

This adds the skill to your project's `.claude/skills/` or `.opencode/skills/` directory.

## Usage with Claude Code

Once installed, invoke skills by asking Claude Code naturally:

### Arweave

```
use arweave to upload ./my-document.md
use arweave to upload ./dist
use arweave to attach <txId> to myname
```

Claude Code will prompt for your wallet path if not configured.

**Full docs:** [skills/arweave/SKILL.md](skills/arweave/SKILL.md)

### arback

```
back up my memory to Arweave
restore my memory from the last backup
check my Turbo balance
save my agent memory
```

Requires `AR_WALLET_PATH` (or `AR_WALLET_JSON`) environment variable pointing to an AR wallet in JWK format.

**Full docs:** [skills/arback/SKILL.md](skills/arback/SKILL.md)

### Monitor

```
use monitor to get a summary
use monitor to check alerts
use monitor to show logs for ao-token-info
```

Requires `AO_MONITOR_KEY` environment variable (see skill docs for setup).

**Full docs:** [skills/monitor/SKILL.md](skills/monitor/SKILL.md)

### Trade-Audit

```
should I buy into this Polymarket position? https://polymarket.com/event/...
audit this transfer: send 10 AR to <address>
review whether to enter this liquidity pool
```

The agent collects the relevant information, then trade-audit sends it to an Apus TEE for a verified APPROVE / REJECT / WAIT decision.

**Full docs:** [skills/trade-audit/SKILL.md](skills/trade-audit/SKILL.md)

## Manual CLI Usage

You can also run the CLIs directly:

### Arweave

```sh
# Upload a file
node skills/arweave/index.mjs upload ./file.md --wallet ./wallet.json

# Upload a website
node skills/arweave/index.mjs upload-site ./dist --wallet ./wallet.json

# Attach to ArNS name
node skills/arweave/index.mjs attach <txId> myname --wallet ./wallet.json --yes

# Query transactions (with automatic endpoint fallback for reliability)
node skills/arweave/index.mjs query --tag "Content-Type:text/html" --limit 10
node skills/arweave/index.mjs query --owner <address> --limit 50
node skills/arweave/index.mjs query --block-min 587540 --block-max 587550

# Use a custom GraphQL endpoint
node skills/arweave/index.mjs query --tag "App-Name:MyApp" --limit 10 \
  --graphql-endpoint "https://custom-gateway.com/graphql"
```

The query command supports automatic endpoint fallback for reliability. If the primary Arweave gateway is unavailable, it will automatically try alternative endpoints.

**Full docs:** [skills/arweave/SKILL.md](skills/arweave/SKILL.md)

### arback

```sh
export AR_WALLET_PATH=~/.aos.json

# Install dependencies (first time only)
python skills/arback/scripts/arback.py init

# Dry-run backup — shows file list and cost estimate
python skills/arback/scripts/arback.py backup --input memory/ --dry-run

# Back up memory/ to Arweave
python skills/arback/scripts/arback.py backup --input memory/

# Restore the latest backup
python skills/arback/scripts/arback.py restore --latest --out memory/

# Check wallet address and Turbo balance
python skills/arback/scripts/arback.py status
```

**Full docs:** [skills/arback/SKILL.md](skills/arback/SKILL.md)

### Monitor

```sh
# System summary
node skills/monitor/index.mjs summary

# Check alerts
node skills/monitor/index.mjs alerts

# View logs
node skills/monitor/index.mjs logs --limit 50
```

**Full docs:** [skills/monitor/SKILL.md](skills/monitor/SKILL.md)

## Requirements

- Node.js 18+
- Internet access
- Arweave wallet (JWK format) for `arweave` and `arback` skills
- Python 3.9+ and `uv` for `arback` and `trade-audit` skills (`pip install uv`)
- `AO_MONITOR_KEY` env var for `monitor` skill

## Development

The `arweave` skill requires a build step (bundles dependencies):

```sh
npm ci
npm run build
node skills/arweave/index.mjs --help
```

The `monitor` skill is dependency-free and runs directly:

```sh
node skills/monitor/index.mjs --help
```

## License

MIT
