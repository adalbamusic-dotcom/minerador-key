/**
 * O PLANO DE CONSULTAS DA UNIDADE EDITORIAL.
 *
 * O Radar pesquisava uma keyword. O artigo tem quatro, cinco — cada uma com
 * papel, volume, resultados, KGR, intenção e funil já decididos pelo Arquiteto.
 * Investigar só a principal descartava a maior parte da estratégia antes de
 * olhar a primeira SERP.
 *
 * Aqui cada keyword do `RadarArticleResearchContext` vira uma CANDIDATA a
 * consulta, com o fundamento inteiro anexado e uma classificação de utilidade
 * explícita. Existir não é motivo para executar: a decisão é declarada, e o
 * motivo dela também.
 *
 * A HIERARQUIA DOS SINAIS, na ordem:
 *
 *   1. PAPEL — principal > secundária > reforço. É a decisão editorial do
 *      Arquiteto, e nenhuma métrica a sobrepõe.
 *   2. INTENÇÃO E FUNIL — dizem QUE TIPO de concorrente a consulta traz.
 *   3. ENTIDADE E MODIFICADORES — preservam coerência temática.
 *   4. VOLUME, RESULTADOS E KGR — dimensionam e contextualizam. Nunca decidem
 *      sozinhos: KGR alto não promove reforço a consulta central, e volume alto
 *      não transforma secundária em principal.
 *
 * Domínio puro: sem fetch, sem storage, sem provider.
 */

import { radarDeclaredKeywordIntent } from "./editorial-identity.ts";
import type { RadarArticleResearchContext, RadarResearchKeyword } from "./article-research-context.ts";

/** O que fazer com esta candidata. Nunca "existe, então executa". */
export type RadarQueryDisposition =
  | "EXECUTE"
  | "REUSE_FORMATION_EVIDENCE"
  | "CONTEXT_ONLY"
  | "NOT_EXECUTABLE";

export type RadarQueryCandidate = {
  queryId: string;
  keyword: string | null;
  keywordId: string;
  role: RadarResearchKeyword["identity"]["role"];
  /** Ordem editorial: 1 principal, 2 secundária, 3 reforço. */
  rolePriority: 1 | 2 | 3;
  volume: number | null;
  resultCount: number | null;
  kgr: number | null;
  intent: string | null;
  funnel: string | null;
  entity: string | null;
  modifiers: string[];
  semanticQualification: RadarResearchKeyword["strategy"]["semanticQualification"];
  /** O que a SERP da FORMAÇÃO já sabia sobre esta keyword. */
  formationSerpContext: { seen: boolean; verdict: string | null; humanDecision: string | null };
  disposition: RadarQueryDisposition;
  reason: string;
};

export type RadarResearchQueryPlan = {
  articleId: string;
  articleDnaVersionId: string;
  /** A consulta central. Sem ela não há investigação. */
  primary: RadarQueryCandidate | null;
  queries: RadarQueryCandidate[];
  executable: RadarQueryCandidate[];
  contextOnly: RadarQueryCandidate[];
  limitations: string[];
};

const PRIORIDADE: Record<RadarResearchKeyword["identity"]["role"], 1 | 2 | 3> = {
  principal: 1, secundaria: 2, reforco_narrativo: 3,
};

const normalizar = (value: string | null | undefined) =>
  (value || "").toLocaleLowerCase("pt-BR").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim();

const PALAVRAS_VAZIAS = new Set(["de", "da", "do", "para", "com", "sem", "e", "ou", "em", "no", "na", "o", "a", "os", "as", "um", "uma"]);

const termos = (value: string | null | undefined) =>
  normalizar(value).split(" ").filter(token => token.length >= 3 && !PALAVRAS_VAZIAS.has(token));

/** Quanto da consulta candidata já está contida na principal. */
function sobreposicao(candidata: string | null, principal: string | null): number {
  const daCandidata = termos(candidata);
  if (!daCandidata.length) return 0;
  const daPrincipal = new Set(termos(principal));
  if (!daPrincipal.size) return 0;
  return daCandidata.filter(token => daPrincipal.has(token)).length / daCandidata.length;
}

const doSnapshot = (keyword: RadarResearchKeyword, chave: string): unknown => {
  const snapshot = keyword.strategy.keywordDnaSnapshot as { payload?: Record<string, unknown> } | null;
  return snapshot?.payload?.[chave];
};

const textoOu = (value: unknown): string | null => typeof value === "string" && value.trim() ? value.trim() : null;

/**
 * A consulta acrescenta uma leitura que a principal não traz?
 *
 * Intenção diferente muda o TIPO de página que a SERP devolve; entidade
 * diferente muda o assunto. Quando a candidata só repete a principal com outra
 * palavra, executar gastaria provider para receber quase o mesmo resultado.
 */
function acrescentaLeitura(candidata: RadarQueryCandidate, principal: RadarQueryCandidate | null) {
  if (!principal) return true;
  const intencaoDiferente = Boolean(candidata.intent && principal.intent && normalizar(candidata.intent) !== normalizar(principal.intent));
  const funilDiferente = Boolean(candidata.funnel && principal.funnel && normalizar(candidata.funnel) !== normalizar(principal.funnel));
  const entidadeDiferente = Boolean(candidata.entity && principal.entity && normalizar(candidata.entity) !== normalizar(principal.entity));
  const quaseIgual = sobreposicao(candidata.keyword, principal.keyword) >= 0.8;
  return intencaoDiferente || funilDiferente || entidadeDiferente || !quaseIgual;
}

function candidataDe(keyword: RadarResearchKeyword, context: RadarArticleResearchContext): RadarQueryCandidate {
  const relacao = context.formationSerp?.keywordUrls.find(item => item.keywordId === keyword.identity.keywordId) || null;
  return {
    queryId: `query:${keyword.identity.keywordId}`,
    keyword: keyword.identity.text,
    keywordId: keyword.identity.keywordId,
    role: keyword.identity.role,
    rolePriority: PRIORIDADE[keyword.identity.role],
    volume: keyword.strategy.volume,
    resultCount: keyword.strategy.resultCount,
    kgr: keyword.strategy.kgrScore,
    intent: radarDeclaredKeywordIntent(keyword.strategy),
    funnel: keyword.strategy.semanticQualification?.funnel || textoOu(doSnapshot(keyword, "journeyStage")),
    entity: textoOu(doSnapshot(keyword, "centralEntity")),
    modifiers: Array.isArray(doSnapshot(keyword, "modifiers")) ? (doSnapshot(keyword, "modifiers") as string[]) : [],
    semanticQualification: keyword.strategy.semanticQualification,
    formationSerpContext: {
      seen: Boolean(relacao),
      verdict: context.formationSerp?.verdict || null,
      humanDecision: context.formationSerp?.humanResolution?.decision || null,
    },
    disposition: "CONTEXT_ONLY",
    reason: "",
  };
}

export function buildRadarResearchQueryPlan(context: RadarArticleResearchContext): RadarResearchQueryPlan {
  const limitations: string[] = [];
  const candidatas = context.keywords
    .map(keyword => candidataDe(keyword, context))
    .sort((left, right) => left.rolePriority - right.rolePriority);

  const principal = candidatas.find(item => item.role === "principal") || null;

  if (!principal) limitations.push("A composição não declara principal; sem consulta central não existe investigação.");
  else if (!principal.keyword) limitations.push("A principal não teve o texto resolvido; a consulta central não pode ser montada.");

  for (const candidata of candidatas) {
    /*
     * Sem texto não há consulta — e o id NUNCA vira consulta. Foi assim que
     * UUID já apareceu tratado como keyword na análise.
     */
    if (!candidata.keyword) {
      candidata.disposition = "NOT_EXECUTABLE";
      candidata.reason = "A keyword não teve o texto resolvido nesta versão; ela permanece no plano como contexto declarado.";
      continue;
    }

    if (candidata.role === "principal") {
      candidata.disposition = "EXECUTE";
      candidata.reason = "Consulta central da unidade editorial: é a âncora da investigação.";
      continue;
    }

    if (!acrescentaLeitura(candidata, principal)) {
      candidata.disposition = "CONTEXT_ONLY";
      candidata.reason = "Repete a principal em intenção, funil, entidade e termos; executar traria a mesma leitura.";
      continue;
    }

    /*
     * A SERP da formação já olhou esta keyword e uma pessoa já decidiu algo
     * sobre ela. Reaproveitar esse contexto evita redescobrir uma divergência
     * resolvida — sem transformar snapshot antigo em snapshot corrente.
     */
    if (candidata.formationSerpContext.seen && candidata.formationSerpContext.humanDecision) {
      candidata.disposition = "REUSE_FORMATION_EVIDENCE";
      candidata.reason = `A SERP de formação já observou esta keyword e a decisão humana registrada foi "${candidata.formationSerpContext.humanDecision}".`;
      continue;
    }

    if (candidata.role === "secundaria") {
      candidata.disposition = "EXECUTE";
      candidata.reason = candidata.intent && principal?.intent && normalizar(candidata.intent) !== normalizar(principal.intent)
        ? `Secundária com intenção própria (${candidata.intent}); amplia o universo com um tipo de concorrente que a principal não traz.`
        : "Secundária com recorte próprio; amplia o universo competitivo do artigo.";
      continue;
    }

    /*
     * REFORÇO SÓ VIRA CONSULTA COM MOTIVO PRÓPRIO.
     *
     * Ele existe para completar entidades e narrativa, não para ampliar
     * demanda. Volume ou KGR altos não o promovem: o papel manda.
     */
    const temEntidadePropria = Boolean(candidata.entity && principal?.entity && normalizar(candidata.entity) !== normalizar(principal.entity));
    if (temEntidadePropria) {
      candidata.disposition = "EXECUTE";
      candidata.reason = `Reforço com entidade própria (${candidata.entity}); a consulta cobre um recorte que a principal não alcança.`;
    } else {
      candidata.disposition = "CONTEXT_ONLY";
      candidata.reason = "Reforço narrativo: contribui semanticamente para a leitura, sem consulta própria nesta investigação.";
    }
  }

  const semTexto = candidatas.filter(item => item.disposition === "NOT_EXECUTABLE");
  if (semTexto.length) limitations.push(`${semTexto.length} keyword(s) sem texto resolvido ficaram fora das consultas e permanecem como contexto.`);

  return {
    articleId: context.article.articleId,
    articleDnaVersionId: context.article.articleDnaVersionId,
    primary: principal,
    queries: candidatas,
    executable: candidatas.filter(item => item.disposition === "EXECUTE"),
    contextOnly: candidatas.filter(item => item.disposition === "CONTEXT_ONLY" || item.disposition === "REUSE_FORMATION_EVIDENCE"),
    limitations,
  };
}

export const radarQueryDispositionLabel = (disposition: RadarQueryDisposition) => ({
  EXECUTE: "Executar",
  REUSE_FORMATION_EVIDENCE: "Reaproveitar evidência da formação",
  CONTEXT_ONLY: "Somente contexto",
  NOT_EXECUTABLE: "Sem texto resolvido",
}[disposition]);
