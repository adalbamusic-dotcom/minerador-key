/**
 * A RESPOSTA DO ESPECIALISTA VIRANDO EVIDÊNCIA — e as três coisas que isso não é.
 *
 * ========================= O PROBLEMA QUE RESOLVE =========================
 *
 * A contribuição chegava pelo Telegram e parava numa tela que pedia duas
 * escolhas manuais antes de qualquer decisão editorial: "Classificação" num
 * select vazio, e "Relacionar à necessidade" num select que listava ids de
 * concorrente e resultados de benchmark. Quem tinha acabado de receber uma
 * resposta profissional precisava primeiro traduzir vocabulário interno.
 *
 * Só que as duas respostas já existiam no dado. A contribuição sabe de qual
 * pauta veio, a pauta sabe de qual ponto de revisão nasceu, e o ponto sabe qual
 * necessidade editorial o originou. Perguntar de novo era perguntar o que o
 * sistema já sabia — e aceitar uma resposta pior do que a que ele tinha.
 *
 * ============================ AS TRÊS FRONTEIRAS ============================
 *
 *   EXTRAIR NÃO É ACEITAR.  A organização automática produz uma estrutura
 *   editorial; ela nasce `NOT_APPROVED` e continua assim até uma pessoa clicar.
 *
 *   SUGERIR NÃO É DECIDIR.  A classificação vem sugerida, com a origem da
 *   sugestão declarada, e é sempre corrigível. Nenhuma sugestão vira decisão.
 *
 *   RESUMIR NÃO É REESCREVER.  `originalText` permanece a autoridade de
 *   fidelidade. A síntese é RECORTE do que foi dito, nunca texto novo — por
 *   isso ela sai daqui, de uma função determinística, e não de um modelo.
 *
 * Domínio puro: sem fetch, sem storage, sem React, sem provider.
 */

/* ====================== o vocabulário de classificação ===================== */

/**
 * SETE TIPOS, E O QUE CADA UM SIGNIFICA PARA QUEM ESCREVE O ARTIGO.
 *
 * A lista não é taxonomia acadêmica: ela existe porque o Redator faz coisas
 * diferentes com cada uma. Uma ressalva qualifica uma afirmação; um exemplo
 * ilustra; uma limitação delimita onde a afirmação deixa de valer. Guardar
 * tudo como "contribuição do especialista" jogaria essa distinção fora.
 */
export const RADAR_SPECIALIST_CLASSIFICATIONS = [
  "EXPERIENCIA_PRATICA",
  "OPINIAO_PROFISSIONAL",
  "CRITERIO_DECISAO",
  "PROCESSO",
  "RESSALVA",
  "LIMITACAO",
  "EXEMPLO",
] as const;
export type RadarSpecialistClassification = typeof RADAR_SPECIALIST_CLASSIFICATIONS[number];

export const RADAR_SPECIALIST_CLASSIFICATION_LABELS: Record<RadarSpecialistClassification, string> = {
  EXPERIENCIA_PRATICA: "Experiência prática",
  OPINIAO_PROFISSIONAL: "Opinião profissional",
  CRITERIO_DECISAO: "Critério de decisão",
  PROCESSO: "Processo",
  RESSALVA: "Ressalva",
  LIMITACAO: "Limitação",
  EXEMPLO: "Exemplo",
};

/**
 * O QUE CADA TIPO QUER DIZER, EM UMA LINHA — para a tela não exigir decorar.
 *
 * O select antigo mostrava sete rótulos sem explicação nenhuma, e a pergunta
 * "o que é tudo isso?" era a resposta honesta de quem olhava. A descrição
 * viaja com o vocabulário porque é parte dele.
 */
export const RADAR_SPECIALIST_CLASSIFICATION_HINTS: Record<RadarSpecialistClassification, string> = {
  EXPERIENCIA_PRATICA: "Algo observado no exercício profissional.",
  OPINIAO_PROFISSIONAL: "Julgamento do especialista sobre o tema.",
  CRITERIO_DECISAO: "A regra que ele usa para escolher ou decidir.",
  PROCESSO: "A sequência ou o modo de fazer.",
  RESSALVA: "Vale, mas sob esta condição.",
  LIMITACAO: "Onde a afirmação deixa de valer.",
  EXEMPLO: "Um caso concreto que ilustra.",
};

/**
 * O VOCABULÁRIO ANTIGO CONTINUA LEGÍVEL — e não vira migration.
 *
 * A organização por IA grava `classifications: ["ressalva", ...]` em minúsculas
 * acentuadas, e decisões já tomadas na tela anterior foram gravadas assim. Ler
 * os dois e escrever só o canônico é o que permite trocar o vocabulário sem
 * reprocessar nada e sem perder uma classificação já feita.
 */
const CLASSIFICACAO_LEGADA: Record<string, RadarSpecialistClassification> = {
  "experiência": "EXPERIENCIA_PRATICA",
  "experiencia": "EXPERIENCIA_PRATICA",
  "opinião": "OPINIAO_PROFISSIONAL",
  "opiniao": "OPINIAO_PROFISSIONAL",
  "critério": "CRITERIO_DECISAO",
  "criterio": "CRITERIO_DECISAO",
  "processo": "PROCESSO",
  "ressalva": "RESSALVA",
  "limitação": "LIMITACAO",
  "limitacao": "LIMITACAO",
  "exemplo": "EXEMPLO",
};

export function radarSpecialistClassificationOf(value: unknown): RadarSpecialistClassification | null {
  if (typeof value !== "string" || !value.trim()) return null;
  const bruto = value.trim();
  if ((RADAR_SPECIALIST_CLASSIFICATIONS as readonly string[]).includes(bruto)) return bruto as RadarSpecialistClassification;
  return CLASSIFICACAO_LEGADA[bruto.toLowerCase()] || null;
}

/* ========================= a decisão humana (§6, §8) ======================= */

/**
 * CINCO ESTADOS, E SÓ UM DELES É O PADRÃO.
 *
 * `NOT_APPROVED` não é "rejeitado": é "ninguém decidiu ainda". A distinção é o
 * gate inteiro — sem ela, uma contribuição que ninguém leu chegaria ao
 * Planejador indistinguível de uma que alguém recusou, ou pior, de uma aceita.
 */
export const RADAR_SPECIALIST_DECISIONS = [
  "NOT_APPROVED",
  "ACCEPTED_EVIDENCE",
  "SUPPORT_ONLY",
  "QUOTE_CANDIDATE",
  "REJECTED",
] as const;
export type RadarSpecialistDecision = typeof RADAR_SPECIALIST_DECISIONS[number];

export const RADAR_SPECIALIST_DECISION_LABELS: Record<RadarSpecialistDecision, string> = {
  NOT_APPROVED: "Aguardando sua decisão",
  ACCEPTED_EVIDENCE: "Aceita como evidência",
  SUPPORT_ONLY: "Usada como apoio",
  QUOTE_CANDIDATE: "Marcada como citação literal",
  REJECTED: "Rejeitada",
};

/** As decisões que fazem a contribuição chegar ao Planejador como evidência ativa. */
const DECISOES_ATIVAS = new Set<RadarSpecialistDecision>(["ACCEPTED_EVIDENCE", "SUPPORT_ONLY", "QUOTE_CANDIDATE"]);

export function radarSpecialistDecisionIsActive(decision: RadarSpecialistDecision): boolean {
  return DECISOES_ATIVAS.has(decision);
}

/**
 * O ENUM DA PROJEÇÃO CANÔNICA, TRADUZIDO NAS DUAS PONTAS.
 *
 * `projectRadarExpertEvidence` fala `pending | accepted | support | quote |
 * rejected` desde antes deste gate, e ela é quem monta a `ExpertEvidence` que o
 * contrato de análise valida. Traduzir aqui — num lugar só — é o que permite o
 * vocabulário da tela mudar sem tocar no contrato que já está em produção.
 */
const DECISAO_PARA_PROJECAO: Record<RadarSpecialistDecision, "pending" | "accepted" | "support" | "quote" | "rejected"> = {
  NOT_APPROVED: "pending",
  ACCEPTED_EVIDENCE: "accepted",
  SUPPORT_ONLY: "support",
  QUOTE_CANDIDATE: "quote",
  REJECTED: "rejected",
};

const PROJECAO_PARA_DECISAO: Record<string, RadarSpecialistDecision> = {
  pending: "NOT_APPROVED",
  accepted: "ACCEPTED_EVIDENCE",
  support: "SUPPORT_ONLY",
  quote: "QUOTE_CANDIDATE",
  rejected: "REJECTED",
};

export function radarSpecialistDecisionToProjection(decision: RadarSpecialistDecision) {
  return DECISAO_PARA_PROJECAO[decision];
}

export function radarSpecialistDecisionOf(value: unknown): RadarSpecialistDecision | null {
  if (typeof value !== "string" || !value.trim()) return null;
  const bruto = value.trim();
  if ((RADAR_SPECIALIST_DECISIONS as readonly string[]).includes(bruto)) return bruto as RadarSpecialistDecision;
  return PROJECAO_PARA_DECISAO[bruto.toLowerCase()] || null;
}

/* ==================== a sugestão de classificação (§5) ==================== */

/**
 * DE ONDE A CLASSIFICAÇÃO VEIO — e `HUMAN` encerra a conversa.
 *
 * A tela mostra a origem junto da sugestão porque "Ressalva" sem procedência é
 * indistinguível de chute. E quando uma pessoa corrige, a origem passa a ser
 * ela: nenhuma releitura pode reverter aquilo para o que o texto sugeria.
 */
export type RadarSpecialistClassificationSource = "HUMAN" | "AI_ORGANIZATION" | "TEXT_MARKERS" | "REQUIREMENT_KIND" | "DEFAULT";

export type RadarSpecialistClassificationSuggestion = {
  classification: RadarSpecialistClassification;
  source: Exclude<RadarSpecialistClassificationSource, "HUMAN">;
};

export const RADAR_SPECIALIST_CLASSIFICATION_SOURCE_LABELS: Record<RadarSpecialistClassificationSource, string> = {
  HUMAN: "definida por você",
  AI_ORGANIZATION: "sugerida pela organização da resposta",
  TEXT_MARKERS: "sugerida pelo texto da resposta",
  REQUIREMENT_KIND: "sugerida pelo tipo do ponto de revisão",
  DEFAULT: "sugestão padrão, sem indício no texto",
};

/** Acento fora, caixa baixa: "Porém," e "porem" precisam casar com o mesmo marcador. */
function normalizar(texto: string): string {
  return texto.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

/**
 * OS MARCADORES SÃO DE LÍNGUA, NÃO DE NICHO.
 *
 * "desde que", "exceto", "na minha prática" funcionam em qualquer marca porque
 * descrevem a FORMA da frase, não o assunto. Um marcador de nicho — "acne",
 * "pele oleosa" — quebraria na primeira marca diferente e daria a impressão de
 * que a sugestão entende do tema. Ela não entende: ela lê estrutura.
 *
 * A ordem importa e é a da especificidade. "Na minha prática eu evito X, exceto
 * quando Y" é experiência com uma ressalva dentro; classificar como ressalva
 * perderia o que ela tem de mais raro, que é ter sido vivido por alguém.
 */
const MARCADORES: Array<{ classification: RadarSpecialistClassification; termos: readonly string[] }> = [
  { classification: "EXPERIENCIA_PRATICA", termos: ["na minha pratica", "na pratica eu", "eu costumo", "costumo ver", "ja vi", "ja atendi", "atendo", "no consultorio", "na minha experiencia", "tenho visto", "venho observando"] },
  { classification: "CRITERIO_DECISAO", termos: ["o criterio", "meu criterio", "eu decido", "so indico", "so recomendo", "indico quando", "escolho quando", "opto por", "avalio se"] },
  { classification: "PROCESSO", termos: ["primeiro passo", "passo a passo", "primeiro,", "em seguida", "por ultimo", "a sequencia", "a rotina", "o protocolo"] },
  { classification: "EXEMPLO", termos: ["por exemplo", "um caso", "uma paciente", "um paciente", "teve um caso", "como no caso"] },
  { classification: "LIMITACAO", termos: ["nao e possivel", "nao da para", "nao existe evidencia", "nao ha estudo", "nao se pode afirmar", "deixa de valer", "nao se aplica"] },
  { classification: "RESSALVA", termos: ["desde que", "exceto", "salvo", "com a ressalva", "mas so", "porem", "contanto que", "vale, mas", "cuidado com", "nao necessariamente"] },
];

/** Da IA só vale a primeira classificação reconhecida: a lista dela é ordenada por relevância. */
function daOrganizacao(payload: Record<string, unknown> | null | undefined): RadarSpecialistClassification | null {
  const bruto = payload?.classifications;
  if (!Array.isArray(bruto)) return null;
  for (const item of bruto) {
    const reconhecida = radarSpecialistClassificationOf(item);
    if (reconhecida) return reconhecida;
  }
  return null;
}

/**
 * O TIPO DO PONTO DE REVISÃO É O ÚLTIMO RECURSO COM FUNDAMENTO.
 *
 * Ele diz por que o Radar pediu revisão — resolver conflito, resolver incerteza
 * factual, verificar e acrescentar prática. Não diz o que o especialista
 * respondeu, então vem depois do texto. Mas é melhor que o padrão cego: a
 * pergunta enviada moldou a resposta.
 */
const POR_TIPO_DE_PONTO: Record<string, RadarSpecialistClassification> = {
  RESOLVE_CONFLICT: "CRITERIO_DECISAO",
  RESOLVE_FACTUAL_UNCERTAINTY: "RESSALVA",
  VERIFY_AND_ADD_EXPERIENCE: "EXPERIENCIA_PRATICA",
};

export function radarSpecialistSuggestedClassification(input: {
  /** O que o especialista disse. Transcrição ou texto original, nunca resumo. */
  text: string | null | undefined;
  organizationPayload?: Record<string, unknown> | null;
  /** O `kind` do ponto de revisão que originou a pauta, quando há. */
  requirementKind?: string | null;
}): RadarSpecialistClassificationSuggestion {
  const daIa = daOrganizacao(input.organizationPayload);
  if (daIa) return { classification: daIa, source: "AI_ORGANIZATION" };

  const texto = normalizar((input.text || "").trim());
  if (texto) {
    for (const marcador of MARCADORES) {
      if (marcador.termos.some(termo => texto.includes(termo))) {
        return { classification: marcador.classification, source: "TEXT_MARKERS" };
      }
    }
  }

  const porTipo = input.requirementKind ? POR_TIPO_DE_PONTO[input.requirementKind] : null;
  if (porTipo) return { classification: porTipo, source: "REQUIREMENT_KIND" };

  /*
   * O PADRÃO É O MENOS COMPROMETEDOR, e isso é escolha.
   *
   * "Opinião profissional" não afirma que houve experiência, critério ou
   * ressalva — nenhuma das quais pode ser inventada sobre a fala de alguém.
   * Ela diz apenas que um profissional se pronunciou, que é o único fato
   * garantido quando nada mais foi reconhecido.
   */
  return { classification: "OPINIAO_PROFISSIONAL", source: "DEFAULT" };
}

/* =========================== a extração (§7, §8) =========================== */

export type RadarSpecialistExtractionProvenance = {
  provider: "telegram";
  briefId: string;
  externalUpdateId: string | null;
  originalAssetUri: string | null;
  checksum: string | null;
  receivedAt: string;
  /** Como o texto chegou: digitado, transcrito de áudio, extraído de documento. */
  sourceType: string;
};

export type RadarSpecialistExtraction = {
  contributionId: string;
  requirementId: string | null;
  expertId: string;
  classification: RadarSpecialistClassification;
  classificationSource: RadarSpecialistClassificationSource;
  /** A AUTORIDADE DE FIDELIDADE. Nunca apagada, nunca substituída. */
  originalText: string;
  /** Recorte do que foi dito. Nunca texto novo — veja `summarySource`. */
  extractedSummary: string;
  summarySource: "AI_ORGANIZATION" | "VERBATIM" | "VERBATIM_TRIMMED";
  /** Onde isto se aplica no artigo, derivado do ponto de revisão. */
  editorialUse: string;
  /** Só existe quando uma pessoa marcou a decisão como citação literal. */
  quoteCandidate: string | null;
  provenance: RadarSpecialistExtractionProvenance;
  humanDecision: RadarSpecialistDecision;
};

const LIMITE_DA_SINTESE = 400;

/** Uma frase por vez, preservando a pontuação que a encerra. */
function frases(valor: string): string[] {
  return valor.split(/(?<=[.!?])\s+/).map(item => item.trim()).filter(Boolean);
}

/**
 * A SÍNTESE É RECORTE, E O RECORTE É DECLARADO.
 *
 * Quando a organização por IA existe, ela é a síntese — foi produzida sob um
 * prompt que proíbe inventar fala e é validada contra a transcrição. Quando não
 * existe, a síntese são as primeiras frases do que foi dito, e `summarySource`
 * diz que houve corte. O que NUNCA acontece é uma frase que ninguém falou.
 */
function sintetizar(input: { organized: string | null; verbatim: string }): { summary: string; source: RadarSpecialistExtraction["summarySource"] } {
  if (input.organized) return { summary: input.organized, source: "AI_ORGANIZATION" };

  const inteiro = input.verbatim.replace(/\s+/g, " ").trim();
  if (inteiro.length <= LIMITE_DA_SINTESE) return { summary: inteiro, source: "VERBATIM" };

  const partes = frases(inteiro);
  let acumulado = "";
  for (const parte of partes) {
    if (acumulado && (`${acumulado} ${parte}`).length > LIMITE_DA_SINTESE) break;
    acumulado = acumulado ? `${acumulado} ${parte}` : parte;
  }
  /* Uma frase única maior que o limite ainda precisa caber: corta-se ela. */
  const recorte = acumulado || inteiro.slice(0, LIMITE_DA_SINTESE).trimEnd();
  return { summary: recorte === inteiro ? recorte : `${recorte.replace(/[.…]+$/, "")}…`, source: "VERBATIM_TRIMMED" };
}

/**
 * ONDE ISTO SE APLICA NO ARTIGO — derivado do ponto, não perguntado de novo.
 *
 * É o §4 inteiro: a contribuição já conhece a pauta, a pauta já conhece o
 * ponto, e o ponto já carrega o assunto editorial. O select "Relacionar à
 * necessidade" perguntava o que este cálculo responde — e oferecia ids de
 * concorrente como alternativa de resposta.
 */
export function radarSpecialistEditorialUse(input: {
  requirementTopic?: string | null;
  requirementClaim?: string | null;
  requirementQuestion?: string | null;
}): string {
  const assunto = (input.requirementTopic || input.requirementClaim || "").trim();
  if (assunto) return `Qualificar o trecho sobre "${assunto}".`;
  const pergunta = (input.requirementQuestion || "").trim();
  if (pergunta) return `Responder ao ponto: ${pergunta.length > 160 ? `${pergunta.slice(0, 159).trimEnd()}…` : pergunta}`;
  /*
   * SEM PONTO DE REVISÃO NÃO SE INVENTA APLICAÇÃO.
   *
   * Uma pauta avulsa não nasceu de necessidade nenhuma do artigo; dizer onde
   * ela se aplica seria decidir editorialmente no lugar de quem escreve.
   */
  return "Aplicação editorial ainda não definida: esta resposta não nasceu de um ponto preparado.";
}

export type RadarSpecialistExtractionInput = {
  contributionId: string;
  expertId: string;
  briefId: string;
  requirementId: string | null;
  requirementKind?: string | null;
  requirementTopic?: string | null;
  requirementClaim?: string | null;
  requirementQuestion?: string | null;
  sourceType: string;
  originalText: string | null;
  transcriptText: string | null;
  organizationPayload?: Record<string, unknown> | null;
  externalUpdateId?: string | null;
  originalAssetUri?: string | null;
  checksum?: string | null;
  receivedAt: string;
  /** A decisão JÁ TOMADA, quando houver. A extração não decide nada. */
  decision?: RadarSpecialistDecision | null;
  /** A classificação corrigida por uma pessoa. Vence a sugestão, sempre. */
  classification?: RadarSpecialistClassification | null;
};

function textoOrganizado(payload: Record<string, unknown> | null | undefined): string | null {
  if (!payload) return null;
  for (const chave of ["organizedText", "text", "summary", "content"]) {
    const valor = payload[chave];
    if (typeof valor === "string" && valor.trim()) return valor.trim();
  }
  return null;
}

/**
 * A CONTRIBUIÇÃO EXTRAÍDA — e ela nasce SEM aprovação (§8).
 *
 * `humanDecision` só é diferente de `NOT_APPROVED` quando alguém já decidiu, e
 * essa decisão entra por argumento, vinda do que está gravado. Esta função não
 * tem como aprovar coisa nenhuma, o que é de propósito: se ela pudesse, uma
 * releitura da tela promoveria evidência sozinha.
 */
export function radarSpecialistExtraction(input: RadarSpecialistExtractionInput): RadarSpecialistExtraction {
  const verbatim = (input.transcriptText || input.originalText || "").trim();
  const organized = textoOrganizado(input.organizationPayload);
  const sugestao = radarSpecialistSuggestedClassification({
    text: verbatim,
    organizationPayload: input.organizationPayload,
    requirementKind: input.requirementKind,
  });
  const classification = input.classification || sugestao.classification;
  const decision = input.decision || "NOT_APPROVED";
  const { summary, source } = sintetizar({ organized, verbatim });

  return {
    contributionId: input.contributionId,
    requirementId: input.requirementId,
    expertId: input.expertId,
    classification,
    /* Corrigida por alguém é `HUMAN`, e nenhuma releitura a devolve à sugestão. */
    classificationSource: input.classification ? "HUMAN" : sugestao.source,
    originalText: verbatim,
    extractedSummary: summary,
    summarySource: source,
    editorialUse: radarSpecialistEditorialUse(input),
    /* Citação só existe por decisão humana: marcar é o ato que a cria. */
    quoteCandidate: decision === "QUOTE_CANDIDATE" && verbatim ? verbatim : null,
    provenance: {
      provider: "telegram",
      briefId: input.briefId,
      externalUpdateId: input.externalUpdateId || null,
      originalAssetUri: input.originalAssetUri || null,
      checksum: input.checksum || null,
      receivedAt: input.receivedAt,
      sourceType: input.sourceType,
    },
    humanDecision: decision,
  };
}

/* ================== a revisão gravada no contexto da pauta ================= */

/**
 * ONDE A DECISÃO HUMANA MORA — e por que não numa tabela nova.
 *
 * O §13 exige que aceitar/rejeitar sobreviva a F5, a troca de artigo, a sessão
 * nova e à diferença entre local e Vercel. O `localStorage` que guardava isso
 * até aqui falha nos três últimos: ele é do navegador, e a decisão é do artigo.
 *
 * `expert_briefs.radar_context` é jsonb, é escrito só pelo Radar, e a pauta já
 * é dona das contribuições pela chave estrangeira. Guardar aqui torna a decisão
 * remota sem abrir migration — que este gate não autoriza — e sem inventar uma
 * autoridade paralela à da pauta.
 */
export type RadarSpecialistStoredReview = {
  decision: RadarSpecialistDecision;
  classification: RadarSpecialistClassification | null;
  /**
   * A ASSOCIAÇÃO MANUAL — o caso excepcional do §4, e só ele.
   *
   * O vínculo normal é automático: a contribuição sabe a pauta, a pauta sabe o
   * ponto. Isto existe para a contribuição que chegou por uma pauta AVULSA, que
   * não nasceu de ponto nenhum — ali não há o que derivar, e quem revisa é a
   * única fonte possível. `null` significa "use o vínculo automático".
   */
  relatedRequirementId: string | null;
  decidedAt: string;
  decidedBy: string | null;
};

const CHAVE_DAS_REVISOES = "contributionReviews";

function objeto(valor: unknown): Record<string, unknown> | null {
  return valor && typeof valor === "object" && !Array.isArray(valor) ? valor as Record<string, unknown> : null;
}

export function radarSpecialistReviewsOf(radarContext: unknown): Record<string, RadarSpecialistStoredReview> {
  const contexto = objeto(radarContext);
  const bruto = objeto(contexto?.[CHAVE_DAS_REVISOES]);
  if (!bruto) return {};

  return Object.fromEntries(Object.entries(bruto).flatMap(([id, valor]) => {
    const registro = objeto(valor);
    const decision = radarSpecialistDecisionOf(registro?.decision);
    if (!decision) return [];
    return [[id, {
      decision,
      classification: radarSpecialistClassificationOf(registro?.classification),
      relatedRequirementId: typeof registro?.relatedRequirementId === "string" && registro.relatedRequirementId.trim() ? registro.relatedRequirementId.trim() : null,
      decidedAt: typeof registro?.decidedAt === "string" ? registro.decidedAt : "",
      decidedBy: typeof registro?.decidedBy === "string" && registro.decidedBy.trim() ? registro.decidedBy : null,
    } satisfies RadarSpecialistStoredReview]];
  }));
}

/**
 * A GRAVAÇÃO É MESCLA, NUNCA SUBSTITUIÇÃO DO CONTEXTO.
 *
 * `radar_context` carrega a proveniência do ponto de revisão e a identidade da
 * consulta. Escrever `{ contributionReviews }` cru apagaria as duas, e o
 * convite do especialista deixaria de existir por causa de um clique em
 * "Aceitar como evidência".
 */
export function radarContextWithSpecialistReview(input: {
  radarContext: unknown;
  contributionId: string;
  review: RadarSpecialistStoredReview;
}): Record<string, unknown> {
  const contexto = objeto(input.radarContext) || {};
  const atuais = objeto(contexto[CHAVE_DAS_REVISOES]) || {};
  return {
    ...contexto,
    [CHAVE_DAS_REVISOES]: { ...atuais, [input.contributionId]: input.review },
  };
}

/**
 * O QUE ESTÁ GRAVADO VENCE O QUE O CLIENTE MANDOU — a guarda do §13.
 *
 * Editar a pauta manda o `radar_context` inteiro de volta, montado a partir de
 * uma leitura que pode ser de minutos atrás. Sem esta função, salvar uma
 * pergunta apagaria uma decisão tomada nesse intervalo — em outra aba, em outra
 * máquina, ou pela pessoa que estava revisando enquanto outra editava.
 */
export function radarContextPreservingReviews(input: {
  /** O que veio do cliente. */
  incoming: unknown;
  /** O que está gravado agora, lido pelo servidor. */
  stored: unknown;
}): Record<string, unknown> {
  const recebido = objeto(input.incoming) || {};
  const gravadas = radarSpecialistReviewsOf(input.stored);
  /* O que o cliente mandou sob esta chave é descartado inteiro, não mesclado. */
  const semRevisoes = Object.fromEntries(Object.entries(recebido).filter(([chave]) => chave !== CHAVE_DAS_REVISOES));
  return Object.keys(gravadas).length ? { ...semRevisoes, [CHAVE_DAS_REVISOES]: gravadas } : semRevisoes;
}
