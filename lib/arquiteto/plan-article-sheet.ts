/**
 * ===== PLANILHA PRIMEIRO — OS ARTIGOS DO PLANO COMO LINHAS (F5) =====
 *
 * SDD `docs/compartilhado/sdd-arquiteto-so-le-e-listas-leves-2026-10-13.md`,
 * item 5 (§9.2; aprovada pelo dono em 2026-10-13, D1–D8 decididas). Cada
 * keyword RECEBIDA no Arquiteto que carrega Assunto com plano (pacote aprovado:
 * `keyword_subject.entry`/`plan`) vira UMA linha em "Artigos novos" assim que
 * chega — sem passar pelo painel de texto da melhoria. A linha mostra cor,
 * ordem, papel, Assunto, keyword, trava, volume, SERP (4 lentes) e o estado da
 * formação; as ações (Validar SERP, Trocar principal, Concluir formação) usam
 * os MESMOS núcleos de sempre (rota `keyword-serp` para a SERP; a melhoria
 * recortada por grupo para a formação e a troca de principal). Nada aqui grava
 * nada — e nada da planilha grava no Minerador (F4: o Arquiteto só lê).
 *
 * Linha do plano NÃO é Article: não cria ArticleDNA, não fabrica `articleId`
 * (o mesmo contrato de `article-pipeline.ts`). A identidade é o `keywordId`.
 *
 * Domínio puro: sem React, sem rede, sem storage.
 */
import { readArchitectSubjectStanding, readArchitectSubjectStandings, suggestSubjectSupport, planLockOfStanding, type ArchitectSubjectStanding } from "./declared-subject.ts";
import { declaredPlanSubjectList } from "./declared-plan-formation.ts";
import { readKnownVolume, type KnownVolume } from "../editorial/known-before-search.ts";
import { EDITORIAL_GROUP_COLORS, EDITORIAL_GROUP_COLOR_LABELS, editorialGroupFilterMatches, isEditorialGroupColor, type EditorialGroupColor, type EditorialGroupScreenFilter } from "../editorial/editorial-groups.ts";
import type { ImprovementProposal } from "./article-improvement.ts";
import { SILO_ARTICLE_WITHDRAWAL_ACTION_LABEL } from "./silo-article-withdrawal.ts";

type RecordLike = Record<string, unknown>;

/* --------------------------------------------------------------- rótulos */

export const PLAN_SHEET_TITLE = "Artigos do plano";
/** A âncora da planilha (o próximo passo do painel recolhido leva até ela). */
export const PLAN_SHEET_ANCHOR = "architect-plan-sheet";
/** 2026-10-14 · o painel "Melhorar publicados" recolhido quando a cor ativa tem plano. */
export function improvementPanelCollapsedLabel(colorLabel: string | null): { title: string; nextStep: string; button: string } {
  return {
    title: `Melhorar publicados · recolhido — os artigos do plano${colorLabel ? ` da cor ${colorLabel}` : ""} estão na planilha abaixo`,
    nextStep: `Na planilha “${PLAN_SHEET_TITLE}”: Validar SERP e depois Concluir formação. Cada linha diz o que falta; nada é pago sem o custo antes.`,
    button: `Ir para “${PLAN_SHEET_TITLE}”`,
  };
}
export const PLAN_SHEET_ACTION_LABELS = {
  validateSerp: "Validar SERP",
  swapPrincipal: "Trocar principal",
  concludeFormation: "Concluir formação",
} as const;
export type PlanSheetAction = keyof typeof PLAN_SHEET_ACTION_LABELS;
/** O selo da linha travada (o botão "Trocar principal" não aparece). */
export const PLAN_SHEET_LOCKED_SEAL = "Principal travada · mude a trava no Minerador";
export const PLAN_SHEET_LENSES = 4;

/* ----------------------------------------------------------------- tipos */

export type PlanSheetLockView = {
  state: "locked" | "free" | "none";
  /** "Travada · pelo volume medido", "Livre · sem volume medido"… (a leitura única do Minerador). */
  label: string;
  /** Por quê, numa frase. */
  why: string;
};

export type PlanSheetVolumeView = {
  state: KnownVolume["state"];
  value: number | null;
  measuredAt: string | null;
  label: string;
};

export type PlanSheetSerpView = {
  state: "complete" | "partial" | "none" | "loading" | "unread";
  /** Lentes no cache (0–4). */
  lenses: number;
  /** A coleta mais antiga das lentes presentes (a idade da evidência). */
  collectedAt: string | null;
  label: string;
};

export type PlanSheetFormationView = {
  /** 2026-10-14 · `conflict`: a keyword da linha está dentro do ArticleDNA vigente de OUTRO artigo (ver `conflict` da linha). */
  state: "awaiting" | "awaiting_principal" | "formed" | "in_radar" | "conflict";
  version: number | null;
  articleId: string | null;
  principalKeywordId: string | null;
  label: string;
};

export type PlanSheetRow = {
  keywordId: string;
  keyword: string;
  /** O Assunto (título cadastrado na keyword). */
  title: string;
  groupId: string | null;
  color: EditorialGroupColor | null;
  groupName: string | null;
  order: number;
  role: "Pilar" | "Suporte";
  planVersion: number;
  territoryRef: string | null;
  lock: PlanSheetLockView;
  volume: PlanSheetVolumeView;
  serp: PlanSheetSerpView;
  formation: PlanSheetFormationView;
  /** A principal de agora: a do ArticleDNA formado ou, antes dele, a principal declarada no plano. */
  currentPrincipalId: string | null;
  /** Sustentações da lista do Assunto (Pesquisa por Assunto), quantas têm volume medido e quais (candidatas da troca). */
  supports: { count: number; withVolume: number; withVolumeIds: string[] };
  /**
   * 2026-10-14 (caso WifiConecta) · a keyword da linha (ou a principal declarada
   * dela) está presa no ArticleDNA vigente de OUTRO artigo — de outro Assunto,
   * de outro Silo. Concluir formação recusa só esta linha com este motivo; sair
   * dali é "Retirar artigo do Silo" nesse artigo, decisão do dono. Sem conflito, `null`.
   */
  conflict: PlanSheetConflict | null;
};

/** O artigo já formado, na forma mínima que a planilha precisa (da mesa, versão vigente). */
export type PlanSheetArticle = {
  articleId: string;
  versionNumber: number;
  subjectKeywordId: string | null;
  principalKeywordId: string | null;
  keywordIds: readonly string[];
  /* 2026-10-14 · aditivos (o conflito da linha diz de qual artigo e Silo se trata); ausentes = sem nome. */
  slug?: string | null;
  /** O Silo do artigo (`ArticleDNA.siloId`, o mesmo id do SiloDNA; senão o `territoryRef`). */
  siloRef?: string | null;
  siloLabel?: string | null;
  subjectPhrase?: string | null;
  /** A cor do Assunto do artigo ("Laranja"), quando a mesa sabe. */
  subjectColorLabel?: string | null;
  /** A principal do artigo, legível. */
  label?: string | null;
};

/** O artigo que prende a keyword de uma linha do plano. */
export type PlanSheetConflict = {
  articleId: string;
  slug: string | null;
  label: string;
  siloRef: string | null;
  siloLabel: string | null;
  subjectKeywordId: string | null;
  subjectPhrase: string | null;
  subjectColorLabel: string | null;
  /** As keywords desta linha que estão lá dentro. */
  keywordIds: string[];
  /** A frase da linha e da recusa: onde está presa e o caminho. */
  sentence: string;
};

/** A leitura da SERP em cache (grátis, `POST /api/arquiteto/serp-subject`). */
export type PlanSheetSerpRead = {
  state: "loading" | "ready" | "failed";
  byKeyword: ReadonlyMap<string, { lenses: number; collectedAt: string | null }>;
};

/* -------------------------------------------------------------- leituras */

const text = (value: unknown): string | null => typeof value === "string" && value.trim() ? value.trim() : null;
const number = (value: number) => value.toLocaleString("pt-BR");
const dateLabel = (iso: string | null) => {
  if (!iso) return null;
  const time = Date.parse(iso);
  return Number.isFinite(time) ? new Date(time).toISOString().slice(0, 10).split("-").reverse().join("/") : null;
};

function lockView(standing: ArchitectSubjectStanding): PlanSheetLockView {
  const lock = planLockOfStanding(standing);
  if (!lock) return { state: "none", label: "Sem principal declarada", why: "O plano não declara a principal deste artigo: a formação escolhe pela SERP e pelo volume, com decisão humana." };
  if (lock.state === "locked") {
    const why = lock.origin === "manual"
      ? "Travada à mão no Minerador (Cadastrar Assuntos): o Arquiteto não troca."
      : lock.origin === "volume"
        ? "A keyword tem volume medido no Google Ads: a principal fica travada. Para trocar, mude a trava no Minerador."
        : "Declarada antes do cadastro único: decisão humana já confirmada. Para trocar, mude a trava no Minerador.";
    return { state: "locked", label: lock.label, why };
  }
  const why = lock.origin === "manual"
    ? "Livre por escolha no Minerador: você pode trocar a principal por uma sustentação com volume (decisão humana, nova versão)."
    : "Sem volume medido: a principal está livre e pode ser trocada por uma sustentação com volume da lista do Assunto (decisão humana, nova versão).";
  return { state: "free", label: lock.label, why };
}

function volumeView(row: RecordLike, now: Date): PlanSheetVolumeView {
  const known = readKnownVolume({ volume_search: row.volume_search, volume_source: row.volume_source, analise_semantica: row.analise_semantica as Record<string, unknown> | null }, now);
  if (known.state === "measured") {
    const data = dateLabel(known.measuredAt);
    return { state: "measured", value: known.volume, measuredAt: known.measuredAt, label: `${number(known.volume)}${data ? ` · medido em ${data}` : " · Google Ads"}` };
  }
  if (known.state === "no_average") return { state: "no_average", value: null, measuredAt: known.measuredAt, label: `Sem média no Google Ads (${dateLabel(known.measuredAt) ?? "recente"})` };
  return { state: "missing", value: null, measuredAt: known.measuredAt, label: known.reason === "other_provider" ? "Volume de outra fonte · medir no Minerador" : "Sem volume medido" };
}

function serpView(keywordId: string, read: PlanSheetSerpRead | null): PlanSheetSerpView {
  if (!read) return { state: "unread", lenses: 0, collectedAt: null, label: "SERP não lida" };
  if (read.state === "loading") return { state: "loading", lenses: 0, collectedAt: null, label: "Lendo o cache…" };
  if (read.state === "failed") return { state: "unread", lenses: 0, collectedAt: null, label: "SERP não lida (tente de novo)" };
  const lido = read.byKeyword.get(keywordId);
  const lenses = Math.max(0, Math.min(PLAN_SHEET_LENSES, lido?.lenses ?? 0));
  const data = dateLabel(lido?.collectedAt ?? null);
  if (lenses >= PLAN_SHEET_LENSES) return { state: "complete", lenses, collectedAt: lido?.collectedAt ?? null, label: `4/4 lentes${data ? ` · ${data}` : ""}` };
  if (lenses > 0) return { state: "partial", lenses, collectedAt: lido?.collectedAt ?? null, label: `${lenses}/4 lentes${data ? ` · ${data}` : ""}` };
  return { state: "none", lenses: 0, collectedAt: null, label: "Sem SERP no cache" };
}

/** O rótulo da coluna Formação quando a keyword da linha está presa em outro artigo. */
export const PLAN_SHEET_CONFLICT_LABEL = "Presa em outro artigo";

/**
 * 2026-10-14 (caso WifiConecta) · O ARTIGO INTRUSO. A keyword de uma linha do
 * plano (a do Assunto ou a principal declarada dele) está dentro do ArticleDNA
 * vigente de outro artigo — formado antes, por outro Assunto, às vezes em outro
 * Silo. Enquanto ele existir, esta linha não forma no Silo do plano: duas
 * definições para a mesma keyword. A planilha diz onde está presa e o caminho
 * ("Retirar artigo do Silo" nesse artigo, decisão do dono); nada sai sozinho.
 * Linha que já tem o próprio artigo não entra aqui (a formação dela responde).
 */
export function planSheetArticleConflict(input: {
  keywordId: string;
  declaredPrincipalId?: string | null;
  articles: readonly PlanSheetArticle[];
}): PlanSheetConflict | null {
  const minhas = [...new Set([input.keywordId, input.declaredPrincipalId].filter((id): id is string => Boolean(id)))];
  const presa = input.articles
    .filter(article => article.subjectKeywordId !== input.keywordId)
    .map(article => ({ article, ids: minhas.filter(id => article.keywordIds.includes(id) || article.principalKeywordId === id) }))
    .filter(item => item.ids.length > 0)
    .sort((a, b) => b.ids.length - a.ids.length || b.article.versionNumber - a.article.versionNumber || a.article.articleId.localeCompare(b.article.articleId))[0];
  if (!presa) return null;
  const { article } = presa;
  const nome = text(article.slug) ?? text(article.label) ?? article.articleId;
  const silo = text(article.siloLabel);
  const assunto = text(article.subjectPhrase);
  const cor = text(article.subjectColorLabel);
  const deQuem = assunto ? ` (Assunto “${assunto}”${cor ? ` · cor ${cor}` : ""})` : cor ? ` (cor ${cor})` : "";
  const sentence = `Presa no artigo “${nome}”${silo ? ` do Silo “${silo}”` : ""}${deQuem}. Esta linha só forma no Silo do plano depois de “${SILO_ARTICLE_WITHDRAWAL_ACTION_LABEL}” nesse artigo (prévia e decisão sua; nada é apagado, as keywords voltam a ficar livres).`;
  return {
    articleId: article.articleId,
    slug: text(article.slug),
    label: text(article.label) ?? nome,
    siloRef: text(article.siloRef),
    siloLabel: silo,
    subjectKeywordId: article.subjectKeywordId,
    subjectPhrase: assunto,
    subjectColorLabel: cor,
    keywordIds: presa.ids,
    sentence,
  };
}

function formationView(input: { keywordId: string; standing: ArchitectSubjectStanding; articles: readonly PlanSheetArticle[]; radarArticleIds: ReadonlySet<string>; receivedIds: ReadonlySet<string>; conflict?: PlanSheetConflict | null }): PlanSheetFormationView {
  const article = input.articles.filter(item => item.subjectKeywordId === input.keywordId).sort((a, b) => b.versionNumber - a.versionNumber)[0];
  if (article) {
    if (input.radarArticleIds.has(article.articleId)) return { state: "in_radar", version: article.versionNumber, articleId: article.articleId, principalKeywordId: article.principalKeywordId, label: `No Radar · v${article.versionNumber}` };
    return { state: "formed", version: article.versionNumber, articleId: article.articleId, principalKeywordId: article.principalKeywordId, label: `Formado · v${article.versionNumber}` };
  }
  if (input.conflict) return { state: "conflict", version: null, articleId: null, principalKeywordId: null, label: PLAN_SHEET_CONFLICT_LABEL };
  const declarada = input.standing.plan?.declaredPrincipal;
  if (declarada && declarada.keywordId !== input.keywordId && !input.receivedIds.has(declarada.keywordId)) {
    return { state: "awaiting_principal", version: null, articleId: null, principalKeywordId: null, label: `Aguarda a principal “${declarada.phrase}” chegar ao Arquiteto` };
  }
  return { state: "awaiting", version: null, articleId: null, principalKeywordId: null, label: "Aguardando formação" };
}

/** As sustentações da lista do Assunto (a mesma leitura que a formação do plano usa). */
function subjectList(input: { brandId: string; row: RecordLike; keywords: readonly RecordLike[] }) {
  return declaredPlanSubjectList(suggestSubjectSupport({ brandId: input.brandId, subjectKeyword: input.row, keywords: input.keywords }));
}

/* ----------------------------------------------------------------- linhas */

const colorRank = (color: EditorialGroupColor | null) => color ? EDITORIAL_GROUP_COLORS.indexOf(color) : EDITORIAL_GROUP_COLORS.length;

/**
 * As linhas da planilha: uma por keyword recebida com Assunto e plano do
 * PACOTE APROVADO desta marca, no recorte da cor ativa, por cor e ordem.
 * Sem plano (keyword comum, Assunto do formato anterior, destino "Artigo
 * publicado") não vira linha: continua como sempre.
 */
export function buildPlanSheetRows(input: {
  brandId: string | null;
  keywords: readonly RecordLike[];
  standings?: ReadonlyMap<string, ArchitectSubjectStanding>;
  groupOf: (groupId: string) => { color: string; name: string } | null;
  keywordGroupOf: (keywordId: string) => string | null;
  articles: readonly PlanSheetArticle[];
  radarArticleIds: ReadonlySet<string>;
  serp: PlanSheetSerpRead | null;
  filter: EditorialGroupScreenFilter;
  now: Date;
}): PlanSheetRow[] {
  if (!input.brandId) return [];
  const brandId = input.brandId;
  const standings = input.standings ?? readArchitectSubjectStandings(input.keywords);
  const receivedIds = new Set(input.keywords.map(keyword => String(keyword.id ?? "")).filter(Boolean));
  const porId = new Map(input.keywords.map(item => [String(item.id ?? ""), item]));
  const temVolume = (keywordId: string) => {
    const linha = porId.get(keywordId);
    if (!linha) return false;
    const lido = volumeView(linha, input.now);
    return lido.state === "measured" && (lido.value ?? 0) > 0;
  };
  const rows: PlanSheetRow[] = [];
  for (const keyword of input.keywords) {
    const keywordId = String(keyword.id ?? "");
    if (!keywordId) continue;
    const standing = standings.get(keywordId) ?? readArchitectSubjectStanding(keyword);
    const plan = standing.plan;
    if (!plan || !standing.declared || !standing.received || !standing.approvedPackageRef || standing.brandId !== brandId) continue;
    const groupId = input.keywordGroupOf(keywordId) ?? plan.groupId;
    if (!editorialGroupFilterMatches(input.filter, groupId)) continue;
    const group = groupId ? input.groupOf(groupId) : null;
    const color = group && isEditorialGroupColor(group.color) ? group.color : null;
    const lista = subjectList({ brandId, row: keyword, keywords: input.keywords });
    const comVolume = lista.filter(item => temVolume(item.keywordId)).map(item => item.keywordId);
    const temProprio = input.articles.some(article => article.subjectKeywordId === keywordId);
    const conflict = temProprio ? null : planSheetArticleConflict({ keywordId, declaredPrincipalId: plan.declaredPrincipal?.keywordId ?? null, articles: input.articles });
    const formation = formationView({ keywordId, standing, articles: input.articles, radarArticleIds: input.radarArticleIds, receivedIds, conflict });
    rows.push({
      keywordId,
      keyword: String(keyword.keyword ?? "").trim(),
      title: standing.phrase,
      groupId,
      color,
      groupName: group?.name ?? null,
      order: plan.order,
      role: plan.role,
      planVersion: plan.planVersion,
      territoryRef: text(keyword.territoryRef),
      lock: lockView(standing),
      volume: volumeView(keyword, input.now),
      serp: serpView(keywordId, input.serp),
      formation,
      currentPrincipalId: formation.principalKeywordId ?? plan.declaredPrincipal?.keywordId ?? null,
      supports: { count: lista.length, withVolume: comVolume.length, withVolumeIds: comVolume },
      conflict,
    });
  }
  return rows.sort((a, b) => colorRank(a.color) - colorRank(b.color)
    || String(a.groupId ?? "").localeCompare(String(b.groupId ?? ""))
    || a.order - b.order
    || a.keyword.localeCompare(b.keyword, "pt-BR"));
}

/** As mesmas linhas com a SERP relida (a leitura do cache chega depois das linhas). */
export function applyPlanSheetSerp(rows: readonly PlanSheetRow[], read: PlanSheetSerpRead | null): PlanSheetRow[] {
  return rows.map(row => ({ ...row, serp: serpView(row.keywordId, read) }));
}

/**
 * A leitura do cache (`/api/arquiteto/serp-subject`) por keyword: lentes
 * presentes e servíveis (a vencida conta como falta) e a coleta mais antiga.
 */
export function planSheetSerpByKeyword(response: {
  footprints: readonly { keywordId: string; lenses: readonly { lens: string; collectedAt: string | null }[] }[];
  missingLenses?: readonly { keywordId: string; lens: string }[];
}): Map<string, { lenses: number; collectedAt: string | null }> {
  const faltas = new Map<string, Set<string>>();
  for (const item of response.missingLenses ?? []) faltas.set(item.keywordId, new Set([...(faltas.get(item.keywordId) ?? []), item.lens]));
  const mapa = new Map<string, { lenses: number; collectedAt: string | null }>();
  for (const footprint of response.footprints) {
    const servem = footprint.lenses.filter(lens => !faltas.get(footprint.keywordId)?.has(lens.lens));
    const lentes = new Set(servem.map(lens => lens.lens));
    const datas = servem.map(lens => lens.collectedAt).filter((value): value is string => Boolean(value)).sort();
    mapa.set(footprint.keywordId, { lenses: lentes.size, collectedAt: datas[0] ?? null });
  }
  return mapa;
}

/** O nome da cor para a tela ("Azul (Wi-Fi e fibra óptica)"); sem cor, o nome do grupo. */
export function planSheetColorLabel(row: Pick<PlanSheetRow, "color" | "groupName">): string {
  if (!row.color) return row.groupName ?? "Sem cor";
  const cor = EDITORIAL_GROUP_COLOR_LABELS[row.color];
  return row.groupName && row.groupName !== cor ? `${cor} (${row.groupName})` : cor;
}

/* ----------------------------------------------------- trocar principal */

export type PlanSwapCandidate = {
  keywordId: string;
  keyword: string;
  volume: number | null;
  lenses: number | null;
  /** A própria keyword que carrega o Assunto (pode voltar a ser a principal). */
  subjectKeyword: boolean;
  reason: string;
};

/**
 * As candidatas a principal de UM artigo do plano com trava LIVRE (SDD §9.2):
 * a própria keyword do Assunto (quando ela não é a principal atual) e as
 * sustentações COM VOLUME medido da lista do Assunto (Pesquisa por Assunto),
 * não publicadas, recebidas e sem artigo de outro Assunto. Ordem: mais lentes
 * de SERP no cache, depois mais volume. A MESMA regra roda na tela (para a
 * escolha) e no servidor (que recusa candidata fora dela).
 */
export function planPrincipalSwapCandidates(input: {
  brandId: string;
  subjectRow: RecordLike;
  rows: readonly RecordLike[];
  currentPrincipalId: string | null;
  keywordIdsInOtherArticles?: ReadonlySet<string>;
  lensesOf?: (keywordId: string) => number | null;
  now: Date;
}): { ok: true; candidates: PlanSwapCandidate[] } | { ok: false; reason: string } {
  const standing = readArchitectSubjectStanding(input.subjectRow);
  if (!standing.plan || !standing.declared || standing.brandId !== input.brandId) return { ok: false, reason: "Trocar principal vale só para artigo do plano (Assunto com plano, desta marca)." };
  const lock = planLockOfStanding(standing);
  if (lock?.state === "locked") return { ok: false, reason: `${PLAN_SHEET_LOCKED_SEAL} (${lock.label}).` };
  const subjectId = standing.keywordId;
  const porId = new Map(input.rows.map(row => [String(row.id ?? ""), row]));
  const candidates: PlanSwapCandidate[] = [];
  if (input.currentPrincipalId && input.currentPrincipalId !== subjectId) {
    const volume = volumeView(input.subjectRow, input.now);
    candidates.push({ keywordId: subjectId, keyword: String(input.subjectRow.keyword ?? "").trim(), volume: volume.state === "measured" ? volume.value : null, lenses: input.lensesOf?.(subjectId) ?? null, subjectKeyword: true, reason: "A keyword que carrega o Assunto volta a ser a principal." });
  }
  for (const suggestion of subjectList({ brandId: input.brandId, row: input.subjectRow, keywords: input.rows })) {
    if (suggestion.keywordId === input.currentPrincipalId || input.keywordIdsInOtherArticles?.has(suggestion.keywordId)) continue;
    const row = porId.get(suggestion.keywordId);
    if (!row || row.isPublished) continue;
    const volume = volumeView(row, input.now);
    if (volume.state !== "measured" || !(volume.value && volume.value > 0)) continue;
    candidates.push({ keywordId: suggestion.keywordId, keyword: suggestion.keyword, volume: volume.value, lenses: input.lensesOf?.(suggestion.keywordId) ?? null, subjectKeyword: false, reason: suggestion.reason });
  }
  candidates.sort((a, b) => (b.lenses ?? -1) - (a.lenses ?? -1) || (b.volume ?? -1) - (a.volume ?? -1) || a.keyword.localeCompare(b.keyword, "pt-BR"));
  return { ok: true, candidates };
}

/** A frase de uma candidata no seletor: "keyword · volume 320 · 4/4 lentes". */
export function planSwapCandidateLabel(candidate: PlanSwapCandidate): string {
  const partes = [candidate.keyword, candidate.volume !== null ? `volume ${number(candidate.volume)}` : "sem volume", candidate.lenses !== null ? `${candidate.lenses}/4 lentes` : null, candidate.subjectKeyword ? "a do Assunto" : null];
  return partes.filter(Boolean).join(" · ");
}

/* -------------------------------------------------------------- prévias */

export type PlanSheetRefusal = { keywordId: string; keyword: string; reason: string };

/**
 * VALIDAR SERP — quem vai ao plano de custo, quem já está completo (sem custo)
 * e quem fica fora com o motivo. O servidor confere o volume de novo no banco
 * (`onlyMeasuredVolume`): esta separação só evita pedir o que já se sabe.
 */
export function planSheetSerpSelection(rows: readonly PlanSheetRow[]): { toPlan: PlanSheetRow[]; known: PlanSheetRefusal[]; refused: PlanSheetRefusal[] } {
  const toPlan: PlanSheetRow[] = [], known: PlanSheetRefusal[] = [], refused: PlanSheetRefusal[] = [];
  for (const row of rows) {
    if (row.volume.state !== "measured" || !(row.volume.value && row.volume.value > 0)) refused.push({ keywordId: row.keywordId, keyword: row.keyword, reason: "Sem volume medido no Minerador: a SERP não é coletada para keyword sem volume (meça no Minerador, botão Volume)." });
    else if (row.serp.state === "complete") known.push({ keywordId: row.keywordId, keyword: row.keyword, reason: `Já temos as 4 lentes no cache${row.serp.collectedAt ? ` (${dateLabel(row.serp.collectedAt)})` : ""}: nada a pagar.` });
    else toPlan.push(row);
  }
  return { toPlan, known, refused };
}

/**
 * CONCLUIR FORMAÇÃO / TROCAR PRINCIPAL — o recorte por grupo que a melhoria
 * prepara (um `prepare` por grupo, com `targetIds`), e as recusas que já se
 * sabem sem ir ao servidor.
 */
export function planSheetFormationSelection(rows: readonly PlanSheetRow[], action: "concludeFormation" | "swapPrincipal"): { byGroup: Map<string, PlanSheetRow[]>; refused: PlanSheetRefusal[] } {
  const byGroup = new Map<string, PlanSheetRow[]>();
  const refused: PlanSheetRefusal[] = [];
  for (const row of rows) {
    // 2026-10-14 · a keyword presa no artigo de outro Assunto: só esta linha é recusada, com o caminho; as outras seguem.
    const recusa = row.conflict ? row.conflict.sentence
      : action === "swapPrincipal" && row.lock.state !== "free"
      ? row.lock.state === "locked" ? `${PLAN_SHEET_LOCKED_SEAL} (${row.lock.label}).` : "Sem principal declarada no plano: não há trava livre para trocar."
      : row.formation.state === "awaiting_principal" ? `${row.formation.label}: aprove-a no Minerador e envie.`
      : !row.territoryRef ? "Sem Silo: em Silos, “Processar arquitetura” leva as keywords do plano para o Silo do plano; confirme o Silo e volte aqui."
      : !row.groupId ? "Sem grupo (cor): a formação do plano é recortada pelo grupo."
      : null;
    if (recusa) { refused.push({ keywordId: row.keywordId, keyword: row.keyword, reason: recusa }); continue; }
    byGroup.set(row.groupId!, [...(byGroup.get(row.groupId!) ?? []), row]);
  }
  return { byGroup, refused };
}

/** O resultado de UMA linha na prévia da formação (a execução preparada pela melhoria). */
export type PlanSheetPreviewLine = {
  keywordId: string;
  kind: "will_write" | "adequate" | "needs_minerador" | "needs_serp" | "refused";
  sentence: string;
  principalFrom: string | null;
  principalTo: string | null;
};

type RunLike = {
  proposals: readonly Pick<ImprovementProposal, "targetId" | "status" | "reasons" | "principalId" | "currentPrimaryId" | "memberIds" | "needsValidation" | "needsMinerador">[];
  keywords?: readonly { id: string; keyword: string }[];
  refusedTargets?: readonly { id: string; reason: string }[];
};

/**
 * A prévia por linha, lida da execução preparada (`prepare`, grátis). Pronta e
 * sem Minerador = vai gravar; "Precisa do Minerador" e "precisa validar a SERP"
 * são recusas desta confirmação com o caminho; o resto é recusa com o último
 * motivo do núcleo.
 */
/** O motivo genérico do núcleo para todo Assunto: não explica a recusa da linha. */
const GENERIC_SUBJECT_REASON = /^Assunto declarado mantido como fundamento/;

export function planSheetPreviewLines(run: RunLike, rows: readonly (Pick<PlanSheetRow, "keywordId" | "keyword" | "formation"> & Partial<Pick<PlanSheetRow, "volume" | "lock" | "supports">>)[]): PlanSheetPreviewLine[] {
  const nome = (id: string | null) => !id ? null : rows.find(row => row.keywordId === id)?.keyword ?? run.keywords?.find(keyword => keyword.id === id)?.keyword ?? id;
  return rows.map(row => {
    const recusada = run.refusedTargets?.find(item => item.id === row.keywordId);
    if (recusada) return { keywordId: row.keywordId, kind: "refused", sentence: recusada.reason, principalFrom: null, principalTo: null };
    const proposta = run.proposals.find(item => item.targetId === row.keywordId);
    if (!proposta) return { keywordId: row.keywordId, kind: "refused", sentence: "O núcleo da formação não devolveu proposta para esta linha.", principalFrom: null, principalTo: null };
    const de = nome(proposta.currentPrimaryId), para = nome(proposta.principalId);
    const ultimo = proposta.reasons[proposta.reasons.length - 1] ?? "";
    if (proposta.needsMinerador) return { keywordId: row.keywordId, kind: "needs_minerador", sentence: ultimo, principalFrom: de, principalTo: para };
    if (proposta.needsValidation) return { keywordId: row.keywordId, kind: "needs_serp", sentence: `Falta SERP da composição: use “${PLAN_SHEET_ACTION_LABELS.validateSerp}” (o custo aparece antes). ${ultimo}`.trim(), principalFrom: de, principalTo: para };
    if (proposta.status === "ready") {
      const troca = para && de !== para ? ` · principal: ${de ?? "nenhuma"} → ${para}` : para ? ` · principal: ${para}` : "";
      const versao = row.formation.version ? `nova versão (v${row.formation.version + 1})` : "primeiro ArticleDNA (v1)";
      return { keywordId: row.keywordId, kind: "will_write", sentence: `Vai gravar: ${versao}${troca} · ${proposta.memberIds.length} keyword(s).`, principalFrom: de, principalTo: para };
    }
    if (proposta.status === "adequate") return { keywordId: row.keywordId, kind: "adequate", sentence: "Já formado e adequado: nada a gravar.", principalFrom: de, principalTo: para };
    const util = [...proposta.reasons].reverse().find(reason => !GENERIC_SUBJECT_REASON.test(reason));
    const semVolume = row.volume && row.volume.state !== "measured";
    const dica = semVolume
      ? row.lock?.state === "free" && (row.supports?.withVolume ?? 0) > 0
        ? `A keyword do Assunto não tem volume medido: com a trava Livre, use “${PLAN_SHEET_ACTION_LABELS.swapPrincipal}” para uma sustentação com volume, ou “${PLAN_SHEET_ACTION_LABELS.validateSerp}” nas sustentações antes.`
        : "A keyword do Assunto não tem volume medido e nenhuma sustentação com volume e SERP no cache sustenta o artigo: meça no Minerador (Volume) ou traga sustentações pela Pesquisa por Assunto."
      : `Sem evidência suficiente para formar agora (SERP da composição no cache): use “${PLAN_SHEET_ACTION_LABELS.validateSerp}” e prepare de novo.`;
    return { keywordId: row.keywordId, kind: "refused", sentence: util ?? dica, principalFrom: de, principalTo: para };
  });
}

/** O resultado de UMA linha depois de gravar (o desfecho relido pelo núcleo). */
export function planSheetOutcomeSentence(outcome: { status: "improved" | "dna_created" | "unchanged" | "insufficient_evidence" | "failed"; message: string } | undefined): { tone: "success" | "neutral" | "warning"; text: string } {
  if (!outcome) return { tone: "warning", text: "Não foi gravado nesta execução." };
  if (outcome.status === "improved" || outcome.status === "dna_created") return { tone: "success", text: outcome.message };
  if (outcome.status === "unchanged") return { tone: "neutral", text: outcome.message };
  return { tone: "warning", text: outcome.message };
}

/* ------------------------------------------- uma lista só (2026-10-14) */

/**
 * O ASSUNTO DO PLANO DE UMA KEYWORD (caso WifiConecta, 2026-10-14). A linha da
 * cópia de trabalho cuja principal é keyword do plano — a própria keyword do
 * Assunto ou a principal declarada dele — é ARTIGO DO PLANO: o Assunto dela é
 * o do plano, mesmo antes do ArticleDNA. Só o pacote aprovado desta marca vale
 * (o mesmo critério da linha da planilha). Sem plano, `null`.
 */
export function planSubjectOfKeyword(input: {
  keywordId: string | null | undefined;
  brandId: string | null | undefined;
  standings: ReadonlyMap<string, ArchitectSubjectStanding>;
}): ArchitectSubjectStanding | null {
  if (!input.keywordId || !input.brandId) return null;
  const valida = (standing: ArchitectSubjectStanding | undefined): standing is ArchitectSubjectStanding => Boolean(standing && standing.plan && standing.declared && standing.received && standing.approvedPackageRef && standing.brandId === input.brandId);
  const propria = input.standings.get(input.keywordId);
  if (valida(propria)) return propria;
  for (const standing of input.standings.values()) {
    if (valida(standing) && standing.plan!.declaredPrincipal?.keywordId === input.keywordId) return standing;
  }
  return null;
}

/**
 * A LINHA DA MESA QUE A PLANILHA JÁ MOSTRA. Candidato da cópia de trabalho
 * (sem ArticleDNA, não publicado) cuja principal é keyword do plano: o artigo
 * do plano tem UMA linha só, a da planilha "Artigos do plano". A mesa não o
 * repete como linha solta — nada é apagado, o candidato continua na cópia de
 * trabalho. Com ArticleDNA, a linha da mesa volta (é lá que o artigo segue).
 */
export function planCandidateShownInSheet(input: {
  hasArticleDna: boolean;
  published: boolean;
  principalKeywordId: string | null | undefined;
  brandId: string | null | undefined;
  standings: ReadonlyMap<string, ArchitectSubjectStanding>;
}): boolean {
  if (input.hasArticleDna || input.published) return false;
  return planSubjectOfKeyword({ keywordId: input.principalKeywordId, brandId: input.brandId, standings: input.standings }) !== null;
}

/** A frase da mesa no lugar das linhas que a planilha já mostra. */
export function planCandidatesInSheetSentence(count: number): string {
  return `${count} artigo(s) do plano deste Silo ${count === 1 ? "está" : "estão"} na planilha “${PLAN_SHEET_TITLE}”, acima — uma linha por artigo, com Validar SERP e Concluir formação. Depois de formado, o artigo volta a aparecer aqui.`;
}

/* ----------------------------- uma tabela só, de novo (2026-10-14, tarde) */

/*
 * PEDIDO DO DONO (2026-10-14): "coloca só numa lista, não cria várias listas,
 * sem planilhas duplicadas (…) sumiram os botões de processo normal". A tabela
 * de artigos de sempre é a lista: o artigo do plano é uma LINHA dela, sob a
 * SiloPage do Silo do plano, na ordem do plano. Quando a mesa já tem o artigo
 * (candidato ou formado, cujo Assunto é a keyword do plano), é a linha dele que
 * ganha os selos do plano; sem artigo na mesa, a linha é a do plano. Os botões
 * da barra ("Processar artigos", "Concluir formação") valem para as duas: para
 * a linha do plano, o núcleo é o do plano (Validar SERP com custo antes;
 * Concluir formação pela melhoria recortada por grupo). Nenhuma regra nova.
 */

/** Um selo curto da linha do plano (trava, volume, SERP, formação, conflito). */
export type PlanRowSeal = {
  kind: "lock" | "volume" | "serp" | "formation" | "conflict";
  label: string;
  /** A frase inteira (o "por quê"), no `title` do selo. */
  title: string;
  tone: "neutral" | "muted" | "warning" | "positive";
};

/** Os selos curtos da linha do plano, na ordem da leitura. Só lê a linha. */
export function planRowSeals(row: Pick<PlanSheetRow, "lock" | "volume" | "serp" | "formation" | "conflict" | "supports">): PlanRowSeal[] {
  const selos: PlanRowSeal[] = [];
  selos.push(row.lock.state === "locked"
    ? { kind: "lock", label: "Travada", title: `${row.lock.label}. ${row.lock.why}`, tone: "muted" }
    : row.lock.state === "free"
      ? { kind: "lock", label: "Livre", title: `${row.lock.label}. ${row.lock.why}`, tone: "neutral" }
      : { kind: "lock", label: "Sem principal declarada", title: row.lock.why, tone: "muted" });
  const sustentacoes = row.supports.count > 0 ? ` ${row.supports.count} sustentação(ões) na lista do Assunto · ${row.supports.withVolume} com volume.` : "";
  selos.push(row.volume.state === "measured"
    ? { kind: "volume", label: `Vol. ${(row.volume.value ?? 0).toLocaleString("pt-BR")}`, title: `${row.volume.label}.${sustentacoes}`, tone: "neutral" }
    : row.volume.state === "no_average"
      ? { kind: "volume", label: "Sem média", title: `${row.volume.label}.${sustentacoes}`, tone: "muted" }
      : { kind: "volume", label: "Sem volume", title: `${row.volume.label}.${sustentacoes}`, tone: "muted" });
  const serp = row.serp.state === "complete" ? { label: "SERP 4/4", tone: "positive" as const }
    : row.serp.state === "partial" ? { label: `SERP ${row.serp.lenses}/4`, tone: "warning" as const }
    : row.serp.state === "none" ? { label: "Sem SERP", tone: "muted" as const }
    : row.serp.state === "loading" ? { label: "SERP…", tone: "muted" as const }
    : { label: "SERP não lida", tone: "muted" as const };
  selos.push({ kind: "serp", label: serp.label, title: row.serp.label, tone: serp.tone });
  if (row.conflict) selos.push({ kind: "conflict", label: PLAN_SHEET_CONFLICT_LABEL, title: row.conflict.sentence, tone: "warning" });
  else selos.push({ kind: "formation", label: row.formation.label, title: row.formation.label, tone: row.formation.state === "awaiting_principal" ? "warning" : row.formation.state === "formed" || row.formation.state === "in_radar" ? "positive" : "neutral" });
  return selos;
}

/** O rótulo curto do papel e da ordem: "Pilar · 9º", "Suporte · 11º". */
export function planRowRoleLabel(row: Pick<PlanSheetRow, "role" | "order">): string {
  return `${row.role} · ${row.order}º`;
}

/**
 * AS LINHAS DE UM GRUPO DA TABELA, NA ORDEM DO PLANO. Os artigos da mesa que
 * são do plano (o Assunto deles é a keyword de uma linha do plano) e as linhas
 * do plano sem artigo na mesa vêm primeiro, pela ordem do plano; os demais
 * artigos seguem depois, na ordem de sempre. Nada some: cada artigo e cada
 * linha do plano aparece uma vez.
 */
export type PlanGroupItem<A> =
  | { kind: "article"; key: string; article: A; planRow: PlanSheetRow | null }
  | { kind: "plan"; key: string; row: PlanSheetRow };

export function planOrderedGroupItems<A>(input: {
  articles: readonly A[];
  planRows: readonly PlanSheetRow[];
  idOf: (article: A) => string;
  planRowOf: (article: A) => PlanSheetRow | null;
}): PlanGroupItem<A>[] {
  const doPlano: { order: number; seq: number; item: PlanGroupItem<A> }[] = [];
  const demais: PlanGroupItem<A>[] = [];
  let seq = 0;
  for (const article of input.articles) {
    const planRow = input.planRowOf(article);
    const item: PlanGroupItem<A> = { kind: "article", key: input.idOf(article), article, planRow };
    if (planRow) doPlano.push({ order: planRow.order, seq: seq++, item });
    else demais.push(item);
  }
  for (const row of input.planRows) doPlano.push({ order: row.order, seq: seq++, item: { kind: "plan", key: `plan:${row.keywordId}`, row } });
  doPlano.sort((a, b) => a.order - b.order || a.seq - b.seq);
  return [...doPlano.map(entry => entry.item), ...demais];
}

/**
 * AS LINHAS DO PLANO QUE PRECISAM DE LINHA PRÓPRIA: as que nenhum artigo da
 * mesa representa (o Assunto de nenhum artigo é a keyword delas). As demais
 * aparecem como selos na linha do artigo — uma linha por artigo.
 */
export function planRowsWithoutArticle(rows: readonly PlanSheetRow[], representedKeywordIds: ReadonlySet<string>): PlanSheetRow[] {
  return rows.filter(row => !representedKeywordIds.has(row.keywordId));
}

/**
 * OS BOTÕES DA BARRA, PARA TODAS AS LINHAS. A seleção da tabela se divide em
 * duas: os artigos de sempre (o núcleo de sempre) e as linhas do plano — as
 * marcadas como linha própria e os artigos da mesa que são do plano (o núcleo
 * do plano). O dono vê um botão só.
 */
export function splitTableSelectionForPlan<A>(input: {
  articles: readonly A[];
  selectedArticleIds: ReadonlySet<string>;
  idOf: (article: A) => string;
  planRowOf: (article: A) => PlanSheetRow | null;
  planOnlyRows: readonly PlanSheetRow[];
  selectedPlanKeywordIds: ReadonlySet<string>;
}): { regularArticleIds: Set<string>; planTargets: PlanSheetRow[] } {
  const regularArticleIds = new Set<string>();
  const alvos = new Map<string, PlanSheetRow>();
  const naMesa = new Set<string>();
  for (const article of input.articles) {
    const id = input.idOf(article);
    naMesa.add(id);
    if (!input.selectedArticleIds.has(id)) continue;
    const planRow = input.planRowOf(article);
    if (planRow) alvos.set(planRow.keywordId, planRow);
    else regularArticleIds.add(id);
  }
  // Seleção de artigo que não está mais na mesa continua no escopo de sempre (quem recusa é o núcleo).
  for (const id of input.selectedArticleIds) if (!naMesa.has(id)) regularArticleIds.add(id);
  for (const row of input.planOnlyRows) if (input.selectedPlanKeywordIds.has(row.keywordId)) alvos.set(row.keywordId, row);
  return { regularArticleIds, planTargets: [...alvos.values()].sort((a, b) => a.order - b.order || a.keyword.localeCompare(b.keyword, "pt-BR")) };
}

/* -------------------------------------------------------- próximo passo */

export type PlanSheetNextStep = {
  action: "validateSerp" | "concludeFormation" | "withdraw" | "none";
  sentence: string;
  keywordIds: string[];
};

/**
 * O PRÓXIMO PASSO DA PLANILHA: uma frase e as linhas a que ele se aplica. A
 * ordem é a do trabalho: o que está preso em outro artigo é dito primeiro (só
 * o dono retira); depois a SERP das linhas com volume que ainda não têm as 4
 * lentes (custo antes); depois Concluir formação das que podem formar.
 */
export function planSheetNextStep(rows: readonly PlanSheetRow[]): PlanSheetNextStep | null {
  if (!rows.length) return null;
  const presas = rows.filter(row => row.conflict && row.formation.state === "conflict");
  const formaveis = rows.filter(row => !row.conflict && (row.formation.state === "awaiting"));
  const semSerp = formaveis.filter(row => row.volume.state === "measured" && (row.volume.value ?? 0) > 0 && (row.serp.state === "none" || row.serp.state === "partial"));
  const aviso = presas.length ? ` ${presas.length} linha(s) presa(s) em outro artigo: “${SILO_ARTICLE_WITHDRAWAL_ACTION_LABEL}” na linha, decisão sua.` : "";
  if (semSerp.length) return { action: "validateSerp", sentence: `${PLAN_SHEET_ACTION_LABELS.validateSerp} de ${semSerp.length} linha(s) com volume sem as 4 lentes (o custo aparece antes de pagar).${aviso}`, keywordIds: semSerp.map(row => row.keywordId) };
  if (formaveis.length) return { action: "concludeFormation", sentence: `${PLAN_SHEET_ACTION_LABELS.concludeFormation} de ${formaveis.length} linha(s) (prévia grátis antes de gravar).${aviso}`, keywordIds: formaveis.map(row => row.keywordId) };
  if (presas.length) return { action: "withdraw", sentence: `${presas.length} linha(s) presa(s) em outro artigo: use “${SILO_ARTICLE_WITHDRAWAL_ACTION_LABEL}” na linha (prévia e decisão sua); depois, Concluir formação.`, keywordIds: presas.map(row => row.keywordId) };
  return { action: "none", sentence: "Os artigos do plano desta cor estão formados (ou aguardam a principal declarada). Sigam pela mesa, abaixo.", keywordIds: [] };
}

/* ---------------------------------------------- erro do servidor, humano */

/**
 * O ERRO DO SERVIDOR EM FRASE HUMANA, com o que fazer (2026-10-14: "travou,
 * sem poder avançar"). Recusa de negócio (409/422) já vem humana e passa como
 * está; tempo esgotado, sessão e falha do servidor ganham a frase e o caminho.
 */
export function planSheetServerErrorSentence(input: { status: number; error?: string | null; code?: string | null }): string {
  const erro = text(input.error);
  const humana = erro && /\s/.test(erro) && /[a-zà-ú]/.test(erro) ? erro.replace(/^[A-Z][A-Z0-9_]{3,}:\s*/, "") : null;
  if (erro === "TEMPO_ESGOTADO" || input.status === 504 || input.status === 0) return "O servidor demorou demais para responder. O que já foi feito ficou salvo e nada é pago duas vezes: toque de novo no mesmo botão para continuar.";
  if (input.status === 401 || input.status === 403) return "A sessão expirou ou não tem permissão no Arquiteto desta marca. Entre de novo e repita; nada foi gravado por esta etapa.";
  if (input.status >= 500) return `O servidor falhou nesta etapa (erro ${input.status})${humana ? `: ${humana}` : ""}. Nada foi gravado por ela; tente de novo em instantes. Se repetir, recarregue a página — as linhas já gravadas continuam gravadas.`;
  return humana ?? "A etapa não foi confirmada pelo servidor. Nada foi gravado por ela; tente de novo.";
}
