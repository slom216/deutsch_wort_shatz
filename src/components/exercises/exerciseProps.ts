import type { EvaluationResult, Exercise } from '@/schemas/exerciseSchema';

/**
 * Shared contract between the exercise runner and the seven exercise components.
 *
 * A component owns its input UI and evaluates its own answer, because only it knows the
 * shape of that answer. The runner owns attempts, reveal, timing and persistence.
 */
export interface ExerciseComponentProps<E extends Exercise = Exercise> {
  readonly exercise: E;
  /** Called once per attempt with the evaluated result. */
  readonly onSubmit: (result: EvaluationResult) => void;
  /** True once the runner has accepted a final answer; the component becomes read-only. */
  readonly locked: boolean;
  /** Changes on each retry so the component can clear its input. */
  readonly attempt: number;
  /** True when the learner asked to see the answer; the component should show it. */
  readonly revealed: boolean;
}
