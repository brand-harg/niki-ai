"use client";

import { useCallback, useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";

type SpeechRecognitionResultLike = {
  [index: number]: { transcript: string };
  isFinal?: boolean;
};

type SpeechRecognitionEventLike = {
  results: ArrayLike<SpeechRecognitionResultLike>;
};

type SpeechRecognitionLike = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: { error?: string }) => void) | null;
  onend: (() => void) | null;
};

type SpeechRecognitionConstructor = new () => SpeechRecognitionLike;

type UseVoiceInputOptions = {
  isLoading: boolean;
  inputValue: string;
  setInputValue: Dispatch<SetStateAction<string>>;
};

function getSpeechRecognitionConstructor(): SpeechRecognitionConstructor | null {
  if (typeof window === "undefined") return null;
  const speechWindow = window as Window & {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
  };
  return speechWindow.SpeechRecognition ?? speechWindow.webkitSpeechRecognition ?? null;
}

export function useVoiceInput({
  isLoading,
  inputValue,
  setInputValue,
}: UseVoiceInputOptions) {
  const [speechSupported, setSpeechSupported] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const speechRecognitionRef = useRef<SpeechRecognitionLike | null>(null);

  const abortListening = useCallback(() => {
    speechRecognitionRef.current?.abort();
    speechRecognitionRef.current = null;
    setIsListening(false);
  }, []);

  const stopListening = useCallback(() => {
    speechRecognitionRef.current?.stop();
    setIsListening(false);
  }, []);

  const toggleListening = useCallback(() => {
    if (isLoading) return;

    if (isListening) {
      stopListening();
      return;
    }

    const SpeechRecognition = getSpeechRecognitionConstructor();
    if (!SpeechRecognition) {
      setSpeechSupported(false);
      return;
    }

    const recognition = new SpeechRecognition();
    const startingText = inputValue.trim();
    recognition.lang = "en-US";
    recognition.interimResults = true;
    recognition.continuous = false;

    recognition.onresult = (event) => {
      const transcript = Array.from(event.results)
        .map((result) => result[0]?.transcript ?? "")
        .join(" ")
        .replace(/\s+/g, " ")
        .trim();

      if (!transcript) return;
      setInputValue(startingText ? `${startingText} ${transcript}` : transcript);
    };

    recognition.onerror = (event) => {
      console.warn("Speech recognition failed:", event.error ?? "unknown error");
      setIsListening(false);
    };

    recognition.onend = () => {
      if (speechRecognitionRef.current === recognition) {
        speechRecognitionRef.current = null;
      }
      setIsListening(false);
    };

    speechRecognitionRef.current?.abort();
    speechRecognitionRef.current = recognition;
    setIsListening(true);
    recognition.start();
  }, [inputValue, isListening, isLoading, setInputValue, stopListening]);

  useEffect(() => {
    // Preserve the existing mount-time browser support check from app/page.tsx.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSpeechSupported(!!getSpeechRecognitionConstructor());
    return () => {
      speechRecognitionRef.current?.abort();
      speechRecognitionRef.current = null;
    };
  }, []);

  return {
    speechSupported,
    isListening,
    startListening: toggleListening,
    stopListening,
    abortListening,
    toggleListening,
  };
}
