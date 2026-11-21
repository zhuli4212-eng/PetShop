
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
import hashlib,json,re,subprocess,sys,time
from urllib.parse import urlsplit
folder=Path(__file__).resolve().parent
public=folder/'runtime/public'
release=json.loads((public/'release.json').read_text())
start_text=(public/'trial-start.js').read_text(encoding='utf-8')
name=re.search(r'src/game-resources\.[a-f0-9]+\.json',start_text)[0]
parts=json.loads((public/name).read_text())['parts']
start=re.search(r'trial-start\.js\?v=[a-f0-9]{16}',(public/'index.html').read_text(encoding='utf-8'))[0]
routes={'aliyunDirect':'https://play.zhu-li-4212.xyz/petshop/',
    'existingGateway':'https://petshop-trial.pages.dev/','newTrialDomain':'https://www.petshop-trial.fun/petshop/'}
def test(route):
    label,base=route
    paths=[('index.html',200,None),('release.json',200,None),(start,200,None),
           (release['clientEntry'],200,None),(release['clientBundle'],200,None),(name,200,None)]
    engine=re.search(r'./(_virtual_cc-[\w-]+\.js)',(public/'cocos-js/cc.js').read_text(encoding='utf-8'))[1]
    paths += [(asset,200,None) for asset in ['src/import-map.json','cocos-js/cc.js','cocos-js/'+engine]]
    if label=='aliyunDirect':
        summary=json.loads((folder/'package-summary.json').read_text())
        paths += [(asset,200,None) for asset in summary['activeFiles'] if 'diagnostic' in asset]
    paths += [(asset,200,None) for asset in ['assets/resources/native/fd/fd685f01-8b2e-46ef-abc4-f4e448943ef2.png']]
    paths += [(part['path'],206,part['bytes']) for part in parts]
    paths += [('/petshop-api/v1/health',200,None),('/petshop-api/v1/shop',401,None),
              ('local-opening/wallet.mjs',404,None)]
    records=[]
    for path,expected,size in paths:
        url=(base if path=='index.html' else base.rstrip('/')+path) if path.startswith('/') is False and path=='index.html' else base+path
        if path.startswith('/'):
            u=urlsplit(base)
            url=u.scheme+'://'+u.netloc+path
        marker=b'\nPETSHOP_PROBE:'
        cmd=['curl.exe','--noproxy','*','--compressed','--connect-timeout','8','--max-time','40',
            '--retry','1','--retry-delay','1','-sS','-D','-','-w','\nPETSHOP_PROBE:%{http_code} %{remote_ip} %{time_starttransfer}']
        if size:
            cmd+=['-H','Range: bytes=0-63']
        result=subprocess.check_output(cmd+[url])
        http,peer,first=result.rsplit(marker,1)[1].decode().split()
        response=result.rsplit(marker,1)[0]
        header,body=response.rsplit(b'\r\n\r\n',1) if len(response)<4 else response.split(b'\r\n\r\n',1)
        # curl may prepend a transient response header when retrying.
        while body.startswith(b'HTTP/'):
            header,body=body.split(b'\r\n\r\n',1)
        assert int(http)==expected,(label,path,http)
        fields=dict((k.strip().lower(),v.strip()) for k,sep,v in (line.partition(':') for line in header.decode('iso-8859-1').splitlines()[1:]) if sep)
        if path.startswith('/'):
            if expected==200: assert json.loads(body)['status']=='ok'
        elif expected!=404:
            local=public/path.split('?')[0]
            with local.open('rb') as file:
                original=file.read(64) if size else file.read()
            if label=='newTrialDomain' and path.startswith('trial-start.js'):
                assert b'https://www.petshop-trial.fun' in body
                assert body.replace(b'\"https://www.petshop-trial.fun\",',b'')==original or body.replace(b',\"https://www.petshop-trial.fun\"',b'')==original
            else: assert body==original,(label,path,len(body),len(original))
            if size:
                assert fields.get('content-range')==f'bytes 0-63/{size}',(label,path,fields)
        records.append({'path':path,'status':int(http),'peer':peer,'firstByteSeconds':float(first),
            'bodyBytes':len(body),'sha256':hashlib.sha256(body).hexdigest(),'totalAssetBytes':size})
    return label,records
with ThreadPoolExecutor(max_workers=2) as pool:
    report=dict(pool.map(test,routes.items()))
(folder/'public-verification.json').write_text(json.dumps(report,indent=2)+'\n',encoding='utf-8')
print(json.dumps({key:len(value) for key,value in report.items()}),flush=True)
