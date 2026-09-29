import { launch, shot, sleep, startMatchUI } from './lib.mjs';
const out = process.argv[2] ?? 'evidence/dev';
const { browser, page } = await launch({ width: 1280, height: 720, url: 'http://127.0.0.1:5173/?quality=high&scale=1' });
await startMatchUI(page, { team: 'CT', seed: 5 });
await page.evaluate(() => window.__cs2.freezeBots(true));
for (const cam of await page.evaluate(() => window.__cs2.cameras())) {
  await page.evaluate(id => window.__cs2.setRefCamera(id), cam.id); await sleep(1200); await shot(page, `${out}/${cam.id}.png`);
}
// overhead
await page.evaluate(() => window.__cs2.setFreeCamera([0, 140, 0.01], [0, 0, 0], 55)); await sleep(1200); await shot(page, `${out}/overhead.png`);
await browser.close();
