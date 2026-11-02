// zzz-console 复验：换上等稳 → 分表计数 + 状态 + 会话页截图 → 还原用户当前选择
const PORT = 9334;
const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
const page = list.filter(t => t.type === 'page' && !t.url.startsWith('devtools')).find(t => t.url.includes('100.112.92.62'));
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise(r => ws.onopen = r);
let id = 0; const pending = new Map();
ws.onmessage = e => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } };
const send = (m, p = {}) => new Promise(r => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method: m, params: p })); });
const ev = async f => (await send('Runtime.evaluate', { expression: f, returnByValue: true, awaitPromise: true })).result.result.value;
const shot = async name => {
  const s = await send('Page.captureScreenshot', { format: 'jpeg', quality: 90 });
  const fs = await import('node:fs');
  fs.writeFileSync(`C:/Users/zyz/.zcode/dsh-zzz-skin/Temp/${name}.jpg`, Buffer.from(s.result.data, 'base64'));
  console.log('shot:', name);
};
const ACTIVE_BEFORE = await ev(`fetch('/api/eridu-skins/active').then(r=>r.json()).then(j=>j.id)`);
console.log('user active before:', ACTIVE_BEFORE);
await send('Page.enable'); await send('Page.bringToFront');

const state = `(() => {
  const per = [];
  let rules = 0;
  for (const s of document.styleSheets) {
    if (!s.href || !s.href.includes('eridu-skins')) continue;
    let n = -1; try { n = s.cssRules.length; rules += n; } catch {}
    per.push(s.href.split('/skin/')[1]?.split('?')[0] + ':' + n);
  }
  const arrow = document.querySelector('.EvIC1a_flowItem[data-chat-anchor-key*=":assistant"]:not([data-chat-anchor-key*="["])');
  return JSON.stringify({
    attr: document.documentElement.getAttribute('data-dsh-skin'),
    sheets: per, rules,
    bodyBefore: getComputedStyle(document.body, '::before').content.slice(0, 8),
    canvasVar: getComputedStyle(document.body).getPropertyValue('--zzz-canvas').trim(),
    video: !!document.querySelector('[data-dsh-skin-layer=background] video'),
    arrowBg: arrow ? getComputedStyle(arrow, '::after').backgroundColor : 'no-row',
  });
})()`;

// 打开测试会话（昨天建的那条），让气泡/头像/箭头入镜
await ev(`(() => { const items = [...document.querySelectorAll('.pI_x6G_sidebarCol [class*=session], .pI_x6G_sidebarCol a')]; const it = items.find(x => (x.textContent||'').includes('你好')); if (it) { it.click(); return 'opened'; } return 'not-found:' + items.length; })()`);
await new Promise(r => setTimeout(r, 2500));

await ev(`document.getElementById('eridu-entry')?.click()`); await new Promise(r => setTimeout(r, 700));
await ev(`(() => { const c = [...document.querySelectorAll('.ecard')].find(x => x.dataset.id === 'zzz-console'); c?.click(); return !!c; })()`);
await new Promise(r => setTimeout(r, 3500));
await ev(`document.getElementById('eridu-close')?.click(); document.querySelector('#eridu-ov')?.click();`);
await new Promise(r => setTimeout(r, 1500));
console.log('console:', await ev(state));
await shot('console-conversation');

// 基准照：当前用户选择
await ev(`document.getElementById('eridu-entry')?.click()`); await new Promise(r => setTimeout(r, 600));
await ev(`(() => { const c = [...document.querySelectorAll('.ecard')].find(x => x.dataset.id === '${ACTIVE_BEFORE}'); c?.click(); return !!c; })()`);
await new Promise(r => setTimeout(r, 3500));
await ev(`document.getElementById('eridu-close')?.click(); document.querySelector('#eridu-ov')?.click();`);
await new Promise(r => setTimeout(r, 1500));
console.log('restored:', await ev(state));
await shot('baseline-conversation');
process.exit(0);
