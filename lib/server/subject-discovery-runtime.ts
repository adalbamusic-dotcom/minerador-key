import "server-only";
import { createCanonicalAuthorizationRepository, createCanonicalServiceClient } from "./canonical-authorization";
import { createIntegrationRuntimeRepository, recordIntegrationUsage } from "./integrations-runtime";
import {
  DATAFORSEO_KEYWORD_RESEARCH_CAPABILITY_KEY,
  resolveDataForSeoCanonicalKeywordResearchConfig,
  resolveDataForSeoIntegrationEnvironment,
} from "./dataforseo-canonical";
import { collectAndCacheSerp, lookupSerpCache } from "./serp-cache";
import type { SerpCacheContext } from "./serp-cache-store";
import { getOperationalClient } from "./editorial-db";
import { createGoogleAdsKeywordAccount } from "@/lib/google/ads/account";
import { generateGoogleAdsKeywordIdeas } from "@/lib/google/ads/keyword-ideas";
import { createGoogleAdsCanonicalClient, resolveGoogleAdsCanonicalContext } from "./google-ads-canonical";
import { recordGoogleAdsDiscoveryUsage } from "@/lib/minerador/google-ads-discovery-usage";
import {
  type SubjectDiscoveryExecutionPorts,
  type SubjectDiscoveryOpenExecutionOptions,
  type SubjectDiscoveryPorts,
  type SubjectDiscoverySearchRequest,
} from "@/lib/minerador/subject-discovery-search";
import type { CanonicalSessionProfile } from "./authz";
import type { TenantContext } from "./tenant-context";

/**
 * AS PORTAS DA PESQUISA POR ASSUNTO — montadas num lugar só.
 *
 * Saíram de `app/api/minerador/marcas/[brandId]/subject-discovery/search/route.ts`
 * sem mudança de comportamento, para a rota e o MCP
 * (`search_subject_keywords`) pagarem pelo MESMO caminho: mesmo plano, mesma
 * conferência de `authorizedPlan`, mesmo ledger. Duas montagens acabariam
 * divergindo exatamente no ponto que decide se uma chamada é paga.
 *
 * Desde 2026-09-28 a Pesquisa por Assunto usa só o Google Ads e abre a
 * execução com `{ dataForSeo: false }`: a Connection DataForSEO não é
 * resolvida, e uma marca sem DataForSEO pesquisa normalmente. A diferenciação
 * de publicados abre com o DataForSEO (paga a SERP das candidatas). O Labs saiu
 * das portas: o núcleo dele fica no código, sem chamador.
 *
 * SDD: `docs/compartilhado/sdd-plataforma-para-agentes-mcp-2026-09-26.md` e
 * `docs/compartilhado/sdd-serp-no-artigo-e-kgr-opcional-2026-09-28.md`.
 */

/** Lote da leitura "já existe": `id,keyword`, nunca a linha inteira. */
const EXISTING_PAGE_SIZE = 1000;

function costFromBody(body: unknown): number | null {
  const tasks = body && typeof body === "object" && !Array.isArray(body) ? (body as { tasks?: unknown }).tasks : null;
  const task = Array.isArray(tasks) ? tasks[0] as { cost?: unknown } | undefined : undefined;
  return task && typeof task.cost === "number" && Number.isFinite(task.cost) ? task.cost : null;
}

export function buildSubjectDiscoveryPorts({ profile, context, input, usage }: {
  profile: CanonicalSessionProfile;
  context: TenantContext;
  /** Só o `operationRequestId` é lido (o uso do Google Ads). A rota passa o pedido inteiro. */
  input: Pick<SubjectDiscoverySearchRequest, "operationRequestId">;
  /**
   * Aditivo (diferenciação de publicados, 2026-09-27): quem paga pelo MESMO
   * caminho declara o módulo no ledger e o coletor no cache. Ausente, tudo
   * sai como antes: `minerador`.
   */
  usage?: { module?: string; collectedBy?: "minerador" | "arquiteto" | "radar" };
}): SubjectDiscoveryPorts {
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
    async openExecution(options?: SubjectDiscoveryOpenExecutionOptions): Promise<SubjectDiscoveryExecutionPorts> {
      const serviceClient = createCanonicalServiceClient();
      const runtimeRepository = createIntegrationRuntimeRepository(serviceClient);
      // Sem o DataForSEO (Pesquisa por Assunto), a Connection nem é resolvida:
      // as portas DataForSEO recusam, e o ledger DataForSEO fica de fora.
      const withDataForSeo = options?.dataForSeo !== false;
      const resolved = withDataForSeo
        ? await resolveDataForSeoCanonicalKeywordResearchConfig({
          actorUserId: profile.userId,
          agencyId: context.agencyId || null,
          brandId: context.brandId,
          client: serviceClient,
        })
        : null;
      const dataForSeo = () => {
        if (!resolved) throw Object.assign(new Error("O DataForSEO não foi aberto nesta execução."), { code: "DATAFORSEO_NOT_OPENED" });
        return resolved;
      };
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
        ledgerCapability: Boolean(resolved?.resource.capability),
        async findUsage(idempotencyKey) {
          const dataforseo = dataForSeo();
          return Boolean(await runtimeRepository.findUsageByIdempotency(dataforseo.resource.connection.connectionId, idempotencyKey));
        },
        async collectSerp(serpRequest, collectOptions) {
          const collection = await collectAndCacheSerp(serpCache, serpRequest, {
            config: dataForSeo().config,
            operationRequestId: collectOptions.operationRequestId,
            collectedBy: usage?.collectedBy ?? "minerador",
            now,
            storeBody: collectOptions.storeBody,
            provider: { onRequestStarted: collectOptions.onRequestStarted },
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
        async recordDataForSeoUsage(event) {
          const recorded = await recordIntegrationUsage({
            resource: dataForSeo().resource,
            operation: "module_operation",
            module: usage?.module ?? "minerador",
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
            // Aditivo: quem paga pelo mesmo caminho declara o módulo (ausente, `minerador`).
            module: usage?.module ?? null,
            dependencies: googleAdsUsageDependencies,
          });
        },
      };
    },
  };
  return ports;
}
