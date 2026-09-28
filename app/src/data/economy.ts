/**
 * Economy constants. SOURCE: gamemode_competitive.cfg (mp_startmoney 800, mp_maxmoney 16000, mp_starting_losses 1) and
 * community-documented cash award rules (see GAMEPLAY_SPEC.md §Economy). DEMO: showcase preset starts at $3000 so the
 * first buy of a first-to-four match is meaningful — clearly labelled in UI as a prototype setting.
 */
export interface EconomyDef {
  name: string; startMoney: number; maxMoney: number;
  winElimination: number; winTimeout: number; winDefuse: number; winExplode: number;
  lossBase: number; lossStep: number; lossMax: number; startingLosses: number;
  plantBonusOnLoss: number; // each T if bomb was planted and T lost
  survivorTimeoutLossBonus: number; // T survivors on a time-out loss (0 = no loss bonus)
  plantAwardTeam: number; // T team award for planting (300 each, source community rule)
  defuseAward: number;    // CT defuser bonus
}
export const ECONOMY_PRESETS: Record<'showcase' | 'standard', EconomyDef> = {
  showcase: {
    name: 'Showcase (demo)', startMoney: 3000, maxMoney: 16000,
    winElimination: 3250, winTimeout: 3250, winDefuse: 3500, winExplode: 3500,
    lossBase: 1400, lossStep: 500, lossMax: 3400, startingLosses: 1,
    plantBonusOnLoss: 800, survivorTimeoutLossBonus: 0, plantAwardTeam: 300, defuseAward: 300,
  },
  standard: {
    name: 'Standard ($800 start)', startMoney: 800, maxMoney: 16000,
    winElimination: 3250, winTimeout: 3250, winDefuse: 3500, winExplode: 3500,
    lossBase: 1400, lossStep: 500, lossMax: 3400, startingLosses: 1,
    plantBonusOnLoss: 800, survivorTimeoutLossBonus: 0, plantAwardTeam: 300, defuseAward: 300,
  },
};
export function lossBonus(e: EconomyDef, lossStreak: number): number {
  return Math.min(e.lossMax, e.lossBase + e.lossStep * Math.max(0, lossStreak));
}
