/**
 * Continuidade da KeywordDNA entre as abas Silos e Artigos.
 *
 * O problema que isto resolve: uma keyword que não pode virar Article ainda
 * PERTENCE ao patrimônio do Arquiteto. Somindo da aba Artigos, a mesa parece
 * duas planilhas diferentes. Aqui ela continua visível como linha de pipeline,
 * dizendo por que ainda não é artigo.
 *
 * Linha de pipeline NÃO é Article: não cria ArticleDNA, não cria working copy,
 * não fabrica `articleId`. A identidade continua sendo o `keywordId` até existir
 * unidade editorial de verdade.
 *
 * Domínio puro: sem storage, sem fetch, sem UI.
 */

export type ArticlePipelineState =
  /** Já projetada como artigo em formação — não vira linha de pipeline. */
  | "article_working"
  /** Silo confirmado e livre, mas ainda sem unidade editorial formada. */
  | "eligible"
  /** Dentro de silo que ainda não foi confirmado por um humano. */
  | "awaiting_silo_confirmation"
  /** Sem nenhuma decisão de silo. */
  | "awaiting_silo"
  /** Cabeceira do universo: pertence à SiloPage, não a um Article. */
  | "reserved_silo_head";

export type ArticlePipelineRow = {
  keywordId: string;
  keyword: string;
  state: ArticlePipelineState;
  /** Nome do silo quando existe vínculo; nunca inventado. */
  siloName: string | null;
  territoryRef: string | null;
  /** Motivo legível do estado — a linha explica a si mesma. */
  reason: string;
};

export type ArticlePipelineProjection = {
  /** Só o que NÃO é artigo; a linha de artigo continua sendo do modo Artigos. */
  rows: ArticlePipelineRow[];
  counts: Record<ArticlePipelineState, number>;
};

type PipelineKeywordLike = {
  id: string | number;
  keyword?: string | null;
  siloId?: string | null;
  siloName?: string | null;
  territoryRef?: string | null;
  isPublished?: boolean | null;
};

const REASONS: Record<Exclude<ArticlePipelineState, "article_working">, string> = {
  eligible: "Silo confirmado; aguardando processar artigos.",
  awaiting_silo_confirmation: "Aguardando confirmação do Silo.",
  awaiting_silo: "Aguardando definição de Silo.",
  reserved_silo_head: "Reservada para a página do Silo.",
};

const emptyCounts = (): Record<ArticlePipelineState, number> => ({
  article_working: 0,
  eligible: 0,
  awaiting_silo_confirmation: 0,
  awaiting_silo: 0,
  reserved_silo_head: 0,
});

/**
 * Classifica UMA keyword. A ordem de precedência é deliberada: estar em artigo
 * vence tudo; depois a reserva da cabeceira, que é decisão de arquitetura e não
 * pode ser contornada por já haver silo confirmado.
 */
export function articlePipelineStateOf(input: {
  keyword: PipelineKeywordLike;
  confirmedTerritoryRefs: ReadonlySet<string>;
  reservedHeadKeywordIds: ReadonlySet<string>;
  /** Quem já virou artigo. Ausente = ninguém foi projetado ainda. */
  keywordIdsInArticles?: ReadonlySet<string>;
}): ArticlePipelineState {
  const keywordId = String(input.keyword.id);
  if (input.keywordIdsInArticles?.has(keywordId)) return "article_working";
  if (input.reservedHeadKeywordIds.has(keywordId)) return "reserved_silo_head";

  const territoryRef = typeof input.keyword.territoryRef === "string" ? input.keyword.territoryRef : null;
  // Patrimônio publicado e silo legado já existem: não ficam esperando decisão.
  if (input.keyword.isPublished || input.keyword.siloId) return "eligible";
  if (!territoryRef) return "awaiting_silo";
  return input.confirmedTerritoryRefs.has(territoryRef) ? "eligible" : "awaiting_silo_confirmation";
}

export function buildArticlePipelineRows(input: {
  keywords: readonly PipelineKeywordLike[];
  confirmedTerritoryRefs: ReadonlySet<string>;
  reservedHeadKeywordIds: ReadonlySet<string>;
  keywordIdsInArticles?: ReadonlySet<string>;
  /** Nome do silo por `territoryRef`, para a linha citar o vínculo real. */
  territoryNames?: ReadonlyMap<string, string>;
}): ArticlePipelineProjection {
  const counts = emptyCounts();
  const rows: ArticlePipelineRow[] = [];

  for (const keyword of input.keywords) {
    const state = articlePipelineStateOf({
      keyword,
      confirmedTerritoryRefs: input.confirmedTerritoryRefs,
      reservedHeadKeywordIds: input.reservedHeadKeywordIds,
      keywordIdsInArticles: input.keywordIdsInArticles,
    });
    counts[state] += 1;
    if (state === "article_working") continue;

    const territoryRef = typeof keyword.territoryRef === "string" ? keyword.territoryRef : null;
    rows.push({
      keywordId: String(keyword.id),
      keyword: String(keyword.keyword || ""),
      state,
      siloName: keyword.siloName
        || (territoryRef ? input.territoryNames?.get(territoryRef) ?? null : null),
      territoryRef,
      reason: REASONS[state],
    });
  }

  return { rows, counts };
}

/** Ordem de exibição das seções na aba Artigos. */
export const ARTICLE_PIPELINE_SECTION_ORDER: readonly Exclude<ArticlePipelineState, "article_working">[] = [
  "eligible",
  "awaiting_silo_confirmation",
  "awaiting_silo",
  "reserved_silo_head",
];
