"""Touch the breeding settings in a Web Mobile build against disposable shops."""
import argparse
import base64
import json
from io import BytesIO
import math
import subprocess
from pathlib import Path
from tempfile import TemporaryDirectory

from PIL import Image
from playwright.sync_api import sync_playwright


PROJECT = Path(__file__).resolve().parents[1]
FIELDS = ["性格", "品相", "毛发", "体态", "体型"]
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
const now = Date.now();
let offset=0;
const store = new GameStore(directory,{wall:()=>Date.now()+offset});
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
  if(command==='finish-litters'){offset+=11*60000;console.log('advanced');}
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
        mother, father = MOTHER, FATHER
        expected = [11.425,4.615]
        if species=="rabbit":
            mother = father = ["B"]*6
            expected = [2,5]
        if species=="cat":
            mother = ["A"]*6
            father = ["A","A","A","A" if width==390 else "C","A","D"]
            expected = [2,10] if width==390 else [5.25,7.425]
        pairs.append(dict(species=species,breed=breed,cards=cards,names=names,grades=[mother,father],level=LEVEL,
                          expected=expected))
    return pairs


def rise(mother, father, guided, level):
    m, f = GRADES.index(mother), GRADES.index(father)
    weight = (0.8 if m>f else 0.2) if guided else 0.5

    def chance(base, reference):
        result = [18,18,18,18,7,3,0][base]
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
            # Record the position at a settled tap, after any drag inertia.
            self.wait("""()=> (pairQA.find('DeskPage')?.getComponentsInChildren('cc.ScrollView')||[])
                .every(s=>!s.isScrolling()&&!s.isAutoScrolling())""")
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

    def choose_guide(self, enabled, available):
        self.tap("AddItems",scope="DeskPage")
        self.wait("()=>pairQA.ready()&&pairQA.visit().key==='breedItems'")
        row=self.page.evaluate("pairQA.visit().data.rows[0]")
        assert "选育指导单" in row["title"] and bool(row.get("link")) == available,row
        assert len(self.page.evaluate("pairQA.visit().data.rows"))==3
        if row["title"].startswith("✓ ") != enabled:
            self.tap(text=row["title"],scope="DeskPage")
            self.wait("on=>pairQA.ready()&&pairQA.visit().data.rows[0].title.startsWith('✓ ')===on",enabled)
        self.tap(text="完成",scope="DeskPage")
        self.kind("pairConfirm")
        index=self.page.evaluate("pairQA.visit().data.presentation.guide.index")
        assert (0<=index<5) if enabled else index==-1,index
        return index


def check_dialog(page, settings, selected, enabled):
    names = page.evaluate("""()=>{const q=pairQA,d=q.find('BonusDialog');return d ? Array.from({length:5},(_,i)=>{
        const row=q.find('Trait'+i,d);return {copy:q.texts(row),chance:q.find('Chance',row)?.getComponent(cc.Label).string};
    }):null;}""")
    assert names and not page.evaluate("()=>!!pairQA.find('Trait5',pairQA.find('BonusDialog'))"),names
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


def check_parent_comparison(page, grades):
    assert not page.evaluate("!!pairQA.title('每只幼体的出生概率')")
    columns = page.evaluate("""() => ['MotherTraits','FatherTraits'].map(name=>{
        const q=pairQA,col=q.find(name);
        return {title:q.find('ColumnTitle',col).getComponent(cc.Label).string, bounds:q.box(col),
            rows:Array.from({length:6},(_,i)=>{
                const label=q.find('Grade',q.find('Trait'+i,col)).getComponent(cc.Label);
                return [label.string,label.color.r,label.color.g,label.color.b];
            })};
    })""")
    assert [c["title"] for c in columns] == ["母本", "父本"]
    assert columns[0]["bounds"]["right"] < columns[1]["bounds"]["left"]
    for side, column in enumerate(columns):
        assert [row[0] for row in column["rows"]] == grades[side]
        for i, row in enumerate(column["rows"]):
            expected = [165, 57, 40] if grades[0][i] != grades[1][i] else [41, 72, 62]
            assert row[1:] == expected, (side, i, row, expected)


def check_birth_rates(page, expected):
    """The calculation remains in the engine, while the pairing screens show no probability card."""
    assert not page.evaluate("!!pairQA.title('每只幼体的出生概率')")
    rates = page.evaluate("pairQA.visit().data.presentation.mutationPreview.defect")
    assert abs(rates["defectPercent"] - expected[0]) < 1e-9, rates
    assert abs(rates["perfectPercent"] - expected[1]) < 1e-9, rates


def observe_parent_motion(page, species):
    return page.evaluate(r"""async species=>{
        const q=pairQA, view=q.visit().data.presentation;
        const parents=view.parents, indexes=[0,1];
        if(parents.length!==2)throw Error('Missing parents');
        const cycles=[[],[]],positions=[new Set(),new Set()],start=performance.now();
        let firstTime=null, lastTime=null;
        while(performance.now()-start<18000){
            const desk=q.find('DeskPage'), art=q.find('Artwork',desk), clock=q.find('Remaining',desk);
            if(!art||!clock)throw Error('Stage or countdown disappeared');
            const bounds=q.box(art), t=clock.getComponent(cc.Label).string.match(/(\d+) 分 (\d+) 秒/);
            if(t){lastTime=60*Number(t[1])+Number(t[2]);firstTime??=lastTime;}
            for(const i of indexes){
                const n=q.find('Resident'+i,art), w=n?.getComponent('RoomAnimalWalk');
                if(!w||w.hopping!==(species==='rabbit'))throw Error('Missing species motion for parent '+i);
                const expected='pet-walk/'+parents[i].art.split('/').pop()+'/texture';
                if(w.path!==expected)throw Error('Wrong parent strip '+w.path+' expected '+expected);
                const box=q.box(n), x=(box.left+box.right)/2, y=(box.top+box.bottom)/2;
                if(x<0||y<0||x>innerWidth||y>innerHeight||x<bounds.left||x>bounds.right||y<bounds.top||y>bounds.bottom)
                    throw Error('Parent outside the visible stage: '+JSON.stringify({i,box,bounds}));
                const f=w.frames.indexOf(w.sprite.spriteFrame);
                if(f>=0){
                    const sequence=cycles[i];
                    if(sequence.at(-1)!==f)sequence.push(f);
                    positions[i].add(Math.round(n.position.x));
                }
            }
            if(lastTime<firstTime&&indexes.every(i=>new Set(cycles[i]).size===4&&cycles[i].length>=8&&positions[i].size>=3)){
                return {firstTime,lastTime,endsAt:view.endsAt,parentIds:parents.map(p=>p.id)};
            }
            await new Promise(requestAnimationFrame);
        }
        throw Error(JSON.stringify({species,cycles,positions:positions.map(s=>s.size),firstTime,lastTime}));
    }""",species)


def capture_motion(page,path):
    captures=page.evaluate("""()=>new Promise(resolve=>{
        const surface=document.createElement('canvas');
        surface.width=innerWidth;surface.height=innerHeight;
        const ctx=surface.getContext('2d'),gameCanvas=document.querySelector('canvas');
        const result=[];
        // Read completed Cocos frames before the browser releases its WebGL drawing buffer.
        const capture=()=>{
            const at=performance.now();
            if(result.length&&at-result.at(-1)[0]<100)return;
            ctx.drawImage(gameCanvas,0,0,surface.width,surface.height);
            result.push([at,surface.toDataURL('image/png').split(',')[1]]);
            if(result.length===32){
                cc.director.off(cc.Director.EVENT_AFTER_DRAW,capture);
                resolve(result);
            }
        };
        cc.director.on(cc.Director.EVENT_AFTER_DRAW,capture);
    })""")
    times=[at for at,_ in captures]
    frames=[Image.open(BytesIO(base64.b64decode(data))).convert("RGB") for _,data in captures]
    assert frames[0].size==(390,844)
    assert all(len(frame.getcolors(100000))>32 for frame in frames)
    durations=[max(20,round((b-a)/10)*10) for a,b in zip(times,times[1:])]
    frames[0].save(path,save_all=True,append_images=frames[1:],duration=durations+[durations[-1]],loop=0)


def verify(browser, web, width, output, motion=False):
    samples = fixtures(width)
    with TemporaryDirectory(prefix="petshop-breeding-controls-") as directory:
        process = subprocess.Popen(["node","--input-type=module","-e",SEED,directory,str(web),json.dumps(samples)],
            cwd=PROJECT,stdin=subprocess.PIPE,stdout=subprocess.PIPE,text=True,encoding="utf-8",
            creationflags=getattr(subprocess,"CREATE_NO_WINDOW",0))
        page = browser.new_page(viewport={"width":width,"height":568 if width==320 else 844},
                                is_mobile=True,has_touch=True,device_scale_factor=1,
                                reduced_motion="no-preference" if motion else "reduce")
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
                check_birth_rates(page,sample["expected"])
                touch.tap("Review",scope="DeskPage")
                touch.kind("pairConfirm")
                check_parent_comparison(page,sample["grades"])
                check_birth_rates(page,sample["expected"])
                if motion:
                    touch.tap(text="开始繁育",scope="DeskPage")
                    touch.tap("Accept",scope="Confirm")
                    touch.kind("breeding")
                    first=observe_parent_motion(page,species)
                    if output and species=="rabbit":
                        capture_motion(page,output/"繁育中双亲动作-390.gif")
                    touch.tap(text="前往动物房间",scope="DeskPage")
                    touch.kind("rooms")
                    touch.tap(text="进繁育台",scope="DeskPage")
                    touch.kind("breeding")
                    second=observe_parent_motion(page,species)
                    assert first["parentIds"]==second["parentIds"] and first["endsAt"]==second["endsAt"]
                    assert second["lastTime"]<first["lastTime"],(first,second)
                    print(f"{width}px {species}: both parents cycled through 4 frames and patrolled, countdown {first['firstTime']} -> {second['lastTime']}s including leaving and returning.",flush=True)
                    continue
                if width==390 and species=="rabbit" and output:
                    touch.wait("()=>!pairQA.find('Feedback')")
                    page.screenshot(path=str(output/"核对亲本双栏-390.png"))
                selected = touch.choose_guide(False, bool(initial))
                if initial:
                    first_draw=touch.choose_guide(True,True)
                    check_birth_rates(page,sample["expected"])
                    assert room_state(species)["items"]["guide"]==initial
                    assert touch.choose_guide(False,True)==-1
                    selected=touch.choose_guide(True,True)
                    assert selected==first_draw
                assert room_state(species)["items"]["guide"]==initial
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
                            page.screenshot(path=str(output/"五维加成实时概率-320.png"))
                    touch.tap("Back",scope="BonusDialog")
                    touch.wait("()=>!pairQA.find('BonusDialog')")
                    check_birth_rates(page,sample["expected"])
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
                assert ("选育指导单抽中" in question)==(selected>=0),question
                assert "后代品种" in question,question
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
            if motion:
                assert not errors,errors
                return
            process.stdin.write("finish-litters\n")
            process.stdin.flush()
            assert process.stdout.readline().strip()=="advanced"
            touch.tap("Tab0",scope="DeskPage")
            touch.kind("pair")
            touch.tap(text="查看最近一窝",scope="DeskPage")
            touch.kind("litter")
            litter=room_state("rabbit")["lastLitter"]
            assert len(litter["ids"])==5,litter
            subtitle=page.evaluate("pairQA.visit().data.subtitle")
            assert subtitle==f"父本·{litter['father']}  母本·{litter['mother']} | 共5只宝宝",subtitle
            assert page.evaluate("pairQA.visit().data.rows.filter(r=>!r.litterMember&&!r.animal).length")==1
            for from_room in [False,True]:
                if from_room:
                    assert not page.evaluate("pairQA.visit().data.actions.some(a=>a.page==='litter')")
                    page.evaluate("""()=>cc.director.getScene().getChildByName('Canvas')
                        .getComponent('ShopMain').session.open('rooms',{species:'rabbit'})""")
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
                    actual=page.evaluate("pairQA.visit().data.presentation.animal.id")
                    assert actual==litter["ids"][index],(width,node,litter["ids"].index(actual),offset)
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
            touch.tap(text="最近出生的一窝",scope="DeskPage")
            touch.kind("litter")
            touch.tap(text="挑选留种",scope="DeskPage")
            touch.wait("()=>pairQA.ready()&&pairQA.visit().key==='litterKeep'")
            before=json.loads((Path(directory)/"shop.json").read_text(encoding="utf-8"))
            touch.tap("Animal4",scope="DeskPage")
            touch.tap(text="留作种源",scope="DeskPage")
            touch.kind("litter")
            after=json.loads((Path(directory)/"shop.json").read_text(encoding="utf-8"))
            assert after["coins"]==before["coins"] and after["sales"]==before["sales"]
            assert [p["id"] for p in after["pets"]]==[p["id"] for p in before["pets"]]
            assert next(p for p in after["pets"] if p["id"]==litter["ids"][4])["retained"]
            touch.tap("Back",scope="DeskPage")
            touch.kind("rooms")
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
            print(f"{width}px: three rooms, add-items modal, fixed system draw, five mutation chances, defect and perfect rates, settlement and both litter return routes passed.",flush=True)
        finally:
            page.close()
            process.terminate()
            process.wait(timeout=15)


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--web-root",type=Path,default=PROJECT/"build"/"web-mobile")
    parser.add_argument("--screenshots",type=Path,help="directory for acceptance screenshots")
    parser.add_argument("--breeding-motion",action="store_true",help="check both parents' animated patrols, countdown, and re-entry")
    args=parser.parse_args()
    if args.screenshots:
        args.screenshots.mkdir(parents=True,exist_ok=True)
    with sync_playwright() as pw:
        browser=pw.chromium.launch(channel="msedge",args=["--use-angle=swiftshader","--enable-unsafe-swiftshader"])
        try:
            for width in ((390,) if args.breeding_motion else (320,390)):
                verify(browser,args.web_root.resolve(),width,args.screenshots,args.breeding_motion)
        finally:
            browser.close()


if __name__=="__main__":
    main()
