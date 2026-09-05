"use client";

import React from "react";
import type { SitemapRow, SitemapView } from "@/lib/arquiteto/sitemap-view";

/**
 * Visão Sitemap da aba Silos — a arquitetura publicada, não uma lista de URLs.
 *
 * A leitura começa pela posição de cada página na árvore: raiz editorial,
 * página filha, institucional ou a revisar. Foi a lista plana — com o mesmo
 * botão em raiz e em folha — que tornava 49 linhas ilegíveis.
 *
 * Compartilha a tabela, o scroll e a busca do workspace. O que muda são as
 * colunas, porque a pergunta é outra.
 */

const SITEMAP_GRID =
  "grid grid-cols-[minmax(16rem,2.2fr)_minmax(11rem,1.2fr)_8rem_minmax(11rem,1.3fr)_9rem_9rem] items-baseline gap-x-4";

const SITEMAP_COLUMNS = ["Página", "Caminho", "Papel", "Relação com Silo", "Verificação", "Ação"] as const;

const ROLE_LABELS: Record<SitemapRow["role"], string> = {
  site_home: "Home do site",
  editorial_root: "Raiz editorial",
  leaf: "Página filha",
  institutional: "Institucional/Técnica",
  unresolved: "Revisar",
};

const RELATION_LABELS: Record<SitemapRow["relation"]["kind"], string> = {
  unevaluated: "Não avaliada",
  existing_structure: "Estrutura existente",
  already_silo: "Já é Silo",
  silo_candidate: "Silo candidato",
  silo_confirmed: "Silo confirmado",
};

/** A verificação remota vira frase; estado desconhecido não vira promessa. */
const VERIFICATION_LABELS: Record<string, string> = {
  canonical_confirmed: "Canonical confirmado",
  canonical_divergent: "Canonical divergente",
  unreachable: "Não acessível",
  pending: "Não verificada",
};

export function SitemapViewHeader() {
  return (
    <tr className="text-xs font-semibold text-text-muted" data-testid="architect-sitemap-head">
      <th colSpan={99} className="border-b border-divider px-3 py-2 text-left">
        <div className={SITEMAP_GRID}>
          {SITEMAP_COLUMNS.map(column => <span key={column} className="truncate">{column}</span>)}
        </div>
      </th>
    </tr>
  );
}

export function SitemapViewRows({
  view,
  busyUrl,
  onUseAsSilo,
}: {
  view: SitemapView;
  busyUrl: string | null;
  onUseAsSilo: (normalizedUrl: string) => void;
}) {
  if (!view.rows.length) {
    return (
      <tr data-testid="architect-sitemap-empty">
        <td colSpan={99} className="px-3 py-6 text-sm leading-6 text-text-muted">
          {view.emptyReason || "Nenhuma página para mostrar com a busca atual."}
        </td>
      </tr>
    );
  }

  return (
    <>
      <tr data-testid="architect-sitemap-section" className="bg-surface-subtle">
        <td colSpan={99} className="px-3 py-2">
          <span className="text-sm font-bold uppercase tracking-widest text-warning">
            Site / Sitemap · {view.counts.pages}
          </span>
          {/* Contagem por papel: o que a árvore resolveu e o que sobrou. */}
          <span className="ml-3 text-sm text-text-muted" data-testid="architect-sitemap-counts">
            {view.counts.editorialRoots} raiz(es) editorial(is) · {view.counts.leaves} página(s) filha(s) ·{" "}
            {view.counts.institutional} institucional(is) · {view.counts.unresolved} a revisar
          </span>
        </td>
      </tr>
      {view.rows.map(row => {
        const raiz = row.role === "editorial_root";
        const vinculada = row.relation.kind !== "unevaluated" && row.relation.kind !== "existing_structure";
        return (
          <tr
            key={row.normalizedUrl}
            data-testid="architect-sitemap-row"
            data-normalized-url={row.normalizedUrl}
            data-role={row.role}
            className={`border-b border-divider/60 ${raiz ? "bg-module-accent/5" : ""}`}
          >
            <td colSpan={99} className="px-3 py-2">
              <div className={`${SITEMAP_GRID} text-sm`}>
                {/* Página: indentada pela profundidade real do caminho. */}
                <span className="flex min-w-0 items-baseline gap-2" style={{ paddingLeft: `${row.depth * 1.5}rem` }}>
                  <span className={`shrink-0 rounded border px-1.5 text-xs font-bold uppercase tracking-widest ${
                    raiz ? "border-module-accent/50 bg-module-accent/10 text-module-accent" : "border-divider text-text-muted"
                  }`}>
                    {raiz ? "Raiz" : row.role === "leaf" ? "Página" : row.role === "site_home" ? "Home" : row.role === "institutional" ? "Inst." : "Revisar"}
                  </span>
                  {/* Título completo no tooltip: truncar sem acesso esconderia
                      justamente o que distingue uma página da outra. */}
                  <span className={`truncate ${raiz ? "font-semibold text-foreground" : "text-foreground"}`} title={`${row.label} — ${row.url}`}>
                    {row.label}
                  </span>
                  {raiz && row.childCount > 0 && (
                    <span className="shrink-0 text-xs text-text-muted">{row.childCount} páginas</span>
                  )}
                </span>
                {/* Caminho relativo: dentro da Marca o domínio já é conhecido. */}
                <span className="truncate font-mono text-xs text-text-muted" title={row.url}>{row.path}</span>
                <span className={`truncate ${raiz ? "text-module-accent" : "text-text-muted"}`} data-testid="architect-sitemap-role">
                  {ROLE_LABELS[row.role]}
                </span>
                <span className={`truncate ${vinculada ? "text-module-accent" : "text-text-muted"}`} data-testid="architect-sitemap-relation">
                  {vinculada
                    ? `${RELATION_LABELS[row.relation.kind]}${row.relation.label ? ` · ${row.relation.label}` : ""}`
                    : row.structuralRootLabel
                      ? `Silo publicado: ${row.structuralRootLabel}`
                      : RELATION_LABELS[row.relation.kind]}
                </span>
                <span className="truncate text-text-muted">
                  {VERIFICATION_LABELS[row.verificationStatus] || row.verificationStatus}
                </span>
                {/* Promoção só na raiz sem vínculo. Folha já pertence a um
                    universo; oferecê-la como silo era o ruído principal. */}
                {row.canPromote ? (
                  <button
                    type="button"
                    onClick={() => onUseAsSilo(row.normalizedUrl)}
                    disabled={Boolean(busyUrl)}
                    data-testid="architect-sitemap-use-as-silo"
                    className="min-h-8 justify-self-start rounded border border-module-accent/40 px-2.5 text-sm font-semibold text-module-accent transition-colors hover:bg-module-accent/10 disabled:opacity-40"
                  >
                    {busyUrl === row.normalizedUrl ? "Usando…" : "Usar como Silo"}
                  </button>
                ) : (
                  <span className="truncate text-text-muted">—</span>
                )}
              </div>
            </td>
          </tr>
        );
      })}
    </>
  );
}
