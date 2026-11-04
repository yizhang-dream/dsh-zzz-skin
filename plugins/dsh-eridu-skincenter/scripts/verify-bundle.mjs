#!/usr/bin/env node
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { formatBytes, verifyBundle } from './lib/bundle-core.mjs';

const PACKAGE_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..');

try {
  const result = verifyBundle({ packageDir: PACKAGE_DIR });
  console.log(`verify-bundle OK: ${result.fileCount} files, ${formatBytes(result.totalBytes)}, `
    + `skins ${result.skins.map((skin) => skin.id).join(', ')}, avatars ${result.avatars.count}`);
} catch (error) {
  console.error(`verify-bundle failed: ${error.message}`);
  process.exitCode = 1;
}
