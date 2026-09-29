import * as THREE from 'three';
import { Rng } from '../core/rng';

/** Procedural texture generation (authored at runtime; no external image assets). */
export interface TexSet { map: THREE.Texture; normalMap: THREE.Texture; roughnessMap: THREE.Texture; }

function valueNoise(size: number, seed: number, octaves = 5, persistence = 0.5, baseFreq = 4): Float32Array {
  const rng = new Rng(seed); const out = new Float32Array(size * size);
  let amp = 1, freq = baseFreq, total = 0;
  for (let o = 0; o < octaves; o++) {
    const gs = Math.max(1, Math.round(freq)); const grid = new Float32Array((gs + 1) * (gs + 1));
    for (let i = 0; i < grid.length; i++) grid[i] = rng.next();
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      const fx = (x / size) * gs, fy = (y / size) * gs; const ix = Math.floor(fx) % gs, iy = Math.floor(fy) % gs; const tx = fx - Math.floor(fx), ty = fy - Math.floor(fy);
      const sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty);
      const g = (a: number, b: number) => grid[((b % gs) + gs) % gs * (gs + 1) + ((a % gs) + gs) % gs];
      const v = (g(ix, iy) * (1 - sx) + g(ix + 1, iy) * sx) * (1 - sy) + (g(ix, iy + 1) * (1 - sx) + g(ix + 1, iy + 1) * sx) * sy;
      out[y * size + x] += v * amp;
    }
    total += amp; amp *= persistence; freq *= 2;
  }
  for (let i = 0; i < out.length; i++) out[i] /= total;
  return out;
}
function makeCanvas(size: number) { const c = document.createElement('canvas'); c.width = c.height = size; return c; }
function toTexture(c: HTMLCanvasElement, repeat: number, srgb = true): THREE.Texture {
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat, repeat); t.anisotropy = 8;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace; t.needsUpdate = true; return t;
}
function heightToNormal(h: Float32Array, size: number, strength: number): HTMLCanvasElement {
  const c = makeCanvas(size); const ctx = c.getContext('2d')!; const img = ctx.createImageData(size, size);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const l = h[y * size + ((x - 1 + size) % size)], r = h[y * size + ((x + 1) % size)], u = h[((y - 1 + size) % size) * size + x], d = h[((y + 1) % size) * size + x];
    const nx = (l - r) * strength, ny = (u - d) * strength; const nz = 1; const len = Math.hypot(nx, ny, nz);
    const i = (y * size + x) * 4; img.data[i] = (nx / len * 0.5 + 0.5) * 255; img.data[i + 1] = (ny / len * 0.5 + 0.5) * 255; img.data[i + 2] = (nz / len * 0.5 + 0.5) * 255; img.data[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0); return c;
}
function grayCanvas(v: Float32Array, size: number): HTMLCanvasElement {
  const c = makeCanvas(size); const ctx = c.getContext('2d')!; const img = ctx.createImageData(size, size);
  for (let i = 0; i < size * size; i++) { const g = Math.max(0, Math.min(255, v[i] * 255)); img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = g; img.data[i * 4 + 3] = 255; }
  ctx.putImageData(img, 0, 0); return c;
}
function clamp01(x: number) { return Math.max(0, Math.min(1, x)); }
function mix(a: number[], b: number[], t: number) { return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]; }

export interface TexSpec { kind: 'plaster' | 'stone' | 'flagstone' | 'wood' | 'metal' | 'sand' | 'crate' | 'asphalt' | 'canvas' | 'tarp' | 'ribbed' | 'timber' | 'concrete'; base: number[]; seed: number; repeat: number; tint2?: number[]; }
const cache = new Map<string, TexSet>();
export function getTexSet(spec: TexSpec, size = 512): TexSet {
  const key = JSON.stringify(spec); const hit = cache.get(key); if (hit) return hit;
  const s = size; const rng = new Rng(spec.seed);
  const n1 = valueNoise(s, spec.seed, 6, 0.55, 3), n2 = valueNoise(s, spec.seed + 7, 4, 0.5, 12), n3 = valueNoise(s, spec.seed + 13, 3, 0.6, 40);
  const color = makeCanvas(s); const ctx = color.getContext('2d')!; const img = ctx.createImageData(s, s);
  const height = new Float32Array(s * s), rough = new Float32Array(s * s);
  const base = spec.base, tint2 = spec.tint2 ?? mix(base, [0.3, 0.25, 0.2], 0.4);
  for (let y = 0; y < s; y++) for (let x = 0; x < s; x++) {
    const i = y * s + x; const a = n1[i], b = n2[i], c = n3[i];
    let col: number[]; let h = 0; let r = 0.8;
    switch (spec.kind) {
      case 'plaster': {
        const patches = clamp01((a - 0.45) * 3); // large patches of repair / discolouration
        const grain = (b - 0.5) * 0.12 + (c - 0.5) * 0.08;
        col = mix(base, tint2, patches * 0.55); col = col.map(v => clamp01(v + grain));
        // chipped areas near bottom rows (edge wear) handled via v coordinate: darker lower band
        const wear = clamp01((0.85 - y / s) * -2) * 0.3; col = col.map(v => v * (1 - wear * 0.5));
        h = a * 0.5 + b * 0.3 + c * 0.2 + patches * 0.25; r = 0.85 + (b - 0.5) * 0.2; break; }
      case 'stone': case 'flagstone': {
        const flag = spec.kind === 'flagstone';
        const cw = flag ? s / 3 : s / 4, ch = flag ? s / 3 : s / 7; const row = Math.floor(y / ch); const xo = (row % 2) * cw * 0.5 + valueNoise1(rng, row * 7) * cw * 0.3;
        const colI = Math.floor((x + xo) / cw); const jag = (valueNoise1(rng, colI * 13 + row * 3) - 0.5) * 0.08;
        const cx = ((x + xo) % cw) / cw + jag, cy = (y % ch) / ch;
        const edge = flag ? 0.035 : 0.05;
        const mortar = (cx < edge || cx > 1 - edge || cy < edge * 1.3 || cy > 1 - edge * 1.3) ? 1 : 0;
        const stoneVar = valueNoise1(rng, colI + row * 31);
        col = mix(base, tint2, stoneVar * 0.45 + (b - 0.5) * 0.25); col = col.map(v => clamp01(v + (c - 0.5) * 0.08 + (a - 0.5) * 0.1));
        if (mortar) col = col.map(v => v * (flag ? 0.82 : 0.72));
        h = mortar ? 0.3 : 0.6 + (b - 0.5) * 0.3 + c * 0.1; r = mortar ? 0.95 : 0.8 + (b - 0.5) * 0.15; break; }
      case 'wood': case 'timber': {
        const pw = spec.kind === 'timber' ? s / 3 : s / 8; const plank = Math.floor(x / pw); const px = (x % pw) / pw;
        const grain = Math.sin((y / s) * 60 + b * 14 + plank * 3) * 0.5 + 0.5;
        const pv = valueNoise1(rng, plank * 17 + 3);
        col = mix(base, tint2, pv * 0.5 + grain * 0.25 + (c - 0.5) * 0.15);
        const gap = px < 0.03 || px > 0.97; if (gap) col = col.map(v => v * 0.45);
        h = (gap ? 0.1 : 0.6) + grain * 0.2 + (b - 0.5) * 0.2; r = 0.7 + grain * 0.15; break; }
      case 'metal': {
        const rust = clamp01((a - 0.5) * 2.5) * clamp01((b - 0.35) * 2);
        col = mix(base, [0.36, 0.17, 0.08], rust); col = col.map(v => clamp01(v + (c - 0.5) * 0.06));
        h = 0.5 + (c - 0.5) * 0.1 + rust * 0.2; r = 0.45 + rust * 0.5; break; }
      case 'ribbed': {
        const rib = Math.abs(((x / s) * 14) % 1 - 0.5) * 2; const ribH = rib < 0.6 ? 1 : 0;
        const rust = clamp01((a - 0.55) * 3) * 0.8;
        col = mix(base, [0.33, 0.16, 0.08], rust); col = col.map(v => clamp01(v * (0.85 + ribH * 0.15) + (c - 0.5) * 0.05));
        h = ribH * 0.6 + (c - 0.5) * 0.05; r = 0.5 + rust * 0.45; break; }
      case 'sand': {
        const stones = c > 0.83 ? 1 : 0; const tracks = Math.sin((x / s) * 6 + a * 9) * 0.5 + 0.5;
        col = mix(base, tint2, a * 0.5 + tracks * 0.15); col = col.map(v => clamp01(v + (b - 0.5) * 0.08 - stones * 0.15));
        h = a * 0.3 + b * 0.2 + stones * 0.4 + c * 0.1; r = 0.92; break; }
      case 'asphalt': { const crack = c > 0.9 ? 1 : 0; col = mix(base, tint2, a * 0.4); col = col.map(v => clamp01(v + (b - 0.5) * 0.06 - crack * 0.2)); h = 0.5 + (b - 0.5) * 0.15 - crack * 0.4; r = 0.9; break; }
      case 'concrete': { col = mix(base, tint2, a * 0.35 + (b - 0.5) * 0.2); col = col.map(v => clamp01(v + (c - 0.5) * 0.05)); h = 0.5 + (b - 0.5) * 0.2; r = 0.85; break; }
      case 'crate': {
        const pw = s / 5; const px = (x % pw) / pw; const py = (y % (s / 5)) / (s / 5);
        const frame = (px < 0.06 || px > 0.94 || py < 0.06 || py > 0.94) ? 1 : 0; const grain = Math.sin((x / s) * 90 + b * 10) * 0.5 + 0.5;
        col = mix(base, tint2, grain * 0.35 + (a - 0.5) * 0.3); if (frame) col = col.map(v => v * 0.7);
        h = frame ? 0.85 : 0.5 + grain * 0.15; r = 0.8; break; }
      case 'canvas': { const weave = (Math.sin(x * 0.9) * Math.sin(y * 0.9)) * 0.5 + 0.5; col = mix(base, tint2, a * 0.3 + weave * 0.1); h = 0.5 + weave * 0.2; r = 0.9; break; }
      case 'tarp': { const fold = Math.sin((x / s) * 20 + a * 8) * 0.5 + 0.5; col = mix(base, tint2, fold * 0.4 + (b - 0.5) * 0.2); h = 0.5 + fold * 0.3; r = 0.75; break; }
    }
    img.data[i * 4] = col[0] * 255; img.data[i * 4 + 1] = col[1] * 255; img.data[i * 4 + 2] = col[2] * 255; img.data[i * 4 + 3] = 255;
    height[i] = h; rough[i] = clamp01(r);
  }
  ctx.putImageData(img, 0, 0);
  const set: TexSet = { map: toTexture(color, spec.repeat), normalMap: toTexture(heightToNormal(height, s, spec.kind === 'stone' || spec.kind === 'ribbed' || spec.kind === 'crate' ? 3.0 : 1.6), spec.repeat, false), roughnessMap: toTexture(grayCanvas(rough, s), spec.repeat, false) };
  cache.set(key, set); return set;
}
function valueNoise1(rng: Rng, k: number): number { void rng; let t = (k * 0x9e3779b1) >>> 0; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }

/** Simple text/sign canvas texture (original text only). */
export function textTexture(text: string, bg: string, fg: string, w = 512, h = 128, font = 'bold 56px "Segoe UI", Arial'): THREE.Texture {
  const c = document.createElement('canvas'); c.width = w; c.height = h; const ctx = c.getContext('2d')!;
  ctx.fillStyle = bg; ctx.fillRect(0, 0, w, h); ctx.strokeStyle = fg; ctx.lineWidth = 6; ctx.strokeRect(8, 8, w - 16, h - 16);
  ctx.fillStyle = fg; ctx.font = font; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(text, w / 2, h / 2);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
