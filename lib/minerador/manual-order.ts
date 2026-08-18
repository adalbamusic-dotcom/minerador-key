export type KeywordTableOrderMode = "auto" | "manual";

/**
 * Keeps the user's visual order stable while rows are filtered or new rows arrive.
 * It only works with technical IDs and never mutates the source collection.
 */
export function reconcileManualOrderIds(knownIds: readonly string[], currentOrderIds: readonly string[] = []): string[] {
  const known = new Set(knownIds);
  const next = currentOrderIds.filter((id, index, ids) => known.has(id) && ids.indexOf(id) === index);
  const present = new Set(next);
  for (const id of knownIds) if (!present.has(id)) next.push(id);
  return next;
}

export function moveIdBefore(orderIds: readonly string[], sourceId: string, targetId: string): string[] {
  if (sourceId === targetId || !orderIds.includes(sourceId) || !orderIds.includes(targetId)) return [...orderIds];
  const next = orderIds.filter(id => id !== sourceId);
  const targetIndex = next.indexOf(targetId);
  if (targetIndex < 0) return next;
  next.splice(targetIndex, 0, sourceId);
  return next;
}

export function moveIdByOffset(orderIds: readonly string[], id: string, offset: -1 | 1): string[] {
  const currentIndex = orderIds.indexOf(id);
  if (currentIndex < 0) return [...orderIds];
  const targetIndex = currentIndex + offset;
  if (targetIndex < 0 || targetIndex >= orderIds.length) return [...orderIds];
  const next = [...orderIds];
  [next[currentIndex], next[targetIndex]] = [next[targetIndex], next[currentIndex]];
  return next;
}

export function applyManualOrder<T>(items: readonly T[], orderIds: readonly string[], getId: (item: T) => string): T[] {
  if (!orderIds.length) return [...items];
  const order = new Map(orderIds.map((id, index) => [id, index]));
  return items
    .map((item, originalIndex) => ({ item, originalIndex, position: order.get(getId(item)) ?? Number.MAX_SAFE_INTEGER }))
    .sort((left, right) => left.position - right.position || left.originalIndex - right.originalIndex)
    .map(entry => entry.item);
}
