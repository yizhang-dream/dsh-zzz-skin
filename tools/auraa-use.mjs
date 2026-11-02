// 读 auraa 站使用说明 + 打开发送区结构，弄清怎么切换左/右侧消息
const wsUrl = process.argv[2];
const ws = new WebSocket(wsUrl);
await new Promise(r => ws.onopen = r);
let id = 0; const pending = new Map();
ws.onmessage = e => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } };
const send = (m, p = {}) => new Promise(r => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method: m, params: p })); });
const ev = async f => (await send('Runtime.evaluate', { expression: f, returnByValue: true, awaitPromise: true })).result.result.value;
await send('Page.enable'); await send('Page.bringToFront');

// 展开帮助
const help = await ev(`(() => {
  const b = [...document.querySelectorAll('button')].find(x => /how do I use it/i.test(x.textContent||''));
  if (b) b.click();
  return 'clicked';
})()`);
await new Promise(r => setTimeout(r, 600));
const helpText = await ev(`document.body.innerText.slice(0, 2500)`);
console.log('=== HELP ===');
console.log(helpText);
process.exit(0);
