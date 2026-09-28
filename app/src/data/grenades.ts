/**
 * Grenade behaviour constants. SOURCE: HE m_nDamage 99, m_flRange 350 u, armor ratio 1.2, throw velocity 750 u/s (weapons.vdata).
 * Community (version-sensitive): smoke ~18 s, fire ~7 s, flash up to ~3-4.5 s. DEMO fields are labelled.
 */
export const GRENADES = {
  throwSpeed: 750,          // u/s source
  fuse: { he: 1.6, flash: 1.5, smoke: 1.4, fire: 0 },    // demo: HE/flash/smoke fuse seconds; molotov ignites on impact
  he: { damage: 99, radius: 350, armorRatio: 1.2, coverAttenuation: 0.35 },
  flash: { maxDuration: 4.5, radius: 1500, fullAngleDeg: 53, sideDuration: 1.5, behindDuration: 0.6, occludedFactor: 0.15 },
  smoke: { duration: 18, radius: 3.0, growTime: 1.2, fadeTime: 1.0 },  // radius metres (demo approximation of the CS2 volumetric ~ 288 u wide)
  fire: { duration: 7, radius: 2.6, dps: 40, rampTime: 1.0, growTime: 0.9 },
};
