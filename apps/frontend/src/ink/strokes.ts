import { getStroke } from "perfect-freehand";

export type InkPoint = [number, number, number]; // x, y, tekanan

export interface Stroke {
  id: string;
  points: InkPoint[];
  color: string;
  size: number;
  pen: boolean; // true = tekanan asli dari stylus
}

export interface BBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

export function strokeOutline(stroke: Pick<Stroke, "points" | "size" | "pen">, sizeOverride?: number): number[][] {
  return getStroke(stroke.points, {
    size: sizeOverride ?? stroke.size,
    thinning: stroke.pen ? 0.6 : 0.45,
    smoothing: 0.5,
    streamline: 0.45,
    simulatePressure: !stroke.pen,
    last: true,
  });
}

export function outlineToPath(outline: number[][]): Path2D {
  const path = new Path2D();
  if (!outline.length) return path;
  path.moveTo(outline[0][0], outline[0][1]);
  for (let i = 1; i < outline.length; i++) {
    const [x0, y0] = outline[i];
    const [x1, y1] = outline[(i + 1) % outline.length];
    path.quadraticCurveTo(x0, y0, (x0 + x1) / 2, (y0 + y1) / 2);
  }
  path.closePath();
  return path;
}

const pathCache = new WeakMap<Stroke, Path2D>();

export function strokePath(stroke: Stroke): Path2D {
  let p = pathCache.get(stroke);
  if (!p) {
    p = outlineToPath(strokeOutline(stroke));
    pathCache.set(stroke, p);
  }
  return p;
}

export function strokeBBox(s: Pick<Stroke, "points">): BBox {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const [x, y] of s.points) {
    if (x < x0) x0 = x;
    if (y < y0) y0 = y;
    if (x > x1) x1 = x;
    if (y > y1) y1 = y;
  }
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

export function unionBBox(boxes: BBox[]): BBox {
  const x0 = Math.min(...boxes.map((b) => b.x));
  const y0 = Math.min(...boxes.map((b) => b.y));
  const x1 = Math.max(...boxes.map((b) => b.x + b.w));
  const y1 = Math.max(...boxes.map((b) => b.y + b.h));
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

export function pointInPolygon(x: number, y: number, poly: [number, number][]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

export function strokesInLasso(strokes: Stroke[], lasso: [number, number][]): string[] {
  if (lasso.length < 3) return [];
  return strokes
    .filter((s) => {
      const inside = s.points.filter(([x, y]) => pointInPolygon(x, y, lasso)).length;
      return inside / s.points.length >= 0.6;
    })
    .map((s) => s.id);
}

export function strokesHit(strokes: Stroke[], x: number, y: number, radius: number): string[] {
  return strokes
    .filter((s) => {
      const r = radius + s.size / 2;
      const b = strokeBBox(s);
      if (x < b.x - r || x > b.x + b.w + r || y < b.y - r || y > b.y + b.h + r) return false;
      for (let i = 0; i < s.points.length; i++) {
        const [ax, ay] = s.points[i];
        const [bx, by] = s.points[Math.min(i + 1, s.points.length - 1)];
        if (distToSegment(x, y, ax, ay, bx, by) <= r) return true;
      }
      return false;
    })
    .map((s) => s.id);
}

function distToSegment(px: number, py: number, ax: number, ay: number, bx: number, by: number) {
  const dx = bx - ax, dy = by - ay;
  const len2 = dx * dx + dy * dy;
  const t = len2 ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2)) : 0;
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

/** Pisahkan goresan terpilih menjadi baris-baris rumus berdasarkan posisi vertikal. */
export function splitIntoLines(strokes: Stroke[]): Stroke[][] {
  if (!strokes.length) return [];
  const items = strokes.map((s) => ({ s, b: strokeBBox(s) }));
  const heights = items.map((i) => i.b.h).sort((a, b) => a - b);
  const median = heights[Math.floor(heights.length / 2)] || 20;
  items.sort((a, b) => a.b.y - b.b.y);
  const lines: { y0: number; y1: number; strokes: Stroke[] }[] = [];
  for (const it of items) {
    const last = lines[lines.length - 1];
    if (last && it.b.y <= last.y1 + 0.15 * median) {
      last.y1 = Math.max(last.y1, it.b.y + it.b.h);
      last.strokes.push(it.s);
    } else {
      lines.push({ y0: it.b.y, y1: it.b.y + it.b.h, strokes: [it.s] });
    }
  }
  return lines.map((l) => l.strokes);
}

/** Gambar goresan (hitam di atas putih) ke PNG untuk dikirim ke model pengenal rumus. */
export function renderStrokesToPng(strokes: Stroke[], targetHeight = 110): string {
  const box = unionBBox(strokes.map(strokeBBox));
  const scale = Math.min(targetHeight / Math.max(box.h, 1), 1800 / Math.max(box.w, 1), 3);
  const pad = 24;
  const canvas = document.createElement("canvas");
  canvas.width = Math.ceil(box.w * scale + pad * 2);
  canvas.height = Math.ceil(box.h * scale + pad * 2);
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#000";
  for (const s of strokes) {
    const pts: InkPoint[] = s.points.map(([x, y, p]) => [(x - box.x) * scale + pad, (y - box.y) * scale + pad, p]);
    const size = Math.max(3, Math.min(7, s.size * scale * 0.9));
    ctx.fill(outlineToPath(strokeOutline({ points: pts, size, pen: s.pen }, size)));
  }
  return canvas.toDataURL("image/png");
}
