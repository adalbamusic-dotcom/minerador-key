/**
 * AMOSTRA VAZIA NÃO É INVESTIGAÇÃO CONCLUÍDA.
 *
 * O smoke de "cremes skin care" terminou assim: 7 referências confirmadas, 4
 * analisadas, 3 falhas, **zero páginas comparáveis** — e mesmo assim foi
 * possível gerar relatório com 49 necessidades, marcar revisão e aprovar a
 * SERP. A investigação não tinha do que concluir e concluiu.
 *
 * Aqui existe uma autoridade só para responder: esta amostra sustenta uma
 * leitura competitiva? Cinco respostas possíveis, com critério explícito:
 *
 *   SUFFICIENT                · comparáveis bastam para faixa e padrão
 *   PARTIAL_BUT_USABLE        · dá para ler, com limitação declarada
 *   CONFLICTING_SEARCH_INTENT · não há benchmark editorial porque a busca é
 *                               comercial — conclusão legítima, não falha
 *   INSUFFICIENT              · não há amostra comparável nem explicação
 *                               observada para a ausência dela
 *   BLOCKED                   · falta snapshot ou curadoria confirmada
 *
 * O terceiro nível corrige uma injustiça do modelo anterior. Quando o artigo
 * declara comportamento transacional e a SERP devolve produto, a coleta não
 * falhou: ela CONFIRMOU o comportamento declarado. Chamar isso de "amostra
 * insuficiente" mandava a pessoa recoletar uma SERP que já tinha respondido.
 *
 * Nenhum nível apaga observação: as páginas extraídas, as falhas e o que a SERP
 * mostrou continuam visíveis. O que a autoridade impede é transformar ausência
 * de benchmark em conclusão editorial silenciosa.
 *
 * Domínio puro: sem fetch, sem storage, sem provider.
 */

export type RadarSufficiencyLevel =
  | "SUFFICIENT"
  | "PARTIAL_BUT_USABLE"
  | "CONFLICTING_SEARCH_INTENT"
  | "INSUFFICIENT"
  | "BLOCKED";

/** O que a intenção declarada e a SERP observada dizem uma sobre a outra. */
export type RadarIntentReadingVerdict = "ALIGNED" | "COHERENT_COMMERCIAL" | "DIVERGENT" | "UNKNOWN";

export type RadarIntentReading = {
  declaredIntent: string | null;
  observedIntent: string | null;
  /** Fração dos resultados observados que são produto, loja ou marketplace. */
  commercialShare: number | null;
  commercialDominance: boolean;
  verdict: RadarIntentReadingVerdict;
  note: string;
};

export type RadarInvestigationSufficiency = {
  level: RadarSufficiencyLevel;
  selected: number;
  analyzed: number;
  failed: number;
  comparable: number;
  /** A frase que a tela mostra no lugar de "SERP concluída". */
  headline: string;
  /** Por que este nível, em linguagem de quem opera. */
  reasons: string[];
  /** A leitura de intenção, quando houve evidência para fazê-la. */
  intentReading: RadarIntentReading | null;
  /** Faixa, mediana e padrão estrutural só existem com amostra comparável. */
  canBuildCompetitiveModel: boolean;
  /** Necessidade competitiva exige benchmark; observação da SERP não é benchmark. */
  canDeriveCompetitiveNeeds: boolean;
  /** A aprovação final da investigação. Histórico não é afetado. */
  canApprove: boolean;
};

/** Abaixo disso a faixa descreve páginas, não mercado. */
export const RADAR_MIN_COMPARABLE_SUFFICIENT = 3;

/** Acima disso a SERP não é "um pouco comercial": ela é comercial. */
export const RADAR_COMMERCIAL_DOMINANCE_SHARE = 0.6;

export type RadarIntentEvidence = {
  /** O que o ArticleDNA e a qualificação semântica declaram. */
  declaredIntent?: string | null;
  /** O que o diagnóstico da coleta classificou como intenção dominante. */
  observedIntent?: string | null;
  /** Resultados observados classificados como produto, loja ou marketplace. */
  commercialResults?: number;
  /** Total de resultados observados na SERP. */
  observedResults?: number;
};

const normalizar = (value: string | null | undefined) =>
  (value || "").toLocaleLowerCase("pt-BR").normalize("NFD").replace(/[̀-ͯ]/g, "").trim();

const ehComercial = (value: string | null | undefined) => {
  const texto = normalizar(value);
  return Boolean(texto) && (texto.includes("transacional") || texto.includes("transactional")
    || texto.includes("comercial") || texto.includes("commercial")
    || texto.includes("compra") || texto.includes("product"));
};

const ehInformacional = (value: string | null | undefined) => {
  const texto = normalizar(value);
  return Boolean(texto) && (texto.includes("informa") || texto.includes("educa") || texto.includes("navegacional"));
};

/**
 * A SERP confirma ou contradiz o que o artigo declarou?
 *
 * Esta leitura não decide nível sozinha. Ela existe para que a investigação
 * possa dizer "a busca é comercial" em vez de "a coleta falhou" — e para que o
 * Planejador receba a divergência como fato observado, não como suspeita.
 */
export function readRadarSearchIntent(evidence: RadarIntentEvidence | null | undefined): RadarIntentReading | null {
  if (!evidence) return null;
  const observados = evidence.observedResults || 0;
  const comerciais = evidence.commercialResults || 0;
  const share = observados > 0 ? Number((comerciais / observados).toFixed(2)) : null;
  const dominancia = share !== null && share >= RADAR_COMMERCIAL_DOMINANCE_SHARE;

  const declarada = evidence.declaredIntent || null;
  const observada = evidence.observedIntent || null;
  if (!declarada && !observada && share === null) return null;

  const declaradaComercial = ehComercial(declarada);
  const observadaComercial = ehComercial(observada) || dominancia;
  const declaradaInformacional = ehInformacional(declarada);
  const comum = { declaredIntent: declarada, observedIntent: observada, commercialShare: share, commercialDominance: dominancia };

  if (declaradaComercial && observadaComercial) {
    return {
      ...comum,
      verdict: "COHERENT_COMMERCIAL",
      note: "O artigo declara comportamento comercial e a SERP devolve páginas comerciais: a coleta confirma a intenção declarada.",
    };
  }

  if (declaradaInformacional && observadaComercial) {
    return {
      ...comum,
      verdict: "DIVERGENT",
      note: "O artigo declara intenção informacional e a busca responde com páginas comerciais: a divergência é fato observado, não erro de coleta.",
    };
  }

  if (declarada && observada && normalizar(declarada) === normalizar(observada)) {
    return {
      ...comum,
      verdict: "ALIGNED",
      note: "A intenção observada na SERP corresponde à intenção declarada pelo artigo.",
    };
  }

  return {
    ...comum,
    verdict: "UNKNOWN",
    note: "Não houve evidência suficiente para comparar a intenção declarada com a intenção observada.",
  };
}

export function resolveRadarInvestigationSufficiency(input: {
  hasSnapshot: boolean;
  curationConfirmed: boolean;
  selected: number;
  analyzed: number;
  failed: number;
  comparable: number;
  /** Opcional: sem ela a autoridade se comporta exatamente como antes. */
  intentEvidence?: RadarIntentEvidence | null;
}): RadarInvestigationSufficiency {
  const intentReading = readRadarSearchIntent(input.intentEvidence);
  const base = {
    selected: input.selected, analyzed: input.analyzed, failed: input.failed, comparable: input.comparable, intentReading,
  };

  if (!input.hasSnapshot || !input.curationConfirmed || input.selected === 0) {
    return {
      ...base,
      level: "BLOCKED",
      headline: "Investigação sem amostra",
      reasons: [
        !input.hasSnapshot ? "Não há snapshot da SERP." : "",
        input.hasSnapshot && !input.curationConfirmed ? "A curadoria ainda não foi confirmada." : "",
        input.hasSnapshot && input.curationConfirmed && !input.selected ? "Nenhuma referência foi selecionada." : "",
      ].filter(Boolean),
      canBuildCompetitiveModel: false,
      canDeriveCompetitiveNeeds: false,
      canApprove: false,
    };
  }

  /*
   * ZERO COMPARÁVEIS É O CASO DO SMOKE.
   *
   * Páginas foram extraídas — e nenhuma delas é artigo editorial. Marketplace,
   * vitrine de produto e vídeo aparecem na SERP, mas não formam benchmark. Sem
   * página comparável não há mediana, faixa, padrão, lacuna nem oportunidade.
   *
   * MAS existe uma diferença que o modelo anterior não fazia: quando a SERP é
   * dominada por comércio, a ausência de artigo editorial É a resposta da
   * pesquisa. A investigação conclui, com o achado declarado, em vez de mandar
   * recoletar uma SERP que já respondeu.
   */
  if (input.comparable === 0) {
    if (intentReading?.commercialDominance
      && (intentReading.verdict === "COHERENT_COMMERCIAL" || intentReading.verdict === "DIVERGENT")) {
      const coerente = intentReading.verdict === "COHERENT_COMMERCIAL";
      const razoes = [
        intentReading.note,
        `${Math.round((intentReading.commercialShare || 0) * 100)}% dos resultados observados são páginas comerciais; não há amostra editorial para formar benchmark.`,
      ];
      if (input.failed > 0) razoes.push(`${input.failed} página(s) selecionada(s) não puderam ser extraídas.`);
      if (!coerente) razoes.push("A divergência entre intenção declarada e comportamento de busca precisa de decisão humana antes do planejamento.");
      return {
        ...base,
        level: "CONFLICTING_SEARCH_INTENT",
        headline: coerente ? "Busca comercial confirmada, sem benchmark editorial" : "Intenção declarada diverge do comportamento de busca",
        reasons: razoes,
        /*
         * Conclui, mas não inventa: há achado para registrar e nenhuma
         * necessidade competitiva a derivar. Quem fecha continua sendo pessoa.
         */
        canBuildCompetitiveModel: false,
        canDeriveCompetitiveNeeds: false,
        canApprove: true,
      };
    }

    const razoes = ["Não foi possível formar uma amostra editorial comparável."];
    if (input.analyzed > 0) razoes.push(`${input.analyzed} página(s) foram analisadas, mas nenhuma é artigo editorial comparável (produto, marketplace, vídeo ou extração parcial).`);
    if (input.failed > 0) razoes.push(`${input.failed} página(s) selecionada(s) não puderam ser extraídas.`);
    if (input.analyzed === 0) razoes.push("Nenhuma das páginas selecionadas chegou a ser extraída.");
    return { ...base, level: "INSUFFICIENT", headline: "Amostra competitiva insuficiente", reasons: razoes, canBuildCompetitiveModel: false, canDeriveCompetitiveNeeds: false, canApprove: false };
  }

  if (input.comparable >= RADAR_MIN_COMPARABLE_SUFFICIENT && input.failed === 0) {
    return {
      ...base,
      level: "SUFFICIENT",
      headline: "Amostra competitiva suficiente",
      reasons: [
        `${input.comparable} página(s) editorial(is) comparável(is) sustentam a leitura.`,
        ...(intentReading?.verdict === "DIVERGENT" ? [intentReading.note] : []),
      ],
      canBuildCompetitiveModel: true,
      canDeriveCompetitiveNeeds: true,
      canApprove: true,
    };
  }

  const razoes: string[] = [];
  if (input.comparable < RADAR_MIN_COMPARABLE_SUFFICIENT) razoes.push(`Apenas ${input.comparable} página(s) comparável(is): a faixa descreve estas páginas, não o mercado.`);
  if (input.failed > 0) razoes.push(`${input.failed} página(s) selecionada(s) não puderam ser extraídas e ficaram fora da amostra.`);
  if (intentReading?.verdict === "DIVERGENT") razoes.push(intentReading.note);
  return {
    ...base,
    level: "PARTIAL_BUT_USABLE",
    headline: "Amostra competitiva parcial",
    reasons: razoes,
    canBuildCompetitiveModel: true,
    canDeriveCompetitiveNeeds: true,
    canApprove: true,
  };
}

export function radarSufficiencyLabel(level: RadarSufficiencyLevel): string {
  return {
    SUFFICIENT: "Análise suficiente",
    PARTIAL_BUT_USABLE: "Análise parcial",
    CONFLICTING_SEARCH_INTENT: "Busca comercial, sem benchmark editorial",
    INSUFFICIENT: "Análise insuficiente",
    BLOCKED: "Análise não iniciada",
  }[level];
}
