"use client";

import { useEffect, useId, useRef, useState, type FormEvent, type KeyboardEvent, type ReactNode } from "react";
import { Check, Loader2, Plus, Tag } from "lucide-react";
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
 * 2026-10-12 · pedido do dono: o seletor largo virou um BOTÃO-ÍCONE de
 * etiqueta que mora na topbar global, IMEDIATAMENTE AO LADO DO SINO
 * (`GlobalTopbarModuleControls.groupTag`), no Minerador, no Arquiteto e no
 * Radar. O ícone mostra só a COR do grupo ativo; sem filtro ("Todos os
 * grupos") fica no cinza neutro (`text-muted`). O nome vai no tooltip e no
 * `aria-label` — a cor nunca aparece sozinha para quem lê (§5.0.2).
 *
 * O menu é um select de etiquetas: uma bolinha por grupo com o NOME ao lado,
 * "Todos os grupos" (cinza), "Sem grupo", "Novo grupo" (nome + cor) e as ações
 * extras do módulo (`menuFooter`). Trocar de grupo é um clique. Teclado: setas
 * (e Home/End) navegam, Esc fecha e devolve o foco ao botão.
 *
 * Não grava filtro: quem usa decide URL e lembrança (D12).
 */

const OPTION_CLASS = "flex min-h-9 w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm text-foreground transition-colors hover:bg-surface-subtle focus-visible:outline focus-visible:outline-2 focus-visible:outline-module-accent";

/** Cor do ícone de etiqueta por grupo. Classes literais (nenhuma por interpolação). */
const GROUP_TAG_ICON_CLASSES: Record<EditorialGroupColor, string> = {
  amarelo: "text-group-amarelo fill-group-amarelo-soft",
  azul: "text-group-azul fill-group-azul-soft",
  verde: "text-group-verde fill-group-verde-soft",
  lima: "text-group-lima fill-group-lima-soft",
  laranja: "text-group-laranja fill-group-laranja-soft",
};

/** Cinza neutro do "Todos os grupos" e do "Sem grupo": token existente, sem cor de grupo. */
const NEUTRAL_TAG_ICON_CLASS = "text-text-muted";

const NAV_KEYS = new Set(["ArrowDown", "ArrowUp", "Home", "End"]);

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
  const menuRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [color, setColor] = useState<EditorialGroupColor>("amarelo");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const nameId = useId();
  const errorId = useId();
  const menuId = useId();

  const ativos = groups.filter(group => group.status === "active");
  const atual = filter.kind === "group" ? ativos.find(group => group.id === filter.groupId) || null : null;
  const rotulo = filter.kind === "none" ? "Sem grupo" : atual ? `Grupo: ${atual.name}` : "Todos os grupos";
  const corDoIcone = atual ? GROUP_TAG_ICON_CLASSES[atual.color] : NEUTRAL_TAG_ICON_CLASS;

  // Ao abrir, o foco vai para a opção escolhida (ou a primeira): setas já funcionam.
  useEffect(() => {
    if (!open) return;
    const menu = menuRef.current;
    if (!menu) return;
    const alvo = menu.querySelector<HTMLElement>("[role='menuitemradio'][aria-checked='true']") || menu.querySelector<HTMLElement>("button:not([disabled])");
    alvo?.focus();
  }, [open]);

  // Fechar (escolha, Esc ou clique fora) devolve o foco ao botão — num efeito,
  // porque `fechar` também é entregue ao `menuFooter` durante o render.
  const [devolverFoco, setDevolverFoco] = useState(0);
  useEffect(() => {
    if (devolverFoco) triggerRef.current?.focus();
  }, [devolverFoco]);

  const fechar = () => {
    setOpen(false);
    setCreating(false);
    setError(null);
    setDevolverFoco(contador => contador + 1);
  };
  const escolher = (next: EditorialGroupFilter) => {
    onChange(next);
    fechar();
  };

  const navegar = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!NAV_KEYS.has(event.key)) return;
    const origem = event.target as HTMLElement;
    if (origem.tagName === "INPUT") return; // o nome e as cores do "Novo grupo" usam as setas nativas
    const itens = [...(menuRef.current?.querySelectorAll<HTMLElement>("button:not([disabled])") ?? [])];
    if (!itens.length) return;
    event.preventDefault();
    const posicao = itens.indexOf(origem);
    const proximo = event.key === "Home" ? 0
      : event.key === "End" ? itens.length - 1
      : event.key === "ArrowDown" ? (posicao + 1) % itens.length
      : (posicao <= 0 ? itens.length - 1 : posicao - 1);
    itens[proximo]?.focus();
  };

  const abrirPeloTeclado = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (open || disabled) return;
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      setOpen(true);
    }
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
        {detalhe ? <span className="shrink-0 text-sm text-text-muted">{detalhe}</span> : null}
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
        data-group-tag-color={atual ? atual.color : filter.kind === "none" ? "sem-grupo" : "todos"}
        disabled={disabled}
        onClick={() => (open ? fechar() : setOpen(true))}
        onKeyDown={abrirPeloTeclado}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        aria-label={rotulo}
        title={rotulo}
        className="relative inline-flex min-h-9 min-w-9 shrink-0 items-center justify-center rounded-md transition-colors hover:bg-foreground/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-module-accent active:bg-foreground/15 disabled:cursor-not-allowed disabled:opacity-50"
      >
        <Tag aria-hidden="true" data-group-tag-icon className={`h-5 w-5 ${corDoIcone}`} />
        {filter.kind === "none" ? <span aria-hidden="true" className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full border border-text-muted bg-background" /> : null}
      </button>
      <AnchoredPopover open={open} onClose={fechar} triggerRef={triggerRef} ariaLabel="Grupo da planilha">
        <div ref={menuRef} onKeyDown={navegar}>
          <div id={menuId} role="menu" aria-label="Grupos" className="flex flex-col gap-0.5">
            {opcao("todos", { kind: "all" }, <><span aria-hidden="true" className="inline-block h-2.5 w-2.5 shrink-0 rounded-full bg-text-muted" /><span>Todos os grupos</span></>, "")}
            {opcao("sem-grupo", { kind: "none" }, <><span aria-hidden="true" className="inline-block h-2.5 w-2.5 shrink-0 rounded-full border border-text-muted" /><span>Sem grupo</span></>, ungroupedDetail ?? `${ungroupedCount} keyword${ungroupedCount === 1 ? "" : "s"}`)}
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
        </div>
      </AnchoredPopover>
    </>
  );
}
