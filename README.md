# DeuLern Deutsch Wortschatz

A desktop-first German vocabulary trainer for CEFR levels **A1, A2 and B1**. It runs
entirely in the browser: no backend, no account, no cloud storage, no external AI or
speech services. All learner progress is stored locally in IndexedDB.

German answers are checked strictly, spaced repetition schedules reviews automatically, and
XP, streaks and achievements are earned from real sessions. All seven exercise formats are
generated; the article, plural and verb-form variants exist for an entry only when its
source row records that grammar. The vocabulary is **3,444 entries** (A1 799, A2 690,
B1 1,955), counted from `data/a1.json`, `a2.json` and `b1.json` — see **Known content
issues** for the backlog the audits report.

## Requirements

- **Node 24 or newer.** The content build and audit scripts import the TypeScript
  registries directly using Node's native type stripping, so both the app and the scripts
  validate against exactly one copy of the schemas.

## Getting started

```bash
npm install
npm run dev
```

`predev` runs the content build automatically, so the vocabulary bundles are generated
before the dev server starts.

## Scripts

| Script                        | What it does                                            |
| ----------------------------- | ------------------------------------------------------- |
| `npm run dev`                 | Vite dev server                                         |
| `npm run build`               | Typecheck and produce the static production build       |
| `npm run preview`             | Serve the production build                              |
| `npm run lint`                | ESLint                                                  |
| `npm run format` / `:check`   | Prettier                                                |
| `npm run typecheck`           | `tsc -b --noEmit`                                       |
| `npm run test` / `:watch`     | Vitest + React Testing Library                          |
| `npm run test:e2e`            | Playwright against the production build                 |
| `npm run build:content`       | Generate vocabulary bundles from `data/`                |
| `npm run validate:vocabulary` | Zod schemas, source grammar, headwords, topics, glosses |
| `npm run audit:duplicates`    | Duplicate IDs and senses, shared example sentences      |
| `npm run audit:ranks`         | Rank uniqueness, bounds, gaps and band occupancy        |
| `npm run audit:topics`        | Controlled topic registry conformance                   |
| `npm run audit:examples`      | Examples, target token in its sentence, formulaic prose |
| `npm run audit:all`           | All of the above, plus every per-phase rank gate        |
| `npm run audit:release`       | Release gate: counts, phrase targets, ambiguous options |

## Content pipeline

`data/a1.json`, `a2.json` and `b1.json` are the **authoring source of truth**: one row per
entry with a frozen `id` (`a1-die-minute`, `a1-sie-2`), its rank within the level, gloss,
word class, canonical topic, optional `tags` and `alternateForms`, and the grammar — article,
plural and `numberUsage` for nouns; present, past, participle, auxiliary, separability and
reflexivity for verbs. Ids never change once released; `data/legacy-ids.json` maps the old
rank-based ids (`a1-0003-der-mann`) onto them so stored progress can be migrated. Example
sentences live in `data/examples/*.json`, keyed by source rank, with an optional `form` for
the inflected word as it appears in the sentence.

`data/a1_words.json`, `a2_words.json` and `b1_words.json` are unused leftovers of an earlier
generated 10,000-entry set; no script reads them.

`npm run build:content` reads the sources and writes `src/content/vocabulary/generated/`
(git-ignored, rebuilt by `predev`, `prebuild` and `pretest`; set `CONTENT_OUT_DIR` to write
elsewhere):

- one JSON bundle per frequency band, so a session studying "A1 Core 1" never downloads
  the B1 entries;
- `index.json`, a compact record per entry for the browser and search, including every
  searchable form (plural, verb forms, alternate forms);
- `manifest.json`, band descriptors and counts;
- `legacy-ids.json`, copied from `data/`.

`src/content/vocabulary/registry.ts` is the only way the app reaches content. Every band
is a lazy dynamic import, giving one chunk per band in the production build.

### Topic normalisation

`DEVELOPMENT_INSTRUCTIONS.md` §9 defines a controlled registry of 49 topics in
`src/content/vocabulary/topics.ts`. Source rows must use the canonical names —
`validate:vocabulary` fails otherwise — and the build still resolves the older aliases,
preserving the original label on each entry as `sourceTopics`.

## Exercise engine

`src/features/practice/` holds the engine, all of it pure and framework-free so it can be
tested without rendering anything:

- **`evaluation/`** — strict German answer checking (§16). An answer is correct only on an
  exact match, once the dimensions an exercise marks as non-strict are folded. Feedback
  reports _every_ dimension that is wrong: `die strasse` against `die Straße` yields both a
  capitalization issue and an ß issue, exactly as §16 requires. All twelve error categories
  are classified. Turning off **Strict answer checking** in Settings relaxes the four
  foldable dimensions — capitalization, umlauts, ß and punctuation — for new sessions.
- **`generators/`** — one generator per format, each returning `null` when an entry cannot
  support a variant (an article question needs a noun, a participle question needs a verb).
- **`session/`** — session construction against the §19 constraints, verified across 60
  random seeds: 20 exercises, 12–16 entries, 4–6 exercise types, no more than 3 identical
  formats or 2 same-entry exercises in a row, at least 40% production and 25% typed input.
- **`random.ts`** — seeded RNG. A session id seeds generation, so the same id always builds
  the same session.

Matching and word ordering both work with a mouse, with the keyboard, and with a screen
reader; drag-and-drop is never the only way to answer (§15, §30).

### Multiple choice

Six options rather than the four in §15, chosen deliberately:

- distractors come from the **same CEFR level**, with an English gloss within **±2 letters**
  of the correct one, widening to ±3 and ±4 only when too few candidates qualify. Option
  length is otherwise a giveaway — a learner who knows nothing can still spot the one long
  answer among five short ones;
- options are numbered, and pressing **1–6** answers immediately. **Enter** then continues,
  or retries after a first wrong answer, so a whole session runs from the keyboard;
- the article variant offers three options, because German has three articles.

### Quiz score and mastery

Each entry carries a `masteryScore`: **+1** for a correct first-attempt answer, **−1** for
a wrong one, floored at zero. Reaching **5** marks the entry mastered.

This is deliberately separate from XP. XP is a lifetime total that drives learner level and
achievements, so it must only ever grow; the quiz score is per entry and moves both ways.
The §22 evidence rule (five successful reviews, three of them production, a typed
first-attempt success, a 30-day interval, difficulty below 0.35, no recent lapse) remains a
second, independent route to mastered, so nothing already earned is demoted.

## Session resume

Reloading mid-session resumes rather than restarting. The generated exercises are stored on
the session record, because regenerating them from the session id is deterministic only
while its inputs are — and one of them is the learner's stored progress, which the session
itself is busy changing. Answers already in `exerciseHistory` are replayed into memory and
never re-graded: history rows are idempotent, but `recordReview` is not, and re-answering
would grade and reschedule the entry twice.

## Known content issues

These are language-authoring problems, not code problems. The audits report each of them:

- **Phrase counts** are below the §27 completion criteria: A1 has 10 phrases against 150,
  A2 5 against 400, B1 23 against 800. `audit:release` fails on this content-volume target,
  and CI runs it with `continue-on-error: true` for that reason.
- **Grammar, headwords, topics and glosses** are checked by `validate:vocabulary`: nouns
  need an article and plural decision, verbs their principal parts, headwords may not be
  stems (`Feier-`) or lists, and gloss heuristics flag German text, repeated comma lists and
  machine-translated forms such as "to bought".
- **Example sentences** must contain their target token (`audit:examples`) and may not be
  shared between entries (`audit:duplicates`).
- **Ambiguous multiple choice** — a distractor meaning the same as the prompt, or a near
  miss that is another real word — is reported by `audit:release`.

## Deviations from the specification

- §15 specifies **four** multiple-choice options; this app uses **six**, with
  length-matched distractors. See "Multiple choice" above.
- §12 puts the rank in every ID. Ranks shift whenever the vocabulary changes, so IDs are
  frozen `<level>-<lemma>` slugs instead, with `data/legacy-ids.json` mapping the old ones.
- §10 does not list `dative+accusative` as a `requiredCase`, but ditransitive verbs in the
  dataset need it.
- §13's duplicate-sense check treats a differing **primary topic** as an explicit
  distinction, alongside word class and gloss. Topic is the third axis of the content
  hierarchy in §8, so the same word taught under two topics is deliberate.

## Project layout

```
data/                     authoring source of truth, examples, legacy id map
scripts/                  content build + validation/audit scripts (Node, .mjs)
src/app/                  App, router, providers, error boundary
src/components/           layout, common, exercise and vocabulary components
src/content/vocabulary/   topic + band registries, lazy-loading registry
src/features/             practice engine, SRS, gamification, persistence, search, speech
src/pages/                one component per route
src/schemas/              Zod schemas — the single source of truth for types
src/test/                 setup and helpers
e2e/                      Playwright specs
```

## Privacy

No account, no backend, no analytics, no recordings. Progress is stored locally and can be
exported or deleted by the learner. Repairing the database exports a backup first and asks
for confirmation, because repair deletes unreadable rows (§24). Speaking exercises use the
browser's speech recognition; the app does not record or store voice, and browser behaviour
varies — processing is **not** guaranteed to be local.

## Disclaimer

This app and its content were built with the help of AI. It may contain errors.
Every error we identify will be fixed. If you spot one, write to hallo@deulern.com.
