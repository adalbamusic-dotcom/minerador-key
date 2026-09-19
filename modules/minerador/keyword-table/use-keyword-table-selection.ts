"use client";

import { useCallback, useEffect, useRef, useState, type MouseEvent, type PointerEvent as ReactPointerEvent } from "react";
import { applyKeywordSelectionClick, applyKeywordSelectionPaint, toggleVisibleKeywordSelection } from "@/lib/minerador/keyword-selection";

export function useKeywordTableSelection(visibleIds: string[]) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const anchorRef = useRef<string | null>(null);
  const dragRef = useRef<{ id: string; pointerId: number; startX: number; startY: number; mode: "select" | "deselect"; initial: Set<string>; currentId: string | null; moved: boolean } | null>(null);
  const suppressClickRef = useRef(false);
  const suppressClickTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (anchorRef.current && !visibleIds.includes(anchorRef.current)) anchorRef.current = null;
  }, [visibleIds]);

  const onClick = useCallback((id: string, event: MouseEvent<HTMLButtonElement>) => {
    if (suppressClickRef.current) { suppressClickRef.current = false; return; }
    const result = applyKeywordSelectionClick({
      selectedIds,
      visibleIds,
      id,
      anchorId: anchorRef.current,
      shiftKey: event.shiftKey,
      additiveKey: event.ctrlKey || event.metaKey,
      // `detail === 0` é ativação por teclado: o clique do mouse sempre traz
      // contagem. Sem isso, Espaço na caixa de seleção limparia o resto.
      keyboard: event.detail === 0,
    });
    setSelectedIds(result.selectedIds);
    anchorRef.current = result.anchorId;
  }, [selectedIds, visibleIds]);

  const onPointerDown = useCallback((id: string, event: ReactPointerEvent<HTMLButtonElement>) => {
    if (event.button !== 0) return;
    if (suppressClickTimerRef.current) clearTimeout(suppressClickTimerRef.current);
    suppressClickRef.current = false;
    /*
     * COM MODIFICADOR, QUEM MANDA É O CLIQUE.
     *
     * Shift e Ctrl descrevem intervalo e alternância, e a pintura por arraste
     * não sabe nada disso: ela repinta a partir da linha pressionada. Um
     * Shift+clique com 4px de tremor virava pintura, o intervalo sumia e o
     * clique real era engolido pelo supressor.
     */
    if (event.shiftKey || event.ctrlKey || event.metaKey) { dragRef.current = null; return; }
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = { id, pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, mode: selectedIds.has(id) ? "deselect" : "select", initial: new Set(selectedIds), currentId: null, moved: false };
  }, [selectedIds]);

  useEffect(() => {
    const paint = (id: string) => {
      const drag = dragRef.current;
      if (!drag || drag.currentId === id) return;
      drag.currentId = id;
      setSelectedIds(applyKeywordSelectionPaint({ initialSelectedIds: drag.initial, visibleIds, anchorId: drag.id, currentId: id, mode: drag.mode }));
    };
    const finish = () => {
      const drag = dragRef.current;
      dragRef.current = null;
      if (!drag?.moved) return;
      // O trecho pintado deixa a âncora onde ele começou: o Shift+clique
      // seguinte estica a partir dali, e não de onde o arraste parou.
      anchorRef.current = drag.id;
      suppressClickRef.current = true;
      suppressClickTimerRef.current = setTimeout(() => {
        suppressClickRef.current = false;
        suppressClickTimerRef.current = null;
      }, 0);
    };
    const move = (event: globalThis.PointerEvent) => {
      const drag = dragRef.current;
      if (!drag || drag.pointerId !== event.pointerId || (event.buttons & 1) !== 1) return;
      if (!drag.moved && Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) < 4) return;
      if (!drag.moved) {
        drag.moved = true;
        paint(drag.id);
      }
      event.preventDefault();
      const target = document.elementFromPoint(event.clientX, event.clientY)?.closest<HTMLElement>("[data-keyword-selection-id][data-keyword-selection-handle=\"true\"]");
      const id = target?.dataset.keywordSelectionId;
      if (id) paint(id);
    };
    document.addEventListener("pointermove", move);
    document.addEventListener("pointerup", finish);
    document.addEventListener("pointercancel", finish);
    window.addEventListener("blur", finish);
    return () => {
      document.removeEventListener("pointermove", move);
      document.removeEventListener("pointerup", finish);
      document.removeEventListener("pointercancel", finish);
      window.removeEventListener("blur", finish);
      if (suppressClickTimerRef.current) clearTimeout(suppressClickTimerRef.current);
    };
  }, [visibleIds]);

  return { selectedIds, setSelectedIds, onSelectionClick: onClick, onSelectionPointerDown: onPointerDown, toggleVisible: () => setSelectedIds(current => toggleVisibleKeywordSelection(current, visibleIds)) };
}
