import * as esbuild from 'esbuild';

// Build as CJS first, then wrap with ESM shim
await esbuild.build({
  entryPoints: ['src/index.ts'],
  bundle: true,
  platform: 'node',
  target: 'node18',
  format: 'esm',
  outfile: 'skills/arweave/index.mjs',
  minify: true,
  banner: {
    // Create require() for ESM context - needed for bundled CJS dependencies
    js: `#!/usr/bin/env node
import { createRequire as __createRequire } from 'module';
import { fileURLToPath as __fileURLToPath } from 'url';
import { dirname as __dirname_fn } from 'path';
const require = __createRequire(import.meta.url);
const __filename = __fileURLToPath(import.meta.url);
const __dirname = __dirname_fn(__filename);
`,
  },
});

console.log('Build complete: skills/arweave/index.mjs');
