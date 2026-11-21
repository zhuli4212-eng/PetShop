"""Open the full-test package and submit both new show modes in isolated local saves."""
import argparse
import json
from pathlib import Path
import runpy
import subprocess
from tempfile import TemporaryDirectory
from playwright.sync_api import sync_playwright

PROJECT=Path(__file__).resolve().parents[1]
qa=runpy.run_path(str(PROJECT/'tools/check-breeding-filters-items.py'))
SERVER="""
import {createLocalTestServer} from './tools/local-test/server.mjs';
const [web,save]=process.argv.slice(1);
createLocalTestServer(web,save).listen(0,'127.0.0.1',function(){console.log(this.address().port);});
"""

def check(browser,package,width,output):
    with TemporaryDirectory(prefix='petshop-new-shows-') as save:
        runtime=package/'PetShop'
        process=subprocess.Popen(['node','--input-type=module','-e',SERVER,str(runtime/'build/web-mobile'),save],
            cwd=runtime,stdout=subprocess.PIPE,text=True,encoding='utf-8',creationflags=getattr(subprocess,'CREATE_NO_WINDOW',0))
        ctx=browser.new_context(viewport={'width':width,'height':568 if width==320 else 844},is_mobile=True,
                                has_touch=True,device_scale_factor=1,reduced_motion='reduce')
        page=ctx.new_page();errors=[]
        page.on('pageerror',lambda e:errors.append(str(e)))
        state=lambda:json.loads((Path(save)/'shop.json').read_text(encoding='utf-8'))
        try:
            url='http://127.0.0.1:'+process.stdout.readline().strip()+'/'
            page.goto(url)
            page.locator('.intro-skip').wait_for(state='visible',timeout=90000)
            page.locator('.intro-skip').tap()
            page.locator('#enter-shop').tap()
            page.wait_for_function("window.cc?.director.getScene()?.getChildByName('Canvas')?.getComponent('ShopMain')?.home?.active",timeout=90000)
            page.evaluate(qa['shared']['LOCATORS']);touch=qa['Controls'](page)
            page.wait_for_timeout(200)
            if page.evaluate("!!pairQA.title('稍后')"):touch.tap(text='稍后',scope=None)
            snapshot=page.request.get(url+'api/shop').json()
            assert all(v['unlocked'] for v in snapshot['featureAccess'].values())
            assert all(state()['rooms'][key] for key in ['rabbit','cat','dog'])
            touch.tap('Hotspot_show',scope=None);touch.wait("pairQA.ready()&&pairQA.visit()?.key==='show'")
            assert page.evaluate('pairQA.visit().data.visual.scoringVersion')==2
            touch.tap('ContestTab1')
            if output:page.screenshot(path=str(output/f'私人赛-实际-{width}.png'))
            touch.tap(text='3项考核');touch.wait("pairQA.visit().key==='show.round'")
            assert '328' in json.dumps(page.evaluate('pairQA.visit().data.rows'),ensure_ascii=False)
            title=page.evaluate("pairQA.visit().data.rows.find(r=>r.animal).title")
            touch.tap(text=title);touch.wait("pairQA.visit().key==='show.review'")
            touch.tap(text='提交报名');touch.tap('Accept',scope='Confirm');touch.wait("pairQA.visit().key==='show.result'")
            private=state()['show']['entries']['private-0']
            assert private['theme']['rules']['attributes'] and len(private['theme']['rules']['attributes'])==3
            touch.tap('Back');touch.wait("pairQA.visit().key==='show'")
            touch.tap('ContestTab0')
            if output:page.screenshot(path=str(output/f'公开赛-实际-{width}.png'))
            touch.tap('Row0');touch.wait("pairQA.visit().key==='show.round'")
            assert '临时参数' in json.dumps(page.evaluate('pairQA.visit().data.rows'),ensure_ascii=False)
            title=page.evaluate("pairQA.visit().data.rows.find(r=>r.animal).title")
            touch.tap(text=title);touch.wait("pairQA.visit().key==='show.review'")
            assert 'coreAttribute' not in json.dumps(page.evaluate('pairQA.visit().data'))
            if output:page.screenshot(path=str(output/f'公开赛报名核对-实际-{width}.png'))
            touch.tap(text='提交报名');touch.tap('Accept',scope='Confirm');touch.wait("pairQA.visit().key==='show.result'")
            public=state()['show']['entries']['public-0']
            assert len(public['theme']['rules']['attributes'])==4
            before=state()['coins'];touch.tap('Wallet');touch.wait('()=>pairQA.ready()')
            page.wait_for_timeout(400)
            assert state()['coins']==before+10000
            assert not errors,errors
            print(f'{width}px full-test opening, all features/rooms, private/public v2 real registration and +10000 test wallet passed.',flush=True)
        except Exception:
            if output:page.screenshot(path=str(output/f'调试-{width}.png'))
            print(page.evaluate("({key:pairQA.visit()?.key,title:pairQA.visit()?.data?.title,text:pairQA.texts(pairQA.find('Canvas',cc.director.getScene())).slice(-14)})"),flush=True)
            raise
        finally:ctx.close();process.terminate();process.wait(timeout=15)

if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--package',type=Path,required=True);parser.add_argument('--screenshots',type=Path)
    parser.add_argument('--webkit',action='store_true');args=parser.parse_args()
    if args.screenshots:args.screenshots.mkdir(parents=True,exist_ok=True)
    with sync_playwright() as p:
        browser=p.webkit.launch() if args.webkit else p.chromium.launch(channel='msedge',args=['--use-angle=swiftshader'])
        try:
            for width in (320,390):check(browser,args.package.resolve(),width,args.screenshots)
        finally:browser.close()
