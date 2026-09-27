/**
 * PRECEDÊNCIA DA FORMAÇÃO — PUBLICADOS, ASSUNTOS, LIVRES, E SÓ ENTÃO O NOVO.
 *
 * Regras do dono (docs/compartilhado/regras-serp-e-assuntos-2026-09-26.md,
 * Parte D): "quem tem prioridade são os publicados e os assuntos, o resto
 * depois". Dentro de cada Silo, nesta ordem:
 *
 *   1. PUBLICADOS (D1/D2) — reconhecidos pelo Vínculo, mesmo com status
 *      "aprovado". Cada página é âncora fixa e principal do próprio artigo;
 *      primeiro recebe as sustentações do Assunto declarado NELA (quando a
 *      publicada é também Assunto), depois as livres compatíveis, até seis.
 *   2. ASSUNTOS DECLARADOS (D1/D3) — troncos. As sustentações sugeridas pelo
 *      Minerador (proveniência da Pesquisa por Assunto, entidade, intenção e
 *      funil) formam o artigo com Principal de Volume validado; o Assunto com
 *      Volume é a própria principal (B5). UM artigo por Assunto: a
 *      sustentação que não coube ou não convergiu volta a ser livre, com o
 *      Assunto de origem. Sem Principal elegível, as sustentações são
 *      oferecidas às âncoras e, sem encaixe, esperam visíveis, com motivo.
 *   3. LIVRES (D1/D7) — o que sobrou forma núcleos semânticos. Livre sozinha
 *      é oferecida antes a publicado/Assunto com vaga.
 *   4. TETO (D4) — nenhum candidato automático passa de seis. O excedente é
 *      oferecido aos publicados e Assuntos com vaga; depois forma artigo
 *      próprio só com fronteira comprovada (converge com outra busca e NÃO
 *      converge com a principal do artigo de origem); o resto fica em Keywords não
 *      agrupadas, com o motivo. Nada some (D8).
 *
 * O DNA vem primeiro (D5): intenção, funil e SERP conclusiva divergentes
 * impedem o agrupamento automático (`formationDnaContradiction`).
 *
 * D2.2 — MESMO ASSUNTO É O QUE A SERP DIZ. Com o índice de SERP da mesa
 * (`serpSubject`, lido do cache já pago), o reforço de publicado, a
 * sustentação de Assunto e as propostas entre Silos usam as PÁGINAS EM COMUM
 * no top 10 nas 4 lentes como critério principal; palavras e DNA desempatam
 * (`serp-subject-convergence.ts`). Sem o índice, tudo é como antes.
 *
 * D2.3 — VOLUME PRIMEIRO, E A INTENÇÃO QUE BARRA É A DA SERP (2026-09-27).
 * Com o índice de SERP da mesa: keyword sem volume (nulo ou zero) não reforça
 * publicado nem sustenta Assunto — fica nas sobras, recolhida; e só a
 * intenção e o funil OBSERVADOS na SERP separam duas keywords — a Lógica que
 * diverge vira aviso (`serpAwareDnaBarrier`). Sem o índice, a regra de antes.
 *
 * Domínio puro: sem React, sem storage, sem rede, sem provider.
 */
import {
  AFFINITY_FLOOR,
  CANNIBAL_FLOOR,
  MAX_ARTICLE_KEYWORDS,
  automaticFormationHoldouts,
  buildArticleFormationUniverse,
  formationDnaContradiction,
  sameArticleAffinity,
  suggestPrincipal,
  type ArticleFormationKeyword,
  type ArticleFormationUniverse,
  type PublishedArticleRef,
} from "./article-formation.ts";
import { normalizePublishedAddress, regroupFreeAroundPublished } from "./published-silo-membership.ts";
import { buildSemanticSignature, deriveSemanticNuclei, splitNucleusIfEditorialBoundary, type SemanticNucleus } from "./semantic-nucleus.ts";
import type { KeywordDnaSignals } from "./keyword-dna-signals.ts";
import { bestAnchorConvergence, measureAnchorConvergence, serpAwareDnaBarrier, type AnchorConvergenceBasis } from "./serp-subject-convergence.ts";
import type { SerpSubjectIndex } from "./serp-subject-overlap.ts";
import { hasSearchVolume } from "./serp-subject-suggestions.ts";

type Group = { principalKeywordId: string; keywordIds: string[] };
type Attachment = { publishedKeywordId: string; affinity: number; reasons: string[] };

const porAfinidade = (anchor: ArticleFormationKeyword, siloTokens: ReadonlySet<string>) =>
  (left: ArticleFormationKeyword, right: ArticleFormationKeyword) =>
    sameArticleAffinity(anchor, right, siloTokens).affinity - sameArticleAffinity(anchor, left, siloTokens).affinity
    || left.keywordId.localeCompare(right.keywordId);

/**
 * A ordem das candidatas diante de uma âncora: com SERP, a convergência
 * (páginas em comum primeiro); sem SERP, a afinidade por palavras de antes.
 */
const porConvergencia = (anchors: readonly ArticleFormationKeyword[], siloTokens: ReadonlySet<string>, serp: SerpSubjectIndex | null | undefined) => {
  if (!serp) return porAfinidade(anchors[0], siloTokens);
  const nota = new Map<string, number>();
  const score = (keyword: ArticleFormationKeyword) => {
    if (!nota.has(keyword.keywordId)) nota.set(keyword.keywordId, bestAnchorConvergence(anchors, keyword, { siloTokens, serp }).score);
    return nota.get(keyword.keywordId)!;
  };
  return (left: ArticleFormationKeyword, right: ArticleFormationKeyword) => score(right) - score(left) || left.keywordId.localeCompare(right.keywordId);
};

/**
 * D5 — a candidata não contradiz o DNA de NENHUM membro já admitido.
 * D2.3 — com o índice de SERP, só a intenção observada na SERP barra; sem ele,
 * a regra de antes (`formationDnaContradiction`).
 */
const semContradicao = (keyword: ArticleFormationKeyword, membros: readonly ArticleFormationKeyword[], serp?: SerpSubjectIndex | null) =>
  membros.every(membro => !serpAwareDnaBarrier(membro, keyword, serp));

/** D2.3 — com o índice de SERP, só keyword com volume reforça ou sustenta. Sem índice, todas (regra de antes). */
const reforcaComVolume = (keyword: ArticleFormationKeyword, serp: SerpSubjectIndex | null | undefined) => !serp || hasSearchVolume(keyword.volume);

/**
 * As que cabem ao lado da âncora, até as vagas: no piso de convergência com
 * ela e sem contradição de DNA com nenhum membro já admitido.
 */
function compativeis(
  anchor: ArticleFormationKeyword,
  pool: readonly ArticleFormationKeyword[],
  siloTokens: ReadonlySet<string>,
  vagas: number,
  membros: readonly ArticleFormationKeyword[] = [anchor],
  /** D2.2 — com SERP, a convergência mede contra a âncora e contra o Assunto dela. */
  serp?: { index: SerpSubjectIndex; subject?: ArticleFormationKeyword | null } | null,
) {
  const admitidas: ArticleFormationKeyword[] = [];
  const ancoras = serp?.subject ? [anchor, serp.subject] : [anchor];
  const ordenadas = pool
    .filter(keyword => keyword.keywordId !== anchor.keywordId && !membros.some(membro => membro.keywordId === keyword.keywordId))
    .filter(keyword => reforcaComVolume(keyword, serp?.index))
    .filter(keyword => serp
      ? bestAnchorConvergence(ancoras, keyword, { siloTokens, serp: serp.index }).eligible
      : sameArticleAffinity(anchor, keyword, siloTokens).affinity >= AFFINITY_FLOOR)
    .sort(porConvergencia(ancoras, siloTokens, serp?.index));
  for (const keyword of ordenadas) {
    if (admitidas.length >= vagas) break;
    if (semContradicao(keyword, [...membros, ...admitidas], serp?.index)) admitidas.push(keyword);
  }
  return admitidas;
}

/** Planejamento local: identidade publicada, troncos declarados, depois livres. */
export function reservePriorityArticleGroups(input: {
  published: readonly ArticleFormationKeyword[];
  free: readonly ArticleFormationKeyword[];
  subjectClaims: readonly { subjectKeywordId: string; keywordIds: readonly string[] }[];
  principalEligibleKeywordIds: ReadonlySet<string>;
  siloTokens: ReadonlySet<string>;
  /** Assuntos declarados COM Volume validado: são a principal do próprio artigo (B5). */
  subjectPrincipals?: readonly ArticleFormationKeyword[];
  /** Nome legível de uma keyword, para os motivos. */
  nameOf?: (keywordId: string) => string;
  /** D2.2 — o índice de SERP da mesa (cache já pago). Sem ele, a regra das palavras. */
  serpSubject?: SerpSubjectIndex | null;
  /** A linha de uma keyword do Silo (a frase do Assunto também mede SERP). */
  keywordOf?: (keywordId: string) => ArticleFormationKeyword | undefined;
}): {
  publishedGroups: Group[];
  subjectGroups: Array<Group & { subjectKeywordId: string }>;
  remainingFree: ArticleFormationKeyword[];
  awaitingSubject: string[];
  attached: Map<string, Attachment>;
  /** Por que cada sustentação ficou fora de artigo. */
  deferred: Map<string, string>;
  /**
   * D1/D4/D7 — UM ARTIGO POR ASSUNTO. As sustentações que não couberam ou não
   * convergiram com a Principal do artigo do Assunto voltam a ser livres (estão
   * em `remainingFree`), com o Assunto e a Principal de origem, para serem
   * oferecidas às âncoras e, sem encaixe, ficarem fora com motivo.
   */
  releasedSupports: Map<string, { subjectKeywordId: string; principalKeywordId: string }>;
} {
  const nome = input.nameOf || ((keywordId: string) => keywordId);
  const serp = input.serpSubject || null;
  const publishedIds = new Set(input.published.map(keyword => keyword.keywordId));
  const livres = new Map(input.free.filter(keyword => !keyword.humanFormationRef).map(keyword => [keyword.keywordId, keyword]));

  // Duas declarações disputando a mesma busca não autorizam escolher um
  // tronco arbitrariamente pela ordem dos IDs. A busca espera revisão.
  const claimCounts = new Map<string, number>();
  for (const claim of input.subjectClaims) {
    for (const keywordId of new Set(claim.keywordIds)) claimCounts.set(keywordId, (claimCounts.get(keywordId) ?? 0) + 1);
  }
  const disputadas = new Set([...claimCounts].filter(([keywordId, count]) => count > 1 && livres.has(keywordId)).map(([keywordId]) => keywordId));

  /*
   * 1a — O ASSUNTO DECLARADO NUMA PÁGINA PUBLICADA.
   *
   * A publicada prevalece (D2): ela é a principal, e o Assunto dela é o
   * tronco do próprio artigo. As sustentações sugeridas para esse Assunto
   * entram PRIMEIRO na página que está no ar — nunca num artigo novo que a
   * concorreria com principal livre.
   */
  const attached = new Map<string, Attachment>();
  const ocupadas = new Map<string, number>();
  for (const claim of input.subjectClaims) {
    if (!publishedIds.has(claim.subjectKeywordId)) continue;
    const publicada = input.published.find(keyword => keyword.keywordId === claim.subjectKeywordId)!;
    const pool = claim.keywordIds
      .filter(keywordId => livres.has(keywordId) && !disputadas.has(keywordId) && !attached.has(keywordId))
      .map(keywordId => livres.get(keywordId)!)
      .filter(keyword => reforcaComVolume(keyword, serp))
      .sort(porConvergencia([publicada], input.siloTokens, serp));
    const vagas = MAX_ARTICLE_KEYWORDS - 1 - (ocupadas.get(publicada.keywordId) ?? 0);
    const admitidas: ArticleFormationKeyword[] = [];
    for (const keyword of pool) {
      if (admitidas.length >= vagas) break;
      if (semContradicao(keyword, [publicada, ...admitidas], serp)) admitidas.push(keyword);
    }
    for (const keyword of admitidas) {
      const medida = serp ? measureAnchorConvergence(publicada, keyword, { siloTokens: input.siloTokens, serp }) : null;
      const { affinity, reasons } = medida ? { affinity: medida.score, reasons: medida.reasons } : sameArticleAffinity(publicada, keyword, input.siloTokens);
      attached.set(keyword.keywordId, {
        publishedKeywordId: publicada.keywordId,
        affinity,
        reasons: [`sustentação sugerida para o Assunto declarado nesta página publicada`, ...reasons],
      });
      ocupadas.set(publicada.keywordId, (ocupadas.get(publicada.keywordId) ?? 0) + 1);
    }
  }

  // 1b — A publicada disputa as livres ANTES de qualquer candidato novo. Cada
  // keyword é uma unidade aqui; nenhuma proposta livre já formada limita a
  // chance de fortalecer o patrimônio que está no ar.
  /*
   * A sustentação sugerida para um Assunto (proveniência, entidade, intenção e
   * funil vindos do Minerador) vai a ele, e não a uma publicada só parecida.
   * A exceção é a canibalização: se a busca pede o MESMO conteúdo da página
   * que está no ar (piso de canibalização), um artigo novo a concorreria, e
   * a publicada prevalece (D1/D2).
   */
  const reivindicadas = new Set(input.subjectClaims
    .filter(claim => !publishedIds.has(claim.subjectKeywordId))
    .flatMap(claim => claim.keywordIds));
  const anexarAsPublicadas = (todas: readonly ArticleFormationKeyword[], piso: number) => {
    const candidatas = todas.filter(keyword => reforcaComVolume(keyword, serp));
    if (!candidatas.length || !input.published.length) return;
    const passada = regroupFreeAroundPublished({
      keywords: [...input.published, ...candidatas],
      freeGroups: candidatas.map(keyword => ({ principalKeywordId: keyword.keywordId, keywordIds: [keyword.keywordId] })),
      siloTokens: input.siloTokens,
      minimumAffinity: piso,
      occupiedSlots: ocupadas,
      ...(serp ? { convergenceOf: (publicada: ArticleFormationKeyword, livre: ArticleFormationKeyword) => measureAnchorConvergence(publicada, livre, { siloTokens: input.siloTokens, serp, floor: piso }) } : {}),
    });
    // D5 — dentro da página, nenhum reforço contradiz o DNA de outro.
    const membrosDe = (publicadaId: string) => [
      input.published.find(keyword => keyword.keywordId === publicadaId)!,
      ...[...attached].filter(([, destino]) => destino.publishedKeywordId === publicadaId).map(([keywordId]) => livres.get(keywordId)!).filter(Boolean),
    ];
    const ordenadas = [...passada.attached].sort((left, right) => right[1].affinity - left[1].affinity || left[0].localeCompare(right[0]));
    for (const [keywordId, destino] of ordenadas) {
      const keyword = livres.get(keywordId);
      if (!keyword || !semContradicao(keyword, membrosDe(destino.publishedKeywordId), serp)) continue;
      attached.set(keywordId, destino);
      ocupadas.set(destino.publishedKeywordId, (ocupadas.get(destino.publishedKeywordId) ?? 0) + 1);
    }
  };
  anexarAsPublicadas(input.free.filter(keyword => !attached.has(keyword.keywordId) && !reivindicadas.has(keyword.keywordId)), AFFINITY_FLOOR);
  anexarAsPublicadas(input.free.filter(keyword => !attached.has(keyword.keywordId) && reivindicadas.has(keyword.keywordId)), CANNIBAL_FLOOR);
  const publishedGroups = input.published.map(publicada => ({
    principalKeywordId: publicada.keywordId,
    keywordIds: [
      publicada.keywordId,
      ...[...attached].filter(([, destino]) => destino.publishedKeywordId === publicada.keywordId).map(([keywordId]) => keywordId),
    ],
  }));

  // 2 — Assuntos declarados reservam as sustentações restantes.
  const available = new Map(input.free
    .filter(keyword => !attached.has(keyword.keywordId) && !keyword.humanFormationRef)
    .map(keyword => [keyword.keywordId, keyword]));
  const claimed = new Set([...disputadas].filter(keywordId => available.has(keywordId)));
  const subjectGroups: Array<Group & { subjectKeywordId: string }> = [];
  const assuntosComArtigo = new Set<string>();
  const donoDaSustentacao = new Map<string, string>();
  const releasedSupports = new Map<string, { subjectKeywordId: string; principalKeywordId: string }>();
  for (const claim of input.subjectClaims) {
    if (publishedIds.has(claim.subjectKeywordId)) continue;
    const pool = claim.keywordIds
      .filter(keywordId => !claimed.has(keywordId) && available.has(keywordId))
      .map(keywordId => available.get(keywordId)!);
    for (const keyword of pool) {
      claimed.add(keyword.keywordId);
      donoDaSustentacao.set(keyword.keywordId, claim.subjectKeywordId);
    }
    /*
     * D1/D4/D7 — UM ARTIGO POR ASSUNTO.
     *
     * O laço antigo repetia a escolha de Principal até esgotar as
     * sustentações: cada uma que não convergia com a primeira virava um
     * artigo novo de uma keyword só (o padrão dos "35 candidatos de uma
     * keyword"), e doze sustentações viravam dois artigos de seis que se
     * canibalizavam. O Assunto forma UM artigo; o que não coube ou não
     * convergiu volta a ser livre, com o Assunto de origem, para reforçar
     * outra âncora ou ficar em Keywords não agrupadas com motivo.
     */
    let artigo: string[] | null = null;
    // B5 — o Assunto com Volume validado é a principal do próprio artigo.
    const assuntoPrincipal = input.subjectPrincipals?.find(keyword => keyword.keywordId === claim.subjectKeywordId);
    if (!assuntosComArtigo.has(claim.subjectKeywordId)) {
      if (assuntoPrincipal) {
        artigo = [assuntoPrincipal.keywordId, ...compativeis(assuntoPrincipal, pool, input.siloTokens, MAX_ARTICLE_KEYWORDS - 1, [assuntoPrincipal], serp ? { index: serp } : null).map(keyword => keyword.keywordId)];
      } else {
        const eligible = pool.filter(keyword => input.principalEligibleKeywordIds.has(keyword.keywordId));
        const principal = suggestPrincipal({ keywords: eligible, siloTokens: input.siloTokens });
        const anchor = principal ? pool.find(keyword => keyword.keywordId === principal.keywordId) : undefined;
        const frase = serp ? input.keywordOf?.(claim.subjectKeywordId) ?? null : null;
        if (anchor) artigo = [anchor.keywordId, ...compativeis(anchor, pool, input.siloTokens, MAX_ARTICLE_KEYWORDS - 1, [anchor], serp ? { index: serp, subject: frase } : null).map(keyword => keyword.keywordId)];
      }
    }
    if (!artigo) continue;
    subjectGroups.push({ principalKeywordId: artigo[0], keywordIds: artigo, subjectKeywordId: claim.subjectKeywordId });
    assuntosComArtigo.add(claim.subjectKeywordId);
    const noArtigo = new Set(artigo);
    for (const keyword of pool) {
      if (noArtigo.has(keyword.keywordId)) continue;
      claimed.delete(keyword.keywordId);
      releasedSupports.set(keyword.keywordId, { subjectKeywordId: claim.subjectKeywordId, principalKeywordId: artigo[0] });
    }
  }
  // D3 — o Assunto com Volume, sem sustentação ainda, é um artigo completo
  // que aguarda: nunca vira sobra nem "isolado".
  for (const assunto of input.subjectPrincipals || []) {
    if (assuntosComArtigo.has(assunto.keywordId)) continue;
    subjectGroups.push({ principalKeywordId: assunto.keywordId, keywordIds: [assunto.keywordId], subjectKeywordId: assunto.keywordId });
    assuntosComArtigo.add(assunto.keywordId);
  }
  const grouped = new Set(subjectGroups.flatMap(group => group.keywordIds));
  const awaitingSubject = [...claimed].filter(keywordId => !grouped.has(keywordId));
  const deferred = new Map<string, string>();
  for (const keywordId of awaitingSubject) {
    deferred.set(keywordId, disputadas.has(keywordId)
      ? "sustentação disputada por dois Assuntos declarados; aguarda decisão humana"
      : `sustentação do Assunto "${nome(donoDaSustentacao.get(keywordId) || "")}" aguarda uma Principal com Volume validado ou a confirmação humana`);
  }
  return {
    publishedGroups,
    subjectGroups,
    remainingFree: input.free.filter(keyword => !attached.has(keyword.keywordId) && !claimed.has(keyword.keywordId)),
    awaitingSubject,
    attached,
    deferred,
    releasedSupports,
  };
}

/* ------------------------------ planejador ------------------------------ */

export type SiloFormationNucleusInfo = {
  label: string;
  anchors: string[];
  reasons: string[];
  keywordIds: string[];
  siloRef: string;
};

/**
 * D1 — O LOTE DIZ O OBJETIVO.
 *
 * `improve`: o lote recebido tem publicado ou Assunto declarado. O dono quer
 * MELHORÁ-LOS: as livres reforçam publicados e Assuntos, e a sobra sem encaixe
 * fica em Keywords não agrupadas, com motivo, sem virar artigo novo sozinha.
 * `new`: lote todo novo, sem publicado nem Assunto; as livres formam artigos.
 */
export type FormationBatchObjective = "improve" | "new";

/** Publicado ou Assunto com artigo: destino das livres, com a composição de agora. */
export type SiloFormationAnchor = {
  kind: "published" | "subject";
  principalKeywordId: string;
  keywordIds: string[];
  subjectKeywordId?: string;
  /**
   * D2.3 (aditivo) — publicado cuja composição já foi decidida por humano
   * (revisão na mesa ou sugestões aplicadas). A formação não mexe nele; ele
   * aparece aqui só para continuar com cartão e sugestões no diagnóstico.
   */
  humanDecided?: boolean;
};

/** Frase fixa do motivo da sobra no modo melhorar: a tela e o catálogo citam a mesma ação. */
export const FORM_NEW_FROM_LEFTOVERS_ACTION = "Formar artigos novos com as sobras";

export type SiloFormationPlan = {
  universe: ArticleFormationUniverse;
  /** Por que cada keyword está no grupo em que está. Só sinal usado. */
  nucleusByKeywordId: Map<string, SiloFormationNucleusInfo>;
  /** Por que dois núcleos vizinhos não viraram um. */
  separations: Array<{ left: string; reasons: string[] }>;
  /** O objetivo aplicado a este Silo, já considerando a ação explícita do dono. */
  objective: FormationBatchObjective;
  /** O dono pediu artigos novos com as sobras (ação explícita). */
  formNewFromLeftovers: boolean;
  /** Publicados e Assuntos com artigo neste Silo, com a composição final. */
  anchors: SiloFormationAnchor[];
  /** Assuntos declarados sem Volume e ainda sem artigo: aguardam sustentação (D3). */
  awaitingSubjectKeywordIds: string[];
  /**
   * Livres que não encontraram publicado nem Assunto compatível NESTE Silo e
   * ficaram fora de artigo no modo melhorar. São as candidatas a reforçar um
   * publicado ou Assunto de OUTRO Silo — só por proposta confirmada (D8).
   */
  leftoverKeywordIds: string[];
};

/** Um núcleo maior que o teto se divide em TODAS as fronteiras reais, não só na primeira. */
function dividirEmFronteiras(nucleus: SemanticNucleus, signatures: Parameters<typeof splitNucleusIfEditorialBoundary>[0]["signatures"], profundidade = 0): SemanticNucleus[] {
  const partes = splitNucleusIfEditorialBoundary({ nucleus, signatures, ceiling: MAX_ARTICLE_KEYWORDS });
  if (partes.length === 1 || profundidade >= 4) return partes;
  return partes.flatMap(parte => dividirEmFronteiras(parte, signatures, profundidade + 1));
}

/** As páginas publicadas do Silo pelo Vínculo, com o catálogo do site como evidência adicional. */
export function publishedArticleRefsOf(input: {
  keywords: readonly ArticleFormationKeyword[];
  publishedPages?: readonly { keywordId: string; url: string | null; canonical: string | null }[];
  catalogPages?: readonly PublishedArticleRef[];
}): PublishedArticleRef[] {
  const porId = new Map(input.keywords.map(keyword => [keyword.keywordId, keyword]));
  const refs: PublishedArticleRef[] = [];
  const vistos = new Set<string>();
  /*
   * D2 — O PUBLICADO É RECONHECIDO PELO VÍNCULO.
   *
   * A contagem "artigos publicados reconhecidos" lia só o catálogo rastreado
   * do site; marca sem sitemap contava zero com 21 páginas no ar. Cada
   * keyword com identidade publicada é uma página, com o endereço do Vínculo.
   */
  for (const keyword of input.keywords) {
    if (!keyword.isPublished) continue;
    const pagina = input.publishedPages?.find(item => item.keywordId === keyword.keywordId);
    const endereco = normalizePublishedAddress(pagina?.canonical || pagina?.url);
    const chave = endereco ? `${endereco.host}${endereco.path}` : `vinculo:${keyword.keywordId}`;
    if (vistos.has(chave)) continue;
    vistos.add(chave);
    refs.push({
      normalizedUrl: chave,
      path: endereco?.path || "",
      label: keyword.keyword,
      canonical: pagina?.canonical || pagina?.url || null,
      matchedKeywordId: keyword.keywordId,
    });
  }
  for (const pagina of input.catalogPages || []) {
    const endereco = normalizePublishedAddress(pagina.canonical || pagina.normalizedUrl);
    const chave = endereco ? `${endereco.host}${endereco.path}` : pagina.normalizedUrl;
    if (vistos.has(chave)) continue;
    vistos.add(chave);
    const casada = pagina.matchedKeywordId && porId.get(pagina.matchedKeywordId)?.isPublished ? pagina.matchedKeywordId : null;
    refs.push({ ...pagina, matchedKeywordId: casada });
  }
  return refs;
}

/**
 * Planeja a formação de UM Silo aplicando a Parte D inteira e devolve o
 * universo pronto para a mesa, com a explicação de cada agrupamento.
 */
export function planSiloArticleFormation(input: {
  siloRef: string;
  siloLabel: string;
  siloSlug: string | null;
  siloContext?: Parameters<typeof buildArticleFormationUniverse>[0]["siloContext"];
  /** Tokens do tema do Silo, descontados da convergência. */
  siloTokens: ReadonlySet<string>;
  keywords: readonly ArticleFormationKeyword[];
  /** Sinais do KeywordDNA aprovado por keyword, para os núcleos semânticos. */
  dnaSignals?: ReadonlyMap<string, KeywordDnaSignals>;
  /** Assunto de cada keyword pelo pacote aprovado. */
  subjects?: ReadonlyMap<string, { declared: boolean; volumeValidated: boolean }>;
  /** Sustentações sugeridas pelo Minerador para cada Assunto (proveniência, entidade, intenção e funil). */
  subjectClaims?: readonly { subjectKeywordId: string; keywordIds: readonly string[] }[];
  /** Endereço do Vínculo de cada publicada. */
  publishedPages?: readonly { keywordId: string; url: string | null; canonical: string | null }[];
  /** Folhas do catálogo rastreado do site sob este Silo (evidência adicional). */
  catalogPages?: readonly PublishedArticleRef[];
  subjectByCandidateRef?: ReadonlyMap<string, string>;
  siloSubjectKeywordId?: string | null;
  /**
   * D1 — o objetivo do LOTE recebido (todas as keywords da marca no
   * Arquiteto, não só as deste Silo). Sem ele, o próprio Silo decide: tem
   * publicado ou Assunto declarado → melhorar.
   */
  batchObjective?: FormationBatchObjective;
  /** Ação explícita do dono: "Formar artigos novos com as sobras" (D1.4). */
  formNewFromLeftovers?: boolean;
  /**
   * D2.2 — o índice de SERP da mesa, lido do cache já pago
   * (`POST /api/arquiteto/serp-subject`). Com ele, reforço de publicado e
   * sustentação de Assunto usam as páginas em comum no top 10 como critério
   * principal. Sem ele, a formação é a de antes.
   */
  serpSubject?: SerpSubjectIndex | null;
}): SiloFormationPlan {
  const porId = new Map(input.keywords.map(keyword => [keyword.keywordId, keyword]));
  const nome = (keywordId: string) => porId.get(keywordId)?.keyword || keywordId;
  const declarado = (keywordId: string) => input.subjects?.get(keywordId)?.declared === true;
  const comVolume = (keywordId: string) => input.subjects?.get(keywordId)?.volumeValidated === true;
  const siloTokens = input.siloTokens;
  const serp = input.serpSubject || null;
  /*
   * D1 — O LOTE DIZ O OBJETIVO. Com publicado ou Assunto no lote, a
   * formação melhora o que existe; artigo novo com as sobras só pela ação
   * explícita do dono ("Formar artigos novos com as sobras").
   */
  const temAncoraNoSilo = input.keywords.some(keyword => keyword.isPublished || declarado(keyword.keywordId));
  const objective: FormationBatchObjective = input.batchObjective ?? (temAncoraNoSilo ? "improve" : "new");
  const formNewFromLeftovers = Boolean(input.formNewFromLeftovers);
  const melhorar = objective === "improve" && !formNewFromLeftovers;

  const holdouts =automaticFormationHoldouts({ siloRef: input.siloRef, keywords: input.keywords, subjectByCandidateRef: input.subjectByCandidateRef });
  // Publicada com revisão humana tem composição decidida: nada entra nela sozinho.
  const publicadas = input.keywords.filter(keyword => keyword.isPublished && !keyword.humanFormationRef);
  const assuntosPrincipais = input.keywords.filter(keyword => !keyword.isPublished && declarado(keyword.keywordId) && comVolume(keyword.keywordId)
    && !holdouts.has(keyword.keywordId) && !keyword.humanFormationRef);
  const livres = input.keywords.filter(keyword => !keyword.isPublished && !holdouts.has(keyword.keywordId)
    && !keyword.humanFormationRef && !declarado(keyword.keywordId));

  const reserva = reservePriorityArticleGroups({
    published: publicadas,
    free: livres,
    subjectClaims: input.subjectClaims || [],
    principalEligibleKeywordIds: new Set(livres.filter(keyword => comVolume(keyword.keywordId)).map(keyword => keyword.keywordId)),
    siloTokens,
    subjectPrincipals: assuntosPrincipais,
    nameOf: nome,
    ...(serp ? { serpSubject: serp, keywordOf: (keywordId: string) => porId.get(keywordId) } : {}),
  });

  const nucleusByKeywordId = new Map<string, SiloFormationNucleusInfo>();
  const separations: SiloFormationPlan["separations"] = [];
  const deferred = new Map(reserva.deferred);

  /*
   * ÂNCORAS COM VAGA: publicadas e Assuntos. Toda livre que sobra de um
   * núcleo — excedente do teto ou candidata a artigo de uma keyword só — é
   * oferecida a elas antes de virar artigo novo (D1/D7).
   */
  type Ancora = { kind: "published" | "subject"; principal: ArticleFormationKeyword; keywordIds: string[]; subjectKeywordId?: string };
  const ancoras: Ancora[] = [
    ...reserva.publishedGroups.map(group => ({ kind: "published" as const, principal: porId.get(group.principalKeywordId)!, keywordIds: [...group.keywordIds] })),
    ...reserva.subjectGroups.map(group => ({ kind: "subject" as const, principal: porId.get(group.principalKeywordId)!, keywordIds: [...group.keywordIds], subjectKeywordId: group.subjectKeywordId })),
  ].filter(ancora => Boolean(ancora.principal));
  /** D2.2 — o porquê de cada livre que a SERP levou a uma âncora (só com índice). */
  const porqueNaAncora = new Map<string, string[]>();
  /** D2.2 — com SERP, a âncora é medida pela principal E pela frase do Assunto dela. */
  const medirNaAncora = (ancora: Ancora, keyword: ArticleFormationKeyword) => {
    if (!serp) {
      const affinity = sameArticleAffinity(ancora.principal, keyword, siloTokens).affinity;
      return { eligible: affinity >= AFFINITY_FLOOR, score: affinity, reasons: [] as string[] };
    }
    const frase = ancora.subjectKeywordId ? porId.get(ancora.subjectKeywordId) : undefined;
    return bestAnchorConvergence(frase ? [ancora.principal, frase] : [ancora.principal], keyword, { siloTokens, serp });
  };
  const oferecerAsAncoras = (keyword: ArticleFormationKeyword): Ancora | null => {
    if (!reforcaComVolume(keyword, serp)) return null;
    const destino = ancoras
      .filter(ancora => ancora.keywordIds.length < MAX_ARTICLE_KEYWORDS)
      .filter(ancora => semContradicao(keyword, ancora.keywordIds.map(id => porId.get(id)!).filter(Boolean), serp))
      .map(ancora => ({ ancora, medida: medirNaAncora(ancora, keyword) }))
      .filter(item => item.medida.eligible)
      .map(item => ({ ancora: item.ancora, affinity: item.medida.score, reasons: item.medida.reasons }))
      .sort((left, right) => right.affinity - left.affinity
        || (left.ancora.kind === right.ancora.kind ? 0 : left.ancora.kind === "published" ? -1 : 1)
        || left.ancora.principal.keywordId.localeCompare(right.ancora.principal.keywordId))[0];
    if (!destino) return null;
    destino.ancora.keywordIds.push(keyword.keywordId);
    if (serp && destino.reasons.length) porqueNaAncora.set(keyword.keywordId, destino.reasons);
    return destino.ancora;
  };

  /*
   * 2b — O ASSUNTO SEM VOLUME TAMBÉM VIRA ARTIGO BOM (D1/D3/B5).
   *
   * Sem sustentação sugerida pelo Minerador, o Assunto sem Volume esperava
   * para sempre, mesmo com livres do próprio Silo pedindo o conteúdo dele. As
   * livres que convergem com a frase do Assunto (piso de convergência, sem
   * contradição de DNA) formam o artigo em torno dele; a principal sai entre
   * elas, com Volume validado — o Assunto é tronco, nunca principal nem slug.
   * Sem nenhuma livre com Volume, ele continua "aguardando sustentação".
   */
  const assuntosComArtigo = new Set(ancoras.filter(ancora => ancora.kind === "subject").map(ancora => ancora.subjectKeywordId));
  const presosNaSessao = new Set(input.subjectByCandidateRef?.values() || []);
  const livresDaReserva = [...reserva.remainingFree];
  const tirarDaReserva = (ids: readonly string[]) => {
    const sair = new Set(ids);
    for (let index = livresDaReserva.length - 1; index >= 0; index -= 1) {
      if (sair.has(livresDaReserva[index].keywordId)) livresDaReserva.splice(index, 1);
    }
  };
  const assuntosSemVolume = input.keywords
    .filter(keyword => !keyword.isPublished && declarado(keyword.keywordId) && !comVolume(keyword.keywordId)
      && !keyword.humanFormationRef && !keyword.subjectAnchored && !presosNaSessao.has(keyword.keywordId)
      && !assuntosComArtigo.has(keyword.keywordId))
    .sort((left, right) => left.keywordId.localeCompare(right.keywordId));
  /*
   * As sustentações sugeridas pelo Minerador que esperavam uma Principal com
   * Volume (`awaitingSubject`) entram no pool do PRÓPRIO Assunto aqui: sem
   * isso, elas ficavam presas, fora das livres e fora das propostas, e o
   * artigo do Assunto nascia sem elas. A disputada por dois Assuntos continua
   * esperando a decisão humana.
   */
  const contagemDeClaims = new Map<string, number>();
  for (const claim of input.subjectClaims || []) {
    for (const keywordId of new Set(claim.keywordIds)) contagemDeClaims.set(keywordId, (contagemDeClaims.get(keywordId) ?? 0) + 1);
  }
  const donoDaEspera = new Map<string, string>();
  for (const claim of input.subjectClaims || []) {
    for (const keywordId of claim.keywordIds) {
      if (contagemDeClaims.get(keywordId) === 1 && reserva.awaitingSubject.includes(keywordId)) donoDaEspera.set(keywordId, claim.subjectKeywordId);
    }
  }
  const esperandoAssunto = new Map([...donoDaEspera.keys()].map(keywordId => [keywordId, porId.get(keywordId)!] as const).filter(([, keyword]) => Boolean(keyword)));
  for (const assunto of assuntosSemVolume) {
    const proprias = [...esperandoAssunto.values()]
      .filter(keyword => donoDaEspera.get(keyword.keywordId) === assunto.keywordId && !serpAwareDnaBarrier(assunto, keyword, serp) && reforcaComVolume(keyword, serp));
    const convergentes = [
      ...proprias,
      ...livresDaReserva
        .filter(keyword => serp
          // D2.2 — a sustentação do Assunto é o que divide a SERP com a frase dele; D2.3 — com volume.
          ? hasSearchVolume(keyword.volume) && measureAnchorConvergence(assunto, keyword, { siloTokens, serp }).eligible
          : sameArticleAffinity(assunto, keyword, siloTokens).affinity >= AFFINITY_FLOOR && !formationDnaContradiction(assunto, keyword)),
    ];
    const principal = suggestPrincipal({ keywords: convergentes.filter(keyword => comVolume(keyword.keywordId)), siloTokens });
    if (!principal) continue;
    const ancoraDoArtigo = convergentes.find(keyword => keyword.keywordId === principal.keywordId)!;
    const ids = [ancoraDoArtigo.keywordId, ...compativeis(ancoraDoArtigo, convergentes, siloTokens, MAX_ARTICLE_KEYWORDS - 1, [ancoraDoArtigo], serp ? { index: serp, subject: assunto } : null).map(keyword => keyword.keywordId)];
    ancoras.push({ kind: "subject", principal: ancoraDoArtigo, keywordIds: ids, subjectKeywordId: assunto.keywordId });
    assuntosComArtigo.add(assunto.keywordId);
    tirarDaReserva(ids);
    for (const id of ids) {
      esperandoAssunto.delete(id);
      deferred.delete(id);
    }
  }

  /*
   * 3a — AS LIVRES DÃO FORÇA AOS PUBLICADOS E AOS ASSUNTOS (D1.3).
   *
   * Toda livre que sobrou da reserva é oferecida às âncoras com vaga ANTES de
   * qualquer núcleo virar artigo novo, pela ordem de importância (Volume,
   * depois o identificador para a ordem ser estável). Cada uma vai para onde
   * agrega mais: maior convergência, publicado antes de Assunto no empate.
   */
  const porImportancia = (left: ArticleFormationKeyword, right: ArticleFormationKeyword) =>
    (right.volume ?? -1) - (left.volume ?? -1) || left.keywordId.localeCompare(right.keywordId);
  const anexadaPor = new Map<string, Ancora>();
  if (ancoras.length) {
    // A sustentação cujo Assunto não formou artigo também é oferecida: ficar
    // presa esperando uma Principal que não existe não fortalece ninguém.
    for (const keyword of [...livresDaReserva, ...esperandoAssunto.values()].sort(porImportancia)) {
      const ancora = oferecerAsAncoras(keyword);
      if (!ancora) continue;
      anexadaPor.set(keyword.keywordId, ancora);
      if (esperandoAssunto.delete(keyword.keywordId)) deferred.delete(keyword.keywordId);
    }
    tirarDaReserva([...anexadaPor.keys()]);
  }
  /*
   * D8 — a sustentação que continua sem artigo segue fora, com o motivo, e no
   * modo melhorar entra nas sobras que podem reforçar outro Silo por proposta.
   */
  /** D1.4 — livres sem encaixe no modo melhorar: ficam fora, com motivo, e podem reforçar outro Silo por proposta. */
  const sobrasSemEncaixe: string[] = [];
  for (const keyword of esperandoAssunto.values()) {
    deferred.set(keyword.keywordId, `${deferred.get(keyword.keywordId) || `sustentação do Assunto "${nome(donoDaEspera.get(keyword.keywordId) || "")}" aguarda uma Principal com Volume validado`}; não encontrou publicado nem Assunto compatível com vaga neste Silo`);
    if (melhorar) sobrasSemEncaixe.push(keyword.keywordId);
  }
  /** D1/D4/D7 — sustentações devolvidas pelo artigo do Assunto: nunca semeiam artigo concorrente sozinhas. */
  const devolvida = (keywordId: string) => reserva.releasedSupports.get(keywordId);
  const motivoDaDevolvida = (keywordId: string) => {
    const origem = devolvida(keywordId)!;
    return `sustentação sugerida para o Assunto "${nome(origem.subjectKeywordId)}" que não coube ou não converge com a Principal "${nome(origem.principalKeywordId)}" do artigo dele (um artigo por Assunto)`;
  };

  /*
   * Fora do modo melhorar, a sustentação devolvida pelo artigo do Assunto não
   * entra nos núcleos: ela só forma artigo com fronteira própria comprovada
   * (passo 4), nunca um concorrente do artigo do Assunto.
   */
  /** Excedentes à espera de fronteira própria, com o artigo de onde saíram e o porquê. */
  const excedentes: Array<{ keyword: ArticleFormationKeyword; origem: ArticleFormationKeyword; motivo: "teto" | "dna"; detalhe: string }> = [];
  if (!melhorar) {
    const devolvidas = livresDaReserva.filter(keyword => devolvida(keyword.keywordId) && porId.get(devolvida(keyword.keywordId)!.principalKeywordId));
    for (const keyword of devolvidas) {
      const origem = porId.get(devolvida(keyword.keywordId)!.principalKeywordId)!;
      excedentes.push({ keyword, origem, motivo: formationDnaContradiction(origem, keyword) ? "dna" : "teto", detalhe: motivoDaDevolvida(keyword.keywordId) });
    }
    tirarDaReserva(devolvidas.map(keyword => keyword.keywordId));
  }

  // 3 — núcleos semânticos só com o que sobrou da reserva.
  const assinaturas = livresDaReserva.map(keyword => buildSemanticSignature({
    dna: input.dnaSignals?.get(keyword.keywordId)
      // Sem DNA, só a formulação está disponível — e isso é dito, não
      // preenchido: todos os campos semânticos ficam nulos.
      ?? {
        keywordId: keyword.keywordId, text: keyword.keyword,
        intent: null, secondaryIntent: null, funnel: null, semanticState: null,
        confidence: null, centralEntity: null, modifiers: [],
        perceivedProblem: null, audience: null, desiredResult: null,
        editorialType: null, awarenessLevel: null, journeyStage: null,
        cannibalizationNote: null, dnaVersionId: null, dnaContentHash: null,
      },
    siloTokens,
    volume: keyword.volume,
    kgr: keyword.kgr,
    isPublished: false,
  }));
  const particao = deriveSemanticNuclei({ signatures: assinaturas });
  const nucleos = particao.nuclei.flatMap(nucleus => dividirEmFronteiras(nucleus, assinaturas));
  for (const separacao of particao.separations) separations.push({ left: separacao.left, reasons: [...separacao.reasons] });

  const livresPorId = new Map(livresDaReserva.map(keyword => [keyword.keywordId, keyword]));
  const gruposNovos: Group[] = [];

  for (const nucleo of nucleos) {
    const membros = nucleo.keywordIds.map(id => livresPorId.get(id)).filter((keyword): keyword is ArticleFormationKeyword => Boolean(keyword));
    if (!membros.length) continue;
    const info = (keywordIds: string[]): SiloFormationNucleusInfo => ({
      label: nucleo.label, anchors: [...nucleo.anchors], reasons: [...nucleo.reasons], keywordIds, siloRef: input.siloRef,
    });
    if (melhorar) {
      /*
       * D1.4/D7 — COM PUBLICADO OU ASSUNTO NO LOTE, A SOBRA NÃO VIRA ARTIGO
       * NOVO SOZINHA. Ela já foi oferecida a todas as âncoras deste Silo; o
       * que não coube fica em Keywords não agrupadas, dizendo o tema que
       * formaria e a ação explícita que o dono pode tomar.
       */
      /*
       * D2.3 — MOTIVO CURTO. O tema é dito pela keyword de MAIOR VOLUME do
       * núcleo, nunca pelo rótulo da Lógica ("Precisa avaliar a adequação de
       * … ao contexto …"), que o dono não entende. A oportunidade de artigo
       * novo aparece agrupada, com a ação explícita.
       */
      const lider = [...membros].sort((left, right) => (right.volume ?? -1) - (left.volume ?? -1) || left.keywordId.localeCompare(right.keywordId))[0];
      const semVolume = (keyword: ArticleFormationKeyword) => serp && !hasSearchVolume(keyword.volume);
      for (const keyword of membros) {
        sobrasSemEncaixe.push(keyword.keywordId);
        const tema = membros.length > 1
          ? `formaria tema com outras ${membros.length - 1}: "${lider.keyword}"`
          : "sem outra livre do mesmo tema";
        deferred.set(keyword.keywordId, semVolume(keyword)
          ? "sem volume: não reforça nem forma artigo"
          : `${devolvida(keyword.keywordId) ? "sustentação que não coube no artigo do Assunto (um artigo por Assunto); " : ""}sem par com publicado ou Assunto deste Silo; ${tema}`);
      }
      continue;
    }
    if (membros.length === 1) {
      // D7 — livre sozinha reforça publicado ou Assunto compatível antes de virar artigo.
      const ancora = oferecerAsAncoras(membros[0]);
      if (ancora) {
        anexadaPor.set(membros[0].keywordId, ancora);
        continue;
      }
      gruposNovos.push({ principalKeywordId: membros[0].keywordId, keywordIds: [membros[0].keywordId] });
      nucleusByKeywordId.set(membros[0].keywordId, info([membros[0].keywordId]));
      continue;
    }
    // §13 — a Principal é escolhida DEPOIS de o tema estar definido.
    const principalId = suggestPrincipal({ keywords: membros, siloTokens })?.keywordId || membros[0].keywordId;
    const principal = membros.find(keyword => keyword.keywordId === principalId)!;
    const outros = membros.filter(keyword => keyword.keywordId !== principalId).sort(porAfinidade(principal, siloTokens));
    const admitidas = [principal];
    for (const keyword of outros) {
      const conflito = admitidas.map(membro => formationDnaContradiction(membro, keyword)).find(Boolean);
      if (conflito) {
        excedentes.push({ keyword, origem: principal, motivo: "dna", detalhe: `${conflito} em relação ao artigo "${principal.keyword}"` });
      } else if (admitidas.length < MAX_ARTICLE_KEYWORDS) {
        admitidas.push(keyword);
      } else {
        excedentes.push({ keyword, origem: principal, motivo: "teto", detalhe: `passou do teto de seis do artigo "${principal.keyword}"` });
      }
    }
    const ids = admitidas.map(keyword => keyword.keywordId);
    gruposNovos.push({ principalKeywordId: principalId, keywordIds: ids });
    for (const keyword of admitidas) nucleusByKeywordId.set(keyword.keywordId, info(ids));
  }

  /*
   * 4 — O EXCEDENTE NUNCA SOME E NUNCA CANIBALIZA.
   *
   * Primeiro reforça publicado ou Assunto com vaga. Depois, só forma artigo
   * se tiver fronteira própria: converge com outra busca do excedente e a
   * principal nova não pede o mesmo conteúdo do artigo de origem. Busca que
   * o DNA separou do núcleo pode ser artigo próprio mesmo sozinha.
   */
  const pool: typeof excedentes = [];
  for (const item of excedentes) {
    const ancora = oferecerAsAncoras(item.keyword);
    if (ancora) anexadaPor.set(item.keyword.keywordId, ancora);
    else pool.push(item);
  }
  const usadasNoExcedente = new Set<string>();
  const ordenado = [...pool].sort((left, right) => (right.keyword.volume ?? -1) - (left.keyword.volume ?? -1) || left.keyword.keywordId.localeCompare(right.keyword.keywordId));
  for (const semente of ordenado) {
    if (usadasNoExcedente.has(semente.keyword.keywordId)) continue;
    const disponiveis = ordenado.filter(item => !usadasNoExcedente.has(item.keyword.keywordId)).map(item => item.keyword);
    const juntas = compativeis(semente.keyword, disponiveis, siloTokens, MAX_ARTICLE_KEYWORDS - 1);
    const grupo = [semente.keyword, ...juntas];
    const principalId = suggestPrincipal({ keywords: grupo, siloTokens })?.keywordId || semente.keyword.keywordId;
    const principal = grupo.find(keyword => keyword.keywordId === principalId)!;
    const origens = new Set(grupo.map(keyword => ordenado.find(item => item.keyword.keywordId === keyword.keywordId)!.origem));
    // Converge com a principal de origem (piso de convergência) = pede o mesmo conteúdo dela.
    const canibaliza = [...origens].some(origem => sameArticleAffinity(principal, origem, siloTokens).affinity >= AFFINITY_FLOOR);
    const fronteiraPropria = !canibaliza && (grupo.length >= 2 || semente.motivo === "dna");
    if (fronteiraPropria) {
      const ids = grupo.map(keyword => keyword.keywordId);
      for (const id of ids) usadasNoExcedente.add(id);
      gruposNovos.push({ principalKeywordId: principalId, keywordIds: ids });
      for (const id of ids) {
        nucleusByKeywordId.set(id, {
          label: principal.keyword, anchors: [], siloRef: input.siloRef, keywordIds: ids,
          reasons: [`Excedente com fronteira própria: ${ordenado.find(item => item.keyword.keywordId === id)!.detalhe}; não canibaliza o artigo de origem.`],
        });
      }
      continue;
    }
    usadasNoExcedente.add(semente.keyword.keywordId);
    deferred.set(semente.keyword.keywordId, canibaliza
      ? `${semente.detalhe}; pede o mesmo conteúdo dele e não reforça nenhum publicado ou Assunto com vaga — aguarda revisão humana`
      : `${semente.detalhe}; nenhuma outra busca converge com ela para formar artigo com fronteira própria — aguarda revisão humana`);
  }

  // O porquê de cada keyword anexada a uma âncora.
  for (const [keywordId, destino] of reserva.attached) {
    const publicada = porId.get(destino.publishedKeywordId);
    const grupo = ancoras.find(ancora => ancora.principal.keywordId === destino.publishedKeywordId);
    nucleusByKeywordId.set(keywordId, {
      label: publicada?.keyword || destino.publishedKeywordId, anchors: [], siloRef: input.siloRef,
      keywordIds: grupo?.keywordIds || [keywordId],
      reasons: [`Remontada em torno do artigo publicado "${publicada?.keyword || destino.publishedKeywordId}": ${destino.reasons.join("; ")}.`],
    });
  }
  for (const ancora of ancoras) {
    if (ancora.kind !== "subject") continue;
    for (const keywordId of ancora.keywordIds) {
      if (nucleusByKeywordId.has(keywordId) && !anexadaPor.has(keywordId)) continue;
      nucleusByKeywordId.set(keywordId, {
        label: nome(ancora.subjectKeywordId || ancora.principal.keywordId), anchors: [], siloRef: input.siloRef, keywordIds: [...ancora.keywordIds],
        reasons: [`Sustentação do Assunto "${nome(ancora.subjectKeywordId || ancora.principal.keywordId)}", oferecida antes de formar artigo novo (D1).`, ...(porqueNaAncora.get(keywordId) || [])],
      });
    }
  }
  for (const [keywordId, ancora] of anexadaPor) {
    if (ancora.kind !== "published") continue;
    nucleusByKeywordId.set(keywordId, {
      label: ancora.principal.keyword, anchors: [], siloRef: input.siloRef, keywordIds: [...ancora.keywordIds],
      reasons: [`Reforça o artigo publicado "${ancora.principal.keyword}" antes de formar artigo novo (D1/D7).`, ...(porqueNaAncora.get(keywordId) || [])],
    });
  }

  const publishedArticles = publishedArticleRefsOf({
    keywords: input.keywords,
    publishedPages: input.publishedPages,
    catalogPages: input.catalogPages,
  });
  const suggestedSubjectByCandidateRef = new Map(ancoras
    .filter(ancora => ancora.kind === "subject" && ancora.subjectKeywordId)
    .map(ancora => [`article-candidate:${input.siloRef}:${ancora.principal.keywordId}`, ancora.subjectKeywordId!]));
  const principaisDeAssunto = new Set(assuntosPrincipais.map(keyword => keyword.keywordId));

  const universe = buildArticleFormationUniverse({
    groups: [
      ...ancoras.filter(ancora => ancora.kind === "published").map(ancora => ({ principalKeywordId: ancora.principal.keywordId, keywordIds: ancora.keywordIds })),
      ...ancoras.filter(ancora => ancora.kind === "subject").map(ancora => ({ principalKeywordId: ancora.principal.keywordId, keywordIds: ancora.keywordIds })),
      ...gruposNovos,
    ],
    siloRef: input.siloRef,
    siloLabel: input.siloLabel,
    siloSlug: input.siloSlug,
    siloContext: input.siloContext,
    keywords: input.keywords,
    publishedArticles,
    suggestedSubjectByCandidateRef,
    // Só o Assunto que não é publicada nem principal fica retido (B8/D3).
    automaticHoldoutIds: new Set(input.keywords
      .filter(keyword => declarado(keyword.keywordId) && !keyword.isPublished && !principaisDeAssunto.has(keyword.keywordId))
      .map(keyword => keyword.keywordId)),
    deferredKeywordIds: deferred,
    ...(input.subjectByCandidateRef?.size ? { subjectByCandidateRef: input.subjectByCandidateRef } : {}),
    ...(input.siloSubjectKeywordId ? { siloSubjectKeywordId: input.siloSubjectKeywordId } : {}),
  });
  const awaitingSubjectKeywordIds = input.keywords
    .filter(keyword => !keyword.isPublished && declarado(keyword.keywordId) && !keyword.humanFormationRef
      && !assuntosComArtigo.has(keyword.keywordId) && !principaisDeAssunto.has(keyword.keywordId))
    .map(keyword => keyword.keywordId);
  return {
    universe,
    nucleusByKeywordId,
    separations,
    objective,
    formNewFromLeftovers,
    anchors: [
      ...ancoras.map(ancora => ({
        kind: ancora.kind,
        principalKeywordId: ancora.principal.keywordId,
        keywordIds: [...ancora.keywordIds],
        ...(ancora.subjectKeywordId ? { subjectKeywordId: ancora.subjectKeywordId } : {}),
      })),
      /*
       * D2.3 — o publicado com composição decidida por humano continua sendo
       * âncora para o diagnóstico: aplicar sugestões não pode sumir com o
       * cartão dele. Só com o índice de SERP (a mesa do mesmo assunto); a
       * formação não mexe nele.
       */
      ...(serp
        ? input.keywords
          .filter(keyword => keyword.isPublished && keyword.humanFormationRef)
          .map(keyword => ({
            kind: "published" as const,
            principalKeywordId: keyword.keywordId,
            keywordIds: [keyword.keywordId, ...input.keywords
              .filter(outra => outra.keywordId !== keyword.keywordId && outra.humanFormationRef === keyword.humanFormationRef)
              .map(outra => outra.keywordId)],
            humanDecided: true,
          }))
        : []),
    ],
    awaitingSubjectKeywordIds,
    leftoverKeywordIds: sobrasSemEncaixe,
  };
}

/* ------------------------ reforço entre Silos (D8) ------------------------ */

export type CrossSiloReinforcementProposal = {
  keywordId: string;
  keyword: string;
  fromSiloRef: string;
  fromSiloLabel: string;
  toSiloRef: string;
  toSiloLabel: string;
  /** Publicado ou Assunto que a keyword reforçaria no outro Silo. */
  anchorKind: "published" | "subject";
  anchorKeywordId: string;
  anchorLabel: string;
  affinity: number;
  reason: string;
  /**
   * D2.2 (aditivo) — em que a proposta se apoia: `serp` (páginas em comum no
   * top 10), `serp_and_words`, `words_without_serp`, `words` (sem índice)
   * ou `subject_support` (sustentação sugerida pelo Minerador).
   */
  basis?: AnchorConvergenceBasis | "subject_support";
  /** Páginas do top 10 em comum com a âncora, quando a SERP mediu. */
  sharedPageCount?: number;
};

/**
 * PROPOSTAS PARA REFORÇAR PUBLICADO OU ASSUNTO DE OUTRO SILO.
 *
 * A fase de Silos pode ter confirmado num Silo as livres que reforçariam os
 * publicados de outro. Na AdalbaPro (leitura de 2026-09-26), "Leads sem
 * Tráfego Pago" tem 101 livres e 5 artigos publicados: no teto de seis, no
 * máximo 25 delas cabem ali; as demais ficam em Keywords não agrupadas e
 * podem reforçar publicados e Assuntos de outros Silos. A formação não cruza Silo sozinha
 * (D8): isto só PROPÕE. Cada proposta diz de onde sai, para qual publicado ou
 * Assunto vai e por quê; mover a keyword de Silo é decisão humana, aplicada
 * pela mesma decisão de Silo da aba Silos.
 *
 * Só entram as sobras sem encaixe no próprio Silo, no modo melhorar. O teto
 * de seis vale para o destino, contando as propostas já feitas a ele. A
 * sustentação sugerida pelo Minerador para o Assunto vale como motivo mesmo
 * abaixo do piso de convergência; contradição de DNA nunca passa (D5).
 */
export function proposeCrossSiloReinforcements(input: {
  silos: readonly {
    siloRef: string;
    siloLabel: string;
    siloTokens: ReadonlySet<string>;
    plan: Pick<SiloFormationPlan, "anchors" | "awaitingSubjectKeywordIds" | "leftoverKeywordIds">;
  }[];
  keywords: ReadonlyMap<string, ArticleFormationKeyword>;
  /** Sustentações sugeridas pelo Minerador para cada Assunto, na marca inteira. */
  subjectClaims?: readonly { subjectKeywordId: string; keywordIds: readonly string[] }[];
  /** Livres com Volume validado: só elas podem virar a principal de um Assunto sem artigo. */
  principalEligibleKeywordIds?: ReadonlySet<string>;
  /** D2.2 — o índice de SERP da mesa: a proposta entre Silos segue a SERP. */
  serpSubject?: SerpSubjectIndex | null;
}): CrossSiloReinforcementProposal[] {
  const serp = input.serpSubject || null;
  const reivindicada = new Map<string, Set<string>>();
  for (const claim of input.subjectClaims || []) {
    for (const keywordId of claim.keywordIds) {
      reivindicada.set(keywordId, new Set([...(reivindicada.get(keywordId) || []), claim.subjectKeywordId]));
    }
  }
  type Destino = {
    siloRef: string; siloLabel: string; siloTokens: ReadonlySet<string>;
    kind: "published" | "subject"; alvo: ArticleFormationKeyword; subjectKeywordId: string | null;
    membros: ArticleFormationKeyword[]; vagas: number; precisaPrincipal: boolean;
  };
  const destinos: Destino[] = [];
  for (const silo of input.silos) {
    for (const ancora of silo.plan.anchors) {
      const alvo = input.keywords.get(ancora.principalKeywordId);
      // Artigo com composição decidida por humano não recebe proposta automática.
      if (!alvo || ancora.humanDecided) continue;
      destinos.push({
        siloRef: silo.siloRef, siloLabel: silo.siloLabel, siloTokens: silo.siloTokens,
        kind: ancora.kind, alvo, subjectKeywordId: ancora.subjectKeywordId ?? null,
        membros: ancora.keywordIds.map(id => input.keywords.get(id)).filter((item): item is ArticleFormationKeyword => Boolean(item)),
        vagas: MAX_ARTICLE_KEYWORDS - ancora.keywordIds.length,
        precisaPrincipal: false,
      });
    }
    for (const subjectKeywordId of silo.plan.awaitingSubjectKeywordIds) {
      const alvo = input.keywords.get(subjectKeywordId);
      if (!alvo) continue;
      // O Assunto não conta no teto (B6): o artigo dele ainda tem as seis vagas.
      destinos.push({
        siloRef: silo.siloRef, siloLabel: silo.siloLabel, siloTokens: silo.siloTokens,
        kind: "subject", alvo, subjectKeywordId, membros: [], vagas: MAX_ARTICLE_KEYWORDS, precisaPrincipal: true,
      });
    }
  }
  const sobras = input.silos.flatMap(silo => silo.plan.leftoverKeywordIds
    .map(keywordId => ({ silo, keyword: input.keywords.get(keywordId) }))
    .filter((item): item is { silo: typeof silo; keyword: ArticleFormationKeyword } => Boolean(item.keyword))
    // D2.3 — com SERP, sobra sem volume não reforça outro Silo.
    .filter(item => reforcaComVolume(item.keyword, serp)))
    .sort((left, right) => (right.keyword.volume ?? -1) - (left.keyword.volume ?? -1) || left.keyword.keywordId.localeCompare(right.keyword.keywordId));

  const propostas: CrossSiloReinforcementProposal[] = [];
  for (const { silo, keyword } of sobras) {
    const opcoes = destinos
      .filter(destino => destino.siloRef !== silo.siloRef && destino.vagas > 0)
      .filter(destino => !destino.precisaPrincipal || destino.membros.length > 0 || input.principalEligibleKeywordIds?.has(keyword.keywordId))
      .filter(destino => !serpAwareDnaBarrier(destino.alvo, keyword, serp) && semContradicao(keyword, destino.membros, serp))
      .map(destino => {
        const sustentacao = Boolean(destino.subjectKeywordId && reivindicada.get(keyword.keywordId)?.has(destino.subjectKeywordId));
        if (!serp) {
          const { affinity, reasons } = sameArticleAffinity(destino.alvo, keyword, destino.siloTokens);
          return { destino, affinity, reasons, sustentacao, eligible: affinity >= AFFINITY_FLOOR, score: affinity, medida: null };
        }
        // D2.2 — mede contra a principal e contra a frase do Assunto do destino.
        const frase = destino.subjectKeywordId ? input.keywords.get(destino.subjectKeywordId) : undefined;
        const medida = bestAnchorConvergence(frase && frase.keywordId !== destino.alvo.keywordId ? [destino.alvo, frase] : [destino.alvo], keyword, { siloTokens: destino.siloTokens, serp });
        return { destino, affinity: medida.lexicalAffinity, reasons: medida.reasons, sustentacao, eligible: medida.eligible, score: medida.score, medida };
      })
      .filter(item => item.sustentacao || item.eligible)
      .sort((left, right) => Number(right.sustentacao) - Number(left.sustentacao)
        || right.score - left.score
        || (left.destino.kind === right.destino.kind ? 0 : left.destino.kind === "published" ? -1 : 1)
        || left.destino.alvo.keywordId.localeCompare(right.destino.alvo.keywordId));
    const escolha = opcoes[0];
    if (!escolha) continue;
    escolha.destino.vagas -= 1;
    escolha.destino.membros.push(keyword);
    // O Assunto é nomeado pela frase dele, não pela principal que o sustenta.
    const alvoRotulo = escolha.destino.kind === "subject" && escolha.destino.subjectKeywordId
      ? input.keywords.get(escolha.destino.subjectKeywordId)?.keyword || escolha.destino.alvo.keyword
      : escolha.destino.alvo.keyword;
    propostas.push({
      keywordId: keyword.keywordId,
      keyword: keyword.keyword,
      fromSiloRef: silo.siloRef,
      fromSiloLabel: silo.siloLabel,
      toSiloRef: escolha.destino.siloRef,
      toSiloLabel: escolha.destino.siloLabel,
      anchorKind: escolha.destino.kind,
      anchorKeywordId: escolha.destino.subjectKeywordId && escolha.destino.kind === "subject" ? escolha.destino.subjectKeywordId : escolha.destino.alvo.keywordId,
      anchorLabel: alvoRotulo,
      affinity: Math.round(escolha.affinity * 100) / 100,
      reason: escolha.sustentacao
        ? `sustentação sugerida pelo Minerador para o Assunto "${alvoRotulo}", que está no Silo "${escolha.destino.siloLabel}"`
        : escolha.medida && (escolha.medida.basis === "serp" || escolha.medida.basis === "serp_and_words")
          ? `${escolha.destino.kind === "published" ? "reforça o artigo publicado" : "sustenta o Assunto"} "${alvoRotulo}": ${escolha.medida.overlap!.sharedPageCount} páginas em comum no top 10 do Google; no Silo "${silo.siloLabel}" não encontrou publicado nem Assunto do mesmo assunto`
          : `${escolha.destino.kind === "published" ? "reforça o artigo publicado" : "sustenta o Assunto"} "${alvoRotulo}" (convergência ${Math.round(escolha.affinity * 100)}%${escolha.reasons.length ? `: ${escolha.reasons.slice(0, 2).join("; ")}` : ""}); no Silo "${silo.siloLabel}" não encontrou publicado nem Assunto compatível`,
      ...(serp
        ? {
          basis: escolha.sustentacao ? "subject_support" as const : escolha.medida!.basis,
          ...(escolha.medida?.overlap && escolha.medida.overlap.strength !== "unknown" ? { sharedPageCount: escolha.medida.overlap.sharedPageCount } : {}),
        }
        : {}),
    });
  }
  return propostas;
}
