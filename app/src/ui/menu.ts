import type { Settings } from '../core/settings';
import { settingsPanel, controlsHtml } from './settings';
import { WEAPONS } from '../data/weapons';
import { esc } from './hud';
import type { BotDifficulty } from '../data/match';

export interface SetupChoice { team: 'T' | 'CT'; difficulty: BotDifficulty; economy: 'showcase' | 'standard'; seed: number | null; }
export interface MenuCallbacks { onPlay: (c: SetupChoice) => void; onSettings: (s: Settings) => void; onLoadoutChange: (l: Loadout) => void; }
export interface Loadout { tPrimary: string; ctPrimary: string; }

/** Main menu: shallow top navigation (CS01), live 3D scene behind, Play / Equipment / Settings / Credits. */
export class MainMenu {
  el: HTMLElement; private panel: HTMLElement; private body: HTMLElement; private active = '';
  loadout: Loadout = { tPrimary: 'ak47', ctPrimary: 'm4a4' };
  constructor(root: HTMLElement, private settings: Settings, private cb: MenuCallbacks) {
    this.el = document.createElement('div'); this.el.id = 'menu'; this.el.className = 'hidden';
    this.el.innerHTML = `<div class="topbar"><div class="brand">COUNTER-STRIKE 2<small>UNOFFICIAL BROWSER RECREATION</small></div><button class="nav" data-nav="play">Play</button><button class="nav" data-nav="equipment">Equipment</button><button class="nav" data-nav="settings">Settings</button><button class="nav" data-nav="credits">Credits</button><div class="right"><span>Prototype · shortened rules</span><span>v0.1</span></div></div><div class="body"><div class="playbox"><span class="hint">Local 5v5 vs bots · first to 4 rounds</span><button class="btn primary" data-nav="play">PLAY</button></div><div class="panel hidden" data-q="panel"></div></div>`;
    root.appendChild(this.el);
    this.panel = this.el.querySelector('[data-q="panel"]')!; this.body = this.el.querySelector('.body')!;
    this.el.querySelectorAll<HTMLElement>('[data-nav]').forEach(b => b.addEventListener('click', () => this.nav(b.dataset.nav!)));
  }
  show(v: boolean) { this.el.classList.toggle('hidden', !v); if (v) this.nav(''); }
  nav(which: string) {
    this.active = which; this.el.querySelectorAll<HTMLElement>('.topbar .nav').forEach(b => b.classList.toggle('active', b.dataset.nav === which));
    this.panel.classList.toggle('hidden', which === ''); this.body.querySelector<HTMLElement>('.playbox')!.classList.toggle('hidden', which !== '');
    if (which === 'play') this.renderSetup(); else if (which === 'equipment') this.renderEquipment(); else if (which === 'settings') this.renderSettings(); else if (which === 'credits') this.renderCredits();
  }
  private renderSetup() {
    const c: SetupChoice = { team: 'T', difficulty: 'easy', economy: 'showcase', seed: null };
    this.panel.innerHTML = `<h2>Match setup</h2><div id="setup">
      <div class="opt"><label>Your side</label><div class="seg" data-k="team"><button data-v="T" class="on">Attackers (T)</button><button data-v="CT">Defenders (CT)</button></div></div>
      <div class="opt"><label>Bot difficulty</label><div class="seg" data-k="difficulty"><button data-v="easy" class="on">Easy</button><button data-v="hard">Hard</button></div></div>
      <div class="opt"><label>Economy preset</label><div class="seg" data-k="economy"><button data-v="showcase" class="on">Showcase ($3000 start)</button><button data-v="standard">Standard ($800 start)</button></div></div>
      <div class="opt"><label>Scenario seed (optional)</label><input type="number" data-k="seed" placeholder="random" style="width:120px;background:#182029;color:#fff;border:1px solid #3b4756;padding:6px"></div>
      <div class="note">Shortened prototype rules: first to 4 rounds, sides switch after 3 rounds, 12 s freeze/buy, 90 s round, 35 s bomb, 5 s result. These are chosen demo values, not official Counter-Strike 2 settings. Plant 3.2 s, defuse 10 s (5 s with kit).<br>${controlsHtml()}</div>
      <div style="margin-top:14px;display:flex;justify-content:flex-end"><button class="btn primary" data-q="start">START MATCH</button></div></div>`;
    this.panel.querySelectorAll<HTMLElement>('.seg[data-k]').forEach(sg => sg.querySelectorAll('button').forEach(b => b.addEventListener('click', () => { sg.querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b)); (c as any)[sg.dataset.k!] = b.dataset.v; })));
    this.panel.querySelector<HTMLButtonElement>('[data-q="start"]')!.addEventListener('click', () => { const sv = this.panel.querySelector<HTMLInputElement>('[data-k="seed"]')!.value; c.seed = sv ? parseInt(sv, 10) : null; this.cb.onPlay(c); });
  }
  private renderEquipment() {
    const prim = (team: 'T' | 'CT') => Object.values(WEAPONS).filter(w => w.slot === 'primary' && (w.team === team || w.team === 'both'));
    const cards = (team: 'T' | 'CT') => prim(team).map(w => `<div class="equip-card${(team === 'T' ? this.loadout.tPrimary : this.loadout.ctPrimary) === w.id ? ' on' : ''}" data-team="${team}" data-w="${w.id}"><b>${esc(w.name)}</b><small>$${w.price} · ${w.damage} dmg · ${w.magSize} rounds</small></div>`).join('');
    this.panel.innerHTML = `<h2>Equipment — preferred rifle for Auto-buy</h2><p style="color:var(--muted);font-size:13px">Terrorist side</p><div class="equip-grid">${cards('T')}</div><p style="color:var(--muted);font-size:13px;margin-top:14px">Counter-Terrorist side</p><div class="equip-grid">${cards('CT')}</div><p style="color:var(--muted);font-size:12px;margin-top:14px">Sidearms are fixed per side (Glock-18 / USP-S). Knife is always carried. Skins, store and inventory services are intentionally omitted.</p>`;
    this.panel.querySelectorAll<HTMLElement>('.equip-card').forEach(cd => cd.addEventListener('click', () => { if (cd.dataset.team === 'T') this.loadout.tPrimary = cd.dataset.w!; else this.loadout.ctPrimary = cd.dataset.w!; this.cb.onLoadoutChange(this.loadout); this.renderEquipment(); }));
  }
  private renderSettings() { this.panel.innerHTML = `<h2>Settings</h2>`; this.panel.appendChild(settingsPanel(this.settings, s => this.cb.onSettings(s))); const c = document.createElement('div'); c.innerHTML = `<h2 style="margin-top:18px">Controls</h2>${controlsHtml()}`; this.panel.appendChild(c); }
  private renderCredits() {
    this.panel.innerHTML = `<h2>Credits & provenance</h2><div class="credits">
      <p>An unofficial, non-commercial browser recreation built for a YouTube comparison demonstration. Counter-Strike and Counter-Strike 2 are trademarks of Valve Corporation. This project is not affiliated with or endorsed by Valve.</p>
      <p>All geometry, textures, characters, weapon models (authored in Blender 4.5 via bpy scripts), sounds (synthesised with WebAudio) and UI are original work created for this recreation. Reference screenshots were used as visual study only and are not shipped as assets.</p>
      <p>Gameplay constants come from the public CS2 game data files (weapons.vdata, gamemode_competitive.cfg) as mirrored by SteamDatabase/GameTracking-CS2; timings shortened for the demo are labelled in Match setup.</p>
      <p>Technology: TypeScript, Vite, Three.js, Rapier physics.</p></div>`;
  }
}
