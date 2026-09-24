/*
 * FIXTURES DAS TELAS DO ASSUNTO — SDD do Assunto, F3.1 (telas do Radar).
 *
 * Objetos mínimos, montados à mão, com os campos que as telas leem. Servem aos
 * testes de `radar-assunto-telas.test.mts` e à medição do markup SEM Assunto
 * contra a versão do HEAD (o hash dourado fica no teste). Sem rede, sem banco.
 */
import type { RadarEditorialBlueprint, RadarSectionCandidate } from "../lib/radar/editorial-blueprint.ts";
import type { RadarEditorialArticleModel, RadarEditorialSection } from "../lib/radar/editorial-article-model.ts";
import type { RadarR6ExpertTopicContext } from "../lib/radar/r6-sequential.ts";
import {
  RADAR_SUBJECT_MUST_COVER_REASON,
  RADAR_SUBJECT_NO_TOUCH_ALERT,
  radarSubjectTurnSectionId,
  radarSubjectTurnTitle,
} from "../lib/radar/declared-subject.ts";

export const FRASE_DO_ASSUNTO = "SEO para clínicas";
export const NOTA_DO_ASSUNTO = "Para donos de clínica que querem pacientes pelo Google";
export const DESTINO_DO_ASSUNTO = "https://exemplo.com/seo-para-clinicas";
export const ID_DA_VIRADA = radarSubjectTurnSectionId(FRASE_DO_ASSUNTO);

const candidato = (id: string, titulo: string, paginas: number, extra: Partial<RadarSectionCandidate> = {}): RadarSectionCandidate => ({
  id,
  conceptId: id,
  workingTitle: titulo,
  conceptTypeLabel: "Conceito",
  purpose: `Cobrir ${titulo.toLowerCase()} como a amostra faz.`,
  priority: "ESSENTIAL",
  placement: "EARLY",
  placementReason: "Aparece cedo na amostra.",
  questions: [{ id: `${id}:q1`, text: `O que é ${titulo.toLowerCase()}?`, priority: "ESSENTIAL", answerRequirement: "Responder de forma direta.", marketStatement: `${paginas} de 8 páginas.`, factualSupport: "NOT_REQUIRED" }],
  definitions: [],
  entities: { primary: null, related: [] },
  marketEvidence: { pages: paginas, sampleSize: 8, statement: `${paginas} de 8 páginas.` },
  factualStatus: "NOT_REQUIRED",
  factualNote: "",
  specialistRequirementIds: [],
  internalLinks: [],
  videoOpportunityId: null,
  differentiation: null,
  limitations: [],
  provenance: [],
  confidence: "MEDIUM",
  ...extra,
});

/** O bloco sintético como o `editorial-blueprint` o monta (F3.1). */
export const secaoDaVirada = (alerta: string | null): RadarSectionCandidate => candidato(ID_DA_VIRADA, radarSubjectTurnTitle(FRASE_DO_ASSUNTO), 0, {
  conceptTypeLabel: "Assunto declarado",
  purpose: RADAR_SUBJECT_MUST_COVER_REASON,
  placement: "FLEXIBLE",
  placementReason: "Exigida pelo Assunto declarado: o lugar é da arquitetura do artigo-modelo e, no fim, do Redator.",
  questions: [],
  marketEvidence: { pages: 0, sampleSize: 8, statement: "Nenhuma página da amostra trata o Assunto como bloco próprio (0 de 8); a seção é exigida pelo ArticleDNA." },
  limitations: alerta ? [alerta] : [],
  confidence: "LOW",
});

export function blueprintFixture(comAssunto: boolean): RadarEditorialBlueprint {
  const observados = [candidato("section:a", "Marketing médico", 6), candidato("section:b", "Canais de aquisição", 4)];
  const limitacoes = ["2 página(s) selecionada(s) não puderam ser extraídas; o que elas cobririam não foi observado."];
  return {
    article: { title: "Marketing para clínicas", principal: "marketing para clínicas", objective: "Explicar como uma clínica atrai pacientes.", intent: "Informacional", funnel: "Topo", siloRole: "Pilar" },
    opening: { directives: ["Responder cedo o que é marketing para clínicas."], evidence: "6 de 8 páginas abrem com definição." },
    sections: comAssunto ? [...observados, secaoDaVirada(RADAR_SUBJECT_NO_TOUCH_ALERT)] : observados,
    closing: { directives: ["Fechar com o próximo passo."], evidence: "4 de 8 páginas fecham com chamada." },
    essentialQuestions: [],
    entities: { primary: [], related: [] },
    differentiation: { marketCovers: ["canais"], underCovered: ["métricas"], ownOpportunities: [] },
    unresolvedLinks: [],
    specialistBriefs: [],
    videoBriefs: [],
    limitations: comAssunto ? [...limitacoes, RADAR_SUBJECT_NO_TOUCH_ALERT] : limitacoes,
    readiness: { state: "PARTIAL", reason: "2 bloco(s) propostos, com pendências declaradas." },
  };
}

const secao = (id: string, titulo: string, extra: Partial<RadarEditorialSection> = {}): RadarEditorialSection => ({
  id,
  level: 2,
  parentId: null,
  editorialFunction: "EXPLANATION",
  headingDirection: "Explicar sem repetir a abertura.",
  headingSuggestion: titulo,
  objective: `Explicar ${titulo.toLowerCase()}.`,
  readerQuestion: `O que é ${titulo.toLowerCase()}?`,
  keyMessage: null,
  coveragePoints: ["definição", "exemplo"],
  mustCoverReasons: [],
  childSections: [],
  evidenceStrength: "STRONG",
  evidenceRefs: ["ref:1"],
  factualSupport: "NOT_REQUIRED",
  factualRequirement: null,
  specialistRequirement: null,
  internalLinks: [],
  mediaOpportunity: [],
  reason: "Observado em 6 de 8 páginas.",
  ...extra,
});

export function articleModelFixture(comAssunto: boolean): RadarEditorialArticleModel {
  const virada = secao(ID_DA_VIRADA, radarSubjectTurnTitle(FRASE_DO_ASSUNTO), {
    level: 3,
    parentId: "section:b",
    coveragePoints: [],
    mustCoverReasons: [RADAR_SUBJECT_MUST_COVER_REASON],
    evidenceStrength: "DNA_REQUIRED",
    evidenceRefs: [],
    reason: "Exigida pelo Assunto declarado.",
  });
  const exigidaPeloDna = secao("section:dna", "Custos do marketing", { evidenceStrength: "DNA_REQUIRED", mustCoverReasons: ["O ArticleDNA declara este tópico."] });
  const sections = [
    secao("section:a", "Marketing médico"),
    secao("section:b", "Canais de aquisição", comAssunto ? { childSections: [virada] } : {}),
    exigidaPeloDna,
  ];
  const modelo = {
    articleIdentity: { articleId: "article-1", articleDnaVersionId: "adna-v1", principalKeyword: "marketing para clínicas", intentLabel: "Informacional", funnelLabel: "Topo", siloRole: "Pilar" },
    titleSuggestion: "Marketing para clínicas: como atrair pacientes",
    titleAlternatives: [],
    titleDirection: "Titular pela principal.",
    editorialObjective: "Explicar.",
    editorialAngle: "Prático",
    readerPromise: "Saber por onde começar.",
    opening: { hookDirection: "Começar pela dor.", promise: "Um caminho claro.", initialAnswer: "Marketing para clínicas é…", transition: "Seguir para os canais." },
    sections,
    conclusion: {
      synthesis: "Resumir os canais.",
      nextStep: "Escolher um canal.",
      callToAction: "Conhecer o serviço.",
      ...(comAssunto ? { destinationDirection: `Levar o leitor a ${DESTINO_DO_ASSUNTO}.` } : {}),
    },
    internalLinkApplications: [],
    evidenceNeeds: [],
    specialistNeeds: [],
    mediaPlan: [],
    mediaSummary: null,
    candidates: [],
    readiness: { state: "READY", label: "Pronto", reasons: [] },
    limitations: comAssunto ? [RADAR_SUBJECT_NO_TOUCH_ALERT] : [],
  } as unknown as RadarEditorialArticleModel;
  if (!comAssunto) return modelo;
  return {
    ...modelo,
    declaredSubject: {
      phrase: FRASE_DO_ASSUNTO,
      note: NOTA_DO_ASSUNTO,
      destinationUrl: DESTINO_DO_ASSUNTO,
      criterion: "LEXICAL_STEMS",
      criterionLabel: "Critério por palavras.",
      stems: ["clinicas"],
      turnSection: {
        id: ID_DA_VIRADA, heading: radarSubjectTurnTitle(FRASE_DO_ASSUNTO), source: "SYNTHETIC", pages: 0, sampleSize: 8,
        placement: "H3", hostSectionId: "section:b", hostHeading: "Canais de aquisição", mustCoverReason: RADAR_SUBJECT_MUST_COVER_REASON,
      },
      suggestedPosition: null,
      suggestedPositionLabel: "Sem sinal na SERP: o Redator decide.",
      h1Complement: { suggested: false, complement: null, titlePages: 0, headingPages: 0, sampleSize: 8, label: "Assunto no H1: sem sinal na SERP, quem redige decide. O H1 é da principal." },
      sampleLabel: "Palavras do Assunto aparecem em 0 de 8 página(s) da amostra (títulos e subtítulos).",
      alert: RADAR_SUBJECT_NO_TOUCH_ALERT,
      ctaDirection: `Levar o leitor a ${DESTINO_DO_ASSUNTO}.`,
    },
  };
}

/** O contexto do especialista, só com o que a pauta e o prompt leem. */
export function expertContextFixture(comAssunto: boolean, semNota = false): RadarR6ExpertTopicContext {
  return {
    articleId: "article-1",
    brandId: "brand-1",
    articleDnaVersionId: "adna-v1",
    articleDnaContentHash: null,
    articleDna: {
      principal: "marketing para clínicas",
      intent: "Informacional",
      silo: "Marketing",
      audience: "Donos de clínica",
      problem: "Poucos pacientes novos",
      desiredResult: "Mais agendamentos",
      requiredTopics: [],
      knownQuestions: [],
      ...(comAssunto ? {
        subject: {
          phrase: FRASE_DO_ASSUNTO,
          note: semNota ? null : NOTA_DO_ASSUNTO,
          destinationUrl: DESTINO_DO_ASSUNTO,
          request: `Aprofundar o Assunto e a virada: o que o leitor desta busca precisa entender para chegar a ${FRASE_DO_ASSUNTO}?`,
        },
      } : {}),
    },
    keywordDnas: [],
    siloDna: null,
    serpNeeds: [],
    openGaps: [],
    conflicts: [],
    knownQuestions: [],
    approvedReferences: [],
    serpSnapshotId: null,
    serpSnapshotVersion: null,
    serpReviewed: false,
    analysisVersionId: null,
    amazonCriteria: [],
    amazonEvidence: [],
    amazonState: "AMAZON_NOT_APPLICABLE",
    existingContent: "",
    existingContentItems: [],
    provenance: [{ sourceType: "ArticleDNA", label: "ArticleDNA 1", referenceId: "adna-v1" }],
  } as unknown as RadarR6ExpertTopicContext;
}
