# Installing Apus Skills

Install Apus Permaweb skills for [Claude Code](https://claude.ai/code) and [OpenCode](https://opencode.ai) via clone and symlink.

## Prerequisites

- Git
- Python 3.9+ (for `trade-audit`, `arback`, `ao-process-audit`)
- Node.js 18+ (for `arweave`, `monitor`, `aoconnect`)

## Quick Install (single skill)

```bash
npx skills add https://github.com/apuslabs/skills --skill trade-audit
```

Available skills: `arweave`, `arback`, `monitor`, `aoconnect`, `ao-process-audit`, `trade-audit`, `spa-builder`

## Full Install (all skills via symlink)

1. **Clone the repository:**
   ```bash
   git clone https://github.com/apuslabs/skills.git ~/.apus/skills
   ```

2. **Symlink into Claude Code:**
   ```bash
   mkdir -p .claude/skills
   ln -s ~/.apus/skills/skills .claude/skills/apus
   ```

   Or into OpenCode:
   ```bash
   mkdir -p .opencode/skills
   ln -s ~/.apus/skills/skills .opencode/skills/apus
   ```

3. **Restart Claude Code / OpenCode** to discover the skills.

## Verify

```bash
ls -la .claude/skills/apus
```

You should see a symlink pointing to your cloned skills directory.

## Updating

```bash
cd ~/.apus/skills && git pull
```

Skills update instantly through the symlink.

## Uninstalling

```bash
rm .claude/skills/apus
```

Optionally delete the clone: `rm -rf ~/.apus/skills`
