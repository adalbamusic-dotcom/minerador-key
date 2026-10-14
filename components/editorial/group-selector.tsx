"use client";

import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { Check, History, Settings2, Tag, Trash2 } from "lucide-react";
import { AnchoredPopover } from "@/components/editorial/anchored-popover";
import { EditorialGroupDot } from "@/components/editorial/group-tag";
import { useAreaGroupFilter } from "@/components/editorial/editorial-group-area-store";
import { EditorialGroupHistoryDialog, EditorialGroupManageDialog } from "@/components/editorial/group-manage-dialogs";
import { EditorialGroupDeleteAllDialog } from "@/components/editorial/group-delete-all-dialog";
import { GROUP_DELETE_ALL_URL_PARAM } from "@/lib/minerador/group-delete-all";
import {
  activeEditorialGroupsOfColor,
  isEditorialGroupColor,
  EDITORIAL_GROUP_CHOICE_ALL,
  EDITORIAL_GROUP_COLOR_LABELS,
  EDITORIAL_GROUP_COLORS,
  EDITORIAL_GROUP_URL_NONE,
  editorialGroupChoiceLabel,
  editorialGroupCountLabel,
  editorialGroupCustomName,
  type EditorialGroupArea,
  type EditorialGroupChoice,
  type EditorialGroupColor,
  type EditorialGroupSummary,
} from "@/lib/editorial/editorial-groups";

/**
 * SELETOR DE GRUPO — a etiqueta de cor da topbar global (SDD 2026-10-12 §9.1).
 *
 * 2026-10-12 · adendo "cores fixas" (pedido do dono: "coloca umas cores
 * prefixados e pronto", "essa tag tem que estar no global fixado", "não pode
 * atrapalhar o carregamento"):
 *
 *   · cada cor da paleta É o grupo: o menu é um select de CORES — "Todos os
 *     grupos" (cinza, padrão), Amarelo, Azul, Verde, Lima, Laranja, "Sem grupo"
 *     e o rodapé do módulo. Nada para escrever: o formulário "Novo grupo" saiu;
 *   · se o grupo de uma cor tem um nome próprio (ex.: o nome de um plano de
 *     Silo), ele aparece discretamente ao lado da cor;
 *   · as contagens só aparecem quando já chegaram do servidor — nunca seguram o
 *     menu;
 *   · a topbar global renderiza este botão SEMPRE e na hora, ao lado do sino,
 *     no Minerador, no Arquiteto e no Radar (`TopbarGroupTag`); a escolha é de
 *     cada área (`editorial-group-area-store`).
 *
 * O ícone só muda de cor (cinza = todos). O nome vai no tooltip e no
 * `aria-label` — a cor nunca aparece sozinha para quem lê (§5.0.2). Teclado:
 * setas (e Home/End) navegam, Esc fecha e devolve o foco ao botão.
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

/** Soma as contagens dos grupos ativos de uma cor (normalmente um só). */
function contagemDaCor(groups: readonly EditorialGroupSummary[], color: EditorialGroupColor): string {
  const daCor = activeEditorialGroupsOfColor(groups, color);
  if (!daCor.length) return "";
  return editorialGroupCountLabel({
    keywordCount: daCor.reduce((soma, group) => soma + group.keywordCount, 0),
    articleCount: daCor.reduce((soma, group) => soma + group.articleCount, 0),
  });
}

export function EditorialGroupSelector({
  choice,
  onChoose,
  groups = [],
  countsReady = false,
  ungroupedDetail = null,
  disabled = false,
  menuFooter,
  onManageColor,
  onOpenHistory,
  onDeleteAll,
}: {
  choice: EditorialGroupChoice;
  onChoose: (choice: EditorialGroupChoice) => void;
  /** Os grupos da marca (para o nome próprio da cor e as contagens). Pode vir vazio: as cores são fixas. */
  groups?: readonly EditorialGroupSummary[];
  /** As contagens já chegaram do servidor (o cache local não tem contagens). */
  countsReady?: boolean;
  /** Texto ao lado de "Sem grupo" (o Radar conta artigos). Nulo = nada. */
  ungroupedDetail?: string | null;
  disabled?: boolean;
  /** Ações extras do módulo no fim do menu (ex.: "Etiquetar artigos pelo grupo das keywords"); recebe o fechar. */
  menuFooter?: (close: () => void) => ReactNode;
  /**
   * 2026-10-12 · "Gerenciar" a cor que já tem grupo (nome, trocar para cor
   * livre, liberar). Sem a função, o item não aparece.
   */
  onManageColor?: (color: EditorialGroupColor) => void;
  /** 2026-10-12 · "Histórico do grupo" (§10.4), quando há uma cor escolhida. Sem a função, o item não aparece. */
  onOpenHistory?: () => void;
  /** 2026-10-14 · F7 · "Excluir tudo da cor X…" (só no Minerador), junto do histórico. Sem a função, o item não aparece. */
  onDeleteAll?: () => void;
}) {
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const menuId = useId();

  const nomeProprio = choice !== EDITORIAL_GROUP_CHOICE_ALL && choice !== EDITORIAL_GROUP_URL_NONE ? editorialGroupCustomName(choice, groups) : null;
  const rotulo = nomeProprio ? `${editorialGroupChoiceLabel(choice)} · ${nomeProprio}` : editorialGroupChoiceLabel(choice);
  const corDoIcone = choice !== EDITORIAL_GROUP_CHOICE_ALL && choice !== EDITORIAL_GROUP_URL_NONE ? GROUP_TAG_ICON_CLASSES[choice] : NEUTRAL_TAG_ICON_CLASS;

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
    setDevolverFoco(contador => contador + 1);
  };
  const escolher = (next: EditorialGroupChoice) => {
    onChoose(next);
    fechar();
  };

  const navegar = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!NAV_KEYS.has(event.key)) return;
    const itens = [...(menuRef.current?.querySelectorAll<HTMLElement>("button:not([disabled])") ?? [])];
    if (!itens.length) return;
    event.preventDefault();
    const posicao = itens.indexOf(event.target as HTMLElement);
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

  const opcao = (alvo: EditorialGroupChoice, conteudo: ReactNode, detalhe: string) => {
    const selecionado = choice === alvo;
    return (
      <button key={alvo} type="button" role="menuitemradio" aria-checked={selecionado} data-group-choice={alvo} onClick={() => escolher(alvo)} className={`${OPTION_CLASS} ${selecionado ? "bg-selected" : ""}`}>
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
        data-group-tag-color={choice}
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
        {choice === EDITORIAL_GROUP_URL_NONE ? <span aria-hidden="true" className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full border border-text-muted bg-background" /> : null}
      </button>
      <AnchoredPopover open={open} onClose={fechar} triggerRef={triggerRef} ariaLabel="Grupo da planilha">
        <div ref={menuRef} onKeyDown={navegar}>
          <div id={menuId} role="menu" aria-label="Grupos por cor" className="flex flex-col gap-0.5">
            {opcao(EDITORIAL_GROUP_CHOICE_ALL, <><span aria-hidden="true" className="inline-block h-2.5 w-2.5 shrink-0 rounded-full bg-text-muted" /><span>Todos os grupos</span></>, "")}
            <div role="separator" className="my-1 border-t border-divider" />
            {EDITORIAL_GROUP_COLORS.map(color => {
              const nome = editorialGroupCustomName(color, groups);
              const item = opcao(color, <>
                <EditorialGroupDot color={color} />
                <span>{EDITORIAL_GROUP_COLOR_LABELS[color]}</span>
                {nome ? <span className="min-w-0 truncate text-sm text-text-muted" data-group-custom-name>{nome}</span> : null}
              </>, countsReady ? contagemDaCor(groups, color) : "");
              if (!onManageColor || !activeEditorialGroupsOfColor(groups, color).length) return item;
              // "Gerenciar" fica AO LADO da opção (nunca botão dentro de botão).
              return (
                <div key={color} className="flex items-center gap-0.5">
                  <div className="min-w-0 flex-1">{item}</div>
                  <button type="button" role="menuitem" data-group-manage-open={color} onClick={() => { fechar(); onManageColor(color); }} aria-label={`Gerenciar a cor ${EDITORIAL_GROUP_COLOR_LABELS[color]}`} title={`Gerenciar a cor ${EDITORIAL_GROUP_COLOR_LABELS[color]}: nome, trocar a cor, liberar a cor`} className="inline-flex min-h-9 min-w-9 shrink-0 items-center justify-center rounded text-text-muted transition-colors hover:bg-surface-subtle hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-module-accent">
                    <Settings2 aria-hidden="true" className="h-4 w-4" />
                  </button>
                </div>
              );
            })}
            <div role="separator" className="my-1 border-t border-divider" />
            {opcao(EDITORIAL_GROUP_URL_NONE, <><span aria-hidden="true" className="inline-block h-2.5 w-2.5 shrink-0 rounded-full border border-text-muted" /><span>Sem grupo</span></>, ungroupedDetail || "")}
            {onOpenHistory && choice !== EDITORIAL_GROUP_CHOICE_ALL && choice !== EDITORIAL_GROUP_URL_NONE && activeEditorialGroupsOfColor(groups, choice).length ? (
              <>
                <div role="separator" className="my-1 border-t border-divider" />
                <button type="button" role="menuitem" data-group-history-open onClick={() => { fechar(); onOpenHistory(); }} className={OPTION_CLASS}>
                  <History aria-hidden="true" className="h-4 w-4 shrink-0 text-text-muted" />
                  <span className="min-w-0 flex-1">Histórico do grupo</span>
                </button>
                {onDeleteAll ? (
                  <button type="button" role="menuitem" data-group-delete-all-menu={choice} onClick={() => { fechar(); onDeleteAll(); }} className={OPTION_CLASS}>
                    <Trash2 aria-hidden="true" className="h-4 w-4 shrink-0 text-danger" />
                    <span className="min-w-0 flex-1">Excluir tudo da cor {EDITORIAL_GROUP_COLOR_LABELS[choice]}…</span>
                  </button>
                ) : null}
              </>
            ) : null}
          </div>
          {menuFooter ? <div className="mt-2 border-t border-divider pt-2">{menuFooter(fechar)}</div> : null}
        </div>
      </AnchoredPopover>
    </>
  );
}

/**
 * A ETIQUETA FIXA DA TOPBAR GLOBAL: lê a escolha DESTA área e a lista de
 * grupos da marca (cache local na hora; servidor em segundo plano). Aparece
 * imediatamente — não espera a planilha nem a lista. Some só quando o banco
 * não tem os grupos (migration ausente).
 */
export function TopbarGroupTag({ brandId, area, menuFooter, ungroupedDetail }: {
  brandId: string;
  area: EditorialGroupArea;
  menuFooter?: (close: () => void) => ReactNode;
  /** O módulo pode trocar o texto do "Sem grupo" (o Radar conta artigos). */
  ungroupedDetail?: string;
}) {
  const recorte = useAreaGroupFilter(brandId, area);
  // 2026-10-12 · "Gerenciar" e "Histórico do grupo": nada é lido até o clique.
  const [gerenciar, setGerenciar] = useState<string | null>(null);
  const [historico, setHistorico] = useState<{ color: EditorialGroupColor; groupIds: string[] } | null>(null);
  // 2026-10-14 · F7 · "Excluir tudo da cor": só o Minerador executa (D8); o diálogo lê a prévia ao abrir.
  const [excluirGrupo, setExcluirGrupo] = useState<string | null>(null);
  const servidorPronto = recorte.available && recorte.groups.source === "server";
  const gruposDoServidor = recorte.groups.groups;
  // `?excluir_tudo_da_cor=<cor>` (o link do "Gerenciar a cor" das outras áreas): abre o diálogo uma vez e sai da URL.
  const pedidoDaUrl = useRef(false);
  useEffect(() => {
    if (area !== "minerador" || !servidorPronto || pedidoDaUrl.current || typeof window === "undefined") return;
    let url: URL;
    try { url = new URL(window.location.href); } catch { return; }
    const cor = url.searchParams.get(GROUP_DELETE_ALL_URL_PARAM);
    if (!cor) return;
    pedidoDaUrl.current = true;
    url.searchParams.delete(GROUP_DELETE_ALL_URL_PARAM);
    window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
    const grupo = isEditorialGroupColor(cor) ? activeEditorialGroupsOfColor(gruposDoServidor, cor)[0] ?? null : null;
    // Leitura única da URL quando a lista do servidor chega: abrir o diálogo pedido é o efeito esperado.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (grupo) setExcluirGrupo(grupo.id);
  }, [area, servidorPronto, gruposDoServidor]);
  if (!recorte.available) return null;
  const servidor = recorte.groups.source === "server";
  const semGrupo = ungroupedDetail
    ?? (servidor && typeof recorte.groups.ungroupedKeywordCount === "number"
      ? `${recorte.groups.ungroupedKeywordCount} keyword${recorte.groups.ungroupedKeywordCount === 1 ? "" : "s"}`
      : null);
  const corEscolhida = recorte.choice !== EDITORIAL_GROUP_CHOICE_ALL && recorte.choice !== EDITORIAL_GROUP_URL_NONE ? recorte.choice : null;
  return (
    <>
      <EditorialGroupSelector
        choice={recorte.choice}
        onChoose={recorte.setChoice}
        groups={recorte.groups.groups}
        countsReady={servidor}
        ungroupedDetail={semGrupo}
        menuFooter={menuFooter}
        // Gerenciar só com a lista do SERVIDOR (o cache local não tem contagens nem a trava otimista).
        onManageColor={servidor ? color => setGerenciar(activeEditorialGroupsOfColor(recorte.groups.groups, color)[0]?.id ?? null) : undefined}
        onOpenHistory={corEscolhida ? () => setHistorico({ color: corEscolhida, groupIds: activeEditorialGroupsOfColor(recorte.groups.groups, corEscolhida).map(group => group.id) }) : undefined}
        onDeleteAll={area === "minerador" && servidor && corEscolhida ? () => setExcluirGrupo(activeEditorialGroupsOfColor(recorte.groups.groups, corEscolhida)[0]?.id ?? null) : undefined}
      />
      {gerenciar ? <EditorialGroupManageDialog brandId={brandId} groupId={gerenciar} groups={recorte.groups.groups} area={area} onClose={() => setGerenciar(null)} /> : null}
      {excluirGrupo && recorte.groups.groups.some(group => group.id === excluirGrupo) ? <EditorialGroupDeleteAllDialog brandId={brandId} group={recorte.groups.groups.find(group => group.id === excluirGrupo)!} onClose={() => setExcluirGrupo(null)} /> : null}
      {historico ? <EditorialGroupHistoryDialog brandId={brandId} color={historico.color} groupIds={historico.groupIds} groups={recorte.groups.groups} onClose={() => setHistorico(null)} /> : null}
    </>
  );
}
