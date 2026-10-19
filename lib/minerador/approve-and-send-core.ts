import type { ApprovalRequirement } from "./approved-package.ts";
import { approvalBlockerLabel, groupApprovalBlockers, summarizeApprovalBlockers, type ApprovalBlockerGroup } from "./approval-blockers.ts";
import { isKeywordPublished } from "./keyword-lifecycle.ts";
import { principalSubjectEntry, resolveKeywordSubject, type PrincipalSubjectStanding } from "./keyword-subject.ts";

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
  /**
   * 2026-10-14 (WifiConecta, azul): já no Arquiteto COM pacote aprovado mais
   * novo no Minerador — o envio atualiza o item recebido (as decisões do
   * Arquiteto ficam). Opcional: ausente = falso.
   */
  refreshInArquiteto?: boolean;
  missing: ApprovalRequirement[];
  reasons: string[];
  /**
   * 2026-10-18 · O ASSUNTO PELA PRINCIPAL (SDD `sdd-assunto-pela-principal-e-volume-2026-10-18.md` §6.2-b, F4):
   * a página publicada (ou a keyword que já carrega o Assunto do formato anterior) com volume 0 — medido 0 ou "sem
   * média no Google Ads" — vira o Assunto fixo do artigo ANTES de aprovar, nesta mesma confirmação. Título = o texto
   * da keyword (editável depois no painel); a nota antiga vira os detalhes. Opcional: ausente = nada muda no Assunto.
   */
  subjectFromVolume?: { title: string; details: string | null; legacy: boolean };
  /**
   * 2026-10-19 · a página de volume 0 que NÃO vira o Assunto agora, com o motivo: com o Assunto cadastrado ela deixaria
   * de poder ser aprovada (ex.: o Assunto do formato anterior com volume importado não confirmado). Fica como está —
   * nada pela metade (Assunto gravado e a aprovação recusada). Opcional: ausente = nada segurado.
   */
  subjectFromVolumeHeld?: string;
};

/** O começo da frase da linha segurada (a MESMA na tela e no MCP). */
export const APPROVE_AND_SEND_SUBJECT_HELD = "não vira o Assunto agora" as const;

/** A frase da prévia e do resultado para a linha que vira o Assunto (a MESMA na tela e no MCP). */
export const APPROVE_AND_SEND_SUBJECT_LINE = "vira o Assunto do artigo (volume 0)" as const;
export function approveAndSendSubjectSummary(count: number): string {
  const verbo = count === 1 ? "vira" : "viram";
  return String(count) + " " + verbo + " o Assunto do artigo (volume 0): o título nasce do texto da keyword (editável no painel do KeywordDNA); no Arquiteto a principal fica livre para uma com volume, por decisão sua na prévia. URL, slug e canonical não mudam.";
}

export type ApproveAndSendPreview = {
  send: boolean;
  lines: ApproveAndSendLine[];
  counts: { approveAndSend: number; sendOnly: number; approveOnly: number; unchanged: number; blocked: number; subjectFromVolume?: number };
  blockedGroups: ApprovalBlockerGroup[];
  blockedSummary: string;
  missingIds: string[];
  decisionHash: string;
};

/**
 * 2026-10-19 · `failed`: a gravação desta keyword não pôde ser concluída agora (erro do banco ou da rede). O `reason`
 * diz o que ficou gravado nela e o que não ficou; rodar o MESMO botão de novo continua de onde parou.
 */
export type ApproveAndSendOutcome =
  | "approved_and_sent" | "sent" | "approved" | "unchanged"
  | "approved_not_sent" | "not_sent" | "blocked" | "excluded" | "stale" | "failed";

export const APPROVE_AND_SEND_OUTCOMES: readonly ApproveAndSendOutcome[] = ["approved_and_sent", "sent", "approved", "unchanged", "approved_not_sent", "not_sent", "blocked", "excluded", "stale", "failed"];

/** A frase curta do erro, sem pilha nem credencial (o texto do driver, cortado). */
export function approveAndSendErrorText(error: unknown): string {
  const bruto = error instanceof Error ? error.message : typeof error === "object" && error && "message" in error ? String((error as { message: unknown }).message) : String(error ?? "");
  const texto = bruto.replace(/\s+/g, " ").trim().slice(0, 160);
  return texto || "erro sem mensagem";
}

/** As frases do resultado por keyword quando a gravação parou no meio (honestas: o que foi gravado e o que não foi). */
export const APPROVE_AND_SEND_RESUME = "Rode “Aprovar e enviar” de novo: continua de onde parou (o que já foi gravado não se repete)." as const;
export function approveAndSendSubjectFailedReason(motivo: string): string {
  return `Nada foi gravado nesta keyword: o Assunto (volume 0) não pôde ser gravado agora (${motivo}). ${APPROVE_AND_SEND_RESUME}`;
}
export function approveAndSendApproveFailedReason(motivo: string, subjectWritten: boolean): string {
  return `${subjectWritten ? "O Assunto (volume 0) FOI gravado; a aprovação não" : "A aprovação não foi gravada"} (${motivo}). ${APPROVE_AND_SEND_RESUME}`;
}
export function approveAndSendSendFailedReason(motivo: string, justApproved: boolean): string {
  return `${justApproved ? "A aprovação FOI gravada; o envio ao Arquiteto não" : "O envio ao Arquiteto não foi feito"} (${motivo}). ${APPROVE_AND_SEND_RESUME}`;
}

/** Marca o erro que aconteceu ANTES de qualquer gravação (a prévia refeita no aplicar): a rota pode dizer "nada foi gravado". */
export function markApproveAndSendNothingWritten<E>(error: E): E {
  if (error && typeof error === "object") (error as { approveAndSendNothingWritten?: boolean }).approveAndSendNothingWritten = true;
  return error;
}
export function approveAndSendNothingWritten(error: unknown): boolean {
  return Boolean(error && typeof error === "object" && (error as { approveAndSendNothingWritten?: boolean }).approveAndSendNothingWritten === true);
}

export type ApproveAndSendResultLine = { id: string; keyword: string; outcome: ApproveAndSendOutcome; reason: string | null };

export type ApproveAndSendResult = {
  send: boolean;
  results: ApproveAndSendResultLine[];
  counts: Record<ApproveAndSendOutcome, number>;
  readbackConfirmed: boolean;
  decisionHash: string;
  /** O que o envio fez além das keywords (ex.: "Silo do plano Azul confirmado; 6 keywords entraram nele"). */
  notices: string[];
  /** 2026-10-18 · as keywords que viraram o Assunto do artigo pelo volume 0 nesta confirmação (relidas). */
  subjectFromVolumeIds?: string[];
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
  previewSend: (ids: readonly string[]) => Promise<{ eligibleKeywordIds: string[]; existingKeywordIds: string[]; refused: Array<{ keywordId: string; reason: string }>;
    /** Já no Arquiteto com pacote aprovado novo: o envio atualiza o item recebido. */
    refreshKeywordIds?: string[] }>;
  send: (ids: readonly string[]) => Promise<{ importedKeywordIds: readonly string[]; refused?: ReadonlyArray<{ keywordId: string; reason: string }>;
    /** As já recebidas que ganharam o pacote novo (decisões do Arquiteto preservadas). */
    refreshedKeywordIds?: readonly string[];
    /** Item 1: o Silo do plano preparado no envio (aditivo). */
    declaredPlanSilos?: ReadonlyArray<{ message: string; pendingConfirmation?: string | null }> }>;
  hash: (value: unknown) => string;
  /**
   * 2026-10-18 · F4 da SDD do Assunto pela principal: a régua do volume (`principalSubjectStanding`) e o gravador do
   * Assunto — o MESMO núcleo do card ("Keyword (sem Silo)", `importDeclaredPlanWithCore`), com releitura. Ausente = o
   * comportamento de antes (nenhum Assunto é gravado por aqui).
   */
  subjectByVolume?: {
    standing: (row: Row) => PrincipalSubjectStanding;
    write: (rows: readonly Row[]) => Promise<Array<{ id: string; outcome: "declared" | "unchanged" | "failed"; reason: string | null }>>;
  };
};

const PUBLICADA = "publicad";
const isPublishedBlock = (entry: ApproveAndSendEntry) => entry.blockers.some(blocker => blocker.toLocaleLowerCase("pt-BR").includes(PUBLICADA));
const missingOf = (entry: ApproveAndSendEntry): ApprovalRequirement[] =>
  Array.isArray(entry.readiness?.missing) ? (entry.readiness!.missing as unknown[]).filter((item): item is ApprovalRequirement => typeof item === "string") : [];

export const APPROVE_AND_SEND_MISSING_REASON = "A keyword não existe mais nesta marca (excluída ou de outra marca).";
/** O aviso do resultado quando o envio atualizou itens já recebidos (2026-10-14). */
export function approveAndSendRefreshNotice(count: number): string {
  return `${count} keyword(s) que já estavam no Arquiteto receberam o pacote aprovado novo do Minerador (Assunto, plano e DNA). As decisões do Arquiteto (Silo, artigo, Assunto ancorado) ficaram como estavam; artigo já formado não foi reescrito.`;
}

export const APPROVE_AND_SEND_STALE_REASON ="A keyword mudou entre a prévia e a gravação; nada foi gravado nela. Gere a prévia de novo.";

/**
 * Quem vira o Assunto pelo volume 0 (§6.1, alcance): a página publicada de ARTIGO (o Vínculo) ou a keyword que já
 * carrega um Assunto do formato anterior, sem o Assunto cadastrado (`entry`) e sem plano. Página de Silo fica fora.
 * A keyword solta comum NUNCA vira Assunto sozinha: só pelo cadastro do dono.
 */
export function subjectFromVolumeOf(row: ApproveAndSendRow, standing: PrincipalSubjectStanding): ApproveAndSendLine["subjectFromVolume"] | null {
  if (standing.volumeState !== "zero" || standing.outOfScope) return null;
  const assunto = resolveKeywordSubject(row.analise_semantica);
  if (assunto.entry || assunto.plan) return null;
  if (!assunto.declared && !isKeywordPublished({ status: row.status, semantic: row.analise_semantica })) return null;
  const entry = principalSubjectEntry(row.keyword, assunto);
  return { title: entry.title, details: entry.details ?? null, legacy: assunto.declared };
}

/** A linha como ficaria com o Assunto do cadastro (`entry`), só para a prévia da decisão — nada é gravado. */
function withSimulatedSubjectEntry<Row extends ApproveAndSendRow>(row: Row, title: string): Row {
  const semantic = { ...(row.analise_semantica ?? {}) };
  const atual = semantic.keyword_subject && typeof semantic.keyword_subject === "object" && !Array.isArray(semantic.keyword_subject) ? semantic.keyword_subject as Record<string, unknown> : { note: null, destinationUrl: null, destinationCheck: null };
  semantic.keyword_subject = { ...atual, declared: true, entry: { title, source: "cadastro" } };
  return { ...row, analise_semantica: semantic };
}

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
  const atualizam = new Set("refreshKeywordIds" in envio ? envio.refreshKeywordIds ?? [] : []);
  const recusaDoEnvio = new Map(envio.refused.map(item => [item.keywordId, item.reason] as const));

  const assuntoDe = new Map<string, NonNullable<ApproveAndSendLine["subjectFromVolume"]>>();
  const seguradas = new Map<string, string>();
  if (deps.subjectByVolume) for (const row of rows) {
    const virar = subjectFromVolumeOf(row, deps.subjectByVolume.standing(row));
    if (!virar) continue;
    // 2026-10-19 · nada pela metade: só vira o Assunto quem continua aprovável com ele (a mesma prévia da decisão).
    const depois = deps.entries([withSimulatedSubjectEntry(row, virar.title)])[0];
    if (entryById.get(row.id)?.readiness?.ok !== false && depois && depois.readiness && !depois.readiness.ok) {
      seguradas.set(row.id, `${APPROVE_AND_SEND_SUBJECT_HELD}: com o Assunto cadastrado ela deixaria de poder ser aprovada (${depois.readiness.reason || "falta requisito"}). Fica como está; meça no Volume e rode de novo.`);
      continue;
    }
    assuntoDe.set(row.id, virar);
  }
  const lines: ApproveAndSendLine[] = rows.map(row => {
    const linha = lineOf(row);
    const segurada = seguradas.get(row.id);
    return segurada ? { ...linha, subjectFromVolumeHeld: segurada } : linha;
  });
  function lineOf(row: Row): ApproveAndSendLine {
    const entry = entryById.get(row.id)!;
    const virar = assuntoDe.get(row.id);
    // 2026-10-18 · o Assunto entra no pacote: a linha já aprovada (ou a publicada) volta a ser aprovada nesta confirmação.
    if (virar && (entry.outcome === "unchanged" || (entry.outcome === "blocked" && isPublishedBlock(entry) && !missingOf(entry).length))) {
      return { id: row.id, keyword: row.keyword, currentStatus: entry.currentStatus, alreadyInArquiteto: existentes.has(row.id), ...(existentes.has(row.id) ? { refreshInArquiteto: true } : {}), missing: [], reasons: [], subjectFromVolume: virar, action: input.send ? "approve_and_send" as const : "approve_only" as const };
    }
    const base = { id: row.id, keyword: row.keyword, currentStatus: entry.currentStatus, alreadyInArquiteto: existentes.has(row.id), ...(existentes.has(row.id) && atualizam.has(row.id) ? { refreshInArquiteto: true } : {}), missing: [] as ApprovalRequirement[], reasons: [] as string[] };
    if (entry.outcome === "ready") return { ...base, ...(virar ? { subjectFromVolume: virar } : {}), action: input.send ? "approve_and_send" as const : "approve_only" as const };
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
  }
  const missingLines: ApproveAndSendLine[] = missingIds.map(id => ({ id, keyword: id, currentStatus: "desconhecido", action: "blocked", alreadyInArquiteto: false, missing: [], reasons: [APPROVE_AND_SEND_MISSING_REASON] }));
  const todas = [...lines, ...missingLines];
  const bloqueadas = todas.filter(line => line.action === "blocked");
  const blockedGroups = groupApprovalBlockers(bloqueadas.map(line => ({ keyword: line.keyword, missing: line.missing, reasons: line.reasons })));
  const conta = (action: ApproveAndSendAction) => todas.filter(line => line.action === action).length;
  const decisionHash = deps.hash({
    contract: "approve-and-send@1", brandId: input.brandId, actorId: input.actorId, send: input.send,
    rows: rows.map(row => ({ id: row.id, keyword: row.keyword, status: row.status, semantic: row.analise_semantica })),
    lines: todas.map(line => ({ id: line.id, action: line.action, reasons: line.reasons, missing: line.missing, alreadyInArquiteto: line.alreadyInArquiteto, ...(line.refreshInArquiteto ? { refreshInArquiteto: true } : {}), ...(line.subjectFromVolume ? { subjectFromVolume: line.subjectFromVolume } : {}), ...(line.subjectFromVolumeHeld ? { subjectFromVolumeHeld: line.subjectFromVolumeHeld } : {}) })),
  });
  return {
    send: input.send,
    lines: todas,
    counts: { approveAndSend: conta("approve_and_send"), sendOnly: conta("send_only"), approveOnly: conta("approve_only"), unchanged: conta("unchanged"), blocked: conta("blocked"), ...(assuntoDe.size ? { subjectFromVolume: todas.filter(line => line.subjectFromVolume && line.action !== "blocked").length } : {}) },
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
  // A prévia refeita só lê: erro aqui = nada foi gravado (a rota pode dizer isso).
  const previa = await previewApproveAndSend(input, deps).catch((error: unknown) => { throw markApproveAndSendNothingWritten(error); });
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

  // 0 · 2026-10-18 · o Assunto pelo volume 0 (F4): gravado ANTES de aprovar, pelo núcleo do cadastro, com releitura.
  const aAprovar = new Set(previa.lines.filter(line => (line.action === "approve_and_send" || line.action === "approve_only") && !excluidas.has(line.id)).map(line => line.id));
  let linhasLidas: Row[] = previa.rows;
  let entradas: Entry[] = previa.entries;
  const viraram = new Set<string>();
  const virar = previa.lines.filter(line => line.subjectFromVolume && aAprovar.has(line.id)).map(line => line.id);
  /*
   * 2026-10-19 · a gravação nunca para no meio em silêncio: cada etapa trata o erro POR KEYWORD (o que foi gravado e o
   * que não foi), e a próxima etapa segue com as que avançaram. Rodar o mesmo botão de novo continua: a keyword que já
   * ganhou o Assunto sai da lista "vira o Assunto" (já tem) e entra só na reaprovação; a já aprovada só é enviada.
   */
  if (virar.length && deps.subjectByVolume) {
    const alvo = previa.rows.filter(row => virar.includes(row.id));
    let gravados: Awaited<ReturnType<NonNullable<ApproveAndSendDeps<Row, Entry>["subjectByVolume"]>["write"]>>;
    try {
      gravados = await deps.subjectByVolume.write(alvo);
    } catch (error) {
      // O gravador do servidor já trata o erro por keyword; aqui é a rede de segurança (ninguém confirmado = nada dito como gravado).
      const motivo = approveAndSendErrorText(error);
      gravados = alvo.map(row => ({ id: row.id, outcome: "failed" as const, reason: `não confirmado (${motivo}); releia o Minerador para ver se o Assunto entrou` }));
    }
    const tratados = new Set<string>();
    for (const item of gravados) {
      tratados.add(item.id);
      if (item.outcome === "failed") { aAprovar.delete(item.id); registrar(item.id, "failed", approveAndSendSubjectFailedReason(item.reason || "sem confirmação")); }
      else viraram.add(item.id);
    }
    for (const id of virar) if (!tratados.has(id)) { aAprovar.delete(id); registrar(id, "failed", approveAndSendSubjectFailedReason("o gravador não respondeu por ela")); }
    if (viraram.size) {
      try {
        const relidas = await deps.readRows([...viraram]);
        const porId = new Map(relidas.rows.map(row => [row.id, row] as const));
        linhasLidas = previa.rows.map(row => porId.get(row.id) ?? row);
        const novaPorId = new Map(deps.entries(relidas.rows).map(entry => [entry.id, entry] as const));
        entradas = previa.entries.map(entry => novaPorId.get(entry.id) ?? entry);
      } catch (error) {
        const motivo = approveAndSendErrorText(error);
        for (const id of viraram) { aAprovar.delete(id); registrar(id, "failed", approveAndSendApproveFailedReason(`a releitura depois do Assunto falhou: ${motivo}`, true)); }
      }
    }
  }

  // 1 · Aprovar as marcadas (núcleo de sempre, compare-and-swap e releitura por linha), uma keyword por chamada.
  const aprovadas = new Set<string>();
  if (aAprovar.size) {
    const entradaPorId = new Map(entradas.map(entry => [entry.id, entry] as const));
    for (const row of linhasLidas.filter(item => aAprovar.has(item.id))) {
      const entry = entradaPorId.get(row.id);
      if (!entry) { registrar(row.id, "failed", approveAndSendApproveFailedReason("a prévia da decisão não achou a keyword", viraram.has(row.id))); continue; }
      let resultados: Awaited<ReturnType<ApproveAndSendDeps<Row, Entry>["approve"]>>;
      try {
        resultados = await deps.approve([row], [entry]);
      } catch (error) {
        registrar(row.id, "failed", approveAndSendApproveFailedReason(approveAndSendErrorText(error), viraram.has(row.id)));
        continue;
      }
      const resultado = resultados.find(item => item.id === row.id);
      if (!resultado) { registrar(row.id, "failed", approveAndSendApproveFailedReason("sem resposta do gravador", viraram.has(row.id))); continue; }
      if (resultado.outcome === "applied" || resultado.outcome === "unchanged") {
        aprovadas.add(resultado.id);
        if (!input.send) registrar(resultado.id, resultado.outcome === "applied" ? "approved" : "unchanged");
      } else {
        registrar(resultado.id, resultado.outcome === "stale" ? "stale" : "blocked", resultado.outcome === "stale" ? (viraram.has(resultado.id) ? approveAndSendApproveFailedReason("a keyword mudou entre a prévia e a gravação", true) : APPROVE_AND_SEND_STALE_REASON) : resultado.reason || null);
      }
    }
  }

  // 2 · Enviar as que ficaram aprovadas + as que já estavam (envio parcial: recusa por item).
  if (input.send) {
    const soEnviar = previa.lines.filter(line => line.action === "send_only" && !excluidas.has(line.id)).map(line => line.id);
    const aEnviar = [...aprovadas, ...soEnviar];
    if (aEnviar.length) {
      try {
        const envio = await deps.send(aEnviar);
        if (envio.refreshedKeywordIds?.length) notices.push(approveAndSendRefreshNotice(envio.refreshedKeywordIds.length));
        for (const silo of envio.declaredPlanSilos ?? []) notices.push([silo.message, silo.pendingConfirmation].filter(Boolean).join(" "));
        const enviadas = new Set(envio.importedKeywordIds);
        const recusas = new Map((envio.refused ?? []).map(item => [item.keywordId, item.reason] as const));
        for (const id of aEnviar) {
          const acabouDeAprovar = aprovadas.has(id);
          if (enviadas.has(id)) registrar(id, acabouDeAprovar ? "approved_and_sent" : "sent");
          else registrar(id, acabouDeAprovar ? "approved_not_sent" : "not_sent", recusas.get(id) || "O envio ao Arquiteto não aceitou esta keyword.");
        }
      } catch (error) {
        const motivo = approveAndSendErrorText(error);
        for (const id of aEnviar) registrar(id, aprovadas.has(id) ? "approved_not_sent" : "not_sent", approveAndSendSendFailedReason(motivo, aprovadas.has(id)));
      }
    }
  }

  // 3 · Releitura: o status gravado é o que a tela vai mostrar.
  const conferir = [...aprovadas];
  let readbackConfirmed = true;
  if (conferir.length) {
    try {
      const relidas = await deps.readRows(conferir);
      const porId = new Map(relidas.rows.map(row => [row.id, row] as const));
      for (const id of conferir) {
        const status = (porId.get(id)?.status || "").toLocaleLowerCase("pt-BR");
        if (status !== "aprovado" && status !== "publicado") {
          readbackConfirmed = false;
          registrar(id, "stale", "A releitura não confirmou a aprovação desta keyword.");
        }
      }
    } catch (error) {
      readbackConfirmed = false;
      notices.push(`A releitura final falhou (${approveAndSendErrorText(error)}): recarregue o Minerador para conferir o status gravado.`);
    }
  }
  if ([...results.values()].some(line => line.outcome === "stale" || line.outcome === "failed")) readbackConfirmed = false;

  const ordem = previa.lines.map(line => line.id);
  const lista = ordem.flatMap(id => results.has(id) ? [results.get(id)!] : []);
  const counts = Object.fromEntries(APPROVE_AND_SEND_OUTCOMES
    .map(outcome => [outcome, lista.filter(line => line.outcome === outcome).length])) as Record<ApproveAndSendOutcome, number>;
  if (viraram.size) notices.unshift(approveAndSendSubjectSummary(viraram.size));
  return { send: input.send, results: lista, counts, readbackConfirmed, decisionHash: previa.decisionHash, notices, ...(viraram.size ? { subjectFromVolumeIds: [...viraram] } : {}) };
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
  if (c.failed) partes.push(`${c.failed} não concluída(s) agora (veja em cada uma o que foi gravado; rode de novo para continuar)`);
  return partes.length ? partes.join(" · ") : "Nada a fazer.";
}
