"""Exercise touch scrolling, room unlock and manual seed marks on the current local previews."""
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[2]


def swipe(page, session, locator):
    box = page.locator(locator).bounding_box()
    x, y, d = box['x'] + box['width'] * .8, box['y'] + box['height'] * .82, min(box['height'] * .62, 170)
    def event(kind, pts):
        session.send('Input.dispatchTouchEvent', {'type': kind, 'touchPoints': pts})
    event('touchStart', [{'x': x, 'y': y}])
    for i in range(1, 9):
        event('touchMove', [{'x': x, 'y': y - d * i / 8}])
        page.wait_for_timeout(25)
    event('touchEnd', [])
    page.wait_for_timeout(320)


def verify(page, url):
    page.goto(url + '#rabbitroom')
    assert page.url.endswith('#rooms')
    assert page.locator('.room-doors button').count() == 3
    assert page.locator('[data-room-filter]').count() == 2
    page.locator('[data-rabbit=mode][data-val=sample]').click()
    page.locator('.preview-list').evaluate('(el)=>el.scrollTop=0')
    session = page.context.new_cdp_session(page)
    y = page.locator('.rb-room-scene').bounding_box()['y']
    box = page.locator('.rb-room-scene').bounding_box()
    assert abs(box['height'] - box['width'] * 9 / 16) < 2
    list_height = page.locator('.preview-list').bounding_box()['height']
    swipe(page, session, '.rb-room-scene')
    assert page.locator('.preview-list').evaluate('(el)=>el.scrollTop') == 0
    swipe(page, session, '.preview-list')
    assert page.locator('.preview-list').evaluate('(el)=>el.scrollTop') > 15
    assert page.locator('.rb-room-scene').bounding_box()['y'] == y
    assert list_height >= 130
    residents=page.locator('.rb-resident').evaluate_all('els=>els.map(e=>e.dataset.val)')
    page.get_by_role('combobox', name='状态筛选').select_option('后备种源')
    page.get_by_role('combobox', name='性别筛选').select_option('母')
    matches=page.locator('.rb-row[data-rabbit=pet]').all_text_contents()
    assert matches and all('母 ·' in line and '未繁育' in line for line in matches)
    assert page.locator('.rb-resident').evaluate_all('els=>els.map(e=>e.dataset.val)') == residents
    row = page.locator('.rb-row[data-rabbit=pet]').last
    pet_id = row.get_attribute('data-val')
    row.scroll_into_view_if_needed()
    offset=page.locator('.preview-list').evaluate('el=>el.scrollTop')
    row.click()
    assert not page.get_by_text('同房名册', exact=True).count()
    page.get_by_role('button', name='留种', exact=True).click()
    assert page.locator('.rb-portrait .seed-mark').inner_text() == '种源'
    toast=page.locator('#rb-notice')
    top=page.locator('.phone .top').bounding_box()
    assert toast.is_visible() and 0 <= toast.bounding_box()['y']-(top['y']+top['height']) <= 10
    assert toast.evaluate("el=>getComputedStyle(el).pointerEvents")=='none'
    page.locator('#back').click()
    assert page.get_by_role('combobox', name='状态筛选').input_value() == '后备种源'
    assert page.get_by_role('combobox', name='性别筛选').input_value() == '母'
    assert abs(page.locator('.preview-list').evaluate('el=>el.scrollTop') - offset) <= 1
    assert page.locator(f'.rb-row[data-val="{pet_id}"] .seed-mark').count() == 1
    page.locator(f'.rb-row[data-val="{pet_id}"]').click()
    page.get_by_role('button', name='取消留种', exact=True).click()
    assert not page.locator('.seed-mark').count()
    page.locator('#back').click()
    page.locator('[data-room-filter=sex]').select_option('全部')
    page.locator('[data-room-filter=group]').select_option('已故')
    assert page.locator('.rb-resident small').count() > 0
    page.locator('.rb-row[data-rabbit=pet]').first.click()
    assert not page.locator('[data-rabbit=seed]').count()
    page.locator('#back').click()
    page.locator('[data-rabbit=mode][data-val=shop]').click()
    page.locator('.rb-row[data-rabbit=pet]').first.click()
    active = page.locator('[data-rabbit=seed]').get_attribute('data-val')
    page.get_by_role('button', name='留种', exact=True).click()
    page.reload()
    assert page.evaluate('id=>RabbitDemo.read().animals.find(p=>p.id===id).seedMarked', active)
    page.select_option('#jump', 'rooms')
    assert not page.locator('[data-dot=pack]').count()
    assert page.locator('button[data-species] .room-lock').count() == 2
    for species,key in [('狗','dog'), ('猫','cat')]:
        page.locator(f'[data-species="{species}"]').click()
        assert not page.locator('.rb-resident,[data-sale=profile]').count()
        assert page.locator(f'.preview-list [data-dot=pack][data-key={key}]').count() == 1
    page.evaluate('saleState.coins=3500')
    page.locator('[data-dot=pack]').click()
    page.locator('[data-dot=pack-commit]').click()
    assert not page.locator('#dot-flow-dialog').is_visible()
    assert page.locator('.wallet').inner_text() == '金币 500'
    assert not page.locator('[data-dot=pack]').count()
    assert page.locator('[data-species="猫"] .room-lock').count() == 0
    assert page.locator('[data-species="狗"] .room-lock').count() == 1
    page.locator('.rb-row[data-sale=profile][data-key=pack-cat-0]').click()
    page.locator('[data-sale=seed]').click()
    page.locator('#back').click()
    assert page.locator('[data-key=pack-cat-0] .seed-mark').count() == 1
    page.locator('[data-room-filter=group]').select_option('后备种源')
    page.locator('[data-room-filter=sex]').select_option('母')
    assert page.locator('.rb-list .rb-row').count() == 2
    page.get_by_role('button', name='挑选出售').click()
    assert page.locator('.sale-pet').count() == 3
    assert not page.locator('[data-sale-pet=pack-cat-0]').count()
    assert all('猫' in row for row in page.locator('.sale-pet').all_text_contents())
    page.locator('#back').click()
    assert page.locator('[data-room-filter=sex]').input_value() == '母'
    page.select_option('#jump','market')
    assert page.locator('.trade-view > .banner').count() == 1
    assert page.locator('.preview-list .sale-pet').count()
    return list_height


if __name__ == '__main__':
    with sync_playwright() as pw, pw.chromium.launch(channel='msedge') as browser:
        for width,height,path in [(390,844,'美术确认稿/UI整体演示-v3'),(320,568,'手机预览/dist/ui-v3')]:
            page=browser.new_page(viewport={'width': width,'height': height},has_touch=True,is_mobile=True)
            errors=[]
            page.on('pageerror', lambda exc: errors.append(str(exc)))
            n=verify(page,(ROOT/path/'index.html').as_uri())
            assert not errors,errors
            print(f'{width} x {height}: list={n:g}px, touch, marks, locked rooms and purchase passed',flush=True)
            page.close()
