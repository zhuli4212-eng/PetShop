"""Check the approved room/profile layout with real canvas taps and a disposable save."""
import argparse
import json
from pathlib import Path
import runpy
import subprocess
from tempfile import TemporaryDirectory
from playwright.sync_api import sync_playwright

PROJECT=Path(__file__).resolve().parents[1]
shared=runpy.run_path(str(PROJECT/'tools/check-breeding-filters-items.py'))
SEED=r"""
import {GameStore} from './server/game-store.mjs';
import {createPetShopServer} from './server/main.mjs';
const [directory,web]=process.argv.slice(1),now=Date.now();
const store=new GameStore(directory);store.ensure();
const s=store.state,base=structuredClone(s.pets);s.visitBook.opening=false;s.shopXp=30;s.coins=1530;
s.pets=Array.from({length:15},(_,i)=>{
  const p=structuredClone(base[i%2]);
  Object.assign(p,{id:'layout-'+i,name:['芋头','麦香','噗噗','斑斑','转转'][i%5],bornAt:now-86400000,
    breedKey:['angora','angora','domestic','lop','lionhead'][i%5],retained:i===0});
  return p;
});
s.rooms.rabbit.items.review=2;store.save(s);
createPetShopServer(web,{store}).listen(0,'127.0.0.1',function(){console.log(this.address().port);});
"""

def check(browser,width,output):
    with TemporaryDirectory(prefix='petshop-room-layout-') as directory:
        process=subprocess.Popen(['node','--input-type=module','-e',SEED,directory,str(PROJECT/'build/web-mobile')],
            cwd=PROJECT,stdout=subprocess.PIPE,text=True,encoding='utf-8',creationflags=getattr(subprocess,'CREATE_NO_WINDOW',0))
        context=browser.new_context(viewport={'width':width,'height':568 if width==320 else 844},is_mobile=True,
                                    has_touch=True,device_scale_factor=1,reduced_motion='reduce')
        page=context.new_page();errors=[];fonts=[]
        page.on('pageerror',lambda e:errors.append(str(e)))
        page.on('request',lambda r:fonts.append(r.url) if r.url.split('?')[0].endswith(('.ttf','.woff2')) else None)
        try:
            page.goto('http://127.0.0.1:'+process.stdout.readline().strip())
            page.wait_for_function("window.cc?.director.getScene()?.getChildByName('Canvas')?.getComponent('ShopMain')?.home?.active",timeout=90000)
            page.evaluate(shared['shared']['LOCATORS']);touch=shared['Controls'](page)
            touch.tap('Hotspot_rooms',scope=None);touch.kind('rooms')
            page.wait_for_function("()=>pairQA.find('Room',pairQA.find('Artwork'))?.getComponent(cc.Sprite)?.spriteFrame")
            layout=page.evaluate('''()=>{const q=pairQA;return {
                scene:q.box(q.find('Artwork')),header:q.box(q.find('Header',q.find('DeskPage'))),
                filters:['BreedFilter','GrowthStageFilter'].map(n=>q.box(q.find(n))),
                switches:[0,1,2].map(i=>q.box(q.find('RoomSwitch'+i))),count:q.box(q.find('RoomCount')),
                text:q.texts(q.find('DeskPage'))};}''')
            assert abs(layout['scene']['top']-layout['header']['bottom'])<1,layout
            assert all(abs(f['bottom']-f['top']-34)<1 for f in layout['filters'])
            assert all(layout['scene']['top']<b['top']<b['bottom']<layout['scene']['bottom'] for b in layout['switches'])
            assert layout['count']['right']>width*.9 and layout['count']['bottom']<layout['scene']['bottom']
            assert '15只' in layout['text'] and not any(t in layout['text'] for t in ['兔房名册','进繁育台','挑选出售'])
            assert not page.evaluate("()=>['Tab0','Tab1','Tab2'].some(n=>pairQA.find(n))")
            if output:page.screenshot(path=str(output/f'动物小屋-实际-{width}.png'))
            touch.option('BreedFilter','垂耳兔')
            assert len(page.evaluate('pairQA.visit().data.rows.filter(r=>r.animal)'))==3
            assert page.evaluate("pairQA.texts(pairQA.find('RoomCount')).includes('3/15只')")
            touch.option('GrowthStageFilter','幼年')
            assert not page.evaluate('pairQA.visit().data.rows.some(r=>r.animal)')
            touch.tap('RoomSwitch1');touch.kind('locked')
            assert page.evaluate("!!pairQA.find('Lock',pairQA.find('RoomSwitch1'))")
            touch.tap('RoomSwitch0');touch.kind('rooms')
            touch.tap('ViewDetails',scope='Animal0');touch.kind('pet')
            labels=page.evaluate("[0,1,2,3].map(i=>pairQA.texts(pairQA.find('Action'+i))[0])")
            assert labels==['取消留种','特征复评','去繁育','去市场'],labels
            buttons=page.evaluate("[0,1,2,3].map(i=>pairQA.box(pairQA.find('Action'+i)))")
            assert abs(buttons[0]['top']-buttons[1]['top'])<1 and abs(buttons[2]['top']-buttons[3]['top'])<1
            assert buttons[0]['right']<buttons[1]['left'] and buttons[0]['bottom']<buttons[2]['top']
            assert all(b['bottom']<=page.viewport_size['height'] for b in buttons)
            if output:page.screenshot(path=str(output/f'个体档案-实际-{width}.png'))
            touch.tap('Action3');touch.wait("pairQA.visit().key==='market'")
            protected=page.evaluate("pairQA.visit().data.rows.find(r=>r.animal?.id==='layout-0')")
            assert protected and not protected.get('select')
            touch.tap('Details',scope='Row0');touch.kind('pet')
            touch.tap('Action0');touch.wait("pairQA.ready()&&!pairQA.visit().data.presentation.animal.retained")
            assert page.evaluate("pairQA.texts(pairQA.find('Action0'))[0]")=='留种'
            touch.tap('Action1');touch.kind('review')
            touch.tap('Back');touch.kind('pet')
            touch.tap('Action2');touch.kind('pair')
            assert page.evaluate("pairQA.visit().data.presentation.parents.some(p=>p?.id==='layout-0')")
            assert page.evaluate("[0,1,2].every(i=>!!pairQA.find('RoomSwitch'+i))&&!pairQA.find('SpeciesFilter')")
            assert page.evaluate("!!pairQA.find('BreedFilter')")
            if output:page.screenshot(path=str(output/f'繁育台-实际-{width}.png'))
            assert not errors,errors
            assert not fonts,fonts
            print(f'{width}px room scene switches/count/filters, profile two-row actions, protected market, retention, review and breeding navigation passed.',flush=True)
        finally:context.close();process.terminate();process.wait(timeout=15)

if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--webkit',action='store_true');parser.add_argument('--screenshots',type=Path)
    args=parser.parse_args()
    if args.screenshots:args.screenshots.mkdir(parents=True,exist_ok=True)
    with sync_playwright() as p:
        browser=p.webkit.launch() if args.webkit else p.chromium.launch(channel='msedge',args=['--use-angle=swiftshader'])
        try:
            for width in (320,390):check(browser,width,args.screenshots)
        finally:browser.close()
