"""Overlay the built model's silhouette outline (red) on the three-view, view by view.

Usage: python3 overlay.py shapes/super-cub.json out.png
Builds the model (no occlusion bake), reads every mesh back in airframe feet and draws
its outline at the drawing's own scale and origin in each view.
"""
import sys, json, os
import numpy as np
from PIL import Image, ImageDraw, ImageFilter
sys.path.insert(0, "models")
import gen_aircraft as G
import bpy

K = 22.38
VIEWS = {   # name: (crop box, function airframe (x, y, z) -> drawing (u, v))
    "side": ((360, 0, 900, 215), lambda x, y, z: (375 + x * K, 119 - z * K)),
    "plan": ((0, 270, 810, 800), lambda x, y, z: (404.5 - y * K, 797 - x * K)),
    "front": ((190, 770, 1020, 965), lambda x, y, z: (604 - y * K, 877 - z * K)),
}

shape = json.load(open(sys.argv[1]))
G.clear()
b = G.Builder(shape, os.path.dirname(os.path.abspath(sys.argv[1])))
obj = b.build(ao=False)
bpy.context.view_layer.update()
tris = []
for o in [obj] + list(obj.children):
    me = o.data
    me.calc_loop_triangles()
    M = o.matrix_world
    co = np.array([tuple(M @ v.co) for v in me.vertices])
    af = np.stack([-co[:, 1], -co[:, 0], co[:, 2]], 1) / G.FT      # Blender m -> airframe ft
    for lt in me.loop_triangles:
        tris.append(af[list(lt.vertices)])
tris = np.array(tris)

ref = Image.open("ref/three-view.jpg").convert("RGB")
out = ref.copy()
S = 4                                   # supersample the mask
for name, (box, f) in VIEWS.items():
    mask = Image.new("L", (ref.width * S, ref.height * S), 0)
    d = ImageDraw.Draw(mask)
    for t in tris:
        pts = [f(*p) for p in t]
        d.polygon([(u * S, v * S) for u, v in pts], fill=255)
    mask = mask.resize(ref.size, Image.LANCZOS).point(lambda p: 255 if p > 110 else 0)
    edge = mask.filter(ImageFilter.FIND_EDGES).crop(box)
    tint = Image.new("RGB", edge.size, (230, 20, 20))
    region = out.crop(box)
    region.paste(tint, (0, 0), edge)
    out.paste(region, box[:2])
out.save(sys.argv[2])
for name, (box, f) in VIEWS.items():
    out.crop(box).resize(((box[2] - box[0]) * 2, (box[3] - box[1]) * 2), Image.LANCZOS).save(sys.argv[2].replace(".png", f"-{name}.png"))
print("overlay written")
