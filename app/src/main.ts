import * as THREE from 'three';
import { FixedClock, FIXED_DT } from './core/clock';
import { loadSettings, saveSettings, type Settings } from './core/settings';
import { InputSys } from './core/input';
import { PhysicsWorld } from './physics/world';
import { Game } from './sim/game';
import { EMPTY_INPUT } from './sim/types';
import { ECONOMY_PRESETS } from './data/economy';
import { SceneView } from './render/scene';
import { CharacterRig } from './render/characters';
import { AudioSys } from './audio/audio';
import { Hud } from './ui/hud';
import { BuyMenu } from './ui/buy';
import { Scoreboard } from './ui/scoreboard';
import { MainMenu, type SetupChoice } from './ui/menu';
import { PauseMenu, RoundResult, MatchResult } from './ui/overlays';
import { controlsHtml } from './ui/settings';
import { PerfMonitor } from './debug/perf';
import { installDebugApi } from './debug/api';
import { CAMERAS } from './data/map/layout';

type AppState = 'loading' | 'menu' | 'match' | 'matchEnd';

export class App {
  state: AppState = 'loading';
  settings: Settings = loadSettings();
  canvas = document.getElementById('game-canvas') as HTMLCanvasElement;
  uiRoot = document.getElementById('ui-root')!;
  input: InputSys; scene!: SceneView; audio = new AudioSys(); clock = new FixedClock(); perf = new PerfMonitor();
  game: Game | null = null; menuGame: Game | null = null; menuRig: CharacterRig | null = null;
  hud!: Hud; buy!: BuyMenu; scoreboard!: Scoreboard; menu!: MainMenu; pause!: PauseMenu; roundRes!: RoundResult; matchRes!: MatchResult;
  loadingEl!: HTMLElement; resumeEl!: HTMLElement; controlsCard!: HTMLElement;
  paused = false; buyOpen = false; lastFrame = performance.now(); frameLookDx = 0; frameLookDy = 0; consoleErrors: string[] = [];
  pendingPressed: { firePressed: boolean; altPressed: boolean; reload: boolean; inspect: boolean; drop: boolean; slot: number | null; scroll: number; prevWeapon: boolean; jump: boolean } | null = null;
  lastSetup: SetupChoice | null = null; matchesPlayed = 0; simLoops = 0; refCam: string | null = null; menuT = 0;
  constructor() {
    this.input = new InputSys(this.canvas);
    const q = new URLSearchParams(location.search).get('quality'); if (q === 'low' || q === 'medium' || q === 'high') this.settings.quality = q;
    const sc = parseFloat(new URLSearchParams(location.search).get('scale') ?? ''); if (sc >= 0.25 && sc <= 1) this.settings.renderScale = sc;
    window.addEventListener('error', e => this.consoleErrors.push(String(e.message)));
    window.addEventListener('unhandledrejection', e => this.consoleErrors.push('unhandledrejection: ' + String((e as PromiseRejectionEvent).reason)));
  }
  async init() {
    this.loadingEl = document.createElement('div'); this.loadingEl.id = 'loading'; this.loadingEl.innerHTML = `<div class="title">COUNTER-STRIKE 2</div><div class="sub">Unofficial browser recreation · loading</div><div class="bar"><div></div></div><div class="sub" data-q="step">physics</div>`; this.uiRoot.appendChild(this.loadingEl);
    const touch = document.createElement('div'); touch.id = 'touch-notice'; touch.innerHTML = `<div><b>Desktop controls required</b><br>This recreation needs a keyboard and a mouse with pointer lock. Please open it on a desktop browser (1280×720 or larger).</div>`; this.uiRoot.appendChild(touch);
    const prog = (p: number, s: string) => { (this.loadingEl.querySelector('.bar > div') as HTMLElement).style.width = `${p}%`; this.loadingEl.querySelector('[data-q="step"]')!.textContent = s; };
    prog(10, 'physics'); await PhysicsWorld.init();
    prog(30, 'renderer'); this.scene = new SceneView(this.canvas, this.settings.quality, this.settings.reducedMotion); this.scene.renderScale = this.settings.renderScale;
    prog(45, 'map'); this.menuGame = new Game({ playerTeam: 'T', difficulty: 'easy', seed: 1 }); this.scene.buildMap(this.menuGame);
    prog(70, 'weapons'); await this.scene.viewModel.preload(['knife', 'glock', 'usp', 'ak47', 'm4a4', 'awp', 'he', 'flash', 'smoke', 'molotov', 'incendiary', 'c4']);
    prog(90, 'interface');
    this.hud = new Hud(this.uiRoot); this.hud.setCrosshair(this.settings);
    this.buy = new BuyMenu(this.uiRoot); this.buy.onClose = () => this.closeBuy(); this.buy.onBuy = it => this.doBuy(it);
    this.scoreboard = new Scoreboard(this.uiRoot);
    this.menu = new MainMenu(this.uiRoot, this.settings, { onPlay: c => this.startMatch(c), onSettings: s => this.applySettings(s), onLoadoutChange: () => { /* stored on menu */ } });
    this.pause = new PauseMenu(this.uiRoot, this.settings); this.pause.onResume = () => this.resume(); this.pause.onQuit = () => this.leaveMatch(); this.pause.onSettings = s => this.applySettings(s);
    this.roundRes = new RoundResult(this.uiRoot); this.matchRes = new MatchResult(this.uiRoot); this.matchRes.onReplay = () => { if (this.lastSetup) this.startMatch(this.lastSetup); }; this.matchRes.onMenu = () => this.leaveMatch();
    this.resumeEl = document.createElement('div'); this.resumeEl.id = 'resume'; this.resumeEl.className = 'hidden'; this.resumeEl.innerHTML = `<div class="box"><h3>CLICK TO PLAY</h3><p>Click to capture the mouse. Esc releases it.</p></div>`; this.resumeEl.addEventListener('click', () => this.resume()); this.uiRoot.appendChild(this.resumeEl);
    this.controlsCard = document.createElement('div'); this.controlsCard.id = 'controls-card'; this.controlsCard.className = 'hidden'; this.controlsCard.innerHTML = `<h3>CONTROLS</h3>${controlsHtml()}<p style="color:var(--muted);font-size:12px">Buy in your spawn zone during the freeze/buy time with <b>B</b>. Attackers plant with <b>E</b> at A or B; defenders defuse with <b>E</b>. This is a shortened prototype match: first to 4 rounds.</p><div style="text-align:right;margin-top:8px"><button class="btn primary" data-q="ok" style="font-size:15px;padding:10px 24px">GOT IT — CLICK TO PLAY</button></div>`; this.controlsCard.querySelector('[data-q="ok"]')!.addEventListener('click', () => { this.settings.seenControls = true; saveSettings(this.settings); this.controlsCard.classList.add('hidden'); this.resume(); }); this.uiRoot.appendChild(this.controlsCard);
    this.input.onEscape = () => this.onEscape(); this.input.onClickUnlocked = () => { if (this.state === 'match' && !this.paused && !this.buyOpen && !this.controlsCard.classList.contains('hidden') === false && this.matchRes.el.classList.contains('hidden')) this.resume(); };
    this.input.onKeyPress = code => this.onKey(code);
    window.addEventListener('resize', () => this.resize()); this.resize();
    installDebugApi(this);
    this.loadingEl.remove(); this.setState('menu');
    requestAnimationFrame(t => this.frame(t));
  }
  resize() { const w = window.innerWidth, h = window.innerHeight; this.scene.resize(w, h); }
  applySettings(s: Settings) { this.settings = s; saveSettings(s); this.hud?.setCrosshair(s); this.audio.setVolume(s.volume); this.scene.setQuality(s.quality); this.scene.renderScale = s.renderScale; this.resize(); this.scene.effects.reducedMotion = s.reducedMotion; }
  setState(s: AppState) {
    this.state = s;
    this.menu.show(s === 'menu'); this.hud.show(s === 'match' || s === 'matchEnd');
    if (s === 'menu') { this.input.enabled = false; this.input.releaseLock(); this.scene.setFreeCamera([26.5, 1.6, 44], [40, 1.9, 20], 62); this.scene.viewModel.pivot.visible = false; this.menuT = 0; if (!this.menuRig && this.menuGame) { this.menuRig = new CharacterRig('T', 0); this.menuRig.root.position.set(31, 0, 39); this.menuRig.root.rotation.y = Math.PI * 0.85; this.scene.scene.add(this.menuRig.root); } if (this.menuRig) this.menuRig.root.visible = true; }
    else { if (this.menuRig) this.menuRig.root.visible = false; }
  }
  startMatch(c: SetupChoice) {
    this.lastSetup = c; this.matchRes.hide(); this.roundRes.hide(); this.buy.hide(); this.buyOpen = false; this.pause.show(false); this.paused = false; this.matchesPlayed++;
    if (this.game) { this.game.pw.world.free(); this.detachEvents(); }
    for (const [, r] of this.scene.rigs) { this.scene.scene.remove(r.root); r.dispose(); } this.scene.rigs.clear();
    for (const [, w] of this.scene.worldWeapons) w.parent?.remove(w); this.scene.worldWeapons.clear(); this.scene.worldWeaponIds.clear();
    this.scene.effects.clearAll(); this.scene.freeCamera = null;
    const seed = c.seed ?? (Date.now() % 1000000);
    this.game = new Game({ playerTeam: c.team, difficulty: c.difficulty, seed, economy: ECONOMY_PRESETS[c.economy] });
    this.attachEvents(this.game);
    this.game.start();
    this.audio.ensure(); this.audio.setVolume(this.settings.volume);
    this.setState('match'); this.input.enabled = true;
    if (!this.settings.seenControls) { this.controlsCard.classList.remove('hidden'); this.resumeEl.classList.add('hidden'); }
    else { this.resume(); }
  }
  leaveMatch() { this.input.releaseLock(); this.pause.show(false); this.paused = false; this.matchRes.hide(); this.roundRes.hide(); this.buy.hide(); this.buyOpen = false; this.resumeEl.classList.add('hidden'); if (this.game) { this.game.paused = true; } this.setState('menu'); }
  resume() {
    if (this.state !== 'match' && this.state !== 'matchEnd') return;
    this.pause.show(false); this.paused = false; this.resumeEl.classList.add('hidden'); this.input.enabled = true; this.input.clear(); this.audio.ensure(); this.input.requestLock();
    if (this.game) this.game.paused = false;
    // verify lock actually acquired; otherwise show the click-to-play overlay
    setTimeout(() => { if (!this.input.locked && this.state === 'match' && !this.paused && !this.buyOpen) this.resumeEl.classList.remove('hidden'); }, 300);
  }
  onEscape() {
    if (this.state !== 'match') return;
    if (this.buyOpen) { this.closeBuy(); return; }
    if (!this.paused && this.matchRes.el.classList.contains('hidden') && this.controlsCard.classList.contains('hidden')) { this.paused = true; if (this.game) this.game.paused = true; this.input.releaseLock(); this.input.clear(); this.pause.show(true); this.resumeEl.classList.add('hidden'); }
  }
  onKey(code: string) {
    if (this.state !== 'match' || !this.game) return;
    if (this.buyOpen) { if (code === 'KeyB') { this.closeBuy(); return; } const n = parseInt(code.replace('Digit', ''), 10); if (n >= 1 && n <= 9) { const it = this.buy.keyBuy(n); if (it) this.doBuy(it); } return; }
    if (this.paused) return;
    if (code === 'KeyB') this.openBuy();
    if (!this.game.player.alive && (code === 'Space')) this.game.cycleSpectate(1);
    if (code === 'F9') { this.refCam = null; this.scene.setReferenceCamera(null); }
  }
  openBuy() {
    const g = this.game!; const m = g.match; if (!g.player.alive) return;
    if (!(m.phase === 'freeze' || (m.phase === 'live' && m.buyWindowOpen))) { this.hud.announce('Buy time has expired', '', 1.5); return; }
    if (!g.inBuyZone(g.player)) { this.hud.announce('You must be in your spawn zone to buy', '', 1.5); return; }
    this.buyOpen = true; this.buy.show(g); this.input.releaseLock(); this.input.clear();
  }
  closeBuy() { if (!this.buyOpen) return; this.buyOpen = false; this.buy.hide(); this.input.clear(); this.input.requestLock(); setTimeout(() => { if (!this.input.locked && this.state === 'match' && !this.paused) this.resumeEl.classList.remove('hidden'); }, 300); }
  doBuy(item: string) { const g = this.game!; const err = g.buy(g.player, item); if (err) { this.buy.setStatus(err, false); this.audio.ui('deny'); } else { this.buy.setStatus(`Bought ${item}`, true); this.audio.ui('buy'); this.buy.lastBuy = [...this.buy.lastBuy.filter(x => x !== item), item].slice(-6); } this.buy.render(g); }
  private unsub: (() => void)[] = [];
  detachEvents() { for (const u of this.unsub) u(); this.unsub = []; }
  attachEvents(g: Game) {
    const me = g.player; const fx = this.scene.effects; const au = this.audio;
    const on = <K extends keyof import('./sim/types').SimEvents>(k: K, h: (p: import('./sim/types').SimEvents[K]) => void) => this.unsub.push(g.events.on(k, h));
    on('shot', e => {
      const a = g.actorById(e.actorId)!; const local = a === me;
      if (e.weapon === 'dry') { if (local) au.dryFire(); return; }
      if (e.weapon === 'knife') { if (local) au.knife(!!e.hitActor); if (e.hit && !e.hitActor) fx.impact(e.hit, e.normal, e.surface); return; }
      au.gunshot(e.weapon, e.origin[0], e.origin[1], e.origin[2], local);
      if (e.hit) { fx.impact(e.hit, e.normal, e.surface); au.impact(e.surface, e.hit[0], e.hit[1], e.hit[2]); if (e.hitActor && local) { this.hud.hitmarker(); } }
      if (local) { const mz = new THREE.Vector3(); if (this.scene.viewModel.muzzleWorld(mz)) { mz.applyMatrix4(this.scene.viewModel.camera.matrixWorld.clone().invert()); mz.applyMatrix4(this.scene.camera.matrixWorld); } else mz.set(e.origin[0], e.origin[1] - 0.1, e.origin[2]); if (e.hit) fx.tracer([mz.x, mz.y, mz.z], e.hit); const ej = new THREE.Vector3(mz.x, mz.y, mz.z); const right = new THREE.Vector3(1, 0, 0).applyQuaternion(this.scene.camera.quaternion); fx.brassEject(ej.addScaledVector(right, -0.1), right); }
      else { const rig = this.scene.rigs.get(a.id); const p = new THREE.Vector3(); if (rig) rig.weaponMount.getWorldPosition(p); else p.set(e.origin[0], e.origin[1], e.origin[2]); p.set(e.origin[0], e.origin[1] - 0.15, e.origin[2]).addScaledVector(new THREE.Vector3(e.dir[0], e.dir[1], e.dir[2]), 0.7); fx.worldMuzzle(p); if (e.hit) fx.tracer([p.x, p.y, p.z], e.hit); const right = new THREE.Vector3(-e.dir[2], 0, e.dir[0]); fx.brassEject(p.clone(), right); }
    });
    on('hurt', e => { if (e.actorId === me.id) au.ui('hurt'); });
    on('kill', e => { const k = g.actorById(e.killerId), v = g.actorById(e.victimId)!; this.hud.kill(k, v, e.weapon, e.headshot, me); if (k === me) au.ui(e.headshot ? 'headshot' : 'kill'); });
    on('reload', e => { const a = g.actorById(e.actorId)!; au.reload(e.stage, a.x, a.eyeY, a.z, a === me); });
    on('footstep', e => { const a = g.actorById(e.actorId)!; au.footstep(e.surface, e.pos[0], e.pos[1], e.pos[2], a === me); });
    on('grenadeBounce', e => au.bounce(e.pos[0], e.pos[1], e.pos[2], e.speed));
    on('grenadeDetonate', e => { if (e.kind === 'he') { fx.explosion(e.pos, false); au.explosion(e.pos[0], e.pos[1], e.pos[2], false); } else if (e.kind === 'flash') { fx.flashPop(e.pos); au.flashPop(e.pos[0], e.pos[1], e.pos[2]); } else if (e.kind === 'smoke') au.smokePop(e.pos[0], e.pos[1], e.pos[2]); else { fx.explosion(e.pos, false); au.explosion(e.pos[0], e.pos[1], e.pos[2], false); } });
    on('bombPlanted', e => { this.hud.announce('The bomb has been planted', `${g.match.rules.bombTime} seconds to detonation`); au.ui('click'); void e; });
    on('bombDefused', () => { this.hud.announce('The bomb has been defused'); });
    on('bombExploded', e => { fx.explosion(e.pos, true); au.explosion(e.pos[0], e.pos[1], e.pos[2], true); });
    on('plantProgress', e => { if (e.actorId === me.id && e.progress > 0) { if (Math.floor(e.progress * 8) !== Math.floor((e.progress - FIXED_DT / g.match.rules.plantTime) * 8)) au.plantTick(); } });
    on('defuseProgress', e => { if (e.actorId === me.id && e.progress > 0 && Math.floor(e.progress * 10) !== Math.floor((e.progress - FIXED_DT / 10) * 10)) au.defuseHum(); });
    on('scope', e => { if (e.actorId === me.id) au.ui('zoom'); });
    on('roundEnd', e => { const mvp = g.actorById(e.mvpId); this.roundRes.show(g, e.winner, e.reason, mvp?.name ?? null, e.mvpReason); au.ui(e.winner === me.team ? 'roundwin' : 'roundlose'); if (this.buyOpen) this.closeBuy(); });
    on('phase', e => { if (e.phase === 'freeze') { this.roundRes.hide(); this.hud.announce(`Round ${g.match.round}`, g.match.round === 1 ? 'Buy equipment with B in your spawn' : g.match.sidesSwitched && g.match.roundsPlayed === g.match.rules.switchAfterRounds ? 'Sides switched' : '', 2.5); } if (e.phase === 'matchEnd') { this.setState('matchEnd'); this.input.releaseLock(); this.matchRes.show(g, g.match.matchWinner!); } });
    on('sideSwitch', () => { this.hud.announce('Halftime — switching sides', 'Money and equipment reset', 3); });
    on('purchaseDenied', e => { if (e.actorId === me.id) this.buy.setStatus(e.reason, false); });
  }
  frame(now: number) {
    const frameDt = Math.min(0.1, (now - this.lastFrame) / 1000); this.lastFrame = now;
    this.perf.begin();
    if (this.state === 'menu') {
      this.menuT += frameDt;
      if (this.menuGame && this.menuRig) { const cam = this.scene.freeCamera!; cam.pos.set(26.5 + Math.sin(this.menuT * 0.15) * 0.4, 1.6, 44 + Math.cos(this.menuT * 0.12) * 0.3); this.menuRig.phase += 0; this.scene.update(this.menuGame, 1, frameDt, 0, 0, { fov: 90, reducedMotion: true }, this.menuT); this.menuRig.root.visible = true; this.menuRig.hips.position.y = 0.96 + Math.sin(this.menuT * 1.4) * 0.006; this.menuRig.torso.rotation.x = 0.08 + Math.sin(this.menuT * 1.4) * 0.01; this.menuRig.armR.rotation.set(-0.9, -0.3, -0.25); this.menuRig.foreR.rotation.set(-0.9, 0, 0.1); this.menuRig.armL.rotation.set(-0.7, 0.6, 0.3); this.menuRig.foreL.rotation.set(-1.2, 0.2, -0.5); this.menuRig.head.rotation.y = Math.sin(this.menuT * 0.5) * 0.2; }
      this.scene.render();
    } else if (this.game) {
      const g = this.game; const inp = this.input.locked && !this.paused && !this.buyOpen ? this.input.poll() : { ...EMPTY_INPUT };
      if (!this.input.locked) this.input.clear();
      // spectator click cycling
      if (!g.player.alive && inp.firePressed) g.cycleSpectate(1);
      this.frameLookDx = inp.lookDx; this.frameLookDy = inp.lookDy;
      let first = true;
      const alpha = this.clock.step(frameDt, dt => {
        const stepInp = first ? inp : { ...inp, firePressed: false, altPressed: false, reload: false, inspect: false, drop: false, slot: null, scroll: 0, prevWeapon: false, lookDx: 0, lookDy: 0 };
        first = false;
        const ai = g.player.alive ? g.playerInputToActor(stepInp, this.settings.sensitivity, this.settings.zoomSensitivityRatio) : null;
        g.tick(dt, ai); this.simLoops++;
      });
      if (first && g.player.alive && !g.paused) { /* no sim step this frame: still apply look for responsiveness */ g.playerInputToActor({ ...EMPTY_INPUT, lookDx: inp.lookDx, lookDy: inp.lookDy }, this.settings.sensitivity, this.settings.zoomSensitivityRatio); }
      const viewActor = (!g.player.alive && g.spectateId !== null) ? g.actorById(g.spectateId)! : g.player;
      this.audio.listener = { x: viewActor.x, y: viewActor.eyeY, z: viewActor.z, yaw: viewActor.yaw };
      if (!g.paused) this.audio.bombTicker(frameDt, g.match.bomb.planted && !g.match.bomb.exploded && !g.match.bomb.defused ? g.match.bomb.planted : null, g.match.rules.bombTime);
      if (!g.paused) for (const f of g.grenades.fires) if (Math.random() < frameDt * 2) this.audio.fireLoop(f.x, f.y, f.z);
      this.scene.update(g, alpha, g.paused ? 0 : frameDt, this.frameLookDx, this.frameLookDy, { fov: this.settings.fov, reducedMotion: this.settings.reducedMotion }, g.time);
      this.scene.render();
      const fpsText = this.settings.showFps ? `${this.perf.fps.toFixed(0)} fps · ${this.perf.median.toFixed(1)} ms med · ${this.perf.p95.toFixed(1)} ms p95 · ${this.scene.drawCalls} calls` : null;
      this.hud.update(g, frameDt, this.settings, viewActor, fpsText, this.buyOpen);
      this.roundRes.update(frameDt);
      if (this.buyOpen) this.buy.render(g);
      const tab = this.input.isDown('Tab') && this.input.locked; this.scoreboard.show(tab || this.state === 'matchEnd'); if (tab || this.state === 'matchEnd') this.scoreboard.render(g);
      if (this.buyOpen && !(g.match.phase === 'freeze' || (g.match.phase === 'live' && g.match.buyWindowOpen))) { this.buy.setStatus('Buy time expired', false); this.closeBuy(); }
    }
    this.perf.end();
    requestAnimationFrame(t => this.frame(t));
  }
  setReferenceCamera(id: string | null) { this.refCam = id; this.scene.setReferenceCamera(id); }
  get cameras() { return CAMERAS; }
}
const app = new App();
app.init().catch(e => { console.error(e); const d = document.createElement('pre'); d.style.cssText = 'color:#f66;padding:20px;position:absolute;inset:0;background:#000;'; d.textContent = 'Failed to start: ' + (e?.stack ?? e); document.body.appendChild(d); });
