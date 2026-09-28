import type { Settings } from '../core/settings';
import { esc } from './hud';
/** Settings rows (CS04-style tab/row styling). Every exposed option is functional and persisted. */
export function settingsPanel(s: Settings, onChange: (s: Settings) => void): HTMLElement {
  const el = document.createElement('div');
  const row = (label: string, control: string) => `<div class="opt"><label>${esc(label)}</label>${control}</div>`;
  const seg = (name: string, opts: [string, string][], cur: string) => `<div class="seg" data-seg="${name}">${opts.map(([v, l]) => `<button data-v="${v}" class="${cur === v ? 'on' : ''}">${l}</button>`).join('')}</div>`;
  el.innerHTML = `<div class="rowset">
    ${row('Mouse sensitivity', `<span><input type="range" min="0.2" max="6" step="0.05" value="${s.sensitivity}" data-k="sensitivity"> <span data-v="sensitivity">${s.sensitivity.toFixed(2)}</span></span>`)}
    ${row('Zoom sensitivity ratio', `<span><input type="range" min="0.5" max="1.5" step="0.01" value="${s.zoomSensitivityRatio}" data-k="zoomSensitivityRatio"> <span data-v="zoomSensitivityRatio">${s.zoomSensitivityRatio.toFixed(2)}</span></span>`)}
    ${row('Master volume', `<span><input type="range" min="0" max="1" step="0.02" value="${s.volume}" data-k="volume"> <span data-v="volume">${Math.round(s.volume * 100)}%</span></span>`)}
    ${row('Field of view', `<span><input type="range" min="68" max="100" step="1" value="${s.fov}" data-k="fov"> <span data-v="fov">${s.fov}</span></span>`)}
    ${row('Crosshair size', `<span><input type="range" min="1" max="14" step="1" value="${s.crosshairSize}" data-k="crosshairSize"> <span data-v="crosshairSize">${s.crosshairSize}</span></span>`)}
    ${row('Crosshair gap', `<span><input type="range" min="0" max="10" step="1" value="${s.crosshairGap}" data-k="crosshairGap"> <span data-v="crosshairGap">${s.crosshairGap}</span></span>`)}
    ${row('Crosshair color', `<input type="color" value="${s.crosshairColor}" data-k="crosshairColor">`)}
    ${row('Render scale', `<span><input type="range" min="0.5" max="1" step="0.05" value="${s.renderScale}" data-k="renderScale"> <span data-v="renderScale">${s.renderScale.toFixed(2)}</span></span>`)}
    ${row('Quality preset', seg('quality', [['low', 'Low'], ['medium', 'Medium'], ['high', 'High']], s.quality))}
    ${row('Reduced camera motion', seg('reducedMotion', [['0', 'Off'], ['1', 'On']], s.reducedMotion ? '1' : '0'))}
    ${row('Reduced flash intensity', seg('reducedFlash', [['0', 'Off'], ['1', 'On']], s.reducedFlash ? '1' : '0'))}
    ${row('Show frame time', seg('showFps', [['0', 'Off'], ['1', 'On']], s.showFps ? '1' : '0'))}
  </div>`;
  el.querySelectorAll<HTMLInputElement>('input[data-k]').forEach(inp => inp.addEventListener('input', () => {
    const k = inp.dataset.k as keyof Settings; const v: any = inp.type === 'color' ? inp.value : parseFloat(inp.value); (s as any)[k] = v;
    const lbl = el.querySelector<HTMLElement>(`[data-v="${k}"]`); if (lbl) lbl.textContent = k === 'volume' ? `${Math.round(v * 100)}%` : typeof v === 'number' ? (Number.isInteger(v) ? String(v) : v.toFixed(2)) : v;
    onChange(s);
  }));
  el.querySelectorAll<HTMLElement>('[data-seg]').forEach(sg => sg.querySelectorAll('button').forEach(b => b.addEventListener('click', () => {
    const k = sg.dataset.seg as keyof Settings; const v = b.dataset.v!; sg.querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b));
    (s as any)[k] = k === 'quality' ? v : v === '1'; onChange(s);
  })));
  return el;
}
export const CONTROLS: [string, string][] = [['W A S D', 'Move'], ['Mouse', 'Look (pointer lock)'], ['Left click', 'Fire / knife slash'], ['Right click', 'AWP scope (cycle) / knife stab'], ['Space', 'Jump'], ['Ctrl', 'Crouch'], ['Shift', 'Walk (silent)'], ['R', 'Reload'], ['1-5 / wheel', 'Select weapon'], ['Q', 'Previous weapon'], ['G', 'Drop weapon / bomb'], ['B', 'Buy menu (in spawn, buy time)'], ['E', 'Plant / defuse / swap weapon'], ['F', 'Inspect weapon'], ['Tab', 'Scoreboard (hold)'], ['Esc', 'Pause / release mouse']];
export function controlsHtml(): string { return `<div class="controls-list">${CONTROLS.map(([k, v]) => `<div><b>${esc(k)}</b>${esc(v)}</div>`).join('')}</div>`; }
