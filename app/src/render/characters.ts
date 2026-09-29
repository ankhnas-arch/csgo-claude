import * as THREE from 'three';
import type { Actor } from '../sim/actor';
import type { Team } from '../data/weapons';
import { palette, lathe, limb, capsuleLimb, solveArm, smooth, flipYZ } from './characterParts';

/**
 * Articulated tactical human (~1.83 m, 7.5 heads, 0.46 m shoulders) built from a bone hierarchy of authored parts:
 * lathe torso/pelvis/plate carrier, capsule upper arms, tapered forearms/thighs/shins, gloved fists with thumbs,
 * boots with soles, and team headgear (CT helmet + goggles, T balaclava / shemagh / bandana). Materials separate skin,
 * cloth, carrier, straps, pouches, metal, boots and helmet. Arms are posed with a two-bone IK so both hands stay on the
 * weapon while aiming; the walk cycle has counter arm swing, hip sway, torso twist and foot planting.
 *
 * Frame conventions (root): +Z is where the actor looks, +X is the actor's LEFT, y=0 at the soles. `weaponMount` sits
 * in the right fist and is re-oriented every frame so a weapon that extends along mount +Z points at the aim direction
 * (world weapons are added rotated PI so their -Z models point along mount +Z).
 * Each arm hangs from a pivot rotated PI about X (limbs authored along +Y): an Euler pose set on `armR`/`armL` from
 * outside (menu idle) therefore reads mirrored between the two sides, which keeps hand-authored poses symmetric.
 */
export class CharacterRig {
  root = new THREE.Group();
  hips = new THREE.Group(); torso = new THREE.Group(); head = new THREE.Group();
  armL = new THREE.Group(); armR = new THREE.Group(); foreL = new THREE.Group(); foreR = new THREE.Group();
  legL = new THREE.Group(); legR = new THREE.Group(); shinL = new THREE.Group(); shinR = new THREE.Group();
  weaponMount = new THREE.Group();
  phase = 0; deathT = 0; team: Team;
  private handL = new THREE.Group(); private handR = new THREE.Group(); private footL = new THREE.Group(); private footR = new THREE.Group();
  private pivL = new THREE.Group(); private pivR = new THREE.Group(); // arm pivots, rotated PI about X
  private parts: THREE.Mesh[] = [];
  private variant: number;
  // scratch
  private qT = new THREE.Quaternion(); private qA = new THREE.Quaternion(); private qB = new THREE.Quaternion();
  private vGrip = new THREE.Vector3(); private vOff = new THREE.Vector3(); private vL = new THREE.Vector3(); private vPole = new THREE.Vector3(); private vPoleL = new THREE.Vector3();
  private static HIP_Y = 0.96; private static UPPER = 0.30; private static FORE = 0.31; // arm segment lengths (shoulder→elbow, elbow→fist)
  private static TILT_R = new THREE.Quaternion().setFromEuler(new THREE.Euler(-0.2, 0, Math.PI / 2));
  private static TILT_L = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, Math.PI / 2, Math.PI / 2));
  private static Q_ID = new THREE.Quaternion();

  constructor(team: Team, variant: number) {
    this.team = team; this.variant = variant;
    const P = palette(team, variant);
    const ct = team === 'CT';
    const asym = (variant % 2 ? 1 : -1) * 0.012;
    const mk = (g: THREE.BufferGeometry, m: THREE.Material, parent: THREE.Object3D, x = 0, y = 0, z = 0) => { const mesh = new THREE.Mesh(g, m); mesh.position.set(x, y, z); mesh.castShadow = true; mesh.receiveShadow = true; parent.add(mesh); this.parts.push(mesh); return mesh; };

    // ---- pelvis / belt (hips group at 0.96 m)
    this.root.add(this.hips); this.hips.position.y = CharacterRig.HIP_Y;
    mk(lathe([[0.125, -0.17], [0.17, -0.10], [0.185, -0.02], [0.18, 0.05], [0.16, 0.10]], 16, 0.78), P.pants, this.hips);
    mk(new THREE.CylinderGeometry(0.186, 0.19, 0.05, 18, 1, true), P.strap, this.hips, 0, 0.085, 0).scale.z = 0.8;
    mk(new THREE.BoxGeometry(0.06, 0.04, 0.02), P.metal, this.hips, 0, 0.085, 0.15);

    // ---- torso: lathe chest→waist, carrier shell, pouches, deltoids, neck
    this.hips.add(this.torso); this.torso.position.y = 0.10;
    mk(lathe([[0.155, -0.10], [0.150, 0.0], [0.165, 0.10], [0.185, 0.22], [0.195, 0.32], [0.195, 0.40], [0.17, 0.46], [0.10, 0.50], [0.06, 0.52]], 20, 0.72), P.cloth, this.torso);
    mk(lathe([[0.19, 0.05], [0.207, 0.12], [0.217, 0.24], [0.217, 0.36], [0.205, 0.44], [0.16, 0.475]], 18, 0.80), P.carrier, this.torso);
    if (ct) {
      for (let i = -1; i <= 1; i++) mk(new THREE.BoxGeometry(0.075, 0.13, 0.06), P.pouch, this.torso, i * 0.085, 0.21, 0.195);
      mk(new THREE.BoxGeometry(0.27, 0.27, 0.05), P.carrier, this.torso, 0, 0.30, -0.175); // back plate
      mk(new THREE.BoxGeometry(0.12, 0.07, 0.05), P.pouch, this.torso, 0.0, 0.36, 0.20); // admin pouch
    } else {
      for (let i = -1; i <= 1; i++) mk(new THREE.BoxGeometry(0.07, 0.12, 0.055), P.pouch, this.torso, i * 0.085, 0.26, 0.195);
      for (const sx of [-1, 1]) { const st = mk(new THREE.BoxGeometry(0.05, 0.30, 0.015), P.strap, this.torso, sx * 0.10, 0.40, 0.17); st.rotation.x = -0.28; st.rotation.z = sx * 0.12; }
    }
    for (const sx of [-1, 1]) mk(new THREE.SphereGeometry(0.072, 10, 8), P.cloth, this.torso, sx * 0.185, 0.42 + sx * asym * 0.5, 0).scale.set(1, 0.9, 0.95);
    mk(new THREE.CylinderGeometry(0.052, 0.06, 0.12, 10), P.skin, this.torso, 0, 0.53, 0.01);

    // ---- head: skull + jaw + ears + nose, then headgear
    this.torso.add(this.head); this.head.position.set(0, 0.54, 0.015); this.head.rotation.z = asym;
    const bala = !ct && variant % 3 === 0;
    mk(new THREE.SphereGeometry(0.105, 18, 13), bala ? P.wrap : P.skin, this.head, 0, 0.075, 0).scale.set(0.94, 1.06, 1.0);
    mk(new THREE.SphereGeometry(0.082, 12, 8), bala ? P.wrap : P.skin, this.head, 0, 0.03, 0.015).scale.set(0.86, 0.8, 0.95);
    for (const sx of [-1, 1]) mk(new THREE.SphereGeometry(0.022, 6, 5), bala ? P.wrap : P.skin, this.head, sx * 0.098, 0.075, -0.005).scale.set(0.5, 1.1, 0.8);
    mk(new THREE.ConeGeometry(0.017, 0.045, 5), bala ? P.wrap : P.skin, this.head, 0, 0.06, 0.10).rotation.x = Math.PI / 2;
    if (ct) {
      mk(new THREE.SphereGeometry(0.125, 18, 10, 0, Math.PI * 2, 0, Math.PI * 0.6), P.helmet, this.head, 0, 0.085, 0).scale.set(0.96, 1.0, 1.05);
      mk(new THREE.CylinderGeometry(0.126, 0.131, 0.025, 18, 1, true), P.helmet, this.head, 0, 0.045, 0).scale.set(0.96, 1, 1.05);
      mk(new THREE.CylinderGeometry(0.128, 0.128, 0.02, 18, 1, true), P.strap, this.head, 0, 0.135, 0).scale.set(0.97, 1, 1.06);
      mk(new THREE.BoxGeometry(0.15, 0.045, 0.04), P.lens, this.head, 0, 0.155, 0.105).rotation.x = -0.5; // goggles parked on helmet
    } else if (bala) {
      mk(new THREE.BoxGeometry(0.11, 0.028, 0.02), P.skin, this.head, 0, 0.085, 0.098); // eye slit
    } else if (variant % 3 === 1) { // shemagh / headwrap with tail
      mk(new THREE.SphereGeometry(0.112, 18, 10, 0, Math.PI * 2, 0, Math.PI * 0.55), P.wrap, this.head, 0, 0.075, 0).scale.set(0.95, 1.06, 1.0);
      mk(new THREE.CylinderGeometry(0.11, 0.108, 0.05, 18, 1, true), P.wrap, this.head, 0, 0.05, 0);
      mk(new THREE.BoxGeometry(0.08, 0.12, 0.03), P.wrap, this.head, 0.02, -0.02, -0.10).rotation.x = -0.3;
    } else { // bandana / beanie
      mk(new THREE.SphereGeometry(0.11, 18, 10, 0, Math.PI * 2, 0, Math.PI * 0.5), P.wrap, this.head, 0, 0.075, 0).scale.set(0.95, 1.06, 1.0);
      mk(new THREE.CylinderGeometry(0.109, 0.106, 0.035, 18, 1, true), P.wrap, this.head, 0, 0.085, 0);
    }

    // ---- arms (armL at +X = actor's left); authored along +Y inside pivots rotated PI about X, so they hang down
    const arm = (side: number, piv: THREE.Group, upper: THREE.Group, fore: THREE.Group, hand: THREE.Group) => {
      this.torso.add(piv); piv.rotation.x = Math.PI; piv.add(upper); upper.position.set(side * 0.20, -0.42, 0);
      mk(capsuleLimb(0.052, CharacterRig.UPPER, 10, 1), P.cloth, upper);
      if (ct) { mk(new THREE.CylinderGeometry(0.056, 0.056, 0.07, 10, 1, true), P.pad, upper, 0, 0.29, 0); } // elbow pad
      else { mk(new THREE.CylinderGeometry(0.06, 0.058, 0.05, 10, 1, true), P.cloth, upper, 0, 0.215, 0); } // rolled sleeve
      upper.add(fore); fore.position.y = CharacterRig.UPPER;
      mk(limb(0.048, 0.038, 0.26, 10, 1), ct ? P.cloth : P.skin, fore);
      fore.add(hand); hand.position.set(0, CharacterRig.FORE, -0.005);
      mk(new THREE.BoxGeometry(0.075, 0.085, 0.055), P.gloves, hand);
      const th = mk(new THREE.CylinderGeometry(0.013, 0.015, 0.05, 6), P.gloves, hand, -side * 0.04, -0.012, -0.02); th.rotation.set(-(Math.PI / 2 + 0.4), 0, side * 0.3);
    };
    arm(1, this.pivL, this.armL, this.foreL, this.handL); arm(-1, this.pivR, this.armR, this.foreR, this.handR);
    this.foreR.add(this.weaponMount); this.weaponMount.position.set(0, CharacterRig.FORE, -0.005);

    // ---- legs
    const leg = (side: number, thigh: THREE.Group, shin: THREE.Group, foot: THREE.Group) => {
      this.hips.add(thigh); thigh.position.set(side * 0.10, -0.06, 0);
      mk(limb(0.082, 0.064, 0.42, 12), P.pants, thigh);
      if (!ct) mk(new THREE.BoxGeometry(0.09, 0.13, 0.05), P.pants, thigh, side * 0.06, -0.20, 0.035).rotation.y = side * 0.5; // cargo pocket
      thigh.add(shin); shin.position.y = -0.42;
      mk(new THREE.SphereGeometry(0.066, 10, 7), ct ? P.pad : P.pants, shin, 0, 0.005, 0.008).scale.set(1, 0.95, 1);
      mk(limb(0.06, 0.045, 0.42, 12), P.pants, shin);
      shin.add(foot); foot.position.y = -0.42;
      const bt = mk(new THREE.CapsuleGeometry(0.048, 0.14, 3, 8), P.boots, foot, 0, -0.012, 0.04); bt.rotation.x = Math.PI / 2; bt.scale.set(1.05, 1.0, 1.0);
      mk(new THREE.BoxGeometry(0.10, 0.03, 0.27), P.pad, foot, 0, -0.045, 0.045); // sole
    };
    leg(1, this.legL, this.shinL, this.footL); leg(-1, this.legR, this.shinR, this.footR);
  }

  setVisible(v: boolean) { this.root.visible = v; }

  /** Pose from actor state (interpolated transform and animation phase). */
  update(a: Actor, alpha: number, dt: number, weaponMesh?: THREE.Object3D | null) {
    const x = a.px + (a.x - a.px) * alpha, y = a.py + (a.y - a.py) * alpha, z = a.pz + (a.z - a.pz) * alpha;
    const dy = a.yaw - a.pyaw; const yaw = a.pyaw + Math.atan2(Math.sin(dy), Math.cos(dy)) * alpha;
    this.root.position.set(x, y, z); this.root.rotation.set(0, yaw + Math.PI, 0);
    if (weaponMesh && weaponMesh.parent !== this.weaponMount) this.weaponMount.add(weaponMesh);
    if (!a.alive) { this.deathT += dt; this.poseDeath(a); return; }
    this.deathT = 0; this.hips.position.x = 0;
    const speed = a.speed2d; const moving = speed > 0.4;
    this.phase += dt * Math.min(speed, 6.5) * 2.0;
    const s = Math.sin(this.phase), c = Math.cos(this.phase);
    const crouch = a.interacting ? Math.max(a.crouchT, 0.8) : a.crouchT;
    const stride = moving ? Math.min(1, speed / 5.5) * (0.62 - crouch * 0.3) : 0;
    const pitch = -a.pitch;

    // ---- hips / legs: bob twice per cycle, pelvis yaw + roll, knees bend through swing, feet stay planted
    this.hips.position.y = CharacterRig.HIP_Y - crouch * 0.40 + Math.cos(this.phase * 2) * 0.02 * stride;
    this.hips.position.z = -0.10 * crouch;
    this.hips.rotation.set(0, s * 0.10 * stride, s * 0.05 * stride);
    const kneeL = Math.max(0, -c) * 1.25 * stride + 0.12 * stride, kneeR = Math.max(0, c) * 1.25 * stride + 0.12 * stride;
    this.legL.rotation.set(s * stride - crouch * 1.25, 0, -0.02); this.legR.rotation.set(-s * stride - crouch * 1.25, 0, 0.02);
    this.shinL.rotation.set(kneeL + crouch * 1.9, 0, 0); this.shinR.rotation.set(kneeR + crouch * 1.9, 0, 0);
    this.footL.rotation.set(-(this.legL.rotation.x + this.shinL.rotation.x) * 0.85, 0, 0);
    this.footR.rotation.set(-(this.legR.rotation.x + this.shinR.rotation.x) * 0.85, 0, 0);

    // ---- torso: lean, counter-twist, aim pitch
    const slot = a.active.def.slot; const blade = a.interacting ? 0 : slot === 'primary' ? 0.32 : slot === 'secondary' ? 0.18 : 0.08; // bladed stance toward the aim
    this.torso.rotation.set(0.06 + crouch * 0.40 + 0.06 * stride + pitch * 0.25, -s * 0.18 * stride - blade, -s * 0.05 * stride);
    this.head.rotation.set(pitch * 0.5 - crouch * 0.25, blade * 0.8, (this.variant % 2 ? 1 : -1) * 0.012);

    // ---- weapon orientation in torso space: root-space aim = R_x(pitch)
    const qT = this.qT; qT.copy(this.hips.quaternion).multiply(this.torso.quaternion).invert();
    this.qA.setFromAxisAngle(CharacterRig.X_AXIS, pitch);
    const w = a.active;
    const act = w.action; const at = act === 'idle' ? 0 : w.actionTime / Math.max(0.05, w.actionDur);
    const fireK = act === 'fire' && slot !== 'melee' ? 1 - at : 0;
    const reloading = act === 'reload';
    const wiggle = reloading ? Math.sin(at * Math.PI * 4) * 0.03 : 0;
    const vG = this.vGrip, vO = this.vOff, vL = this.vL;
    const swing = -s * stride * 0.55; // counter to the left leg
    let leftOnWeapon = false, rightOnWeapon = true;
    if (a.interacting) {
      // kneel and reach to the ground in front (plant / defuse)
      this.qA.setFromAxisAngle(CharacterRig.X_AXIS, 1.2); qT.multiply(this.qA);
      vG.set(-0.13, -0.08, 0.42); vL.set(0.11, -0.06, 0.40); leftOnWeapon = true;
    } else if (slot === 'primary') {
      this.qA.setFromAxisAngle(CharacterRig.X_AXIS, pitch - fireK * 0.05); qT.multiply(this.qA);
      vG.set(-0.10, 0.40, 0.04).add(vO.set(-0.02, -0.13, 0.13 - fireK * 0.02).applyQuaternion(qT));
      vL.copy(vG).add(vO.set(reloading ? 0.02 : 0.04, reloading ? -0.13 + wiggle : -0.035, reloading ? 0.10 : 0.27).applyQuaternion(qT)); leftOnWeapon = true;
    } else if (slot === 'secondary') {
      this.qA.setFromAxisAngle(CharacterRig.X_AXIS, pitch - fireK * 0.08); qT.multiply(this.qA);
      vG.set(-0.08, 0.40, 0.05).add(vO.set(0.02, -0.06, 0.40 - fireK * 0.03).applyQuaternion(qT));
      vL.copy(vG).add(vO.set(reloading ? 0.03 : 0.035, reloading ? -0.16 + wiggle : -0.03, reloading ? 0.0 : -0.01).applyQuaternion(qT)); leftOnWeapon = true;
    } else if (slot === 'grenade') {
      const th = act === 'fire' ? Math.sin(Math.min(1, at * 1.3) * Math.PI) : 0;
      this.qA.setFromAxisAngle(CharacterRig.X_AXIS, pitch - 0.6 + th * 0.8); qT.multiply(this.qA);
      vG.set(-0.17 + th * 0.05, 0.40 + th * 0.12, 0.0).add(vO.set(0, -0.04, 0.22 + th * 0.28).applyQuaternion(qT));
    } else if (slot === 'bomb') {
      this.qA.setFromAxisAngle(CharacterRig.X_AXIS, pitch + 0.7); qT.multiply(this.qA);
      vG.set(-0.07, 0.30, 0.06).add(vO.set(0, -0.05, 0.24).applyQuaternion(qT));
      vL.copy(vG).add(vO.set(0.15, 0.0, 0.0).applyQuaternion(qT)); leftOnWeapon = true;
    } else { // melee: knife low in front, slight forward stab while attacking
      const st = act === 'fire' ? Math.sin(at * Math.PI) : 0;
      this.qA.setFromAxisAngle(CharacterRig.X_AXIS, pitch + 0.25 - st * 0.3); qT.multiply(this.qA);
      vG.set(-0.16, 0.30, 0.06).add(vO.set(0, -0.16, 0.22 + st * 0.2).applyQuaternion(qT));
    }
    if (rightOnWeapon) {
      solveArm(this.armR, this.foreR, flipYZ(vG), flipYZ(this.vPole.set(-1, -0.7, -0.5)), CharacterRig.UPPER, CharacterRig.FORE, 1);
      this.qB.copy(this.pivR.quaternion).multiply(this.armR.quaternion).multiply(this.foreR.quaternion).invert().multiply(qT);
      this.weaponMount.quaternion.copy(this.qB); this.handR.quaternion.copy(this.qB).multiply(CharacterRig.TILT_R);
    }
    if (leftOnWeapon) {
      solveArm(this.armL, this.foreL, flipYZ(vL), flipYZ(this.vPoleL.set(0.6, -1, -0.25)), CharacterRig.UPPER, CharacterRig.FORE, 1);
      this.qB.copy(this.pivL.quaternion).multiply(this.armL.quaternion).multiply(this.foreL.quaternion).invert().multiply(qT);
      this.handL.quaternion.copy(this.qB).multiply(CharacterRig.TILT_L);
    } else {
      this.armL.rotation.set(-0.15 + swing, 0, -0.12); this.foreL.rotation.set(-0.35 - Math.max(0, -swing) * 0.6, 0, 0); this.handL.quaternion.copy(CharacterRig.Q_ID);
    }
  }

  /** Death: knees buckle and the torso folds, then the body topples onto one side (~0.7 s). */
  private poseDeath(a: Actor) {
    const t = Math.min(1, this.deathT / 0.7);
    const e1 = smooth(t / 0.45), e2 = smooth((t - 0.22) / 0.78);
    const side = a.id % 2 ? 1 : -1;
    const bounce = Math.sin(Math.PI * Math.min(1, Math.max(0, (t - 0.75) / 0.25))) * 0.03;
    const roll = side * (1.5 * e2);
    this.root.rotation.z = roll;
    this.hips.position.set(side * 0.17 * e2, CharacterRig.HIP_Y - 0.48 * e1 - 0.27 * e2 + bounce, -0.06 * e1);
    this.hips.rotation.set(0.25 * e1, 0, 0);
    this.torso.rotation.set(0.75 * e1 - 0.35 * e2, 0.1 * e2 * side, -0.1 * e2 * side);
    this.head.rotation.set(0.5 * e1 - 0.2 * e2, 0.3 * e2 * side, 0.2 * e2);
    this.legL.rotation.set(-0.9 * e1 + 0.45 * e2, 0, -0.05 - 0.15 * e2); this.legR.rotation.set(-0.75 * e1 + 0.2 * e2, 0, 0.05 + 0.2 * e2);
    this.shinL.rotation.set(1.6 * e1 - 0.5 * e2, 0, 0); this.shinR.rotation.set(1.4 * e1 - 0.9 * e2, 0, 0);
    this.footL.rotation.set(-0.3 * e1, 0, 0); this.footR.rotation.set(-0.2 * e1, 0, 0);
    this.armL.rotation.set(-0.6 * e1 - 0.8 * e2, 0, 0.25 * e2); this.foreL.rotation.set(-0.8 * e1 + 0.2 * e2, 0, 0); // both arms flop forward onto the ground
    this.armR.rotation.set(-0.4 * e1 - 1.0 * e2, 0, -0.2 * e2); this.foreR.rotation.set(-0.7 * e1 + 0.3 * e2, 0, 0);
    this.handL.quaternion.copy(CharacterRig.Q_ID); this.handR.quaternion.copy(CharacterRig.Q_ID);
    this.weaponMount.rotation.set(Math.PI / 2 - 0.3 * e2, 0, 0);
  }

  private static X_AXIS = new THREE.Vector3(1, 0, 0);
  dispose() { for (const p of this.parts) p.geometry.dispose(); }
}
