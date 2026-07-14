import type { ArtifactReference, KeywordDNA, VersionEnvelope } from "./contracts.ts";
import { createStatusEvent, createVersionEnvelope, deepFreeze } from "./versioning.ts";

export async function proposeKeywordDnaRevision(input: {
  current: VersionEnvelope<KeywordDNA>;
  changes: Partial<KeywordDNA>;
  evidenceRefs: ArtifactReference[];
  actorId: string;
  reason: string;
}) {
  const payload = { ...input.current.payload, ...input.changes };
  const differences = Object.keys(input.changes).filter(key =>
    JSON.stringify(input.current.payload[key as keyof KeywordDNA]) !== JSON.stringify(payload[key as keyof KeywordDNA]));
  const version = await createVersionEnvelope({ entityId: input.current.entityId, versionNumber: input.current.versionNumber + 1,
    previousVersionId: input.current.versionId, origin: "serp", changeReason: input.reason, createdBy: input.actorId, payload });
  const event = createStatusEvent(version.versionId, "proposed", input.actorId, input.reason);
  return deepFreeze({ version, event, conflict: { type: "serp_human_classification_conflict" as const,
    currentVersionId: input.current.versionId, proposedVersionId: version.versionId, evidenceRefs: input.evidenceRefs,
    differences, humanDecisionRequired: true as const } });
}
