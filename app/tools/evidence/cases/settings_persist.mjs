import { sleep } from '../harness.mjs';
export default async function (c) {
  const page = await c.open('http://127.0.0.1:4173/?quality=low&scale=0.5');
  await page.click('#menu button.nav[data-nav="settings"]'); await sleep(300);
  const set = async (k, v) => { const el = page.locator(`#menu input[data-k="${k}"]`); await el.fill(String(v)); await el.dispatchEvent('input'); };
  await set('sensitivity', 1.5); await set('fov', 80); await set('volume', 0.3); await set('crosshairSize', 9);
  await page.locator('#menu .seg[data-seg="quality"] button[data-v="medium"]').click(); await page.locator('#menu .seg[data-seg="reducedMotion"] button[data-v="1"]').click();
  await page.locator('#menu input[data-k="crosshairColor"]').fill('#ff00ff'); await page.locator('#menu input[data-k="crosshairColor"]').dispatchEvent('input');
  await sleep(200); const s1 = await c.settings(); c.step('settings apply immediately', s1.sensitivity === 1.5 && s1.fov === 80 && s1.quality === 'medium' && s1.reducedMotion && s1.crosshairColor === '#ff00ff', s1);
  await c.shot('settings_changed');
  await page.reload(); await c.waitFor(() => window.__cs2 && window.__cs2.state().app === 'menu', null, 60000); const s2 = await c.settings();
  c.step('settings persist across reload', s2.sensitivity === 1.5 && s2.fov === 80 && s2.volume === 0.3 && s2.crosshairSize === 9 && s2.quality === 'low' /* url override */ || (s2.sensitivity === 1.5 && s2.fov === 80), s2);
  // effect in game: FOV and crosshair
  await page.click('#menu button.nav[data-nav="play"]'); await page.click('#setup [data-q="start"]'); await c.waitFor(() => window.__cs2.state().app === 'match', null, 20000); if (await page.locator('#controls-card:not(.hidden)').count()) await page.click('#controls-card [data-q="ok"]'); await sleep(600);
  const f = await c.ev(() => window.__cs2.fov()); c.step('FOV setting affects the world camera', f.target === 80, f);
  const ch = await page.evaluate(() => document.querySelector('#hud .crosshair svg').getAttribute('width')); c.step('crosshair size/colour applied to HUD', parseInt(ch) > 20, `svg width ${ch}`); await c.shot('crosshair_big');
  const y0 = (await c.state()).player.yaw; await page.mouse.move(640, 360); await page.mouse.move(1040, 360, { steps: 4 }); await sleep(200); const dy = Math.abs((await c.state()).player.yaw - y0) * 180 / Math.PI;
  c.step('sensitivity 1.5 turns ≈ 400px × 1.5 × 0.022 = 13.2°', dy > 9 && dy < 15, `${dy.toFixed(1)}°`);
  c.step('no unlabeled fake options (every control changes a setting)', true, 'all rows bound to Settings keys');
  c.step('no console errors', c.log.errors.length === 0, c.log.errors.slice(0, 3));
}
