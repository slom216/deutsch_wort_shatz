import type { ListeningExercise, SpeakingExercise } from '@/schemas/exerciseSchema';
import type { VocabularyEntry } from '@/schemas/vocabularySchema';
import { selectDistractors } from './distractors';
import {
  acceptedGerman,
  englishStrictness,
  firstExample,
  headword,
  isPhraseEntry,
  primaryEnglish,
  strictnessFor,
} from './entryHelpers';
import type { GeneratorContext } from './multipleChoice';

/**
 * Listening and speaking (§15, §26).
 *
 * Both formats degrade gracefully: the components provide a text fallback when the
 * browser has no speech synthesis, and a manual self-assessment when it has no speech
 * recognition. Generation itself never depends on browser capabilities, so a session
 * built on one device stays valid on another.
 */

export type ListeningVariant = 'chooseEnglish' | 'typeGerman' | 'identifyTargetWord';
export type SpeakingVariant = 'repeatWord' | 'repeatPhrase' | 'readSentence';

const OPTION_COUNT = 4;

export function generateListening(
  context: GeneratorContext,
  variant: ListeningVariant,
): ListeningExercise | null {
  const { entry, pool, random, id } = context;

  const base = {
    id,
    entryId: entry.id,
    type: 'listening' as const,
    variant,
  };

  switch (variant) {
    case 'chooseEnglish': {
      const correct = primaryEnglish(entry);
      if (!correct) return null;
      const distractors = selectDistractors({
        target: entry,
        pool,
        count: OPTION_COUNT - 1,
        random,
        valueOf: (candidate) => candidate.english[0] ?? null,
        exclude: entry.english,
      });
      if (distractors.length === 0) return null;

      const options = random.shuffle([correct, ...distractors]);
      return {
        ...base,
        isProduction: false,
        requiresTypedInput: false,
        prompt: 'Listen, then choose the English meaning.',
        strictness: englishStrictness(entry),
        spokenText: entry.german,
        mode: 'chooseEnglish',
        options,
        correctIndex: options.indexOf(correct),
        canonicalAnswer: headword(entry),
      };
    }

    case 'typeGerman': {
      const accepted = acceptedGerman(entry);
      if (accepted.length === 0) return null;
      return {
        ...base,
        isProduction: true,
        requiresTypedInput: true,
        prompt: 'Listen, then type what you hear in German.',
        strictness: strictnessFor(entry),
        spokenText: entry.german,
        mode: 'typeGerman',
        acceptedAnswers: accepted,
        canonicalAnswer: headword(entry),
      };
    }

    case 'identifyTargetWord': {
      // Plays a whole sentence and asks which target word occurred in it.
      const example = firstExample(entry);
      if (!example) return null;
      const correct = example.targetTokens[0];
      if (!correct) return null;
      const distractors = selectDistractors({
        target: entry,
        pool,
        count: OPTION_COUNT - 1,
        random,
        valueOf: (candidate) => candidate.german,
        exclude: [correct, entry.german],
      });
      if (distractors.length === 0) return null;

      const options = random.shuffle([correct, ...distractors]);
      return {
        ...base,
        isProduction: false,
        requiresTypedInput: false,
        prompt: 'Listen to the sentence, then choose the word you heard.',
        strictness: strictnessFor(entry),
        spokenText: example.german,
        mode: 'chooseEnglish',
        options,
        correctIndex: options.indexOf(correct),
        canonicalAnswer: correct,
      };
    }

    default:
      return null;
  }
}

export function generateSpeaking(
  context: GeneratorContext,
  variant: SpeakingVariant,
): SpeakingExercise | null {
  const { entry, id } = context;

  const base = {
    id,
    entryId: entry.id,
    type: 'speaking' as const,
    variant,
    isProduction: true,
    requiresTypedInput: false,
    strictness: strictnessFor(entry),
  };

  switch (variant) {
    case 'repeatWord': {
      if (isPhraseEntry(entry)) return null;
      return {
        ...base,
        prompt: 'Say this German word aloud.',
        targetText: headword(entry),
        englishGloss: primaryEnglish(entry),
      };
    }

    case 'repeatPhrase': {
      if (!isPhraseEntry(entry)) return null;
      return {
        ...base,
        prompt: 'Say this German phrase aloud.',
        targetText: entry.german,
        englishGloss: primaryEnglish(entry),
      };
    }

    case 'readSentence': {
      const example = firstExample(entry);
      if (!example) return null;
      return {
        ...base,
        prompt: 'Read this German sentence aloud.',
        targetText: example.german,
        englishGloss: example.english,
      };
    }

    default:
      return null;
  }
}

export function availableListeningVariants(entry: VocabularyEntry): ListeningVariant[] {
  const variants: ListeningVariant[] = ['chooseEnglish', 'typeGerman'];
  if (firstExample(entry)) variants.push('identifyTargetWord');
  return variants;
}

export function availableSpeakingVariants(entry: VocabularyEntry): SpeakingVariant[] {
  const variants: SpeakingVariant[] = [isPhraseEntry(entry) ? 'repeatPhrase' : 'repeatWord'];
  if (firstExample(entry)) variants.push('readSentence');
  return variants;
}
