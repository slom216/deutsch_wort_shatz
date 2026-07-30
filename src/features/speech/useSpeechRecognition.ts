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

    recognition.onresult = (event) => {
      const result = event.results[event.resultIndex] ?? event.results[0];
      const alternative = result?.[0];
      // Only the recognized text is retained; the audio itself is never stored (§26).
      if (alternative) setTranscript(alternative.transcript);
      setStatus('done');
      clearTimer();
    };

    recognition.onerror = (event) => {
      setStatus('error');
      setError(
        event.error === 'not-allowed'
          ? 'Microphone permission was declined. You can still mark your answer yourself.'
          : `Speech recognition failed (${event.error}).`,
      );
      clearTimer();
    };

    recognition.onend = () => {
      clearTimer();
      setStatus((current) => (current === 'listening' ? 'done' : current));
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
    setStatus('idle');
    setTranscript('');
    setError(null);
  }, [clearTimer]);

  return { supported, status, transcript, error, start, stop, reset };
}
