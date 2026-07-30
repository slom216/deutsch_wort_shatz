import type { CefrLevel } from '@/content/vocabulary/frequencyBands';

/**
 * Achievements and badges (§23).
 *
 * All twenty required achievements, plus mastery, frequency-band and CEFR-completion
 * badges. Each is a pure predicate over a snapshot of the learner's stats, so unlocking
 * is deterministic, re-evaluable, and cannot be double-awarded: the store writes by id.
 *
 * There is deliberately no paid currency, no leaderboard and no life system (§23).
 */

export interface AchievementStats {
  readonly wordsIntroduced: number;
  readonly wordsMastered: number;
  readonly totalCorrect: number;
  readonly reviewsCompleted: number;
  readonly currentStreak: number;
  readonly longestStreak: number;
  readonly perfectSessions: number;
  readonly listeningAnswers: number;
  readonly speakingAnswers: number;
  /** Correct answers to article, plural and verb-form questions. */
  readonly articleCorrect: number;
  readonly pluralCorrect: number;
  readonly verbFormCorrect: number;
  /** Introduced and mastered counts per CEFR level. */
  readonly introducedByLevel: Readonly<Record<CefrLevel, number>>;
  readonly masteredByLevel: Readonly<Record<CefrLevel, number>>;
  /** Total entries per level, for the completion badges. */
  readonly totalByLevel: Readonly<Record<CefrLevel, number>>;
}

export interface AchievementDefinition {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly category: 'milestone' | 'mastery' | 'streak' | 'skill' | 'level';
  /** Progress towards the achievement, 0–1. Reaching 1 unlocks it. */
  readonly progress: (stats: AchievementStats) => number;
}

const ratio = (value: number, target: number): number =>
  target <= 0 ? 0 : Math.min(1, value / target);

/** An "Explorer" badge is earned at 25% of a level introduced. */
const EXPLORER_SHARE = 0.25;

function levelExplorer(level: CefrLevel): AchievementDefinition {
  return {
    id: `${level.toLowerCase()}-explorer`,
    name: `${level} Explorer`,
    description: `Introduce a quarter of the ${level} vocabulary.`,
    category: 'level',
    progress: (stats) =>
      ratio(stats.introducedByLevel[level], stats.totalByLevel[level] * EXPLORER_SHARE),
  };
}

function levelMaster(level: CefrLevel): AchievementDefinition {
  return {
    id: `${level.toLowerCase()}-master`,
    name: `${level} Master`,
    description: `Master every ${level} entry.`,
    category: 'level',
    progress: (stats) => ratio(stats.masteredByLevel[level], stats.totalByLevel[level]),
  };
}

/** The twenty achievements required by §23, in the order listed there. */
export const ACHIEVEMENTS: readonly AchievementDefinition[] = [
  {
    id: 'first-word',
    name: 'First Word',
    description: 'Introduce your first vocabulary entry.',
    category: 'milestone',
    progress: (s) => ratio(s.wordsIntroduced, 1),
  },
  {
    id: 'first-review',
    name: 'First Review',
    description: 'Complete your first review.',
    category: 'milestone',
    progress: (s) => ratio(s.reviewsCompleted, 1),
  },
  {
    id: 'words-introduced-100',
    name: '100 Words Introduced',
    description: 'Introduce 100 vocabulary entries.',
    category: 'milestone',
    progress: (s) => ratio(s.wordsIntroduced, 100),
  },
  {
    id: 'words-mastered-100',
    name: '100 Words Mastered',
    description: 'Master 100 vocabulary entries.',
    category: 'mastery',
    progress: (s) => ratio(s.wordsMastered, 100),
  },
  levelExplorer('A1'),
  levelMaster('A1'),
  levelExplorer('A2'),
  levelMaster('A2'),
  levelExplorer('B1'),
  levelMaster('B1'),
  {
    id: 'streak-7',
    name: 'Seven-Day Streak',
    description: 'Study on seven consecutive days.',
    category: 'streak',
    progress: (s) => ratio(s.longestStreak, 7),
  },
  {
    id: 'streak-30',
    name: 'Thirty-Day Streak',
    description: 'Study on thirty consecutive days.',
    category: 'streak',
    progress: (s) => ratio(s.longestStreak, 30),
  },
  {
    id: 'article-expert',
    name: 'Article Expert',
    description: 'Answer 100 article questions correctly.',
    category: 'skill',
    progress: (s) => ratio(s.articleCorrect, 100),
  },
  {
    id: 'plural-expert',
    name: 'Plural Expert',
    description: 'Answer 100 plural questions correctly.',
    category: 'skill',
    progress: (s) => ratio(s.pluralCorrect, 100),
  },
  {
    id: 'verb-expert',
    name: 'Verb Expert',
    description: 'Answer 100 verb-form questions correctly.',
    category: 'skill',
    progress: (s) => ratio(s.verbFormCorrect, 100),
  },
  {
    id: 'perfect-session',
    name: 'Perfect Session',
    description: 'Finish a full session without a single mistake.',
    category: 'milestone',
    progress: (s) => ratio(s.perfectSessions, 1),
  },
  {
    id: 'listening-practice',
    name: 'Listening Practice',
    description: 'Complete 50 listening exercises.',
    category: 'skill',
    progress: (s) => ratio(s.listeningAnswers, 50),
  },
  {
    id: 'speaking-practice',
    name: 'Speaking Practice',
    description: 'Complete 50 speaking exercises.',
    category: 'skill',
    progress: (s) => ratio(s.speakingAnswers, 50),
  },
  {
    id: 'correct-1000',
    name: '1,000 Correct Answers',
    description: 'Answer 1,000 exercises correctly.',
    category: 'milestone',
    progress: (s) => ratio(s.totalCorrect, 1_000),
  },
  {
    id: 'correct-10000',
    name: '10,000 Correct Answers',
    description: 'Answer 10,000 exercises correctly.',
    category: 'milestone',
    progress: (s) => ratio(s.totalCorrect, 10_000),
  },
];

export interface AchievementStatus {
  readonly definition: AchievementDefinition;
  readonly progress: number;
  readonly unlocked: boolean;
  readonly unlockedAt: string | null;
}

/** Evaluates every achievement against the current stats. */
export function evaluateAchievements(
  stats: AchievementStats,
  unlockedAt: ReadonlyMap<string, string> = new Map(),
): AchievementStatus[] {
  return ACHIEVEMENTS.map((definition) => {
    const progress = Math.min(1, Math.max(0, definition.progress(stats)));
    const previously = unlockedAt.get(definition.id) ?? null;
    return {
      definition,
      progress,
      // Once unlocked, an achievement stays unlocked even if stats later dip.
      unlocked: progress >= 1 || previously !== null,
      unlockedAt: previously,
    };
  });
}

/** Achievements that have just reached 100% and were not previously recorded. */
export function newlyUnlocked(
  stats: AchievementStats,
  unlockedAt: ReadonlyMap<string, string>,
): AchievementDefinition[] {
  return evaluateAchievements(stats, unlockedAt)
    .filter((status) => status.progress >= 1 && status.unlockedAt === null)
    .map((status) => status.definition);
}
