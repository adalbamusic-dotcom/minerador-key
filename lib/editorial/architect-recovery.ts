import { z } from "zod";
import { ProvisionalArticleGroupSchema, VersionedArticleDNASchema, VersionedSiloDNASchema, VersionStatusEventSchema } from "../arquiteto/contracts.ts";
import { AIReviewAnnotationSchema } from "./operational-contracts.ts";

export const ArchitectReviewRecoverySchema = z.object({
  schemaVersion: z.literal(1),
  importedKeywordSignature: z.string(),
  masterList: z.array(z.record(z.string(), z.unknown())),
  provisionalGroups: z.array(ProvisionalArticleGroupSchema),
  customSlugs: z.record(z.string(), z.string()),
  customHierarchies: z.record(z.string(), z.string()),
  annotations: z.array(AIReviewAnnotationSchema),
  savedAt: z.string().datetime(),
});

export const ArchitectArticleDnaRecoverySchema = z.object({
  schemaVersion: z.literal(1),
  versions: z.record(z.string(), VersionedArticleDNASchema),
  events: z.array(VersionStatusEventSchema),
  savedAt: z.string().datetime(),
});

export const ArchitectSiloDnaRecoverySchema = z.object({
  schemaVersion: z.literal(1),
  versions: z.record(z.string(), VersionedSiloDNASchema),
  events: z.array(VersionStatusEventSchema),
  savedAt: z.string().datetime(),
});

export const architectReviewRecoveryKey = (brandId: string) => `minerador-pro:architect-review:${brandId}`;
export const architectArticleDnaRecoveryKey = (brandId: string) => `minerador-pro:architect-article-dna:${brandId}`;
export const architectSiloDnaRecoveryKey = (brandId: string) => `minerador-pro:architect-silo-dna:${brandId}`;

export const ArchitectRecoverySnapshotSchema = z.object({
  schemaVersion: z.literal(1),
  snapshotType: z.literal("ArchitectRecoverySnapshot"),
  brandId: z.string().min(1),
  createdAt: z.string().datetime(),
  readOnly: z.literal(true),
  database: z.record(z.string(), z.unknown()),
  workspace: z.record(z.string(), z.unknown()),
  browser: z.record(z.string(), z.unknown()),
  audit: z.record(z.string(), z.unknown()),
}).strict();
export type ArchitectRecoverySnapshot = z.infer<typeof ArchitectRecoverySnapshotSchema>;

type RecoveryRecord = Record<string, unknown>;

export interface ArchitectRecoveryAuditInput {
  brandId: string;
  masterKeywords: unknown[];
  importedKeywordIds: string[];
  currentMasterList: unknown[];
  currentArticles: unknown[];
  provisionalGroups: unknown[];
  articleDnas: Record<string, unknown>;
  siloDnas: Record<string, unknown>;
  siloPages: Record<string, unknown>;
  versionEvents: unknown[];
  radarItems?: unknown[];
  plannerItems?: unknown[];
  documents?: Record<string, unknown>;
  operationalPublications?: unknown[];
  historyEntries?: unknown[];
  localStorage?: Array<{ key: string; value: unknown }>;
  indexedDb?: Array<{ key: string; value: unknown }>;
  renderedItems?: unknown[];
}

export interface ArchitectRecoveryAudit {
  brandId: string;
  auditedAt: string;
  counts: {
    masterKeywords: number;
    approvedKeywords: number;
    publishedKeywords: number;
    importedKeywordIds: number;
    currentArticleKeywordReferences: number;
    provisionalGroupKeywordReferences: number;
    articleDnaKeywordReferences: number;
    historyKeywordReferences: number;
    indexedDbKeywordReferences: number;
    localStorageKeywordReferences: number;
    keywordsWithoutRecoverableLink: number;
    orphanKeywordsRecoverable: number;
    currentArticles: number;
    publishedArticles: number;
    recoverableNewArticles: number;
    recoverableProvisionalGroups: number;
    renderedItems: number;
  };
  ids: {
    masterKeywordIds: string[];
    approvedKeywordIds: string[];
    publishedKeywordIds: string[];
    importedKeywordIds: string[];
    currentArticleKeywordIds: string[];
    provisionalGroupKeywordIds: string[];
    articleDnaKeywordIds: string[];
    historyKeywordIds: string[];
    indexedDbKeywordIds: string[];
    localStorageKeywordIds: string[];
    effectiveImportedKeywordIds: string[];
    orphanKeywordIds: string[];
    unrecoverableKeywordIds: string[];
    recoverableNewArticleIds: string[];
    recoverableProvisionalGroupIds: string[];
  };
}

export interface ArchitectRecoveryPlan extends ArchitectRecoveryAudit {
  correctedImportedKeywordIds: string[];
  recoveredMasterList: Array<RecoveryRecord>;
  recoveredProvisionalGroups: Array<RecoveryRecord>;
  preservedArticleVersionIds: string[];
  preservedSiloVersionIds: string[];
  preservedSiloPageVersionIds: string[];
  orphanKeywordIds: string[];
}

const recordOf = (value: unknown): RecoveryRecord | null => (
  value && typeof value === "object" && !Array.isArray(value) ? value as RecoveryRecord : null
);

const stringOf = (value: unknown): string | null => typeof value === "string" && value.trim() ? value.trim() : null;

const idOf = (value: unknown): string | null => {
  const record = recordOf(value);
  return stringOf(record?.keywordId) || stringOf(record?.id);
};

const listOf = (value: unknown): unknown[] => Array.isArray(value) ? value : [];

const unique = (values: Iterable<string>) => [...new Set([...values].filter(Boolean))].sort();

const add = (target: Set<string>, value: unknown) => {
  const id = stringOf(value);
  if (id) target.add(id);
};

const statusOf = (value: unknown) => stringOf(recordOf(value)?.status)?.toLowerCase() || "";

const isPublished = (value: unknown) => {
  const record = recordOf(value);
  return record?.isPublished === true || statusOf(value) === "publicado";
};

function keywordIdsFromMasterList(values: unknown[]): Set<string> {
  const ids = new Set<string>();
  values.forEach(value => {
    const record = recordOf(value);
    if (record?.keyword || record?.keywordId) add(ids, record.keywordId || record.id);
  });
  return ids;
}

export function keywordIdsFromArticle(value: unknown): Set<string> {
  const ids = new Set<string>();
  const root = recordOf(value);
  if (!root) return ids;
  const payload = recordOf(root.payload);
  const source = payload || root;
  add(ids, source.principalKeywordId);
  listOf(source.secondaryKeywordIds).forEach(item => add(ids, item));
  listOf(source.narrativeReinforcementIds).forEach(item => add(ids, item));
  listOf(source.keywordIds).forEach(item => add(ids, item));
  listOf(source.keywordReferences).forEach(reference => add(ids, recordOf(reference)?.keywordId));
  add(ids, recordOf(root.mainKeywordObj)?.id);
  listOf(root.supportKeywords).forEach(keyword => add(ids, idOf(keyword)));
  return ids;
}

export function keywordIdsFromGroup(value: unknown): Set<string> {
  const ids = new Set<string>();
  const root = recordOf(value);
  if (!root) return ids;
  listOf(root.keywordIds).forEach(item => add(ids, item));
  listOf(root.keywords).forEach(keyword => add(ids, idOf(keyword)));
  return ids;
}

function keywordIdsFromDnaMap(values: Record<string, unknown>): Set<string> {
  const ids = new Set<string>();
  Object.values(values).forEach(value => keywordIdsFromArticle(value).forEach(id => ids.add(id)));
  return ids;
}

function keywordIdsFromHistory(values: unknown[]): Set<string> {
  const ids = new Set<string>();
  values.forEach(value => {
    const entry = recordOf(value);
    const snapshot = recordOf(entry?.snapshot) || entry;
    if (!snapshot) return;
    keywordIdsFromMasterList(listOf(snapshot.masterList)).forEach(id => ids.add(id));
    listOf(snapshot.provisionalGroups).forEach(group => keywordIdsFromGroup(group).forEach(id => ids.add(id)));
    listOf(snapshot.articles || snapshot.currentArticles).forEach(article => keywordIdsFromArticle(article).forEach(id => ids.add(id)));
    const articleVersions = recordOf(snapshot.articleVersions);
    if (articleVersions) keywordIdsFromDnaMap(articleVersions).forEach(id => ids.add(id));
  });
  return ids;
}

function keywordIdsFromBrowserArtifacts(values: Array<{ key: string; value: unknown }>): Set<string> {
  const ids = new Set<string>();
  values.forEach(entry => {
    const root = recordOf(entry.value);
    if (!root) return;
    keywordIdsFromMasterList(listOf(root.masterList)).forEach(id => ids.add(id));
    listOf(root.provisionalGroups).forEach(group => keywordIdsFromGroup(group).forEach(id => ids.add(id)));
    const versions = recordOf(root.versions) || recordOf(root.articleVersions);
    if (versions) keywordIdsFromDnaMap(versions).forEach(id => ids.add(id));
    keywordIdsFromArticle(root).forEach(id => ids.add(id));
  });
  return ids;
}

function articleDnasFromBrowserArtifacts(values: Array<{ key: string; value: unknown }>): Record<string, unknown> {
  const versions: Record<string, unknown> = {};
  values.forEach(entry => {
    if (!entry.key.includes("article-dna") && !entry.key.includes("workflow-recovery")) return;
    const root = recordOf(entry.value);
    const source = recordOf(root?.versions) || recordOf(root?.articleVersions);
    if (!source) return;
    Object.entries(source).forEach(([key, value]) => {
      const record = recordOf(value);
      const payload = recordOf(record?.payload);
      versions[String(payload?.articleId || key)] = value;
    });
  });
  return versions;
}

function versionMapFromBrowserArtifacts(
  values: Array<{ key: string; value: unknown }>,
  field: string,
  keyFragment: string,
): Record<string, unknown> {
  const versions: Record<string, unknown> = {};
  values.forEach(entry => {
    const root = recordOf(entry.value);
    if (!root) return;
    const explicit = recordOf(root[field]);
    const legacy = entry.key.includes(keyFragment) ? recordOf(root.versions) : null;
    Object.entries(explicit || legacy || {}).forEach(([key, value]) => { versions[key] = value; });
  });
  return versions;
}

function currentArticleIds(values: unknown[]): { all: Set<string>; published: Set<string>; newArticles: Set<string> } {
  const all = new Set<string>();
  const published = new Set<string>();
  const newArticles = new Set<string>();
  values.forEach(value => {
    const record = recordOf(value);
    if (!record) return;
    const id = stringOf(record.articleId) || stringOf(record.briefingId) || stringOf(record.id);
    if (!id) return;
    all.add(id);
    if (isPublished(value)) published.add(id);
    else newArticles.add(id);
  });
  return { all, published, newArticles };
}

function recoverableGroupIds(values: unknown[]): Set<string> {
  const ids = new Set<string>();
  values.forEach(value => {
    const record = recordOf(value);
    if (!record || !keywordIdsFromGroup(value).size) return;
    add(ids, record.id || record.provisionalGroupId || record.clusterId);
  });
  return ids;
}

function articleIdsFromDnaMap(values: Record<string, unknown>): Set<string> {
  const ids = new Set<string>();
  Object.values(values).forEach(value => {
    const record = recordOf(value);
    const payload = recordOf(record?.payload) || record;
    add(ids, payload?.articleId);
  });
  return ids;
}

function newArticleIdsFromGroups(values: unknown[], publishedArticleIds: Set<string>): Set<string> {
  const ids = new Set<string>();
  values.forEach(value => {
    const record = recordOf(value);
    if (!record || record.publishedAnchorId || !keywordIdsFromGroup(value).size) return;
    const id = stringOf(record.id) || stringOf(record.provisionalGroupId) || stringOf(record.clusterId);
    if (id && !publishedArticleIds.has(id)) ids.add(id);
  });
  return ids;
}

function browserEntries(values: Array<{ key: string; value: unknown }> | undefined) {
  return values || [];
}

function provisionalGroupCandidates(input: ArchitectRecoveryAuditInput): RecoveryRecord[] {
  return [
    ...input.provisionalGroups.map(recordOf),
    ...(input.historyEntries?.flatMap(entry => {
      const snapshot = recordOf(recordOf(entry)?.snapshot) || recordOf(entry);
      return listOf(snapshot?.provisionalGroups).map(recordOf);
    }) || []),
    ...browserEntries(input.localStorage).flatMap(entry => {
      const root = recordOf(entry.value);
      return listOf(root?.provisionalGroups).map(recordOf);
    }),
    ...browserEntries(input.indexedDb).flatMap(entry => {
      const root = recordOf(entry.value);
      return listOf(root?.provisionalGroups).map(recordOf);
    }),
  ].filter((group): group is RecoveryRecord => Boolean(group));
}

export function auditArchitectWorkspace(input: ArchitectRecoveryAuditInput): ArchitectRecoveryAudit {
  const masterKeywordIds = keywordIdsFromMasterList(input.masterKeywords);
  const approvedKeywordIds = new Set([...masterKeywordIds].filter(id => statusOf(input.masterKeywords.find(item => idOf(item) === id)) === "aprovado"));
  const publishedKeywordIds = new Set([...masterKeywordIds].filter(id => statusOf(input.masterKeywords.find(item => idOf(item) === id)) === "publicado"));
  const importedKeywordIds = new Set(input.importedKeywordIds.map(String));
  const currentArticleKeywordIds = new Set<string>();
  input.currentArticles.forEach(article => keywordIdsFromArticle(article).forEach(id => currentArticleKeywordIds.add(id)));
  const provisionalGroupKeywordIds = new Set<string>();
  input.provisionalGroups.forEach(group => keywordIdsFromGroup(group).forEach(id => provisionalGroupKeywordIds.add(id)));
  const persistedArticleDnas = { ...articleDnasFromBrowserArtifacts(browserEntries(input.localStorage)), ...articleDnasFromBrowserArtifacts(browserEntries(input.indexedDb)) };
  const allArticleDnas = { ...persistedArticleDnas, ...input.articleDnas };
  const articleDnaKeywordIds = keywordIdsFromDnaMap(allArticleDnas);
  const historyKeywordIds = keywordIdsFromHistory(input.historyEntries || []);
  const indexedDbKeywordIds = keywordIdsFromBrowserArtifacts(browserEntries(input.indexedDb));
  const localStorageKeywordIds = keywordIdsFromBrowserArtifacts(browserEntries(input.localStorage));
  const currentMasterKeywordIds = keywordIdsFromMasterList(input.currentMasterList);
  const current = currentArticleIds(input.currentArticles);
  const publishedArticles = new Set(current.published);
  Object.values(allArticleDnas).forEach(value => {
    const record = recordOf(value);
    const payload = recordOf(record?.payload);
    if (payload?.articleId && payload.articleId === record?.entityId && payload.isPublished === true) publishedArticles.add(String(payload.articleId));
  });
  const groupCandidates = provisionalGroupCandidates(input);
  const groupIds = recoverableGroupIds(groupCandidates);
  const recoverableNewArticleIds = new Set<string>(current.newArticles);
  newArticleIdsFromGroups(input.provisionalGroups, publishedArticles).forEach(id => recoverableNewArticleIds.add(id));
  newArticleIdsFromGroups((input.historyEntries || []).flatMap(entry => {
    const snapshot = recordOf(recordOf(entry)?.snapshot) || recordOf(entry);
    return listOf(snapshot?.provisionalGroups);
  }), publishedArticles).forEach(id => recoverableNewArticleIds.add(id));
  articleIdsFromDnaMap(allArticleDnas).forEach(id => { if (!publishedArticles.has(id)) recoverableNewArticleIds.add(id); });
  [...(input.radarItems || []), ...(input.plannerItems || []), ...(input.operationalPublications || [])].forEach(item => {
    const record = recordOf(item);
    const id = stringOf(record?.articleId);
    if (id && !publishedArticles.has(id) && articleDnaKeywordIds.size) recoverableNewArticleIds.add(id);
  });

  const linkedKeywordIds = new Set<string>([
    ...currentArticleKeywordIds,
    ...provisionalGroupKeywordIds,
    ...articleDnaKeywordIds,
    ...historyKeywordIds,
    ...indexedDbKeywordIds,
    ...localStorageKeywordIds,
  ]);
  const evidenceKeywordIds = new Set<string>([
    ...currentMasterKeywordIds,
    ...linkedKeywordIds,
    ...publishedKeywordIds,
  ]);
  const orphanKeywordIds = new Set([...masterKeywordIds].filter(id => evidenceKeywordIds.has(id) && !linkedKeywordIds.has(id)));
  const unrecoverableKeywordIds = new Set([...masterKeywordIds].filter(id => !evidenceKeywordIds.has(id)));
  const effectiveImportedKeywordIds = new Set([...masterKeywordIds].filter(id => evidenceKeywordIds.has(id)));
  const renderedItems = input.renderedItems || [];

  return {
    brandId: input.brandId,
    auditedAt: new Date().toISOString(),
    counts: {
      masterKeywords: masterKeywordIds.size,
      approvedKeywords: approvedKeywordIds.size,
      publishedKeywords: publishedKeywordIds.size,
      importedKeywordIds: importedKeywordIds.size,
      currentArticleKeywordReferences: currentArticleKeywordIds.size,
      provisionalGroupKeywordReferences: provisionalGroupKeywordIds.size,
      articleDnaKeywordReferences: articleDnaKeywordIds.size,
      historyKeywordReferences: historyKeywordIds.size,
      indexedDbKeywordReferences: indexedDbKeywordIds.size,
      localStorageKeywordReferences: localStorageKeywordIds.size,
      keywordsWithoutRecoverableLink: unrecoverableKeywordIds.size,
      orphanKeywordsRecoverable: orphanKeywordIds.size,
      currentArticles: current.all.size,
      publishedArticles: publishedArticles.size,
      recoverableNewArticles: recoverableNewArticleIds.size,
      recoverableProvisionalGroups: groupIds.size,
      renderedItems: renderedItems.length,
    },
    ids: {
      masterKeywordIds: unique(masterKeywordIds),
      approvedKeywordIds: unique(approvedKeywordIds),
      publishedKeywordIds: unique(publishedKeywordIds),
      importedKeywordIds: unique(importedKeywordIds),
      currentArticleKeywordIds: unique(currentArticleKeywordIds),
      provisionalGroupKeywordIds: unique(provisionalGroupKeywordIds),
      articleDnaKeywordIds: unique(articleDnaKeywordIds),
      historyKeywordIds: unique(historyKeywordIds),
      indexedDbKeywordIds: unique(indexedDbKeywordIds),
      localStorageKeywordIds: unique(localStorageKeywordIds),
      effectiveImportedKeywordIds: unique(effectiveImportedKeywordIds),
      orphanKeywordIds: unique(orphanKeywordIds),
      unrecoverableKeywordIds: unique(unrecoverableKeywordIds),
      recoverableNewArticleIds: unique(recoverableNewArticleIds),
      recoverableProvisionalGroupIds: unique(groupIds),
    },
  };
}

const ASSIGNMENT_FIELDS = ["clusterId", "provisionalGroupId", "siloId", "silo_id", "siloName", "computedSlug", "computedHierarquia", "reviewRole", "aiReviewAnnotation", "keywordDnaRef"] as const;

function recordsFromArtifacts(values: Array<{ key: string; value: unknown }> | undefined): RecoveryRecord[] {
  const records: RecoveryRecord[] = [];
  browserEntries(values).forEach(entry => {
    const root = recordOf(entry.value);
    if (!root) return;
    listOf(root.masterList).forEach(item => { const record = recordOf(item); if (record) records.push(record); });
  });
  return records;
}

function recordsFromHistory(values: unknown[] | undefined): RecoveryRecord[] {
  const records: RecoveryRecord[] = [];
  (values || []).forEach(entry => {
    const snapshot = recordOf(recordOf(entry)?.snapshot) || recordOf(entry);
    listOf(snapshot?.masterList).forEach(item => { const record = recordOf(item); if (record) records.push(record); });
  });
  return records;
}

function overlayAssignments(base: RecoveryRecord, candidate: RecoveryRecord) {
  const next = { ...base };
  ASSIGNMENT_FIELDS.forEach(field => {
    if (candidate[field] !== undefined) next[field] = candidate[field];
  });
  return next;
}

function hasGroupAssignment(record: RecoveryRecord) {
  const clusterId = stringOf(record.clusterId) || (typeof record.clusterId === "number" && record.clusterId > 0 ? String(record.clusterId) : null);
  return Boolean(stringOf(record.provisionalGroupId) || clusterId);
}

function versionIds(values: Record<string, unknown>) {
  return unique(Object.values(values).map(value => stringOf(recordOf(value)?.versionId)).filter((id): id is string => Boolean(id)));
}

export function buildArchitectRecoveryPlan(input: ArchitectRecoveryAuditInput): ArchitectRecoveryPlan {
  const audit = auditArchitectWorkspace(input);
  const canonicalById = new Map<string, RecoveryRecord>();
  input.masterKeywords.forEach(value => {
    const record = recordOf(value);
    const id = idOf(value);
    if (record && id) canonicalById.set(id, { ...record, id });
  });

  const evidenceById = new Map<string, RecoveryRecord>();
  const evidenceRecords = [
    ...recordsFromArtifacts(input.localStorage),
    ...recordsFromArtifacts(input.indexedDb),
    ...recordsFromHistory(input.historyEntries),
    ...input.currentMasterList.map(recordOf).filter((record): record is RecoveryRecord => Boolean(record)),
  ];
  evidenceRecords.forEach(record => {
    const id = idOf(record);
    if (!id || !canonicalById.has(id)) return;
    const previous = evidenceById.get(id);
    evidenceById.set(id, previous ? overlayAssignments(previous, record) : record);
  });

  const groupCandidates = provisionalGroupCandidates(input);
  const groupAssignmentsByKeywordId = new Map<string, RecoveryRecord>();
  groupCandidates.forEach(group => {
    const groupId = stringOf(group.id) || stringOf(group.provisionalGroupId) || stringOf(group.clusterId);
    if (!groupId || !keywordIdsFromGroup(group).size) return;
    const roles = recordOf(group.roles);
    keywordIdsFromGroup(group).forEach(keywordId => {
      const role = stringOf(roles?.[keywordId]);
      const assignment: RecoveryRecord = {
        clusterId: groupId,
        provisionalGroupId: groupId,
      };
      const siloId = stringOf(group.suggestedSiloId);
      const siloName = stringOf(group.suggestedSiloName);
      const hierarchy = stringOf(group.suggestedHierarchy);
      if (siloId) Object.assign(assignment, { siloId, silo_id: siloId });
      if (siloName) assignment.siloName = siloName;
      if (hierarchy) assignment.computedHierarquia = hierarchy;
      if (role) assignment.reviewRole = role;
      groupAssignmentsByKeywordId.set(keywordId, assignment);
    });
  });

  const persistedArticleDnas = { ...articleDnasFromBrowserArtifacts(browserEntries(input.localStorage)), ...articleDnasFromBrowserArtifacts(browserEntries(input.indexedDb)) };
  const persistedSiloDnas = {
    ...versionMapFromBrowserArtifacts(browserEntries(input.localStorage), "siloVersions", "silo-dna"),
    ...versionMapFromBrowserArtifacts(browserEntries(input.indexedDb), "siloVersions", "silo-dna"),
  };
  const persistedSiloPages = {
    ...versionMapFromBrowserArtifacts(browserEntries(input.localStorage), "siloPageVersions", "silo-page"),
    ...versionMapFromBrowserArtifacts(browserEntries(input.indexedDb), "siloPageVersions", "silo-page"),
  };
  const dnaByArticleId = new Map<string, RecoveryRecord>();
  Object.values({ ...persistedArticleDnas, ...input.articleDnas }).forEach(value => {
    const record = recordOf(value);
    const payload = recordOf(record?.payload);
    const articleId = stringOf(payload?.articleId);
    if (articleId && payload) dnaByArticleId.set(articleId, payload);
  });

  const recoveredMasterList: RecoveryRecord[] = [];
  audit.ids.effectiveImportedKeywordIds.forEach(keywordId => {
    const base = canonicalById.get(keywordId);
    if (!base) return;
    let next = evidenceById.get(keywordId) ? overlayAssignments(base, evidenceById.get(keywordId)!) : { ...base };
    const groupAssignment = groupAssignmentsByKeywordId.get(keywordId);
    if (groupAssignment && !hasGroupAssignment(next)) next = overlayAssignments(next, groupAssignment);
    const articleEvidence = [...dnaByArticleId.entries()].find(([, payload]) => keywordIdsFromArticle(payload).has(keywordId));
    if (articleEvidence && !hasGroupAssignment(next)) {
      const [articleId, payload] = articleEvidence;
      next = { ...next, clusterId: articleId, provisionalGroupId: articleId };
      const siloId = stringOf(payload.siloId);
      if (siloId) next = { ...next, siloId, silo_id: siloId };
    }
    if (audit.ids.orphanKeywordIds.includes(keywordId)) {
      next = { ...next, clusterId: null, provisionalGroupId: null, siloId: null, silo_id: null, siloName: null };
    }
    recoveredMasterList.push(next);
  });

  const recoveredProvisionalGroups: RecoveryRecord[] = [];
  const seenGroups = new Set<string>();
  groupCandidates.forEach(group => {
    const id = stringOf(group.id) || stringOf(group.provisionalGroupId) || stringOf(group.clusterId);
    if (!id || seenGroups.has(id) || !keywordIdsFromGroup(group).size) return;
    seenGroups.add(id);
    recoveredProvisionalGroups.push(group);
  });

  return {
    ...audit,
    correctedImportedKeywordIds: audit.ids.effectiveImportedKeywordIds,
    recoveredMasterList,
    recoveredProvisionalGroups,
    preservedArticleVersionIds: versionIds({ ...persistedArticleDnas, ...input.articleDnas }),
    preservedSiloVersionIds: versionIds({ ...persistedSiloDnas, ...input.siloDnas }),
    preservedSiloPageVersionIds: versionIds({ ...persistedSiloPages, ...input.siloPages }),
    orphanKeywordIds: audit.ids.orphanKeywordIds,
  };
}

const SENSITIVE_KEY = /(api.?key|token|authorization|password|secret|credential|cookie|session)/i;
const PROMPT_KEY = /prompt/i;

export function sanitizeArchitectSnapshotValue(value: unknown, key = ""): unknown {
  if (SENSITIVE_KEY.test(key)) return "[REDACTED]";
  if (PROMPT_KEY.test(key)) return "[OMITTED]";
  if (Array.isArray(value)) return value.map(item => sanitizeArchitectSnapshotValue(item));
  if (!value || typeof value !== "object") return value ?? null;
  const record = value as RecoveryRecord;
  const artifactKey = stringOf(record.key) || "";
  return Object.fromEntries(Object.entries(record)
    .filter(([childKey]) => {
      const effectiveKey = childKey === "value" && artifactKey ? artifactKey : childKey;
      return !SENSITIVE_KEY.test(effectiveKey) && !PROMPT_KEY.test(effectiveKey);
    })
    .map(([childKey, childValue]) => {
      const effectiveKey = childKey === "value" && artifactKey ? artifactKey : childKey;
      return [childKey, sanitizeArchitectSnapshotValue(childValue, effectiveKey)];
    }));
}

export function createArchitectRecoverySnapshot(input: {
  auditInput: ArchitectRecoveryAuditInput;
  database: RecoveryRecord;
  workspace: RecoveryRecord;
  browser: RecoveryRecord;
}): ArchitectRecoverySnapshot {
  const createdAt = new Date().toISOString();
  const audit = auditArchitectWorkspace(input.auditInput);
  return ArchitectRecoverySnapshotSchema.parse({
    schemaVersion: 1,
    snapshotType: "ArchitectRecoverySnapshot",
    brandId: input.auditInput.brandId,
    createdAt,
    readOnly: true,
    database: sanitizeArchitectSnapshotValue(input.database),
    workspace: sanitizeArchitectSnapshotValue(input.workspace),
    browser: sanitizeArchitectSnapshotValue(input.browser),
    audit: sanitizeArchitectSnapshotValue(audit),
  });
}

export function architectRecoveryAuditText(audit: ArchitectRecoveryAudit): string {
  const c = audit.counts;
  return [
    `Lista mestre: ${c.masterKeywords}`,
    `Aprovadas novas: ${c.approvedKeywords}`,
    `Publicadas: ${c.publishedKeywords}`,
    `Marcadas como importadas: ${c.importedKeywordIds}`,
    `Com vínculo real em artigos atuais: ${c.currentArticleKeywordReferences}`,
    `Em grupos provisórios recuperáveis: ${c.provisionalGroupKeywordReferences}`,
    `Referenciadas por ArticleDNA: ${c.articleDnaKeywordReferences}`,
    `Referenciadas pelo histórico: ${c.historyKeywordReferences}`,
    `Referenciadas pelo IndexedDB: ${c.indexedDbKeywordReferences}`,
    `Sem vínculo recuperável: ${c.keywordsWithoutRecoverableLink}`,
    `Órfãs recuperáveis para Keywords não agrupadas: ${c.orphanKeywordsRecoverable}`,
    `Artigos atuais renderizados: ${c.currentArticles}`,
    `Artigos publicados: ${c.publishedArticles}`,
    `Artigos novos recuperáveis: ${c.recoverableNewArticles}`,
    `Grupos provisórios recuperáveis: ${c.recoverableProvisionalGroups}`,
    `Itens efetivamente renderizados: ${c.renderedItems}`,
  ].join("\n");
}
