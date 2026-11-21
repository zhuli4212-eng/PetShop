from pathlib import Path
import base64,gzip,hashlib,io,json,os,tarfile,zlib
os.umask(0o077)
sha=lambda b:hashlib.sha256(b).hexdigest()
folder=Path(__file__).resolve().parent
base=Path('/root/petshop-release-20261121.12/petshop-production-20261121.12-hk.tar.gz')
assert sha(base.read_bytes())=='68242ff339e429afb36058f94ac79b33af156543801a9b198bea945f42e76cbd'
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
assert sha(path.read_bytes())=='47d30c442340750876f87f7b64ca9b130e5eec73ab1b61c7cef95d29578474fd'
path.replace(folder/'petshop-production-20261121.13-hk.tar.gz')
print('PETSHOP_21_13_STAGED '+'47d30c442340750876f87f7b64ca9b130e5eec73ab1b61c7cef95d29578474fd',flush=True)
