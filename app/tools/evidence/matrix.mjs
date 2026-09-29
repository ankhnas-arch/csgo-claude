/** Builds app/ACCEPTANCE_MATRIX.md from one or more evidence run results.json files. */
import fs from 'node:fs';
const runs = process.argv.slice(2);
const rows = [];
for (const r of runs) { const res = JSON.parse(fs.readFileSync(`${r}/results.json`, 'utf8')); for (const c of res) rows.push({ run: r, ...c }); }
const rev = (() => { try { return require('node:child_process').execSync('git rev-parse --short HEAD').toString().trim(); } catch { return 'n/a'; } })();
let md = `# ACCEPTANCE_MATRIX\n\nGenerated ${new Date().toISOString()} from: ${runs.join(', ')}. Revision ${rev}. Each case is driven by real keyboard/mouse input through Playwright (Chromium ${'1194'}, SwiftShader software GL, 1280×720 unless noted, quality=low, render scale 0.5). Fixtures (window.__cs2.*) only prepare scenarios (teleports, money, seeds); outcomes are asserted from simulation events produced by the input.\n\n| Feature / case | Input procedure | Expected | Actual (steps ok/total) | Status | Evidence |\n|---|---|---|---|---|---|\n`;
for (const c of rows) { const ok = c.steps.filter(s => s.ok).length; const failed = c.steps.filter(s => !s.ok).map(s => `${s.name}${s.detail ? ' — ' + String(s.detail).slice(0, 120) : ''}`); md += `| ${c.name} | see tools/evidence/cases/${c.name}.mjs | all steps pass | ${ok}/${c.steps.length}${failed.length ? '<br>FAILED: ' + failed.join('<br>') : ''} | **${c.status}** | ${c.run}/${c.name}/ (${c.shots.length} screenshots, steps.json, console.json) |\n`; }
md += `\n## Step detail\n`;
for (const c of rows) { md += `\n### ${c.name} — ${c.status} (${c.seconds}s)\n`; for (const s of c.steps) md += `- [${s.ok ? 'x' : ' '}] ${s.name}${s.detail ? ` — ${String(s.detail).slice(0, 220)}` : ''}\n`; for (const n of c.notes) md += `- note: ${String(n).slice(0, 600)}\n`; if (c.errors.length) md += `- console errors: ${c.errors.slice(0, 5).join(' | ')}\n`; }
fs.writeFileSync('ACCEPTANCE_MATRIX.md', md); console.log('wrote ACCEPTANCE_MATRIX.md with', rows.length, 'cases');
