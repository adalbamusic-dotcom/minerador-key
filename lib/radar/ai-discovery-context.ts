/**
 * DESCOBERTA E COMPREENSÃO — UM ARTIGO SÓ, ENCONTRÁVEL E INTERPRETÁVEL.
 *
 * Esta camada responde a uma pergunta editorial, não a uma pergunta de robô:
 * QUE NECESSIDADES ESTE ARTIGO PRECISA CONSEGUIR RESPONDER COM CLAREZA, e o
 * que o dossiê já tem para sustentar cada uma delas.
 *
 * QUATRO DECISÕES DE MÉTODO, TODAS DELIBERADAS:
 *
 *   1. NÃO EXISTE NOTA DE DESCOBERTA POR IA. Ninguém sabe calcular a chance de
 *      um sistema citar um texto, e um percentual inventado daria à suposição
 *      a aparência de medida. O que existe são REQUISITOS com evidência atrás.
 *
 *   2. NÃO EXISTEM DOIS CONTEÚDOS. Não há versão "para pessoas" e versão
 *      "para máquina". Quem responde com clareza, nomeia as entidades certas e
 *      organiza os conceitos é compreendido pelos dois — e é por isso que a
 *      maioria dos requisitos daqui sai marcada como compartilhada.
 *
 *   3. A SERP CONTINUA COM A VOZ MAIS ALTA. Uma leitura interpretativa achando
 *      que um conceito "não parece importante para extração" não remove um
 *      conceito que catorze concorrentes tratam. Quando as duas discordam,
 *      isso vira conflito registrado, resolvido pela hierarquia canônica — e o
 *      requisito sustentado por observação permanece.
 *
 *   4. COBERTURA DE MERCADO NÃO É PRONTIDÃO. Uma necessidade tratada por doze
 *      concorrentes e sem fonte adequada continua NÃO PRONTA quando a
 *      afirmação é sensível. Recorrência descreve o mercado; ela não sustenta
 *      fato, e o Gate 12 é quem diz se há sustentação.
 *
 * O Radar NÃO escreve o artigo. Nada aqui produz parágrafo, título, tamanho de
 * resposta ou estrutura final: o que sai são necessidades, exigências e o
 * material que existe para atendê-las. Padrão competitivo não é a estrutura do
 * artigo — é o que o mercado faz, e copiá-lo seria abrir mão da diferenciação
 * que a mesma investigação encontrou.
 *
 * Domínio puro: sem busca externa, sem storage, sem serviço externo de IA. A
 * camada inteira é determinística e testável a partir do que já foi observado.
 */

import { assertRadarEvidenceAuthority, resolveRadarEvidencePrecedence, type RadarEvidenceResolution } from "./evidence-authority.ts";
import { radarClaimNeedsFactualSupport } from "./claim-evidence.ts";
import { radarDeclaredArticleIntent } from "./editorial-identity.ts";
import { radarSemanticIsNoise, radarSemanticStems } from "./semantic-concept-model.ts";
import { radarSourceCanSupportFact } from "./source-authority.ts";

import type { RadarArticleResearchContext } from "./article-research-context.ts";
import type { RadarAuthorityEvidence } from "./authority-evidence.ts";
import type { RadarModelPresence } from "./competitive-model.ts";
import type { RadarObservedConcept, RadarObservedEntities, RadarObservedQuestion } from "./competitive-observed-model.ts";
import type { RadarConceptType, RadarSemanticConceptModel } from "./semantic-concept-model.ts";

/* ============================== o vocabulário ============================ */

/** O estágio declarado pelo fundamento. O Radar lê; não reclassifica. */
export type RadarDiscoveryFunnel = "TOFU" | "MOFU" | "BOFU";

/**
 * Quanto esta camada se aplica a este artigo.
 *
 * `REQUIRED` é o topo de funil: o artigo existe para ser descoberto, e sem
 * clareza ele não é. `APPLICABLE` é o meio com conteúdo explicativo,
 * comparativo ou factual recuperável. `CONTEXTUAL` é o fundo, onde a
 * prioridade é decisão e não descoberta. `UNDETERMINED` é honestidade: o
 * fundamento não declarou o estágio, e inventá-lo seria reclassificar.
 */
export type RadarDiscoveryApplicability = "REQUIRED" | "APPLICABLE" | "CONTEXTUAL" | "UNDETERMINED";

/**
 * O que sustenta uma afirmação desta camada.
 *
 * A separação existe para uma coisa só: impedir que uma sugestão nossa vire
 * exigência competitiva. `OBSERVED` é o que a amostra mostrou. `DERIVED` é o
 * que se conclui de observação, sem acrescentar fato. `HEURISTIC` é leitura
 * nossa — e leitura nossa não vira requisito.
 */
export type RadarDiscoveryBasis = "OBSERVED" | "DERIVED" | "HEURISTIC";

export type RadarDiscoveryOrigin =
  | "SERP"
  | "ARTICLE_DNA"
  | "SEMANTIC_CONCEPT"
  | "QUESTION_CLUSTER"
  | "FACTUAL_EVIDENCE"
  | "SPECIALIST_REQUIREMENT"
  | "HEURISTIC";

/**
 * A que descoberta este requisito serve.
 *
 * Na maioria dos casos, às duas: responder com clareza uma pergunta recorrente
 * é útil a quem busca e a quem interpreta. `SEARCH` fica com o que é disputa
 * de cobertura — estar à altura do que o mercado trata. `AI_DISCOVERY` fica
 * com o que só melhora a leitura de um trecho isolado, quando não há nada
 * competitivo em jogo porque o artigo já declara e o mercado já cobre.
 */
export type RadarDiscoveryScope = "SHARED" | "SEARCH" | "AI_DISCOVERY";

/* ========================== o estágio declarado ========================== */

/*
 * O vocabulário real gravado a montante, com as variações que o Minerador e o
 * Arquiteto já reconhecem. A mesma leitura da closure de classificação — se
 * duas partes do sistema lessem "consideração" de formas diferentes, o funil
 * mudaria de significado no meio do caminho.
 */
const FUNIL: Array<{ funnel: RadarDiscoveryFunnel; pattern: RegExp }> = [
  { funnel: "TOFU", pattern: /^tofu|topo|^top|awareness|descoberta|conscien/i },
  { funnel: "MOFU", pattern: /^mofu|meio|middle|considera/i },
  { funnel: "BOFU", pattern: /^bofu|fundo|bottom|decis|convers|compra/i },
];

export type RadarDeclaredFunnel = {
  /** O texto exatamente como o fundamento gravou. */
  declared: string | null;
  read: RadarDiscoveryFunnel | null;
  source: string;
  reason: string;
};

/**
 * O ESTÁGIO VEM DO FUNDAMENTO, SEMPRE.
 *
 * O Radar tem a SERP na mão e ainda assim não reclassifica funil: estágio
 * editorial é decisão de formação, tomada com o universo de keywords inteiro à
 * vista. Reclassificar aqui seria o Radar respondendo uma pergunta que não é
 * dele com uma evidência que não serve para ela.
 */
export function radarDeclaredFunnel(context: RadarArticleResearchContext): RadarDeclaredFunnel {
  /*
   * O FUNIL DO ARTIGO VEM DA DECISÃO DO ARTIGO — antes da keyword.
   *
   * O SMOKE MOSTROU O FUNIL VAZIO e, com ele, a camada de descoberta inteira
   * zerada: sem estágio declarado, `buildRadarAiDiscoveryContext` não se aplica,
   * e "Busca e compreensão" exibia 0 perguntas centrais ao lado de um modelo
   * competitivo com 13.
   *
   * A causa era de leitura: esta função só olhava a qualificação semântica de
   * cada keyword, que só existe quando o handoff trouxe a referência versionada
   * COMPLETA. O Arquiteto, por sua vez, fecha o funil do ARTIGO em
   * `ArticleDNA.classification.funnel` — com valor, motivo e origem — e é isso
   * que ele mostra na tela dele.
   *
   * Ler a decisão terminal primeiro não é reclassificar: é usar a conclusão que
   * o dono dela já registrou. A qualificação da keyword continua valendo como
   * segunda leitura, para o fundamento que não tem classificação fechada.
   */
  const terminal = context.article.classification;
  if (terminal?.funnel) {
    const lido = { TOP: "TOFU", MIDDLE: "MOFU", BOTTOM: "BOFU" }[terminal.funnel] as RadarDiscoveryFunnel | undefined;
    return {
      declared: terminal.funnelLabel || terminal.funnel,
      read: lido || null,
      source: "Classificação terminal do ArticleDNA, fechada pelo Arquiteto.",
      reason: lido
        ? `O Arquiteto concluiu o funil como ${terminal.funnelLabel || terminal.funnel}${terminal.reason ? `: ${terminal.reason}` : "."}`
        : `O Arquiteto concluiu "${terminal.funnelLabel || terminal.funnel}", que não corresponde a um estágio único. O Radar não reclassifica.`,
    };
  }

  const ordenadas = [...context.keywords].sort((left, right) =>
    (left.identity.role === "principal" ? 0 : 1) - (right.identity.role === "principal" ? 0 : 1));

  for (const keyword of ordenadas) {
    const declarado = (keyword.strategy.semanticQualification?.funnel || "").trim();
    if (!declarado) continue;
    const lido = FUNIL.find(item => item.pattern.test(declarado))?.funnel || null;
    return {
      declared: declarado,
      read: lido,
      source: `Qualificação semântica da keyword ${keyword.identity.role}${keyword.strategy.semanticQualification?.versionId ? ` (${keyword.strategy.semanticQualification.versionId})` : ""}.`,
      reason: lido
        ? `O fundamento declarou "${declarado}", lido como ${lido}.`
        : `O fundamento declarou "${declarado}", que não corresponde a nenhum estágio conhecido. O Radar não reclassifica.`,
    };
  }

  return {
    declared: null,
    read: null,
    source: "Nenhuma keyword da composição carrega qualificação semântica com funil.",
    reason: "O estágio de funil não foi declarado pelo fundamento.",
  };
}

/* ========================= a unidade de resposta ========================= */

/** O peso da necessidade dentro da amostra. Recorrência, não palpite. */
export type RadarUnitImportance = "CORE" | "SUPPORTING" | "PERIPHERAL";

/** O que o dossiê tem para sustentar a resposta — cruzamento com o Gate 12. */
export type RadarFactualSupportStatus = "ADEQUATE" | "PARTIAL" | "MISSING" | "CONFLICTED" | "NOT_REQUIRED";

/**
 * O dossiê permite planejar uma resposta robusta para esta necessidade?
 *
 * A avaliação NÃO é sobre o texto final — ele ainda não existe. É sobre o
 * material: há evidência, há conflito aberto, falta fonte, falta o
 * profissional.
 */
export type RadarAnswerability =
  | "CLEARLY_ANSWERABLE"
  | "PARTIALLY_ANSWERABLE"
  | "EVIDENCE_REQUIRED"
  | "SPECIALIST_REQUIRED"
  | "CONFLICTED";

export type RadarUnitReadiness = "READY" | "NOT_READY";

export type RadarAnswerableUnit = {
  id: string;
  /** A formulação REAL da amostra ou do conceito. Nada inventado. */
  questionOrNeed: string;
  origin: "QUESTION_CLUSTER" | "SEMANTIC_CONCEPT";
  concept: { id: string; label: string; type: RadarConceptType; typeLabel: string };
  /** A intenção observada na amostra — contexto da necessidade. */
  intent: string | null;
  importance: RadarUnitImportance;
  /**
   * QUANTO O MERCADO TRATA ESTA NECESSIDADE — pela cobertura do conceito.
   *
   * A conta é sobre a NECESSIDADE, não sobre a formulação: treze páginas
   * tratam de identificar pele oleosa, e nove delas escrevem isso como
   * pergunta. Medir pela formulação faria uma necessidade central parecer
   * marginal só porque o mercado a escreve como título afirmativo.
   */
  marketRecurrence: {
    pages: number;
    sampleSize: number;
    queryCoverage: number;
    queries: string[];
    competitors: string[];
    recurrence: "STRONG" | "MODERATE" | "WEAK";
    statement: string;
  };
  /** Quantas páginas formulam a necessidade como pergunta, quando alguma o faz. */
  questionRecurrence: { pages: number; variants: number } | null;
  articleCoverage: "DECLARED" | "NOT_DECLARED";
  /**
   * O QUE A RESPOSTA PRECISA ENTREGAR — não a resposta.
   *
   * "Explicar os sinais de forma direta antes de aprofundar causas" é
   * requisito. O parágrafo é do Redator, e a organização é do Planejador.
   */
  answerRequirement: string;
  entityContext: { primary: string | null; related: string[] };
  factualEvidenceRequirement: {
    support: RadarFactualSupportStatus;
    claimId: string | null;
    ymylRelevance: string;
    /** As fontes verificadas que já sustentam — ou não — esta necessidade. */
    sources: string[];
    /**
     * O que o mercado cita ao tratar desta necessidade. Candidata, não fonte.
     *
     * Saber que sete concorrentes citam a mesma instituição ao explicar isto é
     * ponto de partida para quem for buscar sustentação. Não é atestado de
     * autoridade, e nenhuma delas foi acessada.
     */
    candidateSources: string[];
    reason: string;
  };
  specialistRequirement: { requirementId: string; kind: string; question: string } | null;
  answerability: RadarAnswerability;
  readiness: RadarUnitReadiness;
  /** O que impede a prontidão. `null` quando nada impede. */
  blockedBy: "FACTUAL_EVIDENCE" | "SPECIALIST" | "CONFLICT" | "MARKET_EVIDENCE" | null;
  readinessReason: string;
  confidence: "HIGH" | "MEDIUM" | "LOW";
  provenance: Array<{ origin: RadarDiscoveryOrigin; basis: RadarDiscoveryBasis; detail: string }>;
};

/* ============================== as perguntas ============================= */

/**
 * A classe da pergunta — e por que ela é uma LISTA.
 *
 * Uma pergunta central sobre uso de ácido na gravidez é as duas coisas ao
 * mesmo tempo: central para o mercado e sensível para o fato. Escolher uma
 * das duas apagaria a outra, e as duas mudam o que o Planejador faz.
 */
export type RadarDiscoveryQuestionClass =
  | "CORE_QUESTION"
  | "SUPPORTING_QUESTION"
  | "UNDERCOVERED_QUESTION"
  | "FACT_SENSITIVE_QUESTION";

export type RadarDiscoveryQuestion = {
  questionId: string;
  question: string;
  variants: string[];
  conceptId: string;
  conceptLabel: string;
  classes: RadarDiscoveryQuestionClass[];
  pages: number;
  sampleSize: number;
  queryCoverage: number;
  queries: string[];
  competitors: string[];
  articleCoverage: "DECLARED" | "NOT_DECLARED";
  factSensitive: boolean;
  evidence: string;
  provenance: string;
};

export type RadarQuestionCoverageRequirement = {
  questionId: string;
  question: string;
  classes: RadarDiscoveryQuestionClass[];
  requirement: string;
  scope: RadarDiscoveryScope;
  origin: RadarDiscoveryOrigin;
  basis: RadarDiscoveryBasis;
  priority: "HIGH" | "MEDIUM" | "LOW";
  evidence: string;
  provenance: string;
};

/* ============================== as definições =========================== */

export type RadarDefinitionRequirement = {
  term: string;
  conceptId: string | null;
  /** Os conceitos que dependem deste termo para fazer sentido. */
  dependents: string[];
  pages: number;
  sampleSize: number;
  reason: string;
  origin: RadarDiscoveryOrigin;
  basis: RadarDiscoveryBasis;
  confidence: "HIGH" | "MEDIUM" | "LOW";
  provenance: string;
};

/* =============================== as entidades =========================== */

export type RadarDiscoveryEntityContext = {
  primary: string | null;
  related: Array<{ label: string; relation: string; relatedTo: string | null; pages: number; evidence: string }>;
  marketOnly: Array<{ label: string; pages: number; evidence: string }>;
  /** Entidades que o texto precisa distinguir em vez de usar como sinônimo. */
  disambiguationNeeds: Array<{ label: string; relatedTo: string | null; reason: string; evidence: string }>;
};

export type RadarEntityCoverageRequirement = {
  label: string;
  role: "PRIMARY" | "RELATED" | "MARKET";
  relation: string;
  relatedTo: string | null;
  pages: number;
  sampleSize: number;
  requirement: string;
  scope: RadarDiscoveryScope;
  origin: RadarDiscoveryOrigin;
  basis: RadarDiscoveryBasis;
  confidence: "HIGH" | "MEDIUM" | "LOW";
  provenance: string;
};

/* ========================== as relações conceituais ===================== */

/**
 * O vocabulário de relação — e uma ausência deliberada.
 *
 * `PART_OF` não está aqui. Ele estaria se houvesse sinal observável de
 * parte-todo na amostra, e não há: nada no que extraímos distingue "a barreira
 * cutânea é parte da pele" de "a barreira cutânea se relaciona com a pele".
 * Declarar o tipo sem caminho que o produza daria falsa impressão de cobertura
 * — e essa lição já custou caro. Quando houver sinal, o tipo entra com ele.
 */
export type RadarConceptRelationKind =
  | "CAUSE_OF"
  | "RESULT_OF"
  | "AFFECTS"
  | "QUALIFIES"
  | "USED_FOR"
  | "CONTRASTS_WITH"
  | "REQUIRES"
  | "RELATED_TO";

export type RadarConceptRelation = {
  subject: string;
  kind: RadarConceptRelationKind;
  object: string;
  pages: number;
  sampleSize: number;
  evidence: string;
  origin: RadarDiscoveryOrigin;
  basis: RadarDiscoveryBasis;
  confidence: "HIGH" | "MEDIUM" | "LOW";
  provenance: string;
};

/* ========================== a recuperabilidade ========================== */

export type RadarRetrievabilityKind =
  | "DIRECT_ANSWER"
  | "EARLY_ANSWER_OPPORTUNITY"
  | "DEFINITION_BEFORE_DEPTH"
  | "PASSAGE_INDEPENDENCE"
  | "REFERENTIAL_CLARITY"
  | "EXPLICIT_ENTITY"
  | "SUPPORTED_CLAIM"
  | "COMPARISON_CRITERIA"
  | "STRUCTURED_FORMAT";

export type RadarRetrievabilityRequirement = {
  kind: RadarRetrievabilityKind;
  subject: string;
  requirement: string;
  scope: RadarDiscoveryScope;
  origin: RadarDiscoveryOrigin;
  basis: RadarDiscoveryBasis;
  unitIds: string[];
  evidence: string;
  provenance: string;
};

/**
 * O que uma leitura nossa pode propor sem virar exigência.
 *
 * Esta lista existe separada dos requisitos de propósito. Uma sugestão de
 * clareza sem evidência competitiva é útil ao Planejador e não é uma dívida
 * com o mercado — misturar as duas faria heurística parecer observação.
 */
export type RadarPotentialClarityImprovement = {
  subject: string;
  suggestion: string;
  basis: "HEURISTIC";
  note: string;
  provenance: string;
};

export type RadarDiscoveryHeuristicReading = {
  subject: string;
  reading: string;
  /** A leitura quer REMOVER um requisito sustentado por observação? */
  wouldSuppress?: boolean;
  provenance: string;
};

/* ================================ a camada ============================== */

export type RadarAiDiscoveryContext = {
  binding: { brandId: string; articleId: string; articleDnaVersionId: string; articleDnaContentHash: string | null };
  observedAt: string;
  funnel: RadarDeclaredFunnel;
  applicability: RadarDiscoveryApplicability;
  applicable: boolean;
  required: boolean;
  reason: string;
  answerableUnits: RadarAnswerableUnit[];
  questions: RadarDiscoveryQuestion[];
  questionCoverageRequirements: RadarQuestionCoverageRequirement[];
  definitionRequirements: RadarDefinitionRequirement[];
  entityContext: RadarDiscoveryEntityContext;
  entityCoverageRequirements: RadarEntityCoverageRequirement[];
  conceptRelations: RadarConceptRelation[];
  conceptCoverage: {
    core: Array<{ label: string; pages: number; evidence: string }>;
    supporting: Array<{ label: string; pages: number; evidence: string }>;
    related: Array<{ label: string; pages: number; evidence: string }>;
    undercovered: Array<{ label: string; pages: number; evidence: string }>;
  };
  retrievabilityRequirements: RadarRetrievabilityRequirement[];
  potentialClarityImprovements: RadarPotentialClarityImprovement[];
  /** Busca × IA numa matriz só: um plano, não dois. */
  matrix: { shared: number; search: number; aiDiscovery: number; note: string };
  factualCoverage: { adequate: number; partial: number; missing: number; conflicted: number; notRequired: number };
  specialistConnections: Array<{ unitId: string; requirementId: string; kind: string; question: string }>;
  /** Divergências entre observação e leitura interpretativa, nenhuma silenciosa. */
  conflicts: RadarEvidenceResolution[];
  /** O que ficou de fora, com o motivo. Ausência declarada, nunca omitida. */
  excluded: Array<{ subject: string; reason: string }>;
  limitations: string[];
};

/* ================================= o motor ============================== */

const maioria = (amostra: number) => Math.max(2, Math.ceil(amostra / 2));

function assinatura(valor: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < valor.length; index += 1) {
    hash ^= valor.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}

const dominioDe = (url: string) => {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
};

/** Tipos cujo conteúdo é explicativo, comparativo ou factual recuperável. */
const EXPLICATIVOS: readonly RadarConceptType[] = ["ENTITY", "ATTRIBUTE", "CAUSE", "PROCESS", "COMPARISON", "BENEFIT", "PROBLEM", "QUESTION"];

/**
 * A RELAÇÃO QUE O TIPO DO CONCEITO SUSTENTA.
 *
 * Cada linha nasce da faceta que o Gate 8 já leu no texto do concorrente: um
 * heading lido como CAUSA descreve o que provoca o assunto; um lido como
 * ATRIBUTO descreve o que o caracteriza. A relação não acrescenta conhecimento
 * de mundo — ela nomeia o que a leitura de tipo já disse.
 */
const RELACAO_POR_TIPO: Partial<Record<RadarConceptType, RadarConceptRelationKind>> = {
  CAUSE: "CAUSE_OF",
  BENEFIT: "RESULT_OF",
  PROBLEM: "AFFECTS",
  ATTRIBUTE: "QUALIFIES",
  PROCESS: "USED_FOR",
  PRODUCT: "USED_FOR",
  COMPARISON: "CONTRASTS_WITH",
};

const RELACAO_LABEL: Record<RadarConceptRelationKind, string> = {
  CAUSE_OF: "é causa de",
  RESULT_OF: "é resultado de",
  AFFECTS: "afeta",
  QUALIFIES: "caracteriza",
  USED_FOR: "é usado para",
  CONTRASTS_WITH: "contrasta com",
  REQUIRES: "exige a compreensão de",
  RELATED_TO: "se relaciona com",
};

const recorrencia = (pages: number, amostra: number) =>
  pages >= maioria(amostra) ? "STRONG" as const : pages > 2 ? "MODERATE" as const : "WEAK" as const;

/**
 * A CAMADA INTEIRA, DERIVADA DO QUE JÁ FOI OBSERVADO.
 *
 * Nada aqui busca, nada aqui interpreta com serviço externo, e nada aqui
 * escreve o artigo. As entradas são o fundamento declarado, a leitura
 * semântica do Gate 8, a fotografia competitiva do Gate 9 e a camada de
 * autoridade do Gate 12 — todas já construídas quando esta é chamada.
 */
export function buildRadarAiDiscoveryContext(input: {
  context: RadarArticleResearchContext;
  semantic: RadarSemanticConceptModel | null;
  concepts: readonly RadarObservedConcept[];
  questions: readonly RadarObservedQuestion[];
  entities: RadarObservedEntities;
  authority: RadarAuthorityEvidence;
  presences?: readonly RadarModelPresence[];
  sampleSize: number;
  observedIntent?: string | null;
  /** Leituras interpretativas que queiram opinar. Nunca decidem. */
  heuristicReadings?: readonly RadarDiscoveryHeuristicReading[];
  observedAt: string;
}): RadarAiDiscoveryContext {
  const amostra = input.sampleSize;
  const limitations: string[] = [];
  const excluded: Array<{ subject: string; reason: string }> = [];
  const conflicts: RadarEvidenceResolution[] = [];

  const binding = {
    brandId: input.context.article.brandId,
    articleId: input.context.article.articleId,
    articleDnaVersionId: input.context.article.articleDnaVersionId,
    articleDnaContentHash: input.context.article.articleDnaContentHash,
  };

  /* ------------------------------ o estágio ------------------------------- */

  const funnel = radarDeclaredFunnel(input.context);
  const semanticos = new Map((input.semantic?.concepts || []).map(item => [item.id, item]));
  const ancorado = (conceptId: string) => Boolean(semanticos.get(conceptId)?.anchored);

  const explicativo = input.concepts.some(concept =>
    concept.sourceCount >= 2 && EXPLICATIVOS.includes(concept.conceptType));
  const comAfirmacoes = input.authority.claims.length > 0;
  /*
   * A INTENÇÃO TAMBÉM VEM DA DECISÃO TERMINAL — mesma lacuna do funil.
   *
   * Sem funil declarado, esta camada cai para "a intenção principal é
   * informacional?". A pergunta era feita só a `mainIntent`, o campo livre do
   * ArticleDNA — e quando ele vinha vazio a resposta era UNDETERMINED, com a
   * descoberta inteira zerada ao lado de um modelo competitivo cheio.
   *
   * A classificação terminal do Arquiteto responde a mesma pergunta com
   * decisão fechada. Ler as duas não é reclassificar: é aceitar a conclusão de
   * quem a tomou antes de recorrer ao texto livre.
   */
  const intencaoDeclarada = radarDeclaredArticleIntent(input.context.article) || "";
  const informacional = /informacion|informational/i.test(intencaoDeclarada);

  const { applicability, required, applicable, reason } = (() => {
    if (funnel.read === "TOFU") {
      return {
        applicability: "REQUIRED" as const, required: true, applicable: true,
        reason: "Topo de funil: o artigo existe para ser descoberto e compreendido por quem ainda está formando a pergunta. Clareza de resposta, entidade nomeada e conceito organizado deixam de ser refinamento e passam a ser condição.",
      };
    }
    if (funnel.read === "MOFU") {
      return explicativo || comAfirmacoes
        ? {
          applicability: "APPLICABLE" as const, required: false, applicable: true,
          reason: "Meio de funil com conteúdo explicativo, comparativo ou factual: há material recuperável, e ele se beneficia das mesmas exigências de clareza — sem o conjunto obrigatório do topo.",
        }
        : {
          applicability: "CONTEXTUAL" as const, required: false, applicable: false,
          reason: "Meio de funil sem conteúdo explicativo ou factual observado na amostra: não há material recuperável que justifique exigências de descoberta.",
        };
    }
    if (funnel.read === "BOFU") {
      return {
        applicability: "CONTEXTUAL" as const, required: false, applicable: explicativo || comAfirmacoes,
        reason: "Fundo de funil: a prioridade é a decisão, não a descoberta. O que houver de explicativo continua valendo como contexto, e o conjunto obrigatório do topo não é aplicado.",
      };
    }
    if (informacional) {
      limitations.push("O funil não foi declarado pelo fundamento; a leitura usou a intenção principal declarada como informacional. O Radar não reclassifica estágio.");
      return {
        applicability: "APPLICABLE" as const, required: false, applicable: true,
        reason: "Sem funil declarado, a intenção principal do fundamento é informacional: a camada se aplica como contexto, sem a obrigatoriedade que só o topo declarado impõe.",
      };
    }
    limitations.push("O funil não foi declarado pelo fundamento e a intenção principal não é informacional: a aplicabilidade desta camada não pôde ser determinada.");
    return {
      applicability: "UNDETERMINED" as const, required: false, applicable: false,
      reason: funnel.reason,
    };
  })();

  if (!applicable) {
    return {
      binding, observedAt: input.observedAt, funnel, applicability, applicable, required, reason,
      answerableUnits: [], questions: [], questionCoverageRequirements: [], definitionRequirements: [],
      entityContext: { primary: null, related: [], marketOnly: [], disambiguationNeeds: [] },
      entityCoverageRequirements: [], conceptRelations: [],
      conceptCoverage: { core: [], supporting: [], related: [], undercovered: [] },
      retrievabilityRequirements: [], potentialClarityImprovements: [],
      matrix: { shared: 0, search: 0, aiDiscovery: 0, note: "A camada não se aplica a este artigo: nenhum requisito foi produzido." },
      factualCoverage: { adequate: 0, partial: 0, missing: 0, conflicted: 0, notRequired: 0 },
      specialistConnections: [], conflicts: [], excluded: [], limitations,
    };
  }

  /* ------------------------------- perguntas ------------------------------ */

  const claimPorConceito = new Map(input.authority.claims.map(claim => [claim.conceptId, claim]));
  const conflitoPorClaim = new Map(input.authority.marketVsFactConflicts.map(item => [item.claimId, item]));
  const especialistaPorClaim = new Map(input.authority.specialistReviewRequirements.map(item => [item.claimId, item]));
  const evidenciaPorClaim = new Map<string, RadarAuthorityEvidence["factualEvidence"]>();
  for (const evidencia of input.authority.factualEvidence) {
    evidenciaPorClaim.set(evidencia.claimId, [...(evidenciaPorClaim.get(evidencia.claimId) || []), evidencia]);
  }

  const conceitoObservado = new Map(input.concepts.map(item => [item.id, item]));
  const sensivel = (conceptId: string) => {
    const claim = claimPorConceito.get(conceptId);
    return Boolean(claim && radarClaimNeedsFactualSupport(claim));
  };

  const questions: RadarDiscoveryQuestion[] = [];
  for (const observada of input.questions) {
    /*
     * PERGUNTA FORA DO ASSUNTO NÃO É NECESSIDADE DESTE ARTIGO.
     *
     * O agrupamento do Gate 8 já marca quando o conceito fala do assunto da
     * composição. Uma pergunta pendurada num conceito não ancorado veio junto
     * na amostra, e respondê-la seria escrever outro artigo.
     */
    if (!ancorado(observada.conceptId)) {
      excluded.push({ subject: observada.canonicalQuestion, reason: "A pergunta pertence a um conceito que não fala do assunto declarado pela composição." });
      continue;
    }
    const conceito = conceitoObservado.get(observada.conceptId);
    const classes: RadarDiscoveryQuestionClass[] = [
      observada.pages >= maioria(amostra) ? "CORE_QUESTION" : observada.pages >= 2 ? "SUPPORTING_QUESTION" : "UNDERCOVERED_QUESTION",
    ];
    const factSensitive = sensivel(observada.conceptId);
    if (factSensitive) classes.push("FACT_SENSITIVE_QUESTION");

    questions.push({
      questionId: observada.id,
      question: observada.canonicalQuestion,
      variants: [...observada.variants],
      conceptId: observada.conceptId,
      conceptLabel: observada.conceptLabel,
      classes,
      pages: observada.pages,
      sampleSize: amostra,
      queryCoverage: observada.queryCoverage,
      queries: [...(conceito?.queries || [])],
      competitors: [...new Set(observada.sourceUrls.map(dominioDe))],
      articleCoverage: observada.declaredByArticle ? "DECLARED" : "NOT_DECLARED",
      factSensitive,
      evidence: observada.evidence,
      provenance: `Agrupamento de perguntas do modelo semântico (${observada.id}), sobre o conceito ${observada.conceptId}.`,
    });
  }

  /* ---------------------- as unidades de resposta ------------------------- */

  const entidadePrincipal = input.entities.article[0]
    || input.context.keywords.find(keyword => keyword.identity.role === "principal")?.identity.text
    || null;

  const relacionadas = input.entities.related.map(item => item.label);

  const unidade = (fonte: {
    texto: string; origin: RadarAnswerableUnit["origin"];
    conceptId: string; pages: number; queryCoverage: number; queries: string[];
    competitors: string[]; declarada: boolean; confidence: "HIGH" | "MEDIUM" | "LOW";
    questionRecurrence?: { pages: number; variants: number } | null;
    provenance: RadarAnswerableUnit["provenance"];
  }): RadarAnswerableUnit => {
    const conceito = conceitoObservado.get(fonte.conceptId);
    const semantico = semanticos.get(fonte.conceptId);
    const claim = claimPorConceito.get(fonte.conceptId) || null;
    const conflito = claim ? conflitoPorClaim.get(claim.claimId) || null : null;
    const especialista = claim ? especialistaPorClaim.get(claim.claimId) || null : null;
    const evidencias = claim ? evidenciaPorClaim.get(claim.claimId) || [] : [];

    /*
     * COBERTURA DE MERCADO NÃO SUSTENTA FATO.
     *
     * Quando a afirmação exige sustentação, o que decide o estado é o que a
     * evidência mostra — não quantos concorrentes repetem. Uma fonte que não
     * pode sustentar fato deixa o estado em parcial, e isso é dito.
     */
    const support: RadarFactualSupportStatus = !claim || !radarClaimNeedsFactualSupport(claim)
      ? "NOT_REQUIRED"
      : conflito ? "CONFLICTED"
        : evidencias.some(item => item.supportType === "SUPPORTS" && radarSourceCanSupportFact(item.sourceType)) ? "ADEQUATE"
          : evidencias.length ? "PARTIAL"
            : "MISSING";

    /*
     * NEM TODO PONTO DE ESPECIALISTA IMPEDE PLANEJAR.
     *
     * `VERIFY_AND_ADD_EXPERIENCE` existe quando a afirmação JÁ tem sustentação
     * e o que falta é a nuance de quem pratica. Isso enriquece a resposta, não
     * a bloqueia — tratá-lo como impedimento faria toda necessidade sensível
     * bem sustentada parecer incompleta, e a distinção que o Gate 12 fez com
     * cuidado sumiria aqui.
     */
    const especialistaBloqueia = Boolean(especialista) && especialista?.kind !== "VERIFY_AND_ADD_EXPERIENCE";

    /*
     * A CAUSA RAIZ É QUE NOMEIA O ESTADO.
     *
     * Sem fonte adequada, o ponto de especialista existe PORQUE falta fonte.
     * Dizer "depende do especialista" esconderia o que de fato falta, e o que
     * falta é evidência.
     */
    const answerability: RadarAnswerability = support === "CONFLICTED" ? "CONFLICTED"
      : support === "MISSING" ? "EVIDENCE_REQUIRED"
        : especialistaBloqueia ? "SPECIALIST_REQUIRED"
          : support === "PARTIAL" || fonte.confidence === "LOW" || fonte.pages < 2 ? "PARTIALLY_ANSWERABLE"
            : "CLEARLY_ANSWERABLE";

    const blockedBy: RadarAnswerableUnit["blockedBy"] = answerability === "CONFLICTED" ? "CONFLICT"
      : answerability === "EVIDENCE_REQUIRED" || support === "PARTIAL" ? "FACTUAL_EVIDENCE"
        : answerability === "SPECIALIST_REQUIRED" ? "SPECIALIST"
          : answerability === "PARTIALLY_ANSWERABLE" ? "MARKET_EVIDENCE"
            : null;

    const tipo = conceito?.conceptType || semantico?.conceptType || "TOPIC";
    const rotuloTipo = conceito?.typeLabel || semantico?.typeLabel || "Assunto";
    const raizesDaNecessidade = radarSemanticStems(fonte.texto);

    return {
      id: `answer:${assinatura(`${fonte.conceptId}|${fonte.texto}`)}`,
      questionOrNeed: fonte.texto,
      origin: fonte.origin,
      concept: { id: fonte.conceptId, label: conceito?.canonicalLabel || semantico?.canonicalLabel || fonte.texto, type: tipo, typeLabel: rotuloTipo },
      intent: input.observedIntent || null,
      importance: fonte.pages >= maioria(amostra) ? "CORE" : fonte.pages >= 2 ? "SUPPORTING" : "PERIPHERAL",
      marketRecurrence: {
        pages: fonte.pages,
        sampleSize: amostra,
        queryCoverage: fonte.queryCoverage,
        queries: fonte.queries,
        competitors: fonte.competitors,
        recurrence: recorrencia(fonte.pages, amostra),
        statement: `${fonte.pages} de ${amostra} página(s) comparável(is) tratam desta necessidade${fonte.questionRecurrence ? `, ${fonte.questionRecurrence.pages} delas formulando-a como pergunta` : ""}${fonte.queryCoverage > 1 ? `, encontradas por ${fonte.queryCoverage} consultas` : ""}.`,
      },
      questionRecurrence: fonte.questionRecurrence || null,
      articleCoverage: fonte.declarada ? "DECLARED" : "NOT_DECLARED",
      answerRequirement: `O artigo precisa responder "${fonte.texto}" de forma direta e inequívoca, na leitura de ${rotuloTipo.toLowerCase()} que a amostra mostra, antes de aprofundar o que depende dela.`,
      entityContext: {
        primary: entidadePrincipal,
        related: relacionadas.filter(label => radarSemanticStems(label).some(raiz => raizesDaNecessidade.includes(raiz))),
      },
      factualEvidenceRequirement: {
        support,
        claimId: claim?.claimId || null,
        ymylRelevance: claim?.ymyl.relevance || "NONE",
        sources: evidencias.map(item => item.sourceDomain),
        candidateSources: [...(claim?.observedSourceDomains || [])],
        reason: support === "NOT_REQUIRED"
          ? "A necessidade não carrega afirmação que exija sustentação factual."
          : support === "ADEQUATE" ? `Sustentada por ${evidencias.length} fonte(s) verificada(s) capaz(es) de sustentar fato.`
            : support === "PARTIAL" ? "Há fonte verificada, mas ela não sustenta a afirmação por si — natureza indeterminada ou leitura ainda não registrada."
              : support === "CONFLICTED" ? `O que o mercado repete e o que a evidência permite afirmar divergem: ${conflito?.impact || "conflito registrado."}`
                : "A afirmação exige sustentação factual e nenhuma fonte adequada foi encontrada nesta investigação.",
      },
      specialistRequirement: especialista
        ? { requirementId: especialista.requirementId, kind: especialista.kind, question: especialista.specificQuestion }
        : null,
      answerability,
      readiness: answerability === "CLEARLY_ANSWERABLE" ? "READY" : "NOT_READY",
      blockedBy,
      readinessReason: answerability === "CLEARLY_ANSWERABLE"
        ? "O dossiê tem material para planejar uma resposta robusta."
        : answerability === "CONFLICTED" ? "Há conflito aberto entre a recorrência do mercado e a evidência factual: planejar sem resolvê-lo reproduziria a versão do mercado como se fosse consenso."
          : answerability === "SPECIALIST_REQUIRED" ? "A resposta depende de uma contribuição profissional já preparada e ainda não recebida."
            : answerability === "EVIDENCE_REQUIRED" ? "A necessidade é sensível e o dossiê não tem fonte adequada: cobertura de mercado não sustenta o fato."
              : "O material sustenta parte da resposta; o restante depende de evidência ou de mais amostra.",
      confidence: fonte.confidence,
      provenance: fonte.provenance,
    };
  };

  const units: RadarAnswerableUnit[] = [];
  const conceitosComUnidade = new Set<string>();

  for (const pergunta of questions) {
    const conceito = conceitoObservado.get(pergunta.conceptId);
    units.push(unidade({
      texto: pergunta.question, origin: "QUESTION_CLUSTER",
      conceptId: pergunta.conceptId,
      /* A necessidade é do conceito; a pergunta é uma das formas de escrevê-la. */
      pages: Math.max(conceito?.sourceCount || 0, pergunta.pages),
      queryCoverage: pergunta.queryCoverage,
      queries: pergunta.queries,
      competitors: [...new Set([...(conceito?.supportingPages.map(item => dominioDe(item.url)) || []), ...pergunta.competitors])],
      declarada: pergunta.articleCoverage === "DECLARED" || conceito?.status === "CONFIRMED_BY_ARTICLE",
      confidence: conceito?.confidence || "MEDIUM",
      questionRecurrence: { pages: pergunta.pages, variants: pergunta.variants.length },
      provenance: [
        { origin: "QUESTION_CLUSTER", basis: "OBSERVED", detail: pergunta.provenance },
        { origin: "SERP", basis: "OBSERVED", detail: pergunta.evidence },
      ],
    }));
    conceitosComUnidade.add(pergunta.conceptId);
  }

  /*
   * NEM TODA NECESSIDADE CHEGA EM FORMA DE PERGUNTA.
   *
   * "Causas internas da pele oleosa" é uma necessidade tão real quanto "por
   * que a pele fica oleosa?" — e a amostra formula as duas. O conceito
   * recorrente que não virou pergunta entra aqui, com a mesma régua.
   */
  for (const concept of input.concepts) {
    if (conceitosComUnidade.has(concept.id)) continue;
    if (!ancorado(concept.id)) {
      excluded.push({ subject: concept.canonicalLabel, reason: "O conceito não fala do assunto declarado pela composição." });
      continue;
    }
    if (concept.sourceCount < 2) {
      excluded.push({ subject: concept.canonicalLabel, reason: "Observado em uma página só: uma aparição não descreve o que o mercado trata." });
      continue;
    }
    const semantico = semanticos.get(concept.id);
    units.push(unidade({
      texto: concept.canonicalLabel, origin: "SEMANTIC_CONCEPT",
      conceptId: concept.id, pages: concept.sourceCount, queryCoverage: concept.queryCoverage,
      queries: [...concept.queries], competitors: [...new Set(concept.supportingPages.map(item => dominioDe(item.url)))],
      declarada: concept.status === "CONFIRMED_BY_ARTICLE",
      confidence: concept.confidence,
      provenance: [
        { origin: "SEMANTIC_CONCEPT", basis: "OBSERVED", detail: `Conceito ${concept.id} do modelo semântico, ${semantico?.variants.length || 1} formulação(ões) observada(s).` },
        { origin: "SERP", basis: "OBSERVED", detail: concept.evidence },
      ],
    }));
    conceitosComUnidade.add(concept.id);
  }

  units.sort((left, right) =>
    right.marketRecurrence.pages - left.marketRecurrence.pages
    || left.questionOrNeed.localeCompare(right.questionOrNeed));

  /* ------------------------ requisitos de pergunta ------------------------ */

  const questionCoverageRequirements: RadarQuestionCoverageRequirement[] = questions
    /*
     * PERGUNTA ISOLADA NÃO VIRA EXIGÊNCIA AUTOMÁTICA.
     *
     * Uma página perguntando não é o mercado perguntando. Ela continua no
     * registro — o que não acontece é virar dívida do artigo sem sustentação.
     */
    .filter(item => item.classes.includes("CORE_QUESTION") || item.classes.includes("SUPPORTING_QUESTION") || item.factSensitive)
    .map(item => {
      const core = item.classes.includes("CORE_QUESTION");
      const cobre = item.articleCoverage === "DECLARED";
      return {
        questionId: item.questionId,
        question: item.question,
        classes: item.classes,
        requirement: cobre
          ? "A composição já declara esta necessidade: o artigo precisa respondê-la com clareza suficiente para ser compreendida sem o resto da página."
          : "O mercado trata esta necessidade e a composição não a declara: o artigo precisa cobri-la para ficar à altura do que a busca mostra.",
        scope: (cobre ? "SHARED" : "SEARCH") as RadarDiscoveryScope,
        origin: "QUESTION_CLUSTER" as const,
        basis: "OBSERVED" as const,
        priority: item.factSensitive || core ? "HIGH" as const : "MEDIUM" as const,
        evidence: item.evidence,
        provenance: item.provenance,
      };
    });

  /* ------------------------- definições necessárias ----------------------- */

  const entidadesSemanticas = input.semantic?.entities || [];
  const semanticaPorRotulo = new Map(entidadesSemanticas.map(item => [item.label, item]));

  /*
   * TERMOS QUE NUNCA APARECEM SEPARADOS SÃO UMA EXPRESSÃO SÓ.
   *
   * A extração lê entidade por termo, e "ácido salicílico na gravidez" chega
   * como três: `acido`, `salicilico`, `gravidez`. Elas têm exatamente as mesmas
   * páginas de origem porque vieram do mesmo trecho — e transformar cada uma
   * em exigência entregaria três dívidas onde existe uma, com dois fragmentos
   * de termo entre elas.
   *
   * A régua é observável e não depende do assunto: cobertura idêntica na
   * amostra significa que a evidência não distingue os termos. Um representa o
   * grupo, os demais viajam junto — nada se perde, e a limitação é declarada.
   */
  const coberturaDe = (label: string) => {
    const entidade = semanticaPorRotulo.get(label);
    return entidade && entidade.sourceUrls.length ? [...entidade.sourceUrls].sort().join("|") : `rotulo:${label}`;
  };

  function agrupar<T extends { label: string; pages: number }>(itens: readonly T[]) {
    const grupos = new Map<string, T[]>();
    for (const item of itens) {
      const chave = coberturaDe(item.label);
      grupos.set(chave, [...(grupos.get(chave) || []), item]);
    }
    return [...grupos.values()].map(grupo => {
      const ordenado = [...grupo].sort((left, right) => right.pages - left.pages || right.label.length - left.label.length);
      return { representative: ordenado[0], companions: ordenado.slice(1).map(item => item.label) };
    });
  }

  let agrupou = false;
  const definitionRequirements: RadarDefinitionRequirement[] = [];
  for (const { representative: entidade, companions } of agrupar(entidadesSemanticas)) {
    if (companions.length) agrupou = true;
    if (radarSemanticIsNoise(entidade.label).noise) continue;
    if (entidade.pages < 2) continue;

    const dependentes = input.concepts.filter(concept =>
      radarSemanticStems(concept.canonicalLabel).includes(entidade.stem)
      && semanticos.get(concept.id)?.conceptType !== "ENTITY");
    const definidoPeloMercado = (input.semantic?.concepts || []).find(concept =>
      concept.conceptType === "ENTITY" && concept.sourceCount >= 2
      && radarSemanticStems(concept.canonicalLabel).includes(entidade.stem));

    /*
     * DEFINIR NÃO É FAZER GLOSSÁRIO.
     *
     * Um termo vira exigência de definição por uma de duas razões observáveis:
     * o mercado o define — e definir é o que a amostra mostra sendo feito —,
     * ou o resto do artigo depende dele para fazer sentido. Fora disso, a
     * definição é enfeite, e enfeite atrapalha quem já sabe o que o termo é.
     *
     * O ASSUNTO DO ARTIGO É O CASO ESPECIAL. Todo conceito da amostra depende
     * dele — é do que o artigo trata. Ler essa dependência como necessidade de
     * definição produziria a exigência de definir "pele oleosa" num artigo
     * sobre pele oleosa, com todos os conceitos listados como dependentes: uma
     * obviedade com aparência de requisito. Para o assunto, a definição só é
     * exigência quando a amostra mostra o mercado definindo-o.
     */
    const eOAssunto = entidade.relation === "same_as";
    if (!definidoPeloMercado && (eOAssunto || dependentes.length < 2)) continue;

    definitionRequirements.push({
      term: entidade.label,
      conceptId: definidoPeloMercado?.id || null,
      dependents: dependentes.map(item => item.canonicalLabel).slice(0, 6),
      pages: entidade.pages,
      sampleSize: amostra,
      reason: definidoPeloMercado
        ? `${definidoPeloMercado.sourceCount} de ${amostra} página(s) abrem uma seção para definir este termo: a definição é parte do que a busca espera encontrar.`
        : `${dependentes.length} conceito(s) da amostra dependem deste termo para fazer sentido; sem defini-lo, o restante fica apoiado em algo não explicado.`,
      origin: definidoPeloMercado ? "SERP" : "SEMANTIC_CONCEPT",
      basis: definidoPeloMercado ? "OBSERVED" : "DERIVED",
      confidence: entidade.pages >= maioria(amostra) ? "HIGH" : "MEDIUM",
      provenance: `Entidade "${entidade.label}"${companions.length ? ` (observada sempre junto de ${companions.join(", ")})` : ""} em ${entidade.pages} página(s)${definidoPeloMercado ? `, com conceito de definição ${definidoPeloMercado.id}` : ""}.`,
    });
  }

  /* -------------------------------- entidades ----------------------------- */

  const entityContext: RadarDiscoveryEntityContext = {
    primary: entidadePrincipal,
    related: input.entities.related.map(item => ({
      label: item.label,
      relation: "related_to",
      relatedTo: item.relatedTo,
      pages: item.pages,
      evidence: item.evidence,
    })),
    marketOnly: input.entities.marketOnly.map(item => ({ label: item.label, pages: item.pages, evidence: item.evidence })),
    /*
     * "SEBO" E "OLEOSIDADE" NÃO SÃO A MESMA COISA.
     *
     * A relação observada é de vizinhança, não de identidade. O artigo que usa
     * as duas como sinônimo perde exatamente a explicação que o leitor
     * procurava — e a leitura que o Gate 8 preservou existe para isso.
     */
    disambiguationNeeds: agrupar(input.entities.related)
      .filter(grupo => grupo.representative.pages >= 2)
      .map(({ representative, companions }) => ({
        label: representative.label,
        relatedTo: representative.relatedTo,
        reason: `Observada ao lado de ${representative.relatedTo || "o assunto do artigo"} sem partilhar raiz: o artigo precisa deixar a relação explícita em vez de tratar os dois termos como intercambiáveis.`,
        evidence: `${representative.evidence}${companions.length ? ` Termos observados sempre junto dela: ${companions.join(", ")}.` : ""}`,
      })),
  };

  const entityCoverageRequirements: RadarEntityCoverageRequirement[] = [];
  if (entidadePrincipal) {
    entityCoverageRequirements.push({
      label: entidadePrincipal,
      role: "PRIMARY",
      relation: "same_as",
      relatedTo: null,
      pages: input.entities.shared.find(item => item.label === entidadePrincipal)?.pages || 0,
      sampleSize: amostra,
      requirement: "A entidade central precisa ser nomeada explicitamente onde o texto fala dela, e não substituída por pronome quando o trecho precisa ser compreendido sozinho.",
      scope: "SHARED",
      origin: "ARTICLE_DNA",
      basis: "DERIVED",
      confidence: "HIGH",
      provenance: "Entidade central declarada pela composição do artigo.",
    });
  }
  for (const { representative: relacionada, companions } of agrupar(input.entities.related)) {
    if (companions.length) agrupou = true;
    /*
     * ENTIDADE DE SINAL FRACO NÃO VIRA EXIGÊNCIA.
     *
     * Um termo visto uma vez é fragmento com aparência de assunto. Ele
     * continua listado no contexto — o que não acontece é virar obrigação.
     */
    if (relacionada.pages < 2 || radarSemanticIsNoise(relacionada.label).noise) {
      excluded.push({ subject: relacionada.label, reason: `Entidade observada em ${relacionada.pages} página(s): sinal fraco demais para virar exigência de cobertura.` });
      continue;
    }
    const expressao = companions.length ? `${relacionada.label} (com ${companions.join(", ")})` : relacionada.label;
    entityCoverageRequirements.push({
      label: relacionada.label,
      role: "RELATED",
      relation: "related_to",
      relatedTo: relacionada.relatedTo,
      pages: relacionada.pages,
      sampleSize: amostra,
      requirement: `O artigo precisa nomear "${expressao}" e deixar explícita sua relação com ${relacionada.relatedTo || "o assunto"} — relação observada, não equivalência.`,
      scope: "SHARED",
      origin: "SERP",
      basis: "OBSERVED",
      confidence: relacionada.pages >= maioria(amostra) ? "HIGH" : "MEDIUM",
      provenance: `${relacionada.evidence}${companions.length ? ` Observada sempre junto de ${companions.join(", ")}: a amostra não separa os termos.` : ""}`,
    });
  }

  /* ---------------------------- relações conceituais ---------------------- */

  const assunto = entidadePrincipal || input.context.article.promise || "o assunto do artigo";
  const conceptRelations: RadarConceptRelation[] = [];
  for (const concept of input.concepts) {
    if (concept.sourceCount < 2 || !ancorado(concept.id)) continue;
    const kind = RELACAO_POR_TIPO[concept.conceptType];
    if (!kind) continue;
    conceptRelations.push({
      subject: concept.canonicalLabel,
      kind,
      object: assunto,
      pages: concept.sourceCount,
      sampleSize: amostra,
      evidence: concept.evidence,
      origin: "SEMANTIC_CONCEPT",
      basis: "OBSERVED",
      confidence: concept.confidence,
      provenance: `Leitura de tipo do conceito ${concept.id} (${concept.typeLabel}), sustentada por ${concept.sourceCount} página(s).`,
    });
  }
  for (const { representative: relacionada } of agrupar(input.entities.related)) {
    if (relacionada.pages < 2) continue;
    conceptRelations.push({
      subject: relacionada.label,
      kind: "RELATED_TO",
      object: relacionada.relatedTo || assunto,
      pages: relacionada.pages,
      sampleSize: amostra,
      evidence: relacionada.evidence,
      origin: "SEMANTIC_CONCEPT",
      basis: "OBSERVED",
      confidence: relacionada.pages >= maioria(amostra) ? "HIGH" : "MEDIUM",
      provenance: relacionada.evidence,
    });
  }
  for (const definicao of definitionRequirements) {
    /*
     * "TUDO DEPENDE DO ASSUNTO" NÃO É CONHECIMENTO.
     *
     * Quando o termo a definir é o próprio assunto do artigo, a dependência é
     * verdadeira e vazia: seis conceitos apontando para "pele oleosa" num
     * artigo sobre pele oleosa enchem a leitura sem dizer nada. A relação vale
     * quando o termo NÃO é o assunto — aí ela informa que aquele conceito se
     * apoia em algo que precisa estar explicado antes.
     */
    if (semanticaPorRotulo.get(definicao.term)?.relation === "same_as") continue;
    for (const dependente of definicao.dependents) {
      conceptRelations.push({
        subject: dependente,
        kind: "REQUIRES",
        object: definicao.term,
        pages: definicao.pages,
        sampleSize: amostra,
        evidence: definicao.reason,
        origin: "SEMANTIC_CONCEPT",
        basis: "DERIVED",
        confidence: definicao.confidence,
        provenance: definicao.provenance,
      });
    }
  }

  /* --------------------------- cobertura conceitual ----------------------- */

  const linhaDeConceito = (concept: RadarObservedConcept) => ({
    label: concept.canonicalLabel, pages: concept.sourceCount, evidence: concept.evidence,
  });
  const recorrentes = input.concepts.filter(item => item.status === "RECURRENT" || item.status === "CONFIRMED_BY_ARTICLE");
  const conceptCoverage = {
    core: recorrentes.filter(item => item.sourceCount >= maioria(amostra)).map(linhaDeConceito),
    supporting: recorrentes.filter(item => item.sourceCount < maioria(amostra)).map(linhaDeConceito),
    related: input.concepts.filter(item => !ancorado(item.id) && item.sourceCount >= 2).map(linhaDeConceito),
    undercovered: input.concepts.filter(item => item.status === "UNDERCOVERED").map(linhaDeConceito),
  };

  /* --------------------------- requisitos de leitura ---------------------- */

  const retrievabilityRequirements: RadarRetrievabilityRequirement[] = [];
  const observacoesDe = (conceptId: string) => semanticos.get(conceptId)?.supportingObservations || [];

  for (const unit of units) {
    if (unit.importance === "PERIPHERAL") continue;

    /*
     * RESPOSTA DIRETA NÃO TEM TAMANHO.
     *
     * Não existe número mágico de palavras: o que existe é a exigência de que
     * a necessidade seja respondida sem rodeio e sem depender do que veio
     * antes. Fixar tamanho aqui produziria um molde, e molde é o oposto do que
     * a diferenciação encontrada pela mesma investigação recomenda.
     */
    retrievabilityRequirements.push({
      kind: "DIRECT_ANSWER",
      subject: unit.questionOrNeed,
      requirement: `Reservar um trecho que responda "${unit.questionOrNeed}" com clareza, sem exigir a leitura das seções anteriores para ser compreendido.`,
      scope: "SHARED",
      origin: "SERP",
      basis: "OBSERVED",
      unitIds: [unit.id],
      evidence: unit.marketRecurrence.statement,
      provenance: unit.provenance.map(item => item.detail).join(" · "),
    });

    /* A amostra trata isto cedo? Só é oportunidade se a evidência mostrar. */
    const cedo = new Set(observacoesDe(unit.concept.id).filter(item => item.position <= 0.4).map(item => item.pageId));
    if (cedo.size >= maioria(amostra)) {
      retrievabilityRequirements.push({
        kind: "EARLY_ANSWER_OPPORTUNITY",
        subject: unit.questionOrNeed,
        requirement: "A amostra resolve esta necessidade na primeira metade do conteúdo: adiar a resposta colocaria o artigo atrás do que a busca já mostra. Onde exatamente ela entra é decisão do Planejador.",
        scope: "SHARED",
        origin: "SERP",
        basis: "OBSERVED",
        unitIds: [unit.id],
        evidence: `${cedo.size} de ${amostra} página(s) comparável(is) tratam desta necessidade na primeira metade do documento.`,
        provenance: `Posição das observações do conceito ${unit.concept.id} na amostra.`,
      });
    }

    if (unit.factualEvidenceRequirement.support !== "NOT_REQUIRED") {
      retrievabilityRequirements.push({
        kind: "SUPPORTED_CLAIM",
        subject: unit.questionOrNeed,
        requirement: "Afirmação factual sensível: precisa aparecer acompanhada da sustentação, com a fonte rastreável a partir do texto.",
        scope: "SHARED",
        origin: "FACTUAL_EVIDENCE",
        basis: "OBSERVED",
        unitIds: [unit.id],
        evidence: unit.factualEvidenceRequirement.reason,
        provenance: `Afirmação ${unit.factualEvidenceRequirement.claimId} da camada de autoridade, relevância ${unit.factualEvidenceRequirement.ymylRelevance}.`,
      });
    }

    /*
     * AS EXIGÊNCIAS DE CLAREZA SÓ SÃO EXIGÊNCIAS ONDE O ESTÁGIO AS PEDE.
     *
     * No topo, um artigo que não pode ser compreendido em trechos não cumpre a
     * própria função. Fora dele, a mesma orientação continua útil e deixa de
     * ser obrigação — impor o conjunto do topo a um artigo de decisão seria
     * aplicar um molde onde o funil declarou outra coisa.
     */
    if (required && unit.importance === "CORE") {
      const declaradoECoberto = unit.articleCoverage === "DECLARED" && unit.marketRecurrence.recurrence === "STRONG";
      retrievabilityRequirements.push({
        kind: "PASSAGE_INDEPENDENCE",
        subject: unit.concept.label,
        requirement: "O trecho que trata deste conceito precisa ser compreensível por si: nomear o assunto em vez de retomá-lo por referência, e não depender de \"como vimos anteriormente\" para dizer do que está falando.",
        scope: declaradoECoberto ? "AI_DISCOVERY" : "SHARED",
        origin: "SEMANTIC_CONCEPT",
        basis: "DERIVED",
        unitIds: [unit.id],
        evidence: unit.marketRecurrence.statement,
        provenance: `Conceito ${unit.concept.id}, necessidade central da amostra.`,
      });
    }
  }

  for (const definicao of definitionRequirements) {
    retrievabilityRequirements.push({
      kind: "DEFINITION_BEFORE_DEPTH",
      subject: definicao.term,
      requirement: `Definir "${definicao.term}" antes do que depende dele${definicao.dependents.length ? `: ${definicao.dependents.slice(0, 3).join(" · ")}` : ""}.`,
      scope: "SHARED",
      origin: definicao.origin,
      basis: definicao.basis,
      unitIds: units.filter(unit => unit.concept.id === definicao.conceptId).map(unit => unit.id),
      evidence: definicao.reason,
      provenance: definicao.provenance,
    });
  }

  for (const necessidade of entityContext.disambiguationNeeds) {
    retrievabilityRequirements.push({
      kind: "REFERENTIAL_CLARITY",
      subject: necessidade.label,
      requirement: `Onde a distinção entre "${necessidade.label}" e ${necessidade.relatedTo || "o assunto"} importa, nomear o referente em vez de depender de "isso" ou "esse processo".`,
      scope: "AI_DISCOVERY",
      origin: "SEMANTIC_CONCEPT",
      basis: "DERIVED",
      unitIds: [],
      evidence: necessidade.evidence,
      provenance: necessidade.reason,
    });
  }

  for (const requisito of entityCoverageRequirements) {
    retrievabilityRequirements.push({
      kind: "EXPLICIT_ENTITY",
      subject: requisito.label,
      requirement: requisito.requirement,
      scope: requisito.scope,
      origin: requisito.origin,
      basis: requisito.basis,
      unitIds: [],
      evidence: `${requisito.pages} de ${amostra} página(s) nomeiam esta entidade.`,
      provenance: requisito.provenance,
    });
  }

  /*
   * COMPARAÇÃO PRECISA DE CRITÉRIO, E CRITÉRIO PRECISA DE EVIDÊNCIA.
   *
   * Uma tabela sem dimensões observadas é uma grade vazia com aparência de
   * rigor. Os critérios daqui são os que a própria amostra usa para comparar.
   */
  const comparacoes = input.concepts.filter(item => item.conceptType === "COMPARISON" && item.sourceCount >= 2);
  const criterios = input.concepts
    .filter(item => (item.conceptType === "ATTRIBUTE" || item.conceptType === "BENEFIT" || item.conceptType === "PROBLEM") && item.sourceCount >= 2)
    .map(item => item.canonicalLabel);
  for (const comparacao of comparacoes) {
    retrievabilityRequirements.push({
      kind: "COMPARISON_CRITERIA",
      subject: comparacao.canonicalLabel,
      requirement: criterios.length
        ? `A comparação precisa declarar os critérios: ${criterios.slice(0, 4).join(" · ")}. Comparar sem critério explícito não é comparação.`
        : "A comparação precisa declarar por quais critérios os itens são comparados; a amostra não ofereceu dimensões recorrentes para reaproveitar.",
      scope: "SHARED",
      origin: "SERP",
      basis: "OBSERVED",
      unitIds: units.filter(unit => unit.concept.id === comparacao.id).map(unit => unit.id),
      evidence: comparacao.evidence,
      provenance: `Conceito de comparação ${comparacao.id}, com ${criterios.length} dimensão(ões) recorrente(s) na amostra.`,
    });
  }

  /*
   * O FORMATO SEGUE O TIPO DA INFORMAÇÃO, NUNCA O GOSTO PRESUMIDO DE UM
   * SISTEMA. Passo a passo é sequência; tabela é comparação dimensional; lista
   * é conjunto de itens discretos. Não havendo o tipo, não há recomendação.
   */
  const usaListas = input.presences?.find(item => item.key === "lists") || null;
  const usaTabelas = input.presences?.find(item => item.key === "tables") || null;
  for (const processo of input.concepts.filter(item => item.conceptType === "PROCESS" && item.sourceCount >= maioria(amostra))) {
    retrievabilityRequirements.push({
      kind: "STRUCTURED_FORMAT",
      subject: processo.canonicalLabel,
      requirement: "A informação é sequencial: passos ordenados comunicam melhor do que prosa corrida — e só se os passos existirem de fato.",
      scope: "SHARED",
      origin: "SERP",
      basis: "OBSERVED",
      unitIds: units.filter(unit => unit.concept.id === processo.id).map(unit => unit.id),
      evidence: usaListas
        ? `${processo.sourceCount} de ${amostra} página(s) tratam deste processo · ${usaListas.present} de ${usaListas.sampleSize} usam listas.`
        : `${processo.sourceCount} de ${amostra} página(s) tratam deste processo.`,
      provenance: `Conceito de processo ${processo.id}.`,
    });
  }
  for (const comparacao of comparacoes) {
    if (criterios.length < 2) continue;
    retrievabilityRequirements.push({
      kind: "STRUCTURED_FORMAT",
      subject: comparacao.canonicalLabel,
      requirement: `A informação é dimensional — ${criterios.length} critério(s) recorrente(s) sobre mais de um item —, e isso é o que uma tabela organiza.`,
      scope: "SHARED",
      origin: "SERP",
      basis: "OBSERVED",
      unitIds: units.filter(unit => unit.concept.id === comparacao.id).map(unit => unit.id),
      evidence: usaTabelas
        ? `${usaTabelas.present} de ${usaTabelas.sampleSize} página(s) comparável(is) usam tabela.`
        : `${comparacao.sourceCount} de ${amostra} página(s) comparam, sem tabela observada na amostra.`,
      provenance: `Conceito de comparação ${comparacao.id} com dimensões recorrentes.`,
    });
  }

  /* -------------------------- leitura interpretativa ---------------------- */

  const potentialClarityImprovements: RadarPotentialClarityImprovement[] = [];

  /*
   * A ÚNICA SUGESTÃO QUE ESTA CAMADA PRODUZ SOZINHA — e ela não é requisito.
   *
   * Muitas formulações distintas para a mesma necessidade é observação; dizer
   * "escolham um nome" é leitura nossa. A separação importa: o dia em que essa
   * frase virar exigência competitiva, uma opinião estará cobrando dívida em
   * nome do mercado.
   */
  for (const unit of units) {
    const variantes = semanticos.get(unit.concept.id)?.variants.length || 0;
    if (variantes < 3) continue;
    potentialClarityImprovements.push({
      subject: unit.concept.label,
      suggestion: `A amostra nomeia este conceito de ${variantes} formas distintas. Escolher um nome e mantê-lo do começo ao fim tende a ajudar quem lê e quem interpreta.`,
      basis: "HEURISTIC",
      note: "Leitura interpretativa: não é exigência competitiva e não foi observada como padrão da busca.",
      provenance: `Formulações do conceito ${unit.concept.id} no modelo semântico.`,
    });
  }

  for (const leitura of input.heuristicReadings || []) {
    const sustentado = retrievabilityRequirements.find(item =>
      item.basis === "OBSERVED"
      && (item.subject === leitura.subject
        || item.unitIds.some(id => units.find(unit => unit.id === id)?.concept.label === leitura.subject)));

    if (leitura.wouldSuppress && sustentado) {
      /*
       * A SERP NÃO PERDE PARA UMA LEITURA.
       *
       * O requisito permanece exatamente como estava. O que a divergência
       * produz é registro: os dois lados escritos, e a resolução pela
       * hierarquia congelada — nunca um requisito removido em silêncio.
       */
      const resolucao = resolveRadarEvidencePrecedence({
        domain: "COMPETITIVE",
        claims: [
          { source: "CURRENT_SUFFICIENT_SERP", claim: sustentado.requirement, provenance: sustentado.provenance },
          { source: "AI_INTERPRETATION", claim: leitura.reading, provenance: leitura.provenance },
        ],
      });
      assertRadarEvidenceAuthority(resolucao);
      conflicts.push(resolucao);
      continue;
    }

    potentialClarityImprovements.push({
      subject: leitura.subject,
      suggestion: leitura.reading,
      basis: "HEURISTIC",
      note: "Leitura interpretativa sem evidência competitiva: registrada como possibilidade, nunca como exigência.",
      provenance: leitura.provenance,
    });
  }

  /* --------------------------------- a matriz ----------------------------- */

  const todos: Array<{ scope: RadarDiscoveryScope }> = [...retrievabilityRequirements, ...questionCoverageRequirements];
  const matrix = {
    shared: todos.filter(item => item.scope === "SHARED").length,
    search: todos.filter(item => item.scope === "SEARCH").length,
    aiDiscovery: todos.filter(item => item.scope === "AI_DISCOVERY").length,
    note: "Um conjunto só de requisitos. A maioria serve às duas descobertas pela mesma razão: clareza. O que fica em busca é disputa de cobertura; o que fica em leitura por IA melhora a compreensão de um trecho isolado sem nada competitivo em jogo.",
  };

  const factualCoverage = {
    adequate: units.filter(item => item.factualEvidenceRequirement.support === "ADEQUATE").length,
    partial: units.filter(item => item.factualEvidenceRequirement.support === "PARTIAL").length,
    missing: units.filter(item => item.factualEvidenceRequirement.support === "MISSING").length,
    conflicted: units.filter(item => item.factualEvidenceRequirement.support === "CONFLICTED").length,
    notRequired: units.filter(item => item.factualEvidenceRequirement.support === "NOT_REQUIRED").length,
  };

  const specialistConnections = units
    .filter(unit => unit.specialistRequirement)
    .map(unit => ({
      unitId: unit.id,
      requirementId: unit.specialistRequirement?.requirementId || "",
      kind: unit.specialistRequirement?.kind || "",
      question: unit.specialistRequirement?.question || "",
    }));

  /* -------------------------------- limitações ---------------------------- */

  if (!input.semantic) limitations.push("Sem modelo semântico nesta versão: nenhuma necessidade pôde ser derivada da amostra.");
  if (agrupou) limitations.push("A extração lê entidades termo a termo, e expressões de mais de uma palavra chegam fragmentadas. Termos com cobertura idêntica na amostra foram tratados como uma expressão só, com os companheiros preservados na exigência.");
  if (!units.length) limitations.push("Nenhuma unidade de resposta foi sustentada pela amostra desta investigação.");
  if (factualCoverage.missing) limitations.push(`${factualCoverage.missing} necessidade(s) sensível(is) seguem sem fonte adequada: cobertura de mercado não as torna prontas.`);
  if (factualCoverage.conflicted) limitations.push(`${factualCoverage.conflicted} necessidade(s) carregam conflito aberto entre o que o mercado repete e o que a evidência permite afirmar.`);
  if (specialistConnections.length) limitations.push(`${specialistConnections.length} necessidade(s) dependem de contribuição profissional já preparada e ainda não recebida.`);

  const context: RadarAiDiscoveryContext = {
    binding, observedAt: input.observedAt, funnel, applicability, applicable, required, reason,
    answerableUnits: units,
    questions,
    questionCoverageRequirements,
    definitionRequirements,
    entityContext,
    entityCoverageRequirements,
    conceptRelations,
    conceptCoverage,
    retrievabilityRequirements,
    potentialClarityImprovements,
    matrix,
    factualCoverage,
    specialistConnections,
    conflicts,
    excluded,
    limitations,
  };

  assertRadarAiDiscoveryAuthority(context);
  return context;
}

/* ========================== a invariante que protege ==================== */

/**
 * O QUE NÃO PODE ACONTECER SEM QUE ALGUÉM VEJA.
 *
 * O risco não é alguém escrever "a heurística manda mais que a SERP". É um
 * requisito nascer de leitura interpretativa e chegar ao Planejador com a
 * mesma cara de um requisito observado — e ser tratado como dívida com o
 * mercado. Aqui isso é erro em tempo de execução.
 */
export function assertRadarAiDiscoveryAuthority(context: RadarAiDiscoveryContext): void {
  for (const requisito of context.retrievabilityRequirements) {
    if (requisito.basis === "HEURISTIC") {
      throw new Error(`RADAR_DISCOVERY_REQUIREMENT_WITHOUT_EVIDENCE: ${requisito.kind}`);
    }
    if (!requisito.provenance.trim()) throw new Error(`RADAR_DISCOVERY_PROVENANCE_LOST: ${requisito.kind}`);
  }
  for (const requisito of context.questionCoverageRequirements) {
    if (requisito.basis === "HEURISTIC") throw new Error(`RADAR_DISCOVERY_REQUIREMENT_WITHOUT_EVIDENCE: ${requisito.questionId}`);
    if (!requisito.provenance.trim()) throw new Error(`RADAR_DISCOVERY_PROVENANCE_LOST: ${requisito.questionId}`);
  }
  for (const requisito of context.entityCoverageRequirements) {
    if (requisito.basis === "HEURISTIC") throw new Error(`RADAR_DISCOVERY_REQUIREMENT_WITHOUT_EVIDENCE: ${requisito.label}`);
    if (!requisito.provenance.trim()) throw new Error(`RADAR_DISCOVERY_PROVENANCE_LOST: ${requisito.label}`);
  }
  for (const unit of context.answerableUnits) {
    if (!unit.provenance.length) throw new Error(`RADAR_DISCOVERY_PROVENANCE_LOST: ${unit.id}`);
    if (unit.provenance.some(item => !item.detail.trim())) throw new Error(`RADAR_DISCOVERY_PROVENANCE_LOST: ${unit.id}`);
  }
  for (const relacao of context.conceptRelations) {
    if (!relacao.provenance.trim()) throw new Error(`RADAR_DISCOVERY_PROVENANCE_LOST: ${relacao.subject}`);
  }
  for (const conflito of context.conflicts) assertRadarEvidenceAuthority(conflito);
}

/* ======================= a projeção que uma pessoa lê =================== */

/**
 * A MESMA CAMADA, EM LINGUAGEM DE QUEM OPERA.
 *
 * Derivada do mesmo objeto, nunca de um segundo cálculo. Nada de engenharia de
 * modelo aqui: quem lê quer saber o que o artigo precisa responder, o que
 * precisa definir e onde falta sustentação.
 */
export function radarAiDiscoveryLines(context: RadarAiDiscoveryContext): string[] {
  if (!context.applicable) return [context.reason];

  const top = <T,>(itens: readonly T[], limite: number) => itens.slice(0, limite);
  const linhas: string[] = [
    `Foco: descoberta na busca e compreensão por sistemas de leitura — o mesmo artigo, uma exigência só. ${context.required ? "Obrigatório neste estágio de funil." : "Aplicável como contexto neste estágio de funil."}`,
  ];

  const centrais = context.answerableUnits.filter(unit => unit.importance === "CORE");
  linhas.push(centrais.length ? "Perguntas centrais:" : "Nenhuma necessidade central foi sustentada pela amostra.");
  for (const unit of top(centrais, 5)) {
    linhas.push(`— ${unit.questionOrNeed} — ${unit.marketRecurrence.pages} de ${unit.marketRecurrence.sampleSize} concorrentes.`);
  }

  const claras = context.retrievabilityRequirements.filter(item => item.kind === "DIRECT_ANSWER");
  if (claras.length) {
    linhas.push("Conceitos que precisam de resposta clara:");
    for (const item of top(claras, 5)) linhas.push(`— ${item.subject}`);
  }

  linhas.push(context.definitionRequirements.length ? "Definições necessárias:" : "Nenhuma definição se mostrou necessária para compreender o restante.");
  for (const definicao of top(context.definitionRequirements, 4)) {
    linhas.push(`— ${definicao.term} — ${definicao.reason}`);
  }

  const relacoes = context.conceptRelations.filter(item => item.basis === "OBSERVED");
  if (relacoes.length) {
    linhas.push("Entidades e relações importantes:");
    for (const relacao of top(relacoes, 5)) {
      linhas.push(`— ${relacao.subject} ${RELACAO_LABEL[relacao.kind]} ${relacao.object} — ${relacao.pages} de ${relacao.sampleSize} página(s).`);
    }
  }

  linhas.push(`Cobertura factual: ${context.factualCoverage.adequate} sustentada(s) · ${context.factualCoverage.missing} sem fonte adequada · ${context.factualCoverage.conflicted} em conflito · ${context.specialistConnections.length} dependem do especialista.`);

  const prontas = context.answerableUnits.filter(unit => unit.readiness === "READY").length;
  linhas.push(`${prontas} de ${context.answerableUnits.length} necessidade(s) têm material suficiente para planejar uma resposta robusta.`);

  if (context.potentialClarityImprovements.length) {
    linhas.push("Oportunidades de clareza (leitura interpretativa, não exigência):");
    for (const item of top(context.potentialClarityImprovements, 3)) linhas.push(`— ${item.subject} — ${item.suggestion}`);
  }

  for (const conflito of context.conflicts) {
    linhas.push(`Divergência registrada: a observação prevalece sobre a leitura interpretativa, que fica no registro — ${conflito.overruled.map(item => item.claim).join(" · ")}`);
  }

  linhas.push(`Requisitos: ${context.matrix.shared} compartilhado(s) entre busca e leitura por IA · ${context.matrix.search} de cobertura competitiva · ${context.matrix.aiDiscovery} de clareza de trecho.`);
  return linhas;
}
