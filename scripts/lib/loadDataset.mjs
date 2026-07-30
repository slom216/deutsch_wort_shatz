/**
 * Shared dataset loader for the validation and audit scripts.
 *
 * `data/*.json` is the authoring source of truth. This module reads those files and
 * normalizes each entry's topics onto the controlled registry (§9) while preserving
 * the raw labels as `sourceTopics` for editorial traceability.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

import { resolveTopic } from '../../src/content/vocabulary/topics.ts';
import { NOUN_CORRECTIONS } from '../../src/content/vocabulary/corrections.ts';

export const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
export const DATA_DIR = path.join(REPO_ROOT, 'data');

/** @type {ReadonlyArray<{ level: 'A1' | 'A2' | 'B1', file: string }>} */
export const DATASET_FILES = [
  { level: 'A1', file: 'a1_words.json' },
  { level: 'A2', file: 'a2_words.json' },
  { level: 'B1', file: 'b1_words.json' },
];

/** Reads one dataset file and returns its parsed `{ metadata, entries }` shape. */
export function readDataset(file) {
  const raw = readFileSync(path.join(DATA_DIR, file), 'utf8');
  const parsed = JSON.parse(raw);
  if (!parsed || !Array.isArray(parsed.entries)) {
    throw new Error(`${file}: expected an object with an \`entries\` array`);
  }
  return parsed;
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
 * Loads all three datasets, normalized and sorted by global rank.
 *
 * @returns {{ entries: object[], unresolvedTopics: Map<string, number>, metadata: object[] }}
 */
/**
 * Applies an editorial correction from `corrections.ts`, if one exists for this entry.
 * The correction is recorded on the entry as `editorialCorrection` so it stays visible to
 * the audits and to the eventual human reviewer — nothing is changed silently.
 */
export function applyCorrections(entry) {
  const correction = NOUN_CORRECTIONS[entry.id];
  if (!correction) return entry;

  const corrected = {
    ...entry,
    ...(correction.numberUsage ? { numberUsage: correction.numberUsage } : {}),
    ...(correction.plural
      ? { plural: correction.plural, pluralArticle: entry.pluralArticle ?? 'die' }
      : {}),
    ...(correction.article ? { article: correction.article } : {}),
    ...(correction.german ? { german: correction.german } : {}),
    editorialCorrection: {
      reason: correction.reason,
      reviewed: false,
      original: { german: entry.german, article: entry.article, plural: entry.plural },
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

  // A corrected headword must also be searchable under its new form.
  if (correction.german) {
    corrected.searchableForms = [...new Set([correction.german, ...(entry.searchableForms ?? [])])];
  }

  return corrected;
}

export function loadAllEntries() {
  const entries = [];
  const metadata = [];
  const unresolvedTopics = new Map();

  for (const { file } of DATASET_FILES) {
    const dataset = readDataset(file);
    metadata.push({ file, ...dataset.metadata });
    for (const raw of dataset.entries) {
      const { entry, unresolved } = normalizeEntryTopics(applyCorrections(raw));
      for (const label of unresolved) {
        unresolvedTopics.set(label, (unresolvedTopics.get(label) ?? 0) + 1);
      }
      entries.push(entry);
    }
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
