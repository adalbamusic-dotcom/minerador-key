/**
 * D2.3 — VOLUME PRIMEIRO, E SUGESTÃO QUE O DONO SÓ CONFIRMA (2026-09-27).
 *
 * Palavras do dono: "se não tem volume, não presta" e "se for fazer
 * manualmente eu consigo formar os grupos, reforçar os meus artigos com essas
 * mesmas keywords ... só que isso me levaria muito tempo". O sistema faz o
 * trabalho pesado; o dono marca e confirma.
 *
 * Três respostas, todas puras (sem React, sem rede, sem storage):
 *
 *   1. O NÍVEL de uma keyword diante de um publicado ou Assunto:
 *        Forte     3 ou mais páginas em comum no top 10 (D2.2). Vem marcada.
 *        Provável  2 páginas em comum, OU 3 ou mais sites em comum (sem rede
 *                  social nem portal genérico), OU mesma entidade e mesmo
 *                  problema no DNA. Vem desmarcada.
 *
 *   2. As SUGESTÕES de reforço de cada publicado e Assunto: só com volume
 *      maior que zero (Google Ads sem média e estimativa zero ou vazia = sem
 *      volume), ordenadas por volume, com nível, volume e um motivo curto. A
 *      intenção que barra é a da SERP; a da Lógica, quando diverge, é aviso.
 *      Par em outro Silo entra na mesma lista, como proposta.
 *
 *   3. As OPORTUNIDADES com as sobras: agrupadas por tema (a SERP primeiro,
 *      as palavras quando falta SERP), nomeadas pela keyword de maior volume,
 *      ordenadas pelo volume somado, até 6 por grupo. Criar o artigo é ação
 *      explícita ("Criar artigo novo com este grupo"). Sobra sem volume fica
 *      recolhida no fim, com a contagem.
 *
 * Nada aqui grava. Aplicar é ato humano com confirmação e releitura, pelos
 * gravadores que a mesa já usa (formação e decisão de Silo).
 */
import { AFFINITY_FLOOR, MAX_ARTICLE_KEYWORDS, sameArticleAffinity, type ArticleFormationKeyword } from "./article-formation.ts";
import { logicDnaDivergence, serpAwareDnaBarrier, serpObservedDnaContradiction } from "./serp-subject-convergence.ts";
import { SERP_SUBJECT_THRESHOLDS, type SerpSubjectIndex, type SerpSubjectOverlap } from "./serp-subject-overlap.ts";

/* --------------------------------- volume --------------------------------- */

/** Sem volume = nulo, zero ou inválido. Só o que tem volume reforça (D2.3). */
export function hasSearchVolume(volume: number | null | undefined): volume is number {
  return typeof volume === "number" && Number.isFinite(volume) && volume > 0;
}

/* ---------------------------------- nível ---------------------------------- */

export const SERP_SUGGESTION_LEVELS = ["strong", "probable"] as const;
export type SerpSuggestionLevel = (typeof SERP_SUGGESTION_LEVELS)[number];

export const SERP_SUGGESTION_LEVEL_LABELS: Readonly<Record<SerpSuggestionLevel, string>> = Object.freeze({
  strong: "Forte",
  probable: "Provável",
});

/** "3 ou mais sites em comum" — sem os genéricos (`sharedDistinctiveDomainCount`). */
export const SERP_SUGGESTION_PROBABLE_DOMAINS = 3;

/**
 * `pages`      3+ páginas em comum (Forte);
 * `two_pages`  2 páginas em comum (Provável);
 * `domains`    3+ sites em comum que distinguem assunto (Provável);
 * `dna`        mesma entidade e mesmo problema no DNA (Provável).
 */
export type SerpSuggestionBasis = "pages" | "two_pages" | "domains" | "dna";

export type SerpSuggestionMatch = {
  level: SerpSuggestionLevel;
  basis: SerpSuggestionBasis;
  sharedPageCount: number;
  sharedDomainCount: number;
  overlap: SerpSubjectOverlap | null;
  /** O motivo curto, para a linha da lista. */
  reason: string;
  /** Com qual keyword da âncora (principal ou frase do Assunto). */
  measuredAgainstKeywordId: string;
};

const normal = (value: string | null | undefined) => String(value || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();

/** Mesma entidade e mesmo problema no DNA, os dois declarados e nenhum inconclusivo. */
export function sameEntityAndProblem(left: ArticleFormationKeyword, right: ArticleFormationKeyword): boolean {
  if (left.semanticState === "non_conclusive" || right.semanticState === "non_conclusive") return false;
  const entidade = normal(left.entity);
  const problema = normal(left.problem);
  return Boolean(entidade && problema && entidade === normal(right.entity) && problema === normal(right.problem));
}

/**
 * O nível de `candidate` diante de UMA keyword da âncora. `null` = nem Forte
 * nem Provável (a SERP diz que é outro assunto, ou não há sinal).
 */
export function serpSuggestionMatch(anchor: ArticleFormationKeyword, candidate: ArticleFormationKeyword, serp: SerpSubjectIndex | null): SerpSuggestionMatch | null {
  const overlap = serp ? serp.overlap(anchor.keywordId, candidate.keywordId) : null;
  const paginas = overlap && overlap.strength !== "unknown" ? overlap.sharedPageCount : 0;
  const sites = overlap?.sharedDistinctiveDomainCount ?? 0;
  const base = { sharedPageCount: paginas, sharedDomainCount: sites, overlap, measuredAgainstKeywordId: anchor.keywordId };
  if (overlap?.strength === "strong") {
    return { ...base, level: "strong", basis: "pages", reason: `${paginas} páginas em comum no top 10` };
  }
  if (paginas >= SERP_SUBJECT_THRESHOLDS.supportPages) {
    return { ...base, level: "probable", basis: "two_pages", reason: `${paginas} páginas em comum no top 10` };
  }
  if (sites >= SERP_SUGGESTION_PROBABLE_DOMAINS) {
    return { ...base, level: "probable", basis: "domains", reason: `${sites} sites em comum no top 10` };
  }
  // O DNA só fala quando a SERP não mede o par. Se a SERP mediu e deu 0 ou 1
  // página (sem sites em comum), o Google disse que é outro assunto (D2.2/A2).
  const serpMediu = Boolean(overlap && overlap.strength !== "unknown");
  if (!serpMediu && sameEntityAndProblem(anchor, candidate)) {
    return { ...base, level: "probable", basis: "dna", reason: "mesma entidade e mesmo problema no DNA (sem SERP para medir)" };
  }
  return null;
}

const pesoDoNivel = (match: SerpSuggestionMatch) => (match.level === "strong" ? 1000 : 0) + match.sharedPageCount * 10 + Math.min(match.sharedDomainCount, 9);

/** O melhor nível contra qualquer keyword da âncora (principal e frase do Assunto). */
export function bestSerpSuggestionMatch(anchors: readonly ArticleFormationKeyword[], candidate: ArticleFormationKeyword, serp: SerpSubjectIndex | null): SerpSuggestionMatch | null {
  let melhor: SerpSuggestionMatch | null = null;
  for (const anchor of anchors) {
    if (anchor.keywordId === candidate.keywordId) continue;
    const match = serpSuggestionMatch(anchor, candidate, serp);
    if (match && (!melhor || pesoDoNivel(match) > pesoDoNivel(melhor))) melhor = match;
  }
  return melhor;
}

/* ------------------------------- sugestões ------------------------------- */

/**
 * Onde a keyword sugerida está hoje.
 *
 * `leftover`       em Keywords não agrupadas, no mesmo Silo: pode entrar já;
 * `new_article`    num artigo novo calculado do mesmo Silo;
 * `other_article`  em outro publicado ou Assunto do mesmo Silo (tirar de lá é decisão sua);
 * `other_silo`     noutro Silo: primeiro muda de Silo (decisão de Silo), depois entra.
 */
export type AnchorSuggestionWhere = "leftover" | "new_article" | "other_article" | "other_silo";

export type AnchorSuggestion = {
  keywordId: string;
  keyword: string;
  volume: number;
  level: SerpSuggestionLevel;
  basis: SerpSuggestionBasis;
  sharedPageCount: number;
  sharedDomainCount: number;
  /** Curto: "7 páginas em comum no top 10". */
  reason: string;
  /** A Lógica diverge, a SERP não separa: só aviso. */
  warning: string | null;
  where: AnchorSuggestionWhere;
  /** "Keywords não agrupadas", "no artigo …", "Silo …". */
  whereLabel: string;
  siloRef: string | null;
  siloLabel: string | null;
  /** O artigo em que ela está hoje, quando está num. */
  inArticlePrincipalKeywordId: string | null;
  /** Vem marcada: Forte, no mesmo Silo, fora de artigo, e cabe nas vagas. */
  preselected: boolean;
};

export type SuggestionLocation = {
  siloRef: string | null;
  siloLabel: string | null;
  kind: "leftover" | "anchor_member" | "new_article" | "awaiting_subject" | "unknown";
  articleLabel?: string | null;
  articlePrincipalKeywordId?: string | null;
};

export const SUGGESTION_WHERE_LABELS: Readonly<Record<AnchorSuggestionWhere, string>> = Object.freeze({
  leftover: "fora de artigo",
  new_article: "em artigo novo calculado",
  other_article: "em outro artigo",
  other_silo: "em outro Silo",
});

/**
 * As sugestões de reforço de UM publicado ou Assunto, por volume.
 *
 * Entram: keywords da marca que não estão no artigo, com volume, sem ser
 * publicada nem Assunto declarado, sem decisão humana de formação noutro
 * artigo, e com nível Forte ou Provável. A intenção observada na SERP barra;
 * a da Lógica vira aviso (D2.3).
 */
export function suggestAnchorReinforcements(input: {
  siloRef: string;
  /** Principal do artigo e, no Assunto, a frase declarada. */
  measureAgainst: readonly ArticleFormationKeyword[];
  memberIds: readonly string[];
  keywords: ReadonlyMap<string, ArticleFormationKeyword>;
  serp: SerpSubjectIndex | null;
  locate: (keywordId: string) => SuggestionLocation;
  /** Assuntos declarados (troncos): nunca são reforço de outro artigo. */
  subjectDeclared?: ReadonlySet<string>;
  /** Vagas do artigo agora (teto de 6). */
  slotsLeft: number;
}): AnchorSuggestion[] {
  const noArtigo = new Set(input.memberIds);
  const ancoras = new Set(input.measureAgainst.map(item => item.keywordId));
  const lista: AnchorSuggestion[] = [];
  for (const keyword of input.keywords.values()) {
    if (noArtigo.has(keyword.keywordId) || ancoras.has(keyword.keywordId)) continue;
    if (keyword.isPublished || keyword.subjectHeldOut || keyword.subjectAnchored || input.subjectDeclared?.has(keyword.keywordId)) continue;
    // Decisão humana de formação noutro artigo não é desfeita por sugestão.
    if (keyword.humanFormationRef) continue;
    if (!hasSearchVolume(keyword.volume)) continue;
    // A SERP observada separa: não é sugestão (D5/D2.3).
    if (input.measureAgainst.some(anchor => serpObservedDnaContradiction(anchor, keyword))) continue;
    const match = bestSerpSuggestionMatch(input.measureAgainst, keyword, input.serp);
    if (!match) continue;
    // Sem SERP para medir, a Lógica ainda é o único sinal de intenção.
    if (input.measureAgainst.some(anchor => serpAwareDnaBarrier(anchor, keyword, input.serp))) continue;
    const divergencia = input.measureAgainst.map(anchor => logicDnaDivergence(anchor, keyword)).find(Boolean) ?? null;
    const lugar = input.locate(keyword.keywordId);
    const outroSilo = Boolean(lugar.siloRef && lugar.siloRef !== input.siloRef);
    const where: AnchorSuggestionWhere = outroSilo
      ? "other_silo"
      : lugar.kind === "anchor_member"
        ? "other_article"
        : lugar.kind === "new_article"
          ? "new_article"
          : "leftover";
    const whereLabel = where === "other_silo"
      ? `Silo "${lugar.siloLabel ?? "outro"}"`
      : (where === "other_article" || where === "new_article") && lugar.articleLabel
        ? `no artigo "${lugar.articleLabel}"`
        : SUGGESTION_WHERE_LABELS[where];
    lista.push({
      keywordId: keyword.keywordId,
      keyword: keyword.keyword,
      volume: keyword.volume,
      level: match.level,
      basis: match.basis,
      sharedPageCount: match.sharedPageCount,
      sharedDomainCount: match.sharedDomainCount,
      reason: match.reason,
      warning: divergencia
        ? match.basis === "domains"
          ? `${divergencia[0].toUpperCase()}${divergencia.slice(1)}: só aviso. Sem páginas em comum, confira antes de aplicar.`
          : `${divergencia[0].toUpperCase()}${divergencia.slice(1)}: só aviso, a intenção da SERP não separa.`
        : null,
      where,
      whereLabel,
      siloRef: lugar.siloRef,
      siloLabel: lugar.siloLabel,
      inArticlePrincipalKeywordId: lugar.articlePrincipalKeywordId ?? null,
      preselected: false,
    });
  }
  lista.sort((left, right) => right.volume - left.volume
    || (left.level === right.level ? 0 : left.level === "strong" ? -1 : 1)
    || right.sharedPageCount - left.sharedPageCount
    || left.keywordId.localeCompare(right.keywordId));
  // Forte e no mesmo Silo, fora de artigo: marcada, até as vagas (teto de 6).
  let vagas = Math.max(0, input.slotsLeft);
  for (const item of lista) {
    if (vagas <= 0) break;
    if (item.level === "strong" && item.where === "leftover") {
      item.preselected = true;
      vagas -= 1;
    }
  }
  return lista;
}

/** Quantas cabem de uma vez: as vagas do artigo, nunca mais que o teto. */
export function suggestionSelectionLimit(memberCount: number): number {
  return Math.max(0, MAX_ARTICLE_KEYWORDS - memberCount);
}

/* ------------------------------ oportunidades ------------------------------ */

export type LeftoverOpportunityMember = {
  keywordId: string;
  keyword: string;
  volume: number;
  /** Curto: como ela se liga à líder do grupo. */
  reason: string;
  warning: string | null;
};

export type LeftoverOpportunityGroup = {
  /** Estável: Silo + líder. */
  key: string;
  siloRef: string;
  siloLabel: string;
  /** A keyword de maior volume: dá nome ao grupo e é a principal proposta. */
  leaderKeywordId: string;
  name: string;
  totalVolume: number;
  /** Até 6, a líder primeiro, depois por volume. */
  members: LeftoverOpportunityMember[];
  /** Em que o grupo se apoia: SERP, palavras, ou keyword sozinha. */
  basis: "serp" | "words" | "single";
  reason: string;
};

export type LeftoverOpportunities = {
  groups: LeftoverOpportunityGroup[];
  /** Sobra sem volume: recolhida no fim, com a contagem. */
  withoutVolume: Array<{ keywordId: string; keyword: string; siloRef: string; siloLabel: string }>;
  /** Sobras que já são sugestão Forte de um publicado ou Assunto: ficam lá (D1: o publicado vem antes). */
  reservedForAnchors: number;
  totalLeftovers: number;
};

export const CREATE_ARTICLE_FROM_GROUP_ACTION = "Criar artigo novo com este grupo";

/**
 * As sobras como oportunidades de artigo novo, por tema e volume.
 *
 * Por Silo (um artigo nunca cruza Silo): a de maior volume abre o grupo e
 * chama as que tratam do mesmo assunto — SERP forte (3+ páginas), ou 2
 * páginas com palavras em comum; sem SERP de uma das duas, só palavras. A
 * SERP que diz "outro assunto" (0 ou 1 página) barra, mesmo com palavras
 * parecidas. Nenhuma contradição de intenção observada na SERP entra junto.
 * Até 6 por grupo; o resto abre os grupos seguintes.
 */
export function groupLeftoverOpportunities(input: {
  silos: ReadonlyArray<{ siloRef: string; siloLabel: string; siloTokens?: ReadonlySet<string>; leftoverKeywordIds: readonly string[] }>;
  keywords: ReadonlyMap<string, ArticleFormationKeyword>;
  serp: SerpSubjectIndex | null;
  /** Sobras já marcadas como reforço Forte de um publicado ou Assunto. */
  reservedKeywordIds?: ReadonlySet<string>;
}): LeftoverOpportunities {
  const groups: LeftoverOpportunityGroup[] = [];
  const withoutVolume: LeftoverOpportunities["withoutVolume"] = [];
  let reservadas = 0;
  let total = 0;
  for (const silo of input.silos) {
    const tokens = silo.siloTokens || new Set<string>();
    const sobras: ArticleFormationKeyword[] = [];
    for (const keywordId of new Set(silo.leftoverKeywordIds)) {
      const keyword = input.keywords.get(keywordId);
      if (!keyword) continue;
      total += 1;
      if (!hasSearchVolume(keyword.volume)) {
        withoutVolume.push({ keywordId, keyword: keyword.keyword, siloRef: silo.siloRef, siloLabel: silo.siloLabel });
        continue;
      }
      if (input.reservedKeywordIds?.has(keywordId)) { reservadas += 1; continue; }
      sobras.push(keyword);
    }
    sobras.sort((left, right) => (right.volume ?? 0) - (left.volume ?? 0) || left.keywordId.localeCompare(right.keywordId));
    const usadas = new Set<string>();
    const ligacao = (lider: ArticleFormationKeyword, outra: ArticleFormationKeyword): { reason: string; basis: "serp" | "words"; warning: string | null } | null => {
      if (serpAwareDnaBarrier(lider, outra, input.serp)) return null;
      const divergencia = input.serp ? logicDnaDivergence(lider, outra) : null;
      const aviso = divergencia ? `${divergencia[0].toUpperCase()}${divergencia.slice(1)}: só aviso.` : null;
      const medida = input.serp ? input.serp.overlap(lider.keywordId, outra.keywordId) : null;
      const semLogica = (keyword: ArticleFormationKeyword) => divergencia ? { ...keyword, intent: null, funnel: null, observedFunnel: null } : keyword;
      const palavras = sameArticleAffinity(semLogica(lider), semLogica(outra), tokens).affinity;
      if (medida?.strength === "strong") return { reason: `${medida.sharedPageCount} páginas em comum com "${lider.keyword}"`, basis: "serp", warning: aviso };
      if (medida?.strength === "support") {
        return palavras >= AFFINITY_FLOOR ? { reason: `2 páginas e palavras em comum com "${lider.keyword}"`, basis: "serp", warning: aviso } : null;
      }
      if (medida && medida.strength !== "unknown") return null;
      return palavras >= AFFINITY_FLOOR ? { reason: `palavras em comum com "${lider.keyword}" (sem SERP para medir)`, basis: "words", warning: aviso } : null;
    };
    for (const lider of sobras) {
      if (usadas.has(lider.keywordId)) continue;
      usadas.add(lider.keywordId);
      const membros: LeftoverOpportunityMember[] = [{ keywordId: lider.keywordId, keyword: lider.keyword, volume: lider.volume as number, reason: "maior volume do grupo", warning: null }];
      const juntas: ArticleFormationKeyword[] = [lider];
      let porSerp = false;
      for (const outra of sobras) {
        if (membros.length >= MAX_ARTICLE_KEYWORDS) break;
        if (usadas.has(outra.keywordId)) continue;
        const ligada = ligacao(lider, outra);
        if (!ligada) continue;
        // Dentro do grupo, ninguém contradiz a intenção observada de outro membro.
        if (juntas.some(membro => serpAwareDnaBarrier(membro, outra, input.serp))) continue;
        usadas.add(outra.keywordId);
        juntas.push(outra);
        porSerp = porSerp || ligada.basis === "serp";
        membros.push({ keywordId: outra.keywordId, keyword: outra.keyword, volume: outra.volume as number, reason: ligada.reason, warning: ligada.warning });
      }
      const totalVolume = membros.reduce((soma, item) => soma + item.volume, 0);
      const basis: LeftoverOpportunityGroup["basis"] = membros.length === 1 ? "single" : porSerp ? "serp" : "words";
      groups.push({
        key: `${silo.siloRef}::${lider.keywordId}`,
        siloRef: silo.siloRef,
        siloLabel: silo.siloLabel,
        leaderKeywordId: lider.keywordId,
        name: lider.keyword,
        totalVolume,
        members: membros,
        basis,
        reason: basis === "single"
          ? "Sem outra sobra do mesmo assunto neste Silo."
          : basis === "serp"
            ? `${membros.length} keywords do mesmo assunto no Google.`
            : `${membros.length} keywords com palavras em comum (falta SERP para medir).`,
      });
    }
  }
  groups.sort((left, right) => right.totalVolume - left.totalVolume || right.members.length - left.members.length || left.key.localeCompare(right.key));
  withoutVolume.sort((left, right) => left.keyword.localeCompare(right.keyword, "pt-BR"));
  return { groups, withoutVolume, reservedForAnchors: reservadas, totalLeftovers: total };
}
