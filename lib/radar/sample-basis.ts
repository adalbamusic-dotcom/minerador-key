import { radarRegistrableDomain } from "./research-noise.ts";
import { radarNormalizedUrl } from "./research-reference.ts";

/**
 * ===== 2026-10-09 · UMA BASE DE AMOSTRA SÓ (defeito 2 da rodada de coerência dos 8 CSVs "para escrever") =====
 *
 * O CSV de "leads qualificados" dizia, na mesma linha, "Páginas comparáveis
 * lidas pela investigação (…; 12)", "H2/H3 das 12 páginas comparáveis, de 10
 * site(s)" e, logo depois, "Autoria: 10 de 23 páginas", "Data de atualização
 * visível: 22 de 23", "Diferenciar em …: só 6 de 23 página(s) cobrem" e as
 * evidências do artigo-modelo "C1 (… (17 de 23 páginas))". Nos 8 arquivos:
 * atrair 12×23, leads 12×23, captar 19×36, tráfego 18×32, captação 16×20,
 * promoções 5×8; Instagram 6×6 e campanhas 12×12 batiam.
 *
 * A CAUSA: as duas listas saem do MESMO modelo observado
 * (`RadarCompetitiveObservedModel`, o `bundle.observed`), mas a lista impressa
 * vinha de `radarPortableCompetitorsStructure`, que corta os concorrentes em
 * `RADAR_PORTABLE_GAP_LIMITS.competitors` (20) PELA MELHOR POSIÇÃO — teto da
 * célula `competitors_structure_json`, contando também as referências não
 * comparáveis (lista, produto, vitrine). Das 20 primeiras, 12 eram comparáveis;
 * as outras 11 comparáveis (posição pior, quase sempre de consulta auxiliar)
 * ficavam fora da lista e dos temas, e dentro de toda conta do modelo. Todo
 * número impresso é ≤ 20 nos 8 CSVs; todo "de M" do modelo é o total.
 *
 * A BASE ÚNICA: as páginas comparáveis do modelo observado, SEM teto — as
 * referências com extração comparável (`competitors[].comparable`), uma vez
 * por URL normalizada, na ordem da melhor posição (a mesma da coluna JSON). É o
 * conjunto sobre o qual o modelo contou conceitos, perguntas, lacunas,
 * diferenciais e sinais de E-E-A-T, e o tamanho dele é o
 * `sample.comparablePages` gravado (a fotografia). Nada aqui muda o modelo
 * observado nem o hash do dossiê: é régua de APRESENTAÇÃO, para o export e o
 * pedido do artigo-modelo.
 *
 * Quando a lista e a fotografia divergem (a lista viva tem outro tamanho que o
 * `comparablePages` congelado), o número do modelo é recontado sobre a base
 * pelas URLs que o sustentam; sem URL para recontar, a contagem SAI do texto —
 * nunca um "N de M" sobre outra base. Módulo puro: sem servidor, sem banco.
 */

/** Uma página da base, como o modelo observado a guarda. */
export type RadarSampleBasisPage = {
  url: string;
  /** A URL normalizada (`radarNormalizedUrl`): a identidade da página na base. */
  key: string;
  domain: string;
  /** O site (`radarRegistrableDomain`): a unidade da recorrência dos temas. */
  site: string;
  title: string;
  bestPosition: number | null;
  structure: { words: number; h2: number; h3: number; paragraphs: number; images: number; lists: number } | null;
};

export type RadarSampleBasis = {
  /** As páginas comparáveis, sem teto, na ordem da melhor posição. */
  pages: RadarSampleBasisPage[];
  size: number;
  /** Sites distintos entre as páginas da base. */
  sites: number;
  /** O `sample.comparablePages` do modelo (a fotografia, quando congelado); `null` quando o modelo não o traz. */
  modelSize: number | null;
  /** A base tem o tamanho da amostra do modelo: os números dele já estão sobre ela. */
  aligned: boolean;
};

/** O que a régua lê do modelo observado (o `bundle.observed` ou o `googleObserved` do export). */
export type RadarSampleBasisModel = {
  competitors: ReadonlyArray<{
    url: string;
    domain: string;
    title: string;
    comparable: boolean;
    queryRecurrence?: number | null;
    ranks?: ReadonlyArray<{ rank: number | null | undefined }> | null;
    structure?: RadarSampleBasisPage["structure"];
  }>;
  sample?: { comparablePages?: number | null } | null;
};

const melhorPosicao = (ranks: RadarSampleBasisModel["competitors"][number]["ranks"]): number | null => {
  const validas = (ranks || []).map(item => item.rank).filter((rank): rank is number => typeof rank === "number" && Number.isFinite(rank));
  return validas.length ? Math.min(...validas) : null;
};

/**
 * A base única de um modelo observado. `null` quando não há modelo ou nenhuma
 * página comparável na lista (o transporte compacto sem extrações): aí quem
 * apresenta continua com os números do modelo, como antes, e não imprime lista.
 */
export function radarSampleBasisOf(model: RadarSampleBasisModel | null | undefined): RadarSampleBasis | null {
  if (!model) return null;
  const vistas = new Set<string>();
  const paginas = model.competitors
    .map((item, ordem) => ({ item, ordem, key: radarNormalizedUrl(item.url || ""), bestPosition: melhorPosicao(item.ranks) }))
    .filter(({ item, key }) => item.comparable && Boolean(key) && !vistas.has(key) && Boolean(vistas.add(key)))
    /* A ordem da coluna `competitors_structure_json`: melhor posição, depois recorrência entre consultas, depois a do modelo. */
    .sort((a, b) =>
      (a.bestPosition ?? Number.POSITIVE_INFINITY) - (b.bestPosition ?? Number.POSITIVE_INFINITY)
      || (b.item.queryRecurrence ?? 0) - (a.item.queryRecurrence ?? 0)
      || a.ordem - b.ordem)
    .map(({ item, key, bestPosition }): RadarSampleBasisPage => ({
      url: item.url,
      key,
      domain: item.domain,
      site: radarRegistrableDomain(item.domain || item.url),
      title: item.title,
      bestPosition,
      structure: item.structure ?? null,
    }));
  if (!paginas.length) return null;
  const doModelo = model.sample?.comparablePages;
  const modelSize = typeof doModelo === "number" && Number.isFinite(doModelo) && doModelo > 0 ? doModelo : null;
  return {
    pages: paginas,
    size: paginas.length,
    sites: new Set(paginas.map(item => item.site).filter(Boolean)).size,
    modelSize,
    aligned: modelSize === null || modelSize === paginas.length,
  };
}

/** "23 páginas comparáveis, de 19 sites" — o nome da base, o mesmo em toda coluna. */
export function radarSampleBasisLabel(basis: Pick<RadarSampleBasis, "size" | "sites">): string {
  const paginas = `${basis.size} ${basis.size === 1 ? "página comparável" : "páginas comparáveis"}`;
  return `${paginas}, de ${basis.sites} ${basis.sites === 1 ? "site" : "sites"}`;
}

export type RadarSampleBasisFraction = { pages: number; sampleSize: number; recounted: boolean };

/**
 * UM "N de M" SOBRE A BASE.
 *
 *   - sem base (`null`): os números do modelo, como vieram (nada a unificar);
 *   - o "de M" do modelo já é o tamanho da base: os números dele;
 *   - senão, com as URLs que sustentam a medida: recontado sobre a base;
 *   - senão: `null` — quem apresenta tira a contagem do texto.
 */
export function radarSampleBasisFraction(
  basis: RadarSampleBasis | null,
  medida: { pages: number; sampleSize: number; urls?: ReadonlyArray<string | null | undefined> | null },
): RadarSampleBasisFraction | null {
  const pages = Math.max(0, Math.trunc(medida.pages || 0));
  if (!basis) return { pages, sampleSize: medida.sampleSize, recounted: false };
  if (medida.sampleSize === basis.size) return { pages: Math.min(pages, basis.size), sampleSize: basis.size, recounted: false };
  if (!medida.urls) return null;
  const naBase = new Set(basis.pages.map(item => item.key));
  const contadas = new Set(medida.urls.map(url => radarNormalizedUrl(url || "")).filter(key => naBase.has(key)));
  return { pages: contadas.size, sampleSize: basis.size, recounted: true };
}

/* ============================== as fontes de cada medida do modelo ============================== */

/** A chave de comparação de um rótulo: sem acento, sem entidade HTML, sem pontuação. */
const chaveDoRotulo = (valor: string): string => valor
  .replace(/&(?:amp|quot|apos|#39|#039|nbsp|lt|gt);/gi, " ")
  .normalize("NFD").replace(/\p{M}/gu, "")
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, " ")
  .trim();

/** O que a régua lê do modelo para recontar: as URLs que sustentam cada conceito, pergunta, lacuna e diferencial. */
export type RadarSampleBasisSourcesModel = {
  concepts?: { all?: ReadonlyArray<{ canonicalLabel: string; supportingPages?: ReadonlyArray<{ url: string }> | null }> | null } | null;
  questions?: ReadonlyArray<{ canonicalQuestion: string; sourceUrls?: ReadonlyArray<string> | null }> | null;
  gaps?: ReadonlyArray<{ subject: string; sources?: ReadonlyArray<{ url: string }> | null }> | null;
  differentiations?: ReadonlyArray<{ subject: string; sources?: ReadonlyArray<{ url: string }> | null }> | null;
};

/** As letras das evidências do artigo-modelo que trazem "(N de M páginas)": conceito, pergunta, lacuna e diferencial. */
export type RadarSampleBasisEvidenceKind = "C" | "P" | "G" | "D";

/**
 * O leitor das URLs de cada medida, pelo rótulo como o artigo-modelo o gravou.
 * Com a letra, procura primeiro no tipo dela; sem achar, em qualquer tipo.
 * `null` = o rótulo não está no modelo (a contagem não é recontável).
 */
export function radarSampleBasisSources(model: RadarSampleBasisSourcesModel | null | undefined): (rotulo: string, tipo?: RadarSampleBasisEvidenceKind | null) => string[] | null {
  const porTipo = new Map<RadarSampleBasisEvidenceKind, Map<string, string[]>>([["C", new Map()], ["P", new Map()], ["G", new Map()], ["D", new Map()]]);
  const registrar = (tipo: RadarSampleBasisEvidenceKind, rotulo: string, urls: ReadonlyArray<string | null | undefined>) => {
    const chave = chaveDoRotulo(rotulo || "");
    if (!chave) return;
    const mapa = porTipo.get(tipo)!;
    mapa.set(chave, [...new Set([...(mapa.get(chave) || []), ...urls.filter((url): url is string => Boolean(url))])]);
  };
  for (const item of model?.concepts?.all || []) registrar("C", item.canonicalLabel, (item.supportingPages || []).map(pagina => pagina.url));
  for (const item of model?.questions || []) registrar("P", item.canonicalQuestion, item.sourceUrls || []);
  for (const item of model?.gaps || []) registrar("G", item.subject, (item.sources || []).map(pagina => pagina.url));
  for (const item of model?.differentiations || []) registrar("D", item.subject, (item.sources || []).map(pagina => pagina.url));
  const ordem: RadarSampleBasisEvidenceKind[] = ["C", "P", "G", "D"];
  return (rotulo, tipo) => {
    const chave = chaveDoRotulo(rotulo || "");
    if (!chave) return null;
    for (const letra of tipo ? [tipo, ...ordem.filter(item => item !== tipo)] : ordem) {
      const achadas = porTipo.get(letra)!.get(chave);
      if (achadas) return achadas;
    }
    return null;
  };
}

/* ============================== o rótulo gravado no artigo-modelo ============================== */

/*
 * O fim do texto da evidência, como `buildRadarArticleBlueprintBrief` o grava:
 * C "(17 de 23 páginas)", P "(2 de 23 páginas)", G "(5 de 23 páginas cobrem)",
 * D "(7 páginas cobrem)" (sem o "de M"); e "(4 de 23 páginas tratam)" na coluna.
 */
const CONTAGEM_NO_FIM = /\s*\((\d+)(?:\s+de\s+(\d+))?\s+p[áa]ginas?(?:\s+(cobrem|cobre|tratam|trata))?\)\s*$/i;

const tipoDaEvidencia = (id: string | null | undefined): RadarSampleBasisEvidenceKind | null => {
  const letra = (id || "").trim().charAt(0).toUpperCase();
  return letra === "C" || letra === "P" || letra === "G" || letra === "D" ? letra : null;
};

/**
 * O "(N de M páginas)" de um texto gravado (evidência do artigo-modelo, linha
 * de coluna), reescrito pela base, SEM chamar IA e sem mudar o que foi gravado:
 *
 *   - sem contagem no fim, ou sem base: o texto como veio;
 *   - o "de M" é o tamanho da base: como veio;
 *   - o "(N páginas cobrem)" sem "de M" (diferencial D), com a base alinhada ao
 *     modelo: ganha o "de M" da base, para o arquivo dizer um número só;
 *   - outro "de M" (ou D sem base alinhada): recontado pelas URLs da medida
 *     (`fontes`, pelo rótulo); sem elas, a contagem sai e fica o rótulo.
 */
export function radarSampleBasisRewriteCount(
  texto: string,
  basis: RadarSampleBasis | null,
  fontes: ((rotulo: string, tipo?: RadarSampleBasisEvidenceKind | null) => string[] | null) | null = null,
  id: string | null = null,
): string {
  const achado = texto.match(CONTAGEM_NO_FIM);
  if (!achado || !basis) return texto;
  const rotulo = texto.slice(0, achado.index).trimEnd();
  const verbo = achado[3] ? ` ${achado[3].toLowerCase()}` : "";
  const numero = Number(achado[1]);
  const deM = achado[2] ? Number(achado[2]) : null;
  if (deM === basis.size) return texto;
  const escrito = (n: number) => `${rotulo} (${n} de ${basis.size} ${basis.size === 1 ? "página" : "páginas"}${verbo})`;
  if (deM === null && basis.aligned) return escrito(Math.min(numero, basis.size));
  const urls = fontes ? fontes(rotulo, tipoDaEvidencia(id)) : null;
  const fracao = urls ? radarSampleBasisFraction(basis, { pages: numero, sampleSize: deM ?? Number.NaN, urls }) : null;
  return fracao ? escrito(fracao.pages) : rotulo;
}

/** A mesma régua para a evidência inteira do artigo-modelo (`{ id, text }`), pelo id dela. */
export function radarSampleBasisRewriteEvidence<T extends { id: string; text: string }>(
  evidencia: T,
  basis: RadarSampleBasis | null,
  fontes: ((rotulo: string, tipo?: RadarSampleBasisEvidenceKind | null) => string[] | null) | null = null,
): T {
  const text = radarSampleBasisRewriteCount(evidencia.text, basis, fontes, evidencia.id);
  return text === evidencia.text ? evidencia : { ...evidencia, text };
}

/* ============================== a conferência de um arquivo ============================== */

/*
 * OS DENOMINADORES QUE UM TEXTO IMPRIME — para o teste (e quem mais quiser)
 * provar que a linha inteira fala de UMA base. Páginas: "N de M páginas",
 * "N de M página(s)", "N de M concorrentes", "das M páginas comparáveis",
 * "nenhuma das M páginas", "Concorrentes comparáveis (M)" e o "deste arquivo; M)"
 * da lista antiga. Sites: "N de S sites" e "de S site(s)". Lentes, vídeos e o
 * "e mais N página(s)" do fim da lista não são base e não entram.
 */
/* `(?!\w)` e não `\b` no fim: "página(s)" termina em parêntese. Cada denominador é lido uma vez só (os lookbehind). */
const DENOMINADORES_DE_PAGINAS: readonly RegExp[] = [
  /\b\d+\s+de\s+(\d+)\s+(?:p[áa]gina(?:s|\(s\))?|concorrentes)(?!\w)/gi,
  /(?<!(?:mais|de)\s)\b(\d+)\s+p[áa]ginas\s+comparáveis(?!\w)/gi,
  /\bnenhuma\s+das\s+(\d+)\s+p[áa]gina(?:s|\(s\))(?!\w)/gi,
  /\bConcorrentes comparáveis\s+\((\d+)(?!\d)/g,
  /\bdeste arquivo;\s*(\d+)\)/g,
];
const DENOMINADORES_DE_SITES: readonly RegExp[] = [
  /\b\d+\s+de\s+(\d+)\s+(?:site\(s\)|sites?)(?!\w)/gi,
  /(?<!\d\s)\bde\s+(\d+)\s+(?:site\(s\)|sites?)(?!\w)/gi,
];

export function radarSampleBasisDenominators(texto: string): { pages: number[]; sites: number[] } {
  const ler = (regras: readonly RegExp[]) => regras.flatMap(regra => [...texto.matchAll(regra)].map(item => Number(item[1])));
  return { pages: ler(DENOMINADORES_DE_PAGINAS), sites: ler(DENOMINADORES_DE_SITES) };
}
