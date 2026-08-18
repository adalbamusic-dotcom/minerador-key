import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent } from "react";
import { moveIdBefore, moveIdByOffset, reconcileManualOrderIds } from "@/lib/minerador/manual-order";

export function useKeywordTableOrder(knownIds: readonly string[]) {
  const [storedOrderIds, setStoredOrderIds] = useState<string[]>(() => reconcileManualOrderIds(knownIds));
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const knownIdsRef = useRef(knownIds);
  const pointerDraggingIdRef = useRef<string | null>(null);
  const dragCleanupRef = useRef<(() => void) | null>(null);
  useEffect(() => { knownIdsRef.current = knownIds; }, [knownIds]);
  const manualOrderIds = useMemo(() => reconcileManualOrderIds(knownIds, storedOrderIds), [knownIds, storedOrderIds]);

  const moveBefore = useCallback((sourceId: string, targetId: string) => {
    setStoredOrderIds(current => moveIdBefore(reconcileManualOrderIds(knownIds, current), sourceId, targetId));
  }, [knownIds]);

  const moveByOffset = useCallback((id: string, offset: -1 | 1) => {
    setStoredOrderIds(current => moveIdByOffset(reconcileManualOrderIds(knownIds, current), id, offset));
  }, [knownIds]);

  const movePointerBefore = useCallback((sourceId: string, clientX: number, clientY: number) => {
    if (!knownIdsRef.current.includes(sourceId)) return;
    const row = document.elementFromPoint(clientX, clientY)?.closest<HTMLElement>("[data-keyword-table-row-id]");
    const targetId = row?.dataset.keywordTableRowId;
    if (!targetId || targetId === sourceId || !knownIdsRef.current.includes(targetId)) return;
    setStoredOrderIds(current => moveIdBefore(reconcileManualOrderIds(knownIdsRef.current, current), sourceId, targetId));
  }, []);

  const endDragging = useCallback(() => {
    dragCleanupRef.current?.();
    dragCleanupRef.current = null;
    pointerDraggingIdRef.current = null;
    setDraggingId(null);
  }, []);

  const installPointerListeners = useCallback(() => {
    if (dragCleanupRef.current) return;

    const handleMove = (event: MouseEvent | PointerEvent) => {
      const sourceId = pointerDraggingIdRef.current;
      if (!sourceId) return;
      event.preventDefault();
      movePointerBefore(sourceId, event.clientX, event.clientY);
    };
    const handlePointerEnd = () => endDragging();
    window.addEventListener("pointermove", handleMove, { passive: false });
    window.addEventListener("mousemove", handleMove, { passive: false });
    window.addEventListener("pointerup", handlePointerEnd, { passive: true });
    window.addEventListener("mouseup", handlePointerEnd, { passive: true });
    window.addEventListener("pointercancel", handlePointerEnd, { passive: true });

    dragCleanupRef.current = () => {
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("mousemove", handleMove);
      window.removeEventListener("pointerup", handlePointerEnd);
      window.removeEventListener("mouseup", handlePointerEnd);
      window.removeEventListener("pointercancel", handlePointerEnd);
    };
  }, [endDragging, movePointerBefore]);

  const startDrag = useCallback((id: string, event?: { preventDefault: () => void; stopPropagation: () => void }) => {
    if (!knownIdsRef.current.includes(id)) return;
    event?.preventDefault();
    event?.stopPropagation();
    if (dragCleanupRef.current) return;
    pointerDraggingIdRef.current = id;
    installPointerListeners();
    setDraggingId(id);
  }, [installPointerListeners]);

  const startPointerDragging = useCallback((id: string, event?: ReactPointerEvent<HTMLButtonElement>) => startDrag(id, event), [startDrag]);
  const startMouseDragging = useCallback((id: string, event?: ReactMouseEvent<HTMLButtonElement>) => {
    if (event && event.button !== 0) return;
    startDrag(id, event);
  }, [startDrag]);

  useEffect(() => {
    return () => {
      dragCleanupRef.current?.();
      dragCleanupRef.current = null;
    };
  }, []);

  return {
    manualOrderIds,
    draggingId,
    startDragging: setDraggingId,
    startPointerDragging,
    startMouseDragging,
    endDragging,
    moveBefore,
    moveByOffset,
  };
}
