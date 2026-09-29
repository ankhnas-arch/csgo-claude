import type { PlayerInput } from '../sim/types';
import { EMPTY_INPUT } from '../sim/types';

/** Keyboard/mouse capture with pointer lock. Prevents browser defaults only while the game owns input. */
export class InputSys {
  keys = new Set<string>(); private dx = 0; private dy = 0; private scroll = 0;
  private pressed = new Set<string>(); private mousePressed = new Set<number>(); mouseDown = new Set<number>();
  locked = false; enabled = false; wantsLock = false;
  onEscape: (() => void) | null = null; onLockChange: ((locked: boolean) => void) | null = null; onKeyPress: ((code: string) => void) | null = null; onClickUnlocked: (() => void) | null = null;
  constructor(private canvas: HTMLCanvasElement) {
    window.addEventListener('keydown', e => {
      if (e.code === 'Escape') { if (!this.enabled) return; if (this.locked) { this.releaseLock(); this.locked = false; } this.onEscape?.(); return; }
      if (!this.enabled) return;
      if (e.repeat) return;
      this.keys.add(e.code); this.pressed.add(e.code); this.onKeyPress?.(e.code);
      if (this.locked && ['Space', 'Tab', 'KeyR', 'KeyB', 'KeyE', 'KeyG', 'KeyF', 'KeyQ', 'ControlLeft', 'ShiftLeft', 'Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5', 'KeyW', 'KeyA', 'KeyS', 'KeyD'].includes(e.code)) e.preventDefault();
      if (e.code === 'Tab' && this.enabled) e.preventDefault();
    });
    window.addEventListener('keyup', e => { this.keys.delete(e.code); });
    window.addEventListener('blur', () => { this.clear(); });
    document.addEventListener('visibilitychange', () => { if (document.hidden) this.clear(); });
    this.canvas.addEventListener('mousemove', e => { if (this.locked) { this.dx += e.movementX; this.dy += e.movementY; } });
    // While pointer-locked, button/wheel events belong to the game wherever the (hidden) cursor is; otherwise only canvas clicks matter.
    window.addEventListener('mousedown', e => { if (!this.enabled) return; if (this.locked) { this.mouseDown.add(e.button); this.mousePressed.add(e.button); e.preventDefault(); } else if (e.target === this.canvas) { this.onClickUnlocked?.(); } });
    window.addEventListener('mouseup', e => { this.mouseDown.delete(e.button); });
    window.addEventListener('contextmenu', e => { if (this.locked || e.target === this.canvas) e.preventDefault(); });
    window.addEventListener('wheel', e => { if (this.locked) { this.scroll += Math.sign(e.deltaY); e.preventDefault(); } }, { passive: false });
    document.addEventListener('pointerlockchange', () => { const l = document.pointerLockElement === this.canvas; if (l !== this.locked) { this.locked = l; if (!l) { this.clear(); if (this.wantsLock) { this.wantsLock = false; this.onEscape?.(); } } this.onLockChange?.(l); } });
    document.addEventListener('pointerlockerror', () => { this.locked = false; this.onLockChange?.(false); });
  }
  clear() { this.keys.clear(); this.pressed.clear(); this.mouseDown.clear(); this.mousePressed.clear(); this.dx = this.dy = 0; this.scroll = 0; }
  requestLock() { this.wantsLock = true; try { const p: any = this.canvas.requestPointerLock({ unadjustedMovement: true } as any); if (p && p.catch) p.catch(() => { try { this.canvas.requestPointerLock(); } catch { /* ignore */ } }); } catch { try { this.canvas.requestPointerLock(); } catch { /* ignore */ } } }
  releaseLock() { this.wantsLock = false; if (document.pointerLockElement) document.exitPointerLock(); }
  isDown(code: string) { return this.keys.has(code); }
  /** Consume one frame of input. */
  poll(): PlayerInput {
    const k = (c: string) => this.keys.has(c);
    const forward = (k('KeyW') ? 1 : 0) - (k('KeyS') ? 1 : 0), right = (k('KeyD') ? 1 : 0) - (k('KeyA') ? 1 : 0);
    let slot: number | null = null; for (let i = 1; i <= 5; i++) if (this.pressed.has('Digit' + i)) slot = i;
    const inp: PlayerInput = { ...EMPTY_INPUT, forward, right, jump: k('Space') || this.pressed.has('Space'), crouch: k('ControlLeft') || k('ControlRight'), walk: k('ShiftLeft') || k('ShiftRight'), fire: this.mouseDown.has(0), firePressed: this.mousePressed.has(0), altPressed: this.mousePressed.has(2), reload: this.pressed.has('KeyR'), inspect: this.pressed.has('KeyF'), interact: k('KeyE'), drop: this.pressed.has('KeyG'), slot, scroll: this.scroll, prevWeapon: this.pressed.has('KeyQ'), lookDx: this.dx, lookDy: this.dy };
    this.pressed.clear(); this.mousePressed.clear(); this.dx = this.dy = 0; this.scroll = 0;
    return inp;
  }
  wasPressed(code: string) { return this.pressed.has(code); }
}
