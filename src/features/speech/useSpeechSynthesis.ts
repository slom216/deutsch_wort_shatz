import { useCallback, useEffect, useRef, useState } from 'react';

import { GERMAN_LOCALE, isSpeechSynthesisSupported } from './speechTypes';

/**
 * Speech synthesis for listening exercises (§26).
 *
 * Detects support, prefers an installed German voice, honours the configured rate,
 * cancels any previous utterance before speaking again, and exposes a `supported` flag
 * so the component can fall back to showing the text instead.
 */

export interface SpeechSynthesisState {
  readonly supported: boolean;
  readonly speaking: boolean;
  readonly germanVoiceAvailable: boolean;
  readonly speak: (text: string) => void;
  readonly cancel: () => void;
}

/** How long to wait for a late `voiceschanged` before deciding there is no German voice. */
const VOICE_WAIT_MS = 1000;

function isGermanVoice(voice: SpeechSynthesisVoice): boolean {
  // `de-DE`, `de-AT`, and the `de_DE` some Android builds report.
  return voice.lang.toLowerCase().startsWith('de');
}

/**
 * Resolves true only when a German voice is installed.
 *
 * Voices load asynchronously in most browsers, so an empty list is not an answer: this
 * waits for `voiceschanged` for up to about a second. API presence alone is
 * `isSpeechSynthesisSupported`; without a German voice, listening would be read out by an
 * English voice and teach the wrong pronunciation.
 */
export function hasGermanVoice(): Promise<boolean> {
  if (!isSpeechSynthesisSupported()) return Promise.resolve(false);
  const synth = window.speechSynthesis;
  const found = (): boolean => synth.getVoices().some(isGermanVoice);
  if (found()) return Promise.resolve(true);

  return new Promise((resolve) => {
    const finish = (): void => {
      clearTimeout(timer);
      synth.removeEventListener('voiceschanged', check);
      resolve(found());
    };
    const check = (): void => {
      if (found()) finish();
    };
    const timer = setTimeout(finish, VOICE_WAIT_MS);
    synth.addEventListener('voiceschanged', check);
  });
}

/**
 * Upper bound on how long an utterance can take. Some browser voices never fire `onend`,
 * which would leave the button on "Playing…" for good. ~90 ms per character at rate 1 is
 * slower than any real voice, plus slack for start-up.
 */
function fallbackDurationMs(text: string, rate: number): number {
  return (text.length * 90) / Math.max(rate, 0.1) + 1500;
}

export function useSpeechSynthesis(rate = 1): SpeechSynthesisState {
  const [supported] = useState(() => isSpeechSynthesisSupported());
  const [speaking, setSpeaking] = useState(false);
  const [voice, setVoice] = useState<SpeechSynthesisVoice | null>(null);
  const rateRef = useRef(rate);
  rateRef.current = rate;
  const fallbackRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearFallback = useCallback((): void => {
    if (fallbackRef.current !== null) {
      clearTimeout(fallbackRef.current);
      fallbackRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (!supported) return;

    const pickVoice = (): void => {
      const voices = window.speechSynthesis.getVoices();
      const german =
        voices.find((candidate) => candidate.lang === GERMAN_LOCALE) ??
        voices.find(isGermanVoice) ??
        null;
      setVoice(german);
    };

    pickVoice();
    // Voices load asynchronously in most browsers, so the list is often empty at first.
    window.speechSynthesis.addEventListener('voiceschanged', pickVoice);
    return () => {
      window.speechSynthesis.removeEventListener('voiceschanged', pickVoice);
      window.speechSynthesis.cancel();
      clearFallback();
    };
  }, [supported, clearFallback]);

  const cancel = useCallback((): void => {
    if (!supported) return;
    clearFallback();
    window.speechSynthesis.cancel();
    setSpeaking(false);
  }, [supported, clearFallback]);

  const speak = useCallback(
    (text: string): void => {
      if (!supported || text.trim().length === 0) return;

      // Always cancel first: queued utterances would otherwise stack up on replay (§26).
      window.speechSynthesis.cancel();
      clearFallback();

      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = GERMAN_LOCALE;
      utterance.rate = rateRef.current;
      if (voice) utterance.voice = voice;
      const done = (): void => {
        // The cancelled utterance of a replay ends late; it must not stop the new one.
        if (fallbackRef.current !== timer) return;
        clearFallback();
        setSpeaking(false);
      };
      utterance.onend = done;
      utterance.onerror = done;
      const timer = setTimeout(done, fallbackDurationMs(text, rateRef.current));
      fallbackRef.current = timer;

      setSpeaking(true);
      window.speechSynthesis.speak(utterance);
    },
    [supported, voice, clearFallback],
  );

  return {
    supported,
    speaking,
    germanVoiceAvailable: voice !== null,
    speak,
    cancel,
  };
}
