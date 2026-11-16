"""Export the three new resting poses on the same floor line as the approved sprites."""
import json
from pathlib import Path
from uuid import NAMESPACE_URL, uuid5

import numpy as np
from PIL import Image


ROOT = Path(__file__).resolve().parents[2]
PETS = ROOT / "PetShop/assets/resources/pets"
APPROVED = ROOT / "美术确认稿/已故"


def load(path):
    return Image.open(path).convert("RGBA")


def match_coat(pose, adult, cream):
    # Use the standing animal's fur tones at the same brightness percentiles.
    # This keeps facial and paw details from the pose while matching its shop identity.
    pixels, reference = np.array(pose), np.array(adult)
    mask = pixels[:, :, 3] > 127
    rgb = pixels[mask, :3].astype(float)
    fur = reference[reference[:, :, 3] > 200, :3]
    weights = np.array([.299, .587, .114])
    light = rgb @ weights
    # The cream reference pose has a ginger tail. Bring its midtones back into
    # the cream range before matching, retaining the texture and dark outline.
    if cream:
        light += np.clip(rgb[:, 0] - rgb[:, 1] - 36, 0, 65) * .92
    stops = np.linspace(0, 1, 48)
    src = np.quantile(light, stops)
    ordered = fur[np.argsort(fur @ weights, kind="stable")]
    # Median neighborhoods keep isolated pink inner-ear pixels out of blue fur.
    radius = max(3, len(ordered) // 60)
    centers = np.rint(stops * (len(ordered) - 1)).astype(int)
    colors = np.array([np.median(ordered[max(0, i-radius):i+radius+1], axis=0) for i in centers])
    pixels[mask, :3] = np.stack([np.interp(light, src, c) for c in colors.T], axis=1).round()
    return Image.fromarray(pixels)


def export(key, source, width, recolor=False):
    pose = load(source)
    alpha = pose.getchannel("A")
    pose = pose.crop(alpha.point(lambda value: 255 if value > 100 else 0).getbbox())
    if recolor:
        adult = load(PETS / (key + "_male.png"))
        pose = match_coat(pose, adult, cream=key == "persian-coat03")
    height = round(width * pose.height / pose.width)
    sample = Image.Resampling.NEAREST if recolor else Image.Resampling.BOX
    pose = pose.resize((width, height), sample)
    pose.putalpha(pose.getchannel("A").point(lambda value: 255 if value >= 128 else 0))
    sprite = Image.new("RGBA", (96, 64))
    sprite.alpha_composite(pose, ((96-width)//2, 59-height))
    stem = key + "-rest"
    sprite.save(PETS / (stem + ".png"))
    template = (PETS / "angora-coat01-rest.png.meta").read_text(encoding="utf-8")
    original_id = json.loads(template)["uuid"]
    asset_id = str(uuid5(NAMESPACE_URL, "petshop/rest/" + stem))
    meta = template.replace(original_id, asset_id).replace("angora-coat01-rest", stem)
    (PETS / (stem + ".png.meta")).write_bytes(meta.encode("utf-8"))


if __name__ == "__main__":
    export("angora-coat02", Path(__file__).with_name("奶油安哥拉侧卧母稿.png"), 76)
    export("persian-coat03", APPROVED / "cat-dead.png", 77, recolor=True)
    export("persian-coat04", APPROVED / "kitten-dead.png", 76, recolor=True)
