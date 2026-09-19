import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireCanonicalSessionProfile, authzErrorResponse } from "@/lib/server/authz";
import { assertEditorialPermission } from "@/lib/server/editorial-authorization";
import { finalizeWriterDeliverable, listWriterDeliverables, listWriterMedia, registerWriterMediaBrief, reopenWriterDeliverable, saveWriterDeliverable, writerSourceHash, WriterDeliverableError } from "@/lib/server/writer-deliverables";
import { WriterDeliverablePayloadSchema, WriterMediaBriefSchema } from "@/lib/redator/multiformat-contracts";
import { OptimisticLockError, PersistenceUnavailableError } from "@/lib/server/editorial-db";

const SaveSchema = z.object({ brandId: z.string().uuid(), documentId: z.string().min(1),
  payload: WriterDeliverablePayloadSchema, expectedLockVersion: z.number().int().positive().nullable() }).strict();

/*
 * ===== CORTE 6A.1 · UMA ROTA DISCRIMINADA, NÃO UMA POR TIPO =====
 *
 * `kind` é campo, não caminho. Roteiro e carrossel chegam na mesma autoridade
 * porque é a mesma tabela, a mesma RPC e a mesma regra — uma rota por tipo
 * criaria duas traduções da mesma recusa, e elas divergiriam no primeiro ajuste.
 *
 * `action` é união discriminada: finalizar pede lock, reabrir não. Um objeto
 * com campos opcionais aceitaria `{action:"reopen", expectedLockVersion: 3}` e
 * ignoraria em silêncio o que quem chamou achou que estava pedindo.
 */
const KindSchema = z.enum(["video_script", "carousel"]);
const AlvoSchema = { brandId: z.string().uuid(), documentId: z.string().min(1), kind: KindSchema };

const ActionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("finalize"), ...AlvoSchema,
    expectedLockVersion: z.number().int().positive().nullable() }).strict(),
  z.object({ action: z.literal("reopen"), ...AlvoSchema }).strict(),
]);

function failure(error: unknown) {
  if (error instanceof z.ZodError) return NextResponse.json({ code: "invalid_input", issues: error.issues }, { status: 400 });
  if (error instanceof WriterDeliverableError) return NextResponse.json({ code: error.code, error: error.message }, { status: error.status });
  if (error instanceof OptimisticLockError) return NextResponse.json({ code: error.code, error: error.message }, { status: 409 });
  if (error instanceof PersistenceUnavailableError) return NextResponse.json({ code: error.code, error: error.message }, { status: 503 });
  const mapped = authzErrorResponse(error);
  return NextResponse.json({ error: mapped.message }, { status: mapped.status });
}

export async function GET(request: NextRequest) {
  try {
    const profile = await requireCanonicalSessionProfile();
    const brandId = z.string().uuid().parse(request.nextUrl.searchParams.get("brandId"));
    const documentId = z.string().min(1).parse(request.nextUrl.searchParams.get("documentId"));
    await assertEditorialPermission(profile, brandId, "redator", "view");
    const [deliverables, media, sourceDocumentHash] = await Promise.all([listWriterDeliverables(brandId, documentId), listWriterMedia(brandId, documentId), writerSourceHash(brandId, documentId)]);
    return NextResponse.json({ deliverables, media, sourceDocumentHash });
  } catch (error) { return failure(error); }
}

export async function PUT(request: NextRequest) {
  try {
    const profile = await requireCanonicalSessionProfile();
    const input = SaveSchema.parse(await request.json());
    await assertEditorialPermission(profile, input.brandId, "redator", "edit");
    const result = await saveWriterDeliverable({ ...input, actorId: profile.userId });
    return NextResponse.json(result);
  } catch (error) { return failure(error); }
}

/*
 * Finalizar e reabrir. O ator NUNCA vem do corpo da requisição: ele é derivado
 * de `requireCanonicalSessionProfile()`, como no save e no media-anchor. Um
 * `actorId` aceito do navegador seria autoria escolhida por quem opera.
 */
export async function PATCH(request: NextRequest) {
  try {
    const profile = await requireCanonicalSessionProfile();
    const input = ActionSchema.parse(await request.json());
    await assertEditorialPermission(profile, input.brandId, "redator", "edit");
    const result = input.action === "finalize"
      ? await finalizeWriterDeliverable({ brandId: input.brandId, documentId: input.documentId,
          kind: input.kind, expectedLockVersion: input.expectedLockVersion, actorId: profile.userId })
      : await reopenWriterDeliverable({ brandId: input.brandId, documentId: input.documentId,
          kind: input.kind, actorId: profile.userId });
    return NextResponse.json(result);
  } catch (error) { return failure(error); }
}

export async function POST(request: NextRequest) {
  try {
    const profile = await requireCanonicalSessionProfile();
    const input = WriterMediaBriefSchema.parse(await request.json());
    await assertEditorialPermission(profile, input.brandId, "redator", "edit");
    const result = await registerWriterMediaBrief(input, profile.userId);
    return NextResponse.json(result);
  } catch (error) { return failure(error); }
}
