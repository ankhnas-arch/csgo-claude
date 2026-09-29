import { sleep } from '../harness.mjs';
import { startMatchUI } from '../lib.mjs';
const ROUTES = [
  { name: 'T spawn -> outside long -> long doors', from: [0, 46, 0], pts: [[22, 42], [30.5, 42], [38, 42]] },
  { name: 'Long doors -> long -> pit', from: [38, 42, 0], pts: [[38, 10], [38, -4], [49, -4]] },
  { name: 'Pit -> long corner -> A ramp -> A site', from: [49, -4, 270], pts: [[40, -10], [38, -20], [38, -28], [32, -38]] },
  { name: 'A site -> short -> catwalk -> mid', from: [32, -38, 180], pts: [[26, -26], [19, -22], [19, -14], [12, -15], [4, -15], [0, 0]] },
  { name: 'Mid -> mid doors -> CT mid -> CT spawn', from: [0, 0, 0], pts: [[0, -27], [0, -34], [3, -46]] },
  { name: 'CT spawn -> CT ramp -> A site', from: [3, -46, 90], pts: [[15, -42], [21, -42], [30, -40]] },
  { name: 'CT spawn -> B doors -> B site -> B platform (jump ledge)', from: [3, -46, 270], pts: [[-10, -43], [-24, -43], [-32, -34], [-36.5, -44], [-40, -44]] },
  { name: 'B site -> arch -> upper tunnels -> lower tunnels -> mid', from: [-36, -34, 180], pts: [[-36, -23], [-36, -8], [-36, 0], [-30, 0], [-20, 0], [-10, 0], [-4, 0]] },
  { name: 'T spawn -> outside tunnels -> upper tunnels -> B', from: [0, 46, 270], pts: [[-14, 44], [-24, 40], [-36, 33], [-36, 10], [-36, -23], [-36, -34]] },
  { name: 'Reverse: B -> B doors -> CT spawn', from: [-36, -34, 90], pts: [[-26, -43], [-12, -43], [0, -46]] },
  { name: 'Reverse: A -> A ramp -> long -> long doors -> T spawn', from: [32, -38, 180], pts: [[38, -26], [38, -14], [38, 30], [38, 42], [30, 42], [15, 42], [0, 46]] },
];
export default async function (c) {
  const page = await c.open('http://127.0.0.1:4173/?quality=low&scale=0.5');
  await startMatchUI(page, { team: 'T', seed: 21 }); await c.ensureLocked();
  await c.ev(() => window.__cs2.freezeBots(true)); await c.ev(() => window.__cs2.setPhaseTime(0.5)); await c.waitPhase('live'); await c.ev(() => window.__cs2.setPhaseTime(600));
  const log = [];
  for (const r of ROUTES) {
    await c.ev(([x, z, yaw]) => window.__cs2.teleport(x, z, yaw), r.from); await sleep(300); c.mx = 640; c.my = 360;
    const t0 = Date.now(); let ok = true, stuck = 0;
    for (const [x, z] of r.pts) { const res = await c.walkTo(x, z, { timeout: 30000 }); stuck += res.stuck; if (!res.ok) { ok = false; c.note(`${r.name}: failed to reach (${x},${z}) — at ${JSON.stringify((await c.state()).player).slice(0, 80)}`); break; } }
    const time = (Date.now() - t0) / 1000; const p = (await c.state()).player;
    log.push({ route: r.name, ok, seconds: +time.toFixed(1), stuckEvents: stuck, end: [p.x, p.y, p.z] });
    c.step(r.name, ok, `${time.toFixed(1)} s, stuck events ${stuck}`);
    await c.shot(`route_${log.length}`);
  }
  const walls = [[0, 51.5, 0], [42.5, 20, 90], [-45.5, -40, 270], [7.5, -50, 90]];
  for (const [x, z, yaw] of walls) { await c.ev(([x, z, yaw]) => window.__cs2.teleport(x, z, yaw), [x, z, yaw]); await sleep(200); c.mx = 640; c.my = 360; await c.aimAt(yaw, 0); await c.hold('KeyW', 2000); const p = (await c.state()).player; const inside = Math.abs(p.x) < 56 && Math.abs(p.z) < 58 && p.y > -3; c.step(`boundary press at (${x},${z})`, inside, `end ${p.x.toFixed(1)},${p.y.toFixed(1)},${p.z.toFixed(1)}`); }
  await c.ev(() => window.__cs2.teleport(0, -20, 0)); await sleep(200); c.mx = 640; c.my = 360; await c.aimAt(0, 0);
  const p0 = (await c.state()).player; await page.keyboard.down('ControlLeft'); await sleep(600); const pc = (await c.state()).player; await c.hold('KeyW', 4000); await page.keyboard.up('ControlLeft'); const p1 = (await c.state()).player;
  c.step('crouch lowers eye and crouch-walk through mid doors', pc.crouch && p1.z < p0.z - 2.5, `moved ${(p0.z - p1.z).toFixed(1)} m`); await c.shot('doors_crouch');
  await c.ev(() => window.__cs2.teleport(10, -15, 90)); await sleep(200); c.mx = 640; c.my = 360; const r2 = await c.walkTo(19, -15); c.step('catwalk stairs climb to short (y≈2)', r2.ok && (await c.state()).player.y > 1.6);
  await c.ev(() => window.__cs2.teleport(0, 10, 0)); await sleep(200); const yj0 = (await c.state()).player.y; await c.press('Space'); await sleep(320); const yj1 = (await c.state()).player.y; await sleep(1200); c.step('jump rises and lands', yj1 > yj0 + 0.4 && Math.abs((await c.state()).player.y - yj0) < 0.2, `peak sample +${(yj1 - yj0).toFixed(2)}`);
  await c.ev(() => window.__cs2.teleport(0, 4.4, 0)); await sleep(200); c.mx = 640; c.my = 360; await c.aimAt(0, 0); await page.keyboard.down('KeyW'); await sleep(150); await c.press('Space'); await sleep(900); await page.keyboard.up('KeyW'); const yc = (await c.state()).player.y; c.step('jump onto Xbox crate', yc > 1.3, `y=${yc.toFixed(2)}`); await c.shot('xbox_top');
  c.note(`routes: ${JSON.stringify(log)}`);
  c.step('no console errors', c.log.errors.length === 0, c.log.errors.slice(0, 3));
}
