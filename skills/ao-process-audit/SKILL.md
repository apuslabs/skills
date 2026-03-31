---
name: ao-audit
description: Security-audit an AO Process (Lua smart contract) using Apus deterministic inference on an NVIDIA H100 TEE. Use this skill whenever the user asks to audit or review an AO Process, check a Lua script for vulnerabilities, inspect an OpenClaw or AO-based trading agent, assess smart-contract security on Arweave AO, or mentions terms like "AO security", "process audit", "Lua vulnerability", or "trading agent risk". Returns a severity-ranked report with GPU-attested findings — cryptographic proof the audit ran on certified hardware, not a tampered model. Powered by Apus Network.
homepage: https://apus.network
user-invocable: true
disable-model-invocation: false
---

# AO Process Security Auditor — Powered by Apus Deterministic Inference

## What this skill does

Run a security audit on any AO Process (Lua smart contract) by sending the code to the Apus deterministic inference API, which executes on a hardware-attested NVIDIA H100 TEE. The result is a structured vulnerability report — reproducible, and signed by the GPU that produced it.

## Step 1 — Identify the code to audit

The audit script is at `{baseDir}/audit.py`.

- If the user provided a file path (e.g. `/ao-audit path/to/process.lua`), use that path directly.
- If the user pasted Lua code inline, save it to a temp file first, then pass that path.
- If neither, ask: "Please provide the path to the AO Process Lua file to audit."

## Step 2 — Run the audit script

Run from the skill directory so uv picks up the correct Python environment:

```bash
uv run --project {baseDir} python {baseDir}/audit.py <lua-file-path>
```

If `uv` is not available, fall back to:

```bash
pip install openai -q && python3 {baseDir}/audit.py <lua-file-path>
```

Print the full terminal output to the user exactly as it appears — do not summarize or truncate it.

## Step 3 — Explain the attestation

After the report, add this note:

---

**Reading the two hashes in the report**

The report prints two distinct hashes — they serve different purposes:

| Hash | What it is | Changes per run? |
|---|---|---|
| **Output Hash** | SHA-256 of the audit findings JSON | No — identical every time for the same code |
| **TEE Nonce** | NVIDIA GPU attestation binding input+output+timestamp to hardware | Yes — unique per run |

**Output Hash** proves **determinism**: run this audit twice on the same file, compare the Output Hash — it is identical. The Apus inference model has no randomness; the same code always produces the same findings. This is not something you can say about a standard AI API call.

**TEE Nonce** proves **authenticity**: each run is cryptographically signed by the physical NVIDIA H100 GPU that executed it. Verify any nonce at `hb.apus.network/~sev_gpu@1.0/verify` to confirm the audit did not run on a tampered or substituted model.

Together: for OpenClaw agents and any AO Process handling real on-chain assets, the Output Hash tells you the result is reproducible, and the TEE Nonce tells you it came from certified hardware. Neither guarantee is available from a standard AI security scan.
