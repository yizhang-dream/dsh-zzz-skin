#!/usr/bin/env node
// 真实集成验收：node tools/verify-materials.mjs <isolated-target-id>
// 只连接独立 headless Chrome 9347，目标 id 须先从当前列表核对；不修改服务器激活态/头像。
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const out = join(dirname(fileURLToPath(import.meta.url)), '..', 'Temp');
const targets = await (await fetch('http://127.0.0.1:9347/json/list')).json();
const page = targets.find(p => p.id === process.argv[2] && p.url.startsWith('http://100.112.92.62:3081/'));
if (!page) throw new Error('Isolated app target no longer matches');
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise(r => ws.onopen = r);
let seq = 0; const pending = new Map(); const errors = [];
ws.onmessage = e => {
  const m = JSON.parse(e.data);
  if (m.id) { const p = pending.get(m.id); if (p) { pending.delete(m.id); m.error ? p.reject(new Error(JSON.stringify(m.error))) : p.resolve(m.result); } }
  else if (m.method === 'Runtime.exceptionThrown') errors.push(m.params.exceptionDetails.text);
};
const send = (method, params = {}) => new Promise((resolve, reject) => { const id = ++seq; pending.set(id, { resolve, reject }); ws.send(JSON.stringify({ id, method, params })); });
const ev = async expression => { const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }); if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text); return r.result.value; };
const wait = ms => new Promise(r => setTimeout(r, ms));
const assert = (ok, message) => { if (!ok) throw new Error(message); };
const shot = async name => { const r = await send('Page.captureScreenshot', { format: 'jpeg', quality: 90 }); writeFileSync(join(out, name), Buffer.from(r.data, 'base64')); };
const key = async (key, code, vk, modifiers = 0) => { for (const type of ['rawKeyDown', 'keyUp']) await send('Input.dispatchKeyEvent', { type, key, code, windowsVirtualKeyCode: vk, modifiers }); await wait(250); };
async function materialPage() {
  if (!await ev('!!document.querySelector("[role=dialog]")')) { await key(',', 'Comma', 188, 3); await wait(700); }
  assert(await ev('!!document.querySelector("[role=dialog]")'), 'Settings shortcut did not open dialog');
  const nav = await ev('[...document.querySelectorAll("[role=dialog] button")].map(x=>x.textContent.trim())');
  assert(nav.includes('皮肤中心'), 'Skin center navigation missing');
  await ev('[...document.querySelectorAll("[role=dialog] button")].find(x=>x.textContent.trim()==="皮肤中心").click()');
  await wait(400);
  assert(await ev('!!document.querySelector(".esc")'), 'Skin section missing');
  assert(await ev('[...document.querySelectorAll(".esc-tab")].some(x=>x.textContent==="界面材质")'), 'Material tab missing');
  await ev('[...document.querySelectorAll(".esc-tab")].find(x=>x.textContent==="界面材质").click()');
  await wait(300);
  return ev('[...document.querySelectorAll(".esc input[type=range]")].map(x=>({id:x.id,value:x.value,label:document.querySelector(`label[for="${x.id}"]`)?.textContent,min:x.min,max:x.max}))');
}
const values = () => ev('({panel:document.body.style.getPropertyValue("--zzz-panel-alpha"),bubble:document.body.style.getPropertyValue("--dsh-skin-bubble-alpha"),blur:document.body.style.getPropertyValue("--zzz-panel-blur"),saved:JSON.parse(localStorage.getItem("dsh-eridu-material-v1"))})');
const result = {};
try {
  await send('Runtime.enable'); await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
  result.skin = await ev('document.documentElement.getAttribute("data-dsh-skin")');
  assert(result.skin === 'zzz-eridu-35', 'Unexpected selected skin');
  result.ranges = await materialPage();
  assert(result.ranges.length === 3 && result.ranges.every(x => x.label), 'Three labelled material sliders required');
  for (const range of result.ranges) {
    await ev(`document.getElementById(${JSON.stringify(range.id)}).focus()`);
    await key('End', 'End', 35);
  }
  result.changed = await values();
  assert(result.changed.panel === '0.9' && result.changed.bubble === '1' && result.changed.blur === '18px', 'Keyboard sliders did not update body variables');
  await shot('v96-material-settings.jpg');
  await send('Page.reload', { ignoreCache: true });
  for (let i = 0; i < 40; i++) { await wait(300); if (await ev('!!document.querySelector("[data-dsh-skin-layer] video") && document.body.style.getPropertyValue("--zzz-panel-blur")==="18px"')) break; }
  result.persisted = await values();
  assert(result.persisted.panel === '0.9' && result.persisted.bubble === '1' && result.persisted.blur === '18px', 'Reload did not restore material settings');
  await materialPage();
  await ev('document.querySelector(".esc-mat-reset").click()'); await wait(250);
  result.reset = await values();
  assert(result.reset.panel === '0.66' && result.reset.bubble === '0.86' && result.reset.blur === '6px', 'Reset did not restore defaults');
  await shot('v96-material-defaults.jpg');
  await key('Escape', 'Escape', 27); await wait(300);
  assert(!await ev('!!document.querySelector("[role=dialog]")'), 'Settings did not close');
  await ev('document.querySelector("[data-dsh-skin-layer] video").pause()');
  await ev('document.body.style.setProperty("--zzz-panel-blur","0px")'); await wait(400); await shot('v96-blur-0.jpg');
  await ev('document.body.style.setProperty("--zzz-panel-blur","18px")'); await wait(400); await shot('v96-blur-18.jpg');
  await ev('document.body.style.setProperty("--zzz-panel-blur","6px")'); await wait(400); await shot('v96-final-dark.jpg');
  result.render = await ev('(()=>{const c=document.querySelector(".pI_x6G_centerCol"),s=getComputedStyle(c);return {viewport:[innerWidth,innerHeight],video:getComputedStyle(document.querySelector("[data-dsh-skin-layer] video")).filter,centerBackground:s.backgroundColor,centerRadius:s.borderRadius,mark:getComputedStyle(c,"::before").content,documentSize:[document.documentElement.scrollWidth,document.documentElement.scrollHeight]}})()');
  assert(result.render.video.includes('blur(6px)') && result.render.centerBackground.includes('0.66'), 'Rendered materials differ from defaults');
  await ev('document.body.removeAttribute("data-ds-dark-theme")'); await wait(1200); await shot('v96-final-light.jpg');
  await ev('document.body.setAttribute("data-ds-dark-theme","")'); await wait(500);
  await send('Emulation.setDeviceMetricsOverride', { width: 820, height: 900, deviceScaleFactor: 1, mobile: false }); await wait(400); await shot('v96-final-narrow.jpg');
  result.narrow = await ev('({viewport:[innerWidth,innerHeight],scroll:[document.documentElement.scrollWidth,document.documentElement.scrollHeight]})');
  assert(result.narrow.scroll[0] === 820 && result.narrow.scroll[1] === 900, 'Narrow viewport overflow');
  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
  result.errors = errors;
  assert(errors.length === 0, 'Runtime exceptions during material interaction');
  result.ok = true;
  writeFileSync(join(out, 'v96-material-e2e.json'), JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2));
} finally { ws.close(); }
