/**
 * QUEM TEM A VOZ MAIS ALTA — E SOBRE O QUÊ.
 *
 * Esta é uma DIRETRIZ CANÔNICA, não uma regra de um lote. Ela existe porque a
 * mesma discussão volta de tempos em tempos disfarçada de melhoria: uma
 * heurística nova, uma leitura de IA mais elegante, uma "sugestão editorial"
 * que contradiz o que catorze concorrentes fazem. Sem uma hierarquia escrita e
 * testável, cada lote reabre a votação — e a evidência perde, porque ela não
 * argumenta.
 *
 * A SERP vigente e suficiente é EVIDÊNCIA EXTERNA OBSERVÁVEL. Ela não é
 * sugestão, não é palpite e não é uma opinião entre outras. Sobre o terreno
 * competitivo — o que ranqueia, que intenção a busca privilegia, que formatos
 * aparecem, que conceitos se repetem, como os concorrentes estruturam e linkam
 * — ela fala mais alto do que qualquer inferência nossa.
 *
 * MAS ELA NÃO DECIDE VERDADE FACTUAL.
 *
 * Dez concorrentes afirmarem X não torna X verdadeiro. Em YMYL isso é a
 * diferença entre um artigo bom e um artigo perigoso: quando fonte primária ou
 * especialista qualificado demonstram que a recorrência do mercado está errada
 * ou desatualizada, a conclusão não é "dez contra um, o mercado vence" — é um
 * CONFLITO, e ele é uma oportunidade de fazer melhor do que a página que
 * ranqueia em primeiro.
 *
 * A hierarquia congelada:
 *
 *   1. INVARIANTES E PROTEÇÕES DO ARTICLE   nunca violados automaticamente
 *   2. EVIDÊNCIA PRIMÁRIA / ESPECIALISTA    autoridade sobre verdade factual
 *   3. SERP VIGENTE E SUFICIENTE            autoridade sobre a realidade da busca
 *   4. OUTRAS EVIDÊNCIAS DO RADAR           Amazon, YouTube, vídeo, conforme o tipo
 *   5. ARTICLE DNA / HIPÓTESE EDITORIAL     contexto e contrato de formação
 *   6. IA                                   interpreta e correlaciona evidência
 *   7. HEURÍSTICA DETERMINÍSTICA            apoia quando falta evidência
 *   8. SUGESTÃO EDITORIAL GENÉRICA          último recurso
 *
 * A IA fica ABAIXO da evidência, nunca acima. Ela pode agrupar, interpretar,
 * resumir, correlacionar e propor leitura. Não pode apagar observação,
 * substituir resultado, inventar recorrência nem ignorar concorrentes por
 * achar melhor.
 *
 * E divergência nunca é resolvida em silêncio: os dois lados ficam escritos.
 *
 * Domínio puro: sem fetch, sem storage, sem provider.
 */

/* ============================ a hierarquia =============================== */

export type RadarEvidenceSource =
  | "ARTICLE_INVARIANT"
  | "PRIMARY_FACTUAL_EVIDENCE"
  | "QUALIFIED_SPECIALIST"
  | "CURRENT_SUFFICIENT_SERP"
  | "OTHER_RADAR_EVIDENCE"
  | "ARTICLE_DNA_HYPOTHESIS"
  | "AI_INTERPRETATION"
  | "DETERMINISTIC_HEURISTIC"
  | "GENERIC_EDITORIAL_SUGGESTION";

/** A ordem canônica. Menor número, mais alta a voz. */
export const RADAR_EVIDENCE_HIERARCHY: readonly RadarEvidenceSource[] = [
  "ARTICLE_INVARIANT",
  "PRIMARY_FACTUAL_EVIDENCE",
  "QUALIFIED_SPECIALIST",
  "CURRENT_SUFFICIENT_SERP",
  "OTHER_RADAR_EVIDENCE",
  "ARTICLE_DNA_HYPOTHESIS",
  "AI_INTERPRETATION",
  "DETERMINISTIC_HEURISTIC",
  "GENERIC_EDITORIAL_SUGGESTION",
];

export const RADAR_EVIDENCE_LABEL: Record<RadarEvidenceSource, string> = {
  ARTICLE_INVARIANT: "Invariante do Article",
  PRIMARY_FACTUAL_EVIDENCE: "Evidência primária",
  QUALIFIED_SPECIALIST: "Especialista qualificado",
  CURRENT_SUFFICIENT_SERP: "SERP vigente e suficiente",
  OTHER_RADAR_EVIDENCE: "Outra evidência do Radar",
  ARTICLE_DNA_HYPOTHESIS: "Hipótese do ArticleDNA",
  AI_INTERPRETATION: "Interpretação de IA",
  DETERMINISTIC_HEURISTIC: "Heurística determinística",
  GENERIC_EDITORIAL_SUGGESTION: "Sugestão editorial genérica",
};

/** As fontes que NUNCA podem prevalecer sobre observação. */
const INTERPRETATIVAS: readonly RadarEvidenceSource[] = [
  "AI_INTERPRETATION",
  "DETERMINISTIC_HEURISTIC",
  "GENERIC_EDITORIAL_SUGGESTION",
];

/** As fontes que são OBSERVAÇÃO — alguém foi lá e viu. */
const OBSERVACIONAIS: readonly RadarEvidenceSource[] = [
  "PRIMARY_FACTUAL_EVIDENCE",
  "QUALIFIED_SPECIALIST",
  "CURRENT_SUFFICIENT_SERP",
  "OTHER_RADAR_EVIDENCE",
];

export const radarEvidenceIsInterpretative = (source: RadarEvidenceSource) => INTERPRETATIVAS.includes(source);
export const radarEvidenceIsObserved = (source: RadarEvidenceSource) => OBSERVACIONAIS.includes(source);

export function radarEvidenceRank(source: RadarEvidenceSource): number {
  const posicao = RADAR_EVIDENCE_HIERARCHY.indexOf(source);
  if (posicao < 0) throw new Error(`RADAR_EVIDENCE_SOURCE_UNKNOWN: ${source}`);
  return posicao + 1;
}

/* ========================== o domínio da pergunta ======================== */

/**
 * A MESMA FONTE NÃO FALA DE TUDO.
 *
 * Um artigo científico é autoridade sobre o que é verdade e não diz nada sobre
 * o que o Google ranqueia. A SERP é autoridade sobre o terreno competitivo e
 * não atesta fato. Perguntar "quem manda?" sem dizer sobre o quê é como pedir
 * a opinião do dermatologista sobre a estrutura de H2 dos concorrentes.
 */
export type RadarEvidenceDomain = "COMPETITIVE" | "FACTUAL";

/** As perguntas que a SERP responde melhor do que qualquer inferência nossa. */
export const RADAR_COMPETITIVE_QUESTIONS: readonly string[] = [
  "o que ranqueia",
  "que intenção a busca privilegia",
  "que formatos aparecem",
  "que conceitos se repetem",
  "que perguntas o mercado responde",
  "como os concorrentes estruturam",
  "como os concorrentes linkam",
  "que fontes os concorrentes usam",
  "que lacunas aparecem",
];

export function radarEvidenceApplies(source: RadarEvidenceSource, domain: RadarEvidenceDomain): boolean {
  if (source === "ARTICLE_INVARIANT") return true;
  if (domain === "COMPETITIVE") {
    /* Fonte primária e especialista atestam fato; não descrevem a busca. */
    return source !== "PRIMARY_FACTUAL_EVIDENCE" && source !== "QUALIFIED_SPECIALIST";
  }
  /* Para verdade factual, a SERP entra como o que o MERCADO diz, não como fato. */
  return true;
}

/* ============================== a resolução ============================== */

export type RadarEvidenceClaim = {
  source: RadarEvidenceSource;
  /** O que esta fonte afirma, em uma frase. */
  claim: string;
  /** De onde isso veio. Afirmação sem procedência não entra na disputa. */
  provenance: string;
};

export type RadarEvidenceResolution = {
  domain: RadarEvidenceDomain;
  /** Quem prevalece — e prevalecer não é apagar o resto. */
  prevailing: RadarEvidenceClaim;
  /** As demais, preservadas com o motivo de terem sido sobrepostas. */
  overruled: Array<RadarEvidenceClaim & { reason: string }>;
  /** As que não falam desta pergunta. Não perderam: não se aplicam. */
  notApplicable: Array<RadarEvidenceClaim & { reason: string }>;
  /** Há contradição entre fontes de peso? Ela fica escrita. */
  conflict: boolean;
  note: string;
};

/**
 * Quem prevalece nesta pergunta — sem apagar ninguém.
 *
 * `overruled` existe de propósito: a leitura que perdeu continua no registro,
 * com o motivo. Resolver conflito descartando um dos lados é como consertar um
 * termômetro quebrando-o.
 */
export function resolveRadarEvidencePrecedence(input: {
  domain: RadarEvidenceDomain;
  claims: readonly RadarEvidenceClaim[];
}): RadarEvidenceResolution {
  const semProcedencia = input.claims.find(item => !item.provenance.trim());
  if (semProcedencia) {
    throw new Error(`RADAR_EVIDENCE_CLAIM_WITHOUT_PROVENANCE: ${semProcedencia.source}`);
  }
  if (!input.claims.length) throw new Error("RADAR_EVIDENCE_NO_CLAIMS");

  const aplicaveis = input.claims.filter(item => radarEvidenceApplies(item.source, input.domain));
  const naoAplicaveis = input.claims
    .filter(item => !radarEvidenceApplies(item.source, input.domain))
    .map(item => ({
      ...item,
      reason: `${RADAR_EVIDENCE_LABEL[item.source]} atesta fato, não descreve o comportamento da busca. Preservada como evidência da outra pergunta.`,
    }));

  if (!aplicaveis.length) throw new Error("RADAR_EVIDENCE_NO_APPLICABLE_CLAIM");

  const ordenadas = [...aplicaveis].sort((left, right) => radarEvidenceRank(left.source) - radarEvidenceRank(right.source));
  const prevailing = ordenadas[0];
  const overruled = ordenadas.slice(1).map(item => ({
    ...item,
    reason: radarEvidenceIsInterpretative(item.source) && radarEvidenceIsObserved(prevailing.source)
      ? `${RADAR_EVIDENCE_LABEL[item.source]} interpreta; ${RADAR_EVIDENCE_LABEL[prevailing.source]} observa. Interpretação não sobrepõe observação.`
      : `${RADAR_EVIDENCE_LABEL[prevailing.source]} tem precedência sobre ${RADAR_EVIDENCE_LABEL[item.source]} nesta pergunta. A leitura permanece registrada.`,
  }));

  /*
   * CONFLITO É QUANDO DUAS OBSERVAÇÕES SE CONTRADIZEM.
   *
   * Uma heurística discordando da SERP não é conflito: é uma heurística
   * desatualizada. Conflito é fonte primária dizendo que a recorrência do
   * mercado está errada — e esse merece ficar em destaque.
   */
  const observadasEmDisputa = aplicaveis.filter(item => radarEvidenceIsObserved(item.source));
  const conflict = observadasEmDisputa.length > 1 || naoAplicaveis.some(item => radarEvidenceIsObserved(item.source));

  return {
    domain: input.domain,
    prevailing,
    overruled,
    notApplicable: naoAplicaveis,
    conflict,
    note: input.domain === "COMPETITIVE"
      ? "Sobre o terreno competitivo, a SERP vigente e suficiente é evidência externa observável e fala mais alto do que inferência, heurística ou hipótese."
      : "Sobre verdade factual, evidência primária e especialista qualificado prevalecem sobre a recorrência do mercado. A SERP permanece como registro do que o mercado afirma.",
  };
}

/* ======================= a invariante que protege ======================== */

/**
 * A PROTEÇÃO QUE IMPEDE A HIERARQUIA DE SER INVERTIDA SEM QUE NINGUÉM VEJA.
 *
 * O risco não é alguém escrever "a IA manda mais que a SERP" — ninguém
 * escreveria isso. O risco é uma resolução que, por descuido, deixa uma
 * interpretação prevalecendo sobre uma observação. Aqui isso é erro em tempo
 * de execução, não uma discussão de revisão de código.
 */
export function assertRadarEvidenceAuthority(resolution: RadarEvidenceResolution): void {
  const interpretacaoVenceu = radarEvidenceIsInterpretative(resolution.prevailing.source);
  const observacaoPerdeu = resolution.overruled.some(item => radarEvidenceIsObserved(item.source));
  if (interpretacaoVenceu && observacaoPerdeu) {
    throw new Error(`RADAR_EVIDENCE_AUTHORITY_INVERTED: ${resolution.prevailing.source} não pode sobrepor observação`);
  }
  if (resolution.domain === "FACTUAL") {
    const mercadoVenceu = resolution.prevailing.source === "CURRENT_SUFFICIENT_SERP";
    const primariaPerdeu = resolution.overruled.some(item => item.source === "PRIMARY_FACTUAL_EVIDENCE" || item.source === "QUALIFIED_SPECIALIST");
    if (mercadoVenceu && primariaPerdeu) {
      throw new Error("RADAR_EVIDENCE_AUTHORITY_INVERTED: recorrência de mercado não decide verdade factual");
    }
  }
  for (const item of [resolution.prevailing, ...resolution.overruled, ...resolution.notApplicable]) {
    if (!item.provenance.trim()) throw new Error(`RADAR_EVIDENCE_PROVENANCE_LOST: ${item.source}`);
  }
}

/**
 * A SERP mantém a voz alta nesta investigação?
 *
 * Vigente, suficiente e válida. Faltando qualquer uma, ela continua sendo
 * evidência — mas deixa de ter precedência, e isso precisa ser dito em vez de
 * assumido. SERP obsoleta com voz de SERP vigente é pior do que nenhuma.
 */
export type RadarSerpStanding = {
  authoritative: boolean;
  current: boolean;
  sufficient: boolean;
  valid: boolean;
  reason: string;
};

export function radarSerpEvidenceStanding(input: {
  /** O fingerprint dos fundamentos ainda corresponde ao ArticleDNA corrente? */
  current: boolean;
  /** A amostra sustenta leitura de mercado? */
  sufficient: boolean;
  /** A coleta é da consulta certa, com snapshot íntegro? */
  valid: boolean;
}): RadarSerpStanding {
  const authoritative = input.current && input.sufficient && input.valid;
  const faltas = [
    !input.current ? "os fundamentos mudaram desde a coleta" : null,
    !input.sufficient ? "a amostra não sustenta leitura de mercado" : null,
    !input.valid ? "a coleta não pôde ser validada" : null,
  ].filter((item): item is string => Boolean(item));

  return {
    authoritative,
    current: input.current,
    sufficient: input.sufficient,
    valid: input.valid,
    reason: authoritative
      ? "SERP vigente, suficiente e válida: ela é a autoridade evidencial sobre o terreno competitivo desta investigação."
      : `A SERP permanece como evidência, mas sem precedência nesta leitura — ${faltas.join(" · ")}.`,
  };
}
