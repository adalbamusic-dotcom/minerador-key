import { EDITORIAL_GROUP_COLOR_LABELS, type EditorialGroupArea, type EditorialGroupColor } from "../editorial/editorial-groups.ts";
import { checkDeleteConfirmation, DELETE_HARD_PHRASE, deleteConfirmationRequirement, normalizeTypedConfirmation } from "../lifecycle/typed-confirmation.ts";
import type { DeclaredArticlePlan, DeclaredPrincipalMark } from "./declared-plan.ts";
import type { KeywordSubjectReleaseVia } from "./keyword-subject.ts";
import type { ArchitectDismantlePreview } from "./architect-dismantle.ts";

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
 *
 * 2026-10-17 · A EXCLUSÃO COMUM USA ESTE MESMO DOMÍNIO (pedido do dono: "ele tem
 * que deixar apagar todo o grupo"; SDD da linha única do Minerador, P-4). Com
 * `selectedIds`, a prévia vale só para as keywords SELECIONADAS desta cor: as
 * não selecionadas ficam (não entram na lista de fora), contam como "ficam" no
 * plano e prendem a cor; o artigo do plano com metade na seleção fica inteiro
 * fora (`same_article_not_selected`). Sem `selectedIds`, a cor inteira, como
 * sempre (mesma prévia e mesmo `decisionHash` de antes). Selecionar a cor inteira
 * dá o MESMO resultado de "Excluir tudo da cor".
 */

export const GROUP_DELETE_ALL_ACTION_LABEL = "Excluir tudo da cor" as const;
/** O rótulo da exclusão comum quando passa por este domínio (as keywords selecionadas de uma cor). */
export const GROUP_DELETE_SELECTION_ACTION_LABEL = "Excluir as selecionadas" as const;
/** O limite das rotas de exclusão (e da RPC): cada bloco é tudo-ou-nada. */
export const GROUP_DELETE_ALL_BLOCK_SIZE = 100;
/** O segundo texto da confirmação forte, quando há exclusão definitiva (a regra única: `lib/lifecycle/typed-confirmation.ts`). */
export const GROUP_DELETE_ALL_HARD_PHRASE = DELETE_HARD_PHRASE;
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
  `“${GROUP_DELETE_ALL_ACTION_LABEL}” ainda não está disponível neste banco: a migration ${GROUP_DELETE_ALL_MIGRATION} não foi aplicada. Nada pode ser excluído por aqui; a prévia continua valendo. A exclusão comum (selecionar → Excluir) segue como sempre para as keywords sem Assunto do plano; as do plano dependem desta migration.`;

/** 2026-10-17 · a exclusão comum: a keyword do plano fica fora enquanto a M-E não estiver no banco. */
export const KEYWORD_DELETE_PLAN_NOT_AVAILABLE_MESSAGE =
  `Carrega Assunto do plano do Silo: ela sai do plano e é apagada na MESMA transação pela função da migration ${GROUP_DELETE_ALL_MIGRATION}, que ainda não foi aplicada neste banco. Fica fora (nada dela muda); o resto da seleção sai como sempre.`;

/* ---------------------------------------------------------------- áreas */

export const GROUP_DELETE_ALL_AREA_LABELS: Record<EditorialGroupArea, string> = {
  minerador: "Minerador",
  arquiteto: "Arquiteto",
  radar: "Radar",
  redator: "Redator",
  publicacoes: "Publicações",
};

/**
 * As frases de cada área quando nada dela muda.
 * 2026-10-18 · SUBSTITUÍDO o D8 "só o Minerador executa; as outras áreas ficam fora" (decisão do dono: "tudo tem que
 * poder ser apagado … e alerta falando o que está apagando"): o que a exclusão tira do Arquiteto, do Radar, do Redator e
 * de Publicações sai junto, ANTES das keywords, pelo núcleo do "Desfazer Silo" (`lib/minerador/architect-dismantle.ts`),
 * e a prévia diz o quê, por área (`GROUP_DELETE_ALL_AREA_DISMANTLE_REASON`). As versões (ArticleDNA, SiloDNA, SiloPage,
 * documento) ficam como histórico.
 */
export const GROUP_DELETE_ALL_AREA_REASONS: Record<EditorialGroupArea, string | null> = {
  minerador: null,
  arquiteto: "Nenhum artigo vigente do Arquiteto cita estas keywords: nada muda lá (as versões antigas ficam como histórico).",
  radar: "Nenhum item da cor no Radar: nada muda lá.",
  redator: "Nenhum documento da cor no Redator: nada muda lá.",
  publicacoes: "Nada publicado da cor: nada muda lá; URL, slug e canonical ficam protegidos.",
};
/** A frase da área que sai junto (o desmonte, antes de excluir as keywords). */
export const GROUP_DELETE_ALL_AREA_DISMANTLE_REASON: Record<Exclude<EditorialGroupArea, "minerador">, string> = {
  arquiteto: "Sai junto, antes das keywords (o mesmo núcleo do “Desfazer Silo”): os artigos saem de vigência e o Silo se desfaz; as versões ficam como histórico.",
  radar: "Sai junto: o item sai da operação do Radar (“retirado”); a investigação fica como histórico.",
  redator: "O documento do Redator fica como histórico (não é apagado).",
  publicacoes: "Publicado: no site nada muda (URL, slug e canonical ficam); a keyword publicada vai para a lixeira de 24 h com a marcação.",
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
  /**
   * 2026-10-18 · a prévia do desmonte do Arquiteto para as keywords desta exclusão (a porta
   * `ArchitectDismantlePort`). `ok: false` = não dá para ler/desmontar agora (permissão, leitura):
   * as keywords com artigo vigente ficam fora com esse motivo. Ausente = nenhuma porta (fica fora, dito).
   */
  architectDismantle?: { ok: true; preview: ArchitectDismantlePreview } | { ok: false; message: string } | null;
  /** Incluir publicadas na lixeira de 24 h (D6). */
  includePublished: boolean;
  /** A M-E está no banco (a RPC responde). */
  available: boolean;
  /**
   * 2026-10-17 · a exclusão comum: só estas keywords da cor entram (as outras
   * ficam). Ausente/`null` = a cor inteira ("Excluir tudo da cor").
   */
  selectedIds?: readonly string[] | null;
};

/* ---------------------------------------------------------------- prévia */

export type GroupDeleteAllOutReason =
  | "lifecycle_unread"
  | "blocked_descendant"
  /** 2026-10-18 · SUBSTITUI "architect_reference": só quando o desmonte do Arquiteto não pôde ser lido ou não é permitido. */
  | "architect_unavailable"
  | "published_not_included"
  | "subject_of_other_color"
  | "principal_of_other_color"
  | "principal_outside_color"
  | "same_article"
  /** 2026-10-17 · exclusão comum: o outro lado do artigo do plano não está na seleção. */
  | "same_article_not_selected";

/** Os motivos próprios da keyword (os dois "mesmo artigo" vêm do companheiro). */
export type GroupDeleteAllOwnOutReason = Exclude<GroupDeleteAllOutReason, "same_article" | "same_article_not_selected">;

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
  /** 2026-10-17 · a exclusão comum: quantas da cor estão na seleção e quantas ficam fora dela. `null`/ausente = a cor inteira. */
  selection?: { selected: number; notSelected: number } | null;
  /** A base do `decisionHash` (o núcleo calcula o hash): mudou qualquer coisa, a decisão é outra. */
  decisionBasis: Record<string, unknown>;
};

const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;

/*
 * 2026-10-18 · decisão do dono "Manter em duas etapas": a cor com o Silo consolidado sai em duas etapas, em dois
 * lugares — no Arquiteto, o "Desfazer Silo" de sempre (o Silo inteiro, Pilar incluído; ou "Retirar artigo do Silo", um
 * artigo); depois, aqui, uma prévia nova. SUBSTITUÍDO: "Retirar artigo do Silo (ou Tirar do plano no Gerenciar a cor)".
 */
export const ARCHITECT_PATH = "Arquiteto → “Desfazer Silo” (o Silo inteiro, Pilar incluído) ou “Retirar artigo do Silo” (um artigo); depois uma prévia nova aqui";
/**
 * 2026-10-18 · a migration que o dono aplica para a keyword com documento do Redator poder sair (o documento fica como
 * histórico). Enquanto não aplicada, o ciclo de vida do banco recusa (`LIFECYCLE_DRAFT_DESCENDANT_REQUIRES_OWNER`).
 */
export const KEYWORD_DELETE_DOCUMENT_MIGRATION = "20261018120000_documento_do_redator_nao_prende_a_keyword" as const;

/** A frase e o caminho de cada motivo próprio (a exclusão comum usa os mesmos textos). */
export function groupDeleteAllReasonMessage(reason: GroupDeleteAllOwnOutReason, row: Pick<GroupDeleteAllKeyword, "architectRefs" | "plan"> & { architectUnavailable?: string | null }): { message: string; path: string | null } {
  switch (reason) {
    case "lifecycle_unread":
      return { message: "O impacto da exclusão desta keyword não pôde ser lido agora: ela fica fora (nada é excluído às cegas).", path: "Gere a prévia de novo" };
    case "blocked_descendant":
      return { message: `Tem documento no Redator (ContentDocument). O documento fica como histórico, mas o ciclo de vida do banco ainda recusa excluir a keyword com documento: falta a migration ${KEYWORD_DELETE_DOCUMENT_MIGRATION} (o dono aplica). Até lá ela continua.`, path: "O dono aplica a migration do documento do Redator e gera a prévia de novo" };
    case "architect_unavailable": {
      const nomes = row.architectRefs.map(ref => ref.label ? `“${ref.label}”` : ref.articleId).slice(0, 3).join(", ");
      return { message: `Está no ArticleDNA vigente de ${plural(row.architectRefs.length, "artigo", "artigos")} do Arquiteto (${nomes}): a exclusão desmonta o artigo lá, e o desmonte não pôde ser preparado agora${row.architectUnavailable ? ` (${row.architectUnavailable})` : ""}.`, path: ARCHITECT_PATH };
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
  // A exclusão comum: só as selecionadas desta cor entram; as outras ficam (contexto do artigo, do plano e da cor).
  const selecao = input.selectedIds ? new Set(input.selectedIds.filter(id => byId.has(id))) : null;
  const naSelecao = (id: string) => !selecao || selecao.has(id);

  // 1. Unidades: o artigo do plano (Assunto + principal declarada) sai inteiro ou fica inteiro.
  const pai = new Map(rows.map(row => [row.id, row.id]));
  const raiz = (id: string): string => {
    let atual = id;
    while (pai.get(atual) !== atual) atual = pai.get(atual)!;
    return atual;
  };
  const junta = (a: string, b: string) => { const ra = raiz(a); const rb = raiz(b); if (ra !== rb) pai.set(rb, ra); };

  const motivos = new Map<string, GroupDeleteAllOwnOutReason>();
  const desmonte = input.architectDismantle && input.architectDismantle.ok ? input.architectDismantle.preview : null;
  const desmonteIndisponivel = input.architectDismantle && !input.architectDismantle.ok ? input.architectDismantle.message : input.architectDismantle === undefined || input.architectDismantle === null ? "o desmonte do Arquiteto não está ligado nesta exclusão" : null;
  const marcaMotivo = (id: string, motivo: GroupDeleteAllOwnOutReason) => { if (naSelecao(id) && !motivos.has(id)) motivos.set(id, motivo); };

  for (const row of rows) {
    if (row.lifecycle === "unknown") marcaMotivo(row.id, "lifecycle_unread");
    else if (row.lifecycle === "blocked") marcaMotivo(row.id, "blocked_descendant");
    // 2026-10-18 · com o desmonte do Arquiteto lido, a keyword com artigo vigente sai (o desmonte vem antes); sem ele, fica fora com o porquê.
    if (row.architectRefs.length && !desmonte) marcaMotivo(row.id, "architect_unavailable");
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
    // Fora da seleção: fica, sem entrar na lista de fora (o dono não pediu para excluí-la).
    if (!naSelecao(row.id)) { fora.add(row.id); continue; }
    const proprio = motivos.get(row.id);
    if (proprio) {
      const texto = groupDeleteAllReasonMessage(proprio, { ...row, architectUnavailable: desmonteIndisponivel });
      out.push({ id: row.id, keyword: row.keyword, reason: proprio, message: texto.message, path: texto.path });
      fora.add(row.id);
      continue;
    }
    const daUnidade = membros.get(raiz(row.id)) ?? [];
    const companheiro = daUnidade.find(id => motivos.has(id));
    if (companheiro) {
      const nome = byId.get(companheiro)?.keyword ?? companheiro;
      out.push({ id: row.id, keyword: row.keyword, reason: "same_article", message: `Faz parte do mesmo artigo do plano que “${nome}”, que fica fora: o artigo sai inteiro ou fica inteiro.`, path: null });
      fora.add(row.id);
      continue;
    }
    const naoSelecionada = daUnidade.find(id => !naSelecao(id));
    if (naoSelecionada) {
      const nome = byId.get(naoSelecionada)?.keyword ?? naoSelecionada;
      out.push({ id: row.id, keyword: row.keyword, reason: "same_article_not_selected", message: `Faz parte do mesmo artigo do plano que “${nome}”, que não está na seleção: o artigo sai inteiro ou fica inteiro.`, path: `Selecione também “${nome}” e clique Excluir de novo` });
      fora.add(row.id);
    }
  }

  const elegiveis = rows.filter(row => !fora.has(row.id));
  const hard = elegiveis.filter(row => row.lifecycle === "hard").map(row => ({ id: row.id, keyword: row.keyword }));
  const recoverable = elegiveis.filter(row => row.lifecycle === "recoverable").map(row => ({ id: row.id, keyword: row.keyword }));
  const publishedInColor = rows.filter(row => naSelecao(row.id) && row.lifecycle === "recoverable").map(row => ({ id: row.id, keyword: row.keyword }));
  const foraDaSelecao = selecao ? rows.length - selecao.size : 0;

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
  if (foraDaSelecao > 0) keptBecause.push(`${plural(foraDaSelecao, "keyword da cor não está", "keywords da cor não estão")} na seleção e ${foraDaSelecao === 1 ? "fica" : "ficam"}`);
  if (recoverable.length) keptBecause.push(`${plural(recoverable.length, "publicada vai", "publicadas vão")} para a lixeira de 24 h e prendem a cor até a purga (D7)`);
  if (input.trashedCount > 0) keptBecause.push(`${plural(input.trashedCount, "keyword já está", "keywords já estão")} na lixeira (restauráveis)`);
  const desetiquetados = new Set(desmonte?.untagArticleIds ?? []);
  const etiquetadosQueFicam = input.taggedArticles.filter(item => !desetiquetados.has(item.articleId));
  if (etiquetadosQueFicam.length) keptBecause.push(`${plural(etiquetadosQueFicam.length, "artigo etiquetado", "artigos etiquetados")} na cor que não saem nesta exclusão`);
  const siloSai = Boolean(desmonte && desmonte.unlinkGroupIds.includes(group.id));
  if (group.siloId && input.siloConsolidated && !siloSai) keptBecause.push("Silo consolidado ligado ao grupo (desfazer é do Arquiteto: “Desfazer Silo”, o Silo inteiro)");
  const freedAtEnd = keptBecause.length === 0;
  const siloUnlinkAtEnd = freedAtEnd && Boolean(group.siloId) && (!input.siloConsolidated || siloSai);

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
  const areas: GroupDeleteAllAreaView[] = (["minerador", "arquiteto", "radar", "redator", "publicacoes"] as const).map(area => {
    if (area === "minerador") return { area, label: GROUP_DELETE_ALL_AREA_LABELS[area], executable: true, reason: null, items: [] };
    const doDesmonte = desmonte?.areas[area] ?? [];
    if (doDesmonte.length) return { area, label: GROUP_DELETE_ALL_AREA_LABELS[area], executable: true, reason: GROUP_DELETE_ALL_AREA_DISMANTLE_REASON[area], items: doDesmonte.map((linha, indice) => ({ id: `${area}:${indice}`, label: linha })) };
    const itens = itensDa(area === "arquiteto" ? null : area === "redator" ? "writer" : area === "publicacoes" ? "publications" : "radar");
    return { area, label: GROUP_DELETE_ALL_AREA_LABELS[area], executable: false, reason: itens.length ? (desmonteIndisponivel ? `Fica fora: ${desmonteIndisponivel}.` : "Fica como está (nenhuma keyword desta exclusão está num artigo vigente dele).") : GROUP_DELETE_ALL_AREA_REASONS[area], items: itens };
  });

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
  if (desmonte?.lines.length) {
    effects.push(`Antes das keywords, sai junto (o mesmo núcleo do “Desfazer Silo”; se algo não fechar, nenhuma keyword é excluída e o resultado diz o que foi feito):`);
    effects.push(...desmonte.lines);
    effects.push("As versões do ArticleDNA, SiloDNA, SiloPage e do documento do Redator ficam como histórico (não são apagadas).");
  } else {
    effects.push("As versões do ArticleDNA, SiloDNA e SiloPage ficam como histórico; Radar, Redator e Publicações não mudam.");
  }
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
    // 2026-10-18 · o desmonte do Arquiteto (mudou lá, a decisão é outra). Sem desmonte, o hash de antes.
    ...(desmonte && desmonte.lines.length ? { architect: desmonte.basis } : {}),
    // Só na exclusão comum: a cor inteira continua com o MESMO hash de antes.
    ...(selecao ? { selection: [...selecao].sort(), notSelected: foraDaSelecao } : {}),
  };
  // A regra única da confirmação (a cor é sempre forte): o nome da cor, "apaga de vez" e o nome de cada publicada.
  const colorWord = colorLabel.toLocaleLowerCase("pt-BR");
  const regra = deleteConfirmationRequirement({ selectionName: colorWord, colorWords: [colorWord], hardCount: hard.length, recoverable, alwaysStrong: true });

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
      colorWord,
      hardPhrase: regra.hardPhrase,
      publishedNames: regra.publishedNames,
    },
    totals: { live: rows.length, hard: hard.length, recoverable: recoverable.length, out: out.length, trashedBefore: input.trashedCount, blocks: blocks.length },
    selection: selecao ? { selected: selecao.size, notSelected: foraDaSelecao } : null,
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
 * 2026-10-17: a conferência é a regra ÚNICA da exclusão (`checkDeleteConfirmation`,
 * a mesma da exclusão comum); aqui só se traduz o formato da prévia da cor.
 */
export function checkGroupDeleteAllConfirmation(preview: Pick<GroupDeleteAllPreview, "confirmation">, typed: GroupDeleteAllTyped): GroupDeleteAllConfirmationCheck {
  const { colorWord, hardPhrase, publishedNames } = preview.confirmation;
  return checkDeleteConfirmation(
    { selectionName: null, colorWords: [colorWord], hardPhrase, publishedNames },
    { colors: { [colorWord]: typed.color }, phrase: typed.phrase, publishedNames: typed.publishedNames },
  );
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

/** O nome da operação no histórico do grupo: a cor inteira ou as selecionadas dela (exclusão comum). */
export function groupDeleteOperationLabel(preview: Pick<GroupDeleteAllPreview, "selection">): string {
  return preview.selection ? GROUP_DELETE_SELECTION_ACTION_LABEL : GROUP_DELETE_ALL_ACTION_LABEL;
}

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
    operation: groupDeleteOperationLabel(input.preview),
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
