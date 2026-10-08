import { z } from "zod";
import type { RadarPortableExportInput } from "./portable-export.ts";
import type { RadarSiloExportWritingContext } from "./portable-silo-export.ts";
import type { RadarPortableSection } from "./portable-read-model.ts";
import {
  radarBrandVoiceBySlot,
  radarBrandVoiceOwnUrls,
  radarBrandVoiceRef,
  radarBrandVoiceStatusLabel,
  radarBrandVoiceText,
  type RadarBrandVoice,
  type RadarBrandVoiceRef,
  type RadarBrandVoiceSection,
} from "./brand-voice.ts";
import { RADAR_VIDEO_USAGE_HINT, RADAR_VIDEO_USAGE_LABEL, type RadarVideoUsage } from "./video-library.ts";
import { RADAR_EDITORIAL_OUTPUT_LABELS } from "./multimodal-blueprint.ts";
import { RADAR_AMAZON_EDITORIAL_OUTPUT_LABELS } from "./competitive-blueprint.ts";
import { radarSemanticStems } from "./semantic-concept-model.ts";
import { radarOutOfScopeMatcher } from "./out-of-scope.ts";
import {
  radarWritingCleanUrl,
  radarWritingCompareKey,
  radarWritingCompetitorTopicsOf,
  RADAR_WRITING_FUNCTION_WORDS,
  radarWritingDecodeEntities,
  radarWritingProjections,
  radarWritingRhetoricalQuestion,
  radarWritingSpecialistContributions,
  radarWritingUnsupportedClaims,
  type RadarWritingPublication,
} from "./portable-writing-export.ts";

/**
 * ===== O ARTIGO-MODELO (SDD diretriz editorial, Adendo A — aprovado em 2026-10-02) =====
 *
 * "A SERP teria que fornecer uma fotocópia de um artigo ideal para concorrer":
 * quantos H2, H3, parágrafos, negritos, imagens; o sentido de cada keyword; onde
 * vão os links internos e quantos; quando um link externo reforça uma afirmação.
 *
 * A IA monta o artigo-modelo sobre o pacote CONGELADO; este módulo prepara o que
 * ela recebe (cada evidência com um id), corrige o que ela devolve contra esse
 * pacote e transforma a versão APROVADA nas colunas do CSV. As medidas não são da
 * IA: vêm dos concorrentes comparáveis, contadas aqui.
 *
 * ===== 2026-10-02 · O ARTIGO-MODELO PASSA A SER PARTE DA SERP (decisão do dono) =====
 *
 * "A SERP que faz esse trabalho, a IA só ajuda a organizar, e não é para
 * escrever algo à parte." Três mudanças, todas aditivas:
 *
 * 1. A ENTRADA É O ESQUELETO DA SERP. As seções do modelo editorial que a SERP
 *    já entrega ganham ids (M1…Mn) e vão à IA como ponto de partida. Cada seção
 *    organizada diz de onde vem (`from`: ids M e/ou de evidência); a IA renomeia,
 *    ordena, junta e descarta com motivo (`discarded`) — e só acrescenta o que
 *    uma evidência sustenta. Seção sem origem fica marcada para o dono.
 * 2. O PEDIDO E A RESPOSTA SÃO COMPACTOS. A primeira tentativa real falhou com
 *    "JSON invalido": o pedido levava a Skill de voz inteira (~18 mil
 *    caracteres) e a resposta passou do teto e veio cortada. A voz vai em
 *    trechos por assunto, com teto; a resposta tem tetos menores e o esquema
 *    CORTA o que passa em vez de recusar a chamada paga inteira.
 * 3. A PROPOSTA JÁ SAI NO CSV, MARCADA. Enquanto o dono não aprova, as colunas
 *    saem com "PROPOSTA DA IA — aguardando aprovação no Radar"; aprovada, a
 *    marca some. A marca vem de `approval`, que o export põe no objeto que passa
 *    e que NUNCA é gravado.
 *
 * Vale para qualquer tipo de página (artigo, review, landing page, página de
 * serviço, SiloPage) e qualquer marca: o tipo da unidade vai à IA e manda na
 * forma da planta.
 *
 * Domínio puro: sem fetch, sem storage, sem provider, sem React.
 */

/* ============================== os tetos ============================== */

/**
 * 2026-10-02 · OS TETOS DA PLANTA COMPACTA.
 *
 * Oito seções com até quatro H3 cabem num artigo que vence a SERP e numa
 * resposta de ~4 mil tokens. `maxTokens` é o mesmo que o modelo já aceitou na
 * primeira chamada real (8000): o que cortou a resposta foi o tamanho pedido,
 * não o teto.
 */
export const RADAR_ARTICLE_BLUEPRINT_LIMITS = Object.freeze({
  sections: 8,
  h3: 4,
  explain: 3,
  bold: 5,
  terms: 6,
  evidence: 6,
  from: 6,
  internalLinks: 3,
  externalLinks: 2,
  visual: 4,
  alternatives: 2,
  complementary: 8,
  eeat: 6,
  warnings: 5,
  discarded: 8,
  skeleton: 16,
  textChars: 320,
  shortChars: 160,
  termChars: 80,
  metaChars: 320,
  imagePromptChars: 400,
  voiceChars: Object.freeze({ cta: 1_200, voice: 1_200, avoid: 800, visual: 600 }),
  maxTokens: 8_000,
});

const t = (valor: unknown): string => (typeof valor === "string" ? valor.trim() : "");
const corte = (valor: string, limite: number) => (valor.length > limite ? `${valor.slice(0, limite - 1).trimEnd()}…` : valor);
const limpo = (valor: string | null | undefined) => radarWritingDecodeEntities(t(valor)).replace(/\s+/g, " ").trim();
const EH_FAQ = /\b(faq|perguntas frequentes|d[uú]vidas frequentes)\b/i;

/* ============================== a resposta da IA ============================== */

/* Os campos da edição humana continuam RECUSANDO o que passa do teto: quem edita vê o erro. */
const texto = z.string().trim().min(1).max(600);
const curto = z.string().trim().min(1).max(220);

/*
 * 2026-10-02 · A RESPOSTA DA IA É CORTADA, NÃO RECUSADA.
 *
 * Um texto com dez caracteres a mais ou uma quinta seção de H3 recusava a
 * resposta inteira — uma chamada paga perdida por enfeite. Agora o que passa do
 * teto é cortado aqui; o que não tem forma nenhuma continua recusado.
 */
const L = RADAR_ARTICLE_BLUEPRINT_LIMITS;

/*
 * 2026-10-02 · AS FORMAS COMUNS DA RESPOSTA SÃO NORMALIZADAS, NÃO RECUSADAS.
 *
 * Revisão da frente: o esquema ainda recusava a resposta inteira por formas que
 * a IA usa com frequência e que têm leitura única — `null` onde cabia lista,
 * um texto solto onde cabia lista ("h3": "Rotina da noite"), ids numa frase só
 * ("P1, P2"), um número onde cabia texto, `{ "text": … }` no lugar do texto,
 * "Respiro 1" no lugar de "R1", ou um item de lista sem forma (um link sem
 * candidato) derrubando as outras. Agora cada uma vira a forma combinada; o
 * item de lista sem forma sai sozinho (o servidor confere o resto depois). O
 * que decide a planta e não veio continua recusado.
 */
const CHAVES_DE_TEXTO = ["text", "texto", "title", "titulo", "label", "value", "heading", "statement", "item", "id"] as const;
const comoTexto = (valor: unknown): string | null => {
  if (typeof valor === "string") return valor;
  if (typeof valor === "number" && Number.isFinite(valor)) return String(valor);
  if (valor && typeof valor === "object" && !Array.isArray(valor)) {
    const objeto = valor as Record<string, unknown>;
    for (const chave of CHAVES_DE_TEXTO) if (typeof objeto[chave] === "string") return objeto[chave] as string;
  }
  return null;
};
/* Texto: lista vira uma frase (itens unidos), objeto vira o texto dele, número vira texto. */
const textual = (valor: unknown): unknown => {
  if (valor === null || valor === undefined || typeof valor === "string") return valor;
  if (Array.isArray(valor)) return valor.map(comoTexto).filter((item): item is string => Boolean(item && item.trim())).join(" · ");
  return comoTexto(valor) ?? valor;
};
/* Lista: `null` é lista vazia; um valor solto é lista de um. */
const comoLista = (valor: unknown): unknown => (valor === null || valor === undefined ? [] : Array.isArray(valor) ? valor : [valor]);
/* Ids: "P1, P2" numa frase só são dois ids; numa lista, cada item é lido como texto. */
const idsBrutos = (valor: unknown): unknown => (typeof valor === "string"
  ? valor.split(/[,;]+/)
  : (comoLista(valor) as unknown[]).map(comoTexto).filter((item): item is string => item !== null));
/* Objeto que veio como texto solto: o texto vai para o campo principal ("angle": "…" é o statement). */
const objetoDe = (campo: string) => (valor: unknown): unknown => (typeof valor === "string" ? { [campo]: valor } : valor);

/* O que decide a planta (H1, H2, pergunta, resposta, promessa, CTA, prompt) continua obrigatório. */
const textoIa = (limite: number) => z.preprocess(textual, z.string().trim().min(1)).transform(valor => corte(valor, limite));
/* O que só explica (motivo, direção, ALT, legenda) pode vir vazio sem derrubar a resposta. */
const textoOuVazioIa = (limite: number) => z.preprocess(textual, z.string().nullable().optional()).transform(valor => corte(t(valor), limite));
const opcionalIa = (limite: number) => z.preprocess(textual, z.string().nullable().optional()).transform(valor => {
  const limpa = t(valor);
  return limpa ? corte(limpa, limite) : null;
});
/* Lista de textos: item vazio sai, o resto é cortado no teto. */
const textosIa = (limite: number, maximo: number) => z.preprocess(valor => (comoLista(valor) as unknown[]).map(comoTexto), z.array(z.string().nullable()))
  .transform(itens => itens.map(t).filter(Boolean).map(valor => corte(valor, limite)).slice(0, maximo));
/* "S1 (resultado orgânico)" ainda é S1: o id é o primeiro pedaço. */
const soOId = (valor: unknown) => t(valor).split(/[\s,;·()[\]]+/)[0]?.slice(0, 12) || "";
const idIa = z.preprocess(textual, z.string()).transform(soOId);
const idOpcionalIa = z.preprocess(valor => (Array.isArray(valor) ? comoTexto(valor[0]) : textual(valor)), z.string().nullable().optional()).transform(valor => soOId(valor) || null);
const idsDe = (itens: readonly string[], limite: number) => [...new Set(itens.map(soOId).filter(Boolean))].slice(0, limite);
const idsIa = z.preprocess(idsBrutos, z.array(z.string())).transform(itens => idsDe(itens, 12));
/* Lista de objetos: item sem forma sai sozinho, em vez de derrubar a resposta inteira. */
const listaIa = <T extends z.ZodType>(item: T, limite: number) => z.preprocess(comoLista, z.array(z.unknown()))
  .transform(itens => itens.flatMap(valor => {
    const lido = item.safeParse(valor);
    return lido.success ? [lido.data as z.output<T>] : [];
  }).slice(0, limite));
/* "Respiro 1", "respiro-2", "capa": a vaga do plano visual na forma combinada (CAPA, R1…R3). */
const slotIa = z.preprocess(valor => {
  const lido = textual(valor);
  if (typeof lido !== "string") return lido;
  const respiro = lido.match(/^\s*(?:respiro|r)\s*[-_ ]?\s*(\d)\b/i);
  if (respiro) return `R${respiro[1]}`;
  return /^\s*(?:capa|cover)\b/i.test(lido) ? "CAPA" : lido;
}, z.string()).transform(soOId);
const paragrafosIa = z.unknown().optional().transform(valor => {
  const numero = Number(valor);
  return Number.isFinite(numero) && numero > 0 ? Math.min(12, Math.max(1, Math.round(numero))) : 2;
});

const SecaoIaSchema = z.object({
  h2: textoIa(L.shortChars),
  readerQuestion: textoIa(L.shortChars),
  answerFirst: textoIa(L.textChars),
  /** 2026-10-02 · De onde a seção vem: ids M do esqueleto da SERP e/ou ids de evidência. Ausente em versões antigas. */
  from: z.preprocess(valor => (valor === undefined ? undefined : idsBrutos(valor)), z.array(z.string()).optional())
    .transform(itens => (itens ? idsDe(itens, L.from) : undefined)),
  h3: textosIa(L.shortChars, L.h3),
  explain: textosIa(L.textChars, L.explain),
  paragraphs: paragrafosIa,
  bold: textosIa(L.termChars, L.bold),
  terms: textosIa(L.termChars, L.terms),
  evidence: idsIa,
  specialist: idOpcionalIa,
  video: idOpcionalIa,
  internalLinks: listaIa(z.object({ candidate: idIa, anchor: textoIa(L.shortChars), reason: textoOuVazioIa(L.shortChars) }), L.internalLinks),
  externalLinks: listaIa(z.object({ claim: textoIa(L.textChars), sourceType: textoOuVazioIa(L.shortChars), source: idOpcionalIa }), L.externalLinks),
  image: idOpcionalIa,
  practical: opcionalIa(L.textChars),
});

const DescarteIaSchema = z.object({ id: idIa, reason: opcionalIa(L.shortChars) });

export const RadarArticleBlueprintAiSchema = z.object({
  /* 2026-10-02 · o plano de keywords só explica: ausente vira vazio; texto solto vira a leitura. */
  keywordPlan: z.preprocess(valor => (valor === null || valor === undefined ? {} : objetoDe("reading")(valor)), z.object({
    reading: textoOuVazioIa(L.textChars),
    principalPlacement: z.preprocess(valor => (typeof valor === "string" ? valor.split(/[,;]+/) : valor), textosIa(L.termChars, 6)),
    complementary: listaIa(z.preprocess(objetoDe("keyword"), z.object({ keyword: textoIa(L.shortChars), placement: textoOuVazioIa(L.shortChars), reason: textoOuVazioIa(L.shortChars) })), L.complementary),
    slugNote: opcionalIa(L.textChars),
  })),
  reader: textoIa(L.textChars),
  promise: textoIa(L.textChars),
  angle: z.preprocess(objetoDe("statement"), z.object({ statement: textoIa(L.textChars), evidence: idsIa })),
  title: z.object({
    h1: textoIa(L.shortChars),
    alternatives: textosIa(L.shortChars, L.alternatives),
    seoTitle: textoIa(L.shortChars),
    metaDescription: textoIa(L.metaChars),
  }),
  opening: z.preprocess(objetoDe("readerQuestion"), z.object({ readerQuestion: textoIa(L.shortChars), direction: textoOuVazioIa(L.textChars), evidence: idsIa })),
  /* O servidor corta em `sections` (com aviso); aqui só o teto de segurança. */
  sections: z.array(SecaoIaSchema).min(1).transform(itens => itens.slice(0, 12)),
  /**
   * 2026-10-02 · As seções do esqueleto da SERP que a IA descartou, com o motivo. Ausente em versões antigas.
   * `null` é "nada descartado" (lista vazia); um id solto ("M3") é um descarte sem motivo.
   */
  discarded: z.preprocess(valor => (valor === undefined ? undefined : (comoLista(valor) as unknown[]).map(item => (typeof item === "string" ? { id: item } : item))),
    z.array(z.unknown()).optional())
    .transform(itens => (itens
      ? itens.flatMap(item => {
        const lido = DescarteIaSchema.safeParse(item);
        return lido.success ? [lido.data] : [];
      }).slice(0, L.discarded)
      : undefined)),
  closing: z.object({
    turn: textoIa(L.textChars),
    specialist: idOpcionalIa,
    cta: textoIa(L.textChars),
    nextStep: opcionalIa(L.textChars),
  }),
  visual: listaIa(z.object({
    slot: slotIa,
    section: opcionalIa(L.shortChars),
    concept: textoOuVazioIa(L.shortChars),
    prompt: textoIa(L.imagePromptChars),
    alt: textoOuVazioIa(L.shortChars),
    caption: textoOuVazioIa(L.shortChars),
  }), 6),
  eeat: textosIa(L.textChars, L.eeat),
  warnings: textosIa(L.textChars, L.warnings),
});
export type RadarArticleBlueprintAi = z.infer<typeof RadarArticleBlueprintAiSchema>;

/* ============================== o que a IA recebe ============================== */

export type RadarArticleBlueprintEvidence = { id: string; kind: string; text: string };
export type RadarArticleBlueprintLinkCandidate = {
  id: string;
  label: string;
  role: string;
  /** Endereço como o pacote o conhece: URL publicada, caminho planejado ou nada. */
  destination: string | null;
  status: "PUBLISHED" | "PLANNED" | "UNRESOLVED";
  fromGraph: boolean;
};
export type RadarArticleBlueprintSource = { id: string; url: string; title: string; claim: string };

export type RadarArticleBlueprintMeasures = {
  comparablePages: number;
  words: { median: number | null; p25: number | null; p75: number | null };
  h2: number | null;
  h3: number | null;
  paragraphs: number | null;
  images: number | null;
  lists: number | null;
};

/**
 * 2026-10-02 · UMA SEÇÃO DO ESQUELETO DA SERP, COM ID.
 *
 * Sai do modelo editorial que a SERP já monta (`p.editorial.sections`): o
 * título, a pergunta que responde, o que cobrir e as marcas do ArticleDNA. A IA
 * cita pelo id; o servidor confere; o CSV e a tela dizem de onde cada seção do
 * plano veio. Seção que toca assunto fora do escopo vem marcada para descarte.
 */
export type RadarArticleBlueprintSkeletonItem = {
  id: string;
  level: 2 | 3;
  parent: string | null;
  heading: string;
  readerQuestion: string | null;
  cover: string[];
  mustCover: boolean;
  needsSource: boolean;
  needsSpecialist: boolean;
  outOfScope: boolean;
};

/** 2026-10-02 · O tipo da unidade (artigo, SiloPage, landing page…) e o formato que a SERP pediu. */
export type RadarArticleBlueprintUnit = { type: string | null; label: string; format: string | null };

/** 2026-10-02 · Quem assina: o especialista da aba Especialista (`entrada.authors`). */
export type RadarArticleBlueprintAuthor = { name: string; specialty: string | null; source: string };

/** 2026-10-02 · Um trecho da Skill de voz, por assunto, com teto. */
export type RadarArticleBlueprintVoiceExcerpt = { title: string; text: string };

export type RadarArticleBlueprintBrief = {
  article: {
    principal: string;
    complementary: Array<{ keyword: string; role: string; volume: number | null }>;
    subject: string | null;
    intent: string | null;
    funnel: string | null;
    siloRole: string | null;
    audience: string | null;
    promise: string | null;
    slug: string | null;
    publishedUrl: string | null;
    mustCover: string[];
    /** 2026-10-02 · Aditivo: o tipo da unidade e o formato. */
    unit: RadarArticleBlueprintUnit;
  };
  silo: { label: string; centralEntity: string | null; excludedTopics: string[] } | null;
  /** 2026-10-02 · Aditivo: o esqueleto da SERP (M1…Mn). Vazio quando a SERP não deixou seções. */
  skeleton: RadarArticleBlueprintSkeletonItem[];
  /** 2026-10-02 · Aditivo: o título de trabalho, a promessa e o fecho do esqueleto, como vieram. */
  skeletonFrame: { workingTitle: string | null; promise: string | null; closing: string | null };
  evidence: RadarArticleBlueprintEvidence[];
  linkCandidates: RadarArticleBlueprintLinkCandidate[];
  graphLinks: string[];
  sources: RadarArticleBlueprintSource[];
  unsupportedClaims: string[];
  specialist: Array<{ id: string; kind: string | null; text: string }>;
  /**
   * 2026-10-02 · `usage` é o modo de uso escolhido pelo dono (Adendo B, D6),
   * só presente quando há modo. Contexto e Sugestão de pauta não são citáveis.
   * `title` e `url` não vão ao pedido: viram o retrato `payload.videos`, que
   * resolve o V da seção no CSV (o V do pedido não é o V da coluna de fontes).
   */
  videos: Array<{ id: string; text: string; usage?: RadarVideoUsage; title?: string; url?: string | null }>;
  outOfScope: string[];
  competitorTitles: string[];
  measures: RadarArticleBlueprintMeasures;
  /**
   * 2026-10-02 · Aditivo: quem assina. `null` = a autoria não foi lida (nada
   * muda); lista vazia = não há especialista definido.
   */
  authors: RadarArticleBlueprintAuthor[] | null;
  /**
   * A Skill de voz CORRENTE da Marca (Adendo C; spec da Marca §24). Sem ela, null.
   *
   * 2026-10-02 · Em TRECHOS por assunto, com teto (CTA e oferta, voz e
   * vocabulário, o que não fazer, plano visual) — não mais o Markdown inteiro,
   * que levou o pedido a ~18 mil caracteres só de voz.
   */
  brandVoice: { ref: RadarBrandVoiceRef; excerpts: RadarArticleBlueprintVoiceExcerpt[] } | null;
};

const mediana = (valores: number[]): number | null => {
  if (!valores.length) return null;
  const ordem = [...valores].sort((a, b) => a - b);
  const meio = Math.floor(ordem.length / 2);
  return ordem.length % 2 ? ordem[meio] : Math.round((ordem[meio - 1] + ordem[meio]) / 2);
};
const percentil = (valores: number[], p: number): number | null => {
  if (!valores.length) return null;
  const ordem = [...valores].sort((a, b) => a - b);
  return ordem[Math.min(ordem.length - 1, Math.max(0, Math.round((ordem.length - 1) * p)))];
};
const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

/** As medidas do artigo ideal saem das páginas comparáveis, contadas aqui — nunca da IA. */
export function radarArticleBlueprintMeasures(structures: ReadonlyArray<{ words: number; h2: number; h3: number; paragraphs: number; images: number; lists: number } | null>): RadarArticleBlueprintMeasures {
  const medidas = structures.filter((item): item is NonNullable<typeof item> => Boolean(item) && (item?.words || 0) > 0);
  const eixo = (chave: "words" | "h2" | "h3" | "paragraphs" | "images" | "lists") => medidas.map(item => item[chave]);
  return {
    comparablePages: medidas.length,
    words: { median: mediana(eixo("words")), p25: percentil(eixo("words"), 0.25), p75: percentil(eixo("words"), 0.75) },
    h2: mediana(eixo("h2")),
    h3: mediana(eixo("h3")),
    paragraphs: mediana(eixo("paragraphs")),
    images: mediana(eixo("images")),
    lists: mediana(eixo("lists")),
  };
}

/* ============================== o fora do escopo ============================== */

/**
 * 2026-10-02 · O QUE TOCA UM ASSUNTO FORA DO ESCOPO — para qualquer marca e assunto.
 *
 * Comparar a frase inteira deixava passar "Como prospectar clientes pelo
 * Instagram com o Instagram Shopping" contra "Ative o Instagram Shopping". O
 * rótulo fora do escopo perde o que não o distingue — as palavras do próprio
 * artigo (principal, complementares, Assunto), o verbo de abertura e a palavra
 * genérica de formato — e o que sobra ("shopping") decide.
 *
 * 2026-10-02 · RÉGUA ÚNICA (`out-of-scope.ts`), a mesma do CSV para escrever e
 * do CSV de vídeo. Antes esta pedia TODAS as palavras distintivas e aceitava a
 * frase contida mesmo sem palavra distintiva; a do CSV pedia metade. Um texto
 * saía de um lugar e ficava no outro. E "Dicas de Instagram" num artigo sobre
 * Instagram tirava qualquer texto com "dicas": a palavra genérica sozinha não
 * decide mais. A assinatura desta função não mudou.
 */
export function radarArticleBlueprintOutOfScopeMatcher(rotulos: readonly string[], nucleo: readonly string[]): (valor: string | null | undefined) => boolean {
  return radarOutOfScopeMatcher({ labels: rotulos, core: nucleo });
}

/* ============================== o tipo da unidade ============================== */

const TIPO_DA_UNIDADE: Record<string, string> = {
  article: "Artigo",
  silo_page: "SiloPage (página de entrada do Silo)",
  silopage: "SiloPage (página de entrada do Silo)",
};

/** 2026-10-02 · O tipo vem do ArticleDNA (`unitClassification.type`); o formato, do modelo da SERP. */
function unidadeDe(entrada: RadarPortableExportInput, saida: string | null): RadarArticleBlueprintUnit {
  const tipo = t(entrada.article.contentType) || null;
  const chave = (tipo || "article").toLowerCase().replace(/[\s-]+/g, "_");
  const label = TIPO_DA_UNIDADE[chave] || (tipo ? tipo.replace(/[_-]+/g, " ") : "Artigo");
  const rotulos: Record<string, string> = { ...RADAR_AMAZON_EDITORIAL_OUTPUT_LABELS, ...RADAR_EDITORIAL_OUTPUT_LABELS };
  const format = entrada.profile === "YOUTUBE"
    ? "Roteiro de vídeo"
    : saida ? rotulos[saida] || saida.replace(/_/g, " ").toLowerCase() : null;
  return { type: tipo, label, format: format && format !== label ? format : null };
}

/* ============================== o esqueleto da SERP ============================== */

function esqueletoDaSerp(secoes: readonly RadarPortableSection[], tocaFora: (valor: string | null | undefined) => boolean): RadarArticleBlueprintSkeletonItem[] {
  const saida: RadarArticleBlueprintSkeletonItem[] = [];
  const visitar = (lista: readonly RadarPortableSection[], pai: string | null) => {
    for (const secao of lista) {
      if (saida.length >= L.skeleton) return;
      const heading = corte(limpo(secao.heading), L.shortChars);
      /* FAQ não integra o fluxo (AGENTS §13): a seção nem chega à IA. */
      if (!heading || UUID.test(heading) || EH_FAQ.test(heading)) continue;
      const pergunta = limpo(secao.readerQuestion);
      const readerQuestion = pergunta && !UUID.test(pergunta) && radarWritingCompareKey(pergunta) !== radarWritingCompareKey(heading) ? corte(pergunta, L.shortChars) : null;
      const chaves = new Set([radarWritingCompareKey(heading), radarWritingCompareKey(readerQuestion)]);
      const cover = [...new Set(secao.coveragePoints.map(limpo).filter(item => item && !UUID.test(item) && !chaves.has(radarWritingCompareKey(item))))]
        .slice(0, 4).map(item => corte(item, 120));
      const id = `M${saida.length + 1}`;
      saida.push({
        id,
        level: pai ? 3 : secao.level,
        parent: pai,
        heading,
        readerQuestion,
        cover,
        mustCover: secao.mustCoverReasons.length > 0,
        needsSource: Boolean(secao.sourceNeeded),
        needsSpecialist: Boolean(secao.specialistRequired),
        outOfScope: tocaFora(heading) || tocaFora(readerQuestion),
      });
      visitar(secao.children, id);
    }
  };
  visitar(secoes, null);
  return saida;
}

/*
 * 2026-10-02 · OS TEMAS QUE OS CONCORRENTES LIDOS COBREM ENTRAM NO ESQUELETO.
 *
 * O modelo editorial da SERP chegava com UMA seção ("stories") no artigo do
 * Instagram, e a IA pendurava todas as seções nela. Os temas tratados por 2+
 * páginas comparáveis (pelos H2/H3 delas, `competitor-topics.ts`) viram seções
 * M a mais, com a contagem e os cabeçalhos de exemplo no "cobrir". O que o
 * modelo editorial já tem não se repete.
 */
function esqueletoComTemas(
  base: RadarArticleBlueprintSkeletonItem[],
  temas: ReadonlyArray<{ label: string; pages: number; sampleSize: number; headings: string[] }>,
): RadarArticleBlueprintSkeletonItem[] {
  const saida = [...base];
  const vistos = new Set(base.map(item => radarWritingCompareKey(item.heading)));
  for (const tema of temas.filter(item => item.pages >= 2)) {
    if (saida.length >= L.skeleton) break;
    const chave = radarWritingCompareKey(tema.label);
    if (!chave || vistos.has(chave)) continue;
    vistos.add(chave);
    saida.push({
      id: `M${saida.length + 1}`,
      level: 2,
      parent: null,
      heading: corte(tema.label, L.shortChars),
      readerQuestion: null,
      cover: [`tema tratado por ${tema.pages} de ${tema.sampleSize} páginas comparáveis (cabeçalhos dos concorrentes: não copie)`, ...tema.headings.slice(1, 3).map(item => corte(item, 120))],
      mustCover: false,
      needsSource: false,
      needsSpecialist: false,
      outOfScope: false,
    });
  }
  return saida;
}

/* ============================== a voz compacta ============================== */

const semAcento = (valor: string) => valor.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
/* Dentro de "structure" e "reader", o que fala de CTA, oferta e transição vem na frente (a régua do Redator). */
const TITULO_DE_CTA = /\bcta\b|comercial|transicao|oferta|servico|conversao|chamada/;
const TITULO_DE_EVITAR = /n[aã]o (fazer|usar|escrever|recomendar|cobrir)|evitar|proib|inadequad|nunca|exclus/;

/**
 * 2026-10-02 · As mesmas réguas de título, para o CSV de vídeo separar da Skill
 * o que fala de CTA, oferta e transição comercial e o que a marca não faz.
 */
export const radarBrandVoiceSectionIsCommercial = (heading: string): boolean => TITULO_DE_CTA.test(semAcento(heading));
export const radarBrandVoiceSectionIsAvoid = (heading: string): boolean => TITULO_DE_EVITAR.test(semAcento(heading));

/**
 * 2026-10-02 · A SKILL DE VOZ EM TRECHOS POR ASSUNTO, COM TETO.
 *
 * Os mesmos assuntos de `radarBrandVoiceBySlot`. O que a Skill proíbe vem num
 * trecho próprio, venha de que seção vier. Seção que não entra em nenhum trecho
 * (fontes, links, pesquisa) já chega à IA por outro caminho: as fontes X, os
 * candidatos K e as evidências.
 */
function vozCompacta(voz: RadarBrandVoice): RadarArticleBlueprintVoiceExcerpt[] {
  const por = radarBrandVoiceBySlot(voz);
  const evitar = voz.sections.filter(secao => secao.body.trim() && TITULO_DE_EVITAR.test(semAcento(secao.heading)));
  const ehEvitar = new Set(evitar);
  const fora = (lista: readonly RadarBrandVoiceSection[]) => lista.filter(secao => !ehEvitar.has(secao));
  const ehCta = (secao: RadarBrandVoiceSection) => (TITULO_DE_CTA.test(semAcento(secao.heading)) ? 0 : 1);
  const cta = fora([...por.structure, ...por.reader]).sort((a, b) => ehCta(a) - ehCta(b));
  const trecho = (title: string, secoes: readonly RadarBrandVoiceSection[], limite: number) => ({ title, text: corte(radarBrandVoiceText(secoes), limite) });
  return [
    trecho("CTA, oferta e transição comercial", cta, L.voiceChars.cta),
    trecho("Voz, vocabulário e títulos", fora([...por.voice, ...por.title]), L.voiceChars.voice),
    trecho("O que não fazer", evitar, L.voiceChars.avoid),
    trecho("Plano visual", fora(por.visual), L.voiceChars.visual),
  ].filter(item => item.text);
}

/* ============================== o pacote ============================== */

const PRIORIDADE: Record<string, string> = { HIGH: "prioridade alta", MEDIUM: "prioridade média", LOW: "prioridade baixa" };

export function buildRadarArticleBlueprintBrief(input: {
  entrada: RadarPortableExportInput;
  silo: RadarSiloExportWritingContext | null;
  articleId: string;
  publication: RadarWritingPublication | null;
  brandVoice?: RadarBrandVoice | null;
}): RadarArticleBlueprintBrief {
  const p = radarWritingProjections(input.entrada);
  const entrada = input.entrada;
  const principal = t(p.dna.principalKeyword);
  const volume = new Map(p.keywords.map(item => [radarWritingCompareKey(item.keyword), typeof item.volume === "number" ? item.volume : null]));
  const evidence: RadarArticleBlueprintEvidence[] = [];
  const add = (prefixo: string, kind: string, valor: string) => {
    const texto = corte(radarWritingDecodeEntities(valor).replace(/\s+/g, " ").trim(), 260);
    if (!texto || UUID.test(texto)) return;
    evidence.push({ id: `${prefixo}${evidence.filter(item => item.id.startsWith(prefixo)).length + 1}`, kind, text: texto });
  };

  /* 2026-10-02 · o fora do escopo pelas palavras que o distinguem do artigo, não pela frase inteira. */
  const foraDoEscopo = p.serp.editorialCandidates.filter(item => item.verdict === "OUT_OF_SCOPE").map(item => radarWritingDecodeEntities(item.observedLabel));
  const outOfScope = [...foraDoEscopo, ...(input.silo?.excludedTopics || [])];
  const nucleo = [principal, ...p.dna.secondaryKeywords, ...p.dna.narrativeReinforcements, p.assunto?.phrase || ""].filter(Boolean);
  const tocaFora = radarArticleBlueprintOutOfScopeMatcher(outOfScope, nucleo);

  const serp = p.serpObservada;
  for (const item of serp?.organic.slice(0, 10) || []) {
    const url = radarWritingCleanUrl(item.url);
    add("S", "resultado orgânico", `${item.title || item.domain} · ${url && !UUID.test(url) ? url : item.domain}${item.snippet?.thirdPartyExcerpt ? ` · "${corte(item.snippet.thirdPartyExcerpt, 140)}"` : ""}`);
  }

  /*
   * 2026-10-02 · AS PERGUNTAS: PAA, amostra e descoberta, sem repetição.
   *
   * Pergunta retórica de fecho de concorrente ("Aprendeu como…?") e pergunta
   * que toca assunto fora do escopo não chegam à IA: ela não tem como usar sem
   * errar.
   */
  const perguntas: Array<{ kind: string; question: string; text: string }> = [];
  for (const item of serp?.peopleAlsoAsk || []) perguntas.push({ kind: "Pessoas também perguntam", question: t(item.question), text: t(item.question) });
  for (const item of p.serp.questions.slice().sort((a, b) => b.pages - a.pages).slice(0, 12)) {
    perguntas.push({ kind: "pergunta da amostra", question: item.question, text: `${item.question} (${item.pages} de ${item.sampleSize} páginas)` });
  }
  const ordemDePrioridade: Record<string, number> = { HIGH: 0, MEDIUM: 1, LOW: 2 };
  for (const item of (p.descoberta?.questionCoverageRequirements || []).slice().sort((a, b) => (ordemDePrioridade[a.priority] ?? 3) - (ordemDePrioridade[b.priority] ?? 3)).slice(0, 6)) {
    perguntas.push({ kind: `pergunta a responder (${PRIORIDADE[item.priority] || "descoberta"})`, question: item.question, text: item.question });
  }
  for (const item of (p.descoberta?.answerableUnits || []).filter(unidade => unidade.importance === "CORE").slice(0, 4)) {
    perguntas.push({ kind: "necessidade central da busca", question: item.questionOrNeed, text: item.questionOrNeed });
  }
  const perguntasVistas = new Set<string>();
  for (const item of perguntas) {
    const chave = radarWritingCompareKey(item.question);
    if (!chave || perguntasVistas.has(chave) || radarWritingRhetoricalQuestion(item.question) || tocaFora(item.question)) continue;
    perguntasVistas.add(chave);
    add("P", item.kind, item.text);
  }

  for (const item of serp?.relatedSearches || []) if (t(item.term) && !tocaFora(item.term)) add("B", "busca relacionada", t(item.term));
  if (serp?.features?.aiOverview?.shown) add("A", "AI Overview", `aparece; cita ${serp.features.aiOverview.citedSources.slice(0, 5).map(fonte => fonte.domain).join(", ")}`);
  for (const item of p.serp.concepts.filter(conceito => conceito.status !== "ISOLATED").slice(0, 20)) {
    if (!tocaFora(item.label)) add("C", "conceito da amostra", `${item.label} (${item.sourceCount} de ${item.sampleSize} páginas)`);
  }
  for (const item of p.serp.gaps.slice(0, 6)) if (!tocaFora(item.subject)) add("G", "lacuna", `${item.subject} (${item.pagesCovering} de ${item.sampleSize} páginas cobrem)`);
  for (const item of p.serp.differentiations.slice(0, 6)) if (!tocaFora(item.subject)) add("D", "diferencial possível", `${item.subject} (${item.pagesCovering} páginas cobrem)`);
  for (const item of serp?.features?.videos || []) add("Y", "vídeo na SERP", `${item.title || "vídeo"} · ${item.url}`);
  if (serp?.diagnostic) {
    if (serp.diagnostic.dominantFormats.length) add("F", "formato dominante", serp.diagnostic.dominantFormats.join(", "));
    for (const oportunidade of serp.diagnostic.opportunities.slice(0, 4)) add("O", "oportunidade da SERP", oportunidade);
  }
  /* 2026-10-02 · as lentes (desktop e mobile, por exemplo): o que muda entre elas no topo. */
  const lentesDaPrincipal = p.lentes?.keywords.find(item => item.role === "principal") || p.lentes?.keywords[0];
  if (lentesDaPrincipal?.divergence.statement) add("L", "lentes da SERP", lentesDaPrincipal.divergence.statement);

  /* Os destinos possíveis dos links: o Silo inteiro, a SiloPage e o que o grafo aprovado pede. */
  const linkCandidates: RadarArticleBlueprintLinkCandidate[] = [];
  const doGrafo = new Set(p.linksDoPlano.map(link => radarWritingCompareKey(link.targetTitle)));
  for (const membro of (input.silo?.members || []).filter(item => item.articleId !== input.articleId)) {
    const rotulo = semMolduraDoTema(t(membro.principalKeyword) || t(membro.title) || t(membro.slug));
    if (!rotulo) continue;
    linkCandidates.push({
      id: `K${linkCandidates.length + 1}`,
      label: rotulo,
      role: membro.role,
      destination: membro.slug ? `/${membro.slug}` : null,
      status: membro.slug ? "PLANNED" : "UNRESOLVED",
      fromGraph: doGrafo.has(radarWritingCompareKey(rotulo)) || doGrafo.has(radarWritingCompareKey(membro.title)),
    });
  }
  const pagina = input.silo?.siloPage;
  if (pagina) {
    const publicada = t(pagina.publishedUrl);
    linkCandidates.push({
      id: `K${linkCandidates.length + 1}`,
      label: `SiloPage "${input.silo?.label}"`,
      role: "SiloPage",
      destination: publicada || t(pagina.canonical) || (pagina.slug ? `/${pagina.slug}` : null),
      status: publicada ? "PUBLISHED" : pagina.canonical || pagina.slug ? "PLANNED" : "UNRESOLVED",
      fromGraph: false,
    });
  }

  /*
   * A PÁGINA DA MARCA QUE A SKILL CITA (ex.: a página comercial) é destino
   * possível do CTA. Só URL do PRÓPRIO domínio; e só entra no texto se a IA a
   * puser no plano e o dono aprovar.
   */
  if (input.brandVoice) {
    const site = t(input.publication?.publishedUrl) || t(entrada.article.canonical) || t(input.silo?.siloPage?.publishedUrl) || t(input.silo?.siloPage?.canonical) || null;
    for (const url of radarBrandVoiceOwnUrls(input.brandVoice, site)) {
      if (linkCandidates.some(item => item.destination === url)) continue;
      linkCandidates.push({ id: `K${linkCandidates.length + 1}`, label: `Página da marca ${new URL(url).pathname}`, role: "Página da marca (Skill de voz)", destination: url, status: "PUBLISHED", fromGraph: false });
    }
  }

  const afirmacao = new Map((p.autoridade?.claims || []).map(claim => [claim.claimId, claim.canonicalClaim]));
  const sources: RadarArticleBlueprintSource[] = [];
  for (const fonte of (p.autoridade?.factualEvidence || []).filter(item => item.supportType === "SUPPORTS")) {
    if (sources.some(item => item.url === fonte.sourceUrl)) continue;
    sources.push({ id: `X${sources.length + 1}`, url: fonte.sourceUrl, title: corte(fonte.sourceTitle || fonte.sourceDomain, 120), claim: corte(afirmacao.get(fonte.claimId) || "", 200) });
  }

  const especialista = radarWritingSpecialistContributions(p).map(item => ({ id: item.rotulo, kind: item.tipo, text: item.resposta }));
  /*
   * 2026-10-02 · OS VÍDEOS COM O MODO DE USO DO DONO (Adendo B, D6).
   *
   * Os trechos casados vêm primeiro, como antes, agora com o modo da fonte
   * quando há. Depois, um V por vídeo com modo — inclusive o que nenhuma pauta
   * casou (Incorporar, Contexto, Sugestão de pauta). "Não usar" não chega: a
   * projeção já o tirou. Sem modo nenhum, a lista é a de antes.
   */
  const trechosDeVideo = p.video.briefs.flatMap(brief => brief.extracts.slice(0, 2).map(trecho => ({
    text: `${trecho.sourceTitle} ${trecho.startLabel}–${trecho.endLabel}: ${corte(trecho.text, 220)}${trecho.usage ? ` · modo: ${RADAR_VIDEO_USAGE_LABEL[trecho.usage]}` : ""}`,
    usage: trecho.usage,
    title: trecho.sourceTitle,
    url: trecho.sourceUrl ?? null,
  })));
  const videosComModo = (p.video.selected || []).map(item => ({
    text: [
      `Vídeo "${item.title}"${item.url ? ` (${item.url})` : ""} · modo: ${item.usageLabel} — ${RADAR_VIDEO_USAGE_HINT[item.usage]}`,
      ...(item.section ? [`seção da pauta: ${item.section}`] : []),
      ...(item.excerpt ? [`trecho ${item.excerpt.startLabel}–${item.excerpt.endLabel}: ${corte(item.excerpt.text, 220)}`] : []),
      ...(item.summary ? [`do que trata: ${corte(item.summary, 220)}`] : []),
      ...(item.note ? [`nota do dono: ${corte(item.note, 220)}`] : []),
    ].join(" · "),
    usage: item.usage as RadarVideoUsage | undefined,
    title: item.title,
    url: item.url,
  }));
  const videos = [...trechosDeVideo, ...videosComModo]
    .map((item, indice) => ({ id: `V${indice + 1}`, text: item.text, ...(item.usage ? { usage: item.usage } : {}), title: item.title, url: item.url }));

  const publicacao = input.publication;
  return {
    article: {
      principal,
      complementary: [
        ...p.dna.secondaryKeywords.map(keyword => ({ keyword, role: "secundária" })),
        ...p.dna.narrativeReinforcements.map(keyword => ({ keyword, role: "reforço narrativo" })),
      ].filter(item => radarWritingCompareKey(item.keyword) !== radarWritingCompareKey(principal))
        .map(item => ({ ...item, volume: volume.get(radarWritingCompareKey(item.keyword)) ?? null })),
      subject: p.assunto?.phrase ?? null,
      intent: t(p.dna.intent) || null,
      funnel: t(p.dna.funnel) || null,
      siloRole: t(p.dna.siloRole) || null,
      audience: t(entrada.article.audience) || null,
      promise: t(entrada.article.promise) || null,
      slug: t(publicacao?.slug) || t(entrada.article.slug) || null,
      publishedUrl: publicacao?.published || entrada.article.publishedProtected ? t(publicacao?.publishedUrl) || t(entrada.article.canonical) || null : null,
      mustCover: p.dna.mustCover,
      unit: unidadeDe(entrada, p.editorial.editorialOutput),
    },
    silo: input.silo && input.silo.kind === "silo"
      ? { label: input.silo.label, centralEntity: input.silo.centralEntity, excludedTopics: input.silo.excludedTopics }
      : null,
    skeleton: esqueletoComTemas(esqueletoDaSerp(p.editorial.sections, tocaFora), radarWritingCompetitorTopicsOf(input.entrada, p)?.topics || []),
    skeletonFrame: {
      workingTitle: limpo(p.editorial.title) || null,
      promise: limpo(p.editorial.readerPromise) ? corte(limpo(p.editorial.readerPromise), L.textChars) : null,
      closing: limpo(p.editorial.conclusion) ? corte(limpo(p.editorial.conclusion), L.textChars) : null,
    },
    evidence,
    linkCandidates,
    graphLinks: [
      ...p.linksDoPlano.map(link => `${link.relationship.split(",")[0]?.trim() || "link"}: âncora "${link.suggestedAnchor}" → ${link.targetTitle}`),
      ...p.dna.internalLinkRequirements.filter(item => !UUID.test(item)),
    ].slice(0, 12),
    sources,
    unsupportedClaims: radarWritingUnsupportedClaims(p.autoridade, p.serp).map(item => item.afirmacao).slice(0, 8),
    specialist: especialista,
    videos,
    outOfScope,
    competitorTitles: (serp?.organic || []).map(item => t(item.title)).filter(Boolean),
    measures: radarArticleBlueprintMeasures((p.concorrentes?.competitors || []).filter(item => item.comparable).map(item => item.structure)),
    authors: entrada.authors ? entrada.authors.map(autor => ({ name: autor.name, specialty: autor.specialty, source: autor.source })) : null,
    brandVoice: input.brandVoice ? { ref: radarBrandVoiceRef(input.brandVoice), excerpts: vozCompacta(input.brandVoice) } : null,
  };
}

/* ============================== o pedido à IA ============================== */

const linhaDoEsqueleto = (item: RadarArticleBlueprintSkeletonItem) => [
  `${item.level === 3 ? "  " : ""}${item.id} · H${item.level}${item.parent ? ` (de ${item.parent})` : ""} · ${item.heading}`,
  ...(item.readerQuestion ? [`responde: ${item.readerQuestion}`] : []),
  ...(item.cover.length ? [`cobrir: ${item.cover.join(" · ")}`] : []),
  ...(item.mustCover ? ["obrigatória pelo ArticleDNA"] : []),
  ...(item.needsSource ? ["precisa de fonte"] : []),
  ...(item.needsSpecialist ? ["pede revisão profissional"] : []),
  ...(item.outOfScope ? ["FORA DO ESCOPO: descarte"] : []),
].join(" · ");

const nomesDosAutores = (autores: readonly RadarArticleBlueprintAuthor[]) =>
  autores.map(autor => `${autor.name}${autor.specialty ? ` (${autor.specialty})` : ""}`).join(" e ");

/**
 * O PEDIDO À IA. `short` é a SEGUNDA tentativa, depois de uma resposta cortada
 * ou fora do formato (2026-10-02): mesmas regras, saída menor.
 */
export function radarArticleBlueprintPrompt(brief: RadarArticleBlueprintBrief, opcoes: { short?: boolean; fix?: { previous: unknown; pending: readonly string[] } } = {}): { system: string; user: string } {
  const m = brief.measures;
  const a = brief.article;
  const system = [
    "Você é o editor-chefe de SEO de uma agência brasileira. A SERP já montou o esqueleto do conteúdo que vence a busca (seções M1…Mn) e reuniu as evidências. Sua tarefa é ORGANIZAR esse esqueleto no ARTIGO-MODELO: a planta que um redator vai seguir. Você organiza; não escreve o texto e não inventa.",
    "Responda SOMENTE com JSON no formato pedido, em português do Brasil, com frases curtas e diretas.",
    "Regras:",
    "1. Use só o que está no pacote. Cite pelos ids dados (M, S, P, B, A, C, G, D, Y, F, O, L). Nunca invente id, número, estudo, autor, depoimento ou URL.",
    "2. A SERP manda na intenção (Google e respostas de IA): responda a intenção que a busca mostra, com o recorte do leitor da marca. Se a amostra for de outro público, diga como adaptar ao leitor.",
    "3. Dê sentido a TODAS as keywords: onde cada uma entra (H1, H2, H3, corpo) e por quê, sem forçar repetição. O H1 traz a keyword principal inteira, em frase natural.",
    "4. ORGANIZE O ESQUELETO: cada seção diz de onde vem no campo \"from\" (ids M do esqueleto e/ou ids de evidência). Pode renomear, reordenar, juntar e descartar seções M — o descarte vai em \"discarded\" com o motivo. Só acrescente seção nova quando uma evidência (P, C, G, D, B, A, O) a sustenta, e cite-a. Não cubra o que está em 'fora do escopo'. Sem seção de perguntas frequentes (FAQ): as perguntas entram nas seções.",
    "5. Cada seção abre respondendo a pergunta dela (resposta clara, citável por IA), depois explica. Negrito só em termo ou entidade, nunca frase inteira.",
    "6. Links internos: só para os candidatos K dados, com âncora natural e o motivo. Inclua o link para o Pilar quando o artigo for Suporte e para a SiloPage quando houver. Distribua pelas seções certas.",
    "7. Links externos: só onde uma afirmação precisa de reforço; use a fonte X quando existir; sem fonte X, source = null (o redator vai obter uma fonte oficial).",
    "8. Abertura: a dúvida real do leitor sobre a keyword principal (nunca pergunta retórica de concorrente nem pergunta de outro assunto); outro canal ou assunto vizinho entra depois, numa seção. A evidência da abertura responde à mesma pergunta. Fechamento e CTA na voz do especialista (id E) quando houver, levando ao próximo passo no Silo.",
    "9. Plano visual: exatamente uma CAPA e 2 ou 3 respiros (R1, R2, R3), cada respiro ligado a uma seção, com prompt de imagem de até 400 caracteres, ALT e legenda. O prompt termina com a proporção (capa 16:9, respiro 4:3, salvo outra indicação da voz da marca). Sem marca de terceiros, sem antes/depois. Sem texto legível na imagem: se ela precisa mostrar interface (perfil, enquete, botão), peça elementos genéricos sem texto legível; diagrama, funil ou comparação com rótulos vira ilustração em SVG (diga no conceito). Nunca tela fictícia de resultado (ranking, métricas, avaliações) como se fosse prova. Cada imagem tem cena diferente: não repita a mesma pessoa na mesma situação.",
    "10. Não copie títulos nem frases de concorrentes. URL, slug e canonical publicados não mudam.",
    `11. Medidas: use como referência os concorrentes comparáveis (${m.comparablePages} páginas): ${m.words.median ? `mediana de ${m.words.median} palavras (P25 ${m.words.p25}, P75 ${m.words.p75})` : "palavras não medidas"}, H2 ${m.h2 ?? "?"}, H3 ${m.h3 ?? "?"}, parágrafos ${m.paragraphs ?? "?"}, imagens ${m.images ?? "?"}. Supere em profundidade útil, não em enchimento.`,
    "12. VOZ DA MARCA: quando o pacote trouxer os trechos da Skill de voz, eles mandam na forma: promessa, H1, títulos, abertura, CTA, transição comercial, vocabulário e prompts de imagem seguem a Skill; o que ela proíbe não entra. O CTA usa a oferta da Skill e, se couber, o candidato 'Página da marca'. A Skill não muda keyword, intenção nem escopo do artigo.",
    /* 2026-10-02 · Adendo B (D6): a regra só entra quando algum vídeo tem modo; sem modo, o pedido é o de antes. */
    ...(brief.videos.some(item => item.usage)
      ? ["13. VÍDEOS DA MARCA (id V): o modo de uso de cada um é decisão do dono e manda. Incorporar: o vídeo pode virar uma seção com ele incorporado (campo video da seção). Citação: fala literal, entre aspas, atribuída ao vídeo e com o tempo. Apoio: o trecho sustenta um ponto, atribuído ao vídeo e com o tempo. Contexto: só para entender o assunto; NÃO é citável e não vai no campo video. Sugestão de pauta: ideia de seção ou pergunta a validar contra a SERP; não é citável e não vai no campo video. Vídeo marcado 'Não usar' não está no pacote e não entra."]
      : []),
    `14. TIPO DA UNIDADE: a planta segue o tipo (aqui: ${a.unit.label}${a.unit.format ? `, formato ${a.unit.format}` : ""}). Guia ou artigo responde e ensina; review ou comparativo traz critérios, prós e contras e veredito; landing page ou página de serviço traz problema, oferta, prova, objeções e CTA; SiloPage apresenta o tema e distribui para os artigos do Silo.`,
    "15. AUTORIA (E-E-A-T): quando o pacote disser quem assina, o eeat cita essa pessoa pelo nome cadastrado, sem credencial além do cadastro; sem quem assine, diga em eeat que falta definir.",
    `16. TAMANHO: no máximo ${L.sections} seções, ${L.h3} H3 por seção e ${L.explain} itens em explain; uma frase por campo de texto. A resposta inteira cabe em ~4 mil tokens.`,
    "17. AFIRMAÇÕES: answerFirst e explain não transformam a dificuldade do leitor em regra universal ('foi desenhado para', 'nunca', 'sempre', 'raramente', 'pacientes prontos para comprar') sem evidência citada; escreva de forma delimitada e, se for afirmação sobre plataforma, algoritmo ou comportamento do público, ponha um link externo com fonte a obter. Não prescreva gratuidade, urgência, oferta exclusiva, condição especial, depoimento nem antes/depois como receita: só se a voz da marca e o pacote sustentarem.",
    "19. UMA ENTREGA POR SEÇÃO: cada seção entrega algo diferente ao leitor (diagnóstico, ajuste, conteúdo, próximo passo, alternativa…); duas seções não tratam do mesmo assunto com nomes diferentes ('como usar de forma estratégica' e 'estratégias práticas' são a mesma). O conteúdo prático chega cedo, logo depois do diagnóstico.",
    "20. DEMONSTRAÇÃO E PREMISSA: em seção que ensina a fazer, practical descreve a demonstração (ex.: um exemplo ilustrativo antes → o ajuste → depois), nunca uma cena decorativa. A promessa e o ângulo dizem o que o leitor aprende, sem regra universal: eles viram a premissa do vídeo, dos cortes e do carrossel.",
    "18. ORIGEM: cada id em from trata do assunto da seção. Não use a mesma seção M em seções de assuntos diferentes; seção comercial da marca (oferta, transição) vem da voz da marca e da evidência que a sustenta, sem fingir que veio de uma seção M.",
    ...(opcoes.short
      ? ["SAÍDA CURTA (a resposta anterior veio cortada ou fora do formato): no máximo 5 seções, 2 H3 por seção, 2 itens em explain, sem alternatives, uma frase curta por campo e prompts de imagem de até 250 caracteres. Feche o JSON."]
      : []),
  ].join("\n");

  const linhas = (titulo: string, itens: string[]) => (itens.length ? [`## ${titulo}`, ...itens.map(item => `- ${item}`), ""] : []);
  const moldura = brief.skeletonFrame;
  const user = [
    "# Unidade",
    `Tipo: ${a.unit.label}${a.unit.format ? ` · formato: ${a.unit.format}` : ""}`,
    `Keyword principal: ${a.principal}`,
    ...a.complementary.map(item => `Keyword complementar (${item.role}): ${item.keyword}${item.volume !== null ? ` · ${item.volume}/mês` : ""}`),
    ...(a.subject ? [`Assunto (tronco): ${a.subject}`] : []),
    `Intenção declarada: ${a.intent || "não declarada"}${a.funnel ? ` · funil ${a.funnel}` : ""}`,
    `Papel no Silo: ${a.siloRole || "não declarado"}`,
    ...(a.audience ? [`Público: ${a.audience}`] : []),
    ...(a.promise ? [`Promessa declarada: ${a.promise}`] : []),
    ...(a.slug ? [`Slug: ${a.slug}`] : []),
    ...(a.publishedUrl ? [`Publicado em: ${a.publishedUrl} (preservar URL, slug e canonical; é atualização)`] : []),
    ...(a.mustCover.length ? [`Cobertura obrigatória: ${a.mustCover.join(" · ")}`] : []),
    ...(brief.authors
      ? [brief.authors.length
        ? `Quem assina (E-E-A-T): ${nomesDosAutores(brief.authors)} — especialista da aba Especialista${brief.authors.every(autor => autor.source === "only_active") ? " (único ativo da marca; a confirmar)" : ""}`
        : "Quem assina (E-E-A-T): nenhum especialista definido na aba Especialista"]
      : []),
    "",
    ...(brief.silo ? [`# Silo: ${brief.silo.label}${brief.silo.centralEntity ? ` (tema central: ${brief.silo.centralEntity})` : ""}`, ""] : []),
    "# Esqueleto da SERP (o ponto de partida: organize e cite pelo id M)",
    ...(moldura.workingTitle ? [`Título de trabalho do esqueleto: ${moldura.workingTitle} (pode estar malformado; o H1 é seu, com a keyword principal)`] : []),
    ...(moldura.promise ? [`Promessa do esqueleto: ${moldura.promise}`] : []),
    ...(brief.skeleton.length
      ? brief.skeleton.map(linhaDoEsqueleto)
      : ["A SERP não deixou seções neste pacote: monte as seções só a partir das evidências (P, C, G, D) e cite-as em from."]),
    ...(moldura.closing ? [`Fecho do esqueleto: ${moldura.closing}`] : []),
    "",
    ...linhas("Evidências da SERP (cite pelo id)", brief.evidence.map(item => `${item.id} · ${item.kind}: ${item.text}`)),
    ...linhas("Candidatos a link interno (use o id K)", brief.linkCandidates.map(item => `${item.id} · ${item.role} · ${item.label} · ${item.destination || "sem endereço"} · ${item.status === "PUBLISHED" ? "publicado" : item.status === "PLANNED" ? "planejado" : "não resolvido"}${item.fromGraph ? " · pedido pelo grafo aprovado" : ""}`)),
    ...linhas("Grafo aprovado (links que o Arquiteto pediu)", brief.graphLinks),
    ...linhas("Fontes verificadas (id X)", brief.sources.map(item => `${item.id} · ${item.title} · ${item.url} · sustenta: ${item.claim}`)),
    ...linhas("Afirmações que o mercado repete SEM fonte (não afirmar como fato)", brief.unsupportedClaims),
    ...linhas("Especialista (id E; voz de quem pratica)", brief.specialist.map(item => `${item.id}${item.kind ? ` (${item.kind})` : ""}: ${item.text}`)),
    ...linhas("Vídeos da marca (id V)", brief.videos.map(item => `${item.id}: ${item.text}`)),
    ...linhas("Fora do escopo (não cobrir)", brief.outOfScope),
    ...(brief.brandVoice
      ? [
        `# Voz da marca — Skill "${brief.brandVoice.ref.name}" v${brief.brandVoice.ref.version} (${radarBrandVoiceStatusLabel(brief.brandVoice.ref.status)} na Marca). Trechos por assunto; siga em toda a copy, no CTA e no plano visual.`,
        ...brief.brandVoice.excerpts.flatMap(item => [`## ${item.title}`, item.text, ""]),
      ]
      : []),
    "# Formato da resposta (JSON)",
    JSON.stringify({
      keywordPlan: { reading: "como as keywords se atendem juntas", principalPlacement: ["H1", "primeiro parágrafo"], complementary: [{ keyword: "", placement: "H2 x", reason: "" }], slugNote: null },
      reader: "", promise: "", angle: { statement: "", evidence: ["S1"] },
      title: { h1: "", alternatives: [""], seoTitle: "até 60 caracteres", metaDescription: "até 155 caracteres" },
      opening: { readerQuestion: "", direction: "", evidence: ["P1"] },
      sections: [{ h2: "", readerQuestion: "", answerFirst: "", from: ["M1", "P2"], h3: [""], explain: [""], paragraphs: 3, bold: ["termo"], terms: ["termo LSI"], evidence: ["C1"], specialist: null, video: null, internalLinks: [{ candidate: "K1", anchor: "", reason: "" }], externalLinks: [{ claim: "", sourceType: "fonte oficial", source: null }], image: "R1", practical: null }],
      discarded: [{ id: "M3", reason: "" }],
      closing: { turn: "", specialist: "E1", cta: "", nextStep: "" },
      visual: [{ slot: "CAPA", section: null, concept: "", prompt: "", alt: "", caption: "" }],
      eeat: [""], warnings: [""],
    }),
    /*
     * 2026-10-02 · D10 · A PASSADA DE CORREÇÃO. O entregável sai concluído: com
     * pendência na conferência, a IA recebe a planta anterior e a lista, e
     * devolve a planta INTEIRA corrigida (nada de "a revisar").
     */
    ...(opcoes.fix
      ? [
        "",
        "# CORREÇÃO OBRIGATÓRIA",
        "A planta abaixo foi conferida contra o pacote e tem estas pendências. Devolva a planta INTEIRA, no mesmo formato, já corrigida: troque a origem que não trata do assunto da seção, delimite ou sustente as afirmações absolutas, junte ou diferencie seções repetidas, faça a abertura responder à keyword principal. Não deixe nada para revisar depois.",
        ...opcoes.fix.pending.map(item => `- ${item}`),
        "Planta anterior:",
        JSON.stringify(opcoes.fix.previous),
      ]
      : []),
  ].join("\n");
  return { system, user };
}

/* ============================== quando a resposta falha ============================== */

/**
 * 2026-10-02 · POR QUE A RESPOSTA DA IA NÃO SERVIU — e se vale tentar de novo.
 *
 * Só três falhas autorizam UMA nova tentativa (uma chamada paga a mais, dita na
 * tela e registrada no log): a resposta cortada pelo teto (`finish_reason`
 * "length"), o JSON fora do formato e a resposta vazia. Tempo esgotado, quota,
 * credencial e erro do provider não são repetidos.
 */
export type RadarArticleBlueprintAiFailure = "CUT" | "FORMAT" | "EMPTY";

export function radarArticleBlueprintAiFailure(input: { code: string | null | undefined; finishReason: string | null | undefined }): RadarArticleBlueprintAiFailure | null {
  if (input.finishReason === "length") return "CUT";
  if (input.code === "AI_OUTPUT_INVALID") return "FORMAT";
  if (input.code === "AI_PROVIDER_INVALID_RESPONSE") return "EMPTY";
  return null;
}

/** A frase para a tela: nunca "JSON invalido" cru. */
export function radarArticleBlueprintAiFailureMessage(falha: RadarArticleBlueprintAiFailure, chamadas: number): string {
  const depois = chamadas > 1 ? ", mesmo depois de 1 nova tentativa com saída mais curta" : "";
  const fim = "Tente de novo; a investigação continua finalizada.";
  if (falha === "CUT") return `A resposta da IA veio cortada (passou do tamanho máximo)${depois}. ${fim}`;
  if (falha === "EMPTY") return `A IA não devolveu conteúdo${depois}. ${fim}`;
  return `A IA respondeu fora do formato combinado${depois}. ${fim}`;
}

/** O que fica registrado na versão quando a segunda tentativa salvou a organização. */
export function radarArticleBlueprintRetryNote(falha: RadarArticleBlueprintAiFailure): string {
  const motivo = falha === "CUT" ? "veio cortada (passou do tamanho máximo)" : falha === "EMPTY" ? "veio vazia" : "veio fora do formato";
  return `A primeira resposta da IA ${motivo}; o servidor fez 1 nova tentativa pedindo saída mais curta (2 chamadas de IA nesta organização).`;
}

/* ============================== a correção do servidor ============================== */

/**
 * 2026-10-02 · O RETRATO DE UM VÍDEO V DO PEDIDO (Adendo B; aditivo ao payload do Adendo A).
 *
 * O V que a IA põe na seção segue a numeração do PEDIDO (trechos de todas as
 * pautas, depois os vídeos com modo), que não é a da coluna de fontes do CSV.
 * Sem o retrato, "Vídeo da marca: V3" no CSV não diz qual vídeo é — e, como o
 * modo é lido ao vivo (fora do hash), um "Não usar" depois da aprovação faria
 * o V apontar para nada ou para OUTRO vídeo. O retrato guarda o que a IA viu
 * (título, endereço público, modo na geração); o id da fonte não entra.
 */
export type RadarArticleBlueprintVideo = { id: string; title: string; url: string | null; usage: RadarVideoUsage | null };

/**
 * 2026-10-02 · O QUE O EXPORT SABE, AO VIVO, DE CADA VÍDEO DO ARTIGO: um por
 * trecho da projeção e um por vídeo com modo. `sourcesColumnLabel` é o V da
 * coluna de fontes do CSV, quando o trecho está lá.
 */
export type RadarArticleBlueprintLiveVideo = { title: string; url: string | null; usage: RadarVideoUsage | null; sourcesColumnLabel: string | null };

/* Título genérico de fonte sem nome não identifica vídeo: só o endereço decide. */
const TITULOS_GENERICOS = new Set(["fonte da biblioteca", "video da biblioteca"]);

/** O mesmo vídeo: pelo endereço quando os dois têm; senão, pelo título. */
function mesmoVideo(a: { title: string; url: string | null }, b: { title: string; url: string | null }): boolean {
  if (a.url && b.url) return a.url === b.url;
  const chave = radarWritingCompareKey(a.title);
  return Boolean(chave) && !TITULOS_GENERICOS.has(chave) && chave === radarWritingCompareKey(b.title);
}

/**
 * 2026-10-02 · O estado que o export informa ao montar as colunas. NUNCA é
 * gravado: a versão no banco tem estado próprio (`state`), e o payload aprovado
 * é imutável.
 */
export type RadarArticleBlueprintApproval = "APPROVED" | "DRAFT";

export type RadarArticleBlueprintPayload = {
  schemaVersion: 1;
  blueprint: RadarArticleBlueprintAi;
  measures: {
    serp: RadarArticleBlueprintMeasures;
    plan: { sections: number; h3: number; paragraphs: number; bold: number; images: number; respites: number; internalLinks: number; externalLinks: number; wordsMin: number | null; wordsMax: number | null };
  };
  linkCandidates: RadarArticleBlueprintLinkCandidate[];
  sources: RadarArticleBlueprintSource[];
  evidence: RadarArticleBlueprintEvidence[];
  /**
   * 2026-10-02 · Aditivo (Adendo B): o retrato dos vídeos V que a IA recebeu.
   * Ausente em versões antigas e quando o pedido não teve vídeo — aí a seção
   * sai como antes ("Vídeo da marca: Vn").
   */
  videos?: RadarArticleBlueprintVideo[];
  /** 2026-10-02 · Aditivo: a versão da Skill de voz que a IA recebeu. Ausente em versões antigas. */
  brandVoice?: RadarBrandVoiceRef | null;
  /** 2026-10-02 · Aditivo: o esqueleto da SERP que a IA organizou (ids M). Ausente em versões antigas. */
  skeleton?: RadarArticleBlueprintSkeletonItem[];
  /** 2026-10-02 · Aditivo: o tipo da unidade que a planta segue. Ausente em versões antigas. */
  unit?: RadarArticleBlueprintUnit;
  /**
   * 2026-10-02 · NÃO PERSISTIDO: o export diz se esta é a versão aprovada ou a
   * proposta da IA ainda sem aprovação. Ausente = como antes (aprovada).
   */
  approval?: RadarArticleBlueprintApproval;
  /**
   * 2026-10-02 · NÃO PERSISTIDO: o que o servidor achou ao conferir a resposta
   * da IA (`validation` da versão, que já está gravada). O export o lê junto da
   * PROPOSTA, para o CSV dizer as pendências; ausente na aprovada.
   */
  validation?: string[];
  /** 2026-10-02 · NÃO PERSISTIDO: a origem da versão lida pelo export (proposta da IA ou edição do dono). */
  origin?: "ai" | "human_edit";
};

export class RadarArticleBlueprintInvalidError extends Error {
  readonly notes: string[];
  constructor(message: string, notes: string[]) {
    super(message);
    this.name = "RadarArticleBlueprintInvalidError";
    this.notes = notes;
  }
}

/**
 * O que vai ao banco: sem a marca de aprovação, que é do export (2026-10-02).
 * 2026-10-02 · Nem as pendências e a origem que o export lê junto da proposta:
 * elas já moram nas colunas da versão.
 */
export function radarArticleBlueprintPayloadToStore(payload: RadarArticleBlueprintPayload): RadarArticleBlueprintPayload {
  if (!("approval" in payload) && !("validation" in payload) && !("origin" in payload)) return payload;
  const copia = { ...payload };
  delete copia.approval;
  delete copia.validation;
  delete copia.origin;
  return copia;
}

/*
 * 2026-10-02 · O QUE AINDA PEDE AÇÃO DO DONO, entre as notas do servidor.
 *
 * As notas da conferência são de dois tipos: correção já aplicada ("removida",
 * "ignorado", "virou fonte a obter") e pendência que a correção não resolve
 * (H1 sem a principal, abertura de outro assunto, seção sem origem, respiros
 * a menos, título de concorrente…). Só as pendências vão ao CSV, uma a uma; as
 * correções são contadas.
 */
const PEDE_ACAO = /antes de aprovar|confira|troque|reescreva|a regra pede|\balvo ~|^falta\b|n[aã]o foi usad/i;

export function radarArticleBlueprintPendingNotes(notes: readonly string[]): { pending: string[]; corrected: number } {
  const limpas = notes.map(nota => t(nota)).filter(Boolean);
  const pending = [...new Set(limpas.filter(nota => PEDE_ACAO.test(nota)))];
  return { pending, corrected: limpas.length - limpas.filter(nota => PEDE_ACAO.test(nota)).length };
}

const nucleoDoPacote = (brief: RadarArticleBlueprintBrief) =>
  [brief.article.principal, ...brief.article.complementary.map(item => item.keyword), brief.article.subject || ""].filter(Boolean);

/**
 * O QUE A IA DEVOLVE É CONFERIDO CONTRA O PACOTE — e corrigido, com aviso.
 *
 * Id que não existe sai; link para fora do Silo sai; URL externa sem fonte vira
 * "fonte a obter"; seção fora do escopo ou de FAQ sai. Recusar a resposta inteira
 * jogaria fora uma chamada paga por um id errado; aceitar sem conferir deixaria a
 * IA inventar. Sobra menos de três seções: aí sim, recusa.
 *
 * 2026-10-02 · E A ORIGEM NA SERP: a origem que não existe sai; seção sem origem
 * nenhuma (nem M, nem evidência) fica com aviso para o dono decidir; seção do
 * esqueleto que a IA não usou nem descartou é dita; o que toca o fora do escopo
 * sai também do H3 e da origem.
 */
/**
 * 2026-10-02 · A AFIRMAÇÃO ABSOLUTA: transforma a dificuldade do leitor em regra
 * universal ("foi feito para entretenimento", "procuram no Google, não no
 * Instagram"). A conferência a aponta (e a passada de correção a resolve); o
 * CSV de vídeo não a repete como premissa.
 */
/*
 * 2026-10-02 · TÍTULOS GENÉRICOS DO MESMO TIPO. "Como usar o Instagram de forma
 * estratégica" e "Estratégias práticas para atrair clientes pelo Instagram" não
 * dividem palavras de assunto — só a palavra genérica ("estratégia"). Quando o
 * que sobra de cada título, tirando a keyword e as palavras genéricas, é quase
 * nada e as duas usam o mesmo genérico, os nomes não distinguem as entregas.
 */
const RAIZES_GENERICAS = ["estrateg", "pratic", "dica", "forma", "maneira", "tatic", "acao", "acoes", "passo", "usar", "uso", "aplic", "melhor", "funcion", "cert"];
const generica = (raiz: string) => RAIZES_GENERICAS.some(item => raiz.startsWith(item));

export function titulosGenericosIguais(a: string, b: string, comuns: ReadonlySet<string> = new Set()): boolean {
  const raizes = (titulo: string) => radarSemanticStems(titulo).filter(raiz => !comuns.has(raiz) && !RADAR_WRITING_FUNCTION_WORDS.has(raiz));
  const ra = raizes(a);
  const rb = raizes(b);
  const especificas = (lista: string[]) => lista.filter(raiz => !generica(raiz));
  const generico = (lista: string[]) => RAIZES_GENERICAS.filter(item => lista.some(raiz => raiz.startsWith(item)));
  const emComum = generico(ra).filter(item => generico(rb).includes(item));
  return emComum.length > 0 && especificas(ra).length <= 1 && especificas(rb).length <= 1;
}

export const RADAR_ABSOLUTE_CLAIM =/\b(nunca|sempre|jamais|ningu[eé]m|todo mundo|(n[aã]o )?foi (feito|feita|desenhad[oa]|criad[oa]) para|procura[mr]? no [a-z]+, n[aã]o no|n[aã]o serve para|s[oó] serve para)\b/i;

export function radarSanitizeArticleBlueprint(ai: RadarArticleBlueprintAi, brief: RadarArticleBlueprintBrief, opcoes: { close?: boolean } = {}): { payload: RadarArticleBlueprintPayload; notes: string[] } {
  const notes: string[] = [];
  const evidencias = new Set(brief.evidence.map(item => item.id));
  const esqueleto = brief.skeleton || [];
  const doEsqueleto = new Map(esqueleto.map(item => [item.id, item]));
  /* As palavras que todo o artigo compartilha (keywords, Assunto, moldura do esqueleto): não distinguem uma seção M. */
  const raizesComuns = new Set(radarSemanticStems([...nucleoDoPacote(brief), "o que considerar sobre", "o que o artigo precisa cobrir"].join(" ")));
  const candidatos = new Set(brief.linkCandidates.map(item => item.id));
  const fontes = new Set(brief.sources.map(item => item.id));
  const especialistas = new Set(brief.specialist.map(item => item.id));
  const videos = new Set(brief.videos.map(item => item.id));
  /*
   * 2026-10-02 · Contexto e Sugestão de pauta não são citáveis (Adendo B): o id
   * existe, mas não vale no campo `video` da seção. Sem modo, todo V vale.
   */
  const naoCitaveis = new Map(brief.videos.filter(item => item.usage === "CONTEXT" || item.usage === "TOPIC_SUGGESTION").map(item => [item.id, item.usage!]));
  const nucleo = nucleoDoPacote(brief);
  const tocaForaDoEscopo = radarArticleBlueprintOutOfScopeMatcher(brief.outOfScope, nucleo);
  const titulos = brief.competitorTitles.map(radarWritingCompareKey).filter(Boolean);

  const soIds = (lista: readonly string[], onde: string) => {
    const validos = lista.filter(id => evidencias.has(id));
    if (validos.length < lista.length) notes.push(`${onde}: ${lista.length - validos.length} evidência(s) com id inexistente removida(s).`);
    return validos;
  };

  const visual = ai.visual.filter(item => /^(CAPA|R[1-3])$/i.test(item.slot)).map(item => ({ ...item, slot: item.slot.toUpperCase() }));
  if (!visual.some(item => item.slot === "CAPA")) notes.push("Plano visual sem capa: defina a capa antes de aprovar.");
  const respiros = visual.filter(item => item.slot.startsWith("R")).length;
  if (respiros < 2) notes.push(`Plano visual com ${respiros} respiro(s): a regra pede dois ou três.`);
  const slots = new Set(visual.map(item => item.slot));

  const daIa = ai.sections.length > L.sections ? ai.sections.slice(0, L.sections) : ai.sections;
  if (daIa.length < ai.sections.length) notes.push(`A IA propôs ${ai.sections.length} seções; ficaram as ${L.sections} primeiras (teto do artigo-modelo).`);

  const secoes = daIa.flatMap(secao => {
    if (EH_FAQ.test(`${secao.h2} ${secao.readerQuestion}`)) {
      notes.push(`Seção "${secao.h2}" removida: FAQ não integra o fluxo.`);
      return [];
    }
    if (tocaForaDoEscopo(secao.h2) || tocaForaDoEscopo(secao.readerQuestion)) {
      notes.push(`Seção "${secao.h2}" removida: o pacote marca o assunto como fora do escopo.`);
      return [];
    }
    const h3 = secao.h3.filter(item => !EH_FAQ.test(item) && !tocaForaDoEscopo(item));
    if (h3.length < secao.h3.length) notes.push(`Seção "${secao.h2}": ${secao.h3.length - h3.length} H3 de FAQ ou fora do escopo removido(s).`);
    /* 2026-10-02 · a origem na SERP: só ids que existem, e nunca uma seção M marcada fora do escopo. */
    const origem = secao.from ?? [];
    const conhecidos = origem.filter(id => doEsqueleto.has(id) || evidencias.has(id));
    if (conhecidos.length < origem.length) notes.push(`Seção "${secao.h2}": ${origem.length - conhecidos.length} origem(ns) com id inexistente removida(s).`);
    const from = conhecidos.filter(id => !doEsqueleto.get(id)?.outOfScope);
    if (from.length < conhecidos.length) notes.push(`Seção "${secao.h2}": origem em seção da SERP marcada fora do escopo removida.`);
    const evidencia = soIds(secao.evidence, `Seção "${secao.h2}"`);
    if (!from.length && !evidencia.length) {
      notes.push(`Seção "${secao.h2}" não diz de onde vem na SERP (nenhum id M ou de evidência válido): a IA não acrescenta seção sem evidência — aponte a origem ou remova antes de aprovar.`);
    }
    /*
     * 2026-10-02 · ORIGEM QUE NÃO TRATA DO ASSUNTO DA SEÇÃO. A IA citava a
     * mesma M ("stories para atrair clientes") como origem de seções sobre outro
     * assunto. A seção M é origem quando a seção fala do que a distingue — as
     * palavras dela que não são da keyword principal nem da moldura "o que
     * considerar sobre". Sem nenhuma em comum, a origem fica, com aviso.
     */
    const raizesDaSecao = new Set(radarSemanticStems([secao.h2, secao.readerQuestion, ...secao.h3].join(" ")));
    const origemErrada = new Set<string>();
    for (const id of from) {
      const m = doEsqueleto.get(id);
      /* H3 do esqueleto citado junto do seu H2: quem decide o assunto é o H2. */
      if (!m || (m.parent && from.includes(m.parent))) continue;
      const distintas = radarSemanticStems(m.heading).filter(raiz => !raizesComuns.has(raiz));
      if (distintas.length && !distintas.some(raiz => raizesDaSecao.has(raiz))) {
        origemErrada.add(id);
        /* 2026-10-02 · D10 · fechando, a origem errada SAI (a planta vai concluída); antes, pendência para a correção. */
        notes.push(opcoes.close
          ? `Seção "${secao.h2}": origem ${id} ("${m.heading}") removida — não trata do assunto da seção.`
          : `Seção "${secao.h2}" cita ${id} ("${m.heading}") como origem, mas não trata do assunto dela: confira a origem antes de aprovar.`);
      }
    }
    const fromFinal = opcoes.close ? from.filter(id => !origemErrada.has(id)) : from;
    if (radarWritingRhetoricalQuestion(secao.readerQuestion)) notes.push(`Seção "${secao.h2}": a pergunta do leitor é retórica de concorrente; troque pela dúvida real.`);
    const links = secao.internalLinks.filter(link => candidatos.has(link.candidate));
    if (links.length < secao.internalLinks.length) notes.push(`Seção "${secao.h2}": link interno para destino fora do Silo removido.`);
    const externos = secao.externalLinks.map(link => {
      if (link.source && !fontes.has(link.source)) {
        notes.push(`Seção "${secao.h2}": fonte externa "${link.source}" não existe no pacote; virou "fonte a obter".`);
        return { ...link, source: null };
      }
      return link;
    });
    const naoCitavel = secao.video ? naoCitaveis.get(secao.video) : undefined;
    if (naoCitavel) notes.push(`Seção "${secao.h2}": o vídeo ${secao.video} é de ${RADAR_VIDEO_USAGE_LABEL[naoCitavel]} (não citável); saiu do campo vídeo da seção.`);
    return [{
      ...secao,
      from: fromFinal,
      h3,
      evidence: evidencia,
      internalLinks: links,
      externalLinks: externos,
      specialist: secao.specialist && especialistas.has(secao.specialist) ? secao.specialist : null,
      video: secao.video && videos.has(secao.video) && !naoCitavel ? secao.video : null,
      image: secao.image && slots.has(secao.image.toUpperCase()) ? secao.image.toUpperCase() : null,
      bold: secao.bold.filter(item => item.split(/\s+/).length <= 6),
    }];
  });
  /*
   * 2026-10-02 · AFIRMAÇÃO ABSOLUTA E SEÇÕES QUASE IGUAIS — a revisão do CSV
   * real achou as duas na proposta mesmo com a regra no pedido ("foi feito para
   * entretenimento", "procuram no Google, não no Instagram"; "Como usar o
   * Instagram de forma estratégica" × "Estratégias práticas…"). O servidor não
   * reescreve: aponta, e a pendência vai com a proposta até o dono decidir.
   */
  for (const secao of secoes) {
    const frase = [secao.answerFirst, ...secao.explain].find(texto => RADAR_ABSOLUTE_CLAIM.test(texto));
    if (frase) notes.push(`Seção "${secao.h2}" afirma de forma absoluta ("${corte(frase, 140)}"): delimite ou sustente com fonte antes de aprovar.`);
  }
  /* 2026-10-02 · a premissa também: promessa, ângulo, abertura e virada alimentam o vídeo, os cortes e o carrossel. */
  for (const [onde, frase] of [["A promessa", ai.promise], ["O ângulo", ai.angle.statement], ["A direção da abertura", ai.opening.direction], ["A virada do fechamento", ai.closing.turn]] as const) {
    if (frase && RADAR_ABSOLUTE_CLAIM.test(frase)) notes.push(`${onde} afirma de forma absoluta ("${corte(frase, 140)}"): delimite antes de aprovar — ela vira a premissa do vídeo, dos cortes e do carrossel.`);
  }
  const raizesDoTitulo = secoes.map(secao => new Set(radarSemanticStems(`${secao.h2} ${secao.readerQuestion}`).filter(raiz => !raizesComuns.has(raiz))));
  for (let i = 0; i < secoes.length; i += 1) {
    for (let j = i + 1; j < secoes.length; j += 1) {
      /* O radical não é uniforme ("estrategic" × "estrategi"): mesma raiz quando uma começa pela outra (5+ letras). */
      const comuns = [...raizesDoTitulo[i]].filter(raiz => [...raizesDoTitulo[j]].some(outra => raiz === outra || (Math.min(raiz.length, outra.length) >= 5 && (raiz.startsWith(outra) || outra.startsWith(raiz))))).length;
      const uniao = new Set([...raizesDoTitulo[i], ...raizesDoTitulo[j]]).size;
      if (comuns >= 2 && uniao && comuns / uniao >= 0.5) {
        notes.push(`Seções "${secoes[i].h2}" e "${secoes[j].h2}" tratam quase do mesmo assunto: junte ou dê a cada uma uma entrega diferente antes de aprovar.`);
      } else if (titulosGenericosIguais(secoes[i].h2, secoes[j].h2, raizesComuns)) {
        notes.push(`Seções "${secoes[i].h2}" e "${secoes[j].h2}" têm títulos genéricos do mesmo tipo (estratégia, dicas, prática): dê a cada uma o nome da entrega dela antes de aprovar.`);
      }
    }
  }

  if (secoes.length < 3) {
    throw new RadarArticleBlueprintInvalidError("O artigo-modelo da IA ficou com menos de três seções válidas; gere de novo.", notes);
  }

  /*
   * 2026-10-02 · O QUE A IA FEZ COM O ESQUELETO. O descarte vale para id M que
   * existe e não foi usado; a seção fora do escopo entra no descarte mesmo que
   * a IA não diga; e o que ela esqueceu é dito (H3 de um H2 usado conta como
   * usado: virou H3 da seção; e o H2 de um H3 usado também).
   */
  const usados = new Set(secoes.flatMap(secao => secao.from).filter(id => doEsqueleto.has(id)));
  const pedidos = ai.discarded ?? [];
  const descartados = new Map<string, { id: string; reason: string | null }>();
  let invalidos = 0;
  for (const item of pedidos) {
    if (!doEsqueleto.has(item.id)) { invalidos += 1; continue; }
    if (!usados.has(item.id) && !descartados.has(item.id)) descartados.set(item.id, item);
  }
  if (invalidos) notes.push(`Descarte: ${invalidos} id(s) que não existem no esqueleto da SERP ignorado(s).`);
  for (const item of esqueleto) {
    if (item.outOfScope && !usados.has(item.id) && !descartados.has(item.id)) descartados.set(item.id, { id: item.id, reason: "fora do escopo do pacote" });
  }
  const esquecidos = esqueleto.filter(item => !usados.has(item.id) && !descartados.has(item.id)
    && !(item.parent && usados.has(item.parent))
    && !esqueleto.some(filho => filho.parent === item.id && usados.has(filho.id)));
  if (esquecidos.length) {
    notes.push(`A IA não usou nem descartou ${esquecidos.length} seção(ões) do esqueleto da SERP (${esquecidos.slice(0, 4).map(item => `${item.id} "${item.heading}"`).join("; ")}${esquecidos.length > 4 ? "; …" : ""}): confira antes de aprovar.`);
  }

  const h1 = radarWritingCompareKey(ai.title.h1);
  if (titulos.some(titulo => titulo === h1)) notes.push("O H1 repete o título de um concorrente: reescreva antes de aprovar.");
  /* 2026-10-02 · o H1 traz a principal inteira (regra de SEO de qualquer página). */
  const raizesDaPrincipal = radarSemanticStems(brief.article.principal);
  const raizesDoH1 = new Set(radarSemanticStems(ai.title.h1));
  const faltamNoH1 = raizesDaPrincipal.filter(raiz => !raizesDoH1.has(raiz));
  if (raizesDaPrincipal.length && faltamNoH1.length) notes.push(`O H1 não traz a keyword principal inteira ("${brief.article.principal}"): confira antes de aprovar.`);
  if (radarWritingRhetoricalQuestion(ai.opening.readerQuestion)) notes.push("A abertura usa pergunta retórica de concorrente: troque pela dúvida do leitor.");
  /* 2026-10-02 · a abertura responde a dúvida sobre a PRINCIPAL, não sobre um assunto vizinho. */
  const raizesDaAbertura = new Set(radarSemanticStems(ai.opening.readerQuestion));
  const emComum = raizesDaPrincipal.filter(raiz => raizesDaAbertura.has(raiz)).length;
  if (raizesDaPrincipal.length && emComum < Math.min(2, raizesDaPrincipal.length)) {
    notes.push(`A pergunta da abertura ("${ai.opening.readerQuestion}") não fala da keyword principal ("${brief.article.principal}"): confira antes de aprovar.`);
  }
  if (tocaForaDoEscopo(ai.opening.readerQuestion)) notes.push("A pergunta da abertura toca assunto fora do escopo: troque antes de aprovar.");
  if (ai.title.seoTitle.length > 65) notes.push(`SEO title com ${ai.title.seoTitle.length} caracteres (alvo ~60).`);
  if (ai.title.metaDescription.length > 165) notes.push(`Meta description com ${ai.title.metaDescription.length} caracteres (alvo ~155).`);

  const pilar = brief.linkCandidates.find(item => /pilar/i.test(item.role));
  const linksUsados = new Set(secoes.flatMap(secao => secao.internalLinks.map(link => link.candidate)));
  if (pilar && /suporte|support/i.test(brief.article.siloRole || "") && !linksUsados.has(pilar.id)) notes.push(`Falta o link para o Pilar (${pilar.label}).`);

  const closingSpecialist = ai.closing.specialist && especialistas.has(ai.closing.specialist) ? ai.closing.specialist : null;
  if (brief.specialist.some(item => item.kind === "FECHAMENTO" || item.kind === "CTA") && !closingSpecialist) notes.push("O parecer de fechamento do especialista não foi usado na virada final.");

  /*
   * 2026-10-02 · A AUTORIA VAI NO E-E-A-T DO PLANO. Quem assina é dado da aba
   * Especialista, não da IA: entra pelo nome cadastrado, sem credencial além
   * dele; sem especialista, o plano diz que falta definir.
   */
  let eeat = ai.eeat;
  if (brief.authors) {
    const autores = brief.authors;
    if (autores.length) {
      const citado = eeat.some(item => autores.some(autor => radarWritingCompareKey(item).includes(radarWritingCompareKey(autor.name))));
      const unicoAtivo = autores.every(autor => autor.source === "only_active");
      if (!citado) eeat = [`Autoria: ${nomesDosAutores(autores)}, ${unicoAtivo ? "único especialista ativo da marca (confirme antes de publicar)" : "especialista da aba Especialista"}; assina o conteúdo, sem credencial além do cadastro.`, ...eeat].slice(0, L.eeat);
    } else {
      eeat = ["Autoria: nenhum especialista definido na aba Especialista do Radar; defina quem assina antes de publicar (não invente autor).", ...eeat].slice(0, L.eeat);
    }
  }

  const blueprint: RadarArticleBlueprintAi = {
    ...ai,
    angle: { ...ai.angle, evidence: soIds(ai.angle.evidence, "Ângulo") },
    opening: { ...ai.opening, evidence: soIds(ai.opening.evidence, "Abertura") },
    sections: secoes,
    discarded: [...descartados.values()],
    closing: { ...ai.closing, specialist: closingSpecialist },
    visual,
    eeat,
  };
  const m = brief.measures;
  return {
    notes,
    payload: {
      schemaVersion: 1,
      blueprint,
      measures: {
        serp: m,
        plan: {
          sections: secoes.length,
          h3: secoes.reduce((soma, secao) => soma + secao.h3.length, 0),
          paragraphs: secoes.reduce((soma, secao) => soma + secao.paragraphs, 0),
          bold: secoes.reduce((soma, secao) => soma + secao.bold.length, 0),
          images: visual.length,
          respites: respiros,
          internalLinks: secoes.reduce((soma, secao) => soma + secao.internalLinks.length, 0),
          externalLinks: secoes.reduce((soma, secao) => soma + secao.externalLinks.length, 0),
          wordsMin: m.words.p25 ?? m.words.median,
          wordsMax: m.words.p75 ?? m.words.median,
        },
      },
      linkCandidates: brief.linkCandidates,
      sources: brief.sources,
      evidence: brief.evidence,
      /* 2026-10-02 · O retrato dos V (Adendo B); sem vídeo no pedido, a chave não existe e o payload é o de antes. */
      ...(brief.videos.some(item => item.title)
        ? { videos: brief.videos.filter(item => item.title).map(item => ({ id: item.id, title: item.title!, url: item.url ?? null, usage: item.usage ?? null })) }
        : {}),
      brandVoice: brief.brandVoice?.ref ?? null,
      /* 2026-10-02 · o esqueleto que a IA organizou e o tipo da unidade, para a tela e o CSV dizerem de onde cada seção veio. */
      skeleton: esqueleto,
      unit: brief.article.unit,
    },
  };
}

/* ============================== a edição humana ============================== */

export const RadarArticleBlueprintEditSchema = z.object({
  promise: texto.optional(),
  reader: texto.optional(),
  title: z.object({ h1: curto.optional(), seoTitle: curto.optional(), metaDescription: z.string().trim().min(1).max(320).optional() }).optional(),
  openingQuestion: curto.optional(),
  sections: z.array(z.object({
    index: z.number().int().min(0).max(11),
    remove: z.boolean().optional(),
    h2: curto.optional(),
    readerQuestion: curto.optional(),
    answerFirst: texto.optional(),
  })).max(12).optional(),
}).strict();
export type RadarArticleBlueprintEdit = z.infer<typeof RadarArticleBlueprintEditSchema>;

/** A edição do dono vira OUTRA versão: a de antes fica como estava. */
export function radarApplyArticleBlueprintEdit(payload: RadarArticleBlueprintPayload, edit: RadarArticleBlueprintEdit): RadarArticleBlueprintPayload {
  const b = payload.blueprint;
  const porIndice = new Map((edit.sections || []).map(item => [item.index, item]));
  const secoes = b.sections.flatMap((secao, indice) => {
    const mudanca = porIndice.get(indice);
    if (!mudanca) return [secao];
    if (mudanca.remove) return [];
    return [{ ...secao, h2: mudanca.h2 ?? secao.h2, readerQuestion: mudanca.readerQuestion ?? secao.readerQuestion, answerFirst: mudanca.answerFirst ?? secao.answerFirst }];
  });
  if (secoes.length < 1) throw new RadarArticleBlueprintInvalidError("O artigo-modelo precisa de ao menos uma seção.", []);
  return {
    ...radarArticleBlueprintPayloadToStore(payload),
    blueprint: {
      ...b,
      promise: edit.promise ?? b.promise,
      reader: edit.reader ?? b.reader,
      title: { ...b.title, h1: edit.title?.h1 ?? b.title.h1, seoTitle: edit.title?.seoTitle ?? b.title.seoTitle, metaDescription: edit.title?.metaDescription ?? b.title.metaDescription },
      opening: { ...b.opening, readerQuestion: edit.openingQuestion ?? b.opening.readerQuestion },
      sections: secoes,
    },
    measures: {
      ...payload.measures,
      plan: {
        ...payload.measures.plan,
        sections: secoes.length,
        h3: secoes.reduce((soma, secao) => soma + secao.h3.length, 0),
        paragraphs: secoes.reduce((soma, secao) => soma + secao.paragraphs, 0),
        bold: secoes.reduce((soma, secao) => soma + secao.bold.length, 0),
        internalLinks: secoes.reduce((soma, secao) => soma + secao.internalLinks.length, 0),
        externalLinks: secoes.reduce((soma, secao) => soma + secao.externalLinks.length, 0),
      },
    },
  };
}

/*
 * 2026-10-02 · O QUE O RELATÓRIO PRECISA SABER DA PLANTA.
 *
 * O pilar "Estrutura editorial" lia só os blocos determinísticos antigos, e o
 * de links só o posicionamento que a amostra sustenta; os dois davam 0% e 50%
 * num artigo com a planta da SERP pronta (6 H2, 6 links). Aqui o resumo da
 * planta: quantas seções, quantos links, e quantos destinos que o grafo
 * aprovado pede ela de fato posiciona.
 */
export type RadarArticleBlueprintReportFacts = {
  sections: number;
  internalLinks: number;
  graphRequired: number;
  graphPlaced: number;
};

export function radarArticleBlueprintReportFacts(payload: Pick<RadarArticleBlueprintPayload, "blueprint" | "linkCandidates">): RadarArticleBlueprintReportFacts {
  const links = payload.blueprint.sections.flatMap(secao => secao.internalLinks);
  const usados = new Set(links.map(link => link.candidate));
  const doGrafo = payload.linkCandidates.filter(item => item.fromGraph);
  return {
    sections: payload.blueprint.sections.length,
    internalLinks: links.length,
    graphRequired: doGrafo.length,
    graphPlaced: doGrafo.filter(item => usados.has(item.id)).length,
  };
}

/* ============================== as colunas do CSV ============================== */

/*
 * 2026-10-02 · A URL DA EVIDÊNCIA SAI INTEIRA. O corte em 90 caracteres caía
 * dentro do endereço ("…/blog/%E2%80%A6"): o redator recebia link quebrado. O
 * título é que encurta; o trecho do concorrente fica na coluna da SERP.
 */
function textoDaEvidencia(texto: string): string {
  const partes = texto.split(" · ");
  const url = partes.find(parte => /^https?:\/\//i.test(parte));
  if (!url) return corte(texto, 90);
  const resto = partes.filter(parte => parte !== url && !/^["“]/.test(parte)).join(" · ");
  return resto ? `${corte(resto, 70)} · ${url}` : url;
}

/* 2026-10-02 · a evidência S diz em que lente (janela) da SERP a página apareceu, quando o export sabe. */
function lenteDaEvidencia(texto: string, lentesDoDominio: ((dominio: string) => string | null) | null): string {
  if (!lentesDoDominio) return "";
  const url = texto.split(" · ").find(parte => /^https?:\/\//i.test(parte));
  if (!url) return "";
  try {
    const onde = lentesDoDominio(new URL(url).hostname);
    return onde ? ` · ${onde}` : "";
  } catch {
    return "";
  }
}

/*
 * 2026-10-07 · exportado (aditivo, §4) para a cadeia competitiva do CSV de
 * vídeo citar as evidências pelo MESMO rótulo do CSV para escrever. Nada muda
 * aqui: o CSV para escrever e o Redator continuam iguais.
 */
export const rotuloDaEvidencia = (payload: RadarArticleBlueprintPayload, ids: readonly string[], lentesDoDominio: ((dominio: string) => string | null) | null = null) =>
  ids.map(id => payload.evidence.find(item => item.id === id)).filter((item): item is RadarArticleBlueprintEvidence => Boolean(item))
    .map(item => `${item.id} (${textoDaEvidencia(item.text)}${lenteDaEvidencia(item.text, lentesDoDominio)})`);

/** "Cobrir com clareza o tema “X”." é a moldura da promessa padrão do Arquiteto: o destino é o X. */
const semMolduraDoTema = (valor: string): string => {
  const dentro = valor.match(/cobrir com clareza o tema\s*[“"]([^”"]+)[”"]/i);
  return dentro ? dentro[1].trim() : valor;
};

/*
 * 2026-10-02 · O PREFIXO DO SILO, PELA URL PUBLICADA DESTE ARTIGO. O caminho
 * planejado do irmão vem só com o slug ("/qualificados"); publicado, este
 * artigo mora em "/leads-sem-trafego-pago/instagram-nao-traz-pacientes". Quando
 * o último trecho da URL publicada é o slug deste artigo, o resto é o prefixo
 * que os irmãos provavelmente seguem — dito como provável, para confirmar.
 */
function prefixoDaUrlPublicada(article: { slug: string | null; publishedUrl: string | null } | null): string | null {
  if (!article?.publishedUrl || !article.slug) return null;
  try {
    const partes = new URL(article.publishedUrl).pathname.split("/").filter(Boolean);
    return partes.length >= 2 && partes[partes.length - 1] === article.slug ? `/${partes.slice(0, -1).join("/")}` : null;
  } catch {
    return null;
  }
}

/**
 * 2026-10-02 · A MARCA DA PROPOSTA. Enquanto o dono não aprova, o CSV já sai
 * com a estrutura organizada — e diz, no topo de cada coluna, que é proposta.
 */
export const RADAR_ARTICLE_BLUEPRINT_DRAFT_MARK = "PROPOSTA DA IA — aguardando aprovação no Radar (Pesquisa → Artigo-modelo da SERP)";

/**
 * 2026-10-02 · AS SEÇÕES DO PLANO APROVADO EM QUE UM VÍDEO ENTRA (Adendo B).
 *
 * Para o bloco dos modos da coluna de fontes dizer a seção do Incorporar que o
 * artigo-modelo aprovado escolheu, em vez de devolver a decisão a ele. `null` =
 * versão sem retrato dos vídeos (não dá para saber); lista vazia = o plano não
 * pôs este vídeo em seção nenhuma.
 *
 * 2026-10-02 · Proposta da IA ainda sem aprovação também devolve `null`: a
 * coluna de fontes fala do artigo-modelo APROVADO, e a proposta não é.
 */
export function radarArticleBlueprintVideoSections(payload: RadarArticleBlueprintPayload, video: { title: string; url: string | null }): string[] | null {
  /* 2026-10-02 · D10 · a planta do pacote vigente vale como concluída: a coluna de fontes usa a dela. */
  if (!payload.videos) return null;
  const ids = new Set(payload.videos.filter(item => mesmoVideo(item, video)).map(item => item.id));
  return payload.blueprint.sections.filter(secao => secao.video && ids.has(secao.video)).map(secao => secao.h2);
}

/**
 * 2026-10-02 · O VÍDEO DE UMA SEÇÃO, RESOLVIDO (Adendo B).
 *
 * Sem retrato (versão antiga), a linha de antes. Com retrato, o título e o
 * endereço — nunca só o V do pedido. Com o que o export sabe ao vivo, a decisão
 * do dono depois da aprovação manda: vídeo que saiu do artigo ("Não usar" ou
 * retirado) ou que virou Contexto/Sugestão de pauta não fica no plano como se
 * valesse; a versão aprovada não muda (é imutável), o CSV avisa.
 */
function videoDaSecao(payload: RadarArticleBlueprintPayload, id: string, aoVivo: readonly RadarArticleBlueprintLiveVideo[] | null): string {
  const retrato = payload.videos?.find(item => item.id === id);
  if (!retrato) return `- Vídeo da marca: ${id}`;
  const nome = `"${retrato.title}"`;
  const endereco = retrato.url ? ` (${retrato.url})` : "";
  if (!aoVivo) return `- Vídeo da marca: ${nome}${endereco}${retrato.usage ? ` · ${RADAR_VIDEO_USAGE_LABEL[retrato.usage]}` : ""}`;
  const casados = aoVivo.filter(item => mesmoVideo(retrato, item));
  if (!casados.length) {
    return `- Vídeo da marca: ${nome} — não está mais entre os vídeos deste artigo no Radar (marcado "Não usar" ou retirado depois da aprovação): não usar nesta seção`;
  }
  const modo = casados.find(item => item.usage)?.usage ?? null;
  if (modo === "CONTEXT" || modo === "TOPIC_SUGGESTION" || modo === "NOT_USED") {
    return `- Vídeo da marca: ${nome} — passou a ${RADAR_VIDEO_USAGE_LABEL[modo]} no Radar depois da aprovação: não é citável e não entra nesta seção`;
  }
  const url = casados.find(item => item.url)?.url ?? retrato.url;
  const rotulos = [...new Set(casados.map(item => item.sourcesColumnLabel).filter((item): item is string => Boolean(item)))];
  return [
    `- Vídeo da marca: ${nome}${url ? ` (${url})` : ""}`,
    ...(modo ? [` · ${RADAR_VIDEO_USAGE_LABEL[modo]}${modo !== retrato.usage ? " (modo atual no Radar)" : ""}`] : []),
    ...(rotulos.length ? [` · trecho na coluna de fontes: ${rotulos.join(", ")}`] : []),
  ].join("");
}

/**
 * 2026-10-02 · DE ONDE A SEÇÃO VEIO NA SERP. Só para versões com `from`
 * (as anteriores saem como antes). As evidências já têm linha própria; aqui vão
 * as seções M do esqueleto — ou o aviso de que a IA não apontou origem.
 *
 * 2026-10-07 · exportada (aditivo, §4) para a cadeia competitiva do CSV de
 * vídeo; o CSV para escrever e o Redator continuam iguais.
 */
export function origemDaSecao(payload: RadarArticleBlueprintPayload, secao: { from?: string[]; evidence: string[] }): string[] {
  if (!secao.from) return [];
  const doEsqueleto = new Map((payload.skeleton || []).map(item => [item.id, item]));
  const secoesM = secao.from.map(id => doEsqueleto.get(id)).filter((item): item is RadarArticleBlueprintSkeletonItem => Boolean(item));
  if (secoesM.length) return [`- Vem do esqueleto da SERP: ${secoesM.map(item => `${item.id} "${item.heading}"`).join("; ")}`];
  /* 2026-10-02 · D10 · o entregável não pede conferência: a seção sem origem na SERP é dita como proposta editorial. */
  if (!secao.from.length && !secao.evidence.length) return ["- Origem: proposta editorial do artigo (não vem de uma seção da SERP)"];
  return [];
}

/**
 * O ARTIGO-MODELO APROVADO VIRA AS COLUNAS DE ESTRUTURA DO CSV.
 *
 * Só as colunas que ele decide: título e SEO, promessa e leitor, estrutura, links
 * e plano visual. Identidade, SERP, fontes e veredito continuam como eram.
 *
 * 2026-10-02 · `aoVivo` é OPCIONAL (Adendo B): o que o export sabe agora dos
 * vídeos do artigo, para resolver o vídeo de cada seção contra o modo vigente.
 *
 * 2026-10-02 · Com `payload.approval === "DRAFT"` (a proposta da IA que o dono
 * ainda não aprovou), as mesmas colunas saem MARCADAS como proposta. Aprovada
 * ou sem estado informado, o texto é o de antes.
 */
export function radarArticleBlueprintColumns(
  payload: RadarArticleBlueprintPayload,
  aoVivo: readonly RadarArticleBlueprintLiveVideo[] | null = null,
  /** 2026-10-02 · Aditivo: a publicação deste artigo, para o prefixo provável dos destinos planejados. */
  publicacao: { slug: string | null; publishedUrl: string | null } | null = null,
  /** 2026-10-02 · Aditivo: em que lente da SERP cada domínio apareceu (`radarWritingDomainLenses`). */
  lentesDoDominio: ((dominio: string) => string | null) | null = null,
): {
  promessa_e_leitor: string;
  titulo_e_seo: string;
  estrutura: string;
  links_internos: string;
  plano_visual: string;
} {
  const b = payload.blueprint;
  const m = payload.measures;
  /*
   * 2026-10-02 · D10 (decisão do dono): O ENTREGÁVEL SAI CONCLUÍDO. CSV, Redator
   * e MCP não recebem "proposta", "aguardando aprovação" nem pendência: a
   * planta vai fechada (organizar corrige e fecha antes de gravar). Versão
   * antiga ainda em rascunho sai igual, sem marca; o que a conferência
   * registrou fica no painel do Radar.
   */
  const candidato = new Map(payload.linkCandidates.map(item => [item.id, item]));
  const fonte = new Map(payload.sources.map(item => [item.id, item]));
  const status = (item: RadarArticleBlueprintLinkCandidate) => item.status === "PUBLISHED" ? "publicado" : item.status === "PLANNED" ? "planejado: use o caminho, sem domínio, e não invente URL" : "não resolvido: marque a âncora e não invente URL";
  /* 2026-10-02 · versões gravadas antes guardam o rótulo com a moldura da promessa: limpa na leitura. */
  const rotuloDoDestino = (item: RadarArticleBlueprintLinkCandidate) => semMolduraDoTema(item.label);
  const prefixo = prefixoDaUrlPublicada(publicacao);
  const enderecoDoDestino = (item: RadarArticleBlueprintLinkCandidate): string => {
    if (!item.destination) return "";
    if (item.status === "PLANNED" && prefixo && item.destination.startsWith("/") && !item.destination.startsWith(`${prefixo}/`)) {
      /* 2026-10-02 · UM destino por link: o caminho com o prefixo do Silo; o slug do Arquiteto e a confirmação vão como pendência, à parte. */
      return ` → ${prefixo}${item.destination} (planejado: caminho do Silo, o mesmo prefixo da URL publicada deste artigo; slug do Arquiteto ${item.destination})`;
    }
    return ` → ${item.destination} (${status(item)})`;
  };
  const descartados = b.discarded ?? [];
  const doEsqueleto = new Map((payload.skeleton || []).map(item => [item.id, item]));

  const estrutura = [
    "ARTIGO-MODELO DA SERP (planta concluída do artigo; a redação é de quem escreve).",
    ...(payload.unit ? [`Tipo da unidade: ${payload.unit.label}${payload.unit.format ? ` · formato: ${payload.unit.format}` : ""}.`] : []),
    ...(payload.brandVoice ? [`Voz da marca usada no plano: Skill "${payload.brandVoice.name}" v${payload.brandVoice.version}.`] : []),
    `Medidas do plano: ${m.plan.sections} H2 · ${m.plan.h3} H3 · ~${m.plan.paragraphs} parágrafos · ${m.plan.bold} negritos · ${m.plan.images} imagens (capa + ${m.plan.respites} respiros) · ${m.plan.internalLinks} links internos · ${m.plan.externalLinks} links externos${m.plan.wordsMin && m.plan.wordsMax ? ` · ${m.plan.wordsMin}–${m.plan.wordsMax} palavras` : ""}.`,
    `Concorrentes comparáveis (${m.serp.comparablePages}): mediana de ${m.serp.words.median ?? "?"} palavras, ${m.serp.h2 ?? "?"} H2, ${m.serp.h3 ?? "?"} H3, ${m.serp.paragraphs ?? "?"} parágrafos, ${m.serp.images ?? "?"} imagens.`,
    /* 2026-10-02 · campo que veio vazio não deixa rótulo solto ("Keywords: ", "→  ()", "— "). */
    ...(b.keywordPlan.reading ? [`Keywords: ${b.keywordPlan.reading}`] : b.keywordPlan.complementary.length ? ["Keywords:"] : []),
    ...b.keywordPlan.complementary.map(item => `- ${item.keyword}${item.placement ? ` → ${item.placement}` : ""}${item.reason ? ` (${item.reason})` : ""}`),
    ...(b.keywordPlan.slugNote ? [`Slug × principal: ${b.keywordPlan.slugNote}`] : []),
    "",
    `Abertura: responder "${b.opening.readerQuestion}" no primeiro parágrafo${b.opening.direction ? ` — ${b.opening.direction}` : ""}${b.opening.evidence.length ? ` [${rotuloDaEvidencia(payload, b.opening.evidence).join("; ")}]` : ""}`,
    "",
    ...b.sections.flatMap((secao, indice) => [
      `## ${secao.h2}`,
      `- Pergunta do leitor: ${secao.readerQuestion}`,
      ...origemDaSecao(payload, secao),
      `- Abre respondendo: ${secao.answerFirst}`,
      ...secao.h3.map(h3 => `  ### ${h3}`),
      ...secao.explain.map(item => `- Explicar: ${item}`),
      `- ~${secao.paragraphs} parágrafo(s)${secao.bold.length ? ` · negrito em: ${secao.bold.join(", ")}` : ""}`,
      ...(secao.terms.length ? [`- Termos a nomear: ${secao.terms.join(" · ")}`] : []),
      ...(secao.evidence.length ? [`- Evidências: ${rotuloDaEvidencia(payload, secao.evidence, lentesDoDominio).join("; ")}`] : []),
      ...secao.internalLinks.map(link => { const destino = candidato.get(link.candidate); return `- Link interno: âncora "${link.anchor}" → ${destino ? rotuloDoDestino(destino) : link.candidate}`; }),
      ...secao.externalLinks.map(link => `- Link externo: ${link.claim} → ${link.source && fonte.get(link.source) ? fonte.get(link.source)!.url : `fonte a obter${link.sourceType ? ` (${link.sourceType})` : ""}`}`),
      ...(secao.specialist ? [`- Especialista: usar ${secao.specialist}`] : []),
      ...(secao.video ? [videoDaSecao(payload, secao.video, aoVivo)] : []),
      ...(secao.image ? [`- Imagem: ${secao.image}`] : []),
      ...(secao.practical ? [`- Entrega prática: ${secao.practical}`] : []),
      ...(indice < b.sections.length - 1 ? [""] : []),
    ]),
    ...(descartados.length
      ? ["", `Descartado do esqueleto da SERP: ${descartados.map(item => `${item.id}${doEsqueleto.get(item.id) ? ` "${doEsqueleto.get(item.id)!.heading}"` : ""}${item.reason ? ` (${item.reason})` : ""}`).join("; ")}.`]
      : []),
    "",
    `Fechamento: ${b.closing.turn}${b.closing.specialist ? ` (voz do especialista ${b.closing.specialist})` : ""}`,
    `CTA: ${b.closing.cta}`,
    ...(b.closing.nextStep ? [`Próximo passo: ${b.closing.nextStep}`] : []),
    ...(b.eeat.length ? ["", `E-E-A-T: ${b.eeat.join(" · ")}`] : []),
  ].join("\n");

  const links = b.sections.flatMap(secao => secao.internalLinks.map(link => ({ secao: secao.h2, link })));
  const linksInternos = links.length
    ? [
      `Aplique somente estes ${links.length} link(s), com a âncora indicada (pode ajustar concordância):`,
      ...links.map(({ secao, link }, indice) => {
        const destino = candidato.get(link.candidate);
        return `L${indice + 1} · âncora "${link.anchor}" → ${destino ? `${destino.role} "${rotuloDoDestino(destino)}"${enderecoDoDestino(destino) || ` (${status(destino)})`}` : link.candidate} · onde: seção "${secao}"${link.reason ? ` · por quê: ${link.reason}` : ""}`;
      }),
    ].join("\n")
    : "Nenhum link interno no artigo-modelo.";

  return {
    promessa_e_leitor: ([`Leitor: ${b.reader}`, `Promessa: ${b.promise}`, `Ângulo: ${b.angle.statement}${b.angle.evidence.length ? ` [${rotuloDaEvidencia(payload, b.angle.evidence).join("; ")}]` : ""}`].join("\n")),
    titulo_e_seo: ([
      `H1: ${b.title.h1}`,
      ...(b.title.alternatives.length ? [`Alternativas: ${b.title.alternatives.join(" · ")}`] : []),
      `SEO title: ${b.title.seoTitle}`,
      `Meta description: ${b.title.metaDescription}`,
      `Keyword principal em: ${b.keywordPlan.principalPlacement.join(", ") || "H1 e primeiro parágrafo"}`,
    ].join("\n")),
    estrutura,
    links_internos: (linksInternos),
    plano_visual: ([
      `Plano visual: ${b.visual.length} imagem(ns).`,
      ...b.visual.map(item => [
        `${item.slot === "CAPA" ? "Capa" : `Respiro ${item.slot.slice(1)}`}${item.section ? ` · seção "${item.section}"` : ""}${item.concept ? ` · ${item.concept}` : ""}`,
        `  Prompt: ${item.prompt}`,
        ...(/\b\d{1,2}\s*:\s*\d{1,2}\b/.test(item.prompt) ? [] : [`  Proporção: ${item.slot === "CAPA" ? "16:9" : "4:3"} (referência; ajuste ao layout do site e à voz da marca)`]),
        ...(item.alt ? [`  ALT: ${item.alt}`] : []),
        ...(item.caption ? [`  Legenda: ${item.caption}`] : []),
      ].join("\n")),
    ].join("\n")),
  };
}
