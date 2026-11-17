"""Exercise the built, Worker-served game using touch and a synthetic local Sites identity."""
import sys
from urllib.parse import urlparse

from playwright.sync_api import sync_playwright


def verify(browser, url, width, guide=False):
    context = browser.new_context(viewport={"width": width, "height": 568 if width == 320 else 844},
                                  device_scale_factor=2, is_mobile=True, has_touch=True)
    identity = "petshop-local-mobile-" + str(width) + ("-guide" if guide else "-direct")
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
        window.touchPoint=(target,kind)=>{
          const main=shopUnderTest();
          const all=n=>[n,...n.children.flatMap(all)];
          const node=kind==='path'?main.node.getChildByPath(target):kind==='node'?
            all(main.session.host.layer).find(n=>n.activeInHierarchy&&n.name===target):
            main.session.host.layer.getComponentsInChildren(cc.Label).find(l=>l.node.activeInHierarchy&&l.string===target)?.node;
          if(!node)throw Error('Missing UI control: '+target);
          const pos=main.node.getComponent(cc.Canvas).cameraComponent.worldToScreen(node.worldPosition);
          const canvas=document.getElementById('GameCanvas'), r=canvas.getBoundingClientRect();
          return [r.left+pos.x*r.width/canvas.width, r.bottom-pos.y*r.height/canvas.height];
        }
    """)
    def tap(target,kind='label'):
        # A retained Cocos page becomes current one frame before its fresh rows
        # replace the cached visit. Wait for the visible control on that page.
        page.wait_for_function("""([target,kind])=>{
          try{return touchPoint(target,kind).every(Number.isFinite);}catch{return false;}
        }""",arg=[target,kind],timeout=20000)
        x, y = page.evaluate("([target,kind])=>touchPoint(target,kind)", [target,kind])
        assert 0 <= x <= width and 0 <= y <= page.viewport_size['height'], (target, x, y)
        page.touchscreen.tap(x, y)

    try:
        page.goto(url)
        page.wait_for_function("activePage()?.data?.title==='旧店交接'")
        profile = page.evaluate("shopUnderTest().shop.profileId")
        assert page.evaluate("activePage().data.actions.some(a=>a.page==='tutorial')")
        if guide:
            play_guide(page,tap,profile)
            assert not errors,errors
            return
        tap("跳过，进店")
        page.wait_for_function("shopUnderTest().home.active")
        tap("ShopHome/RoomPlane/Entrances/Hotspot_profile/Sign","path")
        page.wait_for_function("activePage()?.data?.title==='每日签到'")
        tap("领养两只幼兔")
        page.wait_for_function("activePage()?.data?.presentation?.signed===true")
        page.reload()
        page.wait_for_function("shopUnderTest()?.shop?.dayClaimed===true")
        assert page.evaluate("shopUnderTest().shop.profileId") == profile
        assert page.evaluate("shopUnderTest().shop.coins") == 680
        tap("ShopHome/Footer/RoomLink","path")
        page.wait_for_function("activePage()?.data?.presentation?.kind==='rooms'")
        assert page.evaluate("activePage().data.rows.filter(r=>r.animal).length") == 4
        assert not errors, errors
        print(f"{width}px touch: Cocos opening, check-in adoption and four animals after reload passed.", flush=True)
    finally:
        context.close()


def play_guide(page,tap,profile):
    def visit(key):
        page.wait_for_function("k=>activePage()?.key===k&&activePage().version!==undefined",arg=key)
    def step(n):
        page.wait_for_function("n=>shopUnderTest()?.shop?.tutorial?.step===n",arg=n)
    def submit(label,kind):
        tap(label)
        page.wait_for_function("shopUnderTest().session.confirm")
        with page.expect_response(lambda r:r.url.endswith('/api/action') and r.request.post_data_json.get('type')==kind) as action:
            tap("Accept","node")
        assert action.value.ok,action.value.text()
        return action.value.request.post_data_json['args']
    tap('开始新手引导')
    visit('tutorial')
    tap('前往兔繁育台')
    page.wait_for_function("activePage()?.data?.presentation?.kind==='pair'")
    for i in range(2):
        tap('Animal'+str(i),'node')
        page.wait_for_function("n=>activePage()?.data?.presentation?.parents?.filter(Boolean).length===n",arg=i+1)
    tap('Review','node')
    page.wait_for_function("activePage()?.data?.presentation?.kind==='pairConfirm'")
    submit('开始繁育','care.breed')
    step(2)
    page.reload()
    step(2)
    assert page.evaluate('shopUnderTest().shop.profileId')==profile
    tap('ShopHome/Footer/TutorialLink','path')
    visit('tutorial')
    tap('前往兔种源货架')
    visit('shelf')
    tap('Row0','node')
    visit('offer')
    before=page.evaluate('shopUnderTest().shop.coins')
    purchase=submit('购买幼体','care.buyPet')
    visit('tutorial')
    step(3)
    assert page.evaluate('shopUnderTest().shop.coins')==before-purchase['price']
    tap('前往签到簿')
    visit('profile')
    tap('Claim','node')
    step(4)
    page.wait_for_function("activePage()?.data?.presentation?.signed===true")
    assert len(page.evaluate("activePage().data.rows.filter(r=>r.animal).map(r=>r.animal.id)"))==2
    tap('回引导')
    visit('tutorial')
    page.wait_for_function("activePage()?.data?.presentation?.step===4")
    tap('查看普通订单')
    visit('orders')
    page.wait_for_function("shopUnderTest().shop.tutorial?.ordersViewed")
    assert not page.evaluate('shopUnderTest().shop.tutorial.marketViewed')
    page.reload()
    step(4)
    tap('ShopHome/Footer/TutorialLink','path')
    visit('tutorial')
    tap('查看自由市场')
    visit('market')
    page.wait_for_function('shopUnderTest().shop.tutorial?.completed===true')
    page.reload()
    page.wait_for_function('shopUnderTest()?.shop?.tutorial?.completed===true')
    assert page.evaluate('shopUnderTest().shop.profileId')==profile
    tap('ShopHome/Footer/RoomLink','path')
    visit('rooms')
    assert purchase['id'] in page.evaluate("activePage().data.rows.filter(r=>r.animal).map(r=>r.animal.id)")
    print("390px touch: four onboarding steps, purchase and D1-backed progress across reloads passed.",flush=True)


if __name__ == "__main__":
    with sync_playwright() as pw:
        browser = pw.chromium.launch(channel="msedge", args=["--use-angle=swiftshader", "--enable-unsafe-swiftshader"])
        try:
            for viewport in (320, 390):
                verify(browser, sys.argv[1], viewport)
            verify(browser,sys.argv[1],390,guide=True)
        finally:
            browser.close()
