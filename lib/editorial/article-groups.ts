import { EDITORIAL_GROUP_URL_NONE, editorialGroupFilterMatches, type EditorialGroupFilter, type EditorialGroupScreenFilter } from "./editorial-groups.ts";

/**
 * ===== GRUPO DO ARTIGO — DOMÍNIO PURO (F2) =====
 *
 * SDD `docs/compartilhado/sdd-plano-declarado-e-grupos-2026-10-12.md`, §5.2,
 * §6.2 item 9, §6.3 e §8 (aprovada pelo dono em 2026-10-12).
 *
 * O grupo nasce na keyword (Minerador, F1). O artigo (ArticleDNA), a SiloPage
 * e o item do Radar HERDAM o grupo das keywords do artigo, por uma regra só,
 * explícita e testada (`inheritArticleGroup`):
 *
 *   1. o grupo do ASSUNTO do artigo (`ArticleDNA.subject.keywordId`), se ele
 *      tem grupo — origem "subject";
 *   2. senão, o grupo da PRINCIPAL (`principalKeywordId`) — origem "principal";
 *   3. senão, o grupo que tem MAIS keywords do artigo (principal, secundárias
 *      e reforços), sem empate — origem "keywords";
 *   4. empate entre grupos = SEM grupo, com o conflito visível ("tie"): nunca
 *      se escolhe por sorteio, e o dono decide pelo rodapé;
 *   5. nenhuma keyword com grupo = sem grupo ("no_group").
 *
 * O que fica GRAVADO em `editorial_group_articles` (uma linha por artigo, D5)
 * vence a herança: é a etiqueta do artigo. Ela nasce de três jeitos, todos
 * pelo mesmo núcleo (`lib/editorial/article-group-core.ts`):
 *   - "Etiquetar artigos pelo grupo das keywords" (ação explícita, com prévia);
 *   - ao formar o ArticleDNA e ao importar no Radar, de forma ADITIVA (só
 *     grava artigo que ainda não tem etiqueta; nunca troca a de ninguém);
 *   - "Mover para o grupo" no rodapé (origem "human").
 *
 * Princípio 3 da SDD: o grupo é organização, não significado. Nada aqui mexe
 * em ArticleDNA, hash, versão, status ou aprovação.
 *
 * Sem storage, sem fetch, sem React.
 */

export const ARTICLE_GROUP_ORIGINS = ["subject", "principal", "keywords", "human"] as const;
export type ArticleGroupOrigin = (typeof ARTICLE_GROUP_ORIGINS)[number];

export const isArticleGroupOrigin = (value: unknown): value is ArticleGroupOrigin =>
  typeof value === "string" && (ARTICLE_GROUP_ORIGINS as readonly string[]).includes(value);

/** O mínimo do ArticleDNA vigente que a herança lê: ids, nada de payload. */
export type ArticleKeywordIndex = {
  articleId: string;
  principalKeywordId: string | null;
  subjectKeywordId: string | null;
  /** Principal + secundárias + reforços, sem repetição. */
  keywordIds: string[];
};

export type ArticleGroupCount = { groupId: string; count: number };

export type InheritedArticleGroup =
  | { groupId: string; origin: "subject" | "principal" | "keywords"; reason: "subject" | "principal" | "majority"; counts: ArticleGroupCount[] }
  | { groupId: null; origin: null; reason: "tie" | "no_group"; counts: ArticleGroupCount[] };

const unicos = (ids: readonly (string | null | undefined)[]) =>
  [...new Set(ids.filter((id): id is string => typeof id === "string" && id.length > 0))];

/** Monta o índice a partir das peças do ArticleDNA (ou da linha da mesa). */
export function articleKeywordIndex(input: {
  articleId: string;
  principalKeywordId?: string | null;
  subjectKeywordId?: string | null;
  secondaryKeywordIds?: readonly (string | null | undefined)[] | null;
  narrativeReinforcementIds?: readonly (string | null | undefined)[] | null;
  keywordIds?: readonly (string | null | undefined)[] | null;
}): ArticleKeywordIndex {
  const principal = typeof input.principalKeywordId === "string" && input.principalKeywordId ? input.principalKeywordId : null;
  return {
    articleId: input.articleId,
    principalKeywordId: principal,
    subjectKeywordId: typeof input.subjectKeywordId === "string" && input.subjectKeywordId ? input.subjectKeywordId : null,
    keywordIds: unicos([principal, ...(input.secondaryKeywordIds || []), ...(input.narrativeReinforcementIds || []), ...(input.keywordIds || [])]),
  };
}

/**
 * A REGRA DA HERANÇA (ver o cabeçalho). `keywordGroupById` é o `group_id` de
 * cada keyword da MESMA marca; keyword ausente do mapa = sem grupo.
 */
export function inheritArticleGroup(article: ArticleKeywordIndex, keywordGroupById: ReadonlyMap<string, string | null>): InheritedArticleGroup {
  const grupoDe = (id: string | null) => (id ? keywordGroupById.get(id) || null : null);
  const contagem = new Map<string, number>();
  for (const id of unicos(article.keywordIds)) {
    const grupo = grupoDe(id);
    if (grupo) contagem.set(grupo, (contagem.get(grupo) || 0) + 1);
  }
  const counts = [...contagem.entries()]
    .map(([groupId, count]) => ({ groupId, count }))
    .sort((a, b) => b.count - a.count || a.groupId.localeCompare(b.groupId));
  const doAssunto = grupoDe(article.subjectKeywordId);
  if (doAssunto) return { groupId: doAssunto, origin: "subject", reason: "subject", counts };
  const daPrincipal = grupoDe(article.principalKeywordId);
  if (daPrincipal) return { groupId: daPrincipal, origin: "principal", reason: "principal", counts };
  if (!counts.length) return { groupId: null, origin: null, reason: "no_group", counts };
  if (counts.length > 1 && counts[0].count === counts[1].count) return { groupId: null, origin: null, reason: "tie", counts };
  return { groupId: counts[0].groupId, origin: "keywords", reason: "majority", counts };
}

/** Uma linha de `editorial_group_articles`. */
export type PersistedArticleGroup = { articleId: string; groupId: string; origin: ArticleGroupOrigin };

/** O grupo que a tela e o servidor usam para um artigo. */
export type ArticleGroupMembership = {
  articleId: string;
  groupId: string | null;
  origin: ArticleGroupOrigin | null;
  /** Etiqueta gravada (`editorial_group_articles`) — senão é herança viva. */
  persisted: boolean;
  /** Keywords do artigo em grupos empatados, sem etiqueta gravada. */
  conflict: boolean;
  inherited: InheritedArticleGroup | null;
};

/**
 * Grupo efetivo de cada artigo: a etiqueta gravada vence; sem ela, a herança.
 * Artigo só com etiqueta (sem ArticleDNA no índice) continua listado.
 */
export function resolveArticleGroupMemberships(input: {
  articles: readonly ArticleKeywordIndex[];
  persisted: readonly PersistedArticleGroup[];
  keywordGroupById: ReadonlyMap<string, string | null>;
}): Map<string, ArticleGroupMembership> {
  const gravadas = new Map(input.persisted.map(row => [row.articleId, row]));
  const saida = new Map<string, ArticleGroupMembership>();
  for (const article of input.articles) {
    const inherited = inheritArticleGroup(article, input.keywordGroupById);
    const gravada = gravadas.get(article.articleId);
    saida.set(article.articleId, gravada
      ? { articleId: article.articleId, groupId: gravada.groupId, origin: gravada.origin, persisted: true, conflict: false, inherited }
      : { articleId: article.articleId, groupId: inherited.groupId, origin: inherited.origin, persisted: false, conflict: inherited.reason === "tie", inherited });
  }
  for (const gravada of input.persisted) {
    if (saida.has(gravada.articleId)) continue;
    saida.set(gravada.articleId, { articleId: gravada.articleId, groupId: gravada.groupId, origin: gravada.origin, persisted: true, conflict: false, inherited: null });
  }
  return saida;
}

/* ------------------------- etiquetar pelo grupo ------------------------- */

export type ArticleGroupTaggingStatus =
  | "will_tag"
  | "already_tagged"
  | "kept_other"
  | "tie"
  | "no_group"
  | "group_inactive";

export const ARTICLE_GROUP_TAGGING_LABELS: Record<ArticleGroupTaggingStatus, string> = {
  will_tag: "Vai receber o grupo",
  already_tagged: "Já está neste grupo",
  kept_other: "Já tem outro grupo gravado — fica como está",
  tie: "Keywords em grupos empatados — escolha pelo rodapé",
  no_group: "Nenhuma keyword do artigo tem grupo",
  group_inactive: "O grupo das keywords está arquivado",
};

export type ArticleGroupTaggingEntry = {
  articleId: string;
  status: ArticleGroupTaggingStatus;
  /** O grupo que o artigo recebe (will_tag) ou já tem (already/kept). */
  groupId: string | null;
  origin: ArticleGroupOrigin | null;
  inheritedGroupId: string | null;
  reason: InheritedArticleGroup["reason"] | null;
};

/**
 * A PRÉVIA E O PLANO SÃO A MESMA FUNÇÃO. Só "will_tag" é gravado; etiqueta
 * gravada nunca é trocada por herança (é aditivo). `articleIds` restringe o
 * escopo (a tela manda o que mostrou na prévia; o servidor recalcula).
 */
export function planArticleGroupTagging(input: {
  memberships: ReadonlyMap<string, ArticleGroupMembership>;
  groupStatusById: ReadonlyMap<string, "active" | "archived">;
  articleIds?: readonly string[] | null;
}): { entries: ArticleGroupTaggingEntry[]; willTag: Array<{ articleId: string; groupId: string; origin: Exclude<ArticleGroupOrigin, "human"> }> } {
  const escopo = input.articleIds ? new Set(input.articleIds) : null;
  const entries: ArticleGroupTaggingEntry[] = [];
  const willTag: Array<{ articleId: string; groupId: string; origin: Exclude<ArticleGroupOrigin, "human"> }> = [];
  const ordenadas = [...input.memberships.values()].sort((a, b) => a.articleId.localeCompare(b.articleId));
  for (const membership of ordenadas) {
    if (escopo && !escopo.has(membership.articleId)) continue;
    const herdado = membership.inherited;
    const base = { articleId: membership.articleId, inheritedGroupId: herdado?.groupId ?? null, reason: herdado?.reason ?? null };
    if (membership.persisted) {
      const igual = herdado?.groupId === membership.groupId;
      entries.push({ ...base, status: igual ? "already_tagged" : "kept_other", groupId: membership.groupId, origin: membership.origin });
      continue;
    }
    if (!herdado || !herdado.groupId) {
      entries.push({ ...base, status: herdado?.reason === "tie" ? "tie" : "no_group", groupId: null, origin: null });
      continue;
    }
    if (input.groupStatusById.get(herdado.groupId) !== "active") {
      entries.push({ ...base, status: "group_inactive", groupId: herdado.groupId, origin: herdado.origin });
      continue;
    }
    entries.push({ ...base, status: "will_tag", groupId: herdado.groupId, origin: herdado.origin });
    willTag.push({ articleId: membership.articleId, groupId: herdado.groupId, origin: herdado.origin });
  }
  return { entries, willTag };
}

/* --------------------------- mover pelo rodapé --------------------------- */

export type ArticleGroupMoveRefusalCode = "ARTICLE_NOT_FOUND" | "GROUP_NOT_FOUND" | "GROUP_ARCHIVED";

export const ARTICLE_GROUP_MOVE_REFUSALS: Record<ArticleGroupMoveRefusalCode, string> = {
  ARTICLE_NOT_FOUND: "Artigo sem ArticleDNA nesta marca: ele herda o grupo das keywords (mova as keywords no Minerador).",
  GROUP_NOT_FOUND: "Grupo não encontrado nesta marca.",
  GROUP_ARCHIVED: "O grupo está arquivado: reative-o no Minerador antes de mover artigos para ele.",
};

/**
 * "Mover para <grupo>" grava a etiqueta humana (origem "human"); "Voltar ao
 * grupo das keywords" (`targetGroupId = null`) apaga a etiqueta gravada e o
 * artigo volta a herdar. Artigo de outra marca é "não encontrado".
 */
export function planArticleGroupMove(input: {
  articleIds: readonly string[];
  targetGroupId: string | null;
  memberships: ReadonlyMap<string, ArticleGroupMembership>;
  groupStatusById: ReadonlyMap<string, "active" | "archived">;
}): {
  toUpsert: Array<{ articleId: string; groupId: string; fromGroupId: string | null }>;
  toDelete: Array<{ articleId: string; fromGroupId: string }>;
  unchanged: string[];
  refused: Array<{ articleId: string; code: ArticleGroupMoveRefusalCode; message: string }>;
} {
  const toUpsert: Array<{ articleId: string; groupId: string; fromGroupId: string | null }> = [];
  const toDelete: Array<{ articleId: string; fromGroupId: string }> = [];
  const unchanged: string[] = [];
  const refused: Array<{ articleId: string; code: ArticleGroupMoveRefusalCode; message: string }> = [];
  const recusa = (articleId: string, code: ArticleGroupMoveRefusalCode) => refused.push({ articleId, code, message: ARTICLE_GROUP_MOVE_REFUSALS[code] });
  if (input.targetGroupId) {
    const status = input.groupStatusById.get(input.targetGroupId);
    if (!status || status !== "active") {
      for (const articleId of unicos(input.articleIds)) recusa(articleId, status ? "GROUP_ARCHIVED" : "GROUP_NOT_FOUND");
      return { toUpsert, toDelete, unchanged, refused };
    }
  }
  for (const articleId of unicos(input.articleIds)) {
    const membership = input.memberships.get(articleId);
    if (!membership) { recusa(articleId, "ARTICLE_NOT_FOUND"); continue; }
    if (input.targetGroupId) {
      if (membership.persisted && membership.groupId === input.targetGroupId && membership.origin === "human") { unchanged.push(articleId); continue; }
      toUpsert.push({ articleId, groupId: input.targetGroupId, fromGroupId: membership.groupId });
      continue;
    }
    if (!membership.persisted || !membership.groupId) { unchanged.push(articleId); continue; }
    toDelete.push({ articleId, fromGroupId: membership.groupId });
  }
  return { toUpsert, toDelete, unchanged, refused };
}

/* ------------------------------ filtro ------------------------------ */

/**
 * `groupId` das rotas de leitura: ausente ou "todos" = leitura de hoje;
 * "sem-grupo" = artigos sem grupo; uuid = um grupo. Qualquer outra coisa é
 * erro de entrada — nunca vira "todos" em silêncio.
 */
export function parseGroupIdQuery(raw: string | null | undefined): { ok: true; filter: EditorialGroupFilter } | { ok: false } {
  const valor = (raw ?? "").trim();
  if (!valor || valor === "todos") return { ok: true, filter: { kind: "all" } };
  if (valor === EDITORIAL_GROUP_URL_NONE) return { ok: true, filter: { kind: "none" } };
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(valor)) return { ok: true, filter: { kind: "group", groupId: valor.toLowerCase() } };
  return { ok: false };
}

/** O id do grupo de um filtro (para a resposta); "Sem grupo" vira "sem-grupo". */
export const groupScopeId = (filter: EditorialGroupFilter) =>
  filter.kind === "group" ? filter.groupId : filter.kind === "none" ? EDITORIAL_GROUP_URL_NONE : null;

/** Artigos do recorte, pelo grupo EFETIVO. `null` = sem recorte ("Todos"). */
export function articleIdsInGroupFilter(filter: EditorialGroupFilter, memberships: Iterable<ArticleGroupMembership>): Set<string> | null {
  if (filter.kind === "all") return null;
  const ids = new Set<string>();
  for (const membership of memberships) {
    if (filter.kind === "none" ? !membership.groupId : membership.groupId === filter.groupId) ids.add(membership.articleId);
  }
  return ids;
}

/**
 * Filtro de TELA: devolve as linhas do recorte e nunca muda a lista de origem.
 * "Todos" devolve a MESMA referência (nada é recalculado nem reordenado).
 */
export function filterRowsByEditorialGroup<T>(rows: readonly T[], filter: EditorialGroupScreenFilter, groupOf: (row: T) => string | null | undefined): readonly T[] {
  if (filter.kind === "all") return rows;
  // 2026-10-12 · cores fixas: o recorte de uma cor cobre todos os grupos ativos dela.
  return rows.filter(row => editorialGroupFilterMatches(filter, groupOf(row) || null));
}

/**
 * LEITURA PARCIAL NÃO DEIXA ARTIGO PELA METADE (§8). A partir das keywords do
 * recorte, junta todas as keywords dos artigos que tocam o conjunto, até
 * fechar: o Arquiteto nunca recebe um artigo com parte das keywords — o que
 * faria a cópia de trabalho achar que keyword sumiu.
 */
export function closeKeywordSetOverArticles(seed: Iterable<string>, articles: readonly ArticleKeywordIndex[], maxRounds = 20): Set<string> {
  const fechado = new Set(seed);
  for (let rodada = 0; rodada < maxRounds; rodada += 1) {
    let cresceu = false;
    for (const article of articles) {
      const ids = unicos([...article.keywordIds, article.subjectKeywordId]);
      if (!ids.some(id => fechado.has(id))) continue;
      for (const id of ids) {
        if (!fechado.has(id)) { fechado.add(id); cresceu = true; }
      }
    }
    if (!cresceu) break;
  }
  return fechado;
}

/** O grupo de uma SiloPage na tela: o dos artigos dela, se todos concordam. */
export function sharedGroupOf(groupIds: readonly (string | null | undefined)[]): string | null {
  const definidos = unicos(groupIds);
  if (definidos.length !== 1) return null;
  return groupIds.every(id => id === definidos[0]) ? definidos[0] : null;
}
