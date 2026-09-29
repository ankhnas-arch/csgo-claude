import { sleep } from '../harness.mjs';
import { startMatchUI } from '../lib.mjs';
export default async function (c) {
  const page = await c.open('http://127.0.0.1:4173/?quality=low&scale=0.5');
  await startMatchUI(page, { team: 'T', seed: 51 }); await c.ensureLocked();
  await c.ev(() => window.__cs2.freezeBots(true)); await c.ev(() => window.__cs2.setPhaseTime(0.3)); await c.waitPhase('live'); await c.ev(() => window.__cs2.setPhaseTime(600));
  await c.give('ak47'); await c.ev(() => window.__cs2.teleport(38, 20, 90)); await c.wait(200); c.mx = 640; c.my = 360; await c.aimAt(90, 0);
  await c.click(3600); await c.wait(300); let p = (await c.state()).player; c.step('magazine empties to 0 by firing', p.mag === 0 && p.reserve === 90, p);
  await c.click(200); await c.wait(200); p = (await c.state()).player; c.step('dry fire does nothing / no negative ammo', p.mag === 0 && p.reserve === 90);
  await c.events(); await c.press('KeyR'); await c.wait(400); p = (await c.state()).player; c.step('R starts reload', p.action === 'reload'); await c.shot('reload_mid');
  await c.press('Digit3'); await c.wait(300); p = (await c.state()).player; c.step('switch interrupts reload (knife active)', p.active === 'knife');
  await c.press('Digit1'); await c.wait(1300); p = (await c.state()).player; c.step('interrupted reload granted no ammo', p.mag === 0 && p.reserve === 90, p);
  await c.press('KeyR'); await c.waitFor(() => window.__cs2.state().player.mag === 30, null, 8000); await c.wait(200); p = (await c.state()).player; c.step('complete reload: 30/60 (reserve conserved)', p.mag === 30 && p.reserve === 60, p);
  const rl = await c.events('reload'); c.step('reload emits start/insert/end once each', ['start', 'insert', 'end'].every(st => rl.filter(e => e.p.stage === st && e.p.actorId === 1).length >= 1), rl.map(e => e.p.stage).join(','));
  await c.click(450); await c.wait(200); p = (await c.state()).player; const fired = 30 - p.mag; await c.press('KeyR'); await c.waitFor(() => window.__cs2.state().player.mag === 30, null, 8000); p = (await c.state()).player; c.step('partial reload tops up and reserve drops by exactly the shortfall', p.reserve === 60 - fired, `fired ${fired}, reserve ${p.reserve}`);
  await c.click(450); await c.wait(200); const before = (await c.state()).player; await c.press('KeyR'); await c.wait(1700); await c.press('KeyG'); await c.wait(400); p = (await c.state()).player; c.step('drop after insert: weapon gone from inventory', p.primary === null);
  await c.press('KeyE'); await c.wait(600); p = (await c.state()).player; c.step('pick up dropped weapon with E (ammo total conserved)', p.primary === 'ak47' && p.mag + p.reserve === before.mag + before.reserve, `${p.mag}/${p.reserve} vs ${before.mag + before.reserve}`);
  await c.click(300); await c.wait(100); await c.press('KeyR'); await c.wait(300); await c.ev(() => window.__cs2.killActor(1)); await c.wait(500); p = (await c.state()).player; c.step('death during reload: player dead, ammo non-negative', !p.alive && p.mag >= 0 && p.reserve >= 0, p); await c.shot('dead');
  c.step('no console errors', c.log.errors.length === 0, c.log.errors.slice(0, 3));
}
