import { z } from "zod";

/**
 * ===== GRUPOS EDITORIAIS — DOMÍNIO PURO (F1) =====
 *
 * SDD `docs/compartilhado/sdd-plano-declarado-e-grupos-2026-10-12.md`, §5 e §9
 * (aprovada pelo dono em 2026-10-12). Um grupo é uma ETIQUETA de organização
 * (nome + cor da paleta) que nasce no Minerador e marca keywords. Princípio 3:
 * o grupo é organização, não significado — mudar nome, cor ou grupo de uma
 * keyword não muda hash de pacote aprovado, não rebaixa aprovação e não gera
 * versão. Por isso o grupo da keyword mora na COLUNA `group_id`, fora de
 * `analise_semantica`.
 *
 * Sem storage, sem fetch, sem React: rota, núcleo, tela e testes leem daqui.
 *
 * ==================== PONTOS DE EXTENSÃO (F2+) ====================
 *
 * - F2 (Arquiteto/Radar): `editorial_group_articles` e o mesmo
 *   `EditorialGroupFilter` lido pela mesa (`?grupo=` na URL).
 * - F4 (plano declarado): `origin = "declared_plan"`, `plan`, `planVersion`;
 *   `keywordGroupPlanAnchor` já recusa mover Assunto/principal com plano.
 * - F5 (guarda): o histórico do grupo lê `editorial_group_events`.
 */

/* ------------------------------- paleta -------------------------------- */

/** D4: as 5 cores do §9.3, sempre com nome. Os valores são aliases de tokens. */
export const EDITORIAL_GROUP_COLORS = ["amarelo", "azul", "verde", "lima", "laranja"] as const;
export type EditorialGroupColor = (typeof EDITORIAL_GROUP_COLORS)[number];

export const EDITORIAL_GROUP_COLOR_LABELS: Record<EditorialGroupColor, string> = {
  amarelo: "Amarelo",
  azul: "Azul",
  verde: "Verde",
  lima: "Lima",
  laranja: "Laranja",
};

/**
 * Classes literais por cor (o Tailwind só gera o que encontra escrito).
 *
 * `--group-<cor>` são aliases em `app/globals.css` (sistema-visual §5.0.2):
 * amarelo = pending, azul = context-accent, verde = positive-soft,
 * lima = highlight, laranja = warning. A cor marca a FAIXA (4 px) e a
 * bolinha; a etiqueta tem fundo suave e texto em `foreground`, com o nome
 * sempre escrito — nunca só a cor, nunca a linha inteira pintada (§8, §11).
 */
export const EDITORIAL_GROUP_COLOR_CLASSES: Record<EditorialGroupColor, { stripe: string; dot: string; chip: string }> = {
  amarelo: { stripe: "border-l-4 border-l-group-amarelo", dot: "bg-group-amarelo", chip: "border-group-amarelo/50 bg-group-amarelo-soft" },
  azul: { stripe: "border-l-4 border-l-group-azul", dot: "bg-group-azul", chip: "border-group-azul/50 bg-group-azul-soft" },
  verde: { stripe: "border-l-4 border-l-group-verde", dot: "bg-group-verde", chip: "border-group-verde/50 bg-group-verde-soft" },
  lima: { stripe: "border-l-4 border-l-group-lima", dot: "bg-group-lima", chip: "border-group-lima/50 bg-group-lima-soft" },
  laranja: { stripe: "border-l-4 border-l-group-laranja", dot: "bg-group-laranja", chip: "border-group-laranja/50 bg-group-laranja-soft" },
};

export const isEditorialGroupColor = (value: unknown): value is EditorialGroupColor =>
  typeof value === "string" && (EDITORIAL_GROUP_COLORS as readonly string[]).includes(value);

/* ------------------------------- contrato ------------------------------- */

export const EDITORIAL_GROUP_NAME_MAX = 80;
export const EDITORIAL_GROUP_ORIGINS = ["declared_plan", "manual"] as const;
export const EDITORIAL_GROUP_STATUSES = ["active", "archived"] as const;
export type EditorialGroupStatus = (typeof EDITORIAL_GROUP_STATUSES)[number];

/** Uma linha de `editorial_group_summary`, já em camelCase. */
export const EditorialGroupSummarySchema = z.object({
  id: z.string().uuid(),
  marcaId: z.string().uuid(),
  name: z.string().min(1).max(EDITORIAL_GROUP_NAME_MAX),
  color: z.enum(EDITORIAL_GROUP_COLORS),
  origin: z.enum(EDITORIAL_GROUP_ORIGINS),
  status: z.enum(EDITORIAL_GROUP_STATUSES),
  siloId: z.string().nullable(),
  planVersion: z.number().int().nonnegative(),
  lockVersion: z.number().int().positive(),
  updatedAt: z.string(),
  keywordCount: z.number().int().nonnegative(),
  articleCount: z.number().int().nonnegative(),
}).strict();
export type EditorialGroupSummary = z.infer<typeof EditorialGroupSummarySchema>;

/** PostgREST devolve `count(*)` como número ou texto (bigint): os dois valem. */
const contagem = (value: unknown) => {
  const numero = typeof value === "string" ? Number(value) : value;
  return typeof numero === "number" && Number.isInteger(numero) && numero >= 0 ? numero : 0;
};

/** Converte a linha crua da view; linha que não fecha o contrato é descartada (null). */
export function parseEditorialGroupSummaryRow(row: unknown): EditorialGroupSummary | null {
  if (!row || typeof row !== "object") return null;
  const r = row as Record<string, unknown>;
  const parsed = EditorialGroupSummarySchema.safeParse({
    id: r.id,
    marcaId: r.marca_id,
    name: r.name,
    color: r.color,
    origin: r.origin,
    status: r.status,
    siloId: typeof r.silo_id === "string" ? r.silo_id : null,
    planVersion: contagem(r.plan_version),
    lockVersion: typeof r.lock_version === "number" && r.lock_version > 0 ? r.lock_version : 1,
    updatedAt: typeof r.updated_at === "string" ? r.updated_at : "",
    keywordCount: contagem(r.keyword_count),
    articleCount: contagem(r.article_count),
  });
  return parsed.success ? parsed.data : null;
}

/** Nome do grupo: espaços colapsados, 1 a 80 caracteres. */
export function normalizeEditorialGroupName(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const nome = value.replace(/\s+/g, " ").trim();
  return nome.length >= 1 && nome.length <= EDITORIAL_GROUP_NAME_MAX ? nome : null;
}

/** A mesma chave do índice único do banco: `lower(btrim(name))` entre os ativos. */
export const editorialGroupNameKey = (name: string) => name.replace(/\s+/g, " ").trim().toLocaleLowerCase("pt-BR");

export type EditorialGroupRefusalCode =
  | "GROUP_NAME_INVALID"
  | "GROUP_COLOR_INVALID"
  | "GROUP_NAME_TAKEN"
  | "GROUP_NOT_FOUND"
  | "GROUP_ARCHIVED"
  | "GROUP_STALE"
  | "GROUP_NOTHING_TO_CHANGE";

export type EditorialGroupRefusal = { ok: false; code: EditorialGroupRefusalCode; message: string };

export const EDITORIAL_GROUP_REFUSAL_MESSAGES: Record<EditorialGroupRefusalCode, string> = {
  GROUP_NAME_INVALID: `O nome do grupo precisa ter de 1 a ${EDITORIAL_GROUP_NAME_MAX} caracteres.`,
  GROUP_COLOR_INVALID: `A cor precisa ser uma das cinco da paleta: ${EDITORIAL_GROUP_COLORS.map(cor => EDITORIAL_GROUP_COLOR_LABELS[cor]).join(", ")}.`,
  GROUP_NAME_TAKEN: "Já existe um grupo ativo com este nome nesta marca.",
  GROUP_NOT_FOUND: "Grupo não encontrado nesta marca.",
  GROUP_ARCHIVED: "O grupo está arquivado: reative-o antes de etiquetar keywords nele.",
  GROUP_STALE: "O grupo foi alterado em outra sessão. Recarregue e tente de novo.",
  GROUP_NOTHING_TO_CHANGE: "Nada a mudar no grupo.",
};

const recusa = (code: EditorialGroupRefusalCode): EditorialGroupRefusal => ({ ok: false, code, message: EDITORIAL_GROUP_REFUSAL_MESSAGES[code] });

/** Validação do grupo novo contra os grupos ATIVOS da mesma marca. */
export function validateNewEditorialGroup(
  input: { name: unknown; color: unknown },
  activeGroups: readonly { name: string }[],
): { ok: true; name: string; color: EditorialGroupColor } | EditorialGroupRefusal {
  const name = normalizeEditorialGroupName(input.name);
  if (!name) return recusa("GROUP_NAME_INVALID");
  if (!isEditorialGroupColor(input.color)) return recusa("GROUP_COLOR_INVALID");
  if (activeGroups.some(group => editorialGroupNameKey(group.name) === editorialGroupNameKey(name))) return recusa("GROUP_NAME_TAKEN");
  return { ok: true, name, color: input.color };
}

/**
 * O que um PATCH muda: renomear, recolorir, arquivar ou reativar.
 * Devolve o patch do banco e os eventos do histórico.
 */
export function planEditorialGroupUpdate(
  current: { name: string; color: EditorialGroupColor; status: EditorialGroupStatus },
  change: { name?: unknown; color?: unknown; status?: unknown },
  activeGroups: readonly { id: string; name: string }[],
  groupId: string,
):
  | { ok: true; patch: Partial<{ name: string; color: EditorialGroupColor; status: EditorialGroupStatus }>; events: Array<{ eventType: "renamed" | "recolored" | "archived" | "reactivated"; payload: Record<string, unknown> }> }
  | EditorialGroupRefusal {
  const patch: Partial<{ name: string; color: EditorialGroupColor; status: EditorialGroupStatus }> = {};
  const events: Array<{ eventType: "renamed" | "recolored" | "archived" | "reactivated"; payload: Record<string, unknown> }> = [];
  const statusFinal = change.status === undefined ? current.status : change.status;
  if (statusFinal !== "active" && statusFinal !== "archived") return recusa("GROUP_NOTHING_TO_CHANGE");
  if (change.name !== undefined) {
    const name = normalizeEditorialGroupName(change.name);
    if (!name) return recusa("GROUP_NAME_INVALID");
    if (name !== current.name) {
      patch.name = name;
      events.push({ eventType: "renamed", payload: { from: current.name, to: name } });
    }
  }
  if (change.color !== undefined) {
    if (!isEditorialGroupColor(change.color)) return recusa("GROUP_COLOR_INVALID");
    if (change.color !== current.color) {
      patch.color = change.color;
      events.push({ eventType: "recolored", payload: { from: current.color, to: change.color } });
    }
  }
  if (statusFinal !== current.status) {
    patch.status = statusFinal;
    events.push({ eventType: statusFinal === "archived" ? "archived" : "reactivated", payload: {} });
  }
  // Nome ativo único: vale para renomear um ativo e para reativar um arquivado.
  const nomeFinal = patch.name ?? current.name;
  if (statusFinal === "active" && (patch.name !== undefined || patch.status === "active")
      && activeGroups.some(group => group.id !== groupId && editorialGroupNameKey(group.name) === editorialGroupNameKey(nomeFinal))) {
    return recusa("GROUP_NAME_TAKEN");
  }
  if (!events.length) return recusa("GROUP_NOTHING_TO_CHANGE");
  return { ok: true, patch, events };
}

/* ------------------------- filtro (seletor e URL) ------------------------ */

/** "Todos os grupos" é a leitura de hoje; "Sem grupo" é `group_id IS NULL`. */
export type EditorialGroupFilter = { kind: "all" } | { kind: "none" } | { kind: "group"; groupId: string };

export const EDITORIAL_GROUP_URL_PARAM = "grupo";
export const EDITORIAL_GROUP_URL_NONE = "sem-grupo";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function parseEditorialGroupFilter(raw: string | null | undefined): EditorialGroupFilter {
  const valor = (raw || "").trim();
  if (valor === EDITORIAL_GROUP_URL_NONE) return { kind: "none" };
  if (UUID.test(valor)) return { kind: "group", groupId: valor.toLowerCase() };
  return { kind: "all" };
}

/** O valor de `?grupo=`; "Todos os grupos" tira o parâmetro da URL. */
export function serializeEditorialGroupFilter(filter: EditorialGroupFilter): string | null {
  if (filter.kind === "none") return EDITORIAL_GROUP_URL_NONE;
  if (filter.kind === "group") return filter.groupId;
  return null;
}

export const sameEditorialGroupFilter = (a: EditorialGroupFilter, b: EditorialGroupFilter) =>
  a.kind === b.kind && (a.kind !== "group" || a.groupId === (b as { groupId: string }).groupId);

/**
 * D12: o grupo ativo de verdade é o da URL; sem ele, o último usado nesta
 * marca (lembrança LOCAL, só conveniência); sem nenhum dos dois, ou se o
 * grupo não existe mais / está arquivado, "Todos os grupos". Uma lembrança
 * nunca decide sozinha uma leitura que esconderia keywords de um grupo que
 * sumiu.
 */
export function resolveEditorialGroupFilter(input: {
  fromUrl: string | null | undefined;
  remembered: string | null | undefined;
  groups: readonly Pick<EditorialGroupSummary, "id" | "status">[];
}): { filter: EditorialGroupFilter; source: "url" | "remembered" | "default" } {
  const valido = (filter: EditorialGroupFilter) =>
    filter.kind !== "group" || input.groups.some(group => group.id === filter.groupId && group.status === "active");
  const daUrl = parseEditorialGroupFilter(input.fromUrl);
  if ((input.fromUrl || "").trim() && daUrl.kind !== "all" && valido(daUrl)) return { filter: daUrl, source: "url" };
  if ((input.fromUrl || "").trim() && daUrl.kind === "all" && input.fromUrl?.trim() === "todos") return { filter: daUrl, source: "url" };
  const lembrado = parseEditorialGroupFilter(input.remembered);
  if ((input.remembered || "").trim() && lembrado.kind !== "all" && valido(lembrado)) return { filter: lembrado, source: "remembered" };
  return { filter: { kind: "all" }, source: "default" };
}

/**
 * 2026-10-12 · CORES FIXAS (adendo do §9.1): na TELA, uma cor escolhida no
 * seletor vira o recorte de TODOS os grupos ATIVOS daquela cor (`groups`). Daqui
 * em diante há um grupo por cor por marca (`ensureEditorialGroupForColor`), mas
 * um legado com duas etiquetas da mesma cor continua aparecendo inteiro.
 * `color: null` com `groupIds: []` = "ainda decidindo" (não mostra nada).
 * Só cliente: as rotas de leitura continuam com `EditorialGroupFilter`.
 */
export type EditorialGroupScreenFilter =
  | EditorialGroupFilter
  | { kind: "groups"; color: EditorialGroupColor | null; groupIds: readonly string[] };

/** A linha pertence ao recorte ativo? */
export function editorialGroupFilterMatches(filter: EditorialGroupScreenFilter, groupId: string | null | undefined): boolean {
  if (filter.kind === "all") return true;
  if (filter.kind === "none") return !groupId;
  if (filter.kind === "groups") return Boolean(groupId) && filter.groupIds.includes(groupId as string);
  return groupId === filter.groupId;
}

/* ------------------- cores fixas: escolha por área (D12) ------------------- */

/**
 * As áreas que mostram a etiqueta de grupo na topbar global. Cada uma lembra a
 * SUA escolha (pedido do dono, 2026-10-12: "tem que funcionar de forma
 * independente em cada área"). F6 (2026-10-12): o Redator e Publicações
 * entram — o documento e a publicação herdam o grupo pelo artigo, só leitura.
 */
export const EDITORIAL_GROUP_AREAS = ["minerador", "arquiteto", "radar", "redator", "publicacoes"] as const;
export type EditorialGroupArea = (typeof EDITORIAL_GROUP_AREAS)[number];
export const isEditorialGroupArea = (value: unknown): value is EditorialGroupArea =>
  typeof value === "string" && (EDITORIAL_GROUP_AREAS as readonly string[]).includes(value);

/** A escolha do seletor: uma das 5 cores, "todos" (padrão, cinza) ou "sem-grupo". */
export type EditorialGroupChoice = "todos" | typeof EDITORIAL_GROUP_URL_NONE | EditorialGroupColor;
export const EDITORIAL_GROUP_CHOICE_ALL = "todos" as const;

/**
 * Lê `?grupo=` (ou a lembrança): a cor, "todos", "sem-grupo" ou, por
 * compatibilidade com os links de antes, o uuid de um grupo (`legacyGroupId`,
 * resolvido pela cor quando a lista de grupos chega). Vazio ou inválido = null.
 */
export function parseEditorialGroupChoice(raw: string | null | undefined): EditorialGroupChoice | { legacyGroupId: string } | null {
  const valor = (raw || "").trim().toLowerCase();
  if (!valor) return null;
  if (valor === EDITORIAL_GROUP_CHOICE_ALL) return EDITORIAL_GROUP_CHOICE_ALL;
  if (valor === EDITORIAL_GROUP_URL_NONE) return EDITORIAL_GROUP_URL_NONE;
  if (isEditorialGroupColor(valor)) return valor;
  if (UUID.test(valor)) return { legacyGroupId: valor };
  return null;
}

/** O uuid antigo vira a cor do grupo (ativo); grupo sumido ou arquivado = "todos" (D12). */
export function editorialGroupChoiceFromLegacyId(groupId: string, groups: readonly Pick<EditorialGroupSummary, "id" | "color" | "status">[]): EditorialGroupChoice {
  const grupo = groups.find(group => group.id === groupId.toLowerCase() && group.status === "active");
  return grupo ? grupo.color : EDITORIAL_GROUP_CHOICE_ALL;
}

/** O valor de `?grupo=` para a escolha; "todos" tira o parâmetro. */
export const serializeEditorialGroupChoice = (choice: EditorialGroupChoice): string | null =>
  choice === EDITORIAL_GROUP_CHOICE_ALL ? null : choice;

/** Os grupos ATIVOS de uma cor, o mais antigo primeiro quando a data existe. */
export function activeEditorialGroupsOfColor<T extends Pick<EditorialGroupSummary, "color" | "status">>(groups: readonly T[], color: EditorialGroupColor): T[] {
  return groups.filter(group => group.color === color && group.status === "active");
}

/**
 * O recorte de TELA da escolha. `groups: null` = a lista de grupos desta
 * marca ainda não chegou (nem do cache): uma cor ainda não sabe quais ids
 * mostrar (`pending`), mas "todos" e "sem-grupo" já sabem — e por isso nunca
 * esperam a leitura dos grupos.
 */
export function resolveEditorialGroupScreenFilter(
  choice: EditorialGroupChoice,
  groups: readonly Pick<EditorialGroupSummary, "id" | "color" | "status">[] | null,
): { pending: true; filter: EditorialGroupScreenFilter } | { pending: false; filter: EditorialGroupScreenFilter } {
  if (choice === EDITORIAL_GROUP_CHOICE_ALL) return { pending: false, filter: { kind: "all" } };
  if (choice === EDITORIAL_GROUP_URL_NONE) return { pending: false, filter: { kind: "none" } };
  if (!groups) return { pending: true, filter: { kind: "groups", color: choice, groupIds: [] } };
  return { pending: false, filter: { kind: "groups", color: choice, groupIds: activeEditorialGroupsOfColor(groups, choice).map(group => group.id).sort() } };
}

/** Chave estável do recorte (entra na chave da carga do Minerador). */
export function editorialGroupScreenFilterKey(filter: EditorialGroupScreenFilter): string {
  if (filter.kind === "all") return "todos";
  if (filter.kind === "none") return EDITORIAL_GROUP_URL_NONE;
  if (filter.kind === "group") return filter.groupId;
  return `${filter.color ?? "pendente"}:${[...filter.groupIds].sort().join(",")}`;
}

/** Depois de mover para `targetColor` (null = tirar do grupo), a linha continua na visão? */
export function editorialGroupChoiceKeeps(choice: EditorialGroupChoice, targetColor: EditorialGroupColor | null): boolean {
  if (choice === EDITORIAL_GROUP_CHOICE_ALL) return true;
  if (choice === EDITORIAL_GROUP_URL_NONE) return targetColor === null;
  return targetColor === choice;
}

/** Texto do botão (tooltip e `aria-label`): a cor nunca aparece sozinha (§5.0.2). */
export function editorialGroupChoiceLabel(choice: EditorialGroupChoice): string {
  if (choice === EDITORIAL_GROUP_CHOICE_ALL) return "Todos os grupos";
  if (choice === EDITORIAL_GROUP_URL_NONE) return "Sem grupo";
  return `Grupo: ${EDITORIAL_GROUP_COLOR_LABELS[choice]}`;
}

/**
 * O nome próprio do grupo da cor, quando ele não é só o rótulo da cor (ex.: o
 * nome de um plano de Silo). Mostrado discretamente ao lado da cor.
 */
export function editorialGroupCustomName(color: EditorialGroupColor, groups: readonly Pick<EditorialGroupSummary, "color" | "status" | "name">[]): string | null {
  const nomes = [...new Set(activeEditorialGroupsOfColor(groups, color).map(group => group.name.replace(/\s+/g, " ").trim()))]
    .filter(nome => editorialGroupNameKey(nome) !== editorialGroupNameKey(EDITORIAL_GROUP_COLOR_LABELS[color]));
  return nomes.length ? nomes.join(" · ") : null;
}

/**
 * O nome do grupo novo de uma cor: o rótulo da cor ("Laranja"); se outro grupo
 * ATIVO já usa esse nome (em outra cor), "Laranja 2", "Laranja 3"…
 */
export function editorialGroupNameForColor(color: EditorialGroupColor, activeGroups: readonly { name: string }[]): string {
  const usados = new Set(activeGroups.map(group => editorialGroupNameKey(group.name)));
  const base = EDITORIAL_GROUP_COLOR_LABELS[color];
  if (!usados.has(editorialGroupNameKey(base))) return base;
  for (let n = 2; n < 1000; n += 1) {
    const nome = `${base} ${n}`;
    if (!usados.has(editorialGroupNameKey(nome))) return nome;
  }
  return `${base} ${Date.now()}`;
}

/**
 * Quem pode GARANTIR o grupo de uma cor (mover/etiquetar por cor): quem edita
 * no Minerador (keywords), no Arquiteto ou no Radar (artigos), ou o admin global.
 */
export const EDITORIAL_GROUP_COLOR_ENSURERS = ["minerador", "arquiteto", "radar"] as const;
export const canEnsureEditorialGroupColor = (context: { isGlobalAdmin?: boolean; permissions: readonly string[] }) =>
  Boolean(context.isGlobalAdmin) || EDITORIAL_GROUP_COLOR_ENSURERS.some(module => context.permissions.includes(`${module}:edit`));

/** Lembrança local da escolha, por marca E por área. Nunca é fonte de verdade. */
export const editorialGroupAreaStorageKey = (brandId: string, area: EditorialGroupArea) => `minerador-key:grupo-ativo:${brandId}:${area}`;

/** Cache de APRESENTAÇÃO da lista de grupos da marca (id, cor, nome, status). */
export const editorialGroupsCacheStorageKey = (brandId: string) => `minerador-key:grupos:${brandId}`;

export type EditorialGroupCacheEntry = Pick<EditorialGroupSummary, "id" | "color" | "name" | "status">;

/** Lê o cache local; qualquer coisa fora do contrato é descartada (nunca lança). */
export function parseEditorialGroupsCache(raw: string | null | undefined): EditorialGroupCacheEntry[] | null {
  if (!raw) return null;
  try {
    const lido = JSON.parse(raw) as unknown;
    if (!Array.isArray(lido)) return null;
    const saida: EditorialGroupCacheEntry[] = [];
    for (const item of lido) {
      if (!item || typeof item !== "object") continue;
      const r = item as Record<string, unknown>;
      if (typeof r.id !== "string" || !UUID.test(r.id) || !isEditorialGroupColor(r.color) || typeof r.name !== "string" || !r.name.trim()) continue;
      if (r.status !== "active" && r.status !== "archived") continue;
      saida.push({ id: r.id.toLowerCase(), color: r.color, name: r.name, status: r.status });
    }
    return saida;
  } catch {
    return null;
  }
}

export const serializeEditorialGroupsCache = (groups: readonly EditorialGroupCacheEntry[]) =>
  JSON.stringify(groups.map(group => ({ id: group.id, color: group.color, name: group.name, status: group.status })));

/**
 * Chave da lembrança local por marca (D12). Nunca é fonte de verdade.
 * Até 2026-10-12 as três áreas dividiam esta chave; desde as cores fixas cada
 * área lembra a sua (`editorialGroupAreaStorageKey`). A chave antiga não é
 * mais lida nem limpa.
 */
export const editorialGroupLastUsedStorageKey = (brandId: string) => `minerador-key:grupo-ativo:${brandId}`;

/* ----------------------- implantação sem a migration ---------------------- */

export const GROUPS_NOT_AVAILABLE = "GROUPS_NOT_AVAILABLE" as const;

/**
 * As tabelas/coluna de grupo ainda não existem no banco (M1 não aplicada)?
 *
 * 42P01 tabela inexistente · 42703 coluna inexistente · PGRST205 tabela fora
 * do cache do PostgREST · PGRST204 coluna fora do cache (escrita). Mesmo
 * padrão do recuo da view de listagem do Minerador.
 */
export function isEditorialGroupsSchemaMissing(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const { code, message } = error as { code?: unknown; message?: unknown };
  const codigo = typeof code === "string" ? code : "";
  const texto = typeof message === "string" ? message : "";
  if (codigo === "42P01" || codigo === "PGRST205") return /editorial_group|group_id/.test(texto) || !texto;
  if (codigo === "42703" || codigo === "PGRST204") return /group_id|editorial_group/.test(texto);
  return /editorial_group(s|_summary|_events|_articles)?/.test(texto) && /does not exist|not find|schema cache/i.test(texto);
}

/* ------------------------ etiqueta das keywords ------------------------ */

export const KEYWORD_GROUP_ASSIGN_MAX = 2000;

export type KeywordGroupRow = {
  id: string;
  brand_id: string | null;
  group_id: string | null;
  deleted_at: string | null;
  keyword?: string | null;
  /** `analise_semantica -> keyword_subject -> plan` (F4). */
  subject_plan?: unknown;
  /** `analise_semantica -> keyword_declared_principal` (F4). */
  declared_principal?: unknown;
};

export type KeywordGroupRefusalCode = "KEYWORD_NOT_FOUND" | "KEYWORD_PLAN_ANCHORED";

export const KEYWORD_GROUP_REFUSAL_MESSAGES: Record<KeywordGroupRefusalCode, string> = {
  KEYWORD_NOT_FOUND: "Keyword não encontrada nesta marca (ou está na lixeira).",
  KEYWORD_PLAN_ANCHORED: "Assunto ou principal de um plano declarado: tire do plano no Minerador antes de mudar o grupo.",
};

/**
 * PONTO DE EXTENSÃO F4: Assunto com `keyword_subject.plan` ou principal com
 * `keyword_declared_principal` está presa ao grupo do plano (SDD §6.1, item 5).
 * Na F1 nenhuma linha tem plano; a regra já vale para quando tiver.
 */
export function keywordGroupPlanAnchor(row: Pick<KeywordGroupRow, "subject_plan" | "declared_principal">): boolean {
  const presente = (value: unknown) => value !== null && value !== undefined && typeof value === "object";
  return presente(row.subject_plan) || presente(row.declared_principal);
}

/**
 * O que mover. Isolamento por marca: id que não veio da marca da rota é
 * recusado como "não encontrado" (não se diz se existe noutra marca).
 */
export function planKeywordGroupAssignment(input: {
  brandId: string;
  keywordIds: readonly string[];
  targetGroupId: string | null;
  rows: readonly KeywordGroupRow[];
}): {
  toMove: Array<{ id: string; fromGroupId: string | null }>;
  unchanged: string[];
  refused: Array<{ id: string; code: KeywordGroupRefusalCode; message: string }>;
} {
  const porId = new Map(input.rows.map(row => [row.id, row]));
  const toMove: Array<{ id: string; fromGroupId: string | null }> = [];
  const unchanged: string[] = [];
  const refused: Array<{ id: string; code: KeywordGroupRefusalCode; message: string }> = [];
  for (const id of [...new Set(input.keywordIds)]) {
    const row = porId.get(id);
    if (!row || row.brand_id !== input.brandId || row.deleted_at) {
      refused.push({ id, code: "KEYWORD_NOT_FOUND", message: KEYWORD_GROUP_REFUSAL_MESSAGES.KEYWORD_NOT_FOUND });
      continue;
    }
    const atual = row.group_id || null;
    if (atual === input.targetGroupId) {
      unchanged.push(id);
      continue;
    }
    if (keywordGroupPlanAnchor(row)) {
      refused.push({ id, code: "KEYWORD_PLAN_ANCHORED", message: KEYWORD_GROUP_REFUSAL_MESSAGES.KEYWORD_PLAN_ANCHORED });
      continue;
    }
    toMove.push({ id, fromGroupId: atual });
  }
  return { toMove, unchanged, refused };
}

/** Contagem de keywords por grupo para o seletor. */
export function editorialGroupCountLabel(group: Pick<EditorialGroupSummary, "keywordCount" | "articleCount">): string {
  const keywords = `${group.keywordCount} keyword${group.keywordCount === 1 ? "" : "s"}`;
  return group.articleCount > 0 ? `${keywords} · ${group.articleCount} artigo${group.articleCount === 1 ? "" : "s"}` : keywords;
}
