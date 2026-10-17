"use client";
import type { ReactNode } from "react";
import type { PlanSheetRow } from "@/lib/arquiteto/plan-article-sheet";
import type { PlanArticleSheetController } from "./plan-article-sheet";

/**
 * 2026-10-16 (noite) · pedido do dono: a frase "Formação desatualizada: o lote
 * mudou desde a última análise…" saiu do painel. O que pedia "Reprocessar
 * artigos" é o próprio botão: destacado, com o porquê curto no `title`.
 */
export const ARTICLES_STALE_TITLE = "O lote mudou desde a última análise: reprocesse os artigos.";

/**
 * A BARRA DE SEMPRE DA ABA ARTIGOS — "Artigos novos · Processar artigos /
 * Reprocessar artigos · Concluir formação · Melhorar publicados… · seleção".
 *
 * 2026-10-14 (tarde) · pedido do dono: "não está nos botões principais,
 * sumiram os botões de processo normal, agora tem um lá no topo que faz de
 * tudo". Os dois botões de sempre valem para TODAS as linhas da tabela: os
 * artigos de sempre seguem pelo handler de sempre (`onProcess`/`onConfirm`,
 * com as mesmas travas); as linhas do plano marcadas (`planTargets`) vão ao
 * núcleo do plano — Processar = Validar SERP (custo antes), Concluir =
 * Concluir formação do plano (prévia antes). Para o dono é o mesmo botão.
 * "Melhorar publicados…" só abre/fecha o painel dos publicados.
 */
export function ArticlesFormationBar({
  formationBusy,
  processed,
  selectionScope,
  planTargets,
  planSheet,
  onProcess,
  onConfirm,
  improvementOpen,
  onToggleImprovement,
  buttonClassName,
  stale = false,
  attentionClassName,
  subjectActions = null,
}: {
  formationBusy: boolean;
  /** Há marcador de formação (os artigos de sempre já foram processados): o rótulo vira "Reprocessar artigos". */
  processed: boolean;
  /** 2026-10-16 (noite) · a formação de sempre está desatualizada: o botão "Reprocessar artigos" fica destacado (aditivo). */
  stale?: boolean;
  /** A variante de destaque do botão (a do sistema visual da área). */
  attentionClassName?: string;
  /**
   * 2026-10-16 (noite) · as ações do Assunto que moravam no bloco "Assuntos · N"
   * (Prender Assunto, Formar artigos automaticamente, Soltar Assunto, Confirmar
   * Assunto do Silo): o bloco saiu, as ações ficam na barra.
   */
  subjectActions?: ReactNode;
  /** O escopo dos artigos de sempre (sem as linhas do plano). */
  selectionScope: { selectedCount: number; reason: string | null };
  /** As linhas do plano marcadas na tabela (o artigo do plano da mesa e a linha do plano sem artigo). */
  planTargets: readonly PlanSheetRow[];
  planSheet: Pick<PlanArticleSheetController, "ocupado" | "start">;
  onProcess: () => Promise<unknown> | unknown;
  onConfirm: () => Promise<unknown> | unknown;
  improvementOpen: boolean;
  onToggleImprovement: () => void;
  buttonClassName: string;
}) {
  // Os botões de sempre valem para TODAS as linhas: os do plano vão ao núcleo do plano, os demais ao de sempre.
  const doPlano = [...planTargets];
  const regulares = selectionScope.selectedCount;
  const total = regulares + doPlano.length;
  const processarBloqueado = formationBusy || (doPlano.length ? planSheet.ocupado : Boolean(selectionScope.reason));
  const concluirBloqueado = formationBusy || (doPlano.length ? planSheet.ocupado : !processed || Boolean(selectionScope.reason));
  const rotaDoPlano = doPlano.length ? ` ${doPlano.length} do plano: Processar = Validar SERP (custo antes); Concluir = formação do plano (prévia antes).` : "";
  return (
    <section id="architect-articles-new" className="flex flex-wrap items-center gap-2 border-b border-divider bg-surface-subtle px-4 py-3" data-plan-selected={doPlano.length} data-testid="architect-articles-formation-actions">
      <span className="text-sm font-semibold text-foreground">Artigos novos</span>
      <button
        type="button"
        onClick={() => { void (async () => {
          if (regulares > 0) await onProcess();
          if (doPlano.length) planSheet.start("validateSerp", doPlano);
        })(); }}
        disabled={processarBloqueado}
        title={`${stale ? `${ARTICLES_STALE_TITLE} ` : ""}${(doPlano.length ? null : selectionScope.reason) ?? `Processar ${total} artigo(s) selecionado(s).${rotaDoPlano}`}`}
        data-testid="architect-articles-top-process"
        data-stale={stale ? "true" : undefined}
        className={stale && attentionClassName ? attentionClassName : buttonClassName}
      >
        {formationBusy ? "Processando…" : processed ? "Reprocessar artigos" : "Processar artigos"}
      </button>
      <button
        type="button"
        onClick={() => { void (async () => {
          if (regulares > 0) await onConfirm();
          if (doPlano.length) planSheet.start("concludeFormation", doPlano);
        })(); }}
        disabled={concluirBloqueado}
        title={(doPlano.length ? null : selectionScope.reason)
          ?? (processed || doPlano.length ? `Concluir os ${total} artigo(s) selecionado(s).${rotaDoPlano}` : "Processe os artigos antes de concluir.")}
        data-testid="architect-articles-top-confirm"
        className={buttonClassName}
      >
        Concluir formação
      </button>
      <button
        type="button"
        onClick={onToggleImprovement}
        aria-expanded={improvementOpen}
        title="Abre a melhoria dos artigos publicados (buscar keywords, coletar a SERP no DataForSEO e gravar). Só para publicados; URL, slug e canonical nunca mudam."
        data-testid="architect-articles-improve-published"
        className={buttonClassName}
      >
        {improvementOpen ? "Fechar “Melhorar publicados”" : "Melhorar publicados…"}
      </button>
      {subjectActions}
      <span className={`text-sm ${selectionScope.reason && regulares > 0 ? "text-warning" : "text-text-muted"}`} data-testid="architect-articles-selection-count">
        {total === 0
          ? selectionScope.reason
          : regulares > 0 && selectionScope.reason
            ? `${selectionScope.reason}${doPlano.length ? ` · ${doPlano.length} do plano` : ""}`
            : `${total} artigo(s) selecionado(s) na mesa${doPlano.length ? ` · ${doPlano.length} do plano` : ""}`}
      </span>
    </section>
  );
}
