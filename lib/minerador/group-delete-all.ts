import { EDITORIAL_GROUP_COLOR_LABELS, type EditorialGroupArea, type EditorialGroupColor } from "../editorial/editorial-groups.ts";
import { normalizeTypedConfirmation } from "../lifecycle/typed-confirmation.ts";
import type { DeclaredArticlePlan, DeclaredPrincipalMark } from "./declared-plan.ts";
import type { KeywordSubjectReleaseVia } from "./keyword-subject.ts";

/**
 * ===== EXCLUIR TUDO DA COR X — DOMÍNIO PURO (F7, 2026-10-14) =====
 *
 * SDD `docs/compartilhado/sdd-arquiteto-so-le-e-listas-leves-2026-10-13.md`,
 * item 6 (§10.2), decisões D6, D7 e D8. Pedido do dono (2026-10-13): "se quero
 * apagar toda a lista de uma tag tem que ter essa opção", "de acordo aos
 * contratos que já temos a nível global".
 *
 * Nada novo de poder de exclusão: só o Minerador executa (D8), pelo ciclo de
 * vida de sempre — não publicada = DELETE definitivo; publicada = lixeira de
 * 24 h só com a marcação "Incluir publicadas na lixeira de 24 h" e o nome de
 * cada uma digitado (D6); descendente no Redator bloqueia. O Assunto é
 * liberado com `keyword_subject_release.via = "excluir_cor"` DENTRO da mesma
 * transação da exclusão (RPC `lifecycle_delete_group_keywords`, migration M-E).
 *
 * Este módulo monta a PRÉVIA (o que entra, o que fica fora e por quê, os
 * Assuntos liberados, o plano depois, se a cor fica livre, as outras áreas),
 * os BLOCOS de até 100 (o limite da rota; cada bloco tudo-ou-nada), confere a
 * CONFIRMAÇÃO FORTE (nome da cor digitado e "apaga de vez" quando há DELETE) e
 * monta o registro do histórico do grupo. Não lê banco, não grava, não chama
 * provider: o núcleo (`group-delete-all-core.ts`) lê, chama isto, executa e relê.
 *
 * Regras de recusa POR ITEM (a keyword fica fora, com o motivo e o caminho):
 *   - documento no Redator (o ciclo de vida recusa: `blocked`);
 *   - referenciada pelo ArticleDNA VIGENTE de um artigo do Arquiteto que não foi
 *     retirado (o Arquiteto não exclui keyword, F4: antes, "Retirar artigo do
 *     Silo" no Arquiteto ou "Tirar do plano");
 *   - publicada sem a marcação (D6);
 *   - Assunto do plano de OUTRA cor, ou principal declarada de Assunto de outra cor;
 *   - o artigo do plano sai INTEIRO ou fica inteiro: Assunto e principal
 *     declarada andam juntos (nunca sobra marca de principal apontando para um
 *     Assunto apagado).
 */

export const GROUP_DELETE_ALL_ACTION_LABEL = "Excluir tudo da cor" as const;
/** O limite das rotas de exclusão (e da RPC): cada bloco é tudo-ou-nada. */
export const GROUP_DELETE_ALL_BLOCK_SIZE = 100;
/** O segundo texto da confirmação forte, quando há exclusão definitiva. */
export const GROUP_DELETE_ALL_HARD_PHRASE = "apaga de vez" as const;
/** O marcador que a RPC grava ao liberar o Assunto (reservado em 20261015120000). */
export const GROUP_DELETE_ALL_RELEASE_VIA: KeywordSubjectReleaseVia = "excluir_cor";
export const GROUP_DELETE_ALL_RPC = "lifecycle_delete_group_keywords" as const;
export const GROUP_DELETE_ALL_CONTRACT_RPC = "lifecycle_delete_group_keywords_contract" as const;
export const GROUP_DELETE_ALL_MIGRATION = "20261016130000_excluir_tudo_da_cor" as const;
export const GROUP_DELETE_ALL_ROUTE = "/api/minerador/marcas/[brandId]/keywords/delete-group" as const;
/** `?excluir_tudo_da_cor=<cor>` no Minerador abre o diálogo (o link das outras áreas). */
export const GROUP_DELETE_ALL_URL_PARAM = "excluir_tudo_da_cor" as const;
/** Evento da janela depois da execução relida: a planilha do Minerador tira as linhas que saíram. */
export const GROUP_DELETE_ALL_DONE_EVENT = "minerador:excluir-tudo-da-cor" as const;
export type GroupDeleteAllDoneDetail = { brandId: string; groupId: string; hardDeletedIds: string[]; recoverableIds: string[] };

export const GROUP_DELETE_ALL_NOT_AVAILABLE_MESSAGE =
  `“${GROUP_DELETE_ALL_ACTION_LABEL}” ainda não está disponível neste banco: a migration ${GROUP_DELETE_ALL_MIGRATION} não foi aplicada. Nada pode ser excluído por aqui; a prévia continua valendo, e a exclusão comum (selecionar → Excluir) segue como sempre.`;

/* ---------------------------------------------------------------- áreas */

export const GROUP_DELETE_ALL_AREA_LABELS: Record<EditorialGroupArea, string> = {
  minerador: "Minerador",
  arquiteto: "Arquiteto",
  radar: "Radar",
  redator: "Redator",
  publicacoes: "Publicações",
};

/** D8: só o Minerador executa nesta SDD; as outras áreas ficam fora, com o motivo. */
export const GROUP_DELETE_ALL_AREA_REASONS: Record<EditorialGroupArea, string | null> = {
  minerador: null,
  arquiteto: "O Arquiteto não exclui keyword (F4): ArticleDNA, SiloDNA e SiloPage ficam como histórico. Para um artigo sair do Silo, use “Retirar artigo do Silo” no Arquiteto.",
  radar: "Sem contrato de exclusão no Radar (D8 da SDD): os itens da cor continuam.",
  redator: "Sem contrato de exclusão no Redator (D8 da SDD): os documentos da cor continuam.",
  publicacoes: "Sem contrato de exclusão em Publicações (D8 da SDD): os registros continuam; URL, slug e canonical ficam protegidos.",
};

export type GroupDeleteAllAreaItem = { id: string; label: string };
export type GroupDeleteAllAreaView = {
  area: EditorialGroupArea;
  label: string;
  executable: boolean;
  reason: string | null;
  items: GroupDeleteAllAreaItem[];
};

/* --------------------------------------------------------------- entrada */

export type GroupDeleteAllLifecycleMode = "hard" | "recoverable" | "blocked" | "unknown";

/** Uma keyword VIVA da cor, lida em colunas estreitas (o Assunto e a marca por caminho JSON). */
export type GroupDeleteAllKeyword = {
  id: string;
  keyword: string;
  status: string | null;
  /** `keyword_subject.declared === true`. */
  subjectDeclared: boolean;
  /** `keyword_subject.plan` (lido pelo contrato do plano). */
  plan: DeclaredArticlePlan | null;
  /** `keyword_subject.entry.title` (o título cadastrado). */
  entryTitle: string | null;
  /** `keyword_declared_principal` (a marca recíproca da principal do formato anterior). */
  principalMark: DeclaredPrincipalMark | null;
  /** O impacto do ciclo de vida de sempre (`lifecycle_preview_minerador_keywords`). */
  lifecycle: GroupDeleteAllLifecycleMode;
  /** Artigos do Arquiteto cujo ArticleDNA VIGENTE (não retirado) cita a keyword. */
  architectRefs: Array<{ articleId: string; label: string | null }>;
};

export type GroupDeleteAllGroup = {
  id: string;
  name: string;
  color: EditorialGroupColor;
  planVersion: number;
  lockVersion: number;
  siloId: string | null;
  /** `editorial_groups.plan` não nulo. */
  hasPlan: boolean;
};

export type GroupDeleteAllInput = {
  group: GroupDeleteAllGroup;
  keywords: readonly GroupDeleteAllKeyword[];
  /** Keywords desta cor já na lixeira (restauráveis): prendem a cor. */
  trashedCount: number;
  /** Artigos etiquetados nesta cor (`editorial_group_articles`) e as etapas posteriores onde têm item. */
  taggedArticles: ReadonlyArray<{ articleId: string; label: string | null; stages: readonly string[] }>;
  /** Artigos do Arquiteto (vigentes) ligados à cor pelas keywords, com as etapas posteriores. */
  architectArticles?: ReadonlyArray<{ articleId: string; label: string | null; stages: readonly string[] }>;
  /** O Silo ligado ao grupo tem SiloDNA (consolidado): desfazer é do Arquiteto. */
  siloConsolidated: boolean;
  /** Incluir publicadas na lixeira de 24 h (D6). */
  includePublished: boolean;
  /** A M-E está no banco (a RPC responde). */
  available: boolean;
};

/* ---------------------------------------------------------------- prévia */

export type GroupDeleteAllOutReason =
  | "lifecycle_unread"
  | "blocked_descendant"
  | "architect_reference"
  | "published_not_included"
  | "subject_of_other_color"
  | "principal_of_other_color"
  | "principal_outside_color"
  | "same_article";

export type GroupDeleteAllItem = { id: string; keyword: string };
export type GroupDeleteAllOut = GroupDeleteAllItem & { reason: GroupDeleteAllOutReason; message: string; path: string | null };
export type GroupDeleteAllReleasedSubject = { keywordId: string; title: string; order: number | null; role: string | null; planOfThisColor: boolean };
export type GroupDeleteAllBlock = { ids: string[]; allowRecoverable: boolean };
export type GroupDeleteAllPlanAfter = "none" | "unchanged" | "reduced" | "cleared";

export type GroupDeleteAllPreview = {
  group: GroupDeleteAllGroup & { colorLabel: string };
  includePublished: boolean;
  available: boolean;
  unavailableMessage: string | null;
  /** Não publicadas: DELETE definitivo. */
  hard: GroupDeleteAllItem[];
  /** Publicadas incluídas (D6): lixeira de 24 h. */
  recoverable: GroupDeleteAllItem[];
  /** Todas as publicadas da cor (para a marcação e para a lista de nomes). */
  publishedInColor: GroupDeleteAllItem[];
  out: GroupDeleteAllOut[];
  releasedSubjects: GroupDeleteAllReleasedSubject[];
  blocks: GroupDeleteAllBlock[];
  plan: { hasPlan: boolean; articlesNow: number; articlesLeaving: number; articlesStaying: number; after: GroupDeleteAllPlanAfter; nextPlanVersion: number | null };
  color: { freedAtEnd: boolean; keptBecause: string[]; siloUnlinkAtEnd: boolean };
  areas: GroupDeleteAllAreaView[];
  effects: string[];
  confirmation: { colorWord: string; hardPhrase: string | null; publishedNames: Array<{ id: string; keyword: string }> };
  totals: { live: number; hard: number; recoverable: number; out: number; trashedBefore: number; blocks: number };
  /** A base do `decisionHash` (o núcleo calcula o hash): mudou qualquer coisa, a decisão é outra. */
  decisionBasis: Record<string, unknown>;
};

const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;

const ARCHITECT_PATH = "Arquiteto → “Retirar artigo do Silo” (ou “Tirar do plano” no Gerenciar a cor) e depois uma prévia nova";

function reasonMessage(reason: Exclude<GroupDeleteAllOutReason, "same_article">, row: GroupDeleteAllKeyword): { message: string; path: string | null } {
  switch (reason) {
    case "lifecycle_unread":
      return { message: "O impacto da exclusão desta keyword não pôde ser lido agora: ela fica fora (nada é excluído às cegas).", path: "Gere a prévia de novo" };
    case "blocked_descendant":
      return { message: "Tem documento no Redator (ContentDocument): o ciclo de vida recusa a exclusão. O Redator não tem exclusão (D8); a keyword continua.", path: null };
    case "architect_reference": {
      const nomes = row.architectRefs.map(ref => ref.label ? `“${ref.label}”` : ref.articleId).slice(0, 3).join(", ");
      return { message: `Está no ArticleDNA vigente de ${plural(row.architectRefs.length, "artigo", "artigos")} do Arquiteto (${nomes}). O Arquiteto não exclui keyword (F4): retire o artigo do Silo lá ou tire-o do plano antes.`, path: ARCHITECT_PATH };
    }
    case "published_not_included":
      return { message: "Publicada: só sai com a marcação “Incluir publicadas na lixeira de 24 h” e o nome dela digitado (D6). Fica restaurável por 24 h.", path: "Marque “Incluir publicadas na lixeira de 24 h”" };
    case "subject_of_other_color":
      return { message: "Carrega o Assunto do plano de OUTRA cor: tire-o do plano naquela cor antes.", path: "Gerenciar a cor (a outra) → Plano do Silo → “Tirar do plano”" };
    case "principal_of_other_color":
      return { message: "É a principal declarada de um Assunto de outra cor: tire aquele artigo do plano antes.", path: "Gerenciar a cor (a outra) → Plano do Silo → “Tirar do plano”" };
    case "principal_outside_color":
      return { message: `A principal declarada deste artigo do plano (“${row.plan?.declaredPrincipal?.phrase ?? ""}”) não está viva nesta cor: o artigo fica inteiro. Tire-o do plano antes.`, path: "Gerenciar a cor → Plano do Silo → “Tirar do plano”" };
  }
}

/** O título do Assunto que a keyword carrega (o cadastrado; senão a própria keyword). */
function subjectTitle(row: GroupDeleteAllKeyword): string {
  return row.entryTitle?.trim() || row.keyword;
}

/** Monta a prévia. Pura: a mesma entrada dá a mesma prévia (e o mesmo `decisionBasis`). */
export function buildGroupDeleteAllPreview(input: GroupDeleteAllInput): GroupDeleteAllPreview {
  const { group } = input;
  const colorLabel = EDITORIAL_GROUP_COLOR_LABELS[group.color];
  const rows = [...input.keywords].sort((a, b) => a.keyword.localeCompare(b.keyword, "pt-BR") || a.id.localeCompare(b.id));
  const byId = new Map(rows.map(row => [row.id, row]));

  // 1. Unidades: o artigo do plano (Assunto + principal declarada) sai inteiro ou fica inteiro.
  const pai = new Map(rows.map(row => [row.id, row.id]));
  const raiz = (id: string): string => {
    let atual = id;
    while (pai.get(atual) !== atual) atual = pai.get(atual)!;
    return atual;
  };
  const junta = (a: string, b: string) => { const ra = raiz(a); const rb = raiz(b); if (ra !== rb) pai.set(rb, ra); };

  const motivos = new Map<string, Exclude<GroupDeleteAllOutReason, "same_article">>();
  const marcaMotivo = (id: string, motivo: Exclude<GroupDeleteAllOutReason, "same_article">) => { if (!motivos.has(id)) motivos.set(id, motivo); };

  for (const row of rows) {
    if (row.lifecycle === "unknown") marcaMotivo(row.id, "lifecycle_unread");
    else if (row.lifecycle === "blocked") marcaMotivo(row.id, "blocked_descendant");
    if (row.architectRefs.length) marcaMotivo(row.id, "architect_reference");
    if (row.lifecycle === "recoverable" && !input.includePublished) marcaMotivo(row.id, "published_not_included");
    if (row.plan) {
      if (row.plan.groupId !== group.id) marcaMotivo(row.id, "subject_of_other_color");
      const principal = row.plan.declaredPrincipal?.keywordId ?? null;
      if (principal && principal !== row.id) {
        if (byId.has(principal)) junta(row.id, principal);
        else if (row.plan.groupId === group.id) marcaMotivo(row.id, "principal_outside_color");
      }
    }
    if (row.principalMark && row.principalMark.subjectKeywordId !== row.id) {
      if (byId.has(row.principalMark.subjectKeywordId)) junta(row.id, row.principalMark.subjectKeywordId);
      else if (row.principalMark.groupId !== group.id) marcaMotivo(row.id, "principal_of_other_color");
      // Marca deste grupo cujo Assunto não está mais vivo (marca órfã): a RPC tira a marca junto.
    }
  }

  // 2. Fora: o motivo próprio, ou o do artigo (mesma unidade).
  const membros = new Map<string, string[]>();
  for (const row of rows) {
    const chave = raiz(row.id);
    membros.set(chave, [...(membros.get(chave) ?? []), row.id]);
  }
  const out: GroupDeleteAllOut[] = [];
  const fora = new Set<string>();
  for (const row of rows) {
    const proprio = motivos.get(row.id);
    if (proprio) {
      const texto = reasonMessage(proprio, row);
      out.push({ id: row.id, keyword: row.keyword, reason: proprio, message: texto.message, path: texto.path });
      fora.add(row.id);
      continue;
    }
    const companheiro = (membros.get(raiz(row.id)) ?? []).find(id => motivos.has(id));
    if (companheiro) {
      const nome = byId.get(companheiro)?.keyword ?? companheiro;
      out.push({ id: row.id, keyword: row.keyword, reason: "same_article", message: `Faz parte do mesmo artigo do plano que “${nome}”, que fica fora: o artigo sai inteiro ou fica inteiro.`, path: null });
      fora.add(row.id);
    }
  }

  const elegiveis = rows.filter(row => !fora.has(row.id));
  const hard = elegiveis.filter(row => row.lifecycle === "hard").map(row => ({ id: row.id, keyword: row.keyword }));
  const recoverable = elegiveis.filter(row => row.lifecycle === "recoverable").map(row => ({ id: row.id, keyword: row.keyword }));
  const publishedInColor = rows.filter(row => row.lifecycle === "recoverable").map(row => ({ id: row.id, keyword: row.keyword }));

  const releasedSubjects: GroupDeleteAllReleasedSubject[] = elegiveis
    .filter(row => row.subjectDeclared && (row.plan || row.entryTitle))
    .map(row => ({ keywordId: row.id, title: subjectTitle(row), order: row.plan?.order ?? null, role: row.plan?.role ?? null, planOfThisColor: row.plan?.groupId === group.id }))
    .sort((a, b) => (a.order ?? 999) - (b.order ?? 999) || a.title.localeCompare(b.title, "pt-BR"));

  // 3. Blocos de até 100, sem partir um artigo do plano entre dois blocos.
  const unidades = [...new Set(elegiveis.map(row => raiz(row.id)))]
    .map(chave => (membros.get(chave) ?? []).filter(id => !fora.has(id)).sort())
    .filter(ids => ids.length > 0)
    .sort((a, b) => a[0].localeCompare(b[0]));
  const blocks: GroupDeleteAllBlock[] = [];
  let atual: string[] = [];
  for (const unidade of unidades) {
    if (atual.length + unidade.length > GROUP_DELETE_ALL_BLOCK_SIZE && atual.length) { blocks.push({ ids: atual, allowRecoverable: false }); atual = []; }
    atual = [...atual, ...unidade];
  }
  if (atual.length) blocks.push({ ids: atual, allowRecoverable: false });
  const recuperaveis = new Set(recoverable.map(item => item.id));
  for (const bloco of blocks) bloco.allowRecoverable = bloco.ids.some(id => recuperaveis.has(id));

  // 4. O plano depois.
  const doPlano = rows.filter(row => row.plan && row.plan.groupId === group.id && row.subjectDeclared);
  const saindo = doPlano.filter(row => !fora.has(row.id)).length;
  const ficando = doPlano.length - saindo;
  const after: GroupDeleteAllPlanAfter = !group.hasPlan ? "none" : saindo === 0 ? "unchanged" : ficando === 0 ? "cleared" : "reduced";
  const plan = { hasPlan: group.hasPlan, articlesNow: doPlano.length, articlesLeaving: saindo, articlesStaying: ficando, after, nextPlanVersion: after === "reduced" || after === "cleared" ? group.planVersion + 1 : null };

  // 5. A cor no fim (D7): livre só se nada ficar.
  const keptBecause: string[] = [];
  if (out.length) keptBecause.push(`${plural(out.length, "keyword fica", "keywords ficam")} fora (motivos na lista)`);
  if (recoverable.length) keptBecause.push(`${plural(recoverable.length, "publicada vai", "publicadas vão")} para a lixeira de 24 h e prendem a cor até a purga (D7)`);
  if (input.trashedCount > 0) keptBecause.push(`${plural(input.trashedCount, "keyword já está", "keywords já estão")} na lixeira (restauráveis)`);
  if (input.taggedArticles.length) keptBecause.push(`${plural(input.taggedArticles.length, "artigo etiquetado", "artigos etiquetados")} na cor (a etiqueta é do Arquiteto; nada é excluído lá)`);
  if (group.siloId && input.siloConsolidated) keptBecause.push("Silo consolidado ligado ao grupo (não há exclusão de Silo consolidado; desfazer é do Arquiteto)");
  const freedAtEnd = keptBecause.length === 0;
  const siloUnlinkAtEnd = freedAtEnd && Boolean(group.siloId) && !input.siloConsolidated;

  // 6. As outras áreas (D8): listadas, sem exclusão.
  const artigos = new Map<string, { articleId: string; label: string | null; stages: Set<string> }>();
  for (const item of [...input.taggedArticles, ...(input.architectArticles ?? [])]) {
    const atualArtigo = artigos.get(item.articleId) ?? { articleId: item.articleId, label: item.label, stages: new Set<string>() };
    if (!atualArtigo.label && item.label) atualArtigo.label = item.label;
    item.stages.forEach(stage => atualArtigo.stages.add(stage));
    artigos.set(item.articleId, atualArtigo);
  }
  const listaArtigos = [...artigos.values()].sort((a, b) => (a.label ?? a.articleId).localeCompare(b.label ?? b.articleId, "pt-BR"));
  const itensDa = (stage: string | null) => listaArtigos
    .filter(artigo => stage === null || artigo.stages.has(stage))
    .map(artigo => ({ id: artigo.articleId, label: artigo.label ?? artigo.articleId }));
  const areas: GroupDeleteAllAreaView[] = (["minerador", "arquiteto", "radar", "redator", "publicacoes"] as const).map(area => ({
    area,
    label: GROUP_DELETE_ALL_AREA_LABELS[area],
    executable: area === "minerador",
    reason: GROUP_DELETE_ALL_AREA_REASONS[area],
    items: area === "minerador" ? [] : itensDa(area === "arquiteto" ? null : area === "redator" ? "writer" : area === "publicacoes" ? "publications" : "radar"),
  }));

  // 7. Frases da prévia.
  const effects: string[] = [];
  if (hard.length) effects.push(`${plural(hard.length, "keyword não publicada é apagada", "keywords não publicadas são apagadas")} DE VEZ (com as medições e as origens de descoberta; os eventos de decisão ficam como histórico). Não há como desfazer.`);
  if (recoverable.length) effects.push(`${plural(recoverable.length, "publicada vai", "publicadas vão")} para a lixeira de 24 h (restaurável; depois, purga).`);
  if (releasedSubjects.length) effects.push(`${plural(releasedSubjects.length, "Assunto é liberado", "Assuntos são liberados")} na mesma transação (marcador “${GROUP_DELETE_ALL_RELEASE_VIA}”); o histórico do grupo guarda os títulos.`);
  if (plan.after === "reduced") effects.push(`O plano do Silo passa para a v${plan.nextPlanVersion} com ${plural(ficando, "artigo", "artigos")} (sai${saindo === 1 ? "" : "em"} ${saindo}).`);
  if (plan.after === "cleared") effects.push(`O plano do Silo fica limpo (v${plan.nextPlanVersion}, sem artigos): um plano sem artigos não existe.`);
  if (out.length) effects.push(`${plural(out.length, "keyword fica", "keywords ficam")} fora, com o motivo de cada uma.`);
  effects.push(freedAtEnd
    ? `No fim, nada fica: a cor ${colorLabel} é liberada (grupo arquivado${siloUnlinkAtEnd ? ", Silo não consolidado desligado" : ""}); ao usar a cor de novo, o grupo volta sem plano, com o histórico.`
    : `A cor ${colorLabel} continua ocupada no fim: ${keptBecause.join("; ")}.`);
  effects.push("As versões do ArticleDNA, SiloDNA e SiloPage ficam como histórico; Radar, Redator e Publicações não mudam.");
  if (blocks.length > 1) effects.push(`Execução em ${blocks.length} blocos de até ${GROUP_DELETE_ALL_BLOCK_SIZE}: cada bloco é tudo-ou-nada; um bloco recusado não desfaz os anteriores.`);

  const sortIds = (items: readonly { id: string }[]) => items.map(item => item.id).sort();
  const decisionBasis = {
    operation: "excluir_tudo_da_cor@1",
    groupId: group.id,
    lockVersion: group.lockVersion,
    planVersion: group.planVersion,
    includePublished: input.includePublished,
    hard: sortIds(hard),
    recoverable: sortIds(recoverable),
    out: out.map(item => `${item.id}:${item.reason}`).sort(),
    released: releasedSubjects.map(item => item.keywordId).sort(),
    blocks: blocks.map(bloco => bloco.ids.join(",")),
  };

  return {
    group: { ...group, colorLabel },
    includePublished: input.includePublished,
    available: input.available,
    unavailableMessage: input.available ? null : GROUP_DELETE_ALL_NOT_AVAILABLE_MESSAGE,
    hard,
    recoverable,
    publishedInColor,
    out,
    releasedSubjects,
    blocks,
    plan,
    color: { freedAtEnd, keptBecause, siloUnlinkAtEnd },
    areas,
    effects,
    confirmation: {
      colorWord: colorLabel.toLocaleLowerCase("pt-BR"),
      hardPhrase: hard.length ? GROUP_DELETE_ALL_HARD_PHRASE : null,
      publishedNames: recoverable.map(item => ({ id: item.id, keyword: item.keyword })),
    },
    totals: { live: rows.length, hard: hard.length, recoverable: recoverable.length, out: out.length, trashedBefore: input.trashedCount, blocks: blocks.length },
    decisionBasis,
  };
}

/* ------------------------------------------------------------ confirmação */

/** Texto digitado comparável: a MESMA regra do nome digitado da exclusão comum (`typedConfirmationMatches`). */
export function normalizeGroupDeleteAllTyped(value: unknown): string {
  return typeof value === "string" ? normalizeTypedConfirmation(value) : "";
}

export type GroupDeleteAllTyped = {
  /** O nome da cor (ex.: "azul"). */
  color?: unknown;
  /** "apaga de vez", quando há DELETE. */
  phrase?: unknown;
  /** O nome de cada publicada incluída, por id. */
  publishedNames?: Record<string, unknown> | null;
};

export type GroupDeleteAllConfirmationCheck =
  | { ok: true }
  | { ok: false; code: "CONFIRMATION_REQUIRED"; missing: string[]; message: string };

/**
 * A confirmação forte (§10.2 item 3): o nome da cor; "apaga de vez" quando há
 * qualquer exclusão definitiva; o nome de cada publicada incluída (a
 * confirmação de sempre da lixeira de 24 h). É a autorização explícita da
 * operação (`AGENTS.md` §15) — a tela e o servidor conferem a mesma regra.
 */
export function checkGroupDeleteAllConfirmation(preview: Pick<GroupDeleteAllPreview, "confirmation">, typed: GroupDeleteAllTyped): GroupDeleteAllConfirmationCheck {
  const faltam: string[] = [];
  if (normalizeGroupDeleteAllTyped(typed.color) !== normalizeGroupDeleteAllTyped(preview.confirmation.colorWord)) faltam.push(`o nome da cor (“${preview.confirmation.colorWord}”)`);
  if (preview.confirmation.hardPhrase && normalizeGroupDeleteAllTyped(typed.phrase) !== normalizeGroupDeleteAllTyped(preview.confirmation.hardPhrase)) faltam.push(`“${preview.confirmation.hardPhrase}”`);
  const nomes = typed.publishedNames && typeof typed.publishedNames === "object" ? typed.publishedNames : {};
  for (const publicada of preview.confirmation.publishedNames) {
    if (normalizeGroupDeleteAllTyped(nomes[publicada.id]) !== normalizeGroupDeleteAllTyped(publicada.keyword)) faltam.push(`o nome da publicada “${publicada.keyword}”`);
  }
  if (!faltam.length) return { ok: true };
  return { ok: false, code: "CONFIRMATION_REQUIRED", missing: faltam, message: `Nada foi excluído: falta digitar ${faltam.join(", ")}.` };
}

/* ------------------------------------------------------------- resultado */

export type GroupDeleteAllBlockOutcome = {
  ids: string[];
  allowRecoverable: boolean;
  outcome: "done" | "refused" | "failed";
  hardDeletedIds: string[];
  recoverableIds: string[];
  releasedSubjectIds: string[];
  code: string | null;
  message: string | null;
};

/** O registro do histórico do grupo (`keywords_unassigned`, append-only): sobrevive às keywords apagadas. */
export function groupDeleteAllEventPayload(input: {
  preview: GroupDeleteAllPreview;
  decisionHash: string;
  blocks: readonly GroupDeleteAllBlockOutcome[];
}): Record<string, unknown> {
  const nomes = new Map([...input.preview.hard, ...input.preview.recoverable].map(item => [item.id, item.keyword]));
  const apagadas = input.blocks.flatMap(bloco => bloco.hardDeletedIds);
  const lixeira = input.blocks.flatMap(bloco => bloco.recoverableIds);
  const liberadas = new Set(input.blocks.flatMap(bloco => bloco.releasedSubjectIds));
  const recusadas = input.blocks.filter(bloco => bloco.outcome !== "done");
  return {
    via: GROUP_DELETE_ALL_RELEASE_VIA,
    operation: GROUP_DELETE_ALL_ACTION_LABEL,
    decisionHash: input.decisionHash,
    keywordIds: [...apagadas, ...lixeira],
    keywords: [...apagadas, ...lixeira].map(id => nomes.get(id) ?? id).slice(0, 500),
    hardDeletedIds: apagadas,
    recoverableIds: lixeira,
    releasedSubjects: input.preview.releasedSubjects.filter(item => liberadas.has(item.keywordId)).map(item => ({ keywordId: item.keywordId, title: item.title, order: item.order, role: item.role })),
    counts: {
      hardDeleted: apagadas.length,
      recoverable: lixeira.length,
      out: input.preview.out.length,
      refusedBlocks: recusadas.length,
      refusedKeywords: recusadas.reduce((total, bloco) => total + bloco.ids.length, 0),
    },
    refused: recusadas.map(bloco => ({ code: bloco.code, count: bloco.ids.length })),
    areas: Object.fromEntries(input.preview.areas.filter(area => !area.executable).map(area => [area.area, area.items.length])),
  };
}
