import { useEffect, useState, type ReactNode } from 'react';
import {
  DndContext,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  closestCenter,
  useSensor,
  useSensors,
  type Announcements,
  type DragEndEvent,
  type UniqueIdentifier,
} from '@dnd-kit/core';
import {
  SortableContext,
  arrayMove,
  rectSortingStrategy,
  sortableKeyboardCoordinates,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

import { bareToken } from '@/features/practice/generators/wordOrdering';
import type { WordOrderingExercise as WordOrderingExerciseType } from '@/schemas/exerciseSchema';
import type { ExerciseComponentProps } from './exerciseProps';
import './exercises.css';

/**
 * Word ordering (§15, §30).
 *
 * Three ways to answer, so drag-and-drop is never the only route:
 *   - drag with the mouse or by touch (a touch drag starts after a short hold, so a swipe
 *     over the tokens still scrolls the page);
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
  revealed,
}: ExerciseComponentProps<WordOrderingExerciseType>): ReactNode {
  const initial = (): TokenSlot[] =>
    // Keys must be stable and unique even when a sentence repeats a word. Tokens are shown
    // bare: a session saved before punctuation was stripped must not give the answer away.
    exercise.tokens.map((token, index) => ({ key: `${index}-${token}`, token: bareToken(token) }));

  const [slots, setSlots] = useState<TokenSlot[]>(initial);

  useEffect(() => {
    setSlots(initial);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [exercise.id]);

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 8 } }),
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

  // Announced in words the learner can see, never dnd-kit's internal keys.
  const describe = (id: UniqueIdentifier): string => {
    const index = slots.findIndex((slot) => slot.key === id);
    return `${slots[index]?.token ?? 'word'}, position ${index + 1} of ${slots.length}`;
  };
  const tokenOf = (id: UniqueIdentifier): string =>
    slots.find((slot) => slot.key === id)?.token ?? 'word';
  const positionOf = (id: UniqueIdentifier): number =>
    slots.findIndex((slot) => slot.key === id) + 1;
  const announcements: Announcements = {
    onDragStart: ({ active }) => `Picked up ${describe(active.id)}.`,
    onDragOver: ({ active, over }) =>
      over
        ? `${tokenOf(active.id)} is over position ${positionOf(over.id)} of ${slots.length}.`
        : `${tokenOf(active.id)} is not over a position.`,
    onDragEnd: ({ active, over }) =>
      over
        ? `${tokenOf(active.id)} dropped at position ${positionOf(over.id)} of ${slots.length}.`
        : `${tokenOf(active.id)} dropped.`,
    onDragCancel: ({ active }) => `Move cancelled. ${describe(active.id)}.`,
  };

  const submit = (): void => {
    if (locked) return;
    const answer = slots.map((slot) => slot.token);
    // Punctuation is not part of the order being tested.
    const correct = exercise.acceptedOrders.some(
      (order) =>
        order.length === answer.length && order.every((token, i) => bareToken(token) === answer[i]),
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
      <p className="exercise__hint">
        Drag the words, or use the arrow buttons on each word. With the keyboard, press Space to
        pick a word up, then use the arrow keys.
      </p>

      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
        accessibility={{ announcements }}
      >
        <SortableContext
          items={slots.map((slot) => slot.key)}
          // Rect, not horizontal: a long sentence wraps onto several rows.
          strategy={rectSortingStrategy}
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
