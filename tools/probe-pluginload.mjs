// 探针 v4：服务刚重启、页面尚未加载——抓「重启后首个加载」是否复现 invalid-plugin，
// 并用 hook 记录每个 factory 的返回形状，定位肇事 id。
const TOKEN = process.argv[2];
const PORT = 9334;
const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
const page = list.filter((t) => t.type === 'page' && !t.url.startsWith('devtools')).find((t) => t.url.includes('100.112.92.62'));
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((r) => (ws.onopen = r));
let id = 0; const pending = new Map(); const consoleMsgs = []; const logEntries = [];
ws.onmessage = (e) => {
  const m = JSON.parse(e.data);
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); return; }
  if (m.method === 'Runtime.consoleAPICalled')
    consoleMsgs.push(`[${m.params.type}] ` + m.params.args.map((a) => a.value ?? a.description ?? a.type).join(' ').slice(0, 300));
  if (m.method === 'Runtime.exceptionThrown')
    consoleMsgs.push('[exception] ' + (m.params.exceptionDetails.text + ' ' + (m.params.exceptionDetails.exception?.description || '')).slice(0, 400));
  if (m.method === 'Log.entryAdded')
    logEntries.push(`[log:${m.params.entry.level}] ` + (m.params.entry.text + ' ' + (m.params.entry.url || '')).slice(0, 240));
};
const send = (m, p = {}) => new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method: m, params: p })); });
const ev = async (f) => (await send('Runtime.evaluate', { expression: f, returnByValue: true, awaitPromise: true })).result.result.value;

await send('Page.enable'); await send('Runtime.enable'); await send('Log.enable'); await send('Page.bringToFront');
const hookAdd = await send('Page.addScriptToEvaluateOnNewDocument', { source: `
(function () {
  window.__eriduMods = [];
  function hook(ml) {
    const orig = ml.load ? ml.load.bind(ml) : null;
    if (!orig) return;
    ml.load = function (def) {
      const f = def && def.factory;
      if (typeof f === 'function') def.factory = function () {
        const r = f.apply(this, arguments);
        try { window.__eriduMods.push([def.id, typeof r, !!(r && r.apply), r === undefined]); } catch {}
        return r;
      };
      return orig(def);
    };
  }
  let cur;
  Object.defineProperty(window, '__ModuleLoader__', {
    configurable: true,
    get() { return cur; },
    set(v) { cur = v; try { hook(v); } catch (e) { window.__eriduHookErr = String(e); } },
  });
})();` });
console.log('hook in, first-load-after-restart navigate');
await send('Page.navigate', { url: `http://100.112.92.62:3081/?token=${TOKEN}` });
await new Promise((r) => setTimeout(r, 16000));

const arr = JSON.parse((await ev(`JSON.stringify(window.__eriduMods || [])`)) || '[]');
console.log('--- module shapes ---');
arr.forEach(([mid, t, hasApply, und]) => { if (und || !hasApply) console.log('BAD  ', JSON.stringify([mid, t, hasApply, und])); });
console.log('total recorded:', arr.length, 'hookErr:', await ev(`String(window.__eriduHookErr||'none')`));
const ours = arr.find(([mid]) => String(mid).includes('eridu'));
console.log('our entry shape:', JSON.stringify(ours || 'NOT-RECORDED'));
const bad1 = consoleMsgs.filter((x) => x.includes('invalid plugin'));
const bad2 = logEntries.filter((x) => x.includes('invalid plugin'));
console.log('--- invalid-plugin: console', bad1.length, '/ log', bad2.length, '/ allConsole', consoleMsgs.length, '/ allLog', logEntries.length);
[...bad1, ...bad2].slice(0, 4).forEach((x) => console.log(x));
console.log('--- other errors ---');
consoleMsgs.filter((x) => x.startsWith('[error]') || x.startsWith('[exception]')).slice(0, 8).forEach((x) => console.log(x));
console.log('--- skin ---', await ev(`JSON.stringify({attr: document.documentElement.getAttribute('data-dsh-skin'), entry: !!document.getElementById('eridu-entry')})`));
await send('Page.removeScriptToEvaluateOnNewDocument', { identifier: hookAdd.result.identifier }).catch(() => {});
process.exit(0);
