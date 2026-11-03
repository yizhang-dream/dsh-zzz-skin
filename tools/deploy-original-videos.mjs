#!/usr/bin/env node
// 原片定点部署：prepare 上传并校验；apply 原子换 manifest/插件。保留旧视频以便回滚。
import { createHash } from 'node:crypto';
import { createReadStream, readdirSync, readFileSync, writeFileSync, mkdtempSync, mkdirSync, linkSync, copyFileSync, statSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const stateFile = join(root, 'Temp', 'original-video-deploy.json');
const sshPython = code => execFileSync('ssh', ['lab-ts', 'python3 -'], { input: code, encoding: 'utf8', maxBuffer: 4 << 20 }).trim();
const hash = async file => { const h = createHash('sha256'); for await (const c of createReadStream(file)) h.update(c); return h.digest('hex'); };
if (process.argv[2] === 'prepare') {
  const sourceDir = join(homedir(), 'Downloads', '绝区零动态壁纸');
  const sources = readdirSync(sourceDir).filter(f => /^绝区零_\d+_\d+x\d+\.mp4$/.test(f)).sort();
  if (sources.length !== 37) throw new Error('Expected the existing 37-video catalog');
  const baseline = JSON.parse(sshPython(`import pathlib,json,hashlib,tempfile
h=pathlib.Path.home(); root=h/'.dsh/skins'; plugin=h/'plugins/dsh-eridu-skincenter'
items={}
for d in sorted(root.glob('zzz-eridu-*')):
 p=d/'skin.json'
 if p.exists(): items[d.name]={'manifest':json.loads(p.read_text()),'sha':hashlib.sha256(p.read_bytes()).hexdigest()}
print(json.dumps({'items':items,'plugin':{n:hashlib.sha256((plugin/n).read_bytes()).hexdigest() for n in ['lib/index.js','package.json']},'stage':tempfile.mkdtemp(prefix='original-videos-',dir=h/'.dsh')}))`));
  if (!/^\/home\/[a-zA-Z0-9_-]+\/\.dsh\/original-videos-[a-zA-Z0-9_-]+$/.test(baseline.stage)) throw new Error('Unexpected remote staging directory');
  const local = mkdtempSync(join(root, 'Temp', 'original-videos-'));
  const entries = [];
  for (const [i, file] of sources.entries()) {
    const id = `zzz-eridu-${String(i + 1).padStart(2, '0')}`;
    const previous = baseline.items[id];
    if (!previous || !previous.manifest.description.includes(file)) throw new Error('Source mapping changed: ' + id);
    const source = join(sourceDir, file), sha = await hash(source), name = `bg-original-${sha.slice(0, 12)}.mp4`;
    const dir = join(local, id); mkdirSync(dir);
    try { linkSync(source, join(dir, name)); } catch { copyFileSync(source, join(dir, name)); }
    const manifest = structuredClone(previous.manifest);
    for (const theme of ['dark', 'light']) manifest.contributes.backgroundMedia[theme].src = `assets/video/${name}`;
    manifest.description = manifest.description.replace('2560×1440 循环播放', file.match(/_(\d+x\d+)\.mp4$/)[1].replace('x', '×') + ' 原片循环播放（无二次压缩）');
    manifest.backgroundOriginal = { source: file, sha256: sha, bytes: statSync(source).size };
    writeFileSync(join(dir, 'skin.json'), JSON.stringify(manifest, null, 2) + '\n');
    entries.push({ id, name, sha, bytes: statSync(source).size, expected: previous.sha });
  }
  writeFileSync(join(local, 'entries.json'), JSON.stringify(entries));
  const archive = join(local, 'originals.tar');
  const tar = process.platform === 'win32' ? 'C:/Windows/System32/tar.exe' : 'tar';
  execFileSync(tar, ['-cf', archive, '-C', local, 'entries.json', ...entries.map(x => x.id)], { stdio: 'inherit' });
  const state = { stage: baseline.stage, plugin: baseline.plugin, entries, local };
  writeFileSync(stateFile, JSON.stringify(state, null, 2));
  console.log('Uploading originals:', entries.length, 'bytes:', entries.reduce((s, x) => s + x.bytes, 0));
  execFileSync('scp', ['-q', archive, `lab-ts:${state.stage}/originals.tar`], { stdio: 'inherit' });
  for (const [src, dest] of [['lib/index.js', 'index.js'], ['package.json', 'package.json']]) {
    execFileSync('scp', ['-q', join(root, 'plugins/dsh-eridu-skincenter', src), `lab-ts:${state.stage}/${dest}`], { stdio: 'inherit' });
  }
  execFileSync('ssh', ['lab-ts', `tar -xf ${state.stage}/originals.tar -C ${state.stage}`], { stdio: 'inherit' });
  console.log(sshPython(`import pathlib,json,hashlib
s=pathlib.Path(${JSON.stringify(state.stage)})
for e in json.loads((s/'entries.json').read_text()):
 p=s/e['id']/e['name']; h=hashlib.sha256()
 with p.open('rb') as f:
  for chunk in iter(lambda:f.read(1048576),b''): h.update(chunk)
 if p.stat().st_size!=e['bytes'] or h.hexdigest()!=e['sha']: raise SystemExit('Upload mismatch: '+e['id'])
print('All 37 uploaded originals match source SHA-256')`));
  state.prepared = true; writeFileSync(stateFile, JSON.stringify(state, null, 2));
} else if (process.argv[2] === 'apply') {
  const state = JSON.parse(readFileSync(stateFile, 'utf8'));
  if (!state.prepared) throw new Error('Upload has not been verified');
  console.log(sshPython(`import pathlib,json,hashlib,tempfile,os,shutil,datetime
h=pathlib.Path.home(); root=h/'.dsh/skins'; plugin=h/'plugins/dsh-eridu-skincenter'; stage=pathlib.Path(${JSON.stringify(state.stage)})
entries=json.loads((stage/'entries.json').read_text()); expected=json.loads(${JSON.stringify(JSON.stringify(state.plugin))})
for e in entries:
 if hashlib.sha256((root/e['id']/'skin.json').read_bytes()).hexdigest()!=e['expected']: raise SystemExit('Shared manifest changed: '+e['id'])
for rel,digest in expected.items():
 if hashlib.sha256((plugin/rel).read_bytes()).hexdigest()!=digest: raise SystemExit('Shared plugin changed: '+rel)
backup=h/'.dsh/backups'/('original-videos-'+datetime.datetime.now().strftime('%Y%m%d-%H%M%S')); backup.mkdir(parents=True)
active=(h/'.dsh/eridu-skins.json').read_bytes()
avatars={d.name:hashlib.sha256((d/'assets/avatar-agent.webp').read_bytes()).hexdigest() for d in root.iterdir() if (d/'assets/avatar-agent.webp').exists()}
jobs=[(root/e['id']/'skin.json',stage/e['id']/'skin.json') for e in entries]+[(plugin/'lib/index.js',stage/'index.js'),(plugin/'package.json',stage/'package.json')]
manifest=[]
for i,(target,source) in enumerate(jobs):
 saved=backup/str(i);shutil.copy2(target,saved);manifest.append({'target':str(target),'backup':str(saved)})
(backup/'manifest.json').write_text(json.dumps(manifest,indent=2))
try:
 for e in entries:
  dest=root/e['id']/'assets/video'/e['name']
  if dest.exists(): raise RuntimeError('Original asset already exists: '+str(dest))
  os.replace(stage/e['id']/e['name'],dest)
 for target,source in jobs:
  with tempfile.NamedTemporaryFile(dir=target.parent,delete=False) as f:
   tmp=pathlib.Path(f.name);f.write(source.read_bytes())
  shutil.copymode(target,tmp);os.replace(tmp,target)
 if (h/'.dsh/eridu-skins.json').read_bytes()!=active: raise RuntimeError('Active state changed during deployment')
 for name,digest in avatars.items():
  if hashlib.sha256((root/name/'assets/avatar-agent.webp').read_bytes()).hexdigest()!=digest: raise RuntimeError('Avatar changed: '+name)
except Exception:
 for item in manifest: shutil.copy2(item['backup'],item['target'])
 raise
print(json.dumps({'originals':len(entries),'bytes':sum(e['bytes'] for e in entries),'active':json.loads(active)['active'],'avatarsPreserved':len(avatars),'backup':str(backup)}))`));
} else throw new Error('Usage: deploy-original-videos.mjs prepare|apply');
