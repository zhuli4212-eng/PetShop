"""Build juvenile portraits and four-frame gaits on the catalogue's 96 px floor.

The approved spot rabbit and kitten in 动物资源 are the proportion references.
The input for each individual is its own portrait and gait, so markings,
sex-specific features, and the original paw sequence stay with that individual.
"""
import json
import uuid
from dataclasses import dataclass
from io import BytesIO
from pathlib import Path

import numpy as np
from PIL import Image


ROOT = Path(__file__).resolve().parents[2]
RESOURCES = ROOT / "PetShop/assets/resources"
SIZE = 96
FLOOR = 90
Y, X = np.mgrid[:SIZE, :SIZE]


@dataclass(frozen=True)
class Anatomy:
    # Positions within the adult silhouette, measured from its left and top.
    species: str
    neck_x: float
    brow_y: float
    chin_y: float
    belly_y: float


BREEDS = {
    "domestic": Anatomy("rabbit", .52, .45, .68, .80),
    "lop": Anatomy("rabbit", .58, .30, .64, .78),
    "angora": Anatomy("rabbit", .53, .44, .67, .82),
    "lionhead": Anatomy("rabbit", .55, .40, .66, .82),
    "british": Anatomy("cat", .57, .23, .51, .79),
    "american": Anatomy("cat", .56, .25, .52, .79),
    "persian": Anatomy("cat", .59, .24, .55, .81),
    "maine": Anatomy("cat", .54, .30, .52, .80),
    "shiba": Anatomy("dog", .49, .23, .49, .71),
    "corgi": Anatomy("dog", .52, .28, .56, .79),
    "poodle": Anatomy("dog", .56, .24, .51, .70),
    "dachshund": Anatomy("dog", .44, .26, .57, .78),
}


def silhouette(frames):
    occupied = np.maximum.reduce([np.asarray(frame.getchannel("A")) for frame in frames]) > 63
    y, x = np.nonzero(occupied)
    return x.min(), y.min(), x.max() + 1, y.max() + 1


def inverse_map(lengths, factors, origin, samples):
    """Return a nearest source position for every destination pixel centre."""
    src = np.r_[0., np.cumsum(lengths)]
    dest = np.r_[0., np.cumsum(np.asarray(lengths) * factors)]
    return np.interp(samples - origin, dest, src, left=-1, right=src[-1] + 1)


def juvenile_maps(bounds, form, walking):
    left, top, right, bottom = bounds
    width, height = right - left, bottom - top
    cat_gait = walking and form.species == "cat"
    # Walking cats have a horizontal back and an extended tail. In their atlas
    # gait the head is confined to the front third; the seated head is much wider.
    neck = (.34 if cat_gait else form.neck_x) * width
    muzzle = .24 * neck
    x_lengths = [muzzle, neck - muzzle, width - neck]
    if form.species == "rabbit":
        x_factors = [.81, 1.08, .57]
    elif form.species == "dog":
        x_factors = [.77, 1.04, .60]
    else:
        x_factors = [.90, 1.12 if cat_gait else 1.04, .60]
    dest_width = np.dot(x_lengths, x_factors)
    source_x = inverse_map(x_lengths, x_factors, (SIZE - dest_width) / 2, X + .5)

    brow, chin, belly = form.brow_y, form.chin_y, form.belly_y
    if cat_gait:
        brow, chin, belly = .25, .57, .72
    y_lengths = np.diff([0., brow, chin, belly, 1.]) * height
    # The full cheek and ear roots keep their pixel detail. The ribcage, feet
    # and snout shorten separately, with the haunch kept round behind the neck.
    if form.species == "rabbit":
        face_factors = [.73, 1.06, .75, .55]
        rump_factors = [.69, .81, .85, .62]
    elif form.species == "dog":
        face_factors = [.82, 1.06, .65, .51]
        rump_factors = [.72, .89, .72, .52]
    else:
        face_factors = [.92, 1.10 if cat_gait else 1.04, .68, .55]
        rump_factors = [.78, .82, .76, .58]

    # A continuous transition through the shoulder preserves ink and markings.
    # All frames in a gait share one coordinate map and one floor anchor.
    output_y = np.empty((SIZE, SIZE), dtype=float)
    for col, sx in enumerate(source_x[0]):
        mix = np.clip((sx - neck * .72) / (neck * .60), 0., 1.)
        mix = mix * mix * (3. - 2. * mix)
        factors = np.asarray(face_factors) * (1 - mix) + np.asarray(rump_factors) * mix
        dest_height = np.dot(y_lengths, factors)
        output_y[:, col] = inverse_map(y_lengths, factors, FLOOR - dest_height, Y[:, col] + .5)
    inside = (source_x >= 0) & (source_x < width) & (output_y >= 0) & (output_y < height)
    ix = np.clip(np.floor(source_x + left).astype(int), 0, SIZE - 1)
    iy = np.clip(np.floor(output_y + top).astype(int), 0, SIZE - 1)
    return iy, ix, inside


def juvenile_frames(frames, form, walking):
    iy, ix, inside = juvenile_maps(silhouette(frames), form, walking)
    result = []
    for frame in frames:
        pixels = np.asarray(frame)[iy, ix].copy()
        pixels[~inside | (pixels[:, :, 3] == 0)] = 0
        result.append(Image.fromarray(pixels))
    return result


def encoded(image):
    data = BytesIO()
    image.save(data, format="PNG", optimize=True)
    return data.getvalue()


def metadata(source, key):
    template = json.loads(source.read_text(encoding="utf-8"))
    new_id = str(uuid.uuid5(uuid.NAMESPACE_URL, "petshop/" + key))
    return (json.dumps(template, ensure_ascii=False, indent=2).replace(template["uuid"], new_id) + "\n").encode()


def record(path, data):
    if path.exists():
        old = path.read_bytes()
        if old == data or (path.suffix == ".meta" and old.replace(b"\r\n", b"\n") == data):
            return
    path.write_bytes(data)


def build():
    portraits, walks = RESOURCES / "pet-young", RESOURCES / "pet-young-walk"
    for new, old in [(portraits, "pets"), (walks, "pet-walk")]:
        new.mkdir(exist_ok=True)
        record(new.with_suffix(".meta"), metadata(RESOURCES / (old + ".meta"), new.name))
    catalogue = json.loads((ROOT / "动物资源/扩充图鉴/动物索引.json").read_text(encoding="utf-8"))
    for animal in catalogue["animals"]:
        breed = animal["breedId"]
        name = f"{breed}-{animal['coatId']}_{animal['sexId']}"
        portrait = RESOURCES / "pets" / (name + ".png")
        walk = RESOURCES / "pet-walk" / portrait.name
        with Image.open(portrait) as im:
            young, = juvenile_frames([im.convert("RGBA")], BREEDS[breed], False)
        with Image.open(walk) as im:
            sheet = im.convert("RGBA")
            frames = [sheet.crop((SIZE*i, 0, SIZE*(i+1), SIZE)) for i in range(4)]
        strip = Image.new("RGBA", (4*SIZE, SIZE))
        for i, frame in enumerate(juvenile_frames(frames, BREEDS[breed], True)):
            strip.paste(frame, (SIZE*i, 0))
        for folder, source, image in [(portraits, portrait, young), (walks, walk, strip)]:
            output = folder / portrait.name
            record(output, encoded(image))
            record(output.with_suffix(".png.meta"), metadata(source.with_suffix(".png.meta"), folder.name + "/" + name))
    print(f"Built {len(catalogue['animals'])} juvenile portraits and four-frame gaits.")


if __name__ == "__main__":
    build()
