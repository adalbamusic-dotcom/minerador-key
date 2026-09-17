import type { RadarCompetitiveBlueprint } from "./competitive-blueprint.ts";
import type { RadarPortableArticleDna, RadarPortableEditorial, RadarPortableSection } from "./portable-read-model.ts";
import { radarPortableFlatSections } from "./portable-read-model.ts";

/**
 * ===== IDENTIDADE, SEO E PLANO VISUAL — ADDENDUM 1.2A =====
 *
 * ==================== O QUE ESTE ARQUIVO PERMITE ====================
 *
 * O dossiê do 1.2 entrega o CORPO do texto. Uma página não é só o corpo: ela
 * tem título de busca, descrição, H1, slug, canonical, capa e imagens que dão
 * respiro. Sem isso, a ferramenta externa escreve um texto e alguém volta ao
 * Minerador Key para montar a página — que é exatamente o que o export existe
 * para evitar.
 *
 * ==================== O QUE ELE NÃO INVENTA — §2 e §21.N ====================
 *
 * `seoTitle`, `metaDescription`, Open Graph, Twitter, `robots` e schema NÃO
 * EXISTEM nesta fase: eles são produzidos pelo Planejador e pelo Redator, e a
 * autoridade deles não é o Radar.
 *
 * O honesto é declarar `null` com a frase "Não definido nesta fase" ao lado da
 * DIREÇÃO que o Radar realmente apurou. Preencher o campo com uma frase montada
 * aqui faria uma ferramenta externa publicar como decidido o que ninguém
 * decidiu — e o Planejador encontraria a decisão já tomada.
 *
 * ==================== E O QUE ELE RECOMENDA ====================
 *
 * O H1 é a formulação editorial do blueprint, que É autoridade do Radar. O
 * plano visual é derivado da estrutura e dos sinais multimídia observados, e
 * cada imagem carrega `evidenceBasis`: de onde veio a necessidade dela.
 *
 * Domínio puro: sem fetch, sem storage, sem provider, sem React.
 */

export const RADAR_NOT_DEFINED_YET = "Não definido nesta fase.";

const lista = (itens: readonly string[]): string[] => itens.filter(Boolean).map(item => `- ${item}`);

const sluggify = (valor: string): string => valor
  .normalize("NFD").replace(/[̀-ͯ]/g, "")
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, "-")
  .replace(/^-+|-+$/g, "")
  .slice(0, 70);

/* ========================= §1 · a identidade do artigo ========================= */

export type RadarPortableArticleIdentity = {
  workingTitle: string | null;
  recommendedH1: string | null;
  slug: string | null;
  canonical: string | null;
  principalKeyword: string | null;
  secondaryKeywords: string[];
  intent: string | null;
  funnel: string | null;
  silo: string | null;
  articleRole: string | null;
  contentType: string | null;
  publicationState: string;
  audience: string | null;
  promise: string | null;
  editorialOutput: string | null;
  researchProfile: string;
  mustCover: string[];
  protectedDecisions: string[];
  /** §1 · o lugar deste artigo dentro da arquitetura aprovada. */
  graphPosition: { role: string | null; outboundRelations: number; inboundRelations: number };
};

export function radarPortableArticleIdentity(input: {
  dna: RadarPortableArticleDna;
  editorial: RadarPortableEditorial;
  profile: string;
  slug: string | null;
  canonical: string | null;
  contentType: string | null;
  audience: string | null;
  promise: string | null;
  published: boolean;
  outboundRelations: number;
  inboundRelations: number;
}): RadarPortableArticleIdentity {
  return {
    workingTitle: input.editorial.title,
    /*
     * §3 · O H1 É O QUE O RADAR TEM, E ELE NÃO É O SEO TITLE.
     *
     * O blueprint produz uma formulação EDITORIAL — a frase que abre a página
     * para quem já entrou. O título de busca é outra decisão, tomada depois,
     * com outro critério. Colapsar os dois faria a página prometer na SERP o
     * que o H1 promete ao leitor, que raramente é a mesma coisa.
     */
    recommendedH1: input.editorial.title,
    slug: input.slug,
    canonical: input.canonical,
    principalKeyword: input.dna.principalKeyword,
    secondaryKeywords: [...input.dna.secondaryKeywords],
    intent: input.dna.intent,
    funnel: input.dna.funnel,
    silo: input.dna.silo,
    articleRole: input.dna.siloRole,
    contentType: input.contentType,
    publicationState: input.published ? "Publicado e protegido" : "Ainda não publicado",
    audience: input.audience,
    promise: input.promise ?? input.editorial.readerPromise,
    editorialOutput: input.editorial.editorialOutput,
    researchProfile: input.profile,
    mustCover: [...input.dna.mustCover],
    protectedDecisions: [...input.dna.protectedDecisions],
    graphPosition: {
      role: input.dna.siloRole,
      outboundRelations: input.outboundRelations,
      inboundRelations: input.inboundRelations,
    },
  };
}

export function radarArticleIdentityMarkdown(identidade: RadarPortableArticleIdentity): string {
  return [
    "# Identidade do artigo",
    "",
    `Título de trabalho: ${identidade.workingTitle || RADAR_NOT_DEFINED_YET}`,
    `H1 recomendado: ${identidade.recommendedH1 || RADAR_NOT_DEFINED_YET}`,
    `Slug: ${identidade.slug || RADAR_NOT_DEFINED_YET}`,
    `Canonical: ${identidade.canonical || RADAR_NOT_DEFINED_YET}`,
    `Keyword principal: ${identidade.principalKeyword || "não resolvida"}`,
    ...(identidade.secondaryKeywords.length ? [`Keywords secundárias: ${identidade.secondaryKeywords.join(" · ")}`] : []),
    `Intenção: ${identidade.intent || "não declarada"}`,
    ...(identidade.funnel ? [`Etapa do funil: ${identidade.funnel}`] : []),
    `Silo / papel: ${identidade.silo || "sem silo"} · ${identidade.articleRole || "sem papel declarado"}`,
    ...(identidade.contentType ? [`Tipo de conteúdo: ${identidade.contentType}`] : []),
    `Estado de publicação: ${identidade.publicationState}`,
    ...(identidade.audience ? [`Público: ${identidade.audience}`] : []),
    ...(identidade.promise ? [`Promessa: ${identidade.promise}`] : []),
    ...(identidade.editorialOutput ? [`Saída editorial: ${identidade.editorialOutput}`] : []),
    `Perfil de pesquisa: ${identidade.researchProfile}`,
    ...(identidade.mustCover.length ? ["", "Obrigatório cobrir:", ...lista(identidade.mustCover)] : []),
    ...(identidade.protectedDecisions.length ? ["", "Decisões protegidas — não altere:", ...lista(identidade.protectedDecisions)] : []),
  ].join("\n").trim();
}

/* ============================== §2 a §5 · o SEO ============================== */

export type RadarPortableSeoMetadata = {
  h1: string | null;
  seoTitle: string | null;
  seoTitleDirection: string | null;
  metaDescription: string | null;
  metaDescriptionDirection: { mustReflectIntent: string | null; promise: string | null; constraints: string[] };
  slug: string | null;
  canonical: string | null;
  slugProtectionState: "PROTECTED" | "EDITABLE";
  canonicalProtectionState: "PROTECTED" | "EDITABLE";
  openGraph: null;
  twitter: null;
  robots: null;
  schemaRecommendations: string[];
  /** §2 · o que ainda não existe, nomeado — para ninguém achar que sumiu. */
  notDefinedAtThisStage: string[];
};

export function radarPortableSeoMetadata(input: {
  editorial: RadarPortableEditorial;
  dna: RadarPortableArticleDna;
  blueprint: RadarCompetitiveBlueprint | null;
  slug: string | null;
  canonical: string | null;
  protectedFields: readonly string[];
}): RadarPortableSeoMetadata {
  const google = input.blueprint?.profile === "GOOGLE" ? input.blueprint : null;

  return {
    h1: input.editorial.title,
    /*
     * §2 · `null` PORQUE NINGUÉM DECIDIU — e a direção ao lado diz como decidir.
     *
     * A direção de titulação É autoridade do Radar: ela sai da amostra e diz o
     * que o título precisa fazer. O título em si é decisão do Planejador.
     */
    seoTitle: null,
    seoTitleDirection: google?.recommended.titleDirection?.statement ?? null,
    metaDescription: null,
    metaDescriptionDirection: {
      mustReflectIntent: google?.recommended.intentToSatisfy ?? input.dna.intent,
      promise: input.editorial.readerPromise,
      constraints: [
        "Não repetir a keyword principal mais de uma vez.",
        ...(input.dna.principalKeyword ? [`A keyword principal é "${input.dna.principalKeyword}" e precisa aparecer com naturalidade.`] : []),
        "Refletir a promessa ao leitor, e não a estrutura do texto.",
      ],
    },
    slug: input.slug,
    canonical: input.canonical,
    /*
     * §5 · SLUG E CANONICAL TRAVADOS NÃO PODEM SER REESCRITOS DE FORA.
     *
     * A proteção vem do Arquiteto — publicação confirmada. Uma ferramenta
     * externa que "melhorasse" o slug de uma página publicada quebraria a URL
     * viva e o canonical junto.
     */
    slugProtectionState: input.protectedFields.includes("slug") ? "PROTECTED" : "EDITABLE",
    canonicalProtectionState: input.protectedFields.includes("canonical") ? "PROTECTED" : "EDITABLE",
    openGraph: null,
    twitter: null,
    robots: null,
    schemaRecommendations: [],
    notDefinedAtThisStage: [
      "seoTitle", "metaDescription", "openGraph", "twitter", "robots", "schemaRecommendations",
    ],
  };
}

export function radarSeoMetadataMarkdown(seo: RadarPortableSeoMetadata): string {
  return [
    "# Metadados SEO",
    "",
    `H1 recomendado: ${seo.h1 || RADAR_NOT_DEFINED_YET}`,
    `SEO title: ${seo.seoTitle || RADAR_NOT_DEFINED_YET}`,
    ...(seo.seoTitleDirection ? [`Direção de titulação: ${seo.seoTitleDirection}`] : []),
    `Meta description: ${seo.metaDescription || RADAR_NOT_DEFINED_YET}`,
    ...(seo.metaDescriptionDirection.mustReflectIntent
      ? [`A meta description precisa refletir: ${seo.metaDescriptionDirection.mustReflectIntent}`]
      : []),
    ...(seo.metaDescriptionDirection.promise ? [`Benefício a comunicar: ${seo.metaDescriptionDirection.promise}`] : []),
    ...(seo.metaDescriptionDirection.constraints.length ? ["Restrições:", ...lista(seo.metaDescriptionDirection.constraints)] : []),
    "",
    `Slug: ${seo.slug || RADAR_NOT_DEFINED_YET}${seo.slugProtectionState === "PROTECTED" ? " — TRAVADO: a página está publicada, não reescreva." : ""}`,
    `Canonical: ${seo.canonical || RADAR_NOT_DEFINED_YET}${seo.canonicalProtectionState === "PROTECTED" ? " — TRAVADO: não reescreva." : ""}`,
    "",
    `Ainda não definidos nesta fase: ${seo.notDefinedAtThisStage.join(", ")}. Não os invente — eles são decisão do Planejador e do Redator.`,
  ].join("\n").trim();
}

/* ========================= §6 a §13 · o plano visual ========================= */

export type RadarPortableImagePlan = {
  imageRole: "COVER" | "RESPITE";
  section: string | null;
  purpose: string;
  concept: string;
  placement: string;
  recommendedAspectRatio: string;
  altTextSuggestion: string;
  filenameSuggestion: string;
  captionSuggestion: string;
  generationPrompt: string;
  negativeGuidance: string[];
  /** §12 · de onde veio a necessidade desta imagem. Nunca "porque sim". */
  evidenceBasis: string;
  /** §13 · esta necessidade se resolve melhor como imagem, vídeo, ou os dois. */
  mediaFit: "IMAGE" | "VIDEO" | "BOTH";
};

export type RadarPortableVisualEvidence = {
  statement: string;
  source: string;
  section: string | null;
};

/**
 * ===== §9 · A IMAGEM TEM FUNÇÃO, E A FUNÇÃO VEM DA SEÇÃO =====
 *
 * "Imagem genérica de skincare" é o que se produz quando ninguém disse para que
 * a imagem serve. A função editorial da seção já responde isso: uma seção de
 * DEFINIÇÃO pede identificação; uma de EXPLICAÇÃO pede o mecanismo; uma de
 * APLICAÇÃO pede a ordem do processo; uma de SELEÇÃO pede comparação.
 */
const FUNCAO_DA_IMAGEM: Record<string, { purpose: string; prompt: string }> = {
  DEFINITION: {
    purpose: "Ajudar o leitor a RECONHECER o que a seção define.",
    prompt: "imagem que permita identificar visualmente o que a seção descreve, com foco no sinal que distingue",
  },
  EXPLANATION: {
    purpose: "Explicar a CAUSA ou o mecanismo que a seção descreve.",
    prompt: "diagrama editorial simples que mostre o mecanismo descrito, com rótulos curtos e sem aparência de infográfico publicitário",
  },
  APPLICATION: {
    purpose: "Mostrar a ORDEM ou o processo que a seção ensina.",
    prompt: "sequência visual em etapas numeradas mostrando o processo descrito, em estilo editorial limpo",
  },
  SELECTION: {
    purpose: "Ajudar a COMPARAR e decidir.",
    prompt: "composição comparativa lado a lado dos critérios que a seção discute, sem aparência de anúncio",
  },
  COVERAGE: {
    purpose: "Dar respiro e ancorar o assunto da seção.",
    prompt: "imagem de contexto do assunto da seção, natural e sem encenação publicitária",
  },
};

/** §9 · a ordem em que as funções ganham imagem, quando há mais seções que vagas. */
const PRIORIDADE = ["EXPLANATION", "APPLICATION", "SELECTION", "DEFINITION", "COVERAGE"];

const EH_FAQ = /\b(faq|perguntas frequentes|d[úu]vidas frequentes)\b/i;

export const RADAR_VISUAL_NEGATIVE_GUIDANCE = [
  "sem texto sobreposto na imagem",
  "sem marca, logotipo ou embalagem identificável de terceiro",
  "sem aparência de anúncio ou banner promocional",
  "sem representar resultado clínico, antes/depois ou promessa que o texto não sustenta",
];

/**
 * §10 · O ALT DESCREVE A IMAGEM — e não repete a keyword até encher.
 *
 * A regra é uma só e é verificável: a keyword principal aparece NO MÁXIMO uma
 * vez, e só quando ela descreve mesmo o que está na imagem. O resto do alt é
 * o assunto daquela seção.
 */
export function radarPortableAltText(input: { concept: string; principalKeyword: string | null }): string {
  let conceito = input.concept.trim().replace(/\s+/g, " ");

  const chave = (input.principalKeyword || "").trim();
  if (chave) {
    /*
     * A SEGUNDA OCORRÊNCIA EM DIANTE SAI — e sai aqui, não na revisão.
     *
     * Um alt montado a partir de um ponto de cobertura pode repetir a keyword
     * que já está no início da frase. Uma repetição é natural; duas já é o
     * padrão que os checadores de SEO chamam de stuffing, e ninguém revisa alt
     * de imagem depois que o texto foi publicado.
     */
    const padrao = new RegExp(chave.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi");
    let vistas = 0;
    conceito = conceito.replace(padrao, encontro => {
      vistas += 1;
      return vistas === 1 ? encontro : "";
    }).replace(/\s{2,}/g, " ").replace(/\s+([,.;:])/g, "$1").trim();
  }

  const alt = conceito.charAt(0).toUpperCase() + conceito.slice(1);
  return alt.length > 125 ? `${alt.slice(0, 124).trimEnd()}…` : alt;
}

export function radarPortableVisualPlan(input: {
  editorial: RadarPortableEditorial;
  blueprint: RadarCompetitiveBlueprint | null;
  principalKeyword: string | null;
  articleTitle: string | null;
  promise: string | null;
  hasVideoBlueprint: boolean;
}): { cover: RadarPortableImagePlan | null; respite: RadarPortableImagePlan[]; evidence: RadarPortableVisualEvidence[] } {
  const secoes = radarPortableFlatSections(input.editorial.sections);

  /*
   * §12 · A ORIGEM DA NECESSIDADE VISUAL, ANTES DO PLANO.
   *
   * Sem ela, o plano é decoração com nome técnico. Com ela, quem produz a
   * imagem sabe que o formato foi observado na busca — ou que ele é escolha
   * editorial nossa, e não um achado.
   */
  const daBusca: RadarPortableVisualEvidence[] = input.blueprint?.profile === "GOOGLE"
    ? [
      ...input.blueprint.observed.multimediaSignals.map(item => ({ statement: item.statement, source: item.evidence, section: null })),
      ...input.blueprint.recommended.multimediaPlan.map(item => ({ statement: item.statement, source: item.sourceSignal, section: null })),
    ]
    : input.blueprint?.profile === "AMAZON"
      ? input.blueprint.recommended.multimediaPlan.map(item => ({ statement: item.statement, source: item.sourceSignal, section: null }))
      : [];

  const daEstrutura: RadarPortableVisualEvidence[] = secoes
    .filter(item => item.mediaOpportunity.length)
    .map(item => ({ statement: item.mediaOpportunity[0], source: "Oportunidade visual apontada pelo blueprint editorial.", section: item.heading }));

  const evidence = [...daBusca, ...daEstrutura];

  /*
   * §21.N · SEM ESTRUTURA NÃO HÁ PLANO VISUAL.
   *
   * Uma capa sem artigo a representar seria a imagem de nada. A ausência é
   * declarada pelo objeto vazio, não preenchida por um plano genérico.
   */
  if (!secoes.length) return { cover: null, respite: [], evidence };

  const assunto = input.principalKeyword || input.articleTitle || "o assunto do artigo";

  const cover: RadarPortableImagePlan = {
    imageRole: "COVER",
    section: null,
    purpose: "Representar visualmente a promessa principal do artigo.",
    concept: input.promise || input.articleTitle || `o que o leitor procura sobre ${assunto}`,
    placement: "Topo da página, acima do H1 ou logo abaixo dele.",
    recommendedAspectRatio: "16:9",
    altTextSuggestion: radarPortableAltText({
      concept: input.promise || input.articleTitle || assunto,
      principalKeyword: input.principalKeyword,
    }),
    filenameSuggestion: `${sluggify(input.articleTitle || assunto) || "capa"}.webp`,
    captionSuggestion: input.promise || "",
    generationPrompt: `Fotografia editorial que represente ${input.promise || assunto}, luz natural, contexto real, sem encenação publicitária.`,
    negativeGuidance: [...RADAR_VISUAL_NEGATIVE_GUIDANCE],
    evidenceBasis: daBusca[0]?.statement
      ? `Necessidade visual observada na amostra: ${daBusca[0].statement}`
      : "Padrão editorial do projeto: todo artigo abre com uma capa que sintetiza a promessa.",
    mediaFit: "IMAGE",
  };

  /*
   * §6 e §21.G · FAQ NÃO ENTRA, e a regra é do conteúdo, não da posição.
   *
   * Uma seção de perguntas frequentes é consulta, não leitura corrida: imagem
   * ali não dá respiro, atrapalha a varredura.
   */
  const elegiveis = secoes
    .filter(item => item.level === 2)
    .filter(item => !EH_FAQ.test(item.heading))
    .sort((esquerda, direita) => {
      const peso = (secao: RadarPortableSection) => {
        const indice = PRIORIDADE.indexOf(secao.editorialFunction || "COVERAGE");
        return (secao.mediaOpportunity.length ? 0 : 100) + (indice === -1 ? 50 : indice);
      };
      return peso(esquerda) - peso(direita);
    });

  const respite = elegiveis.slice(0, 3).map((secao, indice) => {
    const funcao = FUNCAO_DA_IMAGEM[secao.editorialFunction || "COVERAGE"] || FUNCAO_DA_IMAGEM.COVERAGE;
    const conceito = secao.coveragePoints[0] || secao.objective;
    const temVideo = input.hasVideoBlueprint || secao.mediaOpportunity.some(item => /v[íi]deo/i.test(item));

    return {
      imageRole: "RESPITE" as const,
      section: secao.heading,
      purpose: funcao.purpose,
      concept: conceito,
      placement: `Dentro da seção "${secao.heading}", depois do primeiro bloco de texto.`,
      recommendedAspectRatio: "4:3",
      altTextSuggestion: radarPortableAltText({ concept: conceito, principalKeyword: input.principalKeyword }),
      filenameSuggestion: `${sluggify(`${secao.heading}-${indice + 1}`) || `respiro-${indice + 1}`}.webp`,
      captionSuggestion: secao.keyMessage || secao.objective,
      generationPrompt: `Para a seção "${secao.heading}": ${funcao.prompt} — assunto: ${conceito}.`,
      negativeGuidance: [
        ...RADAR_VISUAL_NEGATIVE_GUIDANCE,
        /* §9 · o que NÃO repetir: a capa já ocupou a promessa. */
        "não repetir o conceito da capa nem o de outra imagem de respiro",
      ],
      evidenceBasis: secao.mediaOpportunity[0]
        || `Função editorial da seção: ${secao.editorialFunction || "cobertura"}.`,
      /*
       * §13 · IMAGEM, VÍDEO OU OS DOIS — e nunca os dois sem função distinta.
       *
       * Aplicação prática é o caso claro de vídeo; síntese e comparação são o
       * caso claro de imagem. Marcar `BOTH` sem essa distinção duplicaria
       * mídia pelo prazer de ter as duas.
       */
      mediaFit: temVideo && secao.editorialFunction === "APPLICATION" ? "BOTH" as const
        : temVideo && secao.editorialFunction !== "SELECTION" ? "VIDEO" as const
          : "IMAGE" as const,
    };
  });

  return { cover, respite, evidence };
}

export function radarVisualPlanMarkdown(plano: {
  cover: RadarPortableImagePlan | null;
  respite: readonly RadarPortableImagePlan[];
}): string {
  if (!plano.cover && !plano.respite.length) {
    return "# Plano visual\n\nA investigação não produziu estrutura editorial: não há plano visual para este artigo.";
  }

  const ficha = (imagem: RadarPortableImagePlan, titulo: string): string[] => [
    "",
    `## ${titulo}`,
    ...(imagem.section ? [`Seção: ${imagem.section}`] : []),
    `Função: ${imagem.purpose}`,
    `Conceito: ${imagem.concept}`,
    `Onde entra: ${imagem.placement}`,
    `Proporção recomendada: ${imagem.recommendedAspectRatio}`,
    `ALT sugerido: ${imagem.altTextSuggestion}`,
    `Arquivo: ${imagem.filenameSuggestion}`,
    ...(imagem.captionSuggestion ? [`Legenda: ${imagem.captionSuggestion}`] : []),
    `Formato ideal: ${imagem.mediaFit === "BOTH" ? "imagem e vídeo, com funções distintas" : imagem.mediaFit === "VIDEO" ? "vídeo" : "imagem"}`,
    `Prompt de imagem: ${imagem.generationPrompt}`,
    "Evitar:",
    ...lista(imagem.negativeGuidance),
    `Origem da necessidade: ${imagem.evidenceBasis}`,
  ];

  return [
    "# Plano visual",
    "",
    `Padrão do projeto: uma capa e ${plano.respite.length} imagem(ns) de respiro. Seções de perguntas frequentes não recebem imagem.`,
    ...(plano.cover ? ficha(plano.cover, "Capa") : []),
    ...plano.respite.flatMap((item, indice) => ficha(item, `Imagem de respiro ${indice + 1}`)),
  ].join("\n").trim();
}

/* ============================== §15 · a identidade visual ============================== */

export function radarVisualIdentityMarkdown(input: {
  editorial: RadarPortableEditorial;
  dna: RadarPortableArticleDna;
  profile: string;
  audience: string | null;
}): string {
  /*
   * §15 · A IDENTIDADE VISUAL DESTE ARTIGO, e não um manual de marca.
   *
   * O que decide o tom visual é a INTENÇÃO: um artigo informacional de topo
   * pede imagem de contexto; um comercial pede produto legível e comparação.
   * Um manual genérico serviria a qualquer artigo e por isso não orienta
   * nenhum.
   */
  const comercial = input.profile === "AMAZON";
  const audiovisual = input.profile === "YOUTUBE";

  return [
    "# Identidade visual deste artigo",
    "",
    `Tom: ${comercial
      ? "informativo e sóbrio. O artigo compara produtos; a imagem não pode parecer material de campanha da marca comparada."
      : audiovisual
        ? "demonstrativo. As imagens apoiam o que o vídeo mostra, e não competem com ele."
        : "editorial e direto. A imagem serve à compreensão, não à decoração."}`,
    `Realismo: fotografia ou ilustração de contexto real. Nada de render idealizado nem de composição de banco de imagens genérica.`,
    ...(input.audience ? [`Leitor: ${input.audience}. A imagem precisa ser reconhecível por ele.`] : []),
    ...(input.dna.intent ? [`Intenção declarada: ${input.dna.intent}. A imagem responde a ela, não à estética.`] : []),
    "",
    "Consistência: a capa e as imagens de respiro pertencem ao mesmo artigo — mesma luz, mesma paleta, mesmo nível de realismo. Trocar o registro no meio quebra a leitura.",
    "",
    "Evitar:",
    ...lista([
      ...RADAR_VISUAL_NEGATIVE_GUIDANCE,
      "imagem que ilustre uma afirmação que o texto não sustenta",
      "repetir o mesmo conceito visual em duas imagens do mesmo artigo",
    ]),
  ].join("\n").trim();
}
