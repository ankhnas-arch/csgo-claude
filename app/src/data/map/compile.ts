import { RECTS, PROPS, MAP_BOUNDS, floorYAt, rectFloorY, type Rect, type Prop, type MatKey } from './layout';

export interface WallSeg { x0: number; z0: number; x1: number; z1: number; yBase: number; yTop: number; mat: MatKey; rectId: string; outward: [number, number]; ledge?: boolean; }
export interface FloorPiece { rect: Rect; cx: number; cz: number; w: number; d: number; y: number; ramp?: { axis: 'x' | 'z'; yStart: number; yEnd: number } }
export interface CeilingPiece { rect: Rect; y: number }
export interface NavGrid {
  cell: number; x0: number; z0: number; nx: number; nz: number;
  walk: Uint8Array;       // 1 walkable
  cover: Uint8Array;      // 1 = adjacent to a prop/wall (cover candidate)
  floor: Float32Array;    // floor y per cell
  rectIdx: Int16Array;    // rect index per cell (-1 none)
  idx(ix: number, iz: number): number;
  toCell(x: number, z: number): [number, number];
  toWorld(ix: number, iz: number): [number, number];
}
export interface CompiledMap { walls: WallSeg[]; floors: FloorPiece[]; ceilings: CeilingPiece[]; props: Prop[]; nav: NavGrid; }

const OPEN_STEP = 0.55; // max floor height difference that is still walkable across an edge (Source step height 18u ≈ 0.46 m)

export function compileMap(): CompiledMap {
  const walls: WallSeg[] = [];
  const floors: FloorPiece[] = [];
  const ceilings: CeilingPiece[] = [];
  for (const r of RECTS) {
    const w = r.x1 - r.x0, d = r.z1 - r.z0;
    const piece: FloorPiece = { rect: r, cx: (r.x0 + r.x1) / 2, cz: (r.z0 + r.z1) / 2, w, d, y: r.y };
    if (r.ramp) {
      const a0 = r.ramp.axis === 'x' ? r.x0 : r.z0, a1 = r.ramp.axis === 'x' ? r.x1 : r.z1;
      const yStart = r.ramp.from === 'min' ? r.y : r.ramp.yEnd; // y at a0
      const yEnd = r.ramp.from === 'min' ? r.ramp.yEnd : r.y;   // y at a1
      piece.ramp = { axis: r.ramp.axis, yStart, yEnd }; void a0; void a1;
    }
    floors.push(piece);
    if (r.ceiling !== undefined) ceilings.push({ rect: r, y: Math.max(r.y, r.ramp?.yEnd ?? r.y) + r.ceiling });
    // walls on each edge
    const edges: { ax: number; az: number; bx: number; bz: number; nx: number; nz: number }[] = [
      { ax: r.x0, az: r.z0, bx: r.x1, bz: r.z0, nx: 0, nz: -1 }, // north edge
      { ax: r.x1, az: r.z0, bx: r.x1, bz: r.z1, nx: 1, nz: 0 },  // east
      { ax: r.x1, az: r.z1, bx: r.x0, bz: r.z1, nx: 0, nz: 1 },  // south
      { ax: r.x0, az: r.z1, bx: r.x0, bz: r.z0, nx: -1, nz: 0 }, // west
    ];
    const wallH = r.wallHeight ?? 5.5;
    for (const e of edges) {
      const len = Math.hypot(e.bx - e.ax, e.bz - e.az);
      const n = Math.max(1, Math.round(len / 0.25));
      let runStart = -1; let runKind: 'wall' | 'ledge' = 'wall'; let runOtherY = 0;
      const flush = (iEnd: number) => {
        if (runStart < 0) return;
        const t0 = runStart / n, t1 = iEnd / n;
        const x0 = e.ax + (e.bx - e.ax) * t0, z0 = e.az + (e.bz - e.az) * t0;
        const x1 = e.ax + (e.bx - e.ax) * t1, z1 = e.az + (e.bz - e.az) * t1;
        const ya = rectFloorY(r, x0, z0), yb = rectFloorY(r, x1, z1);
        if (runKind === 'ledge') {
          // this rect is HIGHER than its neighbour: emit a retaining wall from the neighbour floor up to this floor (only from the higher side)
          const hiY = Math.max(ya, yb);
          if (hiY > runOtherY) walls.push({ x0, z0, x1, z1, yBase: runOtherY - 0.5, yTop: hiY, mat: 'stone', rectId: r.id, outward: [e.nx, e.nz], ledge: true });
        } else {
          const lo = Math.min(ya, yb) - 1.0, hi = Math.max(ya, yb) + wallH;
          walls.push({ x0, z0, x1, z1, yBase: lo, yTop: hi, mat: r.wall ?? 'plasterWarm', rectId: r.id, outward: [e.nx, e.nz] });
        }
        runStart = -1;
      };
      for (let i = 0; i <= n; i++) {
        const t = (i + 0.5) / n;
        const px = e.ax + (e.bx - e.ax) * t, pz = e.az + (e.bz - e.az) * t;
        const inside = rectFloorY(r, px, pz);
        const q = floorYAt(px + e.nx * 0.08, pz + e.nz * 0.08);
        const open = i < n && q !== null && q.rect !== r && Math.abs(q.y - inside) <= OPEN_STEP;
        const ledge = !open && i < n && q !== null && q.rect !== r && Math.abs(q.y - inside) <= 2.2; // walkable-height drop: platform edge
        const kind: 'wall' | 'ledge' = ledge ? 'ledge' : 'wall';
        if (!open && i < n) { if (runStart < 0) { runStart = i; runKind = kind; runOtherY = q ? Math.min(q.y, inside) : inside; } else if (kind !== runKind) { flush(i); runStart = i; runKind = kind; runOtherY = q ? Math.min(q.y, inside) : inside; } }
        else flush(i);
      }
    }
  }
  const nav = buildNav();
  return { walls, floors, ceilings, props: PROPS, nav };
}

function buildNav(): NavGrid {
  const cell = 1.0;
  const x0 = MAP_BOUNDS.x0, z0 = MAP_BOUNDS.z0;
  const nx = Math.ceil((MAP_BOUNDS.x1 - x0) / cell), nz = Math.ceil((MAP_BOUNDS.z1 - z0) / cell);
  const walk = new Uint8Array(nx * nz), cover = new Uint8Array(nx * nz), floor = new Float32Array(nx * nz), rectIdx = new Int16Array(nx * nz).fill(-1);
  const idx = (ix: number, iz: number) => iz * nx + ix;
  const blockers = PROPS.filter(p => p.collide !== false && ['box', 'barrel', 'container', 'lowwall', 'truck', 'doorleaf', 'sandbag'].includes(p.kind));
  const clearance = 0.45;
  for (let iz = 0; iz < nz; iz++) for (let ix = 0; ix < nx; ix++) {
    const x = x0 + (ix + 0.5) * cell, z = z0 + (iz + 0.5) * cell;
    const f = floorYAt(x, z);
    const i = idx(ix, iz);
    if (!f) continue;
    // need clearance from rect edges that are walls: check 4 neighbours offset by clearance are inside same/adjacent rect with walkable step
    let ok = true;
    for (const [dx, dz] of [[clearance, 0], [-clearance, 0], [0, clearance], [0, -clearance]] as const) {
      const g = floorYAt(x + dx, z + dz);
      if (!g || Math.abs(g.y - f.y) > OPEN_STEP) { ok = false; break; }
    }
    if (!ok) continue;
    let blocked = false;
    for (const p of blockers) {
      if (propContains(p, x, z, clearance) && p.y <= f.y + 1.2 && p.y + p.sy > f.y + 0.3) { blocked = true; break; }
    }
    if (blocked) continue;
    walk[i] = 1; floor[i] = f.y; rectIdx[i] = RECTS.indexOf(f.rect);
  }
  // cover: walkable cells with a blocked/non-walkable neighbour (prop or wall) — used by bots as hold points
  for (let iz = 1; iz < nz - 1; iz++) for (let ix = 1; ix < nx - 1; ix++) {
    const i = idx(ix, iz); if (!walk[i]) continue;
    let near = 0;
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) if (!walk[idx(ix + dx, iz + dz)]) near++;
    if (near >= 1 && near <= 2) cover[i] = 1;
  }
  return {
    cell, x0, z0, nx, nz, walk, cover, floor, rectIdx, idx,
    toCell: (x, z) => [Math.floor((x - x0) / cell), Math.floor((z - z0) / cell)],
    toWorld: (ix, iz) => [x0 + (ix + 0.5) * cell, z0 + (iz + 0.5) * cell],
  };
}

export function propContains(p: Prop, x: number, z: number, pad: number): boolean {
  const c = Math.cos(-(p.rotY ?? 0)), s = Math.sin(-(p.rotY ?? 0));
  const dx = x - p.x, dz = z - p.z;
  const lx = dx * c - dz * s, lz = dx * s + dz * c;
  return Math.abs(lx) <= p.sx / 2 + pad && Math.abs(lz) <= p.sz / 2 + pad;
}
