from pathlib import Path
from functools import partial
from tempfile import TemporaryDirectory
from contextlib import closing
from urllib.request import Request,urlopen
from uuid import uuid4
import json,os,runpy,socket,sqlite3,subprocess,threading,time
from playwright.sync_api import sync_playwright

folder=Path(__file__).resolve().parent
root=folder.parents[2]
source=root/'output/aliyun/source-show-rules-20261121'
checks=runpy.run_path(str(source/'外网试玩/browser/check.py'))
os.environ['PLAYWRIGHT_BROWSERS_PATH']=str(root/'output/aliyun/font-render-20261120/browsers')
seed="""
import {RequestGameStore} from './PetShop/server/request-store.mjs';
import {makePet} from './PetShop/server/care.mjs';
const g=new RequestGameStore(null,{onboarding:false}),s=g.state,now=Date.now();
s.createdAt=now-20*86400000;s.shopXp=30000;s.coins=2379;s.visitBook.opening=false;
for(const species of ['cat','dog'])s.rooms[species]=structuredClone(s.rooms.rabbit);
const used=new Set();
s.pets=Array.from({length:20},(_,i)=>makePet(used,'rabbit',i%2?'angora':'domestic',i%2?'母':'公',now-86400000,'界面验收'));
for(const [species,breed] of [['dog','shiba'],['cat','british']])s.pets.push(makePet(used,species,breed,'公',now-86400000,'界面验收'));
s.pets.forEach(p=>p.traits.forEach(t=>t.grade='S+'));
console.log(JSON.stringify(g.snapshot()));
"""
snapshot=subprocess.check_output(['node','--input-type=module','-e',seed],cwd=source,encoding='utf-8')
def post(origin,route,body=None,token=None):
    headers={'Content-Type':'application/json'}
    if token:headers['Authorization']='Bearer '+token
    with urlopen(Request(origin+'/petshop-api/v1/'+route,data=None if body is None else json.dumps(body).encode(),headers=headers),timeout=15) as response:return json.load(response)
with TemporaryDirectory(prefix='petshop-official-ui-') as tmp,sync_playwright() as p:
    web=checks['LocalServer'](('127.0.0.1',0),partial(checks['LocalTrial'],directory=str(folder/'runtime/public')))
    origin=f'http://127.0.0.1:{web.server_port}'
    with socket.socket() as probe:probe.bind(('127.0.0.1',0));port=probe.getsockname()[1]
    web.api=f'http://127.0.0.1:{port}';db=Path(tmp)/'isolated.sqlite'
    server=subprocess.Popen(['node','server.mjs'],cwd=folder/'runtime',stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL,
      env={**os.environ,'PORT':str(port),'PETSHOP_DB':str(db),'PETSHOP_ORIGIN':origin,'PETSHOP_REQUIRE_EXISTING':'0'},creationflags=getattr(subprocess,'CREATE_NO_WINDOW',0))
    threading.Thread(target=web.serve_forever,daemon=True).start()
    try:
        for i in range(100):
            try:post(origin,'health');break
            except OSError:time.sleep(.1)
        with closing(sqlite3.connect(db)) as sql:
            cfg={'epoch':int(time.time()*1000)-3600000,'firstWeek':0,'seed':'1234567890abcdef'*4,'activatedAt':int(time.time()*1000)}
            sql.execute('INSERT INTO petshop_public_config VALUES (?,?)',('main',json.dumps(cfg)));sql.commit()
        report=[]
        for engine in ['edge','webkit']:
            password='ui-'+uuid4().hex
            account=post(origin,'auth/register',{'username':'正式界面'+engine,'password':password})
            with closing(sqlite3.connect(db)) as sql:
                state=json.loads(snapshot);state['state']['profileId']=state['state']['profile_id']=uuid4().hex
                sql.execute('UPDATE trial_accounts SET snapshot=? WHERE id=?',(json.dumps(state),account['accountId']));sql.commit()
            browser=p.chromium.launch(channel='msedge',args=['--use-angle=swiftshader']) if engine=='edge' else p.webkit.launch()
            try:
                ctx=browser.new_context(viewport={'width':390,'height':844},is_mobile=True,has_touch=True,device_scale_factor=2)
                ctx.add_init_script(checks['GAME']);page=ctx.new_page();page.set_default_timeout(60000)
                errors=[];requests=[]
                page.on('pageerror',lambda e:errors.append(str(e)))
                page.on('request',lambda r:requests.append(r.url))
                page.goto(origin+'/?login',wait_until='domcontentloaded');checks['visible_form'](page)
                page.evaluate("async()=>{window.cc=await System.import('cc')}")
                checks['fill_credentials'](page,'正式界面'+engine,password)
                page.locator('#submit').tap();page.wait_for_function("game()?.state==='open'",timeout=90000)
                def open_page(key,args=None):
                    page.evaluate('([key,args])=>{void game().session.open(key,args)}',[key,args or {}])
                    page.wait_for_function('key=>game().session.current?.key===key && !!game().session.current.data && !game().session.reading',arg=key)
                def labels():return page.evaluate("()=>{const all=n=>[n,...n.children.flatMap(all)];return all(game().layer).filter(n=>n.activeInHierarchy).map(n=>n.getComponent('cc.Label')?.string||'').filter(Boolean)}")
                open_page('login');assert '店主账号 · 正式界面'+engine in labels()
                assert not any(any(word in text for word in ['试玩','本地测试','模拟支付','非正式']) for text in labels()),labels()
                page.screenshot(path=str(folder/f'official-account-{engine}.png'))
                open_page('breed',{'species':'rabbit'})
                page.wait_for_function("()=>{const all=n=>[n,...n.children.flatMap(all)];const f=all(game().layer).find(n=>n.activeInHierarchy&&n.name==='BreedFilter');return f?.parent?.name==='FixedFilters'}")
                page.wait_for_function("()=>{const all=n=>[n,...n.children.flatMap(all)];return all(game().layer).find(n=>n.activeInHierarchy&&n.name==='ParentPair')?.getChildByName('Room')?.getComponent('cc.Sprite')?.spriteFrame}")
                def position():return page.evaluate("()=>{const all=n=>[n,...n.children.flatMap(all)];const f=all(game().layer).find(n=>n.activeInHierarchy&&n.name==='BreedFilter');return {filter:f.worldPosition.y,content:game().session.scroll.content.worldPosition.y}}")
                before=position();page.evaluate('game().session.scroll.scrollToBottom(0)');page.wait_for_timeout(350);after=position()
                assert abs(before['filter']-after['filter'])<.1,(before,after)
                assert abs(before['content']-after['content'])>50,(before,after)
                page.screenshot(path=str(folder/f'fixed-breed-filter-{engine}.png'))
                open_page('show',{'mode':'private'});assert all(text in labels() for text in ['1项考核','3项考核','5项考核']),labels()
                open_page('show',{'mode':'public'});assert '公开赛' in labels()
                assert not any(any(word in text for word in ['试玩','本地测试','本地模拟','抽签承诺','非正式']) for text in labels()),labels()
                page.screenshot(path=str(folder/f'shared-public-show-{engine}.png'))
                public=page.evaluate("game().session.current.data.rows.find(row=>row.visual?.mode==='public'&&row.link).link")
                open_page(public['page'],public['args'])
                animal=page.evaluate("game().session.current.data.rows.find(row=>row.animal).link")
                open_page(animal['page'],animal['args'])
                assert '本次实付 0 金币' in labels(),labels()
                page.evaluate("()=>{game().session.choose(game().session.current.data.actions.find(a=>a.type==='show.enter'))}")
                page.wait_for_function("()=>{const all=n=>[n,...n.children.flatMap(all)];return all(game().layer).some(n=>n.activeInHierarchy&&n.name==='Accept')}")
                page.evaluate("()=>{const all=n=>[n,...n.children.flatMap(all)];const node=all(game().layer).find(n=>n.activeInHierarchy&&n.name==='Accept');const p=()=>({x:0,y:0});node.emit(cc.Node.EventType.TOUCH_END,{getUIStartLocation:p,getUILocation:p})}")
                page.wait_for_function("game().session.current?.key==='show.result'&&!game().session.reading")
                assert any('已报名' in text for text in labels()),labels()
                assert not errors,errors
                assert not any(url.split('?')[0].endswith(('.woff','.woff2','.ttf')) for url in requests)
                report.append({'engine':engine,'officialAccount':True,'fixedBreedFilter':True,'breedingSceneLoaded':True,'newPrivateChoices':True,'realPublicRegistration':True,'fontsRequested':0})
                print(json.dumps(report[-1]),flush=True);ctx.close()
            finally:browser.close()
        with closing(sqlite3.connect(db)) as sql:assert sql.execute('SELECT count(*) FROM petshop_public_entries').fetchone()[0]==2
        (folder/'ui-results.json').write_text(json.dumps(report,indent=2)+'\n',encoding='utf-8')
    finally:
        server.terminate();server.wait(timeout=10);web.shutdown();web.server_close()
