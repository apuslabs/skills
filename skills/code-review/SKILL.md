# Code Review with OpenCode & Kimi-K2

Automated code reviews using OpenCode's AI-powered code review agent with the kimi-k2 model.

**Homepage:** https://opencode.ai
**Agent docs:** https://opencode.ai/docs/agents/
**GitHub App:** https://github.com/apps/opencode-agent

## What This Skill Does

This skill provides CLI tools to:

1. **Review code** using OpenCode with kimi-k2 AI model
2. **Analyze pull requests** and generate feedback
3. **Create GitHub Actions workflows** for automated code reviews
4. **Post reviews directly to GitHub** PRs

## Installation

Clone this skill into your OpenClaw workspace:

```bash
cd /Users/twilson63/.openclaw/workspace/skills
git clone https://github.com/user/code-review.git
cd code-review
npm install
```

Or add to your `.env` file:

```bash
OPENCODE_MODEL=kimi-k2
OPENCODE_API_KEY=your_api_key_here
```

## Prerequisites

- **Node.js** installed
- **OpenCode CLI** installed: `npm install -g opencode`
- **GitHub credentials** configured (`gh` CLI or environment variables)
- **kimi-k2 model access** via OpenCode

## Quick Start

### Review a Single File

```bash
node index.mjs review --file=path/to/file.ts
```

### Review Modified Files from PR

```bash
node index.mjs review --repo=owner/repo --pr=123
```

### Generate GitHub Actions Workflow

```bash
node index.mjs generate-workflow --repo=owner/repo --pr=123
```

This creates `.github/workflows/code-review.yaml` in your repository.

### Post Review to GitHub PR

```bash
node index.mjs post --repo=owner/repo --pr=123 --summary=review-summary.json
```

## CLI Usage

### `review` - Run code review

Reviews code using OpenCode with kimi-k2 model.

**Options:**

| Flag | Required | Description |
|------|----------|-------------|
| `--file` | No | Path to single file to review |
| `--repo` | Yes | Repository in format `owner/repo` |
| `--pr` | Yes | Pull request number |
| `--language` | No | Programming language (default: auto-detected) |
| `--focus` | No | Review focus: quality, performance, security (default: quality) |
| `--rules` | No | Additional review rules |

**Examples:**

```bash
# Review a single file
node index.mjs review --file=src/index.ts

# Review PR #1 in permaweb/skills
node index.mjs review --repo=permaweb/skills --pr=1

# Review with performance focus
node index.mjs review --repo=owner/repo --pr=42 --focus=performance

# Review with custom rules
node index.mjs review --repo=owner/repo --pr=42 --rules="No console.log in production"
```

**Output:**

```json
{
  "status": "complete",
  "filesReviewed": 3,
  "reviews": [
    {
      "file": "src/index.ts",
      "review": {
        "feedback": "✅ Code passes review\n\n- Follows TypeScript best practices\n- Proper error handling\n- Good variable naming\n\nMinor suggestion: Consider adding JSDoc types...",
        "metadata": {
          "model": "kimi-k2",
          "focus": "quality",
          "language": "typescript",
          "timestamp": "2026-01-31T23:45:00.000Z"
        }
      }
    }
  ],
  "summary": {
    "criticalIssues": 0,
    "suggestions": 3,
    "totalReviews": 3,
    "passing": 2,
    "failing": 1
  }
}
```

### `generate-workflow` - Generate GitHub Actions workflow

Creates a GitHub Actions workflow file for automated PR reviews.

**Options:**

| Flag | Required | Description |
|------|----------|-------------|
| `--repo` | Yes | Repository in format `owner/repo` |
| `--pr` | Yes | Pull request number |

**Examples:**

```bash
# Generate workflow for permaweb/skills
node index.mjs generate-workflow --repo=permaweb/skills --pr=1
```

**Creates:**

```yaml
# .github/workflows/code-review.yaml
name: Code Review with OpenCode
on:
  pull_request:
    types: ["opened", "synchronize", "reopened"]
permissions:
  contents: read
  pull-requests: write
jobs:
  review:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout repository
        uses: actions/checkout@v4

      - name: Install OpenCode
        run: npm install -g opencode

      - name: Review PR with OpenCode
        env:
          OPENCODE_MODEL: kimi-k2
        run: opencode review --repo permaweb/skills --pr 1 --model kimi-k2

      - name: Comment on PR
        uses: actions/github-script@v7
        with:
          script: |
            const fs = require('fs');
            const reviewOutput = fs.readFileSync('review-output.json', 'utf8');
            github.rest.issues.createComment({
              owner: 'permaweb',
              repo: 'skills',
              issue_number: 1,
              body: reviewOutput
            });
```

### `post` - Post review to GitHub PR

Posts a review summary to a GitHub pull request as a comment.

**Options:**

| Flag | Required | Description |
|------|----------|-------------|
| `--repo` | Yes | Repository in format `owner/repo` |
| `--pr` | Yes | Pull request number |
| `--summary` | Yes | Path to JSON summary file (from `review` command) |

**Examples:**

```bash
node index.mjs post --repo=permaweb/skills --pr=1 --summary=review-summary.json
```

## GitHub Actions Integration

### Install GitHub App

1. Visit: https://github.com/apps/opencode-agent
2. Click **"Install"** on the repository you want to use
3. Grant necessary permissions

### Create Workflow

1. Create file `.github/workflows/code-review.yaml` in your repo
2. Copy the workflow generated by `generate-workflow` command
3. Push to GitHub

### Test It

Create a test PR and watch the code review job run automatically.

## Configuration

### Environment Variables

```bash
# OpenCode model
OPENCODE_MODEL=kimi-k2

# OpenCode API key (if required)
OPENCODE_API_KEY=your_api_key_here

# GitHub token (if not using gh CLI)
GITHUB_TOKEN=ghp_your_token
```

### Custom Rules

You can customize review behavior by modifying the `rules` parameter:

```bash
node index.mjs review --repo=owner/repo --pr=42 --rules="|
  - No console.log in production code
  - Follow ESLint rules
  - Add JSDoc documentation
"
```

## Best Practices

1. **Use incremental reviews**: Start with a single file before reviewing entire PRs
2. **Review frequently**: The kimi-k2 model excels at catching subtle issues
3. **Iterate on rules**: Customize review rules based on your codebase
4. **Set up CI**: Add to your CI pipeline for consistent quality

## Troubleshooting

### "Agent not found" error

Make sure you have OpenCode installed:
```bash
npm install -g opencode
opencode --version
```

### "Invalid token" error

Verify your GitHub credentials:
```bash
gh auth status
gh pr list --repo owner/repo
```

### "kimi-k2 model not available"

Check OpenCode agents page: https://opencode.ai/docs/agents/
Make sure you have access to the kimi-k2 model.

## Output Files

When running `review`, the following files are created:

| File | Description |
|------|-------------|
| `review-summary.json` | Full review results |
| `review-output.md` | Formatted review feedback (optional) |

## Example Workflow

```bash
# 1. Generate GitHub Actions workflow
node index.mjs generate-workflow --repo=permaweb/skills --pr=1

# 2. Push workflow to GitHub
git add .github/workflows/code-review.yaml
git commit -m "Add code review workflow"
git push

# 3. Open PR #1 in permaweb/skills
# Review workflow will run automatically on this PR

# 4. Check review results
node index.mjs post --repo=permaweb/skills --pr=1 --summary=review-summary.json
```

## Advanced Usage

### Custom Review Templates

Edit the `generateComment()` function in `index.mjs` to customize the GitHub comment format.

### Batch Reviews

Review multiple PRs at once:

```bash
for pr in {1..10}; do
  node index.mjs review --repo=owner/repo --pr=$pr
  node index.mjs post --repo=owner/repo --pr=$pr --summary=review-summary.json
done
```

### Integrate with CI/CD

Add to your `.github/workflows/ci.yml`:

```yaml
- name: Code Review
  uses: user/code-review@v1.0
  with:
    repo: owner/repo
    pr: ${{ github.event.pull_request.number }}
```

## Contributing

This skill is based on OpenCode's AI-powered code review capabilities. For contributions, improvements, or reporting issues, please refer to the OpenCode documentation or create an issue.

## License

MIT

---

**Built with:** OpenCode + kimi-k2 🦞
**Co-created by:** ribby 🐟
