import { NextResponse } from "next/server";
import { z } from "zod";
import { requireCanonicalSessionProfile } from "@/lib/server/authz";
import { lifecycleErrorResponse, parseRpcPayload, requireMineradorLifecyclePermission } from "@/lib/server/minerador-keyword-lifecycle";
import { isKeywordPublished } from "@/lib/minerador/keyword-lifecycle";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const InputSchema = z.object({
  keywordIds: z.array(z.string().uuid()).min(1).max(100),
});

export async function POST(request: Request, { params }: { params: Promise<{ brandId: string }> }) {
  try {
    const { brandId } = await params;
    const input = InputSchema.parse(await request.json());
    const profile = await requireCanonicalSessionProfile();
    await requireMineradorLifecyclePermission(profile, brandId, "manage");

    /*
     * PÁGINA NO AR NÃO SE APAGA.
     *
     * A proteção vivia só na tela, que filtra a seleção; no banco, publicada
     * virava um soft delete de 24 horas — recuperável, mas ainda assim fora
     * da operação e com prazo para sumir. Entre as duas pontas não havia
     * nada: uma chamada direta a esta rota passava reto.
     *
     * Volume baixo, KGR ausente, zero resultados — nada disso é motivo. Para
     * desfazer o vínculo existe ação própria ("Desvincular publicação").
     *
     * O lote inteiro é recusado de propósito: apagar as outras e avisar
     * depois deixaria o humano sem saber o que aconteceu com o quê.
     */
    const { data: alvos, error: alvosErro } = await profile.supabase
      .from("minerador_keywords")
      .select("id,keyword,status,analise_semantica")
      .eq("brand_id", brandId)
      .in("id", input.keywordIds)
      .is("deleted_at", null);
    if (alvosErro) throw alvosErro;
    const publicadas = (alvos || []).filter(item => isKeywordPublished({
      status: typeof item.status === "string" ? item.status : null,
      semantic: (item.analise_semantica as Record<string, unknown> | null) ?? null,
    }));
    if (publicadas.length > 0) {
      return NextResponse.json({
        success: false,
        code: "KEYWORD_DELETE_PUBLICATION_PROTECTED",
        message: `Página publicada não é apagada: ${publicadas.map(item => item.keyword).join(", ")}. Desvincule a publicação antes, se for mesmo o caso.`,
        keywords: publicadas.map(item => ({ id: item.id, keyword: item.keyword })),
      }, { status: 409 });
    }

    const { data, error } = await profile.supabase.rpc("lifecycle_delete_minerador_keywords", {
      p_brand_id: brandId,
      p_keyword_ids: input.keywordIds,
      p_actor_user_id: profile.userId,
    });
    if (error) throw error;
    return NextResponse.json({ success: true, ...parseRpcPayload(data) });
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ success: false, code: "KEYWORD_DELETE_NOT_FOUND", message: "Seleção de keywords inválida." }, { status: 400 });
    return lifecycleErrorResponse(error);
  }
}
