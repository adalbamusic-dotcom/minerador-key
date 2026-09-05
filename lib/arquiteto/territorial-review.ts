/**
 * Revisão humana territorial — leitura comparativa, nunca uma quinta opinião.
 *
 * A Revisão NÃO recomenda. Ela põe lado a lado o que já existe:
 *
 *     ATUAL + LÓGICA + SERP + IA  →  HUMANO
 *
 * Por isso não há `reviewRecommendation` aqui. Calcular uma seria inventar mais
 * uma inteligência e esconder de quem a pessoa está discordando quando decide.
 *
 * Também não há storage: membership, contexto, confirmação, parecer de SERP e
 * proposta de IA já são remotos e versionados. A Revisão é recalculada a partir
 * deles — é isso que a faz sobreviver ao F5 sem record próprio.
 *
 * Domínio puro: sem provider, sem fetch, sem storage, sem UI.
 */

import type { TerritorialSerpAssessment } from "./territorial-serp.ts";
import type { TerritorialAiProposal } from "./territorial-ai.ts";

/** Estado de cada fonte. Ausência e falha são estados legíveis, não vazio. */
export type TerritorialProcessPresence =
  | "current"
  | "stale"
  | "not_required"
  | "not_executed"
  | "failed";

export type TerritorialReviewLogic = {
  presence: TerritorialProcessPresence;
  /** Estado de membership proposto pela Lógica; vocabulário canônico. */
  state: string | null;
  targetTerritoryRef: string | null;
  reason: string | null;
};

export type TerritorialReviewSerp = {
  presence: TerritorialProcessPresence;
  assessment: TerritorialSerpAssessment | null;
};

export type TerritorialReviewAi = {
  presence: TerritorialProcessPresence;
  proposal: TerritorialAiProposal | null;
};

/**
 * Ação humana oferecida. Só entra aqui o que TEM writer canônico: mostrar botão
 * sem mutação atrás seria prometer o que a mesa não cumpre.
 */
export type TerritorialReviewAction =
  | { kind: "assign_keyword"; keywordId: string; territoryRef: string; label: string; impact: string }
  | { kind: "move_keyword"; keywordId: string; fromTerritoryRef: string | null; territoryRef: string; label: string; impact: string }
  | { kind: "keep_unassigned"; keywordId: string; label: string; impact: string }
  | { kind: "update_context"; territoryRef: string; label: string; impact: string }
  | { kind: "confirm_silo"; territoryRef: string; label: string; impact: string }
  | { kind: "keep_current"; label: string; impact: string };

/** Ações que mexem em muita coisa e por isso pedem antes/depois explícito. */
export const HIGH_IMPACT_ACTIONS: readonly TerritorialReviewAction["kind"][] = [
  "move_keyword", "update_context", "confirm_silo",
];

export type TerritorialReviewStatus =
  | "pending"
  | "conflict"
  | "ready_for_decision"
  | "decision_recorded"
  | "stale";

export type TerritorialReviewView = {
  /** O que está sendo revisado. Silo, ou keyword dentro do silo. */
  subject: { kind: "territory" | "keyword"; ref: string; label: string };
  current: {
    territoryRef: string | null;
    territoryName: string | null;
    lifecycleStatus: string | null;
    membershipState: string | null;
    /** Quem decidiu por último e por quê; vem do writer canônico. */
    decision: { source: string; reason: string; decidedAt: string } | null;
    isPublished: boolean;
    slug: string | null;
    canonical: string | null;
  };
  logic: TerritorialReviewLogic;
  serp: TerritorialReviewSerp;
  ai: TerritorialReviewAi;
  /** Divergências REAIS entre as fontes, em texto humano. */
  conflicts: string[];
  /**
   * Qual fonte tem precedência de APRESENTAÇÃO quando há divergência.
   * Precedência é destaque de leitura; nenhuma fonte aplica decisão.
   */
  evidencePrecedence: "serp" | "logic" | "ai" | "none";
  availableHumanActions: TerritorialReviewAction[];
  blockers: string[];
  status: TerritorialReviewStatus;
};

/* ------------------------------ precedência ------------------------------ */

/**
 * A SERP só recebe destaque quando é evidência de verdade.
 *
 * Parecer desatualizado, insuficiente ou não executado não ganha precedência
 * sobre nada: destacar evidência fraca seria pior que não destacar.
 */
export function serpIsRepresentative(serp: TerritorialReviewSerp): boolean {
  if (serp.presence !== "current" || !serp.assessment) return false;
  if (serp.assessment.compatibility === "insuficiente") return false;
  return serp.assessment.recommendation !== "evidencia_insuficiente";
}

/** Recomendações que apontam para caminhos estruturalmente diferentes. */
const SERP_KEEPS = new Set(["manter_silo"]);
const AI_KEEPS = new Set(["maintain", "no_op"]);

/**
 * Conflito é divergência de DIREÇÃO, não de vocabulário.
 *
 * Comparar rótulos entre motores diferentes produziria conflito onde não há;
 * aqui só conta quando um diz "fica" e outro diz "muda".
 */
export function detectTerritorialConflicts(input: {
  logic: TerritorialReviewLogic;
  serp: TerritorialReviewSerp;
  ai: TerritorialReviewAi;
}): string[] {
  const conflicts: string[] = [];
  const serpVigente = input.serp.presence === "current" ? input.serp.assessment : null;
  const aiVigente = input.ai.presence === "current" ? input.ai.proposal : null;

  const serpMantem = serpVigente ? SERP_KEEPS.has(serpVigente.recommendation) : null;
  const aiMantem = aiVigente ? AI_KEEPS.has(aiVigente.recommendation) : null;
  const logicaCriaNovo = input.logic.presence === "current" && input.logic.state === "new_silo_candidate";

  if (serpMantem === false && aiMantem === true) {
    conflicts.push(`A SERP aponta ${serpVigente!.recommendation} e a IA propõe ${aiVigente!.recommendation}.`);
  }
  if (serpMantem === true && aiMantem === false) {
    conflicts.push(`A SERP aponta manter e a IA propõe ${aiVigente!.recommendation}.`);
  }
  if (logicaCriaNovo && serpMantem === false && serpVigente?.recommendation === "usar_silo_existente") {
    conflicts.push("A Lógica propõe silo novo e a SERP aponta forte sobreposição com um silo existente.");
  }
  if (logicaCriaNovo && aiVigente?.recommendation === "use_existing_silo") {
    conflicts.push("A Lógica propõe silo novo e a IA propõe usar um silo existente.");
  }
  for (const conflito of serpVigente?.conflicts || []) conflicts.push(conflito);
  return [...new Set(conflicts)];
}

/* -------------------------------- status --------------------------------- */

/**
 * Projeção de UI, sem enum persistido novo.
 *
 * `decision_recorded` sai da decisão que o writer canônico já gravou; a Revisão
 * não inventa carimbo próprio.
 */
export function resolveTerritorialReviewStatus(input: {
  conflicts: readonly string[];
  hasHumanDecision: boolean;
  anyStale: boolean;
  hasActions: boolean;
}): TerritorialReviewStatus {
  if (input.anyStale) return "stale";
  if (input.conflicts.length) return "conflict";
  if (input.hasHumanDecision) return "decision_recorded";
  return input.hasActions ? "ready_for_decision" : "pending";
}

/* ------------------------------- a leitura -------------------------------- */

type ReviewTerritory = {
  territoryRef: string;
  name: string | null;
  centralEntity: string;
  lifecycleStatus: string;
  isPublished: boolean;
  slug: string | null;
  canonical: string | null;
  /** Blockers de confirmação, já resolvidos por quem chama. */
  confirmationBlockers: readonly string[];
  confirmationReady: boolean;
};

type ReviewKeyword = {
  keywordId: string;
  keyword: string;
  territoryRef: string | null;
  decision: { source: string; reason: string; decidedAt: string } | null;
};

/**
 * Monta a leitura comparativa de UM silo e das keywords ligadas a ele.
 *
 * Cada ação oferecida corresponde a um writer que já existe. Quando a evidência
 * sugere um caminho, a ação aparece nomeada — "Associar ao silo X" —, nunca
 * como "aplicar SERP" ou "aplicar IA": quem aplica é a pessoa, no objeto certo.
 */
export function buildTerritorialReviewView(input: {
  territory: ReviewTerritory;
  keywords: readonly ReviewKeyword[];
  /** Keywords sem silo que alguma fonte associa a este silo. */
  suggestedKeywords?: readonly ReviewKeyword[];
  logic: TerritorialReviewLogic;
  serp: TerritorialReviewSerp;
  ai: TerritorialReviewAi;
}): TerritorialReviewView {
  const { territory } = input;
  const conflicts = detectTerritorialConflicts(input);
  const anyStale = input.serp.presence === "stale" || input.ai.presence === "stale" || input.logic.presence === "stale";

  const actions: TerritorialReviewAction[] = [];
  for (const keyword of input.suggestedKeywords || []) {
    // Ação nomeada no objeto real; a origem da sugestão fica no comparativo.
    actions.push(keyword.territoryRef
      ? {
        kind: "move_keyword", keywordId: keyword.keywordId,
        fromTerritoryRef: keyword.territoryRef, territoryRef: territory.territoryRef,
        label: `Mover "${keyword.keyword}" para ${territory.name || territory.centralEntity}`,
        impact: `A keyword sai do silo atual e passa a pertencer a ${territory.name || territory.centralEntity}.`,
      }
      : {
        kind: "assign_keyword", keywordId: keyword.keywordId, territoryRef: territory.territoryRef,
        label: `Associar "${keyword.keyword}" a ${territory.name || territory.centralEntity}`,
        impact: `A keyword deixa de estar sem silo e passa a pertencer a ${territory.name || territory.centralEntity}.`,
      });
  }

  if (territory.lifecycleStatus === "candidate") {
    actions.push({
      kind: "update_context", territoryRef: territory.territoryRef,
      label: "Atualizar contexto do silo",
      impact: "Entidade central, intenção macro, fronteira e narrativa passam a valer para as próximas decisões.",
    });
    if (territory.confirmationReady) {
      actions.push({
        kind: "confirm_silo", territoryRef: territory.territoryRef,
        label: "Confirmar Silo",
        impact: "O universo passa a poder receber artigos. Não consolida SiloDNA nem SiloPage.",
      });
    }
  }

  // "Manter atual" existe sempre: discordar das fontes é decisão legítima.
  actions.push({
    kind: "keep_current",
    label: "Manter atual",
    impact: "Nenhuma mudança estrutural; a arquitetura vigente permanece.",
  });

  const humanDecision = input.keywords.find(keyword => keyword.decision?.source === "human")?.decision ?? null;

  return {
    subject: {
      kind: "territory",
      ref: territory.territoryRef,
      label: territory.name || territory.centralEntity || "Silo sem nome",
    },
    current: {
      territoryRef: territory.territoryRef,
      territoryName: territory.name,
      lifecycleStatus: territory.lifecycleStatus,
      membershipState: input.keywords.length ? "assigned" : null,
      decision: humanDecision,
      isPublished: territory.isPublished,
      slug: territory.slug,
      canonical: territory.canonical,
    },
    logic: input.logic,
    serp: input.serp,
    ai: input.ai,
    conflicts,
    // Só evidência representativa ganha destaque; senão a Lógica é o eixo.
    evidencePrecedence: serpIsRepresentative(input.serp)
      ? "serp"
      : input.logic.presence === "current" ? "logic" : input.ai.presence === "current" ? "ai" : "none",
    availableHumanActions: actions,
    blockers: [...territory.confirmationBlockers],
    status: resolveTerritorialReviewStatus({
      conflicts,
      hasHumanDecision: Boolean(humanDecision),
      anyStale,
      hasActions: actions.length > 1,
    }),
  };
}

/* --------------------------- coluna Processamento ------------------------ */

/** Símbolo compacto por processo. Read-model de UI; nenhum enum persistido. */
export type TerritorialProcessCell = {
  process: "logic" | "serp" | "ai" | "review";
  label: string;
  /** `ok` concluído · `warn` precisa de atenção · `idle` nada a fazer. */
  tone: "ok" | "warn" | "idle";
  detail: string;
};

const PRESENCE_TONE: Record<TerritorialProcessPresence, "ok" | "warn" | "idle"> = {
  current: "ok",
  stale: "warn",
  failed: "warn",
  not_required: "idle",
  not_executed: "idle",
};

const PRESENCE_TEXT: Record<TerritorialProcessPresence, string> = {
  current: "concluído",
  stale: "desatualizado",
  failed: "erro",
  not_required: "não necessário",
  not_executed: "não executado",
};

const REVIEW_TONE: Record<TerritorialReviewStatus, "ok" | "warn" | "idle"> = {
  decision_recorded: "ok",
  conflict: "warn",
  stale: "warn",
  ready_for_decision: "idle",
  pending: "idle",
};

const REVIEW_TEXT: Record<TerritorialReviewStatus, string> = {
  decision_recorded: "decisão registrada",
  conflict: "conflito",
  stale: "desatualizada",
  ready_for_decision: "pronta para decisão",
  pending: "pendente",
};

/**
 * As quatro naturezas em uma célula só.
 *
 * `stale` precisa ser VISÍVEL, não escondido em tooltip: é o único aviso de que
 * existe algo a reexecutar antes de decidir.
 */
export function territorialProcessCells(view: TerritorialReviewView): TerritorialProcessCell[] {
  return [
    { process: "logic", label: "Lógica", tone: PRESENCE_TONE[view.logic.presence], detail: PRESENCE_TEXT[view.logic.presence] },
    { process: "serp", label: "SERP", tone: PRESENCE_TONE[view.serp.presence], detail: PRESENCE_TEXT[view.serp.presence] },
    { process: "ai", label: "IA", tone: PRESENCE_TONE[view.ai.presence], detail: PRESENCE_TEXT[view.ai.presence] },
    { process: "review", label: "Revisão", tone: REVIEW_TONE[view.status], detail: REVIEW_TEXT[view.status] },
  ];
}

/** Decisão HUMANA do silo. Recomendação de SERP/IA não entra nesta coluna. */
export function territorialHumanDecisionLabel(view: TerritorialReviewView): string {
  return view.current.decision?.source === "human" ? "Registrada" : "Pendente";
}
