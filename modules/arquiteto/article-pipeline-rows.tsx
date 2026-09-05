"use client";

import React from "react";
import type { ArticlePipelineRow, ArticlePipelineState } from "@/lib/arquiteto/article-pipeline";
import { ARTICLE_PIPELINE_SECTION_ORDER } from "@/lib/arquiteto/article-pipeline";

/**
 * Linhas de continuidade da KeywordDNA na aba Artigos.
 *
 * Compartilham a MESMA mesa das linhas de artigo: mesma tabela, mesmo scroll,
 * mesma busca. Não são Article — não têm checkbox de seleção de artigo, não
 * recebem `articleId` e não abrem formação. Existem para que o patrimônio
 * continue visível enquanto a decisão de Silo não acontece.
 */

const SECTION_LABELS: Record<Exclude<ArticlePipelineState, "article_working">, string> = {
  eligible: "Prontas para artigo",
  awaiting_silo_confirmation: "Aguardando confirmação do Silo",
  awaiting_silo: "Aguardando definição de Silo",
  reserved_silo_head: "Reservadas para a página do Silo",
};

/** Onde a decisão que destrava cada estado é tomada. */
const SECTION_HINTS: Record<Exclude<ArticlePipelineState, "article_working">, string> = {
  eligible: "Silo confirmado. Processe os artigos para formar as unidades editoriais.",
  awaiting_silo_confirmation: "Confirme o Silo na aba Silos para liberar a formação.",
  awaiting_silo: "Defina o Silo na aba Silos para liberar a formação.",
  reserved_silo_head: "A cabeceira pertence à página do Silo e não vira artigo.",
};

export function ArticlePipelineRows({ rows }: { rows: readonly ArticlePipelineRow[] }) {
  if (!rows.length) return null;

  // Uma seção por estado, na ordem do domínio; estado sem linha não aparece.
  const sections = ARTICLE_PIPELINE_SECTION_ORDER
    .map(state => ({ state, rows: rows.filter(row => row.state === state) }))
    .filter(section => section.rows.length > 0);

  return (
    <>
      {sections.map(section => (
        <React.Fragment key={section.state}>
          <tr data-testid="architect-pipeline-section" className="bg-surface-subtle">
            <td colSpan={99} className="px-3 py-2">
              <div className="flex flex-wrap items-baseline gap-x-3">
                <span className="text-sm font-bold uppercase tracking-widest text-warning">
                  {SECTION_LABELS[section.state]} · {section.rows.length}
                </span>
                <span className="text-sm text-text-muted">{SECTION_HINTS[section.state]}</span>
              </div>
            </td>
          </tr>
          {section.rows.map(row => (
            <tr
              key={row.keywordId}
              data-testid="architect-pipeline-row"
              data-keyword-id={row.keywordId}
              className="border-b border-divider/60"
            >
              <td colSpan={99} className="px-3 py-2">
                <div className="grid grid-cols-[minmax(14rem,2fr)_minmax(10rem,1fr)_minmax(12rem,1.4fr)] items-baseline gap-x-4 text-sm">
                  <span className="flex min-w-0 items-baseline gap-2">
                    <span className="shrink-0 rounded border border-divider px-1.5 text-xs font-bold uppercase tracking-widest text-text-muted">
                      Keyword
                    </span>
                    <span className="truncate text-foreground" title={row.keyword}>{row.keyword}</span>
                  </span>
                  {/* Silo só aparece quando existe vínculo real. */}
                  <span className={`truncate ${row.siloName ? "text-foreground" : "text-text-muted"}`}>
                    {row.siloName || "—"}
                  </span>
                  <span className="truncate text-text-muted">{row.reason}</span>
                </div>
              </td>
            </tr>
          ))}
        </React.Fragment>
      ))}
    </>
  );
}
