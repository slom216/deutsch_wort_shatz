import { create } from 'zustand';

import { db } from '@/features/persistence/db';
import type { Exercise, EvaluationResult } from '@/schemas/exerciseSchema';
import type { Grade } from '@/schemas/progressSchema';
import { loadAllProgress, loadProgress, recordReview } from '@/features/srs/repository';
import {
  awardMasteryBonus,
  awardSessionBonuses,
  awardDailyGoalBonus,
} from '@/features/gamification/repository';
import { exerciseXp } from '@/features/gamification/xp';
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
 * and reschedules the entry (§20, §21). XP arrives with gamification in Phase 7, so
 * `xpAwarded` is recorded as 0 for now and the history rows already have the right shape.
 */

export interface AnsweredExercise {
  readonly exerciseId: string;
  readonly entryId: string;
  readonly result: EvaluationResult;
  readonly attempts: number;
  readonly revealed: boolean;
  readonly responseMs: number;
}

interface SessionState {
  readonly sessionId: string | null;
  readonly mode: SessionMode;
  readonly exercises: readonly Exercise[];
  readonly currentIndex: number;
  readonly answers: readonly AnsweredExercise[];
  readonly status: 'idle' | 'active' | 'completed';

  readonly start: (options: {
    sessionId: string;
    mode: SessionMode;
    entries: readonly VocabularyEntry[];
    pool?: readonly VocabularyEntry[];
    targetExerciseCount?: number;
    allowedTypes?: readonly Exercise['type'][];
  }) => Promise<void>;
  readonly recordAnswer: (answer: AnsweredExercise) => Promise<void>;
  readonly advance: () => Promise<void>;
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
    xpEarned: 0,
  };
}

let startedAt = new Date().toISOString();

export const useSessionStore = create<SessionState>((set, get) => ({
  sessionId: null,
  mode: 'review',
  exercises: [],
  currentIndex: 0,
  answers: [],
  status: 'idle',

  start: async ({ sessionId, mode, entries, pool, targetExerciseCount, allowedTypes }) => {
    // Stored progress drives exercise adaptation (§21): the builder uses each entry's
    // automatic difficulty to decide which formats it gets.
    const stored = await loadAllProgress();
    const progressByEntry = new Map(stored.map((record) => [record.entryId, record]));

    const built = buildSession({
      mode,
      entries,
      seed: sessionId,
      progressByEntry,
      ...(pool ? { pool } : {}),
      ...(targetExerciseCount === undefined ? {} : { targetExerciseCount }),
      ...(allowedTypes ? { allowedTypes } : {}),
    });

    startedAt = new Date().toISOString();
    set({
      sessionId,
      mode,
      exercises: built.exercises,
      currentIndex: 0,
      answers: [],
      status: built.exercises.length > 0 ? 'active' : 'completed',
    });

    await db.sessions.put(summarize(sessionId, mode, built.exercises, [], startedAt, false));
  },

  recordAnswer: async (answer) => {
    const { sessionId, mode, exercises, answers } = get();
    if (!sessionId) return;

    const next = [...answers, answer];
    set({ answers: next });

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
        hintUsed: false,
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
        attempts: answer.attempts,
        revealed: answer.revealed,
      });
    }

    await db.exerciseHistory.put({
      id: `${sessionId}:${answer.exerciseId}`,
      entryId: answer.entryId,
      sessionId,
      exerciseType: exercise?.type ?? 'unknown',
      ...(exercise?.variant ? { direction: exercise.variant } : {}),
      correct: answer.result.correct,
      firstAttempt: answer.attempts === 1,
      revealed: answer.revealed,
      hintUsed: false,
      responseMs: answer.responseMs,
      grade,
      errorCategories,
      answeredAt: answeredAt.toISOString(),
      // XP is stored on the row rather than added to a running total, and the row id is
      // deterministic, so re-answering or reloading cannot inflate it (§23).
      xpAwarded,
    });

    // Mastering an entry is worth a one-off bonus, awarded by entry id so it cannot repeat.
    if (mastered) await awardMasteryBonus(answer.entryId);

    await db.sessions.put(summarize(sessionId, mode, exercises, next, startedAt, false));
  },

  advance: async () => {
    const { sessionId, mode, exercises, answers, currentIndex } = get();
    const nextIndex = currentIndex + 1;

    if (nextIndex >= exercises.length) {
      set({ currentIndex: exercises.length, status: 'completed' });
      if (sessionId) {
        await db.sessions.put(summarize(sessionId, mode, exercises, answers, startedAt, true));
        // Perfect-session and daily-goal bonuses, both keyed so they cannot repeat (§23).
        await awardSessionBonuses(sessionId);
        const settings = await db.settings.get('user-settings');
        await awardDailyGoalBonus(settings?.dailyGoal ?? 20);
      }
      return;
    }

    set({ currentIndex: nextIndex });
  },

  reset: () => {
    set({
      sessionId: null,
      exercises: [],
      currentIndex: 0,
      answers: [],
      status: 'idle',
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
