"""Touch the breeding settings in a Web Mobile build against disposable shops."""
import argparse
import json
import math
import subprocess
from pathlib import Path
from tempfile import TemporaryDirectory

from playwright.sync_api import sync_playwright


PROJECT = Path(__file__).resolve().parents[1]
FIELDS = ["性格", "品相", "毛发", "体态", "体型", "健全度"]
GRADES = ["E", "D", "C", "B", "A", "S", "S+"]
MOTHER = ["B", "A", "C", "S+", "E", "S"]
FATHER = ["D", "B", "S", "S", "D", "C"]
SPECIES = ["rabbit", "cat", "dog"]
CARDS = [0, 1, 3]
LEVEL = 4
SEED = """
import {GameStore} from './server/game-store.mjs';
import {createPetShopServer} from './server/main.mjs';
import {createInterface} from 'node:readline';
import {SPECIES} from './server/care.mjs';
const [directory,webRoot,input] = process.argv.slice(1);
const fixtures = JSON.parse(input);
let now = Date.now();
const store = new GameStore(directory,{wall:()=>now,monotonic:()=>0});
store.ensure();
const s=store.state, parents=s.pets, room=s.rooms.rabbit;
s.shopXp=18000;s.visitBook.opening=false;s.pets=[];
// Keep the real breeding, clock and settlement paths; always draw the maximum rabbit litter.
SPECIES.rabbit.litter=[0,0,100];
for(const {species,breed,cards,names,grades,level} of fixtures) {
  s.rooms[species]=structuredClone(room);
  s.rooms[species].items.guide=cards;
  s.rooms[species].mutationEnabled=true;
  s.research[species]=[2,level,0];
  for (const [i,sex] of ['母','公'].entries()) {
    const p=structuredClone(parents.find(p=>p.sex===sex));
    Object.assign(p,{id:species+'-'+i,name:names[i],species,breedKey:breed,bornAt:now-86400000});
    p.traits.forEach((t,k)=>{t.grade=grades[i][k];});
    s.pets.push(p);
  }
}
store.save(s);
const server=createPetShopServer(webRoot,{store});
server.listen(0,'127.0.0.1',()=>console.log(server.address().port));
createInterface({input:process.stdin}).on('line', command=>{
  if(command==='finish-litters'){now+=11*60000;console.log('advanced');}
});
"""

# Use Cocos transforms to locate rendered controls. All choices, toggles, scrolling
# and confirmation are actual touchscreen input to the canvas.
LOCATORS = r"""() => {
  const main=cc.director.getScene().getChildByName('Canvas').getComponent('ShopMain');
  const all=node=>node?[node,...node.children.flatMap(all)]:[];
  const nodes=()=>all(main.node).filter(n=>n.activeInHierarchy);
  const label=node=>node.getComponent('cc.Label')?.string;
  const find=(name,root)=> (root?all(root):nodes()).find(n=>n.activeInHierarchy&&n.name===name);
  const title=(text,root)=> (root?all(root):nodes()).find(n=>n.activeInHierarchy&&label(n)===text);
  const point=v=>{
    const p=main.node.getComponent(cc.Canvas).cameraComponent.worldToScreen(v);
    const canvas=document.querySelector('canvas'),rect=canvas.getBoundingClientRect();
    return [rect.x+p.x*rect.width/canvas.width,rect.bottom-p.y*rect.height/canvas.height];
  };
  const box=(n)=>{
    const t=n.getComponent('cc.UITransform'), local=(x,y)=>t.convertToWorldSpaceAR(new cc.Vec3(x,y,0));
    const [left,bottom]=point(local(-t.anchorX*t.width,-t.anchorY*t.height));
    const [right,top]=point(local((1-t.anchorX)*t.width,(1-t.anchorY)*t.height));
    return {left,right,top,bottom};
  };
  const measure=({node,text,scope})=>{
    const parent=scope?find(scope):null;
    if(scope&&!parent)return null;
    const n=node?find(node,parent):title(text,parent);
    if(!n)return null;
    let clip={top:0,bottom:innerHeight,left:0,right:innerWidth};
    for(let p=n.parent;p;p=p.parent){
      if(p.getComponent(cc.Mask)) {
        const b=box(p);
        clip={top:Math.max(clip.top,b.top),bottom:Math.min(clip.bottom,b.bottom),
              left:Math.max(clip.left,b.left),right:Math.min(clip.right,b.right)};
      }
    }
    const [x,y]=point(n.worldPosition);
    return {x,y,clip};
  };
  window.pairQA={find,title,measure,box,visit:()=>main.session.current,offset:()=>main.session.scroll?.getScrollOffset().y??0,
    ready:()=>!main.session.reading&&!main.session.busy&&main.session.current?.version!==undefined,
    texts:n=>all(n).filter(x=>x.activeInHierarchy).map(label).filter(x=>typeof x==='string')};
}"""


def fixtures(width):
    pairs = []
    for species,breed,cards,names in zip(SPECIES, ["angora","british","corgi"], CARDS,
                                          [["小满","青团"],["雪梨","花卷"],["栗子","核桃"]]):
        father = FATHER
        if species=="cat":
            father = MOTHER if width==390 else [FATHER[0],*MOTHER[1:]]
        pairs.append(dict(species=species,breed=breed,cards=cards,names=names,grades=[MOTHER,father],level=LEVEL))
    return pairs


def rise(mother, father, guided, level):
    m, f = GRADES.index(mother), GRADES.index(father)
    weight = (0.8 if m>f else 0.2) if guided else 0.5

    def chance(base, reference):
        result = [18,18,18,18,10,6,0][base]
        if reference < base-1:
            result = min(result,3)
        return result*(1+0.03*level)

    return weight*chance(m,f)+(1-weight)*chance(f,m)


class Touch:
    def __init__(self, page):
        self.page = page
        self.cdp = page.context.new_cdp_session(page)

    def wait(self, expression, arg=None):
        self.page.wait_for_function(expression,arg=arg,timeout=15000)

    def tap(self, node=None, *, text=None, scope=None):
        target = {"node":node,"text":text,"scope":scope}
        self.wait("t=>!!pairQA.measure(t)",target)
        for _ in range(12):
            v = self.page.evaluate("t=>pairQA.measure(t)",target)
            x,y,clip = v["x"],v["y"],v["clip"]
            assert clip["left"]<=x<=clip["right"],(target,v)
            if clip["top"]+1 <= y <= clip["bottom"]-1:
                offset=self.page.evaluate("pairQA.offset()")
                self.page.touchscreen.tap(x,y)
                return offset
            top,bottom = clip["top"]+8,clip["bottom"]-8
            start,end = (bottom,top) if y>bottom else (top,bottom)
            distance = min(abs(end-start),abs(y-(top+bottom)/2))
            end = start+math.copysign(distance,end-start)
            for i in range(8):
                self.cdp.send("Input.dispatchTouchEvent",{"type":"touchStart" if i==0 else "touchMove",
                    "touchPoints":[{"x":x,"y":start+(end-start)*i/7}]})
                self.page.wait_for_timeout(30)
            self.page.wait_for_timeout(90)
            self.cdp.send("Input.dispatchTouchEvent",{"type":"touchEnd","touchPoints":[]})
            self.page.wait_for_timeout(130)
        raise AssertionError(("Could not scroll to",target,v))

    def kind(self, kind):
        self.wait("k=>pairQA.ready() && pairQA.visit().data.presentation?.kind===k",kind)

    def guide_options(self):
        self.tap("ChooseGuide")
        self.wait("()=>!!pairQA.find('FilterMenu')")
        return self.page.evaluate("""()=>pairQA.find('Options',pairQA.find('FilterMenu')).children.map(n=>({
            name:n.getChildByName('Caption').getComponent(cc.Label).string,selected:!!n.getChildByName('Mark')}))""")

    def choose_guide(self, index):
        self.tap("Option"+str(index),scope="FilterMenu")
        self.wait("()=>!pairQA.find('FilterMenu') && pairQA.ready()")


def check_dialog(page, settings, selected, enabled):
    names = page.evaluate("""()=>{const q=pairQA,d=q.find('BonusDialog');return d ? Array.from({length:6},(_,i)=>{
        const row=q.find('Trait'+i,d);return {copy:q.texts(row),chance:q.find('Chance',row)?.getComponent(cc.Label).string};
    }):null;}""")
    assert names and len(names)==6,names
    for i,row in enumerate(names):
        mother, father = (parent[i] for parent in settings["grades"])
        expected = rise(mother,father,i==selected,settings["level"] if enabled else 0)
        assert FIELDS[i] in " ".join(row["copy"]),row
        assert mother+" / "+father in row["copy"],row
        assert row["chance"] and row["chance"].endswith("%"),row
        assert abs(float(row["chance"][:-1])-expected)<0.00051,(i,row,expected)
    bounds = page.evaluate("()=>pairQA.box(pairQA.find('Settings',pairQA.find('BonusDialog')))")
    assert -1<=bounds["left"] and bounds["right"]<=page.viewport_size["width"]+1,bounds
    assert -1<=bounds["top"] and bounds["bottom"]<=page.viewport_size["height"]+1,bounds


def verify(browser, web, width, output):
    samples = fixtures(width)
    with TemporaryDirectory(prefix="petshop-breeding-controls-") as directory:
        process = subprocess.Popen(["node","--input-type=module","-e",SEED,directory,str(web),json.dumps(samples)],
            cwd=PROJECT,stdin=subprocess.PIPE,stdout=subprocess.PIPE,text=True,encoding="utf-8",
            creationflags=getattr(subprocess,"CREATE_NO_WINDOW",0))
        page = browser.new_page(viewport={"width":width,"height":568 if width==320 else 844},
                                is_mobile=True,has_touch=True,device_scale_factor=1)
        errors = []
        page.on("pageerror",lambda err:errors.append(str(err)))
        def room_state(species):
            return json.loads((Path(directory)/"shop.json").read_text(encoding="utf-8"))["rooms"][species]

        try:
            url="http://127.0.0.1:"+str(int(process.stdout.readline()))
            page.goto(url)
            page.wait_for_function("()=>window.cc?.director?.getScene()?.getChildByName('Canvas')?.getComponent('ShopMain')?.home?.active",timeout=90000)
            page.evaluate(LOCATORS)
            touch = Touch(page)
            touch.tap("Hotspot_breed")
            touch.kind("pair")
            for room_index,sample in enumerate(samples):
                species,initial = sample["species"],sample["cards"]
                if room_index:
                    touch.tap("Tab"+str(room_index),scope="DeskPage")
                    touch.kind("pair")
                for i in range(2):
                    # The parent names in the selection slots also appear in the rows.
                    touch.tap("Animal"+str(i),scope="DeskPage")
                    touch.wait("name=>pairQA.ready() && pairQA.visit().data.presentation.parents.some(p=>p?.name===name)",sample["names"][i])
                touch.tap("Review",scope="DeskPage")
                touch.kind("pairConfirm")
                different = [i for i,(m,f) in enumerate(zip(*sample["grades"])) if m!=f] if initial else []
                labels = ["不使用指导单",*["指导"+FIELDS[i] for i in different]]
                def options(active):
                    shown=touch.guide_options()
                    assert [r["name"] for r in shown]==labels,shown
                    assert [r["name"] for r in shown if r["selected"]]==[active],shown

                def choose(item):
                    touch.choose_guide(item)
                    value = different[item-1] if item else -1
                    touch.wait("i=>pairQA.ready() && pairQA.visit().data.presentation?.guide?.index===i",value)
                    assert room_state(species)["items"]["guide"]==initial
                    return value

                options(labels[0])
                selected = choose(0)
                if different:
                    current = 0
                    for item in (1,len(different),0,1):
                        options(labels[current])
                        selected = choose(item)
                        current = item
                assert "撤下指导单" not in page.evaluate("()=>pairQA.texts(pairQA.find('DeskPage'))")
                enabled=True
                if species=="dog":
                    if page.evaluate("()=>!!pairQA.find('Next',pairQA.find('DeskPage'))"):
                        touch.tap("Next",scope="DeskPage")
                    previous = page.evaluate("()=>pairQA.visit().detailPage||0")
                    touch.tap("BonusSettings",scope="DeskPage")
                    touch.wait("()=>!!pairQA.find('BonusDialog')")
                    check_dialog(page,sample,selected,True)
                    # Hold just the first switch response to distinguish immediate client feedback
                    # from a view that changes only after the server replies.
                    delayed=[]
                    page.route("**/api/action",lambda route:delayed.append(route),times=1)
                    for i,enabled in enumerate([False,True,False]):
                        touch.tap("BonusOn" if enabled else "BonusOff",scope="BonusDialog")
                        if i==0:
                            try:
                                check_dialog(page,sample,selected,enabled)
                                assert room_state(species)["mutationEnabled"] is True
                                assert delayed and delayed[0].request.post_data_json["type"]=="care.toggle"
                            finally:
                                if delayed:
                                    delayed[0].continue_()
                        touch.wait("on=>pairQA.ready() && pairQA.visit().data.presentation?.mutationPreview?.enabled===on",enabled)
                        check_dialog(page,sample,selected,enabled)
                        room=room_state(species)
                        assert room["mutationEnabled"]==enabled and room["items"]["guide"]==initial
                        if width==320 and enabled and output:
                            touch.wait("()=>!pairQA.find('Feedback')")
                            page.screenshot(path=str(output/"六维加成实时概率-320.png"))
                    touch.tap("Back",scope="BonusDialog")
                    touch.wait("()=>!pairQA.find('BonusDialog')")
                    assert page.evaluate("()=>pairQA.visit().detailPage||0")==previous
                    assert page.evaluate("()=>pairQA.visit().data.presentation.parents.map(p=>p.name)")==sample["names"]
                    touch.tap("BonusSettings",scope="DeskPage")
                    touch.wait("()=>!!pairQA.find('BonusDialog')")
                    check_dialog(page,sample,selected,False)
                    touch.tap("Back",scope="BonusDialog")
                    touch.wait("()=>!pairQA.find('BonusDialog')")
                touch.tap(text="开始繁育",scope="DeskPage")
                touch.wait("()=>!!pairQA.find('Confirm')")
                question=page.evaluate("()=>pairQA.texts(pairQA.find('Confirm')).join(' ')")
                assert ("使用一张选育指导单" in question)==(selected>=0),question
                touch.tap("Cancel",scope="Confirm")
                touch.wait("()=>!pairQA.find('Confirm')")
                room=room_state(species)
                assert room["job"] is None and room["items"]["guide"]==initial
                touch.tap(text="开始繁育",scope="DeskPage")
                touch.tap("Accept",scope="Confirm")
                touch.kind("breeding")
                room=room_state(species)
                assert room["items"]["guide"]==initial-int(selected>=0)
                assert room["job"]["options"]["guide"]==selected
                assert room["job"]["options"]["positive"]==(LEVEL if enabled else 0)
            process.stdin.write("finish-litters\n")
            process.stdin.flush()
            assert process.stdout.readline().strip()=="advanced"
            touch.tap("Tab0",scope="DeskPage")
            touch.kind("pair")
            touch.tap(text="查看最近一窝",scope="DeskPage")
            touch.kind("litter")
            litter=room_state("rabbit")["lastLitter"]
            assert len(litter["ids"])==5,litter
            for from_room in [False,True]:
                if from_room:
                    touch.tap(text="查看最近一窝",scope="DeskPage")
                    touch.kind("litter")
                    touch.tap(text="前往动物房间",scope="DeskPage")
                    touch.kind("rooms")
                    touch.tap(text="最近出生的一窝",scope="DeskPage")
                    touch.kind("litter")
                count=page.evaluate("""()=>{const q=pairQA,desk=q.find('DeskPage'),art=q.find('Artwork',desk);
                    return [art.children.filter(n=>/^Resident[0-9]+$/.test(n.name)&&n.activeInHierarchy).length,
                        q.visit().data.rows.filter(row=>row.animal).map((_r,i)=>!!q.find('Animal'+i,desk)).filter(Boolean).length];}""")
                assert count==[5,5],("Scene figures and list rows of maximum rabbit litter",count)
                if width==390 and not from_room and output:
                    touch.wait("()=>!pairQA.find('Feedback')")
                    touch.wait("""()=>pairQA.find('Artwork',pairQA.find('DeskPage')).children
                        .filter(n=>/^Resident[0-9]+$/.test(n.name)).every(n=>n.getComponentsInChildren(cc.Sprite)
                            .some(s=>s.node.activeInHierarchy&&s.spriteFrame))""")
                    page.screenshot(path=str(output/"最近一窝五只幼兔-390.png"))
                for index in range(5):
                    node=("Animal" if from_room else "Resident")+str(index)
                    if not from_room:
                        touch.wait("""name=>{const n=pairQA.find(name,pairQA.find('Artwork',pairQA.find('DeskPage')));
                            return n?.getComponentsInChildren(cc.Sprite).some(s=>s.node.activeInHierarchy&&s.spriteFrame);}""",node)
                    offset=touch.tap(node,scope="DeskPage")
                    touch.kind("pet")
                    assert page.evaluate("pairQA.visit().data.presentation.animal.id")==litter["ids"][index]
                    if index%2==0:
                        touch.tap("Back",scope="DeskPage")
                    else:
                        page.go_back(wait_until="commit")
                    touch.kind("litter")
                    assert abs(page.evaluate("pairQA.offset()")-offset)<2,(offset,page.evaluate("pairQA.offset()"))
                    assert page.evaluate("pairQA.visit().data.presentation.bornAt")==litter["bornAt"]
                    assert page.evaluate("pairQA.visit().data.rows.filter(r=>r.animal).map(r=>r.animal.id)")==litter["ids"]
                touch.tap("Back",scope="DeskPage")
                touch.kind("rooms" if from_room else "pair")
                assert page.evaluate("(pairQA.visit().args.species||'rabbit')")=="rabbit"
            # Create a genuine departure in this disposable shop, leaving the fifth kit in residence.
            sold=litter["ids"][2]
            response=page.request.post(url+"/api/page",data={"page":"saleQuote",
                "args":{"channel":"market","species":"rabbit","ids":[sold]}})
            assert response.ok,response.text()
            quote=response.json()
            action=next(a for a in quote["page"]["actions"] if a.get("type")=="sale.commit")
            response=page.request.post(url+"/api/action",data={"type":action["type"],"args":action["args"],
                "profileId":quote["shop"]["profileId"],"version":quote["shop"]["version"],"requestId":"litter-qa-sell-middle"})
            assert response.ok,response.text()
            touch.tap(text="最近出生的一窝",scope="DeskPage")
            touch.kind("litter")
            members=page.evaluate("pairQA.visit().data.rows.filter(r=>r.litterMember||r.animal)")
            assert [r["animal"]["id"] for r in members]==litter["ids"]
            assert not members[2].get("link") and "已离店" in members[2]["text"],members[2]
            scene_count=page.evaluate("pairQA.find('Artwork',pairQA.find('DeskPage')).children.filter(n=>/^Resident[0-9]+$/.test(n.name)).length")
            assert scene_count==5,scene_count
            touch.tap("Animal2",scope="DeskPage")
            touch.kind("litter")
            offset=touch.tap("Animal4",scope="DeskPage")
            touch.kind("pet")
            assert page.evaluate("pairQA.visit().data.presentation.animal.id")==litter["ids"][-1]
            touch.tap("Back",scope="DeskPage")
            touch.kind("litter")
            assert abs(page.evaluate("pairQA.offset()")-offset)<2
            assert not errors,errors
            print(f"{width}px: three rooms, guide options, six live probabilities, settlement and both litter return routes passed.",flush=True)
        finally:
            page.close()
            process.terminate()
            process.wait(timeout=15)


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--web-root",type=Path,default=PROJECT/"build"/"web-mobile")
    parser.add_argument("--screenshots",type=Path,help="directory for two acceptance screenshots")
    args=parser.parse_args()
    if args.screenshots:
        args.screenshots.mkdir(parents=True,exist_ok=True)
    with sync_playwright() as pw:
        browser=pw.chromium.launch(channel="msedge",args=["--use-angle=swiftshader","--enable-unsafe-swiftshader"])
        try:
            for width in (320,390):
                verify(browser,args.web_root.resolve(),width,args.screenshots)
        finally:
            browser.close()


if __name__=="__main__":
    main()
