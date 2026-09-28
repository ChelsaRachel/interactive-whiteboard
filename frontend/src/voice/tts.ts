// Membacakan jawaban dengan suara bawaan browser (speechSynthesis): gratis, tanpa token.
// Rumus LaTeX di antara $...$ diubah menjadi kata-kata di sini, bukan oleh AI.

import type { Lang } from "../i18n";

const WORDS = {
  id: {
    over: "per", sqrt: "akar", squared: "kuadrat", cubed: "pangkat tiga", power: "pangkat", degrees: "derajat",
    times: "kali", divide: "bagi", equals: "sama dengan", plus: "tambah", minus: "kurang", negative: "negatif",
    approx: "kira-kira", le: "kurang dari sama dengan", ge: "lebih dari sama dengan", lt: "kurang dari",
    gt: "lebih dari", neq: "tidak sama dengan", ln: "logaritma natural", pm: "plus minus", sq: "persegi", cube: "kubik",
  },
  en: {
    over: "over", sqrt: "square root of", squared: "squared", cubed: "cubed", power: "to the power of",
    degrees: "degrees", times: "times", divide: "divided by", equals: "equals", plus: "plus", minus: "minus",
    negative: "negative", approx: "approximately", le: "less than or equal to", ge: "greater than or equal to",
    lt: "less than", gt: "greater than", neq: "is not equal to", ln: "natural log", pm: "plus or minus", sq: "squared",
    cube: "cubed",
  },
};

export function latexToSpeech(tex: string, lang: Lang): string {
  const w = WORDS[lang];
  let s = tex.replace(/\\left|\\right|\\displaystyle/g, "");
  for (let i = 0; i < 5; i++) {
    s = s
      .replace(/\\frac\{([^{}]*)\}\{([^{}]*)\}/g, ` $1 ${w.over} $2 `)
      .replace(/\\sqrt\{([^{}]*)\}/g, ` ${w.sqrt} $1 `);
  }
  s = s
    .replace(/\^\{?\\circ\}?|°/g, ` ${w.degrees}`)
    .replace(/\^\{?2\}?/g, ` ${w.squared} `)
    .replace(/\^\{?3\}?/g, ` ${w.cubed} `)
    .replace(/\^\{([^{}]*)\}|\^(\S)/g, (_, a, b) => ` ${w.power} ${a ?? b} `)
    .replace(/_\{([^{}]*)\}|_(\S)/g, (_, a, b) => ` ${a ?? b} `)
    .replace(/\\(sin|cos|tan|log)\b/g, " $1 ")
    .replace(/\\ln\b/g, ` ${w.ln} `)
    .replace(/\\pi\b/g, " pi ")
    .replace(/\\pm\b/g, ` ${w.pm} `)
    .replace(/\\(cdot|times)\b/g, ` ${w.times} `)
    .replace(/\\div\b/g, ` ${w.divide} `)
    .replace(/\\approx\b/g, ` ${w.approx} `)
    .replace(/\\(leq|le)\b/g, ` ${w.le} `)
    .replace(/\\(geq|ge)\b/g, ` ${w.ge} `)
    .replace(/\\(neq|ne)\b/g, ` ${w.neq} `)
    .replace(/\{,\}/g, ",")
    .replace(/</g, ` ${w.lt} `)
    .replace(/>/g, ` ${w.gt} `)
    .replace(/(^|[=(,]\s*)-/g, `$1 ${w.negative} `)
    .replace(/-/g, ` ${w.minus} `)
    .replace(/\+/g, ` ${w.plus} `)
    .replace(/=/g, ` ${w.equals} `)
    .replace(/\*/g, ` ${w.times} `)
    .replace(/\//g, ` ${w.over} `)
    .replace(/[{}\\]/g, " ");
  return s.replace(/\s+/g, " ").trim();
}

export function textToSpeech(text: string, lang: Lang): string {
  const w = WORDS[lang];
  return text
    .replace(/\$([^$]+)\$/g, (_, tex) => ` ${latexToSpeech(tex, lang)} `)
    .replace(/²/g, ` ${w.sq}`)
    .replace(/³/g, ` ${w.cube}`)
    .replace(/\s+/g, " ")
    .trim();
}

export const ttsSupported = () => typeof window !== "undefined" && "speechSynthesis" in window;

export function speak(text: string, lang: Lang, onEnd?: () => void) {
  if (!ttsSupported()) return;
  const synth = window.speechSynthesis;
  synth.cancel();
  const u = new SpeechSynthesisUtterance(textToSpeech(text, lang));
  u.lang = lang === "id" ? "id-ID" : "en-US";
  const voice = synth.getVoices().find((v) => v.lang.replace("_", "-").toLowerCase().startsWith(lang === "id" ? "id" : "en"));
  if (voice) u.voice = voice;
  if (onEnd) {
    u.onend = onEnd;
    u.onerror = onEnd;
  }
  synth.speak(u);
}

export function stopSpeaking() {
  if (ttsSupported()) window.speechSynthesis.cancel();
}
