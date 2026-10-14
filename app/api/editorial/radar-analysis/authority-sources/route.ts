import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { radarAuthoritySourcesForAnalysis } from "@/lib/radar/authority-source-verification";
import { VersionedRadarAnalysisSchema } from "@/lib/radar/analysis-contracts";
import { SerpSnapshotRepository, WorkflowRepository } from "@/lib/server/editorial-repositories";
import { PersistenceUnavailableError } from "@/lib/server/editorial-db";
import { assertEditorialPermission } from "@/lib/server/editorial-authorization";
import { AuthzError, authzErrorResponse, requireCanonicalSessionProfile } from "@/lib/server/authz";
import { readRadarBrandAuthorityLines } from "@/lib/server/radar-authority-sources";

/**
 * ===== 2026-10-14 · FONTES EXTERNAS DE AUTORIDADE — A CONFERÊNCIA NO ANALYZE (FASE A) =====
 *
 * SDD `docs/compartilhado/sdd-silo-interligado-seo-semantico-2026-10-14.md` §16.2.
 *
 * Chamada pela MESMA operação de "Analisar concorrência · e finaliza" (e do lote
 * "Pesquisar e finalizar"), logo depois da verificação das fontes citadas. Como na
 * `verify-sources`, o corpo do pedido NÃO carrega endereço: as candidatas nascem do
 * que está gravado — as páginas da amostra persistida, a SERP do snapshot da
 * análise e a lista de autoridades da Marca (BrandDNA aprovado, ou a sugerida).
 *
 * Nada pago, nenhuma IA: abrir páginas públicas, com user-agent identificado e o
 * robots.txt respeitado, até 8 por artigo. O resultado volta para a tela gravar na
 * versão final da análise (`payload.authoritySources`).
 */
export const runtime = "nodejs";
export const maxDuration = 60;

const RequestSchema = z.object({
  brandId: z.string().min(1),
  articleId: z.string().min(1),
  analysisVersionId: z.string().min(1),
  articleDnaVersionId: z.string().min(1),
  keywordTexts: z.array(z.string().min(1)).max(20).default([]),
  centralEntities: z.array(z.string().min(1)).max(20).default([]),
}).strict();

function storedRadarAnalyses(payload: unknown) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return [];
  const raw = (payload as { analysisVersions?: unknown }).analysisVersions;
  return VersionedRadarAnalysisSchema.array().parse(Array.isArray(raw) ? raw : []);
}

function recusa(code: string, message: string, status: number, details?: unknown) {
  console.error("[radar:authority-sources]", code, message, details ? JSON.stringify(details) : "");
  return NextResponse.json({ code, error: message, ...(details ? { details } : {}) }, { status });
}

export async function POST(request: NextRequest) {
  try {
    const profile = await requireCanonicalSessionProfile();
    const input = RequestSchema.parse(await request.json());
    await assertEditorialPermission(profile, input.brandId, "radar", "edit");

    let persistida: z.infer<typeof VersionedRadarAnalysisSchema> | null = null;
    let lista: Awaited<ReturnType<typeof readRadarBrandAuthorityLines>>;
    try {
      const linha = await new WorkflowRepository().findByArticleHydratingVersions(input.brandId, input.articleId, "radar", () => [input.analysisVersionId]);
      if (linha && linha.marca_id === input.brandId && linha.article_id === input.articleId) {
        persistida = storedRadarAnalyses(linha.payload).find(version => version.versionId === input.analysisVersionId) || null;
      }
      lista = await readRadarBrandAuthorityLines(input.brandId);
    } catch (error) {
      if (!(error instanceof PersistenceUnavailableError)) throw error;
      return recusa("AUTHORITY_PERSISTENCE_UNAVAILABLE", "A leitura da investigação ou da lista de autoridades da Marca não está disponível; nenhuma fonte foi conferida.", 503);
    }
    if (!persistida) return recusa("AUTHORITY_ANALYSIS_UNKNOWN", "A análise desta investigação não pôde ser lida do servidor; nenhuma fonte foi conferida.", 404, { analysisVersionId: input.analysisVersionId });
    if (persistida.payload.articleDnaVersionId !== input.articleDnaVersionId) {
      return recusa("AUTHORITY_ARTICLE_DNA_MISMATCH", "Os fundamentos do artigo mudaram desde esta análise; a conferência descreveria outra versão.", 409);
    }

    /* A SERP é a do snapshot desta análise; sem ela, as candidatas vêm só das páginas (dito no registro). */
    let research: Parameters<typeof radarAuthoritySourcesForAnalysis>[0]["research"] = null;
    const notas: string[] = [];
    if (persistida.payload.serpSnapshotId) {
      try {
        const { records, available } = await new SerpSnapshotRepository().list(input.brandId, input.articleId);
        research = records.find(record => record.research?.id === persistida!.payload.serpSnapshotId)?.research ?? null;
        if (!available) notas.push("A leitura dos snapshots da SERP não estava disponível.");
      } catch (error) {
        notas.push(`A SERP do snapshot não pôde ser lida (${error instanceof Error ? error.message.slice(0, 120) : "erro"}).`);
      }
    }

    const authoritySources = await radarAuthoritySourcesForAnalysis({
      pages: persistida.payload.extractions,
      research,
      brandLines: lista.lines,
      brandDnaVersionId: lista.brandDnaVersionId,
      keywordTexts: input.keywordTexts,
      centralEntities: input.centralEntities,
      notes: notas,
    });
    return NextResponse.json({ authoritySources });
  } catch (error) {
    if (error instanceof z.ZodError) return recusa("AUTHORITY_REQUEST_INVALID", "Pedido de conferência de fontes inválido.", 400, error.issues);
    const mapped = authzErrorResponse(error);
    return NextResponse.json({ code: error instanceof AuthzError ? "authorization_error" : "radar_authority_sources_error", error: mapped.message }, { status: mapped.status });
  }
}
