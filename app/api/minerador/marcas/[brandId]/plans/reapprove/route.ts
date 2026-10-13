import { NextRequest, NextResponse } from "next/server";
import { z, ZodError } from "zod";
import { isTenantId } from "@/lib/tenant-routing";
import { AuthzError, requireCanonicalSessionProfile } from "@/lib/server/authz";
import { requireTenantPermission } from "@/lib/server/tenant-context";
import { runKeywordLogicWithCore } from "@/lib/server/minerador-keyword-decision-core";
import { approveKeywordsWithRowsOnServer } from "@/lib/server/minerador-approve-and-send";

/**
 * REAPROVAR AS QUE O CADASTRO DEVOLVEU A "EM REVISÃO" (SDD
 * `docs/compartilhado/sdd-acelerar-fluxo-do-plano-2026-10-13.md`, item 9).
 *
 * O dono marca, na prévia do card "Cadastrar Assuntos", "Reaprovar as N que
 * voltaram a Em revisão"; depois do cadastro gravado e relido, a tela manda só
 * essas keywords. Os passos são os MESMOS núcleos do botão do Minerador e do
 * MCP (`run_keyword_logic` e `decide_keywords`), como no encadeamento da
 * conversão (`lib/server/minerador-subject-conversion.ts`): a Lógica
 * determinística (grátis) e a aprovação com `resolveApprovalReadiness` (a
 * D2-bis: o cadastro só pede a Lógica de novo), compare-and-swap e releitura.
 * Quem não puder ser aprovada volta com o motivo; nada é enviado ao Arquiteto
 * aqui. A marca vem da rota; o ator é `auth.users.id`; exige `minerador:approve`
 * e `minerador:edit`. Nenhuma chamada paga.
 */

export const dynamic = "force-dynamic";
export const revalidate = 0;

const RequestSchema = z.object({
  keywordIds: z.array(z.string().uuid()).min(1).max(100),
}).strict();

function failure(code: string, status: number, message: string, requestId: string) {
  return NextResponse.json({ success: false, code, message, diagnostic: { requestId } }, { status });
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ brandId: string }> }) {
  const requestId = crypto.randomUUID();
  try {
    const { brandId } = await params;
    if (!isTenantId(brandId)) return failure("BRAND_NOT_FOUND", 404, "Marca inválida.", requestId);
    const input = RequestSchema.parse(await request.json());
    const profile = await requireCanonicalSessionProfile();
    const context = await requireTenantPermission({ brandId, actorUserId: profile.userId, module: "minerador", action: "approve", profile });
    await requireTenantPermission({ brandId, actorUserId: profile.userId, module: "minerador", action: "edit", profile });
    const keywordIds = [...new Set(input.keywordIds)];

    const logic = await runKeywordLogicWithCore({ brandId: context.brandId, keywordIds });
    // SDD acelerar 2026-10-13, item 2: a aprovação é a do encadeamento único (`minerador-approve-and-send.ts`).
    const { rows, results } = await approveKeywordsWithRowsOnServer(context.brandId, context.actorUserId, keywordIds);
    const keywordById = new Map(rows.map(row => [row.id, row.keyword]));
    const found = new Set(rows.map(row => row.id));
    return NextResponse.json({
      success: true,
      requestId,
      logic: { applied: logic.applied, unchanged: logic.unchanged, failed: logic.failed },
      results: [
        ...results.map(result => ({ id: result.id, keyword: keywordById.get(result.id) ?? "", outcome: result.outcome, reason: result.reason ?? null })),
        ...keywordIds.filter(id => !found.has(id)).map(id => ({ id, keyword: "", outcome: "missing" as const, reason: "A keyword não existe mais nesta marca." })),
      ],
    });
  } catch (error) {
    if (error instanceof SyntaxError || error instanceof ZodError) return failure("INVALID_REAPPROVE_REQUEST", 400, "O pedido de reaprovação é inválido.", requestId);
    if (error instanceof AuthzError) return failure(error.status === 401 ? "REAPPROVE_UNAUTHENTICATED" : "REAPPROVE_AUTHORIZATION_FAILED", error.status, error.status === 401 ? error.message : "Reaprovar exige as permissões de aprovar e editar no Minerador.", requestId);
    return failure("REAPPROVE_FAILED", 503, "A reaprovação não pôde ser concluída agora. O cadastro continua gravado; aprove pela planilha.", requestId);
  }
}
