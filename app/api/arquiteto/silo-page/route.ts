import { NextResponse } from "next/server";
import { z } from "zod";
import { SiloPageSchema, VersionedSiloDNASchema } from "@/lib/arquiteto/contracts";
import { deterministicSiloPagePayload } from "@/lib/arquiteto/adapters";
import { normalizeSiloPageProviderPayload } from "@/lib/arquiteto/silo-page-provider";
import { createStatusEvent, createVersionEnvelope, toVersionReference } from "@/lib/arquiteto/versioning";
import { appendArquitetoArtifact, pipelineArtifactErrorResponse } from "@/lib/server/arquiteto-persistence";
import { resolvePipelineContext } from "@/lib/server/pipeline-runtime";
import { resolveDeepSeekCanonicalConfig } from "@/lib/server/deepseek-canonical";
import { generateStructuredAI, StructuredAIError } from "@/lib/server/structured-ai";

const RequestSchema = z.object({
  siloId: z.string().min(1),
  siloName: z.string().min(1),
  siloDnaVersion: VersionedSiloDNASchema,
  brand: z.object({ id: z.string().min(1), name: z.string(), niche: z.string().nullable().optional() }),
});
const ResponseSchema = z.object({ siloPage: z.record(z.string(), z.unknown()) });

const SYSTEM_PROMPT = `Voce cria o conteudo editorial de uma Página de Silo para um site.
A Página do Silo nao e um artigo — e a pagina hub que organiza e linka os artigos do silo.
Gere H1, SEO title, meta description, intro, secoes com links para artigos, CTA e briefing visual.
Use IDs exatos recebidos. Nao altere dados de artigos.
Toda decisao incerta vai em humanPendingDecisions. As referencias versionadas serao anexadas pelo servidor.
Retorne {"siloPage": {...}} em JSON valido, sem Markdown.`;

function buildSiloPageUserPrompt(input: z.infer<typeof RequestSchema>): string {
  const compact = {
    siloId: input.siloId,
    siloName: input.siloName,
    brand: input.brand.name,
    siloDna: {
      centralEntity: input.siloDnaVersion.payload.centralEntity,
      objective: input.siloDnaVersion.payload.objective,
      audience: input.siloDnaVersion.payload.audience,
      dominantIntent: input.siloDnaVersion.payload.dominantIntent,
      pillarArticleId: input.siloDnaVersion.payload.pillarArticleId,
      supportArticleIds: input.siloDnaVersion.payload.supportArticleIds,
      narrativeOrder: input.siloDnaVersion.payload.narrativeOrder,
      includedTopics: input.siloDnaVersion.payload.includedTopics,
    },
  };
  return `Gere o conteudo da Página do Silo:\n${JSON.stringify(compact)}`;
}

export async function POST(req: Request) {
  try {
    const parsed = RequestSchema.safeParse(await req.json());
    if (!parsed.success) return NextResponse.json({ success: false, error: "Dados invalidos.", issues: parsed.error.flatten() }, { status: 400 });
    const context = await resolvePipelineContext({ brandId: parsed.data.brand.id, module: "arquiteto", action: "create" });
    const deepSeekProvider = await resolveDeepSeekCanonicalConfig({ actorUserId: context.actorUserId, brandId: context.brandId, client: context.supabase });

    const { siloId, siloName, siloDnaVersion, brand } = parsed.data;
    const slug = siloName.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

    const result = await generateStructuredAI({
      provider: deepSeekProvider,
      system: SYSTEM_PROMPT,
      user: buildSiloPageUserPrompt(parsed.data),
      schema: ResponseSchema,
    });

    const provider = normalizeSiloPageProviderPayload(result.siloPage);
    const base = deterministicSiloPagePayload(siloDnaVersion, brand.id, slug);
    const siloDnaRef = toVersionReference(siloDnaVersion);

    const normalized = SiloPageSchema.parse({
      ...base,
      ...provider.payload,
      schemaVersion: 1,
      siloPageId: `silo-page:${siloId}`,
      brandId: brand.id,
      siloDnaRef,
      siloId,
      publicationStatus: base.publicationStatus,
      publishedUrl: base.publishedUrl,
      publicationVerification: base.publicationVerification,
      pillarArticleId: base.pillarArticleId,
      supportArticleIds: provider.payload.supportArticleIds ?? base.supportArticleIds,
      alerts: [...base.alerts, ...provider.warnings],
      humanPendingDecisions: provider.payload.humanPendingDecisions ?? base.humanPendingDecisions,
    });

    const entityId = `silo-page:${siloId}`;
    const version = await createVersionEnvelope({
      entityId, versionNumber: 1, previousVersionId: null,
      origin: "ai", changeReason: "Proposta inicial de Página do Silo.",
      createdBy: context.actorUserId, payload: normalized,
    });
    const persisted = await appendArquitetoArtifact(context, "silo_page", version, "proposed");
    const event = createStatusEvent(persisted.version.versionId, "proposed", context.actorUserId, "Aguardando revisao humana.");

    return NextResponse.json({ success: true, data: { versions: [persisted.version], events: [event] } });
  } catch (error) {
    if (error instanceof StructuredAIError) return NextResponse.json({ success: false, error: error.message, code: error.code, issues: error.issues }, { status: error.status });
    const mapped = pipelineArtifactErrorResponse(error);
    return NextResponse.json(mapped.body, { status: mapped.status });
  }
}
