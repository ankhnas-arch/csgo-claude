import type { Actor } from '../actor';
import type { Game, ActorInput } from '../game';
import type { BotProfile } from '../../data/match';
import { SITES } from '../../data/map/layout';
import { u2m } from '../../data/units';
import type { WeaponInstance } from '../weapon';

type Role = 'planter' | 'escort' | 'anchorA' | 'anchorB' | 'rotator' | 'defuser';
interface Memory { x: number; y: number; z: number; time: number; actorId: number }

/**
 * Bot brain: perception (LOS + smoke + flash + FOV + reaction), short-term memory, hearing, objective roles,
 * grid path following with stuck recovery, cover holds, bursts/reload, scoped AWP use and simple utility throws.
 * Bots produce the same ActorInput as the player, so all weapon/objective rules are shared.
 */
export class BotBrain {
  role: Role = 'escort';
  goal: [number, number] | null = null; goalReason = '';
  path: [number, number][] | null = null; pathIdx = 0; pathAge = 0; pathGoal: [number, number] | null = null;
  target: Actor | null = null; targetSeenTime = -10; reaction = 0; memory: Memory | null = null;
  thinkT = 0; planT = 0; stuckT = 0; lastX = 0; lastZ = 0; moveCheckT = 0; stuckCount = 0;
  hold: [number, number] | null = null; holdUntil = 0; holdYaw = 0;
  burst = 0; burstPause = 0; aimErrX = 0; aimErrY = 0; aimErrT = 0; wantHead = false;
  usedUtility = new Set<string>(); lastThrow = 0; bought = false; strafeDir = 1; strafeT = 0; crouchHold = false;
  flashedRetreat: [number, number] | null = null; wanderT = 0;
  jumpRequest = false; sidestep = 0; sidestepT = 0;
  constructor(public a: Actor, public g: Game, public p: BotProfile) {}
  onRoundStart() { this.goal = null; this.path = null; this.target = null; this.memory = null; this.usedUtility.clear(); this.bought = false; this.hold = null; this.stuckT = 0; this.stuckCount = 0; this.reaction = 0; this.flashedRetreat = null; this.planT = 0; }
  onSideSwitch() { this.onRoundStart(); }

  think(dt: number, frozen: boolean): ActorInput {
    const a = this.a, g = this.g, m = g.match;
    const inp: ActorInput = { wishX: 0, wishZ: 0, jump: false, crouch: false, walk: false, fire: false, firePressed: false, altPressed: false, reload: false, inspect: false, interact: false, drop: false, switchTo: null };
    if (m.phase === 'freeze') { if (!this.bought) { this.buy(); this.bought = true; this.assignRole(); } this.lookAround(dt, inp); return inp; }
    if (frozen) return inp;
    this.thinkT += dt; this.planT += dt; this.pathAge += dt;
    // perception every tick (cheap enough for 9 bots) but reaction gated
    this.perceive(dt);
    if (this.planT > 0.5) { this.planT = 0; this.decideGoal(); }
    // weapon choice
    const best = a.inv.primary && a.inv.primary.totalAmmo > 0 ? a.inv.primary : a.inv.secondary && a.inv.secondary.totalAmmo > 0 ? a.inv.secondary : a.inv.melee;
    const wantBomb = this.role === 'planter' && a.inv.bomb && this.inSite() && !this.target;
    if (!wantBomb && a.active !== best && a.active.def.slot !== 'grenade' && a.active.action !== 'throw') inp.switchTo = best;
    // reload logic
    const w = a.active;
    if (w.def.magSize > 0 && w.mag === 0 && w.reserve > 0 && w.action === 'idle') inp.reload = true;
    else if (w.def.magSize > 0 && w.mag < w.def.magSize * 0.35 && w.reserve > 0 && !this.target && g.time - this.targetSeenTime > 1.5 && w.action === 'idle') inp.reload = true;
    // flashed: crouch and back off
    if (a.flashAlpha > 0.6) { inp.crouch = true; if (!this.flashedRetreat) { const f = a.forward(); this.flashedRetreat = [a.x - f[0] * 3, a.z - f[2] * 3]; } this.moveToward(this.flashedRetreat[0], this.flashedRetreat[1], inp, dt, false); inp.walk = true; return inp; }
    this.flashedRetreat = null;
    // in fire: get out
    const fire = g.grenades.fires.find(f => Math.hypot(f.x - a.x, f.z - a.z) < g.grenades.fireRadius(f) + 0.8 && Math.abs(f.y - a.y) < 1.5);
    if (fire) { const dx = a.x - fire.x, dz = a.z - fire.z; const l = Math.hypot(dx, dz) || 1; const tx = a.x + dx / l * 4, tz = a.z + dz / l * 4; this.setGoal([tx, tz], 'escape fire'); this.followPath(inp, dt, true); return inp; }
    const farTarget = this.target ? Math.hypot(this.target.x - a.x, this.target.z - a.z) > this.effectiveRange() : false;
    if (this.target) this.engage(inp, dt, farTarget);
    else this.utility(inp);
    // objective interaction
    const objectiveDone = this.objective(inp, dt);
    if (!objectiveDone) {
      if (this.target && this.target.alive && farTarget) {
        // target beyond effective range: keep advancing along the path while tracking it
        this.followPath(inp, dt, true, true);
      } else if (this.target && this.target.alive) {
        // engaged: small strafes, hold ground unless very close
        this.strafeT -= dt; if (this.strafeT <= 0) { this.strafeT = 0.5 + g.rng.next() * 0.8; this.strafeDir = g.rng.next() < 0.5 ? -1 : 1; this.crouchHold = g.rng.next() < 0.3; }
        const f = a.forward(); const rx = -f[2], rz = f[0];
        const dist = Math.hypot(this.target.x - a.x, this.target.z - a.z);
        const mv = a.active.def.category === 'sniper' ? 0 : dist > 6 ? 0.45 : 0.9;
        inp.wishX = rx * this.strafeDir * mv; inp.wishZ = rz * this.strafeDir * mv;
        inp.crouch = this.crouchHold && dist > 8;
      } else this.followPath(inp, dt, false);
    }
    this.stuckCheck(inp, dt);
    return inp;
  }
  effectiveRange(): number { const c = this.a.active.def.category; return c === 'sniper' ? 95 : c === 'rifle' ? 55 : c === 'pistol' ? 26 : c === 'knife' ? 2.5 : 30; }
  private inSite(): boolean { return this.g.siteAt(this.a.x, this.a.z, this.a.y) !== null; }
  private siteCenter(id: 'A' | 'B'): [number, number, number] { const s = SITES.find(s => s.id === id)!; return [(s.x0 + s.x1) / 2, s.y, (s.z0 + s.z1) / 2]; }
  private assignRole() {
    const a = this.a, g = this.g, plan = g.botPlan;
    if (a.team === 'T') {
      this.role = a.inv.bomb ? 'planter' : 'escort';
    } else {
      const mates = g.actors.filter(x => x.team === 'CT' && x.isBot);
      const i = mates.indexOf(a);
      const order: Role[] = mates.length >= 5 ? ['anchorA', 'anchorB', 'anchorA', 'anchorB', 'rotator'] : ['anchorA', 'anchorB', 'anchorA', 'rotator'];
      this.role = order[((i + plan.round) % order.length + order.length) % order.length];
    }
  }
  private decideGoal() {
    const a = this.a, g = this.g, m = g.match, plan = g.botPlan, rnd = () => g.rng.next();
    if (a.team === 'T') {
      const site = plan.tSite;
      const [sx, sy, sz] = this.siteCenter(site); void sy;
      // retrieve a dropped bomb if nobody carries it and I'm nearest
      if (m.bomb.dropped && !m.bomb.planted) {
        const d = m.bomb.dropped; const ts = g.actors.filter(x => x.team === 'T' && x.alive);
        const nearest = ts.slice().sort((p, q) => Math.hypot(p.x - d.x, p.z - d.z) - Math.hypot(q.x - d.x, q.z - d.z))[0];
        if (nearest === a) { this.setGoal([d.x, d.z], 'retrieve bomb'); return; }
      }
      if (a.inv.bomb) { this.role = 'planter'; if (!this.inSite()) this.setGoal(this.plantSpot(site), 'go plant'); return; }
      if (m.bomb.planted) {
        // post-plant: hold cover near the bomb, facing outward
        if (!this.hold || g.time > this.holdUntil) { const b = m.bomb.planted; this.hold = g.nav.coverNear(b.x, b.z, 7, rnd); this.holdUntil = g.time + 8 + rnd() * 8; }
        if (this.hold) this.setGoal(this.hold, 'hold post-plant');
        return;
      }
      // escort: move toward site with a spread of cover points around the site; investigate memory nearby
      if (this.memory && g.time - this.memory.time < this.p.memorySeconds && Math.hypot(this.memory.x - a.x, this.memory.z - a.z) < 14) { this.setGoal([this.memory.x, this.memory.z], 'investigate'); return; }
      if (!this.hold || g.time > this.holdUntil) { this.hold = g.nav.coverNear(sx, sz, 8, rnd); this.holdUntil = g.time + 6 + rnd() * 8; }
      if (this.hold) this.setGoal(this.hold, 'escort to site');
    } else {
      if (m.bomb.planted) {
        const b = m.bomb.planted;
        const cts = g.actors.filter(x => x.team === 'CT' && x.alive && x.isBot);
        const nearest = cts.slice().sort((p, q) => Math.hypot(p.x - b.x, p.z - b.z) - Math.hypot(q.x - b.x, q.z - b.z))[0];
        const defuserAlive = m.bomb.defuserId !== null && g.actorById(m.bomb.defuserId)?.alive;
        if (nearest === a || (m.bomb.defuserId === a.id)) { this.role = 'defuser'; this.setGoal([b.x, b.z], 'defuse'); return; }
        if (!defuserAlive && cts.length <= 1) { this.role = 'defuser'; this.setGoal([b.x, b.z], 'defuse'); return; }
        if (!this.hold || g.time > this.holdUntil) { this.hold = g.nav.coverNear(b.x, b.z, 6, rnd); this.holdUntil = g.time + 5 + rnd() * 5; }
        if (this.hold) this.setGoal(this.hold, 'cover defuser');
        return;
      }
      // pre-plant: anchor a site; rotator investigates noises / memory
      const site: 'A' | 'B' = this.role === 'anchorB' ? 'B' : this.role === 'anchorA' ? 'A' : (plan.ctRotateTo ?? (plan.round % 2 ? 'A' : 'B'));
      if (this.role === 'rotator' && plan.ctRotateTo) { const [sx, , sz] = this.siteCenter(plan.ctRotateTo); if (!this.hold || g.time > this.holdUntil) { this.hold = g.nav.coverNear(sx, sz, 7, rnd); this.holdUntil = g.time + 6 + rnd() * 6; } if (this.hold) this.setGoal(this.hold, 'rotate'); return; }
      if (this.memory && g.time - this.memory.time < this.p.memorySeconds && Math.hypot(this.memory.x - a.x, this.memory.z - a.z) < 12) { this.setGoal([this.memory.x, this.memory.z], 'investigate'); return; }
      const [sx, , sz] = this.siteCenter(site);
      if (!this.hold || g.time > this.holdUntil) { this.hold = g.nav.coverNear(sx, sz, 7, rnd); this.holdUntil = g.time + 10 + rnd() * 10; }
      if (this.hold) this.setGoal(this.hold, 'anchor ' + site);
    }
  }
  private plantSpot(site: 'A' | 'B'): [number, number] {
    const s = SITES.find(s => s.id === site)!; const r = this.g.rng;
    // spot inside the site rectangle (inset), random but nav-walkable
    for (let i = 0; i < 10; i++) { const x = s.x0 + 2 + r.next() * (s.x1 - s.x0 - 4), z = s.z0 + 2 + r.next() * (s.z1 - s.z0 - 4); if (this.g.nav.isWalkable(x, z)) return [x, z]; }
    return [(s.x0 + s.x1) / 2, (s.z0 + s.z1) / 2];
  }
  private setGoal(goal: [number, number], reason: string) {
    if (this.goal && Math.hypot(this.goal[0] - goal[0], this.goal[1] - goal[1]) < 0.5) { this.goalReason = reason; return; }
    this.goal = goal; this.goalReason = reason; this.path = null;
  }
  private perceive(dt: number) {
    const a = this.a, g = this.g;
    let best: Actor | null = null, bd = Infinity;
    const f = a.forward(); const cosFov = Math.cos(this.p.fovDeg * 0.5 * Math.PI / 180);
    for (const e of g.actors) {
      if (e.team === a.team || !e.alive) continue;
      const dx = e.x - a.x, dz = e.z - a.z; const d = Math.hypot(dx, dz);
      if (d > this.p.visionRange) continue;
      const dot = (dx * f[0] + dz * f[2]) / Math.max(1e-4, d);
      const inFov = dot > cosFov || d < 2.5 || (this.target === e && dot > cosFov - 0.35);
      if (!inFov) continue;
      if (!g.canSee(a, e)) continue;
      if (d < bd) { bd = d; best = e; }
    }
    if (best) {
      const stationaryBonus = a.speed2d < 0.5 ? 1.5 : 1;
      this.reaction += dt * stationaryBonus * (this.target === best ? 3 : 1);
      this.memory = { x: best.x, y: best.y, z: best.z, time: g.time, actorId: best.id };
      if (this.reaction >= this.p.reactionTime) { if (this.target !== best) { this.target = best; this.aimErrT = 0; this.burst = 0; } this.targetSeenTime = g.time; }
    } else {
      this.reaction = Math.max(0, this.reaction - dt * 2);
      if (this.target && g.time - this.targetSeenTime > 0.35) { this.target = null; }
    }
    // hearing: enemy gunfire / footsteps nearby
    for (const n of g.noises) {
      if (n.team === a.team) continue;
      const d = Math.hypot(n.x - a.x, n.z - a.z); const r = n.loud ? this.p.hearingRadius : this.p.hearingRadius * 0.35;
      if (d < r && g.time - n.time < 0.2 && (!this.memory || g.time - this.memory.time > 0.5)) {
        this.memory = { x: n.x, y: n.y, z: n.z, time: g.time, actorId: n.actorId };
        if (a.team === 'CT' && !g.match.bomb.planted) { const s = g.siteAt(n.x, n.z, n.y); if (s) g.botPlan.ctRotateTo = s; }
      }
    }
    // damage from unseen attacker: remember their position
    if (a.lastAttackerId !== null && a.health < 100) { const at = g.actorById(a.lastAttackerId); if (at && at.alive && at.team !== a.team && (!this.memory || this.memory.actorId !== at.id)) this.memory = { x: at.x, y: at.y, z: at.z, time: g.time, actorId: at.id }; }
  }
  private engage(inp: ActorInput, dt: number, far = false) {
    const a = this.a, t = this.target!, g = this.g, w = a.active;
    if (w.def.slot === 'grenade' || w.def.slot === 'bomb') { inp.switchTo = a.inv.primary ?? a.inv.secondary ?? a.inv.melee; return; }
    const dist = Math.hypot(t.x - a.x, t.z - a.z);
    // aim point: head or chest, with error resampled periodically
    this.aimErrT -= dt;
    if (this.aimErrT <= 0) { this.aimErrT = 0.25 + g.rng.next() * 0.2; const e = this.p.aimErrorDeg * (a.speed2d > 1 ? 1.6 : 1) * (t.speed2d > 2 ? 1.4 : 1); this.aimErrX = g.rng.gauss() * e; this.aimErrY = g.rng.gauss() * e * 0.6; this.wantHead = g.rng.next() < (this.p.aimErrorDeg < 3 ? 0.4 : 0.15); }
    const ty = this.wantHead ? t.eyeY : t.y + t.height * 0.55;
    const dx = t.x - a.x, dy = ty - a.eyeY, dz = t.z - a.z;
    const yawTo = Math.atan2(-dx, -dz), pitchTo = Math.atan2(dy, Math.hypot(dx, dz));
    const desYaw = yawTo + this.aimErrX * Math.PI / 180, desPitch = pitchTo + this.aimErrY * Math.PI / 180;
    let ey = desYaw - a.yaw; ey = Math.atan2(Math.sin(ey), Math.cos(ey)); const ep = desPitch - a.pitch;
    const sp = this.p.aimTrackSpeed * dt;
    a.yaw += Math.sign(ey) * Math.min(Math.abs(ey), sp); a.pitch += Math.sign(ep) * Math.min(Math.abs(ep), sp);
    // counter recoil slightly on hard
    if (this.p.aimErrorDeg < 3) a.pitch -= a.aimPunchPitch * Math.PI / 180 * 0.4 * dt * 8;
    const onTarget = Math.abs(ey) < 0.06 && Math.abs(ep) < 0.06;
    if (far) return; // track only; don't waste ammo beyond effective range
    // AWP: scope in when far
    if (w.def.zoomLevels > 0) {
      if (w.zoomLevel === 0 && dist > 6 && w.action === 'idle' && !w.needsRechamber) inp.altPressed = true;
      if (onTarget && w.zoomLevel > 0 && w.canFire) inp.firePressed = true;
      return;
    }
    if (w.def.category === 'knife') { if (dist < 1.4 && onTarget) inp.firePressed = true; this.moveToward(t.x, t.z, inp, dt, true); return; }
    if (this.burstPause > 0) { this.burstPause -= dt; return; }
    if (onTarget || (dist < 4 && Math.abs(ey) < 0.2)) {
      if (w.def.fullAuto) { inp.fire = true; this.burst += dt; if (this.burst > this.p.burstLength * w.def.cycleTime) { this.burst = 0; this.burstPause = 0.18 + g.rng.next() * 0.25; } }
      else { inp.firePressed = g.time >= w.nextFire; }
    }
  }
  private utility(inp: ActorInput) {
    const a = this.a, g = this.g, m = g.match;
    if (a.inv.grenades.length === 0 || g.time - this.lastThrow < 3 || m.phase === 'freeze') return;
    if (a.active.def.slot === 'grenade') {
      // currently holding a grenade: throw it toward the intended point
      const tgt = this.throwTarget; if (!tgt) { inp.switchTo = a.inv.primary ?? a.inv.secondary; return; }
      const dx = tgt[0] - a.x, dz = tgt[2] - a.z; const d = Math.hypot(dx, dz);
      const yawTo = Math.atan2(-dx, -dz); let ey = yawTo - a.yaw; ey = Math.atan2(Math.sin(ey), Math.cos(ey));
      const pitchTo = Math.min(0.6, 0.15 + d / 40);
      a.yaw += Math.sign(ey) * Math.min(Math.abs(ey), 6 * (1 / 64)); a.pitch += (pitchTo - a.pitch) * 0.3;
      if (Math.abs(ey) < 0.05 && a.active.action === 'idle') { inp.firePressed = true; inp.throwStrength = Math.min(1, 0.45 + d / 30); this.lastThrow = g.time; this.throwTarget = null; }
      return;
    }
    if (g.rng.next() > this.p.utilityChance * 0.02) return; // rate limit decisions
    const site = a.team === 'T' ? g.botPlan.tSite : (m.bomb.planted?.site ?? (this.role === 'anchorB' ? 'B' : 'A'));
    const [sx, sy, sz] = this.siteCenter(site);
    const dSite = Math.hypot(sx - a.x, sz - a.z);
    const pick = (kind: string) => a.inv.grenades.find(x => x.def.id === kind && !this.usedUtility.has(kind + x.id)) ?? null;
    let gren: WeaponInstance | null = null; let tgt: [number, number, number] | null = null;
    if (a.team === 'T' && !m.bomb.planted && dSite > 10 && dSite < 26) { gren = pick('smoke') ?? pick('flash'); tgt = [sx, sy, sz]; }
    else if (this.memory && g.time - this.memory.time < 4 && Math.hypot(this.memory.x - a.x, this.memory.z - a.z) < 18) { gren = pick('he') ?? pick('flash') ?? pick('molotov') ?? pick('incendiary'); tgt = [this.memory.x, this.memory.y, this.memory.z]; }
    else if (m.bomb.planted && a.team === 'CT' && Math.hypot(m.bomb.planted.x - a.x, m.bomb.planted.z - a.z) < 20) { gren = pick('incendiary') ?? pick('smoke'); tgt = [m.bomb.planted.x, m.bomb.planted.y, m.bomb.planted.z]; }
    if (gren && tgt) { this.usedUtility.add(gren.def.id + gren.id); this.throwTarget = tgt; inp.switchTo = gren; }
  }
  throwTarget: [number, number, number] | null = null;
  private objective(inp: ActorInput, dt: number): boolean {
    const a = this.a, g = this.g, m = g.match; void dt;
    if (a.team === 'T' && a.inv.bomb && m.phase === 'live' && this.inSite() && (!this.target || Math.hypot(this.target.x - a.x, this.target.z - a.z) > 14)) {
      inp.interact = true; inp.wishX = 0; inp.wishZ = 0; inp.crouch = true; return true;
    }
    if (a.team === 'CT' && m.phase === 'planted' && m.bomb.planted && this.role === 'defuser') {
      const b = m.bomb.planted; const d = Math.hypot(b.x - a.x, b.z - a.z);
      if (d < 1.2) {
        const yawTo = Math.atan2(-(b.x - a.x), -(b.z - a.z)); let ey = yawTo - a.yaw; ey = Math.atan2(Math.sin(ey), Math.cos(ey)); a.yaw += Math.sign(ey) * Math.min(Math.abs(ey), 0.15); a.pitch += (-0.6 - a.pitch) * 0.2;
        if (!this.target || Math.hypot(this.target.x - a.x, this.target.z - a.z) > 10 || b.timeLeft < 8) { inp.interact = true; inp.wishX = 0; inp.wishZ = 0; inp.crouch = true; return true; }
      }
    }
    return false;
  }
  private followPath(inp: ActorInput, dt: number, urgent: boolean, keepLook = false) {
    const a = this.a, g = this.g;
    if (!this.goal) { this.lookAround(dt, inp); return; }
    const gd = Math.hypot(this.goal[0] - a.x, this.goal[1] - a.z);
    if (gd < 0.7) { this.lookAround(dt, inp); if (this.hold) this.holdLook(dt); return; }
    if (!this.path || this.pathAge > 3 || !this.pathGoal || Math.hypot(this.pathGoal[0] - this.goal[0], this.pathGoal[1] - this.goal[1]) > 0.5) {
      const fires = g.grenades.fires;
      const avoid = fires.length ? (ix: number, iz: number) => { const [x, z] = g.nav.grid.toWorld(ix, iz); for (const f of fires) if (Math.hypot(f.x - x, f.z - z) < f.radius + 1) return 60; return 0; } : undefined;
      this.path = g.nav.findPath(a.x, a.z, this.goal[0], this.goal[1], avoid); this.pathIdx = 0; this.pathAge = 0; this.pathGoal = [this.goal[0], this.goal[1]];
      if (!this.path) { this.goal = g.nav.randomNear(a.x, a.z, 6, () => g.rng.next()); return; }
    }
    while (this.pathIdx < this.path.length - 1 && Math.hypot(this.path[this.pathIdx][0] - a.x, this.path[this.pathIdx][1] - a.z) < 0.8) this.pathIdx++;
    const wp = this.path[Math.min(this.pathIdx, this.path.length - 1)];
    this.moveToward(wp[0], wp[1], inp, dt, urgent);
    // look along the path (or toward memory) when not engaged
    if (keepLook) { /* aim handled by engage() */ }
    else if (this.memory && g.time - this.memory.time < 1.5) this.lookAt(this.memory.x, this.memory.y + 1.2, this.memory.z, dt, 5);
    else { const ahead = this.path[Math.min(this.pathIdx + 1, this.path.length - 1)]; this.lookAt(ahead[0], a.eyeY, ahead[1], dt, 4); }
    inp.walk = !urgent && this.goalReason.startsWith('investigate') ;
  }
  private moveToward(x: number, z: number, inp: ActorInput, dt: number, urgent: boolean) {
    const a = this.a; const dx = x - a.x, dz = z - a.z; const d = Math.hypot(dx, dz); if (d < 0.05) return;
    let wx = dx / d, wz = dz / d;
    // teammate avoidance: sidestep if a teammate is directly ahead
    for (const m of this.g.actors) { if (m === a || !m.alive || m.team !== a.team) continue; const mx = m.x - a.x, mz = m.z - a.z; const md = Math.hypot(mx, mz); if (md < 1.3 && (mx * wx + mz * wz) / md > 0.6) { wx += -mz / md * 0.9; wz += mx / md * 0.9; const l = Math.hypot(wx, wz); wx /= l; wz /= l; } }
    if (this.sidestepT > 0) { this.sidestepT -= dt; const rx = -wz, rz = wx; wx = wx * 0.4 + rx * this.sidestep; wz = wz * 0.4 + rz * this.sidestep; const l = Math.hypot(wx, wz); wx /= l; wz /= l; }
    inp.wishX = wx; inp.wishZ = wz; if (this.jumpRequest) { inp.jump = true; this.jumpRequest = false; }
    void urgent;
  }
  private lookAt(x: number, y: number, z: number, dt: number, speed: number) {
    const a = this.a; const dx = x - a.x, dz = z - a.z; const yawTo = Math.atan2(-dx, -dz); let ey = yawTo - a.yaw; ey = Math.atan2(Math.sin(ey), Math.cos(ey));
    const pitchTo = Math.atan2(y - a.eyeY, Math.hypot(dx, dz)) * 0.6; const ep = pitchTo - a.pitch;
    a.yaw += Math.sign(ey) * Math.min(Math.abs(ey), speed * dt); a.pitch += Math.sign(ep) * Math.min(Math.abs(ep), speed * dt);
  }
  private lookAround(dt: number, inp: ActorInput) { void inp; const a = this.a; this.wanderT += dt; a.pitch += (0 - a.pitch) * Math.min(1, dt * 2); a.yaw += Math.sin(this.wanderT * 0.7 + a.id) * 0.25 * dt; }
  private holdLook(dt: number) {
    // face away from the site centre toward the likely approach (toward the enemy spawn side)
    const a = this.a; const g = this.g; const site = g.match.bomb.planted?.site ?? (a.team === 'T' ? g.botPlan.tSite : this.role === 'anchorB' ? 'B' : 'A');
    const [sx, , sz] = this.siteCenter(site);
    const enemySpawnZ = a.team === 'T' ? -48 : 46;
    const tx = sx + (a.x - sx) * 0.2, tz = enemySpawnZ; this.lookAt(tx + Math.sin(this.wanderT) * 4, a.eyeY, tz, dt, 1.5); this.wanderT += dt * 0.5;
  }
  private stuckCheck(inp: ActorInput, dt: number) {
    const a = this.a, g = this.g;
    this.moveCheckT += dt;
    const wantsMove = Math.hypot(inp.wishX, inp.wishZ) > 0.2;
    if (this.moveCheckT > 0.5) {
      this.moveCheckT = 0; const moved = Math.hypot(a.x - this.lastX, a.z - this.lastZ); this.lastX = a.x; this.lastZ = a.z;
      if (wantsMove && moved < 0.25 && !this.target && !a.interacting) { this.stuckT += 0.5; } else this.stuckT = 0;
      if (this.stuckT >= 1.0 && this.stuckT < 2.5) { this.jumpRequest = true; this.sidestep = g.rng.next() < 0.5 ? -1 : 1; this.sidestepT = 0.6; }
      else if (this.stuckT >= 2.5) { this.stuckT = 0; this.stuckCount++; this.path = null; this.pathAge = 99; const alt = g.nav.randomNear(a.x, a.z, 4, () => g.rng.next()); if (alt && this.stuckCount % 2 === 1) { this.goal = alt; this.goalReason = 'unstick'; } this.hold = null; }
    }
  }
  private buy() {
    const a = this.a, g = this.g, r = g.rng;
    const rifle = a.team === 'T' ? 'ak47' : 'm4a4';
    const buy = (item: string) => g.buy(a, item) === null;
    const hasPrimary = !!a.inv.primary;
    if (!hasPrimary) {
      if (a.money >= 4750 + 1000 && r.next() < 0.28) buy('awp');
      else if (a.money >= WEAPONS_PRICE(rifle)) buy(rifle);
    }
    if (a.armor < 100) { if (a.money >= 1000) buy('helmet'); else if (a.money >= 650) buy('kevlar'); }
    if (a.team === 'CT' && !a.inv.kit && a.money >= 400 && r.next() < 0.7) buy('defuser');
    const nades = a.team === 'T' ? ['smoke', 'flash', 'he', 'molotov'] : ['smoke', 'flash', 'he', 'incendiary'];
    for (const n of nades) { if (a.money >= 900 && r.next() < 0.7) buy(n); }
  }
}
function WEAPONS_PRICE(id: string): number { return id === 'ak47' ? 2700 : id === 'm4a4' ? 2900 : 4750; }
