"""Touch the built Web Mobile rooms in Edge using a disposable, deliberately unordered roster."""
import argparse
import json
import re
import subprocess
from pathlib import Path
from tempfile import TemporaryDirectory

from PIL import Image
from playwright.sync_api import sync_playwright


GAME = Path(__file__).resolve().parents[1]
RESOURCES = GAME / "assets/resources"
STAGES = ["全部", "幼年", "成长", "成年", "老年", "已故"]
BREEDS = {"rabbit": ["domestic", "lop", "angora", "lionhead"],
          "cat": ["british", "american", "persian", "maine"],
          "dog": ["shiba", "corgi", "poodle", "dachshund"]}
BREED_NAMES = dict(zip(
    [key for keys in BREEDS.values() for key in keys],
    ["原色兔", "垂耳兔", "安哥拉兔", "狮子兔", "英国短毛猫", "美国短毛猫", "波斯猫", "缅因猫",
     "柴犬", "柯基犬", "贵宾犬", "腊肠犬"],
))
SERVER = """
import { GameStore } from './server/game-store.mjs';
import { createPetShopServer } from './server/main.mjs';
import { lifeDates } from './server/care.mjs';
import { createInterface } from 'node:readline';
const now=Date.now(), ticking=process.argv[3]==='countdowns';
let jump=0;
const store=new GameStore(process.argv[1],ticking?{wall:()=>Date.now()+jump}:{wall:()=>now,monotonic:()=>0});
store.ensure();
const s=store.state, template=s.pets[0], samples=JSON.parse(process.argv[2]);
s.rooms.cat=structuredClone(s.rooms.rabbit); s.rooms.dog=structuredClone(s.rooms.rabbit);
s.visitBook.opening=false;
s.shopXp=18000;
s.pets=samples.map(({busy,stage,minutes,...p})=>({...structuredClone(template),...p,breedGrowth:false,bornAt:now-minutes*60000}));
['从容','眼神灵动','绒光','仪态出众','比例匀美'].forEach((label,i)=>{
  s.pets[0].traits[i]={...s.pets[0].traits[i],label,rarity:'稀有'};
  delete s.pets[0].traits[i].tagId;
});
for (const [species,room] of Object.entries(s.rooms)){
  room.items.review=2;
  const [mother,father]=['母','公'].map(sex=>s.pets.find(p=>p.species===species && p.sex===sex &&
    samples.find(a=>a.id===p.id).busy));
  room.job={motherId:mother.id,fatherId:father.id,mother,father,endsAt:now+86400000,offspring:[]};
}
store.save(s);
const server=createPetShopServer(process.argv[4],{store});
server.listen(0,'127.0.0.1',()=>console.log(server.address().port));
if(ticking)createInterface({input:process.stdin}).on('line',id=>{
  const target=s.pets.find(p=>p.id===id);
  jump=lifeDates(target).growthAt-Date.now()-9000;
  console.log('boundary armed');
});
"""


def fixture(reverse):
    pets = []
    for n, (species, breeds) in enumerate(BREEDS.items()):
        for i in range(16):
            stage = (["成长", "成年", "成年", "已故", "成年", "老年", "成年", "幼年",
                      "成年", "已故", "成年", "幼年", "成年", "成年", "幼年", "成年"])[i]
            minutes = {"幼年": 2, "成长": (16, 44, 50)[n], "成年": 1440,
                       "老年": (3, 4, 5)[n] * 1440 + 200, "已故": 15 * 1440}[stage]
            sex = "母" if i in (1, 2, 3, 6, 7, 8, 14, 15) else "公"
            # The two adjacent animals are the same breed/coat/sex at different ages.
            breed, coat = (breeds[0], 2) if i in (7, 8) else (breeds[(i * 3) % 4], 1 + (i * 5) % 6)
            pets.append(dict(id=f"{(i * 11 + n * 16) % 53 + 0xab100:05x}-qa-{species}-{i}",
                             name=("青禾 山桃 小葵 奶酥 胡桃 桔梗 小麦 云团 棉花 银杏 "
                                   "豆沙 小满 枫糖 柚子 梨花 南星").split()[i],
                             species=species, sex=sex, breedKey=breed, coatIndex=coat,
                             retained=i in (1, 3, 8) or (n == 1 and i in (5, 10)), bred=i in (4, 13),
                             busy=i in (1, 12), stage=stage, minutes=minutes))
    return pets[::-1] if reverse else pets


def matches(p, breed, stage):
    return (stage == "全部" or p["stage"] == stage) and (breed == "全部" or BREED_NAMES[p["breedKey"]] == breed)


def countdown_fixture():
    pets=fixture(False)
    rabbits=[p for p in pets if p['species']=='rabbit']
    rabbits[0].update(name='无花果·12',retained=True)
    for i in (6,7,9,10,11,13,14,15):
        rabbits[i].update(stage='幼年',minutes=8 if i==6 else 1)
    return pets


def visible_rect(image):
    box = image.getchannel("A").point(lambda a: 255 if a >= 128 else 0).getbbox()
    assert box is not None
    return [box[0]/image.width-.5, .5-box[3]/image.height,
            box[2]/image.width-.5, .5-box[1]/image.height]


def artwork(p):
    ident = f"{p['breedKey']}-coat{p['coatIndex']:02d}_{'female' if p['sex']=='母' else 'male'}"
    young, dead = p["stage"] == "幼年", p["stage"] == "已故"
    path = RESOURCES / ("pet-young" if young else "pets") / (ident + ".png")
    if dead:
        shared = path.with_name(ident.split("_")[0] + "-rest.png")
        path = shared if shared.exists() else path.with_name(ident + "-rest.png")
    meta = json.loads(path.with_suffix(".png.meta").read_text(encoding="utf-8"))
    with Image.open(path) as im:
        idle = visible_rect(im)
    info = dict(id=p["id"], stage=p["stage"], uuid=meta["subMetas"]["f9941"]["uuid"],
                idle=idle, walker=not dead and not p["busy"])
    if info["walker"]:
        strip = RESOURCES / ("pet-young-walk" if young else "pet-walk") / (ident + ".png")
        tex = json.loads(strip.with_suffix(".png.meta").read_text(encoding="utf-8"))
        info["texture"] = tex["uuid"] + "@6c48a"
        with Image.open(strip) as im:
            info["frames"] = [visible_rect(im.crop((i*96, 0, i*96+96, 96))) for i in range(4)]
    return info


BROWSER = r"""() => {
  const main=cc.director.getScene().getChildByName('Canvas').getComponent('ShopMain');
  const ui=n=>n.getComponent('cc.UITransform');
  const nodes=(root)=>[root,...root.children.flatMap(nodes)];
  const find=(name,root=main.node)=>nodes(root).find(n=>n.activeInHierarchy && n.name===name);
  const label=(node,name)=>node.getChildByName(name).getComponent(cc.Label).string;
  const point=(pos)=>{
    const s=main.node.getComponent(cc.Canvas).cameraComponent.worldToScreen(pos);
    const c=document.querySelector('canvas'),r=c.getBoundingClientRect();
    return [r.x+s.x*r.width/c.width,r.bottom-s.y*r.height/c.height];
  };
  const visit=()=>main.session.current;
  const art=()=>find('Artwork',find('DeskPage'));
  const residents=()=>art().children.filter(n=>/^Resident\d+$/.test(n.name))
    .sort((a,b)=>Number(a.name.slice(8))-Number(b.name.slice(8)));
  const rect=(resident,expected)=>{
    const n=resident.getChildByName('Portrait'),s=n.getComponent(cc.Sprite),f=s.spriteFrame;
    const box=f._uuid===expected.uuid ? expected.idle :
      f.texture?._uuid===expected.texture ? expected.frames[f.rect.x / 96] : null;
    if(!box) throw Error('Incorrect pose '+resident.name+' '+f._uuid+' for '+expected.id);
    const a=ui(art()),t=ui(n);
    const corners=[0,2].map(j=>a.convertToNodeSpaceAR(t.convertToWorldSpaceAR(
      new cc.Vec3(box[j]*t.width,box[j+1]*t.height,0))));
    const xs=corners.map(p=>p.x/a.width+.5),ys=corners.map(p=>.5-p.y/a.height);
    return [Math.min(...xs),Math.min(...ys),Math.max(...xs),Math.max(...ys)];
  };
  const positions=()=>residents().map(n=>[n.position.x/ui(art()).width,n.position.y/ui(art()).height]
    .map(value=>Number(value.toFixed(6))));
  const bounds=n=>{
    const t=ui(n);
    const pos=(x,y)=>point(t.convertToWorldSpaceAR(new cc.Vec3(x,y,0)));
    const [left,bottom]=pos(-t.anchorX*t.width,-t.anchorY*t.height);
    const [right,top]=pos((1-t.anchorX)*t.width,(1-t.anchorY)*t.height);
    return {left,right,top,bottom};
  };
  const row=id=>{
    const animals=visit().data.rows.filter(r=>r.animal);
    return find('Animal'+animals.findIndex(r=>r.animal.id===id),find('DeskPage'));
  };
  const viewport=n=>{
    for(let p=n.parent;p;p=p.parent)if(p.getComponent(cc.Mask))return bounds(p);
    throw Error('Missing room roster scroll mask');
  };
  window.roomQA={find,label,point,visit,residents,rect,art,ui,positions,bounds,row,viewport,
    scroll:()=>main.session.scroll};
}"""


def tap(page, name):
    point = page.evaluate("""name=>{
      const q=roomQA, node=q.find(name);
      const target=name.startsWith('Hotspot_')?node?.getChildByName('Sign')??node:node;
      return target&&q.point(target.worldPosition);
    }""", name)
    assert point and 0 <= point[0] < page.viewport_size["width"] and 0 <= point[1] < page.viewport_size["height"], (name, point)
    page.touchscreen.tap(*point)


def varied(samples):
    # Sorting coordinates ignores which individual received a point. Simply
    # shuffling pets among an invariant set of floor slots fails this check.
    for axis in (0, 1):
        coordinates = [sorted(p[axis] for p in sample) for sample in samples]
        if not any(max(values) - min(values) > .015 for values in zip(*coordinates)):
            return False
    if len(samples[0]) >= 3:
        for sample in samples:
            levels = []
            for depth in sorted(p[1] for p in sample):
                if not levels or depth-levels[-1] >= .03:
                    levels.append(depth)
            if len(levels) >= 3:
                return True
        return False
    return True


NEXT_STAGE={'幼年':'距成长','成长':'距成年','成年':'距老年','老年':'距寿终'}
TIMER=re.compile(r'(?:距\S+ )?(?:(\d+) 天|(\d+) 小时 (\d+) 分|(\d+) 分 (\d+) 秒)')


def seconds(text):
    match=TIMER.fullmatch(text.strip())
    assert match,text
    days,hours,hour_minutes,minutes,seconds=(int(i or 0) for i in match.groups())
    minutes+=hour_minutes
    assert minutes<60 and seconds<60,text
    return ((days*24+hours)*60+minutes)*60+seconds


def row_controls(page,id):
    return page.evaluate("""id=>{
      const q=roomQA,r=q.row(id);
      const fields=Object.fromEntries(['Name','Number','ScoreLabel','Score','Stage','Identity','StockBadge','StageCountdown','ViewDetails','ExpandTraits']
        .map(k=>[k,r.getChildByName(k)]).filter(([,n])=>n).map(([k,n])=>[k,{
          text:(n.getComponent(cc.Label)||n.getChildByName('Caption').getComponent(cc.Label)).string,
          ...q.bounds(n)}]));
      const v=q.visit(),animal=v.data.rows.find(r=>r.animal?.id===id).animal;
      fields.thumb=q.bounds(r.getChildByName('Thumb'));
      fields.card=q.bounds(r);
      fields.remaining=animal.stageEndsAt==null?null:Math.ceil((animal.stageEndsAt-v.serverClockOffset-performance.now())/1000);
      return fields;
    }""",id)


def tap_row_control(page,id,name):
    page.evaluate("""([id,name])=>{
      const q=roomQA,n=q.row(id).getChildByName(name),s=q.scroll(),content=s.content;
      const p=q.ui(content).convertToNodeSpaceAR(n.worldPosition);
      s.stopAutoScroll();s.scrollToOffset(new cc.Vec2(0,Math.max(0,Math.min(s.getMaxScrollOffset().y,-p.y-60))),0);
    }""",[id,name])
    point=page.evaluate("([id,name])=>roomQA.point(roomQA.row(id).getChildByName(name).worldPosition)",[id,name])
    page.touchscreen.tap(*point)


def verify_design(page,screenshots=None):
    ids=page.evaluate("roomQA.visit().data.rows.filter(r=>r.animal).slice(0,2).map(r=>r.animal.id)")
    assert len(ids)==2
    assert page.evaluate("roomQA.visit().expandedAnimal===undefined")
    for id in ids:
        fields=row_controls(page,id)
        assert all(abs(fields[key]['left']-fields['Name']['left'])<1
                   for key in ('Identity','Stage')),fields
        assert fields['thumb']['bottom']<fields['Score']['top'],fields
        assert fields['ScoreLabel']['text']=='评分' and fields['ViewDetails']['text']=='详情',fields
        assert fields['card']['bottom']-fields['card']['top']<=115,fields
        if 'StageCountdown' in fields:
            name,clock=fields['Name'],fields['StageCountdown']
            assert abs(clock['top']+clock['bottom']-name['top']-name['bottom'])<1,fields
            assert name['right']<clock['left'] and clock['right']<fields['ViewDetails']['left'],fields
            assert clock['bottom']<=fields['Identity']['top']+1,fields
        toggle=fields['ExpandTraits']
        assert toggle['text']=='展开' and toggle['bottom']-toggle['top']<=30,toggle
        assert page.evaluate("""id=>{
          const row=roomQA.row(id),control=row.getChildByName('ExpandTraits');
          return !row.getChildByName('TraitType0') && !control.getComponent(cc.Graphics)
            && !!control.getChildByName('Chevron');
        }""",id)
    tap_row_control(page,ids[0],'Thumb')
    page.wait_for_function("id=>roomQA.visit().expandedAnimal===id && !!roomQA.row(id).getChildByName('TraitType0')",arg=ids[0])
    assert row_controls(page,ids[0])['ExpandTraits']['text']=='收起'
    tap_row_control(page,ids[1],'Name')
    page.wait_for_function("([first,second])=>roomQA.visit().expandedAnimal===second && !roomQA.row(first).getChildByName('TraitType0') && !!roomQA.row(second).getChildByName('TraitType0')",arg=ids)
    tap_row_control(page,ids[0],'ViewDetails')
    page.wait_for_function("id=>roomQA.visit()?.data?.presentation?.animal?.id===id",arg=ids[0])
    # Cocos Font assets and browser FontFace readiness are separate checks.
    # Verify the actual three browser families before trusting canvas screenshots.
    try:
        page.wait_for_function("""()=>{const faces=[...document.fonts].filter(f=>/Noto(Sans|Serif)CJKsc/.test(f.family));
          return new Set(faces.map(f=>f.family)).size===3&&faces.every(f=>f.status==='loaded');}""",timeout=90000)
    finally:
        font_faces=page.evaluate("[...document.fonts].map(f=>({family:f.family,status:f.status}))")
        print(f"{page.viewport_size['width']}px browser FontFace status: {json.dumps(font_faces,ensure_ascii=False)}",flush=True)
    check=page.evaluate(r"""()=>{
      const q=roomQA,file=q.find('AnimalFile'),data=q.visit().data,a=data.presentation.animal;
      const traits=file.getComponentsInChildren(cc.Label).filter(l=>l.node.parent.name.match(/^Trait[0-4]$/));
      const picture=q.find('Illustration',file),tags=picture.children.filter(n=>/^Tag\d+_\d+$/.test(n.name));
      return {id:q.find('Id',file).getComponent(cc.Label).string,expectedId:'#'+a.number,
        types:traits.filter(l=>l.node.name==='Type').length,grades:traits.filter(l=>l.node.name==='Grade').length,
        oldColumns:traits.filter(l=>['Tag','Rarity'].includes(l.node.name)).length,
        tags:tags.map(n=>q.label(n,'Caption')).sort(),expectedTags:a.tags.map(t=>t.label).sort(),
        tagLines:new Set(tags.map(n=>n.position.y)).size,
        defect:q.label(q.find('Defect',file),'Caption'),expectedDefect:a.defect.label+' · '+a.defect.grade,
        prices:data.rows.filter(r=>['品种和品质','阶段与繁育','荣誉加价','店铺加成'].includes(r.title)).length,
        fonts:q.find('Canvas',cc.director.getScene()).getComponentsInChildren(cc.Label)
          .filter(l=>!l.font||l.useSystemFont||l.isBold).map(l=>[l.node.name,l.string,l.font?.name,l.useSystemFont,l.isBold]),
        nameFont:q.find('Name',file).getComponent(cc.Label).font?.name,
        nameSize:q.find('Name',file).getComponent(cc.Label).fontSize,
        bodySize:traits.find(l=>l.node.name==='Type').fontSize,
        typeFont:traits.find(l=>l.node.name==='Type').font?.name,
        gradeFont:traits.find(l=>l.node.name==='Grade').font?.name};
    }""")
    assert check['id']==check['expectedId'] and check['types']==check['grades']==5 and check['oldColumns']==0,check
    assert check['tags']==check['expectedTags'] and check['tagLines']<=2 and check['defect']==check['expectedDefect'] and check['prices']==0,check
    assert not check['fonts'] and 'Serif' in check['nameFont'] and 'Sans' in check['typeFont'] and 'Bold' in check['gradeFont'],check
    assert check['nameSize']==21 and check['bodySize']==14,check
    if screenshots:
        screenshots.mkdir(parents=True,exist_ok=True)
        page.screenshot(path=str(screenshots/f"detail-{page.viewport_size['width']}.png"),timeout=90000)
    review_index=page.evaluate("roomQA.visit().data.actions.findIndex(a=>a.page==='review'&&!a.disabled)")
    assert review_index>=0
    tap(page,'Action'+str(review_index))
    page.wait_for_function("roomQA.visit()?.data?.presentation?.kind==='review'")
    state=page.evaluate("""()=>{const q=roomQA,p=q.visit().data;return {
      use:p.actions.filter(a=>a.type==='care.review'),title:p.title,beforeTags:p.presentation.animal.tags,reviews:p.presentation.reviews,
      buttons:[0,1,2].map(i=>q.bounds(q.find('Action'+i))),
      tagRows:q.find('DeskPage').getComponentsInChildren(cc.Label).filter(l=>l.node.name==='Type'&&/^ReviewTag/.test(l.node.parent.name)).length,
      count:p.presentation.animal.tags.length,fieldActions:p.rows.some(r=>!!r.action)};}""")
    assert len(state['use'])==1 and 'field' not in state['use'][0]['args'] and state['tagRows']==state['count'] and not state['fieldActions'],state
    review_columns=page.evaluate("""count=>Array.from({length:count},(_,i)=>{
      const q=roomQA,row=q.find('ReviewTag'+i);
      return ['Type','Tag','Rarity'].map(name=>q.bounds(row.getChildByName(name)));
    })""",state['count'])
    for field,tag,rarity in review_columns:
        assert field['right']<=tag['left'] and tag['right']<=rarity['left']
        assert abs(tag['left']-review_columns[0][1]['left'])<1
    assert state['title']=='特征复评' and all(b['bottom']-b['top']>=44 for b in state['buttons']),state
    assert abs(state['buttons'][1]['top']-state['buttons'][2]['top'])<1 and state['buttons'][0]['bottom']<=state['buttons'][1]['top'],state
    if screenshots:page.screenshot(path=str(screenshots/f"review-{page.viewport_size['width']}.png"),timeout=90000)
    tap(page,'Action0')
    page.wait_for_function("(()=>{const m=cc.director.getScene().getChildByName('Canvas').getComponent('ShopMain');return m.session.confirm?.text?.includes('可能降档');})()")
    # Cancel using the dialog's actual cancel button; remain in the same review.
    cancel=page.evaluate("""()=>{const q=roomQA,all=q.find('Canvas',cc.director.getScene()).getComponentsInChildren(cc.Label);
      const l=all.find(l=>l.node.activeInHierarchy&&['暂不','取消','返回'].includes(l.string)&&l.node.parent.name==='Cancel');
      const n=l?.node.parent||q.find('Cancel');return n&&q.point(n.worldPosition);}""")
    assert cancel
    page.touchscreen.tap(*cancel)
    page.wait_for_function("(()=>{const m=cc.director.getScene().getChildByName('Canvas').getComponent('ShopMain');return !m.session.confirm&&roomQA.visit()?.data?.presentation?.kind==='review';})()")
    tap(page,'Back')
    page.wait_for_function("id=>roomQA.visit()?.data?.presentation?.animal?.id===id&&roomQA.visit().key==='pet'",arg=ids[0])
    review_index=page.evaluate("roomQA.visit().data.actions.findIndex(a=>a.page==='review'&&!a.disabled)")
    tap(page,'Action'+str(review_index))
    page.wait_for_function("roomQA.visit()?.data?.presentation?.kind==='review'")
    tap(page,'Action0')
    page.wait_for_function("!!roomQA.find('Confirm')")
    tap(page,'Accept')
    page.wait_for_function("""([id,reviews])=>{const v=roomQA.visit();return v?.key==='pet'&&v.data?.presentation?.animal?.id===id&&
      v.data.rows.some(r=>r.title==='复评 '+reviews+' / 3 次');}""",arg=[ids[0],state['reviews']+1])
    result=page.evaluate("""()=>{const p=roomQA.visit().data;return {tags:p.presentation.animal.tags,
      history:p.rows.some(r=>r.title.endsWith('复评')&&r.text?.includes(' → '))};}""")
    assert result['history'] and len(result['tags'])==len(state['beforeTags']),result
    assert sum(a['rarity']!=b['rarity'] for a,b in zip(result['tags'],state['beforeTags']))==1,result
    for a,b in zip(result['tags'],state['beforeTags']):
        assert [a[k] for k in ('tagId','label','grade')]==[b[k] for k in ('tagId','label','grade')],result
    tap(page,'Back')
    page.wait_for_function("id=>roomQA.visit()?.key==='rooms' && roomQA.visit().expandedAnimal===id",arg=ids[1])
    tap_row_control(page,ids[1],'ExpandTraits')
    page.wait_for_function("roomQA.visit().expandedAnimal===undefined")
    page.evaluate("roomQA.scroll().scrollToTop(0)")
    if screenshots:page.screenshot(path=str(screenshots/f"roster-{page.viewport_size['width']}.png"),timeout=90000)
    print(f"{page.viewport_size['width']}px: aligned roster and review, compact expansion, V5 columns/fonts, review use/cancel and return passed",flush=True)


def verify_countdowns(page,server,rabbits,select,wait_room,screenshot):
    wait_room('rabbit')
    # Inspect countdown units and the corresponding in-game text bounds.
    for p in rabbits:
        fields=row_controls(page,p['id'])
        assert fields['Name']['text']==p['name'] and fields['ScoreLabel']['text']=='评分' and fields['Score']['text'].isdigit() and 'Number' not in fields,fields
        assert p['stage'] in fields['Stage']['text'],fields
        assert ('StockBadge' in fields)==p['retained'],fields
        if p['retained']:
            assert fields['StockBadge']['text']=='种源',fields
        assert fields['Name']['right']<=fields['ViewDetails']['left']+1,fields
        if p['stage']=='已故':
            assert 'StageCountdown' not in fields,fields
            continue
        remaining=seconds(fields['StageCountdown']['text'])
        text=fields['StageCountdown']['text']
        assert text.startswith(NEXT_STAGE[p['stage']]+' ') and remaining>0,fields
        precision=86400 if ' 天' in text else 60 if ' 小时' in text else 1
        assert -1<=fields['remaining']-remaining<=precision+1,fields
        for left in ('Identity','Stage'):
            for right in ('StageCountdown',):
                l,r=fields[left],fields[right]
                if min(l['bottom'],r['bottom'])>max(l['top'],r['top'])+2:
                    assert l['right']<=r['left']+1,fields
        assert fields['StageCountdown']['right']<=page.viewport_size['width'],fields
    long=rabbits[0]['id']
    samples=page.evaluate("""async id=>{
      const q=roomQA,n=q.row(id).getChildByName('StageCountdown'),out=[];
      const until=performance.now()+4500;
      while(performance.now()<until&&out.length<3){
        const s=n.getComponent(cc.Label).string;
        if(s!==out[out.length-1])out.push(s);
        await new Promise(r=>setTimeout(r,70));
      }return out;
    }""",long)
    readings=[seconds(value) for value in samples]
    assert len(readings)==3 and readings==list(range(readings[0],readings[0]-3,-1)),samples
    if screenshot and page.viewport_size['width']==390:
        page.wait_for_function("""id=>{const q=roomQA,n=q.row(id),b=q.bounds(n),v=q.viewport(n);
          return b.top>=v.top-1&&b.bottom<=v.bottom+1&&q.residents().every(n=>n.getComponentsInChildren(cc.Sprite)
            .some(s=>s.node.activeInHierarchy&&s.spriteFrame));}""",arg=long)
        screenshot.parent.mkdir(parents=True,exist_ok=True)
        page.screenshot(path=str(screenshot))

    for tab,species in ((1,'cat'),(2,'dog')):
        tap(page,'Tab'+str(tab))
        wait_room(species)
        sample=page.evaluate("roomQA.visit().data.rows.find(r=>r.animal?.stage==='成长').animal.id")
        assert row_controls(page,sample)['StageCountdown']['text'].startswith('距成年 ')
    tap(page,'Tab0')
    wait_room('rabbit')
    select(1,'幼年')
    wait_room('rabbit',stage='幼年')
    young=[p['id'] for p in rabbits if p['stage']=='幼年']
    moving,anchor=young[0],young[-2]
    rows=lambda:page.evaluate("roomQA.visit().data.rows.filter(r=>r.animal).map(r=>r.animal.id)")
    assert rows()==young
    cdp=page.context.new_cdp_session(page)
    def locate(id):
        return page.evaluate("""id=>{const q=roomQA,n=q.row(id),b=q.bounds(n),v=q.viewport(n);
          return {y:(b.top+b.bottom)/2,x:(b.left+b.right)/2,top:v.top,bottom:v.bottom};}""",id)
    # Use real vertical touch drags. Leave an animal visible well down the
    # nursery roster so the removal of an earlier row exercises scroll anchoring.
    for _ in range(10):
        v=locate(anchor)
        if v['top']+7<v['y']<v['bottom']-7:break
        x=v['x']; bottom=v['bottom']-14; top=v['top']+14
        assert top<bottom,v
        start,end=(bottom,top) if v['y']>(top+bottom)/2 else (top,bottom)
        distance=min(abs(end-start),abs(v['y']-(top+bottom)/2))
        end=start+distance if end>start else start-distance
        for i in range(9):
            cdp.send('Input.dispatchTouchEvent',{'type':'touchStart' if not i else 'touchMove',
                     'touchPoints':[{'x':x,'y':start+(end-start)*i/8}]})
            page.wait_for_timeout(35)
        page.wait_for_timeout(120)
        cdp.send('Input.dispatchTouchEvent',{'type':'touchEnd','touchPoints':[]})
        page.wait_for_function("!roomQA.scroll().isScrolling()&&!roomQA.scroll().isAutoScrolling()")
    else:raise AssertionError(('Could not reach young animal by touch',anchor,v))
    assert page.evaluate("roomQA.scroll().getScrollOffset().y")>30
    before=locate(anchor)
    # Move only this disposable server's logical clock close to the next natural
    # stage boundary, then let the ordinary time and room refresh advance it.
    server.stdin.write(moving+'\n');server.stdin.flush()
    assert server.stdout.readline().strip()=='boundary armed'
    page.wait_for_function("""id=>{const v=roomQA.visit();return v?.key==='rooms'&&
      !v.data.rows.some(r=>r.animal?.id===id);}""",arg=moving,timeout=25000)
    assert rows()==young[1:],rows()
    after=locate(anchor)
    assert abs(after['y']-before['y'])<3,(before,after)
    tap_row_control(page,anchor,'ViewDetails')
    page.wait_for_function("id=>roomQA.visit()?.data?.presentation?.animal?.id===id",arg=anchor)
    room_offset=page.evaluate("cc.director.getScene().getChildByName('Canvas').getComponent('ShopMain').session.feature.offset")
    tap(page,'Back')
    wait_room('rabbit',stage='幼年')
    assert abs(page.evaluate("roomQA.scroll().getScrollOffset().y")-room_offset)<3
    select(1,'成长')
    wait_room('rabbit',stage='成长')
    assert moving in rows() and row_controls(page,moving)['StageCountdown']['text'].startswith('距成年 ')
    select(1,'幼年')
    wait_room('rabbit',stage='幼年')
    tap_row_control(page,anchor,'ViewDetails')
    page.wait_for_function("id=>roomQA.visit()?.data?.presentation?.animal?.id===id",arg=anchor)
    server.stdin.write(anchor+'\n');server.stdin.flush()
    assert server.stdout.readline().strip()=='boundary armed'
    page.wait_for_function("""id=>{const q=roomQA,v=q.visit();return v?.key==='pet'&&v.data.presentation.animal.id===id&&
      v.data.presentation.animal.stage==='成长'&&q.find('DeskPage').getComponentsInChildren(cc.Label)
        .some(l=>l.node.name==='Value'&&l.string.startsWith('成长 · 距成年 '));}""",arg=anchor,timeout=25000)
    tap(page,'Back')
    wait_room('rabbit',stage='幼年')
    select(1,'已故')
    wait_room('rabbit',stage='已故')
    for id in rows():
        assert 'StageCountdown' not in row_controls(page,id)
    print(f"{page.viewport_size['width']}px: four stage timers, one-second ticks, filtered transition, scroll anchor, dossier return and deceased rows passed",flush=True)


def verify(browser, url, pets, width, growth_screenshot=None, countdown_server=None,countdown_screenshot=None,design_screenshots=None,design_only=False):
    page = browser.new_page(viewport={"width": width, "height": 568 if width == 320 else 844},
                            is_mobile=True, has_touch=True, reduced_motion="reduce", device_scale_factor=1)
    page.set_default_timeout(25000)
    errors = []
    page.on("pageerror", lambda e: errors.append(str(e)))
    page.goto(url)
    page.wait_for_function("""()=>{
        const main=window.cc?.director?.getScene()?.getChildByName('Canvas')?.getComponent('ShopMain');
        return main?.state==='open'&&main.home.active&&!main.session.active;
    }""", timeout=180000)
    page.evaluate(BROWSER)
    tap(page, "Hotspot_rooms")

    def wait_room(species, status="全部", stage="全部"):
        page.wait_for_function("""([species,status,stage])=>{
          const v=roomQA.visit(),p=v?.data;
          return v?.key==='rooms' && (v.args.species||'rabbit')===species &&
            p?.filters?.[0].find(o=>o.active)?.label===status &&
            p.filters[1].find(o=>o.active)?.label===stage && roomQA.find('BreedFilter');
        }""", arg=[species,status,stage])

    def breed_choices(species):
        return ["全部", *dict.fromkeys(BREED_NAMES[p["breedKey"]] for p in pets if p["species"] == species)]

    def select(index, label):
        tap(page, ("BreedFilter", "GrowthStageFilter")[index])
        page.wait_for_function("()=>!!roomQA.find('FilterMenu')")
        opts = page.evaluate("""()=>roomQA.find('Options',roomQA.find('FilterMenu')).children
            .map(n=>[roomQA.label(n,'Caption'),n.name])""")
        species=page.evaluate("roomQA.visit().args.species||'rabbit'")
        assert [k for k, _ in opts] == (breed_choices(species), STAGES)[index], opts
        if growth_screenshot and width == 390 and index == 1 and label == "幼年" and page.evaluate(
            "()=>roomQA.visit().data.filters[0].find(o=>o.active).label==='原色兔'"
        ):
            page.screenshot(path=str(growth_screenshot))
        tap(page, dict(opts)[label])
        page.wait_for_function("""([i,label])=>!roomQA.find('FilterMenu') &&
            !!roomQA.find('GrowthStageFilter') && roomQA.visit()?.data?.filters?.[i].find(o=>o.active)?.label===label""",
            arg=[index,label])

    def check(species, status, stage):
        wait_room(species, status, stage)
        want = [p for p in pets if p["species"] == species and matches(p,status,stage)]
        ids = [p["id"] for p in want]
        snapshot = page.evaluate(r"""()=>{
          const q=roomQA,p=q.visit().data,desk=q.find('DeskPage');
          return {rows:p.rows.filter(r=>r.animal).map(r=>r.animal.id),
            scores:p.rows.filter(r=>r.animal).map(r=>r.animal.score),
            residents:p.presentation.residents.map(r=>r.id),n:q.residents().length,matched:p.presentation.matchedCount,
            cards:desk.getComponentsInChildren(cc.Label).filter(l=>l.node.name==='Name'&&/^Animal\d+$/.test(l.node.parent.name))
              .sort((a,b)=>Number(a.node.parent.name.slice(6))-Number(b.node.parent.name.slice(6)))
              .map(l=>[l.string,q.label(l.node.parent,'ScoreLabel')+' '+q.label(l.node.parent,'Score'),!!l.node.parent.getChildByName('Number')]),
            empty:desk.getComponentsInChildren(cc.Label).some(l=>l.string.includes('没有动物'))};
        }""")
        assert snapshot["rows"] == ids and snapshot["residents"] == ids[:10], (status,stage,snapshot,ids)
        assert all(isinstance(score,int) and 0<=score<=960 for score in snapshot["scores"]),snapshot
        assert snapshot["cards"] == [[p["name"],f"评分 {score}",False] for p,score in zip(want,snapshot["scores"])],snapshot
        assert snapshot["n"] == min(10,len(want)) and snapshot["matched"] == len(want), snapshot
        assert want or snapshot["empty"], snapshot
        shown = [artwork(p) for p in want[:10]]
        page.wait_for_function("""es=>roomQA.residents().every((r,i)=>{
          const n=r.getChildByName('Portrait');
          return n.getComponent(cc.Sprite)?.spriteFrame?._uuid===es[i].uuid &&
            Boolean(r.getChildByName('AtRest'))===(es[i].stage==='已故') &&
            Boolean(r.getComponent('RoomAnimalWalk'))===es[i].walker;
        })""",arg=shown)
        return shown

    def reopen(species, status, stage):
        tap(page, "Back")
        page.wait_for_function("()=>!!roomQA.find('Hotspot_rooms')")
        tap(page, "Hotspot_rooms")
        wait_room("rabbit")
        if species != "rabbit":
            tap(page, "Tab" + str(list(BREEDS).index(species)))
            wait_room(species)
        if status != "全部":
            select(0, status)
        if stage != "全部":
            select(1, stage)
        return check(species, status, stage)

    def random_entries(species, status, stage, count):
        shown = check(species, status, stage)
        assert len(shown) == count
        samples = [page.evaluate("roomQA.positions()")]
        for _ in range(5):
            assert reopen(species, status, stage) == shown
            samples.append(page.evaluate("roomQA.positions()"))
            if len(samples) >= 3 and varied(samples):
                break
        assert varied(samples), (width, species, count, "fixed floor coordinates", samples)
        print(width, species, count, "positions varied across", len(samples), "visits", flush=True)

    def stable_during_refresh():
        # A second client edits the disposable shop. The room's normal poll must
        # actually redraw the retained badge while preserving the ten floor positions.
        pet = next(p for p in pets if p["id"].endswith("-rabbit-14"))
        original = page.evaluate("roomQA.positions()")
        for retain in (True, False):
            page.evaluate("window.previousRoomQA = roomQA.art()")
            snapshot = page.request.post(url+"/api/page", data={"page":"rooms","args":{"species":"rabbit"}})
            assert snapshot.ok
            shop = snapshot.json()["shop"]
            response = page.request.post(url+"/api/action", data={
                "requestId":f"room-redraw-qa-{width}-{retain}", "profileId":shop["profileId"], "version":shop["version"],
                "type":"care.retain", "args":{"id":pet["id"], "retained":retain}})
            assert response.ok, response.text()
            page.wait_for_function("""([id,retained])=>roomQA.visit()?.data?.rows?.some(r=>
                r.animal?.id===id && r.animal.retained===retained) &&
                roomQA.art()!==window.previousRoomQA""", arg=[pet["id"],retain])
            check("rabbit","全部","全部")
            assert page.evaluate("roomQA.positions()") == original, (width,"positions changed on poll")
        # A height change exercises a second, layout-driven redraw of the same visit.
        height = page.viewport_size["height"]
        for new_height in (height+40, height):
            page.evaluate("window.previousRoomQA = roomQA.art()")
            page.set_viewport_size({"width":width, "height":new_height})
            page.wait_for_function("()=>roomQA.art() && roomQA.art()!==window.previousRoomQA")
            check("rabbit","全部","全部")
            assert page.evaluate("roomQA.positions()") == original, (width,"positions changed on resize")

    def check_movement(species, shown):
        # Sample movement over actual rendered frames. Static animals must keep position, pose and orientation.
        page.emulate_media(reduced_motion="no-preference")
        page.wait_for_function("""es=>roomQA.residents().every((r,i)=>
          !es[i].walker||r.getComponent('RoomAnimalWalk')?.frames.length===4)""",arg=shown)
        motion=page.evaluate("""async es=>{
          const q=roomQA, animals=q.residents(),start=performance.now(), moved=new Set();
          const origin=animals.map(r=>[r.position.x,r.position.y]);
          const ground=animals.map((r,i)=>q.rect(r,es[i])[3]), roomHeight=q.ui(q.art()).height;
          let minGround=1,maxGround=0,maxWidth=0,elapsed=0,previous=start;
          while(elapsed<8.5&&performance.now()-start<35000){
            for(const [i,r] of animals.entries()){
              const b=q.rect(r,es[i]),sp=r.getChildByName('Portrait');
              // During a hop the sprite lifts, while its ground point continues on the floor.
              const foot=ground[i]-(r.position.y-origin[i][1])/roomHeight;
              minGround=Math.min(minGround,foot);maxGround=Math.max(maxGround,foot);maxWidth=Math.max(maxWidth,b[2]-b[0]);
              if(b[0]<0||b[2]>1||b[1]<0||b[3]>1||foot<.52||foot>.98)
                throw Error('Outside room floor '+JSON.stringify([es[i].id,b,foot]));
              if(Math.hypot(r.position.x-origin[i][0],r.position.y-origin[i][1])>.1)moved.add(i);
              if(!es[i].walker && (moved.has(i)||sp.angle!==0||sp.scale.x!==1||
                sp.getComponent(cc.Sprite).spriteFrame._uuid!==es[i].uuid))throw Error('Static animal moved '+es[i].id);
            }
            const timestamp=await new Promise(requestAnimationFrame);
            elapsed+=Math.min(.1,Math.max(0,(timestamp-previous)/1000));
            previous=timestamp;
          }
          return {moving:[...moved].sort(),minGround,maxGround,maxWidth};
        }""",shown)
        assert motion["moving"] == [i for i,e in enumerate(shown) if e["walker"]], (species,width,motion)
        assert motion["maxWidth"] < .185, (species,width,motion)
        print(width,species,len(shown),"residents, floor and motions",motion,flush=True)
        page.emulate_media(reduced_motion="reduce")

    if countdown_server:
        try:
            wait_room('rabbit')
            verify_design(page,design_screenshots)
            if not design_only:verify_countdowns(page,countdown_server,[p for p in pets if p['species']=='rabbit'],
                                                 select,wait_room,countdown_screenshot)
            assert not errors,errors
        finally:
            page.close()
        return None
    screenshot = None
    for species_index, species in enumerate(BREEDS):
        if species_index:
            tap(page,"Tab"+str(species_index))
        shown = check(species,"全部","全部")
        assert len(shown) == 10
        if species == "rabbit":
            stable_during_refresh()
            random_entries(species,"全部","全部",10)
        bounds = page.evaluate("es=>roomQA.residents().map((r,i)=>roomQA.rect(r,es[i]))",shown)
        sizes = page.evaluate("""()=>{const q=roomQA,w=q.ui(q.art()).width;
            return q.residents().map(n=>q.ui(n.getChildByName('Portrait')).width/w)}""")
        # The former normal animal canvas occupied 64/390 of the scene width.
        assert .12 < max(sizes) < (64/390)*.8, (species,width,sizes)
        younger, adult = [next(i for i,e in enumerate(shown) if e["id"].endswith(f"-{k}")) for k in (7,8)]
        heights = [b[3]-b[1] for b in bounds]
        assert heights[younger] < heights[adult] * .91, (species,width,heights[younger],heights[adult])
        if width==390 and species=="rabbit":
            screenshot = page.screenshot()
        # Touch every rabbit in the crowded scene, including overlapping hit areas and deceased animals.
        if species=="rabbit":
            for i,e in enumerate(shown):
                x,y=page.evaluate("""([i,e])=>{
                  const q=roomQA,r=q.residents()[i],a=q.ui(q.art()),b=q.rect(r,e);
                  const cx=(b[0]+b[2])/2,cy=(b[1]+b[3])/2;
                  return q.point(a.convertToWorldSpaceAR(new cc.Vec3((cx-.5)*a.width,(.5-cy)*a.height,0)));
                }""",[i,e])
                page.touchscreen.tap(x,y)
                page.wait_for_function("id=>roomQA.visit()?.data?.presentation?.animal?.id===id",arg=e["id"])
                tap(page,"Back")
                check(species,"全部","全部")
        check_movement(species, shown)
        if species=="rabbit":
            for status in breed_choices(species):
                select(0,status)
                for stage in STAGES:
                    select(1,stage)
                    check(species,status,stage)
        elif species=="cat":
            select(0,"缅因猫")
            select(1,"老年")
            random_entries(species,"缅因猫","老年",1)
            check_movement(species,check(species,"缅因猫","老年"))
    assert not errors,errors
    page.close()
    return screenshot


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--web-root",type=Path,default=GAME/"build"/"web-mobile",help="Web Mobile build to serve")
    parser.add_argument("--screenshot",type=Path,help="optional output path for the 390px ten-resident room")
    parser.add_argument("--growth-screenshot",type=Path,help="optional output path for the open growth filter at 390px")
    parser.add_argument("--countdown-screenshot",type=Path,help="optional output path for 390px room timers")
    parser.add_argument("--countdowns-only",action="store_true",help="run just the live stage-transition fixtures")
    parser.add_argument("--design-only",action="store_true",help="run layout, fonts and dossier/review navigation only")
    parser.add_argument("--design-screenshots",type=Path,help="directory for dossier and roster screenshots at each width")
    parser.add_argument("--widths",type=int,nargs='+',default=[320,390],help="logical viewport widths")
    args=parser.parse_args()
    shot=None
    with sync_playwright() as pw:
        browser=pw.chromium.launch(channel="msedge",args=["--use-angle=swiftshader"])
        for width in args.widths:
            for ticking in ([True] if args.countdowns_only or args.design_only else [False,True]):
                pets=countdown_fixture() if ticking else fixture(reverse=width==320)
                with TemporaryDirectory(prefix="petshop-room-filter-") as temp:
                    process=subprocess.Popen(["node","--input-type=module","-e",SERVER,temp,json.dumps(pets,ensure_ascii=False),
                        "countdowns" if ticking else "fixed",str(args.web_root.resolve())],cwd=GAME,stdin=subprocess.PIPE,stdout=subprocess.PIPE,
                        text=True,creationflags=getattr(subprocess,"CREATE_NO_WINDOW",0))
                    try:
                        port=int(process.stdout.readline())
                        shot=verify(browser,f"http://127.0.0.1:{port}",pets,width,args.growth_screenshot,
                                    process if ticking else None,args.countdown_screenshot,args.design_screenshots,args.design_only) or shot
                    finally:
                        process.terminate()
                        process.wait(timeout=10)
        browser.close()
    if args.screenshot and shot:
        args.screenshot.write_bytes(shot)


if __name__=="__main__":
    main()
