import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { authzErrorResponse, requireCanonicalSessionProfile } from "@/lib/server/authz";
import { assertEditorialPermission } from "@/lib/server/editorial-authorization";
import { PersistenceUnavailableError } from "@/lib/server/editorial-db";
import { WriterEvidenceError, readWriterArticleBlueprintPanel } from "@/lib/server/writer-evidence-reader";

/*
 * ===== 2026-10-09 · O ARTIGO-MODELO NO PAINEL DO REDATOR (regra do piloto) =====
 *
 * Só leitura: nada grava, nada chama IA nem provider. O painel de fundamentos
 * pede aqui a MESMA projeção do artigo-modelo que os fundamentos do MCP e o
 * pacote da seção recebem (o mesmo pick do CSV e a leitura compartilhada), com
 * a virada do Assunto pela planta. Sem planta concluída, o estado explícito
 * "ausente" com o motivo — a tela oferece organizar no Radar.
 *
 * A Marca é a da sessão (permissão de leitura do Redator); o documento de outra
 * Marca é `document_not_found`, como no resto do leitor de evidências.
 */
export async function GET(request: NextRequest) {
  try {
    const profile = await requireCanonicalSessionProfile();
    const brandId = z.string().uuid().parse(request.nextUrl.searchParams.get("brandId"));
    const documentId = z.string().min(1).max(300).parse(request.nextUrl.searchParams.get("documentId"));
    await assertEditorialPermission(profile, brandId, "redator", "view");
    const leitura = await readWriterArticleBlueprintPanel({ brandId }, documentId);
    return NextResponse.json(leitura);
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ code: "invalid_input", issues: error.issues }, { status: 400 });
    if (error instanceof WriterEvidenceError) return NextResponse.json({ code: error.code, error: error.message }, { status: error.status });
    if (error instanceof PersistenceUnavailableError) return NextResponse.json({ code: error.code, error: error.message }, { status: 503 });
    const mapped = authzErrorResponse(error);
    return NextResponse.json({ error: mapped.message }, { status: mapped.status });
  }
}
