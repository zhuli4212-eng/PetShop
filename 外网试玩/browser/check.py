"""Check the named public trial. Only the explicit loopback mode creates test shops."""
import argparse
import functools
import hashlib
import http.server
import json
import re
import sqlite3
import sys
from importlib import import_module
import subprocess
import threading
import time
from pathlib import Path
from secrets import token_urlsafe
from urllib.error import HTTPError
from urllib.request import Request,urlopen
from urllib.parse import urljoin,urlsplit
from uuid import uuid4

from playwright.sync_api import sync_playwright


ROOT = Path(__file__).resolve().parent
sys.path.insert(0,str(ROOT.parents[1]/'PetShop'/'tools'))
touch_tools=import_module('check-breeding-controls')
GAME = """window.game = () => window.cc?.director?.getScene()?.getChildByName('Canvas')?.getComponent('ShopMain');"""
OLD_SHOP = """
import {RequestGameStore} from './云端经营版/shared/request-store.mjs';
const g=new RequestGameStore(), shop=g.shop();
delete g.state.visitBook.tutorial;
g.state.visitBook.opening=false;
g.act({type:'care.checkin',args:{},profileId:shop.profileId,version:shop.version,requestId:'legacy-adoption-qa'});
console.log(JSON.stringify(g.snapshot()));
"""
LEGACY_DATA = """async record=>{
  const db=await new Promise((resolve,reject)=>{
    const open=indexedDB.open('petshop-trial:'+new URL('./',location.href).pathname,1);
    open.onupgradeneeded=()=>open.result.createObjectStore('shop');
    open.onerror=()=>reject(open.error);open.onsuccess=()=>resolve(open.result);
  });
  const writing=record!==null;
  try {
    return await new Promise((resolve,reject)=>{
      const tx=db.transaction('shop',writing?'readwrite':'readonly');
      const store=tx.objectStore('shop'), req=writing?store.put(record,'player'):store.get('player');
      tx.oncomplete=()=>resolve(writing?null:req.result);
      tx.onabort=()=>reject(tx.error);
    });
  } finally {db.close();}
}"""

class LocalTrial(http.server.SimpleHTTPRequestHandler):
    """Serve the actual Pages assets and forward their same-origin requests to local Workers dev."""
    def log_message(self,*args):
        pass

    def forward(self):
        length=int(self.headers.get("Content-Length",0))
        data=self.rfile.read(length) if self.command=="POST" else None
        headers={key:self.headers[key] for key in ["Content-Type","Authorization","Origin"] if key in self.headers}
        req=Request(self.server.api+self.path,data=data,headers=headers,method=self.command)
        try:
            response=urlopen(req)
        except HTTPError as error:
            response=error
        with response:
            body=response.read()
            self.send_response(response.status)
            for key in ["Content-Type","Cache-Control","X-PetShop-Account"]:
                if key in response.headers:self.send_header(key,response.headers[key])
            self.send_header("Content-Length",str(len(body)))
            self.end_headers()
            try:self.wfile.write(body)
            except (ConnectionAbortedError,ConnectionResetError,BrokenPipeError):pass

    def do_GET(self):
        if self.path.startswith("/petshop-api/"):return self.forward()
        if self.path.startswith("/petshop/"):self.path=self.path[len("/petshop"):]
        super().do_GET()

    def do_POST(self):
        if self.path.startswith("/petshop-api/"):return self.forward()
        self.send_error(404)

    def copyfile(self,source,target):
        try:super().copyfile(source,target)
        except (ConnectionAbortedError,ConnectionResetError,BrokenPipeError):pass


class LocalServer(http.server.ThreadingHTTPServer):
    # Two Cocos clients request many textures at once when opening a shop.
    request_queue_size=128


def mobile(browser, width):
    ctx=browser.new_context(viewport={"width":width, "height":568 if width==320 else 844},
                            is_mobile=True, has_touch=True, device_scale_factor=1)
    ctx.add_init_script(GAME)
    return ctx


def visible_form(page, register=False):
    name,submit=page.locator("#username"),page.locator("#submit")
    password=page.locator('#password')
    name.wait_for(state="visible")
    page.locator('#opening').wait_for(state="hidden")
    assert password.is_visible() and password.get_attribute('type')=='password'
    assert password.get_attribute('autocomplete')==('new-password' if register else 'current-password')
    assert password.evaluate('node=>node.required')
    assert submit.is_visible()
    assert page.locator("#GameDiv").is_visible()
    assert page.locator('#account-layer').is_visible()
    assert ("注册" if register else "登录") in submit.inner_text()
    for item in [name,password,submit]:
        box=item.bounding_box()
        assert box and -1<=box["x"] and box["x"]+box["width"]<=page.viewport_size["width"]+1
        assert 0<=box["y"] and box["y"]+box["height"]<=page.viewport_size["height"]+1
        assert item.evaluate('(node)=>{const b=node.getBoundingClientRect();return node.contains(document.elementFromPoint(b.x+b.width/2,b.y+b.height/2));}')


def register_form(page):
    page.locator("#register-tab").tap()
    page.wait_for_function("document.querySelector('#submit')?.textContent.includes('注册')")
    visible_form(page,True)


def form_only(browser,url,screenshot=None):
    for width in [320,390,1280]:
        session=mobile(browser,width) if width<1000 else browser.new_context(viewport={'width':1280,'height':900},has_touch=True)
        with session as ctx:
            page=ctx.new_page()
            requests=[]
            page.on("request",lambda r:requests.append((r.method,r.url)))
            page.goto(url)
            visible_form(page)
            for registering in [False,True]:
                if registering:register_form(page)
                page.locator(".shopfront").evaluate("img=>img.decode()")
                stage=page.locator('.ledger').bounding_box()
                assert abs(stage['x']+stage['width']/2-width/2)<3 and stage['width']<stage['height'],stage
                if width>=1000:assert stage['width']<width/2,stage
                backdrop=page.locator('.shopfront').bounding_box()
                form=page.locator('#account-form').bounding_box()
                assert abs(backdrop['x']+backdrop['width']/2-width/2)<3
                assert backdrop['y']+backdrop['height']<=form['y']
                assert page.locator(".shopfront").evaluate("img=>getComputedStyle(img).objectFit")=='contain'
                if screenshot and width in [390,1280]:
                    screenshot.parent.mkdir(parents=True,exist_ok=True)
                    label=('-desktop' if width==1280 else '')+('-register' if registering else '')
                    page.screenshot(path=str(screenshot.with_stem(screenshot.stem+label)))
            page.locator("#login-tab").tap()
            visible_form(page)
            assert not any(method=='POST' and '/petshop-api/' in path for method,path in requests)
            print(f"{width}px login/register forms visible at {url}; no account requests submitted.",flush=True)


def fill_credentials(page,name,password):
    page.locator("#username").fill(name)
    page.locator("#password").fill(password)


def submit(page,name,password):
    fill_credentials(page,name,password)
    page.locator("#submit").tap()
    page.wait_for_function("game()?.shop?.profileId && game()?.state === 'open'",timeout=90000)
    return page.evaluate("game().shop.profileId")


def tap_game(page, key, by_name=False):
    location="""({key,byName})=>{
      const g=game();if(!g)return null;
      const root=g.node;
      const find=n=>n.activeInHierarchy&&(byName?n.name===key:n.getComponent('cc.Label')?.string===key)
          ?n:n.children.map(find).find(Boolean);
      const n=find(root);if(!n)return null;
      const p=root.getComponent(cc.Canvas).cameraComponent.worldToScreen(n.worldPosition);
      const c=document.querySelector('canvas'), b=c.getBoundingClientRect();
      return [b.left+p.x*b.width/c.width,b.bottom-p.y*b.height/c.height];
    }"""
    point=page.wait_for_function(location,arg={"key":key,"byName":by_name}).json_value()
    assert 0<=point[0]<=page.viewport_size["width"] and 0<=point[1]<=page.viewport_size["height"],(key,point)
    page.touchscreen.tap(*point)


def seed_old_shop(page):
    snapshot=old_snapshot()
    page.evaluate(LEGACY_DATA,snapshot)
    page.reload()
    visible_form(page)
    return snapshot


def old_snapshot():
    output=subprocess.check_output(["node","--input-type=module","-e",OLD_SHOP],cwd=ROOT.parents[1])
    return json.loads(output)


def read_only_game_page(page,key,args):
    page.evaluate("([key,args])=>game().session.open(key,args)",[key,args])
    page.wait_for_function("key=>game().session.current?.key===key&&!game().session.reading",arg=key)
    return page.evaluate("game().session.current.data")


def play_tutorial(page):
    page.evaluate(touch_tools.LOCATORS)
    touch=touch_tools.Touch(page)
    def visit(key):
        touch.wait('key=>pairQA.ready()&&pairQA.visit()?.key===key',key)
    def choose(key):
        visit('tutorial')
        label=page.evaluate("key=>pairQA.visit().data.actions.find(a=>a.page===key).label",key)
        touch.tap(text=label,scope='DeskPage')
        visit(key)
    def menu():
        for _ in range(6):
            key=page.evaluate("pairQA.visit()?.key||''")
            if key=='tutorial':return
            if key:touch.tap('Back',scope='DeskPage')
            else:touch.tap('TutorialLink')
            touch.wait("k=>(pairQA.visit()?.key||'')!==k",key)
        raise AssertionError('Could not return to the opening steps')
    def confirm(label,action):
        touch.tap(text=label,scope='DeskPage')
        touch.wait("()=>!!pairQA.find('Confirm')")
        with page.expect_response(lambda r:r.url.endswith('/v1/action') and r.request.post_data_json.get('type')==action) as completed:
            touch.tap('Accept',scope='Confirm')
        assert completed.value.ok

    visit('visitBook')
    touch.tap('Action0',scope='DeskPage')
    choose('breed')
    for index in range(2):
        touch.tap('Animal'+str(index),scope='DeskPage')
        touch.wait('n=>pairQA.ready()&&pairQA.visit().data.presentation.parents.filter(Boolean).length===n',index+1)
    touch.tap('Review',scope='DeskPage')
    touch.kind('pairConfirm')
    base=page.evaluate('pairQA.visit().data.presentation.mutationPreview.defect')
    assert base['perfectPercent']==5 and base['defectPercent']==2
    confirm('开始繁育','care.breed')
    touch.wait('()=>game().shop.tutorial.step===2')
    menu()
    choose('shelf')
    touch.tap('Row0',scope='DeskPage')
    visit('offer')
    confirm('购买幼体','care.buyPet')
    touch.wait('()=>game().shop.tutorial.step===3')
    menu()
    choose('profile')
    with page.expect_response(lambda r:r.url.endswith('/v1/action') and r.request.post_data_json.get('type')=='care.checkin') as claim:
        touch.tap('Claim',scope='DeskPage')
    assert claim.value.ok
    touch.wait('()=>game().shop.tutorial.step===4')
    menu()
    choose('orders')
    touch.wait('()=>game().shop.tutorial.ordersViewed')
    menu()
    choose('market')
    touch.wait('()=>game().shop.tutorial.completed&&game().shop.dayClaimed')
    return claim.value.request.post_data_json


def check_growth_clock(page):
    rows=read_only_game_page(page,'rooms',{'species':'rabbit','stage':'幼年'})['rows']
    assert sum(bool(r.get('animal')) for r in rows)>=3
    frames=page.evaluate("""async ()=>{
      const q=pairQA, sample=()=>{
        const row=q.find('Animal0',q.find('DeskPage'));
        return [q.find('StageTarget',row),q.find('StageCountdown',row)].map(n=>n.getComponent(cc.Label).string);
      };
      const readings=[],until=performance.now()+6500;
      while(performance.now()<until&&readings.length<3){
        const [target,timer]=sample();if(target!=='距成长')throw Error('Unexpected stage timer '+target);
        if(readings.at(-1)!==timer)readings.push(timer);
        await new Promise(resolve=>setTimeout(resolve,80));
      }
      return readings;
    }""")
    seconds=import_module('check-room-filters').seconds
    values=[seconds(value) for value in frames]
    assert len(values)==3 and values==[values[0],values[0]-1,values[0]-2],frames


def check_adoption_receipt(page,command):
    # Use the game's XHR transport, including its normal rewriting of API URLs.
    receipts=page.evaluate("""async command=>{
      const api=(path,body)=>new Promise((resolve,reject)=>{
        const request=new XMLHttpRequest();
        request.open(body?'POST':'GET','/api/'+path);
        if(body)request.setRequestHeader('Content-Type','application/json');
        request.onload=()=>request.status===200?resolve(JSON.parse(request.responseText)):reject(Error('HTTP '+request.status));
        request.onerror=()=>reject(Error('Game API unreachable'));
        request.send(body?JSON.stringify(body):null);
      });
      return Promise.all([api('action',command),api('receipts/'+command.requestId)]);
    }""",command)
    assert receipts[0]==receipts[1]
    rows=read_only_game_page(page,'rooms',{'species':'rabbit'})['rows']
    animals=[r['animal'] for r in rows if r.get('animal')]
    assert len(animals)>=5


def fresh_register(page,name,password):
    register_form(page)
    checkbox=page.locator("#import-legacy")
    assert not checkbox.is_checked()
    return submit(page,name,password)


def verify_accounts(browser,url):
    a,b,imported=["qa-"+uuid4().hex[:12] for _ in range(3)]
    pw_a=' '+token_urlsafe(18)+'🐾 '
    pw_b,pw_imported=token_urlsafe(18),token_urlsafe(18)
    with mobile(browser,320) as first,mobile(browser,390) as second:
        one,two=first.new_page(),second.new_page()
        errors=[]
        for p in [one,two]:
            p.on("pageerror",lambda err:errors.append(str(err)))
            p.goto(url)
            visible_form(p)
        legacy=seed_old_shop(one)
        id_a=fresh_register(one,a,pw_a)
        assert not one.evaluate("game().shop.dayClaimed")
        assert one.evaluate(LEGACY_DATA,None)==legacy
        claim=play_tutorial(one)
        check_adoption_receipt(one,claim)
        check_growth_clock(one)

        # Only the correct password should resume the registered shop in another browser.
        fill_credentials(two,a,pw_a.strip())
        with two.expect_response(lambda response:response.url.endswith('/v1/auth/login')) as failed:
            two.locator("#submit").tap()
        assert failed.value.status==401
        two.locator("#error").wait_for(state="visible")
        assert not two.locator("#GameDiv").is_visible()
        assert submit(two,a,pw_a)==id_a and two.evaluate("game().shop.dayClaimed")
        print("Wrong password rejected; the correct password resumed the signed adoption on the second browser.",flush=True)
        two.reload(wait_until="domcontentloaded")
        visible_form(two)
        assert submit(two,a,pw_a)==id_a and two.evaluate("game().shop.dayClaimed")

        # Switch using the account entry a player sees inside Cocos.
        tap_game(two,"Hotspot_login",by_name=True)
        label=two.wait_for_function("game().session.current?.data?.actions?.find(x=>x.label.includes('切换'))?.label").json_value()
        tap_game(two,label)
        visible_form(two)
        id_b=fresh_register(two,b,pw_b)
        assert id_b!=id_a and not two.evaluate("game().shop.dayClaimed")
        assert one.evaluate("game().shop.profileId")==id_a and one.evaluate("game().shop.dayClaimed")

        # Consent carries the four already-owned animals into a third, new account.
        one.reload(wait_until="domcontentloaded")
        visible_form(one)
        register_form(one)
        checkbox=one.locator("#import-legacy")
        checkbox.wait_for(state="visible")
        assert not checkbox.is_checked()
        checkbox.check()
        fill_credentials(one,a,pw_imported)
        one.locator("#submit").tap()
        one.locator("#error").wait_for(state="visible")
        assert one.evaluate(LEGACY_DATA,None)==legacy
        assert submit(one,imported,pw_imported)!=id_b and one.evaluate("game().shop.dayClaimed")
        legacy_ids={pet["id"] for pet in legacy["state"]["pets"]}
        assert len(legacy_ids)==4
        residents=read_only_game_page(one,'rooms',{'species':'rabbit'})['rows']
        assert {row['animal']['id'] for row in residents if row.get('animal')}==legacy_ids
        assert one.evaluate(LEGACY_DATA,None)==legacy
        two.reload(wait_until="domcontentloaded")
        visible_form(two)
        submit(two,imported,pw_imported)
        restored=read_only_game_page(two,'rooms',{'species':'rabbit'})['rows']
        assert {row['animal']['id'] for row in restored if row.get('animal')}==legacy_ids
        assert not errors,errors
        print("Tutorial steps 1–4, live growth countdown, refresh and account switching passed. Opt-in legacy import kept the original four animals in both browsers.",flush=True)


def legacy_account(db_path,snapshot):
    """Create only fresh fixture rows in the explicitly supplied local D1 database."""
    username='qa-old-'+uuid4().hex[:10]
    account_id=str(uuid4())
    token=token_urlsafe(32)
    digest=hashlib.sha256(token.encode()).hexdigest()
    with sqlite3.connect(db_path.resolve(strict=True).as_uri()+'?mode=rw',uri=True,timeout=10) as db:
        db.execute('INSERT INTO trial_accounts(id,name_key,username,snapshot) VALUES(?,?,?,?)',
                   (account_id,username,username,json.dumps(snapshot,ensure_ascii=False)))
        db.execute('INSERT INTO trial_sessions(digest,account_id,expires_at) VALUES(?,?,?)',
                   (digest,account_id,round(time.time()*1000)+3600000))
    return username,token


def verify_legacy_accounts(browser,url,db_path):
    api=urljoin(url,'/petshop-api/v1/')
    for use_local_proof in [False,True]:
        snapshot=old_snapshot()
        name,old_token=legacy_account(db_path,snapshot)
        with mobile(browser,390) as owner,mobile(browser,320) as other:
            page=owner.new_page()
            page.goto(url)
            visible_form(page)
            legacy_header={'Authorization':'Bearer '+old_token}
            if use_local_proof:
                page.evaluate(LEGACY_DATA,snapshot)
            else:
                # A tab that was signed in before migration reads this normal game page.
                response=owner.request.post(api+'page',headers=legacy_header,data={'page':'login','args':{}})
                assert response.ok,response.status
                account_rows=response.json()['page']['rows']
                notice=next(row for row in account_rows if row['title']=='设置密码验证码')
                assert '15 分钟' in notice['text']
                code=re.search(r'\b[0-9a-f]{16}\b',notice['text']).group()
            page.locator('#set-password-link').tap()
            page.locator('#setup-code').wait_for()
            password=token_urlsafe(20)
            if use_local_proof:
                page.locator('#use-legacy-proof').check()
                assert not page.locator('#setup-code').is_visible()
            else:
                page.locator('#setup-code').fill(code)
            profile=submit(page,name,password)
            assert profile==snapshot['state']['profileId']
            old_ids={a['id'] for a in snapshot['state']['pets']}
            rows=read_only_game_page(page,'rooms',{'species':'rabbit'})['rows']
            assert {row['animal']['id'] for row in rows if row.get('animal')}==old_ids
            assert owner.request.get(api+'shop',headers=legacy_header).status==401
            fresh=other.new_page()
            fresh.goto(url)
            visible_form(fresh)
            if not use_local_proof:
                fresh.locator('#set-password-link').tap()
                fresh.locator('#setup-code').fill(code)
                fill_credentials(fresh,name,token_urlsafe(18))
                with fresh.expect_response(lambda r:r.url.endswith('/auth/set-password')) as replay:
                    fresh.locator('#submit').tap()
                assert replay.value.status==403
                fresh.locator('#error').wait_for()
                assert not fresh.locator('#GameDiv').is_visible()
                fresh.locator('#login-tab').tap()
                visible_form(fresh)
            assert submit(fresh,name,password)==profile and fresh.evaluate('game().shop.dayClaimed')
    print("Two pre-password shops preserved their residents through setup by code or original browser save. Used code and old sessions were rejected; new passwords resumed both shops.",flush=True)


if __name__=="__main__":
    parser=argparse.ArgumentParser(description=__doc__)
    mode=parser.add_mutually_exclusive_group(required=True)
    mode.add_argument("--url",help="Read-only check of the login/register screens; no account will be created")
    mode.add_argument("--local-url",help="Loopback trial, served by Pages dev with a disposable local accounts service")
    mode.add_argument("--local-api",help="Origin of a disposable Workers dev server, serving /petshop-api/v1; host the local Cocos files under /petshop/")
    parser.add_argument("--screenshot",type=Path,help="Save mobile and desktop login/register PNGs using this base filename")
    parser.add_argument("--legacy-db",type=Path,help="Disposable local D1 .sqlite file for pre-password shop fixtures")
    opts=parser.parse_args()
    local=opts.local_url or opts.local_api
    if local and urlsplit(local).hostname not in {"localhost","127.0.0.1","::1"}:
        parser.error("Local account checks require a loopback hostname")
    if opts.legacy_db and not local:parser.error("--legacy-db requires loopback mode")
    server=None
    try:
        url=opts.local_url or opts.url
        if opts.local_api:
            server=LocalServer(("127.0.0.1",0),functools.partial(LocalTrial,directory=str(ROOT/"dist")))
            server.api=opts.local_api.rstrip("/")
            threading.Thread(target=server.serve_forever,daemon=True).start()
            url=f"http://127.0.0.1:{server.server_port}/petshop/"
        with sync_playwright() as pw:
            browser=pw.chromium.launch(channel="msedge",args=["--use-angle=swiftshader","--enable-unsafe-swiftshader"])
            try:
                form_only(browser,url,opts.screenshot)
                if local:verify_accounts(browser,url)
                if opts.legacy_db:verify_legacy_accounts(browser,url,opts.legacy_db)
            finally:browser.close()
    finally:
        if server:
            server.shutdown()
            server.server_close()
