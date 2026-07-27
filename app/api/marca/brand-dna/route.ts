import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { VersionStatusEventSchema, VersionedBrandDNASchema } from "@/lib/arquiteto/contracts";
import { effectiveBrandDnaVersionId, createBrandDnaVersion } from "@/lib/marca/domain";
import { BrandDnaSaveRequestSchema } from "@/lib/marca/contracts";
import { assertEditorialPermission } from "@/lib/server/editorial-authorization";
import { authzErrorResponse, requireSessionProfile } from "@/lib/server/authz";
import { getOperationalClient, mapPersistenceError, PersistenceUnavailableError } from "@/lib/server/editorial-db";

const BrandIdSchema = z.string().uuid();

function versionFromRow(row: Record<string, unknown>) {
  return VersionedBrandDNASchema.parse(row.payload);
}

async function listBrandDna(brandId: string) {
  const client = getOperationalClient();
  const versionsResult = await client.from("editorial_artifact_versions")
    .select("version_id,entity_id,version_number,previous_version_id,content_hash,origin,change_reason,payload,created_by,created_at")
    .eq("marca_id", brandId).eq("artifact_type", "brand_dna").order("version_number", { ascending: false });
  if (versionsResult.error) mapPersistenceError(versionsResult.error);
  const versions = (versionsResult.data || []).map(versionFromRow);
  const ids = versions.map(version => version.versionId);
  const eventsResult = ids.length
    ? await client.from("editorial_version_status_events").select("id,version_id,status,reason,actor_id,occurred_at").in("version_id", ids).order("occurred_at", { ascending: true })
    : { data: [], error: null };
  if (eventsResult.error) mapPersistenceError(eventsResult.error);
  const events = (eventsResult.data || []).map(row => VersionStatusEventSchema.parse({ eventId: row.id, versionId: row.version_id, status: row.status, reason: row.reason, actorId: row.actor_id, occurredAt: row.occurred_at }));
  return { versions, events, activeVersionId: effectiveBrandDnaVersionId(versions.map(version => version.versionId), events) };
}

export async function GET(request: NextRequest) {
  try {
    const profile = await requireSessionProfile();
    const brandId = BrandIdSchema.parse(request.nextUrl.searchParams.get("brandId"));
    await assertEditorialPermission(profile, brandId, "marca", "view");
    return NextResponse.json({ ...(await listBrandDna(brandId)), persistenceMode: "server" });
  } catch (error) {
    if (error instanceof PersistenceUnavailableError) return NextResponse.json({ code: error.code, error: error.message }, { status: 503 });
    if (error instanceof z.ZodError) return NextResponse.json({ error: "Marca inválida." }, { status: 400 });
    const mapped = authzErrorResponse(error);
    return NextResponse.json({ error: mapped.message }, { status: mapped.status });
  }
}

export async function POST(request: NextRequest) {
  try {
    const profile = await requireSessionProfile();
    const input = BrandDnaSaveRequestSchema.parse(await request.json());
    await assertEditorialPermission(profile, input.brandId, "marca", input.action === "approve" ? "approve" : "edit");
    const client = getOperationalClient();

    if (input.action === "save") {
      if (!input.payload || input.payload.brandId !== input.brandId) return NextResponse.json({ error: "O BrandDNA não pertence à marca informada." }, { status: 400 });
      const current = await listBrandDna(input.brandId);
      const version = await createBrandDnaVersion({ brandId: input.brandId, versionNumber: (current.versions[0]?.versionNumber || 0) + 1, previousVersionId: current.versions[0]?.versionId || null, payload: input.payload, createdBy: profile.userId, changeReason: input.reason || "Atualização manual do BrandDNA." });
      const inserted = await client.from("editorial_artifact_versions").insert({ version_id: version.versionId, entity_id: version.entityId, marca_id: input.brandId, artifact_type: "brand_dna", version_number: version.versionNumber, previous_version_id: version.previousVersionId, content_hash: version.contentHash, origin: version.origin, change_reason: version.changeReason, payload: version, created_by: version.createdBy, created_at: version.createdAt });
      if (inserted.error) mapPersistenceError(inserted.error);
      const event = { eventId: crypto.randomUUID(), versionId: version.versionId, status: "draft" as const, occurredAt: new Date().toISOString(), actorId: profile.userId, reason: "Rascunho salvo; aprovação humana pendente." };
      const eventResult = await client.from("editorial_version_status_events").insert({ id: event.eventId, version_id: event.versionId, status: event.status, reason: event.reason, actor_id: event.actorId, occurred_at: event.occurredAt });
      if (eventResult.error) mapPersistenceError(eventResult.error);
      return NextResponse.json({ version, status: event.status, persistenceMode: "server" }, { status: 201 });
    }

    if (!input.versionId) return NextResponse.json({ error: "A versão é obrigatória para aprovação." }, { status: 400 });
    const current = await listBrandDna(input.brandId);
    const version = current.versions.find(item => item.versionId === input.versionId);
    if (!version || version.payload.brandId !== input.brandId) return NextResponse.json({ error: "Versão de BrandDNA não encontrada para esta marca." }, { status: 404 });
    const status = current.events.filter(event => event.versionId === version.versionId).at(-1)?.status || null;
    if (status === "approved") return NextResponse.json({ version, status, persistenceMode: "server" });
    if (status !== "draft" && status !== "proposed") return NextResponse.json({ error: "Somente uma versão em rascunho pode ser aprovada." }, { status: 409 });
    const approved = { eventId: crypto.randomUUID(), versionId: version.versionId, status: "approved" as const, occurredAt: new Date().toISOString(), actorId: profile.userId, reason: input.reason || "Aprovação humana do BrandDNA." };
    const result = await client.from("editorial_version_status_events").insert({ id: approved.eventId, version_id: approved.versionId, status: approved.status, reason: approved.reason, actor_id: approved.actorId, occurred_at: approved.occurredAt });
    if (result.error) mapPersistenceError(result.error);
    const previousApproved = current.versions.find(candidate => candidate.versionId !== version.versionId && current.events.filter(event => event.versionId === candidate.versionId).at(-1)?.status === "approved");
    if (previousApproved) {
      const superseded = { eventId: crypto.randomUUID(), versionId: previousApproved.versionId, status: "superseded" as const, occurredAt: new Date().toISOString(), actorId: profile.userId, reason: `Substituída por ${version.versionId}.` };
      const supersededResult = await client.from("editorial_version_status_events").insert({ id: superseded.eventId, version_id: superseded.versionId, status: superseded.status, reason: superseded.reason, actor_id: superseded.actorId, occurred_at: superseded.occurredAt });
      if (supersededResult.error) mapPersistenceError(supersededResult.error);
    }
    return NextResponse.json({ version, status: approved.status, activeVersionId: version.versionId, persistenceMode: "server" });
  } catch (error) {
    if (error instanceof PersistenceUnavailableError) return NextResponse.json({ code: error.code, error: error.message }, { status: 503 });
    if (error instanceof z.ZodError) return NextResponse.json({ error: "Dados do BrandDNA inválidos.", details: error.issues }, { status: 400 });
    const mapped = authzErrorResponse(error);
    return NextResponse.json({ error: mapped.message }, { status: mapped.status });
  }
}
