/**
 * FIXTURES DAS LISTAS LEVES (F2, 2026-10-14): ArticleDNA válido, parecer de
 * SERP da formação com o peso dos reais (SERP bruta e cópias do KeywordDNA) e
 * linhas do banco. Fica fora dos globs das suítes.
 */
import { buildProvisionalGroups } from "../lib/arquiteto/engine.ts";
import { deterministicArticleDnaPayload } from "../lib/arquiteto/adapters.ts";
import { createVersionEnvelope } from "../lib/arquiteto/versioning.ts";
import { ArticleFormationSerpPayloadSchema, ARTICLE_FORMATION_SERP_CONTRACT_VERSION, articleFormationSerpWorkflowState } from "../lib/arquiteto/article-serp-record.ts";
import type { ArticleDNA, VersionEnvelope } from "../lib/arquiteto/contracts.ts";

export const LENTES = ["desktop-windows", "mobile-android", "mobile-ios", "desktop-macos"];

export function keywordDaMesa(id: string, texto: string, volume = 100) {
  return {
    id, keyword: texto, intent: "Informativo", volume_search: volume, results_allintitle: null, kgr_score: null, lista_id: null,
    siloName: null, status: "aprovado", analise_semantica: { entidade_central: "internet", publico: "clientes", problema_percebido: "duvida" },
  };
}

/** Um ArticleDNA válido de uma keyword; `articleId` opcional para criar outra versão do MESMO artigo com outra composição. */
export function artigo(brandId: string, keywordId: string, texto: string, articleId?: string): ArticleDNA {
  const payload = deterministicArticleDnaPayload(buildProvisionalGroups([keywordDaMesa(keywordId, texto) as never])[0], brandId);
  return articleId ? { ...payload, articleId } : payload;
}

export async function versao<T>(payload: T, entityId: string, versionNumber: number, actor: string, extra: Partial<VersionEnvelope<T>> = {}) {
  return createVersionEnvelope({ entityId, versionNumber, origin: "system", changeReason: "fixture", createdBy: actor, payload, createdAt: `2026-10-0${versionNumber}T10:00:00.000Z`, versionId: `${entityId}:v${versionNumber}`, ...extra });
}

/** A linha de `editorial_artifact_versions`. `formato`: "cru" (Arquiteto: payload = DNA) ou "envelope" (mesa antiga). */
export function linhaDeVersao(brandId: string, tipo: string, envelope: VersionEnvelope<unknown>, status: string, formato: "cru" | "envelope" = "cru") {
  return {
    version_id: envelope.versionId, entity_id: envelope.entityId, marca_id: brandId, artifact_type: tipo,
    version_number: envelope.versionNumber, previous_version_id: envelope.previousVersionId, source_version_id: null,
    status, content_hash: envelope.contentHash, payload: formato === "cru" ? envelope.payload : envelope,
    origin: envelope.origin, change_reason: envelope.changeReason, created_by: envelope.createdBy, created_at: envelope.createdAt,
  };
}

/** Um parecer de SERP da formação com o peso dos reais. `interpretation: false` = parecer legado (sem o campo legível). */
export function parecerDaFormacao(candidateRef: string, keywordIds: string[], opcoes: { verdict?: "COMPATIBLE" | "INCONCLUSIVE" | "DIVERGENCE"; interpretation?: boolean; lentes?: string[]; base?: string } = {}) {
  const criado = "2026-10-10T10:00:00.000Z";
  const snapshots = keywordIds.map((keywordId, indice) => ({
    id: `snap-${candidateRef}-${indice}`, keywordId, keywordDnaVersionId: `${keywordId}:v1`, contentHash: `h-${indice}`, articleDnaVersionId: "artigo:v1",
    articleId: candidateRef, brandId: "marca", query: `consulta ${keywordId}`, collectedAt: criado, status: "ready", provider: "dataforseo", device: "desktop",
    organicResults: Array.from({ length: 10 }, (_, posicao) => ({
      position: posicao + 1, url: `https://site${(posicao + indice) % 7}.com.br/${keywordId}/${posicao}`, domain: `site${(posicao + indice) % 7}.com.br`,
      title: `Título do resultado ${posicao} `.repeat(4), snippet: "Trecho do resultado orgânico com bastante texto. ".repeat(8), date: null,
      inferredType: "blog", confidence: 0.8, manualType: null, sitelinks: [], notes: [],
    })),
    serpFeatures: [{ type: "people_also_ask", items: Array.from({ length: 6 }, (_, n) => ({ question: `pergunta ${n} sobre ${keywordId}?`, answer: "resposta longa ".repeat(20) })) }],
    peopleAlsoAsk: Array.from({ length: 4 }, (_, n) => `Pergunta ${n} de ${keywordId}?`),
    relatedSearches: Array.from({ length: 8 }, (_, n) => `busca relacionada ${n}`),
    diagnostic: { raw: "x".repeat(3000) },
    knowledgeGraph: null,
  }));
  const assessment = {
    id: `assessment-${candidateRef}`, contentHash: `sha256:${"a".repeat(64)}`, createdAt: criado, version: 1, schemaVersion: 1,
    brandId: "marca", articleId: candidateRef, articleDnaVersionId: "artigo:v1", evaluationStatus: "active", mode: "keyword_individual",
    assessmentMode: "new_article", validationProfile: "padrao", queryCount: keywordIds.length, queriedKeywordDnaIds: keywordIds,
    intentCompatibility: "coerente", competitionLevel: "media", dominantResultTypes: ["blog"], notes: ["parecer de fixture"], conflicts: [],
    formationBaseHash: opcoes.base ?? `base-${candidateRef}`, createdBy: "ator", previousVersionId: null, outdatedReason: null,
    snapshots,
    keywordDnaReferences: keywordIds.map(keywordId => ({
      keywordId, brandId: "marca", capturedAt: criado,
      versionReference: { entityId: keywordId, versionId: `${keywordId}:v1`, contentHash: `h-${keywordId}` },
      payload: { searchIntent: "Informativo", originalIntentLabel: "Informacional", entidade: "internet", detalhe: "y".repeat(2000) },
      sourceKeywordSnapshot: { keyword: `keyword ${keywordId}`, analise_semantica: { bloco: "z".repeat(9000) } },
    })),
    recommendations: keywordIds.map((keywordId, indice) => ({
      keywordId, keywordDnaVersionId: `${keywordId}:v1`, currentRole: indice === 0 ? "principal" : "secundaria", action: "manter",
      reason: "A SERP confirma o papel.", confidence: "alta", snapshotIds: [`snap-${candidateRef}-${indice}`], conflicts: [], decision: { status: "pending" },
    })),
    formationEvidence: {
      keywordObservations: keywordIds.map((keywordId, indice) => ({
        keywordId, keywordDnaVersionId: `${keywordId}:v1`, observedIntent: "informacional", compatibility: "coerente", overlap: "high",
        dominantPageType: "blog", competition: "media", conflict: false, insufficientEvidence: false, likelyCannibalization: "unlikely",
        needsSeparation: false, canJoin: true, principalPossiblyInadequate: false, conflictReasons: [], snapshotIds: [`snap-${candidateRef}-${indice}`],
      })),
    },
  };
  const lentes = opcoes.lentes ?? LENTES;
  const interpretation = opcoes.interpretation === false ? null : {
    principalVerdict: "adequada", principalAlternativeKeywordId: null, principalReason: "A principal domina a SERP.",
    groupVerdict: "coeso", groupReason: "As buscas dividem os mesmos resultados.", outsiders: [], observedIntent: "informacional",
    observedFunnel: "topo", dominantType: "blog", viability: "alta", viabilityText: "Viável.", distinctDomains: 7, converging: keywordIds.length, total: keywordIds.length,
    recommendation: "Manter a composição.",
    lenses: {
      requested: LENTES, observed: lentes, missing: LENTES.filter(lente => !lentes.includes(lente)).map(lens => ({ lens, keywordId: null, reason: "não paga" as const })),
      perLens: lentes.map(lens => ({ lens, observedQueries: keywordIds.length, oldestCollectedAt: criado, newestCollectedAt: criado, verdict: "COMPATIBLE" })),
      agreement: `${lentes.length}/${lentes.length}`, collectedAtSpreadDays: 0, datesDiverge: false,
    },
  };
  return ArticleFormationSerpPayloadSchema.parse({
    contractVersion: ARTICLE_FORMATION_SERP_CONTRACT_VERSION, candidateRef, territoryRef: "territorio-1",
    formationBaseHash: opcoes.base ?? `base-${candidateRef}`, verdict: opcoes.verdict ?? "COMPATIBLE", assessment, snapshotIds: snapshots.map(snapshot => snapshot.id),
    interpretation, humanResolution: null, provenance: { operationRequestId: `op-${candidateRef}`, collectedAt: criado },
  });
}

/** A linha de `editorial_workflow_items` do parecer. */
export function linhaDoParecer(brandId: string, id: string, payload: ReturnType<typeof parecerDaFormacao>, lock = 1, updatedAt = "2026-10-10T10:00:00.000000+00:00") {
  return {
    id, marca_id: brandId, subject_type: "article_formation_serp_assessment", subject_id: payload.candidateRef, article_id: null, stage: "architect",
    state: articleFormationSerpWorkflowState(payload), source_entity_id: payload.candidateRef, source_version_id: null, source_content_hash: null,
    payload, lock_version: lock, created_at: "2026-10-10T10:00:00.000000+00:00", updated_at: updatedAt,
  };
}
