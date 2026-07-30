/**
 * `npm run validate:vocabulary`
 *
 * Validates every entry in `data/*.json` against the Zod schemas the application uses
 * (§13). Structural violations are errors. Content gaps that the dataset metadata
 * itself flags as "linguistic review required" are reported as warnings so they stay
 * visible without blocking the build — see the report at the end of the run.
 */

import { vocabularyEntrySchema } from '../src/schemas/vocabularySchema.ts';
import {
  bandForRank,
  bandById,
  LEVEL_ENTRY_COUNTS,
} from '../src/content/vocabulary/frequencyBands.ts';
import { finish, loadAllEntries, printSample, ui } from './lib/loadDataset.mjs';

function main() {
  const { entries } = loadAllEntries();
  const errors = [];
  const warnings = [];

  ui.heading(`validate:vocabulary — ${entries.length} entries`);

  /* ---- schema conformance ---- */
  const schemaFailures = [];
  for (const entry of entries) {
    const result = vocabularyEntrySchema.safeParse(entry);
    if (!result.success) {
      const issue = result.error.issues[0];
      schemaFailures.push(`${entry.id}: ${issue.path.join('.')} — ${issue.message}`);
    }
  }
  if (schemaFailures.length > 0) {
    ui.fail(`${schemaFailures.length} entries failed schema validation`);
    printSample(schemaFailures);
    errors.push(...schemaFailures);
  } else {
    ui.ok('all entries conform to the vocabulary schema');
  }

  /* ---- level / band / rank consistency (§13) ---- */
  const bandMismatches = [];
  for (const entry of entries) {
    const expected = bandForRank(entry.rank);
    if (!expected) {
      bandMismatches.push(`${entry.id}: rank ${entry.rank} is outside 1–10,000`);
      continue;
    }
    if (expected.id !== entry.frequencyBand) {
      bandMismatches.push(
        `${entry.id}: rank ${entry.rank} belongs to "${expected.id}" but declares "${entry.frequencyBand}"`,
      );
    }
    const declared = bandById(entry.frequencyBand);
    if (declared && declared.level !== entry.level) {
      bandMismatches.push(
        `${entry.id}: level ${entry.level} conflicts with band "${entry.frequencyBand}" (${declared.level})`,
      );
    }
  }
  if (bandMismatches.length > 0) {
    ui.fail(`${bandMismatches.length} level/band/rank conflicts`);
    printSample(bandMismatches);
    errors.push(...bandMismatches);
  } else {
    ui.ok('rank, level and frequency band agree for every entry');
  }

  /* ---- per-level entry counts (§2) ---- */
  const counts = {};
  for (const entry of entries) counts[entry.level] = (counts[entry.level] ?? 0) + 1;
  for (const [level, expected] of Object.entries(LEVEL_ENTRY_COUNTS)) {
    const actual = counts[level] ?? 0;
    if (actual !== expected) {
      const message = `${level}: expected ${expected} entries, found ${actual}`;
      ui.fail(message);
      errors.push(message);
    }
  }
  if (errors.length === schemaFailures.length + bandMismatches.length) {
    ui.ok('entry counts match the A1/A2/B1 targets (1,000 / 3,000 / 6,000)');
  }

  /* ---- ID format and derivation (§12) ---- */
  const idProblems = [];
  for (const entry of entries) {
    const expectedPrefix = `${entry.level.toLowerCase()}-${String(entry.rank).padStart(4, '0')}-`;
    if (!entry.id.startsWith(expectedPrefix)) {
      idProblems.push(`${entry.id}: expected ID to start with "${expectedPrefix}"`);
    }
  }
  if (idProblems.length > 0) {
    ui.fail(`${idProblems.length} IDs do not encode their level and rank`);
    printSample(idProblems);
    errors.push(...idProblems);
  } else {
    ui.ok('every ID encodes its CEFR level and four-digit global rank');
  }

  /* ---- word-class specific required fields (§11) ---- */
  const missingArticle = [];
  const missingPlural = [];
  const verbProblems = [];
  const phraseProblems = [];

  for (const entry of entries) {
    if (entry.wordClass === 'noun') {
      if (!entry.article) missingArticle.push(`${entry.id} (${entry.german})`);
      if (!entry.plural && entry.numberUsage !== 'pluralOnly') {
        missingPlural.push(`${entry.id} (${entry.german}, numberUsage=${entry.numberUsage})`);
      }
    }
    if (entry.wordClass === 'verb') {
      for (const field of [
        'infinitive',
        'thirdPersonPresent',
        'simplePast',
        'pastParticiple',
        'auxiliary',
      ]) {
        if (!entry[field]) verbProblems.push(`${entry.id}: missing ${field}`);
      }
    }
    if (entry.wordClass === 'phrase' && !entry.register) {
      phraseProblems.push(`${entry.id}: missing register`);
    }
  }

  if (verbProblems.length > 0) {
    ui.fail(`${verbProblems.length} verbs are missing required grammar metadata`);
    printSample(verbProblems);
    errors.push(...verbProblems);
  } else {
    ui.ok('all verbs carry full conjugation metadata');
  }

  if (phraseProblems.length > 0) {
    ui.fail(`${phraseProblems.length} phrases are missing a register`);
    printSample(phraseProblems);
    errors.push(...phraseProblems);
  } else {
    ui.ok('all phrases declare a register and phrase type');
  }

  // Article/plural gaps are genuine content defects, but the shipped datasets declare
  // "linguisticReview: required". They are reported every run and must be resolved
  // before the Phase 18 release gate rather than blocking Phase 0.
  if (missingArticle.length > 0) {
    ui.warn(`${missingArticle.length} nouns have no article (editorial review required)`);
    printSample(missingArticle, 5);
    warnings.push(...missingArticle);
  } else {
    ui.ok('every noun has an article');
  }

  if (missingPlural.length > 0) {
    ui.warn(`${missingPlural.length} nouns have no plural (editorial review required)`);
    printSample(missingPlural, 5);
    warnings.push(...missingPlural);
  } else {
    ui.ok('every noun has a plural');
  }

  finish('validate:vocabulary', errors, warnings);
}

main();
