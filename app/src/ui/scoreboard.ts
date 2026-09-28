import type { Game } from '../sim/game';
import { esc } from './hud';
/** Tab scoreboard: blue CT and gold T team rows, numeric columns right-aligned, values from simulation. */
export class Scoreboard {
  el: HTMLElement;
  constructor(root: HTMLElement) { this.el = document.createElement('div'); this.el.id = 'scoreboard'; this.el.className = 'hidden'; root.appendChild(this.el); }
  show(v: boolean) { this.el.classList.toggle('hidden', !v); }
  render(g: Game) {
    const m = g.match; const me = g.player;
    const team = (t: 'CT' | 'T') => { const rows = g.actors.filter(a => a.team === t).slice().sort((a, b) => b.score - a.score || b.kills - a.kills); return `<table class="${t.toLowerCase()}"><tr class="teamrow"><td>${t === 'CT' ? 'COUNTER-TERRORISTS' : 'TERRORISTS'}</td><td colspan="5"></td><td>${m.teams[t].score}</td></tr><tr><th>PLAYER</th><th>MONEY</th><th>K</th><th>A</th><th>D</th><th>MVP</th><th>SCORE</th></tr>${rows.map(a => `<tr class="${a.alive ? '' : 'dead'}${a === me ? ' me' : ''}"><td>${esc(a.name)}${a.inv.bomb ? ' <span style="color:#ff5a3a">●C4</span>' : ''}${a.inv.kit ? ' <span style="color:#6aa6e8">KIT</span>' : ''}${a.isBot ? ' <span style="color:var(--muted);font-size:10px">BOT</span>' : ''}</td><td>$${a.money}</td><td>${a.kills}</td><td>${a.assists}</td><td>${a.deaths}</td><td>${a.mvps ? '<span class="mvpstar">★</span>' + a.mvps : ''}</td><td>${a.score}</td></tr>`).join('')}</table>`; };
    this.el.innerHTML = `<div class="hdr"><span>Competitive · Dust II (compressed recreation) · First to ${m.rules.roundsToWin}</span><span>Round ${m.round}${m.sidesSwitched ? ' · second half' : ''}</span></div>${team('CT')}<div style="height:10px"></div>${team('T')}`;
  }
}
