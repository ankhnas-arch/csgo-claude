import { sleep } from '../harness.mjs';
import { startMatchUI } from '../lib.mjs';
export default async function (c) {
  const page = await c.open('http://127.0.0.1:4173/?quality=low&scale=0.5');
  await startMatchUI(page, { team: 'T', seed: 11 }); await c.ensureLocked();
  const y0 = (await c.state()).player.yaw;
  await c.turn(360); const y1 = (await c.state()).player.yaw; const turned = Math.abs(((y1 - y0) * 180 / Math.PI + 180) % 360 - 180);
  c.step('360° look returns to heading (delta wrapped)', turned < 12, `residual ${turned.toFixed(1)}°`);
  await c.turn(0, -40); c.step('pitch clamps and moves', Math.abs((await c.state()).player.pitch) > 0.4);
  await c.turn(0, 40);
  const magBefore = (await c.state()).player.mag;
  await c.press('Escape'); await sleep(400); const s1 = await c.state(); await c.shot('paused');
  c.step('Escape pauses and releases lock', s1.paused && !s1.locked);
  await page.click('#pause .tabs button[data-t="settings"]'); await sleep(200); await c.shot('pause_settings');
  const slider = page.locator('#pause input[data-k="sensitivity"]'); await slider.fill('3'); await slider.dispatchEvent('input'); await sleep(100);
  c.step('settings changed from pause menu', (await c.settings()).sensitivity === 3);
  await page.click('#pause [data-q="resume"]'); await sleep(500); const s2 = await c.state();
  c.step('Resume requires click and re-locks', s2.locked && !s2.paused);
  c.step('closing menus did not fire a shot', (await c.state()).player.mag === magBefore);
  await page.keyboard.down('KeyW'); await c.wait(400); await page.evaluate(() => window.dispatchEvent(new Event('blur'))); await c.wait(500);
  const sp = (await c.state()).player.speed; c.step('blur clears held keys (no runaway movement)', sp < 0.5, `speed ${sp}`);
  await page.keyboard.up('KeyW');
  await c.ensureLocked(); c.step('re-lock after blur via click', (await c.state()).locked);
  await c.shot('relocked');
  c.step('no console errors', c.log.errors.length === 0, c.log.errors.slice(0, 3));
}
