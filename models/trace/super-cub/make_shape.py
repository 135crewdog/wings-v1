"""Piper PA-18-150 Super Cub shape file and skins.

Geometry traced from the PA-18 Super Cub three-view (references/three-view_PA-18.jpg) at
22.38 px/ft: the span measures 788 px in the plan, bottom and front views, = 35 ft 2.5 in.
Side-view pixels (sx, sy) convert as x = (sx - 375) / K, z = (119 - sy) / K, so x is aft from
the spinner tip (375 px, 0.88 ft ahead of the drawn hub) and z is up from the thrust line
(119 px). Plan-view rows (py) map to side-view columns as sx = 386 + (786 - py).
Control travels from FAA TCDS 1A2 (all PA-18 models; rudder per the PA-18 "150" exception).
"""
import json, os

HERE = os.path.dirname(os.path.abspath(__file__))
MODELS = os.path.join(HERE, "..", "..")  # models/

K = 22.38                       # px per ft, from the span
X = lambda sx: round((sx - 375) / K, 3)
Z = lambda sy: round((119 - sy) / K, 3)
PX = lambda py: 386 + (786 - py)     # plan-view row -> side-view column
W = lambda px: round(px / K, 3)      # a width in px -> ft

# ---------------------------------------------------------------- fuselage
# (side x px, top y px, bottom y px, plan width px, superellipse n, lean)
# Widths: plan view (cowl 58 px, cabin 52 px, tapering aft); heights: side view outline.
# The cowl is wider than the cabin (cylinder-head cheeks), so the firewall is a small step.
ROWS = [
    (397.0, 107.0, 137.0, 49, 2.4, 0.00),   # nose bowl face, round corners in plan
    (400.0, 104.0, 141.0, 58, 2.6, 0.00),   # cowl front (section A)
    (425.0, 102.0, 146.0, 59, 2.8, 0.00),
    (445.0, 98.0, 150.0, 59, 3.0, 0.05),    # cowl rear, at the firewall
    (449.0, 97.0, 151.0, 52, 3.4, 0.15),    # cabin front, windshield base (section B)
    (470.0, 85.0, 155.0, 52, 3.5, 0.25),
    (491.0, 72.0, 157.5, 52, 3.6, 0.30),    # wing leading edge, top of the windshield
    (535.0, 72.0, 158.0, 52, 3.6, 0.30),    # flat belly ends at the strut and gear fitting (section C)
    (560.0, 72.0, 154.0, 52, 3.6, 0.30),
    (608.0, 71.0, 146.0, 51, 3.5, 0.28),    # wing trailing edge
    (632.0, 74.0, 142.5, 50, 3.3, 0.25),    # behind the rear window (section D)
    (680.0, 76.0, 136.0, 43, 3.1, 0.22),
    (730.0, 77.0, 129.0, 34.5, 3.0, 0.20),
    (787.0, 77.5, 121.0, 21, 2.8, 0.18),    # fin leading edge (section E)
    (820.0, 79.0, 115.0, 14.5, 2.6, 0.15),
    (849.0, 81.0, 112.0, 9, 2.4, 0.10),     # sternpost, on the rudder hinge
]
stations = [
    {"x": 0.0, "w": 0.0, "h": 0.0, "z": 0.0, "n": 2.0},          # spinner tip
    {"x": 0.45, "w": 0.6, "h": 0.6, "z": 0.0, "n": 2.0},
    {"x": 0.88, "w": 0.8, "h": 0.8, "z": 0.0, "n": 2.0},         # spinner base
]
for sx, top, bot, wpx, n, lean in ROWS:
    st = {"x": X(sx), "w": W(wpx), "h": round((bot - top) / K, 3), "z": round((Z(top) + Z(bot)) / 2, 3), "n": n}
    if lean:
        st["lean"] = lean
    stations.append(st)

# ---------------------------------------------------------------- wing
WING_LE = X(491)                 # 5.183 ft
CHORD = 5.27                     # 118 px in plan and side views (63 in)
HINGE = round(WING_LE + CHORD - 1.10, 3)   # flaps and ailerons: 1.10 ft chord (plan 24 px, bottom view 25 px)
# tip: (s, leading edge setback, chord), traced column by column from the plan view
TIP = [(14.05, 0.0, 5.27), (15.30, 0.0, 5.00), (16.11, 0.13, 4.51), (16.73, 0.49, 3.71), (17.18, 0.94, 2.73),
       (17.43, 1.38, 1.85), (17.58, 1.88, 0.80)]
wing_secs = [{"s": 0.0, "x_le": 0.0, "chord": CHORD}] + [{"s": s, "x_le": le, "chord": c} for s, le, c in TIP]
FLAP = (6.85, 11.07)             # plan 158-252 px, bottom view 597-692 px from the centreline
AIL = (11.07, 15.31)             # plan 62-158 px, bottom view 503-597 px

# ---------------------------------------------------------------- fin and rudder
FIN_ROOT_Y = 111.0               # rudder bottom; the fin below the fuselage top is buried in it
HINGE_SX = 849.0                 # rudder hinge on the sternpost, vertical
FIN_TOP_Y = 32.0                 # fin top; above it the rudder's horn balance runs forward to the leading edge
# (y px, leading edge px, trailing edge px)
FIN = [(111, 785, 856), (104, 785, 875), (94, 785, 884), (78, 786.5, 886), (70, 794, 886), (54, 804, 882),
       (42, 811, 877), (32, 818.5, 871.5), (20, 825, 863), (12, 833, 853), (8.5, 840, 846)]
fin_x0 = X(785)
fin_secs = [{"s": round((FIN_ROOT_Y - y) / K, 3), "x_le": round(X(le) - fin_x0, 3), "chord": round((te - le) / K, 3)}
            for y, le, te in FIN]
S_FIN_TOP = round((FIN_ROOT_Y - FIN_TOP_Y) / K, 3)
S_FIN_TIP = fin_secs[-1]["s"]

# ---------------------------------------------------------------- tailplane and elevator
# (s ft, leading edge plan row, trailing edge plan row); hinge on plan row 324
HT = [(0.0, 377, 312), (0.35, 377, 308), (0.70, 377, 297), (1.20, 375.5, 290), (2.17, 370.5, 289),
      (2.97, 363.5, 291), (3.65, 355, 295), (4.18, 345, 301), (4.58, 335, 309), (4.74, 328.5, 316)]
ht_x0 = X(PX(377))
ht_secs = [{"s": s, "x_le": round(X(PX(le)) - ht_x0, 3), "chord": round((le - te) / K, 3)} for s, le, te in HT]
EL_HINGE = X(PX(324))
EL_ROOT = 0.35                   # inboard of this the elevator is cut away around the rudder

# ---------------------------------------------------------------- gear, struts, wires
AX_X, AX_Z = X(495), Z(192)      # main axle: side view wheel centre
TRACK_Y = round(130 / K / 2, 3)  # front view: wheel centres 130 px apart (5.8 ft)
STRUT_LO = [7.25, 1.15, -1.55]   # lift-strut fitting on the lower longeron (side 535 px, bottom view 430 px)
FRONT_SPAR, REAR_SPAR = round(WING_LE + 0.67, 3), round(WING_LE + 3.80, 3)   # bottom view: 15 and 85 px behind the LE
S_STRUT = 11.0                   # struts meet the wing at the flap/aileron joint (bottom view 600 px)
S_JURY = 6.1                     # jury struts (bottom view 710 px)


def along(a, b, t):
    return [round(a[i] + (b[i] - a[i]) * t, 3) for i in range(3)]


front_hi = [FRONT_SPAR, S_STRUT, 2.20]
rear_hi = [REAR_SPAR, S_STRUT, 2.27]
tj = (S_JURY - STRUT_LO[1]) / (S_STRUT - STRUT_LO[1])
fj, rj = along(STRUT_LO, front_hi, tj), along(STRUT_LO, rear_hi, tj)
gear_top = Z(158) + 0.04
struts = [
    {"what": "front lift strut", "a": STRUT_LO, "b": front_hi, "r": 0.09, "part": "strut", "mirror": True},
    {"what": "rear lift strut", "a": STRUT_LO, "b": rear_hi, "r": 0.09, "part": "strut", "mirror": True},
    {"what": "front jury strut", "a": fj, "b": [fj[0], fj[1], 2.22], "r": 0.035, "part": "strut", "mirror": True},
    {"what": "rear jury strut", "a": rj, "b": [rj[0], rj[1], 2.24], "r": 0.035, "part": "strut", "mirror": True},
    {"what": "jury cross brace", "a": fj, "b": rj, "r": 0.03, "part": "strut", "mirror": True},
    {"what": "front gear leg", "a": [X(494), 1.05, gear_top], "b": [AX_X, TRACK_Y - 0.36, AX_Z + 0.06], "r": 0.075, "part": "gear", "mirror": True},
    {"what": "rear gear leg", "a": [X(536), 1.05, gear_top], "b": [AX_X + 0.12, TRACK_Y - 0.36, AX_Z + 0.06], "r": 0.075, "part": "gear", "mirror": True},
    {"what": "split axle, hinged on the centreline", "a": [AX_X, 0.12, Z(935 - 877 + 119)], "b": [AX_X, TRACK_Y - 0.3, AX_Z], "r": 0.055, "part": "gear", "mirror": True},
    {"what": "shock strut", "a": [AX_X + 0.25, 0.25, Z(158) - 0.2], "b": [AX_X + 0.05, TRACK_Y - 0.55, AX_Z + 0.25], "r": 0.12, "part": "gear", "mirror": True, "sides": 8},
    {"what": "tailwheel spring", "a": [X(849), 0.0, Z(112)], "b": [X(868), 0.0, Z(122)], "r": 0.05, "part": "gear", "sides": 4},
    {"what": "upper tail wire", "a": [20.85, 0.0, 3.1], "b": [EL_HINGE - 0.15, 2.8, Z(87.5) + 0.04], "r": 0.022, "part": "wire", "mirror": True, "sides": 4},
    {"what": "lower tail wire", "a": [EL_HINGE - 0.15, 2.8, Z(87.5) - 0.04], "b": [20.35, 0.2, Z(115) + 0.05], "r": 0.022, "part": "wire", "mirror": True, "sides": 4},
]
wheels = [
    {"what": "main wheel, 8.00-4 tyre", "x": AX_X, "y": TRACK_Y, "z": AX_Z, "r": 0.75, "w": 0.62, "mirror": True},
    {"what": "tailwheel, 6 in", "x": X(870), "y": 0.0, "z": Z(123), "r": 0.26, "w": 0.18, "mirror": False},
]

TCDS = "FAA TCDS 1A2 (Rev. 38), control surface movements"
shape = {
    "id": "super-cub",
    "units": "ft; x aft from the spinner tip, y left, z up from the thrust line",
    "model": "Piper PA-18-150 Super Cub",
    "source": ("Fuselage, wing, flaps, ailerons, tail, struts and gear traced from the PA-18 Super Cub three-view "
               "(22.38 px/ft from the 35 ft 2.5 in span) and checked against photos; control and flap travels "
               "and prop diameter limits from FAA TCDS 1A2; 8.00-4 main tyres and 6 in tailwheel from the PA-18-150 "
               "owner's manual; wing section USA 35B (modified), dihedral from the owner's manual rigging note; "
               "incidence and spinner shape estimated from the drawing and photos."),
    "texture": {"size": 2048},
    "skins": ["../skins/super-cub/cub-yellow.json", "../skins/super-cub/bush-red.json"],
    "fuselage": {
        "profile_z": [-0.97, -0.88, -0.62, -0.3, 0.0, 0.3, 0.6, 0.82, 0.93, 0.98],
        "stations": stations,
    },
    "surfaces": [
        {"name": "wing", "part": "wing", "mirror": True, "vertical": False,
         "root": {"x": WING_LE, "y": 0.0, "z": 2.25}, "dihedral_deg": 0.75, "incidence_deg": 1.0,
         "airfoil": {"thickness": 0.12, "camber": 0.04},
         "sections": wing_secs,
         "split": {
             "hinge_x": [[FLAP[0], HINGE], [AIL[1], HINGE]],
             "spans": [
                 {"s0": FLAP[0], "s1": FLAP[1], "control": {
                     "name": "flap_{side}", "min_deg": 0.0, "max_deg": 50.0, "positive": "trailing edge down",
                     "source": TCDS + ": wing flaps 0 up, 50 +/- 2 deg down; three positions in the owner's manual (up, half, full)"}},
                 {"s0": AIL[0], "s1": AIL[1], "control": {
                     "name": "aileron_{side}", "min_deg": -18.0, "max_deg": 18.0, "positive": "trailing edge down",
                     "source": TCDS + ": ailerons 18 +/- 2 deg up, 18 +/- 2 deg down"}}]}},
        {"name": "fin", "part": "tail", "mirror": False, "vertical": True,
         "root": {"x": fin_x0, "y": 0.0, "z": Z(FIN_ROOT_Y)},
         "airfoil": {"thickness": 0.05, "camber": 0.0}, "points": 4,
         "sections": fin_secs,
         "split": {
             "hinge_x": [[0.0, X(HINGE_SX)], [S_FIN_TIP, X(HINGE_SX)]],
             "spans": [
                 {"s0": 0.0, "s1": S_FIN_TOP, "control": {
                     "name": "rudder", "min_deg": -25.0, "max_deg": 25.0,
                     "positive": "trailing edge left (left pedal, nose left)",
                     "source": TCDS + ": rudder 25 deg left, 25 deg right (PA-18 \"150\" exception to the 20 deg standard)"}},
                 {"s0": S_FIN_TOP, "s1": S_FIN_TIP, "whole": "rudder"}]}},
        {"name": "htail", "part": "tail", "mirror": True, "vertical": False,
         "root": {"x": ht_x0, "y": 0.0, "z": Z(87.5)},
         "airfoil": {"thickness": 0.05, "camber": 0.0}, "points": 4,
         "sections": ht_secs,
         "split": {
             "hinge_x": [[0.0, EL_HINGE], [HT[-1][0], EL_HINGE]],
             "spans": [
                 {"s0": 0.0, "s1": EL_ROOT, "none": True},
                 {"s0": EL_ROOT, "s1": HT[-1][0], "control": {
                     "name": "elevator", "min_deg": -25.0, "max_deg": 15.0, "positive": "trailing edge down",
                     "source": TCDS + ": elevator 25 +/- 2 deg up, 15 +/- 2 deg down; the stabilizer itself trims 2.5 deg up / 4 deg down (not modelled as a moving part)"}}]}},
    ],
    "struts": struts,
    "wheels": wheels,
    "prop": {"x": X(386), "z": 0.0, "diameter": 6.17, "blades": 2, "chord": 0.42, "spinner": True, "node": True,
             "tip_part": True, "positive": "clockwise seen from behind (engine rotation)",
             "source": "Sensenich 74DM fixed-pitch metal prop; TCDS 1A2 diameter 72.5 to 74 in (74 used; the drawing shows 72 in)"},
}

# ---------------------------------------------------------------- skins
# Side-view outlines in airframe ft (x aft, z up); side_poly paints both sides and the top.
WINDOWS = [[3.26, 0.95], [3.26, 3.2], [X(608), 3.2], [X(608), Z(75)], [X(632), Z(75)], [X(632), Z(104)], [X(527), Z(108)], [X(470), Z(104)], [X(452), Z(100)]]
POSTS = [[X(494), X(500)], [X(558), X(563)]]       # windshield post and door post (side view)
# traced from photos of OO-NET and N342CA: a forward prong from the cowl, the body under the windshield,
# a spike pointing down and aft, then a cheat line that thins out to the tail under the stabilizer
BOLT = [[3.69, 0.30], [4.37, 0.62], [6.80, 0.46], [19.70, 1.13], [20.00, 1.07], [19.70, 1.01], [6.80, 0.16],
        [5.19, 0.17], [5.40, -0.22], [4.69, 0.12]]
REG_AT, REG_H = [15.0, 0.79], 0.95
GLASS, GLASS_TOP = "#1E2A33", "#4A6275"
NOSE_INLETS = {"x": [0.85, 1.2], "y": [0.28, 0.78], "z": [0.05, 0.55]}
SKYLIGHT = [[X(497), 0.0], [X(605), 0.0], [X(605), 0.95], [X(497), 0.95]]


def common(body, reg_color, bolt_color, posts_color):
    return [
        {"what": "lightning bolt and cheat line", "parts": ["fuselage"], "side_poly": BOLT, "color": bolt_color},
        {"what": "cabin glass: windshield, door and rear windows", "parts": ["fuselage"], "side_poly": WINDOWS,
         "color": GLASS, "color2": GLASS_TOP, "grad": {"axis": "z", "from": 0.4, "to": 2.2}, "roughness": 0.15},
        *[{"what": "window post", "parts": ["fuselage"], "box": {"x": p, "z": [0.3, 2.05]}, "color": posts_color} for p in POSTS],
        {"what": "skylight in the wing centre section", "parts": ["wing"], "plan_poly": SKYLIGHT, "box": {"z": [2.3, 9]},
         "color": GLASS, "roughness": 0.15},
        {"what": "cooling inlets in the nose bowl", "parts": ["fuselage"], "box": NOSE_INLETS, "color": "#1A1A1A", "roughness": 0.8},
        {"what": "gap in the cheat line for the registration", "parts": ["fuselage"],
         "box": {"x": [REG_AT[0] - 2.75, REG_AT[0] + 2.75], "z": [0.35, 1.25]}, "color": body},
        {"what": "registration", "parts": ["fuselage"], "text": "N18WG", "at": REG_AT, "height": REG_H, "color": reg_color},
    ]


YELLOW, BLACK = "#F2BE1A", "#141414"
cub_yellow = {
    "name": "Cub yellow",
    "about": "The classic factory scheme: yellow all over with the black lightning bolt and cheat line, registered N18WG (invented).",
    "base": {"fuselage": YELLOW, "spinner": YELLOW, "wing": YELLOW, "tail": YELLOW, "strut": YELLOW, "gear": YELLOW,
             "tire": "#1C1C1C", "prop": "#3A3D40", "prop_tip": "#F2EEE4", "wire": "#2E3236"},
    "roughness": {"default": 0.45, "tire": 0.9, "prop": 0.35, "wire": 0.5},
    "layers": common(YELLOW, BLACK, BLACK, YELLOW),
}
RED, CREAM = "#B8261E", "#F2EEE4"
bush_red = {
    "name": "Bush red",
    "about": "A backcountry scheme: red fuselage and tail, cream wings with red tips, cream bolt and registration (N18WG, invented).",
    "base": {"fuselage": RED, "spinner": CREAM, "wing": CREAM, "tail": RED, "strut": CREAM, "gear": RED,
             "tire": "#1C1C1C", "prop": "#3A3D40", "prop_tip": RED, "wire": "#2E3236"},
    "roughness": {"default": 0.45, "tire": 0.9, "prop": 0.35, "wire": 0.5},
    "layers": common(RED, CREAM, CREAM, RED) + [
        {"what": "wingtips", "parts": ["wing"], "box": {"y": [15.31, 99]}, "color": RED},
    ],
}

os.makedirs("models/shapes", exist_ok=True)
os.makedirs("models/skins/super-cub", exist_ok=True)
os.makedirs(os.path.join(MODELS, "skins/super-cub"), exist_ok=True)
json.dump(shape, open(os.path.join(MODELS, "shapes/super-cub.json"), "w"), indent=1)
json.dump(cub_yellow, open(os.path.join(MODELS, "skins/super-cub/cub-yellow.json"), "w"), indent=1)
json.dump(bush_red, open(os.path.join(MODELS, "skins/super-cub/bush-red.json"), "w"), indent=1)
print("stations", len(stations), "| wing LE", WING_LE, "hinge", HINGE, "| fin top s", S_FIN_TOP, "tip s", S_FIN_TIP,
      "| elevator hinge", EL_HINGE, "| axle", AX_X, AX_Z, "track y", TRACK_Y)
print("length", X(886), "ft; span", 2 * TIP[-1][0], "ft")
