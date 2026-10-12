"use client";

import { useId, useRef, useState, type FormEvent, type ReactNode } from "react";
import { Check, ChevronDown, Loader2, Plus } from "lucide-react";
import { AnchoredPopover } from "@/components/editorial/anchored-popover";
import { EditorialGroupDot } from "@/components/editorial/group-tag";
import {
  EDITORIAL_GROUP_COLOR_CLASSES,
  EDITORIAL_GROUP_COLOR_LABELS,
  EDITORIAL_GROUP_COLORS,
  EDITORIAL_GROUP_NAME_MAX,
  editorialGroupCountLabel,
  sameEditorialGroupFilter,
  type EditorialGroupColor,
  type EditorialGroupFilter,
  type EditorialGroupSummary,
} from "@/lib/editorial/editorial-groups";

/**
 * SELETOR DE GRUPO — compartilhado pelas planilhas (SDD 2026-10-12 §9.1).
 *
 * F1 usa no Minerador; F2 põe o mesmo componente no Arquiteto e no Radar.
 * Opções: "Todos os grupos", "Sem grupo" e cada grupo ativo com bolinha de
 * cor, NOME e contagem. "Novo grupo" cria com nome + uma das 5 cores (cada
 * amostra com o nome escrito). Não grava filtro: quem usa decide URL e
 * lembrança (o Minerador põe na URL e lembra localmente, D12).
 */

const OPTION_CLASS = "flex min-h-9 w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm text-foreground transition-colors hover:bg-surface-subtle focus-visible:outline focus-visible:outline-2 focus-visible:outline-module-accent";

export function EditorialGroupSelector({
  groups,
  ungroupedCount,
  filter,
  onChange,
  onCreate,
  disabled = false,
  canCreate = true,
  ungroupedDetail,
  menuFooter,
}: {
  groups: readonly EditorialGroupSummary[];
  ungroupedCount: number;
  filter: EditorialGroupFilter;
  onChange: (filter: EditorialGroupFilter) => void;
  onCreate?: (name: string, color: EditorialGroupColor) => Promise<{ ok: true; group: EditorialGroupSummary } | { ok: false; message: string }>;
  disabled?: boolean;
  canCreate?: boolean;
  /** F2 · texto ao lado de "Sem grupo" (o Radar conta artigos, não keywords). Ausente = contagem de keywords, como no Minerador. */
  ungroupedDetail?: string;
  /** F2 · ações extras no fim do menu (ex.: "Etiquetar artigos pelo grupo das keywords"); recebe o fechar. */
  menuFooter?: (close: () => void) => ReactNode;
}) {
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [color, setColor] = useState<EditorialGroupColor>("amarelo");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const nameId = useId();
  const errorId = useId();

  const ativos = groups.filter(group => group.status === "active");
  const atual = filter.kind === "group" ? ativos.find(group => group.id === filter.groupId) || null : null;
  const rotulo = filter.kind === "none" ? "Sem grupo" : atual ? atual.name : "Todos os grupos";

  const fechar = () => {
    setOpen(false);
    setCreating(false);
    setError(null);
  };
  const escolher = (next: EditorialGroupFilter) => {
    onChange(next);
    fechar();
  };

  const criar = async (event: FormEvent) => {
    event.preventDefault();
    if (!onCreate || saving) return;
    const limpo = name.replace(/\s+/g, " ").trim();
    if (!limpo) {
      setError("Dê um nome ao grupo.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const resultado = await onCreate(limpo, color);
      if (!resultado.ok) {
        setError(resultado.message);
        return;
      }
      setName("");
      setColor("amarelo");
      escolher({ kind: "group", groupId: resultado.group.id });
    } finally {
      setSaving(false);
    }
  };

  const opcao = (key: string, alvo: EditorialGroupFilter, conteudo: ReactNode, detalhe: string) => {
    const selecionado = sameEditorialGroupFilter(filter, alvo);
    return (
      <button key={key} type="button" role="menuitemradio" aria-checked={selecionado} onClick={() => escolher(alvo)} className={`${OPTION_CLASS} ${selecionado ? "bg-selected" : ""}`}>
        <span className="flex min-w-0 flex-1 items-center gap-2">{conteudo}</span>
        <span className="shrink-0 text-sm text-text-muted">{detalhe}</span>
        <Check aria-hidden="true" className={`h-4 w-4 shrink-0 ${selecionado ? "text-module-accent" : "invisible"}`} />
      </button>
    );
  };

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        data-editorial-group-selector
        disabled={disabled}
        onClick={() => (open ? fechar() : setOpen(true))}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Grupo: ${rotulo}`}
        title="Ler a planilha só por um grupo"
        className="inline-flex h-8 min-w-0 max-w-56 shrink items-center gap-1.5 rounded-md border border-divider-dark bg-surface-subtle px-2 text-sm font-medium text-foreground transition-colors hover:border-module-accent/30 hover:bg-module-accent/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-module-accent/50 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {atual ? <EditorialGroupDot color={atual.color} /> : null}
        <span className="min-w-0 truncate">{rotulo}</span>
        <ChevronDown aria-hidden="true" className="h-4 w-4 shrink-0 text-text-muted" />
      </button>
      <AnchoredPopover open={open} onClose={fechar} triggerRef={triggerRef} ariaLabel="Grupo da planilha">
        <div role="menu" aria-label="Grupos" className="flex flex-col gap-0.5">
          {opcao("todos", { kind: "all" }, <span>Todos os grupos</span>, "")}
          {opcao("sem-grupo", { kind: "none" }, <span>Sem grupo</span>, ungroupedDetail ?? `${ungroupedCount} keyword${ungroupedCount === 1 ? "" : "s"}`)}
          {ativos.length ? <div role="separator" className="my-1 border-t border-divider" /> : null}
          {ativos.map(group => opcao(group.id, { kind: "group", groupId: group.id }, <><EditorialGroupDot color={group.color} /><span className="min-w-0 break-words">{group.name}</span></>, editorialGroupCountLabel(group)))}
        </div>
        {canCreate && onCreate ? (
          <div className="mt-2 border-t border-divider pt-2">
            {!creating ? (
              <button type="button" onClick={() => setCreating(true)} className={OPTION_CLASS}>
                <Plus aria-hidden="true" className="h-4 w-4 text-text-muted" />
                Novo grupo
              </button>
            ) : (
              <form onSubmit={criar} className="flex flex-col gap-2" aria-label="Novo grupo">
                <label htmlFor={nameId} className="text-sm font-medium text-text-muted">Nome do grupo</label>
                <input
                  id={nameId}
                  autoFocus
                  value={name}
                  maxLength={EDITORIAL_GROUP_NAME_MAX}
                  onChange={event => setName(event.target.value)}
                  aria-invalid={Boolean(error)}
                  aria-describedby={error ? errorId : undefined}
                  className="min-h-9 rounded border border-divider bg-background px-2 py-1.5 text-sm text-foreground focus:border-module-accent focus:outline-none"
                />
                <fieldset className="flex flex-col gap-1">
                  <legend className="mb-1 text-sm font-medium text-text-muted">Cor</legend>
                  <div className="flex flex-wrap gap-1">
                    {EDITORIAL_GROUP_COLORS.map(opcaoCor => (
                      <label key={opcaoCor} className={`inline-flex min-h-9 cursor-pointer items-center gap-1.5 rounded border px-2 text-sm text-foreground transition-colors focus-within:outline focus-within:outline-2 focus-within:outline-module-accent ${color === opcaoCor ? `${EDITORIAL_GROUP_COLOR_CLASSES[opcaoCor].chip}` : "border-divider hover:bg-surface-subtle"}`}>
                        <input type="radio" name="editorial-group-color" value={opcaoCor} checked={color === opcaoCor} onChange={() => setColor(opcaoCor)} className="sr-only" />
                        <EditorialGroupDot color={opcaoCor} />
                        {EDITORIAL_GROUP_COLOR_LABELS[opcaoCor]}
                      </label>
                    ))}
                  </div>
                </fieldset>
                {error ? <p id={errorId} role="alert" className="text-sm text-danger">{error}</p> : null}
                <div className="flex items-center justify-end gap-2">
                  <button type="button" onClick={() => { setCreating(false); setError(null); }} className="min-h-9 rounded px-3 text-sm font-medium text-text-muted transition-colors hover:bg-surface-subtle hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-module-accent">
                    Cancelar
                  </button>
                  <button type="submit" disabled={saving} className="inline-flex min-h-9 items-center gap-1.5 rounded bg-action-accent px-3 text-sm font-medium text-foreground transition-colors hover:bg-action-accent/85 focus-visible:outline focus-visible:outline-2 focus-visible:outline-module-accent disabled:cursor-not-allowed disabled:opacity-50">
                    {saving ? <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" /> : null}
                    Criar grupo
                  </button>
                </div>
              </form>
            )}
          </div>
        ) : null}
        {menuFooter ? <div className="mt-2 border-t border-divider pt-2">{menuFooter(fechar)}</div> : null}
      </AnchoredPopover>
    </>
  );
}
