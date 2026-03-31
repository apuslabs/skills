/**
 * arback — Turbo Credits top-up helper.
 *
 * Commands (passed as first positional arg):
 *   balance                     — show current WINC balance
 *   ar <amount>                 — top up with AR tokens (e.g. 0.01)
 *   fiat <currency> <amount>    — generate Stripe checkout URL (e.g. usd 10)
 *   token <token_type> <amount> — top up with other tokens (e.g. solana 0.1)
 *   price <bytes>               — estimate upload cost for N bytes
 *
 * Env:
 *   AR_WALLET_PATH  — path to AR JWK wallet file
 *   AR_WALLET_JSON  — AR JWK wallet as JSON string (fallback)
 *
 * Supported fiat currencies: usd, eur, gbp, cad, aud, inr, sgd, hkd, brl, jpy
 * Supported token types: arweave, solana, ethereum, matic, pol, kyve,
 *                        base-eth, base-usdc, usdc, polygon-usdc, ario, base-ario
 */

import {
  TurboFactory,
  ArweaveSigner,
  WinstonToTokenAmount,
} from '@ardrive/turbo-sdk';
import fs from 'fs';

const FIAT_CURRENCIES = new Set([
  'usd', 'eur', 'gbp', 'cad', 'aud', 'inr', 'sgd', 'hkd', 'brl', 'jpy',
]);

function loadWallet() {
  const walletPath = process.env.AR_WALLET_PATH;
  const walletJson = process.env.AR_WALLET_JSON;
  if (walletPath) {
    return JSON.parse(fs.readFileSync(walletPath, 'utf-8'));
  }
  if (walletJson) {
    return JSON.parse(walletJson);
  }
  throw new Error('AR_WALLET_PATH or AR_WALLET_JSON env var required');
}

async function main() {
  const [command, ...rest] = process.argv.slice(2);

  if (command === 'price') {
    // Price estimate — unauthenticated, no wallet needed
    const bytes = parseInt(rest[0], 10);
    if (!bytes || bytes <= 0) {
      console.error('Usage: node topup.mjs price <bytes>');
      process.exit(1);
    }
    const turbo = TurboFactory.unauthenticated();
    const costs = await turbo.getUploadCosts({ bytes: [bytes] });
    console.log(JSON.stringify({ bytes, winc: costs[0]?.winc ?? null }));
    return;
  }

  // All other commands require a wallet
  const jwk = loadWallet();
  const signer = new ArweaveSigner(jwk);
  const turbo = TurboFactory.authenticated({ signer });

  if (command === 'balance') {
    const balance = await turbo.getBalance();
    console.log(JSON.stringify({ winc: balance.winc }));

  } else if (command === 'ar') {
    const arAmount = parseFloat(rest[0]);
    if (!arAmount || arAmount <= 0) {
      console.error('Usage: node topup.mjs ar <amount_in_AR>');
      process.exit(1);
    }
    // AR to Winston: 1 AR = 1e12 Winston
    const winston = BigInt(Math.round(arAmount * 1e12));
    const result = await turbo.topUpWithTokens({
      tokenAmount: WinstonToTokenAmount(winston),
    });
    console.log(JSON.stringify({
      tx_id: result.id,
      winc_received: result.winc,
      status: result.status,
      ar_spent: arAmount,
    }));

  } else if (command === 'fiat') {
    const [currency, amountStr] = rest;
    if (!currency || !amountStr) {
      console.error('Usage: node topup.mjs fiat <currency> <amount>');
      process.exit(1);
    }
    const cur = currency.toLowerCase();
    if (!FIAT_CURRENCIES.has(cur)) {
      console.error(`Unsupported currency: ${currency}. Supported: ${[...FIAT_CURRENCIES].join(', ')}`);
      process.exit(1);
    }
    const amount = parseFloat(amountStr);
    const owner = await signer.getNativeAddress();

    // Dynamically build currency map object — turbo-sdk exports e.g. USD(), EUR()
    // We pass it as { [cur.toUpperCase()]: amount }
    const currencyParam = { [cur.toUpperCase()]: amount };

    const session = await turbo.createCheckoutSession({
      amount: currencyParam,
      owner,
    });
    console.log(JSON.stringify({
      url: session.url,
      winc_to_receive: session.winc,
      amount,
      currency: cur,
    }));

  } else if (command === 'token') {
    const [tokenType, amountStr] = rest;
    if (!tokenType || !amountStr) {
      console.error('Usage: node topup.mjs token <token_type> <amount>');
      process.exit(1);
    }
    const amount = parseFloat(amountStr);
    // For non-AR tokens, amount is in the token's base units (e.g. lamports for SOL)
    // Callers should pass the already-converted smallest unit amount
    const result = await turbo.topUpWithTokens({
      tokenAmount: WinstonToTokenAmount(BigInt(Math.round(amount))),
    });
    console.log(JSON.stringify({
      tx_id: result.id,
      winc_received: result.winc,
      status: result.status,
      token: tokenType,
    }));

  } else {
    console.error(`Unknown command: ${command}`);
    console.error('Commands: balance | ar <amount> | fiat <currency> <amount> | token <type> <amount> | price <bytes>');
    process.exit(1);
  }
}

main().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
