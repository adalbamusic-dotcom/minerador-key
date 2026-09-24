/**
 * ===== O ARTIGO-MODELO — RADAR_EDITORIAL_BLUEPRINT_1 · §2 a §12 =====
 *
 * ==================== O DEFEITO QUE ESTE MÓDULO FECHA ====================
 *
 * `buildRadarEditorialBlueprint` agrupa as necessidades por CONCEITO e emite um
 * bloco para cada grupo — todos eles, sem critério de promoção. No artigo real
 * de skincare isso produziu VINTE blocos editoriais, vários sustentados por uma
 * única página de dez: Pantenol, período menstrual, acne hormonal.
 *
 * A regra estava invertida:
 *
 *     SERP encontrou assunto  →  vira H2
 *
 * O que ela precisa ser:
 *
 *     ArticleDNA           define o território editorial permitido
 *          ↓
 *     Evidência do Radar   reforça · contradiz · amplia
 *          ↓
 *     SÍNTESE              agrupa, deduplica e DECIDE
 *          ↓
 *     Artigo-modelo
 *
 * ==================== EVIDENCE CANDIDATE ≠ EDITORIAL SECTION ====================
 *
 * §3 é a separação formal que faltava. Um candidato observado na SERP é
 * evidência; virar seção é uma DECISÃO, e ela precisa de justificativa. Os
 * candidatos que não são promovidos não somem — ficam classificados, com o
 * motivo, e continuam visíveis na evidência competitiva (§26: esconder não é
 * apagar).
 *
 * ==================== O QUE ESTE MÓDULO NÃO É ====================
 *
 * Não é o ContentPlan (§25). O Radar recomenda; o Planejador integra, prioriza
 * e decide. Os cabeçalhos aqui são DIREÇÃO e sugestão original — nunca a cópia
 * do concorrente (§10), que seria plagiar a arquitetura de quem já está lá.
 *
 * Domínio puro: sem fetch, sem storage, sem provider, sem React.
 */

import { radarSemanticStems } from "./semantic-concept-model.ts";
import { radarDeclaredArticleIntent } from "./editorial-identity.ts";
import {
  RADAR_SUBJECT_CRITERION,
  RADAR_SUBJECT_H1_FLOOR,
  RADAR_SUBJECT_MUST_COVER_REASON,
  RADAR_SUBJECT_NO_SIGNAL,
  radarIsSubjectTurnSection,
  radarSubjectCtaDirection,
  radarSubjectStems,
  radarSubjectTurnSectionId,
  radarSubjectTurnTitle,
  readRadarDeclaredSubjectInPages,
  type RadarDeclaredSubjectSampleReading,
} from "./declared-subject.ts";

import type { RadarArticleResearchContext } from "./article-research-context.ts";
import type { RadarCompetitiveObservedModel } from "./competitive-observed-model.ts";
import type { RadarEditorialBlueprint, RadarSectionCandidate } from "./editorial-blueprint.ts";
import type { RadarFactualSupportStatus } from "./ai-discovery-context.ts";

/* ============================ o que é entregue ========================== */

/**
 * §7 · O DESTINO DE CADA CANDIDATO — e nenhum deles é "sumiu".
 *
 * `PROMOTED` virou seção. `MERGED` entrou numa seção existente porque descreve
 * a mesma necessidade. Os outros quatro ficam FORA do artigo-modelo, cada um
 * pelo seu motivo — e é o motivo que permite discordar da decisão.
 */
export const RADAR_EDITORIAL_VERDICTS = [
  "PROMOTED", "MERGED", "SUPPORTING_NOTE", "OPTIONAL_EVIDENCE", "OUT_OF_SCOPE", "NEEDS_MORE_EVIDENCE",
] as const;
export type RadarEditorialVerdict = typeof RADAR_EDITORIAL_VERDICTS[number];

export const RADAR_EDITORIAL_VERDICT_LABEL: Record<RadarEditorialVerdict, string> = {
  PROMOTED: "No artigo-modelo",
  MERGED: "Absorvido por uma seção",
  SUPPORTING_NOTE: "Nota de apoio",
  OPTIONAL_EVIDENCE: "Evidência opcional",
  OUT_OF_SCOPE: "Fora do território do artigo",
  NEEDS_MORE_EVIDENCE: "Evidência insuficiente",
};

export type RadarEditorialCandidate = {
  id: string;
  /** Como a SERP formulou. Fica na evidência; NÃO vira cabeçalho (§10). */
  observedLabel: string;
  pages: number;
  sampleSize: number;
  /** O assunto cabe no território que o ArticleDNA declara? */
  dnaAligned: boolean;
  /** O ArticleDNA EXIGE este assunto — tópico declarado ou keyword da composição. */
  dnaRequired: boolean;
  /** O assunto serve a intenção declarada, ou pertence a outra? */
  intentFit: boolean;
  verdict: RadarEditorialVerdict;
  reason: string;
  /** A seção que o promoveu ou absorveu. */
  sectionId: string | null;
};

export type RadarEditorialLinkApplication = {
  /** O NOME do destino. Nunca `article:...:uuid` — §13. */
  destination: string;
  anchor: string;
  whereToApply: string;
  role: string;
};

/**
 * ===== 1.1 · §9 · A FUNÇÃO EDITORIAL DA SEÇÃO =====
 *
 * É ela que decide hierarquia. "Como controlar o brilho" e "Como escolher
 * produtos" são APLICAÇÕES da mesma rotina: lado a lado como H2 irmãos, o
 * artigo vira uma lista de perguntas soltas em vez de um argumento.
 */
export const RADAR_EDITORIAL_FUNCTIONS = ["DEFINITION", "APPLICATION", "EXPLANATION", "SELECTION", "COVERAGE"] as const;
export type RadarEditorialFunction = typeof RADAR_EDITORIAL_FUNCTIONS[number];

export type RadarEditorialSection = {
  id: string;
  level: 2 | 3;
  /** §21 · o H2 que hospeda esta seção. `null` quando ela é o próprio H2. */
  parentId: string | null;
  editorialFunction: RadarEditorialFunction;
  /** A DIRETIVA: o que este cabeçalho precisa fazer. */
  headingDirection: string;
  /** Uma formulação ORIGINAL. Nunca igual à do concorrente (§10). */
  headingSuggestion: string;
  /** §7 · a FUNÇÃO editorial da seção. Nunca uma contagem de páginas. */
  objective: string;
  readerQuestion: string;
  /**
   * §8 · A MENSAGEM, OU NADA.
   *
   * "O artigo precisa responder X de forma direta" é instrução de writer, não
   * mensagem-chave. Preencher o campo com isso enche a tela e não diz nada —
   * quando não há conteúdo factual para derivar uma mensagem, o campo fica
   * `null` e o que cobrir responde sozinho.
   */
  keyMessage: string | null;
  /** §6 · o que esta seção precisa cobrir, em pontos. */
  coveragePoints: string[];
  /** §9 e §13 · por que um assunto exigido pelo DNA está aqui dentro. */
  mustCoverReasons: string[];
  childSections: RadarEditorialSection[];
  evidenceStrength: "STRONG" | "MODERATE" | "DNA_REQUIRED";
  evidenceRefs: string[];
  factualSupport: RadarFactualSupportStatus;
  /** §15 · a dependência, dita. `null` quando a seção se sustenta. */
  factualRequirement: string | null;
  specialistRequirement: string | null;
  internalLinks: RadarEditorialLinkApplication[];
  mediaOpportunity: string[];
  reason: string;
};

/**
 * ===== O ASSUNTO NO ARTIGO-MODELO — SDD do Assunto, F3.1 =====
 *
 * O contrato que a F4 (export "Para escrever" e Redator) lê. Só existe com
 * Assunto declarado. Nada aqui decide a estrutura final: é a sugestão do
 * Radar, com a contagem ao lado, e o Redator decide (invariante 48).
 */
export type RadarEditorialSubjectTurn = {
  phrase: string;
  note: string | null;
  destinationUrl: string | null;
  criterion: typeof RADAR_SUBJECT_CRITERION;
  criterionLabel: string;
  /** As raízes procuradas na amostra: frase e nota, sem as da principal. */
  stems: string[];
  /**
   * A seção que carrega a virada. `OBSERVED_GROUP`: um bloco da amostra já
   * cobre o Assunto. `SYNTHETIC`: "Virada para <Assunto>", exigida sem
   * página. `placement` diz onde ela ficou: H3 de um anfitrião, ponto a cobrir
   * dentro de uma seção, H2 (só o bloco observado que a arquitetura manteve
   * como eixo) ou `ALONE` (a amostra não deu seção nenhuma para hospedá-la).
   */
  turnSection: {
    id: string;
    heading: string;
    source: "OBSERVED_GROUP" | "SYNTHETIC";
    pages: number;
    sampleSize: number;
    placement: "H2" | "H3" | "COVERAGE_POINT" | "ALONE";
    hostSectionId: string | null;
    hostHeading: string | null;
    mustCoverReason: string;
  };
  /**
   * Depois de qual seção a virada tende a caber. `null` sem sinal na SERP.
   * `SECTION_STEMS`: a seção do artigo-modelo que mais toca as raízes do
   * Assunto. `SAMPLE_ORDER`: o bloco que, nas páginas, vem logo antes do
   * cabeçalho que trata o Assunto.
   */
  suggestedPosition: {
    afterSectionId: string;
    afterHeading: string;
    pages: number;
    sampleSize: number;
    basis: "SECTION_STEMS" | "SAMPLE_ORDER";
  } | null;
  suggestedPositionLabel: string;
  /**
   * O complemento do H1. A principal continua dona do H1 (D1). `headingPages`
   * conta as páginas que tratam o Assunto em H2/H3: sem elas não há sinal para
   * dizer "Assunto em H2/H3", e a decisão volta a quem redige.
   */
  h1Complement: { suggested: boolean; complement: string | null; titlePages: number | null; headingPages: number | null; sampleSize: number; label: string };
  /** "aparece em N de M páginas", sobre a amostra lida. */
  sampleLabel: string;
  /** O alerta quando a sustentação não segura o Assunto. Também em `limitations`. */
  alert: string | null;
  /** "Levar o leitor a <destino>." — ao lado da chamada observada, nunca no lugar. */
  ctaDirection: string | null;
};

export type RadarEditorialArticleModel = {
  articleIdentity: {
    articleId: string;
    articleDnaVersionId: string;
    principalKeyword: string | null;
    intentLabel: string | null;
    funnelLabel: string | null;
    siloRole: string | null;
  };
  /** §1 · um título EDITORIAL utilizável. Nunca a instrução de como titular. */
  titleSuggestion: string;
  /** §1 · uma ou duas direções alternativas, quando a estrutura as sustenta. */
  titleAlternatives: string[];
  /** A instrução de titulação continua no contrato, fora da leitura normal. */
  titleDirection: string;
  editorialObjective: string;
  editorialAngle: string;
  readerPromise: string;
  opening: { hookDirection: string; promise: string; initialAnswer: string; transition: string };
  sections: RadarEditorialSection[];
  /**
   * `destinationDirection` só existe com Assunto que declara destino: é a
   * direção "levar o leitor a <destino>", AO LADO da chamada observada.
   */
  conclusion: { synthesis: string; nextStep: string; callToAction: string; destinationDirection?: string };
  internalLinkApplications: RadarEditorialLinkApplication[];
  evidenceNeeds: Array<{ subject: string; requirement: string }>;
  specialistNeeds: Array<{ subject: string; requirement: string }>;
  mediaPlan: Array<{ kind: string; subject: string; purpose: string }>;
  /** §11 · o plano visual em uma linha. O detalhe fica no disclosure. */
  mediaSummary: string | null;
  /** Todos os candidatos, com veredito. É a ponte para a evidência (§26). */
  candidates: RadarEditorialCandidate[];
  /** §22 · "Parcial" precisa dizer POR QUÊ. */
  readiness: { state: "READY" | "PARTIAL"; label: string; reasons: string[] };
  limitations: string[];
  /** Ausente sem Assunto: o modelo de quem não o tem fica byte a byte igual. */
  declaredSubject?: RadarEditorialSubjectTurn;
};

/* ============================== ferramentas ============================== */

const normalizar = (valor: string) =>
  valor.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();

const assinatura = (valor: string): string => {
  let hash = 0x811c9dc5;
  for (let index = 0; index < valor.length; index += 1) {
    hash ^= valor.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
};

/** Quantas páginas são "a maioria" desta amostra. */
const maioria = (amostra: number) => Math.max(2, Math.ceil(amostra / 2));

/**
 * §4 · EVIDÊNCIA SUFICIENTE NÃO É FREQUÊNCIA ISOLADA — é o piso dela.
 *
 * Duas páginas de dez é o mínimo para dizer que o assunto é do mercado e não de
 * um autor. Abaixo disso, só o ArticleDNA promove.
 */
const PISO_DE_EVIDENCIA = 2;

/**
 * VERBOS QUE NÃO CARREGAM ASSUNTO.
 *
 * "Pele oleosa: o que PODE ser?" e "O que É a pele oleosa?" são a mesma
 * necessidade definicional. Tratar `pode` como núcleo próprio abriria uma seção
 * inteira para a diferença entre "é" e "pode ser" — que é diferença de
 * formulação do concorrente, não de necessidade do leitor.
 *
 * A lista é curta e deliberada: só auxiliares e modais. Verbos que nomeiam uma
 * ação editorial — cuidar, controlar, escolher, hidratar — continuam separando.
 */
const VERBOS_SEM_ASSUNTO = new Set([
  "pode", "podem", "deve", "devem", "ser", "estar", "ter", "haver", "saber", "precis", "fica", "faz",
]);

/* ========================= o território do ArticleDNA ======================= */

/**
 * §2 · O NÚCLEO É O ARTICLEDNA, e ele define o que PODE entrar.
 *
 * O território são as raízes semânticas da promessa, da keyword principal, da
 * composição inteira e dos tópicos já declarados. Um candidato que não toca
 * nenhuma delas não é "um assunto fraco": é assunto de OUTRO artigo.
 */
function territorioDoArtigo(context: RadarArticleResearchContext) {
  const principal = context.keywords.find(item => item.identity.role === "principal") || null;
  const textos = [
    context.article.promise,
    ...context.resolvedKeywordTexts,
    ...context.editorialTopics,
    context.silo?.siloName || null,
  ].filter((valor): valor is string => Boolean(valor));

  const raizes = new Set(textos.flatMap(texto => radarSemanticStems(texto)));

  /*
   * ============ O QUE O DNA EXIGE — E O ASSUNTO DO ARTIGO NÃO EXIGE NADA ============
   *
   * Um tópico declarado como "identificação da pele oleosa" tem três raízes, e
   * duas delas — `pele`, `oleos` — são o assunto do artigo INTEIRO: qualquer
   * candidato que fale de pele oleosa casaria com elas.
   *
   * Com isso, "Pantenol na pele oleosa" viraria "exigido pelo ArticleDNA" e
   * entraria por uma porta feita para outra coisa. O que distingue um tópico
   * declarado é o que ele acrescenta ao assunto — `identificação` —, e é só
   * isso que conta como exigência.
   */
  const genericas = new Set(radarSemanticStems(principal?.identity.text || context.article.promise || ""));

  const exigidos: Array<{ texto: string; raizes: string[]; assunto?: true }> = context.editorialTopics
    .map(texto => ({ texto, raizes: radarSemanticStems(texto).filter(raiz => !genericas.has(raiz)) }))
    .filter(item => item.raizes.length > 0);

  /*
   * O ASSUNTO DECLARADO TAMBÉM É EXIGIDO — SDD do Assunto, F3.1.
   *
   * Pelas raízes distintivas da frase, como os tópicos. Um bloco da amostra que
   * as cobre todas ganha `dnaRequired` pelo caminho de sempre, com motivo
   * próprio. Frase sem raiz distintiva não entra: `every` sobre lista vazia
   * marcaria TODO candidato como exigido.
   */
  const assunto = radarSubjectStems(context);
  if (assunto?.phrase.length) exigidos.push({ texto: assunto.subject.phrase, raizes: assunto.phrase, assunto: true });

  return { principal, raizes, exigidos, genericas };
}

/**
 * §4 e §21 · A INTENÇÃO DECLARADA FILTRA O QUE A SERP OFERECE.
 *
 * Num artigo informacional de topo, "as melhores ofertas" é verdade sobre a
 * SERP e mentira sobre o artigo: ele não existe para vender. Este é o filtro
 * que impede a popularidade de um assunto comercial atropelar a intenção que o
 * Arquiteto fechou.
 */
const MARCAS_COMERCIAIS = [
  /\bofertas?\b/i, /\bpre(c|ç)os?\b/i, /\bcupom\b/i, /\bcomprar\b/i,
  /\bdesconto\b/i, /\bfrete\b/i, /\bmelhores\s+(produtos|marcas)\b/i,
];

function serveAIntencao(rotulo: string, intencao: string | null): boolean {
  const informacional = (intencao || "").toLowerCase().includes("informacional");
  if (!informacional) return true;
  return !MARCAS_COMERCIAIS.some(padrao => padrao.test(rotulo));
}

/* ============================ cabeçalho original =========================== */

/**
 * §10 · DIREÇÃO DE CABEÇALHO, NUNCA A CÓPIA.
 *
 * `canonicalLabel` é a formulação MAIS FREQUENTE entre os concorrentes — ou
 * seja, literalmente o H2 de alguém. Devolvê-la como recomendação entregaria ao
 * Redator a arquitetura de quem já está ranqueando, com o título e tudo.
 *
 * A saída é dupla e de propósito: a DIRETIVA diz o que o cabeçalho precisa
 * fazer, e a SUGESTÃO é uma formulação própria — verificada contra as variantes
 * observadas para não coincidir com nenhuma delas.
 */
function direcaoDeCabecalho(input: {
  rotulo: string;
  tipoLabel: string;
  variantesObservadas: string[];
  principal: string | null;
  /** A função já decidida — é ela que escolhe a FORMA do cabeçalho. */
  editorialFunction?: RadarEditorialFunction;
}): { direction: string; suggestion: string } {
  /* §14 · o cabeçalho sugerido nunca herda a caixa alta do concorrente. */
  const limpo = caixaEditorial(input.rotulo).replace(/\s*\?+\s*$/, "");
  const minusculo = limpo.charAt(0).toLowerCase() + limpo.slice(1);
  const maiusculo = (valor: string) => valor.charAt(0).toUpperCase() + valor.slice(1);

  /*
   * A DIRETIVA NOMEIA A NECESSIDADE — e nomear não é recomendar.
   *
   * Ela cita a necessidade como a amostra a formulou porque é disso que a
   * seção precisa dar conta. O que NÃO pode acontecer é essa frase virar o
   * cabeçalho sugerido: isso entregaria ao Redator o H2 de quem já está lá.
   */
  const direction = `Explicar ${minusculo} antes de aprofundar o que depende disso.`;

  /*
   * ============ AS FORMULAÇÕES PRÓPRIAS, EM ORDEM DE PREFERÊNCIA ============
   *
   * Cada padrão reescreve preservando a gramática: o que muda é o enquadramento
   * — "o que é" vira "o que caracteriza", uma pergunta de sim/não ganha o
   * "afinal" que ela sempre pede, um enunciado vira pergunta.
   *
   * São várias por padrão porque a primeira pode COLIDIR com o que um
   * concorrente já escreve — e aí a segunda entra. Sem essa escada, a única
   * saída seria uma frase genérica.
   */
  const definicao = /^o que (é|e|s(ã|a)o)\s+(.+)$/i.exec(limpo);
  /*
   * 1.4 · "COMO SURGE" É CAUSA, E O CABEÇALHO PRECISA SABER DISSO.
   *
   * O template de aplicação produzia "Como surge a acne hormonal NO DIA A DIA?"
   * — a frase promete passo a passo e entrega explicação. A função editorial já
   * foi decidida antes; aqui ela escolhe a FORMA.
   */
  const explicativo = input.editorialFunction === "EXPLANATION";
  const comoFazer = explicativo ? null : /^como\s+(.+)$/i.exec(limpo);
  /*
   * O VERBO DA CAUSA SAI COM A PERGUNTA.
   *
   * "Como surge a acne hormonal" com o template de explicação devolvia "O que
   * explica SURGE a acne hormonal". O que o cabeçalho precisa nomear é o
   * assunto — a acne hormonal —, não o verbo da formulação original.
   */
  const comoAcontece = explicativo
    ? /^como\s+(?:surge[m]?|se formam?|funciona[m]?|acontece[m]?|ocorre[m]?|age[m]?|afeta[m]?)\s+(.+)$/i.exec(limpo)
      || /^como\s+(.+)$/i.exec(limpo)
    : null;
  const qual = /^(qual|quais)\s+(é|e|s(ã|a)o)\s+(.+)$/i.exec(limpo);
  const oQue = /^o que\s+(.+)$/i.exec(limpo);
  const porQue = /^(por que|porque)\s+(.+)$/i.exec(limpo);
  const perguntaDeSimOuNao = input.rotulo.trim().endsWith("?");

  const candidatas = comoAcontece
    ? [`O que explica ${comoAcontece[1]}?`, `Por que ${comoAcontece[1]}?`, `${maiusculo(comoAcontece[1])}: o que está por trás`]
    : definicao
    ? [`O que caracteriza ${definicao[3]}?`, `O que define ${definicao[3]}?`, `${maiusculo(definicao[3])}: o que o leitor precisa entender?`]
    : comoFazer
      ? [`Como ${comoFazer[1]} no dia a dia?`, `Como ${comoFazer[1]} na prática?`, `${maiusculo(comoFazer[1])}: por onde começar?`]
      : qual
        ? [`O que explica ${qual[4]}?`, `${maiusculo(qual[4])}: o que considerar?`]
        : porQue
          ? [`O que explica ${porQue[2]}?`, `${maiusculo(porQue[2])}: por quê?`]
          : oQue
            ? [`Na prática, o que ${oQue[1]}?`, `${maiusculo(oQue[1])}: o que observar?`]
            : perguntaDeSimOuNao
              ? [`Afinal, ${minusculo}?`, `${limpo}: o que a evidência mostra?`]
              : [`O que considerar sobre ${minusculo}?`, `${limpo}: o que o artigo precisa cobrir`];

  /*
   * A ÚLTIMA TRAVA — §10.
   *
   * `canonicalLabel` é a formulação MAIS FREQUENTE entre os concorrentes: ela e
   * as variantes observadas estão fora, sempre. Se a escada inteira colidir, a
   * saída nomeia a necessidade sem imitar ninguém.
   */
  const observadas = new Set([input.rotulo, ...input.variantesObservadas].map(normalizar));
  const suggestion = candidatas.find(opcao => !observadas.has(normalizar(opcao)))
    || `${input.principal ? `${input.principal}: ` : ""}${minusculo}`;

  return { direction, suggestion };
}
/* ================================ a síntese =============================== */

type Grupo = {
  id: string;
  /** O que este grupo acrescenta ao assunto do artigo. */
  nucleo: string | null;
  raizes: Set<string>;
  candidatos: RadarSectionCandidate[];
  pages: number;
  dnaRequired: boolean;
  /** Exigido por um tópico declarado (requiredTopics/coverage). */
  topicRequired: boolean;
  /** Exigido pelo Assunto declarado — o motivo é outro (F3.1). */
  subjectRequired: boolean;
};

/**
 * §5 e §6 · AGRUPAR ANTES DE DECIDIR.
 *
 * "O que é pele oleosa?", "Como é a pele oleosa?" e "Pele oleosa: o que pode
 * ser?" não são três H2 — são uma necessidade editorial. A arquitetura do
 * artigo responde à INTENÇÃO; reproduzir a fragmentação dos concorrentes seria
 * herdar o defeito deles.
 *
 * O agrupamento é por raiz semântica compartilhada, e o limiar é maioria das
 * raízes do candidato menor: abaixo disso são assuntos vizinhos, não o mesmo.
 */
function agrupar(
  candidatos: RadarSectionCandidate[],
  exigidos: Array<{ raizes: string[]; assunto?: true }>,
  genericas: Set<string>,
): Grupo[] {
  const grupos: Grupo[] = [];

  for (const candidato of candidatos) {
    const todas = radarSemanticStems(candidato.workingTitle);
    const raizes = new Set(todas);
    if (!raizes.size) continue;

    /*
     * ============ AGRUPAR PELO QUE DISTINGUE, NÃO PELO ASSUNTO ============
     *
     * `pele` e `oleos` aparecem em dezoito dos vinte candidatos: agrupar por
     * raiz compartilhada colapsava o artigo INTEIRO num bloco só, e o líder
     * desse bloco passava a decidir a intenção de todos — inclusive das ofertas
     * comerciais, que herdavam a aprovação de "O que é a pele oleosa?".
     *
     * O que separa uma necessidade da outra é o VERBO/NÚCLEO que ela acrescenta
     * ao assunto: cuidar, controlar, hidratar, escolher. Candidatos sem núcleo
     * próprio são a necessidade DEFINICIONAL — e essas, sim, são uma só.
     */
    const distintivas = todas.filter(raiz => !genericas.has(raiz) && !VERBOS_SEM_ASSUNTO.has(raiz));
    const nucleo = distintivas[0] || null;

    const alvo = grupos.find(grupo => {
      if (grupo.nucleo === nucleo) return true;
      if (!nucleo || !grupo.nucleo) return false;
      /* Ou quando o que este candidato acrescenta cabe inteiro no do grupo. */
      return distintivas.length > 0 && distintivas.every(raiz => grupo.raizes.has(raiz));
    });

    /* A exigência é pelas raízes DISTINTIVAS do tópico, e todas elas. */
    const exigidoPeloTopico = exigidos.some(item => !item.assunto && item.raizes.every(raiz => raizes.has(raiz)));
    const exigidoPeloAssunto = exigidos.some(item => item.assunto && item.raizes.every(raiz => raizes.has(raiz)));
    const exigidoPeloDna = exigidoPeloTopico || exigidoPeloAssunto;

    if (alvo) {
      alvo.candidatos.push(candidato);
      for (const raiz of raizes) alvo.raizes.add(raiz);
      alvo.pages = Math.max(alvo.pages, candidato.marketEvidence.pages);
      alvo.dnaRequired = alvo.dnaRequired || exigidoPeloDna;
      alvo.topicRequired = alvo.topicRequired || exigidoPeloTopico;
      alvo.subjectRequired = alvo.subjectRequired || exigidoPeloAssunto;
      continue;
    }

    grupos.push({
      nucleo,
      id: `need:${assinatura(candidato.workingTitle)}`,
      raizes, candidatos: [candidato],
      pages: candidato.marketEvidence.pages,
      dnaRequired: exigidoPeloDna,
      topicRequired: exigidoPeloTopico,
      subjectRequired: exigidoPeloAssunto,
    });
  }

  return grupos;
}

/* ====================== 1.2 · a copy editorial ====================== */

/**
 * §4 · PONTO EDITORIAL, NÃO MATÉRIA-PRIMA.
 *
 * A necessidade chega como o concorrente a escreveu — "O QUE É A PELE OLEOSA?",
 * "Como cuidar da pele oleosa e com tendência a acne?" — e despejá-la na lista
 * "Cobrir" devolve ao Redator a mesma SERP que ele não precisa ler.
 *
 * A transformação é conservadora de propósito: minúscula, sem interrogação, e
 * "o que é" vira "o que caracteriza". Ela não inventa conteúdo — só troca a
 * roupa de pergunta de busca pela de item de pauta. A formulação original
 * continua inteira em "Ver evidências".
 */
/**
 * 1.3 · §14 · A CAIXA VEM DA SERP, E A SERP GRITA.
 *
 * O conceito canônico é a formulação mais frequente entre os concorrentes — e
 * muitos escrevem o H2 em caixa alta. Minusculizar só a primeira letra produzia
 * "pELE OLEOSA: O QUE PODE SER", que é pior do que o original.
 *
 * Quando o texto é predominantemente maiúsculo, ele é normalizado inteiro. O
 * original continua intacto na evidência, que é onde se confere o que a página
 * realmente escreveu.
 */
export function caixaEditorial(valor: string): string {
  const texto = valor.trim().replace(/\s+/g, " ");
  const letras = texto.replace(/[^A-Za-zÀ-ÿ]/g, "");
  if (!letras) return texto;
  const maiusculas = letras.replace(/[^A-ZÀ-Þ]/g, "").length;
  if (maiusculas / letras.length < 0.6) return texto;
  const minusculo = texto.toLowerCase();
  return minusculo.charAt(0).toUpperCase() + minusculo.slice(1);
}

/** de + a = da, de + o = do. A contração que falta deixa "características de a". */
const comDe = (resto: string): string => {
  const artigo = /^(as|os|a|o)\s+/i.exec(resto);
  if (!artigo) return `de ${resto}`;
  const contracao = { a: "da", o: "do", as: "das", os: "dos" }[artigo[1].toLowerCase()] || "de";
  return `${contracao} ${resto.slice(artigo[0].length)}`;
};

/**
 * ===== 1.4 · §4 · PONTO EDITORIAL, NÃO PERGUNTA DE BUSCA =====
 *
 * A necessidade chega como o concorrente escreveu — "O QUE É A PELE OLEOSA?",
 * "Pele oleosa: o que pode ser" — e uma lista "Cobrir" feita dessas frases
 * devolve ao Redator a SERP que ele não precisa ler.
 *
 * As transformações são poucas e determinísticas, e nenhuma inventa conteúdo:
 * a pergunta de definição vira o substantivo que ela pede, "quais são" perde o
 * interrogativo, e a formulação de cauda longa da SERP — "X: o que pode ser" —
 * é DESCARTADA, porque não é um ponto de pauta: é um artefato de busca.
 *
 * O texto original continua inteiro em "Ver evidências".
 */
export function pontoEditorial(rotulo: string): string | null {
  const limpo = caixaEditorial(rotulo).replace(/\s*\?+\s*$/, "").replace(/\s+/g, " ").trim();
  const minusculo = limpo.charAt(0).toLowerCase() + limpo.slice(1);

  /* Artefato de busca: "pele oleosa: o que pode ser", "X: o que é". */
  if (/:\s*(o que|como|quais)\b/i.test(minusculo)) return null;

  const definicao = /^o que (é|e|s(ã|a)o)\s+(.+)$/i.exec(minusculo);
  if (definicao) return `características ${comDe(definicao[3])}`;

  const quais = /^quais s(ã|a)o\s+(.+)$/i.exec(minusculo);
  if (quais) return quais[2];

  const oQue = /^o que\s+(.+)$/i.exec(minusculo);
  if (oQue) return oQue[1];

  return minusculo;
}

/**
 * 1.3 · §12 · MENSAGEM É CONTEÚDO — telemetria não é mensagem.
 *
 * `differentiation` do candidato carrega a evidência do modelo observado, e ela
 * vem escrita assim: "A busca evidencia a necessidade e apenas 3 de 10
 * página(s) a cobrem", "Sustentado por 3 páginas, 4 consultas". Isso responde
 * "por que confiamos", e estava ocupando a linha de mensagem-chave na leitura
 * editorial.
 *
 * Sem mensagem, o campo fica vazio — é o que §8 do 1.1 já decidiu. O texto
 * continua inteiro em "Ver evidências".
 */
const TELEMETRIA = [
  /\d+\s+de\s+\d+/i,
  /p(á|a)gina\(s\)|p(á|a)ginas\b/i,
  /consulta(s|\(s\))?\b/i,
  /formula(ç|c)(ã|a)o|formula(ç|c)(õ|o)es/i,
  /sustentad|recorre em|relacionado ao assunto declarado|a busca evidencia/i,
];

export function mensagemEditorial(valor: string | null | undefined): string | null {
  const texto = (valor || "").trim();
  if (!texto) return null;
  return TELEMETRIA.some(padrao => padrao.test(texto)) ? null : caixaEditorial(texto);
}

/**
 * 1.3 · §7 a §9 · A FACETA É UM CONCEITO COMPLETO, NÃO UM TOKEN.
 *
 * O título saía como "brilho, tipos e surge": palavras soltas tiradas do
 * radical de cada seção. Elas não dizem nada sozinhas — "surge" não é um
 * assunto, é um pedaço de verbo.
 *
 * A faceta é o NÚCLEO da necessidade, sem o assunto do artigo grudado no fim:
 * "controlar o brilho", "escolher produtos". Duas palavras no mínimo — abaixo
 * disso é fragmento, e fragmento volta a ser "tipos".
 */
const CONECTORES = new Set(["a", "o", "as", "os", "de", "da", "do", "das", "dos", "para", "em", "no", "na", "nos", "nas", "com", "e", "ou", "que", "se", "por"]);

function faceta(heading: string, genericas: Set<string>): string | null {
  const nucleo = nucleoDeAcao(heading)
    .replace(/\s+(no dia a dia|na pr(á|a)tica)$/i, "")
    .trim();

  /*
   * "PELE OLEOSA PRECISA DE HIDRATAÇÃO" É UMA FRASE, NÃO UMA FACETA.
   *
   * Numa lista — "cobrindo X, Y e Z" — ela não encaixa. A gramática já diz qual
   * é o assunto: o complemento depois de "precisa de". Ele é substantivo por
   * construção, e por isso pode vir sozinho onde um token solto não poderia.
   */
  const complemento = /\b(precisa|precisam|exige|exigem|pede|pedem|depende|dependem)\s+de\s+(.+)$/i.exec(nucleo);
  if (complemento) {
    const alvo = complemento[2].trim().toLowerCase();
    if (alvo.length > 3) return alvo;
  }

  const palavras = nucleo.split(/\s+/).filter(Boolean);
  while (palavras.length > 2) {
    const ultima = palavras[palavras.length - 1].toLowerCase().replace(/[^0-9a-zà-ÿ]/gi, "");
    const raiz = radarSemanticStems(ultima)[0];
    /* Corta a cauda que só repete o assunto do artigo: "…da pele oleosa". */
    if (CONECTORES.has(ultima) || (raiz && genericas.has(raiz))) { palavras.pop(); continue; }
    break;
  }
  /*
   * "CUIDAR DE" NÃO É UMA FACETA.
   *
   * Depois de cortar a cauda que repetia o assunto, a preposição fica solta no
   * fim — e duas palavras, uma delas "de", continua sendo fragmento. O conector
   * sai mesmo abaixo do piso, e o que sobrar precisa ter duas palavras REAIS.
   */
  while (palavras.length && CONECTORES.has(palavras[palavras.length - 1].toLowerCase())) palavras.pop();

  const texto = palavras.join(" ").trim();
  const substantivas = palavras.filter(palavra => !CONECTORES.has(palavra.toLowerCase())).length;
  return substantivas >= 2 && texto.length > 5 ? texto.toLowerCase() : null;
}

/**
 * O NÚCLEO DE AÇÃO DE UM CABEÇALHO — "cuidar de pele oleosa no dia a dia".
 *
 * É o que permite compor título, direção e promessa sem repetir a pergunta
 * inteira e sem inventar um verbo que a evidência não sustenta.
 */
function nucleoDeAcao(heading: string): string {
  /* §14 · a caixa da SERP não atravessa para o título, a direção nem a promessa. */
  const limpo = caixaEditorial(heading).replace(/\s*\?+\s*$/, "");
  const semComo = /^como\s+/i.test(limpo) ? limpo.replace(/^como\s+/i, "") : limpo;
  const semAfinal = semComo.replace(/^afinal,\s*/i, "").replace(/^na prática,\s*/i, "");
  return semAfinal.charAt(0).toLowerCase() + semAfinal.slice(1);
}


/**
 * §8 · ISTO É UM IDENTIFICADOR TÉCNICO?
 *
 * `article:article-candidate:territory:9da03dd0-…`, um UUID cru, um hash. O
 * teste é de FORMA, não de prefixo conhecido: um esquema novo de id que ninguém
 * lembrou de listar continuaria vazando.
 */
export function pareceIdentificador(valor: string): boolean {
  const texto = valor.trim();
  if (!texto) return true;
  return /[0-9a-f]{8}-[0-9a-f]{4}/i.test(texto)
    || /^[a-z]+:[a-z-]+:/i.test(texto)
    || /^[0-9a-f]{16,}$/i.test(texto)
    || /^(sha256|hash|bundle)[:-]/i.test(texto);
}

export const emLista = (itens: string[]): string =>
  itens.length <= 1 ? (itens[0] || "")
    : `${itens.slice(0, -1).join(", ")} e ${itens[itens.length - 1]}`;

/* ========================= 1.1 · função e hierarquia ======================= */

/**
 * §9 · A FUNÇÃO SAI DA FORMA DA NECESSIDADE.
 *
 * Não é adivinhação: "o que é" pede fundamento, "como" pede aplicação, "por
 * que / o que piora / relação entre" pede explicação, "escolher / qual" pede
 * critério de decisão. É a mesma leitura que um editor faz ao bater o olho.
 */
function funcaoEditorial(rotulo: string): RadarEditorialFunction {
  const limpo = rotulo.trim().toLowerCase();
  /*
   * `\b` NÃO FECHA DEPOIS DE ACENTO.
   *
   * A fronteira de palavra do JavaScript é ASCII: entre "é" e o espaço não há
   * `\b`, e `^o que é\b` nunca casava. O resultado era a seção definicional
   * classificada como COVERAGE — e, com ela fora do lugar, o título e a direção
   * do artigo perdiam o fundamento que deveriam nomear.
   */
  if (/^o que (é|e|s(ã|a)o)\s/.test(limpo)) return "DEFINITION";
  if (/\b(escolher|escolha|melhor(es)?|qual produto|quais produtos)\b/.test(limpo)) return "SELECTION";
  /*
   * 1.3 · §10 · "COMO SURGE" NÃO É APLICAÇÃO — é causa.
   *
   * "Como surge a acne hormonal?" começa com "como" e caía em APPLICATION: por
   * isso o runtime pendurou a acne hormonal dentro do passo a passo da rotina,
   * que é justamente o exemplo que §5 do 1.2 proíbe. O verbo é que decide —
   * surgir, funcionar, acontecer e formar-se descrevem como algo ACONTECE, não
   * o que o leitor deve fazer.
   */
  if (/^como\s+(surge|surgem|se forma|se formam|funciona|funcionam|acontece|acontecem|ocorre|ocorrem|age|agem|afeta|afetam)\b/.test(limpo)) return "EXPLANATION";
  if (/^como\b/.test(limpo)) return "APPLICATION";
  if (/^(por que|porque)\b/.test(limpo) || /\b(rela(ç|c)(ã|a)o|piora|causa|provoca)\b/.test(limpo)) return "EXPLANATION";
  return "COVERAGE";
}

/**
 * §7 · O OBJETIVO É EDITORIAL, E NUNCA UMA CONTAGEM.
 *
 * O builder de candidatos devolve `conceito.evidence` como propósito — isto é,
 * "Observado em 7 de 10 páginas, sob 9 formulações". Isso responde "por que
 * confiamos", não "para que serve esta seção no artigo".
 */
const OBJETIVO_POR_FUNCAO: Record<RadarEditorialFunction, string> = {
  DEFINITION: "Dar ao leitor o fundamento necessário antes das recomendações práticas.",
  APPLICATION: "Transformar o fundamento em aplicação: o que fazer, em que ordem.",
  EXPLANATION: "Explicar a causa por trás do que o leitor observa, para a recomendação fazer sentido.",
  SELECTION: "Dar critério de escolha, para o leitor decidir sozinho depois da leitura.",
  COVERAGE: "Cobrir um ponto que o leitor procura e que a concorrência responde.",
};

/**
 * ============ §10 · A SEGUNDA PASSADA: QUEM DEPENDE DE QUEM ============
 *
 * Oito H2 irmãos descrevem oito perguntas, não um artigo. Controlar o brilho e
 * escolher produtos são PARTES de montar a rotina; um assunto que o ArticleDNA
 * exige mas a amostra quase não sustenta é um ponto dentro de uma seção, não um
 * eixo do artigo (§9 e §13).
 *
 * A passada é determinística e conservadora: só aninha quando há um pai claro —
 * a aplicação mais sustentada — ou quando duas seções compartilham um tema
 * próprio. Na dúvida, a seção continua H2: rebaixar por engano esconde um eixo
 * real, e isso é pior do que uma lista um pouco mais longa.
 */
function hierarquizar(
  secoes: RadarEditorialSection[],
  raizesPorSecao: Map<string, Set<string>>,
  /** O assunto do artigo, como ele nomeia um bloco: "pele oleosa". */
  assuntoDoArtigo: string | null,
): { arvore: RadarEditorialSection[]; pontos: Map<string, string> } {
  /* Qual tema fez cada anfitrião adotar as irmãs — é ele que nomeia o bloco. */
  const temaDoGrupo = new Map<string, string>();
  if (secoes.length < 3) return { arvore: secoes, pontos: new Map() };

  const forca = (secao: RadarEditorialSection) =>
    (secao.evidenceStrength === "STRONG" ? 2 : secao.evidenceStrength === "MODERATE" ? 1 : 0);

  /*
   * FUNDAMENTO NÃO DESCE PARA DEBAIXO DE APLICAÇÃO.
   *
   * Definir e explicar vêm ANTES de recomendar — é a ordem do argumento, não
   * uma preferência. Sem esta trava, a explicação da relação entre oleosidade e
   * acne virava etapa da rotina porque as duas compartilham a palavra "acne", e
   * o artigo passava a explicar a causa no meio do passo a passo.
   */
  const RANK: Record<RadarEditorialFunction, number> = {
    DEFINITION: 0, EXPLANATION: 1, APPLICATION: 2, SELECTION: 3, COVERAGE: 4,
  };
  const podeHospedar = (anfitriao: RadarEditorialSection, filho: RadarEditorialSection) =>
    RANK[anfitriao.editorialFunction] <= RANK[filho.editorialFunction];

  const paiDe = new Map<string, string>();

  /*
   * 1 · O EIXO PRÁTICO ABSORVE AS APLICAÇÕES.
   *
   * Entre as seções de aplicação e de escolha, a mais sustentada vira o eixo —
   * "como cuidar" — e as demais viram etapas dele. Sem isto, o leitor recebe
   * quatro perguntas paralelas sobre a mesma rotina.
   */
  const praticas = secoes.filter(item => item.editorialFunction === "APPLICATION" || item.editorialFunction === "SELECTION");
  const eixo = [...praticas].sort((esquerda, direita) => forca(direita) - forca(esquerda))[0] || null;
  if (eixo && praticas.length >= 2) {
    for (const secao of praticas) if (secao !== eixo) paiDe.set(secao.id, eixo.id);
  }

  /*
   * 2 · TEMA PRÓPRIO COMPARTILHADO TAMBÉM AGRUPA.
   *
   * Duas seções que falam de `acne` pertencem ao mesmo bloco do artigo, ainda
   * que uma explique e a outra descreva. A mais sustentada hospeda a outra.
   */
  const porTema = new Map<string, RadarEditorialSection[]>();
  for (const secao of secoes) {
    if (paiDe.has(secao.id)) continue;
    for (const raiz of raizesPorSecao.get(secao.id) || []) {
      porTema.set(raiz, [...(porTema.get(raiz) || []), secao]);
    }
  }
  for (const [raiz, doTema] of porTema) {
    if (doTema.length < 2) continue;

    /*
     * O ANFITRIÃO DO TEMA É QUEM MAIS SE DEFINE POR ELE.
     *
     * Ordenar por evidência escolhia a rotina — `acne` aparece nela de
     * passagem, vindo de uma variante absorvida — e pendurava ali a explicação
     * da acne e os tipos de acne. A proporção responde certo: `acne` é metade
     * das raízes da explicação e um quarto das da rotina.
     *
     * No empate, quem EXPLICA hospeda quem apenas cobre: é a ordem do
     * argumento, a mesma que impede fundamento descer para debaixo de aplicação.
     */
    const proporcao = (item: RadarEditorialSection) => {
      const dele = raizesPorSecao.get(item.id) || new Set<string>();
      return dele.size && dele.has(raiz) ? 1 / dele.size : 0;
    };
    const anfitriao = [...doTema].sort((esquerda, direita) =>
      RANK[esquerda.editorialFunction] - RANK[direita.editorialFunction]
      || proporcao(direita) - proporcao(esquerda)
      || forca(direita) - forca(esquerda))[0];

    for (const secao of doTema) {
      if (secao === anfitriao || paiDe.has(secao.id) || paiDe.get(anfitriao.id)) continue;
      if (!temaDoGrupo.has(anfitriao.id)) temaDoGrupo.set(anfitriao.id, raiz);
      /*
       * O EIXO PRÁTICO NÃO DESCE POR TEMA.
       *
       * Ele compartilha palavras com quase tudo — foi construído absorvendo as
       * variantes. Deixá-lo virar filho de uma explicação que menciona a mesma
       * palavra enterraria a parte do artigo que o leitor veio buscar.
       */
      if (secao === eixo) continue;
      /*
       * A COMPATIBILIDADE JÁ ESTÁ NA ESCOLHA DO ANFITRIÃO — ele é o de MENOR
       * rank do tema. A checagem fica assim mesmo: se a ordenação mudar, é ela
       * que impede fundamento descer para debaixo de aplicação em silêncio.
       */
      if (!podeHospedar(anfitriao, secao)) continue;
      paiDe.set(secao.id, anfitriao.id);
    }
  }

  /*
   * ====== 3 · 1.2 · §5 e §6 · O LUGAR DO QUE O DNA EXIGE ======
   *
   * `MUST_COVER` diz que o assunto precisa ser coberto. Onde ele entra é
   * decisão de arquitetura, e ela tem DUAS saídas — não uma:
   *
   *   · quando o assunto pertence ao tema de uma seção, ele vira H3 dela.
   *     "Acne hormonal" sob "a relação entre oleosidade e acne" é subtema do
   *     mesmo bloco; é isso que §5 chama de coerente.
   *
   *   · quando não pertence a tema nenhum, ele vira um PONTO A COBRIR dentro do
   *     eixo compatível. Proteção solar com uma página de dez não é subtema de
   *     nada — é um item da rotina, e um H3 para ele daria a um item de lista o
   *     peso de um bloco.
   *
   * O que a regra NÃO faz é pendurar o assunto em qualquer lugar: sem anfitrião
   * compatível, ele permanece como eixo. Esconder cobertura exigida é pior do
   * que uma lista um pouco mais longa.
   */
  const pontos = new Map<string, string>();

  for (const secao of secoes) {
    if (secao.evidenceStrength !== "DNA_REQUIRED" || paiDe.has(secao.id)) continue;
    const minhasRaizes = raizesPorSecao.get(secao.id) || new Set<string>();

    /*
     * O ANFITRIÃO É O QUE MAIS SE DEFINE PELO TEMA, não o mais forte.
     *
     * "Acne hormonal" divide a palavra `acne` com duas seções: a rotina, onde
     * ela aparece de passagem, e a explicação da relação entre oleosidade e
     * acne, que é SOBRE isso. Ordenar por evidência escolhia a rotina — e o
     * artigo passava a explicar hormônio no meio do passo a passo, que é o
     * exemplo que §5 proíbe.
     *
     * A proporção responde certo: `acne` é metade das raízes da explicação e um
     * quarto das da rotina.
     */
    const afinidade = (item: RadarEditorialSection) => {
      const dele = raizesPorSecao.get(item.id) || new Set<string>();
      const comuns = [...dele].filter(raiz => minhasRaizes.has(raiz)).length;
      return dele.size ? comuns / dele.size : 0;
    };

    const doMesmoTema = secoes
      .filter(item => item !== secao && !paiDe.has(item.id) && podeHospedar(item, secao))
      .filter(item => afinidade(item) > 0)
      .sort((esquerda, direita) => afinidade(direita) - afinidade(esquerda) || forca(direita) - forca(esquerda))[0] || null;

    if (doMesmoTema) { paiDe.set(secao.id, doMesmoTema.id); continue; }

    const compativel = (eixo && eixo !== secao && podeHospedar(eixo, secao) ? eixo : null)
      || secoes.find(item => item !== secao && !paiDe.has(item.id) && podeHospedar(item, secao) && forca(item) === 2)
      || null;
    if (compativel) pontos.set(secao.id, compativel.id);
  }

  /* Ninguém é pai e filho ao mesmo tempo: dois níveis, nunca três. */
  for (const [filho, pai] of [...paiDe]) if (paiDe.has(pai)) paiDe.delete(filho);

  const porId = new Map(secoes.map(item => [item.id, item]));
  const resultado: RadarEditorialSection[] = [];

  for (const secao of secoes) {
    if (pontos.has(secao.id)) continue;
    const paiId = paiDe.get(secao.id);
    if (paiId && porId.has(paiId)) continue;

    /* O que virou ponto entra na cobertura do anfitrião, com o motivo. */
    const absorvidosComoPonto = [...pontos.entries()]
      .filter(([, hospedeiro]) => hospedeiro === secao.id)
      .map(([origem]) => porId.get(origem))
      .filter((item): item is RadarEditorialSection => Boolean(item));

    const filhos = secoes.filter(item => paiDe.get(item.id) === secao.id);

    const pai: RadarEditorialSection = {
      ...secao,
      level: 2,
      parentId: null,
      coveragePoints: [...secao.coveragePoints, ...absorvidosComoPonto.flatMap(item => item.coveragePoints)],
      mustCoverReasons: [...secao.mustCoverReasons, ...absorvidosComoPonto.flatMap(item => item.mustCoverReasons)],
      evidenceRefs: [...secao.evidenceRefs, ...absorvidosComoPonto.flatMap(item => item.evidenceRefs)],
      childSections: filhos.map(item => ({ ...item, level: 3 as const, parentId: secao.id })),
    };

    /*
     * ===== 1.4 · §5 · O PAI PRECISA REPRESENTAR O TERRITÓRIO =====
     *
     * Quando uma seção adota duas ou mais irmãs do mesmo tema, ela deixa de ser
     * só uma necessidade: virou o bloco do artigo sobre aquele assunto. E aí o
     * cabeçalho dela mente — "O que causa acne?" com três filhas sobre acne diz
     * que o bloco é sobre causas, quando ele é sobre a relação inteira.
     *
     * O guarda-chuva nasce com o nome do território — o assunto do artigo mais
     * o tema compartilhado — e a necessidade original desce para a primeira
     * subseção, onde ela continua inteira. Nada é perdido; o que muda é quem
     * nomeia o bloco.
     */
    const tema = temaDoGrupo.get(secao.id);
    /*
     * O TEMA VEM COMO RADICAL — "acne", mas também "hidrat", "relac".
     *
     * O rótulo é lido por gente: ele precisa da palavra como ela aparece nos
     * cabeçalhos, não do radical. Sem isso o bloco se chamaria "pele oleosa e
     * hidrat".
     */
    const temaLegivel = tema
      ? [secao, ...filhos]
        .flatMap(item => item.headingSuggestion.split(/[^0-9A-Za-zÀ-ÿ]+/))
        .filter(Boolean)
        .find(palavra => radarSemanticStems(palavra)[0] === tema)
      : null;

    if (filhos.length >= 2 && temaLegivel && assuntoDoArtigo) {
      const rotulo = `${assuntoDoArtigo} e ${temaLegivel.toLowerCase()}`;
      resultado.push({
        ...pai,
        id: `section:umbrella:${assinatura(rotulo)}`,
        editorialFunction: "COVERAGE",
        headingSuggestion: rotulo.charAt(0).toUpperCase() + rotulo.slice(1),
        headingDirection: `Tratar ${rotulo} como um bloco só, em vez de espalhar o assunto por seções irmãs.`,
        objective: `Reunir o que o artigo precisa dizer sobre ${rotulo}.`,
        keyMessage: null,
        coveragePoints: [],
        reason: `Bloco formado por ${filhos.length + 1} necessidades que compartilham o mesmo tema.`,
        childSections: [pai, ...pai.childSections].map(item => ({ ...item, level: 3 as const, parentId: `section:umbrella:${assinatura(rotulo)}`, childSections: [] })),
      });
      continue;
    }

    resultado.push(pai);
  }

  return { arvore: resultado, pontos };
}

const ROTULO_FACTUAL: Record<RadarFactualSupportStatus, string | null> = {
  ADEQUATE: null,
  PARTIAL: "Precisa de fonte: a sustentação atual cobre só parte da afirmação.",
  MISSING: "Precisa de fonte: nenhuma sustentação adequada foi encontrada nesta investigação.",
  CONFLICTED: "Precisa de revisão: as fontes encontradas se contradizem.",
  NOT_REQUIRED: null,
};

/**
 * ===== A VIRADA PARA O ASSUNTO — SDD do Assunto, F3.1 =====
 *
 * `MUST_COVER ≠ MUST_BE_H2`, também aqui. A seção da virada é exigida — mesmo
 * sem página nenhuma da amostra — e o lugar dela segue a regra do que o DNA
 * exige (§5 e §6 do 1.2): H3 do anfitrião do mesmo tema, ou ponto a cobrir no
 * eixo compatível. A diferença é uma só, e declarada: a virada nunca fica como
 * H2 por falta de anfitrião enquanto existir seção onde ela caiba, porque um
 * eixo próprio para o tronco seria decreto, não arquitetura.
 *
 * O anfitrião é a seção que mais toca as raízes do Assunto — a mesma que a
 * posição sugerida nomeia —, para a estrutura e a sugestão dizerem a mesma
 * coisa. Sem toque, a virada vira ponto do eixo prático.
 *
 * Nada aqui toca principal, papéis ou o ArticleDNA: é leitura, não decisão.
 */
function viradaDoAssunto(input: {
  context: RadarArticleResearchContext;
  observed: RadarCompetitiveObservedModel;
  sections: readonly RadarEditorialSection[];
  arvore: RadarEditorialSection[];
  pontos: Map<string, string>;
  raizesPorSecao: Map<string, Set<string>>;
  paginasPorSecao: Map<string, number>;
  secoesDoAssunto: ReadonlyArray<{ id: string; pages: number }>;
  candidates: readonly RadarEditorialCandidate[];
  amostra: number;
  principal: string | null;
}): { arvore: RadarEditorialSection[]; turn: RadarEditorialSubjectTurn; limitations: string[] } | null {
  const raizes = radarSubjectStems(input.context);
  if (!raizes) return null;
  const { subject } = raizes;
  const leitura: RadarDeclaredSubjectSampleReading = input.observed.declaredSubject
    || readRadarDeclaredSubjectInPages({ context: input.context, pages: [] })!;
  const procuradas = new Set(raizes.reading);
  const limitations: string[] = leitura.alert ? [leitura.alert] : [];
  const amostra = input.amostra;

  const paiDe = new Map<string, RadarEditorialSection>();
  for (const secao of input.arvore) for (const filho of secao.childSections) paiDe.set(filho.id, secao);
  const todas = input.arvore.flatMap(secao => [secao, ...secao.childSections]);
  const porId = new Map([...input.sections, ...todas].map(secao => [secao.id, secao]));

  const forca = (secao: RadarEditorialSection) =>
    (secao.evidenceStrength === "STRONG" ? 2 : secao.evidenceStrength === "MODERATE" ? 1 : 0);
  const toque = (secao: RadarEditorialSection) =>
    [...(input.raizesPorSecao.get(secao.id) || [])].filter(raiz => procuradas.has(raiz)).length;

  type Posicao = { secao: RadarEditorialSection; pages: number; sampleSize: number; basis: "SECTION_STEMS" | "SAMPLE_ORDER" };

  /* A seção da amostra que mais toca as raízes do Assunto, com as páginas dela. */
  const porRaizes = (excluir: string | null): Posicao | null => {
    const melhor = todas
      .filter(secao => secao.id !== excluir && !radarIsSubjectTurnSection(secao.id))
      .map(secao => ({ secao, toque: toque(secao), pages: input.paginasPorSecao.get(secao.id) ?? 0 }))
      .filter(item => item.toque > 0)
      .sort((esquerda, direita) => direita.toque - esquerda.toque || direita.pages - esquerda.pages)[0] || null;
    return melhor ? { secao: melhor.secao, pages: melhor.pages, sampleSize: amostra, basis: "SECTION_STEMS" } : null;
  };

  /*
   * Sem seção que toque o Assunto, a ORDEM das páginas ainda fala: o bloco que
   * vem logo antes do cabeçalho do Assunto. A formulação é do concorrente e só
   * serve para achar a seção do artigo-modelo que a absorveu.
   */
  const pelaOrdem = (excluir: string | null): Posicao | null => {
    const sinal = leitura.placementSignal;
    if (!sinal) return null;
    const chave = normalizar(sinal.precedingHeading);
    const alvo = input.candidates.find(item => item.sectionId && normalizar(item.observedLabel) === chave)?.sectionId || null;
    const secao = alvo ? todas.find(item => item.id === alvo && item.id !== excluir) || null : null;
    return secao ? { secao, pages: sinal.pages, sampleSize: leitura.sampleSize, basis: "SAMPLE_ORDER" } : null;
  };

  const maisProxima = (excluir: string | null) => porRaizes(excluir) || pelaOrdem(excluir);

  let arvore = input.arvore;
  let turnSection: RadarEditorialSubjectTurn["turnSection"];
  const observada = [...input.secoesDoAssunto].sort((esquerda, direita) => direita.pages - esquerda.pages)[0] || null;

  if (observada) {
    /* A amostra já cobre o Assunto: é esse bloco que carrega a virada, sem duplicata. */
    const noTopo = input.arvore.find(secao => secao.id === observada.id) || null;
    const pai = paiDe.get(observada.id) || null;
    const hospedeiroId = noTopo || pai ? null : input.pontos.get(observada.id) || null;
    const hospedeiro = pai || (hospedeiroId ? porId.get(hospedeiroId) || null : null);
    turnSection = {
      id: observada.id,
      heading: porId.get(observada.id)?.headingSuggestion || radarSubjectTurnTitle(subject.phrase),
      source: "OBSERVED_GROUP",
      pages: observada.pages,
      sampleSize: amostra,
      placement: noTopo ? "H2" : pai ? "H3" : hospedeiroId ? "COVERAGE_POINT" : "H2",
      hostSectionId: hospedeiro?.id || null,
      hostHeading: hospedeiro?.headingSuggestion || null,
      mustCoverReason: RADAR_SUBJECT_MUST_COVER_REASON,
    };
  } else {
    const id = radarSubjectTurnSectionId(subject.phrase);
    const virada: RadarEditorialSection = {
      id,
      level: 3,
      parentId: null,
      editorialFunction: "COVERAGE",
      headingDirection: `Fazer a virada: levar o leitor de ${input.principal || "a busca dele"} a ${subject.phrase}, sem trocar a promessa do artigo.`,
      headingSuggestion: radarSubjectTurnTitle(subject.phrase),
      objective: `Mostrar ao leitor desta busca o que ele precisa entender para chegar a ${subject.phrase}.`,
      readerQuestion: `O que o leitor desta busca precisa entender para chegar a ${subject.phrase}?`,
      keyMessage: null,
      coveragePoints: [`virada para ${subject.phrase}`, ...(subject.note ? [`${subject.phrase}: ${subject.note}`] : [])],
      mustCoverReasons: [RADAR_SUBJECT_MUST_COVER_REASON],
      childSections: [],
      evidenceStrength: "DNA_REQUIRED",
      evidenceRefs: [],
      factualSupport: "NOT_REQUIRED",
      factualRequirement: null,
      specialistRequirement: null,
      internalLinks: [],
      mediaOpportunity: [],
      reason: `O ArticleDNA declara "${subject.phrase}" como tronco e nenhuma página da amostra o trata como bloco próprio (0 de ${amostra}): a seção é exigida mesmo assim, e a arquitetura decide onde.`,
    };

    const proxima = maisProxima(null);
    const base = { id, heading: virada.headingSuggestion, source: "SYNTHETIC" as const, pages: 0, sampleSize: amostra, mustCoverReason: RADAR_SUBJECT_MUST_COVER_REASON };

    if (proxima) {
      /* H3 do anfitrião do mesmo tema: a seção que mais toca o Assunto, ou o H2 dela. */
      const anfitriao = paiDe.get(proxima.secao.id) || proxima.secao;
      arvore = input.arvore.map(secao => secao === anfitriao
        ? { ...secao, childSections: [...secao.childSections, { ...virada, level: 3 as const, parentId: secao.id }] }
        : secao);
      turnSection = { ...base, placement: "H3", hostSectionId: anfitriao.id, hostHeading: anfitriao.headingSuggestion };
    } else if (input.arvore.length) {
      /* Sem tema em comum: ponto a cobrir no eixo prático, ou na seção mais sustentada. */
      const praticas = input.arvore
        .filter(secao => secao.editorialFunction === "APPLICATION" || secao.editorialFunction === "SELECTION")
        .sort((esquerda, direita) => forca(direita) - forca(esquerda));
      const eixo = praticas[0] || input.arvore.find(secao => forca(secao) === 2) || input.arvore[input.arvore.length - 1];
      arvore = input.arvore.map(secao => secao === eixo
        ? {
          ...secao,
          coveragePoints: [...secao.coveragePoints, ...virada.coveragePoints],
          mustCoverReasons: [...secao.mustCoverReasons, ...virada.mustCoverReasons],
        }
        : secao);
      turnSection = { ...base, placement: "COVERAGE_POINT", hostSectionId: eixo.id, hostHeading: eixo.headingSuggestion };
    } else {
      arvore = [{ ...virada, level: 2, parentId: null }];
      turnSection = { ...base, placement: "ALONE", hostSectionId: null, hostHeading: null };
      limitations.push("A amostra não produziu seção para hospedar a virada: ela fica como a única seção exigida, e o lugar é do Redator.");
    }
  }

  const posicao = maisProxima(turnSection.source === "OBSERVED_GROUP" ? turnSection.id : null);
  const suggestedPosition = posicao
    ? { afterSectionId: posicao.secao.id, afterHeading: posicao.secao.headingSuggestion, pages: posicao.pages, sampleSize: posicao.sampleSize, basis: posicao.basis }
    : null;

  const titulo = leitura.titlePagesTouching;
  const piso = Math.min(RADAR_SUBJECT_H1_FLOOR, Math.max(1, leitura.sampleSize));
  const sugereH1 = leitura.basis === "PAGES" && titulo !== null && titulo >= piso;

  return {
    arvore,
    limitations,
    turn: {
      phrase: subject.phrase,
      note: subject.note,
      destinationUrl: subject.destinationUrl,
      criterion: leitura.criterion,
      criterionLabel: leitura.criterionLabel,
      stems: [...leitura.stems],
      turnSection,
      suggestedPosition,
      suggestedPositionLabel: !suggestedPosition
        ? turnSection.source === "OBSERVED_GROUP"
          /* O bloco observado JÁ é a virada: a amostra dá o lugar, e isso não é "sem sinal". */
          ? `Na seção "${turnSection.heading}": é o bloco da amostra que já trata o Assunto (em ${turnSection.pages} de ${turnSection.sampleSize} página(s)).`
          : RADAR_SUBJECT_NO_SIGNAL
        : suggestedPosition.basis === "SECTION_STEMS"
          ? `Depois de "${suggestedPosition.afterHeading}": a seção da amostra que mais traz palavras do Assunto (aparece em ${suggestedPosition.pages} de ${suggestedPosition.sampleSize} página(s)).`
          : `Depois de "${suggestedPosition.afterHeading}": é depois deste bloco que a amostra trata o Assunto (em ${suggestedPosition.pages} de ${suggestedPosition.sampleSize} página(s)).`,
      h1Complement: {
        suggested: sugereH1,
        complement: sugereH1 ? subject.phrase : null,
        titlePages: titulo,
        headingPages: leitura.headingPagesTouching,
        sampleSize: leitura.sampleSize,
        label: sugereH1
          ? `Complemento do H1: ${input.principal ? `${input.principal} + ` : ""}"${subject.phrase}" — palavras do Assunto aparecem no título de ${titulo} de ${leitura.sampleSize} página(s).`
          : (leitura.headingPagesTouching ?? 0) > 0
            ? `Assunto em H2/H3 — o H1 é da principal: palavras do Assunto aparecem em H2/H3 de ${leitura.headingPagesTouching} de ${leitura.sampleSize} página(s).`
            : RADAR_SUBJECT_NO_SIGNAL,
      },
      sampleLabel: leitura.label,
      alert: leitura.alert,
      ctaDirection: subject.destinationUrl ? radarSubjectCtaDirection(subject.destinationUrl) : null,
    },
  };
}

export function buildRadarEditorialArticleModel(input: {
  context: RadarArticleResearchContext;
  observed: RadarCompetitiveObservedModel;
  blueprint: RadarEditorialBlueprint;
}): RadarEditorialArticleModel {
  const { context, observed, blueprint } = input;
  const territorio = territorioDoArtigo(context);
  const intencao = context.article.classification?.intentLabel || radarDeclaredArticleIntent(context.article) || context.article.mainIntent;
  const principal = territorio.principal?.identity.text || null;
  const amostra = observed.sample.comparablePages;

  const variantesPorConceito = new Map(observed.concepts.all.map(item => [item.id, item.variants || []]));

  /*
   * O ASSUNTO DO ARTIGO EM UMA EXPRESSÃO — "pele oleosa".
   *
   * É com ele que um bloco temático se nomeia: "pele oleosa e acne". Sai da
   * promessa ou da keyword principal, sem o verbo nem a categoria: "skincare"
   * é o silo, não o assunto.
   */
  const assuntoDoArtigo = (() => {
    const base = (principal || context.article.promise || "").trim();
    if (!base) return null;

    const raizesDoSilo = context.silo?.siloName ? new Set(radarSemanticStems(context.silo.siloName)) : new Set<string>();
    const palavras = base.split(/\s+/).filter(Boolean).filter(palavra => {
      const raiz = radarSemanticStems(palavra)[0];
      /* "skincare" é o silo, não o assunto; "para" é conector. */
      return Boolean(raiz) && !raizesDoSilo.has(raiz) && !CONECTORES.has(palavra.toLowerCase());
    });

    /* Duas palavras bastam para nomear o assunto: "pele oleosa". */
    const texto = palavras.slice(-2).join(" ").toLowerCase().trim();
    return texto.length > 3 ? texto : null;
  })();

  /*
   * A seção da virada que o blueprint propôs NÃO é candidato observado: ela
   * não entra no agrupamento nem nas formulações da amostra (F3.1).
   */
  const observados = blueprint.sections.filter(item => !radarIsSubjectTurnSection(item.id));
  const grupos = agrupar(observados, territorio.exigidos, territorio.genericas);

  const candidates: RadarEditorialCandidate[] = [];
  const sections: RadarEditorialSection[] = [];
  /* As raízes próprias de cada seção — a chave do agrupamento por tema (§10). */
  const raizesPorSecao = new Map<string, Set<string>>();
  /* Quantas páginas sustentam cada seção, e quais carregam o Assunto (F3.1). */
  const paginasPorSecao = new Map<string, number>();
  const secoesDoAssunto: Array<{ id: string; pages: number }> = [];

  for (const grupo of grupos) {
    const lider = [...grupo.candidatos].sort((esquerda, direita) =>
      direita.marketEvidence.pages - esquerda.marketEvidence.pages)[0];

    const alinhado = [...grupo.raizes].some(raiz => territorio.raizes.has(raiz));
    const serve = serveAIntencao(lider.workingTitle, intencao);
    const evidenciaBasta = grupo.pages >= PISO_DE_EVIDENCIA;

    /*
     * §4 · A PROMOÇÃO PRECISA SE JUSTIFICAR — e são duas portas, não uma.
     *
     * Ou o ArticleDNA exige o assunto (e aí recorrência baixa não impede: §28.D),
     * ou a evidência o sustenta DENTRO do território declarado. Fora disso, o
     * candidato continua sendo evidência — e evidência não é estrutura.
     */
    const promove = grupo.dnaRequired || (alinhado && serve && evidenciaBasta);

    const registrar = (verdict: RadarEditorialVerdict, reason: string, sectionId: string | null) => {
      for (const candidato of grupo.candidatos) {
        candidates.push({
          id: candidato.id,
          observedLabel: candidato.workingTitle,
          pages: candidato.marketEvidence.pages,
          sampleSize: candidato.marketEvidence.sampleSize || amostra,
          dnaAligned: alinhado,
          dnaRequired: grupo.dnaRequired,
          intentFit: serve,
          verdict: candidato === lider ? verdict : verdict === "PROMOTED" ? "MERGED" : verdict,
          reason,
          sectionId,
        });
      }
    };

    if (!promove) {
      const verdict: RadarEditorialVerdict = !alinhado ? "OUT_OF_SCOPE"
        : !serve ? "OUT_OF_SCOPE"
          : "NEEDS_MORE_EVIDENCE";
      const reason = !alinhado
        ? `O ArticleDNA não declara este assunto e ele não toca a composição de keywords: pertence a outro artigo.`
        : !serve
          ? `A intenção declarada é ${intencao}; este assunto pertence a uma intenção comercial.`
          : `Observado em ${grupo.pages} de ${amostra} página(s) e não exigido pelo ArticleDNA: evidência insuficiente para virar seção.`;
      registrar(verdict, reason, null);
      continue;
    }

    const sectionId = `section:${assinatura(grupo.id)}`;
    const distintivasDaSecao = new Set([...grupo.raizes].filter(raiz =>
      !territorio.genericas.has(raiz) && !VERBOS_SEM_ASSUNTO.has(raiz)));
    raizesPorSecao.set(sectionId, distintivasDaSecao);
    paginasPorSecao.set(sectionId, grupo.pages);
    if (grupo.subjectRequired) secoesDoAssunto.push({ id: sectionId, pages: grupo.pages });
    const tipoLabel = lider.conceptTypeLabel;
    const funcaoDaSecao = funcaoEditorial(lider.workingTitle);
    const cabecalho = direcaoDeCabecalho({
      rotulo: lider.workingTitle,
      tipoLabel,
      editorialFunction: funcaoDaSecao,
      variantesObservadas: grupo.candidatos.flatMap(item => variantesPorConceito.get(item.conceptId) || []),
      principal,
    });

    const perguntas = grupo.candidatos.flatMap(item => item.questions);
    const factual: RadarFactualSupportStatus = perguntas.some(item => item.factualSupport === "CONFLICTED") ? "CONFLICTED"
      : perguntas.some(item => item.factualSupport === "MISSING") ? "MISSING"
        : perguntas.some(item => item.factualSupport === "PARTIAL") ? "PARTIAL"
          : perguntas.some(item => item.factualSupport === "ADEQUATE") ? "ADEQUATE"
            : "NOT_REQUIRED";

    const especialista = grupo.candidatos.flatMap(item => item.specialistRequirementIds);
    const links: RadarEditorialLinkApplication[] = grupo.candidatos.flatMap(item => item.internalLinks).map(item => ({
      /*
       * §8 · O NOME DO DESTINO — e, quando não há nome, NÃO é o id.
       *
       * O plano de links devolve `slug || nodeId`: sem slug, o "destino" vinha
       * como `article:article-candidate:territory:<uuid>`. Mostrar isso ao
       * Redator não informa nada e ainda leva identificador técnico para fora
       * da proveniência, que é justamente o que §8 proíbe.
       *
       * Sem nome legível, o que se mostra é a ÂNCORA — que é o texto que vai
       * para a página — e o id continua alcançável na proveniência.
       */
      destination: pareceIdentificador(item.destination)
        ? (item.anchor || "destino sem título nesta versão")
        : item.destination,
      anchor: item.anchor,
      whereToApply: `na seção "${cabecalho.suggestion}"`,
      role: item.unresolved ? "relação aprovada sem aplicação natural nesta rodada" : "aprofundamento",
    }));

    /*
     * §5 · O QUE É MICROTEMA VIRA H3, NÃO H2.
     *
     * Um candidato do grupo cujas raízes cabem dentro das do líder descreve uma
     * parte da mesma necessidade. Promovê-lo a H2 ao lado do líder faria o
     * artigo perguntar duas vezes a mesma coisa em níveis iguais.
     */
    /*
     * §5 e §6 · VARIANTE DA MESMA NECESSIDADE NÃO VIRA H3.
     *
     * "Como cuidar da pele oleosa e com tendência a acne?" não é uma PARTE de
     * "Como cuidar de pele oleosa?" — é a mesma pergunta com outra roupa. Virar
     * subseção só rebaixaria a duplicação um nível, e o artigo continuaria
     * perguntando três vezes a mesma coisa.
     *
     * O que elas cobrem fica registrado no motivo da seção, dentro do
     * disclosure de evidências, e cada uma mantém veredito MERGED com o
     * endereço da seção que a absorveu.  continua no contrato
     * para subdivisão REAL — parte distinta de uma necessidade —, que esta
     * rodada não teve como distinguir com segurança.
     */
    const absorvidas = grupo.candidatos.filter(item => item !== lider).map(item => item.workingTitle);
    const funcao = funcaoDaSecao;

    /*
     * §6 · O QUE COBRIR — e é aqui que as absorvidas viram conteúdo útil.
     *
     * A necessidade do líder abre a lista; as variantes que ela responde vêm
     * atrás. É a leitura que o Redator usa: três pontos, não três parágrafos de
     * justificativa.
     */
    /*
     * §4 · E A LISTA NÃO REPETE A MESMA COISA TRÊS VEZES.
     *
     * "como cuidar de pele oleosa", "como cuidar da pele oleosa e com tendência
     * a acne" e "como cuidar de uma pele acneica" são a MESMA necessidade em
     * três formulações — foi por isso que elas foram agrupadas. Listá-las
     * inteiras devolveria ao Redator a fragmentação que a síntese desfez.
     *
     * Fica a formulação que ACRESCENTA: um ponto cujas raízes já estão contidas
     * em outro ponto não diz nada de novo.
     */
    const [principalDoGrupo, ...outros] = [...new Set([lider.workingTitle, ...absorvidas]
      .map(pontoEditorial)
      .filter((valor): valor is string => Boolean(valor)))];
    const raizesDoLider = new Set(radarSemanticStems(principalDoGrupo || ""));
    const coveragePoints = [
      ...(principalDoGrupo ? [principalDoGrupo] : []),
      ...outros.filter(ponto => {
        const minhas = new Set(radarSemanticStems(ponto));
        const comuns = [...minhas].filter(raiz => raizesDoLider.has(raiz)).length;
        const menor = Math.min(minhas.size, raizesDoLider.size) || 1;
        /* Metade das raízes em comum com o ponto principal: é a mesma coisa. */
        return comuns < Math.ceil(menor / 2) + 1;
      }),
    ];

    sections.push({
      id: sectionId,
      level: 2,
      parentId: null,
      editorialFunction: funcao,
      headingDirection: cabecalho.direction,
      headingSuggestion: cabecalho.suggestion,
      objective: OBJETIVO_POR_FUNCAO[funcao],
      readerQuestion: perguntas[0]?.text || cabecalho.suggestion,
      /*
       * §8 · SÓ HÁ MENSAGEM QUANDO A EVIDÊNCIA A SUSTENTA.
       *
       * Uma diferenciação observada é conteúdo: "a amostra converge em X". O
       * `answerRequirement` do candidato não é — ele descreve a obrigação, e
       * repeti-lo em vinte cartões é boilerplate com cara de decisão.
       */
      keyMessage: mensagemEditorial(lider.differentiation),
      coveragePoints,
      mustCoverReasons: grupo.dnaRequired
        ? [
          ...(grupo.topicRequired ? [`O ArticleDNA declara este assunto: ele precisa ser coberto, e a arquitetura decide onde.`] : []),
          ...(grupo.subjectRequired ? [RADAR_SUBJECT_MUST_COVER_REASON] : []),
        ]
        : [],
      childSections: [],
      evidenceStrength: grupo.dnaRequired && grupo.pages < PISO_DE_EVIDENCIA ? "DNA_REQUIRED"
        : grupo.pages >= maioria(amostra) ? "STRONG" : "MODERATE",
      evidenceRefs: grupo.candidatos.map(item => item.id),
      factualSupport: factual,
      factualRequirement: ROTULO_FACTUAL[factual],
      specialistRequirement: especialista.length ? "Uma afirmação desta seção precisa de revisão profissional." : null,
      internalLinks: links,
      mediaOpportunity: grupo.candidatos
        .map(item => item.videoOpportunityId)
        .filter((valor): valor is string => Boolean(valor))
        .map(() => "Vídeo de apoio recomendado para esta seção."),
      reason: grupo.dnaRequired
        ? grupo.subjectRequired && !grupo.topicRequired
          ? `O ArticleDNA declara este Assunto como tronco; a amostra o toca em ${grupo.pages} de ${amostra} página(s).`
          : `O ArticleDNA declara este assunto; a amostra o confirma em ${grupo.pages} de ${amostra} página(s).`
        : `Observado em ${grupo.pages} de ${amostra} página(s) comparável(is), dentro do território que o ArticleDNA declara.${
          absorvidas.length ? ` Esta seção também responde: ${absorvidas.map(item => `"${item}"`).join(", ")}.` : ""
        }`,
    });

    registrar("PROMOTED", `Promovido a seção: ${grupo.dnaRequired ? "exigido pelo ArticleDNA" : `sustentado por ${grupo.pages} de ${amostra} página(s)`}.`, sectionId);
  }

  /*
   * ============ §10 · A SEGUNDA PASSADA ============
   *
   * Até aqui cada necessidade virou um H2. A hierarquia é o que transforma uma
   * lista de perguntas num artigo: quem depende de quem desce um nível.
   */
  const { arvore, pontos } = hierarquizar(sections, raizesPorSecao, assuntoDoArtigo);

  /*
   * O CANDIDATO SEGUE O ASSUNTO ATÉ ONDE ELE FOI PARAR.
   *
   * Um assunto que virou ponto dentro de outra seção continua coberto — e o
   * veredito precisa apontar para a seção que o cobre, senão a rastreabilidade
   * quebra justamente no caso que a arquitetura decidiu rebaixar.
   */
  for (const candidato of candidates) {
    const destino = candidato.sectionId ? pontos.get(candidato.sectionId) : null;
    if (destino) candidato.sectionId = destino;
  }

  /* ====================== 1.2 · §1 a §3 · a copy do artigo ====================== */

  /*
   * O TÍTULO SAI DA ARQUITETURA, e por isso ele muda quando ela muda.
   *
   * O eixo prático dá a frase; as seções vizinhas dão os assuntos que o artigo
   * cobre. "Título / direção" era uma instrução — "nomear a promessa sem
   * repetir keyword" — e instrução não vai para o CMS.
   */
  const eixoPratico = arvore.find(item => item.editorialFunction === "APPLICATION")
    || arvore.find(item => item.editorialFunction === "SELECTION")
    || arvore[0] || null;
  const definicional = arvore.find(item => item.editorialFunction === "DEFINITION") || null;
  const explicativa = arvore.find(item => item.editorialFunction === "EXPLANATION") || null;

  const assuntos = arvore
    .flatMap(secao => [secao, ...secao.childSections])
    /*
     * O TÍTULO LISTA O QUE O ARTIGO ENTREGA, não o que ele explica.
     *
     * As seções de explicação nomeiam CAUSAS — "o que piora", "a relação com
     * acne" —, e a palavra que as representa é um verbo conjugado ou um termo
     * abstrato. Elas entram na direção pela cláusula de contexto, que é onde
     * fazem sentido; no título, virariam "brilho, produtos e piora".
     */
    .filter(secao => secao !== eixoPratico && secao !== definicional && secao.editorialFunction !== "EXPLANATION")
    .map(secao => faceta(secao.headingSuggestion, territorio.genericas))
    .filter((valor): valor is string => Boolean(valor))
    .filter((valor, indice, lista) => lista.indexOf(valor) === indice)
    .slice(0, 4);

  const acaoDoEixo = eixoPratico ? nucleoDeAcao(eixoPratico.headingSuggestion) : null;

  /*
   * §10 do 1.2 · nada que coincida com uma formulação observada sai como
   * recomendação — a mesma trava do cabeçalho vale para o título.
   */
  const observadasNoArtigo = new Set(
    observados.flatMap(item => [item.workingTitle, ...(variantesPorConceito.get(item.conceptId) || [])]).map(normalizar),
  );

  /* ============ 1.4 · §2 e §3 · título, estratégia e promessa ============ */

  /*
   * O TÍTULO DE TRABALHO É CURTO — e é isso que o torna um título.
   *
   * Concatenar o eixo com três facetas produzia uma linha que ninguém leria
   * inteira. Duas facetas é o teto: o título nomeia o que o artigo entrega, não
   * o sumário dele. Quem escreve o título final é o Redator; isto é a direção.
   */
  const nucleoCurto = acaoDoEixo
    ? acaoDoEixo.replace(/\s+(no dia a dia|na pr(á|a)tica)$/i, "").trim()
    : null;
  const facetasDoTitulo = assuntos.slice(0, 2);

  const candidatasDeTitulo = [
    nucleoCurto && facetasDoTitulo.length ? `Como ${nucleoCurto}: ${emLista(facetasDoTitulo)}` : null,
    nucleoCurto ? `Como ${nucleoCurto}` : null,
    principal && facetasDoTitulo.length ? `${principal.charAt(0).toUpperCase()}${principal.slice(1)}: ${emLista(facetasDoTitulo)}` : null,
    principal ? `${principal.charAt(0).toUpperCase()}${principal.slice(1)}: o que fazer na prática` : null,
  ].filter((valor): valor is string => Boolean(valor))
    .filter(opcao => !observadasNoArtigo.has(normalizar(opcao)));

  const titleSuggestion = candidatasDeTitulo[0]
    || (principal ? `${principal.charAt(0).toUpperCase()}${principal.slice(1)}` : "Título a definir com o Planejador");
  const titleAlternatives = candidatasDeTitulo.slice(1, 3);

  /*
   * ============ §3 · A DIREÇÃO É ESTRATÉGIA, NÃO O TÍTULO EM PROSA ============
   *
   * A versão anterior repetia o título esticado: "Explicar X, transformar esse
   * fundamento em Y, cobrindo Z" — a mesma informação, mais longa. Direção é
   * como o argumento se organiza; promessa é o que o leitor leva. Se as três
   * linhas dizem a mesma coisa, duas delas são ruído.
   */
  const temDependencia = arvore.some(secao => [secao, ...secao.childSections]
    .some(item => item.factualRequirement || item.specialistRequirement));

  const estrategia = [
    definicional && eixoPratico
      ? "Abrir pelo fundamento e só então recomendar: o leitor precisa reconhecer o próprio caso antes de seguir uma rotina."
      : eixoPratico
        ? "Ir direto à aplicação: a amostra mostra que o leitor chega procurando o que fazer."
        : "Organizar a leitura pelo que o leitor precisa entender antes de decidir.",
    explicativa
      ? "As causas entram como contexto das recomendações, e não como eixo próprio."
      : null,
    arvore.some(secao => secao.mustCoverReasons.length || secao.childSections.some(filho => filho.mustCoverReasons.length))
      ? "O que o ArticleDNA exige é coberto onde pertence, sem virar eixo por decreto."
      : null,
    temDependencia
      ? "Onde a evidência não sustenta, o texto declara a dependência em vez de afirmar."
      : null,
  ].filter((valor): valor is string => Boolean(valor));

  const editorialAngle = arvore.length
    ? estrategia.join(" ")
    : "Sem evidência suficiente para propor uma direção editorial nesta rodada.";

  /*
   * §3 · A PROMESSA É O RESULTADO — o que estará resolvido no fim da leitura.
   *
   * Ela sai das FUNÇÕES presentes na arquitetura: cada uma entrega uma coisa
   * diferente ao leitor. Com outra arquitetura, outra promessa.
   */
  const RESULTADO_POR_FUNCAO: Record<RadarEditorialFunction, string> = {
    DEFINITION: "reconhece o próprio caso",
    APPLICATION: "tem uma rotina definida para seguir",
    SELECTION: "sabe escolher com critério",
    EXPLANATION: "entende o que está por trás do que observa",
    COVERAGE: "encontra respondido o que foi procurar",
  };

  /* Três resultados é o teto: uma promessa que lista tudo não promete nada. */
  const resultados = [...new Set(arvore.map(secao => RESULTADO_POR_FUNCAO[secao.editorialFunction]))].slice(0, 3);
  const readerPromise = arvore.length
    ? `Ao final, o leitor ${emLista(resultados)}${temDependencia ? ", e sabe em que ponto vale procurar orientação profissional" : ""}.`
    : `Responder o que o leitor procura sobre ${principal || "o assunto"}.`;

  /* --------------------------- abertura e fecho --------------------------- */

  /* A leitura da árvore inteira — H2 e H3 — sempre que a conta é do artigo. */
  const todasAsSecoes = arvore.flatMap(secao => [secao, ...secao.childSections]);
  const primeira = arvore[0] || null;
  const abertura = blueprint.opening;

  const opening = {
    hookDirection: `Abrir corrigindo a leitura mais comum sobre ${principal || context.article.promise || "o assunto"} — a amostra abre direto, sem introdução genérica.`,
    promise: readerPromise,
    initialAnswer: primeira
      ? `Responder cedo: ${primeira.readerQuestion}`
      : "Responder a necessidade central logo na abertura.",
    /*
     * 1.1 · §5 · A TRANSIÇÃO SAIU DA VISÃO NORMAL.
     *
     * "Encaminhar para a primeira seção sem repetir o que a abertura já
     * entregou" é instrução genérica de redação: vale para qualquer artigo e
     * não decide nada sobre ESTE. Ela continua no contrato, onde o Planejador a
     * alcança; o que ela não faz mais é ocupar linha na leitura editorial.
     */
    transition: "Encaminhar para a primeira seção sem repetir o que a abertura já entregou.",
  };

  /*
   * §12 · A CONCLUSÃO É CURTA, E ELA É DESTE ARTIGO.
   *
   * "Fechar com a ação que o artigo habilita, sem promessa nova" é a mesma
   * frase em todo artigo — e frase que serve para todos não orienta nenhum. O
   * objetivo retoma a resposta principal; a chamada aponta para o eixo.
   */
  const conclusion: RadarEditorialArticleModel["conclusion"] = {
    synthesis: definicional || arvore[0]
      ? `Retomar a resposta principal: ${nucleoDeAcao((definicional || arvore[0]).headingSuggestion)}.`
      : `Retomar o que o artigo respondeu sobre ${principal || "o assunto"}.`,
    nextStep: acaoDoEixo
      ? `Orientar o próximo passo: ${acaoDoEixo}.`
      : "Orientar o próximo passo prático do leitor.",
    callToAction: acaoDoEixo
      ? `Levar o leitor a ${acaoDoEixo}.`
      : `Levar o leitor a aplicar o que leu sobre ${principal || "o assunto"}.`,
  };

  /*
   * ============ O ASSUNTO DECLARADO — SDD do Assunto, F3.1 ============
   *
   * Depois do título, da promessa e do fecho de propósito: a virada não muda
   * o que a amostra diz sobre o artigo. Ela entra na ESTRUTURA — como bloco
   * observado que já cobria o Assunto ou como a seção "Virada para <Assunto>"
   * — e a chamada final ganha a direção para o destino ao lado da observada.
   */
  const assunto = viradaDoAssunto({
    context, observed, sections, arvore, pontos, raizesPorSecao, paginasPorSecao, secoesDoAssunto, candidates, amostra, principal,
  });
  if (assunto?.turn.ctaDirection) conclusion.destinationDirection = assunto.turn.ctaDirection;

  /* ------------------------- dependências declaradas ------------------------ */

  const evidenceNeeds = todasAsSecoes
    .filter(item => item.factualRequirement)
    .map(item => ({ subject: item.headingSuggestion, requirement: item.factualRequirement as string }));

  const specialistNeeds = todasAsSecoes
    .filter(item => item.specialistRequirement)
    .map(item => ({ subject: item.headingSuggestion, requirement: item.specialistRequirement as string }));

  const usaImagens = observed.structure.patterns.find(item => item.key === "USES_IMAGES" && item.verdict === "dominant");
  const mediaPlan = [
    ...(usaImagens ? [{ kind: "Imagem", subject: "Capa e apoio", purpose: `A amostra usa imagens: ${usaImagens.evidence}` }] : []),
    ...blueprint.videoBriefs.map(item => ({ kind: "Vídeo", subject: item.topic, purpose: item.narrativePurpose })),
  ];

  /*
   * §11 · O PLANO VISUAL EM UMA LINHA.
   *
   * Cinco justificativas grandes no fluxo principal transformavam a produção
   * visual no assunto da tela. O que se decide olhando é quantas peças e de que
   * tipo; o porquê de cada uma é do disclosure.
   */
  const apoios = Math.min(3, Math.max(0, arvore.length - 1));
  const videos = blueprint.videoBriefs.length;
  const pecas = [
    usaImagens ? "1 capa" : null,
    usaImagens && apoios ? `${apoios} imagem(ns) de apoio` : null,
    videos ? `${videos} vídeo(s) recomendado(s)` : null,
  ].filter((valor): valor is string => Boolean(valor));
  const mediaSummary = pecas.length ? pecas.join(" · ") : null;

  /*
   * ============ 1.1 · §4 · "PARCIAL" É SOBRE O QUE TRAVA, NÃO SOBRE TUDO ============
   *
   * A versão anterior somava "evidência competitiva moderada em 5 seção(ões)" —
   * e com isso praticamente todo artigo nascia Parcial, por um motivo que não
   * impede ninguém de escrever. Rótulo que sempre acende deixa de ser lido.
   *
   * O que trava é dependência: uma fonte que falta, uma revisão profissional
   * pendente. Evidência moderada continua dita — na SEÇÃO, onde ela é
   * acionável — e não rebaixa o artigo inteiro.
   */
  const motivos: string[] = [];
  if (evidenceNeeds.length) motivos.push(`${evidenceNeeds.length} fonte(s) pendente(s)`);
  if (specialistNeeds.length) motivos.push(`${specialistNeeds.length} revisão(ões) profissional(is)`);

  const readiness = motivos.length
    ? { state: "PARTIAL" as const, label: `Parcial · ${motivos.join(" · ")}`, reasons: motivos }
    : { state: "READY" as const, label: "Pronto para o Planejador", reasons: [] };

  return {
    articleIdentity: {
      articleId: context.article.articleId,
      articleDnaVersionId: context.article.articleDnaVersionId,
      principalKeyword: principal,
      intentLabel: intencao,
      funnelLabel: context.article.classification?.funnelLabel || null,
      siloRole: context.silo?.articleRole || null,
    },
    titleSuggestion,
    titleAlternatives,
    titleDirection: principal
      ? `Nomear a promessa e o benefício: "${principal}" precisa aparecer sem virar repetição de keyword.`
      : "Nomear a promessa do artigo no título, sem repetir keyword.",
    editorialObjective: context.article.promise || blueprint.article.objective,
    /*
     * 1.1 · §3 · O ÂNGULO É EDITORIAL, NÃO A CONTA DA SÍNTESE.
     *
     * "7 necessidades sintetizadas de 20 candidatos" descreve o PROCESSO. Quem
     * vai escrever precisa saber que ordem o artigo segue.
     */
    editorialAngle,
    readerPromise,
    opening,
    sections: assunto ? assunto.arvore : arvore,
    conclusion,
    internalLinkApplications: todasAsSecoes.flatMap(item => item.internalLinks),
    evidenceNeeds,
    specialistNeeds,
    mediaPlan,
    mediaSummary,
    candidates,
    readiness,
    limitations: assunto
      ? [...new Set([
        ...(abertura?.directives.length ? [] : ["A amostra não mostrou padrão de abertura dominante."]),
        ...context.limitations,
        ...assunto.limitations,
      ])]
      : [
        ...(abertura?.directives.length ? [] : ["A amostra não mostrou padrão de abertura dominante."]),
        ...context.limitations,
      ],
    ...(assunto ? { declaredSubject: assunto.turn } : {}),
  };
}
