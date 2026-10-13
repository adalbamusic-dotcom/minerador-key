import {
  EDITORIAL_GROUP_CHOICE_ALL,
  EDITORIAL_GROUP_COLOR_LABELS,
  EDITORIAL_GROUP_URL_NONE,
  activeEditorialGroupsOfColor,
  editorialGroupNameKey,
  parseEditorialGroupChoice,
  type EditorialGroupColor,
  type EditorialGroupScreenFilter,
  type EditorialGroupSummary,
} from "./editorial-groups.ts";

/**
 * ===== F6 · O GRUPO NOS ENTREGÁVEIS E NO MCP — DOMÍNIO PURO =====
 *
 * SDD `docs/compartilhado/sdd-plano-declarado-e-grupos-2026-10-12.md` §6.4,
 * §6.5 e §9.1-A. Sem storage, sem fetch, sem React.
 *
 * 1. O RÓTULO do grupo de um artigo, para o CSV "Para escrever", o MCP
 *    (`get_article_for_writing`) e as telas do Redator e de Publicações: a COR
 *    sempre escrita ("Laranja") e, quando o grupo tem nome próprio (o nome de um
 *    plano de Silo), o nome ao lado ("Laranja · Planos e contratação"). Nunca
 *    só a cor (sistema-visual §5.0.2).
 * 2. O RECORTE do MCP (`get_platform_state`, `list_platform_keywords`): o
 *    parâmetro `group` aceita a COR ("laranja", "Laranja"), "sem-grupo",
 *    "todos" e, por compatibilidade, o uuid de um grupo (o link de antes). A cor
 *    vira TODOS os grupos ativos daquela cor nesta marca (o mesmo recorte da
 *    tela, `resolveEditorialGroupScreenFilter`); cor sem grupo é recorte vazio,
 *    dito em palavras — nunca "tudo" por engano.
 */

export type EditorialGroupLabel = {
  groupId: string;
  color: EditorialGroupColor;
  /** O rótulo da cor ("Laranja"). */
  colorLabel: string;
  /** O nome gravado do grupo. */
  name: string;
  /** O nome próprio, quando não é só o rótulo da cor (ex.: o nome do plano do Silo). */
  customName: string | null;
  origin: "declared_plan" | "manual";
  /** "Laranja" ou "Laranja · Planos e contratação". */
  text: string;
};

export function editorialGroupLabelOf(group: Pick<EditorialGroupSummary, "id" | "color" | "name" | "origin">): EditorialGroupLabel {
  const colorLabel = EDITORIAL_GROUP_COLOR_LABELS[group.color];
  const name = group.name.replace(/\s+/g, " ").trim();
  const customName = name && editorialGroupNameKey(name) !== editorialGroupNameKey(colorLabel) ? name : null;
  return {
    groupId: group.id,
    color: group.color,
    colorLabel,
    name,
    customName,
    origin: group.origin === "declared_plan" ? "declared_plan" : "manual",
    text: customName ? `${colorLabel} · ${customName}` : colorLabel,
  };
}

/* ------------------------------ o recorte do MCP ------------------------------ */

export type EditorialGroupMcpScope =
  | { kind: "all" }
  | { kind: "none"; description: string }
  | { kind: "groups"; color: EditorialGroupColor; groupIds: string[]; groups: EditorialGroupLabel[]; description: string };

export type EditorialGroupMcpScopeResult =
  | { ok: true; scope: EditorialGroupMcpScope; filter: EditorialGroupScreenFilter }
  | { ok: false; code: "group_invalid" | "group_not_found"; message: string };

export const EDITORIAL_GROUP_MCP_INPUT_HINT = `a cor (${Object.values(EDITORIAL_GROUP_COLOR_LABELS).join(", ").toLocaleLowerCase("pt-BR")}), "sem-grupo" ou o id (uuid) de um grupo`;

/** "Sem grupo", "sem_grupo", "  Laranja " → a forma que o seletor lê. */
function normalizarEntrada(raw: string): string {
  return raw.normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toLocaleLowerCase("pt-BR").replace(/[\s_]+/g, "-");
}

/**
 * O parâmetro `group` do MCP → o recorte. `groups` são os grupos DESTA marca
 * (a lista do servidor): um uuid de outra marca não existe aqui.
 */
export function resolveEditorialGroupMcpScope(raw: string | null | undefined, groups: readonly Pick<EditorialGroupSummary, "id" | "color" | "name" | "origin" | "status">[]): EditorialGroupMcpScopeResult {
  const entrada = typeof raw === "string" ? normalizarEntrada(raw) : "";
  if (!entrada) return { ok: true, scope: { kind: "all" }, filter: { kind: "all" } };
  const escolha = parseEditorialGroupChoice(entrada);
  if (!escolha) return { ok: false, code: "group_invalid", message: `Grupo inválido: use ${EDITORIAL_GROUP_MCP_INPUT_HINT}.` };
  if (escolha === EDITORIAL_GROUP_CHOICE_ALL) return { ok: true, scope: { kind: "all" }, filter: { kind: "all" } };
  if (escolha === EDITORIAL_GROUP_URL_NONE) {
    return { ok: true, scope: { kind: "none", description: "Sem grupo: só o que não tem cor." }, filter: { kind: "none" } };
  }
  if (typeof escolha !== "string") {
    const grupo = groups.find(item => item.id === escolha.legacyGroupId);
    if (!grupo) return { ok: false, code: "group_not_found", message: "Esse grupo não existe nesta marca. Use a cor do grupo." };
    const rotulo = editorialGroupLabelOf(grupo);
    return {
      ok: true,
      scope: { kind: "groups", color: grupo.color, groupIds: [grupo.id], groups: [rotulo], description: `Grupo ${rotulo.text}${grupo.status === "archived" ? " (arquivado)" : ""}.` },
      filter: { kind: "groups", color: grupo.color, groupIds: [grupo.id] },
    };
  }
  const daCor = activeEditorialGroupsOfColor(groups, escolha);
  const rotulos = daCor.map(editorialGroupLabelOf);
  const ids = daCor.map(grupo => grupo.id).sort();
  const nomeDaCor = EDITORIAL_GROUP_COLOR_LABELS[escolha];
  const description = rotulos.length
    ? `Grupo ${rotulos.map(rotulo => rotulo.text).join(" e ")}.`
    : `A cor ${nomeDaCor} ainda não tem grupo nesta marca: nada nesta cor.`;
  return { ok: true, scope: { kind: "groups", color: escolha, groupIds: ids, groups: rotulos, description }, filter: { kind: "groups", color: escolha, groupIds: ids } };
}
