import { z } from 'zod';

import { exerciseTypeSchema } from './vocabularySchema';

/** Practice sessions (§19, §24). Populated by the session engine in Phase 1. */

export const sessionModeSchema = z.enum(['new', 'review', 'topic', 'free']);

export const sessionStatusSchema = z.enum(['active', 'completed', 'abandoned']);

export const practiceSessionRecordSchema = z.object({
  id: z.string().min(1),
  mode: sessionModeSchema,
  status: sessionStatusSchema,
  startedAt: z.string().datetime(),
  completedAt: z.string().datetime().optional(),
  entryIds: z.array(z.string()),
  exerciseTypes: z.array(exerciseTypeSchema),
  plannedExerciseCount: z.number().int().min(0),
  completedExerciseCount: z.number().int().min(0),
  correctCount: z.number().int().min(0),
  firstAttemptCorrectCount: z.number().int().min(0),
  xpEarned: z.number().int().min(0),
});

export type SessionMode = z.infer<typeof sessionModeSchema>;
export type SessionStatus = z.infer<typeof sessionStatusSchema>;
export type PracticeSessionRecord = z.infer<typeof practiceSessionRecordSchema>;
