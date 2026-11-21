from pathlib import Path
import base64,gzip,hashlib,io,json,re,tarfile,zlib

folder=Path(__file__).resolve().parent
root=folder.parents[2]
base=root/'output/aliyun/candidate-browser-system-fonts-20261121/petshop-production-20261121.11-hk.tar.gz'
sha=lambda data:hashlib.sha256(data).hexdigest()
base_sha='16405a2d8a688bb1277462590b3f96b03bf6f50878cf4fc1f9383857bbafbf8b'
assert sha(base.read_bytes())==base_sha
with tarfile.open(base) as t:
    old={m.name:(m.mode,t.extractfile(m).read()) for m in t if m.isfile()}
manifest=json.loads((folder/'pages/release.json').read_bytes())
assert manifest['version']=='2026.11.21.12'
assert manifest['sourceCommit']=='5efb4064bee6c14891a924bf140ea5a80baf25cc'
assert sha((folder/'pages'/manifest['clientBundle']).read_bytes())==manifest['clientSha256']
changes={}
for file in (folder/'pages').rglob('*'):
    if not file.is_file() or file.name in ('_worker.js','trial-shopfront-wide.png'):continue
    name='public/'+file.relative_to(folder/'pages').as_posix()
    data=file.read_bytes()
    if name not in old or old[name][1]!=data:changes[name]=(0o644,data)
changes['account-service.mjs']=(old['account-service.mjs'][0],(folder/'pages/_worker.js').read_bytes())
assert not any('local-opening' in n or 'save-test' in n or n.endswith(('.ttf','.woff','.woff2')) for n in changes)
assert b'localTest.addCoins' not in changes['account-service.mjs'][1]
assert b'localTest.addCoins' not in (folder/'pages'/manifest['clientBundle']).read_bytes()
archive=folder/'petshop-production-20261121.12-hk.tar.gz'
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
publish=(root/'output/aliyun/candidate-market-breed-20261121/publish.py').read_text(encoding='utf-8')
publish=publish.replace('21.7','21.12').replace('PETSHOP_21_7','PETSHOP_21_12')
publish=publish.replace('b430fb15582a5c7d709973338209f0ed4192ce795ef9d8cbc9644d028a94b106',digest)
publish=publish.replace('c0532907dbff07670c9c1421aa822a0d6fd599c2',manifest['sourceCommit'])
publish=publish.replace('c45b7a59fc31fa3ea1976bbee588c06f4e101c6f',json.loads(old['public/release.json'][1])['sourceCommit'])
publish=publish.replace("old_manifest['version'] == '2026.11.21.6'","old_manifest['version'] == '2026.11.21.11'")
publish=publish.replace('0574c42f004064e97b12d90bde1bf1b0befde962c1c962bcc729befaad7da074',sha(old['account-service.mjs'][1]))
publish=re.sub(r'^extra_paths = .+$','extra_paths = '+repr(active),publish,flags=re.M)
publish=publish.replace("'changeScope':'market species and dependent breed filters'","'changeScope':'approved room, breeding, profile, scenes, opening, letter, order and guest UI; production show scoring remains version 1'")
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
base=Path('/root/petshop-release-20261121.11/petshop-production-20261121.11-hk.tar.gz')
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
path=folder/'petshop-production-20261121.12-hk.tar.gz.next'
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
path.replace(folder/'petshop-production-20261121.12-hk.tar.gz')
print('PETSHOP_21_12_STAGED '+NEW_SHA,flush=True)
'''.replace('BASE_SHA',repr(base_sha)).replace('NEW_SHA',repr(digest))
(folder/'stage.py').write_text(stage,encoding='utf-8',newline='\n')
upload=folder/'petshop-20261121.12-upload.tar'
with tarfile.open(upload,'w') as t:
    for n in ('stage.py','publish.py','release-delta.zlib'):t.add(folder/n,arcname=n)
summary={'version':manifest['version'],'sourceCommit':manifest['sourceCommit'],'sha256':digest,'previousSha256':base_sha,'archiveBytes':archive.stat().st_size,'uploadBytes':upload.stat().st_size,'uploadSha256':sha(upload.read_bytes()),'activeFiles':active,'workerSha256':sha(changes['account-service.mjs'][1]),'previousWorkerSha256':sha(old['account-service.mjs'][1]),'changedFiles':list(changes),'client':manifest,'showScoringVersion':1,'localTestIncluded':False}
(folder/'package-summary.json').write_text(json.dumps(summary,indent=2)+'\n',encoding='utf-8')
print(json.dumps({k:v for k,v in summary.items() if k!='changedFiles'},indent=2))
