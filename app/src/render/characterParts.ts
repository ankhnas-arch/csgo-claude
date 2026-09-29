import * as THREE from 'three';

/**
 * Shared helpers for the procedural character rig: cached materials, lathe-profile bodies and a small analytic
 * two-bone IK used to keep both hands on the weapon.
 */

const matCache = new Map<string, THREE.MeshStandardMaterial>();
/** Cached MeshStandardMaterial keyed by colour/roughness/metalness (rigs share materials; never disposed). */
export function mat(color: string, roughness: number, metalness = 0): THREE.MeshStandardMaterial {
  const k = `${color}|${roughness}|${metalness}`;
  let m = matCache.get(k);
  if (!m) { m = new THREE.MeshStandardMaterial({ color, roughness, metalness }); matCache.set(k, m); }
  return m;
}

/** Palette per team and variant. */
export function palette(team: 'T' | 'CT', variant: number) {
  const v = variant % 5;
  const skin = mat(['#c99b74', '#8b5b3c', '#e2b898', '#6a4a33', '#b78968'][v], 0.62);
  if (team === 'CT') {
    return {
      skin,
      cloth: mat(['#3a4656', '#33404f', '#3f4a5a', '#2f3b49', '#384352'][v], 0.88),
      pants: mat(['#2b343f', '#28313b', '#2f3944', '#262f38', '#2c3540'][v], 0.9),
      carrier: mat('#1f2833', 0.62, 0.04),
      strap: mat('#161c24', 0.85),
      pouch: mat('#242e3a', 0.72),
      boots: mat('#15171a', 0.66, 0.05),
      gloves: mat('#1b1e22', 0.8),
      helmet: mat(['#2a3644', '#2e3a48', '#26313e', '#2c3745', '#29343f'][v], 0.42, 0.18),
      wrap: mat('#1b222b', 0.9),
      pad: mat('#14181d', 0.5, 0.08),
      metal: mat('#8d949c', 0.35, 0.85),
      lens: mat('#1a2a33', 0.15, 0.5),
    };
  }
  return {
    skin,
    cloth: mat(['#8a7250', '#6e6a4e', '#96784a', '#5c5a4c', '#7b6a44'][v], 0.9),
    pants: mat(['#5a4d39', '#4b4a3d', '#6a5a3e', '#4a4235', '#5c5340'][v], 0.92),
    carrier: mat('#4a4636', 0.74, 0.03),
    strap: mat('#2c2a22', 0.85),
    pouch: mat('#4b4838', 0.78),
    boots: mat('#2a2119', 0.72, 0.03),
    gloves: mat('#2c2723', 0.85),
    helmet: mat('#3a3a3a', 0.6, 0.15),
    wrap: mat(['#262626', '#cbbc9d', '#8a2a20', '#1f1f1f', '#b9b1a0'][v], 0.92),
    pad: mat('#3b352c', 0.7),
    metal: mat('#9a8d70', 0.4, 0.8),
    lens: mat('#101010', 0.4, 0.2),
  };
}

/** Lathe body from a (radius, y) profile; `zScale` squashes the round section into an ellipse. */
export function lathe(profile: [number, number][], segments: number, zScale = 1): THREE.BufferGeometry {
  const g = new THREE.LatheGeometry(profile.map(([r, y]) => new THREE.Vector2(r, y)), segments);
  if (zScale !== 1) { g.scale(1, 1, zScale); g.computeVertexNormals(); }
  return g;
}

/** Tapered limb segment (cylinder with closed ends) whose top sits at y=0 and hangs down `len`. */
export function limb(rTop: number, rBot: number, len: number, seg = 12, dir: 1 | -1 = -1): THREE.BufferGeometry {
  const g = dir < 0 ? new THREE.CylinderGeometry(rTop, rBot, len, seg, 1) : new THREE.CylinderGeometry(rBot, rTop, len, seg, 1);
  g.translate(0, dir * len / 2, 0); return g;
}

/** Rounded upper limb: capsule whose lower hemisphere centre is at the joint end (y=-len). */
export function capsuleLimb(r: number, len: number, seg = 10, dir: 1 | -1 = -1): THREE.BufferGeometry {
  const g = new THREE.CapsuleGeometry(r, len, 3, seg);
  g.translate(0, dir * len / 2, 0); return g;
}

/** Flip y and z: converts a torso-frame vector into an arm pivot frame (the pivots are rotated PI about X). */
export function flipYZ(v: THREE.Vector3): THREE.Vector3 { v.y = -v.y; v.z = -v.z; return v; }

/**
 * Two-bone analytic IK in the parent frame of `upper`. `rest` is the sign of the limb's rest direction along Y
 * (-1: hangs down -Y, +1: authored along +Y). Sets `upper.quaternion` and `fore.rotation.x`; the target is reached
 * exactly when within reach, the elbow is pushed toward `pole`.
 */
const _d = new THREE.Vector3(), _n = new THREE.Vector3(), _u = new THREE.Vector3(), _e = new THREE.Vector3(), _f = new THREE.Vector3(), _x = new THREE.Vector3(), _y = new THREE.Vector3(), _z = new THREE.Vector3(), _m = new THREE.Matrix4(), _q = new THREE.Quaternion();
export function solveArm(upper: THREE.Object3D, fore: THREE.Object3D, target: THREE.Vector3, pole: THREE.Vector3, l1: number, l2: number, rest: 1 | -1 = -1) {
  _d.copy(target).sub(upper.position);
  let dist = _d.length(); if (dist < 1e-4) { _d.set(0, rest, 0); dist = 1e-4; }
  _d.divideScalar(dist);
  dist = Math.min(Math.max(dist, 0.05), l1 + l2 - 0.005);
  _n.crossVectors(_d, pole); if (_n.lengthSq() < 1e-6) _n.set(1, 0, 0); _n.normalize();
  const cosA = Math.min(1, Math.max(-1, (l1 * l1 + dist * dist - l2 * l2) / (2 * l1 * dist)));
  _q.setFromAxisAngle(_n, Math.acos(cosA)); _u.copy(_d).applyQuaternion(_q);
  _e.copy(upper.position).addScaledVector(_u, l1);
  _f.copy(upper.position).addScaledVector(_d, dist).sub(_e).normalize();
  _x.copy(_n); _y.copy(_u).multiplyScalar(rest); _z.crossVectors(_x, _y);
  _m.makeBasis(_x, _y, _z); upper.quaternion.setFromRotationMatrix(_m);
  fore.rotation.set(Math.atan2(rest * _f.dot(_z), rest * _f.dot(_y)), 0, 0);
}

export const smooth = (t: number) => { t = Math.min(1, Math.max(0, t)); return t * t * (3 - 2 * t); };
