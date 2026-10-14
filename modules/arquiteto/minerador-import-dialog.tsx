"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import { AlertTriangle, CheckCircle2, ChevronDown, ChevronRight, Loader2, X } from "lucide-react";
import { internalButton, internalButtonPrimary } from "@/components/editorial/internal-page-visual";
import { EditorialGroupDot } from "@/components/editorial/group-tag";
import { EDITORIAL_GROUP_COLOR_LABELS, type EditorialGroupColor } from "@/lib/editorial/editorial-groups";
import { describeApproveAndSendResult, type ApproveAndSendLine, type ApproveAndSendPreview, type ApproveAndSendResult } from "@/lib/minerador/approve-and-send-core";
import {
  ARQUITETO_IMPORT_REFRESH_DETAIL,
  arquitetoImportLineLabel,
  arquitetoImportNeedsApprovalInMinerador,
  arquitetoImportProgress,
  arquitetoImportReason,
  confirmArquitetoImportResult,
  isArquitetoImportable,
  selectArquitetoImportColor,
  summarizeArquitetoImportColors,
  type ArquitetoImportItem,
  type ArquitetoImportPhase,
  type ArquitetoImportResultLine,
} from "@/lib/arquiteto/minerador-import";
import { mineradorHandoffHref } from "@/lib/arquiteto/minerador-suggestions";
import { OperationProgress } from "./operation-progress";

/**
 * "IMPORTAR DO MINERADOR" — A LISTA LEVE (pedido do dono, 2026-10-13).
 *
 * Abre lendo só `GET /api/arquiteto/import` (nome, cor e estado curto de cada
 * keyword — nada da mesa), já filtrado pela cor ativa na etiqueta da barra.
 * Escolher uma cor marca as que podem ir e diz quais ficam fora, com o motivo.
 * Importar passa SEMPRE por uma prévia do servidor (o mesmo portão do
 * "Aprovar e enviar" do Minerador) e por uma confirmação; o resultado por
 * keyword só aparece depois da releitura da lista no servidor.
 *
 * F4 · O ARQUITETO SÓ LÊ (SDD `sdd-arquiteto-so-le-e-listas-leves-2026-10-13.md`,
 * item 2, D2): o modal NÃO aprova. Só importa o que já está aprovado no
 * Minerador; o que precisa de aprovação aparece como "precisa aprovar no
 * Minerador" e o botão "Aprovar no Minerador (N)" abre o Minerador filtrado na
 * cor, com essas linhas, no diálogo "Aprovar e enviar" de lá.
 */

const ROUTE = "/api/arquiteto/import";

type Pool = { items: ArquitetoImportItem[]; canApprove: false; canCreate: boolean; checked: number; readAt: string };
type Preview = ApproveAndSendPreview & { canApprove: false };
type Confirming = { scope: { kind: "color"; color: EditorialGroupColor } | { kind: "selection" }; keywordIds: string[]; preview: Preview | null; excluded: Set<string> };
type Finished = { result: ApproveAndSendResult; lines: ArquitetoImportResultLine[]; allConfirmed: boolean; mesaUpdated: boolean; refreshIds?: ReadonlySet<string> };

const OUTCOME_LABEL: Record<ArquitetoImportResultLine["outcome"], string> = {
  approved_and_sent: "aprovada no Minerador e importada",
  sent: "importada",
  approved: "aprovada",
  unchanged: "sem mudança",
  approved_not_sent: "aprovada, mas não importada",
  not_sent: "não importada",
  blocked: "não pôde ir",
  excluded: "desmarcada por você",
  stale: "mudou no meio — nada gravado",
};

const STATE_TONE: Record<ArquitetoImportItem["state"], string> = {
  send: "text-context-accent",
  refresh: "text-context-accent",
  approve_in_minerador: "text-pending",
  in_arquiteto: "text-text-muted",
  out: "text-warning",
};

async function call<T>(input: { method: "GET"; brandId: string } | { method: "POST"; body: Record<string, unknown> }): Promise<{ ok: true; data: T } | { ok: false; code: string; message: string }> {
  const response = await (input.method === "GET"
    ? fetch(`${ROUTE}?brandId=${encodeURIComponent(input.brandId)}`, { cache: "no-store" })
    : fetch(ROUTE, { method: "POST", cache: "no-store", headers: { "content-type": "application/json" }, body: JSON.stringify(input.body) })
  ).catch(() => null);
  const body = response ? await response.json().catch(() => ({})) as Record<string, unknown> : {};
  if (!response || !response.ok || body.success !== true) {
    return {
      ok: false,
      code: typeof body.code === "string" ? body.code : response ? `HTTP_${response.status}` : "NETWORK_ERROR",
      message: typeof body.error === "string" ? body.error : response ? "O servidor não respondeu à importação agora." : "Sem conexão com o servidor. Nada foi gravado.",
    };
  }
  return { ok: true, data: body.data as T };
}

export function MineradorImportDialog({ brandId, brandRef = null, initialColor, colorOfGroup, detailsOf, mesaRefreshing, onClose, onApplied, preselect = null }: {
  brandId: string | null;
  /** F4 (D2): a rota da marca, para o "Aprovar no Minerador (N)" (o Arquiteto não aprova). */
  brandRef?: string | null;
  /** A cor ativa na etiqueta da barra: o modal abre filtrado por ela. */
  initialColor: EditorialGroupColor | null;
  colorOfGroup: (groupId: string | null) => EditorialGroupColor | null;
  /** Detalhe a um clique (ex.: o Assunto, quando a mesa já o conhece). */
  detailsOf?: (keyword: { id: string }) => ReactNode;
  /** A mesa do Arquiteto está relendo (depois do import). */
  mesaRefreshing: boolean;
  onClose: () => void;
  /** Pede à mesa para reler; o diálogo espera a releitura terminar. */
  onApplied: () => void;
  /**
   * 2026-10-14 · "Atualizar do Minerador" (aviso "Pacote novo no Minerador" da
   * mesa): abre já na prévia do servidor com as keywords que atualizam no
   * Arquiteto marcadas — o MESMO núcleo do importar, com a mesma confirmação.
   */
  preselect?: "refresh" | null;
}) {
  const ids = { title: useId() };
  const [pool, setPool] = useState<Pool | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [color, setColor] = useState<EditorialGroupColor | null>(initialColor);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [showInArquiteto, setShowInArquiteto] = useState(false);
  const [confirming, setConfirming] = useState<Confirming | null>(null);
  const [phase, setPhase] = useState<ArquitetoImportPhase | null>(null);
  const [phaseStartedAt, setPhaseStartedAt] = useState<number>(() => Date.now());
  const [refusal, setRefusal] = useState<{ code: string; message: string } | null>(null);
  const [finished, setFinished] = useState<Finished | null>(null);
  const busyRef = useRef(false);
  const sawMesaRefreshing = useRef(false);
  const pendingFinish = useRef<Omit<Finished, "mesaUpdated"> | null>(null);
  // Aberto pela cor ativa da barra: a primeira leitura já marca as que podem ir.
  const colorToSelect = useRef<EditorialGroupColor | null>(initialColor);
  const busy = phase !== null;
  const autoRefreshPending = useRef(preselect === "refresh");

  const startPhase = (next: ArquitetoImportPhase | null) => { setPhase(next); setPhaseStartedAt(Date.now()); };

  // Só grava estado depois da resposta; quem relê marca "lendo" antes (`rereadPool`).
  const readPool = useCallback(async (): Promise<Pool | null> => {
    if (!brandId) return null;
    const answer = await call<Pool>({ method: "GET", brandId });
    setLoading(false);
    if (!answer.ok) { setLoadError(answer.message); return null; }
    setLoadError(null);
    setPool(answer.data);
    // Aberto pela cor ativa da barra: as que podem ir já chegam marcadas.
    const corInicial = colorToSelect.current;
    colorToSelect.current = null;
    if (corInicial) setSelected(new Set(selectArquitetoImportColor(answer.data.items, corInicial, colorOfGroup).importIds));
    return answer.data;
  }, [brandId, colorOfGroup]);
  const rereadPool = () => { setLoading(true); setLoadError(null); return readPool(); };

  // O diálogo é montado a cada abertura (estado novo); a lista é lida uma vez por marca.
  useEffect(() => {
    // Leitura na montagem: o estado só muda quando a resposta chega.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void readPool();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [brandId]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape" && !busyRef.current) onClose(); };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [onClose]);

  // Etapa 4: espera a mesa reler (ou desiste em 60 s, dizendo isso).
  useEffect(() => {
    if (phase !== "refreshing_mesa") return;
    if (mesaRefreshing) { sawMesaRefreshing.current = true; return; }
    if (!sawMesaRefreshing.current) return;
    const pronto = pendingFinish.current;
    if (pronto) setFinished({ ...pronto, mesaUpdated: true });
    pendingFinish.current = null;
    busyRef.current = false;
    startPhase(null);
  }, [phase, mesaRefreshing]);
  useEffect(() => {
    if (phase !== "refreshing_mesa") return;
    const timer = setTimeout(() => {
      const pronto = pendingFinish.current;
      if (pronto) setFinished({ ...pronto, mesaUpdated: false });
      pendingFinish.current = null;
      busyRef.current = false;
      startPhase(null);
    }, 60_000);
    return () => clearTimeout(timer);
  }, [phase]);

  const items = useMemo(() => pool?.items ?? [], [pool]);
  const summaries = useMemo(() => summarizeArquitetoImportColors(items, colorOfGroup), [items, colorOfGroup]);
  const visible = useMemo(() => color ? items.filter(item => colorOfGroup(item.groupId) === color) : items, [items, color, colorOfGroup]);
  const colorChoice = useMemo(() => color ? selectArquitetoImportColor(items, color, colorOfGroup) : null, [items, color, colorOfGroup]);
  const ativos = visible.filter(item => item.state !== "in_arquiteto");
  const jaNoArquiteto = visible.filter(item => item.state === "in_arquiteto");
  const selecionadasVisiveis = [...selected].filter(id => items.some(item => item.id === id && isArquitetoImportable(item)));
  const selecionadasDaCor = colorChoice ? colorChoice.importIds.filter(id => selected.has(id)) : [];
  // F4 (D2): as que só esperam a aprovação do Minerador, no escopo visto (a cor escolhida, ou todas).
  const aprovarNaLista = colorChoice ? colorChoice.approveInMineradorIds : visible.filter(item => item.state === "approve_in_minerador").map(item => item.id);

  const chooseColor = (next: EditorialGroupColor | null) => {
    setColor(next);
    setSelected(next ? new Set(selectArquitetoImportColor(items, next, colorOfGroup).importIds) : new Set());
  };

  const toggle = (id: string, on: boolean) => setSelected(current => { const next = new Set(current); if (on) next.add(id); else next.delete(id); return next; });
  const toggleExpanded = (id: string) => setExpanded(current => { const next = new Set(current); if (next.has(id)) next.delete(id); else next.add(id); return next; });

  /** Abre a confirmação com a prévia do servidor (nada gravado). */
  const openConfirmation = async (scope: Confirming["scope"], keywordIds: string[]) => {
    if (!brandId || !keywordIds.length || busyRef.current) return;
    busyRef.current = true;
    setRefusal(null);
    setConfirming({ scope, keywordIds, preview: null, excluded: new Set() });
    startPhase("previewing");
    try {
      const answer = await call<Preview>({ method: "POST", body: { brandId, mode: "preview", keywordIds } });
      if (!answer.ok) { setRefusal(answer); setConfirming(null); return; }
      setConfirming({ scope, keywordIds, preview: answer.data, excluded: new Set() });
    } finally {
      busyRef.current = false;
      startPhase(null);
    }
  };

  // "Atualizar do Minerador": na primeira leitura, a prévia abre com as que atualizam no Arquiteto.
  useEffect(() => {
    if (!pool || !autoRefreshPending.current) return;
    autoRefreshPending.current = false;
    const atualizam = pool.items.filter(item => item.state === "refresh").map(item => item.id);
    // A prévia só começa depois da leitura: o estado muda quando o servidor responde.
    if (atualizam.length) void openConfirmation({ kind: "selection" }, atualizam);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pool]);

  const confirmImport = async () => {
    if (!brandId || !confirming?.preview || busyRef.current) return;
    const { preview, keywordIds, excluded } = confirming;
    const refreshIds = new Set(preview.lines.filter(line => line.action === "send_only" && line.refreshInArquiteto).map(line => line.id));
    busyRef.current = true;
    setRefusal(null);
    startPhase("applying");
    const answer = await call<ApproveAndSendResult>({ method: "POST", body: { brandId, mode: "apply", keywordIds, decisionHash: preview.decisionHash, excludedIds: [...excluded] } });
    if (!answer.ok) {
      setRefusal(answer);
      busyRef.current = false;
      startPhase(null);
      return;
    }
    startPhase("rereading");
    const relida = await rereadPool();
    const conferido = confirmArquitetoImportResult(answer.data, relida?.items ?? []);
    if (!relida) {
      setFinished({ result: answer.data, lines: conferido.lines.map(line => ({ ...line, confirmed: false })), allConfirmed: false, mesaUpdated: false, refreshIds });
      busyRef.current = false;
      startPhase(null);
      setConfirming(null);
      return;
    }
    setConfirming(null);
    setSelected(new Set());
    const enviou = conferido.lines.some(line => line.outcome === "approved_and_sent" || line.outcome === "sent");
    if (!enviou) {
      setFinished({ result: answer.data, ...conferido, mesaUpdated: true, refreshIds });
      busyRef.current = false;
      startPhase(null);
      return;
    }
    pendingFinish.current = { result: answer.data, ...conferido, refreshIds };
    sawMesaRefreshing.current = false;
    startPhase("refreshing_mesa");
    onApplied();
  };

  const previewLines = confirming?.preview?.lines ?? [];
  // F4 (D2): o modal não aprova; "approve_and_send" nunca vem do servidor (a aprovação fica fechada).
  const aprovarEEnviar = previewLines.filter(line => line.action === "approve_and_send");
  const soEnviar = previewLines.filter(line => line.action === "send_only");
  const novasAImportar = soEnviar.filter(line => !line.refreshInArquiteto);
  const atualizamNoArquiteto = soEnviar.filter(line => line.refreshInArquiteto);
  const precisamAprovar = new Set(previewLines.filter(arquitetoImportNeedsApprovalInMinerador).map(line => line.id));
  const bloqueadas = previewLines.filter(line => line.action === "blocked" && !precisamAprovar.has(line.id));
  const aprovarNoMinerador = previewLines.filter(line => precisamAprovar.has(line.id));
  /** "Aprovar no Minerador (N)": abre o "Aprovar e enviar" do Minerador, filtrado na cor, com estas linhas. */
  const aprovarNoMineradorHref = (ids: readonly string[], cor: EditorialGroupColor | null) => brandRef && ids.length ? mineradorHandoffHref(brandRef, { action: "aprovar", ids, color: cor }) : null;
  const foraDaCor = confirming?.scope.kind === "color" ? (colorChoice?.out ?? []).filter(item => !confirming.keywordIds.includes(item.id)) : [];
  const vao = [...aprovarEEnviar, ...soEnviar].filter(line => !confirming?.excluded.has(line.id));
  const contagem = { approve: aprovarEEnviar.filter(line => !confirming?.excluded.has(line.id)).length, send: soEnviar.filter(line => !confirming?.excluded.has(line.id)).length };
  const progresso = phase ? arquitetoImportProgress(phase, contagem) : null;
  const rotuloDoEscopo = (scope: Confirming["scope"], n: number) => scope.kind === "color" ? `Importar a cor ${EDITORIAL_GROUP_COLOR_LABELS[scope.color]} (${n})` : `Importar ${n}`;

  const linhaDaPrevia = (line: ApproveAndSendLine, selecionavel: boolean) => {
    const motivo = line.action === "blocked" ? arquitetoImportReason(line) : null;
    return (
      <li key={line.id} className="flex items-start gap-3 px-3 py-2 text-sm leading-6">
        {selecionavel ? (
          <input type="checkbox" className="mt-1 h-4 w-4 shrink-0" checked={!confirming?.excluded.has(line.id)} disabled={busy}
            onChange={event => setConfirming(current => current ? { ...current, excluded: (() => { const next = new Set(current.excluded); if (event.target.checked) next.delete(line.id); else next.add(line.id); return next; })() } : current)}
            aria-label={`Incluir ${line.keyword}`} />
        ) : null}
        <span className="min-w-0 flex-1">
          <span className="text-keyword">{line.keyword}</span>
          {motivo ? <span className="block text-warning" title={motivo.detail ?? undefined}>fora: {motivo.reason}</span> : null}
        </span>
      </li>
    );
  };

  const secao = (titulo: string, lista: ReactNode[], marcador: string, nota?: string) => lista.length ? (
    <section className="flex flex-col gap-2" data-arquiteto-import-section={marcador}>
      <h3 className="text-sm font-semibold text-foreground">{titulo} ({lista.length})</h3>
      {nota ? <p className="text-sm leading-6 text-text-muted">{nota}</p> : null}
      <ul className="divide-y divide-divider rounded-md border border-divider">{lista}</ul>
    </section>
  ) : null;

  const linhaDaLista = (item: ArquitetoImportItem) => {
    const cor = colorOfGroup(item.groupId);
    const importavel = isArquitetoImportable(item);
    const aberto = expanded.has(item.id);
    return (
      <li key={item.id} className="px-3 py-1.5 text-sm leading-6" data-arquiteto-import-line={item.state}>
        <div className="flex items-start gap-2">
          {importavel
            ? <input type="checkbox" className="mt-1 h-4 w-4 shrink-0" checked={selected.has(item.id)} disabled={busy} onChange={event => toggle(item.id, event.target.checked)} aria-label={`Selecionar ${item.keyword}`} />
            : <span className="h-4 w-4 shrink-0" aria-hidden="true" />}
          {cor ? <EditorialGroupDot color={cor} className="mt-2" /> : <span className="mt-2 inline-block h-2.5 w-2.5 shrink-0" aria-hidden="true" />}
          <span className="min-w-0 flex-1">
            <span className="text-keyword">{item.keyword}</span>
            <span className={`ml-2 ${STATE_TONE[item.state]}`}>· {arquitetoImportLineLabel(item)}</span>
          </span>
          <button type="button" onClick={() => toggleExpanded(item.id)} aria-expanded={aberto} aria-label={`${aberto ? "Esconder" : "Ver"} detalhes de ${item.keyword}`} title="Detalhes"
            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-text-muted transition-colors hover:bg-surface-subtle hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-module-accent/30">
            {aberto ? <ChevronDown className="h-4 w-4" aria-hidden="true" /> : <ChevronRight className="h-4 w-4" aria-hidden="true" />}
          </button>
        </div>
        {aberto ? (
          <div className="ml-12 mt-1 text-sm leading-6 text-text-muted" data-arquiteto-import-details>
            <span className="block">Status no Minerador: {item.status}{cor ? ` · cor ${EDITORIAL_GROUP_COLOR_LABELS[cor]}` : " · sem cor"}</span>
            {item.detail ? <span className="block">{item.detail}</span> : null}
            {detailsOf?.({ id: item.id })}
          </div>
        ) : null}
      </li>
    );
  };

  const corDaEscolha = color ? EDITORIAL_GROUP_COLOR_LABELS[color] : null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/90 p-4" role="dialog" aria-modal="true" aria-labelledby={ids.title} data-testid="architect-minerador-import">
      <div className="flex max-h-[92dvh] w-full max-w-3xl flex-col overflow-hidden rounded-lg border border-divider bg-surface-elevated shadow-xl">
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-divider px-4 py-3">
          <div className="min-w-0">
            <h2 id={ids.title} className="text-base font-semibold text-foreground">Importar keywords do Minerador</h2>
            <p className="mt-1 text-sm leading-6 text-text-muted">Escolha uma cor ou marque as keywords. Só entram as já aprovadas no Minerador; antes de gravar, o servidor confere cada uma. O Arquiteto não aprova: as que precisam de aprovação vão pelo “Aprovar no Minerador”. Nada é pago.</p>
          </div>
          <button type="button" onClick={onClose} disabled={busy} className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-text-muted transition-colors hover:bg-surface-subtle hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-module-accent/30 disabled:cursor-not-allowed disabled:opacity-50" aria-label="Fechar" title="Fechar">
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
          <div className="flex flex-col gap-3">
            {progresso ? (
              <div role="status" data-testid="architect-import-progress">
                <OperationProgress label={progresso.label} startedAt={phaseStartedAt} done={progresso.done} total={progresso.total} unit="etapas" testId="architect-import-operation-progress" />
              </div>
            ) : null}

            {refusal ? (
              <div role="alert" className="rounded-md border border-danger/40 px-3 py-2 text-sm leading-6" data-testid="architect-import-refusal">
                <p className="flex items-center gap-2 font-semibold text-danger"><AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />Nada foi gravado: {refusal.message}</p>
                {refusal.code === "APPROVE_AND_SEND_STALE" ? <button type="button" onClick={() => { setRefusal(null); setConfirming(null); void rereadPool(); }} className={`${internalButton} mt-2`}>Reler a lista</button> : null}
              </div>
            ) : null}

            {finished ? (
              <div role="status" className={`rounded-md border px-3 py-2 text-sm leading-6 ${finished.allConfirmed && finished.mesaUpdated ? "border-success/40" : "border-warning/40"}`} data-testid="architect-import-result">
                <p className={`flex items-center gap-2 font-semibold ${finished.allConfirmed && finished.mesaUpdated ? "text-success" : "text-warning"}`}>
                  {finished.allConfirmed && finished.mesaUpdated ? <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden="true" /> : <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />}
                  {describeApproveAndSendResult(finished.result)}
                  {finished.allConfirmed ? " · conferido na releitura do servidor" : " · a releitura não confirmou todas: veja abaixo"}
                  {finished.mesaUpdated ? "" : " · a mesa ainda está carregando; ela mostra as novas quando terminar"}
                </p>
                {(finished.result.notices ?? []).map(nota => <p key={nota} className="mt-1 text-foreground" data-testid="architect-import-notice">{nota}</p>)}
                <ul className="mt-2 divide-y divide-divider">
                  {finished.lines.map(line => (
                    <li key={line.id} className="py-1" data-arquiteto-import-outcome={line.outcome}>
                      <span className="text-keyword">{line.keyword}</span> — {line.outcome === "sent" && finished.refreshIds?.has(line.id) ? "pacote atualizado no Arquiteto" : OUTCOME_LABEL[line.outcome]}
                      {line.reason ? <span className="text-text-muted"> · {line.reason}</span> : null}
                      {line.confirmed ? null : <span className="text-warning"> · não apareceu no Arquiteto na releitura</span>}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            {confirming && !finished ? (
              <>
                {confirming.preview ? (
                  <>
                    {secao("Já aprovadas, importar", novasAImportar.map(line => linhaDaPrevia(line, true)), "enviar")}
                    {secao("Atualizam no Arquiteto (pacote novo)", atualizamNoArquiteto.map(line => linhaDaPrevia(line, true)), "atualizar", ARQUITETO_IMPORT_REFRESH_DETAIL)}
                    {secao("Precisam aprovar no Minerador", aprovarNoMinerador.map(line => <li key={line.id} className="px-3 py-2 text-sm leading-6"><span className="text-keyword">{line.keyword}</span><span className="block text-pending">precisa aprovar no Minerador</span></li>), "aprovar-no-minerador",
                      "O Arquiteto não aprova keyword. Elas não entram nesta importação: aprove no Minerador (“Aprovar e enviar”) e elas chegam aqui.")}
                    {aprovarNoMinerador.length && aprovarNoMineradorHref(aprovarNoMinerador.map(line => line.id), confirming.scope.kind === "color" ? confirming.scope.color : null)
                      ? <a href={aprovarNoMineradorHref(aprovarNoMinerador.map(line => line.id), confirming.scope.kind === "color" ? confirming.scope.color : null)!} className={internalButton} data-testid="architect-import-approve-in-minerador-preview">Aprovar no Minerador ({aprovarNoMinerador.length})</a>
                      : null}
                    {secao("Ficam fora", [
                      ...bloqueadas.map(line => linhaDaPrevia(line, false)),
                      ...foraDaCor.map(item => <li key={item.id} className="px-3 py-2 text-sm leading-6"><span className="text-keyword">{item.keyword}</span><span className="block text-warning" title={item.detail ?? undefined}>fora: {item.reason}</span></li>),
                    ], "fora")}
                    {!previewLines.length && !foraDaCor.length ? <p className="text-sm text-text-muted">Nada a importar neste escopo.</p> : null}
                  </>
                ) : null}
              </>
            ) : null}

            {!confirming && !finished ? (
              <>
                <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Importar por cor" data-testid="architect-import-colors">
                  <button type="button" onClick={() => chooseColor(null)} disabled={busy} aria-pressed={color === null}
                    className={`inline-flex min-h-9 items-center gap-2 rounded-md border px-3 text-sm font-medium text-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-module-accent/30 ${color === null ? "border-module-accent bg-surface-subtle" : "border-divider hover:border-module-accent/40"}`}>
                    Todas <span className="tabular-nums text-text-muted">{items.length}</span>
                  </button>
                  {summaries.map(summary => (
                    <button key={summary.color} type="button" onClick={() => chooseColor(summary.color)} disabled={busy || summary.total === 0} aria-pressed={color === summary.color}
                      title={`${EDITORIAL_GROUP_COLOR_LABELS[summary.color]}: ${summary.importable} podem ir${summary.refresh ? ` (${summary.refresh} atualizam no Arquiteto)` : ""} · ${summary.approveInMinerador} precisam aprovar no Minerador · ${summary.out} ficam fora · ${summary.inArquiteto} já no Arquiteto`}
                      data-arquiteto-import-color={summary.color}
                      className={`inline-flex min-h-9 items-center gap-2 rounded-md border px-3 text-sm font-medium text-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-module-accent/30 disabled:cursor-not-allowed disabled:opacity-50 ${color === summary.color ? "border-module-accent bg-surface-subtle" : "border-divider hover:border-module-accent/40"}`}>
                      <EditorialGroupDot color={summary.color} />
                      {EDITORIAL_GROUP_COLOR_LABELS[summary.color]}
                      <span className="tabular-nums text-text-muted">{summary.importable}/{summary.total}</span>
                    </button>
                  ))}
                </div>
                {colorChoice && corDaEscolha ? (
                  <p className="text-sm leading-6 text-foreground" data-testid="architect-import-color-summary">
                    Cor {corDaEscolha}: <span className="font-semibold">{colorChoice.importIds.length} podem ir</span>{colorChoice.refresh ? ` (${colorChoice.refresh} atualizam no Arquiteto: pacote novo)` : ""}{colorChoice.approveInMineradorIds.length ? ` · ${colorChoice.approveInMineradorIds.length} precisam aprovar no Minerador` : ""} · {colorChoice.out.length} ficam fora{colorChoice.out.length ? " (o motivo está na linha)" : ""} · {colorChoice.inArquiteto} já no Arquiteto.
                  </p>
                ) : null}

                {loading && !pool ? <p className="flex items-center gap-2 text-sm text-text-muted" role="status"><Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />Lendo a lista…</p> : null}
                {loadError && !pool ? (
                  <div role="alert" className="rounded-md border border-danger/40 px-3 py-2 text-sm leading-6 text-danger">
                    Não foi possível ler a lista: {loadError}
                    <button type="button" onClick={() => void rereadPool()} className={`${internalButton} ml-2`}>Tentar de novo</button>
                  </div>
                ) : null}
                {pool && !ativos.length && !jaNoArquiteto.length ? <p className="text-sm text-text-muted">Nenhuma keyword {corDaEscolha ? `da cor ${corDaEscolha}` : "nesta marca"}.</p> : null}
                {pool && !ativos.length && jaNoArquiteto.length ? <p className="text-sm text-text-muted">Todas {corDaEscolha ? `da cor ${corDaEscolha} ` : ""}já estão no Arquiteto.</p> : null}

                {ativos.length ? <ul className="divide-y divide-divider rounded-md border border-divider" data-testid="architect-import-list">{ativos.map(linhaDaLista)}</ul> : null}
                {jaNoArquiteto.length ? (
                  <div>
                    <button type="button" onClick={() => setShowInArquiteto(current => !current)} aria-expanded={showInArquiteto} className={internalButton}>
                      {showInArquiteto ? <ChevronDown className="h-4 w-4" aria-hidden="true" /> : <ChevronRight className="h-4 w-4" aria-hidden="true" />}
                      {showInArquiteto ? "Esconder" : "Mostrar"} as {jaNoArquiteto.length} que já estão no Arquiteto
                    </button>
                    {showInArquiteto ? <ul className="mt-2 divide-y divide-divider rounded-md border border-divider">{jaNoArquiteto.map(linhaDaLista)}</ul> : null}
                  </div>
                ) : null}
              </>
            ) : null}
          </div>
        </div>

        <div className="flex shrink-0 flex-wrap items-center justify-end gap-2 border-t border-divider px-4 py-3">
          {finished ? (
            <>
              <button type="button" onClick={() => { setFinished(null); }} disabled={busy} className={internalButton}>Importar mais</button>
              <button type="button" onClick={onClose} disabled={busy} className={internalButtonPrimary}>Fechar</button>
            </>
          ) : confirming ? (
            <>
              <span className="mr-auto text-sm text-text-muted">{vao.length} vão para o Arquiteto</span>
              <button type="button" onClick={() => { setConfirming(null); setRefusal(null); }} disabled={busy} className={internalButton}>Voltar</button>
              <button type="button" onClick={() => void confirmImport()} disabled={busy || !confirming.preview || vao.length === 0} className={internalButtonPrimary} data-testid="architect-import-confirm">
                {phase === "applying" ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
                {rotuloDoEscopo(confirming.scope, vao.length)}
              </button>
            </>
          ) : (
            <>
              <span className="mr-auto text-sm text-text-muted">{selecionadasVisiveis.length} marcada(s){pool ? ` · ${pool.items.length} keywords na marca` : ""}</span>
              <button type="button" onClick={onClose} disabled={busy} className={internalButton}>Cancelar</button>
              {aprovarNaLista.length && aprovarNoMineradorHref(aprovarNaLista, color) ? (
                <a href={aprovarNoMineradorHref(aprovarNaLista, color)!} className={internalButton} data-testid="architect-import-approve-in-minerador" title="Abre o Minerador filtrado nesta cor, com estas keywords no “Aprovar e enviar” de lá. O Arquiteto não aprova.">
                  Aprovar no Minerador ({aprovarNaLista.length})
                </a>
              ) : null}
              {color && colorChoice ? (
                <button type="button" onClick={() => void openConfirmation({ kind: "color", color }, selecionadasDaCor)} disabled={busy || selecionadasDaCor.length === 0} className={internalButtonPrimary} data-testid="architect-import-color-button">
                  {colorChoice.importIds.length ? `Importar a cor ${corDaEscolha} (${selecionadasDaCor.length})` : `Nada da cor ${corDaEscolha} pode ir agora`}
                </button>
              ) : (
                <button type="button" onClick={() => void openConfirmation({ kind: "selection" }, selecionadasVisiveis)} disabled={busy || selecionadasVisiveis.length === 0} className={internalButtonPrimary} data-testid="architect-import-selection-button">
                  {selecionadasVisiveis.length ? `Importar ${selecionadasVisiveis.length}` : "Importar"}
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
