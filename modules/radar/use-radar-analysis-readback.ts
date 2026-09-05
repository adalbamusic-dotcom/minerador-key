"use client";

import { useEffect, useRef } from "react";
import type { RadarItem } from "@/lib/editorial/operational-flow";

export function useRadarAnalysisReadback(input: {
  scopeKey: string | null;
  enabled: boolean;
  radarItems: RadarItem[];
  reload: (articleId: string) => Promise<void>;
}) {
  const requested = useRef(new Set<string>());
  const { enabled, radarItems, reload, scopeKey } = input;

  useEffect(() => {
    if (!enabled || !scopeKey || !radarItems.length) return;
    radarItems.forEach(row => {
      const key = `${scopeKey}:${row.articleId}:${row.articleDnaVersionId}`;
      if (requested.current.has(key)) return;
      requested.current.add(key);
      void reload(row.articleId);
    });
  }, [enabled, radarItems, reload, scopeKey]);
}
