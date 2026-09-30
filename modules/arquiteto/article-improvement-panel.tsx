"use client";
import { useEffect, useRef, useState } from "react";
import { InfoHint } from "@/components/info-hint";
import { OperationProgress } from "./operation-progress";
import { ARTICLE_IMPROVEMENT_LABEL, IMPROVEMENT_AI_LABEL, IMPROVEMENT_LIST_CORE_LABEL, isListReading } from "@/lib/arquiteto/article-improvement";
import { ARTICLES_NEW_ANCHOR, ARTICLES_SOBRAS_ANCHOR, improvementApplyLabel, improvementValidateLabel, resolveImprovementNextStep } from "@/lib/arquiteto/article-improvement-next-step";
import type { ImprovementRun } from "@/lib/server/arquiteto-article-improvement";

const statuses = { ready: "Pronto para aplicar", adequate: "Já adequado", insufficient_evidence: "Evidência insuficiente", no_alternative: "Sem alternativa compatível" };
const outcomes = { improved: "Melhoria gravada", dna_created: "DNA criado", unchanged: "Sem mudança material", insufficient_evidence: "Evidência insuficiente", failed: "Falha recuperável" };
const statusOrder = { ready: 0, no_alternative: 1, insufficient_evidence: 2, adequate: 3 };
const number = (value: number) => value.toLocaleString("pt-BR");
type Proposal = ImprovementRun["proposals"][number];
/** De onde veio a mudança, na ordem do prepare: pares da SERP → leitura da IA → busca nova. */
function originOf(p: Proposal, run: ImprovementRun): string | null {
  if (p.evidenceBasis === "editorial_ai") return IMPROVEMENT_AI_LABEL;
  if (p.evidenceBasis === "list_core") return IMPROVEMENT_LIST_CORE_LABEL;
  if (p.addIds.some(id => run.keywords.find(k => k.id === id)?.external)) return "Busca nova no Google Ads";
  if (p.evidenceBasis === "serp") return "Pares da SERP";
  if (p.evidenceBasis === "editorial_and_candidate_serp") return "SERP da candidata";
  return null;
}

type Activity = { action: "prepare" | "collect" | "apply" | "status"; startedAt: number };
const ACTIVITY_LABELS: Record<Activity["action"], string> = {
  prepare: "Buscando keywords (Google Ads e leitura da IA)",
  collect: "Validando no Google",
  apply: "Gravando as melhorias",
  status: "Lendo o andamento",
};
/**
 * Progresso de toda etapa longa do painel, no padrão da plataforma: texto,
 * contador e barra. Com total conhecido, a barra enche; sem total, ela pulsa
 * e o tempo decorrido mostra que está andando.
 */
export function ImprovementProgress({ activity, now, done, total, unit }: { activity: Activity; now: number; done: number | null; total: number | null; unit: string }) {
  // O mesmo componente de progresso das outras etapas longas do Arquiteto.
  return <OperationProgress label={ACTIVITY_LABELS[activity.action]} startedAt={activity.startedAt} now={now} done={done} total={total} unit={unit}
    note="o andamento fica guardado no servidor" testId="architect-improvement-progress" />;
}

function ArticleImprovementSession({ brandId, onApplied, buttonClassName, primaryButtonClassName, hasLeftovers = false }: {
  brandId: string | null; onApplied: () => void; buttonClassName: string; primaryButtonClassName: string;
  /** A aba mostra Sobras agora: sem elas, o cartão não manda para um lugar vazio. */
  hasLeftovers?: boolean;
}) {
  const mounted = useRef(false);
  const [leaseActive, setLeaseActive] = useState(false);
  const [run, setRun] = useState<ImprovementRun | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false), [error, setError] = useState<string | null>(null);
  const [activity, setActivity] = useState<Activity | null>(null);
  const [now, setNow] = useState(() => Date.now());
  // O relógio só anda enquanto há etapa em curso: o contador de tempo mostra que está processando.
  useEffect(() => {
    if (!activity) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [activity]);
  const [confirm, setConfirm] = useState<"apply" | "collect" | null>(null);
  const confirmRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => { if (confirm) confirmRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" }); }, [confirm]);
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
    // The platform answers a timeout with an HTML page, not JSON.
    const body = await response.json().catch(() => { throw new Error("TEMPO_ESGOTADO"); });
    if (!response.ok || !body.success) throw new Error(body.error ?? "Etapa não confirmada.");
    if (!mounted.current || body.data.brandId !== brandId) throw new Error("A marca ativa mudou; consulte o andamento na marca de origem.");
    setRun(body.data); setLeaseActive(Boolean(body.data.leaseUntil && Date.parse(body.data.leaseUntil) > Date.now())); return body.data as ImprovementRun;
  }
  async function execute(action: "prepare" | "collect" | "apply" | "status") {
    setBusy(true); setError(null); setConfirm(null);
    const startedAt = Date.now();
    setActivity({ action, startedAt }); setNow(startedAt);
    try {
      let current = await send(action);
      if (action === "apply") {
        // One editorial acceptance; these requests resume the persisted accepted
        // batch, rather than asking the human to approve each internal step.
        // Um artigo por chamada. Tempo esgotado ou vez ocupada no servidor não param a gravação:
        // o andamento está salvo, então a tela lê o estado e segue.
        let tentativas = 0;
        while (mounted.current && current.state === "applying") {
          try {
            if (current.leaseUntil && Date.parse(current.leaseUntil) > Date.now()) {
              await new Promise(resolve => setTimeout(resolve, 3000));
              current = await send("status", current);
            } else current = await send("apply", current);
            tentativas = 0;
          } catch (e) {
            if (++tentativas > 3) throw e;
            await new Promise(resolve => setTimeout(resolve, 2000));
            current = await send("status", current);
          }
        }
        if (mounted.current) onApplied();
      } else if (action === "collect") {
        // The server works in bounded steps; keep calling until it leaves "collecting".
        // Progress is saved on the server after every group: a timed-out step just continues.
        let timeouts = 0;
        while (mounted.current && current.state === "collecting") {
          try { current = await send("collect", current); timeouts = 0; }
          catch (e) {
            if (!(e instanceof Error && e.message === "TEMPO_ESGOTADO") || ++timeouts > 3) throw e;
            current = await send("status", current);
          }
        }
        if (mounted.current) setSelected(new Set(current.proposals.filter(p => p.status === "ready").map(p => p.targetId)));
      } else if (action === "prepare") setSelected(new Set(current.proposals.filter(p => p.status === "ready").map(p => p.targetId)));
    } catch (e) {
      if (mounted.current) setError(e instanceof Error && e.message === "TEMPO_ESGOTADO" ? "O servidor demorou demais nesta etapa. O que foi feito ficou salvo: toque de novo no mesmo botão para continuar." : e instanceof Error ? e.message : "Falha na execução.");
    }
    finally { if (mounted.current) { setBusy(false); setActivity(null); } }
  }
  const keyword = (id: string | null) => run?.keywords.find(k => k.id === id);
  const label = (id: string | null) => { const k = keyword(id); return k ? `${k.keyword} · ${k.volumeValidated ? `volume ${number(k.volume ?? 0)}` : "sem volume"}` : "Nenhuma"; };
  const totals = (ids: readonly string[]) => ({ count: ids.length, volume: ids.reduce((sum, id) => { const k = keyword(id); return sum + (k?.volumeValidated ? k.volume ?? 0 : 0); }, 0) });
  const proposals = run ? [...run.proposals].sort((a, b) => statusOrder[a.status] - statusOrder[b.status]) : [];
  const ready = proposals.filter(p => p.status === "ready").length;
  // Only lines that can change (or already have an outcome) stay in the table.
  // A linha que ainda precisa validar fica na tabela (caixa desabilitada), para o dono ver o que o passo 2 vai conferir.
  const actionable = run ? proposals.filter(p => p.status === "ready" || p.needsValidation || run.outcomes.some(o => o.targetId === p.targetId)) : [];
  const parked = run ? proposals.filter(p => !actionable.includes(p)) : [];
  const done = run?.state === "complete";
  const pendingApply = Boolean(run && !done && (selected.size > 0 || run.acceptedIds?.length));
  const collecting = run?.state === "collecting";
  const needsCost = Boolean(run && !collecting && run.costs.paidQueries > 0 && !run.acceptedIds);
  /*
   * PRÓXIMO PASSO: uma frase e um botão, no topo. O botão do cartão faz o
   * MESMO ato do botão equivalente da fileira, que então sai da fileira para
   * não aparecer duas vezes. Os demais atos continuam na fileira.
   */
  const next = resolveImprovementNextStep({
    hasRun: Boolean(run),
    state: run?.state ?? null,
    leaseActive,
    accepted: Boolean(run?.acceptedIds),
    paidQueries: run?.costs.paidQueries ?? 0,
    costMaxUsd: run?.costs.estimatedCostUsd.max ?? 0,
    selectedCount: selected.size,
    readyCount: ready,
    hasLeftovers,
    busy,
    collectProgress: run?.collect ? { done: run.collect.doneGroupIds.length, total: run.collect.totalGroups ?? null } : null,
    applyProgress: run?.acceptedIds?.length ? { done: run.outcomes.filter(o => run.acceptedIds!.includes(o.targetId)).length, total: run.acceptedIds.length } : null,
  });
  const nextDisabled = next.kind === "working" ? true
    : next.kind === "none" ? false
    : next.kind === "select" ? true
    : next.kind === "prepare" ? !brandId || busy || leaseActive
    : next.kind === "resume_apply" || next.kind === "apply" ? busy || leaseActive
    : busy;
  const runNext = () => {
    if (next.kind === "prepare") void execute("prepare");
    else if (next.kind === "resume_collect") void execute("collect");
    else if (next.kind === "resume_apply") void execute("apply");
    else if (next.kind === "refresh") void execute("status");
    else if (next.kind === "validate") setConfirm("collect");
    else if (next.kind === "apply") setConfirm("apply");
    // `none`: o mesmo destino de `next.anchorId` (Sobras se existem; senão, Artigos novos).
    else if (next.kind === "none") document.getElementById(hasLeftovers ? ARTICLES_SOBRAS_ANCHOR : ARTICLES_NEW_ANCHOR)?.scrollIntoView({ block: "start", behavior: "smooth" });
  };
  const inCard = (kind: typeof next.kind) => next.kind === kind;
  /** Contador de cada etapa: grupos validados, artigos gravados; a busca só tem tempo decorrido. */
  const progressOf = (current: Activity): { done: number | null; total: number | null; unit: string } => {
    if (current.action === "collect" && run?.collect) return { done: run.collect.doneGroupIds.length, total: run.collect.totalGroups ?? null, unit: "grupos validados" };
    if (current.action === "apply" && run?.acceptedIds?.length) return { done: run.outcomes.filter(o => run.acceptedIds!.includes(o.targetId)).length, total: run.acceptedIds.length, unit: "artigos gravados" };
    return { done: null, total: null, unit: "" };
  };
  return <section className="border-b border-divider bg-surface px-4 py-4 text-sm leading-6" aria-label={ARTICLE_IMPROVEMENT_LABEL} data-testid="architect-article-improvement">
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-module-accent/40 bg-module-accent/5 p-3" role="region" aria-label="Próximo passo" data-testid="architect-improvement-next-step" data-next-step={next.kind}>
      <div className="min-w-0">
        <p className="font-semibold text-foreground">Próximo passo</p>
        <p className="text-foreground">{next.sentence}</p>
        {busy && activity && <ImprovementProgress activity={activity} now={now} {...progressOf(activity)} />}
      </div>
      <button className={primaryButtonClassName} disabled={nextDisabled} title={next.kind === "select" ? "Marque ao menos uma linha na tabela abaixo." : undefined} onClick={runNext}>{next.button}</button>
    </div>
    {/* Os números (1 · 2 · 3) ficam só no cartão: na fileira, os outros atos
        aparecem sem número para não disputar com o próximo passo. */}
    <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
      <div className="min-w-0">
        <h3 className="flex items-center gap-1.5 font-semibold text-foreground" data-testid="architect-improvement-how">
          {ARTICLE_IMPROVEMENT_LABEL}
          <InfoHint title="Como funciona" description="1 · Buscar keywords com volume para cada publicado e Assunto (Google Ads grátis; a leitura da IA usa a Connection DeepSeek da marca): primeiro os pares da SERP que já estão no cache, depois a leitura da IA na lista da marca (confira o motivo de cada uma), depois a leitura da lista pelo código (keywords que são o núcleo do slug, com a palavra do próprio slug) e, só para quem ficar sem nada, busca nova no Google Ads. 2 · Validar no Google só as que têm volume (pago, com prévia). 3 · Gravar as melhorias que você marcar." />
        </h3>
        <p className="text-text-muted">URL, slug e canonical nunca mudam.</p>
      </div>
      <div className="flex flex-wrap gap-2">
        {collecting && !inCard("resume_collect") && <button className={buttonClassName} disabled={busy} onClick={() => void execute("collect")}>Continuar validação (sem custo novo)</button>}
        {!pendingApply && !collecting && !inCard("prepare") && <button className={buttonClassName} disabled={!brandId || busy || leaseActive} onClick={() => void execute("prepare")}>Buscar keywords (grátis)</button>}
        {pendingApply && !collecting && !inCard("resume_apply") && !inCard("apply") && <button className={buttonClassName} disabled={busy || leaseActive} onClick={() => run?.acceptedIds ? void execute("apply") : setConfirm("apply")}>{run?.acceptedIds ? "Continuar melhorias aceitas" : needsCost ? `Gravar sem validar (${selected.size})` : improvementApplyLabel(selected.size, false)}</button>}
        {pendingApply && !run?.acceptedIds && <button className={buttonClassName} disabled={busy || leaseActive} onClick={() => void execute("prepare")}>Buscar de novo</button>}
        {needsCost && !inCard("validate") && <button className={buttonClassName} disabled={busy} onClick={() => setConfirm("collect")}>{improvementValidateLabel(run?.costs.paidQueries ?? 0, run?.costs.estimatedCostUsd.max ?? 0, false)}</button>}
        {run && (leaseActive || run.state === "applying") && !inCard("refresh") && <button className={buttonClassName} disabled={busy} onClick={() => void execute("status")}>Atualizar</button>}
      </div>
    </div>
    {/* A confirmação abre logo abaixo dos botões: embaixo da tabela ela ficava fora da tela e o botão parecia não responder. */}
    {confirm && run && <div ref={confirmRef} className="mt-3 rounded-md border border-divider bg-surface-subtle p-3" role="region" aria-label="Confirmar prévia">
      {confirm === "apply"
        ? <><h4 className="font-semibold text-foreground">Confirmar estas melhorias</h4><p className="text-foreground">Você aceita as trocas de principal Livre, as keywords que entram e saem, as mudanças de Silo e a aprovação das keywords novas nos {selected.size} item(ns) marcado(s). O servidor faz o resto e relê o resultado. Principal travada e identidade publicada ficam como estão. Nada é publicado nem reescrito no site.</p></>
        : <><h4 className="font-semibold text-foreground">Plano de SERP · {run.costs.paidQueries} chamada(s)</h4><p className="text-foreground">Custo estimado: US$ {run.costs.estimatedCostUsd.min.toFixed(4)} a {run.costs.estimatedCostUsd.max.toFixed(4)}. Teto da execução: US$ 1. O que já foi pago é reaproveitado. Cancelar não impede aplicar o que já está pronto.</p><ul className="my-2 list-disc pl-5 text-text-muted">{run.costs.missingDetails.map((raw, i) => { const item = raw as { keyword?: string; lens?: string; reason?: string }; return <li key={i}>{item.keyword} · {item.lens} · {item.reason}</li>; })}</ul></>}
      <div className="mt-3 flex gap-2"><button className={buttonClassName} onClick={() => setConfirm(null)}>Cancelar</button><button className={primaryButtonClassName} onClick={() => void execute(confirm)}>{confirm === "apply" ? "Confirmar e aplicar" : "Autorizar este custo"}</button></div>
    </div>}
    {busy && <p role="status" className="sr-only">Processando; o andamento fica guardado no servidor.</p>}
    {error && <p role="alert" className="mt-2 text-warning">{error}</p>}
    {run && <>
      <p className="mt-3 font-medium text-foreground">{proposals.length} analisado(s): {ready} para melhorar · {run.outcomes.filter(o => o.status === "improved").length} melhoria(s) gravada(s){run.outcomes.some(o => o.status === "dna_created") ? ` · ${run.outcomes.filter(o => o.status === "dna_created").length} DNA(s) criado(s)` : ""}</p>
      {actionable.length === 0 && <p className="mt-2 text-text-muted">Nenhum publicado ou Assunto tem melhoria com volume e evidência agora. Veja o motivo de cada um abaixo.</p>}
      {actionable.length > 0 && <div className="mt-2 overflow-x-auto"><table className="w-full border-collapse text-left text-sm"><thead><tr className="border-b border-divider text-text-muted"><th className="p-2">Aplicar</th><th className="p-2">Publicado ou Assunto</th><th className="p-2">O que muda</th><th className="p-2">Resultado</th></tr></thead><tbody>
        {actionable.map(p => {
          const target = (run.targets ?? []).find(t => t.id === p.targetId);
          const before = totals(target?.memberIds ?? []), after = totals(p.memberIds);
          const result = run.outcomes.find(o => o.targetId === p.targetId);
          const changes = p.addIds.length > 0 || p.removeIds.length > 0 || (p.principalId && p.principalId !== p.currentPrimaryId);
          const origin = changes ? originOf(p, run) : null;
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
                {origin && <p className="text-text-muted" data-testid="architect-improvement-origin">Origem: {origin}</p>}
              </> : <p className="text-text-muted">Nada a mudar.</p>}
              {p.exclusions.length > 0 && <p className="text-text-muted">Não cobrir: {p.exclusions.join("; ")}</p>}
              {isListReading(p) && (p.aiReasons?.length ?? 0) > 0 && <div className="mt-1" data-testid="architect-improvement-ai-reading">
                <p className="font-medium text-foreground">{p.evidenceBasis === "list_core" ? IMPROVEMENT_LIST_CORE_LABEL : IMPROVEMENT_AI_LABEL}</p>
                <ul className="grid gap-0.5 text-text-muted">{p.aiReasons!.map(item => <li key={item.keywordId}><span className="text-keyword">{keyword(item.keywordId)?.keyword ?? item.keywordId}</span>: {item.reason}</li>)}</ul>
              </div>}
            </td>
            <td className="p-2 text-foreground">{result ? outcomes[result.status] : p.needsValidation ? "Precisa validar no Google (passo 2)" : statuses[p.status]}{result && <p className="text-text-muted">{result.message}</p>}
              {p.reasons.length > 0 && <details className="text-text-muted"><summary className="cursor-pointer">Por quê</summary><p>{p.angle ? `Enfoque: ${p.angle}. ` : ""}{p.reasons.join(" ")}</p></details>}
            </td>
          </tr>;
        })}
      </tbody></table></div>}
      {parked.length > 0 && <details className="mt-3 text-text-muted"><summary className="cursor-pointer font-medium text-foreground">{parked.length} sem melhoria possível agora (sem keyword do mesmo assunto com volume, ou já adequados)</summary>
        <ul className="mt-2 grid gap-1">{parked.map(p => <li key={p.targetId}><span className={p.kind === "published" ? "font-medium text-identity-published" : "font-medium text-keyword"}>{p.theme}</span> · {statuses[p.status]}{p.reasons.length > 0 ? ` · ${p.reasons[p.reasons.length - 1]}` : ""}
          {/* Sugestão da IA derrubada pela SERP: a origem e o motivo dela continuam à vista. */}
          {isListReading(p) && (p.aiReasons?.length ?? 0) > 0 && <span data-testid="architect-improvement-ai-parked"> · {p.evidenceBasis === "list_core" ? IMPROVEMENT_LIST_CORE_LABEL : IMPROVEMENT_AI_LABEL}: {p.aiReasons!.map(item => `${keyword(item.keywordId)?.keyword ?? item.keywordId} (${item.reason})`).join("; ")}</span>}
        </li>)}</ul>
      </details>}
      {(run.editorialAi?.rejected.length ?? 0) > 0 && <details className="mt-3 text-text-muted" data-testid="architect-improvement-ai-rejected"><summary className="cursor-pointer font-medium text-foreground">Sugestões da IA recusadas pelas regras ({run.editorialAi!.rejectedCount})</summary>
        <ul className="mt-2 grid gap-1">{run.editorialAi!.rejected.map((r, i) => <li key={i}><span className="text-keyword">{r.keyword ?? r.keywordId ?? "—"}</span> → {r.theme ?? (run.targets ?? []).find(t => t.id === r.targetId)?.theme ?? r.targetId ?? "—"}: {r.reason}</li>)}</ul>
        {run.editorialAi!.rejectedCount > run.editorialAi!.rejected.length && <p className="mt-1">Mostrando as primeiras {run.editorialAi!.rejected.length}.</p>}
      </details>}
      {run.costs.cacheUnavailable && <p className="mt-2 text-warning">Não deu para conferir o cache: a estimativa pode incluir consultas já pagas.</p>}
      {collecting && <p className="mt-2 text-warning">A validação ficou pela metade. O que já foi pago está no cache e não é cobrado de novo: toque em “Continuar” no Próximo passo.</p>}
      {[...new Set(run.notices)].map((notice, i) => <p className="mt-2 text-text-muted" key={`${i}:${notice}`}>{notice}</p>)}
    </>}
  </section>;
}

/** Remount tenant state instead of carrying the previous brand through effects. */
export function ArticleImprovementPanel(props: Parameters<typeof ArticleImprovementSession>[0]) {
  return <ArticleImprovementSession key={props.brandId ?? "no-brand"} {...props} />;
}
