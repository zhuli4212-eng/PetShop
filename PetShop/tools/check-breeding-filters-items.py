"""Check breeding filters and applied-item cards using an isolated shop and real canvas taps."""
import argparse
import json
from pathlib import Path
import runpy
import subprocess
from tempfile import TemporaryDirectory

from playwright.sync_api import sync_playwright

PROJECT=Path(__file__).resolve().parents[1]
shared=runpy.run_path(str(PROJECT/'tools/check-breeding-controls.py'))
SEED=r"""
import {GameStore} from './server/game-store.mjs';
import {createPetShopServer} from './server/main.mjs';
import {SPECIES,BREEDS} from './server/care.mjs';
const [directory,webRoot]=process.argv.slice(1),now=Date.now();
const store=new GameStore(directory);store.ensure();
const s=store.state,base=structuredClone(s.pets),room=structuredClone(s.rooms.rabbit);
s.visitBook.opening=false;s.shopXp=18000;s.pets=[];
for(const [species,cfg] of Object.entries(SPECIES)){
  s.rooms[species]=structuredClone(room);
  Object.assign(s.rooms[species].items,{guide:2,single:2,double:2});
  for(const breedKey of cfg.breeds){
    if(breedKey==='maine')continue;
    for(const [i,sex] of ['母','公'].entries()){
      const p=structuredClone(base.find(p=>p.sex===sex));
      Object.assign(p,{id:species+'-'+breedKey+'-'+i,name:BREEDS[breedKey].name+(i?'阿栗':'小满'),species,breedKey,
        bornAt:now-86400000,bred:false,retained:breedKey==='angora'&&i===0,mixed:false});
      p.traits.forEach((t,k)=>{t.grade=(i?['A','B','S','B','A','B']:['B','A','B','S','B','A'])[k];});
      s.pets.push(p);
    }
  }
}
const mixed=structuredClone(s.pets.find(p=>p.id==='rabbit-angora-1'));
Object.assign(mixed,{id:'rabbit-mixed-1',name:'杂交亲本',mixed:true});s.pets.push(mixed);
store.save(s);
createPetShopServer(webRoot,{store}).listen(0,'127.0.0.1',function(){console.log(this.address().port);});
"""

class Controls:
    def __init__(self,page):self.page=page
    def wait(self,expression,arg=None):self.page.wait_for_function(expression,arg=arg,timeout=20000)
    def ready(self):self.wait('()=>pairQA.ready()')
    def kind(self,value):self.wait('k=>pairQA.ready()&&pairQA.visit().data.presentation?.kind===k',value)
    def reveal(self,node=None,text=None,scope='DeskPage'):
        spec={'node':node,'text':text,'scope':scope}
        if scope:self.ready()
        self.wait('spec=>!!pairQA.measure(spec)',spec)
        for _ in range(20):
            box=self.page.evaluate('''spec=>{
                const root=spec.scope?pairQA.find(spec.scope):null;
                const n=spec.node?pairQA.find(spec.node,root):pairQA.title(spec.text,root);
                return {...pairQA.measure(spec),bounds:pairQA.box(n)};
            }''',spec)
            if box['bounds']['top']>=box['clip']['top']-.5 and box['bounds']['bottom']<=box['clip']['bottom']+.5:
                return box
            moved=self.page.evaluate(r'''spec=>{
                const q=pairQA,root=q.find(spec.scope),n=spec.node?q.find(spec.node,root):q.title(spec.text,root);
                const box=q.measure(spec),bounds=q.box(n);
                for(let parent=n.parent;parent;parent=parent.parent){
                    const scroll=parent.getComponent(cc.ScrollView);
                    if(!scroll)continue;
                    scroll.stopAutoScroll();
                    const delta=bounds.top<box.clip.top+2?bounds.top-box.clip.top-2:bounds.bottom-box.clip.bottom+2;
                    const at=scroll.getScrollOffset().y;
                    const next=Math.max(0,Math.min(scroll.getMaxScrollOffset().y,at+delta));
                    scroll.scrollToOffset(new cc.Vec2(0,next),0);
                    return Math.abs(next-at)>0.1;
                }
                return false;
            }''',spec)
            assert moved,(spec,box)
            self.page.wait_for_timeout(80)
        raise AssertionError(('Not visible',spec))
    def tap(self,node=None,text=None,scope='DeskPage'):
        box=self.reveal(node,text,scope)
        self.page.touchscreen.tap(box['x'],box['y'])
        self.page.wait_for_timeout(60)
        if scope:self.ready()
    def option(self,field,label):
        self.tap(field)
        labels=self.page.evaluate("pairQA.find('Options').children.filter(n=>n.name.startsWith('Option')).map(n=>n.getChildByName('Caption').getComponent(cc.Label).string)")
        assert label in labels,(field,label,labels)
        self.tap('Option'+str(labels.index(label)),scope='FilterMenu')
    def parent(self,id):
        index=self.page.evaluate('id=>pairQA.visit().data.presentation.candidates.findIndex(p=>p.id===id)',id)
        assert index>=0,id
        self.tap('Animal'+str(index))
        self.wait('id=>pairQA.visit().data.presentation.parents.some(p=>p?.id===id)',id)

def check(browser,web,width,output):
    with TemporaryDirectory(prefix='petshop-breeding-ui-') as directory:
        process=subprocess.Popen(['node','--input-type=module','-e',SEED,directory,str(web)],cwd=PROJECT,
            stdout=subprocess.PIPE,text=True,encoding='utf-8',creationflags=getattr(subprocess,'CREATE_NO_WINDOW',0))
        context=browser.new_context(viewport={'width':width,'height':568 if width==320 else 844},is_mobile=True,has_touch=True,
                                    device_scale_factor=1,reduced_motion='reduce')
        page=context.new_page();errors=[];fonts=[]
        page.on('pageerror',lambda error:errors.append(str(error)))
        page.on('request',lambda r:fonts.append(r.url) if r.url.split('?')[0].endswith(('.ttf','.woff2')) else None)
        def state():return json.loads((Path(directory)/'shop.json').read_text(encoding='utf-8'))
        try:
            origin='http://127.0.0.1:'+process.stdout.readline().strip()
            page.goto(origin)
            page.wait_for_function("window.cc?.director.getScene()?.getChildByName('Canvas')?.getComponent('ShopMain')?.home?.active",timeout=90000)
            page.evaluate(shared['LOCATORS']);touch=Controls(page)
            touch.tap('Hotspot_breed',scope=None);touch.kind('pair')
            page.wait_for_function("()=>pairQA.find('Room',pairQA.find('ParentPair'))?.getComponent(cc.Sprite)?.spriteFrame")
            def scene(selected):
                slots=page.evaluate('''()=>{
                    const q=pairQA,scene=q.find('ParentPair');
                    return {bounds:q.box(scene),slots:[0,1].map(i=>{
                        const slot=q.find('Slot'+i,scene),sprite=q.find('Portrait',slot);
                        return {bounds:q.box(slot),sprite:!!sprite,sex:!!q.find('Sex',slot)};
                    })};
                }''')
                b=slots['bounds']
                assert abs((b['right']-b['left'])/(b['bottom']-b['top'])-16/9)<.01
                for i,slot in enumerate(slots['slots']):
                    sb=slot['bounds'];x=(sb['left']+sb['right'])/2
                    assert abs(x/width-(.27 if i==0 else .73))<.01
                    assert slot['sprite']==(i in selected) and slot['sex']==(i not in selected)
            scene([])
            if output:page.screenshot(path=str(output/f'繁育场景待选亲本-{width}.png'))
            assert not page.evaluate("()=>['Tab0','Tab1','Tab2'].some(n=>pairQA.find(n,pairQA.find('DeskPage')))")
            touch.option('BreedFilter','安哥拉兔')
            assert page.evaluate("pairQA.visit().data.presentation.candidates.map(p=>p.id)")==['rabbit-angora-0','rabbit-angora-1']
            if output:page.screenshot(path=str(output/f'繁育品种筛选-{width}.png'))
            touch.parent('rabbit-angora-0')
            touch.option('BreedFilter','垂耳兔');touch.parent('rabbit-lop-1')
            assert page.evaluate("pairQA.visit().data.presentation.parents.map(p=>p.id)")==['rabbit-angora-0','rabbit-lop-1']
            scene([0,1])
            if output:page.screenshot(path=str(output/f'繁育场景已选亲本-{width}.png'))
            touch.tap('Review');touch.kind('pairConfirm')
            scene([0,1])
            assert len(page.evaluate('pairQA.visit().data.rows'))==1

            def add_items():
                touch.tap('AddItems');touch.wait("pairQA.visit().key==='breedItems'")
                touch.tap('Row0');touch.tap('Row2');touch.tap('Row3');touch.tap('Row5')
                touch.tap(text='完成');touch.kind('pairConfirm')
                rows=page.evaluate('pairQA.visit().data.rows')
                assert len(rows)==3 and '选育指导单' in rows[1]['title'] and rows[2]['title']=='双项选育单 · 性格、毛发',rows
                assert '80%' in rows[1]['text'] and '绿色' in rows[1]['text'] and '蓝色' in rows[2]['text']
                assert state()['rooms']['rabbit']['items']['guide']==2
                assert state()['rooms']['rabbit']['items']['double']==2
            add_items()
            touch.reveal('Row2')
            bounds=page.evaluate("()=>['Row0','Row1','Row2','AddItems','Action0','CancelPair'].map(name=>pairQA.box(pairQA.find(name,pairQA.find('DeskPage'))))")
            assert bounds[0]['bottom']<bounds[1]['top']<bounds[1]['bottom']<bounds[2]['top']
            if output:page.screenshot(path=str(output/f'确认配对已添加道具-{width}.png'))
            assert bounds[2]['bottom']<bounds[3]['top'],bounds
            assert all(0<=b['left']<b['right']<=width+1 for b in bounds)
            assert all(0<=b['top']<b['bottom']<=page.viewport_size['height']+1 for b in bounds[3:])
            touch.tap('AddItems');touch.tap('Row0');touch.tap('Row2');touch.tap(text='完成');touch.kind('pairConfirm')
            assert len(page.evaluate('pairQA.visit().data.rows'))==1
            touch.tap('CancelPair');touch.kind('pair')
            assert page.evaluate("pairQA.visit().args.breed")=='lop'
            touch.option('SpeciesFilter','猫');touch.kind('pair')
            assert page.evaluate('pairQA.visit().data.presentation.parents')==[None,None]
            assert page.evaluate('pairQA.visit().data.filters[1][0].active')
            touch.option('BreedFilter','缅因猫')
            assert page.evaluate('pairQA.visit().data.presentation.candidates')==[]
            assert page.evaluate("!!pairQA.title('当前筛选下没有可配对的亲本。')")
            touch.option('SpeciesFilter','狗');touch.kind('pair')
            assert page.evaluate("pairQA.visit().data.filters[1].map(o=>o.label)")==['全部','柴犬','柯基犬','贵宾犬','腊肠犬']
            touch.option('SpeciesFilter','兔');touch.option('BreedFilter','杂交')
            assert page.evaluate('pairQA.visit().data.presentation.candidates.map(p=>p.id)')==['rabbit-mixed-1']
            touch.option('BreedFilter','安哥拉兔');touch.parent('rabbit-angora-0');touch.parent('rabbit-angora-1')
            touch.tap('Review');touch.kind('pairConfirm');add_items()
            touch.tap('Action0');touch.tap('Accept',scope='Confirm');touch.kind('breeding')
            room=state()['rooms']['rabbit']
            assert room['items']['guide']==1 and room['items']['double']==1 and room['items']['single']==2
            assert room['job']['options']['selection']=={'item':'double','fields':[0,2]}
            assert page.evaluate('pairQA.visit().data.filters.length')==1
            assert not errors,errors
            assert not fonts,fonts
            print(f'{width}px filters, cross-breed selection, applied-item cards, removal, reset, empty list and real breeding passed.',flush=True)
        finally:
            context.close();process.terminate();process.wait(timeout=15)

if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--web-root',type=Path,default=PROJECT/'build/web-mobile')
    parser.add_argument('--screenshots',type=Path)
    parser.add_argument('--webkit',action='store_true')
    args=parser.parse_args()
    if args.screenshots:args.screenshots.mkdir(parents=True,exist_ok=True)
    with sync_playwright() as p:
        browser=p.webkit.launch() if args.webkit else p.chromium.launch(channel='msedge',args=['--use-angle=swiftshader'])
        try:
            for width in (320,390):check(browser,args.web_root.resolve(),width,args.screenshots)
        finally:browser.close()
