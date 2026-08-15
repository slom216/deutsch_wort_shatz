/**
 * Shared dataset loader for the content build, validation and audit scripts.
 *
 * `data/a1.json`, `a2.json` and `b1.json` are the authoring source of truth. Each is a
 * flat array of hand-checked rows carrying only what a human curated:
 *
 *     { rank, level, kind, german, english[], wordClass, primaryTopic }
 *
 * Everything the application needs beyond that — stable id, global rank, frequency band,
 * search forms, exercise configuration — is *derived* here rather than authored. Deriving
 * it keeps the datasets small enough to review by hand, which is the point: the previous
 * `*_words.json` files carried generated grammar tables and example sentences that nobody
 * had checked.
 *
 * What the source no longer carries, the application does without: nouns have no article
 * or plural, verbs no conjugation, and no entry has example sentences. The generators that
 * need those fields produce nothing for such an entry rather than inventing anything.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

import { resolveTopic } from '../../src/content/vocabulary/topics.ts';
import {
  bandForRank,
  LEVEL_ENTRY_COUNTS,
  LEVEL_RANK_RANGES,
} from '../../src/content/vocabulary/frequencyBands.ts';

export const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
export const DATA_DIR = path.join(REPO_ROOT, 'data');

/** @type {ReadonlyArray<{ level: 'A1' | 'A2' | 'B1', file: string }>} */
export const DATASET_FILES = [
  { level: 'A1', file: 'a1.json' },
  { level: 'A2', file: 'a2.json' },
  { level: 'B1', file: 'b1.json' },
];

/** Reads one dataset file: a flat array of source rows. */
export function readDataset(file) {
  const raw = readFileSync(path.join(DATA_DIR, file), 'utf8');
  const parsed = JSON.parse(raw);
  if (!Array.isArray(parsed)) {
    throw new Error(`${file}: expected an array of entries`);
  }
  return parsed;
}

/** `Müllabfuhr` → `mullabfuhr`; the lemma half of the §12 id. */
function slugify(german) {
  return german
    .toLowerCase()
    .replace(/ä/g, 'a')
    .replace(/ö/g, 'o')
    .replace(/ü/g, 'u')
    .replace(/ß/g, 'ss')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

/**
 * Difficulty weight (0–1) from position in the vocabulary and from length.
 *
 * Frequency does most of the work — a word 3,000 places down is harder than one in the
 * first hundred — with a nudge for long or multi-word entries.
 */
function difficultyWeightFor(globalRank, german, total) {
  const byRank = Math.min(1, globalRank / Math.max(1, total));
  const words = german.trim().split(/\s+/).length;
  const byLength = Math.min(1, (german.length / 20 + (words - 1) * 0.15) / 2);
  return Math.round((byRank * 0.75 + byLength * 0.25) * 1000) / 1000;
}

/** The exercise formats an entry can actually support, given what the source carries. */
function enabledTypesFor(entry) {
  const types = ['multipleChoice', 'typedTranslation', 'matching', 'listening', 'speaking'];
  // Word ordering rebuilds a phrase from its own tokens; single words have nothing to
  // reorder, and without example sentences there is no sentence to rebuild either. Four
  // tokens is the generator's own minimum (`MIN_TOKENS` in generators/wordOrdering.ts) —
  // only a handful of phrases reach it, so the format is rare rather than gone.
  if (entry.wordClass === 'phrase' && entry.german.trim().split(/\s+/).length >= 4) {
    types.push('wordOrdering');
  }
  return types;
}

/**
 * Expands one source row into the entry shape the application validates and ships.
 *
 * @param {object} raw source row
 * @param {number} globalRank rank across all three levels, A1 first
 * @param {number} total entries across all three levels
 */
export function expandEntry(raw, globalRank, total) {
  const band = bandForRank(globalRank);
  const german = String(raw.german ?? '').trim();
  const english = (raw.english ?? []).map((value) => String(value).trim()).filter(Boolean);

  const base = {
    id: `${String(raw.level).toLowerCase()}-${String(globalRank).padStart(4, '0')}-${slugify(german)}`,
    rank: globalRank,
    level: raw.level,
    kind: raw.kind ?? 'word',
    german,
    english,
    wordClass: raw.wordClass,
    primaryTopic: raw.primaryTopic,
    secondaryTopics: [],
    frequencyBand: band ? band.id : 'unknown',
    difficultyWeight: difficultyWeightFor(globalRank, german, total),
    // §16 searches by any stored form. The source has one form per entry, so that is it.
    searchableForms: [german],
    tags: [],
    // Nothing in the source is a checked example sentence, and an invented one would be
    // worse than none: the formats that need sentences simply do not generate (§15).
    exampleSentences: [],
    /** The rank the dataset itself gave this entry, within its level. */
    sourceRank: raw.rank,
  };

  const exerciseConfig = {
    enabledTypes: enabledTypesFor(base),
    directions: ['germanToEnglish', 'englishToGerman'],
    strictness: {
      capitalization: true,
      umlauts: true,
      eszett: true,
      // No articles or plurals are recorded, so neither can be required of an answer.
      article: false,
      plural: false,
      punctuation: false,
      wordOrder: true,
    },
    requiredRecall: {
      article: false,
      plural: false,
      thirdPersonPresent: false,
      simplePast: false,
      pastParticiple: false,
      auxiliary: false,
    },
    acceptedAnswers: { german: [german], english },
  };

  if (raw.wordClass === 'noun') {
    return { ...base, exerciseConfig, article: null, plural: null, pluralArticle: null };
  }
  if (raw.wordClass === 'phrase') {
    return { ...base, exerciseConfig, register: 'neutral', phraseType: 'functional' };
  }
  if (raw.wordClass === 'verb') {
    return { ...base, exerciseConfig, infinitive: german, fixedPrepositions: [] };
  }
  return { ...base, exerciseConfig };
}

/**
 * Normalizes an entry's topic labels onto the controlled registry.
 * Unresolvable labels are dropped from the canonical fields and reported separately,
 * so `audit:topics` can fail loudly instead of silently inventing a topic.
 *
 * @returns {{ entry: object, unresolved: string[] }}
 */
export function normalizeEntryTopics(entry) {
  const unresolved = [];
  const rawTopics = [entry.primaryTopic, ...(entry.secondaryTopics ?? [])].filter(
    (t) => typeof t === 'string' && t.length > 0,
  );

  const primary = resolveTopic(entry.primaryTopic ?? '');
  if (primary === null) unresolved.push(entry.primaryTopic);

  const secondary = [];
  for (const raw of entry.secondaryTopics ?? []) {
    const resolved = resolveTopic(raw);
    if (resolved === null) {
      unresolved.push(raw);
      continue;
    }
    // A secondary topic that collapses onto the primary after normalization is dropped.
    if (resolved !== primary && !secondary.includes(resolved)) secondary.push(resolved);
  }

  return {
    entry: {
      ...entry,
      primaryTopic: primary ?? entry.primaryTopic,
      secondaryTopics: secondary,
      sourceTopics: rawTopics,
    },
    unresolved,
  };
}

/**
 * Applies an editorial correction from `corrections.ts`, if one exists for this entry.
 *
 * Unused since the datasets were replaced: the corrections were keyed to ids in the old
 * `*_words.json` files, whose grammar fields the current sources do not carry at all.
 * Kept because it is the shape any future correction pass wants.
 */
export function applyCorrections(entry, corrections) {
  const ENTRY_CORRECTIONS = corrections ?? {};
  const correction = ENTRY_CORRECTIONS[entry.id];
  if (!correction) return entry;

  const corrected = {
    ...entry,
    ...(correction.numberUsage ? { numberUsage: correction.numberUsage } : {}),
    ...(correction.plural
      ? { plural: correction.plural, pluralArticle: entry.pluralArticle ?? 'die' }
      : {}),
    ...(correction.article ? { article: correction.article } : {}),
    ...(correction.german ? { german: correction.german } : {}),
    ...(correction.thirdPersonPresent ? { thirdPersonPresent: correction.thirdPersonPresent } : {}),
    ...(correction.simplePast ? { simplePast: correction.simplePast } : {}),
    ...(correction.pastParticiple ? { pastParticiple: correction.pastParticiple } : {}),
    editorialCorrection: {
      reason: correction.reason,
      reviewed: false,
      original: {
        german: entry.german,
        article: entry.article,
        plural: entry.plural,
        thirdPersonPresent: entry.thirdPersonPresent,
        simplePast: entry.simplePast,
        pastParticiple: entry.pastParticiple,
      },
      ...correction,
    },
  };

  // Reclassifying away from `noun` must also drop the noun-only grammar fields, or the
  // entry would carry an article and a plural it has no business having.
  if (correction.wordClass && correction.wordClass !== 'noun') {
    const { article, plural, pluralArticle, genitiveSingular, alternateArticles, ...rest } =
      corrected;
    void article;
    void plural;
    void pluralArticle;
    void genitiveSingular;
    void alternateArticles;
    return { ...rest, wordClass: correction.wordClass, kind: 'word' };
  }

  // A corrected headword or verb form must also be searchable under it — §16 requires
  // searching by inflected form, and the old forms were not German.
  const added = [
    correction.german,
    correction.thirdPersonPresent,
    correction.simplePast,
    correction.pastParticiple,
  ].filter(Boolean);
  if (added.length > 0) {
    const stale = new Set(
      [entry.thirdPersonPresent, entry.simplePast, entry.pastParticiple].filter(Boolean),
    );
    corrected.searchableForms = [
      ...new Set([...added, ...(entry.searchableForms ?? []).filter((form) => !stale.has(form))]),
    ];
  }

  return corrected;
}

/**
 * Loads all three datasets as full entries, ranked globally: A1 first, then A2, then B1,
 * each level in its own rank order.
 *
 * The level offsets come from `LEVEL_RANK_RANGES`, so a dataset that has grown or shrunk
 * fails here rather than silently pushing every later level's entries into the wrong
 * frequency band.
 *
 * @returns {{ entries: object[], unresolvedTopics: Map<string, number>, metadata: object[] }}
 */
export function loadAllEntries() {
  const entries = [];
  const metadata = [];
  const unresolvedTopics = new Map();

  const total = Object.values(LEVEL_ENTRY_COUNTS).reduce((sum, count) => sum + count, 0);

  for (const { level, file } of DATASET_FILES) {
    const rows = readDataset(file);
    const expected = LEVEL_ENTRY_COUNTS[level];
    if (rows.length !== expected) {
      throw new Error(
        `${file}: ${rows.length} entries, but frequencyBands.ts says ${level} has ${expected}. ` +
          'Update LEVEL_ENTRY_COUNTS, LEVEL_RANK_RANGES, TOTAL_ENTRY_COUNT and the band ' +
          'boundaries to match the dataset.',
      );
    }

    const offset = LEVEL_RANK_RANGES[level].from;
    // Source ranks are per level and are trusted for order only; the global rank is the
    // position within the level, so a gap or duplicate in the source cannot leave a hole.
    const ordered = [...rows].sort((a, b) => a.rank - b.rank);

    ordered.forEach((raw, index) => {
      const { entry, unresolved } = normalizeEntryTopics(expandEntry(raw, offset + index, total));
      for (const label of unresolved) {
        unresolvedTopics.set(label, (unresolvedTopics.get(label) ?? 0) + 1);
      }
      entries.push(entry);
    });

    metadata.push({ file, cefrLevel: level, entryCount: rows.length });
  }

  entries.sort((a, b) => a.rank - b.rank);
  return { entries, unresolvedTopics, metadata };
}

/* ---------- small console helpers shared by the audit scripts ---------- */

const useColor = process.stdout.isTTY && !process.env.NO_COLOR;
const paint = (code, text) => (useColor ? `[${code}m${text}[0m` : text);

export const ui = {
  heading: (text) => console.log(`\n${paint('1', text)}`),
  ok: (text) => console.log(`${paint('32', 'PASS')}  ${text}`),
  warn: (text) => console.log(`${paint('33', 'WARN')}  ${text}`),
  fail: (text) => console.log(`${paint('31', 'FAIL')}  ${text}`),
  info: (text) => console.log(`      ${text}`),
};

/**
 * Prints a capped list of offending items so output stays readable on large datasets.
 */
export function printSample(items, limit = 10) {
  for (const item of items.slice(0, limit)) ui.info(`- ${item}`);
  if (items.length > limit) ui.info(`… and ${items.length - limit} more`);
}

/** Exits the process with a summary. `warnings` never fail the build. */
export function finish(name, errors, warnings = []) {
  console.log('');
  if (warnings.length > 0) {
    ui.warn(`${name}: ${warnings.length} editorial-review item(s)`);
  }
  if (errors.length > 0) {
    ui.fail(`${name}: ${errors.length} error(s)`);
    process.exitCode = 1;
    return;
  }
  ui.ok(`${name}: no errors`);
}
