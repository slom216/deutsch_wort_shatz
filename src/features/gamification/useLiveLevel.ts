import { useEffect, useMemo, useState } from 'react';

import { useSessionStore } from '@/features/practice/session/sessionStore';
import { useGamification } from './useGamification';
import { levelProgress, type LevelProgress } from './xp';

export interface LiveLevel {
  readonly totalXp: number;
  readonly sessionXp: number;
  readonly level: LevelProgress;
  /** XP from the most recent answer. Zero when nothing has been answered yet. */
  readonly lastXp: number;
  /** Changes with every answer — use as a React key to replay the gain animation. */
  readonly answerCount: number;
  /** False until the lifetime total has been read, so callers can skip a first-frame jump. */
  readonly ready: boolean;
}

/**
 * Level and XP that move with the running session.
 *
 * The lifetime total is derived from stored history (§23) and recomputing it after every
 * answer would mean re-reading the whole history table, so this adds the session's XP to
 * the total read once at the start.
 */
export function useLiveLevel(): LiveLevel {
  const { snapshot } = useGamification();
  const answers = useSessionStore((state) => state.answers);
  const bonusXp = useSessionStore((state) => state.bonusXp);

  const sessionXp = useMemo(
    () => answers.reduce((sum, answer) => sum + (answer.xpAwarded ?? 0), 0) + bonusXp,
    [answers, bonusXp],
  );

  const [baseXp, setBaseXp] = useState<number | null>(null);
  useEffect(() => {
    if (baseXp !== null || !snapshot) return;
    // Answers given before the snapshot loaded are already inside its total.
    setBaseXp(Math.max(0, snapshot.totalXp - sessionXp));
  }, [snapshot, baseXp, sessionXp]);

  // Floored at zero to match the stored total: a session of wrong answers can take the
  // running figure below it, and a negative total makes `xpForNextLevel` overshoot level 2.
  const totalXp = Math.max(0, (baseXp ?? 0) + sessionXp);
  return {
    totalXp,
    sessionXp,
    level: levelProgress(totalXp),
    lastXp: answers[answers.length - 1]?.xpAwarded ?? 0,
    answerCount: answers.length,
    ready: baseXp !== null,
  };
}
