import { NextRequest, NextResponse } from "next/server";
import { ZodError } from "zod";
import { isTenantId } from "@/lib/tenant-routing";
import { AuthzError, requireCanonicalSessionProfile } from "@/lib/server/authz";
import { requireTenantPermission } from "@/lib/server/tenant-context";
import { createCanonicalAuthorizationRepository, createCanonicalServiceClient } from "@/lib/server/canonical-authorization";
import { createIntegrationRuntimeRepository, recordIntegrationUsage } from "@/lib/server/integrations-runtime";
import {
  DATAFORSEO_KEYWORD_RESEARCH_CAPABILITY_KEY,
  resolveDataForSeoCanonicalKeywordResearchConfig,
  resolveDataForSeoIntegrationEnvironment,
} from "@/lib/server/dataforseo-canonical";
import { collectAndCacheSerp, lookupSerpCache } from "@/lib/server/serp-cache";
import type { SerpCacheContext } from "@/lib/server/serp-cache-store";
import { getOperationalClient } from "@/lib/server/editorial-db";
import { createGoogleAdsKeywordAccount } from "@/lib/google/ads/account";
import { generateGoogleAdsKeywordIdeas } from "@/lib/google/ads/keyword-ideas";
import { createGoogleAdsCanonicalClient, resolveGoogleAdsCanonicalContext } from "@/lib/server/google-ads-canonical";
import { recordGoogleAdsDiscoveryUsage } from "@/lib/minerador/google-ads-discovery-usage";
import { executeDataForSeoLabsResearch } from "@/lib/minerador/dataforseo-labs-keyword-research-core";
import {
  SubjectDiscoverySearchRequestSchema,
  runSubjectDiscoverySearch,
  type SubjectDiscoveryExecutionPorts,
  type SubjectDiscoveryPorts,
} from "@/lib/minerador/subject-discovery-search";

/**
 * PESQUISA POR ASSUNTO — plano e execução
 * (SDD `docs/compartilhado/sdd-assunto-tronco-editorial-2026-09-24.md`, F1b.4).
 *
 * `POST { mode: "plan" }`    nada é pago e nenhuma credencial é lida: o cache
 *                            de SERP em `meta`, a declaração do Assunto, o
 *                            site da marca e a linha do catálogo do ledger.
 * `POST { mode: "execute" }` recalcula o plano, confere `authorizedPlan`, e só
 *                            então resolve a Connection DataForSEO e o Google
 *                            Ads (Secret Store), lê o ledger e paga.
 *
 * A marca é a da rota; o ator é `auth.users.id`. As candidatas voltam ao
 * navegador e NÃO são gravadas: esta rota não escreve em
 * `minerador_discovery_*` nem em `minerador_keywords`. O banco recebe só o
 * uso no ledger e a SERP da frase no cache da marca.
 */

export const dynamic = "force-dynamic";
export const revalidate = 0;

/** Lote da leitura "já existe": `id,keyword`, nunca a linha inteira. */
const EXISTING_PAGE_SIZE = 1000;

function failure(status: number, code: string, stage: string, message: string) {
  return NextResponse.json({ success: false, code, stage, message }, { status });
}

function costFromBody(body: unknown): number | null {
  const tasks = body && typeof body === "object" && !Array.isArray(body) ? (body as { tasks?: unknown }).tasks : null;
  const task = Array.isArray(tasks) ? tasks[0] as { cost?: unknown } | undefined : undefined;
  return task && typeof task.cost === "number" && Number.isFinite(task.cost) ? task.cost : null;
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ brandId: string }> }) {
  try {
    const { brandId } = await params;
    if (!isTenantId(brandId)) return failure(404, "BRAND_NOT_FOUND", "authorization", "Marca inválida.");
    const input = SubjectDiscoverySearchRequestSchema.parse(await request.json());
    const profile = await requireCanonicalSessionProfile();
    const context = await requireTenantPermission({ brandId, actorUserId: profile.userId, module: "minerador", action: "edit", profile });

    // Um instante por requisição: validade do cache e coleta contam dele.
    const now = new Date();
    const serpCache: SerpCacheContext = {
      get supabase() { return getOperationalClient(); },
      brandId: context.brandId,
      actorUserId: profile.userId,
    };

    const ports: SubjectDiscoveryPorts = {
      now: () => now,
      async readBrandSiteUrl() {
        const result = await profile.supabase.from("marcas").select("id,site_url").eq("id", context.brandId).maybeSingle();
        if (result.error) throw result.error;
        const siteUrl = (result.data as { site_url?: unknown } | null)?.site_url;
        return typeof siteUrl === "string" ? siteUrl : null;
      },
      async readSubjectKeyword(keywordId) {
        const result = await profile.supabase
          .from("minerador_keywords")
          .select("id,keyword,keyword_subject:analise_semantica->keyword_subject")
          .eq("id", keywordId)
          .eq("brand_id", context.brandId)
          .is("deleted_at", null)
          .maybeSingle();
        if (result.error) throw result.error;
        const row = result.data as { id?: unknown; keyword?: unknown; keyword_subject?: unknown } | null;
        if (!row || typeof row.id !== "string") return null;
        return { id: row.id, keyword: typeof row.keyword === "string" ? row.keyword : "", keywordSubject: row.keyword_subject ?? null };
      },
      async lookupSerp(requests, mode) {
        const lookups = await lookupSerpCache(serpCache, requests, { mode, now });
        return lookups.map(lookup => lookup.hit ? { ...(lookup.hit.body ? { body: lookup.hit.body } : {}), digest: lookup.hit.digest ?? null } : null);
      },
      async findLedgerCapability() {
        // Só a linha do catálogo: sem Connection, sem Secret Store.
        const repository = createIntegrationRuntimeRepository(createCanonicalServiceClient());
        const capability = await repository.findCapability({
          capabilityKey: DATAFORSEO_KEYWORD_RESEARCH_CAPABILITY_KEY,
          operation: "keyword_research",
          environment: resolveDataForSeoIntegrationEnvironment(),
        });
        return Boolean(capability);
      },
      async readExistingKeywords() {
        const rows: Array<{ id: string; keyword: string }> = [];
        for (let from = 0; ; from += EXISTING_PAGE_SIZE) {
          const page = await profile.supabase
            .from("minerador_keywords")
            .select("id,keyword")
            .eq("brand_id", context.brandId)
            .is("deleted_at", null)
            .order("id", { ascending: true })
            .range(from, from + EXISTING_PAGE_SIZE - 1);
          if (page.error) throw page.error;
          const data = (page.data || []) as Array<{ id: unknown; keyword: unknown }>;
          for (const row of data) if (typeof row.id === "string" && typeof row.keyword === "string") rows.push({ id: row.id, keyword: row.keyword });
          if (data.length < EXISTING_PAGE_SIZE) break;
        }
        return rows;
      },
      async openExecution(): Promise<SubjectDiscoveryExecutionPorts> {
        const serviceClient = createCanonicalServiceClient();
        const runtimeRepository = createIntegrationRuntimeRepository(serviceClient);
        const resolved = await resolveDataForSeoCanonicalKeywordResearchConfig({
          actorUserId: profile.userId,
          agencyId: context.agencyId || null,
          brandId: context.brandId,
          client: serviceClient,
        });
        const googleAdsUsageDependencies = { repository: runtimeRepository, authorizationRepository: createCanonicalAuthorizationRepository(serviceClient) };
        let googleAds: Promise<{ client: Awaited<ReturnType<typeof createGoogleAdsCanonicalClient>>["client"]; account: ReturnType<typeof createGoogleAdsKeywordAccount> }> | null = null;
        const openGoogleAds = () => {
          googleAds ||= (async () => {
            const canonical = await resolveGoogleAdsCanonicalContext({ actorUserId: profile.userId, agencyId: context.agencyId, brandId: context.brandId, operation: "discovery" });
            const { client } = await createGoogleAdsCanonicalClient({ context: canonical });
            return { client, account: createGoogleAdsKeywordAccount({ customerId: canonical.customerId, loginCustomerId: canonical.managerCustomerId }) };
          })();
          return googleAds;
        };
        return {
          ledgerCapability: Boolean(resolved.resource.capability),
          async findUsage(idempotencyKey) {
            return Boolean(await runtimeRepository.findUsageByIdempotency(resolved.resource.connection.connectionId, idempotencyKey));
          },
          async collectSerp(serpRequest, options) {
            const collection = await collectAndCacheSerp(serpCache, serpRequest, {
              config: resolved.config,
              operationRequestId: options.operationRequestId,
              collectedBy: "minerador",
              now,
              storeBody: options.storeBody,
              provider: { onRequestStarted: options.onRequestStarted },
            });
            const stored = collection.write === "created" || collection.write === "updated" || collection.write === "concurrent" || collection.write === "kept";
            return {
              providerRequestId: collection.providerRequestId,
              costUsd: costFromBody(collection.body),
              digest: collection.digest,
              organicCount: collection.observation?.organicCount ?? null,
              stored,
              error: collection.observationError || (collection.writeError ? `A gravação no cache falhou: ${collection.writeError.slice(0, 200)}` : null),
            };
          },
          runLabs(labsRequest, hooks) {
            return executeDataForSeoLabsResearch(labsRequest, { config: resolved.config, onRequestStarted: hooks.onRequestStarted });
          },
          async recordDataForSeoUsage(event) {
            const recorded = await recordIntegrationUsage({
              resource: resolved.resource,
              operation: "module_operation",
              module: "minerador",
              resultStatus: event.resultStatus,
              units: 1,
              costAmount: event.costUsd,
              currencyCode: "USD",
              providerReference: event.providerRequestId,
              errorCode: event.errorCode,
              idempotencyKey: event.idempotencyKey,
              metadata: event.metadata,
            });
            return recorded ? "recorded" : "skipped";
          },
          async googleAdsIdeas(seed, targeting, pageSize) {
            const { client, account } = await openGoogleAds();
            const page = await generateGoogleAdsKeywordIdeas(client, {
              account: { customerId: account.customerId, loginCustomerId: account.loginCustomerId || undefined },
              seed,
              targeting: {
                language: targeting.language,
                geoTargetConstants: targeting.geoTargetConstants,
                keywordPlanNetwork: targeting.keywordPlanNetwork,
                includeAdultKeywords: targeting.includeAdultKeywords,
              },
              pageSize,
            }, account);
            return {
              requestId: page.requestId,
              ideas: page.ideas.map(idea => ({
                keyword: idea.keyword,
                averageMonthlySearches: idea.averageMonthlySearches,
                competition: idea.competition,
                competitionIndex: idea.competitionIndex,
                averageCpcMicros: idea.averageCpcMicros,
                lowTopOfPageBidMicros: idea.lowTopOfPageBidMicros,
                highTopOfPageBidMicros: idea.highTopOfPageBidMicros,
                currencyCode: idea.currencyCode,
              })),
            };
          },
          async recordGoogleAdsUsage(event) {
            await recordGoogleAdsDiscoveryUsage({
              actorUserId: context.actorUserId,
              agencyId: context.agencyId || null,
              brandId: context.brandId,
              operationRequestId: input.operationRequestId as string,
              resultStatus: event.resultStatus,
              providerReference: event.providerReference,
              errorCode: event.errorCode,
              discoveryRunId: null,
              receivedCount: event.receivedCount ?? undefined,
              normalizedCount: event.receivedCount ?? undefined,
              usageKeySuffix: event.suffix,
              dependencies: googleAdsUsageDependencies,
            });
          },
        };
      },
    };

    const outcome = await runSubjectDiscoverySearch({ brandId: context.brandId, request: input }, ports);
    return NextResponse.json(outcome.body, { status: outcome.status });
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json({ success: false, code: "INVALID_SUBJECT_DISCOVERY_REQUEST", stage: "request_validation", message: "A pesquisa por Assunto é inválida.", diagnostic: { issues: error.issues.map(issue => ({ path: issue.path.join("."), code: issue.code })) } }, { status: 400 });
    }
    if (error instanceof AuthzError) return failure(error.status, error.status === 401 ? "SUBJECT_DISCOVERY_UNAUTHENTICATED" : "SUBJECT_DISCOVERY_AUTHORIZATION_FAILED", "authorization", error.message);
    return failure(503, "SUBJECT_DISCOVERY_FAILED", "subject_discovery", "A pesquisa por Assunto não pôde ser concluída. Nada foi gravado como candidata.");
  }
}
