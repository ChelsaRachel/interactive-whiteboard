import { useEffect, useRef, useState } from "react";
import {
  outlineToPath, strokePath, strokeOutline, strokesHit, strokesInLasso, type InkPoint, type Stroke,
} from "./strokes";
import { uid } from "../board";

export type Tool = "pen" | "eraser" | "lasso";

interface Props {
  strokes: Stroke[];
  tool: Tool;
  color: string;
  size: number;
  selected: Set<string>;
  onAddStroke: (s: Stroke) => void;
  onErase: (ids: string[]) => void;
  onLasso: (ids: string[]) => void;
}

export function InkCanvas({ strokes, tool, color, size, selected, onAddStroke, onErase, onLasso }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [dims, setDims] = useState({ w: window.innerWidth, h: window.innerHeight });
  const live = useRef<{
    pointerId: number;
    points: InkPoint[];
    pen: boolean;
    erased: Set<string>;
    lasso: [number, number][];
  } | null>(null);
  const lastPenAt = useRef(0);
  const frame = useRef(0);
  const propsRef = useRef({ strokes, selected, color, size, tool });
  propsRef.current = { strokes, selected, color, size, tool };

  useEffect(() => {
    const onResize = () => setDims({ w: window.innerWidth, h: window.innerHeight });
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const draw = () => {
    frame.current = 0;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d")!;
    const dpr = window.devicePixelRatio || 1;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const { strokes, selected, color, size } = propsRef.current;
    const cur = live.current;
    for (const s of strokes) {
      const path = strokePath(s);
      const pendingErase = cur?.erased.has(s.id);
      if (selected.has(s.id)) {
        ctx.save();
        ctx.shadowColor = "rgba(76, 201, 240, 0.9)";
        ctx.shadowBlur = 10;
        ctx.fillStyle = s.color;
        ctx.fill(path);
        ctx.restore();
      } else {
        ctx.globalAlpha = pendingErase ? 0.2 : 1;
        ctx.fillStyle = s.color;
        ctx.fill(path);
        ctx.globalAlpha = 1;
      }
    }
    if (cur && cur.points.length && propsRef.current.tool === "pen") {
      ctx.fillStyle = color;
      ctx.fill(outlineToPath(strokeOutline({ points: cur.points, size, pen: cur.pen })));
    }
    if (cur && cur.lasso.length > 1) {
      ctx.save();
      ctx.setLineDash([6, 6]);
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = "rgba(76, 201, 240, 0.95)";
      ctx.fillStyle = "rgba(76, 201, 240, 0.08)";
      ctx.beginPath();
      cur.lasso.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }
  };

  const schedule = () => {
    if (!frame.current) frame.current = requestAnimationFrame(draw);
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(dims.w * dpr);
    canvas.height = Math.round(dims.h * dpr);
    schedule();
  }, [dims]);

  useEffect(schedule, [strokes, selected, color, size, tool]);

  const pos = (e: PointerEvent | React.PointerEvent): InkPoint => {
    const r = canvasRef.current!.getBoundingClientRect();
    const pressure = e.pointerType === "pen" ? Math.max(0.05, e.pressure) : 0.5;
    return [e.clientX - r.left, e.clientY - r.top, pressure];
  };

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (e.button !== 0 && e.pointerType === "mouse") return;
    if (e.pointerType === "pen") lastPenAt.current = Date.now();
    // Tolak telapak tangan: abaikan sentuhan jari saat stylus baru dipakai.
    if (e.pointerType === "touch" && Date.now() - lastPenAt.current < 1500) return;
    if (live.current) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    const p = pos(e);
    live.current = { pointerId: e.pointerId, points: [p], pen: e.pointerType === "pen", erased: new Set(), lasso: [] };
    if (tool === "eraser") strokesHit(strokes, p[0], p[1], 10).forEach((id) => live.current!.erased.add(id));
    if (tool === "lasso") live.current.lasso.push([p[0], p[1]]);
    schedule();
  };

  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const cur = live.current;
    if (!cur || cur.pointerId !== e.pointerId) return;
    if (e.pointerType === "pen") lastPenAt.current = Date.now();
    const events = typeof e.nativeEvent.getCoalescedEvents === "function" ? e.nativeEvent.getCoalescedEvents() : [];
    const list = events.length ? events : [e.nativeEvent];
    for (const ev of list) {
      const p = pos(ev);
      if (tool === "pen") cur.points.push(p);
      else if (tool === "eraser") strokesHit(strokes, p[0], p[1], 10).forEach((id) => cur.erased.add(id));
      else cur.lasso.push([p[0], p[1]]);
    }
    schedule();
  };

  const finish = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const cur = live.current;
    if (!cur || cur.pointerId !== e.pointerId) return;
    live.current = null;
    if (tool === "pen" && cur.points.length) {
      const points = cur.points.length === 1 ? [cur.points[0], [cur.points[0][0] + 0.5, cur.points[0][1] + 0.5, cur.points[0][2]] as InkPoint] : cur.points;
      onAddStroke({ id: uid("s"), points, color, size, pen: cur.pen });
    } else if (tool === "eraser" && cur.erased.size) {
      onErase([...cur.erased]);
    } else if (tool === "lasso") {
      onLasso(strokesInLasso(strokes, cur.lasso));
    }
    schedule();
  };

  return (
    <canvas
      ref={canvasRef}
      className={`ink-canvas tool-${tool}`}
      style={{ width: dims.w, height: dims.h }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={finish}
      onPointerCancel={finish}
    />
  );
}
