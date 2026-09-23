/**
 * ===== LEITOR DE EVIDÊNCIAS DO REDATOR · O CATÁLOGO (puro) =====
 *
 * SDD: docs/07-redator/propostas/sdd-leitor-evidencias-redator-2026-09-23.md
 * (seções 3, 4.1, 4.2 e 9) e o adendo de decisões da mesma data. Regras da
 * SDD de egress: R1–R16.
 *
 * O que mora aqui, e só aqui:
 *
 *   - as CHAVES de fonte (`sourceKey`) e a gramática delas;
 *   - os LIMITES de cada camada: manifesto ≤ 8 kB, fundamentos ≤ 24 kB,
 *     fatia ≤ 32 kB (padrão 16 kB);
 *   - o ENVELOPE de toda resposta, com origem, frescor, uso e hierarquia;
 *   - a PAGINAÇÃO em memória, com a MESMA semântica da função SQL
 *     `writer_evidence_slice` — é ela que atende o caminho sem migration e as
 *     fontes pequenas lidas inteiras pela regra de parse do dono;
 *   - o ajuste de tamanho do manifesto e dos fundamentos.
 *
 * Nada aqui lê banco, rede ou storage. O servidor
 * (`lib/server/writer-evidence-reader.ts`) resolve cada chave a partir da
 * linha do documento e usa estas funções para cortar, rotular e medir.
 *
 * TRÊS REGRAS QUE ATRAVESSAM O MÓDULO:
 *
 *   1. Disponível não é baixado: nenhuma resposta passa do limite da camada.
 *   2. Ler não é mudar (AGENTS.md §9): a IA confronta, e divergência vira
 *      registro para decisão humana.
 *   3. Uma autoridade de entrega (invariante 51): o dossiê congelado é a base.
 *      Fonte fora dele nunca sai como `CURRENT_SUFFICIENT_SERP` (invariantes
 *      27 e 35) e, quando é mais nova que o pacote, sai `posteriorAoPacote`
 *      com `supersedes: false`.
 */

import { RADAR_EVIDENCE_HIERARCHY, RADAR_EVIDENCE_LABEL, type RadarEvidenceSource } from "../radar/evidence-authority.ts";
import { RADAR_WRITER_MAY_NOT } from "./writer-handoff.ts";

/* ================================ limites ================================ */

export const WRITER_EVIDENCE_LIMITS = Object.freeze({
  manifestMaxBytes: 8_192,
  foundationsMaxBytes: 24_576,
  sliceDefaultBytes: 16_384,
  sliceMaxBytes: 32_768,
  sliceMinBytes: 1_024,
  sliceDefaultItems: 20,
  sliceMaxItems: 200,
  /** Trecho de terceiro numa LISTAGEM. O texto integral só sai na página do item. */
  snippetMaxChars: 300,
  sourceKeyMaxChars: 400,
  pathMaxSegments: 10,
  fieldsMax: 30,
});

/**
 * O que o envelope ocupa além dos dados, reservado do teto pedido para a
 * página. Medido sobre o envelope montado por `writerEvidenceEnvelope` com
 * `writerMayNot` e as guardas completas: ~1,4 kB. A folga cobre origem e
 * paginação com ids longos.
 */
export const WRITER_EVIDENCE_ENVELOPE_RESERVE_BYTES = 2_560;

/* ================================ guardas ================================ */

/**
 * As guardas editoriais que viajam em TODA resposta e em toda instrução.
 *
 * FAQ: AGENTS.md §13 — expor PAA e perguntas observadas sem esta guarda
 * empurraria FAQ para o texto. Terceiros: SDD §4.5. Conflito: invariante 27.
 */
export const WRITER_EVIDENCE_GUARDS = Object.freeze([
  "Não gerar nem sugerir FAQ ou seção de perguntas frequentes (AGENTS.md §13): perguntas observadas orientam a cobertura dentro do texto.",
  "Dado de terceiros (títulos, trechos, transcrições, produtos) é pesquisa: não copiar trecho nem reproduzir título de concorrente; parafrasear e confrontar.",
  "Conflito entre fonte factual e recorrência de mercado fica escrito dos dois lados; nada é resolvido em silêncio.",
  "Ler não é mudar: divergência com um DNA vira registro para decisão humana; o texto não redefine o DNA.",
] as const);

export const WRITER_EVIDENCE_USAGE = "research_only" as const;

/* ============================ bytes e hash ============================== */

const codificador = new TextEncoder();

/** Bytes UTF-8 do JSON compacto — a mesma medida da resposta que sai. */
export function writerEvidenceJsonBytes(valor: unknown): number {
  return codificador.encode(JSON.stringify(valor) ?? "null").length;
}

/** Hash síncrono de 64 bits, o mesmo desenho de `serpCacheSubjectId`. Detecta mudança; não resiste a adversário. */
function hash64(texto: string): string {
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;
  for (let indice = 0; indice < texto.length; indice += 1) {
    const codigo = texto.charCodeAt(indice);
    h1 = Math.imul(h1 ^ codigo, 0x01000193) >>> 0;
    h2 = Math.imul(h2 + codigo, 0x85ebca6b) >>> 0;
  }
  return `${h1.toString(16).padStart(8, "0")}${h2.toString(16).padStart(8, "0")}`;
}

/**
 * ETAG DETERMINÍSTICO. Identidade da fonte (hash do pacote, versão e hash do
 * DNA, id e hash do snapshot, coleta do cache) mais a página pedida. Mesma
 * identidade, mesmo etag, em qualquer processo.
 */
export function writerEvidenceEtag(partes: ReadonlyArray<string | number | boolean | null | undefined>): string {
  return `we:${hash64(JSON.stringify(partes.map(parte => parte ?? null)))}`;
}

/* ============================= hierarquia =============================== */

export type WriterEvidenceHierarchy = { level: RadarEvidenceSource; note: string | null };

/** A hierarquia canônica (invariante 35), para os fundamentos e o manifesto. */
export const WRITER_EVIDENCE_HIERARCHY = Object.freeze(
  RADAR_EVIDENCE_HIERARCHY.map(level => ({ level, label: RADAR_EVIDENCE_LABEL[level] })),
);

const NAO_REVISADA = "observação não revisada pelo Radar; quem decide suficiência é o Radar (invariante 27)";
const AFIRMACAO_DE_DNA = "afirmação do DNA, a confrontar com a evidência; quem muda o DNA é o dono, por decisão humana";

/* ============================= famílias ================================= */

export type WriterEvidenceOwner = "radar" | "arquiteto" | "minerador" | "marca" | "publicacoes";

export type WriterEvidenceFamily =
  | "radar.bundle"
  | "video.transcript"
  | "serp.radar.snapshot"
  | "serp.radar.snapshot.latest"
  | "run"
  | "dna.article"
  | "dna.silo"
  | "dna.siloPage"
  | "dna.keyword"
  | "dna.keyword.presentation"
  | "dna.keyword.metrics"
  | "dna.brand"
  | "brand.skill"
  | "serp.architect.formation"
  | "serp.architect.territorial"
  | "graph.article"
  | "serp.cache"
  | "brand.site.catalog"
  | "publication.self"
  | "publication.brand"
  | "specialist.posterior"
  | "run.amazon.shortlist";

type Familia = {
  owner: WriterEvidenceOwner;
  /** A família exige um id depois de `/`. */
  ref: "required" | "none";
  /** Só o dossiê congelado é congelado. */
  frozen: boolean;
  dna: boolean;
  /** Dado de terceiros: listagem trunca trechos longos. */
  thirdParty: boolean;
};

const FAMILIAS: Readonly<Record<WriterEvidenceFamily, Familia>> = Object.freeze({
  "radar.bundle": { owner: "radar", ref: "none", frozen: true, dna: false, thirdParty: true },
  "video.transcript": { owner: "radar", ref: "required", frozen: false, dna: false, thirdParty: true },
  "serp.radar.snapshot": { owner: "radar", ref: "none", frozen: false, dna: false, thirdParty: true },
  "serp.radar.snapshot.latest": { owner: "radar", ref: "none", frozen: false, dna: false, thirdParty: true },
  run: { owner: "radar", ref: "none", frozen: false, dna: false, thirdParty: true },
  "dna.article": { owner: "arquiteto", ref: "required", frozen: false, dna: true, thirdParty: false },
  "dna.silo": { owner: "arquiteto", ref: "required", frozen: false, dna: true, thirdParty: false },
  "dna.siloPage": { owner: "arquiteto", ref: "none", frozen: false, dna: true, thirdParty: false },
  "dna.keyword": { owner: "minerador", ref: "required", frozen: false, dna: true, thirdParty: false },
  "dna.keyword.presentation": { owner: "minerador", ref: "required", frozen: false, dna: true, thirdParty: false },
  "dna.keyword.metrics": { owner: "minerador", ref: "none", frozen: false, dna: false, thirdParty: false },
  "dna.brand": { owner: "marca", ref: "required", frozen: false, dna: true, thirdParty: false },
  "brand.skill": { owner: "marca", ref: "required", frozen: false, dna: true, thirdParty: false },
  "serp.architect.formation": { owner: "arquiteto", ref: "none", frozen: false, dna: false, thirdParty: true },
  "serp.architect.territorial": { owner: "arquiteto", ref: "none", frozen: false, dna: false, thirdParty: true },
  "graph.article": { owner: "arquiteto", ref: "required", frozen: false, dna: false, thirdParty: false },
  "serp.cache": { owner: "minerador", ref: "required", frozen: false, dna: false, thirdParty: true },
  "brand.site.catalog": { owner: "marca", ref: "none", frozen: false, dna: false, thirdParty: false },
  "publication.self": { owner: "publicacoes", ref: "none", frozen: false, dna: false, thirdParty: false },
  "publication.brand": { owner: "publicacoes", ref: "none", frozen: false, dna: false, thirdParty: false },
  "specialist.posterior": { owner: "radar", ref: "none", frozen: false, dna: false, thirdParty: false },
  "run.amazon.shortlist": { owner: "radar", ref: "none", frozen: false, dna: false, thirdParty: true },
});

export const writerEvidenceOwnerOf = (family: WriterEvidenceFamily): WriterEvidenceOwner => FAMILIAS[family].owner;
export const writerEvidenceFamilyIsFrozen = (family: WriterEvidenceFamily): boolean => FAMILIAS[family].frozen;
export const writerEvidenceFamilyIsThirdParty = (family: WriterEvidenceFamily): boolean => FAMILIAS[family].thirdParty;

/**
 * O NÍVEL DE HIERARQUIA DE UMA FONTE.
 *
 * - Dossiê congelado: o especialista aceito é `QUALIFIED_SPECIALIST`; a
 *   fotografia competitiva é `CURRENT_SUFFICIENT_SERP` SÓ quando o próprio
 *   Radar a declarou autoritativa no congelamento (`serpStanding`); o resto
 *   do dossiê é `OTHER_RADAR_EVIDENCE`.
 * - DNA (Arquiteto, Minerador, Marca): `ARTICLE_DNA_HYPOTHESIS` — é a
 *   afirmação a confrontar, não a evidência que a confirma.
 * - Qualquer outra fonte (cache de SERP, snapshot, corridas, SERP do
 *   Minerador e do Arquiteto, transcrições, publicações, catálogo, grafo):
 *   `OTHER_RADAR_EVIDENCE`, com a nota de "não revisada pelo Radar". Nunca
 *   `CURRENT_SUFFICIENT_SERP`.
 */
export function writerEvidenceHierarchyOf(input: {
  family: WriterEvidenceFamily;
  bundlePath?: readonly string[];
  serpAuthoritative?: boolean;
}): WriterEvidenceHierarchy {
  const familia = FAMILIAS[input.family];
  if (familia.frozen) {
    const topo = input.bundlePath?.[0] ?? null;
    if (topo === "specialist") return { level: "QUALIFIED_SPECIALIST", note: "contribuição de especialista aceita pelo Radar e congelada" };
    const fotografia = topo === "observed" || topo === "competitiveBlueprint" || topo === "crossSerp";
    if (fotografia && input.serpAuthoritative === true) return { level: "CURRENT_SUFFICIENT_SERP", note: "declarada vigente e suficiente pelo Radar no congelamento" };
    return { level: "OTHER_RADAR_EVIDENCE", note: fotografia ? "o Radar não declarou esta SERP vigente e suficiente" : null };
  }
  if (familia.dna) return { level: "ARTICLE_DNA_HYPOTHESIS", note: AFIRMACAO_DE_DNA };
  return { level: "OTHER_RADAR_EVIDENCE", note: NAO_REVISADA };
}

/* ============================ chave de fonte ============================ */

/**
 * AS CORRIDAS, POR APELIDO. O apelido é o que a IA vê; o caminho é o campo da
 * corrida em `radar_analysis_runs.payload` (`ANALYSIS_RUN_FIELDS` do Radar).
 */
export const WRITER_RUN_ALIASES: Readonly<Record<string, readonly string[]>> = Object.freeze({
  competitiveReport: ["competitiveReport"],
  extractions: ["extractions"],
  "youtube.universe": ["youtubeSearch", "universe"],
  "youtube.results": ["youtubeSearch", "results"],
  "youtube.queries": ["youtubeSearch", "queries"],
  "amazon.products": ["amazonSearch", "universe"],
  "amazon.results": ["amazonSearch", "results"],
  "amazon.queries": ["amazonSearch", "queries"],
});

/**
 * PROJEÇÃO PADRÃO POR CORRIDA. Na listagem, só os campos editoriais; o item
 * inteiro sai na página dele (`run.extractions#3`).
 */
export const WRITER_RUN_DEFAULT_FIELDS: Readonly<Record<string, readonly string[]>> = Object.freeze({
  extractions: ["id", "url", "status", "title", "metaDescription", "canonical", "wordCount", "internalLinkCount", "externalLinkCount",
    "listCount", "tableCount", "imageCount", "hasDates", "author", "structuredDataTypes"],
  "youtube.universe": ["videoId", "url", "title", "channelName", "publishedAt", "durationSeconds", "views", "isShorts", "bestRank",
    "queriesFoundIn", "occurrenceCount", "universeClass", "description"],
  "youtube.results": ["videoId", "url", "title", "channelName", "publishedAt", "durationSeconds", "views", "isShorts", "queryId"],
  "amazon.products": ["asin", "title", "url", "priceFrom", "currency", "ratingValue", "ratingVotes", "isAmazonChoice", "isBestSeller",
    "boughtPastMonth", "bestOrganicRank", "bestSponsoredRank", "queriesFoundIn", "occurrenceCount"],
  "amazon.results": ["asin", "title", "url", "priceFrom", "currency", "ratingValue", "ratingVotes", "rankAbsolute", "queryId"],
});

/**
 * CHAVES QUE NUNCA SAEM POR PADRÃO. Os links observados de cada extração
 * (~67 kB por página) e o modelo observado do relatório, que já está no
 * dossiê congelado e sairia em dobro.
 */
export const WRITER_RUN_DEFAULT_EXCLUDED_KEYS: Readonly<Record<string, readonly string[]>> = Object.freeze({
  extractions: ["observedLinks"],
  competitiveReport: ["observedCompetitiveModel"],
});

/** A cópia idêntica de `evidence.semantic` dentro de `evidence.structural` (525 kB medidos). */
export const WRITER_BUNDLE_STRUCTURAL_ALIAS = Object.freeze({
  path: ["observed", "evidence", "structural", "semantic"] as readonly string[],
  aliasOf: ["observed", "evidence", "semantic"] as readonly string[],
});

export type WriterEvidenceSourceKey = {
  /** A chave como veio, normalizada (sem espaços). */
  raw: string;
  family: WriterEvidenceFamily;
  /** O id depois de `/`, quando a família exige. */
  ref: string | null;
  /** Caminho base da família (bundle, corrida, lente do cache). */
  basePath: readonly string[];
  /** Descida pedida depois de `#`. */
  path: readonly string[];
  /** Apelido de corrida (`extractions`, `youtube.universe`…). */
  runAlias: string | null;
};

const SEGMENTO = /^[A-Za-z0-9_-]{1,120}$/;
const REFERENCIA = /^[A-Za-z0-9_:.@-]{1,300}$/;
const CARACTERES = /^[A-Za-z0-9._:/#@-]+$/;

const segmentos = (texto: string): string[] | null => {
  if (!texto) return [];
  const partes = texto.split(".");
  return partes.every(parte => SEGMENTO.test(parte)) ? partes : null;
};

/** Famílias de nome fixo, da mais longa para a mais curta: o prefixo mais específico vence. */
const FAMILIAS_POR_PREFIXO = (Object.keys(FAMILIAS) as WriterEvidenceFamily[])
  .filter(familia => familia !== "radar.bundle" && familia !== "run")
  .sort((a, b) => b.length - a.length);

/**
 * LÊ UMA CHAVE DE FONTE. `null` = fora da gramática — chave inventada.
 *
 * Gramática: `<família>[/<ref>][#<caminho.pontuado>]`, e duas famílias com o
 * caminho no próprio nome, como a SDD escreve: `radar.bundle.<caminho>` e
 * `run.<apelido>`. O cache de SERP aceita as duas formas da SDD:
 * `serp.cache/<lente>/<keywordId>` e `serp.cache/<keywordId>#<lente>`.
 *
 * Estar na gramática NÃO basta: o servidor ainda confere que a chave é
 * alcançável a partir das referências do documento (a regra "consta do
 * manifesto" da SDD §4.1).
 */
export function parseWriterEvidenceSourceKey(entrada: unknown): WriterEvidenceSourceKey | null {
  if (typeof entrada !== "string") return null;
  const raw = entrada.trim();
  if (!raw || raw.length > WRITER_EVIDENCE_LIMITS.sourceKeyMaxChars || !CARACTERES.test(raw)) return null;
  const [cabeca, descida = "", ...sobra] = raw.split("#");
  if (sobra.length) return null;
  const path = segmentos(descida);
  if (path === null) return null;

  if (cabeca === "radar.bundle" || cabeca.startsWith("radar.bundle.")) {
    const basePath = segmentos(cabeca.slice("radar.bundle.".length));
    if (!basePath || !basePath.length) return null;
    if (basePath.length + path.length > WRITER_EVIDENCE_LIMITS.pathMaxSegments) return null;
    return { raw, family: "radar.bundle", ref: null, basePath, path, runAlias: null };
  }

  if (cabeca.startsWith("run.") && cabeca !== "run.amazon.shortlist") {
    const alias = cabeca.slice("run.".length);
    const basePath = WRITER_RUN_ALIASES[alias];
    if (!basePath || basePath.length + path.length > WRITER_EVIDENCE_LIMITS.pathMaxSegments) return null;
    return { raw, family: "run", ref: null, basePath, path, runAlias: alias };
  }

  if (path.length > WRITER_EVIDENCE_LIMITS.pathMaxSegments) return null;
  for (const family of FAMILIAS_POR_PREFIXO) {
    if (cabeca === family) {
      if (FAMILIAS[family].ref === "required") return null;
      return { raw, family, ref: null, basePath: [], path, runAlias: null };
    }
    if (!cabeca.startsWith(`${family}/`)) continue;
    if (FAMILIAS[family].ref !== "required") return null;
    const resto = cabeca.slice(family.length + 1).split("/");
    if (family === "serp.cache" && resto.length === 2) {
      const [lente, keywordId] = resto;
      if (!SEGMENTO.test(lente) || !REFERENCIA.test(keywordId) || path.length) return null;
      return { raw, family, ref: keywordId, basePath: [lente], path: [], runAlias: null };
    }
    if (resto.length !== 1 || !REFERENCIA.test(resto[0])) return null;
    if (family === "serp.cache") {
      if (path.length > 1) return null;
      return { raw, family, ref: resto[0], basePath: path, path: [], runAlias: null };
    }
    return { raw, family, ref: resto[0], basePath: [], path, runAlias: null };
  }
  return null;
}

/** A chave base (sem descida) no formato do manifesto. */
export function writerEvidenceBaseKey(chave: WriterEvidenceSourceKey): string {
  if (chave.family === "radar.bundle") return `radar.bundle.${chave.basePath.join(".")}`;
  if (chave.family === "run") return `run.${chave.runAlias}`;
  if (chave.family === "serp.cache") return `serp.cache/${chave.ref}`;
  return chave.ref ? `${chave.family}/${chave.ref}` : chave.family;
}

/** A chave de uma descida: `base#a.b`. */
export function writerEvidenceDescendKey(base: string, caminho: readonly (string | number)[]): string {
  if (!caminho.length) return base;
  const [raiz, descidaAtual = ""] = base.split("#");
  const junto = [descidaAtual, ...caminho.map(String)].filter(Boolean).join(".");
  return `${raiz}#${junto}`;
}

/* ============================ cursor e campos =========================== */

export function parseWriterEvidenceCursor(cursor: unknown): number | null {
  if (cursor === undefined || cursor === null || cursor === "") return 0;
  if (typeof cursor !== "string" || !/^\d{1,9}$/.test(cursor)) return null;
  return Number(cursor);
}

const CAMPO = /^[A-Za-z0-9_]{1,64}$/;

/** Campos de projeção: só chaves de primeiro nível do item. `null` = pedido inválido. */
export function parseWriterEvidenceFields(fields: unknown): string[] | null | undefined {
  if (fields === undefined || fields === null) return undefined;
  if (!Array.isArray(fields) || fields.length > WRITER_EVIDENCE_LIMITS.fieldsMax) return null;
  if (!fields.every(campo => typeof campo === "string" && CAMPO.test(campo))) return null;
  return [...new Set(fields as string[])];
}

export function clampWriterSliceBytes(pedido: unknown): number {
  const valor = typeof pedido === "number" && Number.isFinite(pedido) ? Math.floor(pedido) : WRITER_EVIDENCE_LIMITS.sliceDefaultBytes;
  return Math.min(Math.max(valor, WRITER_EVIDENCE_LIMITS.sliceMinBytes), WRITER_EVIDENCE_LIMITS.sliceMaxBytes);
}

export function clampWriterSliceItems(pedido: unknown): number {
  const valor = typeof pedido === "number" && Number.isFinite(pedido) ? Math.floor(pedido) : WRITER_EVIDENCE_LIMITS.sliceDefaultItems;
  return Math.min(Math.max(valor, 1), WRITER_EVIDENCE_LIMITS.sliceMaxItems);
}

/* ============================== paginação =============================== */

/**
 * Uma linha de página, na forma EXATA das colunas de `writer_evidence_slice`
 * (migration 20260923150000): o servidor trata igual a linha que veio do
 * banco e a que foi cortada em memória.
 */
export type WriterSliceRow = {
  containerType: "array" | "object" | "string" | "number" | "boolean" | "null" | "absent";
  total: number;
  ordinal: number;
  span: number;
  itemKey: string | null;
  valueType: string | null;
  bytes: number;
  omitted: boolean;
  value: unknown;
};

const tipoJson = (valor: unknown): WriterSliceRow["containerType"] => {
  if (valor === undefined) return "absent";
  if (valor === null) return "null";
  if (Array.isArray(valor)) return "array";
  if (typeof valor === "object") return "object";
  if (typeof valor === "string") return "string";
  if (typeof valor === "number") return "number";
  return "boolean";
};

const registro = (valor: unknown): Record<string, unknown> | null =>
  valor && typeof valor === "object" && !Array.isArray(valor) ? valor as Record<string, unknown> : null;

/** Ordem "C" do Postgres: por ponto de código, não pela localidade. */
const ordemC = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

function projetarItem(valor: unknown, fields: readonly string[] | undefined, exclude: readonly string[] | undefined): unknown {
  const objeto = registro(valor);
  if (!objeto) return valor;
  const saida: Record<string, unknown> = {};
  for (const [chave, item] of Object.entries(objeto)) {
    if (fields && !fields.includes(chave)) continue;
    if (exclude?.includes(chave)) continue;
    saida[chave] = item;
  }
  return saida;
}

/**
 * CORTA UM VALOR EM PÁGINA — a mesma regra da função SQL:
 *
 * - array: itens de `offset` a `offset + limit`, com teto ACUMULADO de bytes;
 *   o item que estouraria o teto sai com `omitted` e valor `null`;
 * - objeto: chaves em ordem "C", mesma regra;
 * - texto: faixa de caracteres que cabe no teto;
 * - escalar: uma linha;
 * - ausente: uma linha `absent`.
 *
 * `fields` e `excludeKeys` projetam os itens-objeto de um array, e filtram as
 * chaves de um objeto.
 */
export function writerSliceRowsOf(valor: unknown, opcoes: {
  offset: number;
  limit: number;
  maxBytes: number;
  fields?: readonly string[];
  excludeKeys?: readonly string[];
}): WriterSliceRow[] {
  const offset = Math.max(0, Math.floor(opcoes.offset));
  const limit = clampWriterSliceItems(opcoes.limit);
  const teto = clampWriterSliceBytes(opcoes.maxBytes);
  const tipo = tipoJson(valor);

  if (tipo === "absent") return [{ containerType: "absent", total: 0, ordinal: offset, span: 0, itemKey: null, valueType: null, bytes: 0, omitted: false, value: null }];

  if (tipo === "array") {
    const itens = valor as unknown[];
    let acumulado = 0;
    return itens.slice(offset, offset + limit).map((item, indice) => {
      const projetado = projetarItem(item, opcoes.fields, opcoes.excludeKeys);
      const bytes = writerEvidenceJsonBytes(projetado);
      acumulado += bytes;
      const omitido = acumulado > teto;
      return { containerType: "array", total: itens.length, ordinal: offset + indice, span: 1, itemKey: null, valueType: tipoJson(projetado), bytes, omitted: omitido, value: omitido ? null : projetado };
    });
  }

  if (tipo === "object") {
    const chaves = Object.keys(valor as Record<string, unknown>)
      .filter(chave => (!opcoes.fields || opcoes.fields.includes(chave)) && !(opcoes.excludeKeys?.includes(chave)))
      .sort(ordemC);
    let acumulado = 0;
    return chaves.slice(offset, offset + limit).map((chave, indice) => {
      const item = (valor as Record<string, unknown>)[chave];
      const bytes = writerEvidenceJsonBytes(item);
      acumulado += bytes;
      const omitido = acumulado > teto;
      return { containerType: "object", total: chaves.length, ordinal: offset + indice, span: 1, itemKey: chave, valueType: tipoJson(item), bytes, omitted: omitido, value: omitido ? null : item };
    });
  }

  if (tipo === "string") {
    const texto = valor as string;
    const caracteres = [...texto];
    let tamanho = Math.min(teto, Math.max(caracteres.length - offset, 0));
    let peca = caracteres.slice(offset, offset + tamanho).join("");
    while (tamanho > 1 && writerEvidenceJsonBytes(peca) > teto) {
      tamanho = Math.max(1, Math.floor(tamanho * teto / writerEvidenceJsonBytes(peca)) - 1);
      peca = caracteres.slice(offset, offset + tamanho).join("");
    }
    return [{ containerType: "string", total: caracteres.length, ordinal: offset, span: tamanho, itemKey: null, valueType: "string", bytes: writerEvidenceJsonBytes(peca), omitted: false, value: peca }];
  }

  const bytes = writerEvidenceJsonBytes(valor);
  return [{ containerType: tipo, total: 1, ordinal: 0, span: 1, itemKey: null, valueType: tipo, bytes, omitted: bytes > teto, value: bytes > teto ? null : valor }];
}

export type WriterEvidencePage = {
  container: WriterSliceRow["containerType"];
  cursor: string;
  next: string | null;
  total: number | null;
  /** Array: `[{ at, value }]`; objeto: `{ chave: valor }`; texto: o pedaço. */
  data: unknown;
  /** Itens maiores que a página: desça por `descend`. */
  omitted: Array<{ at: number | string; bytes: number; descend: string }>;
  truncatedStrings: number;
};

/**
 * Trunca TEXTO DE TERCEIROS numa listagem: cada string com mais de 300
 * caracteres vira os 300 primeiros e `…`. A página do item traz o integral.
 */
export function truncateWriterThirdPartyText(valor: unknown, limite: number = WRITER_EVIDENCE_LIMITS.snippetMaxChars): { value: unknown; truncated: number } {
  let truncated = 0;
  const visitar = (item: unknown): unknown => {
    if (typeof item === "string") {
      const caracteres = [...item];
      if (caracteres.length <= limite) return item;
      truncated += 1;
      return `${caracteres.slice(0, limite).join("")}…`;
    }
    if (Array.isArray(item)) return item.map(visitar);
    const objeto = registro(item);
    if (!objeto) return item;
    return Object.fromEntries(Object.entries(objeto).map(([chave, filho]) => [chave, visitar(filho)]));
  };
  return { value: visitar(valor), truncated };
}

/**
 * MONTA A PÁGINA A PARTIR DAS LINHAS — venham do banco ou da memória.
 *
 * Cursor: o `ordinal` da primeira linha omitida, quando não é a primeira; se
 * a PRIMEIRA já veio omitida, o item é maior que a página: ele entra em
 * `omitted` com o caminho para descer, e o cursor pula para o seguinte.
 */
export function writerEvidencePageOf(linhas: readonly WriterSliceRow[], opcoes: {
  offset: number;
  baseKey: string;
  truncate: boolean;
}): WriterEvidencePage {
  const cursor = String(Math.max(0, opcoes.offset));
  if (!linhas.length) return { container: "absent", cursor, next: null, total: null, data: null, omitted: [], truncatedStrings: 0 };
  const primeira = linhas[0];
  const container = primeira.containerType;
  if (container === "absent") return { container, cursor, next: null, total: 0, data: null, omitted: [], truncatedStrings: 0 };

  if (container === "string") {
    const fim = primeira.ordinal + primeira.span;
    return { container, cursor, next: fim < primeira.total ? String(fim) : null, total: primeira.total, data: primeira.value, omitted: [], truncatedStrings: 0 };
  }

  if (container !== "array" && container !== "object") {
    return {
      container, cursor, next: null, total: 1, data: primeira.omitted ? null : primeira.value,
      omitted: primeira.omitted ? [{ at: 0, bytes: primeira.bytes, descend: opcoes.baseKey }] : [], truncatedStrings: 0,
    };
  }

  const cabem: WriterSliceRow[] = [];
  const omitted: WriterEvidencePage["omitted"] = [];
  let next: string | null = null;
  for (const linha of linhas) {
    if (!linha.omitted) { cabem.push(linha); continue; }
    if (!cabem.length && !omitted.length) {
      /* O primeiro item sozinho não cabe: aponta a descida e segue. */
      omitted.push({ at: linha.itemKey ?? linha.ordinal, bytes: linha.bytes, descend: writerEvidenceDescendKey(opcoes.baseKey, [linha.itemKey ?? linha.ordinal]) });
      next = linha.ordinal + 1 < linha.total ? String(linha.ordinal + 1) : null;
      break;
    }
    next = String(linha.ordinal);
    break;
  }
  if (next === null && (cabem.length || omitted.length)) {
    const ultima = linhas[linhas.length - 1];
    if (!ultima.omitted && ultima.ordinal + 1 < ultima.total) next = String(ultima.ordinal + 1);
  }

  let truncatedStrings = 0;
  /* Só a LISTAGEM corta: a página de um item (objeto por chave) traz o texto integral. */
  const valorDe = (linha: WriterSliceRow) => {
    if (!opcoes.truncate || container !== "array") return linha.value;
    const cortado = truncateWriterThirdPartyText(linha.value);
    truncatedStrings += cortado.truncated;
    return cortado.value;
  };
  const data = container === "array"
    ? cabem.map(linha => ({ at: linha.ordinal, value: valorDe(linha) }))
    : Object.fromEntries(cabem.map(linha => [linha.itemKey as string, valorDe(linha)]));
  return { container, cursor, next, total: primeira.total, data, omitted, truncatedStrings };
}

/* =============================== envelope =============================== */

export type WriterEvidenceOrigin = {
  module: WriterEvidenceOwner;
  entityId: string | null;
  versionId: string | null;
  contentHash: string | null;
  collectedAt: string | null;
  status: string | null;
};

export type WriterEvidenceEnvelope = {
  sourceKey: string;
  origin: WriterEvidenceOrigin;
  frozen: boolean;
  posteriorAoPacote: boolean;
  supersedes: false;
  usage: typeof WRITER_EVIDENCE_USAGE;
  writerMayNot: readonly string[];
  hierarchyLevel: RadarEvidenceSource;
  hierarchyNote: string | null;
  guards: readonly string[];
  etag: string;
  page: Omit<WriterEvidencePage, "data"> | null;
  notice: string | null;
  data: unknown;
};

export type WriterEvidenceNotModified = {
  sourceKey: string;
  notModified: true;
  etag: string;
};

export function writerEvidenceEnvelope(input: {
  sourceKey: string;
  family: WriterEvidenceFamily;
  origin: Omit<WriterEvidenceOrigin, "module">;
  posteriorAoPacote: boolean;
  hierarchy: WriterEvidenceHierarchy;
  etag: string;
  writerMayNot?: readonly string[] | null;
  page: WriterEvidencePage | null;
  data?: unknown;
  notice?: string | null;
}): WriterEvidenceEnvelope {
  const familia = FAMILIAS[input.family];
  const pagina = input.page;
  const page = pagina
    ? { container: pagina.container, cursor: pagina.cursor, next: pagina.next, total: pagina.total, omitted: pagina.omitted, truncatedStrings: pagina.truncatedStrings }
    : null;
  /*
   * Invariantes 27 e 35, na borda: o que não é o dossiê congelado não sai
   * como SERP vigente e suficiente, mesmo que alguém peça.
   */
  const level = !familia.frozen && input.hierarchy.level === "CURRENT_SUFFICIENT_SERP" ? "OTHER_RADAR_EVIDENCE" : input.hierarchy.level;
  return {
    sourceKey: input.sourceKey,
    origin: { module: familia.owner, ...input.origin },
    frozen: familia.frozen,
    posteriorAoPacote: familia.frozen ? false : input.posteriorAoPacote,
    supersedes: false,
    usage: WRITER_EVIDENCE_USAGE,
    writerMayNot: input.writerMayNot?.length ? input.writerMayNot : RADAR_WRITER_MAY_NOT,
    hierarchyLevel: level,
    hierarchyNote: level === input.hierarchy.level ? input.hierarchy.note : NAO_REVISADA,
    guards: WRITER_EVIDENCE_GUARDS,
    etag: input.etag,
    page,
    notice: input.notice ?? null,
    data: pagina ? pagina.data : input.data ?? null,
  };
}

/**
 * O ENVELOPE CABE NO TETO? Se não, tira itens do fim da página e recua o
 * cursor — nunca responde acima de `sliceMaxBytes`. Texto é recortado ao
 * meio até caber. Devolve `null` quando nem a página vazia cabe (não ocorre
 * com o envelope atual; o chamador responde `source_too_large`).
 */
export function fitWriterEvidenceEnvelope(envelope: WriterEvidenceEnvelope, teto: number = WRITER_EVIDENCE_LIMITS.sliceMaxBytes): WriterEvidenceEnvelope | null {
  let atual = envelope;
  for (let tentativa = 0; tentativa < 400; tentativa += 1) {
    if (writerEvidenceJsonBytes(atual) <= teto) return atual;
    const page = atual.page;
    if (!page) return null;
    if (page.container === "array" && Array.isArray(atual.data) && atual.data.length > 1) {
      const itens = atual.data as Array<{ at: number }>;
      const restante = itens.slice(0, -1);
      atual = { ...atual, data: restante, page: { ...page, next: String(itens[itens.length - 1].at) } };
      continue;
    }
    if (page.container === "object" && registro(atual.data) && Object.keys(atual.data as object).length > 1) {
      const chaves = Object.keys(atual.data as object);
      const ultima = chaves[chaves.length - 1];
      const { [ultima]: _descartada, ...resto } = atual.data as Record<string, unknown>;
      void _descartada;
      const proxima = Number(page.cursor) + chaves.length - 1;
      atual = { ...atual, data: resto, page: { ...page, next: String(proxima) } };
      continue;
    }
    if (page.container === "string" && typeof atual.data === "string" && atual.data.length > 1) {
      const caracteres = [...atual.data];
      const metade = caracteres.slice(0, Math.floor(caracteres.length / 2)).join("");
      atual = { ...atual, data: metade, page: { ...page, next: String(Number(page.cursor) + [...metade].length) } };
      continue;
    }
    return null;
  }
  return null;
}

/* =============================== manifesto ============================== */

export type WriterManifestSourceRow = {
  sourceKey: string;
  owner: WriterEvidenceOwner;
  status: string;
  level: RadarEvidenceSource;
  bytes: number | null;
  items: number | null;
  etag: string;
  observedAt: string | null;
  posteriorAoPacote: boolean;
  note: string | null;
};

export type WriterManifestBundleRow = {
  path: readonly string[];
  bytes: number | null;
  items: number | null;
  /** 1: primeiro nível; 2: segundo; 3: terceiro, sob `observed`. */
  depth: number;
};

export type WriterManifestAbsence = { sourceKey: string; owner: WriterEvidenceOwner; reason: string };

export type WriterEvidenceManifest = {
  kind: "writer_evidence_manifest";
  documentId: string;
  articleId: string;
  brandId: string;
  generatedAt: string;
  sizes: "measured" | "unknown_migration_pending";
  etag: string;
  read: string;
  bundle: {
    bundleId: string;
    bundleHash: string;
    profile: string;
    observedAt: string | null;
    status: "frozen";
    level: RadarEvidenceSource;
    levelOverrides: Record<string, RadarEvidenceSource>;
    etag: string;
    /** A chave de cada entrada é `keyPrefix + path`: o prefixo não se repete 74 vezes. */
    keyPrefix: "radar.bundle.";
    columns: readonly ["path", "bytes", "items", "pages"];
    entries: Array<[string, number | null, number | null, number | null]>;
    aliases: Record<string, string>;
  } | null;
  /** `levelRank` é a posição na hierarquia (1 = voz mais alta), `levels[levelRank - 1]`: o nome não se repete a cada linha. */
  levels: readonly RadarEvidenceSource[];
  columns: readonly ["sourceKey", "owner", "status", "levelRank", "bytes", "items", "pages", "etag", "observedAt", "posteriorAoPacote", "note"];
  sources: Array<[string, WriterEvidenceOwner, string, number, number | null, number | null, number | null, string, string | null, boolean, string | null]>;
  absent: Array<[string, WriterEvidenceOwner, string]>;
  notices: string[];
  /** Níveis do dossiê cortados para caber em 8 kB: descer pela fatia do nível acima. */
  omittedBundleDepth: number | null;
};

const paginasDe = (bytes: number | null) => (bytes === null ? null : Math.max(1, Math.ceil(bytes / WRITER_EVIDENCE_LIMITS.sliceDefaultBytes)));

/**
 * MONTA O MANIFESTO NO TETO DE 8 kB.
 *
 * Fontes externas e ausências declaradas nunca são cortadas. O que cede, em
 * ordem: o 3º nível do dossiê congelado; as notas longas; e só então o 2º
 * nível — tudo continua alcançável pela fatia do nível acima, que lista as
 * chaves com os bytes. Medido em 2026-09-23 no documento GOOGLE (agregado):
 * 18 chaves no 1º nível, 56 no 2º e 108 no 3º sob `observed`. Nunca responde
 * acima do teto: o chamador recebe `null` e declara o erro.
 */
export function buildWriterEvidenceManifest(input: {
  documentId: string;
  articleId: string;
  brandId: string;
  generatedAt: string;
  sizes: WriterEvidenceManifest["sizes"];
  bundle: {
    bundleId: string;
    bundleHash: string;
    profile: string;
    observedAt: string | null;
    level: RadarEvidenceSource;
    levelOverrides: Record<string, RadarEvidenceSource>;
    etag: string;
    rows: readonly WriterManifestBundleRow[];
  } | null;
  sources: readonly WriterManifestSourceRow[];
  absent: readonly WriterManifestAbsence[];
  notices: readonly string[];
}): WriterEvidenceManifest | null {
  const fontes = [...input.sources].sort((a, b) => ordemC(a.sourceKey, b.sourceKey));
  const ausentes = [...input.absent].sort((a, b) => ordemC(a.sourceKey, b.sourceKey));
  const linhasDoPacote = [...(input.bundle?.rows ?? [])]
    .sort((a, b) => ordemC(a.path.join("."), b.path.join(".")));
  const etagGeral = writerEvidenceEtag([
    input.documentId, input.bundle?.etag ?? null, ...fontes.map(fonte => fonte.etag), ...ausentes.map(item => `${item.sourceKey}:${item.reason}`),
  ]);

  const encurtar = (texto: string | null, limite: number) => (texto === null || limite === 0 ? null : texto.length > limite ? `${texto.slice(0, limite)}…` : texto);
  const montar = (profundidade: number, notaMax: number): WriterEvidenceManifest => ({
    kind: "writer_evidence_manifest",
    documentId: input.documentId,
    articleId: input.articleId,
    brandId: input.brandId,
    generatedAt: input.generatedAt,
    sizes: input.sizes,
    etag: etagGeral,
    read: "read_writer_evidence { documentId, sourceKey, cursor?, fields?, ifNoneMatch? } — desça com 'sourceKey#caminho.pontuado'",
    bundle: input.bundle ? {
      bundleId: input.bundle.bundleId,
      bundleHash: input.bundle.bundleHash,
      profile: input.bundle.profile,
      observedAt: input.bundle.observedAt,
      status: "frozen",
      level: input.bundle.level,
      levelOverrides: input.bundle.levelOverrides,
      etag: input.bundle.etag,
      keyPrefix: "radar.bundle.",
      columns: ["path", "bytes", "items", "pages"] as const,
      entries: linhasDoPacote.filter(linha => linha.depth <= profundidade)
        .map(linha => [linha.path.join("."), linha.bytes, linha.items, paginasDe(linha.bytes)]),
      aliases: { [`radar.bundle.${WRITER_BUNDLE_STRUCTURAL_ALIAS.path.join(".")}`]: `radar.bundle.${WRITER_BUNDLE_STRUCTURAL_ALIAS.aliasOf.join(".")}` },
    } : null,
    levels: RADAR_EVIDENCE_HIERARCHY,
    columns: ["sourceKey", "owner", "status", "levelRank", "bytes", "items", "pages", "etag", "observedAt", "posteriorAoPacote", "note"] as const,
    sources: fontes.map(fonte => [
      fonte.sourceKey, fonte.owner, fonte.status, RADAR_EVIDENCE_HIERARCHY.indexOf(fonte.level) + 1, fonte.bytes, fonte.items, paginasDe(fonte.bytes), fonte.etag,
      fonte.observedAt, fonte.posteriorAoPacote, encurtar(fonte.note, notaMax),
    ]),
    absent: ausentes.map(item => [item.sourceKey, item.owner, encurtar(item.reason, Math.max(notaMax, 40)) ?? ""]),
    notices: input.notices.map(nota => encurtar(nota, Math.max(notaMax * 2, 80)) ?? ""),
    omittedBundleDepth: linhasDoPacote.some(linha => linha.depth > profundidade) ? profundidade + 1 : null,
  });

  /* Encurtar notas antes de perder o 2º nível: as seções de `observed` são o que a IA mais procura. */
  for (const [profundidade, notaMax] of [[3, 240], [2, 240], [2, 120], [2, 60], [1, 120], [1, 60], [1, 0], [0, 0]] as const) {
    const manifesto = montar(profundidade, notaMax);
    if (writerEvidenceJsonBytes(manifesto) <= WRITER_EVIDENCE_LIMITS.manifestMaxBytes) return manifesto;
  }
  return null;
}

/* =============================== fundamentos ============================ */

/**
 * O que os fundamentos cortam, nesta ordem, para caber em 24 kB. Nada é
 * inventado: a lista cortada diz quantos ficaram de fora e onde ler o resto.
 */
export const WRITER_FOUNDATIONS_TRIM_ORDER = Object.freeze([
  "competitors", "questions", "video.results", "conflicts", "limitations", "specialist.items", "pendingDecisions",
] as const);

type CortavelDosFundamentos = (typeof WRITER_FOUNDATIONS_TRIM_ORDER)[number];

/**
 * CABE OS FUNDAMENTOS NO TETO. Cada passo corta pela metade a lista da vez
 * (até zero) e registra em `trimmed` o que saiu e onde ler inteiro. Devolve
 * `null` só se nem os campos fixos couberem.
 */
export function fitWriterFoundations<T extends Record<string, unknown>>(
  fundamentos: T,
  ondeLer: Readonly<Record<CortavelDosFundamentos, string>>,
  teto: number = WRITER_EVIDENCE_LIMITS.foundationsMaxBytes,
): (T & { trimmed: Array<{ field: string; kept: number; total: number; readAt: string }> }) | null {
  const trimmed: Array<{ field: string; kept: number; total: number; readAt: string }> = [];
  let atual: Record<string, unknown> = structuredClone(fundamentos);
  const lerLista = (caminho: string): unknown[] | null => {
    const [topo, filho] = caminho.split(".");
    const alvo = filho ? registro(atual[topo])?.[filho] : atual[topo];
    return Array.isArray(alvo) ? alvo : null;
  };
  const gravarLista = (caminho: string, lista: unknown[]) => {
    const [topo, filho] = caminho.split(".");
    if (!filho) { atual = { ...atual, [topo]: lista }; return; }
    atual = { ...atual, [topo]: { ...(registro(atual[topo]) ?? {}), [filho]: lista } };
  };
  const medir = () => writerEvidenceJsonBytes({ ...atual, trimmed });
  for (const caminho of WRITER_FOUNDATIONS_TRIM_ORDER) {
    while (medir() > teto) {
      const lista = lerLista(caminho);
      if (!lista || !lista.length) break;
      const registroExistente = trimmed.find(item => item.field === caminho);
      const total = registroExistente?.total ?? lista.length;
      const manter = Math.floor(lista.length / 2);
      gravarLista(caminho, lista.slice(0, manter));
      if (registroExistente) registroExistente.kept = manter;
      else trimmed.push({ field: caminho, kept: manter, total, readAt: ondeLer[caminho] });
    }
    if (medir() <= teto) break;
  }
  const final = { ...atual, trimmed } as T & { trimmed: typeof trimmed };
  return writerEvidenceJsonBytes(final) <= teto ? final : null;
}

/* ======================= dossiê: caminhos conhecidos ===================== */

/**
 * OS CAMINHOS DO DOSSIÊ E O MAIOR TAMANHO MEDIDO DE CADA UM.
 *
 * Medido em 2026-09-23 no remoto, só agregado (R2/R3:
 * `max(octet_length((payload #> caminho)::text))` sobre os 2 documentos com
 * dossiê). É a lista que o manifesto mostra quando a função SQL ainda não
 * existe — com tamanho DESCONHECIDO para este documento, porque a medida é de
 * outros —, e a lista fechada que a fatia atende por seletor de caminho sem a
 * migration: só o que coube com folga (≤ 24 kB medido), e ainda assim
 * conferido em bytes antes de responder.
 */
export const WRITER_BUNDLE_KNOWN_PATHS: Readonly<Record<string, number>> = Object.freeze({
  research: 2_255,
  competitiveBlueprint: 35_287,
  crossSerp: 4,
  editorialOutputs: 428,
  observedAt: 26,
  researchSources: 16,
  serpStanding: 205,
  conflicts: 2,
  limitations: 1_964,
  specialist: 2_829,
  video: 14_260,
  "video.sources": 584,
  "video.summary": 87,
  "video.results": 9_304,
  "video.briefs": 3_878,
  observed: 4_417_293,
  "observed.identity": 1_241,
  "observed.sample": 288,
  "observed.intent": 215,
  "observed.formats": 5_556,
  "observed.structure": 34_730,
  "observed.concepts": 323_247,
  "observed.questions": 19_371,
  "observed.entities": 18_738,
  "observed.gaps": 14_965,
  "observed.differentiations": 32_126,
  "observed.conflicts": 2,
  "observed.competitors": 21_512,
  "observed.internalLinks": 872_168,
  "observed.internalLinkPlan": 38_191,
  "observed.externalSources": 1_477_943,
  "observed.authorityEvidence": 33_347,
  "observed.aiDiscovery": 216_298,
  "observed.sufficiency": 400,
  "observed.limitations": 1_628,
  "observed.evidence": 1_327_389,
});

export const WRITER_BUNDLE_DIRECT_READ_MAX_BYTES = 24_576;

/** A seção pode ser lida por seletor de caminho, sem a função SQL? */
export function writerBundlePathReadableWithoutMigration(caminho: readonly string[]): boolean {
  const medido = WRITER_BUNDLE_KNOWN_PATHS[caminho.join(".")];
  return typeof medido === "number" && medido <= WRITER_BUNDLE_DIRECT_READ_MAX_BYTES;
}

/** Profundidade de um caminho conhecido, na régua do manifesto. */
export const writerBundlePathDepth = (caminho: readonly string[]) => caminho.length;

/* ======================== ArticleDNA: projeção editorial ================= */

/**
 * A PROJEÇÃO EDITORIAL DO ArticleDNA nos fundamentos (SDD §4.1). Medida em
 * 2026-09-23: no máximo 872 B. O resto do ArticleDNA sai pela fatia
 * `dna.article/<versionId>`, por chave.
 */
export const WRITER_ARTICLE_DNA_FOUNDATION_FIELDS = Object.freeze([
  "promise", "audience", "problem", "desiredResult", "angle", "mainIntent", "journeyStage", "antiCannibalizationBoundary",
  "requiredTopics", "excludedSubjects", "entities", "evidenceNeeded", "cta", "differentiation", "primaryKeywordPolicy",
  "serpAssessmentRef", "territoryRef",
] as const);
