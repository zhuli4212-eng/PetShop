from pathlib import Path
import base64
import json
import re

here = Path(__file__).resolve().parent
out = here.parent / "美术确认稿"
asset_paths = {path.stem: path for path in sorted((out / "素材").iterdir())
               if path.suffix in (".png", ".webp") and not path.stem.endswith("-v2")}
# Embed only the catalog sprites used by this offline preview.
pets = here.parent / "动物资源" / "扩充图鉴" / "图片"
for breed, variant in [("british", "coat01_female"), ("shiba", "coat01_male"),
                       ("corgi", "coat02_female"), ("dachshund", "coat02_female")]:
    asset_paths[f"{breed}_{variant}"] = pets / breed / f"{variant}.png"
for path in sorted((out / "动作").glob("*-walk.png")):
    asset_paths[path.stem] = path
for path in sorted((out / "已故").glob("*-dead.png")):
    asset_paths[path.stem] = path
assets = {key: "data:image/" + path.suffix[1:] + ";base64," + base64.b64encode(path.read_bytes()).decode("ascii")
          for key, path in asset_paths.items()}
commerce = (here / "pet-commerce.js").read_text(encoding="utf-8")
css = re.search(r"const commerceCss = `(.*?)`;", commerce, re.S)
assert css, "Cannot locate commerce styles"
page = (here / "preview.html").read_text(encoding="utf-8")
for key, replacement in [
    ("__COMMERCE_CSS__", css.group(1)), ("__COMMERCE_JS__", commerce[:css.start()] + commerce[css.end():]),
    ("__ASSETS__", json.dumps(assets, ensure_ascii=True)), ("__MOTION_JS__", (here / "pet-motion.js").read_text(encoding="utf-8")),
    ("__GAME_JS__", (here / "pet-screens.js").read_text(encoding="utf-8"))]:
    page = page.replace(key, replacement)
(out / "宠物店界面预览.html").write_text(page, encoding="utf-8")
print(f"{len(assets)} assets, {len(page.encode('utf-8')):,} bytes")
