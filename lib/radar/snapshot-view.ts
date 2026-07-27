import type { SerpCollectionRecord } from "../editorial/contracts.ts";
import type { SerpDiagnostic, SerpOrganicResult, SerpPeopleAlsoAsk, SerpRelatedSearch } from "./serp/contracts.ts";

export type RadarSerpView = {
  record: SerpCollectionRecord;
  query: string;
  version: number;
  capturedAt: string;
  hash: string | null;
  provider: string;
  origin: SerpCollectionRecord["origin"];
  persistenceMode: SerpCollectionRecord["persistenceMode"];
  organicResults: SerpOrganicResult[];
  peopleAlsoAsk: SerpPeopleAlsoAsk[];
  relatedSearches: SerpRelatedSearch[];
  knowledgeGraph: NonNullable<SerpCollectionRecord["research"]>["knowledgeGraph"] | null;
  diagnostic: SerpDiagnostic | null;
  partial: boolean;
  source: "research" | "legacy_snapshot" | "merged";
};

function legacyOrganic(record: SerpCollectionRecord): SerpOrganicResult[] {
  return (record.snapshot?.results || []).map(result => ({
    position: result.position,
    title: result.title,
    url: result.url,
    domain: (() => { try { return new URL(result.url).hostname.replace(/^www\./, ""); } catch { return result.url; } })(),
    snippet: "",
    sitelinks: [],
    date: null,
    inferredType: "other",
    confidence: "insufficient",
    manualType: null,
    notes: result.format || result.pageType || "",
  }));
}

function legacyQuestions(record: SerpCollectionRecord): SerpPeopleAlsoAsk[] {
  return (record.snapshot?.questions || []).map((question, index) => ({ position: index + 1, question, answer: null, sourceTitle: null, sourceUrl: null, classification: null, notes: "Migrado do snapshot legado; sem resposta resumida no payload antigo." }));
}

function legacyRelated(): SerpRelatedSearch[] {
  return [];
}

export function buildRadarSerpView(record: SerpCollectionRecord): RadarSerpView {
  const research = record.research;
  const legacy = record.snapshot;
  const researchOrganic = research?.organicResults || [];
  const researchQuestions = research?.peopleAlsoAsk || [];
  const researchRelated = research?.relatedSearches || [];
  const organicResults = researchOrganic.length ? researchOrganic : legacyOrganic(record);
  const peopleAlsoAsk = researchQuestions.length ? researchQuestions : legacyQuestions(record);
  const relatedSearches = researchRelated.length ? researchRelated : legacyRelated();
  const source = research && (researchOrganic.length || researchQuestions.length || researchRelated.length || research.knowledgeGraph) && legacy ? "merged" : research ? "research" : "legacy_snapshot";
  const partial = Boolean(research && legacy && researchOrganic.length < (legacy.results.length || 0));
  return {
    record,
    query: research?.query || legacy?.keyword || record.input.keyword,
    version: research?.version || 1,
    capturedAt: research?.collectedAt || legacy?.capturedAt || new Date(0).toISOString(),
    hash: research?.contentHash || null,
    provider: research?.provider || record.provider,
    origin: record.origin,
    persistenceMode: record.persistenceMode,
    organicResults,
    peopleAlsoAsk,
    relatedSearches,
    knowledgeGraph: research?.knowledgeGraph || null,
    diagnostic: research?.diagnostic || null,
    partial,
    source,
  };
}
