// Titik penting grafik secara numerik: titik potong sumbu, titik puncak (ekstrem lokal).

export interface KeyPoint {
  x: number;
  y: number;
  kind: "root" | "yIntercept" | "extremum";
}

export function findKeyPoints(f: (x: number) => number, xmin: number, xmax: number, n = 800): KeyPoint[] {
  const out: KeyPoint[] = [];
  const dx = (xmax - xmin) / n;
  const xs: number[] = [];
  const ys: number[] = [];
  for (let i = 0; i <= n; i++) {
    const x = xmin + i * dx;
    xs.push(x);
    ys.push(f(x));
  }
  const ok = (v: number) => Number.isFinite(v);
  const span = Math.max(...ys.filter(ok).map(Math.abs), 1);

  for (let i = 0; i < n; i++) {
    const [a, b] = [ys[i], ys[i + 1]];
    if (!ok(a) || !ok(b)) continue;
    if (a === 0) out.push({ x: xs[i], y: 0, kind: "root" });
    else if (a * b < 0 && Math.abs(a - b) < span * 0.5) {
      let lo = xs[i], hi = xs[i + 1], flo = a;
      for (let k = 0; k < 50; k++) {
        const mid = (lo + hi) / 2;
        const fm = f(mid);
        if (flo * fm <= 0) hi = mid;
        else {
          lo = mid;
          flo = fm;
        }
      }
      out.push({ x: (lo + hi) / 2, y: 0, kind: "root" });
    }
  }

  for (let i = 1; i < n; i++) {
    const [a, b, c] = [ys[i - 1], ys[i], ys[i + 1]];
    if (!ok(a) || !ok(b) || !ok(c)) continue;
    const isMax = b > a && b >= c;
    const isMin = b < a && b <= c;
    if (!isMax && !isMin) continue;
    // Perhalus dengan pencarian ternary.
    let lo = xs[i - 1], hi = xs[i + 1];
    for (let k = 0; k < 60; k++) {
      const m1 = lo + (hi - lo) / 3, m2 = hi - (hi - lo) / 3;
      if (isMax ? f(m1) < f(m2) : f(m1) > f(m2)) lo = m1;
      else hi = m2;
    }
    const x = (lo + hi) / 2;
    const y = f(x);
    // Lewati titik tajam palsu di dekat asimtot.
    if (ok(y) && Math.abs(y) < span * 0.95) out.push({ x, y, kind: "extremum" });
  }

  if (xmin <= 0 && xmax >= 0) {
    const y0 = f(0);
    if (ok(y0)) out.push({ x: 0, y: y0, kind: "yIntercept" });
  }

  // Hilangkan duplikat yang berdekatan.
  const dedup: KeyPoint[] = [];
  for (const p of out) {
    if (!dedup.some((q) => Math.abs(q.x - p.x) < dx * 2 && Math.abs(q.y - p.y) < 1e-6 + span * 1e-4)) dedup.push(p);
  }
  return dedup.slice(0, 16).map((p) => ({ ...p, x: clean(p.x), y: clean(p.y) }));
}

function clean(v: number) {
  const r = Math.round(v * 1e6) / 1e6;
  return Object.is(r, -0) ? 0 : r;
}
