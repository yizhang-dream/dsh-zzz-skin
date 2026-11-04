// Build and verify the self-contained resource bundle shipped inside the npm
// package. Everything here uses Node built-ins only: no ffmpeg, no network and
// no reads from Downloads or a deployed DSH home.
import { createHash } from 'node:crypto';
import {
  copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync,
  rmSync, statSync, writeFileSync,
} from 'node:fs';
import { basename, dirname, extname, join, resolve } from 'node:path';

export const BUNDLE_SCHEMA = 'dsh-eridu-skincenter/bundle@1';
export const PACKAGE_NAME = 'dsh-eridu-skincenter';
export const BUNDLE_DIR = 'bundle';
export const BUNDLE_MANIFEST = 'bundle-manifest.json';
export const BUILTIN_IDS = ['zzz-zenless', 'zzz-console'];
export const AVATAR_GROUPS = ['avatars', 'chat-icons', 'portraits'];
export const AVATAR_COUNT = 233;
export const AVATAR_CATALOG = 'catalog.json';
export const KEYART_FILE = 'wallpaper-zzz-keyart.jpg';
export const SKIN_ASSET_FILES = [
  'avatar-agent.webp',
  'bubble-arrow-left.webp',
  'bubble-arrow-right.webp',
  'bubble-arrow-right-blue.webp',
];
export const MANAGED_IDS = Object.freeze([
  'zzz-zenless',
  'zzz-console',
  ...Array.from({ length: 37 }, (_, i) => `zzz-eridu-${String(i + 1).padStart(2, '0')}`),
]);
export const DSH_ENGINE_RANGE = '>=0.2.1-rc.2 <0.3.0';
export const SHARED_PACKAGES = Object.freeze({
  '@deepseek-ai/cordis': '^4.1.0',
  '@deepseek-ai/schemastery': '^3.19.0',
  '@deepseek-ai/dsh-client-runtime': '^0.1.1-rc.2',
  '@deepseek-ai/dsh-client-ui-slots': '^0.2.2-rc.1',
});

const SOURCE_MARKERS = [
  'skin.css',
  'patches.css',
  'skin.json',
  'variants/console-tail.css',
  'assets/avatars/catalog.json',
];
const KEYART_CANDIDATES = ['assets/keyart.jpg', 'assets/wallpaper-zzz-keyart.jpg'];
const VIDEO_EXT = new Set(['.mp4', '.mov', '.webm', '.mkv', '.avi', '.m4v']);
const STATE_NAMES = new Set([
  'active.json',
  'eridu-avatar.json',
  'eridu-skins.json',
  'skin-center-active.json',
]);

export function readJson(file) {
  return JSON.parse(readFileSync(file, 'utf8'));
}

export function writeJson(file, value) {
  writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
}

export function sha256File(file) {
  return createHash('sha256').update(readFileSync(file)).digest('hex');
}

export function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KiB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MiB`;
}

export function toPosix(value) {
  return value.split('\\').join('/');
}

export function findSourceRoot(startDir) {
  let dir = resolve(startDir);
  for (let depth = 0; depth < 8; depth += 1) {
    if (SOURCE_MARKERS.every((marker) => existsSync(join(dir, marker)))) return dir;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

export function findKeyart(sourceRoot) {
  for (const rel of KEYART_CANDIDATES) {
    if (existsSync(join(sourceRoot, rel))) return join(sourceRoot, rel);
  }
  throw new Error(`official key art missing; expected one of: ${KEYART_CANDIDATES.join(', ')}`);
}

function listFiles(root, rel = '') {
  const abs = rel ? join(root, rel) : root;
  const out = [];
  for (const entry of readdirSync(abs, { withFileTypes: true })) {
    const childRel = rel ? `${rel}/${entry.name}` : entry.name;
    if (entry.isDirectory()) out.push(...listFiles(root, childRel));
    else if (entry.isFile()) out.push(childRel);
  }
  return out.sort();
}

function copyInto(source, dest) {
  mkdirSync(dirname(dest), { recursive: true });
  copyFileSync(source, dest);
}

function describeSkin(id) {
  if (id === 'zzz-zenless') return { preview: KEYART_FILE, background: 'image' };
  if (id === 'zzz-console') return { preview: null, background: null };
  return { preview: null, background: 'video (local import only)' };
}

function assertSource(sourceRoot) {
  const required = [
    ...SOURCE_MARKERS,
    'assets/avatar-agent.webp',
    'assets/bubble-arrow-left.webp',
    'assets/bubble-arrow-right-blue.webp',
    'LICENSE',
    'NOTICE',
  ];
  for (const rel of required) {
    if (!existsSync(join(sourceRoot, rel))) throw new Error(`source tree incomplete: missing ${rel}`);
  }
  findKeyart(sourceRoot);
}

function packageNotice(packageDir, sourceRoot) {
  for (const rel of ['NOTICE', 'LICENSE']) {
    if (existsSync(join(packageDir, rel))) return join(packageDir, rel);
    if (existsSync(join(sourceRoot, rel))) return join(sourceRoot, rel);
  }
  return null;
}

function copySkinCommon(sourceRoot, packageDir, targetDir) {
  mkdirSync(join(targetDir, 'assets'), { recursive: true });
  for (const file of ['skin.css', 'patches.css']) {
    copyInto(join(sourceRoot, file), join(targetDir, file));
  }
  for (const file of ['LICENSE', 'NOTICE']) {
    const source = packageNotice(packageDir, sourceRoot);
    if (source && basename(source) === file) copyInto(source, join(targetDir, file));
    else if (existsSync(join(sourceRoot, file))) copyInto(join(sourceRoot, file), join(targetDir, file));
  }
  for (const file of SKIN_ASSET_FILES) {
    const source = join(sourceRoot, 'assets', file);
    if (existsSync(source)) copyInto(source, join(targetDir, 'assets', file));
  }
}

function buildZenless({ sourceRoot, packageDir, bundleDir, version, homepage, attribution }) {
  const skinDir = join(bundleDir, 'skins', 'zzz-zenless');
  copySkinCommon(sourceRoot, packageDir, skinDir);
  copyInto(findKeyart(sourceRoot), join(skinDir, 'assets', KEYART_FILE));

  const base = readJson(join(sourceRoot, 'skin.json'));
  const manifest = {
    ...base,
    id: 'zzz-zenless',
    name: 'ZZZ',
    nameEn: 'ZZZ',
    version,
    order: 10,
    license: 'MIT',
    sourceUrl: homepage,
    tagline: '官方主视觉静态背景 · 明暗双档 · 绳网窗体 · 代理人头像',
    description: 'ZZZ：《绝区零》主题皮肤。使用官方主视觉插画作为静态背景，'
      + '暗档黑灰圆角窗体、亮档浅色窗体，白色代理人气泡与蓝色己方气泡；'
      + '敲敲联系人按真实会话 ID 分配固定头像。设置中的 ZZZ 页面提供背景、'
      + '默认头像与会话外观选择。资源随包分发，不需要本地视频或预置皮肤目录。',
    preview: { light: KEYART_FILE, dark: KEYART_FILE },
    attribution,
    assetNotice: '游戏插画与头像素材 © miHoYo / HoYoverse，仅作非商业同人使用，'
      + '不适用 MIT 许可；详见 NOTICE。',
    contributes: {
      ...(base.contributes || {}),
      stylesheet: 'skin.css',
      patches: 'patches.css',
      backgroundMedia: {
        dark: {
          type: 'image',
          src: `assets/${KEYART_FILE}`,
          scrim: 'linear-gradient(180deg, rgba(8, 9, 22, 0.06) 0%, rgba(8, 9, 22, 0.14) 60%, rgba(8, 9, 22, 0.26) 100%)',
        },
        light: {
          type: 'image',
          src: `assets/${KEYART_FILE}`,
          scrim: 'linear-gradient(180deg, rgba(250, 250, 246, 0.12) 0%, rgba(250, 250, 246, 0.06) 16%, rgba(250, 250, 246, 0.2) 100%)',
        },
      },
    },
  };
  writeJson(join(skinDir, 'skin.json'), manifest);
}

function buildConsole({ sourceRoot, packageDir, bundleDir, version, homepage, attribution }) {
  const skinDir = join(bundleDir, 'skins', 'zzz-console');
  copySkinCommon(sourceRoot, packageDir, skinDir);

  const skinTail = `

/* ═══ §C console colorway（v1.4.0）：石墨地 / 暖纸地 ═══ */
body { background-color: #14161d; }
body[data-ds-dark-theme] { background-color: #14161d; }
body:not([data-ds-dark-theme]) { background-color: #f5f3ec; }
`;
  writeFileSync(join(skinDir, 'skin.css'),
    `${readFileSync(join(sourceRoot, 'skin.css'), 'utf8')}\n${skinTail}`);
  writeFileSync(join(skinDir, 'patches.css'),
    `${readFileSync(join(sourceRoot, 'patches.css'), 'utf8')}\n${readFileSync(join(sourceRoot, 'variants', 'console-tail.css'), 'utf8')}`);

  const base = readJson(join(sourceRoot, 'skin.json'));
  writeJson(join(skinDir, 'skin.json'), {
    $schema: base.$schema || 'https://schemas.linxin666.org/dsh-skin/v2.json',
    skinManifestVersion: 2,
    id: 'zzz-console',
    name: 'ZZZ · 观测台',
    nameEn: 'ZZZ Console',
    author: base.author || 'flower-moon',
    tagline: 'Console 材质重铸 · 石墨三阶 × 发丝线面板 × 酸绿只留给信号',
    description: '参考 Console 材质重铸：石墨三阶地、发丝线面板、无辉光无纹理无斜切无硬影，'
      + '标签去拉距转正体；保留 ZZZ 身份——酸绿信号、代理人头像、气泡旗标箭头、'
      + '己方蓝胶囊。纯石墨底色，无壁纸。',
    tags: ['zenless', 'zzz', 'console', 'graphite', 'hairline', 'quiet', 'instrument', 'dark', 'light'],
    order: 20,
    version,
    license: 'MIT',
    sourceUrl: homepage,
    preview: null,
    attribution,
    assetNotice: '游戏插画与头像素材 © miHoYo / HoYoverse，仅作非商业同人使用，'
      + '不适用 MIT 许可；详见 NOTICE。',
    contributes: {
      stylesheet: 'skin.css',
      patches: 'patches.css',
      backgroundMedia: null,
    },
  });
}

function buildAvatars(sourceRoot, bundleDir) {
  const sourceDir = join(sourceRoot, 'assets', 'avatars');
  const targetDir = join(bundleDir, 'avatars');
  const catalog = readJson(join(sourceDir, AVATAR_CATALOG));
  if (!Array.isArray(catalog) || catalog.length !== AVATAR_COUNT) {
    throw new Error(`avatar catalog must contain ${AVATAR_COUNT} entries, got ${catalog.length}`);
  }

  mkdirSync(targetDir, { recursive: true });
  copyInto(join(sourceDir, AVATAR_CATALOG), join(targetDir, AVATAR_CATALOG));

  const seen = new Set();
  const counts = Object.fromEntries(AVATAR_GROUPS.map((group) => [group, 0]));
  for (const entry of catalog) {
    if (!entry || !AVATAR_GROUPS.includes(entry.dir) || typeof entry.file !== 'string') {
      throw new Error(`avatar catalog has an invalid entry: ${JSON.stringify(entry)}`);
    }
    if (extname(entry.file).toLowerCase() !== '.webp' || entry.file.includes('/') || entry.file.includes('\\')) {
      throw new Error(`avatar catalog has an unsafe file name: ${entry.file}`);
    }
    const key = `${entry.dir}/${entry.file}`;
    if (seen.has(key)) throw new Error(`avatar catalog repeats ${key}`);
    seen.add(key);
    const source = join(sourceDir, entry.dir, entry.file);
    if (!existsSync(source)) throw new Error(`avatar catalog references missing file ${key}`);
    copyInto(source, join(targetDir, entry.dir, entry.file));
    counts[entry.dir] += 1;
  }

  const actual = [];
  for (const group of AVATAR_GROUPS) {
    const dir = join(targetDir, group);
    const files = listFiles(dir).filter((file) => extname(file).toLowerCase() === '.webp');
    if (files.length !== counts[group]) {
      throw new Error(`avatar group ${group}: catalog ${counts[group]}, copied ${files.length}`);
    }
    actual.push(...files);
  }
  if (actual.length !== AVATAR_COUNT) {
    throw new Error(`avatar bundle must contain ${AVATAR_COUNT} images, got ${actual.length}`);
  }
  return { count: catalog.length, groups: counts };
}

function cssAssetRefs(css) {
  const refs = new Set();
  const re = /url\(\s*(['"]?)assets\/([^'")]+)\1\s*\)/g;
  for (const match of css.matchAll(re)) refs.add(match[2]);
  return refs;
}

function assertCssAssets(skinDir, label) {
  for (const file of ['skin.css', 'patches.css']) {
    const abs = join(skinDir, file);
    for (const rel of cssAssetRefs(readFileSync(abs, 'utf8'))) {
      const target = join(skinDir, 'assets', rel);
      if (!existsSync(target) || !statSync(target).isFile()) {
        throw new Error(`${label}/${file} references missing assets/${rel}`);
      }
    }
  }
}

function collectBundleFiles(bundleDir) {
  return listFiles(bundleDir).filter((rel) => rel !== BUNDLE_MANIFEST);
}

function buildManifest({ bundleDir, version }) {
  const files = collectBundleFiles(bundleDir).map((rel) => {
    const abs = join(bundleDir, rel);
    return { path: rel, bytes: statSync(abs).size, sha256: sha256File(abs) };
  });
  const totalBytes = files.reduce((sum, file) => sum + file.bytes, 0);
  const skins = BUILTIN_IDS.map((id) => {
    const dir = `skins/${id}`;
    const manifest = readJson(join(bundleDir, dir, 'skin.json'));
    return {
      id,
      dir,
      version: manifest.version,
      name: manifest.name,
      ...describeSkin(id),
    };
  });
  return {
    schema: BUNDLE_SCHEMA,
    package: PACKAGE_NAME,
    packageVersion: version,
    generatedAt: new Date().toISOString(),
    skins,
    avatars: {
      dir: 'avatars',
      catalog: `avatars/${AVATAR_CATALOG}`,
      count: AVATAR_COUNT,
      groups: Object.fromEntries(AVATAR_GROUPS.map((group) => [
        group,
        readJson(join(bundleDir, 'avatars', AVATAR_CATALOG))
          .filter((entry) => entry.dir === group).length,
      ])),
    },
    fileCount: files.length,
    totalBytes,
    files,
  };
}

export function verifyPackageSurface(packageDir) {
  const pkg = readJson(join(packageDir, 'package.json'));
  if (pkg.name !== PACKAGE_NAME) throw new Error(`package name must stay ${PACKAGE_NAME}`);
  if (pkg.type !== 'module') throw new Error('package type must stay module');
  if (typeof pkg.version !== 'string' || !pkg.version) throw new Error('package version missing');
  if (pkg.dsh?.bundle?.patch !== './cordis.patch.yml') {
    throw new Error('dsh.bundle.patch must remain ./cordis.patch.yml');
  }
  if (pkg.dsh?.engines) {
    throw new Error('engines.dsh must be top-level, not nested under dsh');
  }
  if (pkg.engines?.node !== '>=22') throw new Error('engines.node must be >=22');
  if (pkg.engines?.dsh !== DSH_ENGINE_RANGE) {
    throw new Error(`engines.dsh must be "${DSH_ENGINE_RANGE}"`);
  }
  if (pkg.dsh?.client?.platform !== 'web' || pkg.dsh?.client?.immediately !== true) {
    throw new Error('existing DSH client inject fields changed');
  }
  for (const inject of ['@deepseek-ai/dsh-client-runtime', '@deepseek-ai/dsh-client-ui-slots']) {
    if (!Array.isArray(pkg.dsh?.client?.inject) || !pkg.dsh.client.inject.includes(inject)) {
      throw new Error(`existing DSH client inject entry missing: ${inject}`);
    }
  }
  for (const [name, range] of Object.entries(SHARED_PACKAGES)) {
    if (pkg.peerDependencies?.[name] !== range) {
      throw new Error(`peerDependencies.${name} must be ${range}`);
    }
    if (pkg.devDependencies?.[name] !== range) {
      throw new Error(`devDependencies.${name} must be ${range}`);
    }
  }
  if (!Array.isArray(pkg.files) || !pkg.files.includes('lib/') || !pkg.files.includes('bundle/')) {
    throw new Error('files whitelist must include lib/ and bundle/');
  }
  for (const rel of ['lib/index.js', 'lib/client.js', 'cordis.patch.yml']) {
    if (!existsSync(join(packageDir, rel))) throw new Error(`package is missing ${rel}`);
  }
  return pkg;
}

export function verifyBundle({ packageDir, quiet = false } = {}) {
  const pkg = verifyPackageSurface(packageDir);
  const bundleDir = join(packageDir, BUNDLE_DIR);
  const manifestPath = join(bundleDir, BUNDLE_MANIFEST);
  if (!existsSync(manifestPath)) throw new Error(`bundle manifest missing: ${BUNDLE_DIR}/${BUNDLE_MANIFEST}`);
  const manifest = readJson(manifestPath);
  if (manifest.schema !== BUNDLE_SCHEMA) throw new Error(`unexpected bundle schema: ${manifest.schema}`);
  if (manifest.package !== PACKAGE_NAME) throw new Error(`bundle package name mismatch: ${manifest.package}`);
  if (manifest.packageVersion !== pkg.version) {
    throw new Error(`bundle ${manifest.packageVersion} does not match package ${pkg.version}`);
  }
  if (manifest.fileCount !== manifest.files.length) {
    throw new Error(`bundle manifest fileCount ${manifest.fileCount} != ${manifest.files.length}`);
  }

  const actual = listFiles(bundleDir);
  const expected = new Set([...manifest.files.map((file) => file.path), BUNDLE_MANIFEST]);
  for (const rel of actual) {
    if (!expected.has(rel)) throw new Error(`unexpected file in bundle: ${rel}`);
  }

  let totalBytes = 0;
  const problems = [];
  for (const file of manifest.files) {
    const abs = join(bundleDir, file.path);
    if (!existsSync(abs) || !statSync(abs).isFile()) {
      problems.push(`missing ${file.path}`);
      continue;
    }
    const size = statSync(abs).size;
    if (size !== file.bytes) problems.push(`${file.path}: size ${size} != ${file.bytes}`);
    if (sha256File(abs) !== file.sha256) problems.push(`${file.path}: sha256 mismatch`);
    totalBytes += size;
  }
  if (totalBytes !== manifest.totalBytes) {
    problems.push(`total bytes ${totalBytes} != ${manifest.totalBytes}`);
  }
  if (problems.length) throw new Error(`bundle verification failed:\n- ${problems.join('\n- ')}`);

  for (const rel of actual) {
    const name = basename(rel).toLowerCase();
    const ext = extname(name);
    if (VIDEO_EXT.has(ext)) throw new Error(`video must not ship in npm bundle: ${rel}`);
    if (STATE_NAMES.has(name)) throw new Error(`user state must not ship: ${rel}`);
    if (/(^|\/)(temp|node_modules|\.git)(\/|$)/i.test(rel)) {
      throw new Error(`scratch directory must not ship: ${rel}`);
    }
    if (['.jpg', '.jpeg', '.png', '.gif'].includes(ext)) {
      const allowed = new Set([
        `skins/zzz-zenless/assets/${KEYART_FILE}`,
      ]);
      if (!allowed.has(rel)) throw new Error(`unexpected raster image (possible session screenshot): ${rel}`);
    }
  }

  const summary = { fileCount: actual.length, totalBytes, version: pkg.version, skins: [], avatars: null };

  for (const id of BUILTIN_IDS) {
    const dir = join(bundleDir, 'skins', id);
    for (const file of ['skin.json', 'skin.css', 'patches.css', 'LICENSE', 'NOTICE']) {
      if (!existsSync(join(dir, file))) throw new Error(`${id} is missing ${file}`);
    }
    const skin = readJson(join(dir, 'skin.json'));
    if (skin.id !== id) throw new Error(`${id}/skin.json has id ${skin.id}`);
    if (skin.version !== pkg.version) throw new Error(`${id}/skin.json version ${skin.version} != ${pkg.version}`);
    if (!skin.contributes || skin.contributes.stylesheet !== 'skin.css'
      || skin.contributes.patches !== 'patches.css') {
      throw new Error(`${id}/skin.json contributes paths are incomplete`);
    }
    for (const asset of ['avatar-agent.webp', 'bubble-arrow-left.webp', 'bubble-arrow-right-blue.webp']) {
      if (!existsSync(join(dir, 'assets', asset))) throw new Error(`${id} is missing assets/${asset}`);
    }
    assertCssAssets(dir, id);

    if (id === 'zzz-zenless') {
      const bm = skin.contributes.backgroundMedia;
      if (!bm || bm.dark?.type !== 'image' || bm.light?.type !== 'image') {
        throw new Error('zzz-zenless must use a static image background');
      }
      for (const mode of ['dark', 'light']) {
        if (bm[mode].src !== `assets/${KEYART_FILE}`) {
          throw new Error(`zzz-zenless ${mode} background must be the official key art`);
        }
        if (!bm[mode].scrim) throw new Error(`zzz-zenless ${mode} background needs a scrim`);
      }
      if (skin.preview?.light !== KEYART_FILE || skin.preview?.dark !== KEYART_FILE) {
        throw new Error('zzz-zenless preview must reuse the official key art');
      }
      if (!existsSync(join(dir, 'assets', KEYART_FILE))) {
        throw new Error('zzz-zenless key art file missing');
      }
    } else {
      if (skin.preview !== null) throw new Error('zzz-console preview must be null (no safe screenshot)');
      if (skin.contributes.backgroundMedia !== null) {
        throw new Error('zzz-console must not declare a wallpaper');
      }
      if (!readFileSync(join(dir, 'patches.css'), 'utf8').includes('§C CONSOLE 材质重铸')) {
        throw new Error('zzz-console patches.css is missing the console tail');
      }
      if (!readFileSync(join(dir, 'skin.css'), 'utf8').includes('§C console colorway')) {
        throw new Error('zzz-console skin.css is missing the console colorway');
      }
    }
    summary.skins.push({ id, version: skin.version, preview: skin.preview });
  }

  const avatarDir = join(bundleDir, 'avatars');
  const catalog = readJson(join(avatarDir, AVATAR_CATALOG));
  if (!Array.isArray(catalog) || catalog.length !== AVATAR_COUNT) {
    throw new Error(`avatar catalog must contain ${AVATAR_COUNT} entries`);
  }
  const counts = Object.fromEntries(AVATAR_GROUPS.map((group) => [group, 0]));
  const seen = new Set();
  for (const entry of catalog) {
    if (!entry || !AVATAR_GROUPS.includes(entry.dir) || typeof entry.file !== 'string') {
      throw new Error('avatar catalog contains an invalid entry');
    }
    const key = `${entry.dir}/${entry.file}`;
    if (seen.has(key)) throw new Error(`avatar catalog repeats ${key}`);
    seen.add(key);
    counts[entry.dir] += 1;
    const abs = join(avatarDir, entry.dir, entry.file);
    if (!existsSync(abs) || !statSync(abs).isFile()) throw new Error(`avatar catalog references missing ${key}`);
    if (extname(entry.file).toLowerCase() !== '.webp') throw new Error(`avatar is not webp: ${key}`);
  }
  for (const group of AVATAR_GROUPS) {
    const files = listFiles(join(avatarDir, group)).filter((file) => extname(file).toLowerCase() === '.webp');
    if (files.length !== counts[group]) {
      throw new Error(`avatar group ${group}: catalog ${counts[group]}, bundled ${files.length}`);
    }
  }
  if (manifest.avatars?.count !== AVATAR_COUNT) throw new Error('bundle manifest avatar count mismatch');
  if (existsSync(join(avatarDir, 'active.json'))) throw new Error('avatar selection state must not ship');
  summary.avatars = { count: catalog.length, groups: counts };

  if (!quiet) {
    console.log(`bundle OK: ${summary.fileCount} files, ${formatBytes(summary.totalBytes)}, `
      + `package ${summary.version}, avatars ${summary.avatars.count}`);
  }
  return summary;
}

export function buildBundle({ packageDir, sourceRoot = null } = {}) {
  const pkg = verifyPackageSurface(packageDir);
  const resolvedSource = sourceRoot
    ? resolve(sourceRoot)
    : findSourceRoot(packageDir);

  if (!resolvedSource) {
    const result = verifyBundle({ packageDir, quiet: true });
    console.log(`No source tree found; reusing the packaged bundle `
      + `(${result.fileCount} files, ${formatBytes(result.totalBytes)}).`);
    return { reused: true, ...result };
  }

  assertSource(resolvedSource);
  const bundleDir = join(packageDir, BUNDLE_DIR);
  rmSync(bundleDir, { recursive: true, force: true });
  mkdirSync(join(bundleDir, 'skins'), { recursive: true });

  const homepage = pkg.homepage || 'https://github.com/yizhang-dream/dsh-zzz-skin';
  const attribution = '皮肤代码与设计：flower-moon（MIT）。游戏插画与头像素材：'
    + '© miHoYo / HoYoverse，仅作非商业同人使用，不适用 MIT 许可，详见 NOTICE。';

  buildZenless({ sourceRoot: resolvedSource, packageDir, bundleDir, version: pkg.version, homepage, attribution });
  buildConsole({ sourceRoot: resolvedSource, packageDir, bundleDir, version: pkg.version, homepage, attribution });
  const avatars = buildAvatars(resolvedSource, bundleDir);
  writeJson(join(bundleDir, BUNDLE_MANIFEST), buildManifest({ bundleDir, version: pkg.version }));

  const result = verifyBundle({ packageDir, quiet: true });
  console.log(`Built bundle from ${resolvedSource}: ${result.fileCount} files, `
    + `${formatBytes(result.totalBytes)}, avatars ${avatars.count}.`);
  return { reused: false, sourceRoot: resolvedSource, ...result };
}
