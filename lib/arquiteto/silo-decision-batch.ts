/**
 * CONFIRMAR EM LOTE — a mesma decisão, sem 200 idas e voltas.
 *
 * O Confirmar da aba Silos aplicava a membership UMA keyword por vez, e cada
 * uma fazia: uma gravação, uma recarga COMPLETA do workspace como releitura,
 * uma notificação e um gatilho de recarga. Medido no código em 2026-09-23:
 * com 200 keywords isso vira 200 gravações e 200 recargas do lote inteiro —
 * na ordem de 40 mil linhas trafegadas para confirmar uma lista.
 *
 * O produto passou a operar listas de ~200 keywords em sequência. Este módulo
 * mantém TODAS as garantias do caminho antigo e muda só o transporte:
 *
 *   PLANO      o mesmo `planSiloAssignment` por keyword — mesmas recusas,
 *              mesmo "já está no destino", mesma proteção de publicada;
 *   LOCK       cada item vai com o `expectedLock` dele; o servidor recusa o
 *              item com lock vencido, nunca sobrescreve;
 *   RELEITURA  UMA releitura remota ao final decide o desfecho de CADA
 *              keyword, pelo mesmo `resolveSiloAssignmentOutcome`.
 *
 * O servidor aplica item a item sem transação: se um item falha, os anteriores
 * ficam gravados e o resto do lote para. Isso não muda nada aqui — quem diz o
 * que aconteceu é a releitura, não o retorno da gravação.
 *
 * Domínio puro: sem React, sem storage, sem rede. O transporte fica no
 * workspace; aqui ficam o plano, o fatiamento e o veredito.
 */

import {
  planSiloAssignment,
  resolveSiloAssignmentOutcome,
  type SiloAssignmentKeyword,
  type SiloAssignmentStep,
} from "./silo-assignment.ts";
import type { TerritorialLandscape } from "./territorial-landscape.ts";

/**
 * Só os dois destinos que o Confirmar produz.
 *
 * Estrutura existente sem registro interno exige ANCORAR antes de associar, e
 * a âncora devolve um `territoryRef` que as próximas keywords precisariam
 * esperar. Isso é sequencial por natureza e continua no caminho individual.
 */
export type BatchSiloTarget = { kind: "territory"; territoryRef: string } | { kind: "unassigned" };

export type BatchSiloDecision = { keywordId: string; target: BatchSiloTarget };

export type BatchSiloWrite = {
  keywordId: string;
  workflowItemId: string;
  expectedLock: number;
  /** O que vai para o writer canônico — igual ao caminho individual. */
  assignment: { territoryRef: string | null; territoryAssignment: unknown };
  /** Os passos do plano, para o veredito da releitura. */
  steps: SiloAssignmentStep[];
};

export type PlannedSiloBatch = {
  writes: BatchSiloWrite[];
  /** Já estavam no destino: trabalho feito, nem falha nem aplicação. */
  unchanged: string[];
  /** Recusadas no plano, antes de qualquer gravação, com o motivo. */
  refused: Array<{ keywordId: string; reason: string }>;
};

/**
 * Planeja o lote inteiro. Nenhuma keyword sai daqui sem destino: vira
 * gravação, "já estava" ou recusa com motivo.
 */
export function planSiloDecisionBatch(input: {
  brandId: string;
  landscape: TerritorialLandscape;
  /** A keyword como o plano precisa dela; `null` = sem item de workflow canônico. */
  keywordOf: (keywordId: string) => SiloAssignmentKeyword | null;
  decisions: readonly BatchSiloDecision[];
  decidedAt: string;
}): PlannedSiloBatch {
  const writes: BatchSiloWrite[] = [];
  const unchanged: string[] = [];
  const refused: PlannedSiloBatch["refused"] = [];
  const vistas = new Set<string>();

  for (const decision of input.decisions) {
    /*
     * A mesma keyword duas vezes no lote gravaria duas vezes com o mesmo lock:
     * a segunda falharia por lock vencido e apareceria como falha falsa.
     */
    if (vistas.has(decision.keywordId)) continue;
    vistas.add(decision.keywordId);

    const keyword = input.keywordOf(decision.keywordId);
    if (!keyword) {
      refused.push({ keywordId: decision.keywordId, reason: "Esta keyword não tem item de workflow canônico; recarregue o workspace." });
      continue;
    }

    const plan = planSiloAssignment({
      brandId: input.brandId,
      landscape: input.landscape,
      keyword,
      target: decision.target,
      reason: decision.target.kind === "unassigned"
        ? "Decisão humana: manter a keyword sem silo."
        : "Decisão humana de silo na aba Silos.",
      decidedAt: input.decidedAt,
    });

    if (!plan.ok) {
      if (plan.refusals.every(refusal => refusal.code === "ALREADY_IN_TARGET")) {
        unchanged.push(decision.keywordId);
        continue;
      }
      refused.push({
        keywordId: decision.keywordId,
        reason: plan.refusals.map(refusal => refusal.detail || refusal.code).join(" ").trim() || "Decisão de silo recusada.",
      });
      continue;
    }

    const passo = plan.steps.find(step => step.kind === "assign_keyword");
    if (!passo || passo.kind !== "assign_keyword") {
      refused.push({ keywordId: decision.keywordId, reason: "O plano não produziu associação para esta keyword." });
      continue;
    }
    writes.push({
      keywordId: decision.keywordId,
      workflowItemId: passo.workflowItemId,
      expectedLock: passo.expectedLock,
      assignment: { territoryRef: passo.territoryRef, territoryAssignment: passo.decision },
      steps: plan.steps,
    });
  }

  return { writes, unchanged, refused };
}

/**
 * Tamanho do lote por requisição.
 *
 * O servidor aceita até 500, mas relê TODAS as keywords da Brand a cada
 * requisição e para no primeiro item que falha. Lote de 25 mantém a
 * requisição leve e faz um item ruim atrasar 24 vizinhos, não 199.
 */
export const SILO_DECISION_CHUNK_SIZE = 25;

export function chunkBatch<T>(items: readonly T[], size = SILO_DECISION_CHUNK_SIZE): T[][] {
  const tamanho = Math.max(1, Math.floor(size));
  const lotes: T[][] = [];
  for (let inicio = 0; inicio < items.length; inicio += tamanho) lotes.push(items.slice(inicio, inicio + tamanho));
  return lotes;
}

/**
 * O veredito de cada keyword, decidido pela RELEITURA — nunca pelo retorno
 * da gravação.
 *
 * Um lote que falhou no meio pode ter gravado metade; uma nova tentativa com
 * o lock antigo é recusada pelo servidor sem sobrescrever. Por isso nenhuma
 * das duas respostas é confiável sozinha, e a releitura é a única fonte.
 */
export function resolveSiloBatchOutcome(input: {
  writes: readonly BatchSiloWrite[];
  readbackTerritoryRefByKeyword: ReadonlyMap<string, string | null>;
}): { applied: string[]; refused: string[] } {
  const applied: string[] = [];
  const refused: string[] = [];
  for (const write of input.writes) {
    const veredito = resolveSiloAssignmentOutcome({
      steps: write.steps,
      readbackTerritoryRefByKeyword: input.readbackTerritoryRefByKeyword,
      anchoredTerritoryRef: null,
    });
    if (veredito.outcome === "applied") applied.push(write.keywordId);
    else refused.push(write.keywordId);
  }
  return { applied, refused };
}
