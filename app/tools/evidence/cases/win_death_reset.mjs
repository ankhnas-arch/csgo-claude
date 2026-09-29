import { sleep } from '../harness.mjs';
import { startMatchUI } from '../lib.mjs';
async function fresh(c, team, seed) { await c.ev(([t, s]) => window.__cs2.startMatch(t, 'easy', s), [team, seed]); await c.waitFor(() => window.__cs2.state().app === 'match', null, 20000); await sleep(400); await c.ensureLocked(); await c.ev(() => window.__cs2.freezeBots(true)); await c.ev(() => window.__cs2.setPhaseTime(0.3)); await c.waitPhase('live'); await c.ev(() => window.__cs2.setPhaseTime(600)); }
export default async function (c) {
  const page = await c.open('http://127.0.0.1:4173/?quality=low&scale=0.5');
  await startMatchUI(page, { team: 'T', seed: 91 }); await c.ensureLocked();
  // elimination win: player kills the last enemy by input (others via fixture)
  await c.ev(() => window.__cs2.freezeBots(true)); await c.ev(() => window.__cs2.setPhaseTime(0.3)); await c.waitPhase('live'); await c.ev(() => window.__cs2.setPhaseTime(600));
  await c.ev(() => window.__cs2.killAllEnemies(1)); const last = (await c.ev(() => window.__cs2.actors())).find(a => a.team === 'CT' && a.alive);
  await c.ev(id => window.__cs2.teleport(38, 0, 180, id), last.id); await c.ev(() => window.__cs2.teleport(38, 6, 0)); await sleep(300); c.mx = 640; c.my = 360; await c.ev(() => window.__cs2.giveWeapon('ak47')); await sleep(1200); await c.aimAtPoint(38, 1.72, 0); await c.click(400); await sleep(500);
  const e1 = await c.state(); c.step('elimination: last enemy killed by input → round end, T wins', e1.phase === 'roundEnd' && e1.score.T.score === 1, e1.score); await c.shot('round_won');
  await c.waitPhase('freeze', 20000); c.step('next round starts after result time', (await c.state()).round === 2);
  // timeout without plant: CT wins
  await c.ev(() => window.__cs2.freezeBots(true)); await c.ev(() => window.__cs2.setPhaseTime(0.3)); await c.waitPhase('live'); await c.ev(() => window.__cs2.setPhaseTime(2)); await c.waitPhase('roundEnd', 20000); const e2 = await c.state(); c.step('timeout without plant → CT wins', e2.score.CT.score === 1, e2.score); await c.shot('round_lost');
  // plant then all attackers die: CT must defuse; explosion gives T the round
  await c.waitPhase('freeze', 20000); await c.ev(() => window.__cs2.freezeBots(true)); await c.ev(() => window.__cs2.setPhaseTime(0.3)); await c.waitPhase('live'); await c.ev(() => window.__cs2.setPhaseTime(600)); await c.ev(() => window.__cs2.giveBombToPlayer()); await c.ev(() => window.__cs2.teleport(32, -38, 0)); await sleep(300);
  await page.keyboard.down('KeyE'); await c.waitPhase('planted', 10000); await page.keyboard.up('KeyE'); await c.ev(() => window.__cs2.killTeammates()); await c.ev(() => window.__cs2.killActor(1)); await sleep(800);
  const e3 = await c.state(); c.step('all attackers dead after plant: round continues (planted)', e3.phase === 'planted' && !e3.player.alive); await c.shot('spectating_postplant');
  c.step('dead player has no live control (spectating, no respawn)', !e3.player.alive && e3.player.health === 0);
  await c.ev(() => window.__cs2.setBombTime(3)); await c.waitPhase('roundEnd', 15000); const e4 = await c.state(); c.step('explosion → T wins even with no attackers alive', e4.score.T.score === 2 && e4.bomb.exploded, e4.score); await c.shot('explosion_result');
  // spectator: cycle target with space (input) when teammates alive
  await c.waitPhase('freeze', 20000); await c.ev(() => window.__cs2.setPhaseTime(0.3)); await c.waitPhase('live'); await c.ev(() => window.__cs2.setPhaseTime(600)); await c.ev(() => window.__cs2.killActor(1)); await sleep(500);
  const sp1 = await c.ev(() => window.__cs2.app.game.spectateId); await c.press('Space'); await sleep(300); const sp2 = await c.ev(() => window.__cs2.app.game.spectateId); c.step('spectator target cycles with Space', sp1 !== null && sp2 !== null && sp1 !== sp2, { sp1, sp2 }); await c.shot('spectate');
  // complete the match quickly via fixtures + input: win 2 more rounds by elimination
  await c.ev(() => window.__cs2.killAllEnemies(0)); await c.waitPhase('roundEnd', 10000); await c.waitPhase('freeze', 20000);
  await c.ev(() => window.__cs2.setPhaseTime(0.3)); await c.waitPhase('live'); await c.ev(() => window.__cs2.killAllEnemies(0)); await c.waitPhase('roundEnd', 10000);
  await c.waitFor(() => window.__cs2.state().app === 'matchEnd', null, 20000); await sleep(800); await c.shot('match_result');
  c.step('match ends at 4 rounds with result screen', (await page.locator('#matchres:not(.hidden)').count()) === 1 && (await c.state()).score.T.score === 4);
  // replay via UI twice; then return to menu; then switch teams
  await page.click('#matchres [data-q="replay"]'); await c.waitFor(() => window.__cs2.state().app === 'match', null, 20000); await sleep(500); const r1 = await c.state();
  c.step('replay resets score, money, round', r1.round === 1 && r1.score.T.score === 0 && r1.player.money === 3000 && r1.phase === 'freeze', { round: r1.round, money: r1.player.money });
  const loops1 = (await c.ev(() => window.__cs2.perf())).simLoops; await sleep(2000); const loops2 = (await c.ev(() => window.__cs2.perf())).simLoops; const st2 = await c.state();
  c.step('single simulation loop after replay (sim time advances ≈ real time)', (loops2 - loops1) / 64 < 3.0, `${((loops2 - loops1) / 64).toFixed(1)} sim-s in 2 s real`); void st2;
  await c.ensureLocked(); await c.ev(() => window.__cs2.freezeBots(true)); await c.ev(() => window.__cs2.setPhaseTime(0.3)); await c.waitPhase('live'); for (let i = 0; i < 4; i++) { await c.ev(() => window.__cs2.killAllEnemies(0)); await c.waitPhase('roundEnd', 10000); if (i < 3) { await c.waitPhase('freeze', 20000); await c.ev(() => window.__cs2.setPhaseTime(0.3)); await c.waitPhase('live'); } }
  await c.waitFor(() => window.__cs2.state().app === 'matchEnd', null, 20000); await sleep(500);
  await page.click('#matchres [data-q="replay"]'); await c.waitFor(() => window.__cs2.state().app === 'match', null, 20000); await sleep(500); c.step('second replay works', (await c.state()).round === 1);
  const pf = await c.ev(() => window.__cs2.perf()); c.step('no leftover actors/effects after replays', pf.rigs === 10 && pf.sim.grenades === 0 && pf.effects.smokeClouds === 0, { rigs: pf.rigs, sim: pf.sim });
  await c.press('Escape'); await sleep(300); await page.click('#pause [data-q="quit"]'); await sleep(500); c.step('return to menu from pause', (await c.state()).app === 'menu'); await c.shot('back_to_menu');
  await startMatchUI(page, { team: 'CT', seed: 92 }); const sw = await c.state(); c.step('new match on the other side (CT) starts fresh', sw.player.team === 'CT' && sw.round === 1 && sw.player.secondary === 'usp');
  c.step('no console errors', c.log.errors.length === 0, c.log.errors.slice(0, 3));
  void fresh;
}
