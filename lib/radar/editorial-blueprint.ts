/**
 * O DOSSIÊ EDITORIAL DA PESQUISA — a camada que faltava entre a evidência e o
 * Planejador.
 *
 * O que o Radar mostra hoje é TELEMETRIA: 3 conceitos, 13 perguntas, 45
 * diferenciações, 19 fontes, 11 páginas comparáveis. Cada número é verdadeiro e
 * auditável, e nenhum deles responde a pergunta que a pessoa faz ao abrir a
 * tela: "com tudo isso, como este artigo deve ser construído?".
 *
 * Obrigar o Planejador — ou quem opera — a remontar o artigo de cabeça a partir
 * de cinco modelos técnicos é transferir para a leitura um trabalho que a
 * investigação já tem material para fazer.
 *
 *   SERP · páginas · fontes
 *          ↓
 *   modelos internos do Radar
 *          ↓
 *   BLUEPRINT EDITORIAL          ← este módulo
 *          ↓
 *   ArticleDNA + RadarEvidenceBundle
 *          ↓
 *   Planejador → ContentPlan final
 *
 * ISTO NÃO É O CONTENTPLAN, E A DIFERENÇA É DELIBERADA.
 *
 * O Radar propõe BLOCOS CANDIDATOS com o motivo de cada um. Ele não decide H2
 * final, ordem definitiva, título nem contagem de palavras — essas decisões são
 * do Planejador, que enxerga o Silo inteiro e o calendário. Um `workingTitle`
 * aqui é nome de trabalho para uma reunião editorial, não cabeçalho publicado.
 *
 * E NADA É INVENTADO. Cada bloco, pergunta, link, ponto de especialista e
 * oportunidade de vídeo aponta para a evidência que o sustenta. Onde a
 * evidência falta, a falta é declarada — um dossiê artificialmente completo
 * faria o Planejador planejar com mais confiança do que a pesquisa permite.
 *
 * Domínio puro: sem fetch, sem storage, sem provider, sem React.
 */

import { RADAR_CONCEPT_TYPE_LABEL, type RadarConceptType } from "./semantic-concept-model.ts";
import { radarConclusiveIntent, radarDeclaredArticleIntent } from "./editorial-identity.ts";

import type { RadarAiDiscoveryContext, RadarAnswerableUnit, RadarFactualSupportStatus } from "./ai-discovery-context.ts";
import type { RadarArticleResearchContext } from "./article-research-context.ts";
import type { RadarCompetitiveObservedModel } from "./competitive-observed-model.ts";

/* ============================ o que é entregue ========================== */

/** Quando o bloco tende a aparecer — nunca uma posição mágica. */
export type RadarSectionPlacement = "EARLY" | "MIDDLE" | "LATE" | "FLEXIBLE";

export type RadarSectionPriority = "ESSENTIAL" | "RECOMMENDED" | "OPTIONAL";

/** De onde veio cada recomendação. Sem isto, o dossiê vira opinião. */
export type RadarBlueprintProvenance = {
  source: "SERP" | "SEMANTIC_CONCEPT" | "QUESTION_CLUSTER" | "AUTHORITY_EVIDENCE" | "INTERNAL_LINK_PLAN" | "SPECIALIST_REQUIREMENT" | "AI_DISCOVERY" | "ARTICLE_DNA";
  detail: string;
};

export type RadarBlueprintLink = {
  nodeId: string;
  destination: string;
  direction: string;
  anchor: string;
  occurrences: number;
  /** Quando a relação existe e esta rodada não achou onde aplicá-la. */
  unresolved: boolean;
  reason: string;
};

export type RadarBlueprintQuestion = {
  id: string;
  text: string;
  priority: RadarSectionPriority;
  /** O que a resposta precisa entregar — não a resposta. */
  answerRequirement: string;
  marketStatement: string;
  factualSupport: RadarFactualSupportStatus;
};

/**
 * UM BLOCO NARRATIVO CANDIDATO — com o porquê ao lado.
 *
 * "Por que entra" é o campo mais importante desta estrutura. Uma lista de
 * seções sem justificativa é um sumário; com a justificativa, é uma decisão
 * editorial auditável que alguém pode contestar com evidência.
 */
export type RadarSectionCandidate = {
  id: string;
  conceptId: string;
  /** O nome de trabalho. NÃO é H2 final — o Planejador decide o título. */
  workingTitle: string;
  conceptTypeLabel: string;
  /** Por que este bloco entra: a evidência, em uma frase de quem opera. */
  purpose: string;
  priority: RadarSectionPriority;
  placement: RadarSectionPlacement;
  placementReason: string;
  questions: RadarBlueprintQuestion[];
  /** Termos que precisam ser definidos antes de aprofundar. */
  definitions: Array<{ term: string; reason: string }>;
  entities: { primary: string | null; related: string[] };
  marketEvidence: { pages: number; sampleSize: number; statement: string };
  factualStatus: RadarFactualSupportStatus;
  factualNote: string;
  specialistRequirementIds: string[];
  internalLinks: RadarBlueprintLink[];
  videoOpportunityId: string | null;
  differentiation: string | null;
  limitations: string[];
  provenance: RadarBlueprintProvenance[];
  confidence: "HIGH" | "MEDIUM" | "LOW";
};

export type RadarOpeningGuidance = {
  directives: string[];
  evidence: string;
};

export type RadarClosingGuidance = {
  directives: string[];
  evidence: string;
} | null;

/** A pauta que chega ao especialista pronta para ser lida por um profissional. */
export type RadarSpecialistBrief = {
  requirementId: string;
  topic: string;
  question: string;
  whyNeeded: string;
  /** O que se espera receber. Nunca "a contribuição" genérica. */
  expectedContribution: Array<"VALIDATE" | "CORRECT" | "QUALIFY" | "ADD_EXPERIENCE">;
  relatedSectionId: string | null;
  relatedSectionTitle: string | null;
  claimContext: string;
  evidenceContext: string;
  priority: "HIGH" | "MEDIUM" | "LOW";
  provenance: RadarBlueprintProvenance[];
};

/** A pauta de apoio audiovisual — onde um vídeo enriquece a narrativa. */
export type RadarVideoBrief = {
  id: string;
  topic: string;
  narrativePurpose: string;
  whatToLookFor: string[];
  relatedSectionId: string | null;
  relatedSectionTitle: string | null;
  questions: string[];
  entities: string[];
  evidenceNeeded: string;
  priority: "HIGH" | "MEDIUM" | "LOW";
  provenance: RadarBlueprintProvenance[];
};

export type RadarEditorialBlueprint = {
  article: {
    title: string | null;
    principal: string | null;
    objective: string;
    intent: string | null;
    funnel: string | null;
    siloRole: string | null;
  };
  opening: RadarOpeningGuidance;
  sections: RadarSectionCandidate[];
  closing: RadarClosingGuidance;
  /** Perguntas essenciais do artigo inteiro, já ordenadas por prioridade. */
  essentialQuestions: RadarBlueprintQuestion[];
  entities: { primary: string[]; related: Array<{ label: string; relatedTo: string | null }> };
  differentiation: {
    marketCovers: string[];
    underCovered: string[];
    ownOpportunities: string[];
  };
  unresolvedLinks: RadarBlueprintLink[];
  specialistBriefs: RadarSpecialistBrief[];
  videoBriefs: RadarVideoBrief[];
  limitations: string[];
  /** Quanto da leitura se sustenta: quantos blocos, com que evidência. */
  readiness: { state: "READY" | "PARTIAL" | "INSUFFICIENT"; reason: string };
};

/* ============================== a derivação ============================= */

const assinatura = (valor: string): string => {
  let hash = 0x811c9dc5;
  for (let index = 0; index < valor.length; index += 1) {
    hash ^= valor.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
};

const prioridadeDaUnidade = (unit: RadarAnswerableUnit): RadarSectionPriority =>
  unit.importance === "CORE" ? "ESSENTIAL" : unit.importance === "SUPPORTING" ? "RECOMMENDED" : "OPTIONAL";

/** O pior estado de suporte entre as necessidades do bloco. */
function suporteConsolidado(unidades: readonly RadarAnswerableUnit[]): RadarFactualSupportStatus {
  const ordem: RadarFactualSupportStatus[] = ["CONFLICTED", "MISSING", "PARTIAL", "ADEQUATE", "NOT_REQUIRED"];
  for (const estado of ordem) {
    if (unidades.some(unit => unit.factualEvidenceRequirement.support === estado)) return estado;
  }
  return "NOT_REQUIRED";
}

/**
 * ONDE O BLOCO TENDE A APARECER — pela evidência, nunca por número de seção.
 *
 * O mercado responder cedo a uma necessidade é um fato observável, e é a única
 * base honesta para sugerir posição. "SECTION_2" seria invenção com aparência
 * de precisão; "cedo, porque 9 de 11 páginas abrem por aqui" é leitura.
 */
function posicaoDoBloco(input: {
  unidades: readonly RadarAnswerableUnit[];
  tipo: RadarConceptType;
  /** Este é o bloco de maior recorrência da investigação? */
  aberturaNatural: boolean;
}): { placement: RadarSectionPlacement; reason: string } {
  const unidades = input.unidades;
  const tipo = input.tipo;
  const central = unidades.some(unit => unit.importance === "CORE");
  const forte = unidades.some(unit => unit.marketRecurrence.recurrence === "STRONG");

  /*
   * UMA ABERTURA, NÃO TRÊS — o dump corrigiu duas vezes esta regra.
   *
   * Primeiro, "Como identificar a pele oleosa?" (12 de 12 páginas, CORE) saía
   * como "posição flexível" porque o conceito é do tipo QUESTION e a regra só
   * olhava três tipos. Relaxar isso trouxe o erro oposto: os TRÊS blocos viraram
   * EARLY, porque todos eram centrais e fortes — e um texto com três inícios não
   * orienta ordem nenhuma.
   *
   * Abre o bloco de MAIOR recorrência. Os outros seguem a leitura de tipo: causa
   * depois da caracterização, processo depois do reconhecimento, comparação no
   * fim. É o que a amostra faz.
   */
  if (input.aberturaNatural && central && forte) {
    return { placement: "EARLY", reason: "A necessidade mais recorrente da amostra, e central: responder cedo evita atrasar a resposta principal." };
  }

  if (tipo === "PROBLEM" || tipo === "ENTITY" || tipo === "TOPIC") {
    return { placement: "EARLY", reason: "Identificar o tema antes de aprofundar é o que a amostra faz." };
  }
  if (tipo === "CAUSE") {
    return { placement: "MIDDLE", reason: "Causa explica o que já foi identificado: a amostra a trata depois da caracterização." };
  }
  if (tipo === "PROCESS") {
    return { placement: "MIDDLE", reason: "O processo depende de o leitor já reconhecer o problema." };
  }
  if (tipo === "PRODUCT" || tipo === "COMPARISON") {
    return { placement: "LATE", reason: "Comparação e escolha aparecem depois do entendimento, na leitura da amostra." };
  }
  return { placement: "FLEXIBLE", reason: "A amostra não converge para uma posição: o Planejador decide onde encaixa melhor." };
}

/**
 * UM VÍDEO SÓ ENTRA QUANDO HÁ RAZÃO NARRATIVA — §17.
 *
 * "Todo artigo precisa de vídeo" é heurística de quem vende produção, não
 * leitura de evidência. Um vídeo ajuda quando a necessidade é DEMONSTRÁVEL:
 * um processo a executar, um sinal a reconhecer, uma comparação a ver lado a
 * lado, ou uma explicação que ganha com a voz de quem pratica.
 *
 * Definição textual, dado numérico e afirmação factual não melhoram em vídeo —
 * e propor um ali seria encher a pauta de trabalho sem retorno.
 */
function razaoDeVideo(input: {
  tipo: RadarConceptType;
  unidades: readonly RadarAnswerableUnit[];
  temEspecialista: boolean;
}): { purpose: string; lookFor: string[]; priority: "HIGH" | "MEDIUM" | "LOW" } | null {
  const central = input.unidades.some(unit => unit.importance === "CORE");
  const paginas = Math.max(...input.unidades.map(unit => unit.marketRecurrence.pages), 0);

  if (input.tipo === "PROCESS") {
    return {
      purpose: "A necessidade é uma sequência prática: ver a execução ensina o que o texto só descreve.",
      lookFor: ["a ordem real dos passos", "o que se faz em cada etapa", "erros comuns durante a execução", "quanto tempo cada parte leva"],
      priority: central ? "HIGH" : "MEDIUM",
    };
  }
  if (input.tipo === "COMPARISON") {
    return {
      purpose: "A comparação fica mais clara lado a lado do que em parágrafos alternados.",
      lookFor: ["as opções comparadas", "o critério usado para diferenciar", "em que situação cada uma se aplica"],
      priority: "MEDIUM",
    };
  }
  if (input.tipo === "PROBLEM" || input.tipo === "ATTRIBUTE") {
    return {
      purpose: "A necessidade envolve características observáveis: mostrar os sinais é mais direto que descrevê-los.",
      lookFor: ["os sinais visíveis", "onde eles aparecem", "exemplos reais", "o que distingue de casos parecidos"],
      priority: central && paginas >= 3 ? "HIGH" : "MEDIUM",
    };
  }
  if (input.temEspecialista) {
    return {
      purpose: "A afirmação depende de julgamento profissional: a explicação de quem pratica acrescenta nuance que o texto sozinho não carrega.",
      lookFor: ["a ressalva do profissional", "o caso em que a regra não vale", "o erro comum de quem lê sobre o assunto"],
      priority: "MEDIUM",
    };
  }
  return null;
}

const CONTRIBUICAO_POR_TIPO: Record<string, Array<"VALIDATE" | "CORRECT" | "QUALIFY" | "ADD_EXPERIENCE">> = {
  RESOLVE_CONFLICT: ["VALIDATE", "CORRECT", "QUALIFY"],
  RESOLVE_FACTUAL_UNCERTAINTY: ["VALIDATE", "CORRECT"],
  VERIFY_AND_ADD_EXPERIENCE: ["VALIDATE", "ADD_EXPERIENCE", "QUALIFY"],
};

/**
 * O BLUEPRINT, DERIVADO — nunca recalculado.
 *
 * Tudo aqui já foi concluído por alguma autoridade anterior. Este módulo agrupa
 * por bloco narrativo, ordena por evidência e escreve em português de reunião
 * editorial. Ele não reinterpreta conceito, não reclassifica pergunta, não
 * decide link e não cria afirmação factual.
 */
export function buildRadarEditorialBlueprint(input: {
  context: RadarArticleResearchContext;
  observed: RadarCompetitiveObservedModel;
  /** O contexto de descoberta, que já cruzou necessidade × evidência × especialista. */
  discovery?: RadarAiDiscoveryContext | null;
  articleTitle?: string | null;
  /** A intenção e o funil como a faixa do Article os lê. */
  intentLabel?: string | null;
  funnelLabel?: string | null;
}): RadarEditorialBlueprint {
  const observed = input.observed;
  const discovery = input.discovery || observed.aiDiscovery;
  const plano = observed.internalLinkPlan;
  const requisitos = observed.authorityEvidence.specialistReviewRequirements;

  /* ---------------------- os blocos, por conceito ---------------------- */

  const porConceito = new Map<string, RadarAnswerableUnit[]>();
  for (const unit of discovery.answerableUnits) {
    porConceito.set(unit.concept.id, [...(porConceito.get(unit.concept.id) || []), unit]);
  }

  const conceitoPorId = new Map(observed.concepts.all.map(item => [item.id, item]));
  const sections: RadarSectionCandidate[] = [];
  const videoBriefs: RadarVideoBrief[] = [];
  const usadosNoEspecialista = new Map<string, { id: string; title: string }>();

  /* A ordem da leitura: essencial primeiro, e recorrência desempata. */
  const conceitosOrdenados = [...porConceito.entries()].sort((esquerda, direita) => {
    const peso = (unidades: RadarAnswerableUnit[]) =>
      (unidades.some(unit => unit.importance === "CORE") ? 0 : 1) * 1000
      - Math.max(...unidades.map(unit => unit.marketRecurrence.pages), 0);
    return peso(esquerda[1]) - peso(direita[1]);
  });

  for (const [conceptId, unidades] of conceitosOrdenados) {
    const conceito = conceitoPorId.get(conceptId) || null;
    const rotulo = unidades[0].concept.label;
    const tipo = unidades[0].concept.type;
    const sectionId = `section:${assinatura(`${conceptId}|${rotulo}`)}`;

    const recorrencia = unidades.reduce(
      (maior, unit) => (unit.marketRecurrence.pages > maior.pages ? unit.marketRecurrence : maior),
      unidades[0].marketRecurrence,
    );
    const posicao = posicaoDoBloco({ unidades, tipo, aberturaNatural: sections.length === 0 });
    const prioridade: RadarSectionPriority = unidades.some(unit => unit.importance === "CORE")
      ? "ESSENTIAL"
      : unidades.some(unit => unit.importance === "SUPPORTING") ? "RECOMMENDED" : "OPTIONAL";

    const questions: RadarBlueprintQuestion[] = unidades.map(unit => ({
      id: unit.id,
      text: unit.questionOrNeed,
      priority: prioridadeDaUnidade(unit),
      answerRequirement: unit.answerRequirement,
      marketStatement: unit.marketRecurrence.statement,
      factualSupport: unit.factualEvidenceRequirement.support,
    }));

    /* Definições cujo termo sustenta este conceito — §9. */
    const definitions = discovery.definitionRequirements
      .filter(item => item.conceptId === conceptId || item.dependents.includes(rotulo))
      .map(item => ({ term: item.term, reason: item.reason }));

    /*
     * CADA LINK APARECE UMA VEZ, NO BLOCO DE MAIOR AFINIDADE — §13.
     *
     * O DUMP MOSTROU O MESMO LINK EM TRÊS BLOCOS, com duas ocorrências em cada:
     * o plano recomenda duas no total e a leitura sugeria seis. Um link que se
     * repete a cada bloco que compartilha o conceito faria o Planejador inserir
     * três vezes o que a evidência sustentou uma.
     *
     * O bloco dono é o do conceito com mais páginas entre os contextos
     * sustentados do link. Os demais continuam alcançáveis no plano inteiro,
     * que viaja intacto no dossiê.
     */
    const internalLinks: RadarBlueprintLink[] = plano.outgoing
      .filter(item => {
        const afinidades = item.preferredConcepts.filter(conceptoDoLink => conceptoDoLink.conceptId === conceptId);
        if (!afinidades.length) return false;
        const dono = [...item.preferredConcepts].sort((esquerda, direita) => direita.pages - esquerda.pages)[0];
        return dono.conceptId === conceptId;
      })
      .map(item => ({
        nodeId: item.nodeId,
        destination: item.slug || item.nodeId,
        direction: "OUTGOING",
        anchor: item.anchor.recommendedAnchor,
        occurrences: item.recommendedOccurrences,
        unresolved: item.applicationStatus !== "RESOLVED",
        reason: item.reason,
      }));

    const requisitosDoBloco = unidades
      .map(unit => unit.specialistRequirement?.requirementId)
      .filter((valor): valor is string => Boolean(valor));
    for (const requirementId of requisitosDoBloco) {
      usadosNoEspecialista.set(requirementId, { id: sectionId, title: rotulo });
    }

    const diferencial = observed.differentiations.find(item => item.subject === rotulo) || null;
    const lacuna = observed.gaps.find(item => item.subject === rotulo) || null;

    const video = razaoDeVideo({ tipo, unidades, temEspecialista: requisitosDoBloco.length > 0 });
    let videoOpportunityId: string | null = null;
    if (video) {
      videoOpportunityId = `video:${assinatura(`${conceptId}|${rotulo}`)}`;
      videoBriefs.push({
        id: videoOpportunityId,
        topic: rotulo,
        narrativePurpose: video.purpose,
        whatToLookFor: video.lookFor,
        relatedSectionId: sectionId,
        relatedSectionTitle: rotulo,
        questions: unidades.map(unit => unit.questionOrNeed),
        entities: [unidades[0].entityContext.primary, ...unidades[0].entityContext.related].filter((valor): valor is string => Boolean(valor)),
        evidenceNeeded: recorrencia.statement,
        priority: video.priority,
        provenance: [
          { source: "SEMANTIC_CONCEPT", detail: `Conceito "${rotulo}" (${RADAR_CONCEPT_TYPE_LABEL[tipo]}).` },
          { source: "SERP", detail: recorrencia.statement },
        ],
      });
    }

    const suporte = suporteConsolidado(unidades);
    sections.push({
      id: sectionId,
      conceptId,
      workingTitle: rotulo,
      conceptTypeLabel: RADAR_CONCEPT_TYPE_LABEL[tipo],
      purpose: conceito?.evidence || recorrencia.statement,
      priority: prioridade,
      placement: posicao.placement,
      placementReason: posicao.reason,
      questions,
      definitions,
      entities: unidades[0].entityContext,
      marketEvidence: { pages: recorrencia.pages, sampleSize: recorrencia.sampleSize, statement: recorrencia.statement },
      factualStatus: suporte,
      factualNote: unidades.find(unit => unit.factualEvidenceRequirement.support === suporte)?.factualEvidenceRequirement.reason || "",
      specialistRequirementIds: requisitosDoBloco,
      internalLinks,
      videoOpportunityId,
      differentiation: diferencial?.evidence || lacuna?.evidence || null,
      limitations: unidades.filter(unit => unit.blockedBy).map(unit => unit.readinessReason),
      provenance: [
        { source: "SEMANTIC_CONCEPT", detail: conceito?.evidence || `Conceito "${rotulo}" observado na amostra.` },
        { source: "AI_DISCOVERY", detail: `${unidades.length} necessidade(s) derivada(s) desta camada.` },
        ...(internalLinks.length ? [{ source: "INTERNAL_LINK_PLAN" as const, detail: `${internalLinks.length} aplicação(ões) de link sustentada(s) neste contexto.` }] : []),
        ...(requisitosDoBloco.length ? [{ source: "SPECIALIST_REQUIREMENT" as const, detail: `${requisitosDoBloco.length} ponto(s) preparado(s) para revisão profissional.` }] : []),
      ],
      confidence: unidades.every(unit => unit.confidence === "HIGH") ? "HIGH" : unidades.some(unit => unit.confidence === "LOW") ? "LOW" : "MEDIUM",
    });
  }

  /* ------------------------- a pauta do especialista ------------------- */

  /*
   * TODA PAUTA PRECISA DIZER ONDE ENTRA NO ARTIGO.
   *
   * O DUMP MOSTROU "bloco: null" na única pauta do especialista: o requisito
   * nasceu de uma afirmação sensível cujo conceito não gerou bloco próprio, e o
   * profissional receberia a pergunta sem saber a que parte do texto ela
   * pertence — que é justamente o contexto que torna a pauta respondível.
   *
   * A segunda tentativa é pelo CONCEITO da afirmação: se algum bloco trata do
   * mesmo conceito, é ali que a revisão entra. Continuando sem correspondência,
   * o campo fica nulo — dizer "não sei onde encaixa" é honesto; inventar um
   * bloco não é.
   */
  const secaoPorConceito = new Map(sections.map(secao => [secao.conceptId, secao]));
  const claimPorId = new Map(observed.authorityEvidence.claims.map(claim => [claim.claimId, claim]));

  const specialistBriefs: RadarSpecialistBrief[] = requisitos.map(requisito => {
    const porUnidade = usadosNoEspecialista.get(requisito.requirementId) || null;
    const claim = claimPorId.get(requisito.claimId) || null;
    const porConceito = claim ? secaoPorConceito.get(claim.conceptId) || null : null;
    const secao = porUnidade || (porConceito ? { id: porConceito.id, title: porConceito.workingTitle } : null);
    return {
      requirementId: requisito.requirementId,
      topic: requisito.topic,
      question: requisito.specificQuestion,
      whyNeeded: requisito.whyReviewIsNeeded,
      expectedContribution: CONTRIBUICAO_POR_TIPO[requisito.kind] || ["VALIDATE"],
      relatedSectionId: secao?.id || null,
      /*
       * SEM BLOCO, O PROFISSIONAL PRECISA SABER DISSO — não receber um vazio.
       *
       * A afirmação aparece na amostra e exige revisão, mas a investigação não
       * derivou uma necessidade própria para ela: não há bloco a que amarrá-la.
       * Dizer isso é informação; deixar nulo faria a pauta parecer incompleta
       * por descuido.
       */
      relatedSectionTitle: secao?.title
        || "Esta revisão ainda não se liga a um bloco proposto: a afirmação aparece na amostra sem necessidade própria derivada.",
      claimContext: requisito.claim,
      evidenceContext: [requisito.marketObservation, requisito.factualEvidence, requisito.conflict]
        .filter((valor): valor is string => Boolean(valor)).join(" "),
      priority: requisito.priority,
      provenance: [
        { source: "AUTHORITY_EVIDENCE", detail: `Afirmação de relevância ${requisito.ymylRelevance.toLowerCase()}.` },
        { source: "SPECIALIST_REQUIREMENT", detail: requisito.provenance },
      ],
    };
  });

  /* ---------------------------- abertura e fecho ----------------------- */

  const essenciais = sections
    .flatMap(secao => secao.questions)
    .filter(pergunta => pergunta.priority === "ESSENTIAL");
  const primeiraEssencial = essenciais[0] || null;

  const opening: RadarOpeningGuidance = {
    directives: [
      primeiraEssencial
        ? `Responder diretamente a necessidade central: ${primeiraEssencial.text}`
        : "Identificar o tema antes de qualquer aprofundamento.",
      "Deixar claro do que a página trata, sem introdução genérica.",
      ...(sections[0]?.placement === "EARLY" ? ["Não atrasar a resposta principal: a amostra a entrega cedo."] : []),
    ],
    evidence: sections[0]?.marketEvidence.statement || "A amostra não permitiu observar padrão de abertura.",
  };

  /*
   * FECHAMENTO SÓ QUANDO A AMOSTRA SUSTENTA — §7.
   *
   * Exigir "conclusão" em todo artigo é hábito de template. O Gate 9 observa se
   * a amostra fecha e como; sem esse padrão, o Radar não inventa a exigência.
   */
  const padraoDeFecho = observed.structure.presences.find(item => /fecho|conclus|closing/i.test(item.label)) || null;
  const closing: RadarClosingGuidance = padraoDeFecho && padraoDeFecho.present > 0
    ? {
      directives: [
        "Fechar retomando o que a página resolveu, sem repetir o texto.",
        ...(sections.some(secao => secao.placement === "LATE") ? ["Encaminhar para a decisão quando o bloco final tratar de escolha."] : []),
      ],
      evidence: `${padraoDeFecho.present} de ${padraoDeFecho.sampleSize} página(s) da amostra fecham o texto.`,
    }
    : null;

  /* ----------------------------- diferenciação ------------------------- */

  const differentiation = {
    marketCovers: observed.concepts.recurrent.slice(0, 8).map(item => item.canonicalLabel),
    underCovered: observed.concepts.undercovered.slice(0, 8).map(item => item.canonicalLabel),
    ownOpportunities: observed.differentiations
      .filter(item => item.basis === "ARTICLE_DECLARES")
      .slice(0, 8)
      .map(item => item.subject),
  };

  /* Relação exigida sem contexto sustentado: viaja inteira, §10 do Gate 16. */
  const unresolvedLinks: RadarBlueprintLink[] = [
    ...plano.outgoing.filter(item => item.applicationStatus !== "RESOLVED").map(item => ({
      nodeId: item.nodeId, destination: item.slug || item.nodeId, direction: "OUTGOING",
      anchor: item.anchor.recommendedAnchor, occurrences: item.recommendedOccurrences, unresolved: true, reason: item.reason,
    })),
    ...plano.incoming.filter(item => item.applicationStatus !== "RESOLVED").map(item => ({
      nodeId: item.sourceNodeId, destination: item.sourceNodeId, direction: "INCOMING",
      anchor: item.anchor.recommendedAnchor, occurrences: item.recommendedOccurrences, unresolved: true, reason: item.reason,
    })),
  ];

  const readiness: RadarEditorialBlueprint["readiness"] = !sections.length
    ? { state: "INSUFFICIENT", reason: "A investigação não produziu necessidade suficiente para propor um bloco editorial." }
    : sections.some(secao => secao.factualStatus === "MISSING" || secao.factualStatus === "CONFLICTED") || observed.sample.failedFinal > 0
      ? { state: "PARTIAL", reason: `${sections.length} bloco(s) propostos, com pendências declaradas de evidência ou de amostra.` }
      : { state: "READY", reason: `${sections.length} bloco(s) propostos, cada um sustentado pela amostra.` };

  return {
    article: {
      title: input.articleTitle || input.context.article.promise,
      principal: input.context.keywords.find(item => item.identity.role === "principal")?.identity.text || null,
      objective: input.context.article.promise || "O objetivo da página não foi declarado no fundamento.",
      /* `??` não protege de "unknown": o sentinela é uma string, não um nulo. */
      intent: radarConclusiveIntent(input.intentLabel) ?? radarDeclaredArticleIntent(input.context.article),
      funnel: input.funnelLabel ?? input.context.article.classification?.funnelLabel ?? null,
      siloRole: input.context.silo?.articleRole || input.context.article.hierarchy,
    },
    opening,
    sections,
    closing,
    essentialQuestions: essenciais,
    entities: {
      primary: observed.entities.article,
      related: observed.entities.related.map(item => ({ label: item.label, relatedTo: item.relatedTo })),
    },
    differentiation,
    unresolvedLinks,
    specialistBriefs,
    videoBriefs,
    limitations: [...observed.limitations],
    readiness,
  };
}

/* ============================ a leitura curta ========================== */

/** O resumo da primeira camada — §21. Números que abrem uma leitura, não telemetria. */
export type RadarBlueprintSummary = {
  objective: string;
  sections: number;
  essentialQuestions: number;
  plannedLinks: number;
  specialistPoints: number;
  videoOpportunities: number;
  readinessLabel: string;
  readinessTone: "success" | "warning" | "neutral";
};

export function buildRadarBlueprintSummary(blueprint: RadarEditorialBlueprint): RadarBlueprintSummary {
  return {
    objective: blueprint.article.objective,
    sections: blueprint.sections.length,
    essentialQuestions: blueprint.essentialQuestions.length,
    plannedLinks: blueprint.sections.reduce((total, secao) => total + secao.internalLinks.reduce((soma, link) => soma + link.occurrences, 0), 0),
    specialistPoints: blueprint.specialistBriefs.length,
    videoOpportunities: blueprint.videoBriefs.length,
    readinessLabel: { READY: "Pronto", PARTIAL: "Parcial", INSUFFICIENT: "Sem material suficiente" }[blueprint.readiness.state],
    readinessTone: blueprint.readiness.state === "READY" ? "success" : blueprint.readiness.state === "PARTIAL" ? "warning" : "neutral",
  };
}

export const RADAR_SPECIALIST_CONTRIBUTION_LABEL: Record<RadarSpecialistBrief["expectedContribution"][number], string> = {
  VALIDATE: "Validar",
  CORRECT: "Corrigir",
  QUALIFY: "Indicar ressalva",
  ADD_EXPERIENCE: "Acrescentar experiência prática",
};

export const RADAR_SECTION_PLACEMENT_LABEL: Record<RadarSectionPlacement, string> = {
  EARLY: "Início",
  MIDDLE: "Meio",
  LATE: "Final",
  FLEXIBLE: "Posição flexível",
};

export const RADAR_SECTION_PRIORITY_LABEL: Record<RadarSectionPriority, string> = {
  ESSENTIAL: "Essencial",
  RECOMMENDED: "Recomendado",
  OPTIONAL: "Opcional",
};

export const RADAR_FACTUAL_STATUS_LABEL: Record<RadarFactualSupportStatus, string> = {
  ADEQUATE: "Sustentada por fonte",
  PARTIAL: "Sustentação parcial",
  MISSING: "Sem fonte adequada",
  CONFLICTED: "Evidência em conflito",
  NOT_REQUIRED: "Não exige fonte",
};
