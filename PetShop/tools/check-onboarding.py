"""Verify the local task board, mixed catalog and parent comparison in Web Mobile."""
from importlib import import_module
from pathlib import Path
from tempfile import TemporaryDirectory
from urllib.parse import urlsplit
import argparse
import subprocess

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
QA = import_module("check-breeding-controls")
MAIN = "window.cc?.director?.getScene()?.getChildByName('Canvas')?.getComponent('ShopMain')"
SERVER = """
import {createInterface} from 'node:readline';
import {randomUUID} from 'node:crypto';
import {GameStore} from './server/game-store.mjs';
import {createPetShopServer} from './server/main.mjs';
import {purchasePrice,youngPurchaseBase} from './server/business.mjs';
let offset=0;
const store=new GameStore(process.argv[1],{wall:()=>Date.now()+offset});
store.ensure();
const s=store.state;
s.shopXp=36;
s.coins=12000;
s.visitBook.opening=false;
s.pets[1].traits[1].grade='A';
s.pets[0].retained=true;
s.research.rabbit=[2,4,0];
s.rooms.rabbit.items.guide=1;
s.rooms.cat={...structuredClone(s.rooms.rabbit),shelf:null};
s.pets.push({...structuredClone(s.pets[0]),id:'recycle-demo',name:'灰灰',retained:false,bornAt:Date.now()-6*86400000});
store.save(s);
const act=(type,args)=>{
  const {profileId,version}=store.shop();
  store.act({type,args,profileId,version,requestId:randomUUID()});
};
const server=createPetShopServer(process.argv[2],{store});
server.listen(0,'127.0.0.1',()=>console.log(server.address().port));
createInterface({input:process.stdin}).on('line',line=>{
  if(line!=='complete')return;
  offset+=121_000;
  const batch=store.state.rooms.rabbit.shelf;
  const offer=batch.offers.find(Boolean);
  act('care.buyPet',{id:offer.id,batch:batch.number,price:purchasePrice(store.state,youngPurchaseBase(offer))});
  offset+=30*60_000;
  const purchased=store.state.pets.filter(p=>p.source==='研究所采购'&&p.species==='rabbit');
  act('care.breed',{mother:purchased.find(p=>p.sex==='母').id,father:purchased.find(p=>p.sex==='公').id});
  console.log('complete');
});
"""


def verify(browser, url, proc, width, output):
    page = browser.new_page(viewport={"width": width, "height": 568 if width == 320 else 844},
                            is_mobile=True, has_touch=True, reduced_motion="reduce")
    errors = []
    page.on("pageerror", lambda error: errors.append(str(error)))
    page.goto(url)
    page.wait_for_function("()=>!!" + MAIN + "?.home?.active", timeout=90000)
    page.evaluate(QA.LOCATORS)
    touch = QA.Touch(page)

    def ready(key):
        touch.wait("key=>pairQA.ready()&&pairQA.visit()?.key===key", key)

    def tap(node):
        touch.tap(node, scope="DeskPage")

    def snap(name):
        if output and width == 390:
            touch.wait("()=>!pairQA.find('Feedback')")
            output.mkdir(parents=True, exist_ok=True)
            page.screenshot(path=output / (name + ".png"))

    def act(command, node, scope="DeskPage"):
        with page.expect_response(lambda r: urlsplit(r.url).path == "/api/action"
                and r.request.post_data_json.get("type") == command) as result:
            touch.tap(node, scope=scope)
        assert result.value.ok, result.value.text()

    def buy(node, command):
        tap(node)
        touch.wait("()=>!!pairQA.find('Confirm')")
        act(command, "Accept", "Confirm")

    def row_done(index):
        touch.wait("i=>pairQA.ready()&&pairQA.visit().data.rows[i].done", index)
        assert page.evaluate("i=>pairQA.texts(pairQA.find('TaskRow'+i)).includes('已完成')", index)

    def check_gift_receipt():
        ready("checkinReceipt")
        assert page.evaluate("!!pairQA.find('Shade')")
        assert page.evaluate("pairQA.visit().data.rows.map(r=>r.title)") == ["谷穗 · 母", "小麦 · 公"]
        assert all("栗野 · 幼年" in row for row in page.evaluate("pairQA.visit().data.rows.map(r=>r.text)"))

    assert page.evaluate("pairQA.texts(pairQA.find('TaskShortcut')).includes('任务完成 0/6')")
    assert page.evaluate("!pairQA.find('RoomLink')&&!pairQA.find('TrophyBook')")
    snap("首页任务与签到礼物")
    touch.tap("TaskShortcut")
    ready("breed")
    tap("Back")
    if width == 390:
        assert page.evaluate("pairQA.find('GiftArt').scale.x") == 1.5
        act("care.checkin", "GiftArt", "Hotspot_profile")
        check_gift_receipt()
        assert page.evaluate("!!pairQA.find('ShopHome')&&!pairQA.find('Hotspot_profile')")
        snap("签到奖励弹窗")
        tap("Back")
    touch.tap("Sign", scope="Hotspot_rooms")
    ready("rooms")
    assert page.evaluate("""()=>{
        const q=pairQA, desk=q.find('DeskPage'), button=q.find('Feed',desk);
        const frame=q.box(button), room=q.box(q.find('FeedingStation',desk).parent), width=room.right-room.left;
        const ink=button.getChildByName('Caption').getComponent(cc.Label).color;
        return Math.abs(frame.right-frame.left-width*114*.8/512)<.1
            &&Math.abs(frame.bottom-frame.top-width*50*.8/512)<.1
            &&ink.r===68&&ink.g===58&&ink.b===41;
    }""")
    snap("黄色投喂按钮")
    touch.tap("Feed", scope="FeedingStation")
    ready("roomNutrition")
    assert page.evaluate("!pairQA.find('Tier',pairQA.find('DeskPage'))")
    snap("营养餐选择")
    tap("NutritionDetail2")
    ready("nutritionDetail")
    assert page.evaluate("!pairQA.find('Tier',pairQA.find('DeskPage'))")
    assert page.evaluate("pairQA.find('Growth',pairQA.find('DeskPage')).getComponent(cc.Label).string") == "成长速度 2 倍"
    for target in ("roomNutrition", "rooms"):
        tap("Back")
        ready(target)
    tap("Back")
    touch.tap("Sign", scope="Hotspot_tasks")
    ready("tasks")
    assert page.evaluate("pairQA.visit().data.subtitle") == ("1 / 6 已完成" if width == 390 else "0 / 6 已完成")
    assert page.evaluate("!pairQA.find('TutorialLink')")
    assert page.evaluate("pairQA.visit().data.actions[0].disabled")
    tap("TaskRow1")
    ready("lab")
    touch.wait("()=>!!pairQA.find('Picture',pairQA.find('Artwork'))?.getComponent(cc.Sprite)?.spriteFrame")
    assert page.evaluate("pairQA.visit().data.rows.map(r=>r.link.args.species)") == ["rabbit", "cat", "rabbit", "cat"]
    assert page.evaluate("()=>['种源','营养餐','物品'].every(t=>pairQA.title(t,pairQA.find('DeskPage')))")
    assert page.evaluate("""()=>{
        const q=pairQA, a=q.visit().data.rows[0].animal, row=q.find('Row0',q.find('DeskPage'));
        const text=name=>q.find(name,row).getComponent(cc.Label).string;
        return text('Number')==='#'+a.number && text('Identity')===a.breed+' · '+a.coat
            && text('Stage')===a.sex+' · 幼年 · 未繁育';
    }""")
    snap("培育中心种源")
    tap("Row0")
    ready("offer")
    touch.tap(text="购买幼体", scope="DeskPage")
    touch.wait("()=>!!pairQA.find('Confirm')")
    act("care.buyPet", "Accept", "Confirm")
    ready("lab")
    assert page.evaluate("pairQA.visit().data.rows.length") == 3
    tap("LabTab1")
    touch.wait("()=>pairQA.ready()&&pairQA.visit().args.tab==='nutrition'")
    assert page.evaluate("pairQA.visit().data.rows.map(r=>r.action.args.species)") == ["rabbit", "cat"] * 3
    buy("NutritionPurchase1", "care.buyNutrition")
    touch.wait("()=>pairQA.ready()&&pairQA.visit().data.rows[1].visual.stock===1")
    snap("培育中心营养餐")
    tap("LabTab2")
    touch.wait("()=>pairQA.ready()&&pairQA.visit().args.tab==='services'")
    assert page.evaluate("pairQA.visit().data.rows.map(r=>r.action.args.species)") == ["rabbit", "cat"] * 2
    buy("ServicePurchase1", "care.buyItem")
    touch.wait("()=>pairQA.ready()&&pairQA.visit().data.rows[1].title.includes('持有 1 张')")
    assert page.evaluate("""()=>{
        const a=pairQA.box(pairQA.find('LabResearch')),b=pairQA.box(pairQA.find('LabRecycle'));
        return Math.abs(a.top-b.top)<1&&a.right<b.left;
    }""")
    snap("培育中心物品")
    catalog_offset = page.evaluate("pairQA.offset()")
    tap("LabResearch")
    ready("research")
    assert page.evaluate("!!pairQA.find('Shade')&&!!pairQA.find('UnderlyingPage')")
    touch.wait("()=>!!pairQA.find('Icon',pairQA.find('Branch2'))?.getComponent(cc.Sprite)?.spriteFrame")
    snap("研究弹窗")
    tap("Branch0")
    ready("researchNode")
    touch.tap(text="核对升级", scope="DeskPage")
    touch.wait("()=>!!pairQA.find('Confirm')")
    touch.tap("Cancel",scope="Confirm")
    ready("researchNode")
    touch.tap(text="各级效果", scope="DeskPage")
    ready("researchTable")
    for key in ("researchNode", "research", "lab"):
        tap("Back")
        ready(key)
    assert page.evaluate("pairQA.visit().args.tab") == "services"
    assert abs(page.evaluate("pairQA.offset()") - catalog_offset) < 1

    tap("LabRecycle")
    ready("recycle")
    assert page.evaluate("!!pairQA.find('Shade')&&!!pairQA.find('UnderlyingPage')")
    snap("动物回收弹窗")
    tap("Row0")
    touch.tap(text="核对回收",scope="DeskPage")
    ready("saleQuote")
    touch.tap(text="修改选择",scope="DeskPage")
    ready("recycle")
    assert page.evaluate("pairQA.visit().selected.has('recycle-demo')")
    touch.tap(text="核对回收",scope="DeskPage")
    ready("saleQuote")
    act("sale.commit","Action1")
    ready("recycle")
    assert page.evaluate("pairQA.visit().data.rows.length===0&&pairQA.visit().selected.size===0")
    tap("Back")
    ready("lab")
    assert page.evaluate("pairQA.visit().args.tab") == "services"
    tap("Back")
    ready("tasks")
    row_done(1)

    tap("TaskRow0")
    ready("breed")
    touch.kind("pair")
    assert page.evaluate("()=>['选择母本','选择父本'].every(t=>pairQA.title(t,pairQA.find('DeskPage')))")
    for i in range(2):
        tap("Animal"+str(i))
        touch.wait("n=>pairQA.ready()&&pairQA.visit().data.presentation.parents.filter(Boolean).length===n", i+1)
    assert page.evaluate("!pairQA.title('每只幼体的出生概率')")
    snap("繁育选择亲本")
    tap("Review")
    touch.kind("pairConfirm")
    QA.check_parent_comparison(page, [["B"]*6, ["B","A","B","B","B","B"]])
    snap("核对亲本双栏")
    assert [item["name"] for item in touch.guide_options()] == ["不使用指导单", "指导品相"]
    touch.choose_guide(1)
    tap("CancelPair")
    touch.kind("pair")
    assert page.evaluate("pairQA.visit().data.presentation.parents.map(p=>p.name)") == ["小花", "小白"]
    tap("Review")
    touch.kind("pairConfirm")
    assert page.evaluate("pairQA.visit().data.presentation.guide.index") == 1
    touch.tap(text="开始繁育", scope="DeskPage")
    touch.wait("()=>!!pairQA.find('Confirm')")
    text = page.evaluate("pairQA.find('Question',pairQA.find('Confirm')).getComponent(cc.Label).string")
    assert "后代品种 安哥拉兔" in text and "研究加成 稀有率+10%，属性提升+12%" in text
    assert "选育指导 幼体品相属性会更容易遗传自父本。" in text
    snap("繁育确认弹窗")
    act("care.breed", "Accept", "Confirm")
    touch.kind("breeding")
    tap("Back")
    ready("tasks")
    row_done(0)
    tap("TaskRow2")
    ready("profile")
    if width == 320:
        with page.expect_response(lambda r: r.url.endswith("/api/action")
                and r.request.post_data_json.get("type") == "care.checkin") as receipt:
            touch.tap(text="领养两只幼兔", scope="DeskPage")
        assert receipt.value.ok
        check_gift_receipt()
        tap("Back")
        ready("profile")
    tap("Back")
    ready("tasks")
    row_done(2)
    for row, key in ((4, "market"), (3, "orders")):
        tap("TaskRow"+str(row))
        ready(key)
        if key == "market":
            assert page.evaluate("""()=>{
                const q=pairQA, rows=q.visit().data.rows, index=rows.findIndex(r=>r.select);
                const item=rows[index], a=item.animal, row=q.find('Row'+index,q.find('DeskPage'));
                const price=q.find('Price',row), y=price.position.y, x=price.position.x;
                const width=row.getComponent('cc.UITransform').width;
                const text=name=>q.find(name,row).getComponent(cc.Label).string;
                return text('Number')==='#'+a.number && text('Identity')===a.breed+' · '+a.coat
                    && text('Stage')===a.sex+' · '+a.stage+' · '+a.status
                    && y===0 && x===width/2-92;
            }""")
            snap("自由市场动物信息")
        tap("Back")
        ready("tasks")
        row_done(row)
    proc.stdin.write("complete\n")
    proc.stdin.flush()
    assert proc.stdout.readline().strip() == "complete"
    row_done(5)
    assert page.evaluate("!pairQA.visit().data.actions[0].disabled")
    assert page.evaluate("pairQA.find('RewardCount0').getComponent(cc.Label).string") == "× 40"
    assert page.evaluate("pairQA.find('RewardCount1').getComponent(cc.Label).string") == "× 2"
    touch.wait("()=>!!pairQA.find('RewardArt1')?.getComponent(cc.Sprite)?.spriteFrame")
    snap("任务全部完成")
    wallet = MAIN + "?.shop?.coins"
    coins = page.evaluate(wallet)
    act("task.claim", "ClaimTasks")
    touch.wait("()=>pairQA.ready()&&pairQA.visit().data.actions[0].label==='已领取'")
    assert page.evaluate(wallet) == coins + 40
    assert not errors, errors
    page.close()
    print(f"{width}px: mixed catalogs, side-by-side parents, task links and one reward passed.", flush=True)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--web", type=Path, default=ROOT / "build/web-mobile")
    parser.add_argument("--output", type=Path)
    options = parser.parse_args()
    with sync_playwright() as pw:
        browser = pw.chromium.launch(channel="msedge", args=["--use-angle=swiftshader", "--enable-unsafe-swiftshader"])
        try:
            for viewport in (390, 320):
                with TemporaryDirectory(prefix="petshop-task-list-") as save:
                    process = subprocess.Popen(["node", "--input-type=module", "-e", SERVER, save, str(options.web)],
                                               cwd=ROOT, text=True, encoding="utf-8", stdin=subprocess.PIPE,
                                               stdout=subprocess.PIPE, creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0))
                    try:
                        port = int(process.stdout.readline())
                        verify(browser, f"http://127.0.0.1:{port}/", process, viewport, options.output)
                    finally:
                        process.terminate()
                        process.wait(timeout=10)
        finally:
            browser.close()
