import { useEffect, useMemo, useState, type RefObject } from "react";

export type KeywordTableColumnConstraint = {
  min?: number;
  max?: number;
  flexible?: boolean;
};

function sum(values: number[]) {
  return values.reduce((total, value) => total + value, 0);
}

function shrinkWidths(
  widths: Record<string, number>,
  constraints: Record<string, KeywordTableColumnConstraint>,
  ids: string[],
  amount: number,
) {
  if (amount <= 0 || ids.length === 0) return amount;
  const capacity = sum(ids.map(id => Math.max(0, (widths[id] ?? 0) - (constraints[id]?.min ?? 56))));
  if (capacity <= 0) return amount;
  const reduction = Math.min(amount, capacity);
  const next = { ...widths };
  let remaining = reduction;
  ids.forEach((id, index) => {
    const current = widths[id] ?? 0;
    const minimum = constraints[id]?.min ?? 56;
    const available = Math.max(0, current - minimum);
    const share = index === ids.length - 1 ? remaining : Math.min(available, reduction * available / capacity);
    next[id] = Math.max(minimum, Math.round(current - share));
    remaining -= share;
  });
  Object.assign(widths, next);
  return amount - reduction;
}

/** Scales only flexible columns until the table reaches the available workspace width. */
export function useKeywordTableResponsiveWidths(
  preferredWidths: Record<string, number>,
  constraints: Record<string, KeywordTableColumnConstraint>,
  containerRef: RefObject<HTMLElement | null>,
) {
  const [availableWidth, setAvailableWidth] = useState<number | null>(null);

  useEffect(() => {
    let frameId: number | null = null;
    let observer: ResizeObserver | null = null;
    const update = () => {
      const element = containerRef.current;
      if (element) setAvailableWidth(element.clientWidth);
    };
    const observe = () => {
      const element = containerRef.current;
      if (!element) {
        frameId = window.requestAnimationFrame(observe);
        return;
      }
      update();
      observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(update);
      observer?.observe(element);
    };
    observe();
    window.addEventListener("resize", update);
    return () => {
      if (frameId !== null) window.cancelAnimationFrame(frameId);
      observer?.disconnect();
      window.removeEventListener("resize", update);
    };
  }, [containerRef]);

  return useMemo(() => {
    const ids = Object.keys(preferredWidths);
    const preferredTotal = sum(ids.map(id => preferredWidths[id] ?? 0));
    const minimumTotal = sum(ids.map(id => constraints[id]?.min ?? 56));
    if (availableWidth === null || availableWidth >= preferredTotal) return preferredWidths;

    const targetWidth = Math.max(minimumTotal, availableWidth);
    const next = { ...preferredWidths };
    let remaining = preferredTotal - targetWidth;
    const flexibleIds = ids.filter(id => constraints[id]?.flexible);
    remaining = shrinkWidths(next, constraints, flexibleIds, remaining);
    if (remaining > 0) shrinkWidths(next, constraints, ids, remaining);
    return next;
  }, [availableWidth, constraints, preferredWidths]);
}
