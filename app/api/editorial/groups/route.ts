import { NextRequest, NextResponse } from "next/server";
import { z, ZodError } from "zod";
import { isTenantId } from "@/lib/tenant-routing";
import { AuthzError, requireCanonicalSessionProfile } from "@/lib/server/authz";
import { requireTenantPermission } from "@/lib/server/tenant-context";
import { EDITORIAL_GROUP_COLORS, EDITORIAL_GROUP_STATUSES } from "@/lib/editorial/editorial-groups";
import { createEditorialGroup, ensureEditorialGroupForColor, listEditorialGroupSummaries } from "@/lib/editorial/editorial-groups-store";
import { manageEditorialGroup } from "@/lib/editorial/editorial-group-manage-store";
import { EDITORIAL_GROUP_MANAGE_REFUSAL_STATUS } from "@/lib/editorial/editorial-group-manage";
import {
  assertCanEnsureEditorialGroupColor,
  assertCanReadEditorialGroups,
  EDITORIAL_GROUP_REFUSAL_STATUS,
  editorialGroupsClient,
  editorialGroupsFailure,
  safeDatabaseCode,
} from "@/lib/server/editorial-groups";

/**
 * GRUPOS EDITORIAIS — LISTAR, CRIAR, RENOMEAR/RECOLORIR/ARQUIVAR (F1).
 *
 * SDD `docs/compartilhado/sdd-plano-declarado-e-grupos-2026-10-12.md` §6.1.
 *
 * - GET `?marcaId=`: grupos da marca com contagens + "Sem grupo". Lê quem
 *   vê qualquer área editorial da marca.
 * - POST `{ marcaId, name, color }`: grupo manual. Exige `minerador:edit`.
 * - POST `{ marcaId, color }` (sem nome, 2026-10-12 · cores fixas): GARANTE o
 *   grupo da cor — o ativo da cor (o mais antigo), senão reativa o arquivado,
 *   senão cria com o nome da cor. Exige edição no Minerador, no Arquiteto ou no
 *   Radar. Idempotente: a tela chama só ao mover/etiquetar, nunca ao filtrar.
 * - PATCH `{ marcaId, groupId, lockVersion, name?, color?, release? }`
 *   (2026-10-12 · "Gerenciar" a cor, `manageEditorialGroup`): nome opcional
 *   (`null`/vazio = o nome da cor); trocar só para uma cor LIVRE (ocupada =
 *   409 `GROUP_COLOR_TAKEN`, nunca funde); liberar a cor (`release` ou o antigo
 *   `status: "archived"`) só sem keywords, artigos, plano nem Silo (409
 *   `GROUP_NOT_EMPTY` com as contagens). Exige edição no Minerador, no
 *   Arquiteto ou no Radar — as três áreas mostram a etiqueta.
 *
 * Sem a M1 aplicada, responde `409 GROUPS_NOT_AVAILABLE` e a tela esconde o
 * seletor (o Minerador continua lendo como antes). Nenhuma chamada paga.
 */

export const dynamic = "force-dynamic";
export const revalidate = 0;

const CreateSchema = z.object({
  marcaId: z.string().uuid(),
  name: z.string().max(400).optional(),
  color: z.enum(EDITORIAL_GROUP_COLORS),
}).strict();

const UpdateSchema = z.object({
  marcaId: z.string().uuid(),
  groupId: z.string().uuid(),
  lockVersion: z.number().int().positive(),
  name: z.string().max(400).nullable().optional(),
  color: z.enum(EDITORIAL_GROUP_COLORS).optional(),
  release: z.boolean().optional(),
  /** Compatível com o contrato da F1: `archived` = liberar a cor. Reativar acontece ao mover algo para a cor. */
  status: z.enum(EDITORIAL_GROUP_STATUSES).optional(),
}).strict();

function failureFrom(error: unknown, requestId: string, stage: string) {
  if (error instanceof ZodError) return editorialGroupsFailure("INVALID_GROUP_REQUEST", 400, "O pedido de grupo é inválido.", { requestId, issues: error.issues.map(issue => ({ path: issue.path, code: issue.code })) });
  if (error instanceof AuthzError) return editorialGroupsFailure(error.status === 401 ? "GROUPS_UNAUTHENTICATED" : "GROUPS_AUTHORIZATION_FAILED", error.status, error.message, { requestId });
  return editorialGroupsFailure("GROUPS_FAILED", 503, "Os grupos não puderam ser lidos ou gravados agora.", { requestId, stage, databaseCode: safeDatabaseCode(error) });
}

export async function GET(request: NextRequest) {
  const requestId = crypto.randomUUID();
  try {
    const brandId = request.nextUrl.searchParams.get("marcaId") || "";
    if (!isTenantId(brandId)) return editorialGroupsFailure("BRAND_NOT_FOUND", 404, "Marca inválida.", { requestId });
    const profile = await requireCanonicalSessionProfile();
    await assertCanReadEditorialGroups(profile, brandId);
    const listing = await listEditorialGroupSummaries(editorialGroupsClient(), brandId);
    if (!listing.ok) return editorialGroupsFailure(listing.code, EDITORIAL_GROUP_REFUSAL_STATUS[listing.code], listing.message, { requestId });
    return NextResponse.json({ success: true, available: true, requestId, groups: listing.groups, ungroupedKeywordCount: listing.ungroupedKeywordCount });
  } catch (error) {
    return failureFrom(error, requestId, "list");
  }
}

export async function POST(request: NextRequest) {
  const requestId = crypto.randomUUID();
  try {
    const input = CreateSchema.parse(await request.json());
    const profile = await requireCanonicalSessionProfile();
    if (input.name === undefined) {
      const permitido = await assertCanEnsureEditorialGroupColor(profile, input.marcaId);
      const garantido = await ensureEditorialGroupForColor(editorialGroupsClient(), { brandId: permitido.brandId, actorUserId: permitido.actorUserId, color: input.color });
      if (!garantido.ok) return editorialGroupsFailure(garantido.code, EDITORIAL_GROUP_REFUSAL_STATUS[garantido.code], garantido.message, { requestId });
      return NextResponse.json({ success: true, requestId, group: garantido.group, outcome: garantido.outcome, eventRecorded: garantido.eventRecorded });
    }
    const context = await requireTenantPermission({ brandId: input.marcaId, actorUserId: profile.userId, module: "minerador", action: "edit", profile });
    const result = await createEditorialGroup(editorialGroupsClient(), { brandId: context.brandId, actorUserId: context.actorUserId, name: input.name, color: input.color });
    if (!result.ok) return editorialGroupsFailure(result.code, EDITORIAL_GROUP_REFUSAL_STATUS[result.code], result.message, { requestId });
    return NextResponse.json({ success: true, requestId, group: result.group, eventRecorded: result.eventRecorded }, { status: 201 });
  } catch (error) {
    return failureFrom(error, requestId, "create");
  }
}

export async function PATCH(request: NextRequest) {
  const requestId = crypto.randomUUID();
  try {
    const input = UpdateSchema.parse(await request.json());
    if (input.status === "active") return editorialGroupsFailure("GROUP_NOTHING_TO_CHANGE", 400, "Reativar uma cor acontece ao mover keywords ou artigos para ela.", { requestId });
    const profile = await requireCanonicalSessionProfile();
    const context = await assertCanEnsureEditorialGroupColor(profile, input.marcaId);
    const result = await manageEditorialGroup(editorialGroupsClient(), {
      brandId: context.brandId,
      actorUserId: context.actorUserId,
      groupId: input.groupId,
      lockVersion: input.lockVersion,
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.color !== undefined ? { color: input.color } : {}),
      ...(input.release || input.status === "archived" ? { release: true } : {}),
    });
    if (!result.ok) {
      const status = result.code === "GROUPS_NOT_AVAILABLE" ? EDITORIAL_GROUP_REFUSAL_STATUS.GROUPS_NOT_AVAILABLE : EDITORIAL_GROUP_MANAGE_REFUSAL_STATUS[result.code];
      return editorialGroupsFailure(result.code, status, result.message, { requestId });
    }
    return NextResponse.json({ success: true, requestId, action: result.action, group: result.group, summary: result.summary, eventRecorded: result.eventRecorded });
  } catch (error) {
    return failureFrom(error, requestId, "update");
  }
}
