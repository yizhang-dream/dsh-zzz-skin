// 新艾利都皮肤中心 · 服务端（2026-11-01）
// 取代 @linxin666/dsh-client-ui-skincenter 的自建链路：
//  - 皮肤目录：$DSH_HOME/skins/<id>/（skin.json + skin.css + patches.css + assets/）
//  - 激活状态：$DSH_HOME/eridu-skins.json（首跑从 skin-center-active.json 迁移）
//  - 头像素材库：$DSH_HOME/eridu-avatars/<group>/<file> + catalog.json
//  - 首屏注入：webserver/index-inject 结构化行 + tapIndex 兜底（html 属性 + <link>）
//  - CSS 变换：选择器前缀 html[data-dsh-skin="<id>"] + url() 改根相对 + 头像 ?v=mtime
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync, copyFileSync, mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve, extname, basename } from 'node:path';

export const name = 'dsh-eridu-skincenter';
export const inject = ['webServer'];
const PREFIX = '/api/eridu-skins';
const SKIN_ID = /^[a-z0-9][a-z0-9-]*$/;
const DSH_HOME = process.env.DSH_HOME || join(homedir(), '.dsh');
const SKINS_DIR = join(DSH_HOME, 'skins');
const STATE = join(DSH_HOME, 'eridu-skins.json');
const LEGACY_STATE = join(DSH_HOME, 'skin-center-active.json');
const AV_DIR = join(DSH_HOME, 'eridu-avatars');

const MIME = {
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp',
  '.gif': 'image/gif', '.svg': 'image/svg+xml', '.mp4': 'video/mp4', '.webm': 'video/webm',
  '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.otf': 'font/otf',
  '.json': 'application/json; charset=utf-8', '.css': 'text/css; charset=utf-8',
};

const json = (res, status, body) => {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'referrer-policy': 'no-referrer' });
  res.end(JSON.stringify(body));
};
const sameOrigin = (req, res) => {
  const s = req.headers['sec-fetch-site'];
  if (s && s !== 'same-origin' && s !== 'none') { json(res, 403, { ok: false, error: 'cross-site' }); return false; }
  return true;
};
const readBody = (req) => new Promise((r) => {
  let b = '';
  req.on('data', (c) => { b += c; if (b.length > 65536) { b = ''; req.destroy(); r(null); } });
  req.on('end', () => { try { r(JSON.parse(b || '{}')); } catch { r(null); } });
});

/* ── 皮肤目录 ─────────────────────────────────────── */
function loadCatalog() {
  if (!existsSync(SKINS_DIR)) return [];
  return readdirSync(SKINS_DIR)
    .filter((id) => SKIN_ID.test(id) && existsSync(join(SKINS_DIR, id, 'skin.json')))
    .map((id) => {
      try {
        const m = JSON.parse(readFileSync(join(SKINS_DIR, id, 'skin.json'), 'utf8'));
        return {
          id: m.id || id,
          name: m.name || id,
          nameEn: m.nameEn || '',
          tagline: m.tagline || '',
          order: m.order ?? 500,
          version: m.version || '',
          preview: m.preview || null,
          hasPatches: m.contributes?.patches !== undefined,
          backgroundMedia: m.contributes?.backgroundMedia || null,
        };
      } catch { return null; }
    })
    .filter(Boolean)
    .sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));
}
const findSkin = (id) => loadCatalog().find((s) => s.id === id) || null;

/* ── 激活状态 ─────────────────────────────────────── */
function readActive() {
  try { return JSON.parse(readFileSync(STATE, 'utf8')).active || null; } catch {}
  try { // 首跑迁移：旧皮肤中心的选择直接继承
    const legacy = JSON.parse(readFileSync(LEGACY_STATE, 'utf8')).active;
    if (legacy && findSkin(legacy)) { writeActive(legacy); return legacy; }
  } catch {}
  return null;
}
function writeActive(id) {
  writeFileSync(STATE, JSON.stringify({ active: id, at: new Date().toISOString() }, null, 1));
}

/* ── CSS 变换：前缀 + 根相对 url + 头像缓存戳 ─────── */
function skinAssetUrl(id, rel, bust) {
  return `${PREFIX}/skin/${id}/assets/${rel}${bust ? `?v=${bust}` : ''}`;
}
function avatarRev(id) {
  try { return Math.floor(statSync(join(SKINS_DIR, id, 'assets', 'avatar-agent.webp')).mtimeMs / 1000); } catch { return 0; }
}
function transformCss(id, css, filename) {
  const scope = `html[data-dsh-skin="${id}"]`;
  // 1) url() 相对路径 → 根相对 API 路径（头像追加 mtime 戳，换头像即破缓存）
  css = css.replace(/url\((\s*['"]?)assets\//g, (m, q) => {
    return `url(${q}${PREFIX}/skin/${id}/assets/`;
  });
  if (css.includes('avatar-agent.webp')) {
    const v = avatarRev(id);
    css = css.replace(/(url\(['"]?[^'")]*avatar-agent\.webp)(['"]?\))/g, `$1?v=${v}$2`);
  }
  // 2) 选择器前缀：行级状态机（本仓库 CSS 格式规整：顶层顶格、@media 内缩进两格）
  const out = [];
  let depth = 0;          // 花括号深度
  let stack = [];         // 每层的类型：'rule' | 'media' | 'skip'（keyframes/font-face 等）
  for (const line of css.split('\n')) {
    const opens = (line.match(/{/g) || []).length;
    const closes = (line.match(/}/g) || []).length;
    const trimmed = line.trim();
    const parent = stack[stack.length - 1];
    const brace = line.indexOf('{');
    const prelude = brace > 0 ? line.slice(0, brace).trim() : '';
    // 选择器行：花括号前是一段非 @ 前缀的预序文本；父层是顶层或 @media/@supports
    const isSelectorLine = brace > 0 && prelude.length > 0
      && !prelude.startsWith('@') && !trimmed.startsWith('/*') && !trimmed.startsWith('*')
      && (parent === undefined || parent === 'media');
    if (isSelectorLine && parent === undefined) {
      // 顶层规则：前缀每个顶层逗号段
      const brace = line.indexOf('{');
      const sel = line.slice(0, brace);
      const parts = [];
      let pdepth = 0, cur = '';
      for (const ch of sel) {
        if (ch === '(') pdepth++;
        if (ch === ')') pdepth--;
        if (ch === ',' && pdepth === 0) { parts.push(cur); cur = ''; } else cur += ch;
      }
      parts.push(cur);
      out.push(parts.map((p) => (p.trim() === '' ? p : `${scope} ${p.trimStart()}`)).join(',') + line.slice(brace));
    } else if (isSelectorLine && parent === 'media') {
      const brace = line.indexOf('{');
      const sel = line.slice(0, brace);
      const parts = [];
      let pdepth = 0, cur = '';
      for (const ch of sel) {
        if (ch === '(') pdepth++;
        if (ch === ')') pdepth--;
        if (ch === ',' && pdepth === 0) { parts.push(cur); cur = ''; } else cur += ch;
      }
      parts.push(cur);
      const pad = line.slice(0, line.length - line.trimStart().length);
      out.push(pad + parts.map((p) => `${scope} ${p.trim()}`).join(',') + line.slice(brace));
    } else {
      out.push(line);
    }
    // 维护栈
    for (let i = 0; i < line.length; i++) {
      if (line[i] === '{') {
        const head = line.slice(0, i + 1).trim();
        const t = head.startsWith('@media') || head.startsWith('@supports') ? 'media'
          : head.startsWith('@keyframes') || head.startsWith('@font-face') || head.startsWith('@property') || head.startsWith('@layer') ? 'skip'
          : 'rule';
        stack.push(t);
      } else if (line[i] === '}') stack.pop();
    }
  }
  return out.join('\n');
}

/* ── 静态与 CSS 服务 ──────────────────────────────── */
function serveAsset(res, id, rel) {
  const root = resolve(SKINS_DIR, id);
  const abs = resolve(root, rel);
  if (!abs.startsWith(root + '/') && abs !== root) { res.writeHead(403).end(); return; }
  if (!existsSync(abs) || !statSync(abs).isFile()) { res.writeHead(404).end(); return; }
  res.writeHead(200, {
    'content-type': MIME[extname(abs).toLowerCase()] || 'application/octet-stream',
    'cache-control': 'public, max-age=604800',
  });
  res.end(readFileSync(abs));
}
function serveCss(res, id, file) {
  const entry = findSkin(id);
  const abs = entry && join(SKINS_DIR, id, file);
  if (!entry || !existsSync(abs)) { json(res, 404, { ok: false, error: 'not-found' }); return; }
  const css = transformCss(id, readFileSync(abs, 'utf8'), file);
  res.writeHead(200, { 'content-type': 'text/css; charset=utf-8', 'cache-control': 'no-store' });
  res.end(css);
}

/* ── 首屏注入 ─────────────────────────────────────── */
function linkTags(id, hasPatches) {
  const links = [`<link rel="stylesheet" href="${PREFIX}/skin/${id}/stylesheet" data-dsh-skin-link="stylesheet">`];
  if (hasPatches) links.push(`<link rel="stylesheet" href="${PREFIX}/skin/${id}/patches" data-dsh-skin-link="patches">`);
  return links.join('');
}
function indexRows() {
  const active = readActive();
  if (!active) return [];
  const entry = findSkin(active);
  if (!entry) return [];
  return [{ kind: 'html', placement: 'head', html: linkTags(active, entry.hasPatches) }];
}
function indexTap(html) {
  try {
    const active = readActive();
    if (!active || !findSkin(active)) return html;
    let out = html;
    if (!out.includes('data-dsh-skin=')) out = out.replace(/<html(\s|>)/, `<html data-dsh-skin="${active}"$1`);
    if (!out.includes('data-dsh-skin-link=')) out = out.replace('</head>', `${linkTags(active, findSkin(active).hasPatches)}</head>`);
    return out;
  } catch { return html; }
}

/* ── 路由 ─────────────────────────────────────────── */
function makeRoutes() {
  return [
    { kind: 'exact', path: `${PREFIX}/list`, handler: (req, res) => {
      if (req.method !== 'GET') { json(res, 405, { ok: false }); return; }
      json(res, 200, { ok: true, skins: loadCatalog(), active: readActive() });
    } },
    { kind: 'exact', path: `${PREFIX}/active`, handler: async (req, res) => {
      if (!sameOrigin(req, res)) return;
      if (req.method === 'GET') { json(res, 200, { ok: true, active: readActive() }); return; }
      if (req.method !== 'POST') { json(res, 405, { ok: false }); return; }
      const body = await readBody(req);
      const id = body?.id;
      if (typeof id !== 'string' || !SKIN_ID.test(id) || !findSkin(id)) { json(res, 400, { ok: false, error: 'unknown-skin' }); return; }
      writeActive(id);
      const entry = findSkin(id);
      json(res, 200, { ok: true, active: id, hasPatches: entry.hasPatches, backgroundMedia: entry.backgroundMedia });
    } },
    { kind: 'exact', path: `${PREFIX}/avatar`, handler: async (req, res) => {
      if (!sameOrigin(req, res)) return;
      if (req.method !== 'POST') { json(res, 405, { ok: false }); return; }
      const body = await readBody(req);
      const dir = body?.dir, file = body?.file;
      if (typeof dir !== 'string' || typeof file !== 'string' || /[\\/]|\.\./.test(dir + file)) { json(res, 400, { ok: false, error: 'bad-path' }); return; }
      const src = resolve(AV_DIR, dir, file);
      if (!src.startsWith(resolve(AV_DIR) + '/') || !existsSync(src)) { json(res, 400, { ok: false, error: 'unknown-avatar' }); return; }
      for (const id of readdirSync(SKINS_DIR).filter((s) => SKIN_ID.test(s))) {
        const dest = join(SKINS_DIR, id, 'assets');
        mkdirSync(dest, { recursive: true });
        copyFileSync(src, join(dest, 'avatar-agent.webp'));
      }
      const active = readActive();
      writeFileSync(join(DSH_HOME, 'eridu-avatar.json'), JSON.stringify({ dir, file, name: body?.name || file, at: new Date().toISOString() }, null, 1));
      json(res, 200, { ok: true, rev: avatarRev(active || 'zzz-zenless') });
    } },
    { kind: 'exact', path: `${PREFIX}/avatar/list`, handler: (req, res) => {
      const catPath = join(AV_DIR, 'catalog.json');
      let catalog = [];
      let current = null;
      try { catalog = JSON.parse(readFileSync(catPath, 'utf8')); } catch {}
      try { current = JSON.parse(readFileSync(join(DSH_HOME, 'eridu-avatar.json'), 'utf8')); } catch {}
      json(res, 200, { ok: true, catalog, current });
    } },
    { kind: 'prefix', path: `${PREFIX}/avatar-img`, handler: (req, res) => {
      const m = req.url.match(new RegExp(`^${PREFIX}/avatar-img/([a-z-]+)/([A-Za-z0-9_.-]+\\.webp)$`));
      if (!m) { res.writeHead(404).end(); return; }
      const abs = resolve(AV_DIR, m[1], m[2]);
      if (!abs.startsWith(resolve(AV_DIR) + '/') || !existsSync(abs)) { res.writeHead(404).end(); return; }
      res.writeHead(200, { 'content-type': 'image/webp', 'cache-control': 'public, max-age=604800' });
      res.end(readFileSync(abs));
    } },
    { kind: 'prefix', path: `${PREFIX}/skin`, handler: (req, res) => {
      const m = req.url.match(new RegExp(`^${PREFIX}/skin/([a-z0-9-]+)/(stylesheet|patches|assets/.+)$`));
      if (!m) { json(res, 404, { ok: false }); return; }
      const [, id, tail] = m;
      if (!SKIN_ID.test(id) || !findSkin(id)) { json(res, 404, { ok: false }); return; }
      if (tail === 'stylesheet' || tail === 'patches') serveCss(res, id, tail === 'stylesheet' ? 'skin.css' : 'patches.css');
      else serveAsset(res, id, tail.slice('assets/'.length));
    } },
  ];
}

export function apply(ctx) {
  const routes = makeRoutes();
  ctx.effect(() => {
    const disposers = [];
    for (const r of routes) disposers.push(ctx.webServer.register(r));
    disposers.push(ctx.on('webserver/index-inject', (table) => { table.push(...indexRows()); }));
    disposers.push(ctx.webServer.tapIndex(indexTap));
    return () => { for (const d of disposers) try { d(); } catch {} };
  }, 'eridu-skincenter: routes');
  if (!readActive()) {
    const first = loadCatalog()[0];
    if (first) writeActive(first.id);
  }
}

