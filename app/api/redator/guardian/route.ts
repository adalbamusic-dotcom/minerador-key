import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { authzErrorResponse, requireCanonicalSessionProfile } from "@/lib/server/authz";
import { assertEditorialPermission } from "@/lib/server/editorial-authorization";
import { RedatorGuardianRequestSchema } from "@/lib/redator/contracts";
import { runGuardian } from "@/lib/redator/guardian";
import { readWriterGuardianContext } from "@/lib/server/writer-evidence-divergences";

/*
 * O Guardião do painel lê as divergências abertas do documento na Marca
 * autorizada (colunas escolhidas, até 50) e passa a emitir intenção,
 * evidência e canibalização quando há base registrada. Sem a migration, ou
 * com falha dessa leitura, ela é pulada com aviso e a análise determinística
 * segue igual.
 */
export async function POST(request: NextRequest) {
  try {
    const profile = await requireCanonicalSessionProfile();
    const input = RedatorGuardianRequestSchema.parse(await request.json());
    await assertEditorialPermission(profile, input.brandId, "redator", "review");
    /* SDD do Assunto, F4.2 · o Assunto do ArticleDNA fixado, lido na Marca autorizada, liga os avisos da virada e do destino. */
    const context = await readWriterGuardianContext({ brandId: input.brandId }, input.document.id, { articleDnaRef: input.document.articleDnaRef });
    return NextResponse.json({ report: runGuardian(input.document, input.contentHash, context) });
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ error: "Pedido de análise inválido.", details: error.issues }, { status: 400 });
    const mapped = authzErrorResponse(error); return NextResponse.json({ error: mapped.message }, { status: mapped.status });
  }
}
