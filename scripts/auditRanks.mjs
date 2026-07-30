/**
 * `npm run audit:ranks`
 *
 * Enforces the global rank contract (§2, §8, §13): ranks are unique, inside 1–10,000,
 * free of gaps across completed ranges, and consistent with their frequency band.
 *
 * §34: development must never advance while this audit fails.
 */

import {
  FREQUENCY_BANDS,
  LEVEL_RANK_RANGES,
  TOTAL_ENTRY_COUNT,
} from '../src/content/vocabulary/frequencyBands.ts';
import { finish, loadAllEntries, printSample, ui } from './lib/loadDataset.mjs';

function main() {
  const { entries } = loadAllEntries();
  const errors = [];

  ui.heading(`audit:ranks — ${entries.length} entries`);

  /* ---- uniqueness ---- */
  const seen = new Map();
  const duplicates = [];
  for (const entry of entries) {
    const existing = seen.get(entry.rank);
    if (existing) {
      duplicates.push(`rank ${entry.rank}: ${existing} and ${entry.id}`);
    } else {
      seen.set(entry.rank, entry.id);
    }
  }
  if (duplicates.length > 0) {
    ui.fail(`${duplicates.length} duplicate ranks`);
    printSample(duplicates);
    errors.push(...duplicates);
  } else {
    ui.ok('every rank is unique');
  }

  /* ---- bounds ---- */
  const outOfRange = entries
    .filter((e) => !Number.isInteger(e.rank) || e.rank < 1 || e.rank > TOTAL_ENTRY_COUNT)
    .map((e) => `${e.id}: rank ${e.rank}`);
  if (outOfRange.length > 0) {
    ui.fail(`${outOfRange.length} ranks outside 1–${TOTAL_ENTRY_COUNT}`);
    printSample(outOfRange);
    errors.push(...outOfRange);
  } else {
    ui.ok(`every rank is an integer within 1–${TOTAL_ENTRY_COUNT.toLocaleString('en-US')}`);
  }

  /* ---- gaps ---- */
  const missing = [];
  for (let rank = 1; rank <= TOTAL_ENTRY_COUNT; rank += 1) {
    if (!seen.has(rank)) missing.push(rank);
  }
  if (missing.length > 0) {
    ui.fail(`${missing.length} missing ranks in 1–${TOTAL_ENTRY_COUNT}`);
    printSample(missing.map(String));
    errors.push(...missing.map((r) => `missing rank ${r}`));
  } else {
    ui.ok('the rank sequence 1–10,000 is complete with no gaps');
  }

  /* ---- level ranges (§2) ---- */
  for (const [level, range] of Object.entries(LEVEL_RANK_RANGES)) {
    const strays = entries
      .filter((e) => e.level === level && (e.rank < range.from || e.rank > range.to))
      .map((e) => `${e.id}: rank ${e.rank} outside ${level} range ${range.from}–${range.to}`);
    if (strays.length > 0) {
      ui.fail(`${strays.length} ${level} entries outside their rank range`);
      printSample(strays);
      errors.push(...strays);
    }
  }

  /* ---- band occupancy (§8) ---- */
  const bandProblems = [];
  for (const band of FREQUENCY_BANDS) {
    const expected = band.to - band.from + 1;
    const actual = entries.filter((e) => e.frequencyBand === band.id).length;
    if (actual !== expected) {
      bandProblems.push(`${band.id}: expected ${expected} entries, found ${actual}`);
    }
  }
  if (bandProblems.length > 0) {
    ui.fail(`${bandProblems.length} frequency bands have the wrong entry count`);
    printSample(bandProblems);
    errors.push(...bandProblems);
  } else {
    ui.ok('all twelve frequency bands are exactly full');
  }

  finish('audit:ranks', errors);
}

main();
