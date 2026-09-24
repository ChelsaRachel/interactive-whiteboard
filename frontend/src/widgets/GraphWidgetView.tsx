import { useEffect, useMemo, useRef, useState } from "react";
import { ChartSpline, Eye, EyeOff, Maximize2, Pencil, Plus, Target, Trash2, ZoomIn, ZoomOut } from "lucide-react";
import type { FunctionDef, GraphWidget, Widget } from "../board";
import { compile, parseFunction, type CompiledFn } from "../math/latex";
import { findKeyPoints, type KeyPoint } from "../math/analysis";
import { formatNumber, useI18n, type Lang } from "../i18n";
import { Tex } from "../components/Tex";
import { WidgetFrame } from "./WidgetFrame";

interface Props {
  widget: GraphWidget;
  z: number;
  onFocus: () => void;
  onCheckpoint: () => void;
  onChange: (patch: Partial<GraphWidget>, record?: boolean) => void;
  onClose: () => void;
  onEditFunction: (fnId: string) => void;
  onAddFunction: () => void;
}

export const DEFAULT_VIEW = { cx: 0, cy: 0, ppu: 36 };

export function GraphWidgetView({ widget, z, onFocus, onCheckpoint, onChange, onClose, onEditFunction, onAddFunction }: Props) {
  const { t, lang } = useI18n();
  const plotRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [size, setSize] = useState({ w: 300, h: 200 });

  const compiled = useMemo(() => {
    const m = new Map<string, CompiledFn | null>();
    for (const f of widget.functions) {
      try {
        m.set(f.id, compile(parseFunction(f.latex).ast));
      } catch {
        m.set(f.id, null);
      }
    }
    return m;
  }, [widget.functions.map((f) => f.latex).join("|")]);

  useEffect(() => {
    const el = plotRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      const r = entry.contentRect;
      setSize({ w: Math.max(50, r.width), h: Math.max(50, r.height) });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(size.w * dpr);
    canvas.height = Math.round(size.h * dpr);
    const ctx = canvas.getContext("2d")!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const fns = widget.functions
      .filter((f) => f.visible && compiled.get(f.id))
      .map((f) => ({ f: compiled.get(f.id)!, def: f }));
    drawPlot(ctx, size.w, size.h, widget.view, fns, widget.keyPoints, lang);
  }, [size, widget.view, widget.functions, widget.keyPoints, compiled, lang]);

  // ---- geser & zoom ----
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef<{ dist: number; ppu: number } | null>(null);

  const setView = (v: Partial<GraphWidget["view"]>) => onChange({ view: { ...widget.view, ...v } });

  const zoomAt = (factor: number, px?: number, py?: number) => {
    const { cx, cy, ppu } = widget.view;
    const nppu = Math.min(2000, Math.max(2, ppu * factor));
    const ox = px ?? size.w / 2, oy = py ?? size.h / 2;
    const wx = cx + (ox - size.w / 2) / ppu;
    const wy = cy - (oy - size.h / 2) / ppu;
    setView({ ppu: nppu, cx: wx - (ox - size.w / 2) / nppu, cy: wy + (oy - size.h / 2) / nppu });
  };

  const onPointerDown = (e: React.PointerEvent) => {
    e.stopPropagation();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    if (!pointers.current.size) onCheckpoint();
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      gesture.current = { dist: Math.hypot(a.x - b.x, a.y - b.y), ppu: widget.view.ppu };
    }
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const prev = pointers.current.get(e.pointerId);
    if (!prev) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 1) {
      const { ppu, cx, cy } = widget.view;
      setView({ cx: cx - (e.clientX - prev.x) / ppu, cy: cy + (e.clientY - prev.y) / ppu });
    } else if (pointers.current.size === 2 && gesture.current) {
      const [a, b] = [...pointers.current.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      setView({ ppu: Math.min(2000, Math.max(2, (gesture.current.ppu * d) / gesture.current.dist)) });
    }
  };
  const onPointerUp = (e: React.PointerEvent) => {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) gesture.current = null;
  };

  useEffect(() => {
    const el = plotRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const r = el.getBoundingClientRect();
      zoomAt(Math.exp(-e.deltaY * 0.0015), e.clientX - r.left, e.clientY - r.top);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  });

  const updateFn = (id: string, patch: Partial<FunctionDef>, record = false) =>
    onChange({ functions: widget.functions.map((f) => (f.id === id ? { ...f, ...patch } : f)) }, record);

  return (
    <WidgetFrame
      widget={widget}
      z={z}
      minW={300}
      minH={260}
      icon={<ChartSpline size={16} />}
      title={t("graph")}
      onFocus={onFocus}
      onCheckpoint={onCheckpoint}
      onChange={(p: Partial<Widget>) => onChange(p as Partial<GraphWidget>)}
      onClose={onClose}
      actions={
        <>
          <button className="icon-btn" title={t("addFunction")} onClick={onAddFunction}><Plus size={16} /></button>
          <button
            className={`icon-btn ${widget.keyPoints ? "active" : ""}`}
            title={t("keyPoints")}
            onClick={() => onChange({ keyPoints: !widget.keyPoints }, true)}
          >
            <Target size={16} />
          </button>
          <button className="icon-btn" title={t("zoomIn")} onClick={() => zoomAt(1.25)}><ZoomIn size={16} /></button>
          <button className="icon-btn" title={t("zoomOut")} onClick={() => zoomAt(0.8)}><ZoomOut size={16} /></button>
          <button className="icon-btn" title={t("resetView")} onClick={() => onChange({ view: DEFAULT_VIEW }, true)}><Maximize2 size={16} /></button>
        </>
      }
    >
      <div className="graph-layout">
        <div
          ref={plotRef}
          className="graph-plot"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        >
          <canvas ref={canvasRef} style={{ width: size.w, height: size.h }} />
        </div>
        <div className="graph-panel">
          {widget.functions.map((f) => (
            <div key={f.id} className={`fn-row ${compiled.get(f.id) ? "" : "invalid"}`}>
              <div className="fn-head">
                <span className="fn-dot" style={{ background: f.color }} />
                <Tex tex={`y = ${f.latex}`} className="fn-tex" />
                <span className="fn-actions">
                  <button className="icon-btn sm" title={f.visible ? t("hide") : t("show")} onClick={() => updateFn(f.id, { visible: !f.visible }, true)}>
                    {f.visible ? <Eye size={14} /> : <EyeOff size={14} />}
                  </button>
                  <button className="icon-btn sm" title={t("edit")} onClick={() => onEditFunction(f.id)}><Pencil size={14} /></button>
                  <button
                    className="icon-btn sm"
                    title={t("delete")}
                    onClick={() => onChange({ functions: widget.functions.filter((x) => x.id !== f.id) }, true)}
                  >
                    <Trash2 size={14} />
                  </button>
                </span>
              </div>
              {Object.entries(f.params).map(([name, value]) => {
                const lo = Math.min(-10, Math.floor(value)), hi = Math.max(10, Math.ceil(value));
                return (
                  <label key={name} className="param-row">
                    <Tex tex={name.replace(/_(\w+)/, "_{$1}")} className="param-name" />
                    <input
                      type="range"
                      min={lo}
                      max={hi}
                      step={0.1}
                      value={value}
                      style={{ accentColor: f.color }}
                      onPointerDown={(e) => {
                        e.stopPropagation();
                        onCheckpoint();
                      }}
                      onChange={(e) => updateFn(f.id, { params: { ...f.params, [name]: parseFloat(e.target.value) } })}
                    />
                    <span className="param-value">{formatNumber(value, lang, 1)}</span>
                  </label>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </WidgetFrame>
  );
}

function niceStep(raw: number) {
  const e = Math.floor(Math.log10(raw));
  const f = raw / 10 ** e;
  return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * 10 ** e;
}

function drawPlot(
  ctx: CanvasRenderingContext2D,
  W: number,
  H: number,
  view: GraphWidget["view"],
  fns: { f: CompiledFn; def: FunctionDef }[],
  showKeyPoints: boolean,
  lang: Lang,
) {
  const { cx, cy, ppu } = view;
  const xmin = cx - W / 2 / ppu, xmax = cx + W / 2 / ppu;
  const ymin = cy - H / 2 / ppu, ymax = cy + H / 2 / ppu;
  const X = (x: number) => (x - xmin) * ppu;
  const Y = (y: number) => H - (y - ymin) * ppu;
  ctx.clearRect(0, 0, W, H);

  const step = niceStep(46 / ppu);
  const minor = step / 5;
  ctx.lineWidth = 1;
  // garis kisi kecil
  ctx.strokeStyle = "rgba(255,255,255,0.045)";
  ctx.beginPath();
  for (let x = Math.ceil(xmin / minor) * minor; x <= xmax; x += minor) {
    ctx.moveTo(Math.round(X(x)) + 0.5, 0);
    ctx.lineTo(Math.round(X(x)) + 0.5, H);
  }
  for (let y = Math.ceil(ymin / minor) * minor; y <= ymax; y += minor) {
    ctx.moveTo(0, Math.round(Y(y)) + 0.5);
    ctx.lineTo(W, Math.round(Y(y)) + 0.5);
  }
  ctx.stroke();
  // garis kisi utama
  ctx.strokeStyle = "rgba(255,255,255,0.13)";
  ctx.beginPath();
  for (let x = Math.ceil(xmin / step) * step; x <= xmax; x += step) {
    ctx.moveTo(Math.round(X(x)) + 0.5, 0);
    ctx.lineTo(Math.round(X(x)) + 0.5, H);
  }
  for (let y = Math.ceil(ymin / step) * step; y <= ymax; y += step) {
    ctx.moveTo(0, Math.round(Y(y)) + 0.5);
    ctx.lineTo(W, Math.round(Y(y)) + 0.5);
  }
  ctx.stroke();
  // sumbu
  const ax = Math.min(Math.max(X(0), 0), W), ay = Math.min(Math.max(Y(0), 0), H);
  ctx.strokeStyle = "rgba(255,255,255,0.7)";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(0, Math.round(ay) + 0.5);
  ctx.lineTo(W, Math.round(ay) + 0.5);
  ctx.moveTo(Math.round(ax) + 0.5, 0);
  ctx.lineTo(Math.round(ax) + 0.5, H);
  ctx.stroke();
  // label angka
  ctx.fillStyle = "rgba(255,255,255,0.6)";
  ctx.font = "11px Inter, system-ui, sans-serif";
  const digits = Math.max(0, -Math.floor(Math.log10(step)));
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  for (let x = Math.ceil(xmin / step) * step; x <= xmax; x += step) {
    if (Math.abs(x) < step / 2) continue;
    ctx.fillText(formatNumber(x, lang, digits), X(x), Math.min(ay + 4, H - 14));
  }
  ctx.textAlign = "right";
  ctx.textBaseline = "middle";
  for (let y = Math.ceil(ymin / step) * step; y <= ymax; y += step) {
    if (Math.abs(y) < step / 2) continue;
    ctx.fillText(formatNumber(y, lang, digits), Math.max(ax - 5, 28), Y(y));
  }
  ctx.textAlign = "left";
  ctx.font = "italic 13px 'KaTeX_Math', serif";
  ctx.fillStyle = "rgba(255,255,255,0.8)";
  ctx.fillText("x", W - 14, Math.min(ay - 10, H - 10));
  ctx.fillText("y", Math.min(ax + 6, W - 12), 10);

  // kurva
  const samples = Math.ceil(W * 2);
  for (const { f, def } of fns) {
    ctx.strokeStyle = def.color;
    ctx.lineWidth = 2.6;
    ctx.lineJoin = "round";
    ctx.beginPath();
    let pen = false;
    let prevY = 0;
    for (let i = 0; i <= samples; i++) {
      const x = xmin + ((xmax - xmin) * i) / samples;
      const y = f(x, def.params);
      if (!Number.isFinite(y)) {
        pen = false;
        continue;
      }
      const py = Y(y);
      if (pen && Math.abs(py - prevY) > H * 1.5) pen = false; // asimtot tegak
      if (!pen) ctx.moveTo(X(x), Math.max(-1e4, Math.min(1e4, py)));
      else ctx.lineTo(X(x), Math.max(-1e4, Math.min(1e4, py)));
      pen = true;
      prevY = py;
    }
    ctx.stroke();
  }

  if (!showKeyPoints) return;
  ctx.font = "12px Inter, system-ui, sans-serif";
  for (const { f, def } of fns) {
    const pts: KeyPoint[] = findKeyPoints((x) => f(x, def.params), xmin, xmax);
    for (const p of pts) {
      if (p.y < ymin || p.y > ymax) continue;
      const px = X(p.x), py = Y(p.y);
      ctx.fillStyle = def.color;
      ctx.strokeStyle = "#fff";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(px, py, 4.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      const sep = lang === "id" ? "; " : ", ";
      const label = `(${formatNumber(p.x, lang)}${sep}${formatNumber(p.y, lang)})`;
      ctx.fillStyle = "rgba(15,20,28,0.8)";
      const tw = ctx.measureText(label).width;
      const lx = Math.min(px + 8, W - tw - 8), ly = py - 20;
      ctx.fillRect(lx - 4, ly - 2, tw + 8, 17);
      ctx.fillStyle = "#fff";
      ctx.textBaseline = "top";
      ctx.fillText(label, lx, ly);
      ctx.textBaseline = "alphabetic";
    }
  }
}
