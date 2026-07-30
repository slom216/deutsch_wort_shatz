import { z } from 'zod';

/**
 * Learner progress and SRS state (§20, §24).
 *
 * Phase 0 defines the persisted shape and the tables that hold it; the scheduling
 * behaviour that drives these fields is built in Phase 2.
 */

export const srsStatusSchema = z.enum(['new', 'learning', 'review', 'relearning', 'mastered']);

/** Automatic grade — the learner is never asked to rate a word manually (§20). */
export const gradeSchema = z.union([z.literal(0), z.literal(1), z.literal(2), z.literal(3)]);

export const exercisePerformanceSchema = z.object({
  attempts: z.number().int().min(0),
  correct: z.number().int().min(0),
  firstAttemptCorrect: z.number().int().min(0),
  averageResponseMs: z.number().min(0),
});

export const srsStateSchema = z.object({
  entryId: z.string().min(1),
  status: srsStatusSchema,
  dueAt: z.string().datetime(),
  intervalDays: z.number().min(0),
  /** Constrained to 1.3–3.0 (§20). */
  easeFactor: z.number().min(1.3).max(3),
  /** Automatic difficulty estimate, 0–1 (§21). */
  difficulty: z.number().min(0).max(1),
  repetitions: z.number().int().min(0),
  lapses: z.number().int().min(0),
  consecutiveCorrect: z.number().int().min(0),
  lastReviewedAt: z.string().datetime().optional(),
  lastGrade: gradeSchema.optional(),
  exercisePerformance: z.record(z.string(), exercisePerformanceSchema),
});

export const entryProgressSchema = z.object({
  entryId: z.string().min(1),
  introducedAt: z.string().datetime(),
  srs: srsStateSchema,
  totalAttempts: z.number().int().min(0),
  totalCorrect: z.number().int().min(0),
  firstAttemptCorrect: z.number().int().min(0),
  hintsUsed: z.number().int().min(0),
  /** Counts per error category from §16, keyed by category name. */
  errorCounts: z.record(z.string(), z.number().int().min(0)),
});

export const exerciseHistorySchema = z.object({
  id: z.string().min(1),
  entryId: z.string().min(1),
  sessionId: z.string().min(1),
  exerciseType: z.string().min(1),
  direction: z.string().optional(),
  correct: z.boolean(),
  firstAttempt: z.boolean(),
  revealed: z.boolean(),
  hintUsed: z.boolean(),
  responseMs: z.number().min(0),
  grade: gradeSchema,
  errorCategories: z.array(z.string()),
  answeredAt: z.string().datetime(),
  xpAwarded: z.number().int().min(0),
});

export const achievementRecordSchema = z.object({
  id: z.string().min(1),
  unlockedAt: z.string().datetime(),
  /** Progress towards a not-yet-unlocked achievement, 0–1. */
  progress: z.number().min(0).max(1),
});

export type SrsStatus = z.infer<typeof srsStatusSchema>;
export type Grade = z.infer<typeof gradeSchema>;
export type ExercisePerformance = z.infer<typeof exercisePerformanceSchema>;
export type SrsState = z.infer<typeof srsStateSchema>;
export type EntryProgress = z.infer<typeof entryProgressSchema>;
export type ExerciseHistory = z.infer<typeof exerciseHistorySchema>;
export type AchievementRecord = z.infer<typeof achievementRecordSchema>;
