import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, renderHook } from '@testing-library/react';

import { hasGermanVoice, useSpeechSynthesis } from './useSpeechSynthesis';
import { NOTHING_HEARD, useSpeechRecognition } from './useSpeechRecognition';
import type { SpeechRecognitionErrorEventLike } from './speechTypes';

type FakeSynth = EventTarget & {
  voices: { lang: string }[];
  getVoices: () => { lang: string }[];
  speak: ReturnType<typeof vi.fn>;
  cancel: ReturnType<typeof vi.fn>;
};

function installSynthesis(voices: { lang: string }[] = []): FakeSynth {
  const synth = Object.assign(new EventTarget(), {
    voices,
    getVoices: () => synth.voices,
    speak: vi.fn(),
    cancel: vi.fn(),
  }) as FakeSynth;
  vi.stubGlobal('speechSynthesis', synth);
  vi.stubGlobal(
    'SpeechSynthesisUtterance',
    class {
      text: string;
      onend: (() => void) | null = null;
      onerror: (() => void) | null = null;
      constructor(text: string) {
        this.text = text;
      }
    },
  );
  return synth;
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  // Unmount while the fake speech globals still exist.
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('hasGermanVoice', () => {
  it('counts a German voice that arrives late via voiceschanged', async () => {
    const synth = installSynthesis([{ lang: 'en-US' }]);
    const pending = hasGermanVoice();

    synth.voices = [{ lang: 'en-US' }, { lang: 'de-AT' }];
    synth.dispatchEvent(new Event('voiceschanged'));

    await expect(pending).resolves.toBe(true);
  });

  it('resolves false after the wait when only other voices exist', async () => {
    installSynthesis([{ lang: 'en-US' }]);
    const pending = hasGermanVoice();

    await vi.advanceTimersByTimeAsync(1000);

    await expect(pending).resolves.toBe(false);
  });
});

describe('useSpeechSynthesis', () => {
  it('stops showing "playing" even when the browser never fires onend', () => {
    installSynthesis([{ lang: 'de-DE' }]);
    const { result } = renderHook(() => useSpeechSynthesis(1));

    act(() => {
      result.current.speak('Hallo');
    });
    expect(result.current.speaking).toBe(true);

    act(() => {
      vi.advanceTimersByTime(10_000);
    });
    expect(result.current.speaking).toBe(false);
  });
});

describe('useSpeechRecognition', () => {
  let instance: {
    onend: (() => void) | null;
    onerror: ((event: SpeechRecognitionErrorEventLike) => void) | null;
  };

  beforeEach(() => {
    vi.stubGlobal(
      'SpeechRecognition',
      class {
        onend = null;
        onerror = null;
        onresult = null;
        start = vi.fn();
        stop = vi.fn();
        abort = vi.fn();
        constructor() {
          // eslint-disable-next-line @typescript-eslint/no-this-alias
          instance = this;
        }
      },
    );
  });

  it('reports that nothing was heard when recognition ends without a transcript', () => {
    const { result } = renderHook(() => useSpeechRecognition());

    act(() => result.current.start());
    act(() => instance.onend?.());

    expect(result.current.status).toBe('error');
    expect(result.current.error).toBe(NOTHING_HEARD);
  });

  it('explains error codes in plain words', () => {
    const { result } = renderHook(() => useSpeechRecognition());

    act(() => result.current.start());
    act(() => instance.onerror?.({ error: 'network' } as SpeechRecognitionErrorEventLike));
    act(() => instance.onend?.());

    expect(result.current.error).toMatch(/internet connection/);
    expect(result.current.error).not.toMatch(/\(network\)/);
  });
});
