import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { hasKeywordApprovalRecord, normalizeKeyword } from "./keyword-import-core.ts";
import { isKeywordSubjectActorId, resolveKeywordSubject } from "./keyword-subject.ts";

/**
 * PESQUISA POR ASSUNTO — IMPORT AO PROCESSADOR (SDD 2026-09-24, F1b.7).
 *
 * As candidatas da Pesquisa por Assunto vivem só no navegador (F1b.5). Este
 * núcleo leva ao Processador as que o humano selecionou:
 *
 * - keyword nova: `bruto`, sem lista, sem métrica, com o bloco
 *   `analise_semantica.subject_discovery`;
 * - existente SEM registro de aprovação: recebe a busca no bloco, com update
 *   condicionado e no máximo 50 por envio;
 * - existente COM registro de aprovação (aprovada, em revisão ou publicada):
 *   não é escrita (Q10), para não mudar a assinatura do pacote aprovado.
 *
 * O texto vem do navegador e entra como entrada humana (Q11): nenhuma métrica é
 * aceita e as origens ficam com `provenanceVerified: false`. O único dado usado
 * como sinal adiante, `subjectKeywordId`, é conferido aqui: mesma marca, viva e
 * declarada. As candidatas nunca são declaradas Assunto (P4): este módulo só
 * LÊ a declaração, e a frase declarada no mesmo envio não entra como item.
 *
 * Nenhuma chamada paga, nenhuma tabela da Descoberta, nenhuma RPC.
 */

export const SUBJECT_DISCOVERY_KEY = "subject_discovery" as const;

/** Origem de cada candidata, na ordem das fontes da F1b.2. */
export const SUBJECT_DISCOVERY_ORIGINS = ["ads_keyword_seed", "ads_url_seed", "labs_related", "labs_category", "labs_ranked"] as const;
export type SubjectDiscoveryOrigin = typeof SUBJECT_DISCOVERY_ORIGINS[number];

export const SUBJECT_DISCOVERY_IMPORT_MAX_ITEMS = 600;
/** Existentes elegíveis que recebem o bloco por envio (leitura da coluna inteira). */
export const SUBJECT_DISCOVERY_EXISTING_WRITE_LIMIT = 50;
/** Janela das buscas mais recentes no bloco. */
export const SUBJECT_DISCOVERY_SEARCH_WINDOW = 5;
/** Ids de Assunto distintos guardados à parte da janela. */
export const SUBJECT_DISCOVERY_SUBJECT_IDS_MAX = 10;
export const SUBJECT_DISCOVERY_EVIDENCE_MAX = 3;
export const SUBJECT_DISCOVERY_EVIDENCE_TEXT_MAX = 160;
export const SUBJECT_DISCOVERY_PHRASE_MAX = 200;
export const SUBJECT_DISCOVERY_KEYWORD_MAX = 400;

/** Colunas estreitas (egress). Nada de `select("*")`. */
export const SUBJECT_DISCOVERY_LIVE_COLUMNS = "id,keyword" as const;
export const SUBJECT_DISCOVERY_APPROVAL_COLUMNS = "id,status,aprovacao:analise_semantica->aprovacao" as const;
export const SUBJECT_DISCOVERY_ELIGIBLE_COLUMNS = "id,status,analise_semantica" as const;
export const SUBJECT_DISCOVERY_SUBJECT_COLUMNS = "id,keyword,brand_id,keyword_subject:analise_semantica->keyword_subject" as const;

export const SUBJECT_DISCOVERY_REASONS = {
  already_recorded: "Já existe · esta busca já estava gravada nela: nada foi regravado.",
  not_recorded_approval: "Já existe · aprovada: a origem desta pesquisa não foi gravada para não tirar a aprovação.",
  not_recorded_limit: `Já existe · origem não gravada (limite de ${SUBJECT_DISCOVERY_EXISTING_WRITE_LIMIT} por envio).`,
  not_recorded_changed: "Já existe · aprovada ou alterada durante o envio: origem não gravada.",
  not_recorded_concurrent: "Criada ao mesmo tempo por outro envio: origem não gravada.",
  skipped_subject: "É o Assunto desta pesquisa: não entra como keyword de sustentação.",
  duplicate: "Repetida neste envio: vale a primeira ocorrência.",
  invalid: "Frase vazia.",
} as const;

export const SUBJECT_DISCOVERY_SUBJECT_REASONS = {
  not_found: "O Assunto informado não foi encontrado nesta marca: as keywords entram sem o vínculo.",
  not_declared: "O Assunto foi retirado depois da busca: as keywords entram sem o vínculo.",
} as const;

/* -------------------------------------------------------------------------- */
/* Corpo da requisição                                                        */
/* -------------------------------------------------------------------------- */

const SubjectDiscoveryImportItemSchema = z.object({
  keyword: z.string().trim().min(1).max(SUBJECT_DISCOVERY_KEYWORD_MAX),
  origins: z.array(z.enum(SUBJECT_DISCOVERY_ORIGINS)).min(1).max(SUBJECT_DISCOVERY_ORIGINS.length),
  evidence: z.array(z.string().trim().min(1).max(SUBJECT_DISCOVERY_EVIDENCE_TEXT_MAX)).max(SUBJECT_DISCOVERY_EVIDENCE_MAX).default([]),
}).strict();

/**
 * `.strict()`: campo de métrica (volume, cpc, resultados…), marca ou ator no
 * corpo é recusado com 400. A marca vem da rota; o ator, da sessão.
 */
export const SubjectDiscoveryImportRequestSchema = z.object({
  importRequestId: z.string().uuid(),
  searchId: z.string().uuid(),
  subjectKeywordId: z.string().uuid().nullable().optional(),
  subjectPhrase: z.string().trim().min(1).max(SUBJECT_DISCOVERY_PHRASE_MAX),
  items: z.array(SubjectDiscoveryImportItemSchema).min(1).max(SUBJECT_DISCOVERY_IMPORT_MAX_ITEMS),
}).strict();

export type SubjectDiscoveryImportRequest = z.infer<typeof SubjectDiscoveryImportRequestSchema>;
export type SubjectDiscoveryImportItem = SubjectDiscoveryImportRequest["items"][number];

/* -------------------------------------------------------------------------- */
/* O bloco `subject_discovery` (domínio puro)                                 */
/* -------------------------------------------------------------------------- */

export type SubjectDiscoverySearchEntry = {
  searchId: string;
  importRequestId: string;
  importedAt: string;
  /** `auth.users.id`. */
  actorId: string;
  subjectKeywordId: string | null;
  subjectPhrase: string;
  origins: SubjectDiscoveryOrigin[];
  evidence: string[];
  /** Q11: o texto veio do navegador; nada aqui foi conferido no provider. */
  provenanceVerified: false;
};

export type SubjectDiscoveryBlock = {
  version: 1;
  searches: SubjectDiscoverySearchEntry[];
  /** Ids de Assunto distintos já validados, fora da janela de `searches`. É o que a F2.4 lê. */
  subjectKeywordIds: string[];
};

type Semantic = Record<string, unknown>;

function asRecord(value: unknown): Semantic {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Semantic : {};
}

function oneLine(value: unknown, max: number): string {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, max) : "";
}

/** Origens conhecidas, sem repetição, na ordem das fontes. */
export function normalizeSubjectDiscoveryOrigins(value: unknown): SubjectDiscoveryOrigin[] {
  const received = new Set(Array.isArray(value) ? value.map(String) : []);
  return SUBJECT_DISCOVERY_ORIGINS.filter(origin => received.has(origin));
}

/** Até 3 textos de uma linha, de até 160 caracteres, sem repetição. */
export function normalizeSubjectDiscoveryEvidence(value: unknown): string[] {
  const evidence: string[] = [];
  for (const item of Array.isArray(value) ? value : []) {
    const text = oneLine(item, SUBJECT_DISCOVERY_EVIDENCE_TEXT_MAX);
    if (text && !evidence.includes(text)) evidence.push(text);
    if (evidence.length === SUBJECT_DISCOVERY_EVIDENCE_MAX) break;
  }
  return evidence;
}

function readSearchEntry(value: unknown): SubjectDiscoverySearchEntry | null {
  const record = asRecord(value);
  if (typeof record.searchId !== "string" || !record.searchId) return null;
  return {
    searchId: record.searchId,
    importRequestId: typeof record.importRequestId === "string" ? record.importRequestId : "",
    importedAt: typeof record.importedAt === "string" ? record.importedAt : "",
    actorId: typeof record.actorId === "string" ? record.actorId : "",
    subjectKeywordId: typeof record.subjectKeywordId === "string" && record.subjectKeywordId ? record.subjectKeywordId : null,
    subjectPhrase: typeof record.subjectPhrase === "string" ? record.subjectPhrase : "",
    origins: normalizeSubjectDiscoveryOrigins(record.origins),
    evidence: normalizeSubjectDiscoveryEvidence(record.evidence),
    provenanceVerified: false,
  };
}

/** Leitura defensiva do bloco. Sem bloco, devolve o bloco vazio. */
export function readSubjectDiscoveryBlock(semantic: unknown): SubjectDiscoveryBlock {
  const record = asRecord(asRecord(semantic)[SUBJECT_DISCOVERY_KEY]);
  const searches = (Array.isArray(record.searches) ? record.searches : [])
    .map(readSearchEntry)
    .filter((entry): entry is SubjectDiscoverySearchEntry => Boolean(entry));
  const subjectKeywordIds = [...new Set((Array.isArray(record.subjectKeywordIds) ? record.subjectKeywordIds : [])
    .filter((id): id is string => typeof id === "string" && Boolean(id.trim())))];
  return { version: 1, searches, subjectKeywordIds };
}

/**
 * Acrescenta uma busca ao bloco.
 *
 * - A mesma `searchId` não regrava: `changed: false`.
 * - `searches` guarda as 5 mais recentes; a mais antiga sai quando entra a sexta.
 * - `subjectKeywordIds` guarda até 10 ids distintos, independentes da janela.
 *   Um id que reaparece vai para o fim (o mais recente); acima de 10, sai o
 *   que foi visto há mais tempo. Essa perda é declarada na SDD.
 *
 * O resto de `analise_semantica` fica intocado.
 */
export function appendSubjectDiscoverySearch(semantic: unknown, entry: SubjectDiscoverySearchEntry): { semantic: Semantic; changed: boolean } {
  const current = { ...asRecord(semantic) };
  const block = readSubjectDiscoveryBlock(current);
  if (block.searches.some(search => search.searchId === entry.searchId)) return { semantic: current, changed: false };
  const searches = [...block.searches, entry].slice(-SUBJECT_DISCOVERY_SEARCH_WINDOW);
  let subjectKeywordIds = block.subjectKeywordIds;
  if (entry.subjectKeywordId) {
    subjectKeywordIds = [...subjectKeywordIds.filter(id => id !== entry.subjectKeywordId), entry.subjectKeywordId].slice(-SUBJECT_DISCOVERY_SUBJECT_IDS_MAX);
  }
  const next: SubjectDiscoveryBlock = { version: 1, searches, subjectKeywordIds };
  return { semantic: { ...current, [SUBJECT_DISCOVERY_KEY]: next }, changed: true };
}

/* -------------------------------------------------------------------------- */
/* Núcleo do import                                                           */
/* -------------------------------------------------------------------------- */

export type SubjectDiscoveryImportOutcome =
  | "created"
  | "recorded"
  | "already_recorded"
  | "not_recorded_approval"
  | "not_recorded_limit"
  | "not_recorded_changed"
  | "not_recorded_concurrent"
  | "skipped_subject"
  | "duplicate"
  | "invalid"
  | "failed";

/** Linhas que existem na marca mas não receberam a origem desta pesquisa. */
export const SUBJECT_DISCOVERY_NOT_AFFECTED_OUTCOMES: readonly SubjectDiscoveryImportOutcome[] = [
  "not_recorded_approval",
  "not_recorded_limit",
  "not_recorded_changed",
  "not_recorded_concurrent",
];

export type SubjectDiscoveryImportRow = {
  index: number;
  keyword: string;
  normalizedKeyword: string;
  outcome: SubjectDiscoveryImportOutcome;
  keywordId: string | null;
  reason: string | null;
};

export type SubjectDiscoveryImportCounts = {
  received: number;
  created: number;
  recorded: number;
  alreadyRecorded: number;
  notAffected: number;
  skippedSubject: number;
  duplicates: number;
  invalid: number;
  failed: number;
};

export type SubjectDiscoverySubjectCheck = {
  /** O id gravado no bloco: só o validado; nos outros casos, `null`. */
  keywordId: string | null;
  status: "none" | "validated" | "not_found" | "not_declared";
  reason: string | null;
};

export type SubjectDiscoveryImportRefusalCode = "ACTOR_REQUIRED" | "BRAND_REQUIRED" | "TOO_MANY_ITEMS" | "IMPORT_REQUEST_IN_PROGRESS";

export type SubjectDiscoveryImportResult =
  | {
    ok: true;
    importRequestId: string;
    searchId: string;
    subject: SubjectDiscoverySubjectCheck;
    rows: SubjectDiscoveryImportRow[];
    /** As linhas que já existem e ficaram sem a origem, com o motivo. */
    notAffected: SubjectDiscoveryImportRow[];
    counts: SubjectDiscoveryImportCounts;
  }
  | { ok: false; code: SubjectDiscoveryImportRefusalCode; reason: string };

/**
 * Trava por `importRequestId` em curso, na mesma instância (F1b.7, Q8). Dois
 * envios simultâneos em instâncias diferentes ainda podem duplicar: a garantia
 * exige índice único, que é migration e fica fora desta SDD.
 */
const subjectDiscoveryImportsInFlight = new Set<string>();

const LIVE_PAGE_SIZE = 1000;
const ID_CHUNK = 200;

function safeDatabaseErrorCode(error: unknown) {
  const value = error && typeof error === "object" ? error as { code?: unknown } : {};
  return typeof value.code === "string" && /^[A-Z0-9_ -]{1,40}$/.test(value.code) ? value.code : "database_error";
}

async function readLiveKeywords(client: SupabaseClient, brandId: string) {
  const rows: Array<{ id: string; keyword: string }> = [];
  for (let from = 0; ; from += LIVE_PAGE_SIZE) {
    const page = await client
      .from("minerador_keywords")
      .select(SUBJECT_DISCOVERY_LIVE_COLUMNS)
      .eq("brand_id", brandId)
      .is("deleted_at", null)
      .order("id", { ascending: true })
      .range(from, from + LIVE_PAGE_SIZE - 1);
    if (page.error) throw page.error;
    const data = (page.data || []) as Array<{ id: unknown; keyword?: unknown }>;
    for (const row of data) rows.push({ id: String(row.id), keyword: typeof row.keyword === "string" ? row.keyword : "" });
    if (data.length < LIVE_PAGE_SIZE) return rows;
  }
}

async function readByIds<T>(client: SupabaseClient, brandId: string, ids: string[], columns: string): Promise<Map<string, T>> {
  const byId = new Map<string, T>();
  for (let start = 0; start < ids.length; start += ID_CHUNK) {
    const result = await client
      .from("minerador_keywords")
      .select(columns)
      .eq("brand_id", brandId)
      .in("id", ids.slice(start, start + ID_CHUNK))
      .is("deleted_at", null);
    if (result.error) throw result.error;
    for (const row of (result.data || []) as unknown as Array<T & { id: unknown }>) byId.set(String(row.id), row);
  }
  return byId;
}

async function checkSubjectKeyword(client: SupabaseClient, brandId: string, subjectKeywordId: string | null | undefined): Promise<SubjectDiscoverySubjectCheck & { normalizedKeyword: string | null }> {
  if (!subjectKeywordId) return { keywordId: null, status: "none", reason: null, normalizedKeyword: null };
  const result = await client
    .from("minerador_keywords")
    .select(SUBJECT_DISCOVERY_SUBJECT_COLUMNS)
    .eq("id", subjectKeywordId)
    .eq("brand_id", brandId)
    .is("deleted_at", null)
    .maybeSingle();
  if (result.error) throw result.error;
  const row = result.data as { id?: unknown; keyword?: unknown; brand_id?: unknown; keyword_subject?: unknown } | null;
  // Outra marca e inexistente dão a mesma resposta, sem distinguir os dois.
  if (!row || String(row.id) !== subjectKeywordId || row.brand_id !== brandId) {
    return { keywordId: null, status: "not_found", reason: SUBJECT_DISCOVERY_SUBJECT_REASONS.not_found, normalizedKeyword: null };
  }
  const normalizedKeyword = normalizeKeyword(row.keyword) || null;
  if (!resolveKeywordSubject({ keyword_subject: row.keyword_subject }).declared) {
    return { keywordId: null, status: "not_declared", reason: SUBJECT_DISCOVERY_SUBJECT_REASONS.not_declared, normalizedKeyword };
  }
  return { keywordId: subjectKeywordId, status: "validated", reason: null, normalizedKeyword };
}

function countRows(rows: SubjectDiscoveryImportRow[]): SubjectDiscoveryImportCounts {
  const count = (outcome: SubjectDiscoveryImportOutcome) => rows.filter(row => row.outcome === outcome).length;
  return {
    received: rows.length,
    created: count("created"),
    recorded: count("recorded"),
    alreadyRecorded: count("already_recorded"),
    notAffected: rows.filter(row => SUBJECT_DISCOVERY_NOT_AFFECTED_OUTCOMES.includes(row.outcome)).length,
    skippedSubject: count("skipped_subject"),
    duplicates: count("duplicate"),
    invalid: count("invalid"),
    failed: count("failed"),
  };
}

/**
 * Import da Pesquisa por Assunto. A marca vem da rota (`context.brandId`); o
 * ator é `auth.users.id`. O corpo já passou por `SubjectDiscoveryImportRequestSchema`.
 */
export async function importSubjectDiscoveryWithCore(input: {
  brandId: string;
  actorUserId: string;
  supabase: SupabaseClient;
  request: SubjectDiscoveryImportRequest;
  now?: string;
}): Promise<SubjectDiscoveryImportResult> {
  const brandId = typeof input.brandId === "string" ? input.brandId.trim() : "";
  if (!brandId) return { ok: false, code: "BRAND_REQUIRED", reason: "A marca ativa é necessária para importar." };
  if (!isKeywordSubjectActorId(input.actorUserId)) {
    return { ok: false, code: "ACTOR_REQUIRED", reason: "O import exige o usuário autenticado (auth.users.id)." };
  }
  if (input.request.items.length > SUBJECT_DISCOVERY_IMPORT_MAX_ITEMS) {
    return { ok: false, code: "TOO_MANY_ITEMS", reason: `No máximo ${SUBJECT_DISCOVERY_IMPORT_MAX_ITEMS} keywords por envio.` };
  }
  const lockKey = `${brandId}:${input.request.importRequestId}`;
  if (subjectDiscoveryImportsInFlight.has(lockKey)) {
    return { ok: false, code: "IMPORT_REQUEST_IN_PROGRESS", reason: "Este envio já está em processamento. Aguarde o resultado antes de enviar de novo." };
  }
  subjectDiscoveryImportsInFlight.add(lockKey);
  try {
    return await runSubjectDiscoveryImport({ ...input, brandId, actorUserId: input.actorUserId.trim() });
  } finally {
    subjectDiscoveryImportsInFlight.delete(lockKey);
  }
}

async function runSubjectDiscoveryImport(input: {
  brandId: string;
  actorUserId: string;
  supabase: SupabaseClient;
  request: SubjectDiscoveryImportRequest;
  now?: string;
}): Promise<SubjectDiscoveryImportResult> {
  const { brandId, actorUserId, supabase, request } = input;
  const now = input.now || new Date().toISOString();
  const subjectPhrase = oneLine(request.subjectPhrase, SUBJECT_DISCOVERY_PHRASE_MAX);

  // A conferência do Assunto vem antes de qualquer escrita.
  const subject = await checkSubjectKeyword(supabase, brandId, request.subjectKeywordId);
  // A frase declarada Assunto (no mesmo envio ou antes) não entra como item.
  const subjectKeys = new Set<string>();
  if (request.subjectKeywordId) {
    const phraseKey = normalizeKeyword(subjectPhrase);
    if (phraseKey) subjectKeys.add(phraseKey);
    if (subject.normalizedKeyword) subjectKeys.add(subject.normalizedKeyword);
  }

  const live = await readLiveKeywords(supabase, brandId);
  const liveByKey = new Map<string, string>();
  for (const row of live) {
    const key = normalizeKeyword(row.keyword);
    if (key && !liveByKey.has(key)) liveByKey.set(key, row.id);
  }

  type Pending = { row: SubjectDiscoveryImportRow; item: SubjectDiscoveryImportItem };
  const rows: SubjectDiscoveryImportRow[] = [];
  const fresh: Pending[] = [];
  const existing: Pending[] = [];
  const seen = new Set<string>();
  for (const [index, item] of request.items.entries()) {
    const keyword = oneLine(item.keyword, SUBJECT_DISCOVERY_KEYWORD_MAX);
    const normalizedKeyword = normalizeKeyword(keyword);
    const row: SubjectDiscoveryImportRow = { index, keyword, normalizedKeyword, outcome: "invalid", keywordId: null, reason: SUBJECT_DISCOVERY_REASONS.invalid };
    rows.push(row);
    if (!normalizedKeyword) continue;
    if (seen.has(normalizedKeyword)) {
      row.outcome = "duplicate";
      row.reason = SUBJECT_DISCOVERY_REASONS.duplicate;
      continue;
    }
    seen.add(normalizedKeyword);
    if (subjectKeys.has(normalizedKeyword)) {
      row.outcome = "skipped_subject";
      row.reason = SUBJECT_DISCOVERY_REASONS.skipped_subject;
      row.keywordId = liveByKey.get(normalizedKeyword) || null;
      continue;
    }
    const liveId = liveByKey.get(normalizedKeyword);
    row.keywordId = liveId || null;
    row.reason = null;
    (liveId ? existing : fresh).push({ row, item });
  }

  const entryFor = (item: SubjectDiscoveryImportItem): SubjectDiscoverySearchEntry => ({
    searchId: request.searchId,
    importRequestId: request.importRequestId,
    importedAt: now,
    actorId: actorUserId,
    subjectKeywordId: subject.keywordId,
    subjectPhrase,
    origins: normalizeSubjectDiscoveryOrigins(item.origins),
    evidence: normalizeSubjectDiscoveryEvidence(item.evidence),
    provenanceVerified: false,
  });

  // Existentes, passo 1: só o registro de aprovação (~0,3 kB cada).
  const existingIds = [...new Set(existing.map(pending => pending.row.keywordId!))];
  const approvals = await readByIds<{ id: unknown; status?: unknown; aprovacao?: unknown }>(supabase, brandId, existingIds, SUBJECT_DISCOVERY_APPROVAL_COLUMNS);
  const eligible: Pending[] = [];
  for (const pending of existing) {
    const id = pending.row.keywordId!;
    const approval = approvals.get(id);
    if (!approval) {
      pending.row.outcome = "not_recorded_changed";
      pending.row.reason = SUBJECT_DISCOVERY_REASONS.not_recorded_changed;
      continue;
    }
    if (hasKeywordApprovalRecord({ aprovacao: approval.aprovacao })) {
      pending.row.outcome = "not_recorded_approval";
      pending.row.reason = SUBJECT_DISCOVERY_REASONS.not_recorded_approval;
      continue;
    }
    if (eligible.length >= SUBJECT_DISCOVERY_EXISTING_WRITE_LIMIT) {
      pending.row.outcome = "not_recorded_limit";
      pending.row.reason = SUBJECT_DISCOVERY_REASONS.not_recorded_limit;
      continue;
    }
    eligible.push(pending);
  }

  // Existentes, passo 2: a coluna inteira só das elegíveis, no máximo 50.
  const full = await readByIds<{ id: unknown; status?: unknown; analise_semantica?: unknown }>(supabase, brandId, eligible.map(pending => pending.row.keywordId!), SUBJECT_DISCOVERY_ELIGIBLE_COLUMNS);
  for (const pending of eligible) {
    const { row, item } = pending;
    const id = row.keywordId!;
    const current = full.get(id);
    if (!current || hasKeywordApprovalRecord(current.analise_semantica)) {
      row.outcome = "not_recorded_changed";
      row.reason = SUBJECT_DISCOVERY_REASONS.not_recorded_changed;
      continue;
    }
    const next = appendSubjectDiscoverySearch(current.analise_semantica, entryFor(item));
    if (!next.changed) {
      row.outcome = "already_recorded";
      row.reason = SUBJECT_DISCOVERY_REASONS.already_recorded;
      continue;
    }
    const statusRead = typeof current.status === "string" ? current.status : null;
    // Update condicionado: sem registro de aprovação e com o status lido. Uma
    // aprovação feita entre a leitura e a escrita não é apagada.
    let update = supabase
      .from("minerador_keywords")
      .update({ analise_semantica: next.semantic })
      .eq("id", id)
      .eq("brand_id", brandId)
      .is("deleted_at", null)
      .is("analise_semantica->aprovacao", null);
    update = statusRead === null ? update.is("status", null) : update.eq("status", statusRead);
    const written = await update.select("id");
    if (written.error) {
      row.outcome = "failed";
      row.reason = `Não foi possível gravar a origem (${safeDatabaseErrorCode(written.error)}).`;
      continue;
    }
    const affected = ((written.data || []) as Array<{ id: unknown }>).some(item => String(item.id) === id);
    if (!affected) {
      row.outcome = "not_recorded_changed";
      row.reason = SUBJECT_DISCOVERY_REASONS.not_recorded_changed;
      continue;
    }
    row.outcome = "recorded";
  }

  /*
   * Corrida no insert: a marca é relida NO MÁXIMO UMA VEZ por envio, na
   * primeira falha que pode ser corrida (violação de unicidade, 23505), e o
   * mapa fica guardado para as seguintes. Falha que não é corrida (permissão,
   * constraint, banco fora) vira `failed` sem reler nada.
   */
  let concurrentByKey: Map<string, string> | null | undefined;
  const concurrentKeywordId = async (normalizedKeyword: string) => {
    if (concurrentByKey === undefined) {
      const reread = await readLiveKeywords(supabase, brandId).catch(() => null);
      concurrentByKey = reread ? new Map() : null;
      for (const candidate of reread || []) {
        const key = normalizeKeyword(candidate.keyword);
        if (key && !concurrentByKey!.has(key)) concurrentByKey!.set(key, candidate.id);
      }
    }
    return concurrentByKey?.get(normalizedKeyword) ?? null;
  };

  // Novas: `bruto`, sem lista e sem métrica, com o bloco. O insert devolve só o id.
  for (const { row, item } of fresh) {
    const block = appendSubjectDiscoverySearch({}, entryFor(item)).semantic;
    const insert = await supabase
      .from("minerador_keywords")
      .insert({
        keyword: row.keyword,
        brand_id: brandId,
        lista_id: null,
        status: "bruto",
        volume_search: null,
        results_allintitle: null,
        analise_semantica: block,
      })
      .select("id")
      .single();
    const insertedId = insert.data && typeof insert.data === "object" ? (insert.data as { id?: unknown }).id : null;
    if (!insert.error && insertedId) {
      row.keywordId = String(insertedId);
      row.outcome = "created";
      liveByKey.set(row.normalizedKeyword, row.keywordId);
      continue;
    }
    // Corrida: outro envio criou a mesma frase. Nada é regravado.
    const matchId = safeDatabaseErrorCode(insert.error) === "23505" ? await concurrentKeywordId(row.normalizedKeyword) : null;
    if (matchId) {
      row.keywordId = matchId;
      row.outcome = "not_recorded_concurrent";
      row.reason = SUBJECT_DISCOVERY_REASONS.not_recorded_concurrent;
      continue;
    }
    row.outcome = "failed";
    row.reason = `Não foi possível criar a keyword (${safeDatabaseErrorCode(insert.error)}).`;
  }

  return {
    ok: true,
    importRequestId: request.importRequestId,
    searchId: request.searchId,
    subject: { keywordId: subject.keywordId, status: subject.status, reason: subject.reason },
    rows,
    notAffected: rows.filter(row => SUBJECT_DISCOVERY_NOT_AFFECTED_OUTCOMES.includes(row.outcome)),
    counts: countRows(rows),
  };
}
