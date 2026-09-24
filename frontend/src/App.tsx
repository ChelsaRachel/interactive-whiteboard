import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import {
  Box, ChartSpline, Eraser, Languages, Lasso, Loader2, Pen, Redo2, Settings, Sigma, Sparkles, Trash2, Undo2, X,
} from "lucide-react";
import {
  FUNCTION_COLORS, emptyBoard, historyReducer, uid,
  type Action, type FunctionDef, type GraphWidget, type SectionWidget, type SolidWidget, type Widget,
} from "./board";
import { InkCanvas, type Tool } from "./ink/InkCanvas";
import { renderStrokesToPng, splitIntoLines, strokeBBox, unionBBox, type BBox, type Stroke } from "./ink/strokes";
import { GraphWidgetView, DEFAULT_VIEW } from "./widgets/GraphWidgetView";
import { SolidWidgetView } from "./widgets/SolidWidgetView";
import { SectionWidgetView } from "./widgets/SectionWidgetView";
import { initialRotation } from "./widgets/solidScene";
import { FormulaDialog, RecognizeDialog, SolidChooser, type RecognizedItem } from "./components/Dialogs";
import { AiPanel, type ChatMessage } from "./components/AiPanel";
import { api, type AiAction, type Health } from "./api";
import { parseFunction, substituteTex, type ParsedFunction } from "./math/latex";
import { guessSolidFromSketch } from "./geometry/sketch";
import { buildSolid, type SolidType } from "./geometry/solids";
import { computeSection, type EdgePoint } from "./geometry/section";
import { useI18n, type TKey } from "./i18n";

const INK_COLORS = ["#f5f7fa", "#ffd166", "#ff8fab", "#4cc9f0", "#80ed99"];
const SIZES = [3, 5, 8];

type Dialog =
  | { kind: "recognized"; items: RecognizedItem[]; bbox: BBox }
  | { kind: "formula"; mode: "new" | "add" | "edit"; graphId?: string; fnId?: string; initial: string }
  | { kind: "solid"; guess?: SolidType; hint: boolean; bbox?: BBox; strokeIds?: string[] }
  | null;

function readPref(key: string, fallback: string) {
  try {
    return localStorage.getItem(key) ?? fallback;
  } catch {
    return fallback;
  }
}
function writePref(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* abaikan */
  }
}

function clampRect(x: number, y: number, w: number, h: number) {
  const W = window.innerWidth, H = window.innerHeight;
  return { x: Math.round(Math.min(Math.max(x, 72), Math.max(72, W - w - 12))), y: Math.round(Math.min(Math.max(y, 60), Math.max(60, H - h - 12))) };
}

/** Letakkan widget di samping area tertentu (kiri dulu, lalu kanan). */
function placeBeside(b: BBox, w: number, h: number) {
  const y = b.y + b.h / 2 - h / 2;
  if (b.x - w - 24 >= 72) return clampRect(b.x - w - 24, y, w, h);
  return clampRect(b.x + b.w + 24, y, w, h);
}

function placeCenter(w: number, h: number) {
  return clampRect(window.innerWidth / 2 - w / 2, window.innerHeight / 2 - h / 2, w, h);
}

function makeFunction(p: ParsedFunction, index: number, prev?: FunctionDef): FunctionDef {
  const params: Record<string, number> = {};
  for (const name of p.params) params[name] = prev?.params[name] ?? 1;
  return { id: prev?.id ?? uid("f"), latex: p.tex, params, color: prev?.color ?? FUNCTION_COLORS[index % FUNCTION_COLORS.length], visible: true };
}

function makeGraph(parsed: ParsedFunction[], at?: BBox): GraphWidget {
  const w = 520, h = 470 + Math.min(parsed.reduce((n, p) => n + p.params.length, 0), 4) * 28;
  const pos = at ? placeBeside(at, w, h) : placeCenter(w, h);
  return {
    id: uid("g"), kind: "graph", ...pos, w, h,
    functions: parsed.map((p, i) => makeFunction(p, i)),
    view: DEFAULT_VIEW,
    keyPoints: false,
  };
}

export default function App() {
  const { t, lang, setLang } = useI18n();
  const [hist, dispatch] = useReducer(historyReducer, { past: [], present: emptyBoard, future: [] });
  const board = hist.present;
  const [tool, setTool] = useState<Tool>("pen");
  const [color, setColor] = useState(INK_COLORS[0]);
  const [size, setSize] = useState(SIZES[1]);
  const [selected, setSelected] = useState<string[]>([]);
  const [recognizing, setRecognizing] = useState(false);
  const [dialog, setDialog] = useState<Dialog>(null);
  const [health, setHealth] = useState<Health | null>(null);
  const [offline, setOffline] = useState(false);
  const [model, setModel] = useState(() => readPref("papan.model", ""));
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [toast, setToast] = useState<{ text: string; error?: boolean } | null>(null);
  const [aiOpen, setAiOpen] = useState(false);
  const [aiBusy, setAiBusy] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const toastTimer = useRef<number>(0);

  const showToast = useCallback((text: string, error = false) => {
    setToast({ text, error });
    window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 4000);
  }, []);

  // ---- status server ----
  useEffect(() => {
    let alive = true;
    let timer = 0;
    const poll = async () => {
      try {
        const h = await api.health();
        if (!alive) return;
        setHealth(h);
        setOffline(false);
      } catch {
        if (alive) setOffline(true);
      }
      timer = window.setTimeout(poll, 15000);
    };
    poll();
    return () => {
      alive = false;
      window.clearTimeout(timer);
    };
  }, []);
  const activeModel = model && health?.models.some((m) => m.key === model) ? model : health?.default_model ?? undefined;

  // ---- seleksi ----
  const selectedSet = useMemo(() => new Set(selected), [selected]);
  const selectedStrokes = useMemo(() => board.strokes.filter((s) => selectedSet.has(s.id)), [board.strokes, selectedSet]);
  const selectionBox = selectedStrokes.length ? unionBBox(selectedStrokes.map(strokeBBox)) : null;
  useEffect(() => {
    // Buang id yang sudah tidak ada (mis. setelah urungkan).
    if (selected.length && selectedStrokes.length !== selected.length) setSelected(selectedStrokes.map((s) => s.id));
  }, [selected, selectedStrokes]);

  const clearSelection = () => setSelected([]);

  const recognizeSelection = async () => {
    if (!selectionBox || recognizing) return;
    const lines = splitIntoLines(selectedStrokes);
    setRecognizing(true);
    try {
      const items: RecognizedItem[] = [];
      for (const line of lines) items.push(await api.recognize(renderStrokesToPng(line), activeModel));
      setDialog({ kind: "recognized", items, bbox: selectionBox });
    } catch (e) {
      showToast(`${t("recognizeFailed")}: ${(e as Error).message}`, true);
    } finally {
      setRecognizing(false);
    }
  };

  const createSolid = (type: SolidType, bbox?: BBox, removeStrokes?: string[]) => {
    const side = bbox ? Math.min(460, Math.max(320, Math.max(bbox.w, bbox.h) * 1.3)) : 380;
    const w = side, h = side + 64;
    const pos = bbox ? clampRect(bbox.x + bbox.w / 2 - w / 2, bbox.y + bbox.h / 2 - h / 2, w, h) : placeCenter(w, h);
    const widget: SolidWidget = {
      id: uid("b"), kind: "solid", ...pos, w, h,
      solid: type, rotation: initialRotation(), picks: [], sphere: "none", mode: "points", labels: true,
    };
    dispatch({ type: "addWidget", widget, removeStrokes });
    clearSelection();
  };

  const solidFromSelection = () => {
    if (!selectionBox) return;
    const guess = guessSolidFromSketch(selectedStrokes);
    if (guess.confidence >= 0.7) createSolid(guess.type, selectionBox, selected);
    else setDialog({ kind: "solid", guess: guess.type, hint: true, bbox: selectionBox, strokeIds: selected });
  };

  // ---- titik irisan ----
  const onPick = (solid: SolidWidget, p: EdgePoint) => {
    const picks = solid.picks.length >= 3 ? [p] : [...solid.picks, p];
    const actions: Action[] = [{ type: "updateWidget", id: solid.id, patch: { picks } }];
    const hasSection = board.widgets.some((w) => w.kind === "section" && w.solidId === solid.id);
    if (!hasSection && picks.length === 3 && computeSection(buildSolid(solid.solid), picks)) {
      const w = 300, h = 330;
      const section: SectionWidget = { id: uid("i"), kind: "section", solidId: solid.id, w, h, ...placeBeside(solid, w, h) };
      actions.push({ type: "addWidget", widget: section });
    }
    dispatch({ type: "batch", actions });
  };

  // ---- AI ----
  const boardContext = () => ({
    graphs: board.widgets
      .filter((w): w is GraphWidget => w.kind === "graph")
      .map((g) => ({
        graph_id: g.id,
        functions: g.functions.map((f) => {
          let withValues = "";
          try {
            withValues = `y=${substituteTex(parseFunction(f.latex).ast, f.params)}`;
          } catch {
            /* rumus tidak valid */
          }
          return { function_id: f.id, latex: `y=${f.latex}`, params: f.params, with_values: withValues, visible: f.visible };
        }),
      })),
    solids: board.widgets
      .filter((w): w is SolidWidget => w.kind === "solid")
      .map((s) => {
        const solid = buildSolid(s.solid);
        const sec = computeSection(solid, s.picks);
        return {
          solid_id: s.id,
          type: s.solid,
          name: t(`solid_${s.solid}` as TKey),
          vertex_labels: solid.labels,
          dims: solid.dims,
          section_points: s.picks.map((p) => {
            const [a, b] = solid.edges[p.edge];
            return { edge: solid.labels[a] + solid.labels[b], t: +p.t.toFixed(3) };
          }),
          section: sec && {
            shape: t(`shape_${sec.kind}` as TKey),
            vertices: sec.points2d.length,
            angles_deg: sec.angles.map((a) => +a.toFixed(1)),
            sides: sec.sides.map((x) => +x.toFixed(3)),
            area: +sec.area.toFixed(3),
            perimeter: +sec.perimeter.toFixed(3),
          },
          sphere: s.sphere,
        };
      }),
  });

  const applyAiActions = (acts: AiAction[]): number => {
    const graphs = new Map(board.widgets.filter((w): w is GraphWidget => w.kind === "graph").map((g) => [g.id, { ...g, functions: [...g.functions] }]));
    let created: GraphWidget | null = null;
    let count = 0;
    const pickGraph = (id?: string) => (id && graphs.get(id)) || (graphs.size === 1 ? [...graphs.values()][0] : undefined);
    for (const a of acts) {
      try {
        if (a.type === "add_function" && a.latex) {
          const parsed = parseFunction(a.latex);
          const g = a.graph_id === "new" ? undefined : pickGraph(a.graph_id);
          if (g) g.functions.push(makeFunction(parsed, g.functions.length));
          else if (created) created.functions.push(makeFunction(parsed, created.functions.length));
          else created = makeGraph([parsed]);
          count++;
          continue;
        }
        const g = pickGraph(a.graph_id);
        if (!g) continue;
        const idx = g.functions.findIndex((f) => f.id === a.function_id || (!a.function_id && a.param && a.param in f.params));
        if (idx < 0) continue;
        const f = g.functions[idx];
        if (a.type === "set_param" && a.param && typeof a.value === "number") {
          g.functions[idx] = { ...f, params: { ...f.params, [a.param]: a.value } };
          count++;
        } else if (a.type === "update_function" && a.latex) {
          g.functions[idx] = makeFunction(parseFunction(a.latex), idx, f);
          count++;
        } else if (a.type === "remove_function") {
          g.functions.splice(idx, 1);
          count++;
        }
      } catch {
        /* abaikan aksi yang tidak valid */
      }
    }
    const actions: Action[] = [...graphs.values()].map((g) => ({ type: "updateWidget", id: g.id, patch: { functions: g.functions } }));
    if (created) actions.push({ type: "addWidget", widget: created });
    if (count) dispatch({ type: "batch", actions });
    return count;
  };

  const sendToAi = async (text: string) => {
    const next: ChatMessage[] = [...messages, { role: "user", content: text }];
    setMessages(next);
    setAiBusy(true);
    try {
      const res = await api.chat(
        next.filter((m) => !m.error).map((m) => ({ role: m.role, content: m.content })),
        boardContext(),
        lang,
      );
      const applied = applyAiActions(res.actions ?? []);
      setMessages([...next, { role: "assistant", content: res.reply, note: applied ? `✓ ${t("aiApplied")}` : undefined }]);
    } catch (e) {
      setMessages([...next, { role: "assistant", content: `${t("aiError")}: ${(e as Error).message}`, error: true }]);
    } finally {
      setAiBusy(false);
    }
  };

  // ---- dialog rumus ----
  const onFormulaConfirm = (p: ParsedFunction) => {
    if (dialog?.kind !== "formula") return;
    if (dialog.mode === "new") dispatch({ type: "addWidget", widget: makeGraph([p]) });
    else {
      const g = board.widgets.find((w): w is GraphWidget => w.id === dialog.graphId && w.kind === "graph");
      if (g) {
        const functions =
          dialog.mode === "add"
            ? [...g.functions, makeFunction(p, g.functions.length)]
            : g.functions.map((f, i) => (f.id === dialog.fnId ? makeFunction(p, i, f) : f));
        dispatch({ type: "updateWidget", id: g.id, patch: { functions }, record: true });
      }
    }
    setDialog(null);
  };

  // ---- pintasan keyboard ----
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (el.closest("input, textarea, select") || dialog) return;
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key.toLowerCase() === "z") {
        e.preventDefault();
        dispatch({ type: e.shiftKey ? "redo" : "undo" });
      } else if (mod && e.key.toLowerCase() === "y") {
        e.preventDefault();
        dispatch({ type: "redo" });
      } else if (!mod && e.key === "p") setTool("pen");
      else if (!mod && e.key === "e") setTool("eraser");
      else if (!mod && e.key === "l") setTool("lasso");
      else if ((e.key === "Delete" || e.key === "Backspace") && selected.length) {
        dispatch({ type: "removeStrokes", ids: selected });
        clearSelection();
      } else if (e.key === "Escape") clearSelection();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [dialog, selected]);

  const updateWidget = (id: string, patch: Partial<Widget>, record = false) => dispatch({ type: "updateWidget", id, patch, record });
  const common = (w: Widget, i: number) => ({
    z: i,
    onFocus: () => dispatch({ type: "focus", id: w.id }),
    onCheckpoint: () => dispatch({ type: "checkpoint" }),
    onClose: () => dispatch({ type: "removeWidget", id: w.id }),
  });

  const selectionBar = selectionBox && tool === "lasso" && (
    <div
      className="selection-bar"
      style={{
        left: Math.min(Math.max(selectionBox.x + selectionBox.w / 2, 190), window.innerWidth - 190),
        top: selectionBox.y > 90 ? selectionBox.y - 14 : selectionBox.y + selectionBox.h + 58,
      }}
    >
      {recognizing ? (
        <span className="chip busy">
          <Loader2 size={15} className="spin" /> {t("recognizing")}
        </span>
      ) : (
        <>
          <button className="chip primary" onClick={recognizeSelection} disabled={offline}>
            <ChartSpline size={15} /> {t("toGraph")}
          </button>
          <button className="chip" onClick={solidFromSelection}>
            <Box size={15} /> {t("toSolid")}
          </button>
          <button
            className="chip"
            onClick={() => {
              dispatch({ type: "removeStrokes", ids: selected });
              clearSelection();
            }}
          >
            <Trash2 size={15} /> {t("delete")}
          </button>
          <button className="chip ghost" onClick={clearSelection} title={t("cancel")}>
            <X size={15} />
          </button>
        </>
      )}
    </div>
  );

  const boardEmpty = !board.strokes.length && !board.widgets.length;

  return (
    <div className="app">
      <InkCanvas
        strokes={board.strokes}
        tool={tool}
        color={color}
        size={size}
        selected={selectedSet}
        onAddStroke={(s: Stroke) => dispatch({ type: "addStroke", stroke: s })}
        onErase={(ids) => dispatch({ type: "removeStrokes", ids })}
        onLasso={setSelected}
      />

      {boardEmpty && (
        <div className="welcome">
          <h1>{t("welcomeTitle")}</h1>
          <p>{t("welcomeBody")}</p>
        </div>
      )}

      {selectionBox && (
        <div
          className="selection-box"
          style={{ left: selectionBox.x - 10, top: selectionBox.y - 10, width: selectionBox.w + 20, height: selectionBox.h + 20 }}
        />
      )}
      {selectionBar}

      {board.widgets.map((w, i) => {
        if (w.kind === "graph")
          return (
            <GraphWidgetView
              key={w.id}
              widget={w}
              {...common(w, i)}
              onChange={(patch, record) => updateWidget(w.id, patch, record)}
              onAddFunction={() => setDialog({ kind: "formula", mode: "add", graphId: w.id, initial: "" })}
              onEditFunction={(fnId) => {
                const f = w.functions.find((x) => x.id === fnId);
                setDialog({ kind: "formula", mode: "edit", graphId: w.id, fnId, initial: f ? `y = ${f.latex}` : "" });
              }}
            />
          );
        if (w.kind === "solid")
          return (
            <SolidWidgetView
              key={w.id}
              widget={w}
              {...common(w, i)}
              onChange={(patch, record) => updateWidget(w.id, patch, record)}
              onPick={(p) => onPick(w, p)}
            />
          );
        return (
          <SectionWidgetView
            key={w.id}
            widget={w}
            solid={board.widgets.find((x): x is SolidWidget => x.id === w.solidId && x.kind === "solid")}
            {...common(w, i)}
            onChange={(patch) => updateWidget(w.id, patch)}
          />
        );
      })}

      <nav className="toolbar" onPointerDown={(e) => e.stopPropagation()}>
        <ToolButton icon={<Pen size={20} />} label={t("pen")} active={tool === "pen"} onClick={() => (setTool("pen"), clearSelection())} />
        <ToolButton icon={<Eraser size={20} />} label={t("eraser")} active={tool === "eraser"} onClick={() => (setTool("eraser"), clearSelection())} />
        <ToolButton icon={<Lasso size={20} />} label={t("lasso")} active={tool === "lasso"} onClick={() => setTool("lasso")} />
        {tool === "pen" && (
          <div className="tool-options">
            {INK_COLORS.map((c) => (
              <button key={c} className={`swatch ${c === color ? "active" : ""}`} style={{ background: c }} title={t("color")} onClick={() => setColor(c)} />
            ))}
            <div className="sizes">
              {SIZES.map((s) => (
                <button key={s} className={`size ${s === size ? "active" : ""}`} title={t("thickness")} onClick={() => setSize(s)}>
                  <span style={{ width: s + 2, height: s + 2 }} />
                </button>
              ))}
            </div>
          </div>
        )}
        <hr />
        <ToolButton icon={<Sigma size={20} />} label={t("typeFormula")} onClick={() => setDialog({ kind: "formula", mode: "new", initial: "" })} />
        <ToolButton icon={<Box size={20} />} label={t("insertSolid")} onClick={() => setDialog({ kind: "solid", hint: false })} />
        <hr />
        <ToolButton icon={<Undo2 size={20} />} label={t("undo")} disabled={!hist.past.length} onClick={() => dispatch({ type: "undo" })} />
        <ToolButton icon={<Redo2 size={20} />} label={t("redo")} disabled={!hist.future.length} onClick={() => dispatch({ type: "redo" })} />
        <ToolButton
          icon={<Trash2 size={20} />}
          label={t("clearBoard")}
          disabled={boardEmpty}
          onClick={() => {
            if (window.confirm(t("clearConfirm"))) {
              dispatch({ type: "clear" });
              clearSelection();
            }
          }}
        />
      </nav>

      <div className="topbar" onPointerDown={(e) => e.stopPropagation()}>
        {offline && <span className="status offline">{t("backendOffline")}</span>}
        <div className="lang-toggle" role="group" aria-label={t("language")}>
          <Languages size={16} />
          {(["id", "en"] as const).map((l) => (
            <button key={l} className={lang === l ? "active" : ""} onClick={() => setLang(l)}>
              {l.toUpperCase()}
            </button>
          ))}
        </div>
        <div className="settings-wrap">
          <button className={`icon-btn lg ${settingsOpen ? "active" : ""}`} title={t("settings")} onClick={() => setSettingsOpen((v) => !v)}>
            <Settings size={18} />
          </button>
          {settingsOpen && (
            <div className="popover">
              <div className="popover-title">{t("recognizerModel")}</div>
              {(health?.models ?? []).map((m) => (
                <label key={m.key} className="radio">
                  <input
                    type="radio"
                    name="model"
                    checked={activeModel === m.key}
                    onChange={() => {
                      setModel(m.key);
                      writePref("papan.model", m.key);
                    }}
                  />
                  {m.key === "texteller" ? t("modelTexteller") : m.key === "pix2text" ? t("modelPix2text") : m.name}
                </label>
              ))}
              {health && (
                <div className="muted small">
                  AI: {health.ai.model} {health.ai.configured ? "✓" : "✗"}
                </div>
              )}
            </div>
          )}
        </div>
        <button className={`btn ai-btn ${aiOpen ? "active" : ""}`} onClick={() => setAiOpen((v) => !v)}>
          <Sparkles size={16} /> {t("ai")}
        </button>
      </div>

      {aiOpen && (
        <AiPanel
          messages={messages}
          busy={aiBusy}
          configured={!!health?.ai.configured}
          onSend={sendToAi}
          onClose={() => setAiOpen(false)}
        />
      )}

      {dialog?.kind === "recognized" && (
        <RecognizeDialog
          items={dialog.items}
          onCancel={() => setDialog(null)}
          onConfirm={(parsed) => {
            dispatch({ type: "addWidget", widget: makeGraph(parsed, dialog.bbox) });
            setDialog(null);
            clearSelection();
          }}
        />
      )}
      {dialog?.kind === "formula" && (
        <FormulaDialog
          title={dialog.mode === "edit" ? t("edit") : dialog.mode === "add" ? t("addFunction") : t("formulaTitle")}
          initial={dialog.initial}
          confirmLabel={dialog.mode === "edit" ? t("save") : dialog.mode === "add" ? t("add") : t("plot")}
          onCancel={() => setDialog(null)}
          onConfirm={onFormulaConfirm}
        />
      )}
      {dialog?.kind === "solid" && (
        <SolidChooser
          guess={dialog.guess}
          hint={dialog.hint}
          onCancel={() => setDialog(null)}
          onChoose={(type) => {
            createSolid(type, dialog.bbox, dialog.strokeIds);
            setDialog(null);
          }}
        />
      )}

      {toast && <div className={`toast ${toast.error ? "error" : ""}`}>{toast.text}</div>}
    </div>
  );
}

function ToolButton({ icon, label, active, disabled, onClick }: { icon: React.ReactNode; label: string; active?: boolean; disabled?: boolean; onClick: () => void }) {
  return (
    <button className={`tool-btn ${active ? "active" : ""}`} title={label} aria-label={label} disabled={disabled} onClick={onClick}>
      {icon}
    </button>
  );
}
