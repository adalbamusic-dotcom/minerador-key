import type { SiloDNA, SiloPage, VersionEnvelope } from "./contracts.ts";
import type { SiloConsolidationDecision } from "./silo-consolidation-territorial.ts";
import type { SiloPageApprovalDecision } from "./silo-page-approval.ts";

/**
 * DONO DO ENVELOPE DE RETRY — a "operação em andamento" da interface.
 *
 * O problema que ele resolve: `createVersionEnvelope` gera `versionId` e
 * `createdAt` NOVOS a cada chamada, e o hash acompanha. Se a consolidação
 * falhar de forma indeterminada (timeout, rede caindo entre o commit e a
 * resposta) e a UI reconstruir o envelope para tentar de novo, a RPC vê uma
 * operação DIFERENTE — e o replay idempotente, que compara o payload inteiro,
 * não reconhece a repetição. O resultado é escrita dupla ou recusa espúria.
 *
 * Então o envelope é construído UMA vez, guardado aqui enquanto a operação
 * estiver pendente ou indeterminada, e reenviado byte a byte no retry.
 *
 * ISTO NÃO É FONTE CANÔNICA. É memória de uma operação em voo, com vida curta:
 * nasce no clique, morre no readback confirmado. A autoridade continua sendo a
 * working copy remota e os artefatos versionados — nada aqui é lido para
 * responder "qual é a arquitetura", só para responder "o que eu já mandei".
 */

export const SILO_CONSOLIDATION_OPERATION_STATES = ["pending", "indeterminate", "settled"] as const;
export type SiloConsolidationOperationState = (typeof SILO_CONSOLIDATION_OPERATION_STATES)[number];

export type SiloConsolidationOperation = {
  operationId: string;
  brandId: string;
  action: "create" | "edit";
  territoryRef: string;
  territoryExpectedLock: number;
  workingCopyExpectedLock: number;
  /** Congelados. Nenhum campo destes é regenerado depois de aberto. */
  siloDna: VersionEnvelope<SiloDNA>;
  siloPage: VersionEnvelope<SiloPage>;
  statuses: { siloDna: string; siloPage: string };
  decision: SiloConsolidationDecision;
  siloPageApproval: SiloPageApprovalDecision | null;
  state: SiloConsolidationOperationState;
  attempts: number;
  lastIssue: string | null;
};

/**
 * Identidade DETERMINÍSTICA, pelo mesmo motivo do `workingCopyRef`: se o id da
 * operação fosse aleatório, um reload do browser no meio da consolidação
 * perderia a referência e o próximo clique abriria outra operação — que é
 * exatamente a escrita dupla que o envelope congelado evita.
 *
 * O lock da working copy entra na chave porque uma consolidação sobre outra
 * versão da WC é outra operação, não um retry desta.
 */
export const buildSiloConsolidationOperationId = (territoryRef: string, workingCopyExpectedLock: number): string =>
  `silo-consolidation:${territoryRef}:${workingCopyExpectedLock}`;

export type OpenSiloConsolidationOperationInput = {
  brandId: string;
  action: "create" | "edit";
  territoryRef: string;
  territoryExpectedLock: number;
  workingCopyExpectedLock: number;
  siloDna: VersionEnvelope<SiloDNA>;
  siloPage: VersionEnvelope<SiloPage>;
  statuses: { siloDna: string; siloPage: string };
  decision: SiloConsolidationDecision;
  siloPageApproval?: SiloPageApprovalDecision | null;
};

export function openSiloConsolidationOperation(
  input: OpenSiloConsolidationOperationInput,
): SiloConsolidationOperation {
  return {
    operationId: buildSiloConsolidationOperationId(input.territoryRef, input.workingCopyExpectedLock),
    brandId: input.brandId,
    action: input.action,
    territoryRef: input.territoryRef,
    territoryExpectedLock: input.territoryExpectedLock,
    workingCopyExpectedLock: input.workingCopyExpectedLock,
    siloDna: input.siloDna,
    siloPage: input.siloPage,
    statuses: { ...input.statuses },
    decision: input.decision,
    siloPageApproval: input.siloPageApproval ?? null,
    state: "pending",
    attempts: 0,
  lastIssue: null,
  };
}

export type SiloConsolidationRequestBody = {
  brandId: string;
  action: "create" | "edit";
  territoryRef: string;
  territoryExpectedLock: number;
  workingCopyExpectedLock: number;
  siloDnaStatus: string;
  siloPageStatus: string;
  decision: SiloConsolidationDecision;
  siloPageApproval: SiloPageApprovalDecision | null;
  siloDna: VersionEnvelope<SiloDNA>;
  siloPage: VersionEnvelope<SiloPage>;
};

/**
 * O corpo da requisição, montado SEMPRE a partir da operação congelada. A
 * primeira tentativa e o retry produzem exatamente o mesmo objeto — é isso que
 * torna o replay da RPC reconhecível.
 */
export function siloConsolidationRequestBody(operation: SiloConsolidationOperation): SiloConsolidationRequestBody {
  return {
    brandId: operation.brandId,
    action: operation.action,
    territoryRef: operation.territoryRef,
    territoryExpectedLock: operation.territoryExpectedLock,
    workingCopyExpectedLock: operation.workingCopyExpectedLock,
    siloDnaStatus: operation.statuses.siloDna,
    siloPageStatus: operation.statuses.siloPage,
    decision: operation.decision,
    siloPageApproval: operation.siloPageApproval,
    siloDna: operation.siloDna,
    siloPage: operation.siloPage,
  };
}

export const registerSiloConsolidationAttempt = (
  operation: SiloConsolidationOperation,
): SiloConsolidationOperation => ({ ...operation, attempts: operation.attempts + 1 });

/**
 * Falha sem resposta conclusiva. A operação NÃO é descartada: o servidor pode
 * ter commitado. Descartar aqui é o que produziria um segundo envelope.
 */
export const markSiloConsolidationIndeterminate = (
  operation: SiloConsolidationOperation,
  issue: string,
): SiloConsolidationOperation => ({ ...operation, state: "indeterminate", lastIssue: issue });

/** Só o readback confirmado encerra. Estado de React não encerra operação. */
export const settleSiloConsolidationOperation = (
  operation: SiloConsolidationOperation,
): SiloConsolidationOperation => ({ ...operation, state: "settled", lastIssue: null });

export const isSiloConsolidationRetryable = (operation: SiloConsolidationOperation | null | undefined): boolean =>
  Boolean(operation) && operation!.state !== "settled";

export const RETRY_FROZEN_ENVELOPE_FIELDS = [
  "versionId",
  "versionNumber",
  "createdAt",
  "contentHash",
  "previousVersionId",
] as const;

/**
 * Prova de que um retry é o MESMO envio. Usada pelos testes e disponível para
 * quem precisar auditar uma tentativa antes de despachá-la.
 */
export function retryPreservesEnvelope(
  first: SiloConsolidationRequestBody,
  retry: SiloConsolidationRequestBody,
): { ok: boolean; divergent: string[] } {
  const divergent: string[] = [];
  for (const artifact of ["siloDna", "siloPage"] as const) {
    for (const field of RETRY_FROZEN_ENVELOPE_FIELDS) {
      if (first[artifact][field] !== retry[artifact][field]) divergent.push(`${artifact}.${field}`);
    }
    if (JSON.stringify(first[artifact].payload) !== JSON.stringify(retry[artifact].payload)) {
      divergent.push(`${artifact}.payload`);
    }
  }
  if (first.siloDnaStatus !== retry.siloDnaStatus) divergent.push("siloDnaStatus");
  if (first.siloPageStatus !== retry.siloPageStatus) divergent.push("siloPageStatus");
  if (first.territoryExpectedLock !== retry.territoryExpectedLock) divergent.push("territoryExpectedLock");
  if (first.workingCopyExpectedLock !== retry.workingCopyExpectedLock) divergent.push("workingCopyExpectedLock");
  return { ok: divergent.length === 0, divergent };
}
