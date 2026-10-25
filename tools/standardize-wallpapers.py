#!/usr/bin/env python3
"""主题壁纸清晰度标准化：偏软的锐化到群体中位档（laplacian-var 600-850）。"""
from PIL import Image, ImageFilter, ImageEnhance
import numpy as np, glob, os

def lapvar(im):
    g = im.convert('L').resize((1067, 600))
    a = np.asarray(g, dtype=float)
    lap = a[1:-1,1:-1]*4 - a[:-2,1:-1] - a[2:,1:-1] - a[1:-1,:-2] - a[1:-1,2:]
    return float(lap.var())

LO, HI = 600.0, 850.0
for f in sorted(glob.glob('assets/themes/*.jpg')):
    im = Image.open(f)
    v0 = lapvar(im)
    if v0 >= LO:
        print(os.path.basename(f), f'{v0:.0f} -> 达标，不动')
        continue
    best = None
    for radius, percent in [(1.0, 90), (1.2, 120), (1.2, 150), (1.5, 150), (1.5, 180), (2.0, 150), (2.0, 180), (1.2, 200), (1.5, 220)]:
        cand = im.filter(ImageFilter.UnsharpMask(radius=radius, percent=percent, threshold=2))
        v = lapvar(cand)
        best = (cand, v, radius, percent)
        if v >= LO:
            break
    cand, v, radius, percent = best
    if v > HI:  # 过了就往回混一点
        alpha = max(0.4, min(0.9, (HI - v0) / (v - v0)))
        cand = Image.blend(im, cand, alpha)
        v = lapvar(cand)
    cand.save(f, quality=92)
    print(os.path.basename(f), f'{v0:.0f} -> {v:.0f}  (unsharp r={radius} p={percent})')

