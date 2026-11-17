"""Touch the built Cocos UI and verify that the local server receives its read receipts."""
import subprocess
from pathlib import Path
from tempfile import TemporaryDirectory

from playwright.sync_api import sync_playwright


PROJECT = Path(__file__).resolve().parents[1]
SERVER = """
import {GameStore} from './server/game-store.mjs';
import {createPetShopServer} from './server/main.mjs';
let store=new GameStore(process.argv[1]);
store.shop();store.state.coins=4000;
if(process.argv[2]==='legacy')delete store.state.visitBook.tutorial;
store.save(store.state);
store=new GameStore(process.argv[1]);
const server=createPetShopServer(undefined,{store});
server.listen(0,'127.0.0.1',()=>console.log(server.address().port));
"""
SCENE = """
() => cc.director.getScene()?.getChildByName('Canvas')?.getComponent('ShopMain')
"""


def verify(width):
    legacy=width==320
    with TemporaryDirectory(prefix="petshop-built-notes-") as save:
        process = subprocess.Popen(
            ["node", "--input-type=module", "-e", SERVER, save, "legacy" if legacy else "new"], cwd=PROJECT,
            stdout=subprocess.PIPE, text=True, creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0))
        try:
            url = "http://127.0.0.1:" + str(int(process.stdout.readline()))
            with sync_playwright() as pw:
                browser = pw.chromium.launch(channel="msedge", args=["--use-angle=swiftshader"])
                page = browser.new_page(viewport={"width": width, "height": 568 if width == 320 else 844},
                                        is_mobile=True, has_touch=True)
                page.set_default_timeout(90_000)
                page.goto(url)
                page.wait_for_function("() => window.cc && (" + SCENE + ")()?.session.current?.key==='visitBook'")
                page.evaluate("() => {window.shopForCheck=" + SCENE + "}")
                opening=page.evaluate("shopForCheck().session.current.data.actions")
                assert opening[0]["page"]=="tutorial" and opening[0]["label"]==("查看开店四步" if legacy else "开始新手引导"),opening

                def entry(key, args=None):
                    return page.evaluate("([k,a])=>shopForCheck().session.open(k,a)", [key, args or {}])

                def tap(label):
                    point = page.evaluate("""label=>{
                        const main=shopForCheck(), canvas=document.getElementById('GameCanvas');
                        const node=main.session.host.layer.getComponentsInChildren(cc.Label).find(l=>l.string===label).node;
                        const pos=main.node.getComponent(cc.Canvas).cameraComponent.worldToScreen(node.worldPosition);
                        const r=canvas.getBoundingClientRect();
                        return [r.x+pos.x*r.width/canvas.width,r.bottom-pos.y*r.height/canvas.height];
                    }""", label)
                    page.touchscreen.tap(*point)

                def received(response):
                    if not response.url.endswith("/api/heartbeat") or response.request.method != "POST":
                        return False
                    return bool(response.request.post_data_json.get("reader", {}).get("read"))

                # A loose Cocos build once serialized Set spread as [{}]. Source and HTTP-only tests miss this.
                with page.expect_response(received, timeout=25_000) as ack:
                    tap("跳过，进店")
                assert ack.value.request.post_data_json["reader"]["read"] == ["opening"]
                assert ack.value.json()["letter"] is None
                assert bool(ack.value.json().get("tutorial")) != legacy

                # Keep a section open while a real purchase produces the first-room story.
                entry("rooms", {"species": "cat"})
                def api(endpoint, data):
                    res = page.request.post(url + "/api/" + endpoint, data=data)
                    assert res.ok
                    return res.json()
                view = api("page", {"page": "rooms", "args": {"species": "cat"}})
                action = next(a for a in view["page"]["actions"] if a.get("type") == "care.unlock")
                api("action", {**{k: action[k] for k in ("type", "args")}, "requestId": "built-ui-first-room",
                               "profileId": view["shop"]["profileId"], "version": view["shop"]["version"]})
                with page.expect_response(received, timeout=25_000) as story:
                    entry("login")
                assert story.value.json()["letter"] is None
                entry("openingGuide")
                assert page.evaluate("shopForCheck().session.current.data.readNoteIds.length") == 0
                tap("查看开店四步")
                page.wait_for_function("shopForCheck().session.current?.data?.presentation?.kind==='tutorial'")
                guide=page.evaluate("shopForCheck().session.current.data")
                assert len(guide["rows"])==4 and bool(guide["presentation"].get("archived"))==legacy
                if legacy:
                    assert [a.get("type") for a in guide["actions"]]==["ui.back"]
                for _ in range(4):
                    if not page.evaluate("shopForCheck().session.active"):break
                    page.keyboard.press("Escape")
                page.wait_for_function("!shopForCheck().session.active")
                previous_client=page.evaluate("shopForCheck().clientId")
                with page.expect_response(lambda r: r.url.endswith("/api/heartbeat")
                                          and r.request.post_data_json.get("foreground") is True
                                          and r.request.post_data_json.get("clientId")!=previous_client, timeout=60_000) as reopened:
                    page.reload()
                assert reopened.value.json()["letter"] is None
                page.wait_for_function("() => window.cc && (" + SCENE + ")()?.shop?.profileId")
                assert api("page", {"page": "login"})["page"]["readNoteIds"] == []
                browser.close()
        finally:
            process.terminate()
            process.wait(timeout=10)


if __name__ == "__main__":
    for viewport in (320, 390):
        verify(viewport)
        print(f"{viewport}px touch dismissal, manual ledger and archived opening passed", flush=True)
