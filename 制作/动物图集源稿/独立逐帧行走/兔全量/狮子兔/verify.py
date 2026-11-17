"""Verify actual production dimensions, floors, changes in silhouette, and both age scales."""
from pathlib import Path
import hashlib
import json
import numpy as np
from PIL import Image

HERE = Path(__file__).resolve().parent
entries = json.loads((HERE/"references.json").read_text(encoding="utf8"))
ages = {"adult":{}, "young":{}}
all_pixels = set()
all_masks = set()
by_age = {}
for k, rows in entries.items():
    age = k.split("-")[0]
    for row in rows:
        key=row["id"]
        f=HERE/age/(key+".png")
        strip=Image.open(f).convert("RGBA")
        assert strip.size == (384,96), (f,strip.size)
        phases=np.split(np.asarray(strip),4,axis=1)
        silhouettes=[]
        for i,p in enumerate(phases):
            alpha=p[:,:,3]>=125
            ys,xs=np.where(alpha)
            assert ys.size>200,(f,i)
            assert 0<xs.min()<xs.max()<95 and ys.min()>0, (f,i)
            assert ys.max()==89-((8 if age=="adult" else 6) if i==2 else 0), (f,i,ys.max())
            pixel_hash=hashlib.sha256(p.tobytes()).hexdigest()
            assert pixel_hash not in all_pixels,(f,i,'reused image')
            all_pixels.add(pixel_hash)
            mask_hash=hashlib.sha256(alpha.tobytes()).hexdigest()
            assert mask_hash not in all_masks,(f,i,'reused registered silhouette')
            all_masks.add(mask_hash)
            silhouettes.append(alpha)
        change=[np.count_nonzero(silhouettes[i]^silhouettes[(i+1)%4]) for i in range(4)]
        assert min(change) >= 48,(f,change)
        ages[age][key]=[int(a.sum()) for a in silhouettes]
for k in ages["adult"]:
    ratio=np.mean(ages["young"][k])/np.mean(ages["adult"][k])
    assert ratio<.91,(k,ratio)
    by_age[k]=round(ratio,3)
assert len(all_pixels)==len(all_masks)==96
print(f"24 live candidates, {len(all_pixels)} distinct painted frames, {len(all_masks)} distinct registered silhouettes. Ground / airborne alpha mask verified.")
print("Juvenile/adult four-phase mean visible pixel areas:",by_age)
