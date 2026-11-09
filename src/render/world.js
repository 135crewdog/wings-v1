// The test world on screen: sky, a gridded ground, the runway with its markings, and a soft shadow
// under the glider. Positions come in Three.js axes (frames.js converted them).

import * as THREE from "three";
import { nedToThree } from "./frames.js";
import { SUN } from "./sun.js";
import { groundSpot, peakCover, penumbra, shadowFrame, slantDistance, SHADOW_GONE } from "./shadow-math.js";

const SHADOW_MAP = 1024; // texels across the shadow camera's box

// Three's PCF shadow averages 5 samples over its blur disc; 16 keep a wide, soft edge smooth.
// The samples are Vogel-disk points, spread evenly over the disc's area: their average is the
// fraction of the sun's disc the airplane hides (shadow-math.js).
const FIVE = `shadow = (
					texture( shadowMap, vec3( shadowCoord.xy + vogelDiskSample( 0, 5, phi ) * radius, shadowCoord.z ) ) +
					texture( shadowMap, vec3( shadowCoord.xy + vogelDiskSample( 1, 5, phi ) * radius, shadowCoord.z ) ) +
					texture( shadowMap, vec3( shadowCoord.xy + vogelDiskSample( 2, 5, phi ) * radius, shadowCoord.z ) ) +
					texture( shadowMap, vec3( shadowCoord.xy + vogelDiskSample( 3, 5, phi ) * radius, shadowCoord.z ) ) +
					texture( shadowMap, vec3( shadowCoord.xy + vogelDiskSample( 4, 5, phi ) * radius, shadowCoord.z ) )
				) * 0.2;`;
const SIXTEEN = `shadow = 0.0;
				for ( int k = 0; k < 16; k ++ ) {
					shadow += texture( shadowMap, vec3( shadowCoord.xy + vogelDiskSample( k, 16, phi ) * radius, shadowCoord.z ) );
				}
				shadow *= 0.0625;`;
if (!THREE.ShaderChunk.shadowmap_pars_fragment.includes(FIVE)) throw new Error("Three's PCF shadow code changed: update world.js");
THREE.ShaderChunk.shadowmap_pars_fragment = THREE.ShaderChunk.shadowmap_pars_fragment.replace(FIVE, SIXTEEN);

const SKY = 0x8fbfe6;
const GROUND_SIZE = 60000; // m, far beyond what can be seen from 1,000 m in the haze
const TILE = 20; // m per grid square

function canvasTexture(w, h, draw, renderer, repeat = [1, 1]) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  draw(c.getContext("2d"), w, h);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
  if (repeat[0] !== 1 || repeat[1] !== 1) {
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(...repeat);
  }
  return tex;
}

function grassTexture(renderer) {
  return canvasTexture(128, 128, (g, w, h) => {
    g.fillStyle = "#6f8f4e";
    g.fillRect(0, 0, w, h);
    g.fillStyle = "rgba(255, 255, 255, 0.55)";
    g.fillRect(0, 0, w, 2);
    g.fillRect(0, 0, 2, h);
  }, renderer, [GROUND_SIZE / TILE, GROUND_SIZE / TILE]);
}

/** The runway's surface and markings, drawn once: asphalt, edges, centreline, thresholds, numbers. */
function runwayTexture(rw, renderer) {
  const pxPerM = 4; // across; along is a quarter of that, to keep the canvas a sane size
  const W = Math.round(rw.width_m * pxPerM), H = 4096;
  const along = H / rw.length_m; // px per metre along
  return canvasTexture(W, H, (g) => {
    g.fillStyle = "#45484c";
    g.fillRect(0, 0, W, H);
    g.fillStyle = "#eef0f2";
    const m = (x) => x * pxPerM;
    g.fillRect(m(0.6), 0, m(0.9), H); // edge lines
    g.fillRect(W - m(1.5), 0, m(0.9), H);
    // threshold bars, eight across, 30 m long, at both ends (top of the canvas is the far end)
    const bars = 8, barW = (rw.width_m - 6) / (2 * bars - 1);
    for (const y0 of [m(0) + 6 * along, H - 36 * along]) {
      for (let i = 0; i < bars; i++) g.fillRect(m(3 + 2 * i * barW), y0, m(barW), 30 * along);
    }
    // centreline: 30 m dashes, 20 m gaps, between the numbers
    for (let s = 90; s < rw.length_m - 90; s += 50) g.fillRect(W / 2 - m(0.45), s * along, m(0.9), 30 * along);
    // runway numbers, read from the approach end
    const [a, b] = rw.name.split("/");
    g.font = `bold ${Math.round(18 * along)}px sans-serif`;
    g.textAlign = "center";
    g.save();
    g.translate(W / 2, H - 42 * along);
    g.scale(1, 1);
    g.fillText(b, 0, 0); // landing toward the far end: the near number is the runway's heading
    g.restore();
    g.save();
    g.translate(W / 2, 42 * along);
    g.rotate(Math.PI);
    g.fillText(a, 0, 0);
    g.restore();
  }, renderer);
}

export function createWorld(renderer, place) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(SKY);
  scene.fog = new THREE.Fog(SKY, 3000, 22000);

  scene.add(new THREE.HemisphereLight(0xdfefff, 0x55603f, 1.5));
  // The sun casts the airplane's real shadow: its own mesh, through a shadow map. The shadow camera
  // is a tight box re-centred every frame where the shadow falls (shadow()), so a small map stays
  // sharp at any height and anywhere in the world. Only the airplane casts.
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  const sun = new THREE.DirectionalLight(0xfff3e0, 2.6);
  sun.position.set(...SUN.toward);
  sun.castShadow = true;
  sun.shadow.mapSize.set(SHADOW_MAP, SHADOW_MAP);
  sun.shadow.bias = 0; // the ground receives and never casts; the airplane casts and never receives
  scene.add(sun, sun.target);

  const height = place.ground.height_m;
  // The flat layers (ground, runway, shadow) don't write depth and draw first, in that order, so they
  // can never fight over which is in front: at a shallow angle a few centimetres apart, the depth
  // buffer can't tell them apart and the runway shimmers. Nothing is ever below the ground.
  const flat = (material, order, mesh) => {
    material.depthWrite = false;
    mesh.renderOrder = order;
    return mesh;
  };
  const grass = new THREE.MeshLambertMaterial({ map: grassTexture(renderer) });
  const groundMesh = flat(grass, -3, new THREE.Mesh(new THREE.PlaneGeometry(GROUND_SIZE, GROUND_SIZE), grass));
  groundMesh.rotation.x = -Math.PI / 2;
  groundMesh.position.y = height;
  groundMesh.receiveShadow = true;
  scene.add(groundMesh);

  for (const rw of place.runways) {
    const asphalt = new THREE.MeshLambertMaterial({ map: runwayTexture(rw, renderer) });
    const mesh = flat(asphalt, -2, new THREE.Mesh(new THREE.PlaneGeometry(rw.width_m, rw.length_m), asphalt));
    mesh.rotation.x = -Math.PI / 2; // the plane's +y (top of the texture) now points north (−z)
    mesh.rotation.z = (-rw.heading_deg * Math.PI) / 180;
    const c = nedToThree([rw.centre_m[0], rw.centre_m[1], -height]);
    mesh.position.set(c[0], c[1], c[2]);
    mesh.receiveShadow = true;
    scene.add(mesh);
  }

  return {
    scene,
    /**
     * Aim the sun's shadow at the airplane: `cg` in Three axes, `size` its span (m), `chord` its mean
     * chord (m). The edge blurs by the sun's disc at the distance to the ground; when the airplane
     * can no longer hide enough of the sun to be seen, the shadow pass stops.
     */
    shadow(cg, size, chord) {
      const d = slantDistance(cg[1] - height, SUN.toward);
      const w = penumbra(d, SUN.angularDiameter);
      const visible = peakCover(chord, size, w) >= SHADOW_GONE;
      renderer.shadowMap.autoUpdate = visible;
      sun.shadow.intensity = visible ? 1 : 0;
      if (!visible) return { d, w, visible };
      const spot = groundSpot(cg, SUN.toward, height);
      const f = shadowFrame(size, w, SHADOW_MAP);
      sun.target.position.set(...spot);
      const back = d + size + 20; // the light sits beyond the airplane, along the sun's rays
      sun.position.set(spot[0] + SUN.toward[0] * back, spot[1] + SUN.toward[1] * back, spot[2] + SUN.toward[2] * back);
      const cam = sun.shadow.camera;
      cam.left = -f.half; cam.right = f.half; cam.top = f.half; cam.bottom = -f.half;
      cam.near = 1;
      cam.far = back + 10;
      cam.updateProjectionMatrix();
      sun.shadow.radius = Math.max(1, f.radius);
      return { d, w, visible, radius: f.radius, half: f.half };
    },
  };
}
