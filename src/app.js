// M0 shell: a full-screen Three.js scene with a sky, a ground grid and the version in a corner.
// Its only job is to prove the pipeline (push, test, deploy, install, run) works on the phone.

import * as THREE from "three";
import { APP_VERSION } from "./version.js";

const SKY = 0x87b9e8;
const GROUND_SIZE = 8000; // m

const canvas = document.getElementById("view");
document.getElementById("version").textContent = `Wings ${APP_VERSION} · three r${THREE.REVISION}`;

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

const scene = new THREE.Scene();
scene.background = new THREE.Color(SKY);

const camera = new THREE.PerspectiveCamera(60, 1, 0.5, 5000);

// The ground is one plane with a tiled grid texture: a 20 m square per tile, drawn on a canvas.
function gridTexture() {
  const size = 128, c = document.createElement("canvas");
  c.width = c.height = size;
  const g = c.getContext("2d");
  g.fillStyle = "#6f8f4e";
  g.fillRect(0, 0, size, size);
  g.fillStyle = "rgba(255, 255, 255, 0.75)";
  g.fillRect(0, 0, size, 3);
  g.fillRect(0, 0, 3, size);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(GROUND_SIZE / 20, GROUND_SIZE / 20);
  tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(GROUND_SIZE, GROUND_SIZE),
  new THREE.MeshBasicMaterial({ map: gridTexture() })
);
ground.rotation.x = -Math.PI / 2;
scene.add(ground);

function resize() {
  const w = window.innerWidth, h = window.innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
window.addEventListener("resize", resize);
resize();

// A slow circle over the grid, so a frozen frame is easy to spot.
renderer.setAnimationLoop((ms) => {
  const t = ms / 1000;
  const heading = 0.05 * t;
  camera.position.set(300 * Math.sin(heading), 25, 300 * Math.cos(heading));
  camera.lookAt(300 * Math.sin(heading + 0.3), 15, 300 * Math.cos(heading + 0.3));
  renderer.render(scene, camera);
});

if ("serviceWorker" in navigator) {
  const hadController = Boolean(navigator.serviceWorker.controller);
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (hadController) window.location.reload(); // a new version took over: load it
  });
  navigator.serviceWorker.register("sw.js").catch((err) => console.warn("service worker:", err));
}
