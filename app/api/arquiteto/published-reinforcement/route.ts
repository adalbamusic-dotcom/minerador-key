import { NextRequest, NextResponse } from "next/server";
import type { ArticleDNA, VersionEnvelope } from "@/lib/arquiteto/contracts";
import { PublishedReinforcementRequestSchema, handlePublishedReinforcement, inProcessRequestHeaders, type PublishedReinforcementDeps } from "@/lib/server/arquiteto-published-reinforcement";
import { publishedReinforcementReadDeps, publishedReinforcementSerpBinding } from "@/lib/server/arquiteto-published-reinforcement-deps";
import { differentiationErrorResponse } from "@/lib/server/arquiteto-differentiation-http";
import { appendArquitetoArtifact } from "@/lib/server/arquiteto-persistence";
import { createMineradorArquitetoHandoff } from "@/lib/server/arquiteto-workspace";
import { applyKeywordDecisionEntries, keywordDecisionEntries, readDecisionKeywords, runKeywordLogicWithCore } from "@/lib/server/minerador-keyword-decision-core";
import { resolvePipelineContext } from "@/lib/server/pipeline-runtime";
import { importSubjectDiscoveryWithCore } from "@/lib/minerador/subject-discovery-import";
import { PATCH as patchArchitectWorkspace } from "@/app/api/arquiteto/workspace/route";
import { POST as measureGoogleAdsVolumes } from "@/app/api/minerador/marcas/[brandId]/google-ads/metricas-keywords/route";

/**
 * REFORÇAR PUBLICADOS — PRÉVIA E CONFIRMAÇÃO (SDD docs/04-arquiteto/sdd-reforcar-publicados-2026-09-28.md).
 *
 * `preview` (grátis, permissão de ver o Arquiteto): o que será gravado em cada
 * publicado e o `decisionHash`. `apply` (humano, com o hash e, havendo keyword
 * nova, o aceite de que o dono a aprova no Minerador): grava pelos MESMOS
 * núcleos das telas, na ordem, parando no primeiro erro com o motivo:
 *
 *   import da Pesquisa por Assunto (`importSubjectDiscoveryWithCore`) →
 *   Lógica (`runKeywordLogicWithCore`, o mesmo do MCP) →
 *   Volume do Google Ads (a MESMA rota do Minerador, chamada em processo) →
 *   aprovação (`keywordDecisionEntries` + `applyKeywordDecisionEntries`,
 *   ator = a sessão) → envio ao Arquiteto (`createMineradorArquitetoHandoff`) →
 *   composição e Silo no item de workflow (a MESMA rota PATCH da mesa) →
 *   ArticleDNA aprovado pelo writer canônico (`appendArquitetoArtifact`).
 *
 * Cada passo confirma pela releitura. A marca e o ator vêm do contexto
 * resolvido no servidor; cada módulo tocado confere a própria permissão — as
 * do Minerador só quando a prévia confirmada tem keyword nova de fato. O
 * ArticleDNA aprovado passa pela mesma revalidação da rota de artefatos
 * (`articleApprovalRevalidationIssues`, no núcleo). As chamadas em processo
 * levam só a sessão (cookie) e o tipo do corpo. URL, slug, canonical e marca
 * nunca mudam.
 */
export async function POST(request: NextRequest) {
  try {
    const parsed = PublishedReinforcementRequestSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ success: false, code: "INVALID_REINFORCEMENT_REQUEST", error: "Pedido do Reforçar publicados inválido. Nada foi gravado.", issues: parsed.error.flatten() }, { status: 400 });
    }
    const body = parsed.data;
    const aplicar = body.mode === "apply";
    const context = await resolvePipelineContext({ brandId: body.brandId, module: "arquiteto", action: aplicar ? "edit" : "view" });
    const cabecalhos = inProcessRequestHeaders(request.headers);

    // As mesmas leituras da ferramenta MCP da prévia: o hash sai igual pelos dois caminhos.
    const deps: PublishedReinforcementDeps = publishedReinforcementReadDeps(context);
    if (aplicar) {
      deps.patchWorkingCopy = async updates => {
        const resposta = await patchArchitectWorkspace(new Request(new URL("/api/arquiteto/workspace", request.url), {
          method: "PATCH",
          headers: cabecalhos,
          body: JSON.stringify({ brandId: context.brandId, updates }),
        }));
        if (!resposta.ok) {
          const corpo = await resposta.json().catch(() => null) as { error?: string } | null;
          throw new Error(corpo?.error || "A composição do artigo não foi gravada.");
        }
      };
      deps.persistArticleVersion = async (version: VersionEnvelope<ArticleDNA>) => {
        const gravada = await appendArquitetoArtifact(context, "article_dna", version, "approved");
        return { status: gravada.status, versionId: gravada.version.versionId };
      };
      // O parecer da SERP e a conclusão na formação: o aceite é decisão de aprovar.
      deps.bindSerpToFormation = publishedReinforcementSerpBinding(context, await resolvePipelineContext({ brandId: body.brandId, module: "arquiteto", action: "approve" }));
    }
    if (aplicar) deps.loadMinerador = async () => {
      // Cada módulo tocado confere a própria permissão, com o mesmo ator.
      const [criar, editar, aprovar, enviar] = await Promise.all([
        resolvePipelineContext({ brandId: body.brandId, module: "minerador", action: "create" }),
        resolvePipelineContext({ brandId: body.brandId, module: "minerador", action: "edit" }),
        resolvePipelineContext({ brandId: body.brandId, module: "minerador", action: "approve" }),
        resolvePipelineContext({ brandId: body.brandId, module: "arquiteto", action: "create" }),
      ]);
      return {
        importKeywords: async importRequest => {
          const resultado = await importSubjectDiscoveryWithCore({ brandId: criar.brandId, actorUserId: criar.actorUserId, supabase: criar.supabase, request: importRequest });
          return resultado.ok ? { ok: true } : { ok: false, reason: resultado.reason };
        },
        runLogic: async keywordIds => {
          const resultado = await runKeywordLogicWithCore({ brandId: editar.brandId, keywordIds, db: editar.supabase });
          return { ok: resultado.readbackConfirmed && !resultado.missingIds.length, reason: resultado.missingIds.length ? "keyword não encontrada" : resultado.readbackConfirmed ? null : "a releitura não confirmou a Lógica" };
        },
        measureVolume: async (keywordIds, operationRequestId) => {
          const resposta = await measureGoogleAdsVolumes(new NextRequest(new URL(`/api/minerador/marcas/${editar.brandId}/google-ads/metricas-keywords`, request.url), {
            method: "POST",
            headers: cabecalhos,
            body: JSON.stringify({ operationRequestId, keywordIds, candidateIds: [] }),
          }), { params: Promise.resolve({ brandId: editar.brandId }) });
          const corpo = await resposta.json().catch(() => null) as { success?: boolean; message?: string } | null;
          return { ok: resposta.ok && corpo?.success === true, reason: corpo?.message ?? null };
        },
        readVolumes: async keywordIds => {
          const { data, error } = await editar.supabase.from("minerador_keywords").select("id,volume_search,volume_source").eq("brand_id", editar.brandId).is("deleted_at", null).in("id", keywordIds);
          if (error) throw error;
          return new Map(((data || []) as Array<{ id: string; volume_search: number | null; volume_source: string | null }>).map(linha => [String(linha.id), {
            volume: typeof linha.volume_search === "number" ? linha.volume_search : null,
            validated: String(linha.volume_source ?? "").toLowerCase() === "google_ads" && (linha.volume_search ?? 0) > 0,
          }]));
        },
        approve: async keywordIds => {
          const { rows, missingCount } = await readDecisionKeywords(aprovar.brandId, keywordIds, aprovar.supabase);
          if (missingCount) return { ok: false, reason: "keyword não encontrada" };
          const entries = keywordDecisionEntries(rows, "approve");
          const bloqueada = entries.find(entry => entry.outcome === "blocked");
          if (bloqueada) return { ok: false, reason: `"${bloqueada.keyword}": ${bloqueada.blockers[0]}` };
          const resultados = await applyKeywordDecisionEntries({ brandId: aprovar.brandId, actorId: aprovar.actorUserId, action: "approve", rows, entries, db: aprovar.supabase });
          const falha = resultados.find(item => item.outcome !== "applied" && item.outcome !== "unchanged");
          return { ok: !falha, reason: falha ? falha.reason ?? "a releitura não confirmou a aprovação" : null };
        },
        handoff: async keywordIds => { await createMineradorArquitetoHandoff(enviar, keywordIds); },
      };
    };
    const outcome = await handlePublishedReinforcement(deps, body);
    return NextResponse.json(outcome.body, { status: outcome.status });
  } catch (error) {
    const mapped = differentiationErrorResponse(error, "O Reforçar publicados não pôde ser concluído. Recarregue a prévia para ver o que já foi gravado.");
    return NextResponse.json(mapped.body, { status: mapped.status });
  }
}
