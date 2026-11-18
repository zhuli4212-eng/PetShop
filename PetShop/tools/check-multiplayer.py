"""Check manual entry, remembered names and independent shops in the shipped Web Mobile game."""
import subprocess
from pathlib import Path
from tempfile import TemporaryDirectory
from urllib.parse import urlsplit

from playwright.sync_api import expect, sync_playwright


GAME = Path(__file__).resolve().parents[1]
START = """
import {createMultiplayerServer} from './server/multiplayer.mjs';
const server = createMultiplayerServer({dataDirectory:process.argv[1]});
server.listen(0, '127.0.0.1', () => console.log(server.address().port));
"""


def device(pw, directory, width):
    context = pw.chromium.launch_persistent_context(directory, channel="msedge", headless=True,
        args=["--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
        ignore_default_args=["--disable-back-forward-cache"],
        viewport={"width": width, "height": 844 if width == 390 else 568},
        is_mobile=True, has_touch=True, device_scale_factor=1)
    context.add_init_script("""
        window.shopUI = () => window.cc?.director?.getScene()?.getChildByName('Canvas')?.getComponent('ShopMain');
        window.currentLedger = () => shopUI()?.session?.current?.data;
    """)
    return context


def login_form(page, expected, navigate):
    # Observe the whole navigation; a remembered username must never submit a login
    # or boot the game in the background while the form is on screen.
    attempted = []
    def observe(request):
        path = urlsplit(request.url).path
        auth_write=path in ("/auth/login","/auth/register") and request.method=="POST"
        # A departing game can still finish a heartbeat/read while navigation begins.
        login_started_game=path=="/api/shop" and urlsplit(request.frame.url).path=="/login"
        if auth_write or login_started_game:
            attempted.append((request.method,path))
    page.on("request",observe)
    try:
        navigate()
        form = page.get_by_role("button",name="登录店铺",exact=True)
        expect(form).to_be_visible(timeout=15000)
        expect(page.get_by_label("账号名",exact=True)).to_have_value(expected)
        expect(page.locator("input:visible")).to_have_count(1)
        expect(page.locator("#GameCanvas")).to_have_count(0)
        assert urlsplit(page.url).path=="/login",page.url
        assert attempted==[],attempted
    finally:
        page.remove_listener("request",observe)


def submit(page, name=None, *, register=False):
    if name is not None:
        page.get_by_label("账号名",exact=True).fill(name)
    label = "注册并开店" if register else "登录店铺"
    path = "/auth/register" if register else "/auth/login"
    with page.expect_request(lambda r:r.is_navigation_request() and urlsplit(r.url).path=="/play") as game_entry:
        with page.expect_response(lambda r:urlsplit(r.url).path==path and r.request.method=="POST") as result:
            page.get_by_role("button",name=label,exact=True).click()
    assert result.value.ok,result.value.text()
    consumed=urlsplit(game_entry.value.url)
    page.wait_for_function("shopUI()?.shop?.profileId", timeout=90000)
    assert urlsplit(page.url).path=="/play"
    return consumed.path+("?"+consumed.query if consumed.query else "")


def register(page, name):
    page.get_by_role("link", name="注册", exact=True).click()
    expect(page.get_by_label("账号名",exact=True)).to_have_value("")
    return submit(page,name,register=True)


def tap_game_label(page, caption, *, path=False):
    x, y = page.evaluate("""([caption,path]) => {
        const main = shopUI();
        const node = path ? main.node.getChildByPath(caption) : main.session.host.layer.getComponentsInChildren(cc.Label)
            .find(label => label.node.activeInHierarchy && label.string === caption).node;
        if(!node?.activeInHierarchy)throw Error('Missing active touch target '+caption);
        const p = main.node.getComponent(cc.Canvas).cameraComponent.worldToScreen(node.worldPosition);
        const canvas = document.getElementById('GameCanvas'), rect = canvas.getBoundingClientRect();
        return [rect.left + p.x * rect.width / canvas.width, rect.bottom - p.y * rect.height / canvas.height];
    }""", [caption,path])
    page.touchscreen.tap(x, y)


def residents(page):
    result=page.evaluate("""() => new Promise((resolve,reject)=>{
        const xhr=new XMLHttpRequest();
        xhr.open('POST','/api/page');
        xhr.setRequestHeader('Content-Type','application/json');
        xhr.onload=()=>resolve({status:xhr.status,rows:JSON.parse(xhr.responseText).page?.rows});
        xhr.onerror=()=>reject(new Error('房间名册请求失败'));
        xhr.send(JSON.stringify({page:'rooms',args:{species:'rabbit'}}));
    })""")
    assert result["status"]==200,result["status"]
    return [row["animal"]["id"] for row in result["rows"] if "animal" in row]


def verify(pw, address):
    a,b = "桂花店A","青松店"
    with TemporaryDirectory(prefix="petshop-player-one-") as primary, TemporaryDirectory(prefix="petshop-player-two-") as other:
        first=device(pw,primary,390)
        try:
            page=first.new_page()
            login_form(page,"",lambda:page.goto(address))
            used_entry=register(page,a)
            page.wait_for_function("currentLedger()?.title === '旧店交接'")
            first_id = page.evaluate("shopUI().shop.profileId")
            assert page.evaluate("currentLedger().actions.some(a=>a.page==='tasks')")
            tap_game_label(page,"进入店铺")
            page.wait_for_function("shopUI().home.active")
            gift="ShopHome/RoomPlane/Entrances/Hotspot_profile"
            with page.expect_response(lambda r:urlsplit(r.url).path=="/api/action" and
                                      r.request.post_data_json.get("type")=="care.checkin") as result:
                tap_game_label(page,gift+"/Sign",path=True)
            assert result.value.ok,result.value.text()
            page.wait_for_function("gift=>shopUI().shop.dayClaimed && !shopUI().node.getChildByPath(gift).active",arg=gift)
            adopted=residents(page)
            assert len(adopted)==4

            login_form(page,a,page.reload)
            assert page.request.get(address+"/auth/session").json()["authenticated"] is True
            for path in ("/", "/index.html", "/play", used_entry, "/login"):
                login_form(page,a,lambda path=path:page.goto(address+path))
            page.get_by_label("账号名",exact=True).fill("不存在的店")
            page.get_by_role("button",name="登录店铺",exact=True).click()
            expect(page.get_by_role("alert")).to_contain_text("尚未注册")
            login_form(page,a,page.reload)
            page.get_by_role("link",name="注册",exact=True).click()
            expect(page.get_by_label("账号名",exact=True)).to_have_value("")
            page.get_by_label("账号名",exact=True).fill(a)
            page.get_by_role("button",name="注册并开店",exact=True).click()
            expect(page.get_by_role("alert")).to_contain_text("已注册")
            login_form(page,a,lambda:page.get_by_role("link",name="登录",exact=True).click())

            # Case-insensitive login must remember the canonical display name returned by the server.
            submit(page,a.lower())
            assert page.evaluate("shopUI().shop.profileId")==first_id
            login_form(page,a,lambda:page.goto(address+"/login"))
            login_form(page,a,lambda:page.go_back(wait_until="commit"))
            page.close()
            page=first.new_page()
            login_form(page,a,lambda:page.goto(address))
            submit(page)
            assert residents(page)==adopted

            # Exercise the BFCache restoration handler even on browser builds which
            # opt the live WebGL game out of caching for this navigation.
            login_form(page,a,lambda:page.evaluate(
                "window.dispatchEvent(new PageTransitionEvent('pageshow',{persisted:true}))"))
            page.goto(address+"/login?switch")
            expect(page.get_by_text(a,exact=True)).to_be_visible()
            login_form(page,a,lambda:page.get_by_role("button",name="退出并切换账号").click())
            assert page.request.get(address+"/auth/session").json()["authenticated"] is False
            register(page,b)
            second_id=page.evaluate("shopUI().shop.profileId")
            assert second_id!=first_id
            second_pets=residents(page)
            assert len(second_pets)==2 and set(second_pets).isdisjoint(adopted)
            rejected=[]
            def watch_stale(response):
                if urlsplit(response.url).path.startswith("/api/") and response.status==401:
                    rejected.append(response.status)
            page.on("response",watch_stale)
            sibling=first.new_page()
            login_form(sibling,b,lambda:sibling.goto(address))
            submit(sibling,a)
            assert residents(sibling)==adopted
            def resume_stale_game():
                if urlsplit(page.url).path=="/play":
                    page.evaluate("""()=>{const x=new XMLHttpRequest();x.open('GET','/api/shop');x.send();}""")
            # The old B tab may have already received a heartbeat 401 while A was loading.
            resume_stale_game()
            page.wait_for_url(address+"/login")
            login_form(page,a,lambda:None)
            assert rejected,"The old tab did not reject the replacement session"
            sibling.close()
            submit(page,b)
            assert residents(page)==second_pets
        finally:
            first.close()

        # Reuse the actual browser profile after closing the browser, then open a
        # genuinely separate empty profile to distinguish remembered names from server state.
        first=device(pw,primary,390)
        second=device(pw,other,320)
        try:
            same=first.new_page()
            login_form(same,b,lambda:same.goto(address+"/play"))
            submit(same)
            assert same.evaluate("shopUI().shop.profileId")==second_id
            assert not same.evaluate("shopUI().shop.dayClaimed")
            assert residents(same)==second_pets
            fresh=second.new_page()
            login_form(fresh,"",lambda:fresh.goto(address))
            submit(fresh,a)
            assert fresh.evaluate("shopUI().shop.profileId")==first_id
            assert fresh.evaluate("shopUI().shop.dayClaimed")
            assert residents(fresh)==adopted
            login_form(fresh,a,fresh.reload)
            login_form(same,b,same.reload)
        finally:
            second.close()
            first.close()
    print("Passed: explicit entry after refresh/reopen/Back, persistent names, account switching and isolated cross-device shops.")


if __name__ == "__main__":
    with TemporaryDirectory(prefix="petshop-multiplayer-qa-") as data, sync_playwright() as pw:
        server = subprocess.Popen(["node", "--input-type=module", "-e", START, data], cwd=GAME,
                                  stdout=subprocess.PIPE, text=True,creationflags=getattr(subprocess,"CREATE_NO_WINDOW",0))
        try:
            address = "http://127.0.0.1:" + str(int(server.stdout.readline()))
            verify(pw,address)
        finally:
            server.terminate()
            server.wait(timeout=10)
