import type { NavGrid } from '../../data/map/compile';

/** A* over the compiled nav grid with 8-connectivity (no corner cutting). Returns world waypoints (string-pulled). */
export class NavMesh {
  constructor(public grid: NavGrid) {}
  isWalkable(x: number, z: number): boolean { const [ix, iz] = this.grid.toCell(x, z); return this.cellOk(ix, iz); }
  cellOk(ix: number, iz: number): boolean { const g = this.grid; return ix >= 0 && iz >= 0 && ix < g.nx && iz < g.nz && g.walk[g.idx(ix, iz)] === 1; }
  floorAt(x: number, z: number): number { const [ix, iz] = this.grid.toCell(x, z); return this.cellOk(ix, iz) ? this.grid.floor[this.grid.idx(ix, iz)] : 0; }
  /** Nearest walkable cell centre to a world point (spiral search). */
  nearest(x: number, z: number, maxR = 6): [number, number] | null {
    const [cx, cz] = this.grid.toCell(x, z);
    if (this.cellOk(cx, cz)) return [cx, cz];
    for (let r = 1; r <= maxR; r++) for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) {
      if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
      if (this.cellOk(cx + dx, cz + dz)) return [cx + dx, cz + dz];
    }
    return null;
  }
  findPath(x0: number, z0: number, x1: number, z1: number, avoid?: (ix: number, iz: number) => number): [number, number][] | null {
    const s = this.nearest(x0, z0), t = this.nearest(x1, z1);
    if (!s || !t) return null;
    const g = this.grid; const N = g.nx * g.nz;
    const gScore = new Float32Array(N).fill(Infinity); const from = new Int32Array(N).fill(-1); const closed = new Uint8Array(N);
    const si = g.idx(s[0], s[1]), ti = g.idx(t[0], t[1]);
    gScore[si] = 0;
    const open = new MinHeap(); open.push(si, heur(s[0], s[1], t[0], t[1]));
    const dirs = [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, 1.414], [1, -1, 1.414], [-1, 1, 1.414], [-1, -1, 1.414]] as const;
    let found = false; let iter = 0;
    while (open.size > 0 && iter++ < 60000) {
      const cur = open.pop();
      if (cur === ti) { found = true; break; }
      if (closed[cur]) continue; closed[cur] = 1;
      const cx = cur % g.nx, cz = Math.floor(cur / g.nx);
      for (const [dx, dz, cost] of dirs) {
        const nx = cx + dx, nz = cz + dz;
        if (!this.cellOk(nx, nz)) continue;
        if (dx !== 0 && dz !== 0 && (!this.cellOk(cx + dx, cz) || !this.cellOk(cx, cz + dz))) continue; // no corner cutting
        const ni = g.idx(nx, nz); if (closed[ni]) continue;
        const dy = Math.abs(g.floor[ni] - g.floor[cur]); if (dy > 0.6) continue;
        let c = cost + dy * 2 + (avoid ? avoid(nx, nz) : 0);
        if (g.cover[ni]) c += 0.15; // prefer centre of corridors slightly (keeps bots off walls)
        const ng = gScore[cur] + c;
        if (ng < gScore[ni]) { gScore[ni] = ng; from[ni] = cur; open.push(ni, ng + heur(nx, nz, t[0], t[1])); }
      }
    }
    if (!found) return null;
    const cells: [number, number][] = []; let c = ti;
    while (c !== -1) { cells.push([c % g.nx, Math.floor(c / g.nx)]); c = from[c]; }
    cells.reverse();
    return this.smooth(cells).map(([ix, iz]) => g.toWorld(ix, iz));
  }
  /** String pulling: skip waypoints while the straight line between cells is fully walkable. */
  private smooth(cells: [number, number][]): [number, number][] {
    if (cells.length <= 2) return cells;
    const out: [number, number][] = [cells[0]]; let i = 0;
    while (i < cells.length - 1) {
      let j = cells.length - 1;
      while (j > i + 1 && !this.lineWalkable(cells[i], cells[j])) j--;
      out.push(cells[j]); i = j;
    }
    return out;
  }
  lineWalkable(a: [number, number], b: [number, number]): boolean {
    const n = Math.max(Math.abs(b[0] - a[0]), Math.abs(b[1] - a[1])) * 2;
    let prevF = this.grid.floor[this.grid.idx(a[0], a[1])];
    for (let k = 0; k <= n; k++) {
      const t = k / n; const x = a[0] + (b[0] - a[0]) * t, z = a[1] + (b[1] - a[1]) * t;
      const ix = Math.round(x), iz = Math.round(z);
      if (!this.cellOk(ix, iz)) return false;
      // also check the 4-neighbour of the diagonal to keep clearance
      const f = this.grid.floor[this.grid.idx(ix, iz)]; if (Math.abs(f - prevF) > 0.6) return false; prevF = f;
      const fx = x - ix, fz = z - iz;
      if (Math.abs(fx) > 0.3 && !this.cellOk(ix + Math.sign(fx), iz)) return false;
      if (Math.abs(fz) > 0.3 && !this.cellOk(ix, iz + Math.sign(fz))) return false;
    }
    return true;
  }
  /** Random walkable cell near a point within radius r (cells). */
  randomNear(x: number, z: number, r: number, rnd: () => number): [number, number] | null {
    const [cx, cz] = this.grid.toCell(x, z);
    for (let k = 0; k < 20; k++) {
      const ix = cx + Math.round((rnd() * 2 - 1) * r), iz = cz + Math.round((rnd() * 2 - 1) * r);
      if (this.cellOk(ix, iz)) return this.grid.toWorld(ix, iz);
    }
    return null;
  }
  coverNear(x: number, z: number, r: number, rnd: () => number): [number, number] | null {
    const [cx, cz] = this.grid.toCell(x, z); const g = this.grid; const cands: [number, number][] = [];
    for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) { const ix = cx + dx, iz = cz + dz; if (this.cellOk(ix, iz) && g.cover[g.idx(ix, iz)]) cands.push([ix, iz]); }
    if (!cands.length) return this.randomNear(x, z, r, rnd);
    const c = cands[Math.floor(rnd() * cands.length)]; return g.toWorld(c[0], c[1]);
  }
}
function heur(ax: number, az: number, bx: number, bz: number) { const dx = Math.abs(ax - bx), dz = Math.abs(az - bz); return Math.max(dx, dz) + 0.414 * Math.min(dx, dz); }
class MinHeap {
  keys: number[] = []; vals: number[] = [];
  get size() { return this.keys.length; }
  push(v: number, k: number) { this.keys.push(k); this.vals.push(v); let i = this.keys.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (this.keys[p] <= this.keys[i]) break; this.swap(i, p); i = p; } }
  pop(): number { const top = this.vals[0]; const lk = this.keys.pop()!, lv = this.vals.pop()!; if (this.keys.length) { this.keys[0] = lk; this.vals[0] = lv; let i = 0; for (;;) { const l = 2 * i + 1, r = l + 1; let m = i; if (l < this.keys.length && this.keys[l] < this.keys[m]) m = l; if (r < this.keys.length && this.keys[r] < this.keys[m]) m = r; if (m === i) break; this.swap(i, m); i = m; } } return top; }
  private swap(a: number, b: number) { [this.keys[a], this.keys[b]] = [this.keys[b], this.keys[a]]; [this.vals[a], this.vals[b]] = [this.vals[b], this.vals[a]]; }
}
