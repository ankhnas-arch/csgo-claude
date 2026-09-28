export type Handler<T> = (payload: T) => void;
export class Emitter<Events extends Record<string, unknown>> {
  private map = new Map<keyof Events, Set<Handler<any>>>();
  on<K extends keyof Events>(k: K, h: Handler<Events[K]>): () => void {
    let s = this.map.get(k); if (!s) { s = new Set(); this.map.set(k, s); }
    s.add(h); return () => s!.delete(h);
  }
  emit<K extends keyof Events>(k: K, p: Events[K]): void {
    const s = this.map.get(k); if (!s) return;
    for (const h of Array.from(s)) h(p);
  }
  clear(): void { this.map.clear(); }
}
