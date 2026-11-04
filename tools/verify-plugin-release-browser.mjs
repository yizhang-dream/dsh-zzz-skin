#!/usr/bin/env node
// verify-plugin-release-browser.mjs
// Real integration verification for the packaged ZZZ DSH plugin against the
// isolated 3096 profile. Attaches to (or launches) its own headless Chromium.
// No mocks, no unit tests, no page-side fake ctx. The login token is read from
// a file and never printed or written into the result JSON.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync, spawn } from 'node:child_process';

const argv = process.argv.slice(2);
const arg = (name, def) => {
  const i = argv.indexOf('--' + name);
  if (i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--')) return argv[i + 1];
  return def;
};
const flag = (name) => argv.includes('--' + name);
const PORT = Number(arg('port', process.env.CDP_PORT || 9351));
const PROFILE = arg('profile', 'C:/Users/zyz/AppData/Local/Temp/dsh-verify-zzz/chrome-profile-9351');
const LOGIN_FILE = arg('login-file', 'C:/Users/zyz/AppData/Local/Temp/dsh-verify-zzz/login-url.txt');
const SHOTS = arg('shots', 'C:/Users/zyz/AppData/Local/Temp/dsh-verify-zzz/shots');
const SSH_HOST = arg('ssh-host', 'lab-ts');
const REMOTE_PATCH = arg('remote-patch', '/home/cvgluser/dsh-verify-zzz/home/profiles/zzzverify/cordis.patch.yml');
const REMOTE_RUNPID = arg('remote-runpid', '/home/cvgluser/dsh-verify-zzz/run.pid');
const CHROME = arg('chrome', 'C:/Program Files/Google/Chrome/Application/chrome.exe');
const URL_OVERRIDE = arg('url', '');
const DO_HMR = !flag('no-hmr');
mkdirSync(SHOTS, { recursive: true });
const TEMP = arg('temp', 'C:/Users/zyz/AppData/Local/Temp/dsh-verify-zzz');
const R = { pass: [], fail: [], notes: [], screenshots: [], exceptions: [], consoleErrors: [], phases: {} };
const check = (ok, name, detail) => {
  (ok ? R.pass : R.fail).push(name);
  console.log((ok ? 'PASS ' : 'FAIL ') + name + (detail !== undefined ? ' | ' + JSON.stringify(detail).slice(0, 300) : ''));
  return ok;
};
const note = (name, detail) => { R.notes.push({ name, detail }); console.log('NOTE ' + name + (detail !== undefined ? ' | ' + JSON.stringify(detail).slice(0, 300) : '')); };

/* ---------- browser ---------- */
async function waitCdp(timeout = 15000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    try { const r = await fetch(`http://127.0.0.1:${PORT}/json/version`); if (r.ok) return true; } catch {}
    await new Promise(r => setTimeout(r, 300));
  }
  return false;
}
if (!await waitCdp(1200)) {
  mkdirSync(PROFILE, { recursive: true });
  const child = spawn(CHROME, [
    '--headless=new', `--remote-debugging-port=${PORT}`, '--remote-debugging-address=127.0.0.1',
    `--user-data-dir=${PROFILE}`, '--no-first-run', '--no-default-browser-check',
    '--disable-background-networking', '--disable-component-update', '--disable-sync',
    '--disable-default-apps', '--disable-extensions', '--window-size=1440,900',
    '--force-device-scale-factor=1', 'about:blank',
  ], { detached: true, stdio: 'ignore' });
  child.unref();
  if (!await waitCdp(20000)) throw new Error('CDP did not start on port ' + PORT);
}
const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
const pages = list.filter(t => t.type === 'page' && !t.url.startsWith('devtools') && !t.url.startsWith('chrome-extension:'));
const page = pages.find(t => t.url.includes('127.0.0.1:3096')) || pages.find(t => t.url === 'about:blank') || pages[0];
if (!page) throw new Error('no page target');
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject; });
let seq = 0; const pending = new Map();
let net = []; let inPlaceNet = [];
ws.onmessage = e => {
  const m = JSON.parse(e.data);
  if (m.id) {
    const p = pending.get(m.id);
    if (p) { pending.delete(m.id); m.error ? p.reject(new Error(JSON.stringify(m.error))) : p.resolve(m.result); }
    return;
  }
  if (m.method === 'Runtime.exceptionThrown') {
    R.exceptions.push(String(m.params.exceptionDetails?.exception?.description || m.params.exceptionDetails.text || '').slice(0, 300));
  } else if (m.method === 'Runtime.consoleAPICalled') {
    if (m.params.type === 'error') R.consoleErrors.push(m.params.args.map(a => a.value ?? a.description ?? '').join(' ').slice(0, 240));
  } else if (m.method === 'Network.requestWillBeSent') {
    const req = { id: m.params.requestId, method: m.params.request.method, url: m.params.request.url, type: m.params.type, headers: m.params.request.headers || {} };
    net.push(req);
  } else if (m.method === 'Network.responseReceived') {
    const req = net.find(r => r.id === m.params.requestId);
    if (req) { req.status = m.params.response.status; req.mime = m.params.response.mimeType; req.resourceType = m.params.type; }
  }
};
const send = (method, params = {}) => new Promise((resolve, reject) => {
  const i = ++seq; pending.set(i, { resolve, reject }); ws.send(JSON.stringify({ id: i, method, params }));
});
const ev = async expr => {
  const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
  return r.result.value;
};
const wait = ms => new Promise(r => setTimeout(r, ms));
const waitFor = async (expr, timeout = 15000, step = 250) => {
  const end = Date.now() + timeout;
  let last;
  while (Date.now() < end) {
    last = await ev(expr);
    if (last) return last;
    await wait(step);
  }
  return last;
};
const shot = async name => {
  const r = await send('Page.captureScreenshot', { format: 'jpeg', quality: 90 });
  const out = join(SHOTS, name);
  writeFileSync(out, Buffer.from(r.data, 'base64'));
  R.screenshots.push(out);
  console.log('SHOT ' + out);
};
const key = async (k, code, vk, modifiers = 0) => {
  for (const type of ['rawKeyDown', 'keyUp']) await send('Input.dispatchKeyEvent', { type, modifiers, key: k, code, windowsVirtualKeyCode: vk });
  await wait(450);
};
const mouseClick = async (expr, label) => {
  const rc = await ev(`(() => { const el = ${expr}; if (!el) return null; el.scrollIntoView({ block: 'center' }); const r = el.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`);
  if (!rc) return false;
  for (const type of ['mousePressed', 'mouseReleased']) await send('Input.dispatchMouseEvent', { type, x: rc.x, y: rc.y, button: 'left', clickCount: 1 });
  await wait(500);
  return true;
};
const clickText = async (selector, text) => mouseClick(`[...document.querySelectorAll(${JSON.stringify(selector)})].find(x => (x.textContent || '').trim() === ${JSON.stringify(text)})`, text);
const clickContains = async (selector, text) => mouseClick(`[...document.querySelectorAll(${JSON.stringify(selector)})].find(x => (x.textContent || '').includes(${JSON.stringify(text)}))`, text);

const grabExpr = `(() => {
  const layer = document.querySelector('[data-dsh-skin-layer]');
  const imgs = layer ? [...layer.querySelectorAll('img')] : [];
  const vids = layer ? [...layer.querySelectorAll('video')] : [];
  const links = [...document.querySelectorAll('link[data-dsh-skin-link]')];
  const skinLink = (kind) => links.find(l => l.getAttribute('data-dsh-skin-link') === kind);
  const rules = (l) => { try { return l && l.sheet ? l.sheet.cssRules.length : -1; } catch { return -2; } };
  return {
    url: location.href.replace(/[?&]token=[^&]+/, '?token=<redacted>'),
    ready: document.readyState,
    lifetimeMarker: window.__releaseVerifyLifetime || null,
    timeOrigin: performance.timeOrigin,
    htmlSkin: document.documentElement.getAttribute('data-dsh-skin'),
    links: links.map(l => ({ kind: l.getAttribute('data-dsh-skin-link'), href: l.getAttribute('href'), rules: rules(l) })),
    bg: {
      present: !!layer, childCount: layer ? layer.children.length : 0,
      imgs: imgs.map(i => ({ src: i.getAttribute('src'), nw: i.naturalWidth, nh: i.naturalHeight, complete: i.complete })),
      videos: vids.map(v => ({ src: v.getAttribute('src'), readyState: v.readyState, videoWidth: v.videoWidth }))
    },
    cssTag: !!document.getElementById('dsh-eridu-skincenter/section.css'),
    settingsOpen: [...document.querySelectorAll('[role=dialog]')].some(d => [...d.querySelectorAll('button')].some(b => (b.textContent || '').trim() === '通用设置')),
    zzzNav: [...document.querySelectorAll('[role=dialog] button')].some(b => (b.textContent || '').trim() === 'ZZZ'),
    esc: !!document.querySelector('.esc'),
    contacts: {
      faces: document.querySelectorAll('.zzz-contact-face').length,
      head: document.querySelectorAll('.zzz-contact-head-face').length,
      marked: document.querySelectorAll('[data-zzz-contact]').length,
      header: document.querySelectorAll('[data-zzz-contact-header]').length
    },
    bodyVars: {
      panel: document.body.style.getPropertyValue('--zzz-panel-alpha'),
      bubble: document.body.style.getPropertyValue('--dsh-skin-bubble-alpha'),
      blur: document.body.style.getPropertyValue('--zzz-panel-blur')
    },
    emptyImgSrc: [...document.querySelectorAll('img')].filter(i => i.getAttribute('src') === '').length,
    escEmptyImgSrc: [...document.querySelectorAll('.esc img')].filter(i => i.getAttribute('src') === '').length
  };
})()`;
const grab = () => ev(grabExpr);
const apiStatus = async (path) => ev(`(async () => { try { const r = await fetch(${JSON.stringify(path)}, { cache: 'no-store' }); let body = null; try { body = await r.json(); } catch {} return { status: r.status, body }; } catch (e) { return { status: 0, error: String(e && e.message || e) }; } })()`);

/* ---------- host navigation ---------- */
async function closeOnboarding() {
  const closed = await mouseClick(`[...document.querySelectorAll('[role=dialog]')].map(d => d.querySelector('button[aria-label="关闭"]')).find(Boolean)`, 'close-onboarding');
  if (closed) await wait(600);
  return closed;
}
async function waitReady() {
  await waitFor(`document.readyState === 'complete' && !!document.body && (!!document.querySelector('[aria-label="新建会话"]') || (document.body.innerText || '').includes('新会话'))`, 25000, 350);
  await sleepSafe(800);
  await closeOnboarding();
  await sleepSafe(700);
}
const sleepSafe = ms => wait(ms);
async function reloadPage() {
  await send('Page.reload', { ignoreCache: true });
  await waitReady();
}
async function openSettings() {
  const has = await ev(`[...document.querySelectorAll('[role=dialog] button')].some(b => (b.textContent || '').trim() === '通用设置')`);
  if (has) return true;
  await closeOnboarding();
  await key(',', 'Comma', 188, 3);
  const ok = await waitFor(`[...document.querySelectorAll('[role=dialog] button')].some(b => (b.textContent || '').trim() === '通用设置')`, 6000, 300);
  await wait(600);
  return !!ok;
}
async function closeSettings() {
  if (!await ev(`document.querySelectorAll('[role=dialog]').length`)) return;
  await key('Escape', 'Escape', 27);
  await wait(600);
  if (await ev(`document.querySelectorAll('[role=dialog]').length`)) {
    await clickText('[role=dialog] button', '关闭');
    await wait(500);
  }
}
const openZzz = async () => {
  if (!await openSettings()) return false;
  await clickText('[role=dialog] button', 'ZZZ');
  await waitFor(`!!document.querySelector('.esc')`, 7000, 250);
  await wait(600);
  return !!(await ev(`!!document.querySelector('.esc')`));
};
const clickTab = async (name) => { await clickText('.esc-tab', name); await waitFor(`[...document.querySelectorAll('.esc-tab')].some(t => t.textContent.trim() === ${JSON.stringify(name)} && t.classList.contains('on'))`, 4000, 200); await wait(500); };
const baseCardExpr = `[...document.querySelectorAll('.esc-card')].find(c => (c.querySelector('.nm') || {}).textContent && !String(c.querySelector('.nm').textContent).includes('观测台'))`;
const consoleCardExpr = `[...document.querySelectorAll('.esc-card')].find(c => (c.querySelector('.nm') || {}).textContent && String(c.querySelector('.nm').textContent).includes('观测台'))`;

/* ---------- SSH HMR (own profile only) ---------- */
const shq = s => "'" + String(s).replace(/'/g, "'\\''") + "'";
const ssh = (cmd, input) => execFileSync('ssh', ['-o', 'BatchMode=yes', '-o', 'ConnectTimeout=10', SSH_HOST, cmd], { input, encoding: 'utf8', timeout: 30000 }).trim();
const readRemotePatch = () => ssh(`cat ${shq(REMOTE_PATCH)}`);
const writeRemotePatch = (content) => ssh(`cat > ${shq(REMOTE_PATCH)}`, content);
const readRemotePid = () => ssh(`cat ${shq(REMOTE_RUNPID)}`).split(/\s+/)[0];

/* ---------- run ---------- */
await send('Page.enable');
await send('Runtime.enable');
await send('Network.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });

const loginUrl = URL_OVERRIDE || readFileSync(LOGIN_FILE, 'utf8').trim();
if (!loginUrl) throw new Error('login URL unavailable');
await send('Page.navigate', { url: loginUrl });
await waitReady();
let st = await grab();
R.phases.initial = st;
check(st.htmlSkin === 'zzz-zenless', 'initial-html-skin-zzz-zenless', st.htmlSkin);
check(st.links.length === 2 && st.links.every(l => l.rules > 0), 'initial-two-skin-links-loaded', st.links);
check(st.bg.imgs.length === 1 && st.bg.imgs[0].nw > 0, 'initial-static-bg-natural-width', st.bg.imgs);
check(st.bodyVars.panel === '0.66' && st.bodyVars.bubble === '0.86' && st.bodyVars.blur === '6px', 'initial-material-vars', st.bodyVars);
await shot('rel-01-home-initial.jpg');

// ensure base is active before the card checks
if (!await openZzz()) throw new Error('ZZZ settings section not available');
await clickTab('背景');
if (!(await ev(`(${baseCardExpr}).classList.contains('on')`))) {
  await mouseClick(`(${baseCardExpr})`, 'base-card');
  await waitFor(`(${baseCardExpr}).classList.contains('on')`, 7000, 250);
  await wait(800);
}
let z = await grab();
check(z.esc, 'settings-zzz-section-rendered', { zzzNav: z.zzzNav });
const tabs = await ev(`[...document.querySelectorAll('.esc-tab')].map(t => ({ t: t.textContent.trim(), on: t.classList.contains('on'), selected: t.getAttribute('aria-selected') }))`);
check(tabs.length === 3 && tabs[0].t === '背景' && tabs[0].on && tabs[0].selected === 'true', 'zzz-background-tab-default', tabs);
const cards = await ev(`[...document.querySelectorAll('.esc-card')].map(c => ({ nm: (c.querySelector('.nm') || {}).textContent || '', on: c.classList.contains('on'), vid: c.dataset.vid || '', img: c.querySelectorAll('img').length, video: c.querySelectorAll('video').length, ph: c.querySelectorAll('.ph').length, imgSrc: (c.querySelector('img') || {}).getAttribute ? c.querySelector('img').getAttribute('src') : null, imgNw: c.querySelector('img') ? c.querySelector('img').naturalWidth : null }))`);
R.phases.cards = cards;
check(cards.length === 2, 'zzz-two-cards', cards.map(c => c.nm));
const baseCard = cards.find(c => !c.nm.includes('观测台'));
const consoleCard = cards.find(c => c.nm.includes('观测台'));
check(!!baseCard && baseCard.img === 1 && baseCard.video === 0 && baseCard.imgNw > 0, 'static-card-image-real-no-video', baseCard);
check(!!consoleCard && consoleCard.img === 0 && consoleCard.video === 0 && consoleCard.ph === 1, 'console-card-css-placeholder-no-img-no-video', consoleCard);
check(await ev(`document.querySelectorAll('.esc-card video').length === 0`), 'no-video-elements-in-cards', await ev(`document.querySelectorAll('.esc-card video').length`));
const emptySrcSettings = await ev(`document.querySelectorAll('.esc img[src=""]').length`);
check(emptySrcSettings === 0, 'no-empty-img-src-in-settings', emptySrcSettings);
const mediaReqs = net.filter(r => r.type === 'Media' || /\.(mp4|webm)(\?|$)/i.test(r.url));
check(mediaReqs.length === 0, 'no-media-video-requests-in-background-tab', mediaReqs.map(r => r.url));
const emptyAssetReqs = net.filter(r => /\/assets\/?(\?|$)/.test(r.url) || /\/assets\/?$/.test(r.url));
check(emptyAssetReqs.length === 0, 'no-empty-asset-request', emptyAssetReqs.map(r => r.url));
R.phases.bgNet = net.filter(r => /eridu|\.jpg|\.webp|\.mp4|\.webm/.test(r.url)).map(r => ({ m: r.method, s: r.status, t: r.type, u: r.url.split('?')[0] }));
await shot('rel-02-settings-background.jpg');

// avatars
await clickTab('代理人头像');
const av = await ev(`(() => { const cells = [...document.querySelectorAll('.esc-avcell')]; const groupNames = [...document.querySelectorAll('.esc-key')].map(k => k.textContent.trim()); return { cells: cells.length, groupNames, empty: [...document.querySelectorAll('.esc img')].filter(i => i.getAttribute('src') === '').length, loaded: cells.filter(c => { const i = c.querySelector('img'); return i && i.naturalWidth > 0; }).length }; })()`);
R.phases.avatars = av;
check(av.cells === 233, '233-avatar-cells', av.cells);
check(av.groupNames.join('|').includes('头像 · 62') && av.groupNames.join('|').includes('聊天图标 · 76') && av.groupNames.join('|').includes('角色 · 95'), 'avatar-group-counts-62-76-95', av.groupNames);
check(av.empty === 0, 'avatar-imgs-have-src', av.empty);
check(av.loaded > 0, 'avatar-images-real-natural-width', av.loaded);
const scope = await ev(`(() => { const s = document.getElementById('esc-scope-session'); const g = document.getElementById('esc-scope-global'); return { sessionDisabled: s ? s.disabled : null, sessionChecked: s ? s.getAttribute('aria-checked') : null, sessionText: s ? s.textContent.trim().slice(0, 50) : null, globalChecked: g ? g.getAttribute('aria-checked') : null }; })()`);
check(scope.sessionDisabled === true && scope.sessionChecked === 'false' && (scope.sessionText || '').includes('先打开一个对话') && scope.globalChecked === 'true', 'empty-session-scope-disabled', scope);
await shot('rel-03-settings-avatars.jpg');

// default avatar through real UI, then restore the initial avatar
const initialAvatar = (await apiStatus('/api/eridu-skins/avatar/list')).body?.current || null;
R.initialAvatar = initialAvatar;
const picked = await ev(`(() => { const cell = [...document.querySelectorAll('.esc-avcell')].find(c => { const i = c.querySelector('img'); return i && i.getAttribute('src') && i.getAttribute('src').includes('/avatars/'); }); if (!cell) return null; const i = cell.querySelector('img'); return { file: i.getAttribute('src').split('/').pop().split('?')[0], name: (cell.querySelector('span') || {}).textContent || '' }; })()`);
check(!!picked, 'avatar-candidate-found', picked);
if (picked) {
  await mouseClick(`[...document.querySelectorAll('.esc-avcell')].find(c => { const i = c.querySelector('img'); return i && i.getAttribute('src') && i.getAttribute('src').split('/').pop().split('?')[0] === ${JSON.stringify(picked.file)}; })`, 'pick-avatar');
  await wait(700);
  const pickPreview = await ev(`(() => { const p = document.querySelector('.esc-bar .pick img'); return p ? { src: p.getAttribute('src'), nw: p.naturalWidth } : null; })()`);
  check(pickPreview && pickPreview.nw > 0, 'picked-avatar-preview-real-image', pickPreview);
  const beforePatches = (await grab()).links.find(l => l.kind === 'patches')?.href || '';
  await clickText('.esc button', '应用头像');
  await waitFor(`(() => { const c = [...document.querySelectorAll('.esc-avcell')].find(c => (c.querySelector('span') || {}).textContent.includes('使用中')); return !!c; })()`, 8000, 250);
  await wait(900);
  const after = await grab();
  const afterPatches = after.links.find(l => l.kind === 'patches')?.href || '';
  const cur = (await apiStatus('/api/eridu-skins/avatar/list')).body?.current || null;
  const avatarAsset = await ev(`(async () => { const r = await fetch('/api/eridu-skins/skin/zzz-zenless/assets/avatar-agent.webp', { cache: 'no-store' }); const b = await r.blob(); return { status: r.status, type: r.headers.get('content-type'), bytes: b.size }; })()`);
  R.phases.avatarApply = { picked, cur, beforePatches, afterPatches, avatarAsset };
  check(afterPatches !== beforePatches && afterPatches.includes('/patches'), 'avatar-apply-refreshes-patches-link', { beforePatches, afterPatches });
  check(cur && cur.file === picked.file, 'avatar-apply-current-state', cur);
  check(avatarAsset.status === 200 && avatarAsset.bytes > 0, 'avatar-agent-asset-real-bytes', avatarAsset);
  check(after.bodyVars.panel === '0.66' && after.bodyVars.bubble === '0.86' && after.bodyVars.blur === '6px', 'avatar-apply-material-unchanged', after.bodyVars);
  await shot('rel-04-settings-avatar-applied.jpg');
  if (initialAvatar) {
    await mouseClick(`[...document.querySelectorAll('.esc-avcell')].find(c => { const i = c.querySelector('img'); return i && i.getAttribute('src') && i.getAttribute('src').split('/').pop().split('?')[0] === ${JSON.stringify(initialAvatar.file)}; })`, 'restore-avatar-pick');
    await wait(600);
    await clickText('.esc button', '应用头像');
    await wait(1400);
    const restored = (await apiStatus('/api/eridu-skins/avatar/list')).body?.current || null;
    check(restored && restored.file === initialAvatar.file && restored.dir === initialAvatar.dir, 'avatar-restored-to-initial', { restored, initialAvatar });
  }
}

// material ranges
await clickTab('界面材质');
const mat = await ev(`(() => ({ ranges: [...document.querySelectorAll('.esc-mat input[type=range]')].map(r => ({ id: r.id, min: r.min, max: r.max, step: r.step, value: r.value })), vals: [...document.querySelectorAll('.esc-mat-val')].map(v => v.textContent.trim()), vars: { panel: document.body.style.getPropertyValue('--zzz-panel-alpha'), bubble: document.body.style.getPropertyValue('--dsh-skin-bubble-alpha'), blur: document.body.style.getPropertyValue('--zzz-panel-blur') } }))()`);
R.phases.material = mat;
check(mat.ranges.length === 3 && mat.ranges[0].value === '0.66' && mat.ranges[1].value === '0.86' && mat.ranges[2].value === '6' && mat.vars.panel === '0.66' && mat.vars.bubble === '0.86' && mat.vars.blur === '6px', 'three-material-ranges-normal', mat);
await shot('rel-05-settings-material.jpg');

// theme switching through host settings
await clickText('[role=dialog] button', '通用设置');
await wait(700);
const initialTheme = await ev(`(() => { const b = [...document.querySelectorAll('[class*="themeCube"]')].find(x => x.getAttribute('aria-pressed') === 'true' || x.getAttribute('aria-checked') === 'true'); return b ? b.textContent.trim() : null; })()`);
R.initialTheme = initialTheme;
const theme = async (name, dark) => {
  await clickText('[class*=themeCube]', name);
  await waitFor(`document.body.hasAttribute('data-ds-dark-theme') === ${dark}`, 5000, 200);
  await wait(900);
  const state = await grab();
  const img = state.bg.imgs[0];
  check(!!img && img.nw > 0, 'theme-' + name + '-bg-image-real', img);
  check(state.bodyVars.panel === '0.66' && state.bodyVars.bubble === '0.86' && state.bodyVars.blur === '6px', 'theme-' + name + '-material-unchanged', state.bodyVars);
  return state;
};
R.phases.themeLight = await theme('浅色', false);
await closeSettings(); await wait(700); await shot('rel-06-home-light.jpg');
await openSettings(); await clickText('[role=dialog] button', '通用设置'); await wait(600);
R.phases.themeDark = await theme('深色', true);
await closeSettings(); await wait(700); await shot('rel-07-home-dark.jpg');

// console skin then restore base through real card clicks
await openZzz(); await clickTab('背景');
net.length = 0;
await mouseClick(`(${consoleCardExpr})`, 'console-card');
await waitFor(`document.documentElement.getAttribute('data-dsh-skin') === 'zzz-console'`, 8000, 250);
await wait(1200);
let cst = await grab();
const consoleOn = await ev(`(${consoleCardExpr}).classList.contains('on')`);
R.phases.console = { state: cst, on: consoleOn };
check(cst.htmlSkin === 'zzz-console' && consoleOn, 'console-card-select-active', { htmlSkin: cst.htmlSkin, on: consoleOn });
check(cst.bg.present && cst.bg.imgs.length === 0 && cst.bg.videos.length === 0, 'console-bg-layer-empty-no-media', cst.bg);
check(cst.links.length === 2 && cst.links.every(l => l.href.includes('/zzz-console/') && l.rules > 0), 'console-links-loaded', cst.links);
await shot('rel-08-console-selected.jpg');
await mouseClick(`(${baseCardExpr})`, 'base-card');
await waitFor(`document.documentElement.getAttribute('data-dsh-skin') === 'zzz-zenless'`, 8000, 250);
await wait(1200);
let bst = await grab();
const baseOn = await ev(`(${baseCardExpr}).classList.contains('on')`);
R.phases.baseRestored = { state: bst, on: baseOn };
check(bst.htmlSkin === 'zzz-zenless' && baseOn, 'base-restored-active', { htmlSkin: bst.htmlSkin, on: baseOn });
check(bst.bg.imgs.length === 1 && bst.bg.imgs[0].nw > 0, 'base-restored-static-image-real', bst.bg.imgs);
check(bst.links.length === 2 && bst.links.every(l => l.href.includes('/zzz-zenless/') && l.rules > 0), 'base-restored-links-loaded', bst.links);
await shot('rel-09-base-restored.jpg');

// real HMR disable/re-enable on our own profile
let patchOriginal = null, hmrTouched = false, pidBefore = null, disabledImgs = null;
try {
  if (DO_HMR) {
    patchOriginal = readRemotePatch();
    writeFileSync(join(TEMP, 'cordis.patch.verify-backup.yml'), patchOriginal);
    pidBefore = readRemotePid();
    ssh(`cp -p ${shq(REMOTE_PATCH)} ${shq(REMOTE_PATCH + '.verify-bak-' + Date.now())}`);
    await ev(`window.__releaseVerifyLifetime = 'release-' + Date.now(); ({ ok: true })`);
    const hmrBefore = await grab();
    ssh(`cat >> ${shq(REMOTE_PATCH)}`, '\n- id: eridu-skincenter\n  disabled: true\n');
    hmrTouched = true;
    const apiDown = await (async () => { const end = Date.now() + 20000; while (Date.now() < end) { const s = await apiStatus('/api/eridu-skins/list'); if (s.status === 404) return s; await wait(500); } return await apiStatus('/api/eridu-skins/list'); })();
    check(apiDown.status === 404, 'hmr-disable-api-404', apiDown.status);
    const pidAfterDisable = readRemotePid();
    check(pidAfterDisable === pidBefore, 'hmr-disable-server-pid-unchanged', { before: pidBefore, after: pidAfterDisable });
    await wait(2500);
    const inPlace = await grab();
    R.phases.inPlaceAfterDisable = inPlace;
    const samePageAfterDisable = inPlace.lifetimeMarker === hmrBefore.lifetimeMarker && inPlace.timeOrigin === hmrBefore.timeOrigin;
    const inPlaceCleared = !inPlace.bg.present && inPlace.links.length === 0 && !inPlace.htmlSkin && !inPlace.cssTag && !inPlace.zzzNav && inPlace.bodyVars.panel === '' && inPlace.bodyVars.bubble === '' && inPlace.bodyVars.blur === '';
    R.inPlaceUnloadObserved = inPlaceCleared;
    R.inPlaceSamePage = samePageAfterDisable;
    check(samePageAfterDisable, 'hmr-disable-same-page-no-reload', { marker: inPlace.lifetimeMarker, timeOrigin: inPlace.timeOrigin, beforeOrigin: hmrBefore.timeOrigin });
    if (inPlaceCleared) {
      note('hmr-disable-in-place-cleanup-observed', {
        htmlSkin: inPlace.htmlSkin, links: inPlace.links.length, bgPresent: inPlace.bg.present,
        cssTag: inPlace.cssTag, zzzNav: inPlace.zzzNav, bodyVars: inPlace.bodyVars, contacts: inPlace.contacts
      });
    } else {
      note('in-place-unload-not-available', 'existing page retained some plugin DOM; record the host limitation instead of treating a later reload as in-place proof');
    }

    await reloadPage();
    await wait(1000);
    disabledImgs = await grab();
    R.phases.afterDisableReload = disabledImgs;
    check(disabledImgs.htmlSkin === null, 'disabled-reload-no-html-skin', disabledImgs.htmlSkin);
    check(disabledImgs.links.length === 0, 'disabled-reload-no-skin-links', disabledImgs.links);
    check(disabledImgs.bg.present === false, 'disabled-reload-no-bg-layer', disabledImgs.bg.present);
    check(disabledImgs.cssTag === false, 'disabled-reload-no-section-css', disabledImgs.cssTag);
    check(disabledImgs.zzzNav === false, 'disabled-reload-no-zzz-settings-section', disabledImgs.zzzNav);
    check(disabledImgs.bodyVars.panel === '' && disabledImgs.bodyVars.bubble === '' && disabledImgs.bodyVars.blur === '', 'disabled-reload-material-vars-cleared', disabledImgs.bodyVars);
    check(disabledImgs.contacts.faces === 0 && disabledImgs.contacts.head === 0 && disabledImgs.contacts.marked === 0 && disabledImgs.contacts.header === 0, 'disabled-reload-no-contact-markers', disabledImgs.contacts);
    const downAgain = await apiStatus('/api/eridu-skins/list');
    check(downAgain.status === 404, 'disabled-reload-api-still-404', downAgain.status);
    await wait(3000);
    const noRevive = await grab();
    check(noRevive.bg.present === false && noRevive.links.length === 0 && noRevive.htmlSkin === null, 'disabled-no-revival-after-3s', { bg: noRevive.bg.present, links: noRevive.links.length, htmlSkin: noRevive.htmlSkin });
    await shot('rel-10-disabled-after-reload.jpg');

    writeRemotePatch(patchOriginal);
    hmrTouched = false;
    const apiUp = await (async () => { const end = Date.now() + 20000; while (Date.now() < end) { const s = await apiStatus('/api/eridu-skins/list'); if (s.status === 200 && s.body && s.body.ok) return s; await wait(500); } return await apiStatus('/api/eridu-skins/list'); })();
    check(apiUp.status === 200 && apiUp.body && apiUp.body.ok, 'hmr-enable-api-200', apiUp.status);
    const pidAfterEnable = readRemotePid();
    check(pidAfterEnable === pidBefore, 'hmr-enable-server-pid-unchanged', { before: pidBefore, after: pidAfterEnable });
    await wait(1500);
    await reloadPage();
    await waitFor(`document.documentElement.getAttribute('data-dsh-skin') === 'zzz-zenless'`, 12000, 300);
    await wait(1800);
    const restored = await grab();
    R.phases.afterEnableReload = restored;
    check(restored.htmlSkin === 'zzz-zenless', 'enabled-reload-html-skin-restored', restored.htmlSkin);
    check(restored.links.length === 2 && restored.links.every(l => l.rules > 0), 'enabled-reload-links-restored', restored.links);
    check(restored.bg.imgs.length === 1 && restored.bg.imgs[0].nw > 0, 'enabled-reload-bg-image-restored', restored.bg.imgs);
    check(restored.bodyVars.panel === '0.66' && restored.bodyVars.bubble === '0.86' && restored.bodyVars.blur === '6px', 'enabled-reload-material-vars-restored', restored.bodyVars);
    const settingsBack = await openZzz();
    const afterSettings = await grab();
    check(settingsBack && afterSettings.zzzNav && afterSettings.esc, 'enabled-reload-zzz-section-restored', { settingsBack, zzzNav: afterSettings.zzzNav, esc: afterSettings.esc });
    await clickTab('背景');
    const restoredCards = await ev(`document.querySelectorAll('.esc-card').length`);
    await clickTab('代理人头像');
    const restoredAv = await ev(`document.querySelectorAll('.esc-avcell').length`);
    check(restoredCards === 2 && restoredAv === 233, 'enabled-reload-2-cards-233-avatars', { restoredCards, restoredAv });
    await clickTab('背景');
    await shot('rel-11-enabled-after-reload.jpg');
  } else {
    note('hmr-skipped', '--no-hmr');
  }
} catch (e) {
  check(false, 'hmr-flow', String(e && e.stack || e).slice(0, 500));
} finally {
  if (hmrTouched && patchOriginal != null) {
    try { writeRemotePatch(patchOriginal); console.log('RESTORE remote patch in finally'); } catch (e) { console.log('RESTORE patch FAILED ' + String(e && e.message || e)); }
  }
}

// restore original theme, base and default avatar as far as the UI allows
try {
  if (await openSettings()) {
    if (R.initialTheme) { await clickText('[role=dialog] button', '通用设置'); await wait(500); await clickContains('[class*=themeCube]', R.initialTheme); await wait(700); }
    if (await openZzz()) {
      await clickTab('背景');
      if (!(await ev(`(${baseCardExpr}).classList.contains('on')`))) { await mouseClick(`(${baseCardExpr})`, 'base-card'); await wait(1300); }
      await clickTab('代理人头像');
      if (R.initialAvatar) {
        const cur = (await apiStatus('/api/eridu-skins/avatar/list')).body?.current || null;
        if (!cur || cur.file !== R.initialAvatar.file) {
          await mouseClick(`[...document.querySelectorAll('.esc-avcell')].find(c => { const i = c.querySelector('img'); return i && i.getAttribute('src') && i.getAttribute('src').split('/').pop().split('?')[0] === ${JSON.stringify(R.initialAvatar.file)}; })`, 'final-restore-avatar');
          await wait(500); await clickText('.esc button', '应用头像'); await wait(1200);
        }
      }
    }
    await closeSettings();
  }
  await wait(700);
  const final = await grab();
  R.phases.final = final;
  if (final.htmlSkin) await shot('rel-12-final-home.jpg');
} catch (e) {
  note('final-cleanup-ui', String(e && e.message || e));
}

R.exceptionsUnique = [...new Set(R.exceptions)];
R.consoleErrorsUnique = [...new Set(R.consoleErrors)];
check(R.exceptions.length === 0, 'no-runtime-exceptions', R.exceptionsUnique.slice(0, 3));
R.ok = R.fail.length === 0;
writeFileSync(join(TEMP, 'release-browser-result.json'), JSON.stringify(R, null, 2));
console.log('RESULT ' + (R.ok ? 'ALL-PASS' : 'HAS-FAILURES') + ' pass=' + R.pass.length + ' fail=' + R.fail.length + ' exceptions=' + R.exceptions.length);
console.log('RESULT_JSON ' + join(TEMP, 'release-browser-result.json'));
// Keep the browser alive for visual review. Never close the user's or this test browser here.
ws.close();
process.exit(R.ok ? 0 : 1);
