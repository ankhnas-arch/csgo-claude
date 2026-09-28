import RAPIER from '@dimforge/rapier3d-compat';
import type { CompiledMap } from '../data/map/compile';
import type { Prop } from '../data/map/layout';

export interface RayHit { distance: number; point: [number, number, number]; normal: [number, number, number]; tag: string; }
export type ColliderTag = { kind: 'world' | 'prop' | 'actor' | 'grenade'; id?: string; material?: string };

/** Thin wrapper around Rapier. Owns the static map collision, character controllers and grenade bodies. */
export class PhysicsWorld {
  world!: RAPIER.World;
  tags = new Map<number, ColliderTag>();
  static async init(): Promise<void> { await RAPIER.init(); }
  constructor() { this.world = new RAPIER.World({ x: 0, y: -20.0, z: 0 }); this.world.timestep = 1 / 64; }
  get R() { return RAPIER; }

  buildStatic(map: CompiledMap): void {
    const body = this.world.createRigidBody(RAPIER.RigidBodyDesc.fixed());
    const add = (desc: RAPIER.ColliderDesc, tag: ColliderTag) => { const c = this.world.createCollider(desc, body); this.tags.set(c.handle, tag); return c; };
    for (const f of map.floors) {
      if (!f.ramp) {
        add(RAPIER.ColliderDesc.cuboid(f.w / 2, 0.5, f.d / 2).setTranslation(f.cx, f.y - 0.5, f.cz), { kind: 'world', material: f.rect.floor ?? 'sand' });
      } else {
        const len = f.ramp.axis === 'x' ? f.w : f.d;
        const dy = f.ramp.yEnd - f.ramp.yStart;
        const ang = Math.atan2(dy, len);
        const slopeLen = Math.hypot(len, dy);
        const cy = (f.ramp.yStart + f.ramp.yEnd) / 2 - 0.5 * Math.cos(ang);
        const q = f.ramp.axis === 'x' ? quatAxis([0, 0, 1], ang) : quatAxis([1, 0, 0], -ang);
        const hx = f.ramp.axis === 'x' ? slopeLen / 2 : f.w / 2, hz = f.ramp.axis === 'x' ? f.d / 2 : slopeLen / 2;
        add(RAPIER.ColliderDesc.cuboid(hx, 0.5, hz).setTranslation(f.cx, cy, f.cz).setRotation({ x: q[0], y: q[1], z: q[2], w: q[3] }), { kind: 'world', material: f.rect.floor ?? 'sand' });
        // small lips at the low end so the character never slips under
      }
    }
    for (const c of map.ceilings) {
      const r = c.rect;
      add(RAPIER.ColliderDesc.cuboid((r.x1 - r.x0) / 2, 0.25, (r.z1 - r.z0) / 2).setTranslation((r.x0 + r.x1) / 2, c.y + 0.25, (r.z0 + r.z1) / 2), { kind: 'world', material: 'ceiling' });
    }
    for (const w of map.walls) {
      const len = Math.hypot(w.x1 - w.x0, w.z1 - w.z0); if (len < 0.05) continue;
      const cx = (w.x0 + w.x1) / 2 + w.outward[0] * 0.2, cz = (w.z0 + w.z1) / 2 + w.outward[1] * 0.2;
      const yaw = Math.atan2(w.x1 - w.x0, w.z1 - w.z0);
      const q = quatAxis([0, 1, 0], yaw);
      add(RAPIER.ColliderDesc.cuboid(0.2, (w.yTop - w.yBase) / 2, len / 2 + 0.2).setTranslation(cx, (w.yTop + w.yBase) / 2, cz).setRotation({ x: q[0], y: q[1], z: q[2], w: q[3] }), { kind: 'world', material: w.mat });
    }
    for (const p of map.props) this.addProp(p, add);
    // world boundary box so nothing can leave
    const B = 80;
    add(RAPIER.ColliderDesc.cuboid(B, 1, B).setTranslation(0, -8, 0), { kind: 'world', material: 'void' });
  }
  private addProp(p: Prop, add: (d: RAPIER.ColliderDesc, t: ColliderTag) => RAPIER.Collider) {
    if (p.collide === false) return;
    const q = quatAxis([0, 1, 0], p.rotY ?? 0);
    const rot = { x: q[0], y: q[1], z: q[2], w: q[3] };
    switch (p.kind) {
      case 'box': case 'container': case 'lowwall': case 'truck': case 'doorleaf': case 'sandbag':
        add(RAPIER.ColliderDesc.cuboid(p.sx / 2, p.sy / 2, p.sz / 2).setTranslation(p.x, p.y + p.sy / 2, p.z).setRotation(rot), { kind: 'prop', id: p.label, material: p.mat ?? 'metal' });
        break;
      case 'barrel':
        add(RAPIER.ColliderDesc.cylinder(p.sy / 2, p.sx / 2).setTranslation(p.x, p.y + p.sy / 2, p.z), { kind: 'prop', material: 'metal' });
        break;
      case 'palm':
        add(RAPIER.ColliderDesc.cylinder(p.sy / 2, 0.25).setTranslation(p.x, p.y + p.sy / 2, p.z), { kind: 'prop', material: 'wood' });
        break;
      default: break;
    }
  }

  /** Raycast against the static world + props only (actors are tested analytically by the combat module). */
  raycast(ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, maxDist: number, excludeTag?: (t: ColliderTag | undefined) => boolean): RayHit | null {
    const ray = new RAPIER.Ray({ x: ox, y: oy, z: oz }, { x: dx, y: dy, z: dz });
    const hit = this.world.castRayAndGetNormal(ray, maxDist, true, undefined, undefined, undefined, undefined, (c) => {
      const t = this.tags.get(c.handle);
      if (excludeTag && excludeTag(t)) return false;
      return true;
    });
    if (!hit) return null;
    const p = ray.pointAt(hit.timeOfImpact);
    const t = this.tags.get(hit.collider.handle);
    return { distance: hit.timeOfImpact, point: [p.x, p.y, p.z], normal: [hit.normal.x, hit.normal.y, hit.normal.z], tag: t?.material ?? 'world' };
  }
  lineOfSight(ax: number, ay: number, az: number, bx: number, by: number, bz: number): boolean {
    const dx = bx - ax, dy = by - ay, dz = bz - az; const d = Math.hypot(dx, dy, dz); if (d < 1e-4) return true;
    const hit = this.raycast(ax, ay, az, dx / d, dy / d, dz / d, d, t => t?.kind === 'actor' || t?.kind === 'grenade');
    return hit === null;
  }
  step(): void { this.world.step(); }
}

export function quatAxis(axis: [number, number, number], angle: number): [number, number, number, number] {
  const s = Math.sin(angle / 2); return [axis[0] * s, axis[1] * s, axis[2] * s, Math.cos(angle / 2)];
}
