// Targeted deployment: guarded source baselines, backups, atomic writes, no media/avatar rebuild.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
const root = join(import.meta.dirname, '..');
const stage = join(root, 'Temp', 'zzz-contacts-deploy');
mkdirSync(stage, { recursive: true });
const sha = (b) => createHash('sha256').update(b).digest('hex');
const head = (name) => execFileSync('git', ['-C', root, 'show', `HEAD:${name}`]);
const baseline = JSON.parse(readFileSync(join(root, 'Temp/material-deploy/deployed-hashes.json'), 'utf8'));
const snapshot = JSON.parse(execFileSync('ssh', ['lab-ts', 'python3 -I -'], { encoding: 'utf8', input: `import pathlib,json,hashlib,tempfile
h=pathlib.Path.home(); s=h/'.dsh/skins'; p=h/'plugins/dsh-eridu-skincenter'
rows=[]
for d in sorted(s.iterdir()):
 if d.name.startswith('zzz-') and (d/'skin.json').exists():
  rows.append({'id':d.name,'manifest':(d/'skin.json').read_text(),'manifestSha':hashlib.sha256((d/'skin.json').read_bytes()).hexdigest(),'patchMd5':hashlib.md5((d/'patches.css').read_bytes()).hexdigest()})
print(json.dumps({'stage':tempfile.mkdtemp(prefix='zzz-contacts-'),'skins':rows,'client':hashlib.sha256((p/'lib/client.js').read_bytes()).hexdigest(),'package':hashlib.sha256((p/'package.json').read_bytes()).hexdigest()}))
` }));
if (!/^\/tmp\/zzz-contacts-[\w-]+$/.test(snapshot.stage)) throw new Error('Unexpected staging path');
if (snapshot.skins.length !== 39) throw new Error('Unexpected skin count');
if (![baseline.client, sha(head('plugins/dsh-eridu-skincenter/lib/client.js'))].includes(snapshot.client) || ![baseline.package, sha(head('plugins/dsh-eridu-skincenter/package.json'))].includes(snapshot.package)) throw new Error('Shared plugin changed since known deployment');
for (const skin of snapshot.skins) if (skin.patchMd5 !== baseline[skin.id === 'zzz-console' ? 'console' : 'base']) throw new Error(`Shared CSS changed: ${skin.id}`);
const jobs = [];
const base = readFileSync(join(root, 'patches.css'), 'utf8');
const consoleCss = base + '\n' + readFileSync(join(root, 'variants/console-tail.css'), 'utf8');
for (const skin of snapshot.skins) {
 const m = JSON.parse(skin.manifest);
 if (m.id !== skin.id) throw new Error('Manifest identity mismatch');
 const number = skin.id.match(/^zzz-eridu-(\d+)$/)?.[1];
 if (number) { m.name = `ZZZ · ${number}`; m.nameEn = `ZZZ ${number}`; }
 else if (skin.id === 'zzz-console') { m.name = 'ZZZ · 观测台'; m.nameEn = 'ZZZ Console'; }
 else if (skin.id === 'zzz-zenless') { m.name = 'ZZZ'; m.nameEn = 'ZZZ'; }
 else throw new Error('Unexpected skin');
 jobs.push({ target: `.dsh/skins/${skin.id}/skin.json`, expectedSha: skin.manifestSha, content: JSON.stringify(m, null, 2) + '\n' });
 jobs.push({ target: `.dsh/skins/${skin.id}/patches.css`, expectedMd5: skin.patchMd5, content: skin.id === 'zzz-console' ? consoleCss : base });
}
for (const [rel, expectedSha] of [['lib/client.js', snapshot.client], ['package.json', snapshot.package]]) jobs.push({ target: `plugins/dsh-eridu-skincenter/${rel}`, expectedSha, content: readFileSync(join(root, 'plugins/dsh-eridu-skincenter', rel), 'utf8') });
for (let i = jobs.length - 1; i >= 0; i--) {
 const job = jobs[i];
 const unchanged = job.expectedSha ? sha(job.content) === job.expectedSha
   : createHash('md5').update(job.content).digest('hex') === job.expectedMd5;
 if (unchanged) jobs.splice(i, 1);
}
const payload = join(stage, 'payload.json');
writeFileSync(payload, JSON.stringify(jobs));
writeFileSync(join(stage, 'before.json'), JSON.stringify(snapshot));
execFileSync('scp', [payload, `lab-ts:${snapshot.stage}/payload.json`], { stdio: 'inherit' });
const result = execFileSync('ssh', ['lab-ts', 'python3 -I -'], { encoding: 'utf8', input: `import pathlib,json,hashlib,shutil,tempfile,os,datetime
h=pathlib.Path.home(); stage=pathlib.Path(${JSON.stringify(snapshot.stage)}); jobs=json.loads((stage/'payload.json').read_text())
for j in jobs:
 p=h/j['target']; b=p.read_bytes()
 if j.get('expectedSha') and hashlib.sha256(b).hexdigest()!=j['expectedSha']: raise SystemExit('Shared target changed: '+j['target'])
 if j.get('expectedMd5') and hashlib.md5(b).hexdigest()!=j['expectedMd5']: raise SystemExit('Shared CSS changed: '+j['target'])
backup=h/'.dsh/backups'/('zzz-contacts-'+datetime.datetime.now().strftime('%Y%m%d-%H%M%S')); backup.mkdir()
state=(h/'.dsh/eridu-skins.json').read_bytes()
avatars={p:hashlib.sha256(p.read_bytes()).hexdigest() for p in (h/'.dsh/skins').glob('zzz-*/assets/avatar-agent.webp')}
manifest=[]
for i,j in enumerate(jobs):
 target=h/j['target']; saved=backup/str(i); shutil.copy2(target,saved); manifest.append({'target':str(target),'backup':str(saved)})
(backup/'manifest.json').write_text(json.dumps(manifest,indent=2))
try:
 for j in jobs:
  target=h/j['target']
  with tempfile.NamedTemporaryFile(dir=target.parent,delete=False) as f:
   temp=pathlib.Path(f.name); f.write(j['content'].encode())
  shutil.copymode(target,temp); os.replace(temp,target)
 for j in jobs:
  if (h/j['target']).read_bytes()!=j['content'].encode(): raise RuntimeError('Write mismatch')
 if (h/'.dsh/eridu-skins.json').read_bytes()!=state: raise RuntimeError('Activation changed during deploy')
 if any(hashlib.sha256(p.read_bytes()).hexdigest()!=digest for p,digest in avatars.items()): raise RuntimeError('Avatar changed during deploy')
except Exception:
 for item in manifest: shutil.copy2(item['backup'],item['target'])
 raise
print(json.dumps({'updated':len(jobs),'backup':str(backup),'active':json.loads(state)['active'],'avatarsPreserved':len(avatars)}))
` });
writeFileSync(join(stage, 'result.json'), result);
console.log(result.trim());
// Keep the established CSS deployment guard aligned with this successful deployment.
writeFileSync(join(root, 'Temp/material-deploy/deployed-hashes.json'), JSON.stringify({
 base: createHash('md5').update(base).digest('hex'), console: createHash('md5').update(consoleCss).digest('hex'),
 client: sha(readFileSync(join(root, 'plugins/dsh-eridu-skincenter/lib/client.js'))),
 package: sha(readFileSync(join(root, 'plugins/dsh-eridu-skincenter/package.json'))),
}, null, 2));
