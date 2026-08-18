"use client";

import { GripVertical } from "lucide-react";
import type { DragEvent, KeyboardEvent, MouseEvent, PointerEvent } from "react";
import type { KeywordTableOrderMode } from "@/lib/minerador/manual-order";

export { type KeywordTableOrderMode } from "@/lib/minerador/manual-order";

export function KeywordTableOrderModeSelect({ value, onChange }: { value: KeywordTableOrderMode; onChange: (value: KeywordTableOrderMode) => void }) {
  return (
    <label className="flex min-w-[180px] flex-1 flex-col gap-1 text-sm font-semibold text-foreground/80">
      Organização das linhas
      <select
        aria-label="Organização das linhas"
        value={value}
        onChange={event => onChange(event.target.value as KeywordTableOrderMode)}
        className="h-9 w-full rounded border border-divider bg-surface-subtle px-3 text-sm text-foreground outline-none transition-colors focus:border-module-accent/50 focus-visible:ring-2 focus-visible:ring-module-accent/40"
      >
        <option value="auto">Ordenação por coluna</option>
        <option value="manual">Ordem manual</option>
      </select>
    </label>
  );
}

export function KeywordTableDragHandle({
  id,
  label,
  enabled,
  onDragStart,
  onDragEnd,
  onPointerDragStart,
  onMouseDragStart,
  onKeyboardMove,
}: {
  id: string;
  label: string;
  enabled: boolean;
  onDragStart: (id: string) => void;
  onDragEnd: () => void;
  onPointerDragStart?: (id: string, event: PointerEvent<HTMLButtonElement>) => void;
  onMouseDragStart?: (id: string, event: MouseEvent<HTMLButtonElement>) => void;
  onKeyboardMove: (id: string, offset: -1 | 1) => void;
}) {
  const handleDragStart = (event: DragEvent<HTMLButtonElement>) => {
    if (!enabled) {
      event.preventDefault();
      return;
    }
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", id);
    onDragStart(id);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (!enabled) return;
    if (event.key === "ArrowUp" || event.key === "ArrowDown") {
      event.preventDefault();
      onKeyboardMove(id, event.key === "ArrowUp" ? -1 : 1);
    }
  };

  return (
    <button
      type="button"
      draggable={enabled}
      aria-label={`Reordenar ${label}`}
      aria-disabled={!enabled}
      title={enabled ? "Arraste para reorganizar. Use as setas do teclado para mover." : "Selecione Ordem manual para reorganizar"}
      onDragStart={handleDragStart}
      onDragEnd={onDragEnd}
      onPointerDown={event => { if (enabled) onPointerDragStart?.(id, event); }}
      onMouseDown={event => { if (enabled) onMouseDragStart?.(id, event); }}
      onKeyDown={handleKeyDown}
      className={`touch-none inline-flex h-7 w-7 items-center justify-center rounded border border-transparent text-text-muted transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-module-accent/40 ${enabled ? "cursor-grab hover:border-divider hover:bg-surface-elevated hover:text-foreground active:cursor-grabbing" : "cursor-not-allowed opacity-45"}`}
    >
      <GripVertical className="h-3.5 w-3.5" aria-hidden="true" />
    </button>
  );
}
