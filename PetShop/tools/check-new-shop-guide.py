"""Exercise the 0–17 guide using the built Cocos canvas and a disposable save."""
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
import {GameStore} from './server/game-store.mjs';
import {createPetShopServer} from './server/main.mjs';
import {lifeDates} from './server/care.mjs';
const store = new GameStore(process.argv[1],{onboarding:true});
const server = createPetShopServer(process.argv[2],{store});
server.listen(0,'127.0.0.1',()=>console.log(server.address().port));
createInterface({input:process.stdin}).on('line',line=>{
  if(line!=='expired-fixture'||store.state.onboarding.step!==10)throw Error('预期为步骤 10');
  const s=structuredClone(store.state);
  const pet=s.pets.find(p=>p.id===s.onboarding.remainingId);
  pet.bornAt-=lifeDates(pet).deathAt-Date.now()+5;
  delete pet.maturation;
  s.version++;store.save(s);
  console.log('expired-fixture');
});
"""


def verify(browser, url, proc, width, output):
    page = browser.new_page(viewport={"width": width, "height": 568 if width == 320 else 844},
                            is_mobile=True, has_touch=True,
                            reduced_motion="reduce" if width == 320 else "no-preference")
    errors = []
    page.on("pageerror", lambda error: errors.append(str(error)))
    touch = QA.Touch(page)

    def main(code):
        return page.evaluate("()=>{const m=" + MAIN + ";" + code + "}")

    def open_page(reload=False):
        page.reload() if reload else page.goto(url)
        page.wait_for_function("()=>!!" + MAIN + "?.shop?.profileId", timeout=90000)
        page.evaluate(QA.LOCATORS)

    def ready(key):
        touch.wait("key=>pairQA.ready()&&pairQA.visit()?.key===key", key)

    def step(number):
        touch.wait("n=>(" + MAIN + "?.shop?.onboarding?.step??null)===n", number)

    def tap(node=None, text=None, scope="DeskPage"):
        touch.tap(node, text=text, scope=scope)

    def action(command, node=None, text=None, scope="DeskPage"):
        with page.expect_response(lambda r: urlsplit(r.url).path == "/api/action"
                and r.request.post_data_json.get("type") == command) as result:
            tap(node, text, scope)
        assert result.value.ok, result.value.text()

    def snap(name):
        if output and width == 390:
            output.mkdir(parents=True, exist_ok=True)
            page.screenshot(path=output / (name + ".png"))

    def focus(scope):
        touch.wait("scope=>!!pairQA.find(scope)?.getChildByName('GuideFocus')", scope)

    def back():
        tap("Back")

    def pairing(first):
        touch.kind("pair")
        tap("Animal0")
        touch.wait("()=>pairQA.ready()&&pairQA.visit().data.presentation.parents.filter(Boolean).length===1")
        tap("Animal1")
        touch.wait("()=>pairQA.ready()&&pairQA.visit().data.presentation.parents.filter(Boolean).length===2")
        tap("Review")
        touch.kind("pairConfirm")
        tap("Action0")
        touch.wait("()=>!!pairQA.find('Confirm')")
        action("care.breed", "Accept", scope="Confirm")
        touch.kind("breeding")
        remaining = main("return m.session.current.data.presentation.endsAt-m.shop.now")
        assert (0 < remaining <= 5000) if first else (110_000 < remaining <= 120_000), remaining

    def sale(channel):
        tap("Row0")
        focus("Action0")
        tap("Action0")
        ready("saleQuote")
        if channel == "order":
            assert "×1.35" in main("return m.session.current.data.visual.guideQuote")
            snap("16-首单核对")
        text = main("return m.session.current.data.actions.find(a=>a.type==='sale.commit').label")
        action("sale.commit", text=text)

    open_page()
    ready("onboarding")
    step(0)
    action("onboarding.enter", "Action0")
    step(1)
    touch.wait("()=>!!pairQA.find('HandoverEnvelope')?.getComponent(cc.Sprite)?.spriteFrame")
    focus("Action1")
    snap("01-交接信")
    action("onboarding.proceed", "Action0")
    step(2)
    tap("Sign", scope="Hotspot_rooms")
    ready("rooms")
    focus("Action0")
    snap("02-免费开放兔房")
    action("onboarding.openRoom", "Action0")
    step(3)
    open_page(reload=True)
    step(3)
    tap("TaskShortcut", scope="ShopHome")
    ready("rooms")
    focus("Feed")
    tap("Feed")
    ready("roomNutrition")
    assert page.evaluate("!!pairQA.find('TutorialMeal')")
    snap("03-首次投喂确认")
    action("onboarding.feed", "Action1")
    step(4)
    ready("rooms")
    touch.wait("()=>!!pairQA.find('GrowthSpark')?.getComponent(cc.Sprite)?.spriteFrame")
    assert main("return m.session.current.data.presentation.nutrition??null") is None
    snap("03-首对成年")
    tap("GuideNext")
    tap("Sign", scope="Hotspot_breed")
    pairing(True)
    step(5)
    step(6)
    tap("GuideNext")
    ready("litter")
    step(7)
    assert main("return m.session.current.data.rows.filter(r=>r.litterMember).length") >= 3
    tap("Animal0")
    ready("pet")
    step(8)
    assert main("return m.session.current.data.presentation.traits.length") == 6
    back()
    ready("litter")
    back()
    ready("breed")
    back()
    tap("Sign", scope="Hotspot_market")
    ready("market")
    step(9)
    assert main("return m.session.current.data.rows.length") == 2
    sale("market")
    ready("pet")
    step(10)
    assert main("return m.session.current.data.presentation.animal.stage") == "成年"

    proc.stdin.write("expired-fixture\n")
    proc.stdin.flush()
    assert proc.stdout.readline().strip() == "expired-fixture"
    open_page(reload=True)
    tap("TaskShortcut", scope="ShopHome")
    ready("pet")
    step(11)
    assert main("return m.session.current.data.presentation.animal.stage") == "已故"
    assert not page.evaluate("!!pairQA.find('GuideNote')")
    snap("10-已故档案")
    back()
    ready("rooms")
    back()
    tap("Sign", scope="Hotspot_lab")
    ready("lab")
    focus("LabRecycle")
    tap("LabRecycle")
    ready("recycle")
    step(12)
    sale("recycle")
    ready("lab")
    step(13)
    snap("13-成年垂耳种源")
    for index in range(2):
        tap("Row"+str(index))
        ready("offer")
        tap(text="核对购买")
        action("onboarding.buy", "Accept", scope="Confirm")
        ready("lab")
        assert main("return m.session.current.data.subtitle") == f"已购买 {index+1} / 2"
    step(14)
    tap("GuideNext")
    ready("rooms")
    tap("GuideNext")
    pairing(False)
    step(15)
    back()
    tap("Sign", scope="Hotspot_tasks")
    ready("tasks")
    assert main("return m.session.current.data.rows.filter(r=>r.done).length") == 4
    snap("15-奖励领取")
    action("onboarding.claim", "ClaimTasks")
    step(16)
    tap("Sign", scope="Hotspot_orders")
    ready("orders")
    assert main("return m.session.current.data.rows.length") == 3
    tap("Deliver", scope="Order0")
    ready("sale")
    sale("order")
    step(17)
    ready("onboarding")
    snap("17-引导完成")
    action("onboarding.finish", "Action0")
    step(None)
    assert not errors, errors
    page.close()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path)
    args = parser.parse_args()
    with sync_playwright() as p:
        browser = p.chromium.launch(channel="msedge", headless=True)
        for width in (390, 320):
            with TemporaryDirectory(prefix="petshop-guide-web-") as directory:
                with subprocess.Popen(["node", "--input-type=module", "-e", SERVER,
                        directory, str(ROOT/"build"/"web-mobile")], cwd=ROOT,
                        stdin=subprocess.PIPE, stdout=subprocess.PIPE, text=True, encoding="utf-8") as proc:
                    try:
                        port = int(proc.stdout.readline().strip())
                        verify(browser, f"http://127.0.0.1:{port}/", proc, width, args.output)
                        print(f"{width} px 触屏引导检查通过", flush=True)
                    finally:
                        proc.terminate()
        browser.close()


if __name__ == "__main__":
    main()
