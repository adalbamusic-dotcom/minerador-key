/**
 * O QUE OS CONCORRENTES COBREM — POR CONCEITO, NÃO POR STRING.
 *
 * A leitura anterior contava heading literal. Quatro páginas escrevendo
 * "Como identificar a pele oleosa?", "Características da pele oleosa",
 * "Sinais de uma pele oleosa" e "Como saber se a pele é oleosa?" produziam
 * quatro tópicos com recorrência 1 — e, pior, quatro lacunas independentes.
 * A amostra dizia que o assunto é obrigatório; o relatório dizia que ninguém
 * o cobre. As duas leituras não podiam estar certas ao mesmo tempo.
 *
 * Aqui a evidência bruta ganha uma CAMADA ACIMA dela:
 *
 *   headings extraídos → observações → normalização → tipo + âncora
 *   → conceitos → recorrência por conceito → perguntas → entidades
 *
 * Três compromissos que o módulo não abre mão:
 *
 *   1. A EVIDÊNCIA BRUTA SOBREVIVE. Cada conceito carrega as observações que o
 *      formaram, com o texto ORIGINAL, a página, o nível do heading e a
 *      posição. "De onde isso veio?" tem resposta na própria estrutura.
 *   2. NÃO JUNTAR POR PALAVRA REPETIDA. "causas da pele oleosa" e "como
 *      identificar pele oleosa" compartilham a entidade e NÃO compartilham a
 *      necessidade. O que agrupa é o par (tipo de necessidade + assunto).
 *   3. NADA VIRA PRESCRIÇÃO. Sai "8 de 15 páginas cobrem", nunca "o artigo
 *      precisa de um H2 sobre isso". Quem decide é o Planejador.
 *
 * Isto não é "densidade LSI": não há score de termo, não há meta de repetição.
 * É leitura de cobertura conceitual observada, com procedência.
 *
 * Domínio puro: sem fetch, sem storage, sem provider. O enriquecimento por IA
 * entra por adaptador (`RadarSemanticEnricher`) e é opcional — sem ele o
 * modelo é inteiramente determinístico, e é assim que os testes rodam.
 */

import { z } from "zod";

import { isComparableRadarExtraction } from "./analysis-insights.ts";
import { radarTopicIsNoise, radarTopicTokens, radarRecurrenceThreshold, type RadarTopicClass } from "./topic-classification.ts";

import type { RadarExtractionPage } from "./analysis-contracts.ts";

/* ============================ o vocabulário ============================== */

/**
 * O tipo de necessidade que a observação expressa.
 *
 * Taxonomia curta de propósito: cada entrada precisa mudar o que o Planejador
 * faria com ela. Não há categoria coringa: todo tipo listado aqui é produzido
 * por algum caminho, e o que não tem faceta reconhecida é `TOPIC` — assunto,
 * que é o que ele de fato é. Tipo que ninguém emite dá falsa impressão de
 * cobertura, e essa lição já custou caro na lista de erros recuperáveis.
 */
export type RadarConceptType =
  | "TOPIC"
  | "QUESTION"
  | "ENTITY"
  | "ATTRIBUTE"
  | "PROBLEM"
  | "CAUSE"
  | "BENEFIT"
  | "PROCESS"
  | "COMPARISON"
  | "PRODUCT";

export const RADAR_CONCEPT_TYPE_LABEL: Record<RadarConceptType, string> = {
  TOPIC: "Assunto",
  QUESTION: "Pergunta",
  ENTITY: "Definição da entidade",
  ATTRIBUTE: "Identificação e características",
  PROBLEM: "Problema e risco",
  CAUSE: "Causa e origem",
  BENEFIT: "Benefício e resultado",
  PROCESS: "Processo e aplicação",
  COMPARISON: "Comparação",
  PRODUCT: "Recomendação de produto",
};

/* ========================= normalização mínima =========================== */

const semAcento = (value: string) =>
  value.toLocaleLowerCase("pt-BR").normalize("NFD").replace(/[̀-ͯ]/g, "");

/** A forma comparável do texto. O ORIGINAL nunca é substituído por ela. */
export function radarSemanticNormalize(value: string): string {
  return semAcento(value).replace(/[^a-z0-9\s?-]/g, " ").replace(/\s+/g, " ").trim();
}

/**
 * Raiz conservadora, em português.
 *
 * Só o suficiente para que "pele oleosa", "peles oleosas" e "oleosidade"
 * conversem. Stemming agressivo destrói significado — "sebo" e "sebáceas" NÃO
 * viram a mesma coisa aqui, e é justo que não virem: são entidades
 * relacionadas, não a mesma entidade.
 */
export function radarSemanticStem(token: string): string {
  let raiz = token;
  if (raiz.length >= 6 && raiz.endsWith("idade")) raiz = raiz.slice(0, -5);
  else if (raiz.length >= 6 && raiz.endsWith("mente")) raiz = raiz.slice(0, -5);
  else if (raiz.length >= 5 && raiz.endsWith("ais")) raiz = `${raiz.slice(0, -3)}al`;
  else if (raiz.length >= 5 && raiz.endsWith("oes")) raiz = `${raiz.slice(0, -3)}ao`;
  else if (raiz.length >= 5 && raiz.endsWith("es") && !raiz.endsWith("ses")) raiz = raiz.slice(0, -2);
  else if (raiz.length >= 5 && raiz.endsWith("s") && !raiz.endsWith("ss")) raiz = raiz.slice(0, -1);
  if (raiz.length >= 6 && /[ao]$/.test(raiz)) raiz = raiz.slice(0, -1);
  return raiz;
}

/** Os termos que carregam sentido, já reduzidos à raiz comparável. */
export function radarSemanticStems(value: string | null | undefined): string[] {
  return [...new Set(radarTopicTokens(value).map(radarSemanticStem))].filter(Boolean);
}

/* ========================= ruído de página =============================== */

/*
 * NAVEGAÇÃO NÃO É COBERTURA.
 *
 * "Veja também", "Conclusão", "Compartilhe", "Leia mais" aparecem em quase
 * toda página editorial. Contá-los como conceito recorrente produziria a
 * conclusão de que o mercado inteiro cobre "Conclusão" — e, na outra ponta,
 * uma lacuna competitiva chamada "Compartilhe". O ruído de vitrine já é
 * tratado por `radarTopicIsNoise`; estes são os de navegação editorial.
 */
const RUIDO_EDITORIAL: RegExp[] = [
  /^(veja|leia|confira|assista)\s+(tamb(e|é)m|mais|agora|isso)\b/i,
  /^(conclus(a|ã)o|considera(c|ç)(o|õ)es finais|resumo|introdu(c|ç)(a|ã)o|sum(a|á)rio|(i|í)ndice)\b/i,
  /^(compartilhe|comente|inscreva|siga|curta|assine|deixe seu coment(a|á)rio)\b/i,
  /^(sobre (o|a) autor|refer(e|ê)ncias?|fontes?|bibliografia|posts? relacionados?|artigos? relacionados?)\b/i,
  /^(perguntas frequentes|faq)\s*$/i,
];

export function radarSemanticIsNoise(text: string): { noise: boolean; reason: string | null } {
  if (RUIDO_EDITORIAL.some(pattern => pattern.test(text.trim()))) {
    return { noise: true, reason: "Bloco de navegação editorial: aparece em quase toda página e não descreve cobertura." };
  }
  if (radarTopicIsNoise(text)) {
    return { noise: true, reason: "Bloco de vitrine, navegação ou ficha de produto — não é tema editorial da amostra." };
  }
  if (radarTopicTokens(text).length === 0) {
    return { noise: true, reason: "Sem termo significativo: não sustenta conceito." };
  }
  return { noise: false, reason: null };
}

/* ====================== o tipo de necessidade ============================ */

/*
 * A ORDEM IMPORTA.
 *
 * "Causas internas da pele oleosa" tem "caracter"? Não — mas "Como identificar
 * as causas" teria os dois. Causa é a necessidade mais específica das duas, e
 * por isso é perguntada antes. Cada linha aqui foi escolhida por mudar o que
 * o leitor faria com a informação, não por soar diferente.
 */
const FACETAS: Array<{ type: RadarConceptType; pattern: RegExp }> = [
  { type: "ENTITY", pattern: /\b(o que (e|sao)|defini(c|ç)(a|ã)o|significado|conceito de)\b/ },
  { type: "CAUSE", pattern: /\b(causa|causas|por que|porque|motivo|motivos|origem|razao|razoes|provoca|produz|fica)\b/ },
  { type: "ATTRIBUTE", pattern: /\b(identificar|identifica(c|ç)(a|ã)o|reconhecer|saber se|como saber|caracteristica|caracteristicas|sinal|sinais|sintoma|sintomas|tipos de|descobrir|perceber)\b/ },
  { type: "COMPARISON", pattern: /\b(versus|vs|diferenca entre|diferencas entre|comparativo|comparacao)\b/ },
  { type: "PRODUCT", pattern: /\b(melhor|melhores|top \d|indicados|indicadas|recomendados|recomendadas|qual comprar|onde comprar|produtos para)\b/ },
  { type: "PROBLEM", pattern: /\b(problema|problemas|risco|riscos|erro|erros|dano|danos|efeito colateral|efeitos colaterais|contraindica|perigo|piora)\b/ },
  { type: "BENEFIT", pattern: /\b(beneficio|beneficios|vantagem|vantagens|para que serve|serve para|resultado|resultados|ajuda a)\b/ },
  { type: "PROCESS", pattern: /\b(como fazer|passo a passo|rotina|aplicar|aplica(c|ç)(a|ã)o|usar|tratamento|tratar|cuidado|cuidados|receita|metodo|controlar|reduzir|eliminar|prevenir)\b/ },
];

const INTERROGATIVA = /^(como|o que|que |qual|quais|quando|onde|por que|porque|quanto|quantos|quantas|vale a pena|devo|posso)\b/;

export function radarSemanticIsQuestion(text: string): boolean {
  const normalizado = radarSemanticNormalize(text);
  return normalizado.endsWith("?") || INTERROGATIVA.test(normalizado);
}

/**
 * O tipo de necessidade, se veio de faceta e QUAL TERMO a produziu.
 *
 * O termo é guardado por dois motivos: ele explica a leitura ("isto foi lido
 * como causa por causa de 'por que'") e ele não é entidade — "identificar" e
 * "melhores" descrevem a necessidade, não o assunto, e listá-los entre as
 * entidades observadas encheria a leitura de verbo.
 */
export function radarSemanticType(text: string): { type: RadarConceptType; faceted: boolean; term: string | null } {
  const normalizado = radarSemanticNormalize(text);
  for (const faceta of FACETAS) {
    const encontrado = faceta.pattern.exec(normalizado);
    if (encontrado) return { type: faceta.type, faceted: true, term: encontrado[0] };
  }
  if (radarSemanticIsQuestion(text)) return { type: "QUESTION", faceted: false, term: null };
  return { type: "TOPIC", faceted: false, term: null };
}

/**
 * TODO o vocabulário de necessidade presente no texto, não só o primeiro.
 *
 * "Por que a pele produz muito sebo?" casa em CAUSE por "por que" — e carrega
 * "produz", que é da mesma família e também não é entidade. Guardar só o
 * primeiro match deixava o verbo escapar para a lista de entidades
 * observadas, ao lado de "sebo" e "pele", como se fosse assunto.
 */
export function radarSemanticFacetTerms(text: string): string[] {
  const normalizado = radarSemanticNormalize(text);
  const termos: string[] = [];
  for (const faceta of FACETAS) {
    for (const encontrado of normalizado.matchAll(new RegExp(faceta.pattern.source, "g"))) termos.push(encontrado[0]);
  }
  return termos;
}

/* ===================== o escopo semântico do artigo ====================== */

/**
 * O ASSUNTO DO ARTIGO, NA LARGURA DA COMPOSIÇÃO.
 *
 * A leitura antiga perguntava se o texto continha LITERALMENTE a entidade
 * central. "peles oleosas" não contém "pele oleosa", e a página saía como
 * incompatível — ausência de string lida como ausência de assunto.
 *
 * O escopo aqui são as RAÍZES de tudo que a composição declara: entidade
 * central, principal, secundárias, reforços e tópicos editoriais. É o mesmo
 * artigo visto por todos os seus nomes.
 */
export type RadarSemanticScope = {
  /** O núcleo: entidade central e principal. Casar aqui é casar com o artigo. */
  core: Set<string>;
  /** A composição inteira: núcleo mais secundárias, reforços e tópicos. */
  stems: Set<string>;
  entities: string[];
  source: "composition" | "empty";
};

export function buildRadarSemanticScope(input: {
  centralEntities?: readonly string[];
  keywordTexts?: readonly string[];
  editorialTopics?: readonly string[];
  /** A principal do artigo, quando conhecida — ela pertence ao núcleo. */
  principal?: string | null;
}): RadarSemanticScope {
  const entities = [...new Set([...(input.centralEntities || [])].map(item => item.trim()).filter(Boolean))];
  const core = new Set<string>();
  for (const texto of [...entities, ...(input.principal ? [input.principal] : [])]) {
    for (const raiz of radarSemanticStems(texto)) core.add(raiz);
  }
  const stems = new Set(core);
  for (const texto of [...(input.keywordTexts || []), ...(input.editorialTopics || [])]) {
    for (const raiz of radarSemanticStems(texto)) stems.add(raiz);
  }
  /* Sem núcleo declarado, a composição inteira faz as vezes dele. */
  if (!core.size) for (const raiz of stems) core.add(raiz);
  return { core, stems, entities, source: stems.size ? "composition" : "empty" };
}

export type RadarEntityReading = "compatible" | "related" | "unknown" | "divergent";

/**
 * A LEITURA DE ENTIDADE ANTES DA EXTRAÇÃO — CONSERVADORA POR CONTRATO.
 *
 * Antes da extração existem só título, URL e a consulta que trouxe a página.
 * Com tão pouco, o matcher lexical não sabe que "sebo" tem relação com
 * "oleosidade" — e a versão anterior transformava esse não-saber em veto:
 * `absent`, e o Gate 5 descartava a referência. A página nunca era extraída,
 * então o modelo semântico nunca recebia o texto que resolveria a dúvida.
 * A ignorância se autoconfirmava.
 *
 * Agora os quatro estados dizem coisas diferentes:
 *
 *   compatible  casa com o núcleo do artigo — entidade central ou principal
 *   related     casa com a composição ampliada ou com a consulta que a trouxe
 *   unknown     não deu para observar relação NEM divergência
 *   divergent   há EVIDÊNCIA POSITIVA de outro assunto
 *
 * `divergent` nunca nasce de silêncio léxico. Ele exige um sinal observado —
 * hoje, a contradição de intenção/formato que o universo já calcula. Sem esse
 * sinal a resposta é `unknown`, e `unknown` preserva a página para a extração
 * decidir. Errar preservando custa uma extração; errar descartando custa a
 * evidência inteira, e em silêncio.
 */
export function radarSemanticEntityReading(input: {
  text: string;
  scope: RadarSemanticScope;
  /** O texto da consulta que devolveu esta página, quando conhecido. */
  queryText?: string | null;
  /**
   * Evidência POSITIVA de que a página trata de outro assunto, observada fora
   * deste módulo. Sem ela não existe divergência declarável nesta fase.
   */
  divergenceEvidence?: boolean;
}): RadarEntityReading {
  if (input.scope.source === "empty") return "unknown";
  const raizes = radarSemanticStems(input.text);
  if (!raizes.length) return "unknown";

  if (raizes.some(raiz => input.scope.core.has(raiz))) return "compatible";
  if (raizes.some(raiz => input.scope.stems.has(raiz))) return "related";

  const daConsulta = new Set(radarSemanticStems(input.queryText));
  if (daConsulta.size && raizes.some(raiz => daConsulta.has(raiz))) return "related";

  return input.divergenceEvidence ? "divergent" : "unknown";
}

/** A leitura autoriza tratar a página como do assunto do artigo? */
export const radarEntityReadingAllows = (reading: RadarEntityReading) => reading !== "divergent";

/* ========================== as observações =============================== */

export type RadarSemanticObservation = {
  observationId: string;
  /** O texto EXATAMENTE como a página escreveu. Nunca sobrescrito. */
  text: string;
  normalized: string;
  pageId: string;
  url: string;
  pageTitle: string;
  level: 2 | 3;
  /** 0 = topo do documento, 1 = fim. */
  position: number;
  isQuestion: boolean;
  type: RadarConceptType;
  faceted: boolean;
  /** O termo que produziu a leitura de tipo. `null` quando não houve faceta. */
  facetTerm: string | null;
  /** A observação fala do assunto do artigo? */
  anchored: boolean;
  stems: string[];
  /** As raízes que sobram fora da âncora — o que distingue uma da outra. */
  residual: string[];
  noise: boolean;
  noiseReason: string | null;
};

/* ============================ os conceitos =============================== */

export type RadarConceptConfidence = "HIGH" | "MEDIUM" | "LOW";

export type RadarSemanticConcept = {
  id: string;
  /** Uma formulação REAL da amostra, não uma frase inventada. */
  canonicalLabel: string;
  conceptType: RadarConceptType;
  typeLabel: string;
  /** As formulações distintas observadas, com o texto original de cada uma. */
  variants: string[];
  entities: string[];
  questions: string[];
  supportingObservations: RadarSemanticObservation[];
  sourceUrls: string[];
  /** Páginas distintas — não aparições. Duas seções da mesma página contam uma. */
  sourceCount: number;
  recurrence: number;
  sampleSize: number;
  /** Consultas distintas que trouxeram as páginas deste conceito. */
  queryCoverage: number;
  queries: string[];
  /** O papel das keywords que trouxeram as páginas: principal, secundária, reforço. */
  keywordRoles: string[];
  origins: { canonical: number; auxiliary: number; formation: number };
  /** Só a pesquisa auxiliar trouxe este conceito. Ele continua no modelo. */
  auxiliaryOnly: boolean;
  anchored: boolean;
  classification: RadarTopicClass;
  classificationReason: string;
  confidence: RadarConceptConfidence;
  confidenceReason: string;
};

export type RadarQuestionCluster = {
  id: string;
  /** A pergunta representativa — a mais frequente da amostra, texto original. */
  canonicalQuestion: string;
  variants: string[];
  conceptId: string;
  pages: number;
  sourceUrls: string[];
  queryCoverage: number;
};

/**
 * Entidade observada, com a relação PRESERVADA.
 *
 * "oleosidade" e "pele oleosa" partilham raiz — `same_as`. "sebo" aparece ao
 * lado do assunto sem partilhar raiz — `related_to`. Colapsar as duas numa só
 * apagaria a diferença entre o assunto e o que o explica.
 */
export type RadarSemanticEntity = {
  label: string;
  stem: string;
  origin: "article" | "competitors" | "both";
  pages: number;
  sourceUrls: string[];
  relation: "same_as" | "related_to" | "distinct";
  relatedTo: string | null;
};

export type RadarSemanticConceptModel = {
  concepts: RadarSemanticConcept[];
  questionClusters: RadarQuestionCluster[];
  entities: RadarSemanticEntity[];
  /** A evidência bruta, inteira — inclusive o que virou ruído. */
  rawObservations: RadarSemanticObservation[];
  coverage: {
    sampleSize: number;
    observations: number;
    grouped: number;
    noiseFiltered: number;
    conceptCount: number;
    recurrentConcepts: number;
    undercoveredConcepts: number;
    auxiliaryOnlyConcepts: number;
  };
  limitations: string[];
  enrichment: { applied: boolean; source: string | null };
};

/**
 * O ponto onde a IA entra, quando entrar.
 *
 * Nenhuma relação "sebo ≈ oleosidade" sai de comparação de string: isso é
 * conhecimento de mundo. O adaptador existe para receber esse enriquecimento
 * sem que o resto do módulo dependa dele — e sem ele o modelo é inteiro,
 * determinístico e testável. Nada aqui chama rede.
 */
export type RadarSemanticEnricher = {
  source: string;
  relateEntities: (input: { entities: readonly string[]; scope: readonly string[] }) => Array<{ label: string; relatedTo: string; relation: "same_as" | "related_to" }>;
};

/* ============================ a procedência ============================== */

/** De onde a página veio: quais consultas a trouxeram, e de que classe. */
export type RadarPageProvenance = {
  url: string;
  appearances: ReadonlyArray<{ keyword: string | null; keywordRole: string; sourceType: "canonical" | "auxiliary" | "formation" }>;
};

const chaveDeUrl = (url: string) => semAcento(url).replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/[?#].*$/, "").replace(/\/+$/, "");

/* ============================== o motor ================================= */

/** Identidade estável: mesma chave de agrupamento, mesmo id, entre execuções. */
function assinatura(valor: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < valor.length; index += 1) {
    hash ^= valor.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}

export function radarSemanticObservations(input: {
  pages: readonly RadarExtractionPage[];
  scope: RadarSemanticScope;
}): RadarSemanticObservation[] {
  const observations: RadarSemanticObservation[] = [];
  for (const page of input.pages) {
    const total = page.headingOutline.length || 1;
    page.headingOutline.forEach((heading, index) => {
      if (heading.level === 1) return;
      const texto = heading.text.trim();
      if (!texto) return;
      const ruido = radarSemanticIsNoise(texto);
      const { type, faceted, term } = radarSemanticType(texto);
      const stems = radarSemanticStems(texto);
      const anchored = input.scope.source === "composition" && stems.some(raiz => input.scope.stems.has(raiz));
      observations.push({
        observationId: `obs:${page.id}:${index}`,
        text: texto,
        normalized: radarSemanticNormalize(texto),
        pageId: page.id,
        url: page.url,
        pageTitle: page.title || page.url,
        level: heading.level as 2 | 3,
        position: Number((index / total).toFixed(2)),
        isQuestion: radarSemanticIsQuestion(texto),
        type,
        faceted,
        facetTerm: term,
        anchored,
        stems,
        residual: stems.filter(raiz => !input.scope.stems.has(raiz)),
        noise: ruido.noise,
        noiseReason: ruido.reason,
      });
    });
  }
  return observations;
}

/** Duas formulações sem faceta descrevem o mesmo assunto? Interseção de raízes. */
function residuoCompativel(esquerda: readonly string[], direita: readonly string[]): boolean {
  if (!esquerda.length || !direita.length) return !esquerda.length && !direita.length;
  const conjunto = new Set(esquerda);
  const comuns = direita.filter(raiz => conjunto.has(raiz)).length;
  return comuns / Math.min(esquerda.length, direita.length) >= 0.6;
}

/*
 * A REGRA DE AGRUPAMENTO, EM UMA FRASE.
 *
 * Duas observações são o mesmo conceito quando expressam a MESMA NECESSIDADE
 * (tipo) sobre o MESMO ASSUNTO (âncora) — e, quando o tipo não veio de uma
 * faceta reconhecida, quando as raízes que sobram também conversam.
 *
 * É por isso que "causas da pele oleosa" e "como identificar pele oleosa" não
 * se juntam apesar de partilharem a entidade: necessidades diferentes.
 * E é por isso que "Sinais de uma pele oleosa" e "Como saber se a pele é
 * oleosa?" se juntam apesar de não partilharem nenhuma palavra além do
 * assunto: mesma necessidade.
 */
function compativeis(esquerda: RadarSemanticObservation, direita: RadarSemanticObservation): boolean {
  if (esquerda.type !== direita.type) return false;
  if (esquerda.anchored !== direita.anchored) return false;
  if (esquerda.anchored && esquerda.faceted && direita.faceted) return true;
  return residuoCompativel(esquerda.residual, direita.residual);
}

function confiancaDoConceito(input: {
  sourceCount: number;
  sampleSize: number;
  queryCoverage: number;
  anchored: boolean;
  variants: number;
}): { confidence: RadarConceptConfidence; reason: string } {
  const sinais: string[] = [];
  let pontos = 0;
  if (input.sourceCount >= radarRecurrenceThreshold(input.sampleSize)) { pontos += 2; sinais.push(`${input.sourceCount} de ${input.sampleSize} páginas`); }
  else if (input.sourceCount > 1) { pontos += 1; sinais.push(`${input.sourceCount} páginas`); }
  else sinais.push("uma única página");
  if (input.queryCoverage > 1) { pontos += 1; sinais.push(`${input.queryCoverage} consultas distintas`); }
  if (input.anchored) { pontos += 1; sinais.push("alinhado ao assunto declarado pelo ArticleDNA"); }
  if (input.variants > 1) { pontos += 1; sinais.push(`${input.variants} formulações concordantes`); }
  const confidence: RadarConceptConfidence = pontos >= 4 ? "HIGH" : pontos >= 2 ? "MEDIUM" : "LOW";
  return { confidence, reason: `Sustentado por ${sinais.join(", ")}.` };
}

export function buildRadarSemanticConceptModel(input: {
  pages: readonly RadarExtractionPage[];
  centralEntities?: readonly string[];
  keywordTexts?: readonly string[];
  editorialTopics?: readonly string[];
  provenance?: readonly RadarPageProvenance[];
  enricher?: RadarSemanticEnricher | null;
}): RadarSemanticConceptModel {
  const comparaveis = input.pages.filter(isComparableRadarExtraction);
  const scope = buildRadarSemanticScope(input);
  const observations = radarSemanticObservations({ pages: comparaveis, scope });
  const uteis = observations.filter(item => !item.noise);
  const limitations: string[] = [];

  if (!comparaveis.length) limitations.push("Nenhuma página comparável nesta amostra: não há cobertura conceitual observável.");
  if (scope.source === "empty") limitations.push("A composição não forneceu entidade central nem keywords resolvidas: os conceitos foram agrupados sem âncora do artigo.");
  if (comparaveis.length && !uteis.length) limitations.push("As páginas comparáveis não expuseram headings aproveitáveis; a leitura conceitual ficou vazia.");
  if (comparaveis.some(page => !page.headingOutline.length)) limitations.push("Alguma página comparável não expôs hierarquia de headings; a cobertura conceitual dela não foi observada.");
  if (!input.provenance?.length && comparaveis.length) limitations.push("A procedência por consulta não foi fornecida: a cobertura por consulta de cada conceito não pôde ser observada.");

  /* ------------------------- procedência por página ----------------------- */

  const procedencia = new Map<string, RadarPageProvenance>();
  for (const item of input.provenance || []) procedencia.set(chaveDeUrl(item.url), item);

  /* -------------------------- agrupamento guloso -------------------------- */

  const grupos: RadarSemanticObservation[][] = [];
  for (const observation of uteis) {
    const grupo = grupos.find(atual => atual.every(membro => compativeis(membro, observation)));
    if (grupo) grupo.push(observation);
    else grupos.push([observation]);
  }

  const sampleSize = comparaveis.length;
  const concepts: RadarSemanticConcept[] = grupos.map(grupo => {
    const paginas = [...new Set(grupo.map(item => item.pageId))];
    const urls = [...new Set(grupo.map(item => item.url))];
    const type = grupo[0].type;
    const anchored = grupo[0].anchored;

    /* O rótulo é a formulação mais repetida da amostra; empate, a mais curta. */
    const frequencia = new Map<string, number>();
    for (const item of grupo) frequencia.set(item.text, (frequencia.get(item.text) || 0) + 1);
    const canonicalLabel = [...frequencia.entries()]
      .sort((left, right) => right[1] - left[1] || left[0].length - right[0].length)[0][0];

    const consultas = new Set<string>();
    const papeis = new Set<string>();
    const origins = { canonical: 0, auxiliary: 0, formation: 0 };
    let comProcedencia = 0;
    for (const url of urls) {
      const fonte = procedencia.get(chaveDeUrl(url));
      if (!fonte) continue;
      comProcedencia += 1;
      for (const aparicao of fonte.appearances) {
        if (aparicao.keyword) consultas.add(aparicao.keyword);
        if (aparicao.keywordRole) papeis.add(aparicao.keywordRole);
        origins[aparicao.sourceType] += 1;
      }
    }

    const recurrence = paginas.length;
    const limiar = radarRecurrenceThreshold(sampleSize);
    const classification: RadarTopicClass = recurrence >= limiar
      ? "RECURRENT_TOPIC"
      : anchored ? "COMPETITIVE_GAP" : "ISOLATED_TOPIC";
    const classificationReason = recurrence >= limiar
      ? `Observado em ${recurrence} de ${sampleSize} páginas comparáveis, sob ${frequencia.size} formulação(ões).`
      : anchored
        ? `Relacionado ao assunto declarado pelo artigo, mas coberto por apenas ${recurrence} de ${sampleSize} páginas comparáveis.`
        : `Aparece em ${recurrence} de ${sampleSize} páginas e não se relaciona ao assunto declarado pelo artigo.`;

    const { confidence, reason } = confiancaDoConceito({
      sourceCount: recurrence, sampleSize, queryCoverage: consultas.size, anchored, variants: frequencia.size,
    });

    return {
      id: `concept:${type.toLowerCase()}:${assinatura(`${type}|${anchored}|${[...frequencia.keys()].sort().join("|")}`)}`,
      canonicalLabel,
      conceptType: type,
      typeLabel: RADAR_CONCEPT_TYPE_LABEL[type],
      variants: [...frequencia.keys()],
      entities: [...new Set(grupo.flatMap(item => radarTopicTokens(item.text)))],
      questions: [...new Set(grupo.filter(item => item.isQuestion).map(item => item.text))],
      supportingObservations: grupo,
      sourceUrls: urls,
      sourceCount: recurrence,
      recurrence,
      sampleSize,
      queryCoverage: consultas.size,
      queries: [...consultas],
      keywordRoles: [...papeis],
      origins,
      auxiliaryOnly: comProcedencia > 0 && origins.canonical === 0 && origins.auxiliary > 0,
      anchored,
      classification,
      classificationReason,
      confidence,
      confidenceReason: reason,
    };
  }).sort((left, right) => right.sourceCount - left.sourceCount || left.canonicalLabel.localeCompare(right.canonicalLabel, "pt-BR"));

  /* --------------------------- perguntas ---------------------------------- */

  /*
   * PERGUNTA É NECESSIDADE PRÓPRIA.
   *
   * "Como saber se a pele é oleosa?" e "Como identificar pele oleosa?" são a
   * mesma necessidade escrita de dois jeitos. "Por que minha pele fica
   * oleosa?" é outra — e o agrupamento já as separou, porque a faceta é
   * diferente. O cluster reaproveita esse trabalho em vez de refazê-lo com
   * outra régua.
   */
  const questionClusters: RadarQuestionCluster[] = concepts
    .filter(concept => concept.questions.length > 0)
    .map(concept => {
      const perguntas = concept.supportingObservations.filter(item => item.isQuestion);
      const frequencia = new Map<string, number>();
      for (const item of perguntas) frequencia.set(item.text, (frequencia.get(item.text) || 0) + 1);
      const canonical = [...frequencia.entries()].sort((left, right) => right[1] - left[1] || left[0].length - right[0].length)[0][0];
      return {
        id: `question:${assinatura(concept.id)}`,
        canonicalQuestion: canonical,
        variants: [...frequencia.keys()],
        conceptId: concept.id,
        pages: new Set(perguntas.map(item => item.pageId)).size,
        sourceUrls: [...new Set(perguntas.map(item => item.url))],
        queryCoverage: concept.queryCoverage,
      };
    });

  /* --------------------------- entidades ---------------------------------- */

  /*
   * A RELAÇÃO É PRESERVADA, NÃO RESOLVIDA.
   *
   * `same_as` quando a raiz é a mesma do que o artigo declara — "oleosidade" e
   * "oleosa" são a mesma entidade escrita de dois jeitos. `related_to` quando
   * a entidade aparece ao lado do assunto na mesma observação sem partilhar
   * raiz: "sebo" explica "pele oleosa" e não é "pele oleosa". Colapsar as duas
   * apagaria a diferença entre o assunto e aquilo que o explica.
   */
  const conviveComAncora = new Map<string, string>();
  for (const observation of uteis.filter(item => item.anchored)) {
    const daAncora = observation.stems.filter(raiz => scope.stems.has(raiz));
    if (!daAncora.length) continue;
    for (const raiz of observation.stems) {
      if (scope.stems.has(raiz) || conviveComAncora.has(raiz)) continue;
      conviveComAncora.set(raiz, daAncora[0]);
    }
  }

  const porEntidade = new Map<string, { label: string; stem: string; pages: Set<string>; urls: Set<string> }>();
  for (const observation of uteis) {
    /* O termo que nomeia a necessidade não é entidade: "identificar" não é assunto. */
    const daFaceta = new Set(radarSemanticFacetTerms(observation.text).flatMap(termo => radarSemanticStems(termo)));
    for (const termo of radarTopicTokens(observation.text)) {
      const raiz = radarSemanticStem(termo);
      if (daFaceta.has(raiz)) continue;
      const atual = porEntidade.get(raiz) || { label: termo, stem: raiz, pages: new Set<string>(), urls: new Set<string>() };
      if (termo.length < atual.label.length) atual.label = termo;
      atual.pages.add(observation.pageId);
      atual.urls.add(observation.url);
      porEntidade.set(raiz, atual);
    }
  }

  const entities: RadarSemanticEntity[] = [...porEntidade.values()]
    .filter(item => item.pages.size > 1 || scope.stems.has(item.stem) || conviveComAncora.has(item.stem))
    .map(item => {
      const noArtigo = scope.stems.has(item.stem);
      const vizinha = conviveComAncora.get(item.stem) || null;
      return {
        label: item.label,
        stem: item.stem,
        origin: noArtigo ? ("both" as const) : ("competitors" as const),
        pages: item.pages.size,
        sourceUrls: [...item.urls],
        relation: noArtigo ? ("same_as" as const) : vizinha ? ("related_to" as const) : ("distinct" as const),
        relatedTo: noArtigo ? item.stem : vizinha,
      };
    })
    .sort((left, right) => right.pages - left.pages || left.label.localeCompare(right.label, "pt-BR"));

  /* As entidades do artigo que a amostra não observou continuam declaradas. */
  for (const entidade of scope.entities) {
    if (entities.some(item => radarSemanticStems(entidade).includes(item.stem))) continue;
    entities.push({ label: entidade, stem: radarSemanticStems(entidade)[0] || entidade, origin: "article", pages: 0, sourceUrls: [], relation: "distinct", relatedTo: null });
  }

  /* -------------------------- enriquecimento ------------------------------ */

  let enrichment: RadarSemanticConceptModel["enrichment"] = { applied: false, source: null };
  if (input.enricher) {
    const relacoes = input.enricher.relateEntities({ entities: entities.map(item => item.label), scope: [...scope.stems] });
    for (const relacao of relacoes) {
      const alvo = entities.find(item => item.label === relacao.label);
      if (!alvo || alvo.relation === "same_as") continue;
      alvo.relation = relacao.relation;
      alvo.relatedTo = relacao.relatedTo;
    }
    enrichment = { applied: true, source: input.enricher.source };
  } else if (comparaveis.length) {
    limitations.push("Entidades escritas com superfícies diferentes e sem raiz em comum só se relacionam pelo adaptador de enriquecimento, que não está ligado nesta investigação; aqui elas permanecem distintas.");
  }

  const recorrentes = concepts.filter(item => item.classification === "RECURRENT_TOPIC").length;

  return {
    concepts,
    questionClusters,
    entities,
    rawObservations: observations,
    coverage: {
      sampleSize,
      observations: observations.length,
      grouped: uteis.length,
      noiseFiltered: observations.length - uteis.length,
      conceptCount: concepts.length,
      recurrentConcepts: recorrentes,
      undercoveredConcepts: concepts.filter(item => item.classification === "COMPETITIVE_GAP").length,
      auxiliaryOnlyConcepts: concepts.filter(item => item.auxiliaryOnly).length,
    },
    limitations,
    enrichment,
  };
}

/** Os conceitos de uma classe — a mesma gramática de `radarTopicsOfClass`. */
export const radarConceptsOfClass = (model: RadarSemanticConceptModel, classification: RadarTopicClass) =>
  model.concepts.filter(item => item.classification === classification);

/* ==================== a camada como dado persistido ====================== */

/**
 * A LEITURA CONCEITUAL PRECISA SOBREVIVER AO RELOAD.
 *
 * O relatório aprovado é o que o Planejador recebe. Se o agrupamento só
 * existisse como cálculo de render, o pacote enviado teria os headings crus e
 * a conclusão humana teria sido tomada sobre outra coisa. As observações vão
 * junto de propósito: sem elas o conceito é uma afirmação sem procedência.
 *
 * `.strict()` porque um campo novo que não passe por aqui deve falhar ao
 * gravar, e não silenciosamente na leitura.
 */
const ConceptTypeSchema = z.enum([
  "TOPIC", "QUESTION", "ENTITY", "ATTRIBUTE", "PROBLEM", "CAUSE", "BENEFIT", "PROCESS", "COMPARISON", "PRODUCT",
]);

const ObservationSchema = z.object({
  observationId: z.string(),
  text: z.string(),
  normalized: z.string(),
  pageId: z.string(),
  url: z.string(),
  pageTitle: z.string(),
  level: z.union([z.literal(2), z.literal(3)]),
  position: z.number(),
  isQuestion: z.boolean(),
  type: ConceptTypeSchema,
  faceted: z.boolean(),
  facetTerm: z.string().nullable(),
  anchored: z.boolean(),
  stems: z.array(z.string()),
  residual: z.array(z.string()),
  noise: z.boolean(),
  noiseReason: z.string().nullable(),
}).strict();

const ConceptSchema = z.object({
  id: z.string(),
  canonicalLabel: z.string(),
  conceptType: ConceptTypeSchema,
  typeLabel: z.string(),
  variants: z.array(z.string()),
  entities: z.array(z.string()),
  questions: z.array(z.string()),
  supportingObservations: z.array(ObservationSchema),
  sourceUrls: z.array(z.string()),
  sourceCount: z.number().int().nonnegative(),
  recurrence: z.number().int().nonnegative(),
  sampleSize: z.number().int().nonnegative(),
  queryCoverage: z.number().int().nonnegative(),
  queries: z.array(z.string()),
  keywordRoles: z.array(z.string()),
  origins: z.object({ canonical: z.number().int().nonnegative(), auxiliary: z.number().int().nonnegative(), formation: z.number().int().nonnegative() }).strict(),
  auxiliaryOnly: z.boolean(),
  anchored: z.boolean(),
  classification: z.enum(["RECURRENT_TOPIC", "COMPETITIVE_GAP", "ISOLATED_TOPIC", "PAGE_SPECIFIC_NOISE"]),
  classificationReason: z.string(),
  confidence: z.enum(["HIGH", "MEDIUM", "LOW"]),
  confidenceReason: z.string(),
}).strict();

export const RadarSemanticConceptModelSchema = z.object({
  concepts: z.array(ConceptSchema),
  questionClusters: z.array(z.object({
    id: z.string(),
    canonicalQuestion: z.string(),
    variants: z.array(z.string()),
    conceptId: z.string(),
    pages: z.number().int().nonnegative(),
    sourceUrls: z.array(z.string()),
    queryCoverage: z.number().int().nonnegative(),
  }).strict()),
  entities: z.array(z.object({
    label: z.string(),
    stem: z.string(),
    origin: z.enum(["article", "competitors", "both"]),
    pages: z.number().int().nonnegative(),
    sourceUrls: z.array(z.string()),
    relation: z.enum(["same_as", "related_to", "distinct"]),
    relatedTo: z.string().nullable(),
  }).strict()),
  rawObservations: z.array(ObservationSchema),
  coverage: z.object({
    sampleSize: z.number().int().nonnegative(),
    observations: z.number().int().nonnegative(),
    grouped: z.number().int().nonnegative(),
    noiseFiltered: z.number().int().nonnegative(),
    conceptCount: z.number().int().nonnegative(),
    recurrentConcepts: z.number().int().nonnegative(),
    undercoveredConcepts: z.number().int().nonnegative(),
    auxiliaryOnlyConcepts: z.number().int().nonnegative(),
  }).strict(),
  limitations: z.array(z.string()),
  enrichment: z.object({ applied: z.boolean(), source: z.string().nullable() }).strict(),
}).strict();

/* O schema e o tipo descrevem a MESMA coisa — e o compilador confere. */
type CamadaPeloSchema = z.infer<typeof RadarSemanticConceptModelSchema>;
const CONTRATO_DA_CAMADA: [
  RadarSemanticConceptModel extends CamadaPeloSchema ? true : never,
  CamadaPeloSchema extends RadarSemanticConceptModel ? true : never,
] = [true, true];
void CONTRATO_DA_CAMADA;
