import { useEffect } from 'react';

/**
 * Binds P to "play the audio" for the screen's single sound.
 *
 * Anywhere a word can be heard — a listening question, a speaking prompt, the card that
 * introduces a new word — P plays it, so a whole session runs from the keyboard: P to
 * hear, a digit to answer, Enter to continue.
 *
 * The key is ignored while a text field has focus, where P is simply a letter, and when
 * a modifier is held, so browser shortcuts keep working. Only bind this on a screen with
 * one sound: two bindings at once would give the key two meanings.
 */
export function usePlayShortcut(play: () => void, enabled = true): void {
  useEffect(() => {
    if (!enabled) return undefined;

    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== 'p' && event.key !== 'P') return;
      if (event.altKey || event.ctrlKey || event.metaKey) return;
      const target = event.target as HTMLElement | null;
      if (target instanceof HTMLInputElement && target.type !== 'radio') return;
      if (target instanceof HTMLTextAreaElement) return;
      event.preventDefault();
      play();
    };

    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [enabled, play]);
}
