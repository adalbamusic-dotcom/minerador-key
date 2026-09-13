/**
 * O PLANO DE LINKAGEM INTERNA — A ARQUITETURA VIRA APLICAÇÃO.
 *
 * O ArticleDNA entrega o mapa: este Article se relaciona com aquele, nesta
 * direção, sob este conceito de âncora. É rede básica, e é de propósito — o
 * Arquiteto decide a ARQUITETURA, não o texto.
 *
 * Quem sabe COMO aplicar essa arquitetura dentro do conteúdo é quem tem a
 * evidência: quantas páginas do mercado tratam do conceito, sob quantas
 * formulações, em que seções, com que densidade de links. Isso é o Radar.
 *
 * A fronteira correta, e ela mudou:
 *
 *   ARQUITETO   quais páginas pertencem à arquitetura de links
 *   RADAR       quantas vezes, em que contexto, com que âncora, como distribuir
 *   PLANEJADOR  recebe o plano fundamentado e o compõe com o resto do artigo
 *
 * Durante os Gates 10 e 11 este módulo dizia que quantidade, âncora final,
 * seção e posição eram do Planejador. Estava errado: o Planejador não tem a
 * SERP na mão. Ele receberia a rede crua e teria de adivinhar — que é
 * exatamente o problema que a investigação existe para resolver.
 *
 * DUAS COISAS QUE O RADAR CONTINUA NÃO FAZENDO:
 *
 *   1. NÃO MEXE NO GRAFO. Relação aprovada é fato; o plano descreve a
 *      aplicação dela, nunca a cria, altera ou remove.
 *   2. NÃO APROVA RELAÇÃO NOVA. Quando a pesquisa encontra uma oportunidade
 *      fora do grafo, ela é registrada como oportunidade, com o estado dizendo
 *      que a decisão é do Arquiteto — nunca entra no plano como se fosse
 *      arquitetura.
 *
 * Domínio puro: sem fetch, sem storage, sem provider.
 */

import { radarSemanticStems } from "./semantic-concept-model.ts";
import { radarTopicTokens } from "./topic-classification.ts";

import type {
  RadarConceptLinkAlignment, RadarInternalDirection, RadarInternalLinkResearch,
  RadarInternalRelationRole, RadarRelatedInternalPage,
} from "./link-and-source-research.ts";
import type { RadarSemanticConcept, RadarSemanticConceptModel } from "./semantic-concept-model.ts";

/* ============================== o vocabulário ============================ */

/**
 * A âncora recomendada e as formulações aceitáveis.
 *
 * O conceito aprovado pelo Arquiteto é a RESTRIÇÃO: toda variante precisa
 * continuar significando a mesma coisa. As variantes não são invenção do
 * Radar — são formulações que o próprio mercado usa para o mesmo assunto,
 * observadas na amostra e filtradas por permanecerem dentro do conceito.
 */
export type RadarAnchorProposal = {
  approvedAnchorConcept: string;
  recommendedAnchor: string;
  anchorVariants: string[];
  /** Toda variante partilha o núcleo do conceito aprovado. */
  withinApprovedConcept: boolean;
  reason: string;
};

export type RadarLinkApplicationConfidence = "HIGH" | "MEDIUM" | "LOW";

/**
 * DUAS COISAS DIFERENTES QUE ESTAVAM MISTURADAS.
 *
 * A relação existir no grafo é decisão do Arquiteto e é FATO. Onde e quantas
 * vezes ela cabe dentro deste texto é evidência — e evidência pode faltar.
 *
 * A versão anterior devolvia "1 ocorrência estrutural, lugar a definir" quando
 * não achava contexto. Aquilo era o Radar fabricando uma aplicação que ele não
 * conseguiu fundamentar, e vestindo-a de decisão do Arquiteto. O Arquiteto
 * aprovou a relação; ele nunca determinou quantidade nem local.
 *
 * `REQUIRED` sempre: a relação está no grafo e permanece nele.
 */
export type RadarStructuralRequirement = "REQUIRED";

/**
 * A investigação conseguiu fundamentar onde este link cabe?
 *
 * `UNRESOLVED` não é "o link não é necessário" nem "removam a relação". É
 * "esta rodada não encontrou contexto sustentado". A diferença importa: uma é
 * conclusão sobre a arquitetura, a outra é o limite honesto da pesquisa.
 */
export type RadarLinkApplicationStatus = "RESOLVED" | "REQUIRED_RELATION_WITHOUT_SUPPORTED_PLACEMENT";

/**
 * Um contexto distinto que justifica UMA ocorrência.
 *
 * `recommendedOccurrences = 2` sozinho não diz nada a quem vai escrever. Com
 * os dois contextos nomeados, o texto sabe onde cada link cabe — e fica óbvio
 * quando dois links seriam o mesmo link duas vezes.
 */
export type RadarLinkSupportingContext = {
  order: number;
  conceptId: string;
  conceptLabel: string;
  conceptType: RadarSemanticConcept["conceptType"];
  pages: number;
  sampleSize: number;
  queryCoverage: number;
  confidence: RadarSemanticConcept["confidence"];
  /** As seções da amostra em que este contexto aparece. */
  sections: string[];
  evidence: string;
};

export type RadarRejectedContext = {
  conceptId: string;
  conceptLabel: string;
  reason: string;
};

export type RadarLinkApplication = {
  nodeId: string;
  slug: string | null;
  targetRole: RadarInternalRelationRole;
  direction: RadarInternalDirection;
  relationTypes: string[];
  approvedAnchorConcepts: string[];

  /** A relação existe no grafo aprovado. Isso não muda com a evidência. */
  structuralRequirement: RadarStructuralRequirement;
  /** A investigação conseguiu fundamentar a aplicação dela neste texto? */
  applicationStatus: RadarLinkApplicationStatus;

  /**
   * Quantas ocorrências fazem sentido — uma por CONTEXTO distinto sustentado.
   *
   * Nunca número fixo, e nunca truncada por constante: se a evidência
   * sustentar três contextos, saem três. Quem segura repetição é a exigência
   * de contexto novo, não um teto.
   *
   * ZERO É UMA RESPOSTA LEGÍTIMA, e não significa remover a relação: significa
   * que esta rodada não encontrou onde aplicá-la com fundamento.
   */
  recommendedOccurrences: number;
  occurrencesReason: string;
  /** Cada ocorrência amarrada ao contexto distinto que a justifica. */
  supportingContexts: RadarLinkSupportingContext[];
  /** Os contextos considerados e recusados, com o motivo. Nada some calado. */
  rejectedContexts: RadarRejectedContext[];

  /** Os conceitos do mercado que justificam a presença deste link. */
  preferredConcepts: Array<{ conceptId: string; conceptLabel: string; pages: number; sampleSize: number }>;
  /** Onde o link cabe, em linguagem de quem vai escrever. */
  preferredContexts: string[];
  /** As seções em que a amostra trata desses conceitos. */
  sectionAffinity: string[];

  anchor: RadarAnchorProposal;
  distribution: string[];

  /** Por que este link, neste contexto, nesta quantidade, com esta âncora. */
  evidence: string[];
  /** Quanto a APLICAÇÃO se sustenta. Baixa quando falta contexto natural. */
  applicationConfidence: RadarLinkApplicationConfidence;
  reason: string;
};

/**
 * O Article precisa RECEBER um link — e o texto de origem é outro.
 *
 * O Radar não edita a outra página agora. Ele deixa o requisito pronto, com
 * conceito, âncora e contexto, para o Planejador ou a revisão do conteúdo de
 * origem aplicarem sabendo por quê.
 */
export type RadarIncomingLinkRequirement = {
  sourceNodeId: string;
  sourceRole: RadarInternalRelationRole;
  relationTypes: string[];
  approvedAnchorConcepts: string[];
  anchor: RadarAnchorProposal;
  /** A relação de entrada existe no grafo. Isso não depende da evidência. */
  structuralRequirement: RadarStructuralRequirement;
  applicationStatus: RadarLinkApplicationStatus;
  /** Zero quando esta rodada não conseguiu fundamentar o contexto na origem. */
  recommendedOccurrences: number;
  recommendedContext: string | null;
  evidence: string[];
  reason: string;
};

/** Achado da pesquisa fora do grafo. Registro, nunca arquitetura. */
export type RadarOutOfGraphOpportunity = {
  conceptId: string;
  conceptLabel: string;
  pages: number;
  sampleSize: number;
  evidence: string;
  status: "NOT_IN_GRAPH_REQUIRES_ARCHITECT_DECISION";
};

export type RadarInternalLinkPlan = {
  articleRole: string | null;
  outgoing: RadarLinkApplication[];
  incoming: RadarIncomingLinkRequirement[];
  /** A raiz do silo tem tratamento próprio; ela não é um suporte comum. */
  siloPage: RadarLinkApplication | null;
  opportunities: RadarOutOfGraphOpportunity[];
  totalRecommendedLinks: number;
  /** O que o plano evitou de propósito, e por quê. */
  guards: string[];
  limitations: string[];
};

/* ========================= a unidade de repetição ======================== */

/**
 * A QUANTIDADE NASCE DE CONTEXTOS, NÃO DE UMA CONSTANTE.
 *
 * A versão anterior tinha `MAX_POR_DESTINO = 2`: um teto fixo que descartava
 * evidência real. Se a amostra sustentasse três contextos distintos para o
 * mesmo destino, o número dizia não — e um número não tem argumento. Isso
 * inverte a hierarquia que a diretriz congelou: heurística acima de evidência.
 *
 * A regra agora é uma pergunta: QUANTOS CONTEXTOS SEMANTICAMENTE DISTINTOS a
 * amostra sustenta para este destino? Cada um vale uma ocorrência. Zero
 * contextos não vale zero links — a arquitetura aprovou a relação —, vale uma
 * ocorrência estrutural com confiança baixa e o lugar por decidir.
 *
 * O que impede repetição não é um teto: é a exigência de que cada ocorrência
 * adicional traga um contexto NOVO, com evidência proporcionalmente mais forte.
 */

/** Abaixo disto, o conceito não sustenta uma ocorrência própria. */
const MIN_PAGINAS_PARA_CONTEXTO = 2;

const maioria = (amostra: number) => Math.max(2, Math.ceil(amostra / 2));

/**
 * A ESCADA DE EVIDÊNCIA — quanto mais links, mais forte o que os sustenta.
 *
 * O primeiro contexto precisa existir na amostra. O segundo precisa ser
 * recorrente: se metade do mercado não trata do assunto, ele não justifica um
 * segundo link para o mesmo lugar. Do terceiro em diante, além de recorrente,
 * precisa de confiança alta e de ter sido encontrado por mais de uma consulta
 * — porque a essa altura o risco de repetição artificial cresce mais rápido
 * do que o benefício.
 *
 * Nada aqui é teto: é exigência crescente. Evidência forte o bastante passa.
 */
function contextoSustentaOcorrencia(input: {
  posicao: number;
  pages: number;
  sampleSize: number;
  queryCoverage: number;
  confidence: RadarSemanticConcept["confidence"];
}): { aceito: boolean; motivo: string } {
  if (input.pages < MIN_PAGINAS_PARA_CONTEXTO) {
    return { aceito: false, motivo: `Coberto por ${input.pages} página(s): abaixo de ${MIN_PAGINAS_PARA_CONTEXTO}, o contexto não se sustenta na amostra.` };
  }
  if (input.posicao === 1) {
    return { aceito: true, motivo: `Contexto observado em ${input.pages} de ${input.sampleSize} página(s).` };
  }

  const recorrente = input.pages >= maioria(input.sampleSize);
  if (!recorrente) {
    return { aceito: false, motivo: `Coberto por ${input.pages} de ${input.sampleSize} página(s): não é recorrente o bastante para justificar mais uma ocorrência no mesmo destino.` };
  }
  if (input.posicao === 2) {
    return { aceito: true, motivo: `Segundo contexto, recorrente em ${input.pages} de ${input.sampleSize} página(s).` };
  }

  if (input.confidence !== "HIGH") {
    return { aceito: false, motivo: `Terceira ocorrência exige confiança alta no conceito; esta é ${input.confidence.toLowerCase()}.` };
  }
  if (input.queryCoverage <= 1) {
    return { aceito: false, motivo: "Terceira ocorrência exige que o contexto tenha sido encontrado por mais de uma consulta." };
  }
  return { aceito: true, motivo: `Contexto ${input.posicao}: recorrente em ${input.pages} de ${input.sampleSize} página(s), confiança alta, encontrado por ${input.queryCoverage} consultas.` };
}

/* ============================== a âncora ================================= */

/**
 * A variante continua dentro do conceito aprovado?
 *
 * "cuidados para pele oleosa e acne" mantém o núcleo de "pele oleosa e acne".
 * "melhores sabonetes" não mantém — e uma âncora que muda o significado
 * quebra a decisão que o Arquiteto tomou, mesmo parecendo mais natural.
 */
export function radarAnchorStaysWithinConcept(concept: string, variant: string): boolean {
  const nucleo = radarSemanticStems(concept);
  if (!nucleo.length) return false;
  const daVariante = radarSemanticStems(variant);
  const conjuntoDaVariante = new Set(daVariante);

  /* A variante precisa carregar o conceito quase inteiro, não um pedaço dele. */
  const comuns = nucleo.filter(raiz => conjuntoDaVariante.has(raiz)).length;
  if (comuns / nucleo.length < 0.6) return false;

  /*
   * E PRECISA SER REFORMULAÇÃO, NÃO OUTRO ASSUNTO QUE POR ACASO SE SOBREPÕE.
   *
   * "Causas da acne em pele oleosa" carrega dois terços de "skincare para pele
   * oleosa" e fala de outra coisa: usá-la como âncora prometeria ao leitor um
   * texto sobre causas e o levaria ao Pilar de skincare. Uma reformulação
   * acrescenta um qualificador, não um assunto novo.
   */
  const doConceito = new Set(nucleo);
  const novos = daVariante.filter(raiz => !doConceito.has(raiz)).length;
  return novos <= 1;
}

function proporAncora(input: {
  conceito: string;
  formulacoesDoMercado: readonly string[];
}): RadarAnchorProposal {
  const variantes = [...new Set(input.formulacoesDoMercado)]
    .map(item => item.replace(/\?+$/, "").trim())
    .filter(item => item && item.toLocaleLowerCase("pt-BR") !== input.conceito.toLocaleLowerCase("pt-BR"))
    /*
     * ÂNCORA É TRECHO DE FRASE, NÃO TÍTULO DE SEÇÃO.
     *
     * O mercado escreve "Por que a pele oleosa causa acne" como H2 — e isso é
     * uma pergunta, não uma âncora: ninguém liga uma frase interrogativa no
     * meio de um parágrafo. Sobram as formulações curtas e afirmativas, que é
     * o que cabe dentro de uma frase corrida.
     */
    .filter(item => !/^(como|o que|por que|porque|qual|quais|quando|onde|quanto)\b/i.test(item.normalize("NFD").replace(/[̀-ͯ]/g, "")))
    .filter(item => radarTopicTokens(item).length <= 4)
    .filter(item => radarAnchorStaysWithinConcept(input.conceito, item))
    .slice(0, 4);

  return {
    approvedAnchorConcept: input.conceito,
    recommendedAnchor: input.conceito,
    anchorVariants: variantes,
    withinApprovedConcept: variantes.every(item => radarAnchorStaysWithinConcept(input.conceito, item)),
    reason: variantes.length
      ? `O conceito aprovado é a âncora recomendada. As ${variantes.length} variante(s) são formulações que a própria amostra usa para o mesmo assunto e mantêm o núcleo do conceito.`
      : "O conceito aprovado é a âncora recomendada. A amostra não ofereceu formulação equivalente que preservasse o conceito, então não há variante proposta.",
  };
}

/* ============================= a quantidade ============================== */

/**
 * QUANTAS VEZES FAZ SENTIDO — e por quê.
 *
 * Nada de número fixo. A conta é: cada CONTEXTO forte é uma ocorrência. Um
 * destino com um conceito recorrente ganha uma; com dois conceitos distintos e
 * bem cobertos, ganha duas — porque são dois momentos diferentes do texto, não
 * a mesma coisa repetida. E o mercado é teto, não meta: se a amostra liga
 * pouco, o plano não inventa densidade que ninguém pratica.
 */
/**
 * DOIS CONTEXTOS SÃO O MESMO CONTEXTO?
 *
 * "pele oleosa", "peles oleosas" e "cuidados com pele oleosa" não valem três
 * links. O agrupamento do Gate 8 já funde as duas primeiras num conceito só;
 * o que sobra decidir aqui é quando dois CONCEITOS descrevem o mesmo momento
 * do texto. Necessidades diferentes são momentos diferentes; mesma necessidade
 * com palavras diferentes é o mesmo momento.
 */
export function radarLinkContextsAreDistinct(
  esquerda: { conceptType: RadarSemanticConcept["conceptType"]; conceptLabel: string },
  direita: { conceptType: RadarSemanticConcept["conceptType"]; conceptLabel: string },
): boolean {
  if (esquerda.conceptType !== direita.conceptType) return true;

  /* Mesma necessidade: só é outro contexto se o assunto residual for outro. */
  const daEsquerda = radarSemanticStems(esquerda.conceptLabel);
  const daDireita = new Set(radarSemanticStems(direita.conceptLabel));
  if (!daEsquerda.length || !daDireita.size) return false;
  const comuns = daEsquerda.filter(raiz => daDireita.has(raiz)).length;
  return comuns / Math.min(daEsquerda.length, daDireita.size) < 0.6;
}

function decidirOcorrencias(input: {
  contextos: Array<RadarLinkApplication["preferredConcepts"][number] & {
    conceptType: RadarSemanticConcept["conceptType"];
    queryCoverage: number;
    confidence: RadarSemanticConcept["confidence"];
    sections: string[];
  }>;
  role: RadarInternalRelationRole;
}): {
  supportingContexts: RadarLinkSupportingContext[];
  rejectedContexts: RadarRejectedContext[];
  occurrences: number;
  status: RadarLinkApplicationStatus;
  reason: string;
  confidence: RadarLinkApplicationConfidence;
} {
  const supportingContexts: RadarLinkSupportingContext[] = [];
  const rejectedContexts: RadarRejectedContext[] = [];

  for (const contexto of input.contextos) {
    const repetido = supportingContexts.find(aceito => !radarLinkContextsAreDistinct(aceito, contexto));
    if (repetido) {
      rejectedContexts.push({
        conceptId: contexto.conceptId,
        conceptLabel: contexto.conceptLabel,
        reason: `Mesmo momento do texto que "${repetido.conceptLabel}": formulação diferente não é contexto novo.`,
      });
      continue;
    }

    const veredito = contextoSustentaOcorrencia({
      posicao: supportingContexts.length + 1,
      pages: contexto.pages,
      sampleSize: contexto.sampleSize,
      queryCoverage: contexto.queryCoverage,
      confidence: contexto.confidence,
    });
    if (!veredito.aceito) {
      rejectedContexts.push({ conceptId: contexto.conceptId, conceptLabel: contexto.conceptLabel, reason: veredito.motivo });
      continue;
    }

    supportingContexts.push({
      order: supportingContexts.length + 1,
      conceptId: contexto.conceptId,
      conceptLabel: contexto.conceptLabel,
      conceptType: contexto.conceptType,
      pages: contexto.pages,
      sampleSize: contexto.sampleSize,
      queryCoverage: contexto.queryCoverage,
      confidence: contexto.confidence,
      sections: contexto.sections,
      evidence: veredito.motivo,
    });
  }

  if (!supportingContexts.length) {
    /*
     * A relação foi aprovada e permanece no grafo. O que falta é contexto —
     * e devolver "uma ocorrência estrutural" seria fabricar a aplicação que a
     * pesquisa não conseguiu fundamentar, com cara de decisão do Arquiteto.
     *
     * Zero aqui é honestidade, não veredito sobre a arquitetura.
     */
    return {
      supportingContexts: [],
      rejectedContexts,
      occurrences: 0,
      status: "REQUIRED_RELATION_WITHOUT_SUPPORTED_PLACEMENT" as const,
      reason: "A relação existe no grafo aprovado, mas a investigação atual não encontrou contexto suficientemente fundamentado para sua aplicação. A relação permanece; o que falta é evidência de onde aplicá-la.",
      confidence: "LOW",
    };
  }

  const recorrentes = supportingContexts.filter(item => item.pages >= maioria(item.sampleSize));
  return {
    supportingContexts,
    rejectedContexts,
    occurrences: supportingContexts.length,
    status: "RESOLVED" as const,
    reason: supportingContexts.length > 1
      ? `${supportingContexts.length} contextos semanticamente distintos sustentam a relação (${supportingContexts.map(item => `"${item.conceptLabel}"`).join(", ")}): são ${supportingContexts.length} momentos diferentes do texto, não repetição.`
      : `Um contexto sustenta a relação ("${supportingContexts[0].conceptLabel}", ${supportingContexts[0].pages} de ${supportingContexts[0].sampleSize} páginas). Uma ocorrência contextual.`,
    confidence: recorrentes.length ? "HIGH" : "MEDIUM",
  };
}

/* ============================= a distribuição ============================ */

function orientarDistribuicao(input: {
  occurrences: number;
  contextos: RadarLinkApplication["preferredConcepts"];
  role: RadarInternalRelationRole;
  padroes: RadarInternalLinkResearch["competitorPatterns"];
  concorrentesLigamNoCorpo: boolean;
}): string[] {
  const orientacoes: string[] = [];

  if (input.role === "SILOPAGE") {
    orientacoes.push("Enquadramento: a raiz do silo cabe onde o texto situa o assunto no todo, não como link de aprofundamento.");
  }

  if (input.contextos.length) {
    orientacoes.push(`Link contextual no corpo, dentro do desenvolvimento de "${input.contextos[0].conceptLabel}".`);
  } else {
    orientacoes.push("Sem contexto recorrente observado: o lugar precisa ser decidido por quem escreve, com o conceito aprovado como guia.");
  }

  if (input.contextos.length >= 2) {
    orientacoes.push(`Distribuir as ${input.contextos.length} ocorrências em contextos diferentes — ${input.contextos.map(item => `"${item.conceptLabel}"`).join(", ")} — e usar formulações distintas para não repetir a mesma âncora.`);
    orientacoes.push("Não colocar duas delas em sequência nem na mesma seção: dois links seguidos para o mesmo destino leem como repetição, não como reforço.");
  }

  orientacoes.push("Não repetir na abertura nem no fechamento: link de abertura antecipa o que o texto ainda não sustentou.");
  if (input.concorrentesLigamNoCorpo) {
    const padrao = input.padroes.find(item => item.key === "USES_CONTEXTUAL_INTERNAL_LINKS");
    if (padrao) orientacoes.push(`A amostra faz assim: ${padrao.sourceCount} de ${padrao.sampleSize} páginas usam links internos no corpo do conteúdo.`);
  }

  return orientacoes;
}

/* =============================== o plano ================================= */

function conceitoDe(semantic: RadarSemanticConceptModel | null, conceptId: string): RadarSemanticConcept | null {
  return (semantic?.concepts || []).find(item => item.id === conceptId) || null;
}

function montarAplicacao(input: {
  pagina: RadarRelatedInternalPage;
  alinhamentos: RadarConceptLinkAlignment[];
  semantic: RadarSemanticConceptModel | null;
  research: RadarInternalLinkResearch;
}): RadarLinkApplication {
  const { pagina, alinhamentos, semantic, research } = input;

  const candidatos = alinhamentos
    .map(item => {
      const concept = conceitoDe(semantic, item.conceptId);
      return concept
        ? {
          conceptId: concept.id,
          conceptLabel: concept.canonicalLabel,
          conceptType: concept.conceptType,
          pages: concept.sourceCount,
          sampleSize: concept.sampleSize,
          queryCoverage: concept.queryCoverage,
          confidence: concept.confidence,
          sections: [...new Set(concept.supportingObservations.map(observacao => observacao.text))].slice(0, 5),
        }
        : null;
    })
    .filter((item): item is NonNullable<typeof item> => Boolean(item))
    .filter((item, index, todos) => todos.findIndex(outro => outro.conceptId === item.conceptId) === index)
    .sort((left, right) => right.pages - left.pages);

  const preferredConcepts = candidatos.map(item => ({
    conceptId: item.conceptId, conceptLabel: item.conceptLabel, pages: item.pages, sampleSize: item.sampleSize,
  }));

  const medianaDoMercado = research.competitorInternalLinkPattern.median;
  const { occurrences, status, reason, confidence, supportingContexts, rejectedContexts } = decidirOcorrencias({
    contextos: candidatos,
    role: pagina.role,
  });

  /*
   * A ÂNCORA DE SAÍDA SAI DA ARESTA DE SAÍDA. SEMPRE.
   *
   * Uma página que recebe E aponta tem dois conceitos aprovados, um para cada
   * direção: a raiz do silo abre o artigo sob "cuidados com acne" e o artigo
   * devolve à raiz sob "guia de skincare". Usar o conceito da entrada num link
   * de saída poria no texto uma âncora que o Arquiteto aprovou para outra
   * coisa — decisão dele, aplicada ao contrário.
   */
  const daSaida = pagina.relations.filter(item => item.direction === "OUTGOING");
  const conceitosDeSaida = [...new Set(daSaida.flatMap(item => item.anchorConcepts))];
  const conceitoEscolhido = alinhamentos.map(item => item.matchedAnchorConcepts.find(conceito => conceitosDeSaida.includes(conceito))).find(Boolean)
    || conceitosDeSaida[0]
    || pagina.anchorConcepts[0]
    || "";
  const formulacoes = preferredConcepts.flatMap(item => conceitoDe(semantic, item.conceptId)?.variants || []);
  const anchor = proporAncora({ conceito: conceitoEscolhido, formulacoesDoMercado: formulacoes });

  const sectionAffinity = [...new Set(
    alinhamentos
      .flatMap(item => conceitoDe(semantic, item.conceptId)?.supportingObservations || [])
      .map(item => item.text),
  )].slice(0, 5);

  /* Um contexto por ocorrência: a lista de contextos JÁ é a lista de lugares. */
  const preferredContexts = supportingContexts.map(item =>
    `Seção que desenvolve "${item.conceptLabel}" — ${item.pages} de ${item.sampleSize} página(s) da amostra tratam do assunto.`);

  const evidence = [
    `Grafo aprovado: ${pagina.relations.map(item => item.relationType).join(" · ")} (${pagina.provenance.graphVersionId || "versão não informada"}).`,
    ...preferredConcepts.slice(0, 2).map(item => `Conceito "${item.conceptLabel}" cobre ${item.pages} de ${item.sampleSize} página(s) comparáveis.`),
    ...(alinhamentos[0] ? [`A ligação com o conceito de âncora é ${alinhamentos[0].matchKind === "LEXICAL" ? "por formulação" : "por proximidade de assunto"}.`] : []),
    medianaDoMercado !== null ? `Os concorrentes usam mediana de ${medianaDoMercado} link(s) internos por página.` : "A amostra não permitiu observar densidade de links internos.",
  ];

  return {
    nodeId: pagina.nodeId,
    slug: pagina.slug,
    targetRole: pagina.role,
    direction: pagina.direction,
    /* O tipo e os conceitos da direção que está sendo aplicada — a de saída. */
    relationTypes: [...new Set((daSaida.length ? daSaida : pagina.relations).map(item => item.relationType))],
    approvedAnchorConcepts: conceitosDeSaida.length ? conceitosDeSaida : pagina.anchorConcepts,
    structuralRequirement: "REQUIRED" as const,
    applicationStatus: status,
    recommendedOccurrences: occurrences,
    occurrencesReason: reason,
    supportingContexts,
    rejectedContexts,
    preferredConcepts,
    preferredContexts,
    sectionAffinity,
    anchor,
    distribution: orientarDistribuicao({
      occurrences,
      contextos: preferredConcepts,
      role: pagina.role,
      padroes: research.competitorPatterns,
      concorrentesLigamNoCorpo: research.competitorPatterns.some(item => item.key === "USES_CONTEXTUAL_INTERNAL_LINKS"),
    }),
    evidence,
    applicationConfidence: confidence,
    reason: pagina.reasons[0] || "Relação aprovada pelo Arquiteto.",
  };
}

export function buildRadarInternalLinkPlan(input: {
  research: RadarInternalLinkResearch;
  semantic?: RadarSemanticConceptModel | null;
}): RadarInternalLinkPlan {
  const research = input.research;
  const semantic = input.semantic || null;
  const limitations: string[] = [];
  const guards: string[] = [];

  if (!research.relatedInternalPages.length) {
    return {
      articleRole: research.articleRole,
      outgoing: [], incoming: [], siloPage: null, opportunities: [],
      totalRecommendedLinks: 0, guards: [],
      limitations: ["Sem relação aprovada no grafo, não há aplicação a planejar."],
    };
  }
  if (!semantic?.concepts.length) {
    limitations.push("Sem camada conceitual nesta investigação: o plano descreve a arquitetura, sem contexto de mercado para fundamentar quantidade e lugar.");
  }

  const alinhamentosPorNo = new Map<string, RadarConceptLinkAlignment[]>();
  for (const item of research.conceptAlignments) {
    alinhamentosPorNo.set(item.nodeId, [...(alinhamentosPorNo.get(item.nodeId) || []), item]);
  }

  /* ------------------------------ as saídas ------------------------------- */

  const aplicaveis = research.relatedInternalPages.filter(item => item.direction !== "INCOMING");
  const aplicacoes = aplicaveis.map(pagina => montarAplicacao({
    pagina,
    alinhamentos: alinhamentosPorNo.get(pagina.nodeId) || [],
    semantic,
    research,
  }));

  const siloPage = aplicacoes.find(item => item.targetRole === "SILOPAGE") || null;
  const outgoing = aplicacoes.filter(item => item !== siloPage);

  /* ----------------------------- as entradas ------------------------------ */

  const incoming: RadarIncomingLinkRequirement[] = research.relatedInternalPages
    .filter(item => item.direction === "INCOMING" || item.direction === "BOTH")
    .map(pagina => {
      const alinhamentos = alinhamentosPorNo.get(pagina.nodeId) || [];
      const conceito = alinhamentos[0]?.matchedAnchorConcepts[0] || pagina.anchorConcepts[0] || "";
      const formulacoes = alinhamentos.flatMap(item => conceitoDe(semantic, item.conceptId)?.variants || []);
      /*
       * A MESMA SEPARAÇÃO VALE PARA QUEM APONTA PARA CÁ.
       *
       * O contexto de uma entrada vive na PÁGINA DE ORIGEM, que esta
       * investigação não analisou. Sem alinhamento conceitual, o Radar não tem
       * como dizer onde o link cabe lá — e escrever "no trecho em que o
       * conceito for desenvolvido" era uma frase que parecia orientação e não
       * era nenhuma.
       */
      const fundamentado = Boolean(alinhamentos[0]);
      return {
        sourceNodeId: pagina.nodeId,
        sourceRole: pagina.role,
        relationTypes: [...new Set(pagina.relations.filter(item => item.direction === "INCOMING").map(item => item.relationType))],
        approvedAnchorConcepts: pagina.anchorConcepts,
        anchor: proporAncora({ conceito, formulacoesDoMercado: formulacoes }),
        structuralRequirement: "REQUIRED" as const,
        applicationStatus: fundamentado ? "RESOLVED" as const : "REQUIRED_RELATION_WITHOUT_SUPPORTED_PLACEMENT" as const,
        recommendedOccurrences: fundamentado ? 1 : 0,
        recommendedContext: fundamentado ? `No trecho da página de origem que trata de "${alinhamentos[0].conceptLabel}".` : null,
        evidence: [
          `Grafo aprovado: a origem deve apontar para este artigo sob "${conceito}".`,
          ...(fundamentado ? [`O conceito é tratado por ${conceitoDe(semantic, alinhamentos[0].conceptId)?.sourceCount ?? 0} página(s) da amostra.`] : []),
        ],
        reason: fundamentado
          ? "O Radar não edita a página de origem nesta investigação; o requisito fica pronto para a revisão dela."
          : "A relação de entrada existe no grafo aprovado, mas esta investigação não analisou a página de origem e não encontrou contexto fundamentado para indicar onde o link cabe nela. O requisito permanece.",
      };
    });

  /* --------------------------- as oportunidades --------------------------- */

  const opportunities: RadarOutOfGraphOpportunity[] = research.conceptsWithoutGraphRelation.map(item => ({
    conceptId: item.conceptId,
    conceptLabel: item.conceptLabel,
    pages: item.pages,
    sampleSize: item.sampleSize,
    evidence: item.evidence,
    status: "NOT_IN_GRAPH_REQUIRES_ARCHITECT_DECISION",
  }));

  /* ------------------------------ as guardas ------------------------------ */

  const totalRecommendedLinks = [...outgoing, ...(siloPage ? [siloPage] : [])]
    .reduce((total, item) => total + item.recommendedOccurrences, 0);

  const mediana = research.competitorInternalLinkPattern.median;
  if (mediana !== null && totalRecommendedLinks > mediana * 2 && mediana > 0) {
    guards.push(`O plano soma ${totalRecommendedLinks} link(s) enquanto a amostra usa mediana de ${mediana}. Densidade acima do que o mercado pratica precisa de revisão humana antes de virar plano editorial.`);
  }
  const semVariante = aplicacoes.filter(item => item.recommendedOccurrences > 1 && item.anchor.anchorVariants.length < item.recommendedOccurrences - 1);
  if (semVariante.length) {
    guards.push(`${semVariante.length} destino(s) recebem mais de uma ocorrência com menos variantes de âncora do que ocorrências: repetir a mesma formulação soa artificial e deve ser evitado na redação.`);
  }
  /*
   * ZERO NÃO É REMOÇÃO.
   *
   * Esta guarda existe para que ninguém rio abaixo leia `0` como "o link não
   * é necessário" ou "a relação pode sair do grafo". O que ela diz é o limite
   * da rodada, e ele é declarado em vez de disfarçado com uma ocorrência que
   * a pesquisa não sustenta.
   */
  const semAplicacao = [...aplicacoes, ...incoming].filter(item => item.applicationStatus === "REQUIRED_RELATION_WITHOUT_SUPPORTED_PLACEMENT").length;
  if (semAplicacao) {
    guards.push(`${semAplicacao} relação(ões) permanecem estruturalmente exigidas pelo grafo e ficaram sem aplicação fundamentada nesta rodada. Zero ocorrências não remove a relação nem diz que o link é desnecessário: diz que esta investigação não encontrou onde aplicá-lo com evidência.`);
  }
  const recusados = aplicacoes.reduce((total, item) => total + item.rejectedContexts.length, 0);
  if (recusados) {
    guards.push(`${recusados} contexto(s) foram considerados e recusados por não trazerem momento novo ou evidência suficiente. Cada recusa está registrada com o motivo, no lugar de um link a mais.`);
  }
  /*
   * A GUARDA QUE SUBSTITUIU O TETO.
   *
   * Antes havia uma constante dizendo "no máximo dois, por mais forte que seja
   * a evidência" — heurística sobrepondo observação, exatamente o que a
   * diretriz proíbe. O que segura repetição agora é a exigência de contexto
   * novo com evidência crescente; quando ela é atendida três vezes, saem três.
   */
  guards.push("Cada ocorrência corresponde a um contexto semanticamente distinto: formulação diferente do mesmo assunto não gera link a mais.");

  if (opportunities.length) {
    limitations.push(`${opportunities.length} oportunidade(s) de link encontradas pela pesquisa não existem no grafo aprovado. Elas ficam registradas para decisão do Arquiteto e não entram no plano.`);
  }

  return { articleRole: research.articleRole, outgoing, incoming, siloPage, opportunities, totalRecommendedLinks, guards, limitations };
}
