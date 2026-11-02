// E2E：基座暗/亮档白泡验证 + console 卡回归 + 恢复用户激活皮肤
const wsUrl = process.argv[2];
const ws = new WebSocket(wsUrl);
await new Promise(r => ws.onopen = r);
let id = 0; const pending = new Map();
ws.onmessage = e => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } };
const send = (m, p = {}) => new Promise(r => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method: m, params: p })); });
const ev = async f => (await send('Runtime.evaluate', { expression: f, returnByValue: true, awaitPromise: true })).result.result.value;
const shot = async name => {
  const s = await send('Page.captureScreenshot', { format: 'jpeg', quality: 90 });
  (await import('node:fs')).writeFileSync(`C:/Users/zyz/.zcode/dsh-zzz-skin/Temp/${name}.jpg`, Buffer.from(s.result.data, 'base64'));
  console.log('shot:', name);
};
await send('Page.enable'); await send('Page.bringToFront');

const measure = `(async () => {
  const rows = [...document.querySelectorAll('.EvIC1a_flowItem[data-chat-anchor-key*=":assistant"]')].filter(r => !r.hidden && (r.textContent || '').trim());
  if (!rows.length) return 'no-rows';
  const row = rows[rows.length - 1];
  const s = getComputedStyle(row);
  const leaf = [...row.querySelectorAll('p, span, div')].filter(e => !e.children.length && (e.textContent || '').trim().length > 3)[0];
  const arrow = getComputedStyle(row, '::after'); // 仅记录，伪元素 computed 在该宿主不可信
  return JSON.stringify({
    skin: document.documentElement.getAttribute('data-dsh-skin'),
    dark: document.body.hasAttribute('data-ds-dark-theme'),
    bg: s.backgroundColor, color: s.color, radius: s.borderRadius, ml: s.marginLeft, shadow: s.boxShadow.slice(0, 50),
    leafColor: leaf ? getComputedStyle(leaf).color : null,
    arrowBg: arrow.backgroundColor,
  });
})()`;

const reload = async () => { await send('Page.reload', { ignoreCache: true }); await new Promise(r => setTimeout(r, 9000)); };
const openSession = async () => {
  await ev(`(() => { const items = [...document.querySelectorAll('.pI_x6G_sidebarCol [class*=session], .pI_x6G_sidebarCol a, .pI_x6G_sidebarCol button')]; const it = items.find(x => /在吗|你好/.test(x.textContent||'')); if (it) { it.click(); return 'ok'; } return 'nf'; })()`);
  await new Promise(r => setTimeout(r, 2500));
};

// ── 基座 zzz-eridu-10 ──
await reload(); await openSession();
console.log('base-light:', await ev(measure));
await ev(`document.body.setAttribute('data-ds-dark-theme',''); 'ok'`);
await new Promise(r => setTimeout(r, 300));
console.log('base-dark:', await ev(measure));
await shot('wb-base-dark');
await ev(`document.body.removeAttribute('data-ds-dark-theme'); 'ok'`);
await new Promise(r => setTimeout(r, 200));
console.log('base-light-recheck:', await ev(measure));
await shot('wb-base-light');

// ── console 卡回归 ──
console.log('switch:', await ev(`fetch('/api/eridu-skins/active', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id: 'zzz-console' }) }).then(r => r.json()).then(j => JSON.stringify(j))`));
await reload(); await openSession();
console.log('console-light:', await ev(measure));
await ev(`document.body.setAttribute('data-ds-dark-theme',''); 'ok'`);
await new Promise(r => setTimeout(r, 300));
console.log('console-dark:', await ev(measure));
await shot('wb-console-dark');
await ev(`document.body.removeAttribute('data-ds-dark-theme'); 'ok'`);

// ── 恢复用户激活皮肤 ──
console.log('restore:', await ev(`fetch('/api/eridu-skins/active', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id: 'zzz-eridu-10' }) }).then(r => r.json()).then(j => JSON.stringify(j))`));
await reload();
console.log('final:', await ev(`document.documentElement.getAttribute('data-dsh-skin')`));
process.exit(0);
