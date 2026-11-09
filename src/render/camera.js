// The chase camera: behind and above the glider, following its heading and pitch smoothly rather
// than copying every twitch. Dragging on the screen looks around; it eases back when you let go.

import * as THREE from "three";

const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const ease = (dt, tau) => 1 - Math.exp(-dt / tau);

export function createChaseCamera(aspect) {
  const camera = new THREE.PerspectiveCamera(55, aspect, 0.3, 30000);
  const DIST = 24, RISE = 4.5, LOOK_UP = 4.0; // look above the glider: it sits low in the frame, the way ahead clear
  let heading = null, pitch = 0; // smoothed
  let lookYaw = 0, lookPitch = 0, dragging = false;
  const fwd = new THREE.Vector3();

  return {
    camera,
    /** Look-around by dragging: radians to add while the finger is down. */
    look(dYaw, dPitch) {
      lookYaw = wrap(lookYaw + dYaw);
      lookPitch = Math.max(-1.2, Math.min(1.2, lookPitch + dPitch));
    },
    setDragging(on) {
      dragging = on;
    },
    reset() {
      heading = null;
      lookYaw = lookPitch = 0;
    },
    /** Follow the model at `target` (Three axes) with orientation `quaternion`, after dt seconds. */
    update(target, quaternion, dt, groundY) {
      fwd.set(0, 0, -1).applyQuaternion(quaternion);
      const h = Math.atan2(fwd.x, -fwd.z), p = Math.asin(Math.max(-1, Math.min(1, fwd.y)));
      if (heading === null) { heading = h; pitch = p; }
      heading = wrap(heading + wrap(h - heading) * ease(dt, 0.5));
      pitch += (p * 0.6 - pitch) * ease(dt, 0.7); // follow most of the pitch, not all of it
      if (!dragging) {
        lookYaw *= 1 - ease(dt, 0.6);
        lookPitch *= 1 - ease(dt, 0.6);
      }
      const yaw = heading + lookYaw, tilt = pitch - 0.12 + lookPitch;
      const back = new THREE.Vector3(-Math.sin(yaw) * Math.cos(tilt), -Math.sin(tilt), Math.cos(yaw) * Math.cos(tilt));
      camera.position.copy(target).addScaledVector(back, DIST);
      camera.position.y += RISE;
      camera.position.y = Math.max(camera.position.y, groundY + 1.2);
      camera.lookAt(target.x, target.y + LOOK_UP, target.z);
    },
  };
}
