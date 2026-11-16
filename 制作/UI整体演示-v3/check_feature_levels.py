"""Play from a level-one shop through three sales in each preview inventory."""
from pathlib import Path
from playwright.sync_api import expect, sync_playwright


ROOT=Path(__file__).resolve().parents[2]


def levels(page,level):
    expect(page.locator('.store-progress strong')).to_have_text(f'店铺 {level} 级')
    expected={'orders':2,'lab':2,'guest':3,'show':4,'decor':8}
    for key,threshold in expected.items():
        assert page.locator(f'.scene-target[data-shop-door={key}] .feature-level').count()==int(level<threshold)
    assert page.locator('.home-status [data-go=collection] .feature-level').count()==int(level<4)


def sample(page,url):
    page.goto(url)
    levels(page,1)
    page.click('[data-shop-door=lab]')
    expect(page.locator('#rb-notice')).to_contain_text('2 级')
    assert page.evaluate('displayedPage')=='home'
    page.click('[data-shop-door=rooms]')
    page.select_option('[data-room-filter=group]','已故')
    page.click('[data-go=roomsell]')
    assert page.evaluate('displayedPage')=='rooms'
    page.locator('.rb-row[data-key=hui]').click()
    page.click('[data-dot=profile-sale]')
    assert page.evaluate('displayedPage')=='profile'
    page.click('#back')
    page.click('#back')
    for level,(room,order,pet) in enumerate([('market',None,'hua'),('orders','neighbors','li'),('guest','guest','mo')],2):
        page.click(f'[data-shop-door={room}]')
        if order:
            page.locator(f'[data-sale=open][data-key={order}]').first.click()
        page.locator(f'[data-sale-pet={pet}]').check()
        page.click('[data-sale=review]')
        page.click('[data-sale=commit]')
        expect(page.locator('#rb-notice')).to_contain_text(f'升至 {level} 级')
        page.locator('#sale-review [data-sale=commit]').dispatch_event('click')
        assert page.evaluate('saleState.shopXp')==(level-1)*10+int(level==4)
        page.click('#back')
        levels(page,level)
    # The trophies and contest entrances can have separate thresholds.
    page.evaluate("shopRules.featureLevels.collection=5;show('home',true)")
    assert not page.locator('[data-shop-door=show] .feature-level').count()
    page.locator('.home-status [data-go=collection]').click()
    assert page.evaluate('displayedPage')=='home'
    page.locator('[data-shop-door=show]').click()
    page.locator('#screen [data-go=collection]').first.click()
    assert page.evaluate('displayedPage')=='show'
    page.click('#back')
    page.click('[data-shop-door=lab]')
    page.locator('[data-sale=open][data-key=recycle]').first.click()
    page.locator('[data-sale-pet=hui]').check()
    page.click('[data-sale=review]')
    page.click('[data-sale=commit]')
    assert page.evaluate('saleState.shopXp')==31


def trial(page,url):
    page.goto(url+'#firstday')
    levels(page,1)
    page.click('[data-shop-door=profile]')
    page.click('[data-rabbit=claim]')
    page.click('#back')
    for level,id in enumerate(['r1','r2','r3'],2):
        page.click('[data-shop-door=market]')
        page.click(f'[data-rabbit=pick][data-val={id}]')
        page.click('[data-rabbit=review-sale]')
        page.click('[data-rabbit=commit-sale]')
        expect(page.locator('#rb-notice')).to_contain_text(f'升至 {level} 级')
        page.click('#back')
        levels(page,level)
        page.reload()
        levels(page,level)
    assert page.evaluate('RabbitDemo.read().shopXp')==30
    assert page.evaluate('saleState.shopXp')==0
    # Removing the field reproduces an older trial save. Reload preserves the owned pet and coins.
    previous=page.evaluate("""() => {
      const key='petshop.rabbitroom.v1.shop',data=JSON.parse(localStorage.getItem(key));
      delete data.shopXp;localStorage.setItem(key,JSON.stringify(data));
      return [data.shopId,data.coins,data.animals.map(p=>p.id)];
    }""")
    page.reload()
    levels(page,1)
    assert page.evaluate("""() => {
      const d=JSON.parse(localStorage.getItem('petshop.rabbitroom.v1.shop'));return [d.shopId,d.coins,d.animals.map(p=>p.id)];
    }""")==previous


if __name__=='__main__':
    with sync_playwright() as pw,pw.chromium.launch(channel='msedge') as browser:
        for folder,width,height in [('美术确认稿/UI整体演示-v3',390,844),('手机预览/dist/ui-v3',320,568)]:
            for check in (sample,trial):
                p=browser.new_page(viewport={'width':width,'height':height},has_touch=True,is_mobile=True)
                errors=[]
                p.on('pageerror',lambda exc:errors.append(str(exc)))
                p.set_default_timeout(6000)
                check(p,(ROOT/folder/'index.html').as_uri())
                assert not errors,errors
                p.close()
                print(width,check.__name__,'levels 1-4 PASS',flush=True)
