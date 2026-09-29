import { useEffect, useMemo, useRef } from "react";
import { Box, Circle, CircleDot, Crosshair, Grid2X2, RotateCw, Ruler, Tag, Trash2 } from "lucide-react";
import type { SolidWidget, Widget } from "../board";
import {
  buildSolid, DEFAULT_DIMS, DIM_KEY_LABELS, DIM_LIMITS, sphereOptions,
  solidSurfaceArea, solidVolume, type SolidType,
} from "../geometry/solids";
import {
  CURVED_MODES, computeSection, computeCurvedSection, defaultCurvedSpec,
  type EdgePoint, type Section,
} from "../geometry/section";
import { formatNumber, useI18n, type TKey } from "../i18n";
import { WidgetFrame } from "./WidgetFrame";
import { SolidScene, rotateBy } from "./solidScene";

interface Props {
  widget: SolidWidget;
  z: number;
  onFocus: () => void;
  onCheckpoint: () => void;
  onChange: (patch: Partial<SolidWidget>, record?: boolean) => void;
  onClose: () => void;
  onPick: (p: EdgePoint) => void;
}

const CURVED_LIKE: SolidType[] = ["sphere", "cylinder", "cone"];

export function effectiveDims(w: SolidWidget): Record<string, number> {
  const base = DEFAULT_DIMS[w.solid];
  return w.dimsOverride ? { ...base, ...w.dimsOverride } : base;
}

export function solidTitle(w: SolidWidget, t: (k: TKey) => string, lang: "id" | "en") {
  const solid = buildSolid(w.solid, effectiveDims(w));
  const name = t(`solid_${w.solid}` as TKey);
  const notation = notationFor(w.solid, solid.labels);
  const dims = Object.entries(solid.dims)
    .map(([k, v]) => `${dimLetter(k, w.solid)} = ${formatNumber(v, lang)}`)
    .join(", ");
  return `${name}${notation ? ` ${notation}` : ""} · ${dims}`;
}

function notationFor(type: SolidType, labels: string[]) {
  switch (type) {
    case "cube":
    case "cuboid": return `${labels.slice(0, 4).join("")}.${labels.slice(4).join("")}`;
    case "triPrism": return `${labels.slice(0, 3).join("")}.${labels.slice(3).join("")}`;
    case "squarePyramid":
    case "triPyramid": return `T.${labels.filter((l) => l !== "T").join("")}`;
    default: return "";
  }
}

function dimLetter(key: string, type: SolidType): string {
  if (key === "a" && type === "triPrism") return "a";
  if (key === "a") return "a";
  if (key === "t" && (type === "cylinder" || type === "cone")) return "t";
  return key;
}

export function SolidWidgetView({ widget, z, onFocus, onCheckpoint, onChange, onClose, onPick }: Props) {
  const { t, lang } = useI18n();
  const hostRef = useRef<HTMLDivElement>(null);
  const labelRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<SolidScene | null>(null);
  const dims = useMemo(() => effectiveDims(widget), [widget.dimsOverride, widget.solid]);
  const solid = useMemo(() => buildSolid(widget.solid, dims), [widget.solid, dims]);
  const isCurved = !!solid.curved.kind;
  const curvedSpec = widget.curvedSection ?? (isCurved ? defaultCurvedSpec(solid.curved.kind!) : null);
  const section: Section | null = useMemo(() => {
    if (isCurved) return curvedSpec ? computeCurvedSection(solid, curvedSpec) : null;
    return computeSection(solid, widget.picks);
  }, [isCurved, solid, widget.picks, curvedSpec?.mode, curvedSpec?.offset, curvedSpec?.angle]);
  const spheres = sphereOptions(widget.solid);
  const latest = useRef(widget);
  latest.current = widget;
  const volume = solidVolume(solid);
  const area = solidSurfaceArea(solid);

  useEffect(() => {
    const host = hostRef.current!, labels = labelRef.current!;
    const scene = new SolidScene(labels);
    host.prepend(scene.renderer.domElement);
    sceneRef.current = scene;
    const ro = new ResizeObserver(([e]) => {
      scene.resize(e.contentRect.width, e.contentRect.height);
      scene.render(latest.current.labels);
    });
    ro.observe(host);
    return () => {
      ro.disconnect();
      scene.dispose();
      scene.renderer.domElement.remove();
      sceneRef.current = null;
    };
  }, []);

  useEffect(() => {
    const s = sceneRef.current;
    if (!s) return;
    s.setSolid(solid);
    s.setSphere(widget.sphere);
    s.setPicks(isCurved ? [] : widget.picks, section);
    s.setNet(widget.netAmount ?? 0);
    s.setRotation(widget.rotation);
    s.render(widget.labels);
  }, [solid, widget.sphere, widget.picks, section, widget.rotation, widget.labels, widget.netAmount, isCurved]);

  const drag = useRef<{ id: number; x: number; y: number; moved: number } | null>(null);
  const onPointerDown = (e: React.PointerEvent) => {
    e.stopPropagation();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    drag.current = { id: e.pointerId, x: e.clientX, y: e.clientY, moved: 0 };
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    const dx = e.clientX - d.x, dy = e.clientY - d.y;
    if (d.moved < 4 && d.moved + Math.hypot(dx, dy) >= 4) onCheckpoint();
    d.moved += Math.hypot(dx, dy);
    if (d.moved < 4) return;
    d.x = e.clientX;
    d.y = e.clientY;
    onChange({ rotation: rotateBy(latest.current.rotation, dx, dy) });
  };
  const onPointerUp = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    drag.current = null;
    if (d.moved < 4 && widget.mode === "points" && !isCurved && sceneRef.current) {
      const r = hostRef.current!.getBoundingClientRect();
      const p = sceneRef.current.pickEdge(e.clientX - r.left, e.clientY - r.top);
      if (p) onPick(p);
    }
  };

  const patchDim = (key: string, value: number) =>
    onChange({ dimsOverride: { ...(widget.dimsOverride ?? {}), [key]: value } });

  const patchCurved = (patch: Partial<{ mode: any; offset: number; angle: number }>) => {
    const cur = curvedSpec ?? defaultCurvedSpec(solid.curved.kind!);
    onChange({ curvedSection: { ...cur, ...patch } });
  };

  return (
    <WidgetFrame
      widget={widget}
      z={z}
      minW={280}
      minH={320}
      icon={<Box size={16} />}
      title={solidTitle(widget, t, lang)}
      onFocus={onFocus}
      onCheckpoint={onCheckpoint}
      onChange={(p: Partial<Widget>) => onChange(p as Partial<SolidWidget>)}
      onClose={onClose}
      className="solid-widget"
    >
      <div className="solid-layout">
        <div
          ref={hostRef}
          className={`solid-host mode-${widget.mode}`}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={() => (drag.current = null)}
        >
          <div ref={labelRef} className="solid-labels" />
          {widget.mode === "points" && !isCurved && widget.picks.length < 3 && (
            <div className="solid-hint">
              {t("markPointsHint")} ({widget.picks.length}/3)
            </div>
          )}
        </div>

        <div className="solid-stats">
          <span>V ≈ <b>{formatNumber(volume, lang)}</b> {t("units")}³</span>
          <span>{t("surfaceArea")} ≈ <b>{formatNumber(area, lang)}</b> {t("units")}²</span>
        </div>

        <div className="solid-toolbar">
          <button className={`chip ${widget.mode === "rotate" ? "active" : ""}`} onClick={() => onChange({ mode: "rotate" })}>
            <RotateCw size={15} /> {t("rotate")}
          </button>
          {!isCurved && (
            <button className={`chip ${widget.mode === "points" ? "active" : ""}`} onClick={() => onChange({ mode: "points" })}>
              <Crosshair size={15} /> {t("markPoints")}
            </button>
          )}
          {!isCurved && widget.picks.length > 0 && (
            <button className="chip" onClick={() => onChange({ picks: [] }, true)}>
              <Trash2 size={15} /> {t("resetPoints")}
            </button>
          )}
          {spheres.inner && (
            <button className={`chip ${widget.sphere === "in" ? "active" : ""}`} onClick={() => onChange({ sphere: widget.sphere === "in" ? "none" : "in" }, true)}>
              <CircleDot size={15} /> {t("innerSphere")}
            </button>
          )}
          {spheres.outer && (
            <button className={`chip ${widget.sphere === "out" ? "active" : ""}`} onClick={() => onChange({ sphere: widget.sphere === "out" ? "none" : "out" }, true)}>
              <Circle size={15} /> {t("outerSphere")}
            </button>
          )}
          <button className={`chip ${widget.labels ? "active" : ""}`} onClick={() => onChange({ labels: !widget.labels })}>
            <Tag size={15} /> {t("labels")}
          </button>
          {!isCurved && solid.faces.length > 0 && (
            <button
              className={`chip ${(widget.netAmount ?? 0) > 0.05 ? "active" : ""}`}
              onClick={() => onChange({ netAmount: (widget.netAmount ?? 0) > 0.05 ? 0 : 1 }, true)}
            >
              <Grid2X2 size={15} /> {t("net")}
            </button>
          )}
        </div>

        {!isCurved && (widget.netAmount ?? 0) > 0 && (
          <div className="solid-net-slider">
            <span>{t("netFold")}</span>
            <input
              type="range"
              min={0}
              max={1}
              step={0.02}
              value={widget.netAmount ?? 0}
              onPointerDown={(e) => (e.stopPropagation(), onCheckpoint())}
              onChange={(e) => onChange({ netAmount: parseFloat(e.target.value) })}
            />
          </div>
        )}

        <details className="solid-sliders" onPointerDown={(e) => e.stopPropagation()}>
          <summary><Ruler size={14} /> {t("sizes")}</summary>
          <div className="slider-list">
            {Object.entries(dims).map(([key, value]) => {
              const [lo, hi, step] = DIM_LIMITS[key] ?? [0.5, 12, 0.5];
              const labelKey = DIM_KEY_LABELS[key] ?? "edgeLength";
              return (
                <label key={key} className="param-row">
                  <span className="param-name">{t(labelKey as TKey)} <i>{dimLetter(key, widget.solid)}</i></span>
                  <input
                    type="range" min={lo} max={hi} step={step} value={value}
                    onPointerDown={(e) => (e.stopPropagation(), onCheckpoint())}
                    onChange={(e) => patchDim(key, parseFloat(e.target.value))}
                  />
                  <span className="param-value">{formatNumber(value, lang, 2)}</span>
                </label>
              );
            })}
          </div>
        </details>

        {isCurved && (
          <details className="solid-sliders" open onPointerDown={(e) => e.stopPropagation()}>
            <summary><Crosshair size={14} /> {t("sectionMode")}</summary>
            <div className="chip-row">
              {CURVED_MODES[solid.curved.kind!].map((m) => (
                <button
                  key={m}
                  className={`chip sm ${curvedSpec?.mode === m ? "active" : ""}`}
                  onClick={() => patchCurved({ mode: m })}
                >
                  {t(`sectionMode_${m}` as TKey)}
                </button>
              ))}
            </div>
            <div className="slider-list">
              <label className="param-row">
                <span className="param-name">{t("sectionOffset")}</span>
                <input
                  type="range" min={0} max={1} step={0.02}
                  value={curvedSpec?.offset ?? 0.5}
                  onPointerDown={(e) => (e.stopPropagation(), onCheckpoint())}
                  onChange={(e) => patchCurved({ offset: parseFloat(e.target.value) })}
                />
                <span className="param-value">{formatNumber(curvedSpec?.offset ?? 0.5, lang, 2)}</span>
              </label>
              {(curvedSpec?.mode === "oblique" || curvedSpec?.mode === "throughApex") && (
                <label className="param-row">
                  <span className="param-name">{t("sectionAngle")}</span>
                  <input
                    type="range" min={0} max={1} step={0.02}
                    value={curvedSpec?.angle ?? 0.4}
                    onPointerDown={(e) => (e.stopPropagation(), onCheckpoint())}
                    onChange={(e) => patchCurved({ angle: parseFloat(e.target.value) })}
                  />
                  <span className="param-value">{formatNumber(curvedSpec?.angle ?? 0.4, lang, 2)}</span>
                </label>
              )}
            </div>
          </details>
        )}
      </div>
    </WidgetFrame>
  );
}

export function isCurvedSolid(type: SolidType) {
  return CURVED_LIKE.includes(type);
}
