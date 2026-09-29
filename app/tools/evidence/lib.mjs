import { chromium } from 'playwright';
import fs from 'node:fs';
export const ROOT = new URL('../../', import.meta.url).pathname;
export async function launch(opts = {}) {
  const { width = 1920, height = 1080, video = null, url = 'http://127.0.0.1:4173/?quality=low&scale=0.5' } = opts;
  const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROME_PATH ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl', '--autoplay-policy=no-user-gesture-required', '--disable-features=PointerLockPermissionPrompt'] });
  const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1, recordVideo: video ? { dir: video, size: { width, height } } : undefined });
  const page = await ctx.newPage();
  const log = { errors: [], warnings: [], console: [] };
  page.on('console', m => { const t = m.type(); const txt = m.text(); log.console.push(`[${t}] ${txt}`); if (t === 'error') log.errors.push(txt); if (t === 'warning') log.warnings.push(txt); });
  page.on('pageerror', e => log.errors.push('pageerror: ' + e.message));
  page.on('requestfailed', r => log.errors.push('requestfailed: ' + r.url()));
  await page.goto(url, { waitUntil: 'load' });
  await page.waitForFunction(() => (window).__cs2 && (window).__cs2.state().app === 'menu', null, { timeout: 120000 });
  return { browser, ctx, page, log };
}
export const sleep = ms => new Promise(r => setTimeout(r, ms));
export async function shot(page, path) { fs.mkdirSync(path.substring(0, path.lastIndexOf('/')), { recursive: true }); await page.screenshot({ path }); return path; }
export async function st(page) { return page.evaluate(() => window.__cs2.state()); }
export async function actors(page) { return page.evaluate(() => window.__cs2.actors()); }
export async function evalc(page, fn, arg) { return page.evaluate(fn, arg); }
/** Start a match through the real menu UI. */
export async function startMatchUI(page, { team = 'T', difficulty = 'easy', seed = 42, economy = 'showcase' } = {}) {
  await page.click('#menu button.nav[data-nav="play"]');
  await page.click(`#setup .seg[data-k="team"] button[data-v="${team}"]`);
  await page.click(`#setup .seg[data-k="difficulty"] button[data-v="${difficulty}"]`);
  await page.click(`#setup .seg[data-k="economy"] button[data-v="${economy}"]`);
  await page.fill('#setup input[data-k="seed"]', String(seed));
  await page.click('#setup [data-q="start"]');
  await page.waitForFunction(() => window.__cs2.state().app === 'match', null, { timeout: 20000 });
  // dismiss controls card if shown, then acquire pointer lock with a real click
  if (await page.locator('#controls-card:not(.hidden)').count()) await page.click('#controls-card [data-q="ok"]');
  await sleep(400);
  if (!(await st(page)).locked) { await page.mouse.click(960, 540); await sleep(400); }
  return st(page);
}
export async function lock(page) { const s = await st(page); if (!s.locked) { if (await page.locator('#resume:not(.hidden)').count()) await page.click('#resume .box'); else await page.mouse.click(960, 540); await sleep(350); } return (await st(page)).locked; }
export async function holdKey(page, key, ms) { await page.keyboard.down(key); await sleep(ms); await page.keyboard.up(key); }
export async function moveMouse(page, dx, dy, steps = 8) { for (let i = 0; i < steps; i++) { await page.mouse.move(960 + dx * (i + 1) / steps, 540 + dy * (i + 1) / steps); } }
export function writeJson(path, obj) { fs.mkdirSync(path.substring(0, path.lastIndexOf('/')), { recursive: true }); fs.writeFileSync(path, JSON.stringify(obj, null, 2)); }
