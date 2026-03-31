#!/usr/bin/env python3
"""
AO Process Security Auditor — Powered by Apus Deterministic Inference
Usage: uv run python audit.py <path-to-lua-file>
       uv run python audit.py  (reads from stdin)
"""

import hashlib
import json
import sys

try:
    from openai import OpenAI
except ImportError:
    import subprocess
    subprocess.check_call([sys.executable, "-m", "pip", "install", "openai", "-q"])
    from openai import OpenAI

# ── Load AO Process code ────────────────────────────────────────────────────

if len(sys.argv) > 1:
    with open(sys.argv[1], "r") as f:
        lua_code = f.read()
    source_label = sys.argv[1]
else:
    lua_code = sys.stdin.read()
    source_label = "<stdin>"

# ── Audit prompt ────────────────────────────────────────────────────────────

AUDIT_PROMPT = f"""You are an expert AO (Arweave Operating System) Process security auditor specializing in Lua smart contracts for decentralized AI trading agents.

Analyze the following AO Process code for security vulnerabilities. Check specifically for:

1. [CRITICAL] Unauthorized mint — Mint/admin handler missing owner check (msg.From ~= ao.id)
2. [CRITICAL] Ownership bypass — Protected functions accessible by non-owners
3. [HIGH] Missing trust verification — Handlers not calling ao.isTrusted(msg) before state changes
4. [HIGH] Integer overflow — Token arithmetic using raw Lua numbers instead of bint library
5. [MEDIUM] Missing parameter validation — Quantity not checked > 0, recipient not validated
6. [MEDIUM] Unprotected state mutation — Handlers modifying Balances without authorization
7. [LOW] Missing AO standard notices — Credit-Notice or Debit-Notice not sent on Transfer
8. [INFO] AO standard compliance — Deviations from ao Standard Token Specification

Return ONLY valid JSON, no markdown fences, no explanation outside the JSON:
{{
  "summary": "one sentence describing the overall security posture",
  "risk_level": "CRITICAL",
  "findings": [
    {{
      "severity": "CRITICAL",
      "title": "Short title of the vulnerability",
      "description": "What the vulnerability is and how it can be exploited in a trading agent context",
      "line_hint": "the relevant handler name or code snippet"
    }}
  ],
  "recommendation": "Top priority fix in one sentence"
}}

AO Process code to audit:
```lua
{lua_code}
```"""

# ── Call Apus deterministic inference ───────────────────────────────────────

client = OpenAI(
    api_key="",
    base_url="https://hb.apus.network/~inference@1.0",
)

print("\nCalling Apus deterministic inference on NVIDIA H100 TEE...", flush=True)

try:
    response = client.chat.completions.create(
        model="google/gemma-3-27b-it",
        messages=[{"role": "user", "content": AUDIT_PROMPT}],
        extra_body={"tee": True},
        timeout=120,
    )
except Exception as e:
    print(f"\n[ERROR] Apus API call failed: {e}", file=sys.stderr)
    sys.exit(1)

# ── Parse audit result ──────────────────────────────────────────────────────

raw_content = response.choices[0].message.content.strip()

# Strip markdown code fences if model wrapped the JSON
if raw_content.startswith("```"):
    lines = raw_content.split("\n")
    start = 1
    end = len(lines) - 1 if lines[-1].strip() == "```" else len(lines)
    raw_content = "\n".join(lines[start:end])

try:
    audit = json.loads(raw_content)
except json.JSONDecodeError:
    print("[WARN] Model returned non-JSON, showing raw output:")
    print(raw_content)
    sys.exit(1)

# Compute output hash — SHA-256 of the normalized model output.
# Because Apus uses a deterministic model, the same code always produces
# the same findings JSON, and therefore the same output hash.
# Run this audit twice on the same file: the output hash will be identical.
output_hash = hashlib.sha256(raw_content.encode("utf-8")).hexdigest()

# ── Extract attestation ─────────────────────────────────────────────────────

resp_dict = response.model_dump()
attestation = resp_dict.get("attestation", {})
nonce       = attestation.get("nonce", "N/A")
verified    = attestation.get("verified", False)
claims      = attestation.get("claims", [{}])
gpu_model   = claims[0].get("hwmodel", "Unknown GPU") if claims else "Unknown GPU"
driver_ver  = attestation.get("evidences", [{}])[0].get("driver_version", "N/A") \
              if attestation.get("evidences") else "N/A"

# ── Render report ───────────────────────────────────────────────────────────

severity_icons = {
    "CRITICAL": "🔴 [CRITICAL]",
    "HIGH":     "🟠 [HIGH]    ",
    "MEDIUM":   "🟡 [MEDIUM]  ",
    "LOW":      "🔵 [LOW]     ",
    "INFO":     "⚪ [INFO]    ",
}

risk        = audit.get("risk_level", "UNKNOWN")
findings    = audit.get("findings", [])
summary     = audit.get("summary", "")
rec         = audit.get("recommendation", "")

W = 62
border = "═" * W
thin   = "─" * W

def row(text="", width=W):
    text = str(text)
    if len(text) > width - 2:
        text = text[:width - 5] + "..."
    return f"║ {text:<{width - 2}} ║"

def wrap_row(text, indent=2, width=W):
    words = text.split()
    lines = []
    line = " " * indent
    for word in words:
        if len(line) + len(word) + 1 > width - 3:
            lines.append(f"║ {line:<{width - 2}} ║")
            line = " " * indent + word
        else:
            line = (line + " " + word).strip()
            line = " " * indent + line.lstrip()
    if line.strip():
        lines.append(f"║ {line:<{width - 2}} ║")
    return "\n".join(lines)

print(f"\n╔{border}╗")
print(f"║{'  AO PROCESS SECURITY AUDIT':^{W}}║")
print(f"╠{border}╣")
print(row(f"  Source  : {source_label}"))
print(row(f"  Model   : google/gemma-3-27b-it  (Apus Network)"))
print(row(f"  Hardware: {gpu_model}  /  Driver {driver_ver}"))
ver_icon = "✅ VERIFIED" if verified else "❌ UNVERIFIED"
nonce_short   = nonce[:46]        + "..." if len(nonce) > 46 else nonce
out_hash_short = output_hash[:46] + "..." if len(output_hash) > 46 else output_hash
print(row(f"  TEE     : {ver_icon}  ({gpu_model})"))
print(row(f"  TEE Nonce   : {nonce_short}"))
print(row(f"  Output Hash : {out_hash_short}"))
print(f"╠{border}╣")

risk_icon_map = {"CRITICAL":"🔴","HIGH":"🟠","MEDIUM":"🟡","LOW":"🔵","PASS":"✅","UNKNOWN":"❓"}
risk_icon = risk_icon_map.get(risk, "❓")
print(row(f"  Overall Risk : {risk_icon} {risk}"))
print(f"╠{border}╣")
print(wrap_row(summary, indent=2))
print(f"╠{border}╣")

if findings:
    for i, f in enumerate(findings):
        sev   = f.get("severity", "INFO")
        label = severity_icons.get(sev, f"[{sev}]")
        title = f.get("title", "")
        desc  = f.get("description", "")
        hint  = f.get("line_hint", "")

        if i > 0:
            print(f"║ {'·' * (W - 2)} ║")

        print(row(f"  {label} {title}"))
        print(wrap_row(desc, indent=4))
        if hint:
            hint_short = hint[:W - 10] + "..." if len(hint) > W - 10 else hint
            print(row(f"    → {hint_short}"))
else:
    print(row("  No findings — process appears secure."))

print(f"╠{border}╣")
print(row("  PRIORITY FIX:"))
print(wrap_row(rec, indent=4))
print(f"╠{border}╣")
print(row("  DETERMINISTIC VERIFICATION"))
print(row())
print(row("  Output Hash  — SHA-256 of the audit findings:"))
print(row(f"    {output_hash[:58]}"))
print(row("  This hash is IDENTICAL every time you run this audit on"))
print(row("  the same code. Apus uses a deterministic inference model:"))
print(row("  same input always produces the same output."))
print(row())
print(row("  TEE Nonce  — hardware attestation for THIS run:"))
print(row(f"    {nonce[:58]}"))
print(row("  Changes each run (includes timestamp), but cryptographically"))
print(row("  proves this output came from a real NVIDIA GPU TEE,"))
print(row("  not a tampered or substituted model."))
print(row())
print(row("  To verify the TEE nonce on-chain:"))
print(row("    POST to hb.apus.network/~sev_gpu@1.0/verify"))
print(f"╚{border}╝")

print(f"\nOutput Hash (reproducible):   {output_hash}")
print(f"TEE Nonce   (this run only):  {nonce}")
print(f"GPU TEE verified:             {verified}")
