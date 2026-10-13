/**
 * ===== GUARDA DE RETRABALHO — DOMÍNIO (F5) =====
 *
 * SDD `docs/compartilhado/sdd-plano-declarado-e-grupos-2026-10-12.md` §10.
 *
 * Uma guarda só, chamada pelo NÚCLEO de cada operação (rota, MCP e tela passam
 * pelo mesmo ponto): compara os insumos de agora com o que já foi feito e diz,
 * antes do clique, uma de cinco coisas:
 *
 *   fresh                 nunca feito com estes insumos → roda e registra;
 *   same_inputs_reuse     mesmos insumos, terminou bem → devolve o resultado
 *                         anterior; refazer só com motivo (D11);
 *   same_refusal          mesmos insumos, terminou na MESMA recusa → não roda
 *                         de novo; diz a recusa anterior e o que mudar;
 *   contradicts_declared  trocaria a principal ou o papel declarado, ou
 *                         deixaria keyword da lista do Assunto fora do artigo e
 *                         de "não agrupadas" → recusa, SEM "refazer mesmo
 *                         assim" (muda-se o plano no Minerador);
 *   parallel_path         gravaria fora do núcleo canônico (ex.: artigo sem
 *                         Assunto dentro de grupo com plano) → recusa.
 *
 * O REGISTRO é o que a operação já tem, quando tem (a execução da melhoria, o
 * registro de uso, o parecer da SERP); só o que não tem registro próprio ganha
 * uma linha `editorial_workflow_items` com `subject_type = 'operation_ledger'`,
 * `subject_id = '<kind>:<fingerprint>'` e o payload deste arquivo (as últimas
 * 20 tentativas). Nenhuma tabela nova. "Histórico do grupo" lê o mesmo formato.
 *
 * Domínio puro: sem React, sem storage, sem rede.
 */
import { contentHash } from "../arquiteto/versioning.ts";

export const REWORK_LEDGER_SUBJECT_TYPE = "operation_ledger" as const;
/** O estágio do módulo dono da operação (CHECK de `editorial_workflow_items.stage`). */
export const REWORK_LEDGER_STAGES = ["minerador", "architect", "radar", "writer", "publications"] as const;
export type ReworkLedgerStage = (typeof REWORK_LEDGER_STAGES)[number];
/** Quantas tentativas a linha guarda (as mais novas). */
export const REWORK_LEDGER_ATTEMPTS_LIMIT = 20;
/** Motivo do "Refazer mesmo assim": curto, mas dito (D11). */
export const REWORK_OVERRIDE_REASON_MIN = 5;
export const REWORK_OVERRIDE_REASON_MAX = 500;

export const REWORK_OPERATION_KINDS = [
  "article_improvement_prepare",
  "serp_formation_collect",
  "formation_conclusion",
  "silo_consolidation",
  "silo_article_withdrawal",
  "silo_declared_plan_apply",
  "article_dna_write",
] as const;
export type ReworkOperationKind = (typeof REWORK_OPERATION_KINDS)[number];

/** O nome da operação como a tela e o "Histórico do grupo" mostram. */
export const REWORK_OPERATION_LABELS: Record<ReworkOperationKind, string> = {
  article_improvement_prepare: "Buscar keywords (melhoria dos publicados e Assuntos)",
  serp_formation_collect: "Coleta paga da SERP do artigo",
  formation_conclusion: "Concluir formação",
  silo_consolidation: "Fechamento do Silo",
  silo_article_withdrawal: "Retirar artigo do Silo",
  silo_declared_plan_apply: "Aplicar o plano declarado ao Silo",
  article_dna_write: "Gravar ArticleDNA",
};

export const REWORK_VERDICTS = ["fresh", "same_inputs_reuse", "same_refusal", "contradicts_declared", "parallel_path"] as const;
export type ReworkVerdict = (typeof REWORK_VERDICTS)[number];

/** O código da resposta 409 de cada veredito que recusa. */
export const REWORK_REFUSAL_CODES = {
  same_inputs_reuse: "REWORK_SAME_INPUTS",
  same_refusal: "REWORK_SAME_REFUSAL",
  contradicts_declared: "DECLARED_PLAN_CONTRADICTION",
  parallel_path: "REWORK_PARALLEL_PATH",
} as const;
export type ReworkRefusalCode = (typeof REWORK_REFUSAL_CODES)[keyof typeof REWORK_REFUSAL_CODES];
export const REWORK_REFUSAL_CODE_LIST: readonly ReworkRefusalCode[] = Object.values(REWORK_REFUSAL_CODES);

export type ReworkOutcome = "succeeded" | "refused" | "failed";

export type ReworkAttempt = {
  at: string;
  actorId: string;
  outcome: ReworkOutcome;
  /** O código da recusa ou do resultado (ex.: `SILO_NOT_READY_FOR_CONSOLIDATION`). */
  outcomeCode: string | null;
  /** Onde está o resultado (versão gravada, execução, parecer). */
  resultRef: string | null;
  costUsd: number | null;
  /** A frase da recusa ou do resultado, para dizer "a mesma recusa de <data>". */
  message?: string | null;
  /** "Refazer mesmo assim": o motivo dito pelo humano (D11). */
  overrideReason?: string | null;
};

export type ReworkLedgerPayload = {
  kind: ReworkOperationKind;
  fingerprint: string;
  groupId: string | null;
  inputsSummary: string;
  attempts: ReworkAttempt[];
};

/** O registro anterior que a guarda mostra. */
export type ReworkPrevious = {
  kind: ReworkOperationKind;
  fingerprint: string;
  at: string;
  actorId: string;
  outcome: ReworkOutcome;
  outcomeCode: string | null;
  resultRef: string | null;
  costUsd: number | null;
  message: string | null;
  /** Quantas vezes já foi feito com estes insumos (no registro). */
  attempts: number;
  /** De onde veio o registro: a linha do guarda ou o registro próprio da operação. */
  source: "operation_ledger" | "article_improvement_run";
  /** Resumo do resultado anterior para o aviso (ex.: "8 alvos, IA leu a lista, 0 consultas pagas"). */
  summary?: string | null;
};

/** O que contradiz o plano declarado ou foge do núcleo canônico. Vazio = nada. */
export type ReworkDeclaredCheck = {
  contradictions?: readonly string[];
  parallelPaths?: readonly string[];
};

/**
 * Como cada operação trata a repetição:
 * - `sameInputs`: `reuse` devolve o resultado anterior (a prévia não recusa);
 *   `block` recusa 409 sem motivo; `ignore` não olha (repetir é legítimo).
 * - `sameRefusal`: `block` recusa 409 sem motivo; `inform` só avisa.
 */
export type ReworkPolicy = { sameInputs: "reuse" | "block" | "ignore"; sameRefusal: "block" | "inform" };
export const DEFAULT_REWORK_POLICY: ReworkPolicy = { sameInputs: "reuse", sameRefusal: "block" };

export type ReworkAssessment = {
  kind: ReworkOperationKind;
  fingerprint: string;
  verdict: ReworkVerdict;
  previous: ReworkPrevious | null;
  /** As contradições ou o caminho paralelo, em frases. */
  reasons: string[];
  /** Recusa o pedido sem motivo de override. */
  blocks: boolean;
  /** "Refazer mesmo assim" com motivo é aceito (D11): nunca para o plano. */
  canOverride: boolean;
  /** O código 409 quando recusa; `null` quando roda. */
  code: ReworkRefusalCode | null;
  /** A frase do aviso, a mesma na tela, na rota e no MCP. */
  message: string;
};

export type ReworkOverride = { reason?: string | null } | null | undefined;

const text = (value: unknown): string | null => (typeof value === "string" && value.trim() ? value.trim() : null);
const isKind = (value: unknown): value is ReworkOperationKind => typeof value === "string" && (REWORK_OPERATION_KINDS as readonly string[]).includes(value);
const isOutcome = (value: unknown): value is ReworkOutcome => value === "succeeded" || value === "refused" || value === "failed";

/**
 * A impressão digital dos insumos: a mesma forma de todo hash da plataforma
 * (`contentHash(canonicalJson(...))`): ordem de chave não muda nada, `undefined`
 * some. Entram só os insumos que mudam o resultado — nunca hora, ator ou id
 * gerado no clique, senão todo pedido seria "novo".
 */
export async function operationFingerprint(kind: ReworkOperationKind, inputs: unknown): Promise<string> {
  return contentHash({ kind, inputs: inputs ?? null });
}

/** A chave da linha do guarda: mesmos insumos = mesma linha (a UNIQUE já existente). */
export function reworkLedgerSubjectId(kind: ReworkOperationKind, fingerprint: string): string {
  return `${kind}:${fingerprint}`;
}

/** Lê o payload de uma linha do guarda; formato estranho = `null` (nunca inventa). */
export function readReworkLedgerPayload(raw: unknown): ReworkLedgerPayload | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const record = raw as Record<string, unknown>;
  const kind = record.kind, fingerprint = text(record.fingerprint);
  if (!isKind(kind) || !fingerprint || !Array.isArray(record.attempts)) return null;
  const attempts: ReworkAttempt[] = [];
  for (const item of record.attempts) {
    if (!item || typeof item !== "object") continue;
    const attempt = item as Record<string, unknown>;
    const at = text(attempt.at), actorId = text(attempt.actorId);
    if (!at || !actorId || !isOutcome(attempt.outcome)) continue;
    attempts.push({
      at,
      actorId,
      outcome: attempt.outcome,
      outcomeCode: text(attempt.outcomeCode),
      resultRef: text(attempt.resultRef),
      costUsd: typeof attempt.costUsd === "number" && Number.isFinite(attempt.costUsd) ? attempt.costUsd : null,
      ...(text(attempt.message) ? { message: text(attempt.message) } : {}),
      ...(text(attempt.overrideReason) ? { overrideReason: text(attempt.overrideReason) } : {}),
    });
  }
  return { kind, fingerprint, groupId: text(record.groupId), inputsSummary: text(record.inputsSummary) ?? "", attempts };
}

/**
 * Acrescenta uma tentativa (as últimas 20 ficam). A identidade (`kind`,
 * `fingerprint`) é a da base: uma linha nunca muda de operação.
 */
export function appendReworkLedgerAttempt(
  current: unknown,
  base: { kind: ReworkOperationKind; fingerprint: string; groupId?: string | null; inputsSummary: string },
  attempt: ReworkAttempt,
): ReworkLedgerPayload {
  const anterior = readReworkLedgerPayload(current);
  const mesma = anterior && anterior.kind === base.kind && anterior.fingerprint === base.fingerprint ? anterior : null;
  const attempts = [...(mesma?.attempts ?? []), attempt].slice(-REWORK_LEDGER_ATTEMPTS_LIMIT);
  return {
    kind: base.kind,
    fingerprint: base.fingerprint,
    groupId: text(base.groupId) ?? mesma?.groupId ?? null,
    inputsSummary: base.inputsSummary.slice(0, 600),
    attempts,
  };
}

/**
 * A última tentativa que CONCLUIU algo (sucesso ou recusa). Falha transitória
 * (rede, provider fora) não é "a mesma recusa": tentar de novo é legítimo.
 */
export function reworkPreviousFromLedger(payload: ReworkLedgerPayload | null): ReworkPrevious | null {
  if (!payload) return null;
  const decisivas = payload.attempts.filter(attempt => attempt.outcome !== "failed");
  const ultima = decisivas[decisivas.length - 1];
  if (!ultima) return null;
  return {
    kind: payload.kind,
    fingerprint: payload.fingerprint,
    at: ultima.at,
    actorId: ultima.actorId,
    outcome: ultima.outcome,
    outcomeCode: ultima.outcomeCode,
    resultRef: ultima.resultRef,
    costUsd: ultima.costUsd,
    message: ultima.message ?? null,
    attempts: decisivas.length,
    source: "operation_ledger",
  };
}

/** "12/10 às 17:30", no fuso da operação (Brasília). Data ilegível = o texto cru. */
export function formatReworkWhen(iso: string): string {
  const instant = Date.parse(iso);
  if (!Number.isFinite(instant)) return iso;
  const partes = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" })
    .formatToParts(new Date(instant));
  const valor = (tipo: string) => partes.find(parte => parte.type === tipo)?.value ?? "";
  return `${valor("day")}/${valor("month")} às ${valor("hour")}:${valor("minute")}`;
}

/** A frase do aviso: a mesma para a tela, a rota (409) e o MCP. */
export function reworkNoticeMessage(input: { verdict: ReworkVerdict; previous: ReworkPrevious | null; reasons?: readonly string[]; canOverride?: boolean }): string {
  const quando = input.previous ? formatReworkWhen(input.previous.at) : null;
  const motivos = (input.reasons || []).filter(Boolean);
  switch (input.verdict) {
    case "contradicts_declared":
      return `Isto contradiz o plano declarado: ${motivos.join(" ") || "a principal ou o papel declarado mudaria."} Mude o plano no Minerador; não há “refazer mesmo assim”.`;
    case "parallel_path":
      return `Isto gravaria fora do caminho canônico: ${motivos.join(" ") || "a operação não passa pelo núcleo de sempre."} Use o caminho do plano (o mesmo da tela).`;
    case "same_refusal": {
      const recusa = input.previous?.message || input.previous?.outcomeCode || "a mesma recusa";
      return `A mesma recusa aconteceu em ${quando}: ${recusa.replace(/[.\s]+$/, "")}. Nada mudou desde então: mude o que a recusa pede antes de tentar de novo.`;
    }
    case "same_inputs_reuse": {
      const resumo = input.previous?.summary ? ` — ${input.previous.summary}` : "";
      return `Já feito com os mesmos insumos em ${quando}${resumo}.${input.canOverride === false ? "" : " Para refazer com os mesmos insumos, diga o motivo em “Refazer mesmo assim”."}`;
    }
    default:
      return "Nunca feito com estes insumos.";
  }
}

/**
 * O VEREDITO (§10.2). Precedência: o plano declarado vence tudo (não há
 * override), depois o caminho paralelo, depois a repetição. Sem registro
 * anterior com os mesmos insumos, `fresh`.
 */
export function assessRework(input: {
  kind: ReworkOperationKind;
  fingerprint: string;
  previous?: ReworkPrevious | null;
  declared?: ReworkDeclaredCheck | null;
  policy?: ReworkPolicy;
}): ReworkAssessment {
  const policy = input.policy ?? DEFAULT_REWORK_POLICY;
  const contradicoes = [...(input.declared?.contradictions || [])].filter(Boolean);
  const paralelos = [...(input.declared?.parallelPaths || [])].filter(Boolean);
  const previous = input.previous && input.previous.fingerprint === input.fingerprint && input.previous.kind === input.kind ? input.previous : null;
  const monta = (verdict: ReworkVerdict, reasons: string[], blocks: boolean, canOverride: boolean): ReworkAssessment => ({
    kind: input.kind,
    fingerprint: input.fingerprint,
    verdict,
    previous: verdict === "fresh" ? null : previous,
    reasons,
    blocks,
    canOverride,
    code: blocks ? REWORK_REFUSAL_CODES[verdict as Exclude<ReworkVerdict, "fresh">] : null,
    message: reworkNoticeMessage({ verdict, previous, reasons, canOverride }),
  });
  if (contradicoes.length) return monta("contradicts_declared", contradicoes, true, false);
  if (paralelos.length) return monta("parallel_path", paralelos, true, false);
  if (previous?.outcome === "refused") return monta("same_refusal", [], policy.sameRefusal === "block", true);
  if (previous?.outcome === "succeeded" && policy.sameInputs !== "ignore") return monta("same_inputs_reuse", [], policy.sameInputs === "block", true);
  return monta("fresh", [], false, false);
}

/** O motivo do override, limpo; `null` quando não serve (vazio ou curto demais). */
export function reworkOverrideReason(override: ReworkOverride): string | null {
  const reason = text(override?.reason);
  if (!reason || reason.length < REWORK_OVERRIDE_REASON_MIN) return null;
  return reason.slice(0, REWORK_OVERRIDE_REASON_MAX);
}

export type ReworkDecision =
  | { proceed: true; overridden: boolean; overrideReason: string | null }
  | { proceed: false; code: ReworkRefusalCode; message: string };

/**
 * A decisão de rodar: o veredito que recusa só passa com motivo, e só quando
 * o override é permitido (nunca para o plano declarado nem caminho paralelo).
 */
export function decideRework(assessment: ReworkAssessment, override?: ReworkOverride): ReworkDecision {
  const reason = reworkOverrideReason(override);
  if (!assessment.blocks) {
    // Motivo dado sem recusa não é override: só fica registrado quando refaz o que existia.
    return { proceed: true, overridden: Boolean(reason && assessment.verdict !== "fresh"), overrideReason: assessment.verdict !== "fresh" ? reason : null };
  }
  if (assessment.canOverride && reason) return { proceed: true, overridden: true, overrideReason: reason };
  return { proceed: false, code: assessment.code!, message: assessment.message };
}

/** A projeção leve que prévias e o MCP devolvem (`rework: { verdict, previous }`). */
export function reworkView(assessment: ReworkAssessment | null | undefined) {
  if (!assessment) return null;
  return {
    verdict: assessment.verdict,
    previous: assessment.previous,
    reasons: assessment.reasons,
    blocks: assessment.blocks,
    canOverride: assessment.canOverride,
    code: assessment.code,
    message: assessment.message,
  };
}
export type ReworkView = NonNullable<ReturnType<typeof reworkView>>;

/** Lê o `rework` de uma resposta (tela): formato estranho = `null`. */
export function readReworkView(raw: unknown): ReworkView | null {
  if (!raw || typeof raw !== "object") return null;
  const record = raw as Record<string, unknown>;
  if (typeof record.verdict !== "string" || !(REWORK_VERDICTS as readonly string[]).includes(record.verdict)) return null;
  return {
    verdict: record.verdict as ReworkVerdict,
    previous: record.previous && typeof record.previous === "object" ? record.previous as ReworkPrevious : null,
    reasons: Array.isArray(record.reasons) ? record.reasons.filter((item): item is string => typeof item === "string") : [],
    blocks: record.blocks === true,
    canOverride: record.canOverride === true,
    code: typeof record.code === "string" && (REWORK_REFUSAL_CODE_LIST as readonly string[]).includes(record.code) ? record.code as ReworkRefusalCode : null,
    message: typeof record.message === "string" ? record.message : "",
  };
}

/** A linha do "Histórico do grupo": uma por tentativa, a mais nova primeiro. */
export type ReworkHistoryEntry = {
  kind: ReworkOperationKind;
  label: string;
  fingerprint: string;
  groupId: string | null;
  inputsSummary: string;
  at: string;
  actorId: string;
  outcome: ReworkOutcome;
  outcomeCode: string | null;
  resultRef: string | null;
  costUsd: number | null;
  message: string | null;
  overrideReason: string | null;
};

/**
 * As tentativas das linhas do guarda como histórico (o formato do §10.1),
 * filtradas por grupo quando pedido. Linhas ilegíveis ficam de fora.
 */
export function reworkHistoryEntries(rawPayloads: readonly unknown[], options: { groupId?: string | null } = {}): ReworkHistoryEntry[] {
  const entries: ReworkHistoryEntry[] = [];
  for (const raw of rawPayloads) {
    const payload = readReworkLedgerPayload(raw);
    if (!payload) continue;
    if (options.groupId !== undefined && payload.groupId !== (options.groupId ?? null)) continue;
    for (const attempt of payload.attempts) {
      entries.push({
        kind: payload.kind,
        label: REWORK_OPERATION_LABELS[payload.kind],
        fingerprint: payload.fingerprint,
        groupId: payload.groupId,
        inputsSummary: payload.inputsSummary,
        at: attempt.at,
        actorId: attempt.actorId,
        outcome: attempt.outcome,
        outcomeCode: attempt.outcomeCode,
        resultRef: attempt.resultRef,
        costUsd: attempt.costUsd,
        message: attempt.message ?? null,
        overrideReason: attempt.overrideReason ?? null,
      });
    }
  }
  return entries.sort((left, right) => Date.parse(right.at) - Date.parse(left.at));
}
