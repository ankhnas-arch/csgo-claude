import fs from 'node:fs';
import path from 'node:path';
import { Ctx, summarize, writeJson } from './harness.mjs';
const args = process.argv.slice(2);
const casesArg = args.find(a => a.startsWith('--cases='))?.slice(8);
const outRoot = args.find(a => a.startsWith('--out='))?.slice(6) ?? `evidence/run-${new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)}`;
const dir = new URL('./cases/', import.meta.url).pathname;
const all = fs.readdirSync(dir).filter(f => f.endsWith('.mjs')).map(f => f.replace('.mjs', ''));
const cases = casesArg ? casesArg.split(',') : all;
fs.mkdirSync(outRoot, { recursive: true });
const results = [];
for (const name of cases) {
  console.log(`\n=== ${name} ===`); const t0 = Date.now();
  const c = new Ctx(name, outRoot, { video: args.includes('--video') });
  try { const mod = await import(path.join(dir, name + '.mjs')); await mod.default(c); }
  catch (e) { c.step('case threw', false, String(e.message ?? e).slice(0, 300)); try { await c.shot('error'); } catch { /* ignore */ } }
  await c.close();
  results.push({ name, status: c.status, steps: c.steps, notes: c.notes, shots: c.shots, errors: c.log?.errors ?? [], seconds: +((Date.now() - t0) / 1000).toFixed(0) });
  writeJson(`${outRoot}/results.json`, results);
  console.log(`=== ${name}: ${c.status} (${results.at(-1).seconds}s)`);
}
fs.writeFileSync(`${outRoot}/SUMMARY.md`, `# Evidence run ${outRoot}\n\n| case | status | steps | notes |\n|---|---|---|---|\n${summarize(results)}\n`);
console.log('\n' + summarize(results));
