import { db, type VocabularyLearningDatabase } from '@/features/persistence/db';
import type { EntryProgress, ExerciseHistory } from '@/schemas/progressSchema';
import { localDateKey } from '@/features/srs/localDate';
import {
  bandEntryCount,
  bandForRank,
  FREQUENCY_BANDS,
  LEVEL_ENTRY_COUNTS,
  type CefrLevel,
} from '@/content/vocabulary/frequencyBands';
import {
  evaluateAchievements,
  newlyUnlocked,
  type AchievementStats,
  type AchievementStatus,
} from './achievements';
import { computeStreak, dailyGoalState, type DailyGoalState, type StreakState } from './streak';
import {
  exerciseXp,
  levelProgress,
  PERFECT_SESSION_MIN_EXERCISES,
  XP_COMPLETE_BAND,
  XP_COMPLETE_LEVEL,
  XP_DAILY_GOAL,
  XP_MASTER_ENTRY,
  XP_PERFECT_SESSION,
  type LevelProgress,
} from './xp';

/**
 * Gamification persistence (§23, §24).
 *
 * Total XP is *derived*, never incremented: it is the sum of `xpAwarded` on each stored
 * exercise plus the bonus rows in `xpEvents`. Both are written with deterministic ids, so
 * answering the same exercise twice or reloading a finished session cannot inflate the
 * total — the Phase 7 criterion "refresh cannot duplicate XP".
 */

const LEVELS: readonly CefrLevel[] = ['A1', 'A2', 'B1'];

export interface AwardBonusInput {
  readonly id: string;
  readonly type: string;
  readonly amount: number;
  readonly at?: Date;
}

/** Idempotent: awarding the same id twice leaves the total unchanged. */
export async function awardBonus(
  input: AwardBonusInput,
  database: VocabularyLearningDatabase = db,
): Promise<void> {
  if (input.amount <= 0) return;
  await database.xpEvents.put({
    id: input.id,
    type: input.type,
    amount: input.amount,
    awardedAt: (input.at ?? new Date()).toISOString(),
  });
}

export async function awardMasteryBonus(
  entryId: string,
  database: VocabularyLearningDatabase = db,
): Promise<void> {
  await awardBonus(
    { id: `mastery:${entryId}`, type: 'mastery', amount: XP_MASTER_ENTRY },
    database,
  );
}

/** Awards the perfect-session bonus if the session qualifies (§23). */
export async function awardSessionBonuses(
  sessionId: string,
  database: VocabularyLearningDatabase = db,
): Promise<void> {
  const history = await database.exerciseHistory.where('sessionId').equals(sessionId).toArray();

  const perfect =
    history.length >= PERFECT_SESSION_MIN_EXERCISES &&
    history.every((row) => row.correct && row.firstAttempt && !row.revealed);
  if (perfect) {
    await awardBonus(
      { id: `perfect:${sessionId}`, type: 'perfectSession', amount: XP_PERFECT_SESSION },
      database,
    );
  }
}

/**
 * Rank encoded in a stable id (§12), e.g. `a1-0042-der-mann` → 42.
 *
 * Reading the rank from the id means completion can be checked without loading the
 * 2.8 MB search index just to find out which band an entry belongs to.
 */
function rankOf(entryId: string): number | null {
  const match = /^[ab][12]-(\d{4,})-/.exec(entryId);
  if (!match?.[1]) return null;
  const rank = Number(match[1]);
  return Number.isFinite(rank) ? rank : null;
}

/**
 * Awards the frequency-band (100 XP) and CEFR-level (500 XP) completion bonuses (§23).
 *
 * "Complete" means every entry mastered, matching the A1/A2/B1 Master achievements.
 * Both are keyed by band or level, so re-checking after every session is free.
 */
export async function awardCompletionBonuses(
  database: VocabularyLearningDatabase = db,
): Promise<void> {
  const progress = await database.entryProgress.toArray();

  const masteredByBand = new Map<string, number>();
  const masteredByLevel: Record<CefrLevel, number> = { A1: 0, A2: 0, B1: 0 };

  for (const record of progress) {
    if (record.srs.status !== 'mastered') continue;
    const rank = rankOf(record.entryId);
    if (rank === null) continue;
    const band = bandForRank(rank);
    if (!band) continue;
    masteredByBand.set(band.id, (masteredByBand.get(band.id) ?? 0) + 1);
    masteredByLevel[band.level] += 1;
  }

  for (const band of FREQUENCY_BANDS) {
    if ((masteredByBand.get(band.id) ?? 0) < bandEntryCount(band)) continue;
    await awardBonus(
      { id: `band:${band.id}`, type: 'bandComplete', amount: XP_COMPLETE_BAND },
      database,
    );
  }

  for (const level of LEVELS) {
    if (masteredByLevel[level] < LEVEL_ENTRY_COUNTS[level]) continue;
    await awardBonus(
      { id: `level:${level}`, type: 'levelComplete', amount: XP_COMPLETE_LEVEL },
      database,
    );
  }
}

/** Awards the daily-goal bonus once per local day (§23). */
export async function awardDailyGoalBonus(
  goal: number,
  now: Date = new Date(),
  database: VocabularyLearningDatabase = db,
): Promise<void> {
  const history = await database.exerciseHistory.toArray();
  const state = dailyGoalState(history, goal, now);
  if (!state.met) return;
  await awardBonus(
    { id: `daily:${localDateKey(now)}`, type: 'dailyGoal', amount: XP_DAILY_GOAL, at: now },
    database,
  );
}

export interface GamificationSnapshot {
  readonly totalXp: number;
  readonly level: LevelProgress;
  readonly streak: StreakState;
  readonly dailyGoal: DailyGoalState;
  readonly achievements: readonly AchievementStatus[];
  readonly unlockedCount: number;
  readonly stats: AchievementStats;
}

/** Recomputes everything from stored history. Cheap enough to call on each screen. */
export async function loadGamification(
  goal: number,
  totalByLevel: Readonly<Record<CefrLevel, number>>,
  now: Date = new Date(),
  database: VocabularyLearningDatabase = db,
  /** Streak freezes the learner holds; each bridges one missed day (§23). */
  freezes = 0,
): Promise<GamificationSnapshot> {
  const [history, progress, events, unlockedRows] = await Promise.all([
    database.exerciseHistory.toArray(),
    database.entryProgress.toArray(),
    database.xpEvents.toArray(),
    database.achievements.toArray(),
  ]);

  const exerciseXpTotal = history.reduce((sum, row) => sum + row.xpAwarded, 0);
  const bonusXpTotal = events.reduce((sum, event) => sum + event.amount, 0);
  const totalXp = exerciseXpTotal + bonusXpTotal;

  const unlockedAt = new Map(unlockedRows.map((row) => [row.id, row.unlockedAt]));
  const streak = computeStreak(history, now, freezes);
  const stats = buildStats(history, progress, streak, totalByLevel);

  return {
    totalXp,
    level: levelProgress(totalXp),
    streak,
    dailyGoal: dailyGoalState(history, goal, now),
    achievements: evaluateAchievements(stats, unlockedAt),
    unlockedCount: unlockedRows.length,
    stats,
  };
}

/**
 * Unlocks any achievement that has just reached 100%.
 * Writes by achievement id, so an achievement can never be recorded twice (§23).
 */
export async function syncAchievements(
  stats: AchievementStats,
  now: Date = new Date(),
  database: VocabularyLearningDatabase = db,
): Promise<string[]> {
  const unlockedRows = await database.achievements.toArray();
  const unlockedAt = new Map(unlockedRows.map((row) => [row.id, row.unlockedAt]));

  const fresh = newlyUnlocked(stats, unlockedAt);
  if (fresh.length === 0) return [];

  await database.achievements.bulkPut(
    fresh.map((definition) => ({
      id: definition.id,
      unlockedAt: now.toISOString(),
      progress: 1,
    })),
  );
  return fresh.map((definition) => definition.id);
}

function levelOf(entryId: string): CefrLevel | null {
  if (entryId.startsWith('a1-')) return 'A1';
  if (entryId.startsWith('a2-')) return 'A2';
  if (entryId.startsWith('b1-')) return 'B1';
  return null;
}

function buildStats(
  history: readonly ExerciseHistory[],
  progress: readonly EntryProgress[],
  streak: StreakState,
  totalByLevel: Readonly<Record<CefrLevel, number>>,
): AchievementStats {
  const introducedByLevel: Record<CefrLevel, number> = { A1: 0, A2: 0, B1: 0 };
  const masteredByLevel: Record<CefrLevel, number> = { A1: 0, A2: 0, B1: 0 };

  for (const record of progress) {
    const level = levelOf(record.entryId);
    if (!level) continue;
    introducedByLevel[level] += 1;
    if (record.srs.status === 'mastered') masteredByLevel[level] += 1;
  }

  // Property-specific counts come from the exercise variant recorded on each row.
  const correctWithVariant = (needle: string): number =>
    history.filter((row) => row.correct && (row.direction ?? '').toLowerCase().includes(needle))
      .length;

  const sessions = new Map<string, ExerciseHistory[]>();
  for (const row of history) {
    const bucket = sessions.get(row.sessionId) ?? [];
    bucket.push(row);
    sessions.set(row.sessionId, bucket);
  }
  const perfectSessions = [...sessions.values()].filter(
    (rows) =>
      rows.length >= PERFECT_SESSION_MIN_EXERCISES &&
      rows.every((row) => row.correct && row.firstAttempt && !row.revealed),
  ).length;

  return {
    wordsIntroduced: progress.length,
    wordsMastered: progress.filter((record) => record.srs.status === 'mastered').length,
    totalCorrect: history.filter((row) => row.correct).length,
    reviewsCompleted: history.length,
    currentStreak: streak.current,
    longestStreak: streak.longest,
    perfectSessions,
    listeningAnswers: history.filter((row) => row.exerciseType === 'listening').length,
    speakingAnswers: history.filter((row) => row.exerciseType === 'speaking').length,
    articleCorrect: correctWithVariant('article'),
    pluralCorrect: correctWithVariant('plural'),
    verbFormCorrect: correctWithVariant('verbform'),
    introducedByLevel,
    masteredByLevel,
    totalByLevel,
  };
}

export { exerciseXp, LEVELS };
