import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';

import type { EvaluationResult, Exercise } from '@/schemas/exerciseSchema';
import { ExerciseFeedback } from './ExerciseFeedback';
import { ListeningExercise } from './ListeningExercise';
import { MatchingExercise } from './MatchingExercise';
import { MultipleChoiceExercise } from './MultipleChoiceExercise';
import { SentenceCompletionExercise } from './SentenceCompletionExercise';
import { SpeakingExercise } from './SpeakingExercise';
import { TypedTranslationExercise } from './TypedTranslationExercise';
import { WordOrderingExercise } from './WordOrderingExercise';
import type { ExerciseComponentProps } from './exerciseProps';
import './exercises.css';

/**
 * Exercise runner.
 *
 * Owns the attempt lifecycle that the automatic grading in §20 depends on:
 * a first wrong answer offers one retry, a second wrong answer locks the exercise, and
 * the learner may reveal the answer at any point (which scores zero, §23).
 */

export interface ExerciseOutcome {
  readonly exercise: Exercise;
  readonly result: EvaluationResult;
  readonly attempts: number;
  readonly revealed: boolean;
  readonly responseMs: number;
}

interface ExerciseRunnerProps {
  readonly exercise: Exercise;
  readonly onComplete: (outcome: ExerciseOutcome) => void;
  readonly progressLabel?: string;
}

const MAX_ATTEMPTS = 2;

function renderExercise(props: ExerciseComponentProps): ReactNode {
  const { exercise } = props;
  switch (exercise.type) {
    case 'multipleChoice':
      return <MultipleChoiceExercise {...props} exercise={exercise} />;
    case 'typedTranslation':
      return <TypedTranslationExercise {...props} exercise={exercise} />;
    case 'sentenceCompletion':
      return <SentenceCompletionExercise {...props} exercise={exercise} />;
    case 'matching':
      return <MatchingExercise {...props} exercise={exercise} />;
    case 'wordOrdering':
      return <WordOrderingExercise {...props} exercise={exercise} />;
    case 'listening':
      return <ListeningExercise {...props} exercise={exercise} />;
    case 'speaking':
      return <SpeakingExercise {...props} exercise={exercise} />;
    default:
      return null;
  }
}

/** The full corrected sentence, shown after a sentence-completion answer (§15). */
function correctionFor(exercise: Exercise): string | undefined {
  return exercise.type === 'sentenceCompletion' ? exercise.fullSentence : undefined;
}

export function ExerciseRunner({
  exercise,
  onComplete,
  progressLabel,
}: ExerciseRunnerProps): ReactNode {
  const [attempt, setAttempt] = useState(1);
  const [result, setResult] = useState<EvaluationResult | null>(null);
  const [locked, setLocked] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const startedAt = useRef(Date.now());

  useEffect(() => {
    setAttempt(1);
    setResult(null);
    setLocked(false);
    setRevealed(false);
    startedAt.current = Date.now();
  }, [exercise.id]);

  const handleSubmit = useCallback(
    (submitted: EvaluationResult) => {
      setResult(submitted);
      // Correct, out of attempts, or already revealed: this exercise is finished.
      if (submitted.correct || attempt >= MAX_ATTEMPTS || revealed) {
        setLocked(true);
      }
    },
    [attempt, revealed],
  );

  const retry = (): void => {
    setAttempt((current) => current + 1);
    setResult(null);
  };

  const reveal = (): void => {
    setRevealed(true);
    setLocked(true);
    setResult({
      correct: false,
      issues: [],
      submittedAnswer: '',
      expectedAnswer: expectedAnswerOf(exercise),
    });
  };

  const advance = (): void => {
    if (!result) return;
    onComplete({
      exercise,
      result: revealed ? { ...result, correct: false } : result,
      attempts: attempt,
      revealed,
      responseMs: Date.now() - startedAt.current,
    });
  };

  const canRetry = result !== null && !result.correct && !revealed && attempt < MAX_ATTEMPTS;

  return (
    <section className="runner" aria-label="Exercise">
      {progressLabel ? <p className="runner__progress">{progressLabel}</p> : null}

      {renderExercise({
        exercise,
        onSubmit: handleSubmit,
        locked,
        attempt,
        revealed,
      })}

      {result ? (
        <ExerciseFeedback
          result={result}
          correction={locked ? correctionFor(exercise) : undefined}
          revealed={revealed}
        />
      ) : null}

      <div className="runner__actions">
        {canRetry ? (
          <button type="button" className="runner__retry" onClick={retry}>
            Try again
          </button>
        ) : null}

        {!locked && !revealed ? (
          <button type="button" className="runner__reveal" onClick={reveal}>
            Show answer
          </button>
        ) : null}

        {locked ? (
          <button type="button" className="runner__next" onClick={advance}>
            Continue
          </button>
        ) : null}
      </div>
    </section>
  );
}

function expectedAnswerOf(exercise: Exercise): string {
  switch (exercise.type) {
    case 'multipleChoice':
      return exercise.options[exercise.correctIndex] ?? '';
    case 'matching':
      return exercise.pairs.map((pair) => `${pair.left} → ${pair.right}`).join('; ');
    case 'speaking':
      return exercise.targetText;
    case 'sentenceCompletion':
      return exercise.canonicalAnswer;
    default:
      return 'canonicalAnswer' in exercise ? exercise.canonicalAnswer : '';
  }
}
