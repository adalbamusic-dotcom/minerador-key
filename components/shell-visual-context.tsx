"use client";

import { createContext, useContext, useLayoutEffect, useState } from "react";
import { readShellExpandedPreference, writeShellExpandedPreference } from "@/lib/navigation/global-context";

type ShellVisualContextValue = {
  expanded: boolean;
  setExpandedPreference: (expanded: boolean) => void;
  initialOperationalBrand: OperationalBrandHint | null;
};

export type OperationalBrandHint = { id: string; nome: string };

const ShellVisualContext = createContext<ShellVisualContextValue | undefined>(undefined);

export function ShellVisualProvider({ children, initialExpanded = null, initialOperationalBrand = null }: {
  children: React.ReactNode;
  initialExpanded?: boolean | null;
  initialOperationalBrand?: OperationalBrandHint | null;
}) {
  const [expanded, setExpanded] = useState(initialExpanded ?? true);

  useLayoutEffect(() => {
    if (initialExpanded !== null) return;
    const saved = readShellExpandedPreference();
    if (saved !== null) queueMicrotask(() => setExpanded(saved));
  }, [initialExpanded]);

  const setExpandedPreference = (nextExpanded: boolean) => {
    writeShellExpandedPreference(nextExpanded);
    setExpanded(nextExpanded);
  };

  return <ShellVisualContext.Provider value={{ expanded, setExpandedPreference, initialOperationalBrand }}>{children}</ShellVisualContext.Provider>;
}

export function useShellVisual() {
  const context = useContext(ShellVisualContext);
  if (!context) throw new Error("useShellVisual deve ser usado dentro de ShellVisualProvider.");
  return context;
}
