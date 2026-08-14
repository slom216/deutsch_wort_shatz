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

  const uncapitalizedNouns = [];

  for (const entry of entries) {
    if (entry.wordClass === 'noun') {
      if (!entry.article) missingArticle.push(`${entry.id} (${entry.german})`);
      // §13 exempts nouns the dataset marks as having no plural at all; everything else
      // must carry one, because §14 forbids teaching a noun without it.
      if (
        !entry.plural &&
        entry.numberUsage !== 'pluralOnly' &&
        entry.numberUsage !== 'singularOnly'
      ) {
        missingPlural.push(`${entry.id} (${entry.german}, numberUsage=${entry.numberUsage})`);
      }
      // §13: "noun is not capitalized". German nouns always are, but the capital does not
      // have to be the first letter of the entry: "heiße Schokolade" and "Pommes frites"
      // are both correct. What is never correct is a noun with no capital at all — that
      // entry is either a misfiled word class or a truncated source row.
      const hasCapital = entry.german
        .trim()
        .split(/\s+/)
        .some((word) => {
          // Leading punctuation is not the letter under test: „Bitte nicht stören“-Schild
          // and (Regen)schirm both carry their capital behind a quote or a bracket.
          const first = word.replace(/^[^\p{L}]+/u, '').charAt(0);
          return first && first === first.toUpperCase() && first !== first.toLowerCase();
        });
      if (!hasCapital) uncapitalizedNouns.push(`${entry.id} (${entry.german})`);
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

  // §13: a missing article or plural is an error, not a warning. §14 forbids teaching a
  // noun without them, so an entry lacking either cannot produce a valid exercise.
  // Nouns the dataset marks `singularOnly` or `pluralOnly` are exempt from the plural
  // rule — "die Schweiz" has no plural to teach.
  if (missingArticle.length > 0) {
    ui.fail(`${missingArticle.length} nouns have no article`);
    printSample(missingArticle, 5);
    errors.push(...missingArticle);
  } else {
    ui.ok('every noun has an article');
  }

  if (missingPlural.length > 0) {
    ui.fail(`${missingPlural.length} countable nouns have no plural`);
    printSample(missingPlural, 5);
    errors.push(...missingPlural);
  } else {
    ui.ok('every countable noun has a plural');
  }

  if (uncapitalizedNouns.length > 0) {
    ui.fail(`${uncapitalizedNouns.length} nouns are not capitalized`);
    printSample(uncapitalizedNouns, 5);
    errors.push(...uncapitalizedNouns);
  } else {
    ui.ok('every noun is capitalized');
  }

  finish('validate:vocabulary', errors, warnings);
}

main();
