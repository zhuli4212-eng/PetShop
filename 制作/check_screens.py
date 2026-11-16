"""Exercise the art-review mockup through its public controls in desktop Edge."""

import base64
import json
import os
import re
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

from playwright.sync_api import expect, sync_playwright


SRC = Path(__file__).resolve().parents[1] / "美术确认稿" / "宠物店界面预览.html"
EDGE = Path(os.environ.get("ProgramFiles(x86)", "")) / "Microsoft/Edge/Application/msedge.exe"
PAGES = ["home", "rooms", "breed", "profile", "orders", "market", "lab",
         "guest", "decor", "show", "login"]
ROOMS = {
    "兔": ("rabbit-room.png", ("安哥拉兔", "原色兔", "垂耳兔", "狮子兔")),
    "猫": ("cat-room.png", ("波斯猫", "英国短毛猫", "美国短毛猫", "缅因猫")),
    "狗": ("dog-room.png", ("柴犬", "腊肠犬", "贵宾犬", "柯基犬")),
}


def exercise(width):
    height = 900 if width > 640 else 844 if width > 320 else 700
    mobile = width <= 640
    with sync_playwright() as pw, pw.chromium.launch(executable_path=str(EDGE), headless=True) as browser:
        page = browser.new_page(viewport={"width": width, "height": height},
                                has_touch=mobile, is_mobile=mobile, device_scale_factor=1)
        errors = []
        page.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
        page.on("pageerror", lambda e: errors.append(str(e)))
        page.on("requestfailed", lambda req: errors.append(req.url[:100]))
        page.goto(SRC.as_uri(), wait_until="load")
        sc = page.locator("#screen")
        back_button = page.locator('.phone header button[data-a="back"]')

        def action(name, val=None):
            return sc.locator(f'button[data-a="{name}"]' + (f'[data-v="{val}"]' if val is not None else ""))

        def select(control):
            expect(control).to_be_enabled()
            if mobile:
                control.tap()
            else:
                control.click()

        def go(page_id):
            if mobile:
                page.locator("#jump").select_option(page_id)
            else:
                select(page.locator(f'#index [data-v="{page_id}"]'))
            expect(page.locator("#jump")).to_have_value(page_id)
            expect(sc).not_to_be_empty()

        def read_cash():
            return int(page.locator("#cash").inner_text())

        def choose(channel, animal_id):
            select(action("pc-choose", f"{channel}|{animal_id}"))

        def check_quote(count, price):
            summary = sc.locator(".pc-summary")
            expect(summary).to_contain_text(re.compile(rf"已选\s*{count}\s*只"))
            expect(summary).to_contain_text(re.compile(rf"(?<!\d){price}\s*金币"))

        def submit_once(control, expected_income):
            before = read_cash()
            event = [control.get_attribute(key) for key in ("data-a", "data-v", "data-quote")]
            select(control)
            assert read_cash() == before + expected_income
            # Replay the same submitted action after the screen has re-rendered.
            page.evaluate("([a,v,quote]) => click(a,v,quote)", event)
            assert read_cash() == before + expected_income, event

        def check_deceased_sprite(image, asset):
            expect(image).to_be_visible()
            source = image.get_attribute("src")
            assert source.startswith("data:image/png;base64,")
            expected = SRC.parent / "已故" / f"{asset}-dead.png"
            assert base64.b64decode(source.split(",", 1)[1]) == expected.read_bytes(), asset

        def check_deceased_room(individuals):
            floor = sc.locator(".roomview")
            actors = floor.locator(".room-actor[data-deceased=true]")
            expect(actors).to_have_count(len(individuals))
            expect(floor.locator(".room-actor")).to_have_count(len(individuals))
            expect(floor.locator("[data-walker], .walk-cycle")).to_have_count(0)
            expect(sc.locator(".item[data-a=profile]")).to_have_count(len(individuals))
            room_portraits = []
            for actor in actors.all():
                expect(actor).to_contain_text("已故")
                portrait = actor.locator("img.deceased-sprite")
                expect(portrait).to_be_visible()
                room_portraits.append(portrait.get_attribute("src"))
            list_portraits = []
            for animal_id, asset in individuals:
                portrait = action("profile", animal_id).locator("img.deceased-sprite")
                check_deceased_sprite(portrait, asset)
                list_portraits.append(portrait.get_attribute("src"))
            assert sorted(room_portraits) == sorted(list_portraits)

        def back(destination):
            expect(back_button).to_have_count(1)
            expect(back_button).to_be_visible()
            select(back_button)
            expect(page.locator("#jump")).to_have_value(destination)
            if destination == "home":
                expect(back_button).to_be_hidden()

        def layout():
            expect(page.locator(".phone footer, .phone #foot")).to_have_count(0)
            pos = sc.evaluate("""node => {
              const bounds = document.querySelector('.phone').getBoundingClientRect();
              return {left:bounds.left, right:bounds.right, width:innerWidth,
                      doc:document.documentElement.scrollWidth,
                      content:node.scrollWidth, area:node.clientWidth};
            }""")
            assert pos["doc"] <= width + 1 and pos["content"] <= pos["area"] + 1, pos
            assert pos["left"] >= -1 and pos["right"] <= pos["width"] + 1, pos
            page.wait_for_function("""() => [...document.querySelectorAll('img')].filter(el =>
              el.getClientRects().length).every(el=>el.complete && el.naturalWidth>0)""", timeout=5000)

        def home_checks():
            scene = sc.locator(".shop-scene")
            expect(scene).to_be_visible()
            expect(scene.locator("[data-shopkeeper]")).to_have_count(1)
            expect(scene.locator("[data-shopkeeper]")).to_be_visible()
            expect(sc.locator(".fieldpet, [data-pet], [data-animal]")).to_have_count(0)
            expect(sc.locator(".tiles:visible, .home-order:visible")).to_have_count(0)
            assert sc.locator("button:visible").count() == scene.locator("button:visible").count()
            expect(back_button).to_be_hidden()
            hotspots = scene.locator('button[data-a="go"]')
            routes = hotspots.evaluate_all("els => els.map(el => el.dataset.v)")
            assert sorted(routes) == sorted(PAGES[1:]), routes
            hit_map = hotspots.evaluate_all("""items => {
                const box = document.querySelector(".phone").getBoundingClientRect();
                const result = [];
                for(const item of items){
                    const r = item.getBoundingClientRect();
                    const x = r.left+r.width*.5, y = r.top+r.height*.5;
                    const target = document.elementFromPoint(x,y);
                    if (!item.contains(target) || x<box.left || x>box.right || y<box.top || y>box.bottom)
                        result.push(item.dataset.v);
                    const corners = [[.2,.2],[.8,.2],[.2,.8],[.8,.8]];
                    for(const [rx,ry] of corners){
                        const hit = document.elementFromPoint(r.left+r.width*rx,r.top+r.height*ry);
                        if(hit && !item.contains(hit) && hit.closest('.shop-scene button'))
                            result.push([item.dataset.v, hit.closest('button').dataset.v]);
                    }
                }
                return result;
            }""")
            assert not hit_map, (width, "overlapping or inaccessible hotspot centers", hit_map)
            return scene

        def check_room(species):
            layout()
            signs = sc.locator(".room-signs")
            expect(signs.locator("button")).to_have_count(len(ROOMS))
            expect(signs.locator('[aria-pressed="true"]')).to_have_count(1)
            expect(action("species", species)).to_have_attribute("aria-pressed", "true")
            image = sc.locator(".roomview > .room-bg")
            filename, breeds = ROOMS[species]
            source = image.get_attribute("src")
            assert base64.b64decode(source.split(",", 1)[1]) == (SRC.parent / "素材" / filename).read_bytes(), filename
            geometry = image.evaluate("""img => {
                const header = document.querySelector('.phone header').getBoundingClientRect();
                const scroll = document.querySelector('.scroll').getBoundingClientRect();
                const signs = document.querySelector('.room-signs').getBoundingClientRect();
                const frame = img.parentElement.getBoundingClientRect();
                const pic = img.getBoundingClientRect();
                const centerHit = y => document.elementFromPoint(pic.left + pic.width / 2, y) === img;
                return {natural:[img.naturalWidth,img.naturalHeight], headerBottom:header.bottom,
                        signsTop:signs.top, signsBottom:signs.bottom, top:pic.top, bottom:pic.bottom,
                        scrollBottom:scroll.bottom, frameTop:frame.top, frameBottom:frame.bottom,
                        ratio:pic.width / pic.height, topVisible:centerHit(pic.top + 2),
                        bottomVisible:centerHit(pic.bottom - 2)};
            }""")
            assert geometry["natural"] == [512, 288], geometry
            assert geometry["headerBottom"] <= geometry["signsTop"] + 1, geometry
            assert geometry["signsBottom"] <= geometry["top"] + 1, geometry
            assert geometry["frameTop"] <= geometry["top"] + 1, geometry
            assert geometry["bottom"] <= min(geometry["frameBottom"], geometry["scrollBottom"]) + 1, geometry
            assert abs(geometry["ratio"] - 16 / 9) < .025, geometry
            assert geometry["topVisible"] and geometry["bottomVisible"], geometry
            roster = sc.locator(".item[data-a='profile']")
            details = roster.locator("small").all_inner_texts()
            assert details and all(any(breed in row for breed in breeds) for row in details), details
            names = roster.locator("strong").all_inner_texts()
            on_floor = sc.locator(".roomview .pet-mini").evaluate_all("pets => pets.map(p => p.alt)")
            assert on_floor and len(set(on_floor)) == len(on_floor) and set(on_floor) <= set(names), (on_floor, names)
            return roster

        go("home")
        layout()
        scene = home_checks()
        for key in PAGES[1:]:
            select(scene.locator(f'button[data-a="go"][data-v="{key}"]'))
            expect(page.locator("#jump")).to_have_value(key)
            layout()
            back("home")
            expect(scene).to_be_visible()
        select(action("go", "rooms"))
        entry_cash = read_cash()
        for species in ROOMS:
            select(action("species", species))
            roster = check_room(species)
            if species == "狗":
                dog = roster.first.locator("strong").inner_text()
                select(roster.first)
                expect(sc.locator(".pethead h3")).to_have_text(dog)
                back("rooms")
                expect(action("species", species)).to_have_attribute("aria-pressed", "true")
        assert read_cash() == entry_cash, "Room preview signs should switch without charging."
        back("home")
        select(action("go", "rooms"))
        select(action("species", "猫"))
        expect(sc).to_contain_text("云团")
        select(action("profile", "cat1"))
        select(action("go", "market"))
        back("profile")
        expect(sc.locator(".pethead h3")).to_have_text("云团")
        back("rooms")
        expect(action("species", "猫")).to_have_attribute("aria-pressed", "true")
        expect(action("profile", "cat1")).to_be_visible()
        select(action("go", "breed"))
        expect(action("parent", "tu1")).to_have_count(0)
        expect(action("parent", "cat1")).to_be_visible()
        back("rooms")
        select(action("species", "兔"))
        select(action("roomfilter", "已故"))
        expect(action("profile", "old1")).to_be_visible()
        check_deceased_room([("old1", "brown")])
        select(action("profile", "old1"))
        check_deceased_sprite(sc.locator(".pethead img.deceased-sprite"), "brown")
        expect(sc.locator(".pethead")).to_contain_text("灰灰")
        back("rooms")
        expect(action("profile", "old1")).to_be_visible()
        select(action("roomfilter", "在养"))
        expect(action("profile", "old1")).to_have_count(0)
        # Choosing a screen in the review index starts a fresh preview path.
        go("breed")
        back("home")
        select(action("go", "breed"))
        expect(action("parent", "tu3")).to_have_count(0)
        select(action("parent", "tu1"))
        select(action("parent", "tu2"))
        expect(sc).to_contain_text("两只亲本都会死亡")
        select(action("start-breed", ""))
        expect(sc.locator("#remaining")).to_be_visible()
        back("home")
        select(action("go", "market"))
        for busy in ["栗子", "小花"]:
            expect(sc).not_to_contain_text(busy)
        back("home")
        select(action("go", "rooms"))
        select(action("species", "狗"))
        select(action("go", "breed"))
        expect(sc).to_contain_text("狗房")
        expect(sc).not_to_contain_text("栗子")
        back("rooms")
        select(action("species", "兔"))
        select(action("go", "breed"))
        expect(sc).to_contain_text("这一窝幼体", timeout=12000)
        born = sc.locator('[data-a=profile][data-v^="litter-"]').count()
        assert 1 <= born <= 3
        expect(sc.locator("img.deceased-sprite")).to_have_count(2)
        expect(sc).to_contain_text("杂交")
        select(action("recycle-page", "tu1"))
        expect(sc).to_contain_text("小花")
        expect(sc).to_contain_text("栗子")
        expect(sc.locator(".pc-petrow img.deceased-sprite")).to_have_count(3)
        check_deceased_sprite(sc.locator(".pc-petrow").filter(has_text="小花").locator("img.deceased-sprite"), "angora")
        check_deceased_sprite(sc.locator(".pc-petrow").filter(has_text="灰灰").locator("img.deceased-sprite"), "brown")
        expect(action("pc-recycle", "tu1")).to_be_enabled()
        check_quote(1, 9)
        submit_once(action("pc-recycle", "tu1"), 9)
        expect(sc.locator(".pc-petrow").filter(has_text="小花")).to_have_count(0)
        go("rooms")
        select(action("roomfilter", "已故"))
        check_deceased_room([("tu2", "brown"), ("old1", "brown")])
        select(action("roomfilter", "在养"))
        go("show")
        expect(action("model", "tu2")).to_have_count(0)
        go("market")
        expect(sc).not_to_contain_text("灰灰")
        expect(sc).not_to_contain_text("栗子")
        go("guest")
        check_quote(0, 0)
        choose("guest", "tu3")
        expect(action("pc-guest-sell", "tu3")).to_be_enabled()
        go("orders")
        expect(sc).to_contain_text("一直有效")
        check_quote(0, 0)
        choose("lantern", "tu3")
        check_quote(1, 280)
        before = read_cash()
        submit_once(action("pc-deliver", "lantern|tu3"), 280)
        expect(sc).to_contain_text("已交付")
        expect(sc).to_contain_text("墨点")
        back("home")
        assert read_cash() == before + 280
        select(action("go", "guest"))
        expect(sc).to_contain_text("当前没有同时符合")
        expect(sc.locator(".pc-guest-actions button").last).to_be_disabled()
        select(action("pc-guest-cancel", ""))
        expect(sc).to_contain_text("访客已离开")
        go("lab")
        select(action("pc-lab", "buy"))
        expect(sc).to_contain_text("幼年期")
        select(action("pc-lab", "upgrade"))
        before = read_cash()
        select(action("pc-upgrade", "1"))
        assert read_cash() == before - 180
        expect(sc).to_contain_text("研究等级 2")
        select(action("pc-lab", "buy"))
        before = read_cash()
        select(action("pc-buy", "pear|0"))
        assert read_cash() == before - 240
        go("rooms")
        expect(sc).to_contain_text("梨花")
        go("decor")
        for decor, cost in [("fence", 80), ("lamp", 55)]:
            before = read_cash()
            placed = sc.locator(f'.shop-scene [data-decoration="{decor}"]')
            expect(placed).to_have_count(0)
            select(action("decor", decor))
            assert read_cash() == before - cost
            expect(action("decor", decor)).to_have_text("收起")
            expect(placed).to_be_visible()
            back("home")
            expect(placed).to_be_visible()
            home_checks()
            select(scene.locator('button[data-a="go"][data-v="decor"]'))
            select(action("decor", decor))
            expect(action("decor", decor)).to_have_text("摆放")
            assert read_cash() == before - cost
            back("home")
            expect(placed).to_have_count(0)
            select(scene.locator('button[data-a="go"][data-v="decor"]'))
        select(page.locator('[data-a="reset"]:visible'))
        select(action("go", "rooms"))
        select(action("species", "猫"))
        select(action("profile", "cat1"))
        expect(sc.locator(".pethead h3")).to_have_text("云团")
        select(action("go", "market"))
        expect(action("pc-choose", "market|cat1")).to_have_attribute("aria-pressed", "true")
        check_quote(1, 180)
        before = read_cash()
        select(action("pc-market", "cat1"))
        back("profile")
        expect(sc).to_contain_text("这只动物已离店")
        expect(sc.locator(".pethead")).to_have_count(0)
        assert read_cash() == before + 180
        back("rooms")
        expect(action("species", "猫")).to_have_attribute("aria-pressed", "true")
        expect(action("profile", "cat1")).to_have_count(0)
        assert "云团" not in sc.locator(".roomview .pet-mini").evaluate_all("pets => pets.map(p => p.alt)")
        select(action("roomfilter", "已故"))
        check_deceased_room([])
        select(action("species", "狗"))
        select(action("go", "breed"))
        select(action("parent", "dog1"))
        select(action("parent", "dog2"))
        select(action("start-breed", ""))
        expect(sc).to_contain_text("这一窝幼体", timeout=12000)
        expect(sc.locator("img.deceased-sprite")).to_have_count(2)
        back("rooms")
        expect(action("profile", "dog1")).to_have_count(0)
        select(action("roomfilter", "已故"))
        check_deceased_room([("dog1", "shiba_coat01_male"), ("dog2", "corgi_coat02_female")])
        select(action("profile", "dog1"))
        check_deceased_sprite(sc.locator(".pethead img.deceased-sprite"), "shiba_coat01_male")
        select(action("recycle-page", "dog1"))
        expect(action("pc-recycle", "dog1")).to_be_enabled()

        # Work from a fresh inventory for every channel, using the same pair of
        # eligible pets in the ordinary order and visitor scenarios.
        cases = [
            ("market", "market", "pc-market", ("tu1", "tu2"), (150, 100)),
            ("lab", "recycle", "pc-recycle", ("old1", "tu2"), (5, 36)),
            ("orders", "lantern", "pc-deliver", ("tu3", "lab-pet-1"), (280, 280)),
            ("guest", "guest", "pc-guest-sell", ("tu3", "lab-pet-1"), (440, 440)),
        ]
        for route, channel, submit, ids, prices in cases:
            select(page.locator('[data-a="reset"]:visible'))
            if route in ("orders", "guest"):
                go("lab")
                select(action("pc-buy", "pear|0"))
            go(route)
            if channel == "recycle":
                select(action("pc-lab", "recycle"))
            check_quote(0, 0)
            choices = action("pc-choose")
            checked = sc.locator('[data-a="pc-choose"][aria-pressed="true"]')
            expect(checked).to_have_count(0)
            expect(sc.locator('.pc-batch button:disabled')).to_have_count(1)
            if channel != "recycle":
                expect(action("pc-choose", f"{channel}|old1")).to_have_count(0)
            select(action("pc-choose-all", channel))
            expect(checked).to_have_count(choices.count())
            select(action("pc-choose-all", channel))
            check_quote(0, 0)
            # Hit the pet name on the row, away from its dedicated toggle.
            toggle = page.locator(f'button[data-v="{channel}|{ids[1]}"]')
            name = sc.locator(".pc-selectable").filter(has=toggle).locator("strong")
            if mobile:
                name.tap()
            else:
                name.click()
            check_quote(1, prices[1])
            select(action("pc-clear", channel))
            check_quote(0, 0)
            choose(channel, ids[1])
            check_quote(1, prices[1])
            choose(channel, ids[1])
            check_quote(0, 0)
            for animal_id in reversed(ids):
                choose(channel, animal_id)
            check_quote(2, sum(prices))
            layout()
            value = ("lantern|" if channel == "lantern" else "") + ",".join(ids)
            inventory = set(page.evaluate("s.animals.map(p => p.id)"))
            submit_once(action(submit, value), sum(prices))
            assert set(page.evaluate("s.animals.map(p => p.id)")) == inventory - set(ids)
            if channel in ("lantern", "guest"):
                expect(sc).to_contain_text("墨点")
                expect(sc).to_contain_text("梨花")
                expect(action("pc-choose")).to_have_count(0)
            else:
                check_quote(0, 0)
            go("rooms")
            select(action("species", "兔"))
            for filt in ("在养", "已故"):
                select(action("roomfilter", filt))
                for animal_id in ids:
                    expect(action("profile", animal_id)).to_have_count(0)

        # Simulate a life-stage change between the quote and the click. The
        # preview does not run an aging clock, so advance just this one record.
        select(page.locator('[data-a="reset"]:visible'))
        go("lab")
        select(action("pc-buy", "pear|0"))
        go("orders")
        select(action("pc-choose-all", "lantern"))
        check_quote(2, 560)
        before = read_cash()
        inventory = page.evaluate("s.animals.map(p => p.id)")
        page.evaluate("animal('lab-pet-1').stage = '成长期'")
        select(action("pc-deliver", "lantern|tu3,lab-pet-1"))
        assert read_cash() == before
        assert page.evaluate("s.animals.map(p => p.id)") == inventory
        expect(action("pc-choose", "lantern|tu3")).to_be_enabled()
        expect(action("pc-choose", "lantern|lab-pet-1")).to_have_count(0)

        # Research accepts both stages, but a lethal transition changes the
        # quote. The lower mixed-batch price must be shown before settlement.
        go("lab")
        select(action("pc-lab", "recycle"))
        choose("recycle", "tu1")
        choose("recycle", "tu2")
        check_quote(2, 90)
        page.evaluate("animal('tu2').stage = '死亡'")
        select(action("pc-recycle", "tu1,tu2"))
        assert read_cash() == before
        assert page.evaluate("s.animals.map(p => p.id)") == inventory
        check_quote(2, 60)
        submit_once(action("pc-recycle", "tu2,tu1"), 60)

        # Redistribute the two prices without changing the total or the IDs.
        # A previous quote still has to be rejected for the whole batch.
        go("market")
        choose("market", "cat1")
        choose("market", "cat2")
        sale = action("pc-market", "cat1,cat2")
        check_quote(2, 320)
        expect(sale).to_have_attribute("data-quote", "180,140")
        before = read_cash()
        inventory = page.evaluate("s.animals.map(p => p.id)")
        page.evaluate("() => {animal('cat1').base += 10; animal('cat2').base -= 10;}")
        select(sale)
        assert read_cash() == before
        assert page.evaluate("s.animals.map(p => p.id)") == inventory
        check_quote(2, 320)
        expect(sale).to_have_attribute("data-quote", "190,130")
        submit_once(sale, 320)
        assert not errors, errors
        return {"width": width, "pages": len(PAGES), "home_hotspots": len(PAGES)-1,
                "rooms": list(ROOMS), "litter": born, "batch_sales": len(cases),
                "console_resource_errors": errors}


if __name__ == "__main__":
    with ThreadPoolExecutor(max_workers=3) as pool:
        for result in pool.map(exercise, [1280, 390, 320]):
            print(json.dumps(result, ensure_ascii=False))
