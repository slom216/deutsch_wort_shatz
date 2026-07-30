import { useCallback, type ReactNode, type RefObject } from 'react';

import {
  CHARACTER_NAMES,
  GERMAN_CHARACTERS,
  insertAtCursor,
  type GermanCharacter,
  type TextField,
} from './germanCharacters';
import './GermanCharacterHelper.css';

/**
 * German character helper (§17).
 *
 * Every text input in the app offers these characters. Requirements met here:
 *   - inserts at the cursor, replacing any selection;
 *   - preserves focus and leaves the caret after the inserted character;
 *   - works for both `input` and `textarea`;
 *   - each button has an accessible label;
 *   - keyboard shortcuts (Alt+A/O/U/S) via `handleGermanCharacterShortcut`.
 */

interface GermanCharacterHelperProps {
  /** The field characters are inserted into. */
  readonly targetRef: RefObject<TextField | null>;
  readonly disabled?: boolean;
}

export function GermanCharacterHelper({
  targetRef,
  disabled = false,
}: GermanCharacterHelperProps): ReactNode {
  const insert = useCallback(
    (character: GermanCharacter) => {
      const field = targetRef.current;
      if (!field) return;
      insertAtCursor(field, character);
    },
    [targetRef],
  );

  return (
    <div className="char-helper">
      <span className="char-helper__label" id="char-helper-label">
        German characters
      </span>
      <div className="char-helper__buttons" role="group" aria-labelledby="char-helper-label">
        {GERMAN_CHARACTERS.map((character) => (
          <button
            key={character}
            type="button"
            className="char-helper__button"
            disabled={disabled}
            // The button must not steal focus from the input.
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => insert(character)}
            aria-label={`Insert ${CHARACTER_NAMES[character]} ${character}`}
          >
            {character}
          </button>
        ))}
      </div>
      <span className="char-helper__hint">Or use Alt+A, Alt+O, Alt+U, Alt+S.</span>
    </div>
  );
}
