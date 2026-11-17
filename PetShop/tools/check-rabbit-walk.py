"""Exercise all 96 rabbit walk slots in the built game, using a disposable shop."""
import json
import subprocess
from pathlib import Path
from tempfile import TemporaryDirectory

from PIL import Image
from playwright.sync_api import sync_playwright


GAME = Path(__file__).resolve().parents[1]
RESOURCES = GAME / "assets/resources"
GROUND_LINE_ORIGINALS = {"pet-walk/domestic-coat01_male", "pet-walk/angora-coat01_female"}
SERVER = """
import {GameStore} from './server/game-store.mjs';
import {createPetShopServer} from './server/main.mjs';
const groups=JSON.parse(process.argv[2]), store=new GameStore(process.argv[1]); store.ensure();
const s=store.state, base=structuredClone(s.pets[0]);
s.visitBook.opening=false; s.shopXp=18000; store.save(s);
const server=createPetShopServer(undefined,{store}); let last=-1;
// Three residents per fixture keep simultaneous four-frame observations easy to diagnose.
server.prependListener('request',req=>{
  const index=Number(req.headers['x-rabbit-check-group']);
  if(req.url!=='/api/page' || !Number.isInteger(index) || !groups[index] || index===last) return;
  last=index;
  store.state.pets=groups[index].map((p,i)=>({...structuredClone(base),
    id:(0xad0000+index*3+i).toString(16)+'-test',name:['团团','栗子','毛球'][i],
    species:'rabbit',breedKey:p.breed,coatIndex:p.coat,sex:p.sex,
    retained:false,bornAt:store.now()-(p.young?60000:86400000)}));
});
server.listen(0,'127.0.0.1',()=>console.log(server.address().port));
"""

OBSERVE = """async expected=>{
 const walkers=window.shop.session.host.layer.getComponentsInChildren(cc.Component)
   .filter(c=>c.sprite && c.patrol && Array.isArray(c.frames) && typeof c.path==='string');
 if(walkers.length!==expected.length) throw Error('Unexpected room size '+walkers.length);
 const seen=walkers.map(()=>new Set()), moved=walkers.map(()=>false), stopped=walkers.map(()=>false);
 const extraLift=walkers.map(()=>false);
 const start=performance.now();
 while(performance.now()-start<20000){
  for(const [i,w] of walkers.entries()){
   const e=expected[i], frame=w.sprite.spriteFrame;
   if(w.path!==e.key+'/texture') throw Error('Unexpected texture slot '+w.path+' for '+e.key);
   if(frame?.texture?._uuid===e.texture){
    seen[i].add(frame.rect.x/96);
    if(Math.abs(w.sprite.node.position.y-w.poseY)>.01) extraLift[i]=true;
    if(w.leg && Math.abs(w.node.position.x-w.originX)>.1) moved[i]=true;
   } else if(moved[i] && !w.leg && frame?._uuid===e.portrait) stopped[i]=true;
  }
  if(seen.every(s=>s.size===4) && moved.every(Boolean) && stopped.every(Boolean)){
   if(extraLift.some((v,i)=>v!==expected[i].legacy)) throw Error('Incorrect airborne displacement');
   return;
  }
  await new Promise(requestAnimationFrame);
 }
 throw Error(JSON.stringify({slots:expected.map(e=>e.key),frames:seen.map(s=>[...s]),moved,stopped}));
}"""


def fixture():
    entries = []
    catalogue = json.loads((GAME.parent/"动物资源/扩充图鉴/动物索引.json").read_text(encoding="utf-8"))
    manifest = json.loads((GAME.parent/"制作/动物图集源稿/独立逐帧行走/动作来源.json").read_text(encoding="utf-8"))
    bundle = GAME/"build/web-mobile/assets/resources"
    paths = {row[0] for row in json.loads((bundle/"config.json").read_text(encoding="utf-8"))["paths"].values()}
    for a in catalogue["animals"]:
        if a["speciesId"] != "rabbit":
            continue
        for young in [False, True]:
            sid = f"{a['breedId']}-{a['coatId']}_{a['sexId']}"
            key = ("pet-young-walk/" if young else "pet-walk/") + sid
            still = ("pet-young/" if young else "pets/") + sid
            image = RESOURCES/(key+".png")
            meta = json.loads(image.with_suffix(".png.meta").read_text(encoding="utf-8"))
            idle = json.loads((RESOURCES/(still+".png.meta")).read_text(encoding="utf-8"))
            uid = meta["uuid"]
            native = bundle/"native"/uid[:2]/(uid+".png")
            assert key+"/texture" in paths and native.read_bytes() == image.read_bytes() == (GAME.parent/manifest[key]).read_bytes(), key
            with Image.open(image) as strip:
                assert strip.size == (384,96) and strip.mode == "RGBA", key
                alpha = [strip.crop((96*i,0,96*(i+1),96)).getchannel("A").point(lambda v:255 if v>=125 else 0) for i in range(4)]
                assert all(frame.getbbox() for frame in alpha) and len({frame.tobytes() for frame in alpha})==4, key
                bottoms = [frame.getbbox()[3] for frame in alpha]
                if key in GROUND_LINE_ORIGINALS:
                    assert bottoms == [90]*4, (key,bottoms)
                else:
                    assert bottoms[0] == bottoms[1] == bottoms[3] == 90 and bottoms[2]<90, (key,bottoms)
            entries.append(dict(breed=a["breedId"], coat=int(a["coatId"][4:]), sex=a["sex"], young=young,
                                key=key, texture=uid+"@6c48a", portrait=idle["subMetas"]["f9941"]["uuid"],
                                legacy=key in GROUND_LINE_ORIGINALS))
    assert len(entries) == len({e["key"] for e in entries}) == 96
    return [entries[i:i+3] for i in range(0,len(entries),3)]


def check_rooms(browser, url, groups, width):
    page = browser.new_page(viewport={"width":width,"height":844 if width==390 else 568},
                            is_mobile=True, has_touch=True, reduced_motion="no-preference")
    errors = []
    page.on("pageerror", lambda e: errors.append(str(e)))
    page.goto(url)
    page.wait_for_function("()=>window.cc?.director?.getScene()?.getChildByName('Canvas')?.getComponent('ShopMain')?.shop?.profileId")
    page.evaluate("()=>{window.shop=cc.director.getScene().getChildByName('Canvas').getComponent('ShopMain')}")
    for index, group in enumerate(groups):
        if width==320 and index%8:
            continue
        page.set_extra_http_headers({"x-rabbit-check-group":str(index)})
        page.evaluate("i=>shop.session.open('rooms',{species:'rabbit',checkGroup:i})",index)
        page.evaluate(OBSERVE,group)
        print(width, index+1, [p["key"] for p in group], flush=True)
    assert not errors, errors
    page.close()


if __name__ == "__main__":
    groups = fixture()
    # Only the fixture identities need to cross the Windows command line.
    animals = [[{k:e[k] for k in ("breed","coat","sex","young")} for e in g] for g in groups]
    with TemporaryDirectory(prefix="petshop-rabbit-hops-") as save:
        proc = subprocess.Popen(["node","--input-type=module","-e",SERVER,save,json.dumps(animals,ensure_ascii=False)],
                                cwd=GAME, stdout=subprocess.PIPE, text=True, encoding="utf-8",
                                creationflags=getattr(subprocess,"CREATE_NO_WINDOW",0))
        try:
            url = "http://127.0.0.1:" + str(int(proc.stdout.readline()))
            with sync_playwright() as pw:
                browser = pw.chromium.launch(channel="msedge",args=["--use-angle=swiftshader","--enable-unsafe-swiftshader"])
                for width in (320,390):
                    check_rooms(browser,url,groups,width)
                browser.close()
        finally:
            proc.terminate()
            proc.wait(timeout=15)
