import type { SupabaseClient } from "@supabase/supabase-js";
import type { SitePageType } from "../marca/site-contracts.ts";
import { manualImportListaId, resolveLegacyCsvSilo, type LegacyImportList } from "./legacy-import.ts";
import { isKeywordPublished } from "./keyword-lifecycle.ts";
import { isKeywordSubjectActorId, normalizeKeywordSubjectNote, resolveKeywordSubject, setKeywordSubject } from "./keyword-subject.ts";
import { SUBJECT_DESTINATION_NO_BRAND_SITE_NOTICE, subjectDestinationCatalogKey, validateSubjectDestination, type SubjectDestinationCatalogHit } from "./subject-destination.ts";
export type KeywordImportSource = "discovery";

export type KeywordImportLocation = {
  countryCode?: "BR";
  stateCode?: string;
  municipalityName?: string;
  ibgeCode?: string;
  placeId?: string;
};

export type KeywordImportCoreItem = {
  keyword: string;
  source: KeywordImportSource;
  status?: "bruto";
  intentHint?: string[];
  funnelHint?: "BOFU" | "MOFU" | "TOFU" | null;
  resultsAllintitle?: number | null;
  resultsStatus?: "success" | "zero_results" | "unavailable" | "captcha" | "blocked" | "error" | "pending";
  resultsMeasuredAt?: string;
  volume?: number | null;
  volumeStatus?: "success" | "not_found" | "error" | "not_processed" | "pending";
  volumeSource?: string;
  volumeMeasuredAt?: string;
  locations: KeywordImportLocation[];
  extractionBatchId: string;
  discoveryRunId?: string;
  discoverySource?: "google_ads" | "manual" | "csv";
  listaId?: string | null;
  sourceSnapshot?: Record<string, unknown>;
};

export type KeywordImportCoreOutcome = "created" | "existing" | "duplicate" | "failed";

export type KeywordImportCoreResultItem = {
  index: number;
  keyword: string;
  normalizedKeyword: string;
  outcome: KeywordImportCoreOutcome;
  keywordId?: string;
  metadataUpdated?: boolean;
  reason?: string;
  /** Sanitized persistence code for the caller's per-item diagnostic. */
  errorCode?: string;
};

export type KeywordImportCoreResult = {
  items: KeywordImportCoreResultItem[];
  created: number;
  existing: number;
  duplicates: number;
  failed: number;
};

type KeywordRow = {
  id: string;
  keyword: string;
  brand_id: string;
  lista_id?: string | null;
  status?: string | null;
  analise_semantica?: Record<string, unknown> | null;
};

export function normalizeKeyword(value: unknown): string {
  return typeof value === "string"
    ? value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLocaleLowerCase("pt-BR").replace(/\s+/g, " ")
    : "";
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function safeDatabaseErrorCode(error: unknown) {
  const value = error && typeof error === "object" ? error as { code?: unknown } : {};
  return typeof value.code === "string" && /^[A-Z0-9_ -]{1,40}$/.test(value.code) ? value.code : "database_error";
}

/**
 * A keyword tem registro de aprovação (`analise_semantica.aprovacao`)?
 *
 * Regra da Q10 (SDD 2026-09-24, F1b.7): proveniência nova nunca é escrita em
 * keyword com registro de aprovação — aprovada, em revisão ou publicada. Toda
 * chave de `analise_semantica` entra na assinatura do pacote aprovado
 * (`approved-package.ts`), e escrever ali rebaixaria a aprovada para Em
 * revisão em silêncio. Registro malformado conta como registro: na dúvida,
 * não se escreve.
 */
export function hasKeywordApprovalRecord(semantic: unknown): boolean {
  const value = asRecord(semantic).aprovacao;
  return value !== undefined && value !== null;
}

function buildDiscoverySemanticEvidence(
  item: KeywordImportCoreItem,
  existing: Record<string, unknown> | null | undefined,
  now: string,
): Record<string, unknown> {
  const current = asRecord(existing);
  const previous = asRecord(current.discovery_import);
  return {
    ...current,
    discovery_import: {
      ...previous,
      source: `${item.discoverySource || "google_ads"}_discovery`,
      discoveryRunId: item.discoveryRunId || null,
      sourceBatchId: item.extractionBatchId,
      lastSeenAt: now,
      sourceSnapshot: item.sourceSnapshot || null,
      lastMeasurement: {
        resultsAllintitle: item.resultsAllintitle ?? null,
        resultsStatus: item.resultsStatus,
        resultsMeasuredAt: item.resultsMeasuredAt || null,
        volume: item.volume ?? null,
        volumeStatus: item.volumeStatus,
        volumeSource: item.volumeSource || null,
        volumeMeasuredAt: item.volumeMeasuredAt || null,
      },
    },
  };
}

function buildNewDiscoveryKeywordPayload(item: KeywordImportCoreItem, brandId: string, now: string) {
  const semantic = buildDiscoverySemanticEvidence(item, null, now);
  const firstLocation = item.locations[0];
  const location = firstLocation ? firstLocation.municipalityName || firstLocation.stateCode || (firstLocation.countryCode === "BR" ? "Brasil" : null) : null;
  return {
    keyword: item.keyword.trim(),
    brand_id: brandId,
    // A origem manual/CSV sem lista continua sendo persistida como lista_id: null.
    lista_id: item.listaId || null,
    status: "bruto",
    location,
    results_allintitle: item.resultsAllintitle ?? null,
    volume_search: item.volume ?? null,
    // volume_source is a historical NOT NULL column with a database default.
    // Local sources have no volume provider, so omit it and let the default
    // apply instead of explicitly violating the legacy constraint with null.
    ...(item.volumeSource?.trim() ? { volume_source: item.volumeSource.trim() } : {}),
    analise_semantica: semantic,
  };
}

function buildSemanticEvidence(item: KeywordImportCoreItem, existing: Record<string, unknown> | null | undefined, now: string) {
  return buildDiscoverySemanticEvidence(item, existing, now);
}

/**
 * A evidência da Descoberta numa existente SEM registro de aprovação. O update
 * é condicionado a `analise_semantica->aprovacao` nulo e devolve o id: uma
 * aprovação feita entre a leitura e a escrita não é apagada pela cópia antiga
 * da coluna (Q10). Zero linhas afetadas = nada regravado.
 */
async function updateEvidenceWithoutApproval(client: SupabaseClient, brandId: string, keywordId: string, semantic: Record<string, unknown>): Promise<{ error: unknown; affected: boolean }> {
  const update = await client
    .from("minerador_keywords")
    .update({ analise_semantica: semantic })
    .eq("id", keywordId)
    .eq("brand_id", brandId)
    .is("deleted_at", null)
    .is("analise_semantica->aprovacao", null)
    .select("id");
  if (update.error) return { error: update.error, affected: false };
  const affected = ((update.data || []) as Array<{ id: unknown }>).some(row => String(row.id) === String(keywordId));
  return { error: null, affected };
}

async function findExistingByKeyword(client: SupabaseClient, brandId: string, normalized: string) {
  const result = await client
    .from("minerador_keywords")
    .select("id,keyword,brand_id,lista_id,status,analise_semantica")
    .eq("brand_id", brandId)
    .is("deleted_at", null);
  if (result.error) throw result.error;
  return ((result.data || []) as KeywordRow[]).find(row => normalizeKeyword(row.keyword) === normalized) || null;
}

/**
 * Núcleo único de importação do Minerador. As rotas validam a sessão/tenant e
 * entregam um cliente server-side autorizado; este serviço concentra somente
 * a criação/deduplicação e a evidência aditiva de origem.
 */
export async function importKeywordsWithCore(input: {
  brandId: string;
  actorUserId: string;
  items: KeywordImportCoreItem[];
  supabase: SupabaseClient;
  now?: string;
}): Promise<KeywordImportCoreResult> {
  void input.actorUserId;
  const now = input.now || new Date().toISOString();
  const existingResult = await input.supabase
    .from("minerador_keywords")
    .select("id,keyword,brand_id,lista_id,status,analise_semantica")
    .eq("brand_id", input.brandId)
    .is("deleted_at", null);
  if (existingResult.error) throw existingResult.error;

  const existingByKey = new Map<string, KeywordRow>();
  for (const row of (existingResult.data || []) as KeywordRow[]) {
    const normalized = normalizeKeyword(row.keyword);
    if (normalized && !existingByKey.has(normalized)) existingByKey.set(normalized, row);
  }

  const seen = new Set<string>();
  const resultItems: KeywordImportCoreResultItem[] = [];
  let created = 0;
  let existing = 0;
  let duplicates = 0;
  let failed = 0;

  for (const [index, item] of input.items.entries()) {
    const normalizedKeyword = normalizeKeyword(item.keyword);
    if (!normalizedKeyword) {
      failed += 1;
      resultItems.push({ index, keyword: item.keyword, normalizedKeyword, outcome: "failed", reason: "invalid_keyword", errorCode: "invalid_keyword" });
      continue;
    }
    if (seen.has(normalizedKeyword)) {
      duplicates += 1;
      resultItems.push({ index, keyword: item.keyword, normalizedKeyword, outcome: "duplicate", reason: "duplicate_in_batch" });
      continue;
    }
    seen.add(normalizedKeyword);

    const previous = existingByKey.get(normalizedKeyword);
    if (previous && hasKeywordApprovalRecord(previous.analise_semantica)) {
      // Reimportar uma aprovada regravava `discovery_import.lastSeenAt`, mudava a
      // assinatura do pacote e a rebaixava para Em revisão em silêncio (Q10).
      existing += 1;
      resultItems.push({ index, keyword: item.keyword, normalizedKeyword, outcome: "existing", keywordId: previous.id, metadataUpdated: false, reason: "approval_record_preserved" });
      continue;
    }
    if (previous) {
      const semantic = buildSemanticEvidence(item, previous.analise_semantica, now);
      const update = await updateEvidenceWithoutApproval(input.supabase, input.brandId, previous.id, semantic);
      if (update.error) {
        failed += 1;
        resultItems.push({ index, keyword: item.keyword, normalizedKeyword, outcome: "failed", keywordId: previous.id, reason: "existing_evidence_update_failed", errorCode: safeDatabaseErrorCode(update.error) });
      } else if (!update.affected) {
        // Aprovada (ou alterada) entre a leitura e a escrita: nada foi regravado.
        existing += 1;
        resultItems.push({ index, keyword: item.keyword, normalizedKeyword, outcome: "existing", keywordId: previous.id, metadataUpdated: false, reason: "changed_during_import" });
      } else {
        existing += 1;
        resultItems.push({ index, keyword: item.keyword, normalizedKeyword, outcome: "existing", keywordId: previous.id, metadataUpdated: true, reason: "keyword_preserved" });
      }
      continue;
    }

    const payload = buildNewDiscoveryKeywordPayload(item, input.brandId, now);
    const insert = await input.supabase
      .from("minerador_keywords")
      .insert(payload)
      .select("id,keyword,brand_id,lista_id,status")
      .single();
    if (!insert.error && insert.data?.id) {
      const row = insert.data as KeywordRow;
      existingByKey.set(normalizedKeyword, row);
      created += 1;
      resultItems.push({ index, keyword: item.keyword, normalizedKeyword, outcome: "created", keywordId: String(row.id) });
      continue;
    }

    // A concurrent import may have created the same normalized keyword. A
    // second lookup turns that race into the same existing-keyword result.
    let concurrent: KeywordRow | null = null;
    let concurrentLookupError: unknown = null;
    try {
      concurrent = await findExistingByKeyword(input.supabase, input.brandId, normalizedKeyword);
    } catch (error) {
      concurrentLookupError = error;
    }
    let concurrentUpdateError: unknown = null;
    if (concurrent && hasKeywordApprovalRecord(concurrent.analise_semantica)) {
      existingByKey.set(normalizedKeyword, concurrent);
      existing += 1;
      resultItems.push({ index, keyword: item.keyword, normalizedKeyword, outcome: "existing", keywordId: concurrent.id, metadataUpdated: false, reason: "approval_record_preserved" });
      continue;
    }
    if (concurrent) {
      const semantic = buildSemanticEvidence(item, concurrent.analise_semantica, now);
      const update = await updateEvidenceWithoutApproval(input.supabase, input.brandId, concurrent.id, semantic);
      if (!update.error) {
        existingByKey.set(normalizedKeyword, concurrent);
        existing += 1;
        resultItems.push({ index, keyword: item.keyword, normalizedKeyword, outcome: "existing", keywordId: concurrent.id, metadataUpdated: update.affected, reason: update.affected ? "keyword_created_concurrently" : "changed_during_import" });
        continue;
      }
      concurrentUpdateError = update.error;
    }
    failed += 1;
    resultItems.push({ index, keyword: item.keyword, normalizedKeyword, outcome: "failed", reason: "keyword_insert_failed", errorCode: safeDatabaseErrorCode(concurrentUpdateError || concurrentLookupError || insert.error) });
  }

  return { items: resultItems, created, existing, duplicates, failed };
}

/* ========================================================================== */
/* IMPORT DE ASSUNTOS (SDD 2026-09-24, F1.3)                                   */
/* ========================================================================== */

/**
 * Uma linha do import de Assunto, como chega do CSV ou da lista colada.
 * Nenhuma métrica é aceita: quem mede é o Processador; intenção e funil
 * vêm da Lógica (D2).
 */
export type SubjectImportItem = {
  keyword: string;
  note?: unknown;
  destinationUrl?: unknown;
  /** Referência da coluna `lista` do CSV (id ou nome), resolvida só contra as listas da marca. */
  listaReference?: string | null;
};

export type SubjectImportClassification =
  | "new"
  | "existing_without_subject"
  | "existing_subject_same"
  | "existing_subject_different"
  | "published"
  | "invalid";

export type SubjectImportOutcome =
  | "created"
  | "declared"
  | "unchanged"
  | "kept"
  | "not_marked"
  | "invalid"
  | "failed";

export type SubjectImportRow = {
  index: number;
  keyword: string;
  normalizedKeyword: string;
  classification: SubjectImportClassification;
  /** Id da keyword viva da marca que casou; `null` para nova ou inválida. */
  keywordId: string | null;
  status: string | null;
  published: boolean;
  /** Existente aprovada: declarar a leva para Em revisão (F1.5). */
  approvalWarning: string | null;
  /** De onde a existente veio, para o humano decidir. */
  originLabel: string | null;
  note: string | null;
  destinationUrl: string | null;
  listaId: string | null;
  /** O que já está gravado, quando a existente já é Assunto. */
  recorded: { note: string | null; destinationUrl: string | null } | null;
  /** Existe uma versão apagada, ainda restaurável, desta frase (só na prévia). */
  deletedVersion: boolean;
  notices: string[];
  reason: string | null;
  outcome?: SubjectImportOutcome;
};

export type SubjectImportCounts = {
  total: number;
  new: number;
  existingWithoutSubject: number;
  existingSubjectSame: number;
  existingSubjectDifferent: number;
  published: number;
  invalid: number;
  deletedVersions: number;
};

export type SubjectImportRefusalCode = "ACTOR_REQUIRED" | "BRAND_REQUIRED" | "IMPORT_REQUEST_REQUIRED" | "IMPORT_REQUEST_IN_PROGRESS";

export type SubjectImportResult =
  | {
    ok: true;
    mode: "preview" | "apply";
    rows: SubjectImportRow[];
    counts: SubjectImportCounts;
    createdIds: string[];
    declaredIds: string[];
    failed: number;
    notices: string[];
  }
  | { ok: false; code: SubjectImportRefusalCode; reason: string };

/** Colunas estreitas das vivas (F1.9): nada de `analise_semantica` da marca inteira. */
export const SUBJECT_IMPORT_LIVE_COLUMNS = "id,keyword,status,lista_id" as const;
/** `analise_semantica` só das que casaram, lida por id. */
export const SUBJECT_IMPORT_MATCHED_COLUMNS = "id,analise_semantica" as const;
/** Aviso de versão apagada: leitura estreita separada. */
export const SUBJECT_IMPORT_DELETED_COLUMNS = "id,keyword" as const;
/** Catálogo do site, só informativo. */
export const SUBJECT_IMPORT_CATALOG_COLUMNS = "normalized_url,page_type,title,h1" as const;

export const SUBJECT_IMPORT_APPROVAL_WARNING =
  "Aprovada: declarar o Assunto leva a keyword para Em revisão; a reaprovação só exige a Lógica." as const;
export const SUBJECT_IMPORT_DELETED_NOTICE =
  "Existe uma versão apagada desta frase, ainda restaurável. Aplicar cria uma keyword nova; para recuperar a antiga, restaure-a na lixeira." as const;
export const SUBJECT_IMPORT_KEPT_NOTICE =
  "Já é Assunto com outra nota ou outro destino. O import mantém o que está gravado; a troca se faz na Revisão Humana." as const;
export const SUBJECT_IMPORT_LIST_NOT_FOUND_NOTICE =
  "Lista não encontrada nesta marca: a frase entra sem lista." as const;

const ID_CHUNK = 200;

/**
 * Trava por `importRequestId` em curso, na mesma instância (F1.3, Q8). Reduz,
 * mas não elimina, o risco de duplicata entre instâncias: a garantia real exige
 * índice único, que é migration e fica fora desta SDD.
 */
const subjectImportsInFlight = new Set<string>();

function subjectImportLockKey(brandId: string, importRequestId: string) {
  return `${brandId}:${importRequestId}`;
}

function originLabelFor(semantic: Record<string, unknown>): string | null {
  if (asRecord(semantic.subject_import).source === "subject_import") return "Import de Assunto";
  const source = asRecord(semantic.discovery_import).source;
  if (source === "google_ads_discovery") return "Descoberta · Google Ads";
  if (source === "manual_discovery") return "Descoberta · lista colada";
  if (source === "csv_discovery") return "Descoberta · CSV";
  return "Processador";
}

/** Teto de linhas por página: o PostgREST corta em `max_rows = 1000` (supabase/config.toml). */
const LIVE_PAGE_SIZE = 1000;

/**
 * As vivas da marca, com colunas estreitas, página a página. Sem paginar, uma
 * marca com mais de 1000 vivas perderia as que ficam fora do corte, e o
 * import as trataria como novas (duplicata, sem índice único — Q8).
 */
async function readLiveKeywordPages<T>(client: SupabaseClient, brandId: string, columns: string): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += LIVE_PAGE_SIZE) {
    const page = await client
      .from("minerador_keywords")
      .select(columns)
      .eq("brand_id", brandId)
      .is("deleted_at", null)
      .order("id", { ascending: true })
      .range(from, from + LIVE_PAGE_SIZE - 1);
    if (page.error) throw page.error;
    const data = (page.data || []) as T[];
    rows.push(...data);
    if (data.length < LIVE_PAGE_SIZE) return rows;
  }
}

async function readSemanticByIds(client: SupabaseClient, brandId: string, ids: string[]) {
  const semanticById = new Map<string, Record<string, unknown>>();
  for (let start = 0; start < ids.length; start += ID_CHUNK) {
    const chunk = ids.slice(start, start + ID_CHUNK);
    const result = await client
      .from("minerador_keywords")
      .select(SUBJECT_IMPORT_MATCHED_COLUMNS)
      .eq("brand_id", brandId)
      .in("id", chunk)
      .is("deleted_at", null);
    if (result.error) throw result.error;
    for (const row of (result.data || []) as Array<{ id: unknown; analise_semantica?: unknown }>) {
      semanticById.set(String(row.id), asRecord(row.analise_semantica));
    }
  }
  return semanticById;
}

async function readCatalogHits(client: SupabaseClient, brandId: string, keys: string[]) {
  const hits = new Map<string, SubjectDestinationCatalogHit>();
  if (!keys.length) return hits;
  const result = await client
    .from("brand_site_catalog_entries")
    .select(SUBJECT_IMPORT_CATALOG_COLUMNS)
    .eq("marca_id", brandId)
    .in("normalized_url", keys);
  // O catálogo é informativo e nunca bloqueia: sem leitura, a página fica "fora do catálogo".
  if (result.error) return hits;
  for (const row of (result.data || []) as Array<{ normalized_url?: unknown; page_type?: unknown; title?: unknown; h1?: unknown }>) {
    const key = typeof row.normalized_url === "string" ? row.normalized_url : "";
    if (!key || hits.has(key)) continue;
    const title = typeof row.title === "string" && row.title.trim() ? row.title.trim() : typeof row.h1 === "string" && row.h1.trim() ? row.h1.trim() : null;
    hits.set(key, { pageType: typeof row.page_type === "string" && row.page_type ? row.page_type as SitePageType : null, title });
  }
  return hits;
}

async function readRestorableDeleted(client: SupabaseClient, brandId: string, now: string) {
  const deleted = new Set<string>();
  const result = await client
    .from("minerador_keywords")
    .select(SUBJECT_IMPORT_DELETED_COLUMNS)
    .eq("brand_id", brandId)
    .not("deleted_at", "is", null)
    .gt("purge_after", now);
  // Aviso, não regra: sem a leitura, a prévia só deixa de avisar.
  if (result.error) return { deleted, available: false };
  for (const row of (result.data || []) as Array<{ keyword?: unknown }>) {
    const normalized = normalizeKeyword(row.keyword);
    if (normalized) deleted.add(normalized);
  }
  return { deleted, available: true };
}

function subjectImportBlock(input: { importRequestId: string | null; source: "manual" | "csv"; actorUserId: string; now: string }) {
  return {
    source: "subject_import",
    origin: input.source,
    importRequestId: input.importRequestId,
    importedAt: input.now,
    actorId: input.actorUserId,
  };
}

function emptyCounts(): SubjectImportCounts {
  return { total: 0, new: 0, existingWithoutSubject: 0, existingSubjectSame: 0, existingSubjectDifferent: 0, published: 0, invalid: 0, deletedVersions: 0 };
}

function countRows(rows: SubjectImportRow[]): SubjectImportCounts {
  const counts = emptyCounts();
  counts.total = rows.length;
  for (const row of rows) {
    if (row.classification === "new") counts.new += 1;
    else if (row.classification === "existing_without_subject") counts.existingWithoutSubject += 1;
    else if (row.classification === "existing_subject_same") counts.existingSubjectSame += 1;
    else if (row.classification === "existing_subject_different") counts.existingSubjectDifferent += 1;
    else if (row.classification === "published") counts.published += 1;
    else counts.invalid += 1;
    if (row.deletedVersion) counts.deletedVersions += 1;
  }
  return counts;
}

/**
 * Import de Assuntos pelo Processador, irmão de `importKeywordsWithCore`.
 *
 * - `preview` não escreve nada: classifica cada linha em nova, já existe sem
 *   Assunto, já existe como Assunto (igual ou diferente), publicada ou inválida.
 * - `apply` cria as novas como `bruto`, com a declaração (origem `import`) e a
 *   lista, e declara nas existentes SÓ os ids que o humano marcou
 *   (`declareExistingIds`). Existente já declarada com outra nota ou outro
 *   destino mantém o que está gravado.
 *
 * Leitura estreita (F1.9): `id,keyword,status,lista_id` das vivas da marca e
 * `analise_semantica` só das que casaram. Tudo filtrado por `brand_id`, que vem
 * da rota, nunca do corpo. O ator é `auth.users.id`.
 */
export async function importSubjectsWithCore(input: {
  brandId: string;
  actorUserId: string;
  supabase: SupabaseClient;
  mode: "preview" | "apply";
  source: "manual" | "csv";
  items: SubjectImportItem[];
  /** Ids de keywords existentes que o humano marcou para declarar. */
  declareExistingIds?: readonly string[];
  /** Obrigatório no `apply`: trava o envio em curso. */
  importRequestId?: string | null;
  /** Listas da marca (id, nome, marca_id), lidas pela rota. */
  lists?: LegacyImportList[];
  /** Lista padrão para as linhas sem lista. Só vale se for uma lista da marca. */
  defaultListaId?: string | null;
  /** `marcas.site_url`, lido no servidor para a marca da rota. */
  brandSiteUrl?: string | null;
  now?: string;
}): Promise<SubjectImportResult> {
  const brandId = typeof input.brandId === "string" ? input.brandId.trim() : "";
  if (!brandId) return { ok: false, code: "BRAND_REQUIRED", reason: "A marca ativa é necessária para importar Assuntos." };
  if (!isKeywordSubjectActorId(input.actorUserId)) {
    return { ok: false, code: "ACTOR_REQUIRED", reason: "Declarar Assunto exige o usuário autenticado (auth.users.id)." };
  }
  const actorUserId = input.actorUserId.trim();
  const importRequestId = typeof input.importRequestId === "string" && input.importRequestId.trim() ? input.importRequestId.trim() : null;
  if (input.mode === "apply" && !importRequestId) {
    return { ok: false, code: "IMPORT_REQUEST_REQUIRED", reason: "O envio precisa de um importRequestId." };
  }
  const lockKey = input.mode === "apply" && importRequestId ? subjectImportLockKey(brandId, importRequestId) : null;
  if (lockKey) {
    if (subjectImportsInFlight.has(lockKey)) {
      return { ok: false, code: "IMPORT_REQUEST_IN_PROGRESS", reason: "Este import já está em processamento. Aguarde o resultado antes de enviar de novo." };
    }
    subjectImportsInFlight.add(lockKey);
  }
  try {
    return await runSubjectImport({ ...input, brandId, actorUserId, importRequestId });
  } finally {
    if (lockKey) subjectImportsInFlight.delete(lockKey);
  }
}

async function runSubjectImport(input: {
  brandId: string;
  actorUserId: string;
  supabase: SupabaseClient;
  mode: "preview" | "apply";
  source: "manual" | "csv";
  items: SubjectImportItem[];
  declareExistingIds?: readonly string[];
  importRequestId: string | null;
  lists?: LegacyImportList[];
  defaultListaId?: string | null;
  brandSiteUrl?: string | null;
  now?: string;
}): Promise<SubjectImportResult> {
  const { brandId, actorUserId, supabase } = input;
  const now = input.now || new Date().toISOString();
  const lists = (input.lists || []).filter(list => list.marca_id === brandId);
  const defaultListaId = manualImportListaId({ selectedListId: input.defaultListaId || "", brandId, lists });
  const notices: string[] = [];

  const live = await readLiveKeywordPages<{ id: unknown; keyword?: unknown; status?: unknown; lista_id?: unknown }>(supabase, brandId, SUBJECT_IMPORT_LIVE_COLUMNS);
  const liveByKey = new Map<string, { id: string; status: string | null; lista_id: string | null }>();
  for (const row of live) {
    const normalized = normalizeKeyword(row.keyword);
    if (!normalized || liveByKey.has(normalized)) continue;
    liveByKey.set(normalized, {
      id: String(row.id),
      status: typeof row.status === "string" ? row.status : null,
      lista_id: typeof row.lista_id === "string" ? row.lista_id : null,
    });
  }

  // Primeira passada: normaliza, deduplica o lote e junta o que precisa de leitura.
  type Draft = { row: SubjectImportRow; rawDestination: string | null; noteOk: boolean };
  const drafts: Draft[] = [];
  const seen = new Set<string>();
  for (const [index, item] of input.items.entries()) {
    const keyword = typeof item.keyword === "string" ? item.keyword.trim() : "";
    const normalizedKeyword = normalizeKeyword(keyword);
    const row: SubjectImportRow = {
      index, keyword, normalizedKeyword, classification: "invalid", keywordId: null, status: null, published: false,
      approvalWarning: null, originLabel: null, note: null, destinationUrl: null, listaId: null, recorded: null,
      deletedVersion: false, notices: [], reason: null,
    };
    const rawDestination = typeof item.destinationUrl === "string" && item.destinationUrl.trim() ? item.destinationUrl.trim() : null;
    if (!normalizedKeyword) {
      row.reason = "Frase vazia.";
      drafts.push({ row, rawDestination, noteOk: false });
      continue;
    }
    if (seen.has(normalizedKeyword)) {
      row.reason = "Repetida neste arquivo: vale a primeira ocorrência.";
      drafts.push({ row, rawDestination, noteOk: false });
      continue;
    }
    seen.add(normalizedKeyword);
    const note = normalizeKeywordSubjectNote(typeof item.note === "string" ? item.note : null);
    if (!note.ok) {
      row.reason = note.reason;
      drafts.push({ row, rawDestination, noteOk: false });
      continue;
    }
    row.note = note.note;
    drafts.push({ row, rawDestination, noteOk: true });
  }

  const valid = drafts.filter(draft => draft.noteOk);
  const matchedIds = [...new Set(valid.map(draft => liveByKey.get(draft.row.normalizedKeyword)?.id).filter((id): id is string => Boolean(id)))];
  const semanticById = await readSemanticByIds(supabase, brandId, matchedIds);
  // Só busca no catálogo a página que já passou na regra obrigatória (https e domínio da marca).
  const catalogKeys = [...new Set(valid
    .filter(draft => {
      const check = validateSubjectDestination({ rawUrl: draft.rawDestination, brandSiteUrl: input.brandSiteUrl, checkedAt: now });
      return check.ok && check.code === "ACCEPTED";
    })
    .map(draft => subjectDestinationCatalogKey(input.brandSiteUrl, draft.rawDestination))
    .filter((key): key is string => Boolean(key)))];
  const catalog = await readCatalogHits(supabase, brandId, catalogKeys);
  const deleted = input.mode === "preview" ? await readRestorableDeleted(supabase, brandId, now) : { deleted: new Set<string>(), available: false };
  const checksByIndex = new Map<number, ReturnType<typeof validateSubjectDestination>>();

  for (const draft of valid) {
    const { row } = draft;
    const key = subjectDestinationCatalogKey(input.brandSiteUrl, draft.rawDestination);
    const destination = validateSubjectDestination({
      rawUrl: draft.rawDestination,
      brandSiteUrl: input.brandSiteUrl,
      checkedAt: now,
      catalog: key ? catalog.get(key) ?? null : null,
    });
    if (!destination.ok) {
      row.reason = destination.reason;
      draft.noteOk = false;
      continue;
    }
    checksByIndex.set(row.index, destination);
    row.destinationUrl = destination.destinationUrl;
    if (destination.notice) row.notices.push(destination.notice);

    const existing = liveByKey.get(row.normalizedKeyword);
    if (!existing) {
      const reference = typeof input.items[row.index]?.listaReference === "string" ? input.items[row.index].listaReference!.trim() : "";
      if (reference) {
        const resolved = resolveLegacyCsvSilo({ rawReference: reference, brandId, lists });
        row.listaId = resolved.listaId;
        if (!resolved.listaId) row.notices.push(SUBJECT_IMPORT_LIST_NOT_FOUND_NOTICE);
      } else {
        row.listaId = defaultListaId;
      }
      row.classification = "new";
      if (deleted.deleted.has(row.normalizedKeyword)) {
        row.deletedVersion = true;
        row.notices.push(SUBJECT_IMPORT_DELETED_NOTICE);
      }
      continue;
    }

    const semantic = semanticById.get(existing.id) || {};
    const subject = resolveKeywordSubject(semantic);
    row.keywordId = existing.id;
    row.status = existing.status;
    row.listaId = existing.lista_id;
    row.published = isKeywordPublished({ status: existing.status, semantic });
    row.originLabel = originLabelFor(semantic);
    if (subject.declared) {
      row.recorded = { note: subject.note, destinationUrl: subject.destinationUrl };
      const same = subject.note === row.note && subject.destinationUrl === row.destinationUrl;
      row.classification = same ? "existing_subject_same" : "existing_subject_different";
      if (!same) row.notices.push(SUBJECT_IMPORT_KEPT_NOTICE);
      continue;
    }
    row.classification = row.published ? "published" : "existing_without_subject";
    if (existing.status === "aprovado") row.approvalWarning = SUBJECT_IMPORT_APPROVAL_WARNING;
  }

  const rows = drafts.map(draft => draft.row);
  if (rows.some(row => row.notices.includes(SUBJECT_DESTINATION_NO_BRAND_SITE_NOTICE))) notices.push(SUBJECT_DESTINATION_NO_BRAND_SITE_NOTICE);
  if (input.mode === "preview" && !deleted.available) notices.push("Não foi possível conferir versões apagadas desta marca; a prévia segue sem esse aviso.");
  if (input.mode === "preview") {
    return { ok: true, mode: "preview", rows, counts: countRows(rows), createdIds: [], declaredIds: [], failed: 0, notices };
  }

  // Apply: só escreve o que a prévia mostraria, relido agora do banco.
  const marked = new Set((input.declareExistingIds || []).map(id => String(id)));
  const block = subjectImportBlock({ importRequestId: input.importRequestId, source: input.source, actorUserId, now });
  const createdIds: string[] = [];
  const declaredIds: string[] = [];
  let failed = 0;

  for (const row of rows) {
    if (row.classification === "invalid") { row.outcome = "invalid"; continue; }
    if (row.classification === "existing_subject_same") { row.outcome = "unchanged"; continue; }
    if (row.classification === "existing_subject_different") { row.outcome = "kept"; continue; }
    const destination = checksByIndex.get(row.index);
    const destinationUrl = destination && destination.ok ? destination.destinationUrl : null;
    const destinationCheck = destination && destination.ok ? destination.destinationCheck : null;

    if (row.classification === "new") {
      const declared = setKeywordSubject({ subject_import: block }, { note: row.note, destinationUrl, destinationCheck, actorId: actorUserId, changedAt: now, origin: "import" });
      if (!declared.ok) { row.outcome = "failed"; row.reason = declared.reason; failed += 1; continue; }
      const insert = await supabase
        .from("minerador_keywords")
        .insert({ keyword: row.keyword, brand_id: brandId, lista_id: row.listaId, status: "bruto", analise_semantica: declared.semantic })
        .select("id")
        .single();
      if (!insert.error && insert.data?.id) {
        row.keywordId = String(insert.data.id);
        row.outcome = "created";
        createdIds.push(row.keywordId);
        continue;
      }
      // Corrida: outro envio criou a mesma frase. Não se declara em silêncio o
      // que o humano não marcou; a linha volta como existente.
      const concurrent = await readLiveKeywordPages<{ id: unknown; keyword?: unknown }>(supabase, brandId, "id,keyword").catch(() => null);
      const match = concurrent ? concurrent.find(item => normalizeKeyword(item.keyword) === row.normalizedKeyword) : null;
      if (match) {
        row.keywordId = String(match.id);
        row.outcome = "unchanged";
        row.notices.push("Criada ao mesmo tempo por outro envio: nada foi regravado.");
        continue;
      }
      row.outcome = "failed";
      row.reason = `Não foi possível criar a keyword (${safeDatabaseErrorCode(insert.error)}).`;
      failed += 1;
      continue;
    }

    // Existente sem Assunto, publicada ou não: só com a marcação do humano.
    if (!row.keywordId || !marked.has(row.keywordId)) { row.outcome = "not_marked"; continue; }
    // "Ausente" não é "vazio": sem ler o DNA atual, gravar partiria do nada e
    // apagaria a Lógica, as medições e a aprovação da keyword.
    if (!semanticById.has(row.keywordId)) {
      row.outcome = "failed";
      row.reason = "Não foi possível ler o DNA atual desta keyword; nada foi gravado.";
      failed += 1;
      continue;
    }
    const semantic = semanticById.get(row.keywordId) || {};
    const declared = setKeywordSubject({ ...semantic, subject_import: block }, { note: row.note, destinationUrl, destinationCheck, actorId: actorUserId, changedAt: now, origin: "import" });
    if (!declared.ok) { row.outcome = "failed"; row.reason = declared.reason; failed += 1; continue; }
    if (!declared.changed) { row.outcome = "unchanged"; continue; }
    const update = await supabase
      .from("minerador_keywords")
      .update({ analise_semantica: declared.semantic })
      .eq("id", row.keywordId)
      .eq("brand_id", brandId)
      .is("deleted_at", null)
      .select("id");
    const updatedRows = (update.data || []) as Array<{ id: unknown }>;
    if (update.error || !updatedRows.some(item => String(item.id) === row.keywordId)) {
      row.outcome = "failed";
      row.reason = update.error ? `Não foi possível declarar (${safeDatabaseErrorCode(update.error)}).` : "A keyword não foi encontrada viva nesta marca.";
      failed += 1;
      continue;
    }
    row.outcome = "declared";
    declaredIds.push(row.keywordId);
  }

  return { ok: true, mode: "apply", rows, counts: countRows(rows), createdIds, declaredIds, failed, notices };
}
