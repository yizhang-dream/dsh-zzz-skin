#!/usr/bin/env node
// CSS + 客户端定点部署：先校验共享目标，再备份/原子替换，不重建头像或改变激活态。
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { execFileSync } from 'node:child_process';
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const staging = join(root, 'Temp', 'material-deploy');
mkdirSync(staging, { recursive: true });
const baselineFile = join(staging, 'deployed-hashes.json');
const baseline = existsSync(baselineFile) ? JSON.parse(readFileSync(baselineFile, 'utf8')) : {
  base: 'b810fab185e7bb0a2d15999f8bcb3cb4', console: '6236ca7a5ee0c2e1d9c6ebbcde43f081',
  client: '09a055c576747ea33b5f6899a986014169bbd3cf8d368e4f8adfc2f35e85ef1a',
  package: '3a71810cb97bec75abbb37b40660ce6ff23d818dfd117750602a42eaa9d50094',
};
const base = readFileSync(join(root, 'patches.css'), 'utf8');
writeFileSync(join(staging, 'patches.css'), base);
writeFileSync(join(staging, 'console.css'), base + '\n' + readFileSync(join(root, 'variants/console-tail.css'), 'utf8'));
const remote = execFileSync('ssh', ['lab-ts', 'python3 -'], { input: "import tempfile\nprint(tempfile.mkdtemp(prefix='eridu-material-'))\n", encoding: 'utf8' }).trim();
if (!/^\/tmp\/eridu-material-[a-zA-Z0-9_-]+$/.test(remote)) throw new Error('Unexpected remote staging directory');
for (const [source, name] of [
  [join(staging, 'patches.css'), 'patches.css'], [join(staging, 'console.css'), 'console.css'],
  [join(root, 'plugins/dsh-eridu-skincenter/lib/client.js'), 'client.js'],
  [join(root, 'plugins/dsh-eridu-skincenter/package.json'), 'package.json'],
]) execFileSync('scp', [source, `lab-ts:${remote}/${name}`], { stdio: 'inherit' });
const code = `import pathlib,hashlib,shutil,tempfile,os,json,datetime
stage=pathlib.Path(${JSON.stringify(remote)})
home=pathlib.Path.home()
root=home/'.dsh/skins'
plugin=home/'plugins/dsh-eridu-skincenter'
base_md5=${JSON.stringify(baseline.base)}
console_md5=${JSON.stringify(baseline.console)}
jobs=[]
for d in sorted(root.iterdir()):
 p=d/'patches.css'
 if not p.exists(): continue
 expected=console_md5 if d.name=='zzz-console' else base_md5
 if hashlib.md5(p.read_bytes()).hexdigest()!=expected: raise SystemExit('Shared target changed: '+d.name)
 jobs.append((p,stage/('console.css' if d.name=='zzz-console' else 'patches.css')))
for rel,expected in [('lib/client.js',${JSON.stringify(baseline.client)}),('package.json',${JSON.stringify(baseline.package)})]:
 p=plugin/rel
 if hashlib.sha256(p.read_bytes()).hexdigest()!=expected: raise SystemExit('Shared plugin changed: '+rel)
 jobs.append((p,stage/p.name))
backup=home/'.dsh/backups'/('materials-'+datetime.datetime.now().strftime('%Y%m%d-%H%M%S'))
backup.mkdir(parents=True,exist_ok=False)
manifest=[]
for i,(target,source) in enumerate(jobs):
 saved=backup/str(i)
 shutil.copy2(target,saved)
 manifest.append({'target':str(target),'backup':str(saved)})
(backup/'manifest.json').write_text(json.dumps(manifest,indent=2))
state=(home/'.dsh/eridu-skins.json').read_bytes()
avatars={d.name:hashlib.md5((d/'assets/avatar-agent.webp').read_bytes()).hexdigest() for d in root.iterdir() if (d/'assets/avatar-agent.webp').exists()}
try:
 for target,source in jobs:
  with tempfile.NamedTemporaryFile(dir=target.parent,delete=False) as f:
   temp=pathlib.Path(f.name)
   f.write(source.read_bytes())
  shutil.copymode(target,temp)
  os.replace(temp,target)
 for target,source in jobs:
  if target.read_bytes()!=source.read_bytes(): raise RuntimeError('Verification failed: '+str(target))
 if (home/'.dsh/eridu-skins.json').read_bytes()!=state: raise RuntimeError('Activation changed during deployment')
 for name,digest in avatars.items():
  if hashlib.md5((root/name/'assets/avatar-agent.webp').read_bytes()).hexdigest()!=digest: raise RuntimeError('Avatar changed: '+name)
except Exception:
 for item in manifest: shutil.copy2(item['backup'],item['target'])
 raise
print(json.dumps({'updated':len(jobs),'backup':str(backup),'active':json.loads(state)['active'],'avatarsPreserved':len(avatars)}))
`;
console.log(execFileSync('ssh', ['lab-ts', 'python3 -'], { input: code, encoding: 'utf8' }).trim());
const digest = (file, algo) => createHash(algo).update(readFileSync(file)).digest('hex');
writeFileSync(baselineFile, JSON.stringify({
  base: digest(join(staging, 'patches.css'), 'md5'), console: digest(join(staging, 'console.css'), 'md5'),
  client: digest(join(root, 'plugins/dsh-eridu-skincenter/lib/client.js'), 'sha256'),
  package: digest(join(root, 'plugins/dsh-eridu-skincenter/package.json'), 'sha256'),
}, null, 2));
