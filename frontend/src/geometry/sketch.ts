// Pengenal sketsa bangun ruang berbasis aturan geometri (tanpa training):
// goresan disederhanakan menjadi ruas garis, lalu arah-arah ruas dihitung.

import type { SolidType } from "./solids";

type P = [number, number];

export interface SketchGuess {
  type: SolidType;
  confidence: number;
}

function rdp(points: P[], eps: number): P[] {
  if (points.length < 3) return points;
  const [ax, ay] = points[0];
  const [bx, by] = points[points.length - 1];
  if (Math.hypot(bx - ax, by - ay) < eps) {
    // Goresan tertutup (mis. persegi sekali tarik): belah di titik terjauh dari titik awal.
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
    if (d > maxD) {
      maxD = d;
      idx = i;
    }
  }
  if (maxD <= eps) return [points[0], points[points.length - 1]];
  const left = rdp(points.slice(0, idx + 1), eps);
  const right = rdp(points.slice(idx), eps);
  return [...left.slice(0, -1), ...right];
}

export function guessSolidFromSketch(strokes: { points: [number, number, number][] }[]): SketchGuess {
  const all = strokes.flatMap((s) => s.points.map(([x, y]) => [x, y] as P));
  if (all.length < 4) return { type: "cube", confidence: 0 };
  const xs = all.map((p) => p[0]), ys = all.map((p) => p[1]);
  const diag = Math.hypot(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)) || 1;

  const segs: { angle: number; len: number }[] = [];
  for (const s of strokes) {
    const simp = rdp(s.points.map(([x, y]) => [x, y] as P), 0.035 * diag);
    for (let i = 0; i + 1 < simp.length; i++) {
      const [x0, y0] = simp[i], [x1, y1] = simp[i + 1];
      const len = Math.hypot(x1 - x0, y1 - y0);
      if (len < 0.08 * diag) continue;
      let angle = (Math.atan2(-(y1 - y0), x1 - x0) * 180) / Math.PI; // sumbu y ke atas
      if (angle < 0) angle += 180;
      if (angle >= 180) angle -= 180;
      segs.push({ angle, len });
    }
  }
  const H = segs.filter((s) => s.angle < 20 || s.angle > 160);
  const V = segs.filter((s) => s.angle > 70 && s.angle < 110);
  const D1 = segs.filter((s) => s.angle >= 20 && s.angle <= 70); // miring "/"
  const D2 = segs.filter((s) => s.angle >= 110 && s.angle <= 160); // miring "\"
  const avg = (a: { len: number }[]) => a.reduce((t, s) => t + s.len, 0) / (a.length || 1);

  // Kubus/balok: garis mendatar, tegak, dan satu arah miring (rusuk kedalaman).
  if (H.length >= 2 && V.length >= 2 && D1.length + D2.length >= 2 && segs.length >= 6) {
    const ratio = Math.max(avg(H), avg(V)) / Math.min(avg(H), avg(V));
    return { type: ratio < 1.35 ? "cube" : "cuboid", confidence: segs.length >= 8 ? 0.85 : 0.7 };
  }
  // Limas: rusuk tegak sisi miring ke dua arah yang bertemu di puncak, tanpa garis tegak panjang.
  if (V.length <= 1 && D1.length >= 1 && D2.length >= 1 && H.length >= 1) {
    const lateral = Math.min(D1.length, D2.length) + Math.max(D1.length, D2.length);
    return { type: lateral >= 4 || H.length >= 2 ? "squarePyramid" : "triPyramid", confidence: 0.55 };
  }
  // Prisma segitiga: tiga garis tegak dan dua segitiga.
  if (V.length >= 3 && D1.length + D2.length >= 2) return { type: "triPrism", confidence: 0.5 };
  return { type: "cube", confidence: 0.2 };
}
