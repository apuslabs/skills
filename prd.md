# Arweave Skill for `arx` + ArNS (PRD)

## Goal

Create an agent skill for a tool called `arx` (`@permaweb/arx`) that can:

- Upload a single file to Arweave.
- Upload a website directory (upload files + upload an Arweave manifest).
- Update an ArNS domain record to point to a new Arweave transaction ID.

The skill must prompt the user for the location of their Arweave wallet keyfile (JWK JSON) when it is not provided.

## Non-Goals

- Funding / buying turbo credits.
- Supporting non-Arweave tokens (ETH/SOL/POL) in the first version.
- Creating or purchasing new ArNS names.

## User Stories

1. As a user, I can say: "use arweave to upload foo.md" and receive a `txId` and gateway URL.
2. As a user, I can say: "use arweave to upload ./mywebsite" and receive the website manifest `txId` and gateway URL.
3. As a user, I can say: "use arweave to attach <txId> to hello_rakis" and have the ArNS record updated.
4. As a user, if no wallet is configured, the skill asks once for the wallet keyfile path.

## Technical Approach

Build a small TypeScript CLI wrapper that imports and uses:

- `@permaweb/arx/node` (uploads)
- `@ar.io/sdk/node` (ArNS / ANT record updates)
- `@permaweb/aoconnect` (AO network connectivity)

Bundle the CLI into a single Node-runnable file placed in:

- `skills/arweave/index.js`

Add the skill instruction file:

- `skills/arweave/SKILL.md`

## Defaults

- Node runtime: `>=18` (required by `@ar.io/sdk`).
- Bundler URL default: `https://turbo.ardrive.io` (overrideable).
- ArNS TTL default: `3600` seconds (overrideable).
- Network default: `mainnet`.

## CLI Interface

### Wallet Resolution (Required)

Resolve wallet path in this order:

1. `--wallet <path>`
2. `ARWEAVE_WALLET=<path>`
3. Prompt on stdin: `Path to Arweave wallet keyfile (JWK json):`

Validation:

- File exists.
- JSON parses.
- Looks like an Arweave JWK (e.g. has `kty`, `n`).

Security:

- Never print wallet contents.

### Commands

1. `upload <file>`
   - Verify file exists.
   - Instantiate `NodeARx` with `{ token: "arweave", url: <bundlerUrl>, key: <JWK> }` and `await arx.ready()`.
   - Call `arx.uploadFile(file)`.
   - Output: `txId` + `https://arweave.net/<txId>`.

2. `upload-site <dir> [--index index.html]`
   - Verify directory exists.
   - If `--index` omitted, auto-select `index.html` if present.
   - Call `arx.uploadFolder(dir, { indexFile })`.
   - Output: manifest `txId` + `https://arweave.net/<txId>`.

3. `attach <txId> <name> [--ttl 3600] [--network mainnet] [--ario-process <id>] [--yes]`
   - Name normalization:
     - Strip `.ar.io` suffix if present.
     - If contains `_`, interpret as undername: `hello_rakis` => undername `hello` on base `rakis`.
     - Else treat as base name record (undername `@`).
   - Network/process selection:
     - `--network mainnet|testnet` (default: `mainnet`)
     - `--ario-process <mainnet|testnet|processId>` (overrides `--network`)
     - Process IDs:
       - mainnet: `qNvAoz0TgcH7DMg8BCVn8jF32QH5L6T29VjHxhHqqGE`
       - testnet: `agYcCFJtrMG6cqMuZfskIkFTGvUPddICmtQSBIoPdiA`
   - Mainnet write safety:
     - Prompt confirmation unless `--yes`.
   - Update flow:
     - Configure AO connection with reliable endpoints:
       ```typescript
       const ao = connect({
         CU_URL: 'https://cu.ardrive.io',
         MU_URL: 'https://mu.ao-testnet.xyz',
         MODE: 'legacy',
       });
       ```
     - Initialize IO with configured AO:
       ```typescript
       const signer = new ArweaveSigner(jwk);
       const io = IO.init({
         signer,
         process: new AOProcess({ processId: arioProcessId, ao }),
       });
       ```
     - Lookup ArNS record: `const arns = await io.getArNSRecord({ name: baseName })`
     - Initialize ANT with configured AO (critical fix):
       ```typescript
       const ant = ANT.init({
         signer,
         process: new AOProcess({ processId: arns.processId, ao }),
       });
       ```
     - Update record:
       - `ant.setRecord({ undername: '@', transactionId: txId, ttlSeconds })` for base
       - `ant.setRecord({ undername, transactionId: txId, ttlSeconds })` for undername
   - Timeouts:
     - Wrap `io.getArNSRecord()` with 60s timeout
     - Wrap `ant.setRecord()` with 90s timeout
     - Clear error message on timeout with network/process info

## Skill Instructions (SKILL.md)

The skill doc will instruct the agent to:

- Map phrases to CLI invocations:
  - "use arweave to upload <file>" -> `upload`
  - "use arweave to upload <dir>" -> `upload-site`
  - "use arweave to attach <txId> to <name>" -> `attach`
- Ask for wallet path when missing.
- Report back `txId` and gateway URL.
- For site uploads, emphasize the returned `txId` is the manifest transaction ID.

Example invocations:

```sh
node skills/arweave/index.js upload "foo.md" --wallet "<path>"
node skills/arweave/index.js upload-site "./mywebsite" --index "index.html" --wallet "<path>"
node skills/arweave/index.js attach "<txId>" "hello_rakis" --ttl 3600 --network mainnet --wallet "<path>" --yes
node skills/arweave/index.js attach "<txId>" "hello_rakis" --ario-process testnet --wallet "<path>" --yes
```

## Error Handling

- Clear failures when:
  - Wallet file cannot be read/parsed.
  - Upload path is missing/invalid.
  - ArNS name does not exist (`getArNSRecord` fails).
  - Network/write fails.
  - AO lookup/write times out (with helpful message including network info).

## Build & Verification

After implementation:

1. `npm i`
2. `npm run build`
3. `node skills/arweave/index.js --help`

Verification steps:

1. Mainnet lookup (no write - answer 'n' to confirmation):
   ```sh
   node skills/arweave/index.js attach <txId> cyberpunk_rakis-me --network mainnet --wallet <path>
   ```

2. Mainnet write:
   ```sh
   node skills/arweave/index.js attach <txId> cyberpunk_rakis-me --network mainnet --yes --wallet <path>
   ```

3. Testnet behavior (should respond quickly, may not find name):
   ```sh
   node skills/arweave/index.js attach <txId> cyberpunk_rakis-me --network testnet --yes --wallet <path>
   ```

---

## Implementation Plan (ArNS Fix)

### Problem

ArNS lookups timeout because:
1. The `@ar.io/sdk` defaults may use slow/unreliable AO endpoints
2. We're not configuring the AO connection with faster CU/MU URLs
3. ANT.init() creates its own AOProcess with default `connect()` instead of our configured one

### Solution

Based on research of `permaweb/permaweb-deploy` repository patterns:

### Step 1: Add CLI Flags + Parsing

- Add to `ParsedArgs`:
  - `network: 'mainnet' | 'testnet'`
  - `arioProcess: string | null`
- Extend `parseArgs()` to parse:
  - `--network mainnet|testnet` (default `mainnet`)
  - `--ario-process <id|mainnet|testnet>` (default `null`)
- Precedence logic:
  - If `--ario-process` provided:
    - If value is `mainnet`/`testnet`, map to process id
    - Else treat as explicit process id
  - Else derive process id from `--network`

### Step 2: Add AO Connection (permaweb-deploy pattern)

- Add dependency: `@permaweb/aoconnect`
- Import: `import { connect } from '@permaweb/aoconnect';`
- In `handleAttach`, create configured AO:
  ```typescript
  const ao = connect({
    CU_URL: 'https://cu.ardrive.io',
    MU_URL: 'https://mu.ao-testnet.xyz',
    MODE: 'legacy',
  });
  ```

### Step 3: Use Configured AO for Both IO and ANT

- Determine `arioProcessId` from flags
- IO init with explicit AOProcess:
  ```typescript
  const io = IO.init({
    signer,
    process: new AOProcess({ processId: arioProcessId, ao }),
  });
  ```
- ANT init with explicit AOProcess (KEY FIX):
  ```typescript
  const ant = ANT.init({
    signer,
    process: new AOProcess({ processId: arnsRecord.processId, ao }),
  });
  ```

### Step 4: Add Hard Timeouts

- Add helper: `withTimeout(promise, ms, label)`
- Wrap `io.getArNSRecord()` with 60s timeout
- Wrap `ant.setRecord()` with 90s timeout
- Error message includes network, process id, and retry suggestions

### Step 5: Update UX/Help/Docs

- Update `showHelp()` with new flags
- Update `skills/arweave/SKILL.md` examples
- Update confirmation prompt: "This will update a <mainnet|testnet> ArNS record..."

### Step 6: Verification

1. Rebuild: `npm run build`
2. Smoke test: `node skills/arweave/index.js --help`
3. Mainnet read check (answer 'n'): test lookup works
4. Mainnet write: full attach with `--yes`
5. Testnet behavior: should respond quickly
