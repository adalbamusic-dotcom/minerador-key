import { SerpCollectionRecordSchema, SerpReviewRecordSchema, type SerpCollectionRecord, type SerpReviewRecord } from "../editorial/contracts";
import { isCanonicalUuid } from "../radar/identifiers";
import { SerpResearchSnapshotSchema, type SerpResearchSnapshot } from "../radar/serp/contracts";

export type SerpSnapshotPersistenceRow = {
  id: string;
  marca_id: string;
  article_id: string;
  source_version_id: string | null;
  snapshot_version: number;
  previous_snapshot_id: string | null;
  content_hash: string;
  status: string;
  payload: SerpCollectionRecord;
  created_by: string;
  created_at: string;
};

export type SerpReviewPersistenceRow = {
  id: string;
  marca_id: string;
  article_id: string;
  snapshot_id: string;
  source_version_id: string | null;
  status: string;
  reviewed_by: string;
  payload: SerpReviewRecord;
  created_at: string;
};

export function normalizePersistenceTimestamp(value: string | null | undefined, fallback = new Date().toISOString()) {
  const candidate = value || fallback;
  const parsed = new Date(candidate);
  return Number.isNaN(parsed.getTime()) ? fallback : parsed.toISOString();
}

export function canonicalUuidOrNull(value: unknown): string | null {
  return isCanonicalUuid(value) ? value : null;
}

export function canonicalUuidOrGenerate(value: unknown): string {
  return canonicalUuidOrNull(value) || crypto.randomUUID();
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function collectionStatusFromResearch(status: SerpResearchSnapshot["status"]): SerpCollectionRecord["status"] {
  if (status === "approved") return "approved";
  if (status === "error") return "failed";
  return "needs_review";
}

function envelopeFromResearch(research: SerpResearchSnapshot): SerpCollectionRecord {
  return SerpCollectionRecordSchema.parse({
    id: research.id,
    input: {
      keyword: research.query,
      articleId: research.articleId,
      location: research.location,
      language: research.language,
      device: research.device,
    },
    status: collectionStatusFromResearch(research.status),
    provider: research.provider,
    origin: research.origin,
    isMock: research.isMock,
    snapshot: null,
    cost: null,
    error: null,
    dnaIntent: research.diagnostic.dominantIntent,
    conflictReason: research.diagnostic.possibleConflicts[0] || null,
    humanDecisionRequired: !research.isMock,
    research,
    persistenceMode: research.persistenceMode,
    resolutionMode: research.resolutionMode,
    canonicalRemoteVerified: research.canonicalRemoteVerified,
  });
}

export function parseStoredSerpSnapshotPayload(payload: unknown, sourceVersionId: string | null = null): SerpCollectionRecord {
  const direct = SerpCollectionRecordSchema.safeParse(payload);
  if (direct.success) return direct.data;

  const object = asRecord(payload);
  const nestedResearch = object && asRecord(object.research);
  if (nestedResearch) {
    const researchCandidate = !nestedResearch.articleDnaVersionId && sourceVersionId
      ? { ...nestedResearch, articleDnaVersionId: sourceVersionId }
      : nestedResearch;
    const repairedEnvelope = SerpCollectionRecordSchema.safeParse({ ...object, research: researchCandidate });
    if (repairedEnvelope.success) return repairedEnvelope.data;
    const research = SerpResearchSnapshotSchema.safeParse(researchCandidate);
    if (research.success) return envelopeFromResearch(research.data);
  }

  const rawResearchCandidate = object && !object.articleDnaVersionId && sourceVersionId
    ? { ...object, articleDnaVersionId: sourceVersionId }
    : payload;
  const rawResearch = SerpResearchSnapshotSchema.safeParse(rawResearchCandidate);
  if (rawResearch.success) return envelopeFromResearch(rawResearch.data);

  return SerpCollectionRecordSchema.parse(payload);
}

export function markStoredSerpSnapshotAsRemote(record: SerpCollectionRecord): SerpCollectionRecord {
  return SerpCollectionRecordSchema.parse({
    ...record,
    persistenceMode: "remote",
    research: record.research ? { ...record.research, persistenceMode: "remote" } : null,
  });
}

export function parseStoredSerpReviewPayload(
  payload: unknown,
  row: Pick<SerpReviewPersistenceRow, "id" | "marca_id" | "article_id" | "snapshot_id" | "status" | "reviewed_by" | "created_at">,
): SerpReviewRecord {
  const direct = SerpReviewRecordSchema.safeParse(payload);
  if (direct.success) return direct.data;

  const object = asRecord(payload) || {};
  return SerpReviewRecordSchema.parse({
    id: object.id || row.id,
    brandId: object.brandId || row.marca_id,
    articleId: object.articleId || row.article_id,
    snapshotId: object.snapshotId || row.snapshot_id,
    status: object.status || row.status,
    notes: typeof object.notes === "string" ? object.notes : "",
    reviewedBy: object.reviewedBy || row.reviewed_by,
    reviewedAt: normalizePersistenceTimestamp(typeof object.reviewedAt === "string" ? object.reviewedAt : row.created_at),
  });
}

export function buildSerpSnapshotPersistenceRow(args: {
  brandId: string;
  record: SerpCollectionRecord;
  actorId: string;
  previousSnapshotId?: string | null;
}): { row: SerpSnapshotPersistenceRow; snapshotId: string } {
  const research = args.record.research;
  if (research && (research.brandId !== args.brandId || research.articleId !== args.record.input.articleId)) {
    throw new Error("O snapshot SERP não corresponde ao artigo ou à marca da persistência.");
  }
  if (!research?.contentHash) throw new Error("Somente um snapshot SERP com hash pode ser persistido remotamente.");

  const snapshotId = canonicalUuidOrGenerate(canonicalUuidOrNull(args.record.id) || canonicalUuidOrNull(research.id));
  const previousCandidate = args.previousSnapshotId !== undefined ? args.previousSnapshotId : research.previousSnapshotId;
  return {
    snapshotId,
    row: {
      id: snapshotId,
      marca_id: args.brandId,
      article_id: args.record.input.articleId,
      source_version_id: research.articleDnaVersionId || null,
      snapshot_version: research.version,
      previous_snapshot_id: canonicalUuidOrNull(previousCandidate),
      content_hash: research.contentHash,
      status: research.status,
      payload: args.record,
      created_by: args.actorId,
      created_at: normalizePersistenceTimestamp(research.collectedAt),
    },
  };
}

export function buildSerpReviewPersistenceRow(args: {
  brandId: string;
  review: SerpReviewRecord;
  snapshotId: string;
  sourceVersionId?: string | null;
}): SerpReviewPersistenceRow {
  if (args.review.brandId !== args.brandId || args.review.articleId.length === 0) {
    throw new Error("A revisão SERP não corresponde à marca da persistência.");
  }
  const snapshotId = canonicalUuidOrNull(args.snapshotId);
  if (!snapshotId) throw new Error("A revisão SERP exige o UUID canônico do snapshot remoto.");
  return {
    id: canonicalUuidOrGenerate(args.review.id),
    marca_id: args.brandId,
    article_id: args.review.articleId,
    snapshot_id: snapshotId,
    source_version_id: args.sourceVersionId || null,
    status: args.review.status,
    reviewed_by: args.review.reviewedBy,
    payload: args.review,
    created_at: normalizePersistenceTimestamp(args.review.reviewedAt),
  };
}
