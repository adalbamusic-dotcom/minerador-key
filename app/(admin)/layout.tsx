import React from "react";
import { redirect } from "next/navigation";
import { ProductShell } from "@/components/product-shell";
import { requireSessionProfile } from "@/lib/server/authz";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  let profile;
  try { profile = await requireSessionProfile(); } catch { redirect("/"); }
  if (!profile.isAdmin) redirect("/");
  return <ProductShell>
    <div className="min-h-screen flex flex-col bg-[#06070a]">
      <div className="flex-1 flex flex-col overflow-hidden">
        {children}
      </div>
    </div>
  </ProductShell>;
}
