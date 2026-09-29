import * as THREE from 'three';
import type { Game } from '../sim/game';
import type { Actor } from '../sim/actor';
import { SUN_DIR, MAP_BOUNDS, CAMERAS } from '../data/map/layout';
import { MapBuilder } from './mapBuilder';
import { makeSky } from './sky';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { CharacterRig } from './characters';
import { Effects } from './effects';
import { ViewModel, loadWeaponGLTF } from './viewmodel';
import { solid } from './materials';
import type { Quality } from '../core/settings';

/** Owns the Three.js scene graph, world camera, characters, items, grenades and the two-pass (world + viewmodel) render. */
export class SceneView {
  renderer: THREE.WebGLRenderer; scene = new THREE.Scene(); camera: THREE.PerspectiveCamera;
  sun: THREE.DirectionalLight; hemi: THREE.HemisphereLight; mapGroup: THREE.Group | null = null;
  rigs = new Map<number, CharacterRig>(); worldWeapons = new Map<number, THREE.Object3D>(); worldWeaponIds = new Map<number, string>();
  itemMeshes = new Map<number, THREE.Object3D>(); grenadeMeshes = new Map<number, THREE.Mesh>();
  bombProp: THREE.Group; plantedBomb: THREE.Group | null = null; bombLed: THREE.Mesh;
  effects: Effects; viewModel: ViewModel;
  baseFov = 90; currentFov = 90; zoomTargetFov = 90; quality: Quality;
  freeCamera: { pos: THREE.Vector3; look: THREE.Vector3; fov: number } | null = null;
  drawCalls = 0; triangles = 0; renderScale = 1;
  constructor(canvas: HTMLCanvasElement, quality: Quality, reducedMotion: boolean) {
    this.quality = quality;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: quality !== 'low', powerPreference: 'high-performance', stencil: false });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, quality === 'high' ? 1.5 : 1));
    this.renderer.shadowMap.enabled = quality !== 'low'; this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping; this.renderer.toneMappingExposure = 0.98; this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.autoClear = false;
    this.camera = new THREE.PerspectiveCamera(75, 16 / 9, 0.05, 500);
    this.scene.background = new THREE.Color('#b9c6d3');
    this.scene.fog = new THREE.Fog('#d9d3c4', 70, 280);
    const sd = new THREE.Vector3(...SUN_DIR).normalize();
    this.sun = new THREE.DirectionalLight('#fff3dc', 2.6); this.sun.position.copy(sd).multiplyScalar(120); this.sun.castShadow = quality !== 'low';
    const sh = this.sun.shadow; sh.mapSize.set(quality === 'high' ? 4096 : 2048, quality === 'high' ? 4096 : 2048); sh.camera.left = -75; sh.camera.right = 75; sh.camera.top = 75; sh.camera.bottom = -75; sh.camera.near = 10; sh.camera.far = 300; sh.bias = -0.0006; sh.normalBias = 0.05; sh.radius = 2;
    this.scene.add(this.sun); this.scene.add(this.sun.target);
    this.hemi = new THREE.HemisphereLight('#a9c4ea', '#8a7658', 1.15); this.scene.add(this.hemi);
    this.scene.add(new THREE.AmbientLight('#ffffff', 0.12));
    this.scene.add(makeSky());
    // image-based lighting so metals/glossy materials have something to reflect (neutral room, low intensity)
    const pmrem = new THREE.PMREMGenerator(this.renderer); const envTex = pmrem.fromScene(new RoomEnvironment(), 0.04).texture; this.scene.environment = envTex; this.scene.environmentIntensity = 0.35; pmrem.dispose();
    this.effects = new Effects(quality); this.effects.reducedMotion = reducedMotion; this.scene.add(this.effects.group);
    this.viewModel = new ViewModel(sd); this.viewModel.scene.environment = envTex; this.viewModel.scene.environmentIntensity = 0.6;
    this.bombProp = makeBombProp(); this.bombLed = this.bombProp.getObjectByName('led') as THREE.Mesh; this.bombProp.visible = false; this.scene.add(this.bombProp);
    void MAP_BOUNDS;
  }
  buildMap(game: Game) { if (this.mapGroup) { this.scene.remove(this.mapGroup); } this.mapGroup = new MapBuilder().build(game.map); this.scene.add(this.mapGroup); }
  resize(w: number, h: number) { this.renderer.setSize(Math.round(w * this.renderScale), Math.round(h * this.renderScale), false); this.renderer.domElement.style.width = w + 'px'; this.renderer.domElement.style.height = h + 'px'; this.camera.aspect = w / h; this.camera.updateProjectionMatrix(); this.viewModel.resize(w / h); }
  setQuality(q: Quality) { this.quality = q; this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, q === 'high' ? 1.5 : 1)); this.renderer.shadowMap.enabled = q !== 'low'; this.sun.castShadow = q !== 'low'; this.scene.traverse(o => { const m = (o as THREE.Mesh).material as THREE.Material | undefined; if (m) m.needsUpdate = true; }); }
  ensureRig(a: Actor, variant: number): CharacterRig { let r = this.rigs.get(a.id); if (!r || r.team !== a.team) { if (r) { this.scene.remove(r.root); r.dispose(); } r = new CharacterRig(a.team, variant); this.rigs.set(a.id, r); this.scene.add(r.root); } return r; }
  /** Third-person weapon: cheap world version (loaded GLB with `world` variant if present, else procedural). */
  private worldWeaponFor(a: Actor): THREE.Object3D | null {
    const id = a.active.def.id; const have = this.worldWeaponIds.get(a.id);
    if (have === id) return this.worldWeapons.get(a.id) ?? null;
    const old = this.worldWeapons.get(a.id); if (old) old.parent?.remove(old);
    this.worldWeaponIds.set(a.id, id);
    const holder = new THREE.Group(); this.worldWeapons.set(a.id, holder);
    loadWeaponGLTF(id).then(g => { if (this.worldWeaponIds.get(a.id) !== id) return; if (g) { const wn = g.scene.getObjectByName('world'); const c = wn ? wn.clone() : g.scene.clone(); c.visible = true; c.traverse(o => { o.visible = true; if ((o as THREE.Mesh).isMesh) { (o as THREE.Mesh).castShadow = true; } const n = o.name; if (n === 'arms' || n.startsWith('hand') || n.startsWith('arm_') || n.startsWith('f') && n.length <= 5) o.visible = false; if (!wn && n === 'world') o.visible = false; }); c.position.set(0.0, 0.0, 0.05); c.rotation.set(0, Math.PI, 0); holder.add(c); } else { const m = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.06, id === 'awp' ? 0.9 : id === 'knife' ? 0.2 : id.length <= 5 && (id === 'usp' || id === 'glock') ? 0.2 : 0.6), solid('#2a2a2c', 0.5, 0.5)); m.position.z = 0.1; m.castShadow = true; holder.add(m); } });
    return holder;
  }
  /** Per-frame update: interpolate actors, camera, items, grenades, effects. */
  update(game: Game, alpha: number, dt: number, lookDx: number, lookDy: number, settings: { fov: number; reducedMotion: boolean }, time: number) {
    const p = game.player; const spectating = !p.alive && game.spectateId !== null;
    const viewActor = spectating ? game.actorById(game.spectateId)! : p;
    for (const a of game.actors) {
      const rig = this.ensureRig(a, a.id);
      const isView = a === viewActor && (a.alive || !spectating);
      rig.setVisible(!(isView && a.alive) || this.freeCamera !== null);
      rig.update(a, alpha, dt, this.worldWeaponFor(a));
      if (a.alive) { const ww = this.worldWeapons.get(a.id); if (ww) ww.visible = rig.root.visible && a.active.def.slot !== 'melee' ? true : rig.root.visible; }
    }
    // camera
    this.baseFov = settings.fov;
    const z = viewActor.active.zoomLevel; const def = viewActor.active.def;
    const target = z === 0 ? this.baseFov : z === 1 ? def.zoomFov1 : def.zoomFov2;
    this.zoomTargetFov = target;
    this.currentFov += (target - this.currentFov) * Math.min(1, dt / Math.max(0.03, def.zoomTime + 0.03));
    if (Math.abs(this.currentFov - target) < 0.2) this.currentFov = target;
    if (this.freeCamera) { this.camera.position.copy(this.freeCamera.pos); this.camera.lookAt(this.freeCamera.look); this.camera.fov = vfov(this.freeCamera.fov, this.camera.aspect); }
    else {
      const x = viewActor.px + (viewActor.x - viewActor.px) * alpha, y = viewActor.py + (viewActor.y - viewActor.py) * alpha, zz = viewActor.pz + (viewActor.z - viewActor.pz) * alpha;
      let yaw = viewActor.yaw, pitch = viewActor.pitch;
      if (viewActor !== p) { const dy = viewActor.yaw - viewActor.pyaw; yaw = viewActor.pyaw + Math.atan2(Math.sin(dy), Math.cos(dy)) * alpha; pitch = viewActor.ppitch + (viewActor.pitch - viewActor.ppitch) * alpha; }
      const eyeY = viewActor.alive ? viewActor.eyeHeight : Math.max(0.25, viewActor.eyeHeight - Math.min(1, viewActor.deathTime * 2) * 1.1);
      this.camera.position.set(x, y + eyeY, zz);
      // view punch: camera follows a fraction of the aim punch (CS-like), plus subtle landing dip
      const punchP = viewActor.aimPunchPitch * (settings.reducedMotion ? 0.15 : 0.45), punchY = viewActor.aimPunchYaw * (settings.reducedMotion ? 0.15 : 0.45);
      const e = new THREE.Euler(pitch + punchP * Math.PI / 180, yaw - punchY * Math.PI / 180, viewActor.alive ? 0 : Math.min(1, viewActor.deathTime * 2) * 0.6, 'YXZ');
      this.camera.quaternion.setFromEuler(e);
      this.camera.fov = vfov(this.currentFov, this.camera.aspect);
    }
    this.camera.updateProjectionMatrix();
    // shadow camera follows the player for resolution
    this.sun.target.position.set(this.camera.position.x, 0, this.camera.position.z); this.sun.position.copy(this.sun.target.position).addScaledVector(new THREE.Vector3(...SUN_DIR).normalize(), 120);
    // items
    for (const [id, m] of this.itemMeshes) if (!game.items.some(it => it.id === id)) { this.scene.remove(m); this.itemMeshes.delete(id); }
    for (const it of game.items) {
      let m = this.itemMeshes.get(it.id);
      if (!m) { m = it.kind === 'bomb' ? makeBombProp() : new THREE.Group(); if (it.kind === 'weapon' && it.weapon) { const id = it.weapon.def.id; const g = m as THREE.Group; loadWeaponGLTF(id).then(gl => { if (gl) { const wn = gl.scene.getObjectByName('world'); const w = (wn ?? gl.scene).clone(); w.visible = true; w.traverse(o => { o.visible = true; if (o.name === 'arms' || o.name.startsWith('hand') || o.name.startsWith('arm_')) o.visible = false; if (!wn && o.name === 'world') o.visible = false; if ((o as THREE.Mesh).isMesh) (o as THREE.Mesh).castShadow = true; }); w.rotation.set(0, 0, Math.PI / 2 - 0.2); g.add(w); } else { const mm = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.08, 0.6), solid('#333', 0.5, 0.5)); mm.rotation.z = 1.4; g.add(mm); } }); } m.position.set(it.x, it.y + 0.05, it.z); m.rotation.y = it.yaw; this.scene.add(m); this.itemMeshes.set(it.id, m); }
    }
    // grenades
    for (const [id, m] of this.grenadeMeshes) if (!game.grenades.grenades.some(g => g.id === id)) { this.scene.remove(m); this.grenadeMeshes.delete(id); }
    for (const g of game.grenades.grenades) {
      let m = this.grenadeMeshes.get(g.id);
      if (!m) { m = makeGrenadeMesh(g.kind); this.scene.add(m); this.grenadeMeshes.set(g.id, m); }
      m.position.set(g.px + (g.x - g.px) * alpha, g.py + (g.y - g.py) * alpha, g.pz + (g.z - g.pz) * alpha); m.rotation.x += dt * 6; m.rotation.y += dt * 4;
      if (g.kind === 'molotov' || g.kind === 'incendiary') { const l = m.children[0] as THREE.PointLight | undefined; if (l) l.intensity = 2 + Math.sin(time * 30) * 0.8; }
    }
    // smoke / fire volumes
    const liveSmoke = new Set(game.grenades.smokes.map(s => s.id));
    for (const id of Array.from(this.effects.smokeClouds.keys())) if (!liveSmoke.has(id)) this.effects.smokeUpdate(id, 0, 0, 0, 0, 0, false);
    for (const s of game.grenades.smokes) this.effects.smokeUpdate(s.id, s.x, s.y, s.z, game.grenades.smokeRadius(s), game.grenades.smokeDensity(s), true);
    const liveFire = new Set(game.grenades.fires.map(f => f.id));
    for (const id of Array.from(this.effects.fireClouds.keys())) if (!liveFire.has(id)) this.effects.fireUpdate(id, 0, 0, 0, 0, false, 0);
    for (const f of game.grenades.fires) this.effects.fireUpdate(f.id, f.x, f.y, f.z, game.grenades.fireRadius(f), true, time);
    // planted bomb prop
    const b = game.match.bomb.planted;
    if (b && !game.match.bomb.exploded) { this.bombProp.visible = true; this.bombProp.position.set(b.x, b.y + 0.02, b.z); const urgency = 1 - Math.max(0, b.timeLeft) / game.match.rules.bombTime; const rate = 2 + urgency * urgency * 18; const on = Math.sin(time * rate * Math.PI) > 0.2; (this.bombLed.material as THREE.MeshStandardMaterial).emissiveIntensity = on ? 3 : 0.1; }
    else this.bombProp.visible = false;
    this.effects.update(dt);
    this.viewModel.update(p, dt, lookDx, lookDy, this.baseFov, settings.reducedMotion);
    this.viewModel.pivot.visible = this.viewModel.pivot.visible && !spectating && this.freeCamera === null;
  }
  render() {
    this.renderer.clear(true, true, true);
    this.renderer.render(this.scene, this.camera);
    this.drawCalls = this.renderer.info.render.calls; this.triangles = this.renderer.info.render.triangles;
    if (this.viewModel.pivot.visible && !this.viewModel.hidden) { this.renderer.clearDepth(); this.renderer.render(this.viewModel.scene, this.viewModel.camera); }
  }
  setReferenceCamera(id: string | null) { if (!id) { this.freeCamera = null; return; } const c = CAMERAS.find(c => c.id === id); if (!c) return; this.freeCamera = { pos: new THREE.Vector3(...c.pos), look: new THREE.Vector3(...c.look), fov: c.fov }; }
  setFreeCamera(pos: [number, number, number], look: [number, number, number], fov: number) { this.freeCamera = { pos: new THREE.Vector3(...pos), look: new THREE.Vector3(...look), fov }; }
  dispose() { this.renderer.dispose(); }
}
/** Horizontal FOV (CS-style, 4:3-based) to vertical FOV for the current aspect. CS fov 90 ≈ 73.7° vertical at 16:9. */
export function vfov(hfov43: number, aspect: number): number {
  void aspect; const h = hfov43 * Math.PI / 180; const v = 2 * Math.atan(Math.tan(h / 2) * 3 / 4); return v * 180 / Math.PI;
}
function makeBombProp(): THREE.Group {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.1, 0.22), solid('#3a3a38', 0.6, 0.2)); body.position.y = 0.05; body.castShadow = true; g.add(body);
  const pad = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.02, 0.1), solid('#1b1b1b', 0.4)); pad.position.set(0.07, 0.11, 0.03); g.add(pad);
  for (let i = 0; i < 9; i++) { const k = new THREE.Mesh(new THREE.BoxGeometry(0.025, 0.01, 0.02), solid('#cfcfcf', 0.4)); k.position.set(0.04 + (i % 3) * 0.03, 0.125, -0.0 + Math.floor(i / 3) * 0.03); g.add(k); }
  const screen = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.012, 0.05), new THREE.MeshStandardMaterial({ color: '#0a1a0a', emissive: '#3aff5a', emissiveIntensity: 0.8 })); screen.position.set(-0.08, 0.108, -0.05); g.add(screen);
  const led = new THREE.Mesh(new THREE.SphereGeometry(0.012, 8, 6), new THREE.MeshStandardMaterial({ color: '#ff2020', emissive: '#ff2020', emissiveIntensity: 2 })); led.name = 'led'; led.position.set(-0.12, 0.11, 0.06); g.add(led);
  const wireMat = solid('#b02020', 0.6); for (let i = 0; i < 3; i++) { const w = new THREE.Mesh(new THREE.TorusGeometry(0.03, 0.004, 5, 12, Math.PI), [wireMat, solid('#2040c0', 0.6), solid('#e0c020', 0.6)][i]); w.position.set(-0.03 + i * 0.03, 0.1, 0.08); w.rotation.x = Math.PI / 2; g.add(w); }
  for (let i = 0; i < 3; i++) { const c = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.2, 10), solid('#b8a77a', 0.8)); c.rotation.x = Math.PI / 2; c.position.set(-0.12 + i * 0.045, 0.05, 0); g.add(c); }
  return g;
}
function makeGrenadeMesh(kind: string): THREE.Mesh {
  const col = kind === 'he' ? '#3c4a3a' : kind === 'flash' ? '#8a9199' : kind === 'smoke' ? '#5b6268' : '#7a4a2a';
  const m = new THREE.Mesh(kind === 'molotov' ? new THREE.CylinderGeometry(0.04, 0.05, 0.16, 10) : new THREE.CylinderGeometry(0.035, 0.035, 0.11, 12), solid(col, 0.5, 0.4)); m.castShadow = true;
  if (kind === 'molotov' || kind === 'incendiary') { const l = new THREE.PointLight('#ff9a40', 2, 3); m.add(l); }
  return m;
}
