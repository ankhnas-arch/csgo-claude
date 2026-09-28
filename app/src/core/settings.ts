export type Quality = 'low' | 'medium' | 'high';
export interface Settings {
  sensitivity: number;      // degrees per mouse count * 0.022 style
  zoomSensitivityRatio: number;
  volume: number;           // 0..1
  fov: number;              // 68..90 vertical? We use horizontal-ish base "cs fov" mapped to vertical
  crosshairSize: number;
  crosshairColor: string;
  crosshairGap: number;
  reducedMotion: boolean;
  reducedFlash: boolean;
  quality: Quality;
  renderScale: number;     // 0.5..1.0 resolution scale (evidence runs on software GL use 0.5)
  showFps: boolean;
  seenControls: boolean;
}
export const DEFAULT_SETTINGS: Settings = {
  sensitivity: 2.0, zoomSensitivityRatio: 1.0, volume: 0.6, fov: 90, crosshairSize: 5, crosshairColor: '#30e830', crosshairGap: 3,
  reducedMotion: false, reducedFlash: false, quality: 'high', renderScale: 1.0, showFps: false, seenControls: false,
};
const KEY = 'cs2br.settings.v1';
export function loadSettings(): Settings {
  try { const raw = localStorage.getItem(KEY); if (raw) return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) }; } catch { /* ignore */ }
  return { ...DEFAULT_SETTINGS };
}
export function saveSettings(s: Settings): void { try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* ignore */ } }
