import React from "react";
import type { PipelineState } from "./contracts.ts";

export function PipelineStateSummary({ label, state }: { label: string; state: PipelineState }) {
  return React.createElement("span", { "data-state": state, "aria-label": `${label}: ${state}` }, `${label}: ${state}`);
}
