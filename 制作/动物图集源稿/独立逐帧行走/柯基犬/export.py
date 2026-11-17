"""Cut the four hand-drawn poses from each age's own ImageGen sheet."""

from pathlib import Path
from statistics import median

import cv2
import numpy as np
from PIL import Image, ImageDraw, ImageFont


HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[3]
ANIMAL = "corgi-coat06_female.png"
FLOOR = 89
CELL = 96
SCREEN = 3


def clean_quadrant(tile):
    rgba = np.array(tile.convert("RGBA"))
    visible = (rgba[:, :, 3] >= 16).astype(np.uint8)
    _, labels, stats, _ = cv2.connectedComponentsWithStats(visible)
    principal = 1 + stats[1:, cv2.CC_STAT_AREA].argmax()
    rgba[labels != principal] = 0
    result = Image.fromarray(rgba)
    return result.crop(result.getchannel("A").getbbox())


def nose_x(tile):
    alpha = np.asarray(tile.getchannel("A"))
    # The nose is the leading opaque pixel in the middle of the head.
    middle_head = alpha[round(.30 * tile.height):round(.61 * tile.height)]
    return np.where(middle_head >= 128)[1].min().item()


def age_sheet(age, portrait):
    sheet = Image.open(HERE / f"{age}-imagegen.png").convert("RGBA")
    width, height = sheet.size
    poses = []
    for row, col in [(0, 0), (0, 1), (1, 0), (1, 1)]:
        quadrant = (width*col//2, height*row//2, width*(col+1)//2, height*(row+1)//2)
        poses.append(clean_quadrant(sheet.crop(quadrant)))

    # One scale for all four quadrants. The age-specific catalogue still sets the height.
    _, top, _, bottom = portrait.getchannel("A").point(lambda a: 255 if a >= 64 else 0).getbbox()
    scale = (bottom - top) / max(pose.height for pose in poses)
    scaled = []
    for pose in poses:
        size = (round(pose.width * scale), round(pose.height * scale))
        small = pose.resize(size, Image.Resampling.BOX)
        small = clean_quadrant(small)
        scaled.append(small)

    anchors = [nose_x(small) for small in scaled]
    fixed_nose = round(median((CELL - small.width) / 2 + anchor for small, anchor in zip(scaled, anchors)))
    atlas = Image.new("RGBA", (CELL*4, CELL))
    for phase, (small, anchor) in enumerate(zip(scaled, anchors)):
        left, top = fixed_nose - anchor, FLOOR + 1 - small.height
        assert left >= 0 and top >= 0 and left + small.width <= CELL
        atlas.paste(small, (CELL*phase + left, top))
    atlas.save(HERE / f"{age}-walk.png", optimize=True)
    return atlas


def contact_sheet(rows):
    padding, label_h = 12, 27
    side = CELL * SCREEN
    canvas = Image.new("RGB", (5 * (side + padding) + padding, 2 * (side + label_h + padding) + padding), "#f0eadf")
    text = ImageDraw.Draw(canvas)
    try:
        font = ImageFont.truetype("arial.ttf", 16)
    except OSError:
        font = ImageFont.load_default()
    for row, (age, portrait, atlas) in enumerate(rows):
        cards = [portrait] + [atlas.crop((i*CELL, 0, (i+1)*CELL, CELL)) for i in range(4)]
        for col, sprite in enumerate(cards):
            x = padding + col*(side+padding)
            y = padding + row*(side+label_h+padding)
            text.text((x+3, y+1), f"{age.upper()}   /   " + ("Catalogue" if col == 0 else f"Frame {col}"), font=font, fill="#413936")
            y += label_h
            text.rectangle((x, y, x+side-1, y+side-1), fill="#faf5e9")
            text.line((x, y+90*SCREEN, x+side-1, y+90*SCREEN), fill="#c9bca0", width=1)
            sprite = sprite.resize((side, side), Image.Resampling.NEAREST)
            canvas.paste(sprite, (x, y), sprite)
    canvas.save(HERE / "逐帧检查.png", optimize=True)


if __name__ == "__main__":
    rows = []
    for age, directory in [("adult", "pets"), ("young", "pet-young")]:
        portrait = Image.open(ROOT / "PetShop/assets/resources" / directory / ANIMAL).convert("RGBA")
        rows.append((age, portrait, age_sheet(age, portrait)))
    contact_sheet(rows)
