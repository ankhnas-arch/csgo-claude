/** Generates the overhead route/collision diagram (SVG) from the layout data. Run: npx vite-node tools/map/diagram.ts */
import fs from 'node:fs';
import { RECTS, PROPS, SITES, SPAWNS, CAMERAS } from '../../src/data/map/layout';
import { compileMap } from '../../src/data/map/compile';
const S = 6, OX = 60 * S, OZ = 62 * S, W = 120 * S, H = 124 * S;
const X = (x: number) => OX + x * S, Z = (z: number) => OZ + z * S;
const map = compileMap();
let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="Arial" font-size="11">\n<rect width="${W}" height="${H}" fill="#1b1f26"/>\n`;
for (const r of RECTS) { const col = r.ceiling ? '#3a4658' : r.y >= 1.5 ? '#6b7a90' : r.y < -0.5 ? '#2f3844' : '#55606f'; svg += `<rect x="${X(r.x0)}" y="${Z(r.z0)}" width="${(r.x1 - r.x0) * S}" height="${(r.z1 - r.z0) * S}" fill="${col}" stroke="#0b0d10" stroke-width="1"/>`; if (r.ramp) svg += `<text x="${X((r.x0 + r.x1) / 2)}" y="${Z((r.z0 + r.z1) / 2) + 4}" fill="#ffd" text-anchor="middle" font-size="9">ramp ${r.y}→${r.ramp.yEnd}</text>`; }
for (const w of map.walls) svg += `<line x1="${X(w.x0)}" y1="${Z(w.z0)}" x2="${X(w.x1)}" y2="${Z(w.z1)}" stroke="${w.ledge ? '#e8c56e' : '#e0dcd0'}" stroke-width="${w.ledge ? 2 : 3}"/>`;
for (const p of PROPS) if (p.collide !== false && ['box', 'barrel', 'container', 'lowwall', 'truck', 'doorleaf', 'sandbag'].includes(p.kind)) { const c = Math.cos(p.rotY ?? 0), s = Math.sin(p.rotY ?? 0); svg += `<rect x="${-p.sx * S / 2}" y="${-p.sz * S / 2}" width="${p.sx * S}" height="${p.sz * S}" fill="#b07a3c" transform="translate(${X(p.x)},${Z(p.z)}) rotate(${-(p.rotY ?? 0) * 180 / Math.PI})" opacity="0.9"/>`; void c; void s; }
// nav grid (walkable cells) as faint dots
const g = map.nav; for (let iz = 0; iz < g.nz; iz += 2) for (let ix = 0; ix < g.nx; ix += 2) if (g.walk[g.idx(ix, iz)]) { const [x, z] = g.toWorld(ix, iz); svg += `<circle cx="${X(x)}" cy="${Z(z)}" r="0.8" fill="#9fd" opacity="0.35"/>`; }
for (const s of SITES) svg += `<rect x="${X(s.x0)}" y="${Z(s.z0)}" width="${(s.x1 - s.x0) * S}" height="${(s.z1 - s.z0) * S}" fill="none" stroke="#ff6a4a" stroke-width="2" stroke-dasharray="6 4"/><text x="${X((s.x0 + s.x1) / 2)}" y="${Z((s.z0 + s.z1) / 2) + 10}" fill="#ff8a6a" font-size="28" font-weight="bold" text-anchor="middle">${s.id}</text>`;
for (const [team, sp] of Object.entries(SPAWNS)) for (const p of sp) svg += `<circle cx="${X(p.x)}" cy="${Z(p.z)}" r="4" fill="${team === 'T' ? '#e5b95a' : '#6aa6e8'}"/>`;
for (const r of RECTS) if (r.radar) svg += `<text x="${X((r.x0 + r.x1) / 2)}" y="${Z((r.z0 + r.z1) / 2) - 6}" fill="#fff" text-anchor="middle" font-size="10" font-weight="bold">${r.radar}</text>`;
for (const c of CAMERAS) { svg += `<circle cx="${X(c.pos[0])}" cy="${Z(c.pos[2])}" r="5" fill="#f0f" /><line x1="${X(c.pos[0])}" y1="${Z(c.pos[2])}" x2="${X(c.look[0])}" y2="${Z(c.look[2])}" stroke="#f0f" stroke-width="1.5"/><text x="${X(c.pos[0]) + 8}" y="${Z(c.pos[2]) - 6}" fill="#f6f" font-size="10">${c.ref}</text>`; }
// routes
const routes: [string, string, [number, number][]][] = [
  ['Long A (T→A)', '#ffb347', [[0, 46], [22, 42], [30, 42], [38, 30], [38, -18], [36, -34]]],
  ['Mid → doors → CT', '#7fdc7f', [[0, 40], [0, 20], [0, -27], [2, -46]]],
  ['Mid → catwalk → short → A', '#7fc8ff', [[0, -6], [12, -15], [19, -20], [26, -28], [32, -38]]],
  ['Tunnels (T→B)', '#ff7fbf', [[0, 46], [-16, 44], [-30, 38], [-36, 20], [-36, -23], [-36, -36]]],
  ['CT → B doors', '#d0a0ff', [[2, -46], [-10, -43], [-24, -43], [-34, -38]]],
  ['CT → CT ramp → A', '#ffe680', [[6, -46], [15, -42], [22, -42], [30, -40]]],
  ['Lower tunnels (mid↔tunnels)', '#c0c0c0', [[-4, 0], [-12, 0], [-30, 0], [-36, 0]]],
];
for (const [name, col, pts] of routes) { svg += `<polyline points="${pts.map(([x, z]) => `${X(x)},${Z(z)}`).join(' ')}" fill="none" stroke="${col}" stroke-width="2.5" stroke-dasharray="9 5" opacity="0.9"/>`; const m = pts[Math.floor(pts.length / 2)]; svg += `<text x="${X(m[0]) + 6}" y="${Z(m[1]) - 4}" fill="${col}" font-size="10">${name}</text>`; }
svg += `<text x="10" y="${H - 12}" fill="#ccc" font-size="11">Compressed Dust II-inspired layout · white = walls · gold = ledges (jumpable) · brown = collidable props · dots = nav cells · magenta = reference cameras CS08–CS11 · north up (−z)</text></svg>`;
fs.mkdirSync('research', { recursive: true }); fs.writeFileSync('research/map_overhead.svg', svg);
// walkable stats
let cells = 0; for (let i = 0; i < g.walk.length; i++) cells += g.walk[i];
console.log(JSON.stringify({ rects: RECTS.length, walls: map.walls.length, ledges: map.walls.filter(w => w.ledge).length, props: PROPS.length, navCells: cells, gridSize: [g.nx, g.nz] }));
