import fs from 'node:fs';
import { launch, sleep, st, writeJson } from './lib.mjs';
export { sleep, st, writeJson };
/** Case context: real-input helpers + evidence recording. */
export class Ctx {
  constructor(name, outRoot, opts = {}) { this.name = name; this.out = `${outRoot}/${name}`; fs.mkdirSync(this.out, { recursive: true }); this.steps = []; this.shots = []; this.opts = opts; this.mx = 640; this.my = 360; this.status = 'PASS'; this.notes = []; }
  async open(url) { const r = await launch({ width: this.opts.width ?? 1280, height: this.opts.height ?? 720, url, video: this.opts.video ? `${this.out}/video` : null }); this.browser = r.browser; this.page = r.page; this.log = r.log; this.mx = (this.opts.width ?? 1280) / 2; this.my = (this.opts.height ?? 720) / 2; return this.page; }
  async close() { writeJson(`${this.out}/console.json`, this.log); writeJson(`${this.out}/steps.json`, { name: this.name, status: this.status, steps: this.steps, notes: this.notes, shots: this.shots, errors: this.log?.errors ?? [] }); await this.browser?.close(); }
  step(name, ok, detail = '') { this.steps.push({ name, ok, detail: typeof detail === 'string' ? detail : JSON.stringify(detail) }); if (!ok) this.status = 'FAIL'; console.log(`  [${ok ? 'ok' : 'FAIL'}] ${this.name}: ${name} ${typeof detail === 'string' ? detail : JSON.stringify(detail).slice(0, 200)}`); return ok; }
  note(s) { this.notes.push(s); console.log(`  note: ${s}`); }
  async shot(label) { const p = `${this.out}/${label}.png`; await this.page.screenshot({ path: p }); this.shots.push(p); return p; }
  state() { return st(this.page); }
  ev(fn, arg) { return this.page.evaluate(fn, arg); }
  events(filter) { return this.page.evaluate(f => window.__cs2.drainEvents(f), filter); }
  async settings() { return this.page.evaluate(() => window.__cs2.settings()); }
  /** Turn by yaw/pitch deltas (degrees) using real mouse movement under pointer lock. */
  async turn(dyawDeg, dpitchDeg = 0) {
    const s = await this.settings(); const p = (await this.state()).player; let scale = 1; if (p && p.zoom > 0) { scale = (p.zoom === 1 ? 40 : 10) / 90 * s.zoomSensitivityRatio; }
    const k = s.sensitivity * 0.022 * scale; const dx = -dyawDeg / k, dy = -dpitchDeg / k;
    const steps = Math.max(2, Math.min(12, Math.ceil((Math.abs(dx) + Math.abs(dy)) / 400)));
    this.mx += dx; this.my += dy; await this.page.mouse.move(this.mx, this.my, { steps }); await sleep(60);
  }
  /** Aim at absolute yaw/pitch (degrees; yaw 0 = north/-z). */
  async aimAt(yawDeg, pitchDeg = 0) { const p = (await this.state()).player; let dy = yawDeg - p.yaw * 180 / Math.PI; dy = ((dy + 540) % 360) - 180; const dp = pitchDeg - p.pitch * 180 / Math.PI; await this.turn(dy, dp); }
  async aimAtPoint(x, y, z) { const p = (await this.state()).player; const dx = x - p.x, dz = z - p.z; const eye = p.y + 1.63; const yaw = Math.atan2(-dx, -dz) * 180 / Math.PI; const pitch = Math.atan2(y - eye, Math.hypot(dx, dz)) * 180 / Math.PI; await this.aimAt(yaw, pitch); }
  async press(key, ms = 160) { await this.page.keyboard.down(key); await sleep(ms); await this.page.keyboard.up(key); }
  async hold(key, ms) { await this.page.keyboard.down(key); await sleep(ms); await this.page.keyboard.up(key); }
  async click(ms = 80, button = 'left') { await this.page.mouse.down({ button }); await sleep(ms); await this.page.mouse.up({ button }); }
  /** Walk to a point with WASD + mouse steering. Returns {ok, time, stuck}. */
  async walkTo(x, z, { timeout = 40000, tol = 1.2, run = true, jumpOnStuck = true } = {}) {
    const t0 = Date.now(); let last = null; let lastMoveT = Date.now(); let stuckEvents = 0; let ok = false;
    await this.page.keyboard.down('KeyW');
    while (Date.now() - t0 < timeout) {
      const s = await this.state(); const p = s.player; if (!p || !p.alive) break;
      const d = Math.hypot(x - p.x, z - p.z); if (d < tol) { ok = true; break; }
      const yaw = Math.atan2(-(x - p.x), -(z - p.z)) * 180 / Math.PI; let dy = yaw - p.yaw * 180 / Math.PI; dy = ((dy + 540) % 360) - 180;
      if (Math.abs(dy) > 4) { if (Math.abs(dy) > 60) await this.page.keyboard.up('KeyW'); await this.turn(dy, -p.pitch * 180 / Math.PI * 0.5); await sleep(260); if (Math.abs(dy) > 60) await this.page.keyboard.down('KeyW'); }
      if (last && Math.hypot(p.x - last.x, p.z - last.z) > 0.15) lastMoveT = Date.now();
      if (Date.now() - lastMoveT > 1200) { stuckEvents++; lastMoveT = Date.now(); if (jumpOnStuck) { await this.press('Space', 80); await this.hold('KeyA', 250); } }
      last = p; await sleep(120); void run;
    }
    await this.page.keyboard.up('KeyW');
    return { ok, time: (Date.now() - t0) / 1000, stuck: stuckEvents };
  }
  async waitPhase(phase, timeout = 120000) { await this.page.waitForFunction(ph => window.__cs2.state().phase === ph, phase, { timeout }); }
  async waitFor(fn, arg, timeout = 60000) { await this.page.waitForFunction(fn, arg, { timeout }); }
  async ensureLocked() { const s = await this.state(); if (!s.locked) { if (await this.page.locator('#resume:not(.hidden)').count()) await this.page.click('#resume .box'); else await this.page.mouse.click(this.mx, this.my); await sleep(400); this.mx = (this.opts.width ?? 1280) / 2; this.my = (this.opts.height ?? 720) / 2; } return (await this.state()).locked; }
  async openBuy() { await this.press('KeyB'); await sleep(400); return (await this.state()).buyOpen; }
  async closeBuy() { await this.press('KeyB'); await sleep(500); await this.ensureLocked(); }
  async buyItem(id) { const before = (await this.state()).player.money; const btn = this.page.locator(`#buy .item[data-item="${id}"]`); if (!(await btn.count())) return { ok: false, reason: 'not listed' }; await btn.click(); await sleep(150); const status = await this.page.locator('#buy [data-q="status"]').textContent(); const after = (await this.state()).player.money; return { ok: after < before, status, cost: before - after }; }
  perf() { return this.page.evaluate(() => window.__cs2.perf()); }
  /** Wait until the active weapon finished its draw/reload/etc. (sim-time dependent; software GL runs slower than real time). */
  async awaitIdle(timeout = 15000) { await this.page.waitForFunction(() => { const p = window.__cs2.state().player; return p && (!p.alive || p.action === 'idle' || p.action === 'inspect'); }, null, { timeout }).catch(() => {}); }
  async give(id) { await this.ev(k => window.__cs2.giveWeapon(k), id); await this.awaitIdle(); }
}
export function summarize(results) { return results.map(r => `| ${r.name} | ${r.status} | ${r.steps.filter(s => s.ok).length}/${r.steps.length} steps | ${r.notes.join('; ')} |`).join('\n'); }
