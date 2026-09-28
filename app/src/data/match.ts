/**
 * Match pacing. SOURCE values (competitive): freeze 15 s, round 1:55 (115 s), C4 40 s, plant 3.2 s, defuse 10 s / 5 s with kit,
 * win-panel 3 s, MR12 (24 rounds), halftime after 12. DEMO values below are deliberately shortened for a YouTube showcase and
 * are labelled "shortened prototype rules" in the UI. Never present demo values as official.
 */
export interface MatchRules {
  name: string;
  freezeTime: number; roundTime: number; bombTime: number; resultTime: number;
  plantTime: number; defuseTime: number; defuseTimeKit: number;
  roundsToWin: number; switchAfterRounds: number;
  bombPickupRadius: number; // m
}
export const SOURCE_COMPETITIVE: MatchRules = {
  name: 'Source competitive (reference only)', freezeTime: 15, roundTime: 115, bombTime: 40, resultTime: 3,
  plantTime: 3.2, defuseTime: 10, defuseTimeKit: 5, roundsToWin: 13, switchAfterRounds: 12, bombPickupRadius: 1.2,
};
export const DEMO_RULES: MatchRules = {
  name: 'Shortened prototype rules', freezeTime: 12, roundTime: 90, bombTime: 35, resultTime: 5,
  plantTime: 3.2, defuseTime: 10, defuseTimeKit: 5, roundsToWin: 4, switchAfterRounds: 3, bombPickupRadius: 1.2,
};
export type BotDifficulty = 'easy' | 'hard';
export interface BotProfile {
  reactionTime: number; aimErrorDeg: number; aimTrackSpeed: number; burstLength: number; memorySeconds: number;
  hearingRadius: number; visionRange: number; fovDeg: number; utilityChance: number;
}
export const BOT_PROFILES: Record<BotDifficulty, BotProfile> = {
  easy: { reactionTime: 0.55, aimErrorDeg: 4.5, aimTrackSpeed: 4, burstLength: 4, memorySeconds: 3, hearingRadius: 22, visionRange: 60, fovDeg: 110, utilityChance: 0.35 },
  hard: { reactionTime: 0.25, aimErrorDeg: 1.8, aimTrackSpeed: 9, burstLength: 7, memorySeconds: 6, hearingRadius: 32, visionRange: 90, fovDeg: 130, utilityChance: 0.7 },
};
