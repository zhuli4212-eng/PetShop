"""Exercise the shared example inventory through the mobile selling screens."""
from pathlib import Path
from playwright.sync_api import sync_playwright


PREVIEW = (Path(__file__).resolve().parents[2] / '美术确认稿/UI整体演示-v3/index.html').as_uri()
SCENARIOS = [
    ('market', None, ('hua', 'li'), (28, 20)),
    ('orders', 'neighbors', ('mo', 'tuan'), (151, 155)),
    ('orders', 'bookstore', ('mo', 'tuan'), (174, 178)),
    ('guest', 'guest', ('mo', 'tuan'), (241, 247)),
    ('lab', 'recycle', ('hui', 'su'), (6, 90)),
]


def verify_sale(page, route, opener, ids, prices):
    page.add_init_script(path=Path(__file__).with_name('test_unlocked_shop.js'))
    page.goto(PREVIEW + '#' + route)
    if opener:
        page.locator(f'[data-sale=open][data-key="{opener}"]').first.click()
    if opener == 'recycle':
        assert page.locator('[data-sale-pet]').count() == 2
    if route == 'guest':
        assert page.locator('[data-sale-pet]').count() == 2
    if route != 'lab':
        assert page.locator('[data-sale-pet=hui]').count() == 0
    assert page.locator('[data-sale-pet=spring]').count() == 0
    checks = [page.locator(f'[data-sale-pet="{id}"]') for id in ids]
    review = page.locator('[data-sale=review]')
    assert review.is_disabled()
    for checkbox in checks:
        checkbox.check()
    checks[0].uncheck()
    assert page.locator('[data-sale-count]').inner_text() == f'已选 1 只 · {prices[1]} 金币'
    checks[0].check()
    total = sum(prices)
    assert page.locator('[data-sale-count]').inner_text() == f'已选 2 只 · {total} 金币'
    review.click()
    modal = page.locator('#sale-review')
    assert sorted(modal.locator('.sale-lines b').all_text_contents()) == sorted(f'{v} 金币' for v in prices)
    assert modal.locator('.sale-total').inner_text() == f'合计 {total} 金币'
    if 'mo' in ids:
        assert '兔房的母种源、兔房的公种源' in modal.locator('.sale-warning').inner_text()
    else:
        assert modal.locator('.sale-warning').is_hidden()
    modal.locator('[data-sale=edit]').click()
    assert all(checkbox.is_checked() for checkbox in checks)
    assert page.locator('.wallet').inner_text() == '金币 680'
    review.click()
    modal.locator('[data-sale=commit]').click()
    # A repeated commit after the receipt was rendered must not pay twice.
    modal.locator('[data-sale=commit]').dispatch_event('click')
    assert page.locator('.wallet').inner_text() == f'金币 {680 + total}'
    assert '2 只' in page.locator('#rb-notice').inner_text()
    assert not modal.is_visible()
    if route == 'orders':
        other = 'neighbors' if opener == 'bookstore' else 'bookstore'
        assert page.locator(f'[data-sale=open][data-key="{other}"]').is_visible()
        assert page.locator(f'[data-sale=open][data-key="{opener}"]').count() == 0
    if route == 'guest':
        assert '已经离店' in page.locator('#screen').inner_text()
    page.select_option('#jump', 'lab')
    page.locator('[data-sale=open][data-key=recycle]').first.click()
    for id in ids:
        assert page.locator(f'[data-sale-pet="{id}"]').count() == 0
    assert page.locator('[data-sale-pet]').count() == (0 if route=='lab' else 2)
    page.select_option('#jump', 'rooms')
    for id in ids:
        assert page.locator(f'[data-sale=profile][data-key="{id}"]').count() == 0
    assert not page.evaluate('document.documentElement.scrollWidth > innerWidth')


if __name__ == '__main__':
    with sync_playwright() as pw, pw.chromium.launch(channel='msedge') as browser:
        for width, height in [(320, 667), (390, 844)]:
            for scenario in SCENARIOS:
                page = browser.new_page(viewport={'width': width, 'height': height}, is_mobile=True, has_touch=True)
                errors = []
                page.on('pageerror', lambda err: errors.append(str(err)))
                verify_sale(page, *scenario)
                assert not errors, errors
                page.close()
            print(f'{width}×{height} · {len(SCENARIOS)} sale paths verified', flush=True)
