import { create } from 'zustand';

import { db } from '@/features/persistence/db';
import type { Exercise, EvaluationResult } from '@/schemas/exerciseSchema';
import type { Grade } from '@/schemas/progressSchema';
import { loadAllProgress, loadProgress, recordReview } from '@/features/srs/repository';
import {
  awardCompletionBonuses,
  awardMasteryBonus,
  awardSessionBonuses,
  awardDailyGoalBonus,
} from '@/features/gamification/repository';
import { exerciseXp, XP_MASTER_ENTRY } from '@/features/gamification/xp';
import type { PracticeSessionRecord } from '@/schemas/sessionSchema';
import type { VocabularyEntry } from '@/schemas/vocabularySchema';
import { buildSession, type SessionMode } from './buildSession';

/**
 * Running-session state (§19, §24).
 *
 * The exercise list is rebuilt deterministically from the session id, so only outcomes
 * need to be persisted, not the generated content. Every answered exercise is written to
 * `exerciseHistory` as it happens, which is what makes results survive a refresh.
 *
 * Each answer is handed to the SRS, which grades it automatically, recomputes difficulty
 * and reschedules the entry (§20, §21).
 *
 * Reloading mid-session resumes rather than restarting: the exercises rebuild identically
 * from the seed, and the answers already in `exerciseHistory` are replayed into memory. A
 * restart would re-answer them, and while history rows are idempotent, `recordReview` is
 * not — the entry would be graded and rescheduled twice.
 */

export interface AnsweredExercise {
  readonly exerciseId: string;
  readonly entryId: string;
  readonly result: EvaluationResult;
  readonly attempts: number;
  readonly revealed: boolean;
  /** Whether the learner opened the hint before answering (§20: caps the grade at 1). */
  readonly hintUsed: boolean;
  readonly responseMs: number;
  /** Filled in by the store; callers do not supply it. */
  readonly xpAwarded?: number;
}

interface SessionState {
  readonly sessionId: string | null;
  readonly mode: SessionMode;
  readonly exercises: readonly Exercise[];
  readonly currentIndex: number;
  readonly answers: readonly AnsweredExercise[];
  readonly status: 'idle' | 'active' | 'completed';
  readonly startedAt: string;
  /**
   * Bonus XP awarded during this session — currently mastery bonuses, which are written
   * to `xpEvents` rather than to an exercise row. Tracked here so a running session can
   * show a live total without recomputing the lifetime total from stored history.
   */
  readonly bonusXp: number;

  readonly start: (options: {
    sessionId: string;
    mode: SessionMode;
    entries: readonly VocabularyEntry[];
    pool?: readonly VocabularyEntry[];
    targetExerciseCount?: number;
    newWordEntryCount?: number;
    allowedTypes?: readonly Exercise['type'][];
    strictAnswerChecking?: boolean;
  }) => Promise<void>;
  readonly recordAnswer: (answer: AnsweredExercise) => Promise<void>;
  readonly advance: () => Promise<void>;
  /**
   * Appends one exercise and makes it current. Continuous mode builds its stream this
   * way — the exercise after next depends on how the last one was answered, so it cannot
   * be planned in advance the way a fixed session is.
   */
  readonly serve: (exercise: Exercise) => Promise<void>;
  /**
   * Removes the exercise on screen without answering it — what skipping a word does.
   *
   * It has to leave, not merely be stepped over: a resumed session replays history and
   * stops at the first exercise with no row (see `start`), so an unanswered exercise left
   * in the list would be where every later reload resumed, stranding the answers after it.
   */
  readonly dropCurrent: () => Promise<void>;
  /** Closes the session and awards its end-of-session bonuses. Safe to call twice. */
  readonly finish: () => Promise<void>;
  readonly reset: () => void;
}

function summarize(
  sessionId: string,
  mode: SessionMode,
  exercises: readonly Exercise[],
  answers: readonly AnsweredExercise[],
  startedAt: string,
  completed: boolean,
): PracticeSessionRecord {
  const correct = answers.filter((a) => a.result.correct).length;
  const firstAttemptCorrect = answers.filter(
    (a) => a.result.correct && a.attempts === 1 && !a.revealed,
  ).length;

  return {
    id: sessionId,
    mode,
    status: completed ? 'completed' : 'active',
    startedAt,
    ...(completed ? { completedAt: new Date().toISOString() } : {}),
    entryIds: [...new Set(exercises.map((e) => e.entryId))],
    exerciseTypes: [...new Set(exercises.map((e) => e.type))],
    plannedExerciseCount: exercises.length,
    completedExerciseCount: answers.length,
    correctCount: correct,
    firstAttemptCorrectCount: firstAttemptCorrect,
    xpEarned: answers.reduce((sum, answer) => sum + (answer.xpAwarded ?? 0), 0),
    exercises: [...exercises],
  };
}

export const useSessionStore = create<SessionState>((set, get) => ({
  sessionId: null,
  mode: 'review',
  exercises: [],
  currentIndex: 0,
  answers: [],
  status: 'idle',
  startedAt: new Date().toISOString(),
  bonusXp: 0,

  start: async ({
    sessionId,
    mode,
    entries,
    pool,
    targetExerciseCount,
    newWordEntryCount,
    allowedTypes,
    strictAnswerChecking,
  }) => {
    // Stored progress drives exercise adaptation (§21): the builder uses each entry's
    // automatic difficulty to decide which formats it gets.
    const [stored, existingRecord, history] = await Promise.all([
      loadAllProgress(),
      db.sessions.get(sessionId),
      db.exerciseHistory.where('sessionId').equals(sessionId).toArray(),
    ]);
    const progressByEntry = new Map(stored.map((record) => [record.entryId, record]));

    // An interrupted session resumes with the exercises it was actually built from. They
    // are only regenerated for a session that has none stored, because generation reads
    // the learner's progress and this session has been changing it.
    const exercises =
      existingRecord?.exercises && existingRecord.exercises.length > 0
        ? existingRecord.exercises
        : buildSession({
            mode,
            entries,
            seed: sessionId,
            progressByEntry,
            ...(pool ? { pool } : {}),
            ...(targetExerciseCount === undefined ? {} : { targetExerciseCount }),
            ...(newWordEntryCount === undefined ? {} : { newWordEntryCount }),
            ...(allowedTypes ? { allowedTypes } : {}),
            ...(strictAnswerChecking === undefined ? {} : { strictAnswerChecking }),
          }).exercises;

    // Replay what this session already answered. Exercises are answered in order, so the
    // first exercise with no history row is where the learner left off.
    const rowByExerciseId = new Map(history.map((row) => [row.id, row]));

    const answered: AnsweredExercise[] = [];
    for (const exercise of exercises) {
      const row = rowByExerciseId.get(`${sessionId}:${exercise.id}`);
      if (!row) break;
      answered.push({
        exerciseId: exercise.id,
        entryId: exercise.entryId,
        // Only `correct` is read back; the learner's own text is not worth persisting.
        result: { correct: row.correct, issues: [], submittedAnswer: '', expectedAnswer: '' },
        attempts: row.firstAttempt ? 1 : 2,
        revealed: row.revealed,
        hintUsed: row.hintUsed,
        responseMs: row.responseMs,
        xpAwarded: row.xpAwarded,
      });
    }

    const startedAt = existingRecord?.startedAt ?? new Date().toISOString();
    // A continuous session has no planned end: running out of exercises means the next one
    // has not been chosen yet, not that the session is over (§ continuous mode).
    const finished =
      mode !== 'continuous' && (exercises.length === 0 || answered.length >= exercises.length);

    set({
      sessionId,
      mode,
      exercises,
      currentIndex: answered.length,
      answers: answered,
      status: finished ? 'completed' : 'active',
      startedAt,
      bonusXp: 0,
    });

    await db.sessions.put(summarize(sessionId, mode, exercises, answered, startedAt, finished));
  },

  recordAnswer: async (answer) => {
    const { sessionId, mode, exercises, answers, startedAt } = get();
    if (!sessionId) return;
    // A resumed session replays its stored answers, so an exercise can already be here.
    if (answers.some((existing) => existing.exerciseId === answer.exerciseId)) return;

    const exercise = exercises.find((e) => e.id === answer.exerciseId);
    const errorCategories = answer.result.issues.map((issue) => issue.category);
    const answeredAt = new Date();
    // Whether this entry was already mastered, so the bonus fires only on the transition.
    const wasMastered = (await loadProgress(answer.entryId))?.srs.status === 'mastered';

    // The SRS grades the attempt, recomputes difficulty, reschedules the entry and
    // re-evaluates mastery. It is the only writer of SRS state, so the grade recorded in
    // history always matches the grade the scheduler acted on (§20).
    let grade: Grade = 0;
    let mastered = false;
    let xpAwarded = 0;
    if (exercise) {
      const outcome = await recordReview({
        entryId: answer.entryId,
        exercise,
        correct: answer.result.correct,
        attempts: answer.attempts,
        revealed: answer.revealed,
        hintUsed: answer.hintUsed,
        responseMs: answer.responseMs,
        errorCategories,
        reviewedAt: answeredAt,
      });
      grade = outcome.grade;
      // Only award mastery XP on the transition, not on every later review.
      mastered = outcome.mastered && !wasMastered;
      xpAwarded = exerciseXp({
        exerciseType: exercise.type,
        correct: answer.result.correct,
        revealed: answer.revealed,
      });
    }

    const next = [...answers, { ...answer, xpAwarded }];
    set({ answers: next });

    await db.exerciseHistory.put({
      id: `${sessionId}:${answer.exerciseId}`,
      entryId: answer.entryId,
      sessionId,
      exerciseType: exercise?.type ?? 'unknown',
      ...(exercise?.variant ? { direction: exercise.variant } : {}),
      correct: answer.result.correct,
      firstAttempt: answer.attempts === 1,
      revealed: answer.revealed,
      hintUsed: answer.hintUsed,
      responseMs: answer.responseMs,
      grade,
      errorCategories,
      answeredAt: answeredAt.toISOString(),
      // XP is stored on the row rather than added to a running total, and the row id is
      // deterministic, so re-answering or reloading cannot inflate it (§23).
      xpAwarded,
    });

    // Mastering an entry is worth a one-off bonus, awarded by entry id so it cannot repeat.
    if (mastered) {
      await awardMasteryBonus(answer.entryId);
      set({ bonusXp: get().bonusXp + XP_MASTER_ENTRY });
    }

    await db.sessions.put(summarize(sessionId, mode, exercises, next, startedAt, false));
  },

  advance: async () => {
    const { exercises, currentIndex } = get();
    const nextIndex = currentIndex + 1;

    if (nextIndex >= exercises.length) {
      await get().finish();
      return;
    }

    set({ currentIndex: nextIndex });
  },

  serve: async (exercise) => {
    const { sessionId, mode, exercises, answers, startedAt } = get();
    if (!sessionId) return;

    const next = [...exercises, exercise];
    set({ exercises: next, currentIndex: next.length - 1, status: 'active' });
    await db.sessions.put(summarize(sessionId, mode, next, answers, startedAt, false));
  },

  dropCurrent: async () => {
    const { sessionId, mode, exercises, currentIndex, answers, startedAt } = get();
    if (!sessionId) return;

    const next = exercises.filter((_, index) => index !== currentIndex);
    // Past the end deliberately: there is no current exercise until the next one is served,
    // and the continuous page shows its "choosing your next word" line meanwhile.
    set({ exercises: next, currentIndex: next.length });
    await db.sessions.put(summarize(sessionId, mode, next, answers, startedAt, false));
  },

  finish: async () => {
    const { sessionId, mode, exercises, answers, startedAt, status } = get();
    if (status === 'completed') return;

    set({ currentIndex: exercises.length, status: 'completed' });
    if (!sessionId) return;

    await db.sessions.put(summarize(sessionId, mode, exercises, answers, startedAt, true));
    // Perfect-session and daily-goal bonuses, both keyed so they cannot repeat (§23).
    await awardSessionBonuses(sessionId);
    const settings = await db.settings.get('user-settings');
    await awardDailyGoalBonus(settings?.dailyGoal ?? 20);
    // Band and level completion, checked once per session rather than per answer.
    await awardCompletionBonuses();
  },

  reset: () => {
    set({
      sessionId: null,
      exercises: [],
      currentIndex: 0,
      answers: [],
      status: 'idle',
      bonusXp: 0,
    });
  },
}));

/** Reads a finished session back from local storage, for the results screen. */
export async function loadSessionRecord(
  sessionId: string,
): Promise<PracticeSessionRecord | undefined> {
  return db.sessions.get(sessionId);
}

export async function loadSessionHistory(sessionId: string) {
  return db.exerciseHistory.where('sessionId').equals(sessionId).toArray();
}
