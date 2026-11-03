#!/usr/bin/env node
// material-browser.mjs — 独立 headless Chrome (CDP) 采集工具（v96 材料基线）
// 铁律：只连独立实例端口（默认 9347），绝不连 9333/9334 用户浏览器；绝不 bringToFront。
// 会话（登录 URL 等）存 Temp/material-session.json（未跟踪，不得提交）。
//
// 用法：node tools/material-browser.mjs <cmd> [args...]   [MB_PORT=9347]
//   login [url]        登录（默认读 Temp/material-session.json 的 loginUrl），等 app 就绪
//   open <url>         导航任意 URL（如参考站）
//   reload             刷新并等 app 就绪
//   theme dark|light   页内临时切 data-ds-dark-theme（不落账号设置；完毕记得还原/刷新）
//   theme restore      还原登录时的原始主题属性状态
//   width <w> <h> [dpr] 固定视口（默认 1440x900 DPR1）
//   shot <name.jpg>    1440x900 视口截图 → Temp/<name>.jpg（绝对路径也可）
//   probe              布局 DOM + computed 背景 + CSSOM + 主题/皮肤状态 → Temp/material-probe.json
//   neterr             刷新一次，收集网络失败/4xx5xx + console 异常 → Temp/material-neterr.json
//   click <css>        DOM click（querySelector 命中即 click()，不发鼠标坐标）
//   eval "<js>"        求值并打印 JSON（awaitPromise, returnByValue）
//   url                打印当前页 URL
import { writeFileSync, readFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';

const REPO = 'C:/Users/zyz/.zcode/dsh-zzz-skin';
const TEMP = join(REPO, 'Temp');
const SESSION = join(TEMP, 'material-session.json');
// 白名单端口：仅允许本次独立实例 9347（MB_PORT 显式传 9347 也行）；其余一律拒绝，尤其 9333/9334 用户浏览器
const PORT = process.env.MB_PORT || '9347';
if (PORT !== '9347') {
  console.error(`refuse: port ${PORT} 不在白名单（仅 9347 独立实例允许；9333/9334 是用户浏览器绝不触碰）`); process.exit(2);
}
const PROFILE_MARK = 'cdp-profile-v96'; // 启动时 --user-data-dir 标记，连错实例会被下面核验拦下
const [, , cmd, ...args] = process.argv;
const log = (...a) => console.log(...a);
const sleep = ms => new Promise(r => setTimeout(r, ms));
import { readFileSync as _rf, existsSync as _ex } from 'node:fs';
const session = _ex(SESSION) ? JSON.parse(_rf(SESSION, 'utf8')) : {};

// --- CDP 连接（先核验 browser 命令行确系本独立 profile）---
try {
  const ver = await (await fetch(`http://127.0.0.1:${PORT}/json/version`)).json();
  const wsB = new WebSocket(ver.webSocketDebuggerUrl);
  await new Promise((res, rej) => { wsB.onopen = res; wsB.onerror = rej; });
  let bid = 0; const bres = new Promise(res => { wsB.onmessage = e => { const m = JSON.parse(e.data); if (m.id === 1) res(m); }; });
  wsB.send(JSON.stringify({ id: 1, method: 'Browser.getBrowserCommandLine' }));
  const m = await Promise.race([bres, new Promise(r => setTimeout(() => r(null), 2000))]);
  wsB.close();
  if (m?.error) {
    // Chrome 仅在 --enable-automation 时返回命令行；此时退回端口白名单兜底（已是仅 9347）
    log(`profile check skipped（${m.error.message.slice(0, 60)}；端口白名单仍生效）`);
  } else {
    const args2 = m?.result?.arguments || [];
    const udd = args2.find(a => a.startsWith('--user-data-dir=') || a === '--user-data-dir');
    const uddVal = udd ? (udd.includes('=') ? udd.split('=').slice(1).join('=') : args2[args2.indexOf(udd) + 1]) : '';
    if (!uddVal.includes(PROFILE_MARK)) {
      console.error(`refuse: 9347 实例的 --user-data-dir="${uddVal}" 不含 ${PROFILE_MARK}，疑似连错浏览器，中止`);
      process.exit(2);
    }
    log('profile check ok:', PROFILE_MARK);
  }
} catch (e) { console.error('browser 核验失败（实例不在？）：', e.cause?.code || e.message); process.exit(2); }

const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
const pages = list.filter(t => t.type === 'page' && !t.url.startsWith('devtools'));
if (cmd === 'targets') { console.log(JSON.stringify(pages.map(p => ({ id: p.id, url: p.url.split('?')[0].slice(0, 60) })))); process.exit(0); }
if (cmd === 'newtab') {
  const url = args.find(a => a !== 'v1440') || session.loginUrl;
  const nt = await (await fetch(`http://127.0.0.1:${PORT}/json/new?${new URLSearchParams({ url })}`, { method: 'PUT' })).json();
  console.log('newtab id:', nt.id, 'url:', (nt.url || '').split('?')[0]); process.exit(0);
}
// MB_TARGET=<id前缀或URL子串> 选目标页；默认取第一个非 about:blank 页
const page = (process.env.MB_TARGET ? pages.find(t => t.id.startsWith(process.env.MB_TARGET) || t.url.includes(process.env.MB_TARGET)) : null)
  || pages.sort((a, b) => (a.url === 'about:blank' ? 1 : 0) - (b.url === 'about:blank' ? 1 : 0))[0];
if (!page) { console.error('no page target on port ' + PORT); process.exit(1); }
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise(r => ws.onopen = r);
let id = 0; const pending = new Map(); const listeners = [];
ws.onmessage = e => {
  const m = JSON.parse(e.data);
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); return; }
  for (const l of listeners) l(m);
};
const send = (method, params = {}) => new Promise(res => {
  const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method, params }));
});
const ev = async expr => {
  const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
  if (r.result?.exceptionDetails) return { __error: String(r.result.exceptionDetails.exception?.description || r.result.exceptionDetails.text) };
  return r.result?.result?.value;
};

// --- 帮助 ---
const APP_HOST = '100.112.92.62';
const readyExpr = `(() => { const f = document.querySelector('[class*="_frame"]'); return !!f && document.readyState === 'complete'; })()`;
async function waitApp(ms = 40000) {
  for (let i = 0; i < ms / 1000; i++) {
    if (await ev(readyExpr)) { log('app ready after ~' + i + 's'); return true; }
    await sleep(1000);
  }
  log('app NOT ready in ' + ms + 'ms（继续执行，结果可能不完整）'); return false;
}
async function setViewport(w = 1440, h = 900, dpr = 1) {
  await send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: dpr, mobile: false });
  await sleep(900);
}
async function shot(name) {
  const out = /^[A-Za-z]:|^[/\\]/.test(name) ? name : join(TEMP, name);
  const jpeg = /\.jpe?g$/i.test(out);
  const m = await send('Page.captureScreenshot', { format: jpeg ? 'jpeg' : 'png', quality: jpeg ? 88 : undefined });
  writeFileSync(out, Buffer.from(m.result.data, 'base64'));
  log('saved', out);
}
// session 已在顶部读取（newtab 分支在连接前就要用 loginUrl）

// --- 命令 ---
await send('Page.enable'); await send('Runtime.enable');
// 任意命令可附 v1440 参数：本会话内强制 1440x900@DPR1（覆盖不跨会话保留，须同会话内用掉）
if (args.includes('v1440')) {
  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
  await sleep(1200);
}
if (cmd === 'login') {
  const url = args[0] || session.loginUrl;
  if (!url) { console.error('no loginUrl：先 ssh lab-ts ~/apps/dsh-url.sh 写入会话文件'); process.exit(1); }
  await setViewport(1440, 900);
  await send('Page.navigate', { url });
  await sleep(3000); await waitApp();
  session.originalDark = await ev(`document.body.hasAttribute('data-ds-dark-theme')`);
  session.lastUrl = await ev('location.href.split("?")[0]');
  writeFileSync(SESSION, JSON.stringify(session, null, 2));
  log('logged in; originalDark=' + session.originalDark + '（凭据不入日志）');
} else if (cmd === 'open') {
  await setViewport(1440, 900);
  await send('Page.navigate', { url: args[0] });
  await sleep(5000);
  log('opened', await ev('location.href'));
} else if (cmd === 'reload') {
  await send('Page.reload', { ignoreCache: true });
  await sleep(3000); await waitApp();
} else if (cmd === 'theme') {
  const v = args[0];
  if (v === 'dark') log('dark now:', await ev(`document.body.setAttribute('data-ds-dark-theme',''); document.body.hasAttribute('data-ds-dark-theme')`));
  else if (v === 'light') log('light now:', await ev(`document.body.removeAttribute('data-ds-dark-theme'); !document.body.hasAttribute('data-ds-dark-theme')`));
  else if (v === 'restore') {
    const want = session.originalDark ?? true;
    log('restore:', await ev(`document.body.${want ? "setAttribute('data-ds-dark-theme','')" : "removeAttribute('data-ds-dark-theme')"}; document.body.hasAttribute('data-ds-dark-theme')`));
  } else console.error('theme dark|light|restore');
  await sleep(800);
} else if (cmd === 'width') {
  await setViewport(+args[0] || 1440, +args[1] || 900, +(args[2] || 1));
  log('viewport', args.join('x'));
} else if (cmd === 'shot') {
  await shot(args[0]);
} else if (cmd === 'shot1440') {
  // 同一会话内：1440x900@DPR1 → 验证 innerWidth/innerHeight → 截图（评审统一口径）
  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
  await sleep(1200);
  const got = await ev('JSON.stringify([innerWidth, innerHeight])');
  log('viewport now', got);
  await shot(args[0]);
} else if (cmd === 'shotvw') {
  // shotvw <w> <h> <name.jpg>：一会话内设视口→读 innerW/H+frame 溢出→截图
  const [w, h] = [+args[0], +args[1]];
  await send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: false });
  await sleep(1500);
  const info = await ev(`(() => { const de = document.documentElement, f = document.querySelector('[class*="_frame"]');
    return JSON.stringify({ vp: [innerWidth, innerHeight], docScroll: [de.scrollWidth, de.scrollHeight],
      frameScroll: f ? [f.scrollWidth, f.scrollHeight] : null, frameClient: f ? [f.clientWidth, f.clientHeight] : null }); })()`);
  log(info);
  await shot(args[2]);
} else if (cmd === 'lightshot') {
  // 一会话内：1440x900 → 临时去 data-ds-dark-theme → 截图 → 还原原主题属性（不落账号设置）
  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
  await sleep(1200);
  await ev('document.body.removeAttribute("data-ds-dark-theme")');
  await sleep(2500);
  const darkNow = await ev('document.body.hasAttribute("data-ds-dark-theme")');
  log('light applied (dark attr =', darkNow + ')');
  await shot(args[0]);
  const want = session.originalDark ?? true;
  await ev(`document.body.${want ? 'setAttribute("data-ds-dark-theme","")' : 'removeAttribute("data-ds-dark-theme")'}`);
  await sleep(600);
  log('theme restored to originalDark=' + want);
} else if (cmd === 'probe') {
  const data = await ev(`(() => {
  const out = { url: location.href.split('?')[0], title: document.title };
  out.skinAttr = document.documentElement.getAttribute('data-dsh-skin');
  out.dark = document.body.hasAttribute('data-ds-dark-theme');
  out.htmlClass = document.documentElement.className.slice(0,120);
  out.bodyClass = document.body.className.slice(0,120);
  const frame = document.querySelector('[class*="_frame"]');
  const pick = (el) => el ? { cls: String(el.className).slice(0,200), tag: el.tagName } : null;
  const metrics = (el) => { if (!el) return null; const s = getComputedStyle(el); const r = el.getBoundingClientRect();
    return { cls: String(el.className).slice(0,200), tag: el.tagName, rect: { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) },
      display: s.display, gridCols: s.gridTemplateColumns, gridRows: s.gridTemplateRows, flexDir: s.flexDirection,
      bg: s.backgroundColor, bgImage: s.backgroundImage.slice(0,160), radius: s.borderRadius, opacity: s.opacity, overflow: s.overflow }; };
  out.frame = metrics(frame);
  out.frameChildren = frame ? [...frame.children].map(c => metrics(c)) : [];
  const sb = document.querySelector('[class*="_sidebarCol"]');
  const cc = document.querySelector('[class*="_centerCol"]');
  out.sidebar = metrics(sb); out.center = metrics(cc);
  const header = document.querySelector('[class*="_header"], header');
  out.topbar = metrics(header);
  const composer = document.querySelector('[contenteditable=true]')?.closest('[class*="_input"],[class*="_composer"],[class*="_footer"]')
    || document.querySelector('[class*="_composer"], [class*="_inputWrap"], [class*="_footer"]');
  out.composer = metrics(composer);
  out.composerEditable = metrics(document.querySelector('[contenteditable=true]'));
  // 最近一条助手消息的头像（只记 hash，不外发 URL）
  const av = [...document.querySelectorAll('[data-chat-anchor-key*=":assistant"] img')].slice(-3)
    .map(i => i.src).filter(Boolean);
  out.avatarSrcCount = new Set(av).size;
  // CSSOM 概览
  const sheets = [...document.styleSheets].map(sh => {
    let n = 0, skinScoped = 0;
    try { for (const r of sh.cssRules) { n++; const t = r.selectorText || (r.cssText||'').slice(0,80); if (typeof t === 'string' && t.includes('[data-dsh-skin]')) skinScoped++; } } catch {}
    return { href: sh.href ? sh.href.split('/').pop().slice(0,80) : (sh.ownerNode?.tagName === 'STYLE' ? 'inline<style>' : '?'), rules: n, skinScoped };
  }).filter(s => s.rules > 0);
  out.sheets = sheets.slice(0, 40);
  out.inlineStyleSizes = [...document.querySelectorAll('style')].map(s => s.textContent.length).filter(n => n > 500);
  return JSON.stringify(out);
})()`);
  const parsed = typeof data === 'string' ? JSON.parse(data) : data;
  const avHash = await ev(`[...document.querySelectorAll('[data-chat-anchor-key*=":assistant"] img')].slice(-3).map(i=>i.src).filter(Boolean).map(s=>s.length)`);
  writeFileSync(join(TEMP, 'material-probe.json'), JSON.stringify(parsed, null, 2));
  log(JSON.stringify({ ...parsed, sheets: parsed.sheets?.length + ' sheets', avatarImgLens: avHash }, null, 1));
  log('full → Temp/material-probe.json');
} else if (cmd === 'neterr') {
  const errs = []; const netErr = [];
  listeners.push(m => {
    if (m.method === 'Network.loadingFailed') netErr.push({ url: m.params.requestId, err: m.params.errorText, blocked: m.params.blockedReason || '' });
    if (m.method === 'Runtime.exceptionThrown') errs.push(String(m.params.exceptionDetails?.exception?.description || m.params.exceptionDetails?.text || '').slice(0, 300));
    if (m.method === 'Log.entryAdded' && m.params.entry?.level === 'error') errs.push(String(m.params.entry.text).slice(0, 300));
  });
  await send('Network.enable'); await send('Log.enable');
  const reqs = new Map();
  listeners.push(m => { if (m.method === 'Network.requestWillBeSent') reqs.set(m.params.requestId, m.params.request.url); });
  await send('Page.reload', { ignoreCache: true });
  await sleep(4000); await waitApp(30000); await sleep(3000);
  const bad = netErr.map(e => ({ url: (reqs.get(e.url) || '').replace(/token=[^&]+/g, 'token=***'), err: e.err, blocked: e.blocked }));
  const out = { url: await ev('location.href.split("?")[0]'), networkFailed: bad, consoleErrors: errs.slice(0, 40) };
  writeFileSync(join(TEMP, 'material-neterr.json'), JSON.stringify(out, null, 2));
  log(JSON.stringify(out, null, 1)); log('full → Temp/material-neterr.json');
} else if (cmd === 'key') {
  // key <Enter|Tab|Escape|ArrowRight|ArrowLeft|Home|End>：真实键盘事件（range 滑块用 Arrow）
  const map = { Enter: ['\r', 13], Tab: ['\t', 9], Escape: ['\u001b', 27], ArrowRight: ['', 39], ArrowLeft: ['', 37], Home: ['', 36], End: ['', 35], ArrowUp: ['', 38], ArrowDown: ['', 40] };
  const [text, vk] = map[args[0]] || ['a', 65];
  for (const type of ['keyDown', 'keyUp'])
    await send('Input.dispatchKeyEvent', { type, key: args[0], text: type === 'keyDown' && text ? text : undefined, code: args[0], windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk });
  await sleep(300);
  log('key', args[0], 'ok');
} else if (cmd === 'click') {
  log('clicked:', await ev(`(() => { const el = document.querySelector(${JSON.stringify(args[0])}); if (!el) return 'not found'; el.click(); return String(el.className).slice(0,120) || el.tagName; })()`));
  await sleep(1500);
} else if (cmd === 'eval') {
  log(JSON.stringify(await ev(args.filter(a => a !== 'v1440').join(' '))));
} else if (cmd === 'url') {
  log(await ev('location.href.split("?")[0]'));
} else {
  console.error('commands: login|open|reload|theme|width|shot|probe|neterr|click|eval|url');
}
ws.close(); process.exit(0);
