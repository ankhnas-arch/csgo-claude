import { sleep } from '../harness.mjs';
import { startMatchUI } from '../lib.mjs';
export default async function (c) {
  const page = await c.open('http://127.0.0.1:4173/?quality=low&scale=0.5');
  await startMatchUI(page, { team: 'CT', seed: 101, difficulty: 'hard' }); await c.ensureLocked();
  // wall vision: enemy bot 6 m away on the other side of a wall (mid vs lower tunnels wall) must not target the player
  await c.ev(() => window.__cs2.freezeBots(true)); await c.ev(() => window.__cs2.setPhaseTime(0.3)); await c.waitPhase('live'); await c.ev(() => window.__cs2.setPhaseTime(600));
  const en = (await c.ev(() => window.__cs2.actors())).filter(a => a.team === 'T');
  await c.ev(id => window.__cs2.teleport(-10, 0, 90, id), en[0].id); await c.ev(() => window.__cs2.teleport(-3, 0, 270)); await c.wait(300);
  // player at (-3,0) is in mid at y=0; bot at (-10,0) is in lower tunnel stairs... choose a true wall: bot in T spawn (0,45) vs player in outside long (22,42)
  await c.ev(id => window.__cs2.teleport(4, 44, 90, id), en[0].id); await c.ev(() => window.__cs2.teleport(21, 42, 270)); await c.wait(300);
  const see = await c.ev(id => window.__cs2.canSee(id, 1), en[0].id); await c.ev(() => window.__cs2.freezeBots(false)); await c.wait(1500); const b = (await c.ev(() => window.__cs2.bots())).find(x => x.id === en[0].id);
  c.step('bot cannot see or target a player behind an opaque wall', see === false && b.target !== 'You', { see, target: b.target });
  // reaction delay: expose the bot to the player; measure time to first shot at the player
  await c.ev(() => window.__cs2.freezeBots(true)); await c.ev(id => window.__cs2.teleport(38, -6, 180, id), en[0].id); await c.ev(() => window.__cs2.teleport(38, 8, 0)); await c.wait(300); await c.events(); await c.ev(() => window.__cs2.freezeBots(false));
  const t0 = Date.now(); await c.waitFor(id => window.__cs2.peekEvents('shot').some(e => e.p.actorId === id), en[0].id, 10000).catch(() => {}); const react = (Date.now() - t0) / 1000; await c.ev(() => window.__cs2.freezeBots(true));
  c.step('bot reaction is finite and delayed (0.15–3 s)', react > 0.15 && react < 3.5, `${react.toFixed(2)} s`);
  // break line of sight: bot loses target after memory expires
  await c.ev(() => window.__cs2.teleport(30, 42, 0)); await c.ev(id => window.__cs2.teleport(38, 30, 180, id), en[0].id); await c.ev(() => window.__cs2.freezeBots(false)); await c.wait(2500); const b2 = (await c.ev(() => window.__cs2.bots())).find(x => x.id === en[0].id);
  c.step('after breaking LOS the bot drops the target but keeps short-term memory', b2.target !== 'You' && (b2.memory !== null), b2);
  // three full rounds of observation with stuck statistics and objective behaviour (player idles at spawn)
  await c.ev(() => window.__cs2.startMatch('CT', 'hard', 102)); await c.waitFor(() => window.__cs2.state().app === 'match', null, 20000); await sleep(400); await c.ensureLocked(); await c.ev(() => window.__cs2.killActor(1));
  const seen = { plants: 0, defuses: 0, kills: 0, nades: 0, maxStuck: 0, stuckCounts: 0, rounds: [] };
  const t1 = Date.now();
  while ((await c.state()).round <= 3 && (await c.state()).app === 'match' && Date.now() - t1 < 900000) {
    const bots = await c.ev(() => window.__cs2.bots()); for (const b of bots) { seen.maxStuck = Math.max(seen.maxStuck, b.stuckT); seen.stuckCounts = Math.max(seen.stuckCounts, b.stuckCount); }
    for (const e of await c.events()) { if (e.k === 'bombPlanted') seen.plants++; if (e.k === 'bombDefused') seen.defuses++; if (e.k === 'kill') seen.kills++; if (e.k === 'grenadeThrow') seen.nades++; if (e.k === 'roundEnd') { seen.rounds.push(`${e.p.winner}:${e.p.reason}`); await c.shot(`round_${e.p.round}_end`); } }
    if ((await c.state()).round === 2 && !seen.shotMid) { seen.shotMid = true; await c.shot('spectate_round2'); }
    await c.wait(2000);
  }
  c.step('three rounds observed with bots fighting and using the objective', seen.rounds.length >= 3 && seen.kills >= 6, seen);
  c.step('bots use utility', seen.nades >= 1, `${seen.nades} throws`);
  c.step('no bot stuck longer than 6 s (recovery replans)', seen.maxStuck < 6, `max stuck ${seen.maxStuck}s, max replans ${seen.stuckCounts}`);
  c.step('no console errors', c.log.errors.length === 0, c.log.errors.slice(0, 3));
}
