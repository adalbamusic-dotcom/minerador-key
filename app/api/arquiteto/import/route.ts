import { NextResponse } from "next/server";
import { z } from "zod";
import { ApproveAndSendStaleError } from "@/lib/minerador/approve-and-send-core";
import { pipelineArtifactErrorResponse } from "@/lib/server/arquiteto-persistence";
import { applyArquitetoImport, loadArquitetoImportPool, previewArquitetoImport } from "@/lib/server/arquiteto-minerador-import";
import { resolvePipelineContext } from "@/lib/server/pipeline-runtime";

/**
 * "IMPORTAR DO MINERADOR" NO ARQUITETO (pedido do dono, 2026-10-13; SDD
 * `docs/compartilhado/sdd-acelerar-fluxo-do-plano-2026-10-13.md`, itens 1, 2 e 6).
 *
 * GET `?brandId=` — a lista leve: por keyword só id, keyword, grupo, status e
 * o estado curto ("pode importar", "precisa aprovar no Minerador", "já no
 * Arquiteto", "fora: motivo"), conferido pelo MESMO portão do "Aprovar e
 * enviar". Exige `arquiteto:view`.
 *
 * POST `{ brandId, mode: "preview" | "apply", keywordIds, decisionHash?, excludedIds? }`
 * — prévia com `decisionHash` e recusa por item; aplicar SÓ importa as já
 * aprovadas (o handoff parcial do Arquiteto, que prepara o Silo do plano).
 * F4 (SDD 2026-10-13 `sdd-arquiteto-so-le-e-listas-leves`, item 2, D2): o
 * Arquiteto não aprova — a que precisa de aprovação vai ao "Aprovar no
 * Minerador". Sessão do usuário, sem service role. Exige `arquiteto:create`.
 * Nada pago; nada é excluído; nada é gravado em `minerador_keywords`.
 */

const GetSchema = z.object({ brandId: z.string().uuid() });

const PostSchema = z.object({
  brandId: z.string().uuid(),
  mode: z.enum(["preview", "apply"]),
  keywordIds: z.array(z.string().uuid()).min(1).max(500),
  decisionHash: z.string().regex(/^[a-f0-9]{64}$/i).optional(),
  excludedIds: z.array(z.string().uuid()).max(500).optional(),
}).strict();

export async function GET(request: Request) {
  try {
    const query = GetSchema.parse({ brandId: new URL(request.url).searchParams.get("brandId") || "" });
    const context = await resolvePipelineContext({ brandId: query.brandId, module: "arquiteto", action: "view" });
    const pool = await loadArquitetoImportPool(context);
    return NextResponse.json({ success: true, data: pool });
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ success: false, error: "brandId é obrigatório e deve ser válido.", code: "INVALID_CONTEXT" }, { status: 400 });
    const mapped = pipelineArtifactErrorResponse(error);
    return NextResponse.json(mapped.body, { status: mapped.status });
  }
}

export async function POST(request: Request) {
  try {
    const input = PostSchema.parse(await request.json());
    if (input.mode === "apply" && !input.decisionHash) {
      return NextResponse.json({ success: false, error: "Importar exige o decisionHash da prévia.", code: "DECISION_HASH_REQUIRED" }, { status: 400 });
    }
    const context = await resolvePipelineContext({ brandId: input.brandId, module: "arquiteto", action: "create" });
    if (input.mode === "preview") {
      return NextResponse.json({ success: true, mode: "preview", readOnly: true, data: await previewArquitetoImport(context, input.keywordIds) });
    }
    const result = await applyArquitetoImport(context, { keywordIds: input.keywordIds, decisionHash: input.decisionHash!, excludedIds: input.excludedIds });
    return NextResponse.json({ success: true, mode: "apply", data: result });
  } catch (error) {
    if (error instanceof SyntaxError || error instanceof z.ZodError) return NextResponse.json({ success: false, error: "O pedido de importação é inválido.", code: "INVALID_CONTEXT" }, { status: 400 });
    if (error instanceof ApproveAndSendStaleError) return NextResponse.json({ success: false, error: error.message, code: error.code }, { status: 409 });
    const mapped = pipelineArtifactErrorResponse(error);
    return NextResponse.json(mapped.body, { status: mapped.status });
  }
}
