import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as readline from 'readline';
import { NodeARx } from '@permaweb/arx/node';
import { ArweaveSigner, ARIO, ANT, AOProcess, ARIO_MAINNET_PROCESS_ID, ARIO_TESTNET_PROCESS_ID } from '@ar.io/sdk/node';
import { connect } from '@permaweb/aoconnect';
import { queryTransactions, QueryParams } from './graphql.js';
import Arweave from 'arweave';

interface ParsedArgs {
  command: string | null;
  target: string | null;
  name: string | null;
  wallet: string | null;
  index: string;
  ttl: number;
  yes: boolean;
  help: boolean;
  force: boolean;
  dryRun: boolean;
  network: 'mainnet' | 'testnet';
  arioProcess: string | null;
  queryIds?: string[];
  queryOwners?: string[];
  queryRecipients?: string[];
  queryTags?: { name: string; values: string[] }[];
  queryBlockMin?: number;
  queryBlockMax?: number;
  querySort?: 'HEIGHT_DESC' | 'HEIGHT_ASC';
  queryLimit?: number;
  graphqlEndpoint?: string;
}

interface ArweaveJWK {
  kty: string;
  n: string;
  e: string;
  d?: string;
  p?: string;
  q?: string;
  dp?: string;
  dq?: string;
  qi?: string;
  [key: string]: unknown;
}

function parseArgs(args: string[]): ParsedArgs {
  const result: ParsedArgs = {
    command: null,
    target: null,
    name: null,
    wallet: null,
    index: 'index.html',
    ttl: 3600,
    yes: false,
    help: false,
    force: false,
    dryRun: false,
    network: 'mainnet',
    arioProcess: null,
  };

  const positional: string[] = [];
  let i = 0;

  // Helper to validate that a flag has a value
  function requireFlagValue(flag: string): string {
    const nextArg = args[i + 1];
    if (nextArg === undefined || nextArg.startsWith('--')) {
      console.error(`Error: ${flag} requires a value`);
      process.exit(1);
    }
    i++; // consume the value
    return nextArg;
  }

  while (i < args.length) {
    const arg = args[i];

    if (arg === '--help' || arg === '-h') {
      result.help = true;
      i++;
    } else if (arg === '--wallet') {
      result.wallet = requireFlagValue('--wallet');
      i++;
    } else if (arg === '--index') {
      result.index = requireFlagValue('--index');
      i++;
    } else if (arg === '--ttl') {
      const ttlStr = requireFlagValue('--ttl');
      result.ttl = parseInt(ttlStr, 10);
      i++;
    } else if (arg === '--yes' || arg === '-y') {
      result.yes = true;
      i++;
    } else if (arg === '--force' || arg === '-f') {
      result.force = true;
      i++;
    } else if (arg === '--dry-run') {
      result.dryRun = true;
      i++;
    } else if (arg === '--network') {
      const val = requireFlagValue('--network');
      if (val === 'mainnet' || val === 'testnet') {
        result.network = val;
      } else {
        console.error(`Error: --network must be 'mainnet' or 'testnet', got '${val}'`);
        process.exit(1);
      }
      i++;
    } else if (arg === '--ario-process') {
      result.arioProcess = requireFlagValue('--ario-process');
      i++;
    } else if (arg === '--ids') {
      const idsStr = requireFlagValue('--ids');
      result.queryIds = idsStr.split(',').map(id => id.trim()).filter(id => id.length > 0);
      i++;
    } else if (arg === '--owner') {
      const owner = requireFlagValue('--owner');
      if (!result.queryOwners) {
        result.queryOwners = [];
      }
      result.queryOwners.push(owner);
      i++;
    } else if (arg === '--recipient') {
      const recipient = requireFlagValue('--recipient');
      if (!result.queryRecipients) {
        result.queryRecipients = [];
      }
      result.queryRecipients.push(recipient);
      i++;
    } else if (arg === '--tag') {
      const tagStr = requireFlagValue('--tag');
      const colonCount = (tagStr.match(/:/g) || []).length;
      if (colonCount !== 1) {
        console.error(`Error: --tag format must be 'name:value', got '${tagStr}'`);
        process.exit(1);
      }
      const colonIndex = tagStr.indexOf(':');
      const tagName = tagStr.slice(0, colonIndex).trim();
      const tagValue = tagStr.slice(colonIndex + 1).trim();
      
      if (!tagName || !tagValue) {
        console.error(`Error: --tag format must have non-empty name and value, got '${tagStr}'`);
        process.exit(1);
      }
      
      if (!result.queryTags) {
        result.queryTags = [];
      }
      
      // Find existing tag with same name or create new one
      const existingTag = result.queryTags.find(t => t.name === tagName);
      if (existingTag) {
        existingTag.values.push(tagValue);
      } else {
        result.queryTags.push({ name: tagName, values: [tagValue] });
      }
      i++;
    } else if (arg === '--block-min') {
      const blockMinStr = requireFlagValue('--block-min');
      result.queryBlockMin = parseInt(blockMinStr, 10);
      i++;
    } else if (arg === '--block-max') {
      const blockMaxStr = requireFlagValue('--block-max');
      result.queryBlockMax = parseInt(blockMaxStr, 10);
      i++;
    } else if (arg === '--sort') {
      const sortVal = requireFlagValue('--sort');
      if (sortVal === 'HEIGHT_DESC' || sortVal === 'HEIGHT_ASC') {
        result.querySort = sortVal;
      } else {
        console.error(`Error: --sort must be 'HEIGHT_DESC' or 'HEIGHT_ASC', got '${sortVal}'`);
        process.exit(1);
      }
      i++;
    } else if (arg === '--limit') {
      const limitStr = requireFlagValue('--limit');
      result.queryLimit = parseInt(limitStr, 10);
      i++;
    } else if (arg === '--graphql-endpoint') {
      result.graphqlEndpoint = requireFlagValue('--graphql-endpoint');
      i++;
    } else if (arg.startsWith('--')) {
      // Unknown flag - warn but continue
      console.error(`Warning: Unknown flag '${arg}'. Use --help for usage.`);
      i++;
    } else {
      positional.push(arg);
      i++;
    }
  }

  // Validate --ttl is a finite positive integer
  if (!Number.isFinite(result.ttl) || result.ttl <= 0 || !Number.isInteger(result.ttl)) {
    console.error('Error: --ttl must be a positive integer');
    process.exit(1);
  }

  // Validate query flags
  if (result.queryBlockMin !== undefined) {
    if (!Number.isFinite(result.queryBlockMin) || !Number.isInteger(result.queryBlockMin)) {
      console.error('Error: --block-min must be an integer');
      process.exit(1);
    }
  }

  if (result.queryBlockMax !== undefined) {
    if (!Number.isFinite(result.queryBlockMax) || !Number.isInteger(result.queryBlockMax)) {
      console.error('Error: --block-max must be an integer');
      process.exit(1);
    }
  }

  if (result.queryBlockMin !== undefined && result.queryBlockMax !== undefined) {
    if (result.queryBlockMin > result.queryBlockMax) {
      console.error('Error: --block-min must be less than or equal to --block-max');
      process.exit(1);
    }
  }

  if (result.queryLimit !== undefined) {
    if (!Number.isFinite(result.queryLimit) || !Number.isInteger(result.queryLimit) || result.queryLimit < 0) {
      console.error('Error: --limit must be a non-negative integer');
      process.exit(1);
    }
  }

  // First positional is the command
  if (positional.length > 0) {
    result.command = positional[0];
  }

  // Second positional is the target (file/dir/txId)
  if (positional.length > 1) {
    result.target = positional[1];
  }

  // Third positional is the name (for attach command)
  if (positional.length > 2) {
    result.name = positional[2];
  }

  return result;
}

function showHelp(): void {
  console.log(`
Arweave Skill Tool

Usage:
  arweave-skill <command> [options]

Commands:
  upload <file>                       Upload a file to Arweave
  upload-site <dir> [--index file]    Upload a directory as a static site
  attach <txId> <name>                Attach an ArNS name to a transaction
  query                               Query transactions from Arweave GraphQL

Options:
  --wallet <path>       Path to Arweave wallet keyfile (JWK json)
  --index <file>        Index file for site uploads (default: index.html)
  --ttl <seconds>       TTL for ArNS name (default: 3600)
  --network <net>       Network: mainnet or testnet (default: mainnet)
  --ario-process <id>   ARIO process ID (overrides --network)
                        Can be: mainnet, testnet, or a process ID
  --force               Continue upload-site even if index file is missing
  --yes, -y             Skip confirmation prompts
  --dry-run             Estimate cost without uploading
  --help, -h            Show this help message

Wallet Detection (in order):
  1. --wallet flag (explicit path)
  2. ARWEAVE_WALLET environment variable
  3. ~/.arweave/wallet.json (default location)
  4. Interactive onboarding (create new wallet)

Environment:
  ARWEAVE_WALLET        Path to wallet keyfile (alternative to --wallet)

Examples:
  arweave-skill upload ./file.md --wallet ./wallet.json
  arweave-skill upload ./file.md --wallet ./wallet.json --dry-run
  arweave-skill upload-site ./dist --wallet ./wallet.json
  arweave-skill upload-site ./dist --wallet ./wallet.json --dry-run
  arweave-skill attach <txId> myname --network mainnet --wallet ./wallet.json
  arweave-skill attach <txId> sub_myname --ario-process testnet --wallet ./wallet.json --yes
  arweave-skill query --owner <address> --limit 5
  arweave-skill query --tag App-Name:MyApp --tag Type:post --block-min 1000000
  arweave-skill query --ids <txId1>,<txId2>,<txId3>
  arweave-skill query --owner <address> --graphql-endpoint https://arweave.net/graphql
`);
}

async function promptForInput(prompt: string): Promise<string> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(prompt, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

function validateWallet(walletPath: string): ArweaveJWK {
  // Check file exists
  if (!fs.existsSync(walletPath)) {
    throw new Error(`Wallet file not found: ${walletPath}`);
  }

  // Read and parse JSON
  let walletData: unknown;
  try {
    const content = fs.readFileSync(walletPath, 'utf-8');
    walletData = JSON.parse(content);
  } catch (err) {
    throw new Error(`Failed to parse wallet file as JSON: ${walletPath}`);
  }

  // Validate JWK structure
  if (
    typeof walletData !== 'object' ||
    walletData === null ||
    !('kty' in walletData) ||
    !('n' in walletData)
  ) {
    throw new Error(
      'Invalid Arweave wallet: missing required JWK properties (kty, n)'
    );
  }

  return walletData as ArweaveJWK;
}

// Helper: Format bytes to human-readable
function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(2)} ${units[i]}`;
}

// Helper: Format winstons to AR
function formatWinstons(winstons: bigint | number): string {
  const ar = Number(winstons) / 1e12;
  return `${ar.toFixed(9)} AR`;
}

// Default wallet location
const DEFAULT_WALLET_DIR = path.join(os.homedir(), '.arweave');
const DEFAULT_WALLET_PATH = path.join(DEFAULT_WALLET_DIR, 'wallet.json');

/**
 * Detect user's shell configuration file
 */
function detectShellConfig(): string {
  const shell = process.env.SHELL || '/bin/bash';
  const homeDir = os.homedir();
  
  if (shell.includes('zsh')) {
    return path.join(homeDir, '.zshrc');
  } else if (shell.includes('bash')) {
    return path.join(homeDir, '.bashrc');
  } else if (shell.includes('fish')) {
    return path.join(homeDir, '.config', 'fish', 'config.fish');
  }
  
  // Default to bashrc
  return path.join(homeDir, '.bashrc');
}

/**
 * Check if wallet path is already configured in shell config
 */
function isWalletInShellConfig(shellConfigPath: string, walletPath: string): boolean {
  if (!fs.existsSync(shellConfigPath)) {
    return false;
  }
  
  const content = fs.readFileSync(shellConfigPath, 'utf-8');
  const exportLine = `export ARWEAVE_WALLET="${walletPath}"`;
  return content.includes(exportLine);
}

/**
 * Add wallet path to shell configuration
 */
function addWalletToShellConfig(walletPath: string): void {
  const shellConfigPath = detectShellConfig();
  
  if (isWalletInShellConfig(shellConfigPath, walletPath)) {
    console.log(`  Wallet path already configured in ${shellConfigPath}`);
    return;
  }
  
  const exportLine = `\n# Arweave wallet path\nexport ARWEAVE_WALLET="${walletPath}"\n`;
  fs.appendFileSync(shellConfigPath, exportLine);
  
  console.log(`\n  Added to ${path.basename(shellConfigPath)}:`);
  console.log(`    export ARWEAVE_WALLET="${walletPath}"`);
  console.log(`\n  Run 'source ~/${path.basename(shellConfigPath)}' or restart your terminal to persist.`);
}

/**
 * Generate a new Arweave wallet
 */
async function generateWallet(): Promise<ArweaveJWK> {
  const arweave = Arweave.init({});
  const wallet = await arweave.wallets.generate();
  // Cast to ArweaveJWK - the generated wallet has all required JWK fields
  return wallet as unknown as ArweaveJWK;
}

/**
 * Save wallet to file with proper permissions
 */
function saveWallet(wallet: ArweaveJWK, walletPath: string): void {
  // Create directory if it doesn't exist
  const dir = path.dirname(walletPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  }
  
  // Write wallet file with restricted permissions
  fs.writeFileSync(walletPath, JSON.stringify(wallet, null, 2), { mode: 0o600 });
  
  console.log(`\n  Wallet created: ${walletPath}`);
}

/**
 * Run wallet onboarding flow
 */
async function runWalletOnboarding(): Promise<ArweaveJWK> {
  console.log('\n🔐 No Arweave wallet found.\n');
  console.log('An Arweave wallet is required to sign transactions on the permaweb.');
  console.log('');
  console.log('Options:');
  console.log('  1. Create a new wallet (recommended for new users)');
  console.log('  2. Specify an existing wallet path');
  console.log('  3. Set ARWEAVE_WALLET environment variable and retry');
  console.log('');
  
  const choice = await promptForInput('Choose [1-3]: ');
  
  switch (choice.trim()) {
    case '1': {
      console.log('\n  Creating new wallet...');
      
      // Generate wallet
      const wallet = await generateWallet();
      
      // Determine wallet path
      let walletPath = DEFAULT_WALLET_PATH;
      const customPath = await promptForInput(`  Store at [${walletPath}]: `);
      if (customPath.trim()) {
        walletPath = customPath.trim().startsWith('~') 
          ? path.join(os.homedir(), customPath.trim().slice(1))
          : path.resolve(customPath.trim());
      }
      
      // Save wallet
      saveWallet(wallet, walletPath);
      
      // Add to shell config
      addWalletToShellConfig(walletPath);
      
      // Security warnings
      console.log('\n⚠️  IMPORTANT SECURITY WARNINGS:');
      console.log('   ┌──────────────────────────────────────────────────────────┐');
      console.log('   │  1. BACKUP YOUR WALLET                                   │');
      console.log('   │     Store a secure backup in a password manager or      │');
      console.log('   │     offline storage. If you lose this file, your AR is  │');
      console.log('   │     GONE FOREVER.                                         │');
      console.log('   │                                                          │');
      console.log('   │  2. NEVER COMMIT TO GIT                                   │');
      console.log('   │     Add wallet.json to your .gitignore file.            │');
      console.log('   │     Anyone with access to your wallet can spend your AR. │');
      console.log('   │                                                          │');
      console.log('   │  3. KEEP IT PRIVATE                                      │');
      console.log('   │     Never share your wallet file or its contents.        │');
      console.log('   └──────────────────────────────────────────────────────────┘');
      console.log('');
      
      // Add to gitignore
      const gitignorePath = path.join(process.cwd(), '.gitignore');
      if (fs.existsSync(gitignorePath)) {
        const gitignore = fs.readFileSync(gitignorePath, 'utf-8');
        if (!gitignore.includes('wallet.json') && !gitignore.includes(path.basename(walletPath))) {
          fs.appendFileSync(gitignorePath, `\n# Arweave wallets\n${path.basename(walletPath)}\n`);
          console.log(`  Added ${path.basename(walletPath)} to .gitignore`);
        }
      }
      
      // Set environment variable for current process
      process.env.ARWEAVE_WALLET = walletPath;
      
      return wallet;
    }
    
    case '2': {
      const walletPath = await promptForInput('  Path to wallet file: ');
      if (!walletPath.trim()) {
        throw new Error('No wallet path provided');
      }
      
      const resolvedPath = walletPath.trim().startsWith('~')
        ? path.join(os.homedir(), walletPath.trim().slice(1))
        : path.resolve(walletPath.trim());
      
      const wallet = validateWallet(resolvedPath);
      
      // Optionally add to shell config
      const addToShell = await promptForInput('  Add to shell config for future sessions? [Y/n]: ');
      if (addToShell.toLowerCase() !== 'n') {
        addWalletToShellConfig(resolvedPath);
        process.env.ARWEAVE_WALLET = resolvedPath;
      }
      
      return wallet;
    }
    
    case '3': {
      console.log('\n  Set ARWEAVE_WALLET and run again:');
      console.log('    export ARWEAVE_WALLET="/path/to/wallet.json"');
      console.log('    # Or add to your ~/.bashrc or ~/.zshrc:');
      console.log('    echo \'export ARWEAVE_WALLET="/path/to/wallet.json"\' >> ~/.bashrc');
      console.log('    source ~/.bashrc');
      process.exit(1);
    }
    
    default:
      console.log('Invalid choice.');
      process.exit(1);
  }
  
  // Should not reach here
  throw new Error('Wallet onboarding failed');
}

/**
 * Detect wallet path from multiple sources
 */
function detectWalletPath(cliWalletPath: string | null): string | null {
  // 1. CLI argument takes precedence
  if (cliWalletPath) {
    return path.resolve(cliWalletPath);
  }
  
  // 2. Environment variable
  if (process.env.ARWEAVE_WALLET) {
    return path.resolve(process.env.ARWEAVE_WALLET);
  }
  
  // 3. Default location
  if (fs.existsSync(DEFAULT_WALLET_PATH)) {
    return DEFAULT_WALLET_PATH;
  }
  
  return null;
}

// Helper: Get directory size recursively
function getDirectorySize(dirPath: string): number {
  let totalSize = 0;
  const entries = fs.readdirSync(dirPath, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      totalSize += getDirectorySize(fullPath);
    } else if (entry.isFile()) {
      totalSize += fs.statSync(fullPath).size;
    }
  }
  return totalSize;
}

// Helper: Count files in directory recursively
function countFiles(dirPath: string): number {
  let count = 0;
  const entries = fs.readdirSync(dirPath, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      count += countFiles(fullPath);
    } else if (entry.isFile()) {
      count++;
    }
  }
  return count;
}

// Helper: Estimate Turbo upload cost
async function estimateTurboCost(bytes: number): Promise<{ winstons: bigint; ar: string }> {
  // Turbo pricing: roughly 1 winston per byte, with minimums
  // Actual pricing is fetched from the Turbo node, but we can estimate
  // Based on typical Arweave rates: ~0.000001 AR per KB for small files
  // Turbo often has a free tier up to ~120KB
  const FREE_TIER_BYTES = 120 * 1024; // 120 KB
  
  let winstons: bigint;
  if (bytes <= FREE_TIER_BYTES) {
    // Free tier (Turbo may still charge 1 winston minimum)
    winstons = BigInt(1);
  } else {
    // Estimate based on ~$0.0000001 per byte (varies with AR price)
    // This is a rough estimate; actual pricing comes from Turbo API
    const bytesOverFree = bytes - FREE_TIER_BYTES;
    // Approximate: 100 winstons per byte above free tier
    winstons = BigInt(Math.ceil(bytesOverFree * 100));
  }
  
  const ar = Number(winstons) / 1e12;
  return { winstons, ar: `${ar.toFixed(9)} AR` };
}

async function resolveWallet(cliWalletPath: string | null): Promise<ArweaveJWK> {
  // Try to detect wallet from all sources
  const walletPath = detectWalletPath(cliWalletPath);
  
  if (walletPath) {
    // Wallet found, validate and return
    return validateWallet(walletPath);
  }
  
  // No wallet found - run onboarding flow
  return runWalletOnboarding();
}

async function resolveWalletNonInteractive(cliWalletPath: string | null): Promise<ArweaveJWK | null> {
  // Non-interactive version for --dry-run and query commands
  const walletPath = detectWalletPath(cliWalletPath);
  
  if (walletPath) {
    return validateWallet(walletPath);
  }
  
  return null;
}

async function handleUpload(args: ParsedArgs): Promise<void> {
  if (!args.target) {
    console.error('Error: upload requires a file path');
    process.exit(1);
  }

  // Resolve the file path
  const filePath = path.resolve(args.target);
  
  // Verify file exists
  if (!fs.existsSync(filePath)) {
    console.error(`Error: File not found: ${filePath}`);
    process.exit(1);
  }

  // Verify it's a file, not a directory
  const stats = fs.statSync(filePath);
  if (stats.isDirectory()) {
    console.error('Error: Path is a directory. Use upload-site for directories.');
    process.exit(1);
  }

  const fileSize = stats.size;

  // Dry-run: estimate cost without uploading
  if (args.dryRun) {
    console.log(`[DRY RUN] File upload estimate:`);
    console.log(`  File: ${filePath}`);
    console.log(`  Size: ${formatBytes(fileSize)}`);
    
    const estimate = await estimateTurboCost(fileSize);
    console.log(`  Estimated cost: ${estimate.ar}`);
    
    // Free tier check
    const FREE_TIER_BYTES = 120 * 1024;
    if (fileSize <= FREE_TIER_BYTES) {
      console.log(`  Note: File may qualify for Turbo free tier (<= 120 KB)`);
    }
    
    console.log('');
    console.log('Run without --dry-run to upload.');
    return;
  }

  const wallet = await resolveWallet(args.wallet);
  
  console.log(`Uploading file: ${filePath}`);

  // Initialize arx and upload
  const arx = new NodeARx({
    token: 'arweave',
    url: 'https://turbo.ardrive.io',
    key: wallet,
  });

  await arx.ready();

  const result = await arx.uploadFile(filePath);
  const txId = result.id;

  console.log('');
  console.log('Upload successful!');
  console.log(`  Transaction ID: ${txId}`);
  console.log(`  Gateway URL: https://arweave.net/${txId}`);
}

async function handleUploadSite(args: ParsedArgs): Promise<void> {
  if (!args.target) {
    console.error('Error: upload-site requires a directory path');
    process.exit(1);
  }

  // Resolve the directory path
  const dirPath = path.resolve(args.target);

  // Verify directory exists
  if (!fs.existsSync(dirPath)) {
    console.error(`Error: Directory not found: ${dirPath}`);
    process.exit(1);
  }

  // Verify it's a directory
  const stats = fs.statSync(dirPath);
  if (!stats.isDirectory()) {
    console.error('Error: Path is not a directory. Use upload for single files.');
    process.exit(1);
  }

  // Check if index file exists
  let indexFile = args.index;
  const indexPath = path.join(dirPath, indexFile);
  if (!fs.existsSync(indexPath)) {
    // Try to find a default index file
    const defaultIndexes = ['index.html', 'index.htm'];
    const found = defaultIndexes.find(f => fs.existsSync(path.join(dirPath, f)));
    if (found) {
      indexFile = found;
    } else if (args.force) {
      // --force: warn but continue
      console.warn(`Warning: Index file '${indexFile}' not found in directory (continuing due to --force)`);
    } else {
      // No --force: fail fast
      console.error(`Error: Index file '${indexFile}' not found in directory`);
      console.error(`  Use --force to upload anyway, or --index to specify a different index file`);
      process.exit(1);
    }
  }

  // Calculate directory size and file count
  const totalSize = getDirectorySize(dirPath);
  const fileCount = countFiles(dirPath);

  // Dry-run: estimate cost without uploading
  if (args.dryRun) {
    console.log(`[DRY RUN] Site upload estimate:`);
    console.log(`  Directory: ${dirPath}`);
    console.log(`  Files: ${fileCount}`);
    console.log(`  Total size: ${formatBytes(totalSize)}`);
    console.log(`  Index file: ${indexFile}`);
    
    const estimate = await estimateTurboCost(totalSize);
    console.log(`  Estimated cost: ${estimate.ar}`);
    
    // Free tier check
    const FREE_TIER_BYTES = 120 * 1024;
    if (totalSize <= FREE_TIER_BYTES) {
      console.log(`  Note: Site may qualify for Turbo free tier (<= 120 KB total)`);
    } else {
      console.log(`  Note: Estimate is approximate. Actual cost may vary.`);
    }
    
    console.log('');
    console.log('Run without --dry-run to upload.');
    return;
  }

  const wallet = await resolveWallet(args.wallet);

  console.log(`Uploading site: ${dirPath}`);
  console.log(`  Index file: ${indexFile}`);

  // Initialize arx and upload folder
  const arx = new NodeARx({
    token: 'arweave',
    url: 'https://turbo.ardrive.io',
    key: wallet,
  });

  await arx.ready();

  const result = await arx.uploadFolder(dirPath, { indexFile });
  if (!result || !result.id) {
    throw new Error('Upload failed: no transaction ID returned');
  }
  const txId = result.id;

  console.log('');
  console.log('Site upload successful!');
  console.log(`  Manifest Transaction ID: ${txId}`);
  console.log(`  Gateway URL: https://arweave.net/${txId}`);
}

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`${label} timed out after ${ms / 1000}s`)), ms)
    ),
  ]);
}

async function handleAttach(args: ParsedArgs): Promise<void> {
  if (!args.target) {
    console.error('Error: attach requires a transaction ID');
    process.exit(1);
  }

  if (!args.name) {
    console.error('Error: attach requires a name');
    process.exit(1);
  }

  const wallet = await resolveWallet(args.wallet);
  const txId = args.target;
  let name = args.name;

  // Strip .ar.io suffix if present
  if (name.endsWith('.ar.io')) {
    name = name.slice(0, -6);
  }

  // Parse undername vs base name
  // Format: undername_basename (e.g., hello_rakis)
  let baseName: string;
  let undername: string | null = null;

  if (name.includes('_')) {
    const parts = name.split('_');
    undername = parts[0];
    baseName = parts.slice(1).join('_');
  } else {
    baseName = name;
  }

  // Determine ARIO process ID (using exported constants from @ar.io/sdk)

  let arioProcessId: string;
  let networkLabel: string;

  if (args.arioProcess) {
    // --ario-process overrides --network
    if (args.arioProcess === 'mainnet') {
      arioProcessId = ARIO_MAINNET_PROCESS_ID;
      networkLabel = 'mainnet';
    } else if (args.arioProcess === 'testnet') {
      arioProcessId = ARIO_TESTNET_PROCESS_ID;
      networkLabel = 'testnet';
    } else {
      arioProcessId = args.arioProcess;
      networkLabel = `custom (${args.arioProcess.slice(0, 8)}...)`;
    }
  } else {
    // Use --network flag
    if (args.network === 'testnet') {
      arioProcessId = ARIO_TESTNET_PROCESS_ID;
      networkLabel = 'testnet';
    } else {
      arioProcessId = ARIO_MAINNET_PROCESS_ID;
      networkLabel = 'mainnet';
    }
  }

  console.log(`Attaching transaction to ArNS name`);
  console.log(`  Network: ${networkLabel}`);
  console.log(`  Transaction ID: ${txId}`);
  console.log(`  Base name: ${baseName}`);
  if (undername) {
    console.log(`  Undername: ${undername}`);
  }
  console.log(`  TTL: ${args.ttl} seconds`);

  // Confirmation prompt unless --yes
  if (!args.yes) {
    const confirm = await promptForInput(`This will update a ${networkLabel} ArNS record. Continue? (y/N): `);
    if (confirm.toLowerCase() !== 'y' && confirm.toLowerCase() !== 'yes') {
      console.log('Aborted.');
      process.exit(0);
    }
  }

  // Configure AO connection with reliable endpoints (permaweb-deploy pattern)
  const ao = connect({
    CU_URL: 'https://cu.ardrive.io',
    MU_URL: 'https://mu.ao-testnet.xyz',
    MODE: 'legacy',
  });

  // Initialize signer
  const signer = new ArweaveSigner(wallet);

  // Initialize ARIO with configured AO
  const ario = ARIO.init({
    signer,
    process: new AOProcess({ processId: arioProcessId, ao }),
  });

  // Get ArNS record to find the ANT process ID (with timeout)
  console.log(`\nLooking up ArNS record for '${baseName}'...`);
  
  let arnsRecord;
  try {
    arnsRecord = await withTimeout(
      ario.getArNSRecord({ name: baseName }),
      60000,
      `ArNS lookup for '${baseName}' on ${networkLabel}`
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`Error: ${msg}`);
    console.error(`  Network: ${networkLabel}`);
    console.error(`  ARIO Process: ${arioProcessId}`);
    console.error(`  Tip: Try a different --network or --ario-process`);
    process.exit(1);
  }

  if (!arnsRecord) {
    console.error(`Error: ArNS name '${baseName}' not found on ${networkLabel}`);
    process.exit(1);
  }

  console.log(`  Found ANT process: ${arnsRecord.processId}`);

  // Initialize ANT with configured AO (need to pass ao for fast endpoints)
  const ant = ANT.init({
    signer,
    process: new AOProcess({ processId: arnsRecord.processId, ao }),
  });

  // Update record - use '@' for base record, undername for undernames
  console.log('Updating record...');
  const recordUndername = undername || '@';

  try {
    await withTimeout(
      ant.setRecord({
        undername: recordUndername,
        transactionId: txId,
        ttlSeconds: args.ttl,
      }),
      90000,
      `ANT setRecord on ${networkLabel}`
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`Error: ${msg}`);
    console.error(`  Network: ${networkLabel}`);
    console.error(`  ANT Process: ${arnsRecord.processId}`);
    process.exit(1);
  }

  console.log('');
  console.log('ArNS record updated successfully!');
  if (undername) {
    console.log(`  ${undername}_${baseName}.arweave.net now points to ${txId}`);
  } else {
    console.log(`  ${baseName}.arweave.net now points to ${txId}`);
  }
}

async function handleQuery(args: ParsedArgs): Promise<void> {
  // Validate that at least one filter is provided
  const hasFilter = 
    (args.queryIds && args.queryIds.length > 0) ||
    (args.queryOwners && args.queryOwners.length > 0) ||
    (args.queryRecipients && args.queryRecipients.length > 0) ||
    (args.queryTags && args.queryTags.length > 0) ||
    args.queryBlockMin !== undefined ||
    args.queryBlockMax !== undefined;

  if (!hasFilter) {
    console.error('Error: query requires at least one filter');
    console.error('  Use --ids, --owner, --recipient, --tag, --block-min, or --block-max');
    process.exit(1);
  }

  // Build QueryParams object from parsed args
  const queryParams: QueryParams = {};

  if (args.queryIds && args.queryIds.length > 0) {
    queryParams.ids = args.queryIds;
  }

  if (args.queryOwners && args.queryOwners.length > 0) {
    queryParams.owners = args.queryOwners;
  }

  if (args.queryRecipients && args.queryRecipients.length > 0) {
    queryParams.recipients = args.queryRecipients;
  }

  if (args.queryTags && args.queryTags.length > 0) {
    queryParams.tags = args.queryTags;
  }

  if (args.queryBlockMin !== undefined) {
    queryParams.blockMin = args.queryBlockMin;
  }

  if (args.queryBlockMax !== undefined) {
    queryParams.blockMax = args.queryBlockMax;
  }

  if (args.querySort) {
    queryParams.sort = args.querySort;
  }

  if (args.queryLimit !== undefined) {
    queryParams.limit = args.queryLimit;
  }

  if (args.graphqlEndpoint) {
    queryParams.endpointOverride = args.graphqlEndpoint;
  }

  try {
    // Call queryTransactions (progress feedback goes to stderr)
    const transactions = await queryTransactions(queryParams);

    // Format results as pretty JSON to stdout
    const output = {
      query: queryParams,
      results: {
        total: transactions.length,
        transactions: transactions,
      },
    };

    console.log(JSON.stringify(output, null, 2));
    process.exit(0);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);

    // Handle specific error types with clear messages
    if (message.includes('timed out')) {
      console.error(`Error: Query timed out`);
      console.error(`  ${message}`);
      console.error(`  Tip: Try narrowing your query filters or reducing --limit`);
    } else if (message.includes('GraphQL error')) {
      console.error(`Error: ${message}`);
      console.error(`  Tip: Check your filter values (IDs, addresses, tags)`);
    } else if (message.includes('Failed to query Arweave GraphQL')) {
      console.error(`Error: Unable to reach Arweave GraphQL endpoints`);
      console.error(`  ${message}`);
      console.error(`  Tip: Check your internet connection or try --graphql-endpoint with a custom gateway`);
    } else if (message.includes('Failed to reach')) {
      console.error(`Error: Network error`);
      console.error(`  ${message}`);
      console.error(`  Tip: Check your internet connection`);
    } else {
      console.error(`Error: ${message}`);
    }

    process.exit(1);
  }
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));

  if (args.help || !args.command) {
    showHelp();
    process.exit(args.help ? 0 : 1);
  }

  try {
    switch (args.command) {
      case 'upload':
        await handleUpload(args);
        break;

      case 'upload-site':
        await handleUploadSite(args);
        break;

      case 'attach':
        await handleAttach(args);
        break;

      case 'query':
        await handleQuery(args);
        break;

      default:
        console.error(`Unknown command: ${args.command}`);
        showHelp();
        process.exit(1);
    }
  } catch (err) {
    console.error(`Error: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  }
}

main();
