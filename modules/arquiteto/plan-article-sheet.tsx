"use client";
import { useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from "react";
import { EditorialGroupTag } from "@/components/editorial/group-tag";
import { ArticleSubjectLine } from "@/components/editorial/article-subject-line";
import { OperationProgress } from "./operation-progress";
import type { ImprovementRun } from "@/lib/server/arquiteto-article-improvement";
import type { ArchitectSubjectStanding } from "@/lib/arquiteto/declared-subject";
import type { EditorialGroupScreenFilter } from "@/lib/editorial/editorial-groups";
import { describeSerpPaidPlan, type SerpPaidPlan, type SerpPaidPlanChoice } from "@/lib/arquiteto/serp-lens-plan";
import { runPaidSerpBlocks } from "@/lib/arquiteto/serp-blocks";
import { ARCHITECT_SUGGESTIONS_LABEL, mineradorHandoffHref } from "@/lib/arquiteto/minerador-suggestions";
import {
  PLAN_SHEET_ACTION_LABELS,
  applyPlanSheetSerp, planFlowSteps, planRowAlerts, planStepTwoAction, PLAN_FLOW_LABELS, type PlanFlowStep, buildPlanSheetRows, planPrincipalSwapCandidates, planRowRoleLabel, planRowSeals, planSheetColorLabel, planSheetFormationSelection,
  planSheetOutcomeSentence, planSheetPreviewLines, planSheetSerpByKeyword, planSheetSerpSelection, planSheetServerErrorSentence, planSwapCandidateLabel,
  type PlanRowSeal, type PlanSheetAction, type PlanSheetArticle, type PlanSheetConflict, type PlanSheetRow, type PlanSheetSerpRead, type PlanSwapCandidate,
} from "@/lib/arquiteto/plan-article-sheet";
import { SILO_ARTICLE_WITHDRAWAL_ACTION_LABEL } from "@/lib/arquiteto/silo-article-withdrawal";
import type { PlanConsolidationLine, PlanSiloPairStep } from "@/lib/arquiteto/plan-consolidation";
import { PLAN_SILO_PAIR_FIX_LABEL } from "@/lib/arquiteto/silo-plan-identity";
import { SiloArticleWithdrawalPanel } from "./silo-article-withdrawal-panel";

/**
 * F5 · PLANILHA PRIMEIRO (SDD `docs/compartilhado/sdd-arquiteto-so-le-e-listas-leves-2026-10-13.md`,
 * item 5). Os artigos do plano como LINHAS, com as ações na linha e no lote:
 * prévia (grátis) → UMA confirmação → recusa por item → andamento → resultado
 * por linha → releitura.
 *
 * Um caminho só: "Validar SERP" é a rota `keyword-serp` (cache primeiro, custo
 * antes, `onlyMeasuredVolume`), pelo mesmo executor de blocos pagos da mesa;
 * "Concluir formação" e "Trocar principal" são a melhoria recortada por grupo
 * (`/api/arquiteto/article-improvement`, prepare → apply), que grava SÓ o
 * ArticleDNA, a composição e o parecer. Nenhum pedido daqui vai ao Minerador
 * (F4): o que faltar vira "Sugestões do Arquiteto".
 *
 * 2026-10-14 (tarde) · PEDIDO DO DONO: "coloca só numa lista, não cria várias
 * listas". A lógica saiu para `usePlanArticleSheet`, e a aba Artigos mostra as
 * linhas do plano DENTRO da tabela de artigos de sempre (`PlanArticleTableRow`,
 * `PlanRowSeals`, `PlanRowActions`), com a prévia/andamento logo abaixo da
 * barra (`PlanSheetOperations`).
 *
 * 2026-10-14 (noite) · PEDIDO DO DONO ("tem 9 botões no painel do topo (…) tudo
 * confuso"; "era só olhar e consolidar"): a planilha separada saiu de vez (nem
 * para os testes); as etapas do plano são da barra (`flow`/`runStage`:
 * "Consolidar o Silo do plano" → "Completar sustentações e SERP" → "Links
 * internos"); na linha ficam só "Procurar outra principal" (sem volume e
 * Livre) e "Retirar artigo do Silo" (presa em outro artigo).
 */

type Tone = "success" | "neutral" | "warning";
type LineKind = "go" | "known" | "refused" | "minerador" | "serp" | "adequate";
type PreviewLine = { keywordId: string; keyword: string; kind: LineKind; text: string };
type FormationRun = { groupId: string; run: ImprovementRun; readyIds: string[] };
type Preview =
  | { action: "validateSerp"; lines: PreviewLine[]; plan: SerpPaidPlan; resolve: (choice: SerpPaidPlanChoice | null) => void }
  | { action: "concludeFormation" | "swapPrincipal"; lines: PreviewLine[]; runs: FormationRun[] }
  | { action: "chooseSwap"; rows: PlanSheetRow[]; candidates: Record<string, PlanSwapCandidate[]>; picks: Record<string, string>; refused: PreviewLine[] }
  | { action: "consolidate"; lines: PreviewLine[]; data: PlanConsolidationPreviewData };

/** A prévia de "Consolidar o Silo do plano" como o servidor a devolve (`/api/arquiteto/plan-silo/consolidate`). */
export type PlanConsolidationPreviewData = {
  groupId: string;
  groupLabel: string;
  planVersion: number;
  siloName: string;
  territory: { kind: string; territoryRef?: string; sentence: string };
  lines: PlanConsolidationLine[];
  pillarKeywordId: string | null;
  summary: string;
  acceptedKeywordIds: string[];
  decisionHash: string;
  /** 2026-10-15 · aditivo: o par do Silo (falta, em dia, ou "Corrigir a página do Silo (vN+1)" na mesma confirmação). */
  siloPair?: PlanSiloPairStep;
};
type Busy ={ label: string; startedAt: number; done: number | null; total: number | null; unit: string };

const LINE_TONE: Record<LineKind, string> = {
  go: "text-foreground",
  known: "text-text-muted",
  adequate: "text-text-muted",
  refused: "text-warning",
  minerador: "text-warning",
  serp: "text-warning",
};
const TONE_CLASS: Record<Tone, string> = { success: "text-success", neutral: "text-text-muted", warning: "text-warning" };
const SEAL_TONE: Record<PlanRowSeal["tone"], string> = {
  neutral: "border-divider text-foreground",
  muted: "border-divider text-text-muted",
  warning: "border-warning/40 text-warning",
  positive: "border-positive-soft/40 text-positive-soft",
};
const SERP_BLOCK = 6;

/**
 * 2026-10-14 ("travou, sem poder avançar") · nenhum pedido fica girando sem
 * fim: passou do teto, vira "tempo esgotado" com a frase do que fazer (o que
 * já foi gravado continua gravado; repetir não paga duas vezes).
 */
const REQUEST_TIMEOUT_MS = 150_000;

async function postJson(url: string, body: unknown): Promise<{ ok: boolean; status: number; body: { success?: boolean; error?: string; code?: string; data?: unknown } }> {
  const controller = typeof AbortController === "function" ? new AbortController() : null;
  const timer = controller ? setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS) : null;
  try {
    const response = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body), ...(controller ? { signal: controller.signal } : {}) });
    // A plataforma responde tempo esgotado com uma página HTML, não JSON.
    const parsed = await response.json().catch(() => ({ success: false, error: "TEMPO_ESGOTADO" }));
    return { ok: response.ok, status: response.status, body: parsed };
  } catch {
    // Rede caída ou o teto acima: a mesma resposta de tempo esgotado (a tela diz o que fazer).
    return { ok: false, status: 0, body: { success: false, error: "TEMPO_ESGOTADO" } };
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/** O erro do servidor como frase humana, com o que fazer (nunca o código cru). */
const humanError = (answer: { status: number; body: { error?: string; code?: string } }) => planSheetServerErrorSentence({ status: answer.status, error: answer.body.error ?? null, code: answer.body.code ?? null });

async function improvement(body: Record<string, unknown>): Promise<ImprovementRun> {
  const answer = await postJson("/api/arquiteto/article-improvement", body);
  if (!answer.ok || !answer.body.success) throw new Error(humanError(answer));
  return answer.body.data as ImprovementRun;
}

/** Quantas leituras seguidas sem avanço a gravação aceita antes de parar com a frase (≈ 2 minutos). */
const APPLY_STALL_LIMIT = 40;

const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
/** O relógio das ações (fora do render: só os handlers e os efeitos o chamam). */
const agoraMs = () => Date.now();
const ZERO_PLAN: SerpPaidPlan = { lenses: [], perLens: [], paidQueries: 0, primaryPaidQueries: 0, extraPaidQueries: 0, conditionalPaidQueries: 0, recollectableQueries: 0, estimatedCostUsd: { min: 0, max: 0 }, collectedAtSpreadDays: 0, datesDiverge: false, payMissingExtraLenses: true, recollectStaleLenses: false, digestChecked: false };

export type PlanArticleSheetProps = {
  brandId: string | null;
  brandRef: string | null;
  keywords: readonly Record<string, unknown>[];
  standings?: ReadonlyMap<string, ArchitectSubjectStanding>;
  groupOf: (groupId: string) => { color: string; name: string } | null;
  keywordGroupOf: (keywordId: string) => string | null;
  filter: EditorialGroupScreenFilter;
  articles: readonly PlanSheetArticle[];
  radarArticleIds: ReadonlySet<string>;
  /**
   * 2026-10-14 · aditivo: as linhas já calculadas pela tela (a mesma
   * `buildPlanSheetRows`, sem a SERP). A aba Artigos calcula uma vez e usa as
   * mesmas linhas para montar a tabela; ausente, o hook calcula.
   */
  baseRows?: readonly PlanSheetRow[];
  /** Releitura da mesa depois de gravar (a linha passa a "Formado · vN"). */
  onApplied: () => void;
  /** 2026-10-14 (noite) · aditivos: o Silo do território já tem o par canônico (SiloDNA + SiloPage)? */
  siloConsolidatedOf?: (territoryRef: string) => boolean;
  /**
   * Depois das linhas, o par canônico do Silo do plano (SiloDNA + SiloPage com
   * o Pilar e a ordem do plano) pela consolidação de sempre da mesa.
   */
  consolidateSiloPair?: (input: { groupId: string; territoryRef: string; pillarKeywordId: string | null }) => Promise<{ ok: boolean; message: string }>;
  /** Etapa 3: leva à aba Links internos. */
  onGoToLinks?: () => void;
};

export type PlanSheetResult = { tone: Tone; text: string };

export type PlanArticleSheetController = {
  brandId: string | null;
  rows: PlanSheetRow[];
  rowByKeywordId: ReadonlyMap<string, PlanSheetRow>;
  selected: ReadonlySet<string>;
  setSelected: Dispatch<SetStateAction<Set<string>>>;
  toggleSelected: (keywordId: string, marcar?: boolean) => void;
  results: ReadonlyMap<string, PlanSheetResult>;
  /** Prévia ou andamento em curso: os botões das linhas do plano esperam. */
  ocupado: boolean;
  busy: Busy | null;
  now: number;
  preview: Preview | null;
  setPreview: Dispatch<SetStateAction<Preview | null>>;
  error: string | null;
  setError: (value: string | null) => void;
  summary: PlanSheetResult | null;
  setSummary: (value: PlanSheetResult | null) => void;
  resumable: ImprovementRun | null;
  withdrawing: PlanSheetConflict | null;
  setWithdrawing: (value: PlanSheetConflict | null) => void;
  sugestoesHref: string | null;
  corDoRecorte: ReturnType<typeof corDoFiltro>;
  /** Muda quando a linha do plano muda (SERP lida, resultado, ocupado): a linha memoizada da mesa redesenha. */
  revision: object;
  start: (action: PlanSheetAction, alvo: PlanSheetRow[]) => void;
  /** 2026-10-14 (noite) · as três etapas do plano (uma só em destaque) e o grupo do recorte (null = mais de um plano). */
  flow: PlanFlowStep[];
  planGroupId: string | null;
  /** O botão da etapa atual. */
  runStage: (step: PlanFlowStep["id"]) => void;
  cancelPreview: () => void;
  prepareSwapPreview: (rows: PlanSheetRow[], picks: Record<string, string>, refused: PreviewLine[]) => void;
  confirmPreview: () => void;
  resume: (run: ImprovementRun) => void;
  onApplied: () => void;
};

function corDoFiltro(filter: EditorialGroupScreenFilter, rows: readonly PlanSheetRow[]) {
  return filter.kind === "groups" && filter.color ? filter.color : filter.kind === "group" ? rows.find(row => row.groupId === filter.groupId)?.color ?? null : null;
}

/**
 * A LÓGICA DAS LINHAS DO PLANO, sem tela própria: as linhas (com a SERP lida
 * do cache), a seleção, as ações (os núcleos de sempre), a prévia, o andamento
 * e o resultado por linha. Troca de marca zera tudo (nada passa adiante) e o
 * que estava em curso deixa de escrever na tela.
 */
export function usePlanArticleSheet(props: PlanArticleSheetProps): PlanArticleSheetController {
  const { brandId, brandRef, keywords, standings, groupOf, keywordGroupOf, filter, articles, radarArticleIds, onApplied, siloConsolidatedOf, consolidateSiloPair, onGoToLinks } = props;

  /* ------------- a sessão: troca de marca ou desmontagem encerram ------------- */
  const sessao = useRef(0);
  useEffect(() => {
    sessao.current += 1;
    return () => { sessao.current += 1; };
  }, [brandId]);
  /** Capturado no início de cada ação: devolve falso depois que a marca troca ou a tela sai. */
  const vivoAgora = () => { const minha = sessao.current; return () => sessao.current === minha; };

  /* --------------------------- as linhas (sem a SERP) --------------------------- */
  const calculadas = useMemo(() => props.baseRows ? null : buildPlanSheetRows({ brandId, keywords, standings, groupOf, keywordGroupOf, articles, radarArticleIds, serp: null, filter, now: new Date() }),
    [props.baseRows, brandId, keywords, standings, groupOf, keywordGroupOf, articles, radarArticleIds, filter]);
  const baseRows = useMemo(() => [...(props.baseRows ?? calculadas ?? [])], [props.baseRows, calculadas]);

  /* ---------------- a SERP em cache (grátis, só leitura) ---------------- */
  const [serpReload, setSerpReload] = useState(0);
  const [serpRead, setSerpRead] = useState<PlanSheetSerpRead | null>(null);
  // As linhas e as candidatas da troca (sustentações com volume da lista do Assunto): a ordem das candidatas usa a SERP delas.
  const serpAlvos = useMemo(() => {
    const alvos = new Map(baseRows.map(row => [row.keywordId, row.keyword]));
    for (const row of baseRows) for (const id of row.supports.withVolumeIds) {
      const texto = keywords.find(item => String(item.id) === id)?.keyword;
      if (!alvos.has(id) && typeof texto === "string" && texto.trim()) alvos.set(id, texto.trim());
    }
    return [...alvos].map(([keywordId, keyword]) => ({ keywordId, keyword }));
  }, [baseRows, keywords]);
  const serpKey = `${brandId ?? ""}#${serpReload}#${serpAlvos.map(item => item.keywordId).join(",")}`;
  useEffect(() => {
    if (!brandId || !serpAlvos.length) return;
    let ativo = true;
    void (async () => {
      // O "lendo…" entra depois do efeito (sem render em cascata dentro dele).
      await Promise.resolve();
      if (!ativo) return;
      setSerpRead(atual => ({ state: "loading", byKeyword: atual?.byKeyword ?? new Map() }));
      try {
        const mapa = new Map<string, { lenses: number; collectedAt: string | null }>();
        for (let inicio = 0; inicio < serpAlvos.length; inicio += 600) {
          const answer = await postJson("/api/arquiteto/serp-subject", { brandId, keywords: serpAlvos.slice(inicio, inicio + 600) });
          if (!answer.ok || !answer.body.success) throw new Error(answer.body.error ?? "falha na leitura");
          for (const [id, lido] of planSheetSerpByKeyword(answer.body.data as Parameters<typeof planSheetSerpByKeyword>[0])) mapa.set(id, lido);
        }
        if (ativo) setSerpRead({ state: "ready", byKeyword: mapa });
      } catch {
        if (ativo) setSerpRead({ state: "failed", byKeyword: new Map() });
      }
    })();
    return () => { ativo = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- a chave já resume marca, releitura e keywords.
  }, [serpKey]);
  const rows = useMemo(() => applyPlanSheetSerp(baseRows, serpRead), [baseRows, serpRead]);
  const rowByKeywordId = useMemo(() => new Map(rows.map(row => [row.keywordId, row])), [rows]);
  const lensesOf = (keywordId: string) => serpRead?.state === "ready" ? serpRead.byKeyword.get(keywordId)?.lenses ?? 0 : null;

  /* ------------------------------- seleção ------------------------------- */
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const corDoRecorte = corDoFiltro(filter, rows);

  /* ----------------------- prévia, andamento, resultado ----------------------- */
  const [preview, setPreview] = useState<Preview | null>(null);
  const [busy, setBusy] = useState<Busy | null>(null);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!busy) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [busy]);
  const [results, setResults] = useState<Map<string, PlanSheetResult>>(new Map());
  const [summary, setSummary] = useState<PlanSheetResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [resumable, setResumable] = useState<ImprovementRun | null>(null);
  /* 2026-10-14 · "Retirar artigo do Silo" aberto a partir da linha presa (prévia grátis; motivo e confirmação do dono). */
  const [withdrawing, setWithdrawing] = useState<PlanSheetConflict | null>(null);

  // Troca de marca: nada da marca anterior fica na tela (o mesmo efeito da remontagem).
  const [dono, setDono] = useState(brandId);
  if (dono !== brandId) {
    setDono(brandId);
    setSelected(new Set());
    setPreview(null);
    setBusy(null);
    setResults(new Map());
    setSummary(null);
    setError(null);
    setResumable(null);
    setWithdrawing(null);
    setSerpRead(null);
  }

  // F5 (recarregar a página) — a gravação da planilha interrompida é retomada daqui, sem novo aceite.
  useEffect(() => {
    if (!brandId) return;
    let ativo = true;
    void fetch(`/api/arquiteto/article-improvement?brandId=${encodeURIComponent(brandId)}`).then(r => r.json()).then(body => {
      const run = body?.data as ImprovementRun | null;
      if (ativo && run && run.origin === "plan_sheet" && run.state === "applying" && run.acceptedIds?.length) setResumable(run);
    }).catch(() => undefined);
    return () => { ativo = false; };
  }, [brandId]);

  const sugestoesHref = brandRef ? mineradorHandoffHref(brandRef, { action: "sugestoes", color: corDoRecorte }) : null;
  const nomeDe = (keywordId: string): string => {
    const daLinha = rows.find(row => row.keywordId === keywordId)?.keyword;
    if (daLinha) return daLinha;
    const daMesa = keywords.find(item => String(item.id) === keywordId)?.keyword;
    return typeof daMesa === "string" && daMesa ? daMesa : keywordId;
  };
  const ocupado = Boolean(busy) || Boolean(preview);

  const startBusy = (label: string, total: number | null = null, unit = "") => setBusy({ label, startedAt: agoraMs(), done: total === null ? null : 0, total, unit });
  const finish = (vivo: () => boolean, linhas: Map<string, PlanSheetResult>, texto: PlanSheetResult) => {
    if (!vivo()) return;
    setResults(atual => new Map([...atual, ...linhas]));
    setSummary(texto);
    setBusy(null);
  };

  /* ================================ VALIDAR SERP ================================ */
  async function validateSerp(alvo: PlanSheetRow[]) {
    if (!brandId) return;
    const vivo = vivoAgora();
    setError(null); setSummary(null);
    const escolha = planSheetSerpSelection(alvo);
    const linhas = new Map<string, PlanSheetResult>();
    for (const item of escolha.refused) linhas.set(item.keywordId, { tone: "warning", text: item.reason });
    for (const item of escolha.known) linhas.set(item.keywordId, { tone: "neutral", text: item.reason });
    if (!escolha.toPlan.length) { finish(vivo, linhas, { tone: "neutral", text: `Validar SERP: nada a coletar — ${escolha.known.length} já com as 4 lentes, ${escolha.refused.length} fora (sem volume). Nenhuma chamada paga.` }); return; }
    const blocos: { keywordId: string; keyword: string }[][] = [];
    for (let inicio = 0; inicio < escolha.toPlan.length; inicio += SERP_BLOCK) blocos.push(escolha.toPlan.slice(inicio, inicio + SERP_BLOCK).map(row => ({ keywordId: row.keywordId, keyword: row.keyword })));
    const foraPorVolume = new Map<string, string>();
    const semPlano = new Set<number>();
    const scopeId = `plan-sheet:${[...new Set(escolha.toPlan.map(row => row.groupId ?? "sem-grupo"))].sort().join("+")}`;
    const pedir = (bloco: { keywordId: string; keyword: string }[], extra: Record<string, unknown>) => postJson("/api/arquiteto/keyword-serp", { brandId, scopeId, territoryRef: null, keywords: bloco, onlyMeasuredVolume: true, ...extra });
    startBusy("Lendo no cache o que já temos e o custo do que falta (grátis)", blocos.length, "bloco(s)");
    try {
      const resultado = await runPaidSerpBlocks<{ keywordId: string; keyword: string }[], { collected: number; reused: number; gaps: number }>({
        label: PLAN_SHEET_ACTION_LABELS.validateSerp,
        blocks: blocos,
        itemIdsOf: bloco => bloco.map(item => item.keywordId),
        plan: async (bloco, indice) => {
          const answer = await pedir(bloco, { mode: "plan" });
          const data = answer.body.data as { plan?: SerpPaidPlan; excludedByVolume?: { keywordId: string; reason: string }[] } | undefined;
          for (const item of data?.excludedByVolume ?? []) foraPorVolume.set(item.keywordId, item.reason);
          // O servidor conferiu o volume no banco e nenhuma tem: o bloco fica fora, nada a pagar.
          if (answer.body.code === "KEYWORD_SERP_NO_VOLUME") { semPlano.add(indice); return ZERO_PLAN; }
          if (!answer.ok || !answer.body.success || !data?.plan) throw new Error(answer.ok && answer.body.success ? "O servidor não devolveu o custo da SERP. Nada foi pago; tente de novo." : humanError(answer));
          if (vivo()) setBusy(atual => atual ? { ...atual, done: (atual.done ?? 0) + 1 } : atual);
          return data.plan;
        },
        ask: merged => new Promise<SerpPaidPlanChoice | null>(resolve => {
          if (!vivo()) { resolve(null); return; }
          const prevista: PreviewLine[] = [
            ...escolha.toPlan.map(row => foraPorVolume.has(row.keywordId)
              ? { keywordId: row.keywordId, keyword: row.keyword, kind: "refused" as const, text: foraPorVolume.get(row.keywordId)! }
              : { keywordId: row.keywordId, keyword: row.keyword, kind: "go" as const, text: `Falta ${4 - row.serp.lenses} lente(s): coleta nas 4 lentes (cache primeiro).` }),
            ...escolha.known.map(item => ({ keywordId: item.keywordId, keyword: item.keyword, kind: "known" as const, text: item.reason })),
            ...escolha.refused.map(item => ({ keywordId: item.keywordId, keyword: item.keyword, kind: "refused" as const, text: item.reason })),
          ];
          setBusy(null);
          setPreview({ action: "validateSerp", lines: prevista, plan: merged, resolve });
        }),
        onProgress: snapshot => { if (vivo()) setBusy(atual => ({ label: "Validando a SERP nas 4 lentes", startedAt: atual?.startedAt ?? agoraMs(), done: snapshot.done, total: snapshot.total, unit: "keyword(s)" })); },
        execute: async (bloco, choice, contexto) => {
          if (semPlano.has(contexto.blockIndex)) return { result: { collected: 0, reused: 0, gaps: 0 }, outcomes: bloco.map(item => ({ id: item.keywordId, status: "failed" as const, reason: foraPorVolume.get(item.keywordId) ?? "Sem volume no banco." })) };
          const answer = await pedir(bloco, { mode: "execute", authorizedPaidQueries: choice.authorizedPaidQueries });
          const data = answer.body.data as { gaps?: { keywordId: string; lens: string; reason: string }[]; collected?: number; reused?: number } | undefined;
          if (!answer.ok || !answer.body.success) throw new Error(humanError(answer));
          const lacunas = new Map<string, string>();
          for (const gap of data?.gaps ?? []) lacunas.set(gap.keywordId, `${lacunas.has(gap.keywordId) ? `${lacunas.get(gap.keywordId)}; ` : ""}${gap.lens}: ${gap.reason}`);
          return {
            result: { collected: Number(data?.collected) || 0, reused: Number(data?.reused) || 0, gaps: lacunas.size },
            outcomes: bloco.map(item => lacunas.has(item.keywordId) ? { id: item.keywordId, status: "failed" as const, reason: lacunas.get(item.keywordId)! } : { id: item.keywordId, status: "succeeded" as const }),
          };
        },
      });
      if (resultado.status === "cancelled") { finish(vivo, linhas, { tone: "neutral", text: "Validar SERP cancelado: nenhuma chamada foi paga." }); return; }
      for (const row of escolha.toPlan) {
        const falha = resultado.snapshot.failures.find(item => item.id === row.keywordId);
        linhas.set(row.keywordId, falha ? { tone: "warning", text: `SERP incompleta: ${falha.reason}` } : { tone: "success", text: "SERP coletada nas 4 lentes (cache primeiro) e relida." });
      }
      const somas = resultado.results.reduce((total, item) => ({ collected: total.collected + item.result.collected, reused: total.reused + item.result.reused }), { collected: 0, reused: 0 });
      finish(vivo, linhas, { tone: resultado.snapshot.failed ? "warning" : "success", text: `Validar SERP: ${somas.collected} lente(s) paga(s) agora, ${somas.reused} do cache; ${resultado.snapshot.failed} keyword(s) com lacuna. A coluna SERP foi relida do cache.` });
      if (vivo()) setSerpReload(valor => valor + 1);
    } catch (e) {
      if (vivo()) { setBusy(null); setError(e instanceof Error ? e.message : "Falha ao validar a SERP."); }
    }
  }

  /* ================ CONCLUIR FORMAÇÃO / TROCAR PRINCIPAL (prévia) ================ */
  async function prepareFormation(alvo: PlanSheetRow[], action: "concludeFormation" | "swapPrincipal", picks?: Record<string, string>, extraRefused: PreviewLine[] = []) {
    if (!brandId) return;
    const vivo = vivoAgora();
    setError(null); setSummary(null); setPreview(null);
    const escolha = planSheetFormationSelection(alvo, action);
    const linhas: PreviewLine[] = [...extraRefused, ...escolha.refused.map(item => ({ keywordId: item.keywordId, keyword: item.keyword, kind: "refused" as const, text: item.reason }))];
    const runs: FormationRun[] = [];
    startBusy(action === "swapPrincipal" ? "Preparando a prévia da troca (grátis, só leitura)" : "Preparando a prévia da formação (grátis, só leitura)", escolha.byGroup.size, "cor(es)");
    for (const [indice, [groupId, linhasDoGrupo]] of [...escolha.byGroup].entries()) {
      const feitas = indice + 1;
      try {
        const escolhas = picks ? Object.fromEntries(linhasDoGrupo.filter(row => picks[row.keywordId]).map(row => [row.keywordId, picks[row.keywordId]])) : null;
        const run = await improvement({ brandId, action: "prepare", group: groupId, targetIds: linhasDoGrupo.map(row => row.keywordId), origin: "plan_sheet", ...(escolhas && Object.keys(escolhas).length ? { principalChoice: escolhas } : {}) });
        const previa = planSheetPreviewLines(run, linhasDoGrupo);
        for (const item of previa) {
          const kind: LineKind = item.kind === "will_write" ? "go" : item.kind === "needs_minerador" ? "minerador" : item.kind === "needs_serp" ? "serp" : item.kind === "adequate" ? "adequate" : "refused";
          linhas.push({ keywordId: item.keywordId, keyword: nomeDe(item.keywordId), kind, text: item.sentence });
        }
        runs.push({ groupId, run, readyIds: previa.filter(item => item.kind === "will_write").map(item => item.keywordId) });
      } catch (e) {
        for (const row of linhasDoGrupo) linhas.push({ keywordId: row.keywordId, keyword: row.keyword, kind: "refused", text: e instanceof Error ? e.message : "A prévia não foi confirmada." });
      }
      if (vivo()) setBusy(atual => atual ? { ...atual, done: feitas } : atual);
    }
    if (!vivo()) return;
    setBusy(null);
    setPreview({ action, lines: linhas, runs });
  }

  /* ================ CONCLUIR FORMAÇÃO / TROCAR PRINCIPAL (gravar) ================ */
  async function applyRun(vivo: () => boolean, run: ImprovementRun, readyIds: string[] | null, contar: (feitos: number) => void): Promise<ImprovementRun> {
    let current = run.state === "applying" && run.acceptedIds ? await improvement({ brandId, action: "apply", runId: run.runId, decisionHash: run.decisionHash })
      : await improvement({ brandId, action: "apply", runId: run.runId, decisionHash: run.decisionHash, ...(readyIds ? { targetIds: readyIds } : {}) });
    let tentativas = 0;
    // 2026-10-14 · sem avanço por ≈ 2 minutos (vez ocupada por outra gravação da marca), para com a frase e deixa retomar.
    let semAvanco = 0, feitosAntes = current.outcomes.length;
    // Um artigo por chamada; tempo esgotado ou vez ocupada não param a gravação: o andamento está salvo no servidor.
    while (vivo() && current.state === "applying") {
      contar(current.outcomes.length);
      if (current.outcomes.length > feitosAntes) { feitosAntes = current.outcomes.length; semAvanco = 0; }
      else if (++semAvanco > APPLY_STALL_LIMIT) {
        if (vivo()) setResumable(current);
        throw new Error(`A gravação parou de avançar (${current.outcomes.length} de ${current.acceptedIds?.length ?? "?"} gravado(s)): o servidor respondeu várias vezes sem gravar nada novo — em geral, outra gravação desta marca está com a vez. O que já foi gravado ficou salvo; use “Continuar a gravação” em instantes (sem novo aceite). Se parar de novo, recarregue a página.`);
      }
      try {
        if (current.leaseUntil && Date.parse(current.leaseUntil) > agoraMs()) { await wait(3000); current = await improvement({ brandId, action: "status", runId: current.runId }); }
        else current = await improvement({ brandId, action: "apply", runId: current.runId, decisionHash: current.decisionHash });
        tentativas = 0;
      } catch (e) {
        if (++tentativas > 3) throw e;
        await wait(2000);
        current = await improvement({ brandId, action: "status", runId: current.runId });
      }
    }
    contar(current.outcomes.length);
    return current;
  }

  async function confirmFormation(action: "concludeFormation" | "swapPrincipal", runs: FormationRun[], previa: PreviewLine[]) {
    const vivo = vivoAgora();
    setPreview(null); setError(null);
    const total = runs.reduce((soma, item) => soma + item.readyIds.length, 0);
    const linhas = new Map<string, PlanSheetResult>();
    for (const item of previa) if (item.kind !== "go") linhas.set(item.keywordId, { tone: item.kind === "adequate" ? "neutral" : "warning", text: `Não gravado: ${item.text}` });
    if (!total) { finish(vivo, linhas, { tone: "warning", text: "Nada a gravar: nenhuma linha ficou pronta na prévia. Veja o motivo de cada uma." }); return; }
    startBusy(action === "swapPrincipal" ? "Gravando a troca de principal (nova versão do ArticleDNA)" : "Concluindo a formação (ArticleDNA, composição e parecer)", total, "artigo(s)");
    let antes = 0, gravados = 0, falhas = 0;
    try {
      for (const item of runs) {
        if (!item.readyIds.length) continue;
        const base = antes;
        const fim = await applyRun(vivo, item.run, item.readyIds, feitos => { if (vivo()) setBusy(atual => atual ? { ...atual, done: base + feitos } : atual); });
        antes += item.readyIds.length;
        for (const id of item.readyIds) {
          const desfecho = planSheetOutcomeSentence(fim.outcomes.find(outcome => outcome.targetId === id));
          if (desfecho.tone === "success") gravados += 1; else if (desfecho.tone === "warning") falhas += 1;
          linhas.set(id, desfecho);
        }
      }
      finish(vivo, linhas, { tone: falhas ? "warning" : "success", text: `${action === "swapPrincipal" ? PLAN_SHEET_ACTION_LABELS.swapPrincipal : PLAN_SHEET_ACTION_LABELS.concludeFormation}: ${gravados} gravado(s) e relido(s)${falhas ? `, ${falhas} com falha` : ""}; ${previa.filter(line => line.kind !== "go").length} fora desta confirmação. Nada foi gravado no Minerador.` });
      if (vivo()) onApplied();
    } catch (e) {
      if (vivo()) { setBusy(null); setResults(atual => new Map([...atual, ...linhas])); setError(e instanceof Error ? e.message : "A gravação não foi confirmada."); onApplied(); }
    }
  }

  async function resume(run: ImprovementRun) {
    const vivo = vivoAgora();
    setResumable(null); setError(null);
    startBusy("Continuando a gravação interrompida", run.acceptedIds?.length ?? null, "artigo(s)");
    try {
      const fim = await applyRun(vivo, run, null, feitos => { if (vivo()) setBusy(atual => atual ? { ...atual, done: feitos } : atual); });
      const linhas = new Map<string, PlanSheetResult>();
      for (const id of fim.acceptedIds ?? []) linhas.set(id, planSheetOutcomeSentence(fim.outcomes.find(outcome => outcome.targetId === id)));
      finish(vivo, linhas, { tone: "success", text: "Gravação interrompida retomada e relida. Nada foi gravado no Minerador." });
      if (vivo()) onApplied();
    } catch (e) {
      if (vivo()) { setBusy(null); setError(e instanceof Error ? e.message : "A retomada não foi confirmada."); }
    }
  }

  /* ========================= TROCAR PRINCIPAL (escolha) ========================= */
  function chooseSwap(alvo: PlanSheetRow[]) {
    if (!brandId) return;
    setError(null); setSummary(null);
    const candidates: Record<string, PlanSwapCandidate[]> = {}, picks: Record<string, string> = {};
    const livres: PlanSheetRow[] = [], recusadas: PreviewLine[] = [];
    for (const row of alvo) {
      const linha = keywords.find(item => String(item.id) === row.keywordId);
      const deOutros = new Set(articles.filter(article => article.subjectKeywordId !== row.keywordId).flatMap(article => article.keywordIds));
      const lido = linha ? planPrincipalSwapCandidates({ brandId, subjectRow: linha, rows: keywords, currentPrincipalId: row.currentPrincipalId, keywordIdsInOtherArticles: deOutros, lensesOf, now: new Date() }) : { ok: false as const, reason: "A keyword saiu da mesa." };
      if (!lido.ok) { recusadas.push({ keywordId: row.keywordId, keyword: row.keyword, kind: "refused", text: lido.reason }); continue; }
      if (!lido.candidates.length) { recusadas.push({ keywordId: row.keywordId, keyword: row.keyword, kind: "refused", text: "Sem candidata: nenhuma sustentação com volume medido na lista do Assunto (Pesquisa por Assunto, no Minerador)." }); continue; }
      livres.push(row);
      candidates[row.keywordId] = lido.candidates;
      picks[row.keywordId] = lido.candidates[0].keywordId;
    }
    setPreview({ action: "chooseSwap", rows: livres, candidates, picks, refused: recusadas });
  }

  /* ======================= CONSOLIDAR O SILO DO PLANO (2026-10-14, noite) ======================= */
  async function consolidate() {
    if (!brandId || !planGroupId) return;
    const vivo = vivoAgora();
    setError(null); setSummary(null); setPreview(null);
    startBusy("Preparando a prévia da consolidação (grátis, só leitura)");
    const answer = await postJson("/api/arquiteto/plan-silo/consolidate", { brandId, groupId: planGroupId, mode: "preview" });
    if (!vivo()) return;
    setBusy(null);
    if (!answer.ok || !answer.body.success) { setError(humanError(answer)); return; }
    const data = answer.body.data as PlanConsolidationPreviewData;
    const lines: PreviewLine[] = data.lines.map(line => ({
      keywordId: line.keywordId,
      keyword: line.keyword,
      kind: line.action === "write" ? "go" : line.action === "keep" ? "known" : "refused",
      text: `${line.role} · ${line.order}º · ${line.sentence}${line.alerts.length ? ` Alertas: ${line.alerts.join("; ")}.` : ""}`,
    }));
    setPreview({ action: "consolidate", lines, data });
  }

  async function confirmConsolidation(data: PlanConsolidationPreviewData) {
    if (!brandId) return;
    const vivo = vivoAgora();
    setPreview(null); setError(null);
    const linhas = new Map<string, PlanSheetResult>();
    for (const line of data.lines) if (line.action === "refused") linhas.set(line.keywordId, { tone: "warning", text: `Fora desta consolidação: ${line.sentence}` });
    const aceitas = data.acceptedKeywordIds;
    let territoryRef: string | null = data.territory.territoryRef ?? null;
    let gravados = 0, falhas = 0;
    if (aceitas.length) startBusy("Consolidando o Silo do plano (artigos do plano, sem SERP)", aceitas.length, "artigo(s)");
    // Uma linha por chamada (o tempo do servidor), com o MESMO hash da prévia: a confirmação é uma só.
    for (const [indice, keywordId] of aceitas.entries()) {
      const answer = await postJson("/api/arquiteto/plan-silo/consolidate", { brandId, groupId: data.groupId, mode: "apply", decisionHash: data.decisionHash, acceptedKeywordIds: aceitas, keywordId });
      if (!vivo()) return;
      if (answer.ok && answer.body.success) {
        const resultado = answer.body.data as { status: string; message: string; territoryRef: string | null };
        territoryRef = resultado.territoryRef ?? territoryRef;
        if (resultado.status === "written") gravados += 1;
        linhas.set(keywordId, { tone: resultado.status === "refused" ? "warning" : "success", text: resultado.message });
      } else {
        falhas += 1;
        linhas.set(keywordId, { tone: "warning", text: humanError(answer) });
      }
      setBusy(atual => atual ? { ...atual, done: indice + 1 } : atual);
    }
    // Depois das linhas, o par canônico do Silo (SiloDNA + SiloPage com o Pilar e a ordem do plano).
    let silo: { ok: boolean; message: string } | null = null;
    const par = data.siloPair;
    if (par?.state === "fix" && !falhas) {
      // 2026-10-15 · o par já existe com o tema errado (ou fora do plano): a versão seguinte pelo núcleo de "Aplicar o plano declarado ao Silo", na mesma confirmação.
      setBusy({ label: `${PLAN_SILO_PAIR_FIX_LABEL} (v${par.nextVersion})`, startedAt: agoraMs(), done: null, total: null, unit: "" });
      const answer = await postJson("/api/arquiteto/silo-declared-plan", { brandId, siloId: par.siloId, mode: "apply", expectedSiloDnaVersionId: par.siloDnaVersionId, decisionHash: par.decisionHash });
      if (!vivo()) return;
      const feito = answer.body.data as { state?: string; siloDna?: { versionNumber: number }; siloPage?: { versionNumber: number }; message?: string } | undefined;
      silo = answer.ok && answer.body.success
        ? feito?.state === "APPLIED"
          ? { ok: true, message: `SiloDNA v${feito.siloDna?.versionNumber} e SiloPage v${feito.siloPage?.versionNumber} gravados e relidos, com o tema do Silo do plano.` }
          : { ok: true, message: feito?.message ?? "O Silo já segue o plano: nenhuma versão nova." }
        : { ok: false, message: humanError(answer) };
    } else if (par && par.state !== "missing") {
      silo = par.state === "refused" ? { ok: false, message: par.sentence } : null;
    } else if (territoryRef && consolidateSiloPair && !falhas) {
      setBusy({ label: "Gravando o SiloDNA e a SiloPage do plano (Pilar e ordem do plano)", startedAt: agoraMs(), done: null, total: null, unit: "" });
      try { silo = await consolidateSiloPair({ groupId: data.groupId, territoryRef, pillarKeywordId: data.pillarKeywordId }); }
      catch (e) { silo = { ok: false, message: e instanceof Error ? e.message : "A consolidação do Silo não foi confirmada." }; }
      if (!vivo()) return;
    }
    const fora = data.lines.filter(line => line.action === "refused").length;
    const textoSilo = silo ? ` Silo: ${silo.message}` : falhas ? " O Silo não foi consolidado: resolva as linhas com falha e consolide de novo." : "";
    finish(vivo, linhas, { tone: falhas || (silo && !silo.ok) ? "warning" : "success", text: `${PLAN_FLOW_LABELS.consolidate}: ${gravados} artigo(s) gravado(s) e relido(s)${falhas ? `, ${falhas} com falha` : ""}${fora ? `; ${fora} fora (motivo na linha)` : ""}.${textoSilo} Nada foi gravado no Minerador; nada foi pago.` });
    if (vivo()) onApplied();
  }

  /** O botão da etapa atual: 1 consolidar; 2 SERP das principais e depois a formação com parecer e sustentações; 3 Links internos. */
  function runStage(step: PlanFlowStep["id"]) {
    if (ocupado) return;
    if (step === 1) { void consolidate(); return; }
    if (step === 2) {
      const passo = planStepTwoAction(rows);
      if (!passo) return;
      if (passo.action === "validateSerp") void validateSerp(passo.rows);
      else void prepareFormation(passo.rows, "concludeFormation");
      return;
    }
    onGoToLinks?.();
  }

  function start(action: PlanSheetAction, alvo: PlanSheetRow[]) {
    if (!alvo.length || ocupado) return;
    if (action === "validateSerp") void validateSerp(alvo);
    else if (action === "swapPrincipal") chooseSwap(alvo);
    else void prepareFormation(alvo, "concludeFormation");
  }

  function cancelPreview() {
    if (preview?.action === "validateSerp") preview.resolve(null);
    setPreview(null);
  }

  /** O botão principal da prévia aberta: autorizar a SERP, ou gravar o que ficou pronto. */
  function confirmPreview() {
    if (!preview) return;
    if (preview.action === "validateSerp") {
      const resolver = preview.resolve;
      setPreview(null);
      resolver({ authorizedPaidQueries: preview.plan.paidQueries, payMissingExtraLenses: true, recollectStaleLenses: false });
    } else if (preview.action === "concludeFormation" || preview.action === "swapPrincipal") {
      void confirmFormation(preview.action, preview.runs, preview.lines);
    } else if (preview.action === "consolidate") {
      void confirmConsolidation(preview.data);
    }
  }

  const gruposDoRecorte = [...new Set(rows.map(row => row.groupId).filter((id): id is string => Boolean(id)))];
  const planGroupId = gruposDoRecorte.length === 1 ? gruposDoRecorte[0] : null;
  const territoriosDoPlano = [...new Set(rows.map(row => row.territoryRef).filter((ref): ref is string => Boolean(ref)))];
  const siloConsolidado = territoriosDoPlano.length > 0 && territoriosDoPlano.every(ref => siloConsolidatedOf?.(ref) ?? false);
  const flow = useMemo(() => planFlowSteps({ rows, siloConsolidated: siloConsolidado }), [rows, siloConsolidado]);

  const toggleSelected = (keywordId: string, marcar?: boolean) => setSelected(atual => {
    const proximo = new Set(atual);
    if (marcar ?? !proximo.has(keywordId)) proximo.add(keywordId); else proximo.delete(keywordId);
    return proximo;
  });

  const revision = useMemo(() => ({ rows, results, ocupado }), [rows, results, ocupado]);

  return {
    brandId, rows, rowByKeywordId, selected, setSelected, toggleSelected, results, ocupado, busy, now, preview, setPreview,
    error, setError, summary, setSummary, resumable, withdrawing, setWithdrawing, sugestoesHref, corDoRecorte, revision,
    start, flow, planGroupId, runStage, cancelPreview, prepareSwapPreview: (alvo, picks, refused) => { void prepareFormation(alvo, "swapPrincipal", picks, refused); },
    confirmPreview, resume: run => { void resume(run); }, onApplied,
  };
}

type SheetClassNames = {
  buttonClassName: string;
  primaryButtonClassName: string;
  controlClassName: string;
  /** 2026-10-14 · aditivo: o botão de "Confirmar retirada" (perigo); ausente = o botão comum. */
  dangerButtonClassName?: string;
};

/**
 * A PRÉVIA, O ANDAMENTO E O RESULTADO das ações das linhas do plano. Só
 * aparece quando há algo a mostrar (uma ação em curso, uma prévia a confirmar,
 * o resultado da última ação, a retirada aberta). Na aba Artigos ela fica logo
 * abaixo da barra de sempre — não é painel fixo de texto.
 */
export function PlanSheetOperations({ sheet, buttonClassName, primaryButtonClassName, controlClassName, dangerButtonClassName }: SheetClassNames & { sheet: PlanArticleSheetController }) {
  const { brandId, preview, busy, now, error, summary, resumable, withdrawing, sugestoesHref } = sheet;
  const withdrawRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => { if (withdrawing) withdrawRef.current?.scrollIntoView?.({ block: "nearest", behavior: "smooth" }); }, [withdrawing]);
  const previewRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => { if (preview) previewRef.current?.scrollIntoView?.({ block: "nearest", behavior: "smooth" }); }, [preview]);
  if (!brandId) return null;
  if (!preview && !busy && !error && !summary && !resumable && !(withdrawing && withdrawing.siloRef)) return null;
  const perigo = dangerButtonClassName ?? buttonClassName;
  const tituloDaPrevia = preview?.action === "consolidate" ? `${PLAN_FLOW_LABELS.consolidate} · prévia`
    : preview?.action === "validateSerp" ? `${PLAN_SHEET_ACTION_LABELS.validateSerp} · custo antes`
    : preview?.action === "chooseSwap" ? `${PLAN_SHEET_ACTION_LABELS.swapPrincipal} · escolha a nova principal`
    : preview?.action === "swapPrincipal" ? `${PLAN_SHEET_ACTION_LABELS.swapPrincipal} · prévia`
    : preview ? `${PLAN_SHEET_ACTION_LABELS.concludeFormation} · prévia` : "";

  return <div className="text-sm" data-testid="architect-plan-operations">
    {withdrawing && withdrawing.siloRef && <div ref={withdrawRef} className="mt-3 rounded-md border border-warning/40 bg-surface-subtle p-3" role="region" aria-label={SILO_ARTICLE_WITHDRAWAL_ACTION_LABEL} data-testid="architect-plan-sheet-withdraw" data-article-id={withdrawing.articleId}>
      <p className="font-semibold text-foreground">{SILO_ARTICLE_WITHDRAWAL_ACTION_LABEL} · {withdrawing.slug ?? withdrawing.label}{withdrawing.siloLabel ? ` (Silo “${withdrawing.siloLabel}”)` : ""}</p>
      <p className="mt-1 text-text-muted">Retirar é decisão sua: a prévia (grátis) mostra o que muda; depois, o motivo e “Confirmar retirada”. O ArticleDNA fica como histórico (rejeitado), nada é apagado, e as keywords dele ficam livres para o artigo do plano.</p>
      <SiloArticleWithdrawalPanel
        brandId={brandId}
        siloId={withdrawing.siloRef}
        articles={[{ articleId: withdrawing.articleId, label: withdrawing.label, subjectPhrase: withdrawing.subjectPhrase }]}
        classNames={{ button: buttonClassName, dangerButton: perigo, control: controlClassName }}
        notify={(tipo, mensagem) => { if (tipo === "error") sheet.setError(mensagem); else sheet.setSummary({ tone: tipo === "success" ? "success" : "warning", text: mensagem }); }}
        onApplied={() => { sheet.setWithdrawing(null); sheet.onApplied(); }}
        autoOpenArticleId={withdrawing.articleId}
        itemPrefix="Artigo"
      />
      <button type="button" className={`${buttonClassName} mt-2`} onClick={() => sheet.setWithdrawing(null)}>Fechar</button>
    </div>}

    {resumable && !busy && <div className="mt-2 flex flex-wrap items-center gap-2 text-foreground" role="status" data-testid="architect-plan-sheet-resume">
      <span>Há uma gravação dos artigos do plano interrompida ({resumable.outcomes.length} de {resumable.acceptedIds?.length ?? 0}). O aceite já foi dado; continuar não pede outro.</span>
      <button type="button" className={buttonClassName} onClick={() => sheet.resume(resumable)}>Continuar a gravação</button>
    </div>}

    {busy && <OperationProgress label={busy.label} startedAt={busy.startedAt} now={now} done={busy.done} total={busy.total} unit={busy.unit} note="nada é gravado no Minerador" testId="architect-plan-sheet-progress" />}
    {error && <p role="alert" className="mt-2 text-warning">{error}</p>}
    {summary && !busy && <div className="mt-2 flex flex-wrap items-center gap-2">
      <p role="status" className={TONE_CLASS[summary.tone]} data-testid="architect-plan-sheet-summary">{summary.text}</p>
      <button type="button" className={buttonClassName} onClick={() => sheet.setSummary(null)} data-testid="architect-plan-sheet-summary-close">Fechar</button>
    </div>}

    {preview && <div ref={previewRef} className="mt-3 rounded-md border border-divider bg-surface-subtle p-3" role="region" aria-label={tituloDaPrevia} data-testid="architect-plan-sheet-preview" data-action={preview.action}>
      <h4 className="font-semibold text-foreground">{tituloDaPrevia}</h4>
      {preview.action === "validateSerp" && (() => {
        const frases = describeSerpPaidPlan(preview.plan);
        return <div className="mt-1 grid gap-0.5">
          {frases.cacheWarning && <p className="text-warning">{frases.cacheWarning}</p>}
          <p className="text-foreground" data-testid="architect-plan-sheet-serp-cost">{frases.headline}{frases.cost ? ` ${frases.cost}` : ""}</p>
          {frases.dates && <p className="text-text-muted">{frases.dates}</p>}
          <p className="text-text-muted">O que já está no cache não é pago de novo. O servidor confere no banco o volume de cada keyword: sem volume, nada é coletado.</p>
        </div>;
      })()}
      {preview.action === "consolidate" && <div className="mt-1 grid gap-0.5" data-testid="architect-plan-consolidation-preview">
        <p className="text-foreground">{preview.data.territory.sentence}</p>
        {preview.data.siloPair && preview.data.siloPair.state !== "missing" && <p className={preview.data.siloPair.state === "fix" ? "text-foreground" : preview.data.siloPair.state === "refused" ? "text-warning" : "text-text-muted"} data-testid="architect-plan-consolidation-silo-pair" data-state={preview.data.siloPair.state}>{preview.data.siloPair.sentence}</p>}
        <p className="text-text-muted">{preview.data.summary} Cada artigo grava o ArticleDNA v1 com o que veio do Minerador (Assunto = título; principal = a keyword do plano; papel e ordem do plano; escopo como promessa); depois o SiloDNA e a SiloPage com o Pilar e a ordem do plano. Decisão sua, registrada como “consolidado do plano do Minerador”.</p>
      </div>}
      {preview.action === "chooseSwap" && <p className="mt-1 text-text-muted">Só artigo do plano com a trava Livre. As candidatas são a keyword do Assunto e as sustentações com volume medido da lista dele, das que têm mais lentes de SERP e mais volume. A prévia (grátis) mostra o que muda; gravar é a sua confirmação e gera uma nova versão.</p>}
      {(preview.action === "concludeFormation" || preview.action === "swapPrincipal") && <p className="mt-1 text-text-muted">Grava só o ArticleDNA, a composição e o parecer, pelo mesmo núcleo da formação; nada é gravado no Minerador. Uma confirmação vale para as linhas “vai gravar”; as outras ficam como estão, com o motivo.</p>}

      {preview.action === "chooseSwap"
        ? <ul className="mt-2 grid gap-2">
          {preview.rows.map(row => <li key={row.keywordId} className="flex flex-wrap items-center gap-2">
            <label className="flex flex-wrap items-center gap-2 text-foreground">
              <span><span className="text-keyword">{row.keyword}</span> → </span>
              <select className={controlClassName} value={preview.picks[row.keywordId]} aria-label={`Nova principal de ${row.title}`} onChange={event => sheet.setPreview(atual => atual && atual.action === "chooseSwap" ? { ...atual, picks: { ...atual.picks, [row.keywordId]: event.target.value } } : atual)}>
                {preview.candidates[row.keywordId].map(candidate => <option key={candidate.keywordId} value={candidate.keywordId}>{planSwapCandidateLabel(candidate)}</option>)}
              </select>
            </label>
            <span className="text-text-muted">{preview.candidates[row.keywordId].find(candidate => candidate.keywordId === preview.picks[row.keywordId])?.reason}</span>
          </li>)}
          {preview.refused.map(line => <li key={line.keywordId} className={LINE_TONE[line.kind]} data-testid="architect-plan-sheet-preview-line" data-kind={line.kind}><span className="text-keyword">{line.keyword}</span> · {line.text}</li>)}
        </ul>
        : <ul className="mt-2 grid gap-1">
          {preview.lines.map(line => <li key={line.keywordId} className={LINE_TONE[line.kind]} data-testid="architect-plan-sheet-preview-line" data-kind={line.kind}>
            <span className="text-keyword">{line.keyword}</span> · {line.text}
            {line.kind === "minerador" && sugestoesHref && <> · <a href={sugestoesHref} className="font-medium text-module-accent underline underline-offset-2">Abrir “{ARCHITECT_SUGGESTIONS_LABEL}” no Minerador</a></>}
          </li>)}
        </ul>}

      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" className={buttonClassName} onClick={sheet.cancelPreview}>Cancelar</button>
        {preview.action === "validateSerp" && <button type="button" className={primaryButtonClassName} data-testid="architect-plan-sheet-confirm" onClick={sheet.confirmPreview}>{preview.plan.paidQueries > 0 ? `Autorizar ${preview.plan.paidQueries} consulta(s) e validar` : "Ler do cache (sem custo)"}</button>}
        {preview.action === "consolidate" && <button type="button" className={primaryButtonClassName} data-testid="architect-plan-sheet-confirm" onClick={sheet.confirmPreview}>Confirmar e consolidar</button>}
        {preview.action === "chooseSwap" && <button type="button" className={primaryButtonClassName} disabled={!preview.rows.length} data-testid="architect-plan-sheet-swap-preview" onClick={() => sheet.prepareSwapPreview(preview.rows, preview.picks, preview.refused)}>Ver prévia da troca (grátis)</button>}
        {(preview.action === "concludeFormation" || preview.action === "swapPrincipal") && (() => {
          const prontas = preview.runs.reduce((soma, item) => soma + item.readyIds.length, 0);
          return <button type="button" className={primaryButtonClassName} disabled={!prontas} data-testid="architect-plan-sheet-confirm" onClick={sheet.confirmPreview}>{preview.action === "swapPrincipal" ? "Confirmar a troca" : "Confirmar e gravar"}</button>;
        })()}
      </div>
    </div>}
  </div>;
}

/* ===================== a linha do plano DENTRO da tabela de artigos ===================== */

/** Os selos curtos da linha do plano (trava, volume, SERP, formação ou conflito) e o resultado da última ação. */
export function PlanRowSeals({ row, result = null, className = "" }: { row: PlanSheetRow; result?: PlanSheetResult | null; className?: string }) {
  return <div className={className} data-testid="architect-plan-row-seals" data-keyword-id={row.keywordId}>
    <div className="flex flex-wrap items-center gap-1">
      {planRowSeals(row).map(selo => <span key={selo.kind} data-plan-seal={selo.kind} title={selo.title} className={`inline-flex min-h-6 items-center rounded border px-1.5 text-sm leading-tight ${SEAL_TONE[selo.tone]}`}>{selo.label}</span>)}
    </div>
    {(() => {
      // 2026-10-14 (noite) · o que falta é ALERTA curto (o porquê no title), nunca bloqueio.
      const alertas = planRowAlerts(row).filter(alerta => alerta.kind !== "conflict");
      return alertas.length ? <p className="mt-1 text-sm leading-6 text-warning" data-testid="architect-plan-row-alerts">{alertas.map((alerta, indice) => <span key={alerta.kind} title={alerta.title}>{indice ? " · " : ""}{alerta.label}</span>)}</p> : null;
    })()}
    {result && <p className={`mt-1 text-sm leading-6 ${TONE_CLASS[result.tone]}`} data-testid="architect-plan-row-result">{result.text}</p>}
  </div>;
}

/**
 * As ações por linha do artigo do plano. 2026-10-14 (noite) · pedido do dono:
 * "para que (…) uma quantidade de botões que são para fazer e desfazer". Os
 * processos estão na barra (uma etapa por vez); na linha fica só o que é DELA:
 * "Procurar outra principal…" quando a principal pode trocar (sem volume e
 * livre — volume definido nunca troca; travada nunca muda) e "Retirar artigo
 * do Silo" quando a keyword está presa em outro artigo (prévia; decisão do dono).
 */
export function PlanRowActions({ sheet, row, buttonClassName }: { sheet: PlanArticleSheetController; row: PlanSheetRow; buttonClassName: string }) {
  const podeTrocar = row.lock.state === "free" && !(row.volume.state === "measured" && (row.volume.value ?? 0) > 0);
  if (!row.conflict && !podeTrocar) return null;
  return <div className="flex flex-wrap items-center justify-end gap-1" data-testid="architect-plan-row-actions" data-keyword-id={row.keywordId}>
    {row.conflict && (row.conflict.siloRef
      ? <button type="button" className={buttonClassName} disabled={sheet.ocupado} data-testid="architect-plan-row-withdraw" title={row.conflict.sentence} onClick={() => sheet.setWithdrawing(row.conflict)}>{SILO_ARTICLE_WITHDRAWAL_ACTION_LABEL}</button>
      : <span className="text-sm text-text-muted" title={row.conflict.sentence}>Retire em Silos</span>)}
    {podeTrocar && <button type="button" className={buttonClassName} disabled={sheet.ocupado} data-plan-action="swapPrincipal" title={`${row.lock.label}. ${row.lock.why}`} onClick={() => sheet.start("swapPrincipal", [row])}>{PLAN_SHEET_ACTION_LABELS.swapPrincipal}</button>}
  </div>;
}

/**
 * A LINHA DO PLANO SEM ARTIGO NA MESA, com as colunas da tabela de artigos de
 * sempre (`columns` é a lista de colunas da tabela, na ordem dela). Ainda não é
 * Article: não tem ArticleDNA nem `articleId` (a identidade é o `keywordId`).
 */
export function PlanArticleTableRow({ sheet, row, columns, buttonClassName, stripeClassName = "" }: {
  sheet: PlanArticleSheetController;
  row: PlanSheetRow;
  columns: readonly string[];
  buttonClassName: string;
  /** A faixa da cor do grupo na primeira coluna (a mesma da linha do artigo). */
  stripeClassName?: string;
}) {
  const marcada = sheet.selected.has(row.keywordId);
  const resultado = sheet.results.get(row.keywordId) ?? null;
  const celula = (columnId: string) => {
    switch (columnId) {
      case "index":
        return <td key={columnId} className={`sticky left-0 z-10 border-r border-divider bg-surface px-2 py-1 text-right font-mono text-sm tabular-nums text-text-muted ${stripeClassName}`}>{row.order}</td>;
      case "selection":
        return <td key={columnId} className="border-r border-divider px-2 py-1">
          <input type="checkbox" role="checkbox" aria-checked={marcada} checked={marcada} onChange={() => sheet.toggleSelected(row.keywordId)} aria-label={`Selecionar o artigo do plano ${row.title}`} data-plan-selection-id={row.keywordId} className="h-4 w-4 cursor-pointer rounded border-divider bg-surface-subtle accent-module-accent" />
        </td>;
      case "expand":
        return <td key={columnId} className="border-r border-divider px-2 py-1" />;
      case "article":
        return <td key={columnId} className="border-r border-divider px-3 py-2">
          <p className="text-sm font-semibold uppercase tracking-wider text-module-accent">Artigo do plano</p>
          <p className="mt-0.5 text-sm text-text-muted">Ainda sem ArticleDNA</p>
        </td>;
      case "keyword":
        return <td key={columnId} className="min-w-0 border-r border-divider px-3 py-2">
          <div className="mb-1"><ArticleSubjectLine phrase={row.title} /></div>
          <p className="break-words text-sm font-semibold text-keyword" title={row.keyword}>{row.keyword}</p>
          {row.color ? <EditorialGroupTag name={planSheetColorLabel(row)} color={row.color} className="mt-1" /> : null}
          <PlanRowSeals row={row} result={resultado} className="mt-1" />
        </td>;
      case "keywordCount":
        return <td key={columnId} className="border-r border-divider px-2 py-2 text-center text-sm text-text-muted" title="A composição sai na formação: a keyword do Assunto e as sustentações da lista dele.">{row.supports.count} sustentação(ões)</td>;
      case "siloRole":
        return <td key={columnId} className="border-r border-divider px-2 py-2 text-center">
          <span className={`inline-flex rounded-md border px-2 py-1 text-sm font-semibold ${row.role === "Pilar" ? "border-positive-soft/40 bg-positive-soft/10 text-positive-soft" : "border-divider text-text-muted"}`} data-testid="architect-plan-row-role">{planRowRoleLabel(row)}</span>
        </td>;
      case "articleDefinition":
        return <td key={columnId} className={`border-r border-divider px-2 py-2 text-center text-sm ${row.formation.state === "conflict" || row.formation.state === "awaiting_principal" ? "text-warning" : "text-text-muted"}`}>{row.formation.label}</td>;
      case "silo":
        return <td key={columnId} className="border-r border-divider px-2 py-2 text-sm text-foreground">{planSheetColorLabel(row)}</td>;
      case "actions":
        return <td key={columnId} className="border-r border-divider px-2 py-2"><PlanRowActions sheet={sheet} row={row} buttonClassName={buttonClassName} /></td>;
      case "approval":
        return <td key={columnId} className="border-r border-divider px-2 py-2 text-sm text-text-muted" title="Sem ArticleDNA ainda: a decisão vem com Concluir formação.">—</td>;
      case "status":
        return <td key={columnId} className="px-2 py-2 text-sm text-text-muted" title="Artigo do plano do Minerador; a versão vigente do plano é a do grupo.">Do plano</td>;
      default:
        return <td key={columnId} className="border-r border-divider px-2 py-2" />;
    }
  };
  return <tr className={`border-b border-divider align-top ${marcada ? "bg-selected" : "hover:bg-surface-elevated"}`} data-testid="architect-plan-table-row" data-keyword-id={row.keywordId} data-order={row.order} data-lock={row.lock.state} data-formation={row.formation.state}>
    {columns.map(celula)}
  </tr>;
}
