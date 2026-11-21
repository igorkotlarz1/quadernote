# Milestones

One pebble at a time: each milestone ends with something that works on a real lesson.
Status: `todo` · `in progress` · `done (date, PR)`.

| M | Goal | Done when | Status |
|---|------|-----------|--------|
| M1 | Quadernote in React + Vite + TS, logic 1:1 with the Artifact (entry, NULLs, verbs with reveal, accents, level bar, prompts) | importing the current JSON export (schema_version 1) shows the same view as the Artifact; conjugation and import tests are green | done (2026-11-19, #1) |
| M2 | FastAPI + Postgres 17 (pgvector) in Docker Compose on the OptiPlex, Tailscale, pg_dump + restic → B2 | phone and laptop see the same lesson; a test restore of the backup works | done (2026-11-19, #3) |
| M3 | Offline-first PWA: IndexedDB (Dexie) + sync with the API | a lesson typed in airplane mode is saved and syncs when the network is back | done (2026-11-19, #6) |
| M3.5 | Offline Italian→Polish dictionary from open data (frequency list + Morph-it! + Wikisłownik) in Postgres, top ~5000 lemmas in IndexedDB; suggestions under a row, "Uzupełnij ze słownika", credits in the app and README | a word from the top 5000 typed in airplane mode gets a Polish suggestion without the API; the prompt for Claude only carries what the dictionary does not know | done (2026-11-19, #7) |
| M4 | "Opracuj lekcję" via Claude API: accents, NULLs, pos/lemma, only verbs marked "do sprawdzenia"; weekly level via API; `llm_calls` table | one click instead of the manual prompt; cost of every call in the log | done (2026-11-19, #8) |
| M5 | FSRS reviews: an append-only `reviews` log replayed on the device (no `srs_cards` table, see docs/log/m5.md), 3 exercise types (flashcard IT→PL, typing PL→IT, verb forms) | the app picks what to review every day | in progress |
| M6 | Notebook OCR (Opus vision) + review screen + merge | photo of a page → checked words in the lesson | todo |
| M7 | Voice: local STT on CPU (model picked by a small eval, see below), "repeat after me" pronunciation score, a lector voice for words and sentences, "Q&A" from my own recorded answers | the app scores the pronunciation of a single word | todo |
| M8 | Embeddings (bge-m3, pgvector), semantic search, accounts (second user), interface language switch PL ⇄ EN for a wider audience | semantic search works; a second user has separate data and can use the app in English | todo |

M1–M5 go in order (M3.5 is a small step between M3 and M4: it makes M4 cheaper). M6–M8 can be reordered by what hurts most in lessons.

## M7 to-do (collected before the milestone starts)

- **STT, local and on CPU.** Recordings stay on the OptiPlex. Candidates for a small eval on ~20 of my own Italian recordings (WER + seconds per minute of audio on the i5, no GPU):
  - faster-whisper (large-v3-turbo, int8): the baseline;
  - NVIDIA Parakeet-TDT-0.6B-v3 (25 European languages incl. Italian, CC BY 4.0): small and fast, a strong CPU candidate;
  - NVIDIA Canary-1B-v2 (same languages, also translates to English).
  - Not on this box: NVIDIA Nemotron 3.5 Transcribe (30B MoE, 4B active, Oct 2026) needs a GPU; revisit if a GPU appears.
  - Fallback only: Groq Whisper (free tier, audio leaves the house).
- **"Q&A" section.** I record only my own voice (the other side on headphones), mostly answers to compound questions and negations. Each answer starts with "pytanie: …" in my own words, so the question travels with the answer. Transcribe locally, then Claude fixes grammar sentence by sentence; only my words are stored, never the other person's.
  - Clean input: mic close to the mouth, headphones low, voice activity detection (silence cut) before STT, so the other voice does not leak into the transcript.
- **Lector (TTS).** Generate each word or sentence once and cache the audio file on the OptiPlex, so credits are spent once per text.
  - ElevenLabs (student Creator plan, 3 months, API included): key only in `.env`, credit cap on the key if the dashboard allows it, check the renewal date before the free period ends.
  - Open fallback that stays after the trial: Kokoro or Piper Italian voices on CPU.
  - No cloning of real people's voices.

## Out of scope / later

- M5 later: fill-in-the-gap sentences written by Claude (a small step of its own), audio on cards (M7), push reminders, FSRS weights fitted to my own answers once there are a few hundred.

- Merging edits of the same lesson made at the same time on two devices (now: last write wins): M3 if it hurts.
- English interface (PL ⇄ EN switch): M8, long after the working MVP; until then all UI strings stay Polish. Keep new strings in components easy to move into one dictionary later.
- Push notifications and background sync while the app is closed: later; M3 syncs when the app is opened or the network comes back.
- Dictionary: senses ranked by context ("sono" = jestem vs. dźwięczę), example sentences (Tatoeba, CC BY 2.0 FR), phrases: later, maybe with M8 embeddings. Serving the dictionary to other users (M8) keeps the CC BY-SA credits and share-alike terms.
- M4 later: prompt caching (the system prompts are below the minimum cacheable size today), a monthly spending cap, Batch API for re-processing old lessons at half price.
- Login / accounts: M8. Until then access is limited by Tailscale only.
- Splitting the CSS into per-component files: only if it starts to hurt.
