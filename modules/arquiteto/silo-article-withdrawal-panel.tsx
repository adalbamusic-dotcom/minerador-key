"use client";

/**
 * ===== "RETIRAR ARTIGO DO SILO" — A TELA (F4) =====
 *
 * SDD `docs/compartilhado/sdd-plano-declarado-e-grupos-2026-10-12.md` §11 passo 6.
 * Aparece em cada suporte de um Silo consolidado, na aba Silos. Três passos,
 * sempre nesta ordem: prévia do que muda → motivo obrigatório → "Confirmar
 * retirada". Quem decide recusas e o que muda é o servidor; aqui só se desenha.
 *
 * Sucesso só depois da resposta do servidor, que relê o par e o evento antes
 * de responder. A mesa é recarregada pelo chamador (`onApplied`).
 */

import { useEffect, useRef, useState } from "react";
import { ReworkNotice } from "@/components/editorial/rework-notice";
import { ArticleSubjectLine } from "@/components/editorial/article-subject-line";
import type { ReworkView } from "@/lib/editorial/rework-guard";
import {
  SILO_ARTICLE_WITHDRAWAL_ACTION_LABEL,
  SILO_ARTICLE_WITHDRAWAL_CONFIRM_LABEL,
  SILO_ARTICLE_WITHDRAWAL_REASON_MAX,
  SILO_ARTICLE_WITHDRAWAL_REASON_MIN,
  SILO_ARTICLE_WITHDRAWAL_ROUTE,
} from "@/lib/arquiteto/silo-article-withdrawal";

type Preview = {
  siloDnaVersionId: string;
  article: { articleId: string; label: string };
  changes: string[];
  warnings: string[];
  /** F5 — o aviso da guarda de retrabalho (ausente = nunca feito). */
  rework?: ReworkView;
};

type Props = {
  brandId: string;
  siloId: string;
  /** Os suportes do SiloDNA vigente (o Pilar não sai por aqui). */
  /** 2026-10-13 · `subjectPhrase` (aditivo): o Assunto do ArticleDNA, mostrado legível em cada suporte e na prévia. */
  articles: ReadonlyArray<{ articleId: string; label: string; subjectPhrase?: string | null }>;
  classNames: { button: string; dangerButton: string; control: string };
  notify: (type: "success" | "error" | "warning", message: string) => void;
  onApplied: () => void;
  /*
   * 2026-10-14 · aditivos (planilha "Artigos do plano", caso WifiConecta): abrir
   * a prévia (grátis) deste artigo assim que o painel aparece — o motivo e a
   * confirmação continuam sendo do dono — e o rótulo do item ("Suporte" por
   * padrão; o artigo que só aponta para o Silo não é suporte). Ausentes = como antes.
   */
  autoOpenArticleId?: string | null;
  itemPrefix?: string;
};

async function post(body: Record<string, unknown>) {
  const response = await fetch(SILO_ARTICLE_WITHDRAWAL_ROUTE, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = await response.json().catch(() => null) as { success?: boolean; data?: unknown; error?: string } | null;
  if (!response.ok || !json?.success) throw new Error(json?.error || "A retirada não respondeu de forma conclusiva; nada foi declarado.");
  return json.data as Record<string, unknown>;
}

export function SiloArticleWithdrawalPanel({ brandId, siloId, articles, classNames, notify, onApplied, autoOpenArticleId = null, itemPrefix = "Suporte" }: Props) {
  const [aberto, setAberto] = useState<string | null>(null);
  const [previa, setPrevia] = useState<Preview | null>(null);
  const [motivo, setMotivo] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const autoAberto = useRef<string | null>(null);
  useEffect(() => {
    if (!autoOpenArticleId || autoAberto.current === autoOpenArticleId) return;
    autoAberto.current = autoOpenArticleId;
    // A prévia só LÊ (grátis); a retirada continua pedindo motivo e "Confirmar retirada".
    void Promise.resolve().then(() => abrirPrevia(autoOpenArticleId));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- abre uma vez por artigo pedido.
  }, [autoOpenArticleId]);

  if (!articles.length) return null;

  const fechar = () => { setAberto(null); setPrevia(null); setMotivo(""); };

  async function abrirPrevia(articleId: string) {
    setAberto(articleId);
    setPrevia(null);
    setMotivo("");
    setOcupado(true);
    try {
      const data = await post({ brandId, siloId, articleId, reason: "", mode: "preview" });
      setPrevia(data as unknown as Preview);
    } catch (error) {
      notify("error", error instanceof Error ? error.message : "A prévia da retirada falhou.");
      setAberto(null);
    } finally {
      setOcupado(false);
    }
  };

  const confirmar = async () => {
    if (!previa) return;
    setOcupado(true);
    try {
      const data = await post({ brandId, siloId, articleId: previa.article.articleId, reason: motivo.trim(), mode: "apply", expectedSiloDnaVersionId: previa.siloDnaVersionId });
      const avisos = Array.isArray(data.warnings) ? data.warnings as string[] : [];
      notify("success", `“${previa.article.label}” saiu do Silo e o ArticleDNA ficou rejeitado, confirmado pela releitura.${avisos.length ? ` ${avisos.join(" ")}` : ""}`);
      fechar();
      onApplied();
    } catch (error) {
      notify("error", error instanceof Error ? error.message : "A retirada falhou; nada foi declarado.");
    } finally {
      setOcupado(false);
    }
  };

  const motivoValido = motivo.trim().length >= SILO_ARTICLE_WITHDRAWAL_REASON_MIN && motivo.trim().length <= SILO_ARTICLE_WITHDRAWAL_REASON_MAX;

  return (
    <div className="mt-2 space-y-2" data-testid="silo-article-withdrawal">
      <ul className="space-y-1">
        {articles.map(article => (
          <li key={article.articleId} className="flex flex-wrap items-center justify-between gap-2 text-sm text-text-muted">
            <span className="min-w-0 flex-1"><span className="block truncate" title={article.label}>{itemPrefix} · <span className="text-foreground">{article.label}</span></span>{"subjectPhrase" in article ? <ArticleSubjectLine as="span" phrase={article.subjectPhrase} testId="silo-withdrawal-subject"/> : null}</span>
            <button type="button" className={classNames.button} disabled={ocupado} onClick={() => void abrirPrevia(article.articleId)} aria-expanded={aberto === article.articleId}>
              {SILO_ARTICLE_WITHDRAWAL_ACTION_LABEL}
            </button>
          </li>
        ))}
      </ul>
      {aberto && (
        <div className="rounded-md border border-warning/40 bg-warning/10 p-3" role="region" aria-label={SILO_ARTICLE_WITHDRAWAL_ACTION_LABEL}>
          {!previa ? (
            <p className="text-sm text-text-muted">Montando a prévia da retirada…</p>
          ) : <>
            <p className="text-sm font-semibold text-foreground">Prévia · {previa.article.label}</p>
            {(() => { const doAberto = articles.find(article => article.articleId === aberto); return doAberto && "subjectPhrase" in doAberto ? <ArticleSubjectLine phrase={doAberto.subjectPhrase} className="mt-1"/> : null; })()}
            <ul className="mt-1 list-disc space-y-1 pl-5 text-sm leading-6 text-text-muted">
              {previa.changes.map(change => <li key={change}>{change}</li>)}
            </ul>
            {previa.warnings.length > 0 && <p className="mt-2 text-sm leading-6 text-warning">{previa.warnings.join(" ")}</p>}
            <label className="mt-3 block text-sm font-semibold text-text-muted" htmlFor={`silo-withdrawal-reason-${siloId}`}>Motivo da retirada (obrigatório)</label>
            <input
              id={`silo-withdrawal-reason-${siloId}`}
              value={motivo}
              maxLength={SILO_ARTICLE_WITHDRAWAL_REASON_MAX}
              onChange={event => setMotivo(event.target.value)}
              className={`mt-1 w-full ${classNames.control}`}
              placeholder="Ex.: fora do plano declarado"
            />
            {/* F5 — a guarda de retrabalho, acima dos botões. */}
            <ReworkNotice rework={previa.rework} testId="silo-article-withdrawal-rework" />
            <div className="mt-3 flex flex-wrap gap-2">
              <button type="button" className={classNames.dangerButton} disabled={ocupado || !motivoValido} onClick={() => void confirmar()}>
                {ocupado ? "Gravando…" : SILO_ARTICLE_WITHDRAWAL_CONFIRM_LABEL}
              </button>
              <button type="button" className={classNames.button} disabled={ocupado} onClick={fechar}>Cancelar</button>
            </div>
          </>}
        </div>
      )}
    </div>
  );
}
