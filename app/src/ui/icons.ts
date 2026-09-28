/** Original SVG silhouettes for HUD/killfeed/buy menu (viewBox 0 0 100 34). */
const P: Record<string, string> = {
  ak47: 'M2 14 h14 v-3 h6 v3 h30 l4 -4 h8 l2 2 h14 l2 3 h16 v3 h-10 l-2 3 h-10 v-3 h-20 l-4 8 h-6 l2 -8 h-14 v4 h-8 l-1 -4 h-8 l-6 6 h-9 z',
  m4a4: 'M2 15 h10 v-2 h4 v2 h22 v-5 h4 v5 h30 l2 -3 h12 l2 3 h8 v3 h-6 l-2 4 h-12 v-4 h-16 l-3 9 h-6 l1 -9 h-14 v3 h-8 l-1 -3 h-6 l-7 5 h-8 z',
  awp: 'M1 17 h16 v-2 h6 v2 h8 l4 -5 h14 l2 5 h34 l2 -2 h9 v4 h-9 l-2 -1 h-22 l-2 4 h-8 v-4 h-8 l-2 6 h-6 l1 -6 h-8 v4 h-7 v-4 h-5 l-6 6 h-6 z M30 11 h14 v-3 h-14 z',
  pistol: 'M30 10 h50 v8 h-30 l-2 3 h-5 l-4 10 h-12 l4 -10 h-3 z',
  knife: 'M6 18 l30 -8 h40 l-6 6 h-34 l-30 6 z M74 10 h20 v8 h-20 z',
  he: 'M40 6 h14 v6 h6 v18 h-26 v-18 h6 z M46 2 h8 v4 h-8 z',
  flash: 'M42 4 h12 v6 h4 v20 h-20 v-20 h4 z M44 12 h8 v4 h-8 z',
  smoke: 'M40 6 h16 v24 h-16 z M44 2 h8 v4 h-8 z',
  molotov: 'M42 8 h12 v22 h-12 z M45 2 h6 v6 h-6 z M40 18 h16 v6 h-16 z',
  incendiary: 'M40 8 h16 v22 h-16 z M46 3 h4 v5 h-4 z',
  c4: 'M30 8 h40 v20 h-40 z M34 12 h14 v6 h-14 z M52 12 h14 v12 h-14 z',
  kevlar: 'M34 4 h32 l4 10 v16 h-40 v-16 z', helmet: 'M50 4 a18 14 0 0 1 18 14 h4 v6 h-44 v-6 h4 a18 14 0 0 1 18 -14 z', defuser: 'M36 8 h28 v18 h-28 z M42 4 h16 v4 h-16 z M46 14 h8 v6 h-8 z',
  dead: 'M50 4 a12 12 0 0 1 12 12 v6 h-24 v-6 a12 12 0 0 1 12 -12 z M42 24 h16 v6 h-16 z', head: 'M50 4 a14 14 0 1 0 0.1 0 z M40 30 h20 v3 h-20 z',
};
export function icon(id: string, color = 'currentColor'): string { const d = P[id] ?? P.pistol; return `<svg viewBox="0 0 100 34" preserveAspectRatio="xMidYMid meet"><path d="${d}" fill="${color}"/></svg>`; }
export function iconFor(weaponId: string): string { if (weaponId === 'usp' || weaponId === 'glock') return icon('pistol'); if (P[weaponId]) return icon(weaponId); return icon('pistol'); }
