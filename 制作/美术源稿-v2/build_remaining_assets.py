from PIL import Image,ImageDraw,ImageFont
from pathlib import Path
import json
R=Path(r'D:\work\宠物店');D=R/'美术确认稿'/'素材';S=R/'制作'/'美术源稿-v2'
gold=Image.open(D/'trophy-gold-64-v2.png').convert('RGBA')
def rgba(h):return tuple(bytes.fromhex(h.lstrip('#')))+(255,)
def recolor(im,m):
 out=im.copy();out.putdata([rgba(m.get('#%02x%02x%02x'%p[:3],'#%02x%02x%02x'%p[:3])) if p[3] else (0,0,0,0) for p in im.getdata()]);return out
def save(name,im):
 for z in [1,2,3]:im.resize((64*z,64*z),Image.Resampling.NEAREST).save(D/(name+'-'+str(64*z)+'-v2.png'),optimize=True)
# Metallic variants preserve accepted silhouette; distinct metal tone is primary code.
silver=recolor(gold,{'#c39b5c':'#9aafa9','#d7a147':'#aebfba','#ecc06e':'#c8d5cc','#ffe1a0':'#e4eadd','#fff0ce':'#f1f2e6','#aa7148':'#7c928b','#8b5434':'#5a756f'})
bronze=recolor(gold,{'#c39b5c':'#ac724b','#d7a147':'#b67a48','#ecc06e':'#ce9461','#ffe1a0':'#e5b17d','#fff0ce':'#f2cea0','#214b42':'#664a30','#285449':'#8b5434','#39705a':'#aa7148','#5b8c66':'#c39b5c'})
save('trophy-silver',silver);save('trophy-bronze',bronze)
# Memorial uses an existing project badge, not a second cup.
mem=Image.new('RGBA',(64,64));badge=Image.open(D/'ui-show.png').convert('RGBA').resize((48,48),Image.Resampling.NEAREST);mem.paste(badge,(8,6),badge)
dr=ImageDraw.Draw(mem);dr.rectangle((19,53,44,58),fill='#49301f');dr.rectangle((21,52,42,55),fill='#8b5434');dr.rectangle((25,53,38,53),fill='#c39b5c');save('trophy-memorial',mem)
# Laurel frame is an intentional, distinct crown-tier silhouette.
laurel=Image.new('RGBA',(64,64));dr=ImageDraw.Draw(laurel)
for side in [-1,1]:
 pts=[(32+side*28,17),(32+side*29,28),(32+side*26,40),(32+side*18,49)]
 dr.line(pts,fill='#664a30',width=2)
 for x,y in [(32+side*27,18),(32+side*28,27),(32+side*25,36),(32+side*21,43)]:
  dr.polygon([(x,y+5),(x+side*4,y),(x+side*3,y-5),(x,y-2),(x-side*2,y+2)],fill='#c39b5c')
  dr.line([(x,y+3),(x+side*2,y-2)],fill='#ffe1a0',width=1)
cup=gold.resize((48,52),Image.Resampling.NEAREST);laurel.paste(cup,(8,10),cup)
dr=ImageDraw.Draw(laurel);dr.polygon([(24,8),(23,2),(28,5),(32,1),(36,5),(41,2),(40,8)],fill='#664a30');dr.polygon([(25,6),(25,4),(29,6),(32,3),(35,6),(39,4),(39,7)],fill='#ecc06e');save('trophy-laurel',laurel)
# 24px UI status glyphs, same code-native small pixel family as existing ui-show.
def icon(name,draw):
 im=Image.new('RGBA',(24,24));draw(ImageDraw.Draw(im))
 for z in [1,2,3]:im.resize((24*z,24*z),Image.Resampling.NEAREST).save(D/(name+'-'+str(24*z)+'-v2.png'),optimize=True)
icon('ui-order-cancel',lambda d:(d.rectangle((5,3,18,20),fill='#664a30'),d.rectangle((6,4,17,19),fill='#fff0ce'),d.line((9,9,15,15),fill='#8b5434',width=2),d.line((15,9,9,15),fill='#8b5434',width=2)))
icon('ui-order-clock',lambda d:(d.rectangle((6,2,17,4),fill='#664a30'),d.rectangle((3,6,20,17),fill='#664a30'),d.rectangle((6,3,17,20),fill='#664a30'),d.rectangle((5,6,18,17),fill='#fff0ce'),d.rectangle((7,5,16,18),fill='#fff0ce'),d.line((11,7,11,12,15,12),fill='#214b42',width=2)))
icon('ui-node-lock',lambda d:(d.rectangle((7,3,16,12),fill='#664a30'),d.rectangle((9,5,14,10),fill='#fff0ce'),d.rectangle((5,10,18,20),fill='#664a30'),d.rectangle((6,11,17,19),fill='#c39b5c'),d.rectangle((11,13,12,17),fill='#49301f')))
icon('ui-node-complete',lambda d:(d.rectangle((3,3,20,20),fill='#214b42'),d.rectangle((4,4,19,19),outline='#c39b5c'),d.line((7,11,10,15,17,8),fill='#fff0ce',width=2)))
print('Added 4 trophy tiers x3 and 4 UI glyphs x3, retained original gold.')

