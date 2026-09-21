import { NextResponse } from "next/server";
import { z } from "zod";
import { requireCanonicalSessionProfile } from "@/lib/server/authz";
import { lifecycleErrorResponse, parseRpcPayload, requireMineradorLifecyclePermission } from "@/lib/server/minerador-keyword-lifecycle";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const InputSchema = z.object({
  keywordIds: z.array(z.string().uuid()).min(1).max(100),
  /**
   * O chamador DECLARA que sabe que ha publicada no lote e quer a janela de
   * 24 horas. Ausente e false: quem nao declara nao apaga publicada.
   *
   * Na tela isso e o dialogo que exige digitar o nome da keyword. Nao e um
   * detalhe de transporte -- e a diferenca entre apagar de proposito e uma
   * pagina no ar sumir por efeito colateral de dedupe ou processamento.
   */
  allowRecoverable: z.boolean().optional().default(false),
});

export async function POST(request: Request, { params }: { params: Promise<{ brandId: string }> }) {
  try {
    const { brandId } = await params;
    const input = InputSchema.parse(await request.json());
    const profile = await requireCanonicalSessionProfile();
    await requireMineradorLifecyclePermission(profile, brandId, "manage");

    /*
     * PÁGINA NO AR SÓ SAI POR DECISÃO DECLARADA.
     *
     * Apagar uma publicada é permitido: o contrato prevê a janela de 24
     * horas com restauração, e o resgate existe inteiro (recoverable,
     * restore, purge). O que não é permitido é ela sumir por EFEITO
     * COLATERAL — dedupe, processamento, volume baixo, zero resultados.
     *
     * A diferença é a declaração, e quem decide é o banco: sem
     * p_allow_recoverable a RPC recusa o lote inteiro com
     * KEYWORD_DELETE_REQUIRES_RECOVERABLE_FLOW, nomeando as keywords.
     *
     * A checagem NÃO é repetida aqui de propósito. Entre 2026-09-21 e a
     * correção desta rota existiu uma guarda 409 própria, e ela recusava o
     * fluxo legítimo de 24 horas antes mesmo de chegar ao banco — duas
     * fontes de verdade divergindo, com a tela oferecendo o que a rota
     * negava.
     */
    const { data, error } = await profile.supabase.rpc("lifecycle_delete_minerador_keywords", {
      p_brand_id: brandId,
      p_keyword_ids: input.keywordIds,
      p_actor_user_id: profile.userId,
      p_allow_recoverable: input.allowRecoverable,
    });
    if (error) throw error;
    return NextResponse.json({ success: true, ...parseRpcPayload(data) });
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ success: false, code: "KEYWORD_DELETE_NOT_FOUND", message: "Seleção de keywords inválida." }, { status: 400 });
    return lifecycleErrorResponse(error);
  }
}
