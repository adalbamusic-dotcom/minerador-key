/**
 * A LEITURA ÚNICA DA INVESTIGAÇÃO PROFUNDA.
 *
 * A tela não deve montar plano, universo, comparação e suficiência cada uma do
 * seu jeito — foi assim que contador passou a discordar de contador. Aqui a
 * investigação inteira é resolvida uma vez, na mesma ordem, a partir do que já
 * existe: contexto resolvido, snapshot corrente, extrações e registro
 * persistido.
 *
 * A tela renderiza. Ela não decide.
 *
 * Domínio puro: sem fetch, sem storage, sem provider.
 */

import type { RadarArticleResearchContext } from "./article-research-context.ts";
import { radarDeclaredArticleIntent } from "./editorial-identity.ts";
import { buildRadarCompetitiveModel, type RadarCompetitiveModel } from "./competitive-model.ts";
import type { RadarExtractionPage } from "./analysis-contracts.ts";
import type { SerpOrganicResult } from "./serp/contracts.ts";
import { isComparableRadarExtraction } from "./analysis-insights.ts";
import { buildRadarCompetitorUniverse, type RadarCompetitorUniverse, type RadarExecutedQuery } from "./competitor-universe.ts";
import { buildRadarEditorialComparison, type RadarEditorialComparison } from "./editorial-comparison.ts";
import { buildRadarExternalEvidenceCandidates, type RadarExternalEvidenceCandidate, type RadarInternalLinkResearch } from "./link-and-source-research.ts";
import { buildRadarResearchQueryPlan, type RadarResearchQueryPlan } from "./research-query-plan.ts";
import { buildRadarResearchReferences, radarNormalizedUrl, type RadarResearchReference } from "./research-reference.ts";
import { buildRadarResearchCurationView, type RadarResearchCurationView, type RadarResearchDecision } from "./research-curation.ts";
import { radarPhase1Action, type RadarPhase1Action } from "./serp-phase1.ts";
import { radarResearchResumption, type RadarResearchResumption } from "./research-resumption.ts";
import { radarAnalysisPersistenceState, radarBundleBelongsToCurrentResearch, type RadarAnalysisPersistence } from "./remote-authority.ts";
import type { RadarPrimarySearchMode } from "./search-mode.ts";
import { radarDeclaredCommercialSignal } from "./foundation-profiles.ts";
import {
  buildRadarDeepResearchSummary,
  buildRadarResearchFingerprint,
  radarDeepResearchAction,
  radarDeepResearchState,
  type RadarDeepResearchAction,
  type RadarDeepResearchRecord,
  type RadarDeepResearchState,
  type RadarDeepResearchSummary,
  type RadarResearchFingerprint,
} from "./deep-research.ts";
import { buildRadarEditorialBlueprint, type RadarEditorialBlueprint } from "./editorial-blueprint.ts";
import { resolveRadarInvestigationSufficiency, type RadarInvestigationSufficiency } from "./investigation-sufficiency.ts";
import { radarFinalizationReadiness, type RadarFinalizationReadiness, type RadarFrozenEvidenceBundle } from "./investigation-finalization.ts";
import { radarSourceClassificationFromRecord } from "./source-authority.ts";
import {
  buildRadarCompetitiveObservedModel, radarObservedNarrative,
  type RadarCompetitiveObservedModel, type RadarObservedNarrativeSection,
} from "./competitive-observed-model.ts";

export type RadarDeepResearchView = {
  state: RadarDeepResearchState;
  action: RadarDeepResearchAction;
  /** A ação única da Fase 1: iniciar, analisar ou finalizar. */
  phase1: RadarPhase1Action;
  /**
   * O QUE JÁ EXISTE E O QUE FALTA, POR CONSULTA — Gate 18.9.
   *
   * É esta leitura que separa "a pesquisa nunca começou" de "a SERP do artigo
   * já está paga e gravada, faltam as auxiliares". Sem ela, uma canônica
   * recuperada do banco aparecia como "Não iniciado" e a única ação oferecida
   * recoletava, paga, o que acabara de ser recuperado.
   */
  resumption: RadarResearchResumption;
  /**
   * O QUE O SERVIDOR JÁ GUARDOU DESTA ANÁLISE — Gate 18.10.1.
   *
   * Separa "as páginas nunca foram lidas" de "as páginas estão gravadas e a
   * consolidação não foi confirmada". Sem essa distinção a tela ou mandava
   * reler o que já está pago, ou travava sem saída.
   */
  persistence: RadarAnalysisPersistence;
  record: RadarDeepResearchRecord | null;
  fingerprint: RadarResearchFingerprint;
  stale: boolean;
  plan: RadarResearchQueryPlan;
  universe: RadarCompetitorUniverse | null;
  /** As URLs do universo com identidade própria — o que a curadoria enxerga. */
  references: RadarResearchReference[];
  /** A decisão humana sobre o universo, com rascunho e obsolescência. */
  curation: RadarResearchCurationView;
  comparison: RadarEditorialComparison;
  internalLinks: RadarInternalLinkResearch;
  externalCandidates: RadarExternalEvidenceCandidate[];
  externalLimitations: string[];
  sufficiency: RadarInvestigationSufficiency;
  /** O resumo vivo. Ao finalizar, ele é o que fica gravado no registro. */
  summary: RadarDeepResearchSummary;
  /** A fotografia competitiva consolidada — a autoridade única do Gate 9. */
  observed: RadarCompetitiveObservedModel;
  /** A mesma leitura em linguagem de quem opera, derivada de `observed`. */
  narrative: RadarObservedNarrativeSection[];
  /**
   * A INVESTIGAÇÃO CONGELADA, QUANDO EXISTE.
   *
   * Ela chega GRAVADA, não recalculada: é o que permite dizer depois "este
   * planejamento usou exatamente estas evidências". `observed` continua sendo
   * a leitura viva do que está no disco hoje; quando as duas divergirem, quem
   * vale para o que já foi finalizado é esta.
   */
  finalizedBundle: RadarFrozenEvidenceBundle | null;
  /** A leitura de prontidão do encerramento, com a insuficiência consciente. */
  finalization: RadarFinalizationReadiness;
  /*
   * O DOSSIÊ EDITORIAL — a leitura que responde "como construir este artigo".
   *
   * Ele é DERIVADO da mesma fotografia, na mesma passagem: mantê-lo fora da
   * view faria cada tela montá-lo por conta própria, e duas montagens da mesma
   * evidência divergem no primeiro ajuste de ordenação.
   */
  blueprint: RadarEditorialBlueprint;
};

export function buildRadarDeepResearchView(input: {
  context: RadarArticleResearchContext;
  record?: RadarDeepResearchRecord | null;
  running?: boolean;
  snapshot?: { query: string; organicResults: readonly SerpOrganicResult[] } | null;
  extractions?: readonly RadarExtractionPage[];
  extractionFailures?: number;
  /** As URLs que falharam nesta versão. Sem elas, falha vira pendente eterno. */
  extractionFailureUrls?: readonly string[];
  selectedReferences?: number;
  curationConfirmed?: boolean;
  model?: RadarCompetitiveModel | null;
  diagnostic?: { dominantIntent: string | null; dominantFormats: string[] } | null;
  /** Marcações locais da curadoria da pesquisa, ainda não confirmadas. */
  researchDraft?: Record<string, { decision: RadarResearchDecision; reason?: string }>;
  /** O modo escolhido para a próxima pesquisa, enquanto não há registro. */
  mode?: RadarPrimarySearchMode;
  /**
   * O ANALYZE desta versão terminou com gravação e readback confirmados?
   *
   * Vem do que está PERSISTIDO (`analysisCompletedAt`), não de estado local:
   * modelos construídos em memória que não chegaram ao banco não tornam a
   * investigação finalizável.
   */
  analysisConfirmed?: boolean;
  /**
   * O payload da versão de análise PERSISTIDA, quando existe — Gate 18.10.1.
   *
   * Ele é lido apenas para saber o que o servidor já guardou (páginas, fontes
   * verificadas, benchmark, relatório, carimbo). Nada aqui é recalculado a
   * partir dele; a leitura viva continua vindo das mesmas fontes de sempre.
   */
  persistedAnalysis?: {
    extractions?: readonly unknown[];
    verifiedSources?: readonly unknown[];
    benchmark?: unknown;
    competitiveReport?: unknown;
    analysisCompletedAt?: string | null;
    finalizedBundle?: unknown;
  } | null;
  /** O instante desta leitura. O módulo é puro: quem tem relógio informa. */
  observedAt?: string;
  /**
   * As fontes que o ANALYZE verificou, como ficaram gravadas.
   *
   * Elas chegam de fora porque verificar é navegação externa — e navegação
   * externa não acontece ao montar uma leitura.
   */
  verifiedSources?: readonly Parameters<typeof radarSourceClassificationFromRecord>[0][];
  /**
   * A investigação congelada, como ficou gravada.
   *
   * Ela chega de fora porque é PERSISTIDA: reconstruí-la aqui devolveria a
   * leitura de hoje com cara de conclusão de ontem, que é exatamente o que
   * congelar existe para impedir.
   */
  finalizedBundle?: RadarFrozenEvidenceBundle | null;
}): RadarDeepResearchView {
  const context = input.context;
  const plan = buildRadarResearchQueryPlan(context);
  const fingerprint = buildRadarResearchFingerprint(context);
  const extractions = [...(input.extractions || [])];

  /*
   * DUAS FONTES, UM UNIVERSO.
   *
   * A SERP CANÔNICA da principal — a que tem snapshot, revisão e aprovação —
   * entra pelo snapshot corrente do artigo. As SERPs AUXILIARES das secundárias
   * e do reforço entram pela evidência guardada no registro da investigação.
   *
   * O universo não distingue procedência ao cruzar: o que ele lê é recorrência.
   * A distinção existe onde importa — no destino de cada coleta.
   */
  /*
   * CADA MODO RESPONDE PELO QUE ELE MESMO COLETOU — §10 do Gate 18.1.
   *
   * O SMOKE ENCONTROU ISTO. Escolher YouTube ou Amazon, sem executar nada,
   * mostrava "1 consulta · 7 referências": a SERP canônica do Google entrava no
   * universo independentemente do modo, porque ela é um artefato do artigo e
   * estava sendo lida sem perguntar a que modo pertencia.
   *
   * Web pesquisa páginas, YouTube pesquisa vídeos, Amazon pesquisa produtos. Um
   * modo que não rodou não tem amostra — e herdar a do Google faria a tela
   * descrever um benchmark que não existe, com a régua errada.
   *
   * O modo efetivo é o da investigação GRAVADA quando existe uma: uma rodada
   * feita em Web continua sendo Web mesmo que o seletor esteja mostrando outra
   * coisa. Sem registro, vale a escolha corrente para a próxima pesquisa.
   */
  const modoEfetivo = input.record?.primarySearchMode || input.mode || "WEB";
  const canonica: RadarExecutedQuery[] = modoEfetivo === "WEB" && input.snapshot && plan.primary?.keyword
    ? [{
      queryId: plan.primary.queryId,
      keyword: plan.primary.keyword,
      role: plan.primary.role,
      keywordId: plan.primary.keywordId,
      serpClass: "canonical",
      results: input.snapshot.organicResults.map(result => ({
        position: result.position,
        url: result.url,
        title: result.title,
        domain: result.domain,
        snippet: result.snippet,
        inferredType: result.manualType || result.inferredType,
      })),
    }]
    : [];

  const auxiliares: RadarExecutedQuery[] = (input.record?.queries || [])
    .filter(query => query.evidence && query.serpClass === "auxiliary" && query.keyword)
    .map(query => ({
      queryId: query.queryId,
      keyword: query.keyword as string,
      role: query.role,
      keywordId: query.keywordId,
      serpClass: "auxiliary" as const,
      results: (query.evidence?.results || []).map(result => ({
        position: result.position,
        url: result.url,
        title: result.title,
        domain: result.domain,
        inferredType: result.inferredType,
      })),
    }));

  const executadas = [...canonica, ...auxiliares];
  const universe = executadas.length
    ? buildRadarCompetitorUniverse({
      queries: executadas,
      context,
      formationUrls: [],
    })
    : null;

  /*
   * O UNIVERSO, ENDEREÇÁVEL — e a decisão humana sobre ele.
   *
   * As referências são as URLs do universo com identidade própria; a curadoria
   * é o que a pessoa decidiu sobre cada uma. Ambas saem daqui prontas: a aba
   * renderiza, não recalcula.
   */
  const references = universe ? buildRadarResearchReferences({ queries: executadas, universe, context }) : [];
  const curation = buildRadarResearchCurationView({
    references,
    curation: input.record?.researchCuration || null,
    draft: input.researchDraft,
  });

  /*
   * O MODELO ESTRUTURAL NASCE AQUI, E SÓ AQUI.
   *
   * Ele era montado em dois lugares: a aba calculava um a partir das extrações
   * correntes e o relatório gravava outro. Nada garantia que os dois
   * concordassem — e, quando o relatório envelhecia, a tela e o documento
   * descreviam investigações diferentes com a mesma cara de verdade.
   *
   * As extrações correntes têm precedência: elas são o que existe agora. O
   * modelo gravado só responde quando não há extração nenhuma nesta versão,
   * e aí ele é declaradamente memória, não leitura.
   */
  const centralEntities = context.keywords
    .map(keyword => (keyword.strategy.keywordDnaSnapshot as { payload?: Record<string, unknown> } | null)?.payload?.centralEntity)
    .filter((value): value is string => typeof value === "string" && value.trim().length > 0);

  const structural = extractions.length
    ? buildRadarCompetitiveModel({
      pages: extractions,
      query: input.snapshot?.query || plan.primary?.keyword || null,
      observedIntent: input.diagnostic?.dominantIntent || null,
      principal: plan.primary?.keyword || null,
      editorialTopics: context.editorialTopics,
      keywordTexts: context.resolvedKeywordTexts,
      centralEntities,
      provenance: references.map(reference => ({
        url: reference.url,
        appearances: reference.appearances.map(item => ({ keyword: item.keyword, keywordRole: item.keywordRole, sourceType: item.sourceType })),
      })),
    })
    : input.model || null;

  const comparison = buildRadarEditorialComparison({
    context,
    model: structural,
    observedIntent: input.diagnostic?.dominantIntent || null,
    observedFormats: input.diagnostic?.dominantFormats || [],
  });

  const externas = buildRadarExternalEvidenceCandidates({ pages: extractions });

  /*
   * A INTENÇÃO DECLARADA VEM DA COMPOSIÇÃO, NÃO DE UM PALPITE DA TELA.
   *
   * O comercial observado sai da classificação do universo: ficha de produto e
   * concorrente comercial contam; vídeo e feature da SERP não são "comércio".
   */
  const sinalComercial = radarDeclaredCommercialSignal(context);
  const comerciaisObservados = (universe?.byClass.COMMERCIAL_COMPETITOR || 0) + (universe?.byClass.PRODUCT_REFERENCE || 0);
  /*
   * A AMOSTRA É A DA PESQUISA — não a da curadoria canônica legada.
   *
   * O SMOKE ENCONTROU ISTO. Com 18 referências selecionadas automaticamente e
   * 12 páginas lidas, o painel dizia "Análise não iniciada" e "Investigação sem
   * amostra" ao lado de um card dizendo "Modelo competitivo: Pronto".
   *
   * A suficiência recebia `selectedReferences` da curadoria da SERP CANÔNICA —
   * a tabela do fluxo antigo, que ninguém confirma mais desde que a seleção
   * passou a ser automática sobre o universo multi-query. Zero selecionadas ali
   * significava BLOCKED aqui, enquanto o modelo competitivo era construído
   * normalmente a partir das páginas reais.
   *
   * Duas autoridades sobre a mesma amostra, e a que a tela mostrava era a que
   * não estava mais sendo alimentada. A curadoria da PESQUISA já vive nesta
   * view, calculada acima; é dela que a conta sai quando existe investigação.
   */
  const curadoriaDaPesquisa = input.record && curation.availableCount > 0 ? curation : null;
  const referenciasSelecionadas = curadoriaDaPesquisa ? curadoriaDaPesquisa.selectedCount : input.selectedReferences || 0;
  const curadoriaConfirmada = curadoriaDaPesquisa
    ? curadoriaDaPesquisa.confirmed && curadoriaDaPesquisa.selectedCount > 0
    : input.curationConfirmed !== false && (input.selectedReferences || 0) > 0;

  const sufficiency = resolveRadarInvestigationSufficiency({
    hasSnapshot: Boolean(input.snapshot),
    curationConfirmed: curadoriaConfirmada,
    selected: referenciasSelecionadas,
    analyzed: extractions.length,
    failed: input.extractionFailures || 0,
    comparable: extractions.filter(isComparableRadarExtraction).length,
    intentEvidence: {
      declaredIntent: sinalComercial.expectsCommercialSerp
        ? sinalComercial.declaredIntents.join(" · ")
        : radarDeclaredArticleIntent(context.article),
      observedIntent: input.diagnostic?.dominantIntent || null,
      commercialResults: comerciaisObservados,
      observedResults: universe?.candidates.length || 0,
    },
  });

  /*
   * A FOTOGRAFIA COMPETITIVA, MONTADA UMA VEZ SÓ.
   *
   * Todas as camadas desta função já existem aqui: fundamentos, universo,
   * referências, extrações, estrutura, semântica e comparação. Montar o modelo
   * observado neste ponto é o que impede a aba e o relatório de chegarem a
   * conclusões diferentes sobre a mesma investigação.
   */
  const observed = buildRadarCompetitiveObservedModel({
    context,
    universe,
    references,
    selectedUrls: curation.selectedRows.map(row => row.reference.url),
    pages: extractions,
    failedUrls: input.extractionFailureUrls || [],
    structural,
    comparison,
    diagnostic: input.diagnostic || null,
    /* Mesmo portão da consulta canônica: a SERP do artigo pertence ao Web. */
    canonicalSerpResults: modoEfetivo === "WEB" ? input.snapshot?.organicResults.length ?? 0 : 0,
    verifiedSources: (input.verifiedSources || []).map(radarSourceClassificationFromRecord),
    observedAt: input.observedAt || fingerprint.value,
  });

  /*
   * A ARQUITETURA INTERNA VEM DO MODELO OBSERVADO, NÃO DE UM SEGUNDO CÁLCULO.
   *
   * Ela era montada aqui e o modelo do Gate 9 montaria outra. Duas leituras do
   * mesmo grafo aprovado é a mesma discordância que o Gate 9 veio encerrar.
   */
  const internalLinks = observed.internalLinks;

  const summary = buildRadarDeepResearchSummary({
    context,
    plan,
    universe,
    record: input.record || null,
    pagesAnalyzed: extractions.length,
    pagesFailed: input.extractionFailures || 0,
    recurringTopics: (input.model?.classifiedTopics || []).filter(topic => topic.classification === "RECURRENT_TOPIC").length,
    relevantGaps: comparison.gaps,
    conflicts: comparison.conflicts,
    relatedInternalPages: internalLinks.relatedInternalPages.length,
    externalSourceCandidates: externas.candidates.length,
    extraLimitations: [...comparison.limitations, ...internalLinks.limitations, ...externas.limitations],
  });

  const record = input.record || null;
  const state = radarDeepResearchState({ record, currentFingerprint: fingerprint, running: Boolean(input.running) });

  /*
   * A CONTA DA AMOSTRA, SOBRE A SELEÇÃO DA PESQUISA.
   *
   * Na Fase 1 a curadoria automática cobre o universo inteiro — inclusive as
   * URLs da SERP canônica, que também são referências. Então é ela que define
   * a amostra, e a conta fecha aqui: selecionadas = analisadas + sem acesso +
   * pendentes.
   */
  const selecionadas = new Set(curation.selectedRows.map(row => row.reference.normalizedUrl));
  const extraidas = new Set(extractions.map(page => radarNormalizedUrl(page.url)));
  const falhadas = new Set((input.extractionFailureUrls || []).map(radarNormalizedUrl).filter(Boolean));
  const analisadas = [...selecionadas].filter(url => extraidas.has(url));
  const semAcesso = [...selecionadas].filter(url => !extraidas.has(url) && falhadas.has(url));
  const pendentes = [...selecionadas].filter(url => !extraidas.has(url) && !falhadas.has(url));

  /*
   * O QUE FALTA, POR CONSULTA — Gate 18.9.
   *
   * Resolvido aqui, na mesma passagem, porque a tela tem quatro consumidores
   * desta resposta (card, detalhe, planilha e próxima ação) e três leituras
   * independentes do mesmo registro já foi como contador passou a discordar de
   * contador neste módulo.
   */
  const resumption = radarResearchResumption({ record: record || null });
  /*
   * O QUE O BANCO JÁ TEM — Gate 18.10.1.
   *
   * A leitura viva sabe quantas páginas ela enxerga; só o payload persistido
   * sabe quantas o servidor guardou. Quando a consolidação final não é
   * confirmada, é essa segunda conta que diz o que a retomada não precisa
   * refazer — e é ela que impede o botão mandar reler o que já está pago.
   */
  const persistence = radarAnalysisPersistenceState({
    analysis: input.persistedAnalysis || null,
    bundleBelongsToCurrentResearch: radarBundleBelongsToCurrentResearch({
      bundle: input.finalizedBundle || null,
      record: record || null,
    }).belongs,
  });
  const phase1 = radarPhase1Action({
    state,
    resumption,
    persistedExtractions: persistence.extractions || undefined,
    contextReady: true,
    hasPrimaryQuery: Boolean(plan.primary?.keyword),
    running: Boolean(input.running),
    mode: record?.primarySearchMode || input.mode,
    selected: selecionadas.size,
    pending: pendentes.length,
    failed: semAcesso.length,
    analyzed: analisadas.length,
    /*
     * A conclusão do ANALYZE chega GRAVADA — §7. Sem o carimbo, a leitura não
     * assume que o pipeline terminou só porque há páginas na amostra.
     */
    analysisConfirmed: input.analysisConfirmed,
    sufficiency,
  });
  /*
   * A PRONTIDÃO DO ENCERRAMENTO — três respostas, não duas.
   *
   * Insuficiência com páginas lidas é encerrável pelo USER com a limitação
   * declarada; sem página nenhuma não há o que congelar. A distinção é da
   * autoridade de finalização, e a tela apenas a lê.
   */
  const finalization = radarFinalizationReadiness({
    started: Boolean(record),
    stale: state === "STALE",
    alreadyFinalized: Boolean(record?.finalizedAt),
    pending: pendentes.length,
    analyzed: analisadas.length,
    failed: semAcesso.length,
    sufficiency,
  });

  const action = radarDeepResearchAction({
    state,
    contextReady: true,
    hasPrimaryQuery: Boolean(plan.primary?.keyword),
    canConclude: finalization.canFinalize,
    concludeBlockedReason: finalization.reason,
  });

  return {
    state,
    action,
    phase1,
    resumption,
    persistence,
    record,
    fingerprint,
    stale: state === "STALE",
    plan,
    universe,
    references,
    curation,
    comparison,
    internalLinks,
    externalCandidates: externas.candidates,
    externalLimitations: externas.limitations,
    sufficiency,
    summary,
    observed,
    narrative: radarObservedNarrative(observed),
    finalizedBundle: input.finalizedBundle || null,
    finalization,
    /* Derivado na mesma passagem, da mesma fotografia: uma leitura só. */
    blueprint: buildRadarEditorialBlueprint({ context, observed, discovery: observed.aiDiscovery }),
  };
}
