// Spaced repetition (M5). Cards are not stored anywhere: they come from the lessons (a word with a translation
// gives two cards, a checked verb one), and their schedule comes from replaying the log of answers through
// FSRS, the algorithm modern Anki uses. The log only grows, so phone and laptop merge it without conflicts,
// and the whole thing works offline. Pure functions here; storage and sync are in lib/reviews.ts.
import { DefaultScheduler } from "ts-fsrs";
import { accentKey } from "./lexicon";
import { PERS, PERS_LABEL } from "./conjugate";
import type { Person, State } from "./types";

export type Mode = "flash" | "type" | "verb";

/** One thing to practise. `id` is stable: "<entry id>:itpl", "<entry id>:plit" or "<verb id>:forms". */
export interface Card {
  id: string;
  mode: Mode;
  prompt: string; // what the user sees
  answer: string; // what is checked (or shown on a flashcard)
  hint?: string; // small text under the prompt
  forms?: Record<Person, string>; // verb cards: all forms, the person is picked per review
}

/** One answer, as stored in IndexedDB and on the server (`seq` is set by the server). */
export interface Review {
  id: string;
  card_id: string;
  rating: 1 | 2 | 3 | 4; // FSRS: again, hard, good, easy
  reviewed_at: string; // ISO time
  mode: Mode;
  answer?: string | null;
  duration_ms?: number;
  seq?: number;
}

export interface Settings {
  newPerDay: number;
  retention: number; // share of cards you should still remember when they come back, 0.80–0.97
}
export const DEFAULT_SETTINGS: Settings = { newPerDay: 10, retention: 0.9 };

export const RATING_LABEL: Record<1 | 2 | 3 | 4, string> = { 1: "Znowu", 2: "Trudne", 3: "Dobrze", 4: "Łatwe" };

/** The same word in two lessons is one card (the first time it was written down). */
const dedupKey = (s: string) => accentKey(s.toLowerCase().replace(/\s+/g, " ").trim());

export function buildCards(state: State): Card[] {
  const cards: Card[] = [];
  const seen = new Set<string>();
  const lessons = [...state.lessons].sort((a, b) => (a.date ?? "").localeCompare(b.date ?? "") || a.created_at.localeCompare(b.created_at));
  for (const l of lessons) {
    for (const e of l.entries) {
      const it = e.it?.trim();
      const pl = e.pl?.trim();
      if (!it || !pl) continue; // no translation yet: nothing to learn from
      const key = dedupKey(it);
      if (seen.has(key)) continue;
      seen.add(key);
      cards.push({ id: `${e.id}:itpl`, mode: "flash", prompt: it, answer: pl, hint: "co to znaczy?" });
      // Typing a whole sentence from memory is a different exercise; phrases stay flashcards only.
      if (e.kind === "word") cards.push({ id: `${e.id}:plit`, mode: "type", prompt: pl, answer: it, hint: "napisz po włosku" });
    }
    for (const v of l.verbs ?? []) {
      // "do sprawdzenia" forms are a guess: they are not drilled until Claude or the user confirms them.
      if (!v.forms || v.confidence === "check") continue;
      const key = "verb:" + dedupKey(v.it);
      if (seen.has(key)) continue;
      seen.add(key);
      cards.push({ id: `${v.id}:forms`, mode: "verb", prompt: v.it, answer: "", hint: v.pl ?? undefined, forms: v.forms });
    }
  }
  return cards;
}

/** Verb cards ask a different person each time: io, tu, lui, … in turn. */
export function verbAsk(card: Card, reps: number): { person: Person; label: string; answer: string } {
  const person = PERS[reps % PERS.length];
  return { person, label: PERS_LABEL[person], answer: card.forms?.[person] ?? "" };
}

/** Compare a typed answer: exact (case and spacing aside), right but without accents, or wrong. */
export function check(typed: string, expected: string): "ok" | "accent" | "wrong" {
  const t = typed.replace(/[’`]/g, "'").toLowerCase().replace(/\s+/g, " ").replace(/[.!?]+$/, "").trim();
  const e = expected.replace(/[’`]/g, "'").toLowerCase().replace(/\s+/g, " ").replace(/[.!?]+$/, "").trim();
  if (!t) return "wrong";
  if (t === e) return "ok";
  return accentKey(t) === accentKey(e) ? "accent" : "wrong";
}

/** The rating a typed answer earns: right = good, only accents wrong = hard, wrong = again. */
export const ratingFor = (c: ReturnType<typeof check>): 1 | 2 | 3 => (c === "ok" ? 3 : c === "accent" ? 2 : 1);

/* ---------- FSRS ---------- */

/** The part of the ts-fsrs scheduler we use. (Its own type is a union over FSRS versions, too wide to call.) */
export interface CardState { readonly dueAt: Date; readonly reps: number; readonly [field: string]: unknown }
interface Scheduler {
  newCard(a: { now: Date; cardId: string }): CardState;
  review(a: { card: CardState; grade: 1 | 2 | 3 | 4; now: Date }): { card: CardState };
}

const schedulers = new Map<number, Promise<Scheduler>>();
/** One scheduler per retention setting. Learning steps are off: in a daily app a card comes back on another day;
 * a card answered "Znowu" is shown again at the end of the same session instead (see Session). */
export function scheduler(retention: number): Promise<Scheduler> {
  let s = schedulers.get(retention);
  if (!s) {
    s = DefaultScheduler({ desiredRetention: retention, enableShortTerm: false, enableFuzz: false }) as unknown as Promise<Scheduler>;
    schedulers.set(retention, s);
  }
  return s;
}

export interface Schedule {
  states: Map<string, CardState>; // only cards answered at least once
  reps: Map<string, number>;
}

/** Replay every answer, oldest first, to get each card's current state. Answers for cards that no longer
 * exist (word deleted) are skipped, and so are duplicates. */
export function replay(s: Scheduler, reviews: Review[]): Schedule {
  const states = new Map<string, CardState>();
  const reps = new Map<string, number>();
  const seen = new Set<string>();
  const sorted = [...reviews].sort((a, b) => a.reviewed_at.localeCompare(b.reviewed_at) || a.id.localeCompare(b.id));
  for (const r of sorted) {
    if (seen.has(r.id)) continue;
    seen.add(r.id);
    const now = new Date(r.reviewed_at);
    const prev = states.get(r.card_id) ?? s.newCard({ now, cardId: r.card_id });
    states.set(r.card_id, s.review({ card: prev, grade: r.rating, now }).card);
    reps.set(r.card_id, (reps.get(r.card_id) ?? 0) + 1);
  }
  return { states, reps };
}

/** Local midnight that ends the day `now` is in: everything due before it is "for today". */
export function endOfDay(now: Date): Date {
  const d = new Date(now);
  d.setHours(24, 0, 0, 0);
  return d;
}
const startOfDay = (now: Date) => { const d = new Date(now); d.setHours(0, 0, 0, 0); return d; };

export interface Queue {
  due: Card[]; // answered before and due today, most overdue first
  fresh: Card[]; // never answered, oldest first, up to what is left of today's new-card limit
  newToday: number; // new cards already started today
  waitingNew: number; // never-answered cards left after today's portion
  nextDue: Date | null; // the earliest card due after today, for "następna powtórka: …"
}

/** What to practise today. This is the "app picks what to review every day" from the M5 gate. */
export function todayQueue(cards: Card[], sched: Schedule, reviews: Review[], now: Date, settings: Settings): Queue {
  const eod = endOfDay(now).getTime();
  const sod = startOfDay(now).getTime();
  const firstSeen = new Map<string, number>();
  for (const r of reviews) {
    const t = Date.parse(r.reviewed_at);
    if (t < (firstSeen.get(r.card_id) ?? Infinity)) firstSeen.set(r.card_id, t);
  }
  const newToday = [...firstSeen.values()].filter((t) => t >= sod && t < eod).length;
  const due: Card[] = [];
  const never: Card[] = [];
  let nextDue: number | null = null;
  for (const c of cards) {
    const st = sched.states.get(c.id);
    if (!st) { never.push(c); continue; }
    const t = new Date(st.dueAt).getTime();
    if (t < eod) due.push(c);
    else if (nextDue === null || t < nextDue) nextDue = t;
  }
  due.sort((a, b) => new Date(sched.states.get(a.id)!.dueAt).getTime() - new Date(sched.states.get(b.id)!.dueAt).getTime());
  // `never` keeps the order of buildCards: lessons by date, rows in the order they were written.
  const room = Math.max(0, settings.newPerDay - newToday);
  return { due, fresh: never.slice(0, room), newToday, waitingNew: Math.max(0, never.length - room), nextDue: nextDue === null ? null : new Date(nextDue) };
}
