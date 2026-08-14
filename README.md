# Deutsch Wort Shatz

A desktop-first German vocabulary trainer for CEFR levels **A1, A2 and B1**. It runs
entirely in the browser: no backend, no account, no cloud storage, no external AI or
speech services. All learner progress is stored locally in IndexedDB.

All seven exercise formats work, German answers are checked strictly, spaced repetition
schedules reviews automatically, and XP, streaks and achievements are earned from real
sessions. The vocabulary is 10,000 entries — see **Known content issues** for what is
wrong with it, which is the honest limit on how useful the app currently is.

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

| Script                        | What it does                                         |
| ----------------------------- | ---------------------------------------------------- |
| `npm run dev`                 | Vite dev server                                      |
| `npm run build`               | Typecheck and produce the static production build    |
| `npm run preview`             | Serve the production build                           |
| `npm run lint`                | ESLint                                               |
| `npm run format` / `:check`   | Prettier                                             |
| `npm run typecheck`           | `tsc -b --noEmit`                                    |
| `npm run test` / `:watch`     | Vitest + React Testing Library                       |
| `npm run test:e2e`            | Playwright against the production build              |
| `npm run build:content`       | Generate vocabulary bundles from `data/`             |
| `npm run validate:vocabulary` | Validate all 10,000 entries against the Zod schemas  |
| `npm run audit:duplicates`    | Duplicate IDs and indistinguishable duplicate senses |
| `npm run audit:ranks`         | Rank uniqueness, bounds, gaps and band occupancy     |
| `npm run audit:topics`        | Controlled topic registry conformance                |
| `npm run audit:examples`      | Example sentences, target tokens and formulaic prose |
| `npm run audit:all`           | All of the above, plus every per-phase rank gate     |
| `npm run audit:release`       | §18 release gate (currently fails on phrase counts)  |

## Content pipeline

`data/a1_words.json`, `a2_words.json` and `b1_words.json` are the **authoring source of
truth** — 10,000 entries with unique IDs, a complete rank sequence from 1 to 10,000, and
the per-level split 1,000 / 3,000 / 6,000.

`npm run build:content` reads them and writes
`src/content/vocabulary/generated/` (git-ignored, rebuilt by `predev`, `prebuild` and
`pretest`):

- one JSON bundle per frequency band, so a session studying "A1 Core 1" never downloads
  the 6,000 B1 entries;
- `index.json`, a compact record per entry for the browser and search;
- `manifest.json`, band descriptors and counts.

`src/content/vocabulary/registry.ts` is the only way the app reaches content. Every band
is a lazy dynamic import, giving one chunk per band in the production build.

### Editorial corrections

`src/content/vocabulary/corrections.ts` holds per-entry repairs applied at build time, so
the authoring files stay the single source of truth. Each carries a reason and is reported
by `audit:release` as awaiting human sign-off. Three kinds:

- **countability and missing plurals** — `Wasser` marked countable, `Eltern` marked
  singular, ordinary nouns whose plural was simply absent;
- **line-break artifacts** — eighteen A2 compounds were transcribed from a two-column
  layout with the break intact (`Krankenver sicherung`, `Gehirn erschütterung`). As stored
  they are not German words, and strict checking would mark the correct spelling wrong;
- **generated verb conjugations** — six multi-word reflexive verbs were conjugated by
  suffixing the whole headword, so `sich die Hände waschen` shipped with the participle
  `gedie Hände wascht`. The head verb is conjugated instead.

### Topic normalisation

`DEVELOPMENT_INSTRUCTIONS.md` §9 defines a controlled registry of 49 topics. The source
datasets were authored independently and use **91** distinct labels, including
German-language ones (`Arbeit`, `Gesundheit`, `Verkehr`) and merged ones
(`Work and professions`). `src/content/vocabulary/topics.ts` holds the canonical registry
plus an alias map that resolves all 91 labels onto it. The original labels are preserved
on each entry as `sourceTopics`. `npm run audit:topics` fails if any label cannot be
resolved.

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

The audits pass, but they report a real backlog. These are language-authoring problems, not
code problems, and none of them can be fixed by a code change:

- **All 6,000 B1 entries are machine-generated.** Every one carries a `generationPattern`:
  4,400 productive compounds, 515 derived adjectives, 485 prefixed verbs and 600 generated
  collocations. The result is cartesian-product vocabulary — `Arbeitsplan`, `Berufsplan`,
  `Zeitplan`, `Terminplan` and so on across twenty head nouns — including forms that are not
  real German (`Zeitchance`, `Arbeitskunde`, `Zeitort`). Sixty per cent of the app currently
  teaches invented words as fact, and fixing it needs a real B1 word list.
- **9,578 of 10,000 entries have only formulaic example sentences.** `Das ist der …`
  (3,091), `… ist in diesem Zusammenhang wichtig` (~2,000), `Heute üben wir …` (600),
  `Diese Lösung ist …` (515). Sentence completion on `Das ist der ___` is answerable from
  the article alone. `audit:examples` counts these on every run and fails above a threshold
  set at the current level, so the number can only go down.
- **A2 is 86% nouns** (2,578 of 3,000; 1 adverb, 37 adjectives, 136 verbs), and its ranks
  follow a topic list rather than frequency, which §3 principle 1 puts first.
- **`audit:release` fails on phrase counts**: A1 has 59 phrases against the 150 the §6
  completion criteria require, A2 215 against 400, B1 600 against 800. Around 476 phrases
  need writing. CI runs this gate with `continue-on-error: true` for that reason.
- **19 target tokens do not occur in their own sentence** — reflexive verbs whose generated
  sentence is ungrammatical, e.g. `sich die Füße abtreten` → _"Ich möchte mich heute die
  Füße abtreten."_
- **8,714 entries** carry a source-declared review status.

## Deviations from the specification

- §15 specifies **four** multiple-choice options; this app uses **six**, with
  length-matched distractors. See "Multiple choice" above.
- §12 specifies a **four-digit** rank in every ID, which cannot express rank 10,000. The
  enforced rule is zero-padding to a minimum of four digits.
- §10 does not list `dative+accusative` as a `requiredCase`, but ditransitive verbs in the
  dataset need it.
- §13's duplicate-sense check treats a differing **primary topic** as an explicit
  distinction, alongside word class and gloss. Topic is the third axis of the content
  hierarchy in §8, so the same word taught under two topics is deliberate.

## Project layout

```
data/                     authoring source of truth (three JSON files)
scripts/                  content build + validation/audit scripts (Node, .mjs)
src/app/                  App, router, providers, error boundary
src/components/           layout, common, exercise and vocabulary components
src/content/vocabulary/   topic + band registries, corrections, lazy-loading registry
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
