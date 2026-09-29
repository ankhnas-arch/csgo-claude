import { sleep } from '../harness.mjs';
import { startMatchUI } from '../lib.mjs';
export default async function (c) {
  const page = await c.open('http://127.0.0.1:4173/?quality=low&scale=0.5');
  await startMatchUI(page, { team: 'T', seed: 81 }); await c.ensureLocked();
  await c.ev(() => window.__cs2.freezeBots(true)); await c.ev(() => window.__cs2.setPhaseTime(0.3)); await c.waitPhase('live'); await c.ev(() => window.__cs2.setPhaseTime(600));
  await c.ev(() => window.__cs2.giveBombToPlayer()); await sleep(300);
  // outside site
  await c.ev(() => window.__cs2.teleport(38, 0, 0)); await sleep(300); await c.hold('KeyE', 1500); c.step('plant outside a site does nothing', !(await c.state()).bomb.planted && (await c.state()).player.plant === 0);
  // inside A: hold/release resets, then complete
  await c.ev(() => window.__cs2.teleport(32, -38, 0)); await sleep(300); await c.events(); await page.keyboard.down('KeyE'); await sleep(1500); const mid = (await c.state()).player; await page.keyboard.up('KeyE'); await sleep(400); const rel = (await c.state()).player;
  c.step('hold E at A shows progress (~0.45 after 1.5 s) and switches to C4', mid.plant > 0.25 && mid.plant < 0.7 && mid.active === 'c4', `progress ${mid.plant}`); await c.shot('plant_progress');
  c.step('release cancels progress', rel.plant === 0 && !(await c.state()).bomb.planted);
  await page.keyboard.down('KeyE'); await sleep(900); await c.ev(() => window.__cs2.teleport(38, 0, 0)); await sleep(500); const left = (await c.state()).player; await page.keyboard.up('KeyE');
  c.step('leaving the site cancels the plant', left.plant === 0 && !(await c.state()).bomb.planted);
  await c.ev(() => window.__cs2.teleport(32, -38, 0)); await sleep(300); await page.keyboard.down('KeyE'); await sleep(1200); await c.press('Digit3'); await sleep(300); const sw = (await c.state()).player; await page.keyboard.up('KeyE');
  c.step('switching weapon cancels the plant', sw.plant === 0 || sw.active === 'c4', `plant ${sw.plant} active ${sw.active}`);
  await sleep(300); await page.keyboard.down('KeyE'); const t0 = Date.now(); await c.waitFor(() => window.__cs2.state().phase === 'planted', null, 8000); const dt = (Date.now() - t0) / 1000; await page.keyboard.up('KeyE');
  const st = await c.state(); c.step('plant completes in ≈3.2 s, phase = planted at site A', st.phase === 'planted' && st.bomb.planted.site === 'A' && dt > 2.5 && dt < 6, `${dt.toFixed(1)} s`); await c.shot('planted');
  c.step('player no longer carries the bomb', !st.player.hasBomb);
  const t1 = st.bomb.planted.timeLeft; await sleep(3000); const t2 = (await c.state()).bomb.planted.timeLeft; c.step('bomb timer counts down', t2 < t1 - 1.5, `${t1.toFixed(1)} -> ${t2.toFixed(1)}`);
  // die during a plant attempt: bomb dropped and retrievable (new round via fixture)
  await c.ev(() => window.__cs2.startMatch('T', 'easy', 82)); await c.waitFor(() => window.__cs2.state().app === 'match', null, 20000); await sleep(400); await c.ensureLocked(); await c.ev(() => window.__cs2.freezeBots(true)); await c.ev(() => window.__cs2.setPhaseTime(0.3)); await c.waitPhase('live'); await c.ev(() => window.__cs2.setPhaseTime(600)); await c.ev(() => window.__cs2.giveBombToPlayer());
  await c.ev(() => window.__cs2.teleport(-36, -36, 0)); await sleep(300); await page.keyboard.down('KeyE'); await sleep(1200); await c.ev(() => window.__cs2.killActor(1)); await page.keyboard.up('KeyE'); await sleep(600);
  const sd = await c.state(); c.step('death during plant: not planted, bomb dropped at the spot', !sd.bomb.planted && sd.bomb.dropped && Math.hypot(sd.bomb.dropped.x + 36, sd.bomb.dropped.z + 36) < 2, sd.bomb); await c.shot('bomb_dropped');
  // retrieval by a teammate bot
  await c.ev(() => window.__cs2.freezeBots(false)); await c.waitFor(() => window.__cs2.state().bomb.carrierId !== null, null, 60000); const carrier = (await c.state()).bomb.carrierId; c.step('teammate bot retrieves the dropped bomb', carrier !== null && carrier !== 1, `carrier ${carrier}`);
  // ---- Defuse as CT: without kit, with kit, too late
  await c.ev(() => window.__cs2.startMatch('CT', 'easy', 83)); await c.waitFor(() => window.__cs2.state().app === 'match', null, 20000); await sleep(400); await c.ensureLocked(); await c.ev(() => window.__cs2.freezeBots(true)); await c.ev(() => window.__cs2.setPhaseTime(0.3)); await c.waitPhase('live'); await c.ev(() => window.__cs2.setPhaseTime(600));
  // make an enemy plant instantly via fixture: give bomb to enemy, teleport into B, let one bot act
  const tbot = (await c.ev(() => window.__cs2.actors())).find(a => a.team === 'T');
  await c.ev(id => { const g = window.__cs2.game; const a = g.actorById(id); g.match.giveBomb(a); window.__cs2.teleport(-36, -36, 0, id); g.botsFrozen = false; for (const b of g.brains.values()) if (b.a.id !== id) b.a.alive && (b.frozenStub = true); }, tbot.id);
  await c.waitFor(() => window.__cs2.state().phase === 'planted', null, 60000); await c.ev(() => window.__cs2.freezeBots(true)); await c.ev(() => window.__cs2.setBombTime(60));
  const b = (await c.state()).bomb.planted; await c.ev(([x, z]) => window.__cs2.teleport(x, z + 1.0, 0), [b.x, b.z]); await sleep(300); c.mx = 640; c.my = 360; await c.aimAtPoint(b.x, b.y, b.z);
  await page.keyboard.down('KeyE'); await sleep(2000); const d1 = (await c.state()).player; await page.keyboard.up('KeyE'); await sleep(400); const d2 = (await c.state()).player;
  c.step('defuse without kit: ~0.2 after 2 s; release resets', d1.defuse > 0.12 && d1.defuse < 0.3 && d2.defuse === 0, `${d1.defuse} -> ${d2.defuse}`); await c.shot('defuse_progress');
  await page.keyboard.down('KeyE'); const t3 = Date.now(); await c.waitFor(() => window.__cs2.state().bomb.defused === true, null, 20000); const dd = (Date.now() - t3) / 1000; await page.keyboard.up('KeyE');
  const sdef = await c.state(); c.step('defuse without kit completes in ≈10 s and CT wins by defuse', sdef.bomb.defused && dd > 8 && dd < 14 && sdef.phase === 'roundEnd', `${dd.toFixed(1)} s`); await c.shot('defused');
  c.step('exactly one round scored', sdef.score.CT.score === 1 && sdef.score.T.score === 0, sdef.score);
  // with kit + too late
  await c.ev(() => window.__cs2.startMatch('CT', 'easy', 84)); await c.waitFor(() => window.__cs2.state().app === 'match', null, 20000); await sleep(400); await c.ensureLocked(); await c.ev(() => window.__cs2.freezeBots(true)); await c.ev(() => window.__cs2.giveMoney(5000)); await c.openBuy(); await c.buyItem('defuser'); await c.closeBuy(); await c.ev(() => window.__cs2.setPhaseTime(0.3)); await c.waitPhase('live'); await c.ev(() => window.__cs2.setPhaseTime(600));
  const tbot2 = (await c.ev(() => window.__cs2.actors())).find(a => a.team === 'T');
  await c.ev(id => { const g = window.__cs2.game; g.match.giveBomb(g.actorById(id)); window.__cs2.teleport(31, -38, 0, id); g.botsFrozen = false; }, tbot2.id);
  await c.waitFor(() => window.__cs2.state().phase === 'planted', null, 60000); await c.ev(() => window.__cs2.freezeBots(true)); await c.ev(() => window.__cs2.setBombTime(60));
  const b2 = (await c.state()).bomb.planted; await c.ev(([x, z]) => window.__cs2.teleport(x, z + 1.0, 0), [b2.x, b2.z]); await sleep(300); c.mx = 640; c.my = 360; await c.aimAtPoint(b2.x, b2.y, b2.z);
  await page.keyboard.down('KeyE'); const t4 = Date.now(); await c.waitFor(() => window.__cs2.state().bomb.defused === true, null, 15000); const dk = (Date.now() - t4) / 1000; await page.keyboard.up('KeyE');
  c.step('defuse with kit completes in ≈5 s', dk > 3.5 && dk < 8, `${dk.toFixed(1)} s`);
  await c.ev(() => window.__cs2.startMatch('CT', 'easy', 85)); await c.waitFor(() => window.__cs2.state().app === 'match', null, 20000); await sleep(400); await c.ensureLocked(); await c.ev(() => window.__cs2.freezeBots(true)); await c.ev(() => window.__cs2.setPhaseTime(0.3)); await c.waitPhase('live'); await c.ev(() => window.__cs2.setPhaseTime(600));
  const tbot3 = (await c.ev(() => window.__cs2.actors())).find(a => a.team === 'T');
  await c.ev(id => { const g = window.__cs2.game; g.match.giveBomb(g.actorById(id)); window.__cs2.teleport(31, -38, 0, id); g.botsFrozen = false; }, tbot3.id);
  await c.waitFor(() => window.__cs2.state().phase === 'planted', null, 60000); await c.ev(() => window.__cs2.freezeBots(true)); await c.ev(() => window.__cs2.setBombTime(4));
  const b3 = (await c.state()).bomb.planted; await c.ev(([x, z]) => window.__cs2.teleport(x, z + 1.0, 0), [b3.x, b3.z]); await sleep(300); c.mx = 640; c.my = 360; await c.aimAtPoint(b3.x, b3.y, b3.z);
  await page.keyboard.down('KeyE'); await c.waitFor(() => window.__cs2.state().phase === 'roundEnd', null, 15000); await page.keyboard.up('KeyE'); const late = await c.state(); await c.shot('explosion');
  c.step('starting the defuse too late: bomb explodes, T wins, no double score', late.bomb.exploded && !late.bomb.defused && late.score.T.score === 1 && late.score.CT.score === 0, late.score);
  c.step('no console errors', c.log.errors.length === 0, c.log.errors.slice(0, 3));
}
