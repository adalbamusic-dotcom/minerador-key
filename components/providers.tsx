"use client";

import React from "react";
import { SupabaseSessionProvider } from "@/components/auth/supabase-session-context";
import { BrandProvider } from "./brand-context";
import { EditorialPipelineProvider } from "./editorial-pipeline-context";
import { ShellVisualProvider, type OperationalBrandHint } from "./shell-visual-context";
import { GlobalNoticeProvider } from "./global-notice-center";

export function Providers({ children, initialExpanded = null, initialOperationalBrand = null }: {
  children: React.ReactNode;
  initialExpanded?: boolean | null;
  initialOperationalBrand?: OperationalBrandHint | null;
}) {
  return (
    <SupabaseSessionProvider>
      <GlobalNoticeProvider>
        <ShellVisualProvider initialExpanded={initialExpanded} initialOperationalBrand={initialOperationalBrand}>
          <BrandProvider initialOperationalBrand={initialOperationalBrand}>
            <EditorialPipelineProvider>{children}</EditorialPipelineProvider>
          </BrandProvider>
        </ShellVisualProvider>
      </GlobalNoticeProvider>
    </SupabaseSessionProvider>
  );
}
