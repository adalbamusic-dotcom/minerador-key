import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireSessionProfile, authzErrorResponse } from "@/lib/server/authz";
import { assertEditorialPermission } from "@/lib/server/editorial-authorization";
import { ArtifactRepository, ContentDocumentRepository, InvitationRepository, PublicationRepository, SerpSnapshotRepository, ViewPreferenceRepository, WorkflowRepository } from "@/lib/server/editorial-repositories";
import { PersistenceUnavailableError } from "@/lib/server/editorial-db";
import { PersistedEditorialWorkspaceSchema } from "@/lib/editorial/persistence-contracts";

const QuerySchema = z.string().uuid();

export async function GET(request: NextRequest) {
  try {
    const profile = await requireSessionProfile(); const marcaId = QuerySchema.parse(request.nextUrl.searchParams.get("marcaId"));
    await assertEditorialPermission(profile, marcaId, "marca", "view");
    const [workflow, artifacts, documents, publications, invitations, views, serp, reviews] = await Promise.all([
      new WorkflowRepository().list(marcaId), new ArtifactRepository().list(marcaId), new ContentDocumentRepository().list(marcaId, profile.email.toLowerCase()),
      new PublicationRepository().list(marcaId), new InvitationRepository().list(marcaId), new ViewPreferenceRepository().list(marcaId, profile.email.toLowerCase()),
      new SerpSnapshotRepository().list(marcaId), new SerpSnapshotRepository().listReviews(marcaId),
    ]);
    const data = PersistedEditorialWorkspaceSchema.parse({ mode: "server", radarItems: workflow.radar, plannerItems: workflow.planner,
      articleVersions: artifacts.articles, siloVersions: artifacts.silos, versionEvents: artifacts.events, contentPlans: artifacts.plans,
      serpRecords: serp.records, serpReviews: reviews.reviews, serpPersistenceMode: serp.available && reviews.available ? "server" : "local_fallback",
      documents, publications, invitations, views, loadedAt: new Date().toISOString() });
    return NextResponse.json({ data });
  } catch (error) {
    if (error instanceof PersistenceUnavailableError) return NextResponse.json({ code: error.code, error: error.message }, { status: 503 });
    if (error instanceof z.ZodError) return NextResponse.json({ error: "Marca inválida." }, { status: 400 });
    const mapped = authzErrorResponse(error); return NextResponse.json({ error: mapped.message }, { status: mapped.status });
  }
}
