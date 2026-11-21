from pathlib import Path
import base64,gzip,hashlib,io,json,os,tarfile,zlib
os.umask(0o077)
sha=lambda b:hashlib.sha256(b).hexdigest()
folder=Path(__file__).resolve().parent
base=Path('/root/petshop-release-20261121.11/petshop-production-20261121.11-hk.tar.gz')
assert sha(base.read_bytes())=='16405a2d8a688bb1277462590b3f96b03bf6f50878cf4fc1f9383857bbafbf8b'
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
assert sha(path.read_bytes())=='68242ff339e429afb36058f94ac79b33af156543801a9b198bea945f42e76cbd'
path.replace(folder/'petshop-production-20261121.12-hk.tar.gz')
print('PETSHOP_21_12_STAGED '+'68242ff339e429afb36058f94ac79b33af156543801a9b198bea945f42e76cbd',flush=True)
