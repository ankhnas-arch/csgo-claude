import { Rng } from '../core/rng';
import { Emitter } from '../core/events';
import { compileMap, type CompiledMap } from '../data/map/compile';
import { SITES, SPAWNS, RECTS, floorYAt } from '../data/map/layout';
import { WEAPONS, type Team } from '../data/weapons';
import { u2m, m2u } from '../data/units';
import { DEMO_RULES, BOT_PROFILES, type BotDifficulty, type MatchRules } from '../data/match';
import { ECONOMY_PRESETS, type EconomyDef } from '../data/economy';
import { PhysicsWorld } from '../physics/world';
import { Actor, defaultNames, PLAYER_HEIGHT } from './actor';
import { WeaponInstance } from './weapon';
import { MatchSim } from './match';
import { GrenadeSim, type GrenadeKind } from './grenades';
import { NavMesh } from './bots/nav';
import { BotBrain } from './bots/brain';
import { traceShot, computeDamage } from './combat';
import type { PlayerInput, SimEvents } from './types';

export interface ActorInput { wishX: number; wishZ: number; jump: boolean; crouch: boolean; walk: boolean; fire: boolean; firePressed: boolean; altPressed: boolean; reload: boolean; inspect: boolean; interact: boolean; drop: boolean; switchTo: WeaponInstance | null; throwStrength?: number }
export interface WorldItem { id: number; kind: 'weapon' | 'bomb'; weapon: WeaponInstance | null; x: number; y: number; z: number; yaw: number; }
export interface GameOptions { playerTeam: Team; difficulty: BotDifficulty; seed: number; rules?: MatchRules; economy?: EconomyDef; playerName?: string; }
export interface NoiseEvent { x: number; y: number; z: number; team: Team; time: number; loud: boolean; actorId: number; }

export class Game {
  pw: PhysicsWorld; map: CompiledMap; nav: NavMesh; rng: Rng;
  actors: Actor[] = []; player: Actor; match: MatchSim; grenades: GrenadeSim; brains = new Map<number, BotBrain>();
  items: WorldItem[] = []; private nextItemId = 1;
  events = new Emitter<SimEvents>();
  time = 0; noises: NoiseEvent[] = [];
  spectateId: number | null = null;
  opts: GameOptions; paused = false; botsFrozen = false;
  lastPlayerInput: ActorInput | null = null;
  botPlan: { tSite: 'A' | 'B'; ctRotateTo: 'A' | 'B' | null; round: number } = { tSite: 'A', ctRotateTo: null, round: 0 };
  constructor(opts: GameOptions) {
    this.opts = opts; this.rng = new Rng(opts.seed);
    this.pw = new PhysicsWorld(); this.map = compileMap(); this.pw.buildStatic(this.map); this.nav = new NavMesh(this.map.nav);
    const pt = opts.playerTeam, et: Team = pt === 'T' ? 'CT' : 'T';
    let id = 1;
    this.player = new Actor(id++, opts.playerName ?? 'You', pt, false); this.actors.push(this.player);
    const own = defaultNames(pt), en = defaultNames(et);
    for (let i = 0; i < 4; i++) this.actors.push(new Actor(id++, own[i], pt, true));
    for (let i = 0; i < 5; i++) this.actors.push(new Actor(id++, en[i], et, true));
    for (const a of this.actors) { a.createPhysics(this.pw); if (a.isBot) this.brains.set(a.id, new BotBrain(a, this, BOT_PROFILES[opts.difficulty])); }
    this.match = new MatchSim(opts.rules ?? DEMO_RULES, opts.economy ?? ECONOMY_PRESETS.showcase, this.actors);
    this.grenades = new GrenadeSim(this.pw, this.events);
    // forward match events
    const fwd = ['phase', 'roundEnd', 'matchEnd', 'bombPlanted', 'bombDefused', 'bombExploded', 'bombDropped', 'bombPickup', 'purchase', 'purchaseDenied', 'itemDrop', 'sideSwitch'] as const;
    for (const k of fwd) this.match.events.on(k, (p: any) => this.events.emit(k, p));
    this.match.events.on('phase', ({ phase }) => { if (phase === 'freeze') this.onRoundStart(); if (phase === 'matchEnd') this.spectateId = null; });
    this.match.events.on('itemDrop', ({ actorId, weapon, pos }) => { const a = this.actorById(actorId); void a; this.spawnItem(WeaponInstance.create(weapon), pos[0], pos[1], pos[2]); });
    this.match.events.on('sideSwitch', () => { for (const b of this.brains.values()) b.onSideSwitch(); });
  }
  actorById(id: number | null): Actor | null { return id === null ? null : this.actors.find(a => a.id === id) ?? null; }
  start() { this.match.startMatch(); }
  restart() { this.grenades.clear(); this.items = []; this.match.startMatch(); }

  private onRoundStart() {
    this.grenades.clear(); this.items = []; this.noises = []; this.spectateId = null;
    this.botPlan = { tSite: this.rng.next() < 0.5 ? 'A' : 'B', ctRotateTo: null, round: this.match.round };
    const counts: Record<Team, number> = { T: 0, CT: 0 };
    for (const a of this.actors) {
      const sp = SPAWNS[a.team][counts[a.team]++ % 5];
      const f = floorYAt(sp.x, sp.z);
      a.teleport(sp.x, (f ? f.y : 0) + 0.05, sp.z, sp.yaw);
      a.setCollidable(true, this.pw);
      a.interacting = false;
      this.brains.get(a.id)?.onRoundStart();
    }
    this.pw.step();
  }

  /** Convert the player's keyboard/mouse input into an actor input in world space. */
  playerInputToActor(inp: PlayerInput, sens: number, zoomRatio: number): ActorInput {
    const a = this.player;
    // look
    let sensScale = 1;
    if (a.active.zoomLevel > 0) { const fov = a.active.zoomLevel === 1 ? a.active.def.zoomFov1 : a.active.def.zoomFov2; sensScale = (fov / 90) * zoomRatio; }
    a.yaw -= inp.lookDx * sens * 0.022 * Math.PI / 180 * sensScale;
    a.pitch -= inp.lookDy * sens * 0.022 * Math.PI / 180 * sensScale;
    a.pitch = Math.max(-89 * Math.PI / 180, Math.min(89 * Math.PI / 180, a.pitch));
    const s = Math.sin(a.yaw), c = Math.cos(a.yaw);
    // forward is (-sin yaw, -cos yaw); right is (cos yaw, -sin yaw)
    let wx = -s * inp.forward + c * inp.right, wz = -c * inp.forward - s * inp.right;
    const l = Math.hypot(wx, wz); if (l > 1) { wx /= l; wz /= l; }
    let switchTo: WeaponInstance | null = null;
    if (inp.slot !== null) {
      if (inp.slot === 4) switchTo = a.active.def.slot === 'grenade' ? a.nextGrenade() : (a.inv.grenades[0] ?? null);
      else switchTo = a.weaponInSlot(inp.slot);
    }
    if (inp.scroll !== 0) {
      const order = a.allWeapons().filter(w => w !== null);
      const i = order.indexOf(a.active); const n = order.length; if (n > 1) switchTo = order[((i + (inp.scroll > 0 ? 1 : -1)) % n + n) % n];
    }
    if (inp.prevWeapon && a.lastActive && a.allWeapons().includes(a.lastActive)) switchTo = a.lastActive;
    return { wishX: wx, wishZ: wz, jump: inp.jump, crouch: inp.crouch, walk: inp.walk, fire: inp.fire, firePressed: inp.firePressed, altPressed: inp.altPressed, reload: inp.reload, inspect: inp.inspect, interact: inp.interact, drop: inp.drop, switchTo };
  }

  tick(dt: number, playerInput: ActorInput | null) {
    if (this.paused) return;
    this.time += dt;
    const phase = this.match.phase;
    const frozen = phase === 'freeze' || phase === 'roundEnd' || phase === 'matchEnd' || phase === 'setup';
    // bots think
    for (const a of this.actors) {
      let inp: ActorInput | null = null;
      if (a === this.player) inp = playerInput;
      else { const b = this.brains.get(a.id); if (b && a.alive) inp = this.botsFrozen ? null : b.think(dt, frozen); }
      if (a.alive) this.updateActor(a, inp ?? IDLE, dt, frozen);
      else this.updateDead(a, dt);
    }
    this.grenades.tick(dt, this.actors, this.time, (v, at, d, w, ar) => this.applyAreaDamage(v, at, d, w, ar));
    this.updateItems();
    this.match.tick(dt);
    this.pw.step();
    for (const a of this.actors) if (a.alive && a.body) { const p = a.body.translation(); a.x = p.x; a.y = p.y - a.height / 2; a.z = p.z; }
    this.noises = this.noises.filter(n => this.time - n.time < 4);
    if (!this.player.alive && (phase === 'live' || phase === 'planted')) this.ensureSpectate();
  }
  private ensureSpectate() {
    const cur = this.actorById(this.spectateId);
    if (cur && cur.alive && cur.team === this.player.team) return;
    const mate = this.actors.find(a => a.alive && a.team === this.player.team && a !== this.player);
    this.spectateId = mate ? mate.id : null;
  }
  cycleSpectate(dir: 1 | -1) {
    const mates = this.actors.filter(a => a.alive && a.team === this.player.team && a !== this.player);
    if (!mates.length) { this.spectateId = null; return; }
    const i = mates.findIndex(a => a.id === this.spectateId);
    this.spectateId = mates[((i + dir) % mates.length + mates.length) % mates.length].id;
  }
  private updateDead(a: Actor, dt: number) { a.deathTime += dt; a.px = a.x; a.py = a.y; a.pz = a.z; }

  updateActor(a: Actor, inp: ActorInput, dt: number, frozen: boolean) {
    const w = a.active;
    // weapon state machine
    for (const ev of w.tick(dt, this.time)) {
      if (ev === 'reloadInsert') this.events.emit('reload', { actorId: a.id, weapon: w.def.id, stage: 'insert' });
      if (ev === 'reloadEnd') this.events.emit('reload', { actorId: a.id, weapon: w.def.id, stage: 'end' });
      if (ev === 'fireEnd' && w.def.zoomLevels > 0 && w.needsRechamber) { w.startAction('rechamber', Math.max(0.2, w.def.cycleTime - w.actionDur)); }
      if (ev === 'rechamberEnd') { if (a.rezoomLevel > 0 && w.mag > 0) { w.zoomLevel = a.rezoomLevel; this.events.emit('scope', { actorId: a.id, level: w.zoomLevel }); } a.rezoomLevel = 0; }
    }
    // recoil decay
    const rec = Math.max(0.05, w.def.recoveryTimeStand);
    a.aimPunchPitch -= a.aimPunchPitch * Math.min(1, dt * 4.5 / rec); a.aimPunchYaw -= a.aimPunchYaw * Math.min(1, dt * 4.5 / rec);
    if (Math.abs(a.aimPunchPitch) < 0.01) a.aimPunchPitch = 0;
    // flash decay
    if (a.flashDuration > 0) { const t = this.time - a.flashTime; if (t >= a.flashDuration) { a.flashDuration = 0; a.flashAlpha = 0; } else { a.flashAlpha = Math.min(1, (1 - t / a.flashDuration) * 1.6); } }
    if (a.burnTime > 0) a.burnTime -= dt;
    // switch
    if (inp.switchTo && inp.switchTo !== w && a.allWeapons().includes(inp.switchTo)) {
      const wasZoomed = w.zoomLevel > 0; a.rezoomLevel = 0;
      a.switchTo(inp.switchTo); this.events.emit('weaponSwitch', { actorId: a.id, weapon: a.active.def.id });
      if (wasZoomed) this.events.emit('scope', { actorId: a.id, level: 0 });
      a.plantProgress = 0; a.defuseProgress = 0;
    }
    const cur = a.active;
    if (inp.drop && !frozen) this.dropActive(a);
    if (inp.reload && !frozen && cur.tryReload()) { const wasZ = cur.zoomLevel; cur.zoomLevel = 0; a.rezoomLevel = 0; if (wasZ) this.events.emit('scope', { actorId: a.id, level: 0 }); this.events.emit('reload', { actorId: a.id, weapon: cur.def.id, stage: 'start' }); a.plantProgress = 0; }
    if (inp.inspect && cur.action === 'idle' && cur.def.demo.inspectTime > 0 && cur.zoomLevel === 0) cur.startAction('inspect', cur.def.demo.inspectTime);
    // scope toggle (AWP only)
    if (inp.altPressed && cur.def.zoomLevels > 0 && (cur.action === 'idle' || cur.action === 'inspect' || cur.action === 'rechamber')) {
      if (cur.action === 'rechamber') { a.rezoomLevel = 0; }
      else { cur.zoomLevel = (cur.zoomLevel + 1) % (cur.def.zoomLevels + 1); if (cur.action === 'inspect') cur.action = 'idle'; this.events.emit('scope', { actorId: a.id, level: cur.zoomLevel }); }
    }
    // fire
    const wantFire = cur.def.fullAuto ? inp.fire : inp.firePressed;
    if (!frozen && wantFire) this.tryFire(a, inp);
    if (!frozen && inp.altPressed && cur.def.category === 'knife') this.knifeAttack(a, true);
    // movement (frozen: no translation)
    const speedFrac = a.speed2d / Math.max(0.1, u2m(250));
    if (!frozen) a.move(this.pw, inp.wishX, inp.wishZ, inp.jump, inp.crouch, inp.walk, dt, c => { const t = this.pw.tags.get(c.handle); return !(t?.kind === 'grenade'); });
    else { a.px = a.x; a.py = a.y; a.pz = a.z; a.pyaw = a.yaw; a.ppitch = a.pitch; a.crouching = inp.crouch; a.crouchT += Math.sign((inp.crouch ? 1 : 0) - a.crouchT) * Math.min(Math.abs((inp.crouch ? 1 : 0) - a.crouchT), dt / 0.25); a.syncBodyToPose(); }
    // footsteps
    if (a.stepDist > 2.2 && a.grounded && !a.walking && !a.crouching && speedFrac > 0.3) { a.stepDist = 0; const surf = this.surfaceUnder(a); this.events.emit('footstep', { actorId: a.id, pos: [a.x, a.y, a.z], surface: surf, loud: true }); this.noises.push({ x: a.x, y: a.y, z: a.z, team: a.team, time: this.time, loud: false, actorId: a.id }); }
    else if (a.stepDist > 2.2) a.stepDist = 0;
    // objective interaction
    if (!frozen) this.updateObjective(a, inp, dt);
    else { a.plantProgress = 0; a.defuseProgress = 0; }
  }
  surfaceUnder(a: Actor): string { const h = this.pw.raycast(a.x, a.y + 0.3, a.z, 0, -1, 0, 1.0, t => t?.kind === 'actor' || t?.kind === 'grenade'); return h?.tag ?? 'sand'; }

  private tryFire(a: Actor, inp: ActorInput) {
    const w = a.active;
    if (w.def.category === 'knife') { if (w.canFire && this.time >= w.nextFire) this.knifeAttack(a, false); return; }
    if (w.def.slot === 'grenade') { this.throwActiveGrenade(a, inp.throwStrength ?? 1); return; }
    if (w.def.slot === 'bomb') return;
    if (w.mag <= 0 && w.canFire && this.time >= w.nextFire) { if (w.reserve > 0 && a.isBot === false) { /* dry fire feedback */ } w.nextFire = this.time + 0.25; this.events.emit('shot', { actorId: a.id, weapon: 'dry', origin: [a.x, a.eyeY, a.z], dir: [0, 0, 0], hit: null, hitActor: null, hitGroup: null, surface: null, normal: null }); return; }
    const zoomBefore = w.zoomLevel;
    if (!w.fire(this.time)) return;
    a.lastFireTime = this.time;
    // spread cone
    const def = w.def;
    const speedFrac = Math.min(1, a.speed2d / Math.max(0.1, u2m(def.maxSpeed)));
    const scoped = zoomBefore > 0;
    let base = a.crouching ? (scoped ? def.inaccuracyCrouchAlt ?? def.inaccuracyCrouch : def.inaccuracyCrouch) : (scoped ? def.inaccuracyStandAlt ?? def.inaccuracyStand : def.inaccuracyStand);
    base += def.inaccuracyMove * speedFrac * speedFrac;
    if (!a.grounded) base += def.inaccuracyJump;
    const inacc = (base + w.inaccuracy) * 0.85 + def.spread; // demo scaling factor 0.85 (feel)
    const r1 = this.rng.next() * inacc, th1 = this.rng.next() * Math.PI * 2;
    const r2 = this.rng.next() * def.spread, th2 = this.rng.next() * Math.PI * 2;
    const ox = r1 * Math.cos(th1) + r2 * Math.cos(th2), oy = r1 * Math.sin(th1) + r2 * Math.sin(th2);
    const d = a.aimDir();
    // build basis
    const up = [0, 1, 0]; const rx = d[2] * up[1] - d[1] * up[2], ry = d[0] * up[2] - d[2] * up[0], rz = d[1] * up[0] - d[0] * up[1];
    const rl = Math.hypot(rx, ry, rz) || 1; const RX = rx / rl, RY = ry / rl, RZ = rz / rl;
    const UX = RY * d[2] - RZ * d[1], UY = RZ * d[0] - RX * d[2], UZ = RX * d[1] - RY * d[0];
    let dx = d[0] + RX * ox + UX * oy, dy = d[1] + RY * ox + UY * oy, dz = d[2] + RZ * ox + UZ * oy;
    const dl = Math.hypot(dx, dy, dz); dx /= dl; dy /= dl; dz /= dl;
    const ex = a.x, ey = a.eyeY, ez = a.z;
    const hit = traceShot(this.pw, a, this.actors, ex, ey, ez, dx, dy, dz, u2m(def.range));
    // recoil: deterministic pattern per weapon (seeded by index), demo mapping magnitude -> degrees
    const idx = w.recoilIndex;
    const mag = def.recoilMagnitude * 0.055 * (def.category === 'sniper' ? 0.6 : 1) * (a.crouching ? 0.85 : 1);
    const pattern = Math.sin(idx * 0.9 + w.def.id.length) * 0.55 + Math.sin(idx * 0.37) * 0.35;
    const climb = idx < 8 ? 1.0 : idx < 14 ? 0.55 : 0.25;
    a.aimPunchPitch = Math.min(12, a.aimPunchPitch + mag * climb);
    a.aimPunchYaw += mag * 0.5 * (idx < 4 ? pattern * 0.35 : pattern);
    if (scoped) { w.zoomLevel = 0; a.rezoomLevel = zoomBefore; this.events.emit('scope', { actorId: a.id, level: 0 }); }
    this.noises.push({ x: ex, y: ey, z: ez, team: a.team, time: this.time, loud: true, actorId: a.id });
    let hitActor: number | null = null, group: string | null = null;
    if (hit.actor) {
      hitActor = hit.actor.id; group = hit.group;
      const dm = computeDamage(def, hit.group!, hit.distance, hit.actor.armor, hit.actor.helmet);
      hit.actor.armor = dm.armorAfter; hit.actor.helmet = dm.helmetAfter;
      this.applyDamage(hit.actor, a, dm.damage, def.id, hit.group!);
    }
    this.events.emit('shot', { actorId: a.id, weapon: def.id, origin: [ex, ey, ez], dir: [dx, dy, dz], hit: hit.point, hitActor, hitGroup: group, surface: hit.surface, normal: hit.normal });
  }
  private knifeAttack(a: Actor, stab: boolean) {
    const w = a.active; if (w.def.category !== 'knife' || !w.canFire || this.time < w.nextFire) return;
    w.nextFire = this.time + (stab ? 1.0 : 0.4); w.startAction('fire', stab ? 0.5 : 0.3); w.recoilIndex++;
    const d = a.aimDir(); const range = u2m(stab ? 48 : 64);
    const hit = traceShot(this.pw, a, this.actors, a.x, a.eyeY, a.z, d[0], d[1], d[2], range);
    if (hit.actor) {
      const v = hit.actor; const vf = v.forward(); const behind = (vf[0] * d[0] + vf[2] * d[2]) > 0.5;
      let dmg = stab ? 65 : 40; if (behind) dmg = stab ? 180 : 90;
      if (v.armor > 0 && hit.group !== 'leg' && hit.group !== 'head') { dmg = dmg * 0.85; v.armor = Math.max(0, v.armor - 5); }
      this.applyDamage(v, a, Math.round(dmg), 'knife', hit.group ?? 'chest');
    }
    this.events.emit('knifeSwing', { actorId: a.id, hit: !!hit.actor || hit.distance < range });
    this.events.emit('shot', { actorId: a.id, weapon: 'knife', origin: [a.x, a.eyeY, a.z], dir: d, hit: hit.distance < range ? hit.point : null, hitActor: hit.actor?.id ?? null, hitGroup: hit.group, surface: hit.surface, normal: hit.normal });
  }
  private throwActiveGrenade(a: Actor, strength: number) {
    const w = a.active; if (w.def.slot !== 'grenade' || w.action !== 'idle') return;
    w.startAction('throw', 0.45);
    const d = a.aimDir();
    const kind = w.def.grenade as GrenadeKind;
    // release slightly forward and up from the eye
    const ox = a.x + d[0] * 0.4, oy = a.eyeY - 0.05 + d[1] * 0.4, oz = a.z + d[2] * 0.4;
    // small upward bias like the CS throw
    let dx = d[0], dy = d[1] + 0.12, dz = d[2]; const l = Math.hypot(dx, dy, dz); dx /= l; dy /= l; dz /= l;
    this.grenades.throwGrenade(a, kind, ox, oy, oz, dx, dy, dz, strength);
    a.removeWeapon(w);
  }
  dropActive(a: Actor) {
    const w = a.active;
    if (w.def.slot === 'melee' || w.def.slot === 'grenade') return;
    const d = a.forward();
    if (w.def.slot === 'bomb') { this.match.dropBomb(a, a.x + d[0] * 0.8, a.y + 0.05, a.z + d[2] * 0.8); this.spawnItem(null, a.x + d[0] * 0.8, a.y, a.z + d[2] * 0.8, 'bomb'); return; }
    a.removeWeapon(w); w.interrupt(); w.zoomLevel = 0; a.rezoomLevel = 0;
    this.spawnItem(w, a.x + d[0] * 0.8, a.y, a.z + d[2] * 0.8);
    this.events.emit('itemDrop', { actorId: a.id, weapon: w.def.id, pos: [a.x, a.y, a.z] });
    this.events.emit('weaponSwitch', { actorId: a.id, weapon: a.active.def.id });
    this.events.emit('scope', { actorId: a.id, level: 0 });
  }
  spawnItem(w: WeaponInstance | null, x: number, y: number, z: number, kind: 'weapon' | 'bomb' = 'weapon') {
    const f = this.pw.raycast(x, y + 1.0, z, 0, -1, 0, 6, t => t?.kind === 'actor' || t?.kind === 'grenade');
    const gy = f ? f.point[1] : y;
    this.items.push({ id: this.nextItemId++, kind, weapon: w, x, y: gy, z, yaw: this.rng.next() * Math.PI * 2 });
  }
  private updateItems() {
    for (let i = this.items.length - 1; i >= 0; i--) {
      const it = this.items[i];
      for (const a of this.actors) {
        if (!a.alive) continue;
        const d = Math.hypot(a.x - it.x, a.z - it.z); if (d > 1.0 || Math.abs(a.y - it.y) > 1.2) continue;
        if (it.kind === 'bomb') { if (a.team === 'T' && !a.inv.bomb) { this.match.giveBomb(a); this.items.splice(i, 1); break; } continue; }
        const w = it.weapon!; const slot = w.def.slot;
        if (slot === 'primary' && !a.inv.primary) { a.inv.primary = w; w.action = 'holstered'; this.events.emit('itemPickup', { actorId: a.id, weapon: w.def.id }); this.items.splice(i, 1); if (a.active === a.inv.melee || a.active === a.inv.secondary) { a.switchTo(w); this.events.emit('weaponSwitch', { actorId: a.id, weapon: w.def.id }); } break; }
        if (slot === 'secondary' && !a.inv.secondary) { a.inv.secondary = w; w.action = 'holstered'; this.events.emit('itemPickup', { actorId: a.id, weapon: w.def.id }); this.items.splice(i, 1); break; }
      }
    }
  }
  /** E-key swap: pick up the nearest weapon item, dropping the current one in that slot. */
  interactPickup(a: Actor): boolean {
    let best: WorldItem | null = null, bd = 1.6;
    for (const it of this.items) { if (it.kind !== 'weapon') continue; const d = Math.hypot(a.x - it.x, a.z - it.z); if (d < bd) { bd = d; best = it; } }
    if (!best || !best.weapon) return false;
    const slot = best.weapon.def.slot; const cur = slot === 'primary' ? a.inv.primary : a.inv.secondary;
    if (cur) { a.removeWeapon(cur); cur.interrupt(); this.spawnItem(cur, a.x, a.y, a.z); }
    if (slot === 'primary') a.inv.primary = best.weapon; else a.inv.secondary = best.weapon;
    best.weapon.action = 'holstered'; a.switchTo(best.weapon);
    this.items.splice(this.items.indexOf(best), 1);
    this.events.emit('itemPickup', { actorId: a.id, weapon: best.weapon.def.id });
    this.events.emit('weaponSwitch', { actorId: a.id, weapon: a.active.def.id });
    return true;
  }
  siteAt(x: number, z: number, y: number): 'A' | 'B' | null { for (const s of SITES) if (x >= s.x0 && x <= s.x1 && z >= s.z0 && z <= s.z1 && Math.abs(y - s.y) < 2.5) return s.id; return null; }
  inBuyZone(a: Actor): boolean { const f = floorYAt(a.x, a.z); if (!f) return false; return f.rect.id === (a.team === 'T' ? 'tspawn' : 'ctspawn'); }
  private updateObjective(a: Actor, inp: ActorInput, dt: number) {
    const m = this.match; const rules = m.rules;
    if (m.phase === 'live' && a.team === 'T' && a.inv.bomb && inp.interact && a.grounded) {
      const site = this.siteAt(a.x, a.z, a.y);
      if (site) {
        if (a.active !== a.inv.bomb) { a.switchTo(a.inv.bomb, true); this.events.emit('weaponSwitch', { actorId: a.id, weapon: 'c4' }); }
        a.plantProgress += dt / rules.plantTime; a.interacting = true;
        this.events.emit('plantProgress', { actorId: a.id, progress: a.plantProgress });
        if (a.plantProgress >= 1) { a.plantProgress = 0; a.interacting = false; m.plantComplete(a, site, a.x, a.y, a.z); this.events.emit('weaponSwitch', { actorId: a.id, weapon: a.active.def.id }); }
        return;
      }
    }
    if (a.plantProgress > 0 && !(inp.interact && a.grounded)) { a.plantProgress = 0; this.events.emit('plantProgress', { actorId: a.id, progress: 0 }); }
    else if (a.plantProgress > 0 && !this.siteAt(a.x, a.z, a.y)) { a.plantProgress = 0; this.events.emit('plantProgress', { actorId: a.id, progress: 0 }); }
    if (m.phase === 'planted' && a.team === 'CT' && m.bomb.planted && !m.bomb.defused) {
      const b = m.bomb.planted; const d = Math.hypot(a.x - b.x, a.z - b.z); const near = d < 1.5 && Math.abs(a.y - b.y) < 1.5;
      const yawTo = Math.atan2(-(b.x - a.x), -(b.z - a.z)); let dy = yawTo - a.yaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy));
      const facing = Math.abs(dy) < 1.2 || d < 0.7;
      if (inp.interact && near && facing && (m.bomb.defuserId === null || m.bomb.defuserId === a.id)) {
        m.bomb.defuserId = a.id; a.interacting = true;
        const dur = a.inv.kit ? rules.defuseTimeKit : rules.defuseTime;
        a.defuseProgress += dt / dur;
        this.events.emit('defuseProgress', { actorId: a.id, progress: a.defuseProgress, kit: a.inv.kit });
        if (a.defuseProgress >= 1) { a.defuseProgress = 0; a.interacting = false; m.defuseComplete(a); }
        return;
      }
    }
    if (a.defuseProgress > 0 || m.bomb.defuserId === a.id) { a.defuseProgress = 0; a.interacting = false; if (m.bomb.defuserId === a.id) m.bomb.defuserId = null; this.events.emit('defuseProgress', { actorId: a.id, progress: 0, kit: a.inv.kit }); }
    if (inp.interact && !a.interactLatch) { a.interactLatch = true; this.interactPickup(a); }
    if (!inp.interact) a.interactLatch = false;
  }
  applyAreaDamage(v: Actor, attacker: Actor | null, dmg: number, weapon: string, armorRatio: number) {
    if (!v.alive) return;
    let d = dmg;
    if (v.armor > 0) { const nd = d * armorRatio * 0.5; const loss = (d - nd) * 0.5; v.armor = Math.max(0, Math.round(v.armor - loss)); d = nd; }
    if (weapon === 'molotov' || weapon === 'incendiary') { v.burnAccum = (v.burnAccum ?? 0) + d; if (v.burnAccum < 1) return; d = Math.floor(v.burnAccum); v.burnAccum -= d; }
    this.applyDamage(v, attacker, Math.round(d), weapon, 'chest');
  }
  applyDamage(v: Actor, attacker: Actor | null, dmg: number, weapon: string, group: string) {
    if (!v.alive || dmg <= 0) return;
    if (attacker && attacker.team === v.team && attacker !== v) dmg = Math.round(dmg * 0.33); // friendly fire reduced (demo)
    v.health -= dmg; v.lastAttackerId = attacker?.id ?? null; v.lastDamageWeapon = weapon;
    if (attacker && attacker !== v && attacker.team !== v.team) attacker.damageDealt += Math.min(dmg, Math.max(0, v.health + dmg));
    this.events.emit('hurt', { actorId: v.id, attackerId: attacker?.id ?? null, damage: dmg, hitGroup: group, weapon });
    if (v.health <= 0) this.kill(v, attacker, weapon, group === 'head');
  }
  kill(v: Actor, killer: Actor | null, weapon: string, headshot: boolean) {
    v.health = 0; v.alive = false; v.deathTime = 0; v.plantProgress = 0; v.defuseProgress = 0; v.interacting = false;
    const f = v.forward(); v.deathDir = [f[0], 0, f[2]];
    if (this.match.bomb.defuserId === v.id) this.match.bomb.defuserId = null;
    v.active.interrupt(); v.rezoomLevel = 0; this.events.emit('scope', { actorId: v.id, level: 0 });
    // drop bomb and best weapon
    if (v.inv.bomb) { this.match.dropBomb(v, v.x, v.y, v.z); this.spawnItem(null, v.x, v.y, v.z, 'bomb'); }
    const drop = v.inv.primary ?? v.inv.secondary; if (drop) { v.removeWeapon(drop); this.spawnItem(drop, v.x + (this.rng.next() - 0.5), v.y, v.z + (this.rng.next() - 0.5)); }
    v.setCollidable(false, this.pw);
    this.match.onKill(killer, v, weapon);
    this.events.emit('kill', { killerId: killer?.id ?? null, victimId: v.id, weapon, headshot, time: this.time });
    if (v === this.player) this.ensureSpectate();
  }
  /** Buy for the player (or bot). */
  buy(a: Actor, item: string): string | null { return this.match.buy(a, item, this.inBuyZone(a)); }
  /** Visibility test used by bots (world + smoke + flash). */
  canSee(from: Actor, to: Actor): boolean {
    if (from.flashAlpha > 0.75) return false;
    const ax = from.x, ay = from.eyeY, az = from.z;
    const targets: [number, number, number][] = [[to.x, to.eyeY, to.z], [to.x, to.y + to.height * 0.5, to.z]];
    for (const [bx, by, bz] of targets) {
      if (!this.pw.lineOfSight(ax, ay, az, bx, by, bz)) continue;
      if (this.grenades.segmentInSmoke(ax, ay, az, bx, by, bz)) continue;
      return true;
    }
    return false;
  }
  get stats() { return { actors: this.actors.length, items: this.items.length, ...this.grenades.counts, noises: this.noises.length }; }
}
const IDLE: ActorInput = { wishX: 0, wishZ: 0, jump: false, crouch: false, walk: false, fire: false, firePressed: false, altPressed: false, reload: false, inspect: false, interact: false, drop: false, switchTo: null };
export { IDLE as IDLE_INPUT, RECTS, WEAPONS, PLAYER_HEIGHT, m2u };
