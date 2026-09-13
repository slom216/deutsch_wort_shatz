/**
 * `npm run audit:release`
 *
 * The Phase 18 content gates that go beyond per-entry validation:
 *
 *   - final entry counts (as `frequencyBands.ts` states them);
 *   - phrase counts per level against the completion criteria — a content-volume target;
 *   - exercise ambiguity — no multiple-choice option may be a second correct answer: a
 *     distractor sharing the prompt's gloss, or a near miss that is really another word;
 *   - the language-review backlog declared by the datasets themselves.
 *
 * Failures here block release; warnings are the human review queue.
 */

import { exerciseSchema } from '@/schemas/exerciseSchema';
import { generateAllForEntry } from '@/features/practice/generators';
import { headword, pluralForm } from '@/features/practice/generators/entryHelpers';
import { createRandom } from '@/features/practice/random';
import type { VocabularyEntry } from '@/schemas/vocabularySchema';
import { LEVEL_ENTRY_COUNTS, TOTAL_ENTRY_COUNT } from '@/content/vocabulary/frequencyBands';
import { finish, loadAllEntries, printSample, ui } from './lib/loadDataset.mjs';

/** Phrase minimums from the A1/A2/B1 completion criteria. */
const PHRASE_MINIMUMS: Record<string, number> = { A1: 150, A2: 400, B1: 800 };

/** Variants whose options are German words, where the generator may add a near miss. */
const GERMAN_OPTION_VARIANTS = new Set(['englishToGerman', 'plural', 'verbForm']);

const SEEDS = ['a', 'b', 'c'];

const glossKey = (gloss: string): string =>
  gloss
    .toLowerCase()
    .replace(/^to\s+/u, '')
    .replace(/^(a|an|the)\s+/u, '')
    .replace(/[.!?,;:()]/gu, '')
    .trim();

const bareGerman = (form: string): string => form.replace(/^(der|die|das)\s+/u, '');

function main(): void {
  const { entries } = loadAllEntries();
  const errors: string[] = [];
  const warnings: string[] = [];

  ui.heading(`audit:release — ${entries.length} entries`);

  /* ---- final counts ---- */
  if (entries.length !== TOTAL_ENTRY_COUNT) {
    const message = `expected exactly ${TOTAL_ENTRY_COUNT} entries, found ${entries.length}`;
    ui.fail(message);
    errors.push(message);
  } else {
    ui.ok(`exactly ${TOTAL_ENTRY_COUNT.toLocaleString('en-US')} entries`);
  }

  for (const [level, expected] of Object.entries(LEVEL_ENTRY_COUNTS)) {
    const actual = entries.filter((entry) => entry.level === level).length;
    if (actual !== expected) {
      const message = `${level}: expected ${expected} entries, found ${actual}`;
      ui.fail(message);
      errors.push(message);
    }
  }
  ui.ok('per-level entry counts match the A1/A2/B1 targets');

  /* ---- phrase counts ---- */
  for (const [level, minimum] of Object.entries(PHRASE_MINIMUMS)) {
    const phrases = entries.filter(
      (entry) => entry.level === level && (entry.kind === 'phrase' || entry.wordClass === 'phrase'),
    ).length;
    if (phrases < minimum) {
      const message =
        `${level}: ${phrases} phrases, the §27 completion criteria target at least ${minimum} ` +
        `(short by ${minimum - phrases}). This is a content-volume target, not a data defect: ` +
        'more phrases have to be authored.';
      ui.fail(message);
      errors.push(message);
    } else {
      ui.ok(`${level}: ${phrases} phrases (at least ${minimum} required)`);
    }
  }

  /* ---- exercise ambiguity ---- */
  const byHeadword = new Map<string, VocabularyEntry[]>();
  for (const entry of entries) {
    const key = headword(entry);
    byHeadword.set(key, [...(byHeadword.get(key) ?? []), entry]);
  }
  const lemmas = new Map<string, string>(entries.map((entry) => [entry.german, entry.id]));

  const ambiguous = new Set<string>();
  let checked = 0;

  for (const entry of entries) {
    const pool = entries.filter(
      (candidate) =>
        candidate.primaryTopic === entry.primaryTopic ||
        Math.abs(candidate.rank - entry.rank) <= 200,
    );
    // Everything a real distractor could be; a German option outside it is the near miss.
    const poolValues = new Set(
      pool.flatMap((candidate) => [
        headword(candidate),
        pluralForm(candidate) ?? '',
        candidate.wordClass === 'verb' ? (candidate.pastParticiple ?? '') : '',
      ]),
    );

    for (const seed of SEEDS) {
      const exercises = generateAllForEntry({
        entry,
        pool,
        random: createRandom(`release-${seed}-${entry.id}`),
        id: `release-${seed}-${entry.id}`,
        allowedTypes: ['multipleChoice'],
      });

      for (const exercise of exercises) {
        if (exercise.type !== 'multipleChoice') continue;
        checked += 1;
        if (!exerciseSchema.safeParse(exercise).success) {
          ambiguous.add(`${entry.id}: ${exercise.variant} fails schema validation`);
        }
        const correct = exercise.options[exercise.correctIndex];
        if (exercise.options.filter((option) => option === correct).length > 1) {
          ambiguous.add(`${entry.id} (${entry.german}): "${correct}" appears more than once`);
        }

        for (const option of exercise.options) {
          if (option === correct) continue;
          if (exercise.variant === 'englishToGerman') {
            const prompt = glossKey(exercise.question);
            const synonym = (byHeadword.get(option) ?? []).find(
              (other) =>
                other.id !== entry.id &&
                other.wordClass === entry.wordClass &&
                other.english.some((gloss) => glossKey(gloss) === prompt),
            );
            if (synonym) {
              ambiguous.add(
                `${entry.id}: "${exercise.question}" offers ${synonym.id} "${option}", which also means it`,
              );
            }
          }
          if (
            GERMAN_OPTION_VARIANTS.has(exercise.variant) &&
            !poolValues.has(option) &&
            bareGerman(option) !== bareGerman(correct)
          ) {
            const other = lemmas.get(bareGerman(option));
            if (other && other !== entry.id) {
              ambiguous.add(
                `${entry.id}: near miss "${option}" of "${correct}" is the real word ${other}`,
              );
            }
          }
        }
      }
    }
  }

  if (ambiguous.size > 0) {
    ui.fail(`${ambiguous.size} ambiguous multiple-choice questions`);
    printSample([...ambiguous]);
    errors.push(...ambiguous);
  } else {
    ui.ok(
      `no ambiguous options across ${checked.toLocaleString('en-US')} multiple-choice questions`,
    );
  }

  /* ---- language review backlog ---- */
  const needsReview = entries.filter(
    (entry) => entry.editorialReview?.required || entry.editorialReview?.status,
  );
  if (needsReview.length > 0) {
    ui.warn(`${needsReview.length} entries still carry a source-declared language-review status`);
    warnings.push(...needsReview.slice(0, 1).map((entry) => entry.id));
  } else {
    ui.ok('no outstanding language-review flags');
  }

  finish('audit:release', errors, warnings);
}

main();
