export type EditorialBackgroundTaskType = "logical_grouping" | "keyword_review" | "article_dna" | "silo_dna" | "silo_page";
export type EditorialBackgroundTaskStatus = "queued" | "running" | "completed" | "failed";

export interface EditorialBackgroundTask<TResult = unknown> {
  id: string;
  brandId: string;
  type: EditorialBackgroundTaskType;
  label: string;
  status: EditorialBackgroundTaskStatus;
  message: string;
  current: number;
  total: number;
  startedAt: string;
  finishedAt: string | null;
  consumed: boolean;
  error: string | null;
  result?: TResult;
}

export interface BackgroundTaskProgress {
  message: string;
  current: number;
  total: number;
}

export interface BackgroundTaskInput<TResult> {
  type: EditorialBackgroundTaskType;
  label: string;
  execute: (update: (progress: BackgroundTaskProgress) => void) => Promise<TResult>;
}
