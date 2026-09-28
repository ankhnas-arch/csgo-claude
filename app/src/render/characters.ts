import * as THREE from 'three';
import type { Actor } from '../sim/actor';
import type { Team } from '../data/weapons';
import { solid } from './materials';

/**
 * Articulated human tactical character built from a bone hierarchy of shaped parts (torso, vest, pouches, helmet/
 * headwrap, upper/lower arms, gloved hands, thighs, shins, boots) with a procedural walk/aim/crouch/death animation.
 * Original authored geometry (no capsules/boxes-only). Materials separate cloth / armour / skin / metal.
 */
export class CharacterRig {
  root = new THREE.Group();
  hips = new THREE.Group(); torso = new THREE.Group(); head = new THREE.Group();
  armL = new THREE.Group(); armR = new THREE.Group(); foreL = new THREE.Group(); foreR = new THREE.Group();
  legL = new THREE.Group(); legR = new THREE.Group(); shinL = new THREE.Group(); shinR = new THREE.Group();
  weaponMount = new THREE.Group();
  phase = 0; deathT = 0; team: Team;
  private parts: THREE.Mesh[] = [];
  constructor(team: Team, variant: number) {
    this.team = team;
    const skin = solid(['#c9a27e', '#8d5a3a', '#e0b898', '#6b4a32', '#b98b68'][variant % 5], 0.7);
    const cloth = solid(team === 'T' ? ['#7d6b4b', '#5b5140', '#8a6d44', '#4d4a3f', '#6f5f3e'][variant % 5] : ['#3b4b5e', '#2f3f52', '#4a5566', '#33404d', '#3e4d5c'][variant % 5], 0.9);
    const pants = solid(team === 'T' ? '#5a4e3a' : '#2a323d', 0.9);
    const vest = solid(team === 'T' ? '#3d3a33' : '#1f2a36', 0.75, 0.05);
    const boots = solid('#1e1a16', 0.8);
    const gloves = solid('#232323', 0.85);
    const helmet = solid(team === 'CT' ? '#2b3644' : '#3a3a3a', 0.6, 0.2);
    const wrap = solid(team === 'T' ? ['#b8b0a0', '#3a3a3a', '#8a2a20', '#c8b89a', '#4b4b4b'][variant % 5] : '#1e262f', 0.9);
    const mk = (g: THREE.BufferGeometry, m: THREE.Material, parent: THREE.Object3D, x = 0, y = 0, z = 0) => { const mesh = new THREE.Mesh(g, m); mesh.position.set(x, y, z); mesh.castShadow = true; mesh.receiveShadow = true; parent.add(mesh); this.parts.push(mesh); return mesh; };
    // hips at ~0.95 m; torso above; legs below
    this.root.add(this.hips); this.hips.position.y = 0.96;
    mk(new THREE.CylinderGeometry(0.19, 0.2, 0.22, 12), pants, this.hips, 0, 0.0, 0); // pelvis
    mk(new THREE.BoxGeometry(0.44, 0.08, 0.26), solid('#2a2622', 0.7, 0.3), this.hips, 0, 0.09, 0); // belt
    this.hips.add(this.torso); this.torso.position.y = 0.1;
    // torso: tapered chest + vest + pouches
    mk(new THREE.CylinderGeometry(0.21, 0.19, 0.5, 14), cloth, this.torso, 0, 0.27, 0);
    mk(new THREE.BoxGeometry(0.42, 0.42, 0.3), vest, this.torso, 0, 0.3, 0);
    mk(new THREE.BoxGeometry(0.1, 0.12, 0.08), vest, this.torso, -0.12, 0.2, 0.17); mk(new THREE.BoxGeometry(0.1, 0.12, 0.08), vest, this.torso, 0.12, 0.2, 0.17); mk(new THREE.BoxGeometry(0.08, 0.1, 0.06), vest, this.torso, 0, 0.36, 0.17);
    mk(new THREE.BoxGeometry(0.14, 0.18, 0.1), vest, this.torso, 0, 0.25, -0.18); // back pouch
    mk(new THREE.SphereGeometry(0.11, 10, 8), cloth, this.torso, -0.22, 0.48, 0); mk(new THREE.SphereGeometry(0.11, 10, 8), cloth, this.torso, 0.22, 0.48, 0); // shoulders
    mk(new THREE.CylinderGeometry(0.06, 0.07, 0.1, 10), skin, this.torso, 0, 0.56, 0); // neck
    // head
    this.torso.add(this.head); this.head.position.y = 0.62;
    mk(new THREE.SphereGeometry(0.115, 14, 12), skin, this.head, 0, 0.09, 0).scale.set(0.95, 1.08, 1.0);
    mk(new THREE.BoxGeometry(0.04, 0.05, 0.05), skin, this.head, 0, 0.07, 0.11); // nose
    if (team === 'CT') { mk(new THREE.SphereGeometry(0.135, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.6), helmet, this.head, 0, 0.11, 0); mk(new THREE.BoxGeometry(0.2, 0.05, 0.02), solid('#111', 0.3), this.head, 0, 0.1, 0.12); }
    else { if (variant % 2 === 0) { mk(new THREE.SphereGeometry(0.128, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.55), wrap, this.head, 0, 0.1, 0); mk(new THREE.BoxGeometry(0.24, 0.1, 0.1), wrap, this.head, 0, 0.02, -0.06); } else { mk(new THREE.SphereGeometry(0.125, 14, 10, 0, Math.PI * 2, Math.PI * 0.35, Math.PI * 0.65), wrap, this.head, 0, 0.09, 0); mk(new THREE.BoxGeometry(0.22, 0.03, 0.04), solid('#111', 0.3), this.head, 0, 0.1, 0.11); } }
    // arms
    const arm = (side: number, upper: THREE.Group, fore: THREE.Group) => {
      this.torso.add(upper); upper.position.set(side * 0.27, 0.47, 0);
      mk(new THREE.CylinderGeometry(0.06, 0.055, 0.3, 10), cloth, upper, 0, -0.15, 0);
      upper.add(fore); fore.position.y = -0.3;
      mk(new THREE.CylinderGeometry(0.052, 0.045, 0.28, 10), cloth, fore, 0, -0.14, 0);
      mk(new THREE.BoxGeometry(0.075, 0.1, 0.055), gloves, fore, 0, -0.32, 0.01); // hand
    };
    arm(-1, this.armL, this.foreL); arm(1, this.armR, this.foreR);
    this.foreR.add(this.weaponMount); this.weaponMount.position.set(-0.02, -0.34, 0.06);
    // legs
    const leg = (side: number, thigh: THREE.Group, shin: THREE.Group) => {
      this.hips.add(thigh); thigh.position.set(side * 0.11, -0.08, 0);
      mk(new THREE.CylinderGeometry(0.085, 0.07, 0.42, 10), pants, thigh, 0, -0.21, 0);
      mk(new THREE.BoxGeometry(0.1, 0.12, 0.06), pants, thigh, side * 0.06, -0.2, 0.05); // cargo pocket
      thigh.add(shin); shin.position.y = -0.42;
      mk(new THREE.CylinderGeometry(0.065, 0.06, 0.4, 10), pants, shin, 0, -0.2, 0);
      mk(new THREE.BoxGeometry(0.11, 0.1, 0.27), boots, shin, 0, -0.43, 0.05); // boot
    };
    leg(-1, this.legL, this.shinL); leg(1, this.legR, this.shinR);
  }
  setVisible(v: boolean) { this.root.visible = v; }
  /** Pose from actor state (interpolated transform and animation phase). */
  update(a: Actor, alpha: number, dt: number, weaponMesh?: THREE.Object3D | null) {
    const x = a.px + (a.x - a.px) * alpha, y = a.py + (a.y - a.py) * alpha, z = a.pz + (a.z - a.pz) * alpha;
    let yaw = a.yaw; const dy = a.yaw - a.pyaw; yaw = a.pyaw + Math.atan2(Math.sin(dy), Math.cos(dy)) * alpha;
    this.root.position.set(x, y, z); this.root.rotation.set(0, yaw + Math.PI, 0);
    if (!a.alive) { this.deathT += dt; this.poseDeath(a); return; }
    this.deathT = 0;
    const speed = a.speed2d; const moving = speed > 0.4;
    this.phase += dt * Math.min(speed, 6.5) * 1.9;
    const s = Math.sin(this.phase), c = Math.cos(this.phase);
    const crouch = a.crouchT;
    this.hips.position.y = 0.96 - crouch * 0.42 + (moving ? Math.abs(c) * 0.02 : 0);
    const stride = moving ? Math.min(1, speed / 5.5) * 0.65 : 0;
    this.legL.rotation.x = s * stride - crouch * 1.1; this.legR.rotation.x = -s * stride - crouch * 1.1;
    this.shinL.rotation.x = Math.max(0, -c) * stride * 1.1 + crouch * 1.5; this.shinR.rotation.x = Math.max(0, c) * stride * 1.1 + crouch * 1.5;
    this.torso.rotation.x = 0.08 + crouch * 0.35 + (moving ? 0.05 : 0); this.torso.rotation.y = moving ? s * 0.06 : 0;
    // aim: pitch upper body, hold weapon with both arms
    const pitch = -a.pitch;
    this.torso.rotation.x += pitch * 0.25;
    const w = a.active.def;
    const twoHanded = w.slot === 'primary';
    this.armR.rotation.set(-1.35 + pitch * 0.7, -0.15, -0.25); this.foreR.rotation.set(-0.35, 0, 0.1);
    if (twoHanded) { this.armL.rotation.set(-1.15 + pitch * 0.7, 0.75, 0.25); this.foreL.rotation.set(-0.9, 0.3, -0.6); }
    else if (w.slot === 'secondary') { this.armL.rotation.set(-1.3 + pitch * 0.7, 0.45, 0.35); this.foreL.rotation.set(-0.5, 0.2, -0.5); }
    else { this.armL.rotation.set(-0.3 + s * stride * 0.6, 0.1, 0.25); this.foreL.rotation.set(-0.5, 0, 0); }
    // reload wiggle
    if (a.active.action === 'reload') { const t = a.active.actionTime / Math.max(0.1, a.active.actionDur); const k = Math.sin(t * Math.PI * 2) * 0.6; this.foreL.rotation.x -= 0.6 + k * 0.4; this.armL.rotation.y += 0.3; }
    if (a.active.action === 'fire' && w.slot !== 'melee') { const k = 1 - a.active.actionTime / Math.max(0.05, a.active.actionDur); this.armR.rotation.x += 0.12 * k; }
    if (a.interacting) { this.armR.rotation.set(-0.8, -0.3, 0); this.foreR.rotation.set(-0.7, 0, 0); this.armL.rotation.set(-0.8, 0.3, 0); this.foreL.rotation.set(-0.7, 0, 0); }
    this.head.rotation.x = pitch * 0.5 - crouch * 0.2;
    if (weaponMesh) { if (weaponMesh.parent !== this.weaponMount) this.weaponMount.add(weaponMesh); }
  }
  private poseDeath(a: Actor) {
    const t = Math.min(1, this.deathT / 0.55); const e = 1 - Math.pow(1 - t, 3);
    // fall backward/sideways depending on hit direction with a small bounce
    this.hips.position.y = 0.96 - 0.78 * e; this.root.rotation.x = 0; this.root.rotation.z = -1.35 * e * (a.id % 2 ? 1 : -1);
    this.root.rotation.y += 0; this.torso.rotation.x = 0.25 * e; this.armL.rotation.set(-0.4 - e, 0.2, 0.9); this.armR.rotation.set(-0.3 - e * 0.7, -0.2, -0.9);
    this.legL.rotation.x = 0.2 * e; this.legR.rotation.x = -0.35 * e; this.shinL.rotation.x = 0.3 * e; this.shinR.rotation.x = 0.7 * e; this.head.rotation.x = 0.3 * e;
  }
  dispose() { for (const p of this.parts) { p.geometry.dispose(); } }
}
