"""从四份 ImageGen 姿态母稿导出缺少的猫类侧卧帧，并制作逐格对照。"""
from pathlib import Path

import cv2
import numpy as np
from PIL import Image, ImageDraw


HERE = Path(__file__).resolve().parent
PROJECT = HERE.parents[3]
PETS = PROJECT / "PetShop/assets/resources/pets"
BREEDS = ("british", "american", "persian", "maine")
COATS = {breed: (1, 2, 3, 4, 5, 6) for breed in BREEDS}
COATS["persian"] = (1, 2, 5, 6)
WIDTHS = {"british": (78, 75), "american": (79, 76),
          "persian": (79, 76), "maine": (84, 81)}


def grid_cell(sheet, rows, row, col):
    w, h = sheet.size
    # Some tips of tails extend slightly past the mathematical grid line.
    # Keep this margin and select the largest component in the crop.
    margin = round(w/4*.06)
    return sheet.crop((max(0, round(col*w/4)-margin), round(row*h/rows),
                       min(w, round((col+1)*w/4)+margin), round((row+1)*h/rows)))


def extract_sprite(cell, width):
    pixels = np.asarray(cell.convert("RGBA")).copy()
    mask = (pixels[:, :, 3] >= 118).astype(np.uint8)
    count, labels, stats, _ = cv2.connectedComponentsWithStats(mask, 8)
    if count < 2:
        raise ValueError("缺少猫轮廓")
    component = 1 + int(np.argmax(stats[1:, cv2.CC_STAT_AREA]))
    x, y, w, h, area = stats[component]
    if area < cell.width*cell.height*.035:
        raise ValueError("猫轮廓太小，需核对母稿格位")
    pixels[:, :, 3] = np.where(labels == component, 255, 0)
    cropped = Image.fromarray(pixels).crop((x, y, x+w, y+h))
    height = max(1, round(width*h/w))
    if height > 48:
        raise ValueError("侧卧比例异常，需核对头部及尾部是否在本格内")
    # BOX integrates downsampled pixel clusters, while thresholding retains the
    # transparent, single-pixel contour used by the original game sprites.
    small = cropped.resize((width, height), Image.Resampling.BOX)
    small.putalpha(small.getchannel("A").point(lambda v: 255 if v >= 120 else 0))
    small = small.crop(small.getchannel("A").getbbox())
    canvas = Image.new("RGBA", (96, 64))
    canvas.alpha_composite(small, ((96-small.width)//2, 59-small.height))
    return canvas


def export_breed(breed):
    sheet = Image.open(HERE / (breed+"-atlas.png")).convert("RGBA")
    coats = COATS[breed]
    for i, coat in enumerate(coats):
        for j, sex in enumerate(("male", "female")):
            key = f"{breed}-coat{coat:02}_{sex}"
            if key == "british-coat01_female":
                continue
            cell = grid_cell(sheet, len(coats)//2, i//2, 2*(i%2)+j)
            sprite = extract_sprite(cell, WIDTHS[breed][j])
            sprite.save(PETS / (key+"-rest.png"))


def preview_all():
    # All 48 slots include the five previously approved mappings.
    box_w, box_h = 180, 124
    preview = Image.new("RGB", (6*box_w, 8*box_h), "#F3E6C9")
    draw = ImageDraw.Draw(preview)
    for b, breed in enumerate(BREEDS):
        for coat in range(1, 7):
            for j, sex in enumerate(("male", "female")):
                x, y = (coat-1)*box_w, (2*b+j)*box_h
                key = f"{breed}-coat{coat:02}_{sex}"
                ref = Image.open(PETS / (key+".png")).convert("RGBA")
                rest = PETS / (key+"-rest.png")
                if breed == "persian" and coat in (3, 4):
                    rest = PETS / f"persian-coat{coat:02}-rest.png"
                sprite = Image.open(rest).convert("RGBA")
                draw.text((x+4, y+3), f"{breed} {coat:02} {sex}", fill="#473626")
                ref.thumbnail((65, 65), Image.Resampling.NEAREST)
                preview.paste(ref, (x+3, y+45), ref)
                preview.paste(sprite, (x+75, y+50), sprite)
                draw.line((x+1, y+116, x+box_w-2, y+116), fill="#CEB996")
    preview.save(HERE / "猫侧卧逐格核对.png")


if __name__ == "__main__":
    for breed_name in BREEDS:
        export_breed(breed_name)
    preview_all()
