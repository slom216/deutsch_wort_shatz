import { useEffect, type ReactNode } from 'react';

import { fullyNormalize } from '@/features/practice/evaluation/normalize';
import { useSpeechRecognition } from '@/features/speech/useSpeechRecognition';
import { useSpeechSynthesis } from '@/features/speech/useSpeechSynthesis';
import { useSettingsStore } from '@/features/settings/settingsStore';
import type { SpeakingExercise as SpeakingExerciseType } from '@/schemas/exerciseSchema';
import type { ExerciseComponentProps } from './exerciseProps';
import './exercises.css';

/**
 * Speaking (§15, §26).
 *
 * Rules enforced here:
 *   - the microphone is only requested after the learner presses "Start speaking";
 *   - the recognized transcript is shown;
 *   - retry is always available;
 *   - manual self-assessment is offered whenever recognition is unsupported, errored, or
 *     simply got it wrong — progression is never blocked;
 *   - no audio is recorded or stored, and the disclosure text says so.
 *
 * Recognition is compared leniently: browsers normalize casing and punctuation
 * unpredictably, so holding a spoken answer to strict orthography would be unfair.
 */
export function SpeakingExercise({
  exercise,
  onSubmit,
  locked,
  attempt,
}: ExerciseComponentProps<SpeakingExerciseType>): ReactNode {
  const speechRate = useSettingsStore((state) => state.settings.speechRate);
  const synthesis = useSpeechSynthesis(speechRate);
  const recognition = useSpeechRecognition();

  useEffect(() => {
    recognition.reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attempt, exercise.id]);

  const transcriptMatches =
    recognition.transcript.length > 0 &&
    fullyNormalize(recognition.transcript) === fullyNormalize(exercise.targetText);

  const finish = (correct: boolean, submitted: string): void => {
    if (locked) return;
    onSubmit({
      correct,
      issues: correct
        ? []
        : [
            {
              category: 'wrongMeaning',
              message: `Expected: "${exercise.targetText}".`,
            },
          ],
      submittedAnswer: submitted,
      expectedAnswer: exercise.targetText,
    });
  };

  return (
    <div className="exercise">
      <p className="exercise__prompt">{exercise.prompt}</p>
      <p className="exercise__question" lang="de">
        {exercise.targetText}
      </p>
      <p className="exercise__translation">{exercise.englishGloss}</p>

      <div className="speaking__controls">
        <button
          type="button"
          className="speaking__listen"
          onClick={() => synthesis.speak(exercise.targetText)}
          disabled={!synthesis.supported}
        >
          Hear it first
        </button>

        {recognition.supported ? (
          <button
            type="button"
            className="exercise__submit"
            onClick={recognition.start}
            disabled={locked || recognition.status === 'listening'}
          >
            {recognition.status === 'listening' ? 'Listening…' : 'Start speaking'}
          </button>
        ) : null}
      </div>

      <p className="speaking__disclosure">
        Speaking exercises use your browser&rsquo;s speech recognition feature. The app does not
        record or store your voice. Browser behavior may vary.
      </p>

      {recognition.transcript ? (
        <p className="speaking__transcript" role="status" aria-live="polite">
          Heard: <span lang="de">{recognition.transcript}</span>
          {transcriptMatches ? ' — that matches.' : ' — that does not match exactly.'}
        </p>
      ) : null}

      {recognition.error ? (
        <p className="exercise__fallback" role="alert">
          {recognition.error}
        </p>
      ) : null}

      {!recognition.supported ? (
        <p className="exercise__fallback" role="note">
          Speech recognition is not available in this browser. Say the phrase aloud, then mark
          yourself below.
        </p>
      ) : null}

      {!locked ? (
        <div className="speaking__self-assessment">
          {recognition.supported && recognition.status === 'done' ? (
            <button
              type="button"
              className="exercise__submit"
              onClick={() => finish(transcriptMatches, recognition.transcript)}
            >
              Use this result
            </button>
          ) : null}

          <p className="exercise__hint" id={`self-${exercise.id}`}>
            Or mark it yourself:
          </p>
          <div className="speaking__buttons" role="group" aria-labelledby={`self-${exercise.id}`}>
            <button
              type="button"
              className="speaking__judge speaking__judge--yes"
              onClick={() =>
                finish(true, recognition.transcript || 'Self-assessed: said correctly')
              }
            >
              I said it correctly
            </button>
            <button
              type="button"
              className="speaking__judge speaking__judge--no"
              onClick={() =>
                finish(false, recognition.transcript || 'Self-assessed: needs more practice')
              }
            >
              I need more practice
            </button>
          </div>

          {recognition.supported && recognition.status !== 'idle' ? (
            <button type="button" className="speaking__retry" onClick={recognition.reset}>
              Try again
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
