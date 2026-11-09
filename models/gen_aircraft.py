"""Build a low-poly, flat-shaded aircraft from a shape file and export it as .glb.

Usage: python3 gen_aircraft.py shapes/<id>.json out_dir [--render] [--no-ao]

Shape files use feet in the airframe frame: x aft from the spinner tip, y left, z up.
The model is built in that frame, then turned and scaled into Blender's frame
(nose toward +Y... see to_blender) in metres, so the glTF exporter's +Y-up
conversion gives three.js a model in metres with the nose along -Z.

Textures (UVs and skins)
  Every face gets UVs from the way it was built: fuselage halves unroll along x and
  around each ring, lifting surfaces unroll along the span and around the airfoil,
  end caps are flat projections, and small parts (wheels, struts, airbrake blades,
  prop) point at a solid colour swatch. The islands are packed into one square atlas
  ("texture": {"size": 2048}) at a single texel density.
  Airbrakes: the cap takes the "wing" colour except its underside, which with the blades takes "airbrake".
  A skin is a list of paint rules in airframe feet, so it does not depend on the UV
  layout; the generator bakes each skin into the atlas. The first skin is embedded in
  the .glb; every skin is also written as <id>_<skin>.png, with <id>_orm.png
  (R ambient occlusion, G roughness, B metalness) and <id>_uv.png (a template for
  painting skins by hand). Shapes without "skins" get one built from "livery".

  Skin keys: name, base {part: colour}, roughness {part or "default": 0..1}, layers [...]
  Each layer selects texels and paints them, later layers on top:
    parts / targets   face part names (fuselage, wing, tail, ...) / object names (rudder, ...)
    side_poly         [[x, z], ...] polygon seen from the side (paints both sides and top)
    plan_poly         [[x, |y|], ...] polygon seen from above (both wings)
    box               {"x": [a, b], "y": [a, b] (|y|), "z": [a, b]}
    stripes           {"dir": [x, |y|, z], "from", "to", "count"} even bands are painted
    text              "WG-103" with "at": [x, z] and "height": ft, read correctly on each side
    color, color2 + grad {"axis": "z", "from", "to"} for a gradient, roughness

Moving parts (optional shape keys, all backward compatible):
  surface["split"]      cuts a lifting surface at a hinge line over chosen spans.
      "hinge_x":     [[s, x], ...]  hinge at an absolute airframe x (ft), or
      "hinge_chord": [[s, c], ...]  hinge at a distance c (ft) ahead of the trailing edge.
      "spans": [{"s0", "s1", "control": {...}}   aft part becomes a moving part
                {"s0", "s1", "none": true}        no aft part (e.g. fin above the rudder)
                {"s0", "s1", "part": "wing"}]     aft part stays fixed, labelled as given
      A "control" holds: name ("{side}" becomes l/r on mirrored surfaces; the same
      name on both sides makes one part, e.g. a one-piece elevator), min_deg,
      max_deg, positive (what a positive angle does) and optional source.
  surface["airbrakes"]  [{"name", "s0", "s1", "frac", "height", "travel",
                          "gap", "cap_width"}] blade airbrakes in the upper surface.
  surface["incidence_deg"]  wing incidence, nose up, about the leading edge.
  fuselage["paint"]     [{"part", "x0", "x1", "z0", "z1"}] part labels by band (older
                        shapes; skins usually paint these instead).

Each moving part is exported as its own child node of the airframe, with its
origin on the hinge line (airbrakes: on the closed cap) and no rest rotation.
The node's glTF extras say how to drive it, in glTF axes (metres, Y up):
  {"kind": "hinge", "axis": [x, y, z], "min_deg", "max_deg", "positive"}
      three.js: node.quaternion.setFromAxisAngle(new Vector3(...axis), deg * PI / 180)
  {"kind": "slide", "axis": [x, y, z], "travel_m"}
      three.js: node.position.copy(rest).addScaledVector(new Vector3(...axis), t * travel_m)
All parts share one material, so a skin swap is one line in three.js:
  material.map = texture (flipY = false, colorSpace = SRGBColorSpace)
"""
import json, math, sys, os, re
import bpy, bmesh
import numpy as np
from mathutils import Vector, Matrix

FT = 0.3048
# airframe (x aft, y left, z up, ft; a left-handed frame) -> Blender (x right, y nose, z up, m)
TO_BLENDER = Matrix(((0, -1, 0, 0), (-1, 0, 0, 0), (0, 0, 1, 0), (0, 0, 0, 1)))


def hex_rgb(h):
    h = h.lstrip("#")
    return np.array([int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)])


def hex_rgba(h):
    lin = lambda c: c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4
    r, g, b = hex_rgb(h)
    return (lin(r), lin(g), lin(b), 1.0)


def material(name, hexcol, rough=0.7, metal=0.0):
    m = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    m.use_nodes = True
    bsdf = m.node_tree.nodes.get("Principled BSDF")
    bsdf.inputs["Base Color"].default_value = hex_rgba(hexcol)
    bsdf.inputs["Roughness"].default_value = rough
    bsdf.inputs["Metallic"].default_value = metal
    m.diffuse_color = hex_rgba(hexcol)
    return m


def to_blender(p):
    """Airframe point (ft) -> Blender point (m)."""
    return (Matrix.Scale(FT, 4) @ TO_BLENDER) @ Vector(p)


def blender_to_gltf(v):
    return [round(v.x, 6), round(v.z, 6), round(-v.y, 6)]


def interp(pts, s):
    """Piecewise-linear lookup in [[s, value], ...]."""
    if s <= pts[0][0]:
        return pts[0][1]
    for (s0, v0), (s1, v1) in zip(pts, pts[1:]):
        if s <= s1 + 1e-9:
            return v1 if s1 - s0 < 1e-9 else v0 + (v1 - v0) * (s - s0) / (s1 - s0)
    return pts[-1][1]


def foil(t, m, x, p=0.4):
    """NACA 4-digit style camber and half-thickness at chord fraction x."""
    x = min(max(x, 0.0), 1.0)
    yt = 5 * t * (0.2969 * math.sqrt(x) - 0.126 * x - 0.3516 * x ** 2 + 0.2843 * x ** 3 - 0.1036 * x ** 4)
    if m > 0:
        yc = m / p ** 2 * (2 * p * x - x * x) if x < p else m / (1 - p) ** 2 * ((1 - 2 * p) + 2 * p * x - x * x)
    else:
        yc = 0.0
    return yc, yt


def arc(points):
    """Cumulative distances along a closed loop of 3D points: len(points) + 1 values."""
    out, d = [0.0], 0.0
    for a, b in zip(points, points[1:] + points[:1]):
        d += (Vector(b) - Vector(a)).length
        out.append(d)
    return out


# ---------------------------------------------------------------- rasterising
def raster_tri(uv, size_x, size_y):
    """Pixel indices (ix, iy) whose centres fall in a 2D triangle, with barycentrics."""
    (x0, y0), (x1, y1), (x2, y2) = uv
    den = (y1 - y2) * (x0 - x2) + (x2 - x1) * (y0 - y2)
    if abs(den) < 1e-9:
        return None
    lo_x = max(int(math.floor(min(x0, x1, x2))), 0)
    hi_x = min(int(math.ceil(max(x0, x1, x2))), size_x - 1)
    lo_y = max(int(math.floor(min(y0, y1, y2))), 0)
    hi_y = min(int(math.ceil(max(y0, y1, y2))), size_y - 1)
    if hi_x < lo_x or hi_y < lo_y:
        return None
    X, Y = np.meshgrid(np.arange(lo_x, hi_x + 1) + 0.5, np.arange(lo_y, hi_y + 1) + 0.5)
    w0 = ((y1 - y2) * (X - x2) + (x2 - x1) * (Y - y2)) / den
    w1 = ((y2 - y0) * (X - x2) + (x0 - x2) * (Y - y2)) / den
    w2 = 1 - w0 - w1
    m = (w0 >= -1e-4) & (w1 >= -1e-4) & (w2 >= -1e-4)
    if not m.any():
        return None
    return (X[m] - 0.5).astype(np.int64), (Y[m] - 0.5).astype(np.int64), w0[m], w1[m], w2[m]


def in_poly(px, py, poly):
    """Vectorised even-odd point-in-polygon test."""
    inside = np.zeros(px.shape, bool)
    n = len(poly)
    for i in range(n):
        xa, ya = poly[i]
        xb, yb = poly[(i + 1) % n]
        cross = (ya > py) != (yb > py)
        with np.errstate(divide="ignore", invalid="ignore"):
            xi = xa + (py - ya) * (xb - xa) / (yb - ya)
        inside ^= cross & (px < xi)
    return inside


def dilate(img, filled, n):
    """Grow painted texels outward n pixels so mipmaps never pull in background."""
    img, filled = img.copy(), filled.copy()
    for _ in range(n):
        new = np.zeros_like(filled)
        for sl_dst, sl_src in (((slice(None), slice(1, None)), (slice(None), slice(None, -1))),
                               ((slice(None), slice(None, -1)), (slice(None), slice(1, None))),
                               ((slice(1, None), slice(None)), (slice(None, -1), slice(None))),
                               ((slice(None, -1), slice(None)), (slice(1, None), slice(None)))):
            take = ~filled[sl_dst] & filled[sl_src] & ~new[sl_dst]
            img[sl_dst][take] = img[sl_src][take]
            new[sl_dst] |= take
        filled |= new
    return img, filled


_text_cache = {}


def text_triangles(text):
    """Glyph triangles from Blender's built-in font, centred, unit glyph height."""
    if text in _text_cache:
        return _text_cache[text]
    cu = bpy.data.curves.new("wings_text", "FONT")
    cu.body, cu.align_x, cu.align_y, cu.size = text, "CENTER", "CENTER", 1.0
    ob = bpy.data.objects.new("wings_text", cu)
    bpy.context.scene.collection.objects.link(ob)
    dg = bpy.context.evaluated_depsgraph_get()
    ev = ob.evaluated_get(dg)
    me = ev.to_mesh()
    me.calc_loop_triangles()
    tris = np.array([[me.vertices[i].co[:2] for i in lt.vertices] for lt in me.loop_triangles], float)
    ev.to_mesh_clear()
    bpy.data.objects.remove(ob)
    bpy.data.curves.remove(cu)
    if len(tris):
        lo, hi = tris.reshape(-1, 2).min(0), tris.reshape(-1, 2).max(0)
        tris = (tris - (lo + hi) / 2) / (hi[1] - lo[1])
    _text_cache[text] = tris
    return tris


def text_mask(text, u, v, res=160):
    """Is (u, v), in glyph-height units around the text centre, inside a glyph?"""
    tris = text_triangles(text)
    if not len(tris):
        return np.zeros(u.shape, bool)
    lo, hi = tris.reshape(-1, 2).min(0), tris.reshape(-1, 2).max(0)
    W, H = int((hi[0] - lo[0]) * res) + 2, int((hi[1] - lo[1]) * res) + 2
    grid = np.zeros((H, W), bool)
    for tri in tris:
        r = raster_tri((tri - lo) * res, W, H)
        if r:
            grid[r[1], r[0]] = True
    gx = np.floor((u - lo[0]) * res).astype(np.int64)
    gy = np.floor((v - lo[1]) * res).astype(np.int64)
    ok = (gx >= 0) & (gx < W) & (gy >= 0) & (gy < H)
    out = np.zeros(u.shape, bool)
    out[ok] = grid[gy[ok], gx[ok]]
    return out


class Island:
    def __init__(self, iid, kind, part=None):
        self.id, self.kind, self.part = iid, kind, part
        self.umin = self.vmin = 1e9
        self.umax = self.vmax = -1e9
        self.place = None

    def grow(self, u, v):
        self.umin, self.umax = min(self.umin, u), max(self.umax, u)
        self.vmin, self.vmax = min(self.vmin, v), max(self.vmax, v)


class Target:
    """One mesh object being built: the airframe, or one moving part."""

    def __init__(self, name):
        self.name = name
        self.bm = bmesh.new()
        self.uv = self.bm.loops.layers.uv.new("UVMap")
        self.lay_island = self.bm.faces.layers.int.new("island")
        self.lay_part = self.bm.faces.layers.int.new("part")
        self.meta = {}
        self.hinge_pts = []
        self.origin = None


class Builder:
    def __init__(self, shape, base_dir="."):
        self.shape = shape
        self.base_dir = base_dir
        self.main = Target(shape["id"])
        self.targets = {}           # moving parts by name, in build order
        self.t = self.main          # where verts and faces go
        self.islands = []
        self.swatches = {}
        self.parts = []
        self.images = {}

    def vert(self, co):
        return self.t.bm.verts.new(co)

    def part_id(self, part):
        if part not in self.parts:
            self.parts.append(part)
        return self.parts.index(part)

    def island(self, kind="surface"):
        self.islands.append(Island(len(self.islands), kind))
        return self.islands[-1].id

    def face(self, verts, part, uv=None, island=None):
        try:
            f = self.t.bm.faces.new(verts)
        except ValueError:
            return None
        if uv is None:                       # small parts: a solid swatch of the part's colour
            if part not in self.swatches:
                self.swatches[part] = self.island("swatch")
                self.islands[-1].part = part
            island, uv = self.swatches[part], [(0.0, 0.0)] * len(verts)
        isl = self.islands[island]
        f[self.t.lay_island] = island
        f[self.t.lay_part] = self.part_id(part)
        for loop, (u, v) in zip(f.loops, uv):
            loop[self.t.uv].uv = (u, v)
            isl.grow(u, v)
        return f

    def cap(self, ring, part, flip, plane):
        """End cap with its own flat island; plane picks the two airframe axes to project on."""
        verts = list(reversed(ring)) if flip else list(ring)
        uv = [(v.co[plane[0]], v.co[plane[1]]) for v in verts]
        self.face(verts, part, uv, self.island())

    def target(self, name):
        if name not in self.targets:
            self.targets[name] = Target(name)
        return self.targets[name]

    # ---- fuselage: loft through superellipse stations ----
    def fuselage(self):
        """Each ring puts vertices at fixed fractions of half-height (profile_z). The two
        halves unroll into separate UV islands: u along x, v around the ring from the keel."""
        fz = self.shape["fuselage"]
        F = sorted(fz["profile_z"])
        win, stripe = fz.get("windows"), fz.get("stripe")
        paint = fz.get("paint", [])
        spinner_end = None
        if self.shape.get("prop", {}).get("spinner"):
            spinner_end = fz["stations"][2]["x"] + 0.01
        # fraction carried by each ring vertex: bottom, right side up, top, left side down
        fr = [-1.0] + F + [1.0] + list(reversed(F))
        side = [0] + [1] * len(F) + [0] + [-1] * len(F)
        N, T = len(fr), len(F) + 1
        rings, vs = [], []
        for st in fz["stations"]:
            if st["w"] <= 1e-6 and st["h"] <= 1e-6:
                rings.append([self.vert((st["x"], 0.0, st["z"]))])
                vs.append(None)
                continue
            e = 2.0 / st["n"]
            ring = []
            for f, sd in zip(fr, side):
                # superellipse: z = h/2 sgn(s)|s|^e, y = w/2 |c|^e with s = sin(theta)
                sa = math.copysign(abs(f) ** (1.0 / e), f) if abs(f) < 1 else math.copysign(1.0, f)
                ca = math.sqrt(max(0.0, 1 - sa * sa))
                y = -sd * st["w"] / 2 * ca ** e
                z = st["z"] + st["h"] / 2 * f
                ring.append(self.vert((st["x"], y, z)))
            rings.append(ring)
            # arc length from the keel, up the right side (0..T) and up the left side (0, N-1 .. T)
            d = lambda a, b: (ring[a].co - ring[b].co).length
            right, left = [0.0] * N, [0.0] * N
            for i in range(1, T + 1):
                right[i] = right[i - 1] + d(i, i - 1)
            path = [0] + list(range(N - 1, T - 1, -1))
            acc = 0.0
            for a, b in zip(path, path[1:]):
                acc += d(a, b)
                left[b] = acc
            vs.append((right, left))
        xs = [st["x"] for st in fz["stations"]]
        isl_r, isl_l = self.island(), self.island()

        def inband(lo, hi, band):
            return band and band["z0"] - 1e-6 <= lo and hi <= band["z1"] + 1e-6

        def uvs(i, k, k1):
            """UVs of ring i at ring vertices k, k1 for the half that face k belongs to."""
            right_half = k < T
            if vs[i] is None:                  # nose or tail point: midway between neighbours
                j = i + 1 if i + 1 < len(vs) and vs[i + 1] is not None else i - 1
                a, b = uvs(j, k, k1)
                m = (a[1] + b[1]) / 2
                return (xs[i], m), (xs[i], m)
            r, l = vs[i]
            if right_half:
                return (xs[i], r[k]), (xs[i], r[k1])
            return (xs[i], l[k]), (xs[i], l[k1] if k1 != 0 else 0.0)

        for i in range(len(rings) - 1):
            r0, r1 = rings[i], rings[i + 1]
            xm = (xs[i] + xs[i + 1]) / 2
            for k in range(N):
                k1 = (k + 1) % N
                lo, hi = min(fr[k], fr[k1]), max(fr[k], fr[k1])
                part = "fuselage"
                band = next((b for b in paint if b["x0"] <= xm <= b["x1"] and inband(lo, hi, b)), None)
                if band:
                    part = band["part"]
                elif spinner_end is not None and xm < spinner_end:
                    part = "spinner"
                elif win and win["x0"] <= xm <= win["x1"] and inband(lo, hi, win):
                    part = "windows"
                elif stripe and stripe["x0"] <= xm <= stripe["x1"] and inband(lo, hi, stripe):
                    part = "stripe"
                isl = isl_r if k < T else isl_l
                (a0, a1), (b0, b1) = uvs(i, k, k1), uvs(i + 1, k, k1)
                if len(r0) == 1:
                    self.face([r0[0], r1[k1], r1[k]], part, [a0, b1, b0], isl)
                elif len(r1) == 1:
                    self.face([r0[k], r0[k1], r1[0]], part, [a0, a1, b0], isl)
                else:
                    self.face([r0[k], r0[k1], r1[k1], r1[k]], part, [a0, a1, b1, b0], isl)
        if len(rings[-1]) > 1:
            self.cap(rings[-1], "fuselage", True, (1, 2))

    # ---- lifting surfaces ----
    @staticmethod
    def airfoil(t, m, n=10):
        """NACA 4-digit style loop: upper TE->LE, lower LE->TE (no duplicate LE/TE)."""
        pts_u, pts_l = [], []
        for i in range(n + 1):
            x = (1 - math.cos(math.pi * i / n)) / 2
            yc, yt = foil(t, m, x)
            pts_u.append((x, yc + yt))
            pts_l.append((x, yc - yt))
        return list(reversed(pts_u)) + pts_l[1:-1]

    @staticmethod
    def airfoil_front(t, m, h, n=10):
        """Leading-edge part, LE to the hinge at chord fraction h, closed by a flat hinge face."""
        pts_u, pts_l = [], []
        for i in range(n + 1):
            x = h * (1 - math.cos(math.pi * i / n)) / 2
            yc, yt = foil(t, m, x)
            pts_u.append((x, yc + yt))
            pts_l.append((x, yc - yt))
        return list(reversed(pts_u)) + pts_l[1:]

    @staticmethod
    def airfoil_aft(t, m, h, n=3):
        """Moving part, hinge face to trailing edge."""
        pts_u, pts_l = [], []
        for j in range(n + 1):
            x = h + (1 - h) * j / n
            yc, yt = foil(t, m, x)
            pts_u.append((x, yc + yt))
            pts_l.append((x, yc - yt))
        return list(reversed(pts_u)) + pts_l[:-1]

    def surface(self, sf):
        t_af, m_af = sf["airfoil"]["thickness"], sf["airfoil"]["camber"]
        r = sf["root"]
        dih = math.radians(sf.get("dihedral_deg", 0.0))
        inc = math.radians(sf.get("incidence_deg", 0.0))
        vertical = sf.get("vertical")
        secs = sf["sections"]
        split = sf.get("split") or {}
        spans = split.get("spans", [])
        sides = [1, -1] if sf.get("mirror") else [1]
        plane = (0, 1) if vertical else (0, 2)

        def section_at(s):
            for a, b in zip(secs, secs[1:]):
                if s <= b["s"] + 1e-9:
                    f = 0.0 if b["s"] - a["s"] < 1e-9 else (s - a["s"]) / (b["s"] - a["s"])
                    return a["x_le"] + f * (b["x_le"] - a["x_le"]), a["chord"] + f * (b["chord"] - a["chord"])
            return secs[-1]["x_le"], secs[-1]["chord"]

        def seg_index(sm):
            for i in range(len(secs) - 1):
                if secs[i]["s"] <= sm <= secs[i + 1]["s"]:
                    return i
            return len(secs) - 2

        def point(s, ax, az, side):
            x_le, c = section_at(s)
            X, Z = ax * c, az * c
            if inc:
                X, Z = X * math.cos(inc) + Z * math.sin(inc), -X * math.sin(inc) + Z * math.cos(inc)
            if vertical:
                return (r["x"] + x_le + X, Z, r["z"] + s)
            return (r["x"] + x_le + X, r["y"] + side * s * math.cos(dih), r["z"] + s * math.sin(dih) + Z)

        def hinge_frac(s):
            x_le, c = section_at(s)
            if "hinge_x" in split:
                return (interp(split["hinge_x"], s) - r["x"] - x_le) / c
            return 1.0 - interp(split["hinge_chord"], s) / c

        def span_at(sm):
            return next((sp for sp in spans if sp["s0"] - 1e-9 <= sm <= sp["s1"] + 1e-9), None)

        # breakpoints: every section plus every split boundary; group runs by span
        bps = sorted({round(v, 6) for v in [sec["s"] for sec in secs] + [v for sp in spans for v in (sp["s0"], sp["s1"])]})
        groups = []
        for a, b in zip(bps, bps[1:]):
            sp = span_at((a + b) / 2)
            if groups and groups[-1][0] is sp:
                groups[-1][1].append(b)
            else:
                groups.append((sp, [a, b]))

        def tube(ss, loop_at, paint_at, side):
            """One UV island: u along the span, v around the section (TE upper, LE, TE lower)."""
            pts = [[point(s, ax, az, side) for ax, az in loop_at(s)] for s in ss]
            rings = [[self.vert(p) for p in ring] for ring in pts]
            arcs = [arc(ring) for ring in pts]
            M = len(rings[0])
            isl = self.island()
            for i in range(len(rings) - 1):
                a, b = rings[i], rings[i + 1]
                part = paint_at((ss[i] + ss[i + 1]) / 2)
                for k in range(M):
                    k1 = (k + 1) % M
                    q = [a[k], a[k1], b[k1], b[k]]
                    uv = [(ss[i], arcs[i][k]), (ss[i], arcs[i][k + 1]), (ss[i + 1], arcs[i + 1][k + 1]), (ss[i + 1], arcs[i + 1][k])]
                    if side == 1:
                        self.face(q, part, uv, isl)
                    else:
                        self.face(list(reversed(q)), part, list(reversed(uv)), isl)
            self.cap(rings[0], paint_at((ss[0] + ss[1]) / 2), side != 1, plane)
            self.cap(rings[-1], paint_at((ss[-2] + ss[-1]) / 2), side == 1, plane)

        front_paint = lambda sm: secs[seg_index(sm)].get("part", sf["part"])
        aft_paint = lambda sm: secs[seg_index(sm)].get("aft_part", secs[seg_index(sm)].get("part", sf["part"]))
        full = self.airfoil(t_af, m_af)

        for side in sides:
            for sp, ss in groups:
                self.t = self.main
                if sp is None:
                    tube(ss, lambda s: full, front_paint, side)
                    continue
                tube(ss, lambda s: self.airfoil_front(t_af, m_af, hinge_frac(s)), front_paint, side)
                if sp.get("none"):
                    continue
                ctl = sp.get("control")
                if ctl:
                    name = ctl["name"].replace("{side}", "l" if side == 1 else "r")
                    self.t = self.target(name)
                    self.t.meta = {"kind": "hinge", "min_deg": ctl["min_deg"], "max_deg": ctl["max_deg"],
                                   "positive": ctl.get("positive", ""), "vertical": bool(vertical)}
                    if ctl.get("source"):
                        self.t.meta["source"] = ctl["source"]
                    for s in (ss[0], ss[-1]):
                        h = hinge_frac(s)
                        self.t.hinge_pts.append(point(s, h, foil(t_af, m_af, h)[0], side))
                    tube(ss, lambda s: self.airfoil_aft(t_af, m_af, hinge_frac(s)), aft_paint, side)
                else:
                    paint = sp.get("part")
                    tube(ss, lambda s: self.airfoil_aft(t_af, m_af, hinge_frac(s)),
                         (lambda sm: paint) if paint else aft_paint, side)
            for ab in sf.get("airbrakes", []):
                self.airbrake(ab, side, point, t_af, m_af)
        self.t = self.main

    # ---- blade airbrakes: a cap flush with the upper surface and blades below it ----
    def box(self, a0, a1, wdir, w0, w1, ndir, h0, h1, part, skin_part=None):
        vs = {}
        for ia, a in enumerate((a0, a1)):
            for iw, w in enumerate((w0, w1)):
                for ih, hh in enumerate((h0, h1)):
                    vs[ia, iw, ih] = self.vert(a + wdir * w + ndir * hh)
        quads = [[(0, 0, 0), (0, 1, 0), (0, 1, 1), (0, 0, 1)], [(1, 0, 0), (1, 0, 1), (1, 1, 1), (1, 1, 0)],
                 [(0, 0, 0), (0, 0, 1), (1, 0, 1), (1, 0, 0)], [(0, 1, 0), (1, 1, 0), (1, 1, 1), (0, 1, 1)],
                 [(0, 0, 0), (1, 0, 0), (1, 1, 0), (0, 1, 0)], [(0, 0, 1), (0, 1, 1), (1, 1, 1), (1, 0, 1)]]
        for i, q in enumerate(quads):     # quad 4 is the h0 face; skin_part paints the other five
            self.face([vs[k] for k in q], skin_part if (i != 4 and skin_part) else part)

    def airbrake(self, ab, side, point, t_af, m_af):
        name = ab.get("name", "airbrake_{side}").replace("{side}", "l" if side == 1 else "r")
        self.t = self.target(name)
        f = ab["frac"]
        sm = (ab["s0"] + ab["s1"]) / 2
        # local frame on the wing at mid-span: chordwise, spanwise and surface normal
        cdir = (Vector(point(sm, 1.0, 0.0, side)) - Vector(point(sm, 0.0, 0.0, side))).normalized()
        sdir = (Vector(point(sm + 1.0, f, 0.0, side)) - Vector(point(sm, f, 0.0, side))).normalized()
        n = cdir.cross(sdir).normalized()
        if n.z < 0:
            n = -n
        top = lambda s: Vector(point(s, f, sum(foil(t_af, m_af, f)), side))
        a0, a1 = top(ab["s0"]), top(ab["s1"])
        lift, cap_t = 0.006, 0.02     # cap sits a hair proud of the skin so it never z-fights
        cw, gap, bt = ab.get("cap_width", 0.24), ab.get("gap", 0.16), 0.02
        # the cap is wing-coloured except its underside, so stowed brakes vanish into the wing;
        # extended, the cap underside and the blades show the blade colour
        self.box(a0, a1, cdir, -cw / 2, cw / 2, n, lift - cap_t, lift, ab.get("blade_part", "airbrake"),
                 skin_part=ab.get("cap_part", "wing"))
        for g in (-gap / 2, gap / 2):
            self.box(a0, a1, cdir, g - bt / 2, g + bt / 2, n, lift - cap_t - ab["height"], lift - cap_t,
                     ab.get("blade_part", "airbrake"))
        self.t.meta = {"kind": "slide", "travel_m": round(ab["travel"] * FT, 4)}
        if ab.get("source"):
            self.t.meta["source"] = ab["source"]
        self.t.slide_dir = n
        self.t.origin = to_blender((a0 + a1) / 2 + n * lift)
        self.t = self.main

    # ---- struts, wheels, prop ----
    def tube(self, a, b, r, part, sides=6):
        a, b = Vector(a), Vector(b)
        d = (b - a)
        if d.length < 1e-6:
            return
        dn = d.normalized()
        ref = Vector((0, 0, 1)) if abs(dn.z) < 0.9 else Vector((1, 0, 0))
        u = dn.cross(ref).normalized()
        v = dn.cross(u).normalized()
        ra, rb = [], []
        for k in range(sides):
            t = 2 * math.pi * k / sides
            off = (u * math.cos(t) + v * math.sin(t)) * r
            ra.append(self.vert(a + off))
            rb.append(self.vert(b + off))
        for k in range(sides):
            k1 = (k + 1) % sides
            self.face([ra[k], rb[k], rb[k1], ra[k1]], part)
        self.face(list(reversed(ra)), part)
        self.face(rb, part)

    def struts(self):
        for st in self.shape.get("struts", []):
            self.tube(st["a"], st["b"], st["r"], st["part"])
            if st.get("mirror"):
                a = [st["a"][0], -st["a"][1], st["a"][2]]
                b = [st["b"][0], -st["b"][1], st["b"][2]]
                self.tube(a, b, st["r"], st["part"])

    def wheel(self, x, y, z, r, w, sides=14):
        hub = r * 0.45
        rings = []
        for (yy, rr) in [(y - w / 2, hub), (y - w / 2 * 0.8, r * 0.92), (y - w / 4, r), (y + w / 4, r), (y + w / 2 * 0.8, r * 0.92), (y + w / 2, hub)]:
            ring = []
            for k in range(sides):
                t = 2 * math.pi * k / sides
                ring.append(self.vert((x + rr * math.cos(t), yy, z + rr * math.sin(t))))
            rings.append(ring)
        for i in range(len(rings) - 1):
            for k in range(sides):
                k1 = (k + 1) % sides
                self.face([rings[i][k], rings[i][k1], rings[i + 1][k1], rings[i + 1][k]], "tire")
        self.face(rings[0], "gear")
        self.face(list(reversed(rings[-1])), "gear")

    def wheels(self):
        for wh in self.shape.get("wheels", []):
            self.wheel(wh["x"], wh["y"], wh["z"], wh["r"], wh["w"])
            if wh.get("mirror"):
                self.wheel(wh["x"], -wh["y"], wh["z"], wh["r"], wh["w"])

    def prop(self):
        p = self.shape.get("prop")
        if not p:
            return
        R, ch = p["diameter"] / 2, p["chord"]
        hub = 0.35
        for i in range(p["blades"]):
            ang = 2 * math.pi * i / p["blades"] + math.pi / 2
            radial = Vector((0, math.cos(ang), math.sin(ang)))
            tang = Vector((0, -math.sin(ang), math.cos(ang)))
            rows = []
            for f in (hub / R, 0.35, 0.75, 1.0):
                rr = f * R
                twist = math.radians(38 - 24 * f)
                c = ch * (0.75 if f < 0.2 else 1.0 if f < 0.8 else 0.55)
                th = 0.06
                along = Vector((-math.sin(twist), 0, 0)) + tang * math.cos(twist)
                normal = Vector((math.cos(twist), 0, 0)) + tang * math.sin(twist)
                centre = Vector((p["x"], 0, p["z"])) + radial * rr
                row = [centre + along * (c / 2) + normal * (th / 2), centre - along * (c / 2) + normal * (th / 2),
                       centre - along * (c / 2) - normal * (th / 2), centre + along * (c / 2) - normal * (th / 2)]
                rows.append([self.vert(v) for v in row])
            for j in range(len(rows) - 1):
                for k in range(4):
                    k1 = (k + 1) % 4
                    self.face([rows[j][k], rows[j][k1], rows[j + 1][k1], rows[j + 1][k]], "prop")
            self.face(rows[-1], "prop")
            self.face(list(reversed(rows[0])), "prop")

    # ---- UV atlas ----
    def pack(self, S, pad=6, swatch=8):
        """Shelf-pack every island at one texel density (px per ft), as large as fits."""
        regular = [i for i in self.islands if i.kind != "swatch" and i.umax >= i.umin]
        sw = [i for i in self.islands if i.kind == "swatch"]

        def layout(k):
            items = []
            for isl in regular:
                w, h = (isl.umax - isl.umin) * k, (isl.vmax - isl.vmin) * k
                rot = h > w
                if rot:
                    w, h = h, w
                items.append((isl, rot, int(math.ceil(w)) + 1 + 2 * pad, int(math.ceil(h)) + 1 + 2 * pad))
            items += [(isl, False, swatch + 2 * pad, swatch + 2 * pad) for isl in sw]
            items.sort(key=lambda it: -it[3])
            x = y = shelf = 0
            place = {}
            for isl, rot, w, h in items:
                if w > S:
                    return None
                if x + w > S:
                    x, y, shelf = 0, y + shelf, 0
                if y + h > S:
                    return None
                place[isl.id] = (x + pad, y + pad, rot)
                x, shelf = x + w, max(shelf, h)
            return place

        lo, hi = 0.5, 4000.0
        for _ in range(48):
            mid = (lo + hi) / 2
            lo, hi = (mid, hi) if layout(mid) else (lo, mid)
        self.k, self.S = lo, S
        for iid, pl in layout(lo).items():
            self.islands[iid].place = pl

        def to_px(isl, u, v):
            x0, y0, rot = isl.place
            if isl.kind == "swatch":
                return x0 + swatch / 2, y0 + swatch / 2
            a, b = (u - isl.umin) * lo, (v - isl.vmin) * lo
            return (x0 + b, y0 + a) if rot else (x0 + a, y0 + b)

        for tg in [self.main] + list(self.targets.values()):
            for f in tg.bm.faces:
                isl = self.islands[f[tg.lay_island]]
                for loop in f.loops:
                    u, v = loop[tg.uv].uv
                    px, py = to_px(isl, u, v)
                    loop[tg.uv].uv = (px / S, py / S)

    def triangles(self):
        """Every face as triangles: atlas pixel UVs, airframe positions, part and object."""
        uvs, pos, part, tgt = [], [], [], []
        names = [self.main.name] + list(self.targets)
        for ti, tg in enumerate([self.main] + list(self.targets.values())):
            for f in tg.bm.faces:
                if self.islands[f[tg.lay_island]].kind == "swatch":
                    continue
                L = list(f.loops)
                for j in range(1, len(L) - 1):
                    tri = (L[0], L[j], L[j + 1])
                    uvs.append([tuple(l[tg.uv].uv * self.S) for l in tri])
                    pos.append([tuple(l.vert.co) for l in tri])
                    part.append(f[tg.lay_part])
                    tgt.append(ti)
        return np.array(uvs), np.array(pos), np.array(part), np.array(tgt), names

    # ---- skins ----
    def skins(self):
        out = []
        for sk in self.shape.get("skins", []):
            if isinstance(sk, str):
                sk = json.load(open(os.path.join(self.base_dir, sk)))
            out.append(sk)
        if not out:                      # older shapes: one plain skin from the livery colours
            liv = self.shape.get("livery", {"fuselage": "#DDDDDD"})
            out.append({"name": liv.get("name", "livery"), "base": {k: v for k, v in liv.items() if k != "name"},
                        "roughness": {"default": 0.6, "windows": 0.25, "tire": 0.9}, "layers": []})
        return out

    def bake_skin(self, skin, tris):
        uvs, pos, part, tgt, names = tris
        S = self.S
        idx, P, PA, TG = [], [], [], []
        for t in range(len(uvs)):
            r = raster_tri(uvs[t], S, S)
            if not r:
                continue
            ix, iy, w0, w1, w2 = r
            idx.append(iy * S + ix)
            P.append(np.outer(w0, pos[t][0]) + np.outer(w1, pos[t][1]) + np.outer(w2, pos[t][2]))
            PA.append(np.full(len(ix), part[t]))
            TG.append(np.full(len(ix), tgt[t]))
        idx, P, PA, TG = np.concatenate(idx), np.concatenate(P), np.concatenate(PA), np.concatenate(TG)
        X, Y, Z = P[:, 0], P[:, 1], P[:, 2]
        aY = np.abs(Y)
        base = skin.get("base", {})
        fallback = base.get("fuselage", "#DDDDDD")
        rough_map = skin.get("roughness", {})
        r_def = rough_map.get("default", 0.5)
        col = np.zeros((len(idx), 3))
        rough = np.full(len(idx), r_def)
        for pi, pname in enumerate(self.parts):
            m = PA == pi
            col[m] = hex_rgb(base.get(pname, fallback))
            rough[m] = rough_map.get(pname, r_def)
        for L in skin.get("layers", []):
            m = np.ones(len(idx), bool)
            if "parts" in L:
                m &= np.isin(PA, [self.parts.index(p) for p in L["parts"] if p in self.parts])
            if "targets" in L:
                m &= np.isin(TG, [names.index(n) for n in L["targets"] if n in names])
            if "side_poly" in L:
                m &= in_poly(X, Z, L["side_poly"])
            if "plan_poly" in L:
                m &= in_poly(X, aY, L["plan_poly"])
            for ax, arr in (("x", X), ("y", aY), ("z", Z)):
                if ax in L.get("box", {}):
                    a, b = L["box"][ax]
                    m &= (arr >= a) & (arr <= b)
            if "stripes" in L:
                st = L["stripes"]
                d = np.array(st["dir"], float)
                d /= np.linalg.norm(d)
                tt = X * d[0] + aY * d[1] + Z * d[2]
                w = (st["to"] - st["from"]) / st["count"]
                band = np.floor((tt - st["from"]) / w).astype(np.int64)
                m &= (tt >= st["from"]) & (tt < st["to"]) & (band % 2 == 0)
            if "text" in L:
                cx, cz = L["at"]
                h = L["height"]
                u = np.where(Y < 0, cx - X, X - cx) / h      # reads nose-first... from either side
                if L.get("sides") == "left":
                    m &= Y >= 0
                elif L.get("sides") == "right":
                    m &= Y < 0
                sub = np.where(m)[0]
                m[sub] = text_mask(L["text"], u[sub], (Z[sub] - cz) / h)
            if not m.any():
                continue
            c1 = hex_rgb(L["color"])
            if "color2" in L and "grad" in L:
                g = L["grad"]
                arr = {"x": X, "y": aY, "z": Z}[g.get("axis", "z")][m]
                f = np.clip((arr - g["from"]) / (g["to"] - g["from"]), 0, 1)[:, None]
                col[m] = c1 * (1 - f) + hex_rgb(L["color2"]) * f
            else:
                col[m] = c1
            if "roughness" in L:
                rough[m] = L["roughness"]
        img = np.zeros((S * S, 4))
        filled = np.zeros(S * S, bool)
        img[idx, :3], img[idx, 3], filled[idx] = col, rough, True
        # solid swatches for small parts
        for isl in self.islands:
            if isl.kind == "swatch":
                x0, y0, _ = isl.place
                c = hex_rgb(base.get(isl.part, fallback))
                rr = rough_map.get(isl.part, r_def)
                for yy in range(y0, y0 + 8):
                    sl = slice(yy * S + x0, yy * S + x0 + 8)
                    img[sl, :3], img[sl, 3], filled[sl] = c, rr, True
        img, filled = dilate(img.reshape(S, S, 4), filled.reshape(S, S), 6)
        return img, filled

    def make_image(self, name, rgb, non_color=False):
        S = self.S
        im = bpy.data.images.get(name)
        if im:
            bpy.data.images.remove(im)
        im = bpy.data.images.new(name, S, S, alpha=False)
        if non_color:
            im.colorspace_settings.name = "Non-Color"
        px = np.ones((S, S, 4), np.float32)
        px[..., :3] = rgb
        im.pixels.foreach_set(px.ravel())
        im.pack()
        self.images[name] = im
        return im

    def uv_template(self, tris, skin_rgb):
        """Dimmed default skin with every face edge drawn: a guide for hand-painted skins."""
        S = self.S
        img = skin_rgb * 0.45 + 0.08
        for tri in tris[0]:
            for a, b in ((0, 1), (1, 2), (2, 0)):
                (xa, ya), (xb, yb) = tri[a], tri[b]
                n = int(max(abs(xb - xa), abs(yb - ya)) * 1.5) + 2
                t = np.linspace(0, 1, n)
                xs = np.clip((xa + (xb - xa) * t).astype(int), 0, S - 1)
                ys = np.clip((ya + (yb - ya) * t).astype(int), 0, S - 1)
                img[ys, xs] = (0.92, 0.92, 0.88)
        return img

    def body_material(self, base_img, orm_img):
        name = f"{self.shape['id']}:skin"
        m = bpy.data.materials.get(name)
        if m:
            bpy.data.materials.remove(m)
        m = bpy.data.materials.new(name)
        m.use_nodes = True
        m.use_backface_culling = True       # closed shells: single-sided is enough
        nt = m.node_tree
        bsdf = nt.nodes.get("Principled BSDF")
        tex = nt.nodes.new("ShaderNodeTexImage")
        tex.image = base_img
        orm = nt.nodes.new("ShaderNodeTexImage")
        orm.image = orm_img
        sep = nt.nodes.new("ShaderNodeSeparateColor")
        nt.links.new(tex.outputs["Color"], bsdf.inputs["Base Color"])
        nt.links.new(orm.outputs["Color"], sep.inputs["Color"])
        nt.links.new(sep.outputs["Green"], bsdf.inputs["Roughness"])
        nt.links.new(sep.outputs["Blue"], bsdf.inputs["Metallic"])
        grp = bpy.data.node_groups.get("glTF Material Output")
        if grp is None:
            grp = bpy.data.node_groups.new("glTF Material Output", "ShaderNodeTree")
            grp.interface.new_socket(name="Occlusion", in_out="INPUT", socket_type="NodeSocketFloat")
        gn = nt.nodes.new("ShaderNodeGroup")
        gn.node_tree = grp
        nt.links.new(sep.outputs["Red"], gn.inputs["Occlusion"])
        return m

    def bake_ao(self, objs, samples=48, distance=0.9):
        """Cycles ambient occlusion into the ORM red channel (neutral pose)."""
        scene = bpy.context.scene
        engine = scene.render.engine
        scene.render.engine = "CYCLES"
        scene.cycles.device = "CPU"
        scene.cycles.samples = samples
        if scene.world is None:
            scene.world = bpy.data.worlds.new("wings_ao_world")
        scene.world.light_settings.distance = distance
        ao = bpy.data.images.new("wings_ao", self.S, self.S, alpha=False)
        ao.colorspace_settings.name = "Non-Color"
        ao.generated_color = (1, 1, 1, 1)
        mat = objs[0].data.materials[0]
        node = mat.node_tree.nodes.new("ShaderNodeTexImage")
        node.image = ao
        mat.node_tree.nodes.active = node
        for o in bpy.context.view_layer.objects:
            o.select_set(False)
        for o in objs:
            o.select_set(True)
        bpy.context.view_layer.objects.active = objs[0]
        scene.render.bake.margin = 6
        scene.render.bake.use_clear = False
        bpy.ops.object.bake(type="AO")
        px = np.empty(self.S * self.S * 4, np.float32)
        ao.pixels.foreach_get(px)
        mat.node_tree.nodes.remove(node)
        bpy.data.images.remove(ao)
        scene.render.engine = engine
        return px.reshape(self.S, self.S, 4)[..., 0]

    # ---- assemble Blender objects ----
    def to_object(self, tg, scene, mat, offset=None):
        bmesh.ops.transform(tg.bm, matrix=Matrix.Scale(FT, 4) @ TO_BLENDER, verts=tg.bm.verts)
        if offset is not None:
            bmesh.ops.translate(tg.bm, vec=-offset, verts=tg.bm.verts)
        bmesh.ops.recalc_face_normals(tg.bm, faces=tg.bm.faces)
        for f in tg.bm.faces:
            f.material_index = 0
        mesh = bpy.data.meshes.new(tg.name)
        tg.bm.to_mesh(mesh)
        tg.bm.free()
        for a in ("island", "part"):
            if a in mesh.attributes:
                mesh.attributes.remove(mesh.attributes[a])
        mesh.materials.append(mat)
        for poly in mesh.polygons:
            poly.use_smooth = False
        obj = bpy.data.objects.new(tg.name, mesh)
        scene.collection.objects.link(obj)
        return obj

    def build(self, scene=None, ao=True):
        scene = scene or bpy.context.scene
        self.fuselage()
        for sf in self.shape.get("surfaces", []):
            self.surface(sf)
        self.t = self.main
        self.struts()
        self.wheels()
        self.prop()
        self.pack(self.shape.get("texture", {}).get("size", 2048))
        tris = self.triangles()
        self.skin_list = self.skins()
        baked = [self.bake_skin(sk, tris) for sk in self.skin_list]
        sid = self.shape["id"]
        slug = lambda s: re.sub(r"[^a-z0-9]+", "-", s.lower()).strip("-")
        for sk, (img, _) in zip(self.skin_list, baked):
            self.make_image(f"{sid}_{slug(sk['name'])}", img[..., :3])
        default = self.images[f"{sid}_{slug(self.skin_list[0]['name'])}"]
        orm = np.zeros((self.S, self.S, 3))
        orm[..., 0], orm[..., 1] = 1.0, baked[0][0][..., 3]
        orm_img = self.make_image(f"{sid}_orm", orm, non_color=True)
        self.make_image(f"{sid}_uv", self.uv_template(tris, baked[0][0][..., :3]))
        mat = self.body_material(default, orm_img)
        obj = self.to_object(self.main, scene, mat)
        for name, tg in self.targets.items():
            if tg.meta.get("kind") == "hinge":
                pts = [to_blender(p) for p in tg.hinge_pts]
                a, b = max(((p, q) for p in pts for q in pts), key=lambda pq: (pq[0] - pq[1]).length)
                axis = (b - a).normalized()
                # positive angle: trailing edge down on horizontal surfaces, trailing edge left on vertical ones
                if (not tg.meta["vertical"] and axis.x < 0) or (tg.meta["vertical"] and axis.z > 0):
                    axis = -axis
                origin = (a + b) / 2
            else:
                axis = (Matrix.Scale(FT, 4) @ TO_BLENDER).to_3x3() @ tg.slide_dir
                axis.normalize()
                origin = tg.origin
            child = self.to_object(tg, scene, mat, offset=origin)
            child.parent = obj
            child.location = origin
            meta = {k: v for k, v in tg.meta.items() if k != "vertical"}
            meta["axis"] = blender_to_gltf(axis)
            for k, v in meta.items():
                child[k] = v
        if ao:
            bpy.context.view_layer.update()
            occ = self.bake_ao([obj] + list(obj.children))
            orm[..., 0] = np.clip(occ, 0, 1) ** 0.75
            for isl in self.islands:          # swatch faces share a few texels: leave them unoccluded
                if isl.kind == "swatch":
                    x0, y0, _ = isl.place
                    orm[max(y0 - 6, 0):y0 + 14, max(x0 - 6, 0):x0 + 14, 0] = 1.0
            px = np.ones((self.S, self.S, 4), np.float32)
            px[..., :3] = orm
            orm_img.pixels.foreach_set(px.ravel())
            orm_img.pack()
        return obj


def clear():
    bpy.ops.wm.read_factory_settings(use_empty=True)


def render(obj, path, views):
    import PIL.Image as Image
    scene = bpy.context.scene
    scene.render.engine = "CYCLES"
    scene.cycles.device = "CPU"
    scene.cycles.samples = 24
    try:
        scene.cycles.use_denoising = True
    except Exception:
        pass
    scene.render.resolution_x, scene.render.resolution_y = 900, 600
    scene.render.film_transparent = False
    world = bpy.data.worlds.new("w"); scene.world = world
    world.use_nodes = True
    world.node_tree.nodes["Background"].inputs["Color"].default_value = hex_rgba("#DCE4EC")
    world.node_tree.nodes["Background"].inputs["Strength"].default_value = 0.9
    sun = bpy.data.objects.new("sun", bpy.data.lights.new("sun", "SUN"))
    sun.data.energy = 3.2
    sun.data.angle = math.radians(8)
    sun.rotation_euler = (math.radians(40), math.radians(-25), math.radians(35))
    scene.collection.objects.link(sun)
    # ground
    bpy.ops.mesh.primitive_plane_add(size=200)
    ground = bpy.context.active_object
    ground.data.materials.append(material("ground", "#C9D2DA", 0.95))
    zmin = min((obj.matrix_world @ Vector(v)).z for v in obj.bound_box)
    ground.location.z = zmin
    cam = bpy.data.objects.new("cam", bpy.data.cameras.new("cam"))
    scene.collection.objects.link(cam)
    scene.camera = cam
    centre = sum((obj.matrix_world @ Vector(v) for v in obj.bound_box), Vector()) / 8
    size = max(obj.dimensions)
    tiles = []
    corners = [obj.matrix_world @ Vector(v) for v in obj.bound_box]
    aspect = scene.render.resolution_y / scene.render.resolution_x
    for name, (az, el, lens) in views.items():
        d = Vector((math.cos(math.radians(el)) * math.cos(math.radians(az)),
                    math.cos(math.radians(el)) * math.sin(math.radians(az)),
                    math.sin(math.radians(el))))
        fwd = -d
        right = fwd.cross(Vector((0, 0, 1)))
        right = right.normalized() if right.length > 1e-3 else Vector((1, 0, 0))
        up = right.cross(fwd).normalized()
        tan_h = 18.0 / lens
        tan_v = tan_h * aspect
        dist = 0.0
        for c in corners:
            rel = c - centre
            depth = rel.dot(d)
            dist = max(dist, abs(rel.dot(right)) / tan_h + depth, abs(rel.dot(up)) / tan_v + depth)
        cam.rotation_euler = fwd.to_track_quat("-Z", "Y").to_euler()
        if name in ("side", "top"):
            # orthographic, like a three-view drawing
            half_w = max(abs((c - centre).dot(right)) for c in corners)
            half_h = max(abs((c - centre).dot(up)) for c in corners)
            cam.data.type = "ORTHO"
            cam.data.ortho_scale = 2.2 * max(half_w, half_h / aspect)
            cam.location = centre + d * size * 2
        else:
            cam.data.type = "PERSP"
            cam.data.lens = lens
            cam.location = centre + d * dist * 1.12
        out = path.replace(".png", f"-{name}.png")
        scene.render.filepath = out
        bpy.ops.render.render(write_still=True)
        tiles.append(out)
    imgs = [Image.open(t) for t in tiles]
    w, h = imgs[0].size
    sheet = Image.new("RGB", (w * 2, h * ((len(imgs) + 1) // 2)), (220, 228, 236))
    for i, im in enumerate(imgs):
        sheet.paste(im, ((i % 2) * w, (i // 2) * h))
    sheet.save(path)
    return path


def export_glb(obj, glb):
    bpy.ops.object.select_all(action="DESELECT")
    for o in [obj] + list(obj.children_recursive):
        o.select_set(True)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.export_scene.gltf(filepath=glb, export_format="GLB", use_selection=True, export_yup=True,
                              export_apply=True, export_extras=True)


def save_images(builder, out_dir):
    paths = []
    for name, im in builder.images.items():
        p = os.path.join(out_dir, name + ".png")
        im.filepath_raw = p
        im.file_format = "PNG"
        im.save()
        paths.append(p)
    return paths


def main():
    shape_path, out_dir = sys.argv[1], sys.argv[2]
    shape = json.load(open(shape_path))
    os.makedirs(out_dir, exist_ok=True)
    clear()
    b = Builder(shape, os.path.dirname(os.path.abspath(shape_path)))
    obj = b.build(ao="--no-ao" not in sys.argv)
    parts = [obj] + list(obj.children)
    tris = sum(len(p.vertices) - 2 for o in parts for p in o.data.polygons)
    glb = os.path.join(out_dir, shape["id"] + ".glb")
    export_glb(obj, glb)
    pngs = save_images(b, out_dir)
    moving = ", ".join(c.name for c in obj.children) or "none"
    print(f"{shape['id']}: {sum(len(o.data.polygons) for o in parts)} faces, {tris} triangles, "
          f"moving parts: {moving}, atlas {b.S}px at {b.k:.1f} px/ft, "
          f"{os.path.getsize(glb) / 1024:.0f} KB -> {glb}")
    print("textures:", ", ".join(os.path.basename(p) for p in pngs))
    if "--render" in sys.argv:
        views = {"front34": (55, 18, 50), "rear34": (-140, 26, 50), "side": (0, 0, 50), "top": (0, 90, 50)}
        print("render:", render(obj, os.path.join(out_dir, shape["id"] + ".png"), views))


if __name__ == "__main__":
    main()
