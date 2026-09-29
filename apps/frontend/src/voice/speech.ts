// Pengenal suara bawaan browser (Web Speech API): gratis, tanpa token.
// Catatan: di Chrome/Edge audio diproses server Google, jadi perlu internet.

import { useCallback, useEffect, useRef, useState } from "react";
import type { Lang } from "../i18n";

interface SRAlternative {
  transcript: string;
}
interface SRResult {
  isFinal: boolean;
  0: SRAlternative;
}
interface SREvent {
  resultIndex: number;
  results: ArrayLike<SRResult>;
}
interface SR {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  maxAlternatives: number;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((e: SREvent) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
}
type SRConstructor = new () => SR;

function recognizerClass(): SRConstructor | undefined {
  const w = window as unknown as { SpeechRecognition?: SRConstructor; webkitSpeechRecognition?: SRConstructor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition;
}

export function useSpeechRecognition(lang: Lang, onFinal: (text: string) => void, onError: (code: string) => void) {
  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState("");
  const recRef = useRef<SR | null>(null);
  const callbacks = useRef({ onFinal, onError });
  callbacks.current = { onFinal, onError };
  const supported = !!recognizerClass();

  const stop = useCallback(() => recRef.current?.stop(), []);

  const start = useCallback(() => {
    const Ctor = recognizerClass();
    if (!Ctor || recRef.current) return;
    const rec = new Ctor();
    rec.lang = lang === "id" ? "id-ID" : "en-US";
    rec.interimResults = true;
    rec.continuous = false; // berhenti sendiri setelah jeda bicara
    rec.maxAlternatives = 1;
    let finalText = "";
    rec.onresult = (e) => {
      let pending = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        if (r.isFinal) finalText += r[0].transcript;
        else pending += r[0].transcript;
      }
      setInterim(`${finalText} ${pending}`.trim());
    };
    rec.onerror = (e) => {
      if (e.error !== "no-speech" && e.error !== "aborted") callbacks.current.onError(e.error);
    };
    rec.onend = () => {
      recRef.current = null;
      setListening(false);
      setInterim("");
      if (finalText.trim()) callbacks.current.onFinal(finalText.trim());
    };
    recRef.current = rec;
    setListening(true);
    setInterim("");
    try {
      rec.start();
    } catch {
      recRef.current = null;
      setListening(false);
    }
  }, [lang]);

  const toggle = useCallback(() => (recRef.current ? stop() : start()), [start, stop]);
  useEffect(() => () => recRef.current?.abort(), []);
  return { supported, listening, interim, toggle };
}
