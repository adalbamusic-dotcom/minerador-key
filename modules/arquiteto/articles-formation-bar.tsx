"use client";
import type { PlanSheetRow } from "@/lib/arquiteto/plan-article-sheet";
import type { PlanArticleSheetController } from "./plan-article-sheet";

/**
 * 2026-10-16 (noite) · pedido do dono: a frase "Formação desatualizada: o lote
 * mudou desde a última análise…" saiu do painel. O que pedia "Reprocessar
 * artigos" é o próprio botão: destacado, com o porquê curto no `title`.
 */
export const ARTICLES_STALE_TITLE = "O lote mudou desde a última análise: reprocesse os artigos.";

/** Os 3 botões da linha, na ordem do trabalho (dono, 17/10: "tem que ser sequencial e na mesma linha de trabalho"). */
export type ArticlesFormationStep = "process" | "conclude" | "improve";

/**
 * A BARRA DE SEMPRE DA ABA ARTIGOS — "Artigos novos · Processar artigos ·
 * Concluir formação · Melhorar publicados… · seleção".
 *
 * 2026-10-14 (tarde) · pedido do dono: "não está nos botões principais,
 * sumiram os botões de processo normal". Os botões de sempre valem para TODAS
 * as linhas da tabela: os artigos de sempre seguem pelo handler de sempre
 * (`onProcess`/`onConfirm`, com as mesmas travas); as linhas do plano marcadas
 * (`planTargets`) vão ao núcleo do plano.
 *
 * 2026-10-17 (noite) · O DONO, literal: "3 botões já é suficiente para resolver
 * tudo, e na mesma linha de processo sem inventar outras linhas"; "tem 7 botões
 * totalmente inúteis"; "tem que ser sequencial". Na barra ficam SÓ os 3:
 *  1. "Processar artigos" — para as linhas do plano: lê o plano e os DNAs, busca
 *     o reforço (lista da marca e Google Ads, grátis) e coleta a SERP da
 *     principal que falta, com UMA confirmação de custo; nada é gravado;
 *  2. "Concluir formação" — UMA confirmação que grava tudo (keywords novas,
 *     ArticleDNA de cada artigo, Silo do plano fechado e o grupo ligado a ele);
 *     só com o passo 1 feito para a seleção;
 *  3. "Melhorar publicados…" — o refazedor (publicados e artigos que falharam ou
 *     ficaram fracos), abre e fecha como alternância; para a seleção, só depois
 *     do passo 2 (os publicados não passam por 1 e 2: para eles fica habilitado).
 * O passo atual é o destacado; o seguinte só habilita quando o anterior fez a
 * parte dele, com o porquê no `title`. Saíram da barra: "Ações do Assunto"
 * (Prender/Soltar foi para o painel do artigo, ao abrir a linha; "Formar
 * artigos automaticamente" era duplicata de Processar + Concluir) e o rótulo
 * "Fechar “Melhorar publicados”" (o mesmo botão fecha).
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
  publishedCount = 0,
  regularConcluded = false,
}: {
  formationBusy: boolean;
  /** Há marcador de formação (os artigos de sempre já foram processados): o rótulo vira "Reprocessar artigos". */
  processed: boolean;
  /** 2026-10-16 (noite) · a formação de sempre está desatualizada: o botão "Reprocessar artigos" fica destacado (aditivo). */
  stale?: boolean;
  /** A variante de destaque do botão (a do sistema visual da área): o passo atual. */
  attentionClassName?: string;
  /** O escopo dos artigos de sempre (sem as linhas do plano). */
  selectionScope: { selectedCount: number; reason: string | null };
  /** As linhas do plano marcadas na tabela (o artigo do plano da mesa e a linha do plano sem artigo). */
  planTargets: readonly PlanSheetRow[];
  planSheet: Pick<PlanArticleSheetController, "ocupado" | "start" | "stepOf">;
  onProcess: () => Promise<unknown> | unknown;
  onConfirm: () => Promise<unknown> | unknown;
  improvementOpen: boolean;
  onToggleImprovement: () => void;
  buttonClassName: string;
  /** 2026-10-17 (noite) · publicados no recorte: "Melhorar publicados…" fica habilitado para eles (não passam por 1 e 2). */
  publishedCount?: number;
  /** 2026-10-17 (noite) · os artigos de sempre marcados já têm o ArticleDNA (o passo 2 deles está feito). */
  regularConcluded?: boolean;
}) {
  // Os botões de sempre valem para TODAS as linhas: os do plano vão ao núcleo do plano, os demais ao de sempre.
  const doPlano = [...planTargets];
  const regulares = selectionScope.selectedCount;
  const total = regulares + doPlano.length;
  const plano = doPlano.length ? planSheet.stepOf(doPlano) : null;
  // Os artigos de sempre: o marcador da formação diz que o Processar fez a parte dele (a portaria do Concluir confere o resto, como sempre).
  const processou = total > 0 && (plano ? plano.processed : true) && (regulares ? processed : true);
  const concluiu = total > 0 && (plano ? plano.concluded : true) && (regulares ? regularConcluded : true);
  const passo: ArticlesFormationStep | null = total === 0 ? (publishedCount > 0 ? "improve" : null) : concluiu ? "improve" : processou ? "conclude" : "process";
  const ocupado = formationBusy ? "Processando: espere terminar."
    : doPlano.length && planSheet.ocupado ? "Há uma prévia aberta logo abaixo: confirme ou cancele." : null;
  const semSelecao = total === 0 ? selectionScope.reason ?? "Selecione os artigos na tabela." : regulares > 0 ? selectionScope.reason : null;
  const motivoProcessar = ocupado ?? semSelecao;
  const motivoConcluir = ocupado ?? semSelecao ?? (processou ? null : "Passo 1 primeiro: “Processar artigos” busca o reforço e a SERP que falta (custo antes).");
  const motivoMelhorar = improvementOpen || publishedCount > 0 || concluiu ? null : "Passo 2 primeiro: conclua a formação. “Melhorar publicados…” refaz o reforço e a leitura dos artigos já formados e dos publicados.";
  const destaque = (step: ArticlesFormationStep, extra = false) => (passo === step || extra) && attentionClassName ? attentionClassName : buttonClassName;
  return (
    <section id="architect-articles-new" className="flex flex-wrap items-center gap-2 border-b border-divider bg-surface-subtle px-4 py-3" data-plan-selected={doPlano.length} data-current-step={passo ?? undefined} data-testid="architect-articles-formation-actions">
      <span className="text-sm font-semibold text-foreground">Artigos novos</span>
      <button
        type="button"
        onClick={() => { void (async () => {
          if (regulares > 0) await onProcess();
          if (doPlano.length) planSheet.start("processArticles", doPlano);
        })(); }}
        disabled={Boolean(motivoProcessar)}
        title={`${stale ? `${ARTICLES_STALE_TITLE} ` : ""}${motivoProcessar ?? `Passo 1 · lê o plano e os DNAs, busca o reforço (lista da marca e Google Ads, grátis) e coleta a SERP que falta, com o custo antes. Nada é gravado.`}`}
        data-testid="architect-articles-top-process"
        data-stale={stale ? "true" : undefined}
        data-step="process"
        aria-current={passo === "process" ? "step" : undefined}
        className={destaque("process", stale)}
      >
        {formationBusy ? "Processando…" : processou || (regulares > 0 && processed) ? "Reprocessar artigos" : "Processar artigos"}
      </button>
      <button
        type="button"
        onClick={() => { void (async () => {
          if (regulares > 0) await onConfirm();
          if (doPlano.length) planSheet.start("concludeFormation", doPlano);
        })(); }}
        disabled={Boolean(motivoConcluir)}
        title={motivoConcluir ?? "Passo 2 · uma confirmação grava tudo: as keywords novas, o ArticleDNA de cada artigo e o Silo do plano (prévia com o checklist antes)."}
        data-testid="architect-articles-top-confirm"
        data-step="conclude"
        aria-current={passo === "conclude" ? "step" : undefined}
        className={destaque("conclude")}
      >
        Concluir formação
      </button>
      <button
        type="button"
        onClick={onToggleImprovement}
        disabled={Boolean(motivoMelhorar)}
        aria-pressed={improvementOpen}
        aria-expanded={improvementOpen}
        title={motivoMelhorar ?? (improvementOpen ? "Fecha o refazedor." : "Passo 3 · o refazedor: refaz a leitura, o reforço e a troca dos publicados e dos artigos que falharam ou ficaram fracos (prévia e uma confirmação). No publicado, o Assunto da página é a âncora: a principal leva o que define o artigo, e a keyword que é de outro artigo do grupo vai para ele. URL, slug e canonical nunca mudam.")}
        data-testid="architect-articles-improve-published"
        data-step="improve"
        aria-current={passo === "improve" ? "step" : undefined}
        className={destaque("improve")}
      >
        {"Melhorar publicados…"}
      </button>
      <span className={`text-sm ${selectionScope.reason && regulares > 0 ? "text-warning" : "text-text-muted"}`} data-testid="architect-articles-selection-count">
        {total === 0
          ? selectionScope.reason
          : regulares > 0 && selectionScope.reason
            ? `${selectionScope.reason}${doPlano.length ? ` · ${doPlano.length} do plano` : ""}`
            : `${total} selecionado(s)${doPlano.length ? ` · ${doPlano.length} do plano` : ""}`}
      </span>
    </section>
  );
}
