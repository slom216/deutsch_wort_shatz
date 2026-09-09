import { describe, expect, it } from 'vitest';

import { introductionOrder } from './introductionOrder';

const band = (n: number): string[] => Array.from({ length: n }, (_, i) => `w${i}`);

describe('introductionOrder', () => {
  it('is stable for a band, so a resumed stream keeps its place', () => {
    const first = introductionOrder('a1-core-1', band(200));
    const second = introductionOrder('a1-core-1', band(200));
    expect(second).toEqual(first);
  });

  it('orders different bands differently', () => {
    expect(introductionOrder('a1-core-2', band(200))).not.toEqual(
      introductionOrder('a1-core-1', band(200)),
    );
  });

  it('keeps every word exactly once', () => {
    const input = band(200);
    const ordered = introductionOrder('a1-core-1', input);
    expect(ordered).toHaveLength(input.length);
    expect([...ordered].sort()).toEqual([...input].sort());
  });

  it('does not mutate its input', () => {
    const input = band(20);
    introductionOrder('a1-core-1', input);
    expect(input).toEqual(band(20));
  });

  it('breaks up the block of consecutive same-topic words', () => {
    // The shape of the real A1 data: the first 41 entries are all numbers, and walking the
    // band verbatim means meeting forty of them before anything else.
    const entries = Array.from({ length: 200 }, (_, i) => ({
      topic: i < 41 ? 'Numbers and quantities' : `topic-${i % 7}`,
    }));

    const longestRun = (list: readonly { topic: string }[]): number => {
      let best = 0;
      let run = 0;
      let previous = '';
      for (const item of list) {
        run = item.topic === previous ? run + 1 : 1;
        previous = item.topic;
        best = Math.max(best, run);
      }
      return best;
    };

    expect(longestRun(entries)).toBe(41);
    expect(longestRun(introductionOrder('a1-core-1', entries))).toBeLessThan(6);
  });

  it('handles empty and single-entry bands', () => {
    expect(introductionOrder('a1-core-1', [])).toEqual([]);
    expect(introductionOrder('a1-core-1', ['only'])).toEqual(['only']);
  });
});
