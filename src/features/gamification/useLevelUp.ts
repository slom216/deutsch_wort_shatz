import { useEffect, useRef, useState } from 'react';

/**
 * The level held before the current one, from the moment it rises until the learner
 * dismisses the news. Null while nothing has been earned — and while `level` is null,
 * which is how the caller says the lifetime total is still loading: the first reading
 * arrives as a jump from 1 to whatever was already earned, which is not a level-up.
 */
export function useLevelUp(level: number | null): number | null {
  const [previous, setPrevious] = useState<number | null>(null);
  const seen = useRef<number | null>(null);

  useEffect(() => {
    if (level === null) return;
    const before = seen.current;
    seen.current = level;
    if (before !== null && level > before) setPrevious(before);
  }, [level]);

  return previous;
}
