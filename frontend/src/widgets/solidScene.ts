import * as THREE from "three";
import { LineSegments2 } from "three/addons/lines/LineSegments2.js";
import { LineSegmentsGeometry } from "three/addons/lines/LineSegmentsGeometry.js";
import { LineMaterial } from "three/addons/lines/LineMaterial.js";
import { edgeFaces, maxExtent, sphereRadius, type Solid, type Vec3 } from "../geometry/solids";
import { edgePointPosition, snapT, type EdgePoint, type Section } from "../geometry/section";

const COLORS = {
  edge: 0xf5f7fa,
  hidden: 0xb8c2cf,
  pick: 0xff5da2,
  sectionFill: 0x3a86ff,
  sectionLine: 0x9cc3ff,
  sphere: 0x4d8dff,
};

const SECTION_LABELS = ["P", "Q", "R", "S", "T", "U", "V", "W"];

export class SolidScene {
  readonly renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(28, 1, 0.1, 100);
  private root = new THREE.Group(); // diputar
  private body = new THREE.Group(); // diskalakan agar muat
  private visible: LineSegments2;
  private hidden: LineSegments2;
  private faceMesh: THREE.Mesh | null = null;
  private dots = new THREE.Group();
  private picksGroup = new THREE.Group();
  private sectionGroup = new THREE.Group();
  private sphereGroup = new THREE.Group();
  private materials: LineMaterial[] = [];
  private solid: Solid | null = null;
  private adjacency: number[][] = [];
  private width = 1;
  private height = 1;
  private section: Section | null = null;

  constructor(private labelLayer: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setPixelRatio(window.devicePixelRatio || 1);
    this.renderer.setClearColor(0x000000, 0);
    this.camera.position.set(0, 0, 4.6);
    this.scene.add(this.root);
    this.root.add(this.body);
    this.scene.add(new THREE.AmbientLight(0xffffff, 1.4));
    const light = new THREE.DirectionalLight(0xffffff, 1.6);
    light.position.set(2, 3, 4);
    this.scene.add(light);

    const visMat = this.lineMaterial(COLORS.edge, 2.6, false, 1);
    const hidMat = this.lineMaterial(COLORS.hidden, 1.6, true, 0.75);
    this.visible = new LineSegments2(new LineSegmentsGeometry(), visMat);
    this.hidden = new LineSegments2(new LineSegmentsGeometry(), hidMat);
    this.body.add(this.hidden, this.visible, this.dots, this.sectionGroup, this.picksGroup, this.sphereGroup);
  }

  private lineMaterial(color: number, width: number, dashed: boolean, opacity: number) {
    const m = new LineMaterial({
      color, linewidth: width, dashed, dashSize: 0.06, gapSize: 0.05, transparent: opacity < 1, opacity,
      worldUnits: false,
    });
    m.resolution.set(this.width, this.height);
    this.materials.push(m);
    return m;
  }

  setSolid(solid: Solid) {
    this.solid = solid;
    this.adjacency = edgeFaces(solid);
    const extent = maxExtent(solid);
    const s = 1 / extent;
    this.body.scale.setScalar(s);
    const dashMat = this.hidden.material as LineMaterial;
    dashMat.dashSize = 0.055 * extent;
    dashMat.gapSize = 0.045 * extent;
    this.dots.clear();
    const dotGeo = new THREE.SphereGeometry(0.035 / s, 12, 8);
    const dotMat = new THREE.MeshBasicMaterial({ color: COLORS.edge });
    for (const v of solid.vertices) {
      const m = new THREE.Mesh(dotGeo, dotMat);
      m.position.set(...v);
      this.dots.add(m);
    }
    if (this.faceMesh) this.body.remove(this.faceMesh);
    const pos: number[] = [];
    for (const f of solid.faces) {
      for (let k = 1; k + 1 < f.length; k++) pos.push(...solid.vertices[f[0]], ...solid.vertices[f[k]], ...solid.vertices[f[k + 1]]);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    this.faceMesh = new THREE.Mesh(
      g,
      new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.035, side: THREE.DoubleSide, depthWrite: false }),
    );
    this.body.add(this.faceMesh);
  }

  setRotation(q: [number, number, number, number]) {
    this.root.quaternion.set(...q);
  }

  setPicks(picks: EdgePoint[], section: Section | null) {
    if (!this.solid) return;
    const s = this.body.scale.x;
    this.picksGroup.clear();
    const geo = new THREE.SphereGeometry(0.05 / s, 16, 12);
    const mat = new THREE.MeshBasicMaterial({ color: COLORS.pick });
    for (const p of picks) {
      const m = new THREE.Mesh(geo, mat);
      m.position.set(...edgePointPosition(this.solid, p));
      this.picksGroup.add(m);
    }
    this.sectionGroup.clear();
    this.section = section;
    if (section) {
      const pts = section.points3d;
      const pos: number[] = [];
      for (let k = 1; k + 1 < pts.length; k++) pos.push(...pts[0], ...pts[k], ...pts[k + 1]);
      const g = new THREE.BufferGeometry();
      g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
      this.sectionGroup.add(
        new THREE.Mesh(
          g,
          new THREE.MeshBasicMaterial({ color: COLORS.sectionFill, transparent: true, opacity: 0.55, side: THREE.DoubleSide, depthWrite: false }),
        ),
      );
      const seg: number[] = [];
      pts.forEach((p, i) => seg.push(...p, ...pts[(i + 1) % pts.length]));
      const lg = new LineSegmentsGeometry();
      lg.setPositions(seg);
      this.sectionGroup.add(new LineSegments2(lg, this.lineMaterial(COLORS.sectionLine, 2.2, false, 1)));
    }
  }

  setSphere(kind: "none" | "in" | "out") {
    this.sphereGroup.clear();
    if (kind === "none" || !this.solid) return;
    const r = sphereRadius(this.solid, kind);
    this.sphereGroup.add(
      new THREE.Mesh(
        new THREE.SphereGeometry(r, 48, 32),
        new THREE.MeshLambertMaterial({ color: COLORS.sphere, transparent: true, opacity: 0.42, depthWrite: false }),
      ),
    );
    const ring = (color: number, rot: THREE.Euler) => {
      const seg: number[] = [];
      const n = 96;
      for (let i = 0; i < n; i++) {
        const a0 = (i / n) * Math.PI * 2, a1 = ((i + 1) / n) * Math.PI * 2;
        seg.push(Math.cos(a0) * r, Math.sin(a0) * r, 0, Math.cos(a1) * r, Math.sin(a1) * r, 0);
      }
      const g = new LineSegmentsGeometry();
      g.setPositions(seg);
      const l = new LineSegments2(g, this.lineMaterial(color, 2.4, false, 1));
      l.rotation.copy(rot);
      this.sphereGroup.add(l);
    };
    ring(0xff4d6d, new THREE.Euler(0, 0, 0));
    ring(0x3a86ff, new THREE.Euler(Math.PI / 2, 0, 0));
    ring(0x52d17c, new THREE.Euler(0, Math.PI / 2, 0));
  }

  resize(w: number, h: number) {
    this.width = Math.max(1, w);
    this.height = Math.max(1, h);
    this.renderer.setSize(this.width, this.height, false);
    this.camera.aspect = this.width / this.height;
    // Pastikan bola pembatas (jari-jari 1) muat pada sisi terpendek.
    const vfov = (this.camera.fov * Math.PI) / 180;
    const fit = this.camera.aspect < 1 ? 1 / this.camera.aspect : 1;
    this.camera.position.z = (1.18 / Math.sin(vfov / 2)) * fit;
    this.camera.updateProjectionMatrix();
    for (const m of this.materials) m.resolution.set(this.width, this.height);
  }

  private worldOf(v: Vec3): THREE.Vector3 {
    return this.body.localToWorld(new THREE.Vector3(...v));
  }

  private frontFacing(): boolean[] {
    const solid = this.solid!;
    const cam = this.camera.position;
    return solid.faces.map((f) => {
      const [a, b, c] = f.slice(0, 3).map((i) => this.worldOf(solid.vertices[i]));
      const n = new THREE.Vector3().subVectors(b, a).cross(new THREE.Vector3().subVectors(c, a));
      const center = f.reduce((acc, i) => acc.add(this.worldOf(solid.vertices[i])), new THREE.Vector3()).divideScalar(f.length);
      return n.dot(new THREE.Vector3().subVectors(cam, center)) > 0;
    });
  }

  render(showLabels: boolean) {
    if (!this.solid) return;
    this.root.updateMatrixWorld(true);
    const solid = this.solid;
    const front = this.frontFacing();
    const vis: number[] = [];
    const hid: number[] = [];
    solid.edges.forEach(([a, b], i) => {
      const target = this.adjacency[i].some((fi) => front[fi]) ? vis : hid;
      target.push(...solid.vertices[a], ...solid.vertices[b]);
    });
    this.visible.geometry.dispose();
    this.hidden.geometry.dispose();
    const vg = new LineSegmentsGeometry();
    vg.setPositions(vis.length ? vis : [0, 0, 0, 0, 0, 0]);
    const hg = new LineSegmentsGeometry();
    hg.setPositions(hid.length ? hid : [0, 0, 0, 0, 0, 0]);
    this.visible.geometry = vg;
    this.hidden.geometry = hg;
    this.visible.visible = vis.length > 0;
    this.hidden.visible = hid.length > 0;
    this.hidden.computeLineDistances();
    this.renderer.render(this.scene, this.camera);
    this.updateLabels(showLabels, front);
  }

  private project(v: Vec3): [number, number] {
    const p = this.worldOf(v).project(this.camera);
    return [((p.x + 1) / 2) * this.width, ((1 - p.y) / 2) * this.height];
  }

  private updateLabels(show: boolean, front: boolean[]) {
    const solid = this.solid!;
    const center = this.project([0, 0, 0]);
    const html: string[] = [];
    if (show) {
      solid.vertices.forEach((v, i) => {
        const [x, y] = this.project(v);
        const facesOf = solid.faces.map((f, fi) => (f.includes(i) ? fi : -1)).filter((fi) => fi >= 0);
        const hiddenVertex = !facesOf.some((fi) => front[fi]);
        const dx = x - center[0], dy = y - center[1];
        const d = Math.hypot(dx, dy) || 1;
        html.push(
          `<span class="solid-label${hiddenVertex ? " dim" : ""}" style="left:${x + (dx / d) * 14}px;top:${y + (dy / d) * 14}px">${solid.labels[i]}</span>`,
        );
      });
    }
    if (this.section) {
      this.section.points3d.forEach((p, i) => {
        const [x, y] = this.project(p);
        html.push(`<span class="solid-label section" style="left:${x + 10}px;top:${y - 10}px">${SECTION_LABELS[i] ?? ""}</span>`);
      });
    }
    this.labelLayer.innerHTML = html.join("");
  }

  /** Cari titik pada rusuk terdekat dari posisi layar (piksel relatif kanvas). */
  pickEdge(px: number, py: number, maxDist = 18): EdgePoint | null {
    if (!this.solid) return null;
    this.root.updateMatrixWorld(true);
    const ndc = new THREE.Vector2((px / this.width) * 2 - 1, -(py / this.height) * 2 + 1);
    const ray = new THREE.Raycaster();
    ray.setFromCamera(ndc, this.camera);
    let best: { edge: number; t: number; d: number } | null = null;
    this.solid.edges.forEach(([a, b], edge) => {
      const A = this.worldOf(this.solid!.vertices[a]);
      const B = this.worldOf(this.solid!.vertices[b]);
      const onSeg = new THREE.Vector3();
      ray.ray.distanceSqToSegment(A, B, undefined, onSeg);
      const sp = onSeg.clone().project(this.camera);
      const sx = ((sp.x + 1) / 2) * this.width, sy = ((1 - sp.y) / 2) * this.height;
      const d = Math.hypot(sx - px, sy - py);
      if (d <= maxDist && (!best || d < best.d)) {
        best = { edge, t: A.distanceTo(onSeg) / A.distanceTo(B), d };
      }
    });
    if (!best) return null;
    const found = best as { edge: number; t: number };
    return { edge: found.edge, t: snapT(found.t) };
  }

  dispose() {
    this.renderer.dispose();
  }
}

export function initialRotation(): [number, number, number, number] {
  const qx = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), 0.36);
  const qy = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), -0.62);
  const q = qx.multiply(qy);
  return [q.x, q.y, q.z, q.w];
}

export function rotateBy(q: [number, number, number, number], dx: number, dy: number): [number, number, number, number] {
  const cur = new THREE.Quaternion(...q);
  const rx = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), dy * 0.01);
  const ry = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), dx * 0.01);
  const next = rx.multiply(ry).multiply(cur).normalize();
  return [next.x, next.y, next.z, next.w];
}
