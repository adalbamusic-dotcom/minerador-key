/**
 * ===== REPARO PONTUAL DO ARTIGO (`ARTICLE_REPAIR_1`) =====
 *
 * SDD: `docs/04-arquiteto/sdd-reparo-pontual-do-artigo-2026-10-01.md`
 * (autorizada pelo dono em 2026-10-01, escopo: reexecutável + decisão humana).
 *
 * ==================== O DEFEITO QUE ISTO ATENDE ====================
 *
 * As operações que fecham um artigo escrevem VÁRIOS artefatos em sequência, sem
 * atomicidade entre eles: parecer, marcador, ArticleDNA, item de workflow. Se a
 * rede cai, o provider devolve 5xx ou a aba fecha no meio, o artigo fica com
 * metade do rastro — existe e está aprovado, mas a PROVA de que foi aprovado
 * não está onde o portão a lê.
 *
 * Em 2026-10-01 um publicado ficou preso exatamente assim: ArticleDNA v2
 * aprovado, decisão humana gravada na keyword em 28/09 — e nem o parecer
 * resolvido, nem a entrada no marcador. Nenhuma tela sabia consertar.
 *
 * ==================== NÃO INVENTAMOS CATÁLOGO DE DEFEITO ====================
 *
 * `resolveRadarEligibility` já avalia doze invariantes e já sabe dizer qual
 * quebrou e por quê. Este módulo não repete essa lista: ele a CLASSIFICA, e a
 * classificação é a coisa inteira.
 *
 * ==================== A CLASSE IMPORTA MAIS QUE O BOTÃO ====================
 *
 * Um botão que "conserta tudo" apagaria a diferença entre *o registro se
 * perdeu* e *a decisão nunca foi tomada*. A segunda não é defeito — é trabalho
 * pendente, e repará-la automaticamente transformaria o portão em carimbo.
 *
 * Puro: sem React, sem rede, sem banco. Quem grava são as rotas que já existem.
 */

import type { RadarEligibility, RadarGateCode, RadarCandidateArticle } from "./radar-handoff-gate.ts";
import type { ArticleFormationMarkerPayload } from "./article-formation-marker.ts";

export type RepairClass =
  /** O registro se perdeu no meio da operação. Regravável, sem decisão nova. */
  | "reexecutavel"
  /** Falta uma decisão editorial que ninguém tomou. Vira pergunta, nunca clique. */
  | "decisao_humana"
  /** Só se resolve chamando provider. Fora do escopo desta entrega. */
  | "custo_de_provider"
  /** Pertence a outra fase do Arquiteto; aqui só apontamos onde. */
  | "outra_fase"
  /** É o conteúdo da decisão, não o registro dela. Nunca automático. */
  | "composicao";

export type ArticleRepairStep = {
  code: RadarGateCode;
  classe: RepairClass;
  /** O motivo que o portão já sabe dizer. Não reescrevemos. */
  motivo: string;
  /** O que o reparo faria. `null` quando não há reparo aqui. */
  acao: string | null;
  /** Onde se resolve, quando o lugar é outro. */
  onde: string | null;
  /** Esta entrega sabe reparar? */
  disponivel: boolean;
};

export type ArticleRepairPlan = {
  articleId: string;
  label: string;
  /** Vazio quando o artigo está íntegro — e aí o reparo não se oferece. */
  bloqueios: ArticleRepairStep[];
  saudavel: boolean;
};

/** O parecer da SERP deste artigo, no formato mínimo que a decisão precisa. */
export type ParecerDoArtigo = {
  candidateRef: string;
  assessmentId: string;
  formationBaseHash: string;
  /** Já tem decisão humana amarrada a ESTA base. */
  resolvido: boolean;
};

export type ArticleRepairFacts = {
  /** Os mesmos fatos que o portão leu, para não derivar duas vezes. */
  article: Pick<RadarCandidateArticle, "articleId" | "label" | "articleDnaVersionId" | "belongsToCurrentScenario" | "readbackConfirmed">;
  eligibility: RadarEligibility;
  parecer: ParecerDoArtigo | null;
  /** A formação deste artigo consta no marcador? */
  constaNoMarcador: boolean;
  /**
   * Existe decisão humana de formação registrada FORA do marcador?
   *
   * É o que distingue "o registro se perdeu" de "ninguém decidiu". Um publicado
   * reforçado carrega `articleFormationRef` + decisão humana na própria
   * keyword; se isso existe e o marcador não tem a entrada, a decisão foi
   * tomada e o rastro é que falhou.
   */
  formacaoDecididaForaDoMarcador: boolean;
};

/* ====================== onde cada bloqueio se resolve ====================== */

const ONDE: Partial<Record<RadarGateCode, string>> = {
  CANONICAL_SILO_BINDING: "aba Silos: consolidar SiloDNA e SiloPage do território",
  INTERNAL_LINK_GRAPH_APPROVED: "fase Links internos: confirmar o grafo",
  NO_CROSS_SILO: "aba Silos: a membership das buscas aponta outro Silo",
};

const COMPOSICAO: ReadonlySet<RadarGateCode> = new Set<RadarGateCode>([
  "ARTICLE_PARENT_EXPLICIT", "PRINCIPAL_DEFINED", "COMPOSITION_VALID",
  "MAX_KEYWORDS_RESPECTED", "SLUG_STATE_VALID",
]);

const PROVIDER: ReadonlySet<RadarGateCode> = new Set<RadarGateCode>(["SERP_EXECUTED", "SERP_CURRENT"]);

/**
 * ===== `ARTICLE_DNA_CURRENT` FALHA POR TRÊS MOTIVOS DIFERENTES =====
 *
 * Sem ArticleDNA não há o que reparar — o artigo não foi escrito ainda.
 * Descrever outra composição é acervo, e acervo não se conserta: materializa-se
 * de novo noutra fase. Só o readback não confirmado é rastro perdido.
 */
function classificaDnaCorrente(facts: ArticleRepairFacts): { classe: RepairClass; acao: string | null; onde: string | null } {
  if (!facts.article.articleDnaVersionId) {
    return { classe: "composicao", acao: null, onde: "aba Artigos: o artigo ainda precisa ser materializado" };
  }
  if (!facts.article.belongsToCurrentScenario) {
    return { classe: "outra_fase", acao: null, onde: "aba Artigos: este ArticleDNA é acervo; o cenário corrente é outro" };
  }
  /*
   * É rastro perdido de verdade — e mesmo assim não ganha botão aqui.
   *
   * Esta entrega implementa o reparo do marcador e a decisão sobre o parecer.
   * Regravar ArticleDNA passa pelo versionamento, e oferecer um botão que não
   * existe seria pior do que não oferecer nenhum: a classe diz o que é, e o
   * `onde` diz onde se resolve hoje.
   */
  return {
    classe: "reexecutavel",
    acao: null,
    onde: "aba Artigos: regravar o ArticleDNA deste artigo e reler",
  };
}

/**
 * ===== `SERP_RESOLVED`: RESTAURAR VENCE PERGUNTAR =====
 *
 * Quando a decisão JÁ foi tomada e só o registro se perdeu, pedir uma decisão
 * nova seria pedir à pessoa que decidisse duas vezes a mesma coisa — e a
 * segunda resposta poderia divergir da primeira, que é a que o artigo já
 * carrega. Por isso restaurar o marcador vem antes de abrir o parecer.
 *
 * Sem decisão nenhuma em lugar algum, aí sim é pergunta — e pergunta de
 * verdade, com as opções do contrato e motivo obrigatório.
 */
function classificaSerpResolvida(facts: ArticleRepairFacts): { classe: RepairClass; acao: string | null; onde: string | null } {
  if (facts.formacaoDecididaForaDoMarcador && !facts.constaNoMarcador) {
    return {
      classe: "reexecutavel",
      acao: "Gravar no marcador de formação a conclusão que já foi decidida, e reler.",
      onde: null,
    };
  }
  if (facts.parecer && !facts.parecer.resolvido) {
    return {
      classe: "decisao_humana",
      acao: "Registrar a decisão editorial sobre o parecer da SERP.",
      onde: null,
    };
  }
  /*
   * Nem rastro perdido, nem parecer em aberto: o bloqueio vem de outro lugar
   * que este módulo não enxerga. Apontar sem saber seria inventar.
   */
  return { classe: "outra_fase", acao: null, onde: "aba Artigos: a conclusão da formação deste artigo" };
}

export function classificaBloqueio(code: RadarGateCode, facts: ArticleRepairFacts): {
  classe: RepairClass; acao: string | null; onde: string | null;
} {
  if (code === "ARTICLE_DNA_CURRENT") return classificaDnaCorrente(facts);
  if (code === "SERP_RESOLVED") return classificaSerpResolvida(facts);
  if (PROVIDER.has(code)) {
    return {
      classe: "custo_de_provider",
      acao: null,
      onde: "\"Processar artigos\" para este artigo (cache primeiro: sem custo quando as 4 lentes já estão no cache)",
    };
  }
  if (COMPOSICAO.has(code)) return { classe: "composicao", acao: null, onde: ONDE[code] ?? null };
  return { classe: "outra_fase", acao: null, onde: ONDE[code] ?? null };
}

/** O escopo desta entrega: o que se repara sem chamar provider. */
const DISPONIVEL: ReadonlySet<RepairClass> = new Set<RepairClass>(["reexecutavel", "decisao_humana"]);

/**
 * O plano de reparo de UM artigo.
 *
 * Só entra o que o portão reprovou. Invariante satisfeita não vira passo — é
 * assim que a idempotência acontece: reparado uma vez, o passo some sozinho na
 * leitura seguinte, sem nenhum controle de "já rodou".
 */
export function buildArticleRepairPlan(facts: ArticleRepairFacts): ArticleRepairPlan {
  const bloqueios = facts.eligibility.checks
    .filter(check => !check.ok)
    .map(check => {
      const { classe, acao, onde } = classificaBloqueio(check.code, facts);
      return { code: check.code, classe, motivo: check.detail, acao, onde, disponivel: DISPONIVEL.has(classe) && Boolean(acao) };
    });
  return {
    articleId: facts.eligibility.articleId,
    label: facts.eligibility.label,
    bloqueios,
    saudavel: bloqueios.length === 0,
  };
}

/* ====================== o payload do reparo do marcador ====================== */

export type ConcludedFormation = ArticleFormationMarkerPayload["concludedFormations"][number];

/**
 * Acrescenta uma conclusão ao marcador, com a MESMA deduplicação que o reforço
 * de publicados já aplica: a entrada nova expulsa qualquer anterior do mesmo
 * `candidateRef` ou do mesmo artigo materializado.
 *
 * Reescrever `confirmation` pela lista é o que torna o reparo idempotente de
 * fato: rodar duas vezes devolve exatamente o mesmo marcador, porque as
 * contagens saem da lista final e não de um incremento.
 */
export function appendConcludedFormation(
  marker: ArticleFormationMarkerPayload,
  entry: ConcludedFormation,
  agora: string,
): ArticleFormationMarkerPayload {
  const formacoes = [
    ...marker.concludedFormations.filter(item =>
      item.candidateRef !== entry.candidateRef
      && (item.materializedArticleId === null || item.materializedArticleId !== entry.materializedArticleId)),
    entry,
  ];
  return {
    ...marker,
    processedAt: agora,
    confirmation: {
      ...marker.confirmation,
      status: "partial",
      confirmedAt: agora,
      confirmedArticleCount: formacoes.length,
      coveredKeywordCount: new Set(formacoes.flatMap(item => item.members.map(membro => membro.keywordId))).size,
    },
    concludedFormations: formacoes,
  };
}

/**
 * A entrada de conclusão que o reparo gravaria, montada dos fatos do artigo.
 *
 * Devolve `null` quando falta qualquer campo obrigatório — e isso é a guarda
 * principal deste módulo. Um reparo que preenche buraco com valor inventado
 * grava uma formação que ninguém fechou, e o marcador deixa de ser prova de
 * coisa alguma. Faltando dado, não há reparo: há diagnóstico incompleto.
 */
export function concludedFormationForRepair(input: {
  candidateRef: string | null;
  territoryRef: string | null;
  principalKeywordId: string | null;
  secondaryKeywordIds: readonly string[];
  narrativeReinforcementIds: readonly string[];
  formationBaseHash: string | null;
  slug: string | null;
  fullPath: string | null;
  materializedArticleId: string;
  agora: string;
  ator: string;
}): ConcludedFormation | null {
  if (!input.candidateRef || !input.territoryRef || !input.principalKeywordId) return null;
  if (!input.formationBaseHash || !input.materializedArticleId || !input.ator) return null;
  return {
    candidateRef: input.candidateRef,
    territoryRef: input.territoryRef,
    principalKeywordId: input.principalKeywordId,
    members: [
      { keywordId: input.principalKeywordId, role: "principal" as const },
      ...input.secondaryKeywordIds.map(keywordId => ({ keywordId, role: "secundaria" as const })),
      ...input.narrativeReinforcementIds.map(keywordId => ({ keywordId, role: "reforco" as const })),
    ],
    formationBaseHash: input.formationBaseHash,
    slug: input.slug,
    fullPath: input.fullPath,
    concludedAt: input.agora,
    concludedBy: input.ator,
    materializedArticleId: input.materializedArticleId,
  };
}

/** O marcador já descreve esta formação? É a pergunta que o portão faz. */
export function markerCovers(
  marker: ArticleFormationMarkerPayload | null,
  input: { candidateRef: string | null; articleId: string },
): boolean {
  return (marker?.concludedFormations ?? []).some(item =>
    (input.candidateRef !== null && item.candidateRef === input.candidateRef)
    || item.materializedArticleId === input.articleId);
}
