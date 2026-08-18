import { NextRequest, NextResponse } from "next/server";
import { z, ZodError } from "zod";
import { isTenantId } from "@/lib/tenant-routing";
import { AuthzError, requireCanonicalSessionProfile } from "@/lib/server/authz";
import { requireTenantPermission } from "@/lib/server/tenant-context";
import { resolveLegacyCsvSilo, type LegacyImportList } from "@/lib/minerador/legacy-import";
import { normalizeKeyword } from "@/lib/minerador/keyword-import-core";
import { mapDiscoveryCandidateRow } from "@/lib/minerador/discovery-candidate-adapter";
import { buildDiscoverySourceCandidateRows, buildDiscoverySourceRunRow, normalizeDiscoverySourceEntries, type DiscoverySourceEntryInput } from "@/lib/minerador/discovery-sources";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const SourceEntrySchema = z.object({
  keyword: z.any(),
  listaId: z.string().trim().max(120).optional(),
  listaReference: z.string().trim().max(240).optional(),
  location: z.string().trim().max(160).optional(),
  intent: z.string().trim().max(120).optional(),
  funnel: z.string().trim().max(40).optional(),
  importedMetrics: z.object({
    averageMonthlySearches: z.union([z.number(), z.string(), z.null()]).optional(),
    cpc: z.union([z.string(), z.number(), z.null()]).optional(),
    competition: z.union([z.string(), z.null()]).optional(),
    competitionIndex: z.union([z.number(), z.string(), z.null()]).optional(),
    resultsAllintitle: z.union([z.number(), z.string(), z.null()]).optional(),
  }).nullable().optional(),
  // Rich CSVs may contain many columns outside the discovery contract. Keep
  // the field names as provenance, but do not reject an otherwise valid
  // keyword only because the file has more than forty ignored columns.
  recognizedFields: z.array(z.string().trim().max(120)).max(200).optional(),
  ignoredFields: z.array(z.string().trim().max(120)).max(200).optional(),
}).passthrough();

const SourceRequestSchema = z.object({
  operationRequestId: z.string().uuid(),
  source: z.enum(["manual", "csv"]),
  entries: z.array(SourceEntrySchema).min(1).max(5000),
  preliminaryIntent: z.string().trim().max(120).default("Não definida"),
  preliminaryFunnel: z.string().trim().max(40).default("Não definido"),
});

function failure(code: string, status: number, message: string, diagnostic: Record<string, unknown> = {}, stage = "source_validation") {
  return NextResponse.json({ success: false, code, stage, message, diagnostic }, { status });
}

function safeDatabaseError(error: unknown) {
  const value = error && typeof error === "object" ? error as { code?: unknown; message?: unknown } : {};
  return {
    databaseCode: typeof value.code === "string" && /^[A-Z0-9_ -]{1,40}$/.test(value.code) ? value.code : "database_error",
    databaseMessage: typeof value.message === "string" ? value.message.slice(0, 240) : "A persistência da Descoberta não está disponível.",
  };
}

function isMissingMultiSourceFunction(error: unknown) {
  const value = error && typeof error === "object" ? error as { code?: unknown; message?: unknown } : {};
  return value.code === "PGRST202" || /persist_minerador_discovery_source_run|does not exist|function .* not found/i.test(String(value.message || ""));
}

function listReference(entry: DiscoverySourceEntryInput, source: "manual" | "csv") {
  return source === "csv" ? entry.listaReference ?? entry.listaId : entry.listaId;
}

function resolveListReferences(input: { source: "manual" | "csv"; entries: DiscoverySourceEntryInput[]; brandId: string; lists: LegacyImportList[] }) {
  let unresolved = 0;
  const entries = input.entries.map(entry => {
    const rawReference = listReference(entry, input.source);
    const resolved = resolveLegacyCsvSilo({ rawReference, brandId: input.brandId, lists: input.lists });
    const hasReference = typeof rawReference === "string" && rawReference.trim().length > 0;
    if (hasReference && !resolved.listaId) unresolved += 1;
    return {
      ...entry,
      listaId: resolved.listaId,
      recognizedFields: [...new Set([...(entry.recognizedFields || []), ...(hasReference ? ["lista"] : [])])],
      ignoredFields: hasReference && !resolved.listaId ? [...new Set([...(entry.ignoredFields || []), "lista_referencia_nao_encontrada"])] : entry.ignoredFields,
    };
  });
  return { entries, unresolved };
}

export async function GET(_request: NextRequest, { params }: { params: Promise<{ brandId: string }> }) {
  try {
    const { brandId } = await params;
    if (!isTenantId(brandId)) return failure("BRAND_NOT_FOUND", 404, "Marca inválida.", { brandIdValidated: false }, "tenant_validation");
    const profile = await requireCanonicalSessionProfile();
    const context = await requireTenantPermission({ brandId, actorUserId: profile.userId, module: "minerador", action: "view", profile });
    const result = await profile.supabase.from("minerador_keyword_lists").select("id,nome,marca_id").eq("marca_id", context.brandId).order("nome");
    if (result.error) throw result.error;
    return NextResponse.json({ success: true, lists: (result.data || []).map(row => ({ id: String(row.id), name: String(row.nome || "") })) });
  } catch (error) {
    if (error instanceof AuthzError) return failure(error.status === 401 ? "DISCOVERY_SOURCE_UNAUTHENTICATED" : "DISCOVERY_SOURCE_AUTHORIZATION_FAILED", error.status, error.message, {}, "authorization");
    return failure("DISCOVERY_SOURCE_LISTS_FAILED", 503, "Não foi possível carregar as listas opcionais.", { ...safeDatabaseError(error) }, "source_lists");
  }
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ brandId: string }> }) {
  const requestId = crypto.randomUUID();
  try {
    const { brandId } = await params;
    if (!isTenantId(brandId)) return failure("BRAND_NOT_FOUND", 404, "Marca inválida.", { requestId }, "tenant_validation");
    const input = SourceRequestSchema.parse(await request.json());
    const profile = await requireCanonicalSessionProfile();
    const context = await requireTenantPermission({ brandId, actorUserId: profile.userId, module: "minerador", action: "edit", profile });
    const listsResult = await profile.supabase.from("minerador_keyword_lists").select("id,nome,marca_id").eq("marca_id", context.brandId);
    if (listsResult.error) throw listsResult.error;
    const lists = (listsResult.data || []) as LegacyImportList[];
    const entries = input.entries as DiscoverySourceEntryInput[];
    const resolved = resolveListReferences({ source: input.source, entries, brandId: context.brandId, lists });
    const normalized = normalizeDiscoverySourceEntries({ source: input.source, entries: resolved.entries });
    if (!normalized.accepted.length) return failure("DISCOVERY_SOURCE_NO_VALID_KEYWORDS", 400, "Nenhuma keyword válida foi encontrada para a Descoberta.", { requestId, receivedCount: input.entries.length, rejectedCount: normalized.rejectedCount, duplicateCount: normalized.duplicateCount }, "source_validation");

    const existing = await profile.supabase.from("minerador_keywords").select("id,keyword").eq("brand_id", context.brandId);
    if (existing.error) throw existing.error;
    const existingByCanonical = new Map<string, string>();
    for (const row of existing.data || []) {
      const canonical = normalizeKeyword(row.keyword);
      if (canonical && !existingByCanonical.has(canonical)) existingByCanonical.set(canonical, String(row.id));
    }

    const executedAt = new Date().toISOString();
    const runId = crypto.randomUUID();
    const runRow = buildDiscoverySourceRunRow({
      id: runId,
      brandId: context.brandId,
      actorUserId: context.actorUserId,
      operationRequestId: input.operationRequestId,
      source: input.source,
      preliminaryIntent: input.preliminaryIntent,
      preliminaryFunnel: input.preliminaryFunnel,
      receivedCount: input.entries.length,
      normalizedCount: normalized.accepted.length,
      approvedCount: normalized.accepted.length,
      filteredCount: normalized.duplicateCount + normalized.rejectedCount,
      executedAt,
      sourceData: { source: input.source, unresolvedListReferences: resolved.unresolved, duplicateCount: normalized.duplicateCount, rejectedCount: normalized.rejectedCount },
    });
    const candidateRows = buildDiscoverySourceCandidateRows({ brandId: context.brandId, runId, source: input.source, preliminaryIntent: input.preliminaryIntent, preliminaryFunnel: input.preliminaryFunnel, entries: normalized.accepted, existingByCanonical });
    const persisted = await profile.supabase.rpc("persist_minerador_discovery_source_run", { p_run: runRow, p_candidates: candidateRows });
    if (persisted.error) {
      if (isMissingMultiSourceFunction(persisted.error)) return failure("DISCOVERY_MULTI_SOURCE_MIGRATION_REQUIRED", 503, "A Descoberta manual/CSV aguarda a migration multi-source preparada localmente.", { requestId, apiRequestStarted: false, migration: "0040_minerador_discovery_multi_source.sql" }, "persistence");
      throw persisted.error;
    }
    const persistedRunId = persisted.data && typeof persisted.data === "object" && "runId" in persisted.data ? String((persisted.data as { runId: string }).runId) : runId;
    const stored = await profile.supabase.from("minerador_discovery_candidates").select("*").eq("brand_id", context.brandId).eq("discovery_run_id", persistedRunId).order("created_at", { ascending: true });
    if (stored.error) throw stored.error;
    const candidates = (stored.data || []).map(row => mapDiscoveryCandidateRow(row as Record<string, unknown>));
    const draft = { seed: "", relationshipMode: "Todas as palavras-chave", preliminaryIntent: input.preliminaryIntent, preliminaryFunnel: input.preliminaryFunnel, language: "Português", countryCode: "BR", selectedStates: ["Todos os estados"], volumeFilter: "Todos", cpcFilter: "Todos", includeTerms: "", excludeTerms: "", includeAdultKeywords: false };
    return NextResponse.json({ success: true, source: input.source, requestId, operationRequestId: input.operationRequestId, runId: persistedRunId, executedAt, restored: false, draft, targeting: null, provider: null, providerVersion: null, candidates, foundCount: input.entries.length, returnedCount: candidates.length, summary: { found: input.entries.length, approved: candidates.length, filtered: normalized.duplicateCount + normalized.rejectedCount, duplicates: normalized.duplicateCount, rejected: normalized.rejectedCount, unresolvedListReferences: resolved.unresolved }, idempotent: Boolean(persisted.data && typeof persisted.data === "object" && "idempotent" in persisted.data && (persisted.data as { idempotent: boolean }).idempotent) });
  } catch (error) {
    if (error instanceof ZodError) return failure("INVALID_DISCOVERY_SOURCE_REQUEST", 400, "A solicitação de origem é inválida.", { requestId, issues: error.issues.map(issue => ({ path: issue.path, code: issue.code })) }, "payload_validation");
    if (error instanceof AuthzError) return failure(error.status === 401 ? "DISCOVERY_SOURCE_UNAUTHENTICATED" : "DISCOVERY_SOURCE_AUTHORIZATION_FAILED", error.status, error.message, { requestId }, "authorization");
    return failure("DISCOVERY_SOURCE_PERSISTENCE_FAILED", 503, "A pesquisa não pôde ser persistida. Nenhuma keyword oficial foi criada.", { requestId, ...safeDatabaseError(error) }, "persistence");
  }
}
