"""Touch-test the first-day rabbit shop and its separate twenty-rabbit sample."""
import argparse
import re
from pathlib import Path

from playwright.sync_api import expect, sync_playwright


PREVIEW = Path(__file__).resolve().parents[2] / "美术确认稿/UI整体演示-v3/index.html"


def button(page, action, value=None):
    selector = f'button[data-rabbit="{action}"]'
    if value is not None:
        selector += f'[data-val="{value}"]'
    return page.locator(selector)


def assert_layout(page, label, shots=None):
    page.wait_for_function("Array.from(document.querySelectorAll('#screen img')).every(i => i.complete)")
    failed = page.locator("#screen img").evaluate_all("(images) => images.filter(i => !i.naturalWidth).map(i => i.alt)")
    assert not failed, (label, "broken images", failed)
    problems = page.evaluate("""() => {
      const nodes = [document.documentElement, ...document.querySelectorAll(
        '.scroll, .rb-row, .rb-book, .rb-actions, .rb-dock, .rb-age-tabs, #rb-dialog[open]')];
      return nodes.filter(n => n.clientWidth && n.scrollWidth > n.clientWidth + 2)
        .map(n => [n.className || n.nodeName, n.scrollWidth, n.clientWidth]);
    }""")
    assert not problems, (label, "horizontal overflow", problems)
    if shots:
        page.screenshot(path=str(shots / f"{page.viewport_size['width']}-{label}.png"))


def first_day(page, shots):
    page.add_init_script(path=Path(__file__).resolve().parents[1] / 'UI整体演示-v3/test_unlocked_shop.js')
    page.goto(PREVIEW.as_uri() + "#firstday")
    checkin = page.locator('#screen [data-go="rabbitcheckin"]')
    expect(checkin).to_be_visible()
    assert_layout(page, "firstday", shots)
    checkin.tap()
    assert_layout(page, "checkin", shots)
    button(page, "claim").tap()
    expect(page.locator("#screen")).to_contain_text("今日已领取")
    expect(page.locator(".rb-row")).to_have_count(2)
    page.reload()
    expect(button(page, "claim")).to_have_count(0)
    expect(page.locator(".rb-row")).to_have_count(2)

    button(page, "room").tap()
    expect(page.locator(".rb-list .rb-row")).to_have_count(4)
    assert_layout(page, "room", shots)
    first_ids = page.locator(".rb-list .rb-row").evaluate_all("rows => rows.map(r => r.dataset.val)")
    button(page, "breed").tap()
    expect(button(page, "review-breed")).to_be_disabled()
    parents = button(page, "parent")
    expect(parents).to_have_count(2)
    parents.nth(0).tap()
    expect(button(page, "review-breed")).to_be_disabled()
    parents.nth(1).tap()
    assert_layout(page, "breed", shots)
    button(page, "review-breed").tap()
    expect(page.locator("#rb-dialog")).to_contain_text("无法撤回")
    button(page, "commit-breed").tap()
    expect(page.locator("[data-rabbit-timer]")).to_have_text(re.compile(r"\d+ 分 \d{2} 秒"))
    page.reload()
    expect(button(page, "advance")).to_be_visible()
    button(page, "advance").tap()
    keeps = button(page, "keep")
    litter_ids = keeps.evaluate_all("rows => rows.map(r => r.dataset.val)")
    assert len(litter_ids) in (3, 4, 5), litter_ids
    expect(page.locator(".rb-row").filter(has_text="已繁育")).to_have_count(2)
    keep_id = litter_ids[0]
    button(page, "keep", keep_id).tap()
    assert not page.evaluate('id=>RabbitDemo.read().animals.find(p=>p.id===id).seedMarked', keep_id)
    assert_layout(page, "litter", shots)
    button(page, "litter-sale").tap()
    selected = page.locator('.rb-row[data-rabbit="pick"][aria-pressed="true"]')
    assert set(selected.evaluate_all("rows => rows.map(r => r.dataset.val)")) == set(litter_ids[1:])
    button(page, "review-sale").tap()
    breakdown = page.locator("#rb-dialog .rb-quote b").all_text_contents()
    amount = sum(int(re.search(r"\d+", text).group()) for text in breakdown)
    assert len(breakdown) == len(litter_ids) - 1 and amount > 0
    expect(page.locator("#rb-dialog .rb-total")).to_contain_text(str(amount))
    assert_layout(page, "sale-review", shots)
    button(page, "close").tap()
    expect(selected).to_have_count(len(litter_ids) - 1)
    button(page, "review-sale").tap()
    button(page, "commit-sale").tap()
    expect(page.locator("#rb-notice")).to_contain_text(str(amount))
    expect(button(page, "pick")).to_have_count(0)
    page.reload()
    expect(page.locator(".wallet")).to_contain_text(str(680 + amount))
    page.select_option("#jump", "rooms")
    final_ids = page.locator(".rb-list .rb-row").evaluate_all("rows => rows.map(r => r.dataset.val)")
    assert set(final_ids) == set(first_ids + [keep_id]), final_ids
    expect(page.locator(f'.rb-row[data-val="{keep_id}"] .seed-mark')).to_have_text('种源')
    return set(final_ids), 680 + amount


def test_sample(page, owned_ids, coins, shots):
    button(page, "mode", "sample").tap()
    expect(page.locator(".rb-heading")).to_contain_text("20 只登记")
    live = page.locator(".rb-list .rb-row").count()
    page.locator("[data-room-filter=group]").select_option("已故")
    dead = page.locator(".rb-list .rb-row").count()
    assert live + dead == 20 and dead > 0
    page.locator("[data-room-filter=group]").select_option("后备种源")
    page.locator("[data-room-filter=sex]").select_option("母")
    seed_rows = page.locator(".rb-list .rb-row").all_text_contents()
    assert seed_rows and all("母 ·" in text and "未繁育" in text for text in seed_rows)
    assert_layout(page, "roster-female-seed", shots)

    button(page, "channel", "market").tap()
    page.locator("[data-trade-filter=sex]").select_option("公")
    button(page, "all").tap()
    count = button(page, "pick").count()
    assert count > 0
    expect(page.locator('.rb-row[aria-pressed="true"]')).to_have_count(count)
    page.locator("[data-trade-filter=sex]").select_option("母")
    expect(button(page, "review-sale")).to_be_disabled()
    expect(page.locator('.rb-row[aria-pressed="true"]')).to_have_count(0)
    button(page, "all").tap()
    button(page, "review-sale").tap()
    expect(page.locator("#rb-dialog .rb-warning")).to_contain_text("母")
    button(page, "close").tap()
    button(page, "clear").tap()
    expect(button(page, "review-sale")).to_be_disabled()
    page.select_option("#jump", "rooms")
    button(page, "mode", "shop").tap()
    expect(page.locator(".wallet")).to_contain_text(str(coins))
    assert set(page.locator(".rb-list .rb-row").evaluate_all("rows => rows.map(r => r.dataset.val)")) == owned_ids
    button(page, "stages").tap()
    for i, stage in enumerate(("幼年", "成长", "成年", "老年", "已故")):
        button(page, "stage", str(i)).tap()
        expect(page.locator(".rb-plate img")).to_have_attribute("alt", f"黑白花斑 · {stage}")
        assert_layout(page, f"stage-{i}", shots if i == 4 else None)
    button(page, "room").tap()
    expect(page.locator(".rb-heading")).to_contain_text("兔房名册")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--screenshots", type=Path, help="Optional evidence directory")
    args = parser.parse_args()
    if args.screenshots:
        args.screenshots.mkdir(parents=True, exist_ok=True)
    with sync_playwright() as pw, pw.chromium.launch(channel="msedge") as browser:
        for width, height in ((320, 667), (390, 844)):
            context = browser.new_context(viewport={"width": width, "height": height}, has_touch=True, is_mobile=True)
            page = context.new_page()
            errors = []
            page.on("pageerror", lambda error: errors.append(str(error)))
            owned, coins = first_day(page, args.screenshots)
            test_sample(page, owned, coins, args.screenshots)
            assert not errors, errors
            print(f"{width}×{height}: first day, twenty-rabbit roster, sale, refresh and all 5 stages passed.", flush=True)
            context.close()


if __name__ == "__main__":
    main()
