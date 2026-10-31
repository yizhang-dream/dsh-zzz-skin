// 箭头验收 v2：同 tick 量 rect + 立即整幅截图（零等待），图内找泡缘再量箭头
const PORT = 9334;
const mode = process.argv[2] || 'dark';
const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
const page = list.filter((t) => t.type === 'page' && !t.url.startsWith('devtools')).find((t) => t.url.includes('100.112.92.62'));
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((r) => (ws.onopen = r));
let id = 0; const pending = new Map();
ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } };
const send = (m, p = {}) => new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method: m, params: p })); });
const ev = async (f) => (await send('Runtime.evaluate', { expression: f, returnByValue: true, awaitPromise: true })).result.result.value;
await send('Page.enable');
await send('Page.bringToFront');
await send('Page.reload', { ignoreCache: true });
await new Promise((r) => setTimeout(r, 4000));
let n = await ev(`document.querySelectorAll('[data-chat-anchor-key*=":assistant-step"]:not([data-chat-anchor-key*="["]):not([hidden])').length`);
if (!n) {
  await ev(`(()=>{const r=[...document.querySelectorAll('.YDXeBa_sessionRow')].find(x=>x.textContent.includes('启启启'))||[...document.querySelectorAll('.YDXeBa_sessionRow')].find(x=>!String(x.className).includes('selected'))||document.querySelectorAll('.YDXeBa_sessionRow')[0];r&&r.click();return 1})()`);
  await new Promise((r) => setTimeout(r, 4500));
}
await ev(`document.body.toggleAttribute('data-ds-dark-theme', ${mode === 'dark'})`);
// 禁 smooth scroll + 瞬时滚到短 AI 行，然后静置
await ev(`(()=>{
  const s=document.createElement('style');s.id='__noSmooth';s.textContent='*{scroll-behavior:auto!important}';
  if(!document.getElementById('__noSmooth'))document.head.appendChild(s);
  const rows=[...document.querySelectorAll('[data-chat-anchor-key*=":assistant"]:not([data-chat-anchor-key*="["]):not([hidden])')];
  const short=rows.filter(el=>{const r=el.getBoundingClientRect();return r.height>30&&r.height<400;});
  if(short[0])short[0].scrollIntoView({block:'center'});
  return short.length;
})()`);
await new Promise((r) => setTimeout(r, 700));
// 同 tick：量两个 rect 后立刻截图（中间零等待）
const rects = ev(`JSON.stringify((()=>{
  const rows=[...document.querySelectorAll('[data-chat-anchor-key*=":assistant"]:not([data-chat-anchor-key*="["]):not([hidden])')];
  const short=rows.filter(el=>{const r=el.getBoundingClientRect();return r.height>30&&r.height<400&&r.y>60&&r.y+80<innerHeight;});
  const ai=short[0];
  const us=[...document.querySelectorAll('.EvIC1a_flowItem[data-chat-anchor-key*=":input-message"] [class*="_bubble"]:not([role="tooltip"])')].filter(u=>{const r=u.getBoundingClientRect();return r.y>60&&r.y+50<innerHeight&&r.width>30;});
  const u=us[us.length-1];
  const R=(el)=>{const r=el.getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height};};
  return {ai:ai?R(ai):null,user:u?R(u):null,dpr:devicePixelRatio};
})())`);
const shot = send('Page.captureScreenshot', { format: 'png' });
const [infoStr, shotRes] = await Promise.all([rects, shot]);
console.log(infoStr);
const { writeFileSync } = await import('node:fs');
writeFileSync(`build/arrow-${mode}.png`, Buffer.from(shotRes.result.data, 'base64'));
console.log(`saved build/arrow-${mode}.png`);
ws.close();
