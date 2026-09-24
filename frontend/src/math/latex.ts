// Parser LaTeX (atau teks biasa) -> pohon ekspresi untuk fungsi y = f(x).
// Sengaja toleran terhadap keluaran model pengenal (\boldsymbol, huruf berspasi "s i n", dll).

export type Node =
  | { type: "num"; v: number }
  | { type: "var"; name: string }
  | { type: "const"; name: "pi" | "e" }
  | { type: "bin"; op: "+" | "-" | "*" | "/" | "^"; a: Node; b: Node }
  | { type: "neg"; a: Node }
  | { type: "call"; fn: string; arg: Node; base?: Node }
  | { type: "abs"; a: Node };

export class ParseError extends Error {
  constructor(public code: string, message?: string) {
    super(message ?? code);
  }
}

type Tok =
  | { t: "num"; v: number }
  | { t: "id"; v: string } // variabel satu huruf / nama Yunani
  | { t: "fn"; v: string }
  | { t: "const"; v: "pi" | "e" }
  | { t: "op"; v: string }
  | { t: "frac" }
  | { t: "sqrt" };

const FUNCS = [
  "arcsin", "arccos", "arctan", "sinh", "cosh", "tanh", "sqrt", "sin", "cos", "tan", "cot", "sec", "csc",
  "log", "ln", "exp", "abs",
];
const GREEK = [
  "alpha", "beta", "gamma", "delta", "theta", "lambda", "mu", "omega", "phi", "varphi", "sigma", "tau", "rho", "kappa",
];
const FORMAT_CMDS = ["boldsymbol", "mathbf", "mathrm", "mathit", "mathsf", "textbf", "textit", "text", "bm", "operatorname", "mathnormal"];
const IGNORE_CMDS = ["left", "right", "displaystyle", "quad", "qquad", "big", "Big", "bigl", "bigr", "Bigl", "Bigr", "limits"];

function unwrapFormatting(s: string): string {
  for (const cmd of FORMAT_CMDS) {
    const re = new RegExp(`\\\\${cmd}\\s*\\{`);
    let m: RegExpExecArray | null;
    while ((m = re.exec(s))) {
      const open = m.index + m[0].length - 1;
      let depth = 0;
      let close = -1;
      for (let i = open; i < s.length; i++) {
        if (s[i] === "{") depth++;
        else if (s[i] === "}" && --depth === 0) {
          close = i;
          break;
        }
      }
      if (close < 0) break;
      s = s.slice(0, m.index) + " " + s.slice(open + 1, close) + " " + s.slice(close + 1);
    }
  }
  return s;
}

function preprocess(src: string): string {
  let s = src
    .replace(/\\\[|\\\]|\\\(|\\\)|\$/g, " ")
    .replace(/[−–]/g, "-")
    .replace(/[·×]/g, "*")
    .replace(/÷/g, "/")
    .replace(/π/g, "\\pi ")
    .replace(/²/g, "^2")
    .replace(/³/g, "^3");
  s = unwrapFormatting(s);
  s = s
    .replace(/\\[,;:!> ]/g, " ")
    .replace(/~/g, " ")
    .replace(/\{\s*,\s*\}/g, ".") // 2{,}5 -> 2.5
    .replace(/(\d)\s*,\s*(\d)/g, "$1.$2"); // desimal gaya Indonesia
  return s;
}

function tokenize(src: string): Tok[] {
  const s = preprocess(src);
  const toks: Tok[] = [];
  let i = 0;
  let letters = ""; // huruf berurutan (spasi di antaranya diabaikan)
  const flushLetters = () => {
    let j = 0;
    while (j < letters.length) {
      const rest = letters.slice(j);
      const fn = FUNCS.find((f) => rest.startsWith(f));
      if (fn) {
        toks.push(fn === "sqrt" ? { t: "sqrt" } : { t: "fn", v: fn });
        j += fn.length;
      } else if (rest.startsWith("pi")) {
        toks.push({ t: "const", v: "pi" });
        j += 2;
      } else {
        const c = rest[0];
        toks.push(c === "e" ? { t: "const", v: "e" } : { t: "id", v: c });
        j += 1;
      }
    }
    letters = "";
  };
  while (i < s.length) {
    const c = s[i];
    if (/\s/.test(c)) {
      i++;
      continue;
    }
    if (/[A-Za-z]/.test(c)) {
      letters += c;
      i++;
      continue;
    }
    flushLetters();
    if (/[0-9.]/.test(c)) {
      let j = i;
      while (j < s.length && /[0-9.]/.test(s[j])) j++;
      const v = parseFloat(s.slice(i, j));
      if (Number.isNaN(v)) throw new ParseError("bad_number");
      toks.push({ t: "num", v });
      i = j;
      continue;
    }
    if (c === "\\") {
      let j = i + 1;
      while (j < s.length && /[A-Za-z]/.test(s[j])) j++;
      const cmd = s.slice(i + 1, j);
      i = j;
      if (!cmd) {
        // "\{" "\}" "\|"
        const nx = s[i];
        i++;
        if (nx === "{" || nx === "}") toks.push({ t: "op", v: nx === "{" ? "(" : ")" });
        else if (nx === "|") toks.push({ t: "op", v: "|" });
        continue;
      }
      if (IGNORE_CMDS.includes(cmd)) continue;
      if (FUNCS.includes(cmd)) toks.push(cmd === "sqrt" ? { t: "sqrt" } : { t: "fn", v: cmd });
      else if (cmd === "frac" || cmd === "dfrac" || cmd === "tfrac") toks.push({ t: "frac" });
      else if (cmd === "pi") toks.push({ t: "const", v: "pi" });
      else if (cmd === "cdot" || cmd === "times" || cmd === "ast") toks.push({ t: "op", v: "*" });
      else if (cmd === "div") toks.push({ t: "op", v: "/" });
      else if (cmd === "lvert" || cmd === "rvert" || cmd === "vert" || cmd === "mid") toks.push({ t: "op", v: "|" });
      else if (GREEK.includes(cmd)) toks.push({ t: "id", v: cmd });
      else throw new ParseError("unknown_command", `\\${cmd}`);
      continue;
    }
    if ("+-*/^_=()[]{}|,".includes(c)) {
      toks.push({ t: "op", v: c });
      i++;
      continue;
    }
    if (c === "'" ) {
      i++;
      continue;
    }
    throw new ParseError("unknown_char", c);
  }
  flushLetters();
  return toks;
}

class Parser {
  i = 0;
  absDepth = 0;
  constructor(private toks: Tok[]) {}

  peek(): Tok | undefined {
    return this.toks[this.i];
  }
  isOp(v: string, k = 0) {
    const t = this.toks[this.i + k];
    return !!t && t.t === "op" && t.v === v;
  }
  eat(v: string) {
    if (!this.isOp(v)) throw new ParseError("expected", v);
    this.i++;
  }
  done() {
    return this.i >= this.toks.length;
  }

  parseExpr(): Node {
    let node: Node;
    if (this.isOp("-")) {
      this.i++;
      node = { type: "neg", a: this.parseTerm(false) };
    } else {
      if (this.isOp("+")) this.i++;
      node = this.parseTerm(false);
    }
    while (this.isOp("+") || this.isOp("-")) {
      const op = (this.toks[this.i++] as { v: string }).v as "+" | "-";
      node = { type: "bin", op, a: node, b: this.parseTerm(false) };
    }
    return node;
  }

  startsPrimary(stopAtFunc: boolean): boolean {
    const t = this.peek();
    if (!t) return false;
    if (t.t === "fn" || t.t === "sqrt") return !stopAtFunc;
    if (t.t === "num" || t.t === "id" || t.t === "const" || t.t === "frac") return true;
    if (t.t === "op") {
      if (t.v === "(" || t.v === "[" || t.v === "{") return true;
      if (t.v === "|") return this.absDepth === 0;
    }
    return false;
  }

  parseTerm(stopAtFunc: boolean): Node {
    let node = this.parseFactor();
    for (;;) {
      if (this.isOp("*") || this.isOp("/")) {
        const op = (this.toks[this.i++] as { v: string }).v as "*" | "/";
        node = { type: "bin", op, a: node, b: this.parseFactor() };
      } else if (this.startsPrimary(stopAtFunc)) {
        node = { type: "bin", op: "*", a: node, b: this.parseFactor() };
      } else break;
    }
    return node;
  }

  parseFactor(): Node {
    if (this.isOp("-")) {
      this.i++;
      return { type: "neg", a: this.parseFactor() };
    }
    if (this.isOp("+")) {
      this.i++;
      return this.parseFactor();
    }
    const base = this.parsePrimary();
    if (this.isOp("^")) {
      this.i++;
      return { type: "bin", op: "^", a: base, b: this.parseExponent() };
    }
    return base;
  }

  parseExponent(): Node {
    if (this.isOp("{")) return this.parseGroup("{", "}");
    if (this.isOp("-")) {
      this.i++;
      return { type: "neg", a: this.parseExponent() };
    }
    const p = this.parsePrimary();
    if (this.isOp("^")) {
      this.i++;
      return { type: "bin", op: "^", a: p, b: this.parseExponent() };
    }
    return p;
  }

  parseGroup(open: string, close: string): Node {
    this.eat(open);
    const saved = this.absDepth;
    this.absDepth = 0;
    const e = this.parseExpr();
    this.absDepth = saved;
    this.eat(close);
    return e;
  }

  parseArgGroup(): Node {
    if (this.isOp("{")) return this.parseGroup("{", "}");
    if (this.isOp("(")) return this.parseGroup("(", ")");
    return this.parsePrimary();
  }

  parsePrimary(): Node {
    const t = this.peek();
    if (!t) throw new ParseError("unexpected_end");
    if (t.t === "num") {
      this.i++;
      return { type: "num", v: t.v };
    }
    if (t.t === "const") {
      this.i++;
      return { type: "const", name: t.v };
    }
    if (t.t === "id") {
      this.i++;
      let name = t.v;
      if (this.isOp("_")) {
        this.i++;
        name += "_" + this.subscriptText();
      }
      return { type: "var", name };
    }
    if (t.t === "frac") {
      this.i++;
      const a = this.parseArgGroup();
      const b = this.parseArgGroup();
      return { type: "bin", op: "/", a, b };
    }
    if (t.t === "sqrt") {
      this.i++;
      let index: Node | undefined;
      if (this.isOp("[")) index = this.parseGroup("[", "]");
      const arg = this.isOp("{") || this.isOp("(") ? this.parseArgGroup() : this.parseFactor();
      if (index) return { type: "bin", op: "^", a: arg, b: { type: "bin", op: "/", a: { type: "num", v: 1 }, b: index } };
      return { type: "call", fn: "sqrt", arg };
    }
    if (t.t === "fn") {
      this.i++;
      let base: Node | undefined;
      let power: Node | undefined;
      if (t.v === "log" && this.isOp("_")) {
        this.i++;
        base = this.parseArgGroup();
      }
      if (this.isOp("^")) {
        this.i++;
        power = this.parseExponent();
      }
      let arg: Node;
      if (this.isOp("(") || this.isOp("{") || this.isOp("[")) {
        const open = (this.peek() as { v: string }).v;
        arg = this.parseGroup(open, open === "(" ? ")" : open === "{" ? "}" : "]");
        // sin(x)^2
        if (!power && this.isOp("^")) {
          this.i++;
          power = this.parseExponent();
        }
      } else {
        if (!this.startsPrimary(false)) throw new ParseError("missing_argument", t.v);
        arg = this.parseTerm(true);
      }
      const call: Node = { type: "call", fn: t.v, arg, base };
      return power ? { type: "bin", op: "^", a: call, b: power } : call;
    }
    if (t.t === "op") {
      if (t.v === "(") return this.parseGroup("(", ")");
      if (t.v === "[") return this.parseGroup("[", "]");
      if (t.v === "{") return this.parseGroup("{", "}");
      if (t.v === "|") {
        this.i++;
        this.absDepth++;
        const a = this.parseExpr();
        this.absDepth--;
        this.eat("|");
        return { type: "abs", a };
      }
    }
    throw new ParseError("unexpected_token", JSON.stringify(t));
  }

  subscriptText(): string {
    if (this.isOp("{")) {
      this.i++;
      let out = "";
      while (!this.done() && !this.isOp("}")) {
        const t = this.toks[this.i++];
        out += t.t === "num" ? String(t.v) : t.t === "op" ? "" : "v" in t ? String(t.v) : "";
      }
      this.eat("}");
      return out;
    }
    const t = this.toks[this.i++];
    if (!t) throw new ParseError("unexpected_end");
    return t.t === "num" ? String(t.v) : "v" in t ? String(t.v) : "";
  }
}

function splitTopLevelEquals(toks: Tok[]): Tok[][] {
  const parts: Tok[][] = [[]];
  let depth = 0;
  for (const t of toks) {
    if (t.t === "op" && "([{".includes(t.v)) depth++;
    if (t.t === "op" && ")]}".includes(t.v)) depth--;
    if (t.t === "op" && t.v === "=" && depth === 0) parts.push([]);
    else parts[parts.length - 1].push(t);
  }
  return parts;
}

/** Ruas "y" (atau huruf tunggal lain selain x, mis. salah baca y -> v) atau f(x). Mengembalikan nama variabelnya. */
function dependentVar(toks: Tok[]): string | null {
  if (toks.length === 1 && toks[0].t === "id" && toks[0].v !== "x") return toks[0].v;
  if (
    toks.length === 4 &&
    toks[0].t === "id" &&
    toks[1].t === "op" && toks[1].v === "(" &&
    toks[2].t === "id" && toks[2].v === "x" &&
    toks[3].t === "op" && toks[3].v === ")"
  )
    return "y";
  return null;
}

export interface ParsedFunction {
  ast: Node;
  params: string[];
  tex: string; // LaTeX yang sudah dirapikan, tanpa "y ="
}

export function parseFunction(src: string): ParsedFunction {
  const toks = tokenize(src);
  if (!toks.length) throw new ParseError("empty");
  const parts = splitTopLevelEquals(toks);
  let rhs: Tok[];
  let dep = "y";
  if (parts.length === 1) rhs = parts[0];
  else if (parts.length === 2 && dependentVar(parts[0])) [dep, rhs] = [dependentVar(parts[0])!, parts[1]];
  else if (parts.length === 2 && dependentVar(parts[1])) [dep, rhs] = [dependentVar(parts[1])!, parts[0]];
  else throw new ParseError("not_function");
  if (!rhs.length) throw new ParseError("empty");
  const p = new Parser(rhs);
  const ast = p.parseExpr();
  if (!p.done()) throw new ParseError("trailing", JSON.stringify(rhs[p.i]));
  const vars = new Set<string>();
  collectVars(ast, vars);
  if (vars.has("y") || vars.has(dep)) throw new ParseError("y_on_rhs");
  vars.delete("x");
  return { ast, params: [...vars].sort(), tex: toTex(ast) };
}

function collectVars(n: Node, out: Set<string>) {
  switch (n.type) {
    case "var":
      out.add(n.name);
      break;
    case "bin":
      collectVars(n.a, out);
      collectVars(n.b, out);
      break;
    case "neg":
    case "abs":
      collectVars(n.a, out);
      break;
    case "call":
      collectVars(n.arg, out);
      if (n.base) collectVars(n.base, out);
      break;
  }
}

const FN_IMPL: Record<string, (v: number) => number> = {
  sin: Math.sin, cos: Math.cos, tan: Math.tan,
  cot: (v) => 1 / Math.tan(v), sec: (v) => 1 / Math.cos(v), csc: (v) => 1 / Math.sin(v),
  arcsin: Math.asin, arccos: Math.acos, arctan: Math.atan,
  sinh: Math.sinh, cosh: Math.cosh, tanh: Math.tanh,
  sqrt: Math.sqrt, abs: Math.abs, exp: Math.exp, ln: Math.log, log: Math.log10,
};

export type CompiledFn = (x: number, params: Record<string, number>) => number;

export function compile(n: Node): CompiledFn {
  switch (n.type) {
    case "num": {
      const v = n.v;
      return () => v;
    }
    case "const": {
      const v = n.name === "pi" ? Math.PI : Math.E;
      return () => v;
    }
    case "var": {
      const name = n.name;
      if (name === "x") return (x) => x;
      return (_x, p) => p[name] ?? 1;
    }
    case "neg": {
      const a = compile(n.a);
      return (x, p) => -a(x, p);
    }
    case "abs": {
      const a = compile(n.a);
      return (x, p) => Math.abs(a(x, p));
    }
    case "call": {
      const arg = compile(n.arg);
      if (n.fn === "log" && n.base) {
        const base = compile(n.base);
        return (x, p) => Math.log(arg(x, p)) / Math.log(base(x, p));
      }
      const f = FN_IMPL[n.fn];
      return (x, p) => f(arg(x, p));
    }
    case "bin": {
      const a = compile(n.a);
      const b = compile(n.b);
      switch (n.op) {
        case "+": return (x, p) => a(x, p) + b(x, p);
        case "-": return (x, p) => a(x, p) - b(x, p);
        case "*": return (x, p) => a(x, p) * b(x, p);
        case "/": return (x, p) => a(x, p) / b(x, p);
        case "^": return (x, p) => signedPow(a(x, p), b(x, p));
      }
    }
  }
}

// Akar pangkat ganjil dari bilangan negatif (mis. x^(1/3)) tetap terdefinisi.
function signedPow(base: number, exp: number): number {
  const r = Math.pow(base, exp);
  if (Number.isNaN(r) && base < 0) {
    const inv = 1 / exp;
    if (Math.abs(inv - Math.round(inv)) < 1e-9 && Math.round(inv) % 2 !== 0) return -Math.pow(-base, exp);
  }
  return r;
}

// ---------- LaTeX rapi ----------

const PREC = { "+": 1, "-": 1, "*": 2, "/": 2, neg: 3, "^": 4, atom: 5 } as const;

function prec(n: Node): number {
  if (n.type === "bin") return PREC[n.op];
  if (n.type === "neg") return PREC.neg;
  return PREC.atom;
}

function varTex(name: string): string {
  const [head, sub] = name.split("_");
  const h = GREEK.includes(head) ? `\\${head}` : head;
  return sub ? `${h}_{${sub}}` : h;
}

function numTex(v: number): string {
  return Number.isInteger(v) ? String(v) : String(+v.toFixed(6));
}

function startsWithDigit(tex: string) {
  return /^[0-9.]/.test(tex);
}

export function toTex(n: Node): string {
  switch (n.type) {
    case "num": return numTex(n.v);
    case "const": return n.name === "pi" ? "\\pi" : "e";
    case "var": return varTex(n.name);
    case "neg": {
      const inner = toTex(n.a);
      return prec(n.a) <= PREC["-"] ? `-\\left(${inner}\\right)` : `-${inner}`;
    }
    case "abs": return `\\left|${toTex(n.a)}\\right|`;
    case "call": {
      if (n.fn === "sqrt") return `\\sqrt{${toTex(n.arg)}}`;
      if (n.fn === "abs") return `\\left|${toTex(n.arg)}\\right|`;
      const name = n.fn === "log" && n.base ? `\\log_{${toTex(n.base)}}` : `\\${n.fn}`;
      const simple = n.arg.type === "var" || n.arg.type === "num" || n.arg.type === "const";
      return simple ? `${name} ${toTex(n.arg)}` : `${name}\\left(${toTex(n.arg)}\\right)`;
    }
    case "bin": {
      const { op, a, b } = n;
      if (op === "/") return `\\frac{${toTex(a)}}{${toTex(b)}}`;
      if (op === "^") {
        if (a.type === "call" && a.fn !== "sqrt" && a.fn !== "abs" && !a.base) {
          const simple = a.arg.type === "var" || a.arg.type === "num" || a.arg.type === "const";
          const arg = simple ? ` ${toTex(a.arg)}` : `\\left(${toTex(a.arg)}\\right)`;
          return `\\${a.fn}^{${toTex(b)}}${arg}`;
        }
        const base = prec(a) < PREC.atom || a.type === "call" ? `\\left(${toTex(a)}\\right)` : toTex(a);
        return `${base}^{${toTex(b)}}`;
      }
      const la = prec(a) < PREC[op] ? `\\left(${toTex(a)}\\right)` : toTex(a);
      const needR = op === "-" ? prec(b) <= PREC[op] || b.type === "neg" : prec(b) < PREC[op];
      let rb = needR ? `\\left(${toTex(b)}\\right)` : toTex(b);
      if (op === "+" && b.type === "neg") return `${la}${rb}`;
      if (op === "*") {
        if (a.type === "num" && a.v === 1) return toTex(b);
        if (b.type === "neg") rb = `\\left(${toTex(b)}\\right)`;
        const implicit = !startsWithDigit(rb) && a.type !== "call";
        return implicit ? `${la}${rb.startsWith("\\") ? " " : ""}${rb}` : `${la}\\cdot ${rb}`;
      }
      return `${la}${op}${rb}`;
    }
  }
}

/** Ganti parameter dengan nilainya, untuk ditampilkan/dikirim ke AI. */
export function substituteTex(n: Node, params: Record<string, number>): string {
  const sub = (m: Node): Node => {
    switch (m.type) {
      case "var":
        return m.name !== "x" && m.name in params
          ? params[m.name] < 0
            ? { type: "neg", a: { type: "num", v: -params[m.name] } }
            : { type: "num", v: params[m.name] }
          : m;
      case "bin": return { ...m, a: sub(m.a), b: sub(m.b) };
      case "neg": return { ...m, a: sub(m.a) };
      case "abs": return { ...m, a: sub(m.a) };
      case "call": return { ...m, arg: sub(m.arg), base: m.base && sub(m.base) };
      default: return m;
    }
  };
  return toTex(sub(n));
}
