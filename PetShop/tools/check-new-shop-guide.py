"""Exercise the handover booklet and first litter in Web Mobile with disposable saves."""
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
import {GameStore} from './server/game-store.mjs';
import {createPetShopServer} from './server/main.mjs';
const store = new GameStore(process.argv[1],{onboarding:true});
const server = createPetShopServer(process.argv[2],{store});
server.listen(0,'127.0.0.1',()=>console.log(server.address().port));
"""


def verify(browser, url, width, output):
    page = browser.new_page(viewport={"width": width, "height": 568 if width == 320 else 844},
                            is_mobile=True, has_touch=True)
    errors = []
    page.on("pageerror", lambda err: errors.append(str(err)))
    touch = QA.Touch(page)
    page.goto(url)
    page.wait_for_function("()=>!!" + MAIN + "?.shop?.profileId", timeout=90000)
    page.evaluate(QA.LOCATORS)

    def ready(key):
        touch.wait("key=>pairQA.ready()&&pairQA.visit()?.key===key", key)

    def tap(node=None, text=None, scope="DeskPage"):
        touch.tap(node, text=text, scope=scope)

    def action(kind, node=None, text=None, scope="DeskPage"):
        with page.expect_response(lambda r: urlsplit(r.url).path == "/api/action"
                and r.request.post_data_json.get("type") == kind) as result:
            tap(node, text, scope)
        assert result.value.ok, result.value.text()

    def snap(name):
        if output:
            output.mkdir(parents=True, exist_ok=True)
            page.screenshot(path=output / (str(width) + "-" + name + ".png"))

    def letter(index):
        touch.wait("""i=>{
            const d=pairQA.find('DeskPage');
            const art=pairQA.find('GuidePageImage',d)?.getComponent(cc.Sprite)?.spriteFrame;
            return pairQA.find('Page',d)?.getComponent(cc.Label)?.string===i+' / 9'&&!!art;
        }""", index)

    ready("openingGuide")
    letter(1)
    assert page.evaluate("!pairQA.find('GuideSpotlight')")
    snap("交接信")
    for index in range(2, 10):
        tap("Next")
        letter(index)
        if index == 3:
            assert page.evaluate("pairQA.find('GuidePageCaption').getComponent(cc.Label).string") == (
                "进兔房点「投喂」，把这份营养餐喂给它们，两只小兔就会长大。")
            snap("营养餐指引")
    tap("Previous")
    letter(8)
    tap("Next")
    tap("Next")
    touch.wait("()=>!pairQA.visit()")
    tap("LetterShortcut", scope="Footer")
    ready("openingGuide")
    letter(1)
    tap("Back")
    tap("Sign", scope="Hotspot_market")
    ready("market")
    tap("Back")
    tap("Sign", scope="Hotspot_rooms")
    ready("rooms")
    action("onboarding.openRoom", text="免费开放兔房")
    touch.kind("rooms")
    tap("Feed", scope="FeedingStation")
    ready("roomNutrition")
    assert page.evaluate("pairQA.visit().data.rows[2].visual.stock") == 1
    action("care.feed", text="投喂")
    ready("rooms")
    touch.wait("()=>pairQA.visit().data.presentation.residents.every(r=>r.stage==='成年')")
    tap("Back")
    tap("Sign", scope="Hotspot_breed")
    touch.kind("pair")
    tap("Animal0")
    touch.wait("()=>pairQA.ready()&&pairQA.visit().data.presentation.parents.filter(Boolean).length===1")
    tap("Animal1")
    touch.wait("()=>pairQA.ready()&&pairQA.visit().data.presentation.parents.filter(Boolean).length===2")
    tap("Review")
    touch.kind("pairConfirm")
    assert page.evaluate("pairQA.visit().data.presentation.waitText") == "5 秒"
    tap("Action0")
    action("care.breed", "Accept", scope="Confirm")
    tap(text="查看首窝")
    ready("litter")
    assert page.evaluate("pairQA.visit().data.rows.filter(r=>r.litterMember).length") == 4
    tap("Animal2")
    ready("pet")
    tap("Back")
    ready("litter")
    tap(text="挑选留种")
    ready("litterKeep")
    tap("Animal0")
    tap("Animal1")
    tap(text="挑选出售")
    ready("openingLitterSale")
    tap("Row0")
    tap(text="核对售价")
    ready("openingLitterQuote")
    action("sale.commit", text="确认选择")
    ready("tasks")
    action("onboarding.claim", text="领取")
    ready("tasks")
    touch.wait("()=>pairQA.visit().data.subtitle.includes('安置兔房 · 0 / 3')")
    assert page.evaluate("pairQA.visit().data.visual.rewards.map(r=>r.name)") == ["金币", "优质兔兔营养餐"]
    snap("正式任务及道具奖励")
    assert not errors, errors
    page.close()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path)
    args = parser.parse_args()
    with sync_playwright() as p:
        browser = p.chromium.launch(channel="msedge",
            args=["--use-angle=swiftshader", "--enable-unsafe-swiftshader"])
        for width in (390, 320):
            with TemporaryDirectory(prefix="petshop-letter-web-") as directory:
                with subprocess.Popen(["node", "--input-type=module", "-e", SERVER,
                        directory, str(ROOT/"build"/"web-mobile")], cwd=ROOT,
                        stdout=subprocess.PIPE, text=True, encoding="utf-8") as proc:
                    try:
                        port = int(proc.stdout.readline().strip())
                        verify(browser, f"http://127.0.0.1:{port}/", width, args.output)
                        print(f"{width} px 交接信、首窝和任务奖励触屏检查通过", flush=True)
                    finally:
                        proc.terminate()
        browser.close()


if __name__ == "__main__":
    main()
