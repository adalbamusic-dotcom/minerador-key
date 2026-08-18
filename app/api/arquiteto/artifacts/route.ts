import { NextResponse } from "next/server";
import { z } from "zod";
import {
  VersionedArticleDNASchema,
  VersionedSiloDNASchema,
  VersionedSiloPageSchema,
  type ArticleDNA,
  type SiloDNA,
  type SiloPage,
  type VersionEnvelope,
} from "@/lib/arquiteto/contracts";
import { appendArquitetoArtifact, listArquitetoArtifacts, pipelineArtifactErrorResponse, type ArquitetoArtifactType } from "@/lib/server/arquiteto-persistence";
import { resolvePipelineContext } from "@/lib/server/pipeline-runtime";

const BrandQuerySchema = z.object({ brandId: z.string().min(1) });
const RequestSchema = z.object({
  brandId: z.string().min(1),
  artifactType: z.enum(["article_dna", "silo_dna", "silo_page"]),
  action: z.enum(["create", "edit"]),
  status: z.string().trim().min(1).max(80).optional(),
  version: z.unknown(),
});

function parseVersion(type: ArquitetoArtifactType, value: unknown) {
  if (type === "article_dna") return VersionedArticleDNASchema.parse(value) as VersionEnvelope<ArticleDNA>;
  if (type === "silo_dna") return VersionedSiloDNASchema.parse(value) as VersionEnvelope<SiloDNA>;
  return VersionedSiloPageSchema.parse(value) as VersionEnvelope<SiloPage>;
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const query = BrandQuerySchema.parse({ brandId: url.searchParams.get("brandId") || "" });
    const context = await resolvePipelineContext({ brandId: query.brandId, module: "arquiteto", action: "view" });
    return NextResponse.json({ success: true, data: await listArquitetoArtifacts(context) });
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ success: false, error: "brandId é obrigatório e deve ser válido." }, { status: 400 });
    const mapped = pipelineArtifactErrorResponse(error);
    return NextResponse.json(mapped.body, { status: mapped.status });
  }
}

export async function POST(request: Request) {
  try {
    const parsed = RequestSchema.parse(await request.json());
    const context = await resolvePipelineContext({
      brandId: parsed.brandId,
      module: "arquiteto",
      action: parsed.action,
    });
    const version = parseVersion(parsed.artifactType, parsed.version);
    const persisted = await appendArquitetoArtifact(context, parsed.artifactType, version, parsed.status || "proposed");
    return NextResponse.json({ success: true, data: { persistence: persisted.status, version: persisted.version, source: persisted.source } });
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ success: false, error: "O artefato enviado não corresponde ao contrato do Arquiteto." }, { status: 400 });
    const mapped = pipelineArtifactErrorResponse(error);
    return NextResponse.json(mapped.body, { status: mapped.status });
  }
}
