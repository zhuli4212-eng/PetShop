"""Exercise the built, Worker-served game using touch and a synthetic local Sites identity."""
import sys
from urllib.parse import urlparse

from playwright.sync_api import sync_playwright


def verify(browser, url, width):
    context = browser.new_context(viewport={"width": width, "height": 568 if width == 320 else 844},
                                  device_scale_factor=2, is_mobile=True, has_touch=True)
    identity = "petshop-local-mobile-" + str(width)
    context.route("**/*", lambda route: route.continue_(headers={
        **route.request.headers, "oai-authenticated-user-id": identity
    }) if urlparse(route.request.url).netloc == urlparse(url).netloc else route.continue_())
    page = context.new_page()
    page.set_default_timeout(90_000)
    errors = []
    page.on("pageerror", lambda error: errors.append(str(error)))
    page.add_init_script("""
        window.shopUnderTest=()=>window.cc?.director?.getScene()?.getChildByName('Canvas')?.getComponent('ShopMain');
        window.activePage=()=>shopUnderTest()?.session?.current;
        window.touchPoint=(target,isPath=false)=>{
          const main=shopUnderTest();
          const node=isPath?main.node.getChildByPath(target):
            main.session.host.layer.getComponentsInChildren(cc.Label).find(l=>l.string===target)?.node;
          if(!node)throw Error('Missing UI control: '+target);
          const pos=main.node.getComponent(cc.Canvas).cameraComponent.worldToScreen(node.worldPosition);
          const canvas=document.getElementById('GameCanvas'), r=canvas.getBoundingClientRect();
          return [r.left+pos.x*r.width/canvas.width, r.bottom-pos.y*r.height/canvas.height];
        }
    """)
    def tap(target, is_path=False):
        x, y = page.evaluate("([target,isPath])=>touchPoint(target,isPath)", [target, is_path])
        assert 0 <= x <= width and 0 <= y <= page.viewport_size['height'], (target, x, y)
        page.touchscreen.tap(x, y)

    try:
        page.goto(url)
        page.wait_for_function("activePage()?.data?.title==='旧店交接'")
        profile = page.evaluate("shopUnderTest().shop.profileId")
        tap("去签到簿")
        page.wait_for_function("activePage()?.data?.title==='每日签到'")
        tap("领养两只幼兔")
        page.wait_for_function("activePage()?.data?.presentation?.signed===true")
        page.reload()
        page.wait_for_function("shopUnderTest()?.shop?.dayClaimed===true")
        assert page.evaluate("shopUnderTest().shop.profileId") == profile
        assert page.evaluate("shopUnderTest().shop.coins") == 680
        tap("ShopHome/Footer/RoomLink", True)
        page.wait_for_function("activePage()?.data?.presentation?.kind==='rooms'")
        assert page.evaluate("activePage().data.rows.filter(r=>r.animal).length") == 4
        assert not errors, errors
        print(f"{width}px touch: Cocos opening, check-in adoption and four animals after reload passed.", flush=True)
    finally:
        context.close()


if __name__ == "__main__":
    with sync_playwright() as pw:
        browser = pw.chromium.launch(channel="msedge", args=["--use-angle=swiftshader", "--enable-unsafe-swiftshader"])
        try:
            for viewport in (320, 390):
                verify(browser, sys.argv[1], viewport)
        finally:
            browser.close()
