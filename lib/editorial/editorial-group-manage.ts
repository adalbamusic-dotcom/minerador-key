import {
  EDITORIAL_GROUP_COLOR_LABELS,
  editorialGroupNameForColor,
  editorialGroupNameKey,
  isEditorialGroupColor,
  normalizeEditorialGroupName,
  type EditorialGroupColor,
  type EditorialGroupStatus,
  type EditorialGroupSummary,
} from "./editorial-groups.ts";

/**
 * ===== GERENCIAR A COR — DOMÍNIO PURO (2026-10-12, adendo §9.1-A da SDD) =====
 *
 * SDD `docs/compartilhado/sdd-plano-declarado-e-grupos-2026-10-12.md`. Desde as
 * cores fixas, cada cor da paleta É o grupo (um grupo ativo por cor por marca).
 * "Gerenciar" é o menu de UMA cor que já tem grupo, com três atos:
 *
 *   1. **Nome (opcional)** — rótulo livre (ex.: o nome do Silo). Vazio volta ao
 *      nome da cor ("Laranja"; "Laranja 2" se outro grupo ativo já usa).
 *   2. **Trocar a cor** — só para uma cor LIVRE (sem grupo ativo). Cor ocupada é
 *      recusa explicada: trocar para ela juntaria dois grupos, e isso nunca é
 *      feito (nenhuma fusão silenciosa).
 *   3. **Liberar a cor** (arquivar) — só quando o grupo não tem keywords (nem na
 *      lixeira), nem artigos etiquetados, nem plano declarado, nem Silo ligado.
 *      Senão, recusa dizendo quantos itens tem. Arquivar não apaga nada; o
 *      histórico fica.
 *
 * O grupo é organização, não significado (princípio 3): nada aqui mexe em hash
 * de pacote, aprovação ou versão. Quem grava é `editorial-group-manage-store.ts`,
 * pelo `updateEditorialGroup` de sempre (trava otimista, releitura, evento).
 *
 * Sem storage, sem fetch, sem React.
 */

export type EditorialGroupManageRefusalCode =
  | "GROUP_NOT_FOUND"
  | "GROUP_STALE"
  | "GROUP_ARCHIVED"
  | "GROUP_NAME_INVALID"
  | "GROUP_NAME_TAKEN"
  | "GROUP_COLOR_INVALID"
  | "GROUP_COLOR_TAKEN"
  | "GROUP_NOT_EMPTY"
  | "GROUP_MANAGE_CONFLICT"
  | "GROUP_NOTHING_TO_CHANGE";

export type EditorialGroupManageRefusal = { ok: false; code: EditorialGroupManageRefusalCode; message: string };

/** O que o dono pediu no "Gerenciar". `name: null` (ou vazio) = voltar ao nome da cor. */
export type EditorialGroupManageRequest = {
  name?: string | null;
  color?: unknown;
  /** Liberar a cor (arquivar o grupo). Não se mistura com nome nem cor. */
  release?: boolean;
};

/** O que o grupo ainda carrega — decide se a cor pode ser liberada. */
export type EditorialGroupOccupancy = {
  keywordCount: number;
  /** Keywords na lixeira com este grupo: restauráveis, então também prendem a cor. */
  trashedKeywordCount: number;
  articleCount: number;
  hasPlan: boolean;
  planVersion: number;
  siloId: string | null;
};

export type EditorialGroupManageChange = { name?: string; color?: EditorialGroupColor; status?: EditorialGroupStatus };

export type EditorialGroupManagePlan =
  | { ok: true; action: "edit" | "release"; change: EditorialGroupManageChange; summary: string[] }
  | EditorialGroupManageRefusal;

const recusa = (code: EditorialGroupManageRefusalCode, message: string): EditorialGroupManageRefusal => ({ ok: false, code, message });

const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;

/**
 * O nome é só o rótulo da cor ("Laranja", "Laranja 2")? Então ele acompanha a
 * cor quando a cor troca — senão o grupo azul continuaria chamado "Laranja".
 */
export function isColorDefaultGroupName(name: string, color: EditorialGroupColor): boolean {
  const base = editorialGroupNameKey(EDITORIAL_GROUP_COLOR_LABELS[color]);
  const chave = editorialGroupNameKey(name);
  return chave === base || new RegExp(`^${base} \\d+$`).test(chave);
}

/** Por que a cor não pode ser liberada (vazio = pode). */
export function editorialGroupReleaseBlockers(occupancy: EditorialGroupOccupancy): string[] {
  const motivos: string[] = [];
  if (occupancy.keywordCount > 0) motivos.push(plural(occupancy.keywordCount, "keyword", "keywords"));
  if (occupancy.trashedKeywordCount > 0) motivos.push(`${plural(occupancy.trashedKeywordCount, "keyword", "keywords")} na lixeira (restauráveis)`);
  if (occupancy.articleCount > 0) motivos.push(plural(occupancy.articleCount, "artigo etiquetado", "artigos etiquetados"));
  if (occupancy.hasPlan) motivos.push(`plano declarado do Silo (v${occupancy.planVersion})`);
  if (occupancy.siloId) motivos.push("Silo consolidado ligado ao grupo");
  return motivos;
}

/**
 * Decide o que um pedido de "Gerenciar" muda. Recusa sem gravar nada quando:
 * o grupo já está liberado; a cor de destino tem outro grupo ativo; o nome é
 * inválido ou de outro grupo ativo; liberar com itens; ou nada muda.
 */
export function planEditorialGroupManage(input: {
  group: Pick<EditorialGroupSummary, "id" | "name" | "color" | "status">;
  request: EditorialGroupManageRequest;
  /** Os grupos ATIVOS da marca (inclui o próprio). */
  activeGroups: readonly Pick<EditorialGroupSummary, "id" | "name" | "color" | "status" | "keywordCount">[];
  /** Obrigatório para liberar. */
  occupancy?: EditorialGroupOccupancy | null;
}): EditorialGroupManagePlan {
  const { group, request } = input;
  const corAtual = EDITORIAL_GROUP_COLOR_LABELS[group.color];
  if (group.status !== "active") return recusa("GROUP_ARCHIVED", `A cor ${corAtual} já foi liberada (grupo arquivado). Ela volta a ter grupo quando você mover algo para ela.`);
  const outros = input.activeGroups.filter(item => item.id !== group.id && item.status === "active");

  if (request.release) {
    if (request.name !== undefined || request.color !== undefined) return recusa("GROUP_MANAGE_CONFLICT", "Liberar a cor não se mistura com renomear ou trocar a cor: faça um de cada vez.");
    if (!input.occupancy) return recusa("GROUP_STALE", "Não foi possível conferir o que o grupo ainda tem. Recarregue e tente de novo.");
    const motivos = editorialGroupReleaseBlockers(input.occupancy);
    if (motivos.length) {
      return recusa("GROUP_NOT_EMPTY", `A cor ${corAtual} não pode ser liberada: o grupo “${group.name}” tem ${motivos.join(", ")}. Mova as keywords e os artigos para outra cor (ou “Tirar do grupo”)${input.occupancy.hasPlan ? " e tire os artigos do plano" : ""} antes. Nada foi apagado.`);
    }
    return { ok: true, action: "release", change: { status: "archived" }, summary: [`A cor ${corAtual} fica livre; o grupo “${group.name}” é arquivado (o histórico continua).`] };
  }

  let corFinal: EditorialGroupColor = group.color;
  if (request.color !== undefined && request.color !== group.color) {
    if (!isEditorialGroupColor(request.color)) return recusa("GROUP_COLOR_INVALID", "A cor precisa ser uma das cinco da paleta.");
    const ocupante = outros.find(item => item.color === request.color);
    if (ocupante) {
      const destino = EDITORIAL_GROUP_COLOR_LABELS[request.color];
      const nomeOcupante = editorialGroupNameKey(ocupante.name) === editorialGroupNameKey(destino) ? "" : ` (“${ocupante.name}”)`;
      return recusa("GROUP_COLOR_TAKEN", `A cor ${destino} já tem um grupo ativo${nomeOcupante}, com ${plural(ocupante.keywordCount, "keyword", "keywords")}. Trocar para ela juntaria dois grupos — isso nunca é feito. Escolha uma cor livre, ou libere a cor ${destino} antes.`);
    }
    corFinal = request.color;
  }

  let nomeFinal = group.name;
  const nomeLivre = (nome: string) => !outros.some(item => editorialGroupNameKey(item.name) === editorialGroupNameKey(nome));
  if (request.name === null || (typeof request.name === "string" && !request.name.trim())) {
    // Sem nome próprio: o grupo se chama como a cor.
    nomeFinal = isColorDefaultGroupName(group.name, corFinal) && nomeLivre(group.name) ? group.name : editorialGroupNameForColor(corFinal, outros);
  } else if (typeof request.name === "string") {
    const normalizado = normalizeEditorialGroupName(request.name);
    if (!normalizado) return recusa("GROUP_NAME_INVALID", "O nome do grupo precisa ter de 1 a 80 caracteres (ou fique vazio para usar o nome da cor).");
    nomeFinal = normalizado;
  } else if (corFinal !== group.color && isColorDefaultGroupName(group.name, group.color)) {
    // O nome era só o rótulo da cor antiga: acompanha a cor nova.
    nomeFinal = editorialGroupNameForColor(corFinal, outros);
  }
  if (nomeFinal !== group.name && !nomeLivre(nomeFinal)) return recusa("GROUP_NAME_TAKEN", `Já existe outro grupo ativo chamado “${nomeFinal}” nesta marca.`);

  const change: EditorialGroupManageChange = {};
  const summary: string[] = [];
  if (nomeFinal !== group.name) {
    change.name = nomeFinal;
    summary.push(`Nome: “${group.name}” → “${nomeFinal}”.`);
  }
  if (corFinal !== group.color) {
    change.color = corFinal;
    summary.push(`Cor: ${corAtual} → ${EDITORIAL_GROUP_COLOR_LABELS[corFinal]} (as keywords e os artigos do grupo vão junto; a cor ${corAtual} fica livre).`);
  }
  if (!summary.length) return recusa("GROUP_NOTHING_TO_CHANGE", "Nada a mudar no grupo.");
  return { ok: true, action: "edit", change, summary };
}

/** Status HTTP de cada recusa (a rota responde com o motivo, sem gravar). */
export const EDITORIAL_GROUP_MANAGE_REFUSAL_STATUS: Record<EditorialGroupManageRefusalCode, number> = {
  GROUP_NOT_FOUND: 404,
  GROUP_STALE: 409,
  GROUP_ARCHIVED: 409,
  GROUP_NAME_INVALID: 400,
  GROUP_NAME_TAKEN: 409,
  GROUP_COLOR_INVALID: 400,
  GROUP_COLOR_TAKEN: 409,
  GROUP_NOT_EMPTY: 409,
  GROUP_MANAGE_CONFLICT: 400,
  GROUP_NOTHING_TO_CHANGE: 400,
};
