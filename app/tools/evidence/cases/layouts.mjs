import { sleep } from '../harness.mjs';
import { launch, startMatchUI } from '../lib.mjs';
export default async function (c) {
  for (const [w, h] of [[1920, 1080], [1280, 720], [1024, 768]]) {
    c.opts.width = w; c.opts.height = h;
    const page = await c.open(`http://127.0.0.1:4173/?quality=low&scale=${w > 1400 ? 0.4 : 0.5}`);
    await sleep(800); await c.shot(`menu_${w}x${h}`);
    await startMatchUI(page, { team: 'CT', seed: 131 }); await c.ensureLocked(); await c.ev(() => window.__cs2.freezeBots(true));
    await c.shot(`hud_${w}x${h}`);
    await c.openBuy(); await c.shot(`buy_${w}x${h}`); await c.closeBuy();
    await c.ev(() => window.__cs2.setPhaseTime(0.3)); await c.waitPhase('live'); await c.ev(() => window.__cs2.setPhaseTime(600));
    await c.ev(() => window.__cs2.giveWeapon('awp')); await sleep(1500); const en = (await c.ev(() => window.__cs2.actors())).find(a => a.team === 'T'); await c.ev(id => window.__cs2.teleport(38, 0, 180, id), en.id); await c.ev(() => window.__cs2.teleport(38, 30, 0)); await sleep(300); c.mx = w / 2; c.my = h / 2; await c.aimAtPoint(38, 1.2, 0);
    await c.click(60, 'right'); await sleep(400); await c.shot(`scope1_${w}x${h}`); await c.click(60, 'right'); await sleep(400); await c.shot(`scope2_${w}x${h}`);
    const circ = await page.evaluate(() => { const e = document.querySelector('#hud .scope svg circle'); const r = e.getBoundingClientRect(); return { w: r.width, h: r.height }; });
    c.step(`scope mask circle is round at ${w}x${h}`, Math.abs(circ.w - circ.h) < 2, circ);
    const hit = await c.ev(() => window.__cs2.aimHit()); c.step(`reticle centre agrees with aim ray at ${w}x${h} (hits target)`, hit.actor !== null, hit);
    await c.click(60, 'right'); await sleep(200);
    await page.keyboard.down('Tab'); await sleep(300); await c.shot(`scoreboard_${w}x${h}`); await page.keyboard.up('Tab');
    const clusters = await page.evaluate(() => { const q = s => { const e = document.querySelector(s); if (!e) return null; const r = e.getBoundingClientRect(); return { x: +(r.x / innerWidth * 100).toFixed(1), y: +(r.y / innerHeight * 100).toFixed(1), w: +(r.width / innerWidth * 100).toFixed(1), h: +(r.height / innerHeight * 100).toFixed(1) }; }; return { radar: q('#hud .radar'), top: q('#hud .top'), health: q('#hud .bottom-left'), ammo: q('#hud .bottom-right'), killfeed: q('#hud .killfeed') }; });
    c.note(`${w}x${h} HUD clusters (% of viewport): ${JSON.stringify(clusters)}`);
    c.step(`HUD clusters within viewport at ${w}x${h}`, Object.values(clusters).every(r => r && r.x >= 0 && r.y >= 0 && r.x + r.w <= 100.5 && r.y + r.h <= 100.5), clusters);
    await c.browser.close();
  }
  // touch-only viewport: desktop-controls notice
  const { browser: b2 } = await launch({ width: 800, height: 600, url: 'http://127.0.0.1:4173/?quality=low&scale=0.5' });
  const ctx = await b2.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true }); const p2 = await ctx.newPage(); await p2.goto('http://127.0.0.1:4173/?quality=low&scale=0.5'); await sleep(4000);
  const vis = await p2.evaluate(() => getComputedStyle(document.getElementById('touch-notice')).display); await p2.screenshot({ path: `${c.out}/touch_notice.png` }); c.shots.push(`${c.out}/touch_notice.png`);
  c.step('touch-only viewport shows the desktop-controls message', vis === 'flex', `display ${vis}`);
  await b2.close(); c.browser = { close: async () => {} };
}
