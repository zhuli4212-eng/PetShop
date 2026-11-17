"""Touch the built Web Mobile rooms in Edge using a disposable, deliberately unordered roster."""
import argparse
import json
import subprocess
from pathlib import Path
from tempfile import TemporaryDirectory

from PIL import Image
from playwright.sync_api import sync_playwright


GAME = Path(__file__).resolve().parents[1]
RESOURCES = GAME / "assets/resources"
STATUSES = ["全部", "种源", "未繁育", "已故"]
SEXES = ["全部", "公", "母"]
BREEDS = {"rabbit": ["domestic", "lop", "angora", "lionhead"],
          "cat": ["british", "american", "persian", "maine"],
          "dog": ["shiba", "corgi", "poodle", "dachshund"]}
SERVER = """
import { GameStore } from './server/game-store.mjs';
import { createPetShopServer } from './server/main.mjs';
const now = Date.now(), store = new GameStore(process.argv[1], {wall:()=>now,monotonic:()=>0});
store.ensure();
const s=store.state, template=s.pets[0], samples=JSON.parse(process.argv[2]);
s.rooms.cat=structuredClone(s.rooms.rabbit); s.rooms.dog=structuredClone(s.rooms.rabbit);
s.visitBook.opening=false;
s.shopXp=18000;
s.pets=samples.map(({busy,stage,minutes,...p})=>({...structuredClone(template),...p,bornAt:now-minutes*60000}));
for (const [species,room] of Object.entries(s.rooms)){
  const [mother,father]=['母','公'].map(sex=>s.pets.find(p=>p.species===species && p.sex===sex &&
    samples.find(a=>a.id===p.id).busy));
  room.job={motherId:mother.id,fatherId:father.id,mother,father,endsAt:now+86400000,offspring:[]};
}
store.save(s);
const server=createPetShopServer(undefined,{store});
server.listen(0,'127.0.0.1',()=>console.log(server.address().port));
"""


def fixture(reverse):
    pets = []
    for n, (species, breeds) in enumerate(BREEDS.items()):
        for i in range(16):
            stage = (["成长", "成年", "成年", "已故", "成年", "老年", "成年", "幼年",
                      "成年", "已故", "成年", "幼年", "成年", "成年", "幼年", "成年"])[i]
            minutes = {"幼年": 2, "成长": (16, 44, 50)[n], "成年": 1440,
                       "老年": (3, 4, 5)[n] * 1440 + 200, "已故": 15 * 1440}[stage]
            sex = "母" if i in (1, 2, 3, 6, 7, 8, 14, 15) else "公"
            # The two adjacent animals are the same breed/coat/sex at different ages.
            breed, coat = (breeds[0], 2) if i in (7, 8) else (breeds[(i * 3) % 4], 1 + (i * 5) % 6)
            pets.append(dict(id=f"{(i * 11 + n * 16) % 53 + 0xab100:05x}-qa-{species}-{i}",
                             name=("青禾 山桃 小葵 奶酥 胡桃 桔梗 小麦 云团 棉花 银杏 "
                                   "豆沙 小满 枫糖 柚子 梨花 南星").split()[i],
                             species=species, sex=sex, breedKey=breed, coatIndex=coat,
                             retained=i in (1, 3, 8) or (n == 1 and i == 10), bred=i in (4, 13),
                             busy=i in (1, 12), stage=stage, minutes=minutes))
    return pets[::-1] if reverse else pets


def matches(p, status, sex):
    return (sex == "全部" or p["sex"] == sex) and {
        "全部": True, "种源": p["retained"], "已故": p["stage"] == "已故",
        "未繁育": p["stage"] != "已故" and not p["busy"] and not p["bred"],
    }[status]


def visible_rect(image):
    box = image.getchannel("A").point(lambda a: 255 if a >= 128 else 0).getbbox()
    assert box is not None
    return [box[0]/image.width-.5, .5-box[3]/image.height,
            box[2]/image.width-.5, .5-box[1]/image.height]


def artwork(p):
    ident = f"{p['breedKey']}-coat{p['coatIndex']:02d}_{'female' if p['sex']=='母' else 'male'}"
    young, dead = p["stage"] == "幼年", p["stage"] == "已故"
    path = RESOURCES / ("pet-young" if young else "pets") / (ident + ".png")
    if dead:
        shared = path.with_name(ident.split("_")[0] + "-rest.png")
        path = shared if shared.exists() else path.with_name(ident + "-rest.png")
    meta = json.loads(path.with_suffix(".png.meta").read_text(encoding="utf-8"))
    with Image.open(path) as im:
        idle = visible_rect(im)
    info = dict(id=p["id"], stage=p["stage"], uuid=meta["subMetas"]["f9941"]["uuid"],
                idle=idle, walker=not dead and not p["busy"])
    if info["walker"]:
        strip = RESOURCES / ("pet-young-walk" if young else "pet-walk") / (ident + ".png")
        tex = json.loads(strip.with_suffix(".png.meta").read_text(encoding="utf-8"))
        info["texture"] = tex["uuid"] + "@6c48a"
        with Image.open(strip) as im:
            info["frames"] = [visible_rect(im.crop((i*96, 0, i*96+96, 96))) for i in range(4)]
    return info


BROWSER = r"""() => {
  const main=cc.director.getScene().getChildByName('Canvas').getComponent('ShopMain');
  const ui=n=>n.getComponent('cc.UITransform');
  const nodes=(root)=>[root,...root.children.flatMap(nodes)];
  const find=(name,root=main.node)=>nodes(root).find(n=>n.activeInHierarchy && n.name===name);
  const label=(node,name)=>node.getChildByName(name).getComponent(cc.Label).string;
  const point=(pos)=>{
    const s=main.node.getComponent(cc.Canvas).cameraComponent.worldToScreen(pos);
    const c=document.querySelector('canvas'),r=c.getBoundingClientRect();
    return [r.x+s.x*r.width/c.width,r.bottom-s.y*r.height/c.height];
  };
  const visit=()=>main.session.current;
  const art=()=>find('Artwork',find('DeskPage'));
  const residents=()=>art().children.filter(n=>/^Resident\d+$/.test(n.name))
    .sort((a,b)=>Number(a.name.slice(8))-Number(b.name.slice(8)));
  const rect=(resident,expected)=>{
    const n=resident.getChildByName('Portrait'),s=n.getComponent(cc.Sprite),f=s.spriteFrame;
    const box=f._uuid===expected.uuid ? expected.idle :
      f.texture?._uuid===expected.texture ? expected.frames[f.rect.x / 96] : null;
    if(!box) throw Error('Incorrect pose '+resident.name+' '+f._uuid+' for '+expected.id);
    const a=ui(art()),t=ui(n);
    const corners=[0,2].map(j=>a.convertToNodeSpaceAR(t.convertToWorldSpaceAR(
      new cc.Vec3(box[j]*t.width,box[j+1]*t.height,0))));
    const xs=corners.map(p=>p.x/a.width+.5),ys=corners.map(p=>.5-p.y/a.height);
    return [Math.min(...xs),Math.min(...ys),Math.max(...xs),Math.max(...ys)];
  };
  const positions=()=>residents().map(n=>[n.position.x/ui(art()).width,n.position.y/ui(art()).height]
    .map(value=>Number(value.toFixed(6))));
  window.roomQA={find,label,point,visit,residents,rect,art,ui,positions};
}"""


def tap(page, name):
    point = page.evaluate("""name=>{const q=roomQA,n=q.find(name);return n&&q.point(n.worldPosition)}""", name)
    assert point and 0 <= point[0] < page.viewport_size["width"] and 0 <= point[1] < page.viewport_size["height"], (name, point)
    page.touchscreen.tap(*point)


def varied(samples):
    # Sorting coordinates ignores which individual received a point. Simply
    # shuffling pets among an invariant set of floor slots fails this check.
    for axis in (0, 1):
        coordinates = [sorted(p[axis] for p in sample) for sample in samples]
        if not any(max(values) - min(values) > .015 for values in zip(*coordinates)):
            return False
    if len(samples[0]) >= 3:
        for sample in samples:
            levels = []
            for depth in sorted(p[1] for p in sample):
                if not levels or depth-levels[-1] >= .03:
                    levels.append(depth)
            if len(levels) >= 3:
                return True
        return False
    return True


def verify(browser, url, pets, width):
    page = browser.new_page(viewport={"width": width, "height": 568 if width == 320 else 844},
                            is_mobile=True, has_touch=True, reduced_motion="reduce", device_scale_factor=1)
    page.set_default_timeout(25000)
    errors = []
    page.on("pageerror", lambda e: errors.append(str(e)))
    page.goto(url)
    page.wait_for_function("""()=>window.cc?.director?.getScene()?.getChildByName('Canvas')
        ?.getComponent('ShopMain')?.home?.active""", timeout=90000)
    page.evaluate(BROWSER)
    tap(page, "RoomLink")

    def wait_room(species, status="全部", sex="全部"):
        page.wait_for_function("""([species,status,sex])=>{
          const v=roomQA.visit(),p=v?.data;
          return v?.key==='rooms' && (v.args.species||'rabbit')===species &&
            p?.filters?.[0].find(o=>o.active)?.label===status &&
            p.filters[1].find(o=>o.active)?.label===sex && roomQA.find('StatusFilter');
        }""", arg=[species,status,sex])

    def select(index, label):
        tap(page, ("StatusFilter", "SexFilter")[index])
        page.wait_for_function("()=>!!roomQA.find('FilterMenu')")
        opts = page.evaluate("""()=>roomQA.find('Options',roomQA.find('FilterMenu')).children
            .map(n=>[roomQA.label(n,'Caption'),n.name])""")
        assert [k for k, _ in opts] == (STATUSES, SEXES)[index], opts
        tap(page, dict(opts)[label])
        page.wait_for_function("""([i,label])=>!roomQA.find('FilterMenu') &&
            !!roomQA.find('SexFilter') && roomQA.visit()?.data?.filters?.[i].find(o=>o.active)?.label===label""",
            arg=[index,label])

    def check(species, status, sex):
        wait_room(species, status, sex)
        want = [p for p in pets if p["species"] == species and matches(p,status,sex)]
        ids = [p["id"] for p in want]
        snapshot = page.evaluate(r"""()=>{
          const q=roomQA,p=q.visit().data,desk=q.find('DeskPage');
          return {rows:p.rows.filter(r=>r.animal).map(r=>r.animal.id),
            residents:p.presentation.residents.map(r=>r.id),n:q.residents().length,matched:p.presentation.matchedCount,
            cards:desk.getComponentsInChildren(cc.Label).filter(l=>l.node.name==='Name'&&/^Animal\d+$/.test(l.node.parent.name))
              .sort((a,b)=>Number(a.node.parent.name.slice(6))-Number(b.node.parent.name.slice(6)))
              .map(l=>[l.string,q.label(l.node.parent,'Number')]),
            empty:desk.getComponentsInChildren(cc.Label).some(l=>l.string.includes('没有动物'))};
        }""")
        assert snapshot["rows"] == ids and snapshot["residents"] == ids[:10], (status,sex,snapshot,ids)
        assert snapshot["cards"] == [[p["name"],"#"+p["id"][:5].upper()] for p in want], snapshot
        assert snapshot["n"] == min(10,len(want)) and snapshot["matched"] == len(want), snapshot
        assert want or snapshot["empty"], snapshot
        shown = [artwork(p) for p in want[:10]]
        page.wait_for_function("""es=>roomQA.residents().every((r,i)=>{
          const n=r.getChildByName('Portrait');
          return n.getComponent(cc.Sprite)?.spriteFrame?._uuid===es[i].uuid &&
            Boolean(r.getChildByName('AtRest'))===(es[i].stage==='已故') &&
            Boolean(r.getComponent('RoomAnimalWalk'))===es[i].walker;
        })""",arg=shown)
        return shown

    def reopen(species, status, sex):
        tap(page, "Back")
        page.wait_for_function("()=>!!roomQA.find('RoomLink')")
        tap(page, "RoomLink")
        wait_room("rabbit")
        if species != "rabbit":
            tap(page, "Tab" + str(list(BREEDS).index(species)))
            wait_room(species)
        if status != "全部":
            select(0, status)
        if sex != "全部":
            select(1, sex)
        return check(species, status, sex)

    def random_entries(species, status, sex, count):
        shown = check(species, status, sex)
        assert len(shown) == count
        samples = [page.evaluate("roomQA.positions()")]
        for _ in range(5):
            assert reopen(species, status, sex) == shown
            samples.append(page.evaluate("roomQA.positions()"))
            if len(samples) >= 3 and varied(samples):
                break
        assert varied(samples), (width, species, count, "fixed floor coordinates", samples)
        print(width, species, count, "positions varied across", len(samples), "visits", flush=True)

    def stable_during_refresh():
        # A second client edits the disposable shop. The room's normal poll must
        # actually redraw the retained badge while preserving the ten floor positions.
        pet = next(p for p in pets if p["id"].endswith("-rabbit-14"))
        original = page.evaluate("roomQA.positions()")
        for retain in (True, False):
            page.evaluate("window.previousRoomQA = roomQA.art()")
            snapshot = page.request.post(url+"/api/page", data={"page":"rooms","args":{"species":"rabbit"}})
            assert snapshot.ok
            shop = snapshot.json()["shop"]
            response = page.request.post(url+"/api/action", data={
                "requestId":f"room-redraw-qa-{width}-{retain}", "profileId":shop["profileId"], "version":shop["version"],
                "type":"care.retain", "args":{"id":pet["id"], "retained":retain}})
            assert response.ok, response.text()
            page.wait_for_function("""([id,retained])=>roomQA.visit()?.data?.rows?.some(r=>
                r.animal?.id===id && r.animal.retained===retained) &&
                roomQA.art()!==window.previousRoomQA""", arg=[pet["id"],retain])
            check("rabbit","全部","全部")
            assert page.evaluate("roomQA.positions()") == original, (width,"positions changed on poll")
        # A height change exercises a second, layout-driven redraw of the same visit.
        height = page.viewport_size["height"]
        for new_height in (height+40, height):
            page.evaluate("window.previousRoomQA = roomQA.art()")
            page.set_viewport_size({"width":width, "height":new_height})
            page.wait_for_function("()=>roomQA.art() && roomQA.art()!==window.previousRoomQA")
            check("rabbit","全部","全部")
            assert page.evaluate("roomQA.positions()") == original, (width,"positions changed on resize")

    def check_movement(species, shown):
        # Sample movement over actual rendered frames. Static animals must keep position, pose and orientation.
        page.emulate_media(reduced_motion="no-preference")
        motion=page.evaluate("""async es=>{
          const q=roomQA, animals=q.residents(),start=performance.now(), moved=new Set();
          const origin=animals.map(r=>[r.position.x,r.position.y]);
          const ground=animals.map((r,i)=>q.rect(r,es[i])[3]), roomHeight=q.ui(q.art()).height;
          let minGround=1,maxGround=0,maxWidth=0;
          while(performance.now()-start<8500){
            for(const [i,r] of animals.entries()){
              const b=q.rect(r,es[i]),sp=r.getChildByName('Portrait');
              // During a hop the sprite lifts, while its ground point continues on the floor.
              const foot=ground[i]-(r.position.y-origin[i][1])/roomHeight;
              minGround=Math.min(minGround,foot);maxGround=Math.max(maxGround,foot);maxWidth=Math.max(maxWidth,b[2]-b[0]);
              if(b[0]<0||b[2]>1||b[1]<0||b[3]>1||foot<.52||foot>.98)
                throw Error('Outside room floor '+JSON.stringify([es[i].id,b,foot]));
              if(Math.hypot(r.position.x-origin[i][0],r.position.y-origin[i][1])>.1)moved.add(i);
              if(!es[i].walker && (moved.has(i)||sp.angle!==0||sp.scale.x!==1||
                sp.getComponent(cc.Sprite).spriteFrame._uuid!==es[i].uuid))throw Error('Static animal moved '+es[i].id);
            }
            await new Promise(requestAnimationFrame);
          }
          return {moving:[...moved].sort(),minGround,maxGround,maxWidth};
        }""",shown)
        assert motion["moving"] == [i for i,e in enumerate(shown) if e["walker"]], (species,width,motion)
        assert motion["maxWidth"] < .185, (species,width,motion)
        print(width,species,len(shown),"residents, floor and motions",motion,flush=True)
        page.emulate_media(reduced_motion="reduce")

    screenshot = None
    for species_index, species in enumerate(BREEDS):
        if species_index:
            tap(page,"Tab"+str(species_index))
        shown = check(species,"全部","全部")
        assert len(shown) == 10
        if species == "rabbit":
            stable_during_refresh()
            random_entries(species,"全部","全部",10)
        bounds = page.evaluate("es=>roomQA.residents().map((r,i)=>roomQA.rect(r,es[i]))",shown)
        sizes = page.evaluate("""()=>{const q=roomQA,w=q.ui(q.art()).width;
            return q.residents().map(n=>q.ui(n.getChildByName('Portrait')).width/w)}""")
        # The former normal animal canvas occupied 64/390 of the scene width.
        assert .12 < max(sizes) < (64/390)*.8, (species,width,sizes)
        younger, adult = [next(i for i,e in enumerate(shown) if e["id"].endswith(f"-{k}")) for k in (7,8)]
        heights = [b[3]-b[1] for b in bounds]
        assert heights[younger] < heights[adult] * .91, (species,width,heights[younger],heights[adult])
        if width==390 and species=="rabbit":
            screenshot = page.screenshot()
        # Touch every rabbit in the crowded scene, including overlapping hit areas and deceased animals.
        if species=="rabbit":
            for i,e in enumerate(shown):
                x,y=page.evaluate("""([i,e])=>{
                  const q=roomQA,r=q.residents()[i],a=q.ui(q.art()),b=q.rect(r,e);
                  const cx=(b[0]+b[2])/2,cy=(b[1]+b[3])/2;
                  return q.point(a.convertToWorldSpaceAR(new cc.Vec3((cx-.5)*a.width,(.5-cy)*a.height,0)));
                }""",[i,e])
                page.touchscreen.tap(x,y)
                page.wait_for_function("id=>roomQA.visit()?.data?.presentation?.animal?.id===id",arg=e["id"])
                tap(page,"Back")
                check(species,"全部","全部")
        check_movement(species, shown)
        if species=="rabbit":
            for status in STATUSES:
                select(0,status)
                for sex in SEXES:
                    select(1,sex)
                    check(species,status,sex)
        elif species=="cat":
            select(0,"种源")
            select(1,"公")
            random_entries(species,"种源","公",1)
            check_movement(species,check(species,"种源","公"))
    assert not errors,errors
    page.close()
    return screenshot


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--screenshot",type=Path,help="optional output path for the 390px ten-resident room")
    args=parser.parse_args()
    shot=None
    with sync_playwright() as pw:
        browser=pw.chromium.launch(channel="msedge",args=["--use-angle=swiftshader"])
        for width in (320,390):
            pets=fixture(reverse=width==320)
            with TemporaryDirectory(prefix="petshop-room-filter-") as temp:
                process=subprocess.Popen(["node","--input-type=module","-e",SERVER,temp,json.dumps(pets,ensure_ascii=False)],
                    cwd=GAME,stdout=subprocess.PIPE,text=True,creationflags=getattr(subprocess,"CREATE_NO_WINDOW",0))
                try:
                    port=int(process.stdout.readline())
                    shot=verify(browser,f"http://127.0.0.1:{port}",pets,width) or shot
                finally:
                    process.terminate()
                    process.wait(timeout=10)
        browser.close()
    if args.screenshot:
        args.screenshot.write_bytes(shot)


if __name__=="__main__":
    main()
