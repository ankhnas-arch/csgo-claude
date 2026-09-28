import * as THREE from 'three';
import type { Actor } from '../sim/actor';

/** Pooled visual effects: muzzle flashes, tracers, impact sparks/dust, decals, brass, smoke volumes, fire, explosions. */
class Pool<T extends THREE.Object3D> {
  free: T[] = []; used: T[] = [];
  constructor(private make: () => T, private parent: THREE.Object3D, n: number) { for (let i = 0; i < n; i++) { const o = make(); o.visible = false; parent.add(o); this.free.push(o); } }
  get(): T | null { const o = this.free.pop(); if (!o) { if (this.used.length) { const r = this.used.shift()!; return r; } return null; } this.used.push(o); o.visible = true; return o; }
  release(o: T) { const i = this.used.indexOf(o); if (i >= 0) this.used.splice(i, 1); o.visible = false; this.free.push(o); }
  get activeCount() { return this.used.length; }
}
interface Timed { o: THREE.Object3D; t: number; life: number; kind: string; v?: THREE.Vector3; }

export class Effects {
  group = new THREE.Group();
  private timed: Timed[] = [];
  private sparks: Pool<THREE.Mesh>; private dust: Pool<THREE.Sprite>; private decals: Pool<THREE.Mesh>; private brass: Pool<THREE.Mesh>; private tracers: Pool<THREE.Mesh>; private puffs: Pool<THREE.Sprite>; private flames: Pool<THREE.Sprite>;
  private smokeMat: THREE.SpriteMaterial; private fireMat: THREE.SpriteMaterial; private dustMat: THREE.SpriteMaterial; private flashMat: THREE.SpriteMaterial;
  smokeClouds = new Map<number, THREE.Sprite[]>(); fireClouds = new Map<number, { sprites: THREE.Sprite[]; light: THREE.PointLight }>();
  explosionLight = new THREE.PointLight('#ffb070', 0, 25, 2);
  reducedMotion = false;
  constructor(quality: 'low' | 'medium' | 'high') {
    const puffTex = radialTexture(128, 0.35, 0.02), softTex = radialTexture(128, 0.1, 0.0), fireTex = radialTexture(96, 0.5, 0.15);
    this.smokeMat = new THREE.SpriteMaterial({ map: puffTex, color: '#d9d6ce', transparent: true, opacity: 0.55, depthWrite: false });
    this.fireMat = new THREE.SpriteMaterial({ map: fireTex, color: '#ff9a2e', transparent: true, opacity: 0.85, depthWrite: false, blending: THREE.AdditiveBlending });
    this.dustMat = new THREE.SpriteMaterial({ map: softTex, color: '#cbb894', transparent: true, opacity: 0.6, depthWrite: false });
    this.flashMat = new THREE.SpriteMaterial({ map: fireTex, color: '#ffd8a0', transparent: true, opacity: 1, depthWrite: false, blending: THREE.AdditiveBlending });
    const n = quality === 'low' ? 0.5 : 1;
    this.sparks = new Pool(() => new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.02, 0.08), new THREE.MeshBasicMaterial({ color: '#ffd28a' })), this.group, Math.round(80 * n));
    this.dust = new Pool(() => new THREE.Sprite(this.dustMat.clone()), this.group, Math.round(60 * n));
    this.decals = new Pool(() => { const m = new THREE.Mesh(new THREE.PlaneGeometry(0.09, 0.09), new THREE.MeshBasicMaterial({ map: radialTexture(32, 0.7, 0.3), color: '#1a1712', transparent: true, opacity: 0.85, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 })); return m; }, this.group, Math.round(120 * n));
    this.brass = new Pool(() => new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.03, 6), new THREE.MeshStandardMaterial({ color: '#d4a640', metalness: 0.9, roughness: 0.3 })), this.group, Math.round(40 * n));
    this.tracers = new Pool(() => new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.012, 1), new THREE.MeshBasicMaterial({ color: '#ffe7b0', transparent: true, opacity: 0.7 })), this.group, Math.round(30 * n));
    this.puffs = new Pool(() => new THREE.Sprite(this.smokeMat.clone()), this.group, Math.round(160 * n));
    this.flames = new Pool(() => new THREE.Sprite(this.fireMat.clone()), this.group, Math.round(90 * n));
    this.group.add(this.explosionLight);
  }
  private add(o: THREE.Object3D, life: number, kind: string, v?: THREE.Vector3) { this.timed.push({ o, t: 0, life, kind, v }); }
  impact(p: [number, number, number], n: [number, number, number] | null, surface: string | null) {
    const nn = n ?? [0, 1, 0];
    const flesh = surface === 'flesh';
    const count = flesh ? 5 : 4;
    for (let i = 0; i < count; i++) {
      const s = this.sparks.get(); if (!s) break;
      (s.material as THREE.MeshBasicMaterial).color.set(flesh ? '#8a1414' : surface === 'metal' || surface?.startsWith('metal') ? '#ffe090' : '#c9b08a');
      s.position.set(p[0], p[1], p[2]);
      const v = new THREE.Vector3(nn[0] + (Math.random() - 0.5) * 1.4, nn[1] + Math.random() * 1.2, nn[2] + (Math.random() - 0.5) * 1.4).multiplyScalar(2 + Math.random() * 3);
      s.lookAt(s.position.clone().add(v)); this.add(s, 0.25 + Math.random() * 0.2, 'spark', v);
    }
    if (!flesh) {
      const d = this.dust.get(); if (d) { d.position.set(p[0] + nn[0] * 0.05, p[1] + nn[1] * 0.05, p[2] + nn[2] * 0.05); d.scale.setScalar(0.25); (d.material as THREE.SpriteMaterial).opacity = 0.5; this.add(d, 0.45, 'dust'); }
      const dec = this.decals.get(); if (dec) { dec.position.set(p[0] + nn[0] * 0.01, p[1] + nn[1] * 0.01, p[2] + nn[2] * 0.01); dec.lookAt(dec.position.clone().add(new THREE.Vector3(nn[0], nn[1], nn[2]))); dec.rotateZ(Math.random() * 6); this.add(dec, 25, 'decal'); }
    }
  }
  tracer(o: [number, number, number], h: [number, number, number]) {
    const t = this.tracers.get(); if (!t) return;
    const a = new THREE.Vector3(...o), b = new THREE.Vector3(...h); const len = a.distanceTo(b); if (len < 2) { this.tracers.release(t); return; }
    t.position.copy(a).lerp(b, 0.5); t.scale.set(1, 1, Math.min(len, 12)); t.lookAt(b); this.add(t, 0.06, 'tracer');
  }
  brassEject(pos: THREE.Vector3, right: THREE.Vector3) {
    const b = this.brass.get(); if (!b) return; b.position.copy(pos);
    const v = right.clone().multiplyScalar(1.6 + Math.random()).add(new THREE.Vector3(0, 1.6 + Math.random(), 0)); b.rotation.set(Math.random() * 3, Math.random() * 3, 0); this.add(b, 1.2, 'brass', v);
  }
  worldMuzzle(pos: THREE.Vector3) { const f = new THREE.Sprite(this.flashMat); f.position.copy(pos); f.scale.setScalar(0.35 + Math.random() * 0.2); this.group.add(f); this.add(f, 0.05, 'flash'); }
  explosion(p: [number, number, number], big: boolean) {
    const n = big ? 26 : 12;
    for (let i = 0; i < n; i++) { const f = this.flames.get(); if (!f) break; f.position.set(p[0], p[1] + 0.2, p[2]); f.scale.setScalar(big ? 1.5 + Math.random() * 2 : 0.6 + Math.random()); (f.material as THREE.SpriteMaterial).opacity = 0.9; const v = new THREE.Vector3((Math.random() - 0.5), Math.random() * 0.8 + 0.2, (Math.random() - 0.5)).multiplyScalar(big ? 6 : 3.5); this.add(f, big ? 0.9 : 0.45, 'fireball', v); }
    for (let i = 0; i < (big ? 30 : 12); i++) { const d = this.puffs.get(); if (!d) break; d.position.set(p[0], p[1] + 0.3, p[2]); d.scale.setScalar(big ? 2 : 0.8); (d.material as THREE.SpriteMaterial).opacity = 0.45; (d.material as THREE.SpriteMaterial).color.set('#4a4540'); const v = new THREE.Vector3((Math.random() - 0.5), Math.random() * 0.9 + 0.3, (Math.random() - 0.5)).multiplyScalar(big ? 5 : 3); this.add(d, big ? 3.5 : 1.6, 'smokepuff', v); }
    for (let i = 0; i < (big ? 40 : 14); i++) { const s = this.sparks.get(); if (!s) break; s.position.set(p[0], p[1] + 0.2, p[2]); const v = new THREE.Vector3((Math.random() - 0.5), Math.random(), (Math.random() - 0.5)).multiplyScalar(big ? 14 : 7); this.add(s, 0.5 + Math.random() * 0.4, 'spark', v); }
    this.explosionLight.position.set(p[0], p[1] + 1, p[2]); this.explosionLight.intensity = big ? 60 : 25; this.explosionLight.distance = big ? 40 : 18;
  }
  flashPop(p: [number, number, number]) { const f = new THREE.Sprite(this.flashMat); f.position.set(p[0], p[1], p[2]); f.scale.setScalar(3); this.group.add(f); this.add(f, 0.12, 'flash'); this.explosionLight.position.set(p[0], p[1], p[2]); this.explosionLight.intensity = 80; this.explosionLight.distance = 30; }
  /** Smoke volume: cluster of soft sprites, irregular, growing then fading. */
  smokeUpdate(id: number, x: number, y: number, z: number, radius: number, density: number, alive: boolean) {
    let cl = this.smokeClouds.get(id);
    if (!alive) { if (cl) { for (const s of cl) this.puffs.release(s); this.smokeClouds.delete(id); } return; }
    if (!cl) { cl = []; for (let i = 0; i < 22; i++) { const s = this.puffs.get(); if (!s) break; (s.material as THREE.SpriteMaterial).color.set('#d9d6ce'); s.userData.off = new THREE.Vector3((Math.random() - 0.5) * 1.6, (Math.random() - 0.2) * 1.1, (Math.random() - 0.5) * 1.6); s.userData.sz = 0.7 + Math.random() * 0.6; s.userData.rot = Math.random() * 6; cl.push(s); } this.smokeClouds.set(id, cl); }
    for (const s of cl) { const o = s.userData.off as THREE.Vector3; s.position.set(x + o.x * radius, y + 0.9 * radius * 0.6 + o.y * radius * 0.7, z + o.z * radius); s.scale.setScalar(radius * s.userData.sz * 1.4); const m = s.material as THREE.SpriteMaterial; m.opacity = 0.62 * density; m.rotation = s.userData.rot; }
  }
  fireUpdate(id: number, x: number, y: number, z: number, radius: number, alive: boolean, t: number) {
    let cl = this.fireClouds.get(id);
    if (!alive) { if (cl) { for (const s of cl.sprites) this.flames.release(s); this.group.remove(cl.light); this.fireClouds.delete(id); } return; }
    if (!cl) { const sprites: THREE.Sprite[] = []; for (let i = 0; i < 24; i++) { const s = this.flames.get(); if (!s) break; s.userData.off = new THREE.Vector3((Math.random() - 0.5) * 2, 0, (Math.random() - 0.5) * 2); s.userData.ph = Math.random() * 6; sprites.push(s); } const light = new THREE.PointLight('#ff8a30', 18, 14, 2); this.group.add(light); cl = { sprites, light }; this.fireClouds.set(id, cl); }
    for (const s of cl.sprites) { const o = s.userData.off as THREE.Vector3; const fl = 0.75 + Math.sin(t * 12 + s.userData.ph) * 0.25; s.position.set(x + o.x * radius * 0.5, y + 0.25 + fl * 0.35 + Math.abs(o.z) * 0.05, z + o.z * radius * 0.5); s.scale.set(0.9 * fl, 1.1 + fl * 0.5, 1); (s.material as THREE.SpriteMaterial).opacity = 0.75 * fl; (s.material as THREE.SpriteMaterial).color.setHSL(0.06 + fl * 0.03, 1, 0.55); }
    cl.light.position.set(x, y + 0.8, z); cl.light.intensity = 14 + Math.sin(t * 17) * 4;
  }
  update(dt: number) {
    this.explosionLight.intensity *= Math.pow(0.02, dt);
    for (let i = this.timed.length - 1; i >= 0; i--) {
      const e = this.timed[i]; e.t += dt;
      const k = e.t / e.life;
      if (e.v) { e.o.position.addScaledVector(e.v, dt); if (e.kind === 'spark' || e.kind === 'brass') e.v.y -= 12 * dt; if (e.kind === 'fireball' || e.kind === 'smokepuff') { e.v.multiplyScalar(Math.pow(0.15, dt)); } if (e.kind === 'brass' && e.o.position.y < 0.02) { e.v.set(0, 0, 0); } }
      if (e.kind === 'dust' || e.kind === 'smokepuff') { const sc = (e.o.scale.x + dt * (e.kind === 'dust' ? 1.5 : 1.2)); e.o.scale.setScalar(sc); ((e.o as THREE.Sprite).material as THREE.SpriteMaterial).opacity = (e.kind === 'dust' ? 0.5 : 0.45) * (1 - k); }
      if (e.kind === 'fireball') { ((e.o as THREE.Sprite).material as THREE.SpriteMaterial).opacity = 0.9 * (1 - k); e.o.scale.multiplyScalar(1 + dt * 1.5); }
      if (e.kind === 'flash') ((e.o as THREE.Sprite).material as THREE.SpriteMaterial).opacity = 1 - k;
      if (e.kind === 'decal') (e.o as THREE.Mesh).material && ((e.o as THREE.Mesh).material as THREE.MeshBasicMaterial).opacity && (((e.o as THREE.Mesh).material as THREE.MeshBasicMaterial).opacity = 0.85 * (k > 0.8 ? (1 - k) * 5 : 1));
      if (e.t >= e.life) { this.timed.splice(i, 1); this.recycle(e); }
    }
  }
  private recycle(e: Timed) {
    switch (e.kind) { case 'spark': this.sparks.release(e.o as THREE.Mesh); break; case 'dust': this.dust.release(e.o as THREE.Sprite); break; case 'decal': this.decals.release(e.o as THREE.Mesh); break; case 'brass': this.brass.release(e.o as THREE.Mesh); break; case 'tracer': this.tracers.release(e.o as THREE.Mesh); break; case 'smokepuff': ((e.o as THREE.Sprite).material as THREE.SpriteMaterial).color.set('#d9d6ce'); this.puffs.release(e.o as THREE.Sprite); break; case 'fireball': this.flames.release(e.o as THREE.Sprite); break; case 'flash': this.group.remove(e.o); break; }
  }
  clearAll() { for (const e of this.timed.splice(0)) this.recycle(e); for (const id of Array.from(this.smokeClouds.keys())) this.smokeUpdate(id, 0, 0, 0, 0, 0, false); for (const id of Array.from(this.fireClouds.keys())) this.fireUpdate(id, 0, 0, 0, 0, false, 0); }
  get counts() { return { timed: this.timed.length, smokeClouds: this.smokeClouds.size, fireClouds: this.fireClouds.size, puffsActive: this.puffs.activeCount, flamesActive: this.flames.activeCount, decals: this.decals.activeCount }; }
}
export function radialTexture(size: number, inner: number, noise: number): THREE.Texture {
  const c = document.createElement('canvas'); c.width = c.height = size; const ctx = c.getContext('2d')!; const img = ctx.createImageData(size, size);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) { const dx = (x + 0.5) / size - 0.5, dy = (y + 0.5) / size - 0.5; const d = Math.hypot(dx, dy) * 2; let a = d < inner ? 1 : Math.max(0, 1 - (d - inner) / (1 - inner)); a = a * a * (3 - 2 * a); a *= 1 - noise * Math.random(); const i = (y * size + x) * 4; img.data[i] = img.data[i + 1] = img.data[i + 2] = 255; img.data[i + 3] = a * 255; }
  ctx.putImageData(img, 0, 0); const t = new THREE.CanvasTexture(c); return t;
}
export type { Actor };
