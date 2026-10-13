import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireCanonicalSessionProfile, authzErrorResponse } from "@/lib/server/authz";
import { assertEditorialPermission } from "@/lib/server/editorial-authorization";
import { ArtifactRepository } from "@/lib/server/editorial-repositories";
import { PersistenceUnavailableError } from "@/lib/server/editorial-db";

/**
 * O HISTÓRICO DE UM ARTEFATO, SOB DEMANDA (SDD
 * `docs/compartilhado/sdd-acelerar-fluxo-do-plano-2026-10-13.md`, item 6).
 *
 * `GET /api/editorial/workspace?detail=light` traz de cada ArticleDNA/SiloDNA
 * só a vigente e a última aprovada (mais as referenciadas). Quem precisa do
 * histórico inteiro de UM artefato pede aqui: todas as versões dele e os
 * eventos, pela mesma leitura (`ArtifactRepository.listScoped`). Só leitura;
 * mesma permissão da mesa (`marca:view`).
 */

export const dynamic = "force-dynamic";
export const revalidate = 0;

const QuerySchema = z.object({ marcaId: z.string().uuid(), entityId: z.string().trim().min(1).max(400) });

export async function GET(request: NextRequest) {
  const requestId = crypto.randomUUID();
  try {
    const parsed = QuerySchema.safeParse({ marcaId: request.nextUrl.searchParams.get("marcaId"), entityId: request.nextUrl.searchParams.get("entityId") });
    if (!parsed.success) return NextResponse.json({ requestId, code: "invalid_versions_query", error: "Informe a marca (marcaId) e o artefato (entityId)." }, { status: 400 });
    const profile = await requireCanonicalSessionProfile();
    await assertEditorialPermission(profile, parsed.data.marcaId, "marca", "view");
    const lido = await new ArtifactRepository().listScoped(parsed.data.marcaId, [parsed.data.entityId]);
    return NextResponse.json({
      requestId,
      data: {
        entityId: parsed.data.entityId,
        articleVersions: lido.articles.sort((a, b) => a.versionNumber - b.versionNumber),
        siloVersions: lido.silos.sort((a, b) => a.versionNumber - b.versionNumber),
        versionEvents: lido.events,
        incompatible: lido.incompatible,
      },
    });
  } catch (error) {
    if (error instanceof PersistenceUnavailableError) return NextResponse.json({ requestId, code: error.code, error: error.message }, { status: 503 });
    const mapped = authzErrorResponse(error);
    return NextResponse.json({ requestId, error: mapped.message }, { status: mapped.status });
  }
}
