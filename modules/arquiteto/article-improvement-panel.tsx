"use client";
import { useEffect, useRef, useState } from "react";
import { OperationProgress } from "./operation-progress";
import { ARTICLE_IMPROVEMENT_LABEL, IMPROVEMENT_AI_LABEL, IMPROVEMENT_LIST_CORE_LABEL, isListReading } from "@/lib/arquiteto/article-improvement";
import { humanizeOperationMessage, resolveImprovementNextStep } from "@/lib/arquiteto/article-improvement-next-step";
import type { ImprovementRun } from "@/lib/server/arquiteto-article-improvement";
import { knownBeforeSearchAuthorizeLabel } from "@/lib/editorial/known-before-search";
import { REWORK_OVERRIDE_REASON_MIN } from "@/lib/editorial/rework-guard";
import { IMPROVEMENT_NEEDS_MINERADOR_LABEL, improvementNewKeywordsPreview } from "@/lib/arquiteto/article-improvement-minerador";
import { isEditorialGroupColor } from "@/lib/editorial/editorial-groups";
import { ARCHITECT_SUGGESTIONS_LABEL, mineradorHandoffHref } from "@/lib/arquiteto/minerador-suggestions";

/*
 * "MELHORAR PUBLICADOS…" — O REFAZEDOR (dono, 17/10, literal: "o último botão era isso para melhorar publicados ou
 * artigos que tinham falhado, para arrumar os detalhes de refinamento… era como o botão milagroso do refazedor,
 * aquele que refazia tudo para salvar o artigo errado").
 *
 * É o MESMO motor de sempre (`/api/arquiteto/article-improvement`: prepare → collect → apply, com a guarda de
 * retrabalho e o "refazer com motivo"). 2026-10-17 (noite) · SUBSTITUÍDOS: o cartão "Próximo passo", os botões
 * soltos "Buscar keywords (grátis)/da cor…", "Buscar keywords novas no Google Ads (N)", "Coletar a SERP no
 * DataForSEO…", "Gravar sem validar", "Buscar de novo", "Retomar esta análise", "Atualizar", "Continuar…" e o
 * "Refazer mesmo assim" solto (dono: "tem 7 botões totalmente inúteis"). Agora:
 *  - abrir o painel (o botão da barra, que abre e fecha) LÊ sozinho: os publicados e artigos marcados (sem marcação,
 *    todos do recorte), a lista da marca, a SERP em cache e a busca nova no Google Ads (grátis, cota); a coleta ou
 *    a gravação já autorizadas continuam sozinhas;
 *  - a prévia tem só "Cancelar" e "Confirmar", e o Confirmar faz o passo que falta: ler o que custa (IA, medição),
 *    coletar a SERP no DataForSEO (custo antes) ou gravar; o refazer (mesmos insumos) pede o motivo DENTRO da prévia;
 *  - saíram os textos fixos sem ação ("URL, slug e canonical nunca mudam", "Esta análise leu só o grupo…", "Sem
 *    publicado marcado…", "N analisado(s)…", "Nenhum publicado ou Assunto tem melhoria…", "N sem melhoria possível
 *    agora…", "Já temos · Falta · Custa"). Fica o custo antes de pagar, o que muda em cada artigo e os erros.
 */

const statuses = { ready: "Pronto para aplicar", adequate: "Já adequado", insufficient_evidence: "Evidência insuficiente", no_alternative: "Sem alternativa compatível" };
const outcomes = { improved: "Melhoria gravada", dna_created: "DNA criado", unchanged: "Sem mudança material", insufficient_evidence: "Evidência insuficiente", failed: "Falha recuperável" };
const statusOrder = { ready: 0, no_alternative: 1, insufficient_evidence: 2, adequate: 3 };
const number = (value: number) => value.toLocaleString("pt-BR");
const usd = (value: number) => `US$ ${value.toFixed(3).replace(".", ",")}`;
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
/** Avisos que só repetem o que a prévia já mostra (2026-10-17, noite: "dados que não aportam em nada"). */
const NOTICES_WITHOUT_ACTION = [/não roda sozinha|ainda não rodou nesta leitura/, /^Mesmos alvos e mesma lista/, /já existem no Minerador: usei o que ele já sabe/, /já foi feita com estes mesmos insumos/, /^Leitura da IA desligada/];

type Activity = { action: "prepare" | "collect" | "apply" | "status"; startedAt: number };
const ACTIVITY_LABELS: Record<Activity["action"], string> = {
  prepare: "Lendo os artigos e buscando o reforço (lista da marca, SERP em cache e Google Ads, grátis)",
  collect: "Coletando a SERP no DataForSEO (pago, com o seu aceite)",
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

type SendOptions = { reworkReason?: string; group?: string; authorizeReading?: { ai?: boolean; measure?: boolean }; approveNewKeywords?: boolean };

function ArticleImprovementSession({ brandId, brandRef = null, onApplied, onClose, buttonClassName, primaryButtonClassName, selectedTargetIds = [], activeGroup = null }: {
  brandId: string | null; onApplied: () => void; buttonClassName: string; primaryButtonClassName: string;
  /** O "Cancelar" da prévia fecha o refazedor (o mesmo efeito do botão da barra). */
  onClose?: () => void;
  /** A rota da marca, para o link "Sugestões do Arquiteto" no Minerador (o Arquiteto nunca grava lá). */
  brandRef?: string | null;
  /** A cor ativa da etiqueta: a leitura é recortada pelo grupo. */
  activeGroup?: { requested: string; label: string } | null;
  /** Os publicados e artigos marcados na tabela: a leitura refaz só eles (sem marcação, todos do recorte). */
  selectedTargetIds?: readonly string[];
}) {
  const mounted = useRef(false);
  const [leaseActive, setLeaseActive] = useState(false);
  const [run, setRun] = useState<ImprovementRun | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false), [error, setError] = useState<string | null>(null);
  const [activity, setActivity] = useState<Activity | null>(null);
  const [now, setNow] = useState(() => Date.now());
  /** O motivo do "refazer" (mesmos insumos), dito dentro da prévia. */
  const [motivo, setMotivo] = useState("");
  /** Gravar só as prontas agora, sem coletar a SERP (a opção que era o "Gravar sem validar"). */
  const [semColeta, setSemColeta] = useState(false);
  // O relógio só anda enquanto há etapa em curso: o contador de tempo mostra que está processando.
  useEffect(() => {
    if (!activity) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [activity]);
  const recorte = activeGroup ? { group: activeGroup.requested } : {};
  async function send(action: "prepare" | "collect" | "apply" | "status", current: ImprovementRun | null, options: SendOptions = {}): Promise<ImprovementRun> {
    const response = await fetch("/api/arquiteto/article-improvement", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ brandId, action,
      ...(action !== "prepare" ? { runId: current?.runId } : {}),
      ...(action === "collect" || action === "apply" ? { decisionHash: current?.decisionHash } : {}),
      ...(action === "collect" ? { authorizedCostUsd: current?.costs.estimatedCostUsd.max } : {}),
      ...(action === "apply" && !current?.acceptedIds ? { targetIds: [...selected] } : {}),
      // 2026-10-17 · keyword NOVA na mesma confirmação: só quando a prévia mostrou, por artigo, as novas com volume e fonte.
      ...(action === "apply" && !current?.acceptedIds && options.approveNewKeywords ? { approveNewKeywords: true } : {}),
      ...(action === "prepare" && selectedTargetIds.length ? { targetIds: [...selectedTargetIds] } : {}),
      // 2026-10-17 (noite) · a busca nova no Google Ads (grátis, cota) é um passo da leitura, não um botão à parte.
      ...(action === "prepare" ? { discover: true } : {}),
      // F5 — refazer com os mesmos insumos (D11), só com o motivo dito dentro da prévia.
      ...(action === "prepare" && options.reworkReason ? { reworkOverride: { reason: options.reworkReason } } : {}),
      ...(action === "prepare" && options.group ? { group: options.group } : {}),
      // F3 · ler antes de buscar: IA e medição só com a autorização dada depois de ver o custo.
      ...(action === "prepare" && options.authorizeReading ? { authorizeReading: options.authorizeReading } : {}),
    }) });
    // The platform answers a timeout with an HTML page, not JSON.
    const body = await response.json().catch(() => { throw new Error("TEMPO_ESGOTADO"); });
    if (!response.ok || !body.success) throw new Error(body.error ?? "Etapa não confirmada.");
    if (!mounted.current || body.data.brandId !== brandId) throw new Error("A marca ativa mudou; consulte o andamento na marca de origem.");
    setRun(body.data); setLeaseActive(Boolean(body.data.leaseUntil && Date.parse(body.data.leaseUntil) > Date.now())); return body.data as ImprovementRun;
  }
  async function execute(action: "prepare" | "collect" | "apply" | "status", options: SendOptions = {}, from: ImprovementRun | null = run) {
    setBusy(true); setError(null);
    const startedAt = Date.now();
    setActivity({ action, startedAt }); setNow(startedAt);
    try {
      let current = await send(action, from, options);
      if (action === "apply") {
        // One editorial acceptance; these requests resume the persisted accepted batch.
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
      // 2026-10-14 · o código técnico (REWORK_SAME_REFUSAL…) nunca aparece cru: vira a frase humana.
      if (mounted.current) setError(e instanceof Error ? humanizeOperationMessage(e.message) : "Falha na execução.");
    }
    finally { if (mounted.current) { setBusy(false); setActivity(null); } }
  }
  /*
   * ABRIR = LER (2026-10-17, noite). A coleta ou a gravação que você JÁ autorizou continuam sozinhas (sem novo
   * aceite); senão, uma leitura nova, grátis (o que já foi lido e pago é reaproveitado pelo servidor).
   */
  useEffect(() => {
    let active = true;
    mounted.current = true;
    if (brandId) void (async () => {
      let restored: ImprovementRun | null = null;
      try { const body = await (await fetch(`/api/arquiteto/article-improvement?brandId=${encodeURIComponent(brandId)}`)).json(); restored = body?.success ? body.data as ImprovementRun | null : null; }
      catch { restored = null; }
      if (!active) return;
      if (restored && restored.origin !== "plan_sheet" && (restored.state === "collecting" || (restored.state === "applying" && restored.acceptedIds?.length))) {
        setRun(restored); setSelected(new Set(restored.acceptedIds ?? []));
        void execute(restored.state === "collecting" ? "collect" : "apply", {}, restored);
        return;
      }
      void execute("prepare", recorte, null);
    })();
    return () => { active = false; mounted.current = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- abrir o painel lê uma vez por marca (a remontagem por marca zera tudo).
  }, [brandId]);

  const keyword = (id: string | null) => run?.keywords.find(k => k.id === id);
  // 2026-10-17 · a keyword NOVA na marca vem marcada: ela entra no Minerador e no artigo na confirmação.
  const label = (id: string | null) => { const k = keyword(id); return k ? `${k.keyword} · ${k.volumeValidated ? `volume ${number(k.volume ?? 0)}` : "sem volume"}${k.external && !k.knownInMinerador ? " · nova" : ""}` : "Nenhuma"; };
  const totals = (ids: readonly string[]) => ({ count: ids.length, volume: ids.reduce((sum, id) => { const k = keyword(id); return sum + (k?.volumeValidated ? k.volume ?? 0 : 0); }, 0) });
  const proposals = run ? [...run.proposals].sort((a, b) => statusOrder[a.status] - statusOrder[b.status]) : [];
  const ready = proposals.filter(p => p.status === "ready").length;
  // Só as linhas que podem mudar (ou já têm desfecho) ficam na tabela: a que precisa da SERP e a que precisa do Minerador ficam à vista, sem caixa.
  const actionable = run ? proposals.filter(p => p.status === "ready" || p.needsValidation || p.needsMinerador || run.outcomes.some(o => o.targetId === p.targetId)) : [];
  const precisamDoMinerador = run ? proposals.filter(p => p.needsMinerador).length : 0;
  const corDasSugestoes = run?.groupScope && isEditorialGroupColor(run.groupScope.requested) ? run.groupScope.requested : activeGroup && isEditorialGroupColor(activeGroup.requested) ? activeGroup.requested : null;
  const sugestoesHref = brandRef ? mineradorHandoffHref(brandRef, { action: "sugestoes", color: corDasSugestoes }) : null;
  const collecting = run?.state === "collecting";
  const leitura = run?.reading ?? null;
  const rotuloLeitura = leitura ? knownBeforeSearchAuthorizeLabel(leitura) : null;
  const leituraPaga = leitura && rotuloLeitura && !collecting && !run?.acceptedIds && run?.state === "prepared" ? { button: rotuloLeitura, sentence: `${leitura.sentences.missing} ${leitura.sentences.cost}` } : null;
  const autorizacaoDaLeitura = leitura ? { ai: leitura.plan.ai.calls > 0, measure: leitura.plan.googleAds.keywords > 0 } : {};
  const next = resolveImprovementNextStep({
    hasRun: Boolean(run), state: run?.state ?? null, leaseActive, accepted: Boolean(run?.acceptedIds),
    paidQueries: run?.costs.paidQueries ?? 0, optionalPaidQueries: run?.costs.optionalPaidQueries ?? 0, costMaxUsd: run?.costs.estimatedCostUsd.max ?? 0,
    selectedCount: selected.size, readyCount: ready, busy, paidReading: leituraPaga,
  });
  // O refazer: o servidor reaproveitou a leitura com os mesmos insumos; chamar de novo o que custa só com o motivo.
  const podeRefazer = Boolean(run?.rework?.canOverride) && run?.state === "prepared" && !run?.acceptedIds;
  const refazer = podeRefazer && motivo.trim().length >= REWORK_OVERRIDE_REASON_MIN;
  const gravarSemColeta = next.kind === "validate" && semColeta && selected.size > 0;
  const passo = refazer ? "rework" as const : gravarSemColeta ? "apply" as const : next.kind === "read_paid" || next.kind === "validate" || next.kind === "apply" || next.kind === "select" ? next.kind : null;
  const previaAberta = Boolean(run) && !busy && run?.state === "prepared" && !run?.acceptedIds && (passo !== null || podeRefazer);
  const novasDaConfirmacao = run ? improvementNewKeywordsPreview(run, run.acceptedIds ?? selected) : null;
  const pagas = run ? Math.max(0, run.costs.paidQueries - Math.max(0, run.costs.optionalPaidQueries ?? 0)) : 0;
  const rotuloConfirmar = passo === "rework" ? "Refazer com o motivo dito"
    : passo === "read_paid" ? leituraPaga?.button ?? "Autorizar e ler"
    : passo === "validate" ? `Autorizar ${pagas} consulta(s) e coletar a SERP (até ${usd(run?.costs.estimatedCostUsd.max ?? 0)})`
    : passo === "apply" ? novasDaConfirmacao?.total ? `Confirmar e gravar (com ${novasDaConfirmacao.total} keyword(s) nova(s))` : `Confirmar e gravar (${selected.size})`
    : passo === "select" ? "Marque ao menos uma linha" : "Diga o motivo para refazer";
  const recorteDaExecucao = run?.groupScope ? { group: run.groupScope.requested } : recorte;
  const confirmar = () => {
    if (passo === "rework") { const dito = motivo.trim(); setMotivo(""); void execute("prepare", { ...recorteDaExecucao, reworkReason: dito }); }
    else if (passo === "read_paid") void execute("prepare", { ...recorteDaExecucao, authorizeReading: autorizacaoDaLeitura });
    else if (passo === "validate") void execute("collect");
    else if (passo === "apply") void execute("apply", novasDaConfirmacao?.total ? { approveNewKeywords: true } : {});
  };
  const progressOf = (current: Activity): { done: number | null; total: number | null; unit: string } => {
    if (current.action === "collect" && run?.collect) return { done: run.collect.doneGroupIds.length, total: run.collect.totalGroups ?? null, unit: "grupos validados" };
    if (current.action === "apply" && run?.acceptedIds?.length) return { done: run.outcomes.filter(o => run.acceptedIds!.includes(o.targetId)).length, total: run.acceptedIds.length, unit: "artigos gravados" };
    return { done: null, total: null, unit: "" };
  };
  const tabela = actionable.length > 0 && run ? <div className="mt-2 overflow-x-auto"><table className="w-full border-collapse text-left text-sm"><thead><tr className="border-b border-divider text-text-muted"><th className="p-2">Aplicar</th><th className="p-2">Publicado ou artigo</th><th className="p-2">O que muda</th><th className="p-2">Resultado</th></tr></thead><tbody>
    {actionable.map(p => {
      const target = (run.targets ?? []).find(t => t.id === p.targetId);
      const before = totals(target?.memberIds ?? []), after = totals(p.memberIds);
      const result = run.outcomes.find(o => o.targetId === p.targetId);
      const changes = p.addIds.length > 0 || p.removeIds.length > 0 || (p.principalId && p.principalId !== p.currentPrimaryId);
      const origin = changes ? originOf(p, run) : null;
      return <tr key={p.targetId} className="border-b border-divider align-top">
        <td className="p-2"><input type="checkbox" aria-label={`Aplicar melhoria em ${p.theme}`} disabled={busy || Boolean(run.acceptedIds) || p.status !== "ready"} checked={selected.has(p.targetId)} onChange={e => setSelected(previous => { const nextSet = new Set(previous); if (e.target.checked) nextSet.add(p.targetId); else nextSet.delete(p.targetId); return nextSet; })} /></td>
        <td className="p-2"><span className={p.kind === "published" ? "font-medium text-identity-published" : "font-medium text-keyword"}>{p.theme}</span><p className="text-text-muted">{p.kind === "published" ? "Publicado" : "Artigo"}</p></td>
        <td className="p-2 text-foreground">
          {changes ? <>
            {p.principalId && p.principalId !== p.currentPrimaryId && <p>Principal: <span className="text-keyword">{label(p.currentPrimaryId)}</span> → <span className="text-keyword">{label(p.principalId)}</span></p>}
            {p.addIds.length > 0 && <p>Entram: {p.addIds.map(label).join("; ")}</p>}
            {p.removeIds.length > 0 && <p>Saem: {p.removeIds.map(label).join("; ")}</p>}
            {p.transfers.length > 0 && <p className="text-text-muted">{p.transfers.length} keyword(s) mudam de Silo para o do artigo.</p>}
            <p className="text-text-muted">{before.count} → {after.count} keywords · volume {number(before.volume)} → {number(after.volume)}</p>
            {origin && <p className="text-text-muted" data-testid="architect-improvement-origin">Origem: {origin}</p>}
          </> : p.serpRefresh
            ? <p data-testid="architect-improvement-serp-refresh">Atualizar o DNA com a SERP: intenção {p.serpRefresh.intent} · funil {p.serpRefresh.funnel}. <span className="text-text-muted">A composição não muda.</span></p>
            : <p className="text-text-muted">Nada a mudar.</p>}
          {p.exclusions.length > 0 && <p className="text-text-muted">Não cobrir: {p.exclusions.join("; ")}</p>}
          {isListReading(p) && (p.aiReasons?.length ?? 0) > 0 && <div className="mt-1" data-testid="architect-improvement-ai-reading">
            <p className="font-medium text-foreground">{p.evidenceBasis === "list_core" ? IMPROVEMENT_LIST_CORE_LABEL : IMPROVEMENT_AI_LABEL}</p>
            <ul className="grid gap-0.5 text-text-muted">{p.aiReasons!.map(item => <li key={item.keywordId}><span className="text-keyword">{keyword(item.keywordId)?.keyword ?? item.keywordId}</span>: {item.reason}</li>)}</ul>
          </div>}
        </td>
        <td className="p-2 text-foreground">{result ? outcomes[result.status] : p.needsMinerador ? <span data-testid="architect-improvement-row-needs-minerador">{IMPROVEMENT_NEEDS_MINERADOR_LABEL}{sugestoesHref ? <> · <a href={sugestoesHref} className="text-module-accent underline underline-offset-2">{ARCHITECT_SUGGESTIONS_LABEL}</a></> : null}</span> : p.needsValidation ? "Falta a SERP da principal (coleta paga, custo antes)" : statuses[p.status]}{result && <p className="text-text-muted">{humanizeOperationMessage(result.message)}</p>}
          {p.reasons.length > 0 && <details className="text-text-muted"><summary className="cursor-pointer">Por quê</summary><p>{p.angle ? `Enfoque: ${p.angle}. ` : ""}{p.reasons.join(" ")}</p></details>}
        </td>
      </tr>;
    })}
  </tbody></table></div> : null;
  return <section className="border-b border-divider bg-surface px-4 py-4 text-sm leading-6" aria-label={ARTICLE_IMPROVEMENT_LABEL} data-testid="architect-article-improvement">
    {busy && activity && <ImprovementProgress activity={activity} now={now} {...progressOf(activity)} />}
    {busy && <p role="status" className="sr-only">Processando; o andamento fica guardado no servidor.</p>}
    {error && <p role="alert" className="mt-2 text-warning">{error}</p>}
    {leaseActive && !busy && <p className="mt-2 text-text-muted" role="status">Outra gravação desta marca está em andamento: feche e abra o painel em instantes.</p>}
    {precisamDoMinerador > 0 && <p className="mt-2 text-foreground" role="status" data-testid="architect-improvement-needs-minerador">
      {precisamDoMinerador} linha(s) {IMPROVEMENT_NEEDS_MINERADOR_LABEL.toLocaleLowerCase("pt-BR")}: dependem de keyword que JÁ existe no Minerador e o Arquiteto não mexe nela.{" "}
      {sugestoesHref ? <a href={sugestoesHref} className="font-medium text-module-accent underline underline-offset-2" data-testid="architect-improvement-open-suggestions">Abrir “{ARCHITECT_SUGGESTIONS_LABEL}” no Minerador</a> : <span className="text-text-muted">Abra “{ARCHITECT_SUGGESTIONS_LABEL}” no Minerador.</span>}
    </p>}
    {previaAberta && run ? <div className="mt-2 rounded-md border border-divider bg-surface-subtle p-3" role="region" aria-label="Prévia do refazedor" data-testid="architect-improvement-preview" data-step={passo ?? "rework"}>
      {podeRefazer && run.rework && <div className="mb-2" data-testid="architect-improvement-rework">
        <p className="text-foreground">{humanizeOperationMessage(run.rework.message)}</p>
        <label className="mt-1 grid gap-1 text-foreground">Para refazer de verdade (chamar de novo o que custa), diga o motivo:
          <input type="text" value={motivo} onChange={event => setMotivo(event.target.value)} className="min-h-9 rounded border border-divider bg-surface px-2 text-sm text-foreground" aria-label="Motivo para refazer" data-testid="architect-improvement-rework-reason" />
        </label>
      </div>}
      {passo === "read_paid" && leituraPaga && <p className="text-foreground" data-testid="architect-improvement-read-cost">{leituraPaga.sentence}</p>}
      {next.kind === "validate" && !refazer && <p className="text-foreground" data-testid="architect-improvement-cost">SERP no DataForSEO: {pagas} consulta(s), até {usd(run.costs.estimatedCostUsd.max)} — a primeira coleta da principal que falta. O que está no cache não é pago.</p>}
      {next.kind === "validate" && ready > 0 && !refazer && <label className="mt-1 flex items-center gap-2 text-foreground"><input type="checkbox" checked={semColeta} onChange={event => setSemColeta(event.target.checked)} data-testid="architect-improvement-without-serp" /> Gravar só as linhas prontas agora, sem coletar a SERP</label>}
      {run.costs.cacheUnavailable && <p className="mt-1 text-warning">Não deu para conferir o cache: a estimativa pode incluir consultas já pagas.</p>}
      {tabela}
      {passo === "apply" && novasDaConfirmacao?.approvalText && <div className="mt-2 rounded-md border border-divider bg-surface p-2" data-testid="architect-improvement-new-keywords">
        <p className="font-medium text-foreground">{novasDaConfirmacao.approvalText}</p>
        <ul className="mt-1 list-disc pl-5 text-foreground">{novasDaConfirmacao.lines.map(line => <li key={line}>{line}</li>)}</ul>
      </div>}
      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" className={buttonClassName} onClick={() => onClose?.()}>Cancelar</button>
        <button type="button" className={primaryButtonClassName} disabled={passo === null || passo === "select"} onClick={confirmar} data-testid="architect-improvement-confirm">{rotuloConfirmar}</button>
      </div>
    </div> : <>
      {run && !busy && run.state === "prepared" && !actionable.length && <p className="mt-2 text-text-muted" data-testid="architect-improvement-nothing">Nada a refazer agora nos artigos lidos.</p>}
      {tabela}
    </>}
    {(run?.editorialAi?.rejected.length ?? 0) > 0 && <details className="mt-3 text-text-muted" data-testid="architect-improvement-ai-rejected"><summary className="cursor-pointer font-medium text-foreground">Sugestões da IA recusadas pelas regras ({run!.editorialAi!.rejectedCount})</summary>
      <ul className="mt-2 grid gap-1">{run!.editorialAi!.rejected.map((r, i) => <li key={i}><span className="text-keyword">{r.keyword ?? r.keywordId ?? "—"}</span> → {r.theme ?? (run!.targets ?? []).find(t => t.id === r.targetId)?.theme ?? r.targetId ?? "—"}: {r.reason}</li>)}</ul>
    </details>}
    {run && [...new Set(run.notices)].filter(notice => !NOTICES_WITHOUT_ACTION.some(padrao => padrao.test(notice))).map((notice, i) => <p className="mt-2 text-text-muted" key={`${i}:${notice}`}>{humanizeOperationMessage(notice)}</p>)}
  </section>;
}

/** Remount tenant state instead of carrying the previous brand through effects. */
export function ArticleImprovementPanel(props: Parameters<typeof ArticleImprovementSession>[0]) {
  return <ArticleImprovementSession key={props.brandId ?? "no-brand"} {...props} />;
}
