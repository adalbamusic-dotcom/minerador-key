"use client";

import React from "react";
import { SessionProvider } from "next-auth/react";
import { BrandProvider } from "./brand-context";
import { EditorialPipelineProvider } from "./editorial-pipeline-context";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider refetchOnWindowFocus={false}>
      <BrandProvider>
        <EditorialPipelineProvider>{children}</EditorialPipelineProvider>
      </BrandProvider>
    </SessionProvider>
  );
}
