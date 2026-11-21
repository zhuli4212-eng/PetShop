"""Activate the approved 21.12 package and keep the existing account process."""
from pathlib import Path
from datetime import datetime
import fcntl
import hashlib
import json
import os
import shutil
import signal
import sqlite3
import subprocess
import sys
import tarfile
import tempfile
import time

os.umask(0o077)
base = Path('/opt/petshop')
database = Path('/var/lib/petshop/shop.sqlite')
stage = Path(sys.argv[1]).resolve(strict=True)
archive = stage / 'petshop-production-20261121.12-hk.tar.gz'
expected_sha = '68242ff339e429afb36058f94ac79b33af156543801a9b198bea945f42e76cbd'
source_commit = '5efb4064bee6c14891a924bf140ea5a80baf25cc'
host = 'play.zhu-li-4212.xyz'

def digest(path):
    hash_ = hashlib.sha256()
    with path.open('rb') as data:
        for chunk in iter(lambda: data.read(1024 * 1024), b''):
            hash_.update(chunk)
    return hash_.hexdigest()

def run(*args):
    return subprocess.check_output(args, timeout=35)

assert os.geteuid() == 0
assert digest(archive) == expected_sha
lock = open('/run/petshop-install.lock', 'a')
fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
previous = (base / 'current').resolve(strict=True)
assert previous.parent == base and previous.name.startswith('release.'), previous
old_manifest = json.loads((previous / 'public/release.json').read_text())
assert old_manifest['sourceCommit'] == 'a277225f5a73b60da5e94696e88607c1947ab06b'
assert old_manifest['version'] == '2026.11.21.11', old_manifest
assert database.is_file() and not database.is_symlink()
assert digest(previous/'account-service.mjs') == 'a7a8b64a4545e9bf90795c9e87ad531ba87b1e16382e7961aaaba999f1e1f48c'
run('systemctl', 'is-active', '--quiet', 'petshop.service', 'petshop-web.service')

release = Path(tempfile.mkdtemp(prefix='release.', dir=base))
release.chmod(0o755)
with tarfile.open(archive) as package:
    members = [m for m in package if m.name.startswith('public/') or m.name in ('server.mjs', 'sqlite.mjs', 'account-service.mjs', 'schema.sql', 'nginx-production.conf')]
    assert all(m.isfile() and '..' not in Path(m.name).parts for m in members)
    package.extractall(release, members)
for path in (release / 'public').rglob('*'):
    if path.is_dir():
        path.chmod(0o755)
(release / 'public').chmod(0o755)
for name in ('sqlite.mjs', 'schema.sql', 'nginx-production.conf'):
    assert digest(release / name) == digest(previous / name), name
original = base / 'release.YZee7nMG/server.mjs'
assert digest(release / 'server.mjs') == digest(original)
for name in ('node', 'nginx'):
    shutil.copy2(previous / name, release / name)
for name in ('server.mjs', 'sqlite.mjs', 'account-service.mjs', 'schema.sql', 'nginx-production.conf'):
    (release / name).chmod((previous / name).stat().st_mode & 0o777)

public = release / 'public'
manifest = json.loads((public / 'release.json').read_text())
assert manifest['version'] == '2026.11.21.12' and manifest['sourceCommit'] == source_commit
assert digest(public / manifest['clientBundle']) == manifest['clientSha256']
assert (public / manifest['clientEntry']).is_file() and not (public / 'local-opening').exists()
extra_paths = ['src/import-map.json', 'cocos-js/cc.js', 'src/entry.a471674121c75323.js', 'assets/main/index.8e24e87a44a20757.js', 'src/game-resources.67fe8ebb6011803c.json', 'src/resource-preload.bd155257fc217a72.js', 'trial-shopfront.png']
assert all((public / path).is_file() for path in extra_paths)
if digest(previous / 'server.mjs') != digest(original):
    assert digest(previous / 'server.mjs') == 'dba40a6174d5266a1c4282c99a2778995722b954a3ccd0254793123d79b2327e'
    shutil.copy2(previous / 'server.mjs', release / 'server.mjs')

backup_dir = Path(tempfile.mkdtemp(prefix='2026.11.21.12.', dir='/var/lib/petshop/rollback'))
snapshot = backup_dir / 'shop-before-deploy.sqlite'
db_id = (database.stat().st_dev, database.stat().st_ino)
with sqlite3.connect(database.as_uri()+'?mode=ro', uri=True) as source, sqlite3.connect(snapshot) as dest:
    source.backup(dest)
    assert dest.execute('PRAGMA quick_check').fetchall() == [('ok',)]
    assert dest.execute('PRAGMA foreign_key_check').fetchall() == []
    counts = {table: dest.execute('SELECT count(*) FROM '+table).fetchone()[0] for table in ('trial_accounts', 'trial_sessions', 'trial_auth_limits')}
snapshot.chmod(0o600)

def pids():
    return {name: run('systemctl','show','-p','MainPID','--value',name).decode().strip() for name in ('petshop.service','petshop-web.service')}

before_pids = pids()
assert all(n != '0' for n in before_pids.values())

def switch(path):
    link = base / ('.release-21.12-' + str(os.getpid()))
    link.symlink_to(path)
    os.replace(link,base/'current')

def https(path):
    return run('curl','--noproxy','*','-fsS','--max-time','12','--resolve',f'{host}:443:127.0.0.1',f'https://{host}{path}')

def interrupt(*args):
    raise KeyboardInterrupt()

signal.signal(signal.SIGTERM,interrupt)
try:
    switch(release)
    run('systemctl','restart','petshop.service')
    for attempt in range(40):
        try:
            assert json.loads(https('/petshop-api/v1/health'))['status'] == 'ok'
            break
        except Exception:
            if attempt == 39: raise
            time.sleep(.25)
    for name in ('release.json', 'index.html', manifest['clientEntry'], manifest['clientBundle'], *extra_paths):
        suffix = '' if name == 'index.html' else name
        assert https('/petshop/'+suffix) == (public/name).read_bytes(), name
    assert json.loads(https('/petshop-api/v1/health'))['status'] == 'ok'
    after_pids = pids()
    assert after_pids['petshop-web.service'] == before_pids['petshop-web.service']
    assert after_pids['petshop.service'] != '0'
    assert (database.stat().st_dev, database.stat().st_ino) == db_id
except BaseException:
    if (base/'current').resolve() == release:
        switch(previous)
        run('systemctl','restart','petshop.service')
    raise

receipt = {'version':manifest['version'], 'gameSourceCommit':source_commit, 'deployedAt':datetime.now().astimezone().isoformat(),
           'releaseDirectory':str(release), 'previousReleaseDirectory':str(previous), 'previousVersion':old_manifest['version'],
           'deploymentSha256':expected_sha, 'database':str(database), 'sameDatabaseFile':True, 'resetPerformed':False,
           'backup':str(snapshot), 'backupSha256':digest(snapshot), 'backupChecksPassed':True, 'snapshotCounts':counts,
           'accountServiceRestarted':True, 'webServicePreserved':True, 'previousServicePids':before_pids, 'servicePids':after_pids, 'changeScope':'approved room, breeding, profile, scenes, opening, letter, order and guest UI; production show scoring remains version 1',
           'receipt':str(backup_dir/'deployment.json')}
(backup_dir/'deployment.json').write_text(json.dumps(receipt,indent=2)+'\n')
print('PETSHOP_21_12_LIVE '+json.dumps(receipt,separators=(',',':')),flush=True)
