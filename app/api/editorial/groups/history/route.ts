import { NextRequest, NextResponse } from "next/server";
import { isTenantId } from "@/lib/tenant-routing";
import { AuthzError, requireCanonicalSessionProfile } from "@/lib/server/authz";
import { GROUP_HISTORY_MAX_GROUPS, readEditorialGroupHistory } from "@/lib/editorial/group-history-store";
import {
  assertCanReadEditorialGroups,
  EDITORIAL_GROUP_REFUSAL_STATUS,
  editorialGroupsClient,
  editorialGroupsFailure,
  safeDatabaseCode,
} from "@/lib/server/editorial-groups";

/**
 * HISTÓRICO DO GRUPO (SDD 2026-10-12 §10.4) — só leitura.
 *
 * GET `?marcaId=&groupId=<uuid>[&groupId=…]` (até 10: os grupos ativos da cor
 * escolhida). Lê `editorial_group_events` e as linhas `operation_ledger` do
 * guarda de retrabalho desses grupos, desta marca. Autorização: quem vê
 * qualquer área editorial da marca (a mesma leitura da lista de grupos).
 * Chamada só quando o dono abre "Histórico do grupo" — nunca no carregamento
 * da área. Nenhuma escrita, nenhuma chamada paga.
 */

export const dynamic = "force-dynamic";
export const revalidate = 0;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(request: NextRequest) {
  const requestId = crypto.randomUUID();
  try {
    const brandId = request.nextUrl.searchParams.get("marcaId") || "";
    if (!isTenantId(brandId)) return editorialGroupsFailure("BRAND_NOT_FOUND", 404, "Marca inválida.", { requestId });
    const groupIds = request.nextUrl.searchParams.getAll("groupId").map(id => id.trim());
    if (!groupIds.length || groupIds.length > GROUP_HISTORY_MAX_GROUPS || groupIds.some(id => !UUID.test(id))) {
      return editorialGroupsFailure("INVALID_GROUP_HISTORY_REQUEST", 400, `Informe de 1 a ${GROUP_HISTORY_MAX_GROUPS} grupos (uuid).`, { requestId });
    }
    const profile = await requireCanonicalSessionProfile();
    await assertCanReadEditorialGroups(profile, brandId);
    const history = await readEditorialGroupHistory(editorialGroupsClient(), brandId, groupIds);
    if (!history.ok) return editorialGroupsFailure(history.code, EDITORIAL_GROUP_REFUSAL_STATUS[history.code], history.message, { requestId });
    return NextResponse.json({ success: true, requestId, viewerUserId: profile.userId, groupIds: history.groupIds, entries: history.entries, ledgerRead: history.ledgerRead });
  } catch (error) {
    if (error instanceof AuthzError) return editorialGroupsFailure(error.status === 401 ? "GROUPS_UNAUTHENTICATED" : "GROUPS_AUTHORIZATION_FAILED", error.status, error.message, { requestId });
    return editorialGroupsFailure("GROUP_HISTORY_FAILED", 503, "O histórico do grupo não pôde ser lido agora.", { requestId, databaseCode: safeDatabaseCode(error) });
  }
}
