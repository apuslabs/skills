/**
 * arback — upload encrypted bundle + manifest to Arweave via Turbo.
 * Uses ArweaveSigner (AR JWK wallet). No ETH, no x402.
 *
 * Usage:
 *   node upload.mjs <bundle_path> <manifest_path> <owner_hash> <bundle_sha256> [--dry-run]
 *
 * Env:
 *   AR_WALLET_PATH  — path to AR JWK wallet file
 *   AR_WALLET_JSON  — AR JWK wallet as JSON string (fallback)
 */

import { TurboFactory, ArweaveSigner } from '@ardrive/turbo-sdk';
import fs from 'fs';
import crypto from 'crypto';

const APP_NAME = 'ARBACK';
const APP_VERSION = '1.0';

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

function sha256File(filePath) {
  const data = fs.readFileSync(filePath);
  return crypto.createHash('sha256').update(data).digest('hex');
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const positional = args.filter(a => !a.startsWith('--'));

  const [bundlePath, manifestPath, ownerHash, bundleSha256] = positional;

  if (!bundlePath || !manifestPath || !ownerHash || !bundleSha256) {
    console.error('Usage: node upload.mjs <bundle> <manifest> <owner_hash> <bundle_sha256> [--dry-run]');
    process.exit(1);
  }

  const timestamp = Math.floor(Date.now() / 1000).toString();

  const bundleTags = [
    { name: 'App-Name', value: APP_NAME },
    { name: 'App-Version', value: APP_VERSION },
    { name: 'Content-Type', value: 'application/octet-stream' },
    { name: 'Type', value: 'bundle' },
    { name: 'Unix-Time', value: timestamp },
    { name: 'Owner-Hash', value: ownerHash },
    { name: 'Bundle-SHA256', value: bundleSha256 },
  ];

  const manifestTags = [
    { name: 'App-Name', value: APP_NAME },
    { name: 'App-Version', value: APP_VERSION },
    { name: 'Content-Type', value: 'application/json' },
    { name: 'Type', value: 'manifest' },
    { name: 'Unix-Time', value: timestamp },
    { name: 'Owner-Hash', value: ownerHash },
  ];

  const bundleSize = fs.statSync(bundlePath).size;
  const manifestSize = fs.statSync(manifestPath).size;

  if (dryRun) {
    const jwk = loadWallet();
    const signer = new ArweaveSigner(jwk);
    const turbo = TurboFactory.authenticated({ signer });

    const turboPublic = TurboFactory.unauthenticated();
    const [bundleCosts, manifestCosts] = await Promise.all([
      turboPublic.getUploadCosts({ bytes: [bundleSize] }),
      turboPublic.getUploadCosts({ bytes: [manifestSize] }),
    ]);
    const balance = await turbo.getBalance();

    console.log(JSON.stringify({
      dry_run: true,
      bundle_size_bytes: bundleSize,
      manifest_size_bytes: manifestSize,
      estimated_winc: {
        bundle: bundleCosts[0]?.winc ?? null,
        manifest: manifestCosts[0]?.winc ?? null,
      },
      balance_winc: balance.winc,
    }));
    return;
  }

  const jwk = loadWallet();
  const signer = new ArweaveSigner(jwk);
  const turbo = TurboFactory.authenticated({ signer });

  // Upload bundle
  const bundleData = fs.readFileSync(bundlePath);
  const bundleResult = await turbo.upload({
    data: bundleData,
    dataItemOpts: { tags: bundleTags },
  });

  // Attach bundle tx id to manifest tags and upload manifest
  manifestTags.push({ name: 'Bundle-TX', value: bundleResult.id });

  const manifestData = fs.readFileSync(manifestPath);
  const manifestResult = await turbo.upload({
    data: manifestData,
    dataItemOpts: { tags: manifestTags },
  });

  console.log(JSON.stringify({
    bundle_tx_id: bundleResult.id,
    manifest_tx_id: manifestResult.id,
    bundle_size_bytes: bundleSize,
  }));
}

main().catch(err => {
  console.error('Upload error:', err.message);
  process.exit(1);
});
