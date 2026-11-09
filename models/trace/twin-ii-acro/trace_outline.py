import numpy as np, json
from PIL import Image
a = np.array(Image.open("/mnt/user-data/uploads/Grob_G103A_Twin_II_Acro_rys.jpg").convert("L")).astype(int)
dark = a < 150
PX = 941 / 57.415
# ---- top view: outer half-width per row ----
CX, NOSE_Y = 492.0, 87.0
plan = []
for y in range(88, 526):
    row = dark[y]
    if row[int(CX) - 45] or row[int(CX) + 45] or row[int(CX) - 38] or row[int(CX) + 38]:
        continue                       # a wing / tailplane line crosses here
    xs = np.where(row[int(CX) - 36:int(CX) + 37])[0] + int(CX) - 36
    if len(xs) < 2:
        continue
    l, r = xs.min(), xs.max()
    plan.append(((y - NOSE_Y) / PX, (r - l) / 2 / PX, (l + r) / 2))
# ---- side view: top and bottom silhouette per column ----
NX, NZ = 701.5, 415.0
side = []
for x in range(702, 1141):
    col = np.where(dark[330:450, x])[0] + 330
    if len(col) == 0:
        continue
    side.append(((x - NX) / PX, (NZ - col.min()) / PX, (NZ - col.max()) / PX))
json.dump({"plan": plan, "side": side}, open("outline.json", "w"))
print(len(plan), "plan rows,", len(side), "side columns")
