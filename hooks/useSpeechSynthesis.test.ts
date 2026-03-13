import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useSpeechSynthesis } from './useSpeechSynthesis';

describe('useSpeechSynthesis', () => {
  beforeEach(() => {
    // Mock window.speechSynthesis
    Object.defineProperty(window, 'speechSynthesis', {
      writable: true,
      value: {
        speak: vi.fn(),
        cancel: vi.fn(),
        getVoices: vi.fn().mockReturnValue([]),
      },
    });

    // Mock SpeechSynthesisUtterance
    global.SpeechSynthesisUtterance = vi.fn().mockImplementation(function(this: any, text: string) {
      this.text = text;
    }) as any;
  });

  it('should initialize with isSupported true if speechSynthesis exists', () => {
    const { result } = renderHook(() => useSpeechSynthesis());
    expect(result.current.isSupported).toBe(true);
  });

  it('should call speak and cancel correctly', () => {
    const { result } = renderHook(() => useSpeechSynthesis());

    act(() => {
      result.current.speak('Hello world');
    });

    expect(window.speechSynthesis.cancel).toHaveBeenCalled();
    expect(global.SpeechSynthesisUtterance).toHaveBeenCalledWith('Hello world');
    expect(window.speechSynthesis.speak).toHaveBeenCalled();

    act(() => {
      result.current.cancel();
    });

    expect(window.speechSynthesis.cancel).toHaveBeenCalledTimes(2);
  });
});
