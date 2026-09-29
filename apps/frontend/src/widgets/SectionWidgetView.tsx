import { useEffect, useMemo, useRef, useState } from "react";
import { Hexagon } from "lucide-react";
import type { SectionWidget, SolidWidget, Widget } from "../board";
import { buildSolid } from "../geometry/solids";
import { computeSection, type Section } from "../geometry/section";
import { formatNumber, useI18n, type Lang, type TKey } from "../i18n";
import { WidgetFrame } from "./WidgetFrame";

const LABELS = ["P", "Q", "R", "S", "T", "U", "V", "W"];

interface Props {
  widget: SectionWidget;
  solid: SolidWidget | undefined;
  z: number;
  onFocus: () => void;
  onCheckpoint: () => void;
  onChange: (patch: Partial<SectionWidget>) => void;
  onClose: () => void;
}

export function SectionWidgetView({ widget, solid, z, onFocus, onCheckpoint, onChange, onClose }: Props) {
  const { t, lang } = useI18n();
  const hostRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [size, setSize] = useState({ w: 200, h: 160 });
  const section = useMemo(
    () => (solid ? computeSection(buildSolid(solid.solid), solid.picks) : null),
    [solid?.solid, solid?.picks],
  );

  useEffect(() => {
    const el = hostRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setSize({ w: e.contentRect.width, h: e.contentRect.height }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    const dpr = window.devicePixelRatio || 1;
    c.width = Math.round(size.w * dpr);
    c.height = Math.round(size.h * dpr);
    const ctx = c.getContext("2d")!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, size.w, size.h);
    if (section) drawSection(ctx, size.w, size.h, section, lang);
  }, [section, size, lang]);

  return (
    <WidgetFrame
      widget={widget}
      z={z}
      minW={220}
      minH={220}
      icon={<Hexagon size={16} />}
      title={section ? `${t("section")}: ${t(`shape_${section.kind}` as TKey)}` : t("section")}
      onFocus={onFocus}
      onCheckpoint={onCheckpoint}
      onChange={(p: Partial<Widget>) => onChange(p as Partial<SectionWidget>)}
      onClose={onClose}
    >
      <div className="section-layout">
        <div ref={hostRef} className="section-canvas">
          <canvas ref={canvasRef} style={{ width: size.w, height: size.h }} />
          {!section && <div className="solid-hint">{t("markPointsHint")}</div>}
        </div>
        {section && (
          <div className="section-stats">
            <span>
              {t("area")} ≈ <b>{formatNumber(section.area, lang)}</b> {t("units")}²
            </span>
            <span>
              {t("perimeter")} ≈ <b>{formatNumber(section.perimeter, lang)}</b> {t("units")}
            </span>
          </div>
        )}
      </div>
    </WidgetFrame>
  );
}

function drawSection(ctx: CanvasRenderingContext2D, W: number, H: number, s: Section, lang: Lang) {
  const n = s.points2d.length;
  // Putar agar sisi terpanjang menjadi alas mendatar.
  let li = 0;
  s.sides.forEach((len, i) => len > s.sides[li] && (li = i));
  const [a, b] = [s.points2d[li], s.points2d[(li + 1) % n]];
  const th = -Math.atan2(b[1] - a[1], b[0] - a[0]);
  let pts = s.points2d.map(([x, y]) => [x * Math.cos(th) - y * Math.sin(th), x * Math.sin(th) + y * Math.cos(th)]);
  const baseY = pts[li][1];
  if (pts.reduce((acc, p) => acc + p[1], 0) / n < baseY) pts = pts.map(([x, y]) => [x, -y]);

  const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
  const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  const margin = 44;
  const k = Math.min((W - 2 * margin) / (x1 - x0 || 1), (H - 2 * margin) / (y1 - y0 || 1));
  const ox = (W - (x1 - x0) * k) / 2, oy = (H - (y1 - y0) * k) / 2;
  const P = pts.map(([x, y]) => [ox + (x - x0) * k, H - (oy + (y - y0) * k)] as [number, number]);
  const cx = P.reduce((t, p) => t + p[0], 0) / n, cy = P.reduce((t, p) => t + p[1], 0) / n;

  ctx.beginPath();
  P.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
  ctx.closePath();
  ctx.fillStyle = "rgba(58, 134, 255, 0.78)";
  ctx.fill();
  ctx.strokeStyle = "#9cc3ff";
  ctx.lineWidth = 2;
  ctx.stroke();

  ctx.font = "12px Inter, system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  for (let i = 0; i < n; i++) {
    const [x, y] = P[i];
    const prev = P[(i - 1 + n) % n], next = P[(i + 1) % n];
    // busur sudut
    const a1 = Math.atan2(prev[1] - y, prev[0] - x), a2 = Math.atan2(next[1] - y, next[0] - x);
    let diff = a2 - a1;
    while (diff <= -Math.PI) diff += 2 * Math.PI;
    while (diff > Math.PI) diff -= 2 * Math.PI;
    ctx.strokeStyle = "rgba(255,255,255,0.85)";
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.arc(x, y, 14, a1, a1 + diff, diff < 0);
    ctx.stroke();
    // teks sudut (ke arah dalam)
    const dx = cx - x, dy = cy - y, d = Math.hypot(dx, dy) || 1;
    ctx.fillStyle = "#fff";
    ctx.fillText(`${formatNumber(s.angles[i], lang, 1)}°`, x + (dx / d) * 34, y + (dy / d) * 34);
    // label titik (ke arah luar)
    ctx.fillStyle = "#ff8fc0";
    ctx.font = "bold 13px Inter, system-ui, sans-serif";
    ctx.fillText(LABELS[i] ?? "", x - (dx / d) * 16, y - (dy / d) * 16);
    ctx.font = "12px Inter, system-ui, sans-serif";
    // panjang sisi
    const mx = (x + next[0]) / 2, my = (y + next[1]) / 2;
    const ndx = mx - cx, ndy = my - cy, nd = Math.hypot(ndx, ndy) || 1;
    ctx.fillStyle = "rgba(255,255,255,0.7)";
    ctx.fillText(formatNumber(s.sides[i], lang), mx + (ndx / nd) * 14, my + (ndy / nd) * 14);
  }
}
