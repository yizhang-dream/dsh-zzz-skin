#!/usr/bin/env node
/**
 * 换皮肤的动态壁纸（暗档 / 亮档各一条）。
 *
 * 用法:
 *   node tools/set-wallpaper.mjs                 # 列出可用的绝区零动态壁纸
 *   node tools/set-wallpaper.mjs 12              # 暗档换成 12 号，亮档保持默认亮色壁纸
 *   node tools/set-wallpaper.mjs 12 --light 16   # 两条分别指定
 *   node tools/set-wallpaper.mjs --image         # 回退成静态插画壁纸
 *   node tools/set-wallpaper.mjs 12 --no-deploy  # 只改本地，不推 lab-ts
 *
 * 做的事: 把源 mp4 压成 2560x1440 / H.264 / 无音轨 / faststart 的
 * assets/video/wallpaper-zzz-{dark,light}.mp4，改写 skin.json 的
 * backgroundMedia，再 scp 到 lab-ts:~/.dsh/skins/zzz-zenless/（skin-center 热加载）。
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const SRC_DIR = path.join(os.homedir(), 'Downloads', '绝区零动态壁纸');
const VIDEO_DIR = path.join(ROOT, 'assets', 'video');
const SKIN_JSON = path.join(ROOT, 'skin.json');
const REMOTE = 'lab-ts:~/.dsh/skins/zzz-zenless';
const DEFAULT_LIGHT = 16;

const SCRIM = {
  dark: 'linear-gradient(180deg, rgba(8, 9, 22, 0.06) 0%, rgba(8, 9, 22, 0.14) 60%, rgba(8, 9, 22, 0.26) 100%)',
  light: 'linear-gradient(180deg, rgba(250, 250, 246, 0.12) 0%, rgba(250, 250, 246, 0.06) 16%, rgba(250, 250, 246, 0.2) 100%)',
};

function sources() {
  if (!fs.existsSync(SRC_DIR)) {
    console.error(`找不到壁纸目录: ${SRC_DIR}`);
    process.exit(1);
  }
  return fs.readdirSync(SRC_DIR)
    .filter((f) => /^绝区零_\d+_\d+x\d+\.mp4$/.test(f))
    .sort();
}

function list() {
  for (const f of sources()) {
    const n = f.match(/^绝区零_(\d+)_/)[1];
    const size = (fs.statSync(path.join(SRC_DIR, f)).size / 1048576).toFixed(0);
    console.log(`${n}\t${f}\t${size}MB`);
  }
  console.log(`\n共 ${sources().length} 个。用法: node tools/set-wallpaper.mjs <暗档编号> [--light <亮档编号>]`);
}

function pick(num) {
  const n = String(num).padStart(2, '0');
  const f = sources().find((x) => x.startsWith(`绝区零_${n}_`));
  if (!f) {
    console.error(`没有 ${num} 号，先跑 node tools/set-wallpaper.mjs 看列表`);
    process.exit(1);
  }
  return path.join(SRC_DIR, f);
}

function encode(src, target) {
  fs.mkdirSync(VIDEO_DIR, { recursive: true });
  execFileSync('ffmpeg', [
    '-v', 'error', '-y', '-i', src, '-an',
    '-vf', 'scale=2560:1440',
    '-c:v', 'libx264', '-preset', 'slow', '-crf', '30',
    '-pix_fmt', 'yuv420p', '-movflags', '+faststart',
    target,
  ], { stdio: 'inherit' });
  return (fs.statSync(target).size / 1048576).toFixed(1);
}

function wire(mode) {
  const skin = JSON.parse(fs.readFileSync(SKIN_JSON, 'utf8'));
  const bm = skin.contributes.backgroundMedia;
  for (const k of ['dark', 'light']) {
    bm[k] = mode === 'video'
      ? { type: 'video', src: `assets/video/wallpaper-zzz-${k}.mp4`, scrim: SCRIM[k] }
      : { type: 'image', src: 'assets/wallpaper-zzz-keyart.jpg', scrim: SCRIM[k] };
  }
  fs.writeFileSync(SKIN_JSON, JSON.stringify(skin, null, 2) + '\n');
}

function deploy() {
  execFileSync('ssh', ['lab-ts', 'mkdir -p ~/.dsh/skins/zzz-zenless/assets/video'], { stdio: 'inherit' });
  execFileSync('scp', ['-q', SKIN_JSON, `${REMOTE}/`], { stdio: 'inherit' });
  for (const k of ['dark', 'light']) {
    const p = path.join(VIDEO_DIR, `wallpaper-zzz-${k}.mp4`);
    if (fs.existsSync(p)) execFileSync('scp', ['-q', p, `${REMOTE}/assets/video/`], { stdio: 'inherit' });
  }
  console.log('已部署到 lab-ts（skin-center 热加载）');
}

const argv = process.argv.slice(2);
const noDeploy = argv.includes('--no-deploy');
const li = argv.indexOf('--light');
const lightNum = li >= 0 ? argv[li + 1] : DEFAULT_LIGHT;
const rest = argv.filter((a, i) => !a.startsWith('--') && !(li >= 0 && i === li + 1));

if (argv.includes('--image')) {
  wire('image');
  if (!noDeploy) deploy();
  console.log('已回退到静态插画壁纸');
  process.exit(0);
}

if (!rest.length) {
  list();
  process.exit(0);
}

const darkSrc = pick(rest[0]);
const lightSrc = pick(lightNum);
const dmb = encode(darkSrc, path.join(VIDEO_DIR, 'wallpaper-zzz-dark.mp4'));
const lmb = encode(lightSrc, path.join(VIDEO_DIR, 'wallpaper-zzz-light.mp4'));
wire('video');
if (!noDeploy) deploy();
console.log(`暗档 ${path.basename(darkSrc)}（${dmb}MB） · 亮档 ${path.basename(lightSrc)}（${lmb}MB）`);
console.log('浏览器 Ctrl+Shift+R 硬刷新，或皮肤中心重新应用一次。');
