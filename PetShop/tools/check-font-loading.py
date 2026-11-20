"""Verify real web-font startup gates using isolated saves and uncached browser contexts."""
import argparse
import json
import subprocess
import time
from pathlib import Path
from tempfile import TemporaryDirectory

from playwright.sync_api import sync_playwright


GAME = Path(__file__).resolve().parents[1]
SERVER = """
import { GameStore } from './server/game-store.mjs';
import { createPetShopServer } from './server/main.mjs';
const store=new GameStore(process.argv[1]);store.ensure();
store.state.visitBook.opening=false;store.state.shopXp=18000;store.save(store.state);
const server=createPetShopServer(process.argv[2],{store});
server.listen(0,'127.0.0.1',()=>console.log(server.address().port));
"""

MONITOR = """(()=>{
  const faces=()=>[...document.fonts].filter(f=>/Noto(Sans|Serif)CJKsc/.test(f.family))
    .map(f=>({family:f.family,status:f.status}));
  window.fontStartupQA={events:[],firstOpen:null};let previous='';
  setInterval(()=>{
    const m=window.cc?.director?.getScene()?.getChildByName('Canvas')?.getComponent('ShopMain');
    if(!m)return;
    const state=m.state,record={state,at:performance.now(),faces:faces(),
      notice:document.getElementById('petshop-startup-status')?.textContent||''};
    if(state!==previous){window.fontStartupQA.events.push(record);previous=state;}
    if(state==='open'&&!window.fontStartupQA.firstOpen)window.fontStartupQA.firstOpen=record;
  },10);
})();"""

SNAPSHOT = """()=>{
  const m=window.cc?.director?.getScene()?.getChildByName('Canvas')?.getComponent('ShopMain');
  return {state:m?.state||null,home:!!m?.home?.active,
    notice:document.getElementById('petshop-startup-status')?.textContent||'',
    reload:!!document.querySelector('#petshop-startup-status button'),
    faces:[...document.fonts].filter(f=>/Noto(Sans|Serif)CJKsc/.test(f.family))
      .map(f=>({family:f.family,status:f.status})),
    observations:window.fontStartupQA};
}"""


def assert_loaded(snapshot):
    faces=snapshot['faces']
    assert len({f['family'] for f in faces})==3 and all(f['status']=='loaded' for f in faces),snapshot


def wait_open(page):
    page.wait_for_function("window.fontStartupQA?.firstOpen!==null && !!window.fontStartupQA?.firstOpen",timeout=120000)
    snapshot=page.evaluate(SNAPSHOT)
    assert snapshot['state']=='open' and not snapshot['notice'],snapshot
    assert_loaded(snapshot)
    assert_loaded(snapshot['observations']['firstOpen'])
    return snapshot


def verify(browser,port,mode):
    context=browser.new_context(viewport={'width':390,'height':844},is_mobile=True,has_touch=True,
                                device_scale_factor=1,service_workers='block')
    page=context.new_page();page.set_default_timeout(30000)
    cdp=context.new_cdp_session(page)
    cdp.send('Network.enable');cdp.send('Network.setCacheDisabled',{'cacheDisabled':True})
    page.add_init_script(MONITOR)
    result={'mode':mode,'cacheDisabled':True,'viewport':[390,844]}
    controls={'target':None,'block':mode=='blocked'}
    shop_requests=[];page_errors=[]
    page.on('pageerror',lambda error:page_errors.append(str(error)))
    page.on('request',lambda request:shop_requests.append(request.url) if request.url.endswith('/api/shop') else None)

    def font_route(route):
        url=route.request.url
        if controls['target'] is None:controls['target']=url;result['targetFont']=url.rsplit('/',1)[-1]
        if url!=controls['target'] or mode=='normal':
            route.continue_();return
        if mode=='delayed' and 'heldAt3500ms' not in result:
            started=time.monotonic()
            page.wait_for_timeout(3500)
            checkpoint=page.evaluate(SNAPSHOT)
            checkpoint['shopRequests']=len(shop_requests)
            checkpoint['elapsedSeconds']=round(time.monotonic()-started,3)
            result['heldAt3500ms']=checkpoint
            assert checkpoint['state']!='open' and not checkpoint['home'],checkpoint
            assert checkpoint['notice']=='正在加载…' and checkpoint['shopRequests']==0,checkpoint
            assert checkpoint['observations']['firstOpen'] is None,checkpoint
            page.wait_for_timeout(1500)
            result['releasedAfterSeconds']=round(time.monotonic()-started,3)
            route.continue_();return
        if controls['block']:
            result['blockedRequests']=result.get('blockedRequests',0)+1
            route.abort('failed');return
        route.continue_()

    # Routing disables HTTP cache as well; CDP makes the intent explicit.
    context.route('**/*.ttf*',font_route)
    try:
        page.goto(f'http://127.0.0.1:{port}',wait_until='domcontentloaded')
        if mode=='blocked':
            page.get_by_text('加载失败，请重试。',exact=False).wait_for(timeout=120000)
            page.wait_for_timeout(3500)
            failed=page.evaluate(SNAPSHOT);failed['shopRequests']=len(shop_requests)
            result['failure']=failed
            assert failed['state']!='open' and not failed['home'] and failed['reload'],failed
            assert '字体' not in failed['notice'],failed
            assert failed['observations']['firstOpen'] is None and failed['shopRequests']==0,failed
            assert result.get('blockedRequests',0)>0,result
            controls['block']=False
            page.get_by_role('button',name='重新载入').click()
            result['afterExplicitReload']=wait_open(page)
        else:
            result['opened']=wait_open(page)
            if mode=='delayed':assert result['releasedAfterSeconds']>=5,result
        assert controls['target'] is not None,'No TTF request was intercepted'
        assert not page_errors,page_errors
        result['passed']=True
        print(mode+': passed; '+result['targetFont'],flush=True)
        return result
    except Exception as error:
        result['passed']=False;result['error']=repr(error)
        try:result['lastState']=page.evaluate(SNAPSHOT)
        except Exception as read_error:result['snapshotError']=repr(read_error)
        print(json.dumps(result,ensure_ascii=False),flush=True)
        raise
    finally:
        context.close()


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--web-root',type=Path,default=GAME/'build/web-mobile')
    parser.add_argument('--report',type=Path,required=True)
    args=parser.parse_args();reports=[]
    with sync_playwright() as pw:
        browser=pw.chromium.launch(channel='msedge',args=['--use-angle=swiftshader'])
        try:
            for mode in ('normal','delayed','blocked'):
                with TemporaryDirectory(prefix='petshop-font-startup-') as save:
                    process=subprocess.Popen(['node','--input-type=module','-e',SERVER,save,str(args.web_root.resolve())],
                        cwd=GAME,stdin=subprocess.DEVNULL,stdout=subprocess.PIPE,text=True,encoding='utf-8',
                        creationflags=getattr(subprocess,'CREATE_NO_WINDOW',0))
                    try:
                        port=int(process.stdout.readline());reports.append(verify(browser,port,mode))
                    finally:
                        process.terminate();process.wait(timeout=10)
        finally:
            browser.close();args.report.parent.mkdir(parents=True,exist_ok=True)
            args.report.write_text(json.dumps({'cases':reports,'passed':len(reports)==3 and all(r['passed'] for r in reports)},
                                            ensure_ascii=False,indent=2),encoding='utf-8')


if __name__=='__main__':main()
