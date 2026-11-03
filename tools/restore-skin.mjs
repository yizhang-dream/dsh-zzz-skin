// 恢复激活皮肤为指定 id（默认 zzz-eridu-13）
const wsUrl = process.argv[2];
const target = process.argv[3] || 'zzz-eridu-13';
const ws = new WebSocket(wsUrl);
await new Promise(r => ws.onopen = r);
let id = 0; const pending = new Map();
ws.onmessage = e => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } };
const send = (m, p = {}) => new Promise(r => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method: m, params: p })); });
const ev = async f => (await send('Runtime.evaluate', { expression: f, returnByValue: true, awaitPromise: true })).result.result.value;
const post = `fetch('/api/eridu-skins/active', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id: '${target}' }) }).then(r => r.json()).then(j => JSON.stringify(j))`;
console.log(await ev(post));
await send('Page.reload', { ignoreCache: true });
await new Promise(r => setTimeout(r, 9000));
console.log('final skin:', await ev(`document.documentElement.getAttribute('data-dsh-skin')`));
process.exit(0);
