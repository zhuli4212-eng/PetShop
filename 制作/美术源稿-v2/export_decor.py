from PIL import Image,ImageDraw,ImageFont
from pathlib import Path
import json
R=Path(r'D:\work\宠物店');D=R/'美术确认稿'/'素材';S=R/'制作'/'美术源稿-v2'
palette=['281e17','49301f','664a30','8b5434','aa7148','c39b5c','d7a147','ecc06e','ffe1a0','fff0ce','214b42','285449','39705a','5b8c66','b6b18a','e3cc9b','3c5a25','6d8d35']
rgb=[tuple(bytes.fromhex(x)) for x in palette];pal=Image.new('P',(1,1));pal.putpalette([v for c in rgb+[rgb[0]]*(256-len(rgb)) for v in c])
for name in ['decor-plant','decor-rug']:
 im=Image.open(S/(name+'-source.png')).convert('RGBA');a=im.getchannel('A').point(lambda x:255 if x>=128 else 0);im=im.crop(a.getbbox())
 w,h=im.size;size=(round(56*w/max(w,h)),round(56*h/max(w,h)))
 c=im.convert('RGB').resize(size,Image.Resampling.BOX).quantize(palette=pal,dither=Image.Dither.NONE).convert('RGB')
 a=im.getchannel('A').resize(size,Image.Resampling.BOX).point(lambda x:255 if x>=128 else 0);c.putalpha(a)
 result=Image.new('RGBA',(64,64));result.paste(c,((64-size[0])//2,(64-size[1])//2))
 if name=='decor-rug':
  result=Image.new('RGBA',(64,64));g=ImageDraw.Draw(result)
  g.polygon([(8,21),(55,21),(60,42),(3,42)],fill='#49301f')
  g.polygon([(10,23),(53,23),(57,40),(6,40)],fill='#c39b5c')
  g.polygon([(12,25),(51,25),(54,38),(9,38)],fill='#214b42')
  g.line([(14,27),(49,27),(51,36),(12,36),(14,27)],fill='#c39b5c',width=1)
  for y in [25,29,33,37]:
   x=7-(y-25)//4;g.rectangle((x,y,x+2,y+1),fill='#fff0ce')
   x=55+(y-25)//4;g.rectangle((x,y,x+2,y+1),fill='#fff0ce')
 for z in [1,2,3]:result.resize((64*z,64*z),Image.Resampling.NEAREST).save(D/(name+'-'+str(z*64)+'-v2.png'),optimize=True)
sheet=Image.new('RGB',(650,460),'#f6e9cb');dr=ImageDraw.Draw(sheet);f=ImageFont.truetype(r'C:\Windows\Fonts\msyh.ttc',18)
for i,(name,label) in enumerate([('decor-plant','盆栽'),('decor-rug','地毯')]):
 x=30+i*320;dr.text((x,20),label,fill='#214b42',font=f);im=Image.open(D/(name+'-64-v2.png'))
 sheet.paste(im,(x,60),im);dr.rectangle((x+90,56,x+162,128),fill='#214b42');sheet.paste(im,(x+94,60),im)
 sheet.paste(im.resize((192,192),Image.Resampling.NEAREST),(x,170),im.resize((192,192),Image.Resampling.NEAREST))
dr.text((30,390),'64px浅/深底与3倍检查。固定静态装饰，无属性加成。',fill='#214b42',font=f)
sheet.save(S/'装饰补充核验.png')
print('decor-plant/rug x64/128/192 saved')

