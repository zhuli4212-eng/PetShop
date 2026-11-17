"""Lay out the in-game animal portraits and the approved resting poses for ImageGen."""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

HERE=Path(__file__).resolve().parent
ROOT=HERE.parents[3]
RESOURCE=ROOT/'PetShop/assets/resources/pets'
BREEDS=('shiba','corgi','poodle','dachshund')
NAMES={
    'shiba':['red','black and tan','cream','red sesame','black sesame','white with red patches'],
    'corgi':['sable and white','red and white','dark sable','black tricolor','brindle and white','blue merle'],
    'poodle':['black','white','apricot','chocolate','silver','black and white parti'],
    'dachshund':['red brown','black and tan','chocolate and tan','silver dapple','brindle','red and white piebald']
}
POSE = {'shiba':'shiba-coat01_male','corgi':'corgi-coat02_female','poodle':'corgi-coat02_female','dachshund':'dachshund-coat02_female'}
def on_board(bg, file, center, size):
    view=Image.open(file).convert('RGBA')
    view=view.crop(view.getchannel('A').getbbox())
    scale=min(size[0]/view.width,size[1]/view.height)
    view=view.resize(tuple(round(t*scale) for t in view.size),Image.Resampling.NEAREST)
    bg.paste(view,(center[0]-view.width//2,center[1]-view.height//2),view)
def make():
    font=ImageFont.truetype('C:/Windows/Fonts/arial.ttf',16)
    for breed in BREEDS:
        ref=Image.new('RGB',(900,760),'#eee4d0')
        draw=ImageDraw.Draw(ref)
        for sex_index,sex in enumerate(['female','male']):
            for j,name in enumerate(NAMES[breed]):
                row=sex_index*2+j//3;col=j%3
                x=col*300;y=row*190
                draw.rectangle((x+1,y+1,x+299,y+189),outline='#bcae92')
                on_board(ref,RESOURCE/f'{breed}-coat{j+1:02}_{sex}.png',(x+150,y+90),(235,147))
                draw.text((x+9,y+163),f'{j+1}. {sex} / {name}',font=font,fill='#2f302f')
        ref.save(HERE/(breed+'-catalogue.png'))
        ref=Image.new('RGB',(600,285),'#eee4d0')
        on_board(ref,RESOURCE/(POSE[breed]+'-rest.png'),(300,140),(490,245))
        ref.save(HERE/(breed+'-pose.png'))
if __name__=='__main__': make()
