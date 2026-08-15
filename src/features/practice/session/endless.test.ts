import { describe, expect, it } from 'vitest';

import { createRandom } from '../random';
import {
  formatForScore,
  REQUEUE_AFTER_CORRECT,
  REQUEUE_AFTER_WRONG,
  requeueOffset,
  SCORE_FORMATS,
  takeReady,
  type Requeued,
} from './endless';

describe('requeueOffset', () => {
  const random = createRandom('spacing');

  it('brings a wrong answer back within 25–50 exercises', () => {
    const [from, to] = REQUEUE_AFTER_WRONG;
    for (let i = 0; i < 200; i += 1) {
      const offset = requeueOffset({ correct: false, masteryScore: 3 }, random);
      expect(offset).not.toBeNull();
      expect(offset as number).toBeGreaterThanOrEqual(from);
      expect(offset as number).toBeLessThanOrEqual(to);
    }
  });

  it('brings a correct answer back within 50–100 exercises while the score is below target', () => {
    const [from, to] = REQUEUE_AFTER_CORRECT;
    for (let i = 0; i < 200; i += 1) {
      const offset = requeueOffset({ correct: true, masteryScore: 4 }, random);
      expect(offset).not.toBeNull();
      expect(offset as number).toBeGreaterThanOrEqual(from);
      expect(offset as number).toBeLessThanOrEqual(to);
    }
  });

  it('uses the whole range rather than one value', () => {
    const seen = new Set<number | null>();
    for (let i = 0; i < 200; i += 1) {
      seen.add(requeueOffset({ correct: false, masteryScore: 0 }, random));
    }
    expect(seen.size).toBeGreaterThan(5);
  });

  it('drops a learned word from the stream once it is answered correctly', () => {
    expect(requeueOffset({ correct: true, masteryScore: 5 }, random)).toBeNull();
    // ...but a wrong answer puts it straight back, whatever the score was.
    expect(requeueOffset({ correct: false, masteryScore: 5 }, random)).not.toBeNull();
  });
});

describe('takeReady', () => {
  const queue: Requeued[] = [
    { entryId: 'later', at: 40 },
    { entryId: 'now', at: 10 },
    { entryId: 'soon', at: 20 },
  ];

  it('returns nothing while every entry is still waiting', () => {
    expect(takeReady(queue, 9)).toBeNull();
  });

  it('takes the earliest entry that has come round, leaving the rest', () => {
    const taken = takeReady(queue, 25);
    expect(taken?.entryId).toBe('now');
    expect(taken?.rest.map((item) => item.entryId)).toEqual(['later', 'soon']);
  });

  it('empties in order over successive positions', () => {
    let remaining: Requeued[] = queue;
    const order: string[] = [];
    for (let position = 0; position < 50 && remaining.length > 0; position += 1) {
      const taken = takeReady(remaining, position);
      if (!taken) continue;
      order.push(taken.entryId);
      remaining = taken.rest;
    }
    expect(order).toEqual(['now', 'soon', 'later']);
  });
});

describe('formatForScore', () => {
  it('walks recognition to production, alternating direction', () => {
    expect(formatForScore(0)).toEqual({ type: 'multipleChoice', variant: 'germanToEnglish' });
    expect(formatForScore(1)).toEqual({ type: 'multipleChoice', variant: 'englishToGerman' });
    expect(formatForScore(2)).toEqual({ type: 'multipleChoice', variant: 'germanToEnglish' });
    expect(formatForScore(3)).toEqual({ type: 'typedTranslation', variant: 'englishToGerman' });
    expect(formatForScore(4)).toEqual({ type: 'typedTranslation', variant: 'germanToEnglish' });
  });

  it('clamps at both ends', () => {
    expect(formatForScore(-3)).toEqual(SCORE_FORMATS[0]);
    // 5 is mastery, where the SRS takes over; anything higher still has to answer.
    expect(formatForScore(5)).toEqual(SCORE_FORMATS[SCORE_FORMATS.length - 1]);
    expect(formatForScore(99)).toEqual(SCORE_FORMATS[SCORE_FORMATS.length - 1]);
  });

  it('never asks a brand-new word to be typed', () => {
    expect(formatForScore(0).type).toBe('multipleChoice');
  });
});
