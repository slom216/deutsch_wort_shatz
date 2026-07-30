/**
 * `npm run audit:phase -- <from> <to>`  (defaults to ranks 1–500)
 *
 * Checks the acceptance criteria the vocabulary phases state for a rank range:
 *
 *   - exactly the expected number of entries, with no gaps and no duplicate ranks;
 *   - every noun has an article, and a plural unless it is singular- or plural-only;
 *   - every verb has complete conjugation metadata;
 *   - every entry has an example sentence;
 *   - every entry produces at least one valid exercise.
 *
 * The last check is the important one: it runs the real generators and validates their
 * output against the exercise schema, so "all entries produce valid exercises" is proven
 * rather than assumed.
 */

import { exerciseSchema } from '@/schemas/exerciseSchema';
import { generateAllForEntry } from '@/features/practice/generators';
import { createRandom } from '@/features/practice/random';
import { finish, loadAllEntries, printSample, ui } from './lib/loadDataset.mjs';

const from = Number(process.argv[2] ?? 1);
const to = Number(process.argv[3] ?? 500);

function main() {
  const { entries } = loadAllEntries();
  const segment = entries.filter((entry) => entry.rank >= from && entry.rank <= to);
  const errors = [];
  const warnings = [];

  ui.heading(`audit:phase — ranks ${from}–${to}`);

  /* ---- completeness ---- */
  const expected = to - from + 1;
  const ranks = new Set(segment.map((entry) => entry.rank));
  const missing = [];
  for (let rank = from; rank <= to; rank += 1) if (!ranks.has(rank)) missing.push(rank);

  if (segment.length !== expected) {
    const message = `expected ${expected} entries, found ${segment.length}`;
    ui.fail(message);
    errors.push(message);
  } else {
    ui.ok(`exactly ${expected} entries`);
  }

  if (missing.length > 0) {
    ui.fail(`${missing.length} missing ranks`);
    printSample(missing.map(String));
    errors.push(...missing.map((r) => `missing rank ${r}`));
  } else {
    ui.ok('rank sequence complete');
  }

  if (segment.length !== ranks.size) {
    const message = `${segment.length - ranks.size} duplicate ranks`;
    ui.fail(message);
    errors.push(message);
  } else {
    ui.ok('no duplicate ranks');
  }

  /* ---- nouns: article and plural ---- */
  const nouns = segment.filter((entry) => entry.wordClass === 'noun');
  const noArticle = nouns.filter((entry) => !entry.article);
  const noPlural = nouns.filter(
    (entry) =>
      !entry.plural && entry.numberUsage !== 'pluralOnly' && entry.numberUsage !== 'singularOnly',
  );

  if (noArticle.length > 0) {
    ui.fail(`${noArticle.length} nouns without an article`);
    printSample(noArticle.map((e) => `${e.rank}: ${e.german}`));
    errors.push(...noArticle.map((e) => `${e.id}: no article`));
  } else {
    ui.ok(`all ${nouns.length} nouns have an article`);
  }

  if (noPlural.length > 0) {
    ui.fail(`${noPlural.length} nouns without a plural or a number-usage exemption`);
    printSample(noPlural.map((e) => `${e.rank}: ${e.german} (${e.numberUsage})`));
    errors.push(...noPlural.map((e) => `${e.id}: no plural`));
  } else {
    ui.ok('all nouns have a plural, or are singular-only/plural-only');
  }

  /* ---- verbs ---- */
  const verbs = segment.filter((entry) => entry.wordClass === 'verb');
  const badVerbs = [];
  for (const entry of verbs) {
    for (const field of [
      'infinitive',
      'thirdPersonPresent',
      'simplePast',
      'pastParticiple',
      'auxiliary',
    ]) {
      if (!entry[field]) badVerbs.push(`${entry.id}: missing ${field}`);
    }
  }
  if (badVerbs.length > 0) {
    ui.fail(`${badVerbs.length} verb metadata gaps`);
    printSample(badVerbs);
    errors.push(...badVerbs);
  } else {
    ui.ok(`all ${verbs.length} verbs carry full conjugation metadata`);
  }

  /* ---- examples ---- */
  const noExample = segment.filter((entry) => (entry.exampleSentences ?? []).length === 0);
  if (noExample.length > 0) {
    ui.fail(`${noExample.length} entries without an example sentence`);
    printSample(noExample.map((e) => e.id));
    errors.push(...noExample.map((e) => `${e.id}: no example`));
  } else {
    ui.ok('every entry has an example sentence');
  }

  /* ---- every entry produces valid exercises ---- */
  const pool = segment;
  const noExercises = [];
  const invalidExercises = [];
  let generated = 0;

  for (const entry of segment) {
    const exercises = generateAllForEntry({
      entry,
      pool,
      random: createRandom(`audit-${entry.id}`),
      id: `audit-${entry.id}`,
    });
    if (exercises.length === 0) {
      noExercises.push(`${entry.id} (${entry.german})`);
      continue;
    }
    generated += exercises.length;
    for (const exercise of exercises) {
      const parsed = exerciseSchema.safeParse(exercise);
      if (!parsed.success) {
        invalidExercises.push(
          `${exercise.id} (${exercise.type}/${exercise.variant}): ${parsed.error.issues[0]?.message}`,
        );
      }
    }
  }

  if (noExercises.length > 0) {
    ui.fail(`${noExercises.length} entries produce no exercises`);
    printSample(noExercises);
    errors.push(...noExercises);
  } else {
    ui.ok(`every entry produces exercises (${generated} generated in total)`);
  }

  if (invalidExercises.length > 0) {
    ui.fail(`${invalidExercises.length} generated exercises fail schema validation`);
    printSample(invalidExercises);
    errors.push(...invalidExercises);
  } else {
    ui.ok('every generated exercise is schema-valid');
  }

  /* ---- editorial corrections still awaiting sign-off ---- */
  const corrected = segment.filter((entry) => entry.editorialCorrection);
  if (corrected.length > 0) {
    ui.warn(`${corrected.length} entries rely on an unreviewed editorial correction`);
    printSample(
      corrected.map((e) => `${e.rank}: ${e.german} — ${e.editorialCorrection.reason}`),
      5,
    );
    warnings.push(...corrected.map((e) => e.id));
  }

  finish(`audit:phase ${from}-${to}`, errors, warnings);
}

main();
