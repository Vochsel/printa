import * as THREE from "three";
import type { OrbitControls } from "three/addons/controls/OrbitControls.js";

/** House three-quarter view: ~40° elevation reads as a product shot rather than
 *  the near-horizon angle a low camera gives. */
export const DEFAULT_VIEW = new THREE.Vector3(0.32, -0.72, 0.62);

const forward = new THREE.Vector3();
const right = new THREE.Vector3();
const up = new THREE.Vector3();
const offset = new THREE.Vector3();

/**
 * Fit the camera so `box` exactly fills the frame from `direction`.
 *
 * Fitting a bounding *sphere* is the usual shortcut, but a sphere is only ever
 * constrained by the narrower (vertical) field of view — so a wide, flat piece
 * like a wordmark or a bowl ends up small in a landscape viewport. Projecting
 * the eight box corners onto the camera basis and solving each against both
 * fields of view gives a tight fit at any proportion or aspect ratio.
 *
 * `camera.aspect` must already be current for the viewport.
 */
export function fitCameraToBox(
  camera: THREE.PerspectiveCamera,
  controls: Pick<OrbitControls, "target" | "update">,
  box: THREE.Box3,
  direction: THREE.Vector3,
  { padding = 1.06, minDistance = 1 }: { padding?: number; minDistance?: number } = {},
) {
  if (box.isEmpty()) return;
  const center = box.getCenter(new THREE.Vector3());
  forward.copy(direction).normalize().negate();
  right.crossVectors(forward, camera.up).normalize();
  // A view straight down the up axis leaves `right` degenerate; nudge off-axis.
  if (right.lengthSq() < 1e-6) right.set(1, 0, 0);
  up.crossVectors(right, forward).normalize();

  const tanV = Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2);
  const tanH = tanV * Math.max(camera.aspect, 0.01);

  let distance = 0;
  for (const x of [box.min.x, box.max.x]) {
    for (const y of [box.min.y, box.max.y]) {
      for (const z of [box.min.z, box.max.z]) {
        offset.set(x, y, z).sub(center);
        const depth = offset.dot(forward);
        distance = Math.max(
          distance,
          Math.abs(offset.dot(right)) / tanH + depth,
          Math.abs(offset.dot(up)) / tanV + depth,
        );
      }
    }
  }
  distance = Math.max(distance * padding, minDistance);

  controls.target.copy(center);
  camera.position.copy(center).addScaledVector(forward, -distance);
  camera.near = Math.max(0.1, distance / 200);
  camera.far = distance * 20;
  camera.updateProjectionMatrix();
  controls.update();
}
