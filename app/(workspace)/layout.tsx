import React from "react";
import { ProductShell } from "@/components/product-shell";

export default function WorkspaceLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <ProductShell>
    <div className="flex h-screen min-h-0 flex-col overflow-hidden bg-[#06070a]">
      <div className="flex-1 flex flex-col overflow-hidden">
        {children}
      </div>
    </div>
  </ProductShell>;
}
