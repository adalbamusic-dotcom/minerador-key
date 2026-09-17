import type { RadarEditorialArticleModel, RadarEditorialSection } from "./editorial-article-model.ts";
import type { RadarEditorialProfileModel } from "./editorial-profile-model.ts";
import type { RadarResearchProfile } from "./research-profile.ts";

/**
 * ===== O READ MODEL PORTÁTIL — RADAR_PORTABLE_EXPORT_1.1 · §5, §9 e §11 =====
 *
 * ==================== POR QUE ESTA CAMADA EXISTE ====================
 *
 * O Google produz `RadarEditorialArticleModel`: `sections` aninhadas, com
 * `headingSuggestion`, `factualRequirement`, `childSections`. O YouTube e a
 * Amazon produzem `RadarEditorialProfileModel`: `blocks` planos, com `heading`,
 * `sourceNeeded` e nada aninhado. São o mesmo objeto editorial com dois
 * vocabulários, herdados de gates diferentes.
 *
 * Quem escreve não deveria precisar aprender os dois. Aqui eles viram UM, e
 * todo o resto do dossiê — outline, brief, radiografia, estratégia — lê daqui.
 *
 * ==================== O QUE ESTA CAMADA NÃO FAZ ====================
 *
 * Não decide nada sobre o artigo. Ela renomeia, achata, ordena e RECUSA o que
 * não é utilizável. Nenhum campo nasce aqui: ou veio do modelo canônico, ou não
 * existe.
 *
 * Domínio puro: sem fetch, sem storage, sem provider, sem React.
 */

/* ============================== a seção ============================== */

export type RadarPortableSection = {
  level: 2 | 3;
  /** 1.2A · a função editorial decide a FUNÇÃO da imagem daquela seção. */
  editorialFunction: string | null;
  heading: string;
  objective: string;
  readerQuestion: string | null;
  keyMessage: string | null;
  coveragePoints: string[];
  mustCoverReasons: string[];
  evidenceStrength: string | null;
  sourceNeeded: string | null;
  specialistRequired: string | null;
  internalLinks: string[];
  mediaOpportunity: string[];
  children: RadarPortableSection[];
};

export type RadarPortableEditorial = {
  profile: RadarResearchProfile;
  blueprintType: string;
  editorialOutput: string | null;
  /** §9 · `null` quando o modelo não produziu um título utilizável. */
  title: string | null;
  alternateTitles: string[];
  readerPromise: string | null;
  objective: string | null;
  openingOrHook: string | null;
  sections: RadarPortableSection[];
  conclusion: string | null;
  cta: string | null;
  sourceNeeds: string[];
  specialistNeeds: string[];
  seoApplications: string[];
  comparisonCriteria: string[];
  visualPlan: string[];
  videoApplication: string[];
  derived: Array<{ label: string; detail: string }>;
  derivedLabel: string | null;
  limitations: string[];
};

/** §7 · o tipo de blueprint, derivado do perfil — nunca inferido do conteúdo. */
export const RADAR_EXPORT_BLUEPRINT_TYPE: Record<RadarResearchProfile, string> = {
  GOOGLE: "EDITORIAL",
  YOUTUBE: "AUDIOVISUAL",
  AMAZON: "COMMERCIAL",
};

/* ========================= a trava de tautologia ========================= */

const normalizar = (valor: string) => valor
  .toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
  .replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();

/**
 * ===== §9 · A MOLDURA DAS FRASES QUE OS BUILDERS MONTAM =====
 *
 * "Ao final, o espectador sabe X." e "X: X" não são frases ruins: são MOLDURAS
 * onde o conteúdo não chegou. A moldura é sempre a mesma — artigos, preposições,
 * o narrador e o verbo do template. O que sobra depois de tirá-la e de tirar a
 * keyword é o que a frase realmente diz.
 *
 * A lista é curta de propósito. Cada palavra aqui é uma palavra que NÃO
 * distingue duas frases editoriais diferentes; qualquer verbo que nomeie uma
 * ação — escolher, aplicar, comparar, evitar — continua contando.
 */
const MOLDURA = new Set([
  "a", "as", "o", "os", "um", "uma", "uns", "umas",
  "de", "da", "do", "das", "dos", "em", "na", "no", "nas", "nos",
  "e", "ou", "que", "se", "com", "para", "por", "ao", "aos", "á",
  "ja", "final", "fim", "depois", "antes",
  "leitor", "leitora", "espectador", "espectadora", "publico", "pessoa",
  "sabe", "saber", "sai", "sair", "sabendo", "vai", "sobre", "este", "esta", "isso",
  "video", "artigo", "conteudo", "texto",
]);

/**
 * O NÚCLEO INFORMATIVO DE UMA FRASE — o que ela diz além do assunto.
 *
 * Duas frases com o mesmo núcleo prometem a mesma coisa. Núcleo vazio significa
 * que a frase só repetiu o assunto de volta, e isso não é uma direção editorial:
 * é o lugar onde uma deveria estar.
 */
function nucleoInformativo(frase: string, keyword: string | null): string {
  const assunto = new Set(keyword ? normalizar(keyword).split(" ").filter(Boolean) : []);
  return normalizar(frase)
    .split(" ")
    .filter(palavra => palavra && !MOLDURA.has(palavra) && !assunto.has(palavra))
    .join(" ");
}

/**
 * ===== §9 · UMA FRASE TAUTOLÓGICA NÃO ATRAVESSA =====
 *
 * "Skin care noturno: skin care noturno" e "Ao final, o espectador sabe skin
 * care noturno." chegaram ao CSV real. Nenhuma das duas diz o que produzir — e
 * as duas OCUPAM o campo onde a direção deveria estar, o que é pior do que o
 * campo vazio: quem lê acha que recebeu direção.
 *
 * A trava é do READ MODEL, não do builder canônico (§24). O blueprint continua
 * gravado como está; o que muda é que o dossiê portátil não apresenta moldura
 * como se fosse conteúdo.
 */
export function radarPortableUsableStatement(
  frase: string | null | undefined,
  keyword: string | null,
): string | null {
  const limpo = (frase || "").trim();
  if (!limpo) return null;
  if (!keyword || !normalizar(keyword)) return limpo;
  return nucleoInformativo(limpo, keyword) ? limpo : null;
}

/* ========================= o achatamento do Google ========================= */

const secaoDoGoogle = (item: RadarEditorialSection): RadarPortableSection => ({
  level: item.level,
  editorialFunction: item.editorialFunction,
  heading: item.headingSuggestion,
  objective: item.objective,
  readerQuestion: item.readerQuestion || null,
  keyMessage: item.keyMessage,
  coveragePoints: [...item.coveragePoints],
  mustCoverReasons: [...item.mustCoverReasons],
  evidenceStrength: item.evidenceStrength,
  /* A dependência tem nome próprio no Google; aqui ela vira o campo comum. */
  sourceNeeded: item.factualRequirement,
  specialistRequired: item.specialistRequirement,
  internalLinks: item.internalLinks.map(link => `${link.destination} — âncora "${link.anchor}": ${link.whereToApply}`),
  mediaOpportunity: [...item.mediaOpportunity],
  /*
   * §11 · O H3 CONTINUA FILHO DO H2 QUE O HOSPEDA.
   *
   * O gate anterior achatava a hierarquia para caber numa coluna de JSON, e o
   * outline saía como uma lista de perguntas soltas. A estrutura É o produto:
   * quem escreve precisa dela como ela vai para a página.
   */
  children: item.childSections.map(secaoDoGoogle),
});

/* ============================== a normalização ============================== */

export function radarPortableEditorialOf(input: {
  profile: RadarResearchProfile;
  principalKeyword: string | null;
  articleModel?: RadarEditorialArticleModel | null;
  profileModel?: RadarEditorialProfileModel | null;
}): RadarPortableEditorial {
  const perfil = input.profile;
  const keyword = input.principalKeyword;
  const base = {
    profile: perfil,
    blueprintType: RADAR_EXPORT_BLUEPRINT_TYPE[perfil],
  };

  if (input.profileModel) {
    const modelo = input.profileModel;

    /*
     * §9 · O TÍTULO CAI PARA A PRÓXIMA DIREÇÃO UTILIZÁVEL, não para o vazio.
     *
     * O modelo já produz alternativas. Descartar a tautológica e ficar com a
     * seguinte usa o que o Radar apurou em vez de jogar o campo fora.
     */
    const titulos = [modelo.workingTitle, ...modelo.alternateTitleDirections]
      .map(item => radarPortableUsableStatement(item, keyword))
      .filter((valor): valor is string => Boolean(valor));

    return {
      ...base,
      editorialOutput: modelo.editorialOutput || null,
      title: titulos[0] || null,
      alternateTitles: titulos.slice(1),
      readerPromise: radarPortableUsableStatement(modelo.promise, keyword),
      objective: radarPortableUsableStatement(modelo.objective, keyword),
      openingOrHook: radarPortableUsableStatement(modelo.hook, keyword),
      sections: modelo.blocks.map(bloco => ({
        level: 2 as const,
        editorialFunction: null,
        heading: bloco.heading,
        objective: bloco.objective,
        readerQuestion: null,
        keyMessage: bloco.function || null,
        coveragePoints: [...bloco.coveragePoints],
        mustCoverReasons: [...bloco.mustCoverReasons],
        evidenceStrength: bloco.evidenceStrength,
        sourceNeeded: bloco.sourceNeeded,
        specialistRequired: bloco.specialistRequired,
        internalLinks: [],
        mediaOpportunity: bloco.visualOpportunity ? [bloco.visualOpportunity] : [],
        children: [],
      })),
      conclusion: modelo.conclusion,
      cta: modelo.cta,
      sourceNeeds: [...modelo.evidenceNeeds],
      specialistNeeds: [...modelo.specialistNeeds],
      seoApplications: [...modelo.seoApplication],
      comparisonCriteria: [...modelo.comparisonCriteria],
      visualPlan: modelo.blocks
        .map(bloco => (bloco.visualOpportunity ? `${bloco.heading}: ${bloco.visualOpportunity}` : null))
        .filter((valor): valor is string => Boolean(valor)),
      videoApplication: perfil === "YOUTUBE"
        ? modelo.articleApplication.map(item => `${item.piece} — ${item.placement}: ${item.role}`)
        : [],
      derived: modelo.derived.map(item => ({ label: item.label, detail: item.detail })),
      derivedLabel: modelo.derivedLabel || null,
      limitations: [...modelo.limitations],
    };
  }

  if (input.articleModel) {
    const modelo = input.articleModel;
    const titulos = [modelo.titleSuggestion, ...modelo.titleAlternatives]
      .map(item => radarPortableUsableStatement(item, keyword))
      .filter((valor): valor is string => Boolean(valor));

    return {
      ...base,
      editorialOutput: null,
      title: titulos[0] || null,
      alternateTitles: titulos.slice(1),
      readerPromise: radarPortableUsableStatement(modelo.readerPromise, keyword),
      objective: radarPortableUsableStatement(modelo.editorialObjective, keyword),
      openingOrHook: radarPortableUsableStatement(modelo.opening.hookDirection, keyword),
      sections: modelo.sections.map(secaoDoGoogle),
      conclusion: modelo.conclusion.synthesis || null,
      cta: modelo.conclusion.callToAction || null,
      /*
       * §13 · O PAR `{ subject, requirement }` VIRA FRASE.
       *
       * O escritor precisa saber O QUE precisa de fonte e POR QUÊ, numa linha.
       * Duas colunas de objeto obrigariam a recompor a frase na cabeça.
       */
      sourceNeeds: modelo.evidenceNeeds.map(item => `${item.subject}: ${item.requirement}`),
      specialistNeeds: modelo.specialistNeeds.map(item => `${item.subject}: ${item.requirement}`),
      seoApplications: [],
      comparisonCriteria: [],
      visualPlan: modelo.mediaPlan.map(item => `${item.kind} · ${item.subject}: ${item.purpose}`),
      videoApplication: [],
      derived: [],
      derivedLabel: null,
      limitations: [...modelo.limitations],
    };
  }

  return {
    ...base,
    editorialOutput: null,
    title: null,
    alternateTitles: [],
    readerPromise: null,
    objective: null,
    openingOrHook: null,
    sections: [],
    conclusion: null,
    cta: null,
    sourceNeeds: [],
    specialistNeeds: [],
    seoApplications: [],
    comparisonCriteria: [],
    visualPlan: [],
    videoApplication: [],
    derived: [],
    derivedLabel: null,
    limitations: [],
  };
}

/** Toda seção do dossiê, H2 e H3, numa lista — para quem precisa varrer. */
export function radarPortableFlatSections(secoes: readonly RadarPortableSection[]): RadarPortableSection[] {
  return secoes.flatMap(item => [item, ...radarPortableFlatSections(item.children)]);
}

/* ========================= §4 · o ArticleDNA compacto ========================= */

/**
 * ===== §3 e §4 · O DNA QUE VIAJA, E O QUE FICA NO BANCO =====
 *
 * `article_dna_json` levava o payload inteiro do Arquiteto: dezenas de KB por
 * artigo, com ids de keyword, hashes de versão, política de publicação,
 * proveniência de formação. Nada disso escreve uma linha do texto.
 *
 * O que escreve é o CONTRATO EDITORIAL: sobre o que é o artigo, para quem, o
 * que ele obrigatoriamente cobre e o que ninguém pode mudar. É isso que sai.
 *
 * O resto continua no banco, com identidade própria, onde tem função de
 * auditoria — e onde quem escreve não precisa tropeçar nele.
 */
export type RadarPortableArticleDna = {
  principalKeyword: string | null;
  secondaryKeywords: string[];
  narrativeReinforcements: string[];
  intent: string | null;
  funnel: string | null;
  silo: string | null;
  siloRole: string | null;
  mustCover: string[];
  protectedDecisions: string[];
  internalLinkRequirements: string[];
};

export function radarPortableArticleDna(input: {
  principalKeyword: string | null;
  secondaryKeywords: readonly string[];
  narrativeReinforcements: readonly string[];
  intent: string | null;
  funnel: string | null;
  silo: string | null;
  siloRole: string | null;
  mustCover: readonly string[];
  slug: string | null;
  publishedProtected: boolean;
  internalLinkRequirements: readonly string[];
}): RadarPortableArticleDna {
  /*
   * AS DECISÕES PROTEGIDAS SÃO AS QUE O REDATOR NÃO PODE REABRIR.
   *
   * Elas não são uma lista de metadados: cada linha aqui é uma coisa que, se
   * mudar no texto, quebra o que o Arquiteto aprovou. Por isso a frase diz o
   * que é protegido E qual é o valor — "não mude o slug" sem o slug ao lado
   * obriga quem escreve a ir procurar.
   */
  const protegidas = [
    input.principalKeyword ? `Keyword principal: ${input.principalKeyword}` : null,
    input.intent ? `Intenção declarada: ${input.intent}` : null,
    input.siloRole ? `Papel no silo: ${input.siloRole}` : null,
    input.slug ? `Slug${input.publishedProtected ? " (publicado e protegido)" : ""}: ${input.slug}` : null,
  ].filter((valor): valor is string => Boolean(valor));

  return {
    principalKeyword: input.principalKeyword,
    secondaryKeywords: [...input.secondaryKeywords],
    narrativeReinforcements: [...input.narrativeReinforcements],
    intent: input.intent,
    funnel: input.funnel,
    silo: input.silo,
    siloRole: input.siloRole,
    mustCover: [...input.mustCover],
    protectedDecisions: protegidas,
    internalLinkRequirements: [...input.internalLinkRequirements],
  };
}
