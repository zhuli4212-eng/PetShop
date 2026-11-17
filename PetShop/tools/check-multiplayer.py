"""Exercise two independent shops through the shipped mobile game on a disposable server."""
import subprocess
from pathlib import Path
from tempfile import TemporaryDirectory

from playwright.sync_api import sync_playwright


GAME = Path(__file__).resolve().parents[1]
START = """
import {createMultiplayerServer} from './server/multiplayer.mjs';
const server = createMultiplayerServer({dataDirectory:process.argv[1]});
server.listen(0, '127.0.0.1', () => console.log(server.address().port));
"""


def enter(browser, address, username, width, register):
    page = browser.new_page(viewport={"width": width, "height": 844 if width == 390 else 568},
                            is_mobile=True, has_touch=True, device_scale_factor=1)
    page.add_init_script("""
        window.shopUI = () => window.cc?.director?.getScene()?.getChildByName('Canvas')?.getComponent('ShopMain');
        window.currentLedger = () => shopUI()?.session?.current?.data;
    """)
    page.goto(address)
    if register:
        page.get_by_role("link", name="注册", exact=True).click()
    page.get_by_label("账号名", exact=True).fill(username)
    assert page.locator("input:visible").count() == 1
    page.get_by_role("button", name="注册并开店" if register else "登录店铺").click()
    page.wait_for_function("shopUI()?.shop?.profileId", timeout=90000)
    return page


def tap_game_label(page, caption):
    x, y = page.evaluate("""caption => {
        const main = shopUI();
        const node = main.session.host.layer.getComponentsInChildren(cc.Label).find(label => label.string === caption).node;
        const p = main.node.getComponent(cc.Canvas).cameraComponent.worldToScreen(node.worldPosition);
        const canvas = document.getElementById('GameCanvas'), rect = canvas.getBoundingClientRect();
        return [rect.left + p.x * rect.width / canvas.width, rect.bottom - p.y * rect.height / canvas.height];
    }""", caption)
    page.touchscreen.tap(x, y)


def residents(page, address):
    result = page.request.post(address + "/api/page", headers={"Origin": address},
                               data={"page": "rooms", "args": {"species": "rabbit"}})
    assert result.ok, result.text()
    return [row["animal"]["id"] for row in result.json()["page"]["rows"] if "animal" in row]


def verify(browser, address):
    first = enter(browser, address, "桂花店", 390, True)
    first.wait_for_function("currentLedger()?.title === '旧店交接'")
    first_id = first.evaluate("shopUI().shop.profileId")
    tap_game_label(first, "去签到簿")
    first.wait_for_function("currentLedger()?.title === '每日签到'")
    tap_game_label(first, "领养两只幼兔")
    first.wait_for_function("currentLedger()?.presentation?.signed === true")
    adopted = residents(first, address)
    assert len(adopted) == 4
    second = enter(browser, address, "青松店", 320, True)
    assert second.evaluate("shopUI().shop.profileId") != first_id
    second_pets = residents(second, address)
    assert len(second_pets) == 2 and not set(second_pets).intersection(adopted)
    first.close()
    new_device = enter(browser, address, "桂花店", 320, False)
    assert new_device.evaluate("shopUI().shop.profileId") == first_id
    assert new_device.evaluate("shopUI().shop.dayClaimed")
    assert residents(new_device, address) == adopted
    assert residents(second, address) == second_pets
    print("Passed: name-only registration, Cocos touch adoption, independent shops and cross-device login.")


if __name__ == "__main__":
    with TemporaryDirectory(prefix="petshop-multiplayer-qa-") as data, sync_playwright() as pw:
        server = subprocess.Popen(["node", "--input-type=module", "-e", START, data], cwd=GAME,
                                  stdout=subprocess.PIPE, text=True)
        try:
            address = "http://127.0.0.1:" + str(int(server.stdout.readline()))
            browser = pw.chromium.launch(channel="msedge", args=["--use-angle=swiftshader", "--enable-unsafe-swiftshader"])
            try:
                verify(browser, address)
            finally:
                browser.close()
        finally:
            server.terminate()
            server.wait(timeout=10)
