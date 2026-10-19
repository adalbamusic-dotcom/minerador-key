"use client";

import { useEffect, useMemo, useState } from "react";
import { useSupabaseSession } from "@/components/auth/supabase-session-context";
import { Check, FileText, Save } from "lucide-react";
import { internalButton, internalButtonPrimary, internalField } from "@/components/editorial/internal-page-visual";
import { useNoticeBridge } from "@/components/global-notice-center";
import { BrandDNASchema } from "@/lib/arquiteto/contracts";
import { createBrandDnaDraft, joinLines, splitLines } from "@/lib/marca/domain";
import type { BrandDnaDraft } from "@/lib/marca/contracts";
import { radarDefaultAuthorityLines, radarParseAuthorityLines } from "@/lib/radar/authority-sources-contract";

const field = `${internalField} leading-7`;
const button = internalButton;
const primaryButton = `${internalButtonPrimary} focus-visible:ring-2`;
const fallbackKey = (actorUserId: string, brandId: string) => `marca:${actorUserId}:${brandId}:brand-dna:draft`;

function emptyDraft(brandId: string, legacyGuidelines: string, niche: string) {
  return createBrandDnaDraft({ brandId, positioning: legacyGuidelines || niche || "" });
}

function StatusBadge({ mode, status }: { mode: "server" | "local_fallback"; status: string | null }) {
  const label = mode === "server" ? "Versão remota" : "Rascunho local";
  return <span className="inline-flex items-center gap-2 text-sm text-text-muted"><span className={`h-1.5 w-1.5 rounded-full ${mode === "server" ? "bg-context-accent" : "bg-divider"}`} aria-hidden="true"/>{label}{status ? ` · ${status}` : ""}</span>;
}

export function BrandDnaPanel({ brandId, legacyGuidelines, niche }: { brandId: string; legacyGuidelines: string; niche: string }) {
  const { actorUserId } = useSupabaseSession();
  const [draft, setDraft] = useState<BrandDnaDraft>(() => emptyDraft(brandId, legacyGuidelines, niche));
  const [versionId, setVersionId] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [mode, setMode] = useState<"server" | "local_fallback">("local_fallback");
  /* 2026-10-18 · todos os avisos no sino (regra do dono): o tom vai junto; a faixa no pé do painel saiu. */
  const [message, setMessage] = useState<{ type: "success" | "error" | "warning"; message: string } | null>(null);
  useNoticeBridge({ notice: message, module: "marca", area: "Identidade da marca", title: "Marca · Identidade", fallbackSeverity: "INFO" });
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!actorUserId) return;
    const localKey = fallbackKey(actorUserId, brandId);
    let cancelled = false;
    void fetch(`/api/marca/brand-dna?brandId=${encodeURIComponent(brandId)}`, { cache: "no-store" }).then(async response => {
      const body = await response.json().catch(() => ({}));
      if (cancelled) return;
      if (response.ok) {
        const latest = body.versions?.[0];
        if (latest) { setDraft(createBrandDnaDraft(latest.payload)); setVersionId(latest.versionId); setStatus(body.events?.filter((event: { versionId: string }) => event.versionId === latest.versionId).at(-1)?.status || null); setMessage(null); }
        else {
          const raw = window.localStorage.getItem(localKey);
          if (raw) { try { setDraft(createBrandDnaDraft(JSON.parse(raw))); setMessage({ type: "warning", message: "Nenhuma versão remota encontrada; o rascunho local foi preservado." }); } catch { setMessage({ type: "warning", message: "O rascunho local não pôde ser lido e foi mantido para auditoria." }); } }
        }
        setMode("server"); return;
      }
      const raw = window.localStorage.getItem(localKey);
      if (raw) { try { setDraft(createBrandDnaDraft(JSON.parse(raw))); setMessage({ type: "warning", message: "Rascunho local recuperado; persistência remota indisponível." }); } catch { setMessage({ type: "warning", message: "O rascunho local não pôde ser lido e foi mantido para auditoria." }); } }
      setMode("local_fallback");
    }).catch(() => { if (!cancelled) setMode("local_fallback"); });
    return () => { cancelled = true; };
  }, [actorUserId, brandId]);

  const update = (key: keyof BrandDnaDraft, value: string | string[]) => setDraft(current => ({ ...current, [key]: value }));
  const requiredMissing = useMemo(() => { const result = BrandDNASchema.safeParse(draft); return result.success ? [] : result.error.issues.map(issue => issue.path.join(".")); }, [draft]);

  const save = async () => {
    setMessage(null);
    if (requiredMissing.length) { setMessage({ type: "warning", message: "Preencha posicionamento, público, voz e objetivos antes de salvar." }); return; }
    setBusy(true);
    try {
      /* 2026-10-14 · as fontes de autoridade sem linha vazia (a edição guarda a linha em branco para o Enter funcionar). */
      const payload = draft.authoritySources ? { ...draft, authoritySources: draft.authoritySources.map(item => item.trim()).filter(Boolean) } : draft;
      const response = await fetch("/api/marca/brand-dna", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "save", brandId, payload }) });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) { if (body.code === "persistence_unavailable" && actorUserId) { window.localStorage.setItem(fallbackKey(actorUserId, brandId), JSON.stringify(draft)); setMode("local_fallback"); setMessage({ type: "warning", message: "Rascunho mantido localmente; nenhuma versão remota foi criada." }); return; } throw new Error(body.error || "Não foi possível salvar a identidade da marca."); }
      setVersionId(body.version.versionId); setStatus(body.status); setMode("server"); setMessage({ type: "success", message: "Nova versão salva como rascunho. A aprovação continua humana." });
    } catch (error) { setMessage({ type: "error", message: error instanceof Error ? error.message : "Não foi possível salvar a identidade da marca." }); }
    finally { setBusy(false); }
  };

  const approve = async () => {
    if (!versionId) { setMessage({ type: "warning", message: "Salve uma versão remota antes de aprovar." }); return; }
    setBusy(true); setMessage(null);
    try {
      const response = await fetch("/api/marca/brand-dna", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "approve", brandId, versionId }) });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || "Não foi possível aprovar a identidade da marca.");
      setStatus(body.status); setMode("server"); setMessage({ type: "success", message: "Identidade da marca aprovada por ação humana." });
    } catch (error) { setMessage({ type: "error", message: error instanceof Error ? error.message : "Não foi possível aprovar a identidade da marca." }); }
    finally { setBusy(false); }
  };

  /*
   * 2026-10-14 · FONTES DE AUTORIDADE (SDD do Silo interligado §16.2, Fase A). Dado da
   * Marca, editado aqui: os domínios que o Radar abre e confere como fonte externa
   * de autoridade. Vazio = a lista sugerida. Vale para o Radar depois de aprovar.
   */
  const fontesBrutas = draft.authoritySources || [];
  const fontes = fontesBrutas.map(item => item.trim()).filter(Boolean);
  const fontesLidas = radarParseAuthorityLines(fontes);
  const authorityField = <section className="border-t border-divider pt-8" aria-labelledby="brand-authority-title">
    <h3 id="brand-authority-title" className="text-base font-semibold text-foreground">Fontes de autoridade</h3>
    <p className="mt-1 max-w-3xl text-sm leading-6 text-text-muted">Domínios que o Radar abre e confere como fonte externa (órgãos de governo, conselhos, ciência, Wikipédia, documentação do Google). Um por linha; opcional: <code>| Nome da entidade</code>. Vazio, o Radar usa a lista sugerida. Vale depois de aprovar a versão.</p>
    <label className="mt-4 block"><span className="text-sm font-semibold text-foreground">Domínios ({fontes.length ? `${fontesLidas.entries.length} da marca` : "lista sugerida"})</span><textarea className={`${field} mt-2 font-mono`} rows={8} value={fontesBrutas.join("\n")} onChange={event => update("authoritySources", event.target.value.split(/\r?\n/))} placeholder={radarDefaultAuthorityLines().slice(0, 6).join("\n")}/></label>
    {fontesLidas.invalid.length > 0 && <p className="mt-2 text-sm leading-6 text-warning">Não são domínios e ficam de fora: {fontesLidas.invalid.join(" · ")}</p>}
    <div className="mt-3 flex flex-wrap gap-2"><button type="button" className={button} onClick={() => update("authoritySources", radarDefaultAuthorityLines())}>Usar a lista sugerida</button>{fontes.length > 0 && <button type="button" className={button} onClick={() => update("authoritySources", [])}>Limpar (volta à sugerida)</button>}</div>
  </section>;

  const listField = (key: keyof BrandDnaDraft, label: string, value: string[], description: string) => <label className="block"><span className="text-sm font-semibold text-foreground">{label}</span><span className="mt-1 block text-sm leading-6 text-text-muted">{description}</span><textarea className={`${field} mt-2`} rows={3} value={joinLines(value)} onChange={event => update(key, splitLines(event.target.value))} placeholder="Uma entrada por linha"/></label>;

  return <section className="space-y-8" aria-labelledby="brand-dna-title"><div className="flex flex-col gap-4 border-b border-divider pb-5 md:flex-row md:items-start md:justify-between"><div className="flex items-start gap-3"><FileText className="mt-0.5 h-5 w-5 shrink-0 text-text-muted" aria-hidden="true"/><div><h2 id="brand-dna-title" className="text-xl font-bold text-foreground">Identidade da marca</h2><p className="mt-2 max-w-2xl text-base leading-7 text-text-muted">Organize a identidade estratégica da marca. Rascunhos são versionados e aprovação continua sendo uma decisão humana.</p></div></div><div className="flex flex-wrap items-center gap-2"><StatusBadge mode={mode} status={status}/><button type="button" className={primaryButton} onClick={() => void save()} disabled={busy}><Save className="h-4 w-4" aria-hidden="true"/>{busy ? "Salvando…" : "Salvar versão"}</button><button type="button" className={`${button} border-success/50 bg-success-soft text-success hover:border-success hover:bg-success/20`} onClick={() => void approve()} disabled={busy || !versionId || status === "approved"}><Check className="h-4 w-4" aria-hidden="true"/>Aprovar</button></div></div><div className="space-y-8"><section className="border-t border-divider pt-8 first:border-t-0 first:pt-0"><h3 className="text-base font-semibold text-foreground">Posicionamento</h3><p className="mt-1 text-sm leading-6 text-text-muted">A ideia central que orienta a presença da marca.</p><label className="mt-4 block"><span className="text-sm font-semibold text-foreground">Posicionamento</span><textarea className={`${field} mt-2 min-h-40`} rows={4} value={draft.positioning} onChange={event => update("positioning", event.target.value)}/></label></section><section className="border-t border-divider pt-8"><h3 className="text-base font-semibold text-foreground">Identidade e público</h3><div className="mt-4 grid gap-5 md:grid-cols-2">{listField("audience", "Público", draft.audience, "Quem a marca atende e quer compreender melhor.")}{listField("voice", "Voz", draft.voice, "Como a marca deve se comunicar.")}</div></section><section className="border-t border-divider pt-8"><h3 className="text-base font-semibold text-foreground">Estratégia</h3><div className="mt-4 grid gap-5 md:grid-cols-2">{listField("businessObjectives", "Objetivos de negócio", draft.businessObjectives, "Resultados que orientam as prioridades da marca.")}{listField("differentiators", "Diferenciais", draft.differentiators, "Aspectos que distinguem a oferta.")}</div></section><section className="border-t border-divider pt-8"><h3 className="text-base font-semibold text-foreground">Princípios e limites</h3><div className="mt-4 grid gap-5 md:grid-cols-2">{listField("editorialPrinciples", "Princípios editoriais", draft.editorialPrinciples, "Critérios para manter consistência no conteúdo.")}{listField("prohibitedClaims", "Claims proibidos", draft.prohibitedClaims, "Afirmações que não devem aparecer.")}</div></section>{authorityField}</div></section>;
}
