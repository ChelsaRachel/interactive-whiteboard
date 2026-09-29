// Pengenal sketsa bangun ruang berbasis aturan geometri (tanpa training).
// Deteksi ekstra untuk bentuk lengkung (lingkaran/elips → bola, tabung, atau kerucut).

import type { SolidType } from "./solids";

type P = [number, number];

export interface SketchGuess {
  type: SolidType;
  confidence: number;
  alternatives?: SolidType[];
}

function rdp(points: P[], eps: number): P[] {
  if (points.length < 3) return points;
  const [ax, ay] = points[0];
  const [bx, by] = points[points.length - 1];
  if (Math.hypot(bx - ax, by - ay) < eps) {
    let far = 0, fd = 0;
    points.forEach(([x, y], i) => {
      const d = Math.hypot(x - ax, y - ay);
      if (d > fd) [fd, far] = [d, i];
    });
    if (fd < eps) return [points[0]];
    const left = rdp(points.slice(0, far + 1), eps);
    const right = rdp(points.slice(far), eps);
    return [...left.slice(0, -1), ...right];
  }
  const dx = bx - ax, dy = by - ay;
  const len = Math.hypot(dx, dy) || 1;
  let maxD = 0, idx = 0;
  for (let i = 1; i < points.length - 1; i++) {
    const [px, py] = points[i];
    const d = Math.abs(dy * px - dx * py + bx * ay - by * ax) / len;
    if (d > maxD) { maxD = d; idx = i; }
  }
  if (maxD <= eps) return [points[0], points[points.length - 1]];
  const left = rdp(points.slice(0, idx + 1), eps);
  const right = rdp(points.slice(idx), eps);
  return [...left.slice(0, -1), ...right];
}

/**
 * Uji apakah suatu goresan berupa kurva tertutup mulus (mendekati elips/lingkaran).
 * Kriteria: goresan panjang, hampir tertutup, dan setelah RDP menghasilkan ≥8 segmen pendek
 * dengan luas terpayungi cukup besar dibanding panjang goresan.
 */
function isClosedCurve(pts: P[]): { closed: boolean; cx: number; cy: number; rx: number; ry: number } {
  if (pts.length < 12) return { closed: false, cx: 0, cy: 0, rx: 0, ry: 0 };
  const [ax, ay] = pts[0], [bx, by] = pts[pts.length - 1];
  const gap = Math.hypot(bx - ax, by - ay);
  let perimeter = 0;
  for (let i = 1; i < pts.length; i++) perimeter += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
  if (perimeter === 0 || gap > perimeter * 0.2) return { closed: false, cx: 0, cy: 0, rx: 0, ry: 0 };
  const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
  const [xmin, xmax] = [Math.min(...xs), Math.max(...xs)];
  const [ymin, ymax] = [Math.min(...ys), Math.max(...ys)];
  const rx = (xmax - xmin) / 2, ry = (ymax - ymin) / 2;
  if (rx < 8 || ry < 4) return { closed: false, cx: 0, cy: 0, rx: 0, ry: 0 };
  const cx = (xmax + xmin) / 2, cy = (ymax + ymin) / 2;
  // Uji kelayakan elips: sebagian besar titik ada di dekat |((x-cx)/rx)² + ((y-cy)/ry)²| ≈ 1.
  let good = 0;
  for (const [x, y] of pts) {
    const t = ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2;
    if (t > 0.6 && t < 1.4) good++;
  }
  if (good < pts.length * 0.7) return { closed: false, cx, cy, rx, ry };
  return { closed: true, cx, cy, rx, ry };
}

export function guessSolidFromSketch(strokes: { points: [number, number, number][] }[]): SketchGuess {
  const all = strokes.flatMap((s) => s.points.map(([x, y]) => [x, y] as P));
  if (all.length < 4) return { type: "cube", confidence: 0 };
  const xs = all.map((p) => p[0]), ys = all.map((p) => p[1]);
  const bboxW = Math.max(...xs) - Math.min(...xs), bboxH = Math.max(...ys) - Math.min(...ys);
  const diag = Math.hypot(bboxW, bboxH) || 1;

  // Deteksi setiap goresan sebagai kurva tertutup atau tidak.
  const curves = strokes
    .map((s) => isClosedCurve(s.points.map(([x, y]) => [x, y] as P)))
    .filter((c) => c.closed);
  const closedIndices = new Set<number>();
  strokes.forEach((stroke, i) => {
    const c = isClosedCurve(stroke.points.map(([x, y]) => [x, y] as P));
    if (c.closed) closedIndices.add(i);
  });

  // --- Bangun lengkung ---
  if (curves.length >= 1) {
    const openStrokes = strokes.filter((_stroke, i) => !closedIndices.has(i));
    // 2 elips sejajar vertikal → tabung.
    if (curves.length >= 2) {
      const sorted = [...curves].sort((a, b) => a.cy - b.cy);
      const top = sorted[0], bot = sorted[sorted.length - 1];
      const alignedX = Math.abs(top.cx - bot.cx) < top.rx * 0.5;
      const stacked = Math.abs(top.cy - bot.cy) > (top.ry + bot.ry) * 1.2;
      if (alignedX && stacked) return { type: "cylinder", confidence: 0.85, alternatives: ["cone", "sphere"] };
    }
    // 1 elips + garis-garis menuju ke satu titik di atas/bawah elips → kerucut.
    if (curves.length === 1 && openStrokes.length >= 1) {
      const ell = curves[0];
      // Apakah ada goresan yang bertumpu di dekat pinggir elips dan berujung di titik yang jauh?
      let convergesAbove = false, convergesBelow = false;
      for (const s of openStrokes) {
        const pts = s.points;
        if (pts.length < 2) continue;
        const [x0, y0] = pts[0], [x1, y1] = pts[pts.length - 1];
        const nearRimStart = Math.abs(Math.hypot((x0 - ell.cx) / ell.rx, (y0 - ell.cy) / ell.ry) - 1) < 0.3;
        const nearRimEnd = Math.abs(Math.hypot((x1 - ell.cx) / ell.rx, (y1 - ell.cy) / ell.ry) - 1) < 0.3;
        const apex = nearRimStart ? [x1, y1] : nearRimEnd ? [x0, y0] : null;
        if (!apex) continue;
        if (apex[1] < ell.cy - ell.ry) convergesAbove = true;
        if (apex[1] > ell.cy + ell.ry) convergesBelow = true;
      }
      if (convergesAbove || convergesBelow) return { type: "cone", confidence: 0.8, alternatives: ["cylinder", "sphere"] };
    }
    // 1 elips saja → bola (kalau bulat) atau kerucut/tabung sebagai alternatif.
    if (curves.length === 1 && openStrokes.length === 0) {
      const ell = curves[0];
      const ratio = Math.max(ell.rx, ell.ry) / Math.min(ell.rx, ell.ry);
      if (ratio < 1.35) return { type: "sphere", confidence: 0.75, alternatives: ["cylinder", "cone"] };
      return { type: "cylinder", confidence: 0.5, alternatives: ["sphere", "cone"] };
    }
  }

  // --- Polihedron: pola garis (kode versi sebelumnya) ---
  const segs: { angle: number; len: number }[] = [];
  for (const s of strokes) {
    const simp = rdp(s.points.map(([x, y]) => [x, y] as P), 0.035 * diag);
    for (let i = 0; i + 1 < simp.length; i++) {
      const [x0, y0] = simp[i], [x1, y1] = simp[i + 1];
      const len = Math.hypot(x1 - x0, y1 - y0);
      if (len < 0.08 * diag) continue;
      let angle = (Math.atan2(-(y1 - y0), x1 - x0) * 180) / Math.PI;
      if (angle < 0) angle += 180;
      if (angle >= 180) angle -= 180;
      segs.push({ angle, len });
    }
  }
  const H = segs.filter((s) => s.angle < 20 || s.angle > 160);
  const V = segs.filter((s) => s.angle > 70 && s.angle < 110);
  const D1 = segs.filter((s) => s.angle >= 20 && s.angle <= 70);
  const D2 = segs.filter((s) => s.angle >= 110 && s.angle <= 160);
  const avg = (a: { len: number }[]) => a.reduce((t, s) => t + s.len, 0) / (a.length || 1);

  if (H.length >= 2 && V.length >= 2 && D1.length + D2.length >= 2 && segs.length >= 6) {
    const ratio = Math.max(avg(H), avg(V)) / Math.min(avg(H), avg(V));
    return {
      type: ratio < 1.35 ? "cube" : "cuboid",
      confidence: segs.length >= 8 ? 0.85 : 0.7,
      alternatives: ratio < 1.35 ? ["cuboid"] : ["cube"],
    };
  }
  if (V.length <= 1 && D1.length >= 1 && D2.length >= 1 && H.length >= 1) {
    const lateral = D1.length + D2.length;
    return {
      type: lateral >= 4 || H.length >= 2 ? "squarePyramid" : "triPyramid",
      confidence: 0.55,
      alternatives: ["squarePyramid", "triPyramid", "cone"],
    };
  }
  if (V.length >= 3 && D1.length + D2.length >= 2) {
    return { type: "triPrism", confidence: 0.5, alternatives: ["cuboid", "cylinder"] };
  }
  return { type: "cube", confidence: 0.2 };
}
