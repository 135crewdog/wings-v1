// Wings, M2: first flight. The composition root: loads the card and the place, runs the sim at a
// fixed 1/120 s from an accumulator, and draws an interpolated frame. No physics here: the sim is
// src/sim/, the ground src/world/, the frames src/render/frames.js.

import * as THREE from "three";
import { APP_VERSION } from "./version.js";
import { loadCard } from "./sim/card.js";
import { DT, Sim } from "./sim/sim.js";
import { glide, glideState } from "./sim/trim.js";
import { makeGround, startPose } from "./world/ground.js";
import { nedToThree } from "./render/frames.js";
import { createWorld } from "./render/world.js";
import { loadAircraft } from "./render/aircraft.js";
import { createChaseCamera } from "./render/camera.js";
import { createControls } from "./input/controls.js";
import { format, readouts } from "./ui/readouts.js";

const MAX_STEPS = 10; // per frame; past that the sim falls behind rather than spiralling
const $ = (id) => document.getElementById(id);
const getJSON = (path) => fetch(path).then((r) => (r.ok ? r.json() : Promise.reject(new Error(`${path}: ${r.status}`))));

// ---- settings, kept per device ----
const settings = { hud: true, units: "us", debug: false };
try { Object.assign(settings, JSON.parse(localStorage.getItem("wings.settings") || "{}")); } catch {}
const saveSettings = () => { try { localStorage.setItem("wings.settings", JSON.stringify(settings)); } catch {} };

// ---- renderer ----
const renderer = new THREE.WebGLRenderer({ canvas: $("view"), antialias: true, powerPreference: "high-performance" });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
const chase = createChaseCamera(1);
function resize() {
  renderer.setSize(window.innerWidth, window.innerHeight, false);
  chase.camera.aspect = window.innerWidth / window.innerHeight;
  chase.camera.updateProjectionMatrix();
}
window.addEventListener("resize", resize);
resize();
$("version").textContent = `Wings ${APP_VERSION}`;

// ---- flight state ----
let card, place, ground, world, aircraft;
let sim = null, prev = null, startId = "high", trimElevator = 0;
let mode = "menu"; // menu | flying | paused | crashed
let ready = false; // the card, the place and the model have all loaded
let acc = 0;

const controls = createControls({ onRestart: () => ready && mode !== "menu" && start(startId), onFlip: () => pause("Turned around") });

function start(id) {
  startId = id;
  const pose = startPose(place, id);
  const trim = glide(card, pose.speed, { altitude: pose.altitude });
  trimElevator = trim.elevator; // the trim lever: the stick adds to it (docs/controls.md)
  sim = new Sim(card, glideState(trim, pose.altitude, { heading: pose.heading, north: pose.north, east: pose.east }), { ground });
  prev = sim.state;
  acc = 0;
  controls.setAirbrake(0);
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
  $("b-units").textContent = settings.units === "us" ? "kt · ft" : "km/h · m";
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
$("b-restart").addEventListener("click", () => ready && start(startId));
$("b-recenter").addEventListener("click", () => controls.tilt.calibrate());
$("b-hud").addEventListener("click", () => { settings.hud = !settings.hud; saveSettings(); show(); });
$("b-debug").addEventListener("click", () => { settings.debug = !settings.debug; saveSettings(); show(); });
$("b-units").addEventListener("click", () => { settings.units = settings.units === "us" ? "metric" : "us"; saveSettings(); show(); });
$("message-go").addEventListener("click", () => {
  if (mode === "crashed") return start(startId);
  controls.tilt.calibrate();
  mode = "flying";
  acc = 0;
  show();
});
$("message-menu").addEventListener("click", () => { mode = "menu"; show(); });

// The speed brake slider (docs/controls.md): bottom is closed, top is fully open, and past the mark
// near the top the wheel brake works too. It keeps its place when let go.
const brakeEl = $("brakes"), brakeTrack = brakeEl.querySelector(".track");
let brakeFinger = null;
function slide(e) {
  const r = brakeTrack.getBoundingClientRect();
  controls.setAirbrake(1 - (e.clientY - r.top) / r.height);
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
  const dt = last === null ? 0 : Math.min((now - last) / 1000, 0.25);
  last = now;
  if (dt > 0) { frameMs += (dt * 1000 - frameMs) * 0.05; fps = 1000 / frameMs; }
  if (!sim) { renderer.render(world.scene, chase.camera); return; }

  const ctl = controls.update(dt);
  const flown = { ...ctl, elevator: Math.max(-1, Math.min(1, trimElevator + ctl.elevator)) };
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

  pos.fromArray(nedToThree(x));
  chase.update(pos, aircraft.object.quaternion, dt, place.ground.height_m);
  const heading = Math.atan2(2 * (q[0] * q[3] + q[1] * q[2]), 1 - 2 * (q[2] * q[2] + q[3] * q[3]));
  world.shadow(pos.toArray(), heading, -x[2] - place.ground.height_m);
  renderer.render(world.scene, chase.camera);

  if (settings.hud) {
    const f = format(readouts(sim, sim.observe(flown)), settings.units);
    $("r-speed").textContent = f.speed;
    $("r-altitude").textContent = f.altitude;
    $("r-vs").textContent = f.vs;
    $("r-heading").textContent = `HDG ${f.heading}`;
    $("r-g").textContent = f.g;
    $("r-alpha").textContent = f.alpha;
  }
  brakeEl.querySelector(".thumb").style.top = `${(1 - ctl.airbrake) * 100}%`;
  brakeEl.classList.toggle("wheel", ctl.airbrake > card.wheelBrakeFrom);
  brakeEl.setAttribute("aria-valuenow", String(Math.round(ctl.airbrake * 100)));
  if (settings.debug) {
    const info = renderer.info.render;
    $("debug").textContent = `${fps.toFixed(0)} fps · ${frameMs.toFixed(1)} ms · ${info.calls} draws · ${stepsLast} steps · ${controls.source}`;
  }
}

// ---- load ----
Promise.all([getJSON("data/aircraft/twin-ii-acro.json"), getJSON("data/places/test-grid.json"), getJSON("data/surfaces.json")])
  .then(async ([cardJson, placeJson, surfaces]) => {
    card = loadCard(cardJson);
    place = placeJson;
    ground = makeGround(place, surfaces);
    world = createWorld(renderer, place);
    aircraft = await loadAircraft(card.glb, card.cg);
    world.scene.add(aircraft.object);
    brakeEl.querySelector(".mark").style.top = `${(1 - card.wheelBrakeFrom) * 100}%`;
    // a still view of the field behind the menu
    sim = new Sim(card, glideState(glide(card, 95 / 3.6, { altitude: 60 }), 60, { north: -900 }), { ground });
    prev = sim.state;
    ready = true; // only now may a start begin: nothing after this replaces the flight
    for (const b of document.querySelectorAll("[data-start]")) b.disabled = false;
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
