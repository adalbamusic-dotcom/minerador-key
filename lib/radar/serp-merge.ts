import { z } from "zod";
import type { SerpCollectionRecord } from "../editorial/contracts.ts";
import type { SerpDiagnostic, SerpResearchSnapshot } from "./serp/contracts.ts";

export const SerpMergeConflictSchema = z.object({
  snapshotId: z.string().min(1),
  articleId: z.string().min(1),
  reason: z.string().min(1),
  localVersion: z.number().int().nonnegative(),
  remoteVersion: z.number().int().nonnegative(),
  localHash: z.string().nullable(),
  remoteHash: z.string().nullable(),
}).strict();
export type SerpMergeConflict = z.infer<typeof SerpMergeConflictSchema>;

function versionOf(record: SerpCollectionRecord) {
  return record.research?.version || 0;
}

function hashOf(record: SerpCollectionRecord) {
  return record.research?.contentHash || null;
}

function contextOf(record: SerpCollectionRecord) {
  return {
    articleId: record.input.articleId,
    query: record.research?.query || record.input.keyword,
    provider: record.research?.provider || record.provider,
    brandId: record.research?.brandId || null,
  };
}

function sameContext(left: SerpCollectionRecord, right: SerpCollectionRecord) {
  const a = contextOf(left);
  const b = contextOf(right);
  return a.articleId === b.articleId && a.query === b.query && a.provider === b.provider && (!a.brandId || !b.brandId || a.brandId === b.brandId);
}

function diagnosticScore(diagnostic: SerpDiagnostic | null | undefined) {
  if (!diagnostic) return 0;
  return diagnostic.questions.length + diagnostic.relatedSearches.length + diagnostic.frequentEntities.length + diagnostic.frequentDomains.length + diagnostic.opportunities.length + diagnostic.possibleConflicts.length;
}

export function serpRecordEvidenceScore(record: SerpCollectionRecord) {
  const research = record.research;
  const legacy = record.snapshot;
  return (research?.organicResults.length || 0) + (research?.peopleAlsoAsk.length || 0) + (research?.relatedSearches.length || 0)
    + (research?.knowledgeGraph ? 1 : 0) + diagnosticScore(research?.diagnostic)
    + (legacy?.results.length || 0) + (legacy?.questions.length || 0) + (legacy?.formats.length || 0) + (legacy?.entities.length || 0);
}

function hasPayload(record: SerpCollectionRecord) {
  return Boolean(record.research || record.snapshot);
}

function completeEnough(record: SerpCollectionRecord) {
  return hasPayload(record) && serpRecordEvidenceScore(record) > 0;
}

function uniqueBy<T>(items: T[], key: (item: T) => string) {
  const values = new Map<string, T>();
  items.forEach(item => values.set(key(item), item));
  return [...values.values()];
}

function mergeResearch(left: SerpResearchSnapshot, right: SerpResearchSnapshot) {
  const rich = serpRecordEvidenceScore({ research: left } as SerpCollectionRecord) >= serpRecordEvidenceScore({ research: right } as SerpCollectionRecord) ? left : right;
  return {
    ...rich,
    organicResults: uniqueBy([...left.organicResults, ...right.organicResults], item => String(item.position)).sort((a, b) => a.position - b.position),
    peopleAlsoAsk: uniqueBy([...left.peopleAlsoAsk, ...right.peopleAlsoAsk], item => String(item.position)).sort((a, b) => a.position - b.position),
    relatedSearches: uniqueBy([...left.relatedSearches, ...right.relatedSearches], item => item.term),
    knowledgeGraph: left.knowledgeGraph || right.knowledgeGraph,
    diagnostic: mergeDiagnostic(left.diagnostic, right.diagnostic),
  } satisfies SerpResearchSnapshot;
}

function mergeDiagnostic(left: SerpDiagnostic, right: SerpDiagnostic) {
  const rich = diagnosticScore(left) >= diagnosticScore(right) ? left : right;
  return {
    ...rich,
    secondaryIntents: [...new Set([...left.secondaryIntents, ...right.secondaryIntents])],
    dominantFormats: [...new Set([...left.dominantFormats, ...right.dominantFormats])],
    pageTypes: [...new Set([...left.pageTypes, ...right.pageTypes])],
    recurringTitlePatterns: [...new Set([...left.recurringTitlePatterns, ...right.recurringTitlePatterns])],
    recurringSnippetPatterns: [...new Set([...left.recurringSnippetPatterns, ...right.recurringSnippetPatterns])],
    frequentEntities: [...new Set([...left.frequentEntities, ...right.frequentEntities])],
    frequentDomains: [...new Set([...left.frequentDomains, ...right.frequentDomains])],
    localSignals: [...new Set([...left.localSignals, ...right.localSignals])],
    questions: [...new Set([...left.questions, ...right.questions])],
    relatedSearches: [...new Set([...left.relatedSearches, ...right.relatedSearches])],
    possibleConflicts: [...new Set([...left.possibleConflicts, ...right.possibleConflicts])],
    opportunities: [...new Set([...left.opportunities, ...right.opportunities])],
    limitations: [...new Set([...left.limitations, ...right.limitations])],
  } satisfies SerpDiagnostic;
}

function conflictFor(local: SerpCollectionRecord, remote: SerpCollectionRecord, reason: string): SerpMergeConflict {
  return SerpMergeConflictSchema.parse({ snapshotId: local.id, articleId: local.input.articleId, reason, localVersion: versionOf(local), remoteVersion: versionOf(remote), localHash: hashOf(local), remoteHash: hashOf(remote) });
}

function withConflict(record: SerpCollectionRecord, conflict: SerpMergeConflict) {
  return { ...record, status: "needs_review" as const, conflictReason: conflict.reason };
}

function mergeDuplicate(local: SerpCollectionRecord, remote: SerpCollectionRecord) {
  if (!sameContext(local, remote)) {
    const conflict = conflictFor(local, remote, "O mesmo ID de snapshot aponta para artigo, query, provider ou marca diferentes; o merge foi bloqueado.");
    return { records: [withConflict(local, conflict), withConflict(remote, conflict)], conflicts: [conflict] };
  }

  const localVersion = versionOf(local);
  const remoteVersion = versionOf(remote);
  const localHash = hashOf(local);
  const remoteHash = hashOf(remote);
  if (localVersion === remoteVersion && localHash && remoteHash && localHash !== remoteHash) {
    const conflict = conflictFor(local, remote, "Conflito real de hash na mesma versão do snapshot; o merge foi bloqueado.");
    return { records: [withConflict(local, conflict), withConflict(remote, conflict)], conflicts: [conflict] };
  }

  if (remoteVersion > localVersion && completeEnough(remote)) return { records: [remote], conflicts: [] };
  if (localVersion > remoteVersion && completeEnough(local)) return { records: [local], conflicts: [] };
  if (!completeEnough(remote) && completeEnough(local)) return { records: [local], conflicts: [] };
  if (!completeEnough(local) && completeEnough(remote)) return { records: [remote], conflicts: [] };

  const preferred = serpRecordEvidenceScore(remote) >= serpRecordEvidenceScore(local) ? remote : local;
  const other = preferred === remote ? local : remote;
  const research = preferred.research && other.research && hashOf(preferred) === hashOf(other) && versionOf(preferred) === versionOf(other)
    ? mergeResearch(preferred.research, other.research)
    : preferred.research || other.research;
  return { records: [{ ...preferred, snapshot: preferred.snapshot || other.snapshot, research }], conflicts: [] };
}

export function mergeSerpRecordsPreservingPayload(remoteRecords: SerpCollectionRecord[], localRecords: SerpCollectionRecord[]) {
  const localById = new Map(localRecords.map(record => [record.id, record]));
  const records: SerpCollectionRecord[] = [];
  const conflicts: SerpMergeConflict[] = [];
  const consumed = new Set<string>();
  remoteRecords.forEach(remote => {
    const local = localById.get(remote.id);
    if (!local) { records.push(remote); return; }
    const merged = mergeDuplicate(local, remote);
    records.push(...merged.records);
    conflicts.push(...merged.conflicts);
    consumed.add(local.id);
  });
  records.push(...localRecords.filter(record => !consumed.has(record.id) && !remoteRecords.some(remote => remote.id === record.id)));
  return { records, conflicts };
}
