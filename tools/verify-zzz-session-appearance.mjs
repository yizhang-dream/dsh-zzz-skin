#!/usr/bin/env node
// verify-zzz-session-appearance.mjs — 会话级头像/壁纸真实验收（只连独立 9347，UI 驱动，不直写配置）
// 断言：双会话各自选择+切换+刷新保持；全局 ACTIVE/头像不变（无 POST /active、/avatar）；
//       video readyState>=2 且 videoWidth>0；bubble ::before 随会话；两个重置恢复继承；结束恢复 localStorage 快照。
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

const TEMP = 'C:/Users/zyz/.zcode/dsh-zzz-skin/Temp';
const BASELINE_BG = 'video/bg-original-425da64d8782.mp4';
const list0 = await (await fetch('http://127.0.0.1:9347/json/list')).json();
const page0 = list0.find(p => p.type === 'page' && p.url.startsWith('http://100.112.92.62:3081/'));
if (!page0) throw new Error('app target not found on 9347');
const ws = new WebSocket(page0.webSocketDebuggerUrl);
await new Promise(r => ws.onopen = r);
let seq = 0; const pending = new Map(); const netLog = []; const exceptions = [];
ws.onmessage = e => {
  const m = JSON.parse(e.data);
  if (m.id) { const p = pending.get(m.id); if (p) { pending.delete(m.id); m.error ? p.reject(new Error(JSON.stringify(m.error))) : p.resolve(m.result); } }
  else if (m.method === 'Network.requestWillBeSent') netLog.push({ m: m.params.request.method, u: m.params.request.url.split('?')[0] });
  else if (m.method === 'Runtime.exceptionThrown') exceptions.push(String(m.params.exceptionDetails?.exception?.description || m.params.exceptionDetails.text || '').slice(0, 200));
};
const send = (m, p = {}) => new Promise((res, rej) => { const i = ++seq; pending.set(i, { resolve: res, reject: rej }); ws.send(JSON.stringify({ id: i, method: m, params: p })); });
const ev = async x => { const r = await send('Runtime.evaluate', { expression: x, returnByValue: true, awaitPromise: true }); if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text); return r.result.value; };
const wait = ms => new Promise(r => setTimeout(r, ms));
const shot = async name => { const r = await send('Page.captureScreenshot', { format: 'jpeg', quality: 88 }); if (!r || !r.data) throw new Error('screenshot failed'); writeFileSync(join(TEMP, name), Buffer.from(r.data, 'base64')); console.log('shot', name); };
const key = async (k, code, vk, modifiers = 0) => { for (const t of ['rawKeyDown', 'keyUp']) await send('Input.dispatchKeyEvent', { type: t, modifiers, key: k, code, windowsVirtualKeyCode: vk }); await wait(300); };
const R = { pass: [], fail: [] };
const check = (ok, name, detail) => { (ok ? R.pass : R.fail).push(name); console.log((ok ? 'PASS' : 'FAIL') + ' ' + name + (detail !== undefined ? ' | ' + JSON.stringify(detail).slice(0, 260) : '')); return ok; };
const fileOf = u => String(u || '').split('/').pop().split('?')[0];

await send('Page.enable'); await send('Runtime.enable'); await send('Network.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });

// ---------- 页内助手 ----------
const grabExpr = `(() => {
  const fileOf = u => String(u || '').split('/').pop().split('?')[0];
  const urlOf = el => { const m = el && getComputedStyle(el).backgroundImage.match(/url\\(["']?([^"')]+)/); return m ? m[1] : null; };
  const rows = [...document.querySelectorAll('[data-row-key]')].filter(e => String(e.dataset.rowKey).startsWith('session:'));
  const cc = document.querySelector('[class*="_centerCol"]');
  const steps = cc ? [...cc.querySelectorAll('[data-chat-anchor-key]')].filter(e => { const k = e.getAttribute('data-chat-anchor-key');
    return k && k.includes('assistant-step') && !k.startsWith('['); }) : [];
  const step = steps[steps.length - 1];
  const bubbleUrl = step ? ((getComputedStyle(step, '::before').backgroundImage.match(/url\\(["']?([^"')]+)/) || [])[1] || null) : null;
  const v = document.querySelector('[data-dsh-skin-layer] video');
  return { rows: rows.map(r => ({ key: r.dataset.rowKey, title: (r.querySelector('[class*=title]') || {}).textContent?.trim().slice(0, 16),
      selected: /selected/i.test(String(r.className)) || r.getAttribute('aria-selected') === 'true', face: fileOf(urlOf(r.querySelector('.zzz-contact-face'))) })),
    headFace: fileOf(urlOf(document.querySelector('.zzz-contact-head-face'))),
    bubbleFace: fileOf(bubbleUrl),
    video: v ? { srcTail: (v.currentSrc || v.src || '').split('/').slice(-2).join('/').slice(0, 70), readyState: v.readyState, videoWidth: v.videoWidth } : null,
    appear: localStorage.getItem('zzz-session-appearance-v1'), material: localStorage.getItem('dsh-eridu-material-v1') };
})()`;
const grab = () => ev(grabExpr);
const scrollLastStep = () => ev(`(() => { const cc = document.querySelector('[class*="_centerCol"]'); if (!cc) return 0;
  const steps = [...cc.querySelectorAll('[data-chat-anchor-key]')].filter(e => { const k = e.getAttribute('data-chat-anchor-key'); return k && k.includes('assistant-step') && !k.startsWith('['); });
  if (steps.length) steps[steps.length - 1].scrollIntoView({ block: 'start' }); return steps.length; })()`);
const openZzz = async () => {
  if (!await ev(`!!document.querySelector('[role=dialog]')`)) { await key(',', 'Comma', 188, 3); await wait(900); }
  await ev(`(() => { const b = [...document.querySelectorAll('[role=dialog] button')].find(x => (x.textContent || '').trim() === 'ZZZ'); if (b) b.click(); return 1; })()`);
  await wait(1300);
};
const clickTab = async name => { await ev(`(() => { const t = [...document.querySelectorAll('.esc-tab')].find(x => x.textContent.trim() === ${JSON.stringify(name)}); if (t) t.click(); return 1; })()`);
  await wait(800); };
const closeSettings = async () => { await key('Escape', 'Escape', 27); await wait(500); };
const noPost = () => netLog.filter(r => r.m === 'POST' && /\/(active|avatar)(\/|$|\?)/.test(r.u));

// ---------- 0. reload 取新 client + 快照 ----------
await send('Page.reload', { ignoreCache: true }); await wait(4000);
for (let i = 0; i < 30; i++) { await wait(700); if (await ev(`!!document.querySelector('[data-row-key]') && document.readyState === 'complete'`)) break; }
await wait(1500);
R.preTestLS = await ev(`JSON.stringify(Object.fromEntries(Object.keys(localStorage).map(k => [k, localStorage.getItem(k)])))`);
let g = await grab();
R.sessions = g.rows.map(r => ({ key: r.key, title: r.title }));
const A = g.rows.find(r => r.selected); // 会话A：登录后选中
const B = g.rows.find(r => !r.selected); // 会话B
const C = g.rows.find(r => r.key !== A.key && r.key !== B.key); // 会话C：无覆盖，验证全局继承
check(!!A && !!B && !!C, 'three-sessions-available', R.sessions.map(s => s.title));
R.base = { headFace: g.headFace, video: g.video, material: g.material, aFace: A.face, bFace: B.face, cFace: C?.face };
R.preTestMaterial = g.material;
check(g.video?.srcTail === BASELINE_BG, 'baseline-global-bg', g.video?.srcTail);
check(g.material?.includes('0.66') && g.material?.includes('0.86') && g.material?.includes('"blur":6'), 'baseline-material', g.material);

// ---------- 1. 会话A：作用域默认 session + 选壁纸01 + 选非chat-icons头像 ----------
await openZzz();
const scope = await ev(`(() => { const rg = document.querySelector('[role=radiogroup][aria-label=设置对象]');
  if (!rg) return { rg: false };
  const s = document.getElementById('esc-scope-session'); const gl = document.getElementById('esc-scope-global');
  return { rg: true, sessionChecked: s ? s.getAttribute('aria-checked') : null, sessionText: s ? s.textContent.trim().slice(0, 40) : null,
    globalText: gl ? gl.textContent.trim() : null, globalChecked: gl ? gl.getAttribute('aria-checked') : null }; })()`);
R.scopeUI = scope;
check(scope.rg && scope.sessionChecked === 'true', 'scope-radiogroup-default-session', scope);
check((scope.sessionText || '').includes('当前对话'), 'scope-session-label', scope.sessionText);
check(scope.globalText === '全局默认', 'scope-global-label', scope.globalText);
await shot('qa5-a1-settings-scope.jpg');

// 壁纸 01（视频文件名是内容哈希，用「卡选中态+src 离开基线+渲染就绪+ls 绑定」判定）
await clickTab('动态背景');
const cardClick = await ev(`(() => { const cards = [...document.querySelectorAll('.esc-card')];
  const c = cards.find(x => { const nm = (x.querySelector('.nm') || {}).textContent || ''; return /·\\s*01/.test(nm) || x.dataset.vid === 'zzz-eridu-01'; });
  if (!c) return 'nf'; c.click(); return (c.querySelector('.nm') || {}).textContent.trim().slice(0, 24); })()`);
await wait(2200);
const aOn = await ev(`(() => { const c = [...document.querySelectorAll('.esc-card')].find(x => { const nm = (x.querySelector('.nm') || {}).textContent || ''; return /·\\s*01/.test(nm) || x.dataset.vid === 'zzz-eridu-01'; }); return c ? c.classList.contains('on') : null; })()`);
g = await grab();
R.aVideoTail = g.video?.srcTail;
R.aWallpaper = { card: cardClick, cardOn: aOn, video: g.video };
check(cardClick !== 'nf' && aOn === true, 'a-pick-wallpaper-01-ui-click-card-on', R.aWallpaper.card);
check(g.video?.srcTail !== BASELINE_BG, 'a-bg-video-src-left-baseline', g.video?.srcTail);
check(g.video?.readyState >= 2 && g.video?.videoWidth > 0, 'a-bg-video-really-rendered', g.video);
await shot('qa5-a2-settings-bg-01.jpg');

// 头像：非 chat-icons 组
await clickTab('代理人头像');
const avDirs = await ev(`(() => { const cells = [...document.querySelectorAll('.esc-avcell')];
  const dirOf = c => { const i = c.querySelector('img'); if (i && i.src) return i.src.split('/').slice(-2, -1)[0];
    const m = (getComputedStyle(c).backgroundImage.match(/url\\(["']?([^"')]+)/) || [])[1]; return m ? m.split('/').slice(-2, -1)[0] : null; };
  const counts = {}; cells.forEach(c => { const d = dirOf(c); if (d) counts[d] = (counts[d] || 0) + 1; }); return { counts, total: cells.length }; })()`);
R.avatarDirs = avDirs;
const nonChatDir = Object.keys(avDirs.counts || {}).find(d => d !== 'chat-icons');
check(!!nonChatDir, 'non-chat-icons-avatar-group-exists', avDirs.counts);
const pickRes = await ev(`(() => { const cells = [...document.querySelectorAll('.esc-avcell')];
  const dirOf = c => { const i = c.querySelector('img'); if (i && i.src) return i.src.split('/').slice(-2, -1)[0];
    const m = (getComputedStyle(c).backgroundImage.match(/url\\(["']?([^"')]+)/) || [])[1]; return m ? m.split('/').slice(-2, -1)[0] : null; };
  const fileOf = c => { const i = c.querySelector('img'); if (i && i.src) return i.src.split('/').pop().split('?')[0];
    const m = (getComputedStyle(c).backgroundImage.match(/url\\(["']?([^"')]+)/) || [])[1]; return m ? m.split('/').pop().split('?')[0] : null; };
  const c = cells.find(x => dirOf(x) === ${JSON.stringify(nonChatDir)});
  if (!c) return { ok: false }; c.click();
  return { ok: true, dir: nonChatDirSafe, file: fileOf(c), name: (c.textContent || '').trim().slice(0, 16) }; })()`.replace('nonChatDirSafe', JSON.stringify(nonChatDir)));
await wait(600);
const applyA = await ev(`(() => { const b = [...document.querySelectorAll('.esc button')].find(x => (x.textContent || '').trim() === '设为本对话头像'); if (!b) return 'nf'; b.click(); return 'ok'; })()`);
await wait(2200);
g = await grab();
R.aAvatar = { pick: pickRes, apply: applyA, after: { head: g.headFace, aRow: g.rows.find(r => r.key === A.key)?.face, bubble: g.bubbleFace } };
check(pickRes.ok && applyA === 'ok', 'a-pick-non-chat-icons-avatar-ui', pickRes);
check(g.headFace === pickRes.file && g.rows.find(r => r.key === A.key)?.face === pickRes.file, 'a-header-row-face-switched', R.aAvatar.after);
const lsA = await ev(`JSON.parse(localStorage.getItem('zzz-session-appearance-v1') || 'null')`);
R.aLS = lsA;
const entryA = lsA && lsA[A.key];
check(!!entryA && entryA.avatar?.dir === nonChatDir && entryA.wallpaper === 'zzz-eridu-01', 'a-localstorage-entry', entryA);
await shot('qa5-a3-settings-avatar-picked.jpg');
await closeSettings();
await wait(800);
scrollLastStep(); await wait(500);
g = await grab();
check(g.bubbleFace === pickRes.file, 'a-bubble-before-matches-session-avatar', g.bubbleFace);
check(g.video?.readyState >= 2 && g.video?.videoWidth > 0, 'a-home-video-rendered', g.video);
await shot('qa5-a4-home.jpg');

// ---------- 2. 会话B：壁纸02 + 头像B ----------
await ev(`(() => { const el = [...document.querySelectorAll('[data-row-key]')].find(e => e.dataset.rowKey === ${JSON.stringify(B.key)}); if (el) { el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true })); el.click(); } return 1; })()`);
await wait(2000);
g = await grab();
R.bBefore = { head: g.headFace, video: g.video?.srcTail, bRow: g.rows.find(r => r.key === B.key)?.face };
check(R.bBefore.video === BASELINE_BG, 'b-still-global-bg-before-pick', R.bBefore.video);
await openZzz();
const scopeB = await ev(`(() => { const s = document.getElementById('esc-scope-session'); return s ? { checked: s.getAttribute('aria-checked'), label: s.textContent.trim().slice(0, 40) } : null; })()`);
check(scopeB?.checked === 'true' && (scopeB?.label || '').includes('当前对话'), 'b-scope-default-session', scopeB);
await clickTab('动态背景');
const cardB = await ev(`(() => { const c = [...document.querySelectorAll('.esc-card')].find(x => { const nm = (x.querySelector('.nm') || {}).textContent || ''; return /·\\s*02/.test(nm) || x.dataset.vid === 'zzz-eridu-02'; }); if (!c) return 'nf'; c.click(); return (c.querySelector('.nm') || {}).textContent.trim().slice(0, 24); })()`);
await wait(2200);
await clickTab('代理人头像');
const pickB = await ev(`(() => { const cells = [...document.querySelectorAll('.esc-avcell')];
  const fileOf = c => { const i = c.querySelector('img'); if (i && i.src) return i.src.split('/').pop().split('?')[0];
    const m = (getComputedStyle(c).backgroundImage.match(/url\\(["']?([^"')]+)/) || [])[1]; return m ? m.split('/').pop().split('?')[0] : null; };
  const chatCells = cells.filter(c => { const i = c.querySelector('img'); const u = i ? i.src : ((getComputedStyle(c).backgroundImage.match(/url\\(["']?([^"')]+)/) || [])[1] || '');
    return u.includes('chat-icons'); });
  const used = [${JSON.stringify(pickRes.file)}];
  const c = chatCells.find(x => !used.includes(fileOf(x)));
  if (!c) return { ok: false, n: chatCells.length }; c.click(); return { ok: true, file: fileOf(c), name: (c.textContent || '').trim().slice(0, 16) }; })()`);
await wait(600);
const applyB = await ev(`(() => { const b = [...document.querySelectorAll('.esc button')].find(x => (x.textContent || '').trim() === '设为本对话头像'); if (!b) return 'nf'; b.click(); return 'ok'; })()`);
await wait(2200);
const lsB = await ev(`JSON.parse(localStorage.getItem('zzz-session-appearance-v1') || 'null')`);
g = await grab();
R.bAvatar = { card: cardB, pick: pickB, apply: applyB, after: { head: g.headFace, bRow: g.rows.find(r => r.key === B.key)?.face },
  video: g.video, entry: lsB && lsB[B.key] };
check(cardB !== 'nf' && pickB.ok && applyB === 'ok', 'b-pick-wallpaper02-avatar-ui', { card: cardB, pick: pickB });
check(g.headFace === pickB.file && g.rows.find(r => r.key === B.key)?.face === pickB.file, 'b-face-switched', R.bAvatar.after);
R.bVideoTail = g.video?.srcTail;
check(R.bVideoTail !== BASELINE_BG && R.bVideoTail !== R.aVideoTail && g.video?.readyState >= 2 && g.video?.videoWidth > 0, 'b-bg-02-rendered-distinct', g.video);
check(R.bAvatar.entry?.wallpaper === 'zzz-eridu-02' && R.bAvatar.entry?.avatar?.file === pickB.file, 'b-localstorage-entry', R.bAvatar.entry);
await shot('qa5-b1-home.jpg');
await closeSettings(); await wait(600);

// ---------- 3. 切换 A↔B 保持 + 气泡对应 ----------
const switchTo = async k => { await ev(`(() => { const el = [...document.querySelectorAll('[data-row-key]')].find(e => e.dataset.rowKey === ${JSON.stringify(k)}); if (el) { el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true })); el.click(); } return 1; })()`); await wait(1800); };
await switchTo(A.key);
scrollLastStep(); await wait(400);
g = await grab();
R.switchA = { head: g.headFace, video: g.video, bubble: g.bubbleFace };
check(g.headFace === pickRes.file && g.bubbleFace === pickRes.file, 'switch-back-A-faces+bubble', R.switchA);
check(g.video?.srcTail === R.aVideoTail && g.video?.readyState >= 2 && g.video?.videoWidth > 0, 'switch-back-A-bg-video', g.video);
await shot('qa5-c1-switch-A.jpg');
await switchTo(B.key);
scrollLastStep(); await wait(400);
g = await grab();
R.switchB = { head: g.headFace, video: g.video, bubble: g.bubbleFace };
check(g.headFace === pickB.file && g.bubbleFace === pickB.file, 'switch-to-B-faces+bubble', R.switchB);
check(g.video?.srcTail === R.bVideoTail && g.video?.readyState >= 2 && g.video?.videoWidth > 0, 'switch-to-B-bg-video', g.video);

// ---------- 4. reload 保持 + 全局继承（会话C）----------
await send('Page.reload', { ignoreCache: true }); await wait(4000);
for (let i = 0; i < 30; i++) { await wait(700); if (await ev(`!!document.querySelector('[data-row-key]') && document.readyState === 'complete'`)) break; }
await wait(1500);
const lsR = await ev(`JSON.parse(localStorage.getItem('zzz-session-appearance-v1') || 'null')`);
check(!!lsR && lsR[A.key]?.avatar?.file === pickRes.file && lsR[A.key]?.wallpaper === 'zzz-eridu-01' && lsR[B.key]?.wallpaper === 'zzz-eridu-02', 'reload-ls-entries-kept', lsR);
await switchTo(A.key);
g = await grab();
check(g.headFace === pickRes.file && g.video?.srcTail === R.aVideoTail && g.video?.readyState >= 2 && g.video?.videoWidth > 0, 'reload-A-appearance-applied', { head: g.headFace, video: g.video });
await shot('qa5-d1-after-reload-A.jpg');
await switchTo(C.key);
g = await grab();
R.inheritC = { head: g.headFace, video: g.video, cRow: g.rows.find(r => r.key === C.key)?.face };
check(g.video?.srcTail === BASELINE_BG, 'C-inherits-global-bg-active35', g.video?.srcTail);
check(g.headFace === R.base.cFace, 'C-inherits-auto-avatar', { head: g.headFace, expect: R.base.cFace });
await shot('qa5-d2-C-global-inherit.jpg');

// ---------- 5. 重置（会话A）：使用全局壁纸 + 恢复自动头像 ----------
await switchTo(A.key);
await openZzz();
const resetBg = await ev(`(() => { const b = [...document.querySelectorAll('.esc button')].find(x => (x.textContent || '').trim() === '使用全局壁纸'); if (!b) return 'nf'; b.click(); return 'ok'; })()`);
await wait(2200);
g = await grab();
R.resetBg = { click: resetBg, video: g.video };
check(resetBg === 'ok' && g.video?.srcTail === BASELINE_BG && g.video?.readyState >= 2 && g.video?.videoWidth > 0, 'A-reset-to-global-wallpaper', R.resetBg);
await clickTab('代理人头像');
const resetAv = await ev(`(() => { const b = [...document.querySelectorAll('.esc button')].find(x => (x.textContent || '').trim() === '恢复自动头像'); if (!b) return 'nf'; b.click(); return 'ok'; })()`);
await wait(2200);
g = await grab();
R.resetAv = { click: resetAv, head: g.headFace, aRow: g.rows.find(r => r.key === A.key)?.face };
check(resetAv === 'ok' && g.headFace === R.base.aFace, 'A-reset-to-auto-avatar', R.resetAv);
await shot('qa5-e1-A-reset.jpg');
await closeSettings();
scrollLastStep(); await wait(500);
g = await grab();
check(g.bubbleFace === R.base.aFace, 'A-bubble-back-to-auto', g.bubbleFace);

// ---------- 6. 网络 + 材质 + 恢复快照 ----------
R.postViolations = noPost();
check(R.postViolations.length === 0, 'no-POST-to-active-or-avatar', R.postViolations);
g = await grab();
check(g.material === R.preTestMaterial, 'material-unchanged-0.66-0.86-6', g.material);
// 恢复测前 localStorage 快照（清理我的测试写入）
const restore = await ev(`(() => { const snap = ${R.preTestLS};
  const before = Object.keys(localStorage);
  for (const k of before) if (!(k in snap)) localStorage.removeItem(k);
  for (const [k, v] of Object.entries(snap)) if (localStorage.getItem(k) !== v) localStorage.setItem(k, v);
  return { keysNow: Object.keys(localStorage).length, keysSnap: Object.keys(snap).length }; })()`);
R.restoreLS = restore;
check(restore.keysNow === restore.keysSnap, 'localStorage-restored-to-pretest', restore);
R.exceptions = exceptions;
check(exceptions.length === 0, 'no-runtime-exceptions', exceptions.slice(0, 2));
R.netSummary = { total: netLog.length, posts: netLog.filter(r => r.m === 'POST').map(r => r.u.slice(-40)) };

R.ok = R.fail.length === 0;
writeFileSync(join(TEMP, 'qa5-session-appearance.json'), JSON.stringify(R, null, 2));
console.log('RESULT ' + (R.ok ? 'ALL-PASS' : 'HAS-FAILURES') + ' pass=' + R.pass.length + ' fail=' + R.fail.length + ' | net POSTs: ' + JSON.stringify(R.netSummary.posts));
ws.close(); process.exit(R.ok ? 0 : 1);
