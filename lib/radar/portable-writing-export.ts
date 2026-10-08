import { RADAR_WRITER_MAY_NOT_SUBJECT, radarWriterMayNotFor } from "../redator/writer-handoff.ts";
import { radarCompetitorTopics } from "./competitor-topics.ts";
import { WRITER_EVIDENCE_LIMITS } from "../redator/writer-evidence-catalog.ts";
import { RADAR_AMAZON_INTENT_LABELS, type RadarAmazonEditorialIntentType } from "./amazon-editorial-target.ts";
import { radarClaimNeedsFactualSupport } from "./claim-evidence.ts";
import { radarTextAdheresToCore, radarUbiquitousStems } from "./intent-adherence.ts";
import { radarSemanticStems } from "./semantic-concept-model.ts";
import { radarOutOfScopeMatcher } from "./out-of-scope.ts";
import { RADAR_SUBJECT_MUST_COVER_REASON, radarSubjectCtaDirection, radarSubjectTurnTitle } from "./declared-subject.ts";
import { RADAR_AMAZON_EDITORIAL_OUTPUT_LABELS } from "./competitive-blueprint.ts";
import { RADAR_EDITORIAL_OUTPUT_LABELS } from "./multimodal-blueprint.ts";
import { radarPortableSpecialistContext, radarPortableVideoContext, radarPortableVideoUsageLine, type RadarPortableVideoExtract } from "./portable-annex-context.ts";
import { radarPortableCompetitorsStructure, radarPortableWriterReadiness } from "./portable-dossier-gaps.ts";
import {
  radarPortableExternalSources,
  radarPortableInternalLinks,
  radarPortableKeywordsDna,
  radarPortableSerpEvidence,
  type RadarPortableKeywordDna,
  type RadarPortableSerpEvidence,
} from "./portable-evidence-pack.ts";
import { radarPortableActionableLimitations, type RadarPortableExportInput } from "./portable-export.ts";
import { radarPortableSeoMetadata, radarPortableVisualPlan, type RadarPortableImagePlan } from "./portable-identity.ts";
import {
  radarPortableArticleDna,
  radarPortableEditorialOf,
  radarPortableFlatSections,
  type RadarPortableEditorial,
  type RadarPortableSection,
} from "./portable-read-model.ts";
import { radarPortableSerpLenses, radarPortableSerpObserved, type RadarPortableSerpLenses, type RadarPortableSerpObserved } from "./portable-serp-observed.ts";

import type { RadarAiDiscoveryContext } from "./ai-discovery-context.ts";
import type { RadarAuthorityEvidence } from "./authority-evidence.ts";
import type { RadarEditorialSubjectTurn } from "./editorial-article-model.ts";
import type { RadarSiloExportWritingContext } from "./portable-silo-export.ts";
import {
  radarArticleBlueprintColumns,
  radarArticleBlueprintPublishedMapLine,
  radarArticleBlueprintPublishedMapReading,
  radarArticleBlueprintVideoSections,
  radarArticleBlueprintWithCurrentNames,
  type RadarArticleBlueprintLiveVideo,
  type RadarArticleBlueprintPayload,
  type RadarArticleBlueprintPublishedMapReading,
} from "./article-blueprint.ts";
import {
  radarBrandVoiceAbsence,
  radarBrandVoiceBySlot,
  radarBrandVoiceDeliverableLabel,
  radarBrandVoiceDeliverableStatusLabel,
  radarBrandVoiceText,
  type RadarBrandVoiceRef,
  type RadarBrandVoiceState,
} from "./brand-voice.ts";
import { radarClaimCommonStems, radarPendingClaims, radarSentenceNeedsSource, type RadarSentenceSourceVerdict } from "./pending-claims.ts";

/**
 * ===== O EXPORT "PARA ESCREVER" — o CSV que uma pessoa ou uma IA usa para escrever =====
 *
 * ==================== POR QUE ESTE ARQUIVO EXISTE ====================
 *
 * O dono do produto abriu o CSV real (três artigos, 61 a 63 colunas, ~180 mil
 * caracteres por artigo) e disse que ele não serve para escrever: "tem monte
 * de colunas inúteis". A medição confirmou: pares Markdown + JSON do mesmo
 * conteúdo, dois agregados que repetem 85% a 100% das outras colunas, a
 * evidência crua da SERP com 165 conceitos, telemetria de coleta.
 *
 * Este é o formato padrão do export: 13 colunas FIXAS, em Markdown curto, com
 * só o que é imprescindível para escrever. O formato de antes continua
 * disponível como "Completo (técnico)", sem nenhuma mudança
 * (`buildRadarPortableExportRow`), para auditoria.
 *
 * ==================== AS MESMAS FONTES, OUTRA PROJEÇÃO ====================
 *
 * Toda coluna nasce da MESMA entrada do formato completo
 * (`RadarPortableExportInput`: o pacote congelado, o dossiê, o modelo do
 * artigo), pelas MESMAS projeções de domínio. Nenhuma leitura nova de banco
 * e nenhuma conclusão recalculada (invariante 30): o export limpa a
 * apresentação — decodifica HTML, tira rastreio de URL, descarta conceito
 * isolado e fonte não classificada, traduz códigos — e, quando o pacote se
 * contradiz, DIZ a contradição em vez de escolher um lado.
 *
 * ==================== O QUE ELE NÃO DECIDE ====================
 *
 * Estrutura final, número de H2, contagem de palavras e ordem rígida são de
 * quem redige (invariantes 32 e 48: o Planejador saiu do pipeline em
 * 2026-09-18 e quem escreve também planeja): a estrutura sai como "ordem sugerida", e a
 * medida dos concorrentes sai rotulada como referência da SERP, nunca meta.
 * O export também não escreve texto: título, ALT e resposta de especialista
 * saem como foram gravados, ou são omitidos com o motivo dito uma vez.
 *
 * ==================== GUARDAS ====================
 *
 * Sem FAQ (AGENTS §13): perguntas vão dentro das seções, e a seção de FAQ que
 * o modelo ou a concorrência trouxer é omitida da estrutura. Dado de terceiros
 * é pesquisa: trecho de até 160 caracteres, rotulado, sem texto integral.
 * Nenhum UUID, hash, versão, id de keyword, `asin` como campo, data ISO de
 * coleta, nome de provider ou código interno.
 *
 * Domínio puro: sem fetch, sem storage, sem provider, sem React.
 */

/* ============================== o contrato ============================== */

export const RADAR_WRITING_EXPORT_COLUMNS = [
  "ordem",
  "pode_escrever",
  "artigo",
  "promessa_e_leitor",
  "titulo_e_seo",
  "estrutura",
  "cobrir_e_superar",
  "serp_resumida",
  "fontes_e_especialista",
  "links_internos",
  "plano_visual",
  "produtos",
  "prompt",
] as const;

export type RadarWritingExportColumn = typeof RADAR_WRITING_EXPORT_COLUMNS[number];
export type RadarWritingExportRow = Record<RadarWritingExportColumn, string>;
export type RadarWritingVerdict = "Sim" | "Com ressalva" | "Não";

/**
 * ===== OS LIMITES =====
 *
 * O teto do ARTIGO é o dos fundamentos que o Redator da plataforma entrega à
 * IA (`WRITER_EVIDENCE_LIMITS.foundationsMaxBytes`, 24 kB): 20 mil caracteres
 * de pt-BR cabem nele. Cada célula fica muito abaixo dos 32.767 do Excel.
 *
 * Quando a linha passa do teto, corta-se primeiro a SERP resumida, depois o
 * "cobrir e superar", e o corte é declarado na própria célula. Ordem, veredito,
 * identidade, estrutura, links, produtos e prompt nunca são cortados.
 *
 * 2026-10-02 · TETOS NOVOS E A SERP POR ÚLTIMO. Com o artigo-modelo, a
 * estrutura passou de 8 mil (6 H2 com origem, evidências, links e imagem) e a
 * linha de 20 mil: a última seção saía cortada e a SERP resumida inteira virava
 * "[…] Cortado" — justo o índice que dá sentido aos ids S, P e C da estrutura.
 * O CSV é para escrever FORA da plataforma (o Redator tem os seus fundamentos,
 * com corte próprio); 14 mil na estrutura e 40 mil no artigo (32 → 40 mil com os temas dos concorrentes, 2026-10-02) seguem longe dos
 * 32.767 por célula do Excel. A ordem do corte passa a ser "cobrir e superar",
 * fontes, plano visual e, por último, a SERP, que nunca some inteira.
 */
export const RADAR_WRITING_EXPORT_LIMITS = {
  cellChars: 6_000,
  structureChars: 14_000,
  /** 2026-10-02 · A SERP resumida ganhou os temas dos concorrentes (H2/H3 das páginas lidas): teto próprio. */
  serpChars: 10_000,
  articleChars: 40_000,
  /** O mínimo da célula cortável no primeiro passe: o começo da SERP (índice S/P/C) fica. */
  cutFloorChars: 1_500,
  foundationsBytes: WRITER_EVIDENCE_LIMITS.foundationsMaxBytes,
  thirdPartyExcerptChars: 160,
  titleChars: 90,
  organicResults: 8,
  questions: 10,
  terms: 15,
  moves: 6,
  specialistAnswerChars: 400,
  verdictReasons: 4,
} as const;

/** 2026-10-02 · O teto de cada célula: a estrutura e a SERP têm o seu; as demais, o comum. */
export const radarWritingCellLimit = (coluna: RadarWritingExportColumn): number =>
  coluna === "estrutura" ? RADAR_WRITING_EXPORT_LIMITS.structureChars
    : coluna === "serp_resumida" ? RADAR_WRITING_EXPORT_LIMITS.serpChars
      : RADAR_WRITING_EXPORT_LIMITS.cellChars;

/** A estimativa que a tela mostra antes do clique: o alvo típico, não o teto. */
export const RADAR_WRITING_EXPORT_TYPICAL_CHARS_PER_ARTICLE = 10_000;

export type RadarWritingPublication = {
  published: boolean;
  publishedUrl: string | null;
  canonical: string | null;
  slug: string | null;
  /** `ArticleDNA.primaryKeywordPolicy`. `null` quando o DNA não a declara. */
  principalPolicy: string | null;
  /**
   * A estrutura da página publicada (H1, H2 e data da última atualização).
   * Nenhum pacote a traz hoje: sem ela, o veredito diz que a atualização
   * precisa preservar o que existe, em vez de reescrever às cegas.
   */
  currentStructure?: { h1: string | null; h2: string[]; updatedAt: string | null } | null;
};

export type RadarWritingArticleContext = {
  /** O rótulo da linha de topo: "Silo" no export por silo, "Marca" nos dossiês avulsos. */
  topRowLabel: "Silo" | "Marca";
  /** Posição do artigo no arquivo (1…n), usada quando não há silo. */
  filePosition: number;
  /** O silo do arquivo. `null` nos dossiês avulsos. */
  silo: RadarSiloExportWritingContext | null;
  /** Endereço interno, só para achar o artigo entre os membros do silo. Nunca sai. */
  articleId: string | null;
  publication: RadarWritingPublication | null;
  /**
   * 2026-10-02 · Aditivo: o Silo vai NA LINHA do artigo. É o export dos
   * selecionados quando a seleção cruza mais de um Silo e a linha de topo não
   * pode carregar todos. Sem ele, nada muda.
   */
  siloInline?: boolean;
  /**
   * 2026-10-02 · Aditivo: o artigo-modelo APROVADO (SDD diretriz, Adendo A).
   * Com ele, título e SEO, promessa, estrutura, links e plano visual saem dele.
   */
  blueprint?: RadarArticleBlueprintPayload | null;
  /** 2026-10-02 · Aditivo: a Skill de voz ATIVA da Marca, que a linha "Voz da marca" carrega (Adendo C). */
  brandVoice?: RadarBrandVoiceRef | null;
};

export type RadarWritingExportArticle = {
  row: RadarWritingExportRow;
  verdict: RadarWritingVerdict;
  /** Como o artigo é chamado na linha de topo: a keyword principal, nunca o id. */
  label: string;
  firstReason: string | null;
  healthTopic: boolean;
  published: boolean;
  /**
   * 2026-10-02 · Aditivo: o nome da unidade quando ela NÃO é artigo ("landing
   * page", "página de serviço"…), para a linha de topo falar de "artigos e
   * páginas". Ausente no artigo: o objeto sai byte a byte como antes.
   */
  unitNoun?: string;
};

/* ============================== a limpeza ============================== */

const ENTIDADES: Record<string, string> = {
  amp: "&", lt: "<", gt: ">", quot: "\"", apos: "'", nbsp: " ",
  ndash: "–", mdash: "—", hellip: "…", laquo: "«", raquo: "»",
  ldquo: "“", rdquo: "”", lsquo: "‘", rsquo: "’", bull: "•", middot: "·",
  deg: "°", ordm: "º", ordf: "ª", reg: "®", copy: "©", trade: "™",
  ccedil: "ç", Ccedil: "Ç", ntilde: "ñ", Ntilde: "Ñ",
};
const DIACRITICOS: Record<string, string> = { acute: "́", grave: "̀", circ: "̂", tilde: "̃", uml: "̈" };
for (const base of "aeiouAEIOU") {
  for (const [nome, marca] of Object.entries(DIACRITICOS)) ENTIDADES[`${base}${nome}`] = `${base}${marca}`.normalize("NFC");
}

/** Entidades HTML viram texto: "&Eacute;" é "É", "&#8211;" é "–". Duas passadas pegam o duplo escape. */
export function radarWritingDecodeEntities(valor: string): string {
  let texto = valor;
  for (let passada = 0; passada < 2; passada += 1) {
    const proximo = texto.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (inteiro, corpo: string) => {
      if (corpo.startsWith("#")) {
        const numero = corpo[1] === "x" || corpo[1] === "X" ? Number.parseInt(corpo.slice(2), 16) : Number.parseInt(corpo.slice(1), 10);
        return Number.isFinite(numero) && numero > 0 && numero < 0x110000 ? String.fromCodePoint(numero) : inteiro;
      }
      return ENTIDADES[corpo] ?? ENTIDADES[corpo.toLowerCase()] ?? inteiro;
    });
    if (proximo === texto) break;
    texto = proximo;
  }
  return texto;
}

const RASTREIO = /^(utm_[a-z0-9_]*|srsltid|pp|gclid|fbclid|msclkid|mc_cid|mc_eid|_ga)$/i;

/**
 * A URL LIMPA: sem `srsltid`, `utm_*`, `pp` e parâmetros de clique.
 *
 * Endereço da Amazon perde a consulta inteira — é nela que moram `tag` e
 * `ref`, e a tag de afiliado é da etapa de publicação. O caminho nunca é
 * tocado: o endereço de um concorrente pode ter um UUID legítimo.
 */
export function radarWritingCleanUrl(valor: string): string {
  const cru = radarWritingDecodeEntities(valor.trim());
  try {
    const url = new URL(cru);
    if (/(^|\.)amazon\.[a-z.]+$/i.test(url.hostname)) {
      url.search = "";
      url.hash = "";
      return url.toString();
    }
    for (const chave of [...url.searchParams.keys()]) if (RASTREIO.test(chave)) url.searchParams.delete(chave);
    if (url.hash.startsWith("#:~:")) url.hash = "";
    return url.toString().replace(/\?$/, "");
  } catch {
    return cru.replace(/[?&](utm_[a-z0-9_]*|srsltid|pp|gclid|fbclid)=[^&#\s]*/gi, "").replace(/\?&/, "?").replace(/\?$/, "");
  }
}

/* O endereço interno nunca é texto de escrita. */
const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;
const HASH = /\bsha256:[0-9a-f]*/gi;
const ENDERECO_INTERNO = /\b(?:page|concept|question|section|need|claim|answer|specialist|research|serp|bundle|organic|paa|related|knowledge_graph|ytq|amzq|competitor|response|run|snapshot|article|territory|node):[A-Za-z0-9](?:[A-Za-z0-9:_.-]*[A-Za-z0-9])?/g;
const ROTULO_DE_VERSAO = /\bID\s*·\s*v\d+\b/g;
const INSTANTE_ISO = /\b\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})?/g;

const CODIGOS: Record<string, string> = {
  PILLAR_TO_SUPPORT: "Pilar → Suporte",
  SUPPORT_TO_PILLAR: "Suporte → Pilar",
  SUPPORT_TO_SUPPORT: "Suporte → Suporte",
  ARTICLE_TO_SILO_PAGE: "Artigo → SiloPage",
  SILO_PAGE_TO_ARTICLE: "SiloPage → Artigo",
  INFORMATIONAL: "Informacional",
  COMMERCIAL: "Comercial",
  TRANSACTIONAL: "Transacional",
  NAVIGATIONAL: "Navegacional",
  COMMERCIAL_INVESTIGATION: "Investigação comercial",
  ...RADAR_AMAZON_INTENT_LABELS,
  ...RADAR_AMAZON_EDITORIAL_OUTPUT_LABELS,
  ...RADAR_EDITORIAL_OUTPUT_LABELS,
};
const CODIGO_NO_TEXTO = new RegExp(`\\b(${Object.keys(CODIGOS).sort((a, b) => b.length - a.length).join("|")})\\b`, "g");

/** Um trecho de TEXTO (fora de URL): entidades decodificadas, endereço interno fora, código traduzido. */
function textoLimpo(valor: string): string {
  return radarWritingDecodeEntities(valor)
    .replace(HASH, "")
    .replace(UUID, "")
    .replace(ENDERECO_INTERNO, "")
    .replace(ROTULO_DE_VERSAO, "")
    .replace(INSTANTE_ISO, "")
    .replace(CODIGO_NO_TEXTO, codigo => CODIGOS[codigo] || codigo)
    .replace(/\(\s*\)/g, "")
    .replace(/[ \t]{2,}/g, " ")
    /* O que sobrou da remoção: " , , " vira ", ". */
    .replace(/[ \t]+([,;])/g, "$1")
    .replace(/([,;])(?:[ \t]*[,;])+/g, "$1");
}

const URL_NO_TEXTO = /https?:\/\/[^\s"'<>]+/g;

/**
 * A HIGIENE DA CÉLULA: texto limpo, URL limpa — cada um pela sua regra.
 *
 * O UUID sai do texto (é nosso) e fica na URL (é do concorrente). Separar os
 * dois é o que impede a limpeza de quebrar um endereço de terceiro.
 */
function higiene(celula: string): string {
  let saida = "";
  let ultimo = 0;
  for (const achado of celula.matchAll(URL_NO_TEXTO)) {
    const inicio = achado.index ?? 0;
    saida += textoLimpo(celula.slice(ultimo, inicio));
    let url = achado[0];
    const pontuacao = url.match(/[.,;:!?)\]]+$/)?.[0] || "";
    if (pontuacao) url = url.slice(0, -pontuacao.length);
    saida += radarWritingCleanUrl(url) + pontuacao;
    ultimo = inicio + achado[0].length;
  }
  saida += textoLimpo(celula.slice(ultimo));
  return saida.split("\n").map(linha => linha.replace(/[ \t]+$/, "")).join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

/**
 * ===== A CÉLULA QUE O EXCEL NÃO LÊ COMO FÓRMULA =====
 *
 * O Excel interpreta como fórmula a célula que começa com "=", "+", "-" ou
 * "@", mesmo entre aspas — e uma lista Markdown começa com "- ". As células
 * deste formato começam por um rótulo; se alguma escapar, o apóstrofo
 * neutraliza a fórmula.
 */
export function radarWritingSpreadsheetSafe(celula: string): string {
  return /^[=+\-@\t\r]/.test(celula) ? `'${celula}` : celula;
}

/* ============================== utilidades ============================== */

const texto = (valor: unknown): string => (typeof valor === "string" ? valor.trim() : "");

/** A chave de comparação: sem acento, sem caixa, sem pontuação, sem entidade HTML. */
export function radarWritingCompareKey(valor: string | null | undefined): string {
  return radarWritingDecodeEntities(valor || "")
    .toLowerCase()
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const unicosPorChave = <T>(itens: readonly T[], chaveDe: (item: T) => string): T[] => {
  const vistos = new Set<string>();
  const saida: T[] = [];
  for (const item of itens) {
    const chave = chaveDe(item);
    if (!chave || vistos.has(chave)) continue;
    vistos.add(chave);
    saida.push(item);
  }
  return saida;
};

const cortar = (valor: string, limite: number): string => {
  const limpo = radarWritingDecodeEntities(valor).replace(/\s+/g, " ").trim();
  return limpo.length > limite ? `${limpo.slice(0, limite - 1).trimEnd()}…` : limpo;
};

const numeroBr = (valor: number): string => new Intl.NumberFormat("pt-BR").format(valor);

/** "COMO É A PELE OLEOSA?" vira "Como é a pele oleosa?": caixa alta de cabeçalho não é ênfase de quem escreve. */
const semCaixaAlta = (valor: string): string => {
  const letras = valor.replace(/[^\p{L}]/gu, "");
  if (letras.length < 4 || letras !== letras.toUpperCase()) return valor;
  const baixa = valor.toLocaleLowerCase("pt-BR");
  return baixa.charAt(0).toLocaleUpperCase("pt-BR") + baixa.slice(1);
};

/** dd/mm/aaaa, em UTC. Instante inválido não vira data. */
export function radarWritingDate(valor: string | null | undefined): string | null {
  if (!valor || Number.isNaN(Date.parse(valor))) return null;
  const data = new Date(valor);
  return `${String(data.getUTCDate()).padStart(2, "0")}/${String(data.getUTCMonth() + 1).padStart(2, "0")}/${data.getUTCFullYear()}`;
}

const semPontoFinal = (valor: string): string => valor.trim().replace(/[.;:\s]+$/, "");
const comPontoFinal = (valor: string): string => {
  const corpo = valor.trim();
  return !corpo || /[.!?…:]$/.test(corpo) ? corpo : `${corpo}.`;
};
const entreAspas = (valor: string) => `"${semPontoFinal(valor).replace(/^["“]|["”]$/g, "")}"`;

const origemDe = (url: string | null | undefined): string | null => {
  if (!url) return null;
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
};

/* O que o pacote escreve quando o campo não foi preenchido. Isso não é conteúdo. */
const PREENCHIMENTO = [
  /^pendente\b/i,
  /pendente de enriquecimento/i,
  /n[aã]o definid[oa] nesta fase/i,
  /ainda n[aã]o definid/i,
  /^cobrir com clareza o tema/i,
  /^reunir o que o artigo precisa dizer/i,
  /^cobrir um ponto que o leitor procura/i,
  /^dar ao leitor o fundamento/i,
  /^transformar o fundamento em aplica/i,
  /^explicar a causa por tr[aá]s do que o leitor observa/i,
  /^representar visualmente a promessa/i,
];
const ehPreenchimento = (valor: string | null | undefined): boolean => {
  const limpo = texto(valor);
  return !limpo || PREENCHIMENTO.some(padrao => padrao.test(limpo)) || /cobrir com clareza o tema/i.test(limpo);
};
const util = (valor: string | null | undefined): string | null => (ehPreenchimento(valor) ? null : texto(valor));

/** "Cobrir com clareza o tema “X”." é a moldura da promessa padrão: o que importa é o X. */
const semMolduraDoTema = (valor: string | null | undefined): string | null => {
  const limpo = texto(valor);
  const dentro = limpo.match(/cobrir com clareza o tema\s*[“"]([^”"]+)[”"]/i);
  return dentro ? dentro[1].trim() : limpo || null;
};

const EH_FAQ = /\b(faq|perguntas frequentes|d[uú]vidas frequentes)\b/i;

/** 2026-10-02 · Palavras funcionais que o radical não remove: não contam como raiz do tema. */
export const RADAR_WRITING_FUNCTION_WORDS: ReadonlySet<string> = new Set(["pelo", "pela", "pelos", "pelas", "para", "como", "com", "sem", "sobre", "que", "dos", "das", "nos", "nas", "uma", "uns", "umas", "seu", "sua", "seus", "suas", "mais"]);

const VAZIAS = new Set([
  "a", "as", "o", "os", "um", "uma", "de", "da", "do", "das", "dos", "em", "na", "no", "nas", "nos",
  "e", "ou", "que", "se", "com", "para", "por", "ao", "aos", "sobre", "seu", "sua", "este", "esta",
  "isso", "como", "qual", "quais", "quando", "onde", "porque", "voce", "voces", "nosso", "nossos", "nossa",
  "aqui", "mais", "muito", "ser", "ter", "fazer", "pode", "sao", "e", "ja",
]);

export const radarWritingContentWords = (valor: string | null | undefined): Set<string> => new Set(
  radarWritingCompareKey(valor).split(" ").filter(palavra => palavra.length > 2 && !VAZIAS.has(palavra)),
);

/* ============================== os rótulos ============================== */

const PAPEL: Record<string, string> = {
  pillar: "Pilar", pilar: "Pilar",
  support: "Suporte", suporte: "Suporte",
  reforco_narrativo: "Reforço narrativo", "reforco narrativo": "Reforço narrativo",
};

const papelLegivel = (valor: string | null | undefined): string | null => {
  const chave = radarWritingCompareKey(valor);
  if (!chave) return null;
  return PAPEL[chave] || PAPEL[chave.replace(/ /g, "_")] || texto(valor);
};

const O_QUE_O_PAPEL_PEDE: Record<string, string> = {
  Pilar: "cobre o tema com amplitude e aprofunda por links para os suportes",
  Suporte: "aprofunda um recorte do tema e devolve o leitor ao Pilar",
  "Reforço narrativo": "sustenta a narrativa do Silo sem disputar a keyword do Pilar",
};

const INTENCAO: Record<string, string> = {
  informational: "Informacional", informacional: "Informacional", informativa: "Informacional",
  commercial: "Comercial", comercial: "Comercial",
  transactional: "Transacional", transacional: "Transacional",
  navigational: "Navegacional", navegacional: "Navegacional",
  commercial_investigation: "Investigação comercial",
};
const intencaoLegivel = (valor: string | null | undefined): string | null => {
  const chave = radarWritingCompareKey(valor).replace(/ /g, "_");
  if (!chave || chave === "unknown" || chave === "desconhecida") return null;
  return INTENCAO[chave] || texto(valor);
};

const OMITIR = new Set(["medium", "unknown", "desconhecido", "desconhecida", "nao informado", "nao declarado"]);
const legivelOuNulo = (valor: string | null | undefined): string | null => {
  const limpo = texto(valor);
  return !limpo || OMITIR.has(radarWritingCompareKey(limpo)) ? null : limpo;
};

/* ============================== o formato ============================== */

/**
 * ===== O TIPO DA UNIDADE (pedido do dono, 2026-10-02) =====
 *
 * "Todas essas melhorias, regras e diretrizes têm que ser aplicáveis para
 * qualquer tipo de artigo ou landing page." O CSV falava sempre de "o artigo":
 * numa landing page ou numa página de serviço, "escreva o artigo descrito" e
 * "com a data de atualização visível" mandam fazer outra coisa.
 *
 * O tipo vem do ArticleDNA (`unitClassification.type`, lido pelo núcleo em
 * `input.article.contentType`). Sem tipo, ou "article", a unidade é o artigo e
 * toda frase sai byte a byte como antes. `editorial` diz se a data de
 * atualização visível faz parte da entrega (artigo e review: sim; página de
 * serviço, landing page e categoria: não).
 */
export type RadarWritingUnit = {
  kind: "article" | "review" | "landing_page" | "service_page" | "category_page" | "page";
  /** "artigo", "landing page", "página de serviço"… — sempre em minúscula. */
  noun: string;
  feminine: boolean;
  editorial: boolean;
};

const ARTIGO_COMO_UNIDADE: RadarWritingUnit = { kind: "article", noun: "artigo", feminine: false, editorial: true };

export function radarWritingUnitOf(input: Pick<RadarPortableExportInput, "article">): RadarWritingUnit {
  const tipo = radarWritingCompareKey(input.article.contentType).replace(/ /g, "_");
  if (!tipo || tipo === "article" || tipo === "artigo") return ARTIGO_COMO_UNIDADE;
  if (tipo === "landing_page") return { kind: "landing_page", noun: "landing page", feminine: true, editorial: false };
  if (tipo === "service_page" || tipo === "pagina_de_servico") return { kind: "service_page", noun: "página de serviço", feminine: true, editorial: false };
  if (tipo === "category_page" || tipo === "pagina_de_categoria") return { kind: "category_page", noun: "página de categoria", feminine: true, editorial: false };
  if (/review|resenha/.test(tipo)) return { kind: "review", noun: "review", feminine: false, editorial: true };
  return { kind: "page", noun: "página", feminine: true, editorial: false };
}

/* As formas que a frase pede: "o artigo" / "a landing page", "este" / "esta", "descrito" / "descrita". */
const daUnidade = (unidade: RadarWritingUnit) => ({
  o: unidade.feminine ? "a" : "o",
  do: unidade.feminine ? "da" : "do",
  este: unidade.feminine ? "esta" : "este",
  deste: unidade.feminine ? "desta" : "deste",
  neste: unidade.feminine ? "Nesta" : "Neste",
  terminacao: unidade.feminine ? "a" : "o",
  Nome: unidade.noun.charAt(0).toUpperCase() + unidade.noun.slice(1),
});

function formatoLegivel(input: RadarPortableExportInput, editorial: RadarPortableEditorial): string | null {
  const setup = input.commercial?.setup ?? input.amazon?.setup ?? null;
  if (input.profile === "AMAZON") {
    const tipo = (setup?.intent.type || editorial.editorialOutput || null) as RadarAmazonEditorialIntentType | null;
    const rotulo = tipo ? RADAR_AMAZON_INTENT_LABELS[tipo] || texto(tipo) : "Artigo comercial";
    const quantidade = setup?.intent.desiredCount;
    return quantidade ? `${rotulo} · lista comparativa de ${quantidade} produtos` : rotulo;
  }
  if (input.profile === "YOUTUBE") {
    return `Roteiro de vídeo${editorial.editorialOutput ? ` (${editorial.editorialOutput})` : ""}`;
  }
  const saida = editorial.editorialOutput ? CODIGOS[editorial.editorialOutput] || editorial.editorialOutput : null;
  /* 2026-10-02 · página que não é artigo diz o que é; o artigo continua "Artigo editorial". */
  const unidade = radarWritingUnitOf(input);
  if (unidade.kind !== "article") return `${daUnidade(unidade).Nome}${saida ? ` · ${saida}` : ""}`;
  return saida || "Artigo editorial";
}

/* ============================== as projeções ============================== */

/**
 * AS MESMAS PROJEÇÕES DO FORMATO COMPLETO, NA MESMA ORDEM.
 *
 * `buildRadarPortableExportRow` monta cada uma destas a partir da mesma
 * entrada. Aqui elas são montadas de novo, e não relidas de colunas: reler o
 * Markdown do formato completo seria projetar uma projeção.
 */
export function radarWritingProjections(input: RadarPortableExportInput) {
  const blueprint = input.blueprintView.blueprint;
  const editorial = radarPortableEditorialOf({
    profile: input.profile,
    principalKeyword: input.article.principalKeyword,
    articleModel: input.articleModel,
    profileModel: input.profileModel,
  });
  const dna = radarPortableArticleDna({
    principalKeyword: input.article.principalKeyword,
    secondaryKeywords: input.article.secondaryKeywords,
    narrativeReinforcements: input.article.narrativeReinforcements,
    intent: input.article.intent,
    funnel: input.article.funnel,
    silo: input.article.siloName,
    siloRole: input.article.articleRole,
    mustCover: input.article.mustCover,
    slug: input.article.slug,
    publishedProtected: Boolean(input.article.publishedProtected),
    internalLinkRequirements: input.internalLinks || [],
  });
  const observado = input.googleObserved ?? null;
  const serp = radarPortableSerpEvidence({ observed: observado, blueprint, articleModel: input.articleModel ?? null });
  const fontesExternas = radarPortableExternalSources(observado);
  const linksDoPlano = radarPortableInternalLinks({ observed: observado, blueprint });
  const keywords = radarPortableKeywordsDna(input.researchContext ?? null);
  const seo = radarPortableSeoMetadata({
    editorial, dna, blueprint,
    slug: input.article.slug,
    canonical: input.article.canonical ?? null,
    protectedFields: input.article.protectedFields || [],
  });
  const visual = radarPortableVisualPlan({
    editorial, blueprint,
    principalKeyword: input.article.principalKeyword,
    articleTitle: editorial.title,
    promise: input.article.promise ?? editorial.readerPromise,
    hasVideoBlueprint: input.profile === "YOUTUBE",
  });
  const video = input.videoContext ?? radarPortableVideoContext(null);
  const especialista = input.specialistContext ?? radarPortableSpecialistContext(null);
  const serpObservada: RadarPortableSerpObserved | null = input.serpObserved ? radarPortableSerpObserved(input.serpObserved) : null;
  const lentes: RadarPortableSerpLenses | null = input.serpLenses ? radarPortableSerpLenses(input.serpLenses) : null;
  const concorrentes = input.dossierGaps
    ? radarPortableCompetitorsStructure({ profile: input.profile, observed: input.dossierGaps.observed })
    : null;
  const autoridade: RadarAuthorityEvidence | null = input.dossierGaps?.observed?.authorityEvidence ?? observado?.authorityEvidence ?? null;
  const descoberta: RadarAiDiscoveryContext | null = input.dossierGaps?.observed?.aiDiscovery ?? observado?.aiDiscovery ?? null;
  const prontidao = input.dossierGaps ? radarPortableWriterReadiness(input.dossierGaps.status) : null;
  const limitacoes = radarPortableActionableLimitations([
    ...(input.researchLimitations || []),
    ...(blueprint?.limitations || []),
    ...editorial.limitations,
  ]);
  return {
    blueprint, editorial, dna, serp, fontesExternas, linksDoPlano, keywords, seo, visual,
    video, especialista, serpObservada, lentes, concorrentes, autoridade, descoberta, prontidao, limitacoes,
    secoes: radarPortableFlatSections(editorial.sections),
    assunto: assuntoDe(input, editorial),
    /* 2026-10-02 · o tipo da unidade (artigo, landing page, página de serviço…), para as frases que dependem dele. */
    unidade: radarWritingUnitOf(input),
  };
}

/**
 * ===== O ASSUNTO DECLARADO — SDD do Assunto, F4.3 (P9) =====
 *
 * O tronco vem do ArticleDNA pelo contexto de pesquisa, e a virada (seção,
 * posição e complemento do H1) vem do artigo-modelo do Radar, como veio. O
 * export não recalcula nem decide nada: diz. Sem Assunto, `null`, e nenhuma
 * célula muda.
 */
type AssuntoDeEscrita = {
  phrase: string;
  note: string | null;
  destinationUrl: string | null;
  turn: RadarEditorialSubjectTurn | null;
};

function assuntoDe(input: RadarPortableExportInput, editorial: RadarPortableEditorial): AssuntoDeEscrita | null {
  const turn = editorial.subjectTurn ?? null;
  const doContexto = input.researchContext?.article.subject ?? null;
  const phrase = texto(turn?.phrase) || texto(doContexto?.phrase);
  if (!phrase) return null;
  return {
    phrase,
    note: texto(turn ? turn.note : doContexto?.note) || null,
    destinationUrl: texto(turn ? turn.destinationUrl : doContexto?.destinationUrl) || null,
    turn,
  };
}

export type RadarWritingProjections = ReturnType<typeof radarWritingProjections>;
type Projecoes = RadarWritingProjections;

/* ============================== o silo e os links ============================== */

type Membro = RadarSiloExportWritingContext["members"][number];

const rotuloDoMembro = (membro: Pick<Membro, "principalKeyword" | "title" | "slug">): string =>
  texto(membro.principalKeyword) || semMolduraDoTema(membro.title) || texto(membro.slug) || "artigo sem título conhecido";

/**
 * O DESTINO DE UM LINK, PELO SILO — só quando ele é inequívoco.
 *
 * O plano de links do Radar conhece a âncora e o nome do nó; o slug do irmão
 * está no silo. Cruzar os dois é o que a pessoa fazia à mão entre duas
 * colunas. A régua é conservadora: as palavras que DISTINGUEM (as que não são
 * do assunto do silo inteiro) precisam aparecer, e o melhor candidato precisa
 * ser único. Na dúvida, o destino fica "não resolvido" — e nunca inventado.
 */
function membroDoDestino(textos: readonly string[], membros: readonly Membro[], genericas: ReadonlySet<string>): Membro | null {
  const alvo = new Set(textos.flatMap(item => [...radarWritingContentWords(item)]));
  const distintivas = [...alvo].filter(palavra => !genericas.has(palavra));
  if (!distintivas.length) return null;
  let melhor: { membro: Membro; pontos: number } | null = null;
  let empate = false;
  for (const membro of membros) {
    const doMembro = radarWritingContentWords([membro.principalKeyword, semMolduraDoTema(membro.title), (membro.slug || "").replace(/-/g, " ")].join(" "));
    const pontos = distintivas.filter(palavra => doMembro.has(palavra)).length;
    if (!pontos) continue;
    if (!melhor || pontos > melhor.pontos) { melhor = { membro, pontos }; empate = false; } else if (pontos === melhor.pontos) empate = true;
  }
  return melhor && !empate ? melhor.membro : null;
}

type LinkDeEscrita = {
  rotulo: string;
  ancora: string;
  destino: string;
  onde: string | null;
  /** Outras âncoras aceitas para o mesmo destino: alternativa de texto, não lugar. */
  alternativas: string[];
  direcao: string | null;
  secao: string | null;
  /**
   * 2026-10-02 · O membro do Silo que o link alcança (`articleId`), quando o
   * destino foi resolvido. Nunca sai no CSV: serve para o "próximo passo do
   * leitor" saber se há link aprovado para o próximo artigo.
   */
  alvo?: string | null;
};

const DIRECAO: Record<string, string> = {
  PILLAR_TO_SUPPORT: "Pilar → Suporte",
  SUPPORT_TO_PILLAR: "Suporte → Pilar",
  SUPPORT_TO_SUPPORT: "Suporte → Suporte",
  ARTICLE_TO_SILO_PAGE: "Artigo → SiloPage",
};

/** A seção que um trecho de texto nomeia entre aspas, pela pergunta, pelo cabeçalho ou pelo candidato promovido. */
function secaoNomeada(onde: string, secoes: readonly RadarPortableSection[], serp: RadarPortableSerpEvidence): RadarPortableSection | null {
  const citado = onde.match(/["“]([^"”]+)["”]/)?.[1] || null;
  if (!citado) return null;
  const chave = radarWritingCompareKey(citado);
  const direta = secoes.find(secao => radarWritingCompareKey(secao.heading) === chave || radarWritingCompareKey(secao.readerQuestion) === chave);
  if (direta) return direta;
  const promovido = serp.editorialCandidates.find(item => radarWritingCompareKey(item.observedLabel) === chave && item.section);
  return promovido ? secoes.find(secao => secao.heading === promovido.section) ?? null : null;
}

function linksDeEscrita(p: Projecoes, contexto: RadarWritingArticleContext, principal: string | null): LinkDeEscrita[] {
  const silo = contexto.silo;
  const irmaos = (silo?.members || []).filter(membro => membro.articleId !== contexto.articleId);
  const pilar = irmaos.find(membro => membro.role === "Pilar") || null;
  const genericas = new Set([
    ...radarWritingContentWords(silo?.label),
    ...radarWritingContentWords(silo?.centralEntity),
    ...radarWritingContentWords(principal),
  ]);
  /*
   * 2026-10-08 · C9 · O DESTINO PLANEJADO É INSTRUÇÃO CONCLUÍDA E CONDICIONAL.
   * "Use o slug planejado" transformava caminho planejado em endereço publicado
   * (o link quebrava se este artigo fosse ao ar antes), e "marque a âncora" era
   * marcador por preencher. Agora: o link entra com a URL final quando o
   * destino estiver no ar junto com este artigo ou antes; senão, a âncora fica
   * como texto simples — nunca link quebrado.
   */
  const SE_NAO_PUBLICADO = "o link entra com a URL final quando o destino estiver no ar junto com este artigo ou antes; senão, a âncora fica como texto simples";
  const paginaDoSilo = silo?.siloPage || null;
  const destinoDaPagina = paginaDoSilo
    ? paginaDoSilo.publishedUrl || paginaDoSilo.canonical
      ? `SiloPage "${silo?.label}" → ${paginaDoSilo.publishedUrl || paginaDoSilo.canonical}${paginaDoSilo.publishedUrl ? "" : ` (${paginaDoSilo.status}: ${SE_NAO_PUBLICADO}; não invente outro endereço)`}`
      : `SiloPage "${silo?.label}"${paginaDoSilo.slug ? ` → /${paginaDoSilo.slug}` : ""} (${paginaDoSilo.status}: ${SE_NAO_PUBLICADO}; não invente URL)`
    : "SiloPage do Silo (endereço não registrado: a âncora fica como texto simples, sem link; não invente URL)";

  const destinoDoMembro = (membro: Membro | null, fallback: string | null, slugConhecido: string | null): string => {
    if (membro) {
      return `${membro.role} "${rotuloDoMembro(membro)}"${membro.slug ? ` → /${membro.slug}` : ""} (destino ainda não publicado: ${SE_NAO_PUBLICADO}; não invente URL)`;
    }
    if (slugConhecido) return `"${fallback || slugConhecido}" → /${slugConhecido} (destino ainda não publicado: ${SE_NAO_PUBLICADO}; não invente URL)`;
    return `"${fallback || "destino sem nome"}" (destino não resolvido: a âncora fica como texto simples, sem link; não invente URL)`;
  };

  const saida: LinkDeEscrita[] = [];
  const vistos = new Set<string>();
  const registrar = (link: Omit<LinkDeEscrita, "rotulo">) => {
    const chave = `${radarWritingCompareKey(link.ancora)}|${radarWritingCompareKey(link.destino)}`;
    if (vistos.has(chave)) return;
    vistos.add(chave);
    saida.push({ ...link, rotulo: `L${saida.length + 1}` });
  };

  /* O ponto sugerido pode nomear um assunto que o pacote manda NÃO cobrir. */
  const foraDoEscopo = new Set(p.serp.editorialCandidates.filter(item => item.verdict === "OUT_OF_SCOPE").map(item => radarWritingCompareKey(item.observedLabel)));
  const lugarForaDoEscopo = (lugar: string) => {
    const citado = radarWritingCompareKey(lugar.match(/["“]([^"”]+)["”]/)?.[1] || "");
    return Boolean(citado && foraDoEscopo.has(citado));
  };

  /* 1 · o plano de links que o Radar aplicou sobre o grafo aprovado. */
  for (const link of p.linksDoPlano) {
    const codigo = link.relationship.split(",")[0]?.trim() || "";
    const secao = secaoNomeada(link.placement, p.secoes, p.serp);
    const membro = codigo === "SUPPORT_TO_PILLAR" ? pilar : membroDoDestino([link.targetTitle, link.suggestedAnchor], irmaos, genericas);
    registrar({
      ancora: link.suggestedAnchor,
      destino: codigo === "ARTICLE_TO_SILO_PAGE" ? destinoDaPagina : destinoDoMembro(membro, link.targetTitle, link.targetSlug),
      onde: secao
        ? `seção "${secao.heading}"`
        : lugarForaDoEscopo(link.placement)
          ? `na seção que trata do assunto do destino (o ponto sugerido pela investigação está fora do escopo ${daUnidade(p.unidade).deste} ${p.unidade.noun})`
          : util(link.placement) ? cortar(link.placement, 140) : null,
      alternativas: [],
      direcao: DIRECAO[codigo] || null,
      secao: secao?.heading ?? null,
      alvo: codigo === "ARTICLE_TO_SILO_PAGE" ? null : membro?.articleId ?? null,
    });
  }

  /* 2 · os requisitos de link do ArticleDNA que o plano não trouxe. */
  for (const requisito of p.dna.internalLinkRequirements) {
    const partes = requisito.match(/^([A-Z_]+):\s*(.*)$/);
    if (!partes) continue;
    const codigo = partes[1];
    const bruto = partes[2] || "";
    /* Âncora que é endereço de nó não é âncora: fica de fora, e o destino também. */
    const ancoras = /[:/]|[0-9a-f]{8}-[0-9a-f]{4}/i.test(bruto) ? [] : bruto.split(",").map(item => item.trim()).filter(Boolean);
    if (!ancoras.length) continue;
    const jaCoberto = saida.some(link => ancoras.some(ancora => radarWritingCompareKey(link.ancora) === radarWritingCompareKey(ancora))
      || (codigo === "ARTICLE_TO_SILO_PAGE" && link.direcao === DIRECAO.ARTICLE_TO_SILO_PAGE)
      || (codigo === "SUPPORT_TO_PILLAR" && link.direcao === DIRECAO.SUPPORT_TO_PILLAR));
    if (jaCoberto) continue;
    const membro = codigo === "SUPPORT_TO_PILLAR" ? pilar : codigo === "ARTICLE_TO_SILO_PAGE" ? null : membroDoDestino(ancoras, irmaos, genericas);
    registrar({
      ancora: ancoras[0],
      destino: codigo === "ARTICLE_TO_SILO_PAGE" ? destinoDaPagina : destinoDoMembro(membro, ancoras[0], null),
      onde: null,
      alternativas: ancoras.slice(1, 4),
      direcao: DIRECAO[codigo] || null,
      secao: null,
      alvo: membro?.articleId ?? null,
    });
  }
  return saida;
}

/* ============================== a autoridade ============================== */

const YMYL: Record<string, string> = { NONE: "nenhuma", LOW: "baixa", MATERIAL: "material", HIGH: "alta" };
const YMYL_SENSIVEL = new Set(["MATERIAL", "HIGH"]);

type Afirmacao = RadarAuthorityEvidence["claims"][number];

export function radarWritingUnsupportedClaims(autoridade: RadarAuthorityEvidence | null, serp: RadarPortableSerpEvidence): Array<{ afirmacao: string; mercado: string | null }> {
  if (autoridade) {
    const sustentadas = new Set(autoridade.factualEvidence.filter(item => item.supportType === "SUPPORTS").map(item => item.claimId));
    return autoridade.claims
      .filter((claim: Afirmacao) => radarClaimNeedsFactualSupport(claim) && !sustentadas.has(claim.claimId))
      .map(claim => ({ afirmacao: claim.canonicalClaim, mercado: `${claim.market.competitors} de ${claim.market.sampleSize} páginas tratam` }));
  }
  return serp.authorityClaims.filter(item => item.ymylRelevant).map(item => ({ afirmacao: item.claim, mercado: null }));
}

function temaSensivel(p: Projecoes): boolean {
  const ymyl = p.autoridade?.ymylAssessment;
  if (ymyl && YMYL_SENSIVEL.has(ymyl.relevance)) return true;
  if (p.autoridade?.claims.some(claim => YMYL_SENSIVEL.has(claim.ymyl.relevance))) return true;
  return p.serp.authorityClaims.some(item => item.ymylRelevant);
}

/**
 * O PACOTE SE CONTRADIZ SOBRE YMYL? Isso vira conflito DITO, e não escolha.
 *
 * "Relevância baixa" no artigo e afirmação de saúde sem fonte no mesmo pacote
 * são duas conclusões gravadas. O export não decide qual vale (invariante 30):
 * diz as duas, e manda tratar pela mais restritiva até o Radar resolver.
 */
function conflitoDeYmylDetalhado(p: Projecoes): { texto: string; nomeadas: string[] } | null {
  const ymyl = p.autoridade?.ymylAssessment;
  if (!ymyl || YMYL_SENSIVEL.has(ymyl.relevance)) return null;
  const sensiveis = [
    ...(p.autoridade?.claims.filter(claim => YMYL_SENSIVEL.has(claim.ymyl.relevance)).map(claim => claim.canonicalClaim) || []),
    ...p.serp.authorityClaims.filter(item => item.ymylRelevant).map(item => item.claim),
  ];
  const unicas = unicosPorChave(sensiveis, radarWritingCompareKey);
  if (!unicas.length) return null;
  const quantas = unicas.length === 1 ? "uma afirmação sensível que pede fonte" : `${unicas.length} afirmações sensíveis que pedem fonte`;
  const nomeadas = unicas.slice(0, 2);
  return {
    texto: `o pacote registra YMYL ${YMYL[ymyl.relevance] || ymyl.relevance} e também ${quantas} (${nomeadas.map(entreAspas).join(", ")}); trate como tema sensível até o Radar resolver`,
    nomeadas: nomeadas.map(radarWritingCompareKey),
  };
}

const conflitoDeYmyl = (p: Projecoes): string | null => conflitoDeYmylDetalhado(p)?.texto ?? null;

/* ============================== o especialista ============================== */

type TipoDoParecer = "FECHAMENTO" | "CTA" | "DIRETRIZ";
export type RadarWritingSpecialistContribution = Contribuicao;
type Contribuicao = { rotulo: string; linha: string; aviso: string | null; secao: string | null; tipo: TipoDoParecer | null; resposta: string };

/*
 * A VOZ DO ESPECIALISTA NA VIRADA FINAL E NO CTA (SDD diretriz editorial, 2026-10-02).
 *
 * O parecer direto de fechamento, de CTA ou de diretriz tem lugar certo no
 * artigo. Sem o tipo, ele ia para a coluna de fontes como "sem ponto de
 * aplicação" e o fecho continuava derivado de um cabeçalho de concorrente.
 */
/* 2026-10-02 · o lugar do parecer na unidade que a linha descreve: "fechamento do artigo", "fechamento da landing page". */
const aplicacaoDoTipo = (tipo: TipoDoParecer, unidade: RadarWritingUnit): string => {
  const formas = daUnidade(unidade);
  if (tipo === "FECHAMENTO") return `fechamento ${formas.do} ${unidade.noun} (virada final)`;
  if (tipo === "CTA") return "chamada final (CTA)";
  return `${formas.o} ${unidade.noun} inteir${formas.terminacao} (diretriz)`;
};
const tipoDoParecer = (kind: string | null | undefined): TipoDoParecer | null =>
  kind === "FECHAMENTO" || kind === "CTA" || kind === "DIRETRIZ" ? kind : null;
const vozDoEspecialista = (especialista: readonly Contribuicao[], tipo: TipoDoParecer) => especialista.filter(item => item.tipo === tipo);
const falaDoEspecialista = (item: Contribuicao) => `${entreAspas(item.resposta)} (${item.rotulo}; atribuir como fala do especialista, sem inventar nome ou credencial)`;

export function radarWritingSpecialistContributions(p: Projecoes): Contribuicao[] {
  if (p.especialista.state !== "RECEIVED") return [];
  return p.especialista.items.filter(item => item.approved).map((item, indice) => {
    const pergunta = texto(item.requirementQuestion) || texto(item.questionsSent[0]) || null;
    const assunto = p.autoridade?.specialistReviewRequirements.find(ponto => pergunta && radarWritingCompareKey(ponto.specificQuestion).includes(radarWritingCompareKey(pergunta).slice(0, 40)))?.topic
      || item.questionsSent.map(frase => frase.match(/["“]([^"”]+)["”]/)?.[1]).find(Boolean)
      || null;
    const resposta = item.contribution.length > RADAR_WRITING_EXPORT_LIMITS.specialistAnswerChars
      ? `${item.contribution.slice(0, RADAR_WRITING_EXPORT_LIMITS.specialistAnswerChars - 3).trimEnd()} […]`
      : item.contribution;
    const tipo = tipoDoParecer(item.kind);
    const aplicacao = tipo ? aplicacaoDoTipo(tipo, p.unidade) : ehPreenchimento(item.appliesTo) || /ainda n[aã]o definida/i.test(item.appliesTo) ? null : texto(item.appliesTo);
    const secao = aplicacao && !tipo ? p.secoes.find(secao => {
      const alvo = radarWritingContentWords(aplicacao);
      const cab = radarWritingContentWords(`${secao.heading} ${secao.readerQuestion || ""}`);
      return [...alvo].filter(palavra => cab.has(palavra)).length >= Math.max(1, Math.ceil(alvo.size / 2));
    }) ?? null : null;
    /*
     * A CONTRIBUIÇÃO ACEITA NÃO É DESCARTADA — ela sai com o aviso.
     *
     * Um humano a aceitou (AGENTS §9). Se a resposta não fala do assunto da
     * pergunta, ou não tem ponto de aplicação, quem escreve precisa saber
     * antes de usar: descartar em silêncio apagaria uma decisão humana.
     */
    const avisos: string[] = [];
    const doAssunto = radarWritingContentWords(assunto);
    /*
     * 2026-10-08 (correção da revisão) · D10: "conferir antes de usar" e "a
     * definir" eram espera aberta no entregável. O aviso diz o que fazer com a
     * contribuição, concluído.
     */
    if (!tipo && doAssunto.size && ![...doAssunto].some(palavra => radarWritingContentWords(item.contribution).has(palavra))) {
      avisos.push(`aceita, mas a resposta não trata de ${entreAspas(assunto || "")}: use só como orientação geral, sem apresentá-la como resposta a essa pergunta`);
    }
    if (!aplicacao) avisos.push("sem ponto de aplicação no pacote: entra onde couber, como orientação");
    avisos.push(...item.limitations.map(semPontoFinal));
    const rotulo = `E${indice + 1}`;
    return {
      rotulo,
      secao: secao?.heading ?? null,
      tipo,
      resposta,
      aviso: avisos.length ? avisos.join("; ") : null,
      linha: [
        `${rotulo} · Pergunta: ${entreAspas(assunto || pergunta || "ponto preparado pela investigação")}`,
        `Resposta aprovada: ${entreAspas(resposta)}`,
        `Aplicar em: ${secao ? `seção "${secao.heading}"` : aplicacao || "onde couber no texto, como orientação"}`,
        `Atribuir como: ${semPontoFinal(item.classification).toLowerCase()} de especialista, sem inventar nome ou credencial`,
        ...(avisos.length ? [`Atenção: ${avisos.join("; ")}`] : []),
      ].join(" · "),
    };
  });
}

/* ============================== as colunas do artigo ============================== */

/**
 * ===== O FAQ LEGADO, NUMA FRASE SÓ (AGENTS §13 — 2026-10-02) =====
 *
 * O arquivo dizia o FAQ de três jeitos: "manter como está, sem ampliar nem
 * remover" na regra geral e na linha do publicado, e "mantenha a seção de
 * perguntas existente" no prompt — e nenhum dizia que o FAQ legado pode sair
 * com decisão humana. A regra é uma: FAQ não integra o fluxo novo; o legado da
 * página publicada não é removido automaticamente, só com decisão humana
 * registrada, e aí as respostas úteis vão para o corpo. A MESMA frase vai à
 * regra geral, à linha do publicado e ao prompt, para qualquer tipo de página.
 */
export const RADAR_WRITING_LEGACY_FAQ = "FAQ legado de página publicada: mantenha como está, sem ampliar; ele não integra o fluxo novo, mas só sai com decisão humana registrada (por exemplo, reescrita integral autorizada pela marca), e então as respostas úteis vão para o corpo das seções.";

/*
 * ===== 2026-10-08 · C2 · O MAPA DA ATUALIZAÇÃO, NO LUGAR DA PENDÊNCIA =====
 *
 * A linha dizia "seção existente que a planta não tem só sai com decisão
 * humana — leve-a como pendência fora do texto": espera aberta no entregável
 * (D10), e nenhuma resposta sobre o que fazer com cada H2 publicado. Agora cada
 * H2 tem destino, pela leitura do mapa do artigo-modelo
 * (`radarArticleBlueprintPublishedMapReading`): vira a seção N da planta
 * (reescrito na voz), vai para o fechamento, fica como seção própria depois da
 * seção N, ou sai com o motivo que a planta registrou. O artigo-modelo antigo
 * (sem `publishedMap`) é lido pelo casamento de títulos, conservador: o H2 sem
 * par FICA — nada sai sem decisão. O FAQ legado segue a regra dele. Sem
 * artigo-modelo, a regra concluída: o que a página cobre fica, reescrito.
 */
const RADAR_WRITING_UPDATE_WITHOUT_BLUEPRINT = "Atualização: o que a página já cobre fica no texto, reescrito na voz e reordenado se preciso; a seção publicada que a estrutura sugerida não tem fica como seção própria. Nada sai da página sem decisão humana registrada.";

/** 2026-10-08 · C2 · O destino de um H2 publicado; o "depois da seção N" diz também o título da seção N. */
function destinoDoH2(item: RadarArticleBlueprintPublishedMapReading, secoes: ReadonlyArray<{ h2: string }>): string {
  const frase = radarArticleBlueprintPublishedMapLine(item);
  const depois = item.kind === "KEEP" && item.after ? secoes[item.after - 1]?.h2 : null;
  return depois ? `${frase} (${entreAspas(depois)})` : frase;
}

function linhasDaAtualizacao(atual: { h1: string | null; h2: string[] }, planta: RadarArticleBlueprintPayload | null, keywords: readonly string[], lida = "lida da página na exportação"): string[] {
  const titulo = `Estrutura publicada atual (${lida}): H1 ${entreAspas(atual.h1 || "sem H1 legível")}`;
  if (!atual.h2.length) return [`${titulo}; nenhum H2 legível.`];
  const leitura = planta ? radarArticleBlueprintPublishedMapReading(planta, atual.h2, { keywords }) : [];
  if (!planta || !leitura.length) {
    return [`${titulo}; ${atual.h2.length} H2: ${atual.h2.map(item => entreAspas(cortar(item, 80))).join(" · ")}.`, RADAR_WRITING_UPDATE_WITHOUT_BLUEPRINT];
  }
  const faq = unicosPorChave(atual.h2.filter(item => EH_FAQ.test(item)), radarWritingCompareKey);
  return [
    `${titulo}; ${atual.h2.length} H2.`,
    "Atualização: cada H2 publicado tem destino na planta do artigo-modelo (coluna estrutura); nada sai da página sem decisão registrada no artigo-modelo:",
    ...leitura.map(item => `- ${entreAspas(cortar(item.current, 80))} → ${destinoDoH2(item, planta.blueprint.sections)}`),
    ...faq.map(item => `- ${entreAspas(cortar(item, 80))} → FAQ legado: segue a regra do FAQ legado, abaixo`),
  ];
}

/* 2026-10-08 · As keywords do artigo (principal, complementares e Assunto), sem vazio: não distinguem um título do outro. */
const keywordsDoArtigo = (p: Projecoes): string[] => nucleoDoArtigo(p).map(valor => texto(valor)).filter(Boolean);

function colunaArtigo(input: RadarPortableExportInput, p: Projecoes, contexto: RadarWritingArticleContext, papel: string | null): string {
  const principal = texto(p.dna.principalKeyword);
  const volumes = new Map<string, RadarPortableKeywordDna>(p.keywords.map(item => [radarWritingCompareKey(item.keyword), item]));
  const comoUsar = (papelDaKeyword: "SECONDARY" | "NARRATIVE") => (papelDaKeyword === "SECONDARY"
    ? "faceta da mesma intenção: cabeçalho ou dentro da seção que trata do assunto"
    : "reforço no corpo, sem seção própria");
  const complementares = unicosPorChave([
    ...p.dna.secondaryKeywords.map(keyword => ({ keyword, papel: "SECONDARY" as const })),
    ...p.dna.narrativeReinforcements.map(keyword => ({ keyword, papel: "NARRATIVE" as const })),
  ], item => radarWritingCompareKey(item.keyword)).filter(item => radarWritingCompareKey(item.keyword) !== radarWritingCompareKey(principal));
  const chavesDasKeywords = new Set([principal, ...complementares.map(item => item.keyword)].map(radarWritingCompareKey));
  const coberturaAlem = p.dna.mustCover.filter(item => !chavesDasKeywords.has(radarWritingCompareKey(item)));
  const intencao = intencaoLegivel(p.dna.intent);
  const funil = legivelOuNulo(p.dna.funnel);
  const publicacao = contexto.publication;
  const publicado = Boolean(publicacao?.published || input.article.publishedProtected);
  const slug = texto(publicacao?.slug) || texto(input.article.slug);

  const linhas = [
    `Keyword principal: ${principal || "não resolvida no pacote"}`,
    ...(p.assunto ? [`Assunto (tronco): ${p.assunto.phrase}`] : []),
    ...(complementares.length
      ? ["Keywords complementares:", ...complementares.map(item => {
        const volume = volumes.get(radarWritingCompareKey(item.keyword))?.volume;
        return `- ${item.keyword}${typeof volume === "number" ? ` · ${numeroBr(volume)}/mês` : ""} · ${comoUsar(item.papel)}`;
      })]
      : []),
    ...(coberturaAlem.length ? [`Cobertura obrigatória: ${coberturaAlem.join(" · ")}`] : []),
    ...(intencao ? [`Intenção: ${[intencao, funil].filter(Boolean).join(" · ")}`] : []),
    ...(papel ? [`Papel no Silo: ${papel}${O_QUE_O_PAPEL_PEDE[papel] ? ` — ${O_QUE_O_PAPEL_PEDE[papel]}` : ""}`] : []),
    ...(formatoLegivel(input, p.editorial) ? [`Formato: ${formatoLegivel(input, p.editorial)}`] : []),
    ...(slug ? [`Slug: ${slug}`] : []),
  ];

  /*
   * ARTIGO PUBLICADO (AGENTS §11): URL, slug, canonical e o estado da
   * principal saem SEMPRE — inclusive o "desconhecido". Omitir a política
   * ausente liberaria a troca da principal em silêncio.
   */
  if (publicado) {
    const url = texto(publicacao?.publishedUrl);
    const canonical = texto(publicacao?.canonical) || texto(input.article.canonical);
    const politica = radarWritingCompareKey(publicacao?.principalPolicy);
    linhas.push(
      `Publicado: ${url || "sim (URL publicada não registrada no pacote)"} — preservar URL, slug e canonical`,
      /* 2026-10-02 · a estrutura atual da página, lida na exportação: a atualização parte dela. 2026-10-08 · C2 · com o destino de cada H2. */
      ...(publicacao?.currentStructure
        ? linhasDaAtualizacao(publicacao.currentStructure, contexto.blueprint ?? null, keywordsDoArtigo(p))
        /* 2026-10-08 · C2 · sem a leitura de agora, a página que o artigo-modelo viu ao ser montado (com o mapa dele). */
        : contexto.blueprint?.publishedStructure?.h2.length
          ? linhasDaAtualizacao(contexto.blueprint.publishedStructure, contexto.blueprint, keywordsDoArtigo(p), "lida ao montar o artigo-modelo")
          : []),
      `Canonical: ${canonical || "não registrado no pacote; não criar um novo"}`,
      politica === "locked"
        ? "Principal: travada — não trocar"
        : politica === "revisable"
          ? "Principal: revisável — só troca com decisão humana no Arquiteto, nova versão e histórico"
          : "Principal: estado desconhecido — não trocar até decisão humana",
      RADAR_WRITING_LEGACY_FAQ,
    );
  } else if (texto(input.article.canonical)) {
    linhas.push(`Canonical: ${texto(input.article.canonical)}`);
  }

  if (contexto.siloInline) linhas.push(...siloNaLinha(contexto));
  if (input.authors !== undefined && input.authors !== null) linhas.push(linhaDeAutoria(input.authors, p.unidade));
  linhas.push(`Não altere: ${naoAltere(publicado, p.assunto).join("; ")}.`);
  return linhas.join("\n");
}

/**
 * QUEM ASSINA (E-E-A-T) — o especialista da aba Especialista (pedido do dono, 2026-10-02).
 * Vale para qualquer artigo ou página: o nome cadastrado, sem credencial além da especialidade.
 */
export function radarWritingAuthorLine(autores: ReadonlyArray<{ name: string; specialty: string | null; source: string }>, unidade: RadarWritingUnit = ARTIGO_COMO_UNIDADE): string {
  /* 2026-10-02 · `unidade` é opcional: sem ela (ou artigo), as frases de antes; com landing page, "assina a landing page". */
  const formas = daUnidade(unidade);
  if (!autores.length) return `Autoria (E-E-A-T): nenhum especialista definido para ${formas.este} ${unidade.noun} na aba Especialista do Radar; defina quem assina antes de publicar. Não invente autor.`;
  const nomes = autores.map(autor => `${autor.name}${autor.specialty ? ` (${autor.specialty})` : ""}`).join(" e ");
  return autores.every(autor => autor.source === "only_active")
    ? `Autoria (E-E-A-T): ${nomes}, único especialista ativo da marca (aba Especialista); confirme antes de publicar. Não acrescente credencial além do cadastro.`
    : `Autoria (E-E-A-T): ${nomes}, especialista da aba Especialista; assina ${formas.o} ${unidade.noun} e é a voz das falas atribuídas. Não acrescente credencial além do cadastro.`;
}
const linhaDeAutoria = radarWritingAuthorLine;

/**
 * O SILO NA LINHA DO ARTIGO (2026-10-02, pedido do dono).
 *
 * "Só os selecionados" saía "sem o contexto do Silo": sem ordem narrativa, sem
 * SiloPage, sem os irmãos que os links pedem. Quando a seleção cruza Silos, o
 * contexto de cada um vai na linha do próprio artigo, curto.
 */
function siloNaLinha(contexto: RadarWritingArticleContext): string[] {
  const silo = contexto.silo;
  if (!silo || silo.kind !== "silo") return ["Silo: sem silo resolvido no Radar; escreva sem pressupor ordem narrativa nem irmãos."];
  const pagina = silo.siloPage;
  const endereco = pagina ? pagina.publishedUrl || pagina.canonical || (pagina.slug ? `/${pagina.slug}` : null) : null;
  return [
    /* 2026-10-08 · D10: o estado do Silo dito sem "rascunho" (a composição continua podendo mudar). */
    `Silo: ${silo.label}${silo.draft ? " (em formação no Arquiteto: a composição pode mudar)" : ""}`,
    ...(util(silo.centralEntity) ? [`Tema central do Silo: ${silo.centralEntity}`] : []),
    ...(pagina ? [`SiloPage: ${endereco || "endereço não registrado"} (${pagina.status})`] : []),
    ...(silo.excludedTopics.length ? [`Fora do Silo (não cobrir): ${silo.excludedTopics.join(" · ")}`] : []),
    "Ordem narrativa do Silo:",
    ...silo.members.map(membro => `${membro.position} · ${papelLegivel(membro.role) || membro.role} · ${rotuloDoMembro(membro)}${membro.slug ? ` · /${membro.slug}` : ""}${membro.articleId === contexto.articleId ? " · ESTE ARTIGO" : membro.inThisFile ? " · neste arquivo" : ` · ${membro.statusLabel}`}`),
  ];
}

/**
 * AS DECISÕES PROTEGIDAS — as mesmas proibições que o Redator recebe
 * (`RADAR_WRITER_MAY_NOT`), em frase curta. A lista vem de lá: uma proibição
 * nova no Redator aparece aqui sem ninguém lembrar de copiar. Com Assunto
 * declarado, a lista é a de `radarWriterMayNotFor`, com a proibição dele.
 */
function naoAltere(publicado: boolean, assunto: Pick<AssuntoDeEscrita, "phrase"> | null = null): string[] {
  const curtas: Record<string, string> = {
    "trocar a keyword principal": "a keyword principal",
    "reconfigurar o Silo": "a configuração do Silo",
    "remover uma cobertura obrigatória": "a cobertura obrigatória (não remova nenhuma)",
    "alterar a intenção declarada do artigo": "a intenção declarada",
    "alterar slug protegido": "o slug",
    "alterar canonical protegido": "o canonical",
    "substituir a composição de secundárias por decisão própria": "a composição de keywords complementares",
    [RADAR_WRITER_MAY_NOT_SUBJECT]: "o Assunto declarado (não troque nem remova)",
  };
  const itens = radarWriterMayNotFor(assunto).map(proibicao => curtas[proibicao] || proibicao);
  return [...itens.slice(0, 1), "o papel no Silo", ...itens.slice(1), ...(publicado ? ["a URL publicada"] : [])];
}

/*
 * 2026-10-02 · O PRÓXIMO PASSO DO LEITOR NUNCA INVENTA LINK. Sem link aprovado
 * no plano para aquele destino, a frase diz isso — o texto pode citar o próximo
 * conteúdo, mas o link é do Arquiteto.
 */
export const RADAR_WRITING_NO_APPROVED_LINK = "(sem link aprovado no grafo: cite sem link ou peça ao Arquiteto; não crie o link)";

/**
 * ===== 2026-10-08 · C4 · A TRAVA DE FONTE NO CSV PARA ESCREVER =====
 *
 * O CSV de vídeo já tirava do texto publicável a frase que só entra com fonte;
 * o CSV para escrever não marcava nada ("O CSV 'Para escrever' não muda", no
 * catálogo). Agora a frase que a régua por sentido (`radarSentenceNeedsSource`)
 * reprova leva o rótulo da regra geral 5 — "(precisa de fonte: …)" — e quem
 * escreve a sustenta com fonte do pacote, a delimita ou a omite. A tese que
 * NEGA o efeito ("o Instagram, sozinho, não enche a agenda") passa.
 */
export function radarWritingSourceMark(frase: string, veredito: Pick<RadarSentenceSourceVerdict, "needs" | "label">): string {
  if (!veredito.needs || !veredito.label) return frase;
  const corpo = frase.trim();
  const comPonto = corpo.endsWith(".");
  return `${corpo.replace(/[.;:\s]+$/, "")} (precisa de fonte: ${veredito.label})${comPonto ? "." : ""}`;
}

function colunaPromessa(input: RadarPortableExportInput, p: Projecoes, contexto: RadarWritingArticleContext, perguntaDeAbertura: string | null, especialista: readonly Contribuicao[] = [], links: readonly LinkDeEscrita[] = []): string {
  const promessa = util(p.editorial.readerPromise) || util(semMolduraDoTema(input.article.promise) === texto(input.article.promise) ? input.article.promise : null);
  const leitor = util(input.article.audience);
  const direcaoDaAbertura = util(p.editorial.openingOrHook);
  const fechamento = util(p.editorial.conclusion);
  const chamada = util(p.editorial.cta);
  const silo = contexto.silo;
  const eu = silo?.members.find(membro => membro.articleId === contexto.articleId) || null;
  const proximo = eu && silo ? silo.members.find(membro => membro.position === eu.position + 1) || null : null;
  const linkParaOProximo = Boolean(proximo?.articleId) && links.some(link => link.alvo === proximo?.articleId);
  const linkParaAPagina = links.some(link => link.direcao === DIRECAO.ARTICLE_TO_SILO_PAGE);
  /* 2026-10-08 · C4 · promessa, abertura, fechamento e chamada: a frase que só entra com fonte leva a marca (a tese que nega passa). */
  const pendentes = radarPendingClaims(p, null);
  const comuns = radarClaimCommonStems(p, null);
  const comFonte = (frase: string) => radarWritingSourceMark(frase, radarSentenceNeedsSource(frase, { pendentes, comuns }));
  const depois = silo
    ? [
      ...(proximo ? [`o próximo artigo do Silo, ${entreAspas(rotuloDoMembro(proximo))}${linkParaOProximo ? "" : ` ${RADAR_WRITING_NO_APPROVED_LINK}`}`] : []),
      ...(silo.siloPage ? [`a SiloPage "${silo.label}"${linkParaAPagina ? "" : ` ${RADAR_WRITING_NO_APPROVED_LINK}`}`] : []),
    ]
    : [];
  const linhas = [
    ...(promessa ? [`Promessa: ${comFonte(comPontoFinal(promessa))}`] : []),
    ...(leitor ? [`Leitor: ${comPontoFinal(leitor)}`] : []),
    ...linhasDoTronco(p),
    ...(perguntaDeAbertura ? [`Abertura: responder ${entreAspas(perguntaDeAbertura)} logo no primeiro parágrafo, de forma direta, antes de contextualizar.`] : []),
    ...(direcaoDaAbertura ? [`Direção da abertura: ${comFonte(comPontoFinal(direcaoDaAbertura))}`] : []),
    ...(vozDoEspecialista(especialista, "DIRETRIZ").map(item => `Diretriz do especialista (vale para ${daUnidade(p.unidade).o} ${p.unidade.noun} inteir${daUnidade(p.unidade).terminacao}): ${falaDoEspecialista(item)}.`)),
    ...(vozDoEspecialista(especialista, "FECHAMENTO").length
      ? vozDoEspecialista(especialista, "FECHAMENTO").map(item => `Fechamento — virada final na voz do especialista: ${falaDoEspecialista(item)}.`)
      : fechamento ? [`Fechamento: ${comFonte(comPontoFinal(fechamento))}`] : []),
    ...(vozDoEspecialista(especialista, "CTA").length
      ? vozDoEspecialista(especialista, "CTA").map(item => `Chamada final — argumento do especialista: ${falaDoEspecialista(item)}.`)
      : chamada ? [`Chamada final: ${comFonte(comPontoFinal(chamada))}`] : []),
    ...linhaDoDestino(p),
    ...(depois.length ? [`Próximo passo do leitor: ${depois.join(" ou ")}.`] : []),
  ];
  return linhas.join("\n");
}

/**
 * O TRONCO E A VIRADA (F4.3), antes da abertura. O lugar diz o mesmo que a
 * coluna `estrutura`: o bloco da amostra que já trata o Assunto, a posição
 * que o Radar sugeriu, ou o anfitrião onde a virada ficou como ponto a cobrir.
 * Só sem nada disso a posição fica com quem redige, e isso é dito.
 */
function linhasDoTronco(p: Projecoes): string[] {
  const assunto = p.assunto;
  if (!assunto) return [];
  const principal = texto(p.dna.principalKeyword);
  const posicao = assunto.turn?.suggestedPosition ?? null;
  const secao = assunto.turn?.turnSection ?? null;
  const contagem = secao ? `${secao.pages} de ${secao.sampleSize} página(s)` : "";
  const onde = secao?.source === "OBSERVED_GROUP"
    ? secao.placement === "COVERAGE_POINT" && secao.hostHeading
      ? `em ${entreAspas(secao.hostHeading)}, como ponto a cobrir (a amostra trata o Assunto em ${contagem})`
      : `na seção ${entreAspas(secao.heading)} (a amostra já trata o Assunto em ${contagem})`
    : posicao
      ? `depois de ${entreAspas(posicao.afterHeading)}`
      : secao?.placement === "COVERAGE_POINT" && secao.hostHeading
        ? `como ponto a cobrir em ${entreAspas(secao.hostHeading)} (lugar deixado pelo Radar sem sinal na SERP; quem redige pode mudar)`
        : "onde quem redige decidir (sem sinal na SERP)";
  return [
    comPontoFinal(`Tronco (Assunto): ${assunto.phrase}${assunto.note ? ` — ${semPontoFinal(assunto.note)}` : ""}`),
    `Virada: ${onde}, levar o leitor ${principal ? `de ${principal}` : "da keyword principal"} a ${assunto.phrase}${assunto.destinationUrl ? `; destino: ${assunto.destinationUrl}` : ""}.`,
  ];
}

/** Sem sinal na SERP, a linha do H1 devolve a decisão a quem redige. */
export const RADAR_WRITING_SUBJECT_H1_NO_SIGNAL = "Assunto no H1: sem sinal na SERP, quem redige decide. O H1 é da principal.";

/**
 * A DIREÇÃO DO H1 COM ASSUNTO (F4.3), conforme a sugestão do Radar: o
 * complemento só quando a amostra põe o Assunto nos títulos; "H2/H3" só quando
 * a amostra o trata em H2/H3 de pelo menos uma página; em todo o resto (sem
 * leitura, ou 0 de N), a decisão volta a quem redige — "sem sinal" nunca vira
 * "Assunto em H2/H3" (F3.1). A principal continua dona do H1 em todos os casos.
 */
function linhaDoH1(p: Projecoes): string[] {
  const assunto = p.assunto;
  if (!assunto) return [];
  const complemento = assunto.turn?.h1Complement ?? null;
  const principal = texto(p.dna.principalKeyword) || "keyword principal";
  if (complemento?.suggested) {
    return [`Direção do H1: ${principal} + complemento "${semPontoFinal(complemento.complement || assunto.phrase)}" (sugestão do Radar; a decisão é de quem redige).`];
  }
  if ((complemento?.headingPages ?? 0) > 0) return ["Assunto em H2/H3 — o H1 é da principal."];
  return [RADAR_WRITING_SUBJECT_H1_NO_SIGNAL];
}

/**
 * A DIREÇÃO PARA O DESTINO, AO LADO DA CHAMADA FINAL (F3.1): a chamada
 * observada continua como veio, e o destino declarado do Assunto fica na linha
 * de baixo — o link é do fecho, não só da virada.
 */
function linhaDoDestino(p: Projecoes): string[] {
  const destino = p.assunto?.destinationUrl;
  if (!destino) return [];
  return [`Destino da chamada: ${comPontoFinal(p.editorial.ctaDestination || radarSubjectCtaDirection(destino))}`];
}

/**
 * O TÍTULO GRAVADO É UTILIZÁVEL?
 *
 * O gerador antigo emendava assuntos: "Como cuidar de uma pele oleosa: pele
 * oleosa e acne e skincare para pele oleosa: como fazer…". O export não
 * reescreve o título: ele o omite e diz por quê. A régua é estreita — longo E
 * (dois ou mais dois-pontos OU a principal repetida) —, para não descartar um
 * título legítimo.
 */
export function radarWritingTitleIsUsable(titulo: string | null | undefined, principal: string | null | undefined): boolean {
  const limpo = texto(titulo);
  if (!limpo) return false;
  if (limpo.length <= 90) return true;
  const doisPontos = (limpo.match(/:/g) || []).length;
  const chave = radarWritingCompareKey(principal);
  const repeticoes = chave ? radarWritingCompareKey(limpo).split(chave).length - 1 : 0;
  return !(doisPontos >= 2 || repeticoes >= 2);
}

function colunaTitulo(input: RadarPortableExportInput, p: Projecoes): { celula: string; tituloInutil: boolean } {
  const principal = p.dna.principalKeyword;
  const titulo = radarWritingTitleIsUsable(p.editorial.title, principal) ? p.editorial.title : null;
  const tituloInutil = Boolean(p.editorial.title) && !titulo;
  const alternativas = p.editorial.alternateTitles.filter(item => radarWritingTitleIsUsable(item, principal)).slice(0, 2);
  const direcao = util(p.blueprint?.profile === "GOOGLE" ? p.blueprint.recommended.titleDirection?.statement : null) || util(p.seo.seoTitleDirection);
  const restricoes = unicosPorChave(p.seo.metaDescriptionDirection.constraints.filter(item => !ehPreenchimento(item)), radarWritingCompareKey);
  const restricaoFalaDaPromessa = restricoes.some(item => /promessa/i.test(item));
  const slug = texto(input.article.slug);
  const linhas = [
    titulo
      ? `H1 de trabalho: ${titulo}`
      : `H1 de trabalho: não definido — formule a partir da promessa e da estrutura, com a keyword principal${principal ? ` ("${principal}")` : ""}.`,
    ...(alternativas.length ? [`Alternativas: ${alternativas.join(" · ")}`] : []),
    ...linhaDoH1(p),
    ...(direcao ? [`Direção de título: ${comPontoFinal(direcao)}`] : []),
    /* 2026-10-08 (correção da revisão) · D10: "a definir" virou a instrução concluída de escrever. */
    p.seo.seoTitle ? `SEO title: ${p.seo.seoTitle}` : "SEO title: escreva com cerca de 60 caracteres, com a keyword principal, sem copiar título de concorrente.",
    p.seo.metaDescription
      ? `Meta description: ${p.seo.metaDescription}`
      : `Meta description: escreva com cerca de 155 caracteres${restricaoFalaDaPromessa ? "" : ", refletindo a promessa"}${restricoes.length ? `. ${restricoes.map(semPontoFinal).join("; ")}` : ""}.`,
    ...(slug ? [`Slug (conferir o alinhamento com a principal): ${slug}`] : []),
  ];
  return { celula: linhas.join("\n"), tituloInutil };
}

/* ------------------------------ a estrutura ------------------------------ */

const OBRIGATORIO_PADRAO = /o articledna declara/i;

/*
 * O motivo do Assunto começa como o padrão ("O ArticleDNA declara…"), mas é
 * PRÓPRIO: diz por que a seção é exigida. Ele sai na marcação, e o ponto
 * "virada para <Assunto>" vai à frente dos outros pontos da seção.
 */
/** "Virada para <Assunto>" é o nome da seção no Radar, não um título para publicar. */
export const RADAR_WRITING_SUBJECT_WORKING_TITLE = "- Título de trabalho do Radar: reescreva para o leitor antes de publicar.";

const motivoProprio = (motivo: string) => motivo === RADAR_SUBJECT_MUST_COVER_REASON || !OBRIGATORIO_PADRAO.test(motivo);
const VIRADA = /^virada para /i;

function colunaEstrutura(
  input: RadarPortableExportInput,
  p: Projecoes,
  links: readonly LinkDeEscrita[],
  especialista: readonly Contribuicao[],
  imagens: ReadonlyMap<string, string>,
  videos: ReadonlyMap<string, string[]>,
  tocaForaDoEscopo: (valor: string | null | undefined) => boolean = () => false,
): { celula: string; faqOmitidas: number } {
  const secoes = p.editorial.sections;
  if (!secoes.length) return { celula: "", faqOmitidas: 0 };
  let faqOmitidas = 0;
  let retoricasOmitidas = 0;
  /*
   * 2026-10-02 · FECHO RETÓRICO DE CONCORRENTE NÃO É SEÇÃO NEM PERGUNTA. Um
   * "Aprendeu como…?" como cabeçalho sai da ordem sugerida (e isso é dito);
   * como pergunta da seção, a seção volta a se guiar pelo objetivo. Ponto a
   * cobrir que toca o "não cobrir" também sai — exceto o que o ArticleDNA
   * exige e a virada do Assunto, que nunca saem por esta régua.
   */
  const obrigatorios = new Set(p.dna.mustCover.map(radarWritingCompareKey));
  /*
   * 2026-10-02 · na estrutura, a régua é a da ESTRUTURA (revisão da frente):
   * chamada para ação ("Pronto para agendar…?") é seção e conteúdo da página
   * — de conversão numa landing page — e nunca sai como fecho de concorrente.
   */
  const fechoDeConcorrente = (valor: string) => radarWritingRhetoricalHeading(valor, p.unidade);
  const pontoDescartavel = (ponto: string) => !VIRADA.test(ponto) && !obrigatorios.has(radarWritingCompareKey(ponto))
    && (fechoDeConcorrente(ponto) || tocaForaDoEscopo(ponto));

  const escrever = (secao: RadarPortableSection): string[] => {
    if (EH_FAQ.test(secao.heading)) { faqOmitidas += 1; return []; }
    /* A seção que o ArticleDNA exige nunca sai por esta régua: a obrigatoriedade é decisão humana. */
    if (!secao.mustCoverReasons.length && fechoDeConcorrente(secao.heading)) { retoricasOmitidas += 1; return []; }
    const pergunta = util(secao.readerQuestion) && !radarWritingRhetoricalQuestion(texto(secao.readerQuestion)) ? util(secao.readerQuestion) : null;
    const chaveDoTitulo = radarWritingCompareKey(secao.heading);
    const daVirada = secao.mustCoverReasons.includes(RADAR_SUBJECT_MUST_COVER_REASON);
    const candidatos = daVirada
      ? [...secao.coveragePoints.filter(item => VIRADA.test(item)), ...secao.coveragePoints.filter(item => !VIRADA.test(item))]
      : secao.coveragePoints;
    const pontos = unicosPorChave(candidatos.filter(item => !ehPreenchimento(item) && !pontoDescartavel(item)), radarWritingCompareKey)
      .filter(item => radarWritingCompareKey(item) !== radarWritingCompareKey(pergunta) && radarWritingCompareKey(item) !== chaveDoTitulo)
      .slice(0, 4);
    const obrigatoria = secao.mustCoverReasons.length > 0;
    const motivosProprios = secao.mustCoverReasons.filter(motivoProprio);
    const linksDaSecao = links.filter(link => link.secao === secao.heading).map(link => link.rotulo);
    const doEspecialista = especialista.filter(item => item.secao === secao.heading).map(item => item.rotulo);
    const deTrabalho = Boolean(p.assunto) && secao.heading === radarSubjectTurnTitle(p.assunto!.phrase);
    const linhas = [
      "",
      `${"#".repeat(secao.level)} ${secao.heading}`,
      ...(deTrabalho ? [RADAR_WRITING_SUBJECT_WORKING_TITLE] : []),
      pergunta ? `- Responde: ${pergunta}` : `- Objetivo: ${comPontoFinal(secao.objective)}`,
      ...(pontos.length ? [`- Cobrir: ${pontos.join(" · ")}`] : []),
      ...(obrigatoria ? [`- Obrigatória pelo ArticleDNA${motivosProprios.length ? `: ${motivosProprios.map(semPontoFinal).join("; ")}` : ""}.`] : []),
      ...(secao.sourceNeeded ? [`- Precisa de fonte: a afirmação central (${entreAspas(pergunta || secao.heading)}) só entra com uma das fontes listadas; sem fonte, escreva de forma qualificada ou omita.`] : []),
      ...(secao.specialistRequired ? ["- Revisão profissional: uma afirmação desta seção pede revisão antes de publicar."] : []),
      ...(doEspecialista.length ? [`- Especialista: ${doEspecialista.join(", ")}.`] : []),
      ...(videos.get(secao.heading)?.length ? [`- Vídeo da marca: ${videos.get(secao.heading)!.join(", ")}.`] : []),
      ...(linksDaSecao.length ? [`- Links: ${linksDaSecao.join(", ")}.`] : []),
      ...(imagens.get(secao.heading) ? [`- Imagem: ${imagens.get(secao.heading)}.`] : []),
    ];
    return [...linhas, ...secao.children.flatMap(escrever)];
  };

  const medida = p.concorrentes?.sampleMeasures.find(item => radarWritingCompareKey(item.label) === "palavras") || null;
  const corpo = secoes.flatMap(escrever);
  const cabecalho = [
    input.profile === "YOUTUBE"
      ? "Estrutura do roteiro de vídeo (não é estrutura de artigo). Ordem sugerida; a decisão final é de quem redige."
      : "Ordem sugerida: a estrutura final e a extensão são decisão de quem redige.",
    ...(medida && typeof medida.median === "number"
      ? [`Referência da SERP, não meta: os concorrentes comparáveis têm mediana de ${numeroBr(medida.median)} palavras${medida.centralRange ? ` (faixa central de ${numeroBr(medida.centralRange[0])} a ${numeroBr(medida.centralRange[1])})` : ""}.`]
      : []),
    ...(faqOmitidas ? [`A seção de perguntas frequentes do modelo ficou de fora (sem FAQ): as perguntas vão dentro das seções.`] : []),
    ...(retoricasOmitidas ? [`${retoricasOmitidas === 1 ? "A seção de fecho retórico de concorrente ficou" : `${retoricasOmitidas} seções de fecho retórico de concorrente ficaram`} de fora (ex.: "Aprendeu…?", "Gostou…?"): não é dúvida do leitor.`] : []),
  ];
  const fechamento = util(p.editorial.conclusion);
  const fechoDoEspecialista = vozDoEspecialista(especialista, "FECHAMENTO")[0] ?? null;
  const linhaDoFecho = fechoDoEspecialista
    ? `Fechamento: virada final na voz do especialista (${fechoDoEspecialista.rotulo}); ver promessa_e_leitor.`
    : fechamento ? `Fechamento: ${comPontoFinal(fechamento)}` : null;
  return {
    celula: [...cabecalho, ...corpo, ...(linhaDoFecho ? ["", linhaDoFecho] : [])].join("\n"),
    faqOmitidas,
  };
}

/* ---------------------------- cobrir e superar ---------------------------- */

const STATUS_DE_PERGUNTA = new Set(["ARTICLE_QUESTION_CONFIRMED", "MARKET_QUESTION_UNDERCOVERED"]);
const PRIORIDADE: Record<string, string> = { HIGH: "prioridade alta", MEDIUM: "prioridade média", LOW: "prioridade baixa" };

/**
 * PERGUNTA DE FECHO DE CONCORRENTE NÃO É DÚVIDA DO LEITOR (2026-10-02).
 *
 * "Aprendeu como atrair clientes no Instagram?" é a última linha de uma página
 * concorrente, e virava a abertura do artigo.
 */
export function radarWritingRhetoricalQuestion(pergunta: string): boolean {
  /*
   * 2026-10-02 · A RÉGUA VALE PARA QUALQUER ASSUNTO, e lê a frase sem acento e
   * sem pontuação: "E aí, gostou?", "Ficou com dúvidas?", "O que você achou?" e
   * "Pronto para começar?" são fecho de página, não dúvida de leitor — em blog,
   * landing page ou página de serviço. A frase de antes continua coberta.
   *
   * 2026-10-02 · ESTA É A RÉGUA DAS LISTAS (perguntas a responder, movimentos,
   * termos, abertura, PAA): reação ao conteúdo, dúvida que sobrou e chamada
   * para ação. A chamada só conta quando é chamada — "pronto para" + verbo, sem
   * pergunta de verdade depois —, e "Preparado para a cirurgia: o que levar?"
   * ou "Pronto para consumo pode ser congelado?" continuam perguntas do leitor.
   * Para tirar SEÇÃO da estrutura, a régua é `radarWritingRhetoricalHeading`.
   */
  const chave = radarWritingCompareKey(pergunta);
  return REACAO_AO_CONTEUDO.test(chave) || DUVIDA_QUE_SOBROU.test(chave) || CHAMADA_PARA_ACAO.test(chave);
}

/**
 * ===== SEÇÃO DE FECHO RETÓRICO: A RÉGUA DA ESTRUTURA (2026-10-02) =====
 *
 * Revisão da frente: a régua das listas ganhou formas de chamada para ação, e
 * a mesma régua tirava cabeçalho da estrutura. Numa landing page ou página de
 * serviço, "Pronto para agendar sua avaliação?" é a seção de conversão da
 * página — e sumia rotulada como fecho de concorrente.
 *
 * Na estrutura (cabeçalho, ponto a cobrir e respiro) só sai a reação ao
 * conteúdo lido ("Aprendeu…?", "Gostou…?", "O que achou?"), em qualquer tipo de
 * página. "Ficou com alguma dúvida?" sai só da unidade editorial (artigo e
 * review): em landing page, página de serviço e categoria é o convite ao
 * contato, e é da página. Chamada para ação nunca tira nada da estrutura.
 */
export function radarWritingRhetoricalHeading(cabecalho: string, unidade: RadarWritingUnit = ARTIGO_COMO_UNIDADE): boolean {
  const chave = radarWritingCompareKey(cabecalho);
  return REACAO_AO_CONTEUDO.test(chave) || (unidade.editorial && DUVIDA_QUE_SOBROU.test(chave));
}

/* A reação ao conteúdo que acabou de ser lido: fecho de página, nunca dúvida de leitor. */
const REACAO_AO_CONTEUDO = /^(?:(?:e ai|e entao|entao|e agora) )?(?:aprendeu|aprenderam|gostou|gostaram|curtiu|curtiram|entendeu|entenderam|viu|viram|percebeu|perceberam|o que (?:voce )?achou|o que acharam)(?: |$)/;

/* A dúvida que sobrou depois da leitura: fecho no artigo; convite ao contato numa landing page. */
const DUVIDA_QUE_SOBROU = /^(?:(?:e ai|e entao|entao|e agora) )?(?:ficou com (?:alguma )?duvidas?|ficou alguma duvida|tem alguma duvida|ainda tem duvidas?)(?: |$)/;

/*
 * A chamada para ação. "Pronto/preparado para" só é chamada com VERBO logo
 * depois ("…para agendar", "…para começar") e sem pergunta de verdade no resto
 * da frase ("o que", "como", "pode", "vale"…): "Pronto para usar pode ser
 * congelado?" é dúvida do leitor.
 */
const CHAMADA_PARA_ACAO = /^(?:(?:e ai|e entao|entao|e agora) )?(?:(?:(?:quer|querem) (?:saber|aprender) mais|vamos (?:la|comecar|juntos)|bora)(?: |$)|(?:(?:voce|voces) )?(?:(?:esta|estao|ta|tao) )?(?:pront|preparad)[oa]s? para (?:ir|[a-z]+(?:ar|er|ir))(?: |$)(?!.*\b(?:o que|como|quando|quant[oa]s?|qual|quais|onde|por que|porque|pode|podem|posso|deve|devem|devo|precisa|precisam|preciso|vale|funciona|funcionam|serve|servem)\b))/;

/**
 * ===== O "NÃO COBRIR" ALCANÇA ESTE TEXTO? (2026-10-02) =====
 *
 * O CSV real dizia "Não cobrir: Ative o Instagram Shopping" e, na lista de
 * perguntas a responder, "Como prospectar clientes pelo Instagram com o
 * Instagram Shopping". A comparação era por igualdade de rótulo: a pergunta que
 * TOCA o assunto excluído passava.
 *
 * A régua, a mesma para qualquer marca e qualquer tipo de página: as palavras
 * que DISTINGUEM o rótulo fora do escopo — as dele, sem as raízes da keyword
 * principal, das complementares e do Assunto declarado — aparecem no texto, ao
 * menos metade delas (mínimo uma). "Instagram" é do núcleo e não distingue;
 * "Shopping" distingue. Rótulo feito só de palavras do núcleo não exclui nada
 * além dele mesmo, por igualdade, como antes.
 *
 * Os rótulos são os do pacote (`editorialCandidates` com veredito fora do
 * escopo) e, quando há Silo, os tópicos que ele exclui. Nada é inventado.
 *
 * 2026-10-02 · A RÉGUA MORA EM `out-of-scope.ts` (régua única): a mesma do
 * artigo-modelo e do CSV de vídeo. Os qualificadores de antes continuam lá,
 * junto com os verbos de abertura e as palavras genéricas de formato, e a
 * assinatura desta função não mudou.
 */
export function radarWritingOutOfScopeMatcher(input: {
  labels: ReadonlyArray<string | null | undefined>;
  core: ReadonlyArray<string | null | undefined>;
}): (valor: string | null | undefined) => boolean {
  return radarOutOfScopeMatcher(input);
}

/* O núcleo do artigo: principal, complementares e o Assunto declarado — o que nunca distingue um rótulo. */
const nucleoDoArtigo = (p: Projecoes) => [p.dna.principalKeyword, ...p.dna.secondaryKeywords, ...p.dna.narrativeReinforcements, p.assunto?.phrase];

/** Os rótulos "não cobrir" do pacote e do Silo, contra o núcleo do artigo. */
export function radarWritingOutOfScope(p: Projecoes, excluidosDoSilo: readonly string[] = []): (valor: string | null | undefined) => boolean {
  return radarWritingOutOfScopeMatcher({
    labels: [...p.serp.editorialCandidates.filter(item => item.verdict === "OUT_OF_SCOPE").map(item => item.observedLabel), ...excluidosDoSilo],
    core: nucleoDoArtigo(p),
  });
}

export function radarWritingOpeningQuestion(p: Projecoes, foraDoEscopo: (valor: string | null | undefined) => boolean = radarWritingOutOfScope(p)): string | null {
  /*
   * A ABERTURA RESPONDE A PERGUNTA DO LEITOR DESTE ARTIGO (SDD 2026-10-02).
   *
   * A mais recorrente da amostra podia ser "10 principais influencers de IA do
   * Instagram" — recorrente e alheia ao artigo. Só vale pergunta que adere ao
   * núcleo: principal e complementares.
   */
  const nucleo = new Set([p.dna.principalKeyword, ...p.keywords.map(item => item.keyword)]
    .flatMap(valor => radarSemanticStems(texto(valor) || "")));
  const centrais = (p.descoberta?.answerableUnits || [])
    .filter(unidade => unidade.importance === "CORE")
    .sort((a, b) => b.marketRecurrence.pages - a.marketRecurrence.pages)
    .map(unidade => unidade.questionOrNeed);
  const doBlueprint = p.blueprint?.profile === "GOOGLE" ? p.blueprint.observed.questions.map(item => item.statement) : [];
  const observadas = p.serp.questions.filter(item => STATUS_DE_PERGUNTA.has(item.status)).sort((a, b) => b.pages - a.pages).map(item => item.question);
  /* 2026-10-02 · nem fecho retórico de concorrente, nem pergunta que toca o "não cobrir". */
  const todas = [...centrais, ...doBlueprint, ...observadas].filter((valor): valor is string => Boolean(texto(valor)) && !radarWritingRhetoricalQuestion(valor) && !foraDoEscopo(valor));
  /* Só raiz da PRINCIPAL vira cenário (ex.: "instagram"). */
  const daPrincipal = new Set(radarSemanticStems(texto(p.dna.principalKeyword) || ""));
  const onipresentes = new Set([...radarUbiquitousStems(todas)].filter(raiz => daPrincipal.has(raiz)));
  const aderentes = nucleo.size ? todas.filter(pergunta => radarTextAdheresToCore(pergunta, nucleo, onipresentes)) : todas;
  /*
   * 2026-10-02 · ENTRE AS ADERENTES, A QUE FALA DA PRINCIPAL. "Como captar
   * clientes pelo WhatsApp?" adere pelo "clientes", mas é outro canal; a
   * abertura de "como atrair clientes pelo instagram" vinha dela. Primeiro a
   * que divide ao menos duas raízes com a principal; sem nenhuma, a de antes.
   */
  /* Preposição ("pelo", "para") não é raiz do tema: "…clientes pelo WhatsApp" não fala da principal por ela. */
  const raizesDaPrincipal = [...daPrincipal].filter(raiz => !RADAR_WRITING_FUNCTION_WORDS.has(raiz));
  const minimo = Math.min(2, raizesDaPrincipal.length);
  const daPropriaPrincipal = minimo ? aderentes.find(pergunta => {
    const raizes = new Set(radarSemanticStems(pergunta));
    return raizesDaPrincipal.filter(raiz => raizes.has(raiz)).length >= minimo;
  }) : undefined;
  const escolhida = daPropriaPrincipal ?? aderentes[0];
  return escolhida ? radarWritingDecodeEntities(escolhida) : null;
}

/*
 * 2026-10-02 · A LIMITAÇÃO DIZ DE QUAL CAMADA FALA. "Nenhuma página foi
 * visitada" é verdade da leitura multiformato e dos recursos da SERP (vídeos,
 * blocos), não da investigação, que leu as páginas comparáveis — o CSV dizia as
 * duas coisas ao mesmo tempo. Com páginas lidas, a frase nomeia a camada.
 */
function limitacaoDaCamada(limitacao: string, paginasLidas: number): string {
  if (!paginasLidas || !/nenhuma p[aá]gina foi visitada/i.test(limitacao)) return limitacao;
  return `A leitura multiformato e dos recursos da SERP (vídeos e blocos) usa só o que a SERP devolveu: nenhum vídeo foi assistido ou transcrito. As ${paginasLidas} páginas comparáveis, estas sim, foram lidas pela investigação (base das medidas e dos temas dos concorrentes)`;
}

/* ---------------------- 2026-10-08 · C6 e C7: o diferencial e o foco das perguntas ---------------------- */

/* A raiz de comparação, sem palavra de função nem vazia; o radical não é uniforme ("cliente" × "client"): casa pelo começo (5+ letras). */
const mesmaRaizDeEscrita = (a: string, b: string) => a === b || (Math.min(a.length, b.length) >= 5 && (a.startsWith(b) || b.startsWith(a)));
const raizesDeEscrita = (valor: string | null | undefined): string[] =>
  [...new Set(radarSemanticStems(radarWritingDecodeEntities(texto(valor))))].filter(raiz => raiz.length >= 3 && !RADAR_WRITING_FUNCTION_WORDS.has(raiz) && !VAZIAS.has(raiz));
const temRaiz = (lista: readonly string[], raiz: string) => lista.some(outra => mesmaRaizDeEscrita(raiz, outra));
/* As raízes do núcleo do artigo: principal, complementares, Assunto e a cobertura que o ArticleDNA exige. */
const raizesDoNucleo = (p: Projecoes): string[] => [...new Set([...keywordsDoArtigo(p), ...p.dna.mustCover].flatMap(raizesDeEscrita))];
/* Palavras de forma, não de assunto: "Destaques de forma estratégica" não toca "Como usar… de forma estratégica". */
const RAIZES_DE_FORMA = ["estrateg", "pratic", "dica", "forma", "maneira", "tatic", "passo", "guia", "melhor", "import", "eficient", "complet"];
const deAssunto = (raiz: string) => !RAIZES_DE_FORMA.some(forma => raiz.startsWith(forma));

/*
 * ===== 2026-10-08 · C7 · A PERGUNTA É DESTE ARTIGO? =====
 *
 * No CSV real de 08/10, "Como fazer um pitch de vendas eficiente?" e "O que
 * fazer para vender muito no Instagram?" entravam nas perguntas a responder,
 * enquanto "Como chamar a atenção no Instagram?" estava no "Não cobrir": as
 * três só dividem com "como atrair clientes pelo instagram" a palavra do
 * cenário. E "Como captar clientes pelo WhatsApp?" é o assunto de outro
 * tópico do Silo ("como atrair clientes pelo whatsapp").
 *
 * A régua, a mesma da pergunta de abertura (`radarWritingOpeningQuestion`):
 * a pergunta é deste artigo quando divide com o núcleo duas raízes, ou uma que
 * não é cenário — a raiz do núcleo que está em metade ou mais das perguntas
 * (com quatro ou mais) é cenário ("instagram", "clientes"). A pergunta sem
 * nenhuma raiz do núcleo continua: a investigação a ligou ao artigo por outro
 * caminho, e o export não tem base para tirá-la ("Quais são os tipos de acne?"
 * num artigo de skincare). A que só divide o cenário sai das perguntas e vai ao
 * "Não cobrir": para o artigo ou tópico do Silo cujas palavras próprias ela
 * traz (a mais rara entre os destinos vence; empate, o artigo), ou como outro
 * foco. Vale para qualquer marca, assunto e tipo de página.
 */
type FocoDasPerguntas = { doArtigo: (pergunta: string) => boolean; destino: (pergunta: string) => string };

function focoDasPerguntas(p: Projecoes, contexto: RadarWritingArticleContext, perguntas: readonly string[]): FocoDasPerguntas {
  const nucleo = raizesDoNucleo(p);
  const raizesDe = (pergunta: string) => raizesDeEscrita(pergunta);
  const lidas = perguntas.map(raizesDe);
  const cenario = lidas.length >= 4 ? nucleo.filter(raiz => lidas.filter(raizes => temRaiz(raizes, raiz)).length / lidas.length >= 0.5) : [];

  const silo = contexto.silo?.kind === "silo" ? contexto.silo : null;
  const proprias = new Set(keywordsDoArtigo(p).map(radarWritingCompareKey));
  const alvos = unicosPorChave([
    ...(silo?.members || []).filter(membro => membro.articleId !== contexto.articleId).map(membro => ({ rotulo: rotuloDoMembro(membro), artigo: true })),
    ...(silo?.includedTopics || []).map(rotulo => ({ rotulo: texto(rotulo), artigo: false })),
  ], item => radarWritingCompareKey(item.rotulo))
    .filter(item => item.rotulo && !proprias.has(radarWritingCompareKey(item.rotulo)))
    .map(item => ({ ...item, todas: raizesDeEscrita(item.rotulo), proprias: raizesDeEscrita(item.rotulo).filter(raiz => !temRaiz(nucleo, raiz)) }))
    .filter(item => item.proprias.length);
  /*
   * 2026-10-08 (correção da revisão) · a pergunta que É a keyword de outro
   * artigo ou tópico do Silo ("Como atrair clientes pelo WhatsApp?", com o
   * tópico "como atrair clientes pelo whatsapp") pertence a ele, mesmo dividindo
   * duas raízes com o núcleo: ela traz as palavras próprias do destino e nenhuma
   * fora dele. "Como captar clientes pelo Instagram?" continua deste artigo — o
   * "instagram" não está em "como captar um cliente".
   */
  const ehDeOutroDoSilo = (pergunta: string) => {
    const daPergunta = raizesDe(pergunta);
    return daPergunta.length > 0 && alvos.some(alvo => alvo.proprias.every(raiz => temRaiz(daPergunta, raiz)) && daPergunta.every(raiz => temRaiz(alvo.todas, raiz)));
  };
  const doArtigo = (pergunta: string) => {
    if (ehDeOutroDoSilo(pergunta)) return false;
    const comuns = raizesDe(pergunta).filter(raiz => temRaiz(nucleo, raiz));
    return !comuns.length || comuns.length >= 2 || comuns.some(raiz => !temRaiz(cenario, raiz));
  };
  const raridade = (raiz: string) => 1 / Math.max(1, alvos.filter(alvo => temRaiz(alvo.proprias, raiz)).length);
  const principal = texto(p.dna.principalKeyword);
  const comComplementares = p.dna.secondaryKeywords.length + p.dna.narrativeReinforcements.length > 0;

  const destino = (pergunta: string): string => {
    const daPergunta = raizesDe(pergunta);
    /* Os artigos do Silo vêm antes dos tópicos na lista: no empate, fica o primeiro — o artigo. */
    let melhor: { alvo: typeof alvos[number]; nota: number } | null = null;
    for (const alvo of alvos) {
      if (!alvo.proprias.every(raiz => temRaiz(daPergunta, raiz))) continue;
      const nota = alvo.proprias.reduce((soma, raiz) => soma + raridade(raiz), 0);
      if (!melhor || nota > melhor.nota + 1e-9) melhor = { alvo, nota };
    }
    const dita = entreAspas(pergunta);
    if (melhor?.alvo.artigo) return `${dita}: pertence ao artigo ${entreAspas(melhor.alvo.rotulo)} do Silo; não responder aqui.`;
    if (melhor) return `${dita}: pertence a ${entreAspas(melhor.alvo.rotulo)}, outro tópico do Silo; não responder aqui.`;
    return `${dita}: outro foco; não trata de ${principal ? entreAspas(principal) : "a keyword principal"}${comComplementares ? " nem das complementares" : ""}.`;
  };
  return { doArtigo, destino };
}

/* "Conclusão", "Considerações finais": fecho da página, não diferencial. */
const EH_FECHO_DA_PAGINA = /^(?:conclusao|consideracoes finais|para finalizar|finalizando|em resumo|resumo final|resumindo)\b/;

/** 2026-10-08 · C6 · O diferencial do artigo, na ordem do desenho; `null` = nenhum (o movimento não existe). */
function diferencialDoArtigo(
  input: RadarPortableExportInput,
  p: Projecoes,
  contexto: RadarWritingArticleContext,
  tocaForaDoEscopo: (valor: string | null | undefined) => boolean,
): string | null {
  const nucleo = raizesDoNucleo(p);
  const cabecalhos = (input.competitorOutlines || []).flatMap(pagina => pagina.headings.filter(item => item.level === 2 || item.level === 3).map(item => raizesDeEscrita(item.text)));
  /* 1 · o que a página publicada já trata e os concorrentes lidos não tratam (o que a planta decidiu tirar não conta). */
  const atual = contexto.publication?.published ? contexto.publication.currentStructure ?? null : null;
  if (atual?.h2.length && cabecalhos.length) {
    const removidos = new Set(contexto.blueprint
      ? radarArticleBlueprintPublishedMapReading(contexto.blueprint, atual.h2, { keywords: keywordsDoArtigo(p) }).filter(item => item.kind === "REMOVED").map(item => radarWritingCompareKey(item.current))
      : []);
    const daPagina = unicosPorChave(atual.h2.map(item => radarWritingDecodeEntities(item).replace(/\s+/g, " ").trim()), radarWritingCompareKey)
      .filter(h2 => h2 && !EH_FAQ.test(h2) && !EH_FECHO_DA_PAGINA.test(radarWritingCompareKey(h2)) && !removidos.has(radarWritingCompareKey(h2)) && !tocaForaDoEscopo(h2))
      .filter(h2 => {
        const proprias = raizesDeEscrita(h2).filter(raiz => !temRaiz(nucleo, raiz) && deAssunto(raiz));
        if (proprias.length < 2) return false;
        return !cabecalhos.some(outro => {
          const divididas = proprias.filter(raiz => temRaiz(outro, raiz)).length;
          return divididas >= 2 || divididas / proprias.length >= 0.5;
        });
      })
      .slice(0, 3);
    if (daPagina.length) {
      return `Diferencial da página publicada: ela já trata o que os concorrentes lidos não tratam — ${daPagina.map(item => entreAspas(cortar(item, 80))).join("; ")}. Isso fica na atualização, reescrito na voz (o destino de cada H2 está na coluna artigo).`;
    }
  }
  /* 2 · o tema de uma página só que serve ao leitor: toca a planta (ou, sem ela, a estrutura sugerida). */
  const unicos = (radarWritingCompetitorTopicsOf(input, p)?.topics || []).filter(item => item.pages < 2);
  if (unicos.length) {
    /* O título e os H3 da seção dizem o assunto dela (peso 2); a resposta e o "Explicar", o que ela desenvolve (peso 1). */
    const secoes = contexto.blueprint
      ? contexto.blueprint.blueprint.sections.map(secao => ({ titulo: secao.h2, nome: raizesDeEscrita([secao.h2, ...secao.h3].join(" ")), corpo: raizesDeEscrita([secao.readerQuestion, secao.answerFirst, ...secao.explain].join(" ")) }))
      : p.secoes.map(secao => ({ titulo: secao.heading, nome: raizesDeEscrita(secao.heading), corpo: raizesDeEscrita([secao.readerQuestion || "", ...secao.coveragePoints].join(" ")) }));
    for (const tema of unicos) {
      const proprias = raizesDeEscrita([tema.label, ...tema.headings].join(" ")).filter(raiz => !temRaiz(nucleo, raiz) && deAssunto(raiz));
      if (proprias.length < 2) continue;
      const notas = secoes.map(item => proprias.reduce((soma, raiz) => soma + (temRaiz(item.nome, raiz) ? 2 : temRaiz(item.corpo, raiz) ? 1 : 0), 0));
      const melhor = Math.max(0, ...notas);
      const secao = melhor > 0 ? secoes[notas.indexOf(melhor)] : null;
      if (secao) return `Diferencial possível: ${entreAspas(tema.label)}, tratado por 1 de ${tema.sampleSize} páginas comparáveis — aprofunde na seção ${entreAspas(secao.titulo)}, sem copiar o cabeçalho do concorrente.`;
    }
  }
  return null;
}

/** 2026-10-08 · C6 · Sem outro diferencial: a entrega concreta que a planta pede (B6), quando ela a diz. */
function entregaDaPlanta(planta: RadarArticleBlueprintPayload | null): string | null {
  const secao = planta?.blueprint.sections.find(item => texto(item.practical));
  return secao ? `Entrega concreta da planta: ${semPontoFinal(texto(secao.practical))} (seção ${entreAspas(secao.h2)}).` : null;
}

function colunaCobrir(
  input: RadarPortableExportInput,
  p: Projecoes,
  contexto: RadarWritingArticleContext,
  perguntaDeAbertura: string | null,
  tocaForaDoEscopo: (valor: string | null | undefined) => boolean = radarWritingOutOfScope(p, contexto.silo?.excludedTopics || []),
): { celula: string; conflitos: string[] } {
  /* Só conflito que pede DECISÃO HUMANA vai ao veredito por aqui; o que o export resolve vira nota (2026-10-02). */
  const conflitos: string[] = [];
  const amostra = p.serp.sample?.comparablePages || (p.blueprint?.profile === "GOOGLE" ? p.blueprint.observed.comparablePages : 0) || 0;
  const maioria = Math.max(2, Math.ceil(amostra / 2));
  const foraDoEscopo = p.serp.editorialCandidates.filter(item => item.verdict === "OUT_OF_SCOPE");
  /*
   * 2026-10-02 · NENHUMA LISTA DESTA CÉLULA leva fecho retórico de concorrente
   * nem texto que toca o "não cobrir" (antes: só igualdade de rótulo, e só a
   * abertura tirava a retórica). Vale para movimentos, perguntas, termos e o
   * "já coberto pela maioria".
   */
  const descartar = (valor: string | null | undefined) => !texto(valor) || radarWritingRhetoricalQuestion(texto(valor)) || tocaForaDoEscopo(valor);
  /*
   * 2026-10-02 · O CONFLITO QUE O EXPORT JÁ RESOLVE NÃO É RESSALVA. Assunto
   * fora do escopo que o pacote também listava como diferencial: o "não
   * cobrir" vence, de forma determinística, e não há decisão humana pendente.
   * Sai uma nota no bloco "Não cobrir", e nada vai ao veredito.
   *
   * 2026-10-02 · SÓ O DIFERENCIAL QUE VEIO DA SERP (revisão da frente). O que
   * o ArticleDNA DECLARA, ou o que toca um ponto que ele exige (`mustCover`), é
   * decisão humana aprovada no Arquiteto: o diagnóstico do Radar não o
   * sobrescreve nem o muda em silêncio (AGENTS §7 e §9). Aí o conflito fica,
   * como ressalva de decisão humana (Radar ou Arquiteto), mesmo que o movimento
   * saia desta célula. A nota "sem decisão pendente" é só do que é da SERP.
   */
  const resolvidosComoForaDoEscopo: string[] = [];
  const conflitosComODna = new Map<string, string>();
  const origemPorAssunto = new Map(p.serp.differentiations.map(item => [radarWritingCompareKey(item.subject), item.basis]));
  const obrigatoriosDoDna = new Set(p.dna.mustCover.map(radarWritingCompareKey).filter(Boolean));
  const diferencialForaDoEscopo = (assunto: string, origem: string | undefined) => {
    const chave = radarWritingCompareKey(assunto);
    const declara = (origemPorAssunto.get(chave) ?? origem) === "ARTICLE_DECLARES";
    /* Ponto exigido que TOCA o assunto, pela mesma régua do "não cobrir": as palavras que distinguem o assunto aparecem nele. */
    const tocaOAssunto = radarWritingOutOfScopeMatcher({ labels: [assunto], core: nucleoDoArtigo(p) });
    const exige = !declara && (obrigatoriosDoDna.has(chave) || p.dna.mustCover.some(item => tocaOAssunto(item)));
    if (!declara && !exige) {
      resolvidosComoForaDoEscopo.push(assunto);
      return;
    }
    if (conflitosComODna.has(chave)) return;
    const rotulo = entreAspas(radarWritingDecodeEntities(assunto));
    conflitosComODna.set(chave, declara
      ? `o ArticleDNA declara ${rotulo} como diferencial e o pacote do Radar o marca como fora do escopo: decisão humana pendente (Radar ou Arquiteto), e o diagnóstico do Radar não muda o DNA; até lá, não o sustente como diferencial`
      : `o ArticleDNA exige um ponto ligado a ${rotulo}, que o pacote do Radar marca como fora do escopo e também como diferencial: decisão humana pendente (Radar ou Arquiteto); até lá, cubra o que o ArticleDNA exige, sem sustentá-lo como diferencial`);
  };

  /* ---- como superar a SERP, a partir dos campos estruturados ---- */
  const movimentos: string[] = [];
  /*
   * 2026-10-02 · COM O ARTIGO-MODELO, A ABERTURA É A DELE. Duas aberturas no
   * mesmo arquivo (a da planta e a desta coluna) davam ordens contraditórias a
   * quem escreve; aqui fica só a remissão.
   */
  if (contexto.blueprint) {
    movimentos.push("Abertura: a do artigo-modelo (coluna estrutura); as perguntas abaixo entram nas seções.");
  } else if (perguntaDeAbertura) {
    const vezes = p.serp.questions.find(item => radarWritingCompareKey(item.question) === radarWritingCompareKey(perguntaDeAbertura));
    movimentos.push(`Responder ${entreAspas(perguntaDeAbertura)} logo no primeiro parágrafo${vezes ? ` (${vezes.pages} de ${vezes.sampleSize} páginas tratam)` : ""}.`);
  }
  /*
   * 2026-10-08 · C6 · O DIFERENCIAL, NUNCA A COSTURA DO QUE A MAIORIA JÁ COBRE.
   * O movimento "Costurar num mesmo argumento X e Y" usava os conceitos que 2+
   * páginas tratam — os mesmos que esta célula lista em "Já coberto pela
   * maioria (não é diferencial)". Saiu. No lugar, UM movimento de diferencial,
   * nesta ordem: o que a página publicada já trata e a amostra não trata; o
   * tema de uma página só que serve ao leitor (toca a planta); as lacunas e
   * diferenciais G/D da investigação (movimentos abaixo); e, sem nada disso, a
   * entrega concreta que a planta pede. Sem nenhum, o movimento não existe.
   */
  const diferencial = diferencialDoArtigo(input, p, contexto, tocaForaDoEscopo);
  if (diferencial) movimentos.push(diferencial);
  const antesDosDiferenciaisDaSerp = movimentos.length;
  if (p.blueprint?.profile === "GOOGLE") {
    /*
     * DIFERENCIAL FORA DO ESCOPO NÃO É INSTRUÇÃO (2026-10-02). O CSV real dizia
     * "Sustentar 'Ative o Instagram Shopping' como diferencial" e, na mesma
     * célula, "Não cobrir: Ative o Instagram Shopping". O "não cobrir" vence.
     */
    for (const item of p.blueprint.recommended.differentiation.slice(0, 2)) {
      const citado = item.statement.match(/["“]([^"”]+)["”]/)?.[1] || "";
      if (citado ? tocaForaDoEscopo(citado) : tocaForaDoEscopo(item.statement)) {
        /*
         * A origem vem do diferencial observado de mesmo assunto; sem ele, do
         * objetivo que o blueprint escreve para o que o fundamento declarou
         * ("entregar o que o fundamento prometeu…", google-editorial).
         */
        diferencialForaDoEscopo(citado || item.statement, /fundamento prometeu/i.test(item.objective) ? "ARTICLE_DECLARES" : "SERP_EVIDENCE");
        continue;
      }
      if (citado && radarWritingRhetoricalQuestion(citado)) continue;
      movimentos.push(comPontoFinal(item.statement));
    }
    for (const item of p.blueprint.observed.conflicts.slice(0, 2)) {
      if (descartar(item.statement)) continue;
      movimentos.push(`Explicar a divergência que o mercado repete sem resolver: ${comPontoFinal(item.statement)}`);
    }
  }
  const naEstrutura = new Set(p.secoes.flatMap(secao => [radarWritingCompareKey(secao.readerQuestion), radarWritingCompareKey(secao.heading)]).filter(Boolean));
  for (const item of p.serp.differentiations.slice(0, 3)) {
    if (tocaForaDoEscopo(item.subject)) {
      diferencialForaDoEscopo(item.subject, item.basis);
      continue;
    }
    if (radarWritingRhetoricalQuestion(item.subject)) continue;
    const base = item.basis === "ARTICLE_DECLARES" ? "o artigo declara e" : "a busca mostra que";
    const assunto = radarWritingCompareKey(item.subject);
    if (assunto && movimentos.some(movimento => radarWritingCompareKey(movimento).includes(assunto))) continue;
    movimentos.push(`Diferenciar em ${entreAspas(radarWritingDecodeEntities(item.subject))}: ${base} só ${item.pagesCovering}${amostra ? ` de ${amostra}` : ""} página(s) cobrem.`);
  }
  /*
   * LACUNA DE UMA PÁGINA SÓ, ACHADA POR KEYWORD AUXILIAR, NÃO É INSTRUÇÃO.
   *
   * O dossiê real tinha quatro linhas "O artigo declara '6 – Manter a pele
   * limpa' e a amostra não cobre", cada uma de 1 de 10 páginas. Elas ficam no
   * formato completo; aqui só atravessa lacuna com recorrência de verdade — o
   * que a concorrência cobre e o ArticleDNA não declara —, e só quando a
   * estrutura ainda não a hospeda.
   */
  for (const lacuna of p.serp.gaps) {
    if (lacuna.pagesCovering < 2 || /apenas por keyword auxiliar/i.test(lacuna.evidence)) continue;
    const rotulo = radarWritingDecodeEntities(lacuna.subject.match(/["“]([^"”]+)["”]/)?.[1] || lacuna.subject);
    if (naEstrutura.has(radarWritingCompareKey(rotulo)) || descartar(rotulo)) continue;
    movimentos.push(`Cobrir ${entreAspas(rotulo)}: ${lacuna.pagesCovering} de ${lacuna.sampleSize} concorrentes tratam e o ArticleDNA não declara.`);
    if (movimentos.length >= RADAR_WRITING_EXPORT_LIMITS.moves) break;
  }
  /* 2026-10-08 · C6 · sem diferencial da página, de tema de uma página só nem da SERP (G/D): a entrega concreta que a planta pede, se houver. */
  if (!diferencial && movimentos.length === antesDosDiferenciaisDaSerp) {
    const entrega = entregaDaPlanta(contexto.blueprint ?? null);
    if (entrega) movimentos.push(entrega);
  }
  const sinal = (chave: string) => p.autoridade?.eeatSignals.find(item => item.key === chave) || null;
  const experiencia = sinal("FIRSTHAND_ACCOUNT");
  /*
   * 2026-10-08 · C8 · SEM MATERIAL PRÓPRIO, SEM RELATO E SEM MARCADOR. O
   * "[RELATO DA MARCA — preencher]" contrariava D10 e a própria voz da marca
   * ("não ficaram marcadores internos ou relatos por preencher no texto
   * publicável?"; a ausência de caso próprio não impede um artigo explicativo).
   * Decisão da rodada: sem material da marca, o texto sai sem relato e sem
   * inventá-lo — nada de marcador.
   */
  if (experiencia && experiencia.state === "ABSENT") {
    movimentos.push(`Experiência: nenhuma das ${experiencia.sampleSize} páginas traz relato de prática. Não há material próprio da marca neste arquivo: escreva sem relato e sem inventá-lo; nenhum marcador vai ao texto.`);
  }
  const autoria = sinal("NAMED_AUTHOR");
  const credencial = sinal("DECLARED_CREDENTIAL");
  if (autoria && autoria.pages > 0) {
    movimentos.push(`Autoria: ${autoria.pages} de ${autoria.sampleSize} páginas identificam quem escreveu${credencial && credencial.pages ? ` e ${credencial.pages} declaram credencial` : ""}; assine com autor real, sem inventar credencial.`);
  }
  const datas = sinal("SHOWS_DATES");
  if (datas && datas.pages >= maioria) movimentos.push(`Data de atualização visível: ${datas.pages} de ${datas.sampleSize} páginas mostram.`);
  if (p.blueprint?.profile === "AMAZON") {
    for (const eixo of p.blueprint.recommended.comparisonAxes.slice(0, 3)) movimentos.push(`Comparar por ${entreAspas(eixo.label)}${eixo.caveat ? ` (ressalva: ${semPontoFinal(eixo.caveat)})` : ""}.`);
  }

  /* ---- perguntas dentro das seções ---- */
  const naoProntas = new Set((p.descoberta?.answerableUnits || []).filter(unidade => unidade.readiness !== "READY").map(unidade => radarWritingCompareKey(unidade.questionOrNeed)));
  const semFonte = new Set(radarWritingUnsupportedClaims(p.autoridade, p.serp).map(item => radarWritingCompareKey(item.afirmacao)));
  const jaNaEstrutura = new Set(p.secoes.flatMap(secao => [radarWritingCompareKey(secao.readerQuestion), radarWritingCompareKey(secao.heading)]).filter(Boolean));
  /*
   * 2026-10-08 · C7 · com o artigo-modelo, a abertura e as seções são as DELE:
   * a pergunta que a planta já responde não se repete aqui, e a "pergunta de
   * abertura" do export (que a planta não usa) volta para a lista.
   */
  const planta = contexto.blueprint?.blueprint;
  if (planta) for (const pergunta of [planta.opening.readerQuestion, ...planta.sections.map(secao => secao.readerQuestion)]) jaNaEstrutura.add(radarWritingCompareKey(pergunta));
  else jaNaEstrutura.add(radarWritingCompareKey(perguntaDeAbertura));
  /*
   * 2026-10-08 (correção da revisão) · a pergunta que a planta usa como
   * EVIDÊNCIA de uma seção ou da abertura (G1 "Como captar clientes pela
   * internet?" na seção 5 do caso real) também já está na estrutura: ela não
   * se repete nas perguntas a responder e nunca vai ao "Não cobrir" — o mesmo
   * tema não pode ser obrigatório na estrutura e proibido aqui.
   */
  if (planta && contexto.blueprint) {
    const textoDaEvidencia = new Map((contexto.blueprint.evidence || []).map(item => [item.id, item.text]));
    for (const id of [...(planta.opening.evidence || []), ...planta.sections.flatMap(secao => secao.evidence || [])]) {
      const dita = /^[PGDO]\d/i.test(id) ? textoDaEvidencia.get(id) : undefined;
      if (dita) jaNaEstrutura.add(radarWritingCompareKey(dita.replace(/\s*\([^()]*p[áa]ginas?[^()]*\)\s*$/i, "")));
    }
  }
  const candidatas = [
    ...(p.descoberta?.questionCoverageRequirements || [])
      .slice().sort((a, b) => ({ HIGH: 0, MEDIUM: 1, LOW: 2 }[a.priority] ?? 3) - ({ HIGH: 0, MEDIUM: 1, LOW: 2 }[b.priority] ?? 3))
      .map(item => ({ pergunta: item.question, prioridade: PRIORIDADE[item.priority] || null })),
    ...p.serp.questions.filter(item => STATUS_DE_PERGUNTA.has(item.status)).sort((a, b) => b.pages - a.pages)
      .map(item => ({ pergunta: item.question, prioridade: null as string | null })),
  ].map(item => ({ ...item, pergunta: semCaixaAlta(radarWritingDecodeEntities(item.pergunta).replace(/\s+\?/g, "?").trim()) }));
  const elegiveis = unicosPorChave(candidatas, item => radarWritingCompareKey(item.pergunta))
    .filter(item => !jaNaEstrutura.has(radarWritingCompareKey(item.pergunta)) && !descartar(item.pergunta) && !EH_FAQ.test(item.pergunta));
  /* 2026-10-08 · C7 · só a pergunta DESTE artigo; a que só divide o cenário vai ao "Não cobrir", com o destino. */
  const foco = focoDasPerguntas(p, contexto, elegiveis.map(item => item.pergunta));
  const foraDoFoco = elegiveis.filter(item => !foco.doArtigo(item.pergunta)).map(item => foco.destino(item.pergunta));
  const perguntas = elegiveis.filter(item => foco.doArtigo(item.pergunta))
    .slice(0, RADAR_WRITING_EXPORT_LIMITS.questions)
    .map(item => {
      const chave = radarWritingCompareKey(item.pergunta);
      const insuficiente = naoProntas.has(chave) || semFonte.has(chave) || semFonte.has(chave.replace(/\s*$/, ""));
      const marcas = [item.prioridade, insuficiente ? "material insuficiente: responder de forma qualificada ou só com fonte" : null].filter(Boolean);
      return `- ${item.pergunta}${marcas.length ? ` (${marcas.join("; ")})` : ""}`;
    });

  /* ---- termos a nomear: rótulos de conceito com recorrência, nunca unigrama ---- */
  const termos = unicosPorChave([
    ...p.serp.concepts
      .filter(item => item.status !== "ISOLATED" && item.sourceCount >= 2 && !item.label.trim().endsWith("?"))
      .map(item => item.label),
    ...(p.descoberta?.conceptRelations || [])
      .filter(relacao => relacao.basis === "OBSERVED")
      .flatMap(relacao => [relacao.subject, relacao.object]),
  ].map(item => radarWritingDecodeEntities(item).trim()), radarWritingCompareKey)
    .filter(item => !item.endsWith("?") && radarWritingContentWords(item).size >= 2 && !descartar(item))
    .map(item => (item === item.toUpperCase() ? item.toLowerCase() : item))
    .slice(0, RADAR_WRITING_EXPORT_LIMITS.terms);

  /* ---- o que a maioria já cobre ---- */
  const saturados = p.blueprint?.profile === "GOOGLE"
    ? p.blueprint.observed.recurrentConcepts.filter(item => (item.count ?? 0) >= maioria && !descartar(item.statement)).map(item => item.statement)
    : [];

  /* ---- o que não cobrir ---- */
  const resolvidos = unicosPorChave(resolvidosComoForaDoEscopo.map(item => radarWritingDecodeEntities(item)), radarWritingCompareKey);
  const naoCobrir = [
    ...foraDoEscopo.map(item => `${entreAspas(radarWritingDecodeEntities(item.observedLabel))}: ${semPontoFinal(item.reason)}.`),
    ...foraDoFoco,
    ...(resolvidos.length
      ? [`Nota: o pacote também listava ${resolvidos.map(entreAspas).join(", ")} como diferencial; aqui vale o "não cobrir" (resolvido neste arquivo, sem decisão pendente).`]
      : []),
    ...(contexto.silo?.excludedTopics || []).map(item => `${entreAspas(item)}: fora da fronteira do Silo.`),
    ...(p.blueprint?.profile === "AMAZON"
      ? p.blueprint.recommended.requiresEnrichment.slice(0, 3).map(item => `Não comparar por ${item.toLowerCase().replaceAll("_", " ")}: essa camada não foi coletada.`)
      : []),
    ...p.limitacoes
      .filter(item => /n[aã]o traz|n[aã]o foram lid|n[aã]o foi lid|nenhum v[ií]deo foi assistido|n[aã]o foi coletad|n[aã]o foram coletad/i.test(item))
      .slice(0, 3)
      .map(item => `Não afirmar o que depende disto: ${comPontoFinal(semPontoFinal(limitacaoDaCamada(item, amostra)))}`),
  ];

  /* O que o ArticleDNA declara ou exige e o Radar marcou fora do escopo pede decisão humana: vai ao veredito. */
  conflitos.push(...conflitosComODna.values());

  const blocos = [
    ...(movimentos.length ? ["Como superar a SERP:", ...movimentos.slice(0, RADAR_WRITING_EXPORT_LIMITS.moves + 2).map(item => `- ${item}`)] : []),
    ...(perguntas.length ? ["", "Perguntas a responder dentro das seções (sem seção de perguntas frequentes):", ...perguntas] : []),
    ...(termos.length >= 5 ? ["", `Termos e temas a nomear: ${termos.join(" · ")}`] : []),
    ...(saturados.length ? ["", `Já coberto pela maioria (não é diferencial: cubra com precisão, sem se alongar): ${saturados.map(item => radarWritingDecodeEntities(item)).join(" · ")}`] : []),
    ...(naoCobrir.length ? ["", "Não cobrir:", ...unicosPorChave(naoCobrir, radarWritingCompareKey).map(item => `- ${item}`)] : []),
  ];
  if (!blocos.length) return { celula: "", conflitos };
  const celula = blocos[0] === "" ? blocos.slice(1) : blocos;
  return { celula: celula.join("\n"), conflitos };
}

/* ------------------------------ a SERP resumida ------------------------------ */

const LENTES_NAO_CONFERIDAS = "Lentes: não conferidas neste pacote; o topo acima é da coleta principal.";

/*
 * 2026-10-02 · A CONFIGURAÇÃO DE CADA LENTE, COMO O PACOTE A TEM (pedido do
 * dono: SERP rastreável sem despejar a API). Rótulo (dispositivo e sistema) e
 * data da observação; a lente sem observação é dita como tal — nada além do
 * que o pacote guarda.
 */
type LeituraDeLente = { label: string; observed: boolean; collectedAt: string | null };

function configuracaoDasLentes(leituras: readonly LeituraDeLente[]): string[] {
  if (!leituras.length) return [];
  const uma = (item: LeituraDeLente) => {
    if (!item.observed) return `${item.label} (sem observação)`;
    const data = radarWritingDate(item.collectedAt);
    return `${item.label} (${data ? `observada em ${data}` : "observada, sem data registrada"})`;
  };
  return [`- Configuração de cada lente: ${leituras.map(uma).join("; ")}.`];
}

function resumoDeLentes(leituras: ReadonlyArray<{ label: string; domains: readonly string[] }>, rotulo: string, configuracao: readonly string[] = []): string[] {
  if (leituras.length < 2) return [LENTES_NAO_CONFERIDAS, ...configuracao];
  const conjuntos = leituras.map(item => new Set(item.domains));
  const todas = [...conjuntos[0]].filter(dominio => conjuntos.every(conjunto => conjunto.has(dominio)));
  const exclusivos = leituras
    .map(item => ({ label: item.label, dominios: item.domains.filter(dominio => leituras.filter(outra => outra.domains.includes(dominio)).length === 1) }))
    .filter(item => item.dominios.length);
  return [
    `Lentes (${rotulo}; ${leituras.length} de 4 observadas): ${todas.length ? `em todas, ${todas.slice(0, 6).join(" · ")}` : "nenhum domínio aparece em todas"}.`,
    ...configuracao,
    ...exclusivos.slice(0, 4).map(item => `- Só em ${item.label}: ${item.dominios.slice(0, 4).join(" · ")}.`),
  ];
}

/*
 * 2026-10-02 · EM QUE LENTE CADA PÁGINA APARECEU. A revisão pediu ligar cada
 * decisão à janela da SERP (achado → janela → URL → decisão → seção). As lentes
 * lidas (o pacote congelado primeiro; sem ele, o cache) dizem, por domínio,
 * "em todas as 4 lentes" ou "só em celular · iOS"; a planta põe isso ao lado de
 * cada evidência S da seção. Uma lente só não é conferência: nada é dito.
 */
function lentesLidas(lentes: RadarPortableSerpLenses | null): Array<{ label: string; domains: readonly string[] }> {
  if (!lentes) return [];
  const pacote = lentes.frozenPackage;
  if (pacote?.state === "frozen" && pacote.canonical) {
    const lidas = pacote.canonical.readings.filter(item => item.observed).map(item => ({ label: item.label, domains: item.competitorDomains }));
    if (lidas.length >= 2) return lidas;
  }
  const principal = lentes.keywords.find(item => item.role === "principal") || lentes.keywords[0];
  return (principal?.readings || []).filter(item => item.observed).map(item => ({ label: item.label, domains: item.competitorDomains }));
}

export function radarWritingDomainLenses(lentes: RadarPortableSerpLenses | null): ((dominio: string) => string | null) | null {
  const lidas = lentesLidas(lentes);
  if (lidas.length < 2) return null;
  const limpo = (dominio: string) => dominio.toLowerCase().replace(/^www\./, "");
  return dominio => {
    const alvo = limpo(dominio);
    const onde = lidas.filter(item => item.domains.some(outro => limpo(outro) === alvo)).map(item => item.label);
    if (!onde.length) return null;
    if (onde.length === lidas.length) return `em todas as ${lidas.length} lentes`;
    return `só em ${onde.join(" e ")} (${onde.length} de ${lidas.length} lentes)`;
  };
}

function linhasDasLentes(lentes: RadarPortableSerpLenses | null): string[] {
  if (!lentes) return [LENTES_NAO_CONFERIDAS];
  const pacote = lentes.frozenPackage;
  if (pacote?.state === "frozen" && pacote.canonical) {
    const lidas = pacote.canonical.readings.filter(item => item.observed).map(item => ({ label: item.label, domains: item.competitorDomains }));
    if (lidas.length >= 2) return resumoDeLentes(lidas, "pacote congelado", configuracaoDasLentes(pacote.canonical.readings));
  }
  const principal = lentes.keywords.find(item => item.role === "principal") || lentes.keywords[0];
  const lidas = (principal?.readings || []).filter(item => item.observed);
  if (lidas.length >= 2) {
    const data = radarWritingDate(lidas.map(item => item.collectedAt).filter((valor): valor is string => Boolean(valor)).sort()[0]);
    return resumoDeLentes(
      lidas.map(item => ({ label: item.label, domains: item.competitorDomains })),
      `cache da marca, fora do pacote${data ? `, observado a partir de ${data}` : ""}`,
      configuracaoDasLentes(principal?.readings || []),
    );
  }
  /* Uma lente só não é conferência entre lentes; a configuração dela é dita, para rastrear. */
  return lidas.length ? [LENTES_NAO_CONFERIDAS, ...configuracaoDasLentes(principal?.readings || [])] : [LENTES_NAO_CONFERIDAS];
}

/**
 * 2026-10-02 · AS PÁGINAS COMPARÁVEIS QUE EMBASARAM AS MEDIDAS E AS CONCLUSÕES.
 *
 * A mediana de palavras e os "N de M páginas" do arquivo vêm destas páginas, e
 * o CSV não dizia quais eram. Título curto e endereço limpo, para conferir;
 * endereço com UUID de terceiro no caminho sai só pelo domínio, como no topo
 * orgânico. Nenhum dado além do que o dossiê guarda.
 */
const COMPARAVEIS_NA_LINHA = 10;

function linhasDosComparaveis(p: Projecoes): string[] {
  const comparaveis = (p.concorrentes?.competitors || []).filter(item => item.comparable);
  if (!comparaveis.length) return [];
  /* Em tópico, e não numerada: a numeração da célula é a ordem do topo orgânico; esta lista não é ranking. */
  const linhas = comparaveis.slice(0, COMPARAVEIS_NA_LINHA).map(item => {
    const url = radarWritingCleanUrl(item.url || "");
    const endereco = url && !/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i.test(url) ? url : item.domain;
    return `- ${cortar(item.title || item.domain, 70)} · ${endereco}`;
  });
  const fora = comparaveis.length - linhas.length;
  return [
    `Páginas comparáveis lidas pela investigação (a base das medidas e dos "N de M páginas" deste arquivo; ${comparaveis.length}):`,
    ...linhas,
    ...(fora > 0 ? [`- e mais ${fora} página(s) comparável(is), na investigação do Radar`] : []),
  ];
}

/*
 * 2026-10-02 · O QUE OS CONCORRENTES LIDOS COBREM, PELOS H2/H3 DELES
 * (`competitor-topics.ts`). O CSV listava QUAIS páginas foram lidas, não O QUE
 * elas tratam: o redator via 6 links e 13 conceitos de 1 página. Agora os temas,
 * com quantas páginas tratam cada um e os cabeçalhos de exemplo; os de 1 página
 * só, à parte. A régua do "não cobrir" vale aqui também.
 */
const TEMAS_RECORRENTES_NA_LINHA = 10;
const TEMAS_UNICOS_NA_LINHA = 8;

export function radarWritingCompetitorTopicsOf(input: RadarPortableExportInput, p: Projecoes) {
  const paginas = input.competitorOutlines || [];
  if (!paginas.length) return null;
  const foraDoEscopo = radarWritingOutOfScope(p);
  return radarCompetitorTopics({
    pages: paginas,
    core: [p.dna.principalKeyword, ...p.dna.secondaryKeywords, ...p.dna.narrativeReinforcements, p.assunto?.phrase || ""].filter((valor): valor is string => Boolean(valor)),
    outOfScope: valor => foraDoEscopo(valor),
  });
}

function linhasDosTemas(input: RadarPortableExportInput, p: Projecoes): string[] {
  const leitura = radarWritingCompetitorTopicsOf(input, p);
  if (!leitura?.topics.length) return [];
  const recorrentes = leitura.topics.filter(item => item.pages >= 2).slice(0, TEMAS_RECORRENTES_NA_LINHA);
  const unicos = leitura.topics.filter(item => item.pages < 2).slice(0, TEMAS_UNICOS_NA_LINHA);
  return [
    `O que os concorrentes lidos cobrem (H2/H3 das ${leitura.sampleSize} páginas comparáveis; ${leitura.headingsRead} cabeçalhos lidos; a recorrência mostra o que a amostra trata, não o que funciona):`,
    ...(recorrentes.length
      ? recorrentes.map(item => `- ${item.label} · ${item.pages} de ${item.sampleSize} páginas · ex.: ${item.headings.map(entreAspas).join("; ")}`)
      : ["- Nenhum tema aparece em mais de uma página: a amostra trata o assunto de jeitos diferentes."]),
    ...(unicos.length ? [`Tratado por 1 página só (diferencial possível, se servir ao leitor): ${unicos.map(item => entreAspas(item.label)).join("; ")}.`] : []),
  ];
}

function colunaSerp(input: RadarPortableExportInput, p: Projecoes): string {
  const serp = p.serpObservada;
  if (!serp) return "";
  const cabecalho = "Referência de pesquisa, não conteúdo a copiar: não reproduza frases nem títulos de terceiros.";
  if (!serp.available) {
    return [cabecalho, `SERP: ${comPontoFinal(serp.unavailableReason || "a coleta referenciada pelo dossiê não está disponível")}`, ...linhasDosComparaveis(p), ...linhasDosTemas(input, p), ...linhasDasLentes(p.lentes)].join("\n");
  }
  const principal = radarWritingCompareKey(input.article.principalKeyword);
  const consulta = texto(serp.query);
  const lugar = texto(serp.location).replace(/\s*\(c[oó]digo[^)]*\)/i, "") || texto(serp.country);
  /* 2026-10-02 · o sistema da coleta principal, quando o pacote o registra: a configuração dela, rastreável. */
  const local = [lugar, serp.language, serp.device, serp.operatingSystem].filter(Boolean).join(" · ");
  const data = radarWritingDate(serp.collectedAt);
  /*
   * A ORDEM ORGÂNICA, E NÃO A POSIÇÃO NA PÁGINA.
   *
   * `position` conta também os recursos da SERP (AI Overview, vídeos, PAA): o
   * topo parecia começar no 7 e ter buracos. A lista numera 1, 2, 3… entre os
   * orgânicos e mantém a posição na página como informação secundária.
   */
  const organicos = serp.organic.slice(0, RADAR_WRITING_EXPORT_LIMITS.organicResults).map((item, indice) => {
    const trecho = item.snippet?.thirdPartyExcerpt ? ` · “${cortar(item.snippet.thirdPartyExcerpt, RADAR_WRITING_EXPORT_LIMITS.thirdPartyExcerptChars)}”` : "";
    const naPagina = typeof item.position === "number" && item.position !== indice + 1 ? ` · posição ${item.position} na página` : "";
    /* A URL limpa, para conferir (2026-10-02); com endereço interno de terceiro no caminho, só o domínio. */
    const url = radarWritingCleanUrl(item.url);
    const endereco = url && !/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i.test(url) ? url : item.domain;
    return `${indice + 1}. ${cortar(item.title || item.domain, RADAR_WRITING_EXPORT_LIMITS.titleChars)} · ${endereco}${item.type && item.type !== "outro" ? ` · ${item.type}` : ""}${naPagina}${trecho}`;
  });
  const formatos = (serp.diagnostic?.dominantFormats || []).filter(item => item && item !== "outro");
  const aiOverview = serp.features?.aiOverview || null;
  const relacionadas = serp.relatedSearches.map(item => texto(item.term)).filter(Boolean).slice(0, 8);
  /* 2026-10-02 · fecho retórico de concorrente não entra em lista nenhuma, nem na SERP resumida. */
  const paa = serp.peopleAlsoAsk.map(item => texto(item.question)).filter(pergunta => pergunta && !radarWritingRhetoricalQuestion(pergunta)).slice(0, 6);
  const auxiliares = serp.auxiliaryQueries.filter(item => item.results.length).slice(0, 3).map(item =>
    `- ${entreAspas(item.query || "consulta auxiliar")} (${item.role}): ${item.results.slice(0, 4).map(resultado => resultado.domain).filter(Boolean).join(" · ")}`);

  return [
    cabecalho,
    `Consulta: ${consulta || "não registrada"}${local ? ` · ${local}` : ""}${data ? ` · coleta de ${data}` : ""}`,
    ...(consulta && principal && radarWritingCompareKey(consulta) !== principal ? [`Atenção: a consulta difere da keyword principal ("${input.article.principalKeyword}").`] : []),
    ...(organicos.length ? ["Topo orgânico, na ordem entre os orgânicos (a posição na página conta também os recursos da SERP):", ...organicos] : []),
    ...linhasDosComparaveis(p),
    ...linhasDosTemas(input, p),
    ...(formatos.length ? [`Formatos dominantes: ${formatos.join(" · ")}`] : []),
    ...(aiOverview
      ? [aiOverview.shown
        ? `AI Overview: aparece${aiOverview.citedSources.length ? `; cita ${aiOverview.citedSources.slice(0, 5).map(item => `${item.domain}${item.title ? ` (${cortar(item.title, 60)})` : ""}`).join(" · ")}` : ""}.`
        : "AI Overview: não apareceu nesta coleta."]
      : []),
    ...linhasDasLentes(p.lentes),
    ...(relacionadas.length ? [`Buscas relacionadas (subtemas): ${relacionadas.join(" · ")}`] : []),
    ...(paa.length ? [`Pessoas também perguntam: ${paa.join(" · ")}`] : []),
    ...(auxiliares.length ? [`Outras consultas ${daUnidade(p.unidade).do} ${p.unidade.noun}:`, ...auxiliares] : []),
  ].join("\n");
}

/* ------------------------------ fontes e especialista ------------------------------ */

function colunaFontes(p: Projecoes, especialista: readonly Contribuicao[], videos: ReadonlyArray<{ rotulo: string; linha: string }>, plano: RadarArticleBlueprintPayload | null = null): string {
  const linhas: string[] = [];
  const ymyl = p.autoridade?.ymylAssessment || null;
  if (ymyl) {
    const exigencia = ymyl.evidenceRequirements.map(item => radarWritingDecodeEntities(item)).find(item => !ehPreenchimento(item));
    linhas.push(`YMYL: ${YMYL[ymyl.relevance] || ymyl.relevance}${exigencia ? ` — ${semPontoFinal(exigencia)}` : ""}${ymyl.specialistReviewRequired ? "; revisão profissional exigida antes de publicar" : ""}.`);
    const conflito = conflitoDeYmyl(p);
    if (conflito) linhas.push(`Conflito no pacote: ${conflito}.`);
  } else {
    linhas.push("Autoridade: a camada de YMYL e de fontes só existe na investigação de páginas do Google; afirmação sensível continua pedindo fonte.");
  }

  const verificadas = (p.autoridade?.factualEvidence || []).filter(item => item.supportType === "SUPPORTS");
  const afirmacaoDe = new Map((p.autoridade?.claims || []).map(claim => [claim.claimId, claim.canonicalClaim]));
  linhas.push(verificadas.length
    ? "Fontes verificadas:"
    : "Fontes verificadas: nenhuma nesta investigação.");
  for (const fonte of unicosPorChave(verificadas, item => `${item.sourceUrl}|${item.claimId}`).slice(0, 6)) {
    linhas.push(`- ${cortar(fonte.sourceTitle || fonte.sourceDomain, 90)} — ${fonte.sourceUrl} — sustenta ${entreAspas(afirmacaoDe.get(fonte.claimId) || "afirmação registrada no pacote")}`);
  }

  /*
   * 2026-10-02 · O MODO DE USO ESCOLHIDO NO RADAR (Adendo B, D6), um vídeo por
   * linha e mesmo sem casamento: Incorporar leva URL e seção; Apoio e Citação,
   * o trecho com tempo; Contexto é para ler, não citar; Sugestão de pauta é
   * ideia a validar. Nunca a transcrição inteira — o corte da célula vale aqui.
   * Sem modo nenhum, o bloco não existe e a célula é a de antes.
   *
   * 2026-10-02 · Com artigo-modelo aprovado, a seção é a que o PLANO escolheu
   * para o vídeo — o bloco não devolve a decisão a ele. Sem plano, ou com
   * versão sem retrato dos vídeos, a linha é a de antes.
   *
   * Revisão de 2026-10-02: o bloco vem ANTES do que é de terceiros (citadas pelo
   * mercado, sem fonte, conflitos). A célula é cortada do fim para o começo, e a
   * decisão do dono não pode ser a primeira a sair.
   */
  /*
   * 2026-10-02 · "Vídeos SELECIONADOS pela marca", e não "da marca": o vídeo
   * escolhido pode ser de outro canal, e cada linha diz o canal (ou que ele não
   * está registrado). Citação e Apoio são atribuídos a ele.
   */
  const modos = p.video.selected || [];
  if (modos.length) {
    linhas.push("Vídeos selecionados pela marca (modo de uso escolhido no Radar, decisão do dono; conferir no vídeo e atribuir ao canal):");
    for (const item of modos) linhas.push(`- ${radarPortableVideoUsageLine(item, plano ? radarArticleBlueprintVideoSections(plano, item) : null)}`);
  }

  const citadas = p.fontesExternas.filter(item => item.authorityClass !== "NAO_CLASSIFICADA");
  if (citadas.length) {
    /* 2026-10-08 (correção da revisão) · D10: a regra concluída, não "conferir antes de citar". */
    linhas.push("Citadas pelo mercado, sem verificação no pacote (só como referência delimitada, nunca como fonte da afirmação):");
    for (const fonte of unicosPorChave(citadas, item => item.url).slice(0, 6)) {
      const titulo = /^https?:\/\//.test(fonte.title) ? fonte.domain : cortar(fonte.title, 80);
      linhas.push(`- ${titulo} — ${fonte.url} (${fonte.authorityClass}; citada por ${fonte.citedByPages} página(s))`);
    }
  }

  const semFonte = radarWritingUnsupportedClaims(p.autoridade, p.serp);
  if (semFonte.length) {
    linhas.push("Não afirmar como fato sem fonte:");
    for (const item of unicosPorChave(semFonte, entrada => radarWritingCompareKey(entrada.afirmacao)).slice(0, 6)) {
      linhas.push(`- ${entreAspas(radarWritingDecodeEntities(item.afirmacao))}${item.mercado ? ` (${item.mercado}; sem fonte adequada)` : ""}`);
    }
  }

  const conflitos = p.autoridade?.marketVsFactConflicts || [];
  if (conflitos.length) {
    linhas.push("Mercado × fonte (escreva os dois lados, sem resolver em silêncio):");
    for (const conflito of conflitos.slice(0, 4)) {
      linhas.push(`- ${entreAspas(conflito.canonicalClaim)}: o mercado repete ${entreAspas(cortar(conflito.marketObservation, 160))}; a fonte diz ${entreAspas(cortar(conflito.factualPosition, 160))} (trecho de terceiro, não copiar)`);
    }
  }

  /* 2026-10-08 · D10: o parecer ainda não aceito fica fora do texto — dito como regra cumprida, sem "aguardando" (como o CSV de vídeo, 2026-10-07). */
  const pendentes = p.especialista.pending;
  linhas.push(especialista.length
    ? "Especialista:"
    : pendentes
      ? `Especialista: sem contribuição aceita; ${pendentes} parecer(es) ainda não aceito(s) no Radar ficam fora deste texto.`
      : "Especialista: sem contribuição aceita.");
  if (especialista.length && pendentes) linhas.push(`- ${pendentes} parecer(es) ainda não aceito(s) no Radar ficam fora deste texto.`);
  for (const item of especialista) linhas.push(`- ${item.linha}`);

  if (videos.length) {
    linhas.push("Trechos dos vídeos selecionados pela marca (embutir ou citar no ponto indicado, atribuído ao vídeo e ao canal; conferir o trecho no vídeo):");
    for (const item of videos) linhas.push(`- ${item.linha}`);
  }
  return linhas.join("\n");
}

/* ------------------------------ links, visual e produtos ------------------------------ */

/**
 * A FALTA DE LINK É DITA, E NÃO PREENCHIDA.
 *
 * Um artigo do Silo sem plano de links sairia isolado do Pilar e da SiloPage
 * sem ninguém perceber — e o prompt proíbe criar links. O export não inventa
 * o link (invariante 30): declara a falta na célula e no veredito.
 */
const SEM_PLANO_DE_LINKS = "Nenhum link: o pacote não traz plano de links para este artigo (nem para o Pilar, nem para a SiloPage). Não crie links; o plano é do Arquiteto.";
const SEM_LINK_PARA_A_SILOPAGE = "Nenhum link para a SiloPage no pacote: não crie um; o plano é do Arquiteto.";

const artigoDeSilo = (contexto: RadarWritingArticleContext): boolean => contexto.silo?.kind === "silo";

function colunaLinks(links: readonly LinkDeEscrita[], contexto: RadarWritingArticleContext, unidade: RadarWritingUnit = ARTIGO_COMO_UNIDADE): string {
  /* 2026-10-02 · "para esta landing page" quando a unidade não é artigo; o artigo continua com a frase de antes. */
  const semPlano = unidade.kind === "article" ? SEM_PLANO_DE_LINKS : SEM_PLANO_DE_LINKS.replace("para este artigo", `para ${daUnidade(unidade).este} ${unidade.noun}`);
  if (!links.length) return artigoDeSilo(contexto) ? semPlano : "";
  const semPagina = artigoDeSilo(contexto) && !links.some(link => link.direcao === DIRECAO.ARTICLE_TO_SILO_PAGE);
  return [
    "Aplique somente estes links, com a âncora indicada (pode ajustar concordância), distribuídos pelas seções:",
    ...links.map(link => [
      `${link.rotulo} · âncora "${link.ancora}"`,
      ...(link.alternativas.length ? [` (ou ${link.alternativas.map(item => `"${item}"`).join(", ")})`] : []),
      ` → ${link.destino}`,
      ...(link.onde ? [` · onde: ${link.onde}`] : []),
      ...(link.direcao ? [` · ${link.direcao}`] : []),
    ].join("")),
    ...(semPagina ? [SEM_LINK_PARA_A_SILOPAGE] : []),
  ].join("\n");
}

const EVITAR = "Evitar: ";

/*
 * 2026-10-02 · A REGRA É CAPA + 2 OU 3 RESPIROS (AGENTS §13), para qualquer
 * tipo de página. O plano do pacote só põe respiro em seção H2 elegível: com
 * uma seção só, saía "uma capa e 1 respiro" — a regra reduzida em silêncio.
 * Agora o respiro que falta é declarado, com o lugar sugerido (depois da
 * abertura ou antes do fechamento) e a decisão devolvida à estrutura final.
 */
export const RADAR_WRITING_MIN_RESPITES = 2;

function colunaVisual(input: RadarPortableExportInput, p: Projecoes): { celula: string; imagens: Map<string, string> } {
  const imagens = new Map<string, string>();
  /* A seção de fecho retórico que a estrutura omite também não recebe respiro (a mesma régua da estrutura, 2026-10-02). */
  const omitida = (secao: string | null) => {
    if (!secao || !radarWritingRhetoricalHeading(secao, p.unidade)) return false;
    return !p.secoes.find(item => item.heading === secao)?.mustCoverReasons.length;
  };
  const respirosDoPacote = p.visual.respite.filter(imagem => !omitida(imagem.section)).slice(0, 3);
  const plano: RadarPortableImagePlan[] = [...(p.visual.cover ? [p.visual.cover] : []), ...respirosDoPacote];
  if (!plano.length) return { celula: "", imagens };
  const faltantes = p.visual.cover ? Math.max(0, RADAR_WRITING_MIN_RESPITES - respirosDoPacote.length) : 0;
  const unidade = p.unidade;
  const formas = daUnidade(unidade);
  const funcaoDaImagem = (valor: string) => (unidade.kind === "article" ? valor : valor.replace(/\bdo artigo\b/g, `d${formas.o} ${unidade.noun}`));
  /*
   * ALT, LEGENDA E PROMPT DE PREENCHIMENTO FICAM DE FORA — com o motivo dito.
   *
   * O plano visual monta o ALT a partir do conceito da seção, e o conceito
   * às vezes é só o OBJETIVO da seção ou a PROMESSA do artigo ("Ao final, o
   * leitor sabe…"). Isso não descreve imagem nenhuma. O export não reescreve:
   * omite o campo e diz uma vez que ele precisa ser escrito.
   */
  /*
   * A PERGUNTA DA SEÇÃO, O CABEÇALHO E OS PONTOS DE COBERTURA TAMBÉM SÃO MOLDURA.
   *
   * O caso real trazia "ALT: Qual a ordem dos produtos" — um ponto de
   * cobertura, sem relação com a imagem — e ALTs iguais ao cabeçalho. Um ALT
   * idêntico a um desses textos não descreve imagem; um prompt que só os
   * repete como "assunto" também não.
   */
  const daEstrutura = p.secoes.flatMap(secao => [secao.readerQuestion || "", ...secao.coveragePoints]);
  const molduras = new Set([
    ...p.secoes.flatMap(secao => [secao.objective, secao.keyMessage || ""]),
    ...daEstrutura,
    p.editorial.readerPromise || "",
    p.editorial.objective || "",
    input.article.promise || "",
  ].map(radarWritingCompareKey).filter(chave => chave.length >= 6));
  const cabecalhos = new Set(p.secoes.map(secao => radarWritingCompareKey(secao.heading)).filter(chave => chave.length >= 6));
  const ehMoldura = (valor: string | null | undefined): boolean => {
    const chave = radarWritingCompareKey(valor);
    return ehPreenchimento(valor) || /^ao final\b/.test(chave) || molduras.has(chave) || cabecalhos.has(chave);
  };
  const promptComMoldura = (valor: string): boolean => {
    const chave = radarWritingCompareKey(valor);
    return ehPreenchimento(valor) || /cobrir com clareza o tema|ao final o leitor/.test(chave)
      || [...molduras].some(moldura => moldura.length >= 20 && chave.includes(moldura));
  };
  const aEscrever: string[] = [];
  const linhas = [`Plano visual do pacote (quem redige confirma): ${p.visual.cover ? "uma capa" : "sem capa"} e ${respirosDoPacote.length + faltantes} respiro(s).`];
  if (faltantes) {
    linhas.push(`Regra: capa + 2 ou 3 respiros. A estrutura deste pacote só ancora ${respirosDoPacote.length} respiro(s) em seção; ${faltantes === 1 ? "o que falta não foi cortado" : "os que faltam não foram cortados"}: o lugar ${faltantes === 1 ? "dele" : "deles"} se define na estrutura final.`);
  }
  let respiro = 0;
  for (const imagem of plano) {
    const capa = imagem.imageRole === "COVER";
    if (!capa) respiro += 1;
    const nome = capa ? "Capa" : `Respiro ${respiro}`;
    if (!capa && imagem.section) imagens.set(imagem.section, `respiro ${respiro}`);
    const alt = ehMoldura(imagem.altTextSuggestion) ? null : texto(imagem.altTextSuggestion);
    const legenda = ehMoldura(imagem.captionSuggestion) ? null : texto(imagem.captionSuggestion);
    const prompt = !ehMoldura(imagem.concept) && !promptComMoldura(imagem.generationPrompt) ? texto(imagem.generationPrompt) : null;
    const faltam = [!alt ? "ALT" : null, !legenda ? "legenda" : null, !prompt ? "prompt" : null].filter(Boolean);
    if (faltam.length) aEscrever.push(`${nome} (${faltam.join(", ")})`);
    linhas.push([
      `${nome} · ${capa ? "topo, junto do H1" : `seção "${imagem.section}"`} · ${imagem.recommendedAspectRatio}`,
      `função: ${semPontoFinal(funcaoDaImagem(imagem.purpose))}`,
      ...(alt ? [`ALT: ${alt}`] : []),
      ...(legenda && legenda !== alt ? [`legenda: ${legenda}`] : []),
      ...(prompt ? [`prompt: ${cortar(prompt, 300)}`] : []),
    ].join(" · "));
  }
  for (let indice = 0; indice < faltantes; indice += 1) {
    respiro += 1;
    /* O primeiro que falta, sem nenhum respiro em seção, vai depois da abertura; os outros, antes do fechamento. */
    const lugar = respiro === 1 ? "depois da abertura" : "antes do fechamento";
    linhas.push(`Respiro ${respiro} · definir a seção na estrutura final (sugestão: ${lugar}) · 4:3 · função: dar respiro e ancorar o assunto do trecho em que entrar`);
    aEscrever.push(`Respiro ${respiro} (seção, ALT, legenda, prompt)`);
  }
  if (aEscrever.length) linhas.push(`A escrever a partir do conteúdo real da seção (o pacote não trazia texto utilizável): ${aEscrever.join("; ")}.`);
  if (faltantes) linhas.push("Prompts das imagens: com artigo-modelo da SERP organizado no Radar, eles saem dele; sem ele, escreva-os a partir do conteúdo real de cada trecho.");
  const evitar = unicosPorChave(plano.flatMap(imagem => imagem.negativeGuidance), radarWritingCompareKey).map(semPontoFinal);
  if (evitar.length) linhas.push(`${EVITAR}${evitar.join("; ")}.`);
  return { celula: linhas.join("\n"), imagens };
}

function colunaProdutos(input: RadarPortableExportInput): string {
  if (input.profile !== "AMAZON" || !input.commercial) return "";
  const comercial = input.commercial;
  const setup = comercial.setup ?? input.amazon?.setup ?? null;
  const tipo = setup?.intent.type as RadarAmazonEditorialIntentType | undefined;
  const universo = new Map((input.amazon?.universe || []).map(item => [item.asin, item]));
  const data = radarWritingDate(input.dossierGaps?.status.frozenObservedAt ?? input.dossierGaps?.status.bundle.research.amazon?.frozenAt ?? null);
  const linhas = [
    `Formato: ${tipo ? RADAR_AMAZON_INTENT_LABELS[tipo] || tipo : "lista de produtos"}${setup?.intent.desiredCount ? ` · ${setup.intent.desiredCount} produtos` : ""}`,
    ...(comercial.comparisonCriteria.length ? [`Critérios de comparação: ${comercial.comparisonCriteria.join(" · ")}`] : []),
    ...(setup?.target.brandFilter ? [`Marca exigida: ${setup.target.brandFilter}`] : []),
  ];
  if (!comercial.links.length) {
    linhas.push(`Produtos selecionados: nenhum produto selecionado${comercial.counts ? ` (${comercial.counts.observed} observados na prateleira, ${comercial.counts.eligible} compatíveis com o alvo)` : ""}.`);
    return linhas.join("\n");
  }
  linhas.push("Produtos selecionados:");
  comercial.links.forEach((link, indice) => {
    const item = universo.get(link.asin);
    const preco = item?.priceFrom != null
      ? `${new Intl.NumberFormat("pt-BR", { style: "currency", currency: item.currency || "BRL" }).format(item.priceFrom)} observado${data ? ` em ${data}` : " na coleta"}`
      : null;
    const nota = item?.ratingValue != null ? `nota ${numeroBr(item.ratingValue)}${item.ratingVotes != null ? ` (${numeroBr(item.ratingVotes)} avaliações)` : ""}` : null;
    const selos = [item?.isAmazonChoice ? "Escolha da Amazon" : null, item?.isBestSeller ? "Mais vendido" : null].filter(Boolean);
    linhas.push(`${indice + 1}. ${cortar(link.productName, 110)}${preco ? ` · ${preco}` : ""}${nota ? ` · ${nota}` : ""}${selos.length ? ` · ${selos.join(", ")}` : ""} · ${radarWritingCleanUrl(link.amazonUrl)}`);
  });
  linhas.push("Preço e nota são da coleta: não prometa preço atual. A tag de afiliado entra na publicação, não no texto.");
  if (comercial.disclosureRequired) linhas.push("Aviso de afiliado: obrigatório antes do primeiro link de produto.");
  return linhas.join("\n");
}

/* ------------------------------ o prompt ------------------------------ */

/**
 * O PROMPT DA LINHA É CURTO: o específico do artigo, e as regras pela linha de topo.
 *
 * As regras gerais moram UMA vez na linha "Silo"/"Marca". Repeti-las inteiras
 * em cada artigo era o mesmo volume repetido de que o dono do produto
 * reclamou. Ficam aqui só as guardas que não podem se perder quando alguém
 * copia uma linha sozinha: sem FAQ, terceiros são pesquisa, nada inventado.
 *
 * Linha BLOQUEADA não recebe instrução de escrever: um "Não escreva" seguido
 * de "Escreva em português…" se contradiz.
 */
function colunaPrompt(contexto: RadarWritingArticleContext, especificas: readonly string[], bloqueio: string | null, unidade: RadarWritingUnit = ARTIGO_COMO_UNIDADE): string {
  /* 2026-10-02 · o tipo da unidade: "o artigo descrito", "a landing page descrita"; a data visível só na unidade editorial. */
  const formas = daUnidade(unidade);
  if (bloqueio) {
    return `Não escreva ${formas.este} ${unidade.noun} antes de resolver o bloqueio: ${comPontoFinal(bloqueio)} Depois de resolvido, exporte de novo para receber o prompt de escrita.`;
  }
  const topo = contexto.topRowLabel;
  return [
    `Escreva em português do Brasil ${formas.o} ${unidade.noun} descrit${formas.terminacao} nesta linha, com as regras gerais da linha "${topo}" deste arquivo (${contexto.brandVoice ? `leve as três linhas juntas para a IA: "${topo}", "Voz da marca" e esta` : "leve as duas linhas juntas para a IA"}). Em resumo: a estrutura é sugestão, e a estrutura final e a extensão são decisão de quem redige; keyword principal no H1, no primeiro parágrafo e com naturalidade no corpo; cada seção abre respondendo a pergunta dela; sem seção de perguntas frequentes; a SERP e os trechos de concorrentes são pesquisa: não copie frases nem títulos; não invente fatos, fontes, depoimentos nem URLs; só os links L1, L2… indicados. Entregue H1, SEO title, meta description e o texto em Markdown${unidade.editorial ? ", com a data de atualização visível" : ""}.`,
    ...(especificas.length ? [`${formas.neste} ${unidade.noun}:`, ...especificas.map(item => `- ${comPontoFinal(item)}`)] : []),
    /* 2026-10-02 · D10 (decisão do dono): o prompt sai fechado — sem "proposta" nem "aguardando aprovação". */
  ].join("\n");
}

/* ============================== o veredito ============================== */

/** O nome curto de um motivo: o trecho antes da primeira explicação (":" ou ";"). */
const motivoCurto = (valor: string): string => cortar(semPontoFinal(valor.split(/[:;]/)[0] || valor), 80);

/**
 * O VEREDITO: até quatro motivos por inteiro, e o resto pelo NOME.
 *
 * "(+2 ressalva(s) nas colunas desta linha)" escondia, no caso real, que o
 * título do pacote era inutilizável. O excedente agora aparece pelo nome
 * curto de cada motivo, e o motivo repetido (mesma frase) entra uma vez só.
 */
function veredito(bloqueios: readonly string[], ressalvas: readonly string[]): { verdict: RadarWritingVerdict; celula: string; primeira: string | null } {
  const limite = RADAR_WRITING_EXPORT_LIMITS.verdictReasons;
  const todos = unicosPorChave([...bloqueios, ...ressalvas], radarWritingCompareKey);
  if (!todos.length) return { verdict: "Sim", celula: "Sim", primeira: null };
  const verdict: RadarWritingVerdict = bloqueios.length ? "Não" : "Com ressalva";
  const mostrados = todos.slice(0, limite);
  const resto = todos.slice(limite);
  return {
    verdict,
    primeira: mostrados[0],
    celula: [
      `${verdict}: ${comPontoFinal(mostrados[0])}`,
      ...mostrados.slice(1).map(item => `- ${comPontoFinal(item)}`),
      ...(resto.length ? [`- Também: ${resto.map(motivoCurto).join("; ")} (detalhes nas colunas desta linha).`] : []),
    ].join("\n"),
  };
}

/* ============================== os limites da linha ============================== */

const CORTAVEIS: readonly RadarWritingExportColumn[] = ["cobrir_e_superar", "fontes_e_especialista", "plano_visual", "serp_resumida"];

function cortarCelula(celula: string, limite: number, motivo: string): string {
  if (celula.length <= limite) return celula;
  const aviso = `\n[…] ${motivo}`;
  const espaco = Math.max(0, limite - aviso.length);
  const quebra = celula.lastIndexOf("\n", espaco);
  return `${celula.slice(0, quebra > 0 ? quebra : espaco).trimEnd()}${aviso}`;
}

/**
 * ===== A LINHA CABE NO TETO =====
 *
 * Primeiro o teto de cada célula; depois o do artigo, cortando na ordem de
 * `CORTAVEIS`. O corte é sempre em fim de linha e sempre declarado.
 */
function dentroDosLimites(linha: RadarWritingExportRow): RadarWritingExportRow {
  const saida = { ...linha };
  for (const coluna of RADAR_WRITING_EXPORT_COLUMNS) {
    const limite = radarWritingCellLimit(coluna);
    saida[coluna] = cortarCelula(saida[coluna], limite, `Célula cortada no limite de ${numeroBr(limite)} caracteres.`);
  }
  const total = () => RADAR_WRITING_EXPORT_COLUMNS.reduce((soma, coluna) => soma + saida[coluna].length, 0);
  const motivo = `Cortado para o artigo caber em ${numeroBr(RADAR_WRITING_EXPORT_LIMITS.articleChars)} caracteres.`;
  /* Primeiro passe: cada cortável guarda o começo. Só se ainda não couber, o segundo corta sem piso. */
  for (const piso of [RADAR_WRITING_EXPORT_LIMITS.cutFloorChars, 0]) {
    for (const coluna of CORTAVEIS) {
      const excesso = total() - RADAR_WRITING_EXPORT_LIMITS.articleChars;
      if (excesso <= 0) return saida;
      if (saida[coluna].length <= piso) continue;
      const alvo = Math.max(piso, saida[coluna].length - excesso);
      saida[coluna] = alvo < motivo.length + 10 ? `[…] ${motivo}` : cortarCelula(saida[coluna], alvo, motivo);
    }
  }
  return saida;
}

const finalizarLinha = (linha: RadarWritingExportRow): RadarWritingExportRow => {
  const limpa = {} as RadarWritingExportRow;
  for (const coluna of RADAR_WRITING_EXPORT_COLUMNS) limpa[coluna] = radarWritingSpreadsheetSafe(higiene(linha[coluna] || ""));
  return dentroDosLimites(limpa);
};

/* ============================== o artigo ============================== */

/**
 * 2026-10-02 · O MODO DO VÍDEO DE UM TRECHO V (Adendo B, D6). Sem modo, nada
 * se acrescenta e a linha é a de antes.
 */
function modoDoTrecho(trecho: RadarPortableVideoExtract): string {
  if (trecho.usage === "SUPPORT") return " · Apoio: o trecho sustenta o ponto, atribuído ao vídeo e com o tempo";
  if (trecho.usage === "QUOTE") return " · Citação: fala literal entre aspas, atribuída ao vídeo e com o tempo";
  if (trecho.usage === "EMBED") return ` · Incorporar o vídeo nesta seção${trecho.sourceUrl ? `: ${trecho.sourceUrl}` : ""}`;
  return "";
}

/**
 * ===== UMA LINHA POR ARTIGO — o que é preciso para escrever, e nada além =====
 *
 * `contexto` diz onde o artigo está no arquivo (silo ou avulso) e o que se
 * sabe da página publicada. A entrada é a MESMA do formato completo.
 */
export function buildRadarWritingExportArticle(input: RadarPortableExportInput, contextoRecebido: RadarWritingArticleContext): RadarWritingExportArticle {
  const p = radarWritingProjections(input);
  /*
   * 2026-10-08 · B4 também aqui: o artigo-modelo com os nomes atuais de
   * produtos ("Perfil da Empresa no Google"), para valer em todo caminho que
   * monte esta linha — a leitura do servidor já troca; sem troca, o MESMO
   * objeto. A keyword que traz o nome antigo o preserva.
   */
  const plantaAtual = contextoRecebido.blueprint ? radarArticleBlueprintWithCurrentNames(contextoRecebido.blueprint, keywordsDoArtigo(p)) : null;
  const contexto: RadarWritingArticleContext = plantaAtual && plantaAtual !== contextoRecebido.blueprint ? { ...contextoRecebido, blueprint: plantaAtual } : contextoRecebido;
  const membro = contexto.silo?.members.find(item => item.articleId === contexto.articleId) || null;
  const papel = (membro && membro.role !== "sem silo" ? papelLegivel(membro.role) : null) || papelLegivel(p.dna.siloRole);
  const posicao = membro?.position ?? contexto.filePosition;
  const principal = texto(p.dna.principalKeyword) || null;
  const rotulo = principal || texto(input.article.slug) || "artigo sem keyword";
  const publicacao = contexto.publication;
  const publicado = Boolean(publicacao?.published || input.article.publishedProtected);

  const links = linksDeEscrita(p, contexto, principal);
  const especialista = radarWritingSpecialistContributions(p);
  /*
   * 2026-10-02 · O TRECHO QUE VAI AO TEXTO É O DE VÍDEO CITÁVEL (Adendo B).
   *
   * Contexto ("ler para entender, não citar") e Sugestão de pauta ("ideia a
   * validar") não viram V no texto: eles aparecem no bloco dos modos da coluna
   * de fontes. "Não usar" já saiu na projeção. Sem modo, todo trecho é citável
   * e a lista é exatamente a de antes.
   */
  const citavel = (trecho: RadarPortableVideoExtract) => trecho.usage !== "CONTEXT" && trecho.usage !== "TOPIC_SUGGESTION";
  const videos = p.video.briefs
    .filter(brief => brief.coverage.startsWith("Sustentada") && brief.extracts.some(citavel))
    .flatMap(brief => brief.extracts.filter(citavel).slice(0, 1).map(trecho => ({ brief, trecho })))
    .map((item, indice) => ({
      rotulo: `V${indice + 1}`,
      trecho: item.trecho,
      secao: p.secoes.find(secao => radarWritingCompareKey(secao.heading) === radarWritingCompareKey(item.brief.relatedSection))?.heading ?? null,
      /* 2026-10-02 · o canal do vídeo, quando o modo de uso o trouxe: a atribuição é a ele. */
      linha: `V${indice + 1} · ${entreAspas(item.trecho.sourceTitle)}${texto(item.trecho.sourceChannel) ? ` · canal: ${texto(item.trecho.sourceChannel)}` : ""} (${item.trecho.startLabel}–${item.trecho.endLabel})${item.brief.relatedSection ? ` · seção "${item.brief.relatedSection}"` : ""} · ${semPontoFinal(item.brief.narrativePurpose)}${modoDoTrecho(item.trecho)}`,
    }));
  const videosPorSecao = new Map<string, string[]>();
  for (const item of videos) if (item.secao) videosPorSecao.set(item.secao, [...(videosPorSecao.get(item.secao) || []), item.rotulo]);
  /*
   * 2026-10-02 · OS VÍDEOS DO ARTIGO AGORA, para o artigo-modelo aprovado
   * (Adendo B). O V da seção do plano é o do PEDIDO à IA; aqui ele vira título,
   * endereço e o V desta coluna de fontes, contra o modo vigente — "Não usar"
   * já saiu da projeção, então o vídeo que sumiu daqui é aviso, não instrução.
   * Só é usado quando há plano aprovado; sem ele, nada muda.
   */
  const rotuloNasFontes = new Map(videos.map(item => [item.trecho, item.rotulo]));
  const videosAoVivo: RadarArticleBlueprintLiveVideo[] = [
    ...p.video.briefs.flatMap(brief => brief.extracts.map(trecho => ({
      title: trecho.sourceTitle,
      url: trecho.sourceUrl ?? null,
      usage: trecho.usage ?? null,
      sourcesColumnLabel: rotuloNasFontes.get(trecho) ?? null,
    }))),
    ...(p.video.selected || []).map(item => ({ title: item.title, url: item.url, usage: item.usage, sourcesColumnLabel: null })),
  ];

  /*
   * 2026-10-02 · UMA régua de "não cobrir" para a linha inteira (pacote e
   * Silo), e o tipo da unidade para as frases que falavam só de artigo.
   */
  const tocaForaDoEscopo = radarWritingOutOfScope(p, contexto.silo?.excludedTopics || []);
  const unidade = p.unidade;
  const formas = daUnidade(unidade);

  const visual = colunaVisual(input, p);
  const estrutura = colunaEstrutura(input, p, links, especialista, visual.imagens, videosPorSecao, tocaForaDoEscopo);
  const perguntaDeAbertura = radarWritingOpeningQuestion(p, tocaForaDoEscopo);
  const cobrir = colunaCobrir(input, p, contexto, perguntaDeAbertura, tocaForaDoEscopo);
  const titulo = colunaTitulo(input, p);

  /* ---- o veredito ---- */
  const bloqueios: string[] = [];
  const ressalvas: string[] = [];
  if (p.prontidao?.state === "BLOCKED") {
    bloqueios.push(`a plataforma recusaria este dossiê: ${p.prontidao.reasons.join("; ")} (${p.prontidao.actions.join("; ")})`);
  }
  if (input.profile === "YOUTUBE") {
    bloqueios.push("a investigação deste artigo foi feita para vídeo do YouTube: a estrutura é roteiro e não há SERP de artigo; para escrever texto, a pesquisa precisa ser feita no perfil Google");
  }
  if (input.profile === "AMAZON" && input.commercial && !input.commercial.links.length) {
    const formato = formatoLegivel(input, p.editorial) || "lista de produtos";
    const contagem = input.commercial.counts ? ` (${input.commercial.counts.observed} observados, ${input.commercial.counts.eligible} compatíveis com o alvo)` : "";
    bloqueios.push(`formato ${formato}, mas nenhum produto foi selecionado${contagem}; não há lista a construir`);
  }
  if (!p.editorial.sections.length) bloqueios.push(`a investigação não produziu estrutura para ${formas.este} ${unidade.noun}`);

  const conflitoYmyl = conflitoDeYmylDetalhado(p);
  if (conflitoYmyl) ressalvas.push(conflitoYmyl.texto);
  /* A afirmação que o conflito já nomeia não vira um segundo motivo com a mesma frase. */
  const jaNoConflito = new Set(conflitoYmyl?.nomeadas || []);
  const semFonte = unicosPorChave(radarWritingUnsupportedClaims(p.autoridade, p.serp), item => radarWritingCompareKey(item.afirmacao))
    .filter(item => !jaNoConflito.has(radarWritingCompareKey(item.afirmacao)));
  const sensivel = temaSensivel(p);
  if (semFonte.length) {
    const varias = semFonte.length > 1;
    ressalvas.push(`${semFonte.slice(0, 2).map(item => entreAspas(radarWritingDecodeEntities(item.afirmacao))).join(" e ")} ${varias ? "são afirmações" : "é afirmação"}${sensivel ? (varias ? " sensíveis" : " sensível") : ""} sem fonte verificada: escreva de forma qualificada ou omita`);
  }
  const desejados = input.commercial?.setup?.intent.desiredCount ?? input.amazon?.setup?.intent.desiredCount ?? null;
  if (input.profile === "AMAZON" && input.commercial?.links.length && desejados && input.commercial.links.length < desejados) {
    ressalvas.push(`o formato pede ${desejados} produtos e só ${input.commercial.links.length} foi(ram) selecionado(s): não complete a lista com produto que não está no arquivo`);
  }
  if (publicado && !publicacao?.currentStructure) {
    ressalvas.push("estrutura publicada atual indisponível: trate como atualização, preservando URL, slug, canonical e as seções existentes, sem remover conteúdo sem decisão humana");
  }
  const politica = radarWritingCompareKey(publicacao?.principalPolicy);
  if (publicado && politica !== "locked" && politica !== "revisable") ressalvas.push("principal publicada em estado desconhecido: não trocar até decisão humana");
  if (titulo.tituloInutil) ressalvas.push("título de trabalho do pacote não utilizável (soma vários assuntos): formule o H1 a partir da promessa e da estrutura");
  if (!util(p.editorial.readerPromise) && input.profile !== "YOUTUBE") ressalvas.push("promessa ao leitor não definida no pacote");
  for (const item of especialista) if (item.aviso) ressalvas.push(`especialista ${item.rotulo}: ${item.aviso}`);
  ressalvas.push(...cobrir.conflitos);
  /* 2026-10-08 · a planta que já posiciona links internos (coluna links_internos dela) não deixa o artigo isolado do Silo. */
  const plantaComLinks = Boolean(contexto.blueprint?.blueprint.sections.some(secao => secao.internalLinks.length));
  if (artigoDeSilo(contexto) && !links.length && !plantaComLinks && input.profile !== "YOUTUBE") {
    ressalvas.push(`sem links internos no pacote: ${formas.o} ${unidade.noun} sai isolad${formas.terminacao} do Silo (sem link para o Pilar nem para a SiloPage) até o Arquiteto definir o plano de links`);
  }
  const decisao = veredito(bloqueios, ressalvas);
  /*
   * BLOQUEIO DE PERFIL: a pesquisa foi feita para vídeo, não para texto.
   *
   * Roteiro, SERP de vídeo e plano visual de roteiro não servem para escrever
   * o artigo — e a linha ficava com ~4 mil caracteres que não devem ser
   * usados. Ela se reduz à ordem, ao veredito e à identidade do artigo. O
   * formato completo continua com tudo, para auditoria.
   */
  const soIdentidade = input.profile === "YOUTUBE";

  /* ---- as linhas específicas do prompt: o bloqueio, o publicado e o comercial ---- */
  const especificas = [
    ...(decisao.verdict === "Com ressalva" && decisao.primeira ? [decisao.primeira] : []),
    ...(publicado ? [
      /* 2026-10-08 · C2 · com o mapa da atualização (artigo-modelo e H2 publicados), o prompt aponta para ele. */
      contexto.blueprint && (publicacao?.currentStructure?.h2.length || contexto.blueprint.publishedStructure?.h2.length)
        ? `${formas.Nome} publicad${formas.terminacao}: é atualização; preserve URL, slug e canonical e siga o mapa da página publicada (coluna artigo): nenhuma seção existente sai sem decisão registrada no artigo-modelo`
        : `${formas.Nome} publicad${formas.terminacao}: é atualização; preserve URL, slug e canonical e não remova seção existente sem decisão humana`,
      /* 2026-10-02 · a MESMA frase do FAQ legado da regra geral e da coluna artigo (AGENTS §13). */
      RADAR_WRITING_LEGACY_FAQ,
    ] : []),
    ...(input.profile === "AMAZON" && input.commercial?.disclosureRequired ? ["Coloque o aviso de afiliado antes do primeiro link de produto"] : []),
  ].slice(0, publicado ? 4 : 3);

  const conteudo = (celula: () => string): string => (soIdentidade ? "" : celula());
  const linha: RadarWritingExportRow = {
    ordem: `${posicao} · ${papel || "Artigo"}`,
    pode_escrever: decisao.celula,
    artigo: colunaArtigo(input, p, contexto, papel),
    promessa_e_leitor: conteudo(() => colunaPromessa(input, p, contexto, perguntaDeAbertura, especialista, links)),
    titulo_e_seo: conteudo(() => titulo.celula),
    estrutura: conteudo(() => estrutura.celula),
    cobrir_e_superar: conteudo(() => cobrir.celula),
    serp_resumida: conteudo(() => colunaSerp(input, p)),
    fontes_e_especialista: conteudo(() => colunaFontes(p, especialista, videos, contexto.blueprint ?? null)),
    links_internos: conteudo(() => colunaLinks(links, contexto, unidade)),
    plano_visual: conteudo(() => visual.celula),
    produtos: conteudo(() => colunaProdutos(input)),
    prompt: colunaPrompt(contexto, especificas, decisao.verdict === "Não" ? decisao.primeira : null, unidade),
  };
  /*
   * O artigo-modelo APROVADO decide as colunas de planta; o resto continua como era.
   * 2026-10-08 · C2 e C4 · a planta recebe a trava de fonte (as afirmações do
   * pacote e as raízes de cenário, como no CSV de vídeo) e os H2 publicados,
   * para marcar a frase que só entra com fonte e o destino de cada H2.
   */
  if (contexto.blueprint && !soIdentidade) {
    Object.assign(linha, radarArticleBlueprintColumns(contexto.blueprint, videosAoVivo, { slug: texto(publicacao?.slug) || texto(input.article.slug), publishedUrl: texto(publicacao?.publishedUrl) }, radarWritingDomainLenses(p.lentes), {
      pendentes: radarPendingClaims(p, contexto.blueprint),
      comuns: radarClaimCommonStems(p, contexto.blueprint),
      /* 2026-10-08 (correção da revisão) · a principal, para a ordem de leitura da busca "como …" também na planta antiga. */
      principal: texto(p.dna.principalKeyword),
      ...(publicado ? { currentH2: publicacao?.currentStructure?.h2 ?? null, keywords: keywordsDoArtigo(p) } : {}),
    }));
  }
  if (contexto.brandVoice && !soIdentidade) {
    linha.promessa_e_leitor = [
      linha.promessa_e_leitor,
      `Voz da marca: copy, CTA e transição comercial seguem a linha "Voz da marca" deste arquivo (Skill "${contexto.brandVoice.name}" v${contexto.brandVoice.version}). Oferta e página comercial só como a Skill e o plano de links permitem; sem inventar preço, prazo nem garantia.`,
    ].filter(Boolean).join("\n");
  }

  return {
    row: finalizarLinha(linha),
    verdict: decisao.verdict,
    label: rotulo,
    firstReason: decisao.primeira,
    healthTopic: sensivel,
    published: publicado,
    ...(unidade.kind !== "article" ? { unitNoun: unidade.noun } : {}),
  };
}

export function buildRadarWritingExportRow(input: RadarPortableExportInput, contexto: RadarWritingArticleContext): RadarWritingExportRow {
  return buildRadarWritingExportArticle(input, contexto).row;
}

/* ============================== a linha de topo ============================== */

export const RADAR_WRITING_GENERAL_RULES = [
  "Escreva em português do Brasil, na voz da marca. A voz não faz parte deste arquivo: cole-a junto antes de pedir o texto a uma IA.",
  /* 2026-10-02 · o FAQ legado na MESMA frase da coluna artigo e do prompt do publicado (AGENTS §13). */
  `Sem seção de perguntas frequentes (FAQ): as perguntas são respondidas dentro das seções. ${RADAR_WRITING_LEGACY_FAQ}`,
  "Dado de terceiros é pesquisa: não copie frases, títulos, trechos, transcrições nem avaliações.",
  /* 2026-10-08 · C8 · sem marcador por preencher (D10): sem experiência própria da marca, o texto sai sem relato e sem inventá-lo. */
  "Não invente fatos, números, estudos, preços, produtos, autores, credenciais, depoimentos nem URLs; onde faltar experiência própria da marca, escreva sem relato e sem inventá-lo, sem marcador no texto.",
  "Afirmação marcada \"precisa de fonte\" só entra com uma das fontes listadas; sem fonte, escreva de forma qualificada ou omita. Tema de saúde pede autor e revisor reais.",
  "Conflito entre fonte factual e o que o mercado repete fica escrito dos dois lados.",
  "Cada seção abre respondendo a pergunta dela, nomeando o termo, de forma compreensível fora da página.",
  "Imagens: uma capa e dois ou três respiros, no ponto indicado em cada artigo. Tom visual: editorial e direto, fotografia ou ilustração de contexto real; a imagem serve à compreensão, não à decoração.",
  "Links internos: só os indicados em cada artigo (L1, L2…), com a âncora e o destino dados; sem criar outros.",
  "A estrutura e a extensão de cada artigo são sugestões: a decisão final é de quem redige.",
  "Ler não é mudar: se o que você apurar divergir da definição do artigo, registre a divergência para decisão humana; o texto não redefine keyword, intenção nem Silo.",
] as const;

export type RadarWritingTopRowInput = {
  label: "Silo" | "Marca";
  silo: RadarSiloExportWritingContext | null;
  articles: ReadonlyArray<Pick<RadarWritingExportArticle, "label" | "verdict" | "firstReason" | "healthTopic" | "published" | "unitNoun">>;
  /** Um endereço da marca já lido (SiloPage ou canonical), só para dizer o site. */
  siteUrl: string | null;
  /** A lista "Evitar" das imagens, quando é a mesma em todos os artigos do arquivo. */
  sharedVisualAvoid?: string | null;
  /** 2026-10-02 · Aditivo: export dos selecionados com o Silo na linha de cada artigo. */
  siloPerRow?: boolean;
  /** 2026-10-02 · Aditivo: a voz da marca (Adendo C). Ausente = texto de antes. */
  brandVoice?: RadarBrandVoiceState;
  /** 2026-10-02 · Aditivo: a autoria foi lida (cada artigo diz quem assina). Ausente = texto de antes. */
  authorsKnown?: boolean;
};

/**
 * ===== A LINHA DE TOPO: o Silo (ou a Marca) UMA vez só =====
 *
 * O formato completo repetia o contexto do silo em cada linha. Aqui ele vem
 * uma vez, com a ordem narrativa inteira — inclusive os artigos que ficaram
 * fora do arquivo, para que os links resolvam — e as regras gerais de escrita.
 *
 * A voz da marca, o autor e o revisor NÃO estão no pacote do Radar e não são
 * lidos na exportação: a falta é dita aqui, uma vez, em vez de inventada.
 */
export function buildRadarWritingTopRow(input: RadarWritingTopRowInput): RadarWritingExportRow {
  const silo = input.silo && input.silo.kind === "silo" ? input.silo : null;
  const artigos = input.articles;
  const bloqueados = artigos.filter(item => item.verdict === "Não");
  const fora = (silo?.members || []).filter(membro => !membro.inThisFile);
  const saude = artigos.some(item => item.healthTopic);
  /*
   * 2026-10-02 · ARQUIVO COM LANDING PAGE, PÁGINA DE SERVIÇO OU REVIEW: as
   * regras valem para "artigos e páginas", e "cada artigo" vira "cada artigo ou
   * página". Só artigos: o texto de antes, byte a byte.
   */
  const comPaginas = artigos.some(item => Boolean(item.unitNoun));
  const paraAsUnidades = (frase: string) => (comPaginas ? frase.replace(/\bcada artigo\b/g, "cada artigo ou página").replace(/\bdo artigo\b/g, "do artigo ou da página") : frase);

  const resumo = silo
    ? `${artigos.length} de ${silo.members.length} artigos do Silo estão neste arquivo`
    : `${artigos.length} artigo(s) neste arquivo`;
  const motivos = [
    `${resumo}${bloqueados.length ? `; ${bloqueados.length} com bloqueio (${bloqueados.slice(0, 4).map(item => entreAspas(item.label)).join(", ")})` : ""}`,
    ...(fora.length ? [`fora do arquivo: ${fora.slice(0, 6).map(membro => `${entreAspas(rotuloDoMembro(membro))} (${membro.statusLabel})`).join(", ")}`] : []),
    input.authorsKnown
      ? paraAsUnidades(`autoria: cada artigo diz quem assina (o especialista da aba Especialista); revisor não faz parte deste arquivo${saude ? " (há tema de saúde: autoria e revisão reais são exigidas)" : ""}`)
      : `${input.brandVoice?.kind === "available" ? "autor e revisor" : "voz da marca, autor e revisor"} não fazem parte deste arquivo: defina-os antes de publicar${saude ? " (há tema de saúde: autoria e revisão reais são exigidas)" : ""}`,
    ...(silo?.draft ? ["o Silo está em formação no Arquiteto: a composição pode mudar"] : []),
  ];
  const verdict: RadarWritingVerdict = artigos.length && bloqueados.length === artigos.length ? "Não" : "Com ressalva";
  const pode = [
    `${verdict}: ${comPontoFinal(motivos[0])}`,
    ...motivos.slice(1).map(item => `- ${comPontoFinal(item)}`),
  ].join("\n");

  const site = origemDe(input.siteUrl);
  const pagina = silo?.siloPage || null;
  const enderecoDaPagina = pagina ? pagina.publishedUrl || pagina.canonical || (pagina.slug ? `/${pagina.slug}` : null) : null;
  const artigo = silo
    ? [
      `Silo: ${silo.label}`,
      ...(pagina ? [`SiloPage: ${enderecoDaPagina || "endereço não registrado"} (${pagina.status})`] : []),
      ...(util(silo.centralEntity) ? [`Tema central: ${silo.centralEntity}`] : []),
      ...(util(silo.objective) ? [`Objetivo do Silo: ${comPontoFinal(silo.objective || "")}`] : []),
      ...(util(silo.macroProblem) && !/pendente/i.test(silo.macroProblem || "") ? [`Problema do leitor: ${comPontoFinal(silo.macroProblem || "")}`] : []),
      ...(util(silo.whyTogether) && !/derivada pelo processamento/i.test(silo.whyTogether || "") ? [`Por que os artigos andam juntos: ${comPontoFinal(silo.whyTogether || "")}`] : []),
      ...(silo.includedTopics.length ? [`Tópicos incluídos: ${silo.includedTopics.join(" · ")}`] : []),
      ...(silo.excludedTopics.length ? [`Fora do Silo (não cobrir): ${silo.excludedTopics.join(" · ")}`] : []),
      ...(util(silo.boundary) ? [`Fronteira: ${comPontoFinal(silo.boundary || "")}`] : []),
      "Ordem narrativa:",
      ...silo.members.map(membro => {
        const publicado = artigos.find(item => radarWritingCompareKey(item.label) === radarWritingCompareKey(membro.principalKeyword))?.published;
        return `${membro.position} · ${papelLegivel(membro.role) || membro.role} · ${rotuloDoMembro(membro)}${membro.slug ? ` · /${membro.slug}` : ""} · ${membro.inThisFile ? "neste arquivo" : `fora do arquivo (${membro.statusLabel})`}${publicado ? " · publicado" : ""}`;
      }),
    ].join("\n")
    : [
      input.silo?.kind === "no_silo"
        ? "Artigos sem silo resolvido no Radar: escreva cada um sem pressupor ordem narrativa, papel no Silo nem artigos irmãos."
        : input.siloPerRow
          ? "Artigos selecionados de mais de um Silo: o Silo, o papel, a ordem narrativa e os destinos dos links de cada um vão na linha do próprio artigo."
          : "Artigos avulsos, sem o contexto do Silo: exporte o Silo completo para ter a ordem narrativa e os destinos dos links.",
      "Artigos neste arquivo:",
      ...artigos.map((item, indice) => `${indice + 1} · ${item.label}${item.published ? " · publicado" : ""}`),
    ].join("\n");

  const audiencia = silo && util(silo.audience) ? silo.audience : null;
  /* 2026-10-08 · C1 · D10: o rótulo de entregável (a versão corrente, nunca "em rascunho" nem "aguardando aprovação"). */
  const marca = [
    `Marca: ${site ? `site ${site}` : "site não registrado neste arquivo"}.`,
    ...(input.brandVoice?.kind === "available"
      ? [`Voz da marca: aplique a linha "Voz da marca", logo abaixo (${radarBrandVoiceDeliverableLabel(input.brandVoice.voice)}). ${input.authorsKnown ? paraAsUnidades("Autoria: na linha de cada artigo (especialista da aba Especialista).") : "Autor e revisor: não fazem parte deste arquivo."} Não invente autor, credencial nem depoimento.`]
      : input.brandVoice
        ? [radarBrandVoiceAbsence(input.brandVoice) || "", "Autor e revisor: não fazem parte deste arquivo. Não invente autor, credencial nem depoimento."]
        : ["Voz, tom, autor e revisor: não fazem parte deste arquivo; cole-os antes de pedir o texto a uma IA. Não invente autor, credencial nem depoimento."]),
    ...(audiencia ? [`Público do Silo: ${comPontoFinal(audiencia)}`] : []),
  ].join("\n");

  const regras = [
    `Regras gerais para todos os ${comPaginas ? "artigos e páginas" : "artigos"} deste arquivo (valem para cada linha abaixo):`,
    ...RADAR_WRITING_GENERAL_RULES.map((regra, indice) => `${indice + 1}. ${indice === 0 && input.brandVoice?.kind === "available" ? "Escreva em português do Brasil, na voz da marca da linha \"Voz da marca\" deste arquivo." : paraAsUnidades(regra)}`),
    `${RADAR_WRITING_GENERAL_RULES.length + 1}. Não altere: ${naoAltere(false).join("; ")}.`,
    ...(texto(input.sharedVisualAvoid) ? [`${RADAR_WRITING_GENERAL_RULES.length + 2}. Imagens, em todos os ${comPaginas ? "artigos e páginas" : "artigos"} deste arquivo — ${texto(input.sharedVisualAvoid).replace(/^Evitar: /, "evitar: ")}`] : []),
  ].join("\n");

  return finalizarLinha({
    ordem: input.label,
    pode_escrever: pode,
    artigo,
    promessa_e_leitor: marca,
    titulo_e_seo: "",
    estrutura: "",
    cobrir_e_superar: "",
    serp_resumida: "",
    fontes_e_especialista: "",
    links_internos: "",
    plano_visual: "",
    produtos: "",
    prompt: regras,
  });
}

/**
 * ===== A LINHA "VOZ DA MARCA" (SDD diretriz editorial, Adendo C — 2026-10-02) =====
 *
 * A Skill ativa da Marca, inteira, distribuída pelas colunas do mesmo assunto:
 * leitor e oferta em promessa_e_leitor, título e abertura em titulo_e_seo,
 * estrutura e transição comercial em estrutura, SERP e exclusões em
 * cobrir_e_superar, fontes, links, plano visual; voz, vocabulário e critérios no
 * prompt. Vale para todas as linhas do arquivo. Sem Skill ativa, a linha não existe.
 */
export function buildRadarWritingBrandVoiceRow(state: RadarBrandVoiceState | undefined): RadarWritingExportRow | null {
  if (state?.kind !== "available") return null;
  const voz = state.voice;
  const por = radarBrandVoiceBySlot(voz);
  /* 2026-10-08 · C1 · D10: "Versão 1 da Skill de voz, corrente na Marca." — o estado de tela ("em rascunho") fica nas telas do Radar e da Marca. */
  return finalizarLinha({
    ordem: "Voz da marca",
    pode_escrever: `Vale para todas as linhas deste arquivo: ${radarBrandVoiceDeliverableLabel(voz)}. O dossiê de cada artigo decide o assunto; esta linha decide a forma, o CTA e o que a marca não faz. Em conflito, registre a divergência para decisão humana.`,
    artigo: `${voz.title || voz.name}\nVersão ${voz.version} da Skill de voz, ${radarBrandVoiceDeliverableStatusLabel(voz.status)} na Marca.`,
    promessa_e_leitor: radarBrandVoiceText(por.reader),
    titulo_e_seo: radarBrandVoiceText(por.title),
    estrutura: radarBrandVoiceText(por.structure),
    cobrir_e_superar: radarBrandVoiceText(por.research),
    serp_resumida: "",
    fontes_e_especialista: radarBrandVoiceText(por.sources),
    links_internos: radarBrandVoiceText(por.links),
    plano_visual: radarBrandVoiceText(por.visual),
    produtos: "",
    prompt: radarBrandVoiceText(por.voice),
  });
}

/**
 * A LISTA "EVITAR" DAS IMAGENS, QUANDO É A MESMA EM TODOS OS ARTIGOS, SOBE PARA O TOPO.
 *
 * O plano visual traz as mesmas restrições em cada artigo (~350 caracteres
 * repetidos por linha). Se todas as linhas com plano visual trazem a MESMA
 * lista, ela sai delas e vai uma vez para as regras da linha de topo. Se uma
 * só for diferente, nada muda: cada artigo continua com a sua.
 */
export function radarWritingShareVisualAvoid(rows: readonly RadarWritingExportRow[]): { rows: RadarWritingExportRow[]; shared: string | null } {
  const linhaEvitar = (celula: string): string | null => celula.split("\n").find(linha => linha.startsWith(EVITAR)) ?? null;
  const comPlano = rows.filter(row => row.plano_visual);
  const listas = comPlano.map(row => linhaEvitar(row.plano_visual));
  const comum = listas[0] ?? null;
  if (comPlano.length < 2 || !comum || listas.some(item => item !== comum)) return { rows: [...rows], shared: null };
  return {
    rows: rows.map(row => (row.plano_visual ? { ...row, plano_visual: row.plano_visual.split("\n").filter(linha => linha !== comum).join("\n") } : row)),
    shared: comum,
  };
}

/* ============================== o arquivo ============================== */

/**
 * AS 13 COLUNAS, SEMPRE NA MESMA ORDEM — e o mesmo escape do formato completo.
 *
 * UTF-8 com BOM, vírgula, toda célula entre aspas, CRLF entre linhas e `\n`
 * dentro da célula. As colunas deixam de ser a união das chaves por linha:
 * todo arquivo "Para escrever" tem o mesmo cabeçalho.
 */
export function radarWritingExportCsv(rows: readonly RadarWritingExportRow[]): string {
  if (!rows.length) return "";
  const celula = (valor: string) => `"${valor.replaceAll("\"", "\"\"")}"`;
  const linhas = [
    RADAR_WRITING_EXPORT_COLUMNS.map(celula).join(","),
    ...rows.map(row => RADAR_WRITING_EXPORT_COLUMNS.map(coluna => celula(row[coluna] ?? "")).join(",")),
  ];
  return `﻿${linhas.join("\r\n")}\r\n`;
}

const nomeLimpo = (valor: string) => valor
  .normalize("NFD").replace(/[̀-ͯ]/g, "")
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, "-")
  .replace(/^-+|-+$/g, "")
  .slice(0, 60)
  .replace(/-+$/, "");

/** O nome do arquivo por silo: o do formato completo, com "para-escrever" — e sem o prefixo "radar-". */
export function radarWritingExportSiloFilename(nomeCompleto: string): string {
  const silo = nomeCompleto.match(/^radar-silo-(.+)-(\d{4}-\d{2}-\d{2})(-parcial)?\.csv$/);
  if (silo) return `silo-${silo[1]}-para-escrever-${silo[2]}${silo[3] || ""}.csv`;
  const semSilo = nomeCompleto.match(/^radar-sem-silo(-\d+)?-(\d{4}-\d{2}-\d{2})\.csv$/);
  if (semSilo) return `sem-silo${semSilo[1] || ""}-para-escrever-${semSilo[2]}.csv`;
  return nomeCompleto.replace(/\.csv$/, "-para-escrever.csv");
}

export function radarWritingExportBatchFilename(input: { articles: readonly { slug: string | null; keyword: string | null }[]; today: string }): string {
  if (input.articles.length === 1) {
    const unico = input.articles[0];
    const base = nomeLimpo(texto(unico.slug) || texto(unico.keyword) || "artigo");
    return `artigo-${base || "artigo"}-para-escrever.csv`;
  }
  return `artigos-para-escrever-${input.today.slice(0, 10)}.csv`;
}

export function radarWritingExportArchiveFilename(today: string): string {
  return `silos-para-escrever-${today.slice(0, 10)}.zip`;
}
