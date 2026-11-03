#!/usr/bin/env python3
"""对真实 DSH HTTP 路由验证原片、Range 与流式传输；凭据不输出。"""
import hashlib
import http.cookiejar
import json
import pathlib
import subprocess
import sys
import threading
import time
import urllib.error
import urllib.request

home = pathlib.Path.home()
stage = pathlib.Path(sys.argv[1]).resolve()
if stage.parent != home / '.dsh' or not stage.name.startswith('original-videos-'):
    raise SystemExit('Unexpected original video staging directory')
entries = json.loads((stage / 'entries.json').read_text())
origin = 'http://100.112.92.62:3081'
login = subprocess.check_output(['bash', str(home / 'apps/dsh-url.sh')], text=True).strip()
if not login.startswith(origin + '/?token='):
    raise SystemExit('Unexpected login authority')
client = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))
try:
    with client.open(login, timeout=20) as r:
        r.read(64)
except Exception as e:
    raise SystemExit('Backend login failed: ' + type(e).__name__)
with client.open(origin + '/api/eridu-skins/list', timeout=15) as r:
    catalog = json.load(r)
by_id = {e['id']: e for e in catalog['skins']}
active = catalog['active']

def url(e):
    return origin + '/api/eridu-skins/skin/' + e['id'] + '/assets/video/' + e['name']

if '--busy' in sys.argv or '--restart-if-idle' in sys.argv:
    req = urllib.request.Request(origin + '/api/session/list', data=json.dumps({'type': 'client-request', 'rpcId': 'eridu-original-busy', 'method': 'session/list', 'payload': {'args': {'_request': {}}}}).encode(), headers={'Content-Type': 'application/json', 'Origin': origin})
    with client.open(req, timeout=20) as r:
        envelope = json.load(r)
    result = envelope.get('result', envelope)
    if not result.get('ok') or not isinstance(result.get('value', {}).get('items'), list):
        raise SystemExit('Session status query failed: ' + json.dumps(result)[:1000])
    items = result['value']['items']
    running = [x for x in items if x.get('running')]
    print(json.dumps({'visibleSessions': len(items), 'running': len(running)}), flush=True)
    if '--restart-if-idle' in sys.argv:
        if running:
            raise SystemExit('Active sessions present; service restart skipped')
        subprocess.run(['systemctl', '--user', 'restart', 'dsh-web'], check=True)
        print('Service restarted after backend confirmed no running sessions')
    raise SystemExit(0)

if '--probe' in sys.argv:
    e = next(e for e in entries if e['id'] == active)
    req = urllib.request.Request(url(e), headers={'Range': 'bytes=0-31'})
    with client.open(req, timeout=15) as r:
        r.read(32)
        print(json.dumps({'status': r.status, 'ranges': r.headers.get('accept-ranges'), 'range': r.headers.get('content-range')}))
    raise SystemExit(0)

for e in entries:
    spec = by_id[e['id']]['backgroundMedia']
    for theme in ['dark', 'light']:
        assert spec[theme]['src'] == 'assets/video/' + e['name'], e['id'] + ' stale manifest'
    with client.open(urllib.request.Request(url(e), method='HEAD'), timeout=15) as r:
        assert r.status == 200 and int(r.headers['content-length']) == e['bytes'], e['id'] + ' size mismatch'
        assert r.headers.get('accept-ranges') == 'bytes', 'Streaming host has not reloaded'

selected = [next(e for e in entries if e['id'] == active), max(entries, key=lambda x: x['bytes'])]
checks = []
for e in selected:
    path = home / '.dsh/skins' / e['id'] / 'assets/video' / e['name']
    for header, start, length in [('bytes=0-65535', 0, 65536), ('bytes=-512', e['bytes'] - 512, 512), (f"bytes={e['bytes'] - 1024}-", e['bytes'] - 1024, 1024)]:
        with client.open(urllib.request.Request(url(e), headers={'Range': header}), timeout=15) as r:
            data = r.read()
            assert r.status == 206 and len(data) == length
            assert r.headers['content-range'] == f"bytes {start}-{start + length - 1}/{e['bytes']}"
        with path.open('rb') as f:
            f.seek(start)
            assert data == f.read(length), e['id'] + ' range byte mismatch'
    try:
        client.open(urllib.request.Request(url(e), headers={'Range': f"bytes={e['bytes']}-"}), timeout=15)
        raise AssertionError('Unsatisfiable range should return 416')
    except urllib.error.HTTPError as err:
        assert err.code == 416 and err.headers['content-range'] == f"bytes */{e['bytes']}"
    subprocess.run(['ffmpeg', '-v', 'error', '-ss', '2', '-i', str(path), '-frames:v', '1', '-f', 'null', '-'], check=True, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)
    checks.append(e['id'])

pid = int(subprocess.check_output(['systemctl', '--user', 'show', 'dsh-web', '-p', 'MainPID', '--value'], text=True))

def rss():
    lines = pathlib.Path(f'/proc/{pid}/status').read_text().splitlines()
    return int(next(x for x in lines if x.startswith('VmRSS:')).split()[1])

samples = [rss()]
stop = threading.Event()

def sample():
    while not stop.wait(0.02):
        samples.append(rss())

thread = threading.Thread(target=sample, daemon=True)
thread.start()
try:
    for e in selected:
        digest = hashlib.sha256()
        with client.open(url(e), timeout=30) as r:
            assert r.status == 200
            while True:
                chunk = r.read(65536)
                if not chunk:
                    break
                digest.update(chunk)
        assert digest.hexdigest() == e['sha'], e['id'] + ' HTTP full-body hash mismatch'
finally:
    stop.set()
    thread.join()
samples.append(rss())
print(json.dumps({'ok': True, 'active': active, 'originals': len(entries), 'sourceBytes': sum(e['bytes'] for e in entries), 'rangeAndDecodeChecks': checks, 'fullHttpHashes': len(selected), 'servicePid': pid, 'rssMiB': {'before': round(samples[0] / 1024, 2), 'peak': round(max(samples) / 1024, 2), 'after': round(samples[-1] / 1024, 2), 'samples': len(samples)}}, indent=2))
