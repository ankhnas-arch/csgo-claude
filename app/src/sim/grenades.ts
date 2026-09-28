import RAPIER from '@dimforge/rapier3d-compat';
import { GRENADES } from '../data/grenades';
import { u2m, m2u } from '../data/units';
import type { PhysicsWorld } from '../physics/world';
import type { Actor } from './actor';
import type { Emitter } from '../core/events';
import type { SimEvents } from './types';

export type GrenadeKind = 'he' | 'flash' | 'smoke' | 'molotov' | 'incendiary';
export interface Grenade { id: number; kind: GrenadeKind; ownerId: number; ownerTeam: 'T' | 'CT'; body: RAPIER.RigidBody; collider: RAPIER.Collider; fuse: number; age: number; x: number; y: number; z: number; px: number; py: number; pz: number; lastSpeed: number; bounces: number; done: boolean; landedTime: number; }
export interface SmokeVolume { id: number; x: number; y: number; z: number; age: number; duration: number; radius: number; }
export interface FireArea { id: number; x: number; y: number; z: number; age: number; duration: number; radius: number; ownerId: number; ownerTeam: 'T' | 'CT'; }

/** Grenade projectiles (Rapier dynamic balls) and their area effects. Owns cleanup. */
export class GrenadeSim {
  grenades: Grenade[] = []; smokes: SmokeVolume[] = []; fires: FireArea[] = [];
  private nextId = 1;
  constructor(private pw: PhysicsWorld, private events: Emitter<SimEvents>) {}
  throwGrenade(owner: Actor, kind: GrenadeKind, ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, strength = 1): Grenade {
    const R = this.pw.R;
    const speed = u2m(GRENADES.throwSpeed) * strength + owner.speed2d * 0.7;
    const body = this.pw.world.createRigidBody(R.RigidBodyDesc.dynamic().setTranslation(ox, oy, oz).setLinvel(dx * speed, dy * speed, dz * speed).setLinearDamping(0.12).setAngularDamping(0.5).setCcdEnabled(true));
    const col = this.pw.world.createCollider(R.ColliderDesc.ball(0.065).setRestitution(0.42).setFriction(0.55).setDensity(2.0).setActiveEvents(R.ActiveEvents.COLLISION_EVENTS), body);
    this.pw.tags.set(col.handle, { kind: 'grenade' });
    const g: Grenade = { id: this.nextId++, kind, ownerId: owner.id, ownerTeam: owner.team, body, collider: col, fuse: kind === 'molotov' || kind === 'incendiary' ? 2.2 : GRENADES.fuse[kind === 'flash' ? 'flash' : kind === 'smoke' ? 'smoke' : 'he'], age: 0, x: ox, y: oy, z: oz, px: ox, py: oy, pz: oz, lastSpeed: speed, bounces: 0, done: false, landedTime: -1 };
    this.grenades.push(g);
    this.events.emit('grenadeThrow', { actorId: owner.id, kind, id: g.id });
    return g;
  }
  tick(dt: number, actors: Actor[], now: number, damage: (victim: Actor, attacker: Actor | null, dmg: number, weapon: string, armorRatio: number) => void) {
    for (const g of this.grenades) {
      if (g.done) continue;
      g.age += dt; g.px = g.x; g.py = g.y; g.pz = g.z;
      const p = g.body.translation(); g.x = p.x; g.y = p.y; g.z = p.z;
      const v = g.body.linvel(); const speed = Math.hypot(v.x, v.y, v.z);
      if (g.lastSpeed - speed > 1.5 && speed < g.lastSpeed * 0.85) { g.bounces++; this.events.emit('grenadeBounce', { id: g.id, pos: [g.x, g.y, g.z], speed }); }
      g.lastSpeed = speed;
      const resting = speed < 0.35;
      const isFire = g.kind === 'molotov' || g.kind === 'incendiary';
      let detonate = false;
      if (isFire) {
        // ignites on first solid impact with a reasonably flat surface or after fuse (source: molotov breaks on impact)
        if (g.bounces > 0 || g.age > g.fuse) {
          const hit = this.pw.raycast(g.x, g.y + 0.05, g.z, 0, -1, 0, 3.0, t => t?.kind === 'actor' || t?.kind === 'grenade');
          if (hit && hit.normal[1] > 0.6) { g.y = hit.point[1] + 0.02; detonate = true; }
          else if (g.age > g.fuse + 1.5) { const hit2 = this.pw.raycast(g.x, g.y, g.z, 0, -1, 0, 6, t => t?.kind === 'actor' || t?.kind === 'grenade'); if (hit2) g.y = hit2.point[1] + 0.02; detonate = true; }
        }
      } else if (g.kind === 'smoke') {
        if (g.age >= g.fuse && resting) detonate = true; else if (g.age > g.fuse + 3.5) detonate = true; // smokes pop when they settle (CS2 behaviour); hard cap
      } else if (g.age >= g.fuse) detonate = true;
      if (g.y < -30) detonate = true;
      if (detonate) this.detonate(g, actors, now, damage);
    }
    // cleanup
    for (let i = this.grenades.length - 1; i >= 0; i--) if (this.grenades[i].done) { const g = this.grenades[i]; this.pw.tags.delete(g.collider.handle); this.pw.world.removeRigidBody(g.body); this.grenades.splice(i, 1); }
    for (const s of this.smokes) s.age += dt;
    this.smokes = this.smokes.filter(s => s.age < s.duration);
    for (const f of this.fires) {
      f.age += dt;
      if (f.age >= f.duration) continue;
      const r = this.fireRadius(f);
      const ramp = Math.min(1, f.age / GRENADES.fire.rampTime);
      for (const a of actors) {
        if (!a.alive) continue;
        const d = Math.hypot(a.x - f.x, a.z - f.z);
        if (d < r && a.y > f.y - 0.6 && a.y < f.y + 1.2) {
          a.burnTime = 0.6;
          const attacker = actors.find(x => x.id === f.ownerId) ?? null;
          damage(a, attacker, GRENADES.fire.dps * (0.35 + 0.65 * ramp) * dt, f.ownerTeam === 'T' ? 'molotov' : 'incendiary', 1.0);
        }
      }
    }
    this.fires = this.fires.filter(f => f.age < f.duration);
  }
  fireRadius(f: FireArea) { return f.radius * Math.min(1, f.age / GRENADES.fire.growTime); }
  smokeRadius(s: SmokeVolume) { const g = Math.min(1, s.age / GRENADES.smoke.growTime); const fade = s.age > s.duration - GRENADES.smoke.fadeTime ? (s.duration - s.age) / GRENADES.smoke.fadeTime : 1; return s.radius * g * Math.max(0, fade); }
  smokeDensity(s: SmokeVolume) { const g = Math.min(1, s.age / GRENADES.smoke.growTime); const fade = s.age > s.duration - GRENADES.smoke.fadeTime ? (s.duration - s.age) / GRENADES.smoke.fadeTime : 1; return g * fade; }
  private detonate(g: Grenade, actors: Actor[], now: number, damage: (v: Actor, a: Actor | null, d: number, w: string, ar: number) => void) {
    g.done = true;
    const owner = actors.find(a => a.id === g.ownerId) ?? null;
    this.events.emit('grenadeDetonate', { id: g.id, kind: g.kind, pos: [g.x, g.y, g.z] });
    if (g.kind === 'he') {
      const R = u2m(GRENADES.he.radius);
      for (const a of actors) {
        if (!a.alive) continue;
        const cx = a.x, cy = a.y + a.height * 0.5, cz = a.z;
        const d = Math.hypot(cx - g.x, cy - g.y, cz - g.z); if (d > R) continue;
        // falloff (source-like: linear with distance to radius), cover attenuation via LOS
        let dmg = GRENADES.he.damage * (1 - d / R) * 1.15;
        const los = this.pw.lineOfSight(g.x, g.y + 0.1, g.z, cx, cy, cz);
        if (!los) dmg *= GRENADES.he.coverAttenuation;
        if (dmg >= 1) damage(a, owner, dmg, 'he', GRENADES.he.armorRatio);
      }
    } else if (g.kind === 'flash') {
      for (const a of actors) {
        if (!a.alive) continue;
        const ex = a.x, ey = a.eyeY, ez = a.z;
        const dx = g.x - ex, dy = g.y - ey, dz = g.z - ez; const d = Math.hypot(dx, dy, dz);
        const R = u2m(GRENADES.flash.radius); if (d > R) continue;
        const f = a.forward(); const cosAng = (dx * f[0] + dy * f[1] + dz * f[2]) / Math.max(1e-4, d);
        const ang = Math.acos(Math.max(-1, Math.min(1, cosAng))) * 180 / Math.PI;
        const los = this.pw.lineOfSight(ex, ey, ez, g.x, g.y, g.z);
        let dur = ang < GRENADES.flash.fullAngleDeg ? GRENADES.flash.maxDuration : ang < 90 ? GRENADES.flash.sideDuration : GRENADES.flash.behindDuration;
        dur *= 1 - 0.6 * (d / R); // distance falloff
        if (!los) dur *= GRENADES.flash.occludedFactor;
        // smoke between blocks flash strongly
        if (this.segmentInSmoke(ex, ey, ez, g.x, g.y, g.z)) dur *= 0.2;
        if (dur > 0.15) { const intensity = Math.min(1, dur / GRENADES.flash.maxDuration + 0.3); if (dur > a.flashDuration - (now - a.flashTime)) { a.flashDuration = dur; a.flashTime = now; a.flashAlpha = intensity; } this.events.emit('flashed', { actorId: a.id, duration: dur, intensity }); }
      }
    } else if (g.kind === 'smoke') {
      const s: SmokeVolume = { id: g.id, x: g.x, y: g.y, z: g.z, age: 0, duration: GRENADES.smoke.duration, radius: GRENADES.smoke.radius };
      this.smokes.push(s);
      // smoke extinguishes fire it lands in (CS rule)
      this.fires = this.fires.filter(f => Math.hypot(f.x - s.x, f.z - s.z) > s.radius + f.radius * 0.5 || Math.abs(f.y - s.y) > 2.5);
    } else {
      // fire: not on a surface inside smoke
      const inSmoke = this.smokes.some(s => Math.hypot(s.x - g.x, s.z - g.z) < this.smokeRadius(s) + 0.5 && Math.abs(s.y - g.y) < 2.5);
      if (!inSmoke) this.fires.push({ id: g.id, x: g.x, y: g.y, z: g.z, age: 0, duration: GRENADES.fire.duration, radius: GRENADES.fire.radius, ownerId: g.ownerId, ownerTeam: g.ownerTeam });
    }
  }
  /** True if a segment passes through a dense enough part of any smoke volume. */
  segmentInSmoke(ax: number, ay: number, az: number, bx: number, by: number, bz: number): boolean {
    for (const s of this.smokes) {
      const r = this.smokeRadius(s) * 0.9; if (r <= 0.3) continue;
      const dx = bx - ax, dy = by - ay, dz = bz - az; const l2 = dx * dx + dy * dy + dz * dz;
      let t = l2 > 0 ? ((s.x - ax) * dx + (s.y - ay) * dy + (s.z - az) * dz) / l2 : 0; t = Math.max(0, Math.min(1, t));
      const cx = ax + dx * t - s.x, cy = ay + dy * t - s.y, cz = az + dz * t - s.z;
      if (cx * cx + cy * cy + cz * cz < r * r) return true;
    }
    return false;
  }
  pointInSmoke(x: number, y: number, z: number): number {
    let best = 0;
    for (const s of this.smokes) { const r = this.smokeRadius(s); const d = Math.hypot(x - s.x, y - s.y, z - s.z); if (d < r) best = Math.max(best, (1 - d / r) * this.smokeDensity(s)); }
    return best;
  }
  clear() {
    for (const g of this.grenades) { this.pw.tags.delete(g.collider.handle); this.pw.world.removeRigidBody(g.body); }
    this.grenades = []; this.smokes = []; this.fires = [];
  }
  get counts() { return { grenades: this.grenades.length, smokes: this.smokes.length, fires: this.fires.length }; }
}
export const _m2u = m2u;
