// State papan (goresan + widget) dengan riwayat urungkan/ulangi.

import type { Stroke } from "./ink/strokes";
import type { EdgePoint } from "./geometry/section";
import type { SolidType } from "./geometry/solids";

export interface FunctionDef {
  id: string;
  latex: string; // LaTeX asli (sudah dirapikan), tanpa "y ="
  params: Record<string, number>;
  color: string;
  visible: boolean;
}

interface WidgetBase {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface GraphWidget extends WidgetBase {
  kind: "graph";
  functions: FunctionDef[];
  view: { cx: number; cy: number; ppu: number }; // pusat tampilan & piksel per satuan
  keyPoints: boolean;
}

export interface SolidWidget extends WidgetBase {
  kind: "solid";
  solid: SolidType;
  rotation: [number, number, number, number]; // kuaternion x, y, z, w
  picks: EdgePoint[];
  sphere: "none" | "in" | "out";
  mode: "rotate" | "points";
  labels: boolean;
}

export interface SectionWidget extends WidgetBase {
  kind: "section";
  solidId: string;
}

export type Widget = GraphWidget | SolidWidget | SectionWidget;

export interface BoardState {
  strokes: Stroke[];
  widgets: Widget[];
}

export interface History {
  past: BoardState[];
  present: BoardState;
  future: BoardState[];
}

export type Action =
  | { type: "addStroke"; stroke: Stroke }
  | { type: "removeStrokes"; ids: string[] }
  | { type: "addWidget"; widget: Widget; removeStrokes?: string[] }
  | { type: "updateWidget"; id: string; patch: Partial<Widget>; record?: boolean }
  | { type: "removeWidget"; id: string }
  | { type: "batch"; actions: Action[] }
  | { type: "focus"; id: string }
  | { type: "checkpoint" }
  | { type: "clear" }
  | { type: "undo" }
  | { type: "redo" };

export const emptyBoard: BoardState = { strokes: [], widgets: [] };
const LIMIT = 100;

export function uid(prefix = "") {
  return prefix + Math.random().toString(36).slice(2, 9);
}

function apply(state: BoardState, action: Action): BoardState {
  switch (action.type) {
    case "addStroke":
      return { ...state, strokes: [...state.strokes, action.stroke] };
    case "removeStrokes": {
      const ids = new Set(action.ids);
      return { ...state, strokes: state.strokes.filter((s) => !ids.has(s.id)) };
    }
    case "addWidget": {
      const ids = new Set(action.removeStrokes ?? []);
      return {
        strokes: ids.size ? state.strokes.filter((s) => !ids.has(s.id)) : state.strokes,
        widgets: [...state.widgets, action.widget],
      };
    }
    case "updateWidget":
      return {
        ...state,
        widgets: state.widgets.map((w) => (w.id === action.id ? ({ ...w, ...action.patch } as Widget) : w)),
      };
    case "removeWidget":
      return {
        ...state,
        // Widget irisan ikut terhapus bersama bangunnya.
        widgets: state.widgets.filter(
          (w) => w.id !== action.id && !(w.kind === "section" && w.solidId === action.id),
        ),
      };
    case "batch":
      return action.actions.reduce(apply, state);
    case "clear":
      return emptyBoard;
    default:
      return state;
  }
}

export function historyReducer(h: History, action: Action): History {
  switch (action.type) {
    case "undo":
      if (!h.past.length) return h;
      return { past: h.past.slice(0, -1), present: h.past[h.past.length - 1], future: [h.present, ...h.future] };
    case "redo":
      if (!h.future.length) return h;
      return { past: [...h.past, h.present], present: h.future[0], future: h.future.slice(1) };
    case "checkpoint":
      return { past: [...h.past, h.present].slice(-LIMIT), present: h.present, future: [] };
    case "focus": {
      const widgets = bringToFront(h.present.widgets, action.id);
      return widgets === h.present.widgets ? h : { ...h, present: { ...h.present, widgets } };
    }
    case "updateWidget":
      if (!action.record) return { ...h, present: apply(h.present, action) };
      break;
  }
  const next = apply(h.present, action);
  if (next === h.present) return h;
  return { past: [...h.past, h.present].slice(-LIMIT), present: next, future: [] };
}

export const FUNCTION_COLORS = ["#ff5d73", "#4cc9f0", "#80ed99", "#ffd166", "#c77dff", "#ff9f1c"];

export function bringToFront(widgets: Widget[], id: string): Widget[] {
  const w = widgets.find((x) => x.id === id);
  if (!w || widgets[widgets.length - 1].id === id) return widgets;
  return [...widgets.filter((x) => x.id !== id), w];
}
