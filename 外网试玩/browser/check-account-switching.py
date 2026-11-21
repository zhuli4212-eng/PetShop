"""Check in-page account forms against a local browser package; never create an account."""
import argparse
import functools
import http.server
import json
from pathlib import Path
import threading

from playwright.sync_api import sync_playwright


class Assets(http.server.SimpleHTTPRequestHandler):
    def log_message(self,*args):pass
    def copyfile(self,source,target):
        try:super().copyfile(source,target)
        except (ConnectionAbortedError,ConnectionResetError,BrokenPipeError):pass


def check(browser,url,width,output):
    with browser.new_context(viewport={'width':width,'height':568 if width==320 else 844 if width==390 else 900},
                             has_touch=True,is_mobile=width<1000,device_scale_factor=1) as context:
        page=context.new_page();requests=[];errors=[];submissions=[]
        page.on('request',lambda r:requests.append((r.method,r.url)))
        page.on('pageerror',lambda e:errors.append(str(e)))
        def reject_auth(route):
            submissions.append((route.request.url,route.request.post_data_json))
            route.fulfill(status=400,content_type='application/json',body=json.dumps({'error':'本地测试回执'}))
        page.route('**/petshop-api/v1/auth/**',reject_auth)
        page.goto(url+'?login')
        page.locator('#account-form').wait_for(state='visible',timeout=90000)
        page.locator('.shopfront').evaluate('img=>img.decode()')
        page.wait_for_load_state('networkidle')
        page.evaluate("window.accountSwitchSentinel={game:cc.director.getScene(),value:'same-page'}")
        before=len(requests)
        page.locator('#username').fill('本地切换检查')

        def form(mode):
            page.wait_for_function('text=>document.querySelector("#submit").textContent===text',
                                  arg={'login':'登录店铺','register':'注册并开店','setup':'设置密码并登录'}[mode])
            assert page.locator('#username').input_value()=='本地切换检查'
            assert page.locator('#password').get_attribute('autocomplete')==('current-password' if mode=='login' else 'new-password')
            assert page.locator('#register-tab').is_visible()==(mode=='login')
            assert page.locator('#login-tab').is_visible()==(mode!='login')
            assert page.locator('#setup-proof').is_visible()==(mode=='setup')
            assert page.locator('#setup-code').is_enabled()==(mode=='setup')
            assert page.locator('#password').input_value()==''
            assert page.locator('#error').is_hidden()
            assert page.locator('#petshop-loading-panel').is_hidden()
            assert page.evaluate("accountSwitchSentinel.value==='same-page'&&accountSwitchSentinel.game===cc.director.getScene()")

        for _ in range(3):
            page.locator('#password').fill('temporary-password')
            page.locator('#register-tab').tap();form('register')
            page.locator('#login-tab').tap();form('login')
        page.go_back();form('register')
        page.go_forward();form('login')
        page.locator('#set-password-link').tap();form('setup')
        page.locator('#setup-code').fill('0123456789abcdef')
        page.locator('#login-tab').tap();form('login')
        assert page.locator('#setup-code').input_value()==''
        page.wait_for_timeout(200)
        assert requests[before:]==[],requests[before:]
        if output:page.screenshot(path=str(output/f'登录注册页内切换-{width}.png'))

        # Verify that in-page mode changes also change the submitted endpoint.
        for mode,tab,endpoint in [('register','#register-tab','register'),('login','#login-tab','login'),
                                  ('setup','#set-password-link','set-password')]:
            page.locator(tab).tap();form(mode)
            page.locator('#password').fill('temporary-password')
            if mode=='setup':page.locator('#setup-code').fill('0123456789abcdef')
            page.locator('#submit').tap()
            page.wait_for_function("document.querySelector('#error').textContent==='本地测试回执'")
            page.locator('#submit:not([disabled])').wait_for()
            assert submissions[-1][0].endswith('/auth/'+endpoint),submissions
            assert submissions[-1][1]['username']=='本地切换检查'
        assert len(submissions)==3
        assert not errors,errors
        assert not [url for _,url in requests if url.split('?')[0].endswith(('.ttf','.woff2'))]
        assert sum(1 for method,path in requests if method=='GET' and path.split('?')[0]==url)==1
        print(f'{width}px: repeated login/register/setup switches, Back/Forward, unchanged game scene and zero resource requests passed; three submit modes verified with local error responses.',flush=True)


if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--web-root',required=True,type=Path)
    parser.add_argument('--screenshots',type=Path)
    parser.add_argument('--webkit',action='store_true')
    args=parser.parse_args()
    if args.screenshots:args.screenshots.mkdir(parents=True,exist_ok=True)
    server=http.server.ThreadingHTTPServer(('127.0.0.1',0),functools.partial(Assets,directory=str(args.web_root.resolve())))
    server.request_queue_size=128
    threading.Thread(target=server.serve_forever,daemon=True).start()
    try:
        with sync_playwright() as p:
            browser=p.webkit.launch() if args.webkit else p.chromium.launch(channel='msedge',args=['--use-angle=swiftshader'])
            try:
                for width in (320,390,1280):check(browser,f'http://127.0.0.1:{server.server_port}/',width,args.screenshots)
            finally:browser.close()
    finally:server.shutdown();server.server_close()
