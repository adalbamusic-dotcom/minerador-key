import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireSessionProfile, authzErrorResponse, AuthzError } from "@/lib/server/authz";
import { assertEditorialPermission } from "@/lib/server/editorial-authorization";
import { OptimisticLockError, PersistenceUnavailableError } from "@/lib/server/editorial-db";
import { PublicationProtectionError, PublicationRepository } from "@/lib/server/editorial-repositories";
import { PublicationActionRequestSchema } from "@/lib/publicacoes/contracts";
import { applyPublicationAction, PublicationDomainError } from "@/lib/publicacoes/domain";

export async function POST(request: NextRequest) {
  try {
    const profile = await requireSessionProfile();
    const input = PublicationActionRequestSchema.parse(await request.json());
    await assertEditorialPermission(profile, input.brandId, "publicacoes", input.action === "publish" ? "publish" : input.action === "record_export" ? "export" : "edit");
    const repository = new PublicationRepository();
    const current = await repository.find(input.brandId, input.publicationId);
    if (!current) throw new AuthzError(404, "Publicação não encontrada para a marca selecionada.");
    const next = applyPublicationAction(current.publication, input, profile.userId);
    const saved = await repository.updateOperational(input.brandId, input.publicationId, input.expectedLockVersion, next, profile.userId);
    if (!saved) throw new AuthzError(404, "Publicação não encontrada para a marca selecionada.");
    return NextResponse.json({ ok: true, publication: saved });
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ error: "Ação de Publicações inválida.", details: error.issues }, { status: 400 });
    if (error instanceof PublicationDomainError) return NextResponse.json({ error: error.message }, { status: 409 });
    if (error instanceof PublicationProtectionError) return NextResponse.json({ error: error.message }, { status: 409 });
    if (error instanceof OptimisticLockError) return NextResponse.json({ code: error.code, error: error.message }, { status: 409 });
    if (error instanceof PersistenceUnavailableError) return NextResponse.json({ code: error.code, error: error.message }, { status: 503 });
    const mapped = authzErrorResponse(error); return NextResponse.json({ error: mapped.message }, { status: mapped.status });
  }
}
