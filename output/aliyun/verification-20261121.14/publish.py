from pathlib import Path
from datetime import datetime
import fcntl,hashlib,json,os,secrets,shutil,signal,sqlite3,subprocess,sys,tarfile,tempfile,time

os.umask(0o077)
stage=Path(sys.argv[1]).resolve(strict=True)
base=Path('/opt/petshop');database=Path('/var/lib/petshop/shop.sqlite')
archive=stage/'petshop-production-20261121.14-hk.tar.gz'
expected='74a56187fc3313f680d4c43008643a5ff3c91687bac4525000903c3bc6190d90';source='11bb8a2c1528b97aabb0e5a26207cd406f669ff9'
host='www.petshop-trial.fun'
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
def run(*args):return subprocess.check_output(args,timeout=40)
assert os.geteuid()==0 and sha(archive)==expected
lock=open('/run/petshop-install.lock','a');fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
previous=(base/'current').resolve(strict=True)
assert previous.parent==base and previous.name.startswith('release.')
old=json.loads((previous/'public/release.json').read_text())
assert old['version']=='2026.11.21.13' and old['sourceCommit']=='f79a7de4c9e063dedfb0edd10f395a1f2576ff6c'
assert sha(previous/'account-service.mjs')=='230934d77d082ba300bcf194dfce2a042d6beb65d1ff2b5af618d4fd1557640c'
assert database.is_file() and not database.is_symlink()
run('systemctl','is-active','--quiet','petshop.service','petshop-web.service')
release=Path(tempfile.mkdtemp(prefix='release.',dir=base));release.chmod(0o755)
with tarfile.open(archive) as package:
    members=[m for m in package if m.name.startswith('public/') or m.name in ('server.mjs','sqlite.mjs','account-service.mjs','schema.sql','nginx-production.conf')]
    assert all(m.isfile() and '..' not in Path(m.name).parts for m in members)
    package.extractall(release,members)
for directory in [release/'public',*(p for p in (release/'public').rglob('*') if p.is_dir())]:directory.chmod(0o755)
assert sha(release/'account-service.mjs')=='66f90d9c19790827dc77398ca00d963de5406d1d0dd42ddb6f47521e4be619db'
assert sha(release/'nginx-production.conf')==sha(previous/'nginx-production.conf')
for name in ('node','nginx'):shutil.copy2(previous/name,release/name)
# Retain the deployed reverse-proxy/IP handling and change its error wording only.
assert sha(previous/'server.mjs')=='49844ad143945be54878215c81b05e4d11118cf20aa98fbece2b041d45056ef9'
server=(previous/'server.mjs').read_bytes().replace('暂时无法读取或保存试玩店铺。'.encode(),'暂时无法读取或保存店铺。'.encode())
(release/'server.mjs').write_bytes(server)
for name in ('server.mjs','sqlite.mjs','account-service.mjs','schema.sql','nginx-production.conf'):(release/name).chmod((previous/name).stat().st_mode&0o777)
public=release/'public';manifest=json.loads((public/'release.json').read_text())
assert manifest['version']=='2026.11.21.14' and manifest['sourceCommit']==source
assert sha(public/manifest['clientBundle'])==manifest['clientSha256']
assert not (public/'local-opening').exists()
db_id=(database.stat().st_dev,database.stat().st_ino)
backup_dir=Path(tempfile.mkdtemp(prefix='2026.11.21.14.',dir='/var/lib/petshop/rollback'))
backup=backup_dir/'shop-before-deploy.sqlite'
with sqlite3.connect(database.as_uri()+'?mode=ro',uri=True) as src,sqlite3.connect(backup) as dst:
    src.backup(dst)
    assert dst.execute('PRAGMA quick_check').fetchall()==[('ok',)]
    assert dst.execute('PRAGMA foreign_key_check').fetchall()==[]
    counts={table:dst.execute('SELECT count(*) FROM '+table).fetchone()[0] for table in ('trial_accounts','trial_sessions','trial_auth_limits')}
backup.chmod(0o600)
def pids():return {service:run('systemctl','show','-p','MainPID','--value',service).decode().strip() for service in ('petshop.service','petshop-web.service')}
before=pids()
assert all(pid!='0' for pid in before.values())
def switch(target):
    link=base/('.release-21.14-'+str(os.getpid()));link.symlink_to(target);os.replace(link,base/'current')
def https(path):return run('curl','--noproxy','*','-fsS','--max-time','12','--resolve',host+':443:127.0.0.1','https://'+host+path)
def interrupt(*args):raise KeyboardInterrupt()
signal.signal(signal.SIGTERM,interrupt)
try:
    # Additive schema only. Old programs accept these extra tables on rollback;
    # no account, session or snapshot is replaced by this migration.
    with sqlite3.connect(database,timeout=10) as db:
        definitions={t:db.execute('SELECT sql FROM sqlite_schema WHERE name=?',(t,)).fetchone()[0] for t in counts}
        identities=dict(db.execute('SELECT id,password_hash FROM trial_accounts'))
        db.executescript('BEGIN IMMEDIATE;\n'+(release/'schema.sql').read_text()+'\nCOMMIT;')
        assert definitions=={t:db.execute('SELECT sql FROM sqlite_schema WHERE name=?',(t,)).fetchone()[0] for t in counts}
        assert all(dict(db.execute('SELECT id,password_hash FROM trial_accounts')).get(k)==v for k,v in identities.items())
        epoch=int(datetime.fromisoformat('2026-11-09T20:00:00+08:00').timestamp()*1000)
        now=int(time.time()*1000);week=max(0,(now-epoch)//604800000)
        first=week if now<epoch+week*604800000+94*3600000 else week+1
        config={'epoch':epoch,'firstWeek':first,'seed':secrets.token_hex(32),'activatedAt':now}
        db.execute('INSERT INTO petshop_public_config(id,snapshot) VALUES (?,?) ON CONFLICT(id) DO NOTHING',('main',json.dumps(config)))
        config=json.loads(db.execute('SELECT snapshot FROM petshop_public_config WHERE id=?',('main',)).fetchone()[0])
        assert db.execute('PRAGMA foreign_key_check').fetchall()==[]
    switch(release)
    run('systemctl','restart','petshop.service')
    for i in range(40):
        try:
            health=json.loads(https('/petshop-api/v1/health'))
            assert health['status']=='ok' and health['publicShows']=='shared' and health['showScoringVersion']==2
            break
        except Exception:
            if i==39:raise
            time.sleep(.25)
    for file in ('release.json','index.html',manifest['clientEntry'],manifest['clientBundle']):
        assert https('/petshop/'+('' if file=='index.html' else file))==(public/file).read_bytes(),file
    after=pids();assert after['petshop-web.service']==before['petshop-web.service']
    assert (database.stat().st_dev,database.stat().st_ino)==db_id
except BaseException:
    if (base/'current').resolve()==release:switch(previous);run('systemctl','restart','petshop.service')
    raise
receipt={'version':manifest['version'],'gameSourceCommit':source,'deployedAt':datetime.now().astimezone().isoformat(),
    'site':'https://www.petshop-trial.fun/petshop/','releaseDirectory':str(release),'previousReleaseDirectory':str(previous),'previousVersion':old['version'],
    'deploymentSha256':expected,'accountServiceSha256':sha(release/'account-service.mjs'),'runtimeServerSha256':sha(release/'server.mjs'),
    'database':str(database),'sameDatabaseFile':True,'resetPerformed':False,'backup':str(backup),'backupSha256':sha(backup),'backupChecksPassed':True,
    'snapshotCounts':counts,'accountServiceRestarted':True,'webServicePreserved':True,'previousServicePids':before,'servicePids':after,
    'additiveSchemaMigration':True,'priorAccountsAndPasswordsPreserved':True,'publicShows':'shared','showScoringVersion':2,
    'firstPublicStartBeijing':datetime.fromtimestamp((config['epoch']+config['firstWeek']*604800000)/1000).astimezone().isoformat(),
    'publicFirstWeek':config['firstWeek'],'publicEpoch':config['epoch'],'localTestIncluded':False,'receipt':str(backup_dir/'deployment.json')}
(backup_dir/'deployment.json').write_text(json.dumps(receipt,indent=2)+'\n')
print('PETSHOP_21_14_LIVE '+json.dumps(receipt,separators=(',',':')),flush=True)
