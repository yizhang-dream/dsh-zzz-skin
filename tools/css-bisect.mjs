// 定位 zzz-console patches 的 CSS 解析断点（页面内 replaceSync + 二分）
const list = await (await fetch('http://127.0.0.1:9334/json/list')).json();
const page = list.filter(t => t.type === 'page' && !t.url.startsWith('devtools')).find(t => t.url.includes('100.112.92.62'));
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise(r => ws.onopen = r);
let id = 0; const pending = new Map();
ws.onmessage = e => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } };
const send = (m, p = {}) => new Promise(r => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method: m, params: p })); });
const ev = async f => {
  const r = await send('Runtime.evaluate', { expression: f, returnByValue: true, awaitPromise: true });
  if (r.result.exceptionDetails) return 'EXC: ' + (r.result.exceptionDetails.exception?.description || r.result.exceptionDetails.text).slice(0, 300);
  return r.result.result.value;
};
const out = await ev(`fetch('/api/eridu-skins/skin/zzz-console/patches').then(r => r.text()).then(t => {
  const bad = s => { try { new CSSStyleSheet().replaceSync(s); return false; } catch { return true; } };
  if (!bad(t)) {
    const sh = new CSSStyleSheet(); sh.replaceSync(t);
    return JSON.stringify({ fullOk: true, rules: sh.cssRules.length });
  }
  let lo = 0, hi = t.length;
  while (hi - lo > 64) { const mid = (lo + hi) >> 1; if (bad(t.slice(0, mid))) hi = mid; else lo = mid; }
  return JSON.stringify({ fullOk: false, breakAt: lo, context: t.slice(Math.max(0, lo - 120), lo + 60) });
})`);
console.log(out);
process.exit(0);
