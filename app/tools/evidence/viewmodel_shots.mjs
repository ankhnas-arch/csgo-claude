import { Ctx, sleep } from './harness.mjs';
import { startMatchUI } from './lib.mjs';
const weapon = process.argv[2] ?? 'ak47'; const out = process.argv[3] ?? 'evidence/dev';
const c = new Ctx(`vm_${weapon}`, out, { width: 1280, height: 720 });
const page = await c.open('http://127.0.0.1:5173/?quality=high&scale=1');
await startMatchUI(page, { team: weapon === 'm4a4' || weapon === 'usp' ? 'CT' : 'T', seed: 3 }); await c.ensureLocked();
await c.ev(() => window.__cs2.freezeBots(true)); await c.ev(() => window.__cs2.setPhaseTime(0.3)); await c.waitPhase('live'); await c.ev(() => window.__cs2.setPhaseTime(600));
await c.ev(() => window.__cs2.teleport(38, 20, 0)); await sleep(300); c.mx = 640; c.my = 360; await c.aimAt(0, 0);
await c.give(weapon); await sleep(300); await c.shot('idle');
console.log('stats', JSON.stringify(await c.ev(() => window.__cs2.weaponStats())));
await page.mouse.down(); await sleep(120); await c.shot('fire'); await page.mouse.up(); await sleep(400);
await c.press('KeyR'); await sleep(700); await c.shot('reload_a'); await sleep(700); await c.shot('reload_b'); await c.awaitIdle();
await c.press('KeyF'); await sleep(900); await c.shot('inspect_a'); await sleep(900); await c.shot('inspect_b'); await c.awaitIdle();
// near a wall, and at other FOVs
await c.ev(() => window.__cs2.teleport(42.2, 20, 90)); await sleep(400); await c.shot('near_wall');
for (const f of [68, 100]) { await page.evaluate(v => { const s = window.__cs2.settings(); s.fov = v; window.__cs2.app.applySettings(s); }, f); await sleep(400); await c.shot(`fov${f}`); }
await page.evaluate(() => { const s = window.__cs2.settings(); s.fov = 90; window.__cs2.app.applySettings(s); });
await c.ev(() => window.__cs2.teleport(38, 20, 0)); await sleep(300); await page.keyboard.down('ControlLeft'); await sleep(500); await c.shot('crouch'); await page.keyboard.up('ControlLeft');
await c.close();
