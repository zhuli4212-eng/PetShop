from PIL import Image, ImageDraw, ImageFont
from pathlib import Path
import json,hashlib
root=Path(r'D:\work\宠物店')
src=root/'制作'/'美术源稿-v2'
dst=root/'美术确认稿'/'素材'
palette=['#281e17','#49301f','#664a30','#8b5434','#aa7148','#c39b5c','#d7a147','#ecc06e','#ffe1a0','#fff0ce','#214b42','#285449','#39705a','#5b8c66','#b6b18a','#e3cc9b']
pal=Image.new('P',(1,1)); rgb=[tuple(bytes.fromhex(c[1:])) for c in palette]; pal.putpalette([v for c in rgb for v in c]+[v for c in [rgb[0]]*(256-len(rgb)) for v in c])
files=['trophy-gold','collection-book','item-trait-review','item-breeding-guidance']
report=[]
for name in files:
    original=Image.open(src/(name+'-v2.png')).convert('RGBA')
    alpha=original.getchannel('A').point(lambda x:255 if x>=128 else 0)
    box=alpha.getbbox()
    im=original.crop(box)
    w,h=im.size; scale=56/max(w,h); size=(max(1,round(w*scale)),max(1,round(h*scale)))
    color=im.convert('RGB').resize(size,Image.Resampling.BOX).quantize(palette=pal,dither=Image.Dither.NONE).convert('RGB')
    a=im.getchannel('A').resize(size,Image.Resampling.BOX).point(lambda x:255 if x>=128 else 0)
    color.putalpha(a)
    out=Image.new('RGBA',(64,64))
    out.paste(color,((64-size[0])//2,(64-size[1])//2))
    path=dst/(name+'-64-v2.png');out.save(path,optimize=True)
    out.resize((128,128),Image.Resampling.NEAREST).save(dst/(name+'-128-v2.png'),optimize=True)
    report.append({'file':path.name,'size':out.size,'colors':len(set(out.getdata())),'alpha':sorted(set(out.getchannel('A').getdata())),'bytes':path.stat().st_size,'sha256':hashlib.sha256(path.read_bytes()).hexdigest()})
# Review board: originals are not modified. Display actual64px and integer zoom separately.
board=Image.new('RGB',(1000,600),'#f6e9cb');d=ImageDraw.Draw(board)
font=ImageFont.truetype(r'C:\Windows\Fonts\msyh.ttc',18)
small=ImageFont.truetype(r'C:\Windows\Fonts\msyh.ttc',14)
labels=['金奖杯','奖杯收集册','特征复评单','选育指导单']
d.text((24,15),'硬边像素导出 · 64px实尺寸 / 3.5倍检查（非游戏接入）',fill='#214b42',font=font)
for i,(name,label) in enumerate(zip(files,labels)):
    x=20+i*245
    d.text((x,55),label,fill='#214b42',font=font)
    im=Image.open(dst/(name+'-64-v2.png'))
    board.paste(im,(x,90),im)
    d.rectangle((x+84,86,x+156,158),fill='#214b42');board.paste(im,(x+88,90),im)
    d.text((x,166),'64px 浅底 / 深底',fill='#214b42',font=small)
    zoom=im.resize((224,224),Image.Resampling.NEAREST);board.paste(zoom,(x,205),zoom)
    d.text((x,435),'3.5倍放大检查',fill='#214b42',font=small)
d.text((24,475),'现有资源原尺寸参考（未改动）',fill='#214b42',font=font)
for j,f in enumerate(['ui-show.png','lamp.png','ui-profile.png']):
    im=Image.open(dst/f).convert('RGBA');x=25+j*180;board.paste(im,(x,510),im);d.text((x+60,520),f,fill='#214b42',font=small)
board.save(src/'像素导出核验.png')
(src/'像素导出校验.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf8')
print(json.dumps(report,ensure_ascii=False))

