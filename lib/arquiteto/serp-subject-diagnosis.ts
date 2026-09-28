/**
 * O DIAGNÓSTICO DE CADA PUBLICADO E DE CADA ASSUNTO — UM ESTADO CLARO POR DILEMA.
 *
 * Pedido do dono (2026-09-26): "caprichar essa resposta do sistema a estes
 * dilemas, que vai ter muito". Na AdalbaPro, de 25 publicados só 6 têm
 * volume e em ~17 nenhuma das 133 livres divide 3+ páginas do top 10 com
 * eles. A mesa precisa dizer, para cada um, O QUE ACONTECEU e O QUE FAZER —
 * sem colar keyword de outro assunto e sem fingir que a falta de SERP é zero.
 *
 * Os estados, na ordem em que a tela os resolve:
 *
 *   swap_proposed        Posto Livre com substituta (D2.1): decidir a troca.
 *   reinforced           recebeu keywords do mesmo assunto (D1/D2.2).
 *   pair_in_other_silo   o par real está noutro Silo: proposta, decisão humana (D8).
 *   pair_in_other_article o par real está no MESMO Silo, mas já em outro
 *                        artigo (em geral outro publicado que disputa o mesmo
 *                        assunto). Dizer "sem par no lote" seria falso: há
 *                        par, e quem decide para onde ele vai é o dono. Na
 *                        AdalbaPro, "como atrair pacientes para consultório
 *                        odontológico" divide 4 páginas com "como atrair
 *                        pacientes para o consultório", que ficou em "como
 *                        atrair clientes para consultório".
 *   pair_without_volume  há keywords do mesmo assunto, mas nenhuma com Volume
 *                        validado para ser a principal (Assunto sem artigo).
 *   pair_blocked_by_dna  há keywords do mesmo assunto no Google, mas o DNA
 *                        separa (intenção ou funil): a contradição continua
 *                        barrando (D5), e a revisão é humana, no Minerador.
 *                        Na AdalbaPro, "como atrair pacientes para clínica"
 *                        (Comercial) divide 7 páginas com "como atrair
 *                        pacientes" (Informativa): o sistema não pode dizer
 *                        que não há par — há, e o que trava é o DNA. (Com o
 *                        Posto Livre, o mesmo publicado recebe Troca proposta
 *                        para "como atrair clientes para clinica medica",
 *                        Comercial, 4 páginas; os pares Informativos ficam
 *                        nos detalhes como barrados pelo DNA.)
 *                        D2.3.1 (2026-09-28): com 3+ páginas em comum, nem a
 *                        intenção OBSERVADA barra — vira aviso e o par vira
 *                        sugestão Forte. Como este estado só olha pares
 *                        fortes, com a SERP medindo ele deixa de aparecer; o
 *                        par de 2 páginas com intenção observada diferente
 *                        continua fora das sugestões, sem cartão próprio.
 *   serp_missing         sem SERP da âncora no cache: não dá para medir (A7/D6).
 *                        Vencida (A4, 30 dias) e nunca coletada são ditas
 *                        de modos diferentes (`serpGaps`).
 *   no_demand            a busca de reforço já rodou e não achou demanda:
 *                        "tema sem demanda no Google" — a decisão é do dono.
 *   no_pair_in_batch     nenhuma keyword do lote trata do mesmo assunto no
 *                        Google: oferecer "Buscar reforço" (D2.2).
 *   suggestions_available D2.3 — há sugestões com volume (Forte marcada,
 *                        Provável desmarcada) para o dono confirmar de uma vez.
 *                        Vem antes do par em outro Silo quando alguma está no
 *                        próprio Silo, fora de artigo; senão, antes de "sem
 *                        SERP", "sem demanda" e "sem par".
 *
 * D2.3 — TODO cartão traz `suggestions`: as keywords com volume que dividem a
 * SERP com a âncora (Forte ou Provável), por volume, com motivo curto. A
 * intenção que barra é a da SERP; a da Lógica, quando diverge, é aviso — o par
 * "como atrair pacientes" × "como atrair pacientes para clínica" (7 páginas)
 * deixa de ser "intenção diferente" e vira sugestão Forte, com o aviso.
 *
 * Nada aqui aplica coisa alguma: a formação já decidiu o que é automático, a
 * troca e o movimento entre Silos são decisão humana. Isto só LÊ o plano e o
 * índice de SERP e diz, em português, o que cada âncora precisa.
 *
 * Domínio puro: sem React, sem storage, sem rede.
 */
import type { ArticleFormationKeyword } from "./article-formation.ts";
import type { CrossSiloReinforcementProposal, SiloFormationPlan } from "./article-formation-priority.ts";
import { bestAnchorConvergence, type AnchorConvergenceBasis } from "./serp-subject-convergence.ts";
import { SERP_SUBJECT_THRESHOLDS, type SerpSubjectIndex } from "./serp-subject-overlap.ts";
import {
  proposePublishedPrimarySwap,
  type PublishedPrimaryPost,
  type PublishedPrimarySwapProposal,
} from "./published-primary-swap.ts";
import { MAX_ARTICLE_KEYWORDS } from "./article-formation.ts";
import { suggestAnchorReinforcements, type AnchorSuggestion, type SuggestionLocation } from "./serp-subject-suggestions.ts";

/* --------------------------------- estados --------------------------------- */

export const SERP_SUBJECT_DILEMMA_STATES = [
  "swap_proposed",
  "reinforced",
  "pair_in_other_silo",
  "pair_in_other_article",
  "pair_without_volume",
  "pair_blocked_by_dna",
  "serp_missing",
  "no_demand",
  "no_pair_in_batch",
  "suggestions_available",
] as const;
export type SerpSubjectDilemmaState = (typeof SERP_SUBJECT_DILEMMA_STATES)[number];

/** O rótulo curto do estado, para o selo da mesa. */
export const SERP_SUBJECT_DILEMMA_LABELS: Readonly<Record<SerpSubjectDilemmaState, string>> = Object.freeze({
  swap_proposed: "Troca proposta",
  reinforced: "Reforçado",
  pair_in_other_silo: "Par em outro Silo",
  pair_in_other_article: "Par em outro artigo",
  pair_without_volume: "Par sem volume",
  pair_blocked_by_dna: "Par com intenção diferente",
  serp_missing: "Sem SERP no cache",
  no_demand: "Tema sem demanda no Google",
  no_pair_in_batch: "Sem par no lote",
  suggestions_available: "Sugestões para confirmar",
});

/** O tom do selo, no vocabulário do sistema visual (sem cor crua). */
export const SERP_SUBJECT_DILEMMA_TONES: Readonly<Record<SerpSubjectDilemmaState, "success" | "info" | "warning" | "neutral">> = Object.freeze({
  swap_proposed: "info",
  reinforced: "success",
  pair_in_other_silo: "info",
  pair_in_other_article: "info",
  pair_without_volume: "warning",
  pair_blocked_by_dna: "warning",
  serp_missing: "warning",
  no_demand: "neutral",
  no_pair_in_batch: "warning",
  suggestions_available: "info",
});

/** A frase fixa da D2.2, citada igual na tela e no catálogo das IAs. */
export const NO_SERP_PAIR_IN_BATCH_MESSAGE = "nenhuma keyword deste lote trata do mesmo assunto no Google";
export const NO_DEMAND_MESSAGE = "tema sem demanda no Google";
export const REINFORCEMENT_SEARCH_ACTION_LABEL = "Buscar reforço";

/* ------------------------------ Buscar reforço ------------------------------ */

/**
 * O pedido da Pesquisa por Assunto com o tema e a URL do artigo (D2.2).
 *
 * A URL da tela leva SÓ o id (F1b.1): a frase, a nota e a página de destino
 * são lidas da marca pelo Minerador. Para Assunto declarado, o parâmetro é o
 * mesmo de "Buscar sustentação" (\`assunto\`); para publicado, \`reforco\` — a
 * página lê a keyword e o Vínculo dela (frase e URL publicada).
 */
export type ReinforcementSearchRequest = {
  kind: "published" | "subject";
  anchorKeywordId: string;
  /** O tema: a principal publicada ou a frase do Assunto. */
  phrase: string;
  /** A página que o reforço sustenta: URL publicada ou página de destino do Assunto. */
  destinationUrl: string | null;
  note: string | null;
  href: string | null;
};

export function reinforcementSearchHref(brandRef: string, request: Pick<ReinforcementSearchRequest, "kind" | "anchorKeywordId">): string {
  const parametro = request.kind === "subject" ? "assunto" : "reforco";
  return `/${brandRef}/minerador/descobrir?modo=assunto&${parametro}=${encodeURIComponent(request.anchorKeywordId)}`;
}

/** O que a busca de reforço devolveu, lido da lista local da Pesquisa por Assunto. */
export type ReinforcementSearchOutcome = {
  searchedAt: string;
  candidateCount: number;
  /** Candidatas com volume do Google Ads maior que zero. */
  candidatesWithDemand: number;
};

/* ------------------------------ SERP que falta ------------------------------ */

/**
 * Por que a âncora está sem SERP no cache. A validade é de 30 dias (A4): a
 * SERP da AdalbaPro coletada em 20 a 23 de setembro vence por volta de 20 de
 * outubro, e daí em diante todo cartão diria "sem SERP". Vencida não é o
 * mesmo que nunca coletada — a tela diz qual é.
 *
 * `stale`     havia entrada, mas venceu (`collectedAt` da mais nova);
 * `never`     nenhuma lente tem entrada no cache;
 * `unusable`  havia entrada, mas de outra consulta ou ilegível.
 */
export type SerpGap = {
  kind: "stale" | "never" | "unusable";
  collectedAt: string | null;
  /** Dias desde a coleta mais nova, quando vencida. */
  ageDays: number | null;
};

const MOTIVO_VENCIDA = "validade vencida";
const MOTIVO_SEM_ENTRADA = "sem entrada no cache";

/**
 * As lacunas por keyword, a partir de `missingLenses` da leitura do cache.
 * Só entram keywords sem NENHUMA lente válida — lente parcial não é lacuna,
 * é SERP incompleta (a medida usa as que existem).
 */
export function serpGapsFromMissingLenses(input: {
  missingLenses: ReadonlyArray<{ keywordId: string; lens: string; reason: string; collectedAt?: string | null }>;
  /** Keywords com alguma lente válida (não entram). */
  withPages?: (keywordId: string) => boolean;
  now: Date;
}): Map<string, SerpGap> {
  const porKeyword = new Map<string, Array<{ reason: string; collectedAt: string | null }>>();
  for (const lacuna of input.missingLenses) {
    if (input.withPages?.(lacuna.keywordId)) continue;
    const lista = porKeyword.get(lacuna.keywordId) || [];
    lista.push({ reason: lacuna.reason, collectedAt: lacuna.collectedAt ?? null });
    porKeyword.set(lacuna.keywordId, lista);
  }
  const lacunas = new Map<string, SerpGap>();
  for (const [keywordId, lista] of porKeyword) {
    const vencidas = lista.filter(item => item.reason === MOTIVO_VENCIDA);
    if (vencidas.length) {
      const maisNova = vencidas
        .map(item => item.collectedAt)
        .filter((data): data is string => Boolean(data) && Number.isFinite(Date.parse(data!)))
        .sort((left, right) => Date.parse(right) - Date.parse(left))[0] ?? null;
      const ageDays = maisNova ? Math.max(0, Math.floor((input.now.getTime() - Date.parse(maisNova)) / 86_400_000)) : null;
      lacunas.set(keywordId, { kind: "stale", collectedAt: maisNova, ageDays });
      continue;
    }
    lacunas.set(keywordId, { kind: lista.every(item => item.reason === MOTIVO_SEM_ENTRADA) ? "never" : "unusable", collectedAt: null, ageDays: null });
  }
  return lacunas;
}

/* --------------------------------- entrada --------------------------------- */

export type SerpSubjectDiagnosisSilo = {
  siloRef: string;
  siloLabel: string;
  plan: Pick<SiloFormationPlan, "anchors" | "awaitingSubjectKeywordIds" | "leftoverKeywordIds">;
  /** Todas as keywords do Silo, para localizar pares fora das âncoras. */
  keywordIds?: readonly string[];
  /** Tokens do tema do Silo, os mesmos da formação (apoio por palavras). */
  siloTokens?: ReadonlySet<string>;
};

export type PublishedAnchorInfo = {
  post: PublishedPrimaryPost;
  url: string | null;
  canonical: string | null;
  slug: string | null;
};

export type SubjectAnchorInfo = { note: string | null; destinationUrl: string | null };

export type AnchorMemberEvidence = {
  keywordId: string;
  keyword: string;
  /** Em que a entrada se apoia. `anchor` = a própria principal. */
  basis: AnchorConvergenceBasis | "anchor" | "subject_support";
  sharedPageCount: number | null;
  reason: string;
};

export type AnchorPairElsewhere = {
  keywordId: string;
  keyword: string;
  sharedPageCount: number;
  siloRef: string | null;
  siloLabel: string | null;
  /** Onde o par está hoje. */
  where: "leftover_other_silo" | "leftover_same_silo" | "other_anchor" | "other_article";
  /** O artigo em que ele está, quando está num. */
  inAnchorLabel: string | null;
  /** A principal do artigo que ficou com o par (para abrir o artigo na mesa). */
  inAnchorPrincipalKeywordId?: string | null;
  /** O artigo que ficou com o par é publicado. */
  inAnchorPublished?: boolean;
  /** Páginas em comum do par com a principal do artigo que ficou com ele. */
  sharedWithHolder?: number | null;
};

export type SerpSubjectDiagnosisAction = {
  kind: "decide_swap" | "review_cross_silo" | "collect_serp" | "search_reinforcement" | "measure_volume" | "review_dna" | "declare_post" | "owner_decides" | "open_article" | "apply_suggestions";
  label: string;
  search?: ReinforcementSearchRequest;
  /** `open_article`: o artigo a abrir na mesa (o que ficou com o par, ou este, para liberar vaga). */
  article?: { siloRef: string; principalKeywordId: string; label: string };
};

export type AnchorSerpDiagnosis = {
  kind: "published" | "subject";
  /** A publicada ou a keyword do Assunto. */
  anchorKeywordId: string;
  anchorLabel: string;
  siloRef: string;
  siloLabel: string;
  /** A principal do artigo (no Assunto sem artigo, o próprio Assunto). */
  principalKeywordId: string;
  state: SerpSubjectDilemmaState;
  /** A frase principal, pronta para a tela. */
  headline: string;
  /** As linhas de apoio: o que foi medido, o que barrou, o que falta. */
  details: string[];
  /** As keywords do artigo hoje, com o porquê de cada uma. */
  members: AnchorMemberEvidence[];
  slotsLeft: number;
  /** A SERP da âncora no cache. */
  serpEvidence: "complete" | "partial" | "missing";
  swap: PublishedPrimarySwapProposal | null;
  /**
   * Posto não declarado: a troca que SERIA proposta se o dono declarasse
   * "Livre". Só informação para decidir o Posto — nunca aplicada.
   */
  swapIfDeclaredFree?: PublishedPrimarySwapProposal | null;
  /**
   * A melhor substituta está FORA do artigo e o artigo está no teto de 6: a
   * troca não é proposta (não caberia), mas o cartão diz qual é e oferece
   * abrir o artigo para liberar uma vaga.
   */
  substituteOutsideFullArticle?: { keywordId: string; keyword: string; volume: number; sharedPageCount: number } | null;
  /** Por que a âncora está sem SERP, quando está. */
  serpGap?: SerpGap | null;
  /** Propostas entre Silos que chegam a esta âncora. */
  crossSilo: CrossSiloReinforcementProposal[];
  /** Keywords do lote que dividem 3+ páginas com a âncora e não estão no artigo. */
  pairsElsewhere: AnchorPairElsewhere[];
  /** Dividem a SERP, mas o DNA separa: só por decisão humana. */
  blockedByDna: Array<{ keywordId: string; keyword: string; sharedPageCount: number; reason: string }>;
  /** Outras publicadas que dividem a SERP: sinal de canibalização (nunca se fundem). */
  publishedOverlaps: Array<{ keywordId: string; keyword: string; sharedPageCount: number }>;
  /** A primeira é a ação principal. */
  actions: SerpSubjectDiagnosisAction[];
  /**
   * D2.3 (aditivo) — as sugestões de reforço com volume, por volume: Forte
   * marcada (no próprio Silo, fora de artigo, até as vagas), Provável
   * desmarcada, par em outro Silo como proposta. Nada é aplicado aqui.
   */
  suggestions: AnchorSuggestion[];
};

/* -------------------------------- diagnóstico -------------------------------- */

const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;

export function diagnoseSerpSubjectAnchors(input: {
  silos: readonly SerpSubjectDiagnosisSilo[];
  /** Todas as keywords do lote da marca, pela linha da formação. */
  keywords: ReadonlyMap<string, ArticleFormationKeyword>;
  serp: SerpSubjectIndex | null;
  published: ReadonlyMap<string, PublishedAnchorInfo>;
  subjects?: ReadonlyMap<string, SubjectAnchorInfo>;
  /** Keywords com Volume validado (Google Ads). */
  volumeValidated: ReadonlySet<string>;
  /** Assuntos declarados (sem Volume nunca são principal). */
  subjectDeclared?: ReadonlySet<string>;
  crossSiloProposals?: readonly CrossSiloReinforcementProposal[];
  /** A última "Buscar reforço" de cada âncora, quando já rodou. */
  reinforcementSearches?: ReadonlyMap<string, ReinforcementSearchOutcome>;
  /** Para o link de "Buscar reforço". Sem ele, \`href\` fica nulo. */
  brandRef?: string | null;
  /** Por que cada keyword está sem SERP (serpGapsFromMissingLenses). */
  serpGaps?: ReadonlyMap<string, SerpGap>;
}): AnchorSerpDiagnosis[] {
  const serp = input.serp;
  const nome = (keywordId: string) => input.keywords.get(keywordId)?.keyword || keywordId;
  const propostas = input.crossSiloProposals || [];

  // Onde cada keyword está: âncora, sobra ou outro artigo, e em que Silo.
  const siloDe = new Map<string, { siloRef: string; siloLabel: string }>();
  const ancoraDe = new Map<string, { label: string; anchorKeywordId: string; principalKeywordId: string; siloRef: string; published: boolean }>();
  const sobras = new Set<string>();
  for (const silo of input.silos) {
    for (const keywordId of silo.keywordIds || []) siloDe.set(keywordId, { siloRef: silo.siloRef, siloLabel: silo.siloLabel });
    for (const ancora of silo.plan.anchors) {
      const rotulo = ancora.kind === "subject" && ancora.subjectKeywordId ? nome(ancora.subjectKeywordId) : nome(ancora.principalKeywordId);
      for (const keywordId of ancora.keywordIds) {
        siloDe.set(keywordId, { siloRef: silo.siloRef, siloLabel: silo.siloLabel });
        ancoraDe.set(keywordId, {
          label: rotulo,
          anchorKeywordId: ancora.kind === "subject" && ancora.subjectKeywordId ? ancora.subjectKeywordId : ancora.principalKeywordId,
          principalKeywordId: ancora.principalKeywordId,
          siloRef: silo.siloRef,
          published: ancora.kind === "published",
        });
      }
    }
    for (const keywordId of silo.plan.leftoverKeywordIds) {
      sobras.add(keywordId);
      siloDe.set(keywordId, { siloRef: silo.siloRef, siloLabel: silo.siloLabel });
    }
    for (const keywordId of silo.plan.awaitingSubjectKeywordIds) siloDe.set(keywordId, { siloRef: silo.siloRef, siloLabel: silo.siloLabel });
  }
  const todas = [...input.keywords.keys()];
  const aguardando = new Set(input.silos.flatMap(silo => silo.plan.awaitingSubjectKeywordIds));
  const localizar = (keywordId: string): SuggestionLocation => {
    const silo = siloDe.get(keywordId) ?? null;
    const naAncora = ancoraDe.get(keywordId);
    const base = { siloRef: silo?.siloRef ?? null, siloLabel: silo?.siloLabel ?? null };
    if (naAncora) return { ...base, kind: "anchor_member", articleLabel: naAncora.label, articlePrincipalKeywordId: naAncora.principalKeywordId };
    if (sobras.has(keywordId)) return { ...base, kind: "leftover" };
    if (aguardando.has(keywordId)) return { ...base, kind: "awaiting_subject" };
    return { ...base, kind: silo ? "new_article" : "unknown" };
  };

  const evidenciaDe = (keywordId: string): AnchorSerpDiagnosis["serpEvidence"] => {
    if (!serp || !serp.hasPages(keywordId)) return "missing";
    const pegada = serp.footprint(keywordId);
    const presentes = new Set((pegada?.lenses || []).filter(leitura => (leitura.urls && leitura.urls.length) || (leitura.domains && leitura.domains.length)).map(leitura => leitura.lens));
    return presentes.size >= 4 ? "complete" : "partial";
  };

  const diagnosticar = (params: {
    kind: "published" | "subject";
    anchorKeywordId: string;
    siloRef: string;
    siloLabel: string;
    siloTokens: ReadonlySet<string>;
    principalKeywordId: string;
    memberIds: readonly string[];
    /** As keywords contra as quais se mede (principal e, no Assunto, a frase). */
    measureAgainst: readonly string[];
  }): AnchorSerpDiagnosis => {
    const ancoraKw = input.keywords.get(params.anchorKeywordId);
    const medidores = params.measureAgainst.map(id => input.keywords.get(id)).filter((item): item is ArticleFormationKeyword => Boolean(item));
    const noArtigo = new Set(params.memberIds);
    const siloTokens = params.siloTokens;

    // Os membros, com o porquê.
    const members: AnchorMemberEvidence[] = params.memberIds.map(keywordId => {
      const keyword = input.keywords.get(keywordId);
      if (keywordId === params.principalKeywordId) {
        return { keywordId, keyword: nome(keywordId), basis: "anchor" as const, sharedPageCount: null, reason: params.kind === "published" ? "Principal publicada." : "Principal do artigo do Assunto." };
      }
      if (!keyword || !medidores.length) return { keywordId, keyword: nome(keywordId), basis: "words" as const, sharedPageCount: null, reason: "Sem medida." };
      const medida = bestAnchorConvergence(medidores, keyword, { siloTokens, serp });
      const paginas = medida.overlap && medida.overlap.strength !== "unknown" ? medida.overlap.sharedPageCount : null;
      return { keywordId, keyword: keyword.keyword, basis: medida.basis, sharedPageCount: paginas, reason: medida.reasons[0] || "Convergência por palavras e DNA." };
    });
    // Forte (3+ páginas) e vizinhança (2 páginas + palavras) são ditas separadas:
    // o cartão não pode dizer "divide a SERP" de uma que a troca recusa por ser só vizinhança.
    const apoiosFortes = members.filter(item => item.basis === "serp").length;
    const apoiosVizinhanca = members.filter(item => item.basis === "serp_and_words").length;
    const apoiosSoPalavras = members.filter(item => item.basis !== "anchor" && item.basis !== "serp" && item.basis !== "serp_and_words").length;
    const apoios = members.filter(item => item.basis !== "anchor").length;
    // O Assunto fica fora do teto (B6): o artigo dele tem as mesmas seis vagas.
    const slotsLeft = Math.max(0, MAX_ARTICLE_KEYWORDS - params.memberIds.length);

    // Pares fortes fora do artigo, publicados que dividem a SERP e barrados pelo DNA.
    const pairsElsewhere: AnchorPairElsewhere[] = [];
    const blockedByDna: AnchorSerpDiagnosis["blockedByDna"] = [];
    const publishedOverlaps: AnchorSerpDiagnosis["publishedOverlaps"] = [];
    if (serp && medidores.length) {
      for (const keywordId of todas) {
        if (noArtigo.has(keywordId) || params.measureAgainst.includes(keywordId)) continue;
        const keyword = input.keywords.get(keywordId)!;
        const medida = bestAnchorConvergence(medidores, keyword, { siloTokens, serp });
        const forte = medida.overlap?.strength === "strong";
        if (!forte && !(medida.basis === "dna_contradiction" && medida.overlap?.strength === "strong")) continue;
        const paginas = medida.overlap!.sharedPageCount;
        if (keyword.isPublished) { publishedOverlaps.push({ keywordId, keyword: keyword.keyword, sharedPageCount: paginas }); continue; }
        if (medida.basis === "dna_contradiction") { blockedByDna.push({ keywordId, keyword: keyword.keyword, sharedPageCount: paginas, reason: medida.reasons[0] }); continue; }
        const silo = siloDe.get(keywordId) || null;
        const naAncora = ancoraDe.get(keywordId);
        const where: AnchorPairElsewhere["where"] = naAncora
          ? "other_anchor"
          : sobras.has(keywordId)
            ? (silo && silo.siloRef !== params.siloRef ? "leftover_other_silo" : "leftover_same_silo")
            : "other_article";
        const comODono = naAncora && serp ? serp.overlap(naAncora.principalKeywordId, keywordId) : null;
        pairsElsewhere.push({
          keywordId, keyword: keyword.keyword, sharedPageCount: paginas, siloRef: silo?.siloRef ?? null, siloLabel: silo?.siloLabel ?? null, where,
          inAnchorLabel: naAncora?.label ?? null,
          inAnchorPrincipalKeywordId: naAncora?.principalKeywordId ?? null,
          inAnchorPublished: naAncora?.published ?? false,
          sharedWithHolder: comODono && comODono.strength !== "unknown" ? comODono.sharedPageCount : null,
        });
      }
    }
    const porPaginas = <T extends { sharedPageCount: number; keywordId: string }>(left: T, right: T) => right.sharedPageCount - left.sharedPageCount || left.keywordId.localeCompare(right.keywordId);
    pairsElsewhere.sort(porPaginas);
    blockedByDna.sort(porPaginas);
    publishedOverlaps.sort(porPaginas);

    const crossSilo = propostas.filter(proposta => proposta.anchorKeywordId === params.anchorKeywordId
      || (params.kind === "published" && proposta.anchorKind === "published" && proposta.anchorKeywordId === params.principalKeywordId));

    // D2.3 — as sugestões com volume, por volume, no nível Forte ou Provável.
    const suggestions = suggestAnchorReinforcements({
      siloRef: params.siloRef,
      measureAgainst: medidores,
      memberIds: params.memberIds,
      keywords: input.keywords,
      serp,
      locate: localizar,
      subjectDeclared: input.subjectDeclared,
      slotsLeft,
    });
    const sugestoesNoSilo = suggestions.filter(item => item.where === "leftover" || item.where === "new_article");

    // D2.1 — a troca da principal publicada.
    //
    // A substituta só é PROPOSTA quando cabe: já está no artigo, ou o artigo
    // tem vaga. Propor uma que não cabe deixava o botão "Aplicar troca"
    // inativo sem saída (o artigo cheio, nenhum ato para tirar alguém). Se a
    // melhor está fora e o artigo está no teto, o cartão diz qual é e oferece
    // abrir o artigo para liberar uma vaga — nada sai sozinho.
    let swap: PublishedPrimarySwapProposal | null = null;
    let swapIfDeclaredFree: PublishedPrimarySwapProposal | null = null;
    let substituteOutsideFullArticle: AnchorSerpDiagnosis["substituteOutsideFullArticle"] = null;
    const infoPublicada = params.kind === "published" ? input.published.get(params.anchorKeywordId) : undefined;
    if (params.kind === "published" && ancoraKw) {
      const info = infoPublicada || { post: "unknown" as const, url: null, canonical: null, slug: null };
      // D2.3 — a substituta pode vir de fora do artigo: Forte ou Provável, no próprio Silo.
      const deFora = [...new Set([
        ...crossSilo.map(proposta => proposta.keywordId),
        ...pairsElsewhere.filter(par => par.where === "leftover_same_silo").map(par => par.keywordId),
        ...sugestoesNoSilo.map(item => item.keywordId),
      ])].filter(keywordId => !noArtigo.has(keywordId));
      const comoCandidatas = (ids: readonly string[]) => ids
        .map(id => input.keywords.get(id))
        .filter((item): item is ArticleFormationKeyword => Boolean(item))
        .map(item => ({ ...item, volumeValidated: input.volumeValidated.has(item.keywordId), subjectDeclared: input.subjectDeclared?.has(item.keywordId) ?? false }));
      const identity = { url: info.url, canonical: info.canonical, slug: info.slug };
      const cabem = slotsLeft > 0 ? [...params.memberIds, ...deFora] : [...params.memberIds];
      swap = proposePublishedPrimarySwap({ published: ancoraKw, post: info.post, identity, candidates: comoCandidatas(cabem), serp });
      const postoParaMedir = info.post === "unknown" ? "free" as const : info.post;
      if (postoParaMedir === "free" && !slotsLeft && deFora.length) {
        const todas = proposePublishedPrimarySwap({ published: ancoraKw, post: "free", identity, candidates: comoCandidatas([...params.memberIds, ...deFora]), serp });
        const melhor = todas.substitute;
        const atual = info.post === "free" ? swap.substitute : null;
        if (melhor && !noArtigo.has(melhor.keywordId) && (!atual || melhor.volume > atual.volume)) {
          substituteOutsideFullArticle = { keywordId: melhor.keywordId, keyword: melhor.keyword, volume: melhor.volume, sharedPageCount: melhor.sharedPageCount };
        }
      }
      // Posto não declarado: o que SERIA proposto se o dono declarasse "Livre".
      if (info.post === "unknown") {
        swapIfDeclaredFree = proposePublishedPrimarySwap({ published: ancoraKw, post: "free", identity, candidates: comoCandidatas(cabem), serp });
      }
    }

    const serpEvidence = evidenciaDe(params.anchorKeywordId);
    const serpGap = serpEvidence === "missing" ? input.serpGaps?.get(params.anchorKeywordId) ?? null : null;
    const busca = input.reinforcementSearches?.get(params.anchorKeywordId);
    const infoAssunto = params.kind === "subject" ? input.subjects?.get(params.anchorKeywordId) : undefined;
    const pedidoDeBusca: ReinforcementSearchRequest = {
      kind: params.kind,
      anchorKeywordId: params.anchorKeywordId,
      phrase: ancoraKw?.keyword || nome(params.anchorKeywordId),
      destinationUrl: params.kind === "published" ? (infoPublicada?.canonical || infoPublicada?.url || null) : infoAssunto?.destinationUrl ?? null,
      note: infoAssunto?.note ?? null,
      href: input.brandRef ? reinforcementSearchHref(input.brandRef, { kind: params.kind, anchorKeywordId: params.anchorKeywordId }) : null,
    };
    const buscar: SerpSubjectDiagnosisAction = { kind: "search_reinforcement", label: REINFORCEMENT_SEARCH_ACTION_LABEL, search: pedidoDeBusca };
    const paresOutroSilo = pairsElsewhere.filter(par => par.siloRef && par.siloRef !== params.siloRef);
    const paresOutroArtigo = pairsElsewhere.filter(par => !(par.siloRef && par.siloRef !== params.siloRef)
      && (par.where === "other_anchor" || par.where === "other_article" || par.where === "leftover_same_silo"));
    const paresSemVolume = pairsElsewhere.filter(par => !input.volumeValidated.has(par.keywordId));
    const rotulo = params.kind === "published" ? `o artigo "${nome(params.anchorKeywordId)}"` : `o Assunto "${nome(params.anchorKeywordId)}"`;
    const aoRotulo = params.kind === "published" ? `ao artigo "${nome(params.anchorKeywordId)}"` : `ao Assunto "${nome(params.anchorKeywordId)}"`;
    const livreSemSubstituta = params.kind === "published" && swap?.state === "no_candidate";
    const abrirEste: SerpSubjectDiagnosisAction = {
      kind: "open_article",
      label: "Abrir este artigo para liberar uma vaga",
      article: { siloRef: params.siloRef, principalKeywordId: params.principalKeywordId, label: nome(params.anchorKeywordId) },
    };
    const livreFrase = (): string => {
      if (!livreSemSubstituta) return "";
      if (substituteOutsideFullArticle) {
        return ` Posto Livre: a melhor substituta, "${substituteOutsideFullArticle.keyword}" (volume ${substituteOutsideFullArticle.volume}, ${substituteOutsideFullArticle.sharedPageCount} páginas em comum), ficou fora porque o artigo está no teto de 6 — tire uma keyword para ela entrar.`;
      }
      return ` Posto Livre, mas nenhuma keyword do lote serve de substituta (volume maior, mesma intenção e ${SERP_SUBJECT_THRESHOLDS.strongPages}+ páginas em comum): a principal fica até aparecer uma — use "${REINFORCEMENT_SEARCH_ACTION_LABEL}".`;
    };

    // O estado, na ordem da regra.
    let state: SerpSubjectDilemmaState;
    let headline: string;
    const actions: SerpSubjectDiagnosisAction[] = [];
    const semArtigoDeAssunto = params.kind === "subject" && params.memberIds.length === 0;
    const fortes = suggestions.filter(item => item.level === "strong").length;
    const sugestoesFrase = () => {
      const maior = suggestions[0];
      const niveis = [fortes ? `${fortes} Forte` : "", suggestions.length - fortes ? `${suggestions.length - fortes} Provável` : ""].filter(Boolean).join(", ");
      return `${plural(suggestions.length, "sugestão", "sugestões")} com volume para ${rotulo} (${niveis}). A maior: "${maior.keyword}" (volume ${maior.volume}, ${maior.reason}). Marque e aplique de uma vez, até o teto de 6.`;
    };
    if (swap?.state === "proposed" && swap.substitute) {
      state = "swap_proposed";
      headline = `Troca proposta${swap.substitute.level === "probable" ? " (Provável)" : ""}: "${swap.substitute.keyword}" (volume ${swap.substitute.volume}, ${swap.substitute.sharedPageCount} páginas em comum no top 10) assume a principal; "${nome(params.anchorKeywordId)}" vira secundária. URL, slug e canonical não mudam.`;
      actions.push({ kind: "decide_swap", label: "Decidir a troca" });
    } else if (apoios > 0 || (params.kind === "subject" && !semArtigoDeAssunto)) {
      state = "reinforced";
      const base = params.kind === "published"
        ? `Reforçado com ${plural(apoios, "keyword", "keywords")}`
        : `Assunto sustentado por ${plural(params.memberIds.length, "keyword", "keywords")}`;
      const composicao = serp
        ? ` — ${[
          apoiosFortes ? `${plural(apoiosFortes, "divide", "dividem")} a SERP (${SERP_SUBJECT_THRESHOLDS.strongPages}+ páginas)` : "",
          apoiosVizinhanca ? `${apoiosVizinhanca} na vizinhança do Google (${SERP_SUBJECT_THRESHOLDS.supportPages} páginas, confirmada pelas palavras)` : "",
          apoiosSoPalavras ? `${apoiosSoPalavras} só por palavras` : "",
        ].filter(Boolean).join(", ")}`
        : "";
      headline = `${base}${composicao}. ${slotsLeft ? `Cabem mais ${slotsLeft}.` : "No teto de 6."}${livreFrase()}`;
      if (substituteOutsideFullArticle && livreSemSubstituta) actions.push(abrirEste);
      if (crossSilo.length) actions.push({ kind: "review_cross_silo", label: "Ver proposta entre Silos" });
      // Posto Livre sem substituta: a principal está ali PARA SER TROCADA — buscar uma com volume.
      if ((livreSemSubstituta && !substituteOutsideFullArticle) || (slotsLeft && !pairsElsewhere.length && !crossSilo.length)) actions.push(buscar);
    } else if (sugestoesNoSilo.length && !semArtigoDeAssunto) {
      state = "suggestions_available";
      headline = sugestoesFrase();
      actions.push({ kind: "apply_suggestions", label: "Aplicar selecionadas" });
    } else if (crossSilo.length || paresOutroSilo.length) {
      state = "pair_in_other_silo";
      const primeiro = crossSilo[0]
        ? { keyword: crossSilo[0].keyword, siloLabel: crossSilo[0].fromSiloLabel, paginas: crossSilo[0].sharedPageCount ?? null }
        : { keyword: paresOutroSilo[0].keyword, siloLabel: paresOutroSilo[0].siloLabel, paginas: paresOutroSilo[0].sharedPageCount };
      const total = Math.max(crossSilo.length, paresOutroSilo.length);
      headline = `O par de ${rotulo} está em outro Silo: "${primeiro.keyword}" (Silo "${primeiro.siloLabel}"${primeiro.paginas ? `, ${primeiro.paginas} páginas em comum` : ""})${total > 1 ? ` e mais ${total - 1}` : ""}. Mover de Silo é decisão sua.`;
      actions.push(crossSilo.length ? { kind: "review_cross_silo", label: "Ver proposta entre Silos" } : { kind: "review_cross_silo", label: "Ver o par no outro Silo" });
    } else if (semArtigoDeAssunto && paresSemVolume.length && paresSemVolume.length === pairsElsewhere.length) {
      state = "pair_without_volume";
      headline = `Há ${plural(paresSemVolume.length, "keyword", "keywords")} do mesmo assunto no Google (${paresSemVolume.slice(0, 2).map(par => `"${par.keyword}"`).join(", ")}), mas nenhuma com Volume validado para ser a principal. Meça o volume no Processador ou use "${REINFORCEMENT_SEARCH_ACTION_LABEL}".`;
      actions.push({ kind: "measure_volume", label: "Medir volume no Processador" }, buscar);
    } else if (paresOutroArtigo.length) {
      /*
       * O PAR EXISTE, MAS JÁ ESTÁ EM OUTRO ARTIGO DO MESMO SILO.
       *
       * A formação dá cada livre a UM artigo — o que divide mais páginas com
       * ela. Quando dois artigos (em geral dois publicados) tratam do mesmo
       * assunto no Google, um fica com os pares e o outro fica vazio. Dizer
       * "nenhuma keyword do lote trata do mesmo assunto" seria falso: trata,
       * e já está ali ao lado. A disputa é do dono: trazer o par para cá
       * (pela mesa, com "Mover para…"), deixá-lo onde está ou tratar os dois
       * artigos como canibalização.
       */
      state = "pair_in_other_article";
      const primeiro = paresOutroArtigo[0];
      const dono = primeiro.inAnchorLabel;
      const disputaPublicada = Boolean(primeiro.inAnchorPublished) && params.kind === "published";
      const lado = primeiro.sharedWithHolder !== null && primeiro.sharedWithHolder !== undefined
        ? ` (${primeiro.sharedPageCount} páginas em comum com este, ${primeiro.sharedWithHolder} com aquele)`
        : ` (${primeiro.sharedPageCount} páginas em comum com este)`;
      headline = dono
        ? `O Google junta "${primeiro.keyword}" ${aoRotulo}${lado}, mas ela já está no artigo "${dono}"${paresOutroArtigo.length > 1 ? `, com mais ${paresOutroArtigo.length - 1}` : ""}. ${disputaPublicada ? "Os dois publicados disputam o mesmo assunto. " : ""}Decida para onde ela vai: trazer para cá, deixar lá${disputaPublicada ? " ou tratar como canibalização" : ""}.`
        : `O Google junta "${primeiro.keyword}" ${aoRotulo} (${primeiro.sharedPageCount} páginas em comum), mas ela ficou fora de artigo${paresOutroArtigo.length > 1 ? `, com mais ${paresOutroArtigo.length - 1}` : ""}: outra regra a segurou (DNA de outro membro, Assunto ou decisão humana). Decida você.`;
      if (primeiro.inAnchorPrincipalKeywordId && primeiro.siloRef) {
        actions.push({ kind: "open_article", label: `Abrir o artigo "${dono}"`, article: { siloRef: primeiro.siloRef, principalKeywordId: primeiro.inAnchorPrincipalKeywordId, label: dono || primeiro.keyword } });
      }
      actions.push(buscar);
    } else if (blockedByDna.length) {
      state = "pair_blocked_by_dna";
      const primeira = blockedByDna[0];
      headline = `${plural(blockedByDna.length, "keyword trata", "keywords tratam")} do mesmo assunto no Google que ${rotulo} ("${primeira.keyword}", ${primeira.sharedPageCount} páginas em comum), mas o DNA separa: ${primeira.reason.replace(/^.*Mas o DNA separa as duas: /, "").replace(/ — só por decisão humana.$/, "")}. Nada entra sozinho: revise a intenção no Minerador ou decida você.`;
      actions.push({ kind: "review_dna", label: "Revisar a intenção no Minerador" }, buscar);
    } else if (suggestions.length) {
      state = "suggestions_available";
      headline = sugestoesFrase();
      actions.push({ kind: "apply_suggestions", label: "Aplicar selecionadas" });
    } else if (serpEvidence === "missing") {
      state = "serp_missing";
      const alvo = nome(params.anchorKeywordId);
      if (serpGap?.kind === "stale") {
        const quando = serpGap.collectedAt ? new Date(serpGap.collectedAt).toLocaleDateString("pt-BR", { timeZone: "UTC" }) : null;
        headline = `A SERP de "${alvo}" no cache venceu${quando ? ` (coletada em ${quando}${serpGap.ageDays !== null ? `, há ${serpGap.ageDays} dias` : ""})` : ""}: a validade é de 30 dias, e SERP vencida não mede mesmo assunto. Até coletar de novo, a formação volta à regra das palavras. Colete de novo (pago, com plano e confirmação) ou use "${REINFORCEMENT_SEARCH_ACTION_LABEL}".`;
      } else if (serpGap?.kind === "never") {
        headline = `"${alvo}" nunca teve a SERP coletada: não dá para saber o que o Google trata como o mesmo assunto. Colete a SERP (pago, com plano e confirmação) ou use "${REINFORCEMENT_SEARCH_ACTION_LABEL}".`;
      } else {
        headline = `Sem SERP de "${alvo}" no cache: não dá para saber o que o Google trata como o mesmo assunto. Colete a SERP (pago, com plano e confirmação) ou use "${REINFORCEMENT_SEARCH_ACTION_LABEL}".`;
      }
      actions.push({ kind: "collect_serp", label: serpGap?.kind === "stale" ? "Coletar de novo (pago)" : "Coletar SERP (pago)" }, buscar);
    } else if (busca && busca.candidatesWithDemand === 0) {
      state = "no_demand";
      headline = `${NO_DEMAND_MESSAGE[0].toUpperCase()}${NO_DEMAND_MESSAGE.slice(1)}: a busca de reforço (${plural(busca.candidateCount, "candidata", "candidatas")}) não achou keyword com volume para ${rotulo}. A decisão fica com você.`;
      actions.push({ kind: "owner_decides", label: "Decidir o que fazer" });
    } else {
      state = "no_pair_in_batch";
      const canibal = publishedOverlaps.length
        ? ` Só ${publishedOverlaps.length === 1 ? `outro publicado ("${publishedOverlaps[0].keyword}") divide` : `outros ${publishedOverlaps.length} publicados dividem`} a SERP com ele: possível canibalização — publicados nunca se fundem, avalie você.`
        : "";
      headline = params.kind === "subject"
        ? `Assunto · aguardando sustentação: ${NO_SERP_PAIR_IN_BATCH_MESSAGE}. Use "${REINFORCEMENT_SEARCH_ACTION_LABEL}" para pesquisar pelo tema e pela página de destino.`
        : `Artigo "${nome(params.anchorKeywordId)}": ${NO_SERP_PAIR_IN_BATCH_MESSAGE}. Use "${REINFORCEMENT_SEARCH_ACTION_LABEL}" para pesquisar pelo tema e pela URL do artigo.${livreSemSubstituta ? " Posto Livre: a principal fica até a busca trazer uma substituta com volume." : ""}${canibal}`;
      actions.push(buscar);
    }
    if (params.kind === "published" && swap?.state === "unknown_post") actions.push({ kind: "declare_post", label: "Declarar o Posto na Revisão Humana" });

    // As linhas de apoio.
    const details: string[] = [];
    if (params.kind === "published" && swap) details.push(swap.note);
    if (swap?.substitute?.warning) details.push(swap.substitute.warning);
    if (swapIfDeclaredFree?.substitute) {
      details.push(`Se você declarar o Posto "Livre", a troca proposta seria "${swapIfDeclaredFree.substitute.keyword}" (volume ${swapIfDeclaredFree.substitute.volume}, ${swapIfDeclaredFree.substitute.sharedPageCount} páginas em comum). Declarado "Travado ao slug", o artigo só recebe reforço.`);
    }
    if (substituteOutsideFullArticle && !(state === "reinforced" && livreSemSubstituta)) {
      details.push(`"${substituteOutsideFullArticle.keyword}" (volume ${substituteOutsideFullArticle.volume}, ${substituteOutsideFullArticle.sharedPageCount} páginas em comum) seria substituta melhor, mas está fora e o artigo está no teto de 6: abra o artigo e tire uma keyword para ela entrar.`);
    }
    if (serp && serpEvidence === "partial") details.push(`A SERP de "${nome(params.anchorKeywordId)}" está incompleta no cache: falta lente. A medida usa as lentes que existem.`);
    if (!serp) details.push("A mesa ainda não leu a SERP do cache: a medida de mesmo assunto usou só palavras e DNA.");
    if (apoiosSoPalavras && serp) details.push(`${plural(apoiosSoPalavras, "keyword entrou", "keywords entraram")} só por palavras, porque falta SERP no cache de uma das duas.`);
    for (const par of pairsElsewhere.filter(item => item.where === "other_anchor" || item.where === "other_article").slice(0, 3)) {
      const aquele = par.sharedWithHolder !== null && par.sharedWithHolder !== undefined ? ` (${par.sharedWithHolder} com aquele)` : "";
      details.push(`"${par.keyword}" divide ${par.sharedPageCount} páginas com ${rotulo}, mas já está ${par.inAnchorLabel ? `no artigo "${par.inAnchorLabel}"${aquele}` : "em outro artigo"}${par.siloLabel && par.siloRef !== params.siloRef ? ` (Silo "${par.siloLabel}")` : ""}.`);
    }
    for (const par of pairsElsewhere.filter(item => item.where === "leftover_same_silo").slice(0, 3)) {
      details.push(`"${par.keyword}" divide ${par.sharedPageCount} páginas com ${rotulo} e ficou fora: ${slotsLeft ? "outra regra a segurou (DNA de outro membro ou decisão humana)" : "o artigo está no teto de 6"}.`);
    }
    for (const barrada of blockedByDna.slice(0, 3)) details.push(`"${barrada.keyword}": ${barrada.reason}`);
    for (const outra of publishedOverlaps.slice(0, 2)) {
      details.push(`Outro publicado, "${outra.keyword}", divide ${outra.sharedPageCount} páginas do top 10: as duas páginas disputam o mesmo assunto no Google (possível canibalização). Publicados nunca se fundem — avalie você.`);
    }

    return {
      kind: params.kind,
      anchorKeywordId: params.anchorKeywordId,
      anchorLabel: nome(params.anchorKeywordId),
      siloRef: params.siloRef,
      siloLabel: params.siloLabel,
      principalKeywordId: params.principalKeywordId,
      state,
      headline,
      details,
      members,
      slotsLeft,
      serpEvidence,
      swap,
      swapIfDeclaredFree,
      substituteOutsideFullArticle,
      serpGap,
      crossSilo,
      pairsElsewhere,
      blockedByDna,
      publishedOverlaps,
      actions,
      suggestions,
    };
  };

  const diagnosticos: AnchorSerpDiagnosis[] = [];
  for (const silo of input.silos) {
    for (const ancora of silo.plan.anchors) {
      if (ancora.kind === "published") {
        diagnosticos.push(diagnosticar({
          kind: "published", anchorKeywordId: ancora.principalKeywordId, siloRef: silo.siloRef, siloLabel: silo.siloLabel, siloTokens: silo.siloTokens || new Set<string>(),
          principalKeywordId: ancora.principalKeywordId, memberIds: ancora.keywordIds, measureAgainst: [ancora.principalKeywordId],
        }));
      } else {
        const assunto = ancora.subjectKeywordId || ancora.principalKeywordId;
        diagnosticos.push(diagnosticar({
          kind: "subject", anchorKeywordId: assunto, siloRef: silo.siloRef, siloLabel: silo.siloLabel, siloTokens: silo.siloTokens || new Set<string>(),
          principalKeywordId: ancora.principalKeywordId, memberIds: ancora.keywordIds,
          measureAgainst: [...new Set([ancora.principalKeywordId, assunto])],
        }));
      }
    }
    for (const assunto of silo.plan.awaitingSubjectKeywordIds) {
      diagnosticos.push(diagnosticar({
        kind: "subject", anchorKeywordId: assunto, siloRef: silo.siloRef, siloLabel: silo.siloLabel, siloTokens: silo.siloTokens || new Set<string>(),
        principalKeywordId: assunto, memberIds: [], measureAgainst: [assunto],
      }));
    }
  }
  return diagnosticos;
}

/* --------------------------------- resumo --------------------------------- */

export type SerpSubjectDiagnosisSummary = {
  published: number;
  subjects: number;
  byState: Record<SerpSubjectDilemmaState, number>;
  /** A frase do lote inteiro, para o topo da mesa. */
  headline: string;
};

export function summarizeSerpSubjectDiagnoses(diagnoses: readonly AnchorSerpDiagnosis[]): SerpSubjectDiagnosisSummary {
  const byState = Object.fromEntries(SERP_SUBJECT_DILEMMA_STATES.map(state => [state, 0])) as Record<SerpSubjectDilemmaState, number>;
  for (const diagnostico of diagnoses) byState[diagnostico.state] += 1;
  const published = diagnoses.filter(item => item.kind === "published").length;
  const subjects = diagnoses.length - published;
  const partes = SERP_SUBJECT_DILEMMA_STATES
    .filter(state => byState[state] > 0)
    .map(state => `${byState[state]} ${SERP_SUBJECT_DILEMMA_LABELS[state].toLowerCase()}`);
  return {
    published,
    subjects,
    byState,
    headline: diagnoses.length
      ? `${plural(published, "publicado", "publicados")} e ${plural(subjects, "Assunto", "Assuntos")}: ${partes.join(", ")}.`
      : "Nenhum publicado nem Assunto neste lote.",
  };
}
