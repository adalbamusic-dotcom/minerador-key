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

/** A recusa do pedido antigo `approveNewKeywords: true` (tela antiga ou MCP): o caminho é o Minerador. */
export const IMPROVEMENT_APPROVE_NEW_KEYWORDS_RETIRED = "O Arquiteto não aprova keyword no Minerador. Keywords novas, medições e a Lógica vão como sugestão: decida em “Sugestões do Arquiteto” no Minerador (lá, importar e depois “Aprovar e enviar”) e prepare de novo aqui. Nada foi gravado.";

const vazio = (needs: ImprovementMineradorNeeds) => !needs.newKeywordIds.length && !needs.measureKeywordIds.length && !needs.logicKeywordIds.length;

/**
 * O que a proposta precisaria do Minerador. `hasIntent` lê a linha atual
 * (na gravação) ou o sinal da preparação; ausente = o sinal da execução.
 */
export function improvementMineradorNeeds(
  proposal: Pick<ImprovementProposal, "memberIds" | "principalId">,
  keywords: readonly Pick<ImprovementKeyword, "id" | "external" | "volumePendingWrite" | "signals">[],
  hasIntent?: (keywordId: string) => boolean | null,
): ImprovementMineradorNeeds | null {
  const porId = new Map(keywords.map(keyword => [keyword.id, keyword]));
  const ids = [...new Set([...proposal.memberIds, ...(proposal.principalId ? [proposal.principalId] : [])])];
  const needs: ImprovementMineradorNeeds = { newKeywordIds: [], measureKeywordIds: [], logicKeywordIds: [] };
  for (const id of ids) {
    const keyword = porId.get(id);
    if (!keyword) continue;
    if (keyword.external) { needs.newKeywordIds.push(id); continue; }
    if (keyword.volumePendingWrite) needs.measureKeywordIds.push(id);
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
