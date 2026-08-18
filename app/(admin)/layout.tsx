import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { CanonicalAccessState } from "@/components/canonical-access-state";
import { ProductShell } from "@/components/product-shell";
import { requireCanonicalPlatformAdmin } from "@/lib/server/canonical-authorization";
import { SupabaseSessionError } from "@/lib/server/supabase-session";
import { CanonicalAuthorizationError } from "@/lib/tenant/canonical-authorization";

async function CanonicalAdminShell({ children }: { children: ReactNode }) {
  let failure: unknown;
  try {
    await requireCanonicalPlatformAdmin();
  } catch (error) {
    failure = error;
  }

  if (failure instanceof CanonicalAuthorizationError) {
    if (failure.status === 401) redirect("/login?callbackUrl=%2Fadmin");
    if (failure.status === 403) {
      return <CanonicalAccessState status="denied" title="Administra\u00e7\u00e3o global n\u00e3o dispon\u00edvel" description="Esta identidade n\u00e3o possui o papel global necess\u00e1rio. A \u00e1rea operacional da ag\u00eancia ainda n\u00e3o possui uma rota can\u00f4nica nesta fase." actionHref="/conta" actionLabel="Abrir minha conta" />;
    }
    if (failure.status === 503) {
      return <CanonicalAccessState title="N\u00e3o foi poss\u00edvel confirmar a administra\u00e7\u00e3o global" description="Tente novamente quando a autoriza\u00e7\u00e3o can\u00f4nica estiver dispon\u00edvel." />;
    }
  }

  if (failure instanceof SupabaseSessionError) redirect("/login?callbackUrl=%2Fadmin");
  if (failure) throw failure;

  return <ProductShell>
    <div className="flex min-h-screen flex-col bg-background">
      <div className="flex flex-1 flex-col overflow-hidden">{children}</div>
    </div>
  </ProductShell>;
}

export default function AdminLayout({ children }: { children: ReactNode }) {
  return <CanonicalAdminShell>{children}</CanonicalAdminShell>;
}
