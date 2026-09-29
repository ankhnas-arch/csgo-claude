import { sleep } from '../harness.mjs';
import { startMatchUI } from '../lib.mjs';
export default async function (c) {
  const page = await c.open('http://127.0.0.1:4173/?quality=low&scale=0.5');
  await startMatchUI(page, { team: 'T', seed: 111, difficulty: 'hard' }); await c.ensureLocked();
  await c.ev(() => window.__cs2.setPhaseTime(0.3)); await c.waitPhase('live'); await c.ev(() => window.__cs2.setPhaseTime(600));
  // bring the fight to A site: teleport everyone near A, player included, with smoke + fire + HE
  await c.ev(() => { const g = window.__cs2.game; g.actors.forEach((a, i) => { if (a !== g.player) window.__cs2.teleport(26 + (i % 5) * 3, -30 - Math.floor(i / 5) * 8, 0, a.id); }); }); await c.ev(() => window.__cs2.teleport(38, -14, 0)); await sleep(300); c.mx = 640; c.my = 360;
  for (const k of ['smoke', 'molotov', 'he']) { await c.ev(k => window.__cs2.giveWeapon(k), k); await sleep(600); await c.aimAtPoint(32, 2, -36); await c.turn(0, 10); await c.click(60); await sleep(400); }
  await c.ev(() => window.__cs2.giveWeapon('ak47')); await sleep(1000); await c.ev(() => window.__cs2.perfReset());
  const t0 = Date.now(); let n = 0; const counts = [];
  while (Date.now() - t0 < 60000) { await c.aimAtPoint(32 + Math.sin(n) * 4, 2.8, -36); await c.click(250); await sleep(200); if (n % 10 === 0) { const p = await c.ev(() => window.__cs2.perf()); counts.push({ t: Math.round((Date.now() - t0) / 1000), timed: p.effects.timed, smokes: p.sim.smokes, fires: p.sim.fires, voices: p.audioVoices }); if (n % 20 === 0) await c.shot(`combat_${n}`); } if ((await c.state()).player.mag === 0) await c.press('KeyR'); n++; }
  const p = await c.ev(() => window.__cs2.perf());
  c.note(`60 s combat sample: cpu median ${p.cpuMedianMs.toFixed(1)} ms, cpu p95 ${p.cpuP95Ms.toFixed(1)} ms, fps ${p.fps.toFixed(1)} (software GL), draw calls ${p.drawCalls}, triangles ${p.triangles}`);
  c.note(`effect counts over time: ${JSON.stringify(counts)}`);
  c.step('frame CPU time measured (median/p95 recorded)', p.cpuMedianMs > 0 && p.samples > 50, { med: p.cpuMedianMs, p95: p.cpuP95Ms });
  c.step('effects bounded (pooled: timed effects < 400, audio voices < 40)', Math.max(...counts.map(x => x.timed)) < 400 && Math.max(...counts.map(x => x.voices)) <= 40);
  c.step('no console errors', c.log.errors.length === 0, c.log.errors.slice(0, 3));
}
