"""Divide the hand-drawn sheets and register the individual poses on their floors."""
from pathlib import Path
import json

import cv2
import numpy as np
from PIL import Image, ImageDraw, ImageFont

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[4]
CELL = 96
FLOOR = 89
PHASES = ("Crouch", "Push-off", "Airborne", "Landing")


def cut_groups(sheet):
    rgba = np.array(sheet)
    opaque = (rgba[:, :, 3] >= 74).astype(np.uint8)
    count, labels, stats, centers = cv2.connectedComponentsWithStats(opaque)
    threshold = sheet.width * sheet.height * .0028
    groups = [i for i in range(1, count) if stats[i, cv2.CC_STAT_AREA] > threshold]
    if len(groups) != 12:
        raise ValueError(f"Expected 12 isolated full poses; found {len(groups)}.")
    by_height = sorted(groups, key=lambda i: centers[i][1])
    cells = []
    for row in range(3):
        across = sorted(by_height[row*4:row*4+4], key=lambda i: centers[i][0])
        for i in across:
            left, top, width, height = stats[i, :4]
            if min(left, top, sheet.width-left-width, sheet.height-top-height) < 2:
                raise ValueError("A source pose touches the sheet edge.")
            bounds = np.s_[top-2:top+height+2, left-2:left+width+2]
            # Retain the original alpha around the main contiguous character.
            local = rgba[bounds].copy()
            region = (labels[bounds] == i).astype(np.uint8)
            fringe = cv2.dilate(region, np.ones((5,5), np.uint8))
            local[(fringe == 0) | (local[:,:,3] < 20)] = 0
            pose = Image.fromarray(local)
            cells.append(pose.crop(pose.getchannel("A").getbbox()))
    return [cells[k:k+4] for k in (0, 4, 8)]


def draw_frames(poses, still, age):
    left, top, right, bottom = still.getchannel("A").point(lambda x: 255 if x>=64 else 0).getbbox()
    height, width = bottom-top, right-left
    max_width = min(88, round(width*1.50))
    # Crouch at catalogue scale. Cap the most extended pose without changing relative sizes.
    scale = min(height*.96 / poses[0].height, max_width / max(s.width for s in poses))
    frames = []
    clearance = 8 if age == "adult" else 6
    for phase, original in enumerate(poses):
        size = tuple(round(s*scale) for s in original.size)
        image = original.resize(size, Image.Resampling.BOX)
        pixels = np.array(image)
        pixels[pixels[:,:,3] < 96] = 0
        image = Image.fromarray(pixels)
        image = image.crop(image.getchannel("A").getbbox())
        # Keep the same body anchor in the cell as the limbs extend or fold.
        alpha = np.asarray(image.getchannel("A"))
        ys, xs = np.where(alpha >= 96)
        ys_mid = (ys >= image.height * .28) & (ys <= image.height * .72)
        center_x = float(np.mean(xs[ys_mid]))
        x = max(2, min(CELL-image.width-2, round((CELL-1)/2-center_x)))
        bottom_y = FLOOR-(clearance if phase == 2 else 0)
        # Register on the solid toe. Faint antialiasing below it cannot set the floor.
        solid_bottom = int(np.where(alpha >= 125)[0].max())
        image = image.crop((0, 0, image.width, solid_bottom+1))
        y = bottom_y-solid_bottom
        assert y>0 and x>0 and x+image.width<CELL
        frame = Image.new("RGBA", (CELL,CELL))
        frame.paste(image,(x,y))
        assert frame.getchannel("A").getbbox()[3] == bottom_y+1
        assert np.where(np.asarray(frame.getchannel("A")) >= 125)[0].max() == bottom_y
        frames.append(frame)
    assert len({f.tobytes() for f in frames}) == 4
    return frames


def save_proof(rows, name):
    factor = 2
    step, pitch, head = CELL*factor+12, CELL*factor+25, 26
    proof = Image.new("RGB", (step*5+12, head+pitch*len(rows)), "#e2d9c7")
    draw = ImageDraw.Draw(proof)
    try:
        font = ImageFont.truetype("arial.ttf", 14)
    except OSError:
        font = ImageFont.load_default()
    for col, text in enumerate(("Catalogue",*PHASES)):
        draw.text((col*step+13,5),text,fill="#493d34",font=font)
    for row, (animal, reference, frames) in enumerate(rows):
        y = head + row*pitch
        for col, sprite in enumerate([reference,*frames]):
            x = 8 + col*step
            draw.rectangle((x,y,x+191,y+191), fill="#f7f0e0")
            draw.line((x,y+(FLOOR+1)*factor,x+191,y+(FLOOR+1)*factor), fill="#c7ae8e")
            sprite=sprite.resize((CELL*factor,CELL*factor),Image.Resampling.NEAREST)
            proof.paste(sprite,(x,y),sprite)
        draw.text((10,y+193), animal, fill="#493d34",font=font)
    proof.save(HERE/("proof-"+name+".png"),optimize=True)


def main():
    inputs = json.loads((HERE/"references.json").read_text(encoding="utf8"))
    proofs={}
    for group, animals in inputs.items():
        file = HERE/"masters"/(group+".png")
        if not file.exists():
            print("Awaiting",group)
            continue
        parts = group.split("-")
        age,sex = parts[:2]
        with Image.open(file) as sheet:
            drawings = cut_groups(sheet.convert("RGBA"))
        for animal, poses in zip(animals,drawings):
            with Image.open(ROOT/animal["still"]) as source:
                still = source.convert("RGBA")
            frames=draw_frames(poses,still,age)
            strip=Image.new("RGBA",(CELL*4,CELL))
            for pos, frame in enumerate(frames):
                strip.paste(frame,(pos*CELL,0))
            strip.save(HERE/age/(animal["id"]+".png"),optimize=True)
            proofs.setdefault(age+"-"+sex,[]).append((animal["id"],still,frames))
        print("Exported",group)
    for name,rows in proofs.items():
        save_proof(rows,name)


if __name__=="__main__":
    main()
