// Renders the app icon from the Twin II Acro model: the glider on a plain blue gradient. Runs in a browser (tools/icon/index.html); returns PNG data URLs per size.
// The look lives in VIEW (pose, framing, gradient); change it, re-render, and replace icons/.

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
  sky: ["#0b3d91", "#4fa3e8"], // gradient colours, top to bottom
  angle: 0, // gradient tilt, degrees (0: straight down)
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

/** The background: one blue gradient, `view.sky` from top to bottom, tilted by `view.angle` degrees. */
function paintSky(g, n, view) {
  const t = (view.angle * Math.PI) / 180;
  const dx = (Math.sin(t) * n) / 2, dy = (Math.cos(t) * n) / 2;
  const sky = g.createLinearGradient(n / 2 - dx, n / 2 - dy, n / 2 + dx, n / 2 + dy);
  view.sky.forEach((c, i) => sky.addColorStop(i / (view.sky.length - 1), c));
  g.fillStyle = sky;
  g.fillRect(0, 0, n, n);
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
  sunLight.position.set(6, 9, -4); // upper right, slightly ahead
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
