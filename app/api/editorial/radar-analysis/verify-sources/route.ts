import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { RADAR_SOURCE_VERIFICATION_ERROR, RadarSourceVerificationRequestSchema, radarSourceVerificationErrorMessage } from "@/lib/radar/source-verification-request";
import { buildRadarExternalSourceResearch } from "@/lib/radar/link-and-source-research";
import { buildRadarSemanticConceptModel } from "@/lib/radar/semantic-concept-model";
import { buildRadarEvidenceClaims } from "@/lib/radar/claim-evidence";
import { buildRadarSourceVerificationPlan, radarSourceVerificationTargets } from "@/lib/radar/source-authority";
import { verifyRadarSources } from "@/lib/radar/source-verification";
import { VersionedRadarAnalysisSchema } from "@/lib/radar/analysis-contracts";
import { WorkflowRepository } from "@/lib/server/editorial-repositories";
import { PersistenceUnavailableError } from "@/lib/server/editorial-db";
import { assertEditorialPermission } from "@/lib/server/editorial-authorization";
import { AuthzError, authzErrorResponse, requireCanonicalSessionProfile } from "@/lib/server/authz";

/**
 * VERIFICAR UMA FONTE É NAVEGAR — e esta rota é o único lugar por onde isso
 * acontece dentro do ANALYZE.
 *
 * A pergunta que a rota responde não é "busque este endereço", é "verifique as
 * fontes que ESTA investigação selecionou". A diferença é o que impede o
 * servidor de virar proxy: o endereço nunca vem do corpo. Ele nasce dos links
 * que as páginas PERSISTIDAS declararam, passa pelo plano de prioridade e só
 * então chega ao fetch — com todos os guardas da extração de concorrentes,
 * reutilizados inteiros.
 *
 * Uma fonte que falha não derruba a análise: ela volta como falha nomeada e
 * vira limitação declarada.
 */

/** As versões gravadas da linha Radar, como a rota de leitura já as lê. */
function storedRadarAnalyses(payload: unknown) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return [];
  const raw = (payload as { analysisVersions?: unknown }).analysisVersions;
  return VersionedRadarAnalysisSchema.array().parse(Array.isArray(raw) ? raw : []);
}

function recusa(code: string, message: string, status: number, details?: unknown) {
  console.error("[radar:verify-sources]", code, message, details ? JSON.stringify(details) : "");
  return NextResponse.json({ code, error: message, ...(details ? { details } : {}) }, { status });
}

export async function POST(request: NextRequest) {
  try {
    const profile = await requireCanonicalSessionProfile();
    const input = RadarSourceVerificationRequestSchema.parse(await request.json());
    await assertEditorialPermission(profile, input.brandId, "radar", "edit");

    /*
     * ============ A ANÁLISE PERSISTIDA É A AUTORIDADE, SEMPRE ==============
     *
     * O corpo do pedido não carrega páginas nem links: ele carrega a
     * identidade da versão. Tudo o que vira destino sai daqui.
     */
    let persistida: z.infer<typeof VersionedRadarAnalysisSchema> | null = null;
    try {
      const linha = await new WorkflowRepository().findByArticle(input.brandId, input.articleId, "radar");
      if (linha && linha.marca_id === input.brandId && linha.article_id === input.articleId) {
        const versoes = storedRadarAnalyses(linha.payload);
        persistida = versoes.find(version => version.versionId === input.analysisVersionId) || null;
      }
    } catch (error) {
      if (!(error instanceof PersistenceUnavailableError)) throw error;
      return recusa(RADAR_SOURCE_VERIFICATION_ERROR.PERSISTENCE_UNAVAILABLE, radarSourceVerificationErrorMessage(RADAR_SOURCE_VERIFICATION_ERROR.PERSISTENCE_UNAVAILABLE, ""), 503);
    }

    if (!persistida) {
      return recusa(RADAR_SOURCE_VERIFICATION_ERROR.ANALYSIS_UNKNOWN, radarSourceVerificationErrorMessage(RADAR_SOURCE_VERIFICATION_ERROR.ANALYSIS_UNKNOWN, ""), 404, { analysisVersionId: input.analysisVersionId });
    }
    /* O fundamento precisa ser o mesmo: evidência não sobrevive à versão. */
    if (persistida.payload.articleDnaVersionId !== input.articleDnaVersionId) {
      return recusa(RADAR_SOURCE_VERIFICATION_ERROR.ARTICLE_DNA_MISMATCH, radarSourceVerificationErrorMessage(RADAR_SOURCE_VERIFICATION_ERROR.ARTICLE_DNA_MISMATCH, ""), 409, {
        persisted: persistida.payload.articleDnaVersionId,
        requested: input.articleDnaVersionId,
      });
    }

    /*
     * O plano nasce das páginas gravadas — nunca do que o cliente descreve.
     * As mesmas autoridades do Gate 11 e do Gate 12, sem segunda cópia aqui.
     */
    const pages = persistida.payload.extractions;
    const semantic = buildRadarSemanticConceptModel({
      pages,
      keywordTexts: input.keywordTexts,
      centralEntities: input.centralEntities,
    });
    const fontes = buildRadarExternalSourceResearch({ pages, semantic });
    const claims = buildRadarEvidenceClaims({ semantic });
    const plano = buildRadarSourceVerificationPlan({ candidates: fontes.evidenceCandidates, claims });

    const { targets, refused } = radarSourceVerificationTargets({ plan: plano, requestedSourceIds: input.sourceIds });
    if (refused.length) {
      return recusa(RADAR_SOURCE_VERIFICATION_ERROR.SOURCE_UNKNOWN, radarSourceVerificationErrorMessage(RADAR_SOURCE_VERIFICATION_ERROR.SOURCE_UNKNOWN, ""), 422, { refused });
    }

    const resultado = await verifyRadarSources({ targets });
    const observedAt = new Date().toISOString();

    return NextResponse.json({
      verified: resultado.verified.map(item => ({
        domain: item.domain,
        url: item.url,
        sourceType: item.classification.type,
        classificationReason: item.classification.classificationReason,
        confidence: item.classification.confidence,
        signals: item.classification.signals,
        provenance: item.classification.provenance,
        title: item.page.title,
        author: item.page.author,
        hasDates: item.page.hasDates,
        structuredDataTypes: item.page.structuredDataTypes,
        /* Resumo compacto: saber do que a fonte trata, não guardá-la. */
        summary: (item.page.metaDescription || item.page.introText || "").slice(0, 600),
        observedAt,
      })),
      failures: resultado.failures.map(item => ({ ...item, observedAt })),
      limitations: resultado.limitations,
      /** O plano inteiro, para a tela saber o que ficou de fora e por quê. */
      planned: plano.map(item => ({ domain: item.domain, priority: item.priority, reason: item.reason })),
      verifiedAt: observedAt,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return recusa(RADAR_SOURCE_VERIFICATION_ERROR.REQUEST_INVALID, "Solicitação de verificação de fontes inválida.", 400, error.issues);
    }
    const mapped = authzErrorResponse(error);
    return NextResponse.json({ code: error instanceof AuthzError ? "authorization_error" : "radar_source_verification_error", error: mapped.message }, { status: mapped.status });
  }
}
