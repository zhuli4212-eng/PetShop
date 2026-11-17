from pathlib import Path
from PIL import Image, ImageDraw, ImageFont
import json

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[4]
REFERENCE = {"adult":"pets", "young":"pet-young"}
COATS = ["golden", "black", "gray and white", "chocolate", "cream", "black-and-white spotted"]

def build_references():
    groups = {}
    for age, directory in REFERENCE.items():
        for sex in ["male", "female"]:
            for start in [1, 4]:
                name = f"{age}-{sex}-{start:02d}-{start+2:02d}"
                items = []
                ref = Image.new("RGB", (304, 768), "#dfdacc")
                ctx = ImageDraw.Draw(ref)
                for r, coat in enumerate(range(start, start+3)):
                    animal = f"lionhead-coat{coat:02d}_{sex}"
                    source = ROOT/"PetShop/assets/resources"/directory/(animal+".png")
                    still = Image.open(source).convert("RGBA")
                    sprite = still.crop(still.getchannel("A").getbbox())
                    sprite.thumbnail((226,196), Image.Resampling.NEAREST)
                    factor = 3
                    sprite = sprite.resize((sprite.width*factor,sprite.height*factor),Image.Resampling.NEAREST)
                    ref.paste(sprite,((304-sprite.width)//2,256*r+(225-sprite.height)//2),sprite)
                    ctx.text((20,256*r+227), f"ROW {r+1}    {age} {sex}   {COATS[coat-1]}", fill="#443a33")
                    items.append({"id":animal, "coat":COATS[coat-1], "still":source.relative_to(ROOT).as_posix()})
                ref.save(HERE/"references"/(name+".png"))
                groups[name]=items
    (HERE/"references.json").write_text(json.dumps(groups,indent=2),encoding="utf8")

if __name__ == "__main__":
    build_references()
