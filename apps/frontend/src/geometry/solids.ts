// Definisi bangun ruang (polihedron konveks) dengan penamaan titik gaya buku SMA Indonesia.

export type Vec3 = [number, number, number];
export type SolidType = "cube" | "cuboid" | "squarePyramid" | "triPyramid" | "triPrism";

export interface Solid {
  type: SolidType;
  vertices: Vec3[];
  labels: string[];
  edges: [number, number][];
  faces: number[][]; // indeks titik, urutan berlawanan jarum jam dilihat dari luar
  dims: Record<string, number>;
}

export const SOLID_TYPES: SolidType[] = ["cube", "cuboid", "squarePyramid", "triPyramid", "triPrism"];

export const DEFAULT_DIMS: Record<SolidType, Record<string, number>> = {
  cube: { a: 6 },
  cuboid: { p: 8, l: 5, t: 4 },
  squarePyramid: { a: 6, t: 6 },
  triPyramid: { a: 6, t: 6 },
  triPrism: { a: 6, t: 7 },
};

export function buildSolid(type: SolidType, dims = DEFAULT_DIMS[type]): Solid {
  switch (type) {
    case "cube":
    case "cuboid": {
      const [p, t, l] = type === "cube" ? [dims.a, dims.a, dims.a] : [dims.p, dims.t, dims.l];
      const x = p / 2, y = t / 2, z = l / 2;
      // Alas ABCD (A kiri-depan, B kanan-depan, C kanan-belakang, D kiri-belakang), atap EFGH di atasnya.
      const vertices: Vec3[] = [
        [-x, -y, z], [x, -y, z], [x, -y, -z], [-x, -y, -z],
        [-x, y, z], [x, y, z], [x, y, -z], [-x, y, -z],
      ];
      return {
        type, dims, vertices,
        labels: ["A", "B", "C", "D", "E", "F", "G", "H"],
        edges: [[0, 1], [1, 2], [2, 3], [3, 0], [4, 5], [5, 6], [6, 7], [7, 4], [0, 4], [1, 5], [2, 6], [3, 7]],
        faces: orient(vertices, [[0, 1, 2, 3], [4, 5, 6, 7], [0, 1, 5, 4], [1, 2, 6, 5], [2, 3, 7, 6], [3, 0, 4, 7]]),
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
      };
    }
  }
}

// Segitiga sama sisi di bidang y, titik A kiri-depan, B kanan-depan, C belakang, berpusat di titik berat.
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
  return Math.max(...solid.vertices.map(length));
}
