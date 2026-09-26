"use client";

import { useState } from "react";
import { Loader2, ShieldCheck } from "lucide-react";
import { internalButton, internalButtonPrimary, internalNoticeError, internalSurfaceSubtle } from "@/components/editorial/internal-page-visual";
import { WRITER_MCP_DEFAULT_SCOPES, WRITER_MCP_SCOPES, WRITER_MCP_SCOPE_LABELS, type ConsentBrandOption, type WriterMcpScope } from "@/lib/redator/mcp-consent-domain";

type OAuthConsentFormProps = {
  authorizationId: string;
  client: { id: string; name: string; uri: string | null };
  redirectUri: string;
  userEmail: string | null;
  brands: ConsentBrandOption[];
  /** Permissões sugeridas pela Agência ao registrar o aplicativo; sem sugestão, as três. */
  defaultScopes?: readonly WriterMcpScope[] | null;
};

const checkbox = "mt-1 h-4 w-4 shrink-0 accent-action-accent";

export function OAuthConsentForm({ authorizationId, client, redirectUri, userEmail, brands, defaultScopes }: OAuthConsentFormProps) {
  const [brandIds, setBrandIds] = useState<string[]>(() => (brands.length === 1 ? [brands[0].brandId] : []));
  const [scopes, setScopes] = useState<WriterMcpScope[]>(() => [...(defaultScopes?.length ? defaultScopes : WRITER_MCP_DEFAULT_SCOPES)]);
  const [pending, setPending] = useState<"approve" | "deny" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const toggle = <T extends string>(list: T[], value: T) => (list.includes(value) ? list.filter((item) => item !== value) : [...list, value]);

  const submit = async (decision: "approve" | "deny") => {
    setPending(decision);
    setError(null);
    try {
      const response = await fetch("/api/oauth/consent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ authorizationId, decision, brandIds, scopes }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok || typeof body.redirectUrl !== "string") {
        throw new Error(body.error || "Não foi possível concluir a autorização.");
      }
      window.location.assign(body.redirectUrl);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível concluir a autorização.");
      setPending(null);
    }
  };

  const canApprove = brandIds.length > 0 && scopes.length > 0 && pending === null;

  return <div className="space-y-5">
    <div className={internalSurfaceSubtle}>
      <p className="text-sm text-text-muted">Aplicativo que pede acesso</p>
      <p className="mt-1 text-lg font-semibold">{client.name}</p>
      {client.uri ? <p className="mt-1 break-all text-sm text-text-muted">{client.uri}</p> : null}
      <p className="mt-3 text-sm text-text-muted">Após aprovar, você volta para <span className="break-all font-medium text-foreground">{redirectUri}</span>.</p>
      {userEmail ? <p className="mt-3 text-sm text-text-muted">Conta: <span className="font-medium text-foreground">{userEmail}</span></p> : null}
    </div>

    <fieldset className="space-y-2">
      <legend className="text-sm font-semibold">Marcas que este aplicativo pode operar na plataforma</legend>
      {brands.length ? brands.map((brand) => <label key={brand.brandId} className="flex cursor-pointer items-start gap-3 rounded-md border border-divider px-3 py-2 hover:bg-surface-subtle">
        <input type="checkbox" className={checkbox} checked={brandIds.includes(brand.brandId)} onChange={() => setBrandIds((current) => toggle(current, brand.brandId))} disabled={pending !== null} />
        <span className="text-sm font-medium">{brand.brandName}</span>
      </label>) : <p className={internalNoticeError}>Sua conta não tem Marca com acesso à plataforma em uma Agência ativa. Peça acesso à Agência antes de conectar um aplicativo.</p>}
    </fieldset>

    <fieldset className="space-y-2">
      <legend className="text-sm font-semibold">Permissões</legend>
      {WRITER_MCP_SCOPES.map((scope) => <label key={scope} className="flex cursor-pointer items-start gap-3 rounded-md border border-divider px-3 py-2 hover:bg-surface-subtle">
        <input type="checkbox" className={checkbox} checked={scopes.includes(scope)} onChange={() => setScopes((current) => toggle(current, scope))} disabled={pending !== null} />
        <span>
          <span className="block text-sm font-medium">{WRITER_MCP_SCOPE_LABELS[scope].title}</span>
          <span className="block text-sm leading-6 text-text-muted">{WRITER_MCP_SCOPE_LABELS[scope].description}</span>
        </span>
      </label>)}
    </fieldset>

    <p className="flex items-start gap-2 text-sm leading-6 text-text-muted"><ShieldCheck className="mt-1 h-4 w-4 shrink-0 text-context-accent" aria-hidden="true" />Decisões só podem ser delegadas com a permissão opcional “Delegar decisões aceitas no chat”; cada ação exige prévia e o aceite específico que você escreveu. Publicação e exclusão seguem fora do MCP. Você pode revogar este acesso em Conta → Conexões de IA.</p>

    {error ? <p role="alert" className={internalNoticeError}>{error}</p> : null}

    <div className="flex flex-wrap gap-3">
      <button type="button" className={internalButtonPrimary} disabled={!canApprove} onClick={() => void submit("approve")}>
        {pending === "approve" ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
        Aprovar acesso
      </button>
      <button type="button" className={internalButton} disabled={pending !== null} onClick={() => void submit("deny")}>
        {pending === "deny" ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
        Recusar
      </button>
    </div>
  </div>;
}
