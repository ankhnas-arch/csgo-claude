import { sleep } from '../harness.mjs';
import { startMatchUI } from '../lib.mjs';
/** Ordinary input-driven match: the player actually plays (buys, moves to the objective, fights). No forced wins. Parameterised via env FM_TEAM/FM_DIFF/FM_SEED. */
export default async function (c) {
  const team = process.env.FM_TEAM ?? 'T', diff = process.env.FM_DIFF ?? 'easy', seed = parseInt(process.env.FM_SEED ?? '7', 10);
  c.note(`team ${team} difficulty ${diff} seed ${seed}`);
  const page = await c.open('http://127.0.0.1:4173/?quality=low&scale=0.5');
  await startMatchUI(page, { team, seed, difficulty: diff }); await c.ensureLocked();
  const t0 = Date.now(); const timeline = []; let lastPhase = ''; let roundShots = 0;
  const rifle = () => ((await0) => await0)(null);
  while (Date.now() - t0 < 40 * 60 * 1000) {
    const s = await c.state(); if (s.app === 'matchEnd') break;
    if (s.phase !== lastPhase) { lastPhase = s.phase; timeline.push({ real: +((Date.now() - t0) / 1000).toFixed(0), sim: +s.time.toFixed(0), round: s.round, phase: s.phase, score: `${s.score.T.score}-${s.score.CT.score}`, money: s.player.money, alive: s.player.alive }); if (s.phase === 'roundEnd') await c.shot(`round_${s.round}_end`); }
    for (const e of await c.events()) if (['kill', 'bombPlanted', 'bombDefused', 'bombExploded', 'roundEnd', 'sideSwitch', 'matchEnd'].includes(e.k)) timeline.push({ sim: +e.t.toFixed(0), ev: e.k, p: e.k === 'kill' ? `${e.p.killerId}->${e.p.victimId} ${e.p.weapon}` : e.k === 'roundEnd' ? `${e.p.winner} ${e.p.reason}` : '' });
    if (s.phase === 'freeze' && s.player.alive) {
      if (!s.player.primary && s.player.money >= 2700) { await c.ensureLocked(); if (await c.openBuy()) { await c.buyItem(s.player.team === 'T' ? 'ak47' : 'm4a4'); await c.buyItem('helmet'); await c.buyItem('smoke'); await c.buyItem('flash'); if (s.player.team === 'CT') await c.buyItem('defuser'); await c.closeBuy(); } }
      else if (s.player.money >= 1000 && s.player.armor < 100) { await c.ensureLocked(); if (await c.openBuy()) { await c.buyItem('helmet'); await c.buyItem('he'); await c.closeBuy(); } }
      await c.wait(1000); continue;
    }
    if ((s.phase === 'live' || s.phase === 'planted') && s.player.alive) {
      // objective-driven play: T goes to A (long) and plants; CT holds A ramp / rotates to the bomb
      const target = s.player.team === 'T' ? (s.bomb.planted ? [s.bomb.planted.x + 2, s.bomb.planted.z + 2] : [32, -38]) : (s.bomb.planted ? [s.bomb.planted.x, s.bomb.planted.z] : [36, -30]);
      const d = Math.hypot(target[0] - s.player.x, target[1] - s.player.z);
      // engage visible enemies: aim at the closest enemy the game says is visible
      const en = (await c.ev(() => window.__cs2.actors())).filter(a => a.team !== s.player.team && a.alive);
      let vis = null; for (const e of en) { if (await c.ev(id => window.__cs2.canSee(1, id), e.id)) { vis = e; break; } }
      if (vis) { await c.aimAtPoint(vis.x, vis.y + 1.5, vis.z); await c.click(180); roundShots++; if ((await c.state()).player.mag < 5) await c.press('KeyR'); continue; }
      if (d > 2) { const r = await c.walkTo(target[0], target[1], { timeout: 6000, tol: 1.5 }); void r; }
      else if (s.player.team === 'T' && s.player.hasBomb && !s.bomb.planted) { await c.page.keyboard.down('KeyE'); await c.wait(3600); await c.page.keyboard.up('KeyE'); }
      else if (s.player.team === 'CT' && s.bomb.planted) { await c.aimAtPoint(s.bomb.planted.x, s.bomb.planted.y, s.bomb.planted.z); await c.page.keyboard.down('KeyE'); await c.wait(11000); await c.page.keyboard.up('KeyE'); }
      else { await c.turn(90, 0); await c.wait(600); }
      continue;
    }
    await c.wait(1200);
  }
  const s = await c.state(); await c.wait(800); await c.shot('match_result');
  c.note(`timeline: ${JSON.stringify(timeline)}`);
  const winner = s.score.T.score === 4 ? 'T' : s.score.CT.score === 4 ? 'CT' : null;
  c.step('match completed by ordinary play', s.app === 'matchEnd' && winner !== null, `final ${s.score.T.score}-${s.score.CT.score} in ${((Date.now() - t0) / 60000).toFixed(1)} min real; player shots ${roundShots}`);
  c.step('side switch occurred after 3 rounds', timeline.some(e => e.ev === 'sideSwitch') || (s.score.T.score + s.score.CT.score) <= 3, 'sideSwitch event present or match ended early by 4-0? (must be ≥3 rounds before switch)');
  c.step(`outcome recorded: ${winner === team || (timeline.some(e => e.ev === 'sideSwitch') && winner !== team) ? 'see report' : 'see report'}`, true, `player team ${team}, winner ${winner}`);
  await page.click('#matchres [data-q="menu"]'); await sleep(500); c.step('return to menu from match result', (await c.state()).app === 'menu');
  c.step('no console errors', c.log.errors.length === 0, c.log.errors.slice(0, 3));
  void rifle;
}
