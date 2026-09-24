import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Box, Check, Cuboid, Pyramid, Triangle } from "lucide-react";
import { ParseError, parseFunction, type ParsedFunction } from "../math/latex";
import { formatNumber, useI18n, type TKey } from "../i18n";
import { SOLID_TYPES, type SolidType } from "../geometry/solids";
import { Tex } from "./Tex";

function Modal({ title, children, footer, onClose }: { title: string; children: ReactNode; footer: ReactNode; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="modal-backdrop" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-label={title}>
        <h2>{title}</h2>
        <div className="modal-body">{children}</div>
        <div className="modal-footer">{footer}</div>
      </div>
    </div>
  );
}

export function useFormula(src: string): { parsed?: ParsedFunction; error?: string } {
  const { t } = useI18n();
  return useMemo(() => {
    if (!src.trim()) return { error: t("err_empty") };
    try {
      return { parsed: parseFunction(src) };
    } catch (e) {
      if (e instanceof ParseError) {
        const key = `err_${e.code}` as TKey;
        const known = ["err_empty", "err_not_function", "err_y_on_rhs"].includes(key);
        return { error: known ? t(key) : `${t("err_generic")} (${e.message})` };
      }
      return { error: t("err_generic") };
    }
  }, [src, t]);
}

function FormulaField({ value, onChange, autoFocus }: { value: string; onChange: (v: string) => void; autoFocus?: boolean }) {
  const { t } = useI18n();
  const { parsed, error } = useFormula(value);
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (autoFocus) ref.current?.focus();
  }, [autoFocus]);
  return (
    <div className="formula-field">
      <input ref={ref} value={value} placeholder={t("formulaPlaceholder")} spellCheck={false} onChange={(e) => onChange(e.target.value)} />
      <div className={`formula-preview ${error ? "error" : ""}`}>
        {parsed ? <Tex tex={`y = ${parsed.tex}`} display /> : <span>{error}</span>}
      </div>
    </div>
  );
}

export function FormulaDialog({
  title, initial, confirmLabel, onConfirm, onCancel,
}: {
  title: string;
  initial: string;
  confirmLabel: string;
  onConfirm: (p: ParsedFunction) => void;
  onCancel: () => void;
}) {
  const { t } = useI18n();
  const [value, setValue] = useState(initial);
  const { parsed } = useFormula(value);
  const submit = () => parsed && onConfirm(parsed);
  return (
    <Modal
      title={title}
      onClose={onCancel}
      footer={
        <>
          <button className="btn ghost" onClick={onCancel}>{t("cancel")}</button>
          <button className="btn primary" disabled={!parsed} onClick={submit}>
            <Check size={16} /> {confirmLabel}
          </button>
        </>
      }
    >
      <p className="muted">{t("formulaHint")}</p>
      <form onSubmit={(e) => (e.preventDefault(), submit())}>
        <FormulaField value={value} onChange={setValue} autoFocus />
      </form>
    </Modal>
  );
}

export interface RecognizedItem {
  latex: string;
  confidence: number;
  elapsed_ms: number;
  model: string;
}

export function RecognizeDialog({
  items, onConfirm, onCancel,
}: {
  items: RecognizedItem[];
  onConfirm: (parsed: ParsedFunction[]) => void;
  onCancel: () => void;
}) {
  const { t, lang } = useI18n();
  const [values, setValues] = useState(items.map((i) => i.latex));
  const [include, setInclude] = useState(items.map(() => true));
  const parsedList = values.map((v) => {
    try {
      return parseFunction(v);
    } catch {
      return null;
    }
  });
  const chosen = parsedList.filter((p, i) => p && include[i]) as ParsedFunction[];
  return (
    <Modal
      title={t("recognizedTitle")}
      onClose={onCancel}
      footer={
        <>
          <button className="btn ghost" onClick={onCancel}>{t("cancel")}</button>
          <button className="btn primary" disabled={!chosen.length} onClick={() => onConfirm(chosen)}>
            <Check size={16} /> {t("plot")}
          </button>
        </>
      }
    >
      <p className="muted">{t("recognizedHint")}</p>
      {items.map((it, i) => (
        <div key={i} className="recognized-item">
          <div className="recognized-meta">
            <label className="check">
              <input type="checkbox" checked={include[i]} onChange={(e) => setInclude(include.map((v, j) => (j === i ? e.target.checked : v)))} />
              {t("lineN")} {i + 1}
            </label>
            <span className="muted small">
              {it.model} · {t("confidence")} {formatNumber(it.confidence * 100, lang, 0)}% · {it.elapsed_ms} ms
            </span>
          </div>
          <FormulaField value={values[i]} onChange={(v) => setValues(values.map((x, j) => (j === i ? v : x)))} />
        </div>
      ))}
    </Modal>
  );
}

const SOLID_ICONS: Record<SolidType, ReactNode> = {
  cube: <Box size={28} />,
  cuboid: <Cuboid size={28} />,
  squarePyramid: <Pyramid size={28} />,
  triPyramid: <Triangle size={28} />,
  triPrism: <Cuboid size={28} style={{ transform: "skewX(-12deg)" }} />,
};

export function SolidChooser({ guess, hint, onChoose, onCancel }: { guess?: SolidType; hint?: boolean; onChoose: (t: SolidType) => void; onCancel: () => void }) {
  const { t } = useI18n();
  return (
    <Modal title={t("chooseSolid")} onClose={onCancel} footer={<button className="btn ghost" onClick={onCancel}>{t("cancel")}</button>}>
      {hint && <p className="muted">{t("chooseSolidHint")}</p>}
      <div className="solid-grid">
        {SOLID_TYPES.map((s) => (
          <button key={s} className={`solid-option ${guess === s ? "suggested" : ""}`} onClick={() => onChoose(s)}>
            {SOLID_ICONS[s]}
            <span>{t(`solid_${s}` as TKey)}</span>
          </button>
        ))}
      </div>
    </Modal>
  );
}
