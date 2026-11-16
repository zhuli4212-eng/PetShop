"""Check the two preview clocks through their real breeding and navigation buttons."""
from pathlib import Path
import re
from playwright.sync_api import expect, sync_playwright

ROOT = Path(__file__).resolve().parents[2]


def check(page, url, trial):
    page.clock.install()
    page.goto(url + ('#rabbitbreed' if trial else '#roombreed'))
    if trial:
        page.evaluate("RabbitDemo.claim(); for(const p of RabbitDemo.read().animals)RabbitDemo.setSeedMark(p.id,true);show(displayedPage,true)")
        parents = page.locator('[data-rabbit=parent]')
        parents.nth(0).click()
        parents.nth(1).click()
        page.click('[data-rabbit=review-breed]')
        page.click('[data-rabbit=commit-breed]')
        assert page.evaluate("RabbitDemo.read().animals.every(p=>p.seedMarked)")
    else:
        # The sale sample starts with two young rabbits and two spent founders.
        page.evaluate("for(const id of ['mo','tuan'])Object.assign(saleState.stock.get(id),{stage:'成年',seedMarked:true});saleState.stock.get('yun').seedMarked=true;show(displayedPage,true)")
        for key in ['mo','tuan']:
            page.click('[data-pair=pick][data-key='+key+']')
        page.click('[data-pair=review]')
        page.click('[data-pair=commit]')
        assert page.evaluate("['mo','tuan','yun'].every(id=>saleState.stock.get(id).seedMarked)")
    selector = '[data-rabbit-timer]' if trial else '[data-example-breed-timer]'
    timer = page.locator(selector)
    expect(timer).to_be_visible()
    timer.evaluate('e=>window.originalTimer=e')
    values = []
    for i in range(3):
        value = timer.inner_text()
        minute, second = map(int,re.fullmatch(r'(\d+) 分 (\d\d) 秒',value).groups())
        values.append(minute*60+second)
        if i<2:
            page.wait_for_function('([s,v])=>document.querySelector(s).textContent!==v',arg=[selector,value])
    assert values[0]-1==values[1]==values[2]+1 and 115<=values[0]<=120,values
    assert timer.evaluate('e=>e===window.originalTimer')

    page.click('[data-rabbit=room]' if trial else '[data-go=rooms]')
    assert page.evaluate("displayedPage==='rooms'")
    page.clock.fast_forward(65_000)
    assert page.evaluate("displayedPage==='rooms'")
    page.click('[data-rabbit=breed]' if trial else '[data-go=roombreed]')
    expect(timer).to_have_text(re.compile(r'0 分 [45]\d 秒'))

    if trial:
        # The first-day model persists this litter, including its original deadline.
        page.reload()
        expect(timer).to_have_text(re.compile(r'0 分 [45]\d 秒'))
        if page.viewport_size['width']==320:
            page.click('[data-rabbit=room]')
            page.locator('.rb-row[data-rabbit=pet][data-val=r1]').click()
            expect(page.locator('.rb-portrait .seed-mark')).to_be_visible()
        page.clock.fast_forward(60_000)
        if page.viewport_size['width']==320:
            expect(page.locator('.rb-portrait .seed-mark')).to_have_count(0)
            expect(page.locator('[data-rabbit=market-pet]')).to_be_visible()
            page.select_option('#jump','rabbitbirth')
        expect(page.locator('[data-rabbit=keep]').first).to_be_visible()
        ids = page.evaluate('RabbitDemo.read().litter.ids')
        page.clock.fast_forward(2_000)
        assert page.evaluate('RabbitDemo.read().animals.filter(p=>p.source==="本店繁育").map(p=>p.id)')==ids
        assert page.evaluate("RabbitDemo.read().animals.filter(p=>p.bred).every(p=>!p.seedMarked&&RabbitDemo.eligible('market',p))")
        assert page.evaluate("RabbitDemo.read().animals.filter(p=>p.source==='每日签到').every(p=>p.seedMarked)")
    else:
        # Check both expiry on the progress card and expiry while inspecting an animal.
        elsewhere = page.viewport_size['width']==320
        if elsewhere:
            page.click('[data-go=rooms]')
            page.locator('[data-sale=profile][data-key=mo]').last.click()
        page.clock.set_system_time(page.evaluate('Date.now()+60000'))
        page.evaluate("window.dispatchEvent(new Event('pageshow'))")
        if elsewhere:
            assert page.evaluate("displayedPage==='profile'")
            expect(page.locator('.pethead .seed-mark')).to_have_count(0)
            expect(page.locator('[data-dot=profile-sale]')).to_be_visible()
            page.click('#back')
            page.click('[data-go=roombreed]')
        expect(page.locator('#screen')).to_contain_text('这窝已完成培育')
        assert page.evaluate("['mo','tuan'].every(id=>saleState.stock.get(id).bred&&saleEligible(saleState.stock.get(id),'market'))")
        assert page.evaluate("saleState.stock.get('yun').seedMarked")
        assert page.evaluate("RabbitDemo.read().litter===null")
        page.click('[data-pair=again]')
        expect(page.locator('[data-pair=review]')).to_be_disabled()
    return values


if __name__ == '__main__':
    with sync_playwright() as pw, pw.chromium.launch(channel='msedge') as browser:
        for path,w,h in [('美术确认稿/UI整体演示-v3',390,844),('手机预览/dist/ui-v3',320,568)]:
            for trial in [True,False]:
                page = browser.new_page(viewport={'width':w,'height':h},is_mobile=True,has_touch=True)
                errors = []
                page.on('pageerror',lambda e:errors.append(str(e)))
                page.set_default_timeout(6000)
                values = check(page,(ROOT/path/'index.html').as_uri(),trial)
                assert not errors,errors
                print(w,'trial' if trial else 'demo',values,'PASS',flush=True)
                page.close()
