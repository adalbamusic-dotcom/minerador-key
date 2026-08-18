import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireCanonicalSessionProfile, authzErrorResponse, AuthzError } from "@/lib/server/authz";
import { assertEditorialPermission } from "@/lib/server/editorial-authorization";
import { ContentDocumentRepository, PublicationRepository } from "@/lib/server/editorial-repositories";
import { DocumentSaveInputSchema, DocumentUserStateInputSchema } from "@/lib/editorial/persistence-contracts";
import { OptimisticLockError, PersistenceUnavailableError } from "@/lib/server/editorial-db";
import { runGuardian } from "@/lib/redator/guardian";

export async function PATCH(request: NextRequest) {
  try { const profile = await requireCanonicalSessionProfile(); const input = DocumentSaveInputSchema.parse(await request.json()); await assertEditorialPermission(profile, input.brandId, "redator", "edit");
    if (input.document.status === "aprovado") { const report = runGuardian(input.document, input.contentHash); if (report.blockingCount > 0) throw new AuthzError(409, `Documento bloqueado pelo Guardião: ${report.blockingCount} achado(s) crítico(s).`); }
    if (input.document.id !== input.documentId) throw new AuthzError(400, "O identificador do documento não coincide com o payload enviado.");
    const repository = new ContentDocumentRepository(); const saved = await repository.save(input.documentId, input.expectedLockVersion, input.document, input.contentHash, profile.userId);
    const version = input.createVersion ? await repository.createVersion(input.documentId, input.document, input.contentHash, input.changeReason, profile.userId) : null;
    await new PublicationRepository().syncDocumentStatus(input.documentId, input.document.status, profile.userId);
    return NextResponse.json({ lockVersion: saved.lock_version, updatedAt: saved.updated_at, contentHash: saved.content_hash, version });
  } catch (error) { if (error instanceof z.ZodError) return NextResponse.json({ error: "Documento inválido.", details: error.issues }, { status: 400 });
    if (error instanceof OptimisticLockError) return NextResponse.json({ code: error.code, error: error.message }, { status: 409 }); if (error instanceof PersistenceUnavailableError) return NextResponse.json({ code: error.code, error: error.message }, { status: 503 });
    const mapped = authzErrorResponse(error); return NextResponse.json({ error: mapped.message }, { status: mapped.status }); }
}

export async function POST(request: NextRequest) {
  try { const profile = await requireCanonicalSessionProfile(); const input = DocumentUserStateInputSchema.parse(await request.json()); await assertEditorialPermission(profile, input.brandId, "redator", "view");
    await new ContentDocumentRepository().saveUserState(input.documentId, profile.userId, input); return NextResponse.json({ ok: true });
  } catch (error) { if (error instanceof z.ZodError) return NextResponse.json({ error: "Estado do editor inválido." }, { status: 400 }); if (error instanceof PersistenceUnavailableError) return NextResponse.json({ code: error.code, error: error.message }, { status: 503 });
    const mapped = authzErrorResponse(error); return NextResponse.json({ error: mapped.message }, { status: mapped.status }); }
}
