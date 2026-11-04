import { existsSync, readFileSync, readdirSync, statSync, realpathSync, mkdirSync, writeFileSync, renameSync, rmSync } from 'node:fs';
import { homedir } from 'node:os';
import { resolve, join, relative, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash, randomUUID } from 'node:crypto';

const BUNDLE = fileURLToPath(new URL('../bundle/', import.meta.url));
const MANAGED_ID = /^zzz-(?:zenless|console|eridu-\d{2})$/;
const AVATAR_DIRS = new Set(['avatars', 'chat-icons', 'portraits']);
const AVATAR_FILE = /^[A-Za-z0-9_.-]+\.webp$/;
const readJson = (file, fallback) => { try { return JSON.parse(readFileSync(file, 'utf8')); } catch { return fallback; } };

// realpath + relative works on Windows and Linux and rejects symlink escapes.
export function containedFile(root, name) {
  if (typeof name !== 'string' || !name || isAbsolute(name)) return null;
  try {
    const base = realpathSync(root), file = realpathSync(resolve(base, name));
    const rel = relative(base, file);
    if (!rel || rel === '..' || rel.startsWith('..\\') || rel.startsWith('../') || isAbsolute(rel)) return null;
    return statSync(file).isFile() ? file : null;
  } catch { return null; }
}
function writeJson(file, value) {
  mkdirSync(resolve(file, '..'), { recursive: true });
  const temp = file + '.' + randomUUID() + '.tmp';
  try {
    writeFileSync(temp, JSON.stringify(value, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
    renameSync(temp, file);
  } finally { rmSync(temp, { force: true }); }
}

export function createStore(config = {}) {
  const home = resolve(config.dataDir || process.env.DSH_HOME || join(homedir(), '.dsh'));
  const skinsDir = resolve(home, config.skinsDir || 'skins');
  const avatarsDir = resolve(home, config.avatarsDir || 'eridu-avatars');
  const stateFile = join(home, 'eridu-skins.json');
  const avatarStateFile = join(home, 'eridu-avatar.json');
  const legacyFile = join(home, 'skin-center-active.json');
  const skinRoots = [join(BUNDLE, 'skins'), skinsDir];
  const avatarRoots = [avatarsDir, join(BUNDLE, 'avatars')];

  function entries() {
    const found = new Map();
    for (const root of skinRoots) {
      let ids = [];
      try { ids = readdirSync(root); } catch {}
      for (const id of ids.filter((id) => MANAGED_ID.test(id))) {
        const dir = join(root, id), manifestFile = containedFile(dir, 'skin.json');
        if (!manifestFile) continue;
        const m = readJson(manifestFile, null);
        if (!m || m.id !== id) continue;
        const stylesheet = m.contributes?.stylesheet || 'skin.css';
        if (!containedFile(dir, stylesheet)) continue;
        const patches = typeof m.contributes?.patches === 'string' ? m.contributes.patches : null;
        found.set(id, {
          id, name: typeof m.name === 'string' ? m.name : id,
          nameEn: typeof m.nameEn === 'string' ? m.nameEn : '',
          tagline: typeof m.tagline === 'string' ? m.tagline : '', order: Number.isFinite(m.order) ? m.order : 500,
          version: typeof m.version === 'string' ? m.version : '', preview: m.preview || null,
          hasPatches: !!(patches && containedFile(dir, patches)),
          backgroundMedia: m.contributes?.backgroundMedia || null,
          directory: dir, stylesheet, patches,
        });
      }
    }
    return [...found.values()].sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));
  }
  const find = (id) => typeof id === 'string' && MANAGED_ID.test(id) ? entries().find((e) => e.id === id) || null : null;
  const catalog = () => entries().map(({ directory, stylesheet, patches, ...entry }) => entry);
  function avatarFile(dir, file) {
    if (!AVATAR_DIRS.has(dir) || typeof file !== 'string' || !AVATAR_FILE.test(file)) return null;
    for (const root of avatarRoots) {
      const abs = containedFile(root, join(dir, file));
      if (abs) return abs;
    }
    return null;
  }
  function avatars() {
    const found = new Map();
    // User catalog entries may extend or override the packaged catalog.
    for (const root of [...avatarRoots].reverse()) {
      const list = readJson(join(root, 'catalog.json'), []);
      if (!Array.isArray(list)) continue;
      for (const e of list) {
        if (!e || !avatarFile(e.dir, e.file)) continue;
        found.set(e.dir + '/' + e.file, { dir: e.dir, file: e.file, name: String(e.name || e.file).slice(0, 128), group: String(e.group || e.dir).slice(0, 128) });
      }
    }
    return [...found.values()];
  }
  function currentAvatar() {
    const v = readJson(avatarStateFile, null);
    return v && avatarFile(v.dir, v.file) ? { dir: v.dir, file: v.file, name: v.name || v.file } : null;
  }
  function setAvatar(body) {
    const entry = avatars().find((e) => e.dir === body?.dir && e.file === body?.file);
    if (!entry) return false;
    // A pointer replaces whole-tree asset copying: bundled and unrelated skins stay read-only.
    writeJson(avatarStateFile, { dir: entry.dir, file: entry.file, name: entry.name, at: new Date().toISOString() });
    return true;
  }
  function asset(id, rel) {
    const entry = find(id);
    if (!entry) return null;
    if (rel === 'avatar-agent.webp') {
      const v = currentAvatar();
      if (v) return avatarFile(v.dir, v.file);
    }
    return containedFile(join(entry.directory, 'assets'), rel);
  }
  function avatarRevision(id) {
    const file = asset(id, 'avatar-agent.webp');
    if (!file) return '0';
    const s = statSync(file);
    return createHash('sha256').update(file + ':' + s.mtimeMs + ':' + s.size).digest('hex').slice(0, 16);
  }
  function readActive() {
    const id = readJson(stateFile, null)?.active || readJson(legacyFile, null)?.active;
    return find(id) ? id : null;
  }
  function writeActive(id) {
    if (!find(id)) throw new Error('unknown-skin');
    writeJson(stateFile, { active: id, at: new Date().toISOString() });
  }
  function initialize() {
    const active = readActive();
    if (active) {
      if (!existsSync(stateFile)) writeActive(active);
      return;
    }
    const initial = find('zzz-zenless') || entries()[0];
    if (initial) writeActive(initial.id);
  }
  function skinFile(id, type) {
    const entry = find(id);
    return entry ? containedFile(entry.directory, type === 'patches.css' ? entry.patches : entry.stylesheet) : null;
  }
  return { catalog, find, avatarFile, avatars, currentAvatar, setAvatar, asset, avatarRevision, readActive, writeActive, initialize, skinFile };
}
