import { z } from 'zod';

import { strictnessSchema } from './vocabularySchema';

/**
 * Exercise runtime shapes (§15, §16).
 *
 * Every generated exercise is a member of a discriminated union keyed on `type`, so a
 * component receives exactly the payload its format needs and TypeScript rules out the
 * rest. Generators produce these; the runner and evaluation engine consume them.
 */

/** Error categories the feedback engine must be able to report (§16). */
export const errorCategorySchema = z.enum([
  'wrongMeaning',
  'missingArticle',
  'wrongArticle',
  'wrongCapitalization',
  'wrongPlural',
  'wrongConjugation',
  'missingUmlaut',
  'ssInsteadOfEszett',
  'punctuationError',
  'wordOrderError',
  'missingToken',
  'extraToken',
]);

/** Which language the learner must produce. Drives strict checking and the character helper. */
export const answerLanguageSchema = z.enum(['de', 'en']);

const exerciseBaseShape = {
  id: z.string().min(1),
  entryId: z.string().min(1),
  variant: z.string().min(1),
  /** True when the learner must produce the target language (§19: at least 40%). */
  isProduction: z.boolean(),
  /** True when the learner types a free-text answer (§19: at least 25%). */
  requiresTypedInput: z.boolean(),
  /** Learner-facing instruction, in English (§1). */
  prompt: z.string().min(1),
  /** Extra context shown under the prompt, e.g. the English gloss of a target word. */
  hint: z.string().optional(),
  strictness: strictnessSchema,
};

export const multipleChoiceExerciseSchema = z.object({
  ...exerciseBaseShape,
  type: z.literal('multipleChoice'),
  question: z.string().min(1),
  options: z.array(z.string().min(1)).min(2),
  correctIndex: z.number().int().min(0),
});

export const typedTranslationExerciseSchema = z.object({
  ...exerciseBaseShape,
  type: z.literal('typedTranslation'),
  question: z.string().min(1),
  answerLanguage: answerLanguageSchema,
  acceptedAnswers: z.array(z.string().min(1)).min(1),
  /** Shown after submission as the canonical answer. */
  canonicalAnswer: z.string().min(1),
});

export const sentenceCompletionExerciseSchema = z.object({
  ...exerciseBaseShape,
  type: z.literal('sentenceCompletion'),
  /** Sentence text before and after the gap; the gap is always a single blank. */
  sentenceBefore: z.string(),
  sentenceAfter: z.string(),
  /** The complete corrected sentence, shown after submission (§15). */
  fullSentence: z.string().min(1),
  englishSentence: z.string().min(1),
  answerLanguage: answerLanguageSchema,
  acceptedAnswers: z.array(z.string().min(1)).min(1),
  canonicalAnswer: z.string().min(1),
});

export const matchingPairSchema = z.object({
  id: z.string().min(1),
  left: z.string().min(1),
  right: z.string().min(1),
});

export const matchingExerciseSchema = z.object({
  ...exerciseBaseShape,
  type: z.literal('matching'),
  /** 5–8 pairs (§15). */
  pairs: z.array(matchingPairSchema).min(5).max(8),
  /** Right-hand values in presentation order, shuffled away from the pair order. */
  shuffledRight: z.array(z.string().min(1)).min(5).max(8),
});

export const wordOrderingExerciseSchema = z.object({
  ...exerciseBaseShape,
  type: z.literal('wordOrdering'),
  /** 4–12 tokens (§15), shuffled for presentation. */
  tokens: z.array(z.string().min(1)).min(4).max(12),
  /** Every accepted word order, as token arrays (§15: all valid orders accepted). */
  acceptedOrders: z.array(z.array(z.string().min(1))).min(1),
  canonicalAnswer: z.string().min(1),
});

export const listeningExerciseSchema = z.object({
  ...exerciseBaseShape,
  type: z.literal('listening'),
  /** German text passed to speech synthesis; never shown before answering in standard mode. */
  spokenText: z.string().min(1),
  mode: z.enum(['chooseEnglish', 'typeGerman']),
  options: z.array(z.string().min(1)).optional(),
  correctIndex: z.number().int().min(0).optional(),
  acceptedAnswers: z.array(z.string().min(1)).optional(),
  canonicalAnswer: z.string().min(1),
});

export const speakingExerciseSchema = z.object({
  ...exerciseBaseShape,
  type: z.literal('speaking'),
  /** What the learner is asked to say. */
  targetText: z.string().min(1),
  englishGloss: z.string().min(1),
});

export const exerciseSchema = z.discriminatedUnion('type', [
  multipleChoiceExerciseSchema,
  typedTranslationExerciseSchema,
  sentenceCompletionExerciseSchema,
  matchingExerciseSchema,
  wordOrderingExerciseSchema,
  listeningExerciseSchema,
  speakingExerciseSchema,
]);

export const evaluationIssueSchema = z.object({
  category: errorCategorySchema,
  /** Learner-facing explanation, in English. */
  message: z.string().min(1),
});

export const evaluationResultSchema = z.object({
  correct: z.boolean(),
  /** Ordered, learner-facing explanations of what went wrong. Empty when correct. */
  issues: z.array(evaluationIssueSchema),
  /** The answer the learner gave, trimmed but never case-folded (§16). */
  submittedAnswer: z.string(),
  /** The accepted answer closest to what the learner wrote. */
  expectedAnswer: z.string(),
});

export type ErrorCategory = z.infer<typeof errorCategorySchema>;
export type AnswerLanguage = z.infer<typeof answerLanguageSchema>;
export type MultipleChoiceExercise = z.infer<typeof multipleChoiceExerciseSchema>;
export type TypedTranslationExercise = z.infer<typeof typedTranslationExerciseSchema>;
export type SentenceCompletionExercise = z.infer<typeof sentenceCompletionExerciseSchema>;
export type MatchingPair = z.infer<typeof matchingPairSchema>;
export type MatchingExercise = z.infer<typeof matchingExerciseSchema>;
export type WordOrderingExercise = z.infer<typeof wordOrderingExerciseSchema>;
export type ListeningExercise = z.infer<typeof listeningExerciseSchema>;
export type SpeakingExercise = z.infer<typeof speakingExerciseSchema>;
export type Exercise = z.infer<typeof exerciseSchema>;
export type EvaluationIssue = z.infer<typeof evaluationIssueSchema>;
export type EvaluationResult = z.infer<typeof evaluationResultSchema>;

export type Strictness = z.infer<typeof strictnessSchema>;
