import { sleep } from '../harness.mjs';
import { startMatchUI } from '../lib.mjs';
export default async function (c) {
  const page = await c.open('http://127.0.0.1:4173/?quality=low&scale=0.5');
  await startMatchUI(page, { team: 'CT', seed: 31 }); await c.ensureLocked();
  await c.ev(() => window.__cs2.setPhaseTime(30));
  c.step('buy menu opens with B in spawn during freeze', await c.openBuy()); await c.shot('buy_open');
  const m0 = (await c.state()).player.money;
  const r1 = await c.buyItem('m4a4'); c.step('buy M4A4 ($2900)', r1.ok && r1.cost === 2900, r1);
  const r2 = await c.buyItem('m4a4'); c.step('duplicate rifle refused', !r2.ok && /Already/.test(r2.status), r2);
  const r3 = await c.buyItem('kevlar'); c.step('kevlar refused when money short', !r3.ok && /Not enough/.test(r3.status), r3); await c.shot('buy_insufficient');
  await c.ev(() => window.__cs2.giveMoney(9000)); await sleep(200);
  const r4 = await c.buyItem('helmet'); c.step('kevlar+helmet $1000', r4.ok && r4.cost === 1000, r4);
  const r5 = await c.buyItem('defuser'); c.step('defuse kit $400 (CT)', r5.ok && r5.cost === 400, r5);
  const r6 = await c.buyItem('usp'); c.step('duplicate sidearm refused', !r6.ok, r6);
  for (const g of ['he', 'flash', 'flash', 'smoke']) { const r = await c.buyItem(g); c.step(`grenade ${g}`, r.ok, r); }
  const r7 = await c.buyItem('incendiary'); c.step('5th grenade refused (limit 4)', !r7.ok && /limit/.test(r7.status), r7);
  const r8 = await c.buyItem('flash'); c.step('3rd flash refused', !r8.ok, r8);
  c.step('AK-47 not listed for CT', (await page.locator('#buy .item[data-item="ak47"]').count()) === 0);
  const p = (await c.state()).player; c.step('inventory matches purchases', p.primary === 'm4a4' && p.armor === 100 && p.helmet && p.kit && p.grenades.length === 4, p);
  c.step('money never negative', p.money >= 0 && m0 - 2900 >= 0);
  await c.shot('buy_after'); await c.closeBuy();
  await c.press('KeyG'); await sleep(300); c.step('drop primary with G', (await c.state()).player.primary === null);
  await c.openBuy(); await page.click('#buy [data-q="rebuy"]'); await sleep(300); c.step('rebuy restores rifle', (await c.state()).player.primary === 'm4a4'); await c.closeBuy();
  await c.ev(() => window.__cs2.teleport(0, -20, 0)); await sleep(300); await c.press('KeyB'); await sleep(400); c.step('buy refused outside spawn zone', !(await c.state()).buyOpen); await c.shot('buy_outside_zone');
  await c.ev(() => window.__cs2.teleport(3, -46, 0)); await sleep(300);
  await c.ev(() => window.__cs2.setPhaseTime(0.3)); await c.waitPhase('live'); await c.ev(() => window.__cs2.setPhaseTime(70)); await sleep(500);
  await c.press('KeyB'); await sleep(400); c.step('buy refused after buy time expiry', !(await c.state()).buyOpen); await c.shot('buy_expired');
  c.step('no console errors', c.log.errors.length === 0, c.log.errors.slice(0, 3));
}
