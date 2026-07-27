import { normalizeCandidateText } from "./site-parser.ts";
import type { SiteKeywordArchitectureStatus, SiteKeywordCandidate, SiteKeywordUrlRelation } from "./site-contracts.ts";

export type SiteKeywordMineradorExisting = {
  id: string;
  brand_id: string;
  keyword: string;
  status?: string | null;
  analise_semantica?: Record<string, unknown> | null;
};

export interface SiteKeywordEvidence {
  schemaVersion: "site-sitemap-v1";
  source: "site_sitemap";
  brandId: string;
  catalogEntryId: string;
  sourceUrl: string;
  resolvedUrl: string | null;
  declaredCanonicalUrl: string | null;
  urlSituation: SiteKeywordCandidate["urlSituation"];
  publicationStatus: SiteKeywordCandidate["publicationStatus"];
  keywordUrlRelation: SiteKeywordUrlRelation;
  architectureStatus: SiteKeywordArchitectureStatus;
  suggestedRole: SiteKeywordCandidate["suggestedRole"];
  sourceFields: SiteKeywordCandidate["sourceFields"];
  extractedField: SiteKeywordCandidate["sourceField"];
  slugCoherence: SiteKeywordCandidate["slugCoherence"];
  confidence: SiteKeywordCandidate["confidence"];
  normalizedText: string;
  batchId: string;
  requestedBy: string;
  extractedAt: string | null;
  importedAt: string;
  lastCheckedAt: string;
  relationConfirmedBy: string | null;
  relationConfirmedAt: string | null;
  siloId?: string;
  siloName?: string | null;
  consolidatedAt?: string;
}

export interface SiteKeywordMineradorInsert {
  brand_id: string;
  keyword: string;
  results_allintitle: null;
  volume_search: null;
  kgr_score: null;
  intent: null;
  lista_id: string;
  status: "bruto";
  analise_semantica: {
    site_origin: SiteKeywordEvidence;
    site_origins: SiteKeywordEvidence[];
  };
}

export type SiteKeywordMineradorCandidateInput = Pick<SiteKeywordCandidate, "id" | "brandId" | "text" | "catalogEntryId" | "sourceUrl" | "sourceField" | "suggestedRole" | "confidence"> & Partial<Pick<SiteKeywordCandidate, "normalizedText" | "sourceFields" | "slugCoherence" | "urlSituation" | "publicationStatus" | "keywordUrlRelation" | "architectureStatus" | "extractedAt">> & {
  resolvedUrl?: string | null;
  declaredCanonicalUrl?: string | null;
  relationConfirmedBy?: string | null;
  relationConfirmedAt?: string | null;
};

export interface SiteKeywordMineradorRepository {
  validateDestination(brandId: string, targetListId: string): Promise<void>;
  findByList(brandId: string, targetListId: string): Promise<SiteKeywordMineradorExisting[]>;
  insertKeyword(payload: SiteKeywordMineradorInsert): Promise<{ id: string; brand_id: string; keyword: string }>;
  updateKeywordEvidence?(input: { id: string; brandId: string; analise_semantica: Record<string, unknown> }): Promise<void>;
}

export interface SiteKeywordImportItem {
  candidateId: string;
  text: string;
  normalizedText: string;
  catalogEntryId: string;
  sourceUrl: string;
  sourceField: SiteKeywordCandidate["sourceField"];
  sourceFields: SiteKeywordCandidate["sourceFields"];
  suggestedRole: SiteKeywordCandidate["suggestedRole"];
  slugCoherence: SiteKeywordCandidate["slugCoherence"];
  urlSituation: SiteKeywordCandidate["urlSituation"];
  publicationStatus: SiteKeywordCandidate["publicationStatus"];
  keywordUrlRelation: SiteKeywordUrlRelation;
  architectureStatus: SiteKeywordArchitectureStatus;
  resolvedUrl: string | null;
  declaredCanonicalUrl: string | null;
  extractedAt: string | null;
  confidence: SiteKeywordCandidate["confidence"];
  outcome: "imported" | "existing_in_minerador" | "evidence_updated" | "no_change" | "duplicate_in_batch" | "failed";
  mineradorKeywordId: string | null;
  reason?: string;
}

export interface SiteKeywordImportResult {
  batchId: string;
  brandId: string;
  targetListId: string;
  status: "completed" | "partial" | "failed";
  persisted: boolean;
  items: SiteKeywordImportItem[];
  inserted: Array<{ candidateId: string; mineradorKeywordId: string; keyword: string }>;
  existing: Array<{ candidateId: string; mineradorKeywordId: string; keyword: string }>;
  failed: Array<{ candidateId: string; keyword: string; reason: string }>;
  summary: {
    selected: number;
    new: number;
    imported: number;
    existing: number;
    updated: number;
    unchanged: number;
    duplicateInBatch: number;
    ignored: number;
    failed: number;
  };
}

function itemBase(candidate: SiteKeywordMineradorCandidateInput, normalizedText: string): Omit<SiteKeywordImportItem, "outcome" | "mineradorKeywordId"> {
  return {
    candidateId: candidate.id,
    text: candidate.text,
    normalizedText,
    catalogEntryId: candidate.catalogEntryId,
    sourceUrl: candidate.sourceUrl,
    sourceField: candidate.sourceField,
    sourceFields: candidate.sourceFields?.length ? candidate.sourceFields : [candidate.sourceField],
    suggestedRole: candidate.suggestedRole,
    slugCoherence: candidate.slugCoherence || "unknown",
    urlSituation: candidate.urlSituation || "unverified",
    publicationStatus: candidate.publicationStatus || "not_confirmed",
    keywordUrlRelation: candidate.keywordUrlRelation || "undefined",
    architectureStatus: candidate.architectureStatus || "awaiting_architecture",
    resolvedUrl: candidate.resolvedUrl ?? null,
    declaredCanonicalUrl: candidate.declaredCanonicalUrl ?? null,
    extractedAt: candidate.extractedAt ?? null,
    confidence: candidate.confidence,
  };
}

function errorReason(error: unknown): string {
  return error instanceof Error && error.message ? error.message : "Falha ao persistir a keyword no Minerador.";
}

function buildEvidence(candidate: SiteKeywordMineradorCandidateInput, normalizedText: string, batchId: string, requestedBy: string, importedAt: string, destination: { siloId: string; siloName?: string | null }): SiteKeywordEvidence {
  return {
    schemaVersion: "site-sitemap-v1",
    source: "site_sitemap",
    brandId: candidate.brandId,
    catalogEntryId: candidate.catalogEntryId,
    sourceUrl: candidate.sourceUrl,
    resolvedUrl: candidate.resolvedUrl ?? null,
    declaredCanonicalUrl: candidate.declaredCanonicalUrl ?? null,
    urlSituation: candidate.urlSituation || "unverified",
    publicationStatus: candidate.publicationStatus || "not_confirmed",
    keywordUrlRelation: candidate.keywordUrlRelation || "undefined",
    architectureStatus: candidate.architectureStatus || "awaiting_architecture",
    suggestedRole: candidate.suggestedRole,
    sourceFields: candidate.sourceFields?.length ? candidate.sourceFields : [candidate.sourceField],
    extractedField: candidate.sourceField,
    slugCoherence: candidate.slugCoherence || "unknown",
    confidence: candidate.confidence,
    normalizedText,
    batchId,
    requestedBy,
    extractedAt: candidate.extractedAt ?? null,
    importedAt,
    lastCheckedAt: importedAt,
    relationConfirmedBy: candidate.relationConfirmedBy ?? null,
    relationConfirmedAt: candidate.relationConfirmedAt ?? null,
    siloId: destination.siloId,
    siloName: destination.siloName ?? null,
    consolidatedAt: importedAt,
  };
}

function evidenceKey(value: SiteKeywordEvidence): string {
  return `${value.source}|${value.brandId}|${value.catalogEntryId}|${value.normalizedText}|${value.sourceUrl}`;
}

export function mergeSiteEvidence(existing: Record<string, unknown> | null | undefined, evidence: SiteKeywordEvidence): { semantic: Record<string, unknown>; changed: boolean } {
  const current = { ...(existing || {}) };
  const legacyOrigin = current.site_origin && typeof current.site_origin === "object" && !Array.isArray(current.site_origin)
    ? current.site_origin as SiteKeywordEvidence
    : null;
  const previous = Array.isArray(current.site_origins)
    ? current.site_origins.filter(item => item && typeof item === "object") as SiteKeywordEvidence[]
    : legacyOrigin ? [legacyOrigin] : [];
  const key = evidenceKey(evidence);
  const index = previous.findIndex(item => evidenceKey(item) === key);
  const nextOrigins = [...previous];
  if (index >= 0) nextOrigins[index] = evidence;
  else nextOrigins.push(evidence);
  const next = { ...current, site_origin: legacyOrigin && index < 0 ? legacyOrigin : nextOrigins[0], site_origins: nextOrigins };
  return { semantic: next, changed: JSON.stringify(current) !== JSON.stringify(next) };
}

export async function importSiteKeywordsToMinerador(input: {
  brandId: string;
  targetListId: string;
  candidates: SiteKeywordMineradorCandidateInput[];
  importBatchId: string;
  requestedBy: string;
  targetListName?: string | null;
  repository: SiteKeywordMineradorRepository;
  now?: string;
}): Promise<SiteKeywordImportResult> {
  if (!input.brandId) throw new Error("Marca obrigatória para importar keywords.");
  if (!input.targetListId) throw new Error("Lista de destino obrigatória para importar keywords.");
  if (!input.candidates.length) throw new Error("Nenhuma candidata foi selecionada para importar.");

  await input.repository.validateDestination(input.brandId, input.targetListId);
  const existingRows = await input.repository.findByList(input.brandId, input.targetListId);
  const existingByText = new Map<string, SiteKeywordMineradorExisting>();
  for (const row of existingRows) {
    const normalized = normalizeCandidateText(row.keyword);
    if (normalized && !existingByText.has(normalized)) existingByText.set(normalized, row);
  }

  const seen = new Set<string>();
  const items: SiteKeywordImportItem[] = [];
  const inserted: SiteKeywordImportResult["inserted"] = [];
  const existing: SiteKeywordImportResult["existing"] = [];
  const failed: SiteKeywordImportResult["failed"] = [];
  const importedAt = input.now || new Date().toISOString();

  for (const candidate of input.candidates) {
    const normalizedText = normalizeCandidateText(candidate.text);
    const base = itemBase(candidate, normalizedText);
    if (candidate.brandId !== input.brandId) {
      const reason = "A candidata não pertence à marca ativa.";
      items.push({ ...base, outcome: "failed", mineradorKeywordId: null, reason });
      failed.push({ candidateId: candidate.id, keyword: candidate.text, reason });
      continue;
    }
    if (!normalizedText) {
      const reason = "A keyword não possui texto normalizável.";
      items.push({ ...base, outcome: "failed", mineradorKeywordId: null, reason });
      failed.push({ candidateId: candidate.id, keyword: candidate.text, reason });
      continue;
    }
    if (seen.has(normalizedText)) {
      items.push({ ...base, outcome: "duplicate_in_batch", mineradorKeywordId: null, reason: "Keyword duplicada no lote." });
      continue;
    }
    seen.add(normalizedText);

    const current = existingByText.get(normalizedText);
    if (current) {
      const evidence = buildEvidence(candidate, normalizedText, input.importBatchId, input.requestedBy, importedAt, { siloId: input.targetListId, siloName: input.targetListName });
      const merged = mergeSiteEvidence(current.analise_semantica, evidence);
      let outcome: SiteKeywordImportItem["outcome"] = "existing_in_minerador";
      if (input.repository.updateKeywordEvidence) {
        try {
          if (merged.changed) {
            await input.repository.updateKeywordEvidence({ id: current.id, brandId: input.brandId, analise_semantica: merged.semantic });
            outcome = "evidence_updated";
          } else {
            outcome = "no_change";
          }
        } catch (error) {
          const reason = errorReason(error);
          items.push({ ...base, outcome: "failed", mineradorKeywordId: current.id, reason });
          failed.push({ candidateId: candidate.id, keyword: candidate.text, reason });
          continue;
        }
      }
      items.push({ ...base, outcome, mineradorKeywordId: current.id });
      existing.push({ candidateId: candidate.id, mineradorKeywordId: current.id, keyword: current.keyword });
      continue;
    }

    const evidence = buildEvidence(candidate, normalizedText, input.importBatchId, input.requestedBy, importedAt, { siloId: input.targetListId, siloName: input.targetListName });
    const payload: SiteKeywordMineradorInsert = {
      brand_id: input.brandId,
      keyword: candidate.text.trim(), results_allintitle: null, volume_search: null, kgr_score: null, intent: null,
      lista_id: input.targetListId, status: "bruto", analise_semantica: { site_origin: evidence, site_origins: [evidence] },
    };

    try {
      const saved = await input.repository.insertKeyword(payload);
      if (!saved.id) throw new Error("O repositório do Minerador não retornou o ID da keyword.");
      existingByText.set(normalizedText, saved);
      items.push({ ...base, outcome: "imported", mineradorKeywordId: saved.id });
      inserted.push({ candidateId: candidate.id, mineradorKeywordId: saved.id, keyword: saved.keyword || candidate.text });
    } catch (error) {
      const afterRows = await input.repository.findByList(input.brandId, input.targetListId).catch(() => []);
      const recovered = afterRows.find(row => normalizeCandidateText(row.keyword) === normalizedText);
      if (recovered) {
        existingByText.set(normalizedText, recovered);
        items.push({ ...base, outcome: "existing_in_minerador", mineradorKeywordId: recovered.id, reason: "Registro localizado após a confirmação da escrita." });
        existing.push({ candidateId: candidate.id, mineradorKeywordId: recovered.id, keyword: recovered.keyword });
      } else {
        const reason = errorReason(error);
        items.push({ ...base, outcome: "failed", mineradorKeywordId: null, reason });
        failed.push({ candidateId: candidate.id, keyword: candidate.text, reason });
      }
    }
  }

  const duplicateInBatch = items.filter(item => item.outcome === "duplicate_in_batch").length;
  const importedCount = inserted.length;
  const updatedCount = items.filter(item => item.outcome === "evidence_updated").length;
  const unchangedCount = items.filter(item => item.outcome === "no_change").length;
  const persistedCount = importedCount + existing.length;
  const status = failed.length === 0 ? "completed" : persistedCount > 0 ? "partial" : "failed";
  return {
    batchId: input.importBatchId, brandId: input.brandId, targetListId: input.targetListId, status, persisted: persistedCount > 0,
    items, inserted, existing, failed,
    summary: { selected: input.candidates.length, new: importedCount, imported: importedCount, existing: existing.length, updated: updatedCount, unchanged: unchangedCount, duplicateInBatch, ignored: 0, failed: failed.length },
  };
}
