"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, Loader2, X } from "lucide-react";
import { internalButton, internalButtonPrimary } from "@/components/editorial/internal-page-visual";
import {
  APPROVE_AND_SEND_RESUME,
  APPROVE_AND_SEND_SUBJECT_LINE,
  approveAndSendSubjectSummary,
  describeApproveAndSendResult,
  type ApproveAndSendLine,
  type ApproveAndSendOutcome,
  type ApproveAndSendPreview,
  type ApproveAndSendResult,
} from "@/lib/minerador/approve-and-send-core";
import { approvalBlockerLabel } from "@/lib/minerador/approval-blockers";
import { InfoHint } from "@/components/info-hint";

/**
 * "APROVAR E ENVIAR AO ARQUITETO" — a prévia e a confirmação (SDD
 * `docs/compartilhado/sdd-acelerar-fluxo-do-plano-2026-10-13.md`, item 2).
 *
 * Abre com a prévia do servidor (nada é gravado): "aprovar e enviar",
 * "já aprovadas, só enviar" e "não podem ir" com o motivo de cada uma. Cada
 * linha pode ser desmarcada (recusa por item). Confirmar manda o MESMO
 * `decisionHash`; prévia vencida volta recusada, sem gravar. O resultado só
 * aparece como concluído depois da releitura da planilha (`onApplied`).
 * Fala só com `/api/minerador/marcas/[brandId]/keywords/approve-and-send`.
 */

const ROUTE = (brandId: string) => `/api/minerador/marcas/${encodeURIComponent(brandId)}/keywords/approve-and-send`;

/**
 * 2026-10-19 · `nothingWritten`: a rota diz se a falha veio antes de qualquer gravação. Sem essa certeza (503 no meio,
 * ou sem resposta no aplicar) a tela NÃO diz "Nada foi gravado": relê a planilha e manda reler o Minerador.
 */
type Refusal = { code: string; message: string; nothingWritten: boolean };

const OUTCOME_LABEL: Record<ApproveAndSendOutcome, string> = {
  approved_and_sent: "Aprovada e enviada",
  sent: "Enviada (já estava aprovada)",
  approved: "Aprovada",
  unchanged: "Já estava aprovada",
  approved_not_sent: "Aprovada, mas não enviada",
  not_sent: "Não enviada",
  blocked: "Não pôde ir",
  excluded: "Desmarcada por você",
  stale: "Mudou no meio — nada gravado",
  failed: "Não concluída agora",
};

/** O pedido à rota (prévia ou aplicar). Também usado pela aprovação de uma keyword só, sem diálogo. */
export async function callApproveAndSend(brandId: string, body: Record<string, unknown>): Promise<{ ok: true; data: Record<string, unknown> } | { ok: false; refusal: Refusal }> {
  return call(brandId, body);
}

async function call(brandId: string, body: Record<string, unknown>): Promise<{ ok: true; data: Record<string, unknown> } | { ok: false; refusal: Refusal }> {
  const response = await fetch(ROUTE(brandId), { method: "POST", cache: "no-store", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }).catch(() => null);
  const data = response ? await response.json().catch(() => ({})) as Record<string, unknown> : {};
  if (!response || !response.ok || data.success !== true) {
    const aplicando = body.mode === "apply";
    // Sem a palavra da rota, só a prévia garante que nada foi gravado.
    const nothingWritten = typeof data.nothingWritten === "boolean" ? data.nothingWritten : !aplicando;
    const message = typeof data.message === "string" ? data.message
      : !response ? (aplicando ? `Sem resposta do servidor: releia o Minerador para ver o que foi gravado. ${APPROVE_AND_SEND_RESUME}` : "Sem conexão com o servidor.")
      : "Aprovar e enviar não pôde ser feito agora.";
    return { ok: false, refusal: { code: typeof data.code === "string" ? data.code : response ? `HTTP_${response.status}` : "NETWORK_ERROR", message, nothingWritten } };
  }
  return { ok: true, data };
}

function reasonOf(line: ApproveAndSendLine): string {
  return [...line.missing.map(approvalBlockerLabel), ...line.reasons].join(" · ") || "sem motivo informado";
}

export function ApproveAndSendDialog({ brandId, keywordIds, scopeLabel, send = true, onClose, onApplied }: {
  brandId: string;
  keywordIds: readonly string[];
  /** "3 selecionadas" ou "cor Azul · 20 keywords". */
  scopeLabel: string;
  send?: boolean;
  onClose: () => void;
  /**
   * Relê as linhas tocadas na planilha; devolve `true` quando a releitura confirmou. `result: null` (2026-10-19) = o
   * aplicar parou sem resposta certa: relê todas as pedidas para a planilha mostrar o que foi gravado.
   */
  onApplied: (touchedIds: string[], result: ApproveAndSendResult | null) => Promise<boolean>;
}) {
  const ids = { title: useId() };
  const [phase, setPhase] = useState<"previewing" | "ready" | "applying" | "rereading" | "done">("previewing");
  const [preview, setPreview] = useState<ApproveAndSendPreview | null>(null);
  const [excluded, setExcluded] = useState<Set<string>>(new Set());
  const [result, setResult] = useState<ApproveAndSendResult | null>(null);
  const [rereadOk, setRereadOk] = useState<boolean | null>(null);
  const [refusal, setRefusal] = useState<Refusal | null>(null);
  const busyRef = useRef(false);
  const busy = phase === "previewing" || phase === "applying" || phase === "rereading";
  const pedidoIds = useMemo(() => [...new Set(keywordIds)], [keywordIds]);

  const gerarPrevia = async () => {
    if (busyRef.current) return;
    busyRef.current = true;
    setPhase("previewing");
    setRefusal(null);
    setResult(null);
    try {
      const answer = await call(brandId, { mode: "preview", keywordIds: pedidoIds, send });
      if (!answer.ok) { setRefusal(answer.refusal); setPreview(null); return; }
      setPreview(answer.data as unknown as ApproveAndSendPreview);
      setExcluded(new Set());
    } finally {
      busyRef.current = false;
      setPhase(current => current === "previewing" ? "ready" : current);
    }
  };

  useEffect(() => {
    void gerarPrevia();
    // A prévia abre uma vez por pedido; "Gerar a prévia de novo" refaz.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [brandId, pedidoIds, send]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape" && !busyRef.current) onClose(); };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [onClose]);

  const linhas = preview?.lines ?? [];
  const aprovarEEnviar = linhas.filter(line => line.action === "approve_and_send" || line.action === "approve_only");
  const soEnviar = linhas.filter(line => line.action === "send_only");
  const naoVao = linhas.filter(line => line.action === "blocked");
  const jaAprovadas = linhas.filter(line => line.action === "unchanged");
  const marcadas = [...aprovarEEnviar, ...soEnviar].filter(line => !excluded.has(line.id)).length;

  const alternar = (id: string, marcar: boolean) => setExcluded(current => {
    const next = new Set(current);
    if (marcar) next.delete(id); else next.add(id);
    return next;
  });

  const confirmar = async () => {
    if (!preview || busyRef.current || marcadas === 0) return;
    busyRef.current = true;
    setPhase("applying");
    setRefusal(null);
    try {
      const answer = await call(brandId, { mode: "apply", keywordIds: pedidoIds, send, decisionHash: preview.decisionHash, excludedIds: [...excluded] });
      if (!answer.ok) {
        setRefusal(answer.refusal);
        // Parou no meio sem certeza: a planilha relê as pedidas (mostra o que foi gravado) e a prévia nova continua dali.
        if (!answer.refusal.nothingWritten) await onApplied([...pedidoIds], null).catch(() => false);
        setPhase("ready");
        return;
      }
      const aplicado = answer.data as unknown as ApproveAndSendResult;
      setResult(aplicado);
      setPhase("rereading");
      const tocadas = aplicado.results.filter(line => line.outcome !== "excluded" && line.outcome !== "blocked").map(line => line.id);
      const ok = await onApplied(tocadas, aplicado).catch(() => false);
      setRereadOk(ok);
      setPhase("done");
    } finally {
      busyRef.current = false;
    }
  };

  const secao = (titulo: string, lista: ApproveAndSendLine[], selecionavel: boolean, marcador: string) => lista.length ? (
    <section className="flex flex-col gap-2" data-approve-and-send-section={marcador}>
      <h3 className="text-sm font-semibold text-foreground">{titulo} ({lista.length})</h3>
      <ul className="divide-y divide-divider rounded-md border border-divider">
        {lista.map(line => (
          <li key={line.id} className="flex items-start gap-3 px-3 py-2 text-sm leading-6">
            {selecionavel ? (
              <input type="checkbox" className="mt-1 h-4 w-4 shrink-0" checked={!excluded.has(line.id)} disabled={busy || Boolean(result)} onChange={event => alternar(line.id, event.target.checked)} aria-label={`Incluir ${line.keyword}`} />
            ) : null}
            <span className="min-w-0 flex-1">
              <span className="text-keyword">{line.keyword}</span>
              {line.refreshInArquiteto
                ? <span className="ml-2 text-context-accent" data-approve-and-send-refresh>· atualiza no Arquiteto (pacote novo; as decisões do Arquiteto ficam)</span>
                : line.alreadyInArquiteto ? <span className="ml-2 text-text-muted">· já no Arquiteto (pacote igual: nada muda lá)</span> : null}
              {line.subjectFromVolume ? (
                <span className="block text-context-accent" data-approve-and-send-subject>
                  {APPROVE_AND_SEND_SUBJECT_LINE}: “{line.subjectFromVolume.title}”{line.subjectFromVolume.details ? ` · detalhes: ${line.subjectFromVolume.details}` : ""}{line.subjectFromVolume.legacy ? " · o Assunto do formato anterior ganha o título" : ""}
                </span>
              ) : null}
              {line.subjectFromVolumeHeld ? <span className="block text-text-muted" data-approve-and-send-subject-held>{line.subjectFromVolumeHeld}</span> : null}
              {line.action === "blocked" ? <span className="block text-text-muted">{reasonOf(line)}</span> : null}
            </span>
          </li>
        ))}
      </ul>
    </section>
  ) : null;

  const tom = result && (result.counts.stale || result.counts.failed || result.counts.approved_not_sent || result.counts.not_sent || rereadOk === false) ? "warning" : "success";

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-background/90 p-4 font-sans" role="dialog" aria-modal="true" aria-labelledby={ids.title} data-minerador-approve-and-send>
      <div className="flex max-h-[92dvh] w-full max-w-3xl flex-col overflow-hidden rounded-lg border border-divider bg-surface-elevated shadow-xl">
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-divider px-4 py-3">
          <div className="min-w-0">
            <h2 id={ids.title} className="text-base font-semibold text-foreground">{send ? "Aprovar e enviar ao Arquiteto" : "Aprovar"}</h2>
            <p className="mt-1 text-sm leading-6 text-text-muted">{scopeLabel}. A prévia não grava nada. Desmarque o que não deve ir; confirmar aprova as marcadas{send ? " e envia ao Arquiteto as que ficarem aprovadas" : ""}. Nada é pago.</p>
          </div>
          <button type="button" onClick={onClose} disabled={busy} className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-text-muted transition-colors hover:bg-surface-subtle hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-module-accent/30 disabled:cursor-not-allowed disabled:opacity-50" aria-label="Fechar" title="Fechar">
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
          <div className="flex flex-col gap-4">
            {phase === "previewing" ? <p className="flex items-center gap-2 text-sm text-text-muted" role="status"><Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />Montando a prévia…</p> : null}

            {preview && !result ? (
              <>
                {preview.counts.subjectFromVolume ? (
                  <p className="flex items-start gap-1 text-sm leading-6 text-foreground" data-approve-and-send-subject-summary>
                    <span>{approveAndSendSubjectSummary(preview.counts.subjectFromVolume)}</span>
                    <InfoHint title="Assunto pelo volume 0" description="A página publicada (ou o Assunto do formato anterior) com volume 0 ou sem média no Google Ads vira o Assunto fixo do artigo ao confirmar: o título é o texto da keyword e você o corrige depois no painel do KeywordDNA. O botão Volume só mede; quem grava o Assunto é esta confirmação. Página de Silo fica fora." />
                  </p>
                ) : null}
                {preview.blockedSummary ? (
                  <p className="text-sm leading-6 text-foreground" data-approve-and-send-motivos><span className="font-semibold text-warning">Não podem ir:</span> {preview.blockedSummary}</p>
                ) : null}
                {secao(send ? "Aprovar e enviar" : "Aprovar", aprovarEEnviar, true, "aprovar")}
                {secao("Já aprovadas, só enviar", soEnviar, true, "enviar")}
                {secao("Já aprovadas", jaAprovadas, false, "ja-aprovadas")}
                {secao("Não podem ir", naoVao, false, "bloqueadas")}
                {!linhas.length ? <p className="text-sm text-text-muted">Nenhuma keyword neste escopo.</p> : null}
              </>
            ) : null}

            {refusal ? (
              <div role="alert" className="rounded-md border border-danger/40 px-3 py-2 text-sm leading-6" data-approve-and-send-refusal>
                <p className="flex items-center gap-2 font-semibold text-danger"><AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />{refusal.nothingWritten ? "Nada foi gravado: " : "Não concluído: "}{refusal.message}</p>
                {refusal.code === "APPROVE_AND_SEND_STALE" || !refusal.nothingWritten ? <button type="button" onClick={() => void gerarPrevia()} className={`${internalButton} mt-2`}>Gerar a prévia de novo</button> : null}
              </div>
            ) : null}

            {result ? (
              <div role="status" className={`rounded-md border px-3 py-2 text-sm leading-6 ${tom === "warning" ? "border-warning/40" : "border-success/40"}`} data-approve-and-send-result>
                {phase === "rereading" ? (
                  <p className="flex items-center gap-2 text-text-muted"><Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />Gravado no servidor; relendo a planilha…</p>
                ) : (
                  <p className={`flex items-center gap-2 font-semibold ${tom === "warning" ? "text-warning" : "text-success"}`}>
                    {tom === "warning" ? <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" /> : <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden="true" />}
                    {describeApproveAndSendResult(result)}{rereadOk === false ? " · a releitura da planilha falhou: recarregue o Minerador para conferir." : " · conferido na releitura."}
                  </p>
                )}
                {(result.notices ?? []).map(nota => <p key={nota} className="mt-1 text-foreground" data-approve-and-send-notice>{nota}</p>)}
                <ul className="mt-2 divide-y divide-divider">
                  {result.results.map(line => (
                    <li key={line.id} className="py-1">
                      <span className="text-keyword">{line.keyword}</span> — {OUTCOME_LABEL[line.outcome]}{line.reason ? <span className="text-text-muted"> · {line.reason}</span> : null}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        </div>

        <div className="flex shrink-0 flex-wrap items-center justify-end gap-2 border-t border-divider px-4 py-3">
          {preview && !result ? <span className="mr-auto text-sm text-text-muted">{marcadas} marcada(s)</span> : null}
          <button type="button" onClick={onClose} disabled={busy} className={internalButton}>{result ? "Fechar" : "Cancelar"}</button>
          {!result ? (
            <button type="button" onClick={() => void confirmar()} disabled={busy || !preview || marcadas === 0} className={internalButtonPrimary} data-approve-and-send-confirm>
              {phase === "applying" ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
              {send ? `Aprovar e enviar ${marcadas}` : `Aprovar ${marcadas}`}
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
