"""Cut independently drawn rabbit gaits. No pose synthesis, mirroring or colour editing."""
import argparse
import json
from hashlib import sha256
from io import BytesIO
from pathlib import Path

import cv2
import numpy as np
from PIL import Image, ImageDraw


HERE = Path(__file__).resolve().parent
RESOURCES = HERE.parents[4] / "PetShop/assets/resources"
CONFIG = json.loads((HERE / "批次.json").read_text(encoding="utf-8"))
SIZE, FLOOR = 96, 89


def write(path, data):
    path.parent.mkdir(exist_ok=True)
    if not path.exists() or path.read_bytes() != data:
        path.write_bytes(data)


def write_png(path, image):
    data = BytesIO()
    image.save(data, format="PNG", optimize=True)
    write(path, data.getvalue())


def opaque(image):
    return np.asarray(image.getchannel("A")) >= 128


def cut_rows(sheet, row_count):
    rgba = np.array(sheet)
    mask = (rgba[:, :, 3] >= 122).astype("uint8")
    _, labels, stats, centroids = cv2.connectedComponentsWithStats(mask, connectivity=8)
    groups = [i for i in range(1, len(stats)) if stats[i, cv2.CC_STAT_AREA] > max(700, mask.size * .0006)]
    if len(groups) != 4 * row_count:
        raise ValueError(f"Expected {4*row_count} complete figures; observed {len(groups)}")
    groups.sort(key=lambda i: centroids[i, 1])
    rows = []
    for r in range(row_count):
        poses = []
        for i in sorted(groups[4*r:4*r+4], key=lambda i: centroids[i, 0]):
            x, y, w, h = stats[i, :4]
            box = np.array(rgba[y:y+h, x:x+w], copy=True)
            group = (labels[y:y+h, x:x+w] == i).astype("uint8")
            keep = cv2.dilate(group, np.ones((3, 3), np.uint8))
            box[keep == 0] = 0
            poses.append(Image.fromarray(box))
        rows.append(poses)
    return rows


def reduced_pose(source, scale):
    size = (round(source.width*scale), round(source.height*scale))
    image = np.array(source.resize(size, Image.Resampling.BOX))
    solid = image[:, :, 3] >= 122
    image[~solid] = 0
    image[solid, 3] = 255
    result = Image.fromarray(image)
    return result.crop(result.getbbox())


def register(poses, portrait, stage):
    # Match the amount of visible fur of the gathered rabbit to its own shop
    # portrait. One common uniform scale is applied to all four hand-drawn poses.
    scale = min(np.sqrt(opaque(portrait).sum() / opaque(poses[0]).sum()),
                88 / max(im.width for im in poses), 78 / max(im.height for im in poses))
    figures = [reduced_pose(im, scale) for im in poses]
    left = [round(47.5 - np.nonzero(opaque(im))[1].mean()) for im in figures]
    left = [max(2, min(x, SIZE - 2 - im.width)) for x, im in zip(left, figures)]
    # During landing and gathering it is the left-facing rabbit's forepaw that
    # remains planted. Make the first two visible toes overlap across the seam.
    ground = [np.flatnonzero(opaque(im)[-1]) for im in figures]
    difference = int(left[0] + ground[0].min() - left[3] - ground[3].max())
    if difference > 0:
        back = min((difference+1)//2, left[0]-2)
        left[0] -= back
        left[3] = min(SIZE-2-figures[3].width, left[3]+difference-back)
    frames = []
    for i, (figure, x) in enumerate(zip(figures, left)):
        bottom = FLOOR - ((8 if stage == "adult" else 5) if i == 2 else 0)
        frame = Image.new("RGBA", (SIZE, SIZE))
        frame.paste(figure, (x, bottom+1-figure.height))
        assert frame.getbbox()[3] == bottom + 1
        frames.append(frame)
    return frames, scale


def proof(batch, records):
    width, height = 154, 154
    board = Image.new("RGB", (width * 5, 23+height*len(records)), "#d7c7aa")
    draw = ImageDraw.Draw(board)
    for col, caption in enumerate(("Shop portrait", "1 / gather", "2 / hind push", "3 / airborne", "4 / forepaw landing")):
        draw.text((col*width+6, 4), caption, fill="#4c3c29")
    for row, (name, portrait, frames) in enumerate(records):
        top = 23 + row*height
        draw.text((5, top+1), name.removeprefix("domestic-"), fill="#4c3c29")
        for col, im in enumerate([portrait, *frames]):
            x, y = col*width+5, top+10
            zoom = 144
            line = y + round((FLOOR+.5)*zoom/SIZE)
            for tick in range(0, zoom, 8):
                draw.line((x+tick, line, x+tick+3, line), fill="#ab9579")
            enlarged = im.resize((zoom, zoom), Image.Resampling.NEAREST)
            board.paste(enlarged, (x, y), enlarged)
    write_png(HERE/"复核"/(batch+".png"), board)


def build_batch(batch):
    stage = batch.split("-")[0]
    names = CONFIG[batch]
    with Image.open(HERE/"母稿"/(batch+".png")) as file:
        rows = cut_rows(file.convert("RGBA"), len(names))
    records = []
    for name, poses in zip(names, rows):
        portrait_dir = "pets" if stage == "adult" else "pet-young"
        with Image.open(RESOURCES/portrait_dir/(name+".png")) as im:
            portrait = im.convert("RGBA")
        frames, scale = register(poses, portrait, stage)
        assert len({frame.tobytes() for frame in frames}) == 4
        strip = Image.new("RGBA", (4*SIZE, SIZE))
        for i, frame in enumerate(frames):
            strip.paste(frame, (i*SIZE, 0))
        write_png(HERE/stage/(name+".png"), strip)
        records.append((name, portrait, frames))
        print(batch, name, f"{scale:.4f}", [f.getbbox() for f in frames])
    proof(batch, records)


def check_candidates():
    seen = set()
    records = []
    for batch, names in CONFIG.items():
        stage = batch.split("-")[0]
        portrait_dir = "pets" if stage == "adult" else "pet-young"
        for row, name in enumerate(names, 1):
            path = HERE/stage/(name+".png")
            with Image.open(path) as file:
                strip = file.convert("RGBA")
            assert strip.size == (384, 96)
            frames = [strip.crop((96*i, 0, 96*i+96, 96)) for i in range(4)]
            assert len({im.tobytes() for im in frames}) == 4
            masks = [opaque(im) for im in frames]
            feet = [np.flatnonzero(m[FLOOR]).tolist() for m in masks]
            assert all(feet[i] for i in (0, 1, 3)) and not feet[2]
            assert set(feet[0]) & set(feet[3]), (name, "loop contact")
            bounds = [f.getbbox() for f in frames]
            assert all(b[0] >= 1 and b[2] < SIZE and b[1] > 0 for b in bounds)
            contacts = [(np.mean(feet[i])-bounds[i][0]) / (bounds[i][2]-bounds[i][0]-1) for i in (1, 3)]
            # All rabbits face left. Push-off should read from the right, and
            # landing from the left; inspection boards show which limb touches.
            assert contacts[0] > .59 and contacts[1] < .49, (name, "contact side", contacts)
            with Image.open(RESOURCES/portrait_dir/path.name) as source:
                ratio = masks[0].sum() / opaque(source.convert("RGBA")).sum()
            assert .82 <= ratio <= 1.07, (name, "identity volume", ratio)
            fingerprint = sha256(path.read_bytes()).hexdigest()
            assert fingerprint not in seen
            seen.add(fingerprint)
            records.append({"id": name, "stage": stage, "source": "母稿/"+batch+".png", "row": row,
                            "file": stage+"/"+path.name, "sha256": fingerprint,
                            "floor_y": [b[3]-1 for b in bounds], "gather_vs_portrait_area": round(float(ratio), 3)})
    assert len(records) == 23
    write(HERE/"冻结清单.json", (json.dumps(records, ensure_ascii=False, indent=2) + "\n").encode("utf-8"))


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("batches", nargs="*", help="Default: all eight batches")
    args = parser.parse_args()
    for batch_name in args.batches or CONFIG:
        build_batch(batch_name)
    if not args.batches:
        check_candidates()
