import type { SupabaseClient } from "@supabase/supabase-js";
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

async function findExistingByKeyword(client: SupabaseClient, brandId: string, normalized: string) {
  const result = await client
    .from("minerador_keywords")
    .select("id,keyword,brand_id,lista_id,status,analise_semantica")
    .eq("brand_id", brandId);
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
    .eq("brand_id", input.brandId);
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
    if (previous) {
      const semantic = buildSemanticEvidence(item, previous.analise_semantica, now);
      const update = await input.supabase
        .from("minerador_keywords")
        .update({ analise_semantica: semantic })
        .eq("id", previous.id)
        .eq("brand_id", input.brandId);
      if (update.error) {
        failed += 1;
        resultItems.push({ index, keyword: item.keyword, normalizedKeyword, outcome: "failed", keywordId: previous.id, reason: "existing_evidence_update_failed", errorCode: safeDatabaseErrorCode(update.error) });
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
    if (concurrent) {
      const semantic = buildSemanticEvidence(item, concurrent.analise_semantica, now);
      const update = await input.supabase
      .from("minerador_keywords")
        .update({ analise_semantica: semantic })
        .eq("id", concurrent.id)
        .eq("brand_id", input.brandId);
      if (!update.error) {
        existingByKey.set(normalizedKeyword, concurrent);
        existing += 1;
        resultItems.push({ index, keyword: item.keyword, normalizedKeyword, outcome: "existing", keywordId: concurrent.id, metadataUpdated: true, reason: "keyword_created_concurrently" });
        continue;
      }
      concurrentUpdateError = update.error;
    }
    failed += 1;
    resultItems.push({ index, keyword: item.keyword, normalizedKeyword, outcome: "failed", reason: "keyword_insert_failed", errorCode: safeDatabaseErrorCode(concurrentUpdateError || concurrentLookupError || insert.error) });
  }

  return { items: resultItems, created, existing, duplicates, failed };
}
