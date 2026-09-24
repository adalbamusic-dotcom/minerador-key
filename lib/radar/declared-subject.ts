/**
 * ===== O ASSUNTO DECLARADO, LIDO PELO RADAR — SDD do Assunto, F3.1 =====
 *
 * O Assunto é o tronco editorial que o HUMANO declarou no Minerador e que o
 * Arquiteto fixou no ArticleDNA (`ArticleDNA.subject`). A principal continua
 * dona do slug, do KGR e do H1; o Assunto é para onde o artigo faz a virada.
 *
 * O RADAR LÊ, E SÓ LÊ (`AGENTS.md` §7; P8 da SDD). Nada aqui troca, promove ou
 * rebaixa o Assunto, mexe em principal ou em papéis, ou escreve no ArticleDNA.
 * Se a SERP das keywords de sustentação não tocar o Assunto, o Radar AVISA —
 * e a decisão volta ao Arquiteto, por uma pessoa.
 *
 * O CRITÉRIO DESTA FATIA É LEXICAL, E ISSO É DITO. As raízes saem de
 * `radarSemanticStems`, a mesma função do modelo editorial: palavras de quatro
 * letras ou mais, sem acento e sem caixa. "SEO para clínicas" contra a SERP de
 * "marketing para clínicas" tende a não coincidir por palavra, embora o sentido
 * esteja perto. A leitura por sentido fica no backlog do Radar.
 *
 * Domínio puro: sem fetch, sem storage, sem provider.
 */

import { radarSemanticStems } from "./semantic-concept-model.ts";

import type { RadarArticleResearchContext } from "./article-research-context.ts";

/* ============================ o que é lido ============================ */

/** O snapshot do Assunto que o contexto de pesquisa carrega. Nada além disso. */
export type RadarDeclaredSubject = {
  phrase: string;
  note: string | null;
  destinationUrl: string | null;
};

/** O motivo PRÓPRIO do Assunto em `mustCoverReasons` — distinto do tópico declarado. */
export const RADAR_SUBJECT_MUST_COVER_REASON =
  "O ArticleDNA declara este Assunto como tronco: a virada para ele precisa ser coberta, e a arquitetura decide onde.";

/** O alerta quando nenhuma raiz do Assunto aparece na amostra. Diz o critério. */
export const RADAR_SUBJECT_NO_TOUCH_ALERT =
  "Nenhuma coincidência de termos entre o Assunto e as páginas das buscas de sustentação (critério por palavras). A virada será inteiramente nossa; conferir a composição no Arquiteto.";

/** Sem sinal, a sugestão é devolver a decisão — nunca "Assunto em H2/H3". */
export const RADAR_SUBJECT_NO_SIGNAL = "Sem sinal na SERP: o Redator decide.";

export const RADAR_SUBJECT_CRITERION = "LEXICAL_STEMS" as const;

export const RADAR_SUBJECT_CRITERION_LABEL =
  "Critério por palavras, não por sentido: raízes de 4 letras ou mais em títulos e H2/H3; siglas curtas, como SEO, não contam.";

/**
 * Quantas páginas com as raízes no título sustentam sugerir o complemento do
 * H1. É o mesmo piso de evidência do modelo editorial: uma página é um autor,
 * duas já são o mercado. Numa amostra de uma página, uma basta.
 */
export const RADAR_SUBJECT_H1_FLOOR = 2;

export const radarSubjectNoDistinctStemsAlert = (phrase: string) =>
  `O Assunto "${phrase}" não tem termos próprios além dos da keyword principal pelo critério por palavras (raízes de 4 letras ou mais; siglas curtas não contam). A coincidência com as páginas não pôde ser medida; a virada continua exigida.`;

export const radarSubjectTurnTitle = (phrase: string) => `Virada para ${phrase}`;

export const radarSubjectDeepeningRequest = (phrase: string) =>
  `Aprofundar o Assunto e a virada: o que o leitor desta busca precisa entender para chegar a ${phrase}?`;

/**
 * A pergunta sobre o leitor, sem jargão da casa: é o que vai ao especialista
 * externo, no texto da pauta e na mensagem. O `request` acima é o pedido
 * interno (SDD) e continua no prompt das pautas e na justificativa.
 */
export const radarSubjectReaderQuestion = (phrase: string) =>
  `o que o leitor desta busca precisa entender para chegar a ${phrase}?`;

export const radarSubjectReaderQuestionText = (phrase: string) => {
  const pergunta = radarSubjectReaderQuestion(phrase);
  return pergunta.charAt(0).toUpperCase() + pergunta.slice(1);
};

export const radarSubjectCtaDirection =(destinationUrl: string) => `Levar o leitor a ${destinationUrl}.`;

/* ============================ a identidade ============================ */

const normalizar = (valor: string) =>
  valor.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();

const assinatura = (valor: string): string => {
  let hash = 0x811c9dc5;
  for (let index = 0; index < valor.length; index += 1) {
    hash ^= valor.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
};

const PREFIXO_DA_VIRADA = "section:subject-turn:";

/**
 * O MESMO ID NO BLUEPRINT, NO MODELO E NO BUNDLE.
 *
 * Deriva da frase normalizada, nunca de contador: a seção da virada congelada
 * no FINALIZE e a seção do artigo-modelo apontam para a mesma coisa.
 */
export const radarSubjectTurnSectionId = (phrase: string) => `${PREFIXO_DA_VIRADA}${assinatura(normalizar(phrase))}`;

export const radarIsSubjectTurnSection = (id: string | null | undefined) =>
  typeof id === "string" && id.startsWith(PREFIXO_DA_VIRADA);

/* ============================ as raízes ============================ */

const texto = (valor: unknown): string | null =>
  typeof valor === "string" && valor.trim() ? valor.replace(/\s+/g, " ").trim() : null;

/** O Assunto do contexto, ou `null`. Sem frase não há Assunto. */
export function radarDeclaredSubjectOf(context: Pick<RadarArticleResearchContext, "article">): RadarDeclaredSubject | null {
  const bruto = (context.article as { subject?: Partial<RadarDeclaredSubject> | null }).subject;
  const phrase = texto(bruto?.phrase);
  if (!bruto || !phrase) return null;
  return { phrase, note: texto(bruto.note), destinationUrl: texto(bruto.destinationUrl) };
}

export type RadarSubjectStems = {
  subject: RadarDeclaredSubject;
  /** As raízes da FRASE que não são da principal: é o que conta como exigência. */
  phrase: string[];
  /** Frase e nota, sem as raízes da principal: é o que se procura na amostra. */
  reading: string[];
};

/**
 * AS RAÍZES DISTINTIVAS, COMO AS DOS TÓPICOS DECLARADOS.
 *
 * As raízes da keyword principal (ou da promessa, sem principal) saem, pelo
 * mesmo motivo de `territorioDoArtigo`: elas são o assunto do artigo inteiro,
 * e qualquer página da amostra casaria com elas.
 */
export function radarSubjectStems(context: Pick<RadarArticleResearchContext, "article" | "keywords">): RadarSubjectStems | null {
  const subject = radarDeclaredSubjectOf(context);
  if (!subject) return null;
  const principal = (context.keywords || []).find(item => item.identity?.role === "principal") || null;
  const genericas = new Set(radarSemanticStems(principal?.identity.text || context.article.promise || ""));
  const phrase = radarSemanticStems(subject.phrase).filter(raiz => !genericas.has(raiz));
  const reading = [...new Set([...phrase, ...radarSemanticStems(subject.note).filter(raiz => !genericas.has(raiz))])];
  return { subject, phrase, reading };
}

/** O texto traz TODAS as raízes? É a regra de exigência do modelo editorial. */
export function radarTextCoversStems(valor: string | null | undefined, raizes: readonly string[]): boolean {
  if (!raizes.length) return false;
  const doTexto = new Set(radarSemanticStems(valor));
  return raizes.every(raiz => doTexto.has(raiz));
}

/** As raízes do Assunto que o texto toca. Vazio quando não toca nenhuma. */
export function radarTextSubjectStems(valor: string | null | undefined, raizes: readonly string[]): string[] {
  if (!raizes.length) return [];
  const doTexto = new Set(radarSemanticStems(valor));
  return raizes.filter(raiz => doTexto.has(raiz));
}

/* ======================== a leitura da amostra ======================== */

export type RadarDeclaredSubjectPage = {
  url: string;
  title: string;
  h1: readonly string[];
  h2: readonly string[];
  h3: readonly string[];
  /** H1/H2/H3 na ordem da página, quando a extração os expôs. */
  headingOutline?: ReadonlyArray<{ level: number; text: string }>;
};

export type RadarDeclaredSubjectSampleReading = RadarDeclaredSubject & {
  criterion: typeof RADAR_SUBJECT_CRITERION;
  criterionLabel: string;
  /** As raízes procuradas: frase e nota, sem as da principal. */
  stems: string[];
  /**
   * `PAGES`: a amostra foi lida. `NO_PAGES`: não há página nesta carga (ainda
   * não lidas, ou transporte compacto de uma investigação congelada — aí vale
   * o que foi congelado). `NO_DISTINCT_STEMS`: o critério não tem o que medir.
   */
  basis: "PAGES" | "NO_PAGES" | "NO_DISTINCT_STEMS";
  sampleSize: number;
  /** Páginas cujo título, H1, H2 ou H3 toca alguma raiz. `null` sem leitura. */
  pagesTouching: number | null;
  /** Páginas cujo título ou H1 toca alguma raiz — o sinal do complemento do H1. */
  titlePagesTouching: number | null;
  /**
   * Páginas cujo H2 ou H3 toca alguma raiz. É o que sustenta dizer "Assunto em
   * H2/H3": com zero, não há sinal, e a decisão volta a quem redige.
   */
  headingPagesTouching: number | null;
  /**
   * ONDE A AMOSTRA PÕE O ASSUNTO: o H2 que mais vezes vem logo antes do
   * primeiro cabeçalho que toca as raízes, com quantas páginas fazem assim.
   * É a formulação do concorrente — serve para localizar a seção do
   * artigo-modelo, nunca para virar cabeçalho. `null` sem esse padrão.
   */
  placementSignal: { precedingHeading: string; pages: number } | null;
  /** A frase de contagem, pronta: "aparece em 3 de 10 páginas". */
  label: string;
  /** O alerta, quando a sustentação não segura o Assunto por este critério. */
  alert: string | null;
};

/**
 * ONDE O ASSUNTO APARECE NA AMOSTRA JÁ COLETADA — sem chamada nova.
 *
 * Conta página, não ocorrência: dez H2 da mesma página com a mesma palavra são
 * um autor insistindo, não o mercado.
 */
export function readRadarDeclaredSubjectInPages(input: {
  context: Pick<RadarArticleResearchContext, "article" | "keywords">;
  pages: readonly RadarDeclaredSubjectPage[];
}): RadarDeclaredSubjectSampleReading | null {
  const raizes = radarSubjectStems(input.context);
  if (!raizes) return null;
  const base = {
    ...raizes.subject,
    criterion: RADAR_SUBJECT_CRITERION,
    criterionLabel: RADAR_SUBJECT_CRITERION_LABEL,
    stems: [...raizes.reading],
    sampleSize: input.pages.length,
  };

  if (!raizes.reading.length) {
    return {
      ...base, basis: "NO_DISTINCT_STEMS", pagesTouching: null, titlePagesTouching: null, headingPagesTouching: null, placementSignal: null,
      label: "O Assunto não tem termos próprios além dos da principal: a coincidência com a amostra não pôde ser medida por palavras.",
      alert: radarSubjectNoDistinctStemsAlert(raizes.subject.phrase),
    };
  }
  if (!input.pages.length) {
    return {
      ...base, basis: "NO_PAGES", pagesTouching: null, titlePagesTouching: null, headingPagesTouching: null, placementSignal: null,
      label: "Nenhuma página lida nesta carga: a coincidência entre o Assunto e a amostra não foi medida aqui.",
      alert: null,
    };
  }

  const toca = (valores: ReadonlyArray<string | null | undefined>) =>
    valores.some(valor => radarTextSubjectStems(valor, raizes.reading).length > 0);
  const pagesTouching = input.pages.filter(page => toca([page.title, ...page.h1, ...page.h2, ...page.h3])).length;
  const titlePagesTouching = input.pages.filter(page => toca([page.title, ...page.h1])).length;
  const headingPagesTouching = input.pages.filter(page => toca([...page.h2, ...page.h3])).length;
  const total = input.pages.length;

  /*
   * A ORDEM DA PÁGINA, NÃO SÓ A PRESENÇA.
   *
   * Para cada página que trata o Assunto num H2/H3, o H2 que vem logo antes
   * do primeiro cabeçalho que o toca. O mais frequente diz depois de qual
   * bloco a amostra costuma fazer a virada.
   */
  const antecessores = new Map<string, { texto: string; pages: number }>();
  for (const page of input.pages) {
    const ordem = page.headingOutline?.length
      ? page.headingOutline.filter(item => item.level === 2 || item.level === 3)
      : page.h2.map(text => ({ level: 2, text }));
    const indice = ordem.findIndex(item => radarTextSubjectStems(item.text, raizes.reading).length > 0);
    if (indice <= 0) continue;
    const anterior = [...ordem.slice(0, indice)].reverse().find(item => item.level === 2);
    const chave = anterior ? normalizar(anterior.text) : "";
    if (!anterior || !chave) continue;
    const atual = antecessores.get(chave);
    antecessores.set(chave, { texto: atual?.texto || anterior.text.trim(), pages: (atual?.pages || 0) + 1 });
  }
  const maisFrequente = [...antecessores.values()].sort((esquerda, direita) => direita.pages - esquerda.pages)[0] || null;

  return {
    ...base,
    basis: "PAGES",
    pagesTouching,
    titlePagesTouching,
    headingPagesTouching,
    placementSignal: maisFrequente ? { precedingHeading: maisFrequente.texto, pages: maisFrequente.pages } : null,
    label: `Palavras do Assunto aparecem em ${pagesTouching} de ${total} página(s) da amostra (títulos e subtítulos).`,
    alert: pagesTouching === 0 ? RADAR_SUBJECT_NO_TOUCH_ALERT : null,
  };
}
