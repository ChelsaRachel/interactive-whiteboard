import { useEffect, useMemo, useRef } from "react";
import { Box, Circle, CircleDot, Crosshair, RotateCw, Tag, Trash2 } from "lucide-react";
import type { SolidWidget, Widget } from "../board";
import { buildSolid, sphereOptions } from "../geometry/solids";
import { computeSection, type EdgePoint } from "../geometry/section";
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

export function solidTitle(w: SolidWidget, t: (k: TKey) => string, lang: "id" | "en") {
  const solid = buildSolid(w.solid);
  const name = t(`solid_${w.solid}` as TKey);
  const tops = solid.labels;
  const notation =
    w.solid === "cube" || w.solid === "cuboid"
      ? `${tops.slice(0, 4).join("")}.${tops.slice(4).join("")}`
      : w.solid === "triPrism"
        ? `${tops.slice(0, 3).join("")}.${tops.slice(3).join("")}`
        : `T.${tops.filter((l) => l !== "T").join("")}`;
  const dims = Object.entries(solid.dims)
    .map(([k, v]) => `${k === "a" ? t("edgeLength") : k} = ${formatNumber(v, lang)}`)
    .join(", ");
  return `${name} ${notation} · ${dims}`;
}

export function SolidWidgetView({ widget, z, onFocus, onCheckpoint, onChange, onClose, onPick }: Props) {
  const { t, lang } = useI18n();
  const hostRef = useRef<HTMLDivElement>(null);
  const labelRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<SolidScene | null>(null);
  const solid = useMemo(() => buildSolid(widget.solid), [widget.solid]);
  const section = useMemo(() => computeSection(solid, widget.picks), [solid, widget.picks]);
  const spheres = sphereOptions(widget.solid);
  const latest = useRef(widget);
  latest.current = widget;

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
    s.setPicks(widget.picks, section);
    s.setRotation(widget.rotation);
    s.render(widget.labels);
  }, [solid, widget.sphere, widget.picks, section, widget.rotation, widget.labels]);

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
    if (d.moved < 4 && widget.mode === "points" && sceneRef.current) {
      const r = hostRef.current!.getBoundingClientRect();
      const p = sceneRef.current.pickEdge(e.clientX - r.left, e.clientY - r.top);
      if (p) onPick(p);
    }
  };

  return (
    <WidgetFrame
      widget={widget}
      z={z}
      minW={260}
      minH={260}
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
          {widget.mode === "points" && widget.picks.length < 3 && (
            <div className="solid-hint">
              {t("markPointsHint")} ({widget.picks.length}/3)
            </div>
          )}
        </div>
        <div className="solid-toolbar">
          <button className={`chip ${widget.mode === "rotate" ? "active" : ""}`} onClick={() => onChange({ mode: "rotate" })}>
            <RotateCw size={15} /> {t("rotate")}
          </button>
          <button className={`chip ${widget.mode === "points" ? "active" : ""}`} onClick={() => onChange({ mode: "points" })}>
            <Crosshair size={15} /> {t("markPoints")}
          </button>
          {widget.picks.length > 0 && (
            <button className="chip" onClick={() => onChange({ picks: [] }, true)}>
              <Trash2 size={15} /> {t("resetPoints")}
            </button>
          )}
          {spheres.inner && (
            <button
              className={`chip ${widget.sphere === "in" ? "active" : ""}`}
              onClick={() => onChange({ sphere: widget.sphere === "in" ? "none" : "in" }, true)}
            >
              <CircleDot size={15} /> {t("innerSphere")}
            </button>
          )}
          {spheres.outer && (
            <button
              className={`chip ${widget.sphere === "out" ? "active" : ""}`}
              onClick={() => onChange({ sphere: widget.sphere === "out" ? "none" : "out" }, true)}
            >
              <Circle size={15} /> {t("outerSphere")}
            </button>
          )}
          <button className={`chip ${widget.labels ? "active" : ""}`} onClick={() => onChange({ labels: !widget.labels })}>
            <Tag size={15} /> {t("labels")}
          </button>
        </div>
      </div>
    </WidgetFrame>
  );
}
