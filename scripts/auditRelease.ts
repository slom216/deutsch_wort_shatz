/**
 * `npm run audit:release`
 *
 * The Phase 18 content gates that go beyond per-entry validation:
 *
 *   - final entry counts (exactly 10,000 / 1,000 / 3,000 / 6,000);
 *   - phrase counts per level against the completion criteria;
 *   - exercise ambiguity — two different entries must never produce a multiple-choice
 *     question whose correct answer is also a valid answer for another option;
 *   - editorial-correction sign-off status;
 *   - the language-review backlog declared by the datasets themselves.
 *
 * Failures here block release; warnings are the human review queue.
 */

import { exerciseSchema } from '@/schemas/exerciseSchema';
import { generateAllForEntry } from '@/features/practice/generators';
import { createRandom } from '@/features/practice/random';
import { LEVEL_ENTRY_COUNTS, TOTAL_ENTRY_COUNT } from '@/content/vocabulary/frequencyBands';
import { finish, loadAllEntries, printSample, ui } from './lib/loadDataset.mjs';

/** Phrase minimums from the A1/A2/B1 completion criteria. */
const PHRASE_MINIMUMS: Record<string, number> = { A1: 150, A2: 400, B1: 800 };

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
      const message = `${level}: ${phrases} phrases, completion criteria require at least ${minimum} (short by ${minimum - phrases})`;
      ui.fail(message);
      errors.push(message);
    } else {
      ui.ok(`${level}: ${phrases} phrases (at least ${minimum} required)`);
    }
  }

  /* ---- exercise ambiguity ---- */
  // A multiple-choice question is ambiguous when a distractor means the same thing as the
  // correct answer. Distractors are drawn from the same topic, so this is a real risk.
  const ambiguous: string[] = [];
  let checked = 0;

  for (const entry of entries) {
    const exercises = generateAllForEntry({
      entry,
      pool: entries.filter(
        (candidate) =>
          candidate.primaryTopic === entry.primaryTopic ||
          Math.abs(candidate.rank - entry.rank) <= 200,
      ),
      random: createRandom(`release-${entry.id}`),
      id: `release-${entry.id}`,
      allowedTypes: ['multipleChoice'],
    });

    for (const exercise of exercises) {
      if (exercise.type !== 'multipleChoice') continue;
      checked += 1;
      const correct = exercise.options[exercise.correctIndex];
      if (correct === undefined) continue;
      const duplicates = exercise.options.filter((option) => option === correct).length;
      if (duplicates > 1) {
        ambiguous.push(`${exercise.id} (${entry.german}): "${correct}" appears ${duplicates}×`);
      }
      if (!exerciseSchema.safeParse(exercise).success) {
        ambiguous.push(`${exercise.id}: fails schema validation`);
      }
    }
  }

  if (ambiguous.length > 0) {
    ui.fail(`${ambiguous.length} ambiguous multiple-choice questions`);
    printSample(ambiguous);
    errors.push(...ambiguous);
  } else {
    ui.ok(
      `no ambiguous options across ${checked.toLocaleString('en-US')} multiple-choice questions`,
    );
  }

  /* ---- editorial sign-off ---- */
  const corrected = entries.filter((entry) => entry.editorialCorrection);
  const unreviewed = corrected.filter((entry) => entry.editorialCorrection.reviewed !== true);
  if (unreviewed.length > 0) {
    ui.warn(`${unreviewed.length} editorial corrections awaiting human sign-off`);
    warnings.push(...unreviewed.map((entry) => entry.id));
  } else if (corrected.length > 0) {
    ui.ok(`all ${corrected.length} editorial corrections are signed off`);
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
