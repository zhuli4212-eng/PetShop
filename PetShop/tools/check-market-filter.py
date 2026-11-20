"""Touch both market sale lists in the built Cocos game, using a disposable shop."""
import argparse
import json
import subprocess
from pathlib import Path
from tempfile import TemporaryDirectory

from playwright.sync_api import sync_playwright


GAME = Path(__file__).resolve().parents[1]
FILTERS = ["全部", "兔", "猫", "狗"]
SPECIES = dict(zip(FILTERS, [None, "rabbit", "cat", "dog"]))
STAGES = ["全部", "幼年", "成长", "成年", "老年", "已故"]
PET_STAGES = ["成年","成长","已故","成年","幼年","成年","已故","老年"]
# name, species, unbred and idle, protected, deceased, busy
PETS = [
    ("胡桃","rabbit",False,False,False,False), ("小麦","rabbit",True,True,False,False),
    ("奶酥","rabbit",False,True,True,False), ("青禾","rabbit",False,False,False,True),
    ("栗子","rabbit",True,False,False,False), ("枫糖","rabbit",False,False,False,True),
    ("银杏","rabbit",False,False,True,False), ("团团","cat",True,False,False,False),
]
IDS = [f"{0xac001+i:05x}-market" for i in range(len(PETS))]
SERVER = """
import { GameStore } from './server/game-store.mjs';
import { createPetShopServer } from './server/main.mjs';
import { createInterface } from 'node:readline';
let now=Date.now();
const store=new GameStore(process.argv[1],{wall:()=>now,monotonic:()=>0});store.ensure();
const s=store.state,base=s.pets[0],samples=JSON.parse(process.argv[2]);
s.visitBook.opening=false;s.shopXp=18000;
s.rooms.cat=structuredClone(s.rooms.rabbit);
s.pets=samples.map(([id,name,species,retained,dead],i)=>({...structuredClone(base),id,name,species,retained,
  bred:i===0,breedGrowth:false,sex:[0,2,3,7].includes(i)?'公':'母',
  breedKey:species==='cat'?'british':['angora','lop','domestic','lionhead'][i%4],
  coatIndex:1+i%6,bornAt:now-(dead?15*86400000:i===4?12*60000-20000:i===1?20*60000:
    species==='cat'?6*86400000+90*60000-100000:86400000)}));
const mother=s.pets[5],father=s.pets[3];
s.rooms.rabbit.job={motherId:mother.id,fatherId:father.id,mother,father,endsAt:now+86400000,offspring:[]};
store.save(s);
const server=createPetShopServer(process.argv[3],{store});
server.listen(0,'127.0.0.1',()=>console.log(server.address().port));
createInterface({input:process.stdin}).on('line',line=>{
  if(line==='next-minute'){now+=60000;console.log('advanced');}
});
"""

BROWSER = r"""()=>{
  const m=cc.director.getScene().getChildByName('Canvas').getComponent('ShopMain');
  const ui=n=>n.getComponent('cc.UITransform'), nodes=n=>[n,...n.children.flatMap(nodes)];
  const find=(key,root=m.node)=>nodes(root).find(n=>n.activeInHierarchy&&n.name===key);
  const desk=()=>find('DeskPage'), visit=()=>m.session.current;
  const labels=n=>n.getComponentsInChildren(cc.Label).filter(l=>l.node.activeInHierarchy);
  const target=({name,copy,row})=>{
    const node=row===undefined ? (find('FilterMenu')||desk()||m.node) : find('Row'+row,desk());
    if(!node)return null;
    if(copy)return labels(node).find(l=>l.string===copy)?.node;
    return name?find(name,node):node;
  };
  const point=world=>{
    const s=m.node.getComponent(cc.Canvas).cameraComponent.worldToScreen(world);
    const c=document.querySelector('canvas'),r=c.getBoundingClientRect();
    return [r.x+s.x*r.width/c.width,r.bottom-s.y*r.height/c.height];
  };
  const measure=spec=>{
    const n=target(spec);
    if(!n)return null;
    const [x,y]=point(n.worldPosition);
    for(let p=n;p;p=p.parent){
      if(p.name!=='Viewport')continue;
      const t=ui(p),top=point(t.convertToWorldSpaceAR(new cc.Vec3(0,t.height/2,0)))[1];
      const bottom=point(t.convertToWorldSpaceAR(new cc.Vec3(0,-t.height/2,0)))[1];
      return {x,y,top,bottom};
    }
    return {x,y,top:0,bottom:innerHeight};
  };
  const revealRow=(i)=>{
    const row=find('Row'+i,desk()),s=m.session.scroll;
    if(!row||row.getChildByName('Name'))return;
    s.stopAutoScroll();
    s.scrollToOffset(new cc.Vec2(0,Math.max(0,Math.min(s.getMaxScrollOffset().y,-row.position.y-ui(s.node).height/2))),0);
  };
  window.marketQA={find,desk,visit,labels,measure,revealRow,app:m};
}"""


def verify(browser, process, width):
    url = f"http://127.0.0.1:{int(process.stdout.readline())}"
    page = browser.new_page(viewport={"width":width,"height":568 if width==320 else 844},
                            is_mobile=True,has_touch=True,reduced_motion="reduce",device_scale_factor=1)
    errors = []
    page.on("pageerror",lambda error:errors.append(str(error)))
    page.goto(url)
    page.wait_for_function("""()=>window.cc?.director?.getScene()?.getChildByName('Canvas')
        ?.getComponent('ShopMain')?.home?.active""",timeout=90000)
    page.evaluate(BROWSER)
    cdp = page.context.new_cdp_session(page)

    def tap(**spec):
        if "row" in spec:
            page.evaluate("i=>marketQA.revealRow(i)",spec["row"])
        page.wait_for_function("spec=>!!marketQA.measure(spec)",arg=spec)
        for _ in range(12):
            # Re-measure only after inertia stops; otherwise a delayed touch can
            # hit the neighbouring row while the canvas list is still moving.
            page.wait_for_function("""()=> (marketQA.desk()?.getComponentsInChildren('cc.ScrollView')||[])
                .every(s=>!s.isScrolling()&&!s.isAutoScrolling())""")
            box = page.evaluate("spec=>marketQA.measure(spec)",spec)
            x,y,top,bottom=(box[k] for k in ("x","y","top","bottom"))
            if top+2 <= y <= bottom-2:
                assert 0 <= x < width and 0 <= y < page.viewport_size["height"], (spec,box)
                page.touchscreen.tap(x,y)
                return
            # Bring the real scroll mask to the row, without calling ScrollView methods.
            upper,lower=top+10,bottom-10
            start,end=(lower,upper) if y>bottom else (upper,lower)
            cdp.send("Input.dispatchTouchEvent",{"type":"touchStart","touchPoints":[{"x":width*.5,"y":start}]})
            for step in range(1,7):
                cdp.send("Input.dispatchTouchEvent",{"type":"touchMove",
                         "touchPoints":[{"x":width*.5,"y":start+(end-start)*step/6}]})
                page.wait_for_timeout(30)
            page.wait_for_timeout(100)
            cdp.send("Input.dispatchTouchEvent",{"type":"touchEnd","touchPoints":[]})
            page.wait_for_timeout(150)
        raise AssertionError((spec,box))

    def at(key):
        page.wait_for_function("key=>marketQA.visit()?.key===key && marketQA.visit().version!==undefined",arg=key)

    def choose_filter(index,value):
        tap(name=("SpeciesFilter","GrowthStageFilter")[index])
        page.wait_for_function("()=>!!marketQA.find('FilterMenu')")
        options = page.evaluate("""()=>marketQA.find('Options',marketQA.find('FilterMenu')).children
            .filter(n=>/^Option\\d+$/.test(n.name))
            .map(n=>n.getChildByName('Caption').getComponent(cc.Label).string)""")
        assert options==(FILTERS,STAGES)[index],options
        tap(name="Option"+str(options.index(value)))
        page.wait_for_function("""([index,value])=>!marketQA.find('FilterMenu') && (marketQA.find('SpeciesFilter')||marketQA.find('BreedFilter')) &&
            marketQA.visit()?.data?.filters?.[index].find(o=>o.active)?.label===value""",arg=[index,value])

    def species_filter(value):
        choose_filter(0,value)

    def growth(value):
        choose_filter(1,value)

    def selected(expected):
        try:
            page.wait_for_function("""ids=>{const v=marketQA.visit();return Array.from(v.selected).sort().join('|')
                ===ids.slice().sort().join('|') && marketQA.find('SelectionCount',marketQA.desk())?.getComponent(cc.Label)
                .string.includes('已选 '+ids.length+' 只')}""",arg=expected)
        except Exception:
            print('Selection state:',page.evaluate("""()=>({selected:Array.from(marketQA.visit().selected),
                label:marketQA.find('SelectionCount',marketQA.desk())?.getComponent(cc.Label).string,
                rows:marketQA.visit().data.rows.map(r=>({id:r.animal?.id,select:r.select,reason:r.visual?.blockedReason}))})"""),flush=True)
            raise

    def check(key, value, stage="全部"):
        at(key)
        state=page.evaluate("""()=>{const q=marketQA,v=q.visit(),p=v.data,d=q.desk();
          const scroll=q.app.session.scroll,offset=scroll.getScrollOffset().y;
          const snapshot={filters:p.filters.map(g=>g.find(o=>o.active).label),count:p.visual.eligibleCount,protected:p.visual.protectedCount,
            empty:p.empty,labels:q.labels(d).map(l=>l.string),rows:p.rows.map((r,i)=>{
              q.revealRow(i);
              const row=q.find('Row'+i,d);
              return {id:r.link.args.id,select:r.select,price:r.visual.price,reason:r.visual.blockedReason,
                rendered:q.labels(row).map(l=>l.string),mark:q.find('Mark',row)?.getComponent(cc.Label).string,
                hasClock:!!q.find('StageCountdown',row),number:!!q.find('Number',row),
                gray:q.find('Portrait',row)?.getComponent(cc.Sprite).grayscale};
            })};
          scroll.scrollToOffset(new cc.Vec2(0,offset),0);
          return snapshot;
        }""")
        assert state["filters"]==[value,stage],state
        species=SPECIES[value]
        indices=[i for i,(_,kind,*_) in enumerate(PETS)
                 if (species is None or kind==species) and (stage=="全部" or PET_STAGES[i]==stage)]
        assert [r["id"] for r in state["rows"]]==[IDS[i] for i in indices],state
        eligible=[]
        for i,r in zip(indices,state["rows"]):
            name,_,_,protected,dead,busy=PETS[i]
            copy=" ".join(r["rendered"])
            assert name in copy,(name,copy)
            assert "评分" in r["rendered"] and "详情" in r["rendered"] and not r["number"],r
            assert r["hasClock"] is (not dead),r
            reasons=[reason for reason,on in [("种源",protected),("已故",dead),("繁育中",busy)] if on]
            if reasons:
                assert r.get("select") is None and r.get("price") is None and r.get("mark")=="–" and r["gray"],r
                assert all(t in (r.get("reason") or "") and t in copy for t in reasons),(reasons,r)
            else:
                assert r["select"]==r["id"] and r["price"]>0 and str(r["price"]) in copy and not r["gray"],r
                eligible.append(r["id"])
        assert (state["count"],state["protected"])==(len(eligible),sum(PETS[i][3] for i in indices)),state
        if not indices:
            assert state["empty"] and state["empty"] in state["labels"],state
        return eligible

    def quote(expected):
        filters=page.evaluate("()=>marketQA.visit().data.filters.map(g=>g.find(o=>o.active).label)")
        tap(copy="核对出售")
        at("saleQuote")
        action=page.evaluate("""()=>marketQA.visit().data.actions.find(a=>a.type==='sale.commit')""")
        assert action and sorted(action["args"]["ids"])==sorted(expected),action
        assert action["args"].get("species")==SPECIES[filters[0]],action
        assert action["args"].get("stage","全部")==filters[1],action
        total=sum(action["args"]["amounts"])
        assert page.evaluate("t=>marketQA.labels(marketQA.desk()).some(l=>l.string==='合计 '+t+' 金币')",total)
        return action

    def home():
        for _ in range(5):
            current=page.evaluate("()=>marketQA.visit()?.key")
            if current=="visitBook":
                tap(copy="合上账簿")
            elif current:
                tap(name="Back")
            else:
                page.wait_for_function("()=>!marketQA.app.pulseBusy")
                page.evaluate("()=>marketQA.app.pulse()")
                if page.evaluate("()=>!!marketQA.visit()"):
                    continue
                if page.evaluate("()=>!!marketQA.find('GuestArrival')"):
                    tap(copy="稍后")
                return
            page.wait_for_function("key=>marketQA.visit()?.key!==key",arg=current)
        raise AssertionError("Home did not reopen")

    def ledger():
        result=page.request.post(url+"/api/page",data={"page":"market","args":{}},max_retries=1)
        assert result.ok,result.text()
        body=result.json()
        return body["shop"],[r["link"]["args"]["id"] for r in body["page"]["rows"]]

    tap(name="Hotspot_market")
    market_ids=check("market","全部")
    # Reopening the same animal's dossier explicitly creates a one-animal selection.
    tap(row=0,name="Details")
    at("pet")
    tap(copy="前往自由市场")
    at("market")
    selected([IDS[0]])
    tap(copy="全选本页")
    selected(market_ids)
    tap(row=0,name="Check")
    selected([i for i in market_ids if i!=IDS[0]])
    tap(row=0,name="Details")
    at("pet")
    tap(copy="前往自由市场")
    at("market")
    selected([IDS[0]])
    species_filter("兔")
    ok=check("market","兔")
    selected([])
    tap(copy="全选本页")
    selected(ok)
    quote(ok)
    tap(copy="修改选择")
    check("market","兔")
    selected(ok)
    image = page.screenshot() if width==390 else None
    for value in ("兔","猫","狗","全部"):
        species_filter(value)
        for stage in (*STAGES[1:],"全部"):
            growth(stage)
            eligible=check("market",value,stage=stage)
            if not eligible and (value,stage) in (("兔","成长"),("全部","已故")):
                tap(row=0,name="Check")
                tap(copy="全选本页")
                tap(copy="核对出售")
                at("market")
                selected([])
    tap(row=3,name="Check")  # A busy rabbit in the unfiltered list.
    selected([])

    home()
    tap(name="Hotspot_rooms")
    at("rooms")
    growth("幼年")
    tap(copy="挑选出售")
    room_ok=check("sale","兔","幼年")
    tap(copy="全选本页")
    selected(room_ok)
    tap(row=0,name="Details")
    at("pet")
    tap(name="Back")
    check("sale","兔","幼年")
    selected(room_ok)
    quote(room_ok)
    tap(copy="修改选择")
    check("sale","兔","幼年")
    selected(room_ok)
    for value in ("猫","狗","全部","兔"):
        species_filter(value)
        for stage in (*STAGES[1:],"全部"):
            growth(stage)
            check("sale",value,stage)
    home()
    tap(name="Hotspot_rooms")
    at("rooms")
    tap(name="Tab1")
    page.wait_for_function("()=>marketQA.visit().args.species==='cat' && marketQA.find('BreedFilter')")
    growth("已故")
    tap(copy="挑选出售")
    assert not check("sale","猫","已故")
    tap(copy="全选本页")
    tap(copy="核对出售")
    at("sale")
    selected([])

    home()
    tap(name="Hotspot_market")
    check("market","全部")
    before,old_ids=ledger()
    tap(row=0,name="Check")
    action=quote([IDS[0]])
    with page.expect_response(lambda r:r.url.endswith("/api/action") and r.request.post_data_json["type"]=="sale.commit") as sold:
        tap(copy=action["label"])
    assert sold.value.ok,sold.value.text()
    at("market")
    after,new_ids=ledger()
    assert new_ids==[i for i in old_ids if i!=IDS[0]] and after["coins"]-before["coins"]==sum(action["args"]["amounts"])
    def next_minute():
        process.stdin.write("next-minute\n")
        process.stdin.flush()
        assert process.stdout.readline().strip()=="advanced"

    # When the only selected juvenile grows up, the old stage-bound quote is refused.
    species_filter("兔")
    growth("幼年")
    tap(copy="全选本页")
    selected([IDS[4]])
    young=quote([IDS[4]])
    def birthday(route):
        next_minute()
        route.continue_()
    page.route("**/api/action",birthday,times=1)
    with page.expect_response(lambda r:r.url.endswith("/api/action") and r.request.post_data_json["type"]=="sale.commit") as aged:
        tap(copy=young["label"])
    assert aged.value.status==409 and all(t in aged.value.json()["error"] for t in ("栗子","幼年","成长"))
    stable,unsold=ledger()
    assert stable["coins"]==after["coins"] and unsold==new_ids
    home()
    tap(name="Hotspot_market")
    at("market")
    # Between quote and settlement another client protects one animal and the other reaches natural death.
    remaining=[IDS[4],IDS[7]]
    tap(copy="全选本页")
    selected(remaining)
    pending=quote(remaining)
    def other_client(route):
        shop,_=ledger()
        res=page.request.post(url+"/api/action",data={"type":"care.retain","args":{"id":IDS[4],"retained":True},
            "requestId":"market-second-client-"+str(width),"profileId":shop["profileId"],"version":shop["version"]})
        assert res.ok,res.text()
        next_minute()
        route.continue_()
    page.route("**/api/action",other_client,times=1)
    with page.expect_response(lambda r:r.url.endswith("/api/action") and r.request.post_data_json["type"]=="sale.commit") as blocked:
        tap(copy=pending["label"])
    failure=blocked.value.json().get("error","")
    assert blocked.value.status==409 and all(t in failure for t in ("栗子","种源","团团","已故")),failure
    unchanged,still_there=ledger()
    assert unchanged["coins"]==after["coins"] and still_there==new_ids
    assert not errors,errors
    page.close()
    print(width,"market & room filters, selection, true sale and atomic rejection passed",flush=True)
    return image


def main():
    args=argparse.ArgumentParser(description=__doc__)
    args.add_argument("--screenshot",type=Path)
    args.add_argument("--web-root",type=Path,default=GAME/"build/web-mobile",help="optional snapshot of the Web Mobile build")
    options=args.parse_args()
    records=[[IDS[i],pet[0],pet[1],pet[3],pet[4]] for i,pet in enumerate(PETS)]
    with sync_playwright() as pw:
        browser=pw.chromium.launch(channel="msedge",args=["--use-angle=swiftshader"])
        for width in (320,390):
            with TemporaryDirectory(prefix="petshop-market-filter-") as save:
                process=subprocess.Popen(["node","--input-type=module","-e",SERVER,save,json.dumps(records,ensure_ascii=False),str(options.web_root.resolve())],
                    cwd=GAME,stdin=subprocess.PIPE,stdout=subprocess.PIPE,text=True,encoding="utf-8",
                    creationflags=getattr(subprocess,"CREATE_NO_WINDOW",0))
                try:
                    image=verify(browser,process,width)
                finally:
                    process.terminate()
                    process.wait(timeout=10)
        browser.close()
    if options.screenshot:
        options.screenshot.write_bytes(image)


if __name__=="__main__":
    main()
