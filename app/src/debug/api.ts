import type { App } from '../main';
import { WEAPONS } from '../data/weapons';
import { WeaponInstance } from '../sim/weapon';
import { floorYAt } from '../data/map/layout';
import { WEAPON_STATS } from '../render/viewmodel';

/**
 * Developer/evidence API on window.__cs2. Fixtures PREPARE scenarios (positions, money, inventories, seeds); they never
 * substitute for input-driven proof. Read-only stats are used by the Playwright evidence harness.
 */
export function installDebugApi(app: App) {
  const api = {
    app,
    get game() { return app.game; },
    state: () => ({ app: app.state, phase: app.game?.match.phase, round: app.game?.match.round, score: app.game?.match.teams, locked: app.input.locked, paused: app.paused, buyOpen: app.buyOpen, time: app.game?.time, player: app.game ? summarize(app.game.player) : null, bomb: app.game?.match.bomb, phaseTime: app.game?.match.phaseTime }),
    actors: () => app.game?.actors.map(summarize) ?? [],
    perf: () => ({ ...app.perf.snapshot(), drawCalls: app.scene.drawCalls, triangles: app.scene.triangles, effects: app.scene.effects.counts, sim: app.game?.stats, simLoops: app.simLoops, audioVoices: app.audio.activeVoices, rigs: app.scene.rigs.size, items: app.scene.itemMeshes.size, grenadeMeshes: app.scene.grenadeMeshes.size, memory: (performance as any).memory ? { usedJSHeap: (performance as any).memory.usedJSHeapSize, totalJSHeap: (performance as any).memory.totalJSHeapSize } : null, rendererInfo: { geometries: app.scene.renderer.info.memory.geometries, textures: app.scene.renderer.info.memory.textures } }),
    perfReset: () => app.perf.reset(),
    errors: () => app.consoleErrors.slice(),
    weaponStats: () => WEAPON_STATS,
    settings: () => app.settings,
    // ----- fixtures (scenario preparation only)
    giveMoney: (n: number) => { if (app.game) app.game.player.money = n; },
    giveWeapon: (id: string, actorId?: number) => { const g = app.game; if (!g) return; const a = actorId ? g.actorById(actorId)! : g.player; const w = WeaponInstance.create(id); const def = WEAPONS[id]; if (def.slot === 'primary') a.inv.primary = w; else if (def.slot === 'secondary') a.inv.secondary = w; else if (def.slot === 'grenade') a.inv.grenades.push(w); a.switchTo(w, true); },
    teleport: (x: number, z: number, yawDeg = 0, actorId?: number) => { const g = app.game; if (!g) return; const a = actorId ? g.actorById(actorId)! : g.player; const f = floorYAt(x, z); a.teleport(x, (f ? f.y : 0) + 0.05, z, yawDeg * Math.PI / 180); },
    setLook: (yawDeg: number, pitchDeg: number) => { const a = app.game?.player; if (a) { a.yaw = yawDeg * Math.PI / 180; a.pitch = pitchDeg * Math.PI / 180; a.pyaw = a.yaw; a.ppitch = a.pitch; } },
    setPhaseTime: (t: number) => { if (app.game) app.game.match.phaseTime = t; },
    setBombTime: (t: number) => { const b = app.game?.match.bomb.planted; if (b) b.timeLeft = t; },
    killActor: (id: number) => { const g = app.game; if (!g) return; const a = g.actorById(id); if (a && a.alive) g.kill(a, null, 'world', false); },
    killAllEnemies: (exceptCount = 0) => { const g = app.game; if (!g) return; const en = g.actors.filter(a => a.team !== g.player.team && a.alive); for (const a of en.slice(exceptCount)) g.kill(a, null, 'world', false); },
    killTeammates: () => { const g = app.game; if (!g) return; for (const a of g.actors) if (a.team === g.player.team && a !== g.player && a.alive) g.kill(a, null, 'world', false); },
    freezeBots: (v: boolean) => { const g = app.game; if (!g) return; for (const [, b] of g.brains) (b as any).frozen = v; g.botsFrozen = v; },
    giveBombToPlayer: () => { const g = app.game; if (!g) return; const c = g.actorById(g.match.bomb.carrierId); if (c && c !== g.player) c.inv.bomb = null; g.items = g.items.filter(i => i.kind !== 'bomb'); g.match.giveBomb(g.player); },
    setRefCamera: (id: string | null) => app.setReferenceCamera(id),
    setFreeCamera: (pos: [number, number, number], look: [number, number, number], fov = 80) => app.scene.setFreeCamera(pos, look, fov),
    cameras: () => app.cameras,
    startMatch: (team: 'T' | 'CT', difficulty: 'easy' | 'hard', seed: number, economy: 'showcase' | 'standard' = 'showcase') => app.startMatch({ team, difficulty, seed, economy }),
    navCheck: () => { const g = app.game; if (!g) return null; const nav = g.nav; const routes: Record<string, [number, number, number, number]> = { 'T->A via long': [0, 46, 34, -38], 'T->B via tunnels': [0, 46, -36, -38], 'T->mid->CT': [0, 46, 3, -46], 'CT->A ramp': [3, -48, 34, -38], 'CT->B doors': [3, -48, -36, -38], 'mid->lower->upper': [0, 0, -36, 10], 'long->pit': [40, -4, 49, -4], 'mid->catwalk->short->A': [0, -10, 28, -40] }; const out: Record<string, number | null> = {}; for (const [k, [x0, z0, x1, z1]] of Object.entries(routes)) { const p = nav.findPath(x0, z0, x1, z1); out[k] = p ? p.length : null; } return out; },
    version: '0.1.0',
  };
  (window as any).__cs2 = api;
}
function summarize(a: import('../sim/actor').Actor) {
  return { id: a.id, name: a.name, team: a.team, alive: a.alive, health: a.health, armor: a.armor, helmet: a.helmet, money: a.money, x: +a.x.toFixed(2), y: +a.y.toFixed(2), z: +a.z.toFixed(2), yaw: +a.yaw.toFixed(3), pitch: +a.pitch.toFixed(3), active: a.active.def.id, action: a.active.action, mag: a.active.mag, reserve: a.active.reserve, zoom: a.active.zoomLevel, needsRechamber: a.active.needsRechamber, hasBomb: !!a.inv.bomb, kit: a.inv.kit, grenades: a.inv.grenades.map(g => g.def.id), primary: a.inv.primary?.def.id ?? null, secondary: a.inv.secondary?.def.id ?? null, kills: a.kills, deaths: a.deaths, flash: +a.flashAlpha.toFixed(2), burn: a.burnTime > 0, plant: +a.plantProgress.toFixed(2), defuse: +a.defuseProgress.toFixed(2), grounded: a.grounded, crouch: a.crouching, speed: +a.speed2d.toFixed(2), isBot: a.isBot };
}
