// Renders the app icon from the Twin II Acro model: the glider in a gentle banked turn against an
// evening sky. Runs in a browser (tools/icon/index.html); returns PNG data URLs per size.
// The look lives in VIEW and paintSky; change them, re-render, and replace icons/.

import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

const MODEL = new URL("../../assets/models/twin-ii-acro.glb", import.meta.url).href;
const MASTER = 1024; // the composed icon; every size is scaled down from it
const RENDER = 2048; // the glider is rendered at twice the master size, then scaled down

// Camera and attitude. Model axes: metres, Y up, nose toward −Z.
export const VIEW = {
  heading: 140, // degrees about the vertical: 180 is nose toward the camera; less turns it to the left
  pitch: 6, // degrees, nose up
  bank: -30, // degrees; negative lifts the right wing and shows the camera the top of the wing
  elevation: 22, // camera above the glider's level, degrees
  azimuth: 0, // camera around the glider, degrees
  fov: 55, // wide enough for some perspective: the near wing and the canopy loom
  fill: 1.08, // the silhouette's larger side as a fraction of the icon; over 1 crops the wingtips
  offset: [0.0, 0.0], // shift of the glider's centre, fraction of the icon (x right, y down)
  sun: [0.86, 0.13], // the sun's glow, fraction of the icon (x right, y down)
  clouds: true, // a soft bank of cloud tops low in the frame
};

let model = null;

async function loadModel() {
  if (model) return model;
  const gltf = await new GLTFLoader().loadAsync(MODEL);
  model = gltf.scene;
  model.traverse((o) => {
    if (o.isMesh) {
      o.material.side = THREE.FrontSide;
      if (o.material.map) o.material.map.anisotropy = 8;
    }
  });
  return model;
}

/** The sky behind the glider: deep blue overhead, warm haze low down, the sun's glow upper right. */
function paintSky(g, n, view) {
  const sky = g.createLinearGradient(0, 0, 0, n);
  sky.addColorStop(0.0, "#123f7a");
  sky.addColorStop(0.45, "#2f78bf");
  sky.addColorStop(0.78, "#8fbfe3");
  sky.addColorStop(1.0, "#f3d7a6");
  g.fillStyle = sky;
  g.fillRect(0, 0, n, n);

  // The sun: a bright core and a tight warm halo, added as light so the blue stays blue around it.
  const [sx, sy] = view.sun;
  g.globalCompositeOperation = "lighter";
  const halo = g.createRadialGradient(n * sx, n * sy, 0, n * sx, n * sy, n * 0.32);
  halo.addColorStop(0.0, "rgba(255, 236, 190, 0.55)");
  halo.addColorStop(0.25, "rgba(255, 214, 150, 0.22)");
  halo.addColorStop(1.0, "rgba(255, 200, 130, 0)");
  g.fillStyle = halo;
  g.fillRect(0, 0, n, n);
  g.globalCompositeOperation = "source-over";
  const core = g.createRadialGradient(n * sx, n * sy, 0, n * sx, n * sy, n * 0.06);
  core.addColorStop(0.0, "rgba(255, 255, 250, 1)");
  core.addColorStop(0.55, "rgba(255, 250, 230, 0.95)");
  core.addColorStop(1.0, "rgba(255, 240, 200, 0)");
  g.fillStyle = core;
  g.fillRect(0, 0, n, n);
  if (view.clouds) paintClouds(g, n);
}

/** A bank of cloud tops low in the frame, lit from the sun's side. Fixed, not random. */
function paintClouds(g, n) {
  // A small deterministic generator, so the clouds are the same on every render.
  let seed = 7;
  const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);

  // Each layer is one silhouette (a union of circles) filled with one vertical gradient, so the
  // outline is cauliflower-like but the body reads as a single mass, not as separate balls.
  const layers = [
    // top of the layer, puff radius, colours top → bottom, edge softness: back layer hazier
    { top: 0.87, r: 0.035, colours: ["#e9eef2", "#d9dde0"], blur: 2.5 },
    { top: 0.9, r: 0.05, colours: ["#fbf6ee", "#e8d9c6"], blur: 1.5 },
  ];
  for (const L of layers) {
    const shape = new Path2D();
    for (let x = -0.05; x < 1.08; x += L.r * (0.7 + 0.6 * rand())) {
      const r = L.r * (0.6 + 0.9 * rand());
      const y = L.top + r * (0.9 + 0.8 * rand());
      shape.moveTo(n * (x + r), n * y);
      shape.arc(n * x, n * y, n * r, 0, Math.PI * 2);
    }
    shape.rect(0, n * (L.top + L.r * 1.6), n, n);
    const fill = g.createLinearGradient(0, n * L.top, 0, n);
    fill.addColorStop(0, L.colours[0]);
    fill.addColorStop(1, L.colours[1]);
    g.save();
    g.filter = `blur(${(L.blur * n) / 1024}px)`;
    g.fillStyle = fill;
    g.fill(shape);
    g.restore();
  }
  // Sun-side highlights along the front layer's tops.
  seed = 11;
  g.save();
  g.filter = `blur(${(3 * n) / 1024}px)`;
  for (let x = 0; x < 1.05; x += 0.07 + 0.05 * rand()) {
    const r = 0.03 + 0.03 * rand();
    const hl = g.createRadialGradient(n * (x + r * 0.3), n * (0.915 - r * 0.2), 0, n * x, n * 0.93, n * r * 1.4);
    hl.addColorStop(0, "rgba(255, 255, 252, 0.7)");
    hl.addColorStop(1, "rgba(255, 255, 252, 0)");
    g.fillStyle = hl;
    g.fillRect(n * (x - r * 1.5), n * (0.93 - r * 1.5), n * r * 3, n * r * 3);
  }
  g.restore();
}

/** The glider alone on a transparent canvas, framed to fill `view.fill` of the square. */
async function renderGlider(view) {
  const glider = (await loadModel()).clone();
  const deg = THREE.MathUtils.degToRad;

  // Attitude: heading about Y, then pitch about X, then bank about the nose axis (−Z).
  const holder = new THREE.Group();
  holder.add(glider);
  const box0 = new THREE.Box3().setFromObject(glider);
  glider.position.sub(box0.getCenter(new THREE.Vector3()));
  holder.rotation.order = "YXZ";
  holder.rotation.set(deg(view.pitch), deg(view.heading), deg(-view.bank));

  const scene = new THREE.Scene();
  scene.add(holder);
  scene.add(new THREE.HemisphereLight(0xcfe6ff, 0x6b5a45, 1.4));
  const sunLight = new THREE.DirectionalLight(0xfff1dc, 3.2);
  sunLight.position.set(6, 9, -4); // upper right, slightly ahead: matches the painted sun
  scene.add(sunLight);
  const rim = new THREE.DirectionalLight(0xbfd8ff, 0.8);
  rim.position.set(-8, 2, 6);
  scene.add(rim);

  const camera = new THREE.PerspectiveCamera(view.fov, 1, 0.1, 200);
  const r = 40;
  camera.position.set(
    r * Math.cos(deg(view.elevation)) * Math.sin(deg(view.azimuth)),
    r * Math.sin(deg(view.elevation)),
    r * Math.cos(deg(view.elevation)) * Math.cos(deg(view.azimuth))
  );
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld();

  // Frame: project every vertex, then zoom and shift so the glider's silhouette is centred and its
  // larger side fills `view.fill` of the square.
  scene.updateMatrixWorld(true);
  const lo = [Infinity, Infinity], hi = [-Infinity, -Infinity], p = new THREE.Vector3();
  holder.traverse((o) => {
    if (!o.isMesh) return;
    const pos = o.geometry.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      p.fromBufferAttribute(pos, i).applyMatrix4(o.matrixWorld).project(camera);
      lo[0] = Math.min(lo[0], p.x); lo[1] = Math.min(lo[1], p.y);
      hi[0] = Math.max(hi[0], p.x); hi[1] = Math.max(hi[1], p.y);
    }
  });
  const zoom = (2 * view.fill) / Math.max(hi[0] - lo[0], hi[1] - lo[1]);
  camera.zoom = zoom;
  // Centre of the silhouette in NDC after zooming, converted to pixels of the render.
  const cx = ((lo[0] + hi[0]) / 2) * zoom, cy = ((lo[1] + hi[1]) / 2) * zoom;
  const shiftX = (cx / 2) * RENDER - view.offset[0] * RENDER;
  const shiftY = (-cy / 2) * RENDER - view.offset[1] * RENDER;
  camera.setViewOffset(RENDER, RENDER, shiftX, shiftY, RENDER, RENDER);
  camera.updateProjectionMatrix();

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(1);
  renderer.setSize(RENDER, RENDER, false);
  renderer.setClearColor(0x000000, 0);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.render(scene, camera);
  const out = document.createElement("canvas");
  out.width = out.height = RENDER;
  out.getContext("2d").drawImage(renderer.domElement, 0, 0);
  renderer.dispose();
  return out;
}

/** Scales a canvas down by halving steps (sharp, without aliasing), ending at exactly `size`. */
function downscale(src, size) {
  let cur = src;
  while (cur.width / 2 >= size) {
    const half = document.createElement("canvas");
    half.width = half.height = cur.width / 2;
    const g = half.getContext("2d");
    g.imageSmoothingQuality = "high";
    g.drawImage(cur, 0, 0, half.width, half.height);
    cur = half;
  }
  if (cur.width === size) return cur;
  const out = document.createElement("canvas");
  out.width = out.height = size;
  const g = out.getContext("2d");
  g.imageSmoothingQuality = "high";
  g.drawImage(cur, 0, 0, size, size);
  return out;
}

/** The icon at each size, as PNG data URLs: { 1024: "data:…", 512: …, 192: …, 180: … }. */
export async function renderIcons(view = VIEW, sizes = [1024, 512, 192, 180]) {
  const master = document.createElement("canvas");
  master.width = master.height = MASTER;
  const g = master.getContext("2d");
  const v = { ...VIEW, ...view };
  paintSky(g, MASTER, v);
  g.imageSmoothingQuality = "high";
  g.drawImage(downscale(await renderGlider(v), MASTER), 0, 0);
  const out = {};
  for (const s of sizes) out[s] = downscale(master, s).toDataURL("image/png");
  return out;
}
