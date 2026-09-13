import { NextResponse } from "next/server";
import { z } from "zod";
import { BackupContractError, parseBackup } from "@/lib/arquiteto/backup-contract";
import { applyArquitetoRestore, planArquitetoRestore } from "@/lib/server/arquiteto-backup-restore";
import { pipelineArtifactErrorResponse } from "@/lib/server/arquiteto-persistence";
import { resolvePipelineContext } from "@/lib/server/pipeline-runtime";

/**
 * RESTAURAR BACKUP — duas etapas, e a fronteira do formato é do SERVIDOR.
 *
 * O preview lê o remoto e classifica; o apply escreve pelos writers canônicos
 * e confirma por readback. Recusar arquivo que não se declara
 * `ARQUITETO_BACKUP` acontece aqui também, e não só no navegador: a validação
 * do cliente é conveniência, não autoridade.
 *
 * `preview` resolve o contexto com ação de leitura; só `apply` pede edição.
 */
const RequestSchema = z.object({
  brandId: z.string().uuid(),
  mode: z.enum(["preview", "apply"]),
  backup: z.string().min(1).max(40_000_000),
  /**
   * Restaurar numa Brand diferente da de origem é DECISÃO EXPLÍCITA de
   * homologação e nunca um default. Sem esta bandeira o plano é bloqueado com
   * `CROSS_BRAND_RESTORE`, mesmo que tudo o mais esteja íntegro.
   */
  allowCrossBrand: z.boolean().optional(),
}).strict();

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const parsed = RequestSchema.parse(await request.json());
    const file = parseBackup(parsed.backup);
    const context = await resolvePipelineContext({
      brandId: parsed.brandId,
      module: "arquiteto",
      action: parsed.mode === "apply" ? "edit" : "view",
    });

    const options = { allowCrossBrand: parsed.allowCrossBrand === true };
    if (parsed.mode === "preview") {
      return NextResponse.json({ success: true, data: { mode: "preview", plan: await planArquitetoRestore(context, file, options) } });
    }
    return NextResponse.json({ success: true, data: { mode: "apply", ...(await applyArquitetoRestore(context, file, options)) } });
  } catch (error) {
    if (error instanceof BackupContractError) {
      return NextResponse.json({ success: false, error: error.message, code: error.code }, { status: 400 });
    }
    if (error instanceof z.ZodError) {
      return NextResponse.json({ success: false, error: "A solicitação de restauração é inválida.", code: "INVALID_CONTEXT" }, { status: 400 });
    }
    const mapped = pipelineArtifactErrorResponse(error);
    return NextResponse.json(mapped.body, { status: mapped.status });
  }
}
