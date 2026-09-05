export const LIFECYCLE_RECOVERY_WINDOW_HOURS = 24;

export type LifecycleSubjectType =
  | "minerador_keyword"
  | "minerador_keyword_list"
  | "article_dna"
  | "silo_dna"
  | "silo_page"
  | "content_plan"
  | "content_document"
  | "publication_record";

export type LifecycleSubject = {
  type: LifecycleSubjectType;
  id: string;
  brandId: string;
};

export type DeletionMode = "hard" | "recoverable" | "blocked";
export type RecoveryState = "active" | "recoverable" | "expired" | "purged";
export type LifecycleDependencyClass =
  | "OWNED_CHILD"
  | "SHARED_REFERENCE"
  | "DRAFT_DESCENDANT"
  | "PUBLISHED_REFERENCE"
  | "CANONICAL_HISTORY"
  | "SESSION_HISTORY";

export type DeletionImpactEntry = {
  key: string;
  label: string;
  count: number;
  ids?: string[];
  classification: LifecycleDependencyClass;
  behavior: "delete" | "preserve" | "unlink" | "block";
};

export type DeletionImpact = {
  root: LifecycleSubject;
  mode: DeletionMode;
  recoveryState: RecoveryState;
  ownedChildren: DeletionImpactEntry[];
  downstreamDrafts: DeletionImpactEntry[];
  sharedReferences: DeletionImpactEntry[];
  publishedReferences: DeletionImpactEntry[];
  canonicalHistory: DeletionImpactEntry[];
  partialDelete: false;
};

export type DeletionResult = {
  subject: LifecycleSubject;
  mode: Exclude<DeletionMode, "blocked">;
  hardDeletedIds: string[];
  recoverableIds: string[];
  restoredIds: string[];
  purgedIds: string[];
  partialDelete: false;
};

export function deletionModeForPublication(isPublished: boolean, blocked = false): DeletionMode {
  if (blocked) return "blocked";
  return isPublished ? "recoverable" : "hard";
}

export function recoveryStateForTombstone(input: { deletedAt?: string | null; purgeAfter?: string | null }, now = new Date()): RecoveryState {
  if (!input.deletedAt || !input.purgeAfter) return "active";
  const purgeAt = Date.parse(input.purgeAfter);
  if (!Number.isFinite(purgeAt)) return "expired";
  return now.getTime() < purgeAt ? "recoverable" : "expired";
}

