import { describe, expect, it } from "vitest";
import { emptyState, newEntry, newLesson, newVerb } from "./model";
import { buildCards, check, DEFAULT_SETTINGS, ratingFor, replay, scheduler, todayQueue, verbAsk, type Review } from "./srs";
import type { State } from "./types";

// Made-up lesson data only (public repo).
function state(): State {
  const s = emptyState();
  const a = newLesson("2026-11-18");
  a.entries = [newEntry("la casa", "dom"), newEntry("il gatto", null), newEntry("Non sono stanco.", "Nie jestem zmęczony.")];
  a.verbs = [newVerb("parlare"), newVerb("andare")];
  a.verbs[1].confidence = "check";
  const b = newLesson("2026-11-19");
  b.entries = [newEntry("La  Casa", "domek"), newEntry("perché", "dlaczego")];
  s.lessons = [b, a]; // out of order on purpose
  return s;
}

let n = 0;
const rev = (card_id: string, rating: Review["rating"], at: string): Review => ({ id: `r${n++}`, card_id, rating, reviewed_at: at, mode: "flash" });

describe("buildCards", () => {
  it("makes two cards per translated word, one per phrase and per checked verb; skips NULLs and repeats", () => {
    const cards = buildCards(state());
    const kinds = cards.map((c) => `${c.mode}:${c.prompt}`);
    expect(kinds).toEqual([
      "flash:la casa", "type:dom", // the older lesson wins for "la casa" / "La  Casa"
      "flash:Non sono stanco.",
      "verb:parlare", // "andare" is still "do sprawdzenia"
      "flash:perché", "type:dlaczego",
    ]);
    expect(cards.find((c) => c.prompt === "dom")!.answer).toBe("la casa");
  });

  it("asks a different person each time for a verb", () => {
    const v = buildCards(state()).find((c) => c.mode === "verb")!;
    expect(verbAsk(v, 0)).toMatchObject({ person: "io", answer: "parlo" });
    expect(verbAsk(v, 3)).toMatchObject({ person: "noi", answer: "parliamo" });
    expect(verbAsk(v, 6).person).toBe("io");
  });
});

describe("check", () => {
  it("accepts case, spacing and final punctuation; a missing accent is 'almost'", () => {
    expect(check(" La  casa ", "la casa")).toBe("ok");
    expect(check("perche", "perché")).toBe("accent");
    expect(check("perche'", "perché")).toBe("wrong");
    expect(check("", "perché")).toBe("wrong");
    expect(check("il cane", "la casa")).toBe("wrong");
    expect([ratingFor("ok"), ratingFor("accent"), ratingFor("wrong")]).toEqual([3, 2, 1]);
  });
});

describe("todayQueue", () => {
  const settings = { ...DEFAULT_SETTINGS, newPerDay: 3 };
  const day1 = new Date(2026, 10, 21, 20, 0); // local time, 21 Nov 20:00

  it("on day one offers only new cards, up to the daily limit, oldest first", async () => {
    const cards = buildCards(state());
    const q = todayQueue(cards, replay(await scheduler(0.9), []), [], day1, settings);
    expect(q.due).toEqual([]);
    expect(q.fresh.map((c) => c.prompt)).toEqual(["la casa", "dom", "Non sono stanco."]);
    expect(q.waitingNew).toBe(3);
  });

  it("picks by itself what to review on the following days", async () => {
    const cards = buildCards(state());
    const s = await scheduler(0.9);
    const t = day1.toISOString();
    const log = [rev(cards[0].id, 3, t), rev(cards[1].id, 1, t), rev(cards[2].id, 4, t)];
    const sched = replay(s, log);

    // Same evening: the new-card limit is used up; the card answered "Znowu" is due again today.
    const same = todayQueue(cards, sched, log, new Date(2026, 10, 21, 20, 5), settings);
    expect(same.newToday).toBe(3);
    expect(same.fresh).toEqual([]);
    expect(same.due.map((c) => c.id)).toEqual([cards[1].id]);

    // Next day: fresh new cards again; "Dobrze" and "Łatwe" are not due yet.
    const next = todayQueue(cards, sched, log, new Date(2026, 10, 22, 9, 0), settings);
    expect(next.fresh.map((c) => c.prompt)).toEqual(["parlare", "perché", "dlaczego"]);
    expect(next.due.map((c) => c.id)).not.toContain(cards[2].id);

    // Weeks later everything answered once is due, most overdue first.
    const later = todayQueue(cards, sched, log, new Date(2027, 0, 30, 9, 0), settings);
    expect(later.due.map((c) => c.id).sort()).toEqual([cards[0].id, cards[1].id, cards[2].id].sort());
  });

  it("ignores a duplicated answer and answers for deleted words", async () => {
    const cards = buildCards(state());
    const t = day1.toISOString();
    const a = rev(cards[0].id, 3, t);
    const sched = replay(await scheduler(0.9), [a, { ...a }, rev("gone:itpl", 3, t)]);
    expect(sched.reps.get(cards[0].id)).toBe(1);
    const q = todayQueue(cards, sched, [a], day1, settings);
    expect(q.fresh.map((c) => c.id)).not.toContain(cards[0].id);
  });
});
