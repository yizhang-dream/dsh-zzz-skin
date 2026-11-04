#!/usr/bin/env node
// Import already-prepared custom skin directories into a DSH home.
// This is for optional local resources such as the 37 original-video skins.
// They are deliberately NOT part of the npm package.
//
// Safety contract:
//   - only managed IDs (zzz-zenless, zzz-console, zzz-eridu-01..37)
//   - never deletes files or directories in the target
//   - never overwrites an existing target file unless --replace is passed
//   - no network, no ffmpeg, no activation/state changes
import { copyFileSync, existsSync, lstatSync, mkdirSync, readdirSync, realpathSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { MANAGED_IDS, findSourceRoot, readJson } from './lib/bundle-core.mjs';

const PACKAGE_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SKIP_DIRS = new Set(['.git', 'node_modules', 'temp']);
const SKIP_FILES = new Set(['active.json', 'eridu-avatar.json', 'eridu-skins.json', 'skin-center-active.json']);

function usage() {
  return `Usage:
  node scripts/import-custom-skins.mjs --from <prepared-skins-dir> [options]

Options:
  --from <dir>       Directory containing prepared skin directories (required unless
                     the source repo's build/skins exists).
  --to <dir>         Target skins directory. Default: $DSH_HOME/skins or ~/.dsh/skins.
  --ids <list>       Comma-separated managed IDs, e.g. zzz-eridu-01,zzz-eridu-02.
                     Default: every managed ID present in --from.
  --replace          Allow overwriting files that already exist in the target.
                     Files absent from the source are still never deleted.
  --dry-run          Report actions without writing.
  -h, --help         Show this help.

Managed IDs: ${MANAGED_IDS.join(', ')}

The 37 original-video cards stay local. Build them separately from your own
prepared assets, then import them here. npm never ships videos.`;
}

function parseArgs(argv) {
  const out = { replace: false, dryRun: false, help: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const take = (name) => {
      const value = argv[i + 1];
      if (!value || value.startsWith('--')) throw new Error(`${name} needs a value`);
      i += 1;
      return value;
    };
    if (arg === '--from') out.from = take('--from');
    else if (arg === '--to' || arg === '--target') out.to = take(arg);
    else if (arg === '--ids') out.ids = take('--ids');
    else if (arg === '--replace') out.replace = true;
    else if (arg === '--dry-run') out.dryRun = true;
    else if (arg === '-h' || arg === '--help') out.help = true;
    else throw new Error(`unknown argument: ${arg}`);
  }
  return out;
}

function defaultSource() {
  const sourceRoot = findSourceRoot(PACKAGE_DIR);
  return sourceRoot ? join(sourceRoot, 'build', 'skins') : null;
}

function assertManaged(id) {
  if (!MANAGED_IDS.includes(id)) {
    throw new Error(`refusing unmanaged skin ID "${id}". Managed IDs: ${MANAGED_IDS.join(', ')}`);
  }
}

function collectFiles(root) {
  const files = [];
  const walk = (dir, rel = '') => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const childRel = rel ? `${rel}/${entry.name}` : entry.name;
      const abs = join(root, childRel);
      if (entry.isSymbolicLink()) {
        console.warn(`skip symlink: ${childRel}`);
        continue;
      }
      if (entry.isDirectory()) {
        if (SKIP_DIRS.has(entry.name.toLowerCase())) continue;
        walk(abs, childRel);
      } else if (entry.isFile()) {
        if (SKIP_FILES.has(entry.name.toLowerCase())) continue;
        files.push(childRel);
      }
    }
  };
  walk(root);
  return files.sort();
}

function assertTargetPath(root, dest) {
  const rel = relative(root, dest);
  if (isAbsolute(rel) || rel === '..' || rel.startsWith(`..${sep}`) || resolve(root, rel) !== dest) throw new Error(`unsafe target: ${dest}`);
  let current = root;
  for (const part of rel.split(sep)) {
    current = join(current, part);
    try {
      if (lstatSync(current).isSymbolicLink()) throw new Error(`refusing target symlink: ${current}`);
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
  }
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(usage());
    return;
  }

  const from = resolve(args.from || defaultSource() || '');
  if (!args.from && !defaultSource()) throw new Error('--from is required (no source-repo build/skins found)');
  if (!existsSync(from) || !lstatSync(from).isDirectory()) throw new Error(`source directory not found: ${from}`);

  const dshHome = process.env.DSH_HOME || join(homedir(), '.dsh');
  const target = resolve(args.to || join(dshHome, 'skins'));
  const to = existsSync(target) ? realpathSync(target) : target;
  const fromReal = realpathSync(from);
  const nested = relative(fromReal, to);
  if (!nested || (!isAbsolute(nested) && nested !== '..' && !nested.startsWith(`..${sep}`))) throw new Error('target must be outside the source directory');

  let selected;
  if (args.ids) {
    selected = args.ids.split(',').map((id) => id.trim()).filter(Boolean);
    for (const id of selected) assertManaged(id);
  } else {
    selected = MANAGED_IDS.filter((id) => existsSync(join(from, id, 'skin.json')));
  }
  if (!selected.length) throw new Error(`no managed skin directories found in ${from}`);

  const summary = { imported: 0, skipped: 0, skins: [] };
  for (const id of selected) {
    assertManaged(id);
    const skinDir = join(from, id);
    if (!existsSync(skinDir) || !lstatSync(skinDir).isDirectory()) throw new Error(`${id}: source must be a real directory`);
    const manifestPath = join(skinDir, 'skin.json');
    if (!existsSync(manifestPath) || !lstatSync(manifestPath).isFile()) throw new Error(`${id}: skin.json must be a real file`);
    const manifest = readJson(manifestPath);
    if (manifest.id !== id) throw new Error(`${id}: skin.json declares id ${manifest.id}`);

    const files = collectFiles(skinDir);
    let written = 0;
    let kept = 0;
    for (const rel of files) {
      const source = join(skinDir, rel);
      const dest = join(to, id, rel);
      assertTargetPath(to, dest);
      if (existsSync(dest)) {
        if (!args.replace) {
          kept += 1;
          continue;
        }
      }
      if (!args.dryRun) {
        mkdirSync(dirname(dest), { recursive: true });
        copyFileSync(source, dest);
      }
      written += 1;
    }
    summary.imported += written;
    summary.skipped += kept;
    summary.skins.push({ id, written, kept });
    console.log(`${args.dryRun ? '[dry-run] ' : ''}${id}: ${written} written, ${kept} kept (existing)`);
  }

  console.log(`${args.dryRun ? '[dry-run] ' : ''}Target: ${to}`);
  console.log(`${args.dryRun ? '[dry-run] ' : ''}Total: ${summary.imported} written, ${summary.skipped} kept`);
  if (summary.skipped && !args.replace) {
    console.log('Existing files were preserved. Re-run with --replace only if you intend to overwrite them.');
  }
}

try {
  main();
} catch (error) {
  console.error(`import-custom-skins failed: ${error.message}`);
  process.exitCode = 1;
}
