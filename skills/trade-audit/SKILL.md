---
name: trade-audit
description: Mandatory audit gate for all trading and transfer decisions. Sends agent-prepared decision material to Apus deterministic inference on an NVIDIA H100 TEE and returns an attested APPROVE / REJECT / WAIT verdict. Any skill or agent that executes a buy, sell, swap, transfer, or liquidity action MUST pass through trade-audit first.
homepage: https://apus.network
user-invocable: true
disable-model-invocation: false
---

# Trade-Audit — Mandatory Audit Gate for Trading & Transfer Decisions

## Rule

**Every trading or transfer action MUST be audited by this skill before execution.** This includes buy, sell, swap, hold, transfer, liquidity pool entry/exit, and any on-chain value movement. If the audit verdict is not `APPROVE`, the action MUST NOT proceed.

## What this skill does

Takes agent-prepared decision material and sends it to the Apus deterministic inference API running on an NVIDIA H100 TEE. Returns a structured, hardware-attested decision packet with:

- `Bundle Hash` — SHA-256 of the normalized decision material
- `Output Hash` — SHA-256 of the model's structured decision packet
- `TEE Nonce` — hardware attestation for that specific run
- `Verdict` — APPROVE / REJECT / WAIT
- `Confidence` — 1-100 integer, gated by `--min-confidence` (default 60)

Every run is logged to `~/.trade-audit/audit.jsonl`.

Important boundary:

The script is at `{baseDir}/analyze.py`.

- The agent collects the page contents, address information, pool details, rules, and relevant facts.
- The agent organizes that material into either a text/markdown file or a JSON decision bundle.
- This script does not fetch pages or explorer data itself.
- Reuse the bundled templates when preparing inputs:
  - Markdown template: `{baseDir}/templates/prepared-decision-template.md`
  - JSON template: `{baseDir}/templates/prepared-bundle-template.json`

## Step 1 — Prepare the decision material

Create one of these:

1. A text or markdown file containing the organized facts.
2. A JSON bundle containing the organized facts plus `decision_goal`.

For example, a prepared text file might contain:

```text
Page: https://polymarket.com/event/what-price-will-bitcoin-hit-before-2027
Decision goal: Decide whether there is a justified BTC buy level from this market page.

Collected facts:
- Market title: What price will Bitcoin hit before 2027
- Threshold ladder excerpt:
  - Below 55,000: Yes 74c / No 27c
  - Below 50,000: Yes 61c / No 40c
- Rules:
  - Market resolves yes if Binance BTC/USDT trades at or below the threshold in the specified window.
- Observation:
  - 55,000 is the strongest downside threshold shown in the collected page notes.
```

## Step 2 — Run the audit

### Standard mode (always returns exit 0 on success)

```bash
uv run --project {baseDir} python {baseDir}/analyze.py \
  --input-file /tmp/prepared-decision.md \
  --decision-goal "Decide whether there is a justified BTC buy level from this market page" \
  --bundle-out /tmp/audit-bundle.json \
  --packet-out /tmp/audit-packet.json
```

### Gate mode (exit code reflects verdict)

```bash
uv run --project {baseDir} python {baseDir}/analyze.py \
  --input-file /tmp/prepared-decision.md \
  --decision-goal "Decide whether there is a justified BTC buy level" \
  --gate \
  --min-confidence 60 \
  --bundle-out /tmp/audit-bundle.json \
  --packet-out /tmp/audit-packet.json
```

Exit codes in gate mode:
- `0` = APPROVE — proceed with the action
- `1` = REJECT — do NOT proceed
- `2` = WAIT — insufficient information, gather more data first

If the agent already prepared a JSON bundle:

```bash
uv run --project {baseDir} python {baseDir}/analyze.py \
  --bundle-file /tmp/prepared-bundle.json \
  --gate \
  --bundle-out /tmp/audit-bundle.json \
  --packet-out /tmp/audit-packet.json
```

If `uv` is unavailable, fall back to:

```bash
pip install openai -q && python3 {baseDir}/analyze.py --input-file /tmp/prepared-decision.md --decision-goal "Decide whether to act" --gate
```

Print the full terminal output to the user exactly as it appears.

## Step 3 — Integration pattern for other skills

Any skill or agent workflow that involves a trade or transfer must use this pattern:

```bash
# 1. Agent prepares the decision material into /tmp/audit-input.md
# 2. Run trade-audit in gate mode
uv run --project {baseDir} python {baseDir}/analyze.py \
  --input-file /tmp/audit-input.md \
  --decision-goal "Decide whether to transfer 10 AR from wallet A to wallet B" \
  --gate \
  --min-confidence 60

# 3. Check the exit code
if [ $? -ne 0 ]; then
  echo "Trade-audit did not approve. Aborting."
  exit 1
fi

# 4. Only now execute the actual trade / transfer
```

The `--min-confidence` flag (default 60) auto-rejects any APPROVE verdict below the threshold. Set higher for high-value transactions.

## Step 4 — Agent preparation templates

For `--input-file`, use this structure:

```text
Source URL: <original page or explorer URL>
Decision goal: <exact decision request>
Context label: <short label>

Collected facts:
- Fact 1
- Fact 2

Numeric observations:
- <value> — <context>

Rules / conditions:
- Rule 1
- Rule 2

Risks already observed by the agent:
- Risk 1

Unknowns:
- Missing item 1
```

Use the bundled file for a copyable version:

`{baseDir}/templates/prepared-decision-template.md`

For `--bundle-file`, use:

`{baseDir}/templates/prepared-bundle-template.json`

## Step 5 — Audit log

Every run automatically appends a record to `~/.trade-audit/audit.jsonl`. Each line is a JSON object:

```json
{
  "timestamp": "2026-04-01T12:00:00+00:00",
  "bundle_hash": "abc123...",
  "output_hash": "def456...",
  "tee_nonce": "...",
  "tee_verified": true,
  "verdict": "APPROVE",
  "confidence": 82,
  "decision_type": "BUY",
  "target": "BTC",
  "decision_goal": "Decide whether to buy BTC",
  "min_confidence_threshold": 60,
  "gate_mode": true
}
```

## Step 6 — Explain the attestation

After the report, add this note:

---

**Reading the hashes in the report**

| Field | Meaning |
|---|---|
| **Bundle Hash** | Hash of the normalized source bundle used as model input |
| **Output Hash** | Hash of the structured decision packet JSON |
| **TEE Nonce** | Hardware attestation proving the run came from an NVIDIA H100 TEE |

To reproduce the decision exactly, rerun the skill on the same saved bundle with the same decision goal. If the bundle is identical, the `Output Hash` should match. The `TEE Nonce` changes on each run because it is bound to that specific execution.
