import { z } from 'zod';

/** Settings persisted locally (§24). Validated on read so corrupt data cannot crash boot. */

export const dailyGoalSchema = z.union([
  z.literal(10),
  z.literal(20),
  z.literal(30),
  z.literal(50),
]);

export const batchSizeSchema = z.union([z.literal(5), z.literal(10), z.literal(15), z.literal(20)]);

export const settingsSchema = z.object({
  /** Fixed key — a single settings row (§24). */
  id: z.literal('user-settings'),
  schemaVersion: z.number().int().min(1),
  /** Exercises per day that count towards the daily goal (§23). Default 20. */
  dailyGoal: dailyGoalSchema,
  /** New entries introduced per learning batch (§18). Default 5. */
  newWordBatchSize: batchSizeSchema,
  /** Strict German answer checking is the default and cannot be silently relaxed (§16). */
  strictAnswerChecking: z.boolean(),
  listeningEnabled: z.boolean(),
  speakingEnabled: z.boolean(),
  /** Speech-synthesis rate for `de-DE` playback (§26). */
  speechRate: z.number().min(0.5).max(2),
  /** Streak freezes held; each bridges one missed day (§23 deliverable 5). */
  streakFreezes: z.number().int().min(0).max(3),
  reducedMotion: z.boolean(),
  updatedAt: z.string().datetime(),
});

export type Settings = z.infer<typeof settingsSchema>;
export type DailyGoal = z.infer<typeof dailyGoalSchema>;
export type BatchSize = z.infer<typeof batchSizeSchema>;

export const SETTINGS_KEY = 'user-settings';

export const DEFAULT_SETTINGS: Settings = {
  id: SETTINGS_KEY,
  schemaVersion: 1,
  dailyGoal: 20,
  newWordBatchSize: 5,
  strictAnswerChecking: true,
  listeningEnabled: true,
  speakingEnabled: true,
  speechRate: 1,
  streakFreezes: 2,
  reducedMotion: false,
  updatedAt: new Date(0).toISOString(),
};
