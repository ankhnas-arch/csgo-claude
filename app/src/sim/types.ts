import type { Team } from '../data/weapons';
export type { Team };
export type Phase = 'setup' | 'freeze' | 'live' | 'planted' | 'roundEnd' | 'halftime' | 'matchEnd';
export type RoundEndReason = 'elimination' | 'timeout' | 'defuse' | 'explode';
export interface PlayerInput {
  forward: number; right: number; jump: boolean; crouch: boolean; walk: boolean;
  fire: boolean; firePressed: boolean; altPressed: boolean; reload: boolean; inspect: boolean;
  interact: boolean; drop: boolean; slot: number | null; scroll: number; prevWeapon: boolean;
  lookDx: number; lookDy: number; // mouse deltas (already scaled by sensitivity externally? no: raw counts)
}
export const EMPTY_INPUT: PlayerInput = { forward: 0, right: 0, jump: false, crouch: false, walk: false, fire: false, firePressed: false, altPressed: false, reload: false, inspect: false, interact: false, drop: false, slot: null, scroll: 0, prevWeapon: false, lookDx: 0, lookDy: 0 };
export interface KillEvent { killerId: number | null; victimId: number; weapon: string; headshot: boolean; time: number; }
export interface SimEvents extends Record<string, unknown> {
  shot: { actorId: number; weapon: string; origin: [number, number, number]; dir: [number, number, number]; hit: [number, number, number] | null; hitActor: number | null; hitGroup: string | null; surface: string | null; normal: [number, number, number] | null };
  hurt: { actorId: number; attackerId: number | null; damage: number; hitGroup: string; weapon: string };
  kill: KillEvent;
  reload: { actorId: number; weapon: string; stage: 'start' | 'insert' | 'end' };
  weaponSwitch: { actorId: number; weapon: string };
  grenadeThrow: { actorId: number; kind: string; id: number };
  grenadeDetonate: { id: number; kind: string; pos: [number, number, number] };
  grenadeBounce: { id: number; pos: [number, number, number]; speed: number };
  flashed: { actorId: number; duration: number; intensity: number };
  bombPlanted: { site: 'A' | 'B'; pos: [number, number, number]; actorId: number };
  bombDefused: { actorId: number };
  bombExploded: { pos: [number, number, number] };
  bombDropped: { pos: [number, number, number] };
  bombPickup: { actorId: number };
  plantProgress: { actorId: number; progress: number };
  defuseProgress: { actorId: number; progress: number; kit: boolean };
  phase: { phase: Phase; prev: Phase };
  roundEnd: { winner: Team; reason: RoundEndReason; round: number; mvpId: number | null; mvpReason: string };
  matchEnd: { winner: Team; score: { T: number; CT: number } };
  purchase: { actorId: number; item: string; cost: number };
  purchaseDenied: { actorId: number; item: string; reason: string };
  itemDrop: { actorId: number; weapon: string; pos: [number, number, number] };
  itemPickup: { actorId: number; weapon: string };
  footstep: { actorId: number; pos: [number, number, number]; surface: string; loud: boolean };
  knifeSwing: { actorId: number; hit: boolean };
  scope: { actorId: number; level: number };
  zoomTransition: { actorId: number; level: number };
  fireDamage: { actorId: number; damage: number };
  sideSwitch: { round: number };
  scenario: { name: string };
}
