// The airplane on screen: the card's .glb, placed from the sim state, its moving parts driven by
// the controls through their glTF extras (surfaces.js).

import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { modelPose } from "./frames.js";
import { surfacePositions } from "./surfaces.js";

export async function loadAircraft(url, cg) {
  const gltf = await new GLTFLoader().loadAsync(url);
  const root = gltf.scene;
  const parts = {}; // name → { node, extras, rest position, rest quaternion }
  root.traverse((o) => {
    const x = o.userData;
    if (x && (x.kind === "hinge" || x.kind === "slide")) {
      parts[o.name] = { node: o, extras: x, position: o.position.clone(), quaternion: o.quaternion.clone() };
    }
  });
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
    /** Move the control surfaces and airbrakes for the controls. */
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
