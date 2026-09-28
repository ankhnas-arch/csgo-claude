import type { Game } from '../sim/game';
import { WEAPONS, EQUIPMENT, BUY_GRID } from '../data/weapons';
import { icon, iconFor } from './icons';
import { esc, fmt } from './hud';

/** Buy menu following the CS2 five-column category grid with a right-side agent/weapon preview panel. */
export class BuyMenu {
  el: HTMLElement; open = false; private status: HTMLElement; private tip: HTMLElement; private grid: HTMLElement; private moneyEl: HTMLElement; private timerEl: HTMLElement; private previewCanvas: HTMLCanvasElement;
  lastBuy: string[] = []; onClose: (() => void) | null = null; onBuy: ((item: string) => void) | null = null; hovered: string | null = null;
  constructor(root: HTMLElement) {
    this.el = document.createElement('div'); this.el.id = 'buy'; this.el.className = 'hidden';
    this.el.innerHTML = `<div class="frame"><div class="head"><span class="money" data-q="money">$0</span><span data-q="zone" style="color:var(--muted);font-size:12px;letter-spacing:.1em"></span><span class="timer">BUY TIME <b data-q="timer">0:00</b></span><button class="close" data-q="close">CLOSE (B / ESC)</button></div><div class="grid" data-q="grid"></div><div class="preview"><div class="agent"><canvas data-q="agent" width="300" height="420"></canvas></div><div class="tip" data-q="tip"><b>Hover an item</b>Press the number key or click to buy.</div><div class="status" data-q="status"></div><div class="actions"><button class="btn" data-q="rebuy">Rebuy last</button><button class="btn" data-q="autobuy">Auto-buy</button></div></div></div>`;
    root.appendChild(this.el);
    const q = (k: string) => this.el.querySelector<HTMLElement>(`[data-q="${k}"]`)!;
    this.status = q('status'); this.tip = q('tip'); this.grid = q('grid'); this.moneyEl = q('money'); this.timerEl = q('timer'); this.previewCanvas = q('agent') as HTMLCanvasElement;
    q('close').addEventListener('click', () => this.onClose?.());
    q('rebuy').addEventListener('click', () => { for (const it of this.lastBuy) this.onBuy?.(it); });
    q('autobuy').addEventListener('click', () => { this.autobuy(); });
    this.zoneEl = q('zone');
  }
  private zoneEl: HTMLElement; private game: Game | null = null;
  autobuy() { const g = this.game; if (!g) return; const a = g.player; const rifle = a.team === 'T' ? 'ak47' : 'm4a4'; const order = a.inv.primary ? ['helmet', 'defuser', 'smoke', 'flash', 'he'] : [rifle, 'helmet', 'defuser', 'smoke', 'flash', 'he']; for (const it of order) this.onBuy?.(it); }
  show(g: Game) { this.game = g; this.open = true; this.sig = ''; this.el.classList.remove('hidden'); this.render(g); }
  hide() { this.open = false; this.el.classList.add('hidden'); }
  setStatus(s: string, ok: boolean) { this.status.textContent = s; this.status.style.color = ok ? 'var(--green)' : 'var(--red)'; }
  private sig = '';
  render(g: Game) {
    const a = g.player; const m = g.match;
    this.moneyEl.textContent = `$${a.money}`;
    const left0 = m.phase === 'freeze' ? m.phaseTime + 8 : Math.max(0, 8 - (m.rules.roundTime - m.phaseTime));
    this.timerEl.textContent = fmt(left0);
    this.zoneEl.textContent = g.inBuyZone(a) ? 'IN BUY ZONE' : 'OUTSIDE BUY ZONE';
    const sig = [a.money, a.armor, a.helmet, a.inv.kit, a.inv.primary?.def.id, a.inv.secondary?.def.id, a.inv.grenades.map(x => x.def.id).join(','), a.team].join('|');
    if (sig === this.sig) return; this.sig = sig;
    let key = 1; let html = '';
    for (const col of BUY_GRID) {
      html += `<div class="col"><h4><span>${esc(col.title)}</span></h4>`;
      if (!col.items.length) html += `<div style="color:var(--muted);font-size:11px;padding:6px">Not in this prototype</div>`;
      for (const id of col.items) {
        const w = WEAPONS[id]; const eq = (EQUIPMENT as any)[id] as { name: string; price: number } | undefined;
        const name = w ? w.name : eq!.name; let price = w ? w.price : eq!.price; if (id === 'helmet' && a.armor >= 100) price = 350;
        const teamOk = !w || w.team === 'both' || w.team === a.team; if (!teamOk) continue;
        if (id === 'defuser' && a.team !== 'CT') continue;
        let owned = false; if (w) { if (w.slot === 'primary') owned = a.inv.primary?.def.id === id; else if (w.slot === 'secondary') owned = a.inv.secondary?.def.id === id; else if (w.slot === 'grenade') owned = a.countGrenade(id) >= (id === 'flash' ? 2 : 1); }
        else if (id === 'kevlar') owned = a.armor >= 100; else if (id === 'helmet') owned = a.armor >= 100 && a.helmet; else if (id === 'defuser') owned = a.inv.kit;
        const cant = !owned && a.money < price;
        html += `<button class="item${owned ? ' owned' : ''}${cant ? ' cant' : ''}" data-item="${id}" data-key="${key}"><span class="key">${key}</span>${w ? (w.slot === 'grenade' ? icon(id, '#dfe3e8') : iconFor(id).replace('currentColor', '#dfe3e8')) : icon(id, '#dfe3e8')}<span class="nm"><span>${esc(name)}</span><span class="pr">${owned ? 'OWNED' : '$' + price}</span></span></button>`;
        key++;
      }
      html += `</div>`;
    }
    this.grid.innerHTML = html;
    this.grid.querySelectorAll<HTMLElement>('.item').forEach(b => { b.addEventListener('click', () => this.onBuy?.(b.dataset.item!)); b.addEventListener('mouseenter', () => { this.hovered = b.dataset.item!; this.showTip(b.dataset.item!); }); });
    this.drawPreview(a.team, a.inv.primary?.def.id ?? a.inv.secondary?.def.id ?? 'knife');
  }
  keyBuy(n: number): string | null { const b = this.grid.querySelector<HTMLElement>(`.item[data-key="${n}"]`); if (!b) return null; return b.dataset.item!; }
  private showTip(id: string) {
    const w = WEAPONS[id];
    if (w) { const rpm = w.cycleTime > 0 ? Math.round(60 / w.cycleTime) : 0; this.tip.innerHTML = `<b>${esc(w.name)} — $${w.price}</b>${w.slot === 'grenade' ? tipFor(id) : `Damage ${w.damage} · Armor pen ${Math.round(w.armorRatio * 50)}% · ${w.fullAuto ? 'Auto' : 'Semi'} ${rpm} RPM<br>Magazine ${w.magSize} · Reserve ${w.magSize * w.reserveMags} · Kill reward $${w.killAward}${w.zoomLevels ? '<br>Scoped: right-click cycles 2 zoom levels' : ''}`}`; }
    else this.tip.innerHTML = `<b>${esc((EQUIPMENT as any)[id].name)}</b>${id === 'kevlar' ? 'Absorbs body damage. Helmet needed for head protection.' : id === 'helmet' ? 'Kevlar + helmet: head shots are mitigated too.' : 'Defuse in 5 s instead of 10 s. CT only.'}`;
  }
  private drawPreview(team: 'T' | 'CT', weapon: string) {
    const c = this.previewCanvas.getContext('2d')!; const W = 300, H = 420; c.clearRect(0, 0, W, H);
    // simple silhouette agent preview (original drawing) with weapon icon overlay
    const body = team === 'CT' ? '#3b4b5e' : '#7d6b4b';
    c.fillStyle = 'rgba(0,0,0,0.25)'; c.beginPath(); c.ellipse(150, 400, 70, 12, 0, 0, 6.28); c.fill();
    c.fillStyle = body; c.fillRect(120, 150, 60, 110); c.fillStyle = team === 'CT' ? '#1f2a36' : '#3d3a33'; c.fillRect(126, 160, 48, 70);
    c.fillStyle = team === 'CT' ? '#2a323d' : '#5a4e3a'; c.fillRect(122, 260, 24, 120); c.fillRect(154, 260, 24, 120);
    c.fillStyle = '#1e1a16'; c.fillRect(118, 375, 30, 20); c.fillRect(152, 375, 30, 20);
    c.fillStyle = '#c9a27e'; c.beginPath(); c.arc(150, 125, 22, 0, 6.28); c.fill();
    c.fillStyle = team === 'CT' ? '#2b3644' : '#b8b0a0'; c.beginPath(); c.arc(150, 118, 24, Math.PI, 2 * Math.PI); c.fill();
    c.fillStyle = body; c.fillRect(100, 158, 22, 70); c.fillRect(178, 158, 22, 70);
    c.fillStyle = '#232323'; c.fillRect(100, 224, 22, 16); c.fillRect(178, 224, 22, 16);
    c.fillStyle = '#222'; c.fillRect(96, 208, 120, 10);
    c.font = '12px Arial'; c.fillStyle = '#9aa3ad'; c.textAlign = 'center'; c.fillText(`${team === 'CT' ? 'COUNTER-TERRORIST' : 'TERRORIST'} · ${WEAPONS[weapon]?.name ?? ''}`, 150, 30);
  }
}
function tipFor(id: string): string { return { he: 'Explodes after ~1.6 s. Up to 98 damage close range, less through cover.', flash: 'Blinds anyone looking at it. Duration depends on distance, angle and cover.', smoke: 'Dense cloud for 18 s that blocks vision (and bots\' perception). Extinguishes fire.', molotov: 'Breaks on impact and burns ~7 s. Area denial; bots avoid it.', incendiary: 'CT fire grenade. Burns ~7 s; area denial.' }[id] ?? ''; }
