// 验证 HARNESS「Failed to load plugins」修复（client factory 现在返回 exports.apply）
// 用法：node tools/verify-pluginload.mjs <token>
const TOKEN = process.argv[2] || process.env.DSH_TOKEN;
const PORT = 9334;
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);
const watchdog = setTimeout(() => { console.log('VERDICT: FAIL (watchdog timeout)'); process.exit(3); }, 75000);
watchdog.unref?.();

const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
const page = list.filter((t) => t.type === 'page' && !t.url.startsWith('devtools')).find((t) => t.url.includes('100.112.92.62'));
if (!page) { console.error('NO DSH PAGE OPEN'); process.exit(1); }
log('target:', page.url.slice(0, 60));
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = (e) => rej(new Error('ws error ' + JSON.stringify(e))); setTimeout(() => rej(new Error('ws open timeout')), 10000); });
log('ws open');
let id = 0; const pending = new Map(); const errors = [];
ws.onmessage = (e) => {
  const m = JSON.parse(e.data);
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); return; }
  if (m.method === 'Runtime.consoleAPICalled' && (m.params.type === 'error' || m.params.type === 'warning'))
    errors.push(`[${m.params.type}] ` + m.params.args.map((a) => a.value ?? a.description ?? a.type).join(' ').slice(0, 300));
  if (m.method === 'Runtime.exceptionThrown')
    errors.push('[exception] ' + (m.params.exceptionDetails.text + ' ' + (m.params.exceptionDetails.exception?.description || '')).slice(0, 300));
};
const send = (m, p = {}) => new Promise((r, rej) => {
  const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method: m, params: p }));
  setTimeout(() => { if (pending.has(i)) { pending.delete(i); rej(new Error('send timeout ' + m)); } }, 20000);
});
const ev = async (f) => (await send('Runtime.evaluate', { expression: f, returnByValue: true, awaitPromise: true })).result.result.value;

await send('Page.enable'); await send('Runtime.enable'); await send('Page.bringToFront');
log('navigating with fresh token');
await send('Page.navigate', { url: `http://100.112.92.62:3081/?token=${TOKEN}` });
await new Promise((r) => setTimeout(r, 10000));
log('hard reload');
await send('Page.reload', { ignoreCache: true });
await new Promise((r) => setTimeout(r, 10000));

const s = JSON.parse(await ev(`JSON.stringify({
  url: location.href.slice(0, 50),
  attr: document.documentElement.getAttribute('data-dsh-skin'),
  accent: getComputedStyle(document.body).getPropertyValue('--zzz-accent').trim() || '(空)',
  bgVid: document.querySelector('[data-dsh-skin-layer=background] video')?.src?.slice(-24) || null,
  links: [...document.querySelectorAll('link[data-dsh-skin-link]')].map((l) => l.href.split('/skin/')[1]?.split('/')[0]),
  entry: !!document.getElementById('eridu-entry'),
  banner: (() => { const t = document.body.innerText; const i = t.indexOf('Failed to load plugins'); return i >= 0 ? t.slice(Math.max(0, i - 40), i + 120) : null; })(),
  clientBundle: performance.getEntriesByType('resource').map((r) => r.name).filter((n) => n.includes('eridu')).slice(0, 3),
})`));
log('snapshot:', JSON.stringify(s, null, 1));
let bundleShape = null;
for (const u of s.clientBundle || []) {
  const src = await ev(`fetch(${JSON.stringify(u)},{cache:'reload'}).then(r=>r.text()).then(t=>JSON.stringify({hasApply:t.includes('exports.apply'),hasReturn:t.includes('return module.exports')}))`).catch((e) => JSON.stringify({ err: String(e) }));
  bundleShape = { url: u.split('/').slice(-2).join('/'), ...JSON.parse(src) };
  break;
}
log('bundle:', JSON.stringify(bundleShape));
const bad = errors.filter((x) => /invalid plugin|Failed to load|eridu/i.test(x));
log('plugin-related console:', bad.length ? bad : '(none)');
log('all console err/warn count:', errors.length);
const ok = s.attr && s.entry && !s.banner && bundleShape?.hasApply && !bad.some((x) => x.includes('invalid plugin'));
console.log(ok ? 'VERDICT: PASS' : 'VERDICT: FAIL');
clearTimeout(watchdog);
process.exit(ok ? 0 : 2);
