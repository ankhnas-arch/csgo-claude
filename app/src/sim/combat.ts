import { HITGROUP_MULT, type WeaponDef } from '../data/weapons';
import { m2u } from '../data/units';
import type { Actor } from './actor';
import type { PhysicsWorld } from '../physics/world';

export interface HitResult { actor: Actor | null; group: 'head' | 'chest' | 'stomach' | 'leg' | null; distance: number; point: [number, number, number]; normal: [number, number, number] | null; surface: string | null; }

/** Ray vs capsule (segment a-b with radius r). Returns distance along ray or null. */
export function rayCapsule(ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, ax: number, ay: number, az: number, bx: number, by: number, bz: number, r: number, maxT: number): number | null {
  // sample-based robust approach: closest approach between ray and segment, then solve sphere at that point (approximation good for thin capsules)
  const ux = bx - ax, uy = by - ay, uz = bz - az;
  const wx = ax - ox, wy = ay - oy, wz = az - oz;
  const a = dx * dx + dy * dy + dz * dz, b = dx * ux + dy * uy + dz * uz, c = ux * ux + uy * uy + uz * uz;
  const d = dx * wx + dy * wy + dz * wz, e = ux * wx + uy * wy + uz * wz;
  const denom = a * c - b * b;
  let s: number, t: number;
  if (denom < 1e-8) { s = 0; t = d / a; } else { s = (b * d - a * e) / denom; s = Math.max(0, Math.min(1, s)); t = (d + b * s) / a; }
  if (t < 0) t = 0;
  // sphere at segment point closest
  const cx = ax + ux * s, cy = ay + uy * s, cz = az + uz * s;
  const lx = cx - ox, ly = cy - oy, lz = cz - oz;
  const tca = lx * dx + ly * dy + lz * dz;
  const d2 = lx * lx + ly * ly + lz * lz - tca * tca;
  if (d2 > r * r) return null;
  const thc = Math.sqrt(r * r - d2);
  const t0 = tca - thc;
  if (t0 < 0 || t0 > maxT) return null;
  return t0;
}

/** Resolve a hitscan shot: nearest of world/props vs actor hitboxes. */
export function traceShot(pw: PhysicsWorld, shooter: Actor, actors: Actor[], ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, maxDist: number): HitResult {
  const wh = pw.raycast(ox, oy, oz, dx, dy, dz, maxDist, t => t?.kind === 'actor' || t?.kind === 'grenade');
  let best: HitResult = { actor: null, group: null, distance: wh ? wh.distance : maxDist, point: wh ? wh.point : [ox + dx * maxDist, oy + dy * maxDist, oz + dz * maxDist], normal: wh ? wh.normal : null, surface: wh ? wh.tag : null };
  for (const a of actors) {
    if (a === shooter || !a.alive) continue;
    // broad-phase: distance from ray to actor centre
    const cx = a.x - ox, cy = a.y + a.height / 2 - oy, cz = a.z - oz; const tc = cx * dx + cy * dy + cz * dz;
    if (tc < -1 || tc > best.distance + 1.5) continue;
    const pd2 = cx * cx + cy * cy + cz * cz - tc * tc; if (pd2 > 1.6) continue;
    for (const hb of a.hitboxes()) {
      const t = rayCapsule(ox, oy, oz, dx, dy, dz, hb.ax, hb.ay, hb.az, hb.bx, hb.by, hb.bz, hb.r, best.distance);
      if (t !== null && t < best.distance) best = { actor: a, group: hb.group, distance: t, point: [ox + dx * t, oy + dy * t, oz + dz * t], normal: null, surface: 'flesh' };
    }
  }
  return best;
}

export interface DamageResult { damage: number; armorAfter: number; helmetAfter: boolean; }
/** CS-style damage: hitgroup multiplier, range falloff, armour mitigation. */
export function computeDamage(def: WeaponDef, group: 'head' | 'chest' | 'stomach' | 'leg', distanceM: number, armor: number, helmet: boolean): DamageResult {
  let dmg = def.damage * HITGROUP_MULT[group === 'leg' ? 'leg' : group === 'head' ? 'head' : group === 'stomach' ? 'stomach' : 'chest'];
  dmg *= Math.pow(def.rangeModifier, m2u(distanceM) / 500);
  let armorAfter = armor, helmetAfter = helmet;
  const armored = group === 'head' ? helmet && armor > 0 : group !== 'leg' && armor > 0;
  if (armored) {
    const newDmg = dmg * def.armorRatio * 0.5;
    let armorLoss = (dmg - newDmg) * 0.5;
    if (armorLoss > armor) { armorLoss = armor; dmg = dmg - armor * 2; } else dmg = newDmg;
    armorAfter = Math.max(0, armor - armorLoss);
    if (armorAfter <= 0) helmetAfter = false;
  }
  return { damage: Math.max(1, Math.round(dmg)), armorAfter: Math.round(armorAfter), helmetAfter };
}
