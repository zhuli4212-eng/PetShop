"""Import individually illustrated four-frame strips into existing game texture slots."""
import argparse
import json
from io import BytesIO
from pathlib import Path

from PIL import Image


ROOT = Path(__file__).resolve().parents[2]
RESOURCES = ROOT / "PetShop/assets/resources"
MANIFEST = Path(__file__).with_name("独立逐帧行走") / "动作来源.json"


def import_strips(check):
    sources = json.loads(MANIFEST.read_text(encoding="utf-8"))
    updates = {}
    for key, source in sources.items():
        group, animal = key.split("/")
        if group not in ("pet-walk", "pet-young-walk") or not (RESOURCES / "pets" / (animal + ".png")).is_file():
            raise ValueError(f"Unknown animation slot: {key}")
        target = RESOURCES / group / (animal + ".png")
        if not target.with_suffix(".png.meta").is_file():
            raise ValueError(f"Missing texture metadata: {key}")
        data = (ROOT / source).read_bytes()
        with Image.open(BytesIO(data)) as strip:
            if strip.format != "PNG" or strip.mode != "RGBA" or strip.size != (384, 96):
                raise ValueError(f"Expected a 384×96 RGBA strip: {source}")
            frames = [strip.crop((i*96, 0, (i+1)*96, 96)) for i in range(4)]
            if any(not frame.getchannel("A").getbbox() for frame in frames):
                raise ValueError(f"Empty frame: {source}")
            if len({frame.tobytes() for frame in frames}) != 4:
                raise ValueError(f"Repeated frame: {source}")
        if not target.is_file() or target.read_bytes() != data:
            updates[target] = data

    if check and updates:
        raise SystemExit("Out of sync: " + ", ".join(str(p.relative_to(RESOURCES)) for p in updates))
    for path, data in updates.items():
        path.write_bytes(data)
    print(f"Verified {len(sources)} illustrated strips, updated {len(updates)}.")


if __name__ == "__main__":
    cli = argparse.ArgumentParser(description=__doc__)
    cli.add_argument("--check", action="store_true", help="check source and game strips without writing")
    import_strips(cli.parse_args().check)
