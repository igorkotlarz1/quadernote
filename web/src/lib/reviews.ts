// The review log on this device (M5): answers are written to IndexedDB at once (so airplane mode loses
// nothing), sent to the server when it is reachable, and answers made on the other device are fetched.
// The schedule is recomputed from the whole log after every change (lib/srs.ts); for a personal log of
// a few thousand answers that takes milliseconds.
import { useSyncExternalStore } from "react";
import { store } from "./store";
import { buildCards, DEFAULT_SETTINGS, replay, scheduler, type Card, type Review, type Schedule, type Settings } from "./srs";
import { uid } from "./text";

const LS_KEY = "quaderno.reviews.v1"; // only where IndexedDB is blocked
const SYNC_EVERY_MS = 60_000;

class Reviews {
  reviews: Review[] = [];
  settings: Settings = { ...DEFAULT_SETTINGS };
  sched: Schedule = { states: new Map(), reps: new Map() };
  cards: Card[] = [];
  ready = false;
  private lastSeq = 0;
  private busy = false;
  private version = 0;
  private cardsFor = -1; // store.version the cards were built from
  private listeners = new Set<() => void>();

  async start() {
    const db = store.db;
    if (db) {
      this.reviews = await db.reviews.toArray();
      const meta = await db.meta.bulkGet(["srs_settings", "srs_last_seq"]);
      this.settings = { ...DEFAULT_SETTINGS, ...((meta[0]?.value as Settings | undefined) ?? {}) };
      this.lastSeq = (meta[1]?.value as number | undefined) ?? 0;
    } else {
      try {
        const saved = JSON.parse(localStorage.getItem(LS_KEY) || "{}");
        this.reviews = saved.reviews ?? [];
        this.settings = { ...DEFAULT_SETTINGS, ...(saved.settings ?? {}) };
        this.lastSeq = saved.lastSeq ?? 0;
      } catch { /* start empty */ }
    }
    await this.recompute();
    this.ready = true;
    this.emit();
    // Lessons change (a new word, a fixed translation): rebuild the cards, the answers stay.
    store.subscribe(() => { if (store.version !== this.cardsFor) this.emit(); });
    void this.syncNow();
    setInterval(() => { if (document.visibilityState === "visible") void this.syncNow(); }, SYNC_EVERY_MS);
    window.addEventListener("online", () => void this.syncNow());
    document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") void this.syncNow(); });
  }

  /** Cards from the current lessons (cached until the lessons change). */
  allCards(): Card[] {
    if (store.version !== this.cardsFor) { this.cards = buildCards(store.state); this.cardsFor = store.version; }
    return this.cards;
  }

  private async recompute() {
    this.sched = replay(await scheduler(this.settings.retention), this.reviews);
  }

  /** Save one answer. It counts at once; the server gets it on the next sync. */
  async answer(card: Card, rating: Review["rating"], extra: { answer?: string | null; duration_ms?: number } = {}) {
    const r: Review = { id: uid(), card_id: card.id, rating, reviewed_at: new Date().toISOString(), mode: card.mode, answer: extra.answer ?? null, duration_ms: Math.max(0, Math.round(extra.duration_ms ?? 0)) };
    this.reviews.push(r);
    await this.persist([r]);
    await this.recompute();
    this.emit();
    void this.syncNow();
    return r;
  }

  async saveSettings(next: Partial<Settings>) {
    this.settings = { ...this.settings, ...next };
    if (store.db) await store.db.meta.put({ key: "srs_settings", value: { ...this.settings } }).catch(() => {});
    else this.persistLs();
    await this.recompute();
    this.emit();
  }

  /** Answers the server has not got yet. */
  pending(): number {
    return this.reviews.filter((r) => r.seq === undefined).length;
  }

  private async persist(rows: Review[]) {
    if (store.db) { await store.db.reviews.bulkPut(rows.map((r) => ({ ...r }))).catch(() => {}); return; }
    this.persistLs();
  }

  private persistLs() {
    try { localStorage.setItem(LS_KEY, JSON.stringify({ reviews: this.reviews, settings: this.settings, lastSeq: this.lastSeq })); } catch { /* full */ }
  }

  /** Send our new answers, then fetch everything newer than what we have. Quiet when there is no server. */
  async syncNow() {
    if (this.busy) return;
    this.busy = true;
    try {
      const unsent = this.reviews.filter((r) => r.seq === undefined);
      if (unsent.length) {
        const res = await fetch("/api/reviews", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ reviews: unsent.map(({ seq: _s, ...r }) => r) }) });
        if (!res.ok || !(res.headers.get("content-type") || "").includes("json")) return;
      }
      let more = true;
      const byId = new Map(this.reviews.map((r) => [r.id, r] as const));
      const changed: Review[] = [];
      while (more) {
        const res = await fetch(`/api/reviews?after=${this.lastSeq}`);
        if (!res.ok || !(res.headers.get("content-type") || "").includes("json")) return;
        const page = (await res.json()) as { reviews: Review[]; more: boolean };
        for (const r of page.reviews) {
          const mine = byId.get(r.id);
          if (mine) { if (mine.seq === undefined) { mine.seq = r.seq; changed.push(mine); } }
          else { byId.set(r.id, r); this.reviews.push(r); changed.push(r); }
          this.lastSeq = Math.max(this.lastSeq, r.seq ?? 0);
        }
        more = page.more && page.reviews.length > 0;
      }
      if (changed.length) {
        await this.persist(changed);
        await this.recompute();
        this.emit();
      }
      if (store.db) await store.db.meta.put({ key: "srs_last_seq", value: this.lastSeq }).catch(() => {});
      else this.persistLs();
    } catch {
      /* offline or no server: the answers wait in IndexedDB */
    } finally {
      this.busy = false;
    }
  }

  private emit() { this.version++; this.listeners.forEach((l) => l()); }
  subscribe = (l: () => void) => { this.listeners.add(l); return () => { this.listeners.delete(l); }; };
  getVersion = () => this.version;
}

export const reviews = new Reviews();

export function useReviews(): Reviews {
  useSyncExternalStore(reviews.subscribe, reviews.getVersion);
  return reviews;
}
