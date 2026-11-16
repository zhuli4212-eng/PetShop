"""Bake the catalogue coats into four-frame, left-facing, 96px floor animations."""
import json
import uuid
from io import BytesIO
from pathlib import Path

import cv2
import numpy as np
from PIL import Image


ROOT = Path(__file__).resolve().parents[2]
RESOURCES = ROOT / "PetShop/assets/resources"
APPROVED = ROOT / "美术确认稿/动作"
SIZE = 96
# These four individual strips and the two original rabbit colours were drawn for the preview.
ORIGINALS = {
    "british-coat01_female": "british_coat01_female",
    "shiba-coat01_male": "shiba_coat01_male",
    "corgi-coat02_female": "corgi_coat02_female",
    "dachshund-coat02_female": "dachshund_coat02_female",
    "angora-coat01_female": "angora",
    "domestic-coat01_male": "brown",
}
RABBITS = {"domestic", "angora", "lionhead", "lop"}
CATS = {"british", "american", "maine", "persian"}
GRID_Y, GRID_X = np.mgrid[0:SIZE, 0:SIZE].astype(np.float32)


def read(path):
    with Image.open(path) as im:
        return np.asarray(im.convert("RGBA"))


def bounds(rgba):
    y, x = np.where(rgba[:, :, 3] >= 85)
    return x.min(), y.min(), x.max(), y.max()


def warp_pixels(source, controls):
    """Map triangles backwards into the unmodified pixels. Keep the original ink and alpha."""
    src = np.array([p[0] for p in controls], np.float32)
    dst = np.array([p[1] for p in controls], np.float32)
    mesh = cv2.Subdiv2D((0, 0, SIZE, SIZE))
    for x, y in dst:
        mesh.insert((float(x), float(y)))
    mx, my = GRID_X.copy(), GRID_Y.copy()
    for tri in mesh.getTriangleList().reshape((-1, 3, 2)):
        if np.any(tri < 0) or np.any(tri > SIZE - 1):
            continue
        indices = [((dst - pt) ** 2).sum(1).argmin() for pt in tri]
        transform = cv2.getAffineTransform(tri, src[indices])
        mask = np.zeros((SIZE, SIZE), np.uint8)
        cv2.fillConvexPoly(mask, np.int32(np.rint(tri)), 1)
        ys, xs = np.where(mask)
        mx[ys, xs] = transform[0, 0] * xs + transform[0, 1] * ys + transform[0, 2]
        my[ys, xs] = transform[1, 0] * xs + transform[1, 1] * ys + transform[1, 2]
    return cv2.remap(source, mx, my, cv2.INTER_NEAREST, borderMode=cv2.BORDER_CONSTANT)


def controls_for(source, bones):
    left, top, right, bottom = bounds(source)
    controls = []
    for x, y, dx, dy in bones:
        point = (left + x * (right - left), top + y * (bottom - top))
        target = (np.clip(point[0] + dx, 1, SIZE - 2), np.clip(point[1] + dy, 1, SIZE - 2))
        controls.append((point, target))
    for x, y in [(0, 0), (95, 0), (0, 95), (95, 95)]:
        controls.append(((x, y), (x, y)))
    return controls


def rabbit_frame(source, breed, phase):
    # Gather, push off, tuck the hind feet, then reach for the floor with the front paws.
    nose_x = [0, -4, -1, -4][phase]
    rise = [0, -4, -6, -1][phase]
    ears = ([0, 6, -1, -4] if breed == "lop" else [0, 5, 2, -2])[phase]
    rump = [0, 4, -1, 3][phase]
    fore_foot = [0, -9, 2, -7][phase]
    hind_foot = [0, 10, -5, 4][phase]
    bones = [
        (.40, 0, nose_x + ears, rise + abs(ears) * .35),
        (.66, .08, nose_x + ears, rise + abs(ears) * .35),
        (.19, .44, nose_x, rise), (.38, .48, nose_x, rise),
        (.04, .62, nose_x, rise), (.36, .66, nose_x * .6, rise),
        (.72, .53, rump, rise), (.96, .73, rump, rise),
        (.61, .78, rump * .4, rise), (.20, 1, fore_foot, [0, -2, -6, 0][phase]),
        (.42, .99, fore_foot * .6, [0, -1, -5, 0][phase]),
        (.77, 1, hind_foot, [0, 0, -7, -3][phase]), (.93, .94, hind_foot, [0, 0, -6, -3][phase]),
    ]
    return warp_pixels(source, controls_for(source, bones))


def dog_frame(source, breed, phase):
    # Pairs of paws alternate. The ears, muzzle and eyes move as one rigid part.
    reach = [1, -1, -1, 1][phase]
    near = [6, 2, -6, -2][phase]
    high = [0, -1, 0, -1][phase]
    if breed == "dachshund":
        fore, rear = (.19, .33), (.67, .78)
    elif breed == "poodle":
        fore, rear = (.32, .47), (.68, .84)
    else:
        fore, rear = (.24, .40), (.65, .80)
    bones = [
        (.27, .02, 0, high), (.06, .30, 0, high), (.48, .34, 0, high),
        (.14, .47, 0, high), (.32, .62, 0, high),
        (.65, .50, 0, -high), (.77, .67, 0, -high),
        (.94, .34, reach, -reach * 1.5), (.92, .59, reach, -reach),
    ]
    for i, x in enumerate((*fore, *rear)):
        step = near * (1 if i in (0, 3) else -1)
        lift = -5 if ((phase + (0 if i in (0, 3) else 2)) % 4 == 1) else 0
        bones.extend([(x, .82, step * .36, lift * .4), (x, .99, step, lift)])
    return warp_pixels(source, controls_for(source, bones))


def cat_frame(source, breed, master, phase):
    # The portraits sit. Use the actual standing gait and its original outlines
    # for the body, paws and tail, then attach the animal's rigid head and ruff.
    x0, y0, x1, y1 = bounds(source)
    width, height = x1 - x0, y1 - y0
    base = master[:, SIZE * phase:SIZE * (phase + 1)].copy()
    yy, xx = GRID_Y, GRID_X
    opaque = source[:, :, 3] > 190
    first_y = np.argmax(opaque, axis=0)
    last_y = SIZE - 1 - np.argmax(opaque[::-1], axis=0)
    def fur(u, v):
        # Sample inside the silhouette, away from the seated outline and toes.
        x = np.rint(x0 + u * width).astype(int)
        y = np.rint(first_y[x] + v * (last_y[x] - first_y[x])).astype(int)
        return source[y, x, :3].astype(float)

    long_hair = breed in {"persian", "maine"}
    tail_x = 67 if long_hair else 69
    # The flank keeps the same stripes and patches throughout the cycle.
    u = .40 + .47 * np.clip((xx - 31) / (tail_x - 31), 0, 1)
    v = .22 + .53 * np.clip((yy - 53) / 24, 0, 1)
    sample = fur(u, v)
    def limb_colour(u, v):
        neighbourhood = [fur(np.array(u + du), v + dv)
                         for du in [-.025, 0, .025] for dv in [-.045, 0, .045]]
        return np.median(neighbourhood, axis=0)
    def toe_colour(left, right):
        patch = source[round(y0+.90*height):round(y0+.96*height)+1,
                       round(x0+left*width):round(x0+right*width)+1]
        pixels = patch[patch[:,:,3] > 190, :3]
        light = pixels @ np.array([.299, .587, .114])
        return np.median(pixels[light >= np.percentile(light, 68)], axis=0)
    fore = toe_colour(.15, .43)
    hind = toe_colour(.49, .65)
    tail = limb_colour(.77, .61)
    foot_mix = np.clip((yy - 75)/7, 0, 1)[:, :, None]
    sample = sample * (1 - foot_mix) + np.where((xx < 41)[:,:,None], fore, hind) * foot_mix
    if long_hair:
        tail_mask = (xx >= tail_x) & ((yy < 73 + (xx-tail_x)*.53) | (xx > 79))
    else:
        tail_mask = (xx >= tail_x) & (yy < 72)
    sample[tail_mask] = tail

    luma = base[:, :, :3] @ np.array([.299, .587, .114])
    # Preserve the original gait's light/shadow, including its far legs. The
    # orange tail on the long-hair master gets its own range for pale coats.
    ink = base[:, :, 3] > 90
    edge = ink & ~cv2.erode(ink.astype(np.uint8), np.ones((3, 3), np.uint8)).astype(bool)
    shade = np.ones_like(luma)
    for region in [~tail_mask, tail_mask]:
        low, mid, bright = np.percentile(luma[ink & region], [8, 55, 94])
        shade[region] = np.interp(luma[region], [0, low, mid, bright, 255],
                                  [.32, .43, .94, 1.12, 1.18])
    shade[edge] = np.minimum(shade[edge], .54)
    base[:, :, :3] = np.uint8(np.clip(sample * shade[:, :, None], 0, 255))
    remove_head = np.interp(yy, [0, 58, 64, 70, 75], [35, 35, 29, 17, 8])
    base[(xx < remove_head) & (yy < 75), 3] = 0

    # Clip along the attachment side of the ruff in source coordinates. The
    # coat, nose, tufts, ear tips and eyes are an intact section of the portrait.
    uv = [(0,0),(.76,0),(.70,.27),(.60,.41),(.58,.50),(.50,.58),
          (.43,.63),(.36,.67),(.30,.72),(.22,.75),(0,.74)]
    outline = np.int32([(round(x0 + u * width), round(y0 + v * height)) for u,v in uv])
    head = source.copy()
    mask = np.zeros((SIZE, SIZE), np.uint8)
    cv2.fillPoly(mask, [outline], 255)
    head[:, :, 3] = np.minimum(head[:, :, 3], mask)
    scale = .80
    # The neck follows the master shoulders, which bounce by only one pixel.
    dest_x = 8 if long_hair else 9
    dest_y = 57 - .40 * height * scale - [0,1,0,1][phase]
    matrix = np.float32([[scale,0,dest_x-scale*x0], [0,scale,dest_y-scale*y0]])
    head = cv2.warpAffine(head, matrix, (SIZE, SIZE), flags=cv2.INTER_NEAREST)
    return np.array(Image.alpha_composite(Image.fromarray(base), Image.fromarray(head)))


def metadata(output):
    # The runtime cuts Texture2D rects itself; importing 144 unused sprite subassets
    # would also add sprite frame meshes to the game bundle.
    template = json.loads((RESOURCES / "pets/angora-coat01_female.png.meta").read_text("utf-8"))
    ident = str(uuid.uuid5(uuid.NAMESPACE_URL, "petshop/pet-walk/" + output.stem))
    old = template["uuid"]
    del template["subMetas"]["f9941"]
    template["userData"]["type"] = "texture"
    texture = template["subMetas"]["6c48a"]
    texture["displayName"] = output.stem
    return json.dumps(template, ensure_ascii=False, indent=2).replace(old, ident) + "\n"


def main():
    output = RESOURCES / "pet-walk"
    output.mkdir(exist_ok=True)
    directory_meta = json.loads((RESOURCES / "pets.meta").read_text("utf-8"))
    directory_meta["uuid"] = str(uuid.uuid5(uuid.NAMESPACE_URL, "petshop/pet-walk"))
    record(output.with_suffix(".meta"), (json.dumps(directory_meta, indent=2) + "\n").encode("utf-8"))
    masters = {name: read(APPROVED / (name + "-walk.png")) for name in ["cat", "british_coat01_female"]}
    portraits = sorted(p for p in (RESOURCES / "pets").glob("*.png") if p.stem.endswith(("_male", "_female")))
    assert len(portraits) == 144
    for path in portraits:
        breed = path.stem.split("-")[0]
        target = output / path.name
        if path.stem in ORIGINALS:
            data = (APPROVED / (ORIGINALS[path.stem] + "-walk.png")).read_bytes()
        else:
            src = read(path)
            if breed in RABBITS:
                frames = [rabbit_frame(src, breed, i) for i in range(4)]
            elif breed in CATS:
                master = masters["cat" if breed in {"maine", "persian"} else "british_coat01_female"]
                frames = [cat_frame(src, breed, master, i) for i in range(4)]
            else:
                frames = [dog_frame(src, breed, i) for i in range(4)]
            sheet = np.concatenate(frames, axis=1)
            sheet[sheet[:, :, 3] == 0] = 0
            encoded = BytesIO()
            Image.fromarray(sheet).save(encoded, format="PNG", optimize=True)
            data = encoded.getvalue()
        record(target, data)
        record(target.with_suffix(".png.meta"), metadata(target).encode("utf-8"))
    print(f"Baked {len(portraits)} walk sheets to {output}")


def record(path, data):
    if path.exists():
        old = path.read_bytes()
        if old == data or (path.suffix == ".meta" and old.replace(b"\r\n", b"\n") == data):
            return
    path.write_bytes(data)


if __name__ == "__main__":
    main()
