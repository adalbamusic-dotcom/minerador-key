import type { ApprovalRequirement } from "./approved-package.ts";
import { approvalBlockerLabel, groupApprovalBlockers, summarizeApprovalBlockers, type ApprovalBlockerGroup } from "./approval-blockers.ts";

/**
 * "APROVAR E ENVIAR AO ARQUITETO" — UMA DECISÃO, COM PRÉVIA E RECUSA POR ITEM
 * (SDD `docs/compartilhado/sdd-acelerar-fluxo-do-plano-2026-10-13.md`, item 2).
 *
 * Orquestração pura sobre os núcleos de sempre, injetados (`deps`): a prévia
 * da decisão (`keywordDecisionEntries`), a aprovação (`applyKeywordDecisionEntries`
 * — a MESMA do MCP `decide_keywords`, com compare-and-swap e releitura) e o
 * envio (`createMineradorArquitetoHandoff` em modo parcial). Um encadeamento
 * só: a conversão do Assunto e a reaprovação do cadastro usam os mesmos núcleos.
 *
 * - prévia: três grupos — "aprovar e enviar", "já aprovadas, só enviar" e
 *   "não podem ir", cada uma com o motivo; o hash da prévia cobre o estado lido;
 * - aplicar: a mesma prévia de novo (hash diferente = recusa, nada gravado),
 *   aprova as marcadas, envia as que ficaram aprovadas e devolve o desfecho por
 *   keyword, depois da releitura das linhas.
 */

export type ApproveAndSendAction = "approve_and_send" | "send_only" | "approve_only" | "unchanged" | "blocked";

export type ApproveAndSendLine = {
  id: string;
  keyword: string;
  currentStatus: string;
  action: ApproveAndSendAction;
  /** Já recebida pelo Arquiteto: reenviar só atualiza o pacote se ele mudou. */
  alreadyInArquiteto: boolean;
  missing: ApprovalRequirement[];
  reasons: string[];
};

export type ApproveAndSendPreview = {
  send: boolean;
  lines: ApproveAndSendLine[];
  counts: { approveAndSend: number; sendOnly: number; approveOnly: number; unchanged: number; blocked: number };
  blockedGroups: ApprovalBlockerGroup[];
  blockedSummary: string;
  missingIds: string[];
  decisionHash: string;
};

export type ApproveAndSendOutcome =
  | "approved_and_sent" | "sent" | "approved" | "unchanged"
  | "approved_not_sent" | "not_sent" | "blocked" | "excluded" | "stale";

export type ApproveAndSendResultLine = { id: string; keyword: string; outcome: ApproveAndSendOutcome; reason: string | null };

export type ApproveAndSendResult = {
  send: boolean;
  results: ApproveAndSendResultLine[];
  counts: Record<ApproveAndSendOutcome, number>;
  readbackConfirmed: boolean;
  decisionHash: string;
  /** O que o envio fez além das keywords (ex.: "Silo do plano Azul confirmado; 6 keywords entraram nele"). */
  notices: string[];
};

/** O que a orquestração lê de cada keyword (o mesmo `DecisionKeywordRow` do servidor). */
export type ApproveAndSendRow = { id: string; keyword: string; status: string | null; analise_semantica: Record<string, unknown> | null };

/** O que ela lê da prévia da decisão (o mesmo `KeywordDecisionEntry`). */
export type ApproveAndSendEntry = {
  id: string;
  currentStatus: string;
  outcome: "unchanged" | "blocked" | "ready";
  blockers: string[];
  readiness: { ok: boolean; missing: unknown; reason: string | null } | null;
};

export type ApproveAndSendDeps<Row extends ApproveAndSendRow, Entry extends ApproveAndSendEntry> = {
  readRows: (ids: readonly string[]) => Promise<{ rows: Row[]; missingIds: string[] }>;
  entries: (rows: readonly Row[]) => Entry[];
  approve: (rows: readonly Row[], entries: readonly Entry[]) => Promise<Array<{ id: string; outcome: "applied" | "unchanged" | "blocked" | "stale"; reason?: string }>>;
  /** Só leitura: quais o envio parcial aceitaria, quais já estão lá e quais ficam fora. */
  previewSend: (ids: readonly string[]) => Promise<{ eligibleKeywordIds: string[]; existingKeywordIds: string[]; refused: Array<{ keywordId: string; reason: string }> }>;
  send: (ids: readonly string[]) => Promise<{ importedKeywordIds: readonly string[]; refused?: ReadonlyArray<{ keywordId: string; reason: string }>;
    /** Item 1: o Silo do plano preparado no envio (aditivo). */
    declaredPlanSilos?: ReadonlyArray<{ message: string; pendingConfirmation?: string | null }> }>;
  hash: (value: unknown) => string;
};

const PUBLICADA = "publicad";
const isPublishedBlock = (entry: ApproveAndSendEntry) => entry.blockers.some(blocker => blocker.toLocaleLowerCase("pt-BR").includes(PUBLICADA));
const missingOf = (entry: ApproveAndSendEntry): ApprovalRequirement[] =>
  Array.isArray(entry.readiness?.missing) ? (entry.readiness!.missing as unknown[]).filter((item): item is ApprovalRequirement => typeof item === "string") : [];

export const APPROVE_AND_SEND_MISSING_REASON = "A keyword não existe mais nesta marca (excluída ou de outra marca).";
export const APPROVE_AND_SEND_STALE_REASON = "A keyword mudou entre a prévia e a gravação; nada foi gravado nela. Gere a prévia de novo.";

export async function previewApproveAndSend<Row extends ApproveAndSendRow, Entry extends ApproveAndSendEntry>(
  input: { brandId: string; actorId: string; keywordIds: readonly string[]; send: boolean },
  deps: ApproveAndSendDeps<Row, Entry>,
): Promise<ApproveAndSendPreview & { rows: Row[]; entries: Entry[] }> {
  const ids = [...new Set(input.keywordIds)];
  const { rows, missingIds } = await deps.readRows(ids);
  const entries = deps.entries(rows);
  const entryById = new Map(entries.map(entry => [entry.id, entry]));

  // Quem já está aprovada (ou é publicada) só precisa do envio: o portão do envio diz se vai.
  const candidatasAoEnvio = input.send
    ? entries.filter(entry => entry.outcome === "unchanged" || (entry.outcome === "blocked" && isPublishedBlock(entry))).map(entry => entry.id)
    : [];
  const envio = candidatasAoEnvio.length ? await deps.previewSend(candidatasAoEnvio) : { eligibleKeywordIds: [], existingKeywordIds: [], refused: [] };
  const elegiveis = new Set(envio.eligibleKeywordIds);
  const existentes = new Set(envio.existingKeywordIds);
  const recusaDoEnvio = new Map(envio.refused.map(item => [item.keywordId, item.reason] as const));

  const lines: ApproveAndSendLine[] = rows.map(row => {
    const entry = entryById.get(row.id)!;
    const base = { id: row.id, keyword: row.keyword, currentStatus: entry.currentStatus, alreadyInArquiteto: existentes.has(row.id), missing: [] as ApprovalRequirement[], reasons: [] as string[] };
    if (entry.outcome === "ready") return { ...base, action: input.send ? "approve_and_send" as const : "approve_only" as const };
    if (entry.outcome === "unchanged") {
      if (!input.send) return { ...base, action: "unchanged" as const };
      if (elegiveis.has(row.id)) return { ...base, action: "send_only" as const };
      return { ...base, action: "blocked" as const, reasons: [recusaDoEnvio.get(row.id) || "O envio ao Arquiteto recusou esta keyword."] };
    }
    if (input.send && isPublishedBlock(entry) && elegiveis.has(row.id)) return { ...base, action: "send_only" as const };
    const missing = missingOf(entry);
    const reasons = isPublishedBlock(entry)
      ? ["publicada (protegida): não muda de status", ...(recusaDoEnvio.has(row.id) ? [recusaDoEnvio.get(row.id)!] : [])]
      : missing.length ? [] : entry.blockers;
    return { ...base, action: "blocked" as const, missing, reasons };
  });
  const missingLines: ApproveAndSendLine[] = missingIds.map(id => ({ id, keyword: id, currentStatus: "desconhecido", action: "blocked", alreadyInArquiteto: false, missing: [], reasons: [APPROVE_AND_SEND_MISSING_REASON] }));
  const todas = [...lines, ...missingLines];
  const bloqueadas = todas.filter(line => line.action === "blocked");
  const blockedGroups = groupApprovalBlockers(bloqueadas.map(line => ({ keyword: line.keyword, missing: line.missing, reasons: line.reasons })));
  const conta = (action: ApproveAndSendAction) => todas.filter(line => line.action === action).length;
  const decisionHash = deps.hash({
    contract: "approve-and-send@1", brandId: input.brandId, actorId: input.actorId, send: input.send,
    rows: rows.map(row => ({ id: row.id, keyword: row.keyword, status: row.status, semantic: row.analise_semantica })),
    lines: todas.map(line => ({ id: line.id, action: line.action, reasons: line.reasons, missing: line.missing, alreadyInArquiteto: line.alreadyInArquiteto })),
  });
  return {
    send: input.send,
    lines: todas,
    counts: { approveAndSend: conta("approve_and_send"), sendOnly: conta("send_only"), approveOnly: conta("approve_only"), unchanged: conta("unchanged"), blocked: conta("blocked") },
    blockedGroups,
    blockedSummary: summarizeApprovalBlockers(blockedGroups),
    missingIds,
    decisionHash,
    rows,
    entries,
  };
}

export class ApproveAndSendStaleError extends Error {
  readonly code = "APPROVE_AND_SEND_STALE";
  constructor() { super("O estado das keywords mudou desde a prévia. Gere uma nova prévia antes de aplicar; nada foi gravado."); }
}

export async function applyApproveAndSend<Row extends ApproveAndSendRow, Entry extends ApproveAndSendEntry>(
  input: { brandId: string; actorId: string; keywordIds: readonly string[]; send: boolean; decisionHash: string; excludedIds?: readonly string[] },
  deps: ApproveAndSendDeps<Row, Entry>,
): Promise<ApproveAndSendResult> {
  const previa = await previewApproveAndSend(input, deps);
  if (previa.decisionHash !== input.decisionHash) throw new ApproveAndSendStaleError();
  const excluidas = new Set(input.excludedIds ?? []);
  const results = new Map<string, ApproveAndSendResultLine>();
  const notices: string[] = [];
  const nome = new Map(previa.lines.map(line => [line.id, line.keyword] as const));
  const registrar = (id: string, outcome: ApproveAndSendOutcome, reason: string | null = null) => results.set(id, { id, keyword: nome.get(id) || id, outcome, reason });

  for (const line of previa.lines) {
    if (line.action === "blocked") registrar(line.id, "blocked", [...line.missing.map(approvalBlockerLabel), ...line.reasons].join(" · ") || null);
    else if (excluidas.has(line.id)) registrar(line.id, "excluded", "Desmarcada na prévia: nada foi feito nela.");
    else if (line.action === "unchanged") registrar(line.id, "unchanged");
  }

  // 1 · Aprovar as marcadas (núcleo de sempre, compare-and-swap e releitura por linha).
  const aAprovar = new Set(previa.lines.filter(line => (line.action === "approve_and_send" || line.action === "approve_only") && !excluidas.has(line.id)).map(line => line.id));
  const aprovadas = new Set<string>();
  if (aAprovar.size) {
    const rows = previa.rows.filter(row => aAprovar.has(row.id));
    const entries = previa.entries.filter(entry => aAprovar.has(entry.id));
    for (const resultado of await deps.approve(rows, entries)) {
      if (resultado.outcome === "applied" || resultado.outcome === "unchanged") {
        aprovadas.add(resultado.id);
        if (!input.send) registrar(resultado.id, resultado.outcome === "applied" ? "approved" : "unchanged");
      } else {
        registrar(resultado.id, resultado.outcome === "stale" ? "stale" : "blocked", resultado.outcome === "stale" ? APPROVE_AND_SEND_STALE_REASON : resultado.reason || null);
      }
    }
  }

  // 2 · Enviar as que ficaram aprovadas + as que já estavam (envio parcial: recusa por item).
  if (input.send) {
    const soEnviar = previa.lines.filter(line => line.action === "send_only" && !excluidas.has(line.id)).map(line => line.id);
    const aEnviar = [...aprovadas, ...soEnviar];
    if (aEnviar.length) {
      const envio = await deps.send(aEnviar);
      for (const silo of envio.declaredPlanSilos ?? []) notices.push([silo.message, silo.pendingConfirmation].filter(Boolean).join(" "));
      const enviadas = new Set(envio.importedKeywordIds);
      const recusas = new Map((envio.refused ?? []).map(item => [item.keywordId, item.reason] as const));
      for (const id of aEnviar) {
        const acabouDeAprovar = aprovadas.has(id);
        if (enviadas.has(id)) registrar(id, acabouDeAprovar ? "approved_and_sent" : "sent");
        else registrar(id, acabouDeAprovar ? "approved_not_sent" : "not_sent", recusas.get(id) || "O envio ao Arquiteto não aceitou esta keyword.");
      }
    }
  }

  // 3 · Releitura: o status gravado é o que a tela vai mostrar.
  const conferir = [...aprovadas];
  let readbackConfirmed = true;
  if (conferir.length) {
    const relidas = await deps.readRows(conferir);
    const porId = new Map(relidas.rows.map(row => [row.id, row] as const));
    for (const id of conferir) {
      const status = (porId.get(id)?.status || "").toLocaleLowerCase("pt-BR");
      if (status !== "aprovado" && status !== "publicado") {
        readbackConfirmed = false;
        registrar(id, "stale", "A releitura não confirmou a aprovação desta keyword.");
      }
    }
  }
  if ([...results.values()].some(line => line.outcome === "stale")) readbackConfirmed = false;

  const ordem = previa.lines.map(line => line.id);
  const lista = ordem.flatMap(id => results.has(id) ? [results.get(id)!] : []);
  const counts = Object.fromEntries((["approved_and_sent", "sent", "approved", "unchanged", "approved_not_sent", "not_sent", "blocked", "excluded", "stale"] as const)
    .map(outcome => [outcome, lista.filter(line => line.outcome === outcome).length])) as Record<ApproveAndSendOutcome, number>;
  return { send: input.send, results: lista, counts, readbackConfirmed, decisionHash: previa.decisionHash, notices };
}

/** A frase do resultado, em português simples. */
export function describeApproveAndSendResult(result: Pick<ApproveAndSendResult, "counts" | "send">): string {
  const c = result.counts;
  const partes: string[] = [];
  if (result.send) {
    if (c.approved_and_sent) partes.push(`${c.approved_and_sent} aprovada(s) e enviada(s)`);
    if (c.sent) partes.push(`${c.sent} já aprovada(s), enviada(s)`);
    if (c.approved_not_sent) partes.push(`${c.approved_not_sent} aprovada(s) mas não enviada(s)`);
    if (c.not_sent) partes.push(`${c.not_sent} não enviada(s)`);
  } else {
    if (c.approved) partes.push(`${c.approved} aprovada(s)`);
    if (c.unchanged) partes.push(`${c.unchanged} já estava(m) aprovada(s)`);
  }
  if (c.blocked) partes.push(`${c.blocked} não puderam ir`);
  if (c.excluded) partes.push(`${c.excluded} desmarcada(s) por você`);
  if (c.stale) partes.push(`${c.stale} mudaram no meio (nada gravado nelas)`);
  return partes.length ? partes.join(" · ") : "Nada a fazer.";
}
