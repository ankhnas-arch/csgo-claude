import { Emitter } from '../core/events';
import { type EconomyDef, lossBonus } from '../data/economy';
import type { MatchRules } from '../data/match';
import { WEAPONS, type Team } from '../data/weapons';
import type { Actor } from './actor';
import { WeaponInstance } from './weapon';
import type { Phase, RoundEndReason, SimEvents } from './types';

export interface BombState {
  carrierId: number | null;
  dropped: { x: number; y: number; z: number } | null;
  planted: { site: 'A' | 'B'; x: number; y: number; z: number; timeLeft: number; planterId: number } | null;
  defuserId: number | null;
  exploded: boolean; defused: boolean;
}
export interface TeamState { score: number; lossStreak: number; }

/**
 * Round/match rules state machine. Pure: no physics, no rendering. Drives phases, economy and the single-winner guarantee.
 * The Game orchestrator feeds it actor states and time; it emits events for presentation.
 */
export class MatchSim {
  phase: Phase = 'setup';
  phaseTime = 0;         // seconds remaining in current phase (freeze/live/roundEnd)
  round = 0;             // 1-based round number in progress
  roundsPlayed = 0;
  teams: Record<Team, TeamState> = { T: { score: 0, lossStreak: 0 }, CT: { score: 0, lossStreak: 0 } };
  bomb: BombState = { carrierId: null, dropped: null, planted: null, defuserId: null, exploded: false, defused: false };
  bombPlantedThisRound = false;
  lastRound: { winner: Team; reason: RoundEndReason; mvpId: number | null; mvpReason: string } | null = null;
  matchWinner: Team | null = null;
  sidesSwitched = false;
  roundEnded = false;
  events = new Emitter<SimEvents>();
  buyWindowOpen = false;
  constructor(public rules: MatchRules, public eco: EconomyDef, public actors: Actor[]) {}

  actorsOf(team: Team) { return this.actors.filter(a => a.team === team); }
  aliveOf(team: Team) { return this.actors.filter(a => a.team === team && a.alive); }
  get planted() { return this.bomb.planted !== null; }

  setPhase(p: Phase) { const prev = this.phase; this.phase = p; this.events.emit('phase', { phase: p, prev }); }

  startMatch(startMoney = this.eco.startMoney) {
    this.teams = { T: { score: 0, lossStreak: 0 }, CT: { score: 0, lossStreak: 0 } };
    this.round = 0; this.roundsPlayed = 0; this.matchWinner = null; this.sidesSwitched = false; this.lastRound = null;
    for (const a of this.actors) { a.money = startMoney; a.kills = a.deaths = a.assists = a.mvps = a.score = a.damageDealt = 0; a.armor = 0; a.helmet = false; a.giveDefaultLoadout(); }
    this.beginRound();
  }
  beginRound() {
    this.round++;
    this.roundEnded = false; this.bombPlantedThisRound = false;
    this.bomb = { carrierId: null, dropped: null, planted: null, defuserId: null, exploded: false, defused: false };
    for (const a of this.actors) a.resetForRound(a.alive && this.round > 1 && !this.justSwitched);
    this.justSwitched = false;
    // give bomb to a random-ish T (first alive T by id order rotated by round for determinism)
    const ts = this.actorsOf('T');
    if (ts.length) { const carrier = ts[(this.round - 1) % ts.length]; this.giveBomb(carrier); }
    this.phaseTime = this.rules.freezeTime; this.buyWindowOpen = true;
    this.setPhase('freeze');
  }
  justSwitched = false;
  giveBomb(a: Actor) { a.inv.bomb = WeaponInstance.create('c4'); this.bomb.carrierId = a.id; this.bomb.dropped = null; this.events.emit('bombPickup', { actorId: a.id }); }
  dropBomb(a: Actor, x: number, y: number, z: number) {
    if (!a.inv.bomb) return; const wasActive = a.active === a.inv.bomb; a.inv.bomb = null;
    if (wasActive) { a.active = a.inv.primary ?? a.inv.secondary ?? a.inv.melee; a.active.draw(); }
    this.bomb.carrierId = null; this.bomb.dropped = { x, y, z }; this.events.emit('bombDropped', { pos: [x, y, z] });
  }

  /** Advance timers. Called each fixed step by the Game after actors were updated. */
  tick(dt: number) {
    switch (this.phase) {
      case 'freeze':
        this.phaseTime -= dt;
        if (this.phaseTime <= 0) { this.phaseTime = this.rules.roundTime; this.setPhase('live'); }
        break;
      case 'live':
        this.phaseTime -= dt;
        this.buyWindowOpen = this.rules.roundTime - this.phaseTime < 8; // demo: 8 s of buy time after freeze (source: mp_buytime 20 incl. freeze)
        this.resolveRound();
        break;
      case 'planted':
        this.buyWindowOpen = false;
        if (this.bomb.planted) this.bomb.planted.timeLeft -= dt;
        this.resolveRound();
        break;
      case 'roundEnd':
        this.phaseTime -= dt;
        if (this.phaseTime <= 0) this.afterRoundEnd();
        break;
      default: break;
    }
  }
  private resolveRound() {
    if (this.roundEnded) return;
    const tAlive = this.aliveOf('T').length, ctAlive = this.aliveOf('CT').length;
    if (this.bomb.planted) {
      if (this.bomb.defused) return this.endRound('CT', 'defuse');
      if (this.bomb.planted.timeLeft <= 0) { this.bomb.exploded = true; this.events.emit('bombExploded', { pos: [this.bomb.planted.x, this.bomb.planted.y, this.bomb.planted.z] }); return this.endRound('T', 'explode'); }
      if (ctAlive === 0) return this.endRound('T', 'elimination');
      // all T dead after plant: round continues until defuse/explode (CT must defuse)
      return;
    }
    if (tAlive === 0) return this.endRound('CT', 'elimination');
    if (ctAlive === 0) return this.endRound('T', 'elimination');
    if (this.phase === 'live' && this.phaseTime <= 0) return this.endRound('CT', 'timeout');
  }
  /** Called by Game when a plant completes. Guarded so an elimination resolved in the same tick is not double-scored. */
  plantComplete(a: Actor, site: 'A' | 'B', x: number, y: number, z: number) {
    if (this.roundEnded || this.bomb.planted) return false;
    this.bomb.planted = { site, x, y, z, timeLeft: this.rules.bombTime, planterId: a.id }; this.bombPlantedThisRound = true;
    a.inv.bomb = null; this.bomb.carrierId = null;
    if (a.active.def.id === 'c4') { a.active = a.inv.primary ?? a.inv.secondary ?? a.inv.melee; a.active.draw(); }
    for (const t of this.actorsOf('T')) this.addMoney(t, this.eco.plantAwardTeam);
    a.score += 2;
    this.setPhase('planted');
    this.events.emit('bombPlanted', { site, pos: [x, y, z], actorId: a.id });
    return true;
  }
  defuseComplete(a: Actor) {
    if (this.roundEnded || !this.bomb.planted || this.bomb.defused) return false;
    this.bomb.defused = true; this.addMoney(a, this.eco.defuseAward); a.score += 2;
    this.events.emit('bombDefused', { actorId: a.id });
    this.resolveRound();
    return true;
  }
  addMoney(a: Actor, n: number) { a.money = Math.max(0, Math.min(this.eco.maxMoney, a.money + n)); }
  onKill(killer: Actor | null, victim: Actor, weapon: string) {
    victim.deaths++;
    if (killer && killer !== victim) {
      if (killer.team === victim.team) { killer.kills--; killer.score -= 1; }
      else { killer.kills++; killer.roundKills++; killer.score += 2; const def = WEAPONS[weapon]; this.addMoney(killer, def ? def.killAward : 300); }
    }
    if (this.phase === 'live' || this.phase === 'planted') this.resolveRound();
  }
  private endRound(winner: Team, reason: RoundEndReason) {
    if (this.roundEnded) return; // single winner guarantee
    this.roundEnded = true;
    const loser: Team = winner === 'T' ? 'CT' : 'T';
    this.teams[winner].score++; this.roundsPlayed++;
    // economy
    const winAward = reason === 'defuse' ? this.eco.winDefuse : reason === 'explode' ? this.eco.winExplode : reason === 'timeout' ? this.eco.winTimeout : this.eco.winElimination;
    for (const a of this.actorsOf(winner)) this.addMoney(a, winAward);
    const streak = this.teams[loser].lossStreak + this.eco.startingLosses;
    const lb = lossBonus(this.eco, streak);
    for (const a of this.actorsOf(loser)) {
      let award = lb;
      if (loser === 'T' && reason === 'timeout' && a.alive) award = this.eco.survivorTimeoutLossBonus; // T survivors on time-out get no loss bonus
      if (loser === 'T' && this.bombPlantedThisRound) award += this.eco.plantBonusOnLoss;
      this.addMoney(a, award);
    }
    this.teams[loser].lossStreak++;
    this.teams[winner].lossStreak = Math.max(0, this.teams[winner].lossStreak - 1);
    // MVP: planter/defuser if objective, else most round kills on winning team
    let mvp: Actor | null = null; let mvpReason = '';
    if (reason === 'defuse') { mvp = this.actors.find(a => a.team === 'CT' && this.bomb.defuserId === a.id) ?? null; mvpReason = 'for defusing the bomb'; }
    else if (reason === 'explode' && this.bomb.planted) { mvp = this.actors.find(a => a.id === this.bomb.planted!.planterId) ?? null; mvpReason = 'for planting the bomb'; }
    if (!mvp) { const w = this.actorsOf(winner).slice().sort((a, b) => b.roundKills - a.roundKills)[0]; if (w && w.roundKills > 0) { mvp = w; mvpReason = `for ${w.roundKills} kill${w.roundKills > 1 ? 's' : ''}`; } }
    if (mvp) mvp.mvps++;
    this.lastRound = { winner, reason, mvpId: mvp?.id ?? null, mvpReason };
    this.phaseTime = this.rules.resultTime;
    this.setPhase('roundEnd');
    this.events.emit('roundEnd', { winner, reason, round: this.round, mvpId: mvp?.id ?? null, mvpReason });
    if (this.teams[winner].score >= this.rules.roundsToWin) { this.matchWinner = winner; }
  }
  private afterRoundEnd() {
    if (this.matchWinner) { this.setPhase('matchEnd'); this.events.emit('matchEnd', { winner: this.matchWinner, score: { T: this.teams.T.score, CT: this.teams.CT.score } }); return; }
    if (!this.sidesSwitched && this.roundsPlayed >= this.rules.switchAfterRounds) { this.switchSides(); }
    this.beginRound();
  }
  switchSides() {
    this.sidesSwitched = true; this.justSwitched = true;
    for (const a of this.actors) { a.team = a.team === 'T' ? 'CT' : 'T'; a.money = this.eco.startMoney; a.alive = true; a.armor = 0; a.helmet = false; a.giveDefaultLoadout(); }
    const t = this.teams.T, ct = this.teams.CT; this.teams = { T: { score: ct.score, lossStreak: 0 }, CT: { score: t.score, lossStreak: 0 } };
    this.events.emit('sideSwitch', { round: this.round });
  }
  /** Buy validation & execution. Returns error string or null. */
  buy(a: Actor, item: string, inBuyZone: boolean): string | null {
    const deny = (r: string) => { this.events.emit('purchaseDenied', { actorId: a.id, item, reason: r }); return r; };
    if (!a.alive) return deny('You are dead');
    if (!(this.phase === 'freeze' || (this.phase === 'live' && this.buyWindowOpen))) return deny('Buy time has expired');
    if (!inBuyZone) return deny('You must be in your spawn zone to buy');
    let cost = 0;
    if (item === 'kevlar') { if (a.armor >= 100) return deny('Already own kevlar'); cost = 650; }
    else if (item === 'helmet') { if (a.armor >= 100 && a.helmet) return deny('Already own kevlar and helmet'); cost = a.armor >= 100 ? 350 : 1000; }
    else if (item === 'defuser') { if (a.team !== 'CT') return deny('Defuse kits are CT only'); if (a.inv.kit) return deny('Already own a defuse kit'); cost = 400; }
    else {
      const def = WEAPONS[item]; if (!def) return deny('Unknown item');
      if (def.team !== 'both' && def.team !== a.team) return deny(`${def.name} is not available to your team`);
      if (def.slot === 'grenade') {
        const total = a.inv.grenades.length; if (total >= 4) return deny('Grenade limit reached (4)');
        const same = a.countGrenade(item); if (same >= (item === 'flash' ? 2 : 1)) return deny(`Already carrying maximum ${def.name}s`);
      } else if (def.slot === 'primary' && a.inv.primary?.def.id === item) return deny('Already own this weapon');
      else if (def.slot === 'secondary' && a.inv.secondary?.def.id === item) return deny('Already own this weapon');
      cost = def.price;
    }
    if (a.money < cost) return deny(`Not enough money ($${cost})`);
    a.money -= cost;
    if (item === 'kevlar') { a.armor = 100; }
    else if (item === 'helmet') { a.armor = 100; a.helmet = true; }
    else if (item === 'defuser') { a.inv.kit = true; }
    else {
      const def = WEAPONS[item];
      if (def.slot === 'grenade') { const g = a.addGrenade(item); void g; }
      else {
        const w = WeaponInstance.create(item);
        if (def.slot === 'primary') { const old = a.inv.primary; a.inv.primary = w; if (old) this.events.emit('itemDrop', { actorId: a.id, weapon: old.def.id, pos: [a.x, a.y, a.z] }); a.switchTo(w); }
        else { const old = a.inv.secondary; a.inv.secondary = w; if (old) this.events.emit('itemDrop', { actorId: a.id, weapon: old.def.id, pos: [a.x, a.y, a.z] }); if (!a.inv.primary) a.switchTo(w); }
      }
    }
    this.events.emit('purchase', { actorId: a.id, item, cost });
    return null;
  }
}
