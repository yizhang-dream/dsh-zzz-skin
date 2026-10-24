#!/usr/bin/env node
// Bing 图搜：解析结果页 murl 下载候选图。用法：node img-search.mjs <query> <outdir> [count]
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const [, , query, outdir, countArg] = process.argv;
const COUNT = Number(countArg || 8);
mkdirSync(outdir, { recursive: true });

const url = 'https://www.bing.com/images/search?q=' + encodeURIComponent(query) + '&form=HDRSC2&first=1';
const html = await (await fetch(url, {
  headers: {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
    'Accept-Language': 'zh-CN,zh;q=0.9',
  },
})).text();

const metas = [...html.matchAll(/class="iusc"[^>]*\sm="([^"]+)"/g)].map(m => {
  try { return JSON.parse(m[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&')); } catch { return null; }
}).filter(Boolean);
console.log('candidates:', metas.length);
let saved = 0;
for (const m of metas.slice(0, COUNT)) {
  const murl = m.murl;
  if (!murl) continue;
  try {
    const r = await fetch(murl, { headers: { 'User-Agent': 'Mozilla/5.0', Referer: 'https://www.bing.com/' }, signal: AbortSignal.timeout(15000) });
    if (!r.ok) continue;
    const buf = Buffer.from(await r.arrayBuffer());
    if (buf.length < 30000) continue; // 太小跳过
    const ext = /image\/(png|jpeg|webp)/.exec(r.headers.get('content-type') || '')?.[1] || 'jpg';
    const name = `ref-${String(saved).padStart(2, '0')}-${(m.t || 'img').replace(/[\\/:*?"<>|\s]+/g, '').slice(0, 24)}.${ext}`;
    writeFileSync(join(outdir, name), buf);
    console.log('saved', name, (buf.length / 1024).toFixed(0) + 'KB', 'from', murl.slice(0, 80));
    saved++;
  } catch (e) { /* skip */ }
}
console.log('total saved:', saved);
