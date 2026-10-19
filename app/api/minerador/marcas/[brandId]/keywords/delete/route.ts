import { NextResponse } from "next/server";
import { z } from "zod";
import { requireCanonicalSessionProfile } from "@/lib/server/authz";
import { lifecycleErrorResponse, requireMineradorLifecyclePermission } from "@/lib/server/minerador-keyword-lifecycle";
import { applyKeywordDeleteWithCore, KEYWORD_DELETE_MAX_IDS, KEYWORD_DELETE_REFUSAL_STATUS } from "@/lib/minerador/keyword-delete-core";
import { architectDismantlePortForBrand } from "@/lib/server/arquiteto-territory-undo";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const InputSchema = z.object({
  keywordIds: z.array(z.string().uuid()).min(1).max(KEYWORD_DELETE_MAX_IDS),
  /**
   * O chamador DECLARA que sabe que ha publicada no lote e quer a janela de
   * 24 horas. Ausente e false: quem nao declara nao apaga publicada.
   *
   * Na tela isso e o dialogo que exige digitar o nome da keyword. Nao e um
   * detalhe de transporte -- e a diferenca entre apagar de proposito e uma
   * pagina no ar sumir por efeito colateral de dedupe ou processamento.
   */
  allowRecoverable: z.boolean().optional().default(false),
  /** 2026-10-17 (P-4): a decisão foi tomada sobre a prévia com este hash. */
  decisionHash: z.string().trim().min(1).max(200).optional(),
  /** 2026-10-17 (P-4): o que o dono digitou — a regra única confere na tela e aqui. */
  typed: z.object({
    selection: z.string().max(400).optional(),
    colors: z.record(z.string().max(40), z.string().max(80)).optional(),
    phrase: z.string().max(80).optional(),
    publishedNames: z.record(z.string().uuid(), z.string().max(400)).optional(),
  }).strict().optional(),
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
     * KEYWORD_DELETE_REQUIRES_RECOVERABLE_FLOW, nomeando as keywords. A
     * declaração vai ao núcleo, que a passa à RPC em cada bloco.
     *
     * 2026-10-17 (SDD da linha única do Minerador, P-4; pedido do dono "ele
     * tem que deixar apagar todo o grupo"): o núcleo `applyKeywordDeleteWithCore`
     * só executa a decisão tomada sobre a prévia VIGENTE (mesmo `decisionHash`)
     * e com a confirmação da regra única; a keyword que carrega o plano sai pelo
     * núcleo de "Excluir tudo da cor" (libera o Assunto e exclui na mesma
     * transação, plano com a versão nova), as outras pela RPC de sempre.
     */
    const result = await applyKeywordDeleteWithCore({
      client: profile.supabase,
      brandId,
      actorUserId: profile.userId,
      keywordIds: input.keywordIds,
      allowRecoverable: input.allowRecoverable,
      decisionHash: input.decisionHash ?? null,
      typed: input.typed ?? {},
      // 2026-10-18 · o desmonte do Arquiteto ANTES das keywords (o mesmo núcleo do "Desfazer Silo").
      architect: architectDismantlePortForBrand(brandId),
    });
    if (!result.ok) {
      return NextResponse.json({ success: false, code: result.code, message: result.message, ...(result.preview ? { preview: result.preview, decisionHash: result.decisionHash } : {}), ...(result.missing ? { missing: result.missing } : {}) }, { status: KEYWORD_DELETE_REFUSAL_STATUS[result.code] });
    }
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ success: false, code: "KEYWORD_DELETE_NOT_FOUND", message: "Seleção de keywords inválida." }, { status: 400 });
    return lifecycleErrorResponse(error);
  }
}
