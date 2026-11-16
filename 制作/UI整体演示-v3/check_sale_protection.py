"""Verify protected animals, stale offers and the scrolling sales list in the shipped previews."""
from pathlib import Path
from playwright.sync_api import expect, sync_playwright


ROOT = Path(__file__).resolve().parents[2]


def check_scroll(page, rows, footer, header):
    listing = page.locator('.preview-list')
    first = listing.locator(rows).first
    fixed = [page.locator(selector).first for selector in header + footer]
    before = [el.bounding_box()['y'] for el in fixed]
    first_y = first.bounding_box()['y']
    assert listing.evaluate('el => el.clientHeight >= 48 && el.scrollHeight > el.clientHeight + 50')
    listing.evaluate('el => el.scrollTop = el.scrollHeight')
    assert first.bounding_box()['y'] < first_y - 50
    assert [el.bounding_box()['y'] for el in fixed] == before
    height = page.viewport_size['height']
    assert all(0 <= el.bounding_box()['y'] < height for el in fixed)
    assert page.evaluate("document.querySelector('.phone>.scroll').scrollTop===0")


def example(page, url):
    page.goto(url+'#rooms')
    page.locator('.rb-row[data-sale=profile][data-key=mo]').click()
    page.click('[data-sale=seed]')
    assert not page.locator('[data-dot=profile-sale]').count()
    for route,key in [('market',None),('orders','neighbors'),('guest','guest')]:
        page.select_option('#jump',route)
        if key:
            page.locator(f'[data-sale=open][data-key={key}]').first.click()
        assert page.locator('[data-sale-pet=mo]').count()==0
        expect(page.locator('[data-sale-pet=tuan]')).to_be_visible()
    page.select_option('#jump','rooms')
    page.locator('.rb-row[data-sale=profile][data-key=mo]').click()
    page.click('[data-sale=seed]')
    page.click('[data-dot=profile-sale]')
    page.locator('[data-sale-pet=tuan]').check()
    page.click('[data-sale=review]')
    page.evaluate("saleState.stock.get('mo').seedMarked=true")
    page.click('[data-sale=commit]')
    assert page.evaluate("saleState.coins===680&&['mo','tuan'].every(id=>saleState.stock.has(id))")
    # Populate long lists including live order matches and corpses from each species.
    page.evaluate("""for(let i=0;i<32;i++){
      for(const [prefix,template] of [['young','tuan'],['dead','hui']]){
        const id=prefix+i,base=saleState.stock.get(template);
        saleState.stock.set(id,{...base,id,name:'样例'+i});
      }
    }
    saleState.stock.get('hui').seedMarked=true;
    """)
    for route,key in [('market',None),('orders','neighbors'),('guest','guest'),('lab','recycle')]:
        page.select_option('#jump',route)
        if key:
            page.locator(f'[data-sale=open][data-key={key}]').first.click()
        header=['#pagetitle','.sale-panel .sectionhead']
        if route in ('market','lab'):
            header+=['.banner','[data-sale-species]']
        if route=='lab':
            header+=['.tabs']
            assert not page.locator('[data-sale-pet=hua],[data-sale-pet=hui]').count()
            assert page.locator('[data-sale-pet=su]').count()==1
        check_scroll(page,'.sale-pet',['[data-sale-count]','[data-sale=all]','[data-sale=review]'],header)
        page.click('[data-sale=all]')
        assert page.locator('.sale-pet input:checked').count()==page.locator('.sale-pet').count()
    page.locator('[data-sale-species]').select_option('猫')
    assert page.locator('.sale-pet').count()==1 and not page.locator('.sale-pet input:checked').count()
    page.select_option('#jump','rooms')
    page.select_option('[data-room-filter=group]','已故')
    page.locator('.rb-row[data-key=hui]').click()
    assert not page.locator('[data-dot=profile-sale]').count()
    page.click('[data-sale=seed]')
    page.click('[data-dot=profile-sale]')
    expect(page.locator('[data-sale-pet=hui]')).to_be_checked()
    assert page.evaluate('saleState.channel')=='recycle'


def trial(page,url):
    page.goto(url+'#rabbittrade')
    page.evaluate("RabbitDemo.useSample(true);show(displayedPage,true)")
    page.click('[data-rabbit=channel][data-val=market]')
    check_scroll(page,'[data-rabbit=pick]',['[data-rabbit=all]','[data-rabbit=review-sale]','.rb-dock span'],
                 ['#pagetitle','.rb-heading','.rb-filters'])
    page.click('[data-rabbit=all]')
    page.click('[data-rabbit=review-sale]')
    marked=page.evaluate("RabbitDemo.read().animals.find(p=>p.stage==='幼年').id")
    assert page.evaluate("id=>RabbitDemo.setSeedMark(id,true).ok",marked)
    page.click('[data-rabbit=commit-sale]')
    assert page.evaluate("RabbitDemo.read().coins===680&&RabbitDemo.read().animals.length===20")
    expect(page.locator('#rb-notice')).to_contain_text('取消留种')
    assert not page.locator(f'[data-rabbit=pick][data-val={marked}]').count()
    assert page.evaluate("id=>RabbitDemo.setSeedMark(id,false).ok&&RabbitDemo.quote('market',[id]).ok",marked)
    page.click('[data-rabbit=channel][data-val=recycle]')
    expect(page.locator('[data-rabbit=pick]')).to_have_count(2)
    assert page.evaluate("id=>!RabbitDemo.quote('recycle',[id]).ok",marked)


if __name__=='__main__':
    with sync_playwright() as pw, pw.chromium.launch(channel='msedge') as browser:
        for path,width,height in [('美术确认稿/UI整体演示-v3',390,844),('手机预览/dist/ui-v3',320,568)]:
            for check in (example,trial):
                page=browser.new_page(viewport={'width':width,'height':height},is_mobile=True,has_touch=True)
                errors=[]
                page.on('pageerror',lambda error:errors.append(str(error)))
                page.set_default_timeout(6000)
                page.add_init_script(path=Path(__file__).with_name('test_unlocked_shop.js'))
                check(page,(ROOT/path/'index.html').as_uri())
                assert not errors,errors
                page.close()
                print(width,check.__name__,'PASS',flush=True)
