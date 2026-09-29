import type { Game } from '../sim/game';
import type { Settings } from '../core/settings';
import type { Actor } from '../sim/actor';
import { RECTS, SITES } from '../data/map/layout';
import { iconFor, icon } from './icons';
import { WEAPONS } from '../data/weapons';

/** Live HUD: radar, top team strips + clock, health/armor, ammo + inventory silhouettes, killfeed, prompts, damage/flash overlays, scope. */
export class Hud {
  el: HTMLElement; radar: HTMLCanvasElement; rctx: CanvasRenderingContext2D;
  private killfeed: HTMLElement; private kfItems: { el: HTMLElement; t: number }[] = [];
  private announceT = 0; private hitT = 0; private dmgT = 0; private lastHealth = 100; private lastMoney = 0;
  private q: Record<string, HTMLElement> = {};
  constructor(root: HTMLElement) {
    this.el = document.createElement('div'); this.el.id = 'hud'; this.el.className = 'hidden';
    this.el.innerHTML = `
      <div class="flash" data-q="flash"></div><div class="dmg" data-q="dmg"></div><div class="burn" data-q="burn"></div>
      <div class="scope" data-q="scope"><svg viewBox="0 0 1000 1000" preserveAspectRatio="xMidYMid slice"><defs><mask id="scopemask"><rect width="1000" height="1000" fill="#fff"/><circle cx="500" cy="500" r="430" fill="#000"/></mask></defs><rect width="1000" height="1000" fill="#000" mask="url(#scopemask)"/><circle cx="500" cy="500" r="430" fill="none" stroke="#000" stroke-width="18"/><line x1="70" y1="500" x2="930" y2="500" stroke="#000" stroke-width="2"/><line x1="500" y1="70" x2="500" y2="930" stroke="#000" stroke-width="2"/><line x1="70" y1="500" x2="420" y2="500" stroke="#000" stroke-width="7"/><line x1="580" y1="500" x2="930" y2="500" stroke="#000" stroke-width="7"/><line x1="500" y1="70" x2="500" y2="420" stroke="#000" stroke-width="7"/><line x1="500" y1="580" x2="500" y2="930" stroke="#000" stroke-width="7"/></svg></div>
      <div class="radar"><canvas data-q="radar" width="400" height="400"></canvas></div>
      <div class="money" data-q="money">$0<small>MONEY</small></div>
      <div class="bombicon" data-q="bombicon">C4</div>
      <div class="top"><div class="team ct" data-q="teamct"></div><div class="center"><div class="clock"><span class="score ct" data-q="scorect">0</span><span class="time" data-q="time">1:30</span><span class="score t" data-q="scoret">0</span></div><div class="sub" data-q="sub">ROUND 1</div></div><div class="team t" data-q="teamt"></div></div>
      <div class="killfeed" data-q="killfeed"></div>
      <div class="crosshair" data-q="crosshair"></div>
      <div class="hitmarker" data-q="hit"><svg viewBox="0 0 24 24" width="24" height="24"><path d="M4 4 L9 9 M20 4 L15 9 M4 20 L9 15 M20 20 L15 15" stroke="#fff" stroke-width="2.5"/></svg></div>
      <div class="announce hidden" data-q="announce"></div>
      <div class="buyhint hidden" data-q="buyhint">Press <b>B</b> to open the buy menu</div>
      <div class="prompt hidden" data-q="prompt"></div>
      <div class="progress hidden" data-q="progress"><div></div></div>
      <div class="spectate hidden" data-q="spectate"></div>
      <div class="bottom-left"><div class="stat hp" data-q="hp">${icon('head', '#fff')}<span>100</span></div><div class="stat ar" data-q="ar">${icon('kevlar', '#fff')}<span>0</span></div></div>
      <div class="bottom-right"><div class="inv" data-q="inv"></div><div class="ammo" data-q="ammo"><span class="name"></span><span class="mag">30</span><span class="reserve">/ 90</span></div></div>
      <div class="fps hidden" data-q="fps"></div>`;
    root.appendChild(this.el);
    this.el.querySelectorAll<HTMLElement>('[data-q]').forEach(e => { this.q[e.dataset.q!] = e; });
    this.radar = this.q.radar as HTMLCanvasElement; this.rctx = this.radar.getContext('2d')!;
    this.killfeed = this.q.killfeed;
    // static radar background cache
    this.bg = document.createElement('canvas'); this.bg.width = this.bg.height = 400; this.drawRadarBg();
  }
  private bg: HTMLCanvasElement;
  show(v: boolean) { this.el.classList.toggle('hidden', !v); }
  setCrosshair(s: Settings) {
    const sz = s.crosshairSize, gap = s.crosshairGap, c = s.crosshairColor, t = 2;
    this.q.crosshair.innerHTML = `<svg width="${(sz + gap) * 2 + 4}" height="${(sz + gap) * 2 + 4}" viewBox="${-(sz + gap) - 2} ${-(sz + gap) - 2} ${(sz + gap) * 2 + 4} ${(sz + gap) * 2 + 4}"><g stroke="#000" stroke-width="${t + 2}" opacity="0.6"><line x1="${gap}" y1="0" x2="${gap + sz}" y2="0"/><line x1="${-gap}" y1="0" x2="${-gap - sz}" y2="0"/><line x1="0" y1="${gap}" x2="0" y2="${gap + sz}"/><line x1="0" y1="${-gap}" x2="0" y2="${-gap - sz}"/></g><g stroke="${c}" stroke-width="${t}"><line x1="${gap}" y1="0" x2="${gap + sz}" y2="0"/><line x1="${-gap}" y1="0" x2="${-gap - sz}" y2="0"/><line x1="0" y1="${gap}" x2="0" y2="${gap + sz}"/><line x1="0" y1="${-gap}" x2="0" y2="${-gap - sz}"/></g></svg>`;
  }
  kill(killer: Actor | null, victim: Actor, weapon: string, headshot: boolean, me: Actor) {
    const el = document.createElement('div'); el.className = 'kf' + (killer === me || victim === me ? ' me' : '');
    const kn = killer ? `<span class="${killer.team.toLowerCase()}">${esc(killer.name)}</span>` : '';
    el.innerHTML = `${kn}${weapon === 'he' || weapon === 'molotov' || weapon === 'incendiary' ? icon(weapon, '#fff') : weapon === 'c4' ? icon('c4', '#fff') : iconFor(weapon)}${headshot ? icon('head', '#e5b95a') : ''}<span class="${victim.team.toLowerCase()}">${esc(victim.name)}</span>`;
    this.killfeed.appendChild(el); this.kfItems.push({ el, t: 0 }); if (this.kfItems.length > 6) { const f = this.kfItems.shift()!; f.el.remove(); }
  }
  announce(text: string, sub = '', dur = 3) { this.q.announce.innerHTML = `${esc(text)}${sub ? `<small>${esc(sub)}</small>` : ''}`; this.q.announce.classList.remove('hidden'); this.announceT = dur; }
  hitmarker() { this.hitT = 0.12; this.q.hit.classList.add('show'); this.q.hit.classList.remove('fade'); }
  private drawRadarBg() {
    const c = this.bg.getContext('2d')!; c.fillStyle = '#0d1117'; c.fillRect(0, 0, 400, 400);
    for (const r of RECTS) { const [x0, y0] = this.map(r.x0, r.z0), [x1, y1] = this.map(r.x1, r.z1); c.fillStyle = r.ceiling ? '#2b3340' : (r.y >= 1.5 ? '#3d4654' : r.y < -0.5 ? '#222a34' : '#333b47'); c.fillRect(x0, y0, x1 - x0, y1 - y0); }
  }
  private drawLabels(c: CanvasRenderingContext2D, yaw: number) {
    c.font = 'bold 8px Arial'; c.fillStyle = 'rgba(255,255,255,0.45)'; c.textAlign = 'center';
    for (const r of RECTS) if (r.radar) { const [x, y] = this.map((r.x0 + r.x1) / 2, (r.z0 + r.z1) / 2); c.save(); c.translate(x, y - 6); c.rotate(yaw); c.fillText(r.radar, 0, 0); c.restore(); }
    c.font = 'bold 22px Arial'; c.fillStyle = 'rgba(255,255,255,0.75)';
    for (const s of SITES) { const [x, y] = this.map((s.x0 + s.x1) / 2, (s.z0 + s.z1) / 2); c.save(); c.translate(x, y + 8); c.rotate(yaw); c.fillText(s.id, 0, 0); c.restore(); }
  }
  private map(x: number, z: number): [number, number] { return [200 + x * 3.2, 200 + z * 3.2]; }
  private drawRadar(g: Game, view: Actor) {
    const c = this.rctx; c.setTransform(1, 0, 0, 1, 0, 0); c.clearRect(0, 0, 400, 400);
    // rotate map so that the player's forward is up, centred on the player (zoomed)
    const [px, pz] = this.map(view.x, view.z);
    c.translate(200, 200); c.scale(1.6, 1.6); c.rotate(-view.yaw); c.translate(-px, -pz);
    c.drawImage(this.bg, 0, 0); this.drawLabels(c, view.yaw);
    const me = g.player;
    const b = g.match.bomb;
    const drawDot = (x: number, z: number, col: string, r: number, yaw?: number) => { const [ax, az] = this.map(x, z); c.fillStyle = col; c.beginPath(); c.arc(ax, az, r, 0, 6.28); c.fill(); if (yaw !== undefined) { c.strokeStyle = col; c.lineWidth = 2; c.beginPath(); c.moveTo(ax, az); c.lineTo(ax - Math.sin(yaw) * r * 2.4, az - Math.cos(yaw) * r * 2.4); c.stroke(); } };
    for (const a of g.actors) { if (a.team !== me.team) { if (a.alive && g.time - (g.brains.get(me.id) ? 0 : 0) >= 0 && this.enemySpotted(g, a)) drawDot(a.x, a.z, '#e04a3a', 4.5); continue; } if (!a.alive) { const [ax, az] = this.map(a.x, a.z); c.fillStyle = 'rgba(255,255,255,0.4)'; c.font = '10px Arial'; c.fillText('✕', ax - 4, az + 4); continue; } drawDot(a.x, a.z, a === me ? '#ffffff' : a.team === 'CT' ? '#6aa6e8' : '#e5b95a', a === me ? 5 : 4, a.yaw); if (a.inv.bomb) { const [ax, az] = this.map(a.x, a.z); c.fillStyle = '#ff5a3a'; c.fillRect(ax + 4, az - 8, 6, 6); } }
    if (b.dropped) drawDot(b.dropped.x, b.dropped.z, '#ff5a3a', 4); if (b.planted) { const bl = Math.sin(g.time * 8) > 0; drawDot(b.planted.x, b.planted.z, bl ? '#ff3a1a' : '#a02010', 6); }
  }
  private enemySpotted(g: Game, e: Actor): boolean { for (const a of g.actors) if (a.team !== e.team && a.alive) { const d = Math.hypot(a.x - e.x, a.z - e.z); if (d < 45 && g.canSee(a, e)) return true; } return false; }
  update(g: Game, dt: number, settings: Settings, viewActor: Actor, fpsText: string | null, buyOpen: boolean) {
    const me = g.player, m = g.match;
    this.drawRadar(g, viewActor);
    // top strips
    const strip = (team: 'T' | 'CT') => g.actors.filter(a => a.team === team).map(a => `<div class="pl${a.alive ? '' : ' dead'}" title="${esc(a.name)}"></div>`).join('') + `<span class="label">${team === 'CT' ? 'CT' : 'T'}</span>`;
    const ctHtml = strip('CT'), tHtml = strip('T'); if (this.q.teamct.innerHTML !== ctHtml) this.q.teamct.innerHTML = ctHtml; if (this.q.teamt.innerHTML !== tHtml) this.q.teamt.innerHTML = tHtml;
    this.q.scorect.textContent = String(m.teams.CT.score); this.q.scoret.textContent = String(m.teams.T.score);
    let t = '', planted = false;
    if (m.phase === 'freeze') t = fmt(m.phaseTime); else if (m.phase === 'live') t = fmt(m.phaseTime); else if (m.phase === 'planted') { t = '●'; planted = true; } else if (m.phase === 'roundEnd') t = '0:00'; else t = '--:--';
    this.q.time.textContent = t; this.q.time.classList.toggle('planted', planted);
    this.q.sub.textContent = m.phase === 'freeze' ? `ROUND ${m.round} · BUY` : m.phase === 'planted' ? 'BOMB PLANTED' : m.phase === 'roundEnd' ? 'ROUND OVER' : `ROUND ${m.round} · FIRST TO ${m.rules.roundsToWin}`;
    // money
    if (me.money !== this.lastMoney) { this.lastMoney = me.money; this.q.money.innerHTML = `$${me.money}<small>MONEY</small>`; }
    this.q.bombicon.classList.toggle('on', !!me.inv.bomb && me.alive);
    this.q.buyhint.classList.toggle('hidden', !(m.buyWindowOpen && me.alive && g.inBuyZone(me) && !buyOpen && (m.phase === 'freeze' || m.phase === 'live')));
    // health/armor
    this.q.hp.querySelector('span')!.textContent = String(Math.max(0, Math.ceil(me.health))); this.q.hp.classList.toggle('low', me.health <= 25);
    this.q.ar.querySelector('span')!.textContent = String(me.armor); this.q.ar.querySelector('svg')!.outerHTML = icon(me.helmet ? 'helmet' : 'kevlar', '#fff');
    // ammo
    const w = me.active; const showAmmo = w.def.magSize > 0;
    this.q.ammo.querySelector('.name')!.textContent = w.def.short; this.q.ammo.querySelector('.mag')!.textContent = showAmmo ? String(w.mag) : (w.def.slot === 'grenade' ? String(me.countGrenade(w.def.id)) : '—'); this.q.ammo.querySelector('.reserve')!.textContent = showAmmo ? `/ ${w.reserve}` : '';
    // inventory
    const invHtml = me.allWeapons().map(x => `<div class="slot${x === w ? ' active' : ''}"><span class="key">${me.slotOf(x)}</span>${x.def.slot === 'grenade' || x.def.slot === 'bomb' ? icon(x.def.id, x === w ? '#fff' : '#9aa3ad') : iconFor(x.def.id).replace('currentColor', x === w ? '#fff' : '#9aa3ad')}<span>${esc(x.def.short)}</span></div>`).join('') + (me.inv.kit ? `<div class="slot">${icon('defuser', '#6aa6e8')}<span>KIT</span></div>` : '');
    if (this.q.inv.innerHTML !== invHtml) this.q.inv.innerHTML = invHtml;
    // prompts
    let prompt = ''; let prog = -1; let progKind = '';
    if (me.alive) {
      const site = g.siteAt(me.x, me.z, me.y);
      if (m.phase === 'live' && me.inv.bomb && site) { prompt = `Hold <b>E</b> to plant the bomb at site ${site}`; if (me.plantProgress > 0) { prog = me.plantProgress; progKind = 'plant'; } }
      else if (m.phase === 'planted' && me.team === 'CT' && m.bomb.planted && Math.hypot(me.x - m.bomb.planted.x, me.z - m.bomb.planted.z) < 1.5) { prompt = `Hold <b>E</b> to defuse${me.inv.kit ? ' (kit)' : ''}`; if (me.defuseProgress > 0) { prog = me.defuseProgress; progKind = 'defuse'; } }
      else if (m.phase === 'live' && me.team === 'T' && !me.inv.bomb && m.bomb.dropped && Math.hypot(me.x - m.bomb.dropped.x, me.z - m.bomb.dropped.z) < 6) prompt = 'The bomb is on the ground nearby — walk over it to pick it up';
      else { const near = g.items.find(it => it.kind === 'weapon' && Math.hypot(it.x - me.x, it.z - me.z) < 1.6); if (near && near.weapon) prompt = `Press <b>E</b> to swap for ${esc(near.weapon.def.name)}`; }
      if (w.def.zoomLevels === 0 && w.def.magSize > 0 && w.mag === 0 && w.reserve > 0 && w.action !== 'reload') prompt = prompt || 'Press <b>R</b> to reload';
      if (w.mag === 0 && w.reserve === 0 && w.def.magSize > 0) prompt = prompt || 'Out of ammo — switch weapon';
    }
    this.q.prompt.classList.toggle('hidden', !prompt); if (prompt) this.q.prompt.innerHTML = prompt;
    this.q.progress.classList.toggle('hidden', prog < 0); if (prog >= 0) { this.q.progress.className = 'progress ' + progKind; (this.q.progress.firstElementChild as HTMLElement).style.width = `${Math.min(100, prog * 100)}%`; }
    // spectator
    const spec = !me.alive && (m.phase === 'live' || m.phase === 'planted');
    this.q.spectate.classList.toggle('hidden', !spec);
    if (spec) { const tgt = g.actorById(g.spectateId); this.q.spectate.innerHTML = tgt ? `Spectating <b>${esc(tgt.name)}</b> · click / space to cycle` : 'No teammates alive — waiting for the round to end'; }
    // overlays
    const flashAlpha = me.alive ? me.flashAlpha * (settings.reducedFlash ? 0.55 : 1) : 0;
    (this.q.flash as HTMLElement).style.opacity = String(flashAlpha);
    if (me.health < this.lastHealth) { this.dmgT = 0.5; } this.lastHealth = me.health; this.dmgT = Math.max(0, this.dmgT - dt);
    (this.q.dmg as HTMLElement).style.boxShadow = `inset 0 0 140px rgba(200,20,20,${Math.min(0.8, this.dmgT * 1.6)})`;
    (this.q.burn as HTMLElement).style.boxShadow = `inset 0 0 160px rgba(255,120,20,${me.burnTime > 0 ? 0.5 : 0})`;
    // scope
    const scoped = me.alive && viewActor === me && w.zoomLevel > 0;
    this.q.scope.classList.toggle('on', scoped); this.q.crosshair.style.display = scoped || !me.alive ? 'none' : '';
    if (this.hitT > 0) { this.hitT -= dt; if (this.hitT <= 0) { this.q.hit.classList.remove('show'); this.q.hit.classList.add('fade'); } }
    if (this.announceT > 0) { this.announceT -= dt; if (this.announceT <= 0) this.q.announce.classList.add('hidden'); }
    for (let i = this.kfItems.length - 1; i >= 0; i--) { const k = this.kfItems[i]; k.t += dt; if (k.t > 6) { k.el.remove(); this.kfItems.splice(i, 1); } }
    this.q.fps.classList.toggle('hidden', !fpsText); if (fpsText) this.q.fps.textContent = fpsText;
  }
}
export function fmt(t: number): string { t = Math.max(0, Math.ceil(t)); return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`; }
export function esc(s: string): string { return s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!)); }
export { WEAPONS };
