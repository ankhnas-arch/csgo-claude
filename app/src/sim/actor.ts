import RAPIER from '@dimforge/rapier3d-compat';
import { WEAPONS, type Team, type WeaponDef } from '../data/weapons';
import { u2m } from '../data/units';
import { WeaponInstance } from './weapon';
import type { PhysicsWorld } from '../physics/world';

export const PLAYER_HEIGHT = u2m(72), CROUCH_HEIGHT = u2m(54), EYE_STAND = u2m(64), EYE_CROUCH = u2m(46), RADIUS = 0.36;
export const GRAVITY = 20.32, JUMP_SPEED = 7.65, STEP_HEIGHT = 0.46;
export type SlotKey = 'primary' | 'secondary' | 'melee' | 'grenade' | 'bomb';

export interface Inventory {
  primary: WeaponInstance | null; secondary: WeaponInstance | null; melee: WeaponInstance;
  grenades: WeaponInstance[]; bomb: WeaponInstance | null; kit: boolean;
}

export class Actor {
  id: number; name: string; team: Team; isBot: boolean;
  // transform
  x = 0; y = 0; z = 0; px = 0; py = 0; pz = 0; // current + previous (interpolation)
  vx = 0; vy = 0; vz = 0;
  yaw = 0; pitch = 0; pyaw = 0; ppitch = 0;
  grounded = true; crouching = false; walking = false; crouchT = 0;
  health = 100; armor = 0; helmet = false; alive = true;
  money = 0; kills = 0; deaths = 0; assists = 0; roundKills = 0; damageDealt = 0; mvps = 0; score = 0;
  inv: Inventory;
  active: WeaponInstance; lastActive: WeaponInstance | null = null;
  aimPunchPitch = 0; aimPunchYaw = 0; // recoil (degrees)
  flashAlpha = 0; flashDuration = 0; flashTime = 0; // blindness
  burnTime = 0; lastFireTime = -10; lastFootstep = 0; stepDist = 0;
  plantProgress = 0; defuseProgress = 0; interacting = false;
  deathTime = 0; deathDir: [number, number, number] = [0, 0, 1];
  lastAttackerId: number | null = null; lastDamageWeapon = "";
  rezoomLevel = 0; interactLatch = false; burnAccum = 0;
  body: RAPIER.RigidBody | null = null; collider: RAPIER.Collider | null = null; controller: RAPIER.KinematicCharacterController | null = null;
  spawnIndex = 0;
  constructor(id: number, name: string, team: Team, isBot: boolean) {
    this.id = id; this.name = name; this.team = team; this.isBot = isBot;
    this.inv = { primary: null, secondary: null, melee: WeaponInstance.create('knife'), grenades: [], bomb: null, kit: false };
    this.active = this.inv.melee; this.active.action = 'idle';
  }
  get eyeHeight(): number { return EYE_CROUCH + (EYE_STAND - EYE_CROUCH) * (1 - this.crouchT); }
  get eyeY(): number { return this.y + this.eyeHeight; }
  get height(): number { return CROUCH_HEIGHT + (PLAYER_HEIGHT - CROUCH_HEIGHT) * (1 - this.crouchT); }
  get speed2d(): number { return Math.hypot(this.vx, this.vz); }
  get hasBomb(): boolean { return this.inv.bomb !== null; }
  forward(): [number, number, number] { const cp = Math.cos(this.pitch); return [-Math.sin(this.yaw) * cp, Math.sin(this.pitch), -Math.cos(this.yaw) * cp]; }
  /** Aim direction including recoil aim punch (degrees -> radians). */
  aimDir(): [number, number, number] {
    const yaw = this.yaw - this.aimPunchYaw * Math.PI / 180, pitch = this.pitch + this.aimPunchPitch * Math.PI / 180;
    const cp = Math.cos(pitch); return [-Math.sin(yaw) * cp, Math.sin(pitch), -Math.cos(yaw) * cp];
  }
  giveDefaultLoadout() {
    this.inv.secondary = WeaponInstance.create(this.team === 'T' ? 'glock' : 'usp');
    this.inv.primary = null; this.inv.grenades = []; this.inv.kit = false; this.inv.bomb = null;
    this.inv.melee = WeaponInstance.create('knife');
    this.switchTo(this.inv.secondary, true);
  }
  resetForRound(keepInventory: boolean) {
    this.health = 100; this.alive = true; this.flashAlpha = 0; this.flashDuration = 0; this.burnTime = 0; this.aimPunchPitch = 0; this.aimPunchYaw = 0;
    this.plantProgress = 0; this.defuseProgress = 0; this.roundKills = 0; this.crouching = false; this.crouchT = 0; this.vx = this.vy = this.vz = 0;
    this.inv.bomb = null;
    if (!keepInventory) { this.armor = 0; this.helmet = false; this.giveDefaultLoadout(); }
    else {
      for (const w of this.allWeapons()) { w.interrupt(); if (w.def.magSize > 0) { /* keep ammo */ } }
      if (!this.inv.secondary) this.inv.secondary = WeaponInstance.create(this.team === 'T' ? 'glock' : 'usp');
      this.switchTo(this.inv.primary ?? this.inv.secondary!, true);
    }
  }
  allWeapons(): WeaponInstance[] { const a: WeaponInstance[] = [this.inv.melee]; if (this.inv.primary) a.push(this.inv.primary); if (this.inv.secondary) a.push(this.inv.secondary); a.push(...this.inv.grenades); if (this.inv.bomb) a.push(this.inv.bomb); return a; }
  slotOf(w: WeaponInstance): number { if (w === this.inv.primary) return 1; if (w === this.inv.secondary) return 2; if (w === this.inv.melee) return 3; if (this.inv.grenades.includes(w)) return 4; return 5; }
  switchTo(w: WeaponInstance | null, instant = false): boolean {
    if (!w || w === this.active) return false;
    if (this.active) { this.active.interrupt(); this.lastActive = this.active; }
    this.active = w; if (instant) { w.action = 'idle'; w.zoomLevel = 0; } else w.draw();
    return true;
  }
  weaponInSlot(slot: number): WeaponInstance | null {
    switch (slot) { case 1: return this.inv.primary; case 2: return this.inv.secondary; case 3: return this.inv.melee; case 4: return this.inv.grenades[0] ?? null; case 5: return this.inv.bomb; }
    return null;
  }
  /** cycle through grenades when pressing 4 repeatedly */
  nextGrenade(): WeaponInstance | null {
    if (this.inv.grenades.length === 0) return null;
    const i = this.inv.grenades.indexOf(this.active);
    return this.inv.grenades[(i + 1) % this.inv.grenades.length];
  }
  removeWeapon(w: WeaponInstance) {
    if (w === this.inv.primary) this.inv.primary = null;
    else if (w === this.inv.secondary) this.inv.secondary = null;
    else if (w === this.inv.bomb) this.inv.bomb = null;
    else { const i = this.inv.grenades.indexOf(w); if (i >= 0) this.inv.grenades.splice(i, 1); }
    if (this.active === w) { this.active = this.inv.primary ?? this.inv.secondary ?? this.inv.melee; this.active.draw(); }
  }
  addGrenade(kind: string): WeaponInstance { const w = WeaponInstance.create(kind); this.inv.grenades.push(w); return w; }
  countGrenade(kind: string): number { return this.inv.grenades.filter(g => g.def.id === kind).length; }
  maxSpeed(): number {
    const def: WeaponDef = this.active.def;
    let s = u2m(this.active.zoomLevel > 0 ? def.maxSpeedAlt : def.maxSpeed);
    if (this.crouching) s *= 0.34; else if (this.walking) s *= 0.52;
    return s;
  }
  /** Hitboxes in world space, dependent on crouch. */
  hitboxes(): { group: 'head' | 'chest' | 'stomach' | 'leg'; ax: number; ay: number; az: number; bx: number; by: number; bz: number; r: number }[] {
    const h = this.height; const s = h / PLAYER_HEIGHT;
    const x = this.x, z = this.z, y = this.y;
    const fwd = this.forward();
    // slight lean of head forward when crouching for silhouette; hitboxes are capsules (segment + radius)
    const headY = y + h - 0.13 * s;
    const hx = x + fwd[0] * 0.05 * this.crouchT, hz = z + fwd[2] * 0.05 * this.crouchT;
    return [
      { group: 'head', ax: hx, ay: headY, az: hz, bx: hx, by: headY + 0.02, bz: hz, r: 0.13 },
      { group: 'chest', ax: x, ay: y + 1.05 * s, az: z, bx: x, by: y + h - 0.32 * s, bz: z, r: 0.23 },
      { group: 'stomach', ax: x, ay: y + 0.82 * s, az: z, bx: x, by: y + 1.05 * s, bz: z, r: 0.22 },
      { group: 'leg', ax: x, ay: y + 0.12, az: z, bx: x, by: y + 0.82 * s, bz: z, r: 0.19 },
    ];
  }
  createPhysics(pw: PhysicsWorld) {
    const R = pw.R;
    this.body = pw.world.createRigidBody(R.RigidBodyDesc.kinematicPositionBased().setTranslation(this.x, this.y + PLAYER_HEIGHT / 2, this.z));
    this.collider = pw.world.createCollider(R.ColliderDesc.capsule(PLAYER_HEIGHT / 2 - RADIUS, RADIUS), this.body);
    pw.tags.set(this.collider.handle, { kind: 'actor', id: String(this.id) });
    this.controller = pw.world.createCharacterController(0.03);
    this.controller.setUp({ x: 0, y: 1, z: 0 });
    this.controller.enableAutostep(STEP_HEIGHT, 0.25, true);
    this.controller.enableSnapToGround(0.35);
    this.controller.setMaxSlopeClimbAngle(52 * Math.PI / 180);
    this.controller.setMinSlopeSlideAngle(60 * Math.PI / 180);
    this.controller.setSlideEnabled(true);
    this.controller.setApplyImpulsesToDynamicBodies(true);
  }
  teleport(x: number, y: number, z: number, yaw: number) {
    this.x = this.px = x; this.y = this.py = y; this.z = this.pz = z; this.yaw = this.pyaw = yaw; this.pitch = this.ppitch = 0; this.vx = this.vy = this.vz = 0;
    this.body?.setNextKinematicTranslation({ x, y: y + this.height / 2, z }); this.body?.setTranslation({ x, y: y + this.height / 2, z }, true);
  }
  setCollidable(on: boolean, pw: PhysicsWorld) {
    if (!this.collider) return;
    this.collider.setEnabled(on);
    void pw;
  }
  /** Character movement step. wish = desired horizontal direction (world, normalized or zero). */
  move(pw: PhysicsWorld, wishX: number, wishZ: number, wantJump: boolean, wantCrouch: boolean, walking: boolean, dt: number, obstacleFilter?: (c: RAPIER.Collider) => boolean) {
    if (!this.body || !this.collider || !this.controller) return;
    this.px = this.x; this.py = this.y; this.pz = this.z; this.pyaw = this.yaw; this.ppitch = this.pitch;
    this.walking = walking && !wantCrouch;
    // crouch transition (can't uncrouch if ceiling — simplified: check ray up)
    if (wantCrouch !== this.crouching) {
      if (!wantCrouch) { const hit = pw.raycast(this.x, this.y + 0.2, this.z, 0, 1, 0, PLAYER_HEIGHT + 0.05, t => t?.kind === 'actor' || t?.kind === 'grenade'); if (hit) wantCrouch = true; }
      this.crouching = wantCrouch;
    }
    const target = this.crouching ? 1 : 0;
    this.crouchT += Math.sign(target - this.crouchT) * Math.min(Math.abs(target - this.crouchT), dt / 0.25);
    const h = this.height;
    this.collider.setShape(new pw.R.Capsule(Math.max(0.05, h / 2 - RADIUS), RADIUS));
    const maxSpeed = this.maxSpeed();
    // ground acceleration / friction (approximation of Source: fast accel, quick stop)
    const accel = this.grounded ? 60 : 12, friction = this.grounded ? 14 : 0.3;
    const tx = wishX * maxSpeed, tz = wishZ * maxSpeed;
    if (wishX !== 0 || wishZ !== 0) {
      const dvx = tx - this.vx, dvz = tz - this.vz; const dl = Math.hypot(dvx, dvz);
      const step = Math.min(dl, accel * dt); if (dl > 1e-5) { this.vx += dvx / dl * step; this.vz += dvz / dl * step; }
    } else {
      const sp = this.speed2d; if (sp > 0) { const drop = Math.min(sp, friction * dt * Math.max(sp, 1.5)); this.vx -= this.vx / sp * drop; this.vz -= this.vz / sp * drop; }
    }
    if (!this.grounded) { const sp = this.speed2d; if (sp > maxSpeed * 1.05) { this.vx *= maxSpeed * 1.05 / sp; this.vz *= maxSpeed * 1.05 / sp; } }
    if (wantJump && this.grounded) { this.vy = JUMP_SPEED; this.grounded = false; }
    this.vy -= GRAVITY * dt;
    if (this.vy < -40) this.vy = -40;
    const desired = { x: this.vx * dt, y: this.vy * dt, z: this.vz * dt };
    this.controller.computeColliderMovement(this.collider, desired, undefined, undefined, obstacleFilter);
    const mv = this.controller.computedMovement();
    const grounded = this.controller.computedGrounded();
    const pos = this.body.translation();
    const nx = pos.x + mv.x, ny = pos.y + mv.y, nz = pos.z + mv.z;
    this.body.setNextKinematicTranslation({ x: nx, y: ny, z: nz });
    // derive actual velocity from achieved movement (so wall-sliding stops the pushed axis)
    if (dt > 0) { this.vx = mv.x / dt; this.vz = mv.z / dt; if (grounded && this.vy < 0) this.vy = -0.5; else if (Math.abs(mv.y - desired.y) > 1e-4 && mv.y < desired.y) this.vy = Math.min(this.vy, 0); }
    this.grounded = grounded;
    this.x = nx; this.y = ny - h / 2; this.z = nz;
    this.stepDist += Math.hypot(mv.x, mv.z);
  }
  syncBodyToPose() { this.body?.setNextKinematicTranslation({ x: this.x, y: this.y + this.height / 2, z: this.z }); }
}
export function defaultNames(team: Team): string[] {
  return team === 'T' ? ['Elite Crew', 'Phoenix', 'Sabre', 'Balkan', 'Pirate']
                      : ['SEAL Team', 'GIGN', 'SAS', 'FBI', 'GSG-9'];
}
export { WEAPONS };
