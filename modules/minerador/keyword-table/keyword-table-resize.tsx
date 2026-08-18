"use client";

import { useCallback, useEffect, useRef, useState, type MouseEvent, type PointerEvent } from "react";

export type KeywordTableResizeStartEvent = MouseEvent<HTMLButtonElement> | PointerEvent<HTMLButtonElement>;

type WidthConstraints = { min?: number; max?: number };

function clamp(value: number, constraints: WidthConstraints = {}) {
  return Math.min(constraints.max ?? 960, Math.max(constraints.min ?? 56, value));
}

export function useKeywordTableColumnResize(
  initialWidths: Record<string, number>,
  constraints: Record<string, WidthConstraints> = {},
) {
  const [widths, setWidths] = useState(initialWidths);
  const widthsRef = useRef(widths);
  const cleanupRef = useRef<(() => void) | null>(null);
  useEffect(() => { widthsRef.current = widths; }, [widths]);

  const finish = useCallback(() => {
    cleanupRef.current?.();
    cleanupRef.current = null;
    document.body.style.cursor = "";
    document.body.style.userSelect = "";
  }, []);

  const startResize = useCallback((columnId: string, event: KeywordTableResizeStartEvent) => {
    event.preventDefault();
    event.stopPropagation();
    if (cleanupRef.current) return;
    const startX = event.clientX;
    const startWidth = widthsRef.current[columnId] ?? 120;
    const handleMove = (moveEvent: globalThis.MouseEvent | globalThis.PointerEvent) => {
      moveEvent.preventDefault();
      const nextWidth = clamp(startWidth + moveEvent.clientX - startX, constraints[columnId]);
      setWidths(current => current[columnId] === nextWidth ? current : { ...current, [columnId]: nextWidth });
    };
    const handleEnd = () => finish();
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    window.addEventListener("pointermove", handleMove, { passive: false });
    window.addEventListener("mousemove", handleMove, { passive: false });
    window.addEventListener("pointerup", handleEnd, { once: true });
    window.addEventListener("mouseup", handleEnd, { once: true });
    window.addEventListener("pointercancel", handleEnd, { once: true });
    cleanupRef.current = () => {
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("mousemove", handleMove);
      window.removeEventListener("pointerup", handleEnd);
      window.removeEventListener("mouseup", handleEnd);
      window.removeEventListener("pointercancel", handleEnd);
    };
  }, [constraints, finish]);

  useEffect(() => finish, [finish]);

  return { widths, startResize };
}

export function KeywordTableColumnResizeHandle({
  columnId,
  label,
  onStart,
}: {
  columnId: string;
  label: string;
  onStart: (columnId: string, event: KeywordTableResizeStartEvent) => void;
}) {
  return (
    <button
      type="button"
      aria-label={`Redimensionar coluna ${label}`}
      title="Arraste para redimensionar a coluna"
      onPointerDown={event => onStart(columnId, event)}
      onMouseDown={event => onStart(columnId, event)}
      className="touch-none absolute inset-y-0 right-0 z-10 w-2 cursor-col-resize rounded-none border-0 bg-transparent p-0 outline-none transition-colors hover:bg-module-accent/30 focus-visible:bg-module-accent/40"
    />
  );
}

export function useKeywordTableRowResize(defaultHeight = 44, constraints: WidthConstraints = { min: 36, max: 128 }) {
  const [heights, setHeights] = useState<Record<string, number>>({});
  const heightsRef = useRef(heights);
  const cleanupRef = useRef<(() => void) | null>(null);
  useEffect(() => { heightsRef.current = heights; }, [heights]);

  const finish = useCallback(() => {
    cleanupRef.current?.();
    cleanupRef.current = null;
    document.body.style.cursor = "";
    document.body.style.userSelect = "";
  }, []);

  const getHeight = useCallback((rowId: string) => heights[rowId] ?? defaultHeight, [defaultHeight, heights]);

  const startResize = useCallback((rowId: string, event: KeywordTableResizeStartEvent) => {
    event.preventDefault();
    event.stopPropagation();
    if (cleanupRef.current) return;
    const startY = event.clientY;
    const startHeight = getHeight(rowId);
    const handleMove = (moveEvent: globalThis.MouseEvent | globalThis.PointerEvent) => {
      moveEvent.preventDefault();
      const nextHeight = clamp(startHeight + moveEvent.clientY - startY, constraints);
      setHeights(current => current[rowId] === nextHeight ? current : { ...current, [rowId]: nextHeight });
    };
    const handleEnd = () => finish();
    document.body.style.cursor = "row-resize";
    document.body.style.userSelect = "none";
    window.addEventListener("pointermove", handleMove, { passive: false });
    window.addEventListener("mousemove", handleMove, { passive: false });
    window.addEventListener("pointerup", handleEnd, { once: true });
    window.addEventListener("mouseup", handleEnd, { once: true });
    window.addEventListener("pointercancel", handleEnd, { once: true });
    cleanupRef.current = () => {
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("mousemove", handleMove);
      window.removeEventListener("pointerup", handleEnd);
      window.removeEventListener("mouseup", handleEnd);
      window.removeEventListener("pointercancel", handleEnd);
    };
  }, [constraints, finish, getHeight]);

  useEffect(() => finish, [finish]);

  return { heights, getHeight, startResize };
}

export function KeywordTableRowResizeHandle({
  rowId,
  enabled,
  onStart,
}: {
  rowId: string;
  enabled: boolean;
  onStart: (rowId: string, event: KeywordTableResizeStartEvent) => void;
}) {
  if (!enabled) return null;
  return (
    <button
      type="button"
      data-keyword-table-row-resize-handle={rowId}
      aria-label="Redimensionar altura da linha"
      title="Arraste para ajustar a altura da linha"
      onPointerDown={event => onStart(rowId, event)}
      onMouseDown={event => onStart(rowId, event)}
      className="touch-none absolute inset-x-2 bottom-0 z-10 h-1 cursor-row-resize rounded-full border-0 bg-transparent p-0 outline-none transition-colors hover:bg-module-accent/40 focus-visible:bg-module-accent/50"
    />
  );
}
