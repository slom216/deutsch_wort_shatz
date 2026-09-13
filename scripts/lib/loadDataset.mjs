/**
 * Shared dataset loader for the content build, validation and audit scripts.
 *
 * `data/a1.json`, `a2.json` and `b1.json` are the authoring source of truth. Each is a
 * flat array of hand-checked rows:
 *
 *     { id, rank, level, kind, german, english[], wordClass, primaryTopic, tags?, alternateForms?,
 *       // nouns
 *       article, plural, numberUsage, alternateArticles?,
 *       // verbs
 *       thirdPersonPresent, simplePast, pastParticiple, auxiliary, separable, reflexive }
 *
 * `id` is frozen: it never changes once released, and `data/legacy-ids.json` maps the old
 * rank-based ids onto it. Noun rows keep the article in `german` ("die Minute"); the shipped
 * entry stores it separately, as the app expects. Global rank, frequency band, search forms
 * and exercise configuration are derived here rather than authored.
 *
 * Example sentences live apart from the wordlists in `data/examples/*.json`, keyed by the
 * entry's source rank:
 *
 *     { "1": [{ "de": "…", "en": "…", "form": "eins" }] }
 *
 * `form` is the target word as it appears in that sentence, which is what the app
 * highlights; without it the first sentence token matching a known form of the entry is used.
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
export const EXAMPLES_DIR = path.join(DATA_DIR, 'examples');

/** @type {ReadonlyArray<{ level: 'A1' | 'A2' | 'B1', file: string }>} */
export const DATASET_FILES = [
  { level: 'A1', file: 'a1.json' },
  { level: 'A2', file: 'a2.json' },
  { level: 'B1', file: 'b1.json' },
];

/**
 * Reads the example sentences for one level: `{ "<source rank>": [{ de, en, form? }, …] }`.
 *
 * Absent or unreadable is not an error — entries simply get no examples, which is exactly
 * where the datasets started.
 */
export function readExamples(file) {
  try {
    const parsed = JSON.parse(readFileSync(path.join(EXAMPLES_DIR, file), 'utf8'));
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

/** Reads one dataset file: a flat array of source rows. */
export function readDataset(file) {
  const raw = readFileSync(path.join(DATA_DIR, file), 'utf8');
  const parsed = JSON.parse(raw);
  if (!Array.isArray(parsed)) {
    throw new Error(`${file}: expected an array of entries`);
  }
  return parsed;
}

/**
 * The headword without its leading article or particle: `die Million` → `Million`.
 *
 * A target token has to be something that occurs in the sentence, and a natural sentence
 * declines the article away — "eine Million Einwohner" contains `Million`, never
 * `die Million`.
 */
function bareHeadword(german) {
  return (
    german
      .replace(/^(der|die|das)\/(der|die|das)\s+/iu, '')
      .replace(/^(der|die|das)\s+/iu, '')
      .replace(/^(sich|zu)\s+/iu, '')
      // `ihr/ihm/ihn` lists alternatives; any one of them is a token of the sentence.
      .split('/')[0]
      // `all-`, `jed-` and `ein-` are paradigm stubs: the trailing hyphen stands for the
      // ending the sentence supplies, so the stem is what actually occurs in it.
      .replace(/-$/u, '')
      .trim()
  );
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

const ARTICLE_PREFIX = /^(der|die|das)\s+/iu;

/** Whitespace tokens, as the word-ordering generator splits them. */
const tokenCount = (text) => text.trim().split(/\s+/u).filter(Boolean).length;

const letterTokens = (text) => text.match(/[\p{L}\p{N}-]+/gu) ?? [];

/**
 * The example's target token: the recorded `form`, else the first sentence token that is a
 * known form of the entry (plural, a verb form or either half of a separable one, the bare
 * headword), else the bare headword.
 */
function targetTokenFor(sentence, form, knownForms, fallback) {
  if (form?.trim()) return form.trim();
  const known = new Set(knownForms.map((token) => token.toLowerCase()));
  return letterTokens(sentence).find((token) => known.has(token.toLowerCase())) ?? fallback;
}

/** The exercise formats an entry can actually support, given what the source carries. */
function enabledTypesFor(entry) {
  const types = ['multipleChoice', 'typedTranslation', 'matching', 'listening', 'speaking'];
  // Both generators work from the first example only.
  const example = entry.exampleSentences[0];
  const token = example?.targetTokens[0];
  if (
    token &&
    example.german.toLocaleLowerCase('de-DE').includes(token.toLocaleLowerCase('de-DE'))
  ) {
    types.push('sentenceCompletion');
  }
  // §15 word ordering: phrase or sentence reconstruction, 4–12 tokens (the generator's
  // MIN_TOKENS/MAX_TOKENS in generators/wordOrdering.ts).
  const fits = (text) => tokenCount(text) >= 4 && tokenCount(text) <= 12;
  if ((entry.wordClass === 'phrase' && fits(entry.german)) || (example && fits(example.german))) {
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
 * @param {{de: string, en: string, form?: string}[]} sentences authored example sentences
 */
export function expandEntry(raw, globalRank, total, sentences = []) {
  if (typeof raw.id !== 'string' || raw.id.trim() === '') {
    throw new Error(`${raw.level} rank ${raw.rank} (${raw.german}): source row has no id`);
  }
  const band = bandForRank(globalRank);
  const sourceGerman = String(raw.german ?? '').trim();
  const english = (raw.english ?? []).map((value) => String(value).trim()).filter(Boolean);
  const isNoun = raw.wordClass === 'noun';
  const isVerb = raw.wordClass === 'verb';

  const article = isNoun && ['der', 'die', 'das'].includes(raw.article) ? raw.article : null;
  // The shipped noun is bare; the app puts `article` in front of it wherever it is shown.
  const german = article ? sourceGerman.replace(ARTICLE_PREFIX, '') : sourceGerman;
  const plural =
    isNoun && typeof raw.plural === 'string' && raw.plural.trim() ? raw.plural.trim() : null;
  const alternateForms = (raw.alternateForms ?? [])
    .map((form) => String(form).trim())
    .filter(Boolean);
  const verbForms = isVerb
    ? Object.fromEntries(
        ['thirdPersonPresent', 'simplePast', 'pastParticiple']
          .filter((field) => typeof raw[field] === 'string' && raw[field].trim())
          .map((field) => [field, raw[field].trim()]),
      )
    : {};

  const bare = bareHeadword(sourceGerman) || sourceGerman;
  // Verb forms split into parts, so both halves of `fährt ab` are found in a sentence.
  const knownForms = [
    bare,
    // A declined adjective is still the adjective: `halb` occurs as "halbes".
    ...(raw.wordClass === 'adjective'
      ? ['e', 'em', 'en', 'er', 'es'].map((ending) => bare + ending)
      : []),
    ...(plural ? [plural] : []),
    ...Object.values(verbForms).flatMap(letterTokens),
  ];

  const entryId = raw.id;
  const base = {
    id: entryId,
    rank: globalRank,
    level: raw.level,
    kind: raw.kind ?? 'word',
    german,
    english,
    wordClass: raw.wordClass,
    primaryTopic: raw.primaryTopic,
    secondaryTopics: [],
    frequencyBand: band ? band.id : 'unknown',
    difficultyWeight: difficultyWeightFor(globalRank, sourceGerman, total),
    // §16 searches by any stored form: the taught headword, its bare lemma, the plural with
    // and without its article, every verb form and every alternative headword.
    searchableForms: [
      ...new Set([
        article ? `${article} ${german}` : german,
        german,
        bare,
        ...(plural ? [plural, `die ${plural}`] : []),
        ...Object.values(verbForms),
        ...alternateForms,
      ]),
    ],
    tags: (raw.tags ?? []).map(String),
    ...(alternateForms.length > 0 ? { alternateForms } : {}),
    // Both languages are stored — the vocabulary browser and the entry page show the pair.
    // Only the German half ever reaches an exercise card: those cards ask the learner to
    // produce the English meaning, so printing the translation would hand them the answer.
    exampleSentences: sentences.map((sentence, index) => ({
      id: `${entryId}-example-${index + 1}`,
      german: sentence.de,
      english: sentence.en,
      level: raw.level,
      targetTokens: [targetTokenFor(sentence.de, sentence.form, knownForms, bare)],
    })),
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
      article: article !== null,
      plural: plural !== null,
      punctuation: false,
      wordOrder: true,
    },
    // §14 teaches a noun with its article and plural and a verb with its principal parts,
    // so whatever the entry records is something the learner has to recall.
    requiredRecall: {
      article: article !== null,
      plural: plural !== null,
      thirdPersonPresent: Boolean(verbForms.thirdPersonPresent),
      simplePast: Boolean(verbForms.simplePast),
      pastParticiple: Boolean(verbForms.pastParticiple),
      auxiliary: isVerb && Boolean(raw.auxiliary),
    },
    acceptedAnswers: {
      german: [...new Set([german, ...alternateForms])],
      english,
      ...(plural ? { plural: [`die ${plural}`] } : {}),
      ...Object.fromEntries(Object.entries(verbForms).map(([field, form]) => [field, [form]])),
    },
  };

  if (isNoun) {
    return {
      ...base,
      exerciseConfig,
      article,
      plural,
      pluralArticle: plural ? 'die' : null,
      ...(raw.numberUsage ? { numberUsage: raw.numberUsage } : {}),
      ...(raw.alternateArticles?.length ? { alternateArticles: raw.alternateArticles } : {}),
    };
  }
  if (raw.wordClass === 'phrase') {
    return { ...base, exerciseConfig, register: 'neutral', phraseType: 'functional' };
  }
  if (isVerb) {
    return {
      ...base,
      exerciseConfig,
      infinitive: german,
      ...verbForms,
      ...(raw.auxiliary ? { auxiliary: raw.auxiliary } : {}),
      ...(typeof raw.separable === 'boolean' ? { separable: raw.separable } : {}),
      ...(typeof raw.reflexive === 'boolean' ? { reflexive: raw.reflexive } : {}),
      fixedPrepositions: [],
    };
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
    const examples = readExamples(file);
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
      // Keyed by the *source* rank, which is what a human editing the examples file sees;
      // the global rank shifts whenever an earlier level's count changes.
      const sentences = (examples[String(raw.rank)] ?? []).filter(
        (item) => item && typeof item.de === 'string' && typeof item.en === 'string',
      );
      const { entry, unresolved } = normalizeEntryTopics(
        expandEntry(raw, offset + index, total, sentences),
      );
      for (const label of unresolved) {
        unresolvedTopics.set(label, (unresolvedTopics.get(label) ?? 0) + 1);
      }
      entries.push(entry);
    });

    metadata.push({ file, cefrLevel: level, entryCount: rows.length });
  }

  const seen = new Set();
  const duplicates = new Set();
  for (const entry of entries) {
    if (seen.has(entry.id)) duplicates.add(entry.id);
    seen.add(entry.id);
  }
  if (duplicates.size > 0) {
    throw new Error(`duplicate source ids: ${[...duplicates].join(', ')}`);
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
