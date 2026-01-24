```
 ____                                     _       ____  _    _ _ _     
|  _ \ ___ _ __ _ __ ___   __ ___      __| |__   / ___|| | _(_) | |___ 
| |_) / _ \ '__| '_ ` _ \ / _` \ \ /\ / / '_ \  \___ \| |/ / | | / __|
|  __/  __/ |  | | | | | | (_| |\ V  V /| |_) |  ___) |   <| | | \__ \
|_|   \___|_|  |_| |_| |_|\__,_| \_/\_/ |_.__/  |____/|_|\_\_|_|_|___/
```

A collection of Permaweb CLI skills for [Claude Code](https://claude.ai/code) and [OpenCode](https://opencode.ai).

## Skills

| Skill | Description | Docs |
|-------|-------------|------|
| `arweave` | Upload files/sites to Arweave + manage ArNS records | [skills/arweave/SKILL.md](skills/arweave/SKILL.md) |
| `monitor` | AO Task Monitor client (summaries, alerts, logs) | [skills/monitor/SKILL.md](skills/monitor/SKILL.md) |

## Installation

Install skills into your project using the `skills` CLI:

```sh
# Install the Arweave skill
npx skills add https://github.com/permaweb/skills --skill arweave

# Install the Monitor skill
npx skills add https://github.com/permaweb/skills --skill monitor
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

### Monitor

```
use monitor to get a summary
use monitor to check alerts
use monitor to show logs for ao-token-info
```

Requires `AO_MONITOR_KEY` environment variable (see skill docs for setup).

**Full docs:** [skills/monitor/SKILL.md](skills/monitor/SKILL.md)

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
```

**Full docs:** [skills/arweave/SKILL.md](skills/arweave/SKILL.md)

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
- Arweave wallet (JWK format) for `arweave` skill
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
