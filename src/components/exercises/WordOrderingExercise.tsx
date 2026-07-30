import { useEffect, useState, type ReactNode } from 'react';
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  arrayMove,
  horizontalListSortingStrategy,
  sortableKeyboardCoordinates,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

import type { WordOrderingExercise as WordOrderingExerciseType } from '@/schemas/exerciseSchema';
import type { ExerciseComponentProps } from './exerciseProps';
import './exercises.css';

/**
 * Word ordering (§15, §30).
 *
 * Three ways to answer, so drag-and-drop is never the only route:
 *   - drag with the mouse (dnd-kit pointer sensor);
 *   - drag with the keyboard (dnd-kit keyboard sensor: Space to lift, arrows to move);
 *   - explicit "move left"/"move right" buttons on every token.
 */

interface TokenSlot {
  readonly key: string;
  readonly token: string;
}

interface SortableTokenProps {
  readonly slot: TokenSlot;
  readonly index: number;
  readonly total: number;
  readonly disabled: boolean;
  readonly onMove: (index: number, direction: -1 | 1) => void;
}

function SortableToken({ slot, index, total, disabled, onMove }: SortableTokenProps): ReactNode {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: slot.key,
    disabled,
  });

  return (
    <li
      ref={setNodeRef}
      className={`token ${isDragging ? 'token--dragging' : ''}`}
      style={{ transform: CSS.Transform.toString(transform), transition }}
    >
      <button
        type="button"
        className="token__move"
        disabled={disabled || index === 0}
        onClick={() => onMove(index, -1)}
        aria-label={`Move ${slot.token} left`}
      >
        ‹
      </button>
      <span className="token__text" lang="de" {...attributes} {...listeners}>
        {slot.token}
      </span>
      <button
        type="button"
        className="token__move"
        disabled={disabled || index === total - 1}
        onClick={() => onMove(index, 1)}
        aria-label={`Move ${slot.token} right`}
      >
        ›
      </button>
    </li>
  );
}

export function WordOrderingExercise({
  exercise,
  onSubmit,
  locked,
  attempt,
  revealed,
}: ExerciseComponentProps<WordOrderingExerciseType>): ReactNode {
  const initial = (): TokenSlot[] =>
    // Keys must be stable and unique even when a sentence repeats a word.
    exercise.tokens.map((token, index) => ({ key: `${index}-${token}`, token }));

  const [slots, setSlots] = useState<TokenSlot[]>(initial);

  useEffect(() => {
    setSlots(initial);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attempt, exercise.id]);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const move = (index: number, direction: -1 | 1): void => {
    setSlots((current) => arrayMove(current, index, index + direction));
  };

  const handleDragEnd = (event: DragEndEvent): void => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    setSlots((current) => {
      const from = current.findIndex((slot) => slot.key === active.id);
      const to = current.findIndex((slot) => slot.key === over.id);
      return from < 0 || to < 0 ? current : arrayMove(current, from, to);
    });
  };

  const submit = (): void => {
    if (locked) return;
    const answer = slots.map((slot) => slot.token);
    const correct = exercise.acceptedOrders.some(
      (order) => order.length === answer.length && order.every((token, i) => token === answer[i]),
    );

    onSubmit({
      correct,
      issues: correct
        ? []
        : [{ category: 'wordOrderError', message: 'The words are in the wrong order.' }],
      submittedAnswer: answer.join(' '),
      expectedAnswer: exercise.canonicalAnswer,
    });
  };

  return (
    <div className="exercise">
      <p className="exercise__prompt">{exercise.prompt}</p>
      {exercise.hint ? <p className="exercise__hint">{exercise.hint}</p> : null}
      <p className="exercise__hint">
        Drag the words, or use the arrow buttons on each word. With the keyboard, press Space to
        pick a word up, then use the arrow keys.
      </p>

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext
          items={slots.map((slot) => slot.key)}
          strategy={horizontalListSortingStrategy}
        >
          <ul className="token-list" aria-label="Sentence tokens in your chosen order">
            {slots.map((slot, index) => (
              <SortableToken
                key={slot.key}
                slot={slot}
                index={index}
                total={slots.length}
                disabled={locked}
                onMove={move}
              />
            ))}
          </ul>
        </SortableContext>
      </DndContext>

      <p className="exercise__current" role="status" aria-live="polite" lang="de">
        {slots.map((slot) => slot.token).join(' ')}
      </p>

      {revealed ? (
        <p className="exercise__revealed" lang="de">
          {exercise.canonicalAnswer}
        </p>
      ) : null}

      {!locked ? (
        <button type="button" className="exercise__submit" onClick={submit}>
          Check answer
        </button>
      ) : null}
    </div>
  );
}
