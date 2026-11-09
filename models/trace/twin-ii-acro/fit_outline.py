"""Smooth fuselage outline from the traced three-view: top, bottom and half-width as
smoothing splines (wheels, fin and rudder excluded), sampled at dense stations."""
import json, numpy as np
from scipy.interpolate import UnivariateSpline
d = json.load(open("outline.json"))
S = np.array(d["side"]); P = np.array(d["plan"])
END = 24.7
# --- top: fuselage only (fin starts ~22.2); boom top runs on under the fin at its own slope
m = S[:, 0] < 22.15
xt, zt = S[m, 0], S[m, 1]
# --- bottom: drop the nose wheel, main wheel and tail wheel bulges and the rudder
wheel = ((S[:, 0] > 2.15) & (S[:, 0] < 3.45)) | ((S[:, 0] > 8.75) & (S[:, 0] < 10.75)) | (S[:, 0] > 23.0)
xb, zb = S[~wheel, 0], S[~wheel, 2]
# --- half-width: drop the fin fillet region and stray lines
m = (P[:, 0] < 23.0) & (P[:, 1] < 1.35)
xw, hw = P[m, 0], P[m, 1]

def fit(x, y, s, tip=None, tail=None):
    x, y = list(x), list(y)
    w = [1.0] * len(x)
    if tip is not None:
        x, y, w = [0.0] + x, [tip] + y, [20.0] + w
    if tail is not None:
        x += [tail[0]]; y += [tail[1]]; w += [5.0]
    o = np.argsort(x); x, y, w = np.array(x)[o], np.array(y)[o], np.array(w)[o]
    x, i = np.unique(x, return_index=True)
    return UnivariateSpline(x, y[i], w=w[i], k=3, s=s)

# boom extensions under the fin, continuing each line's slope over 18-22 ft
def extend(x, y, x0=18.0, x1=22.0):
    sel = (x > x0) & (x < x1)
    a, b = np.polyfit(x[sel], y[sel], 1)
    return a * END + b
top_end = extend(xt, zt); bot_end = extend(xb, zb, 17.0, 22.9); hw_end = extend(xw, hw, 17.0, 22.9)
ft = fit(xt, zt, s=len(xt) * 0.0006, tip=0.0, tail=(END, top_end))
fb = fit(xb, zb, s=len(xb) * 0.0006, tip=0.0, tail=(END, bot_end))
# half-width near a blunt tip goes like sqrt(x): fit hw^2, which is smooth there
fw2 = fit(xw, hw ** 2, s=len(xw) * 0.0004, tip=0.0, tail=(END, hw_end ** 2))
X = np.concatenate([[0.0], np.linspace(0.05, 0.5, 4), np.linspace(0.8, 3.2, 7), np.linspace(3.9, 12.0, 10), np.linspace(13.2, END, 8)])
out = {"x": X.tolist(), "top": ft(X).tolist(), "bot": fb(X).tolist(), "hw": np.sqrt(np.clip(fw2(X), 0, None)).tolist()}
out["top"][0] = out["bot"][0] = 0.0; out["hw"][0] = 0.0
# residuals against the drawing
print("rms top %.3f  bottom %.3f  half-width %.3f ft" % (np.sqrt(np.mean((ft(xt) - zt) ** 2)), np.sqrt(np.mean((fb(xb) - zb) ** 2)),
      np.sqrt(np.mean((np.sqrt(np.clip(fw2(xw), 0, None)) - hw) ** 2))))
# smoothness: second differences of the sampled stations (no sign flips = no waists or bumps)
for k in ("top", "bot", "hw"):
    y = np.array(out[k]); xx = X
    sl = np.diff(y) / np.diff(xx)
    print(k, "slope sign changes:", int(np.sum(np.diff(np.sign(np.round(sl, 3))) != 0)))
json.dump(out, open("fuselage_fit.json", "w"))
print("stations:", len(X))
