"use client";
import { useEffect, useRef, useState } from "react";
import { InfoHint } from "@/components/info-hint";
import { OperationProgress } from "./operation-progress";
import { ARTICLE_IMPROVEMENT_LABEL, IMPROVEMENT_AI_LABEL, IMPROVEMENT_LIST_CORE_LABEL, isListReading } from "@/lib/arquiteto/article-improvement";
import { ARTICLES_NEW_ANCHOR, ARTICLES_SOBRAS_ANCHOR, GOOGLE_ADS_FREE_LABEL, humanizeOperationMessage, improvementPreviousRunLabel, improvementRowApplyLabel, improvementRunIsPrevious, improvementValidateLabel, resolveImprovementNextStep } from "@/lib/arquiteto/article-improvement-next-step";
import { ReworkNotice } from "@/components/editorial/rework-notice";
import type { ImprovementRun } from "@/lib/server/arquiteto-article-improvement";
import { improvementDiscoveryCostSentence } from "@/lib/arquiteto/article-improvement-reuse";
import { knownBeforeSearchAuthorizeLabel, KNOWN_VOLUME_MISSING_LABELS } from "@/lib/editorial/known-before-search";
import { IMPROVEMENT_NEEDS_MINERADOR_LABEL, improvementNewKeywordsPreview } from "@/lib/arquiteto/article-improvement-minerador";
import { isEditorialGroupColor } from "@/lib/editorial/editorial-groups";
import { ARCHITECT_SUGGESTIONS_LABEL, mineradorHandoffHref } from "@/lib/arquiteto/minerador-suggestions";

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
  prepare: "Buscando keywords no que já temos (e, só com a sua autorização, a leitura da IA e a medição do que falta)",
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

function ArticleImprovementSession({ brandId, brandRef = null, onApplied, buttonClassName, primaryButtonClassName, hasLeftovers = false, selectedTargetIds = [], activeGroup = null, mesaChangedAt = null }: {
  /*
   * 2026-10-14 (tarde) · pedido do dono: o painel não fica mais no topo da aba
   * Artigos. Ele abre só pelo botão "Melhorar publicados…" da barra; o modo
   * "recolhido apontando para a planilha" saiu junto com a planilha separada
   * (os artigos do plano são linhas da tabela de artigos).
   */
  /**
   * 2026-10-14 · a última mudança da mesa (itens recebidos). A análise lida do
   * servidor ao abrir, feita ANTES dela, aparece recolhida como "análise
   * anterior", não como o estado de agora.
   */
  mesaChangedAt?: string | null;
  brandId: string | null; onApplied: () => void; buttonClassName: string; primaryButtonClassName: string;
  /**
   * F4 · O ARQUITETO SÓ LÊ (SDD 2026-10-13, item 2): a rota da marca, para o
   * link "Sugestões do Arquiteto" no Minerador (o Arquiteto nunca grava lá).
   */
  brandRef?: string | null;
  /**
   * 2026-10-13 · caso real (WifiConecta): com a etiqueta azul escolhida, o painel mostrava a
   * análise antiga da marca inteira (Assuntos do laranja). Com uma cor ativa, "Buscar keywords"
   * recorta pela cor, e a análise de outro recorte é avisada como tal.
   */
  activeGroup?: { requested: string; label: string } | null;
  /** A aba mostra Sobras agora: sem elas, o cartão não manda para um lugar vazio. */
  hasLeftovers?: boolean;
  /**
   * Publicados marcados na planilha (2026-10-01): "Buscar keywords" analisa só
   * eles. Sem nenhum marcado, analisa todos, como antes. Gravar continua
   * valendo só para as linhas marcadas na tabela desta análise.
   */
  selectedTargetIds?: readonly string[];
  /*
   * 2026-10-16 · RESTAURAÇÃO DO FLUXO DE SEMPRE: o painel completo (IA,
   * medição, busca nova no Google Ads, SERP) volta a valer para os publicados E
   * para os Assuntos, inclusive os de grupo com plano (como em 4d546ce, sem
   * `excludePlanArticles`). O reforço respeita a regra da principal: declarada,
   * travada ou com volume no DNA fica; Livre sem volume pode trocar só fora da
   * identidade (2026-10-17: a principal de identidade fica); as keywords
   * soltas entram na lista. "Concluir formação" (barra) só forma a linha sem
   * ArticleDNA; reforçar o artigo formado é daqui.
   */
}) {
  const mounted = useRef(false);
  const [leaseActive, setLeaseActive] = useState(false);
  const [runState, setRun] = useState<ImprovementRun | null>(null);
  /*
   * 2026-10-14 (caso WifiConecta) · a execução lida ao abrir, de outro recorte
   * ou anterior à última mudança da mesa, fica recolhida ("Análise anterior de
   * <data>") até a pessoa pedir "Retomar esta análise". Uma execução nova
   * (Buscar keywords) é sempre a atual.
   */
  const [restoredRunId, setRestoredRunId] = useState<string | null>(null);
  const [resumedPrevious, setResumedPrevious] = useState(false);
  const previousRun = runState && runState.runId === restoredRunId && !resumedPrevious
    && improvementRunIsPrevious({ run: runState, activeGroupRequested: activeGroup?.requested ?? null, mesaChangedAt })
    ? runState : null;
  const run = previousRun ? null : runState;
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
  const [confirm, setConfirm] = useState<"apply" | "collect" | "discover" | "read" | null>(null);
  const confirmRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => { if (confirm) confirmRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" }); }, [confirm]);
  useEffect(() => {
    let active = true;
    mounted.current = true;
    if (brandId) void fetch(`/api/arquiteto/article-improvement?brandId=${encodeURIComponent(brandId)}`).then(r => r.json()).then(body => {
      if (!active || !body.success || !body.data) return;
      const restored = body.data as ImprovementRun;
      // F5 · a execução da planilha "Artigos do plano" é retomada lá, não aqui.
      if (restored.origin === "plan_sheet") return;
      setRun(restored);
      setRestoredRunId(restored.runId);
      setLeaseActive(Boolean(restored.leaseUntil && Date.parse(restored.leaseUntil) > Date.now()));
      setSelected(new Set(restored.acceptedIds ?? restored.proposals.filter(p => p.status === "ready").map(p => p.targetId)));
    }).catch(() => { if (active) setError("Não foi possível ler a análise anterior. Toque em “Atualizar”."); });
    return () => { active = false; mounted.current = false; };
  }, [brandId]);
  async function send(action: "prepare" | "collect" | "apply" | "status", current = run, options: { discover?: boolean; reworkReason?: string; group?: string; authorizeReading?: { ai?: boolean; measure?: boolean }; approveNewKeywords?: boolean } = {}): Promise<ImprovementRun> {
    const response = await fetch("/api/arquiteto/article-improvement", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ brandId, action,
      ...(action !== "prepare" ? { runId: current?.runId } : {}),
      ...(action === "collect" || action === "apply" ? { decisionHash: current?.decisionHash } : {}),
      ...(action === "collect" ? { authorizedCostUsd: current?.costs.estimatedCostUsd.max } : {}),
      ...(action === "apply" && !current?.acceptedIds ? { targetIds: [...selected] } : {}),
      /*
       * 2026-10-17 · KEYWORD NOVA NA MESMA CONFIRMAÇÃO (decisão do dono de 16/10;
       * SUBSTITUI a F4 de 14/10, quando o pedido nunca levava o aceite): só quando
       * a confirmação mostrou, por artigo, as keywords novas com volume e fonte.
       */
      ...(action === "apply" && !current?.acceptedIds && options.approveNewKeywords ? { approveNewKeywords: true } : {}),
      ...(action === "prepare" && selectedTargetIds.length ? { targetIds: [...selectedTargetIds] } : {}),
      // 2026-10-16 · o painel volta a incluir os Assuntos de grupo com plano (como em 4d546ce): é por aqui que o dono reforça os artigos do plano.
      // Busca nova no Google Ads só quando o dono pede, depois de ver o custo (2026-10-12).
      ...(action === "prepare" && options.discover ? { discover: true } : {}),
      // F5 — "Refazer mesmo assim" (D11): os mesmos insumos de novo, só com o motivo dito.
      ...(action === "prepare" && options.reworkReason ? { reworkOverride: { reason: options.reworkReason } } : {}),
      // A cor ativa da etiqueta recorta o prepare ao grupo; "Buscar de novo" mantém o recorte da execução.
      ...(action === "prepare" && options.group ? { group: options.group } : {}),
      // F3 · ler antes de buscar: IA e medição só com a autorização dada depois de ver "já temos · falta · custa".
      ...(action === "prepare" && options.authorizeReading ? { authorizeReading: options.authorizeReading } : {}),
    }) });
    // The platform answers a timeout with an HTML page, not JSON.
    const body = await response.json().catch(() => { throw new Error("TEMPO_ESGOTADO"); });
    if (!response.ok || !body.success) throw new Error(body.error ?? "Etapa não confirmada.");
    if (!mounted.current || body.data.brandId !== brandId) throw new Error("A marca ativa mudou; consulte o andamento na marca de origem.");
    setRun(body.data); setLeaseActive(Boolean(body.data.leaseUntil && Date.parse(body.data.leaseUntil) > Date.now())); return body.data as ImprovementRun;
  }
  async function execute(action: "prepare" | "collect" | "apply" | "status", options: { discover?: boolean; reworkReason?: string; group?: string; authorizeReading?: { ai?: boolean; measure?: boolean }; approveNewKeywords?: boolean } = {}) {
    setBusy(true); setError(null); setConfirm(null);
    const startedAt = Date.now();
    setActivity({ action, startedAt }); setNow(startedAt);
    try {
      let current = await send(action, run, options);
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
      // 2026-10-14 · o código técnico (REWORK_SAME_REFUSAL…) nunca aparece cru: vira a frase humana.
      if (mounted.current) setError(e instanceof Error ? humanizeOperationMessage(e.message) : "Falha na execução.");
    }
    finally { if (mounted.current) { setBusy(false); setActivity(null); } }
  }
  const keyword = (id: string | null) => run?.keywords.find(k => k.id === id);
  // 2026-10-17 · a keyword NOVA na marca vem marcada: ela entra no Minerador e no artigo na confirmação.
  const label = (id: string | null) => { const k = keyword(id); return k ? `${k.keyword} · ${k.volumeValidated ? `volume ${number(k.volume ?? 0)}` : "sem volume"}${k.external && !k.knownInMinerador ? " · nova" : ""}` : "Nenhuma"; };
  const totals = (ids: readonly string[]) => ({ count: ids.length, volume: ids.reduce((sum, id) => { const k = keyword(id); return sum + (k?.volumeValidated ? k.volume ?? 0 : 0); }, 0) });
  const proposals = run ? [...run.proposals].sort((a, b) => statusOrder[a.status] - statusOrder[b.status]) : [];
  const ready = proposals.filter(p => p.status === "ready").length;
  // Only lines that can change (or already have an outcome) stay in the table.
  // A linha que ainda precisa validar fica na tabela (caixa desabilitada), para o dono ver o que o passo 2 vai conferir.
  // F4: a linha que precisa do Minerador também fica à vista (caixa desabilitada), com o link para as sugestões lá.
  const actionable = run ? proposals.filter(p => p.status === "ready" || p.needsValidation || p.needsMinerador || run.outcomes.some(o => o.targetId === p.targetId)) : [];
  const precisamDoMinerador = run ? proposals.filter(p => p.needsMinerador).length : 0;
  const corDasSugestoes = run?.groupScope && isEditorialGroupColor(run.groupScope.requested) ? run.groupScope.requested : activeGroup && isEditorialGroupColor(activeGroup.requested) ? activeGroup.requested : null;
  const sugestoesHref = brandRef ? mineradorHandoffHref(brandRef, { action: "sugestoes", color: corDasSugestoes }) : null;
  const parked = run ? proposals.filter(p => !actionable.includes(p)) : [];
  const done = run?.state === "complete";
  const pendingApply = Boolean(run && !done && (selected.size > 0 || run.acceptedIds?.length));
  const collecting = run?.state === "collecting";
  // 2026-10-17 · as keywords NOVAS das linhas marcadas, por artigo, com volume e fonte: o texto da confirmação.
  const novasDaConfirmacao = run ? improvementNewKeywordsPreview(run, run.acceptedIds ?? selected) : null;
  const needsCost = Boolean(run && !collecting && run.costs.paidQueries > 0 && !run.acceptedIds);
  // Alvos que seguem sem proposta e ainda não tiveram a busca nova pedida nesta preparação.
  const discoveryGaps = run && !collecting && !run.acceptedIds && run.state === "prepared" && !run.discovery?.requested ? run.discovery?.gapTargetIds.length ?? 0 : 0;
  /*
   * F3 · LER ANTES DE BUSCAR: a preparação leu de graça o que já temos e disse o
   * que falta e quanto custa. A IA e a medição no Google Ads só rodam com a
   * autorização desta prévia, e só para o que falta.
   */
  const leitura = run?.reading ?? null;
  const rotuloLeitura = leitura ? knownBeforeSearchAuthorizeLabel(leitura) : null;
  const leituraPaga = leitura && rotuloLeitura && !collecting && !run?.acceptedIds && run?.state === "prepared" ? { button: rotuloLeitura, sentence: `${leitura.sentences.known} ${leitura.sentences.missing} ${leitura.sentences.cost}` } : null;
  const autorizacaoDaLeitura = leitura ? { ai: leitura.plan.ai.calls > 0, measure: leitura.plan.googleAds.keywords > 0 } : {};
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
    optionalPaidQueries: run?.costs.optionalPaidQueries ?? 0,
    costMaxUsd: run?.costs.estimatedCostUsd.max ?? 0,
    selectedCount: selected.size,
    readyCount: ready,
    hasLeftovers,
    busy,
    collectProgress: run?.collect ? { done: run.collect.doneGroupIds.length, total: run.collect.totalGroups ?? null } : null,
    applyProgress: run?.acceptedIds?.length ? { done: run.outcomes.filter(o => run.acceptedIds!.includes(o.targetId)).length, total: run.acceptedIds.length } : null,
    paidReading: leituraPaga,
  });
  const nextDisabled = next.kind === "working" ? true
    : next.kind === "none" ? false
    : next.kind === "select" ? true
    : next.kind === "prepare" ? !brandId || busy || leaseActive
    : next.kind === "resume_apply" || next.kind === "apply" ? busy || leaseActive
    : busy;
  // Com uma cor escolhida na etiqueta, a busca nova é só daquela cor (o mesmo recorte por grupo da planilha "Artigos do plano").
  const recorteAtivo = activeGroup ? { group: activeGroup.requested } : {};
  const recorteDaExecucao = run?.groupScope ? { group: run.groupScope.requested } : {};
  const analiseDeOutroRecorte = Boolean(run && activeGroup && run.groupScope?.requested !== activeGroup.requested);
  const runNext = () => {
    if (next.kind === "prepare") void execute("prepare", recorteAtivo);
    else if (next.kind === "resume_collect") void execute("collect");
    else if (next.kind === "resume_apply") void execute("apply");
    else if (next.kind === "refresh") void execute("status");
    else if (next.kind === "read_paid") setConfirm("read");
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
    {previousRun && <details className="mt-3 rounded-md border border-divider bg-surface-subtle p-3 text-text-muted" data-testid="architect-improvement-previous">
      <summary className="cursor-pointer font-medium text-foreground">{improvementPreviousRunLabel(previousRun)} · recolhida</summary>
      <p className="mt-1">{previousRun.proposals.length} analisado(s) naquela vez. Ela é {(previousRun.groupScope?.requested ?? "todos") !== (activeGroup?.requested ?? "todos") ? "de outro recorte que o da etiqueta" : "anterior à última mudança da mesa"}: não é o estado de agora. Para analisar o que vale hoje, use “Buscar keywords” (grátis; o que já foi lido e pago é reaproveitado).</p>
      <button type="button" className={`${buttonClassName} mt-2`} disabled={busy} onClick={() => setResumedPrevious(true)} data-testid="architect-improvement-resume-previous">Retomar esta análise</button>
    </details>}
    {/* F5 — a guarda de retrabalho, acima dos botões: "já feito com os mesmos insumos em <data>". */}
    {run?.rework && !run.acceptedIds && run.state === "prepared" && <ReworkNotice rework={run.rework} busy={busy || leaseActive} buttonClassName={buttonClassName} testId="architect-improvement-rework"
      onOverride={reason => void execute("prepare", { ...recorteDaExecucao, reworkReason: reason })} />}
    {/* Os números (1 · 2 · 3) ficam só no cartão: na fileira, os outros atos
        aparecem sem número para não disputar com o próximo passo. */}
    <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
      <div className="min-w-0">
        <h3 className="flex items-center gap-1.5 font-semibold text-foreground" data-testid="architect-improvement-how">
          {ARTICLE_IMPROVEMENT_LABEL}
          <InfoHint title="Como funciona" description="1 · Buscar keywords lê, de graça, o que já temos de cada publicado e Assunto — DNA, volume já medido (inclusive “sem média” há menos de 30 dias), SERP em cache, Assunto, plano e trava — e mostra “Já temos · Falta · Custa”. A leitura da IA (IA da plataforma, OpenRouter; ela recebe o resumo do DNA de cada keyword) e a medição no Google Ads (grátis, cota do Google Ads) só rodam quando você autoriza, e só para o que falta. A ordem: pares da SERP que já estão no cache, a leitura da IA na lista da marca (confira o motivo de cada uma), a leitura da lista pelo código (keywords que são o núcleo do slug) e, só para quem ficar sem nada e quando você pedir, busca nova no Google Ads (grátis, cota do Google Ads). Keyword NOVA (que não existe na marca) aparece marcada “nova” e, na confirmação, a lista por artigo com volume e fonte: ao confirmar, ela é importada no Minerador, processada, aprovada e enviada ao Arquiteto e entra no artigo, tudo de uma vez. A keyword que JÁ existe no Minerador é só lida; se ela não chegou ao Arquiteto, a linha fica “Precisa do Minerador”. Buscar de novo com os mesmos alvos e a mesma lista reaproveita a leitura da IA, as medições e a busca, sem chamar de novo. 2 · Coletar a SERP no DataForSEO (pago, com prévia): só a primeira SERP da principal que ainda não tem. 3 · Gravar as melhorias que você marcar." />
        </h3>
        <p className="text-text-muted">URL, slug e canonical nunca mudam.</p>
        {analiseDeOutroRecorte && activeGroup && <p className="text-warning" role="status" data-testid="architect-improvement-other-scope">Esta análise é {run?.groupScope ? `do grupo ${run.groupScope.requested}` : "da marca inteira"}, não da cor {activeGroup.label} escolhida na etiqueta. Para analisar só a cor {activeGroup.label}, toque em “Buscar keywords da cor {activeGroup.label}”.</p>}
        {run?.groupScope && <p className="text-text-muted" data-testid="architect-improvement-group-scope">Esta análise leu só o grupo {run.groupScope.requested} (alvos e lista do grupo; os publicados da marca inteira continuam protegidos).</p>}
        <p className="text-text-muted" data-testid="architect-improvement-scope">{selectedTargetIds.length
          ? `A busca analisa só os ${selectedTargetIds.length} publicado(s) marcado(s) na planilha.`
          : "Sem publicado marcado na planilha, a busca analisa todos. Gravar vale só para as linhas marcadas abaixo."}</p>
      </div>
      <div className="flex flex-wrap gap-2">
        {collecting && !inCard("resume_collect") && <button className={buttonClassName} disabled={busy} onClick={() => void execute("collect")}>Continuar validação (sem custo novo)</button>}
        {!pendingApply && !collecting && !inCard("prepare") && <button className={buttonClassName} disabled={!brandId || busy || leaseActive} onClick={() => void execute("prepare", recorteAtivo)}>{activeGroup ? `Buscar keywords da cor ${activeGroup.label} (grátis)` : "Buscar keywords (grátis)"}</button>}
        {pendingApply && !collecting && !inCard("resume_apply") && !inCard("apply") && <button className={buttonClassName} disabled={busy || leaseActive} onClick={() => run?.acceptedIds ? void execute("apply") : setConfirm("apply")}>{improvementRowApplyLabel({ selectedCount: selected.size, paidQueries: needsCost ? run?.costs.paidQueries ?? 0 : 0, optionalPaidQueries: run?.costs.optionalPaidQueries ?? 0, accepted: Boolean(run?.acceptedIds) })}</button>}
        {pendingApply && !run?.acceptedIds && <button className={buttonClassName} disabled={busy || leaseActive} onClick={() => void execute("prepare", run?.groupScope ? { group: run.groupScope.requested } : {})}>Buscar de novo</button>}
        {leituraPaga && !inCard("read_paid") && <button className={buttonClassName} data-testid="architect-improvement-read-paid" disabled={!brandId || busy || leaseActive} onClick={() => setConfirm("read")}>{leituraPaga.button}</button>}
        {discoveryGaps > 0 && <button className={buttonClassName} disabled={!brandId || busy || leaseActive} onClick={() => setConfirm("discover")}>Buscar keywords novas no Google Ads ({discoveryGaps}) · {GOOGLE_ADS_FREE_LABEL}</button>}
        {needsCost && !inCard("validate") && <button className={buttonClassName} disabled={busy} onClick={() => setConfirm("collect")}>{improvementValidateLabel(run?.costs.paidQueries ?? 0, run?.costs.estimatedCostUsd.max ?? 0, false)}</button>}
        {run && (leaseActive || run.state === "applying") && !inCard("refresh") && <button className={buttonClassName} disabled={busy} onClick={() => void execute("status")}>Atualizar</button>}
      </div>
    </div>
    {/* A confirmação abre logo abaixo dos botões: embaixo da tabela ela ficava fora da tela e o botão parecia não responder. */}
    {confirm && run && <div ref={confirmRef} className="mt-3 rounded-md border border-divider bg-surface-subtle p-3" role="region" aria-label="Confirmar prévia">
      {confirm === "read" && leitura
        ? <><h4 className="font-semibold text-foreground">Ler o que falta · com custo</h4><p className="text-foreground">{leitura.sentences.known}</p><p className="text-foreground">{leitura.sentences.missing}</p><p className="text-foreground">{leitura.sentences.cost}</p>{leitura.missing.volumeToMeasureSample.length > 0 && <ul className="my-2 list-disc pl-5 text-text-muted">{leitura.missing.volumeToMeasureSample.map(item => <li key={item.keywordId}><span className="text-keyword">{item.keyword}</span> · {KNOWN_VOLUME_MISSING_LABELS[item.reason]}</li>)}</ul>}<p className="text-text-muted">O que já temos não é pedido de novo. A IA recebe o resumo do DNA de cada keyword (intenção, entidade, funil, público, problema). Nada é gravado neste passo.</p></>
        : confirm === "discover"
        ? <><h4 className="font-semibold text-foreground">Busca nova no Google Ads</h4><p className="text-foreground">{improvementDiscoveryCostSentence(discoveryGaps)}</p><p className="text-text-muted">A leitura da IA e as medições desta preparação são reaproveitadas: nada disso é chamado de novo.</p></>
        : confirm === "apply"
        ? <><h4 className="font-semibold text-foreground">Confirmar estas melhorias</h4><p className="text-foreground">Você aceita as trocas de principal Livre, as keywords que entram e saem e as mudanças de Silo nos {selected.size} item(ns) marcado(s). O Arquiteto grava o ArticleDNA, a composição e o parecer; as keywords que já vieram do Minerador não são alteradas. O servidor relê o resultado. Principal travada e identidade publicada ficam como estão. Nada é publicado nem reescrito no site.</p>
          {novasDaConfirmacao?.approvalText && <div className="mt-2 rounded-md border border-divider bg-surface p-2" data-testid="architect-improvement-new-keywords">
            <p className="font-medium text-foreground">{novasDaConfirmacao.approvalText}</p>
            <ul className="mt-1 list-disc pl-5 text-foreground">{novasDaConfirmacao.lines.map(line => <li key={line}>{line}</li>)}</ul>
          </div>}</>
        : <><h4 className="font-semibold text-foreground">Coletar a SERP no DataForSEO · pago: {run.costs.paidQueries} consulta(s)</h4><p className="text-foreground">Custo estimado: US$ {run.costs.estimatedCostUsd.min.toFixed(4)} a {run.costs.estimatedCostUsd.max.toFixed(4)}. Teto da execução: US$ 1. O que já foi pago é reaproveitado. Cancelar não impede aplicar o que já está pronto.</p><ul className="my-2 list-disc pl-5 text-text-muted">{run.costs.missingDetails.map((raw, i) => { const item = raw as { keyword?: string; lens?: string; reason?: string }; return <li key={i}>{item.keyword} · {item.lens} · {item.reason}</li>; })}</ul></>}
      <div className="mt-3 flex gap-2"><button className={buttonClassName} onClick={() => setConfirm(null)}>Cancelar</button><button className={primaryButtonClassName} onClick={() => void (confirm === "read" ? execute("prepare", { ...recorteDaExecucao, authorizeReading: autorizacaoDaLeitura }) : confirm === "discover" ? execute("prepare", { ...recorteDaExecucao, discover: true }) : confirm === "apply" ? execute("apply", novasDaConfirmacao?.total ? { approveNewKeywords: true } : {}) : execute(confirm))}>{confirm === "apply" ? (novasDaConfirmacao?.total ? `Confirmar e aplicar (com ${novasDaConfirmacao.total} keyword(s) nova(s))` : "Confirmar e aplicar") : confirm === "read" ? "Autorizar e ler" : confirm === "discover" ? "Buscar no Google Ads" : "Autorizar este custo"}</button></div>
    </div>}
    {busy && <p role="status" className="sr-only">Processando; o andamento fica guardado no servidor.</p>}
    {error && <p role="alert" className="mt-2 text-warning">{error}</p>}
    {leitura && <div className="mt-3 rounded-md border border-divider bg-surface-subtle p-3" role="region" aria-label="Já temos · Falta · Custa" data-testid="architect-improvement-known">
      <p className="text-foreground">{leitura.sentences.known}</p>
      <p className="text-foreground">{leitura.sentences.missing}</p>
      <p className="text-text-muted">{leitura.sentences.cost}</p>
      {leitura.sentences.done && <p className="text-text-muted">{leitura.sentences.done}</p>}
    </div>}
    {run && <>
      <p className="mt-3 font-medium text-foreground">{proposals.length} analisado(s): {ready} para melhorar · {run.outcomes.filter(o => o.status === "improved").length} melhoria(s) gravada(s){run.outcomes.some(o => o.status === "dna_created") ? ` · ${run.outcomes.filter(o => o.status === "dna_created").length} DNA(s) criado(s)` : ""}</p>
      {actionable.length === 0 && <p className="mt-2 text-text-muted">Nenhum publicado ou Assunto tem melhoria com volume e evidência agora. Veja o motivo de cada um abaixo.</p>}
      {precisamDoMinerador > 0 && <p className="mt-2 text-foreground" role="status" data-testid="architect-improvement-needs-minerador">
        {precisamDoMinerador} linha(s) {IMPROVEMENT_NEEDS_MINERADOR_LABEL.toLocaleLowerCase("pt-BR")}: dependem de keyword que JÁ existe no Minerador (não enviada ao Arquiteto, medição a gravar ou sem a Lógica), e o Arquiteto não mexe no que já está lá — decida pelo seu clique no Minerador.{" "}
        {sugestoesHref ? <a href={sugestoesHref} className="font-medium text-module-accent underline underline-offset-2" data-testid="architect-improvement-open-suggestions">Abrir “{ARCHITECT_SUGGESTIONS_LABEL}” no Minerador</a> : <span className="text-text-muted">Abra “{ARCHITECT_SUGGESTIONS_LABEL}” no Minerador.</span>}
      </p>}
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
              </> : p.serpRefresh
                ? <p data-testid="architect-improvement-serp-refresh">Atualizar o DNA com a SERP: intenção {p.serpRefresh.intent} · funil {p.serpRefresh.funnel}. <span className="text-text-muted">A composição não muda.</span></p>
                : <p className="text-text-muted">Nada a mudar.</p>}
              {p.exclusions.length > 0 && <p className="text-text-muted">Não cobrir: {p.exclusions.join("; ")}</p>}
              {isListReading(p) && (p.aiReasons?.length ?? 0) > 0 && <div className="mt-1" data-testid="architect-improvement-ai-reading">
                <p className="font-medium text-foreground">{p.evidenceBasis === "list_core" ? IMPROVEMENT_LIST_CORE_LABEL : IMPROVEMENT_AI_LABEL}</p>
                <ul className="grid gap-0.5 text-text-muted">{p.aiReasons!.map(item => <li key={item.keywordId}><span className="text-keyword">{keyword(item.keywordId)?.keyword ?? item.keywordId}</span>: {item.reason}</li>)}</ul>
              </div>}
            </td>
            <td className="p-2 text-foreground">{result ? outcomes[result.status] : p.needsMinerador ? <span data-testid="architect-improvement-row-needs-minerador">{IMPROVEMENT_NEEDS_MINERADOR_LABEL}{sugestoesHref ? <> · <a href={sugestoesHref} className="text-module-accent underline underline-offset-2">{ARCHITECT_SUGGESTIONS_LABEL}</a></> : null}</span> : p.needsValidation ? "Precisa coletar a SERP no DataForSEO (passo 2)" : statuses[p.status]}{result && <p className="text-text-muted">{humanizeOperationMessage(result.message)}</p>}
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
      {collecting && <p className="mt-2 text-warning">A coleta da SERP no DataForSEO ficou pela metade. O que já foi pago está no cache e não é cobrado de novo: toque em “Continuar” no Próximo passo.</p>}
      {[...new Set(run.notices)].map((notice, i) => <p className="mt-2 text-text-muted" key={`${i}:${notice}`}>{humanizeOperationMessage(notice)}</p>)}
    </>}
  </section>;
}

/** Remount tenant state instead of carrying the previous brand through effects. */
export function ArticleImprovementPanel(props: Parameters<typeof ArticleImprovementSession>[0]) {
  return <ArticleImprovementSession key={props.brandId ?? "no-brand"} {...props} />;
}
