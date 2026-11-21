from pathlib import Path
import base64,gzip,hashlib,io,json,re,tarfile,zlib

folder=Path(__file__).resolve().parent
root=folder.parents[2]
base=root/'output/aliyun/candidate-production-20261121.12/petshop-production-20261121.12-hk.tar.gz'
sha=lambda data:hashlib.sha256(data).hexdigest()
base_sha='68242ff339e429afb36058f94ac79b33af156543801a9b198bea945f42e76cbd'
assert sha(base.read_bytes())==base_sha
with tarfile.open(base) as t:
    old={m.name:(m.mode,t.extractfile(m).read()) for m in t if m.isfile()}
manifest=json.loads((folder/'pages/release.json').read_bytes())
assert manifest['version']=='2026.11.21.13'
assert manifest['sourceCommit']=='f79a7de4c9e063dedfb0edd10f395a1f2576ff6c'
assert sha((folder/'pages'/manifest['clientBundle']).read_bytes())==manifest['clientSha256']
changes={}
for file in (folder/'pages').rglob('*'):
    if not file.is_file() or file.name in ('_worker.js','trial-shopfront-wide.png'):continue
    name='public/'+file.relative_to(folder/'pages').as_posix()
    data=file.read_bytes()
    if name not in old or old[name][1]!=data:changes[name]=(0o644,data)
changes['account-service.mjs']=(old['account-service.mjs'][0],(folder/'pages/_worker.js').read_bytes())
source=root/'output/aliyun/source-show-rules-20261121'
for name in ['server.mjs','sqlite.mjs']:
    changes[name]=(old[name][0],(source/'外网试玩/aliyun'/name).read_bytes().replace(b'\r\n',b'\n'))
changes['schema.sql']=(old['schema.sql'][0],(source/'外网试玩/accounts/schema.sql').read_bytes().replace(b'\r\n',b'\n'))
assert not any('local-opening' in n or 'save-test' in n or n.endswith(('.ttf','.woff','.woff2')) for n in changes)
assert b'localTest.addCoins' not in changes['account-service.mjs'][1]
assert b'localTest.addCoins' not in (folder/'pages'/manifest['clientBundle']).read_bytes()
archive=folder/'petshop-production-20261121.13-hk.tar.gz'
def add(t,name,mode,data):
    m=tarfile.TarInfo(name);m.size=len(data);m.mode=mode;t.addfile(m,io.BytesIO(data))
with archive.open('wb') as f,gzip.GzipFile(filename='',fileobj=f,mode='wb',mtime=0,compresslevel=6) as g:
    with tarfile.open(fileobj=g,mode='w|') as t:
        for n,(mode,data) in old.items():add(t,n,*changes.get(n,(mode,data)))
        for n in sorted(changes.keys()-old.keys()):add(t,n,*changes[n])
digest=sha(archive.read_bytes())
for arc,dest in [(base,'previous-runtime'),(archive,'runtime')]:
    with tarfile.open(arc) as t:t.extractall(folder/dest,filter='data')
resources=re.search(rb'src/game-resources\.[a-f0-9]+\.json',(folder/'pages/trial-start.js').read_bytes())[0].decode()
preload=re.search(rb'src/resource-preload\.[a-f0-9]+\.js',(folder/'pages/trial-start.js').read_bytes())[0].decode()
active=['src/import-map.json','cocos-js/cc.js',manifest['clientEntry'],manifest['clientBundle'],resources,preload,'trial-shopfront.png']
publish=(folder/'publish-template.py').read_text(encoding='utf-8').replace('ARCHIVE_DIGEST',digest).replace('WORKER_DIGEST',sha(changes['account-service.mjs'][1])).replace('SOURCE_COMMIT',manifest['sourceCommit'])
compile(publish,'publish.py','exec')
(folder/'publish.py').write_text(publish,encoding='utf-8',newline='\n')
derived={}
for part in json.loads((folder/'pages'/resources).read_bytes())['parts']:
    name='public/'+part['path']
    if name in changes:
        data=b''.join((folder/'pages'/f[0]).read_bytes() for f in part['files'])
        assert data==changes[name][1]
        derived[name]={'files':['public/'+f[0] for f in part['files']],'sha256':sha(data)}
payload={'changes':{n:[m,base64.b64encode(d).decode()] for n,(m,d) in changes.items() if n not in derived},'derived':derived}
delta=zlib.compress(json.dumps(payload,separators=(',',':')).encode(),9)
(folder/'release-delta.zlib').write_bytes(delta)
stage='''from pathlib import Path
import base64,gzip,hashlib,io,json,os,tarfile,zlib
os.umask(0o077)
sha=lambda b:hashlib.sha256(b).hexdigest()
folder=Path(__file__).resolve().parent
base=Path('/root/petshop-release-20261121.12/petshop-production-20261121.12-hk.tar.gz')
assert sha(base.read_bytes())==BASE_SHA
payload=json.loads(zlib.decompress((folder/'release-delta.zlib').read_bytes()))
entries={n:(m,base64.b64decode(d)) for n,(m,d) in payload['changes'].items()}
required={n for p in payload['derived'].values() for n in p['files']}-entries.keys()
with tarfile.open(base) as t:assets={m.name:t.extractfile(m).read() for m in t if m.isfile() and m.name in required}
assets.update({n:d for n,(m,d) in entries.items()})
for n,p in payload['derived'].items():
    data=b''.join(assets[f] for f in p['files']);assert sha(data)==p['sha256'];entries[n]=(0o644,data)
def add(t,n,m,d):
    info=tarfile.TarInfo(n);info.mode=m;info.size=len(d);t.addfile(info,io.BytesIO(d))
path=folder/'petshop-production-20261121.13-hk.tar.gz.next'
with tarfile.open(base) as old,path.open('wb') as raw,gzip.GzipFile(filename='',fileobj=raw,mode='wb',mtime=0,compresslevel=6) as g:
    with tarfile.open(fileobj=g,mode='w|') as t:
        names=set()
        for m in old:
            if m.isfile():
                mode,data=entries.get(m.name,(m.mode,None))
                if data is None:data=old.extractfile(m).read()
                add(t,m.name,mode,data);names.add(m.name)
        for n in sorted(entries.keys()-names):add(t,n,*entries[n])
assert sha(path.read_bytes())==NEW_SHA
path.replace(folder/'petshop-production-20261121.13-hk.tar.gz')
print('PETSHOP_21_13_STAGED '+NEW_SHA,flush=True)
'''.replace('BASE_SHA',repr(base_sha)).replace('NEW_SHA',repr(digest))
(folder/'stage.py').write_text(stage,encoding='utf-8',newline='\n')
upload=folder/'petshop-20261121.13-upload.tar'
with tarfile.open(upload,'w') as t:
    for n in ('stage.py','publish.py','release-delta.zlib'):t.add(folder/n,arcname=n)
summary={'version':manifest['version'],'sourceCommit':manifest['sourceCommit'],'sha256':digest,'previousSha256':base_sha,'archiveBytes':archive.stat().st_size,'uploadBytes':upload.stat().st_size,'uploadSha256':sha(upload.read_bytes()),'activeFiles':active,'workerSha256':sha(changes['account-service.mjs'][1]),'previousWorkerSha256':sha(old['account-service.mjs'][1]),'changedFiles':list(changes),'client':manifest,'showScoringVersion':2,'publicShows':'shared','localTestIncluded':False}
(folder/'package-summary.json').write_text(json.dumps(summary,indent=2)+'\n',encoding='utf-8')
print(json.dumps({k:v for k,v in summary.items() if k!='changedFiles'},indent=2))
