import { describe, it, expect } from 'vitest';
import { PhysicsWorld } from '../src/physics/world';
import { Game } from '../src/sim/game';
import { IDLE_INPUT } from '../src/sim/game';

/** Bots-only integrated match: the "player" actor idles in spawn; nine bots play. Verifies the complete loop terminates with one winner. */
describe('integrated bot match (headless, seeded)', () => {
  it('plays a complete first-to-4 match with plants/defuses and consistent scoring', async () => {
    await PhysicsWorld.init();
    const g = new Game({ playerTeam: 'T', difficulty: 'hard', seed: 1234 });
    const log: string[] = []; let payouts = 0; let plants = 0, defuses = 0, explosions = 0;
    g.events.on('roundEnd', e => { log.push(`round ${e.round}: ${e.winner} by ${e.reason} score T${g.match.teams.T.score}-CT${g.match.teams.CT.score}`); payouts++; });
    g.events.on('bombPlanted', () => plants++); g.events.on('bombDefused', () => defuses++); g.events.on('bombExploded', () => explosions++);
    g.start();
    let ticks = 0; const maxTicks = 64 * 60 * 25;
    while (g.match.phase !== 'matchEnd' && ticks < maxTicks) { g.tick(1 / 64, IDLE_INPUT); ticks++; }
    console.log(log.join('\n')); console.log({ plants, defuses, explosions, ticks, simMinutes: (ticks / 64 / 60).toFixed(1) });
    expect(g.match.phase).toBe('matchEnd');
    expect(g.match.matchWinner).not.toBeNull();
    const s = g.match.teams; expect(Math.max(s.T.score, s.CT.score)).toBe(4);
    expect(payouts).toBe(s.T.score + s.CT.score);
    for (const a of g.actors) { expect(a.money).toBeGreaterThanOrEqual(0); expect(a.money).toBeLessThanOrEqual(16000); }
    // stuck detection: bots should have moved away from spawn during rounds (sampled by kills/plants happening)
    expect(plants + g.actors.reduce((n, a) => n + a.kills, 0)).toBeGreaterThan(3);
    expect(g.grenades.counts.grenades).toBe(0);
  }, 300000);
});
