"""Preview renders: each skin, and the moving parts deflected.

Usage: python3 preview.py shapes/super-cub.json out_dir [--ao]
Writes <out_dir>/skin-<n>.png (front three-quarter of each skin) and posed.png
(full flap, left aileron up, right aileron down, elevator up, rudder left).
Poses are applied the way the game will: each node turns about its glTF extras axis.
"""
import sys, os, json, math
sys.path.insert(0, "models")
import gen_aircraft as G
import bpy
from mathutils import Vector, Quaternion

shape_path, out = sys.argv[1], sys.argv[2]
os.makedirs(out, exist_ok=True)
shape = json.load(open(shape_path))
G.clear()
b = G.Builder(shape, os.path.dirname(os.path.abspath(shape_path)))
obj = b.build(ao="--ao" in sys.argv)
mat = obj.data.materials[0]
tex = next(n for n in mat.node_tree.nodes if n.type == "TEX_IMAGE" and n.image.name.endswith(
    G.re.sub(r"[^a-z0-9]+", "-", b.skin_list[0]["name"].lower()).strip("-")))


def pose(name, deg):
    ch = bpy.data.objects[name]
    gx, gy, gz = ch["axis"]
    axis = Vector((gx, -gz, gy))            # glTF (Y up) -> Blender (Z up)
    ch.rotation_mode = "QUATERNION"
    ch.rotation_quaternion = Quaternion(axis, math.radians(deg))


def shoot(path, az, el, lens=50, dist=1.0, target=None):
    scene = bpy.context.scene
    cam = scene.camera
    centre = target or sum((obj.matrix_world @ Vector(v) for v in obj.bound_box), Vector()) / 8
    d = Vector((math.cos(math.radians(el)) * math.cos(math.radians(az)),
                math.cos(math.radians(el)) * math.sin(math.radians(az)), math.sin(math.radians(el))))
    cam.data.type = "PERSP"
    cam.data.lens = lens
    cam.location = centre + d * 16 * dist
    cam.rotation_euler = (-d).to_track_quat("-Z", "Y").to_euler()
    scene.render.filepath = path
    bpy.ops.render.render(write_still=True)


# reuse the generator's lighting and camera set-up with one throwaway view
G.render(obj, os.path.join(out, "setup.png"), {"side": (0, 0, 50)})
for i, sk in enumerate(b.skin_list):
    name = f"{shape['id']}_" + G.re.sub(r"[^a-z0-9]+", "-", sk["name"].lower()).strip("-")
    tex.image = b.images[name]
    shoot(os.path.join(out, f"skin-{i}-front.png"), 50, 14, 50, 1.05)
    shoot(os.path.join(out, f"skin-{i}-rear.png"), -130, 22, 50, 1.1)
tex.image = b.images[f"{shape['id']}_" + G.re.sub(r"[^a-z0-9]+", "-", b.skin_list[0]["name"].lower()).strip("-")]
for n in [c.name for c in obj.children]:
    if n.startswith("flap"):
        pose(n, 50)
pose("aileron_l", -18); pose("aileron_r", 18); pose("elevator", -25); pose("rudder", 25); pose("prop", 30)
shoot(os.path.join(out, "posed-rear.png"), -145, 20, 50, 1.0)
tail = obj.matrix_world @ G.to_blender((21.5, 0, 1.5))
shoot(os.path.join(out, "posed-tail.png"), -150, 25, 50, 0.38, tail)
print("previews written")
