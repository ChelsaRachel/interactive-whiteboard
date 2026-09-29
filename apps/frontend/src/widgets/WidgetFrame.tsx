import { useRef, type ReactNode } from "react";
import { X } from "lucide-react";
import type { Widget } from "../board";
import { useI18n } from "../i18n";

interface Props {
  widget: Widget;
  z: number;
  title: ReactNode;
  icon?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  minW?: number;
  minH?: number;
  onFocus: () => void;
  onCheckpoint: () => void;
  onChange: (patch: Partial<Widget>) => void;
  onClose: () => void;
  className?: string;
}

export function WidgetFrame({
  widget, z, title, icon, actions, children, minW = 240, minH = 180, onFocus, onCheckpoint, onChange, onClose, className,
}: Props) {
  const { t } = useI18n();
  const drag = useRef<{ id: number; sx: number; sy: number; x: number; y: number; w: number; h: number; mode: "move" | "resize" } | null>(null);

  const start = (mode: "move" | "resize") => (e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest("button, input, select, label")) return;
    e.preventDefault();
    e.stopPropagation();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    onCheckpoint();
    drag.current = { id: e.pointerId, sx: e.clientX, sy: e.clientY, x: widget.x, y: widget.y, w: widget.w, h: widget.h, mode };
  };
  const move = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    const dx = e.clientX - d.sx, dy = e.clientY - d.sy;
    if (d.mode === "move") {
      onChange({
        x: Math.min(Math.max(d.x + dx, -d.w + 80), window.innerWidth - 80),
        y: Math.min(Math.max(d.y + dy, 0), window.innerHeight - 40),
      });
    } else {
      onChange({ w: Math.max(minW, d.w + dx), h: Math.max(minH, d.h + dy) });
    }
  };
  const end = (e: React.PointerEvent) => {
    if (drag.current?.id === e.pointerId) drag.current = null;
  };

  return (
    <div
      className={`widget ${className ?? ""}`}
      style={{ left: widget.x, top: widget.y, width: widget.w, height: widget.h, zIndex: 10 + z }}
      onPointerDownCapture={onFocus}
    >
      <div className="widget-header" onPointerDown={start("move")} onPointerMove={move} onPointerUp={end} onPointerCancel={end}>
        <span className="widget-title">
          {icon}
          {title}
        </span>
        <span className="widget-actions">
          {actions}
          <button className="icon-btn" title={t("close")} onClick={onClose}>
            <X size={16} />
          </button>
        </span>
      </div>
      <div className="widget-body">{children}</div>
      <div className="widget-resize" onPointerDown={start("resize")} onPointerMove={move} onPointerUp={end} onPointerCancel={end} />
    </div>
  );
}
