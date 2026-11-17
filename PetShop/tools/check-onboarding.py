"""Play through the four opening steps in fresh shops on an isolated multiplayer server."""
import argparse
import json
import sqlite3
import subprocess
from contextlib import closing
from importlib import import_module
from pathlib import Path
from tempfile import TemporaryDirectory
from urllib.parse import urlsplit

from playwright.sync_api import sync_playwright


PROJECT=Path(__file__).resolve().parents[1]
touch_tools=import_module("check-breeding-controls")
SERVER="""
import {createMultiplayerServer} from './server/multiplayer.mjs';
const server=createMultiplayerServer({dataDirectory:process.argv[1],webRoot:process.argv[2]});
server.listen(0,'127.0.0.1',()=>console.log(server.address().port));
"""
MAIN="window.cc?.director?.getScene()?.getChildByName('Canvas')?.getComponent('ShopMain')"


def play(browser,address,save,width,screenshot):
    options=dict(viewport={'width':width,'height':568 if width==320 else 844},is_mobile=True,
                 has_touch=True,device_scale_factor=1,reduced_motion='reduce')
    page=browser.new_page(**options)
    errors=[]
    actions=[]
    account='开店验收'+str(width)
    def observe(response):
        if urlsplit(response.url).path=='/api/action' and response.request.method=='POST' and response.ok:
            actions.append(response.request.post_data_json['type'])

    def load(register=False,refresh=False):
        page.set_default_timeout(20000)
        if refresh:
            page.reload()
        else:
            page.goto(address)
        page.get_by_role('button',name='登录店铺',exact=True).wait_for()
        if register:
            page.get_by_role('link',name='注册',exact=True).click()
        page.get_by_label('账号名',exact=True).fill(account)
        page.get_by_role('button',name='注册并开店' if register else '登录店铺',exact=True).click()
        page.wait_for_function('()=>'+MAIN+'?.shop?.profileId',timeout=90000)
        page.evaluate(touch_tools.LOCATORS)
        page.evaluate('window.previewShop=()=>'+MAIN+'.shop')
        return touch_tools.Touch(page)

    def hook():
        page.on('pageerror',lambda error:errors.append(str(error)))
        page.on('response',observe)

    def visit(key):
        touch.wait('k=>pairQA.ready()&&pairQA.visit()?.key===k',key)

    def step(number):
        touch.wait('n=>previewShop().tutorial?.step===n&&!previewShop().tutorial.completed',number)

    def menu():
        # Follow rendered Back / home controls so the test covers the same way
        # back from a guide detail or sales page that the player has on mobile.
        for _ in range(5):
            key=page.evaluate("pairQA.visit()?.key||''")
            if key=='tutorial':
                visit(key)
                return
            if key:
                touch.tap('Back',scope='DeskPage')
            else:
                touch.tap('TutorialLink')
            touch.wait("k=>(pairQA.visit()?.key||'')!==k",key)
        raise AssertionError(('Could not return to guide',key))

    def choose(destination):
        visit('tutorial')
        choices=page.evaluate("pairQA.visit().data.actions.map(a=>({page:a.page,label:a.label}))")
        choice=next((a for a in choices if a.get('page')==destination),None)
        assert choice,(destination,choices)
        touch.tap(text=choice['label'],scope='DeskPage')
        visit(destination)

    def state():
        uri=(save/'multiplayer.sqlite').as_uri()+'?mode=ro'
        with closing(sqlite3.connect(uri,uri=True)) as db:
            row=db.execute('SELECT snapshot FROM shops JOIN accounts ON accounts.id=shops.account_id '
                           'WHERE accounts.username=?',(account,)).fetchone()
        assert row,'Disposable shop was never created'
        return json.loads(row[0])['state']

    def confirm(kind,button):
        touch.tap(text=button,scope='DeskPage')
        touch.wait("()=>!!pairQA.find('Confirm')")
        with page.expect_response(lambda r:urlsplit(r.url).path=='/api/action' and
                                  r.request.post_data_json.get('type')==kind) as answer:
            touch.tap('Accept',scope='Confirm')
        assert answer.value.ok,answer.value.text()
        return answer.value.request.post_data_json['args']

    hook()
    try:
        touch=load(register=True)
        visit('visitBook')
        first=state()
        original={p['id'] for p in first['pets']}
        assert len(original)==2 and first['care']['signedDay'] is None
        assert first['coins']==680
        profile=first['profileId']
        touch.tap('Action0',scope='DeskPage')
        visit('tutorial')
        step(1)
        choose('breed')
        touch.kind('pair')
        for i in range(2):
            touch.tap('Animal'+str(i),scope='DeskPage')
            touch.wait("n=>pairQA.ready()&&pairQA.visit().data.presentation.parents.filter(Boolean).length===n",i+1)
        touch.tap('Review',scope='DeskPage')
        touch.kind('pairConfirm')
        pair=confirm('care.breed','开始繁育')
        step(2)
        job=state()['rooms']['rabbit']['job']
        assert job and {job['motherId'],job['fatherId']}==original=={pair['mother'],pair['father']}
        assert state()['care']['signedDay'] is None
        print(f"{width}px: registration, opening letter and actual starter pairing passed.",flush=True)

        # Close the first device. The fresh browser page has no remembered notes
        # or tutorial state, yet the persisted shop must resume the second step.
        page.close()
        page=browser.new_page(**options)
        hook()
        touch=load()
        step(2)
        assert page.evaluate('previewShop().profileId')==profile
        touch.tap('TutorialLink')
        visit('tutorial')
        if width==390 and screenshot:
            touch.wait("()=>!!pairQA.find('TutorFocus')&&!!pairQA.find('TutorAction0')&&!pairQA.find('Feedback')")
            screenshot.parent.mkdir(parents=True,exist_ok=True)
            page.screenshot(path=str(screenshot))
        choose('shelf')
        touch.tap('Row0',scope='DeskPage')
        visit('offer')
        coins=state()['coins']
        purchase=confirm('care.buyPet','购买幼体')
        step(3)
        bought=state()
        assert bought['coins']==coins-purchase['price'] and purchase['price']>0
        assert next(p for p in bought['pets'] if p['id']==purchase['id'])['source']=='研究所采购'
        assert not any(p and p['id']==purchase['id'] for p in bought['rooms']['rabbit']['shelf']['offers'])
        assert bought['care']['signedDay'] is None
        print(f"{width}px: fresh-device login restored step 2; purchased at {purchase['price']} coins.",flush=True)

        menu()
        choose('profile')
        with page.expect_response(lambda r:urlsplit(r.url).path=='/api/action' and
                                  r.request.post_data_json.get('type')=='care.checkin') as signed:
            touch.tap('Claim',scope='DeskPage')
        assert signed.value.ok,signed.value.text()
        step(4)
        claimed=state()
        claim_ids=set(claimed['care']['claimIds'])
        young=[p for p in claimed['pets'] if p['id'] in claim_ids]
        assert len(young)==2 and {p['sex'] for p in young}=={'公','母'}
        assert all(p['breedKey']=='domestic' and p['source']=='每日签到' for p in young)
        assert claim_ids.isdisjoint(original|{purchase['id']})
        assert claimed['coins']==bought['coins']
        menu()
        destinations=('orders','market') if width==320 else ('market','orders')
        first,last=destinations
        choose(first)
        flag={'orders':'ordersViewed','market':'marketViewed'}
        touch.wait("([a,b])=>previewShop().tutorial?.[a]===true&&!previewShop().tutorial[b]",[flag[first],flag[last]])
        # Ordinary browser reload should preserve the single visited destination.
        touch=load(refresh=True)
        step(4)
        touch.tap('TutorialLink')
        visit('tutorial')
        assert page.evaluate("([a,b])=>previewShop().tutorial[a]===true&&!previewShop().tutorial[b]",
                             [flag[first],flag[last]])
        choose(last)
        touch.wait("()=>previewShop().tutorial?.completed===true")
        finished=state()
        assert actions==['care.breed','care.buyPet','care.checkin'],actions
        assert finished['coins']==claimed['coins'] and len(finished['receipts'])==3
        assert finished['care']['claimIds']==claimed['care']['claimIds']
        touch=load(refresh=True)
        touch.wait("()=>previewShop().tutorial?.completed===true&&!pairQA.find('TutorialLink')")
        assert not errors,errors
        print(f"{width}px: starter pair bred, purchased rabbit for {purchase['price']}, adopted both sexes, "
              f"viewed {first} then {last}; progress restored after close and reload.",flush=True)
    finally:
        page.close()


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--web-root',type=Path,default=PROJECT/'build'/'web-mobile')
    parser.add_argument('--screenshot',type=Path,help='output path for the 390px second step')
    args=parser.parse_args()
    with sync_playwright() as pw:
        browser=pw.chromium.launch(channel='msedge',args=['--use-angle=swiftshader','--enable-unsafe-swiftshader'])
        try:
            for width in (320,390):
                with TemporaryDirectory(prefix='petshop-opening-guide-test-') as temp:
                    proc=subprocess.Popen(['node','--input-type=module','-e',SERVER,temp,str(args.web_root.resolve())],
                        cwd=PROJECT,stdout=subprocess.PIPE,text=True,creationflags=getattr(subprocess,'CREATE_NO_WINDOW',0))
                    try:
                        play(browser,'http://127.0.0.1:'+str(int(proc.stdout.readline())),Path(temp),width,args.screenshot)
                    finally:
                        proc.terminate()
                        proc.wait(timeout=10)
        finally:
            browser.close()


if __name__=='__main__':
    main()
