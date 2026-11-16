"""从实际界面交互导出竖屏效果图与模块总览。"""
import argparse
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont
from playwright.sync_api import sync_playwright


ROOT = Path(__file__).resolve().parents[1] / "美术确认稿"
SCREEN_DIR = ROOT / "分屏"
URL = (ROOT / "宠物店界面预览.html").as_uri()
SCREENS = [
    ("home", "店铺主界面"), ("rooms", "动物房间"), ("breed", "繁育台"),
    ("profile", "动物档案"), ("orders", "普通订单"), ("market", "自由市场"),
    ("lab", "研究所"), ("guest", "特殊来客"), ("decor", "店内装饰"),
    ("show", "赛级展示"), ("login", "账号和登录"),
]


def navigate(page, name):
    page.locator(f'#index button[data-v="{name}"]').click()


def act(page, action, value=None):
    selector = f'#screen [data-a="{action}"]'
    if value is not None:
        selector += f'[data-v="{value}"]'
    page.locator(selector).click()


def start_pair(page):
    for parent in ("tu1", "tu2"):
        act(page, "parent", parent)


def capture(page, file):
    page.mouse.move(5, 5)
    page.evaluate("""async()=>{await document.fonts.ready;
      await Promise.all([...document.querySelectorAll('.phone img')].map(i=>i.decode()));
      await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));}""")
    image = SCREEN_DIR / f"{file}.png"
    page.locator(".phone").screenshot(path=image, animations="disabled")
    print(image.name, flush=True)
    return image


def clean(page, route):
    page.goto(URL, wait_until="load")
    navigate(page, route)


def build_board(screenshots):
    # 3 × 4 layout keeps labels and individual gameplay canvases legible at 100%.
    width, tile_w, tile_h = 1728, 384, 710
    pad, gap, top = 58, 26, 152
    height = top + 3 * (tile_h + 76) + 16
    board = Image.new("RGB", (width, height), "#e8e0c8")
    draw = ImageDraw.Draw(board)
    title = ImageFont.truetype("C:/Windows/Fonts/msyhbd.ttc", 42)
    header = ImageFont.truetype("C:/Windows/Fonts/msyh.ttc", 20)
    label = ImageFont.truetype("C:/Windows/Fonts/msyhbd.ttc", 25)
    draw.rectangle((0, 0, width, 111), fill="#264539")
    draw.rectangle((0, 108, width, 113), fill="#b68b51")
    draw.text((pad, 19), "麦穗宠物店", font=title, fill="#fff2d0")
    draw.text((pad + 2, 77), "模块界面确认稿　·　第一版", font=header, fill="#e2d6b1", anchor="lm")
    for index, (name, image) in enumerate(screenshots):
        col, row = index % 4, index // 4
        x = pad + col * (tile_w + gap)
        y = top + row * (tile_h + 76)
        draw.text((x + 1, y), name, font=label, fill="#314d3d")
        y += 44
        with Image.open(image) as src:
            scaled = src.convert("RGB").resize((tile_w, round(src.height * tile_w / src.width)), Image.Resampling.LANCZOS)
        board.paste(scaled, (x, y))
    board.save(ROOT / "模块总览.png", optimize=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--only", nargs="+", choices=[key for key, _ in SCREENS],
                        help="仅刷新指定主界面，并用现有分屏重建总览")
    selected = parser.parse_args().only
    SCREEN_DIR.mkdir(parents=True, exist_ok=True)
    with sync_playwright() as playwright:
        with playwright.chromium.launch(channel="msedge") as browser:
            page = browser.new_page(viewport={"width": 1000, "height": 800}, device_scale_factor=1)
            shots = []
            for number, (route, name) in enumerate(SCREENS, 1):
                filename = f"{number:02d}-{name}"
                if selected and route not in selected:
                    shots.append((name, SCREEN_DIR / f"{filename}.png"))
                    continue
                clean(page, route)
                if route == "breed":
                    start_pair(page)
                if route == "market":
                    for pet_id in ("tu1", "tu2"):
                        act(page, "pc-choose", "market|" + pet_id)
                image = capture(page, filename)
                shots.append((name, image))
                if route == "rooms":
                    act(page, "roomfilter", "已故")
                    capture(page, "19-动物房间-已故")
                    for species, variant in [("猫", "12-动物房间-猫房"), ("狗", "18-动物房间-狗房")]:
                        act(page, "species", species)
                        capture(page, variant)
            if selected:
                build_board(shots)
                return
            clean(page, "breed")
            start_pair(page)
            act(page, "start-breed")
            page.locator("#remaining").wait_for()
            capture(page, "13-繁育台-等待")
            page.locator('[data-a="again"]').wait_for(timeout=20000)
            capture(page, "14-繁育台-完成")
            for value, label in [("recycle", "15-研究所-回收"), ("upgrade", "16-研究所-升级")]:
                clean(page, "lab")
                act(page, "pc-lab", value)
                if value == "recycle":
                    for pet_id in ("old1", "tu2"):
                        act(page, "pc-choose", "recycle|" + pet_id)
                capture(page, label)
            clean(page, "orders")
            act(page, "pc-choose", "lantern|tu3")
            act(page, "pc-deliver", "lantern|tu3")
            navigate(page, "guest")
            assert page.locator(".pc-guest-actions button:disabled").count() == 1
            capture(page, "17-特殊来客-无匹配")
    build_board(shots)


if __name__ == "__main__":
    main()
