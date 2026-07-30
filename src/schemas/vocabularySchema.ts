/**
 * Vocabulary schemas (DEVELOPMENT_INSTRUCTIONS §10, §11, §13).
 *
 * These Zod schemas are the single source of truth for the vocabulary data model:
 * the TypeScript types in the application are inferred from them, and the
 * `validate:vocabulary` script uses the very same schemas against `data/*.json`.
 *
 * Deviations from the literal type listing in §10, all driven by the shipped datasets:
 *   - `requiredCase` additionally allows `'dative+accusative'` (ditransitive verbs such
 *     as `geben`), which §10 does not enumerate.
 *   - `article` and `pluralArticle` are nullable; a small number of source nouns are
 *     genuinely article-less (proper nouns, festivals) or plural-less. These are
 *     surfaced by `audit:examples` as editorial-review items rather than hard errors.
 *   - Datasets carry provenance fields (`sourceMetadata`, `editorialReview`,
 *     `alternateForms`, `alternateArticles`, `numberUsage`) that §10 omits.
 */

// NOTE: relative imports with explicit `.ts` extensions are deliberate. They let the
// Node-based validation scripts import this module directly (via Node's native type
// stripping) so that scripts and application validate against identical schemas.
import { z } from 'zod';
import { CEFR_LEVELS } from '../content/vocabulary/frequencyBands.ts';
import { TOPICS } from '../content/vocabulary/topics.ts';

export const cefrLevelSchema = z.enum(CEFR_LEVELS);

export const vocabularyKindSchema = z.enum(['word', 'phrase']);

export const wordClassSchema = z.enum([
  'noun',
  'verb',
  'adjective',
  'adverb',
  'pronoun',
  'preposition',
  'conjunction',
  'article',
  'particle',
  'numeral',
  'interjection',
  'phrase',
  'other',
]);

export const topicSchema = z.enum(TOPICS);

export const grammaticalCaseSchema = z.enum(['nominative', 'accusative', 'dative', 'genitive']);

export const exampleSentenceSchema = z.object({
  id: z.string().min(1),
  german: z.string().min(1),
  english: z.string().min(1),
  level: cefrLevelSchema,
  targetTokens: z.array(z.string().min(1)).min(1),
});

export const exerciseTypeSchema = z.enum([
  'multipleChoice',
  'typedTranslation',
  'sentenceCompletion',
  'matching',
  'wordOrdering',
  'listening',
  'speaking',
]);

export const exerciseDirectionSchema = z.enum(['germanToEnglish', 'englishToGerman']);

export const strictnessSchema = z.object({
  capitalization: z.boolean(),
  umlauts: z.boolean(),
  eszett: z.boolean(),
  article: z.boolean(),
  plural: z.boolean(),
  punctuation: z.boolean(),
  wordOrder: z.boolean(),
});

export const requiredRecallSchema = z.object({
  article: z.boolean(),
  plural: z.boolean(),
  thirdPersonPresent: z.boolean(),
  simplePast: z.boolean(),
  pastParticiple: z.boolean(),
  auxiliary: z.boolean(),
});

export const acceptedAnswersSchema = z.object({
  german: z.array(z.string()).min(1),
  english: z.array(z.string()).min(1),
  plural: z.array(z.string()).optional(),
  thirdPersonPresent: z.array(z.string()).optional(),
  simplePast: z.array(z.string()).optional(),
  pastParticiple: z.array(z.string()).optional(),
});

export const exerciseConfigSchema = z.object({
  enabledTypes: z.array(exerciseTypeSchema).min(1),
  directions: z.array(exerciseDirectionSchema).min(1),
  strictness: strictnessSchema,
  requiredRecall: requiredRecallSchema,
  acceptedAnswers: acceptedAnswersSchema,
});

const sourceMetadataSchema = z
  .object({
    selectionCategory: z.string().optional(),
    topicReference: z.string().nullable().optional(),
    pageReference: z.number().nullable().optional(),
    generationPattern: z.string().nullable().optional(),
    officialGoetheB1ReferenceMatch: z.boolean().optional(),
  })
  .optional();

const editorialReviewSchema = z
  .object({
    required: z.boolean().optional(),
    status: z.string().optional(),
    checks: z.array(z.string()).optional(),
    fields: z.array(z.string()).optional(),
  })
  .optional();

/** Fields every entry must carry (§11). */
const baseShape = {
  // §12 specifies a four-digit rank, which cannot express rank 10,000; the final entry
  // uses five digits. Zero-padding to a minimum of four is the enforceable rule.
  id: z
    .string()
    .regex(/^(a1|a2|b1)-\d{4,5}-[a-z0-9-]+$/, 'ID must follow `<level>-<rank>-<lemma>` (§12)'),
  rank: z.number().int().min(1).max(10_000),
  level: cefrLevelSchema,
  kind: vocabularyKindSchema,
  german: z.string().min(1),
  english: z.array(z.string().min(1)).min(1),
  wordClass: wordClassSchema,
  primaryTopic: topicSchema,
  secondaryTopics: z.array(topicSchema),
  frequencyBand: z.string().min(1),
  difficultyWeight: z.number().min(0).max(1),
  searchableForms: z.array(z.string().min(1)).min(1),
  tags: z.array(z.string()),
  exampleSentences: z.array(exampleSentenceSchema).min(1),
  exerciseConfig: exerciseConfigSchema,
  /** Raw dataset topic labels before normalization onto the controlled registry. */
  sourceTopics: z.array(z.string()).optional(),
  sourceMetadata: sourceMetadataSchema,
  editorialReview: editorialReviewSchema,
  notes: z.array(z.string()).optional(),
  alternateForms: z.array(z.string()).optional(),
};

export const nounEntrySchema = z.object({
  ...baseShape,
  wordClass: z.literal('noun'),
  article: z.enum(['der', 'die', 'das']).nullable(),
  alternateArticles: z.array(z.enum(['der', 'die', 'das'])).optional(),
  plural: z.string().nullable(),
  pluralArticle: z.literal('die').nullable(),
  numberUsage: z.enum(['both', 'singularOnly', 'pluralOnly', 'unspecified']).optional(),
  genitiveSingular: z.string().nullable().optional(),
});

export const verbEntrySchema = z.object({
  ...baseShape,
  wordClass: z.literal('verb'),
  infinitive: z.string().min(1),
  thirdPersonPresent: z.string().min(1),
  simplePast: z.string().min(1),
  pastParticiple: z.string().min(1),
  auxiliary: z.enum(['haben', 'sein', 'haben/sein']),
  separable: z.boolean(),
  reflexive: z.boolean(),
  reflexiveCase: grammaticalCaseSchema.nullable().optional(),
  // `dative+accusative` covers ditransitive verbs and is not listed in §10.
  requiredCase: z
    .union([grammaticalCaseSchema, z.literal('dative+accusative')])
    .nullable()
    .optional(),
  fixedPrepositions: z.array(
    z.object({
      preposition: z.string().min(1),
      case: grammaticalCaseSchema,
      meaning: z.string().optional(),
    }),
  ),
});

export const phraseEntrySchema = z.object({
  ...baseShape,
  wordClass: z.literal('phrase'),
  register: z.enum(['neutral', 'formal', 'informal']),
  phraseType: z.enum(['functional', 'idiomatic', 'collocation', 'question', 'response', 'other']),
});

/** Any entry that is not a noun, verb or phrase (adjectives, adverbs, pronouns, …). */
export const genericWordEntrySchema = z.object({
  ...baseShape,
  wordClass: z.enum([
    'adjective',
    'adverb',
    'pronoun',
    'preposition',
    'conjunction',
    'article',
    'particle',
    'numeral',
    'interjection',
    'other',
  ]),
  register: z.enum(['neutral', 'formal', 'informal']).optional(),
  phraseType: z
    .enum(['functional', 'idiomatic', 'collocation', 'question', 'response', 'other'])
    .optional(),
});

export const vocabularyEntrySchema = z.discriminatedUnion('wordClass', [
  nounEntrySchema,
  verbEntrySchema,
  phraseEntrySchema,
  genericWordEntrySchema,
]);

export type CefrLevelValue = z.infer<typeof cefrLevelSchema>;
export type WordClass = z.infer<typeof wordClassSchema>;
export type VocabularyKind = z.infer<typeof vocabularyKindSchema>;
export type ExampleSentence = z.infer<typeof exampleSentenceSchema>;
export type ExerciseType = z.infer<typeof exerciseTypeSchema>;
export type ExerciseDirection = z.infer<typeof exerciseDirectionSchema>;
export type ExerciseConfig = z.infer<typeof exerciseConfigSchema>;
export type NounEntry = z.infer<typeof nounEntrySchema>;
export type VerbEntry = z.infer<typeof verbEntrySchema>;
export type PhraseEntry = z.infer<typeof phraseEntrySchema>;
export type GenericWordEntry = z.infer<typeof genericWordEntrySchema>;
export type VocabularyEntry = z.infer<typeof vocabularyEntrySchema>;

/** Compact record used by the browser/search index; avoids loading full band bundles. */
export const vocabularyIndexRecordSchema = z.object({
  id: z.string(),
  rank: z.number().int(),
  level: cefrLevelSchema,
  german: z.string(),
  english: z.array(z.string()),
  wordClass: wordClassSchema,
  primaryTopic: topicSchema,
  frequencyBand: z.string(),
  difficultyWeight: z.number(),
  searchableForms: z.array(z.string()),
});

export type VocabularyIndexRecord = z.infer<typeof vocabularyIndexRecordSchema>;

export function isNounEntry(entry: VocabularyEntry): entry is NounEntry {
  return entry.wordClass === 'noun';
}

export function isVerbEntry(entry: VocabularyEntry): entry is VerbEntry {
  return entry.wordClass === 'verb';
}

export function isPhraseEntry(entry: VocabularyEntry): entry is PhraseEntry {
  return entry.wordClass === 'phrase';
}
