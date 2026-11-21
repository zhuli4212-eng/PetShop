import functools,threading
from http.server import ThreadingHTTPServer,SimpleHTTPRequestHandler
from pathlib import Path
from playwright.sync_api import sync_playwright

OUT=Path(__file__).resolve().parent
try:
    with sync_playwright() as p:
        browser=p.chromium.launch(channel='msedge',args=['--use-angle=swiftshader'])
        try:
            for base,width,height in [('https://www.petshop-trial.fun/petshop/',390,844),('https://play.zhu-li-4212.xyz/petshop/',390,844),('https://petshop-trial.pages.dev/',1280,900)]:
                ctx=browser.new_context(viewport={'width':width,'height':height},is_mobile=True,has_touch=True)
                page=ctx.new_page();errors=[];requests=[]
                page.on('pageerror',lambda e:errors.append(str(e)))
                page.on('request',lambda r:requests.append(r.url))
                page.goto(base+'?login',wait_until='domcontentloaded',timeout=60000)
                page.locator('#anonymous:not([hidden])').wait_for(timeout=90000)
                bg=page.locator('.shopfront').bounding_box()
                target_w=390 if width>=641 else min(width,430);target_h=min(height,844) if width>=641 else height
                assert bg and abs(bg['width']-target_w)<.1 and abs(bg['height']-target_h)<.1,bg
                assert abs(bg['x']-(width-target_w)/2)<.1 and abs(bg['y']-(height-target_h)/2)<.1,bg
                assert 'wide' not in page.locator('.shopfront').evaluate('(n)=>n.currentSrc')
                assert page.locator('#heading').inner_text()=='店主登录'
                page.screenshot(path=str(OUT/f'live-login-{base.split("/")[2]}-{width}.png'))
                count=len(requests)
                page.locator('#register-tab').tap();page.wait_for_function("document.querySelector('#heading').textContent==='注册店主'")
                page.wait_for_timeout(300)
                page.locator('#login-tab').tap();page.wait_for_function("document.querySelector('#heading').textContent==='店主登录'")
                page.wait_for_timeout(300)
                assert len(requests)==count,(count,len(requests))
                assert not any(url.endswith(('.woff2','.ttf','.woff')) for url in requests)
                assert not errors,errors
                assert not any('shopfront-wide' in url for url in requests)
                print(f'{base} {width}x{height}: public login matches game portrait frame, fills frame with portrait art, login/register switch without new resources or fonts passed.',flush=True)
                ctx.close()
        finally:browser.close()
finally:pass
