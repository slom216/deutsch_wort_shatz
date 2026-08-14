/**
 * `npm run audit:duplicates`
 *
 * Duplicate IDs and duplicate example-sentence IDs are hard errors.
 *
 * Repeated German surface forms are *not* automatically errors: `sein` (to be) and
 * `sein` (his) are distinct lexical entries. §13 requires only that duplicate senses be
 * "explicitly distinguished" — by a differing word class or non-overlapping English
 * glosses. A repeated form with the same word class *and* an overlapping gloss is an
 * indistinguishable duplicate and fails the audit.
 *
 * §34: development must never advance while this audit fails.
 */

import { finish, loadAllEntries, printSample, ui } from './lib/loadDataset.mjs';

/** Case/article/punctuation-insensitive key for comparing surface forms. */
function normalizeGerman(value) {
  return value
    .toLowerCase()
    .replace(/^(der|die|das|ein|eine)\s+/u, '')
    .replace(/[.!?,;:]/gu, '')
    .replace(/\s+/gu, ' ')
    .trim();
}

function normalizeGloss(value) {
  return value
    .toLowerCase()
    .replace(/^to\s+/u, '')
    .replace(/^(a|an|the)\s+/u, '')
    .replace(/[.!?,;:()]/gu, '')
    .trim();
}

function main() {
  const { entries } = loadAllEntries();
  const errors = [];
  const warnings = [];

  ui.heading(`audit:duplicates — ${entries.length} entries`);

  /* ---- duplicate entry IDs ---- */
  const byId = new Map();
  const duplicateIds = [];
  for (const entry of entries) {
    if (byId.has(entry.id)) {
      duplicateIds.push(`${entry.id} (ranks ${byId.get(entry.id).rank} and ${entry.rank})`);
    } else {
      byId.set(entry.id, entry);
    }
  }
  if (duplicateIds.length > 0) {
    ui.fail(`${duplicateIds.length} duplicate entry IDs`);
    printSample(duplicateIds);
    errors.push(...duplicateIds);
  } else {
    ui.ok('every entry ID is unique');
  }

  /* ---- duplicate example-sentence IDs ---- */
  const exampleIds = new Set();
  const duplicateExampleIds = [];
  for (const entry of entries) {
    for (const example of entry.exampleSentences ?? []) {
      if (exampleIds.has(example.id)) duplicateExampleIds.push(example.id);
      else exampleIds.add(example.id);
    }
  }
  if (duplicateExampleIds.length > 0) {
    ui.fail(`${duplicateExampleIds.length} duplicate example-sentence IDs`);
    printSample(duplicateExampleIds);
    errors.push(...duplicateExampleIds);
  } else {
    ui.ok(`every example-sentence ID is unique (${exampleIds.size} examples)`);
  }

  /* ---- repeated surface forms ---- */
  const byForm = new Map();
  for (const entry of entries) {
    const key = normalizeGerman(entry.german);
    if (!byForm.has(key)) byForm.set(key, []);
    byForm.get(key).push(entry);
  }

  const indistinguishable = [];
  const distinguished = [];

  for (const [form, group] of byForm) {
    if (group.length < 2) continue;
    for (let i = 0; i < group.length; i += 1) {
      for (let j = i + 1; j < group.length; j += 1) {
        const a = group[i];
        const b = group[j];
        const sameClass = a.wordClass === b.wordClass;
        const glossesA = new Set(a.english.map(normalizeGloss));
        const overlap = b.english.map(normalizeGloss).filter((g) => glossesA.has(g));

        // Topic is the third axis of the content hierarchy (§8), so the same word taught
        // under two topics is distinguished in the same sense that two word classes or
        // two glosses are — a learner meets it in two different contexts, deliberately.
        const sameTopic = a.primaryTopic === b.primaryTopic;

        if (sameClass && sameTopic && overlap.length > 0) {
          indistinguishable.push(
            `"${form}": ${a.id} and ${b.id} share word class "${a.wordClass}", topic "${a.primaryTopic}" and gloss "${overlap[0]}"`,
          );
        } else {
          const reason = !sameClass
            ? 'distinct word classes'
            : sameTopic
              ? 'distinct glosses'
              : `distinct topics (${a.primaryTopic} vs ${b.primaryTopic})`;
          distinguished.push(
            `"${form}": ${a.id} [${a.wordClass}: ${a.english[0]}] vs ${b.id} [${b.wordClass}: ${b.english[0]}] — ${reason}`,
          );
        }
      }
    }
  }

  if (indistinguishable.length > 0) {
    ui.fail(`${indistinguishable.length} indistinguishable duplicate senses`);
    printSample(indistinguishable);
    errors.push(...indistinguishable);
  } else {
    ui.ok('no indistinguishable duplicate senses');
  }

  if (distinguished.length > 0) {
    ui.warn(`${distinguished.length} repeated surface form(s), explicitly distinguished`);
    printSample(distinguished, 20);
    warnings.push(...distinguished);
  }

  finish('audit:duplicates', errors, warnings);
}

main();
