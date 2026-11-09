// Wings. The composition root: loads the roster's cards and the place, runs the sim at a fixed
// 1/120 s from an accumulator, and draws an interpolated frame. No physics here: the sim is src/sim/,
// the ground src/world/, the frames src/render/frames.js.

import * as THREE from "three";
import { APP_VERSION } from "./version.js";
import { loadCard } from "./sim/card.js";
import { DT, Sim } from "./sim/sim.js";
import { glideState, handlingTrim } from "./sim/trim.js";
import { restingAttitude } from "./sim/contact.js";
import { qfromEuler } from "./sim/vec.js";
import { makeGround, startPose } from "./world/ground.js";
import { nedToThree } from "./render/frames.js";
import { createWorld } from "./render/world.js";
import { loadAircraft } from "./render/aircraft.js";
import { createChaseCamera } from "./render/camera.js";
import { createControls } from "./input/controls.js";
import { format, readouts } from "./ui/readouts.js";
import { createAssists } from "./input/assists.js";

const MAX_STEPS = 10; // per frame; past that the sim falls behind rather than spiralling
const $ = (id) => document.getElementById(id);
const getJSON = (path) => fetch(path).then((r) => (r.ok ? r.json() : Promise.reject(new Error(`${path}: ${r.status}`))));

// ---- settings, kept per device ----
const settings = { hud: true, debug: false, assists: { rudder: true, trim: true, level: true }, airplane: null, livery: {} };
try {
  const saved = JSON.parse(localStorage.getItem("wings.settings") || "{}");
  Object.assign(settings, saved, { assists: { ...settings.assists, ...(saved.assists ?? {}) }, livery: { ...(saved.livery ?? {}) } });
} catch {}
const saveSettings = () => { try { localStorage.setItem("wings.settings", JSON.stringify(settings)); } catch {} };

// ---- renderer ----
const canvas = $("view");
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
const chase = createChaseCamera(1);
// Size the drawing to the canvas as it is on screen, checked every frame. iOS can report the old
// window size just after a rotation, and a camera left with the wrong aspect squashes the picture.
function fitToScreen() {
  const w = canvas.clientWidth, h = canvas.clientHeight;
  if (w === 0 || h === 0) return;
  const pr = renderer.getPixelRatio();
  // floor, as renderer.setSize does: with a fractional pixel ratio, round would never match and
  // would resize (and clear) the drawing buffer every frame
  if (canvas.width !== Math.floor(w * pr) || canvas.height !== Math.floor(h * pr)) renderer.setSize(w, h, false);
  if (Math.abs(chase.camera.aspect - w / h) > 1e-6) {
    chase.camera.aspect = w / h;
    chase.camera.updateProjectionMatrix();
  }
}
fitToScreen();
$("version").textContent = `Wings ${APP_VERSION}`;

// ---- flight state ----
let card, place, ground, world, aircraft;
const cards = new Map(); // id → card JSON, in roster order
const models = new Map(); // id → loaded model (aircraft.js)
let sim = null, prev = null, startId = "high", assists = null;
let mode = "menu"; // menu | flying | paused | crashed
let ready = false; // the card, the place and the model have all loaded
let acc = 0;

const controls = createControls({
  onRestart: () => ready && mode !== "menu" && start(startId),
  onFlip: () => pause("Turned around"),
  onNeutral: recentered,
});
const powered = () => card.engines.length > 0;

// As in rage: when the tilt takes a new centre, the Recenter button and the screen say so.
let recenterTimer = null;
function recentered() {
  const b = $("b-recenter"), t = $("toast");
  b.textContent = "Recentered ✓";
  b.classList.add("done");
  t.hidden = false;
  t.classList.remove("show");
  void t.offsetWidth; // restart the fade
  t.classList.add("show");
  clearTimeout(recenterTimer);
  recenterTimer = setTimeout(() => { b.textContent = "Recenter"; b.classList.remove("done"); t.hidden = true; }, 1200);
}

function start(id) {
  if (id === "runway" && !powered()) id = "high"; // a glider has no runway start of its own
  startId = id;
  const pose = startPose(place, id);
  controls.reset();
  if (pose.onGround) {
    // at rest on its wheels (flight-model 11.7), throttle at idle; the trim set for the climb-out
    const rest = restingAttitude(card);
    const trim = handlingTrim(card, (card.json.speeds?.approach_kmh ?? 100) / 3.6);
    assists = createAssists(card, trim?.elevator ?? 0);
    sim = new Sim(card, {
      x: [pose.north, pose.east, -(pose.altitude + rest.height + 0.005)],
      v: [0, 0, 0],
      q: qfromEuler(0, rest.pitch, pose.heading),
      omega: [0, 0, 0],
    }, { ground });
  } else {
    // a glide, or with an engine level flight with the throttle that holds it
    const trim = handlingTrim(card, pose.speed, { altitude: pose.altitude });
    assists = createAssists(card, trim.elevator); // the trim starts where the start's flight needs it
    sim = new Sim(card, glideState(trim, pose.altitude, { heading: pose.heading, north: pose.north, east: pose.east }), { ground });
    if (powered()) controls.setLever(trim.throttle);
  }
  prev = sim.state;
  acc = 0;
  chase.reset();
  mode = "flying";
  show();
}

function pause(title = "Paused") {
  if (mode !== "flying") return;
  mode = "paused";
  message(title, "Hold the phone the way you'll fly, then resume: that becomes the centre.", "Resume");
}

function message(title, text, go) {
  $("message-title").textContent = title;
  $("message-text").textContent = text;
  $("message-go").textContent = go;
  show();
}

function show() {
  $("menu").hidden = mode !== "menu";
  $("message").hidden = mode !== "paused" && mode !== "crashed";
  for (const el of document.querySelectorAll("[data-paused]")) el.hidden = mode !== "paused";
  const flying = mode !== "menu";
  $("controls").hidden = !flying;
  $("hud").hidden = !flying || !settings.hud;
  $("debug").hidden = !flying || !settings.debug;
  $("b-hud").classList.toggle("on", settings.hud);
  $("b-debug").classList.toggle("on", settings.debug);
  for (const k of ["rudder", "trim", "level"]) $(`b-auto-${k}`).classList.toggle("on", settings.assists[k]);
  if (card) {
    $("b-flaps").hidden = !flying || !card.flaps.present;
    $("r-throttle").hidden = !flying || !powered();
    $("brakes").setAttribute("aria-label", powered() ? "Throttle" : "Speed brakes");
    for (const b of document.querySelectorAll("[data-start]")) b.hidden = b.dataset.start === "runway" && !powered();
  }
}

// ---- buttons ----
for (const b of document.querySelectorAll("[data-start]")) {
  b.addEventListener("click", () => {
    const ask = controls.tilt.request(); // first, inside the tap: iOS asks for motion permission now
    ask.then((ok) => {
      $("menu-status").textContent = ok ? "Tilt on" : "No tilt: use a gamepad or the keyboard";
    });
    if (ready) start(b.dataset.start);
  });
}
$("pause").addEventListener("click", () => pause());
$("b-flaps").addEventListener("click", () => controls.toggleFlaps());
$("b-restart").addEventListener("click", () => ready && start(startId));
$("b-recenter").addEventListener("click", () => controls.tilt.calibrate());
$("b-hud").addEventListener("click", () => { settings.hud = !settings.hud; saveSettings(); show(); });
$("b-debug").addEventListener("click", () => { settings.debug = !settings.debug; saveSettings(); show(); });
for (const k of ["rudder", "trim", "level"]) {
  $(`b-auto-${k}`).addEventListener("click", () => { settings.assists[k] = !settings.assists[k]; saveSettings(); show(); });
}
$("message-go").addEventListener("click", () => {
  if (mode === "crashed") return start(startId);
  controls.tilt.calibrate();
  mode = "flying";
  acc = 0;
  show();
});
$("message-menu").addEventListener("click", () => { mode = "menu"; show(); });

// The lever (docs/controls.md): the speed brakes on a glider, the throttle with an engine. A smooth
// slide that keeps its place when let go. The card says when the wheel brakes are on.
const brakeEl = $("brakes"), brakeTrack = brakeEl.querySelector(".track");
let brakeFinger = null;
function slide(e) {
  const r = brakeTrack.getBoundingClientRect();
  controls.setLever(1 - (e.clientY - r.top) / r.height);
}
brakeEl.addEventListener("pointerdown", (e) => {
  if (brakeFinger !== null) return;
  brakeFinger = e.pointerId;
  brakeEl.setPointerCapture(e.pointerId);
  slide(e);
  e.preventDefault();
});
brakeEl.addEventListener("pointermove", (e) => { if (e.pointerId === brakeFinger) slide(e); });
for (const t of ["pointerup", "pointercancel"]) brakeEl.addEventListener(t, (e) => { if (e.pointerId === brakeFinger) brakeFinger = null; });

// Drag on the view to look around; the camera eases back on release.
let drag = null;
$("view").addEventListener("pointerdown", (e) => { drag = { x: e.clientX, y: e.clientY, id: e.pointerId }; chase.setDragging(true); });
window.addEventListener("pointermove", (e) => {
  if (!drag || e.pointerId !== drag.id) return;
  chase.look(-(e.clientX - drag.x) * 0.006, (e.clientY - drag.y) * 0.004);
  drag.x = e.clientX;
  drag.y = e.clientY;
});
window.addEventListener("pointerup", (e) => { if (drag && e.pointerId === drag.id) { drag = null; chase.setDragging(false); } });

document.addEventListener("visibilitychange", () => { if (document.hidden) pause(); });

// ---- the loop ----
const pos = new THREE.Vector3(), quat = new THREE.Quaternion(), qa = new THREE.Quaternion(), qb = new THREE.Quaternion();
let last = null, fps = 60, frameMs = 16.7, stepsLast = 0;

function frame(now) {
  fitToScreen();
  const dt = last === null ? 0 : Math.min((now - last) / 1000, 0.25);
  last = now;
  if (dt > 0) { frameMs += (dt * 1000 - frameMs) * 0.05; fps = 1000 / frameMs; }
  if (!sim) { renderer.render(world.scene, chase.camera); return; }

  const ctl = controls.update(dt);
  // The assists move the controls as a pilot would (docs/controls.md); they never touch a force.
  const flown = assists ? assists.update(ctl, sim, sim.observe(ctl), mode === "flying" ? dt : 0, settings.assists) : { ...ctl };
  stepsLast = 0;
  if (mode === "flying") {
    acc += dt;
    while (acc >= DT && stepsLast < MAX_STEPS) {
      prev = sim.state;
      sim.step(flown);
      acc -= DT;
      stepsLast++;
    }
    if (stepsLast === MAX_STEPS) acc = Math.min(acc, DT);
    if (sim.crashed) {
      mode = "crashed";
      const c = sim.crashed;
      const what = c.point.replace("_", " ");
      message("Crashed", `The ${what} touched down at ${c.value.toFixed(1)} m/s (${c.reason}).`, "Fly again");
    }
  }

  // Interpolate between the last two states: lerp the position, slerp the attitude.
  const a = mode === "flying" ? acc / DT : 1;
  const s0 = prev, s1 = sim.state;
  const x = s0.x.map((v, i) => v + (s1.x[i] - v) * a);
  qa.set(s0.q[1], s0.q[2], s0.q[3], s0.q[0]);
  qb.set(s1.q[1], s1.q[2], s1.q[3], s1.q[0]);
  quat.slerpQuaternions(qa, qb, a);
  const q = [quat.w, quat.x, quat.y, quat.z];
  aircraft.setPose(x, q);
  aircraft.setControls(flown);
  aircraft.spin(mode === "flying" ? dt : 0, powered() ? flown.throttle : 0);

  pos.fromArray(nedToThree(x));
  chase.update(pos, aircraft.object.quaternion, dt, place.ground.height_m);
  const shadow = world.shadow(pos.toArray(), card.b, card.cbar);
  renderer.render(world.scene, chase.camera);

  if (settings.hud) {
    const f = format(readouts(sim, sim.observe(flown)));
    $("r-speed").textContent = f.speed;
    $("r-altitude").textContent = f.altitude;
    $("r-vs").textContent = f.vs;
  }
  brakeEl.querySelector(".thumb").style.top = `${(1 - controls.lever) * 100}%`;
  brakeEl.setAttribute("aria-valuenow", String(Math.round(controls.lever * 100)));
  if (powered()) $("r-throttle").textContent = String(Math.round(ctl.throttle * 100));
  if (card.flaps.present) {
    const deg = Math.round(ctl.flaps * card.flaps.deflection);
    const fb = $("b-flaps");
    fb.textContent = deg === 0 ? "Flaps up" : `Flaps ${deg}°`;
    fb.classList.toggle("down", controls.flapsSelected > 0);
  }
  if (settings.debug) {
    const info = renderer.info.render;
    const sh = shadow.visible ? `shadow ${shadow.w.toFixed(2)} m edge, ${shadow.radius.toFixed(1)} px` : "shadow off";
    $("debug").textContent = `${fps.toFixed(0)} fps · ${frameMs.toFixed(1)} ms · ${info.calls} draws · ${sh} · ${stepsLast} steps · ${controls.source}`;
  }
}

// ---- load ----
/** Fly this airplane: its card, its model (loaded once) and its livery; the menu's still view. */
async function choose(id) {
  // No start while the airplane changes: the new card, model, livery and controls go in together.
  const wasReady = ready;
  ready = false;
  enableStarts(false);
  try {
    const next = loadCard(cards.get(id));
    if (!models.has(id)) models.set(id, await loadAircraft(next.glb, next.cg));
    const model = models.get(id);
    const list = next.json.glb.liveries ?? [];
    const i = settings.livery[id] ?? 0;
    await model.setLivery(i > 0 ? list[i]?.texture ?? null : null);
    if (aircraft) world.scene.remove(aircraft.object);
    card = next;
    aircraft = model;
    world.scene.add(aircraft.object);
    settings.airplane = id;
    saveSettings();
    controls.configure({ lever: powered() ? "throttle" : "airbrake", flapTravel: card.flaps.present ? card.flaps.travel : null });
    // a still view of the field behind the menu
    sim = new Sim(card, glideState(handlingTrim(card, 95 / 3.6, { altitude: 60 }), 60, { north: -900 }), { ground });
    prev = sim.state;
    pickers();
    show();
  } finally {
    if (wasReady) {
      ready = true;
      enableStarts(true);
    }
  }
}

function enableStarts(on) {
  for (const b of document.querySelectorAll("[data-start]")) b.disabled = !on;
}

async function livery(i) {
  const list = card.json.glb.liveries ?? [];
  settings.livery[card.id] = i;
  saveSettings();
  await aircraft.setLivery(i > 0 ? list[i]?.texture ?? null : null);
  pickers();
}

/** The menu's airplane and livery buttons, the chosen ones lit. */
function pickers() {
  const row = (el, items, on, pick) => {
    el.replaceChildren(...items.map((name, i) => {
      const b = document.createElement("button");
      b.textContent = name;
      b.classList.toggle("on", i === on);
      b.addEventListener("click", () => pick(i));
      return b;
    }));
  };
  const ids = [...cards.keys()];
  row($("pick-airplane"), ids.map((id) => cards.get(id).name), ids.indexOf(card.id), (i) => ready && mode === "menu" && choose(ids[i]));
  const list = card.json.glb.liveries ?? [];
  row($("pick-livery"), list.map((l) => l.name), settings.livery[card.id] ?? 0, (i) => livery(i));
  $("menu-about").textContent = powered()
    ? "Hold the phone like a steering wheel: tilt the top edge toward you to pull, turn it to bank, and on the ground to steer. The slider on the left is the throttle; at idle, once the tailwheel is down, the wheel brakes are on."
    : "Hold the phone like a steering wheel: tilt the top edge toward you to pull, turn it to bank. The slider on the left is the speed brakes; on the ground, all the way up is the wheel brake too.";
}

Promise.all([getJSON("data/roster.json"), getJSON("data/places/test-grid.json"), getJSON("data/surfaces.json")])
  .then(async ([roster, placeJson, surfaces]) => {
    for (const id of roster.aircraft) cards.set(id, await getJSON(`data/aircraft/${id}.json`));
    place = placeJson;
    ground = makeGround(place, surfaces);
    world = createWorld(renderer, place);
    await choose(cards.has(settings.airplane) ? settings.airplane : roster.aircraft[0]);
    ready = true; // only now may a start begin: nothing after this replaces the flight
    enableStarts(true);
    $("menu-status").textContent = "Choose a start. The first tap asks for motion access.";
    renderer.setAnimationLoop(frame);
  })
  .catch((err) => {
    console.error(err);
    $("menu-status").textContent = `Couldn't load: ${err.message}`;
  });

show();

if ("serviceWorker" in navigator) {
  const hadController = Boolean(navigator.serviceWorker.controller);
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (hadController && mode !== "flying") window.location.reload(); // a new version took over: load it
  });
  navigator.serviceWorker.register("sw.js").catch((err) => console.warn("service worker:", err));
}
