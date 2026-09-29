import katex from "katex";
import { useMemo } from "react";

export function Tex({ tex, display = false, className }: { tex: string; display?: boolean; className?: string }) {
  const html = useMemo(() => {
    try {
      return katex.renderToString(tex, { displayMode: display, throwOnError: false, strict: false });
    } catch {
      return tex;
    }
  }, [tex, display]);
  return <span className={className} dangerouslySetInnerHTML={{ __html: html }} />;
}

/** Teks biasa dengan potongan $...$ yang dirender sebagai matematika (untuk jawaban AI). */
export function RichText({ text }: { text: string }) {
  const parts = useMemo(() => text.split(/(\$[^$]+\$)/g), [text]);
  return (
    <>
      {parts.map((p, i) =>
        p.startsWith("$") && p.endsWith("$") && p.length > 2 ? <Tex key={i} tex={p.slice(1, -1)} /> : <span key={i}>{p}</span>,
      )}
    </>
  );
}
