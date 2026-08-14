import { z } from 'zod';

import { exerciseSchema } from './exerciseSchema';
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
  /**
   * The exercises as generated, so a reload resumes the session it started rather than a
   * lookalike.
   *
   * Regenerating from the session id is deterministic only while its inputs are — and one
   * of them is the learner's stored progress, which the session itself is busy changing.
   * Answer two exercises, reload, and difficulty adaptation quietly builds a different
   * list. Optional because sessions recorded before this field existed have none.
   */
  exercises: z.array(exerciseSchema).optional(),
});

export type SessionMode = z.infer<typeof sessionModeSchema>;
export type SessionStatus = z.infer<typeof sessionStatusSchema>;
export type PracticeSessionRecord = z.infer<typeof practiceSessionRecordSchema>;
