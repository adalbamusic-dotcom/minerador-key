import { useEffect, useLayoutEffect, useMemo, useState, type RefObject } from "react";

/** A medição precisa acontecer antes da pintura para a tabela nunca aparecer larga demais no primeiro frame. */
const useMeasurementEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

export type KeywordTableColumnConstraint = {
  min?: number;
  max?: number;
  flexible?: boolean;
  /** Protected columns keep their preset width while lower-priority columns give up space first. */
  priority?: "protected" | "normal";
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

/**
 * Largura mínima semântica da tabela: a soma dos mínimos de cada coluna. É o
 * ponto em que a barra horizontal passa a ser necessária de verdade — abaixo
 * disso nenhuma coluna pode encolher mais sem perder legibilidade.
 */
export function keywordTableMinimumWidth(
  constraints: Record<string, KeywordTableColumnConstraint>,
  columnIds?: string[],
) {
  const ids = columnIds || Object.keys(constraints);
  return sum(ids.map(id => constraints[id]?.min ?? 56));
}

/**
 * Resolves the responsive projection without changing the user's resize state.
 * Order of sacrifice: flexible columns, then the normal ones, and only as a
 * last resort the protected ones — sempre respeitando o mínimo de cada coluna.
 * Assim a tabela cabe em um notebook pequeno antes de recorrer à barra
 * horizontal. A column the human resized on purpose is never shrunk back.
 */
export function resolveKeywordTableResponsiveWidths(
  preferredWidths: Record<string, number>,
  constraints: Record<string, KeywordTableColumnConstraint>,
  availableWidth: number | null,
  resizedColumnIds: readonly string[] = [],
) {
  const ids = Object.keys(preferredWidths);
  const preferredTotal = sum(ids.map(id => preferredWidths[id] ?? 0));
  const minimumTotal = keywordTableMinimumWidth(constraints, ids);
  if (availableWidth === null || availableWidth >= preferredTotal) return preferredWidths;

  const targetWidth = Math.max(minimumTotal, availableWidth);
  const next = { ...preferredWidths };
  let remaining = preferredTotal - targetWidth;
  const resized = new Set(resizedColumnIds);
  const automatic = ids.filter(id => !resized.has(id));
  const flexibleIds = automatic.filter(id => constraints[id]?.priority !== "protected" && constraints[id]?.flexible);
  const normalIds = automatic.filter(id => constraints[id]?.priority !== "protected" && !constraints[id]?.flexible);
  const protectedIds = automatic.filter(id => constraints[id]?.priority === "protected");
  remaining = shrinkWidths(next, constraints, flexibleIds, remaining);
  remaining = shrinkWidths(next, constraints, normalIds, remaining);
  shrinkWidths(next, constraints, protectedIds, remaining);
  // O arredondamento por coluna pode sobrar 1-2px e isso bastaria para manter a
  // barra horizontal permanentemente ligada. A sobra é devolvida à coluna com
  // mais folga acima do próprio mínimo.
  const overflow = sum(ids.map(id => next[id] ?? 0)) - targetWidth;
  if (overflow > 0) {
    const donor = [...flexibleIds, ...normalIds, ...protectedIds]
      .sort((left, right) => (next[right] ?? 0) - (constraints[right]?.min ?? 56) - ((next[left] ?? 0) - (constraints[left]?.min ?? 56)))[0];
    if (donor) next[donor] = Math.max(constraints[donor]?.min ?? 56, (next[donor] ?? 0) - overflow);
  }
  return next;
}

/** Scales lower-priority columns until the table reaches the available workspace width. */
export function useKeywordTableResponsiveWidths(
  preferredWidths: Record<string, number>,
  constraints: Record<string, KeywordTableColumnConstraint>,
  containerRef: RefObject<HTMLElement | null>,
  resizedColumnIds: readonly string[] = [],
) {
  const [availableWidth, setAvailableWidth] = useState<number | null>(null);

  useMeasurementEffect(() => {
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

  const resizedKey = resizedColumnIds.join("|");
  return useMemo(
    () => resolveKeywordTableResponsiveWidths(preferredWidths, constraints, availableWidth, resizedKey ? resizedKey.split("|") : []),
    [availableWidth, constraints, preferredWidths, resizedKey],
  );
}
