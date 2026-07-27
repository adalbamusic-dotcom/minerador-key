"use client";

import { useEffect, useMemo, useState } from "react";
import { BrandDNASchema } from "@/lib/arquiteto/contracts";
import { createBrandDnaDraft, joinLines, splitLines } from "@/lib/marca/domain";
import type { BrandDnaDraft } from "@/lib/marca/contracts";

const field = "min-h-8 w-full rounded border border-slate-800 bg-black px-2 py-1.5 text-[11px] text-slate-200 outline-none focus:border-indigo-600";
const button = "inline-flex h-7 items-center rounded border border-indigo-900 bg-indigo-950/20 px-2.5 text-[10px] font-bold text-indigo-300 hover:bg-indigo-950/50 disabled:cursor-not-allowed disabled:opacity-40";
const fallbackKey = (brandId: string) => `marca:${brandId}:brand-dna:draft`;

function emptyDraft(brandId: string, legacyGuidelines: string, niche: string) {
  return createBrandDnaDraft({ brandId, positioning: legacyGuidelines || niche || "" });
}

export function BrandDnaPanel({ brandId, legacyGuidelines, niche }: { brandId: string; legacyGuidelines: string; niche: string }) {
  const [draft, setDraft] = useState<BrandDnaDraft>(() => emptyDraft(brandId, legacyGuidelines, niche));
  const [versionId, setVersionId] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [mode, setMode] = useState<"server" | "local_fallback">("local_fallback");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void fetch(`/api/marca/brand-dna?brandId=${encodeURIComponent(brandId)}`, { cache: "no-store" }).then(async response => {
      const body = await response.json().catch(() => ({}));
      if (cancelled) return;
      if (response.ok) {
        const latest = body.versions?.[0];
        if (latest) { setDraft(createBrandDnaDraft(latest.payload)); setVersionId(latest.versionId); setStatus(body.events?.filter((event: { versionId: string }) => event.versionId === latest.versionId).at(-1)?.status || null); setMessage(""); }
        else {
          const raw = window.localStorage.getItem(fallbackKey(brandId));
          if (raw) { try { setDraft(createBrandDnaDraft(JSON.parse(raw))); setMessage("Nenhuma versão remota encontrada; draft local preservado."); } catch { setMessage("Draft local inválido preservado para auditoria."); } }
        }
        setMode("server"); return;
      }
      const raw = window.localStorage.getItem(fallbackKey(brandId));
      if (raw) { try { setDraft(createBrandDnaDraft(JSON.parse(raw))); setMessage("Draft local recuperado; persistência remota indisponível."); } catch { setMessage("Draft local inválido preservado para auditoria."); } }
      setMode("local_fallback");
    }).catch(() => { if (!cancelled) setMode("local_fallback"); });
    return () => { cancelled = true; };
  }, [brandId]);

  const update = (key: keyof BrandDnaDraft, value: string | string[]) => setDraft(current => ({ ...current, [key]: value }));
  const requiredMissing = useMemo(() => { const result = BrandDNASchema.safeParse(draft); return result.success ? [] : result.error.issues.map(issue => issue.path.join(".")); }, [draft]);

  const save = async () => {
    setMessage("");
    if (requiredMissing.length) { setMessage("Preencha posicionamento, público, voz e objetivos antes de salvar."); return; }
    setBusy(true);
    try {
      const response = await fetch("/api/marca/brand-dna", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "save", brandId, payload: draft }) });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) { if (body.code === "persistence_unavailable") { window.localStorage.setItem(fallbackKey(brandId), JSON.stringify(draft)); setMode("local_fallback"); setMessage("Draft mantido localmente; nenhuma versão remota foi criada."); return; } throw new Error(body.error || "Não foi possível salvar o BrandDNA."); }
      setVersionId(body.version.versionId); setStatus(body.status); setMode("server"); setMessage("Nova versão salva como rascunho. A aprovação continua humana.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Não foi possível salvar o BrandDNA."); }
    finally { setBusy(false); }
  };

  const approve = async () => {
    if (!versionId) { setMessage("Salve uma versão remota antes de aprovar."); return; }
    setBusy(true); setMessage("");
    try {
      const response = await fetch("/api/marca/brand-dna", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "approve", brandId, versionId }) });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || "Não foi possível aprovar o BrandDNA.");
      setStatus(body.status); setMode("server"); setMessage("BrandDNA aprovado por ação humana.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Não foi possível aprovar o BrandDNA."); }
    finally { setBusy(false); }
  };

  const listField = (key: keyof BrandDnaDraft, label: string, value: string[]) => <label className="block"><span className="text-[9px] font-bold text-slate-500">{label}</span><textarea className={`${field} mt-1`} rows={3} value={joinLines(value)} onChange={event => update(key, splitLines(event.target.value))} placeholder="Uma entrada por linha"/></label>;
  return <section className="rounded-lg border border-slate-900 bg-[#0b0c10] p-4"><div className="flex flex-wrap items-center justify-between gap-2"><div><h2 className="text-xs font-bold">BrandDNA estruturado</h2><p className="mt-1 text-[10px] text-slate-500">Versões imutáveis; draft não é aprovação.</p></div><div className="flex items-center gap-1"><span className="text-[9px] text-slate-500">{mode === "server" ? "persistência: servidor" : "persistência: fallback local"}{status ? ` · ${status}` : ""}</span><button className={button} onClick={() => void save()} disabled={busy}>{busy ? "Salvando…" : "Salvar versão"}</button><button className={button} onClick={() => void approve()} disabled={busy || !versionId || status === "approved"}>Aprovar</button></div></div><div className="mt-3 grid gap-2 md:grid-cols-2"><label className="block md:col-span-2"><span className="text-[9px] font-bold text-slate-500">Posicionamento</span><textarea className={`${field} mt-1`} rows={3} value={draft.positioning} onChange={event => update("positioning", event.target.value)}/></label>{listField("audience", "Público", draft.audience)}{listField("voice", "Voz", draft.voice)}{listField("businessObjectives", "Objetivos de negócio", draft.businessObjectives)}{listField("differentiators", "Diferenciais", draft.differentiators)}{listField("prohibitedClaims", "Claims proibidos", draft.prohibitedClaims)}{listField("editorialPrinciples", "Princípios editoriais", draft.editorialPrinciples)}</div>{message && <p className="mt-3 rounded border border-amber-900/40 bg-amber-950/20 p-2 text-[10px] text-amber-300">{message}</p>}</section>;
}
