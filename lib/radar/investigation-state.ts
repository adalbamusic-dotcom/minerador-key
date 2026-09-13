/**
 * O ESTADO COMPOSTO DA INVESTIGAÇÃO — e a pergunta "o que eu aperto agora?".
 *
 * A tela dizia `SERP concluída` e `Revisão aprovada` ao lado de `Análise
 * reaberta` e `Relatório aguardando geração`. As quatro frases estavam certas
 * isoladamente e a soma delas era falsa: coleta concluída virou sinônimo de
 * investigação concluída, e a pessoa aprovou um snapshot achando que fechava a
 * entrega.
 *
 * Aqui existe UMA leitura do estado inteiro. Cada etapa tem rótulo, cada
 * momento tem UMA ação primária, e "concluída" só aparece quando snapshot,
 * curadoria, análise, modelo, relatório e revisão descrevem a mesma coisa.
 *
 * Domínio puro: sem fetch, sem storage, sem provider.
 */

import type { RadarSerpCollectionAction } from "./serp-collection-state.ts";

export const RADAR_INVESTIGATION_STAGES = [
  "SERP_COLLECTION",
  "SERP_CURATION",
  "COMPETITIVE_ANALYSIS",
  "COMPETITIVE_MODEL",
  "COMPETITIVE_REPORT",
  "FINAL_REVIEW",
] as const;

export type RadarInvestigationStage = (typeof RADAR_INVESTIGATION_STAGES)[number];

export type RadarStageState = "PENDING" | "BLOCKED" | "IN_PROGRESS" | "REOPENED" | "DONE";

export type RadarInvestigationStageView = {
  stage: RadarInvestigationStage;
  label: string;
  state: RadarStageState;
  detail: string;
};

/** A ação primária de agora — uma só, com o verbo do produto. */
export type RadarInvestigationAction = {
  id:
    | "COLLECT" | "START_CURATION" | "DECIDE_RESULTS" | "START_ANALYSIS" | "ANALYZE_PENDING"
    | "CONSOLIDATE_MODEL" | "GENERATE_REPORT" | "REVIEW_INVESTIGATION" | "APPROVE_INVESTIGATION"
    | "PREPARE_PLANNER" | "NONE";
  label: string;
  enabled: boolean;
  /** Por que não dá para agir agora, quando não dá. */
  blockedReason: string | null;
};

export type RadarInvestigationInput = {
  hasSnapshot: boolean;
  /**
   * A ação da coleta, já derivada do estado real.
   *
   * Sem ela a barra oferecia "Iniciar coleta SERP" mesmo depois de um
   * bloqueio estrutural — convidando a pessoa a bater na mesma parede. Quem
   * sabe distinguir "tente de novo" de "não adianta" é este objeto.
   */
  collection?: RadarSerpCollectionAction | null;
  /** Existe análise compatível com o snapshot atual? */
  curationStarted: boolean;
  organicResults: number;
  pendingDecisions: number;
  selectedReferences: number;
  /** Referências selecionadas que ainda não foram extraídas. */
  pendingExtractions: number;
  analyzedPages: number;
  comparablePages: number;
  /** O modelo competitivo consolidado desta versão da análise. */
  modelReady: boolean;
  modelStale: boolean;
  /** Relatório competitivo persistido nesta versão da análise. */
  reportReady: boolean;
  reportStale: boolean;
  /** Revisão humana final da investigação (não do snapshot). */
  investigationReviewed: boolean;
  investigationApproved: boolean;
  /** Aprovação da curadoria SERP — histórica, e distinta da investigação. */
  serpCurationApproved: boolean;
  serpCurationCurrent: boolean;
  sentToPlanner: boolean;
};

export type RadarInvestigationView = {
  /** O rótulo do card. Nunca "SERP concluída" quando falta investigação. */
  headline: string;
  state: "NOT_STARTED" | "IN_PROGRESS" | "REOPENED" | "AWAITING_FINAL_REVIEW" | "COMPLETED";
  stages: RadarInvestigationStageView[];
  action: RadarInvestigationAction;
  nextAction: string;
  /** Ordem humana das etapas concluídas, para a barra de progresso. */
  completedCount: number;
  /**
   * O selo da curadoria SERP, ao lado — nunca no lugar — do estado da
   * investigação. Eram as duas frases que a tela somava e lia como conclusão.
   */
  curationBadge: string;
};

const STAGE_LABEL: Record<RadarInvestigationStage, string> = {
  SERP_COLLECTION: "Coleta SERP",
  SERP_CURATION: "Curadoria",
  COMPETITIVE_ANALYSIS: "Análise competitiva",
  COMPETITIVE_MODEL: "Modelo competitivo",
  COMPETITIVE_REPORT: "Relatório competitivo",
  FINAL_REVIEW: "Revisão final",
};

const acao = (id: RadarInvestigationAction["id"], label: string, enabled = true, blockedReason: string | null = null): RadarInvestigationAction =>
  ({ id, label, enabled, blockedReason });

export function buildRadarInvestigationView(input: RadarInvestigationInput): RadarInvestigationView {
  const stages: RadarInvestigationStageView[] = [];
  const push = (stage: RadarInvestigationStage, state: RadarStageState, detail: string) =>
    stages.push({ stage, label: STAGE_LABEL[stage], state, detail });

  /* 1 · coleta */
  const coleta = input.collection || null;
  const coletaEmCurso = Boolean(coleta && !input.hasSnapshot && coleta.actionLabel && !coleta.canStart && coleta.state !== "STRUCTURAL_BLOCK");
  push("SERP_COLLECTION",
    input.hasSnapshot ? "DONE" : coleta?.state === "STRUCTURAL_BLOCK" ? "BLOCKED" : coletaEmCurso ? "IN_PROGRESS" : "PENDING",
    input.hasSnapshot ? `${input.organicResults} resultado(s) no snapshot atual.`
      : coleta?.detail || "Nenhum snapshot coletado.");

  /* 2 · curadoria */
  const curadoriaDone = input.curationStarted && input.pendingDecisions === 0 && input.selectedReferences > 0;
  push("SERP_CURATION",
    !input.hasSnapshot ? "BLOCKED" : !input.curationStarted ? "PENDING" : curadoriaDone ? "DONE" : "IN_PROGRESS",
    !input.hasSnapshot ? "Depende da coleta." : !input.curationStarted ? "A curadoria ainda não foi iniciada."
      : input.pendingDecisions > 0 ? `${input.pendingDecisions} resultado(s) aguardam decisão.`
        : input.selectedReferences === 0 ? "Nenhuma referência selecionada para a amostra."
          : `${input.selectedReferences} referência(s) selecionada(s).`);

  /* 3 · análise */
  const analiseDone = input.analyzedPages > 0 && input.pendingExtractions === 0;
  push("COMPETITIVE_ANALYSIS",
    !curadoriaDone ? "BLOCKED" : input.analyzedPages === 0 ? "PENDING" : analiseDone ? "DONE" : "REOPENED",
    !curadoriaDone ? "Depende da curadoria concluída."
      : input.analyzedPages === 0 ? "Nenhuma página extraída ainda."
        : input.pendingExtractions > 0 ? `${input.pendingExtractions} referência(s) selecionada(s) ainda não analisada(s).`
          : `${input.analyzedPages} página(s) analisada(s) · ${input.comparablePages} comparável(is).`);

  /* 4 · modelo */
  push("COMPETITIVE_MODEL",
    !analiseDone ? "BLOCKED" : input.modelStale ? "REOPENED" : input.modelReady ? "DONE" : "PENDING",
    !analiseDone ? "Depende da análise concluída."
      : input.modelStale ? "A amostra mudou; o modelo precisa ser consolidado de novo."
        : input.modelReady ? "Modelo competitivo consolidado nesta versão." : "O modelo ainda não foi consolidado.");

  /* 5 · relatório */
  const modeloOk = input.modelReady && !input.modelStale;
  push("COMPETITIVE_REPORT",
    !modeloOk ? "BLOCKED" : input.reportStale ? "REOPENED" : input.reportReady ? "DONE" : "PENDING",
    !modeloOk ? "Depende do modelo competitivo."
      : input.reportStale ? "O modelo mudou; o relatório precisa ser gerado de novo."
        : input.reportReady ? "Relatório competitivo disponível nesta versão." : "O relatório ainda não foi gerado.");

  /* 6 · revisão final */
  const relatorioOk = input.reportReady && !input.reportStale;
  push("FINAL_REVIEW",
    !relatorioOk ? "BLOCKED" : input.investigationApproved ? "DONE" : input.investigationReviewed ? "IN_PROGRESS" : "PENDING",
    !relatorioOk ? "Depende do relatório competitivo."
      : input.investigationApproved ? "Investigação aprovada por decisão humana."
        : input.investigationReviewed ? "Revisada; aguardando aprovação." : "Aguardando revisão humana da investigação.");

  /* ------------------------- a ação primária ------------------------------ */

  /*
   * A ação da coleta nasce do módulo que já classifica a falha.
   *
   * Bloqueio estrutural não vira botão de repetir: ele vira motivo escrito.
   * Requisição em voo não vira segundo disparo: ela vira rótulo desabilitado.
   */
  const acaoDeColeta = (): RadarInvestigationAction => {
    if (!coleta) return acao("COLLECT", "Iniciar coleta da SERP");
    if (coleta.state === "STRUCTURAL_BLOCK") return acao("COLLECT", "Coleta bloqueada", false, coleta.detail);
    if (!coleta.actionLabel) return acao("COLLECT", "Iniciar coleta da SERP", false, coleta.detail);
    return acao("COLLECT", coleta.actionLabel, coleta.canStart, coleta.canStart ? null : coleta.detail);
  };

  const action: RadarInvestigationAction =
    !input.hasSnapshot ? acaoDeColeta()
      : !input.curationStarted ? acao("START_CURATION", "Iniciar curadoria")
        : input.pendingDecisions > 0 ? acao("DECIDE_RESULTS", `Decidir ${input.pendingDecisions} resultado(s) pendente(s)`)
          : input.selectedReferences === 0 ? acao("DECIDE_RESULTS", "Selecionar referências", false, "Nenhuma referência foi marcada como concorrente ou apoio.")
            : input.analyzedPages === 0 ? acao("START_ANALYSIS", `Analisar páginas selecionadas (${input.pendingExtractions})`)
              : input.pendingExtractions > 0 ? acao("ANALYZE_PENDING", `Analisar páginas pendentes (${input.pendingExtractions})`)
                : !modeloOk ? acao("CONSOLIDATE_MODEL", "Consolidar modelo competitivo")
                  : !relatorioOk ? acao("GENERATE_REPORT", "Gerar relatório competitivo")
                    : !input.investigationReviewed ? acao("REVIEW_INVESTIGATION", "Revisar investigação")
                      : !input.investigationApproved ? acao("APPROVE_INVESTIGATION", "Aprovar investigação")
                        : input.sentToPlanner ? acao("NONE", "Investigação entregue ao Planejador", false, null)
                          : acao("PREPARE_PLANNER", "Preparar para o Planejador");

  /* ------------------------- o estado do card ----------------------------- */

  const reaberto = stages.some(item => item.state === "REOPENED");
  const state: RadarInvestigationView["state"] =
    !input.hasSnapshot ? "NOT_STARTED"
      : input.investigationApproved && !reaberto ? "COMPLETED"
        : reaberto ? "REOPENED"
          : relatorioOk ? "AWAITING_FINAL_REVIEW" : "IN_PROGRESS";

  /*
   * O título nunca pode dizer que a SERP está concluída quando o que terminou
   * foi só a coleta. Esse era exatamente o engano da tela anterior.
   */
  const headline =
    state === "NOT_STARTED" ? "Investigação não iniciada"
      : state === "COMPLETED" ? "Investigação competitiva aprovada"
        : state === "REOPENED" ? "Investigação reaberta"
          : state === "AWAITING_FINAL_REVIEW" ? "Aguardando revisão final"
            : "Investigação competitiva em andamento";

  return {
    headline,
    state,
    stages,
    action,
    nextAction: action.blockedReason || action.label,
    completedCount: stages.filter(item => item.state === "DONE").length,
    curationBadge: radarSerpCurationBadge(input),
  };
}

/**
 * A aprovação da curadoria SERP não é a aprovação da investigação.
 *
 * Manter as duas visíveis e separadas é o que impede a tela de anunciar
 * conclusão sobre um relatório que não existe.
 */
export function radarSerpCurationBadge(input: Pick<RadarInvestigationInput, "serpCurationApproved" | "serpCurationCurrent">) {
  if (!input.serpCurationApproved) return "Curadoria SERP não aprovada";
  return input.serpCurationCurrent ? "Curadoria SERP aprovada" : "Curadoria SERP aprovada em versão anterior";
}

/* ------------------------ a ação DENTRO de cada aba ----------------------- */

/**
 * A AÇÃO PERTENCE À ABA — não a uma barra acima dos cards.
 *
 * A jornada virou um stepper global no topo do Workbench e a SERP deixou de
 * ser autocontida: quem estava em Concorrentes tinha que subir a tela para
 * agir. Aqui a mesma máquina de estados responde outra pergunta, mais estreita:
 * "estando NESTA aba, qual é a minha ação?".
 *
 * A resposta é uma de três: a ação primária, quando esta aba é a dona dela; um
 * ponteiro para a aba que é dona; ou nada, quando a aba é só leitura.
 *
 * Domínio puro: sem fetch, sem storage, sem provider.
 */

import type { RadarSerpProcessTab } from "./serp-process-navigation.ts";

export type RadarSerpTabAction = {
  /** `run` dispara o handler canônico; `navigate` só troca de aba. */
  kind: "run" | "navigate";
  id: RadarInvestigationAction["id"];
  label: string;
  enabled: boolean;
  blockedReason: string | null;
  target: RadarSerpProcessTab | null;
};

/** Qual aba é dona de cada ação primária. */
const ABA_DONA: Record<RadarInvestigationAction["id"], RadarSerpProcessTab | null> = {
  COLLECT: "collection",
  START_CURATION: "competitors",
  DECIDE_RESULTS: "competitors",
  START_ANALYSIS: "analysis",
  ANALYZE_PENDING: "analysis",
  CONSOLIDATE_MODEL: "analysis",
  GENERATE_REPORT: "analysis",
  REVIEW_INVESTIGATION: "review",
  APPROVE_INVESTIGATION: "review",
  PREPARE_PLANNER: "review",
  NONE: null,
};

const ABA_ROTULO: Record<RadarSerpProcessTab, string> = {
  collection: "Coleta",
  competitors: "Concorrentes",
  analysis: "Análise",
  evidence: "Evidências",
  review: "Revisão",
  history: "Histórico",
};

export function radarSerpTabAction(tab: RadarSerpProcessTab, view: RadarInvestigationView | null | undefined): RadarSerpTabAction | null {
  // Histórico é leitura: registro não recebe ação primária.
  if (!view || tab === "history") return null;

  const dona = ABA_DONA[view.action.id];
  if (!dona) return null;

  if (tab === dona) {
    /*
     * Decidir resultado não é um botão: acontece na tabela desta aba. Oferecer
     * um botão aqui seria repetir o clique mudo que este lote veio remover.
     */
    if (view.action.id === "DECIDE_RESULTS" && view.action.enabled) {
      return { kind: "run", id: "DECIDE_RESULTS", label: view.action.label, enabled: false, blockedReason: "Decida os resultados pendentes na tabela acima.", target: null };
    }
    return { kind: "run", id: view.action.id, label: view.action.label, enabled: view.action.enabled, blockedReason: view.action.blockedReason, target: null };
  }

  return { kind: "navigate", id: view.action.id, label: `Continuar para ${ABA_ROTULO[dona]}`, enabled: true, blockedReason: null, target: dona };
}

/* -------------- a ação do artigo ativo, fora da área expandida ------------- */

/**
 * O BOTÃO NÃO PODE MORAR ATRÁS DE UM CLIQUE DE EXPANSÃO.
 *
 * A ação voltou para dentro da aba da SERP — e ficou invisível para quem não
 * expandiu o card. A planilha mostrava "Iniciar curadoria" como TEXTO na coluna
 * Próxima ação: informação, não operação. Descobrir como continuar exigia
 * adivinhar que havia algo atrás do card.
 *
 * Esta função responde a mesma pergunta da aba, um nível acima: qual é a ação
 * do artigo ativo, esteja a SERP aberta ou fechada. Não é barra, stepper nem
 * wizard: é UM botão, o mesmo estado, o mesmo handler.
 *
 * A coleta continua sendo decidida por `RadarSerpCollectionAction`: bloqueio
 * estrutural não vira botão em lugar nenhum, porque repetir não conserta
 * vínculo quebrado.
 */
export function radarWorkbenchPrimaryAction(input: {
  investigation?: RadarInvestigationView | null;
  collection?: RadarSerpCollectionAction | null;
}): RadarSerpTabAction | null {
  const view = input.investigation;
  if (!view || view.action.id === "NONE") return null;

  if (view.action.id === "COLLECT") {
    const coleta = input.collection;
    if (coleta && coleta.actionLabel === null) return null;
    return {
      kind: "run", id: "COLLECT", target: null,
      label: coleta?.actionLabel || view.action.label,
      enabled: coleta ? coleta.canStart : view.action.enabled,
      blockedReason: coleta && !coleta.canStart ? coleta.detail : view.action.blockedReason,
    };
  }

  /*
   * Decidir resultado não tem handler: acontece na tabela de Concorrentes.
   * Daqui o clique útil é abrir a SERP — por isso ele navega em vez de rodar.
   */
  if (view.action.id === "DECIDE_RESULTS" && view.action.enabled) {
    return { kind: "navigate", id: "DECIDE_RESULTS", label: view.action.label, enabled: true, blockedReason: null, target: "competitors" };
  }

  return { kind: "run", id: view.action.id, label: view.action.label, enabled: view.action.enabled, blockedReason: view.action.blockedReason, target: null };
}
