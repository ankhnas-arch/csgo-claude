import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { CompiledMap } from '../data/map/compile';
import { BACKDROP, SITES, type Prop, type MatKey } from '../data/map/layout';
import { getMaterial, solid } from './materials';
import { textTexture } from './textures';

/** Builds all static map geometry, merged per material for few draw calls. */
export class MapBuilder {
  group = new THREE.Group();
  private buckets = new Map<THREE.Material, THREE.BufferGeometry[]>();
  private dynamic: THREE.Object3D[] = [];
  build(map: CompiledMap): THREE.Group {
    for (const f of map.floors) this.floor(f);
    for (const w of map.walls) this.wall(w);
    for (const c of map.ceilings) this.ceiling(c);
    for (const p of map.props) this.prop(p);
    this.backdrop();
    this.siteMarkers();
    for (const [mat, geoms] of this.buckets) {
      const merged = mergeGeometries(geoms, false); if (!merged) { console.error('map bucket merge failed for material', (mat as THREE.MeshStandardMaterial).name || mat.uuid, geoms.length); continue; }
      const mesh = new THREE.Mesh(merged, mat); mesh.castShadow = true; mesh.receiveShadow = true; mesh.matrixAutoUpdate = false; this.group.add(mesh);
      for (const g of geoms) g.dispose();
    }
    for (const d of this.dynamic) this.group.add(d);
    return this.group;
  }
  private push(mat: THREE.Material, g: THREE.BufferGeometry, m?: THREE.Matrix4) { if (m) g.applyMatrix4(m); if (!g.index) g = mergeVertices(g); for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'uv') g.deleteAttribute(k); if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2)); let b = this.buckets.get(mat); if (!b) { b = []; this.buckets.set(mat, b); } b.push(g); }
  private box(mat: THREE.Material, w: number, h: number, d: number, x: number, y: number, z: number, rotY = 0, uvScale = 1) {
    const g = new THREE.BoxGeometry(w, h, d); scaleBoxUV(g, w, h, d, uvScale);
    const m = new THREE.Matrix4().makeRotationY(rotY).setPosition(x, y, z); this.push(mat, g, m);
  }
  private floor(f: CompiledMap['floors'][number]) {
    const mat = getMaterial(f.rect.floor ?? 'sand', { repeat: 1 });
    const g = new THREE.PlaneGeometry(f.w, f.d, 1, 1); g.rotateX(-Math.PI / 2);
    const uv = g.attributes.uv as THREE.BufferAttribute; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * f.w / 3, uv.getY(i) * f.d / 3);
    const m = new THREE.Matrix4();
    if (f.ramp) {
      const len = f.ramp.axis === 'x' ? f.w : f.d; const dy = f.ramp.yEnd - f.ramp.yStart; const ang = Math.atan2(dy, len);
      const rot = f.ramp.axis === 'x' ? new THREE.Matrix4().makeRotationZ(ang) : new THREE.Matrix4().makeRotationX(-ang);
      const sl = Math.hypot(len, dy) / len; if (f.ramp.axis === 'x') g.scale(sl, 1, 1); else g.scale(1, 1, sl);
      m.copy(rot).setPosition(f.cx, (f.ramp.yStart + f.ramp.yEnd) / 2 + 0.01, f.cz);
    } else m.setPosition(f.cx, f.y + 0.01, f.cz);
    this.push(mat, g, m);
    // underside filler so nothing is see-through from below the plateau edges
    this.box(getMaterial('concrete'), f.w, 1.0, f.d, f.cx, Math.min(f.y, f.ramp?.yEnd ?? f.y, f.ramp?.yStart ?? f.y) - 0.5, f.cz);
  }
  private wall(w: CompiledMap['walls'][number]) {
    const len = Math.hypot(w.x1 - w.x0, w.z1 - w.z0); if (len < 0.05) return;
    const cx = (w.x0 + w.x1) / 2, cz = (w.z0 + w.z1) / 2; const yaw = Math.atan2(w.x1 - w.x0, w.z1 - w.z0);
    const h = w.yTop - w.yBase; const mat = getMaterial(w.mat, { repeat: 1 });
    const ox = w.outward[0] * 0.25, oz = w.outward[1] * 0.25;
    const inX = -w.outward[0], inZ = -w.outward[1]; // toward the playable side
    if (w.ledge) { // platform retaining wall: stone face + concrete cap
      this.box(getMaterial('stone', { repeat: 1 }), 0.5, h, len + 0.5, cx + ox, w.yBase + h / 2, cz + oz, yaw, 0.5);
      this.box(getMaterial('concrete'), 0.7, 0.12, len + 0.5, cx + ox, w.yTop - 0.06, cz + oz, yaw, 0.5);
      return;
    }
    // main slab (thickness 0.5, pushed outward)
    this.box(mat, 0.5, h, len + 0.5, cx + ox, w.yBase + h / 2, cz + oz, yaw, 0.35);
    // low stone course at the base (subtle, ~0.55 m) and a thin cornice on top
    const plinth = getMaterial('stone', { repeat: 1 });
    this.box(plinth, 0.58, 0.55, len + 0.5, cx + ox, w.yBase + 1.0 + 0.275, cz + oz, yaw, 0.5);
    this.box(getMaterial('concrete'), 0.7, 0.16, len + 0.5, cx + ox, w.yTop - 0.08, cz + oz, yaw, 0.5);
    // detail pass along long walls: recessed windows with wooden lintels, exposed-stone repair patches, small vents
    const hash = Math.abs(Math.round(w.x0 * 7 + w.z0 * 13 + len * 3));
    const along = (t: number) => [w.x0 + (w.x1 - w.x0) * t, w.z0 + (w.z1 - w.z0) * t] as const;
    const floorTop = Math.max(w.yBase + 1.0, w.yTop - h + 1.0);
    if (len > 5 && h > 4.5) {
      const n = Math.max(1, Math.floor(len / 8));
      for (let i = 0; i < n; i++) {
        const t = (i + 0.5) / n + ((hash * (i + 1)) % 7 - 3) * 0.01; const [px, pz] = along(t);
        const kind = (hash + i) % 3;
        const wy = floorTop + 2.6 + ((hash + i * 5) % 3) * 0.35;
        if (kind === 0) { // window: closed wooden shutters in a shallow recess (open dark ones are rarer), lintel + sill
          const open = (hash + i) % 4 === 0;
          this.box(solid('#1a1611', 0.9), 0.26, 1.3, 1.1, px + inX * 0.08, wy, pz + inZ * 0.08, yaw);
          if (!open) { const sh = solid(['#4e6a63', '#6b4b3a', '#5a5a52', '#3d5a7a'][(hash + i) % 4], 0.75); this.box(sh, 0.06, 1.24, 0.5, px + inX * 0.16 + Math.cos(yaw) * 0.27, wy, pz + inZ * 0.16 - Math.sin(yaw) * 0.27, yaw); this.box(sh, 0.06, 1.24, 0.5, px + inX * 0.16 - Math.cos(yaw) * 0.27, wy, pz + inZ * 0.16 + Math.sin(yaw) * 0.27, yaw); const slat = solid('#111', 0.8); for (let k = 1; k < 7; k++) { this.box(slat, 0.065, 0.02, 0.44, px + inX * 0.16 + Math.cos(yaw) * 0.27, wy - 0.62 + k * 0.18, pz + inZ * 0.16 - Math.sin(yaw) * 0.27, yaw); this.box(slat, 0.065, 0.02, 0.44, px + inX * 0.16 - Math.cos(yaw) * 0.27, wy - 0.62 + k * 0.18, pz + inZ * 0.16 + Math.sin(yaw) * 0.27, yaw); } }
          this.box(getMaterial('timber'), 0.34, 0.14, 1.4, px + inX * 0.12, wy + 0.72, pz + inZ * 0.12, yaw);
          this.box(getMaterial('stone'), 0.36, 0.1, 1.3, px + inX * 0.16, wy - 0.7, pz + inZ * 0.16, yaw);
          if (open) { const bar = solid('#2b2926', 0.5, 0.6); for (const dz of [-0.3, 0, 0.3]) this.box(bar, 0.03, 1.25, 0.03, px + inX * 0.06 + Math.cos(yaw) * dz, wy, pz + inZ * 0.06 - Math.sin(yaw) * dz, yaw); }
        } else if (kind === 1) { // exposed stone repair patch
          this.box(getMaterial('stone', { repeat: 2 }), 0.06, 0.9 + (hash % 3) * 0.3, 1.2 + (hash % 2) * 0.6, px + inX * 0.02, floorTop + 1.5 + (hash % 4) * 0.3, pz + inZ * 0.02, yaw, 1);
        } else { // wooden beam ends / drain pipe
          this.box(solid('#4a3a2a', 0.8), 0.5, 0.18, 0.18, px + inX * 0.2, floorTop + 3.6, pz + inZ * 0.2, yaw);
          this.box(solid('#7c7267', 0.6, 0.4), 0.1, h - 1.2, 0.1, px + inX * 0.1 + Math.cos(yaw) * 0.6, w.yBase + 1.0 + (h - 1.2) / 2, pz + inZ * 0.1 - Math.sin(yaw) * 0.6, yaw);
        }
      }
    }
    // occasional wall lamp on the shady side for interiors/night-time look (unlit, decorative)
    void hash;
  }
  private ceiling(c: CompiledMap['ceilings'][number]) {
    const r = c.rect; const w = r.x1 - r.x0, d = r.z1 - r.z0; const isTimber = r.wall === 'timber' || r.id === 'ct_ramp';
    // warm fill lights so covered passages stay legible (no shadows: cheap)
    const nl = Math.max(1, Math.round(Math.max(w, d) / 10));
    for (let i = 0; i < nl; i++) {
      const t = (i + 0.5) / nl; const lx = w >= d ? r.x0 + w * t : (r.x0 + r.x1) / 2, lz = w >= d ? (r.z0 + r.z1) / 2 : r.z0 + d * t;
      const light = new THREE.PointLight('#ffd9a8', 6, 14, 1.6); light.position.set(lx, c.y - 0.6, lz); this.dynamic.push(light);
      const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.08, 8, 6), new THREE.MeshStandardMaterial({ color: '#fff2cc', emissive: '#ffd27a', emissiveIntensity: 1.5 })); bulb.position.set(lx, c.y - 0.55, lz); this.dynamic.push(bulb);
      const cord = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.01, 0.5, 4), solid('#111')); cord.position.set(lx, c.y - 0.28, lz); this.dynamic.push(cord);
    }
    this.box(getMaterial(isTimber ? 'timber' : 'plasterPale', { repeat: 1 }), w + 1, 0.5, d + 1, (r.x0 + r.x1) / 2, c.y + 0.25, (r.z0 + r.z1) / 2, 0, 0.4);
    // beams under the ceiling for tunnels/doors
    const beams = Math.max(1, Math.floor(Math.max(w, d) / 2.5));
    for (let i = 0; i < beams; i++) {
      const t = (i + 0.5) / beams;
      if (w >= d) this.box(getMaterial('timber'), 0.25, 0.3, d + 0.6, r.x0 + w * t, c.y - 0.15, (r.z0 + r.z1) / 2);
      else this.box(getMaterial('timber'), w + 0.6, 0.3, 0.25, (r.x0 + r.x1) / 2, c.y - 0.15, r.z0 + d * t);
    }
  }
  private prop(p: Prop) {
    const y = p.y; const rot = p.rotY ?? 0;
    switch (p.kind) {
      case 'box': { this.box(getMaterial(p.mat ?? 'crate'), p.sx, p.sy, p.sz, p.x, y + p.sy / 2, p.z, rot, 1); if ((p.mat ?? 'crate') === 'crate') { const edge = getMaterial('timber'); const e = 0.06; for (const [dx, dz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) { const lx = dx * (p.sx / 2 - e), lz = dz * (p.sz / 2 - e); const c = Math.cos(rot), s = Math.sin(rot); this.box(edge, e * 2, p.sy + 0.02, e * 2, p.x + lx * c + lz * s, y + p.sy / 2, p.z - lx * s + lz * c, rot); } } break; }
      case 'barrel': { const g = new THREE.CylinderGeometry(p.sx / 2, p.sx / 2, p.sy, 18); const m = new THREE.Matrix4().setPosition(p.x, y + p.sy / 2, p.z); this.push(getMaterial(p.mat ?? 'metalRust'), g, m); for (const t of [0.25, 0.75]) { const r = new THREE.TorusGeometry(p.sx / 2 + 0.01, 0.02, 6, 24); const mm = new THREE.Matrix4().makeRotationX(Math.PI / 2).setPosition(p.x, y + p.sy * t, p.z); this.push(solid('#2a2622', 0.5, 0.6), r, mm); } break; }
      case 'container': {
        this.box(getMaterial('metalBlue', { repeat: 1 }), p.sx, p.sy, p.sz, p.x, y + p.sy / 2, p.z, rot, 1);
        const frame = solid('#1a2a44', 0.6, 0.6); const c = Math.cos(rot), s = Math.sin(rot);
        for (const [dx, dz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) { const lx = dx * p.sx / 2, lz = dz * p.sz / 2; this.box(frame, 0.12, p.sy + 0.04, 0.12, p.x + lx * c + lz * s, y + p.sy / 2, p.z - lx * s + lz * c, rot); }
        // top rails + door bars on the end
        this.box(frame, p.sx + 0.04, 0.1, 0.1, p.x + (p.sz / 2) * s, y + p.sy, p.z + (p.sz / 2) * c, rot); this.box(frame, p.sx + 0.04, 0.1, 0.1, p.x - (p.sz / 2) * s, y + p.sy, p.z - (p.sz / 2) * c, rot);
        for (const bx of [-0.6, -0.2, 0.2, 0.6]) this.box(solid('#c9c3b8', 0.4, 0.8), 0.05, p.sy - 0.3, 0.05, p.x + bx * c + (p.sz / 2 + 0.04) * s, y + p.sy / 2, p.z - bx * s + (p.sz / 2 + 0.04) * c, rot);
        break; }
      case 'lowwall': this.box(getMaterial(p.mat ?? 'plasterPale'), p.sx, p.sy, p.sz, p.x, y + p.sy / 2, p.z, rot, 1); this.box(getMaterial('stone'), p.sx + 0.1, 0.12, p.sz + 0.1, p.x, y + p.sy + 0.06, p.z, rot); break;
      case 'sandbag': { const m = solid('#8a7a55', 0.95); for (let i = 0; i < 3; i++) for (let j = 0; j < 4; j++) { const g = new THREE.BoxGeometry(p.sx / 4 - 0.04, p.sy / 3 - 0.02, p.sz); (g as any).userData = {}; const mm = new THREE.Matrix4().makeRotationY(rot).setPosition(p.x + Math.cos(rot) * (-p.sx / 2 + p.sx / 8 + j * p.sx / 4 + (i % 2) * 0.12), y + p.sy / 6 + i * p.sy / 3, p.z - Math.sin(rot) * (-p.sx / 2 + p.sx / 8 + j * p.sx / 4 + (i % 2) * 0.12)); this.push(m, g, mm); } break; }
      case 'truck': {
        const body = solid(p.color ?? '#5f8fb4', 0.5, 0.35), dark = solid('#1d1d1f', 0.7), glass = solid('#a9c4d6', 0.15, 0.5), chrome = solid('#cfd3d8', 0.3, 0.9), rust = getMaterial('metalRust', { repeat: 1 });
        const c = Math.cos(rot), s = Math.sin(rot); const at = (lx: number, ly: number, lz: number) => [p.x + lx * c + lz * s, y + ly, p.z - lx * s + lz * c] as const;
        const W = p.sx, L = p.sz; let q;
        q = at(0, 0.62, -L / 2 + 1.05); this.box(body, W, 0.75, 2.1, q[0], q[1], q[2], rot);          // hood/front
        q = at(0, 1.02, -L / 2 + 0.55); this.box(body, W - 0.1, 0.05, 1.1, q[0], q[1], q[2], rot);     // hood top ridge
        q = at(0, 1.38, -L / 2 + 1.75); this.box(body, W - 0.16, 0.95, 1.5, q[0], q[1], q[2], rot);   // cab
        q = at(0, 1.55, -L / 2 + 1.0); this.box(glass, W - 0.5, 0.55, 0.06, q[0], q[1], q[2], rot);    // windshield
        for (const sx of [-1, 1]) { q = at(sx * (W / 2 - 0.05), 1.55, -L / 2 + 1.75); this.box(glass, 0.04, 0.5, 0.9, q[0], q[1], q[2], rot); }
        q = at(0, 0.55, -L / 2 + 0.05); this.box(chrome, W - 0.3, 0.16, 0.12, q[0], q[1], q[2], rot);  // bumper
        q = at(0, 0.8, -L / 2 + 0.02); this.box(dark, W * 0.5, 0.3, 0.06, q[0], q[1], q[2], rot);      // grille
        for (const sx of [-1, 1]) { q = at(sx * (W / 2 - 0.3), 0.85, -L / 2 + 0.0); const g = new THREE.CylinderGeometry(0.11, 0.11, 0.06, 12); this.push(chrome, g, new THREE.Matrix4().makeRotationY(rot).multiply(new THREE.Matrix4().makeRotationX(Math.PI / 2)).setPosition(q[0], q[1], q[2])); }
        q = at(0, 0.62, 0.95); this.box(rust, W, 0.5, L - 2.6, q[0], q[1], q[2], rot);                  // bed floor/body
        for (const sx of [-1, 1]) { q = at(sx * (W / 2 - 0.05), 0.98, 0.95); this.box(body, 0.08, 0.45, L - 2.6, q[0], q[1], q[2], rot); }
        q = at(0, 0.98, L / 2 - 0.05); this.box(body, W, 0.45, 0.08, q[0], q[1], q[2], rot);           // tailgate
        for (const [lx, lz] of [[-0.95, -1.55], [0.95, -1.55], [-0.95, 1.5], [0.95, 1.5]]) { q = at(lx, 0.4, lz); const g = new THREE.CylinderGeometry(0.4, 0.4, 0.28, 16); const mm = new THREE.Matrix4().makeRotationY(rot).multiply(new THREE.Matrix4().makeRotationZ(Math.PI / 2)).setPosition(q[0], q[1], q[2]); this.push(dark, g, mm); const hub = new THREE.CylinderGeometry(0.16, 0.16, 0.3, 10); this.push(chrome, hub, mm.clone()); }
        break; }
      case 'doorleaf': {
        const wood = getMaterial('woodOld', { repeat: 1 }); this.box(wood, p.sx, p.sy, p.sz, p.x, y + p.sy / 2, p.z, rot, 1);
        const iron = solid('#3a3835', 0.55, 0.7); const c = Math.cos(rot), s = Math.sin(rot);
        for (const fy of [0.25, 0.75]) this.box(iron, p.sx - 0.1, 0.12, p.sz + 0.03, p.x, y + p.sy * fy, p.z, rot);
        for (let i = 0; i < 6; i++) for (const fy of [0.25, 0.75]) { const lx = -p.sx / 2 + 0.2 + i * (p.sx - 0.4) / 5; const g = new THREE.SphereGeometry(0.035, 8, 6); const mm = new THREE.Matrix4().setPosition(p.x + lx * c + (p.sz / 2 + 0.02) * s, y + p.sy * fy, p.z - lx * s + (p.sz / 2 + 0.02) * c); this.push(iron, g, mm); }
        // ring handle
        const ring = new THREE.TorusGeometry(0.12, 0.02, 8, 20); const mm = new THREE.Matrix4().makeRotationY(rot).setPosition(p.x + (p.sx * 0.3) * c + (p.sz / 2 + 0.03) * s, y + p.sy * 0.5, p.z - (p.sx * 0.3) * s + (p.sz / 2 + 0.03) * c); this.push(iron, ring, mm);
        break; }
      case 'arch': {
        // pointed arch: two piers and a pointed head built from a shape extrusion
        const pier = getMaterial('stone', { repeat: 1 });
        this.box(pier, 0.6, p.sy * 0.7, p.sz, p.x - p.sx / 2 + 0.3, y + p.sy * 0.35, p.z, rot); this.box(pier, 0.6, p.sy * 0.7, p.sz, p.x + p.sx / 2 - 0.3, y + p.sy * 0.35, p.z, rot);
        const shape = new THREE.Shape(); const hw = p.sx / 2, h0 = p.sy * 0.7, ht = p.sy;
        shape.moveTo(-hw - 0.6, h0 - 0.5); shape.lineTo(-hw, h0 - 0.5); shape.quadraticCurveTo(-hw * 0.5, ht - 0.3, 0, ht - 0.05); shape.quadraticCurveTo(hw * 0.5, ht - 0.3, hw, h0 - 0.5); shape.lineTo(hw + 0.6, h0 - 0.5); shape.lineTo(hw + 0.6, ht + 0.6); shape.lineTo(-hw - 0.6, ht + 0.6); shape.closePath();
        const g = new THREE.ExtrudeGeometry(shape, { depth: p.sz, bevelEnabled: false }); g.translate(0, 0, -p.sz / 2);
        const m = new THREE.Matrix4().makeRotationY(rot).setPosition(p.x, y, p.z); this.push(getMaterial('plasterPale', { repeat: 1 }), g, m);
        break; }
      case 'awning': { const g = new THREE.BoxGeometry(p.sx, 0.06, p.sz); const m = new THREE.Matrix4().makeRotationZ(0.45).setPosition(p.x, y, p.z); this.push(getMaterial('canvasRed'), g, m); for (const dz of [-1, 1]) this.box(solid('#3a3835', 0.5, 0.7), 0.05, 0.05, 1.4, p.x - 0.4, y - 0.35, p.z + dz * (p.sz / 2 - 0.1), 0); break; }
      case 'sign': { const mat = new THREE.MeshStandardMaterial({ map: textTexture(p.label ?? 'SHOP', '#f2e6c8', '#7a2a1c'), roughness: 0.8 }); const g = new THREE.PlaneGeometry(p.sz, p.sy); g.rotateY(-Math.PI / 2); const mesh = new THREE.Mesh(g, mat); mesh.position.set(p.x, y, p.z); mesh.castShadow = false; this.dynamic.push(mesh); break; }
      case 'lamp': { const iron = solid('#2b2926', 0.5, 0.6); this.box(iron, 0.06, 0.06, 0.5, p.x, y, p.z + 0.25); const g = new THREE.ConeGeometry(0.22, 0.25, 8, 1, true); const m = new THREE.Matrix4().setPosition(p.x, y - 0.1, p.z + 0.5); this.push(iron, g, m); const bulb = new THREE.SphereGeometry(0.07, 8, 6); this.push(new THREE.MeshStandardMaterial({ color: '#ffe9b0', emissive: '#ffd27a', emissiveIntensity: 0.6 }), bulb, new THREE.Matrix4().setPosition(p.x, y - 0.2, p.z + 0.5)); break; }
      case 'palm': {
        const trunk = new THREE.CylinderGeometry(0.16, 0.26, p.sy, 8); const m = new THREE.Matrix4().makeRotationZ(0.06).setPosition(p.x, y + p.sy / 2, p.z); this.push(getMaterial('timber', { repeat: 1 }), trunk, m);
        const leaf = new THREE.MeshStandardMaterial({ color: '#4f7a2c', roughness: 0.85, side: THREE.DoubleSide });
        for (let i = 0; i < 14; i++) { const ang = i / 14 * Math.PI * 2 + (i % 2) * 0.2; const g = new THREE.PlaneGeometry(0.42, 2.8, 1, 6); const pos = g.attributes.position as THREE.BufferAttribute; for (let k = 0; k < pos.count; k++) { const yy = pos.getY(k) + 1.4; pos.setY(k, yy); pos.setZ(k, -Math.pow(Math.max(0, yy) / 2.8, 2) * 1.6); pos.setX(k, pos.getX(k) * (1 - Math.abs(yy) / 3.2)); } g.computeVertexNormals(); const mm = new THREE.Matrix4().makeRotationY(ang).multiply(new THREE.Matrix4().makeRotationX(-0.9 - (i % 3) * 0.25)).setPosition(p.x, y + p.sy - 0.15, p.z); this.push(leaf, g, mm); }
        break; }
      case 'cable': { const g = new THREE.CylinderGeometry(0.015, 0.015, p.sx, 5); const m = new THREE.Matrix4().makeRotationZ(Math.PI / 2).setPosition(p.x, y, p.z); this.push(solid('#1b1b1b', 0.7), g, m); break; }
      case 'shutter': { const m = solid(p.color ?? '#3e6f6a', 0.7, 0.2); this.box(m, p.sx, p.sy, p.sz, p.x, y + p.sy / 2, p.z); const slat = solid('#111', 0.8); for (let i = 1; i < 9; i++) this.box(slat, p.sx + 0.01, 0.02, p.sz - 0.2, p.x - 0.005, y + p.sy * i / 9, p.z); this.box(getMaterial('stone'), 0.2, 0.15, p.sz + 0.4, p.x, y + p.sy + 0.08, p.z); break; }
      case 'timberframe': { const t = getMaterial('timber'); const hx = p.sx / 2, hz = p.sz / 2; for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) this.box(t, 0.28, p.sy, 0.28, p.x + dx * hx, y + p.sy / 2, p.z + dz * hz); this.box(t, p.sx + 0.4, 0.3, 0.3, p.x, y + p.sy - 0.15, p.z - hz); this.box(t, p.sx + 0.4, 0.3, 0.3, p.x, y + p.sy - 0.15, p.z + hz); for (let i = 0; i < 4; i++) this.box(t, 0.22, 0.22, p.sz + 0.4, p.x - hx + (i + 0.5) * p.sx / 4, y + p.sy - 0.2, p.z); break; }
      case 'stairs': break;
      case 'window': { this.box(solid('#151311', 0.9), p.sx + 0.2, p.sy, p.sz, p.x, y, p.z); this.box(getMaterial('woodOld'), 0.08, p.sy + 0.16, p.sz + 0.16, p.x + 0.12, y, p.z); const bar = solid('#2b2926', 0.5, 0.6); for (const dz of [-0.3, 0, 0.3]) this.box(bar, 0.03, p.sy, 0.03, p.x + 0.1, y, p.z + dz); break; }
      case 'dish': { const g = new THREE.SphereGeometry(p.sx / 2, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2); const m = new THREE.Matrix4().makeRotationX(Math.PI / 2 + 0.5).setPosition(p.x, y, p.z); this.push(solid('#d8d4cc', 0.6, 0.3), g, m); this.box(solid('#2b2926'), 0.06, 1.0, 0.06, p.x, y - 0.5, p.z); break; }
      case 'curb': { for (let i = 0; i < Math.floor(p.sz); i++) this.box(solid(i % 2 ? '#c8302a' : '#e9e2d4', 0.8), p.sx, p.sy, 1.0, p.x, y + p.sy / 2, p.z - p.sz / 2 + i + 0.5); break; }
    }
  }
  private backdrop() {
    const win = windowMaterial();
    const tints: MatKey[] = ['plasterWarm', 'plasterPale', 'concrete'];
    BACKDROP.forEach((b, bi) => {
      const mat = getMaterial(tints[(bi * 7 + Math.abs(b.x)) % 3], { repeat: 1 });
      this.box(mat, b.sx, b.h, b.sz, b.x, -1 + b.h / 2, b.z, 0, 0.3);
      // recessed windows (small, spaced) on each side, only above the typical wall height so they read as far buildings
      const floors = Math.max(1, Math.floor(b.h / 3.2));
      for (let f = 0; f < floors; f++) {
        const yy = -1 + 2.0 + f * 3.2; if (yy < 4.5) continue;
        const nx = Math.max(1, Math.floor(b.sx / 3.5)), nz = Math.max(1, Math.floor(b.sz / 3.5));
        for (let i = 0; i < nx; i++) for (const side of [-1, 1]) { const x = b.x - b.sx / 2 + (i + 0.5) * b.sx / nx; this.box(win, 0.9, 1.2, 0.3, x, yy, b.z + side * (b.sz / 2 - 0.1)); this.box(getMaterial('plasterPale'), 1.2, 0.14, 0.4, x, yy + 0.67, b.z + side * (b.sz / 2 - 0.1)); }
        for (let i = 0; i < nz; i++) for (const side of [-1, 1]) { const z = b.z - b.sz / 2 + (i + 0.5) * b.sz / nz; this.box(win, 0.3, 1.2, 0.9, b.x + side * (b.sx / 2 - 0.1), yy, z); this.box(getMaterial('plasterPale'), 0.4, 0.14, 1.2, b.x + side * (b.sx / 2 - 0.1), yy + 0.67, z); }
      }
      // parapet, rooftop clutter (water tank, AC box, dish)
      this.box(getMaterial('concrete'), b.sx + 0.4, 0.4, b.sz + 0.4, b.x, -1 + b.h + 0.2, b.z);
      if (bi % 2 === 0) { const g = new THREE.CylinderGeometry(0.7, 0.7, 1.2, 12); this.push(solid('#b9b3a6', 0.7, 0.3), g, new THREE.Matrix4().setPosition(b.x + b.sx * 0.25, -1 + b.h + 1.0, b.z - b.sz * 0.2)); }
      if (bi % 3 === 0) this.box(solid('#8f8a80', 0.6, 0.4), 1.2, 0.8, 1.0, b.x - b.sx * 0.25, -1 + b.h + 0.8, b.z + b.sz * 0.2);
      if (b.dome) { const g = new THREE.SphereGeometry(Math.min(b.sx, b.sz) * 0.36, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2); const m = new THREE.Matrix4().setPosition(b.x, -1 + b.h + 0.3, b.z); this.push(solid('#cfd9dd', 0.5, 0.2), g, m); const drum = new THREE.CylinderGeometry(Math.min(b.sx, b.sz) * 0.36, Math.min(b.sx, b.sz) * 0.36, 1.2, 20); this.push(getMaterial('plasterPale', { repeat: 1 }), drum, new THREE.Matrix4().setPosition(b.x, -1 + b.h + 0.4, b.z)); }
      if (b.minaret) { const g = new THREE.CylinderGeometry(0.9, 1.1, 9, 12); const m = new THREE.Matrix4().setPosition(b.x + b.sx * 0.3, -1 + b.h + 4.5, b.z); this.push(getMaterial('plasterPale', { repeat: 1 }), g, m); const ring = new THREE.CylinderGeometry(1.3, 1.3, 0.5, 12); this.push(getMaterial('stone'), ring, new THREE.Matrix4().setPosition(b.x + b.sx * 0.3, -1 + b.h + 8.5, b.z)); const cone = new THREE.ConeGeometry(1.1, 2.2, 12); this.push(solid('#3f5f72', 0.5), cone, new THREE.Matrix4().setPosition(b.x + b.sx * 0.3, -1 + b.h + 10.1, b.z)); }
    });
    // ground fill far below/around, sky handled by Scene
    this.box(getMaterial('sand', { repeat: 12 }), 240, 0.5, 240, 0, -2.3, 0, 0, 0.1);
  }
  private siteMarkers() {
    // painted site letters on the ground (original decals)
    for (const s of SITES) {
      const mat = new THREE.MeshStandardMaterial({ map: textTexture(s.id, 'rgba(0,0,0,0)', '#e0d6c0', 256, 256, 'bold 200px Arial'), transparent: true, roughness: 1, depthWrite: false, opacity: 0.85 });
      const g = new THREE.PlaneGeometry(4, 4); g.rotateX(-Math.PI / 2);
      const mesh = new THREE.Mesh(g, mat); mesh.position.set((s.x0 + s.x1) / 2, s.y + 0.02, (s.z0 + s.z1) / 2); mesh.receiveShadow = true; this.dynamic.push(mesh);
    }
  }
}
function scaleBoxUV(g: THREE.BoxGeometry, w: number, h: number, d: number, s: number) {
  const uv = g.attributes.uv as THREE.BufferAttribute; // faces: +x,-x (d×h), +y,-y (w×d), +z,-z (w×h) — 4 verts each
  const sizes = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
  for (let f = 0; f < 6; f++) for (let i = 0; i < 4; i++) { const k = f * 4 + i; uv.setXY(k, uv.getX(k) * sizes[f][0] * s, uv.getY(k) * sizes[f][1] * s); }
}
let winMat: THREE.MeshStandardMaterial | null = null;
function windowMaterial() { if (!winMat) winMat = new THREE.MeshStandardMaterial({ color: '#5a6a78', roughness: 0.3, metalness: 0.3 }); return winMat; }
export { MatKey };
