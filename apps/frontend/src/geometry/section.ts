// Irisan bidang pada bangun ruang: bidang melalui 3 titik pada rusuk, dipotongkan ke semua rusuk.

import { cross, dot, length, lerp, normalize, sub, centroid, type Solid, type Vec3 } from "./solids";

export interface EdgePoint {
  edge: number;
  t: number; // 0 = titik awal rusuk, 1 = titik akhir
}

export type ShapeKind =
  | "triangle_equilateral" | "triangle_isosceles" | "triangle_right" | "triangle"
  | "square" | "rectangle" | "rhombus" | "parallelogram" | "trapezoid_isosceles" | "trapezoid" | "quadrilateral"
  | "pentagon" | "hexagon_regular" | "hexagon" | "polygon";

export interface Section {
  points3d: Vec3[];
  points2d: [number, number][]; // bentuk sebenarnya pada bidang irisan
  angles: number[]; // sudut dalam (derajat) di tiap titik
  sides: number[];
  area: number;
  perimeter: number;
  kind: ShapeKind;
  normal: Vec3;
}

const EPS = 1e-7;

export function edgePointPosition(solid: Solid, p: EdgePoint): Vec3 {
  const [a, b] = solid.edges[p.edge];
  return lerp(solid.vertices[a], solid.vertices[b], p.t);
}

export function computeSection(solid: Solid, picks: EdgePoint[]): Section | null {
  if (picks.length < 3) return null;
  const [p1, p2, p3] = picks.slice(0, 3).map((p) => edgePointPosition(solid, p));
  const nRaw = cross(sub(p2, p1), sub(p3, p1));
  if (length(nRaw) < 1e-6) return null; // segaris
  const n = normalize(nRaw);
  const d = solid.vertices.map((v) => dot(n, sub(v, p1)));

  const pts: Vec3[] = [];
  const pushUnique = (p: Vec3) => {
    if (!pts.some((q) => length(sub(p, q)) < 1e-5)) pts.push(p);
  };
  solid.vertices.forEach((v, i) => Math.abs(d[i]) < EPS * 10 && pushUnique(v));
  for (const [a, b] of solid.edges) {
    if ((d[a] > EPS && d[b] < -EPS) || (d[a] < -EPS && d[b] > EPS)) {
      pushUnique(lerp(solid.vertices[a], solid.vertices[b], d[a] / (d[a] - d[b])));
    }
  }
  if (pts.length < 3) return null;

  // Basis ortonormal pada bidang, lalu urutkan titik menurut sudut di sekitar pusat.
  const c = centroid(pts);
  const u = normalize(sub(pts[0], c));
  const v = cross(n, u);
  const flat = pts.map((p) => {
    const r = sub(p, c);
    return { p, x: dot(r, u), y: dot(r, v) };
  });
  flat.sort((A, B) => Math.atan2(A.y, A.x) - Math.atan2(B.y, B.x));
  const points3d = flat.map((f) => f.p);
  const points2d = flat.map((f) => [f.x, f.y] as [number, number]);

  const m = points2d.length;
  const sides: number[] = [];
  const angles: number[] = [];
  let area = 0;
  for (let i = 0; i < m; i++) {
    const [x0, y0] = points2d[i];
    const [x1, y1] = points2d[(i + 1) % m];
    sides.push(Math.hypot(x1 - x0, y1 - y0));
    area += x0 * y1 - x1 * y0;
    const prev = points2d[(i - 1 + m) % m];
    const ax = prev[0] - x0, ay = prev[1] - y0, bx = x1 - x0, by = y1 - y0;
    const cos = (ax * bx + ay * by) / (Math.hypot(ax, ay) * Math.hypot(bx, by));
    angles.push((Math.acos(Math.max(-1, Math.min(1, cos))) * 180) / Math.PI);
  }
  area = Math.abs(area) / 2;

  return {
    points3d, points2d, angles, sides, area,
    perimeter: sides.reduce((s, x) => s + x, 0),
    kind: classify(points2d, sides, angles),
    normal: n,
  };
}

function near(a: number, b: number, tol = 1e-3) {
  return Math.abs(a - b) <= tol * Math.max(1, Math.abs(a), Math.abs(b));
}

function parallel(p: [number, number][], i: number, j: number) {
  const m = p.length;
  const a = [p[(i + 1) % m][0] - p[i][0], p[(i + 1) % m][1] - p[i][1]];
  const b = [p[(j + 1) % m][0] - p[j][0], p[(j + 1) % m][1] - p[j][1]];
  const crossZ = a[0] * b[1] - a[1] * b[0];
  return Math.abs(crossZ) < 1e-3 * Math.hypot(a[0], a[1]) * Math.hypot(b[0], b[1]);
}

function classify(p: [number, number][], sides: number[], angles: number[]): ShapeKind {
  const allEq = (xs: number[]) => xs.every((x) => near(x, xs[0]));
  switch (p.length) {
    case 3: {
      if (allEq(sides)) return "triangle_equilateral";
      if (angles.some((a) => near(a, 90))) return "triangle_right";
      if (near(sides[0], sides[1]) || near(sides[1], sides[2]) || near(sides[0], sides[2])) return "triangle_isosceles";
      return "triangle";
    }
    case 4: {
      const right = angles.every((a) => near(a, 90));
      const eq = allEq(sides);
      if (right && eq) return "square";
      if (right) return "rectangle";
      if (eq) return "rhombus";
      const par02 = parallel(p, 0, 2), par13 = parallel(p, 1, 3);
      if (par02 && par13) return "parallelogram";
      if (par02) return near(sides[1], sides[3]) ? "trapezoid_isosceles" : "trapezoid";
      if (par13) return near(sides[0], sides[2]) ? "trapezoid_isosceles" : "trapezoid";
      return "quadrilateral";
    }
    case 5:
      return "pentagon";
    case 6:
      return allEq(sides) && allEq(angles) ? "hexagon_regular" : "hexagon";
    default:
      return "polygon";
  }
}

/** Titik tertentu pada rusuk ditarik ke nilai "rapi" (ujung, tengah, sepertiga, seperempat). */
export function snapT(t: number): number {
  // Ujung dan titik tengah lebih "lengket" daripada sepertiga/seperempat.
  for (const s of [0, 1 / 2, 1]) if (Math.abs(t - s) < 0.07) return s;
  for (const s of [1 / 4, 1 / 3, 2 / 3, 3 / 4]) if (Math.abs(t - s) < 0.03) return s;
  return Math.max(0, Math.min(1, t));
}
