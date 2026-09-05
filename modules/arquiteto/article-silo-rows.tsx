"use client";

import React from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { SILO_ORIGIN_LABELS, type ArticleSiloView } from "@/lib/arquiteto/article-silo-view";

/**
 * A SiloPage como PAGE da mesma planilha.
 *
 * Ela é unidade editorial selecionável, com linha própria e as mesmas colunas
 * do Article — o que muda entre as duas é o TIPO e o DNA, não a natureza.
 * Tratar a SiloPage só como cabeçalho a tirava do alcance de qualquer
 * operação em lote.
 *
 * A linha do Article NÃO passa por aqui: ela continua sendo a de sempre, com
 * o detalhe completo que já existia.
 *
 * Página publicada encontrada no sitemap também não passa por aqui: o Site
 * conhece a URL, não o DNA editorial dela. Article publicado de verdade chega
 * pelo Minerador e usa a linha normal, com URL, slug e canonical travados.
 */

/** Célula alinhada; sem alinhamento a mesa deixa de ser ferramenta. */
function Cell({ children, align = "left" }: { children: React.ReactNode; align?: "left" | "center" | "right" }) {
  return (
    <td className={`border-r border-divider/60 px-2 py-2 align-top text-sm text-text-muted ${align === "center" ? "text-center" : align === "right" ? "text-right" : ""}`}>
      {children}
    </td>
  );
}

function ExpandButton({ open, onClick, label, testId }: { open: boolean; onClick: () => void; label: string; testId: string }) {
  return (
    <button
      type="button"
      onClick={event => { event.stopPropagation(); onClick(); }}
      data-testid={testId}
      aria-expanded={open}
      aria-label={label}
      className="inline-flex items-center text-text-muted transition-colors hover:text-foreground"
    >
      {open ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
    </button>
  );
}

/**
 * A SiloPage: page raiz do grupo, selecionável como qualquer outra.
 *
 * A identidade de seleção é o `territoryRef` real — nunca um articleId
 * fabricado, que faria a SiloPage entrar em operações de Article.
 */
export function ArticleSiloPageRow({
  view,
  selected,
  expanded,
  onToggleSelected,
  onToggleExpanded,
}: {
  view: ArticleSiloView;
  selected: boolean;
  expanded: boolean;
  onToggleSelected: () => void;
  onToggleExpanded: () => void;
}) {
  const novos = view.counts.articles + view.counts.candidates + view.counts.published;

  return (
    <>
      <tr
        data-testid="architect-silopage-row"
        data-unit-type="silo_page"
        data-silo-ref={view.siloRef}
        className="border-y border-module-accent/25 bg-module-accent/[0.07]"
      >
        <Cell align="center">—</Cell>
        <td className="border-r border-divider/60 px-2 py-2 text-center align-top">
          <input
            type="checkbox"
            role="checkbox"
            checked={selected}
            aria-checked={selected}
            aria-label={`Selecionar a SiloPage ${view.siloLabel}`}
            data-silo-page-selection-id={`silo-page:${view.siloRef}`}
            onClick={event => event.stopPropagation()}
            onChange={event => { event.stopPropagation(); onToggleSelected(); }}
            className="h-3.5 w-3.5 cursor-pointer rounded border-divider bg-surface-subtle accent-module-accent"
          />
        </td>
        <td className="border-r border-divider/60 px-2 py-2 align-top">
          <ExpandButton
            open={expanded}
            onClick={onToggleExpanded}
            label={expanded ? "Recolher o DNA da SiloPage" : "Abrir o DNA da SiloPage"}
            testId="architect-silopage-expand"
          />
        </td>
        <td className="border-r border-divider/60 px-3 py-2 align-top">
          <span className="text-sm font-bold uppercase tracking-wider text-module-accent">SILOPAGE</span>
        </td>
        <td className="border-r border-divider/60 px-3 py-2 align-top">
          <span className="text-sm font-semibold text-foreground">{view.siloLabel}</span>
          <span className="mt-0.5 block truncate font-mono text-sm text-text-muted" title={view.siloSlug || undefined}>
            {view.siloSlug || "página ainda não definida"}
          </span>
        </td>
        <Cell align="center">{view.counts.keywords} kw · {novos} page{novos === 1 ? "" : "s"}</Cell>
        <Cell align="center">—</Cell>
        <Cell align="center">Silo confirmado</Cell>
        {/* A coluna Silo pertence ao Article; a SiloPage É o Silo. */}
        <Cell>—</Cell>
        <Cell align="right">—</Cell>
        <Cell>—</Cell>
        <td className="px-2 py-2 align-top text-sm">
          <span className={view.identity.published ? "text-success" : "text-text-muted"}>
            {view.identity.published ? `Publicada${view.identity.protected ? " · protegido" : ""}` : "Não publicada"}
          </span>
        </td>
      </tr>

      {expanded && (
        <tr className="border-b border-divider bg-surface" data-testid="architect-silopage-dna">
          <td colSpan={12} className="border-l-2 border-l-module-accent px-6 py-4">
            <p className="text-sm font-semibold uppercase tracking-wider text-module-accent">DNA da SiloPage</p>
            <div className="mt-2 grid gap-x-8 gap-y-3 sm:grid-cols-3">
              <div>
                <p className="text-sm font-semibold text-text-muted">Identidade</p>
                <dl className="mt-1 grid gap-y-1 text-sm">
                  <div><dt className="text-text-muted">Nome</dt><dd className="text-foreground">{view.siloLabel}</dd></div>
                  <div><dt className="text-text-muted">Tipo</dt><dd className="text-foreground">SiloPage</dd></div>
                  <div><dt className="text-text-muted">Origem</dt><dd className="text-foreground">{SILO_ORIGIN_LABELS[view.identity.origin]}</dd></div>
                </dl>
              </div>

              <div>
                <p className="text-sm font-semibold text-text-muted">Página</p>
                <dl className="mt-1 grid gap-y-1 text-sm">
                  <div>
                    {/* Publicada tem página; projetada tem slug proposto. Dizer
                        "sem página definida" com slug proposto esconderia o que
                        o Território já decidiu. */}
                    <dt className="text-text-muted">{view.identity.published ? "Página" : "Página projetada"}</dt>
                    <dd className="font-mono text-foreground">{view.siloSlug || "ainda não definida"}</dd>
                  </div>
                  <div><dt className="text-text-muted">Publicação</dt><dd className="text-foreground">{view.identity.published ? "Publicada" : "Não publicada"}</dd></div>
                  {view.identity.protected && (
                    <div><dt className="text-text-muted">Canonical</dt><dd className="text-success">protegido</dd></div>
                  )}
                </dl>
              </div>

              <div>
                <p className="text-sm font-semibold text-text-muted">Estrutura</p>
                <dl className="mt-1 grid gap-y-1 text-sm">
                  <div><dt className="text-text-muted">Keywords do Silo</dt><dd className="text-foreground">{view.counts.keywords}</dd></div>
                  <div><dt className="text-text-muted">Articles</dt><dd className="text-foreground">{novos}</dd></div>
                  <div><dt className="text-text-muted">Articles publicados</dt><dd className="text-foreground">{view.counts.published}</dd></div>
                  {/* Evidência do Site: a URL existe, mas o DNA editorial dela
                      ainda não foi recebido do Minerador. */}
                  <div>
                    <dt className="text-text-muted">Páginas no site</dt>
                    <dd className="text-text-muted" data-testid="architect-silopage-site-pages">
                      {view.counts.publishedPages} conhecida(s) · sem DNA editorial
                    </dd>
                  </div>
                </dl>

                <p className="mt-2 text-sm font-semibold text-text-muted">Governança</p>
                <dl className="mt-1 grid gap-y-1 text-sm">
                  <div><dt className="text-text-muted">Silo confirmado</dt><dd className="text-foreground">sim</dd></div>
                  {/* Projetar a unidade não é materializar o artefato. */}
                  <div>
                    <dt className="text-text-muted">SiloPage canônica</dt>
                    <dd className={view.identity.canonical ? "text-foreground" : "text-warning"} data-testid="architect-silopage-canonical-state">
                      {view.identity.canonical ? "existe" : "ainda não criada"}
                    </dd>
                  </div>
                </dl>
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}
