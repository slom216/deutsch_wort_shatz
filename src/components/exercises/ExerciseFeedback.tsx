import type { ReactNode } from 'react';

import type { EvaluationResult } from '@/schemas/exerciseSchema';
import './ExerciseFeedback.css';

interface ExerciseFeedbackProps {
  readonly result: EvaluationResult;
  /** Shown under the issues, e.g. the full corrected sentence (§15). */
  readonly correction?: string;
  readonly revealed?: boolean;
}

/**
 * Answer feedback (§16, §30).
 *
 * Correctness is conveyed by an icon and a word as well as colour, never colour alone,
 * and the panel is an `aria-live` region so a screen reader announces the outcome
 * without the focus moving.
 */
export function ExerciseFeedback({
  result,
  correction,
  revealed = false,
}: ExerciseFeedbackProps): ReactNode {
  const tone = revealed ? 'revealed' : result.correct ? 'correct' : 'incorrect';
  const heading = revealed ? 'Answer revealed' : result.correct ? 'Correct' : 'Not correct';

  return (
    <div className={`feedback feedback--${tone}`} role="status" aria-live="polite">
      <p className="feedback__heading">
        <span aria-hidden="true" className="feedback__icon">
          {result.correct && !revealed ? '✓' : '✗'}
        </span>
        {heading}
      </p>

      {!result.correct || revealed ? (
        <dl className="feedback__answers">
          {result.submittedAnswer ? (
            <div>
              <dt>Your answer</dt>
              <dd lang="de">{result.submittedAnswer}</dd>
            </div>
          ) : null}
          <div>
            <dt>Correct answer</dt>
            <dd lang="de">{result.expectedAnswer}</dd>
          </div>
        </dl>
      ) : null}

      {result.issues.length > 0 ? (
        <>
          <p className="feedback__issues-heading">Issues:</p>
          <ul className="feedback__issues">
            {result.issues.map((issue) => (
              <li key={`${issue.category}-${issue.message}`}>{issue.message}</li>
            ))}
          </ul>
        </>
      ) : null}

      {correction ? (
        <p className="feedback__correction" lang="de">
          {correction}
        </p>
      ) : null}
    </div>
  );
}
