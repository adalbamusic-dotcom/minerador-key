/**
 * ZERAR O RADAR DE UM ARTIGO DE TESTE — sem tocar no que veio antes dele.
 *
 * Os artigos de homologação são descartáveis, e o acúmulo de
 * `v1 → v2 → stale → reopened → reused` estava atrapalhando a leitura de cada
 * rodada. O reset devolve a linha ao estado "nunca investigado" para a próxima
 * execução começar limpa.
 *
 * O QUE ELE APAGA — tudo o que o Radar produziu:
 *
 *   curadoria da SERP canônica · curadoria da pesquisa · investigação profunda
 *   evidência das SERPs auxiliares · extrações · falhas · benchmark
 *   termos · decisões estruturais · competitividade · modelo · relatório
 *   pacote e transferência do Planejador · aprovação
 *
 * O QUE ELE NÃO ALCANÇA, POR CONSTRUÇÃO:
 *
 *   ArticleDNA, KeywordDNA, SiloDNA, SiloPage, InternalLinkGraph e qualquer
 *   artefato do Minerador ou do Arquiteto. Esta função recebe e devolve APENAS
 *   o payload da análise do Radar — os fundamentos não passam por aqui, então
 *   não há caminho para alterá-los nem por engano.
 *
 * E o histórico não é reescrito: o reset é uma VERSÃO NOVA e vazia. As
 * anteriores continuam gravadas, apenas nenhuma tela volta a lê-las.
 *
 * Domínio puro: sem fetch, sem storage, sem provider.
 */

import type { RadarAnalysisPayload } from "./analysis-contracts.ts";

/** O que o reset zera. Serve à tela e ao teste que prova o alcance. */
export const RADAR_RESET_CLEARED = [
  "serpDecisions",
  "selectedCompetitorIds",
  "extractionIds",
  "extractions",
  "extractionFailures",
  "deepResearch",
  /*
   * ACRESCENTADOS NO GATE 15 E ESQUECIDOS NESTA LISTA ATÉ O GATE 17.
   *
   * A função já os zerava; a constante que serve de contrato dizia que não.
   * Uma lista que descreve o comportamento errado é pior que nenhuma lista:
   * ela é lida como verdade. O teste agora deriva as chaves limpas comparando
   * o payload antes e depois, e falha se as duas voltarem a divergir.
   */
  "finalizedBundle",
  "verifiedSources",
  "sourceVerificationFailures",
  "analysisCompletedAt",
  "benchmark",
  "semanticTerms",
  "structuralDecisions",
  "competitiveness",
  "competitiveReport",
  "plannerPackage",
  "plannerTransfer",
  "status",
  "humanNotes",
  "approvedAt",
  "approvedBy",
] as const;

/** O que o reset nunca encosta. Está fora do payload — e o teste confirma. */
export const RADAR_RESET_PRESERVED = [
  "ArticleDNA",
  "KeywordDNA",
  "SiloDNA",
  "SiloPage",
  "InternalLinkGraph",
  "keywords do Minerador",
] as const;

/**
 * O payload de uma linha Radar recém-zerada.
 *
 * As decisões da SERP voltam a `pending` em vez de sumirem: o schema exige uma
 * decisão por item do snapshot, e "pendente" é a verdade — ninguém decidiu nada
 * ainda nesta rodada. A identidade (marca, artigo, versão do DNA, snapshot)
 * permanece porque é ela que diz DE QUEM é esta linha.
 */
export function buildRadarResetPayload(payload: RadarAnalysisPayload): RadarAnalysisPayload {
  return {
    ...payload,
    serpDecisions: payload.serpDecisions.map(decision => ({ ...decision, decision: "pending" as const, reason: "", note: "" })),
    selectedCompetitorIds: [],
    extractionIds: [],
    extractions: [],
    extractionFailures: [],
    deepResearch: null,
    /*
     * O QUE DESCREVIA A INVESTIGAÇÃO ZERADA SAI COM ELA.
     *
     * O bundle congelado e as fontes verificadas descrevem extrações que esta
     * versão acabou de descartar: mantê-los deixaria a linha zerada exibindo
     * "investigação congelada" sobre uma amostra que não existe mais. As
     * versões ANTERIORES continuam gravadas com o congelado intacto — o reset
     * cria uma versão nova, não reescreve o passado.
     */
    finalizedBundle: null,
    /* A conclusão do ANALYZE descreve a rodada que acabou de ser descartada. */
    analysisCompletedAt: null,
    verifiedSources: [],
    sourceVerificationFailures: [],
    benchmark: null,
    semanticTerms: [],
    structuralDecisions: [],
    competitiveness: null,
    competitiveReport: null,
    plannerPackage: null,
    plannerTransfer: null,
    status: "draft",
    humanNotes: [],
    approvedAt: null,
    approvedBy: null,
  };
}

export type RadarResetSummary = {
  /** Tudo que a versão atual perde. Números, para a pessoa saber o que descarta. */
  extractions: number;
  failures: number;
  researchReferences: number;
  auxiliaryQueries: number;
  hadReport: boolean;
  hadModel: boolean;
  wasFinalized: boolean;
  wasApproved: boolean;
  /** O que o reset NÃO consegue desfazer sozinho. Dito, nunca escondido. */
  limitations: string[];
};

export function radarResetSummary(payload: RadarAnalysisPayload | null | undefined): RadarResetSummary {
  const registro = payload?.deepResearch || null;
  const limitations: string[] = [];

  /*
   * A revisão da SERP vive em outra tabela e não passa por este payload. Uma
   * coleta nova gera outro snapshot, e a revisão antiga deixa de descrever o
   * atual — mas o registro dela continua lá, e é honesto dizer isso.
   */
  limitations.push("A revisão da SERP fica registrada no histórico remoto; a coleta seguinte gera outro snapshot e ela deixa de valer para o atual.");
  limitations.push("As versões anteriores da análise continuam gravadas: o reset cria uma versão nova e vazia, não reescreve o passado.");

  return {
    extractions: payload?.extractions.length || 0,
    failures: payload?.extractionFailures.length || 0,
    researchReferences: registro?.researchCuration?.references.length || 0,
    auxiliaryQueries: (registro?.queries || []).filter(query => query.serpClass === "auxiliary" && query.execution === "EXECUTED").length,
    hadReport: Boolean(payload?.competitiveReport),
    hadModel: Boolean(payload?.competitiveReport?.observedCompetitiveModel),
    /*
     * FINALIZADA É FINALIZADA POR QUALQUER DAS DUAS PROVAS.
     *
     * Esta linha lia só `finalizedAt` do registro. Um payload com bundle
     * congelado e registro sem carimbo — que é o que sobra quando a finalização
     * grava o bundle numa versão e o registro noutra — dizia à pessoa que ela
     * não estava descartando nenhuma finalização. Subestimar o que se perde é
     * pior que exagerar: a pessoa clica achando que o custo é menor.
     */
    wasFinalized: Boolean(registro?.finalizedAt || payload?.finalizedBundle),
    wasApproved: payload?.status === "approved",
    limitations,
  };
}

/** A frase do botão, com o que será descartado. */
export function radarResetLabel(summary: RadarResetSummary): string {
  const partes: string[] = [];
  if (summary.extractions) partes.push(`${summary.extractions} página(s) analisada(s)`);
  if (summary.researchReferences) partes.push(`${summary.researchReferences} referência(s) curada(s)`);
  if (summary.auxiliaryQueries) partes.push(`${summary.auxiliaryQueries} SERP(s) auxiliar(es)`);
  if (summary.hadReport) partes.push("o relatório");
  if (summary.wasFinalized) partes.push("a finalização");
  return partes.length
    ? `Descarta ${partes.join(" · ")}. Os fundamentos do artigo não são tocados.`
    : "Não há investigação para descartar nesta linha.";
}

/* ======================================================================== */
/* ==========  GATE 17 · O RESET COMO CONTRATO, NÃO COMO GESTO  ========== */
/* ======================================================================== */

/**
 * ZERAR INVESTIGAÇÃO É UMA FRONTEIRA, E FRONTEIRA PRECISA SER NOMEADA.
 *
 * "Zerar" parece simples até alguém perguntar o que exatamente some. A resposta
 * errada apaga o vídeo que a pessoa registrou na semana passada, ou a
 * contribuição que o especialista mandou, ou o histórico que provava o que foi
 * entregue. A resposta certa é estreita: some a PESQUISA CORRENTE, e só ela.
 *
 *   NÃO é reset do Article.
 *   NÃO é reset do Radar inteiro.
 *   NÃO é limpeza de histórico.
 *   NÃO é limpeza de Vídeos.
 *   NÃO é limpeza de Especialista.
 *
 * O QUE PROTEGE ESSA FRONTEIRA NÃO É DISCIPLINA, É ESTRUTURA.
 *
 * Vídeos e evidência do especialista não estão entre as 31 chaves do payload
 * que o reset reescreve — eles vivem em outro lugar, e por isso esta função não
 * tem como alcançá-los nem por engano. O mesmo vale para os fundamentos. A
 * garantia não depende de ninguém lembrar: depende de o caminho não existir.
 */

/**
 * O que fica FORA do alcance do reset por não estar no payload que ele
 * reescreve. A lista existe para o teste provar a fronteira, não para
 * documentá-la duas vezes.
 */
export const RADAR_RESET_OUTSIDE_PAYLOAD = [
  "existingContent",
  "expertEvidence",
  "topics",
  "specialist",
  "amazon",
] as const;

/**
 * As chaves de identidade que sobrevivem ao reset DENTRO do payload.
 *
 * Zerar a investigação não torna a linha anônima: ela continua sendo a linha
 * deste artigo, desta marca, desta versão do ArticleDNA. Apagar isso criaria
 * uma versão órfã que nenhuma leitura conseguiria vincular de volta.
 */
export const RADAR_RESET_IDENTITY_KEPT = [
  "schemaVersion",
  "brandId",
  "articleId",
  "articleDnaVersionId",
  "serpSnapshotId",
  "serpSnapshotVersion",
  "serpSnapshotHash",
  "mode",
  "modeRecommendation",
  "modeHumanReason",
  "keywordDecisions",
] as const;

/* ========================= a decisão do reset ========================== */

export type RadarResetOutcomeId = "PERFORMED" | "NO_CHANGE" | "REFUSED_IN_FLIGHT";

export type RadarResetDecision = {
  outcome: RadarResetOutcomeId;
  /** Deve escrever uma versão nova? Só `PERFORMED` escreve. */
  writes: boolean;
  message: string;
  detail: string;
};

/**
 * O QUE ACONTECE QUANDO A PESSOA CLICA EM ZERAR.
 *
 * Três respostas, e nenhuma delas é "depende de onde você clicou". A tela
 * consulta; ela não decide.
 *
 * ZERAR ESTADO RUIM É LEGÍTIMO. Investigação obsoleta, parcial, falha ou já
 * finalizada pode ser descartada — abandonar uma pesquisa é uma decisão
 * editorial válida, e exigir "finalize antes de zerar" obrigaria a pessoa a
 * carimbar uma rodada que ela já concluiu que não serve.
 *
 * O ÚNICO NÃO É A CONCORRÊNCIA. Com START, ANALYZE ou FINALIZE em voo, zerar
 * disputaria o mesmo pipeline e o vencedor seria decidido pela latência da
 * rede — que é o pior lugar do sistema para decidir o que a pessoa quis.
 */
export function radarResetDecision(input: {
  /** Existe investigação corrente para descartar? */
  hasCurrentInvestigation: boolean;
  /** START, ANALYZE ou FINALIZE em voo neste artigo. */
  inFlight: boolean;
}): RadarResetDecision {
  if (input.inFlight) {
    return {
      outcome: "REFUSED_IN_FLIGHT",
      writes: false,
      message: "Outra ação ainda está em andamento neste artigo. Aguarde a conclusão.",
      detail: "Zerar durante START, ANALYZE ou FINALIZE disputaria o mesmo pipeline.",
    };
  }
  /*
   * NADA A ZERAR NÃO É ERRO — e não pode virar versão nova.
   *
   * Gravar uma versão vazia sobre um estado já vazio encheria o histórico de
   * eventos que não descrevem nada. Repetir a intenção responde a mesma coisa.
   */
  if (!input.hasCurrentInvestigation) {
    return {
      outcome: "NO_CHANGE",
      writes: false,
      message: "Esta linha não tem investigação para zerar.",
      detail: "Nenhuma versão foi criada: o estado corrente já é o de pesquisa não iniciada.",
    };
  }
  return {
    outcome: "PERFORMED",
    writes: true,
    message: "Investigação zerada.",
    detail: "Uma versão nova e vazia foi criada; as anteriores continuam gravadas.",
  };
}

/**
 * O QUE A PROJEÇÃO CORRENTE PRECISA MOSTRAR DEPOIS DO RESET CONFIRMADO.
 *
 * Existe para o teste ter contra o que comparar e para a tela não inventar
 * variações. Um reset que deixa "Finalizada" em algum canto não foi um reset:
 * foi meia limpeza, e meia limpeza é o estado híbrido que §15 proíbe.
 */
export const RADAR_RESET_EXPECTED_CURRENT = {
  investigationState: "NOT_STARTED",
  operationalStatus: "NOT_STARTED",
  plannerHandoffReady: false,
  modeSelectorLocked: false,
} as const;
