import { sleep } from '../harness.mjs';
import { startMatchUI } from '../lib.mjs';
async function setup(c, team, seed) {
  const page = await c.open('http://127.0.0.1:4173/?quality=low&scale=0.5');
  await startMatchUI(page, { team, seed }); await c.ensureLocked();
  await c.ev(() => window.__cs2.freezeBots(true)); await c.ev(() => window.__cs2.setPhaseTime(0.3)); await c.waitPhase('live'); await c.ev(() => window.__cs2.setPhaseTime(600));
  return page;
}
async function throwAt(c, kind, x, y, z, pitchBias = 8) { await c.give(kind); await c.aimAtPoint(x, y, z); await c.turn(0, pitchBias); await sleep(150); await c.events(); await c.click(60); }
export default async function (c) {
  await setup(c, 'T', 71);
  const enemies = (await c.ev(() => window.__cs2.actors())).filter(a => a.team === 'CT');
  // ---- HE: near, far, behind cover (long corridor x=38)
  await c.ev(id => window.__cs2.teleport(38, 0, 180, id), enemies[0].id); await c.ev(id => window.__cs2.teleport(38, -12, 180, id), enemies[1].id); await c.ev(id => window.__cs2.teleport(0, -2.2, 180, id), enemies[2].id);
  await c.ev(() => window.__cs2.teleport(38, 8, 0)); await sleep(300); c.mx = 640; c.my = 360;
  await throwAt(c, 'he', 38, 0.3, 0.5, 20); await sleep(2500);
  const bounces = (await c.events('grenadeBounce')).length; const det = await c.events('grenadeDetonate'); const hurt = await c.events('hurt');
  const near = hurt.find(h => h.p.actorId === enemies[0].id)?.p.damage ?? 0, far = hurt.find(h => h.p.actorId === enemies[1].id)?.p.damage ?? 0;
  c.step('HE thrown on an arc, bounced, detonated once', det.length === 1 && det[0].p.kind === 'he', `bounces ${bounces}, detonations ${det.length}`);
  c.step('HE blast: near target damaged more than far target (falloff)', near > 0 && (far === 0 || far < near), `near ${near} far ${far}`);
  c.step('HE consumed (single use)', (await c.state()).player.grenades.length === 0); await c.shot('he');
  // cover: enemy behind Xbox crate, grenade lands in front of the crate
  await c.ev(() => window.__cs2.teleport(0, 8, 0)); await sleep(300); c.mx = 640; c.my = 360;
  await throwAt(c, 'he', 0, 0.2, 4.2, 12); await sleep(2800); const hc = (await c.events('hurt')).find(h => h.p.actorId === enemies[2].id)?.p.damage ?? 0;
  c.step('HE behind solid cover: damage attenuated (< near damage)', hc < near, `cover ${hc} vs open ${near}`);
  // ---- Flash: look toward vs away; reduced intensity setting
  await c.ev(() => window.__cs2.teleport(38, 10, 0)); await sleep(300); c.mx = 640; c.my = 360;
  await c.ev(k => window.__cs2.giveWeapon(k), 'flash'); await sleep(800); await c.aimAt(0, 25); await c.events(); await c.click(60); await sleep(2200);
  const f1 = (await c.events('flashed')).find(e => e.p.actorId === 1); const st1 = (await c.state()).player; await c.shot('flash_facing');
  c.step('flash while facing: long blind, overlay visible', !!f1 && f1.p.duration > 2 && st1.flash > 0.3, f1?.p);
  await c.waitFor(() => window.__cs2.state().player.flash === 0, null, 15000);
  await c.ev(k => window.__cs2.giveWeapon(k), 'flash'); await sleep(800); await c.aimAt(0, 25); await c.events(); await c.click(60); await sleep(500); await c.turn(180, -25); await sleep(1800);
  const f2 = (await c.events('flashed')).find(e => e.p.actorId === 1); c.step('flash while turned away: much shorter', !!f2 && f2.p.duration < f1.p.duration * 0.6, `${f2?.p.duration?.toFixed(2)} vs ${f1?.p.duration?.toFixed(2)}`);
  await c.waitFor(() => window.__cs2.state().player.flash === 0, null, 15000);
  // occlusion: throw flash behind the wall (into long doors from outside)
  await c.ev(() => window.__cs2.teleport(38, 30, 180)); await sleep(300); c.mx = 640; c.my = 360; await c.ev(k => window.__cs2.giveWeapon(k), 'flash'); await sleep(800); await c.aimAt(90, 30); await c.events(); await c.click(60); await sleep(2200);
  const f3 = (await c.events('flashed')).find(e => e.p.actorId === 1); c.step('flash behind cover: heavily attenuated or none', !f3 || f3.p.duration < 1.0, f3?.p ?? 'none');
  await c.page.evaluate(() => { const s = window.__cs2.settings(); s.reducedFlash = true; window.__cs2.app.applySettings(s); });
  await c.ev(() => window.__cs2.teleport(38, 10, 0)); await sleep(300); c.mx = 640; c.my = 360; await c.ev(k => window.__cs2.giveWeapon(k), 'flash'); await sleep(800); await c.aimAt(0, 25); await c.click(60); await sleep(2200); await c.shot('flash_reduced');
  const op = await c.page.evaluate(() => parseFloat(document.querySelector('#hud .flash').style.opacity)); c.step('reduced-intensity option lowers overlay opacity', op < 0.9, `opacity ${op}`);
  await c.waitFor(() => window.__cs2.state().player.flash === 0, null, 15000);
  // bots react: flashed bot cannot see
  await c.ev(id => window.__cs2.teleport(38, -6, 180, id), enemies[3].id); await c.ev(() => window.__cs2.teleport(38, 8, 0)); await sleep(300); c.mx = 640; c.my = 360;
  const seeBefore = await c.ev(id => window.__cs2.canSee(id, 1), enemies[3].id);
  await c.ev(k => window.__cs2.giveWeapon(k), 'flash'); await sleep(800); await c.aimAtPoint(38, 1.4, -4); await c.turn(0, 6); await c.events(); await c.click(60); await sleep(1900);
  const fb = (await c.events('flashed')).find(e => e.p.actorId === enemies[3].id); const seeAfter = await c.ev(id => window.__cs2.canSee(id, 1), enemies[3].id);
  c.step('bot in front is flashed and loses perception', seeBefore === true && !!fb && seeAfter === false, { seeBefore, seeAfter, dur: fb?.p.duration });
  // ---- Smoke: choke (long doors); sightline blocked both ways; walk through; expiry cleanup
  await c.ev(id => window.__cs2.teleport(38, 44, 90, id), enemies[4].id); await c.ev(() => window.__cs2.teleport(22, 42, 90)); await sleep(300); c.mx = 640; c.my = 360;
  const s0 = await c.ev(id => window.__cs2.canSee(1, id), enemies[4].id);
  await throwAt(c, 'smoke', 30.5, 0.2, 42, 14); await c.waitFor(() => window.__cs2.peekEvents('grenadeDetonate').length > 0, null, 12000); await sleep(1800); await c.shot('smoke_outside');
  const s1 = await c.ev(id => window.__cs2.canSee(1, id), enemies[4].id); const s1b = await c.ev(id => window.__cs2.canSee(id, 1), enemies[4].id);
  c.step('smoke blocks the doorway sightline both ways', s0 === true && s1 === false && s1b === false, { before: s0, after: s1, reverse: s1b });
  const sm = await c.ev(() => window.__cs2.perf()); c.step('smoke volume exists (no global fog)', sm.sim.smokes === 1 && sm.effects.smokeClouds === 1, sm.effects);
  await c.walkTo(30.5, 42, { timeout: 15000 }); await c.shot('smoke_inside'); await c.walkTo(36, 42, { timeout: 15000 }); c.step('walked through the smoke to the other side', (await c.state()).player.x > 34);
  await c.waitFor(() => window.__cs2.perf().sim.smokes === 0, null, 30000); await sleep(500); const sm2 = await c.ev(() => window.__cs2.perf());
  c.step('smoke expires (~18 s) and cleans up sprites', sm2.sim.smokes === 0 && sm2.effects.smokeClouds === 0, sm2.effects); await c.shot('smoke_gone');
  c.step('sightline restored after expiry', (await c.ev(id => window.__cs2.canSee(1, id), enemies[4].id)) === true);
  // ---- Fire (molotov): ground fire, step in/out damage, bot reaction, expiry
  await c.ev(() => window.__cs2.freezeBots(false)); await c.ev(() => window.__cs2.freezeBots(true));
  await c.ev(() => window.__cs2.teleport(38, 20, 0)); await sleep(300); c.mx = 640; c.my = 360;
  await throwAt(c, 'molotov', 38, 0.1, 12, 10); await c.waitFor(() => window.__cs2.perf().sim.fires > 0, null, 8000); await sleep(1200); await c.shot('fire_ground');
  const hp0 = (await c.state()).player.health; await c.walkTo(38, 12, { timeout: 8000, tol: 0.8 }); await sleep(900); const hp1 = (await c.state()).player.health; await c.walkTo(38, 20, { timeout: 8000 }); await sleep(800); const hp2 = (await c.state()).player.health;
  c.step('standing in fire takes periodic damage; leaving stops it', hp1 < hp0 && hp2 <= hp1 && hp2 >= hp1 - 8, `hp ${hp0} -> ${hp1} -> ${hp2}`); await c.shot('fire_burn');
  await c.ev(() => window.__cs2.freezeBots(false)); await c.ev(id => window.__cs2.teleport(38, 4, 0, id), enemies[0].id); await c.ev(id => window.__cs2.killActor(id), enemies[1].id);
  await sleep(2500); const botPos = (await c.ev(() => window.__cs2.actors())).find(a => a.id === enemies[0].id); const dFire = Math.hypot(botPos.x - 38, botPos.z - 12);
  c.step('bot near fire moves away (does not stand in it)', dFire > 3.0 || !botPos.alive, `bot at (${botPos.x},${botPos.z}) alive=${botPos.alive}`);
  await c.waitFor(() => window.__cs2.perf().sim.fires === 0, null, 15000); const pf = await c.ev(() => window.__cs2.perf()); c.step('fire expires (~7 s) and cleans up', pf.sim.fires === 0 && pf.effects.fireClouds === 0, pf.effects);
  c.step('no console errors', c.log.errors.length === 0, c.log.errors.slice(0, 3));
}
