import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';

import { MultipleChoiceExercise } from '@/components/exercises/MultipleChoiceExercise';
import { generateMultipleChoice } from '@/features/practice/generators/multipleChoice';
import { createRandom } from '@/features/practice/random';
import { loadBand } from '@/content/vocabulary/registry';
import type { VocabularyEntry } from '@/schemas/vocabularySchema';

describe('example sentence reaches the rendered card', () => {
  it('shows the shipped German sentence on a German→English question', async () => {
    const band = (await loadBand('A1 Core 1')) as VocabularyEntry[];
    const entry = band.find((e) => e.exampleSentences.length > 0 && e.english.length > 0);
    if (!entry) throw new Error('no shipped entry has an example sentence');

    const exercise = generateMultipleChoice(
      { entry, pool: band, random: createRandom('render-check'), id: 'x' },
      'germanToEnglish',
    );
    if (!exercise) throw new Error('could not build the exercise');

    render(
      <MultipleChoiceExercise
        exercise={exercise}
        locked={false}
        revealed={false}
        onSubmit={() => {}}
      />,
    );

    const sentence = entry.exampleSentences[0]!.german;
    expect(screen.getByText(sentence)).toBeInTheDocument();
    // …and never its translation, which is the answer.
    expect(screen.queryByText(entry.exampleSentences[0]!.english)).toBeNull();
  });
});
