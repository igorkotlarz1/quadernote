# Changelog

- 2026-11-21 · M5: daily review ("Powtórka") with FSRS on the device: flashcards IT→PL, typing PL→IT with accent check, verb forms; append-only review log synced through `/api/reviews`.
- 2026-11-20 · M4 done (#8); M7 to-do: STT candidates for a CPU eval, "Q&A" from own recordings, cached lector voice.
- 2026-11-19 · M4: "Opracuj lekcję" and "Oceń tydzień" in one click through the Claude API (Haiku 5.5 / Sonnet 5.5, structured outputs), every call logged in `llm_calls` with tokens and estimated cost, "Koszty Claude" in the app; manual prompts kept as a fallback.
- 2026-11-19 · M3.5 done (#7); repository renamed to quadernote.
- 2026-11-19 · M3.5: offline Italian→Polish dictionary from open data (FrequencyWords, Morph-it!, Wikisłownik), suggestions under rows, "Uzupełnij ze słownika", sources and licenses in the app and README.
- 2026-11-19 · M3 done (#6).
- 2026-11-19 · M3: offline-first PWA: IndexedDB (Dexie) storage with migration from localStorage, service worker and install manifest, sync of edits made offline.
- 2026-11-19 · Name and look: Quadernote, wordmark „quadernotè”, flag espresso app icon and favicon.
- 2026-11-19 · M2 done (#3), README showcase with animated diagrams.
- 2026-11-19 · M2: FastAPI + Postgres 17 server in Docker Compose, sync between devices, nightly pg_dump + restic backups, trial restore.
- 2026-11-19 · M1 follow-up: level bar as a single vial, slimmer accent bar.
- 2026-11-19 · M1: React + Vite + TypeScript port of the single-file app (web/), unit tests and gate test against legacy/quaderno.html.
- 2026-11-19 · M0: repo skeleton, milestones and architecture notes.
