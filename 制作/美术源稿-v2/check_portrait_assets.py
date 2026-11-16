from PIL import Image,ImageDraw,ImageFont
from pathlib import Path
root=Path(r'D:\work\宠物店'); dst=root/'美术确认稿'/'素材'; out=root/'制作'/'美术源稿-v2'
names=['trophy-gold','collection-book','item-trait-review','item-breeding-guidance']
labels=['金奖杯','奖杯收集册','特征复评单','选育指导单']
for name in names:
 im=Image.open(dst/(name+'-64-v2.png'))
 im.resize((192,192),Image.Resampling.NEAREST).save(dst/(name+'-192-v2.png'),optimize=True)
font=ImageFont.truetype(r'C:\Windows\Fonts\msyh.ttc',18)
small=ImageFont.truetype(r'C:\Windows\Fonts\msyh.ttc',14)
widths=[360,390,430]; heights=[800,844,932]
sheet=Image.new('RGB',(1220,1000),'#ddd2b5'); d=ImageDraw.Draw(sheet); x=10
for w,h in zip(widths,heights):
 d.rectangle((x,40,x+w-1,40+h-1),fill='#f6e9cb',outline='#214b42',width=2)
 d.text((x+12,8),str(w)+'×'+str(h)+' 逻辑像素',font=font,fill='#214b42')
 d.rectangle((x+2,42,x+w-3,85),fill='#d0bda0');d.text((x+12,52),'示例安全区：实际读取容器',font=small,fill='#664a30')
 d.text((x+12,98),'独立素材容器检查',font=font,fill='#214b42')
 d.text((x+12,128),'非游戏主界面 / 未接入',font=small,fill='#664a30')
 for i,(name,label) in enumerate(zip(names,labels)):
  y=170+i*110
  d.rectangle((x+12,y,x+w-13,y+99),fill='#fff0ce',outline='#c39b5c')
  im=Image.open(dst/(name+'-64-v2.png'));sheet.paste(im,(x+22,y+18),im)
  d.text((x+98,y+18),label,font=font,fill='#214b42');d.text((x+98,y+48),'64px · 保持比例',font=small,fill='#664a30')
 d.text((x+12,645),'边距12 / 间隔10 / 图不拉伸',font=small,fill='#214b42')
 d.rectangle((x+2,40+h-27,x+w-3,40+h-2),fill='#d0bda0')
 x+=w+10
sheet.save(out/'主流竖屏素材容器检查.png')
print('4 x192 exports + 360/390/430 asset container board complete')

