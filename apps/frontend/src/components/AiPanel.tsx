import { useEffect, useRef, useState } from "react";
import { History, Loader2, Mic, Plus, Send, Sparkles, Trash2, Volume2, VolumeX, X } from "lucide-react";
import { useI18n } from "../i18n";
import type { ChatSessionSummary } from "../api";
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
  sessions: ChatSessionSummary[];
  currentSessionId: string | null;
  historyBusy: boolean;
  configured: boolean;
  onSend: (text: string) => void;
  onNewSession: () => void;
  onSelectSession: (id: string) => void;
  onDeleteSession: (id: string) => void;
  onClose: () => void;
  mic?: { listening: boolean; onToggle: () => void };
  speakingIdx: number | null;
  onSpeak: (index: number, text: string) => void;
}

export function AiPanel({
  messages, busy, sessions, currentSessionId, historyBusy, configured, onSend,
  onNewSession, onSelectSession, onDeleteSession, onClose, mic, speakingIdx, onSpeak,
}: Props) {
  const { t, lang } = useI18n();
  const [text, setText] = useState("");
  const [historyOpen, setHistoryOpen] = useState(false);
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
        <div className="ai-header-actions">
          <button className={`icon-btn ${historyOpen ? "active" : ""}`} title={t("aiHistory")} onClick={() => setHistoryOpen((v) => !v)}>
            <History size={16} />
          </button>
          <button
            className="icon-btn"
            title={t("aiNewChat")}
            disabled={busy}
            onClick={() => {
              onNewSession();
              setHistoryOpen(false);
            }}
          >
            <Plus size={16} />
          </button>
          <button className="icon-btn" title={t("close")} onClick={onClose}>
            <X size={16} />
          </button>
        </div>
      </header>
      {historyOpen && (
        <section className="ai-history" aria-label={t("aiHistory")}>
          <div className="ai-history-title">
            <strong>{t("aiHistory")}</strong>
            {historyBusy && <Loader2 size={14} className="spin" />}
          </div>
          {!historyBusy && sessions.length === 0 && <div className="ai-history-empty">{t("aiNoHistory")}</div>}
          <div className="ai-session-list">
            {sessions.map((session) => (
              <button
                key={session.id}
                className={`ai-session ${session.id === currentSessionId ? "active" : ""}`}
                disabled={busy || historyBusy}
                onClick={() => {
                  onSelectSession(session.id);
                  setHistoryOpen(false);
                }}
              >
                <span className="ai-session-copy">
                  <strong>{session.title}</strong>
                  <small>
                    {new Intl.DateTimeFormat(lang === "id" ? "id-ID" : "en-US", { dateStyle: "medium", timeStyle: "short" }).format(new Date(session.updated_at))}
                    {` · ${session.message_count} ${t("aiMessages")}`}
                  </small>
                </span>
                <span
                  className="ai-session-delete"
                  role="button"
                  tabIndex={0}
                  title={t("aiDeleteSession")}
                  onClick={(e) => {
                    e.stopPropagation();
                    onDeleteSession(session.id);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      e.stopPropagation();
                      onDeleteSession(session.id);
                    }
                  }}
                >
                  <Trash2 size={14} />
                </span>
              </button>
            ))}
          </div>
        </section>
      )}
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
            {m.role === "assistant" && !m.error && (
              <button
                className={`icon-btn sm speak-btn ${speakingIdx === i ? "active" : ""}`}
                title={speakingIdx === i ? t("stopReading") : t("readAloud")}
                onClick={() => onSpeak(i, m.content)}
              >
                {speakingIdx === i ? <VolumeX size={14} /> : <Volume2 size={14} />}
              </button>
            )}
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
        {mic && (
          <button
            type="button"
            className={`icon-btn ${mic.listening ? "listening" : ""}`}
            title={t("voice")}
            onClick={mic.onToggle}
          >
            <Mic size={16} />
          </button>
        )}
        <input value={text} disabled={!configured} placeholder={t("aiPlaceholder")} onChange={(e) => setText(e.target.value)} />
        <button className="icon-btn primary" disabled={!configured || busy || !text.trim()} title={t("aiSend")}>
          <Send size={16} />
        </button>
      </form>
    </aside>
  );
}
