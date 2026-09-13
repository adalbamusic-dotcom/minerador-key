import { normalizeSearchIntent } from "../arquiteto/intent-profile.ts";
import type { OperationalPublication, RadarItem } from "../editorial/operational-flow.ts";
import type { PublicationRecord } from "../editorial/operational-contracts.ts";
import type { ArticleDNA, SiloDNA, SiloPage, VersionEnvelope } from "../arquiteto/contracts.ts";
import type { RadarHydrationSnapshot } from "./hydration.ts";

export type RadarPublicationView = {
  published: boolean;
  updateAvailable: boolean;
  label: "Publicado e protegido" | "Atualização disponível" | "Ainda não publicado";
  destinationUrl: string | null;
  publishedAt: string | null;
};

export type RadarEditorialIdentity = {
  brandName: string;
  title: string;
  principalKeyword: string | null;
  slug: string;
  canonical: string | null;
  siloName: string | null;
  hierarchy: ArticleDNA["hierarchy"];
  articleDna: VersionEnvelope<ArticleDNA>;
  siloDna: VersionEnvelope<SiloDNA> | null;
  siloPage: VersionEnvelope<SiloPage> | null;
  radarItem: RadarItem;
  hydration: RadarHydrationSnapshot | null;
  publication: RadarPublicationView;
};

const normalize = (value: string) => value.trim().toLocaleLowerCase("pt-BR").normalize("NFD").replace(/[\u0300-\u036f]/g, "");

export function normalizeIntent(value: string | null | undefined) {
  const normalized = normalize(value || "");
  if (["informativo", "informacional", "informativa"].includes(normalized)) return "Informativa";
  if (["comercial", "transacional"].includes(normalized)) return "Comercial";
  if (["navegacional", "navegacao"].includes(normalized)) return "Navegacional";
  return value?.trim() || "Não informada";
}

function urlOrNull(value: string | null | undefined) {
  if (!value) return null;
  try { return new URL(value).toString(); } catch { return null; }
}

export function resolveRadarPublication(input: {
  legacy?: PublicationRecord | null;
  operational?: OperationalPublication | null;
  keywordPublished?: boolean;
}): RadarPublicationView {
  const published = Boolean(input.keywordPublished || input.legacy?.status === "published" || input.operational?.state === "published");
  const updateAvailable = input.legacy?.status === "update_due" || Boolean(input.operational?.state === "published" && input.operational.updateRequested);
  return {
    published,
    updateAvailable,
    label: updateAvailable ? "Atualização disponível" : published ? "Publicado e protegido" : "Ainda não publicado",
    destinationUrl: published ? urlOrNull(input.operational?.destinationUrl) || urlOrNull(input.legacy?.destination) : null,
    publishedAt: input.operational?.publishedAt || input.legacy?.publishedAt || null,
  };
}

/**
 * AS LACUNAS OBSERVADAS, CONFERIDAS CONTRA O FUNDAMENTO VIGENTE.
 *
 * O diagnóstico da SERP é gravado NO MOMENTO DA COLETA e não muda depois. Uma
 * divergência de intenção registrada com o sentinela "unknown" continua no
 * snapshot para sempre, e reaparece na tela a cada leitura — foi isso que o
 * smoke final encontrou, já com o ArticleDNA declarando Informacional.
 *
 * ISTO NÃO É ESCONDER A FRASE NA UI. A regra é de domínio e é a mesma dos dois
 * lados: só existe conflito de intenção quando o fundamento e a SERP são
 * conclusivos e realmente divergem. Uma lacuna gravada que a autoridade atual
 * não sustenta não é uma lacuna — é o registro de uma leitura que o Radar já
 * não faz. Conflito REAL continua passando inteiro.
 */
export function radarObservedGapsForArticle(input: {
  /** As divergências gravadas no diagnóstico do snapshot. */
  persistedConflicts: readonly string[];
  /** A intenção conclusiva do fundamento, hoje. */
  articleIntent: string | null | undefined;
  /** A intenção dominante que a SERP devolveu. */
  observedIntent: string | null | undefined;
}): string[] {
  const leitura = radarIntentConflict({ expected: input.articleIntent, observed: input.observedIntent });

  return input.persistedConflicts.filter(conflito => {
    const falaDeIntencao = /intenção esperada|intencao esperada/i.test(conflito);
    if (!falaDeIntencao) return true;
    /* A frase de intenção só sobrevive se a autoridade atual a sustentar. */
    return leitura.conflicting;
  });
}

/* ==================== a intenção esperada, conclusiva =================== */

/**
 * "unknown" NÃO É UMA INTENÇÃO — é a ausência de uma.
 *
 * `normalizeSearchIntent` devolve a string literal "unknown" quando não
 * consegue classificar, e ela é TRUTHY. Três leitores diferentes do Radar já
 * caíram nisso: a faixa do Article (Gate 18.2), a coleta auxiliar da SERP
 * (Gate 18.4) e a coleta canônica (este gate). Cada um escrevia `a || b` e
 * parava no sentinela antes de chegar ao fundamento.
 *
 * A função existe para que não haja um quarto. Quem precisa de uma intenção
 * declarada pergunta aqui, e recebe `null` quando não há.
 */
const AUSENCIA_COM_CARA_DE_VALOR = new Set([
  /* `normalizeSearchIntent` quando não classifica. */
  "unknown",
  /* O fechamento do Arquiteto quando a intenção não concluiu. */
  "ambiguous",
  /* E quando o funil não concluiu — mesmo formato, mesmo risco. */
  "indeterminate",
]);

export function radarConclusiveIntent(value: string | null | undefined): string | null {
  const texto = typeof value === "string" ? value.trim() : "";
  if (!texto) return null;
  return AUSENCIA_COM_CARA_DE_VALOR.has(texto.toLowerCase()) ? null : texto;
}

/** O que se escreve quando um contrato exige texto e o fundamento não concluiu. */
export const RADAR_INTENT_NOT_CONCLUDED = "Intenção não concluída no fundamento";

/**
 * A INTENÇÃO DECLARADA DO ARTIGO — uma ordem, um lugar.
 *
 * QUATRO leitores já caíram no sentinela "unknown", cada um escrevendo a
 * própria cadeia de `||`: a faixa do Article (18.2), a coleta auxiliar (18.4),
 * a coleta canônica (18.5) e a narrativa do modelo competitivo (este gate).
 * Todos liam `mainIntent` antes — ou em vez — da decisão terminal do
 * Arquiteto, e todos paravam na string "unknown" porque ela é truthy.
 *
 * Corrigir um por vez é como este defeito sobreviveu a três gates. A ordem
 * passa a existir UMA vez, aqui, e quem precisa da intenção declarada
 * pergunta — em vez de reimplementar.
 *
 *   1. classificação terminal fechada pelo Arquiteto;
 *   2. o campo livre do ArticleDNA;
 *   e `null` quando nenhum dos dois conclui.
 */
export function radarDeclaredArticleIntent(article: {
  mainIntent?: string | null;
  /*
   * DUAS FORMAS, O MESMO FUNDAMENTO.
   *
   * O `ArticleDNA` persistido grava `classification.intent` como objeto
   * (`{ value, reason }`); a projeção de pesquisa do Radar já o achata para
   * string. Quem lê o DNA cru e quem lê o contexto perguntavam em lugares
   * diferentes e, por isso, escreviam ordens diferentes. A autoridade aceita as
   * duas — a ordem continua sendo uma.
   */
  classification?: {
    intent?: string | { value?: string | null } | null;
    intentLabel?: string | null;
  } | null;
} | null | undefined): string | null {
  if (!article) return null;
  const bruto = article.classification?.intent;
  const terminal = typeof bruto === "string" ? bruto : bruto?.value ?? null;
  return radarConclusiveIntent(article.classification?.intentLabel)
    || radarConclusiveIntent(terminal)
    || radarConclusiveIntent(article.mainIntent);
}

/**
 * A MESMA REGRA, SOBRE UMA LISTA DE SINAIS.
 *
 * Três lugares agregam intenções de todas as keywords para procurar sinal
 * comercial. Nenhum escolhe uma: todos varrem o conjunto. O sentinela entrava
 * no conjunto como se fosse sinal, e `filter(Boolean)` não o via porque
 * "unknown" é truthy.
 */
export function radarConclusiveIntents(values: readonly (string | null | undefined)[] | null | undefined): string[] {
  return (values || [])
    .map(valor => radarConclusiveIntent(valor))
    .filter((valor): valor is string => Boolean(valor));
}

/**
 * A INTENÇÃO DECLARADA DA KEYWORD — o outro sujeito, a outra ordem.
 *
 * A keyword tem fundamento próprio: a qualificação semântica fechada, a
 * intenção normalizada do KeywordDNA e as intenções que ela cobre. Três
 * leitores montavam essa cadeia à mão — a coleta auxiliar da SERP, a faixa
 * operacional e o dossiê de conteúdo — e nenhum deles filtrava o sentinela,
 * então `normalizedIntent: "unknown"` vencia a qualificação que concluía.
 *
 * Artigo e keyword continuam sendo sujeitos DIFERENTES: quem precisa dos dois
 * decide a precedência entre eles explicitamente, mas nenhum dos dois
 * reimplementa a ordem interna do outro.
 */
export function radarDeclaredKeywordIntent(keyword: {
  semanticQualificationRef?: { intent?: string | null } | null;
  semanticQualification?: { intent?: string | null } | null;
  normalizedIntent?: string | null;
  coveredIntentions?: readonly string[] | null;
} | null | undefined): string | null {
  if (!keyword) return null;
  const cobertas = keyword.coveredIntentions || [];
  return radarConclusiveIntent(keyword.semanticQualificationRef?.intent)
    || radarConclusiveIntent(keyword.semanticQualification?.intent)
    || radarConclusiveIntent(keyword.normalizedIntent)
    || cobertas.map(valor => radarConclusiveIntent(valor)).find(Boolean)
    || null;
}

/**
 * EXISTE CONFLITO DE INTENÇÃO ENTRE O ARTIGO E A SERP?
 *
 * Só quando os DOIS lados são conclusivos e realmente divergem. Comparar uma
 * intenção declarada com a ausência de leitura produz a frase que o smoke
 * encontrou — "a intenção esperada (unknown) não coincide com a aparente
 * (informacional)" — que fala sobre não termos lido nada, não sobre o artigo.
 *
 * A comparação é por FAMÍLIA porque as duas pontas escrevem diferente: o
 * fundamento diz "Informacional" e a SERP devolve "informacional" ou
 * "informational". Exigir igualdade literal inventaria divergência de grafia.
 */
export function radarIntentConflict(input: {
  expected: string | null | undefined;
  observed: string | null | undefined;
}): { conflicting: boolean; expected: string | null; observed: string | null; reason: string } {
  const expected = radarConclusiveIntent(input.expected);
  const observed = radarConclusiveIntent(input.observed);

  if (!expected) {
    return { conflicting: false, expected, observed, reason: "O fundamento não declara intenção conclusiva: não há com o que comparar a leitura da SERP." };
  }
  if (!observed) {
    return { conflicting: false, expected, observed, reason: "A amostra não permitiu observar uma intenção dominante." };
  }

  /*
   * A FAM\u00cdLIA DA INTEN\u00c7\u00c3O DECIDE \u2014 e ela j\u00e1 tem um normalizador can\u00f4nico.
   *
   * "Informacional", "informational" e "informativo" s\u00e3o a MESMA inten\u00e7\u00e3o
   * escrita por tr\u00eas origens: o fundamento do Arquiteto, o provider em ingl\u00eas e
   * o r\u00f3tulo humano. Comparar por prefixo quebrava justo no par PT/EN
   * ("informacion" \u00d7 "information" divergem no nono caractere), e comparar
   * literalmente inventaria diverg\u00eancia de grafia.
   *
   * `normalizeSearchIntent` \u00e9 o normalizador que o Arquiteto j\u00e1 usa para fechar
   * a classifica\u00e7\u00e3o. Reus\u00e1-lo mant\u00e9m uma tabela s\u00f3: se um r\u00f3tulo novo entrar
   * l\u00e1, as duas pontas passam a concordar sobre ele no mesmo dia.
   */
  const familiaEsperada = normalizeSearchIntent(expected);
  const familiaObservada = normalizeSearchIntent(observed);
  const raiz = (valor: string) => valor
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .split(/[^a-z]+/)
    .filter(Boolean)[0] || "";
  const coincide = familiaEsperada !== "unknown" && familiaObservada !== "unknown"
    ? familiaEsperada === familiaObservada
    /* R\u00f3tulo fora da tabela can\u00f4nica: compara o radical, sem acento. */
    : Boolean(raiz(expected)) && Boolean(raiz(observed))
      && (raiz(expected).startsWith(raiz(observed)) || raiz(observed).startsWith(raiz(expected)));

  return {
    conflicting: !coincide,
    expected,
    observed,
    reason: coincide
      ? `A intenção declarada (${expected}) coincide com a observada na SERP (${observed}).`
      : `A intenção esperada (${expected}) não coincide claramente com a intenção aparente (${observed}).`,
  };
}

export type RadarComparisonStatus = "Alinhado" | "Parcialmente alinhado" | "Atenção" | "Evidência insuficiente";
export type RadarComparison = {
  intent: { expected: string; observed: string; status: RadarComparisonStatus };
  topics: { expected: string[]; observed: string[]; missing: string[]; status: RadarComparisonStatus };
  overall: RadarComparisonStatus;
};

export function compareStrategyWithSerp(input: {
  expectedIntent: string | null | undefined;
  observedIntent: string | null | undefined;
  expectedTopics: string[];
  observedTopics: string[];
  hasOrganicEvidence: boolean;
}): RadarComparison {
  const expectedIntent = normalizeIntent(input.expectedIntent);
  const observedIntent = input.observedIntent ? normalizeIntent(input.observedIntent) : "Não observada";
  const intentStatus: RadarComparisonStatus = !input.hasOrganicEvidence || observedIntent === "Não observada"
    ? "Evidência insuficiente"
    : expectedIntent === observedIntent ? "Alinhado" : "Atenção";
  const observed = input.observedTopics.map(normalize).filter(Boolean);
  const expected = input.expectedTopics.map(topic => topic.trim()).filter(Boolean);
  const missing = expected.filter(topic => !observed.includes(normalize(topic)));
  const topicsStatus: RadarComparisonStatus = !input.hasOrganicEvidence
    ? "Evidência insuficiente"
    : !expected.length || !observed.length ? "Evidência insuficiente"
      : missing.length === 0 ? "Alinhado" : missing.length < expected.length ? "Parcialmente alinhado" : "Evidência insuficiente";
  const overall: RadarComparisonStatus = intentStatus === "Atenção" ? "Atenção" : intentStatus === "Evidência insuficiente" && topicsStatus === "Evidência insuficiente" ? "Evidência insuficiente" : intentStatus === "Alinhado" && topicsStatus === "Alinhado" ? "Alinhado" : "Parcialmente alinhado";
  return { intent: { expected: expectedIntent, observed: observedIntent, status: intentStatus }, topics: { expected, observed: input.observedTopics, missing, status: topicsStatus }, overall };
}
