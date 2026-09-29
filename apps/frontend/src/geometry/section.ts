// Irisan bidang pada bangun ruang. Untuk polihedron, bidang lewat 3 titik pada rusuk lalu
// dipotongkan ke semua rusuk. Untuk bangun lengkung (bola/tabung/kerucut), mode irisan
// dan parameter (offset/kemiringan) menghasilkan bentuk khusus: lingkaran, elips, persegi
// panjang, segitiga, parabola, atau hiperbola.

import { cross, dot, length, lerp, normalize, sub, centroid, type Solid, type Vec3 } from "./solids";

export interface EdgePoint {
  edge: number;
  t: number;
}

export type ShapeKind =
  | "triangle_equilateral" | "triangle_isosceles" | "triangle_right" | "triangle"
  | "square" | "rectangle" | "rhombus" | "parallelogram" | "trapezoid_isosceles" | "trapezoid" | "quadrilateral"
  | "pentagon" | "hexagon_regular" | "hexagon" | "polygon"
  | "circle" | "ellipse" | "parabola" | "hyperbola";

export interface Section {
  points3d: Vec3[];
  points2d: [number, number][];
  angles: number[];
  sides: number[];
  area: number;
  perimeter: number;
  kind: ShapeKind;
  normal: Vec3;
  /** true = tepi bentuk adalah kurva mulus (perlu digambar sebagai kurva, bukan poligon). */
  isCurve?: boolean;
  /** Kurva terbuka (parabola/hiperbola) → tidak boleh diarsir sebagai poligon tertutup. */
  isOpen?: boolean;
  /** Untuk elips: setengah sumbu (label a/b). */
  ellipseAxes?: { a: number; b: number };
  /** Untuk lingkaran: jari-jari. */
  circleRadius?: number;
}

const EPS = 1e-7;

export function edgePointPosition(solid: Solid, p: EdgePoint): Vec3 {
  const [a, b] = solid.edges[p.edge];
  return lerp(solid.vertices[a], solid.vertices[b], p.t);
}

/** Titik tertentu pada rusuk ditarik ke nilai "rapi" (ujung, tengah, sepertiga, seperempat). */
export function snapT(t: number): number {
  for (const s of [0, 1 / 2, 1]) if (Math.abs(t - s) < 0.07) return s;
  for (const s of [1 / 4, 1 / 3, 2 / 3, 3 / 4]) if (Math.abs(t - s) < 0.03) return s;
  return Math.max(0, Math.min(1, t));
}

// ---------- polihedron: bidang lewat 3 titik pada rusuk ----------

export function computeSection(solid: Solid, picks: EdgePoint[]): Section | null {
  if (picks.length < 3 || !solid.edges.length || !solid.faces.length) return null;
  const [p1, p2, p3] = picks.slice(0, 3).map((p) => edgePointPosition(solid, p));
  const nRaw = cross(sub(p2, p1), sub(p3, p1));
  if (length(nRaw) < 1e-6) return null;
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

  return polygonSection(points3d, points2d, n);
}

function polygonSection(points3d: Vec3[], points2d: [number, number][], n: Vec3): Section {
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
  return {
    points3d, points2d, angles, sides, area: Math.abs(area) / 2,
    perimeter: sides.reduce((s, x) => s + x, 0),
    kind: classifyPolygon(points2d, sides, angles),
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

function classifyPolygon(p: [number, number][], sides: number[], angles: number[]): ShapeKind {
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
    case 5: return "pentagon";
    case 6: return allEq(sides) && allEq(angles) ? "hexagon_regular" : "hexagon";
    default: return "polygon";
  }
}

// ---------- bangun lengkung ----------

/** Mode irisan yang tersedia per bangun. */
export const CURVED_MODES = {
  sphere: ["plane"] as const,
  cylinder: ["horizontal", "vertical", "oblique"] as const,
  cone: ["horizontal", "throughApex", "oblique", "parallelSlant", "parallelAxis"] as const,
};
export type CurvedMode =
  | "plane" | "horizontal" | "vertical" | "oblique" | "throughApex" | "parallelSlant" | "parallelAxis";

/** Untuk lengkung: offset (0..1) dan sudut (0..1) diinterpretasi bergantung mode. */
export interface CurvedSectionSpec {
  mode: CurvedMode;
  /** 0..1 (dilinierkan ke rentang alami sesuai mode). */
  offset: number;
  /** 0..1 (untuk mode oblique). */
  angle: number;
}

export function defaultCurvedSpec(kind: "cylinder" | "cone" | "sphere"): CurvedSectionSpec {
  if (kind === "sphere") return { mode: "plane", offset: 0.5, angle: 0.4 };
  if (kind === "cylinder") return { mode: "horizontal", offset: 0.5, angle: 0.35 };
  return { mode: "horizontal", offset: 0.65, angle: 0.35 };
}

const SAMPLES = 96;

export function computeCurvedSection(solid: Solid, spec: CurvedSectionSpec): Section | null {
  const k = solid.curved.kind;
  if (!k) return null;
  if (k === "sphere") return sphereSection(solid, spec);
  if (k === "cylinder") return cylinderSection(solid, spec);
  return coneSection(solid, spec);
}

function sphereSection(solid: Solid, spec: CurvedSectionSpec): Section | null {
  const R = solid.curved.radius;
  // offset 0 = kutub, 1 = pusat → menyala ke seluruh diameter.
  const d = R * (1 - spec.offset);
  const r = Math.sqrt(Math.max(0, R * R - d * d));
  if (r < EPS) return null;
  const y = d;
  const pts3: Vec3[] = [];
  const pts2: [number, number][] = [];
  for (let i = 0; i < SAMPLES; i++) {
    const a = (2 * Math.PI * i) / SAMPLES;
    pts3.push([r * Math.cos(a), y, r * Math.sin(a)]);
    pts2.push([r * Math.cos(a), r * Math.sin(a)]);
  }
  return circleLike(pts3, pts2, r, [0, 1, 0]);
}

function cylinderSection(solid: Solid, spec: CurvedSectionSpec): Section | null {
  const R = solid.curved.radius, H = solid.curved.height;
  if (spec.mode === "horizontal") {
    const y = -H / 2 + spec.offset * H;
    const pts3: Vec3[] = [], pts2: [number, number][] = [];
    for (let i = 0; i < SAMPLES; i++) {
      const a = (2 * Math.PI * i) / SAMPLES;
      pts3.push([R * Math.cos(a), y, R * Math.sin(a)]);
      pts2.push([R * Math.cos(a), R * Math.sin(a)]);
    }
    return circleLike(pts3, pts2, R, [0, 1, 0]);
  }
  if (spec.mode === "vertical") {
    // Bidang x = d, dengan d ∈ (−R, R). Section = persegi panjang 2·sqrt(R²−d²) × H.
    const d = -R + 2 * R * spec.offset;
    const half = Math.sqrt(Math.max(0, R * R - d * d));
    if (half < EPS) return null;
    const pts3: Vec3[] = [
      [d, -H / 2, -half], [d, -H / 2, half], [d, H / 2, half], [d, H / 2, -half],
    ];
    const pts2: [number, number][] = [[-half, -H / 2], [half, -H / 2], [half, H / 2], [-half, H / 2]];
    return polygonSection(pts3, pts2, [1, 0, 0]);
  }
  // "oblique": bidang y = z·tan(θ) melewati pusat. Tilt θ ∈ (0, ~80°) diambil dari spec.angle.
  const theta = (spec.angle * 80 + 5) * (Math.PI / 180);
  const tan = Math.tan(theta);
  // Bidang: y = z·tan θ (yaitu normal n = (0, cos θ, −sin θ)).
  // Perpotongan dengan tabung {(x, y, z): x² + z² = R²}: parametrisasi z = R sin φ, x = R cos φ, y = R sin φ · tan θ.
  const yLimit = H / 2;
  const pts3: Vec3[] = [], pts2: [number, number][] = [];
  const semiA = R;                          // sumbu di arah x
  const semiB = R / Math.cos(theta);        // sumbu di arah kemiringan (u vektor pada bidang)
  const maxSin = yLimit / (semiB * Math.sin(theta) || 1);
  if (maxSin < 1 - 1e-3) return null;       // bidang keluar dari tabung → penampang bukan elips utuh
  for (let i = 0; i < SAMPLES; i++) {
    const phi = (2 * Math.PI * i) / SAMPLES;
    const x = R * Math.cos(phi);
    const z = R * Math.sin(phi);
    const y = z * tan;
    if (Math.abs(y) > yLimit + 1e-3) return null;
    pts3.push([x, y, z]);
    pts2.push([x, semiB * Math.sin(phi)]);
  }
  const n = normalize([0, Math.cos(theta), -Math.sin(theta)]);
  return ellipseLike(pts3, pts2, semiA, semiB, n);
}

function coneSection(solid: Solid, spec: CurvedSectionSpec): Section | null {
  const R = solid.curved.radius, H = solid.curved.height;
  // Kerucut: puncak di (0, H/2, 0), alas di y = −H/2 dengan jari-jari R.
  const yBase = -H / 2, yApex = H / 2;
  const slantAngle = Math.atan(R / H); // sudut generatriks dari sumbu
  if (spec.mode === "horizontal") {
    // Irisan sejajar alas → lingkaran.
    const y = yBase + spec.offset * H;
    const r = R * (yApex - y) / H;
    if (r < EPS) return null;
    const pts3: Vec3[] = [], pts2: [number, number][] = [];
    for (let i = 0; i < SAMPLES; i++) {
      const a = (2 * Math.PI * i) / SAMPLES;
      pts3.push([r * Math.cos(a), y, r * Math.sin(a)]);
      pts2.push([r * Math.cos(a), r * Math.sin(a)]);
    }
    return circleLike(pts3, pts2, r, [0, 1, 0]);
  }
  if (spec.mode === "throughApex") {
    // Irisan bidang vertikal lewat puncak → segitiga sama kaki (kadang siku-siku bila lewat pusat).
    // Bidang x cos α + z sin α = 0 (lewat sumbu), dipotong sepanjang alas: chord.
    const alpha = spec.angle * Math.PI; // 0..π putar arah normal.
    const d = R * (2 * spec.offset - 1); // pergeseran dari sumbu (−R..R). d=0 → segitiga sama kaki.
    // Bidang: x·cos α + z·sin α = d.
    // Perpotongan dengan lingkaran alas x²+z²=R² → dua titik.
    const disc = R * R - d * d;
    if (disc <= EPS) return null;
    const s = Math.sqrt(disc);
    const x1 = d * Math.cos(alpha) + s * Math.sin(alpha);
    const z1 = d * Math.sin(alpha) - s * Math.cos(alpha);
    const x2 = d * Math.cos(alpha) - s * Math.sin(alpha);
    const z2 = d * Math.sin(alpha) + s * Math.cos(alpha);
    const p1: Vec3 = [x1, yBase, z1];
    const p2: Vec3 = [x2, yBase, z2];
    const apex: Vec3 = [0, yApex, 0];
    // 2D: alas segitiga horizontal, puncak di atas.
    const chord = 2 * s;
    const h = Math.hypot((x1 + x2) / 2, (z1 + z2) / 2, yApex - yBase); // tinggi segitiga
    void h;
    const pts2: [number, number][] = [[-chord / 2, 0], [chord / 2, 0], [0, Math.hypot((x1 + x2) / 2 - 0, (z1 + z2) / 2 - 0, H)]];
    return polygonSection([p1, p2, apex], pts2, normalize([-Math.sin(alpha), 0, Math.cos(alpha)]));
  }
  if (spec.mode === "oblique") {
    // Bidang tilt θ (< slantAngle) → elips.
    const theta = spec.angle * (slantAngle - 0.02);
    if (theta <= 1e-3) return coneSection(solid, { ...spec, mode: "horizontal" });
    // Bidang: y = z·tan θ + y0, y0 dipilih agar bidang tetap di dalam kerucut.
    // Untuk mudah, ambil bidang lewat pusat sumbu di ketinggian y0 sesuai spec.offset.
    const y0 = yBase + spec.offset * H * 0.9 + H * 0.05;
    return coneObliqueEllipse(R, H, theta, y0);
  }
  if (spec.mode === "parallelSlant") {
    // Bidang sejajar generatriks → parabola.
    return coneParabola(R, H, spec);
  }
  // "parallelAxis": bidang sejajar sumbu → hiperbola.
  return coneHyperbola(R, H, spec);
}

function coneObliqueEllipse(R: number, H: number, theta: number, y0: number): Section | null {
  // Parametrisasi: pada bidang y = z tan θ + y0, potong dengan permukaan kerucut.
  // Permukaan kerucut: x² + z² = (R (H/2 − y)/H)².
  // Substitusi y: x² + z² = (R (H/2 − y0 − z tan θ)/H)². Ini kurva orde 2 pada (x, z) → elips.
  const tan = Math.tan(theta);
  const pts3: Vec3[] = [], pts2: [number, number][] = [];
  for (let i = 0; i < 4 * SAMPLES; i++) {
    const phi = (2 * Math.PI * i) / (4 * SAMPLES);
    // Cari z sepanjang arah radial pada bidang: z_local = ρ·cos(phi), x = ρ·sin(phi).
    // Solve for ρ.
    const dz = Math.cos(phi), dx = Math.sin(phi);
    const A = dx * dx + dz * dz - (R / H) ** 2 * (dz * tan) ** 2;
    const B = 2 * (R / H) ** 2 * (H / 2 - y0) * dz * tan;
    const C = -Math.pow((R * (H / 2 - y0)) / H, 2);
    const disc = B * B - 4 * A * C;
    if (disc < 0) return null;
    const rho = (-B + Math.sqrt(disc)) / (2 * A);
    const x = rho * dx;
    const z = rho * dz;
    const y = z * tan + y0;
    if (y < -H / 2 - 1e-3 || y > H / 2 + 1e-3) return null;
    pts3.push([x, y, z]);
    pts2.push([x, z / Math.cos(theta)]);
  }
  // Ambil sampling normal.
  const step = Math.floor(pts3.length / SAMPLES);
  const p3 = pts3.filter((_, i) => i % step === 0);
  const p2 = pts2.filter((_, i) => i % step === 0);
  const xs = p2.map((p) => p[0]), ys = p2.map((p) => p[1]);
  const a = (Math.max(...xs) - Math.min(...xs)) / 2;
  const b = (Math.max(...ys) - Math.min(...ys)) / 2;
  return ellipseLike(p3, p2, Math.max(a, b), Math.min(a, b), normalize([0, Math.cos(theta), -Math.sin(theta)]));
}

function coneParabola(R: number, H: number, spec: CurvedSectionSpec): Section | null {
  // Bidang sejajar generatriks kerucut. Ambil generatriks (x=R,y=−H/2)→(0,H/2). Bidang normalnya:
  // Vektor generatriks (positif x): (-R, H, 0)/norma. Bidang sejajar generatriks itu +
  // sejajar sumbu z: normalnya (H, R, 0)/norma. Bidang: H·x + R·y = C. Offset = C.
  const norm = Math.hypot(H, R);
  const nX = H / norm, nY = R / norm;
  // Rentang C: bila bidang menyentuh generatriks lain (di x = -R): C_max = -R·nX − H/2·nY (di alas kanan −R). Ambil lebih dekat ke sisi sedikit.
  const cMax = H * R / norm * 0.85;
  const cMin = -H * R / norm * 0.85;
  const c = cMin + (cMax - cMin) * spec.offset;
  const pts3: Vec3[] = [];
  const pts2: [number, number][] = [];
  const N = 60;
  // Untuk tiap z ∈ [−R, R], selesaikan x, y pada permukaan kerucut sedemikian rupa sehingga H·x + R·y = c.
  // Permukaan: x² + z² = (R·(H/2 − y)/H)².
  // Dari bidang: x = (c − R·y)/H.
  // Substitusi: (c − R·y)²/H² + z² = R²(H/2 − y)²/H².
  // Kalikan H²: (c − R·y)² + H²·z² = R²(H/2 − y)².
  // Kuadratik dalam y: R²·y² − 2Rc·y + c² + H²·z² − R²(H²/4 − Hy + y²) = 0
  // → 2·R²·Hy - R²·H²/4 - 2·Rc·y + c² + H²·z² · (koef) = 0
  // Sederhanakan: −R²·H²/4 + 2R²Hy − 2Rc·y + c² + H²·z² = 0
  //              → y·(2R²H − 2Rc) = R²H²/4 − c² − H²·z²
  //              → y = (R²H²/4 − c² − H²·z²) / (2R·(RH − c))
  const denom = 2 * R * (R * H - c);
  if (Math.abs(denom) < EPS) return null;
  for (let i = 0; i <= N; i++) {
    const z = -R + (2 * R * i) / N;
    const y = (R * R * H * H / 4 - c * c - H * H * z * z) / denom;
    if (y < -H / 2 - 1e-3 || y > H / 2 + 1e-3) continue;
    const x = (c - R * y) / H;
    // Cek bahwa (x, z) memang di dalam alas kerucut pada ketinggian y.
    const rAtY = R * (H / 2 - y) / H;
    if (Math.hypot(x, z) > rAtY + 1e-2) continue;
    pts3.push([x, y, z]);
    // 2D: sumbu horizontal = z, sumbu vertikal = jarak sepanjang bidang di arah (x,y).
    pts2.push([z, x * nX + y * nY - c / norm]);
  }
  if (pts3.length < 5) return null;
  // Bentuk terbuka: kembalikan urutan dari kiri ke kanan.
  pts3.sort((a, b) => a[2] - b[2]);
  pts2.sort((a, b) => a[0] - b[0]);
  const perimeter = polylineLength(pts2);
  const area = openApproxArea(pts2);
  return {
    points3d: pts3, points2d: pts2, angles: [], sides: [], area,
    perimeter, kind: "parabola", normal: [nX, nY, 0], isCurve: true, isOpen: true,
  };
}

function coneHyperbola(R: number, H: number, spec: CurvedSectionSpec): Section | null {
  // Bidang sejajar sumbu (bidang x = d, dengan 0 < d < R). Perpotongan dengan permukaan kerucut
  // x² + z² = R²(H/2 − y)²/H² → z² = R²(H/2 − y)²/H² − d² → z = ± sqrt(...) → hiperbola.
  const d = 0.15 * R + 0.7 * R * spec.offset;
  const pts3: Vec3[] = [], pts2: [number, number][] = [];
  const N = 60;
  for (let i = 0; i <= N; i++) {
    const y = -H / 2 + (H * i) / N;
    const rAtY = R * (H / 2 - y) / H;
    if (rAtY < d) continue;
    const z = Math.sqrt(rAtY * rAtY - d * d);
    pts3.push([d, y, z]);
    pts2.push([z, y]);
  }
  for (let i = N; i >= 0; i--) {
    const y = -H / 2 + (H * i) / N;
    const rAtY = R * (H / 2 - y) / H;
    if (rAtY < d) continue;
    const z = -Math.sqrt(rAtY * rAtY - d * d);
    pts3.push([d, y, z]);
    pts2.push([z, y]);
  }
  if (pts3.length < 5) return null;
  const perimeter = polylineLength(pts2);
  // Hiperbola membentuk daerah tertutup dengan alas kerucut, jadi luas bermakna.
  const area = polygonArea(pts2);
  return {
    points3d: pts3, points2d: pts2, angles: [], sides: [], area, perimeter,
    kind: "hyperbola", normal: [1, 0, 0], isCurve: true,
  };
}

function polylineLength(pts: [number, number][]): number {
  let s = 0;
  for (let i = 1; i < pts.length; i++) s += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
  return s;
}
function polygonArea(pts: [number, number][]): number {
  let a = 0;
  const n = pts.length;
  for (let i = 0; i < n; i++) {
    const [x0, y0] = pts[i], [x1, y1] = pts[(i + 1) % n];
    a += x0 * y1 - x1 * y0;
  }
  return Math.abs(a) / 2;
}
function openApproxArea(pts: [number, number][]): number {
  // Anggap segmen (pertama-terakhir) sebagai penutup untuk perkiraan luas terarsir.
  return polygonArea(pts);
}

function circleLike(pts3: Vec3[], pts2: [number, number][], r: number, n: Vec3): Section {
  const perimeter = 2 * Math.PI * r;
  const area = Math.PI * r * r;
  return {
    points3d: pts3, points2d: pts2, angles: [], sides: [], area, perimeter,
    kind: "circle", normal: normalize(n), isCurve: true, circleRadius: r,
  };
}

function ellipseLike(pts3: Vec3[], pts2: [number, number][], a: number, b: number, n: Vec3): Section {
  const perimeter = Math.PI * (3 * (a + b) - Math.sqrt((3 * a + b) * (a + 3 * b)));
  const area = Math.PI * a * b;
  return {
    points3d: pts3, points2d: pts2, angles: [], sides: [], area, perimeter,
    kind: "ellipse", normal: normalize(n), isCurve: true, ellipseAxes: { a, b },
  };
}
