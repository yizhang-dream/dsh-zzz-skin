#!/usr/bin/env node
/**
 * 把 37 张绝区零动态背景各做成一张皮肤卡。
 *
 * 用法:
 *   node tools/build-skins.mjs           # 生成到 build/skins/
 *   node tools/build-skins.mjs --deploy  # 生成 + 推到 lab-ts（并下架旧变体）
 *
 * 每张卡: 一条 2560x1440 / CRF30 / 无音轨的 mp4 作背景，亮暗两档各自算 scrim
 * （亮档压暗壁纸、暗档压亮壁纸），卡片缩略图取该壁纸的一帧。
 * 生成物不进 git（.gitignore 忽略 build/）。
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const SRC_DIR = path.join(os.homedir(), 'Downloads', '绝区零动态壁纸');
const OUT = path.join(ROOT, 'build', 'skins');
const BASE = JSON.parse(fs.readFileSync(path.join(ROOT, 'skin.json'), 'utf8'));

const REMOVED = [
  'zzz-zenless-welcome',
  'zzz-zenless-sixth-street',
  'zzz-zenless-hollow',
  'zzz-zenless-v13',
  'zzz-zenless-outer-ring',
];

function sh(cmd, args) {
  return execFileSync(cmd, args, { encoding: 'utf8' });
}

function listSources() {
  return fs.readdirSync(SRC_DIR)
    .filter((f) => /^绝区零_\d+_\d+x\d+\.mp4$/.test(f))
    .sort();
}

function meanLuma(mp4) {
  // 取中段一帧缩到 64px 求灰度均值
  const tmp = path.join(OUT, '_probe.jpg');
  sh('ffmpeg', ['-v', 'error', '-y', '-ss', '2', '-i', mp4, '-frames:v', '1', '-vf', 'scale=64:-1', tmp]);
  const raw = execFileSync('ffmpeg', ['-v', 'error', '-i', tmp, '-f', 'rawvideo', '-pix_fmt', 'gray', '-'], { maxBuffer: 1 << 20 });
  let sum = 0;
  for (const b of raw) sum += b;
  fs.rmSync(tmp, { force: true });
  return sum / raw.length;
}

/** 亮暗各自算：亮档压暗壁纸，暗档压亮壁纸。 */
function scrims(L) {
  let dark, light;
  if (L >= 150) {
    dark = [0.34, 0.46, 0.58]; light = [0.10, 0.05, 0.18];
  } else if (L >= 100) {
    dark = [0.14, 0.24, 0.38]; light = [0.26, 0.18, 0.36];
  } else {
    dark = [0.04, 0.10, 0.20]; light = [0.60, 0.50, 0.68];
  }
  const g = (c) => `linear-gradient(180deg, rgba(${c}, ${dark[0]}) 0%, rgba(${c}, ${dark[1]}) 60%, rgba(${c}, ${dark[2]}) 100%)`;
  const w = (a, b, c) => `linear-gradient(180deg, rgba(250, 250, 246, ${a}) 0%, rgba(250, 250, 246, ${b}) 16%, rgba(250, 250, 246, ${c}) 100%)`;
  return {
    dark: g('8, 9, 22'),
    light: w(light[0], light[1], light[2]),
  };
}

/** 取景中心：按梯度能量加权求质心，返回 CSS object-position 用的百分比。 */
function focusPoint(mp4) {
  const tmp = path.join(OUT, '_focus.png');
  sh('ffmpeg', ['-v', 'error', '-y', '-ss', '2', '-i', mp4, '-frames:v', '1', '-vf', 'scale=96:-1', tmp]);
  const raw = execFileSync('ffmpeg', ['-v', 'error', '-i', tmp, '-f', 'rawvideo', '-pix_fmt', 'gray', '-'], { maxBuffer: 1 << 22 });
  fs.rmSync(tmp, { force: true });
  const W = 96, H = Math.floor(raw.length / W);
  const at = (x, y) => raw[y * W + x] || 0;
  let sx = 0, sy = 0, sw = 0;
  for (let y = 1; y < H - 1; y++) {
    for (let x = 1; x < W - 1; x++) {
      const gx = at(x + 1, y) - at(x - 1, y);
      const gy = at(x, y + 1) - at(x, y - 1);
      const w = Math.hypot(gx, gy);
      if (w < 12) continue;
      sx += x * w; sy += y * w; sw += w;
    }
  }
  if (!sw) return { x: 50, y: 45 };
  const px = (sx / sw) / (W - 1) * 100;
  const py = (sy / sw) / (H - 1) * 100;
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  return { x: Math.round(clamp(px, 28, 72)), y: Math.round(clamp(py, 30, 68)) };
}

function encode(src, target) {
  sh('ffmpeg', ['-v', 'error', '-y', '-i', src, '-an', '-vf', 'scale=2560:1440',
    '-c:v', 'libx264', '-preset', 'slow', '-crf', '30', '-pix_fmt', 'yuv420p',
    '-movflags', '+faststart', target]);
}

function still(mp4, target) {
  sh('ffmpeg', ['-v', 'error', '-y', '-ss', '2', '-i', mp4, '-frames:v', '1',
    '-vf', 'scale=1280:-1', '-q:v', '3', target]);
}

fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });

const srcs = listSources();
console.log(`源 ${srcs.length} 张`);

let total = 0;
srcs.forEach((file, idx) => {
  const nn = String(idx + 1).padStart(2, '0');
  const id = `zzz-eridu-${nn}`;
  const dir = path.join(OUT, id);
  fs.mkdirSync(path.join(dir, 'assets', 'video'), { recursive: true });

  const mp4 = path.join(dir, 'assets', 'video', 'bg.mp4');
  encode(path.join(SRC_DIR, file), mp4);
  const L = meanLuma(mp4);
  const sc = scrims(L);
  still(mp4, path.join(dir, 'assets', 'preview-dark.jpg'));
  still(mp4, path.join(dir, 'assets', 'preview-light.jpg'));

  const mb = fs.statSync(mp4).size / 1048576;
  total += mb;

  // 皮肤本体：CSS 与头像沿用基座，只换 manifest
  fs.copyFileSync(path.join(ROOT, 'skin.css'), path.join(dir, 'skin.css'));
  fs.copyFileSync(path.join(ROOT, 'patches.css'), path.join(dir, 'patches.css'));
  fs.copyFileSync(path.join(ROOT, 'LICENSE'), path.join(dir, 'LICENSE'));
  fs.copyFileSync(path.join(ROOT, 'NOTICE'), path.join(dir, 'NOTICE'));
  for (const a of ['avatar-fatfish.png', 'avatar-fatfish-128.png']) {
    fs.copyFileSync(path.join(ROOT, 'assets', a), path.join(dir, 'assets', a));
  }

  const manifest = structuredClone(BASE);
  manifest.id = id;
  manifest.name = `新艾利都 · ${nn}`;
  manifest.nameEn = `New Eridu ${nn}`;
  manifest.order = 200 + idx;
  manifest.version = '8.9.0';
  manifest.tagline = `动态背景 ${nn} · 亮度 ${L.toFixed(0)}`;
  manifest.description = `《绝区零》动态背景第 ${nn} 张（源文件 ${file}），2560×1440 循环播放，`
    + `亮暗两档各自配纱罩：${L >= 150 ? '亮壁纸，暗档加浓压暗' : L >= 100 ? '中亮壁纸，两档折中' : '暗壁纸，亮档加浓压白'}。`;
  manifest.preview = { light: 'assets/preview-light.jpg', dark: 'assets/preview-dark.jpg' };
  manifest.contributes.backgroundMedia = {
    dark: { type: 'video', src: 'assets/video/bg.mp4', scrim: sc.dark },
    light: { type: 'video', src: 'assets/video/bg.mp4', scrim: sc.light },
  };
  const fp = focusPoint(mp4);
  fs.appendFileSync(path.join(dir, 'skin.css'),
    `
/* §17 取景中心（梯度能量质心） */
body{--zzz-bg-pos:${fp.x}% ${fp.y}%;}
`
    + `body:not([data-ds-dark-theme]){--zzz-bg-pos:${fp.x}% ${fp.y}%;}
`);
  fs.writeFileSync(path.join(dir, 'skin.json'), JSON.stringify(manifest, null, 2) + '\n');

  console.log(`${id}  L=${L.toFixed(0)}  ${mb.toFixed(1)}MB  焦点 ${fp.x}%/${fp.y}%`);
});

console.log(`\n共 ${srcs.length} 张，视频合计 ${total.toFixed(0)}MB`);

if (process.argv.includes('--deploy')) {
  for (const old of REMOVED) {
    try {
      sh('ssh', ['lab-ts', `rm -rf ~/.dsh/skins/${old}`]);
      console.log(`下架 ${old}`);
    } catch (e) { console.log(`下架 ${old} 失败: ${e.message}`); }
  }
  for (const d of fs.readdirSync(OUT)) {
    sh('scp', ['-q', '-r', path.join(OUT, d), 'lab-ts:~/.dsh/skins/']);
    process.stdout.write(`上架 ${d}  `);
  }
  console.log('\n完成');
}
