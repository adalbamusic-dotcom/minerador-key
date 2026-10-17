"use client";
import { useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from "react";
import { EditorialGroupTag } from "@/components/editorial/group-tag";
import { ArticleSubjectLine } from "@/components/editorial/article-subject-line";
import { OperationProgress } from "./operation-progress";
import type { ImprovementRun } from "@/lib/server/arquiteto-article-improvement";
import type { ArchitectSubjectStanding } from "@/lib/arquiteto/declared-subject";
import type { EditorialGroupScreenFilter } from "@/lib/editorial/editorial-groups";
import { ARCHITECT_SUGGESTIONS_LABEL, mineradorHandoffHref } from "@/lib/arquiteto/minerador-suggestions";
import { improvementNewKeywordsPreview } from "@/lib/arquiteto/article-improvement-minerador";
import {
  PLAN_SHEET_ACTION_LABELS,
  applyPlanSheetSerp, planRowAlerts, buildPlanSheetRows, planPrincipalSwapCandidates, planRowDefinition, planRowRoleLabel, planRowSeals, planSheetColorLabel, planSheetConclusionChecklist, planSheetFormationSelection,
  planSheetOutcomeSentence, planSheetPreviewLines, planSheetSequence, planSheetSerpByKeyword, planSheetServerErrorSentence, planSheetWorkingCopyLines, planSwapCandidateLabel,
  type PlanConclusionCheck, type PlanRowDefinition, type PlanRowSeal, type PlanSheetAction, type PlanSheetArticle, type PlanSheetConflict, type PlanSheetPreviewLine, type PlanSheetRow, type PlanSheetSerpRead, type PlanSwapCandidate,
} from "@/lib/arquiteto/plan-article-sheet";
import { SILO_ARTICLE_WITHDRAWAL_ACTION_LABEL } from "@/lib/arquiteto/silo-article-withdrawal";
import { SiloArticleWithdrawalPanel } from "./silo-article-withdrawal-panel";

/**
 * F5 · PLANILHA PRIMEIRO (SDD `docs/compartilhado/sdd-arquiteto-so-le-e-listas-leves-2026-10-13.md`,
 * item 5). Os artigos do plano como LINHAS, com as ações na linha e no lote:
 * prévia (grátis) → UMA confirmação → recusa por item → andamento → resultado
 * por linha → releitura.
 *
 * Um caminho só (2026-10-17, noite: "Processar artigos" SUBSTITUI o "Validar
 * SERP" pela rota `keyword-serp`): "Processar artigos", "Concluir formação" e
 * "Trocar principal" são a melhoria recortada por grupo
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
 * confuso"): a planilha separada saiu de vez (nem para os testes); na linha
 * ficam só "Procurar outra principal" (sem volume e Livre) e "Retirar artigo
 * do Silo" (presa em outro artigo).
 *
 * 2026-10-16 · RESTAURAÇÃO DO FLUXO DE SEMPRE (ordem do dono: "tem que voltar
 * tudo, mas sem os erros, nem esse monte de botões, nem processo em paralelo"):
 * as linhas do plano seguem pelos botões de sempre da barra.
 *
 * 2026-10-17 (noite) · O DONO: "o arquiteto ainda não está cumprindo o papel
 * dele… cadê as keywords de reforço?… 3 botões já é suficiente". SUBSTITUÍDO o
 * "Processar artigos = Validar SERP" e o "Concluir formação = só a linha sem
 * ArticleDNA" de 16/10. Agora, pela MESMA melhoria recortada por grupo
 * (`/api/arquiteto/article-improvement`, o roteiro §15 da SDD da linha única):
 *  - "Processar artigos" = prepare com a busca do reforço (lista da marca e
 *    Google Ads, grátis) → UMA prévia de custo da SERP da principal que falta
 *    (inclusive a de identidade sem volume) → coleta → a cópia de trabalho de
 *    cada artigo na própria linha (principal, secundárias com volume e "nova",
 *    o que falta). Nada é gravado;
 *  - "Concluir formação" = a prévia com o checklist (principal · reforço · SERP
 *    · plano · Silo) → UMA confirmação → apply (keywords novas pelos núcleos do
 *    Minerador, ArticleDNA v1 dos novos e vN+1 dos já formados) → o Silo do
 *    plano fecha no mesmo ato (`onConcluded`, o par do fechamento canônico) e o
 *    grupo é ligado a ele.
 */

type Tone = "success" | "neutral" | "warning";
type LineKind = "go" | "known" | "refused" | "minerador" | "serp" | "adequate";
type PreviewLine = { keywordId: string; keyword: string; kind: LineKind; text: string };
/** `rows`: as linhas do plano deste grupo pedidas nesta ação (a cópia de trabalho de cada uma). */
type FormationRun = { groupId: string; run: ImprovementRun; readyIds: string[]; rows?: PlanSheetRow[] };
/*
 * 2026-10-17 (noite) · "processArticles" SUBSTITUI "validateSerp": a prévia de custo do Processar (a SERP da principal
 * que falta, paga) é a ÚNICA confirmação dele; a busca do reforço (Google Ads, grátis) já rodou antes dela.
 */
type Preview =
  | { action: "processArticles"; lines: PreviewLine[]; runs: FormationRun[]; paidQueries: number; costMaxUsd: number }
  | { action: "concludeFormation" | "swapPrincipal"; lines: PreviewLine[]; runs: FormationRun[]; checklist?: PlanConclusionCheck[] }
  | { action: "chooseSwap"; rows: PlanSheetRow[]; candidates: Record<string, PlanSwapCandidate[]>; picks: Record<string, string>; refused: PreviewLine[] };
const KIND_OF: Record<PlanSheetPreviewLine["kind"], LineKind> = { will_write: "go", needs_minerador: "minerador", needs_serp: "serp", adequate: "adequate", refused: "refused" };
/** As consultas pagas que faltam numa execução preparada (a D2(b) opcional fica fora). */
const pagasDe = (run: Pick<ImprovementRun, "costs">) => Math.max(0, run.costs.paidQueries - Math.max(0, run.costs.optionalPaidQueries ?? 0));
const usd = (valor: number) => `US$ ${valor.toFixed(3).replace(".", ",")}`;
type Busy = { label: string; startedAt: number; done: number | null; total: number | null; unit: string };

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
/** Quantas voltas de coleta (cada uma ≤ 120 s no servidor) a tela espera antes de parar com a frase. */
const COLLECT_TURNS_LIMIT = 60;

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
  /**
   * 2026-10-17 (noite) · o Silo do plano fecha no MESMO ato do "Concluir formação" (SDD da linha única, F2): a tela
   * grava o par SiloDNA + SiloPage pelo fechamento canônico de sempre e diz o desfecho. Ausente = o Silo fica para o
   * fechamento de sempre (aditivo).
   */
  onConcluded?: (groupIds: readonly string[]) => Promise<PlanSheetResult | null>;
};

export type PlanSheetResult = { tone: Tone; text: string };
/** Os 3 botões em sequência para as linhas pedidas (ver `planSheetSequence`). */
export type PlanSheetStep = ReturnType<typeof planSheetSequence>;

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
  /** 2026-10-17 (noite) · em que passo da sequência (Processar → Concluir → Melhorar) estão estas linhas. */
  stepOf: (alvo: readonly PlanSheetRow[]) => PlanSheetStep;
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
  const { brandId, brandRef, keywords, standings, groupOf, keywordGroupOf, filter, articles, radarArticleIds, onApplied } = props;

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
  /*
   * 2026-10-17 (noite) · A CÓPIA DE TRABALHO DO "PROCESSAR ARTIGOS", por grupo: a execução preparada (reforço e SERP)
   * que o "Concluir formação" grava. É proposta persistida no servidor (o run da melhoria, §4.1 da SDD), nunca artefato.
   */
  const [processed, setProcessed] = useState<Map<string, ImprovementRun>>(new Map());
  /** As linhas que o Processar recusou antes do servidor (presa em outro artigo, sem Silo…): ele fez a parte dele, disse o motivo. */
  const [processedRefused, setProcessedRefused] = useState<Set<string>>(new Set());

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
    setProcessed(new Map());
    setProcessedRefused(new Set());
  }

  // F5 (recarregar a página) — a gravação da planilha interrompida é retomada daqui, sem novo aceite.
  // 2026-10-17 (noite) · e a cópia de trabalho do último "Processar artigos" volta (o passo 1 continua feito).
  useEffect(() => {
    if (!brandId) return;
    let ativo = true;
    void fetch(`/api/arquiteto/article-improvement?brandId=${encodeURIComponent(brandId)}`).then(r => r.json()).then(body => {
      const run = body?.data as ImprovementRun | null;
      if (!ativo || !run || run.origin !== "plan_sheet") return;
      if (run.state === "applying" && run.acceptedIds?.length) setResumable(run);
      else if (run.state === "prepared" && !run.acceptedIds && run.discovery?.requested && run.groupScope?.groupId) setProcessed(atual => new Map([...atual, [run.groupScope!.groupId!, run]]));
    }).catch(() => undefined);
    return () => { ativo = false; };
  }, [brandId]);

  /* -------------------- a sequência dos 3 botões (2026-10-17, noite) -------------------- */
  // Processar fez a parte da linha quando ela tem a cópia de trabalho sem SERP paga pendente (ou a recusa com o motivo).
  const processedIds = useMemo(() => {
    const ids = new Set<string>(processedRefused);
    for (const run of processed.values()) {
      for (const proposal of run.proposals) if (!proposal.needsValidation) ids.add(proposal.targetId);
      for (const recusa of run.refusedTargets ?? []) ids.add(recusa.id);
    }
    return ids;
  }, [processed, processedRefused]);
  // A cópia de trabalho que ainda espera a gravação do Concluir (o que está pronto para gravar).
  const pendingIds = useMemo(() => new Set([...processed.values()].flatMap(run => run.proposals.filter(proposal => proposal.status === "ready").map(proposal => proposal.targetId))), [processed]);
  const stepOf = (alvo: readonly PlanSheetRow[]) => planSheetSequence({ rows: alvo, processedIds, pendingIds });

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

  /* ============================== PROCESSAR ARTIGOS ============================== */
  /** A cópia de trabalho (as linhas da prévia) de uma execução preparada, com o nome legível de cada artigo. */
  const linhasDaCopia = (item: FormationRun): PreviewLine[] => {
    const tipos = new Map(planSheetPreviewLines(item.run, item.rows ?? []).map(line => [line.keywordId, KIND_OF[line.kind]]));
    return planSheetWorkingCopyLines(item.run, item.rows ?? []).map(line => ({ keywordId: line.keywordId, keyword: nomeDe(line.keywordId), kind: tipos.get(line.keywordId) ?? "refused", text: line.text }));
  };

  /*
   * 2026-10-17 (noite) · PASSO 1 DO ROTEIRO §15, numa passada (dono: "cadê as keywords de reforço?"): lê o plano e os
   * DNAs, busca o reforço (sementes do plano, do DNA e da SERP em cache; lista da marca e ideias do Google Ads, grátis,
   * cota) e diz o custo da SERP da principal que falta (inclusive a de identidade sem volume). A busca roda sozinha
   * (SUBSTITUI o "Buscar keywords novas no Google Ads (N)" do painel); a SERP paga só com a confirmação. Nada é gravado.
   */
  async function processArticles(alvo: PlanSheetRow[]) {
    if (!brandId) return;
    const vivo = vivoAgora();
    setError(null); setSummary(null); setPreview(null);
    const escolha = planSheetFormationSelection(alvo, "processArticles");
    const linhas = new Map<string, PlanSheetResult>();
    for (const item of escolha.refused) linhas.set(item.keywordId, { tone: "warning", text: item.reason });
    if (escolha.refused.length) setProcessedRefused(atual => new Set([...atual, ...escolha.refused.map(item => item.keywordId)]));
    if (!escolha.byGroup.size) { finish(vivo, linhas, { tone: "warning", text: `${PLAN_SHEET_ACTION_LABELS.processArticles}: nenhuma linha pode ser processada agora (o motivo está em cada uma). Nada foi pago nem gravado.` }); return; }
    startBusy("Lendo o plano, os DNAs e a SERP em cache e buscando o reforço no Google Ads (grátis, cota)", escolha.byGroup.size, "cor(es)");
    const runs: FormationRun[] = [];
    for (const [indice, [groupId, doGrupo]] of [...escolha.byGroup].entries()) {
      try {
        const run = await improvement({ brandId, action: "prepare", group: groupId, targetIds: doGrupo.map(row => row.keywordId), origin: "plan_sheet", discover: true });
        runs.push({ groupId, run, readyIds: [], rows: doGrupo });
      } catch (e) {
        for (const row of doGrupo) linhas.set(row.keywordId, { tone: "warning", text: e instanceof Error ? e.message : "A leitura não foi confirmada." });
      }
      if (vivo()) setBusy(atual => atual ? { ...atual, done: indice + 1 } : atual);
    }
    if (!vivo()) return;
    if (!runs.length) { finish(vivo, linhas, { tone: "warning", text: `${PLAN_SHEET_ACTION_LABELS.processArticles}: a leitura não foi confirmada (o motivo está em cada linha). Nada foi pago nem gravado.` }); return; }
    const consultas = runs.reduce((soma, item) => soma + pagasDe(item.run), 0);
    if (consultas > 0) {
      const teto = runs.reduce((soma, item) => soma + (pagasDe(item.run) > 0 ? item.run.costs.estimatedCostUsd.max : 0), 0);
      setResults(atual => new Map([...atual, ...linhas]));
      setBusy(null);
      setPreview({ action: "processArticles", lines: runs.flatMap(linhasDaCopia), runs, paidQueries: consultas, costMaxUsd: teto });
      return;
    }
    finishProcess(vivo, runs, linhas, 0);
  }

  /** A coleta paga autorizada na prévia (cache primeiro; o servidor recusa pagar além do autorizado), uma execução por vez. */
  async function collectProcess(previa: Extract<Preview, { action: "processArticles" }>) {
    if (!brandId) return;
    const vivo = vivoAgora();
    setPreview(null); setError(null);
    startBusy("Coletando a SERP no DataForSEO (pago, com o seu aceite)", previa.runs.filter(item => pagasDe(item.run) > 0).length, "cor(es)");
    const prontos: FormationRun[] = [];
    let pagas = 0, feitas = 0;
    try {
      for (const item of previa.runs) {
        if (pagasDe(item.run) === 0) { prontos.push(item); continue; }
        let atual = await improvement({ brandId, action: "collect", runId: item.run.runId, decisionHash: item.run.decisionHash, authorizedCostUsd: item.run.costs.estimatedCostUsd.max });
        for (let volta = 0; vivo() && atual.state === "collecting" && volta < COLLECT_TURNS_LIMIT; volta += 1) {
          try { atual = await improvement({ brandId, action: "collect", runId: atual.runId, decisionHash: atual.decisionHash }); }
          catch (e) {
            // Tempo esgotado numa volta: o andamento está salvo no servidor; lê e segue.
            if (!(e instanceof Error && /demorou demais/.test(e.message))) throw e;
            atual = await improvement({ brandId, action: "status", runId: atual.runId });
          }
        }
        if (atual.state === "collecting") throw new Error(`A coleta da SERP não terminou nesta tela. O que já foi pago está no cache e não é cobrado de novo: toque em “${PLAN_SHEET_ACTION_LABELS.processArticles}” para continuar.`);
        pagas += pagasDe(item.run);
        prontos.push({ ...item, run: atual });
        feitas += 1;
        if (vivo()) setBusy(andamento => andamento ? { ...andamento, done: feitas } : andamento);
      }
      finishProcess(vivo, prontos, new Map(), pagas);
    } catch (e) {
      if (vivo()) { setBusy(null); setError(e instanceof Error ? e.message : "A coleta da SERP não foi confirmada."); }
    }
  }

  /** A cópia de trabalho de cada linha e a frase do Processar; o passo 1 fica feito para as linhas sem SERP pendente. */
  function finishProcess(vivo: () => boolean, runs: FormationRun[], linhas: Map<string, PlanSheetResult>, pagas: number) {
    if (!vivo()) return;
    let comReforco = 0, lidos = 0;
    for (const item of runs) {
      for (const line of planSheetWorkingCopyLines(item.run, item.rows ?? [])) { linhas.set(line.keywordId, { tone: line.tone, text: line.text }); lidos += 1; }
      comReforco += item.run.proposals.filter(proposal => proposal.memberIds.some(id => id !== proposal.principalId) && (proposal.status === "ready" || proposal.needsValidation)).length;
    }
    setProcessed(atual => { const proximo = new Map(atual); for (const item of runs) proximo.set(item.groupId, item.run); return proximo; });
    const faltaSerp = runs.reduce((soma, item) => soma + item.run.proposals.filter(proposal => proposal.needsValidation).length, 0);
    finish(vivo, linhas, { tone: faltaSerp ? "warning" : "success", text: `${PLAN_SHEET_ACTION_LABELS.processArticles}: ${lidos} artigo(s) lido(s), reforço proposto para ${comReforco}; ${pagas ? `SERP paga agora: ${pagas} consulta(s)` : "nada pago"}.${faltaSerp ? ` ${faltaSerp} ainda sem a SERP da principal.` : ""} Nada foi gravado: confira cada linha e use “${PLAN_SHEET_ACTION_LABELS.concludeFormation}”.` });
    if (pagas && vivo()) setSerpReload(valor => valor + 1);
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
    const doDominio: PlanSheetPreviewLine[] = [];
    for (const [indice, [groupId, linhasDoGrupo]] of [...escolha.byGroup].entries()) {
      const feitas = indice + 1;
      try {
        const escolhas = picks ? Object.fromEntries(linhasDoGrupo.filter(row => picks[row.keywordId]).map(row => [row.keywordId, picks[row.keywordId]])) : null;
        /*
         * 2026-10-17 (noite) · o Concluir grava a cópia de trabalho do "Processar artigos" (reforço e SERP já lidos);
         * só sem ela (ou sem estas linhas nela) prepara de novo, grátis, como antes.
         */
        const processado = action === "concludeFormation" && !escolhas ? processed.get(groupId) : undefined;
        const cobre = processado && linhasDoGrupo.every(row => processado.proposals.some(proposal => proposal.targetId === row.keywordId) || processado.refusedTargets?.some(item => item.id === row.keywordId));
        const run = cobre ? processado! : await improvement({ brandId, action: "prepare", group: groupId, targetIds: linhasDoGrupo.map(row => row.keywordId), origin: "plan_sheet", ...(escolhas && Object.keys(escolhas).length ? { principalChoice: escolhas } : {}) });
        const previa = planSheetPreviewLines(run, linhasDoGrupo);
        doDominio.push(...previa);
        for (const item of previa) linhas.push({ keywordId: item.keywordId, keyword: nomeDe(item.keywordId), kind: KIND_OF[item.kind], text: item.sentence });
        runs.push({ groupId, run, readyIds: previa.filter(item => item.kind === "will_write").map(item => item.keywordId), rows: linhasDoGrupo });
      } catch (e) {
        for (const row of linhasDoGrupo) linhas.push({ keywordId: row.keywordId, keyword: row.keyword, kind: "refused", text: e instanceof Error ? e.message : "A prévia não foi confirmada." });
      }
      if (vivo()) setBusy(atual => atual ? { ...atual, done: feitas } : atual);
    }
    if (!vivo()) return;
    setBusy(null);
    // 2026-10-17 (noite) · o checklist da finalização (principal · reforço · SERP · plano · Silo), lido da própria prévia.
    const grupos = new Set(runs.map(item => item.groupId));
    const checklist = action === "concludeFormation" ? planSheetConclusionChecklist({ lines: doDominio, rows: alvo, proposals: runs.flatMap(item => item.run.proposals), groupRows: rows.filter(row => row.groupId && grupos.has(row.groupId)) }) : undefined;
    setPreview({ action, lines: linhas, runs, ...(checklist ? { checklist } : {}) });
  }

  /* ================ CONCLUIR FORMAÇÃO / TROCAR PRINCIPAL (gravar) ================ */
  async function applyRun(vivo: () => boolean, run: ImprovementRun, readyIds: string[] | null, contar: (feitos: number) => void, approveNewKeywords = false): Promise<ImprovementRun> {
    // 2026-10-17 · keyword NOVA na marca entra na mesma confirmação: o aceite vai só quando a prévia a listou.
    let current = run.state === "applying" && run.acceptedIds ? await improvement({ brandId, action: "apply", runId: run.runId, decisionHash: run.decisionHash })
      : await improvement({ brandId, action: "apply", runId: run.runId, decisionHash: run.decisionHash, ...(readyIds ? { targetIds: readyIds } : {}), ...(approveNewKeywords ? { approveNewKeywords: true } : {}) });
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

  async function confirmFormation(action: "concludeFormation" | "swapPrincipal", runs: FormationRun[], previa: PreviewLine[], checklist?: readonly PlanConclusionCheck[]) {
    const vivo = vivoAgora();
    setPreview(null); setError(null);
    const total = runs.reduce((soma, item) => soma + item.readyIds.length, 0);
    const linhas = new Map<string, PlanSheetResult>();
    for (const item of previa) if (item.kind !== "go") linhas.set(item.keywordId, { tone: item.kind === "adequate" ? "neutral" : "warning", text: `Não gravado: ${item.text}` });
    // 2026-10-17 (noite) · nada a gravar mas o Silo do plano pronto (todos formados): a confirmação só fecha o Silo.
    const soOSilo = !total && action === "concludeFormation" && checklist?.find(item => item.key === "silo")?.ok === true;
    if (!total && !soOSilo) { finish(vivo, linhas, { tone: "warning", text: "Nada a gravar: nenhuma linha ficou pronta na prévia. Veja o motivo de cada uma." }); return; }
    startBusy(action === "swapPrincipal" ? "Gravando a troca de principal (nova versão do ArticleDNA)" : soOSilo ? "Fechando o Silo do plano (SiloDNA e SiloPage)" : "Concluindo a formação (keywords novas, ArticleDNA e o Silo do plano)", total || null, "artigo(s)");
    let antes = 0, gravados = 0, falhas = 0, novasNaConfirmacao = false;
    try {
      for (const item of runs) {
        if (!item.readyIds.length) continue;
        const base = antes;
        const comNovas = improvementNewKeywordsPreview(item.run, item.readyIds).total > 0;
        if (comNovas) novasNaConfirmacao = true;
        const fim = await applyRun(vivo, item.run, item.readyIds, feitos => { if (vivo()) setBusy(atual => atual ? { ...atual, done: base + feitos } : atual); }, comNovas);
        antes += item.readyIds.length;
        for (const id of item.readyIds) {
          const desfecho = planSheetOutcomeSentence(fim.outcomes.find(outcome => outcome.targetId === id));
          if (desfecho.tone === "success") gravados += 1; else if (desfecho.tone === "warning") falhas += 1;
          linhas.set(id, desfecho);
        }
      }
      // A cópia de trabalho gravada saiu da fila: o passo 2 está feito para estas linhas.
      const grupos = runs.map(item => item.groupId);
      if (action === "concludeFormation" && vivo()) setProcessed(atual => { const proximo = new Map(atual); for (const grupo of grupos) proximo.delete(grupo); return proximo; });
      // 2026-10-17 (noite) · o Silo do plano fecha no MESMO ato (SDD da linha única, F2), pelo fechamento canônico de sempre.
      let silo: PlanSheetResult | null = null;
      if (action === "concludeFormation" && props.onConcluded && (gravados > 0 || soOSilo) && vivo()) {
        if (vivo()) setBusy(atual => atual ? { ...atual, label: "Fechando o Silo do plano (SiloDNA e SiloPage) e ligando o grupo a ele" } : atual);
        try { silo = await props.onConcluded(grupos); }
        catch (e) { silo = { tone: "warning", text: `O Silo do plano não fechou agora: ${e instanceof Error ? e.message : "erro sem resposta"}. Os ArticleDNA gravados continuam válidos; “${PLAN_SHEET_ACTION_LABELS.concludeFormation}” tenta de novo.` }; }
      }
      const artigos = soOSilo ? "nenhum artigo novo a gravar" : `${gravados} gravado(s) e relido(s)${falhas ? `, ${falhas} com falha` : ""}; ${previa.filter(line => line.kind !== "go").length} fora desta confirmação`;
      const minerador = soOSilo ? "" : novasNaConfirmacao ? " As keywords novas da prévia seguiram pelos núcleos do Minerador (import, Lógica, Volume, aprovação e envio) nos artigos gravados; as que já estavam lá não mudaram." : " Nada foi gravado no Minerador.";
      finish(vivo, linhas, { tone: falhas || silo?.tone === "warning" ? "warning" : "success", text: `${action === "swapPrincipal" ? PLAN_SHEET_ACTION_LABELS.swapPrincipal : PLAN_SHEET_ACTION_LABELS.concludeFormation}: ${artigos}.${minerador}${silo ? ` ${silo.text}` : ""}` });
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

  function start(action: PlanSheetAction, alvo: PlanSheetRow[]) {
    if (!alvo.length || ocupado) return;
    if (action === "processArticles") void processArticles(alvo);
    else if (action === "swapPrincipal") chooseSwap(alvo);
    else void prepareFormation(alvo, "concludeFormation");
  }

  function cancelPreview() {
    // 2026-10-17 (noite) · cancelar a coleta paga do Processar: a leitura grátis fica (o reforço proposto, na linha); nada pago.
    if (preview?.action === "processArticles") {
      const linhas = new Map<string, PlanSheetResult>();
      for (const item of preview.runs) for (const line of planSheetWorkingCopyLines(item.run, item.rows ?? [])) linhas.set(line.keywordId, { tone: line.tone, text: line.text });
      setResults(atual => new Map([...atual, ...linhas]));
      setProcessed(atual => { const proximo = new Map(atual); for (const item of preview.runs) proximo.set(item.groupId, item.run); return proximo; });
      setSummary({ tone: "neutral", text: `${PLAN_SHEET_ACTION_LABELS.processArticles}: a coleta paga foi cancelada — nada foi pago nem gravado. O reforço proposto está em cada linha; sem a SERP da principal, “${PLAN_SHEET_ACTION_LABELS.concludeFormation}” espera.` });
    }
    setPreview(null);
  }

  /** O botão principal da prévia aberta: autorizar a SERP, ou gravar o que ficou pronto. */
  function confirmPreview() {
    if (!preview) return;
    if (preview.action === "processArticles") void collectProcess(preview);
    else if (preview.action === "concludeFormation" || preview.action === "swapPrincipal") {
      void confirmFormation(preview.action, preview.runs, preview.lines, preview.checklist);
    }
  }

  const toggleSelected = (keywordId: string, marcar?: boolean) => setSelected(atual => {
    const proximo = new Set(atual);
    if (marcar ?? !proximo.has(keywordId)) proximo.add(keywordId); else proximo.delete(keywordId);
    return proximo;
  });

  const revision = useMemo(() => ({ rows, results, ocupado }), [rows, results, ocupado]);

  return {
    brandId, rows, rowByKeywordId, selected, setSelected, toggleSelected, results, ocupado, busy, now, preview, setPreview,
    error, setError, summary, setSummary, resumable, withdrawing, setWithdrawing, sugestoesHref, corDoRecorte, revision,
    start, stepOf, cancelPreview, prepareSwapPreview: (alvo, picks, refused) => { void prepareFormation(alvo, "swapPrincipal", picks, refused); },
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
  const tituloDaPrevia = preview?.action === "processArticles" ? `${PLAN_SHEET_ACTION_LABELS.processArticles} · custo antes`
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

    {busy && <OperationProgress label={busy.label} startedAt={busy.startedAt} now={now} done={busy.done} total={busy.total} unit={busy.unit} note="o andamento fica guardado no servidor" testId="architect-plan-sheet-progress" />}
    {error && <p role="alert" className="mt-2 text-warning">{error}</p>}
    {/* 2026-10-17 (noite) · sem botão "Fechar" no resumo (pedido do dono: só os 3 botões na área): a próxima ação o substitui. */}
    {summary && !busy && <p role="status" className={`mt-2 ${TONE_CLASS[summary.tone]}`} data-testid="architect-plan-sheet-summary">{summary.text}</p>}

    {preview && <div ref={previewRef} className="mt-3 rounded-md border border-divider bg-surface-subtle p-3" role="region" aria-label={tituloDaPrevia} data-testid="architect-plan-sheet-preview" data-action={preview.action}>
      <h4 className="font-semibold text-foreground">{tituloDaPrevia}</h4>
      {/* 2026-10-17 (noite) · o custo antes de pagar: a ÚNICA confirmação do Processar (o reforço, grátis, já foi buscado). */}
      {preview.action === "processArticles" && <p className="mt-1 text-foreground" data-testid="architect-plan-sheet-serp-cost">SERP no DataForSEO: {preview.paidQueries} consulta(s), até {usd(preview.costMaxUsd)} — a primeira coleta da principal que falta (inclusive a principal de identidade, sem buscas no Google Ads). O que está no cache não é pago; nada é gravado.</p>}
      {preview.action === "chooseSwap" && <p className="mt-1 text-text-muted">Candidatas: a keyword do Assunto e as sustentações com volume da lista dele. Gravar gera uma nova versão.</p>}
      {(preview.action === "concludeFormation" || preview.action === "swapPrincipal") && (() => {
        // 2026-10-17 · as keywords NOVAS das linhas "vai gravar", por artigo, com volume e fonte: entram nesta confirmação.
        const novas = preview.runs.map(item => improvementNewKeywordsPreview(item.run, item.readyIds)).filter(item => item.total > 0);
        return <>
          {/* 2026-10-17 (noite) · "confirmar e finalizar": o checklist do que a confirmação confere e grava (dono: "fazer checking e validar todo o processo"). */}
          {preview.action === "concludeFormation" && preview.checklist && <ul className="mt-1 grid gap-0.5" data-testid="architect-plan-sheet-checklist">
            {preview.checklist.map(item => <li key={item.key} className={item.ok ? "text-foreground" : "text-warning"} data-check={item.key} data-ok={item.ok ? "true" : "false"}><span aria-hidden="true">{item.ok ? "✓" : "✗"}</span> {item.label} — {item.detail}</li>)}
          </ul>}
          {novas.length > 0 && <div className="mt-2 rounded-md border border-divider bg-surface p-2" data-testid="architect-plan-sheet-new-keywords">
            {novas.map(item => <div key={item.lines.join("|")}><p className="font-medium text-foreground">{item.approvalText}</p><ul className="mt-1 list-disc pl-5 text-foreground">{item.lines.map(line => <li key={line}>{line}</li>)}</ul></div>)}
          </div>}
        </>;
      })()}

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
        {preview.action === "processArticles" && <button type="button" className={primaryButtonClassName} data-testid="architect-plan-sheet-confirm" onClick={sheet.confirmPreview}>{`Autorizar ${preview.paidQueries} consulta(s) e coletar (até ${usd(preview.costMaxUsd)})`}</button>}
        {preview.action === "chooseSwap" && <button type="button" className={primaryButtonClassName} disabled={!preview.rows.length} data-testid="architect-plan-sheet-swap-preview" onClick={() => sheet.prepareSwapPreview(preview.rows, preview.picks, preview.refused)}>Ver prévia da troca (grátis)</button>}
        {(preview.action === "concludeFormation" || preview.action === "swapPrincipal") && (() => {
          const prontas = preview.runs.reduce((soma, item) => soma + item.readyIds.length, 0);
          const novas = preview.runs.reduce((soma, item) => soma + improvementNewKeywordsPreview(item.run, item.readyIds).total, 0);
          const soOSilo = !prontas && preview.action === "concludeFormation" && preview.checklist?.find(item => item.key === "silo")?.ok === true;
          const rotulo = preview.action === "swapPrincipal" ? "Confirmar a troca" : soOSilo ? "Confirmar e fechar o Silo" : novas ? `Confirmar e gravar (com ${novas} keyword(s) nova(s))` : "Confirmar e gravar";
          return <button type="button" className={primaryButtonClassName} disabled={!prontas && !soOSilo} data-testid="architect-plan-sheet-confirm" onClick={sheet.confirmPreview}>{rotulo}</button>;
        })()}
      </div>
    </div>}
  </div>;
}

/* ===================== a linha do plano DENTRO da tabela de artigos ===================== */

const DEFINITION_TONE: Record<PlanRowDefinition["tone"], string> = { positive: "text-positive-soft", neutral: "text-text-muted", warning: "text-warning" };

/**
 * 2026-10-16 (noite) · a coluna "Definição do artigo" da linha do plano (a do
 * candidato da mesa e a da linha sem artigo): o estado de verdade e o porquê
 * curto, o inteiro no `title` (pedido do dono: "Pendente" sem explicação).
 */
export function PlanRowDefinitionCell({ definition }: { definition: PlanRowDefinition }) {
  return <span className="inline-flex flex-col items-center gap-0.5" title={definition.title} data-testid="architect-plan-row-definition">
    <span className={`text-sm font-medium ${DEFINITION_TONE[definition.tone]}`}>{definition.label}</span>
    {definition.reason && <span className="text-sm leading-tight text-text-muted" data-testid="architect-plan-row-definition-reason">{definition.reason}</span>}
  </span>;
}

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
 * processos são os botões de sempre da barra; na linha fica só o que é DELA:
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
        return <td key={columnId} className="border-r border-divider px-2 py-2 text-center"><PlanRowDefinitionCell definition={planRowDefinition(row)} /></td>;
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
