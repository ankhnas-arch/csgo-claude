/**
 * Compact Dust II-inspired layout (ORIGINAL, COMPRESSED). Not a surveyed replica: official topology is not proven by the
 * reference pack. Relationships preserved: T spawn (elevated) -> Long doors -> Long A + pit -> A ramp/site; T -> mid (ramp) ->
 * Xbox -> mid doors -> CT mid -> CT spawn; mid -> catwalk (stairs) -> short -> A; CT -> CT ramp -> A; T -> outside tunnels ->
 * upper tunnels -> B tunnel arch -> B site; mid <-> lower tunnels <-> upper tunnels; CT -> B doors corridor -> B.
 * Coordinates in metres; +x east, +z south (north is -z). y is floor height.
 */
export type MatKey = 'sand' | 'plasterWarm' | 'plasterPale' | 'stone' | 'flagstone' | 'woodOld' | 'metalRust' | 'metalBlue' | 'metalOlive' | 'concrete' | 'asphalt' | 'timber' | 'crate' | 'canvasRed' | 'tarpOlive' | 'metalGreen';
export interface Rect {
  id: string; name: string; x0: number; x1: number; z0: number; z1: number; y: number;
  /** ramp: floor rises from y at the 'from' edge to yEnd at the opposite edge */
  ramp?: { axis: 'x' | 'z'; from: 'min' | 'max'; yEnd: number };
  ceiling?: number;        // covered corridor height (creates a roof)
  wallHeight?: number;     // default 5.5
  floor?: MatKey; wall?: MatKey;
  region: 'T' | 'CT' | 'A' | 'B' | 'mid' | 'long' | 'tunnels' | 'short';
  radar?: string;          // callout label shown on radar
}
export interface Prop {
  kind: 'box' | 'barrel' | 'container' | 'lowwall' | 'truck' | 'doorleaf' | 'arch' | 'awning' | 'sign' | 'lamp' | 'palm' | 'cable' | 'shutter' | 'timberframe' | 'stairs' | 'sandbag' | 'window' | 'dish' | 'curb';
  x: number; y: number; z: number; sx: number; sy: number; sz: number; rotY?: number; mat?: MatKey; collide?: boolean; label?: string; color?: string;
}
export interface SiteDef { id: 'A' | 'B'; x0: number; x1: number; z0: number; z1: number; y: number; plantY?: number; }
export interface SpawnDef { x: number; z: number; yaw: number; }
export interface CameraDef { id: string; ref: string; pos: [number, number, number]; look: [number, number, number]; fov: number; note: string; }

const H = 5.5;
export const RECTS: Rect[] = [
  // ---- T side (elevated spawn plateau at y=2)
  { id: 'tspawn', name: 'T Spawn', x0: -12, x1: 12, z0: 38, z1: 52, y: 2, wallHeight: 4.8, region: 'T', floor: 'sand', wall: 'plasterWarm', radar: 'T SPAWN' },
  { id: 'tramp_mid', name: 'T ramp to mid', x0: -8, x1: 8, z0: 28, z1: 38, y: 2, ramp: { axis: 'z', from: 'max', yEnd: 0 }, region: 'T', floor: 'sand', wall: 'plasterWarm' },
  { id: 'tramp_long', name: 'Outside Long ramp', x0: 12, x1: 18, z0: 38, z1: 48, y: 2, ramp: { axis: 'x', from: 'min', yEnd: 0 }, region: 'long', floor: 'sand', wall: 'plasterWarm' },
  { id: 'out_long', name: 'Outside Long', x0: 18, x1: 28, z0: 36, z1: 48, y: 0, region: 'long', floor: 'sand', wall: 'plasterWarm', radar: 'OUTSIDE LONG' },
  { id: 'long_doors', name: 'Long Doors', x0: 28, x1: 33, z0: 39, z1: 45, y: 0, ceiling: 4.2, region: 'long', floor: 'flagstone', wall: 'plasterPale', radar: 'LONG DOORS' },
  { id: 'long', name: 'Long A', x0: 33, x1: 43, z0: -14, z1: 46, y: 0, wallHeight: 6.5, region: 'long', floor: 'sand', wall: 'plasterWarm', radar: 'LONG' },
  { id: 'pit_slope', name: 'Pit slope', x0: 43, x1: 46, z0: -8, z1: 0, y: 0, ramp: { axis: 'x', from: 'min', yEnd: -1.6 }, region: 'long', floor: 'sand', wall: 'plasterWarm' },
  { id: 'pit', name: 'Pit', x0: 46, x1: 52, z0: -10, z1: 2, y: -1.6, region: 'long', floor: 'sand', wall: 'plasterWarm', radar: 'PIT' },
  { id: 'long_corner', name: 'Long corner', x0: 33, x1: 43, z0: -22, z1: -14, y: 0, region: 'long', floor: 'sand', wall: 'plasterWarm' },
  { id: 'a_ramp', name: 'A Long ramp', x0: 33, x1: 43, z0: -30, z1: -22, y: 0, ramp: { axis: 'z', from: 'max', yEnd: 2 }, region: 'A', floor: 'sand', wall: 'plasterWarm', radar: 'A RAMP' },
  // ---- A site (elevated y=2)
  { id: 'a_site', name: 'A Site', x0: 22, x1: 43, z0: -46, z1: -30, y: 2, wallHeight: 6.0, region: 'A', floor: 'sand', wall: 'plasterWarm', radar: 'A SITE' },
  { id: 'a_short_entry', name: 'Short to A', x0: 22, x1: 30, z0: -30, z1: -22, y: 2, region: 'short', floor: 'flagstone', wall: 'plasterWarm' },
  { id: 'short', name: 'A Short', x0: 16, x1: 22, z0: -30, z1: -12, y: 2, region: 'short', floor: 'flagstone', wall: 'plasterPale', radar: 'SHORT' },
  { id: 'catwalk_stairs', name: 'Catwalk stairs', x0: 8, x1: 16, z0: -18, z1: -12, y: 0, ramp: { axis: 'x', from: 'min', yEnd: 2 }, region: 'short', floor: 'flagstone', wall: 'plasterPale', radar: 'CATWALK' },
  { id: 'ct_ramp', name: 'CT ramp', x0: 14, x1: 22, z0: -46, z1: -38, y: 0, ramp: { axis: 'x', from: 'min', yEnd: 2 }, ceiling: 4.6, region: 'CT', floor: 'flagstone', wall: 'plasterWarm', radar: 'CT RAMP' },
  // ---- Mid
  { id: 'mid', name: 'Mid', x0: -8, x1: 8, z0: -24, z1: 28, y: 0, wallHeight: 6.2, region: 'mid', floor: 'sand', wall: 'plasterWarm', radar: 'MID' },
  { id: 'mid_doors', name: 'Mid Doors', x0: -5, x1: 5, z0: -30, z1: -24, y: 0, ceiling: 4.4, region: 'mid', floor: 'flagstone', wall: 'plasterPale', radar: 'DOORS' },
  { id: 'ct_mid', name: 'CT Mid', x0: -8, x1: 8, z0: -38, z1: -30, y: 0, region: 'CT', floor: 'sand', wall: 'plasterWarm', radar: 'CT MID' },
  { id: 'ctspawn', name: 'CT Spawn', x0: -8, x1: 14, z0: -54, z1: -38, y: 0, wallHeight: 5.0, region: 'CT', floor: 'asphalt', wall: 'plasterWarm', radar: 'CT SPAWN' },
  // ---- B side
  { id: 'b_doors_corr', name: 'B Doors corridor', x0: -26, x1: -8, z0: -46, z1: -40, y: 0, ceiling: 4.4, region: 'B', floor: 'flagstone', wall: 'plasterPale', radar: 'B DOORS' },
  { id: 'b_site', name: 'B Site', x0: -46, x1: -26, z0: -41, z1: -26, y: 0, wallHeight: 6.4, region: 'B', floor: 'sand', wall: 'plasterWarm', radar: 'B SITE' },
  { id: 'b_back', name: 'B back', x0: -35, x1: -26, z0: -48, z1: -41, y: 0, wallHeight: 6.4, region: 'B', floor: 'sand', wall: 'plasterWarm' },
  { id: 'b_stairs', name: 'B platform stairs', x0: -38, x1: -35, z0: -48, z1: -41, y: 0, ramp: { axis: 'x', from: 'max', yEnd: 1.0 }, wallHeight: 6.4, region: 'B', floor: 'flagstone', wall: 'plasterWarm' },
  { id: 'b_plat', name: 'B platform', x0: -46, x1: -38, z0: -48, z1: -41, y: 1.0, wallHeight: 5.4, region: 'B', floor: 'concrete', wall: 'plasterWarm', radar: 'B PLAT' },
  { id: 'b_arch', name: 'B tunnel arch', x0: -40, x1: -32, z0: -26, z1: -20, y: 0, ceiling: 4.0, region: 'tunnels', floor: 'flagstone', wall: 'plasterPale' },
  { id: 'upper_tun', name: 'Upper Tunnels', x0: -40, x1: -32, z0: -20, z1: 30, y: 0, ceiling: 4.2, region: 'tunnels', floor: 'flagstone', wall: 'plasterPale', radar: 'UPPER TUNNELS' },
  { id: 'out_tun', name: 'Outside Tunnels', x0: -40, x1: -18, z0: 30, z1: 48, y: 0, region: 'tunnels', floor: 'sand', wall: 'plasterWarm', radar: 'OUTSIDE TUNNELS' },
  { id: 'tramp_tun', name: 'T ramp to tunnels', x0: -18, x1: -12, z0: 38, z1: 48, y: 2, ramp: { axis: 'x', from: 'max', yEnd: 0 }, region: 'tunnels', floor: 'sand', wall: 'plasterWarm' },
  { id: 'lower_stairs_w', name: 'Lower tunnel stairs (west)', x0: -32, x1: -28, z0: -3, z1: 3, y: 0, ramp: { axis: 'x', from: 'min', yEnd: -1.2 }, ceiling: 3.8, region: 'tunnels', floor: 'flagstone', wall: 'plasterPale' },
  { id: 'lower_tun', name: 'Lower Tunnels', x0: -28, x1: -12, z0: -3, z1: 3, y: -1.2, ceiling: 3.6, region: 'tunnels', floor: 'flagstone', wall: 'plasterPale', radar: 'LOWER TUNNELS' },
  { id: 'lower_stairs_e', name: 'Lower tunnel stairs (east)', x0: -12, x1: -8, z0: -3, z1: 3, y: -1.2, ramp: { axis: 'x', from: 'min', yEnd: 0 }, ceiling: 3.8, region: 'tunnels', floor: 'flagstone', wall: 'plasterPale' },
];

export const SITES: SiteDef[] = [
  { id: 'A', x0: 26, x1: 41, z0: -44, z1: -32, y: 2 },
  { id: 'B', x0: -44, x1: -28, z0: -46, z1: -30, y: 0 },
];
export const SPAWNS: Record<'T' | 'CT', SpawnDef[]> = {
  T: [{ x: 0, z: 46, yaw: 0 }, { x: -5, z: 48, yaw: 0 }, { x: 5, z: 48, yaw: 0 }, { x: -8, z: 44, yaw: 0 }, { x: 8, z: 44, yaw: 0 }],
  CT: [{ x: 3, z: -48, yaw: Math.PI }, { x: -3, z: -50, yaw: Math.PI }, { x: 9, z: -50, yaw: Math.PI }, { x: 0, z: -44, yaw: Math.PI }, { x: 10, z: -44, yaw: Math.PI }],
};
/** yaw convention: 0 = facing north (-z). */

export const PROPS: Prop[] = [
  // ---- Mid: Xbox crate and side dressing
  { kind: 'box', x: 0, y: 0, z: 2, sx: 2.6, sy: 1.6, sz: 2.6, mat: 'crate', collide: true, label: 'Xbox' },
  { kind: 'box', x: -6.5, y: 0, z: 14, sx: 1.6, sy: 1.2, sz: 1.6, mat: 'crate', collide: true },
  { kind: 'barrel', x: 6.8, y: 0, z: -6, sx: 0.8, sy: 1.1, sz: 0.8, mat: 'metalRust', collide: true },
  { kind: 'barrel', x: 6.2, y: 0, z: -7, sx: 0.8, sy: 1.1, sz: 0.8, mat: 'metalRust', collide: true },
  // Mid doors: thick plank double doors, open (leaves against the jambs)
  { kind: 'doorleaf', x: -3.6, y: 0, z: -25.2, sx: 2.2, sy: 3.4, sz: 0.24, rotY: 1.35, mat: 'woodOld', collide: true },
  { kind: 'doorleaf', x: 3.6, y: 0, z: -25.2, sx: 2.2, sy: 3.4, sz: 0.24, rotY: -1.35, mat: 'woodOld', collide: true },
  { kind: 'lamp', x: -5.2, y: 3.6, z: -23, sx: 0.4, sy: 0.6, sz: 0.4 },
  // CT mid: blue pickup truck (CS11 view), palm, low curbs
  { kind: 'truck', x: 4.5, y: 0, z: -35, sx: 2.2, sy: 2.0, sz: 5.0, rotY: 0.35, color: '#5f8fb4', collide: true },
  { kind: 'palm', x: -7, y: 0, z: -41, sx: 1, sy: 7, sz: 1 },
  { kind: 'box', x: -6, y: 0, z: -34, sx: 1.4, sy: 1.0, sz: 1.4, mat: 'crate', collide: true },
  // CT spawn
  { kind: 'box', x: 12, y: 0, z: -52, sx: 1.6, sy: 1.2, sz: 1.6, mat: 'crate', collide: true },
  { kind: 'box', x: -6, y: 0, z: -52, sx: 2.0, sy: 1.2, sz: 1.6, mat: 'crate', collide: true },
  { kind: 'barrel', x: -7, y: 0, z: -48, sx: 0.8, sy: 1.1, sz: 0.8, mat: 'metalRust', collide: true },
  { kind: 'dish', x: 13.5, y: 5.2, z: -46, sx: 1.2, sy: 1.2, sz: 0.4 },
  // CT ramp: timber frame + stacked crates at top/bottom
  { kind: 'timberframe', x: 18, y: 0, z: -42, sx: 8, sy: 4.6, sz: 8 },
  { kind: 'box', x: 20.5, y: 2, z: -45, sx: 1.6, sy: 1.6, sz: 1.6, mat: 'crate', collide: true },
  { kind: 'box', x: 20.5, y: 3.6, z: -45, sx: 1.2, sy: 1.2, sz: 1.2, mat: 'crate', collide: true },
  { kind: 'box', x: 15, y: 0, z: -39, sx: 1.4, sy: 1.4, sz: 1.4, mat: 'crate', collide: true },
  // A site: default plant crates, stacked boxes, sandbags
  { kind: 'box', x: 34, y: 2, z: -38, sx: 2.4, sy: 1.5, sz: 2.4, mat: 'crate', collide: true, label: 'A default' },
  { kind: 'box', x: 36.6, y: 2, z: -38, sx: 1.4, sy: 0.9, sz: 1.4, mat: 'crate', collide: true },
  { kind: 'box', x: 40, y: 2, z: -44, sx: 2.0, sy: 2.2, sz: 2.0, mat: 'crate', collide: true, label: 'A ninja' },
  { kind: 'box', x: 40, y: 4.2, z: -44, sx: 1.5, sy: 1.5, sz: 1.5, mat: 'crate', collide: true },
  { kind: 'box', x: 25, y: 2, z: -44, sx: 2.2, sy: 1.6, sz: 1.6, mat: 'crate', collide: true, label: 'Goose' },
  { kind: 'sandbag', x: 30, y: 2, z: -31, sx: 3.0, sy: 1.0, sz: 0.9, rotY: 0.2, collide: true },
  { kind: 'barrel', x: 23, y: 2, z: -33, sx: 0.8, sy: 1.1, sz: 0.8, mat: 'metalOlive', collide: true },
  { kind: 'box', x: 28, y: 2, z: -45, sx: 1.2, sy: 0.8, sz: 1.2, mat: 'tarpOlive', collide: true },
  { kind: 'cable', x: 32, y: 5.6, z: -38, sx: 20, sy: 0.05, sz: 0.05 },
  { kind: 'lamp', x: 42.6, y: 4.0, z: -40, sx: 0.4, sy: 0.6, sz: 0.4 },
  { kind: 'barrel', x: 41.5, y: 2, z: -32, sx: 0.8, sy: 1.1, sz: 0.8, mat: 'metalRust', collide: true },
  // Short
  { kind: 'box', x: 18, y: 2, z: -22, sx: 1.4, sy: 1.2, sz: 1.4, mat: 'crate', collide: true },
  { kind: 'lamp', x: 21.6, y: 3.4, z: -16, sx: 0.4, sy: 0.6, sz: 0.4 },
  // Long: blue ribbed container near doors, red canopy, shopfront shutters, barrels, cables
  { kind: 'container', x: 38.4, y: 0, z: 32, sx: 2.6, sy: 2.7, sz: 6.4, rotY: 0.06, mat: 'metalBlue', collide: true, label: 'Long container' },
  { kind: 'awning', x: 42.4, y: 3.2, z: 22, sx: 1.6, sy: 0.3, sz: 5, mat: 'canvasRed' },
  { kind: 'shutter', x: 42.9, y: 0, z: 22, sx: 0.2, sy: 2.6, sz: 2.4, color: '#3e6f6a' },
  { kind: 'shutter', x: 42.9, y: 0, z: 12, sx: 0.2, sy: 2.6, sz: 2.4, color: '#8c4e3a' },
  { kind: 'sign', x: 42.8, y: 3.6, z: 12, sx: 0.1, sy: 0.8, sz: 3.0, label: 'BAKERY · فرن' },
  { kind: 'sign', x: 42.8, y: 3.7, z: 22, sx: 0.1, sy: 0.8, sz: 3.0, label: 'DUST MOTORS' },
  { kind: 'awning', x: 33.6, y: 3.0, z: -2, sx: 1.4, sy: 0.3, sz: 4, mat: 'canvasRed' },
  { kind: 'shutter', x: 33.1, y: 0, z: -2, sx: 0.2, sy: 2.6, sz: 2.4, color: '#2f5a8a' },
  { kind: 'sign', x: 33.2, y: 3.5, z: -2, sx: 0.1, sy: 0.7, sz: 2.6, label: 'TEA · شاي' },
  { kind: 'cable', x: 38, y: 5.4, z: 34, sx: 10, sy: 0.05, sz: 0.05 },
  { kind: 'dish', x: 42.6, y: 5.8, z: 30, sx: 1.0, sy: 1.0, sz: 0.4 },
  { kind: 'cable', x: 38, y: 5.2, z: 18, sx: 10, sy: 0.05, sz: 0.05 },
  { kind: 'cable', x: 38, y: 5.5, z: 4, sx: 10, sy: 0.05, sz: 0.05 },
  { kind: 'barrel', x: 33.8, y: 0, z: 8, sx: 0.8, sy: 1.1, sz: 0.8, mat: 'metalRust', collide: true },
  { kind: 'barrel', x: 34.6, y: 0, z: 7.4, sx: 0.8, sy: 1.1, sz: 0.8, mat: 'metalRust', collide: true },
  { kind: 'box', x: 41.5, y: 0, z: -18, sx: 1.6, sy: 1.2, sz: 1.6, mat: 'crate', collide: true, label: 'Long corner' },
  { kind: 'curb', x: 33.2, y: 0, z: 20, sx: 0.4, sy: 0.18, sz: 20 },
  // Outside long
  { kind: 'box', x: 24, y: 0, z: 46, sx: 1.8, sy: 1.4, sz: 1.8, mat: 'crate', collide: true },
  { kind: 'barrel', x: 19, y: 0, z: 37, sx: 0.8, sy: 1.1, sz: 0.8, mat: 'metalGreen', collide: true },
  { kind: 'sign', x: 27.9, y: 4.4, z: 42, sx: 0.1, sy: 0.7, sz: 2.4, label: 'LONG DOORS' },
  { kind: 'window', x: 18.1, y: 2.4, z: 40, sx: 0.1, sy: 1.4, sz: 1.2 },
  // Pit
  { kind: 'box', x: 49, y: -1.6, z: -8, sx: 1.6, sy: 1.2, sz: 1.6, mat: 'crate', collide: true },
  // T spawn: crates, truck-less; shutters and cable
  { kind: 'box', x: -9, y: 2, z: 50, sx: 1.8, sy: 1.4, sz: 1.8, mat: 'crate', collide: true },
  { kind: 'barrel', x: 10, y: 2, z: 51, sx: 0.8, sy: 1.1, sz: 0.8, mat: 'metalRust', collide: true },
  { kind: 'palm', x: 10, y: 2, z: 40, sx: 1, sy: 6, sz: 1 },
  { kind: 'cable', x: 0, y: 6.4, z: 45, sx: 22, sy: 0.05, sz: 0.05 },
  { kind: 'truck', x: -7, y: 2, z: 41, sx: 2.2, sy: 2.0, sz: 5.0, rotY: 1.2, color: '#b8b0a0', collide: true },
  // Outside tunnels
  { kind: 'box', x: -28, y: 0, z: 45, sx: 2.2, sy: 1.6, sz: 2.2, mat: 'crate', collide: true },
  { kind: 'lamp', x: -31.6, y: 3.4, z: 34, sx: 0.4, sy: 0.6, sz: 0.4 },
  // Upper tunnels dressing
  { kind: 'box', x: -33.5, y: 0, z: 10, sx: 1.4, sy: 1.1, sz: 1.4, mat: 'crate', collide: true },
  { kind: 'barrel', x: -38.8, y: 0, z: -12, sx: 0.8, sy: 1.1, sz: 0.8, mat: 'metalRust', collide: true },
  { kind: 'lamp', x: -39.6, y: 3.2, z: 0, sx: 0.4, sy: 0.6, sz: 0.4 },
  // B site (CS08): stepped crates on platform, low wall, barrels, olive tarps, pointed arch handled by rect ceiling + arch prop
  { kind: 'arch', x: -36, y: 0, z: -26, sx: 8, sy: 4.4, sz: 1.0 },
  { kind: 'lowwall', x: -34, y: 0, z: -36, sx: 6, sy: 1.0, sz: 0.5, mat: 'plasterPale', collide: true, label: 'B low wall' },
  { kind: 'box', x: -43.5, y: 1.0, z: -45.5, sx: 2.4, sy: 1.3, sz: 2.4, mat: 'crate', collide: true, label: 'B platform' },
  { kind: 'box', x: -43.5, y: 2.3, z: -45.5, sx: 1.8, sy: 1.1, sz: 1.8, mat: 'crate', collide: true },
  { kind: 'box', x: -40.5, y: 1.0, z: -45.8, sx: 1.8, sy: 0.9, sz: 1.8, mat: 'crate', collide: true },
  { kind: 'box', x: -30, y: 0, z: -30, sx: 2.2, sy: 1.5, sz: 2.2, mat: 'crate', collide: true, label: 'B default' },
  { kind: 'box', x: -30, y: 0, z: -44, sx: 1.6, sy: 1.2, sz: 1.6, mat: 'tarpOlive', collide: true },
  { kind: 'box', x: -28, y: 0, z: -44, sx: 1.4, sy: 0.9, sz: 1.4, mat: 'tarpOlive', collide: true },
  { kind: 'barrel', x: -44.6, y: 0, z: -30, sx: 0.8, sy: 1.1, sz: 0.8, mat: 'metalRust', collide: true },
  { kind: 'barrel', x: -43.7, y: 0, z: -29.2, sx: 0.8, sy: 1.1, sz: 0.8, mat: 'metalRust', collide: true },
  { kind: 'barrel', x: -44.4, y: 0, z: -37, sx: 0.8, sy: 1.1, sz: 0.8, mat: 'metalGreen', collide: true },
  { kind: 'window', x: -45.9, y: 2.4, z: -40, sx: 0.1, sy: 1.4, sz: 1.2, label: 'B window' },
  { kind: 'lamp', x: -26.4, y: 3.4, z: -38, sx: 0.4, sy: 0.6, sz: 0.4 },
  // B doors corridor: doors (open leaves)
  { kind: 'doorleaf', x: -25.2, y: 0, z: -44.9, sx: 2.0, sy: 3.2, sz: 0.2, rotY: 0.3, mat: 'woodOld', collide: true },
];

export const CAMERAS: CameraDef[] = [
  { id: 'cam_b_platform', ref: 'CS08', pos: [-36, 1.65, -22], look: [-40, 1.2, -44], fov: 80, note: 'From B tunnel arch toward B platform stepped crates, low wall and barrels; dome visible above far wall.' },
  { id: 'cam_long_container', ref: 'CS09', pos: [30.5, 1.65, 43], look: [39, 1.5, 22], fov: 80, note: 'From Long Doors toward blue ribbed container, red canopy and shuttered shopfront with overhead cables.' },
  { id: 'cam_ct_ramp', ref: 'CS10', pos: [13.5, 1.65, -41.5], look: [22, 2.6, -42.5], fov: 80, note: 'From CT spawn up the timber-framed CT ramp with stacked crates.' },
  { id: 'cam_mid_doors', ref: 'CS11', pos: [1.2, 1.65, -24.6], look: [3.5, 1.4, -38], fov: 78, note: 'From inside mid doors (open plank leaf with ring handle at right) toward CT mid with blue pickup and palm.' },
];

export interface BackdropBuilding { x: number; z: number; sx: number; sz: number; h: number; mat: MatKey; dome?: boolean; minaret?: boolean }
/** Distant buildings ring beyond the playable boundary (eliminates empty voids). */
export const BACKDROP: BackdropBuilding[] = [
  { x: -60, z: -60, sx: 18, sz: 16, h: 9, mat: 'plasterWarm', dome: true },
  { x: -40, z: -66, sx: 14, sz: 12, h: 12, mat: 'plasterPale' },
  { x: -20, z: -70, sx: 22, sz: 14, h: 8, mat: 'plasterWarm', minaret: true },
  { x: 10, z: -70, sx: 24, sz: 14, h: 10, mat: 'plasterPale' },
  { x: 40, z: -66, sx: 16, sz: 12, h: 13, mat: 'plasterWarm' },
  { x: 62, z: -50, sx: 14, sz: 18, h: 9, mat: 'plasterPale' },
  { x: 64, z: -20, sx: 14, sz: 20, h: 11, mat: 'plasterWarm', dome: true },
  { x: 64, z: 10, sx: 14, sz: 18, h: 8, mat: 'plasterPale' },
  { x: 62, z: 40, sx: 16, sz: 16, h: 12, mat: 'plasterWarm' },
  { x: 40, z: 64, sx: 20, sz: 14, h: 9, mat: 'plasterPale' },
  { x: 10, z: 68, sx: 24, sz: 14, h: 11, mat: 'plasterWarm', minaret: true },
  { x: -20, z: 66, sx: 20, sz: 14, h: 8, mat: 'plasterPale' },
  { x: -46, z: 62, sx: 16, sz: 14, h: 10, mat: 'plasterWarm' },
  { x: -62, z: 40, sx: 14, sz: 18, h: 9, mat: 'plasterPale' },
  { x: -64, z: 10, sx: 14, sz: 20, h: 12, mat: 'plasterWarm' },
  { x: -62, z: -22, sx: 14, sz: 18, h: 8, mat: 'plasterPale', dome: true },
  // inner fillers between corridors (visible over walls)
  { x: -20, z: -20, sx: 10, sz: 12, h: 8, mat: 'plasterWarm' },
  { x: 20, z: 10, sx: 10, sz: 16, h: 9, mat: 'plasterPale' },
  { x: -22, z: 18, sx: 8, sz: 8, h: 7, mat: 'plasterWarm' },
  { x: 26, z: -6, sx: 8, sz: 8, h: 7, mat: 'plasterPale' },
  { x: 28, z: 24, sx: 6, sz: 6, h: 8, mat: 'plasterWarm' },
  { x: -18, z: -12, sx: 6, sz: 6, h: 6, mat: 'plasterPale' },
];

export const SUN_DIR: [number, number, number] = [-0.45, 0.8, 0.35]; // warm sun from upper south-west-ish, casting cooler shadows NE
export const MAP_BOUNDS = { x0: -56, x1: 56, z0: -58, z1: 56 };

/** Floor height at a point, or null if outside walkable rects. */
export function floorYAt(x: number, z: number): { y: number; rect: Rect } | null {
  for (const r of RECTS) {
    if (x >= r.x0 && x <= r.x1 && z >= r.z0 && z <= r.z1) return { y: rectFloorY(r, x, z), rect: r };
  }
  return null;
}
export function rectFloorY(r: Rect, x: number, z: number): number {
  if (!r.ramp) return r.y;
  const { axis, from, yEnd } = r.ramp;
  const a0 = axis === 'x' ? r.x0 : r.z0, a1 = axis === 'x' ? r.x1 : r.z1;
  const v = axis === 'x' ? x : z;
  let t = (v - a0) / (a1 - a0);
  if (from === 'max') t = 1 - t;
  t = Math.min(1, Math.max(0, t));
  return r.y + (yEnd - r.y) * t;
}
export function rectById(id: string): Rect { const r = RECTS.find(r => r.id === id); if (!r) throw new Error('rect ' + id); return r; }
