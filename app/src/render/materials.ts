import * as THREE from 'three';
import type { MatKey } from '../data/map/layout';
import { getTexSet, type TexSpec } from './textures';

const SPECS: Record<MatKey, TexSpec> = {
  sand: { kind: 'sand', base: [0.77, 0.69, 0.53], tint2: [0.64, 0.55, 0.4], seed: 11, repeat: 6 },
  plasterWarm: { kind: 'plaster', base: [0.82, 0.73, 0.56], tint2: [0.7, 0.6, 0.44], seed: 21, repeat: 2 },
  plasterPale: { kind: 'plaster', base: [0.86, 0.82, 0.72], tint2: [0.7, 0.65, 0.55], seed: 22, repeat: 2 },
  flagstone: { kind: 'flagstone', base: [0.74, 0.68, 0.58], tint2: [0.6, 0.55, 0.46], seed: 32, repeat: 2 },
  stone: { kind: 'stone', base: [0.76, 0.7, 0.58], tint2: [0.62, 0.56, 0.46], seed: 31, repeat: 2 },
  woodOld: { kind: 'wood', base: [0.42, 0.3, 0.19], tint2: [0.26, 0.18, 0.11], seed: 41, repeat: 1 },
  timber: { kind: 'timber', base: [0.6, 0.45, 0.29], tint2: [0.42, 0.3, 0.18], seed: 42, repeat: 2 },
  metalRust: { kind: 'metal', base: [0.32, 0.3, 0.28], tint2: [0.4, 0.2, 0.1], seed: 51, repeat: 1 },
  metalBlue: { kind: 'ribbed', base: [0.16, 0.32, 0.55], tint2: [0.1, 0.2, 0.36], seed: 52, repeat: 1 },
  metalOlive: { kind: 'metal', base: [0.32, 0.36, 0.22], tint2: [0.2, 0.22, 0.12], seed: 53, repeat: 1 },
  metalGreen: { kind: 'metal', base: [0.2, 0.36, 0.28], tint2: [0.1, 0.2, 0.16], seed: 54, repeat: 1 },
  concrete: { kind: 'concrete', base: [0.62, 0.6, 0.56], tint2: [0.48, 0.46, 0.42], seed: 61, repeat: 3 },
  asphalt: { kind: 'asphalt', base: [0.36, 0.35, 0.33], tint2: [0.28, 0.27, 0.26], seed: 62, repeat: 6 },
  crate: { kind: 'crate', base: [0.6, 0.45, 0.28], tint2: [0.4, 0.28, 0.16], seed: 71, repeat: 1 },
  canvasRed: { kind: 'canvas', base: [0.62, 0.14, 0.1], tint2: [0.45, 0.1, 0.08], seed: 81, repeat: 2 },
  tarpOlive: { kind: 'tarp', base: [0.36, 0.38, 0.22], tint2: [0.24, 0.26, 0.14], seed: 82, repeat: 1 },
};
const cache = new Map<string, THREE.MeshStandardMaterial>();
export function getMaterial(key: MatKey, opts: { repeat?: number; flat?: boolean } = {}): THREE.MeshStandardMaterial {
  const k = key + '|' + (opts.repeat ?? '') + '|' + (opts.flat ? 'f' : '');
  const hit = cache.get(k); if (hit) return hit;
  const spec = { ...SPECS[key] }; if (opts.repeat) spec.repeat = opts.repeat;
  const tex = getTexSet(spec, opts.flat ? 256 : 512);
  const m = new THREE.MeshStandardMaterial({ map: tex.map, normalMap: tex.normalMap, roughnessMap: tex.roughnessMap, roughness: 1, metalness: key.startsWith('metal') ? 0.55 : 0.0, normalScale: new THREE.Vector2(0.8, 0.8) });
  cache.set(k, m); return m;
}
export function solid(color: string | number, roughness = 0.7, metalness = 0): THREE.MeshStandardMaterial { return new THREE.MeshStandardMaterial({ color, roughness, metalness }); }
