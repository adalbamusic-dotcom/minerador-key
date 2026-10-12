import { NextRequest, NextResponse } from "next/server";
import { z, ZodError } from "zod";
import { isTenantId } from "@/lib/tenant-routing";
import { AuthzError, requireCanonicalSessionProfile } from "@/lib/server/authz";
import { requireTenantPermission } from "@/lib/server/tenant-context";
import { EDITORIAL_GROUP_COLORS, EDITORIAL_GROUP_STATUSES } from "@/lib/editorial/editorial-groups";
import { createEditorialGroup, listEditorialGroupSummaries, updateEditorialGroup } from "@/lib/editorial/editorial-groups-store";
import {
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
 * - PATCH `{ marcaId, groupId, lockVersion, name?, color?, status? }`.
 *
 * Sem a M1 aplicada, responde `409 GROUPS_NOT_AVAILABLE` e a tela esconde o
 * seletor (o Minerador continua lendo como antes). Nenhuma chamada paga.
 */

export const dynamic = "force-dynamic";
export const revalidate = 0;

const CreateSchema = z.object({
  marcaId: z.string().uuid(),
  name: z.string().max(400),
  color: z.enum(EDITORIAL_GROUP_COLORS),
}).strict();

const UpdateSchema = z.object({
  marcaId: z.string().uuid(),
  groupId: z.string().uuid(),
  lockVersion: z.number().int().positive(),
  name: z.string().max(400).optional(),
  color: z.enum(EDITORIAL_GROUP_COLORS).optional(),
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
    const profile = await requireCanonicalSessionProfile();
    const context = await requireTenantPermission({ brandId: input.marcaId, actorUserId: profile.userId, module: "minerador", action: "edit", profile });
    const result = await updateEditorialGroup(editorialGroupsClient(), {
      brandId: context.brandId,
      actorUserId: context.actorUserId,
      groupId: input.groupId,
      lockVersion: input.lockVersion,
      name: input.name,
      color: input.color,
      status: input.status,
    });
    if (!result.ok) return editorialGroupsFailure(result.code, EDITORIAL_GROUP_REFUSAL_STATUS[result.code], result.message, { requestId });
    return NextResponse.json({ success: true, requestId, group: result.group, eventRecorded: result.eventRecorded });
  } catch (error) {
    return failureFrom(error, requestId, "update");
  }
}
