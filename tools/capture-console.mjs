// 终版采集：console/基线 × 亮/暗四张截图（暗档=临时注入 data-ds-dark-theme，不落账号设置）
// 结束把 active 还原为用户最后手选（从 /list.active 读）
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
  const s = await send('Page.captureScreenshot', { format: 'jpeg', quality: 88 });
  const fs = await import('node:fs');
  fs.writeFileSync(`C:/Users/zyz/.zcode/dsh-zzz-skin/Temp/${name}.jpg`, Buffer.from(s.result.data, 'base64'));
  console.log('shot:', name);
};
await send('Page.enable'); await send('Page.bringToFront');
const USER_ACTIVE = process.argv[2] || await ev(`fetch('/api/eridu-skins/list').then(r=>r.json()).then(j=>j.active)`);
console.log('user active:', USER_ACTIVE);

// 优先打开已有测试会话（在吗/你好），没有再新建
const opened = await ev(`(() => { const items = [...document.querySelectorAll('.pI_x6G_sidebarCol [class*=session], .pI_x6G_sidebarCol a, .pI_x6G_sidebarCol button')]; const it = items.find(x => /在吗|你好/.test(x.textContent||'')); if (it) { it.click(); return 'reuse'; } return null; })()`);
if (!opened) {
// 建新会话并要一条 AI 回复（气泡/头像/箭头入镜）
await ev(`(() => { const b = [...document.querySelectorAll('.pI_x6G_sidebarCol button, .pI_x6G_sidebarCol [role=button]')].find(x => (x.textContent||'').includes('新会话')); b?.click(); return !!b; })()`);
await new Promise(r => setTimeout(r, 1800));
await ev(`(() => { const el = document.querySelector('.uV2eYG_input[contenteditable=true]'); if (!el) return false; el.focus(); return true; })()`);
await send('Input.insertText', { text: '在吗' });
await new Promise(r => setTimeout(r, 400));
await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, nativeVirtualKeyCode: 13 });
await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, nativeVirtualKeyCode: 13 });
for (let i = 0; i < 15; i++) {
  await new Promise(r => setTimeout(r, 2000));
  const st = JSON.parse(await ev(`JSON.stringify({ a: document.querySelectorAll('[data-chat-anchor-key*=":assistant"]').length, lastLen: (() => { const rows=[...document.querySelectorAll('[data-chat-anchor-key*=":assistant"]')]; return (rows[rows.length-1]?.textContent||'').length; })() })`));
  if (st.a > 0 && st.lastLen > 6) { console.log('reply in', (i+1)*2 + 's'); break; }
}
await new Promise(r => setTimeout(r, 1500));
} // end if (!opened)
if (opened) { console.log('session:', opened); await new Promise(r => setTimeout(r, 2000)); }

// 空壳卡探针：会话区里「有边框、无文本、矮条」的元素（盲评残留 #9）
const emptyCard = await ev(`(() => {
  const pane = document.querySelector('[data-pane="conversation"], .pI_x6G_centerCol');
  if (!pane) return 'no-pane';
  const hits = [];
  for (const el of pane.querySelectorAll('*')) {
    const st = getComputedStyle(el);
    const bw = parseFloat(st.borderTopWidth) || 0;
    const r = el.getBoundingClientRect();
    if (bw >= 1 && r.width > 300 && r.height < 40 && !(el.textContent || '').trim() && el.children.length === 0) {
      hits.push(el.tagName + '.' + String(el.className).slice(0, 40) + ' [' + Math.round(r.width) + 'x' + Math.round(r.height) + ']');
      if (hits.length >= 4) break;
    }
  }
  return JSON.stringify(hits);
})()`);
console.log('empty-bordered elements:', emptyCard);
// 头像探针：AI 行头像伪元素背景是否真图
console.log('avatar pseudo:', await ev(`(() => { const row = document.querySelector('.EvIC1a_flowItem[data-chat-anchor-key*=":assistant"]:not([data-chat-anchor-key*="["])'); if (!row) return 'no-row'; const st = getComputedStyle(row, '::before'); return JSON.stringify({ bg: st.backgroundImage.slice(0, 90), w: st.width }); })()`));

const switchTo = async sk => {
  await ev(`document.getElementById('eridu-entry')?.click()`);
  await new Promise(r => setTimeout(r, 700));
  const ok = await ev(`(() => { const c = [...document.querySelectorAll('.ecard')].find(x => x.dataset.id === '${sk}'); if (c) { c.click(); return true; } return false; })()`);
  await new Promise(r => setTimeout(r, 3200));
  await ev(`document.getElementById('eridu-close')?.click(); document.querySelector('#eridu-ov')?.click();`);
  await new Promise(r => setTimeout(r, 900));
  return ok;
};
const darkOn = () => ev(`document.body.setAttribute('data-ds-dark-theme',''); 'dark-on'`);
const darkOff = () => ev(`document.body.removeAttribute('data-ds-dark-theme'); 'dark-off'`);

// console × 亮/暗
await switchTo('zzz-console');
await shot('console-light');
await darkOn(); await new Promise(r => setTimeout(r, 900)); await shot('console-dark'); await darkOff();

// 基线（用户当前选择）× 亮/暗
await switchTo(USER_ACTIVE);
await shot('baseline-light');
await darkOn(); await new Promise(r => setTimeout(r, 900)); await shot('baseline-dark'); await darkOff();

console.log('final:', await ev(`(() => ({ attr: document.documentElement.getAttribute('data-dsh-skin'), rules: (() => { let n=0; for (const s of document.styleSheets) if (s.href && s.href.includes('eridu-skins')) { try { n += s.cssRules.length; } catch {} } return n; })() }))()`).then ? '' : '');
console.log('end');
process.exit(0);
