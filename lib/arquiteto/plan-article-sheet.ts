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
import { articleKeywordIndex, inheritArticleGroup } from "../editorial/article-groups.ts";
import type { ImprovementProposal } from "./article-improvement.ts";
import { SILO_ARTICLE_WITHDRAWAL_ACTION_LABEL } from "./silo-article-withdrawal.ts";
import { identityPrincipalSerpSentence, serpCollectionAllowed, serpIdentityPrincipalCheck, serpIdentityRowOf, type SerpIdentityArticle } from "./article-batch-serp.ts";

type RecordLike = Record<string, unknown>;

/* --------------------------------------------------------------- rótulos */

/* 2026-10-16 · saíram PLAN_SHEET_TITLE, PLAN_SHEET_ANCHOR e o rótulo do painel "recolhido": serviam à planilha separada "Artigos do plano", que não existe mais (os artigos do plano são linhas da tabela de artigos). */
export const PLAN_SHEET_ACTION_LABELS = {
  validateSerp: "Validar SERP",
  swapPrincipal: "Procurar outra principal",
  concludeFormation: "Concluir formação",
} as const;
export type PlanSheetAction = keyof typeof PLAN_SHEET_ACTION_LABELS;
/**
 * O selo da linha travada (o botão "Trocar principal" não aparece). 2026-10-14
 * (noite) · pedido do dono: um selo curto — o porquê fica no `title`, não
 * repetido em cada linha.
 */
export const PLAN_SHEET_LOCKED_SEAL = "Travada";
export const PLAN_SHEET_LENSES = 4;

/*
 * 2026-10-16 (noite) · teste do dono na WifiConecta (amarelo): as 4 Livres
 * MEDIDAS no Google Ads sem média oficial ouviam "meça no Minerador (Volume)" —
 * falso, o volume já foi medido. A régua é a de sempre (`readPlanRowVolume`:
 * `measured` · `no_average` · `missing`); a frase muda com ela. E em linguagem
 * simples (pedido do dono): "sem média" = "sem número de buscas".
 */
/** O Google Ads respondeu sem número de buscas (a "sem média" de antes), numa frase. */
export const PLAN_NO_SEARCHES_SENTENCE = "O Google Ads não tem número de buscas para esta keyword (zero ou poucas buscas)";
/** O mesmo, curto (o rótulo do volume e do alerta da linha). */
export const PLAN_NO_SEARCHES_SHORT = "Google Ads sem número de buscas (zero ou poucas)";
/** O caminho grátis das sustentações com volume, no Minerador (o botão de sempre do perfil da keyword). */
export const PLAN_SUPPORT_SEARCH_PATH = "Minerador → perfil da keyword → “Buscar sustentação”, grátis";

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
  /** 2026-10-14 · de onde veio o volume validado (aditivo; ausente nas leituras antigas). */
  origin?: "google_ads" | "subject_search" | null;
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
  /**
   * 2026-10-17 · a keyword da linha é a principal de identidade do artigo (a
   * régua de T12 lida dos dados, `serpIdentityPrincipalCheck`): sem volume, só
   * ela tem a SERP coletada no "Validar SERP". Aditivo; ausente = não é.
   */
  identityPrincipal?: boolean;
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

/**
 * 2026-10-14 (noite) · A REGRA DA PRINCIPAL, NAS PALAVRAS DO DONO: "primeira
 * coisa que tem que olhar é o volume: se já está definido, não pode trocar
 * mesmo que só tenha 10 de volume; e depois tem que olhar se essa keyword é
 * livre ou já está travada: travado não muda, livre pode procurar por outra
 * similar e trocar". Volume definido NO DNA (qualquer volume validado: botão
 * Volume do Minerador ou a média do Google Ads gravada pela Pesquisa por
 * Assunto com recibo) fixa a principal antes de qualquer trava; só sem volume
 * a trava decide. A trava gravada não muda (o Arquiteto só lê).
 */
function lockView(standing: ArchitectSubjectStanding, volume?: PlanSheetVolumeView): PlanSheetLockView {
  const lock = planLockOfStanding(standing);
  if (!lock) return { state: "none", label: "Sem principal declarada", why: "O plano não declara a principal deste artigo: a formação escolhe pela SERP e pelo volume, com decisão humana." };
  if (volume && volume.state === "measured" && (volume.value ?? 0) > 0) {
    return { state: "locked", label: "Travada · volume definido", why: `Volume definido no DNA (${volume.label}): a principal fica, mesmo com volume baixo. Volume definido não se troca.` };
  }
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
    : planRowHasNoSearches(volume)
      ? `${PLAN_NO_SEARCHES_SENTENCE}: a principal está livre e pode ser trocada por uma sustentação com volume da lista do Assunto (decisão humana, nova versão).`
      : "Sem volume medido: a principal está livre e pode ser trocada por uma sustentação com volume da lista do Assunto (decisão humana, nova versão).";
  return { state: "free", label: lock.label, why };
}

const objeto = (value: unknown): RecordLike | null => value && typeof value === "object" && !Array.isArray(value) ? value as RecordLike : null;

/** A origem curta do volume validado: o botão Volume do Minerador ou a Pesquisa por Assunto (recibo). */
export const PLAN_VOLUME_ORIGIN_LABELS = { google_ads: "Google Ads", subject_search: "Pesquisa por Assunto" } as const;

/**
 * 2026-10-14 (noite) · VOLUME DO DNA É VOLUME (pedido do dono: "ele não
 * reconhece o volume"). A leitura de sempre (`readKnownVolume`: coluna +
 * medição gravada) e, quando a linha da mesa veio do ArticleDNA (sem
 * `volume_source` nem `analise_semantica`), a evidência de demanda do Google
 * Ads que a referência do DNA carrega (`demandEvidence.googleAds`). A média
 * gravada pela Pesquisa por Assunto (origem `subject_search`, recibo) é
 * medição do Google Ads como qualquer outra. Volume de outro provider (outra
 * era) continua "Sem volume medido" — nunca "outra fonte".
 */
export function readPlanRowVolume(row: RecordLike, now: Date): PlanSheetVolumeView {
  const semantic = objeto(row.analise_semantica);
  const origemDaMedicao = objeto(semantic?.volume_measurement)?.origin === "subject_search" ? "subject_search" as const : "google_ads" as const;
  const known = readKnownVolume({ volume_search: row.volume_search, volume_source: row.volume_source, analise_semantica: semantic }, now);
  const medido = (value: number, measuredAt: string | null, origin: "google_ads" | "subject_search"): PlanSheetVolumeView => {
    const data = dateLabel(measuredAt);
    return { state: "measured", value, measuredAt, origin, label: `${number(value)}${data ? ` · medido em ${data}` : ""} · ${PLAN_VOLUME_ORIGIN_LABELS[origin]}` };
  };
  if (known.state === "measured") return medido(known.volume, known.measuredAt, origemDaMedicao);
  // 2026-10-16 (noite) · pedido do dono: linguagem simples — "sem média" virou "sem número de buscas".
  if (known.state === "no_average") return { state: "no_average", value: null, measuredAt: known.measuredAt, origin: null, label: `${PLAN_NO_SEARCHES_SHORT} (medido em ${dateLabel(known.measuredAt) ?? "data recente"})` };
  // A linha que veio do ArticleDNA: a evidência do Google Ads da referência (a mesma medição do Minerador).
  const ads = objeto(objeto(row.demandEvidence)?.googleAds);
  const media = typeof ads?.averageMonthlySearches === "number" && Number.isFinite(ads.averageMonthlySearches) && ads.averageMonthlySearches >= 0 ? ads.averageMonthlySearches : null;
  const quando = typeof ads?.measuredAt === "string" && Number.isFinite(Date.parse(ads.measuredAt)) ? ads.measuredAt : null;
  if (ads && (ads.source === undefined || ads.source === "google_ads") && media !== null && quando) return medido(media, quando, "google_ads");
  return { state: "missing", value: null, measuredAt: known.measuredAt, origin: null, label: "Sem volume medido" };
}

function volumeView(row: RecordLike, now: Date): PlanSheetVolumeView {
  return readPlanRowVolume(row, now);
}

/** A trava efetiva da linha do plano pela regra do dono (volume definido primeiro, depois a trava). */
export function planSheetLockOf(standing: ArchitectSubjectStanding, volume: PlanSheetVolumeView): PlanSheetLockView {
  return lockView(standing, volume);
}

/**
 * A keyword foi MEDIDA e o Google Ads não tem número de buscas para ela (a
 * resposta "sem média" de menos de 30 dias, ou a medição que deu zero). A
 * mesma régua de `readPlanRowVolume` — nenhuma outra.
 */
export function planRowHasNoSearches(volume: Pick<PlanSheetVolumeView, "state" | "value"> | null | undefined): boolean {
  if (!volume) return false;
  return volume.state === "no_average" || (volume.state === "measured" && !((volume.value ?? 0) > 0));
}

/** O caminho de quem foi medida sem número de buscas, pela trava: Livre troca ou busca sustentação; Travada só busca sustentação. */
function planNoSearchesPath(lockState: PlanSheetLockView["state"] | null | undefined): string {
  if (lockState === "free") return `Como ela é Livre, use “${PLAN_SHEET_ACTION_LABELS.swapPrincipal}” ou traga sustentações com volume (${PLAN_SUPPORT_SEARCH_PATH}).`;
  if (lockState === "locked") return `Como ela é Travada, a principal fica: traga sustentações com volume (${PLAN_SUPPORT_SEARCH_PATH}).`;
  return `Traga sustentações com volume (${PLAN_SUPPORT_SEARCH_PATH}).`;
}

/**
 * A FRASE DA LINHA SEM VOLUME, pelo estado do volume e pela trava (2026-10-16, noite):
 *  (a) nunca medida → "meça no Minerador (Volume)" (como antes);
 *  (b) medida sem número de buscas e Livre → "Procurar outra principal" ou
 *      sustentações pelo "Buscar sustentação" do Minerador (grátis);
 *  (c) medida sem número de buscas e Travada → só as sustentações.
 * `null` quando a linha tem volume. Uma frase só para a prévia do Concluir,
 * o Validar SERP e o alerta da linha.
 */
export function planRowWithoutVolumeSentence(row: { volume: Pick<PlanSheetVolumeView, "state" | "value">; lock?: Pick<PlanSheetLockView, "state"> | null; supports?: Pick<PlanSheetRow["supports"], "withVolume"> | null }): string | null {
  if (row.volume.state === "measured" && (row.volume.value ?? 0) > 0) return null;
  if (planRowHasNoSearches(row.volume)) return `${PLAN_NO_SEARCHES_SENTENCE}. ${planNoSearchesPath(row.lock?.state)}`;
  return row.lock?.state === "free" && (row.supports?.withVolume ?? 0) > 0
    ? `A keyword do Assunto não tem volume medido: com a trava Livre, use “${PLAN_SHEET_ACTION_LABELS.swapPrincipal}” para uma sustentação com volume, ou “${PLAN_SHEET_ACTION_LABELS.validateSerp}” nas sustentações antes.`
    : "A keyword do Assunto não tem volume medido e nenhuma sustentação com volume e SERP no cache sustenta o artigo: meça no Minerador (Volume) ou traga sustentações pela Pesquisa por Assunto.";
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
  /** 2026-10-15 · `planVersion` (aditivo): a versão vigente do plano do grupo — a única que a linha diz. */
  groupOf: (groupId: string) => { color: string; name: string; planVersion?: number } | null;
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
  // 2026-10-17 · a régua única da coleta: a principal de identidade (mesma função do servidor), lida do pacote e dos artigos.
  const linhasDaRegua = new Map(input.keywords.map(item => [String(item.id ?? ""), serpIdentityRowOf(item)]));
  const artigosDaRegua: SerpIdentityArticle[] = input.articles.map(article => ({ principalKeywordId: article.principalKeywordId, subjectKeywordId: article.subjectKeywordId, keywordIds: article.keywordIds, subjectPhrase: article.subjectPhrase ?? null }));
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
    const volume = volumeView(keyword, input.now);
    rows.push({
      keywordId,
      keyword: String(keyword.keyword ?? "").trim(),
      title: standing.phrase,
      groupId,
      color,
      groupName: group?.name ?? null,
      order: plan.order,
      role: plan.role,
      // 2026-10-15 · as keywords guardam a versão em que cada uma entrou (2/3/4 na WifiConecta): vale a do grupo; nada é gravado nelas.
      planVersion: group?.planVersion ?? plan.planVersion,
      territoryRef: text(keyword.territoryRef),
      lock: lockView(standing, volume),
      volume,
      serp: serpView(keywordId, input.serp),
      formation,
      currentPrincipalId: formation.principalKeywordId ?? plan.declaredPrincipal?.keywordId ?? null,
      supports: { count: lista.length, withVolume: comVolume.length, withVolumeIds: comVolume },
      conflict,
      ...(!(volume.state === "measured" && (volume.value ?? 0) > 0) && serpIdentityPrincipalCheck({ keywordId, rowOf: id => linhasDaRegua.get(id), articles: artigosDaRegua }).identity ? { identityPrincipal: true } : {}),
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
  // A regra do dono: volume definido no DNA fixa a principal antes da trava; travada nunca muda.
  const lock = lockView(standing, volumeView(input.subjectRow, input.now));
  if (lock.state === "locked") return { ok: false, reason: `${PLAN_SHEET_LOCKED_SEAL} (${lock.label}). ${lock.why}` };
  if (lock.state !== "free") return { ok: false, reason: "Sem principal declarada no plano: não há trava livre para trocar." };
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
    // 2026-10-17 · a régua única da coleta: sem volume, só a principal de identidade do artigo (o servidor confere de novo).
    const comVolume = row.volume.state === "measured" && Boolean(row.volume.value && row.volume.value > 0);
    if (!serpCollectionAllowed({ volume: comVolume ? row.volume.value : null, identityPrincipal: row.identityPrincipal === true })) refused.push({ keywordId: row.keywordId, keyword: row.keyword, reason: planRowHasNoSearches(row.volume)
      ? `${PLAN_NO_SEARCHES_SENTENCE}: a SERP não é coletada para keyword sem volume que não é a principal de identidade do artigo. ${planNoSearchesPath(row.lock.state)}`
      : "Sem volume medido no Minerador: a SERP não é coletada para keyword sem volume que não é a principal de identidade do artigo (meça no Minerador, botão Volume)." });
    else if (row.serp.state === "complete") known.push({ keywordId: row.keywordId, keyword: row.keyword, reason: `Já temos as 4 lentes no cache${row.serp.collectedAt ? ` (${dateLabel(row.serp.collectedAt)})` : ""}: nada a pagar.` });
    else toPlan.push(row);
  }
  return { toPlan, known, refused };
}

/** A linha "vai coletar" da prévia do Validar SERP: a principal de identidade sem volume diz o propósito e o custo. */
export function planSheetSerpPlanLine(row: Pick<PlanSheetRow, "keyword" | "volume" | "serp"> & { identityPrincipal?: boolean }): string {
  const faltam = Math.max(0, PLAN_SHEET_LENSES - row.serp.lenses);
  const comVolume = row.volume.state === "measured" && Boolean(row.volume.value && row.volume.value > 0);
  if (!comVolume && row.identityPrincipal) return identityPrincipalSerpSentence(row.keyword, { queries: faltam, neverMeasured: row.volume.state === "missing" });
  return `Falta ${faltam} lente(s): coleta nas 4 lentes (cache primeiro).`;
}

/**
 * A linha do plano já formada não passa de novo por "Concluir formação"
 * (2026-10-16, restauração do fluxo de sempre): Concluir = formar; o reforço do
 * artigo formado com keywords de respaldo é o painel "Melhorar publicados…"
 * ("Melhorar publicados e formar Assuntos"), o mesmo núcleo, num lugar só.
 */
export const PLAN_SHEET_FORMED_REFUSAL_PATH = "para reforçar com keywords de respaldo, use “Melhorar publicados…” (prévia antes; custo dito antes de pagar)";
export function planSheetFormedRefusal(formationLabel: string): string {
  return `${formationLabel}: já formado — ${PLAN_SHEET_FORMED_REFUSAL_PATH}.`;
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
      // 2026-10-16 · Concluir formação FORMA (só a linha sem ArticleDNA); reforçar o artigo já formado é do painel "Melhorar publicados…", um lugar só.
      : action === "concludeFormation" && (row.formation.state === "formed" || row.formation.state === "in_radar") ? planSheetFormedRefusal(row.formation.label)
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
    // 2026-10-16 (noite) · a frase sai da régua de volume da linha: nunca medida, medida sem número de buscas (Livre ou Travada).
    const semVolume = row.volume ? planRowWithoutVolumeSentence({ volume: row.volume, lock: row.lock ?? null, supports: row.supports ?? null }) : null;
    const dica = semVolume ?? `Sem evidência suficiente para formar agora (SERP da composição no cache): use “${PLAN_SHEET_ACTION_LABELS.validateSerp}” e prepare de novo.`;
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
 * 2026-10-15 (caso WifiConecta, "corpo estranho") · AS KEYWORDS QUE O PLANO
 * DECLARA COMO ARTIGO: a keyword de cada Assunto do plano (pacote aprovado
 * desta marca) e a principal declarada dele. Pilar ou Suporte, é artigo por
 * decisão humana — a página do Silo é o Silo do plano, nunca uma delas.
 */
export function planArticleKeywordIds(input: {
  brandId: string | null | undefined;
  standings: ReadonlyMap<string, ArchitectSubjectStanding> | Iterable<ArchitectSubjectStanding>;
}): Set<string> {
  const ids = new Set<string>();
  if (!input.brandId) return ids;
  const lista = input.standings instanceof Map ? input.standings.values() : input.standings as Iterable<ArchitectSubjectStanding>;
  for (const standing of lista) {
    if (!standing.plan || !standing.declared || !standing.received || !standing.approvedPackageRef || standing.brandId !== input.brandId) continue;
    ids.add(standing.keywordId);
    if (standing.plan.declaredPrincipal?.keywordId) ids.add(standing.plan.declaredPrincipal.keywordId);
  }
  return ids;
}

/* 2026-10-16 · saíram `planCandidateShownInSheet` e `planCandidatesInSheetSentence` (a mesa que escondia o candidato atrás da planilha separada): sem consumidor desde "uma tabela só". */

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
      ? { kind: "volume", label: "Sem buscas", title: `${row.volume.label}.${sustentacoes}`, tone: "muted" }
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

/** A coluna "Definição do artigo" da linha do plano: o estado de verdade e o porquê curto. */
export type PlanRowDefinition = { label: string; reason: string | null; title: string; tone: "positive" | "neutral" | "warning" };

/**
 * 2026-10-16 (noite) · pedido do dono: "na lista ele nem reconheceu o Papel no
 * Silo, a Definição do artigo". Para a linha do plano (candidato ou artigo da
 * mesa), a Definição diz o estado lido da própria linha — "Formado · vN",
 * "No Radar · vN", "Aguardando formação" ou "Pendente" — com o porquê curto
 * (o inteiro vai no `title`). Só lê a linha; nada é gravado.
 */
export function planRowDefinition(row: Pick<PlanSheetRow, "formation" | "conflict" | "volume" | "lock" | "serp">): PlanRowDefinition {
  const formation = row.formation;
  if (formation.state === "formed" || formation.state === "in_radar") return { label: formation.label, reason: null, title: `ArticleDNA ${formation.version ? `v${formation.version}` : "gravado"} pelo plano.`, tone: "positive" };
  if (row.conflict || formation.state === "conflict") return { label: "Pendente", reason: "presa em outro artigo", title: row.conflict?.sentence ?? formation.label, tone: "warning" };
  if (formation.state === "awaiting_principal") return { label: "Pendente", reason: "aguarda a principal chegar ao Arquiteto", title: formation.label, tone: "warning" };
  const semVolume = planRowWithoutVolumeSentence({ volume: row.volume, lock: row.lock });
  if (semVolume) {
    const semBuscas = planRowHasNoSearches(row.volume);
    const reason = semBuscas
      ? row.lock.state === "free" ? `sem número de buscas · Livre: “${PLAN_SHEET_ACTION_LABELS.swapPrincipal}” ou sustentação` : "sem número de buscas · traga sustentação"
      : row.lock.state === "free" ? "sem volume medido · Livre: pode trocar" : "sem volume medido: meça no Minerador";
    return { label: "Aguardando formação", reason, title: semVolume, tone: "warning" };
  }
  if (row.serp.state === "none" || row.serp.state === "partial") return { label: "Aguardando formação", reason: "falta SERP: “Processar artigos”", title: `${row.serp.label}. Marque a linha e use “Processar artigos” (Validar SERP: custo antes, cache primeiro).`, tone: "warning" };
  if (row.serp.state === "complete") return { label: "Aguardando formação", reason: `pronta: “${PLAN_SHEET_ACTION_LABELS.concludeFormation}”`, title: `SERP 4/4 no cache: marque a linha e use “${PLAN_SHEET_ACTION_LABELS.concludeFormation}” (prévia antes).`, tone: "neutral" };
  return { label: "Aguardando formação", reason: null, title: formation.label, tone: "neutral" };
}

/* ------------------------------ o recorte da cor fora da tabela (2026-10-16) */

/**
 * 2026-10-16 (noite) · teste do dono (WifiConecta, `?grupo=amarelo`): as
 * contagens fora da tabela misturavam o azul com o amarelo. O RECORTE é o MESMO
 * que a tabela já usa: a keyword pelo grupo dela (sem etiqueta, o grupo do
 * plano dela); o artigo pelo grupo do plano do Assunto, senão a etiqueta
 * gravada do artigo, senão a herança (Assunto → principal → maioria). Sem cor
 * escolhida (`all`), a marca inteira, como sempre.
 */
export type EditorialGroupCut = {
  all: boolean;
  keyword: (keywordId: string) => boolean;
  article: (article: { articleId?: string | null; subjectKeywordId?: string | null; principalKeywordId?: string | null; keywordIds?: readonly (string | null | undefined)[] | null }) => boolean;
};

export function editorialGroupCut(input: {
  brandId: string | null | undefined;
  filter: EditorialGroupScreenFilter;
  keywordGroupById: ReadonlyMap<string, string | null>;
  standings: ReadonlyMap<string, ArchitectSubjectStanding>;
  /** A etiqueta gravada do artigo (`editorial_group_articles`), quando a tela sabe. */
  articleGroupOf?: (articleId: string) => string | null;
}): EditorialGroupCut {
  if (input.filter.kind === "all") return { all: true, keyword: () => true, article: () => true };
  // O grupo do plano de cada keyword do plano (a do Assunto e a principal declarada dele): a MESMA leitura de `planSubjectOfKeyword`, lida uma vez.
  const doPlano = new Map<string, string>();
  for (const keywordId of planArticleKeywordIds({ brandId: input.brandId, standings: input.standings })) {
    const grupo = planSubjectOfKeyword({ keywordId, brandId: input.brandId, standings: input.standings })?.plan?.groupId;
    if (grupo) doPlano.set(keywordId, grupo);
  }
  const planoDe = (keywordId: string) => doPlano.get(keywordId) ?? null;
  const grupoDaKeyword = (keywordId: string) => input.keywordGroupById.get(keywordId) || planoDe(keywordId) || null;
  const mapa = new Map<string, string | null>(input.keywordGroupById);
  for (const [keywordId, grupo] of doPlano) if (!mapa.get(keywordId)) mapa.set(keywordId, grupo);
  return {
    all: false,
    keyword: keywordId => editorialGroupFilterMatches(input.filter, grupoDaKeyword(keywordId)),
    article: article => {
      const assunto = article.subjectKeywordId && planoDe(article.subjectKeywordId) ? grupoDaKeyword(article.subjectKeywordId) : null;
      const gravado = article.articleId ? input.articleGroupOf?.(article.articleId) ?? null : null;
      const herdado = inheritArticleGroup(articleKeywordIndex({ articleId: article.articleId ?? "", principalKeywordId: article.principalKeywordId ?? null, subjectKeywordId: article.subjectKeywordId ?? null, keywordIds: article.keywordIds ?? [] }), mapa).groupId;
      return editorialGroupFilterMatches(input.filter, assunto ?? gravado ?? herdado);
    },
  };
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

/* 2026-10-16 · saiu `planSheetNextStep` (o "próximo passo" da planilha separada, sem consumidor na tela): os botões de sempre ficam no topo de "Detalhes técnicos" e cada linha diz o que falta. */

/* ------------------------------------- alertas da linha (2026-10-14, noite) */

/*
 * O que falta numa linha do plano é ALERTA curto (o porquê no `title`), nunca
 * bloqueio. 2026-10-16 · restauração do fluxo de sempre: a SERP das principais
 * é a de sempre — "Processar artigos" (Validar SERP das linhas do plano, custo
 * antes, cache primeiro); formar é "Concluir formação".
 */

/** Um alerta curto da linha do plano (o que falta), mostrado na linha. */
export type PlanRowAlert = { kind: "no_volume" | "no_serp" | "conflict" | "awaiting_principal"; label: string; title: string };

/** Os alertas da linha: só a keyword presa em outro artigo e a principal que não chegou ficam fora de "Concluir formação". */
export function planRowAlerts(row: Pick<PlanSheetRow, "lock" | "volume" | "serp" | "conflict" | "formation">): PlanRowAlert[] {
  const alertas: PlanRowAlert[] = [];
  const semVolume = !(row.volume.state === "measured" && (row.volume.value ?? 0) > 0);
  if (row.conflict) alertas.push({ kind: "conflict", label: "presa em outro artigo", title: row.conflict.sentence });
  if (row.formation.state === "awaiting_principal") alertas.push({ kind: "awaiting_principal", label: "aguarda a principal", title: row.formation.label });
  if (semVolume) {
    // 2026-10-16 (noite) · medida sem número de buscas não é "sem volume medido": o rótulo e o porquê dizem o que é.
    const semBuscas = planRowHasNoSearches(row.volume);
    const frase = planRowWithoutVolumeSentence({ volume: row.volume, lock: row.lock });
    alertas.push(row.lock.state === "free"
      ? { kind: "no_volume", label: semBuscas ? "sem número de buscas — livre, pode trocar" : "sem volume — livre, pode trocar", title: semBuscas ? `${row.volume.label}. ${frase}` : `${row.volume.label}. ${row.lock.why}` }
      : { kind: "no_volume", label: semBuscas ? "sem número de buscas — travada" : "sem volume — travada", title: semBuscas ? `${row.volume.label}. ${frase}` : `${row.volume.label}. ${row.lock.why}` });
  } else if (row.serp.state === "none" || row.serp.state === "partial") {
    alertas.push({ kind: "no_serp", label: row.serp.state === "partial" ? `SERP ${row.serp.lenses}/4 — completar em “Processar artigos”` : "sem SERP no cache — coletar em “Processar artigos”", title: `${row.serp.label}. Marque a linha e use “Processar artigos” (Validar SERP: custo antes, cache primeiro).` });
  }
  return alertas;
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
