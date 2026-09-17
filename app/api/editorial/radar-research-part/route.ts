import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { AuthzError, authzErrorResponse, requireCanonicalSessionProfile } from "@/lib/server/authz";
import { assertEditorialPermission } from "@/lib/server/editorial-authorization";
import { WorkflowRepository } from "@/lib/server/editorial-repositories";
import { PersistenceUnavailableError } from "@/lib/server/editorial-db";
import { RADAR_RESEARCH_PROFILES } from "@/lib/radar/research-profile";
import {
  RADAR_RESEARCH_LAZY_PARTS,
  radarResearchProvenanceOfAnalysis,
  radarResearchSampleOfAnalysis,
} from "@/lib/radar/research-read-model";

/**
 * ===== A LEITURA SOB DEMANDA DA PESQUISA — RADAR_FINAL_2.1 · §4 a §6 =====
 *
 * ==================== UMA ROTA, TRÊS PERFIS — §6 ====================
 *
 * Não existem `google-sample`, `youtube-sample` e `amazon-sample`. Três
 * endpoints para a mesma pergunta divergiriam na primeira correção feita só num
 * deles — e quem consome teria de aprender três formas de pedir a mesma coisa.
 *
 * O perfil é parâmetro, e a autoridade que responde é uma.
 *
 * ========================= PROVIDER_CALLS = 0 =========================
 *
 * Abrir a amostra é uma ida ao BANCO. A coleta foi paga uma vez e vive na
 * versão corrente da análise; buscá-la de novo no provider cobraria duas vezes
 * pelo mesmo dado — e cobraria por um clique de curiosidade.
 *
 * É GET de propósito: isto lê, não decide nada e não muda estado.
 */

const noStoreHeaders = { "Cache-Control": "no-store" } as const;

const QuerySchema = z.object({
  brandId: z.string().uuid(),
  articleId: z.string().trim().min(1).max(256),
  profile: z.enum(RADAR_RESEARCH_PROFILES),
  part: z.enum(RADAR_RESEARCH_LAZY_PARTS),
}).strict();

/** A versão corrente, sem poda e sem compactação: aqui o conteúdo é o pedido. */
function correnteDe(payload: unknown) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null;
  const versoes = (payload as { analysisVersions?: unknown }).analysisVersions;
  if (!Array.isArray(versoes) || !versoes.length) return null;
  return [...versoes].sort((esquerda, direita) =>
    Number((direita as { versionNumber?: number }).versionNumber || 0)
    - Number((esquerda as { versionNumber?: number }).versionNumber || 0))[0] as { versionId?: string; payload?: unknown };
}

export async function GET(request: NextRequest) {
  try {
    const profile = await requireCanonicalSessionProfile();
    const input = QuerySchema.parse({
      brandId: request.nextUrl.searchParams.get("brandId"),
      articleId: request.nextUrl.searchParams.get("articleId"),
      profile: request.nextUrl.searchParams.get("profile"),
      part: request.nextUrl.searchParams.get("part"),
    });
    await assertEditorialPermission(profile, input.brandId, "radar", "view");

    const item = await new WorkflowRepository().findByArticle(input.brandId, input.articleId, "radar");
    if (!item) {
      return NextResponse.json({ code: "radar_item_not_found", error: "Item Radar não encontrado." }, { status: 404, headers: noStoreHeaders });
    }
    if (item.marca_id !== input.brandId || item.article_id !== input.articleId) {
      return NextResponse.json({ code: "radar_identity_mismatch", error: "O item Radar não corresponde à marca ou ao artigo solicitado." }, { status: 409, headers: noStoreHeaders });
    }

    const corrente = correnteDe(item.payload);
    if (!corrente) {
      return NextResponse.json({ code: "radar_analysis_not_found", error: "Nenhuma versão de análise foi encontrada para este artigo." }, { status: 404, headers: noStoreHeaders });
    }

    /*
     * §10 · A IDENTIDADE VIAJA COM A RESPOSTA.
     *
     * Quem cachear precisa saber a QUE versão a amostra pertence: um cache que
     * não sabe disso mostraria a amostra de uma investigação sobre a fotografia
     * de outra, e nada na tela diria.
     */
    const identidade = {
      articleId: input.articleId,
      analysisVersionId: corrente.versionId || null,
      profile: input.profile,
    };

    if (input.part === "sample") {
      return NextResponse.json({
        success: true, readbackConfirmed: true, ...identidade,
        sample: radarResearchSampleOfAnalysis({ payload: corrente.payload, profile: input.profile }),
      }, { headers: noStoreHeaders });
    }

    return NextResponse.json({
      success: true, readbackConfirmed: true, ...identidade,
      provenance: radarResearchProvenanceOfAnalysis({ payload: corrente.payload, profile: input.profile }),
    }, { headers: noStoreHeaders });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ success: false, code: "invalid_research_part_request", error: "Pedido de leitura da pesquisa inválido.", details: error.issues }, { status: 400, headers: noStoreHeaders });
    }
    if (error instanceof PersistenceUnavailableError) {
      return NextResponse.json({ success: false, code: error.code, error: error.message }, { status: 503, headers: noStoreHeaders });
    }
    const mapped = authzErrorResponse(error);
    return NextResponse.json({ success: false, code: error instanceof AuthzError ? "authorization_error" : "radar_research_part_error", error: mapped.message }, { status: mapped.status, headers: noStoreHeaders });
  }
}
