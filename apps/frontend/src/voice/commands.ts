// Menafsirkan ucapan (hasil pengenal suara) menjadi perintah papan, tanpa LLM.
// Hanya ucapan yang tidak dikenali (mis. pertanyaan) yang diteruskan ke asisten AI.

import type { SolidType } from "../geometry/solids";

export type VoiceIntent =
  | { type: "formula"; text: string }
  | { type: "tool"; tool: "pen" | "eraser" | "lasso" }
  | { type: "undo" }
  | { type: "redo" }
  | { type: "clear" }
  | { type: "solid"; solid: SolidType }
  | { type: "sphere"; kind: "in" | "out" | "none" }
  | { type: "resetPoints" }
  | { type: "rotate"; dx: number; dy: number }
  | { type: "keyPoints" }
  | { type: "zoom"; factor: number }
  | { type: "stop" }
  | { type: "ask"; text: string };

const QUESTION = /\b(apa|apakah|bagaimana|gimana|jelaskan|terangkan|kenapa|mengapa|berapa|kapan|siapa|what|how|why|explain|which|when|where|who)\b/;

function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/[“”"']/g, "")
    .replace(/[.!?;:]+(\s|$)/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// ---------- angka dalam kata ----------

const ID_DIGITS: Record<string, number> = {
  nol: 0, kosong: 0, satu: 1, dua: 2, tiga: 3, empat: 4, lima: 5, enam: 6, tujuh: 7, delapan: 8, sembilan: 9,
};
const EN_NUMBERS: Record<string, number> = {
  zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18,
  nineteen: 19, twenty: 20, thirty: 30, forty: 40, fifty: 50, hundred: 100,
};

function numberWordsToDigits(s: string): string {
  const d = Object.keys(ID_DIGITS).join("|");
  return s
    .replace(new RegExp(`\\b(${d}) puluh (${d})\\b`, "g"), (_, a, b) => String(ID_DIGITS[a] * 10 + ID_DIGITS[b]))
    .replace(new RegExp(`\\b(${d}) puluh\\b`, "g"), (_, a) => String(ID_DIGITS[a] * 10))
    .replace(new RegExp(`\\b(${d}) belas\\b`, "g"), (_, a) => String(10 + ID_DIGITS[a]))
    .replace(/\bsepuluh\b/g, "10")
    .replace(/\bsebelas\b/g, "11")
    .replace(/\bseratus\b/g, "100")
    .replace(/\bsetengah\b/g, "0.5")
    .replace(new RegExp(`\\b(${d})\\b`, "g"), (_, a) => String(ID_DIGITS[a]))
    .replace(/\bhalf\b/g, "0.5")
    .replace(new RegExp(`\\b(${Object.keys(EN_NUMBERS).join("|")})\\b`, "g"), (w) => String(EN_NUMBERS[w]))
    .replace(/(\d)\s*(koma|point)\s*(\d)/g, "$1.$3")
    .replace(/(\d),(\d)/g, "$1.$2");
}

/** Ubah rumus yang didiktekan menjadi teks rumus biasa. Mengembalikan null bila tidak ada tanda rumus. */
export function spokenToFormula(raw: string): string | null {
  let s = normalize(raw);
  const lead = /^(tolong |coba |please )?(gambarkan|gambar|plot|buatkan|buat|tampilkan|draw|graph|show)( grafik| fungsi| the graph of| the function| graph of| function)?( dari| of)? /;
  const hadVerb = lead.test(s);
  s = s.replace(lead, "");
  s = s.replace(/^(f dari x|f of x|f\(x\)|f x|fx|ye|why)\b/, "y");
  const cue = /^y\s*(=|sama dengan|equals|is equal to|equal to)/.test(s);
  if (!cue && !(hadVerb && /\b(x|eks|ex)\b/.test(s))) return null;

  s = numberWordsToDigits(s);
  const rules: [RegExp, string][] = [
    [/\bsama dengan\b|\bis equal to\b|\bequal to\b|\bequals\b/g, " = "],
    [/\bkurung buka\b|\bopen (bracket|parenthesis)\b/g, " ( "],
    [/\bkurung tutup\b|\bclose (bracket|parenthesis)\b/g, " ) "],
    [/\bpangkat dua\b|\bkuadrat\b|\bsquared\b/g, " ^2 "],
    [/\bpangkat tiga\b|\bkubik\b|\bcubed\b/g, " ^3 "],
    [/\bpangkat\b|\bto the power of\b|\braised to\b|\bpower\b/g, " ^ "],
    [/\bakar kuadrat\b|\bakar\b|\bsquare root of\b|\bsquare root\b|\broot of\b/g, " sqrt "],
    [/\bdibagi\b|\bbagi\b|\bper\b|\bdivided by\b|\bover\b/g, " / "],
    [/\bdikalikan\b|\bdikali\b|\bkali\b|\btimes\b|\bmultiplied by\b/g, " * "],
    [/\bditambah\b|\btambah\b|\bplus\b/g, " + "],
    [/\bdikurangi\b|\bdikurang\b|\bkurang\b|\bminus\b|\bmin\b|\bnegatif\b|\bnegative\b/g, " - "],
    [/\bsinus\b|\bsine\b/g, " sin "],
    [/\bkosinus\b|\bcosinus\b|\bcosine\b/g, " cos "],
    [/\btangen\b|\btangent\b/g, " tan "],
    [/\blogaritma\b|\blogarithm\b/g, " log "],
    [/\beks\b|\bex\b/g, " x "],
    [/\bdari\b|\bof\b|\bthe\b/g, " "],
  ];
  for (const [re, rep] of rules) s = s.replace(re, rep);
  return s.replace(/\s+/g, " ").trim();
}

// ---------- perintah ----------

const VERB = /\b(buat|buatkan|tampilkan|gambar|gambarkan|tambah|tambahkan|sisipkan|create|make|draw|add|insert|show)\b/;

function solidFrom(s: string): SolidType | null {
  if (/\blimas segitiga\b|\btriangular pyramid\b|\btetrahedron\b/.test(s)) return "triPyramid";
  if (/\blimas\b|\bpyramid\b/.test(s)) return "squarePyramid";
  if (/\bbalok\b|\bcuboid\b|\brectangular prism\b|\bbox\b/.test(s)) return "cuboid";
  if (/\bprisma\b|\bprism\b/.test(s)) return "triPrism";
  if (/\bkubus\b|\bcube\b/.test(s)) return "cube";
  return null;
}

export function interpretVoice(raw: string): VoiceIntent {
  const s = normalize(raw);
  const isQuestion = QUESTION.test(s) || raw.trim().endsWith("?");
  if (!isQuestion) {
    const formula = spokenToFormula(raw);
    if (formula) return { type: "formula", text: formula };
  }
  const short = s.split(" ").length <= 6;
  if (isQuestion || !short) return { type: "ask", text: raw.trim() };

  if (/^(diam|berhenti|stop|cukup|quiet|be quiet)$/.test(s)) return { type: "stop" };
  if (/^(urungkan|batalkan|undo|kembalikan)\b/.test(s)) return { type: "undo" };
  if (/^(ulangi|redo)\b/.test(s)) return { type: "redo" };
  if (/\b(hapus|bersihkan) (papan|semua)\b|\bclear (the )?board\b|\bclear all\b/.test(s)) return { type: "clear" };
  if (/^(pena|pulpen|mode tulis|tulis|pen)$/.test(s)) return { type: "tool", tool: "pen" };
  if (/^(penghapus|mode hapus|eraser)$/.test(s)) return { type: "tool", tool: "eraser" };
  if (/^(laso|pilih|mode pilih|lasso|select)$/.test(s)) return { type: "tool", tool: "lasso" };
  if (/\b(hilangkan|hapus|sembunyikan|tanpa) bola\b|\b(remove|hide) (the )?sphere\b|\bno sphere\b/.test(s)) return { type: "sphere", kind: "none" };
  if (/\bbola dalam\b|\b(inscribed|inner) sphere\b/.test(s)) return { type: "sphere", kind: "in" };
  if (/\bbola luar\b|\b(circumscribed|outer) sphere\b/.test(s)) return { type: "sphere", kind: "out" };
  if (/\b(hapus|reset|bersihkan) titik\b|\b(clear|reset) (the )?points\b/.test(s)) return { type: "resetPoints" };
  if (/\bputar\b|\brotate\b|\bturn\b/.test(s)) {
    if (/\bkiri\b|\bleft\b/.test(s)) return { type: "rotate", dx: -50, dy: 0 };
    if (/\batas\b|\bup\b/.test(s)) return { type: "rotate", dx: 0, dy: -50 };
    if (/\bbawah\b|\bdown\b/.test(s)) return { type: "rotate", dx: 0, dy: 50 };
    return { type: "rotate", dx: 50, dy: 0 };
  }
  if (/\btitik penting\b|\bkey points\b/.test(s)) return { type: "keyPoints" };
  if (/\bperbesar\b|\bzoom in\b/.test(s)) return { type: "zoom", factor: 1.5 };
  if (/\bperkecil\b|\bzoom out\b/.test(s)) return { type: "zoom", factor: 1 / 1.5 };
  const solid = solidFrom(s);
  if (solid && VERB.test(s)) return { type: "solid", solid };
  return { type: "ask", text: raw.trim() };
}
