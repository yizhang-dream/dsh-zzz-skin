// 查 DSH 是否有正在生成的回复/运行中的任务（决定能否安全重载服务）
const wsUrl = process.argv[2];
const ws = new WebSocket(wsUrl);
await new Promise(r => ws.onopen = r);
let id = 0; const pending = new Map();
ws.onmessage = e => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } };
const send = (m, p = {}) => new Promise(r => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method: m, params: p })); });
const ev = async f => (await send('Runtime.evaluate', { expression: f, returnByValue: true })).result.result.value;
const busy = await ev(`(() => ({
  running: !!document.querySelector('[class*=runningContent]'),
  busyAttr: !!document.querySelector('[aria-busy=true]'),
  stopBtn: [...document.querySelectorAll('button')].some(b => /停止/.test(b.getAttribute('aria-label') || '')),
  title: document.title,
}))()`);
console.log(JSON.stringify(busy));
process.exit(0);
