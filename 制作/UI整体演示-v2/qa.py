from pathlib import Path
import json
from playwright.sync_api import sync_playwright
from PIL import Image,ImageDraw,ImageFont
p=Path(r'D:\work\宠物店\美术确认稿\UI整体演示-v2');(p/'截图').mkdir(exist_ok=True)
reports=[]
with sync_playwright() as pw:
 b=pw.chromium.launch(executable_path=r'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe',headless=True)
 for w,h in [(320,667),(360,800),(375,812),(390,844),(414,896),(430,932)]:
  page=b.new_page(viewport={'width':w,'height':h},device_scale_factor=3 if w==390 else 1,is_mobile=True,has_touch=True)
  errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
  page.goto((p/'index.html').as_uri())
  opts=page.locator('#jump option').evaluate_all('(els)=>els.map(e=>[e.value,e.textContent])')
  for key,name in opts:
   page.select_option('#jump',key);page.wait_for_timeout(60)
   bad=page.locator('img').evaluate_all('(els)=>els.filter(e=>!e.complete||!e.naturalWidth).map(e=>e.alt)')
   overflow=page.evaluate('document.documentElement.scrollWidth > innerWidth')
   if bad or overflow:reports.append({'width':w,'page':key,'badImages':bad,'overflow':overflow})
   if w==390:page.screenshot(path=str(p/'截图'/f'{key}.png'))
  page.select_option('#jump','orders');page.get_by_role('button',name='取消订单',exact=True).first.click();assert page.locator('#modal').is_visible();page.get_by_role('button',name='知道了，返回').click();assert not page.locator('#modal').is_visible();page.locator('#back').click();assert page.locator('#pagetitle').inner_text()=='店铺'
  if w==390:
   page.locator('.phone').evaluate("el=>{el.style.setProperty('--safe-top','44px');el.style.setProperty('--safe-bottom','34px')}");page.screenshot(path=str(p/'截图'/'safe-area-simulation.png'));assert page.locator('.demo-bar').bounding_box()['y']>=44;reports.append({'simulatedSafeArea':'top44-bottom34','status':'passed'})
  reports.append({'width':w,'height':h,'screens':len(opts),'jsErrors':errors,'dialogAndBack':'passed'});page.close()
 b.close()
font=ImageFont.truetype('C:/Windows/Fonts/msyh.ttc',23); small=ImageFont.truetype('C:/Windows/Fonts/msyh.ttc',16)
for group,keys in [('模块整体效果',['home','rooms','breed','profile','orders','market','lab','guest','decor','show','login']),('补充流程效果',['collection','research','unlock','items','result','payment','birth','cancelshop'])]:
 cols=4;tw=300;th=649;gap=22;rows=(len(keys)+cols-1)//cols
 board=Image.new('RGB',(cols*(tw+gap)+gap,rows*(th+65)+120),'#e8dfc5');d=ImageDraw.Draw(board);d.rectangle((0,0,board.width,85),fill='#24483b');d.text((22,18),'宠物店 · 美术与 UI 整体演示',font=font,fill='#fff0ce');d.text((22,52),'静态示例 · 原有视觉规范 · 不含玩法、服务器或真实支付',font=small,fill='#d3d9ba')
 for i,key in enumerate(keys):
  x=gap+(i%cols)*(tw+gap);y=110+(i//cols)*(th+65);name=dict(opts)[key];d.text((x,y),name,font=font,fill='#365442');im=Image.open(p/'截图'/f'{key}.png').convert('RGB');im.thumbnail((tw,th),Image.Resampling.LANCZOS);board.paste(im,(x,y+35))
 board.save(p/(group+'.png'))
(p/'核验结果.json').write_text(json.dumps(reports,ensure_ascii=False,indent=2),'utf-8');print(json.dumps(reports,ensure_ascii=False))
