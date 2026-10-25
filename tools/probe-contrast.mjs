const PORT = 9333;
const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
const page = list.find(t => t.type === 'page' && !t.url.startsWith('devtools'));
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise(r => ws.onopen = r);
let id = 0; const pending = new Map();
ws.onmessage = e => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } };
const send = (method, params = {}) => new Promise(res => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
const ev = async expr => {
  const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
  if (r.result?.exceptionDetails) return { error: String(r.result.exceptionDetails.exception?.description || r.result.exceptionDetails.text) };
  return r.result?.result?.value;
};

// 逐层合成半透明底色后再算 WCAG 对比度
console.log(JSON.stringify(await ev(`(() => {
  const parse = c => { const m = c.match(/rgba?\\(([^)]+)\\)/); if (!m) return null; const p = m[1].split(/[ ,\\/]+/).map(Number); return [p[0], p[1], p[2], p.length > 3 ? p[3] : 1]; };
  const over = (top, base) => [top[0]*top[3] + base[0]*(1-top[3]), top[1]*top[3] + base[1]*(1-top[3]), top[2]*top[3] + base[2]*(1-top[3]), 1];
  const bgOf = el => {
    const stack = [];
    let n = el;
    while (n && n !== document.documentElement) { const p = parse(getComputedStyle(n).backgroundColor); if (p && p[3] > 0) stack.push(p); n = n.parentElement; }
    let acc = [251, 249, 244, 1]; // 纸底兜底
    for (let i = stack.length - 1; i >= 0; i--) acc = over(stack[i], acc);
    return acc;
  };
  const lum = rgb => { const f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; return 0.2126*f(rgb[0]) + 0.7152*f(rgb[1]) + 0.0722*f(rgb[2]); };
  const cr = (a, b) => { const L1 = Math.max(a, b), L2 = Math.min(a, b); return +((L1 + 0.05) / (L2 + 0.05)).toFixed(2); };
  const out = []; const seen = new Set();
  for (const el of document.querySelectorAll('[role=dialog] *')) {
    const txt = [...el.childNodes].filter(n => n.nodeType === 3).map(n => n.textContent.trim()).join('');
    if (!txt || txt.length < 2) continue;
    const cs = getComputedStyle(el);
    const fg = parse(cs.color); if (!fg) continue;
    const bg = bgOf(el);
    const ratio = cr(lum(fg), lum(bg));
    if (ratio < 3.5) {
      const key = txt.slice(0, 10) + cs.color + Math.round(bg[0]);
      if (seen.has(key)) continue; seen.add(key);
      out.push({ text: txt.slice(0, 20), color: cs.color, bg: 'rgb(' + bg.slice(0,3).map(Math.round).join(',') + ')', ratio, cls: (typeof el.className === 'string' ? el.className : '').slice(0, 38) });
    }
  }
  return out.slice(0, 15);
})()`), null, 1));
ws.close();
