import "server-only";

import { VersionStatusEventSchema, VersionedBrandDNASchema, type BrandDNA, type VersionEnvelope } from "@/lib/arquiteto/contracts";
import { effectiveBrandDnaVersionId } from "@/lib/marca/domain";
import { getOperationalClient, mapPersistenceError } from "@/lib/server/editorial-db";

type BrandDnaEventRow = {
  id: string;
  version_id: string;
  status: string;
  reason: string;
  actor_id: string;
  occurred_at: string;
};

/**
 * Returns only the currently approved BrandDNA envelope for this Brand.
 * There is deliberately no legacy dna_diretrizes fallback: an absent
 * approved artifact means that identity context is unavailable.
 */
export async function getApprovedBrandDna(brandId: string): Promise<VersionEnvelope<BrandDNA> | null> {
  const client = getOperationalClient();
  const versionsResult = await client
    .from("editorial_artifact_versions")
    .select("version_id,version_number,previous_version_id,content_hash,origin,change_reason,payload,created_by,created_at")
    .eq("marca_id", brandId)
    .eq("artifact_type", "brand_dna")
    .order("version_number", { ascending: false });
  if (versionsResult.error) mapPersistenceError(versionsResult.error);

  const versions = ((versionsResult.data || []) as Array<Record<string, unknown>>)
    .map(row => VersionedBrandDNASchema.parse(row.payload))
    .filter(version => version.payload.brandId === brandId);
  if (!versions.length) return null;

  const ids = versions.map(version => version.versionId);
  const eventsResult = await client
    .from("editorial_version_status_events")
    .select("id,version_id,status,reason,actor_id,occurred_at")
    .in("version_id", ids)
    .order("occurred_at", { ascending: true });
  if (eventsResult.error) mapPersistenceError(eventsResult.error);

  const events = ((eventsResult.data || []) as BrandDnaEventRow[]).map(row =>
    VersionStatusEventSchema.parse({
      eventId: row.id,
      versionId: row.version_id,
      status: row.status,
      reason: row.reason,
      actorId: row.actor_id,
      occurredAt: row.occurred_at,
    }),
  );
  const activeVersionId = effectiveBrandDnaVersionId(versions.map(version => version.versionId), events);
  return versions.find(version => version.versionId === activeVersionId) || null;
}
