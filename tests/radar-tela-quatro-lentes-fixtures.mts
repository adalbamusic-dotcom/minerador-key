import { SerpCollectionRecordSchema, type SerpCollectionRecord } from "../lib/editorial/contracts.ts";
import { buildRadarSerpLensSet, radarSerpMissingLens, radarSerpObservedLens } from "../lib/radar/serp/lens-set.ts";
import { SERP_CACHE_LENSES } from "../lib/editorial/serp-cache.ts";
import { buildRadarFrozenSerpLensBlock, radarFrozenSerpLensesFromLensSet } from "../lib/radar/serp/frozen-lenses.ts";

/*
 * Fixtures das telas das quatro lentes. Três lentes observadas e a iOS
 * faltando (HTTP 500); a Android traz um domínio e uma pergunta que só ela viu.
 */

export const MARCA = "550e8400-e29b-41d4-a716-446655440000";
export const ARTIGO = "artigo-lentes";
export const OBSERVADA_EM = "2026-09-20T12:00:00.000Z";

const observacao = (lens: string, dominios: string[], perguntas: string[] = []) => ({
  lens, depth: 10, competitorDomains: dominios, organicCount: dominios.length, itemTypes: ["organic"],
  questions: perguntas, relatedSearches: [], aiOverviewDomains: [], commercialSignals: false,
});

const meta = (quem: "minerador" | "radar") => ({ collectedBy: quem, collectedAt: OBSERVADA_EM, depth: 20, providerRequestId: `req-${quem}` });

export function conjuntoDeLentes() {
  const [windows, macos, android, ios] = SERP_CACHE_LENSES;
  return buildRadarSerpLensSet([
    radarSerpObservedLens({ lens: windows, source: "cache", meta: meta("minerador"), observation: observacao("desktop-windows", ["a.com.br", "b.com.br"]) }),
    radarSerpObservedLens({ lens: macos, source: "cache", meta: meta("minerador"), observation: observacao("desktop-macos", ["a.com.br", "b.com.br"]) }),
    radarSerpObservedLens({ lens: android, source: "paid", meta: meta("radar"), observation: observacao("mobile-android", ["a.com.br", "so-no-android.com.br"], ["só no celular?"]) }),
    radarSerpMissingLens(ios, "Falha HTTP 500 no provider.", { kind: "request_failed" }),
  ]);
}

const organico = (position: number, domain: string) => ({
  position, title: `Página de ${domain}`, url: `https://${domain}/pagina`, domain, snippet: "", sitelinks: [], date: null,
  inferredType: "article", confidence: "high", manualType: null, notes: "",
});

export function pesquisa(extra: Record<string, unknown> = {}) {
  return {
    id: "serp:artigo-lentes:v3", brandId: MARCA, articleId: ARTIGO, articleDnaVersionId: "adna-1", keywordId: "kw-1", keywordDnaVersionId: "kdna-1",
    query: "creme facial", country: "br", language: "pt-br", location: "Brasil", device: "desktop", operatingSystem: "windows", resultLimit: 10,
    provider: "dataforseo", providerEndpoint: "/search", origin: "real", isMock: false, collectedAt: OBSERVADA_EM, version: 3,
    previousSnapshotId: "serp:artigo-lentes:v2", contentHash: "b".repeat(64), persistenceMode: "remote", resolutionMode: "remote_canonical",
    canonicalRemoteVerified: true, status: "needs_review", organicResults: [organico(1, "a.com.br"), organico(2, "b.com.br")],
    peopleAlsoAsk: [], relatedSearches: [], knowledgeGraph: null,
    diagnostic: {
      dominantIntent: "informacional", secondaryIntents: [], confidence: "high", dominantFormats: [], resultTypeCounts: {}, pageTypes: [],
      recurringTitlePatterns: [], recurringSnippetPatterns: [], frequentEntities: [], frequentDomains: [], localSignals: [], questions: [],
      relatedSearches: [], possibleConflicts: [], opportunities: [], limitations: [], verdict: "coerente",
    },
    lensSet: conjuntoDeLentes(),
    cacheProvenance: { source: "cache", collectedBy: "minerador", providerRequestId: "req-minerador", cacheCollectedAt: OBSERVADA_EM, snapshotOpenedAt: "2026-09-23T10:00:00.000Z" },
    ...extra,
  };
}

export function registro(extra: Record<string, unknown> = {}): SerpCollectionRecord {
  const research = pesquisa(extra);
  return SerpCollectionRecordSchema.parse({
    id: research.id, input: { keyword: "creme facial", articleId: ARTIGO, location: "Brasil", language: "pt-BR", device: "desktop" },
    status: "collected", provider: "dataforseo", origin: "real", isMock: false, snapshot: null, cost: null, error: null, dnaIntent: null,
    conflictReason: null, humanDecisionRequired: true, research, persistenceMode: "remote",
  });
}

export function blocoCongelado() {
  return buildRadarFrozenSerpLensBlock({
    canonical: { snapshotId: "serp:artigo-lentes:v3", snapshotHash: "b".repeat(64), lensSet: conjuntoDeLentes() },
    auxiliary: [{ queryId: "q-aux", keywordId: "kw-2", keyword: "creme para pele oleosa", snapshotHash: "c".repeat(64), lenses: radarFrozenSerpLensesFromLensSet(conjuntoDeLentes()) }],
    singleLensAuxiliary: 0,
  });
}
