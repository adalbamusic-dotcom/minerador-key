/**
 * O QUE A TELA MOSTRA — DERIVADO, NUNCA RECALCULADO.
 *
 * As camadas do Radar respondem perguntas caras: o que o mercado faz, o que o
 * artigo declara, onde os links cabem, o que precisa de fonte. Elas fazem isso
 * bem, e cada Gate acrescentou texto à tela para provar que fazia. O resultado
 * é que a interface passou a explicar a arquitetura em vez de mostrar o
 * resultado dela.
 *
 * Este módulo é a camada de LEITURA. Ele responde as seis perguntas de quem
 * opera — o que estou pesquisando, em que estado, o que foi encontrado, qual é
 * a conclusão, há problema, qual é a próxima ação — e nada além disso.
 *
 * TRÊS REGRAS QUE ELE EXISTE PARA GARANTIR:
 *
 *   1. NADA É RECALCULADO. Toda função aqui recebe um modelo já construído e
 *      lê dele. Se um número aparecer diferente na planilha e no painel, é
 *      porque alguém calculou duas vezes — e aqui não há como.
 *
 *   2. RESUMIR NÃO É APAGAR. O que sai da primeira camada continua inteiro no
 *      modelo. Muda a VISIBILIDADE e a HIERARQUIA, nunca o dado.
 *
 *   3. O ESTADO É HUMANO. "AWAITING_REVIEW · sufficiency PARTIAL · stale=false"
 *      é verdade e não é resposta. Quem opera precisa de "Parcial", e do motivo
 *      em uma linha.
 *
 * Domínio puro: sem fetch, sem storage, sem provider, sem React.
 */

import { radarDeclaredFunnel, type RadarAiDiscoveryContext } from "./ai-discovery-context.ts";
import { radarConclusiveIntent, radarDeclaredKeywordIntent } from "./editorial-identity.ts";
import { radarObservedSufficiencyLabel, type RadarCompetitiveObservedModel } from "./competitive-observed-model.ts";
import { radarPlannerHandoffReadiness } from "./planner-handoff.ts";
import { radarSearchModeLabel, type RadarPrimarySearchMode } from "./search-mode.ts";

import type { RadarArticleResearchContext, RadarResearchKeyword } from "./article-research-context.ts";
import type { RadarDeepResearchView } from "./deep-research-view.ts";
import type { RadarPhase1Action } from "./serp-phase1.ts";

/* ============================== o estado ================================ */

/**
 * O ESTADO QUE UMA PESSOA RECONHECE.
 *
 * Os estados internos continuam existindo e continuam certos — eles é que
 * sustentam as invariantes. O que esta camada faz é traduzi-los para a única
 * pergunta que interessa a quem abre a tela: dá para agir, está andando, ou
 * tem algo errado?
 */
export type RadarOperationalStatus =
  | "NOT_STARTED"
  /**
   * A PESQUISA COMEÇOU E NÃO TERMINOU — Gate 18.9.
   *
   * Estado novo porque o ciclo não tinha onde pôr isto: a SERP do artigo está
   * paga e gravada, as auxiliares do plano não foram executadas. "Não
   * iniciado" era falso sobre o banco; "Pesquisando" seria falso sobre o
   * presente (nada está rodando); e "Parcial" já responde por outra pergunta —
   * a amostra sustenta parte da LEITURA, que é coisa diferente de a pesquisa
   * não ter terminado de reunir a amostra.
   */
  | "RESEARCH_INCOMPLETE"
  | "RESEARCHING"
  /**
   * PÁGINAS GRAVADAS, CONSOLIDAÇÃO NÃO CONFIRMADA — Gate 18.10.1.
   *
   * A auditoria achou onze páginas no banco sem `analysisCompletedAt`. O card
   * dizia "Pronto para analisar" — verdadeiro sobre a próxima ação, falso
   * sobre o trabalho: as páginas já foram lidas e pagas. Quem lê "Pronto para
   * analisar" pensa que nada foi feito.
   */
  | "ANALYSIS_INCOMPLETE"
  | "READY_TO_ANALYZE"
  | "ANALYZING"
  | "PARTIAL"
  | "READY"
  | "FINALIZED"
  | "ATTENTION";

export const RADAR_OPERATIONAL_STATUS_LABEL: Record<RadarOperationalStatus, string> = {
  NOT_STARTED: "Não iniciado",
  RESEARCH_INCOMPLETE: "Pesquisa incompleta",
  ANALYSIS_INCOMPLETE: "Análise incompleta",
  RESEARCHING: "Pesquisando",
  READY_TO_ANALYZE: "Pronto para analisar",
  ANALYZING: "Analisando",
  PARTIAL: "Parcial",
  READY: "Pronto",
  FINALIZED: "Finalizado",
  ATTENTION: "Atenção",
};

/**
 * O tom de cada estado — e o silêncio dos demais.
 *
 * Cor forte só onde existe significado. "Pesquisando" não é alerta, "Não
 * iniciado" não é erro, e pintar os dois tiraria o peso do único que precisa
 * ser visto de longe.
 */
export type RadarOperationalTone = "neutral" | "info" | "pending" | "success" | "warning";

export const RADAR_OPERATIONAL_STATUS_TONE: Record<RadarOperationalStatus, RadarOperationalTone> = {
  NOT_STARTED: "neutral",
  /* Não é erro e não é conclusão: é trabalho aberto, esperando uma decisão. */
  RESEARCH_INCOMPLETE: "pending",
  ANALYSIS_INCOMPLETE: "pending",
  RESEARCHING: "info",
  READY_TO_ANALYZE: "info",
  ANALYZING: "info",
  PARTIAL: "warning",
  READY: "success",
  FINALIZED: "success",
  ATTENTION: "warning",
};

/** A ordem em que estes estados fazem sentido para quem opera. */
export const RADAR_OPERATIONAL_STATUS_ORDER: readonly RadarOperationalStatus[] = [
  "NOT_STARTED", "RESEARCH_INCOMPLETE", "RESEARCHING", "READY_TO_ANALYZE", "ANALYZING", "ANALYSIS_INCOMPLETE", "PARTIAL", "READY", "FINALIZED", "ATTENTION",
];

export function radarOperationalStatus(input: {
  view: RadarDeepResearchView;
  /** A operação está em curso agora, neste artigo. */
  running?: boolean;
}): { status: RadarOperationalStatus; label: string; tone: RadarOperationalTone; reason: string } {
  const view = input.view;
  /*
   * A AÇÃO PENDENTE VEM ANTES DA LEITURA DE SUFICIÊNCIA.
   *
   * Com metade das páginas lidas, o estado já era AWAITING_REVIEW e a amostra
   * já bastava — e o card dizia "Pronto" ao lado de um botão escrito "Analisar
   * concorrência". As duas afirmações eram verdadeiras sobre coisas diferentes,
   * e juntas não descreviam nada: quem lê "Pronto" não clica em "Analisar".
   *
   * Enquanto a Fase 1 oferece análise, o estado é "Pronto para analisar". A
   * suficiência volta a falar quando não há mais ação de análise a oferecer.
   */
  /*
   * A PESQUISA INCOMPLETA VEM ANTES DA LEITURA DE SUFICIÊNCIA — Gate 18.9.
   *
   * Com a canônica recuperada e as auxiliares por executar, a suficiência já
   * respondia sobre a amostra existente e o card dizia "Parcial" ou "Pronto"
   * ao lado de um botão escrito "Completar Pesquisa Google". Enquanto houver
   * consulta do plano nunca executada, o estado é o da pesquisa — não o da
   * leitura que ela ainda não terminou de alimentar.
   */
  const pesquisaIncompleta = view.resumption.canonicalComplete && view.resumption.auxiliaryPending.length > 0;

  /*
   * PÁGINAS GRAVADAS SEM CARIMBO NÃO SÃO "PRONTO PARA ANALISAR" — 18.10.1.
   *
   * As duas situações oferecem a mesma ação e significam coisas opostas para
   * quem opera: numa, nenhuma página foi lida; na outra, onze já foram lidas,
   * pagas e gravadas, e falta consolidar. Dizer "Pronto para analisar" sobre a
   * segunda faz a pessoa achar que perdeu o trabalho.
   */
  const analiseIncompleta = view.persistence.state === "ANALYSIS_PARTIALLY_PERSISTED";

  const status: RadarOperationalStatus = input.running ? "ANALYZING"
    : view.state === "STALE" ? "ATTENTION"
      : view.state === "NOT_STARTED" ? "NOT_STARTED"
        : view.state === "FINALIZED" ? "FINALIZED"
          : pesquisaIncompleta ? "RESEARCH_INCOMPLETE"
            : analiseIncompleta ? "ANALYSIS_INCOMPLETE"
            : view.phase1.id === "ANALYZE_COMPETITION" && view.phase1.enabled ? "READY_TO_ANALYZE"
              : view.state === "AWAITING_REVIEW"
                ? (view.observed.sufficiency.level === "GOOD" ? "READY" : "PARTIAL")
                : "RESEARCHING";

  const reason = status === "ATTENTION"
    ? "Os fundamentos mudaram desde a coleta: a leitura descreve outra versão do artigo."
    : status === "PARTIAL"
      ? view.observed.sufficiency.reasons[0] || "A amostra sustenta parte da leitura."
      : view.phase1.hint || view.phase1.blockedReason || RADAR_OPERATIONAL_STATUS_LABEL[status];

  return { status, label: RADAR_OPERATIONAL_STATUS_LABEL[status], tone: RADAR_OPERATIONAL_STATUS_TONE[status], reason };
}

/* ============================ o card Pesquisa =========================== */

/**
 * O CARD COLAPSADO, INTEIRO.
 *
 * Modo, quatro contagens, o estado do modelo e a ação. Nada de snapshot,
 * provider, hash ou explicação de SERP canônica — isso é verdadeiro, é útil
 * uma vez, e não precisa ocupar a tela todos os dias.
 */
export type RadarResearchCardSummary = {
  modeLabel: string;
  status: RadarOperationalStatus;
  statusLabel: string;
  tone: RadarOperationalTone;
  /** As quatro contagens que descrevem a amostra. */
  counts: { queries: number; references: number; analyzed: number; failures: number };
  /** O modelo competitivo está pronto? Uma palavra, com o motivo atrás. */
  model: { label: string; tone: RadarOperationalTone };
  sufficiency: string;
  action: RadarPhase1Action;
};

export function buildRadarResearchCardSummary(input: {
  view: RadarDeepResearchView;
  mode: RadarPrimarySearchMode;
  running?: boolean;
}): RadarResearchCardSummary {
  const view = input.view;
  const estado = radarOperationalStatus({ view, running: input.running });

  /*
   * DEPOIS DE CONGELADA, QUEM RESPONDE É A INVESTIGAÇÃO CONGELADA.
   *
   * A leitura viva continua sendo calculada ao lado — e é justamente por isso
   * que ela não pode ser a fonte do card: uma melhoria no agrupamento semântico
   * mudaria os números de uma investigação já encerrada, sob o mesmo carimbo.
   * Congelar só significa alguma coisa se a tela ler o congelado.
   */
  const congelado = view.finalizedBundle;
  const amostra = congelado
    ? {
      queriesExecuted: congelado.search.canonicalQueries + congelado.search.auxiliaryQueries,
      uniqueReferences: congelado.search.uniqueReferences,
      analyzedSuccess: congelado.sample.analyzedSuccess,
      failedFinal: congelado.sample.failedFinal,
      comparablePages: congelado.sample.comparablePages,
    }
    : view.observed.sample;

  const modeloPronto = amostra.comparablePages > 0;
  const insuficienteAoCongelar = congelado?.conclusion === "INSUFFICIENT_BUT_FINALIZABLE";
  const modelo = modeloPronto
    ? !insuficienteAoCongelar && view.observed.sufficiency.level === "GOOD"
      ? { label: "Pronto", tone: "success" as const }
      : { label: "Parcial", tone: "warning" as const }
    : { label: "Não iniciado", tone: "neutral" as const };

  return {
    modeLabel: radarSearchModeLabel(input.mode),
    status: estado.status,
    statusLabel: estado.label,
    tone: estado.tone,
    counts: {
      queries: amostra.queriesExecuted,
      references: amostra.uniqueReferences,
      analyzed: amostra.analyzedSuccess,
      failures: amostra.failedFinal,
    },
    model: modelo,
    sufficiency: modeloPronto ? radarObservedSufficiencyLabel(view.observed.sufficiency.level) : "Sem amostra",
    action: view.phase1,
  };
}

/* =========================== o artigo investigado ======================= */

/**
 * O ARTIGO, EM UMA LEITURA.
 *
 * O Arquiteto precisa de controles porque é lá que o Article se forma. O Radar
 * precisa da resposta a outra pergunta: QUAL É O ARTIGO QUE ESTOU
 * INVESTIGANDO? Por isso aqui não há edição, não há decisão e não há o painel
 * inteiro — há o suficiente para reconhecer o artigo e confiar na investigação.
 */
export type RadarArticleDnaSummary = {
  version: string;
  principal: string | null;
  silo: string | null;
  role: string | null;
  intent: string | null;
  funnel: string | null;
  keywordCount: number;
  principalVolume: number | null;
  aggregateVolume: number | null;
  status: string;
  /** O contexto chegou inteiro do Arquiteto? Ausência é dita, não escondida. */
  complete: boolean;
};

export function buildRadarArticleDnaSummary(context: RadarArticleResearchContext): RadarArticleDnaSummary {
  const principal = context.keywords.find(keyword => keyword.identity.role === "principal") || null;
  const volumes = context.keywords
    .map(keyword => keyword.strategy.volume)
    .filter((valor): valor is number => typeof valor === "number");

  /* O funil vem da mesma leitura do Gate 13 — não há segunda interpretação. */
  const funil = radarDeclaredFunnel(context);

  return {
    version: context.article.articleDnaVersionId,
    principal: principal?.identity.text || null,
    silo: context.silo?.siloName || context.silo?.siloId || null,
    role: context.article.hierarchy,
    /*
     * "unknown" É AUSÊNCIA COM CARA DE VALOR.
     *
     * `normalizeSearchIntent` devolve a string "unknown" quando não consegue
     * classificar — e ela é TRUTHY. O `||` abaixo nunca chegava ao fundamento:
     * a faixa do Article mostrava "unknown" enquanto o Arquiteto exibia
     * "Informacional" para o mesmo artigo, cada um lendo um lugar diferente.
     *
     * A ordem agora é a das autoridades: a classificação TERMINAL que o
     * Arquiteto fechou, depois a intenção normalizada da principal quando ela
     * conclui alguma coisa, e por fim a intenção declarada no ArticleDNA.
     */
    intent: radarConclusiveIntent(context.article.classification?.intentLabel)
      || radarDeclaredKeywordIntent(principal?.strategy)
      || radarConclusiveIntent(context.article.mainIntent),
    funnel: funil.read ? { TOFU: "Topo", MOFU: "Meio", BOFU: "Fundo" }[funil.read] : funil.declared,
    keywordCount: context.keywords.length,
    principalVolume: principal?.strategy.volume ?? null,
    aggregateVolume: volumes.length ? volumes.reduce((total, valor) => total + valor, 0) : null,
    status: context.state === "COMPLETE" ? "Contexto completo" : "Contexto parcial",
    complete: context.state === "COMPLETE",
  };
}

/** Uma keyword em uma linha: texto, papel e as três métricas que decidem. */
export type RadarKeywordLine = {
  keywordId: string;
  text: string | null;
  role: RadarResearchKeyword["identity"]["role"];
  roleLabel: string;
  volume: number | null;
  intent: string | null;
  kgr: number | null;
  resolved: boolean;
};

const PAPEL: Record<RadarResearchKeyword["identity"]["role"], string> = {
  principal: "Principal",
  secundaria: "Secundária",
  reforco_narrativo: "Reforço",
};

export function radarKeywordLines(context: RadarArticleResearchContext): RadarKeywordLine[] {
  return [...context.keywords]
    .sort((left, right) => (left.identity.role === "principal" ? 0 : 1) - (right.identity.role === "principal" ? 0 : 1))
    .map(keyword => ({
      keywordId: keyword.identity.keywordId,
      text: keyword.identity.text,
      role: keyword.identity.role,
      roleLabel: PAPEL[keyword.identity.role] || keyword.identity.role,
      volume: keyword.strategy.volume,
      intent: radarDeclaredKeywordIntent(keyword.strategy),
      kgr: keyword.strategy.kgrScore,
      resolved: keyword.resolution === "FULL",
    }));
}

/* ========================== os resumos das camadas ====================== */

export type RadarCompetitiveSummary = {
  comparablePages: number;
  recurrentConcepts: number;
  coreQuestions: number;
  gaps: number;
  differentiations: number;
  conflicts: number;
  sufficiency: string;
};

export function buildRadarCompetitiveSummary(observed: RadarCompetitiveObservedModel): RadarCompetitiveSummary {
  return {
    comparablePages: observed.sample.comparablePages,
    recurrentConcepts: observed.concepts.recurrent.length + observed.concepts.confirmed.length,
    coreQuestions: observed.questions.filter(item => item.status === "RECURRENT_QUESTION" || item.status === "ARTICLE_QUESTION_CONFIRMED").length,
    gaps: observed.gaps.length,
    differentiations: observed.differentiations.length,
    conflicts: observed.conflicts.length,
    sufficiency: radarObservedSufficiencyLabel(observed.sufficiency.level),
  };
}

/**
 * ARQUITETURA APROVADA E PLANO DO RADAR — separados, como o Gate 10.3 exigiu.
 *
 * Relação sem aplicação NÃO é erro: o Arquiteto aprovou a relação, e esta
 * rodada não achou onde aplicá-la com fundamento. Mostrar isso como falha
 * convidaria alguém a "consertar" apagando a relação.
 */
export type RadarInternalLinkSummary = {
  relatedDestinations: number;
  resolvedApplications: number;
  unresolvedRelations: number;
  recommendedOccurrences: number;
  /** A frase que impede a leitura de "relação sem contexto" como defeito. */
  unresolvedNote: string | null;
};

export function buildRadarInternalLinkSummary(observed: RadarCompetitiveObservedModel): RadarInternalLinkSummary {
  const plano = observed.internalLinkPlan;
  const aplicacoes = [...plano.outgoing, ...(plano.siloPage ? [plano.siloPage] : [])];
  const naoResolvidas = [...aplicacoes, ...plano.incoming]
    .filter(item => item.applicationStatus === "REQUIRED_RELATION_WITHOUT_SUPPORTED_PLACEMENT").length;

  return {
    relatedDestinations: observed.internalLinks.relatedInternalPages.length,
    resolvedApplications: aplicacoes.filter(item => item.applicationStatus === "RESOLVED").length,
    unresolvedRelations: naoResolvidas,
    recommendedOccurrences: plano.totalRecommendedLinks,
    unresolvedNote: naoResolvidas
      ? `${naoResolvidas} relação(ões) do grafo aprovado ainda não têm contexto suficientemente sustentado por esta investigação. A relação permanece; o que falta é onde aplicá-la.`
      : null,
  };
}

export type RadarAuthoritySummary = {
  citingCompetitors: number;
  sampleSize: number;
  distinctSources: number;
  recurrentDomains: number;
  verifiedSources: number;
  ymylLabel: string;
  claimsNeedingSupport: number;
  specialistPoints: number;
  conflicts: number;
};

const YMYL_ROTULO: Record<string, string> = {
  NONE: "Não sensível",
  LOW: "Baixa",
  MATERIAL: "Material",
  HIGH: "Alta",
};

export function buildRadarAuthoritySummary(observed: RadarCompetitiveObservedModel): RadarAuthoritySummary {
  const citam = observed.externalSources.patterns.find(item => item.key === "CITES_EXTERNAL_SOURCES") || null;
  const autoridade = observed.authorityEvidence;

  return {
    citingCompetitors: citam?.sourceCount || 0,
    sampleSize: citam?.sampleSize ?? observed.sample.comparablePages,
    distinctSources: observed.externalSources.evidenceCandidates.length,
    recurrentDomains: observed.externalSources.recurrentDomains.length,
    verifiedSources: autoridade.sources.filter(item => item.verified).length,
    ymylLabel: YMYL_ROTULO[autoridade.ymylAssessment.relevance] || autoridade.ymylAssessment.relevance,
    claimsNeedingSupport: autoridade.summary.claimsNeedingSupport,
    specialistPoints: autoridade.specialistReviewRequirements.length,
    conflicts: autoridade.marketVsFactConflicts.length,
  };
}

/**
 * DESCOBERTA — sem vocabulário de vitrine.
 *
 * "SEO para IA", "GEO" e nota de citação descrevem uma promessa, não um
 * resultado. O que existe são necessidades, respostas que precisam ser claras,
 * definições e o que ainda falta sustentar.
 */
export type RadarDiscoverySummary = {
  applicable: boolean;
  funnelNote: string;
  coreQuestions: number;
  answersNeedingClarity: number;
  definitions: number;
  unitsNeedingEvidence: number;
  unitsDependingOnSpecialist: number;
};

export function buildRadarDiscoverySummary(discovery: RadarAiDiscoveryContext): RadarDiscoverySummary {
  return {
    applicable: discovery.applicable,
    funnelNote: discovery.required
      ? "Obrigatório neste estágio de funil."
      : discovery.applicable ? "Aplicável como contexto neste estágio." : discovery.reason,
    coreQuestions: discovery.questions.filter(item => item.classes.includes("CORE_QUESTION")).length,
    answersNeedingClarity: discovery.retrievabilityRequirements.filter(item => item.kind === "DIRECT_ANSWER").length,
    definitions: discovery.definitionRequirements.length,
    unitsNeedingEvidence: discovery.factualCoverage.missing + discovery.factualCoverage.conflicted,
    unitsDependingOnSpecialist: discovery.specialistConnections.length,
  };
}

/* ========================= o card Especialista ========================= */

/**
 * NECESSIDADE PREPARADA NÃO É CONTRIBUIÇÃO RECEBIDA — §6 do Gate 18.2.
 *
 * O SMOKE MOSTROU AS DUAS FRASES NA MESMA TELA: "Especialista: 1 ponto
 * preparado" no bloco de autoridade e "Não necessário" no card. Nenhuma das
 * duas estava mentindo sobre o próprio dado — elas liam dados diferentes. O
 * card lia o estado operacional do fluxo do especialista (ninguém foi
 * escolhido, nada foi enviado); o bloco lia a autoridade de evidência, que
 * havia preparado um ponto de revisão a partir de uma afirmação YMYL.
 *
 * QUATRO NÚMEROS, QUATRO PERGUNTAS DIFERENTES:
 *
 *   requirementsPrepared    o que a investigação concluiu que precisa de revisão
 *   requestsSent            o que saiu para o profissional
 *   contributionsReceived   o que voltou
 *   evidenceReviewed        o que foi conferido depois de voltar
 *
 * "1 preparado · 0 enviado · 0 recebido" é um estado VÁLIDO e comum — é onde
 * toda investigação fica antes de alguém acionar o especialista. Reduzir isso
 * a "pendentes" apagaria a diferença entre não precisar e não ter pedido.
 */
export type RadarSpecialistSummary = {
  requirementsPrepared: number;
  requestsSent: number;
  contributionsReceived: number;
  evidenceReviewed: number;
  /** O nome do estado, no vocabulário de quem opera. */
  statusLabel: string;
  tone: RadarOperationalTone;
  lines: string[];
  /**
   * A LINHA OPERACIONAL, SEPARADA DA NECESSIDADE — §REGRAS do Gate 18.7.
   *
   * "1 revisão necessária" responde o que a investigação concluiu; "0 pedidos ·
   * 0 contribuições" responde o que alguém fez a respeito. Juntar as duas numa
   * frase só foi o que permitiu a planilha concluir "não necessário" a partir
   * de "ninguém pediu nada".
   */
  operationalLine: string;
  /** De onde veio a contagem de necessidade: a investigação viva ou a congelada. */
  requirementsSource: "FROZEN_BUNDLE" | "OBSERVED_AUTHORITY";
};

/**
 * A CÉLULA DA PLANILHA, RESOLVIDA FORA DO JSX.
 *
 * Enquanto a decisão morava dentro do `render` da coluna, a única prova
 * possível era um grep no arquivo — e grep não distingue "lê a projeção" de
 * "lê a projeção e depois ignora". Provei isso por mutação: devolver a linha
 * ao estado legado só era pego por uma asserção de texto no `.tsx`, nunca por
 * comportamento.
 *
 * Aqui a mesma função que a tela chama é a que o teste chama.
 */
export function radarSpecialistCell(specialist: {
  status: string;
  contributionsReceived: number;
  pending: number;
  summary: RadarSpecialistSummary | null;
}): { title: string; subtitle: string } {
  if (specialist.summary) {
    /* A necessidade no título; o que alguém fez a respeito dela, no subtítulo. */
    return { title: specialist.summary.statusLabel, subtitle: specialist.summary.operationalLine };
  }
  /*
   * SEM INVESTIGAÇÃO, o estado do fluxo é a única resposta que existe — e aí
   * "Não necessário" com zero requisitos é verdade, não inferência.
   */
  return {
    title: specialist.status,
    subtitle: `${specialist.contributionsReceived} recebida(s) · ${specialist.pending} pendente(s)`,
  };
}

export function buildRadarSpecialistSummary(input: {
  observed: RadarCompetitiveObservedModel;
  /**
   * A INVESTIGAÇÃO CONGELADA, QUANDO EXISTE — e ela decide.
   *
   * Depois do FINALIZE, o que vale é o que foi congelado: é esse o registro
   * que diz "este planejamento usou exatamente estas evidências". A leitura
   * viva continua sendo montada a cada F5 a partir do snapshot; se as duas
   * divergirem, quem responde pela investigação encerrada é o bundle.
   */
  finalized?: { authority: { specialistRequirements: readonly unknown[] } } | null;
  /** O que o fluxo do especialista registrou. Zero é resposta legítima. */
  specialist?: { requestsSent?: number; contributionsReceived?: number; reviewedEvidence?: number } | null;
}): RadarSpecialistSummary {
  const requirementsSource = input.finalized ? "FROZEN_BUNDLE" as const : "OBSERVED_AUTHORITY" as const;
  const requirementsPrepared = input.finalized
    ? input.finalized.authority.specialistRequirements.length
    : input.observed.authorityEvidence.specialistReviewRequirements.length;
  const requestsSent = input.specialist?.requestsSent || 0;
  const contributionsReceived = input.specialist?.contributionsReceived || 0;
  const evidenceReviewed = input.specialist?.reviewedEvidence || 0;

  /*
   * A ORDEM É A DO CICLO, E "Não necessário" É O ÚLTIMO CASO.
   *
   * Enquanto existir requisito preparado, a primeira camada não pode dizer que
   * o especialista não é necessário: foi a própria investigação que concluiu o
   * contrário, e essa conclusão não some por ninguém ter agido sobre ela.
   */
  const statusLabel = evidenceReviewed > 0 && evidenceReviewed >= contributionsReceived && contributionsReceived > 0
    ? "Contribuição revisada"
    : contributionsReceived > 0
      ? "Contribuição recebida"
      : requestsSent > 0
        ? "Aguardando o especialista"
        : requirementsPrepared > 0
          ? `Revisão necessária: ${requirementsPrepared}`
          : "Não necessário";

  const tone: RadarOperationalTone = contributionsReceived > 0
    ? "success"
    : requirementsPrepared > 0 || requestsSent > 0 ? "pending" : "neutral";

  const operationalLine = `${requestsSent} pedido(s) · ${contributionsReceived} contribuição(ões)`;

  return {
    requirementsPrepared, requestsSent, contributionsReceived, evidenceReviewed,
    statusLabel, tone, operationalLine, requirementsSource,
    lines: requirementsPrepared || requestsSent || contributionsReceived
      ? [`${requirementsPrepared} ponto(s) para revisão`, operationalLine]
      : ["Nenhuma afirmação exige revisão profissional"],
  };
}

/* ============================== o relatório ============================= */

/**
 * O RELATÓRIO RESPONDE PERGUNTAS, NÃO EXIBE CONTADORES.
 *
 * "Prévia gerada · 34 necessidades" é verdade e não informa: 34 é muito ou
 * pouco? Falta alguma coisa? Dá para enviar? Cada linha aqui é uma pergunta
 * fechada com a resposta e o porquê.
 */
export type RadarReportCheckState = "READY" | "PARTIAL" | "PENDING" | "NOT_REQUIRED";

export type RadarReportCheck = {
  id: string;
  question: string;
  state: RadarReportCheckState;
  detail: string;
};

export type RadarReportSummary = {
  checks: RadarReportCheck[];
  /** O que impede de considerar a investigação concluída. Vazio quando nada impede. */
  blockers: string[];
};

const REPORT_TONE: Record<RadarReportCheckState, RadarOperationalTone> = {
  READY: "success",
  PARTIAL: "warning",
  PENDING: "pending",
  NOT_REQUIRED: "neutral",
};

export const radarReportCheckTone = (state: RadarReportCheckState) => REPORT_TONE[state];

export function buildRadarReportSummary(input: {
  observed: RadarCompetitiveObservedModel;
  view: RadarDeepResearchView;
  /**
   * O material da área Vídeos, quando existe.
   *
   * Vídeos não é obrigatório para todo Article: um artigo pode ser inteiro sem
   * material próprio. Por isso o estado padrão é "não se aplica", e não uma
   * pendência que ficaria aberta para sempre.
   */
  videos?: { registered: number; transcribed: number };
}): RadarReportSummary {
  const observed = input.observed;
  /*
   * QUANDO EXISTE INVESTIGAÇÃO CONGELADA, É ELA QUEM RESPONDE.
   *
   * Manter o relatório lendo a leitura viva depois de finalizar produziria uma
   * prévia que discorda da evidência congelada — duas verdades sobre a mesma
   * investigação, e a que o Planejador vai receber é a congelada.
   */
  const congelado = input.view.finalizedBundle;
  const competitivo = buildRadarCompetitiveSummary(observed);
  const links = buildRadarInternalLinkSummary(observed);
  const autoridade = buildRadarAuthoritySummary(observed);
  const descoberta = buildRadarDiscoverySummary(observed.aiDiscovery);
  const blockers: string[] = [];

  const amostra = observed.sample.comparablePages;
  const pesquisa: RadarReportCheck = amostra > 0
    ? { id: "research", question: "Pesquisa pronta?", state: "READY", detail: `${amostra} página(s) comparável(is) em ${observed.sample.queriesExecuted} consulta(s).` }
    : { id: "research", question: "Pesquisa pronta?", state: "PENDING", detail: "Nenhuma página comparável foi analisada nesta investigação." };
  if (pesquisa.state === "PENDING") blockers.push("A investigação ainda não tem amostra comparável.");

  const modelo: RadarReportCheck = amostra === 0
    ? { id: "model", question: "Modelo competitivo pronto?", state: "PENDING", detail: "Depende da amostra." }
    : observed.sufficiency.level === "GOOD"
      ? { id: "model", question: "Modelo competitivo pronto?", state: "READY", detail: `${competitivo.recurrentConcepts} conceito(s) recorrente(s) · ${competitivo.gaps} lacuna(s) · ${competitivo.conflicts} conflito(s).` }
      : { id: "model", question: "Modelo competitivo pronto?", state: "PARTIAL", detail: observed.sufficiency.reasons[0] || competitivo.sufficiency };
  if (modelo.state === "PARTIAL") blockers.push("A leitura competitiva é parcial: a amostra não sustenta tudo o que o modelo descreve.");

  /*
   * RELAÇÃO SEM APLICAÇÃO NÃO É BLOQUEIO.
   *
   * Ela é o limite honesto desta rodada, e o Gate 10.3 decidiu que zero
   * ocorrências é resposta legítima. Tratá-la como pendência faria alguém
   * "resolver" inventando um lugar para o link.
   */
  const linksCheck: RadarReportCheck = links.relatedDestinations === 0
    ? { id: "links", question: "Links planejados?", state: "NOT_REQUIRED", detail: "O grafo aprovado não relaciona este artigo a outras páginas." }
    : links.resolvedApplications > 0
      ? { id: "links", question: "Links planejados?", state: "READY", detail: `${links.resolvedApplications} aplicação(ões) fundamentada(s) · ${links.recommendedOccurrences} ocorrência(s) recomendada(s)${links.unresolvedRelations ? ` · ${links.unresolvedRelations} relação(ões) sem contexto natural` : ""}.` }
      : { id: "links", question: "Links planejados?", state: "PARTIAL", detail: links.unresolvedNote || "As relações existem; a aplicação não foi fundamentada nesta rodada." };

  const fontes: RadarReportCheck = autoridade.distinctSources === 0
    ? { id: "sources", question: "Fontes verificadas?", state: "NOT_REQUIRED", detail: "Nenhuma citação externa foi observada na amostra." }
    : autoridade.verifiedSources > 0
      ? { id: "sources", question: "Fontes verificadas?", state: "READY", detail: `${autoridade.verifiedSources} de ${autoridade.distinctSources} fonte(s) verificada(s) durante a análise.` }
      : { id: "sources", question: "Fontes verificadas?", state: "PENDING", detail: `${autoridade.distinctSources} fonte(s) observada(s), nenhuma verificada nesta versão.` };

  const especialista: RadarReportCheck = autoridade.specialistPoints === 0
    ? { id: "specialist", question: "Especialista necessário?", state: "NOT_REQUIRED", detail: "Nenhum ponto de revisão foi criado: não há dúvida factual nem conflito que justifique." }
    : { id: "specialist", question: "Especialista necessário?", state: "PENDING", detail: `${autoridade.specialistPoints} ponto(s) preparado(s), cada um com a pergunta já contextualizada.` };
  if (autoridade.specialistPoints) blockers.push(`${autoridade.specialistPoints} ponto(s) dependem da contribuição de um profissional.`);
  if (autoridade.conflicts) blockers.push(`${autoridade.conflicts} conflito(s) entre o que o mercado repete e o que a evidência permite afirmar.`);
  if (descoberta.unitsNeedingEvidence) blockers.push(`${descoberta.unitsNeedingEvidence} necessidade(s) sensível(is) seguem sem fonte adequada.`);

  const descobertaCheck: RadarReportCheck = !descoberta.applicable
    ? { id: "discovery", question: "Descoberta preparada?", state: "NOT_REQUIRED", detail: descoberta.funnelNote }
    : descoberta.unitsNeedingEvidence
      ? { id: "discovery", question: "Descoberta preparada?", state: "PARTIAL", detail: `${descoberta.coreQuestions} pergunta(s) central(is) · ${descoberta.unitsNeedingEvidence} sem sustentação factual.` }
      : { id: "discovery", question: "Descoberta preparada?", state: "READY", detail: `${descoberta.coreQuestions} pergunta(s) central(is) · ${descoberta.answersNeedingClarity} resposta(s) que precisam ser claras.` };

  if (input.view.stale) blockers.push("Os fundamentos mudaram desde a coleta: esta leitura descreve outra versão do artigo.");

  /*
   * A PERGUNTA QUE FECHA O CICLO: a investigação está congelada?
   *
   * Enquanto não está, tudo aqui descreve uma leitura que ainda pode mudar.
   * Depois de congelada, o que o Planejador vai receber é o bundle — com
   * identidade própria, para se poder provar depois qual evidência foi usada.
   */
  const congelamento: RadarReportCheck = congelado
    ? {
      id: "frozen",
      question: "Investigação congelada?",
      state: "READY",
      detail: `Congelada em ${congelado.frozenAt.slice(0, 10)} · evidências ${congelado.bundleId} · hash ${congelado.bundleHash}${congelado.acknowledgedInsufficiency ? " · insuficiência declarada pelo operador" : ""}.`,
    }
    : {
      id: "frozen",
      question: "Investigação congelada?",
      state: input.view.finalization.canFinalize ? "PENDING" : "NOT_REQUIRED",
      detail: input.view.finalization.reason,
    };
  if (congelado?.acknowledgedInsufficiency) blockers.push(`A investigação foi congelada com insuficiência declarada: ${congelado.acknowledgedInsufficiency}`);

  /*
   * §30 — A PRONTIDÃO DO PACOTE VEM DO VALIDADOR, NÃO DE UMA REGRA LOCAL.
   *
   * O Relatório responde "dá para planejar?" e o handoff responde a mesma
   * pergunta na hora de entregar. Se as duas respostas nascerem de lugares
   * diferentes, uma delas vai mentir — e vai ser a da tela, que é a que a
   * pessoa lê. Aqui ela apenas consulta a autoridade e mostra o resultado.
   */
  const prontidao = radarPlannerHandoffReadiness({
    article: {
      brandId: observed.identity.brandId,
      articleId: observed.identity.articleId,
      articleDnaVersionId: observed.identity.articleDnaVersionId,
      articleDnaContentHash: observed.identity.articleDnaContentHash,
    },
    frozen: congelado,
    stale: input.view.stale,
  });
  const pacote: RadarReportCheck = prontidao.ready
    ? {
      id: "handoff",
      question: "Pacote para planejamento?",
      state: "READY",
      detail: congelado?.acknowledgedInsufficiency
        ? "Pronto para o Planejador, com a insuficiência declarada junto."
        : "Pronto para o Planejador.",
    }
    : {
      id: "handoff",
      question: "Pacote para planejamento?",
      /* Falta finalizar ainda vem; divergência é problema aberto, não etapa. */
      state: prontidao.blocks.some(item => item.code === "NOT_FINALIZED") ? "PENDING" : "PARTIAL",
      detail: prontidao.blocks.map(item => item.message).join(" "),
    };
  /*
   * Falta finalizar é etapa que ainda vem; o resto é divergência que alguém
   * precisa resolver — e só o segundo caso vira impedimento declarado.
   */
  for (const bloqueio of prontidao.blocks) {
    if (bloqueio.code !== "NOT_FINALIZED") blockers.push(bloqueio.message);
  }

  /*
   * §25 — O DOSSIÊ EDITORIAL NO RELATÓRIO, EM UMA LINHA.
   *
   * A pergunta que interessa a quem vai planejar não é quantos conceitos foram
   * observados: é se existe um dossiê editorial utilizável, com quantas pautas
   * para especialista e para vídeo. Sem painel novo — uma verificação a mais.
   */
  const blueprint = input.view.blueprint;
  const dossieEditorial: RadarReportCheck = !blueprint.sections.length
    ? { id: "blueprint", question: "Blueprint editorial?", state: "PENDING", detail: blueprint.readiness.reason }
    : {
      id: "blueprint",
      question: "Blueprint editorial?",
      state: blueprint.readiness.state === "READY" ? "READY" : "PARTIAL",
      detail: `${blueprint.readiness.reason} ${blueprint.specialistBriefs.length} pauta(s) para especialista · ${blueprint.videoBriefs.length} oportunidade(s) de vídeo.`,
    };

  const registrados = input.videos?.registered || 0;
  const videos: RadarReportCheck = !registrados
    ? { id: "videos", question: "Vídeos utilizados?", state: "NOT_REQUIRED", detail: "Nenhum material próprio foi registrado para este artigo." }
    : input.videos?.transcribed
      ? { id: "videos", question: "Vídeos utilizados?", state: "READY", detail: `${input.videos.transcribed} de ${registrados} material(is) já viraram texto aproveitável.` }
      : { id: "videos", question: "Vídeos utilizados?", state: "PENDING", detail: `${registrados} material(is) registrado(s), nenhum transcrito: a transcrição ainda não existe como processo.` };

  return { checks: [pesquisa, modelo, linksCheck, fontes, videos, especialista, descobertaCheck, dossieEditorial, congelamento, pacote], blockers };
}

/* ====================== os detalhes da pesquisa ========================= */

/**
 * O DETALHE COMO CONSULTA — nunca como segundo workflow.
 *
 * A superfície antiga da SERP não foi substituída: ela foi ESCONDIDA dentro de
 * um expansível, com as seis abas do processo antigo intactas — Coleta,
 * Concorrentes, Análise, Evidências, Revisão, Histórico — e com Aprovar SERP,
 * Rejeitar SERP, Continuar para Análise, Analisar pendentes, checkboxes de
 * curadoria e classificadores manuais ainda operando. Duas autoridades de
 * workflow na mesma tela, e a antiga com mais botões.
 *
 * Esta projeção é a leitura que sobra quando o workflow sai. Ela responde
 * "o que aconteceu nesta investigação?" e não oferece nenhuma forma de
 * governá-la de novo: a única autoridade de operação é START → ANALYZE →
 * FINALIZE, com RESET como saída explícita.
 *
 * NENHUM DADO SE PERDE. Concorrentes, páginas, evidências e histórico
 * continuam inteiros — muda o caminho até eles, não a existência deles.
 */

export type RadarResearchDetailCompetitor = {
  referenceId: string | null;
  title: string;
  url: string;
  domain: string;
  /** O papel OBSERVADO pela curadoria automática. Não há reclassificação aqui. */
  roleLabel: string;
  /** Por que a curadoria automática leu assim. Motivo, não botão. */
  roleReason: string;
  originLabel: string;
  /** As consultas que trouxeram esta página. */
  queries: string[];
  extractionLabel: string;
  comparable: boolean;
  /** Quando não é comparável, o motivo — para não parecer seleção perdida. */
  notComparableReason: string | null;
};

/**
 * UMA FALHA TEM IDENTIDADE PRÓPRIA — e não é a URL.
 *
 * A MESMA página pode falhar duas vezes na mesma rodada: uma como resultado da
 * SERP canônica (chave posicional, `organic:4`) e outra como referência
 * descoberta pela pesquisa (chave `referenceId`). São duas tentativas de
 * origens diferentes sobre o mesmo endereço, e as duas são verdade.
 *
 * A projeção usava a URL como identidade e perdia isso: a lista renderizava
 * dois itens com a mesma chave, e o React avisou. A `key` da falha já existia
 * no contrato desde sempre — bastava não descartá-la.
 */
export type RadarResearchDetailFailure = { id: string; url: string; reason: string };

export type RadarResearchHistoryEntry = {
  id: string;
  at: string | null;
  label: string;
  detail: string;
};

/** Um item de leitura que preserva o identificador do domínio. */
export type RadarResearchDetailEntry = { id: string; text: string };

export type RadarResearchDetailsView = {
  /** O estado, no MESMO vocabulário do card e da planilha. */
  status: RadarOperationalStatus;
  statusLabel: string;
  tone: RadarOperationalTone;
  /**
   * De onde os números vêm: do congelado, quando existe, ou da leitura viva.
   *
   * Depois de congelar, o detalhe precisa descrever a rodada que foi
   * encerrada. Ler estado vivo aqui mostraria pendências de uma investigação
   * que já acabou — o convite a reabrir por engano o que o USER fechou.
   */
  source: "FROZEN" | "LIVE";
  frozen: { bundleId: string; bundleHash: string; frozenAt: string; acknowledgedInsufficiency: string | null } | null;
  collection: {
    modeLabel: string;
    queriesExecuted: number;
    canonicalQueries: number;
    auxiliaryQueries: number;
    uniqueReferences: number;
    selectedReferences: number;
    recurrentReferences: number;
    auxiliaryOnlyReferences: number;
  };
  competitors: RadarResearchDetailCompetitor[];
  pages: {
    analyzed: number;
    comparable: number;
    failed: number;
    failures: RadarResearchDetailFailure[];
    /** A frase de limitação. FAILED_FINAL é limitação, não fila de trabalho. */
    failureHeadline: string | null;
  };
  /*
   * CADA LISTA CARREGA O IDENTIFICADOR QUE O DOMÍNIO JÁ TEM.
   *
   * Texto não é identidade: dois conceitos podem ter o mesmo rótulo, duas
   * fontes o mesmo domínio, duas lacunas o mesmo assunto contra referências
   * diferentes. Projetar para string e usar a string como chave transforma
   * coincidência de texto em colisão de identidade.
   */
  evidence: {
    observations: RadarResearchDetailEntry[];
    sources: Array<{ id: string; domain: string; typeLabel: string; verified: boolean }>;
    factual: Array<{ id: string; claim: string; sourceDomain: string; supportLabel: string }>;
    conflicts: RadarResearchDetailEntry[];
    needs: RadarResearchDetailEntry[];
    limitations: RadarResearchDetailEntry[];
  };
  history: RadarResearchHistoryEntry[];
};

const CLASSE_ROTULO: Record<string, string> = {
  EDITORIAL_COMPETITOR: "Concorrente editorial",
  COMMERCIAL_COMPETITOR: "Concorrente comercial",
  PRODUCT_REFERENCE: "Ficha de produto",
  FORMAT_REFERENCE: "Referência de formato",
  AUTHORITY_SOURCE: "Fonte de autoridade",
  SERP_FEATURE: "Recurso da SERP",
  LATERAL_REFERENCE: "Referência lateral",
  NOT_RELEVANT: "Fora da leitura editorial",
};

const ORIGEM_ROTULO: Record<string, string> = {
  CANONICAL: "SERP canônica",
  AUXILIARY: "Consulta auxiliar",
  CANONICAL_AND_AUXILIARY: "Canônica e auxiliar",
  UNKNOWN: "Origem não registrada",
};

const EXTRACAO_ROTULO: Record<string, string> = {
  success: "Lida",
  partial: "Lida parcialmente",
  pending: "Não lida",
  blocked: "Bloqueada pelo site",
  timeout: "Tempo esgotado",
  invalid_html: "HTML inválido",
  unsupported: "Formato não suportado",
  failed: "Falhou",
  not_extracted: "Fora da amostra",
};

/**
 * A LEITURA DO DETALHE, DERIVADA DE UMA AUTORIDADE SÓ.
 *
 * Recebe a view já construída e, quando houver, as falhas gravadas na versão
 * da análise. Não decide o que analisar, não confirma curadoria, não aprova
 * nada: só organiza para consulta o que as camadas já concluíram.
 */
export function buildRadarResearchDetails(input: {
  view: RadarDeepResearchView;
  /**
   * As falhas como ficaram gravadas na análise. Limitação, não pendência.
   *
   * A `key` é a identidade da TENTATIVA — posicional quando a página veio da
   * SERP canônica, `referenceId` quando veio da pesquisa. A mesma URL pode
   * aparecer sob as duas, e é isso que a torna necessária aqui. Opcional porque
   * registros gravados antes do contrato atual não a têm.
   */
  extractionFailures?: readonly { key?: string; url: string; code: string; message: string; status: number | null }[];
  /** O histórico de coletas do artigo, para a seção de consulta. */
  collections?: readonly { id: string; provider: string; status: string; origin: string; error: string | null }[];
  running?: boolean;
}): RadarResearchDetailsView {
  const view = input.view;
  const observado = view.observed;
  const congelado = view.finalizedBundle;
  const estado = radarOperationalStatus({ view, running: input.running });

  /* §14 — congelado é autoridade: os números do detalhe vêm dele. */
  const collection = congelado
    ? {
      modeLabel: radarSearchModeLabel(congelado.search.mode as RadarPrimarySearchMode),
      queriesExecuted: congelado.search.queries.length,
      canonicalQueries: congelado.search.canonicalQueries,
      auxiliaryQueries: congelado.search.auxiliaryQueries,
      uniqueReferences: congelado.search.uniqueReferences,
      selectedReferences: congelado.search.selectedReferences,
      recurrentReferences: congelado.search.recurrentReferences,
      auxiliaryOnlyReferences: congelado.search.auxiliaryOnlyReferences,
    }
    : {
      modeLabel: radarSearchModeLabel(view.record?.primarySearchMode || "WEB"),
      queriesExecuted: observado.sample.queriesExecuted,
      canonicalQueries: observado.sample.canonicalQueries,
      auxiliaryQueries: observado.sample.auxiliaryQueries,
      uniqueReferences: observado.sample.uniqueReferences,
      selectedReferences: observado.sample.selectedReferences,
      recurrentReferences: observado.sample.recurrentReferences,
      auxiliaryOnlyReferences: observado.sample.auxiliaryOnlyReferences,
    };

  const competitors: RadarResearchDetailCompetitor[] = observado.competitors.map(item => {
    const referencia = view.references.find(entrada => entrada.referenceId === item.referenceId) || null;
    return {
      referenceId: item.referenceId,
      title: item.title || "Página sem título",
      url: item.url,
      domain: item.domain,
      roleLabel: item.classification ? CLASSE_ROTULO[item.classification] || item.classification : "Não classificada",
      roleReason: referencia?.classificationReason || "",
      originLabel: ORIGEM_ROTULO[item.origin] || item.origin,
      queries: [...item.queries],
      extractionLabel: EXTRACAO_ROTULO[item.extractionStatus] || item.extractionStatus,
      comparable: item.comparable,
      notComparableReason: item.comparable ? null : item.limitations[0] || "Fora do benchmark editorial desta rodada.",
    };
  });

  /*
   * §8 — FALHA É LIMITAÇÃO DECLARADA, NÃO FILA.
   *
   * A superfície antiga transformava toda falha em "analisar pendentes", que
   * reabria a rodada. Aqui a frase termina em si mesma: quantas páginas não
   * puderam ser lidas, e o detalhe de cada uma para quem for investigar.
   */
  const falhas = [...(input.extractionFailures || [])].map((item, indice) => ({
    /* A chave da tentativa; o índice só entra se um registro antigo não a tiver. */
    id: item.key || `falha:${indice}:${item.url}`,
    url: item.url,
    reason: `${item.code}${item.status ? ` · HTTP ${item.status}` : ""}${item.message ? ` · ${item.message}` : ""}`,
  }));
  /*
   * FALHA REGISTRADA NUNCA FICA INVISÍVEL.
   *
   * A contagem oficial é a da autoridade — congelado quando existe, leitura
   * viva caso contrário. Mas se a versão da análise guardou falhas que a
   * contagem não reflete, esconder as duas coisas seria pior que mostrar a
   * maior: uma página que ninguém conseguiu ler é limitação da rodada, e
   * limitação omitida vira conclusão sem ressalva lá na frente.
   */
  const contagemDaAutoridade = congelado ? congelado.sample.failedFinal : observado.sample.failedFinal;
  const totalFalhas = Math.max(contagemDaAutoridade, falhas.length);

  const autoridade = observado.authorityEvidence;
  /*
   * LIMITAÇÃO REPETIDA É UMA LIMITAÇÃO SÓ.
   *
   * Elas são texto livre e chegam de duas origens que descrevem a mesma rodada.
   * Aqui não há id do domínio para preservar, então a resposta honesta é
   * deduplicar — mostrar a mesma frase duas vezes não informa nada a mais.
   */
  const limitacoes = [...new Set(congelado ? congelado.limitations : autoridade.limitations)];

  const evidence = {
    observations: observado.questions.slice(0, 12).map(item => ({ id: item.id, text: item.canonicalQuestion })),
    sources: autoridade.sources.map(item => ({ id: `${item.domain}|${item.url || ""}`, domain: item.domain, typeLabel: item.type, verified: item.verified })),
    factual: autoridade.factualEvidence.map((item, indice) => {
      const afirmacao = autoridade.claims.find(entrada => entrada.claimId === item.claimId);
      return {
        id: `${item.claimId}|${item.sourceDomain}|${indice}`,
        claim: afirmacao?.canonicalClaim || item.claimId,
        sourceDomain: item.sourceDomain,
        supportLabel: item.supportType,
      };
    }),
    conflicts: autoridade.marketVsFactConflicts.map(item => {
      const afirmacao = autoridade.claims.find(entrada => entrada.claimId === item.claimId);
      return { id: item.claimId, text: afirmacao?.canonicalClaim || item.claimId };
    }),
    /* Uma lacuna é o assunto CONTRA alguma referência: os dois formam a identidade. */
    needs: observado.gaps.map(item => ({ id: `${item.subject}|${item.against}`, text: item.subject })),
    limitations: limitacoes.map((texto, indice) => ({ id: `limitacao:${indice}`, text: texto })),
  };

  /* §12 — histórico é leitura: o que aconteceu, quando, com que resultado. */
  const history: RadarResearchHistoryEntry[] = [];
  if (view.record) {
    history.push({
      id: "started",
      at: view.record.startedAt,
      label: "Pesquisa iniciada",
      detail: `${view.record.queries.length} consulta(s) executada(s) por ${view.record.startedBy}.`,
    });
    if (view.record.researchCuration) {
      history.push({
        id: "curation",
        at: view.record.researchCuration.confirmedAt,
        label: "Universo consolidado",
        detail: `${view.record.researchCuration.references.length} referência(s) avaliadas pela curadoria automática.`,
      });
    }
    if (view.record.finalizedAt) {
      history.push({
        id: "finalized",
        at: view.record.finalizedAt,
        label: "Investigação finalizada",
        detail: congelado
          ? `Congelada por ${view.record.finalizedBy || "operador"} · evidências ${congelado.bundleId} · hash ${congelado.bundleHash}.`
          : `Encerrada por ${view.record.finalizedBy || "operador"} com conclusão ${view.record.conclusion || "não registrada"}.`,
      });
    }
  }
  for (const item of input.collections || []) {
    history.push({
      id: `collection:${item.id}`,
      at: null,
      label: `Coleta ${item.provider}`,
      detail: `${item.status} · origem ${item.origin}${item.error ? ` · ${item.error}` : ""}`,
    });
  }

  return {
    status: estado.status,
    statusLabel: estado.label,
    tone: estado.tone,
    source: congelado ? "FROZEN" : "LIVE",
    frozen: congelado
      ? {
        bundleId: congelado.bundleId,
        bundleHash: congelado.bundleHash,
        frozenAt: congelado.frozenAt,
        acknowledgedInsufficiency: congelado.acknowledgedInsufficiency,
      }
      : null,
    collection,
    competitors,
    pages: {
      analyzed: congelado ? congelado.sample.analyzedSuccess : observado.sample.analyzedSuccess,
      comparable: congelado ? congelado.sample.comparablePages : observado.sample.comparablePages,
      failed: totalFalhas,
      failures: falhas,
      failureHeadline: totalFalhas ? `${totalFalhas} página(s) não puderam ser analisadas nesta rodada.` : null,
    },
    evidence,
    history,
  };
}

/* ========================= a linha da planilha ========================== */

/**
 * UMA PROJEÇÃO, DUAS SUPERFÍCIES — a planilha e o Workbench.
 *
 * Na homologação a planilha dizia "Pesquisa pendente" na mesma linha em que o
 * card dizia "Finalizado". Não eram dois defeitos: eram duas autoridades. A
 * coluna lia o estado do fluxo editorial persistido (`research_pending`), que
 * descreve a esteira Marca→Planejador, enquanto o card lia a investigação do
 * Radar.
 *
 * O estado persistido continua existindo e continua sendo gravado — ele
 * responde outra pergunta. O que muda é qual das duas a planilha MOSTRA quando
 * existe investigação: a do Radar, a mesma do card.
 */
export type RadarOperationalRow = {
  status: RadarOperationalStatus;
  statusLabel: string;
  tone: RadarOperationalTone;
  nextAction: string;
};

export function radarOperationalRow(input: {
  view: RadarDeepResearchView | null | undefined;
  running?: boolean;
  /** A frase antiga. Só sobrevive onde não existe investigação para descrever. */
  legacyNextAction: string;
}): RadarOperationalRow {
  const view = input.view;
  /*
   * SEM INVESTIGAÇÃO, NADA A CONTRADIZER.
   *
   * Um artigo que nunca entrou no Radar não tem estado de Radar. Aqui a frase
   * antiga continua sendo a melhor disponível — e ela não conflita com nada,
   * porque não há card dizendo outra coisa.
   */
  if (!view) {
    return { status: "NOT_STARTED", statusLabel: RADAR_OPERATIONAL_STATUS_LABEL.NOT_STARTED, tone: "neutral", nextAction: input.legacyNextAction };
  }

  const estado = radarOperationalStatus({ view, running: input.running });
  /*
   * §16 — A PRÓXIMA AÇÃO SAI DA AUTORIDADE DA FASE 1.
   *
   * "Revise 12 referência(s) pendente(s)" e "aprove a investigação" descrevem
   * um fluxo que não existe mais. A ação real é a que o botão oferece; quando
   * não há ação, a frase diz o estado em vez de inventar trabalho.
   */
  const nextAction = view.finalizedBundle
    ? "Investigação finalizada. O congelado permanece disponível para consulta."
    : view.phase1.id !== "NONE"
      ? view.phase1.label
      : view.phase1.hint || view.phase1.blockedReason || estado.label;

  return { status: estado.status, statusLabel: estado.label, tone: estado.tone, nextAction };
}
