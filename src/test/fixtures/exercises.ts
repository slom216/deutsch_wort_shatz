import type {
  ListeningExercise,
  MatchingExercise,
  MultipleChoiceExercise,
  SentenceCompletionExercise,
  SpeakingExercise,
  Strictness,
  TypedTranslationExercise,
  WordOrderingExercise,
} from '@/schemas/exerciseSchema';

/** Hand-built exercises for component tests, so tests do not depend on generator output. */

export const STRICT: Strictness = {
  capitalization: true,
  umlauts: true,
  eszett: true,
  article: true,
  plural: true,
  punctuation: true,
  wordOrder: true,
};

const base = {
  entryId: 'a1-0006-der-tag',
  isProduction: false,
  requiresTypedInput: false,
  strictness: STRICT,
};

export const multipleChoice: MultipleChoiceExercise = {
  ...base,
  id: 'mc-1',
  type: 'multipleChoice',
  variant: 'germanToEnglish',
  prompt: 'What does this mean in English?',
  question: 'der Tag',
  options: ['day', 'night', 'year', 'week', 'hour', 'month'],
  correctIndex: 0,
};

export const typedTranslation: TypedTranslationExercise = {
  ...base,
  id: 'tt-1',
  type: 'typedTranslation',
  variant: 'nounWithArticle',
  isProduction: true,
  requiresTypedInput: true,
  prompt: 'Type the German noun with its article.',
  question: 'street',
  answerLanguage: 'de',
  acceptedAnswers: ['die Straße'],
  canonicalAnswer: 'die Straße',
};

export const sentenceCompletion: SentenceCompletionExercise = {
  ...base,
  id: 'sc-1',
  type: 'sentenceCompletion',
  variant: 'vocabularyGap',
  isProduction: true,
  requiresTypedInput: true,
  prompt: 'Fill in the missing word.',
  sentenceBefore: 'Der ',
  sentenceAfter: ' ist lang.',
  fullSentence: 'Der Tag ist lang.',
  englishSentence: 'The day is long.',
  answerLanguage: 'de',
  acceptedAnswers: ['Tag'],
  canonicalAnswer: 'Tag',
};

export const matching: MatchingExercise = {
  ...base,
  id: 'ma-1',
  type: 'matching',
  variant: 'germanToEnglish',
  prompt: 'Match each German word to its English meaning.',
  pairs: [
    { id: 'p1', left: 'der Tag', right: 'day' },
    { id: 'p2', left: 'die Nacht', right: 'night' },
    { id: 'p3', left: 'das Jahr', right: 'year' },
    { id: 'p4', left: 'die Woche', right: 'week' },
    { id: 'p5', left: 'der Monat', right: 'month' },
  ],
  shuffledRight: ['week', 'day', 'month', 'night', 'year'],
};

export const wordOrdering: WordOrderingExercise = {
  ...base,
  id: 'wo-1',
  type: 'wordOrdering',
  variant: 'sentenceReconstruction',
  isProduction: true,
  prompt: 'Put the words in the correct order.',
  tokens: ['ist', 'Der', 'lang.', 'Tag'],
  acceptedOrders: [['Der', 'Tag', 'ist', 'lang.']],
  canonicalAnswer: 'Der Tag ist lang.',
};

export const listeningChoice: ListeningExercise = {
  ...base,
  id: 'li-1',
  type: 'listening',
  variant: 'chooseEnglish',
  prompt: 'Listen, then choose the English meaning.',
  spokenText: 'der Tag',
  mode: 'chooseEnglish',
  options: ['day', 'night', 'year', 'week', 'hour', 'month'],
  correctIndex: 0,
  canonicalAnswer: 'der Tag',
};

export const listeningTyped: ListeningExercise = {
  ...base,
  id: 'li-2',
  type: 'listening',
  variant: 'typeGerman',
  isProduction: true,
  requiresTypedInput: true,
  prompt: 'Listen, then type what you hear in German.',
  spokenText: 'die Straße',
  mode: 'typeGerman',
  acceptedAnswers: ['die Straße'],
  canonicalAnswer: 'die Straße',
};

export const speaking: SpeakingExercise = {
  ...base,
  id: 'sp-1',
  type: 'speaking',
  variant: 'repeatPhrase',
  isProduction: true,
  prompt: 'Say this German phrase aloud.',
  targetText: 'Wie geht es Ihnen?',
  englishGloss: 'How are you?',
};
