import { WEAPONS, type WeaponDef } from '../data/weapons';

export type WeaponAction = 'idle' | 'draw' | 'fire' | 'reload' | 'inspect' | 'rechamber' | 'throwPrep' | 'throw' | 'plant' | 'holstered';

/** Per-inventory-slot weapon instance: owns ammo and its animation/rules state machine. */
export class WeaponInstance {
  def: WeaponDef;
  mag: number; reserve: number;
  action: WeaponAction = 'holstered';
  actionTime = 0;       // elapsed in current action
  actionDur = 0;
  reloadInserted = false;
  nextFire = 0;         // sim time when next shot allowed
  zoomLevel = 0;        // AWP: 0,1,2
  needsRechamber = false;
  inaccuracy = 0;       // accumulated
  stab = false;         // knife: last attack was a stab (RMB) -> presentation picks the 'fire2' clip
  shotsInBurst = 0;
  recoilIndex = 0;
  constructor(def: WeaponDef) {
    this.def = def; this.mag = def.magSize; this.reserve = def.magSize * def.reserveMags;
  }
  get id() { return this.def.id; }
  get totalAmmo() { return this.mag + this.reserve; }
  get busy() { return this.action === 'draw' || this.action === 'reload' || this.action === 'rechamber' || this.action === 'throw' || this.action === 'throwPrep'; }
  get canFire() { return (this.action === 'idle' || this.action === 'inspect' || this.action === 'fire') && !this.needsRechamber; }
  startAction(a: WeaponAction, dur: number) { this.action = a; this.actionTime = 0; this.actionDur = dur; if (a === 'reload') this.reloadInserted = false; }
  /** Advance the state machine. Returns events to emit. */
  tick(dt: number, now: number): ('reloadInsert' | 'reloadEnd' | 'drawEnd' | 'inspectEnd' | 'rechamberEnd' | 'fireEnd')[] {
    const ev: ('reloadInsert' | 'reloadEnd' | 'drawEnd' | 'inspectEnd' | 'rechamberEnd' | 'fireEnd')[] = [];
    if (this.action === 'idle' || this.action === 'holstered') { this.decayInaccuracy(dt); return ev; }
    this.actionTime += dt;
    this.decayInaccuracy(dt);
    if (this.action === 'reload') {
      const insertAt = this.def.demo.reloadTime * this.def.demo.ammoInsertAt;
      if (!this.reloadInserted && this.actionTime >= insertAt) {
        this.reloadInserted = true;
        const n = Math.min(this.def.magSize - this.mag, this.reserve);
        this.mag += n; this.reserve -= n; ev.push('reloadInsert');
      }
      if (this.actionTime >= this.actionDur) { this.action = 'idle'; ev.push('reloadEnd'); if (this.def.zoomLevels) this.needsRechamber = false; }
    } else if (this.actionTime >= this.actionDur) {
      const prev = this.action; this.action = 'idle';
      if (prev === 'draw') ev.push('drawEnd');
      if (prev === 'inspect') ev.push('inspectEnd');
      if (prev === 'rechamber') { this.needsRechamber = false; ev.push('rechamberEnd'); }
      if (prev === 'fire') ev.push('fireEnd');
    }
    void now;
    return ev;
  }
  private decayInaccuracy(dt: number) {
    if (this.inaccuracy <= 0) return;
    const rt = Math.max(0.05, this.def.recoveryTimeStand);
    this.inaccuracy = Math.max(0, this.inaccuracy - dt * (this.def.inaccuracyFire * 3 + 0.02) / rt);
    if (this.shotsInBurst > 0 && this.action !== 'fire') { this.burstDecay += dt; if (this.burstDecay > rt * 1.5) { this.shotsInBurst = 0; this.recoilIndex = 0; this.burstDecay = 0; } }
  }
  burstDecay = 0;
  /** Attempt to reload. Returns false if impossible (full mag, no reserve, busy). */
  tryReload(): boolean {
    if (this.def.magSize === 0) return false;
    if (this.mag >= this.def.magSize || this.reserve <= 0) return false;
    if (this.action === 'reload' || this.action === 'draw' || this.action === 'rechamber') return false;
    this.zoomLevel = 0;
    this.startAction('reload', this.def.demo.reloadTime);
    return true;
  }
  /** Interrupt any in-progress action (switching/dropping/dying). Ammo already inserted stays; not-yet-inserted is not granted. */
  interrupt() {
    if (this.action === 'reload' && !this.reloadInserted) { /* nothing granted */ }
    if (this.action === 'rechamber') this.needsRechamber = true; // rechamber interrupted: still needs it later
    this.action = 'holstered'; this.actionTime = 0; this.zoomLevel = 0;
  }
  draw() { this.startAction('draw', this.def.demo.drawTime); this.zoomLevel = 0; }
  fire(now: number): boolean {
    if (!this.canFire || now < this.nextFire) return false;
    if (this.def.magSize > 0 && this.mag <= 0) return false;
    if (this.def.magSize > 0) this.mag--;
    this.nextFire = now + this.def.cycleTime;
    this.inaccuracy = Math.min(0.35, this.inaccuracy + this.def.inaccuracyFire);
    this.shotsInBurst++; this.recoilIndex++; this.burstDecay = 0;
    this.startAction('fire', Math.min(this.def.cycleTime, 0.12));
    if (this.def.zoomLevels > 0) {
      // AWP: unzoom after shot and require rechamber before next shot
      this.needsRechamber = true;
    }
    return true;
  }
  static create(id: string): WeaponInstance { return new WeaponInstance(WEAPONS[id]); }
}
