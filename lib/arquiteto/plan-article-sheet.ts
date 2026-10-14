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

type RecordLike = Record<string, unknown>;

/* --------------------------------------------------------------- rótulos */

export const PLAN_SHEET_TITLE = "Artigos do plano";
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
  state: "awaiting" | "awaiting_principal" | "formed" | "in_radar";
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
};

/** O artigo já formado, na forma mínima que a planilha precisa (da mesa, versão vigente). */
export type PlanSheetArticle = {
  articleId: string;
  versionNumber: number;
  subjectKeywordId: string | null;
  principalKeywordId: string | null;
  keywordIds: readonly string[];
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

function formationView(input: { keywordId: string; standing: ArchitectSubjectStanding; articles: readonly PlanSheetArticle[]; radarArticleIds: ReadonlySet<string>; receivedIds: ReadonlySet<string> }): PlanSheetFormationView {
  const article = input.articles.filter(item => item.subjectKeywordId === input.keywordId).sort((a, b) => b.versionNumber - a.versionNumber)[0];
  if (article) {
    if (input.radarArticleIds.has(article.articleId)) return { state: "in_radar", version: article.versionNumber, articleId: article.articleId, principalKeywordId: article.principalKeywordId, label: `No Radar · v${article.versionNumber}` };
    return { state: "formed", version: article.versionNumber, articleId: article.articleId, principalKeywordId: article.principalKeywordId, label: `Formado · v${article.versionNumber}` };
  }
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
    const formation = formationView({ keywordId, standing, articles: input.articles, radarArticleIds: input.radarArticleIds, receivedIds });
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
    const recusa = action === "swapPrincipal" && row.lock.state !== "free"
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
