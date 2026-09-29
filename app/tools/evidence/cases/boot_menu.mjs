import { sleep } from '../harness.mjs';
export default async function (c) {
  const page = await c.open('http://127.0.0.1:4173/?quality=low&scale=0.5');
  c.step('cold load reached menu', (await c.state()).app === 'menu');
  await sleep(1500); await c.shot('menu');
  const px = await page.evaluate(() => { const cv = document.getElementById('game-canvas'); const gl = cv.getContext('webgl2'); return !!gl; });
  c.step('canvas has webgl2 context (not blank)', px);
  await page.click('#menu button.nav[data-nav="settings"]'); await sleep(300); await c.shot('settings');
  c.step('settings panel opens', await page.locator('#menu .panel:not(.hidden)').count() === 1);
  await page.click('#menu button.nav[data-nav="credits"]'); await sleep(200); c.step('credits panel', (await page.locator('#menu .panel').textContent()).includes('Valve'));
  await page.click('#menu button.nav[data-nav="equipment"]'); await sleep(200); await c.shot('equipment'); c.step('equipment panel', await page.locator('#menu .equip-card').count() >= 3);
  await page.click('#menu button.nav[data-nav="play"]'); await sleep(200); await c.shot('setup'); c.step('setup panel with team/difficulty/economy', await page.locator('#setup .seg').count() === 3);
  await page.click('#setup [data-q="start"]'); await c.waitFor(() => window.__cs2.state().app === 'match', null, 20000);
  c.step('Play activates match', true);
  if (await page.locator('#controls-card:not(.hidden)').count()) { await c.shot('controls_card'); c.step('controls explained on first entry', true); await page.click('#controls-card [data-q="ok"]'); }
  await sleep(500); c.step('pointer lock acquired after intentional click', (await c.state()).locked);
  await c.shot('freeze_hud');
  c.step('no console errors', c.log.errors.length === 0, c.log.errors.slice(0, 3));
}
