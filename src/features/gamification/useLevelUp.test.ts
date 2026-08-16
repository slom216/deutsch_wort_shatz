import { renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { useLevelUp } from './useLevelUp';

describe('useLevelUp', () => {
  it('reports the level left behind only once the level rises', () => {
    const { result, rerender } = renderHook(({ level }) => useLevelUp(level), {
      initialProps: { level: null as number | null },
    });

    // Loading, then the first real reading — a jump from nothing is not a promotion.
    expect(result.current).toBeNull();
    rerender({ level: 4 });
    expect(result.current).toBeNull();

    rerender({ level: 5 });
    expect(result.current).toBe(4);

    // A wrong answer can drop the running total back; that is not news either.
    rerender({ level: 4 });
    expect(result.current).toBe(4);
  });
});
