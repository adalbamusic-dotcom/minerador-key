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
import { radarUbiquitousStems } from "./intent-adherence.ts";
import { radarOutOfScopeMatcher } from "./out-of-scope.ts";
import {
  radarWritingCleanUrl,
  radarWritingCompareKey,
  radarWritingCompetitorTopicsOf,
  RADAR_WRITING_FUNCTION_WORDS,
  radarWritingDecodeEntities,
  radarWritingProjections,
  radarWritingRhetoricalQuestion,
  radarWritingSourceMark,
  radarWritingSpecialistContributions,
  radarWritingUnsupportedClaims,
  type RadarWritingPublication,
} from "./portable-writing-export.ts";
import { radarPendingClaims, radarSentenceNeedsSource, type RadarPendingClaim } from "./pending-claims.ts";
import { RADAR_SILO_ROLE_ASKS, radarSiloRoleIsPillar, radarSiloRoleIsSupport, radarSiloRoleText } from "./silo-role.ts";

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
 * ===== 2026-10-08 · AS REGRAS DA RODADA DOS ENTREGÁVEIS (versão das regras) =====
 *
 * A revisão dos CSVs reais de 08/10 achou o que a planta deixava passar. Tudo
 * aditivo; o payload antigo continua válido e o export protege os antigos:
 *
 *   - B1 · a IA vê a página publicada (H1 e H2 atuais) e devolve o mapa da
 *     atualização (`publishedMap`: cada H2 atual → seção da planta ou sai, com
 *     motivo); o que a página já cobre e a amostra não cobre fica na planta;
 *   - B2 · a abertura e a 1ª seção respondem à busca; a tese vem depois;
 *   - B3 · toda afirmação absoluta de cada seção vira nota, e a régua por
 *     sentido (`radarSentenceNeedsSource`) aponta efeito comercial,
 *     comportamento do público e plataforma sem fonte;
 *   - B4 · nomes atuais de produtos ("Perfil da Empresa no Google"), também na
 *     leitura do artigo-modelo antigo;
 *   - B5 · capa e respiros não repetem sujeito e objeto;
 *   - B6 · o ângulo é a entrega concreta que a amostra não tem;
 *   - B7 · `rulesVersion` no payload: a tela avisa a planta montada antes;
 *   - B8 · os parágrafos do plano saem da faixa de palavras, não da soma.
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
  /** 2026-10-08 · B1 · os H2 da página publicada que vão à IA (e ao mapa da atualização). */
  publishedH2: 20,
});

/**
 * 2026-10-08 · B7 · A VERSÃO DAS REGRAS COM QUE A PLANTA FOI MONTADA.
 *
 * Gravada no payload (`rulesVersion`). A tela do Radar avisa quando a versão
 * mostrada foi montada antes das regras atuais e aponta o "Organizar de novo"
 * que já existe. Mudou a regra do pedido ou da conferência? Mude a data.
 */
export const RADAR_ARTICLE_BLUEPRINT_RULES_VERSION = "2026-10-08";

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

/*
 * 2026-10-08 · B1 · A SEÇÃO DA PLANTA QUE ABSORVE UM H2 ATUAL. Número (1 = a
 * primeira) ou null (sai da página). As formas que a IA usa têm leitura única:
 * "2", "Seção 2" e 2.4 são a 2; null, "null", "sai", "remover", "" e "-" são
 * null. O que não tem número nenhum — inclusive o campo ausente — vira 0:
 * índice inválido, que a conferência casa pelo título (sair pede null dito).
 */
const secaoDoMapaIa = z.unknown().optional().transform((valor): number | null => {
  if (valor === undefined) return 0;
  if (valor === null) return null;
  if (typeof valor === "number") return Number.isFinite(valor) ? Math.round(valor) : 0;
  if (typeof valor !== "string") return 0;
  const lido = valor.trim();
  if (/^(?:null|nenhuma?|sai|sair|remov\w*|descart\w*|exclu\w*|-|—)?$/i.test(lido)) return null;
  const numero = lido.match(/\d+/);
  return numero ? Number(numero[0]) : 0;
});
/** 2026-10-08 · B1 · `origin` não vem da IA: a conferência diz se a seção foi decisão dela ("ai") ou casada pelo título ("match"). */
const MapaPublicadoIaSchema = z.object({
  current: textoIa(L.shortChars),
  section: secaoDoMapaIa,
  reason: textoOuVazioIa(L.shortChars),
  origin: z.enum(["ai", "match"]).optional().catch(undefined),
});

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
  /**
   * 2026-10-08 · B1 · O MAPA DA ATUALIZAÇÃO: para cada H2 da página publicada,
   * a seção da planta que o absorve (1 = a primeira) ou null (sai), com o
   * motivo. Ausente em versões antigas e quando o artigo não está publicado ou
   * a página não foi lida. Item sem forma sai sozinho.
   */
  publishedMap: z.preprocess(valor => (valor === undefined ? undefined : comoLista(valor)), z.array(z.unknown()).optional())
    .transform(itens => (itens
      ? itens.flatMap(item => {
        const lido = MapaPublicadoIaSchema.safeParse(item);
        return lido.success ? [lido.data] : [];
      }).slice(0, L.publishedH2 + 5)
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
  /**
   * 2026-10-08 · B1 · Aditivo: a estrutura ATUAL da página publicada (H1 e H2),
   * lida na geração pelo MESMO leitor do export. Ausente quando o artigo não
   * está publicado ou a página não foi lida (falha, tempo): a planta sai como
   * antes. FAQ legado não entra (AGENTS §13: só sai com decisão humana).
   */
  publishedStructure?: RadarArticleBlueprintPublishedStructure | null;
};

/** 2026-10-08 · B1 · A estrutura da página publicada que a IA viu: H1 e H2 atuais. */
export type RadarArticleBlueprintPublishedStructure = { h1: string | null; h2: string[] };

/**
 * 2026-10-08 · B1 · A ESTRUTURA PUBLICADA QUE VAI À IA: só de artigo publicado
 * com URL, sem FAQ legado, sem repetição e com teto. `null` = nada a ler.
 */
export function radarArticleBlueprintPublishedStructureOf(publicacao: RadarWritingPublication | null): RadarArticleBlueprintPublishedStructure | null {
  const atual = publicacao?.currentStructure;
  if (!publicacao?.published || !t(publicacao.publishedUrl) || !atual) return null;
  const vistos = new Set<string>();
  const h2 = (atual.h2 || []).map(item => corte(limpo(item), L.shortChars)).filter(item => {
    const chave = radarWritingCompareKey(item);
    if (!chave || vistos.has(chave) || EH_FAQ.test(item) || UUID.test(item)) return false;
    vistos.add(chave);
    return true;
  }).slice(0, L.publishedH2);
  const h1 = limpo(atual.h1) ? corte(limpo(atual.h1), L.shortChars) : null;
  return h1 || h2.length ? { h1, h2 } : null;
}

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

  /*
   * 2026-10-08 · O PAPEL NO SILO DO BRIEF É O DO ARQUITETO.
   *
   * A mesma regra do CSV "Para escrever": o papel do artigo no plano por Silo
   * (SiloDNA vigente) e, sem ele, o papel que o export resolveu pela régua
   * única. O Pilar recebia "support" (foto do envio) ou "Suporte" (formação), e
   * a IA montava planta de Suporte para ele.
   */
  const membroDoArtigo = (input.silo?.members || []).find(item => item.articleId === input.articleId) || null;
  const papelDoPlano = radarSiloRoleText(membroDoArtigo?.role);
  const papelDoArtigo = papelDoPlano && (radarSiloRoleIsPillar(papelDoPlano) || radarSiloRoleIsSupport(papelDoPlano) || papelDoPlano === "Reforço narrativo")
    ? papelDoPlano
    : radarSiloRoleText(t(p.dna.siloRole)) || null;
  /* O próprio artigo nunca é destino de link dele mesmo — nem pelo id, nem pelo slug. */
  const slugProprio = radarWritingCompareKey(t(input.publication?.slug) || t(entrada.article.slug));
  const ehOProprio = (membro: { articleId: string; slug: string | null }) =>
    membro.articleId === input.articleId || Boolean(slugProprio && membro.slug && radarWritingCompareKey(membro.slug) === slugProprio);

  /* Os destinos possíveis dos links: o Silo inteiro, a SiloPage e o que o grafo aprovado pede. */
  const linkCandidates: RadarArticleBlueprintLinkCandidate[] = [];
  const doGrafo = new Set(p.linksDoPlano.map(link => radarWritingCompareKey(link.targetTitle)));
  /* 2026-10-08 · o destino do grafo aprovado, por identidade (nó `article:<articleId>`), antes do texto. */
  const noDoGrafo = new Set(p.linksDoPlano.map(link => link.targetNodeId).filter((no): no is string => Boolean(no)));
  for (const membro of (input.silo?.members || []).filter(item => !ehOProprio(item))) {
    const rotulo = semMolduraDoTema(t(membro.principalKeyword) || t(membro.title) || t(membro.slug));
    if (!rotulo) continue;
    linkCandidates.push({
      id: `K${linkCandidates.length + 1}`,
      label: rotulo,
      role: membro.role,
      destination: membro.slug ? `/${membro.slug}` : null,
      status: membro.slug ? "PLANNED" : "UNRESOLVED",
      fromGraph: noDoGrafo.has(`article:${membro.articleId}`) || doGrafo.has(radarWritingCompareKey(rotulo)) || doGrafo.has(radarWritingCompareKey(membro.title)),
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
  const estruturaPublicada = radarArticleBlueprintPublishedStructureOf(publicacao);
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
      siloRole: papelDoArtigo,
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
    /* 2026-10-08 · B1 · a página publicada, quando a geração a leu; sem ela, a chave não existe e o pedido é o de antes. */
    ...(estruturaPublicada ? { publishedStructure: estruturaPublicada } : {}),
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
    /* 2026-10-08 · B2: a abertura e a 1ª seção respondem à busca; a tese da marca vem depois. */
    "8. Abertura: a dúvida real do leitor sobre a keyword principal (nunca pergunta retórica de concorrente nem pergunta de outro assunto); outro canal ou assunto vizinho entra depois, numa seção. A abertura e a 1ª seção respondem à intenção da keyword principal: quando ela é 'como …', a 1ª seção já é prática (o caminho, o primeiro passo); a tese ou o contraponto da marca vem depois, sem negar o assunto do artigo. A evidência da abertura responde à mesma pergunta. Fechamento e CTA na voz do especialista (id E) quando houver, levando ao próximo passo no Silo.",
    /* 2026-10-08 · B5: o plano visual segue a voz e não repete a cena. */
    "9. Plano visual: exatamente uma CAPA e 2 ou 3 respiros (R1, R2, R3), cada respiro ligado a uma seção, com prompt de imagem de até 400 caracteres, ALT e legenda. O prompt termina com a proporção (capa 16:9, respiro 4:3, salvo outra indicação da voz da marca). Sem marca de terceiros, sem antes/depois. Sem texto legível na imagem: se ela precisa mostrar interface (perfil, enquete, botão), peça elementos genéricos sem texto legível; diagrama, funil ou comparação com rótulos vira ilustração em SVG (diga no conceito). Nunca tela fictícia de resultado (ranking, métricas, avaliações) como se fosse prova. Cada imagem tem cena diferente: não repita a mesma pessoa na mesma situação, nem o mesmo sujeito com o mesmo objeto em duas imagens (ex.: profissional com celular na capa e num respiro). O que a voz da marca manda evitar nas imagens não entra em prompt nenhum.",
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
    /* 2026-10-08 · B3: a regra fala do SENTIDO (efeito comercial, comportamento, plataforma) e da polaridade, como a régua `radarSentenceNeedsSource`. */
    "17. AFIRMAÇÕES: answerFirst e explain não transformam a dificuldade do leitor em regra universal ('foi desenhado para', 'nunca', 'sempre', 'raramente', 'pacientes prontos para comprar') sem evidência citada. Afirmar como fato um efeito comercial ('converte', 'canais que convertem', 'gera agendamentos', 'traz pacientes', 'enche a agenda'), o comportamento do público ('pacientes procuram no Google, não no Instagram') ou o funcionamento de plataforma ou algoritmo pede fonte X do pacote; sem ela, escreva de forma delimitada (orientação, possibilidade, experiência da marca) e registre a afirmação em externalLinks com source = null. A tese da marca que NEGA um efeito ('o Instagram, sozinho, não enche a agenda') pode ser dita. Não prescreva gratuidade, urgência, oferta exclusiva, condição especial, depoimento nem antes/depois como receita: só se a voz da marca e o pacote sustentarem.",
    "19. UMA ENTREGA POR SEÇÃO: cada seção entrega algo diferente ao leitor (diagnóstico, ajuste, conteúdo, próximo passo, alternativa…); duas seções não tratam do mesmo assunto com nomes diferentes ('como usar de forma estratégica' e 'estratégias práticas' são a mesma). O conteúdo prático chega cedo, logo depois do diagnóstico.",
    "20. DEMONSTRAÇÃO E PREMISSA: em seção que ensina a fazer, practical descreve a demonstração (ex.: um exemplo ilustrativo antes → o ajuste → depois), nunca uma cena decorativa. A promessa e o ângulo dizem o que o leitor aprende, sem regra universal: eles viram a premissa do vídeo, dos cortes e do carrossel.",
    "18. ORIGEM: cada id em from trata do assunto da seção. Não use a mesma seção M em seções de assuntos diferentes; seção comercial da marca (oferta, transição) vem da voz da marca e da evidência que a sustenta, sem fingir que veio de uma seção M.",
    /* 2026-10-08 · B1: a regra da página publicada só entra quando a geração leu a página (sem ela, o pedido é o de antes). */
    ...(brief.publishedStructure?.h2.length
      ? ["21. PÁGINA PUBLICADA (é atualização): a planta atualiza a página atual (H1 e H2 em '# Página publicada atual'). O que a página já cobre dentro do escopo e a amostra NÃO cobre é diferencial dela: fica na planta, numa seção ou num H3 (pode renomear e reordenar). Devolva publishedMap com TODOS os H2 atuais: { current: o H2 atual como está, section: o número da seção da planta que o absorve (1 = a primeira), reason }. section = null só quando o H2 sai da página (fora do escopo, repetido ou superado), com o motivo em reason."]
      : []),
    /* 2026-10-08 · B4 e B6: nomes atuais; o ângulo é a entrega concreta que a amostra não tem. */
    "22. NOMES ATUAIS: use o nome atual de produto e recurso ('Perfil da Empresa no Google', nunca 'Google Meu Negócio' nem 'Google My Business'), salvo quando o nome antigo faz parte da keyword.",
    "23. ÂNGULO E DIFERENCIAL: o ângulo diz a ENTREGA concreta que a amostra não tem (um exemplo comentado, um checklist de diagnóstico, uma comparação lado a lado…), nunca 'costurar dois temas que a maioria já cobre'. Em angle.evidence, cite só a evidência que sustenta esse diferencial (lacuna G, diferencial D, oportunidade O); não cite resultado orgânico só para preencher.",
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
    /* 2026-10-08 · o que o papel pede vai junto: o Pilar distribui para os Suportes; o Suporte devolve ao Pilar. */
    `Papel no Silo: ${a.siloRole || "não declarado"}${a.siloRole && RADAR_SILO_ROLE_ASKS[radarSiloRoleText(a.siloRole) || ""] ? ` — ${RADAR_SILO_ROLE_ASKS[radarSiloRoleText(a.siloRole) || ""]}` : ""}`,
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
    /* 2026-10-08 · B1 · a estrutura ATUAL da página publicada, lida na geração: a planta é a atualização dela. */
    ...(brief.publishedStructure
      ? [
        "# Página publicada atual (a planta é a atualização dela; devolva publishedMap com todos os H2 atuais)",
        `H1 atual: ${brief.publishedStructure.h1 || "sem H1 legível"}`,
        ...(brief.publishedStructure.h2.length
          ? brief.publishedStructure.h2.map((item, indice) => `H2 atual ${indice + 1}: ${item}`)
          : ["Nenhum H2 legível na página publicada."]),
        "",
      ]
      : []),
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
      /* 2026-10-08 · B1 · só quando a página publicada foi lida. */
      ...(brief.publishedStructure?.h2.length ? { publishedMap: [{ current: "H2 atual, como está", section: 1, reason: "" }] } : {}),
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
        /* 2026-10-08 · e o que a rodada dos entregáveis passou a conferir: 1ª seção, cena repetida, ângulo, mapa da página publicada. */
        "A planta abaixo foi conferida contra o pacote e tem estas pendências. Devolva a planta INTEIRA, no mesmo formato, já corrigida: troque a origem que não trata do assunto da seção, delimite ou sustente as afirmações absolutas, junte ou diferencie seções repetidas, faça a abertura responder à keyword principal. Também: a 1ª seção responde à busca (a tese vem depois), cada imagem tem cena própria, o ângulo diz a entrega concreta, e o publishedMap cobre cada H2 atual. Não deixe nada para revisar depois.",
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
    plan: {
      sections: number; h3: number; paragraphs: number; bold: number; images: number; respites: number; internalLinks: number; externalLinks: number; wordsMin: number | null; wordsMax: number | null;
      /**
       * 2026-10-08 · B8 · Aditivos: a faixa de parágrafos que a faixa de palavras
       * pede, pelas palavras por parágrafo dos concorrentes. `paragraphs` (a soma
       * do que a IA pôs por seção) continua, para quem já o lê. Ausentes em
       * versões antigas e quando a SERP não mediu palavras e parágrafos.
       */
      paragraphsMin?: number | null;
      paragraphsMax?: number | null;
      wordsPerParagraph?: number | null;
    };
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
   * 2026-10-08 · B1 · Aditivo: a estrutura publicada que a IA viu ao montar a
   * planta (o mapa `blueprint.publishedMap` fala destes H2). Ausente em versões
   * antigas e quando a página não foi lida.
   */
  publishedStructure?: RadarArticleBlueprintPublishedStructure | null;
  /** 2026-10-08 · B7 · Aditivo: a versão das regras com que a planta foi montada (`RADAR_ARTICLE_BLUEPRINT_RULES_VERSION`). Ausente = anterior. */
  rulesVersion?: string;
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

/* ============================== 2026-10-08 · os ajudantes da rodada ============================== */

/** 2026-10-08 · B8 · "1 link externo", "2 links externos": a contagem concorda com o número. */
const contagem = (numero: number, um: string, varios: string) => `${numero} ${numero === 1 ? um : varios}`;

/*
 * 2026-10-08 · B4 · OS NOMES ATUAIS DE PRODUTOS.
 *
 * O CSV real de 08/10 mandava escrever "Google Meu Negócio": o produto se chama
 * "Perfil da Empresa no Google". A troca é determinística — na conferência
 * (planta nova) e na leitura do artigo-modelo para o export e o Redator (planta
 * antiga). Fica como está: a keyword que traz o nome antigo (é o que o leitor
 * busca e o H1 precisa dela), a menção explícita ao nome anterior ("antigo
 * Google Meu Negócio") e o que não é texto da planta (keyword, H2 atual da
 * página publicada, ids).
 */
const ANTES_DO_NOME_ANTIGO = "(?<!\\b(?:antigo|antiga|antes|ex|chamado|chamada|conhecido como|conhecida como)[\\s-])";
const NOMES_ANTIGOS: ReadonlyArray<{ chave: string; padrao: RegExp; atual: string }> = [
  { chave: "google meu negocio", padrao: new RegExp(`${ANTES_DO_NOME_ANTIGO}\\bGoogle\\s+Meu\\s+Neg[oó]cio\\b`, "gi"), atual: "Perfil da Empresa no Google" },
  { chave: "google my business", padrao: new RegExp(`${ANTES_DO_NOME_ANTIGO}\\bGoogle\\s+My\\s+Business\\b`, "gi"), atual: "Perfil da Empresa no Google" },
];

/** O texto com os nomes atuais. `manter`: as keywords do artigo — a que traz o nome antigo o preserva. */
export function radarCurrentProductNames(texto: string, manter: readonly string[] = []): string {
  if (!texto) return texto;
  const chaves = manter.map(radarWritingCompareKey).filter(Boolean);
  let saida = texto;
  for (const nome of NOMES_ANTIGOS) {
    if (chaves.some(chave => chave.includes(nome.chave))) continue;
    saida = saida.replace(nome.padrao, nome.atual);
  }
  return saida;
}

/* O que não é texto da planta: a keyword (do Minerador), o H2 atual da página (identidade para o mapa) e os ids. */
const CHAVES_SEM_TROCA = new Set(["keyword", "current", "candidate", "source", "id", "slot", "specialist", "video", "image", "evidence", "from", "origin"]);
function comNomesAtuais(valor: unknown, trocar: (texto: string) => string, chave = ""): unknown {
  if (CHAVES_SEM_TROCA.has(chave)) return valor;
  if (typeof valor === "string") return trocar(valor);
  if (Array.isArray(valor)) return valor.map(item => comNomesAtuais(item, trocar, chave));
  if (valor && typeof valor === "object") return Object.fromEntries(Object.entries(valor).map(([nome, item]) => [nome, comNomesAtuais(item, trocar, nome)]));
  return valor;
}

/**
 * 2026-10-08 · B4 · A planta com os nomes atuais — para a conferência e para a
 * leitura do artigo-modelo antigo (export e Redator). Sem troca, devolve o
 * MESMO objeto. `manter`: as keywords do artigo (as complementares da planta
 * entram sozinhas). Só `blueprint` muda: evidência, fonte e destino são do
 * pacote e ficam como vieram.
 */
export function radarArticleBlueprintWithCurrentNames<P extends Pick<RadarArticleBlueprintPayload, "blueprint">>(payload: P, manter: readonly string[] = []): P {
  const b = payload?.blueprint;
  if (!b || typeof b !== "object") return payload;
  const chaves = [...manter, ...(b.keywordPlan?.complementary || []).map(item => t(item?.keyword))];
  let mudou = false;
  const trocar = (texto: string) => {
    const novo = radarCurrentProductNames(texto, chaves);
    if (novo !== texto) mudou = true;
    return novo;
  };
  const blueprint = comNomesAtuais(b, trocar) as RadarArticleBlueprintAi;
  return mudou ? { ...payload, blueprint } : payload;
}

/**
 * 2026-10-08 · B8 · OS PARÁGRAFOS DO PLANO SAEM DA FAIXA DE PALAVRAS.
 *
 * "~15 parágrafos · 2141–4228 palavras" (CSV real de 08/10) pedia parágrafos
 * de 140 a 280 palavras, com os concorrentes em mediana de 73 parágrafos. A soma
 * do que a IA põe por seção não é medida: as palavras por parágrafo vêm dos
 * concorrentes (mediana de palavras ÷ mediana de parágrafos), a faixa de
 * parágrafos sai da faixa de palavras, e cada seção recebe a sua parte pelo
 * peso que a IA lhe deu. Sem palavras e parágrafos medidos (ou com uma razão
 * fora do plausível), nada é derivado e quem lê diz "~N por seção", sem somar.
 */
export type RadarArticleBlueprintParagraphPlan = { min: number; max: number; wordsPerParagraph: number; perSection: number[] };

export function radarArticleBlueprintParagraphPlan(
  medidas: { serp: RadarArticleBlueprintMeasures; plan: { wordsMin: number | null; wordsMax: number | null } },
  pesos: readonly number[],
): RadarArticleBlueprintParagraphPlan | null {
  const palavras = medidas.serp?.words?.median;
  const paragrafos = medidas.serp?.paragraphs;
  const { wordsMin, wordsMax } = medidas.plan || { wordsMin: null, wordsMax: null };
  if (!palavras || !paragrafos || paragrafos <= 0 || !wordsMin || !wordsMax) return null;
  const porParagrafo = Math.round(palavras / paragrafos);
  if (porParagrafo < 15 || porParagrafo > 200) return null;
  const min = Math.max(Math.max(1, pesos.length), Math.round(wordsMin / porParagrafo));
  const max = Math.max(min, Math.round(wordsMax / porParagrafo));
  const validos = pesos.map(peso => (Number.isFinite(peso) && peso > 0 ? peso : 1));
  const total = validos.reduce((soma, peso) => soma + peso, 0) || 1;
  const meio = Math.round((min + max) / 2);
  return { min, max, wordsPerParagraph: porParagrafo, perSection: validos.map(peso => Math.max(1, Math.round((meio * peso) / total))) };
}

/*
 * 2026-10-08 · B1 · O CASAMENTO DE TÍTULOS (mapa da página publicada).
 *
 * Um H2 atual casa com a seção da planta que divide com ele as palavras que o
 * distinguem — sem a keyword e as palavras de função — em metade ou mais das
 * dele (ou em duas). O radical não é uniforme ("otimizar" × "otimize"): mesma
 * raiz com seis letras iguais no começo, ou uma começando pela outra (5+).
 */
const prefixoComum = (a: string, b: string) => {
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i += 1;
  return i;
};
const mesmaRaizDoTitulo = (a: string, b: string) => a === b || prefixoComum(a, b) >= 6 || (Math.min(a.length, b.length) >= 5 && (a.startsWith(b) || b.startsWith(a)));
const raizesQueDistinguem = (texto: string, comuns: ReadonlySet<string>) => radarSemanticStems(texto).filter(raiz => !comuns.has(raiz) && !RADAR_WRITING_FUNCTION_WORDS.has(raiz));

/** O índice (0-based) do candidato que melhor casa com o título, ou -1. */
function casarTitulo(titulo: string, candidatos: readonly string[], comuns: ReadonlySet<string>): number {
  const daqui = raizesQueDistinguem(titulo, comuns);
  if (!daqui.length) return -1;
  let melhor = -1;
  let melhorNota = 0;
  candidatos.forEach((candidato, indice) => {
    if (!candidato) return;
    const dali = raizesQueDistinguem(candidato, comuns);
    const divididas = daqui.filter(raiz => dali.some(outra => mesmaRaizDoTitulo(raiz, outra))).length;
    const nota = divididas / daqui.length;
    if (divididas && (divididas >= 2 || nota >= 0.5) && nota > melhorNota) {
      melhor = indice;
      melhorNota = nota;
    }
  });
  return melhor;
}

/* "Conclusão", "Considerações finais": o assunto é o fechamento da planta, não uma seção. */
const EH_FECHAMENTO = /^(?:conclusao|consideracoes finais|para finalizar|finalizando|em resumo|resumo final|resumindo)\b/;

/** 2026-10-08 · B1 · Um item do mapa da atualização, como a planta o guarda. */
export type RadarArticleBlueprintPublishedMapEntry = NonNullable<RadarArticleBlueprintAi["publishedMap"]>[number];

/**
 * 2026-10-08 · B1 · O MAPA DA ATUALIZAÇÃO, LIDO — para o CSV para escrever, o
 * Redator e a tela. Vale para planta nova (com `publishedMap`) e antiga (sem
 * ele: casamento de títulos), sempre conservador: nada sai sem decisão.
 *
 *   - ABSORBED: o H2 atual vira (ou entra em) a seção `section` da planta;
 *   - CLOSING: "Conclusão" e afins vão para o fechamento da planta;
 *   - REMOVED: a planta decidiu tirá-lo, com o motivo (decisão registrada na
 *     versão concluída do artigo-modelo);
 *   - KEEP: sem par e sem decisão — fica como seção própria, reescrita na voz,
 *     depois da seção `after` (0 = logo depois da abertura).
 *
 * `atuais`: os H2 lidos agora da página (o export os lê); sem eles, os que a IA
 * viu (`payload.publishedStructure`). FAQ legado não entra: ele fica como está
 * (AGENTS §13), e o export já diz isso. `keywords`: as do artigo, que não
 * distinguem um título do outro.
 */
export type RadarArticleBlueprintPublishedMapReading = {
  current: string;
  kind: "ABSORBED" | "CLOSING" | "REMOVED" | "KEEP";
  /** 1 = a primeira seção da planta (ABSORBED); null nos outros. */
  section: number | null;
  sectionH2: string | null;
  /** KEEP: depois de qual seção fica (0 = logo depois da abertura); null nos outros. */
  after: number | null;
  reason: string;
  /** "ai" = decisão da planta; "match" = casado pelo título (planta antiga ou mapa incompleto). */
  origin: "ai" | "match";
};

export function radarArticleBlueprintPublishedMapReading(
  payload: Pick<RadarArticleBlueprintPayload, "blueprint"> & { publishedStructure?: RadarArticleBlueprintPublishedStructure | null },
  atuais: readonly string[] | null = null,
  opcoes: { keywords?: readonly string[] } = {},
): RadarArticleBlueprintPublishedMapReading[] {
  const vistos = new Set<string>();
  const h2 = (atuais ?? payload.publishedStructure?.h2 ?? []).map(item => limpo(item)).filter(item => {
    const chave = radarWritingCompareKey(item);
    if (!chave || vistos.has(chave) || EH_FAQ.test(item)) return false;
    vistos.add(chave);
    return true;
  });
  if (!h2.length) return [];
  const secoes = payload.blueprint?.sections || [];
  const titulos = secoes.map(secao => [secao.h2, secao.readerQuestion, ...(secao.h3 || [])].join(" "));
  /*
   * 2026-10-08 (correção da revisão) · só a PRINCIPAL (a primeira keyword) não
   * distingue um título do outro. As raízes da complementar contavam como
   * comuns, e no caso real NENHUM dos 9 H2 publicados casava: o H2 "Instagram
   * não traz pacientes quando…" ficava de pé ao lado da seção 2, cujo H2 é essa
   * complementar. E a complementar que a planta põe numa seção ("H2 da seção
   * 2") leva para ela o H2 publicado que a contém.
   */
  const comuns = new Set([
    ...radarSemanticStems((opcoes.keywords || []).slice(0, 1).join(" ")),
    ...radarUbiquitousStems(secoes.map(secao => `${secao.h2} ${secao.readerQuestion}`), 0.5, 3),
  ]);
  const complementares = (payload.blueprint?.keywordPlan?.complementary || []).map(item => ({
    chave: radarWritingCompareKey(t(item.keyword)),
    secao: Number((/\bse[cç][aã]o\s+(\d+)/i.exec(t(item.placement)) || [])[1] || 0),
  })).filter(item => item.chave && item.secao >= 1 && item.secao <= secoes.length);
  const daComplementar = (chave: string) => complementares.find(item => chave.includes(item.chave))?.secao ?? 0;
  const mapa = payload.blueprint?.publishedMap || [];
  const usados = new Set<number>();
  const saida: RadarArticleBlueprintPublishedMapReading[] = [];
  for (const atual of h2) {
    const chave = radarWritingCompareKey(atual);
    let indice = mapa.findIndex((item, i) => !usados.has(i) && radarWritingCompareKey(item.current) === chave);
    if (indice < 0) indice = casarTitulo(atual, mapa.map((item, i) => (usados.has(i) ? "" : item.current)), new Set());
    const item = indice >= 0 ? mapa[indice] : null;
    if (item) usados.add(indice);
    const decidido = item && item.origin !== "match";
    if (decidido && typeof item.section === "number" && item.section >= 1 && item.section <= secoes.length) {
      saida.push({ current: atual, kind: "ABSORBED", section: item.section, sectionH2: secoes[item.section - 1].h2, after: null, reason: t(item.reason), origin: "ai" });
      continue;
    }
    if (decidido && item.section === null && t(item.reason)) {
      saida.push({ current: atual, kind: "REMOVED", section: null, sectionH2: null, after: null, reason: t(item.reason), origin: "ai" });
      continue;
    }
    /* Casado pela conferência, ou sem decisão: o título decide; sem par, fica. */
    const guardada = item && item.origin === "match" && typeof item.section === "number" && item.section >= 1 && item.section <= secoes.length ? item.section - 1 : -1;
    const casada = guardada >= 0 ? guardada : daComplementar(chave) ? daComplementar(chave) - 1 : casarTitulo(atual, titulos, comuns);
    if (casada >= 0) {
      saida.push({ current: atual, kind: "ABSORBED", section: casada + 1, sectionH2: secoes[casada].h2, after: null, reason: "", origin: "match" });
    } else if (EH_FECHAMENTO.test(chave)) {
      saida.push({ current: atual, kind: "CLOSING", section: null, sectionH2: null, after: null, reason: "", origin: "match" });
    } else {
      saida.push({ current: atual, kind: "KEEP", section: null, sectionH2: null, after: 0, reason: "", origin: "match" });
    }
  }
  /*
   * 2026-10-08 (correção da revisão) · ONDE FICA O QUE NÃO CASOU. Depois da
   * última seção absorvida antes dele na página; sem nenhuma antes, antes da
   * próxima absorvida (nunca antes da seção 1: a 1ª seção responde à busca,
   * B2); sem nenhuma absorvida, depois da última seção da planta, antes do
   * fechamento. "Logo depois da abertura" (after 0) só sobra para planta sem
   * seção.
   */
  return saida.map((item, posicao) => {
    if (item.kind !== "KEEP") return item;
    const antes = saida.slice(0, posicao).reverse().find(outro => outro.kind === "ABSORBED")?.section;
    const depois = saida.slice(posicao + 1).find(outro => outro.kind === "ABSORBED")?.section;
    const after = antes ?? (depois ? Math.max(1, depois - 1) : secoes.length);
    return { ...item, after: Math.min(after, secoes.length) };
  });
}

/**
 * 2026-10-08 · B1 · O destino de um H2 atual, numa frase concluída (sem
 * pendência): a tela do Radar a usa; o CSV para escrever e o Redator podem
 * usar a mesma ou dizer à sua maneira.
 */
export function radarArticleBlueprintPublishedMapLine(item: RadarArticleBlueprintPublishedMapReading): string {
  if (item.kind === "ABSORBED") return `vira a seção ${item.section} ("${item.sectionH2}"), reescrito na voz${item.reason ? ` — ${item.reason}` : ""}`;
  if (item.kind === "CLOSING") return "vai para o fechamento da planta, reescrito na voz";
  if (item.kind === "REMOVED") return `sai: ${item.reason} (decisão no artigo-modelo)`;
  return `fica como seção própria, reescrita na voz, ${item.after ? `depois da seção ${item.after}` : "logo depois da abertura"}`;
}

/*
 * 2026-10-08 · B5 · A MESMA CENA EM DUAS IMAGENS. O plano real tinha a
 * profissional com o celular na capa e num respiro. Duas imagens que dividem o
 * sujeito (profissional, paciente ou cliente, pessoa, mãos) E o objeto
 * (celular, computador, tablet) repetem a cena. Lê português e inglês (o prompt
 * de imagem às vezes vem em inglês).
 */
const SUJEITOS_DA_CENA: ReadonlyArray<readonly [string, RegExp]> = [
  ["profissional", /\b(profissiona(?:l|is)|professionals?|dentistas?|dentists?|medic[oa]s?|doctors?|terapeutas?|therapists?|psicolog[oa]s?|psychologists?|nutricionistas?|nutritionists?|fisioterapeutas?|esteticistas?|especialistas?|specialists?|empreendedor(?:a|es|as)?|entrepreneurs?|empresari[oa]s?|business owners?|donos?|donas?)\b/],
  ["paciente ou cliente", /\b(pacientes?|patients?|clientes?|clients?|customers?)\b/],
  ["pessoa", /\b(pessoas?|mulher(?:es)?|homem|homens|jovens?|persons?|people|wom[ae]n|m[ae]n)\b/],
  ["mãos", /\b(maos?|hands?)\b/],
];
const OBJETOS_DA_CENA: ReadonlyArray<readonly [string, RegExp]> = [
  ["celular", /\b(celular(?:es)?|smartphones?|telefones?|phones?|iphones?)\b/],
  ["computador", /\b(notebooks?|laptops?|computador(?:es)?|computers?)\b/],
  ["tablet", /\b(tablets?|ipads?)\b/],
];
const rotuloDaVaga = (slot: string) => (slot === "CAPA" ? "Capa" : `Respiro ${slot.slice(1)}`);

export function radarArticleBlueprintRepeatedScenes(visual: ReadonlyArray<{ slot: string; concept?: string | null; prompt: string }>): Array<{ slots: [string, string]; subject: string; object: string }> {
  const cenas = visual.map(item => {
    const texto = semAcento(`${item.concept || ""} ${item.prompt || ""}`);
    return {
      slot: item.slot,
      sujeitos: SUJEITOS_DA_CENA.filter(([, regra]) => regra.test(texto)).map(([nome]) => nome),
      objetos: OBJETOS_DA_CENA.filter(([, regra]) => regra.test(texto)).map(([nome]) => nome),
    };
  });
  const saida: Array<{ slots: [string, string]; subject: string; object: string }> = [];
  for (let i = 0; i < cenas.length; i += 1) {
    for (let j = i + 1; j < cenas.length; j += 1) {
      const sujeito = cenas[i].sujeitos.find(item => cenas[j].sujeitos.includes(item));
      const objeto = cenas[i].objetos.find(item => cenas[j].objetos.includes(item));
      if (sujeito && objeto) saida.push({ slots: [cenas[i].slot, cenas[j].slot], subject: sujeito, object: objeto });
    }
  }
  return saida;
}

/* 2026-10-08 · B6 · o ângulo que "costura" temas em vez de dizer a entrega concreta. */
const ANGULO_DE_COSTURA = /\bcostur\w*|\b(?:une|unir|unindo|unem|junta|juntar|juntando|juntam|combina|combinar|combinando|combinam|mistura|misturar|misturando|integra|integrar|integrando)\b(?:\s+\S+){0,4}?\s+(?:temas|assuntos|topicos|frentes|abordagens)\b/;

/** 2026-10-08 · B7 · A planta foi montada antes das regras atuais (ou sem versão dita). */
export const radarArticleBlueprintRulesOutdated = (payload: Pick<RadarArticleBlueprintPayload, "rulesVersion"> | null | undefined): boolean =>
  Boolean(payload) && payload!.rulesVersion !== RADAR_ARTICLE_BLUEPRINT_RULES_VERSION;

/* 2026-10-08 · B3 · os sentidos da régua que a conferência aponta (a afirmação listada pela planta já tem link externo). */
const SENTIDOS_SEM_FONTE: ReadonlySet<string> = new Set(["PLATAFORMA", "CONVERSAO", "COMPORTAMENTO"]);

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
  /* 2026-10-08 · B5 · a mesma cena (sujeito e objeto) em duas imagens. */
  for (const repetida of radarArticleBlueprintRepeatedScenes(visual)) {
    notes.push(`O plano visual repete a cena (${repetida.subject} com ${repetida.object}) em ${rotuloDaVaga(repetida.slots[0])} e ${rotuloDaVaga(repetida.slots[1])}: dê a cada imagem uma cena diferente antes de aprovar.`);
  }

  const daIa = ai.sections.length > L.sections ? ai.sections.slice(0, L.sections) : ai.sections;
  if (daIa.length < ai.sections.length) notes.push(`A IA propôs ${ai.sections.length} seções; ficaram as ${L.sections} primeiras (teto do artigo-modelo).`);

  /* 2026-10-08 · B1 · o número (1 = a primeira) de cada seção da IA que ficou, na ordem da planta: o mapa da página publicada aponta para elas. */
  const sobreviventes: number[] = [];
  const secoes = daIa.flatMap((secao, indiceDaIa) => {
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
    sobreviventes.push(indiceDaIa + 1);
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
  /*
   * 2026-10-08 · B3 · TODA afirmação absoluta de cada seção vira nota (antes,
   * só a primeira), e a régua por sentido do Grupo A (`radarSentenceNeedsSource`)
   * aponta o efeito comercial, o comportamento do público e a plataforma
   * afirmados sem fonte — com a polaridade: a tese que NEGA o efeito passa. A
   * frase coberta pelo link externo da própria seção já está declarada (a
   * planta a liga a uma fonte) e não vira nota; a coberta por fonte X passa.
   */
  const afirmacoesDaPlanta = radarPendingClaims(null, { blueprint: { sections: secoes }, sources: brief.sources } as unknown as RadarArticleBlueprintPayload);
  const raizesDaPrincipalNaRegua = new Set(radarSemanticStems(brief.article.principal));
  const semFonte = (frase: string, secao: number | null) => {
    const veredito = radarSentenceNeedsSource(frase, { pendentes: afirmacoesDaPlanta, secao, comuns: raizesDaPrincipalNaRegua });
    return veredito.needs && SENTIDOS_SEM_FONTE.has(veredito.kind) ? veredito.label : null;
  };
  secoes.forEach((secao, indice) => {
    for (const frase of [secao.answerFirst, ...secao.explain]) {
      if (RADAR_ABSOLUTE_CLAIM.test(frase)) {
        notes.push(`Seção "${secao.h2}" afirma de forma absoluta ("${corte(frase, 140)}"): delimite ou sustente com fonte antes de aprovar.`);
        continue;
      }
      const sentido = semFonte(frase, indice);
      if (sentido) notes.push(`Seção "${secao.h2}" afirma sem fonte ("${corte(frase, 140)}") — ${sentido}: delimite ou sustente com fonte do pacote antes de aprovar.`);
    }
  });
  /* 2026-10-02 · a premissa também: promessa, ângulo, abertura e virada alimentam o vídeo, os cortes e o carrossel. */
  for (const [onde, frase] of [["A promessa", ai.promise], ["O ângulo", ai.angle.statement], ["A direção da abertura", ai.opening.direction], ["A virada do fechamento", ai.closing.turn]] as const) {
    if (!frase) continue;
    if (RADAR_ABSOLUTE_CLAIM.test(frase)) {
      notes.push(`${onde} afirma de forma absoluta ("${corte(frase, 140)}"): delimite antes de aprovar — ela vira a premissa do vídeo, dos cortes e do carrossel.`);
      continue;
    }
    /* 2026-10-08 · B3 · e pelo sentido, com a mesma polaridade (a tese do dono que nega o efeito passa). */
    const sentido = semFonte(frase, null);
    if (sentido) notes.push(`${onde} afirma sem fonte ("${corte(frase, 140)}") — ${sentido}: delimite antes de aprovar — ela vira a premissa do vídeo, dos cortes e do carrossel.`);
  }
  /* 2026-10-08 · B6 · o ângulo é a entrega concreta que a amostra não tem, não a costura de temas que ela já cobre. */
  if (ANGULO_DE_COSTURA.test(semAcento(ai.angle.statement))) {
    notes.push(`O ângulo ("${corte(ai.angle.statement, 140)}") costura temas em vez de dizer a entrega concreta que a amostra não tem (exemplo comentado, checklist de diagnóstico, comparação): reescreva antes de aprovar.`);
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
  /*
   * 2026-10-08 · B2 · A 1ª SEÇÃO RESPONDE À BUSCA. No CSV real, a busca "como
   * atrair clientes pelo instagram" abria por "Por que o Instagram não traz
   * pacientes": a tese antes do caminho. Busca "como …" pede a 1ª seção
   * prática; a seção de diagnóstico ("por que", ou que nega o assunto) vem
   * depois. Só aponta — reordenar é da passada de correção ou do dono.
   */
  const primeira = secoes[0];
  if (/^como\b/.test(radarWritingCompareKey(brief.article.principal)) && primeira) {
    /* 2026-10-08 (revisão) · a negação só conta fora do H2 prático: "Como não errar na bio" é caminho, não tese — e a nota paga a passada de correção. */
    const h2 = radarWritingCompareKey(primeira.h2);
    const diagnostico = [primeira.h2, primeira.readerQuestion].some(item => /^por\s*que\b|^porque\b/.test(radarWritingCompareKey(item))) || (/\bnao\b/.test(h2) && !/^(?:como|o que fazer|quando|evite)\b/.test(h2));
    if (diagnostico) notes.push(`A 1ª seção ("${primeira.h2}") abre pelo diagnóstico ou pela tese, mas a busca "${brief.article.principal}" pede o caminho prático: a 1ª seção responde à busca e a tese da marca vem depois — reordene antes de aprovar.`);
  }
  if (ai.title.seoTitle.length > 65) notes.push(`SEO title com ${ai.title.seoTitle.length} caracteres (alvo ~60).`);
  if (ai.title.metaDescription.length > 165) notes.push(`Meta description com ${ai.title.metaDescription.length} caracteres (alvo ~155).`);

  /* 2026-10-08 (revisão) · só o Pilar DECIDIDO cobra o link: "Pilar (formação)" de Silo sem Pilar é sugestão, não destino obrigatório. */
  const pilar = brief.linkCandidates.find(item => radarSiloRoleText(item.role) === "Pilar");
  const linksUsados = new Set(secoes.flatMap(secao => secao.internalLinks.map(link => link.candidate)));
  /* 2026-10-08 · só o Suporte deve link ao Pilar; o próprio Pilar nunca recebe esta nota. */
  if (pilar && radarSiloRoleIsSupport(brief.article.siloRole) && !linksUsados.has(pilar.id)) notes.push(`Falta o link para o Pilar (${pilar.label}).`);

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

  /*
   * 2026-10-08 · B1 · O MAPA DA ATUALIZAÇÃO, CONFERIDO. Cada H2 atual da página
   * publicada fica no mapa, na ordem da página. A seção que a IA deu (número na
   * ordem DELA) vira o número na planta conferida; índice inválido, seção que
   * saiu, H2 omitido ou "sai" sem motivo: o título decide (origem "match") e,
   * sem par, a seção fica null com origem "match" — que a leitura do mapa trata
   * como "fica como seção própria" (nada sai sem decisão). Sem página lida, a
   * planta não leva mapa.
   */
  const estruturaPublicada = brief.publishedStructure?.h2.length ? brief.publishedStructure : null;
  let publishedMap: RadarArticleBlueprintPublishedMapEntry[] | undefined;
  if (estruturaPublicada) {
    const mapaDaIa = ai.publishedMap ?? [];
    const usados = new Set<number>();
    const titulosDasSecoes = secoes.map(secao => [secao.h2, secao.readerQuestion, ...secao.h3].join(" "));
    publishedMap = [];
    for (const atual of estruturaPublicada.h2) {
      const chave = radarWritingCompareKey(atual);
      let indice = mapaDaIa.findIndex((item, i) => !usados.has(i) && radarWritingCompareKey(item.current) === chave);
      if (indice < 0) indice = casarTitulo(atual, mapaDaIa.map((item, i) => (usados.has(i) ? "" : item.current)), new Set());
      const item = indice >= 0 ? mapaDaIa[indice] : null;
      if (item) usados.add(indice);
      let motivo: string;
      if (!item) {
        motivo = "ficou fora do mapa da IA";
      } else if (item.section === null) {
        if (t(item.reason)) {
          publishedMap.push({ current: atual, section: null, reason: corte(t(item.reason), L.shortChars), origin: "ai" });
          continue;
        }
        motivo = "veio para sair sem motivo";
      } else {
        const naPlanta = sobreviventes.indexOf(item.section) + 1;
        if (item.section >= 1 && naPlanta >= 1) {
          publishedMap.push({ current: atual, section: naPlanta, reason: t(item.reason), origin: "ai" });
          continue;
        }
        motivo = item.section >= 1 && item.section <= ai.sections.length ? `apontava a seção ${item.section}, que saiu da planta` : `veio com índice de seção inválido (${item.section})`;
      }
      const casada = casarTitulo(atual, titulosDasSecoes, raizesComuns);
      if (casada >= 0) {
        publishedMap.push({ current: atual, section: casada + 1, reason: "", origin: "match" });
        notes.push(`Mapa da página publicada: o H2 atual "${atual}" ${motivo}; casado pelo título com a seção ${casada + 1} ("${secoes[casada].h2}").`);
      } else {
        publishedMap.push({ current: atual, section: null, reason: "", origin: "match" });
        notes.push(opcoes.close
          ? `Mapa da página publicada: o H2 atual "${atual}" ${motivo} e não tem par na planta; fica como seção própria, reescrita na voz (nada sai da página sem decisão).`
          : `Mapa da página publicada: o H2 atual "${atual}" ${motivo} e não tem par na planta: diga a seção que o absorve ou o motivo para sair antes de aprovar.`);
      }
    }
    const sobra = mapaDaIa.length - usados.size;
    if (sobra > 0) notes.push(`Mapa da página publicada: ${sobra} item(ns) da IA que não são H2 da página ignorado(s).`);
  }

  const montado: RadarArticleBlueprintAi = {
    ...ai,
    angle: { ...ai.angle, evidence: soIds(ai.angle.evidence, "Ângulo") },
    opening: { ...ai.opening, evidence: soIds(ai.opening.evidence, "Abertura") },
    sections: secoes,
    discarded: [...descartados.values()],
    closing: { ...ai.closing, specialist: closingSpecialist },
    visual,
    eeat,
    publishedMap,
  };
  if (!publishedMap) delete montado.publishedMap;
  /* 2026-10-08 · B4 · os nomes atuais de produtos; a keyword que traz o nome antigo o preserva. */
  const blueprint = radarArticleBlueprintWithCurrentNames({ blueprint: montado }, nucleo).blueprint;
  if (blueprint !== montado) notes.push("Nomes atuais: o nome antigo do produto (Google Meu Negócio ou Google My Business) virou \"Perfil da Empresa no Google\" na planta.");
  const m = brief.measures;
  const planoDePalavras = { wordsMin: m.words.p25 ?? m.words.median, wordsMax: m.words.p75 ?? m.words.median };
  /* 2026-10-08 · B8 · os parágrafos coerentes com a faixa de palavras. */
  const paragrafosDoPlano = radarArticleBlueprintParagraphPlan({ serp: m, plan: planoDePalavras }, secoes.map(secao => secao.paragraphs));
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
          ...planoDePalavras,
          paragraphsMin: paragrafosDoPlano?.min ?? null,
          paragraphsMax: paragrafosDoPlano?.max ?? null,
          wordsPerParagraph: paragrafosDoPlano?.wordsPerParagraph ?? null,
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
      /* 2026-10-08 · B1 e B7 · a página publicada que a IA viu (sem ela, a chave não existe) e a versão das regras. */
      ...(brief.publishedStructure ? { publishedStructure: brief.publishedStructure } : {}),
      rulesVersion: RADAR_ARTICLE_BLUEPRINT_RULES_VERSION,
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
  /*
   * 2026-10-08 · B1 · a seção removida pelo dono muda a numeração: o mapa da
   * página publicada acompanha; o H2 atual que ela absorvia volta a ser casado
   * pelo título na leitura (origem "match"), nunca "sai" sem decisão.
   */
  const novoNumero = new Map<number, number>();
  b.sections.forEach((_secao, indice) => {
    if (!porIndice.get(indice)?.remove) novoNumero.set(indice + 1, novoNumero.size + 1);
  });
  const mapa = b.publishedMap?.map(item => {
    if (item.section === null) return item;
    const numero = novoNumero.get(item.section);
    return numero ? { ...item, section: numero } : { ...item, section: null, reason: "", origin: "match" as const };
  });
  return {
    ...radarArticleBlueprintPayloadToStore(payload),
    blueprint: {
      ...b,
      promise: edit.promise ?? b.promise,
      reader: edit.reader ?? b.reader,
      title: { ...b.title, h1: edit.title?.h1 ?? b.title.h1, seoTitle: edit.title?.seoTitle ?? b.title.seoTitle, metaDescription: edit.title?.metaDescription ?? b.title.metaDescription },
      opening: { ...b.opening, readerQuestion: edit.openingQuestion ?? b.opening.readerQuestion },
      sections: secoes,
      ...(mapa ? { publishedMap: mapa } : {}),
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
/**
 * 2026-10-08 · As opções ADITIVAS das colunas (rodada dos entregáveis, Grupo C).
 * O CSV para escrever as passa; sem elas, a trava de fonte usa só os links da
 * planta e o detector por sentido, e a estrutura não marca o mapa da página.
 */
export type RadarArticleBlueprintColumnsOptions = {
  /** C4 · As afirmações que pedem fonte (`radarPendingClaims(p, planta)`); ausente = só os links externos da planta. */
  pendentes?: readonly RadarPendingClaim[];
  /** C4 · As raízes de cenário que não distinguem assunto (`radarClaimCommonStems`). */
  comuns?: ReadonlySet<string>;
  /** C2 · Os H2 lidos agora da página publicada; null = os que a IA viu (`publishedStructure`); ausente = sem mapa (artigo novo). */
  currentH2?: readonly string[] | null;
  /** C2 · As keywords do artigo, a principal primeiro: só as raízes dela não distinguem um título do outro no casamento. */
  keywords?: readonly string[];
  /** 2026-10-08 (correção da revisão) · A keyword principal, para a ordem de leitura da busca "como …" (B2 no export, vale para planta antiga). */
  principal?: string | null;
};

export function radarArticleBlueprintColumns(
  payload: RadarArticleBlueprintPayload,
  aoVivo: readonly RadarArticleBlueprintLiveVideo[] | null = null,
  /** 2026-10-02 · Aditivo: a publicação deste artigo, para o prefixo provável dos destinos planejados. */
  publicacao: { slug: string | null; publishedUrl: string | null } | null = null,
  /** 2026-10-02 · Aditivo: em que lente da SERP cada domínio apareceu (`radarWritingDomainLenses`). */
  lentesDoDominio: ((dominio: string) => string | null) | null = null,
  /** 2026-10-08 · Aditivo: a trava de fonte e o mapa da página publicada (C2 e C4). */
  opcoes: RadarArticleBlueprintColumnsOptions = {},
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
  /*
   * 2026-10-08 · C9 · O DESTINO PLANEJADO É CONDICIONAL E CONCLUÍDO. "Use o
   * caminho" fazia do caminho planejado um endereço publicado (link quebrado se
   * este artigo for ao ar antes), e "marque a âncora" era marcador por
   * preencher. A regra vai uma vez, no topo dos links; cada link diz o estado.
   */
  const status = (item: RadarArticleBlueprintLinkCandidate) => item.status === "PUBLISHED" ? "publicado" : item.status === "PLANNED" ? "planejado, ainda não publicado" : "sem endereço no pacote: a âncora fica como texto simples, sem link";
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
  /*
   * 2026-10-08 · B8 · os parágrafos saem da faixa de palavras (vale para a
   * planta antiga: a conta usa só as medidas gravadas); sem medida, "~N por
   * seção", sem somar. E a contagem concorda: "1 link externo".
   */
  const paragrafosDoPlano = radarArticleBlueprintParagraphPlan(m, b.sections.map(secao => secao.paragraphs));
  const paragrafosNaMedida = paragrafosDoPlano
    ? `~${paragrafosDoPlano.min === paragrafosDoPlano.max ? paragrafosDoPlano.min : `${paragrafosDoPlano.min}–${paragrafosDoPlano.max}`} parágrafos (~${paragrafosDoPlano.wordsPerParagraph} palavras cada, como nos concorrentes)`
    : `~${Math.max(1, Math.round(m.plan.paragraphs / Math.max(1, m.plan.sections)))} parágrafos por seção`;

  /*
   * 2026-10-08 · C4 · A TRAVA DE FONTE NA PLANTA. Toda frase da planta que vai
   * ao texto (abertura, resposta e "Explicar" de cada seção, promessa, ângulo,
   * virada e CTA) passa pela régua por sentido (`radarSentenceNeedsSource`):
   * a que só entra com fonte leva "(precisa de fonte: …)" — a marca da regra
   * geral 5 — e entra na lista concluída do fim da estrutura. A tese que NEGA o
   * efeito passa; a frase coberta por fonte do pacote também.
   */
  const pendentes = opcoes.pendentes ?? radarPendingClaims(null, payload);
  const travadas = new Map<string, string>();
  const travar = (frase: string, rotulo: string) => {
    const chave = radarWritingCompareKey(frase);
    if (chave && !travadas.has(chave)) travadas.set(chave, `"${corte(frase.trim().replace(/[.;:\s]+$/, ""), 140)}" (${rotulo})`);
  };
  const comFonte = (frase: string, secao: number | null): string => {
    if (!t(frase)) return frase;
    const veredito = radarSentenceNeedsSource(frase, { pendentes, secao, comuns: opcoes.comuns });
    if (!veredito.needs) return frase;
    travar(frase, veredito.label);
    return radarWritingSourceMark(frase, veredito);
  };
  /*
   * 2026-10-08 · C3 · O LINK EXTERNO SEM FONTE NÃO É LINK. "→ fonte a obter
   * (fonte oficial)" era espera aberta no entregável (D10): a afirmação sai
   * delimitada e sem link externo, com a fonte que ela pede, e entra na lista.
   */
  const linhaDoLinkExterno = (link: RadarArticleBlueprintAi["sections"][number]["externalLinks"][number], secao: number): string => {
    const doPacote = link.source ? fonte.get(link.source) : undefined;
    if (doPacote) return `- Link externo: ${link.claim} → ${doPacote.url}`;
    const tipo = t(link.sourceType).replace(/^fontes?\s+/i, "") || "oficial ou verificada";
    const veredito = radarSentenceNeedsSource(link.claim, { pendentes, secao, comuns: opcoes.comuns });
    travar(link.claim, veredito.needs && veredito.label ? veredito.label : "afirmação que a planta liga a fonte oficial ou verificada");
    return `- Sem link externo: "${t(link.claim).replace(/[.;:\s]+$/, "")}" fica delimitada no texto (precisa de fonte: ${tipo}).`;
  };
  const externos = b.sections.flatMap(secao => secao.externalLinks);
  const externosComFonte = externos.filter(link => link.source && fonte.has(link.source)).length;
  const delimitadas = externos.length - externosComFonte;

  /*
   * 2026-10-08 · C2 · O MAPA DA PÁGINA PUBLICADA NA PLANTA. Com os H2 publicados
   * (o CSV para escrever os passa), cada seção diz o que absorve da página, o
   * que fica como seção própria depois dela, o que vai ao fechamento e o que a
   * planta decidiu tirar (com o motivo). Artigo-modelo antigo: casamento de
   * títulos, conservador — o que não casa fica.
   */
  const mapa = opcoes.currentH2 !== undefined ? radarArticleBlueprintPublishedMapReading(payload, opcoes.currentH2, { keywords: opcoes.keywords }) : [];
  const citados = (itens: readonly RadarArticleBlueprintPublishedMapReading[]) => itens.map(item => `"${corte(item.current, 80)}"`).join("; ");
  const absorvidos = (numero: number) => mapa.filter(item => item.kind === "ABSORBED" && item.section === numero);
  const ficamDepois = (numero: number) => mapa.filter(item => item.kind === "KEEP" && (item.after ?? 0) === numero);
  const fechamentoDaPagina = mapa.filter(item => item.kind === "CLOSING");
  const removidosDaPagina = mapa.filter(item => item.kind === "REMOVED");
  const mantidosDaPagina = mapa.filter(item => item.kind === "KEEP").length;
  const promessaMarcada = comFonte(b.promise, null);
  const anguloMarcado = comFonte(b.angle.statement, null);
  /*
   * 2026-10-08 (correção da revisão) · O TEXTO MAIS VISÍVEL TAMBÉM PASSA PELA
   * TRAVA. H1, alternativas, SEO title, meta description, próximo passo, ALT e
   * legenda das imagens (a legenda é texto publicado, embaixo da imagem) saíam
   * crus: "O Instagram enche a agenda da clínica" no H1 não levava marca
   * nenhuma, enquanto o CSV de vídeo travava a mesma frase na capa e o Redator a
   * marcava em title.h1. Agora todos levam "(precisa de fonte: …)" e entram na
   * lista concluída; a tese que nega o efeito e a orientação passam.
   */
  const h1Marcado = comFonte(b.title.h1, null);
  const alternativasMarcadas = b.title.alternatives.map(item => comFonte(item, null));
  const seoTitleMarcado = comFonte(b.title.seoTitle, null);
  const metaMarcada = comFonte(b.title.metaDescription, null);
  const proximoPassoMarcado = b.closing.nextStep ? comFonte(b.closing.nextStep, null) : "";
  const visualMarcado = b.visual.map(item => ({ ...item, alt: item.alt ? comFonte(item.alt, null) : item.alt, caption: item.caption ? comFonte(item.caption, null) : item.caption }));
  /*
   * 2026-10-08 (correção da revisão) · O EXPORT PROTEGE TAMBÉM A PLANTA ANTIGA
   * (há ~25 no Silo, montadas antes das regras B2, B5 e B6). Até a planta ser
   * regerada, o entregável sai com a instrução concluída — sem pendência:
   *   - B2 · busca "como …" com a abertura ou a 1ª seção pelo diagnóstico: o
   *     primeiro parágrafo responde o caminho prático, e o diagnóstico vem
   *     como contexto;
   *   - B5 · duas imagens com a mesma cena (sujeito e objeto): ao gerar a
   *     segunda, troque o sujeito ou o objeto;
   *   - B6 · o ângulo cita só a evidência que sustenta o diferencial (lacuna G,
   *     diferencial D, oportunidade O); resultado orgânico (S) e pergunta (P)
   *     não sustentam ângulo.
   * Planta que já segue as regras não ganha linha nenhuma (as condições não casam).
   */
  const principal = t(opcoes.principal ?? "");
  const primeiraSecao = b.sections[0];
  const ehDiagnostico = (texto: string) => /^(?:por\s*que|porque)\b/.test(radarWritingCompareKey(texto));
  const abreDiagnostico = Boolean(
    /^como\b/.test(radarWritingCompareKey(principal)) && primeiraSecao &&
    (ehDiagnostico(b.opening.readerQuestion) || [primeiraSecao.h2, primeiraSecao.readerQuestion].some(ehDiagnostico) || /\bnao\b/.test(radarWritingCompareKey(primeiraSecao.h2))),
  );
  const secaoPratica = abreDiagnostico ? b.sections.find((secao, indice) => indice > 0 && (/^como\b/.test(radarWritingCompareKey(secao.h2)) || /^como\b/.test(radarWritingCompareKey(secao.readerQuestion)) || Boolean(secao.practical))) : undefined;
  const ordemDaBusca = abreDiagnostico
    ? `- Ordem de leitura: a busca é "${principal}" — o primeiro parágrafo já responde o caminho prático em uma ou duas frases${secaoPratica ? `, apontando para "${secaoPratica.h2}"` : ""}; a pergunta acima e o diagnóstico ("${primeiraSecao.h2}") entram como contexto, sem negar o assunto do artigo.`
    : null;
  const cenasRepetidas = radarArticleBlueprintRepeatedScenes(b.visual).map(({ slots, subject, object }) =>
    `Cena repetida: ${rotuloDaVaga(slots[0])} e ${rotuloDaVaga(slots[1])} mostram ${subject} com ${object} — ao gerar ${rotuloDaVaga(slots[1])}, troque o sujeito ou o objeto da cena.`);
  const evidenciaDoAngulo = b.angle.evidence.filter(id => /^[GDO]\d/i.test(id));

  const estrutura = [
    "ARTIGO-MODELO DA SERP (planta concluída do artigo; a redação é de quem escreve).",
    ...(payload.unit ? [`Tipo da unidade: ${payload.unit.label}${payload.unit.format ? ` · formato: ${payload.unit.format}` : ""}.`] : []),
    ...(payload.brandVoice ? [`Voz da marca usada no plano: Skill "${payload.brandVoice.name}" v${payload.brandVoice.version}.`] : []),
    /* 2026-10-08 · C3 · link externo é o que tem fonte do pacote; a afirmação sem fonte sai delimitada, sem link. */
    /* 2026-10-08 (correção da revisão) · os H2 da página que ficam como seção própria SOMAM ao plano: a medida diz isso, não só "5 H2". */
    `Medidas do plano: ${m.plan.sections} H2${mantidosDaPagina ? ` (+ ${contagem(mantidosDaPagina, "H2 da página publicada mantido como seção própria", "H2 da página publicada mantidos como seções próprias")})` : ""} · ${m.plan.h3} H3 · ${paragrafosNaMedida} · ${contagem(m.plan.bold, "negrito", "negritos")} · ${contagem(m.plan.images, "imagem", "imagens")} (capa + ${contagem(m.plan.respites, "respiro", "respiros")}) · ${contagem(m.plan.internalLinks, "link interno", "links internos")} · ${contagem(externosComFonte, "link externo", "links externos")}${delimitadas ? ` (${contagem(delimitadas, "afirmação delimitada", "afirmações delimitadas")}, sem link)` : ""}${m.plan.wordsMin && m.plan.wordsMax ? ` · ${m.plan.wordsMin}–${m.plan.wordsMax} palavras` : ""}.`,
    `Concorrentes comparáveis (${m.serp.comparablePages}): mediana de ${m.serp.words.median ?? "?"} palavras, ${m.serp.h2 ?? "?"} H2, ${m.serp.h3 ?? "?"} H3, ${m.serp.paragraphs ?? "?"} parágrafos, ${m.serp.images ?? "?"} imagens.`,
    /* 2026-10-02 · campo que veio vazio não deixa rótulo solto ("Keywords: ", "→  ()", "— "). */
    ...(b.keywordPlan.reading ? [`Keywords: ${b.keywordPlan.reading}`] : b.keywordPlan.complementary.length ? ["Keywords:"] : []),
    ...b.keywordPlan.complementary.map(item => `- ${item.keyword}${item.placement ? ` → ${item.placement}` : ""}${item.reason ? ` (${item.reason})` : ""}`),
    ...(b.keywordPlan.slugNote ? [`Slug × principal: ${b.keywordPlan.slugNote}`] : []),
    "",
    `Abertura: responder "${b.opening.readerQuestion}" no primeiro parágrafo${b.opening.direction ? ` — ${comFonte(b.opening.direction, null)}` : ""}${b.opening.evidence.length ? ` [${rotuloDaEvidencia(payload, b.opening.evidence).join("; ")}]` : ""}`,
    ...(ordemDaBusca ? [ordemDaBusca] : []),
    ...(ficamDepois(0).length ? [`Logo depois da abertura, a página publicada continua com ${citados(ficamDepois(0))}: seção própria, reescrita na voz.`] : []),
    "",
    ...b.sections.flatMap((secao, indice) => [
      `## ${secao.h2}`,
      `- Pergunta do leitor: ${secao.readerQuestion}`,
      ...origemDaSecao(payload, secao),
      `- Abre respondendo: ${comFonte(secao.answerFirst, indice)}`,
      ...(absorvidos(indice + 1).length ? [`- Da página publicada, entra aqui (reescrito na voz): ${citados(absorvidos(indice + 1))}`] : []),
      ...secao.h3.map(h3 => `  ### ${h3}`),
      ...secao.explain.map(item => `- Explicar: ${comFonte(item, indice)}`),
      `- ~${paragrafosDoPlano?.perSection[indice] ?? secao.paragraphs} parágrafo(s)${secao.bold.length ? ` · negrito em: ${secao.bold.join(", ")}` : ""}`,
      ...(secao.terms.length ? [`- Termos a nomear: ${secao.terms.join(" · ")}`] : []),
      ...(secao.evidence.length ? [`- Evidências: ${rotuloDaEvidencia(payload, secao.evidence, lentesDoDominio).join("; ")}`] : []),
      ...secao.internalLinks.map(link => { const destino = candidato.get(link.candidate); return `- Link interno: âncora "${link.anchor}" → ${destino ? rotuloDoDestino(destino) : link.candidate}`; }),
      ...secao.externalLinks.map(link => linhaDoLinkExterno(link, indice)),
      ...(secao.specialist ? [`- Especialista: usar ${secao.specialist}`] : []),
      ...(secao.video ? [videoDaSecao(payload, secao.video, aoVivo)] : []),
      ...(secao.image ? [`- Imagem: ${secao.image}`] : []),
      ...(secao.practical ? [`- Entrega prática: ${secao.practical}`] : []),
      ...ficamDepois(indice + 1).map(item => `- Depois desta seção, a página publicada continua com "${corte(item.current, 80)}": seção própria, reescrita na voz.`),
      ...(indice < b.sections.length - 1 ? [""] : []),
    ]),
    ...(descartados.length
      ? ["", `Descartado do esqueleto da SERP: ${descartados.map(item => `${item.id}${doEsqueleto.get(item.id) ? ` "${doEsqueleto.get(item.id)!.heading}"` : ""}${item.reason ? ` (${item.reason})` : ""}`).join("; ")}.`]
      : []),
    ...(removidosDaPagina.length
      ? ["", `Sai da página publicada (decisão registrada no artigo-modelo): ${removidosDaPagina.map(item => `"${corte(item.current, 80)}" (${item.reason.replace(/[.;:\s]+$/, "")})`).join("; ")}.`]
      : []),
    "",
    `Fechamento: ${comFonte(b.closing.turn, null)}${b.closing.specialist ? ` (voz do especialista ${b.closing.specialist})` : ""}`,
    ...(fechamentoDaPagina.length ? [`Da página publicada, entra no fechamento (reescrito na voz): ${citados(fechamentoDaPagina)}.`] : []),
    `CTA: ${comFonte(b.closing.cta, null)}`,
    ...(b.closing.nextStep ? [`Próximo passo: ${proximoPassoMarcado}`] : []),
    ...(b.eeat.length ? ["", `E-E-A-T: ${b.eeat.join(" · ")}`] : []),
    /* 2026-10-08 · C4 · a lista concluída: o que só entra com fonte do pacote ou delimitado (a regra geral 5). */
    ...(travadas.size
      ? ["", `Afirmações que só entram com fonte do pacote ou delimitadas (regra geral 5): ${[...travadas.values()].join("; ")}. Sem fonte do pacote, escreva de forma qualificada ou omita; nenhuma ganha link externo sem fonte.`]
      : []),
  ].join("\n");

  const links = b.sections.flatMap(secao => secao.internalLinks.map(link => ({ secao: secao.h2, link })));
  const comDestinoPlanejado = links.some(({ link }) => candidato.get(link.candidate)?.status === "PLANNED");
  const linksInternos = links.length
    ? [
      `Aplique somente estes ${links.length} link(s), com a âncora indicada (pode ajustar concordância):`,
      /* 2026-10-08 · C9 · a regra do destino planejado, uma vez: condicional e concluída. */
      ...(comDestinoPlanejado ? ["Destino planejado (ainda não publicado): o link entra com a URL final quando o destino estiver no ar junto com este artigo ou antes; se este artigo for ao ar primeiro, a âncora fica como texto simples, sem link (nunca link quebrado). O caminho planejado não é endereço publicado: não invente domínio nem URL."] : []),
      ...links.map(({ secao, link }, indice) => {
        const destino = candidato.get(link.candidate);
        return `L${indice + 1} · âncora "${link.anchor}" → ${destino ? `${destino.role} "${rotuloDoDestino(destino)}"${enderecoDoDestino(destino) || ` (${status(destino)})`}` : link.candidate} · onde: seção "${secao}"${link.reason ? ` · por quê: ${link.reason}` : ""}`;
      }),
    ].join("\n")
    : "Nenhum link interno no artigo-modelo.";

  return {
    promessa_e_leitor: ([`Leitor: ${b.reader}`, `Promessa: ${promessaMarcada}`, `Ângulo: ${anguloMarcado}${evidenciaDoAngulo.length ? ` [${rotuloDaEvidencia(payload, evidenciaDoAngulo).join("; ")}]` : ""}`].join("\n")),
    titulo_e_seo: ([
      `H1: ${h1Marcado}`,
      ...(alternativasMarcadas.length ? [`Alternativas: ${alternativasMarcadas.join(" · ")}`] : []),
      `SEO title: ${seoTitleMarcado}`,
      `Meta description: ${metaMarcada}`,
      `Keyword principal em: ${b.keywordPlan.principalPlacement.join(", ") || "H1 e primeiro parágrafo"}`,
    ].join("\n")),
    estrutura,
    links_internos: (linksInternos),
    plano_visual: ([
      `Plano visual: ${b.visual.length} imagem(ns).`,
      ...visualMarcado.map(item => [
        `${item.slot === "CAPA" ? "Capa" : `Respiro ${item.slot.slice(1)}`}${item.section ? ` · seção "${item.section}"` : ""}${item.concept ? ` · ${item.concept}` : ""}`,
        `  Prompt: ${item.prompt}`,
        ...(/\b\d{1,2}\s*:\s*\d{1,2}\b/.test(item.prompt) ? [] : [`  Proporção: ${item.slot === "CAPA" ? "16:9" : "4:3"} (referência; ajuste ao layout do site e à voz da marca)`]),
        ...(item.alt ? [`  ALT: ${item.alt}`] : []),
        ...(item.caption ? [`  Legenda: ${item.caption}`] : []),
      ].join("\n")),
      ...cenasRepetidas,
    ].join("\n")),
  };
}
