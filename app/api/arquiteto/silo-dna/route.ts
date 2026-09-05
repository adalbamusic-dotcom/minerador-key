import { NextResponse } from "next/server";
import { z } from "zod";
import { SiloDNASchema, VersionedArticleDNASchema } from "@/lib/arquiteto/contracts";
import { deterministicSiloDnaPayload } from "@/lib/arquiteto/adapters";
import { normalizeSiloDnaProviderPayload } from "@/lib/arquiteto/silo-dna-provider";
import { createStatusEvent, createVersionEnvelope } from "@/lib/arquiteto/versioning";
import { appendArquitetoArtifact, pipelineArtifactErrorResponse } from "@/lib/server/arquiteto-persistence";
import { resolvePipelineContext } from "@/lib/server/pipeline-runtime";
import { resolveDeepSeekCanonicalConfig } from "@/lib/server/deepseek-canonical";
import { generateStructuredAI, StructuredAIError } from "@/lib/server/structured-ai";

const SiloInputSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  articleVersions: z.array(VersionedArticleDNASchema).min(1),
});
const RequestSchema = z.object({
  silos: z.array(SiloInputSchema).min(1).max(12),
  brand: z.object({ id: z.string().min(1), name: z.string(), niche: z.string().nullable().optional() }),
});
const ResponseSchema = z.object({ silos: z.array(z.record(z.string(), z.unknown())).min(1) });

const SYSTEM_PROMPT = `Voce cria regras de direcao para silos editoriais.
O DNA do silo orienta arquitetura, ordem, links, limites, lacunas e o futuro Escritor.
Use apenas IDs recebidos. Nao altere dados e nao aprove a arquitetura.
Preserve artigos publicados e destaque conflitos ou decisoes que dependem de uma pessoa.
As referencias versionadas serao anexadas pelo servidor. Retorne {"silos": [...]} em JSON valido.`;

function buildSiloDnaUserPrompt(silos: z.infer<typeof RequestSchema>["silos"]): string {
  const compact = silos.map(silo => ({
    siloId: silo.id,
    siloName: silo.name,
    articles: silo.articleVersions.map(version => ({
      articleId: version.payload.articleId,
      title: version.payload.promise,
      hierarchy: version.payload.hierarchy,
      intent: version.payload.mainIntent,
      principalKeywordId: version.payload.principalKeywordId,
    })),
  }));
  return `Gere um SiloDNA por silo:\n${JSON.stringify(compact)}`;
}

export async function POST(req: Request) {
  try {
    const parsed = RequestSchema.safeParse(await req.json());
    if (!parsed.success) return NextResponse.json({ success: false, error: "Silos invalidos.", issues: parsed.error.flatten() }, { status: 400 });
    const context = await resolvePipelineContext({ brandId: parsed.data.brand.id, module: "arquiteto", action: "create" });
    const provider = await resolveDeepSeekCanonicalConfig({ actorUserId: context.actorUserId, brandId: context.brandId, client: context.supabase });
    const result = await generateStructuredAI({
      provider,
      system: SYSTEM_PROMPT,
      user: buildSiloDnaUserPrompt(parsed.data.silos),
      schema: ResponseSchema,
    });
    const versions = await Promise.all(result.silos.map(async (raw, index) => {
      const input = parsed.data.silos[index];
      if (!input) throw new StructuredAIError("A IA retornou mais silos que entradas.", 422);
      const articleReferences = input.articleVersions.map(version => ({ articleId: version.payload.articleId,
        articleDnaVersionId: version.versionId, articleDnaContentHash: version.contentHash, role: version.payload.hierarchy === "Pilar" ? "Pilar" as const : "Suporte" as const }));
      const pillar = articleReferences.find(reference => reference.role === "Pilar")?.articleId ?? null;
      const supportArticleIds = articleReferences.filter(reference => reference.articleId !== pillar).map(reference => reference.articleId);
      const provider = normalizeSiloDnaProviderPayload(raw);
      if (provider.warnings.length) console.warn("[silo-dna] normalizador aplicou avisos", { siloId: input.id, warnings: provider.warnings });
      // Base deterministica garante que todos os campos obrigatórios existam
      // mesmo se a IA retornar uma resposta incompleta ou vazia.
      const base = deterministicSiloDnaPayload(input.id, input.name, input.articleVersions, { brandId: parsed.data.brand.id });
      const basePendingDecisions = provider.payload.humanPendingDecisions ?? base.humanPendingDecisions;
      const warningsAsPending = provider.warnings.map(warning => `Aviso do servidor: ${warning}`);
      const normalized = SiloDNASchema.parse({ ...base, ...provider.payload, schemaVersion: 1, siloId: input.id, brandId: parsed.data.brand.id, name: base.name, centralEntity: base.centralEntity, centralEntitySource: base.centralEntitySource, ...(base.centralKeywordDnaRef ? { centralKeywordDnaRef: base.centralKeywordDnaRef } : {}), articleReferences,
        pillarArticleId: pillar, supportArticleIds, humanPendingDecisions: [...warningsAsPending, ...basePendingDecisions] });
      const version = await createVersionEnvelope({ entityId: input.id, versionNumber: 1, previousVersionId: null, origin: "ai",
        changeReason: "Proposta inicial de SiloDNA.", createdBy: context.actorUserId, payload: normalized });
      const persisted = await appendArquitetoArtifact(context, "silo_dna", version, "proposed");
      return persisted.version;
    }));
    const events = versions.map(version => createStatusEvent(version.versionId, "proposed", context.actorUserId, "Aguardando revisao humana."));
    return NextResponse.json({ success: true, data: { versions, events } });
  } catch (error) {
    if (error instanceof StructuredAIError) return NextResponse.json({ success: false, error: error.message, code: error.code, issues: error.issues }, { status: error.status });
    const mapped = pipelineArtifactErrorResponse(error);
    return NextResponse.json(mapped.body, { status: mapped.status });
  }
}
