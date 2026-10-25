#!/usr/bin/env node
// 版本主题生成器：基座皮肤 + 主题表 → dist/<id>/ 独立皮肤目录。
// 部署后每个主题在皮肤中心各成一张卡，点选即换——「每个版本都可以换」。
// 用法：node build-versions.mjs [主题id...]（默认全部）
// 壁纸来源：refs/desktop 官方版本宣传图（×2 lanczos 上采样，assets/themes/）。
import { mkdirSync, copyFileSync, readdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(fileURLToPath(import.meta.url));
const SKIN = join(ROOT, '..');
const DIST = join(SKIN, 'dist');

function hexA(hex, a) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
}

export const THEMES = [
  {
    id: 'zzz-zenless-welcome',
    wallL: 106.6,
    name: '新艾利都 · 迎新',
    verName: '迎新',
    verNameEn: 'Welcome to New Eridu',
    accent: '#ffd53e', accentSoft: '#ffe98a',
    canvasDark: '#10131f', canvasLight: '#f2f4f8',
    wallpaper: 'wallpaper-welcome.jpg',
    tagline: '全员群像 · 天蓝×标志黄 · WELCOME TO NEW ERIDU',
    desc: '「欢迎来到新艾利都」全员群像主视觉，天蓝画布 × 标志斜光黄，巨幅 X 形光束母题。',
    order: 21,
  },
  {
    id: 'zzz-zenless-sixth-street',
    wallL: 111.1,
    name: '新艾利都 · 六分街',
    verName: '六分街',
    verNameEn: 'Sixth Street',
    accent: '#f58a1f', accentSoft: '#e9b32a',
    canvasDark: '#12201f', canvasLight: '#f2f4ec',
    wallpaper: 'wallpaper-sixth-street.jpg',
    tagline: '录像带店开业 · 青绿×橙 · 六分街日常',
    desc: '铃与哲的录像带店开张场景，青绿街巷 × 橙黄点缀，纸箱与邦布的六分街生活流。',
    order: 22,
  },
  {
    id: 'zzz-zenless-hollow',
    wallL: 96.9,
    name: '新艾利都 · 空洞威胁',
    verName: '空洞威胁',
    verNameEn: 'Hollow Threat',
    accent: '#e63946', accentSoft: '#ff6a70',
    canvasDark: '#141826', canvasLight: '#f4f0f0',
    wallpaper: 'wallpaper-hollow.jpg',
    tagline: '迎战空洞 · 猩红×深藏青 · 巨物对角线',
    desc: '代理人迎战巨物的战斗主视觉，猩红 × 深藏青，对角线战斗构图与巨物压迫感。',
    order: 23,
  },
  {
    id: 'zzz-zenless-v13',
    wallL: 60.2,
    name: '新艾利都 · 1.3 虚拟杀机',
    verName: '1.3 虚拟杀机',
    verNameEn: '1.3 Virtual Revenge',
    accent: '#f24ca0', accentSoft: '#ff7ec5',
    canvasDark: '#1a1030', canvasLight: '#f5f0f6',
    wallpaper: 'wallpaper-v13.jpg',
    tagline: '虚拟杀机 · 黑紫×品红 · 时钟齿轮母题',
    desc: '1.3「虚拟杀机 VIRTUAL REVENGE」版本主题：黑紫底 × 品红/青绿，钟面齿轮与故障扫描线母题。',
    order: 24,
  },
  {
    id: 'zzz-zenless-outer-ring',
    wallL: 105.8,
    name: '新艾利都 · 外环落日',
    verName: '外环落日',
    verNameEn: 'Outer Ring Sunset',
    accent: '#e8862a', accentSoft: '#f5a623',
    canvasDark: '#241a14', canvasLight: '#f8f2e8',
    wallpaper: 'wallpaper-outer-ring.jpg',
    tagline: '外环漫游 · 落日橙金×红绸 · 壁画平涂风',
    desc: '外环荒原的落日壁画：橙金夕照 × 红绸点缀，平涂质感与星芒太阳，机车与邦布同行。',
    order: 25,
  },
];

const only = process.argv.slice(2);
const themes = only.length ? THEMES.filter(t => only.includes(t.id)) : THEMES;
if (!themes.length) { console.error('no themes selected'); process.exit(1); }

rmSync(DIST, { recursive: true, force: true });
mkdirSync(DIST, { recursive: true });

const baseManifest = JSON.parse(readFileSync(join(SKIN, 'skin.json'), 'utf8'));
const baseSkinCss = readFileSync(join(SKIN, 'skin.css'), 'utf8');
const basePatches = readFileSync(join(SKIN, 'patches.css'), 'utf8');

for (const t of themes) {
  const dir = join(DIST, t.id);
  mkdirSync(join(dir, 'assets'), { recursive: true });

  copyFileSync(join(SKIN, 'assets', 'themes', t.wallpaper), join(dir, 'assets', t.wallpaper));

  // patches.css 追加主题层（载入顺序在后，覆盖 §0 基座强调色）
  // 画布色只走 --dsw-alias-bg-base 令牌（宿主画到 html 上，壁纸层 z:-2 在其上）；
  // 不能直接给 body 刷不透明底色——那会把壁纸层整个盖死（2026-10-25 实测教训）。
  // 壁纸亮度归一（v8.7.0 用户裁定「六套互相之间好多不同」）：
  // 按实测均值亮度 wallL 计算 brightness——亮档统一提到 ~140，暗档压到 ~70。
  const bl = Math.min(1.8, Math.max(1.0, +(140 / t.wallL).toFixed(2)));
  const bd = Math.min(1.0, Math.max(0.55, +(70 / t.wallL).toFixed(2)));
  const themeLayer = `


/* ═══ §T 版本主题：${t.name} ═══ */
body {
  --zzz-accent: ${t.accent};
  --zzz-accent-soft: ${t.accentSoft};
}
body[data-ds-dark-theme] { --dsw-alias-bg-base: ${t.canvasDark}; }
body:not([data-ds-dark-theme]) { --dsw-alias-bg-base: ${t.canvasLight}; }
/* 壁纸亮度归一（实测 L=${t.wallL}）：亮档 ×${bl} → ~140，暗档 ×${bd} → ~70 */
body:not([data-ds-dark-theme]) [data-dsh-skin-layer="background"] img {
  filter: saturate(0.84) contrast(0.95) brightness(${bl});
}
body[data-ds-dark-theme] [data-dsh-skin-layer="background"] img {
  filter: saturate(0.92) contrast(0.97) brightness(${bd});
}
`;
  writeFileSync(join(dir, 'patches.css'), basePatches + themeLayer);
  writeFileSync(join(dir, 'skin.css'), baseSkinCss);

  const manifest = {
    ...baseManifest,
    id: t.id,
    name: t.name,
    nameEn: `New Eridu · ${t.verNameEn}`,
    tagline: t.tagline,
    description: `${t.desc}（新艾利都版本主题系列：knock-knock 对话、绳网流式面板、十八件游戏动效、明暗双档全保留，强调色随版本。）`,
    tags: [...new Set([...(baseManifest.tags || []), 'version-theme', 'themes'])],
    accent: t.accent,
    order: t.order,
    preview: { light: `assets/${t.wallpaper}`, dark: `assets/${t.wallpaper}` },
    contributes: {
      ...baseManifest.contributes,
      backgroundMedia: {
        dark: { type: 'image', src: `assets/${t.wallpaper}`, scrim: `linear-gradient(180deg, ${hexA(t.canvasDark, 0.06)} 0%, ${hexA(t.canvasDark, 0.10)} 60%, ${hexA(t.canvasDark, 0.22)} 100%)` },
        light: { type: 'image', src: `assets/${t.wallpaper}`, scrim: `linear-gradient(180deg, ${hexA(t.canvasLight, 0.08)} 0%, ${hexA(t.canvasLight, 0.02)} 16%, ${hexA(t.canvasLight, 0.12)} 100%)` },
      },
    },
  };
  delete manifest.$schema;
  writeFileSync(join(dir, 'skin.json'), JSON.stringify(manifest, null, 2) + '\n');

  for (const f of ['LICENSE', 'NOTICE', 'README.md', 'README.zh.md']) copyFileSync(join(SKIN, f), join(dir, f));
  console.log('built', t.id, '·', t.name);
}
console.log('done →', DIST);
