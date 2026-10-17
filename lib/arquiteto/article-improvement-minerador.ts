import type { ImprovementKeyword, ImprovementProposal, ImprovementTarget } from "./article-improvement.ts";
import type { ArchitectSuggestionDraft } from "./minerador-suggestions.ts";

/**
 * F4 · O ARQUITETO SÓ LÊ (SDD `docs/compartilhado/sdd-arquiteto-so-le-e-listas-leves-2026-10-13.md`,
 * item 2; D3) — a melhoria reorganiza o ArticleDNA SÓ com keywords que já
 * estão no Minerador e recebidas no Arquiteto, com volume gravado no Minerador
 * e com a Lógica. O que falta vira "Precisa do Minerador" na linha da prévia,
 * e a sugestão vai para a caixa "Sugestões do Arquiteto" do Minerador.
 *
 * Antes, "Gravar melhorias" fazia seis escritas no Minerador num clique
 * (medição, Lógica, import, métricas, aprovação e envio), com a flag de
 * aprovação fixada pelo painel.
 */

export type ImprovementMineradorNeeds = {
  /** Ideias da busca nova (ou do Minerador ainda não recebidas): importar e aprovar no Minerador. */
  newKeywordIds: string[];
  /** Medidas na preparação, mas a medição não está gravada no Minerador. */
  measureKeywordIds: string[];
  /** Sem intenção (a Lógica do Minerador ainda não rodou nelas). */
  logicKeywordIds: string[];
};

export const IMPROVEMENT_NEEDS_MINERADOR_LABEL = "Precisa do Minerador";

/**
 * SUBSTITUÍDO em 2026-10-16 (decisão do dono, SDD da linha única §15 passo 4):
 * a keyword NOVA (que não existe na marca) volta a entrar na MESMA confirmação.
 * Mantido só para leitura de execuções e mensagens antigas.
 */
export const IMPROVEMENT_APPROVE_NEW_KEYWORDS_RETIRED = "O Arquiteto não aprova keyword no Minerador. Keywords novas, medições e a Lógica vão como sugestão: decida em “Sugestões do Arquiteto” no Minerador (lá, importar e depois “Aprovar e enviar”) e prepare de novo aqui. Nada foi gravado.";

/*
 * 2026-10-16 · KEYWORD NOVA ENTRA NA MESMA CONFIRMAÇÃO (dono: "PROCURA NOVOS,
 * DIFERENTES DAS QUE JÁ ESTÃO NA LISTA, PODE PROCESSAR ELES E INCORPORAR ELES";
 * "TUDO QUE VEM DO MINERADOR NÃO PODE MEXER, SÓ ANALISAR E TRABALHAR COM ISSO").
 *
 * Nova = não existe na marca (chave normalizada do Minerador, qualquer lista,
 * qualquer status, viva). A confirmação a importa, roda a Lógica, grava o
 * Volume medido, aprova e envia ao Arquiteto — pelos núcleos do Minerador, só
 * nas linhas que ela mesma criou. A keyword que JÁ existe é só lida: nunca é
 * importada, medida, processada nem aprovada de novo pelo Arquiteto.
 */
export const IMPROVEMENT_NEW_KEYWORDS_APPROVAL_TEXT = "Ao confirmar, as keywords NOVAS desta prévia (que não existem na marca) são importadas no Minerador, processadas pela Lógica, recebem o Volume do Google Ads já medido na prévia (sem consultar de novo), são aprovadas e enviadas ao Arquiteto e entram no artigo — tudo nesta mesma confirmação. As keywords que já vieram do Minerador não são alteradas.";
export const IMPROVEMENT_NEW_KEYWORDS_APPROVAL_REQUIRED = `Há keywords novas nesta prévia: a confirmação precisa dizer que elas entram no Minerador (approveNewKeywords). ${IMPROVEMENT_NEW_KEYWORDS_APPROVAL_TEXT} Nada foi gravado.`;

/** As keywords NOVAS da proposta: ideias da busca que não existem na marca. */
export function improvementNewKeywordIds(
  proposal: Pick<ImprovementProposal, "memberIds" | "principalId">,
  keywords: readonly Pick<ImprovementKeyword, "id" | "external" | "knownInMinerador">[],
): string[] {
  const porId = new Map(keywords.map(keyword => [keyword.id, keyword]));
  return [...new Set([...proposal.memberIds, ...(proposal.principalId ? [proposal.principalId] : [])])].filter(id => { const k = porId.get(id); return Boolean(k?.external && !k.knownInMinerador); });
}

/** De onde veio a keyword nova (a única fonte que a busca nova executa hoje). */
export const IMPROVEMENT_NEW_KEYWORD_SOURCE_LABEL = "busca nova no Google Ads";

export type ImprovementNewKeywordsPreview = {
  total: number;
  articles: Array<{ targetId: string; theme: string; keywords: Array<{ keywordId: string; keyword: string; volume: number | null; source: string }> }>;
  /** Uma frase por artigo: as keywords novas com volume e fonte. */
  lines: string[];
  /** O que a confirmação faz com elas; null quando não há nova. */
  approvalText: string | null;
};

/**
 * 2026-10-17 · A PRÉVIA DIZ, POR ARTIGO, AS KEYWORDS NOVAS (pedido do dono): o
 * texto que a tela mostra antes de "Confirmar e aplicar" e que acompanha o
 * `approveNewKeywords: true`. Só as linhas marcadas; só as NOVAS na marca (a
 * que já existe no Minerador é só lida e não aparece aqui).
 */
export function improvementNewKeywordsPreview(
  run: {
    proposals: readonly Pick<ImprovementProposal, "targetId" | "theme" | "memberIds" | "principalId">[];
    keywords: readonly Pick<ImprovementKeyword, "id" | "keyword" | "volume" | "volumeValidated" | "external" | "knownInMinerador">[];
  },
  targetIds: Iterable<string>,
): ImprovementNewKeywordsPreview {
  const marcadas = new Set(targetIds);
  const porId = new Map(run.keywords.map(keyword => [keyword.id, keyword]));
  const articles = run.proposals.filter(proposal => marcadas.has(proposal.targetId)).map(proposal => ({
    targetId: proposal.targetId,
    theme: proposal.theme,
    keywords: improvementNewKeywordIds(proposal, run.keywords).map(id => {
      const keyword = porId.get(id)!;
      return { keywordId: id, keyword: keyword.keyword, volume: keyword.volumeValidated ? keyword.volume : null, source: IMPROVEMENT_NEW_KEYWORD_SOURCE_LABEL };
    }),
  })).filter(article => article.keywords.length > 0);
  const total = articles.reduce((soma, article) => soma + article.keywords.length, 0);
  const volume = (value: number | null) => value === null ? "sem volume" : `${value.toLocaleString("pt-BR")}/mês`;
  return {
    total,
    articles,
    lines: articles.map(article => `“${article.theme}”: ${article.keywords.map(item => `“${item.keyword}” (${volume(item.volume)}, ${item.source})`).join(", ")}.`),
    approvalText: total ? `${total} keyword(s) NOVA(S) na marca. ${IMPROVEMENT_NEW_KEYWORDS_APPROVAL_TEXT}` : null,
  };
}

const vazio = (needs: ImprovementMineradorNeeds) =>!needs.newKeywordIds.length && !needs.measureKeywordIds.length && !needs.logicKeywordIds.length;

/**
 * O que a proposta precisaria do Minerador. `hasIntent` lê a linha atual
 * (na gravação) ou o sinal da preparação; ausente = o sinal da execução.
 */
export function improvementMineradorNeeds(
  proposal: Pick<ImprovementProposal, "memberIds" | "principalId"> & Partial<Pick<ImprovementProposal, "targetId" | "kind">>,
  keywords: readonly (Pick<ImprovementKeyword, "id" | "external" | "volumePendingWrite" | "signals"> & Partial<Pick<ImprovementKeyword, "knownInMinerador">>)[],
  hasIntent?: (keywordId: string) => boolean | null,
): ImprovementMineradorNeeds | null {
  const porId = new Map(keywords.map(keyword => [keyword.id, keyword]));
  const ids = [...new Set([...proposal.memberIds, ...(proposal.principalId ? [proposal.principalId] : [])])];
  const needs: ImprovementMineradorNeeds = { newKeywordIds: [], measureKeywordIds: [], logicKeywordIds: [] };
  for (const id of ids) {
    const keyword = porId.get(id);
    if (!keyword) continue;
    // 2026-10-16 · a NOVA (não existe na marca) entra na mesma confirmação; só a que JÁ existe no Minerador e não chegou ao Arquiteto precisa dele (o Arquiteto não mexe nela).
    if (keyword.external && !keyword.knownInMinerador) continue;
    if (keyword.external) { needs.newKeywordIds.push(id); continue; }
    if (keyword.volumePendingWrite) needs.measureKeywordIds.push(id);
    /*
     * 2026-10-16 · a keyword que carrega o Assunto (cadastro único) é a
     * identidade do artigo do plano, aprovada no Minerador com o plano: ela não
     * pede a Lógica para ficar no próprio artigo (antes ela nem estava na lista
     * da melhoria, e a regra não a via).
     */
    if (proposal.kind === "subject" && id === proposal.targetId) continue;
    const intencao = hasIntent ? hasIntent(id) : Boolean(keyword.signals?.intent);
    if (intencao === false) needs.logicKeywordIds.push(id);
  }
  return vazio(needs) ? null : needs;
}

/** A frase da linha: o que falta, com os nomes. */
export function improvementMineradorNeedsSentence(needs: ImprovementMineradorNeeds, nameOf: (keywordId: string) => string): string {
  const lista = (ids: readonly string[]) => ids.slice(0, 4).map(id => `“${nameOf(id)}”`).join(", ") + (ids.length > 4 ? ` e mais ${ids.length - 4}` : "");
  const partes = [
    needs.newKeywordIds.length ? `${needs.newKeywordIds.length} keyword(s) nova(s) para importar e aprovar no Minerador (${lista(needs.newKeywordIds)})` : null,
    needs.measureKeywordIds.length ? `${needs.measureKeywordIds.length} medição(ões) de volume para gravar no Minerador (${lista(needs.measureKeywordIds)})` : null,
    needs.logicKeywordIds.length ? `a Lógica do Minerador em ${needs.logicKeywordIds.length} keyword(s) sem intenção (${lista(needs.logicKeywordIds)})` : null,
  ].filter(Boolean);
  return `${IMPROVEMENT_NEEDS_MINERADOR_LABEL}: ${partes.join("; ")}. O Arquiteto não grava no Minerador: abra “Sugestões do Arquiteto” no Minerador, decida lá e depois “Buscar de novo” aqui.`;
}

/**
 * Marca as propostas prontas que dependem do Minerador: deixam de ser
 * aceitáveis (nada é gravado nelas), ganham `needsMinerador` e o motivo. Não
 * pagam SERP por elas (a validação só olha as prontas).
 */
export function markImprovementMineradorNeeds(
  proposals: ImprovementProposal[],
  keywords: readonly ImprovementKeyword[],
  hasIntent?: (keywordId: string) => boolean | null,
): number {
  const nome = (id: string) => keywords.find(keyword => keyword.id === id)?.keyword ?? id;
  let marcadas = 0;
  for (const proposal of proposals) {
    if (proposal.status !== "ready" || proposal.serpRefresh) continue;
    const needs = improvementMineradorNeeds(proposal, keywords, hasIntent);
    if (!needs) { delete proposal.needsMinerador; continue; }
    proposal.status = "insufficient_evidence";
    proposal.needsMinerador = needs;
    proposal.reasons.push(improvementMineradorNeedsSentence(needs, nome));
    marcadas++;
  }
  return marcadas;
}

/** As sugestões da execução para a caixa do Minerador (uma por keyword e destino). */
export function improvementSuggestionDrafts(run: {
  runId: string;
  targets: readonly ImprovementTarget[];
  keywords: readonly ImprovementKeyword[];
  proposals: readonly ImprovementProposal[];
}): ArchitectSuggestionDraft[] {
  const porId = new Map(run.keywords.map(keyword => [keyword.id, keyword]));
  const drafts: ArchitectSuggestionDraft[] = [];
  for (const proposal of run.proposals) {
    const needs = proposal.needsMinerador;
    if (!needs) continue;
    const target = run.targets.find(item => item.id === proposal.targetId);
    if (!target) continue;
    const destino = { targetKeywordId: target.id, targetTheme: target.theme, targetKind: target.kind, subjectKeywordId: target.kind === "subject" ? target.id : null } as const;
    const motivoIa = (id: string) => proposal.aiReasons?.find(item => item.keywordId === id)?.reason ?? null;
    const papel = (id: string) => id === proposal.principalId ? "principal" : "secundária";
    const add = (kind: ArchitectSuggestionDraft["kind"], id: string, reason: string) => {
      const keyword = porId.get(id);
      if (!keyword) return;
      const medida = keyword.volumeValidated || keyword.googleAdsMeasured;
      drafts.push({
        kind,
        keyword: keyword.keyword,
        keywordId: kind === "new_keyword" ? keyword.knownInMinerador?.keywordId ?? null : keyword.id,
        ...destino,
        volume: keyword.volumeValidated ? keyword.volume : null,
        volumeSource: medida ? "google_ads" : null,
        measuredAt: keyword.measuredNowAt ?? keyword.noAverageAt ?? null,
        reason,
        origins: kind === "new_keyword" ? ["ads_keyword_seed"] : [],
        evidence: kind === "new_keyword" ? [`Google Ads: descoberta e Volume medido para ${target.theme}`] : [],
        searchId: kind === "new_keyword" ? run.runId : null,
        // A medição guardada só serve à ideia nova (que ainda não está no Minerador) e à medição pendente.
        measurement: (kind === "measure" || (kind === "new_keyword" && !keyword.knownInMinerador)) ? keyword.measurement ?? null : null,
      });
    };
    for (const id of needs.newKeywordIds) add("new_keyword", id, `Entraria como ${papel(id)} em “${target.theme}”.${motivoIa(id) ? ` ${motivoIa(id)}` : ""}`);
    for (const id of needs.measureKeywordIds) add("measure", id, `Medida no Google Ads na preparação da melhoria de “${target.theme}”; a gravação da medição é do Minerador.`);
    for (const id of needs.logicKeywordIds) add("logic", id, `Sem intenção: a Lógica do Minerador precisa rodar antes de ela entrar em “${target.theme}”.`);
  }
  return drafts;
}
