import { useEffect, useLayoutEffect, useMemo, useState, type RefObject } from "react";

/** A medição precisa acontecer antes da pintura para a tabela nunca aparecer larga demais no primeiro frame. */
const useMeasurementEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

export type KeywordTableColumnConstraint = {
  min?: number;
  max?: number;
  flexible?: boolean;
  /** Protected columns keep their preset width while lower-priority columns give up space first. */
  priority?: "protected" | "normal";
  /**
   * Coluna que recebe TODA a sobra de largura (no Processador, a Palavra-Chave)
   * e é a última a encolher. Opcional: sem ela, nada muda para quem já usa.
   */
  fill?: boolean;
};

/**
 * Opções aditivas da projeção. Sem elas, o cálculo é o de sempre.
 *
 * `edgeReserve`: pixels que a tabela precisa deixar livres no contêiner. Com
 * `border-collapse`, a borda de qualquer célula (ou linha) na borda externa da
 * tabela vira borda da própria tabela, e metade dela soma à largura: colunas
 * que somam exatamente a largura do contêiner passam dele por 0,5 a 1px, e a
 * barra horizontal fica ligada sem nenhuma coluna alargada. A reserva devolve
 * essa folga; com `width: 100%`, a tabela continua ocupando o contêiner todo.
 */
export type KeywordTableResponsiveWidthOptions = { edgeReserve?: number };

function edgeReserveOf(options: KeywordTableResponsiveWidthOptions | undefined) {
  const reserve = options?.edgeReserve;
  return typeof reserve === "number" && Number.isFinite(reserve) && reserve > 0 ? Math.ceil(reserve) : 0;
}

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
  options?: KeywordTableResponsiveWidthOptions,
) {
  const ids = Object.keys(preferredWidths);
  const preferredTotal = sum(ids.map(id => preferredWidths[id] ?? 0));
  const minimumTotal = keywordTableMinimumWidth(constraints, ids);
  const fillId = ids.find(id => constraints[id]?.fill);
  if (availableWidth === null) return preferredWidths;
  availableWidth = Math.max(0, availableWidth - edgeReserveOf(options));
  if (availableWidth >= preferredTotal) {
    // A sobra inteira vai para a coluna `fill`; as outras ficam no preset.
    if (!fillId || availableWidth === preferredTotal) return preferredWidths;
    return { ...preferredWidths, [fillId]: (preferredWidths[fillId] ?? 0) + (availableWidth - preferredTotal) };
  }

  const targetWidth = Math.max(minimumTotal, availableWidth);
  const next = { ...preferredWidths };
  let remaining = preferredTotal - targetWidth;
  const resized = new Set(resizedColumnIds);
  const automatic = ids.filter(id => !resized.has(id) && !constraints[id]?.fill);
  const flexibleIds = automatic.filter(id => constraints[id]?.priority !== "protected" && constraints[id]?.flexible);
  const normalIds = automatic.filter(id => constraints[id]?.priority !== "protected" && !constraints[id]?.flexible);
  const protectedIds = automatic.filter(id => constraints[id]?.priority === "protected");
  // A coluna `fill` é a última a ceder: só depois de todas no mínimo.
  const fillIds = fillId && !resized.has(fillId) ? [fillId] : [];
  remaining = shrinkWidths(next, constraints, flexibleIds, remaining);
  remaining = shrinkWidths(next, constraints, normalIds, remaining);
  remaining = shrinkWidths(next, constraints, protectedIds, remaining);
  shrinkWidths(next, constraints, fillIds, remaining);
  // O arredondamento por coluna pode sobrar 1-2px e isso bastaria para manter a
  // barra horizontal permanentemente ligada. A sobra é devolvida à coluna com
  // mais folga acima do próprio mínimo.
  const overflow = sum(ids.map(id => next[id] ?? 0)) - targetWidth;
  if (overflow > 0) {
    const donor = [...flexibleIds, ...normalIds, ...protectedIds, ...fillIds]
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
  options?: KeywordTableResponsiveWidthOptions,
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
  const edgeReserve = edgeReserveOf(options);
  return useMemo(
    () => resolveKeywordTableResponsiveWidths(preferredWidths, constraints, availableWidth, resizedKey ? resizedKey.split("|") : [], edgeReserve ? { edgeReserve } : undefined),
    [availableWidth, constraints, preferredWidths, resizedKey, edgeReserve],
  );
}
