import type { Game } from '../sim/game';
import type { Settings } from '../core/settings';
import { settingsPanel, controlsHtml } from './settings';
import { esc } from './hud';

export class PauseMenu {
  el: HTMLElement; private content: HTMLElement; onResume: (() => void) | null = null; onQuit: (() => void) | null = null; onSettings: ((s: Settings) => void) | null = null;
  constructor(root: HTMLElement, private settings: Settings) {
    this.el = document.createElement('div'); this.el.id = 'pause'; this.el.className = 'hidden';
    this.el.innerHTML = `<div class="frame"><div class="tabs"><button data-t="game" class="on">Game</button><button data-t="settings">Settings</button><button data-t="controls">Controls</button></div><div class="content" data-q="content"></div><div class="actions"><button class="btn primary" data-q="resume" style="font-size:15px;padding:10px 26px">RESUME (click)</button><button class="btn danger" data-q="quit">LEAVE MATCH</button></div></div>`;
    root.appendChild(this.el); this.content = this.el.querySelector('[data-q="content"]')!;
    this.el.querySelectorAll<HTMLElement>('.tabs button').forEach(b => b.addEventListener('click', () => this.tab(b.dataset.t!)));
    this.el.querySelector('[data-q="resume"]')!.addEventListener('click', () => this.onResume?.());
    this.el.querySelector('[data-q="quit"]')!.addEventListener('click', () => this.onQuit?.());
  }
  show(v: boolean) { this.el.classList.toggle('hidden', !v); if (v) this.tab('game'); }
  get visible() { return !this.el.classList.contains('hidden'); }
  tab(t: string) {
    this.el.querySelectorAll<HTMLElement>('.tabs button').forEach(b => b.classList.toggle('on', b.dataset.t === t));
    if (t === 'game') this.content.innerHTML = `<p style="color:#cfd6de;font-size:14px;line-height:1.6">Match paused (local match). The simulation is frozen while this menu is open.<br>Click <b>Resume</b> to re-acquire the mouse; closing this menu never fires a shot.</p>`;
    else if (t === 'settings') { this.content.innerHTML = ''; this.content.appendChild(settingsPanel(this.settings, s => this.onSettings?.(s))); }
    else this.content.innerHTML = controlsHtml();
  }
}
export class RoundResult {
  el: HTMLElement; private t = 0;
  constructor(root: HTMLElement) { this.el = document.createElement('div'); this.el.id = 'roundres'; this.el.className = 'hidden'; root.appendChild(this.el); }
  show(g: Game, winner: 'T' | 'CT', reason: string, mvp: string | null, mvpReason: string) {
    const me = g.player; const won = me.team === winner;
    const title = winner === 'CT' ? 'Counter-Terrorists win' : 'Terrorists win';
    const why = { elimination: 'Enemy team eliminated', timeout: 'Target saved — time ran out', defuse: 'Bomb has been defused', explode: 'Target successfully bombed' }[reason] ?? reason;
    this.el.innerHTML = `<div class="band ${winner.toLowerCase()}${won ? '' : ' lose'}">${esc(title)}<small>${esc(why)} · ${won ? 'ROUND WON' : 'ROUND LOST'}</small></div>${mvp ? `<div class="mvp"><span class="star">★</span><span>MVP: <b>${esc(mvp)}</b> ${esc(mvpReason)}</span></div>` : ''}`;
    this.el.classList.remove('hidden'); this.t = 4.5;
  }
  update(dt: number) { if (this.t > 0) { this.t -= dt; if (this.t <= 0) this.el.classList.add('hidden'); } }
  hide() { this.el.classList.add('hidden'); this.t = 0; }
}
export class MatchResult {
  el: HTMLElement; onReplay: (() => void) | null = null; onMenu: (() => void) | null = null;
  constructor(root: HTMLElement) { this.el = document.createElement('div'); this.el.id = 'matchres'; this.el.className = 'hidden'; root.appendChild(this.el); }
  show(g: Game, winner: 'T' | 'CT') {
    const me = g.player; const won = me.team === winner; const s = g.match.teams;
    const kd = `${me.kills} kills · ${me.deaths} deaths · ${me.mvps} MVP · $${me.money} left`;
    this.el.innerHTML = `<div class="frame"><h1 class="${won ? 'win' : 'lose'}">${won ? 'VICTORY' : 'DEFEAT'}</h1><div class="score"><span class="ct">${s.CT.score}</span> : <span class="t">${s.T.score}</span></div><div class="stats">${winner === 'CT' ? 'Counter-Terrorists' : 'Terrorists'} win the match · ${esc(kd)}</div><div class="actions"><button class="btn primary" data-q="replay">PLAY AGAIN</button><button class="btn" data-q="menu">MAIN MENU</button></div></div>`;
    this.el.querySelector('[data-q="replay"]')!.addEventListener('click', () => this.onReplay?.()); this.el.querySelector('[data-q="menu"]')!.addEventListener('click', () => this.onMenu?.());
    this.el.classList.remove('hidden');
  }
  hide() { this.el.classList.add('hidden'); }
}
