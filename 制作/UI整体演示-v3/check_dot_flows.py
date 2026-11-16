"""Smoke test the Dot flows in the integrated shop preview across phone widths."""
from pathlib import Path
import sys
from playwright.sync_api import sync_playwright

root = Path(__file__).resolve().parents[2]
default = root / '美术确认稿' / 'UI整体演示-v3' / 'index.html'
preview = (Path(sys.argv[1]) if len(sys.argv) > 1 else default).resolve().as_uri()


def run(page):
    page.add_init_script(path=Path(__file__).with_name('test_unlocked_shop.js'))
    page.goto(preview + '#orders')
    def tap(action, key=None):
        selector = f'button[data-dot="{action}"]'
        if key is not None:
            selector += f'[data-key="{key}"]'
        page.locator(selector).first.tap()
    def menu(page_id):
        page.select_option('#jump', page_id)
    panel = page.locator('#dot-flow-dialog')
    # Free quota, cancel and purchase are three separate, explicit actions.
    tap('cancel', 'neighbors')
    assert '免费次数' in panel.inner_text()
    tap('close')
    assert page.locator('[data-sale=open][data-key=neighbors]').count() == 1
    tap('cancel', 'neighbors')
    tap('cancel-confirm', 'neighbors|free')
    assert page.locator('time[data-df-clock]').count() == 1
    assert page.locator('[data-sale=open][data-key=bookstore]').count() == 1
    assert '免费取消 2 / 3' in page.locator('#screen').inner_text()
    menu('cancelshop')
    tap('buy-review')
    tap('buy')
    assert page.locator('.wallet').inner_text() == '金币 380'
    assert not panel.is_visible() and page.url.endswith('#orders')
    assert '免费取消 2 / 3' in page.locator('#screen').inner_text()
    for oid in ['bookstore','lookout']:
        tap('cancel', oid)
        tap('cancel-confirm', oid + '|free')
    # A paid cancellation after 30 minutes must explicitly quote the paid quota.
    page.clock.install()
    page.clock.fast_forward(30*60*1000 + 1200)
    tap('cancel', 'neighbors')
    assert '确认消耗 1 次已购次数' in panel.inner_text()
    tap('cancel-confirm','neighbors|paid')
    assert page.locator('time[data-df-clock]').count()==1
    tap('ledger')
    tap('unknown')
    assert '待确认' in panel.inner_text()
    tap('query')
    assert '原请求未成交' in panel.inner_text()
    tap('close')
    menu('profile')
    assert '已繁育动物估值' in page.locator('#screen').inner_text()
    tap('profile-sale','hua')
    assert page.locator('[data-sale-pet=hua]').is_checked()
    menu('rooms')
    page.locator('[data-species="猫"]').tap()
    tap('pack','cat')
    assert '还差' in panel.inner_text()
    tap('close')
    # Use a sufficient-balance fixture to exercise atomic room + pair display.
    page.evaluate('saleState.coins=3400')
    tap('pack','cat')
    tap('pack-commit','cat')
    assert '猫房已开放' in page.locator('#rb-notice').inner_text() and not panel.is_visible()
    assert page.locator('.rb-list [data-sale=profile][data-key^=pack-cat-]').count()==2
    assert page.locator('.wallet').inner_text()=='金币 400'
    menu('show')
    tap('entry')
    assert '毛发' in panel.inner_text() and '报名时快照' in panel.inner_text()
    tap('close')
    menu('result')
    tap('tier','silver')
    assert '银奖名单' in page.locator('#screen').inner_text()
    page.locator('.df-demo summary').tap()
    tap('list','pending')
    assert '等待公布' in page.locator('#screen').inner_text()
    tap('list','empty')
    assert '银奖暂无获奖者' in page.locator('#screen').inner_text()
    tap('list','notjoined')
    assert '未报名本期' in page.locator('#screen').inner_text()
    tap('list','outside')
    assert '未获此档' in page.locator('#screen').inner_text()
    menu('collection')
    tap('history')
    assert '首获动物' in panel.inner_text() and '2 次' in panel.inner_text()
    tap('close')
    tap('book-tier','laurel')
    assert '尚未收藏' in page.locator('#screen').inner_text()
    assert not page.evaluate('document.documentElement.scrollWidth > innerWidth')


if __name__ == '__main__':
    with sync_playwright() as pw, pw.chromium.launch(channel='msedge') as browser:
        for width, height in [(320,667),(390,844)]:
            page=browser.new_page(viewport={'width':width,'height':height},is_mobile=True,has_touch=True)
            errors=[]
            page.on('pageerror',lambda error: errors.append(str(error)))
            run(page)
            assert not errors,errors
            page.close()
            print(f'{width}×{height} · 订单/回执/解锁/档案/比赛/奖杯通过',flush=True)
