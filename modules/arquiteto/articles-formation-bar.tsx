"use client";
import { PLAN_FLOW_LABELS, type PlanSheetRow } from "@/lib/arquiteto/plan-article-sheet";
import type { PlanArticleSheetController } from "./plan-article-sheet";

/**
 * A BARRA DE SEMPRE DA ABA ARTIGOS — um lugar só, no topo da aba.
 *
 * 2026-10-14 (noite) · pedido do dono, com a WifiConecta azul: "tem 9 botões
 * no painel do topo, e em distintas posições, tudo confuso"; "o grupo entrou
 * no Arquiteto bem mastigado (…) era só olhar e consolidar". Com UM plano no
 * recorte (a cor da etiqueta), a barra tem no máximo dois botões: o da etapa
 * atual em destaque ("Consolidar o Silo do plano" → "Completar sustentações e
 * SERP" → "Links internos") e, só quando há publicados, "Melhorar
 * publicados…" discreto. O resto é uma linha curta ao lado.
 *
 * Sem plano no recorte (marca sem plano, ou "Todos" com mais de um plano), a
 * barra é a de sempre: "Processar artigos / Reprocessar artigos · Concluir
 * formação · Melhorar publicados… · seleção" — os artigos de sempre pelo
 * handler de sempre (`onProcess`/`onConfirm`); as linhas do plano marcadas
 * (`planTargets`) pelo núcleo do plano (Validar SERP com custo antes; Concluir
 * formação com prévia antes).
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
  primaryButtonClassName,
  hasPublished = true,
}: {
  formationBusy: boolean;
  /** Há marcador de formação (os artigos de sempre já foram processados): o rótulo vira "Reprocessar artigos". */
  processed: boolean;
  /** O escopo dos artigos de sempre (sem as linhas do plano). */
  selectionScope: { selectedCount: number; reason: string | null };
  /** As linhas do plano marcadas na tabela (o artigo do plano da mesa e a linha do plano sem artigo). */
  planTargets: readonly PlanSheetRow[];
  planSheet: Pick<PlanArticleSheetController, "ocupado" | "start"> & Partial<Pick<PlanArticleSheetController, "rows" | "flow" | "planGroupId" | "runStage">>;
  onProcess: () => Promise<unknown> | unknown;
  onConfirm: () => Promise<unknown> | unknown;
  improvementOpen: boolean;
  onToggleImprovement: () => void;
  buttonClassName: string;
  /** O botão da etapa atual do plano (destaque); ausente, o botão comum. */
  primaryButtonClassName?: string;
  /** Há artigo publicado na marca: só então "Melhorar publicados…" aparece na barra do plano. */
  hasPublished?: boolean;
}) {
  const melhorar = <button
    type="button"
    onClick={onToggleImprovement}
    aria-expanded={improvementOpen}
    title="Abre a melhoria dos artigos publicados (buscar keywords, validar no Google e gravar). Só para publicados; URL, slug e canonical nunca mudam."
    data-testid="architect-articles-improve-published"
    className={buttonClassName}
  >
    {improvementOpen ? "Fechar “Melhorar publicados”" : PLAN_FLOW_LABELS.improvePublished}
  </button>;

  /* ---------------- um plano no recorte: as três etapas, uma de cada vez ---------------- */
  const etapaAtual = planSheet.flow?.find(step => step.state === "current") ?? null;
  if (planSheet.rows?.length && planSheet.planGroupId && planSheet.flow && etapaAtual) {
    // A prévia diz por linha o que fica fora (presa em outro artigo, principal que não chegou): o botão nunca é beco sem saída.
    const bloqueado = formationBusy || planSheet.ocupado;
    return (
      <section id="architect-articles-new" className="flex flex-wrap items-center gap-2 border-b border-divider bg-surface-subtle px-4 py-3" data-plan-mode="true" data-stage={etapaAtual.id} data-testid="architect-articles-formation-actions">
        <button
          type="button"
          onClick={() => planSheet.runStage?.(etapaAtual.id)}
          disabled={bloqueado}
          title={etapaAtual.reason}
          data-testid="architect-plan-stage"
          data-stage={etapaAtual.id}
          className={primaryButtonClassName ?? buttonClassName}
        >
          {etapaAtual.label}
        </button>
        {hasPublished && melhorar}
        <span className="min-w-0 flex-1 truncate text-sm text-text-muted" title={planSheet.flow.map(step => `${step.id} · ${step.label}: ${step.reason}`).join("\n")} data-testid="architect-plan-stage-line">
          {etapaAtual.reason}
        </span>
      </section>
    );
  }

  /* ---------------- sem plano no recorte: a barra de sempre ---------------- */
  // Os botões de sempre valem para TODAS as linhas: os do plano vão ao núcleo do plano, os demais ao de sempre.
  const doPlano = [...planTargets];
  const regulares = selectionScope.selectedCount;
  const total = regulares + doPlano.length;
  const processarBloqueado = formationBusy || (doPlano.length ? planSheet.ocupado : Boolean(selectionScope.reason));
  const concluirBloqueado = formationBusy || (doPlano.length ? planSheet.ocupado : !processed || Boolean(selectionScope.reason));
  const rotaDoPlano = doPlano.length ? ` ${doPlano.length} do plano: Processar = Validar SERP (custo antes); Concluir = formação do plano (prévia antes).` : "";
  const variosPlanos = Boolean(planSheet.rows?.length) && !planSheet.planGroupId;
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
        title={(doPlano.length ? null : selectionScope.reason) ?? `Processar ${total} artigo(s) selecionado(s).${rotaDoPlano}`}
        data-testid="architect-articles-top-process"
        className={buttonClassName}
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
      {melhorar}
      <span className={`text-sm ${selectionScope.reason && regulares > 0 ? "text-warning" : "text-text-muted"}`} data-testid="architect-articles-selection-count">
        {variosPlanos
          ? "Escolha a cor do plano na etiqueta para consolidar o Silo do plano."
          : total === 0
            ? selectionScope.reason
            : regulares > 0 && selectionScope.reason
              ? `${selectionScope.reason}${doPlano.length ? ` · ${doPlano.length} do plano` : ""}`
              : `${total} artigo(s) selecionado(s) na mesa${doPlano.length ? ` · ${doPlano.length} do plano` : ""}`}
      </span>
    </section>
  );
}
