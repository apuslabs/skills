---
name: tradeproof
description: Send agent-prepared market, pool, or transfer decision material to Apus deterministic inference on an NVIDIA H100 TEE and receive a trusted transaction or investment decision. Use this skill whenever the user wants a verifiable buy/sell/hold/avoid decision or a yes/no judgment about whether a transfer should proceed, and the agent is responsible for collecting and organizing the source information before invoking the skill.
homepage: https://apus.network
user-invocable: true
disable-model-invocation: false
---

# Tradeproof — Verified Trading And Transfer Decisions

## What this skill does

Take agent-prepared decision material and send it to the Apus deterministic inference API. Apus returns the core decision in a structured decision packet.

- `Bundle Hash` — SHA-256 of the normalized decision material
- `Output Hash` — SHA-256 of the model's structured decision packet
- `TEE Nonce` — hardware attestation for that specific run

The point of this skill is verifiable decision-making: the gathered inputs are hashable, the decision output is hashable, and the run is hardware-attested.

Important boundary:

The script is at `{baseDir}/analyze.py`.

- The agent collects the page contents, address information, pool details, rules, and relevant facts.
- The agent organizes that material into either:
  - a text/markdown file, or
  - a JSON decision bundle.
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

## Step 2 — Run the decision engine

Preferred:

```bash
uv run --project {baseDir} python {baseDir}/analyze.py \
  --input-file /tmp/prepared-decision.md \
  --decision-goal "Decide whether there is a justified BTC buy level from this market page" \
  --bundle-out /tmp/tradeproof-bundle.json \
  --packet-out /tmp/tradeproof-packet.json
```

If the agent already prepared a JSON bundle:

```bash
uv run --project {baseDir} python {baseDir}/analyze.py \
  --bundle-file /tmp/prepared-bundle.json \
  --bundle-out /tmp/tradeproof-bundle.json \
  --packet-out /tmp/tradeproof-packet.json
```

If `uv` is unavailable, fall back to:

```bash
pip install openai -q && python3 {baseDir}/analyze.py --input-file /tmp/prepared-decision.md --decision-goal "Decide whether to act"
```

Print the full terminal output to the user exactly as it appears.

Typical goals:

- Market page: `Decide whether to buy BTC from this market page`
- Threshold thesis: `Decide whether there is a justified buy level for BTC from this page`
- Pool page: `Decide whether to enter this liquidity pool`
- Transfer: `Decide whether to transfer funds from address A to address B`

Example commands:

```bash
uv run --project {baseDir} python {baseDir}/analyze.py \
  --input-file /tmp/polymarket-btc-note.md \
  --decision-goal "Decide whether there is a justified BTC buy level from this market page"
```

```bash
uv run --project {baseDir} python {baseDir}/analyze.py \
  --input-file /tmp/transfer-review.md \
  --decision-goal "Decide whether to transfer funds from address A to address B"
```

## Step 3 — Agent Preparation Template

For `--input-file`, the agent can start from this structure:

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

## Step 4 — Explain the attestation

After the report, add this note:

---

**Reading the hashes in the report**

| Field | Meaning |
|---|---|
| **Bundle Hash** | Hash of the normalized source bundle used as model input |
| **Output Hash** | Hash of the structured decision packet JSON |
| **TEE Nonce** | Hardware attestation proving the run came from an NVIDIA H100 TEE |

To reproduce the decision exactly, rerun the skill on the same saved bundle with the same decision goal. If the bundle is identical, the `Output Hash` should match. The `TEE Nonce` changes on each run because it is bound to that specific execution.
