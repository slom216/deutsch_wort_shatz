# Deutsch Wort Shatz

A desktop-first German vocabulary trainer for CEFR levels **A1, A2 and B1**. It runs
entirely in the browser: no backend, no account, no cloud storage, no external AI or
speech services. All learner progress is stored locally in IndexedDB.

This repository currently implements **Phase 0 — Project Skeleton** and
**Phase 1 — Vocabulary Model and Exercise Engine** from
[`DEVELOPMENT_INSTRUCTIONS.md`](./DEVELOPMENT_INSTRUCTIONS.md).

All seven exercise formats work, German answers are checked strictly, and session
results persist locally. Spaced repetition (Phase 2) and gamification (Phase 7) are not
built yet, so practice sessions do not schedule reviews or award XP.

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
| `npm run audit:examples`      | Example sentences and target tokens                  |
| `npm run audit:all`           | All of the above                                     |

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
  are classified.
- **`generators/`** — one generator per format, each returning `null` when an entry cannot
  support a variant (an article question needs a noun, a participle question needs a verb).
  Distractors are drawn from the same topic first, then nearby frequency ranks.
- **`session/`** — session construction against the §19 constraints, verified across 60
  random seeds: 20 exercises, 12–16 entries, no more than 3 identical formats or 2
  same-entry exercises in a row, at least 40% production and 25% typed input.
- **`random.ts`** — seeded RNG. A session id seeds generation, so reloading a session URL
  rebuilds exactly the same exercises and only outcomes need persisting.

Matching and word ordering both work with a mouse, with the keyboard, and with a screen
reader; drag-and-drop is never the only way to answer (§15, §30).

## Known content issues

The audits pass, but they report editorial-review items that the datasets' own metadata
already flags as `linguisticReview: required`. These must be resolved before the Phase 18
release gate:

- **11 nouns have no article** (`Süßwasser-`, `Standard`, `Ostern`, …). Several are
  compound-forming stems or proper nouns where an article is arguably not applicable.
- **93 nouns have no plural**, most marked `numberUsage: "unspecified"`.
- **19 example sentences** have a target token that does not occur in the sentence. These
  are reflexive verbs whose generated sentences are awkward or wrong, e.g.
  `sich die Füße abtreten` → _"Ich möchte mich heute die Füße abtreten."_ One is a
  genuine typo in the source data: `sich für etwas interessierien` (should be
  _interessieren_).
- **8,714 entries** carry a source-declared review status; the 6,000 B1 entries are
  productive compounds and collocations that are grammatically valid but of uncertain
  real-world frequency and CEFR placement.
- **18 repeated surface forms** (`sein` the verb vs. `sein` the pronoun) are _not_
  defects — the audit confirms each pair is explicitly distinguished by word class or
  gloss, as §13 requires.

## Deviations from the specification

Both are forced by the data and are enforced in the schema rather than worked around:

- §12 specifies a **four-digit** rank in every ID, which cannot express rank 10,000. The
  enforced rule is zero-padding to a minimum of four digits.
- §10 does not list `dative+accusative` as a `requiredCase`, but ditransitive verbs in the
  dataset need it.

## Project layout

```
data/                     authoring source of truth (three JSON files)
scripts/                  content build + validation/audit scripts (Node, .mjs)
src/app/                  App, router, providers, error boundary
src/components/           layout and common components
src/content/vocabulary/   topic + band registries, lazy-loading registry
src/features/             persistence (Dexie), settings (Zustand), learning
src/pages/                one component per route
src/schemas/              Zod schemas — the single source of truth for types
src/test/                 setup and helpers
e2e/                      Playwright specs
```

## Privacy

No account, no backend, no analytics, no recordings. Progress is stored locally and can be
exported or deleted by the learner. Speaking exercises use the browser's speech
recognition; the app does not record or store voice, and browser behaviour varies —
processing is **not** guaranteed to be local.
