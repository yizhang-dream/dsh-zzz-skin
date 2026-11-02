// zenless.tools 聊天生成器：量头像几何 + 气泡配色 + 字体（与 auraa 站、我方实现对三方对照）
const wsUrl = process.argv[2];
const ws = new WebSocket(wsUrl);
await new Promise(r => ws.onopen = r);
let id = 0; const pending = new Map();
ws.onmessage = e => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } };
const send = (m, p = {}) => new Promise(r => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method: m, params: p })); });
const ev = async f => (await send('Runtime.evaluate', { expression: f, returnByValue: true, awaitPromise: true })).result.result.value;
await send('Page.enable'); await send('Page.bringToFront');
await send('Page.reload');
await new Promise(r => setTimeout(r, 6000));

// 探测：按钮和现有消息
const probe = await ev(`(() => ({
  btns: [...document.querySelectorAll('button')].map(b => (b.textContent || '').trim().slice(0, 20)).filter(Boolean).slice(0, 25),
  text: (document.body.innerText || '').slice(0, 500),
}))()`);
console.log(JSON.stringify(probe, null, 1));
process.exit(0);
