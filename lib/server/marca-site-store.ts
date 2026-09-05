import "server-only";

import type { PipelineContext } from "./pipeline-runtime";
import { PipelineRuntimeError, pipelineErrorFromSupabase } from "./pipeline-runtime";
import {
  applyCatalogSync,
  BrandSitemapRecordSchema,
  BrandSiteSnapshotSchema,
  SiteCatalogEntryRecordSchema,
  SiteSyncRunRecordSchema,
  emptyBrandSiteSnapshot,
  resolveLastKnownGoodRun,
  type BrandSiteSnapshot,
  type BrandSitemapRecord,
  type SiteCatalogEntryRecord,
  type SiteSyncRunRecord,
} from "@/lib/marca/site-persistence-contracts";
import {
  buildFinalizeSyncArgs,
  classifyFinalizeSyncError,
  FINALIZE_SYNC_RPC,
  parseFinalizeSyncResult,
  resolveSyncOutcome,
  type FinalizeSyncResult,
} from "@/lib/marca/site-sync-finalization";
import { brandCanonicalSiteKey } from "@/lib/marca/site-canonical-url";

/**
 * Repositório remoto do patrimônio de Site da Marca (A2).
 *
 * Lê `brand_site_sitemaps`, `brand_site_sync_runs` e `brand_site_catalog_entries`
 * — as três tabelas que já existem. Nenhuma migration, nenhuma tabela paralela,
 * nenhuma regra duplicada: a decisão sobre presença, last-known-good e
 * promoção vive nos contratos puros de `site-persistence-contracts.ts` e na RPC
 * `finalize_brand_site_sync`.
 *
 * Isolamento por Brand é do `PipelineContext`: `marca_id = context.brandId`,
 * ator autenticado, associação já validada pelo runtime do pipeline. Nenhuma
 * consulta aqui aceita brandId vindo do cliente.
 */

/* ------------------------------- mapeamento ------------------------------ */

const text = (value: unknown): string | null => {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
};

const timestamp = (value: unknown): string | null => text(value);

const count = (value: unknown): number => {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? Math.trunc(parsed) : 0;
};

type Row = Record<string, unknown>;

function sitemapFromRow(row: Row): BrandSitemapRecord {
  return BrandSitemapRecordSchema.parse({
    id: String(row.id),
    brandId: String(row.marca_id),
    url: String(row.url),
    normalizedUrl: String(row.normalized_url),
    sitemapType: row.sitemap_type,
    parentSitemapId: text(row.parent_sitemap_id),
    enabled: Boolean(row.enabled),
    status: row.status,
    lastTestedAt: timestamp(row.last_tested_at),
    lastSyncedAt: timestamp(row.last_synced_at),
    lastSuccessfulRunId: text(row.last_successful_run_id),
    lockVersion: count(row.lock_version) || 1,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  });
}

function runFromRow(row: Row): SiteSyncRunRecord {
  return SiteSyncRunRecordSchema.parse({
    id: String(row.id),
    brandId: String(row.marca_id),
    sitemapId: String(row.sitemap_id),
    status: row.status,
    foundCount: count(row.found_count),
    newCount: count(row.new_count),
    updatedCount: count(row.updated_count),
    missingCount: count(row.missing_count),
    errorCount: count(row.error_count),
    durationMs: count(row.duration_ms),
    errorMessage: text(row.error_message),
    startedAt: String(row.started_at),
    completedAt: timestamp(row.completed_at),
  });
}

function catalogEntryFromRow(row: Row): SiteCatalogEntryRecord {
  return SiteCatalogEntryRecordSchema.parse({
    id: String(row.id),
    brandId: String(row.marca_id),
    normalizedUrl: String(row.normalized_url),
    discoveredUrl: String(row.discovered_url),
    resolvedUrl: text(row.resolved_url),
    declaredCanonicalUrl: text(row.declared_canonical_url),
    normalizedCanonicalUrl: text(row.normalized_canonical_url),
    title: text(row.title),
    h1: text(row.h1),
    metaDescription: text(row.meta_description),
    pageType: row.page_type,
    indexability: row.indexability,
    verificationStatus: row.verification_status,
    sourceSitemapId: text(row.source_sitemap_id),
    sitemapLastmod: timestamp(row.sitemap_lastmod),
    presenceState: row.presence_state,
    firstSeenAt: String(row.first_seen_at),
    firstSeenRunId: text(row.first_seen_run_id),
    lastSeenAt: String(row.last_seen_at),
    lastSeenRunId: text(row.last_seen_run_id),
    lastVerifiedAt: timestamp(row.last_verified_at),
    importStatus: row.import_status,
    origin: row.origin,
    ignoredAt: timestamp(row.ignored_at),
  });
}

/* --------------------------------- leitura ------------------------------- */

/**
 * Snapshot remoto canônico do Site da Marca.
 *
 * Brand sem sitemap devolve snapshot VÁLIDO e vazio — ausência de patrimônio é
 * estado legítimo, nunca erro. Nenhuma coleta é disparada por leitura.
 *
 * O last-known-good não é adivinhado: sai de `resolveLastKnownGoodRun` sobre as
 * execuções lidas, a mesma regra que a RPC aplica do lado do banco.
 */
export async function readBrandSiteSnapshot(context: PipelineContext): Promise<BrandSiteSnapshot> {
  const [brandResult, sitemapResult] = await Promise.all([
    context.supabase.from("marcas").select("site_url").eq("id", context.brandId).maybeSingle(),
    context.supabase.from("brand_site_sitemaps").select("*").eq("marca_id", context.brandId).order("created_at", { ascending: true }),
  ]);
  if (brandResult.error) throw pipelineErrorFromSupabase(brandResult.error);
  if (sitemapResult.error) throw pipelineErrorFromSupabase(sitemapResult.error);

  const siteUrl = text(brandResult.data?.site_url);
  const sitemaps = (sitemapResult.data || []).map(row => sitemapFromRow(row as Row));
  if (!sitemaps.length) return emptyBrandSiteSnapshot(context.brandId, siteUrl);

  const [runResult, catalogResult] = await Promise.all([
    context.supabase.from("brand_site_sync_runs").select("*").eq("marca_id", context.brandId)
      .order("started_at", { ascending: false }).limit(200),
    context.supabase.from("brand_site_catalog_entries").select("*").eq("marca_id", context.brandId)
      .order("normalized_url", { ascending: true }),
  ]);
  if (runResult.error) throw pipelineErrorFromSupabase(runResult.error);
  if (catalogResult.error) throw pipelineErrorFromSupabase(catalogResult.error);

  const runs = (runResult.data || []).map(row => runFromRow(row as Row));
  const catalog = (catalogResult.data || []).map(row => catalogEntryFromRow(row as Row));
  const lastSuccessfulRun = resolveLastKnownGoodRun(runs);

  return BrandSiteSnapshotSchema.parse({
    brandId: context.brandId,
    siteUrl,
    sitemaps,
    lastSuccessfulRun,
    catalog,
    freshness: {
      // Frescor é do último sync BEM-SUCEDIDO: uma execução falha não envelhece
      // nem rejuvenesce o patrimônio confirmado.
      lastSyncedAt: lastSuccessfulRun?.completedAt ?? null,
      neverSynced: !lastSuccessfulRun,
    },
  });
}

/** URLs canônicas do catálogo remoto, para comparar com o estado local. */
export function remoteCatalogUrls(snapshot: BrandSiteSnapshot): string[] {
  return snapshot.catalog.map(entry => entry.normalizedUrl).sort();
}

/* --------------------------------- escrita ------------------------------- */

/**
 * Abre uma execução de coleta.
 *
 * O `runId` é emitido pelo banco e passa a ser a identidade de TODA a coleta:
 * cada URL observada carimba `last_seen_run_id = runId`, e é esse carimbo que a
 * RPC usa depois para provar que o conjunto declarado é o conjunto ingerido.
 *
 * Recusa abrir uma segunda execução enquanto houver uma `running` no mesmo
 * sitemap: sem isso, duas coletas simultâneas sobrescreveriam o carimbo uma da
 * outra e a finalização da primeira morreria em `OBSERVED_SET_MISMATCH`.
 */
export async function startBrandSiteSync(
  context: PipelineContext,
  input: { sitemapId: string },
): Promise<{ runId: string; startedAt: string; sitemap: BrandSitemapRecord }> {
  const sitemapResult = await context.supabase
    .from("brand_site_sitemaps").select("*")
    .eq("marca_id", context.brandId).eq("id", input.sitemapId).maybeSingle();
  if (sitemapResult.error) throw pipelineErrorFromSupabase(sitemapResult.error);
  if (!sitemapResult.data) {
    throw new PipelineRuntimeError("NOT_AUTHORIZED", "O sitemap não pertence à Marca ativa.", 403);
  }
  const sitemap = sitemapFromRow(sitemapResult.data as Row);

  const runningResult = await context.supabase
    .from("brand_site_sync_runs").select("id")
    .eq("marca_id", context.brandId).eq("sitemap_id", input.sitemapId).eq("status", "running").limit(1);
  if (runningResult.error) throw pipelineErrorFromSupabase(runningResult.error);
  if (runningResult.data?.length) {
    throw new PipelineRuntimeError("CONFLICT", "Já existe uma sincronização em andamento para este sitemap.", 409);
  }

  const created = await context.supabase
    .from("brand_site_sync_runs")
    .insert({
      marca_id: context.brandId,
      sitemap_id: input.sitemapId,
      status: "running",
      created_by: context.actorUserId,
    })
    .select("*")
    .single();
  if (created.error) throw pipelineErrorFromSupabase(created.error);
  const run = runFromRow(created.data as Row);
  return { runId: run.id, startedAt: run.startedAt, sitemap };
}

/** Observação de uma URL, já classificada pela coleta. */
export type ObservedCatalogPage = {
  normalizedUrl: string;
  discoveredUrl: string;
  sourceSitemapId: string | null;
  sitemapLastmod: string | null;
  resolvedUrl?: string | null;
  declaredCanonicalUrl?: string | null;
  normalizedCanonicalUrl?: string | null;
  title?: string | null;
  h1?: string | null;
  metaDescription?: string | null;
  pageType?: SiteCatalogEntryRecord["pageType"];
  indexability?: SiteCatalogEntryRecord["indexability"];
  verificationStatus?: SiteCatalogEntryRecord["verificationStatus"];
};

export type CatalogIngestionResult = {
  persistedObservedUrls: string[];
  foundCount: number;
  newCount: number;
  updatedCount: number;
  ingestionComplete: boolean;
};

/**
 * Ingestão do catálogo — a etapa que a RPC NÃO faz.
 *
 * A decisão de o que cada linha vira sai de `applyCatalogSync`, o contrato puro
 * que já existe: `firstSeen*` e decisão humana (`importStatus`, `ignoredAt`)
 * nunca são sobrescritos, e `lastSeen*` acompanha a execução corrente. A
 * execução é tratada como `partial` aqui de propósito: ausência é conclusão da
 * finalização, e marcar `missing` antes da RPC seria decidir cedo demais.
 */
export async function upsertObservedCatalog(
  context: PipelineContext,
  input: { runId: string; startedAt: string; observations: readonly ObservedCatalogPage[] },
): Promise<CatalogIngestionResult> {
  const existingResult = await context.supabase
    .from("brand_site_catalog_entries").select("*").eq("marca_id", context.brandId);
  if (existingResult.error) throw pipelineErrorFromSupabase(existingResult.error);
  const existing = (existingResult.data || []).map(row => catalogEntryFromRow(row as Row));

  const observed = input.observations.map(page => ({
    normalizedUrl: page.normalizedUrl,
    discoveredUrl: page.discoveredUrl,
    sourceSitemapId: page.sourceSitemapId,
    sitemapLastmod: page.sitemapLastmod,
  }));
  const outcome = applyCatalogSync({
    existing,
    observed,
    brandId: context.brandId,
    run: { id: input.runId, status: "partial", startedAt: input.startedAt, completedAt: null },
  });
  if (!outcome.applied) {
    throw new PipelineRuntimeError("CONFLICT", "A execução não está apta a promover observações.", 409);
  }

  const observedByUrl = new Map(input.observations.map(page => [page.normalizedUrl, page]));
  const rows = outcome.entries
    .filter(entry => observedByUrl.has(entry.normalizedUrl))
    .map(entry => {
      const page = observedByUrl.get(entry.normalizedUrl)!;
      return {
        marca_id: context.brandId,
        normalized_url: entry.normalizedUrl,
        discovered_url: entry.discoveredUrl,
        resolved_url: page.resolvedUrl ?? entry.resolvedUrl,
        declared_canonical_url: page.declaredCanonicalUrl ?? entry.declaredCanonicalUrl,
        normalized_canonical_url: page.normalizedCanonicalUrl ?? entry.normalizedCanonicalUrl,
        title: page.title ?? entry.title,
        h1: page.h1 ?? entry.h1,
        meta_description: page.metaDescription ?? entry.metaDescription,
        page_type: page.pageType ?? entry.pageType,
        indexability: page.indexability ?? entry.indexability,
        verification_status: page.verificationStatus ?? entry.verificationStatus,
        source_sitemap_id: entry.sourceSitemapId,
        sitemap_lastmod: entry.sitemapLastmod,
        // Presença corrente é observação; ausência é conclusão da RPC.
        presence_state: "present",
        first_seen_at: entry.firstSeenAt,
        first_seen_run_id: entry.firstSeenRunId,
        last_seen_at: entry.lastSeenAt,
        last_seen_run_id: input.runId,
        last_verified_at: entry.lastVerifiedAt,
        // Decisão humana atravessa intacta; o sync nunca a reescreve.
        import_status: entry.importStatus,
        origin: entry.origin,
        ignored_at: entry.ignoredAt,
        created_by: context.actorUserId,
        updated_by: context.actorUserId,
      };
    });

  if (!rows.length) {
    return {
      persistedObservedUrls: [],
      foundCount: input.observations.length,
      newCount: 0,
      updatedCount: 0,
      ingestionComplete: true,
    };
  }

  // Identidade da linha é (marca_id, normalized_url) — a constraint declarada na
  // migration. Nenhuma aproximação por título, slug ou caminho.
  const written = await context.supabase
    .from("brand_site_catalog_entries")
    .upsert(rows, { onConflict: "marca_id,normalized_url" })
    .select("normalized_url");
  if (written.error) throw pipelineErrorFromSupabase(written.error);
  const persisted = new Set((written.data || []).map(row => String((row as Row).normalized_url)));

  return {
    persistedObservedUrls: [...persisted].sort(),
    foundCount: input.observations.length,
    newCount: outcome.summary.newCount,
    updatedCount: outcome.summary.updatedCount,
    // Ingestão incompleta não pode virar `completed` lá na frente.
    ingestionComplete: rows.every(row => persisted.has(row.normalized_url)),
  };
}

/**
 * Finalização transacional. O status terminal NÃO é escolhido aqui: sai de
 * `resolveSyncOutcome` a partir do que realmente foi persistido. Sucesso só
 * existe depois de `parseFinalizeSyncResult` conferir o readback do banco.
 */
export async function finalizeBrandSiteSync(
  context: PipelineContext,
  input: {
    runId: string;
    ingestion: CatalogIngestionResult;
    crawlErrorCount: number;
    durationMs: number;
    errorMessage: string | null;
  },
): Promise<FinalizeSyncResult> {
  const outcome = resolveSyncOutcome({
    persistedObservedUrls: input.ingestion.persistedObservedUrls,
    crawlErrorCount: input.crawlErrorCount,
    ingestionComplete: input.ingestion.ingestionComplete,
  });
  const args = buildFinalizeSyncArgs({
    brandId: context.brandId,
    actorUserId: context.actorUserId,
    runId: input.runId,
    outcome,
    persistedObservedUrls: input.ingestion.persistedObservedUrls,
    foundCount: input.ingestion.foundCount,
    newCount: input.ingestion.newCount,
    updatedCount: input.ingestion.updatedCount,
    durationMs: input.durationMs,
    crawlErrorCount: input.crawlErrorCount,
    errorMessage: input.errorMessage || (outcome.status === "completed" ? null : outcome.reason),
  });

  const result = await context.supabase.rpc(FINALIZE_SYNC_RPC, args);
  if (result.error) {
    // Divergência de conjunto é falha de sync, nunca algo a "corrigir" calado.
    const code = classifyFinalizeSyncError(result.error.message);
    if (code) throw new PipelineRuntimeError("CONFLICT", `A finalização do sitemap foi recusada: ${code}.`, 409);
    throw pipelineErrorFromSupabase(result.error);
  }
  return parseFinalizeSyncResult(result.data);
}

/**
 * Encerra uma coleta que não pode continuar.
 *
 * Não força `failed`: se alguma observação já foi carimbada por esta execução, o
 * banco recusa `failed`, e o resultado honesto é `partial`. Em nenhum dos dois
 * casos o last-known-good anterior é substituído.
 */
export async function failBrandSiteSync(
  context: PipelineContext,
  input: { runId: string; message: string; durationMs: number; ingestion?: CatalogIngestionResult },
): Promise<FinalizeSyncResult> {
  const ingestion = input.ingestion ?? {
    persistedObservedUrls: [], foundCount: 0, newCount: 0, updatedCount: 0, ingestionComplete: false,
  };
  return finalizeBrandSiteSync(context, {
    runId: input.runId,
    ingestion: { ...ingestion, ingestionComplete: false },
    crawlErrorCount: 1,
    durationMs: input.durationMs,
    errorMessage: input.message,
  });
}

/**
 * Registra um sitemap da Marca no remoto.
 *
 * Pré-requisito do writer: sem linha em `brand_site_sitemaps` não existe
 * execução, e a coleta não teria a quem se ancorar. A identidade é a chave
 * canônica da Brand (`brandCanonicalSiteKey`), a mesma que a migration declara
 * — endereço fora da origem da Marca não recebe chave e é recusado aqui.
 *
 * Idempotente por identidade: registrar o mesmo sitemap devolve o existente em
 * vez de duplicar.
 */
export async function registerBrandSitemap(
  context: PipelineContext,
  input: { url: string; sitemapType?: BrandSitemapRecord["sitemapType"] },
): Promise<BrandSitemapRecord> {
  const brandResult = await context.supabase
    .from("marcas").select("site_url").eq("id", context.brandId).maybeSingle();
  if (brandResult.error) throw pipelineErrorFromSupabase(brandResult.error);
  const siteUrl = text(brandResult.data?.site_url);
  if (!siteUrl) {
    throw new PipelineRuntimeError("INVALID_CONTEXT", "Cadastre o site principal da Marca antes de registrar um sitemap.", 400);
  }

  const normalizedUrl = brandCanonicalSiteKey(siteUrl, input.url);
  if (!normalizedUrl) {
    throw new PipelineRuntimeError("INVALID_CONTEXT", "O sitemap precisa pertencer ao domínio principal da Marca.", 400);
  }

  const existing = await context.supabase
    .from("brand_site_sitemaps").select("*")
    .eq("marca_id", context.brandId).eq("normalized_url", normalizedUrl).maybeSingle();
  if (existing.error) throw pipelineErrorFromSupabase(existing.error);
  if (existing.data) return sitemapFromRow(existing.data as Row);

  const created = await context.supabase
    .from("brand_site_sitemaps")
    .insert({
      marca_id: context.brandId,
      url: input.url.trim(),
      normalized_url: normalizedUrl,
      sitemap_type: input.sitemapType || "principal",
      created_by: context.actorUserId,
      updated_by: context.actorUserId,
    })
    .select("*")
    .single();
  if (created.error) throw pipelineErrorFromSupabase(created.error);
  return sitemapFromRow(created.data as Row);
}

/* --------------------- verificação de página (remoto) -------------------- */

/** Fatos observados de UMA página. Nada aqui é decisão humana. */
export type PageVerificationObservation = {
  /** Identidade da linha: a mesma chave canônica do catálogo. */
  normalizedUrl: string;
  resolvedUrl: string | null;
  declaredCanonicalUrl: string | null;
  normalizedCanonicalUrl: string | null;
  title: string | null;
  h1: string | null;
  metaDescription: string | null;
  pageType: SiteCatalogEntryRecord["pageType"];
  indexability: SiteCatalogEntryRecord["indexability"];
  verificationStatus: SiteCatalogEntryRecord["verificationStatus"];
  verifiedAt: string;
};

export type PageVerificationOutcome = {
  verified: string[];
  refused: string[];
  entries: SiteCatalogEntryRecord[];
};

/**
 * Grava fatos observados de página no catálogo remoto.
 *
 * Atualiza a linha que JÁ existe, pela identidade `(marca_id, normalized_url)` —
 * nunca cria uma segunda entrada para a mesma página. Só colunas de OBSERVAÇÃO
 * são tocadas: `import_status`, `ignored_at`, `origin`, `first_seen*`,
 * `last_seen*` e `presence_state` pertencem ao sync e à decisão humana, e
 * atravessam intactos.
 *
 * Página que não está no catálogo é recusada em vez de inventar linha: o
 * catálogo nasce do sitemap, não da verificação avulsa.
 */
export async function applyPageVerifications(
  context: PipelineContext,
  input: { observations: readonly PageVerificationObservation[] },
): Promise<PageVerificationOutcome> {
  if (!input.observations.length) return { verified: [], refused: [], entries: [] };

  const existingResult = await context.supabase
    .from("brand_site_catalog_entries").select("*").eq("marca_id", context.brandId);
  if (existingResult.error) throw pipelineErrorFromSupabase(existingResult.error);
  const existing = new Map((existingResult.data || [])
    .map(row => [String((row as Row).normalized_url), catalogEntryFromRow(row as Row)]));

  const refused: string[] = [];
  const rows = [];
  for (const observation of input.observations) {
    const current = existing.get(observation.normalizedUrl);
    if (!current) { refused.push(observation.normalizedUrl); continue; }
    rows.push({
      marca_id: context.brandId,
      normalized_url: current.normalizedUrl,
      // Como foi descoberta nunca é reescrita pela verificação.
      discovered_url: current.discoveredUrl,
      resolved_url: observation.resolvedUrl,
      declared_canonical_url: observation.declaredCanonicalUrl,
      normalized_canonical_url: observation.normalizedCanonicalUrl,
      title: observation.title,
      h1: observation.h1,
      meta_description: observation.metaDescription,
      page_type: observation.pageType,
      indexability: observation.indexability,
      verification_status: observation.verificationStatus,
      // Presença e histórico de coleta pertencem ao sync, não à verificação.
      source_sitemap_id: current.sourceSitemapId,
      sitemap_lastmod: current.sitemapLastmod,
      presence_state: current.presenceState,
      first_seen_at: current.firstSeenAt,
      first_seen_run_id: current.firstSeenRunId,
      last_seen_at: current.lastSeenAt,
      last_seen_run_id: current.lastSeenRunId,
      last_verified_at: observation.verifiedAt,
      // Decisão humana atravessa intacta.
      import_status: current.importStatus,
      origin: current.origin,
      ignored_at: current.ignoredAt,
      created_by: context.actorUserId,
      updated_by: context.actorUserId,
    });
  }

  if (!rows.length) return { verified: [], refused, entries: [] };

  const written = await context.supabase
    .from("brand_site_catalog_entries")
    .upsert(rows, { onConflict: "marca_id,normalized_url" })
    .select("*");
  if (written.error) throw pipelineErrorFromSupabase(written.error);

  // Readback: verificação só é persistida quando o remoto devolve a linha.
  const entries = (written.data || []).map(row => catalogEntryFromRow(row as Row));
  return { verified: entries.map(entry => entry.normalizedUrl).sort(), refused, entries };
}

/**
 * Entradas que ainda pedem verificação.
 *
 * O valor está justamente nas não resolvidas: `discovered` nunca foi observada,
 * e `stale` pede reobservação. Já verificadas ficam de fora por padrão para não
 * repetir requisição sem motivo.
 */
export function catalogEntriesPendingVerification(
  snapshot: BrandSiteSnapshot,
  options: { includeVerified?: boolean } = {},
): SiteCatalogEntryRecord[] {
  return snapshot.catalog.filter(entry => {
    if (entry.presenceState !== "present") return false;
    if (options.includeVerified) return true;
    return entry.verificationStatus === "discovered" || entry.verificationStatus === "stale";
  });
}
