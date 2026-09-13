import { useCallback, useEffect, useRef, useState } from 'react';

import {
  GERMAN_LOCALE,
  getSpeechRecognitionConstructor,
  type SpeechRecognitionLike,
} from './speechTypes';

/**
 * Speech recognition for speaking exercises (§26).
 *
 * Rules enforced here:
 *   - detect both the standard and the prefixed constructor;
 *   - use de-DE;
 *   - start only from a user action (the hook never auto-starts);
 *   - stop after a result or a timeout;
 *   - expose the transcript and allow retry;
 *   - never store audio — only the transcript string is kept, in memory.
 *
 * When unsupported, `supported` is false and the component offers manual
 * self-assessment instead. Progression is never blocked.
 */

const RECOGNITION_TIMEOUT_MS = 8000;

export const NOTHING_HEARD = 'Nothing was heard — try again.';

/** Plain-language messages for the Web Speech API error codes; never the raw code. */
function recognitionErrorMessage(code: string): string {
  switch (code) {
    case 'no-speech':
      return NOTHING_HEARD;
    case 'not-allowed':
    case 'service-not-allowed':
      return 'Microphone permission was declined. You can still mark your answer yourself.';
    case 'audio-capture':
      return 'No microphone was found. You can still mark your answer yourself.';
    case 'network':
      return 'Speech recognition needs an internet connection in this browser. Try again, or mark your answer yourself.';
    case 'language-not-supported':
      return 'German speech recognition is not available in this browser. You can still mark your answer yourself.';
    default:
      return 'Speech recognition did not work. Try again, or mark your answer yourself.';
  }
}

export type RecognitionStatus = 'idle' | 'listening' | 'done' | 'error';

export interface SpeechRecognitionState {
  readonly supported: boolean;
  readonly status: RecognitionStatus;
  readonly transcript: string;
  readonly error: string | null;
  readonly start: () => void;
  readonly stop: () => void;
  readonly reset: () => void;
}

export function useSpeechRecognition(): SpeechRecognitionState {
  const [supported] = useState(() => getSpeechRecognitionConstructor() !== null);
  const [status, setStatus] = useState<RecognitionStatus>('idle');
  const [transcript, setTranscript] = useState('');
  const [error, setError] = useState<string | null>(null);

  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearTimer = useCallback(() => {
    if (timeoutRef.current !== null) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }, []);

  const stop = useCallback(() => {
    clearTimer();
    recognitionRef.current?.stop();
  }, [clearTimer]);

  useEffect(
    () => () => {
      clearTimer();
      recognitionRef.current?.abort();
      recognitionRef.current = null;
    },
    [clearTimer],
  );

  const start = useCallback(() => {
    const Constructor = getSpeechRecognitionConstructor();
    if (!Constructor) {
      setStatus('error');
      setError('Speech recognition is not available in this browser.');
      return;
    }

    recognitionRef.current?.abort();
    setTranscript('');
    setError(null);

    const recognition = new Constructor();
    recognition.lang = GERMAN_LOCALE;
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;

    // Set once this attempt has a transcript or an error. An attempt that ends without
    // either heard nothing, and must say so rather than offer an empty "result".
    let settled = false;
    // Events from a recognition that was aborted or replaced must not touch the new state.
    const current = (): boolean => recognitionRef.current === recognition;

    recognition.onresult = (event) => {
      if (!current()) return;
      const result = event.results[event.resultIndex] ?? event.results[0];
      const heard = result?.[0]?.transcript.trim() ?? '';
      if (heard.length === 0) return;
      settled = true;
      // Only the recognized text is retained; the audio itself is never stored (§26).
      setTranscript(heard);
      setStatus('done');
      clearTimer();
    };

    recognition.onerror = (event) => {
      if (!current() || event.error === 'aborted') return;
      settled = true;
      setStatus('error');
      setError(recognitionErrorMessage(event.error));
      clearTimer();
    };

    recognition.onend = () => {
      if (!current()) return;
      clearTimer();
      if (settled) return;
      setStatus('error');
      setError(NOTHING_HEARD);
    };

    recognitionRef.current = recognition;
    setStatus('listening');

    try {
      recognition.start();
    } catch {
      setStatus('error');
      setError('Could not start speech recognition.');
      return;
    }

    timeoutRef.current = setTimeout(() => {
      recognition.stop();
    }, RECOGNITION_TIMEOUT_MS);
  }, [clearTimer]);

  const reset = useCallback(() => {
    clearTimer();
    recognitionRef.current?.abort();
    recognitionRef.current = null;
    setStatus('idle');
    setTranscript('');
    setError(null);
  }, [clearTimer]);

  return { supported, status, transcript, error, start, stop, reset };
}
