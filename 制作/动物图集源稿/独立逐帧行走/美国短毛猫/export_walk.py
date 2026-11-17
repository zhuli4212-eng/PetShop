"""将独立绘制的四格原稿等比缩放、清透明边并按同一脚底线对齐。"""
from pathlib import Path

import cv2
import numpy as np
from PIL import Image


HERE = Path(__file__).resolve().parent
FRAME = 96
FLOOR_Y = 89


def subjects(sheet):
    rgba = np.asarray(sheet.convert("RGBA"))
    mask = (rgba[:, :, 3] >= 128).astype(np.uint8)
    count, labels, stats, _ = cv2.connectedComponentsWithStats(mask, 8)
    cats = sorted(range(1, count), key=lambda i: stats[i, cv2.CC_STAT_AREA], reverse=True)[:4]
    if len(cats) != 4 or min(stats[i, cv2.CC_STAT_AREA] for i in cats) < mask.size*.012:
        raise ValueError("未找到四个独立角色，请检查原稿的透明分隔")
    result = []
    for i in sorted(cats, key=lambda i: stats[i, cv2.CC_STAT_LEFT]):
        x,y,w,h,_ = stats[i]
        pixels = rgba[y:y+h, x:x+w].copy()
        pixels[:, :, 3] = np.where(labels[y:y+h, x:x+w] == i, 255, 0)
        result.append(Image.fromarray(pixels))
    return result


def export(age, max_width, max_height):
    cats = subjects(Image.open(HERE/(age+"-sheet.png")))
    scale = min(max_width/max(cat.width for cat in cats),
                max_height/max(cat.height for cat in cats))
    strip = Image.new("RGBA", (FRAME*4, FRAME))
    for index, cat in enumerate(cats):
        size = round(cat.width*scale), round(cat.height*scale)
        frame = cat.resize(size, Image.Resampling.BOX)
        frame.putalpha(frame.getchannel("A").point(lambda a: 255 if a >= 120 else 0))
        frame = frame.crop(frame.getchannel("A").getbbox())
        x = index*FRAME + (FRAME-frame.width)//2
        y = FLOOR_Y+1-frame.height
        strip.alpha_composite(frame, (x, y))
    strip.save(HERE/(age+"-walk.png"))


if __name__ == "__main__":
    export("adult", 90, 73)
    export("young", 75, 40)
