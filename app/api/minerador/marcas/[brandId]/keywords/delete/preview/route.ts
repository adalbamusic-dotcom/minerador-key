import { NextResponse } from "next/server";
import { z } from "zod";
import { requireCanonicalSessionProfile } from "@/lib/server/authz";
import { lifecycleErrorResponse, requireMineradorLifecyclePermission } from "@/lib/server/minerador-keyword-lifecycle";
import { KEYWORD_DELETE_MAX_IDS, KEYWORD_DELETE_REFUSAL_STATUS, previewKeywordDeleteWithCore } from "@/lib/minerador/keyword-delete-core";
import { architectDismantlePortForBrand } from "@/lib/server/arquiteto-territory-undo";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/*
 * A prévia da exclusão de sempre (selecionar → Excluir), grátis e só leitura.
 * 2026-10-17 (SDD da linha única do Minerador, P-4; pedido do dono "ele tem que
 * deixar apagar todo o grupo"): o núcleo `previewKeywordDeleteWithCore` devolve
 * o impacto de sempre (`items`, `publishedIds`, `hardDeleteIds`, `blockedIds`)
 * e, agora, o `decisionHash`, o que fica fora (com o motivo), o plano de cada
 * cor tocada (a mesma prévia de "Excluir tudo da cor", restrita às
 * selecionadas) e a confirmação que a regra única pede. Até 1.000 ids numa
 * decisão; a execução vai em blocos de 100.
 */
const InputSchema = z.object({
  keywordIds: z.array(z.string().uuid()).min(1).max(KEYWORD_DELETE_MAX_IDS),
});

export async function POST(request: Request, { params }: { params: Promise<{ brandId: string }> }) {
  try {
    const { brandId } = await params;
    const input = InputSchema.parse(await request.json());
    const profile = await requireCanonicalSessionProfile();
    await requireMineradorLifecyclePermission(profile, brandId, "manage");

    // 2026-10-18 · o desmonte do Arquiteto entra na prévia (o alerta, por área): o mesmo núcleo do "Desfazer Silo".
    const result = await previewKeywordDeleteWithCore({ client: profile.supabase, brandId, actorUserId: profile.userId, keywordIds: input.keywordIds, architect: architectDismantlePortForBrand(brandId) });
    if (!result.ok) return NextResponse.json({ success: false, code: result.code, message: result.message }, { status: KEYWORD_DELETE_REFUSAL_STATUS[result.code] });
    return NextResponse.json({ success: true, ...result.preview, decisionHash: result.decisionHash });
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ success: false, code: "KEYWORD_DELETE_NOT_FOUND", message: "Seleção de keywords inválida." }, { status: 400 });
    return lifecycleErrorResponse(error);
  }
}
