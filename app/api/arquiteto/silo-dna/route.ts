import { NextResponse } from "next/server";
import { z } from "zod";
import { SiloDNASchema, VersionedArticleDNASchema } from "@/lib/arquiteto/contracts";
import { createStatusEvent, createVersionEnvelope } from "@/lib/arquiteto/versioning";
import { requireSessionProfile, authzErrorResponse } from "@/lib/server/authz";
import { generateStructuredAI, StructuredAIError } from "@/lib/server/structured-ai";

const SiloInputSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  articleVersions: z.array(VersionedArticleDNASchema).min(1),
});
const RequestSchema = z.object({
  silos: z.array(SiloInputSchema).min(1).max(12),
  brand: z.object({ id: z.string(), name: z.string(), niche: z.string().nullable().optional() }).optional(),
});
const ResponseSchema = z.object({ silos: z.array(z.record(z.string(), z.unknown())).min(1) });

const SYSTEM_PROMPT = `Voce cria regras de direcao para silos editoriais.
O DNA do silo nao e texto promocional: deve orientar arquitetura, ordem, links, limites, lacunas e o futuro Escritor.
Use apenas IDs recebidos. Nao altere dados e nao aprove a arquitetura.
Preserve artigos publicados e destaque conflitos ou decisoes que dependem de uma pessoa.
As referencias versionadas serao anexadas pelo servidor. Retorne {"silos": [...]} em JSON valido.`;

export async function POST(req: Request) {
  try {
    const profile = await requireSessionProfile();
    const parsed = RequestSchema.safeParse(await req.json());
    if (!parsed.success) return NextResponse.json({ success: false, error: "Silos invalidos.", issues: parsed.error.flatten() }, { status: 400 });
    const result = await generateStructuredAI({
      system: SYSTEM_PROMPT,
      user: `Gere um SiloDNA por silo:\n${JSON.stringify(parsed.data)}`,
      schema: ResponseSchema,
    });
    const versions = await Promise.all(result.silos.map(async (raw, index) => {
      const input = parsed.data.silos[index];
      if (!input) throw new StructuredAIError("A IA retornou mais silos que entradas.", 422);
      const articleReferences = input.articleVersions.map(version => ({ articleId: version.payload.articleId,
        articleDnaVersionId: version.versionId, articleDnaContentHash: version.contentHash, role: version.payload.hierarchy === "Pilar" ? "Pilar" as const : "Suporte" as const }));
      const pillar = articleReferences.find(reference => reference.role === "Pilar")?.articleId ?? null;
      const normalized = SiloDNASchema.parse({ ...raw, siloId: input.id, articleReferences,
        pillarArticleId: pillar, supportArticleIds: articleReferences.filter(reference => reference.articleId !== pillar).map(reference => reference.articleId) });
      return createVersionEnvelope({ entityId: input.id, versionNumber: 1, previousVersionId: null, origin: "ai",
        changeReason: "Proposta inicial de SiloDNA.", createdBy: profile.userId, payload: normalized });
    }));
    const events = versions.map(version => createStatusEvent(version.versionId, "proposed", profile.userId, "Aguardando revisao humana."));
    return NextResponse.json({ success: true, data: { versions, events } });
  } catch (error) {
    if (error instanceof StructuredAIError) return NextResponse.json({ success: false, error: error.message, issues: error.issues }, { status: error.status });
    const mapped = authzErrorResponse(error);
    return NextResponse.json({ success: false, error: mapped.message }, { status: mapped.status });
  }
}
