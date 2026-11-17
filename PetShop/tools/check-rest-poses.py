"""Check every catalogue identity against the built game using an isolated aged shop."""
import argparse
import json
import subprocess
from pathlib import Path
from tempfile import TemporaryDirectory

from playwright.sync_api import sync_playwright


GAME = Path(__file__).resolve().parents[1]
PETS = GAME / "assets/resources/pets"
SERVER = """
import {GameStore} from './server/game-store.mjs';
import {createPetShopServer} from './server/main.mjs';
import {BREEDS, petArt} from './server/care.mjs';
import {petNames} from './server/pet-names.mjs';
const store=new GameStore(process.argv[1]); store.ensure();
const s=store.state, base=s.pets[0], bornAt=store.now()-20*86400000;
s.rooms.cat=structuredClone(s.rooms.rabbit); s.rooms.dog=structuredClone(s.rooms.rabbit);
s.shopXp=18000; s.visitBook.opening=false; s.pets=[];
for (const [breedKey, cfg] of Object.entries(BREEDS)) {
  for (let coatIndex=1; coatIndex<=cfg.coats.length; coatIndex++) {
    for (const sex of ['公','母']) {
      const i=s.pets.length;
      s.pets.push({...structuredClone(base),id:(0xfa0000+i).toString(16)+'-fixture',
        name:petNames[i],species:cfg.species,breedKey,coatIndex,sex,bornAt,retained:false});
    }
  }
}
const samples=['pets/lop-coat05_female','pets/american-coat01_male','pets/poodle-coat06_female'];
s.pets.sort((a,b)=>Number(samples.includes(petArt(b)))-Number(samples.includes(petArt(a))));
store.save(s);
const server=createPetShopServer(undefined,{store});
server.listen(0,'127.0.0.1',()=>console.log(JSON.stringify({port:server.address().port,
  pets:s.pets.map(p=>({id:p.id,name:p.name,species:p.species,art:petArt(p)}))})));
"""

# The name on each card ties its sprite to the individual, including shared poses.
CHECK = """({kind, expected})=>{
  const scene=window.shopSession, layer=scene.host.layer;
  if(scene.current?.key!==kind) return false;
  const cards={};
  for(const sp of layer.getComponentsInChildren(cc.Sprite)){
    if(!sp.node.activeInHierarchy || !sp.spriteFrame) continue;
    const n=sp.node, parent=n.parent;
    const card=kind==='rooms' && n.name==='Portrait' && parent.name==='Thumb' ? parent.parent :
      kind==='recycle' && n.name==='Icon' ? parent :
      kind==='pet' && n.name==='Portrait' ? parent : null;
    const name=card?.getChildByName('Name')?.getComponent(cc.Label)?.string;
    if(name && !sp.grayscale && n.angle===0) cards[name]=sp.spriteFrame._uuid;
  }
  return Object.entries(expected).every(([name,id])=>cards[name]===id);
}"""


def expected_frame(pet):
    key = pet["art"].split("/")[1]
    shared = key.rsplit("_", 1)[0] + "-rest.png"
    image = PETS / shared if (PETS / shared).is_file() else PETS / (key + "-rest.png")
    meta = json.loads(image.with_suffix(".png.meta").read_text(encoding="utf-8"))
    bundle = GAME / "build/web-mobile/assets/resources/native"
    uid = meta["uuid"]
    assert (bundle / uid[:2] / (uid + ".png")).read_bytes() == image.read_bytes(), image
    return meta["subMetas"]["f9941"]["uuid"]


def run(browser, fixture, width, output):
    page = browser.new_page(viewport={"width": width, "height": 568 if width == 320 else 844},
                            is_mobile=True, has_touch=True, reduced_motion="reduce")
    errors = []
    page.on("pageerror", lambda error: errors.append(str(error)))
    page.goto("http://127.0.0.1:" + str(fixture["port"]))
    page.wait_for_function("""()=>window.cc?.director?.getScene()?.getChildByName('Canvas')
        ?.getComponent('ShopMain')?.shop?.profileId""")
    page.evaluate("""()=>{window.shopSession=cc.director.getScene().getChildByName('Canvas')
        .getComponent('ShopMain').session;}""")

    def open_page(kind, args):
        page.evaluate("([k,a])=>shopSession.open(k,a)", [kind, args])

    def check(kind, pets):
        expected = {p["name"]: p["frame"] for p in pets}
        assert len(expected) == len(pets)
        page.wait_for_function(CHECK, arg={"kind": kind, "expected": expected}, timeout=25000)

    for species in ["rabbit", "cat", "dog"]:
        pets = [p for p in fixture["pets"] if p["species"] == species]
        open_page("rooms", {"species": species, "filter": "已故"})
        check("rooms", pets)
        page.wait_for_function("""ids=>ids.every((id,i)=>{
            const sp=shopSession.host.layer.getComponentsInChildren(cc.Sprite).find(s=>
                s.node.name==='Portrait' && s.node.parent.name==='Resident'+i);
            return sp?.spriteFrame?._uuid===id && sp.node.angle===0 && !sp.grayscale
                && !!sp.node.parent.getChildByName('AtRest');
        })""", arg=[p["frame"] for p in pets[:3]])
        if width == 390:
            # Check each individual file in addition to both full lists.
            for p in pets:
                open_page("pet", {"id": p["id"]})
                check("pet", [p])
        sample = pets[0]
        open_page("pet", {"id": sample["id"]})
        check("pet", [sample])
        if output:
            page.screenshot(path=output / f"{width}-{species}-档案.png")
        point = page.evaluate("""()=>{
          const main=cc.director.getScene().getChildByName('Canvas').getComponent('ShopMain');
          const l=shopSession.host.layer.getComponentsInChildren(cc.Label).find(l=>
            l.node.activeInHierarchy && l.string==='前往研究所回收');
          const v=main.node.getComponent(cc.Canvas).cameraComponent.worldToScreen(l.node.worldPosition);
          const c=document.querySelector('canvas'), r=c.getBoundingClientRect();
          return [r.x+v.x*r.width/c.width,r.bottom-v.y*r.height/c.height];
        }""")
        page.touchscreen.tap(*point)
        page.wait_for_function("id=>shopSession.current?.key==='recycle' && shopSession.current.selected.has(id)",
                               arg=sample["id"])
        check("recycle", pets)
        if output:
            page.screenshot(path=output / f"{width}-{species}-回收.png")
        print(width, species, len(pets), "room and recycle portraits matched", flush=True)
    assert not errors, errors
    page.close()


if __name__ == "__main__":
    arg = argparse.ArgumentParser()
    arg.add_argument("--screenshots", type=Path)
    output = arg.parse_args().screenshots
    if output:
        output.mkdir(parents=True, exist_ok=True)
    with TemporaryDirectory(prefix="petshop-resting-") as save:
        proc = subprocess.Popen(["node", "--input-type=module", "-e", SERVER, save], cwd=GAME,
                                stdout=subprocess.PIPE, text=True, encoding="utf-8",
                                creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0))
        try:
            fixture = json.loads(proc.stdout.readline())
            for p in fixture["pets"]:
                p["frame"] = expected_frame(p)
            with sync_playwright() as pw:
                browser = pw.chromium.launch(channel="msedge", args=["--use-angle=swiftshader"])
                for w in [320, 390]:
                    run(browser, fixture, w, output)
                browser.close()
        finally:
            proc.terminate()
            proc.wait(timeout=15)
