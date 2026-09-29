import * as THREE from 'three';
import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import type { Actor } from '../sim/actor';
import type { WeaponInstance } from '../sim/weapon';
import { solid } from './materials';

/**
 * First-person viewmodel. Rendered with its own camera (viewmodel FOV) after the world so it never clips walls.
 * Weapon GLBs are authored in Blender (see tools/blender) with named nodes (muzzle, eject, mag, bolt) and clips
 * (equip, fire, reload, inspect, rechamber). A procedural placeholder is used only if a GLB is missing.
 */
export interface LoadedWeapon { root: THREE.Group; mixer: THREE.AnimationMixer | null; clips: Map<string, THREE.AnimationClip>; muzzle: THREE.Object3D; eject: THREE.Object3D; placeholder: boolean; triangles: number; }
const loader = new GLTFLoader();
const cache = new Map<string, Promise<GLTF | null>>();
export function loadWeaponGLTF(id: string): Promise<GLTF | null> {
  let p = cache.get(id); if (p) return p;
  p = new Promise<GLTF | null>(resolve => loader.load(`./assets/weapons/${id}.glb`, g => resolve(g), undefined, () => resolve(null)));
  cache.set(id, p); return p;
}
export const WEAPON_STATS: Record<string, { triangles: number; placeholder: boolean; clips: string[] }> = {};
export interface AnimMeta { fps: number; clips: Record<string, [number, number]>; events?: Record<string, number> }
const metaCache = new Map<string, Promise<AnimMeta | null>>();
export function loadAnimMeta(id: string): Promise<AnimMeta | null> { let p = metaCache.get(id); if (p) return p; p = fetch(`./assets/weapons/${id}.anim.json`).then(r => r.ok ? r.json() : null).catch(() => null); metaCache.set(id, p); return p; }

export class ViewModel {
  scene = new THREE.Scene(); camera: THREE.PerspectiveCamera;
  pivot = new THREE.Group(); private current: LoadedWeapon | null = null; private currentId = '';
  private loaded = new Map<string, LoadedWeapon>();
  swayX = 0; swayY = 0; bob = 0; kick = 0; kickYaw = 0; private lastAction = ''; private actionClip: THREE.AnimationAction | null = null;
  muzzleFlash: THREE.Sprite; muzzleLight: THREE.PointLight; flashT = 0;
  hidden = false; viewFov = 62; offset = { x: 0.13, y: -0.08, z: -0.27, rx: -0.05, ry: 0.0 };
  constructor(private sunDir: THREE.Vector3) {
    this.camera = new THREE.PerspectiveCamera(this.viewFov, 16 / 9, 0.01, 8);
    this.scene.add(this.pivot);
    const sun = new THREE.DirectionalLight('#fff1d6', 2.6); sun.position.copy(sunDir).multiplyScalar(5); this.scene.add(sun);
    this.scene.add(new THREE.HemisphereLight('#cfe0ff', '#9a7a55', 0.9));
    const tex = flashTexture();
    this.muzzleFlash = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, color: '#ffd9a0', transparent: true, blending: THREE.AdditiveBlending, depthTest: false })); this.muzzleFlash.visible = false; this.scene.add(this.muzzleFlash);
    this.muzzleLight = new THREE.PointLight('#ffc070', 0, 3, 2); this.scene.add(this.muzzleLight);
  }
  async preload(ids: string[]) { await Promise.all(ids.map(id => this.get(id))); }
  private async get(id: string): Promise<LoadedWeapon> {
    const hit = this.loaded.get(id); if (hit) return hit;
    const g = await loadWeaponGLTF(id);
    let lw: LoadedWeapon;
    if (g) {
      const root = g.scene; let tris = 0; root.traverse(o => { if (o.name === 'world') o.visible = false; if ((o as THREE.Mesh).isMesh) { const m = o as THREE.Mesh; m.castShadow = false; m.frustumCulled = false; const idx = m.geometry.index; tris += idx ? idx.count / 3 : m.geometry.attributes.position.count / 3; } });
      const clips = new Map<string, THREE.AnimationClip>(); for (const c of g.animations) clips.set(c.name, c);
      // Blender pipeline: one scene-timeline animation + <id>.anim.json with frame ranges -> subclips
      const meta = await loadAnimMeta(id);
      if (meta && g.animations.length) { const full = g.animations[0]; for (const [name, [s0, s1]] of Object.entries(meta.clips)) { try { clips.set(name, THREE.AnimationUtils.subclip(full, name, s0, s1, meta.fps)); } catch { /* ignore bad range */ } } }
      const mixer = g.animations.length ? new THREE.AnimationMixer(root) : null;
      const muzzle = root.getObjectByName('muzzle') ?? root, eject = root.getObjectByName('eject') ?? root;
      lw = { root, mixer, clips, muzzle, eject, placeholder: false, triangles: tris };
    } else lw = makePlaceholder(id);
    WEAPON_STATS[id] = { triangles: lw.triangles, placeholder: lw.placeholder, clips: Array.from(lw.clips.keys()) };
    this.loaded.set(id, lw); return lw;
  }
  /** Called each frame with the player's actor + interpolation. */
  update(a: Actor, dt: number, lookDx: number, lookDy: number, baseFov: number, reducedMotion: boolean) {
    const w = a.active; const id = w.def.id;
    if (id !== this.currentId) { this.currentId = id; this.pivot.clear(); this.current = null; this.get(id).then(lw => { if (this.currentId === id) { this.current = lw; this.pivot.add(lw.root); this.lastAction = ''; this.play(lw, 'equip', w.def.demo.drawTime, false); } }); }
    const cur = this.current;
    this.hidden = w.zoomLevel > 0 || !a.alive;
    this.pivot.visible = !this.hidden;
    // sway/bob
    const k = reducedMotion ? 0.3 : 1;
    this.swayX += (-lookDx * 0.0006 * k - this.swayX) * Math.min(1, dt * 10); this.swayY += (lookDy * 0.0006 * k - this.swayY) * Math.min(1, dt * 10);
    const sp = a.speed2d; this.bob += dt * Math.min(sp, 6) * 1.6;
    const bobA = (a.grounded ? Math.min(1, sp / 5) : 0) * 0.008 * k;
    this.kick *= Math.pow(0.001, dt); this.kickYaw *= Math.pow(0.001, dt);
    const crouch = a.crouchT;
    const fovScale = baseFov / 90;
    const o = this.offset;
    this.pivot.position.set(o.x * fovScale + this.swayX + Math.sin(this.bob) * bobA + this.kickYaw * 0.02, o.y - crouch * 0.02 + this.swayY + Math.abs(Math.cos(this.bob)) * bobA * 0.7 - this.kick * 0.02, o.z + this.kick * 0.06);
    this.pivot.rotation.set(o.rx + this.swayY * 2 + this.kick * 0.25, o.ry + this.swayX * 2 + this.kickYaw * 0.15, Math.sin(this.bob) * bobA * 0.6);
    if (cur) {
      const act = w.action + (w.action === 'reload' ? '' : '');
      const key = act + ':' + w.recoilIndex;
      if (key !== this.lastAction) {
        this.lastAction = key;
        if (w.action === 'fire') { const clip = w.def.category === 'knife' && w.stab && cur.clips.has('fire2') ? 'fire2' : 'fire'; this.play(cur, clip, w.actionDur, true); if (w.def.category !== 'knife') { this.kick = 1; this.kickYaw = (Math.random() - 0.5) * 0.6; } this.flash(cur); }
        else if (w.action === 'reload') this.play(cur, 'reload', w.actionDur, false);
        else if (w.action === 'inspect') this.play(cur, 'inspect', w.actionDur, false);
        else if (w.action === 'rechamber') this.play(cur, 'rechamber', w.actionDur, false);
        else if (w.action === 'draw') this.play(cur, 'equip', w.actionDur, false);
        else if (w.action === 'throw') this.play(cur, 'fire', w.actionDur, true);
        else if (w.action === 'idle' && (this.actionClip?.getClip().name === 'inspect' || this.actionClip?.getClip().name === 'reload')) { this.actionClip?.fadeOut(0.1); this.actionClip = null; this.play(cur, 'idle', 1, false); }
      }
      cur.mixer?.update(dt);
      if (cur.placeholder) this.proceduralAnim(cur, w);
    }
    this.flashT -= dt; this.muzzleFlash.visible = this.flashT > 0 && !this.hidden; this.muzzleLight.intensity = this.flashT > 0 ? 3 : 0;
    if (this.flashT > 0 && cur) { const p = new THREE.Vector3(); cur.muzzle.getWorldPosition(p); this.muzzleFlash.position.copy(p); this.muzzleFlash.material.rotation = Math.random() * 6; this.muzzleLight.position.copy(p); }
  }
  private flash(cur: LoadedWeapon) { const cat = (cur.root.userData.category as string) ?? ''; if (cat === 'knife' || cat === 'grenade' || cat === 'bomb') return; this.flashT = 0.045; this.muzzleFlash.scale.setScalar(0.16 + Math.random() * 0.1); }
  muzzleWorld(out: THREE.Vector3): boolean { if (!this.current) return false; this.current.muzzle.getWorldPosition(out); return true; }
  ejectWorld(out: THREE.Vector3): boolean { if (!this.current) return false; this.current.eject.getWorldPosition(out); return true; }
  private play(lw: LoadedWeapon, name: string, dur: number, oneShot: boolean) {
    if (!lw.mixer) return; const clip = lw.clips.get(name); if (!clip) return;
    const action = lw.mixer.clipAction(clip); action.reset(); action.setLoop(oneShot || name !== 'idle' ? THREE.LoopOnce : THREE.LoopRepeat, Infinity); action.clampWhenFinished = true;
    action.timeScale = name === 'idle' ? 1 : clip.duration / Math.max(0.05, dur); // scale animation to the rules' duration so events line up
    if (this.actionClip && this.actionClip !== action) { this.actionClip.fadeOut(0.06); }
    action.fadeIn(0.03).play(); this.actionClip = action;
  }
  private proceduralAnim(lw: LoadedWeapon, w: WeaponInstance) {
    const mag = lw.root.getObjectByName('mag'), bolt = lw.root.getObjectByName('bolt'); const t = w.actionTime / Math.max(0.05, w.actionDur);
    if (mag) { mag.position.y = w.action === 'reload' ? (t < 0.5 ? -Math.sin(t * Math.PI) * 0.12 : -Math.sin(t * Math.PI) * 0.12) : 0; mag.rotation.x = w.action === 'reload' ? Math.sin(t * Math.PI) * 0.5 : 0; }
    if (bolt) bolt.position.z = w.action === 'fire' ? Math.sin(t * Math.PI) * 0.04 : w.action === 'rechamber' ? Math.sin(t * Math.PI) * 0.06 : 0;
    lw.root.rotation.z = w.action === 'inspect' ? Math.sin(t * Math.PI) * 0.9 : 0; lw.root.rotation.y = w.action === 'inspect' ? Math.sin(t * Math.PI * 2) * 0.5 : w.action === 'draw' ? (1 - t) * 0.8 : 0; lw.root.position.y = w.action === 'draw' ? -(1 - t) * 0.2 : 0;
  }
  resize(aspect: number) { this.camera.aspect = aspect; this.camera.updateProjectionMatrix(); }
  get currentInfo() { return this.current ? { id: this.currentId, placeholder: this.current.placeholder, triangles: this.current.triangles } : null; }
}
/** Temporary placeholder (checkpoint 1 only): recognisably shaped but unrefined. Replaced by Blender GLBs. */
function makePlaceholder(id: string): LoadedWeapon {
  const root = new THREE.Group(); root.userData.category = id === 'knife' ? 'knife' : ['he', 'flash', 'smoke', 'molotov', 'incendiary'].includes(id) ? 'grenade' : id === 'c4' ? 'bomb' : 'gun';
  const dark = solid('#2a2a2c', 0.5, 0.6), wood = solid('#6b4a2a', 0.7), glove = solid('#222', 0.9);
  const add = (g: THREE.BufferGeometry, m: THREE.Material, x: number, y: number, z: number, name?: string) => { const mesh = new THREE.Mesh(g, m); mesh.position.set(x, y, z); if (name) mesh.name = name; root.add(mesh); return mesh; };
  const muzzle = new THREE.Object3D(); muzzle.name = 'muzzle'; const eject = new THREE.Object3D(); eject.name = 'eject';
  if (root.userData.category === 'gun') {
    const len = id === 'awp' ? 0.9 : id === 'usp' || id === 'glock' ? 0.22 : 0.62;
    add(new THREE.BoxGeometry(0.05, 0.08, len * 0.5), dark, 0, 0, -len * 0.25); add(new THREE.CylinderGeometry(0.012, 0.012, len * 0.55, 8).rotateX(Math.PI / 2), dark, 0, 0.02, -len * 0.7);
    add(new THREE.BoxGeometry(0.035, 0.14, 0.05), id === 'ak47' ? wood : dark, 0, -0.1, -0.05, 'mag'); add(new THREE.BoxGeometry(0.03, 0.05, 0.03), dark, 0.03, 0.02, -0.05, 'bolt');
    if (len > 0.3) add(new THREE.BoxGeometry(0.04, 0.07, 0.2), id === 'ak47' ? wood : dark, 0, -0.01, 0.15);
    if (id === 'awp') add(new THREE.CylinderGeometry(0.02, 0.02, 0.22, 10).rotateX(Math.PI / 2), dark, 0, 0.07, -0.2);
    muzzle.position.set(0, 0.02, -len); eject.position.set(0.04, 0.03, -0.05);
  } else if (root.userData.category === 'knife') { add(new THREE.BoxGeometry(0.02, 0.03, 0.12), dark, 0, 0, -0.1); add(new THREE.BoxGeometry(0.005, 0.03, 0.14), solid('#b8b8b8', 0.3, 0.9), 0, 0.01, -0.22); muzzle.position.set(0, 0, -0.3); }
  else if (root.userData.category === 'grenade') { add(new THREE.CylinderGeometry(0.03, 0.03, 0.1, 12), id === 'smoke' ? solid('#556') : id === 'flash' ? solid('#889') : id === 'he' ? solid('#3a4a3a') : solid('#8a4a2a'), 0, 0, -0.05); muzzle.position.set(0, 0, -0.1); }
  else { add(new THREE.BoxGeometry(0.12, 0.08, 0.05), solid('#3a3a3a'), 0, 0, -0.08); add(new THREE.BoxGeometry(0.05, 0.02, 0.01), solid('#8fbf3f', 0.3), 0.02, 0.045, -0.08); muzzle.position.set(0, 0, -0.1); }
  // placeholder hands
  add(new THREE.BoxGeometry(0.05, 0.05, 0.08), glove, 0.03, -0.05, 0.05); if (root.userData.category === 'gun') add(new THREE.BoxGeometry(0.05, 0.045, 0.08), glove, -0.02, -0.03, -0.28);
  root.add(muzzle); root.add(eject);
  return { root, mixer: null, clips: new Map(), muzzle, eject, placeholder: true, triangles: 200 };
}
function flashTexture(): THREE.Texture {
  const s = 128; const c = document.createElement('canvas'); c.width = c.height = s; const ctx = c.getContext('2d')!;
  const g = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2); g.addColorStop(0, 'rgba(255,240,200,1)'); g.addColorStop(0.25, 'rgba(255,190,90,0.9)'); g.addColorStop(0.6, 'rgba(255,120,30,0.25)'); g.addColorStop(1, 'rgba(255,80,0,0)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, s, s);
  ctx.strokeStyle = 'rgba(255,220,150,0.9)'; ctx.lineWidth = 3; for (let i = 0; i < 7; i++) { const a = Math.random() * 6.28; ctx.beginPath(); ctx.moveTo(s / 2, s / 2); ctx.lineTo(s / 2 + Math.cos(a) * s * 0.5, s / 2 + Math.sin(a) * s * 0.5); ctx.stroke(); }
  return new THREE.CanvasTexture(c);
}
