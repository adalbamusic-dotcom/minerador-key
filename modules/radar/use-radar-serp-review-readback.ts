"use client";

import { useEffect, useRef } from "react";
import type { RadarItem } from "@/lib/editorial/operational-flow";
import type { SerpCollectionRecord } from "@/lib/editorial/contracts";
import { latestRadarR5SerpRecord } from "@/lib/radar/r5-sequential";

export function useRadarSerpReviewReadback(input: {
  scopeKey: string | null;
  enabled: boolean;
  radarItems: RadarItem[];
  records: SerpCollectionRecord[];
  reload: (articleId: string) => Promise<void>;
}) {
  const requested = useRef(new Set<string>());
  const { enabled, radarItems, records, reload, scopeKey } = input;

  useEffect(() => {
    if (!enabled || !scopeKey) return;
    radarItems.forEach(row => {
      const record = latestRadarR5SerpRecord(records, row.articleId);
      if (!record?.research || record.origin !== "real") return;
      const key = `${scopeKey}:${row.articleId}:${row.articleDnaVersionId}:${record.id}`;
      if (requested.current.has(key)) return;
      requested.current.add(key);
      void reload(row.articleId);
    });
  }, [enabled, radarItems, records, reload, scopeKey]);
}
