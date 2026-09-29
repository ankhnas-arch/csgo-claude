import { sleep } from '../harness.mjs';
import { startMatchUI } from '../lib.mjs';
/** ≥15 minutes of repeated rounds/replays with the player spectating; compares live counts and memory at equivalent reset points (freeze start). */
export default async function (c) {
  const page = await c.open('http://127.0.0.1:4173/?quality=low&scale=0.5');
  await startMatchUI(page, { team: 'T', seed: 121, difficulty: 'hard' }); await c.ensureLocked();
  const samples = []; const t0 = Date.now(); let lastRound = -1; let replays = 0;
  while (Date.now() - t0 < 16 * 60 * 1000) {
    const s = await c.state();
    if (s.app === 'matchEnd') { await page.click('#matchres [data-q="replay"]'); await c.waitFor(() => window.__cs2.state().app === 'match', null, 20000); replays++; await sleep(300); await c.ensureLocked(); continue; }
    if (s.phase === 'freeze' && s.round !== lastRound) { lastRound = s.round; const p = await c.ev(() => window.__cs2.perf()); samples.push({ minute: +((Date.now() - t0) / 60000).toFixed(1), round: s.round, replays, rigs: p.rigs, items: p.items, grenadeMeshes: p.grenadeMeshes, sim: p.sim, effects: p.effects, geometries: p.rendererInfo.geometries, textures: p.rendererInfo.textures, heapMB: p.memory ? +(p.memory.usedJSHeap / 1048576).toFixed(1) : null, simLoops: p.simLoops, audioVoices: p.audioVoices }); if (samples.length % 3 === 0) await c.shot(`endurance_r${s.round}_rp${replays}`); }
    // occasionally make the player fight a little (input) then die/spectate naturally
    if (s.phase === 'live' && s.player.alive && Math.random() < 0.2) { await c.hold('KeyW', 500); await c.click(200); }
    await sleep(1500);
  }
  c.note(JSON.stringify(samples));
  const first = samples[1], last = samples[samples.length - 1];
  c.step('ran ≥15 minutes across rounds and replays', (Date.now() - t0) >= 15 * 60 * 1000 && replays >= 1, `replays ${replays}, rounds sampled ${samples.length}`);
  c.step('actor/effect/listener counts stable at reset points', !!first && !!last && last.rigs === first.rigs && last.sim.grenades === 0 && last.effects.smokeClouds === 0 && last.effects.fireClouds === 0 && last.geometries <= first.geometries + 40, { first, last });
  c.step('no duplicate simulation loops (sim time advances ≤ 1.2× real)', samples.length > 2 && ((last.simLoops - first.simLoops) / 64) <= (last.minute - first.minute) * 60 * 1.2, `sim ${((last.simLoops - first.simLoops) / 64).toFixed(0)} s over ${((last.minute - first.minute) * 60).toFixed(0)} s real`);
  if (first?.heapMB && last?.heapMB) c.step('JS heap growth bounded (< 2× or < +80 MB)', last.heapMB < first.heapMB * 2 || last.heapMB - first.heapMB < 80, `${first.heapMB} MB -> ${last.heapMB} MB`);
  c.step('no console errors', c.log.errors.length === 0, c.log.errors.slice(0, 3));
}
