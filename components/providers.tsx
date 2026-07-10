"use client";

import React from "react";
import { SessionProvider } from "next-auth/react";
import { BrandProvider } from "./brand-context";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      <BrandProvider>
        {children}
      </BrandProvider>
    </SessionProvider>
  );
}
