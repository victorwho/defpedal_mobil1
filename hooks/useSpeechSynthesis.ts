import { useState, useCallback, useEffect } from 'react';

export const useSpeechSynthesis = () => {
  const [isSupported, setIsSupported] = useState(false);

  useEffect(() => {
    setIsSupported(
      typeof window !== 'undefined' && 'speechSynthesis' in window
    );
  }, []);

  const speak = useCallback((text: string) => {
    if (!isSupported) return;
    
    // Cancel any ongoing speech before starting a new one
    window.speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(text);
    // Optional: Configure voice, rate, pitch
    // utterance.voice = window.speechSynthesis.getVoices()[0];
    // utterance.rate = 1;
    // utterance.pitch = 1;

    window.speechSynthesis.speak(utterance);
  }, [isSupported]);
  
  const cancel = useCallback(() => {
    if (!isSupported) return;
    window.speechSynthesis.cancel();
  }, [isSupported]);

  return { speak, cancel, isSupported };
};
