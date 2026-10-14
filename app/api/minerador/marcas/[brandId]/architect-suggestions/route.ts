import { NextResponse } from "next/server";
import { z, ZodError } from "zod";
import { isTenantId } from "@/lib/tenant-routing";
import { applyArchitectSuggestions, ArchitectSuggestionStaleError, previewArchitectSuggestions } from "@/lib/minerador/architect-suggestions-apply";
import { buildArchitectSuggestionLines, summarizeArchitectSuggestions } from "@/lib/minerador/architect-suggestions-view";
import { architectSuggestionPorts } from "@/lib/server/minerador-architect-suggestions";
import { PipelineRuntimeError, resolvePipelineContext } from "@/lib/server/pipeline-runtime";
import { pipelineArtifactErrorResponse } from "@/lib/server/arquiteto-persistence";

/**
 * "SUGESTÕES DO ARQUITETO · COR X" — A CAIXA DO MINERADOR (SDD
 * `docs/compartilhado/sdd-arquiteto-so-le-e-listas-leves-2026-10-13.md`,
 * item 2, F4; D3).
 *
 * GET — a lista leve (`minerador:view`): por sugestão, a keyword, o tipo
 * (keyword nova · medir · Lógica), o artigo de destino, a cor, o volume, o
 * motivo, a origem e o que falta fazer agora. Nunca a medição guardada.
 *
 * POST `{ mode: "preview" | "apply", keys, decisionHash? }` — a prévia não grava
 * e devolve o `decisionHash`; aplicar refaz a prévia (mudou = 409, nada
 * gravado) e grava SÓ pelos núcleos do Minerador, no clique do dono: importar
 * (`minerador:create`, com a Lógica), gravar a medição guardada sem consultar
 * o Google Ads de novo e rodar a Lógica (`minerador:edit`). Aprovar e enviar
 * não acontece aqui: a resposta traz `approveAndSendIds` para o "Aprovar e
 * enviar" de sempre. Nada pago; nada é excluído.
 */

export const dynamic = "force-dynamic";
export const revalidate = 0;

const PostSchema = z.object({
  mode: z.enum(["preview", "apply"]),
  keys: z.array(z.string().min(1).max(700)).min(1).max(300),
  decisionHash: z.string().regex(/^[a-f0-9]{64}$/i).optional(),
}).strict();

function failure(code: string, status: number, message: string) {
  return NextResponse.json({ success: false, code, message }, { status });
}

export async function GET(_request: Request, { params }: { params: Promise<{ brandId: string }> }) {
  try {
    const { brandId } = await params;
    if (!isTenantId(brandId)) return failure("BRAND_NOT_FOUND", 404, "Marca inválida.");
    const view = await resolvePipelineContext({ brandId, module: "minerador", action: "view" });
    const ports = architectSuggestionPorts({ view });
    const records = await ports.readRecords();
    const lines = buildArchitectSuggestionLines(records, await ports.readFacts(records));
    return NextResponse.json({ success: true, data: { lines, colors: summarizeArchitectSuggestions(lines), readAt: new Date().toISOString() } });
  } catch (error) {
    const mapped = pipelineArtifactErrorResponse(error);
    return NextResponse.json(mapped.body, { status: mapped.status });
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ brandId: string }> }) {
  try {
    const { brandId } = await params;
    if (!isTenantId(brandId)) return failure("BRAND_NOT_FOUND", 404, "Marca inválida.");
    const input = PostSchema.parse(await request.json());
    if (input.mode === "apply" && !input.decisionHash) return failure("DECISION_HASH_REQUIRED", 400, "Aplicar exige o decisionHash da prévia.");
    const view = await resolvePipelineContext({ brandId, module: "minerador", action: "view" });
    // As permissões de gravar só são resolvidas quando o pedido grava (cada núcleo confere a sua).
    const ports = architectSuggestionPorts({
      view,
      create: () => resolvePipelineContext({ brandId, module: "minerador", action: "create" }),
      edit: () => resolvePipelineContext({ brandId, module: "minerador", action: "edit" }),
    });
    if (input.mode === "preview") {
      const { records: _records, ...preview } = await previewArchitectSuggestions(ports, { brandId: view.brandId, keys: input.keys });
      void _records;
      return NextResponse.json({ success: true, mode: "preview", readOnly: true, data: preview });
    }
    const result = await applyArchitectSuggestions(ports, { brandId: view.brandId, keys: input.keys, decisionHash: input.decisionHash! });
    return NextResponse.json({ success: true, mode: "apply", data: result });
  } catch (error) {
    if (error instanceof SyntaxError || error instanceof ZodError) return failure("INVALID_ARCHITECT_SUGGESTIONS_REQUEST", 400, "O pedido das sugestões do Arquiteto é inválido.");
    if (error instanceof ArchitectSuggestionStaleError) return failure(error.code, 409, error.message);
    if (error instanceof PipelineRuntimeError) return failure(`ARCHITECT_SUGGESTIONS_${error.code}`, error.status, error.message);
    const mapped = pipelineArtifactErrorResponse(error);
    return NextResponse.json(mapped.body, { status: mapped.status });
  }
}
