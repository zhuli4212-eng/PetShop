"""Cut the ImageGen atlases into the 96 × 64 resting sprites used by PetShop."""
import hashlib
from pathlib import Path

import cv2
import numpy as np
from PIL import Image, ImageDraw, ImageFont

HERE = Path(__file__).resolve().parent
PETS = HERE.parents[3] / "PetShop/assets/resources/pets"
WIDTHS = {"shiba": (77, 80), "corgi": (74, 78), "poodle": (75, 79), "dachshund": (82, 86)}
PROTECTED = {"shiba-coat01_male", "corgi-coat02_female", "dachshund-coat02_female"}
GENDER = ("female", "male")

def character_in_cell(atlas, column, row):
    w,h = atlas.size
    tile = atlas.crop((column*w//3, row*h//4, (column+1)*w//3, (row+1)*h//4))
    pixels = np.array(tile)
    mask = np.uint8(pixels[:,:,3] >= 95)
    count, labels, stats, _ = cv2.connectedComponentsWithStats(mask)
    largest = 1 + np.argmax(stats[1:, cv2.CC_STAT_AREA])
    # The master has subtle alpha fringes. Keep the contiguous dog only.
    if count < 2 or stats[largest, cv2.CC_STAT_AREA] < mask.size / 7:
        raise ValueError(f"Missing complete individual at {column}, {row}")
    pixels[labels != largest] = 0
    result = Image.fromarray(pixels)
    return result.crop(result.getchannel("A").getbbox())

def match_palette(pose, adult):
    # Preserve the ImageGen markings while calibrating local shades to this
    # individual’s catalogue art. In particular whites, sesame and merle have
    # different warm/cool tones even when their brightness is similar.
    template = np.array(adult)
    opaque = template[template[:,:,3] >= 200, :3]
    swatches = Image.fromarray(opaque.reshape(1,-1,3)).quantize(64, dither=Image.Dither.NONE)
    colors = np.array(swatches.convert("RGB")).reshape(-1,3)
    colors = np.unique(colors,axis=0)
    source = np.array(pose)
    solid = source[:,:,3] >= 128
    rgb = source[solid,:3]
    def lab(values):
        values = np.float32(values.reshape(1,-1,3)) / 255
        return cv2.cvtColor(values, cv2.COLOR_RGB2LAB).reshape(-1,3)
    distance = np.sum((lab(rgb)[:,None,:]-lab(colors)[None,:,:])**2,axis=2)
    chosen = colors[np.argmin(distance,axis=1)]
    source[solid,:3] = np.rint(.46*rgb + .54*chosen)
    source[solid,3]=255
    source[~solid]=0
    return Image.fromarray(source)

def fit(source, adult, width):
    height=round(width*source.height/source.width)
    small=source.resize((width,height),Image.Resampling.BOX)
    small=match_palette(small,adult)
    small=small.crop(small.getchannel("A").getbbox())
    canvas=Image.new("RGBA",(96,64))
    canvas.alpha_composite(small,((96-small.width)//2,59-small.height))
    return canvas

def at_scale(board, frame, x, y, max_width, max_height):
    frame=frame.crop(frame.getchannel("A").getbbox())
    scale=min(2,max_width//frame.width,max_height//frame.height)
    frame=frame.resize((frame.width*scale,frame.height*scale),Image.Resampling.NEAREST)
    board.paste(frame,(x-frame.width//2,y-frame.height),frame)

def review_board(breed):
    board=Image.new("RGB",(6*198,2*218),"#f3e9d0")
    font=ImageFont.load_default(size=15)
    draw=ImageDraw.Draw(board)
    for row,sex in enumerate(GENDER):
        for coat in range(1,7):
            key=f"{breed}-coat{coat:02}_{sex}"
            x,y=(coat-1)*198,row*218
            draw.rectangle((x,y,x+197,y+217),outline="#ccbda5")
            adult=Image.open(PETS/(key+".png")).convert("RGBA")
            rest=Image.open(PETS/(key+"-rest.png")).convert("RGBA")
            at_scale(board,adult,x+99,y+95,168,85)
            at_scale(board,rest,x+99,y+180,180,83)
            draw.text((x+9,y+190),f"{coat:02}  {sex}"+("  [original]" if key in PROTECTED else ""),font=font,fill="#352e25")
    board.save(HERE/(breed+"-review.png"))

def digest(path):
    return hashlib.sha256(path.read_bytes()).digest()

def main():
    old={k:digest(PETS/(k+"-rest.png")) for k in PROTECTED}
    count=0
    for breed,widths in WIDTHS.items():
        atlas=Image.open(HERE/(breed+"-generated.png")).convert("RGBA")
        for sex_index,sex in enumerate(GENDER):
            for coat in range(1,7):
                key=f"{breed}-coat{coat:02}_{sex}"
                if key in PROTECTED:
                    continue
                pose=character_in_cell(atlas,(coat-1)%3,sex_index*2+(coat-1)//3)
                adult=Image.open(PETS/(key+".png")).convert("RGBA")
                image=fit(pose,adult,widths[sex_index])
                assert image.size==(96,64) and image.getchannel("A").getbbox()[3]==59
                assert set(np.unique(np.array(image.getchannel("A"))))=={0,255}
                image.save(PETS/(key+"-rest.png"),optimize=True)
                count+=1
        review_board(breed)
    assert old=={k:digest(PETS/(k+"-rest.png")) for k in PROTECTED}
    assert count==45
    print("45 resting sprites exported; three original files verified unchanged.")

if __name__=="__main__":
    main()
