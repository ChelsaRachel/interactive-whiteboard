import { useEffect, useRef, useState } from "react";
import { Loader2, Send, Sparkles, X } from "lucide-react";
import { useI18n } from "../i18n";
import { RichText } from "./Tex";

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  note?: string; // mis. "Perubahan diterapkan"
  error?: boolean;
}

interface Props {
  messages: ChatMessage[];
  busy: boolean;
  configured: boolean;
  onSend: (text: string) => void;
  onClose: () => void;
}

export function AiPanel({ messages, busy, configured, onSend, onClose }: Props) {
  const { t } = useI18n();
  const [text, setText] = useState("");
  const listRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, busy]);

  const send = (v: string) => {
    const s = v.trim();
    if (!s || busy) return;
    onSend(s);
    setText("");
  };

  return (
    <aside className="ai-panel" onPointerDown={(e) => e.stopPropagation()}>
      <header>
        <span className="widget-title">
          <Sparkles size={16} /> {t("aiTitle")}
        </span>
        <button className="icon-btn" title={t("close")} onClick={onClose}>
          <X size={16} />
        </button>
      </header>
      <div className="ai-messages" ref={listRef}>
        {!configured && <div className="ai-msg assistant error">{t("aiNotConfigured")}</div>}
        {messages.length === 0 && (
          <div className="ai-welcome">
            <p>{t("aiWelcome")}</p>
            {(["aiSuggest1", "aiSuggest2", "aiSuggest3"] as const).map((k) => (
              <button key={k} className="chip" disabled={!configured || busy} onClick={() => send(t(k))}>
                {t(k)}
              </button>
            ))}
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i} className={`ai-msg ${m.role} ${m.error ? "error" : ""}`}>
            <RichText text={m.content} />
            {m.note && <div className="ai-note">{m.note}</div>}
          </div>
        ))}
        {busy && (
          <div className="ai-msg assistant muted">
            <Loader2 size={14} className="spin" /> {t("aiThinking")}
          </div>
        )}
      </div>
      <form
        className="ai-input"
        onSubmit={(e) => {
          e.preventDefault();
          send(text);
        }}
      >
        <input value={text} disabled={!configured} placeholder={t("aiPlaceholder")} onChange={(e) => setText(e.target.value)} />
        <button className="icon-btn primary" disabled={!configured || busy || !text.trim()} title={t("aiSend")}>
          <Send size={16} />
        </button>
      </form>
    </aside>
  );
}
