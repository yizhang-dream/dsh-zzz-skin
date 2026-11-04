// ZZZ · 服务端：内置只读皮肤/头像 + 可选本地资源；用户选择独立保存。
// 每个 API 先使用宿主 connection 鉴权；CSS 限定作用域，资产支持 HEAD/Range。
// 每次 apply 独立持有配置与路由，卸载时逆序释放注册。
import { readFileSync, statSync, createReadStream } from 'node:fs';
import { extname } from 'node:path';
import { createStore } from './store.js';
import Schema from '@deepseek-ai/schemastery';

export const name = 'dsh-eridu-skincenter';
export const inject = ['webServer', 'connection'];
export const Config = Schema.object({
  dataDir: Schema.string().default('').description('数据目录；留空使用 DSH_HOME 或 ~/.dsh。'),
  skinsDir: Schema.string().default('').description('可选本地皮肤目录，默认使用数据目录中的 skins。'),
  avatarsDir: Schema.string().default('').description('可选本地头像目录，默认使用数据目录中的 eridu-avatars。'),
});
const PREFIX = '/api/eridu-skins';
const SKIN_ID = /^[a-z0-9][a-z0-9-]*$/;
// 动态组件公共样式：固定随插件包发的单文件，自身选择器已限定 managed ZZZ html 属性，
// 因此不经 transformCss（也避免误改组件自带的作用域）。readFileSync 支持 file: URL。
const COMPONENT_CSS = new URL('./component-surfaces.css', import.meta.url);
function createSkinCenter(config = {}) {
  const store = createStore(config);

  const MIME = {
    '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp',
    '.gif': 'image/gif', '.svg': 'image/svg+xml', '.mp4': 'video/mp4', '.webm': 'video/webm',
    '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.otf': 'font/otf',
    '.json': 'application/json; charset=utf-8', '.css': 'text/css; charset=utf-8',
  };

  const json = (res, status, body) => {
    if (res.destroyed || res.writableEnded) return;
    res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'referrer-policy': 'no-referrer', 'cache-control': 'no-store' });
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
    req.on('error', () => r(null));
    req.on('aborted', () => r(null));
  });

  /* ── 皮肤目录 ─────────────────────────────────────── */
  const loadCatalog = store.catalog;
  const findSkin = store.find;

  /* ── 激活状态 ─────────────────────────────────────── */
  const readActive = store.readActive;
  const writeActive = store.writeActive;

  /* ── CSS 变换：前缀 + 根相对 url + 头像缓存戳 ─────── */
  function skinAssetUrl(id, rel, bust) {
    return `${PREFIX}/skin/${id}/assets/${rel}${bust ? `?v=${bust}` : ''}`;
  }
  const avatarRev = store.avatarRevision;
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
    //    :root / html 指的是作用域元素**自身**，加后代空格前缀会永不匹配（`:root` 不可能是
    //    <html> 的后代），整层令牌静默失效、界面回落宿主默认色 —— 这两类必须换成 scope 本身。
    const scopeSeg = (p) => {
      const t = p.trim();
      if (t === '') return p;
      if (t === ':root' || t === 'html') return scope;
      if (/^:root[\s>+~]/.test(t)) return scope + t.slice(':root'.length);
      if (/^html[\s>+~]/.test(t)) return scope + t.slice('html'.length);
      return `${scope} ${t}`;
    };
    const out = [];
    let depth = 0;          // 花括号深度
    let stack = [];         // 每层的类型：'rule' | 'media' | 'skip'（keyframes/font-face 等）
    const lines = css.split('\n');
    for (let idx = 0; idx < lines.length; idx++) {
      const line = lines[idx];
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
        out.push(parts.map(scopeSeg).join(',') + line.slice(brace));
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
        out.push(pad + parts.map(scopeSeg).join(',') + line.slice(brace));
      } else if (brace === -1 && parent !== 'skip' && /,$/.test(trimmed) && trimmed.length > 1
        && !trimmed.startsWith('/*') && !trimmed.startsWith('*') && !trimmed.startsWith('@')
        && (() => {
          // 向后看第一处「{ / ; / }」：含 { 才是选择器续行；只见 ; 或 } 的是声明值
          const nl = lines.find((l2, j) => j > idx && (l2.includes('{') || l2.includes(';') || l2.includes('}')));
          return !!nl && nl.includes('{');
        })()) {
        // 逗号续行（多行选择器的前几段，如 `.wSkVaW_root,` + 下一行 `.hHd-Xa_root {`）：
        // 逐段独立前缀。漏掉就会整段裸奔成全局选择器，样式泄漏到皮肤作用域之外。
        // ⚠ 只对「向后看先遇到 { 再遇到 ;」的行生效——先见 ; 的是多行 background 等
        // 声明值（`url(...) no-repeat,` / `linear-gradient(...),`），给它们加前缀会
        // 毒掉整条声明（2026-11-03 头像空圈事故：5 处多行背景全灭）。
        const pad = line.slice(0, line.length - line.trimStart().length);
        const sel = trimmed.replace(/,\s*$/, '');
        const parts = [];
        let pdepth = 0, cur = '';
        for (const ch of sel) {
          if (ch === '(') pdepth++;
          if (ch === ')') pdepth--;
          if (ch === ',' && pdepth === 0) { parts.push(cur); cur = ''; } else cur += ch;
        }
        parts.push(cur);
        out.push(pad + parts.map(scopeSeg).join(',') + ',');
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
  function serveAsset(req, res, id, rel) {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.writeHead(405, { allow: 'GET, HEAD' }).end(); return;
    }
    const abs = store.asset(id, rel);
    if (!abs) { res.writeHead(404).end(); return; }
    serveFile(req, res, abs);
  }
  function serveFile(req, res, abs) {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.writeHead(405, { allow: 'GET, HEAD' }).end(); return;
    }
    const size = statSync(abs).size;
    const headers = {
      'content-type': MIME[extname(abs).toLowerCase()] || 'application/octet-stream',
      'cache-control': 'private, max-age=604800',
      'accept-ranges': 'bytes',
    };
    let start = 0, end = size - 1, status = 200;
    // 原片按单段 Range 流式传输；不把几十至上百 MB 的 MP4 整块读进堆内存。
    if (req.method === 'GET' && req.headers.range) {
      const m = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range);
      let valid = m && (m[1] || m[2]) && size > 0;
      if (valid && m[1]) {
        start = Number(m[1]);
        end = m[2] ? Math.min(Number(m[2]), size - 1) : size - 1;
        valid = Number.isSafeInteger(start) && Number.isSafeInteger(end) && start <= end && start < size;
      } else if (valid) {
        const suffix = Number(m[2]);
        valid = Number.isSafeInteger(suffix) && suffix > 0;
        start = Math.max(0, size - suffix);
      }
      if (!valid) {
        res.writeHead(416, { ...headers, 'content-range': `bytes */${size}`, 'content-length': 0 }).end(); return;
      }
      status = 206;
      headers['content-range'] = `bytes ${start}-${end}/${size}`;
    }
    headers['content-length'] = size ? end - start + 1 : 0;
    res.writeHead(status, headers);
    if (req.method === 'HEAD' || !size) { res.end(); return; }
    const stream = createReadStream(abs, { start, end });
    stream.on('error', () => res.destroy());
    res.on('close', () => stream.destroy());
    stream.pipe(res);
  }
  function serveCss(req, res, id, file) {
    if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405, { allow: 'GET, HEAD' }).end(); return; }
    const abs = store.skinFile(id, file);
    if (!abs) { json(res, 404, { ok: false, error: 'not-found' }); return; }
    const css = transformCss(id, readFileSync(abs, 'utf8'), file);
    res.writeHead(200, { 'content-type': 'text/css; charset=utf-8', 'cache-control': 'no-store' });
    res.end(css);
  }

  function serveComponentCss(req, res) {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.writeHead(405, { allow: 'GET, HEAD', 'cache-control': 'no-store' }).end(); return;
    }
    let body;
    try {
      body = readFileSync(COMPONENT_CSS);
    } catch (e) {
      json(res, 404, { ok: false, error: 'component-css-missing' }); return;
    }
    // 组件样式是插件包内固定文件：长度按字节给，HEAD 只回头不送体。
    res.writeHead(200, {
      'content-type': 'text/css; charset=utf-8',
      'cache-control': 'no-store',
      'content-length': body.length,
    });
    if (req.method === 'HEAD') { res.end(); return; }
    res.end(body);
  }

  /* ── 首屏注入 ─────────────────────────────────────── */
  function linkTags(id, hasPatches) {
    const links = [`<link rel="stylesheet" href="${PREFIX}/skin/${id}/stylesheet" data-dsh-skin-link="stylesheet">`];
    if (hasPatches) links.push(`<link rel="stylesheet" href="${PREFIX}/skin/${id}/patches" data-dsh-skin-link="patches">`);
    // 组件公共样式固定排在皮肤 link 之后（同权重冲突时皮肤先、组件后）。
    links.push(`<link rel="stylesheet" href="${PREFIX}/components.css" data-zzz-component-styles>`);
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
        if (!store.setAvatar(body)) { json(res, 400, { ok: false, error: 'unknown-avatar' }); return; }
        json(res, 200, { ok: true, rev: avatarRev(readActive() || 'zzz-zenless') });
      } },
      { kind: 'exact', path: `${PREFIX}/avatar/list`, handler: (req, res) => {
        if (req.method !== 'GET') { json(res, 405, { ok: false }); return; }
        json(res, 200, { ok: true, catalog: store.avatars(), current: store.currentAvatar() });
      } },
      { kind: 'prefix', path: `${PREFIX}/avatar-img`, handler: (req, res) => {
        const m = req.url.split('?')[0].match(new RegExp(`^${PREFIX}/avatar-img/([a-z-]+)/([A-Za-z0-9_.-]+\\.webp)$`));
        if (!m) { res.writeHead(404).end(); return; }
        const abs = store.avatarFile(m[1], m[2]);
        if (!abs) { res.writeHead(404).end(); return; }
        serveFile(req, res, abs);
      } },
      { kind: 'exact', path: `${PREFIX}/components.css`, handler: serveComponentCss },
      { kind: 'prefix', path: `${PREFIX}/skin`, handler: (req, res) => {
        // req.url 带查询串（换肤 ?t=、头像 ?v= 破缓存），必须剥掉再匹配，否则整条 CSS 404
        const m = req.url.split('?')[0].match(new RegExp(`^${PREFIX}/skin/([a-z0-9-]+)/(stylesheet|patches|assets/.+)$`));
        if (!m) { json(res, 404, { ok: false }); return; }
        const [, id, tail] = m;
        if (!SKIN_ID.test(id) || !findSkin(id)) { json(res, 404, { ok: false }); return; }
        if (tail === 'stylesheet' || tail === 'patches') serveCss(req, res, id, tail === 'stylesheet' ? 'skin.css' : 'patches.css');
        // 容忍 /assets/assets/ 双层前缀（旧客户端把 manifest 的 assets/ 前缀原样拼进 URL）
        else serveAsset(req, res, id, tail.slice('assets/'.length).replace(/^assets\//, ''));
      } },
    ];
  }

  return { routes: makeRoutes(), indexRows, indexTap, initialize: store.initialize };
}

export function apply(ctx, config = {}) {
  const skinCenter = createSkinCenter(config);
  skinCenter.initialize();
  ctx.effect(() => {
    const disposers = [];
    try {
      for (const route of skinCenter.routes) {
        disposers.push(ctx.webServer.register({ ...route, handler: (req, res) => {
          const rejection = ctx.connection.requestRejection(req);
          if (rejection) {
            res.writeHead(rejection, { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' });
            res.end(rejection === 401 ? 'unauthorized' : 'forbidden');
            return;
          }
          return route.handler(req, res);
        } }));
      }
      disposers.push(ctx.on('webserver/index-inject', (table) => { table.push(...skinCenter.indexRows()); }));
      disposers.push(ctx.webServer.tapIndex(skinCenter.indexTap));
    } catch (error) {
      for (const dispose of disposers.reverse()) dispose();
      throw error;
    }
    return () => { for (const dispose of disposers.reverse()) dispose(); };
  }, 'eridu-skincenter: routes');
}

