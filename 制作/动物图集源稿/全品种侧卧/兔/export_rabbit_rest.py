"""Export the unfilled rabbit coats from four ImageGen sheets, without changing approved poses."""
from io import BytesIO
from pathlib import Path

import cv2
import numpy as np
from PIL import Image, ImageDraw


HERE = Path(__file__).resolve().parent
PETS = HERE.parents[3] / "PetShop/assets/resources/pets"
COATS = {
    "domestic": (2, 3, 4, 5, 6),
    "lop": (1, 2, 3, 4, 5, 6),
    "angora": (3, 4, 5),
    "lionhead": (1, 2, 3, 4, 5, 6),
}
WIDTHS = {"domestic": (65, 61), "lop": (77, 72), "angora": (78, 73), "lionhead": (73, 69)}
SEXES = ("male", "female")


def source_sprite(sheet, row, column, rows):
    width, height = sheet.size
    cell = sheet.crop((column * width // 2, row * height // rows,
                       (column + 1) * width // 2, (row + 1) * height // rows))
    rgba = np.array(cell)
    solid = (rgba[:, :, 3] >= 115).astype("uint8")
    _, labels, stats, _ = cv2.connectedComponentsWithStats(solid, connectivity=8)
    groups = np.flatnonzero(stats[1:, cv2.CC_STAT_AREA] > 1500) + 1
    if len(groups) != 1:
        raise ValueError(f"Expected one full rabbit in row {row + 1}, column {column + 1}")
    component = groups[0]
    x, y, w, h = stats[component, :4]
    # The sheets have occasional isolated translucent dots in the gutters.
    # Retain a one-pixel antialias fringe around the animal alone.
    keep = cv2.dilate((labels == component).astype("uint8"), np.ones((3, 3), np.uint8))
    rgba[keep == 0] = 0
    return Image.fromarray(rgba).crop((x, y, x + w, y + h))


def coat_palette(adult):
    rgba = np.asarray(adult)
    fur = rgba[rgba[:, :, 3] >= 180, :3].reshape(-1, 1, 3)
    quantized = Image.fromarray(fur).quantize(colors=40, dither=Image.Dither.NONE)
    table = np.array(quantized.getpalette(), dtype="uint8").reshape(-1, 3)
    return table[np.unique(np.asarray(quantized))]


def resting_sprite(source, adult, width):
    height = round(width * source.height / source.width)
    reduced = np.array(source.resize((width, height), Image.Resampling.BOX))
    opaque = reduced[:, :, 3] >= 120
    # Use the individual adult's coat ramp, including ears/paws, while keeping
    # all shading, closed eyelids and coat-pattern boundaries of the new pose.
    palette = coat_palette(adult)
    lab = cv2.cvtColor(reduced[:, :, :3], cv2.COLOR_RGB2LAB).astype(float)
    colors = cv2.cvtColor(palette[None, :, :], cv2.COLOR_RGB2LAB)[0].astype(float)
    distances = np.sum((lab[:, :, None, :] - colors) ** 2, axis=3)
    reduced[:, :, :3] = palette[np.argmin(distances, axis=2)]
    reduced[:, :, 3] = opaque.astype("uint8") * 255
    reduced[~opaque] = 0
    figure = Image.fromarray(reduced)
    figure = figure.crop(figure.getbbox())
    sprite = Image.new("RGBA", (96, 64))
    sprite.paste(figure, ((96 - figure.width) // 2, 59 - figure.height))
    return sprite


def write_png(path, image):
    buffer = BytesIO()
    image.save(buffer, format="PNG", optimize=True)
    data = buffer.getvalue()
    if not path.exists() or path.read_bytes() != data:
        path.write_bytes(data)


def main():
    board = Image.new("RGB", (1040, 1016), "#d5c4a9")
    draw = ImageDraw.Draw(board)
    for i, (breed, coats) in enumerate(COATS.items()):
        ox, oy = (i % 2) * 520, (i // 2) * 508
        draw.rectangle((ox, oy, ox + 519, oy + 26), fill="#494336")
        draw.text((ox + 8, oy + 7), breed + "    male: adult / rest       female: adult / rest", fill="#fff3d8")
        with Image.open(HERE / (breed + "-source.png")) as source:
            sheet = source.convert("RGBA")
        for row, coat in enumerate(coats):
            y = oy + 28 + row * 78
            draw.text((ox + 4, y + 38), f"{coat:02}", fill="#4e3c2f")
            for col, sex in enumerate(SEXES):
                name = f"{breed}-coat{coat:02}_{sex}"
                with Image.open(PETS / (name + ".png")) as image:
                    adult = image.convert("RGBA")
                figure = source_sprite(sheet, row, col, len(coats))
                rest = resting_sprite(figure, adult, WIDTHS[breed][col])
                write_png(PETS / (name + "-rest.png"), rest)
                x = ox + 26 + col * 238
                thumb = adult.crop(adult.getbbox())
                thumb.thumbnail((68, 70), Image.Resampling.NEAREST)
                board.paste(thumb, (x + (81 - thumb.width) // 2, y + 70 - thumb.height), thumb)
                board.paste(rest, (x + 89, y + 11), rest)
    write_png(HERE / "兔类40种外观侧卧对照.png", board)


if __name__ == "__main__":
    main()
