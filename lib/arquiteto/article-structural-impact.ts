/**
 * UMA DECISÃO DE SILO NÃO DESMONTA UM ARTICLE APROVADO EM SILÊNCIO.
 *
 * O caso que originou este módulo: a fase Silos moveu duas das três keywords
 * de um ArticleDNA aprovado para um território ainda candidato. Nada acusou.
 * O Article não foi alterado — ele simplesmente PAROU DE APARECER, porque o
 * agrupamento corrente só projeta keywords de territórios confirmados, e as
 * dele passaram a viver em dois lugares.
 *
 * O artefato aprovado seguiu intacto no acervo. O que sumiu foi a jornada:
 * ninguém tinha como revisar, reprocessar ou sequer ver o artigo.
 *
 * A REGRA:
 *
 *   Silos PODE mudar a arquitetura. Depois que Articles existem, Silos NÃO
 *   reescreve ArticleDNA — ele registra a decisão, calcula quem foi impactado
 *   e exige revisão desses Articles.
 *
 * Isto não congela o Silo. Evolução estrutural continua possível; ela só passa
 * a produzir uma REVISÃO CONTROLADA em vez de um desaparecimento.
 *
 * Domínio puro: sem storage, sem fetch, sem IA.
 */

import type { ArticleDNA, VersionEnvelope } from "./contracts.ts";

/* ----------------- o estado estrutural de um Article aprovado ------------- */

export const ARTICLE_STRUCTURAL_STATES = [
  /** Todas as keywords da composição vivem no território que o Article declara. */
  "CURRENT",
  /**
   * A composição foi partida: alguma keyword saiu para outro território, ou o
   * território do Article deixou de ser confirmado. O artefato aprovado
   * continua válido como histórico; a FORMAÇÃO é que precisa de revisão.
   */
  "REVISION_REQUIRED",
  /** O Article não declara território: legado anterior ao fluxo Silo-first. */
  "LEGACY_NO_TERRITORY",
] as const;
export type ArticleStructuralState = (typeof ARTICLE_STRUCTURAL_STATES)[number];

export type ArticleStructuralReading = {
  articleId: string;
  state: ArticleStructuralState;
  territoryRef: string | null;
  /** Keywords da composição que já não estão no território do Article. */
  displacedKeywordIds: string[];
  /** Para onde cada uma foi; `null` quando perdeu membership. */
  displacedTo: Array<{ keywordId: string; territoryRef: string | null }>;
  /** Frase única para a tela — o Article precisa dizer por que pede revisão. */
  reason: string;
};

export function readArticleStructuralState(input: {
  article: ArticleDNA;
  /** Território VIGENTE de cada keyword, como a membership diz hoje. */
  territoryByKeywordId: ReadonlyMap<string, string | null>;
}): ArticleStructuralReading {
  const territoryRef = input.article.territoryRef || null;
  const keywordIds = input.article.keywordReferences.map(reference => reference.keywordId);

  if (!territoryRef) {
    return {
      articleId: input.article.articleId,
      state: "LEGACY_NO_TERRITORY",
      territoryRef: null,
      displacedKeywordIds: [],
      displacedTo: [],
      reason: "O artigo não declara território de origem: nada a comparar.",
    };
  }

  const deslocadas = keywordIds
    .map(keywordId => ({ keywordId, territoryRef: input.territoryByKeywordId.get(keywordId) ?? null }))
    .filter(item => item.territoryRef !== territoryRef);

  if (!deslocadas.length) {
    return {
      articleId: input.article.articleId,
      state: "CURRENT",
      territoryRef,
      displacedKeywordIds: [],
      displacedTo: [],
      reason: "Todas as buscas da composição continuam no território do artigo.",
    };
  }

  const total = keywordIds.length;
  const restantes = total - deslocadas.length;
  return {
    articleId: input.article.articleId,
    state: "REVISION_REQUIRED",
    territoryRef,
    displacedKeywordIds: deslocadas.map(item => item.keywordId),
    displacedTo: deslocadas,
    reason: restantes === 0
      ? `As ${total} buscas deste artigo saíram do território dele: a formação não existe mais como aprovada.`
      : `${deslocadas.length} de ${total} buscas saíram do território deste artigo; restam ${restantes}.`,
  };
}

/* ---------------------- o impacto ANTES de confirmar --------------------- */

export type TerritoryAssignmentProposal = {
  keywordId: string;
  /** Território para onde a decisão da fase Silos quer levar a keyword. */
  territoryRef: string | null;
};

/**
 * NEM TODA MUDANÇA QUE TOCA UM ARTICLE APROVADO É DESTRUTIVA.
 *
 * Devolver uma busca ao território do Article RESTAURA a composição aprovada —
 * é o oposto de quebrá-la, e tratar as duas do mesmo jeito impediria consertar
 * o estrago. A classificação é pela direção do movimento em relação ao DNA
 * vigente, não pelo fato de haver movimento.
 */
export const TERRITORY_IMPACT_CLASSES = [
  /** A composição volta a coincidir com o ArticleDNA aprovado. */
  "RESTORES_APPROVED_STRUCTURE",
  /** Ainda divergente depois da mudança, mas menos: caminho de volta. */
  "PARTIAL_RESTORATION",
  /** Buscas saem do Article aprovado: exige revisão estrutural. */
  "BREAKS_APPROVED_STRUCTURE",
] as const;
export type TerritoryImpactClass = (typeof TERRITORY_IMPACT_CLASSES)[number];

export type ApprovedArticleImpact = {
  articleId: string;
  /** Rótulo humano do artigo — nunca o identificador cru na tela. */
  label: string;
  territoryRef: string | null;
  classification: TerritoryImpactClass;
  /** Quantas buscas da composição estavam no território do Article. */
  alignedBefore: number;
  alignedAfter: number;
  keywordCountBefore: number;
  keywordCountAfter: number;
  losingKeywordIds: string[];
  returningKeywordIds: string[];
  /** Perder a Principal é outra ordem de gravidade: o artigo perde o eixo. */
  losesPrincipal: boolean;
  reason: string;
};

/** Uma linha do plano, como o preview precisa mostrá-la. */
export type PlannedAssignmentView = {
  keywordId: string;
  label: string;
  currentTerritoryRef: string | null;
  proposedTerritoryRef: string | null;
  /** `true` quando a linha não move nada — o plano a confirma onde está. */
  unchanged: boolean;
};

export type TerritoryChangeImpact = {
  /** Nenhum Article aprovado é tocado: fluxo normal, sem fricção nova. */
  clean: boolean;
  impacted: ApprovedArticleImpact[];
  /**
   * Mudanças que NÃO podem ser aplicadas.
   *
   * Quebra de estrutura aprovada entra aqui porque a jornada de revisão não
   * existe: aplicar seria criar conscientemente o mesmo estado inconsistente
   * que já custou uma investigação inteira, e confirmar duas vezes não
   * conserta nada.
   *
   * Restauração PARCIAL também entra. Devolver uma das duas buscas deixaria o
   * Article divergente entre um clique e outro — um estado que ninguém pediu
   * e que só existe porque o lote foi aplicado pela metade. Restaurar é
   * atômico por Article: ou a composição volta inteira, ou não volta agora.
   */
  blocked: ApprovedArticleImpact[];
  /**
   * TODAS as linhas do plano, não só as que impactam Article aprovado.
   *
   * Sem isto o preview diria "1 Article afetado" e esconderia para onde o
   * resto do lote está indo — que é justamente como uma migração inteira
   * passou despercebida.
   */
  plannedAssignments: PlannedAssignmentView[];
  /** Resumo para o diálogo de confirmação. */
  summary: string;
};

/**
 * O QUE ESTA MUDANÇA FAZ COM O QUE JÁ FOI APROVADO.
 *
 * Roda ANTES de aplicar. Não decide nada — descreve, para que a decisão seja
 * informada. Um Article que não perde keyword nenhuma não aparece aqui.
 */
export function resolveTerritoryChangeImpact(input: {
  proposals: readonly TerritoryAssignmentProposal[];
  approvedArticles: readonly VersionEnvelope<ArticleDNA>[];
  /** Território vigente de cada keyword, antes da mudança. */
  territoryByKeywordId: ReadonlyMap<string, string | null>;
  /** Rótulo de cada keyword, para a frase ficar legível. */
  labelByKeywordId?: ReadonlyMap<string, string>;
}): TerritoryChangeImpact {
  const destino = new Map(input.proposals.map(item => [item.keywordId, item.territoryRef]));
  const impacted: ApprovedArticleImpact[] = [];
  const nome = (id: string) => input.labelByKeywordId?.get(id) || id;

  for (const envelope of input.approvedArticles) {
    const article = envelope.payload;
    const territoryRef = article.territoryRef || null;
    if (!territoryRef) continue;

    const keywordIds = article.keywordReferences.map(reference => reference.keywordId);
    const antesDe = (keywordId: string) => input.territoryByKeywordId.get(keywordId) ?? null;
    const depoisDe = (keywordId: string) => (destino.has(keywordId) ? destino.get(keywordId) ?? null : antesDe(keywordId));

    const perdidas = keywordIds.filter(id => antesDe(id) === territoryRef && depoisDe(id) !== territoryRef);
    const retornando = keywordIds.filter(id => antesDe(id) !== territoryRef && depoisDe(id) === territoryRef);
    if (!perdidas.length && !retornando.length) continue;

    const alinhadasAntes = keywordIds.filter(id => antesDe(id) === territoryRef).length;
    const alinhadasDepois = keywordIds.filter(id => depoisDe(id) === territoryRef).length;
    const total = keywordIds.length;
    const perdePrincipal = perdidas.includes(article.principalKeywordId);

    /*
     * A direção do movimento decide, não a existência dele.
     *
     * Perder busca é quebra. Ganhar de volta é restauração — e proibir a
     * restauração pelo mesmo motivo que proíbe a quebra tornaria o estrago
     * permanente.
     */
    const classification: TerritoryImpactClass = perdidas.length
      ? "BREAKS_APPROVED_STRUCTURE"
      : alinhadasDepois === total
        ? "RESTORES_APPROVED_STRUCTURE"
        : "PARTIAL_RESTORATION";

    impacted.push({
      articleId: article.articleId,
      label: nome(article.principalKeywordId) || article.suggestedSlug || article.articleId,
      territoryRef,
      classification,
      alignedBefore: alinhadasAntes,
      alignedAfter: alinhadasDepois,
      keywordCountBefore: total,
      keywordCountAfter: total - perdidas.length,
      losingKeywordIds: perdidas,
      returningKeywordIds: retornando,
      losesPrincipal: perdePrincipal,
      reason: classification === "RESTORES_APPROVED_STRUCTURE"
        ? `Devolve ${retornando.length} busca(s) ao território do artigo (${retornando.map(nome).join(", ")}): a composição volta a coincidir com o ArticleDNA aprovado, ${total} de ${total}.`
        : classification === "PARTIAL_RESTORATION"
          ? `Devolve ${retornando.length} busca(s); a composição passa de ${alinhadasAntes} para ${alinhadasDepois} de ${total} — ainda divergente, porém mais próxima do aprovado.`
          : perdePrincipal
            ? `Perde a Principal (${perdidas.map(nome).join(", ")}): o artigo fica sem eixo e precisa de revisão estrutural.`
            : total - perdidas.length === 0
              ? "Perde todas as buscas da composição: a formação aprovada deixa de existir."
              : `Perde ${perdidas.length} de ${total} busca(s): ${perdidas.map(nome).join(", ")}.`,
    });
  }

  /*
   * QUALQUER quebra barra o LOTE INTEIRO.
   *
   * Aplicar as restaurações e recusar as quebras deixaria metade da decisão
   * de pé — e o humano confirmando um plano que não é o que foi mostrado.
   */
  const quebras = impacted.filter(item => item.classification === "BREAKS_APPROVED_STRUCTURE");
  const parciais = impacted.filter(item => item.classification === "PARTIAL_RESTORATION");
  const blocked = [...quebras, ...parciais];
  const completas = impacted.filter(item => item.classification === "RESTORES_APPROVED_STRUCTURE");

  const plannedAssignments: PlannedAssignmentView[] = input.proposals.map(proposal => {
    const atual = input.territoryByKeywordId.get(proposal.keywordId) ?? null;
    return {
      keywordId: proposal.keywordId,
      label: nome(proposal.keywordId),
      currentTerritoryRef: atual,
      proposedTerritoryRef: proposal.territoryRef,
      unchanged: atual === proposal.territoryRef,
    };
  });

  return {
    clean: impacted.length === 0,
    impacted,
    blocked,
    plannedAssignments,
    summary: impacted.length === 0
      ? "Nenhum ArticleDNA aprovado perde ou recupera buscas com esta decisão."
      : quebras.length
        ? `${quebras.length} ArticleDNA aprovado(s) perderiam buscas: ${quebras.map(item => item.label).join(", ")}. Isso exige revisão estrutural do Article, que ainda não existe como jornada — a confirmação não pode ser aplicada.`
        : parciais.length
          ? `Restauração incompleta: ${parciais.map(item => `${item.label} ficaria com ${item.alignedAfter} de ${item.keywordCountBefore} busca(s) no território`).join("; ")}. Restaurar é atômico por artigo — inclua as buscas que faltam ou nenhuma mudança é aplicada.`
          : `Restauração estrutural: ${completas.map(item => `${item.label} volta a ${item.alignedAfter}/${item.keywordCountBefore} no território aprovado`).join("; ")}.`,
  };
}

/* ------------------ a semente da revisão, vinda do artefato --------------- */

/**
 * A revisão de um Article aprovado NASCE DELE, não do zero.
 *
 * Tratar um Article já aprovado como candidato virgem — reagrupando keywords
 * soltas — perde Principal, papéis, slug, proteção e proveniência que já foram
 * decididos. A cópia de revisão parte do ArticleDNA vigente e só então recebe
 * a mudança estrutural.
 *
 * Isto NÃO cria versão nem escreve: é a semente que a fase Artigos usa.
 */
export type ArticleRevisionSeed = {
  articleId: string;
  /** Sucessora nasce daqui; o aprovado permanece imutável. */
  previousVersionId: string;
  previousVersionNumber: number;
  principalKeywordId: string;
  secondaryKeywordIds: string[];
  narrativeReinforcementIds: string[];
  territoryRef: string | null;
  siloId: string | null;
  suggestedSlug: string;
  /** O que a decisão estrutural retira desta composição. */
  removedKeywordIds: string[];
  reason: string;
};

export function seedArticleRevision(input: {
  approved: VersionEnvelope<ArticleDNA>;
  removedKeywordIds: readonly string[];
}): ArticleRevisionSeed {
  const article = input.approved.payload;
  const removidas = new Set(input.removedKeywordIds);
  const fora = (id: string) => !removidas.has(id);

  return {
    articleId: article.articleId,
    previousVersionId: input.approved.versionId,
    previousVersionNumber: input.approved.versionNumber,
    // A Principal só muda se ela própria saiu; nesse caso quem escolhe a nova
    // é gente, e a semente devolve a atual para a tela mostrar o que se perde.
    principalKeywordId: article.principalKeywordId,
    secondaryKeywordIds: article.secondaryKeywordIds.filter(fora),
    narrativeReinforcementIds: article.narrativeReinforcementIds.filter(fora),
    territoryRef: article.territoryRef || null,
    siloId: article.siloId ?? null,
    suggestedSlug: article.suggestedSlug,
    removedKeywordIds: [...removidas],
    reason: removidas.has(article.principalKeywordId)
      ? "A Principal saiu da composição: escolher a nova Principal é decisão humana."
      : "Composição reduzida pela decisão estrutural; Principal, slug e proteção preservados.",
  };
}
