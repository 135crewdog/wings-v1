"""Grob G 103 A Twin II Acro shape file and skins. Geometry traced from the G 103 A Twin II Acro
three-view at 16.39 px/ft (span 941 px = 17.5 m) and checked against photos; control data
from the Twin II Acro section of the type certificate data sheet (TCDS G39EU) and the BGA data sheet.
Markings: N103TG, a deliberate cosmetic deviation (the real N103TG is a standard Twin II)."""
import json, math, os

# Fuselage: smoothing splines fitted to the drawing's outlines (fit_outline.py, rms 7 mm),
# sampled densely so the pod flows into the nose and boom with no waists or creases.
HERE = os.path.dirname(os.path.abspath(__file__))
MODELS = os.path.join(HERE, "..", "..")  # models/
FIT = json.load(open(os.path.join(HERE, "fuselage_fit.json")))

def ramp(x, x0, x1):
    t = min(max((x - x0) / (x1 - x0), 0.0), 1.0)
    return t * t * (3 - 2 * t)

def section_n(x):
    """Superellipse exponent: round nose and boom, slightly fuller cockpit section."""
    return round(2.0 + 0.15 * ramp(x, 0.8, 3.2) * (1 - ramp(x, 9.5, 13.5)), 3)

stations = []
for x, top, bot, hw in zip(FIT["x"], FIT["top"], FIT["bot"], FIT["hw"]):
    if x == 0:
        stations.append({"x": 0.0, "w": 0.0, "h": 0.0, "z": 0.0, "n": 2.0})
        continue
    stations.append({"x": round(x, 3), "w": round(2 * hw, 3), "h": round(top - bot, 3),
                     "z": round((top + bot) / 2, 3), "n": section_n(x)})
# the boom narrows into the rudder hinge: keep the last station as slim as the drawing's tail cone
stations[-1]["w"] = 0.52
stations[-2]["w"] = round(min(stations[-2]["w"], 0.78), 3)

# ---- fin and rudder (vertical surface, s = height above z 0.33) ----
FIN_Z0 = 0.33
def lin(z, pts):
    for (z0, v0), (z1, v1) in zip(pts, pts[1:]):
        if z <= z1 + 1e-9:
            return v0 + (v1 - v0) * (z - z0) / (z1 - z0)
    return pts[-1][1]
FIN_LE = [(0.33, 21.25), (1.10, 22.47), (4.60, 23.87), (4.85, 23.97)]
hinge = lambda z: 24.80 + 0.232 * (z - 0.92)          # rudder hinge line, leaning aft 13 deg
# Rudder top: front corner 2.4 cm under the tailplane, sloping down aft so the elevator
# clears it at full down (18.7 deg), as on the real aircraft (photo of N4446W).
RUD_TOP_FRONT, RUD_TOP_AFT = 4.74, 4.50
fin_rows = [(0.33, 25.80), (1.10, 26.27), (4.27, 26.51), (RUD_TOP_AFT, 26.45),
            (RUD_TOP_FRONT, round(hinge(RUD_TOP_FRONT) + 0.11, 3)), (4.85, 25.90)]
fin_secs = [{"s": round(z - FIN_Z0, 4), "x_le": round(lin(z, FIN_LE) - 21.25, 4), "chord": round(te - lin(z, FIN_LE), 4)}
            for z, te in fin_rows]

deg = lambda travel_mm, radius_mm: round(math.degrees(math.asin(travel_mm / radius_mm)), 1)
SRC = "Twin II Acro TCDS / BGA data sheet: travel {} mm, measured {} mm from the hinge"

shape = {
 "id": "twin-ii-acro",
 "units": "ft; x aft from the nose tip, y left, z up from the nose tip",
 "model": "Grob G 103 A Twin II Acro",
 "markings": "N103TG: the registration of a standard Twin II (s/n 3829) flown at Moriarty, NM; a deliberate cosmetic deviation from the Acro",
 "source": ("Fuselage, wing, ailerons, airbrakes and tail traced from the G 103 A Twin II Acro three-view "
            "(scaled to 17.5 m span; fuselage as smoothing splines, rms 7 mm) and checked against photos; "
            "control travels from the Twin II Acro TCDS and BGA data sheet; tyres 6.00-6 main, 260x85 nose, "
            "210x65 tail from the Twin II flight manual, which the Acro's manual supplements; wing section E603, dihedral and incidence from "
            "Grob handbooks."),
 "texture": {"size": 2048},
 "skins": ["../skins/twin-ii-acro/club-white.json", "../skins/twin-ii-acro/cadet-red.json"],
 "fuselage": {
  "profile_z": [-0.96, -0.8, -0.55, -0.25, 0.0, 0.15, 0.3, 0.45, 0.62, 0.78, 0.9, 0.97],
  "stations": stations
 },
 "surfaces": [
  {"name": "wing", "part": "wing", "mirror": True, "vertical": False,
   "root": {"x": 8.19, "y": 0.0, "z": 0.70}, "dihedral_deg": 3.5, "incidence_deg": 2.5,
   "airfoil": {"thickness": 0.19, "camber": 0.033},
   "sections": [{"s": 0.0, "x_le": 0.0, "chord": 4.25}, {"s": 16.2, "x_le": 0.0, "chord": 3.37},
                {"s": 27.7, "x_le": 0.0, "chord": 1.98}, {"s": 28.05, "x_le": 0.03, "chord": 1.91},
                {"s": 28.35, "x_le": 0.12, "chord": 1.84}, {"s": 28.71, "x_le": 0.45, "chord": 1.35}],
   "split": {
     "hinge_chord": [[16.2, 0.66], [28.05, 0.55]],
     "spans": [{"s0": 16.2, "s1": 28.05, "control": {
        "name": "aileron_{side}", "min_deg": -deg(90, 208), "max_deg": deg(50, 208),
        "positive": "trailing edge down", "source": SRC.format("up 90 / down 50", 208)}}]},
   "airbrakes": [{"name": "airbrake_{side}", "s0": 7.90, "s1": 12.49, "frac": 0.44,
                  "height": 0.60, "travel": 0.583, "gap": 0.16, "cap_width": 0.24,
                  "source": "Schempp-Hirth type upper-surface brakes; span 1.4 m as drawn; extend 7.0 in (178 mm) at the inner end (Twin II Acro TCDS)"}]},
  {"name": "fin", "part": "tail", "mirror": False, "vertical": True,
   "root": {"x": 21.25, "y": 0.0, "z": FIN_Z0},
   "airfoil": {"thickness": 0.12, "camber": 0.0},
   "sections": fin_secs,
   "split": {
     "hinge_x": [[z - FIN_Z0, round(hinge(z), 4)] for z in (0.33, 4.85)],
     "spans": [{"s0": 0.0, "s1": round(RUD_TOP_FRONT - FIN_Z0, 4), "control": {
                  "name": "rudder", "min_deg": -deg(233, 450), "max_deg": deg(233, 450),
                  "positive": "trailing edge left (left pedal, nose left)",
                  "source": SRC.format("233", 450).replace("233 mm", "233 mm each way")}},
               {"s0": round(RUD_TOP_FRONT - FIN_Z0, 4), "s1": round(4.85 - FIN_Z0, 4), "none": True}]}},
  {"name": "htail", "part": "tail", "mirror": True, "vertical": False,
   "root": {"x": 23.78, "y": 0.0, "z": 4.90},
   "airfoil": {"thickness": 0.10, "camber": 0.0},
   "sections": [{"s": 0.0, "x_le": 0.0, "chord": 2.74}, {"s": 5.2, "x_le": 0.74, "chord": 1.55},
                {"s": 5.44, "x_le": 0.95, "chord": 1.34}],
   "split": {
     "hinge_x": [[0.0, 25.73], [5.44, 25.73]],
     "spans": [{"s0": 0.0, "s1": 5.44, "control": {
        "name": "elevator", "min_deg": -deg(95, 240), "max_deg": deg(73.9, 240),
        "positive": "trailing edge down", "source": "Twin II Acro TCDS, elevator with spring trim (s/n 3839-K on, AM 315-13/1, AM 315-14): up 3.74 in / down 2.91 in, measured 9.45 in from the hinge at the elevator inboard edge, which matches this elevator's 241 mm root chord"}}]}}
 ],
 "struts": [],
 "wheels": [
  {"x": 9.85, "y": 0.0, "z": -0.61, "r": 0.73, "w": 0.50, "mirror": False},
  {"x": 2.75, "y": 0.0, "z": -0.98, "r": 0.426, "w": 0.279, "mirror": False},
  {"x": 24.04, "y": 0.0, "z": 0.28, "r": 0.345, "w": 0.213, "mirror": False}]
}

# ---- skins: paint rules in airframe feet (x aft, |y| out, z up) ----
WHITE, GLASS, GLASS_TOP = "#F4F5F2", "#1F2C38", "#46607A"
COMMON_BASE = {"fuselage": WHITE, "wing": WHITE, "tail": WHITE, "tire": "#1C1C1C",
               "gear": "#3A3F44"}
ROUGH = {"default": 0.42, "tire": 0.9, "gear": 0.55, "airbrake": 0.35}
canopy = [  # front and rear glass, seen from the side; the white bar between is the frame
 {"what": "front canopy", "parts": ["fuselage"], "side_poly": [[1.50, 9], [1.50, 1.02], [2.88, 0.50], [5.85, 0.70], [5.85, 9]],
  "color": GLASS, "color2": GLASS_TOP, "grad": {"axis": "z", "from": 0.6, "to": 2.5}, "roughness": 0.15},
 {"what": "rear canopy", "parts": ["fuselage"], "side_poly": [[6.08, 9], [6.08, 0.74], [9.40, 0.85], [9.53, 0.87], [9.61, 0.92], [9.65, 1.00], [9.85, 1.95], [9.90, 2.17], [9.95, 2.33], [10.0, 2.45], [10.04, 9]],
  "color": GLASS, "color2": GLASS_TOP, "grad": {"axis": "z", "from": 0.7, "to": 2.5}, "roughness": 0.15}]

club_white = {
 "name": "Club white",
 "about": "White with the orange nose wedge, blue cheat line, orange rudder bars and wingtips seen on club Twin IIs, registered N103TG.",
 "base": {**COMMON_BASE, "airbrake": "#F0561D"}, "roughness": ROUGH,
 "layers": canopy + [
  {"what": "nose wedge", "parts": ["fuselage"], "side_poly": [[-1, -0.05], [2.99, 0.11], [1.47, 1.0], [1.40, 9], [-1, 9]], "color": "#F0561D"},
  {"what": "cheat line", "parts": ["fuselage"], "side_poly": [[0.05, -0.085], [3.55, -0.065], [3.55, -0.145], [0.05, -0.165]], "color": "#2F5DB3"},
  {"what": "rudder bars", "targets": ["rudder"], "stripes": {"dir": [0, 0, 1], "from": 0.36, "to": 4.74, "count": 13}, "color": "#F0561D"},
  {"what": "wingtips", "parts": ["wing"], "box": {"y": [28.05, 99]}, "color": "#F0561D"},
  {"what": "registration", "parts": ["tail"], "targets": ["twin-ii-acro"], "text": "N103TG", "at": [24.05, 2.3], "height": 0.33, "color": "#1E2A36"}]}

cadet_red = {
 "name": "Cadet red",
 "about": "Training-school scheme: red nose cap, diagonal red bars on the rudder and wingtips, red tailplane tips.",
 "base": {**COMMON_BASE, "airbrake": "#C8202B"}, "roughness": ROUGH,
 "layers": canopy + [
  {"what": "nose cap", "parts": ["fuselage"], "side_poly": [[-1, -9], [1.15, -9], [1.15, 9], [-1, 9]], "color": "#C8202B"},
  {"what": "rudder diagonals", "targets": ["rudder"], "stripes": {"dir": [0.55, 0, 0.83], "from": 13.6, "to": 18.6, "count": 11}, "color": "#C8202B"},
  {"what": "wingtip diagonals", "parts": ["wing"], "box": {"y": [26.2, 99]}, "stripes": {"dir": [0.7, 0.7, 0], "from": 24.0, "to": 28.0, "count": 9}, "color": "#C8202B"},
  {"what": "tailplane tips", "parts": ["tail"], "box": {"y": [4.7, 99]}, "color": "#C8202B"},
  {"what": "boom band", "parts": ["fuselage"], "side_poly": [[19.6, -9], [20.4, -9], [20.4, 9], [19.6, 9]], "color": "#C8202B"},
  {"what": "registration", "parts": ["fuselage"], "text": "N103TG", "at": [15.6, 0.72], "height": 0.42, "color": "#1E2A36"}]}

os.makedirs(os.path.join(MODELS, "skins/twin-ii-acro"), exist_ok=True)
json.dump(club_white, open(os.path.join(MODELS, "skins/twin-ii-acro/club-white.json"), "w"), indent=1)
json.dump(cadet_red, open(os.path.join(MODELS, "skins/twin-ii-acro/cadet-red.json"), "w"), indent=1)
json.dump(shape, open(os.path.join(MODELS, "shapes/twin-ii-acro.json"), "w"), indent=1)
print("fin sections", [(s["s"], s["x_le"], s["chord"]) for s in fin_secs])
