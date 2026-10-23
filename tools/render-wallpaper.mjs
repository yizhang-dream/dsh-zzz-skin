#!/usr/bin/env node
// 渲染壁纸：CDP 打开 wallpaper-art.html，页内 canvas 出 JPEG base64。
import { writeFileSync } from "node:fs";
const PORT = 9333;
const html = process.argv[2];
const out = process.argv[3];
const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
const page = list.find(t => t.type === "page" && !t.url.startsWith("devtools"));
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise(r => ws.onopen = r);
let id = 0; const pending = new Map();
ws.onmessage = e => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } };
const send = (method, params = {}) => new Promise(res => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
await send("Page.enable");
await send("Emulation.setDeviceMetricsOverride", { width: 1400, height: 900, deviceScaleFactor: 1, mobile: false });
await send("Page.navigate", { url: "file:///" + html.replace(/\\/g, "/") });
await new Promise(r => setTimeout(r, 1800));
const r = await send("Runtime.evaluate", { expression: "(function(){ return new Promise(function(res){ if (window.__done) { const c = document.querySelector('canvas'); const d = document.createElement('canvas'); d.width = 2560; d.height = 1440; d.getContext('2d').drawImage(c, 0, 0); res(d.toDataURL('image/jpeg', 0.9)); } else setTimeout(function(){ res(null); }, 4000); }); })()", awaitPromise: true, returnByValue: true });
const data = r.result && r.result.result && r.result.result.value;
if (!data) { console.error("render failed", JSON.stringify(r).slice(0, 300)); process.exit(1); }
writeFileSync(out, Buffer.from(data.split(",")[1], "base64"));
console.log("saved", out, Math.round(data.length / 1024) + "KB-b64");
ws.close(); process.exit(0);