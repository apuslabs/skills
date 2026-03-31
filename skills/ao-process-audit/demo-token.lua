-- =============================================================
-- OpenClaw Trading Agent Token Process
-- Based on AO Standard Token Specification
-- Version: 1.0.0
--
-- WARNING: This is a DEMO file for security auditing purposes.
-- It contains intentional vulnerabilities. Do NOT deploy.
-- =============================================================

local json = require("json")

-- Token state
Variant = "0.0.3"
Denomination = Denomination or 12
Balances = Balances or { [ao.id] = "100000000000000" }
TotalSupply = TotalSupply or "100000000000000"
Name = Name or "OpenClaw Demo Token"
Ticker = Ticker or "OCLAW"
Logo = Logo or "SBCCXwwecBlDqRLUjPUd8JVoHMY55N3AOBQ-pUIlRFw"

-- ✅ Info handler — no security concerns
Handlers.add("Info", Handlers.utils.hasMatchingTag("Action", "Info"), function(msg)
    ao.send({
        Target = msg.From,
        Name = Name,
        Ticker = Ticker,
        Logo = Logo,
        Denomination = tostring(Denomination),
        ["Total-Supply"] = TotalSupply,
    })
end)

-- ✅ Balances handler — read only, safe
Handlers.add("Balances", Handlers.utils.hasMatchingTag("Action", "Balances"), function(msg)
    ao.send({ Target = msg.From, Data = json.encode(Balances) })
end)

-- ✅ Balance handler — read only, safe
Handlers.add("Balance", Handlers.utils.hasMatchingTag("Action", "Balance"), function(msg)
    local bal = "0"
    if msg.Tags.Target and Balances[msg.Tags.Target] then
        bal = Balances[msg.Tags.Target]
    elseif Balances[msg.From] then
        bal = Balances[msg.From]
    end
    ao.send({
        Target = msg.From,
        Balance = bal,
        Ticker = Ticker,
        Account = msg.Tags.Target or msg.From,
        Data = bal
    })
end)

-- 🔴 VULNERABILITY #1 (CRITICAL): No owner check on Mint
-- Any process can call this handler and mint unlimited tokens.
-- Fix: assert(msg.From == ao.id, "Only owner can mint")
Handlers.add("Mint", Handlers.utils.hasMatchingTag("Action", "Mint"), function(msg)
    assert(msg.Tags.Quantity, "Quantity tag required")
    assert(tonumber(msg.Tags.Quantity) > 0, "Quantity must be positive")

    -- Missing: assert(msg.From == ao.id, "Unauthorized")

    Balances[msg.From] = tostring(
        (tonumber(Balances[msg.From]) or 0) + tonumber(msg.Tags.Quantity)
    )
    TotalSupply = tostring(tonumber(TotalSupply) + tonumber(msg.Tags.Quantity))

    ao.send({ Target = msg.From, Data = "Minted " .. msg.Tags.Quantity })
end)

-- 🟠 VULNERABILITY #2 (HIGH) + 🟠 VULNERABILITY #3 (HIGH) + 🔵 #4 (LOW):
--
-- #2 (HIGH): No ao.isTrusted(msg) check — a spoofed message from
--            a malicious scheduler can impersonate any sender and
--            drain balances.
--
-- #3 (HIGH): Uses raw Lua tonumber() arithmetic instead of bint.
--            Large token quantities (>2^53) will silently lose precision,
--            enabling rounding attacks.
--
-- #4 (LOW):  No Credit-Notice sent to recipient after transfer,
--            violating the AO Standard Token Specification.
--
-- Fix: Add ao.isTrusted(msg) guard, use bint for arithmetic,
--      send Credit-Notice to recipient.
Handlers.add("Transfer", Handlers.utils.hasMatchingTag("Action", "Transfer"), function(msg)
    assert(msg.Tags.Recipient, "Recipient tag required")
    assert(msg.Tags.Quantity, "Quantity tag required")

    -- Missing: assert(ao.isTrusted(msg), "Message not trusted")

    local qty = tonumber(msg.Tags.Quantity)  -- ⚠️ Should use bint(msg.Tags.Quantity)

    -- 🟡 VULNERABILITY #5 (MEDIUM): Zero-value transfers not blocked
    -- Allows spam/DoS: attacker sends 0-quantity transfers to bloat state
    -- and waste compute. Fix: assert(qty > 0, "Quantity must be positive")

    local senderBal = tonumber(Balances[msg.From]) or 0
    assert(senderBal >= qty, "Insufficient balance")

    -- ⚠️ Raw arithmetic — precision loss on large values
    Balances[msg.From] = tostring(senderBal - qty)
    Balances[msg.Tags.Recipient] = tostring(
        (tonumber(Balances[msg.Tags.Recipient]) or 0) + qty
    )

    -- Send Debit-Notice to sender (correct)
    ao.send({
        Target = msg.From,
        Action = "Debit-Notice",
        Recipient = msg.Tags.Recipient,
        Quantity = tostring(qty),
        Data = "You sent " .. tostring(qty) .. " " .. Ticker
    })

    -- Missing Credit-Notice to recipient:
    -- ao.send({
    --     Target = msg.Tags.Recipient,
    --     Action = "Credit-Notice",
    --     Sender = msg.From,
    --     Quantity = tostring(qty),
    --     Data = "You received " .. tostring(qty) .. " " .. Ticker
    -- })
end)

-- ✅ Burn handler — correctly restricted to process owner
Handlers.add("Burn", Handlers.utils.hasMatchingTag("Action", "Burn"), function(msg)
    assert(msg.From == ao.id, "Only owner can burn")
    assert(msg.Tags.Quantity, "Quantity tag required")

    local qty = tonumber(msg.Tags.Quantity)
    assert(qty > 0, "Quantity must be positive")

    local ownerBal = tonumber(Balances[ao.id]) or 0
    assert(ownerBal >= qty, "Insufficient balance to burn")

    Balances[ao.id] = tostring(ownerBal - qty)
    TotalSupply = tostring(tonumber(TotalSupply) - qty)

    ao.send({ Target = msg.From, Data = "Burned " .. tostring(qty) })
end)

-- ✅ Total supply query — read only, safe
Handlers.add("Total-Supply", Handlers.utils.hasMatchingTag("Action", "Total-Supply"), function(msg)
    ao.send({ Target = msg.From, Data = TotalSupply })
end)
