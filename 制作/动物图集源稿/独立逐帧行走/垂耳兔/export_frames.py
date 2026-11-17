"""Register independently drawn four-pose sheets onto a common 96 px floor."""
from io import BytesIO
from pathlib import Path

import cv2
import numpy as np
from PIL import Image, ImageDraw


HERE = Path(__file__).resolve().parent
PETS = HERE.parents[3] / "PetShop/assets/resources"
SIZE, FLOOR = 96, 89
# Each age has one fixed scale for every pose. Only the free-flight frame is
# lifted off the floor. All silhouettes, ear arcs and limb positions were drawn.
SCALES = {"adult": .145, "young": .116}
FLIGHT_CLEARANCE = {"adult": 8, "young": 5}
# Landing and gathering are the two sides of the same forepaw contact. These
# small whole-cel translations register the planted toe across the loop seam.
CONTACT_X = {"adult": (-4, 0, 0, 3), "young": (-1, 0, 0, 1)}
PHASES = ("Gather", "Push off", "Airborne", "Forepaw landing")


def cut(sheet, phase):
    col, row = phase % 2, phase // 2
    width, height = sheet.size
    crop = sheet.crop((col * width // 2, row * height // 2,
                       (col + 1) * width // 2, (row + 1) * height // 2))
    rgba = np.array(crop)
    _, labels, stats, _ = cv2.connectedComponentsWithStats((rgba[:, :, 3] >= 115).astype("uint8"), 8)
    groups = np.flatnonzero(stats[1:, cv2.CC_STAT_AREA] > 1500) + 1
    if len(groups) != 1:
        raise ValueError(f"Expected one complete pose in cell {phase + 1}.")
    group = groups[0]
    x, y, w, h = stats[group, :4]
    fringe = cv2.dilate((labels == group).astype("uint8"), np.ones((3, 3), np.uint8))
    rgba[fringe == 0] = 0
    return Image.fromarray(rgba).crop((x, y, x + w, y + h))


def register(figure, stage, phase):
    scale = SCALES[stage]
    # One aspect-preserving resize; the same factor applies to all four crops.
    target = (round(figure.width * scale), round(figure.height * scale))
    figure = figure.resize(target, Image.Resampling.BOX)
    data = np.array(figure)
    opaque = data[:, :, 3] >= 124
    data[~opaque] = 0
    data[opaque, 3] = 255
    figure = Image.fromarray(data)
    figure = figure.crop(figure.getbbox())
    mask = np.array(figure.getchannel("A")) > 0
    centre_x = np.nonzero(mask)[1].mean()
    left = round((SIZE - 1) / 2 - centre_x) + CONTACT_X[stage][phase]
    bottom = FLOOR - (FLIGHT_CLEARANCE[stage] if phase == 2 else 0)
    frame = Image.new("RGBA", (SIZE, SIZE))
    frame.paste(figure, (left, bottom + 1 - figure.height))
    bbox = frame.getbbox()
    assert 0 < bbox[0] < bbox[2] < SIZE and bbox[1] > 0 and bbox[3] == bottom + 1
    return frame


def save(path, data):
    if not path.exists() or path.read_bytes() != data:
        path.write_bytes(data)


def write_png(name, image):
    data = BytesIO()
    image.save(data, format="PNG", optimize=True)
    save(HERE / name, data.getvalue())


def proof(ages):
    width, height = 202, 212
    board = Image.new("RGB", (width * 5, height * 2), "#d9c8a8")
    draw = ImageDraw.Draw(board)
    for row, (stage, frames) in enumerate(ages.items()):
        ref_dir = "pets" if stage == "adult" else "pet-young"
        with Image.open(PETS / ref_dir / "lop-coat06_female.png") as reference:
            pictures = [reference.convert("RGBA"), *frames]
        for col, (label, frame) in enumerate(zip(("Portrait", *PHASES), pictures)):
            x, y = width * col + 5, height * row + 5
            draw.text((x + 2, y), stage + " / " + label, fill="#594b38")
            top = y + 11
            for tick in range(0, SIZE * 2, 10):
                draw.line((x + tick, top + FLOOR * 2 + 1, x + tick + 4, top + FLOOR * 2 + 1), fill="#997a55")
            im = frame.resize((192, 192), Image.Resampling.NEAREST)
            board.paste(im, (x, top), im)
    write_png("contact-frames.png", board)

    pages = []
    for phase in range(4):
        page = Image.new("RGB", (400, 208), "#d9c8a8")
        draw = ImageDraw.Draw(page)
        for col, (stage, frames) in enumerate(ages.items()):
            x, y = col*200+4, 9
            draw.text((x+4, y), stage, fill="#594b38")
            im = frames[phase].resize((192, 192), Image.Resampling.NEAREST)
            page.paste(im, (x, y), im)
        pages.append(page)
    gif = BytesIO()
    pages[0].save(gif, format="GIF", save_all=True, append_images=pages[1:], duration=[150, 105, 130, 110], loop=0)
    save(HERE / "loop.gif", gif.getvalue())


def main():
    ages = {}
    for stage in SCALES:
        with Image.open(HERE / (stage + "-source.png")) as source:
            sheet = source.convert("RGBA")
        frames = [register(cut(sheet, phase), stage, phase) for phase in range(4)]
        assert len({frame.tobytes() for frame in frames}) == 4
        ground = [np.asarray(frame.getchannel("A"))[FLOOR] > 0 for frame in frames]
        assert not ground[2].any() and (ground[3] & ground[0]).any()
        strip = Image.new("RGBA", (4 * SIZE, SIZE))
        for i, frame in enumerate(frames):
            strip.paste(frame, (i * SIZE, 0))
        write_png(stage + "-walk.png", strip)
        ages[stage] = frames
    proof(ages)


if __name__ == "__main__":
    main()
