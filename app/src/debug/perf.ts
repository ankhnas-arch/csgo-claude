/** Frame-time monitor: rolling window with median/p95 and fps. */
export class PerfMonitor {
  private samples: number[] = []; private t0 = 0; private window = 240; frames = 0; startTime = performance.now();
  begin() { this.t0 = performance.now(); }
  end() { const dt = performance.now() - this.t0; this.samples.push(dt); if (this.samples.length > this.window) this.samples.shift(); this.frames++; }
  private sorted() { return this.samples.slice().sort((a, b) => a - b); }
  get median() { const s = this.sorted(); return s.length ? s[Math.floor(s.length / 2)] : 0; }
  get p95() { const s = this.sorted(); return s.length ? s[Math.min(s.length - 1, Math.floor(s.length * 0.95))] : 0; }
  get fps() { return this.frames / Math.max(0.001, (performance.now() - this.startTime) / 1000); }
  /** Frame-to-frame interval stats (what the user perceives), collected separately. */
  intervals: number[] = []; lastFrameT = 0;
  markFrame() { const n = performance.now(); if (this.lastFrameT) { this.intervals.push(n - this.lastFrameT); if (this.intervals.length > 600) this.intervals.shift(); } this.lastFrameT = n; }
  snapshot() { const s = this.sorted(); const iv = this.intervals.slice().sort((a, b) => a - b); return { cpuMedianMs: this.median, cpuP95Ms: this.p95, frameMedianMs: iv.length ? iv[Math.floor(iv.length / 2)] : 0, frameP95Ms: iv.length ? iv[Math.min(iv.length - 1, Math.floor(iv.length * 0.95))] : 0, samples: s.length, fps: this.fps }; }
  reset() { this.samples = []; this.intervals = []; this.frames = 0; this.startTime = performance.now(); }
}
