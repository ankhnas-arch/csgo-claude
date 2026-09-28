import { describe, it, expect } from 'vitest';
import { Actor } from '../src/sim/actor';
import { MatchSim } from '../src/sim/match';
import { WeaponInstance } from '../src/sim/weapon';
import { computeDamage } from '../src/sim/combat';
import { DEMO_RULES } from '../src/data/match';
import { ECONOMY_PRESETS, lossBonus } from '../src/data/economy';
import { WEAPONS } from '../src/data/weapons';

function makeTeams() {
  const actors: Actor[] = [];
  for (let i = 0; i < 5; i++) actors.push(new Actor(i + 1, 'T' + i, 'T', i > 0));
  for (let i = 0; i < 5; i++) actors.push(new Actor(i + 6, 'CT' + i, 'CT', true));
  const m = new MatchSim(DEMO_RULES, ECONOMY_PRESETS.showcase, actors);
  m.startMatch();
  return { m, actors, T: actors.filter(a => a.team === 'T'), CT: actors.filter(a => a.team === 'CT') };
}
const step = (m: MatchSim, s: number) => { for (let i = 0; i < Math.round(s * 64); i++) m.tick(1 / 64); };
const goLive = (m: MatchSim) => { step(m, DEMO_RULES.freezeTime + 0.05); expect(m.phase).toBe('live'); };
const killAll = (m: MatchSim, team: 'T' | 'CT', killer: Actor) => { for (const a of m.actorsOf(team)) if (a.alive) { a.alive = false; a.health = 0; m.onKill(killer, a, 'ak47'); } };

describe('round resolution', () => {
  it('starts in freeze then goes live and awards one score per round', () => {
    const { m, T, CT } = makeTeams(); expect(m.phase).toBe('freeze'); goLive(m);
    killAll(m, 'CT', T[0]);
    expect(m.phase).toBe('roundEnd'); expect(m.teams.T.score).toBe(1); expect(m.teams.CT.score).toBe(0);
    // extra kill events after the round ended must not re-score
    m.onKill(T[0], CT[0], 'ak47'); expect(m.teams.T.score).toBe(1);
  });
  it('timeout without plant is a CT win, T survivors get no loss bonus', () => {
    const { m, T } = makeTeams(); goLive(m); const before = T[0].money; step(m, DEMO_RULES.roundTime + 0.1);
    expect(m.lastRound?.winner).toBe('CT'); expect(m.lastRound?.reason).toBe('timeout'); expect(T[0].money).toBe(before);
  });
  it('plant then all attackers eliminated: round continues until defuse or explosion', () => {
    const { m, T, CT } = makeTeams(); goLive(m);
    expect(m.plantComplete(T[0], 'A', 30, 2, -38)).toBe(true); expect(m.phase).toBe('planted');
    killAll(m, 'T', CT[0]); expect(m.phase).toBe('planted'); expect(m.roundEnded).toBe(false);
    step(m, DEMO_RULES.bombTime + 0.1); expect(m.lastRound?.winner).toBe('T'); expect(m.lastRound?.reason).toBe('explode');
  });
  it('defuse finishing before expiry wins for CT; defuse cannot complete after explosion', () => {
    const { m, T, CT } = makeTeams(); goLive(m); m.plantComplete(T[0], 'B', -36, 0, -38); m.bomb.defuserId = CT[0].id;
    step(m, 5); expect(m.defuseComplete(CT[0])).toBe(true); expect(m.lastRound?.reason).toBe('defuse'); expect(m.teams.CT.score).toBe(1);
    const { m: m2, T: T2, CT: CT2 } = makeTeams(); goLive(m2); m2.plantComplete(T2[0], 'B', -36, 0, -38); step(m2, DEMO_RULES.bombTime + 0.1);
    expect(m2.lastRound?.reason).toBe('explode'); expect(m2.defuseComplete(CT2[0])).toBe(false); expect(m2.teams.CT.score).toBe(0);
  });
  it('simultaneous last elimination and plant: exactly one winner and one payout', () => {
    const { m, T, CT } = makeTeams(); goLive(m); const tMoney = T[1].money;
    killAll(m, 'CT', T[0]); // ends round (T elimination win)
    expect(m.plantComplete(T[0], 'A', 30, 2, -38)).toBe(false); // plant in same tick is rejected
    expect(m.teams.T.score).toBe(1); expect(T[1].money).toBe(tMoney + ECONOMY_PRESETS.showcase.winElimination);
    void CT;
  });
  it('planted then CT eliminated: T wins by elimination, still one score', () => {
    const { m, T } = makeTeams(); goLive(m); m.plantComplete(T[0], 'A', 30, 2, -38); killAll(m, 'CT', T[0]);
    expect(m.lastRound?.reason).toBe('elimination'); expect(m.teams.T.score).toBe(1); step(m, DEMO_RULES.bombTime + 1); expect(m.teams.T.score).toBe(1);
  });
});
describe('economy', () => {
  it('money never goes negative and is capped', () => { const { m, T } = makeTeams(); T[0].money = 100; expect(m.buy(T[0], 'ak47', true)).toMatch(/Not enough/); expect(T[0].money).toBe(100); m.addMoney(T[0], -5000); expect(T[0].money).toBe(0); m.addMoney(T[0], 99999); expect(T[0].money).toBe(16000); });
  it('loss bonus ladder rises from $1900 (starting losses 1) to $3400 and plant bonus applies', () => {
    const e = ECONOMY_PRESETS.showcase; expect(lossBonus(e, 1)).toBe(1900); expect(lossBonus(e, 2)).toBe(2400); expect(lossBonus(e, 4)).toBe(3400); expect(lossBonus(e, 9)).toBe(3400);
    const { m, T, CT } = makeTeams(); goLive(m); const t = T[1].money; m.plantComplete(T[0], 'A', 30, 2, -38); m.bomb.defuserId = CT[0].id; m.defuseComplete(CT[0]);
    expect(T[1].money).toBe(t + e.plantAwardTeam + 1900 + e.plantBonusOnLoss);
  });
  it('buy validation: phase, zone, team, duplicates, grenade limits, kill award', () => {
    const { m, T, CT } = makeTeams();
    expect(m.buy(T[0], 'ak47', false)).toMatch(/spawn zone/); expect(m.buy(T[0], 'm4a4', true)).toMatch(/not available/); expect(m.buy(CT[0], 'ak47', true)).toMatch(/not available/);
    expect(m.buy(T[0], 'ak47', true)).toBeNull(); expect(T[0].inv.primary?.def.id).toBe('ak47'); expect(m.buy(T[0], 'ak47', true)).toMatch(/Already/);
    expect(m.buy(T[0], 'defuser', true)).toMatch(/CT only/); T[0].money = 5000;
    expect(m.buy(T[0], 'flash', true)).toBeNull(); expect(m.buy(T[0], 'flash', true)).toBeNull(); expect(m.buy(T[0], 'flash', true)).toMatch(/maximum/);
    expect(m.buy(T[0], 'smoke', true)).toBeNull(); expect(m.buy(T[0], 'he', true)).toBeNull(); expect(m.buy(T[0], 'molotov', true)).toMatch(/limit/);
    goLive(m); step(m, 9); expect(m.buy(T[0], 'kevlar', true)).toMatch(/expired/);
    const k = T[0].money; m.onKill(T[0], CT[1], 'awp'); expect(T[0].money).toBe(k + 100); m.onKill(T[0], CT[2], 'ak47'); expect(T[0].money).toBe(k + 400);
  });
});
describe('side switch and match end', () => {
  it('switches sides after 3 rounds, swaps scores, resets money, ends at 4', () => {
    const { m, T } = makeTeams(); const t0 = T[0];
    for (let r = 0; r < 3; r++) { goLive(m); killAll(m, 'CT', t0); step(m, DEMO_RULES.resultTime + 0.1); }
    expect(m.sidesSwitched).toBe(true); expect(t0.team).toBe('CT'); expect(m.teams.CT.score).toBe(3); expect(m.teams.T.score).toBe(0); expect(t0.money).toBe(ECONOMY_PRESETS.showcase.startMoney); expect(t0.inv.secondary?.def.id).toBe('usp');
    goLive(m); killAll(m, 'T', t0); expect(m.matchWinner).toBe('CT'); step(m, DEMO_RULES.resultTime + 0.1); expect(m.phase).toBe('matchEnd');
  });
  it('restart clears state: scores, money, bomb, inventories', () => { const { m, T } = makeTeams(); goLive(m); m.plantComplete(T[0], 'A', 30, 2, -38); m.startMatch(); expect(m.teams.T.score).toBe(0); expect(m.bomb.planted).toBeNull(); expect(m.round).toBe(1); expect(T[0].money).toBe(3000); expect(T[0].inv.primary).toBeNull(); });
});
describe('weapon state machine', () => {
  it('reload grants ammo exactly once, at the insert event; interruption before insert grants nothing', () => {
    const w = WeaponInstance.create('ak47'); w.action = 'idle'; w.mag = 3; expect(w.tryReload()).toBe(true);
    const insertAt = w.def.demo.reloadTime * w.def.demo.ammoInsertAt;
    w.tick(insertAt * 0.5, 0); expect(w.mag).toBe(3); w.interrupt(); expect(w.mag).toBe(3); expect(w.reserve).toBe(90);
    w.action = 'idle'; w.tryReload(); let inserted = 0; for (let i = 0; i < 400; i++) { for (const e of w.tick(1 / 64, i / 64)) if (e === 'reloadInsert') inserted++; }
    expect(inserted).toBe(1); expect(w.mag).toBe(30); expect(w.reserve).toBe(63); expect(w.action).toBe('idle');
  });
  it('interrupting after insert keeps the ammo without duplication; reserve conserved overall', () => {
    const w = WeaponInstance.create('m4a4'); w.action = 'idle'; w.mag = 0; w.tryReload(); const insertAt = w.def.demo.reloadTime * w.def.demo.ammoInsertAt; w.tick(insertAt + 0.01, 0); expect(w.mag).toBe(30); w.interrupt(); w.action = 'idle';
    expect(w.mag + w.reserve).toBe(30 + 120 - 30 + 30 - 30); expect(w.mag + w.reserve).toBe(120);
  });
  it('cannot fire faster than cycle time, cannot fire empty, AWP requires rechamber', () => {
    const w = WeaponInstance.create('ak47'); w.action = 'idle'; expect(w.fire(0)).toBe(true); expect(w.fire(0.05)).toBe(false); w.action = 'idle'; expect(w.fire(0.11)).toBe(true); w.mag = 0; w.action = 'idle'; expect(w.fire(1)).toBe(false);
    const a = WeaponInstance.create('awp'); a.action = 'idle'; expect(a.fire(0)).toBe(true); expect(a.needsRechamber).toBe(true); a.action = 'idle'; expect(a.fire(5)).toBe(false); a.needsRechamber = false; expect(a.fire(5)).toBe(true);
  });
});
describe('damage model', () => {
  it('head vs body, armour and range falloff', () => {
    const ak = WEAPONS.ak47; const head = computeDamage(ak, 'head', 10, 0, false), body = computeDamage(ak, 'chest', 10, 0, false), leg = computeDamage(ak, 'leg', 10, 0, false);
    expect(head.damage).toBeGreaterThan(100); expect(body.damage).toBeLessThan(head.damage); expect(leg.damage).toBeLessThan(body.damage);
    const armored = computeDamage(ak, 'chest', 10, 100, false); expect(armored.damage).toBeLessThan(body.damage); expect(armored.armorAfter).toBeLessThan(100);
    const headNoHelmet = computeDamage(ak, 'head', 10, 100, false); expect(headNoHelmet.damage).toBe(head.damage);
    const far = computeDamage(ak, 'chest', 60, 0, false); expect(far.damage).toBeLessThan(body.damage);
    const awp = computeDamage(WEAPONS.awp, 'chest', 30, 100, true); expect(awp.damage).toBeGreaterThanOrEqual(100);
  });
});
