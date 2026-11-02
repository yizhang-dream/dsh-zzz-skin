// 从已登录 DSH 页同源 POST /api/eridu-skins/avatar 重放当前头像选择（南宫羽）
const wsUrl = process.argv[2];
const ws = new WebSocket(wsUrl);
await new Promise(r => ws.onopen = r);
let id = 0; const pending = new Map();
ws.onmessage = e => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } };
const send = (m, p = {}) => new Promise(r => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method: m, params: p })); });
const ev = async f => (await send('Runtime.evaluate', { expression: f, returnByValue: true, awaitPromise: true })).result.result.value;
const out = await ev(`fetch('/api/eridu-skins/avatar', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ dir: 'portraits', file: 'IconRoleCircle59_01.webp', name: '南宫羽' }),
}).then(r => r.json()).then(j => JSON.stringify(j))`);
console.log(out);
process.exit(0);
