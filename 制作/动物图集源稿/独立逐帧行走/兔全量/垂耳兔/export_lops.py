"""Cut and register the four individual drawings of each lop rabbit hop."""
import json
from pathlib import Path

import cv2
import numpy as np
from PIL import Image


HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[4]
SIZE = 96
GROUND = 89


def cut_poses(sheet):
    pixels = np.asarray(sheet.convert("RGBA"))
    mask = (pixels[:, :, 3] >= 116).astype("uint8")
    _, labels, stats, _ = cv2.connectedComponentsWithStats(mask, 8)
    largest = sorted(range(1, len(stats)), key=lambda n: stats[n, cv2.CC_STAT_AREA], reverse=True)[:4]
    if len(largest) != 4 or min(stats[n, cv2.CC_STAT_AREA] for n in largest) < mask.size * .015:
        raise ValueError("Expected four separate full-body poses")
    top_down = sorted(largest, key=lambda n: stats[n, 1] + stats[n, 3] / 2)
    order = sorted(top_down[:2], key=lambda n: stats[n, 0]) + sorted(top_down[2:], key=lambda n: stats[n, 0])
    poses = []
    for n in order:
        x, y, width, height = stats[n, :4]
        crop = pixels[y:y+height, x:x+width].copy()
        own = (labels[y:y+height, x:x+width] == n).astype("uint8")
        crop[cv2.dilate(own, np.ones((3, 3), np.uint8)) == 0] = 0
        poses.append(Image.fromarray(crop))
    return poses


def register(poses, portrait, age):
    # A single uniform scale per strip keeps the body the same size throughout the leap.
    box = portrait.getchannel("A").point(lambda a: 255 if a >= 116 else 0).getbbox()
    scale = min((box[2]-box[0])*1.25/max(p.width for p in poses),
                (box[3]-box[1])*1.07/max(p.height for p in poses),
                89/max(p.width for p in poses))
    figs, offsets, soles = [], [], []
    for p in poses:
        bitmap = np.array(p.resize((round(p.width*scale), round(p.height*scale)), Image.Resampling.BOX))
        ink = bitmap[:, :, 3] >= 125
        bitmap[~ink] = 0
        bitmap[ink, 3] = 255
        fig = Image.fromarray(bitmap)
        fig = fig.crop(fig.getbbox())
        alpha = np.asarray(fig.getchannel("A")) > 0
        x = round((SIZE-1)/2 - np.nonzero(alpha)[1].mean())
        figs.append(fig)
        offsets.append(max(1, min(SIZE-fig.width-1, x)))
        soles.append(np.flatnonzero(alpha[-1]))
    # Keep the forefoot at the landing-to-gather transition in approximately the same place.
    correction = int(np.clip(round((offsets[0]+soles[0][0] - offsets[3]-soles[3][0])/2), -4, 4))
    offsets[0] -= correction
    offsets[3] += correction
    strip = Image.new("RGBA", (SIZE*4, SIZE))
    for phase, (fig, x) in enumerate(zip(figs, offsets)):
        clearance = (8 if age == "adult" else 5) if phase == 2 else 0
        x = max(1, min(SIZE-fig.width-1, x))
        strip.alpha_composite(fig, (phase*SIZE+x, GROUND+1-clearance-fig.height))
    return strip


def export(source):
    age, key = source.stem.split("-", 1)
    resource = "pets" if age == "adult" else "pet-young"
    with Image.open(source) as sheet, Image.open(ROOT/"PetShop/assets/resources"/resource/(key+".png")) as portrait:
        strip = register(cut_poses(sheet), portrait, age)
    destination = HERE/age/(key+".png")
    destination.parent.mkdir(exist_ok=True)
    strip.save(destination, optimize=True)


if __name__ == "__main__":
    for name in json.loads((HERE/"提示词.json").read_text(encoding="utf-8")):
        export(HERE/"masters"/(name+".png"))
