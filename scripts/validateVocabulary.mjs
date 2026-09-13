/**
 * `npm run validate:vocabulary`
 *
 * Validates every entry against the Zod schemas the application uses (§13), and every
 * source row in `data/*.json` against the authoring rules: structural violations — schema,
 * id, band, per-level counts, missing grammar decisions, malformed headwords, non-canonical
 * topics — are errors. Gloss and word-class heuristics are warnings for editorial review.
 */

import { vocabularyEntrySchema } from '../src/schemas/vocabularySchema.ts';
import {
  bandForRank,
  bandById,
  LEVEL_ENTRY_COUNTS,
} from '../src/content/vocabulary/frequencyBands.ts';
import { isTopic } from '../src/content/vocabulary/topics.ts';
import {
  DATASET_FILES,
  finish,
  loadAllEntries,
  printSample,
  readDataset,
  ui,
} from './lib/loadDataset.mjs';

/** Irregular English past forms that turn up after "to" in machine-translated glosses. */
const IRREGULAR_PAST = new Set(
  (
    'ate became began begun bought brought built came caught chosen did done drank driven drunk ' +
    'eaten fallen fed felt fled forgot forgotten gave given gone grew held kept knew known left lost ' +
    'meant met paid ran ridden risen said sat saw seen sent shaken sold spent spoke spoken stood ' +
    'stole stolen swum taken taught thought threw thrown told took trodden understood went won ' +
    'wore worn wrote written'
  ).split(' '),
);

/** Report groups: an empty group prints PASS, a non-empty one FAIL or WARN with a sample. */
function report(problems, { failure, success, isError }, errors, warnings) {
  if (problems.length === 0) {
    ui.ok(success);
    return;
  }
  (isError ? ui.fail : ui.warn)(`${problems.length} ${failure}`);
  printSample(problems, isError ? 10 : 5);
  (isError ? errors : warnings).push(...problems);
}

function glossDefects(row) {
  const glosses = row.english ?? [];
  const defects = [];
  for (const gloss of glosses) {
    if (/[äöüÄÖÜß=]/u.test(gloss)) defects.push(`German text in "${gloss}"`);
    if (gloss.includes(',') && gloss.split(/,\s*/u).some((part) => glosses.includes(part))) {
      defects.push(`comma list repeated as separate glosses "${gloss}"`);
    }
    const verb = /^to (\S+)/u.exec(gloss)?.[1].toLowerCase();
    if (
      verb &&
      (IRREGULAR_PAST.has(verb) ||
        (verb.length > 4 && /[^e]ed$/u.test(verb)) ||
        /[^siu]s$/u.test(verb))
    ) {
      defects.push(`inflected verb after "to" in "${gloss}"`);
    }
  }
  if (
    row.wordClass === 'verb' &&
    glosses.length > 0 &&
    glosses.every((gloss) => !gloss.startsWith('to ')) &&
    glosses.some((gloss) => /ing$/u.test(gloss))
  ) {
    defects.push(`verb glossed only as a gerund "${glosses.join('; ')}"`);
  }
  return defects;
}

function validateSourceRows(errors, warnings) {
  const grammar = [];
  const headwords = [];
  const topics = [];
  const glosses = [];
  const capitalized = [];

  for (const { file } of DATASET_FILES) {
    for (const row of readDataset(file)) {
      const german = String(row.german ?? '').trim();
      const label = `${file} ${row.id ?? `rank ${row.rank}`} (${german})`;

      if (row.wordClass === 'noun') {
        if (!('article' in row) || !['der', 'die', 'das', null].includes(row.article)) {
          grammar.push(`${label}: no article decision (der/die/das, or explicit null)`);
        } else if (row.article && !german.startsWith(`${row.article} `)) {
          grammar.push(`${label}: headword does not start with its article "${row.article}"`);
        }
        if (!['both', 'singularOnly', 'pluralOnly'].includes(row.numberUsage)) {
          grammar.push(`${label}: no numberUsage (both/singularOnly/pluralOnly)`);
        }
        if (!('plural' in row)) {
          grammar.push(`${label}: no plural decision (plural, or explicit null)`);
        } else if (row.numberUsage === 'both' && !(typeof row.plural === 'string' && row.plural)) {
          grammar.push(`${label}: numberUsage "both" but no plural`);
        }
      }
      if (row.wordClass === 'verb') {
        for (const field of ['thirdPersonPresent', 'simplePast', 'pastParticiple']) {
          if (!(typeof row[field] === 'string' && row[field].trim())) {
            grammar.push(`${label}: missing ${field}`);
          }
        }
        if (!['haben', 'sein', 'haben/sein'].includes(row.auxiliary)) {
          grammar.push(`${label}: missing auxiliary`);
        }
        for (const field of ['separable', 'reflexive']) {
          if (typeof row[field] !== 'boolean') grammar.push(`${label}: missing ${field}`);
        }
      }

      if (/^-|-$|[/(]/u.test(german)) {
        headwords.push(`${label}: stem, alternative list or bracket in the headword`);
      }
      if (!isTopic(row.primaryTopic ?? '')) {
        topics.push(`${label}: "${row.primaryTopic}" is not a canonical topic name`);
      }
      for (const defect of glossDefects(row)) glosses.push(`${label}: ${defect}`);

      const bare = german.replace(/^(der|die|das)\s+/u, '');
      if (
        !['noun', 'phrase', 'pronoun'].includes(row.wordClass) &&
        row.kind !== 'phrase' &&
        /^\p{Lu}/u.test(bare)
      ) {
        capitalized.push(`${label}: capitalized, but word class is "${row.wordClass}"`);
      }
    }
  }

  const isError = true;
  report(
    grammar,
    {
      failure: 'noun/verb grammar decisions missing in the source',
      success: 'every noun has an article and plural decision, every verb its principal parts',
      isError,
    },
    errors,
    warnings,
  );
  report(
    headwords,
    {
      failure: 'malformed headwords',
      success: 'no headword is a stem, a list or bracketed',
      isError,
    },
    errors,
    warnings,
  );
  report(
    topics,
    {
      failure: 'source rows with a non-canonical primary topic',
      success: 'every source row uses a canonical topic name',
      isError,
    },
    errors,
    warnings,
  );
  report(
    glosses,
    { failure: 'English gloss defects', success: 'no English gloss defects detected' },
    errors,
    warnings,
  );
  report(
    capitalized,
    {
      failure: 'capitalized headwords not classed as nouns',
      success: 'every capitalized headword is a noun, pronoun or phrase',
    },
    errors,
    warnings,
  );
}

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
  report(
    schemaFailures,
    {
      failure: 'entries failed schema validation',
      success: 'all entries conform to the vocabulary schema',
      isError: true,
    },
    errors,
    warnings,
  );

  /* ---- level / band / rank consistency (§13) ---- */
  const bandMismatches = [];
  for (const entry of entries) {
    const expected = bandForRank(entry.rank);
    if (!expected) {
      bandMismatches.push(`${entry.id}: rank ${entry.rank} is outside every frequency band`);
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
  report(
    bandMismatches,
    {
      failure: 'level/band/rank conflicts',
      success: 'rank, level and frequency band agree for every entry',
      isError: true,
    },
    errors,
    warnings,
  );

  /* ---- per-level entry counts (§2) ---- */
  const counts = {};
  for (const entry of entries) counts[entry.level] = (counts[entry.level] ?? 0) + 1;
  const countProblems = Object.entries(LEVEL_ENTRY_COUNTS)
    .filter(([level, expected]) => (counts[level] ?? 0) !== expected)
    .map(
      ([level, expected]) => `${level}: expected ${expected} entries, found ${counts[level] ?? 0}`,
    );
  report(
    countProblems,
    {
      failure: 'levels with the wrong entry count',
      success: 'entry counts match LEVEL_ENTRY_COUNTS',
      isError: true,
    },
    errors,
    warnings,
  );

  /* ---- ID format (§12): frozen, level-prefixed ---- */
  const idProblems = entries
    .filter((entry) => !entry.id.startsWith(`${entry.level.toLowerCase()}-`))
    .map((entry) => `${entry.id}: expected ID to start with "${entry.level.toLowerCase()}-"`);
  report(
    idProblems,
    {
      failure: 'IDs do not encode their CEFR level',
      success: 'every ID encodes its CEFR level',
      isError: true,
    },
    errors,
    warnings,
  );

  /* ---- phrases ---- */
  const phraseProblems = entries
    .filter((entry) => entry.wordClass === 'phrase' && !entry.register)
    .map((entry) => `${entry.id}: missing register`);
  report(
    phraseProblems,
    {
      failure: 'phrases are missing a register',
      success: 'all phrases declare a register and phrase type',
      isError: true,
    },
    errors,
    warnings,
  );

  /* ---- nouns are capitalized (§13) ----
   * The capital does not have to be the first letter: "heiße Schokolade" is correct. A noun
   * with no capital at all is a misfiled word class or a truncated row. */
  const uncapitalizedNouns = entries
    .filter(
      (entry) =>
        entry.wordClass === 'noun' &&
        !entry.german
          .trim()
          .split(/\s+/)
          .some((word) => /^\p{Lu}/u.test(word.replace(/^[^\p{L}]+/u, ''))),
    )
    .map((entry) => `${entry.id} (${entry.german})`);
  report(
    uncapitalizedNouns,
    {
      failure: 'nouns are not capitalized — check the word class',
      success: 'every noun is capitalized',
    },
    errors,
    warnings,
  );

  validateSourceRows(errors, warnings);

  finish('validate:vocabulary', errors, warnings);
}

main();
