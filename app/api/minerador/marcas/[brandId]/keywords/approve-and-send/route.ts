import { NextRequest, NextResponse } from "next/server";
import { z, ZodError } from "zod";
import { isTenantId } from "@/lib/tenant-routing";
import { AuthzError, requireCanonicalSessionProfile } from "@/lib/server/authz";
import { requireTenantPermission } from "@/lib/server/tenant-context";
import { ApproveAndSendStaleError } from "@/lib/minerador/approve-and-send-core";
import { applyApproveAndSendOnServer, previewApproveAndSendOnServer } from "@/lib/server/minerador-approve-and-send";
import { PipelineRuntimeError } from "@/lib/server/pipeline-runtime";

/**
 * "APROVAR E ENVIAR AO ARQUITETO" (SDD
 * `docs/compartilhado/sdd-acelerar-fluxo-do-plano-2026-10-13.md`, item 2).
 *
 * POST `{ mode: "preview" | "apply", keywordIds, send?, decisionHash?, excludedIds? }`
 *
 * - `preview` não grava: diz, por keyword, "aprovar e enviar", "já aprovada,
 *   só enviar" ou "não pode ir" com o motivo, e o `decisionHash`.
 * - `apply` refaz a prévia; hash diferente = 409 e nada gravado. Aprova as
 *   marcadas (o MESMO núcleo do MCP `decide_keywords`, ator = `auth.users.id`)
 *   e envia as que ficaram aprovadas pelo handoff de sempre, em modo parcial;
 *   devolve o desfecho por keyword depois da releitura.
 * - `send: false` é a aprovação da tela (select Status → aprovado), sem envio.
 *
 * Exige `minerador:approve`; com envio, também `arquiteto:create`. A marca vem
 * da rota. Nada pago; nada é excluído.
 */

export const dynamic = "force-dynamic";
export const revalidate = 0;

const RequestSchema = z.object({
  mode: z.enum(["preview", "apply"]),
  keywordIds: z.array(z.string().uuid()).min(1).max(500),
  send: z.boolean().optional(),
  decisionHash: z.string().regex(/^[a-f0-9]{64}$/i).optional(),
  excludedIds: z.array(z.string().uuid()).max(500).optional(),
}).strict();

function failure(code: string, status: number, message: string, requestId: string) {
  return NextResponse.json({ success: false, code, message, diagnostic: { requestId } }, { status });
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ brandId: string }> }) {
  const requestId = crypto.randomUUID();
  try {
    const { brandId } = await params;
    if (!isTenantId(brandId)) return failure("BRAND_NOT_FOUND", 404, "Marca inválida.", requestId);
    const input = RequestSchema.parse(await request.json());
    const send = input.send !== false;
    if (input.mode === "apply" && !input.decisionHash) return failure("DECISION_HASH_REQUIRED", 400, "Aplicar exige o decisionHash da prévia.", requestId);
    const profile = await requireCanonicalSessionProfile();
    const context = await requireTenantPermission({ brandId, actorUserId: profile.userId, module: "minerador", action: "approve", profile })
      .catch((error: unknown) => { throw error instanceof AuthzError && error.status === 403 ? new AuthzError(403, "Aprovar exige a permissão minerador:approve (aprovar no Minerador). Peça ao dono da marca.") : error; });
    if (send) {
      await requireTenantPermission({ brandId, actorUserId: profile.userId, module: "arquiteto", action: "create", profile })
        .catch((error: unknown) => { throw error instanceof AuthzError && error.status === 403 ? new AuthzError(403, "Enviar ao Arquiteto exige a permissão arquiteto:create. Você pode aprovar sem enviar, ou peça ao dono da marca.") : error; });
    }
    const base = { brandId: context.brandId, actorId: context.actorUserId, keywordIds: input.keywordIds, send };
    if (input.mode === "preview") {
      const preview = await previewApproveAndSendOnServer(base);
      return NextResponse.json({ success: true, requestId, mode: "preview", readOnly: true, ...preview });
    }
    const result = await applyApproveAndSendOnServer({ ...base, decisionHash: input.decisionHash!, excludedIds: input.excludedIds ?? [] });
    return NextResponse.json({ success: true, requestId, mode: "apply", ...result });
  } catch (error) {
    if (error instanceof SyntaxError || error instanceof ZodError) return failure("INVALID_APPROVE_AND_SEND_REQUEST", 400, "O pedido de aprovar e enviar é inválido.", requestId);
    if (error instanceof ApproveAndSendStaleError) return failure(error.code, 409, error.message, requestId);
    if (error instanceof AuthzError) return failure(error.status === 401 ? "APPROVE_AND_SEND_UNAUTHENTICATED" : "APPROVE_AND_SEND_FORBIDDEN", error.status, error.message, requestId);
    if (error instanceof PipelineRuntimeError) return failure(`APPROVE_AND_SEND_${error.code}`, error.status, error.message, requestId);
    return failure("APPROVE_AND_SEND_FAILED", 503, "Aprovar e enviar não pôde ser concluído agora. Releia o Minerador: o que foi gravado aparece lá.", requestId);
  }
}
