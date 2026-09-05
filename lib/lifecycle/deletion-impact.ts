import type { DeletionImpact, DeletionImpactEntry, LifecycleDependencyClass, LifecycleSubject } from "./contracts.ts";
import { deletionModeForPublication } from "./contracts.ts";

export function impactEntry(input: {
  key: string;
  label: string;
  count?: number;
  ids?: string[];
  classification: LifecycleDependencyClass;
  behavior: DeletionImpactEntry["behavior"];
}): DeletionImpactEntry {
  return { ...input, count: input.count ?? input.ids?.length ?? 0 };
}

export function buildDeletionImpact(input: {
  root: LifecycleSubject;
  isPublished: boolean;
  ownedChildren?: DeletionImpactEntry[];
  downstreamDrafts?: DeletionImpactEntry[];
  sharedReferences?: DeletionImpactEntry[];
  publishedReferences?: DeletionImpactEntry[];
  canonicalHistory?: DeletionImpactEntry[];
  blocked?: boolean;
}): DeletionImpact {
  return {
    root: input.root,
    mode: deletionModeForPublication(input.isPublished, input.blocked),
    recoveryState: input.isPublished ? "recoverable" : "active",
    ownedChildren: input.ownedChildren || [],
    downstreamDrafts: input.downstreamDrafts || [],
    sharedReferences: input.sharedReferences || [],
    publishedReferences: input.publishedReferences || [],
    canonicalHistory: input.canonicalHistory || [],
    partialDelete: false,
  };
}

export function summarizeDeletionImpact(impact: Pick<DeletionImpact, "ownedChildren" | "downstreamDrafts" | "sharedReferences" | "publishedReferences">): string[] {
  return [...impact.ownedChildren, ...impact.downstreamDrafts, ...impact.sharedReferences, ...impact.publishedReferences]
    .filter(entry => entry.count > 0)
    .map(entry => `${entry.count} ${entry.label}`);
}
