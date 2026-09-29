/**
 * D2.1 — O POSTO DA PRINCIPAL PUBLICADA: TRAVADO OU LIVRE PARA TROCA.
 *
 * Regra do dono (docs/compartilhado/regras-serp-e-assuntos-2026-09-26.md):
 *
 *   Travado ao slug  a principal fica. O artigo só recebe reforço. Aqui não
 *                    sai proposta de troca — nem "bloqueada": o dono já disse
 *                    que a principal fica.
 *   Livre            a principal está ali PARA SER TROCADA. Em geral ela não
 *                    tem volume. O Arquiteto procura e propõe a melhor
 *                    substituta: Volume validado maior que o da atual, mesma
 *                    intenção, e que DIVIDE A SERP com o artigo (páginas em
 *                    comum no top 10, nas 4 lentes — D2.2).
 *
 * O que nunca muda na troca: URL, slug, canonical e marca. A principal
 * antiga vira SECUNDÁRIA do mesmo artigo. A troca só é aplicada por decisão
 * humana, com nova versão e histórico (AGENTS §11).
 *
 * POR QUE NÃO `proposePrimarySubstitution`: aquela resposta é para a
 * principal REVISÁVEL genérica, que exige volume dos dois lados e folga de
 * 1,5x — sem volume da atual ela não compara. No Posto Livre a atual quase
 * sempre é a que não tem volume: é exatamente o caso que ela recusava. Os
 * contratos de saída são os mesmos (`PrimaryKeywordCandidate` e
 * `PrimaryKeywordDecision` pendente), que o ArticleDNA já aceita: nenhum
 * formato novo de ArticleDNA.
 *
 * Posto sem declaração em página publicada é estado desconhecido (AGENTS
 * §11): não libera nem bloqueia em silêncio — nada é proposto, e a tela diz
 * que falta declarar o Posto na Revisão Humana do Minerador.
 *
 * D2.3 (2026-09-27) — FORTE OU PROVÁVEL, SEMPRE COM VOLUME MAIOR E PÁGINAS
 * EM COMUM (D2.1). A substituta pode vir do nível Forte (3+ páginas em comum)
 * ou Provável só com 2 páginas em comum confirmadas pelas palavras; a
 * Provável vem com aviso. Sites em comum e "mesma entidade e problema no DNA"
 * sugerem reforço, mas nunca a troca; sem a SERP medida, a troca é recusada
 * (`serp_unknown`). A Forte tem prioridade; a Provável só é proposta quando
 * não há Forte, e aparece nas alternativas quando há. A intenção que barra é
 * a da SERP (`evidencia_serp`); a da Lógica, quando diverge, é aviso.
 *
 * Domínio puro: sem React, sem storage, sem rede.
 */
import {
  PrimaryKeywordCandidateSchema,
  PrimaryKeywordDecisionSchema,
  type PrimaryKeywordCandidate,
  type PrimaryKeywordDecision,
} from "./contracts.ts";
import { MAX_ARTICLE_KEYWORDS, type ArticleFormationKeyword } from "./article-formation.ts";
import { intentComparisonKey } from "./keyword-dna-signals.ts";
import { SERP_SUBJECT_THRESHOLDS, type SerpSubjectIndex, type SerpSubjectOverlap } from "./serp-subject-overlap.ts";
import { logicDnaDivergence, logicWarningText, measureAnchorConvergence, serpAwareDnaBarrier } from "./serp-subject-convergence.ts";
import { SERP_SUGGESTION_LEVEL_LABELS, type SerpSuggestionLevel } from "./serp-subject-suggestions.ts";
import { classifySlugFit, slugTextOf, type SlugFit } from "./published-slug-fit.ts";

/* -------------------------------- o posto -------------------------------- */

/** As duas respostas visíveis do Posto, mais o desconhecido (AGENTS §11). */
export type PublishedPrimaryPost = "locked" | "free" | "unknown";

export const PUBLISHED_PRIMARY_POST_LABELS: Readonly<Record<PublishedPrimaryPost, string>> = Object.freeze({
  locked: "Travado ao slug",
  free: "Livre",
  unknown: "Posto não declarado",
});

/**
 * O Posto a partir da política gravada (Minerador ou Arquiteto).
 *
 * `locked` → Travado. `reviewable`/`revisable`/`free` → Livre (as três são a
 * mesma resposta na tela do Minerador). `conflict`, `unknown` ou ausente →
 * desconhecido: nada é proposto e a tela pede a declaração.
 */
export function publishedPrimaryPostOf(policy: string | null | undefined): PublishedPrimaryPost {
  const valor = typeof policy === "string" ? policy.trim().toLowerCase() : "";
  if (valor === "locked" || valor === "travada" || valor === "principal_travada") return "locked";
  if (valor === "reviewable" || valor === "revisable" || valor === "free" || valor === "livre" || valor === "principal_livre") return "free";
  return "unknown";
}

/* ------------------------------- a proposta ------------------------------- */

export type PublishedPrimarySwapCandidate = ArticleFormationKeyword & {
  /** O Volume foi validado pelo Google Ads no Minerador (não é estimativa do Labs). */
  volumeValidated: boolean;
  /** Assunto declarado sem Volume nunca é principal (B5). */
  subjectDeclared?: boolean;
};

export type PublishedPrimarySwapIdentity = {
  url: string | null;
  canonical: string | null;
  slug: string | null;
};

/**
 * `proposed`      há substituta: aplicar só por decisão humana;
 * `no_candidate`  Livre, mas nenhuma keyword reúne as três exigências — a
 *                 tela diz o que faltou em cada uma;
 * `locked`        Travado ao slug: nunca propor troca, só reforço;
 * `unknown_post`  Posto não declarado: declare na Revisão Humana.
 */
export type PublishedPrimarySwapState = "proposed" | "no_candidate" | "locked" | "unknown_post";

export type PublishedPrimarySwapRejection = {
  keywordId: string;
  keyword: string;
  /** O primeiro requisito que faltou, na ordem da regra. */
  /**
   * `serp_support` = só a vizinhança do Google (2 páginas em comum): basta
   * para REFORÇAR com palavras em comum, não para ASSUMIR a principal, que
   * exige 3 ou mais. `serp` = o Google diz que é outro assunto.
   */
  /**
   * Aditivo (2026-09-28): `slug_entity` = troca a entidade do slug publicado
   * ("para o consultório" num slug "-para-clinica"); `other_article` = é
   * âncora de outro publicado ou membro de outro artigo.
   */
  missing: "volume" | "volume_not_higher" | "intent" | "serp" | "serp_support" | "serp_unknown" | "published" | "subject_without_volume" | "slug_entity" | "other_article";
  reason: string;
  sharedPageCount: number | null;
};

export type PublishedPrimarySwapProposal = {
  state: PublishedPrimarySwapState;
  publishedKeywordId: string;
  publishedKeyword: string;
  post: PublishedPrimaryPost;
  /** A melhor substituta, quando há. */
  substitute: {
    keywordId: string;
    keyword: string;
    volume: number;
    sharedPageCount: number;
    overlap: SerpSubjectOverlap;
    /** Uma frase com as três exigências cumpridas. */
    reason: string;
    /** Ressalva: intenção fora do DNA, Lógica divergente ou nível Provável. */
    warning: string | null;
    /** D2.3 (aditivo) — Forte (3+ páginas) ou Provável (com aviso). */
    level?: SerpSuggestionLevel;
    /** Aditivo (2026-09-28): cabe no slug publicado ou neutra (a que contradiz nunca é proposta). */
    slugFit?: SlugFit;
  } | null;
  /** As outras que cumpriram tudo, na ordem (para o humano escolher outra). */
  alternatives: Array<{ keywordId: string; keyword: string; volume: number; sharedPageCount: number; level?: SerpSuggestionLevel; slugFit?: SlugFit }>;
  rejected: PublishedPrimarySwapRejection[];
  /** URL, slug, canonical e marca ficam como estão. */
  protectedIdentity: PublishedPrimarySwapIdentity;
  /** A principal antiga fica no artigo como secundária. */
  previousPrimaryBecomes: "secundaria";
  /** Contratos que o ArticleDNA já aceita: vigente + candidatas; decisão pendente. */
  candidates: PrimaryKeywordCandidate[];
  decision: PrimaryKeywordDecision | null;
  requiresHumanDecision: true;
  /** A frase da mesa. */
  note: string;
};

const intencaoDe = (keyword: ArticleFormationKeyword) => intentComparisonKey(keyword.observedIntent ?? keyword.intent);
const dnaIdDe = (keyword: ArticleFormationKeyword) => keyword.dnaVersionId || keyword.keywordId;

/**
 * Propõe a troca da principal de UM artigo publicado. Não troca nada.
 *
 * `candidates`: as keywords que podem assumir — as do próprio artigo depois
 * da formação e as livres do lote que dividem a SERP com ele. As publicadas e
 * os Assuntos sem Volume são recusados com motivo (duas publicadas nunca se
 * fundem; Assunto sem Volume nunca é principal).
 */
export function proposePublishedPrimarySwap(input: {
  published: ArticleFormationKeyword;
  post: PublishedPrimaryPost;
  identity: PublishedPrimarySwapIdentity;
  candidates: readonly PublishedPrimarySwapCandidate[];
  serp: SerpSubjectIndex | null;
  /**
   * Aditivo (2026-09-28): por que a keyword já pertence a OUTRO artigo (âncora
   * de outro publicado, membro de outro ArticleDNA ou de outra formação
   * humana), ou `null`. Quem já mora em outro artigo não vira principal deste.
   */
  elsewhere?: (keywordId: string) => string | null;
}): PublishedPrimarySwapProposal {
  const { published } = input;
  const slugPublicado = slugTextOf(input.identity);
  const base = {
    publishedKeywordId: published.keywordId,
    publishedKeyword: published.keyword,
    post: input.post,
    protectedIdentity: { url: input.identity.url, canonical: input.identity.canonical, slug: input.identity.slug },
    previousPrimaryBecomes: "secundaria" as const,
    requiresHumanDecision: true as const,
  };
  const vigente = PrimaryKeywordCandidateSchema.safeParse({
    keywordId: published.keywordId,
    keywordDnaId: dnaIdDe(published),
    keyword: published.keyword,
    status: "current",
    source: "minerador",
    reason: published.volume === null || published.volume === undefined
      ? "Principal publicada, sem volume medido no KeywordDNA."
      : `Principal publicada, com ${published.volume} de volume.`,
  });
  const candidatesBase: PrimaryKeywordCandidate[] = vigente.success ? [vigente.data] : [];

  if (input.post === "locked") {
    return {
      ...base, state: "locked", substitute: null, alternatives: [], rejected: [], candidates: candidatesBase, decision: null,
      note: `Posto "Travado ao slug": "${published.keyword}" fica como principal. O artigo só recebe reforço.`,
    };
  }
  if (input.post === "unknown") {
    return {
      ...base, state: "unknown_post", substitute: null, alternatives: [], rejected: [], candidates: candidatesBase, decision: null,
      note: `O Posto de "${published.keyword}" não está declarado. O Minerador mostra "Travado ao slug" por padrão em página publicada, mas padrão não é decisão: nada é proposto nem bloqueado até você declarar, na Revisão Humana do Minerador, "Travado ao slug" (só reforço) ou "Livre" (a principal está ali para ser trocada).`,
    };
  }

  const volumeAtual = typeof published.volume === "number" && published.volume > 0 ? published.volume : null;
  const intencaoAtual = intencaoDe(published);
  const rejected: PublishedPrimarySwapRejection[] = [];
  const aptas: Array<{ keyword: PublishedPrimarySwapCandidate; volume: number; overlap: SerpSubjectOverlap; warning: string | null; level: SerpSuggestionLevel; motivoDoNivel: string; slugFit: SlugFit }> = [];
  const vistas = new Set<string>([published.keywordId]);

  for (const candidata of input.candidates) {
    if (vistas.has(candidata.keywordId)) continue;
    vistas.add(candidata.keywordId);
    const recusar = (missing: PublishedPrimarySwapRejection["missing"], reason: string, overlap?: SerpSubjectOverlap | null) =>
      rejected.push({ keywordId: candidata.keywordId, keyword: candidata.keyword, missing, reason, sharedPageCount: overlap && overlap.strength !== "unknown" ? overlap.sharedPageCount : null });
    if (candidata.isPublished) { recusar("published", "É a principal de outra página publicada: duas publicadas nunca se fundem."); continue; }
    const alheia = input.elsewhere ? input.elsewhere(candidata.keywordId) : null;
    if (alheia) { recusar("other_article", `${alheia}: uma keyword mora num artigo só, e a de outro artigo não assume esta principal.`); continue; }
    const volume = typeof candidata.volume === "number" ? candidata.volume : null;
    if (candidata.subjectDeclared && !candidata.volumeValidated) { recusar("subject_without_volume", "Assunto declarado sem Volume validado: nunca é principal nem dá slug (B5)."); continue; }
    if (!candidata.volumeValidated || volume === null || volume <= 0) { recusar("volume", "Sem Volume validado pelo Google Ads: a troca existe para ganhar volume."); continue; }
    if (volumeAtual !== null && volume <= volumeAtual) { recusar("volume_not_higher", `Volume ${volume} não supera o da principal atual (${volumeAtual}).`); continue; }
    // D2.3 — quem barra é a intenção da SERP; a Lógica que diverge é aviso.
    const contradicao = serpAwareDnaBarrier(published, candidata, input.serp);
    const intencao = intencaoDe(candidata);
    if (contradicao) { recusar("intent", `O DNA separa as duas: ${contradicao}. A troca exige a mesma intenção.`); continue; }
    const overlap = input.serp ? input.serp.overlap(published.keywordId, candidata.keywordId) : null;
    if (!overlap || overlap.strength === "unknown") {
      recusar("serp_unknown", overlap ? overlap.reason : "Sem a SERP da mesa: não dá para saber se ela divide o Google com o artigo.", overlap);
      continue;
    }
    // D2.1 — a troca exige páginas em comum. Sites em comum e o DNA servem
    // para sugerir reforço (D2.3), nunca para assumir a principal.
    let nivel: { level: SerpSuggestionLevel; reason: string };
    if (overlap.strength === "strong") {
      nivel = { level: "strong", reason: `${overlap.sharedPageCount} páginas em comum no top 10` };
    } else if (overlap.strength === "support") {
      const medida = measureAnchorConvergence(published, candidata, { serp: input.serp });
      if (medida.basis !== "serp_and_words") {
        recusar("serp_support", `Só ${overlap.sharedPageCount} páginas em comum no top 10, e as palavras não confirmam: serve para reforçar, não para assumir a principal.`, overlap);
        continue;
      }
      nivel = { level: "probable", reason: `${overlap.sharedPageCount} páginas e palavras em comum no top 10` };
    } else {
      recusar("serp", `Não divide a SERP com o artigo: ${overlap.reason}`, overlap);
      continue;
    }
    // 2026-09-28 — URL, slug e canonical ficam: a substituta que troca a
    // entidade do slug ("consultório" num slug de "clínica") não é proposta.
    const encaixe = classifySlugFit(slugPublicado, candidata.keyword);
    if (encaixe.fit === "contradicts") {
      recusar("slug_entity", `Não combina com o slug publicado "${slugPublicado}": ${encaixe.reason}. A página ficaria com a URL de uma coisa e a principal de outra.`, overlap);
      continue;
    }
    const divergencia = logicDnaDivergence(published, candidata);
    const avisos = [
      !intencaoAtual || !intencao ? `A intenção de "${!intencaoAtual ? published.keyword : candidata.keyword}" não está registrada no DNA; confira antes de aceitar.` : "",
      divergencia ? logicWarningText(divergencia) : "",
      nivel.level === "probable" ? `Nível Provável (${nivel.reason}): o Google não junta as duas com ${SERP_SUBJECT_THRESHOLDS.strongPages}+ páginas; confira a evidência antes de aceitar.` : "",
    ].filter(Boolean);
    aptas.push({ keyword: candidata, volume, overlap, warning: avisos.length ? avisos.join(" ") : null, level: nivel.level, motivoDoNivel: nivel.reason, slugFit: encaixe.fit });
  }

  // A melhor (2026-09-28): primeiro a que CABE no slug publicado (a entidade
  // central do slug); depois Forte antes de Provável; depois mais páginas em
  // comum (o Google junta mais); depois mais volume; depois a ordem estável.
  const ordemDoEncaixe = (fit: SlugFit) => fit === "fits" ? 0 : 1;
  aptas.sort((left, right) => ordemDoEncaixe(left.slugFit) - ordemDoEncaixe(right.slugFit)
    || (left.level === right.level ? 0 : left.level === "strong" ? -1 : 1)
    || right.overlap.sharedPageCount - left.overlap.sharedPageCount
    || right.volume - left.volume
    || left.keyword.keywordId.localeCompare(right.keyword.keywordId));

  const candidates = [...candidatesBase];
  for (const [indice, apta] of aptas.entries()) {
    const registro = PrimaryKeywordCandidateSchema.safeParse({
      keywordId: apta.keyword.keywordId,
      keywordDnaId: dnaIdDe(apta.keyword),
      keyword: apta.keyword.keyword,
      status: "candidate",
      source: "serp",
      reason: `${indice === 0 ? "Melhor substituta" : "Também qualifica"} (${SERP_SUGGESTION_LEVEL_LABELS[apta.level]}${apta.slugFit === "fits" ? ", cabe no slug" : ""}): volume ${apta.volume}${volumeAtual === null ? " (a atual não tem volume)" : ` contra ${volumeAtual}`}, mesma intenção na SERP e ${apta.motivoDoNivel}.`,
    });
    if (registro.success) candidates.push(registro.data);
  }
  for (const recusa of rejected) {
    const alvo = input.candidates.find(item => item.keywordId === recusa.keywordId);
    const registro = PrimaryKeywordCandidateSchema.safeParse({
      keywordId: recusa.keywordId,
      keywordDnaId: alvo ? dnaIdDe(alvo) : recusa.keywordId,
      keyword: recusa.keyword,
      status: "rejected",
      source: "minerador",
      reason: recusa.reason,
    });
    if (registro.success) candidates.push(registro.data);
  }

  const melhor = aptas[0];
  if (!melhor) {
    const semVolume = rejected.filter(item => item.missing === "volume" || item.missing === "volume_not_higher").length;
    const semSerp = rejected.filter(item => item.missing === "serp").length;
    const soVizinhanca = rejected.filter(item => item.missing === "serp_support").length;
    const semLeitura = rejected.filter(item => item.missing === "serp_unknown").length;
    const partes = [
      semSerp ? (semSerp === 1 ? "1 não divide a SERP com o artigo" : `${semSerp} não dividem a SERP com o artigo`) : "",
      soVizinhanca ? `${soVizinhanca} só na vizinhança do Google: ${SERP_SUBJECT_THRESHOLDS.supportPages} páginas sem palavras em comum, e a troca exige ${SERP_SUBJECT_THRESHOLDS.strongPages}+ ou palavras que confirmem` : "",
      semVolume ? `${semVolume} sem volume maior que o da atual` : "",
      rejected.some(item => item.missing === "intent") ? "intenção diferente em outras" : "",
      rejected.some(item => item.missing === "slug_entity") ? "outras trocam a entidade do slug publicado" : "",
      rejected.some(item => item.missing === "other_article") ? "outras já moram em outro artigo" : "",
      semLeitura ? `${semLeitura} sem SERP no cache para medir` : "",
    ].filter(Boolean);
    return {
      ...base, state: "no_candidate", substitute: null, alternatives: [], rejected, candidates, decision: null,
      note: input.candidates.length
        ? `Posto Livre, mas nenhuma keyword do lote reúne volume maior, mesma intenção e SERP em comum com "${published.keyword}"${partes.length ? ` (${partes.join("; ")})` : ""}. A principal fica até aparecer uma substituta — use "Buscar reforço".`
        : `Posto Livre, mas não há keyword no lote para substituir "${published.keyword}". Use "Buscar reforço" para achar uma com volume que divida a SERP com o artigo.`,
    };
  }

  const noSlug = melhor.slugFit === "fits" ? ` (cabe no slug "${slugPublicado}")` : "";
  const reason = melhor.level === "strong"
    ? `"${melhor.keyword.keyword}"${noSlug} tem volume ${melhor.volume}${volumeAtual === null ? " e a principal atual não tem volume" : ` contra ${volumeAtual}`}, a mesma intenção e divide ${melhor.overlap.sharedPageCount} páginas do top 10 com o artigo.`
    : `"${melhor.keyword.keyword}"${noSlug} tem volume ${melhor.volume}${volumeAtual === null ? " e a principal atual não tem volume" : ` contra ${volumeAtual}`}, a mesma intenção e é Provável: ${melhor.motivoDoNivel}.`;
  const decisao = PrimaryKeywordDecisionSchema.safeParse({
    status: "pending",
    previousKeywordId: published.keywordId,
    selectedKeywordId: melhor.keyword.keywordId,
    reason: `Proposta de troca (Posto Livre): ${reason} URL, slug e canonical ficam; "${published.keyword}" vira secundária.`,
  });
  return {
    ...base,
    state: "proposed",
    substitute: {
      keywordId: melhor.keyword.keywordId,
      keyword: melhor.keyword.keyword,
      volume: melhor.volume,
      sharedPageCount: melhor.overlap.sharedPageCount,
      overlap: melhor.overlap,
      reason,
      warning: melhor.warning,
      level: melhor.level,
      slugFit: melhor.slugFit,
    },
    alternatives: aptas.slice(1).map(apta => ({ keywordId: apta.keyword.keywordId, keyword: apta.keyword.keyword, volume: apta.volume, sharedPageCount: apta.overlap.sharedPageCount, level: apta.level, slugFit: apta.slugFit })),
    rejected,
    candidates,
    decision: decisao.success ? decisao.data : null,
    note: `Troca proposta: ${reason} URL, slug e canonical não mudam, e "${published.keyword}" fica no artigo como secundária. Só vale com a sua decisão.`,
  };
}

/* ------------------------------ a decisão humana ------------------------------ */

export type PublishedPrimarySwapArticle = {
  principalKeywordId: string;
  keywordIds: readonly string[];
  identity: PublishedPrimarySwapIdentity;
};

export type PublishedPrimarySwapOutcome =
  | {
    ok: true;
    accepted: boolean;
    /** A composição depois da decisão: a nova principal primeiro. */
    principalKeywordId: string;
    keywordIds: string[];
    /** Só os papéis que mudam: a nova principal e a antiga, que vira secundária. Os demais ficam como estão. */
    roleChanges: Array<{ keywordId: string; role: "principal" | "secundaria" }>;
    /** Idêntica à de antes, sempre. */
    identity: PublishedPrimarySwapIdentity;
    /** Os campos que o ArticleDNA já aceita, prontos para a NOVA versão. */
    articleDnaFields: { primaryKeywordCandidates: PrimaryKeywordCandidate[]; primaryKeywordDecision: PrimaryKeywordDecision };
    /** Aceita muda a principal: exige nova versão do ArticleDNA com histórico. */
    requiresNewVersion: boolean;
    summary: string;
  }
  | { ok: false; reason: string };

/**
 * Aplica (ou recusa) a troca proposta, com o ator humano e a hora.
 *
 * Confere, nesta ordem: a proposta existe; o Posto continua Livre; o artigo
 * ainda tem a mesma principal (a proposta não é velha); a substituta cabe no
 * teto de seis; o ator e a hora vieram. Nada disso é suposto.
 *
 * A identidade sai IGUAL à que entrou — URL, slug e canonical nunca mudam
 * aqui. A persistência (nova versão do ArticleDNA, com `primaryKeywordDecision`
 * confirmada e o histórico) é do chamador, pela porta de versão que já existe.
 */
export function decidePublishedPrimarySwap(input: {
  proposal: PublishedPrimarySwapProposal;
  article: PublishedPrimarySwapArticle;
  /** O Posto AGORA — pode ter mudado depois da proposta. */
  currentPost: PublishedPrimaryPost;
  accepted: boolean;
  actorUserId: string;
  decidedAt: string;
}): PublishedPrimarySwapOutcome {
  const { proposal, article } = input;
  if (proposal.state !== "proposed" || !proposal.substitute || !proposal.decision) {
    return { ok: false, reason: "Não há troca proposta para decidir." };
  }
  if (!input.actorUserId.trim()) return { ok: false, reason: "A decisão precisa do usuário que decidiu." };
  if (!Number.isFinite(Date.parse(input.decidedAt))) return { ok: false, reason: "A decisão precisa da data e hora." };
  if (article.principalKeywordId !== proposal.publishedKeywordId) {
    return { ok: false, reason: "A principal do artigo mudou depois da proposta: recarregue a mesa antes de decidir." };
  }
  if (input.accepted && input.currentPost !== "free") {
    return { ok: false, reason: input.currentPost === "locked"
      ? "O Posto agora está \"Travado ao slug\": a troca não pode ser aplicada."
      : "O Posto não está declarado: declare \"Livre\" na Revisão Humana antes de trocar." };
  }
  const nova = proposal.substitute.keywordId;
  const jaMembro = article.keywordIds.includes(nova);
  if (input.accepted && !jaMembro && article.keywordIds.length + 1 > MAX_ARTICLE_KEYWORDS) {
    return { ok: false, reason: `O artigo já tem ${article.keywordIds.length} keywords: tire uma antes de trazer "${proposal.substitute.keyword}" como principal (teto de ${MAX_ARTICLE_KEYWORDS}).` };
  }

  const decisao = PrimaryKeywordDecisionSchema.parse({
    status: input.accepted ? "confirmed" : "rejected",
    previousKeywordId: proposal.publishedKeywordId,
    selectedKeywordId: input.accepted ? nova : proposal.publishedKeywordId,
    actorId: input.actorUserId,
    decidedAt: new Date(input.decidedAt).toISOString(),
    reason: input.accepted
      ? `Troca aceita: "${proposal.substitute.keyword}" assume a principal; "${proposal.publishedKeyword}" fica como secundária. URL, slug e canonical preservados.`
      : `Troca recusada: "${proposal.publishedKeyword}" continua principal.`,
  });
  const candidatas = proposal.candidates.map(candidata => {
    if (!input.accepted) return candidata.keywordId === nova ? { ...candidata, status: "rejected" as const, reason: "Recusada por decisão humana." } : candidata;
    if (candidata.keywordId === nova) return { ...candidata, status: "confirmed" as const, source: "human" as const };
    return candidata;
  });

  if (!input.accepted) {
    return {
      ok: true, accepted: false,
      principalKeywordId: article.principalKeywordId,
      keywordIds: [...article.keywordIds],
      roleChanges: [],
      identity: { ...article.identity },
      articleDnaFields: { primaryKeywordCandidates: candidatas, primaryKeywordDecision: decisao },
      requiresNewVersion: false,
      summary: decisao.reason!,
    };
  }
  const keywordIds = [nova, ...article.keywordIds.filter(keywordId => keywordId !== nova)];
  return {
    ok: true, accepted: true,
    principalKeywordId: nova,
    keywordIds,
    roleChanges: [{ keywordId: nova, role: "principal" }, { keywordId: proposal.publishedKeywordId, role: "secundaria" }],
    identity: { ...article.identity },
    articleDnaFields: { primaryKeywordCandidates: candidatas, primaryKeywordDecision: decisao },
    requiresNewVersion: true,
    summary: decisao.reason!,
  };
}
