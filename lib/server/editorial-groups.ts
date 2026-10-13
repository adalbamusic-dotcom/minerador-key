import "server-only";
import { NextResponse } from "next/server";
import { AuthzError, type CanonicalSessionProfile } from "@/lib/server/authz";
import { getOperationalClient } from "@/lib/server/editorial-db";
import { resolveTenantContext, type TenantModule } from "@/lib/server/tenant-context";
import { canEnsureEditorialGroupColor, GROUPS_NOT_AVAILABLE, type EditorialGroupRefusalCode } from "@/lib/editorial/editorial-groups";

/**
 * GRUPOS EDITORIAIS NO SERVIDOR (F1).
 *
 * As rotas autorizam e depois usam o cliente OPERACIONAL para as tabelas de
 * grupo (só o servidor escreve nelas, M1 §7.1); a keyword é etiquetada pelo
 * cliente do usuário, sob a RLS de sempre (`assignKeywordGroupWithCore`).
 */

export const editorialGroupsClient = () => getOperationalClient();

/** Quem vê a marca em qualquer área do pipeline pode LER os grupos dela. */
const LEITORES: readonly TenantModule[] = ["minerador", "arquiteto", "radar", "redator", "publicacoes"];

export async function assertCanReadEditorialGroups(profile: CanonicalSessionProfile, brandId: string) {
  const context = await resolveTenantContext({ brandId, profile });
  if (!context.isGlobalAdmin && !LEITORES.some(module => context.permissions.includes(`${module}:view`))) {
    throw new AuthzError(403, "BRAND_ACCESS_DENIED: sem acesso às áreas editoriais desta marca.");
  }
  return context;
}

/**
 * F2 · Etiquetar ou mover ARTIGO de grupo: quem edita no Arquiteto ou no
 * Radar (as duas planilhas mostram o grupo do artigo e têm o rodapé).
 */
const ETIQUETADORES_DE_ARTIGO: readonly TenantModule[] = ["arquiteto", "radar"];

export async function assertCanTagEditorialArticles(profile: CanonicalSessionProfile, brandId: string) {
  const context = await resolveTenantContext({ brandId, profile });
  if (!context.isGlobalAdmin && !ETIQUETADORES_DE_ARTIGO.some(module => context.permissions.includes(`${module}:edit`))) {
    throw new AuthzError(403, "BRAND_ACCESS_DENIED: etiquetar artigo exige edição no Arquiteto ou no Radar desta marca.");
  }
  return context;
}

/**
 * 2026-10-12 · cores fixas: garantir o grupo de uma COR (para mover ou
 * etiquetar por cor) é de quem edita em qualquer das três planilhas que movem
 * coisas de grupo — Minerador (keywords), Arquiteto ou Radar (artigos).
 */
export async function assertCanEnsureEditorialGroupColor(profile: CanonicalSessionProfile, brandId: string) {
  const context = await resolveTenantContext({ brandId, profile });
  if (!canEnsureEditorialGroupColor(context)) {
    throw new AuthzError(403, "BRAND_ACCESS_DENIED: mover para uma cor exige edição no Minerador, no Arquiteto ou no Radar desta marca.");
  }
  return context;
}

export const EDITORIAL_GROUP_REFUSAL_STATUS: Record<EditorialGroupRefusalCode | typeof GROUPS_NOT_AVAILABLE, number> = {
  GROUP_NAME_INVALID: 400,
  GROUP_COLOR_INVALID: 400,
  GROUP_NAME_TAKEN: 409,
  GROUP_NOT_FOUND: 404,
  GROUP_ARCHIVED: 409,
  GROUP_STALE: 409,
  GROUP_NOTHING_TO_CHANGE: 400,
  GROUPS_NOT_AVAILABLE: 409,
};

export function editorialGroupsFailure(code: string, status: number, message: string, diagnostic: Record<string, unknown> = {}) {
  return NextResponse.json({ success: false, code, message, diagnostic }, { status });
}

export function safeDatabaseCode(error: unknown) {
  const value = error && typeof error === "object" ? error as { code?: unknown } : {};
  return typeof value.code === "string" && /^[A-Za-z0-9_ -]{1,40}$/.test(value.code) ? value.code : "database_error";
}
