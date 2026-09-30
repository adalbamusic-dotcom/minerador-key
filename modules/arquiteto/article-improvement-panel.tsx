"use client";
import { useEffect, useRef, useState } from "react";
import { ARTICLE_IMPROVEMENT_LABEL } from "@/lib/arquiteto/article-improvement";
import type { ImprovementRun } from "@/lib/server/arquiteto-article-improvement";

const statuses = { ready: "Pronto para aplicar", adequate: "Já adequado", insufficient_evidence: "Evidência insuficiente", no_alternative: "Sem alternativa compatível" };
const outcomes = { improved: "Melhoria gravada", dna_created: "DNA criado", unchanged: "Sem mudança material", insufficient_evidence: "Evidência insuficiente", failed: "Falha recuperável" };
const statusOrder = { ready: 0, no_alternative: 1, insufficient_evidence: 2, adequate: 3 };
const number = (value: number) => value.toLocaleString("pt-BR");

function ArticleImprovementSession({ brandId, onApplied, buttonClassName, primaryButtonClassName }: {
  brandId: string | null; onApplied: () => void; buttonClassName: string; primaryButtonClassName: string;
}) {
  const mounted = useRef(false);
  const [leaseActive, setLeaseActive] = useState(false);
  const [run, setRun] = useState<ImprovementRun | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false), [error, setError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<"apply" | "collect" | null>(null);
  useEffect(() => {
    let active = true;
    mounted.current = true;
    if (brandId) void fetch(`/api/arquiteto/article-improvement?brandId=${encodeURIComponent(brandId)}`).then(r => r.json()).then(body => {
      if (!active || !body.success || !body.data) return;
      const restored = body.data as ImprovementRun; setRun(restored);
      setLeaseActive(Boolean(restored.leaseUntil && Date.parse(restored.leaseUntil) > Date.now()));
      setSelected(new Set(restored.acceptedIds ?? restored.proposals.filter(p => p.status === "ready").map(p => p.targetId)));
    }).catch(() => { if (active) setError("Não foi possível ler a análise anterior. Toque em “Atualizar”."); });
    return () => { active = false; mounted.current = false; };
  }, [brandId]);
  async function send(action: "prepare" | "collect" | "apply" | "status", current = run): Promise<ImprovementRun> {
    const response = await fetch("/api/arquiteto/article-improvement", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ brandId, action,
      ...(action !== "prepare" ? { runId: current?.runId } : {}),
      ...(action === "collect" || action === "apply" ? { decisionHash: current?.decisionHash } : {}),
      ...(action === "collect" ? { authorizedCostUsd: current?.costs.estimatedCostUsd.max } : {}),
      ...(action === "apply" && !current?.acceptedIds ? { targetIds: [...selected], approveNewKeywords: true } : {}),
    }) });
    const body = await response.json();
    if (!response.ok || !body.success) throw new Error(body.error ?? "Etapa não confirmada.");
    if (!mounted.current || body.data.brandId !== brandId) throw new Error("A marca ativa mudou; consulte o andamento na marca de origem.");
    setRun(body.data); setLeaseActive(Boolean(body.data.leaseUntil && Date.parse(body.data.leaseUntil) > Date.now())); return body.data as ImprovementRun;
  }
  async function execute(action: "prepare" | "collect" | "apply" | "status") {
    setBusy(true); setError(null); setConfirm(null);
    try {
      let current = await send(action);
      if (action === "apply") {
        // One editorial acceptance; these requests resume the persisted accepted
        // batch, rather than asking the human to approve each internal step.
        while (mounted.current && current.state === "applying" && !current.leaseUntil) current = await send("apply", current);
        if (mounted.current) onApplied();
      } else if (action === "collect") {
        // The server works in bounded steps; keep calling until it leaves "collecting".
        while (mounted.current && current.state === "collecting") current = await send("collect", current);
        if (mounted.current) setSelected(new Set(current.proposals.filter(p => p.status === "ready").map(p => p.targetId)));
      } else if (action === "prepare") setSelected(new Set(current.proposals.filter(p => p.status === "ready").map(p => p.targetId)));
    } catch (e) { if (mounted.current) setError(e instanceof Error ? e.message : "Falha na execução."); }
    finally { if (mounted.current) setBusy(false); }
  }
  const keyword = (id: string | null) => run?.keywords.find(k => k.id === id);
  const label = (id: string | null) => { const k = keyword(id); return k ? `${k.keyword} · ${k.volumeValidated ? `volume ${number(k.volume ?? 0)}` : "sem volume"}` : "Nenhuma"; };
  const totals = (ids: readonly string[]) => ({ count: ids.length, volume: ids.reduce((sum, id) => { const k = keyword(id); return sum + (k?.volumeValidated ? k.volume ?? 0 : 0); }, 0) });
  const proposals = run ? [...run.proposals].sort((a, b) => statusOrder[a.status] - statusOrder[b.status]) : [];
  const ready = proposals.filter(p => p.status === "ready").length;
  const done = run?.state === "complete";
  const pendingApply = Boolean(run && !done && (selected.size > 0 || run.acceptedIds?.length));
  const collecting = run?.state === "collecting";
  const needsCost = Boolean(run && !collecting && run.costs.paidQueries > 0 && !run.acceptedIds);
  return <section className="border-b border-divider bg-surface px-4 py-4 text-sm leading-6" aria-label={ARTICLE_IMPROVEMENT_LABEL} data-testid="architect-article-improvement">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div className="min-w-0">
        <h3 className="font-semibold text-foreground">{ARTICLE_IMPROVEMENT_LABEL}</h3>
        <p className="text-text-muted">Uma análise para todos os publicados e Assuntos. Você revisa o que muda e confirma uma vez; URL, slug e canonical nunca mudam.</p>
      </div>
      <div className="flex flex-wrap gap-2">
        {collecting && <button className={primaryButtonClassName} disabled={busy} onClick={() => void execute("collect")}>Continuar coleta</button>}
        {!pendingApply && !collecting && <button className={primaryButtonClassName} disabled={!brandId || busy || leaseActive} onClick={() => void execute("prepare")}>Preparar melhorias</button>}
        {pendingApply && !collecting && <button className={primaryButtonClassName} disabled={busy || leaseActive} onClick={() => run?.acceptedIds ? void execute("apply") : setConfirm("apply")}>{run?.acceptedIds ? "Continuar melhorias aceitas" : `Aplicar melhorias (${selected.size})`}</button>}
        {pendingApply && !run?.acceptedIds && <button className={buttonClassName} disabled={busy || leaseActive} onClick={() => void execute("prepare")}>Refazer análise</button>}
        {needsCost && <button className={buttonClassName} disabled={busy} onClick={() => setConfirm("collect")}>Revisar custo da SERP</button>}
        {run && (leaseActive || run.state === "applying") && <button className={buttonClassName} disabled={busy} onClick={() => void execute("status")}>Atualizar</button>}
      </div>
    </div>
    {busy && <p role="status" className="mt-2 text-text-muted">Processando; o andamento fica guardado no servidor.</p>}
    {error && <p role="alert" className="mt-2 text-warning">{error}</p>}
    {run && <>
      <p className="mt-3 font-medium text-foreground">{proposals.length} analisado(s): {ready} para melhorar · {run.outcomes.filter(o => o.status === "improved").length} melhoria(s) gravada(s){run.outcomes.some(o => o.status === "dna_created") ? ` · ${run.outcomes.filter(o => o.status === "dna_created").length} DNA(s) criado(s)` : ""}</p>
      <div className="mt-2 overflow-x-auto"><table className="w-full border-collapse text-left text-sm"><thead><tr className="border-b border-divider text-text-muted"><th className="p-2">Aplicar</th><th className="p-2">Publicado ou Assunto</th><th className="p-2">O que muda</th><th className="p-2">Resultado</th></tr></thead><tbody>
        {proposals.map(p => {
          const target = (run.targets ?? []).find(t => t.id === p.targetId);
          const before = totals(target?.memberIds ?? []), after = totals(p.memberIds);
          const result = run.outcomes.find(o => o.targetId === p.targetId);
          const changes = p.addIds.length > 0 || p.removeIds.length > 0 || (p.principalId && p.principalId !== p.currentPrimaryId);
          return <tr key={p.targetId} className="border-b border-divider align-top">
            <td className="p-2"><input type="checkbox" aria-label={`Aplicar melhoria em ${p.theme}`} disabled={busy || Boolean(run.acceptedIds) || p.status !== "ready"} checked={selected.has(p.targetId)} onChange={e => setSelected(previous => { const next = new Set(previous); if (e.target.checked) next.add(p.targetId); else next.delete(p.targetId); return next; })} /></td>
            <td className="p-2"><span className={p.kind === "published" ? "font-medium text-identity-published" : "font-medium text-keyword"}>{p.theme}</span><p className="text-text-muted">{p.kind === "published" ? "Publicado" : "Assunto"}</p></td>
            <td className="p-2 text-foreground">
              {changes ? <>
                {p.principalId && p.principalId !== p.currentPrimaryId && <p>Principal: <span className="text-keyword">{label(p.currentPrimaryId)}</span> → <span className="text-keyword">{label(p.principalId)}</span></p>}
                {p.addIds.length > 0 && <p>Entram: {p.addIds.map(label).join("; ")}</p>}
                {p.removeIds.length > 0 && <p>Saem: {p.removeIds.map(label).join("; ")}</p>}
                {p.transfers.length > 0 && <p className="text-text-muted">{p.transfers.length} keyword(s) mudam de Silo para o do artigo.</p>}
                <p className="text-text-muted">{before.count} → {after.count} keywords · volume {number(before.volume)} → {number(after.volume)}</p>
              </> : <p className="text-text-muted">Nada a mudar.</p>}
              {p.exclusions.length > 0 && <p className="text-text-muted">Não cobrir: {p.exclusions.join("; ")}</p>}
            </td>
            <td className="p-2 text-foreground">{result ? outcomes[result.status] : statuses[p.status]}{result && <p className="text-text-muted">{result.message}</p>}
              {p.reasons.length > 0 && <details className="text-text-muted"><summary className="cursor-pointer">Por quê</summary><p>{p.angle ? `Enfoque: ${p.angle}. ` : ""}{p.reasons.join(" ")}</p></details>}
            </td>
          </tr>;
        })}
      </tbody></table></div>
      {run.costs.cacheUnavailable && <p className="mt-2 text-warning">Não deu para conferir o cache: a estimativa pode incluir consultas já pagas.</p>}
      {collecting && <p className="mt-2 text-warning">A coleta ficou pela metade. O que já foi pago está no cache e não é cobrado de novo: toque em “Continuar coleta”.</p>}
      {[...new Set(run.notices)].map((notice, i) => <p className="mt-2 text-text-muted" key={`${i}:${notice}`}>{notice}</p>)}
    </>}
    {confirm && run && <div className="mt-4 border-t border-divider pt-4" role="region" aria-label="Confirmar prévia">
      {confirm === "apply"
        ? <><h4 className="font-semibold text-foreground">Confirmar estas melhorias</h4><p className="text-foreground">Você aceita as trocas de principal Livre, as keywords que entram e saem, as mudanças de Silo e a aprovação das keywords novas nos {selected.size} item(ns) marcado(s). O servidor faz o resto e relê o resultado. Principal travada e identidade publicada ficam como estão. Nada é publicado nem reescrito no site.</p></>
        : <><h4 className="font-semibold text-foreground">Plano de SERP · {run.costs.paidQueries} chamada(s)</h4><p className="text-foreground">Custo estimado: US$ {run.costs.estimatedCostUsd.min.toFixed(4)} a {run.costs.estimatedCostUsd.max.toFixed(4)}. Teto da execução: US$ 1. O que já foi pago é reaproveitado. Cancelar não impede aplicar o que já está pronto.</p><ul className="my-2 list-disc pl-5 text-text-muted">{run.costs.missingDetails.map((raw, i) => { const item = raw as { keyword?: string; lens?: string; reason?: string }; return <li key={i}>{item.keyword} · {item.lens} · {item.reason}</li>; })}</ul></>}
      <div className="mt-3 flex gap-2"><button className={buttonClassName} onClick={() => setConfirm(null)}>Cancelar</button><button className={primaryButtonClassName} onClick={() => void execute(confirm)}>{confirm === "apply" ? "Confirmar e aplicar" : "Autorizar este custo"}</button></div>
    </div>}
  </section>;
}

/** Remount tenant state instead of carrying the previous brand through effects. */
export function ArticleImprovementPanel(props: Parameters<typeof ArticleImprovementSession>[0]) {
  return <ArticleImprovementSession key={props.brandId ?? "no-brand"} {...props} />;
}
