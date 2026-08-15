import type { EvaluationResult, Exercise } from '@/schemas/exerciseSchema';

/**
 * Shared contract between the exercise runner and the seven exercise components.
 *
 * A component owns its input UI and evaluates its own answer, because only it knows the
 * shape of that answer. The runner owns reveal, timing and persistence.
 */
export interface ExerciseComponentProps<E extends Exercise = Exercise> {
  readonly exercise: E;
  /** Called once, with the evaluated answer — there is no second try. */
  readonly onSubmit: (result: EvaluationResult) => void;
  /** True once the runner has accepted a final answer; the component becomes read-only. */
  readonly locked: boolean;
  /** True when the learner asked to see the answer; the component should show it. */
  readonly revealed: boolean;
}
