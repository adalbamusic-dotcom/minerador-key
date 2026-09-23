/**
 * ===== A PORTA DO REDATOR PARA PUBLICAÇÕES · CORTE 2 =====
 *
 * ==================== DUAS PERMISSÕES, E NÃO UMA ====================
 *
 * Quem entrega precisa poder aprovar no Redator E criar em Publicações. Exigir
 * só a primeira deixaria alguém sem acesso a Publicações empurrar registro para
 * lá; exigir só a segunda deixaria alguém de fora do Redator entregar um
 * documento que ele não pode nem ler.
 *
 * ==================== READBACK OU ERRO ====================
 *
 * `readbackConfirmed: true` só sai daqui depois que o serviço releu o registro
 * do servidor. O cliente recusa a resposta que não trouxer essa confirmação —
 * é o que impede a tela de gravar estado local sobre uma entrega que não houve.
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { authzErrorResponse, requireCanonicalSessionProfile } from "@/lib/server/authz";
import { assertEditorialPermission } from "@/lib/server/editorial-authorization";
import { PersistenceUnavailableError } from "@/lib/server/editorial-db";
import { WriterEvidenceError } from "@/lib/server/writer-evidence-document";
import { sendWriterToPublications, WriterPublicationError } from "@/lib/server/writer-publication-handoff";

export const dynamic = "force-dynamic";

const noStoreHeaders = { "Cache-Control": "no-store" } as const;

/*
 * `documentId` é OBRIGATÓRIO no contrato novo, mesmo com
 * `publication_records.document_id` nulável no schema efetivo. O banco aceita
 * registro órfão; o produto não. A garantia mora aqui porque é aqui que ela
 * pode existir.
 */
const CorpoSchema = z.object({
  brandId: z.string().uuid(),
  documentId: z.string().trim().min(1).max(512),
}).strict();

export async function POST(request: Request) {
  try {
    const profile = await requireCanonicalSessionProfile();
    const input = CorpoSchema.parse(await request.json());
    await assertEditorialPermission(profile, input.brandId, "redator", "approve");
    await assertEditorialPermission(profile, input.brandId, "publicacoes", "create");

    const resultado = await sendWriterToPublications({
      brandId: input.brandId,
      documentId: input.documentId,
      actorId: profile.userId,
    });

    return NextResponse.json({
      success: true,
      persistenceMode: "remote" as const,
      readbackConfirmed: true,
      change: resultado.change,
      publicationId: resultado.publicationId,
      documentHash: resultado.documentHash,
      publication: resultado.publication,
      headline: resultado.change === "ALREADY_SENT"
        ? "Este artigo já estava em Publicações; nada foi duplicado."
        : "Pacote entregue a Publicações e confirmado na leitura remota.",
    }, { headers: noStoreHeaders });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ success: false, code: "invalid_input", issues: error.issues },
        { status: 400, headers: noStoreHeaders });
    }
    if (error instanceof WriterPublicationError) {
      return NextResponse.json({ success: false, code: error.code, error: error.message },
        { status: error.status, headers: noStoreHeaders });
    }
    if (error instanceof WriterEvidenceError) {
      return NextResponse.json({ success: false, code: error.code, error: error.message },
        { status: error.status, headers: noStoreHeaders });
    }
    if (error instanceof PersistenceUnavailableError) {
      return NextResponse.json({ success: false, code: error.code, error: error.message },
        { status: 503, headers: noStoreHeaders });
    }
    const mapped = authzErrorResponse(error);
    return NextResponse.json({ success: false, code: "unauthorized", error: mapped.message },
      { status: mapped.status, headers: noStoreHeaders });
  }
}
