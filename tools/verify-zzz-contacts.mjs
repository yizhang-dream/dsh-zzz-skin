#!/usr/bin/env node
// verify-zzz-contacts.mjs — v9.7 联系人头像真实验收（只连独立 headless 9347）
// 铁律：不碰 9333/9334；不发消息；不点皮肤卡/不 Apply/不动材质滑块（只读值）；临时主题/视口结束还原。
// 用法：node tools/verify-zzz-contacts.mjs   → Temp/qa2-zzz-contacts.json + Temp/qa2-*.jpg
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

const TEMP = 'C:/Users/zyz/.zcode/dsh-zzz-skin/Temp';
const PORT = '9347';
if (process.env.MB_PORT && process.env.MB_PORT !== PORT) { console.error('port whitelist: 9347 only'); process.exit(2); }
const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
const page = list.find(p => p.type === 'page' && p.url.startsWith('http://100.112.92.62:3081/'));
if (!page) throw new Error('app target not found on 9347 (did the isolated browser die?)');
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise(r => ws.onopen = r);
let seq = 0; const pending = new Map(); const exceptions = []; const consoleErrs = [];
ws.onmessage = e => {
  const m = JSON.parse(e.data);
  if (m.id) { const p = pending.get(m.id); if (p) { pending.delete(m.id); m.error ? p.reject(new Error(JSON.stringify(m.error))) : p.resolve(m.result); } }
  else if (m.method === 'Runtime.exceptionThrown') exceptions.push(String(m.params.exceptionDetails?.exception?.description || m.params.exceptionDetails.text || '').slice(0, 260));
  else if (m.method === 'Log.entryAdded' && m.params.entry?.level === 'error') consoleErrs.push(String(m.params.entry.text).slice(0, 200));
};
const send = (m, p = {}) => new Promise((res, rej) => { const i = ++seq; pending.set(i, { resolve: res, reject: rej }); ws.send(JSON.stringify({ id: i, method: m, params: p })); });
const ev = async x => { const r = await send('Runtime.evaluate', { expression: x, returnByValue: true, awaitPromise: true }); if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text); return r.result.value; };
const wait = ms => new Promise(r => setTimeout(r, ms));
const shot = async name => { const r = await send('Page.captureScreenshot', { format: 'jpeg', quality: 88 }); if (!r || !r.data) throw new Error('screenshot failed: ' + JSON.stringify(r).slice(0, 120)); writeFileSync(join(TEMP, name), Buffer.from(r.data, 'base64')); console.log('shot', name); };
const viewport = async (w, h) => { await send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: false }); await wait(1200); };
const key = async (key, code, vk, modifiers = 0) => { for (const t of ['rawKeyDown', 'keyUp']) await send('Input.dispatchKeyEvent', { type: t, modifiers, key, code, windowsVirtualKeyCode: vk }); await wait(280); };
const R = { pass: [], fail: [] };
const check = (ok, name, detail) => { (ok ? R.pass : R.fail).push(name); console.log((ok ? 'PASS' : 'FAIL') + ' ' + name + (detail ? ' | ' + JSON.stringify(detail).slice(0, 300) : '')); return ok; };
const tail = u => String(u).split('/').slice(-2).join('/').slice(0, 48);

await send('Page.enable'); await send('Runtime.enable'); await send('Log.enable');

// ---------- 0. 取最新 client（contrast 补丁等） ----------
await send('Page.reload', { ignoreCache: true }); await wait(4000);
for (let i = 0; i < 30; i++) { await wait(700); if (await ev(`!!document.querySelector('[data-row-key]') && document.readyState === 'complete'`)) break; }
await wait(1500);

// ---------- 采集函数（页内） ----------
const grabState = () => ev(`(() => {
  const rows = [...document.querySelectorAll('[data-row-key]')].filter(e => String(e.dataset.rowKey).startsWith('session:'));
  const faceUrl = el => { const f = el && el.querySelector('.zzz-contact-face'); if (!f) return null; const m = getComputedStyle(f).backgroundImage.match(/url\\(["']?([^"')]+)/); return m ? m[1] : null; };
  const rowsOut = rows.map(r => { const f = r.querySelector('.zzz-contact-face'); const fr = f ? f.getBoundingClientRect() : null; const t = r.querySelector('[class*=title]');
    return { key: r.dataset.rowKey, title: t ? t.textContent.trim().slice(0, 24) : '', selected: /selected|active/i.test(String(r.className)) || r.getAttribute('aria-selected') === 'true',
      faceRect: fr ? [Math.round(fr.width), Math.round(fr.height)] : null, faceUrl: faceUrl(r) }; });
  const hf = document.querySelector('.zzz-contact-head-face');
  const hr = hf ? hf.getBoundingClientRect() : null;
  const nav = document.querySelector('[data-slot="conversation.header"] nav[aria-label="会话层级"]');
  // 气泡头像自 §14 起是 assistant-step 的 ::before 伪元素（--zzz-contact-avatar），不是 img/DOM 节点。
  // 判据：真实 assistant-step（key 含 assistant-step 且不以 '[' 开头，滤掉 group/reasoning 包装），
  // 高度 ≥30（长消息不限高，头像在泡顶、滚到顶部可见）、宽 >0、非 display:none/visibility:hidden，
  // 其 getComputedStyle(el,'::before').backgroundImage 解析出当前头像文件。
  const bubbleAvs = (() => {
    const cc = document.querySelector('[class*="_centerCol"]'); if (!cc) return [];
    const steps = [...cc.querySelectorAll('[data-chat-anchor-key]')].filter(e => {
      const k = e.getAttribute('data-chat-anchor-key');
      if (!k || !k.includes('assistant-step') || k.startsWith('[')) return false;
      const r = e.getBoundingClientRect(); if (r.height < 30 || r.width === 0) return false; // 长消息不限高，滚到顶部看头像
      const s = getComputedStyle(e); return s.display !== 'none' && s.visibility !== 'hidden';
    });
    return steps.slice(-6).map(e => { const m = getComputedStyle(e, '::before').backgroundImage.match(/url\\(["']?([^"')]+)/); return m ? m[1] : null; });
  })();
  return { rows: rowsOut, headerFace: hf ? { rect: [hr.x, hr.y, hr.width, hr.height].map(Math.round), url: (getComputedStyle(hf).backgroundImage.match(/url\\(["']?([^"')]+)/) || [])[1] || null } : null,
    crumb: nav ? (nav.querySelector('.wSkVaW_crumbCurrent') || {}).textContent || '' : null,
    bubbleAvs, skin: document.documentElement.getAttribute('data-dsh-skin'), dark: document.body.hasAttribute('data-ds-dark-theme') };
})()`);
const checkResources = urls => ev(`(async () => { const uniq = [...new Set(${JSON.stringify(urls)}.filter(Boolean))]; const out = [];
  for (const u of uniq) { try { const r = await fetch(u, { method: 'HEAD', cache: 'no-store' }); out.push({ tail: u.split('/').slice(-2).join('/').slice(0, 40), status: r.status }); } catch (e) { out.push({ tail: u.split('/').slice(-2).join('/').slice(0, 40), status: 'fetch-throw' }); } }
  return out; })()`);

// ---------- 1. 基线（暗档 1440） ----------
await viewport(1440, 900);
const s0 = await grabState();
R.base = s0;
check(s0.rows.length >= 2, 'sidebar-session-rows(' + s0.rows.length + ')');
check(s0.rows.every(r => r.faceRect && r.faceRect[0] === 28), 'row-face-28px', s0.rows.map(r => r.faceRect));
check(s0.headerFace && s0.headerFace.rect[2] === 34, 'header-face-34px', s0.headerFace && s0.headerFace.rect);
const selRow = s0.rows.find(r => r.selected);
check(!!selRow && s0.headerFace && selRow.faceUrl === s0.headerFace.url, 'header-face-matches-selected-row', { row: tail(selRow?.faceUrl), head: tail(s0.headerFace?.url) });
const uniqFaces = new Set(s0.rows.map(r => r.faceUrl)).size;
check(uniqFaces === s0.rows.length, 'distinct-faces-per-row(' + uniqFaces + '/' + s0.rows.length + ')');
R.resources = await checkResources([...s0.rows.map(r => r.faceUrl), s0.headerFace?.url, ...s0.bubbleAvs]);
check(R.resources.every(r => r.status === 200), 'face-resources-200', R.resources);
await shot('qa2-01-home-dark.jpg');

// 同名不同 ID（只检测现存，不造数据）
const titles = s0.rows.map(r => r.title);
const dup = titles.filter((t, i) => titles.indexOf(t) !== i);
R.sameName = { rows: s0.rows.map(r => ({ title: r.title, key: r.key.slice(0, 40) })), duplicates: [...new Set(dup)] };
check(new Set(s0.rows.map(r => r.key)).size === s0.rows.length, 'row-keys-unique');
console.log('same-name info:', JSON.stringify(R.sameName));

// ---------- 2. 设置：ZZZ 名 + 3 tabs（背景/头像/材质，深浅） ----------
if (!await ev(`!!document.querySelector('[role=dialog]')`)) { await key(',', 'Comma', 188, 3); await wait(900); }
const navCells = await ev(`[...document.querySelectorAll('[role=dialog] [class*=navCell] button, [role=dialog] [class*=navList] button')].map(b => (b.textContent || '').trim())`);
R.settingsNav = navCells;
const zzzCell = navCells.find(t => t === 'ZZZ');
check(!!zzzCell, 'settings-nav-zzz-name', zzzCell);
await ev(`(() => { const b = [...document.querySelectorAll('[role=dialog] button')].find(x => /${zzzCell}/.test((x.textContent || '').trim())); if (b) b.click(); return 1; })()`);
await wait(1300);
const tabs = await ev(`[...document.querySelectorAll('.esc-tab')].map(t => t.textContent.trim())`);
check(tabs.length === 3 && tabs.includes('动态背景') && tabs.includes('代理人头像') && tabs.includes('界面材质'), 'zzz-3-tabs', tabs);
R.zzzDialog = await ev(`(() => { const dlg = document.querySelector('[role=dialog]'); if (!dlg || !dlg.matches(':has(.esc)')) return { hasEsc: !!document.querySelector('.esc') };
  const s = getComputedStyle(dlg); const p = x => { const ps = getComputedStyle(dlg, x); return { content: String(ps.content).slice(0, 30), bgImage: ps.backgroundImage.slice(0, 60) }; };
  return { hasEsc: true, bgImage: s.backgroundImage.slice(0, 60), before: p('::before'), after: p('::after') }; })()`);
check(R.zzzDialog.bgImage === 'none' && R.zzzDialog.before?.content === 'none' && R.zzzDialog.after?.content === 'none', 'zzz-dialog-no-scan-texture', R.zzzDialog);
R.cards = await ev(`document.querySelectorAll('.esc-card').length`);
check(R.cards === 39, 'bg-cards-39', R.cards);
const shotHealthy = await ev(`(() => { const s = [...document.querySelectorAll('.esc-card .shot')]; return { n: s.length, zero: s.filter(x => x.getBoundingClientRect().height === 0).length }; })()`);
check(shotHealthy.n === 39 && shotHealthy.zero === 0, 'bg-shots-39-no-collapse', shotHealthy);
await shot('qa2-02-settings-bg-dark.jpg');
// 头像 tab
await ev(`(() => { const t = [...document.querySelectorAll('.esc-tab')].find(x => x.textContent.trim() === '代理人头像'); if (t) t.click(); return 1; })()`);
await wait(900);
R.avCells = await ev(`document.querySelectorAll('.esc-avcell').length`);
check(R.avCells > 0, 'avatar-tab-cells(' + R.avCells + ')');
await shot('qa2-03-settings-avatar-dark.jpg');
// 材质 tab（只读值，不动）
await ev(`(() => { const t = [...document.querySelectorAll('.esc-tab')].find(x => x.textContent.trim() === '界面材质'); if (t) t.click(); return 1; })()`);
await wait(700);
R.materials = await ev(`[...document.querySelectorAll('.esc input[type=range]')].map(x => ({ id: x.id, value: x.value }))`);
check(R.materials.length === 3 && R.materials.every(m => m.value), 'material-3-ranges-readonly', R.materials);
await shot('qa2-04-settings-material-dark.jpg');
// 亮档三 tab（新 CSS 深绿高亮目视）
await ev(`document.body.removeAttribute('data-ds-dark-theme')`); await wait(1600);
await ev(`(() => { const t = [...document.querySelectorAll('.esc-tab')].find(x => x.textContent.trim() === '动态背景'); if (t) t.click(); return 1; })()`);
await wait(800); await shot('qa2-05-settings-bg-light.jpg');
await ev(`(() => { const t = [...document.querySelectorAll('.esc-tab')].find(x => x.textContent.trim() === '代理人头像'); if (t) t.click(); return 1; })()`);
await wait(700); await shot('qa2-06-settings-avatar-light.jpg');
await ev(`(() => { const t = [...document.querySelectorAll('.esc-tab')].find(x => x.textContent.trim() === '界面材质'); if (t) t.click(); return 1; })()`);
await wait(600); await shot('qa2-07-settings-material-light.jpg');
await ev(`document.body.setAttribute('data-ds-dark-theme','')`); await wait(700);
await key('Escape', 'Escape', 27); await wait(400);
check(await ev(`!document.querySelector('[role=dialog]')`), 'settings-closed');

// ---------- 3. 切换会话（不发消息）：header/气泡头像随会话对应 ----------
const rowsNow = (await grabState()).rows;
const other = rowsNow.find(r => !r.selected);
check(!!other, 'has-second-session');
if (other) {
  await ev(`(() => { const el = [...document.querySelectorAll('[data-row-key]')].find(e => e.dataset.rowKey === ${JSON.stringify(other.key)}); if (el) { el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true })); el.click(); } return !!el; })()`);
  await wait(1500);
  const s1 = await grabState();
  check(s1.rows.find(r => r.key === other.key)?.selected === true, 'session2-selected');
  check(s1.headerFace && s1.headerFace.url === other.faceUrl, 'header-face-follows-session2', { head: tail(s1.headerFace?.url), row: tail(other.faceUrl) });
  check(s1.crumb.slice(0, 12) === other.title.slice(0, 12), 'crumb-follows-session2', { crumb: s1.crumb.slice(0, 20), title: other.title.slice(0, 20) });
  check(s1.bubbleAvs.length > 0, 'bubble-avatars-present(' + s1.bubbleAvs.length + ')');
  check(s1.bubbleAvs.every(u => u === other.faceUrl), 'bubble-face-matches-session2', { bubble: s1.bubbleAvs.map(tail), row: tail(other.faceUrl) });
  R.session2 = { key: other.key.slice(0, 40), title: other.title, headTail: tail(s1.headerFace?.url), rowTail: tail(other.faceUrl), bubbleTails: s1.bubbleAvs.map(tail).slice(0, 3) };
  await shot('qa2-08-session2-dark.jpg');
  // 切回原会话
  await ev(`(() => { const el = [...document.querySelectorAll('[data-row-key]')].find(e => e.dataset.rowKey === ${JSON.stringify(selRow.key)}); if (el) el.click(); return !!el; })()`);
  await wait(1500);
  const s2 = await grabState();
  check(s2.rows.find(r => r.key === selRow.key)?.selected === true, 'back-to-session1');
  check(s2.headerFace && s2.headerFace.url === selRow.faceUrl, 'header-face-back-to-session1', { head: tail(s2.headerFace?.url), row: tail(selRow.faceUrl) });
  await shot('qa2-09-session1-back-dark.jpg');
}

// ---------- 4. reload 映射保持 ----------
await send('Page.reload', { ignoreCache: true }); await wait(4000);
for (let i = 0; i < 30; i++) { await wait(700); if (await ev(`!!document.querySelector('[data-row-key]') && document.readyState === 'complete'`)) break; }
await wait(1500);
const s3 = await grabState();
R.afterReload = { rows: s3.rows.map(r => ({ key: r.key.slice(0, 40), title: r.title, selected: r.selected, face: tail(r.faceUrl) })), head: tail(s3.headerFace?.url) };
const before = s0.rows.map(r => r.key + '|' + tail(r.faceUrl)).sort().join(';');
const afterR = s3.rows.map(r => r.key + '|' + tail(r.faceUrl)).sort().join(';');
check(before === afterR, 'reload-preserves-face-mapping', { beforeCount: s0.rows.length, afterCount: s3.rows.length });
const sel3 = s3.rows.find(r => r.selected);
check(!!sel3 && sel3.faceUrl === s3.headerFace?.url, 'reload-header-face-consistent', { row: tail(sel3?.faceUrl), head: tail(s3.headerFace?.url) });
await shot('qa2-10-after-reload-dark.jpg');

// ---------- 5. 亮档主界面 ----------
await ev(`document.body.removeAttribute('data-ds-dark-theme')`); await wait(1600);
await shot('qa2-11-home-light.jpg');
await ev(`document.body.setAttribute('data-ds-dark-theme','')`); await wait(700);

// ---------- 6. 视口 820 / 390 ----------
await viewport(820, 900);
R.v820 = await ev(`({ vp: [innerWidth, innerHeight], scroll: [document.documentElement.scrollWidth, document.documentElement.scrollHeight] })`);
await shot('qa2-12-narrow-820.jpg');
await viewport(390, 844);
R.v390 = await ev(`(() => ({ vp: [innerWidth, innerHeight], scroll: [document.documentElement.scrollWidth, document.documentElement.scrollHeight], rows: [...document.querySelectorAll('.zzz-contact-face')].length, head: !!document.querySelector('.zzz-contact-head-face') }))()`);
await shot('qa2-13-narrow-390.jpg');
await viewport(1440, 900);

// ---------- 7. runtime 异常 ----------
R.exceptions = exceptions; R.consoleErrors = consoleErrs.slice(0, 20);
check(exceptions.length === 0, 'no-runtime-exceptions', exceptions.slice(0, 3));
R.ok = R.fail.length === 0;
writeFileSync(join(TEMP, 'qa2-zzz-contacts.json'), JSON.stringify(R, null, 2));
console.log('RESULT ' + (R.ok ? 'ALL-PASS' : 'HAS-FAILURES') + ' pass=' + R.pass.length + ' fail=' + R.fail.length);
ws.close(); process.exit(R.ok ? 0 : 1);
