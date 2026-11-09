// The airplane on screen: the card's .glb, placed from the sim state, its moving parts driven by
// the controls through their glTF extras (surfaces.js).

import * as THREE from "three";

// The propeller drawn turning: a visual rate, not the engine's (2,700 rpm would strobe at 60 fps).
const PROP_VISUAL = { idle: 4, full: 11 }; // revolutions per second at idle and at full throttle
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { modelPose } from "./frames.js";
import { surfacePositions } from "./surfaces.js";

export async function loadAircraft(url, cg) {
  const gltf = await new GLTFLoader().loadAsync(url);
  const root = gltf.scene;
  root.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = false; } });
  const parts = {}; // name → { node, extras, rest position, rest quaternion }
  const spinners = []; // propellers: { node, axis, rest quaternion }
  root.traverse((o) => {
    const x = o.userData;
    if (x && (x.kind === "hinge" || x.kind === "slide")) {
      parts[o.name] = { node: o, extras: x, position: o.position.clone(), quaternion: o.quaternion.clone() };
    } else if (x && x.kind === "spin") {
      spinners.push({ node: o, axis: new THREE.Vector3(...x.axis), quaternion: o.quaternion.clone(), angle: 0 });
    }
  });
  // the livery: the first is the texture inside the model; others are loaded and swapped in
  let material = null;
  root.traverse((o) => { if (o.isMesh && !material) material = o.material; });
  const ownMap = material?.map ?? null;
  const loader = new THREE.TextureLoader();
  const textures = new Map();
  const extras = Object.fromEntries(Object.entries(parts).map(([n, p]) => [n, p.extras]));
  const axis = new THREE.Vector3(), turn = new THREE.Quaternion();

  return {
    object: root,
    parts: Object.keys(parts),
    /** Place the model from an interpolated NED position x and attitude q. */
    setPose(x, q) {
      const { position, quaternion } = modelPose(x, q, cg);
      root.position.set(...position);
      root.quaternion.set(...quaternion);
    },
    /** The livery: null for the model's own, or a texture's URL. */
    async setLivery(url) {
      if (!material) return;
      let map = ownMap;
      if (url) {
        if (!textures.has(url)) {
          const t = await loader.loadAsync(url);
          t.flipY = false;
          t.colorSpace = THREE.SRGBColorSpace;
          if (ownMap) { t.wrapS = ownMap.wrapS; t.wrapT = ownMap.wrapT; t.anisotropy = ownMap.anisotropy; }
          textures.set(url, t);
        }
        map = textures.get(url);
      }
      material.map = map;
      material.needsUpdate = true;
    },
    /** Turn the propellers for dt seconds at the throttle's setting. */
    spin(dt, throttle) {
      const rps = PROP_VISUAL.idle + (PROP_VISUAL.full - PROP_VISUAL.idle) * throttle;
      for (const s of spinners) {
        s.angle = (s.angle + 2 * Math.PI * rps * dt) % (2 * Math.PI);
        turn.setFromAxisAngle(s.axis, s.angle);
        s.node.quaternion.copy(s.quaternion).multiply(turn);
      }
    },
    /** Move the control surfaces, flaps and airbrakes for the controls. */
    setControls(controls) {
      const pos = surfacePositions(controls, extras);
      for (const [name, p] of Object.entries(parts)) {
        const v = pos[name];
        if (!v) continue;
        axis.fromArray(p.extras.axis);
        if (v.deg !== undefined) {
          turn.setFromAxisAngle(axis, THREE.MathUtils.degToRad(v.deg));
          p.node.quaternion.copy(p.quaternion).multiply(turn);
        } else {
          p.node.position.copy(p.position).addScaledVector(axis, v.slide_m);
        }
      }
    },
  };
}
