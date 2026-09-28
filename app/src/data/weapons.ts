/**
 * Weapon definitions.
 * SOURCE CONSTANTS: taken from CS2 `game/csgo/pak01_dir/scripts/weapons.vdata` (SteamDatabase/GameTracking-CS2,
 * commit 3fc98e7, 2026-09-25) — see app/research/GAMEPLAY_SPEC.md. Values that the vdata does not carry
 * (reload/draw/inspect durations are animation-driven in CS2) are DEMO values and are marked `demo:`.
 * Units: distances in Source units unless suffixed; times in seconds; speeds in units/second.
 */
export type WeaponSlot = 'primary' | 'secondary' | 'melee' | 'grenade' | 'bomb';
export type WeaponCategory = 'pistol' | 'rifle' | 'sniper' | 'knife' | 'grenade' | 'bomb';
export type Team = 'T' | 'CT';
export type GrenadeKind = 'he' | 'flash' | 'smoke' | 'molotov' | 'incendiary';

export interface WeaponDef {
  id: string; name: string; short: string;
  slot: WeaponSlot; category: WeaponCategory;
  team: Team | 'both';
  price: number; killAward: number;
  damage: number; armorRatio: number; penetration: number; headshotMultiplier: number;
  range: number; rangeModifier: number;
  cycleTime: number;            // seconds between shots
  fullAuto: boolean;
  magSize: number; reserveMags: number;   // CS2 2026 magazine-based reserve (vdata m_nPrimaryReserveAmmoMax = magazines)
  maxSpeed: number; maxSpeedAlt: number;  // units/s (alt = scoped for AWP)
  inaccuracyStand: number; inaccuracyCrouch: number; inaccuracyMove: number; inaccuracyFire: number; inaccuracyJump: number;
  inaccuracyStandAlt?: number; inaccuracyCrouchAlt?: number;
  spread: number; recoveryTimeStand: number; recoveryTimeCrouch: number;
  recoilMagnitude: number; recoilAngle: number; recoilMagnitudeVariance: number; recoilAngleVariance: number;
  zoomLevels: number; zoomFov1: number; zoomFov2: number; zoomTime: number; unzoomAfterShot: boolean;
  demo: { reloadTime: number; drawTime: number; inspectTime: number; rechamberTime?: number; ammoInsertAt: number };
  grenade?: GrenadeKind;
  hudIcon: string; // key into svg icon set
}

const base = { headshotMultiplier: 4.0, range: 8192, zoomLevels: 0, zoomFov1: 90, zoomFov2: 90, zoomTime: 0, unzoomAfterShot: false, inaccuracyJump: 0.1 };

export const WEAPONS: Record<string, WeaponDef> = {
  knife: {
    ...base, id: 'knife', name: 'Knife', short: 'KNIFE', slot: 'melee', category: 'knife', team: 'both', price: 0, killAward: 1500,
    damage: 40, armorRatio: 1.7, penetration: 1, range: 4096, rangeModifier: 1, cycleTime: 0.4, fullAuto: false, magSize: 0, reserveMags: 0,
    maxSpeed: 250, maxSpeedAlt: 250, inaccuracyStand: 0, inaccuracyCrouch: 0, inaccuracyMove: 0, inaccuracyFire: 0, spread: 0,
    recoveryTimeStand: 1, recoveryTimeCrouch: 1, recoilMagnitude: 0, recoilAngle: 0, recoilMagnitudeVariance: 0, recoilAngleVariance: 0,
    demo: { reloadTime: 0, drawTime: 0.6, inspectTime: 3.2, ammoInsertAt: 0 }, hudIcon: 'knife',
  },
  // Sidearms — source: weapon_glock_prefab / weapon_usp_silencer_prefab (m_nPrice 200, glock dmg 30, usp dmg 35)
  glock: {
    ...base, id: 'glock', name: 'Glock-18', short: 'GLOCK', slot: 'secondary', category: 'pistol', team: 'T', price: 200, killAward: 300,
    damage: 30, armorRatio: 0.94, penetration: 1, range: 4096, rangeModifier: 0.85, cycleTime: 0.15, fullAuto: false, magSize: 20, reserveMags: 3,
    maxSpeed: 240, maxSpeedAlt: 240, inaccuracyStand: 0.0056, inaccuracyCrouch: 0.0042, inaccuracyMove: 0.01, inaccuracyFire: 0.056, spread: 0.002,
    recoveryTimeStand: 0.2, recoveryTimeCrouch: 0.2, recoilMagnitude: 18, recoilAngle: 0, recoilMagnitudeVariance: 0, recoilAngleVariance: 0,
    demo: { reloadTime: 2.2, drawTime: 0.7, inspectTime: 2.8, ammoInsertAt: 0.62 }, hudIcon: 'pistol',
  },
  usp: {
    ...base, id: 'usp', name: 'USP-S', short: 'USP-S', slot: 'secondary', category: 'pistol', team: 'CT', price: 200, killAward: 300,
    damage: 35, armorRatio: 1.01, penetration: 1, range: 4096, rangeModifier: 0.91, cycleTime: 0.17, fullAuto: false, magSize: 12, reserveMags: 2,
    maxSpeed: 240, maxSpeedAlt: 240, inaccuracyStand: 0.0049, inaccuracyCrouch: 0.00368, inaccuracyMove: 0.01387, inaccuracyFire: 0.071, spread: 0.0025,
    recoveryTimeStand: 0.3495, recoveryTimeCrouch: 0.3495, recoilMagnitude: 29, recoilAngle: 0, recoilMagnitudeVariance: 0, recoilAngleVariance: 0,
    demo: { reloadTime: 2.17, drawTime: 0.7, inspectTime: 2.8, ammoInsertAt: 0.6 }, hudIcon: 'pistol',
  },
  // Rifles — source: weapon_ak47_prefab (2700, dmg 36, cycle 0.1, 30/3 mags), weapon_m4a1_prefab = M4A4 (2900, dmg 33, cycle 0.09, 30/4 mags)
  ak47: {
    ...base, id: 'ak47', name: 'AK-47', short: 'AK-47', slot: 'primary', category: 'rifle', team: 'T', price: 2700, killAward: 300,
    damage: 36, armorRatio: 1.55, penetration: 2, rangeModifier: 0.98, cycleTime: 0.1, fullAuto: true, magSize: 30, reserveMags: 3,
    maxSpeed: 215, maxSpeedAlt: 215, inaccuracyStand: 0.00641, inaccuracyCrouch: 0.00481, inaccuracyMove: 0.17506, inaccuracyFire: 0.0078, spread: 0.0006,
    recoveryTimeStand: 0.368, recoveryTimeCrouch: 0.30, recoilMagnitude: 30, recoilAngle: 0, recoilMagnitudeVariance: 0, recoilAngleVariance: 0,
    demo: { reloadTime: 2.43, drawTime: 1.0, inspectTime: 3.4, ammoInsertAt: 0.55 }, hudIcon: 'ak47',
  },
  m4a4: {
    ...base, id: 'm4a4', name: 'M4A4', short: 'M4A4', slot: 'primary', category: 'rifle', team: 'CT', price: 2900, killAward: 300,
    damage: 33, armorRatio: 1.4, penetration: 2, rangeModifier: 0.97, cycleTime: 0.09, fullAuto: true, magSize: 30, reserveMags: 4,
    maxSpeed: 225, maxSpeedAlt: 225, inaccuracyStand: 0.0049, inaccuracyCrouch: 0.0041, inaccuracyMove: 0.13788, inaccuracyFire: 0.007, spread: 0.0006,
    recoveryTimeStand: 0.3389, recoveryTimeCrouch: 0.28, recoilMagnitude: 23, recoilAngle: 0, recoilMagnitudeVariance: 0, recoilAngleVariance: 0,
    demo: { reloadTime: 3.07, drawTime: 1.0, inspectTime: 3.4, ammoInsertAt: 0.6 }, hudIcon: 'm4a4',
  },
  // Sniper — source: weapon_awp_prefab (4750, dmg 115, cycle 1.455, 5/2 mags, zoom 40/10, speed 200/100)
  awp: {
    ...base, id: 'awp', name: 'AWP', short: 'AWP', slot: 'primary', category: 'sniper', team: 'both', price: 4750, killAward: 100,
    damage: 115, armorRatio: 1.95, penetration: 2.5, rangeModifier: 0.99, cycleTime: 1.455, fullAuto: false, magSize: 5, reserveMags: 2,
    maxSpeed: 200, maxSpeedAlt: 100, inaccuracyStand: 0.0808, inaccuracyCrouch: 0.0606, inaccuracyStandAlt: 0.002, inaccuracyCrouchAlt: 0.0015,
    inaccuracyMove: 0.17648, inaccuracyFire: 0.05385, spread: 0.0002,
    recoveryTimeStand: 0.3454, recoveryTimeCrouch: 0.30, recoilMagnitude: 78, recoilAngle: 0, recoilMagnitudeVariance: 0, recoilAngleVariance: 0,
    zoomLevels: 2, zoomFov1: 40, zoomFov2: 10, zoomTime: 0.05, unzoomAfterShot: true,
    demo: { reloadTime: 3.67, drawTime: 1.25, inspectTime: 4.0, rechamberTime: 1.2, ammoInsertAt: 0.6 }, hudIcon: 'awp',
  },
  // Grenades — source prices: HE 300, flash 200, smoke 300, molotov 400 (T), incendiary 500 (CT); throw velocity 750 u/s
  he: { ...grenadeBase('he', 'HE Grenade', 'HE', 300, 'both', 'he') },
  flash: { ...grenadeBase('flash', 'Flashbang', 'FLASH', 200, 'both', 'flash') },
  smoke: { ...grenadeBase('smoke', 'Smoke Grenade', 'SMOKE', 300, 'both', 'smoke') },
  molotov: { ...grenadeBase('molotov', 'Molotov', 'MOLOTOV', 400, 'T', 'molotov') },
  incendiary: { ...grenadeBase('incendiary', 'Incendiary Grenade', 'INCEND.', 500, 'CT', 'incendiary') },
  c4: {
    ...base, id: 'c4', name: 'C4 Explosive', short: 'C4', slot: 'bomb', category: 'bomb', team: 'T', price: 0, killAward: 0,
    damage: 0, armorRatio: 1, penetration: 1, rangeModifier: 1, cycleTime: 0.5, fullAuto: false, magSize: 0, reserveMags: 0,
    maxSpeed: 250, maxSpeedAlt: 250, inaccuracyStand: 0, inaccuracyCrouch: 0, inaccuracyMove: 0, inaccuracyFire: 0, spread: 0,
    recoveryTimeStand: 1, recoveryTimeCrouch: 1, recoilMagnitude: 0, recoilAngle: 0, recoilMagnitudeVariance: 0, recoilAngleVariance: 0,
    demo: { reloadTime: 0, drawTime: 0.6, inspectTime: 0, ammoInsertAt: 0 }, hudIcon: 'c4',
  },
};

function grenadeBase(id: string, name: string, short: string, price: number, team: Team | 'both', kind: GrenadeKind): WeaponDef {
  return {
    ...base, id, name, short, slot: 'grenade', category: 'grenade', team, price, killAward: 300,
    damage: kind === 'he' ? 99 : 0, armorRatio: kind === 'he' ? 1.2 : 1, penetration: 1, rangeModifier: 0.99, range: 350,
    cycleTime: 0.5, fullAuto: false, magSize: 1, reserveMags: 0, maxSpeed: 245, maxSpeedAlt: 245,
    inaccuracyStand: 0, inaccuracyCrouch: 0, inaccuracyMove: 0, inaccuracyFire: 0, spread: 0,
    recoveryTimeStand: 1, recoveryTimeCrouch: 1, recoilMagnitude: 0, recoilAngle: 0, recoilMagnitudeVariance: 0, recoilAngleVariance: 0,
    demo: { reloadTime: 0, drawTime: 0.6, inspectTime: 0, ammoInsertAt: 0 }, grenade: kind, hudIcon: kind,
  };
}

export const EQUIPMENT = {
  kevlar: { id: 'kevlar', name: 'Kevlar Vest', price: 650 },           // source items_game.txt item_assaultsuit... kevlar 650
  helmet: { id: 'helmet', name: 'Kevlar + Helmet', price: 1000 },      // source 1000 (350 helmet-only upgrade when vest owned)
  helmetOnly: { id: 'helmetOnly', name: 'Helmet', price: 350 },
  defuser: { id: 'defuser', name: 'Defuse Kit', price: 400 },          // source item_defuser 400
} as const;

/** Buy menu layout following the CS2 five-column grid: Pistols / Heavy / SMGs / Rifles / Gear+Grenades. Only supported items are populated. */
export const BUY_GRID: { title: string; items: string[] }[] = [
  { title: 'Pistols', items: ['glock', 'usp'] },
  { title: 'Heavy', items: [] },
  { title: 'SMGs', items: [] },
  { title: 'Rifles', items: ['ak47', 'm4a4', 'awp'] },
  { title: 'Gear', items: ['kevlar', 'helmet', 'defuser'] },
  { title: 'Grenades', items: ['he', 'flash', 'smoke', 'molotov', 'incendiary'] },
];

export const HITGROUP_MULT = { head: 4.0, chest: 1.0, stomach: 1.25, arm: 1.0, leg: 0.75 } as const;
export type HitGroup = keyof typeof HITGROUP_MULT;

export function weaponForTeam(id: string, team: Team): WeaponDef {
  const w = WEAPONS[id];
  if (!w) throw new Error('unknown weapon ' + id);
  return w;
}
