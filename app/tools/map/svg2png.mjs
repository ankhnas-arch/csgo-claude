import { chromium } from 'playwright'; import fs from 'node:fs';
const [svgPath, pngPath] = process.argv.slice(2);
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' }); const p = await b.newPage({ viewport: { width: 760, height: 780 } });
await p.setContent(`<body style="margin:0;background:#1b1f26">${fs.readFileSync(svgPath, 'utf8')}</body>`); await p.screenshot({ path: pngPath, fullPage: true }); await b.close(); console.log('wrote', pngPath);
