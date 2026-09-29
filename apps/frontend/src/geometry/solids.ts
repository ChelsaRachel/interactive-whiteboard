// Definisi bangun ruang untuk papan tulis SMA: polihedron (kubus, balok, limas, prisma)
// dan bangun lengkung (kerucut, tabung, bola). Ada volume, luas permukaan, dan jaring-jaring
// untuk yang berlaku.

export type Vec3 = [number, number, number];

export type SolidType =
  | "cube"
  | "cuboid"
  | "squarePyramid"
  | "triPyramid"
  | "triPrism"
  | "cylinder"
  | "cone"
  | "sphere";

export const SOLID_TYPES: SolidType[] = [
  "cube", "cuboid", "squarePyramid", "triPyramid", "triPrism", "cylinder", "cone", "sphere",
];

export const POLYHEDRA: SolidType[] = ["cube", "cuboid", "squarePyramid", "triPyramid", "triPrism"];
export const CURVED: SolidType[] = ["cylinder", "cone", "sphere"];

/** Sumbu simetri bangun lengkung selalu sejajar sumbu y global (vertikal di layar). */
export interface Solid {
  type: SolidType;
  vertices: Vec3[]; // titik-titik penting (untuk lengkung, hanya titik referensi seperti alas & puncak)
  labels: string[];
  edges: [number, number][]; // rusuk (kosong untuk bola)
  faces: number[][]; // sisi datar (kosong untuk lengkung)
  dims: Record<string, number>;
  /** Sisi lengkung yang perlu digambar sebagai kurva (Three.js mesh), bukan garis. */
  curved: {
    kind: "cylinder" | "cone" | "sphere" | null;
    radius: number;
    height: number; // untuk bola, sama dengan 2r
  };
}

export const DEFAULT_DIMS: Record<SolidType, Record<string, number>> = {
  cube: { a: 6 },
  cuboid: { p: 8, l: 5, t: 4 }, // panjang, lebar, tinggi
  squarePyramid: { a: 6, t: 6 }, // rusuk alas, tinggi
  triPyramid: { a: 6, t: 6 },
  triPrism: { a: 6, t: 7 }, // rusuk alas, tinggi/panjang prisma
  cylinder: { r: 3, t: 6 }, // jari-jari, tinggi
  cone: { r: 3, t: 6 },
  sphere: { r: 4 },
};

/** Batas nilai slider untuk tiap dimensi (min, max, step). */
export const DIM_LIMITS: Record<string, [number, number, number]> = {
  a: [1, 12, 0.5],
  p: [1, 14, 0.5],
  l: [1, 12, 0.5],
  t: [1, 14, 0.5],
  r: [0.5, 8, 0.25],
};

/** Nama dimensi untuk label UI (kunci `dim_<key>` di i18n). */
export const DIM_KEY_LABELS: Record<string, string> = {
  a: "edgeLength",
  p: "dimPanjang",
  l: "dimLebar",
  t: "dimTinggi",
  r: "dimJariJari",
};

export function buildSolid(type: SolidType, dims = DEFAULT_DIMS[type]): Solid {
  switch (type) {
    case "cube":
    case "cuboid": {
      const [p, t, l] = type === "cube" ? [dims.a, dims.a, dims.a] : [dims.p, dims.t, dims.l];
      const x = p / 2, y = t / 2, z = l / 2;
      const vertices: Vec3[] = [
        [-x, -y, z], [x, -y, z], [x, -y, -z], [-x, -y, -z],
        [-x, y, z], [x, y, z], [x, y, -z], [-x, y, -z],
      ];
      return {
        type, dims, vertices,
        labels: ["A", "B", "C", "D", "E", "F", "G", "H"],
        edges: [[0, 1], [1, 2], [2, 3], [3, 0], [4, 5], [5, 6], [6, 7], [7, 4], [0, 4], [1, 5], [2, 6], [3, 7]],
        faces: orient(vertices, [[0, 1, 2, 3], [4, 5, 6, 7], [0, 1, 5, 4], [1, 2, 6, 5], [2, 3, 7, 6], [3, 0, 4, 7]]),
        curved: { kind: null, radius: 0, height: 0 },
      };
    }
    case "squarePyramid": {
      const h = dims.a / 2, y = dims.t / 2;
      const vertices: Vec3[] = [[-h, -y, h], [h, -y, h], [h, -y, -h], [-h, -y, -h], [0, y, 0]];
      return {
        type, dims, vertices,
        labels: ["A", "B", "C", "D", "T"],
        edges: [[0, 1], [1, 2], [2, 3], [3, 0], [0, 4], [1, 4], [2, 4], [3, 4]],
        faces: orient(vertices, [[0, 1, 2, 3], [0, 1, 4], [1, 2, 4], [2, 3, 4], [3, 0, 4]]),
        curved: { kind: null, radius: 0, height: 0 },
      };
    }
    case "triPyramid": {
      const y = dims.t / 2;
      const base = triangle(dims.a, -y);
      const vertices: Vec3[] = [...base, [0, y, 0]];
      return {
        type, dims, vertices,
        labels: ["A", "B", "C", "T"],
        edges: [[0, 1], [1, 2], [2, 0], [0, 3], [1, 3], [2, 3]],
        faces: orient(vertices, [[0, 1, 2], [0, 1, 3], [1, 2, 3], [2, 0, 3]]),
        curved: { kind: null, radius: 0, height: 0 },
      };
    }
    case "triPrism": {
      const y = dims.t / 2;
      const vertices: Vec3[] = [...triangle(dims.a, -y), ...triangle(dims.a, y)];
      return {
        type, dims, vertices,
        labels: ["A", "B", "C", "D", "E", "F"],
        edges: [[0, 1], [1, 2], [2, 0], [3, 4], [4, 5], [5, 3], [0, 3], [1, 4], [2, 5]],
        faces: orient(vertices, [[0, 1, 2], [3, 4, 5], [0, 1, 4, 3], [1, 2, 5, 4], [2, 0, 3, 5]]),
        curved: { kind: null, radius: 0, height: 0 },
      };
    }
    case "cylinder": {
      const r = dims.r, y = dims.t / 2;
      // Titik referensi: pusat alas bawah, pusat alas atas, dua titik pada rim (untuk label & pick).
      const vertices: Vec3[] = [[0, -y, 0], [0, y, 0], [r, -y, 0], [r, y, 0]];
      return {
        type, dims, vertices,
        labels: ["A", "T", "A'", "T'"], // pusat bawah A, pusat atas T, tepi bawah A', tepi atas T'
        edges: [[0, 1]], // sumbu simetri sebagai "rusuk" yang bisa dipilih
        faces: [],
        curved: { kind: "cylinder", radius: r, height: dims.t },
      };
    }
    case "cone": {
      const r = dims.r, y = dims.t / 2;
      const vertices: Vec3[] = [[0, -y, 0], [0, y, 0], [r, -y, 0]];
      return {
        type, dims, vertices,
        labels: ["A", "T", "B"], // pusat alas A, puncak T, tepi alas B
        edges: [[0, 1]], // sumbu (A ke T)
        faces: [],
        curved: { kind: "cone", radius: r, height: dims.t },
      };
    }
    case "sphere": {
      const r = dims.r;
      const vertices: Vec3[] = [[0, 0, 0], [0, r, 0], [0, -r, 0]];
      return {
        type, dims, vertices,
        labels: ["O", "N", "S"], // pusat, kutub utara, kutub selatan
        edges: [],
        faces: [],
        curved: { kind: "sphere", radius: r, height: 2 * r },
      };
    }
  }
}

// Segitiga sama sisi di bidang y, berpusat di titik berat.
function triangle(a: number, y: number): Vec3[] {
  const h = (Math.sqrt(3) / 2) * a;
  return [[-a / 2, y, h / 3], [a / 2, y, h / 3], [0, y, (-2 * h) / 3]];
}

export const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const scale = (a: Vec3, s: number): Vec3 => [a[0] * s, a[1] * s, a[2] * s];
export const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const cross = (a: Vec3, b: Vec3): Vec3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
export const length = (a: Vec3) => Math.hypot(a[0], a[1], a[2]);
export const normalize = (a: Vec3): Vec3 => scale(a, 1 / (length(a) || 1));
export const lerp = (a: Vec3, b: Vec3, t: number): Vec3 => add(a, scale(sub(b, a), t));

export function centroid(points: Vec3[]): Vec3 {
  return scale(points.reduce(add, [0, 0, 0] as Vec3), 1 / points.length);
}

export function faceNormal(vertices: Vec3[], face: number[]): Vec3 {
  const [a, b, c] = face.map((i) => vertices[i]);
  return normalize(cross(sub(b, a), sub(c, a)));
}

// Pastikan normal setiap sisi mengarah keluar.
function orient(vertices: Vec3[], faces: number[][]): number[][] {
  const center = centroid(vertices);
  return faces.map((f) => {
    const n = faceNormal(vertices, f);
    const fc = centroid(f.map((i) => vertices[i]));
    return dot(n, sub(fc, center)) < 0 ? [...f].reverse() : f;
  });
}

/** Sisi-sisi yang berbatasan dengan tiap rusuk (untuk menentukan rusuk tersembunyi). */
export function edgeFaces(solid: Solid): number[][] {
  return solid.edges.map(([a, b]) =>
    solid.faces.flatMap((f, fi) => {
      for (let k = 0; k < f.length; k++) {
        const u = f[k], v = f[(k + 1) % f.length];
        if ((u === a && v === b) || (u === b && v === a)) return [fi];
      }
      return [];
    }),
  );
}

export function sphereOptions(type: SolidType): { inner: boolean; outer: boolean } {
  return { inner: type === "cube", outer: type === "cube" || type === "cuboid" };
}

export function sphereRadius(solid: Solid, kind: "in" | "out"): number {
  if (kind === "in") return solid.dims.a / 2;
  return Math.max(...solid.vertices.map(length));
}

export function maxExtent(solid: Solid): number {
  if (solid.curved.kind === "sphere") return solid.curved.radius;
  if (solid.curved.kind === "cylinder" || solid.curved.kind === "cone")
    return Math.hypot(solid.curved.radius, solid.curved.height / 2);
  return Math.max(...solid.vertices.map(length));
}

// ---------- volume & luas permukaan ----------

export function solidVolume(solid: Solid): number {
  const d = solid.dims;
  switch (solid.type) {
    case "cube": return d.a ** 3;
    case "cuboid": return d.p * d.l * d.t;
    case "squarePyramid": return (d.a ** 2 * d.t) / 3;
    case "triPyramid": return ((Math.sqrt(3) / 4) * d.a ** 2 * d.t) / 3;
    case "triPrism": return (Math.sqrt(3) / 4) * d.a ** 2 * d.t;
    case "cylinder": return Math.PI * d.r ** 2 * d.t;
    case "cone": return (Math.PI * d.r ** 2 * d.t) / 3;
    case "sphere": return (4 / 3) * Math.PI * d.r ** 3;
  }
}

export function solidSurfaceArea(solid: Solid): number {
  const d = solid.dims;
  switch (solid.type) {
    case "cube": return 6 * d.a ** 2;
    case "cuboid": return 2 * (d.p * d.l + d.l * d.t + d.p * d.t);
    case "squarePyramid": {
      const slant = Math.hypot(d.a / 2, d.t);
      return d.a ** 2 + 2 * d.a * slant;
    }
    case "triPyramid": {
      // Limas beraturan (tinggi diukur dari alas ke puncak).
      const apothem = d.a / (2 * Math.sqrt(3));
      const slant = Math.hypot(apothem, d.t);
      return (Math.sqrt(3) / 4) * d.a ** 2 + (3 * d.a * slant) / 2;
    }
    case "triPrism": return 2 * ((Math.sqrt(3) / 4) * d.a ** 2) + 3 * d.a * d.t;
    case "cylinder": return 2 * Math.PI * d.r ** 2 + 2 * Math.PI * d.r * d.t;
    case "cone": {
      const s = Math.hypot(d.r, d.t);
      return Math.PI * d.r ** 2 + Math.PI * d.r * s;
    }
    case "sphere": return 4 * Math.PI * d.r ** 2;
  }
}

// ---------- jaring-jaring (net) untuk polihedron ----------

export interface NetFace {
  /** Titik-titik sisi setelah dibentangkan ke bidang XY (bentuk sebenarnya). */
  flat: [number, number][];
  /** Sumbu putar (di 3D) tempat sisi ini melipat dari posisi datar ke posisi 3D. */
  hinge?: [Vec3, Vec3];
  /** Sisi induk (index di solid.faces) yang menempel di hinge; 0 kalau ini alas. */
  parent?: number;
  /** Vertex indices dari solid.faces yang menjadi vertex sisi ini, urut sama dengan flat. */
  faceIndex: number;
}

/** Bentangkan polihedron menjadi jaring-jaring datar dengan urutan sisi mengelilingi alas. */
export function buildNet(solid: Solid): NetFace[] | null {
  if (!solid.faces.length) return null;
  const V = solid.vertices;
  const F = solid.faces;
  // Alas: sisi dengan y minimum rata-rata.
  const baseIdx = F.reduce((best, f, i) => {
    const y = centroid(f.map((k) => V[k]))[1];
    return y < centroid(F[best].map((k) => V[k]))[1] ? i : best;
  }, 0);
  const base = F[baseIdx];
  // Bentangkan alas ke bidang XY (mempertahankan bentuk).
  const flatBase = flatten3d(base.map((k) => V[k]));
  const nets: NetFace[] = [{ flat: flatBase, faceIndex: baseIdx }];

  // Tiap rusuk alas: cari sisi lain yang berbagi rusuk itu → buka ke arah luar.
  for (let e = 0; e < base.length; e++) {
    const a = base[e], b = base[(e + 1) % base.length];
    const other = F.findIndex(
      (f, i) => i !== baseIdx && f.includes(a) && f.includes(b),
    );
    if (other < 0) continue;
    const flat = unfoldFace(F[other], a, b, V, flatBase[e], flatBase[(e + 1) % base.length]);
    nets.push({
      flat,
      faceIndex: other,
      hinge: [V[a], V[b]],
      parent: baseIdx,
    });
    // Untuk kubus/balok, sisi atas (tutup) dibentangkan lagi dari salah satu sisi tegak.
    // Cari sisi keempat lagi (tutup) di sisi terjauh; skip untuk sekarang, cukup untuk sisi tegak.
  }
  // Untuk balok/kubus, tambahkan sisi atas menempel di salah satu sisi tegak (sisi pertama setelah alas).
  if (F.length === 6 && nets.length === 5) {
    const top = F.findIndex((_, i) => !nets.some((n) => n.faceIndex === i));
    if (top >= 0) {
      const wall = nets[1]; // sisi tegak pertama
      const wallFace = F[wall.faceIndex];
      // Rusuk atas dari sisi tegak = dua vertex yang tidak ada di alas.
      const upper = wallFace.filter((v) => !base.includes(v));
      if (upper.length === 2) {
        const [ua, ub] = upper;
        // Cari indeks ua, ub di wallFace (untuk memetakan ke flat wall).
        const uaIdx = wallFace.indexOf(ua), ubIdx = wallFace.indexOf(ub);
        const flat = unfoldFace(F[top], ua, ub, V, wall.flat[uaIdx], wall.flat[ubIdx]);
        nets.push({ flat, faceIndex: top, hinge: [V[ua], V[ub]], parent: wall.faceIndex });
      }
    }
  }
  return nets;
}

/** Bentangkan sisi ke 2D dengan menempatkan rusuk (a,b) di edge yang sudah ada di flatA/flatB. */
function unfoldFace(face: number[], a: number, b: number, V: Vec3[], flatA: [number, number], flatB: [number, number]): [number, number][] {
  const ai = face.indexOf(a), bi = face.indexOf(b);
  // Reorder face agar mulai dari a, lalu b, lalu sisanya.
  const n = face.length;
  const start = ai;
  const dir = (bi - ai + n) % n === 1 ? 1 : -1;
  const ordered: number[] = [];
  for (let k = 0; k < n; k++) ordered.push(face[(start + dir * k + n) % n]);
  const pts3 = ordered.map((k) => V[k]);
  // Bentangkan dengan koordinat lokal (u searah ab).
  const flat = flatten3d(pts3);
  // Sekarang flat[0] = (0,0), flat[1] di sumbu +x sepanjang |ab|. Kita mau flat[0] = flatA, flat[1] = flatB.
  const dx = flatB[0] - flatA[0], dy = flatB[1] - flatA[1];
  const len = Math.hypot(dx, dy) || 1;
  const cos = dx / len, sin = dy / len;
  return flat.map(([x, y]) => {
    // Cerminkan y agar sisi terbuka ke luar dari alas (menjauhi pusat alas).
    const yy = -y;
    return [flatA[0] + x * cos - yy * sin, flatA[1] + x * sin + yy * cos];
  });
}

/** Pipihkan poligon 3D ke 2D dengan mengambil basis ortonormal pada bidangnya. */
function flatten3d(pts: Vec3[]): [number, number][] {
  const o = pts[0];
  const uAxis = normalize(sub(pts[1], o));
  const normal = normalize(cross(uAxis, sub(pts[pts.length > 2 ? 2 : 1], o)));
  const vAxis = cross(normal, uAxis);
  return pts.map((p) => {
    const r = sub(p, o);
    return [dot(r, uAxis), dot(r, vAxis)];
  });
}
