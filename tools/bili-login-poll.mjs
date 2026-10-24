#!/usr/bin/env node
// 在 CDP Chrome 的 bilibili 页上下文轮询扫码登录态（cookie 落真 Chrome）。
// 用法：node bili-login-poll.mjs [轮数，默认 40，间隔 3s]
const PORT = process.env.CDP_PORT || 9333;
const ROUNDS = Number(process.argv[2] || 40);

const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
const page = list.find(t => t.type === 'page' && t.url.includes('bilibili.com'));
if (!page) { console.error('no bilibili page'); process.exit(1); }
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise(r => ws.onopen = r);
let id = 0; const pending = new Map();
ws.onmessage = e => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } };
const send = (m, params = {}) => new Promise(res => { pending.set(++id, res); ws.send(JSON.stringify({ id, method: m, params })); });
const ev = async x => (await send('Runtime.evaluate', { expression: x, returnByValue: true, awaitPromise: true })).result.result.value;

for (let i = 0; i < ROUNDS; i++) {
  const r = await ev(`fetch('http://127.0.0.1:8767/keys').then(r => r.json()).then(async keys => {
    const out = [];
    for (const k of keys) {
      try {
        const resp = await fetch('https://passport.bilibili.com/x/passport-login/web/qrcode/poll?qrcode_key=' + k.key, { credentials: 'include' });
        const j = await resp.json();
        out.push({ key: k.key.slice(0, 8), code: j.code, msg: (j.message || '').slice(0, 30) });
      } catch (e) { out.push({ key: k.key.slice(0, 8), err: e.message }); }
    }
    return out;
  })`);
  const ok = Array.isArray(r) && r.find(x => x.code === 0);
  console.log(new Date().toISOString().slice(11, 19), JSON.stringify(r));
  if (ok) { console.log('LOGIN OK'); ws.close(); process.exit(0); }
  await new Promise(r2 => setTimeout(r2, 3000));
}
console.error('timeout without login');
ws.close();
process.exit(1);
