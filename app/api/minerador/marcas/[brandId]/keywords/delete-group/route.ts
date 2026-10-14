import { NextRequest, NextResponse } from "next/server";
import { z, ZodError } from "zod";
import { isTenantId } from "@/lib/tenant-routing";
import { AuthzError, requireCanonicalSessionProfile } from "@/lib/server/authz";
import { requireMineradorLifecyclePermission } from "@/lib/server/minerador-keyword-lifecycle";
import { editorialGroupsFailure, safeDatabaseCode } from "@/lib/server/editorial-groups";
import {
  applyGroupDeleteAllWithCore,
  GROUP_DELETE_ALL_REFUSAL_STATUS,
  previewGroupDeleteAllWithCore,
} from "@/lib/minerador/group-delete-all-core";

/**
 * EXCLUIR TUDO DA COR X (F7; SDD `docs/compartilhado/sdd-arquiteto-so-le-e-listas-leves-2026-10-13.md`,
 * item 6, D6/D7/D8). O núcleo único `previewGroupDeleteAllWithCore` /
 * `applyGroupDeleteAllWithCore` (`lib/minerador/group-delete-all-core.ts`).
 *
 * - POST `{ groupId, mode: "preview", includePublished? }`: a prévia (grátis,
 *   só leitura) com o `decisionHash`: o que é apagado de vez, o que vai para a
 *   lixeira de 24 h (só com `includePublished`, D6), o que fica fora e por quê,
 *   os Assuntos liberados, o plano depois, se a cor fica livre (D7), as outras
 *   áreas (D8: sem exclusão) e se a operação está disponível no banco.
 * - POST `{ groupId, mode: "apply", includePublished?, decisionHash, typed }`:
 *   só a decisão tomada sobre a prévia vigente, com a confirmação forte
 *   (`typed.color` = o nome da cor; `typed.phrase` = "apaga de vez" quando há
 *   exclusão definitiva; `typed.publishedNames[id]` = o nome de cada publicada
 *   incluída). Executa em blocos de até 100 pela RPC `lifecycle_delete_group_keywords`
 *   (migration M-E) e relê. Sem a M-E: 409 `GROUP_DELETE_NOT_AVAILABLE`, nada é escrito.
 *
 * Mesma permissão da exclusão comum: `minerador:manage`. Nenhuma chamada paga.
 * Exclusão fica FORA do MCP (`AGENTS.md` §17.1): só esta tela chama esta rota.
 */

export const dynamic = "force-dynamic";
export const revalidate = 0;

const RequestSchema = z.object({
  groupId: z.string().uuid(),
  mode: z.enum(["preview", "apply"]),
  includePublished: z.boolean().optional().default(false),
  decisionHash: z.string().trim().min(1).max(200).optional(),
  typed: z.object({
    color: z.string().max(80).optional(),
    phrase: z.string().max(80).optional(),
    publishedNames: z.record(z.string().uuid(), z.string().max(400)).optional(),
  }).strict().optional(),
}).strict();

function failureFrom(error: unknown, requestId: string) {
  if (error instanceof ZodError) return editorialGroupsFailure("INVALID_GROUP_DELETE_REQUEST", 400, "O pedido de excluir tudo da cor é inválido.", { requestId, issues: error.issues.map(issue => ({ path: issue.path, code: issue.code })) });
  if (error instanceof AuthzError) return editorialGroupsFailure(error.status === 401 ? "GROUP_DELETE_UNAUTHENTICATED" : "KEYWORD_DELETE_UNAUTHORIZED", error.status, error.message, { requestId });
  return editorialGroupsFailure("GROUP_DELETE_FAILED", 503, "Excluir tudo da cor não pôde ser concluído agora. Nada foi confirmado; gere a prévia de novo.", { requestId, databaseCode: safeDatabaseCode(error) });
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ brandId: string }> }) {
  const requestId = crypto.randomUUID();
  try {
    const { brandId } = await params;
    if (!isTenantId(brandId)) return editorialGroupsFailure("BRAND_NOT_FOUND", 404, "Marca inválida.", { requestId });
    const input = RequestSchema.parse(await request.json());
    const profile = await requireCanonicalSessionProfile();
    const context = await requireMineradorLifecyclePermission(profile, brandId, "manage");
    const base = { client: profile.supabase, brandId: context.brandId, actorUserId: profile.userId, groupId: input.groupId, includePublished: input.includePublished };
    const result = input.mode === "preview"
      ? await previewGroupDeleteAllWithCore(base)
      : await applyGroupDeleteAllWithCore({ ...base, decisionHash: input.decisionHash ?? null, typed: input.typed ?? {} });
    if (!result.ok) {
      return NextResponse.json({ success: false, requestId, code: result.code, message: result.message, ...(result.preview ? { preview: result.preview, decisionHash: result.decisionHash } : {}), ...(result.missing ? { missing: result.missing } : {}) }, { status: GROUP_DELETE_ALL_REFUSAL_STATUS[result.code] });
    }
    return NextResponse.json({ success: true, requestId, ...result });
  } catch (error) {
    return failureFrom(error, requestId);
  }
}
