"""Exercise the short-screen layout, crossbreeding and Beijing-day registration boundaries."""
from datetime import datetime
from pathlib import Path
from playwright.sync_api import expect, sync_playwright

ROOT=Path(__file__).resolve().parents[2]


def check_races(p,url,trial):
    clock=lambda s:datetime.fromisoformat('2026-11-'+s+'+08:00')
    p.clock.install(time=clock('16T23:59:40'))
    p.add_init_script(path=Path(__file__).with_name('test_unlocked_shop.js'))
    p.goto(url+('#firstday' if trial else '#home'))
    p.click('[data-shop-door=show]')
    expect(p.locator('[data-dot=tab-tab][data-key=private]')).to_have_class('btn primary')
    expect(p.locator('#screen')).to_contain_text('开店第 2 天开放')
    expect(p.locator('[data-dot=race-list]')).to_be_disabled()
    p.click('[data-dot=tab-tab][data-key=public]')
    expect(p.locator('#screen')).to_contain_text('开店第 3 天开放')
    p.clock.set_system_time(clock('17T00:00:00'))
    p.click('[data-dot=tab-tab][data-key=private]')
    expect(p.locator('[data-dot=race-list]')).to_be_enabled()
    p.click('[data-dot=race-list]')
    p.locator('[data-dot=race-pick]').first.click()
    p.clock.set_system_time(clock('17T18:00:00'))
    p.click('[data-dot=race-submit]')
    expect(p.locator('#rb-notice')).to_contain_text('不在报名时段')
    assert p.evaluate('previewRace.shop().coins')==680
    p.clock.set_system_time(clock('17T20:00:00'))
    p.click('[data-dot=tab-tab][data-key=private]')
    p.click('[data-dot=race-list]')
    p.locator('[data-dot=race-pick]').first.click()
    p.click('[data-dot=race-submit]')
    expect(p.locator('[data-dot=race-record]')).to_be_visible()
    assert p.evaluate('previewRace.shop().coins')==660
    p.reload()
    p.click('[data-dot=tab-tab][data-key=private]')
    expect(p.locator('[data-dot=race-record]')).to_be_visible()
    assert p.evaluate('Object.keys(previewRace.shop().raceEntries).length')==1
    p.clock.set_system_time(clock('18T00:00:00'))
    p.click('[data-dot=tab-tab][data-key=public]')
    expect(p.locator('[data-dot=race-list]')).to_be_enabled()
    p.click('[data-dot=race-list]')
    p.locator('[data-dot=race-pick]').first.click()
    p.click('[data-dot=race-submit]')
    assert p.evaluate('previewRace.shop().coins')==660
    assert p.evaluate('Object.keys(previewRace.shop().raceEntries).length')==2
    p.clock.set_system_time(clock('20T18:00:00'))
    assert '不在报名时段' in p.evaluate("previewRace.status('public').reason")


def check_pair(p,url,trial):
    p.clock.install()
    p.goto(url+('#rabbitroom' if trial else '#rooms'))
    if trial:
        p.click('[data-rabbit=mode][data-val=sample]')
        p.click('[data-rabbit=breed]')
        ids=p.evaluate("""()=>{const a=RabbitDemo.read().animals.filter(p=>p.canBreed);
          const mother=a.find(p=>p.sex==='母'&&a.some(q=>q.sex==='公'&&p.breedKey!==q.breedKey));
          return [mother.id,a.find(q=>q.sex==='公'&&mother.breedKey!==q.breedKey).id];}""")
        for id in ids:p.click(f'[data-rabbit=parent][data-val="{id}"]')
        p.click('[data-rabbit=review-breed]')
        expect(p.locator('#rb-dialog')).to_contain_text('预计登记品种：杂交')
        expect(p.locator('#rb-dialog')).to_contain_text('独立随机')
        p.click('[data-rabbit=commit-breed]')
        p.click('[data-rabbit=advance]')
        p.locator('[data-rabbit=keep]').first.wait_for()
        assert p.evaluate("""()=>{const s=RabbitDemo.read(),ids=s.litter.ids,parents=s.animals.filter(p=>[s.litter.motherId,s.litter.fatherId].includes(p.id));
          return ids.length>=3&&ids.every(id=>s.animals.some(p=>p.id===id&&p.breed==='杂交'&&parents.some(q=>q.breedKey===p.breedKey)));}""")
    else:
        p.click('[data-species="猫"]')
        assert p.locator('.rb-ground').evaluate("e=>e.getAttribute('src')===A['unfinished-room']")
        p.evaluate("saleState.coins=4000")
        p.click('[data-dot=pack]')
        p.click('[data-dot=pack-commit]')
        assert p.locator('.rb-ground').evaluate("e=>e.getAttribute('src')===A['cat-room']")
        p.evaluate("saleState.stock.get('lan').stage='成年'")
        p.click('[data-go=roombreed]')
        for id in ('yun','lan'):p.click(f'[data-pair=pick][data-key={id}]')
        p.click('[data-pair=review]')
        expect(p.locator('#dot-flow-dialog')).to_contain_text('杂交')
        expect(p.locator('#dot-flow-dialog')).to_contain_text('独立随机')
        p.click('[data-pair=commit]')
        p.clock.fast_forward(420_000)
        expect(p.locator('#screen')).to_contain_text('登记品种：杂交')
        count=p.locator('.rb-row[data-sale=profile]').count()
        assert 2<=count<=4
        p.locator('.rb-row[data-sale=profile]').first.click()
        expect(p.locator('#screen')).to_contain_text('外形：')
        assert p.evaluate("['波斯猫','英国短毛猫'].includes(saleState.stock.get(saleState.profileId).appearance)")


def check_layout(p,url):
    p.add_init_script(path=Path(__file__).with_name('test_unlocked_shop.js'))
    p.goto(url)
    menu=p.locator('#jump option').evaluate_all('o=>o.map(el=>el.value)')
    routes=p.evaluate('Object.keys(pages)')
    for route in routes:
        if route in menu:p.select_option('#jump',route)
        else:p.evaluate("k=>show(k,false,'jump',k==='orderfulfill'?{channel:'neighbors'}:{})",route)
        box=p.evaluate("""()=>{const phone=document.querySelector('.phone'),paper=document.querySelector('.phone>.scroll'),r=phone.getBoundingClientRect();
          return [r.top,r.bottom,innerHeight,document.documentElement.scrollHeight,document.documentElement.scrollWidth,innerWidth,
            getComputedStyle(paper).overflowY,!!document.querySelector('.preview-list'),!!document.querySelector('.phone.in-shop')];}""")
        assert box[0]>=0 and box[1]<=box[2]+1 and box[3]<=box[2]+1 and box[4]<=box[5]+1 and box[6]=='hidden' and (box[7] or box[8]),(route,box)
        for button in p.locator('.preview-actions button:visible').all():
            b=button.bounding_box()
            assert b['y']>=0 and b['y']+b['height']<=box[2]+1,(route,b)
    for route in ('profile','rabbitpet'):
        p.select_option('#jump',route)
        card=p.locator('.animal-card')
        expect(card.locator('.animal-traits>div')).to_have_count(6)
        left=card.locator('.animal-identity').bounding_box()
        right=card.locator('.animal-traits').bounding_box()
        assert right['x']>=left['x']+left['width'] and abs(left['y']-right['y'])<2
        assert card.bounding_box()['y']+card.bounding_box()['height']<=p.viewport_size['height']
    p.select_option('#jump','items')
    for item,copy in [('review','最多用 3 张'),('guide','80%')]:
        p.click(f'[data-dot=service][data-key={item}]')
        expect(p.locator('.df-body')).to_contain_text(copy)
        p.locator('.df-foot button').click()
    return len(routes)


if __name__=='__main__':
    with sync_playwright() as pw,pw.chromium.launch(channel='msedge') as browser:
        for folder,w,h in [('手机预览/dist/ui-v3',320,568),('美术确认稿/UI整体演示-v3',390,844)]:
            for check,args in [(check_races,[False]),(check_races,[True]),(check_pair,[False]),(check_pair,[True]),(check_layout,[])]:
                p=browser.new_page(viewport={'width':w,'height':h},is_mobile=True,has_touch=True)
                errors=[]
                p.on('pageerror',lambda err:errors.append(str(err)))
                p.set_default_timeout(6000)
                count=check(p,(ROOT/folder/'index.html').as_uri(),*args)
                assert not errors,errors
                print(w,check.__name__,args,count or '', 'PASS',flush=True)
                p.close()
