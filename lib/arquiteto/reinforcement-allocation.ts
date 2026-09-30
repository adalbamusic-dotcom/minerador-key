/** Capacity is checked before ownership. Unused proposals never reserve a term. */
export type ReinforcementAllocationEdge = { targetId: string; keywordId: string; tier: number; score: number; volume: number };

/**
 * Regras, nesta ordem:
 * 1. A evidência mais forte ganha a keyword (tier menor; depois mais páginas em
 *    comum). Uma keyword que divide 7 páginas com um publicado não vai para
 *    quem divide 5.
 * 2. Entre evidências equivalentes, quem tem menor `priority` (menos apoio)
 *    é atendido primeiro.
 * 3. Cobertura: quem ficou sem nada pode receber uma keyword só se a evidência
 *    dele não for mais fraca que a de quem a tem, e sem rebaixar a evidência
 *    de quem a cede (o doador fica com pelo menos uma, ou é reencaminhado para
 *    uma keyword de tier igual ou melhor).
 */
export function allocateReinforcementChoices(input: {
  targets: readonly { id: string; capacity: number; priority?: number }[];
  edges: readonly ReinforcementAllocationEdge[];
  fixed?: ReadonlyMap<string, string>;
}): Map<string, string> {
  const fixed = input.fixed ?? new Map<string, string>();
  const owners = new Map(fixed);
  const targets = new Map(input.targets.map(target => [target.id, target]));
  const priorityOf = (id: string) => targets.get(id)?.priority ?? 0;
  const edgeKey = (targetId: string, keywordId: string) => `${targetId}\u0000${keywordId}`;
  const edgeOf = new Map(input.edges.map(edge => [edgeKey(edge.targetId, edge.keywordId), edge]));
  const held = (id: string) => {
    let count = 0;
    for (const [keywordId, owner] of owners) if (owner === id && !fixed.has(keywordId)) count++;
    return count;
  };
  const capacityOf = (id: string) => targets.get(id)?.capacity ?? 0;
  const stronger = (a: ReinforcementAllocationEdge, b: ReinforcementAllocationEdge) => a.tier - b.tier || b.score - a.score;
  const notWeaker = (a: ReinforcementAllocationEdge, b: ReinforcementAllocationEdge) => stronger(a, b) <= 0;
  const ordered = input.edges
    .filter(edge => targets.has(edge.targetId) && !fixed.has(edge.keywordId))
    .sort((a, b) => stronger(a, b) || priorityOf(a.targetId) - priorityOf(b.targetId) || b.volume - a.volume || a.keywordId.localeCompare(b.keywordId) || a.targetId.localeCompare(b.targetId));

  for (const edge of ordered) {
    if (owners.has(edge.keywordId) || held(edge.targetId) >= capacityOf(edge.targetId)) continue;
    owners.set(edge.keywordId, edge.targetId);
  }

  const claim = (targetId: string, seen: Set<string>, maxTier = Number.POSITIVE_INFINITY): boolean => {
    for (const edge of ordered) {
      if (edge.targetId !== targetId || edge.tier > maxTier || seen.has(edge.keywordId)) continue;
      const previous = owners.get(edge.keywordId);
      if (previous === targetId) continue;
      seen.add(edge.keywordId);
      if (!previous) { owners.set(edge.keywordId, targetId); return true; }
      const previousEdge = edgeOf.get(edgeKey(previous, edge.keywordId));
      if (previousEdge && !notWeaker(edge, previousEdge)) continue;
      const previousTier = previousEdge?.tier ?? edge.tier;
      if (held(previous) > 1 || claim(previous, seen, previousTier)) { owners.set(edge.keywordId, targetId); return true; }
    }
    return false;
  };
  const byNeed = [...input.targets].sort((a, b) => (a.priority ?? 0) - (b.priority ?? 0) || a.id.localeCompare(b.id));
  for (const target of byNeed) if (target.capacity > 0 && held(target.id) === 0) claim(target.id, new Set());
  return owners;
}
