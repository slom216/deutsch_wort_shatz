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

export function useSpeechSynthesis(rate = 1): SpeechSynthesisState {
  const [supported] = useState(() => isSpeechSynthesisSupported());
  const [speaking, setSpeaking] = useState(false);
  const [voice, setVoice] = useState<SpeechSynthesisVoice | null>(null);
  const rateRef = useRef(rate);
  rateRef.current = rate;

  useEffect(() => {
    if (!supported) return;

    const pickVoice = (): void => {
      const voices = window.speechSynthesis.getVoices();
      const german =
        voices.find((candidate) => candidate.lang === GERMAN_LOCALE) ??
        voices.find((candidate) => candidate.lang.startsWith('de')) ??
        null;
      setVoice(german);
    };

    pickVoice();
    // Voices load asynchronously in most browsers, so the list is often empty at first.
    window.speechSynthesis.addEventListener('voiceschanged', pickVoice);
    return () => {
      window.speechSynthesis.removeEventListener('voiceschanged', pickVoice);
      window.speechSynthesis.cancel();
    };
  }, [supported]);

  const cancel = useCallback((): void => {
    if (!supported) return;
    window.speechSynthesis.cancel();
    setSpeaking(false);
  }, [supported]);

  const speak = useCallback(
    (text: string): void => {
      if (!supported || text.trim().length === 0) return;

      // Always cancel first: queued utterances would otherwise stack up on replay (§26).
      window.speechSynthesis.cancel();

      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = GERMAN_LOCALE;
      utterance.rate = rateRef.current;
      if (voice) utterance.voice = voice;
      utterance.onend = () => setSpeaking(false);
      utterance.onerror = () => setSpeaking(false);

      setSpeaking(true);
      window.speechSynthesis.speak(utterance);
    },
    [supported, voice],
  );

  return {
    supported,
    speaking,
    germanVoiceAvailable: voice !== null,
    speak,
    cancel,
  };
}
