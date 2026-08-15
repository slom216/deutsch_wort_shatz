/**
 * `npm run validate:vocabulary`
 *
 * Validates every entry in `data/*.json` against the Zod schemas the application uses
 * (§13). Structural violations — schema, id, rank, band, per-level counts — are errors.
 *
 * Missing grammar is a warning, not an error: the datasets deliberately record only
 * checked material (headword, gloss, word class, topic), so nouns have no article or
 * plural and verbs no conjugation. The counts are still printed on every run, because
 * they are exactly what a future editorial pass would have to fill in.
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
    const targets = Object.entries(LEVEL_ENTRY_COUNTS)
      .map(([level, count]) => `${level} ${count.toLocaleString('en-US')}`)
      .join(' / ');
    ui.ok(`entry counts match the dataset targets (${targets})`);
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
      // The infinitive is the headword and must be there; the rest of the conjugation is
      // an editorial-review item, not a structural fault.
      if (!entry.infinitive) errors.push(`${entry.id}: missing infinitive`);
      for (const field of ['thirdPersonPresent', 'simplePast', 'pastParticiple', 'auxiliary']) {
        if (!entry[field]) verbProblems.push(`${entry.id}: missing ${field}`);
      }
    }
    if (entry.wordClass === 'phrase' && !entry.register) {
      phraseProblems.push(`${entry.id}: missing register`);
    }
  }

  if (verbProblems.length > 0) {
    ui.warn(`${verbProblems.length} verb conjugation fields are not recorded`);
    printSample(verbProblems, 5);
    warnings.push(...verbProblems);
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

  // Articles and plurals are not in the datasets at all. §14 forbids *teaching* a noun
  // without its article, which the app honours by not generating article or plural
  // exercises for such an entry — so this is the editorial backlog, not a build failure.
  if (missingArticle.length > 0) {
    ui.warn(`${missingArticle.length} nouns have no article recorded`);
    printSample(missingArticle, 5);
    warnings.push(...missingArticle);
  } else {
    ui.ok('every noun has an article');
  }

  if (missingPlural.length > 0) {
    ui.warn(`${missingPlural.length} countable nouns have no plural recorded`);
    printSample(missingPlural, 5);
    warnings.push(...missingPlural);
  } else {
    ui.ok('every countable noun has a plural');
  }

  // A noun with no capital anywhere is usually a misfiled word class in the source, which
  // only the dataset author can fix — so it is reported, loudly, but does not fail a build.
  if (uncapitalizedNouns.length > 0) {
    ui.warn(`${uncapitalizedNouns.length} nouns are not capitalized — check the word class`);
    printSample(uncapitalizedNouns, 10);
    warnings.push(...uncapitalizedNouns);
  } else {
    ui.ok('every noun is capitalized');
  }

  finish('validate:vocabulary', errors, warnings);
}

main();
