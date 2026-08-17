import { beforeAll, describe, expect, it } from 'vitest';

import { multipleChoiceExerciseSchema } from '@/schemas/exerciseSchema';
import type { VocabularyEntry } from '@/schemas/vocabularySchema';
import { loadPilotDataset } from '@/test/fixtures/pilotDataset';
import { headword, primaryEnglish } from './generators/entryHelpers';
import { createRandom } from './random';
import { levelThreshold, questionFor, streakLevel } from './streakGame';

let pilot: readonly VocabularyEntry[];

beforeAll(async () => {
  pilot = await loadPilotDataset();
});

describe('streak levels', () => {
  it('promotes after 10 correct answers, then 20 more, then 30 more', () => {
    expect(levelThreshold(1)).toBe(0);
    expect([2, 3, 4, 5, 6, 7].map(levelThreshold)).toEqual([10, 30, 60, 100, 150, 210]);
  });

  it('sits on a level until its threshold is reached', () => {
    expect(streakLevel(0)).toBe(1);
    expect(streakLevel(9)).toBe(1);
    expect(streakLevel(10)).toBe(2);
    expect(streakLevel(29)).toBe(2);
    expect(streakLevel(30)).toBe(3);
    expect(streakLevel(60)).toBe(4);
    expect(streakLevel(100)).toBe(5);
    expect(streakLevel(150)).toBe(6);
    expect(streakLevel(210)).toBe(7);
  });

  it('never goes backwards, and never by more than one step', () => {
    for (let correct = 1; correct <= 250; correct += 1) {
      const jump = streakLevel(correct) - streakLevel(correct - 1);
      expect(jump).toBeGreaterThanOrEqual(0);
      expect(jump).toBeLessThanOrEqual(1);
    }
  });
});

describe('streak questions', () => {
  /** Questions drawn for one entry over many seeds — the direction is random. */
  function draw(entry: VocabularyEntry, seeds = 40) {
    const questions = [];
    for (let i = 0; i < seeds; i += 1) {
      const built = questionFor(entry, pilot, createRandom(`draw-${i}`), `q-${i}`);
      if (built) questions.push(built);
    }
    return questions;
  }

  it('asks in both directions', () => {
    const entry = pilot[0] as VocabularyEntry;
    const variants = new Set(draw(entry).map((question) => question.variant));
    expect(variants).toEqual(new Set(['germanToEnglish', 'englishToGerman']));
  });

  it('builds a valid multiple choice whose correct option matches the direction', () => {
    // Every entry, not a sample: a single word that cannot make a question is fine — the
    // game skips it — but a direction that marks the wrong option correct is not.
    for (const entry of pilot) {
      for (const question of draw(entry, 8)) {
        expect(() => multipleChoiceExerciseSchema.parse(question)).not.toThrow();
        expect(question.entryId).toBe(entry.id);

        const correct = question.options[question.correctIndex];
        expect(correct).toBe(
          question.variant === 'germanToEnglish' ? primaryEnglish(entry) : headword(entry),
        );
        expect(question.question).toBe(
          question.variant === 'germanToEnglish' ? headword(entry) : primaryEnglish(entry),
        );
      }
    }
  });

  it('offers at least two options to choose between', () => {
    for (const entry of pilot) {
      for (const question of draw(entry, 4)) {
        expect(question.options.length).toBeGreaterThanOrEqual(2);
        expect(new Set(question.options).size).toBe(question.options.length);
      }
    }
  });
});
