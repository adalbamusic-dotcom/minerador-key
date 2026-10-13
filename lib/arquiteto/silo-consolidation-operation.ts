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

/*
 * FECHAR O SILO SEM SITE DECLARADO (WifiConecta, 2026-10-12).
 *
 * A URL canônica da SiloPage nova nasce do site da marca + slug
 * (`plannedSiloPageCanonical`). Com `marcas.site_url` vazio ela sai null, o
 * portão próprio da SiloPage recusa com SILO_PAGE_APPROVAL_CANONICAL_MISSING e
 * o servidor devolve SILO_PAGE_APPROVAL_GATE_MISSING — depois do clique, em
 * código. A tela pergunta antes e diz o que fazer.
 */
export const SILO_SITE_REQUIRED_MESSAGE =
  "Declare o site da marca em Marca → Site para fechar o Silo (a URL canônica da página do Silo nasce do site + slug)";
export const SILO_PUBLISHED_CANONICAL_MISSING_MESSAGE =
  "A página publicada do Silo está sem URL canônica no catálogo do site: sincronize o site em Marca → Site antes de fechar o Silo.";

/** A frase que impede o envio, ou null quando a SiloPage tem canonical para aprovar. */
export function siloPageCanonicalRefusal(identity: {
  canonical: string | null | undefined;
  publicationStatus: "new" | "published" | string;
}): string | null {
  if (typeof identity.canonical === "string" && identity.canonical.trim()) return null;
  return identity.publicationStatus === "published" ? SILO_PUBLISHED_CANONICAL_MISSING_MESSAGE : SILO_SITE_REQUIRED_MESSAGE;
}

/*
 * RECUSA DE DOMÍNIO NÃO É FALHA INDETERMINADA.
 *
 * Estes códigos nascem nos portões do adaptador ANTES da RPC
 * (`arquiteto-silo-consolidation-adapter.ts`): a resposta 409 prova que nada
 * foi gravado. Guardar a operação congelada e reenviá-la repetia o mesmo
 * corpo — com o mesmo `canonical: null` — e a mesma recusa, para sempre.
 * Descartada, a próxima tentativa remonta o envelope com o que mudou (o site
 * declarado, por exemplo).
 *
 * Fica de fora o que pode vir da RPC ou do readback (STALE_WORKING_COPY,
 * WORKING_COPY_ALREADY_CONSUMED, QUERY_FAILURE, 5xx, rede): esses continuam
 * indeterminados e a retomada reenvia byte a byte.
 */
export const SILO_CONSOLIDATION_PRE_WRITE_REFUSAL_PREFIXES = [
  "SILO_PAGE_APPROVAL_",
  "SILO_NOT_READY",
  "HUMAN_SILO_CONSOLIDATION_REQUIRED",
  "SILO_DNA_APPROVAL_WITHOUT_HUMAN_DECISION",
  "SILO_DNA_WORKING_COPY_MISMATCH",
  "SILO_PAGE_STRUCTURAL_MISMATCH",
  "TERRITORY_STRUCTURE_MISMATCH",
  "TERRITORY_NARRATIVE_MISSING",
  "TERRITORY_REF_MISMATCH",
  "ARTICLE_BRAND_MISMATCH",
  "ARTICLE_COVERAGE_GAP",
  "ARTICLE_TERRITORY_MISMATCH",
  "ARTICLE_VERSION_MISMATCH",
  "PILLAR_DECISION_STALE",
  "PILLAR_NOT_HUMAN_DECIDED",
  "PUBLISHED_IDENTITY_DECISION_REQUIRED",
  "PUBLISHED_IDENTITY_MUTATED",
] as const;

export type SiloConsolidationFailureDisposition = "discard" | "indeterminate";

/**
 * O que fazer com a operação congelada depois de uma falha: só a recusa 409
 * de domínio (código `CONFLICT` com o prefixo de um portão anterior à RPC)
 * descarta; o resto fica indeterminado para a retomada segura.
 */
export function siloConsolidationFailureDisposition(error: unknown): SiloConsolidationFailureDisposition {
  if (!error || typeof error !== "object") return "indeterminate";
  const candidate = error as { code?: unknown; message?: unknown; status?: unknown };
  // F5 — a guarda recusou ANTES da RPC ("a mesma recusa de <data>"): nada foi gravado.
  if (candidate.code === "REWORK_SAME_REFUSAL" || (typeof candidate.message === "string" && candidate.message.trim().startsWith("REWORK_SAME_REFUSAL"))) return "discard";
  if (typeof candidate.status === "number" && candidate.status !== 409) return "indeterminate";
  if (candidate.code !== "CONFLICT") return "indeterminate";
  const message = typeof candidate.message === "string" ? candidate.message.trim() : "";
  return SILO_CONSOLIDATION_PRE_WRITE_REFUSAL_PREFIXES.some(prefix => message.startsWith(prefix)) ? "discard" : "indeterminate";
}

/**
 * A operação em voo que a próxima tentativa pode reenviar. Uma operação com a
 * SiloPage aprovada e sem canonical nunca passa no portão do servidor — logo
 * nunca foi gravada — e não é retomada: o envelope é remontado.
 */
export function siloConsolidationOperationForRetry(
  inFlight: SiloConsolidationOperation | null | undefined,
  current: { territoryRef: string; workingCopyExpectedLock: number },
): SiloConsolidationOperation | null {
  if (!inFlight || inFlight.state === "settled") return null;
  if (inFlight.territoryRef !== current.territoryRef || inFlight.workingCopyExpectedLock !== current.workingCopyExpectedLock) return null;
  if (inFlight.statuses.siloPage === "approved" && !inFlight.siloPage.payload.canonical) return null;
  return inFlight;
}

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
