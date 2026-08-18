import { loadBrandSiteWorkspace } from "../marca/site-store.ts";
import type { BrandSiteWorkspace, SiteKeywordCandidate } from "../marca/site-contracts.ts";
import type { SiteKeywordMineradorCandidateInput } from "../marca/site-minerador-import.ts";

export interface MineradorSiteSyncCandidate extends SiteKeywordMineradorCandidateInput {
  catalogTitle: string | null;
}

export interface MineradorSiteSyncSnapshot {
  brandId: string;
  workspace: BrandSiteWorkspace;
  candidates: MineradorSiteSyncCandidate[];
  parseError: string | null;
}

export type MineradorSiteSyncOutcome = "new" | "existing" | "evidence_updated" | "no_change" | "duplicate_in_batch" | "invalid" | "blocked";

export interface MineradorSiteSyncPlanItem {
  candidate: MineradorSiteSyncCandidate;
  outcome: MineradorSiteSyncOutcome;
  mineradorKeywordId: string | null;
  reason?: string;
}

export interface MineradorSiteSyncPlan {
  items: MineradorSiteSyncPlanItem[];
  summary: { received: number; valid: number; new: number; existing: number; updated: number; unchanged: number; duplicateInBatch: number; invalid: number; blocked: number };
}

type ExistingKeyword = { id: string; keyword: string; lista_id?: string | null; analise_semantica?: Record<string, unknown> | null };

function siteEvidenceKey(value: Record<string, unknown> | null | undefined): string | null {
  if (!value || typeof value !== "object") return null;
  const source = value.site_origin;
  if (!source || typeof source !== "object" || Array.isArray(source)) return null;
  const origin = source as Record<string, unknown>;
  return [origin.source, origin.brandId, origin.catalogEntryId, origin.normalizedText, origin.sourceUrl].map(String).join("|");
}

export function buildMineradorSiteSyncPlan(candidates: MineradorSiteSyncCandidate[], existingRows: ExistingKeyword[], targetListId: string): MineradorSiteSyncPlan {
  const existingByText = new Map(existingRows.filter(row => row.lista_id === targetListId).map(row => [row.keyword.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim(), row]));
  const seen = new Set<string>();
  const items = candidates.map(candidate => {
    const text = candidate.text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
    if (!text || !candidate.sourceUrl) return { candidate, outcome: "invalid" as const, mineradorKeywordId: null, reason: "Candidata sem texto ou URL de origem válida." };
    if (seen.has(text)) return { candidate, outcome: "duplicate_in_batch" as const, mineradorKeywordId: null, reason: "Keyword duplicada dentro da conferência." };
    seen.add(text);
    const existing = existingByText.get(text);
    if (!existing) return { candidate, outcome: "new" as const, mineradorKeywordId: null };
    const expectedKey = ["site_sitemap", candidate.brandId, candidate.catalogEntryId, text, candidate.sourceUrl].map(String).join("|");
    const actualKey = siteEvidenceKey(existing.analise_semantica);
    return { candidate, outcome: actualKey === expectedKey ? "no_change" as const : "evidence_updated" as const, mineradorKeywordId: existing.id };
  });
  return {
    items,
    summary: {
      received: candidates.length,
      valid: items.filter(item => item.outcome !== "invalid").length,
      new: items.filter(item => item.outcome === "new").length,
      existing: items.filter(item => ["existing", "evidence_updated", "no_change"].includes(item.outcome)).length,
      updated: items.filter(item => item.outcome === "evidence_updated").length,
      unchanged: items.filter(item => item.outcome === "no_change").length,
      duplicateInBatch: items.filter(item => item.outcome === "duplicate_in_batch").length,
      invalid: items.filter(item => item.outcome === "invalid").length,
      blocked: 0,
    },
  };
}

function candidatePayload(candidate: SiteKeywordCandidate, workspace: BrandSiteWorkspace): MineradorSiteSyncCandidate | null {
  const entry = workspace.catalog.find(item => item.id === candidate.catalogEntryId);
  if (!entry || entry.brandId !== workspace.brandId || candidate.brandId !== workspace.brandId) return null;
  if (candidate.status === "ignored") return null;
  return {
    id: candidate.id,
    brandId: candidate.brandId,
    text: candidate.text,
    normalizedText: candidate.normalizedText || candidate.text,
    catalogEntryId: candidate.catalogEntryId,
    sourceUrl: candidate.sourceUrl,
    sourceField: candidate.sourceField,
    sourceFields: candidate.sourceFields,
    suggestedRole: candidate.suggestedRole,
    slugCoherence: candidate.slugCoherence,
    urlSituation: candidate.urlSituation,
    publicationStatus: candidate.publicationStatus,
    keywordUrlRelation: candidate.keywordUrlRelation,
    architectureStatus: candidate.architectureStatus,
    relationConfirmedBy: candidate.relationConfirmedBy,
    relationConfirmedAt: candidate.relationConfirmedAt,
    extractedAt: candidate.extractedAt,
    confidence: candidate.confidence,
    resolvedUrl: entry.resolvedUrl,
    declaredCanonicalUrl: entry.declaredCanonicalUrl,
    catalogTitle: entry.title || entry.h1,
  };
}

export async function loadMineradorSiteSyncSnapshot(actorUserId: string, brandId: string): Promise<MineradorSiteSyncSnapshot> {
  const result = await loadBrandSiteWorkspace(actorUserId, brandId);
  if (result.parseError) throw new Error(`Catálogo Site/Sitemap inválido: ${result.parseError}`);
  const candidates = result.workspace.candidates
    .map(candidate => candidatePayload(candidate, result.workspace))
    .filter((candidate): candidate is MineradorSiteSyncCandidate => Boolean(candidate));
  return { brandId, workspace: result.workspace, candidates, parseError: null };
}

export function uniqueSiteSyncCandidates(candidates: MineradorSiteSyncCandidate[]): MineradorSiteSyncCandidate[] {
  const seen = new Set<string>();
  return candidates.filter(candidate => {
    const key = `${candidate.brandId}|${candidate.catalogEntryId}|${candidate.normalizedText}|${candidate.sourceUrl}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
