from PIL import Image,ImageDraw,ImageFont
from pathlib import Path
import json,hashlib
R=Path(r'D:\work\宠物店');D=R/'美术确认稿'/'素材';S=R/'制作'/'美术源稿-v2'
font=ImageFont.truetype(r'C:\Windows\Fonts\msyh.ttc',18);small=ImageFont.truetype(r'C:\Windows\Fonts\msyh.ttc',14)
sheet=Image.new('RGB',(1110,650),'#f6e9cb');d=ImageDraw.Draw(sheet)
d.text((24,15),'公开赛五档奖杯 · 实尺寸 / 像素细节检查',fill='#214b42',font=font)
for i,(name,label) in enumerate(zip(['memorial','bronze','silver','gold','laurel'],['纪念','铜','银','金','桂冠'])):
 x=20+i*218;d.text((x,60),label,fill='#214b42',font=font)
 im=Image.open(D/('trophy-'+name+'-64-v2.png'))
 sheet.paste(im,(x,95),im);d.rectangle((x+85,91,x+157,163),fill='#214b42');sheet.paste(im,(x+89,95),im)
 big=im.resize((192,192),Image.Resampling.NEAREST);sheet.paste(big,(x,210),big)
 d.text((x,175),'64px 浅/深底',fill='#214b42',font=small);d.text((x,410),'192px / 3倍整数放大',fill='#214b42',font=small)
d.text((24,460),'配套状态图标 · 24px / 48px',fill='#214b42',font=font)
for i,(f,label) in enumerate(zip(['ui-order-cancel','ui-order-clock','ui-node-lock','ui-node-complete'],['取消订单','订单等待','节点锁定','节点完成'])):
 x=24+i*270
 for k,size in enumerate([24,48]):
  im=Image.open(D/(f+'-'+str(size)+'-v2.png'));sheet.paste(im,(x+k*44,510),im)
 d.text((x,572),label,fill='#214b42',font=small)
d.text((24,616),'素材检查板，不是游戏截图；未接入、未真机验证。',fill='#664a30',font=small)
sheet.save(S/'五档奖杯与状态图标核验.png')
names=['trophy-'+t+'-'+str(z)+'-v2.png' for t in ['memorial','bronze','silver','gold','laurel'] for z in [64,128,192]]
names += [n+'-'+str(z)+'-v2.png' for n in ['ui-order-cancel','ui-order-clock','ui-node-lock','ui-node-complete'] for z in [24,48,72]]
rows=[]
for n in names:
 p=D/n;im=Image.open(p).convert('RGBA');alpha=sorted(set(im.getchannel('A').getdata()));assert alpha==[0,255],n
 rows.append({'file':n,'size':im.size,'alpha':alpha,'bytes':p.stat().st_size,'sha256':hashlib.sha256(p.read_bytes()).hexdigest()})
(S/'五档奖杯资源校验.json').write_text(json.dumps(rows,ensure_ascii=False,indent=2),encoding='utf8')
print('Verified',len(rows),'files.')

