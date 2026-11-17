"""从独立绘制的安哥拉兔四姿母图切出 384×96 跳跃条。"""
from pathlib import Path
import sys

import cv2
import numpy as np
from PIL import Image, ImageDraw


HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[4]
SLOTS = {
    "a1": ("adult01_male", "adult04_female"), "y1": ("young01_male", "young04_female"),
    "a2": ("adult02_female", "adult06_male"), "y2": ("young02_female", "young06_male"),
    "a3": ("adult03_male", "adult05_female"), "y3": ("young03_male", "young05_female"),
    "a4": ("adult04_male", "adult02_male"), "y4": ("young04_male", "young02_male"),
    "a5": ("adult05_male", "adult03_female"), "y5": ("young05_male", "young03_female"),
    "a6": ("adult06_female",), "y6": ("young06_female", "young01_female"),
}
COATS = ("snow white", "warm ivory cream", "slate blue-grey", "chocolate brown",
         "apricot orange", "black and white piebald")


def identity(slot):
    age = slot[:5]
    coat, sex = slot[5:].split("_")
    stem = "angora-coat" + coat + "_" + sex
    folder = "pets" if age == "adult" else "pet-young"
    return age, stem, ROOT/"PetShop/assets/resources"/folder/(stem+".png")


def references(key):
    refs = HERE/"参考"; refs.mkdir(exist_ok=True)
    slots = SLOTS[key]
    img = Image.new("RGBA", (512, 290*len(slots)), (248, 240, 221, 255))
    d = ImageDraw.Draw(img)
    for idx, slot in enumerate(slots):
        age, _, p = identity(slot)
        ref = Image.open(p).convert("RGBA")
        ref = ref.crop(ref.getchannel("A").getbbox())
        zoom = max(1, min(245//ref.height, 300//ref.width))
        ref = ref.resize((ref.width*zoom, ref.height*zoom), Image.Resampling.NEAREST)
        y = idx*290
        img.alpha_composite(ref, ((512-ref.width)//2, y+266-ref.height))
        d.text((12, y+8), ("A" if idx==0 else "B")+"  "+age+"  "+slot.split("_")[1]+"  "+
               COATS[int(slot[5:7])-1], fill=(56,40,32))
    img.save(refs/(key+".png"))


def components(row):
    rgba=np.array(row.convert("RGBA"))
    mask=(rgba[:,:,3]>=128).astype(np.uint8)
    count,labels,stats,_ = cv2.connectedComponentsWithStats(mask,8)
    ids=sorted(range(1,count),key=lambda i:stats[i,cv2.CC_STAT_AREA],reverse=True)[:4]
    if len(ids)!=4 or min(stats[i,cv2.CC_STAT_AREA] for i in ids)<mask.size*.012:
        raise ValueError("四姿轮廓无法拆分，请检查母稿。")
    output=[]
    for i in sorted(ids,key=lambda i:stats[i,cv2.CC_STAT_LEFT]):
        x,y,w,h,_=stats[i]
        cut=rgba[y:y+h,x:x+w].copy()
        cut[:,:,3]=np.where(labels[y:y+h,x:x+w]==i,255,0)
        output.append(Image.fromarray(cut))
    return output


def export(key):
    slots=SLOTS[key]
    sheet=Image.open(HERE/"母稿"/(key+".png"))
    for idx,slot in enumerate(slots):
        age,stem,_=identity(slot)
        row=sheet.crop((0,round(idx*sheet.height/len(slots)),sheet.width,round((idx+1)*sheet.height/len(slots))))
        poses=components(row)
        mw,mh,air=(88,67,13) if age=="adult" else (71,49,11)
        scale=min(mw/max(p.width for p in poses),mh/max(p.height for p in poses))
        strip=Image.new("RGBA",(384,96))
        for col,p in enumerate(poses):
            size=(round(p.width*scale),round(p.height*scale))
            small=p.resize(size,Image.Resampling.BOX)
            small.putalpha(small.getchannel("A").point(lambda a:255 if a>=122 else 0))
            small=small.crop(small.getchannel("A").getbbox())
            bottom=90-(air if col==2 else 0)
            strip.alpha_composite(small,(col*96+(96-small.width)//2,bottom-small.height))
        folder=HERE/age;folder.mkdir(exist_ok=True)
        strip.save(folder/(stem+".png"))


def preview(age):
    slots=sorted(slot for group in SLOTS.values() for slot in group if slot.startswith(age))
    w=588; h=100
    page=Image.new("RGB",(w,h*len(slots)),"#F6EAD0")
    pen=ImageDraw.Draw(page)
    for index,slot in enumerate(slots):
        _,stem,portrait=identity(slot)
        y=index*h
        strip=Image.open(HERE/age/(stem+".png")).convert("RGBA")
        ref=Image.open(portrait).convert("RGBA")
        page.paste(ref,(89,y),ref)
        page.paste(strip,(191,y),strip)
        pen.text((5,y+40),slot,fill="#493325")
        pen.line((5,y+90,w-5,y+90),fill="#CBB58E")
    page.save(HERE/(age+"-逐格核对.png"))


if __name__=="__main__":
    if len(sys.argv)>1 and sys.argv[1]=="preview":
        for name in ("adult","young"):preview(name)
        raise SystemExit
    for group in (sys.argv[2:] or SLOTS):
        if len(sys.argv)>1 and sys.argv[1]=="refs":references(group)
        else:export(group)
