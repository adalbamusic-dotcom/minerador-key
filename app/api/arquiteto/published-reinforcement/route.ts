import { NextRequest, NextResponse } from "next/server";
import type { ArticleDNA, VersionEnvelope } from "@/lib/arquiteto/contracts";
import { PublishedReinforcementRequestSchema, handlePublishedReinforcement, inProcessRequestHeaders, type PublishedReinforcementDeps } from "@/lib/server/arquiteto-published-reinforcement";
import { publishedReinforcementReadDeps, publishedReinforcementSerpBinding } from "@/lib/server/arquiteto-published-reinforcement-deps";
import { differentiationErrorResponse } from "@/lib/server/arquiteto-differentiation-http";
import { appendArquitetoArtifact } from "@/lib/server/arquiteto-persistence";
import { recordArquitetoMineradorSuggestionsSafely } from "@/lib/server/arquiteto-minerador-suggestions";
import { resolvePipelineContext } from "@/lib/server/pipeline-runtime";
import { PATCH as patchArchitectWorkspace } from "@/app/api/arquiteto/workspace/route";

/**
 * REFORÇAR PUBLICADOS — PRÉVIA E CONFIRMAÇÃO (SDD docs/04-arquiteto/sdd-reforcar-publicados-2026-09-28.md).
 *
 * `preview` (grátis, permissão de ver o Arquiteto): o que será gravado em cada
 * publicado e o `decisionHash`. `apply` (humano, com o hash): grava, na ordem,
 * parando no primeiro erro com o motivo:
 *
 *   keywords novas → "Sugestões do Arquiteto" (F4, SDD 2026-10-13
 *   `sdd-arquiteto-so-le-e-listas-leves`, item 2: o Arquiteto só lê keyword;
 *   importar, medir, aprovar e enviar são do dono, no Minerador) →
 *   composição e Silo no item de workflow (a MESMA rota PATCH da mesa) →
 *   ArticleDNA aprovado pelo writer canônico (`appendArquitetoArtifact`).
 *
 * Cada passo confirma pela releitura. A marca e o ator vêm do contexto
 * resolvido no servidor; nenhuma permissão do Minerador é pedida (nada é
 * gravado lá). O ArticleDNA aprovado passa pela mesma revalidação da rota de artefatos
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
    // F4 · O ARQUITETO SÓ LÊ: as keywords novas viram "Sugestões do Arquiteto" (item de workflow do Arquiteto); nada no Minerador.
    if (aplicar) deps.recordMineradorSuggestions = input => recordArquitetoMineradorSuggestionsSafely(context, input);
    const outcome = await handlePublishedReinforcement(deps, body);
    return NextResponse.json(outcome.body, { status: outcome.status });
  } catch (error) {
    const mapped = differentiationErrorResponse(error, "O Reforçar publicados não pôde ser concluído. Recarregue a prévia para ver o que já foi gravado.");
    return NextResponse.json(mapped.body, { status: mapped.status });
  }
}
