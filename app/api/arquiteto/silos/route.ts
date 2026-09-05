import { NextResponse } from "next/server";
import { z } from "zod";
import { manualSiloDnaDraftPayload, manualSiloPageDraftPayload } from "@/lib/arquiteto/adapters";
import type { SiloDNA, VersionEnvelope } from "@/lib/arquiteto/contracts";
import { assertManualSiloPageSlugAvailable, normalizeManualSiloPageSlug } from "@/lib/arquiteto/manual-silo";
import { createVersionEnvelope } from "@/lib/arquiteto/versioning";
import { listArquitetoArtifacts, persistSiloPairAtomic, pipelineArtifactErrorResponse } from "@/lib/server/arquiteto-persistence";
import { resolvePipelineContext, PipelineRuntimeError } from "@/lib/server/pipeline-runtime";

const RequestSchema = z.object({
  brandId: z.string().uuid(),
  name: z.string().trim().min(1).max(160),
  slug: z.string().trim().min(1).max(180),
}).strict();

class SiloPairCreationError extends Error {
  constructor(public readonly code: "SILO_SLUG_CONFLICT" | "SILO_PAIR_INCOMPLETE" | "SILO_CATALOG_UNCONFIRMED", message: string) {
    super(message);
    this.name = "SiloPairCreationError";
  }
}

function catalogEntries(value: unknown): Array<Record<string, unknown>> {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is Record<string, unknown> => Boolean(item && typeof item === "object" && !Array.isArray(item)));
}

function catalogSlug(value: Record<string, unknown>) {
  return typeof value.slug === "string" ? value.slug : typeof value.path === "string" ? value.path : null;
}

export async function POST(request: Request) {
  try {
    const parsed = RequestSchema.parse(await request.json());
    const normalizedSlug = normalizeManualSiloPageSlug(parsed.slug);
    const context = await resolvePipelineContext({ brandId: parsed.brandId, module: "arquiteto", action: "create" });

    const existingCatalogResult = await context.supabase
      .from("marcas")
      .select("silos_existentes")
      .eq("id", context.brandId)
      .maybeSingle();
    if (existingCatalogResult.error) throw existingCatalogResult.error;
    const catalog = catalogEntries(existingCatalogResult.data?.silos_existentes);
    const existingArtifacts = await listArquitetoArtifacts(context);
    const knownSlugs = [
      ...catalog.map(catalogSlug).filter((value): value is string => Boolean(value)),
      ...existingArtifacts.siloPages.map(page => page.payload.slug),
    ];
    try {
      assertManualSiloPageSlugAvailable(normalizedSlug, knownSlugs);
    } catch (error) {
      throw new SiloPairCreationError("SILO_SLUG_CONFLICT", error instanceof Error ? error.message : "Este slug já está registrado para a marca ativa.");
    }

    const listResult = await context.supabase
      .from("minerador_keyword_lists")
      .insert({ nome: parsed.name, marca_id: context.brandId })
      .select("id, nome")
      .single();
    if (listResult.error || !listResult.data?.id) throw listResult.error || new PipelineRuntimeError("QUERY_FAILURE", "O silo não foi confirmado pelo banco.", 503);
    const siloId = String(listResult.data.id);

    const siloDraft = await createVersionEnvelope({
      entityId: siloId,
      versionNumber: 1,
      origin: "human",
      changeReason: "Criação manual do silo em formação.",
      createdBy: context.actorUserId,
      payload: manualSiloDnaDraftPayload(siloId, parsed.name, context.brandId),
    });
    const pageDraft = await createVersionEnvelope({
      entityId: `silo-page:${siloId}`,
      versionNumber: 1,
      origin: "human",
      changeReason: "Criação manual da página pareada em formação.",
      createdBy: context.actorUserId,
      payload: manualSiloPageDraftPayload(siloDraft as VersionEnvelope<SiloDNA>, context.brandId, normalizedSlug.slice(1)),
    });
    const pairPersisted = await persistSiloPairAtomic(context, siloDraft, pageDraft, { siloDna: "draft", siloPage: "draft" });

    const nextCatalog = [...catalog, { id: siloId, nome: parsed.name, slug: normalizedSlug }];
    const catalogUpdate = await context.supabase
      .from("marcas")
      .update({ silos_existentes: nextCatalog })
      .eq("id", context.brandId)
      .select("id, silos_existentes")
      .maybeSingle();
    if (catalogUpdate.error || !catalogUpdate.data) {
      throw new SiloPairCreationError("SILO_CATALOG_UNCONFIRMED", "SiloDNA e SiloPage foram gravados, mas o catálogo da marca não confirmou o novo silo.");
    }

    const readback = await listArquitetoArtifacts(context);
    const siloReadback = readback.siloDnas.find(version => version.entityId === siloId && version.versionId === pairPersisted.siloDna.versionId);
    const pageReadback = readback.siloPages.find(version => version.entityId === `silo-page:${siloId}` && version.versionId === pairPersisted.siloPage.versionId);
    if (!siloReadback || !pageReadback || pageReadback.payload.siloDnaRef.versionId !== siloReadback.versionId || pageReadback.payload.siloDnaRef.contentHash !== siloReadback.contentHash) {
      throw new SiloPairCreationError("SILO_PAIR_INCOMPLETE", "A criação do silo não foi confirmada integralmente no readback canônico.");
    }

    return NextResponse.json({
      success: true,
      data: {
        persistence: "PERSISTED",
        atomicity: pairPersisted.atomicity,
        siloId,
        name: parsed.name,
        slug: normalizedSlug,
        siloDna: siloReadback,
        siloPage: pageReadback,
        source: "CANONICAL_REMOTE",
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ success: false, error: "Nome, slug e Brand são obrigatórios para criar o silo." }, { status: 400 });
    if (error instanceof SiloPairCreationError) return NextResponse.json({ success: false, error: error.message, code: error.code }, { status: error.code === "SILO_SLUG_CONFLICT" ? 409 : 503 });
    const mapped = pipelineArtifactErrorResponse(error);
    return NextResponse.json(mapped.body, { status: mapped.status });
  }
}
