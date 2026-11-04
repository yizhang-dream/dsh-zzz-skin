#!/usr/bin/env node
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildBundle } from './lib/bundle-core.mjs';

const PACKAGE_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
let source = null;
for (let i = 0; i < args.length; i += 1) {
  if (args[i] === '--source') {
    source = args[i + 1];
    if (!source) throw new Error('--source needs a directory');
    i += 1;
  } else if (args[i] === '-h' || args[i] === '--help') {
    console.log('Usage: node scripts/build-bundle.mjs [--source <skin-source-root>]\n'
      + 'With no source tree, a complete packaged bundle is verified and reused.');
    process.exit(0);
  } else {
    throw new Error(`unknown argument: ${args[i]}`);
  }
}

try {
  buildBundle({
    packageDir: PACKAGE_DIR,
    sourceRoot: source || process.env.DSH_ZZZ_SKIN_SOURCE || null,
  });
} catch (error) {
  console.error(`build-bundle failed: ${error.message}`);
  process.exitCode = 1;
}
