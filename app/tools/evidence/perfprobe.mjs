import { launch, st, sleep, startMatchUI } from './lib.mjs';
for (const [w, h, q] of [[1920, 1080, 'high'], [1280, 720, 'low'], [1280, 720, 'medium']]) {
  const { browser, page } = await launch({ width: w, height: h, url: `http://127.0.0.1:5173/?quality=${q}` });
  await startMatchUI(page, { team: 'T', seed: 7 });
  await sleep(1500); await page.evaluate(() => window.__cs2.perfReset()); await sleep(6000);
  const t0 = await st(page); await sleep(5000); const t1 = await st(page);
  console.log(w, h, q, JSON.stringify(await page.evaluate(() => { const p = window.__cs2.perf(); return { cpuMed: p.cpuMedianMs.toFixed(1), cpuP95: p.cpuP95Ms.toFixed(1), fps: p.fps.toFixed(1), calls: p.drawCalls, tris: p.triangles }; })), 'simSpeed', ((t1.time - t0.time) / 5).toFixed(2));
  await browser.close();
}
