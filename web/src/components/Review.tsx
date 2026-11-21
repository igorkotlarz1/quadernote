import { useRef, useState } from "react";
import { useReviews } from "../lib/reviews";
import { check, RATING_LABEL, ratingFor, todayQueue, verbAsk, type Card } from "../lib/srs";
import { useStore } from "../lib/store";
import { fixBacktick, plw } from "../lib/text";

const fmtNext = (d: Date) =>
  d.toLocaleDateString("pl-PL", { weekday: "long", day: "numeric", month: "long" });

/** "Powtórka": today's queue picked by FSRS, one card at a time. */
export function Review() {
  useStore(); // re-render when lessons change: new words become new cards
  const r = useReviews();
  const [open, setOpen] = useState(false);
  const [cardId, setCardId] = useState<string | null>(null);
  const [shown, setShown] = useState(false); // flashcard flipped
  const [typed, setTyped] = useState("");
  const [result, setResult] = useState<ReturnType<typeof check> | null>(null);
  const [done, setDone] = useState(0); // answered in this session
  const started = useRef(0);
  const input = useRef<HTMLInputElement>(null);

  if (!r.ready) return null;
  const cards = r.allCards();
  const now = new Date();
  const q = todayQueue(cards, r.sched, r.reviews, now, r.settings);
  const left = q.due.length + q.fresh.length;

  /** Overdue cards first, then new ones, then cards answered "Znowu" earlier today. */
  function pickNext(): Card | null {
    const t = Date.now();
    const ready = q.due.find((c) => new Date(r.sched.states.get(c.id)!.dueAt).getTime() <= t);
    return ready ?? q.fresh[0] ?? q.due[0] ?? null;
  }
  const card = open ? cards.find((c) => c.id === cardId) ?? null : null;

  function show(next: Card | null) {
    setCardId(next?.id ?? null);
    setShown(false); setTyped(""); setResult(null);
    started.current = Date.now();
    if (next && next.mode !== "flash") setTimeout(() => input.current?.focus(), 30);
  }
  function start() { setOpen(true); setDone(0); show(pickNext()); }

  async function rate(c: Card, rating: 1 | 2 | 3 | 4, answer?: string) {
    await r.answer(c, rating, { answer: answer ?? null, duration_ms: Date.now() - started.current });
    setDone((n) => n + 1);
  }
  /** After an answer the queue is recomputed (a "Znowu" card comes back later today); take the next one. */
  function next() {
    const fresh = todayQueue(r.allCards(), r.sched, r.reviews, new Date(), r.settings);
    const t = Date.now();
    const ready = fresh.due.find((c) => new Date(r.sched.states.get(c.id)!.dueAt).getTime() <= t);
    show(ready ?? fresh.fresh[0] ?? fresh.due[0] ?? null);
  }

  const verb = card?.mode === "verb" ? verbAsk(card, r.sched.reps.get(card.id) ?? 0) : null;
  const expected = card ? (verb ? verb.answer : card.answer) : "";

  async function submitTyped() {
    if (!card || result) return;
    const res = check(typed, expected);
    setResult(res);
    await rate(card, ratingFor(res), typed);
  }

  return (
    <section className="review" id="review" aria-label="Powtórka" data-enter="2">
      <div className="review-head">
        <div>
          <div className="eyebrow"><b>Powtórka</b><span>FSRS · offline</span></div>
          <p className="review-sum" id="review-sum">
            {cards.length === 0
              ? "Karty powstają ze słówek z tłumaczeniem. Wpisz lekcję, a jutro będzie co powtarzać."
              : left
                ? <>Na dziś: <b>{plw(q.due.length, "karta", "karty", "kart")}</b> do powtórki i <b>{plw(q.fresh.length, "nowa", "nowe", "nowych")}</b></>
                : <>Na dziś wszystko powtórzone{q.nextDue ? <>. Następna powtórka: <b>{fmtNext(q.nextDue)}</b></> : null}</>}
          </p>
        </div>
        {!open && left > 0 && <button className="primary" type="button" id="review-start" onClick={start}>Zacznij powtórkę</button>}
        {open && <button className="quiet" type="button" id="review-close" onClick={() => setOpen(false)}>Zamknij</button>}
      </div>

      {open && !card && (
        <div className="rcard done" id="review-done">
          <p><b>Koniec na dziś</b> · {plw(done, "odpowiedź", "odpowiedzi", "odpowiedzi")} w tej sesji.</p>
          {q.nextDue && <p>Aplikacja sama wybierze, co powtórzyć: następne karty {fmtNext(q.nextDue)}.</p>}
        </div>
      )}

      {open && card && (
        <div className={"rcard mode-" + card.mode} id="review-card" data-card={card.id}>
          <div className="rmeta"><span>{card.mode === "flash" ? "IT → PL" : card.mode === "type" ? "PL → IT" : "czasownik"}</span><span id="review-left">zostało {left}</span></div>
          <div className={"rprompt" + (card.mode === "type" ? " pl" : "")} id="review-prompt">
            {verb ? <>{card.prompt}<small>{verb.label} → ?</small></> : card.prompt}
          </div>
          {card.hint && <div className="rhint">{card.hint}</div>}

          {card.mode === "flash" && !shown && (
            <button type="button" className="primary" id="review-show" onClick={() => setShown(true)}>Pokaż odpowiedź</button>
          )}
          {card.mode === "flash" && shown && (
            <>
              <div className="ranswer" id="review-answer">{card.answer}</div>
              <div className="rrate" role="group" aria-label="Jak poszło?">
                {([1, 2, 3, 4] as const).map((g) => (
                  <button key={g} type="button" id={`rate-${g}`} className={g === 3 ? "primary" : ""}
                    onClick={async () => { await rate(card, g); next(); }}>{RATING_LABEL[g]}</button>
                ))}
              </div>
            </>
          )}

          {card.mode !== "flash" && (
            <form className="rtype" onSubmit={(ev) => { ev.preventDefault(); if (result) next(); else void submitTyped(); }}>
              <label className="field"><span>{verb ? `${verb.label} …` : "po włosku"}</span>
                <input ref={input} id="review-input" type="text" autoComplete="off" autoCapitalize="none" spellCheck={false} lang="it"
                  value={typed} readOnly={!!result}
                  onChange={(ev) => {
                    const el = ev.currentTarget;
                    const fixed = fixBacktick(el.value, el.selectionStart ?? el.value.length);
                    setTyped(fixed ? fixed.value : el.value);
                  }} />
              </label>
              {!result && <button type="submit" className="primary" id="review-check">Sprawdź</button>}
              {result && (
                <>
                  <p className={"rresult " + result} id="review-result" role="status">
                    {result === "ok" ? "Dobrze!" : result === "accent" ? <>Prawie: akcent. Poprawnie: <b>{expected}</b></> : <>Poprawnie: <b>{expected}</b></>}
                  </p>
                  <button type="submit" className="primary" id="review-next">Dalej</button>
                </>
              )}
            </form>
          )}
        </div>
      )}

      <details className="rset" id="review-settings">
        <summary>Ustawienia powtórek</summary>
        <div className="bar">
          <label className="field"><span>Nowe karty dziennie</span>
            <input id="srs-new" type="number" min={0} max={100} inputMode="numeric" defaultValue={r.settings.newPerDay}
              onChange={(ev) => { const n = Number(ev.currentTarget.value); if (Number.isFinite(n) && n >= 0 && n <= 100) void r.saveSettings({ newPerDay: Math.round(n) }); }} />
          </label>
          <label className="field"><span>Ile pamiętać</span>
            <select id="srs-ret" value={r.settings.retention} onChange={(ev) => void r.saveSettings({ retention: Number(ev.currentTarget.value) })}>
              <option value={0.85}>85% · mniej powtórek</option>
              <option value={0.9}>90% · zalecane</option>
              <option value={0.95}>95% · więcej powtórek</option>
            </select>
          </label>
        </div>
        <p className="rnote">Kart: {cards.length} · odpowiedzi: {r.reviews.length}{r.pending() ? ` · ${r.pending()} czeka na wysłanie` : ""}. Harmonogram liczy FSRS (ts-fsrs, MIT) na tym urządzeniu.</p>
      </details>
    </section>
  );
}
