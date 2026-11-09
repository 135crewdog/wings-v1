// The hangar page (docs/aircraft.md, "The hangar"): each airplane on the roster with its planform, its
// figures and its energy-manoeuvrability diagram, all from src/sim/ through figures.js, and a tuning
// panel whose edits stay in this browser.

import { figures } from "./figures.js";

const SVG = "http://www.w3.org/2000/svg";
const STORE = (id) => `wings.hangar.${id}`;

// The tuning sliders: card paths. Each slider runs from a quarter to twice the card's own value.
const TUNABLE = [
  ["mass.mass_kg", "mass (kg)"],
  ["wing.cl_max", "maximum lift coefficient"],
  ["wing.stall_softness_deg", "stall softness (°)"],
  ["wing.oswald_e", "span efficiency (Oswald)"],
  ["drag.cd0", "zero-lift drag coefficient"],
  ["stability.static_margin", "static margin"],
  ["stability.cmq", "pitch damping Cmq"],
  ["stability.cl_beta", "dihedral effect Clβ"],
  ["stability.cn_beta", "weathercock stability Cnβ"],
  ["stability.cnr", "yaw damping Cnr"],
  ["stability.clp", "roll damping Clp"],
  ["control.elevator.cm_full_up", "elevator, full back (Cm)"],
  ["control.aileron.cl_full", "aileron, full (Cl)"],
  ["control.rudder.cn_full", "rudder, full (Cn)"],
];

const get = (o, path) => path.split(".").reduce((x, k) => x?.[k], o);
function set(o, path, v) {
  const keys = path.split(".");
  const last = keys.pop();
  keys.reduce((x, k) => x[k], o)[last] = v;
}

function el(tag, attrs = {}, ...kids) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  for (const k of kids) e.append(k);
  return e;
}
function svgEl(tag, attrs = {}) {
  const e = document.createElementNS(SVG, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  return e;
}

function loadEdits(id) {
  try {
    return JSON.parse(localStorage.getItem(STORE(id)) ?? "{}");
  } catch {
    return {};
  }
}
function saveEdits(id, edits) {
  try {
    if (Object.keys(edits).length) localStorage.setItem(STORE(id), JSON.stringify(edits));
    else localStorage.removeItem(STORE(id));
  } catch { /* private window: edits last this visit only */ }
}

/** The planform, top view, nose up: the wing from span, area, taper and quarter-chord sweep. */
function planform(json) {
  const w = json.wing, b = w.span_m, S = w.area_m2, lam = w.taper;
  const cr = (2 * S) / (b * (1 + lam)), ct = lam * cr;
  const tanS = Math.tan((w.sweep_deg * Math.PI) / 180);
  // leading edge: the quarter-chord line through the root's quarter chord, swept back toward the tips
  const tipLE = (b / 2) * tanS + 0.25 * cr - 0.25 * ct;
  const pad = b / 60, height = Math.max(cr, tipLE + ct) + 2 * pad;
  const s = svgEl("svg", { viewBox: `${-b / 2 - pad} ${-pad} ${b + 2 * pad} ${height}`, role: "img", "aria-label": `${json.name} wing planform` });
  const pts = [[0, 0], [b / 2, tipLE], [b / 2, tipLE + ct], [0, cr], [-b / 2, tipLE + ct], [-b / 2, tipLE]];
  s.append(svgEl("polygon", { points: pts.map((p) => p.join(",")).join(" "), fill: "rgba(108,180,255,0.25)", stroke: "#6cb4ff", "stroke-width": b / 300 }));
  return el("div", {}, s, el("div", { class: "note" }, `span ${b} m · wing area ${S} m² · aspect ratio ${((b * b) / S).toFixed(1)} · taper ${lam} · sweep ${w.sweep_deg}°`));
}

/** The energy-manoeuvrability diagram: turn rate against speed, with the lift and load limits and VNE. */
function emDiagram(em) {
  const W = 520, H = 320, L = 46, R = 14, T = 14, B = 40;
  const s = svgEl("svg", { viewBox: `0 0 ${W} ${H}`, role: "img", "aria-label": "Turn rate against airspeed" });
  if (!em) return s;
  const xMax = Math.ceil((em.vne / 0.514444) * 1.05 / 10) * 10;
  const yTop = Math.ceil(Math.max(...em.turns.map((p) => p.deg)) * 1.15 / 10) * 10;
  const x = (kt) => L + (kt / xMax) * (W - L - R);
  const y = (deg) => H - B - (deg / yTop) * (H - T - B);
  const line = (pts, attrs) => s.append(svgEl("polyline", { points: pts.map((p) => `${x(p.kt).toFixed(1)},${y(p.deg).toFixed(1)}`).join(" "), fill: "none", ...attrs }));
  const text = (tx, ty, str, attrs = {}) => { const t = svgEl("text", { x: tx, y: ty, fill: "#9fb3cc", "font-size": 12, ...attrs }); t.textContent = str; s.append(t); };

  for (let kt = 0; kt <= xMax; kt += 20) {
    s.append(svgEl("line", { x1: x(kt), x2: x(kt), y1: y(0), y2: y(yTop), stroke: "rgba(255,255,255,0.08)" }));
    text(x(kt), H - B + 16, String(kt), { "text-anchor": "middle" });
  }
  for (let d = 0; d <= yTop; d += 10) {
    s.append(svgEl("line", { x1: x(0), x2: x(xMax), y1: y(d), y2: y(d), stroke: "rgba(255,255,255,0.08)" }));
    text(L - 6, y(d) + 4, String(d), { "text-anchor": "end" });
  }
  text(W - R, H - 6, "airspeed (kt)", { "text-anchor": "end" });
  text(L + 4, T + 10, "turn rate (°/s)");

  // the lift limit past the corner, faint: more than the structure allows
  line(em.lift.filter((p) => p.kt >= em.corner.V / 0.514444 && p.deg <= yTop), { stroke: "rgba(108,180,255,0.35)", "stroke-dasharray": "4 4", "stroke-width": 1.5 });
  // the envelope: the lift limit up to the corner, the load limit (g_max) beyond it
  line(em.turns, { stroke: "#6cb4ff", "stroke-width": 2.5 });
  // VNE
  const vneKt = em.vne / 0.514444;
  s.append(svgEl("line", { x1: x(vneKt), x2: x(vneKt), y1: y(0), y2: y(yTop), stroke: "#ffb35c", "stroke-width": 1.5 }));
  text(x(vneKt) - 4, y(yTop) + 12, "VNE", { "text-anchor": "end", fill: "#ffb35c" });
  // the corner
  const ck = em.corner.V / 0.514444, cd = (em.corner.rate * 180) / Math.PI;
  if (em.corner.V <= em.vne) {
    s.append(svgEl("circle", { cx: x(ck), cy: y(cd), r: 4, fill: "#eef3fa" }));
    text(x(ck), y(cd) - 9, `corner ${Math.round(ck)} kt, ${Math.round(cd)}°/s`, { "text-anchor": "middle", fill: "#eef3fa" });
  }
  if (em.corner.V <= em.vne) {
    // the load limit's label, above its curve halfway from the corner to VNE
    const mid = em.turns.reduce((a, p) => (Math.abs(p.kt - (ck + vneKt) / 2) < Math.abs(a.kt - (ck + vneKt) / 2) ? p : a));
    text(x(mid.kt), y(mid.deg) - 10, `${em.gMax} g limit`, { "text-anchor": "middle" });
  }
  return s;
}

function table(groups) {
  const frag = document.createDocumentFragment();
  for (const g of groups) {
    frag.append(el("h3", {}, g.group));
    const t = el("table");
    for (const r of g.rows) {
      const name = el("td", {}, r.name);
      if (r.note) name.append(el("div", { class: "note" }, r.note));
      t.append(el("tr", r.fail ? { class: "fail", title: "outside the bounds of flight-model section 12.3" } : {}, name, el("td", {}, r.value ?? "—")));
    }
    frag.append(t);
  }
  return frag;
}

function airplane(original) {
  const id = original.id;
  const edits = loadEdits(id);
  const card = () => {
    const j = structuredClone(original);
    for (const [p, v] of Object.entries(edits)) if (get(j, p) != null) set(j, p, v);
    return j;
  };

  const sub = el("div", { class: "sub" });
  const left = el("div"), right = el("div");
  const plan = el("div"), em = el("div");
  left.append(plan, el("h3", {}, "Turn rate against airspeed (sea level)"), em);
  const box = el("section", { class: "airplane" }, el("h2", {}, original.name), sub, el("div", { class: "grid" }, left, right));

  function draw() {
    const j = card();
    sub.textContent = `${j.maker} ${j.model} · ${j.mass.mass_kg} kg` + (Object.keys(edits).length ? " · tuned in this browser" : "");
    let f;
    try {
      f = figures(j);
    } catch (err) {
      right.replaceChildren(el("p", { class: "fail" }, `These numbers don't make a flyable airplane (${err.message}).`));
      return;
    }
    plan.replaceChildren(planform(j));
    em.replaceChildren(emDiagram(f.em), el("div", { class: "note" }, f.em?.sustained ? "" : "Lift limit up to the corner, load limit beyond it. No sustained turn curve: no engine."));
    right.replaceChildren(table(f.groups));
  }

  // the tuning panel
  let timer = 0;
  const redraw = () => { clearTimeout(timer); timer = setTimeout(draw, 120); };
  const sliders = el("div", { class: "sliders" });
  const inputs = [];
  for (const [path, label] of TUNABLE) {
    const v0 = get(original, path);
    if (typeof v0 !== "number" || v0 === 0) continue;
    const lo = Math.min(v0 / 4, v0 * 2), hi = Math.max(v0 / 4, v0 * 2);
    const input = el("input", { type: "range", min: lo, max: hi, step: Math.abs(v0) / 200 });
    const shown = el("span");
    const sync = () => { const v = edits[path] ?? v0; input.value = v; shown.textContent = String(+v.toPrecision(4)); };
    sync();
    input.addEventListener("input", () => {
      const v = +(+input.value).toPrecision(4);
      if (v === v0) delete edits[path]; else edits[path] = v;
      shown.textContent = String(v);
      saveEdits(id, edits);
      redraw();
    });
    inputs.push(sync);
    sliders.append(el("div", { class: "slider" }, el("label", {}, el("span", {}, label), shown), input));
  }
  const copy = el("button", {}, "Copy card JSON");
  copy.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(JSON.stringify(card(), null, 2) + "\n");
      copy.textContent = "Copied";
    } catch {
      copy.textContent = "Copy failed";
    }
    setTimeout(() => (copy.textContent = "Copy card JSON"), 1500);
  });
  const reset = el("button", {}, "Back to the card");
  reset.addEventListener("click", () => {
    for (const k of Object.keys(edits)) delete edits[k];
    saveEdits(id, edits);
    inputs.forEach((s) => s.call());
    draw();
  });
  box.append(el("details", {},
    el("summary", {}, "Tune"),
    el("p", { class: "note" }, "Edits stay in this browser and don't change the airplane you fly. Copy the card's JSON to keep them."),
    sliders,
    el("div", { class: "buttons" }, copy, reset)));

  draw();
  return box;
}

async function main() {
  const root = document.getElementById("airplanes");
  try {
    const roster = await (await fetch("data/roster.json")).json();
    const cards = await Promise.all(roster.aircraft.map(async (id) => (await fetch(`data/aircraft/${id}.json`)).json()));
    root.replaceChildren(...cards.map(airplane));
  } catch (err) {
    root.replaceChildren(el("p", { class: "fail" }, `The hangar couldn't load the roster (${err.message}).`));
  }
}

main();
