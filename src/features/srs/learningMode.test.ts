import { describe, expect, it } from 'vitest';

import { LEARNING_MODES, MASTERY_TARGETS, masteryTarget, xpMultiplier } from './learningMode';
import { formatForScore, ladderForTarget } from '@/features/practice/session/endless';
import { nextMasteryScore } from './repository';

describe('learning modes', () => {
  it('asks for four, three and two clean answers', () => {
    expect(MASTERY_TARGETS).toEqual({ normal: 4, fast: 3, ultraFast: 2 });
    for (const mode of LEARNING_MODES) expect(masteryTarget(mode)).toBe(MASTERY_TARGETS[mode]);
  });

  it('gives every mode a ladder rung per score below its target', () => {
    for (const mode of LEARNING_MODES) {
      expect(ladderForTarget(masteryTarget(mode))).toHaveLength(masteryTarget(mode));
    }
  });

  it('opens every mode on recognition and closes on typed production', () => {
    for (const mode of LEARNING_MODES.filter((m) => m !== 'ultraFast')) {
      const ladder = ladderForTarget(masteryTarget(mode));
      expect(ladder[0]).toEqual({ type: 'multipleChoice', variant: 'germanToEnglish' });
      // §19's floors: no mode may call a word learned on recognition alone.
      expect(
        ladder.some(
          (rung) => rung.type === 'typedTranslation' && rung.variant === 'englishToGerman',
        ),
      ).toBe(true);
    }
  });

  it('keeps ultra fast to multiple choice in both directions', () => {
    expect(ladderForTarget(2)).toEqual([
      { type: 'multipleChoice', variant: 'germanToEnglish' },
      { type: 'multipleChoice', variant: 'englishToGerman' },
    ]);
  });

  it('clamps the format to the last rung of a shorter ladder', () => {
    // Ultra fast has two rungs; a word carried over at score 3 must not read past the end.
    expect(formatForScore(3, 2)).toEqual({ type: 'multipleChoice', variant: 'englishToGerman' });
    expect(formatForScore(-1, 2)).toEqual({ type: 'multipleChoice', variant: 'germanToEnglish' });
  });

  it('normalizes XP so a mastered word is worth the same in every mode', () => {
    const BASE = 5;
    for (const mode of LEARNING_MODES) {
      const perWord = BASE * xpMultiplier(mode) * masteryTarget(mode);
      expect(perWord).toBeCloseTo(BASE * MASTERY_TARGETS.normal, 10);
    }
  });

  it('caps the running score at the mode target', () => {
    const clean = { correct: true, attempts: 1, revealed: false };
    for (const mode of LEARNING_MODES) {
      const target = masteryTarget(mode);
      let score = 0;
      for (let i = 0; i < target + 3; i += 1) score = nextMasteryScore(score, clean, target);
      expect(score).toBe(target);
    }
  });

  it('still costs a rung for a wrong answer, floored at zero', () => {
    const wrong = { correct: false, attempts: 1, revealed: false };
    expect(nextMasteryScore(2, wrong, 2)).toBe(1);
    expect(nextMasteryScore(0, wrong, 2)).toBe(0);
  });
});
