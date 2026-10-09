import { z } from "zod";
import type { RadarPortableExportInput } from "./portable-export.ts";
import type { RadarSiloExportWritingContext } from "./portable-silo-export.ts";
import type { RadarPortableSection } from "./portable-read-model.ts";
import {
  radarBrandVoiceBySlot,
  radarBrandVoiceExclusionOf,
  radarBrandVoiceExclusions,
  radarBrandVoiceOwnUrls,
  radarBrandVoiceRef,
  radarBrandVoiceStatusLabel,
  radarBrandVoiceText,
  type RadarBrandVoice,
  type RadarBrandVoiceExclusion,
  type RadarBrandVoiceRef,
  type RadarBrandVoiceSection,
} from "./brand-voice.ts";
import { RADAR_VIDEO_USAGE_HINT, RADAR_VIDEO_USAGE_LABEL, type RadarVideoUsage } from "./video-library.ts";
import { RADAR_AMAZON_EDITORIAL_OUTPUT_LABELS } from "./competitive-blueprint.ts";
import { radarSemanticStems } from "./semantic-concept-model.ts";
import { radarUbiquitousStems } from "./intent-adherence.ts";
import { radarOutOfScopeMatcher, radarSuggestionRestatesKeyword } from "./out-of-scope.ts";
import {
  radarWritingCleanUrl,
  radarWritingCompareKey,
  radarWritingCompetitorTopicsOf,
  RADAR_WRITING_FUNCTION_WORDS,
  RADAR_WRITING_NO_APPROVED_LINK,
  radarWritingDecodeEntities,
  radarWritingProjections,
  radarWritingReferenceTexts,
  radarWritingReferenceTreats,
  radarWritingRhetoricalHeading,
  radarWritingRhetoricalQuestion,
  radarWritingSourceMark,
  radarWritingSpecialistContributions,
  radarWritingStripHeadingTemplate,
  radarWritingUnsupportedClaims,
  type RadarWritingContinuation,
  type RadarWritingPublication,
  type RadarWritingUnit,
} from "./portable-writing-export.ts";
import { radarEditorialHeadingNoiseDependsOnUnit, radarEditorialHeadingNoiseReason, type RadarEditorialSubjectTurn } from "./editorial-article-model.ts";
import type { RadarResearchNoiseContext } from "./research-noise.ts";
/*
 * 2026-10-09 · DEPOIS do export "Para escrever": `multimodal-blueprint` chega a
 * `youtube-blueprint`, que importa o export; carregado antes dele, o ciclo
 * deixava os rótulos de saída ainda não inicializados (ReferenceError no
 * carregamento de quem começa por este módulo).
 */
import { RADAR_EDITORIAL_OUTPUT_LABELS } from "./multimodal-blueprint.ts";
import { radarClaimIsTopicLabel, radarPendingClaims, radarSentenceNeedsSource, type RadarPendingClaim } from "./pending-claims.ts";
import { RADAR_SILO_ROLE_ASKS, radarSiloRoleIsPillar, radarSiloRoleIsSupport, radarSiloRoleText } from "./silo-role.ts";
/* 2026-10-09 · as exclusões dos reajustes (ArticleDNA) e o bloco comercial da Amazon congelada entram no pedido. */
import { radarResearchContextScopeExclusions, type RadarResearchScopeExclusion } from "./article-research-context.ts";
import { RADAR_AMAZON_INTENT_LABELS } from "./amazon-editorial-target.ts";
import type { RadarAmazonCommercialBlock } from "./amazon-commercial-block.ts";

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
 * ===== 2026-10-09 · A COERÊNCIA DOS 8 CSVs "PARA ESCREVER" (o artigo-modelo é o fundamento) =====
 *
 * A última revisão dos CSVs reais de 09/10 achou o que a planta ainda deixava
 * passar. Cada defeito tem a regra no pedido (planta nova) E a correção
 * determinística na conferência e nas colunas (planta antiga já aprovada, que
 * o dono não vai refazer agora). Tudo aditivo; o payload antigo continua válido:
 *
 *   - 5 · as exclusões da Skill de voz ("Não recomendar Instagram Shopping…",
 *     da seção "Recursos antigos ou inadequados") valem como "fora do escopo"
 *     do pacote, pela régua única da voz (`radarBrandVoiceExclusionOf`, a
 *     mesma do CSV para escrever): saem das evidências, das perguntas, do
 *     esqueleto e da planta;
 *   - 8 · pseudo-afirmação (rótulo de tema sem verbo: "Estatísticas sobre
 *     conversão de leads qualificados") não é link externo nem afirmação
 *     delimitada: sai da planta e da lista "só entram com fonte";
 *   - 9 · a demonstração que atribui resultado a um caso sem fonte ("um
 *     consultório que … passou a receber mais ligações") vira exemplo
 *     ilustrativo, sem resultado atribuído;
 *   - 10 · o CTA que cita a página comercial da marca ganha o link dela na
 *     planta (na última seção, a que fecha o artigo) quando ela é candidata; a
 *     continuação deixa o fechamento e vira menção opcional no corpo, nunca uma
 *     segunda chamada;
 *   - 11 · H3 igual ao H2 de outra seção sai; H2 sobrepostos viram nota;
 *   - 12 · a moldura "Cobrir com clareza o tema …" não é promessa (nem no
 *     pacote, nem na planta), e a planta tem um leitor só: o segundo público
 *     sai do leitor e da promessa, e a seção que fala com quem compra é
 *     enquadrada para o leitor declarado.
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
 *
 * 2026-10-09 · a coerência dos CSVs (exclusões da voz, pseudo-afirmação,
 * demonstração sem resultado atribuído, link do CTA, um CTA só, H3 repetido,
 * H2 sobrepostos, promessa sem moldura e um leitor só) mudou o pedido e a
 * conferência.
 *
 * 2026-10-09b · o artigo-modelo vira o fundamento único (regra do dono: o
 * processo do piloto substitui o antigo em toda operação): o pedido recebe o
 * bloco comercial da Amazon congelada (shortlist Z, critérios Q, formato,
 * aviso de afiliado) com a regra de review, e as exclusões que os reajustes
 * gravam no ArticleDNA (`excludedSubjects`, a nota de diferenciação e a
 * fronteira anticanibalização) como fora do escopo DURO; a conferência tira a
 * seção que as cobre.
 */
export const RADAR_ARTICLE_BLUEPRINT_RULES_VERSION = "2026-10-09b";

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
    /** 2026-10-09 · Aditivo: o destino declarado da virada do Assunto (a coluna promessa legada que o dizia saiu do CSV). */
    subjectDestination?: string | null;
    /** 2026-10-09 · Aditivo: a nota humana do Assunto (o "Tronco (Assunto): X — nota" da coluna promessa legada). */
    subjectNote?: string | null;
    /** 2026-10-09 · Aditivo: o lugar da virada que o Radar leu na SERP (as linhas "Virada" e "Direção do H1" do CSV legado viram matéria-prima). */
    subjectTurn?: string | null;
    /** 2026-10-09 · Aditivo: a direção do H1 com o Assunto (o H1 continua da principal). */
    subjectH1?: string | null;
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
  /**
   * 2026-10-09 · 5 · Aditivo: as exclusões que a Skill de voz declara
   * (`radarBrandVoiceExclusions`, a régua única da voz, a mesma do CSV para
   * escrever). Valem como "fora do escopo" no pacote e na conferência, com o
   * padrão delas (`radarBrandVoiceExclusionOf`). Ausente quando a voz não
   * exclui nada: o pedido e a conferência são os de antes. Não é gravado.
   */
  voiceExclusions?: RadarBrandVoiceExclusion[];
  /**
   * 2026-10-09b · Aditivo: as exclusões que os reajustes gravaram no ArticleDNA
   * (`radarResearchContextScopeExclusions`): fora do escopo DURO — a planta
   * anterior e a página publicada não as liberam (diferente da regra 3a). Ausente
   * quando o ArticleDNA não exclui nada. Não é gravado.
   */
  dnaExclusions?: RadarResearchScopeExclusion[];
  /**
   * 2026-10-09b · Aditivo: o bloco comercial da Amazon congelada (formato,
   * critério do ranking, aviso de afiliado, limitações). A shortlist (Z) e os
   * critérios (Q) vão também como evidência, citáveis pela IA. Ausente sem
   * Amazon congelada: o pedido é o de antes. Não é gravado.
   */
  commercial?: RadarArticleBlueprintCommercialBrief;
};

/**
 * ===== 2026-10-09b · A AMAZON NO ARTIGO-MODELO (inventário Amazon, item 2) =====
 *
 * Com a Amazon congelada, o artigo também vira review (ou ranking, comparativo,
 * guia de compra) — e a planta não sabia: o pedido não levava shortlist,
 * critérios, intenção comercial nem aviso de afiliado, e o CSV montava a parte
 * comercial pelo modelo editorial legado. Agora o bloco comercial da Amazon
 * congelada entra no pedido, com a regra de review, e a planta o organiza.
 *
 * `RadarArticleBlueprintCommercial` é a forma que o gerador recebe. Hoje sai de
 * `entrada.commercial` (a projeção comercial do export); quando a projeção da
 * Amazon congelada valer em qualquer perfil (agente AMZ), ela chega aqui sem
 * outra ligação.
 */
export type RadarArticleBlueprintCommercial = {
  /** Quando a Amazon foi congelada (`amazonFrozenInvestigation.finalizedAt`); null = não informado. */
  frozenAt: string | null;
  /** O formato comercial declarado (rótulo legível: "Top melhores produtos", "Comparação de produtos"…). */
  format: string | null;
  desiredCount: number | null;
  /** O critério do ranking, legível ("custo-benefício"…). */
  rankingCriteria: string | null;
  useCase: string | null;
  productClass: string | null;
  brandFilter: string | null;
  /** A shortlist congelada: só ela entra no artigo. `signals` = os sinais da prateleira que a sustentam (quando o bloco da Amazon os traz). */
  products: Array<{ asin: string; name: string; placement: string | null; signals?: string[] }>;
  /** Os critérios de comparação. */
  criteria: string[];
  disclosureRequired: boolean;
  /** O estado da shortlist dito pela investigação (ex.: menos produtos que o formato pede). */
  shortlistNote: string | null;
  /** Aditivo (bloco da Amazon congelada): as faixas de preço observadas sobre os compatíveis. */
  priceBands?: Array<{ label: string; detail: string }>;
  /** Aditivo (bloco da Amazon congelada): as regras de escrita da parte comercial, em português. */
  rules?: string[];
  /** Aditivo (bloco da Amazon congelada): o que a coleta não mediu. */
  limitations?: string[];
  /** Aditivo (bloco da Amazon congelada): o esqueleto genérico da forma comercial — vira seções M do esqueleto, matéria-prima do gerador. */
  skeleton?: Array<{ heading: string; objective: string; sourceSignal: string }>;
};

/** 2026-10-09b · O que vai ao pedido (sem a shortlist e os critérios, que vão como evidência Z e Q, nem o esqueleto, que vira M). */
export type RadarArticleBlueprintCommercialBrief = Omit<RadarArticleBlueprintCommercial, "products" | "criteria" | "skeleton"> & { products: number; criteria: number };

/**
 * 2026-10-09b · O BLOCO COMERCIAL DA AMAZON CONGELADA (`radarAmazonFrozenCommercialBlock`,
 * do agente AMZ) NA FORMA DO GERADOR: a intenção da fotografia, a shortlist
 * elegível com os sinais, os critérios, as faixas de preço, o aviso, as regras
 * e as limitações; o esqueleto da forma comercial vira matéria-prima (M).
 */
export function radarArticleBlueprintCommercialOfBlock(bloco: RadarAmazonCommercialBlock | null | undefined): RadarArticleBlueprintCommercial | null {
  if (!bloco) return null;
  return {
    frozenAt: bloco.frozenAt,
    format: bloco.intent?.label ?? null,
    desiredCount: bloco.intent?.desiredCount ?? null,
    rankingCriteria: bloco.intent?.rankingCriteria ? CRITERIO_DO_RANKING[bloco.intent.rankingCriteria] || bloco.intent.rankingCriteria.replace(/_/g, " ").toLowerCase() : null,
    useCase: limpo(bloco.intent?.useCase) || null,
    productClass: null,
    brandFilter: null,
    products: bloco.shortlist.map(item => ({ asin: t(item.asin), name: limpo(item.title), placement: null, signals: item.supportingSignals.map(limpo).filter(Boolean) })).filter(item => item.asin && item.name),
    criteria: [...new Set(bloco.comparisonCriteria.map(limpo).filter(Boolean))],
    disclosureRequired: bloco.affiliateDisclosureRequired,
    shortlistNote: limpo(bloco.shortlistStatus.message) || null,
    ...(bloco.priceBands.length ? { priceBands: bloco.priceBands.map(item => ({ label: limpo(item.label), detail: limpo(item.detail) })) } : {}),
    ...(bloco.rules.length ? { rules: bloco.rules.map(limpo).filter(Boolean) } : {}),
    ...(bloco.limitations.length ? { limitations: bloco.limitations.map(limpo).filter(Boolean) } : {}),
    ...(bloco.skeleton.length ? { skeleton: bloco.skeleton.map(item => ({ heading: limpo(item.heading), objective: limpo(item.objective), sourceSignal: limpo(item.sourceSignal) })).filter(item => item.heading) } : {}),
  };
}

const CRITERIO_DO_RANKING: Readonly<Record<string, string>> = Object.freeze({
  BEST_OVERALL: "melhor no geral",
  VALUE_FOR_MONEY: "custo-benefício",
  POPULARITY: "popularidade",
  REPUTATION: "reputação",
  USE_CASE: "necessidade de uso",
});

/**
 * 2026-10-09b · O BLOCO COMERCIAL DO EXPORT, NA FORMA DO GERADOR. Sem setup nem
 * produto nem critério, null (o pedido sai como antes).
 */
export function radarArticleBlueprintCommercialOf(entrada: Pick<RadarPortableExportInput, "commercial" | "amazon">, frozenAt: string | null = null): RadarArticleBlueprintCommercial | null {
  const comercial = entrada.commercial ?? null;
  const setup = comercial?.setup ?? entrada.amazon?.setup ?? null;
  const links = comercial?.links || [];
  const produtos = links.length
    ? links.map(link => ({ asin: t(link.asin), name: limpo(link.productName), placement: limpo(link.placement) || null }))
    : (comercial?.products || []).map(item => ({ asin: t(item.asin), name: limpo(item.productName), placement: null }));
  const criterios = [...new Set((comercial?.comparisonCriteria || []).map(item => limpo(item)).filter(Boolean))];
  if (!setup && !produtos.length && !criterios.length) return null;
  const intencao = setup?.intent ?? null;
  return {
    frozenAt,
    format: intencao ? RADAR_AMAZON_INTENT_LABELS[intencao.type] || intencao.type.replace(/_/g, " ").toLowerCase() : null,
    desiredCount: intencao?.desiredCount ?? null,
    rankingCriteria: intencao?.rankingCriteria ? CRITERIO_DO_RANKING[intencao.rankingCriteria] || intencao.rankingCriteria.replace(/_/g, " ").toLowerCase() : null,
    useCase: limpo(intencao?.useCase) || null,
    productClass: limpo(setup?.target?.productClass) || null,
    brandFilter: limpo(setup?.target?.brandFilter) || null,
    products: produtos.filter(item => item.asin && item.name),
    criteria: criterios,
    disclosureRequired: Boolean(comercial?.disclosureRequired),
    shortlistNote: limpo(comercial?.shortlistStatus?.message) || null,
  };
}

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

/* ============================== a virada do Assunto ============================== */

/*
 * 2026-10-09 · AS LINHAS "VIRADA" E "DIREÇÃO DO H1" DO CSV LEGADO VIRAM
 * MATÉRIA-PRIMA DO GERADOR. Com o artigo-modelo como fundamento único, a coluna
 * promessa e o título legados saíram do entregável; a leitura do Radar sobre o
 * Assunto (o bloco da amostra que já o trata, a posição sugerida, o anfitrião
 * onde a virada ficou como ponto a cobrir, e o sinal do H1) vai ao pedido, para
 * a planta decidir. A principal continua dona do H1 em todos os casos.
 */
export function radarArticleBlueprintSubjectTurnOf(
  turn: RadarEditorialSubjectTurn | null,
  principal: string,
): { subjectTurn: string; subjectH1: string } {
  const secao = turn?.turnSection ?? null;
  const posicao = turn?.suggestedPosition ?? null;
  const contagem = secao ? `${secao.pages} de ${secao.sampleSize} página(s)` : "";
  const subjectTurn = secao?.source === "OBSERVED_GROUP"
    ? secao.placement === "COVERAGE_POINT" && secao.hostHeading
      ? `em "${secao.hostHeading}", como ponto a cobrir (a amostra trata o Assunto em ${contagem})`
      : `na seção "${secao.heading}" (a amostra já trata o Assunto em ${contagem})`
    : posicao
      ? `depois de "${posicao.afterHeading}"`
      : secao?.placement === "COVERAGE_POINT" && secao.hostHeading
        ? `como ponto a cobrir em "${secao.hostHeading}" (lugar deixado pelo Radar sem sinal na SERP; a planta pode mudar)`
        : "onde a planta decidir (sem sinal na SERP)";
  const complemento = turn?.h1Complement ?? null;
  const subjectH1 = complemento?.suggested
    ? `${principal} + complemento "${(complemento.complement || turn?.phrase || "").replace(/[.\s]+$/, "")}" (sugestão do Radar; o H1 continua da principal)`
    : (complemento?.headingPages ?? 0) > 0
      ? "Assunto em H2/H3 — o H1 é da principal"
      : "sem sinal na SERP — o H1 é da principal";
  return { subjectTurn, subjectH1 };
}

/* ============================== o esqueleto da SERP ============================== */

/*
 * 2026-10-09 · AS RÉGUAS DA ESTRUTURA LEGADA DO CSV, NA MATÉRIA-PRIMA. Com o
 * artigo-modelo como fundamento único, a estrutura legada saiu do entregável e
 * as réguas dela passam a valer no esqueleto que o gerador recebe:
 *   - o fecho retórico de concorrente ("Gostou do conteúdo?"; "Ficou com
 *     alguma dúvida?" só em artigo e review) nem entra, com as subseções;
 *   - o cabeçalho de concorrente que não é seção (título de post, propaganda,
 *     navegação…) sai sem pergunta utilizável, e as subseções sobem; com ela,
 *     a seção chega pela pergunta. Chamada, fecho e navegação de oferta saem do
 *     artigo editorial e ficam na landing page (R5);
 *   - a pergunta do leitor que é ruído, retórica ou toca o "Não cobrir" sai
 *     sozinha: a seção fica pelo cabeçalho (F3).
 * A seção que o ArticleDNA exige nunca sai por estas réguas (decisão humana), e
 * a chamada para ação fica (é seção da página).
 */
type ReguaDoEsqueleto = { unidade?: RadarWritingUnit; ruido?: RadarResearchNoiseContext | null; perfil?: string | null };

function esqueletoDaSerp(secoes: readonly RadarPortableSection[], tocaFora: (valor: string | null | undefined) => boolean, regua: ReguaDoEsqueleto = {}): RadarArticleBlueprintSkeletonItem[] {
  const saida: RadarArticleBlueprintSkeletonItem[] = [];
  /* Fora do Google, a seção é bloco da plataforma (Amazon), não cabeçalho de concorrente. */
  const ruidoDe = (valor: string | null | undefined): string | null => {
    if (regua.perfil !== "GOOGLE" || !regua.ruido || !valor) return null;
    const motivo = radarEditorialHeadingNoiseReason(valor, regua.ruido);
    return motivo && regua.unidade && !regua.unidade.editorial && (radarEditorialHeadingNoiseDependsOnUnit(motivo, valor) || motivo === "encerramento") ? null : motivo;
  };
  const visitar = (lista: readonly RadarPortableSection[], pai: string | null) => {
    for (const secao of lista) {
      if (saida.length >= L.skeleton) return;
      const cru = corte(limpo(secao.heading), L.shortChars);
      /* FAQ não integra o fluxo (AGENTS §13): a seção nem chega à IA. */
      if (!cru || UUID.test(cru) || EH_FAQ.test(cru)) continue;
      const protegida = secao.mustCoverReasons.length > 0;
      if (!protegida && radarWritingRhetoricalHeading(cru, regua.unidade)) continue;
      const pergunta = limpo(secao.readerQuestion);
      const perguntaUtil = pergunta && !UUID.test(pergunta) && !radarWritingRhetoricalQuestion(pergunta) && !ruidoDe(pergunta) ? pergunta : "";
      /* O cabeçalho que é ruído: sem pergunta utilizável, a seção sai e as subseções sobem; com ela, a seção chega pela pergunta. */
      const cabecalhoRuidoso = !protegida && Boolean(ruidoDe(radarWritingStripHeadingTemplate(cru)));
      if (cabecalhoRuidoso && !perguntaUtil) {
        visitar(secao.children, pai);
        continue;
      }
      const heading = cabecalhoRuidoso ? corte(perguntaUtil, L.shortChars) : cru;
      /*
       * 2026-10-09 · A RÉGUA F3 DO CSV LEGADO, NA MATÉRIA-PRIMA: quando só a
       * pergunta do leitor toca o "Não cobrir", sai a pergunta e a seção fica
       * pelo cabeçalho (nunca a seção inteira marcada para descarte).
       */
      const cabecalhoFora = tocaFora(heading);
      const perguntaFora = Boolean(perguntaUtil) && !cabecalhoFora && !protegida && tocaFora(perguntaUtil);
      const readerQuestion = perguntaUtil && !perguntaFora && radarWritingCompareKey(perguntaUtil) !== radarWritingCompareKey(heading) ? corte(perguntaUtil, L.shortChars) : null;
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
        outOfScope: cabecalhoFora || tocaFora(readerQuestion),
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
/*
 * 2026-10-09 (correção · contrato-F7) · desde 2026-10-08 o "pages" do tema conta
 * SITES (`competitor-topics.ts`), e o "sampleSize" passou a ser a base única em
 * PÁGINAS: "tratado por 7 de 23 páginas" misturava as unidades, enquanto o CSV
 * dizia "7 de 20 sites". O esqueleto diz a mesma coisa que o CSV: N de S sites.
 */
function esqueletoComTemas(
  base: RadarArticleBlueprintSkeletonItem[],
  temas: ReadonlyArray<{ label: string; pages: number; sampleSize: number; headings: string[] }>,
  sites: number | null = null,
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
      cover: [`tema tratado por ${tema.pages} ${sites ? `de ${sites} sites comparáveis` : `${tema.pages === 1 ? "site" : "sites"} (das ${tema.sampleSize} páginas comparáveis)`} (cabeçalhos dos concorrentes: não copie)`, ...tema.headings.slice(1, 3).map(item => corte(item, 120))],
      mustCover: false,
      needsSource: false,
      needsSpecialist: false,
      outOfScope: false,
    });
  }
  return saida;
}

/*
 * 2026-10-09b · A FORMA COMERCIAL DA AMAZON CONGELADA NO ESQUELETO. As seções
 * genéricas da review (o esqueleto de `radarAmazonCommercialSkeleton`, que o
 * bloco do agente AMZ traz) viram seções M, com o objetivo e o sinal no
 * "cobrir": a IA as organiza como as outras (renomeia, junta, descarta com
 * motivo). Nunca vão ao entregável por conta própria.
 */
function esqueletoComComercial(
  base: RadarArticleBlueprintSkeletonItem[],
  comercial: ReadonlyArray<{ heading: string; objective: string; sourceSignal: string }> | null | undefined,
): RadarArticleBlueprintSkeletonItem[] {
  if (!comercial?.length) return base;
  const saida = [...base];
  const vistos = new Set(base.map(item => radarWritingCompareKey(item.heading)));
  for (const item of comercial) {
    if (saida.length >= L.skeleton) break;
    const heading = corte(limpo(item.heading), L.shortChars);
    const chave = radarWritingCompareKey(heading);
    if (!chave || vistos.has(chave) || EH_FAQ.test(heading)) continue;
    vistos.add(chave);
    saida.push({
      id: `M${saida.length + 1}`,
      level: 2,
      parent: null,
      heading,
      readerQuestion: null,
      cover: [`forma comercial da Amazon congelada: ${corte(limpo(item.objective), 100)}`, ...(limpo(item.sourceSignal) ? [`sinal: ${corte(limpo(item.sourceSignal), 100)}`] : [])],
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
  /** 2026-10-08 (correção) · F1 · Aditivo: a publicação dos membros do Silo, por articleId. O irmão no ar é destino PUBLICADO, com a URL. */
  siloPublications?: ReadonlyMap<string, RadarWritingPublication> | null;
  /**
   * 2026-10-09 (correção · casos-reais-F9) · Aditivo: a planta anterior deste
   * artigo (a aprovada mais recente). O item genérico do "fora do escopo" que ela
   * trata não vai à IA como exclusão dura — a mesma regra 3(a) do CSV. Sem ela,
   * a página publicada lida faz o papel; sem as duas, o pedido é o de antes.
   */
  previous?: Pick<RadarArticleBlueprintPayload, "blueprint"> | null;
  /**
   * 2026-10-09b · Aditivo: o bloco comercial da Amazon congelada
   * (`radarArticleBlueprintCommercialOf`). Ausente ou null, o pedido é o de antes.
   */
  commercial?: RadarArticleBlueprintCommercial | null;
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
  /*
   * 2026-10-09 (correção · casos-reais-F9) · A REGRA 3(a) TAMBÉM NO PEDIDO. O
   * export tira do "Não cobrir" o item genérico que a estrutura de referência
   * trata (a planta vence), mas o pedido do artigo-modelo continuava mandando
   * "Custo por Lead (CPL)", "Perfil do Lead", "Os leads no funil de vendas"
   * como "Fora do escopo (não cobrir)" — e a conferência tirava os H3 que os
   * tocam. Ao organizar de novo, a planta perdia o que o CSV declarou coberto.
   * Com a planta anterior (ou, sem ela, a página publicada lida), o item
   * genérico que ela trata não vai ao pedido; o tópico que o Silo exclui (outro
   * artigo, regra 3b) continua fora.
   */
  const referenciaDoPedido = radarWritingReferenceTexts(input.previous ?? null, input.previous ? null : input.publication?.currentStructure ?? null);
  const referenciaTrata = radarWritingReferenceTreats(referenciaDoPedido, [principal, ...p.dna.secondaryKeywords, ...p.dna.narrativeReinforcements, p.assunto?.phrase || ""].filter(Boolean));
  const foraDoEscopo = p.serp.editorialCandidates.filter(item => item.verdict === "OUT_OF_SCOPE").map(item => radarWritingDecodeEntities(item.observedLabel))
    .filter(rotulo => !referenciaTrata(rotulo));
  const outOfScope = [...foraDoEscopo, ...(input.silo?.excludedTopics || [])];
  const nucleo = [principal, ...p.dna.secondaryKeywords, ...p.dna.narrativeReinforcements, p.assunto?.phrase || ""].filter(Boolean);
  /*
   * 2026-10-09 · 5 · O QUE A SKILL DE VOZ PROÍBE COMO ASSUNTO TAMBÉM É FORA DO
   * ESCOPO ("Não recomendar Instagram Shopping…"): pergunta, conceito, lacuna,
   * diferencial e seção M que o tocam não chegam à IA (ou chegam marcados para
   * descarte). A régua é a da voz (`radarBrandVoiceExclusionOf`, a mesma do CSV
   * para escrever), ao lado da régua do "não cobrir".
   */
  const exclusoesDaVoz = radarBrandVoiceExclusions(input.brandVoice);
  const tocaForaDoPacote = radarArticleBlueprintOutOfScopeMatcher(outOfScope, nucleo);
  /*
   * 2026-10-09b · AS EXCLUSÕES DOS REAJUSTES (ArticleDNA) SÃO DURAS: entram ao
   * lado da voz, nunca saem pela regra 3(a) (a planta anterior e a página
   * publicada não as liberam: a decisão é do Arquiteto).
   */
  const exclusoesDoDna = radarResearchContextScopeExclusions(entrada.researchContext);
  const tocaExclusaoDoDna = radarArticleBlueprintOutOfScopeMatcher(exclusoesDoDna.map(item => item.label), nucleo);
  const tocaFora = (valor: string | null | undefined) => tocaForaDoPacote(valor) || Boolean(radarBrandVoiceExclusionOf(valor, exclusoesDaVoz)) || tocaExclusaoDoDna(valor);

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
  /* 2026-10-09 · Defeito 2 · o D diz "de M" como C, G e P, quando a base está alinhada à amostra do modelo (o número dele já está nela). */
  const deMDaBase = p.base?.aligned ? ` de ${p.base.size}` : "";
  /* 2026-10-09 · regra 6 no pedido: o "diferencial" que só repete a principal ou uma complementar não chega à IA como diferencial (o "Sustentar" legado saiu do CSV). */
  for (const item of p.serp.differentiations.slice(0, 6)) {
    if (!tocaFora(item.subject) && !radarSuggestionRestatesKeyword(item.subject, nucleo)) add("D", "diferencial possível", `${item.subject} (${item.pagesCovering}${deMDaBase} páginas cobrem)`);
  }
  for (const item of serp?.features?.videos || []) add("Y", "vídeo na SERP", `${item.title || "vídeo"} · ${item.url}`);
  if (serp?.diagnostic) {
    if (serp.diagnostic.dominantFormats.length) add("F", "formato dominante", serp.diagnostic.dominantFormats.join(", "));
    for (const oportunidade of serp.diagnostic.opportunities.slice(0, 4)) add("O", "oportunidade da SERP", oportunidade);
  }
  /* 2026-10-02 · as lentes (desktop e mobile, por exemplo): o que muda entre elas no topo. */
  const lentesDaPrincipal = p.lentes?.keywords.find(item => item.role === "principal") || p.lentes?.keywords[0];
  if (lentesDaPrincipal?.divergence.statement) add("L", "lentes da SERP", lentesDaPrincipal.divergence.statement);
  /*
   * 2026-10-09b · A SHORTLIST E OS CRITÉRIOS DA AMAZON CONGELADA, citáveis (Z e
   * Q): a seção que apresenta um produto ou compara por um critério cita o id
   * em evidence. Sem bloco comercial, nada entra (o pedido é o de antes).
   */
  const comercial = input.commercial ?? null;
  if (comercial) {
    for (const produto of comercial.products) add("Z", "produto da shortlist da Amazon congelada", `${produto.name} (ASIN ${produto.asin})${produto.placement ? ` · onde: ${produto.placement}` : ""}${produto.signals?.length ? ` · sinais da prateleira: ${produto.signals.slice(0, 3).join("; ")}` : ""}`);
    for (const criterio of comercial.criteria) add("Q", "critério de comparação da Amazon congelada", criterio);
  }

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
    /* 2026-10-08 (correção) · F1 · o irmão que já está no ar é destino publicado, com a URL (não "planejado"). */
    const publicacaoDoMembro = input.siloPublications?.get(membro.articleId) ?? null;
    const noAr = publicacaoDoMembro?.published ? t(publicacaoDoMembro.publishedUrl) || t(publicacaoDoMembro.canonical) : "";
    linkCandidates.push({
      id: `K${linkCandidates.length + 1}`,
      label: rotulo,
      role: membro.role,
      destination: noAr || (membro.slug ? `/${membro.slug}` : null),
      status: noAr ? "PUBLISHED" : membro.slug ? "PLANNED" : "UNRESOLVED",
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
  const promessaDoEsqueleto = radarArticleBlueprintPromiseWithoutFrame(limpo(p.editorial.readerPromise));
  /* 2026-10-09 (correção · contrato-F7) · os temas e o número de sites da mesma base (o que o CSV diz). */
  const temasDosConcorrentes = radarWritingCompetitorTopicsOf(input.entrada, p);
  /*
   * 2026-10-09 · as réguas da estrutura legada do CSV (retórica, ruído de
   * cabeçalho pela unidade, pergunta que toca o "não cobrir") valem no esqueleto
   * do gerador. O fora do escopo da SEÇÃO segue a régua da conferência da planta
   * (a larga, de 2026-10-02): a seção M que toca o "não cobrir" chega marcada.
   */
  const secoesDaSerp = esqueletoDaSerp(p.editorial.sections, tocaFora, { unidade: p.unidade, ruido: p.ruido, perfil: p.perfil });
  return {
    article: {
      principal,
      complementary: [
        ...p.dna.secondaryKeywords.map(keyword => ({ keyword, role: "secundária" })),
        ...p.dna.narrativeReinforcements.map(keyword => ({ keyword, role: "reforço narrativo" })),
      ].filter(item => radarWritingCompareKey(item.keyword) !== radarWritingCompareKey(principal))
        .map(item => ({ ...item, volume: volume.get(radarWritingCompareKey(item.keyword)) ?? null })),
      subject: p.assunto?.phrase ?? null,
      ...(p.assunto?.destinationUrl ? { subjectDestination: radarWritingCleanUrl(p.assunto.destinationUrl) } : {}),
      ...(p.assunto?.note ? { subjectNote: p.assunto.note } : {}),
      ...(p.assunto ? radarArticleBlueprintSubjectTurnOf(p.assunto.turn ?? null, principal) : {}),
      intent: t(p.dna.intent) || null,
      funnel: t(p.dna.funnel) || null,
      siloRole: papelDoArtigo,
      audience: t(entrada.article.audience) || null,
      /* 2026-10-09 · 12 · a moldura "Cobrir com clareza o tema …" não é promessa: sai (só ela: null, e a IA parte do leitor e da intenção). */
      promise: radarArticleBlueprintPromiseWithoutFrame(entrada.article.promise) || null,
      slug: t(publicacao?.slug) || t(entrada.article.slug) || null,
      publishedUrl: publicacao?.published || entrada.article.publishedProtected ? t(publicacao?.publishedUrl) || t(entrada.article.canonical) || null : null,
      mustCover: p.dna.mustCover,
      unit: unidadeDe(entrada, p.editorial.editorialOutput),
    },
    silo: input.silo && input.silo.kind === "silo"
      ? { label: input.silo.label, centralEntity: input.silo.centralEntity, excludedTopics: input.silo.excludedTopics }
      : null,
    /* 2026-10-09 · 5 · o tema dos concorrentes que toca o fora do escopo (ou a exclusão da voz) chega marcado para descarte, como a seção M. */
    /* 2026-10-09b · com a Amazon congelada, as seções genéricas da forma comercial entram como M (matéria-prima), antes dos temas dos concorrentes. */
    skeleton: esqueletoComTemas(esqueletoComComercial(secoesDaSerp, comercial?.skeleton), temasDosConcorrentes?.topics || [], temasDosConcorrentes?.sampleDomains ?? null)
      .map(item => (item.outOfScope || !tocaFora(item.heading) ? item : { ...item, outOfScope: true })),
    skeletonFrame: {
      workingTitle: limpo(p.editorial.title) || null,
      /* 2026-10-09 · 12 · a promessa do esqueleto também chega sem a moldura. */
      promise: promessaDoEsqueleto ? corte(promessaDoEsqueleto, L.textChars) : null,
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
    /* 2026-10-09 · Defeito 2 · as medidas saem da base única (as comparáveis do modelo, sem o teto de 20 da coluna JSON); sem base, da lista de antes. */
    measures: radarArticleBlueprintMeasures(p.base ? p.base.pages.map(item => item.structure) : (p.concorrentes?.competitors || []).filter(item => item.comparable).map(item => item.structure)),
    authors: entrada.authors ? entrada.authors.map(autor => ({ name: autor.name, specialty: autor.specialty, source: autor.source })) : null,
    brandVoice: input.brandVoice ? { ref: radarBrandVoiceRef(input.brandVoice), excerpts: vozCompacta(input.brandVoice) } : null,
    /* 2026-10-08 · B1 · a página publicada, quando a geração a leu; sem ela, a chave não existe e o pedido é o de antes. */
    ...(estruturaPublicada ? { publishedStructure: estruturaPublicada } : {}),
    /* 2026-10-09 · 5 · as exclusões da voz, para o pedido e a conferência; sem nenhuma, a chave não existe. */
    ...(exclusoesDaVoz.length ? { voiceExclusions: exclusoesDaVoz } : {}),
    /* 2026-10-09b · as exclusões dos reajustes (ArticleDNA), duras; sem nenhuma, a chave não existe. */
    ...(exclusoesDoDna.length ? { dnaExclusions: exclusoesDoDna } : {}),
    /* 2026-10-09b · o bloco comercial da Amazon congelada (a shortlist e os critérios já estão nas evidências Z e Q; o esqueleto, nas seções M). */
    ...(comercial
      ? {
        commercial: {
          frozenAt: comercial.frozenAt, format: comercial.format, desiredCount: comercial.desiredCount, rankingCriteria: comercial.rankingCriteria,
          useCase: comercial.useCase, productClass: comercial.productClass, brandFilter: comercial.brandFilter,
          disclosureRequired: comercial.disclosureRequired, shortlistNote: comercial.shortlistNote,
          ...(comercial.priceBands?.length ? { priceBands: comercial.priceBands } : {}),
          ...(comercial.rules?.length ? { rules: comercial.rules } : {}),
          ...(comercial.limitations?.length ? { limitations: comercial.limitations } : {}),
          products: comercial.products.length, criteria: comercial.criteria.length,
        },
      }
      : {}),
  };
}

/**
 * 2026-10-09b · A EXCLUSÃO DO ARTICLEDNA QUE O TEXTO TOCA — rótulo a rótulo, pela
 * régua única do "não cobrir" (`radarOutOfScopeMatcher`), para a nota dizer qual
 * e de quem é. Sem exclusão, nunca toca.
 */
export function radarArticleBlueprintDnaExclusionOf(
  exclusoes: readonly RadarResearchScopeExclusion[] | null | undefined,
  nucleo: readonly string[],
): (valor: string | null | undefined) => RadarResearchScopeExclusion | null {
  const porRotulo = (exclusoes || []).map(item => ({ item, toca: radarOutOfScopeMatcher({ labels: [item.label], core: nucleo }) }));
  if (!porRotulo.length) return () => null;
  return valor => porRotulo.find(({ toca }) => toca(valor))?.item ?? null;
}

/** 2026-10-09b · A exclusão do ArticleDNA dita ao leitor do pedido, do CSV e da nota: o rótulo e, quando a nota diz, o artigo dono. */
export const radarArticleBlueprintDnaExclusionText = (item: Pick<RadarResearchScopeExclusion, "label" | "owner">): string =>
  `"${item.label.replace(/^["“]|["”]$/g, "")}" (exclusão do ArticleDNA, decidida no Arquiteto${item.owner ? `: é do artigo "${item.owner.replace(/^["“]|["”]$/g, "")}"` : ""})`;

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
    /* 2026-10-09b · com o bloco comercial, a shortlist (Z) e os critérios (Q) também são citáveis. */
    `1. Use só o que está no pacote. Cite pelos ids dados (M, S, P, B, A, C, G, D, Y, F, O, L${brief.commercial ? ", Z, Q" : ""}). Nunca invente id, número, estudo, autor, depoimento ou URL.`,
    "2. A SERP manda na intenção (Google e respostas de IA): responda a intenção que a busca mostra, com o recorte do leitor da marca. Se a amostra for de outro público, diga como adaptar ao leitor.",
    "3. Dê sentido a TODAS as keywords: onde cada uma entra (H1, H2, H3, corpo) e por quê, sem forçar repetição. O H1 traz a keyword principal inteira, em frase natural.",
    "4. ORGANIZE O ESQUELETO: cada seção diz de onde vem no campo \"from\" (ids M do esqueleto e/ou ids de evidência). Pode renomear, reordenar, juntar e descartar seções M — o descarte vai em \"discarded\" com o motivo (se o motivo cita a seção que cobre o assunto, cite-a pelo título do H2, nunca pelo número). Só acrescente seção nova quando uma evidência (P, C, G, D, B, A, O) a sustenta, e cite-a. Não cubra o que está em 'fora do escopo'. Sem seção de perguntas frequentes (FAQ): as perguntas entram nas seções.",
    "5. Cada seção abre respondendo a pergunta dela (resposta clara, citável por IA), depois explica. Negrito só em termo ou entidade, nunca frase inteira.",
    /* 2026-10-09 · 10 · o CTA que cita a página comercial leva o link dela, na seção que fecha o artigo. */
    "6. Links internos: só para os candidatos K dados, com âncora natural e o motivo. Inclua o link para o Pilar quando o artigo for Suporte e para a SiloPage quando houver. Distribua pelas seções certas. Quando o CTA cita a página comercial da marca (o candidato 'Página da marca'), o link para ela entra no plano, na ÚLTIMA seção (a que fecha o artigo), com a âncora que o CTA usa.",
    /* 2026-10-09 · 8 · pseudo-afirmação (rótulo de tema) não é afirmação a sustentar. */
    "7. Links externos: só onde uma afirmação precisa de reforço; use a fonte X quando existir; sem fonte X, source = null (o redator vai obter uma fonte oficial). claim é a FRASE afirmativa que o texto vai dizer, com sujeito e verbo ('O algoritmo do Instagram prioriza…'), nunca rótulo de tema ('Estatísticas sobre conversão de leads', 'Passos para gerar leads', 'Definição de lead conforme fontes do setor'): sem afirmação a sustentar, não há link externo.",
    /* 2026-10-08 · B2: a abertura e a 1ª seção respondem à busca; a tese da marca vem depois. */
    "8. Abertura: a dúvida real do leitor sobre a keyword principal (nunca pergunta retórica de concorrente nem pergunta de outro assunto); outro canal ou assunto vizinho entra depois, numa seção. A abertura e a 1ª seção respondem à intenção da keyword principal: quando ela é 'como …', a 1ª seção já é prática (o caminho, o primeiro passo); a tese ou o contraponto da marca vem depois, sem negar o assunto do artigo. A evidência da abertura responde à mesma pergunta. Fechamento e CTA na voz do especialista (id E) quando houver. UM CTA SÓ: closing.cta é a única chamada do artigo; o próximo artigo do Silo não é uma segunda chamada no fim: se couber, ele é mencionado no corpo da última seção que trata do assunto dele (com o link K dele só se ele for candidato) e nextStep fica null.",
    /* 2026-10-08 · B5: o plano visual segue a voz e não repete a cena. P1 (caso real do Instagram): âncora pelo título; antes e depois, resultado clínico e promessa visual proibidos. */
    "9. Plano visual: exatamente uma CAPA e 2 ou 3 respiros (R1, R2, R3), cada respiro ligado a uma seção pelo TÍTULO: em section, o H2 da seção como você o escreveu (nunca o número da seção), e a mesma vaga no campo image dessa seção; uma imagem por seção. Prompt de imagem de até 400 caracteres, ALT e legenda. O prompt termina com a proporção (capa 16:9, respiro 4:3, salvo outra indicação da voz da marca). Sem marca de terceiros. PROIBIDO em qualquer imagem (prompt, conceito, ALT e legenda), mesmo quando a seção fala de prova social: antes e depois ('antes/depois'), resultado clínico ou de procedimento e promessa visual de resultado ('resultados reais', resultado garantido, pele perfeita); a imagem explica a ideia da seção, não prova resultado. Sem texto legível na imagem: se ela precisa mostrar interface (perfil, enquete, botão), peça elementos genéricos sem texto legível; diagrama, funil ou comparação com rótulos vira ilustração em SVG (diga no conceito). Nunca tela fictícia de resultado (ranking, métricas, avaliações) como se fosse prova. Cada imagem tem cena diferente: não repita a mesma pessoa na mesma situação, nem o mesmo sujeito com o mesmo objeto em duas imagens (ex.: profissional com celular na capa e num respiro). O que a voz da marca manda evitar nas imagens não entra em prompt nenhum.",
    "10. Não copie títulos nem frases de concorrentes. URL, slug e canonical publicados não mudam.",
    `11. Medidas: use como referência os concorrentes comparáveis (${m.comparablePages} páginas): ${m.words.median ? `mediana de ${m.words.median} palavras (P25 ${m.words.p25}, P75 ${m.words.p75})` : "palavras não medidas"}, H2 ${m.h2 ?? "?"}, H3 ${m.h3 ?? "?"}, parágrafos ${m.paragraphs ?? "?"}, imagens ${m.images ?? "?"}. Supere em profundidade útil, não em enchimento.`,
    "12. VOZ DA MARCA: quando o pacote trouxer os trechos da Skill de voz, eles mandam na forma: promessa, H1, títulos, abertura, CTA, transição comercial, vocabulário e prompts de imagem seguem a Skill; o que ela proíbe não entra. O CTA usa a oferta da Skill e, se couber, o candidato 'Página da marca'. A Skill não muda keyword, intenção nem escopo do artigo. O que a Skill proíbe como assunto (em 'Fora do escopo', marcado 'exclusão da voz da marca') não entra em seção, H3, pergunta, diferencial, ângulo nem demonstração, nem como 'o que os concorrentes cobrem'.",
    /* 2026-10-02 · Adendo B (D6): a regra só entra quando algum vídeo tem modo; sem modo, o pedido é o de antes. */
    ...(brief.videos.some(item => item.usage)
      ? ["13. VÍDEOS DA MARCA (id V): o modo de uso de cada um é decisão do dono e manda. Incorporar: o vídeo pode virar uma seção com ele incorporado (campo video da seção). Citação: fala literal, entre aspas, atribuída ao vídeo e com o tempo. Apoio: o trecho sustenta um ponto, atribuído ao vídeo e com o tempo. Contexto: só para entender o assunto; NÃO é citável e não vai no campo video. Sugestão de pauta: ideia de seção ou pergunta a validar contra a SERP; não é citável e não vai no campo video. Vídeo marcado 'Não usar' não está no pacote e não entra."]
      : []),
    `14. TIPO DA UNIDADE: a planta segue o tipo (aqui: ${a.unit.label}${a.unit.format ? `, formato ${a.unit.format}` : ""}). Guia ou artigo responde e ensina; review ou comparativo traz critérios, prós e contras e veredito; landing page ou página de serviço traz problema, oferta, prova, objeções e CTA; SiloPage apresenta o tema e distribui para os artigos do Silo.`,
    "15. AUTORIA (E-E-A-T): quando o pacote disser quem assina, o eeat cita essa pessoa pelo nome cadastrado, sem credencial além do cadastro; sem quem assine, diga em eeat que falta definir.",
    `16. TAMANHO: no máximo ${L.sections} seções, ${L.h3} H3 por seção e ${L.explain} itens em explain; uma frase por campo de texto. A resposta inteira cabe em ~4 mil tokens.`,
    /* 2026-10-08 · B3: a regra fala do SENTIDO (efeito comercial, comportamento, plataforma) e da polaridade, como a régua `radarSentenceNeedsSource`. */
    "17. AFIRMAÇÕES: answerFirst e explain não transformam a dificuldade do leitor em regra universal ('foi desenhado para', 'nunca', 'sempre', 'raramente', 'pacientes prontos para comprar') sem evidência citada. Afirmar como fato um efeito comercial ('converte', 'canais que convertem', 'gera agendamentos', 'traz pacientes', 'enche a agenda'), o comportamento do público ('pacientes procuram no Google, não no Instagram') ou o funcionamento de plataforma ou algoritmo pede fonte X do pacote; sem ela, escreva de forma delimitada (orientação, possibilidade, experiência da marca) e registre a afirmação em externalLinks com source = null. A tese da marca que NEGA um efeito ('o Instagram, sozinho, não enche a agenda') pode ser dita. Não prescreva gratuidade, urgência, oferta exclusiva, condição especial, depoimento nem antes/depois como receita: só se a voz da marca e o pacote sustentarem.",
    "19. UMA ENTREGA POR SEÇÃO: cada seção entrega algo diferente ao leitor (diagnóstico, ajuste, conteúdo, próximo passo, alternativa…); duas seções não tratam do mesmo assunto com nomes diferentes ('como usar de forma estratégica' e 'estratégias práticas' são a mesma). O conteúdo prático chega cedo, logo depois do diagnóstico. Cada H2 responde uma pergunta DIFERENTE do leitor: estratégias, aplicação e um canal do mesmo assunto não são três seções (uma seção que já trata do canal nos H3 ou no explain não ganha outra só para ele). Um H3 nunca repete o H2 de outra seção (nem um H2 da página publicada que virou seção própria).",
    /* 2026-10-09 · 9 · a demonstração não atribui resultado a um caso sem fonte. */
    "20. DEMONSTRAÇÃO E PREMISSA: em seção que ensina a fazer, practical descreve a demonstração (ex.: um exemplo ilustrativo antes → o ajuste → depois), nunca uma cena decorativa. A demonstração mostra o ajuste, não um resultado: sem fonte X do pacote, nada de caso com resultado atribuído ('um consultório que otimizou o perfil e passou a receber mais ligações', 'uma clínica que dobrou os agendamentos'); escreva 'exemplo ilustrativo de como …, sem resultado atribuído'. A promessa e o ângulo dizem o que o leitor aprende, sem regra universal: eles viram a premissa do vídeo, dos cortes e do carrossel.",
    "18. ORIGEM: cada id em from trata do assunto da seção. Não use a mesma seção M em seções de assuntos diferentes; seção comercial da marca (oferta, transição) vem da voz da marca e da evidência que a sustenta, sem fingir que veio de uma seção M.",
    /* 2026-10-08 · B1: a regra da página publicada só entra quando a geração leu a página (sem ela, o pedido é o de antes). */
    ...(brief.publishedStructure?.h2.length
      ? ["21. PÁGINA PUBLICADA (é atualização): a planta atualiza a página atual (H1 e H2 em '# Página publicada atual'). O que a página já cobre dentro do escopo e a amostra NÃO cobre é diferencial dela: fica na planta, numa seção ou num H3 (pode renomear e reordenar). Devolva publishedMap com TODOS os H2 atuais: { current: o H2 atual como está, section: o número da seção da planta que o absorve (1 = a primeira), reason }. section = null só quando o H2 sai da página (fora do escopo, repetido ou superado), com o motivo em reason."]
      : []),
    /* 2026-10-08 · B4 e B6: nomes atuais; o ângulo é a entrega concreta que a amostra não tem. */
    "22. NOMES ATUAIS: use o nome atual de produto e recurso ('Perfil da Empresa no Google', nunca 'Google Meu Negócio' nem 'Google My Business'), salvo quando o nome antigo faz parte da keyword.",
    "23. ÂNGULO E DIFERENCIAL: o ângulo diz a ENTREGA concreta que a amostra não tem (um exemplo comentado, um checklist de diagnóstico, uma comparação lado a lado…), nunca 'costurar dois temas que a maioria já cobre'. Em angle.evidence, cite só a evidência que sustenta esse diferencial (lacuna G, diferencial D, oportunidade O); não cite resultado orgânico só para preencher.",
    /* 2026-10-09 · 12 · a promessa sem a moldura do Arquiteto e um leitor só. */
    "24. UM LEITOR SÓ E A PROMESSA: reader é UM público, o declarado em 'Público' e o da voz da marca; nunca 'clínicas … e pacientes que procuram ofertas'. Quando a SERP liga uma keyword complementar a outro público (o consumidor procurando oferta ou cupom, por exemplo), ela vira menção enquadrada para o leitor declarado (ex.: 'sites de cupom: o que a clínica ganha e perde ao anunciar neles'), nunca um guia para o outro público. promise diz o que esse leitor sabe ou consegue fazer ao final, pela intenção da busca; nunca 'Cobrir com clareza o tema …' (essa é a moldura padrão do Arquiteto, não uma promessa).",
    /* 2026-10-09b · a regra de review só entra com o bloco comercial da Amazon congelada. */
    ...(brief.commercial
      ? ["25. REVIEW PELA AMAZON CONGELADA (bloco '# Bloco comercial'): a planta é também a review do formato declarado. Só os produtos Z da shortlist entram, nenhum outro; a seção (ou o H3) que apresenta um produto cita o id Z em evidence e, num ranking, os produtos vão um por seção ou H3, na ordem do critério declarado. Compare pelos critérios Q (cite o id), sem inventar critério. De cada produto: para quem serve, o que a coleta sustenta e o limite; nota, número de avaliações, preço e selo da loja são sinal da prateleira no dia da coleta, nunca prova de qualidade, e o que a coleta não mediu (texto das avaliações, ficha técnica, teste de uso) não é afirmado. O fechamento dá o veredito pelo critério declarado. Com aviso de afiliado obrigatório, a seção que apresenta o primeiro produto abre com ele (diga em explain). Link de produto não é link interno: internalLinks continua só com os candidatos K."]
      : []),
    /* 2026-10-09b · as exclusões que os reajustes gravaram no ArticleDNA. */
    ...(brief.dnaExclusions?.length
      ? ["26. EXCLUSÕES DO ARTICLEDNA: o que 'Fora do escopo' marca como 'exclusão do ArticleDNA' foi decidido no Arquiteto (reajuste do artigo): não entra em seção, H3, pergunta, explain, diferencial, ângulo nem demonstração, nem como 'o que os concorrentes cobrem'. Quando a exclusão é de outro artigo, o texto no máximo o menciona e linka para ele, se ele for candidato K."]
      : []),
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
    ...(a.subject ? [`Assunto (tronco): ${a.subject}${a.subjectNote ? ` — ${a.subjectNote.replace(/[.\s]+$/, "")}` : ""}${a.subjectDestination ? ` · destino da virada: ${a.subjectDestination} (o fechamento leva a ele)` : ""}`] : []),
    ...(a.subject && a.subjectTurn ? [`Virada do Assunto (leitura do Radar na SERP): ${a.subjectTurn}`] : []),
    ...(a.subject && a.subjectH1 ? [`H1 com o Assunto: ${a.subjectH1}`] : []),
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
    /* 2026-10-09 · 5 · a exclusão que vem da Skill de voz diz de onde vem (e vale também como diferencial, pergunta e H3). */
    /* 2026-10-09b · a exclusão do ArticleDNA (reajuste) também diz de onde vem e, quando a nota diz, o artigo dono. */
    ...linhas("Fora do escopo (não cobrir)", [
      ...brief.outOfScope,
      ...(brief.voiceExclusions || []).map(item => `${item.label} (exclusão da voz da marca)`),
      ...(brief.dnaExclusions || []).map(radarArticleBlueprintDnaExclusionText),
    ]),
    /* 2026-10-09b · o bloco comercial da Amazon congelada (a shortlist e os critérios estão nas evidências Z e Q). */
    ...(brief.commercial
      ? [
        `# Bloco comercial (Amazon congelada${brief.commercial.frozenAt ? ` em ${brief.commercial.frozenAt.slice(0, 10)}` : ""}; siga a regra 25)`,
        ...(brief.commercial.format ? [`Formato comercial: ${brief.commercial.format}${brief.commercial.desiredCount ? ` de ${brief.commercial.desiredCount}` : ""}`] : []),
        ...(brief.commercial.rankingCriteria ? [`Critério do ranking: ${brief.commercial.rankingCriteria}`] : []),
        ...(brief.commercial.useCase ? [`Necessidade de uso: ${brief.commercial.useCase}`] : []),
        ...(brief.commercial.productClass ? [`Tipo de produto comparado: ${brief.commercial.productClass}`] : []),
        ...(brief.commercial.brandFilter ? [`Marca exigida: ${brief.commercial.brandFilter}`] : []),
        brief.commercial.products
          ? `Shortlist congelada: ${brief.commercial.products} produto(s), nas evidências Z; critérios de comparação: ${brief.commercial.criteria}, nas evidências Q.`
          : `Shortlist congelada: nenhum produto; a planta não apresenta produto${brief.commercial.criteria ? ` (critérios de comparação nas evidências Q)` : ""}.`,
        ...(brief.commercial.shortlistNote ? [`Estado da shortlist: ${brief.commercial.shortlistNote}`] : []),
        ...(brief.commercial.disclosureRequired ? ["Aviso de afiliado: obrigatório, antes do primeiro link de produto."] : []),
        ...(brief.commercial.priceBands?.length ? [`Faixas de preço observadas (na coleta, não preço atual): ${brief.commercial.priceBands.map(item => `${item.label}: ${item.detail}`).join(" · ")}`] : []),
        ...(brief.commercial.rules?.length ? ["Regras da parte comercial:", ...brief.commercial.rules.map(item => `- ${item}`)] : []),
        ...(brief.commercial.limitations?.length ? [`O que a coleta da Amazon não mediu (não afirmar): ${brief.commercial.limitations.slice(0, 4).join(" · ")}`] : []),
        "",
      ]
      : []),
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
      /* 2026-10-09 · 10 · um CTA só: o próximo artigo vai no corpo, não numa segunda chamada. */
      closing: { turn: "", specialist: "E1", cta: "", nextStep: null },
      /* 2026-10-08 · P1 · o respiro aponta a seção pelo título do H2, nunca pelo número. */
      visual: [{ slot: "CAPA", section: null, concept: "", prompt: "", alt: "", caption: "" }, { slot: "R1", section: "o H2 da seção, como escrito em sections", concept: "", prompt: "", alt: "", caption: "" }],
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
        /* 2026-10-08 · P1 · a cena proibida e a âncora pelo título também voltam corrigidas. */
        "No plano visual: a imagem que pede antes e depois, resultado clínico ou promessa visual de resultado ganha outra cena, que explique a ideia da seção (prompt, conceito, ALT e legenda sem essas cenas), e cada respiro aponta a seção pelo título do H2.",
        /* 2026-10-09 · 11 e 12 · H2 sobrepostos e um leitor só também voltam corrigidos. */
        "E ainda: cada H2 responde uma pergunta diferente (junte as seções sobrepostas ou dê a cada uma a sua entrega), o leitor é um público só, e a seção que fala com quem compra é reescrita para o leitor declarado (o que o negócio ganha e perde com aquilo), nunca um guia para o consumidor.",
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
  /*
   * 2026-10-09b · `exclusions` (aditivo): as exclusões dos reajustes no
   * ArticleDNA. O H2 publicado que trata de um assunto que o Arquiteto tirou do
   * artigo sai, com o motivo (a decisão é do reajuste) — nunca fica como seção
   * própria nem é absorvido. Ausente = como antes.
   */
  opcoes: { keywords?: readonly string[]; exclusions?: { items: readonly RadarResearchScopeExclusion[]; core: readonly string[] } | null } = {},
): RadarArticleBlueprintPublishedMapReading[] {
  const excluida = radarArticleBlueprintDnaExclusionOf(opcoes.exclusions?.items, [...(opcoes.exclusions?.core || [])].map(item => t(item)).filter(Boolean));
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
    /* 2026-10-09b · o H2 publicado do assunto que o reajuste excluiu sai, com o motivo. */
    const exclusao = excluida(atual);
    if (exclusao) {
      const doMapa = mapa.findIndex((item, i) => !usados.has(i) && radarWritingCompareKey(item.current) === chave);
      if (doMapa >= 0) usados.add(doMapa);
      saida.push({ current: atual, kind: "REMOVED", section: null, sectionH2: null, after: null, reason: `o ArticleDNA exclui "${exclusao.label}" deste artigo (reajuste decidido no Arquiteto${exclusao.owner ? `; é do artigo "${exclusao.owner}"` : ""})`, origin: "ai" });
      continue;
    }
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
  /* 2026-10-09b · o H2 de assunto que o reajuste excluiu já diz de onde vem a decisão (o Arquiteto). */
  if (item.kind === "REMOVED") return `sai: ${item.reason}${/^o ArticleDNA exclui\b/.test(item.reason) ? "" : " (decisão no artigo-modelo)"}`;
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

/*
 * 2026-10-08 · P1 · A CENA PROIBIDA NO PLANO VISUAL (caso real do Instagram).
 *
 * O CSV real de 08/10 pedia no Respiro 2 "um antes e depois de um procedimento
 * estético, com foco em resultado", com a legenda "Conteúdo que mostra
 * resultados reais ajuda na conversão" — e a voz da marca, no próprio
 * "Evitar", proíbe antes e depois e promessas clínicas (a regra 9 do pedido já
 * dizia "sem antes/depois"). Três famílias, em português e inglês:
 *   - antes e depois ("antes/depois", "antes x depois", "before and after");
 *   - resultado clínico (de procedimento, de tratamento, estético);
 *   - promessa visual de resultado ("resultados reais", resultado garantido,
 *     "pele perfeita", promessa clínica).
 * A menção NEGADA passa ("Evitar … antes e depois e promessas clínicas", "sem
 * antes e depois", "Evitar: antes e depois"): a negação vale na oração (ponto,
 * ponto e vírgula e dois-pontos a fecham), até uma vírgula ou um "e" seguidos
 * de verbo que mostra ou de "com" ("Sem texto legível, mostrando um antes e
 * depois" e "Sem logotipos, com antes e depois" são pedidos). A
 * keyword do artigo que traz o termo ("retinol … antes e depois") é o assunto,
 * não a cena: sai do texto antes da leitura.
 */
export type RadarArticleBlueprintForbiddenScene = "ANTES_E_DEPOIS" | "RESULTADO_CLINICO" | "PROMESSA_VISUAL";
export const RADAR_ARTICLE_BLUEPRINT_FORBIDDEN_SCENE_LABEL: Readonly<Record<RadarArticleBlueprintForbiddenScene, string>> = Object.freeze({
  ANTES_E_DEPOIS: "antes e depois",
  RESULTADO_CLINICO: "resultado clínico",
  PROMESSA_VISUAL: "promessa visual de resultado",
});
const CENAS_PROIBIDAS: ReadonlyArray<readonly [RadarArticleBlueprintForbiddenScene, RegExp]> = [
  /* 2026-10-08 (correção) · F10 · "antes e após" e "antes/após" (comuns em prompt de imagem) também. */
  ["ANTES_E_DEPOIS", /\bantes\s*(?:e|x|\/|&|-|–|—|vs\.?|versus)\s*(?:o\s+)?(?:depois|apos)\b|\bbefore[\s-]*(?:and|&|\/|-)[\s-]*after\b/g],
  ["RESULTADO_CLINICO", /\bresultados?\s+(?:clinic\w*|estetic\w*|(?:d[oae]s?|de\s+(?:um|uma))\s+(?:procedimentos?|tratamentos?|harmonizac\w*|preenchimentos?|botox|cirurgi\w*|peelings?|laser))\b|\b(?:clinical|treatment|aesthetic|cosmetic|procedure)\s+results?\b|\bresults?\s+of\s+(?:a\s+|the\s+)?(?:procedures?|treatments?)\b/g],
  ["PROMESSA_VISUAL", /\bpromessas?\s+(?:clinic\w*|estetic\w*|de\s+(?:resultado|cura)\w*)\b|\bgarantia\s+de\s+resultado\w*|\bresultados?\s+(?:garantid\w*|reais|real|comprovad\w*|imediat\w*)\b|\b(?:guaranteed|real)\s+results?\b|\b(?:pele|corpo|rosto)\s+perfeit[oa]s?\b/g],
];
const NEGA_A_CENA = /\b(?:sem|evit\w*|nao|nunca|jamais|nada\s+de|nenhum\w*|proib\w*|exceto|without|avoid\w*|never)\b/g;
/* "Evitar: antes e depois" é a lista do que evitar; fora disso, os dois-pontos abrem outra oração ("O Instagram não converte: antes e depois…"). */
const NEGA_COM_DOIS_PONTOS = /\b(sem|evit\w*|nao|nunca|proib\w*|exceto|without|avoid\w*|never)\s*:/g;
/* Depois da negação, a vírgula ou o "e" seguidos de verbo que mostra (ou de "com") voltam a pedir a cena: "Sem texto legível, mostrando…", "Não use texto e mostre…". */
const MOSTRA_A_CENA = /(?:,|\b(?:e|mas|porem|and|but)\b)\s*(?:com\b|[^,]*?\b(?:mostr\w*|exib\w*|apresent\w*|retrat\w*|show\w*|display\w*|featur\w*|depict\w*|portray\w*)\b)/;

/*
 * 2026-10-08 (correção) · R8 · A CENA DE MARKETING NÃO É CENA CLÍNICA. O Silo é
 * de Instagram e marketing: "o feed antes e depois da estratégia de conteúdo" e
 * "o dashboard com resultados reais de alcance" falam de métrica, não de
 * procedimento. Antes e depois e promessa visual só valem como proibidos com
 * contexto clínico ou estético no texto (pele, rosto, procedimento, paciente,
 * tratamento…) ou sem objeto de marketing (feed, perfil, campanha, métrica,
 * dashboard…). "Exemplo de post com antes e depois" continua proibido.
 */
const CONTEXTO_CLINICO = /\b(?:pele|rosto|face|facial|corpo|corporal|procediment\w*|pacientes?|tratament\w*|harmoniza\w*|botox|toxina|preenchiment\w*|cirurgi\w*|peelings?|laser|acne|rugas?|manchas?|cicatriz\w*|skin|patients?|treatments?|procedures?|surgery)\b/;
const OBJETO_DE_MARKETING = /\b(?:feed|perfil|perfis|campanhas?|metricas?|dashboards?|painel|paineis|graficos?|alcance|engajamento|seguidores|impressoes|cliques|estrategia\s+de\s+conteudo|insights?|analytics)\b/;
const cenaDeMarketing = (cena: RadarArticleBlueprintForbiddenScene, lido: string) =>
  cena !== "RESULTADO_CLINICO" && !CONTEXTO_CLINICO.test(lido) && OBJETO_DE_MARKETING.test(lido);

/** 2026-10-08 · P1 · A primeira cena proibida que o texto PEDE (a negada passa), ou null. `keywords`: as do artigo, que são assunto e não cena. */
export function radarArticleBlueprintForbiddenScene(texto: string | null | undefined, keywords: readonly string[] = []): RadarArticleBlueprintForbiddenScene | null {
  let lido = semAcento(t(texto)).replace(/\s+/g, " ").replace(NEGA_COM_DOIS_PONTOS, "$1 ");
  if (!lido) return null;
  for (const keyword of keywords) {
    const chave = semAcento(t(keyword)).replace(/\s+/g, " ");
    if (chave.length >= 3) lido = lido.split(chave).join(" ");
  }
  for (const [cena, regra] of CENAS_PROIBIDAS) {
    if (cenaDeMarketing(cena, lido)) continue;
    for (const achado of lido.matchAll(regra)) {
      const inicio = achado.index ?? 0;
      const oracao = lido.slice(0, inicio).split(/[.;:!?\n]/).pop() || "";
      const negacoes = [...oracao.matchAll(NEGA_A_CENA)];
      const ultima = negacoes[negacoes.length - 1];
      const negada = ultima && !MOSTRA_A_CENA.test(oracao.slice((ultima.index ?? 0) + ultima[0].length));
      if (!negada) return cena;
    }
  }
  return null;
}

/*
 * 2026-10-08 (correção) · F6 · A CENA PROIBIDA NO TEXTO DA PLANTA. O plano
 * visual já saía sem antes e depois, mas a estrutura do CSV do Instagram
 * mandava escrever "Publique conteúdo que ajude o paciente a decidir, como
 * antes e depois, depoimentos e explicações de procedimentos" — o texto pedia
 * o que a imagem evita e a voz da marca proíbe. No texto, só a família antes e
 * depois (resultado do procedimento é assunto legítimo de texto). Sai só o
 * trecho da cena quando ela é item de lista ("como antes e depois,
 * depoimentos…" → "como depoimentos…"); quando ela é o núcleo da frase, a
 * frase inteira sai. `null` = nada utilizável sobrou.
 */
/** 2026-10-08 (correção) · F6 · A resposta da seção que era só a cena proibida: a instrução concluída. */
const RESPOSTA_SEM_CENA = "Responda a pergunta do leitor desta seção em uma ou duas frases, sem antes e depois nem promessa de resultado.";

export function radarArticleBlueprintTextForbiddenScene(texto: string | null | undefined, keywords: readonly string[] = []): RadarArticleBlueprintForbiddenScene | null {
  const cena = radarArticleBlueprintForbiddenScene(texto, keywords);
  return cena === "ANTES_E_DEPOIS" ? cena : null;
}

export function radarArticleBlueprintTextWithoutForbiddenScene(texto: string, keywords: readonly string[] = []): string | null {
  if (!radarArticleBlueprintTextForbiddenScene(texto, keywords)) return texto;
  const frases = t(texto).normalize("NFC").split(/(?<=[.!?])\s+/);
  const ficam = frases.flatMap(frase => {
    if (!radarArticleBlueprintTextForbiddenScene(frase, keywords)) return [frase];
    const lido = semAcento(frase);
    if (lido.length !== frase.length) return [];
    const regra = new RegExp(CENAS_PROIBIDAS[0][1].source, "g");
    /* A keyword que traz o termo é assunto: o trecho dentro dela fica. */
    const daKeyword = keywords.map(keyword => semAcento(t(keyword)).replace(/\s+/g, " ")).filter(chave => chave.length >= 3)
      .flatMap(chave => [...lido.matchAll(new RegExp(chave.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g"))].map(achado => [achado.index ?? 0, (achado.index ?? 0) + chave.length] as const));
    const achados = [...lido.matchAll(regra)].filter(achado => !daKeyword.some(([de, ate]) => (achado.index ?? 0) >= de && (achado.index ?? 0) < ate));
    let saida = frase;
    for (const achado of achados.reverse()) {
      const inicio = achado.index ?? 0;
      const fim = inicio + achado[0].length;
      const antes = saida.slice(0, inicio);
      const depois = saida.slice(fim);
      if (/^\s*,\s*/.test(depois)) saida = antes + depois.replace(/^\s*,\s*/, "");
      else if (/(?:\s*,\s*|\s+(?:e|ou|and|or)\s+)$/i.test(antes)) saida = antes.replace(/(?:\s*,\s*|\s+(?:e|ou|and|or)\s+)$/i, "") + depois;
      else return [];
    }
    saida = saida.replace(/\s{2,}/g, " ").replace(/\s+([,.;:!?])/g, "$1").trim();
    return radarArticleBlueprintTextForbiddenScene(saida, keywords) || saida.split(/\s+/).length < 3 ? [] : [saida];
  });
  return ficam.length ? ficam.join(" ") : null;
}

/*
 * 2026-10-08 · P1 · A SEÇÃO DE CADA IMAGEM, PELO TÍTULO.
 *
 * O CSV real apontava respiros para as seções "5" e "8" de uma planta com seis
 * H2 — e o export ainda intercala os H2 da página publicada que ficam como
 * seção própria: o número nunca bate com o que quem escreve conta. A âncora é o
 * TÍTULO, resolvido nesta ordem:
 *   1. a seção que declara a vaga (`image`) — viaja com a seção quando a
 *      planta é reordenada ou perde uma seção;
 *   2. o que a IA escreveu em `section`: número (na ordem DELA, via `numero`;
 *      sem ele, na ordem da planta), título igual ao H2, H2 da página publicada
 *      (o absorvido leva à seção que o absorve; o que fica como seção própria é
 *      a âncora) e, por fim, o casamento de títulos;
 *   3. o respiro sem par vai à primeira seção sem imagem a partir da 2ª (a
 *      capa abre o artigo).
 * Uma imagem por seção: a seção que já tem imagem (declarada ou resolvida) não
 * recebe outra. A capa sem par fica sem seção.
 */
export type RadarArticleBlueprintVisualAnchor = {
  slot: string;
  /** 0 = a primeira seção da planta; null quando a âncora é um H2 publicado que fica como seção própria, ou quando não há âncora. */
  section: number | null;
  /** O título da âncora: o H2 da seção da planta ou o H2 publicado que fica. null = sem âncora (a capa abre o artigo). */
  title: string | null;
  by: "image" | "title" | "number" | "spread" | null;
};

export function radarArticleBlueprintVisualAnchors(
  secoes: ReadonlyArray<{ h2: string; readerQuestion?: string | null; h3?: readonly string[] | null; image?: string | null }>,
  visual: ReadonlyArray<{ slot: string; section?: string | null }>,
  opcoes: { mapa?: readonly RadarArticleBlueprintPublishedMapReading[]; comuns?: ReadonlySet<string>; numero?: (numero: number) => number } = {},
): RadarArticleBlueprintVisualAnchor[] {
  const vaga = (valor: string | null | undefined) => t(valor).toUpperCase();
  const saida: RadarArticleBlueprintVisualAnchor[] = visual.map(item => ({ slot: vaga(item.slot), section: null, title: null, by: null }));
  const vagasDoPlano = new Set(saida.map(item => item.slot));
  const ocupadas = new Set<number>();
  const publicadasUsadas = new Set<string>();
  const declaradaPorOutra = (indice: number, slot: string) => {
    const imagem = vaga(secoes[indice]?.image);
    return Boolean(imagem) && imagem !== slot && vagasDoPlano.has(imagem);
  };
  const livre = (indice: number, slot: string) => indice >= 0 && indice < secoes.length && !ocupadas.has(indice) && !declaradaPorOutra(indice, slot);
  const ancorar = (ancora: RadarArticleBlueprintVisualAnchor, indice: number, by: RadarArticleBlueprintVisualAnchor["by"]) => {
    ocupadas.add(indice);
    Object.assign(ancora, { section: indice, title: secoes[indice].h2, by });
  };
  /* 1 · a seção que declara a vaga. */
  for (const ancora of saida) {
    const indice = secoes.findIndex((secao, i) => vaga(secao.image) === ancora.slot && !ocupadas.has(i));
    if (ancora.slot && indice >= 0) ancorar(ancora, indice, "image");
  }
  /* 2 · o que a IA escreveu em `section`. */
  const mapa = opcoes.mapa || [];
  const titulos = secoes.map(secao => [secao.h2, secao.readerQuestion || "", ...(secao.h3 || [])].join(" "));
  saida.forEach((ancora, posicao) => {
    if (ancora.by) return;
    const referencia = t(visual[posicao].section);
    if (!referencia) return;
    const numero = referencia.match(/^(?:se[cç][aã]o\s*)?(\d{1,2})$/i);
    if (numero) {
      const indice = opcoes.numero ? opcoes.numero(Number(numero[1])) : Number(numero[1]) - 1;
      if (livre(indice, ancora.slot)) ancorar(ancora, indice, "number");
      return;
    }
    const chave = radarWritingCompareKey(referencia);
    const igual = secoes.findIndex(secao => radarWritingCompareKey(secao.h2) === chave);
    if (igual >= 0) {
      if (livre(igual, ancora.slot)) ancorar(ancora, igual, "title");
      return;
    }
    const naPagina = mapa.find(item => radarWritingCompareKey(item.current) === chave) ?? mapa[casarTitulo(referencia, mapa.map(item => item.current), new Set())];
    if (naPagina?.kind === "ABSORBED" && naPagina.section && livre(naPagina.section - 1, ancora.slot)) {
      ancorar(ancora, naPagina.section - 1, "title");
      return;
    }
    if (naPagina?.kind === "KEEP" && !publicadasUsadas.has(naPagina.current)) {
      publicadasUsadas.add(naPagina.current);
      Object.assign(ancora, { section: null, title: naPagina.current, by: "title" });
      return;
    }
    const casada = casarTitulo(referencia, titulos, opcoes.comuns ?? new Set());
    if (livre(casada, ancora.slot)) ancorar(ancora, casada, "title");
  });
  /* 3 · o respiro sem par: a primeira seção sem imagem a partir da 2ª. */
  for (const ancora of saida) {
    if (ancora.by || !ancora.slot.startsWith("R")) continue;
    const indices = secoes.map((_secao, indice) => indice);
    const indice = [...indices.slice(1), ...indices.slice(0, 1)].find(i => livre(i, ancora.slot));
    if (indice !== undefined) ancorar(ancora, indice, "spread");
  }
  return saida;
}

/*
 * 2026-10-08 (correção) · F7 · "SEÇÃO N" NO MOTIVO DO DESCARTE. A IA justificava
 * o descarte pelo índice ("já coberta na seção 5", "abordado na seção 8") — e,
 * como no plano visual, o número não bate com a estrutura que sai (o CSV do
 * Instagram tem seis H2 e citava a seção 8). O índice vira o TÍTULO quando
 * `titulo` o resolve; senão a cláusula perde o número ("em outra seção"): o
 * entregável nunca aponta uma seção errada.
 */
const REFERENCIA_A_SECAO = /\b(?:(n[ao]|d[ao]|pel[ao]|em|à|a)\s+)?se[cç][aã]o\s+(\d{1,2})\b/gi;
const SEM_A_SECAO: Readonly<Record<string, string>> = { na: "em outra seção", no: "em outra seção", em: "em outra seção", da: "de outra seção", do: "de outra seção", pela: "por outra seção", pelo: "por outra seção", "à": "a outra seção", a: "a outra seção" };

export function radarArticleBlueprintSectionRefsByTitle(motivo: string, titulo: (numero: number) => string | null): string {
  return motivo.replace(REFERENCIA_A_SECAO, (_trecho, preposicao: string | undefined, numero: string) => {
    const resolvido = titulo(Number(numero));
    const prep = (preposicao || "").toLocaleLowerCase("pt-BR");
    if (resolvido) return `${preposicao ? `${preposicao} ` : ""}seção "${resolvido}"`;
    return prep ? SEM_A_SECAO[prep] ?? "em outra seção" : "outra seção";
  });
}

/*
 * 2026-10-08 · P1 · A IMAGEM SEM A CENA PROIBIDA, CONCLUÍDA (D10). O prompt
 * que pede a cena vira a instrução de escrever o prompt a partir da seção
 * (título e pergunta do leitor), sem antes e depois, resultado clínico nem
 * promessa de resultado; o conceito e a legenda que a pedem saem (a legenda só
 * entra quando acrescenta informação); o ALT vira a instrução de descrever a
 * cena gerada. Vale na conferência que fecha a planta e no export da planta
 * antiga. `scenes`: o que saiu (vazio = a imagem volta igual, o MESMO objeto).
 */
export function radarArticleBlueprintVisualWithoutForbiddenScene<T extends { slot: string; concept?: string | null; prompt: string; alt?: string | null; caption?: string | null }>(
  item: T,
  ancora: { title: string | null; question?: string | null },
  opcoes: { keywords?: readonly string[]; topic?: string | null } = {},
): { item: T; scenes: RadarArticleBlueprintForbiddenScene[] } {
  const keywords = opcoes.keywords || [];
  const cenaDe = (texto: string | null | undefined) => radarArticleBlueprintForbiddenScene(texto, keywords);
  const doPrompt = cenaDe(item.prompt);
  const doConceito = cenaDe(item.concept);
  const doAlt = cenaDe(item.alt);
  const daLegenda = cenaDe(item.caption);
  const scenes = [...new Set([doPrompt, doConceito, doAlt, daLegenda].filter((cena): cena is RadarArticleBlueprintForbiddenScene => Boolean(cena)))];
  if (!scenes.length) return { item, scenes };
  const proporcao = item.slot === "CAPA" ? "16:9" : "4:3";
  const pergunta = t(ancora.question);
  const montar = (comPergunta: boolean) => {
    const alvo = ancora.title
      ? `da seção "${ancora.title}"${comPergunta && pergunta ? ` (${pergunta.replace(/[.\s]+$/, "")})` : ""}`
      : t(opcoes.topic) ? `do tema do artigo ("${t(opcoes.topic)}")` : "do tema do artigo";
    return `Escreva o prompt a partir ${alvo}: uma cena editorial que explique essa ideia, sem antes e depois, sem resultado clínico e sem promessa de resultado, sem texto legível. Proporção ${proporcao}.`;
  };
  const completo = montar(true);
  const prompt = doPrompt || doConceito ? (completo.length <= L.imagePromptChars ? completo : montar(false)) : item.prompt;
  return {
    item: {
      ...item,
      prompt,
      ...(doConceito ? { concept: "" } : {}),
      ...(doAlt ? { alt: "descreva a cena gerada, sem antes e depois nem promessa de resultado" } : {}),
      ...(daLegenda ? { caption: "" } : {}),
    },
    scenes,
  };
}

/* ============================== 2026-10-09 · os ajudantes da coerência dos CSVs ============================== */

/*
 * 2026-10-09 · 8 · A PSEUDO-AFIRMAÇÃO. O CSV real de leads levava como
 * "afirmação delimitada" e na lista "só entram com fonte" os rótulos
 * "Definição de lead qualificado conforme fontes do setor", "Estatísticas
 * sobre conversão de leads qualificados" e "Passos para gerar leads
 * qualificados": nada afirmam, e a trava casava outras frases com eles. O
 * rótulo tem forma de título — começa por um nome (não por artigo, pronome
 * nem advérbio) seguido logo de preposição ("Definição de", "Passos para",
 * "Diferença entre"), ou por "Como" + infinitivo — e não tem verbo finito.
 * Afirmação com verbo ("Sites de ofertas agregam promoções…", "O algoritmo
 * prioriza…", "Postar com frequência aumenta o alcance") continua afirmação;
 * frase com número também (é dado). Na dúvida, fica: a lista de verbos não
 * precisa ser completa, porque a forma de título também decide.
 */
/*
 * 2026-10-09 (correção) · a régua do rótulo de tema mudou de casa: ela decide na
 * ORIGEM (`radarPendingClaims`, em pending-claims.ts), para o CSV, o vídeo e o
 * Redator receberem a mesma lista; e passou a pedir cabeça de rótulo de lista
 * fechada ("Definição de", "Estatísticas sobre", "Passos para"…). A forma de
 * título sem verbo da lista tratava como rótulo afirmação normativa ("Resolução
 * do CFM proíbe fotos de antes e depois") e de direção ("Queda no alcance
 * orgânico do Instagram"), e tirava o link que as travava. O nome daqui fica,
 * como reexportação, para os consumidores de antes.
 */
export const radarArticleBlueprintPseudoClaim = (texto: string | null | undefined): boolean => radarClaimIsTopicLabel(texto);

/** 2026-10-09 · 8 · O link externo que é rótulo de tema: sem fonte do pacote e sem afirmação. O que tem fonte X fica (o link existe). */
const linkDeRotulo = (link: { claim: string; source?: string | null }, fontes: ReadonlySet<string>): boolean =>
  !(link.source && fontes.has(link.source)) && radarArticleBlueprintPseudoClaim(link.claim);

/*
 * 2026-10-09 · 9 · A DEMONSTRAÇÃO COM RESULTADO INVENTADO. O CSV real de
 * captação mandava "Demonstração: exemplo de um consultório que otimizou o
 * perfil do Google e passou a receber mais ligações; mostrar antes e depois
 * das configurações" — um caso com resultado atribuído, sem fonte nenhuma. O
 * caso ("um consultório que…", "uma clínica que…") seguido do resultado
 * ("passou a receber mais", "dobrou", "aumentou", "lotou") vira exemplo
 * ilustrativo do ajuste, sem resultado atribuído; o resto da demonstração fica
 * ("antes e depois das configurações" é marketing, não cena clínica).
 */
/*
 * 2026-10-09 (correção) · A RÉGUA DA DEMONSTRAÇÃO, NOS DOIS SENTIDOS. A revisão
 * achou casos comuns que passavam ("caso de uma clínica que, depois de otimizar
 * o perfil, recebeu 30% mais ligações", "a clínica X otimizou o perfil e dobrou
 * os agendamentos", "Exemplo de clínica que aumentou as avaliações no Google",
 * "clínicas que otimizaram o perfil passaram a receber mais ligações") e
 * reescritas que quebravam o texto, porque "aumentou" contava como resultado
 * mesmo sendo a AÇÃO do caso ("Checklist: o que uma clínica que aumentou o
 * orçamento de anúncios deve revisar" virava "o que um exemplo ilustrativo do
 * ajuste…"). Agora:
 *   - resultado é "passou/começou a + verbo de resultado", "faturou", ou verbo
 *     de resultado no pretérito seguido (até quatro palavras, número e %
 *     incluídos) de objeto comercial — ligações, pacientes, clientes, vendas,
 *     agendamentos, agenda, faturamento, avaliações…; "aumentou o orçamento" e
 *     "aumentou a frequência de posts" são ação, e o texto fica igual;
 *   - o caso aceita plural, caso sem artigo depois de "exemplo de"/"caso de" e
 *     caso nomeado sem "que" ("a clínica X otimizou…");
 *   - o caso dentro de um sintagma ("do perfil de uma clínica que lotou a
 *     agenda") perde só a oração do resultado: "do perfil de uma clínica
 *     (exemplo ilustrativo, sem resultado atribuído)".
 */
const NOME_DO_CASO = "(?:consultorios?|clinicas?|clientes?|pacientes?|empresas?|lojas?|negocios?|profissiona(?:l|is)|dentistas?|medic[oa]s?|esteticistas?|biomedic[oa]s?|nutricionistas?|psicolog[oa]s?|fisioterapeutas?|advogad[oa]s?|marcas?|perfil|perfis|sites?|escritorios?|empreendedor(?:a|es|as)?)";
const PRETERITO_DO_CASO = "[a-z]{3,}(?:ou|eu|iu|aram|eram|iram)";
const CASO_ATRIBUIDO = new RegExp(
  `\\b(?<moldura>(?:exemplo|caso|historia|relato)\\s+(?:real\\s+)?d[eoa]s?\\s+)?(?:(?:um|uma|o|a|os|as|certo|certa|certos|certas)\\s+)?${NOME_DO_CASO}\\b(?:[^;.!?]{0,60}?\\bque\\b[\\s,]*|\\s+(?:[a-z0-9-]+\\s+)?(?=${PRETERITO_DO_CASO}\\b))`,
);
const OBJETO_DO_RESULTADO = "(?:ligacoes|pacientes|clientes|vendas|agendamentos|agenda|faturamento|leads|consultas|avaliacoes|seguidores|contatos|mensagens|orcamentos|receita|lucro|visitas|acessos|trafego|conversoes|pedidos)";
const ENTRE_VERBO_E_OBJETO = "(?:\\s+(?:o|a|os|as|seu|sua|seus|suas|mais|menos|\\d+%?|vezes|dobro|de|em|novos|novas)){0,4}";
const RESULTADO_ATRIBUIDO = new RegExp(
  `\\b(?:(?:passou|passaram|comecou|comecaram)\\s+a\\s+(?:receber|ter|atrair|vender|faturar|ganhar|lotar|encher|aparecer|captar|fechar|converter)|faturou|faturaram|(?:(?:aument|dobr|triplic|multiplic|ganh|conquist|capt|fech|vend|lot|atra)(?:ou|aram|iu|iram)|(?:receb|cresc|ench)(?:eu|eram)|ger(?:ou|aram)|trouxe(?:ram)?|consegu(?:iu|iram)|teve|tiveram)${ENTRE_VERBO_E_OBJETO}\\s+${OBJETO_DO_RESULTADO})\\b`,
);
const PRETERITO_IRREGULAR: Readonly<Record<string, string>> = { fez: "fazer", refez: "refazer", teve: "ter", trouxe: "trazer", pos: "pôr", disse: "dizer", viu: "ver", deu: "dar", foi: "ir", fizeram: "fazer", tiveram: "ter", trouxeram: "trazer" };
const noInfinitivo = (palavra: string): string | null => {
  const chave = semAcento(palavra);
  if (PRETERITO_IRREGULAR[chave]) return PRETERITO_IRREGULAR[chave];
  /* 2026-10-09 (correção) · o plural ("otimizaram") e o infinitivo que já veio ("depois de otimizar o perfil"). */
  if (chave.length >= 7 && /(?:aram|eram|iram)$/.test(chave)) return `${palavra.slice(0, -4)}${chave.slice(-4, -3)}r`;
  if (chave.length >= 5 && /ou$/.test(chave)) return `${palavra.slice(0, -2)}ar`;
  if (chave.length >= 5 && /eu$/.test(chave)) return `${palavra.slice(0, -2)}er`;
  if (chave.length >= 5 && /iu$/.test(chave)) return `${palavra.slice(0, -2)}ir`;
  if (chave.length >= 4 && /(?:ar|er|ir)$/.test(chave)) return palavra;
  return null;
};

/** O caso e o resultado atribuído a ele, na mesma oração; null sem os dois. */
function casoComResultado(lido: string): { caso: RegExpExecArray; inicioDoResultado: number } | null {
  const caso = CASO_ATRIBUIDO.exec(lido);
  if (!caso) return null;
  const depoisDoCaso = caso.index + caso[0].length;
  const resultado = RESULTADO_ATRIBUIDO.exec(lido.slice(depoisDoCaso));
  if (!resultado || /[;.!?]/.test(lido.slice(depoisDoCaso, depoisDoCaso + resultado.index))) return null;
  return { caso, inicioDoResultado: depoisDoCaso + resultado.index };
}

/** 2026-10-09 · 9 · O texto atribui resultado a um caso ("um consultório que … passou a receber mais ligações")? */
export function radarArticleBlueprintAttributedResult(texto: string | null | undefined): boolean {
  return Boolean(casoComResultado(semAcento(t(texto))));
}

/** 2026-10-09 · 9 · A demonstração sem o resultado atribuído; sem caso com resultado, o MESMO texto. */
export function radarArticleBlueprintPracticalWithoutResult(texto: string): string {
  const original = t(texto).normalize("NFC");
  const lido = semAcento(original);
  if (!original || lido.length !== original.length) return texto;
  const achado = casoComResultado(lido);
  if (!achado) return texto;
  const { caso, inicioDoResultado } = achado;
  const depoisDoCaso = caso.index + caso[0].length;
  const fimDaOracao = lido.slice(inicioDoResultado).search(/[;.!?](?:\s|$)/);
  const fim = fimDaOracao >= 0 ? inicioDoResultado + fimDaOracao : original.length;
  const antes = original.slice(0, caso.index);
  const maiuscula = (valor: string) => (/^\p{Ll}/u.test(valor) && !antes.trim() ? `${valor.charAt(0).toLocaleUpperCase("pt-BR")}${valor.slice(1)}` : valor);
  /* 2026-10-09 (correção) · o caso dentro de um sintagma ("do perfil de uma clínica que lotou a agenda"): sai só a oração do resultado. */
  if (!caso.groups?.moldura && /\b(?:de|do|da|dos|das)\s+$/i.test(antes)) {
    const que = caso[0].search(/\s*\bque\b[\s,]*$/);
    const nome = original.slice(caso.index, caso.index + (que >= 0 ? que : caso[0].trimEnd().length)).trim();
    return maiuscula(`${antes}${nome} (exemplo ilustrativo, sem resultado atribuído)${original.slice(fim)}`.replace(/\s{2,}/g, " ").trim());
  }
  /* A ação do caso ("otimizou o perfil do Google", "depois de otimizar o perfil") vira o que o exemplo mostra ("como otimizar o perfil do Google"). */
  const acao = original.slice(depoisDoCaso, inicioDoResultado)
    .replace(/^[\s,]*(?:depois\s+de|ap[oó]s|ao)\s+/i, "")
    .replace(/\s*,?\s*(?:e|mas|ent[aã]o)\s*$/i, "")
    .replace(/[\s,]+$/, "")
    .trim();
  const [primeira = "", ...resto] = acao.split(/\s+/);
  const verbo = primeira ? noInfinitivo(primeira) : null;
  const restoNoInfinitivo = resto.map((palavra, indice) => (indice > 0 && /^(?:e|,)$/.test(resto[indice - 1]) ? noInfinitivo(palavra) ?? palavra : palavra)).join(" ");
  const oQueMostra = verbo ? `como ${[verbo, restoNoInfinitivo].filter(Boolean).join(" ")}` : null;
  /* "Exemplo: a clínica X otimizou…" → "Exemplo ilustrativo: como otimizar…" (sem "Exemplo: exemplo"). */
  const rotulo = /\b(?:exemplo|caso)\s*:\s*$/i.exec(antes);
  if (rotulo) {
    const saida = `${antes.slice(0, rotulo.index)}Exemplo ilustrativo: ${oQueMostra ?? "o ajuste"}, sem resultado atribuído${original.slice(fim)}`;
    return maiuscula(saida.replace(/\s{2,}/g, " ").trim());
  }
  const artigo = !antes.trim() || /[:,(]\s*$/.test(antes) ? "" : "um ";
  const exemplo = oQueMostra
    ? `${artigo}exemplo ilustrativo de ${oQueMostra}, sem resultado atribuído`
    : `${artigo}exemplo ilustrativo do ajuste, sem resultado atribuído`;
  return maiuscula(`${antes}${exemplo}${original.slice(fim)}`.replace(/\s{2,}/g, " ").trim());
}

/*
 * 2026-10-09 · 10 · O CTA QUE CITA A PÁGINA COMERCIAL. O CSV real do Instagram
 * fechava com "conheça nossos serviços de SEO para clínicas" e a página
 * comercial da Skill (/servicos/seo-para-clinicas) não estava entre os links:
 * a chamada sem destino. O CTA cita a página quando traz ao menos duas das
 * palavras do caminho dela (e dois terços delas); a âncora é o trecho do CTA
 * que as cobre ("serviços de SEO para clínicas"). Só candidato "Página da
 * marca" (Skill de voz): nada é inventado.
 */
const palavrasDoCaminho = (candidato: RadarArticleBlueprintLinkCandidate): string[] => {
  let caminho = "";
  try {
    caminho = candidato.destination ? new URL(candidato.destination, "https://exemplo.invalid").pathname : "";
  } catch {
    caminho = "";
  }
  if (!caminho || caminho === "/") caminho = t(candidato.label).replace(/^p[aá]gina da marca\s*/i, "");
  return [...new Set(radarWritingCompareKey(caminho.replace(/[/_-]+/g, " ")).split(" ")
    .filter(palavra => palavra.length >= 3 && !RADAR_WRITING_FUNCTION_WORDS.has(palavra)))];
};
const mesmaPalavra = (a: string, b: string) => a === b || (Math.min(a.length, b.length) >= 5 && (a.startsWith(b) || b.startsWith(a)));

export function radarArticleBlueprintCtaLink(
  cta: string | null | undefined,
  candidatos: readonly RadarArticleBlueprintLinkCandidate[],
): { candidate: RadarArticleBlueprintLinkCandidate; anchor: string } | null {
  const palavras = t(cta).split(/\s+/).filter(Boolean);
  if (!palavras.length) return null;
  const chaves = palavras.map(palavra => radarWritingCompareKey(palavra));
  for (const candidato of candidatos.filter(item => /p[aá]gina da marca/i.test(item.role))) {
    const doCaminho = palavrasDoCaminho(candidato);
    if (doCaminho.length < 2) continue;
    const posicoes = chaves.flatMap((chave, indice) => (chave && doCaminho.some(palavra => mesmaPalavra(chave, palavra)) ? [indice] : []));
    const casadas = doCaminho.filter(palavra => posicoes.some(indice => mesmaPalavra(chaves[indice], palavra))).length;
    if (casadas < 2 || casadas < Math.ceil((doCaminho.length * 2) / 3)) continue;
    /* A âncora é a janela mais curta do CTA que cobre as palavras casadas ("clínica" solta antes não a alarga). */
    let janela: [number, number] | null = null;
    for (const inicio of posicoes) {
      const cobertas = new Set<string>();
      for (const indice of posicoes.filter(posicao => posicao >= inicio)) {
        for (const palavra of doCaminho) if (mesmaPalavra(chaves[indice], palavra)) cobertas.add(palavra);
        if (cobertas.size >= casadas) {
          if (!janela || indice - inicio < janela[1] - janela[0]) janela = [inicio, indice];
          break;
        }
      }
    }
    if (!janela || janela[1] - janela[0] + 1 > casadas + 3) continue;
    const anchor = palavras.slice(janela[0], janela[1] + 1).join(" ").replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, "");
    if (anchor) return { candidate: candidato, anchor: corte(anchor, L.shortChars) };
  }
  return null;
}

/*
 * 2026-10-09 · 12 · A MOLDURA DA PROMESSA PADRÃO DO ARQUITETO. "Cobrir com
 * clareza o tema “promoções para estética”, mostrando como…" (CSV real de
 * promoções): a IA copiou a promessa padrão. A moldura sai; o que vem depois
 * dela fica, com o gerúndio no presente ("mostrando" → "O artigo mostra").
 * Só a moldura: "" (quem chama decide o que pôr no lugar).
 */
const MOLDURA_DO_TEMA = /cobrir com clareza o tema\s*[“"]([^”"]+)[”"]\s*[,.;:]?\s*/i;
const GERUNDIO_IRREGULAR: Readonly<Record<string, string>> = { trazendo: "traz", fazendo: "faz", dizendo: "diz", pondo: "põe", construindo: "constrói", indo: "vai", vindo: "vem", tendo: "tem", sendo: "é" };

export function radarArticleBlueprintPromiseWithoutFrame(promessa: string | null | undefined): string {
  const texto = t(promessa);
  const achado = MOLDURA_DO_TEMA.exec(texto);
  if (!achado) return texto;
  const antes = texto.slice(0, achado.index).trim();
  let depois = texto.slice(achado.index + achado[0].length).trim().replace(/^(?:e|,)\s+/i, "").trim();
  const gerundio = /^(\p{L}+?)([aei])ndo(?=[\s,.;:]|$)/u.exec(depois);
  if (gerundio) {
    const palavra = gerundio[0];
    const chave = semAcento(palavra);
    const presente = GERUNDIO_IRREGULAR[chave] ?? (/uindo$/.test(chave) ? `${palavra.slice(0, -4)}ui` : `${gerundio[1]}${gerundio[2] === "a" ? "a" : "e"}`);
    depois = `O artigo ${presente.toLocaleLowerCase("pt-BR")}${depois.slice(palavra.length)}`;
  } else if (depois) {
    depois = `${depois.charAt(0).toLocaleUpperCase("pt-BR")}${depois.slice(1)}`;
  }
  return [antes, depois].filter(Boolean).join(" ").replace(/\s{2,}/g, " ").trim();
}

/*
 * 2026-10-09 · 12 · UM LEITOR SÓ. O CSV real de promoções dizia "Leitor:
 * Profissionais de clínicas de estética … e pacientes que procuram ofertas
 * confiáveis" e a promessa "… e como pacientes podem encontrar descontos
 * seguros": dois públicos, e uma seção virou guia de cupom para o consumidor.
 * O segundo público é a oração que, depois de vírgula (ou de "e como"),
 * apresenta quem compra como sujeito ("e pacientes que procuram…", "e como
 * pacientes podem…") num texto cujo leitor é o negócio. "Ofertas que atraem
 * pacientes e clientes que voltam" (o objeto do negócio) não é segundo leitor.
 */
const NEGOCIO_DO_LEITOR = /\b(profissiona(?:l|is)|clinicas?|consultorios?|empresas?|negocios?|lojas?|lojistas?|donos?|donas?|gestor(?:es|as)?|empreendedor(?:es|as)?|dentistas?|medic[oa]s?|esteticistas?|biomedic[oa]s?|nutricionistas?|psicolog[oa]s?|fisioterapeutas?|advogad[oa]s?|escritorios?|agencias?)\b/;
const SEGUNDO_PUBLICO = /(?:,\s*(?:e|bem como|alem de|assim como)\s+|\s+(?:bem como|assim como)\s+|\s+e\s+(?=como\s))(?:tambem\s+)?(?:como\s+)?(?:(?:os|as|o|a)\s+)?(?:pacientes|clientes|consumidor(?:es|as)?|compradore?s?|compradoras?|leigos?|usuarios?)\s+(?:que|em busca|interessad\w*|procurando|buscando|a procura|podem|devem|conseguem|querem)\b[^.;]*/;

/** 2026-10-09 · 12 · O segundo público do texto (a oração inteira), ou null. `business`: o leitor declarado já é o negócio (promessa, ângulo). */
/*
 * 2026-10-09 (correção) · SEGUNDO LEITOR É QUEM GANHA UMA AÇÃO DE COMPRA OU DE
 * BUSCA. "…, e pacientes que já foram atendidos passam a indicar a clínica" e
 * "…, e clientes que voltam recebem um benefício claro" falam do EFEITO para o
 * negócio — o paciente é sujeito, mas o leitor continua a clínica —, e a
 * oração era cortada da promessa em silêncio. Agora o trecho do segundo público
 * (até a próxima vírgula) precisa dar ao consumidor procurar, buscar,
 * pesquisar, encontrar, achar, comprar, escolher, contratar ou aproveitar.
 */
const ACAO_DE_QUEM_COMPRA = /\b(?:procur\w*|busc\w*|pesquis\w*|encontr\w*|ach(?:ar|am|em)|compr(?:a|am|ar|em)|escolh\w*|contrat(?:a|am|ar|em)|aproveit\w*|economiz\w*|em busca|a procura|interessad\w*)\b/;

export function radarArticleBlueprintSecondAudience(texto: string | null | undefined, opcoes: { business?: boolean } = {}): string | null {
  const original = t(texto).normalize("NFC");
  const lido = semAcento(original);
  if (!original || lido.length !== original.length) return null;
  const achado = SEGUNDO_PUBLICO.exec(lido);
  if (!achado || (!opcoes.business && !NEGOCIO_DO_LEITOR.test(lido.slice(0, achado.index)))) return null;
  if (!ACAO_DE_QUEM_COMPRA.test(achado[0].replace(/^[,\s]+/, "").split(/[,;.]/)[0] || "")) return null;
  return original.slice(achado.index, achado.index + achado[0].length).replace(/^[,\s]+/, "").trim();
}

/** 2026-10-09 · 12 · O texto sem o segundo público; sem ele, o MESMO texto. */
export function radarArticleBlueprintWithoutSecondAudience(texto: string, opcoes: { business?: boolean } = {}): string {
  const segundo = radarArticleBlueprintSecondAudience(texto, opcoes);
  if (!segundo) return texto;
  const original = t(texto).normalize("NFC");
  const inicio = original.indexOf(segundo);
  const antes = original.slice(0, inicio).replace(/[\s,]*(?:\b(?:e|bem como|além de|assim como)\s*)?$/i, "");
  return `${antes}${original.slice(inicio + segundo.length)}`.replace(/\s+([,.;:!?])/g, "$1").replace(/,\s*([.;!?]|$)/g, "$1").trim();
}

/** 2026-10-09 · 12 · O negócio do leitor declarado, para a instrução de enquadramento ("o que a clínica ganha e perde…"). */
const NEGOCIO_COMO_LUGAR: ReadonlyArray<readonly [RegExp, string]> = [
  [/\bclinicas?\b/, "a clínica"], [/\bconsultorios?\b/, "o consultório"], [/\bescritorios?\b/, "o escritório"], [/\blojas?\b|\blojistas?\b/, "a loja"],
  [/\bagencias?\b/, "a agência"], [/\bempresas?\b/, "a empresa"], [/\bnegocios?\b/, "o negócio"],
];
export const radarArticleBlueprintReaderBusiness = (leitor: string | null | undefined): string | null => {
  const lido = semAcento(t(leitor));
  if (!NEGOCIO_DO_LEITOR.test(lido)) return null;
  return NEGOCIO_COMO_LUGAR.find(([regra]) => regra.test(lido))?.[1] ?? "o profissional";
};

/*
 * 2026-10-09 · 12 · A SEÇÃO QUE FALA COM QUEM COMPRA num artigo para o negócio
 * ("Site de promoções estetica: onde encontrar ofertas confiáveis", com
 * Magote, UvaRosa e Cuponeria, "verifique … antes de comprar"). Duas marcas
 * de guia de compra, ou mais, na mesma seção: ela fala com o consumidor.
 */
const GUIA_DE_QUEM_COMPRA: ReadonlyArray<readonly [string, RegExp]> = [
  ["onde encontrar ofertas", /\bonde\s+(?:encontrar|achar|comprar)\s+(?:as\s+|os\s+)?(?:melhores\s+)?(?:ofertas|descontos|promoc\w*|cupo\w*|precos?)\b/],
  ["antes de comprar", /\bantes\s+de\s+(?:comprar|contratar|fechar|agendar|pagar)\b/],
  ["reputação de quem vende", /\b(?:reputacao|avaliacoes|confiabilidade)\s+d[ao]s?\s+(?:clinicas?|empresas?|lojas?|consultorios?|profissionais?|vendedor(?:es)?|estabelecimentos?)\b/],
  ["desconfie", /\bdesconfie\b/],
  ["cupom", /\b(?:condicoes|termos|regras|validade)\s+do\s+cupom\b|\bcupo(?:m|ns)\s+de\s+desconto\b/],
  ["sites de ofertas confiáveis", /\b(?:sites?|plataformas?|aplicativos?|apps?)\s+de\s+(?:ofertas|cupo\w*|promoc\w*|compra\s+coletiva|descontos?)\b[^.?]{0,40}\bconfiave(?:l|is)\b/],
];

/** 2026-10-09 · 12 · As marcas de guia de compra da seção (duas ou mais: ela fala com quem compra). */
export function radarArticleBlueprintBuyerGuideMarks(secao: { h2: string; readerQuestion?: string | null; answerFirst?: string | null; h3?: readonly string[] | null; explain?: readonly string[] | null }): string[] {
  const lido = semAcento([secao.h2, secao.readerQuestion, secao.answerFirst, ...(secao.h3 || []), ...(secao.explain || [])].map(t).join(" · "));
  return GUIA_DE_QUEM_COMPRA.filter(([, regra]) => regra.test(lido)).map(([rotulo]) => rotulo);
}

/*
 * 2026-10-09 · 11 · O H3 QUE REPETE O H2 DE OUTRA SEÇÃO. No CSV real do
 * Instagram, a seção 2 trazia os H3 "O erro geográfico que quase ninguém fala"
 * e "Posts para Instagram estética não corrigem uma base fraca", que eram os
 * H2 das seções 3 e 4 (o mapa da página publicada absorveu e manteve). O H3
 * igual a um H2 da planta sai; a seção volta como o MESMO objeto quando nada sai.
 */
export function radarArticleBlueprintH3WithoutRepeatedH2<S extends { h2: string; h3: string[] }>(secoes: readonly S[]): { sections: S[]; removed: Array<{ section: string; h3: string }> } {
  const doH2 = new Set(secoes.map(secao => radarWritingCompareKey(secao.h2)).filter(Boolean));
  const removed: Array<{ section: string; h3: string }> = [];
  const sections = secoes.map(secao => {
    const h3 = secao.h3.filter(item => !doH2.has(radarWritingCompareKey(item)));
    if (h3.length === secao.h3.length) return secao;
    for (const item of secao.h3.filter(titulo => doH2.has(radarWritingCompareKey(titulo)))) removed.push({ section: secao.h2, h3: item });
    return { ...secao, h3 };
  });
  return { sections, removed };
}

/*
 * 2026-10-09 · 11 · H2 SOBREPOSTOS. No CSV real de captação, "Estratégias de
 * tráfego orgânico para captação de pacientes na odontologia", "Captação de
 * pacientes na odontologia: como aplicar o tráfego orgânico" e "Tráfego
 * orgânico no Instagram e TikTok para dentistas" passavam pelas duas réguas
 * de antes. Duas formas novas, ditas como nota:
 *   - só a palavra genérica muda: tirando keyword, palavra de função e
 *     genérico ("estratégias", "aplicar"), os dois H2 têm o mesmo assunto;
 *   - o corpo de uma já trata o título da outra: as palavras próprias do H2
 *     (duas ou mais) estão nos H3, no "Explicar" ou nos termos da outra
 *     ("Use Instagram e TikTok para mostrar bastidores").
 */
const raizesProprias = (texto: string, comuns: ReadonlySet<string>) =>
  [...new Set(radarSemanticStems(texto).filter(raiz => !comuns.has(raiz) && !RADAR_WRITING_FUNCTION_WORDS.has(raiz) && !generica(raiz)))];
const mesmaRaizDaSecao = (a: string, b: string) => a === b || (Math.min(a.length, b.length) >= 5 && (a.startsWith(b) || b.startsWith(a)));
/* 2026-10-09 (correção) · as raízes de contexto que uma seção usa sem tratar do assunto da outra ("Erros comuns a evitar", "ao perfil"). */
const PALAVRA_DE_CONTEXTO = /^(?:erro|comu|evit|sinal|cuidad|mito|perfil|dica|passo|exempl|defin|import)/;

export function radarArticleBlueprintOverlappingSections(
  secoes: ReadonlyArray<{ h2: string; h3?: readonly string[]; explain?: readonly string[]; terms?: readonly string[] }>,
  comuns: ReadonlySet<string>,
): Array<{ pair: [number, number]; kind: "GENERIC_ONLY" | "BODY_COVERS" }> {
  const titulos = secoes.map(secao => raizesProprias(secao.h2, comuns));
  const corpos = secoes.map(secao => new Set(radarSemanticStems([...(secao.h3 || []), ...(secao.explain || []), ...(secao.terms || [])].join(" "))));
  const saida: Array<{ pair: [number, number]; kind: "GENERIC_ONLY" | "BODY_COVERS" }> = [];
  for (let i = 0; i < secoes.length; i += 1) {
    for (let j = i + 1; j < secoes.length; j += 1) {
      const a = titulos[i];
      const b = titulos[j];
      if (a.length && b.length && a.length === b.length && a.every(raiz => b.some(outra => mesmaRaizDaSecao(raiz, outra)))) {
        saida.push({ pair: [i, j], kind: "GENERIC_ONLY" });
        continue;
      }
      /*
       * 2026-10-09 (correção) · o corpo só TRATA o título da outra seção quando
       * cobre TODAS as palavras próprias dele, e ao menos uma não é palavra de
       * contexto ("erro", "comum", "perfil"…). Com dois terços, as plantas reais
       * davam falso positivo: em captar, "Defina o perfil do seu cliente ideal"
       * casava com "Adapte a abordagem ao perfil" e "com base no perfil
       * definido" (a seção seguinte retoma a anterior por coesão; o "ideal",
       * que é o assunto, não estava lá); em captação, "Erros comuns na captação
       * de pacientes sem tráfego pago" casava com o H3 "Erros comuns a evitar"
       * da seção do Instagram.
       */
      const cobre = (titulo: string[], corpo: ReadonlySet<string>) => {
        const cobertas = titulo.filter(raiz => [...corpo].some(outra => mesmaRaizDaSecao(raiz, outra)));
        return titulo.length >= 2 && cobertas.length === titulo.length && cobertas.some(raiz => !PALAVRA_DE_CONTEXTO.test(raiz));
      };
      if (cobre(b, corpos[i]) || cobre(a, corpos[j])) saida.push({ pair: [i, j], kind: "BODY_COVERS" });
    }
  }
  return saida;
}

/*
 * 2026-10-09 (correção) · 12 · O PÚBLICO DUPLO NO TÍTULO. A alternativa real
 * de promoções era "Promoções estética: guia prático para clínicas e
 * pacientes": a régua do leitor só olhava "…, e pacientes que…". No H1, nas
 * alternativas, no SEO title e na meta, "para <negócio> e <consumidor>" perde
 * o consumidor (e a oração dele, quando há: "e pacientes que procuram…").
 */
const PUBLICO_DUPLO_NO_TITULO = /\b(?:para|pra)\s+(?:as\s+|os\s+)?(?:clinicas?|consultorios?|profissiona(?:l|is)|empresas?|negocios?|lojas?|lojistas?|dentistas?|medic[oa]s?|esteticistas?|gestor(?:es|as)?)\s+(?<segundo>e\s+(?:para\s+)?(?:os\s+|as\s+|seus\s+|suas\s+)?(?:pacientes|clientes|consumidor(?:es|as)?|compradore?s?|compradoras?)\b(?:\s+que\b[^.;,]*)?)/;

export function radarArticleBlueprintTitleWithoutSecondAudience(titulo: string): string {
  const original = t(titulo).normalize("NFC");
  const lido = semAcento(original);
  if (!original || lido.length !== original.length) return titulo;
  const achado = PUBLICO_DUPLO_NO_TITULO.exec(lido);
  const segundo = achado?.groups?.segundo;
  if (!achado || !segundo) return titulo;
  const inicio = achado.index + achado[0].length - segundo.length;
  return `${original.slice(0, inicio).trimEnd()}${original.slice(inicio + segundo.length)}`.replace(/\s+([,.;:!?])/g, "$1").replace(/\s{2,}/g, " ").trim();
}

/*
 * 2026-10-09 (correção) · 10 · UM CTA SÓ, TAMBÉM NA VIRADA. No CSV real de
 * promoções, o fechamento dizia "… O próximo passo é avaliar sua presença
 * digital e considerar uma consultoria especializada." e logo abaixo vinha o
 * CTA "a única chamada": duas chamadas. Com CTA, a frase da virada que chama
 * ("O próximo passo é…", "considere uma consultoria", "fale com", "contrate",
 * "conheça nossos serviços") sai; a virada fica com o que retoma a tese. Se
 * só sobrava a chamada, a virada vira a instrução concluída de retomar a
 * resposta principal.
 */
const CHAMADA_NA_VIRADA = /^(?:o\s+)?proximo\s+passo\s+(?:e|seria|pode\s+ser)\b|\b(?:considere|considerar|contrate|contratar|fale\s+com|solicite|solicitar|agende|agendar|conheca|conhecer)\s+(?:uma?\s+|nossos?\s+|nossas?\s+|a\s+|o\s+|os\s+|as\s+)?(?:consultoria|especialista|agencia|servicos?|equipe|profissional|diagnostico|avaliacao|adalbapro)\b/;
export const RADAR_ARTICLE_BLUEPRINT_TURN_WITHOUT_CALL = "Retome a resposta principal em poucas linhas, sem repetir o texto, e passe à chamada.";

export function radarArticleBlueprintTurnWithoutCall(virada: string): string {
  const original = t(virada);
  if (!original) return virada;
  const frases = original.split(/(?<=[.!?…])\s+(?=["“(]?\p{Lu})/u).map(frase => frase.trim()).filter(Boolean);
  const ficam = frases.filter(frase => !CHAMADA_NA_VIRADA.test(semAcento(frase)));
  if (ficam.length === frases.length) return virada;
  return ficam.length ? ficam.join(" ") : RADAR_ARTICLE_BLUEPRINT_TURN_WITHOUT_CALL;
}

/*
 * ===== 2026-10-09 (correção) · A PLANTA LIDA: UMA LEITURA SÓ PARA TODO ENTREGÁVEL =====
 *
 * As correções da leitura da planta (a antiga já aprovada, que o dono não vai
 * refazer agora) valiam só nas colunas do CSV para escrever. O Redator (os
 * fundamentos, a fatia `radar.blueprint/<id>` do MCP e a semente dos
 * derivados) e o CSV de vídeo liam a planta gravada: a mesma planta saía com a
 * pseudo-afirmação, a demonstração com resultado atribuído, a moldura e o
 * público duplo na promessa, o H3 repetido e o "Próximo passo" como segunda
 * chamada. Agora a leitura é UMA função pura, e os três a usam:
 *   - o link externo sem fonte que é rótulo de tema sai (8);
 *   - a demonstração com resultado atribuído vira exemplo ilustrativo (9);
 *   - o H3 igual ao H2 de outra seção sai (11);
 *   - a promessa perde a moldura e o segundo público; o leitor, o segundo
 *     público; H1, alternativas, SEO title e meta, o "e pacientes" (12);
 *   - com CTA, a virada perde a frase que chama; e, para quem não diz a
 *     continuação no corpo (Redator e vídeo), o próximo passo sai (10).
 * O link da página comercial citada pelo CTA (10) depende dos candidatos de
 * link e continua nas colunas. A planta que já segue as regras volta como o
 * MESMO objeto.
 */
export type RadarArticleBlueprintReadingOptions = {
  /** Os ids das fontes do pacote. Ausente = todo id de fonte gravado no link conta como fonte (o Redator não lê `payload.sources`). */
  sources?: ReadonlySet<string> | null;
  /** A chamada que vale (a do especialista, quando ele é CTA). Ausente = o CTA da planta. */
  cta?: string | null;
  /**
   * Um CTA só, para quem não diz a continuação no corpo (Redator e vídeo): o
   * próximo passo que é uma CHAMADA ("Acesse a página…", "Fale com…",
   * "Conheça nossos serviços…") sai; o que só aponta a leitura seguinte ("Ler o
   * guia da rotina matinal") fica. O CSV para escrever decide pela continuação.
   */
  withoutCallInNextStep?: boolean;
  /**
   * 2026-10-09b · As exclusões que os reajustes gravaram no ArticleDNA
   * (`radarResearchContextScopeExclusions`) e o núcleo do artigo (principal,
   * complementares, Assunto: não distinguem um rótulo). A planta já aprovada que
   * cobre um assunto excluído perde a seção (e o H3) na leitura, como a
   * conferência faria na planta nova; quem lê diz a nota concluída
   * (`removedSections`). Ausente = como antes.
   */
  exclusions?: { items: readonly RadarResearchScopeExclusion[]; core: readonly string[] } | null;
};

export type RadarArticleBlueprintReading = {
  blueprint: RadarArticleBlueprintAi;
  /** Os H3 que repetiam o H2 de outra seção. */
  removedH3: Array<{ section: string; h3: string }>;
  /** Quantos links externos eram rótulo de tema. */
  removedLabels: number;
  /** 2026-10-09b · As seções (e os H3) que cobriam uma exclusão do ArticleDNA, com a exclusão tocada. Vazio sem exclusão. */
  removedSections: Array<{ section: string; h3: string | null; exclusion: RadarResearchScopeExclusion; internalLinks: number }>;
};

/* O próximo passo que CHAMA (segunda chamada comercial), e não só aponta a leitura seguinte. */
const PROXIMO_PASSO_QUE_CHAMA = /^(?:acesse|visite|conheca|fale|agende|contrate|solicite|entre\s+em\s+contato|clique|chame|peca|marque|garanta|aproveite|assine|baixe|inscreva)\b/;
const proximoPassoQueChama = (valor: string) => {
  const lido = semAcento(t(valor));
  return Boolean(lido) && (PROXIMO_PASSO_QUE_CHAMA.test(lido) || CHAMADA_NA_VIRADA.test(lido));
};

/*
 * 2026-10-09 (correção) · O PRÓXIMO PASSO COMO A TELA O MOSTRA. O painel do
 * artigo-modelo no Radar mostrava `closing.nextStep` cru como "Próximo passo" —
 * inclusive o que CHAMA ("Acesse a página…"), que o CSV, o Redator e o MCP tiram.
 * O rótulo é o mesmo do Redator (`WRITER_BLUEPRINT_CONTINUATION_LABEL`); o
 * próximo passo que chama não aparece (`null`): a única chamada é o CTA.
 */
export const RADAR_ARTICLE_BLUEPRINT_CONTINUATION_LABEL = "Leitura seguinte (opcional, não é uma chamada)";

export function radarArticleBlueprintContinuationOf(nextStep: string | null | undefined): string | null {
  const valor = t(nextStep);
  return valor && !proximoPassoQueChama(valor) ? valor : null;
}

type SecaoLida = RadarArticleBlueprintAi["sections"][number];
/* A planta do banco pode trazer item sem forma (versão antiga ou editada fora do contrato): ele passa como veio, e a leitura não cai. */
const ehSecaoLida = (secao: unknown): secao is SecaoLida =>
  Boolean(secao) && typeof secao === "object" && typeof (secao as SecaoLida).h2 === "string" && Array.isArray((secao as SecaoLida).h3);

export function radarArticleBlueprintReading(blueprint: RadarArticleBlueprintAi, opcoes: RadarArticleBlueprintReadingOptions = {}): RadarArticleBlueprintReading {
  const temFonte = (link: { source?: string | null }) => Boolean(link.source) && (!opcoes.sources || opcoes.sources.has(link.source!));
  let removedLabels = 0;
  const gravadas: unknown[] = Array.isArray(blueprint.sections) ? blueprint.sections : [];
  /*
   * 2026-10-09b · A EXCLUSÃO DO ARTICLEDNA NA PLANTA JÁ APROVADA. A seção cujo
   * título ou pergunta toca um assunto que o reajuste tirou do artigo sai (e o
   * H3 que o toca), antes das outras correções; o mapa da página publicada é
   * renumerado, e o H2 publicado que ia para a seção que saiu sai também, com o
   * motivo. Sem exclusão, `brutas` é a lista gravada (o mesmo objeto).
   */
  const removedSections: RadarArticleBlueprintReading["removedSections"] = [];
  const excluida = radarArticleBlueprintDnaExclusionOf(opcoes.exclusions?.items, [...(opcoes.exclusions?.core || [])].map(item => t(item)).filter(Boolean));
  const saiu = new Map<number, RadarResearchScopeExclusion>();
  const brutas: unknown[] = opcoes.exclusions?.items.length
    ? gravadas.flatMap((secao, indice) => {
      if (!ehSecaoLida(secao)) return [secao];
      const toca = excluida(secao.h2) ?? excluida(secao.readerQuestion);
      if (toca) {
        saiu.set(indice, toca);
        removedSections.push({ section: secao.h2, h3: null, exclusion: toca, internalLinks: Array.isArray(secao.internalLinks) ? secao.internalLinks.length : 0 });
        return [];
      }
      const h3 = secao.h3.filter(item => {
        const tocado = excluida(item);
        if (tocado) removedSections.push({ section: secao.h2, h3: item, exclusion: tocado, internalLinks: 0 });
        return !tocado;
      });
      return [h3.length === secao.h3.length ? secao : { ...secao, h3 }];
    })
    : gravadas;
  const semExcluidas = brutas.length === gravadas.length && brutas.every((secao, indice) => secao === gravadas[indice]);
  const mapaGravado = Array.isArray(blueprint.publishedMap) ? blueprint.publishedMap : null;
  const publishedMap = saiu.size && mapaGravado
    ? mapaGravado.map(item => {
      if (!item || typeof item.section !== "number") return item;
      const original = item.section - 1;
      const exclusao = saiu.get(original);
      if (exclusao) return { ...item, section: null, reason: `o ArticleDNA exclui "${exclusao.label}" deste artigo (reajuste decidido no Arquiteto)`, origin: "ai" as const };
      const antes = [...saiu.keys()].filter(indice => indice < original).length;
      return antes ? { ...item, section: item.section - antes } : item;
    })
    : mapaGravado;
  /* 2026-10-09b · o "H2 da seção N" das complementares também segue a numeração nova; a da seção que saiu fica sem lugar dito. */
  const planoDeKeywords = blueprint.keywordPlan;
  const complementaresGravadas = Array.isArray(planoDeKeywords?.complementary) ? planoDeKeywords.complementary : [];
  const complementares = saiu.size
    ? complementaresGravadas.map(item => {
      if (!item || typeof item.placement !== "string") return item;
      const lugar = { saiu: false };
      const placement = item.placement.replace(/\b(se[cç][aã]o\s+)(\d+)/gi, (trecho, rotulo: string, numero: string) => {
        const original = Number(numero) - 1;
        if (saiu.has(original)) { lugar.saiu = true; return trecho; }
        const antes = [...saiu.keys()].filter(indice => indice < original).length;
        return antes ? `${rotulo}${Number(numero) - antes}` : trecho;
      });
      if (lugar.saiu) return { ...item, placement: "" };
      return placement === item.placement ? item : { ...item, placement };
    })
    : complementaresGravadas;
  const mesmoPlanoDeKeywords = complementares.every((item, indice) => item === complementaresGravadas[indice]);
  const lidas = brutas.map(secao => {
    if (!ehSecaoLida(secao)) return secao;
    const gravados = Array.isArray(secao.externalLinks) ? secao.externalLinks : [];
    const externalLinks = gravados.filter(link => !link || temFonte(link) || !radarClaimIsTopicLabel(link.claim));
    removedLabels += gravados.length - externalLinks.length;
    const practical = typeof secao.practical === "string" && secao.practical ? radarArticleBlueprintPracticalWithoutResult(secao.practical) : secao.practical;
    return externalLinks.length === gravados.length && practical === secao.practical ? secao : { ...secao, externalLinks, practical };
  });
  const comForma = lidas.filter(ehSecaoLida);
  const semRepetido = radarArticleBlueprintH3WithoutRepeatedH2(comForma);
  let proxima = 0;
  const sections = lidas.map(secao => (ehSecaoLida(secao) ? semRepetido.sections[proxima++] : secao)) as SecaoLida[];

  const negocio = radarArticleBlueprintReaderBusiness(blueprint.reader);
  const reader = typeof blueprint.reader === "string" ? radarArticleBlueprintWithoutSecondAudience(blueprint.reader) : blueprint.reader;
  const semMoldura = radarArticleBlueprintPromiseWithoutFrame(blueprint.promise)
    || `Ao final, o leitor tem a resposta para "${t(blueprint.opening?.readerQuestion).replace(/[?.!\s]+$/, "")}" e sabe o próximo passo.`;
  const promessa = radarArticleBlueprintWithoutSecondAudience(semMoldura, { business: Boolean(negocio) });
  const promise = typeof blueprint.promise !== "string" || promessa === t(blueprint.promise) ? blueprint.promise : promessa;

  const titulo = blueprint.title;
  const semDuplo = (valor: unknown) => (typeof valor === "string" ? radarArticleBlueprintTitleWithoutSecondAudience(valor) : valor);
  const alternativas: unknown[] = Array.isArray(titulo?.alternatives) ? titulo.alternatives : [];
  const alternativasLidas = alternativas.map(semDuplo);
  const mesmoTitulo = !titulo || (
    semDuplo(titulo.h1) === titulo.h1 && semDuplo(titulo.seoTitle) === titulo.seoTitle && semDuplo(titulo.metaDescription) === titulo.metaDescription
    && alternativasLidas.every((item, indice) => item === alternativas[indice])
  );
  const title = mesmoTitulo ? titulo : {
    ...titulo,
    h1: semDuplo(titulo.h1) as string,
    alternatives: alternativasLidas as string[],
    seoTitle: semDuplo(titulo.seoTitle) as string,
    metaDescription: semDuplo(titulo.metaDescription) as string,
  };

  const fechamento = blueprint.closing;
  const chamada = opcoes.cta !== undefined && opcoes.cta !== null ? t(opcoes.cta) : t(fechamento?.cta);
  const turn = fechamento && chamada && typeof fechamento.turn === "string" ? radarArticleBlueprintTurnWithoutCall(fechamento.turn) : fechamento?.turn;
  const nextStep = fechamento && opcoes.withoutCallInNextStep && typeof fechamento.nextStep === "string" && proximoPassoQueChama(fechamento.nextStep) ? null : fechamento?.nextStep;
  const mesmoFechamento = !fechamento || (turn === fechamento.turn && nextStep === fechamento.nextStep);

  const mesmasSecoes = semExcluidas && sections.every((secao, indice) => secao === brutas[indice]);
  const lida = mesmasSecoes && mesmoTitulo && mesmoFechamento && mesmoPlanoDeKeywords && reader === blueprint.reader && promise === blueprint.promise
    ? blueprint
    : {
      ...blueprint,
      reader,
      promise,
      title,
      closing: mesmoFechamento ? fechamento : { ...fechamento, turn: turn as string, nextStep: nextStep ?? null },
      sections: mesmasSecoes ? blueprint.sections : sections,
      /* 2026-10-09b · o mapa da página publicada e o lugar das complementares, renumerados quando uma seção saiu pela exclusão do ArticleDNA. */
      ...(publishedMap !== mapaGravado ? { publishedMap: publishedMap as RadarArticleBlueprintAi["publishedMap"] } : {}),
      ...(mesmoPlanoDeKeywords ? {} : { keywordPlan: { ...planoDeKeywords, complementary: complementares } }),
    };
  return { blueprint: lida, removedH3: semRepetido.removed, removedLabels, removedSections };
}

/** 2026-10-09 (correção) · O payload com a planta lida (`radarArticleBlueprintReading`); o MESMO objeto quando nada muda. */
export function radarArticleBlueprintPayloadReading<P extends RadarArticleBlueprintPayload>(payload: P, opcoes: Omit<RadarArticleBlueprintReadingOptions, "sources"> = {}): P {
  const { blueprint } = radarArticleBlueprintReading(payload.blueprint, { ...opcoes, sources: new Set(payload.sources.map(item => item.id)) });
  return blueprint === payload.blueprint ? payload : { ...payload, blueprint };
}

/* 2026-10-08 · B6 · o ângulo que "costura" temas em vez de dizer a entrega concreta. */
const ANGULO_DE_COSTURA = /\bcostur\w*|\b(?:une|unir|unindo|unem|junta|juntar|juntando|juntam|combina|combinar|combinando|combinam|mistura|misturar|misturando|integra|integrar|integrando)\b(?:\s+\S+){0,4}?\s+(?:temas|assuntos|topicos|frentes|abordagens)\b/;

/** 2026-10-08 · B7 · A planta foi montada antes das regras atuais (ou sem versão dita). */
export const radarArticleBlueprintRulesOutdated = (payload: Pick<RadarArticleBlueprintPayload, "rulesVersion"> | null | undefined): boolean =>
  Boolean(payload) && payload!.rulesVersion !== RADAR_ARTICLE_BLUEPRINT_RULES_VERSION;

/*
 * 2026-10-09 (correção · casos-reais-F13, contrato-F5, suites-R6) · O AVISO DIZ O
 * QUE FALTA, POR VERSÃO. Com as regras em 2026-10-09, as 6 plantas organizadas em
 * 08/10 passavam a mostrar "a planta não leu a página publicada, nem conferiu a
 * abertura pela busca…" — falso para elas (B1 e B2 já valiam) — e empurravam o
 * dono para um "Organizar de novo (IA)" pago, embora os entregáveis já apliquem
 * as correções de 09/10 na leitura. O texto sai da versão gravada; sem versão
 * (ou anterior a 08/10), o de antes, mais o que 09/10 acrescentou.
 */
const O_QUE_09_10_ACRESCENTA = "a conferência do rótulo de tema usado como link externo, da demonstração com resultado atribuído, do H3 que repete um H2, dos H2 sobrepostos, da moldura da promessa e do leitor único, e o link da página comercial citada pelo CTA";
/*
 * 2026-10-09b · O QUE AS REGRAS 2026-10-09b ACRESCENTAM (o artigo-modelo como
 * fundamento único): o bloco comercial da Amazon congelada no pedido, o
 * congelamento da Amazon no vínculo e as exclusões dos reajustes como fora do
 * escopo duro. A leitura já tira a seção que cobre uma exclusão; o bloco
 * comercial só entra organizando de novo. E o custo dito é o real: até 2
 * chamadas (a organização e, quando a conferência pede, a passada de correção).
 */
const O_QUE_09_10B_ACRESCENTA = "o bloco comercial da Amazon congelada no pedido (shortlist, critérios de comparação, regra de review e aviso de afiliado), o congelamento da Amazon no vínculo da planta e as exclusões que os reajustes gravam no ArticleDNA (assuntos excluídos, nota de diferenciação e fronteira anticanibalização) como fora do escopo duro";
const ORGANIZAR_DE_NOVO = "\"Organizar de novo (IA)\" (até 2 chamadas de IA)";

export function radarArticleBlueprintRulesNoticeText(payload: Pick<RadarArticleBlueprintPayload, "rulesVersion"> | null | undefined): string | null {
  if (!radarArticleBlueprintRulesOutdated(payload)) return null;
  if (payload!.rulesVersion === "2026-10-09") {
    /* 2026-10-09b · o que a leitura já faz, dito com exatidão: a exclusão do ArticleDNA sai da planta lida pelo CSV "Para escrever". */
    return `Esta versão foi montada com as regras de 2026-10-09. As de ${RADAR_ARTICLE_BLUEPRINT_RULES_VERSION} acrescentam ${O_QUE_09_10B_ACRESCENTA}. O CSV para escrever já tira, ao ler esta versão, a seção que cobre uma exclusão do ArticleDNA; o bloco comercial da Amazon só entra na planta organizando de novo. Use ${ORGANIZAR_DE_NOVO} quando o artigo tiver Amazon congelada ou se quiser que a IA refaça a planta com as regras novas.`;
  }
  if (payload!.rulesVersion === "2026-10-08") {
    return `Esta versão foi montada com as regras de 2026-10-08. As de 2026-10-09 acrescentam ${O_QUE_09_10_ACRESCENTA}; as de ${RADAR_ARTICLE_BLUEPRINT_RULES_VERSION}, ${O_QUE_09_10B_ACRESCENTA}. Os entregáveis (CSV para escrever, CSV de vídeo e Redator) já aplicam essas correções ao ler esta versão, e o CSV para escrever tira a seção que cobre uma exclusão do ArticleDNA; o bloco comercial da Amazon só entra organizando de novo. Use ${ORGANIZAR_DE_NOVO} só se quiser que a IA refaça a planta com as regras novas ou se o artigo tiver Amazon congelada.`;
  }
  return `Esta versão foi montada com regras anteriores às atuais (${RADAR_ARTICLE_BLUEPRINT_RULES_VERSION}): a planta não leu a página publicada, nem conferiu a abertura pela busca, os nomes atuais de produtos e as cenas repetidas (as regras de 2026-10-09 acrescentam ${O_QUE_09_10_ACRESCENTA}, e as de ${RADAR_ARTICLE_BLUEPRINT_RULES_VERSION}, ${O_QUE_09_10B_ACRESCENTA}; os entregáveis já aplicam na leitura o que é de leitura). Para refazer com as regras atuais, use ${ORGANIZAR_DE_NOVO}; até lá, os entregáveis seguem com esta versão.`;
}

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
  /* 2026-10-09 · 5 · a exclusão da Skill de voz também tira seção, H3 e abertura (a régua da voz, ao lado do "não cobrir"). */
  const tocaForaDoPacote = radarArticleBlueprintOutOfScopeMatcher(brief.outOfScope, nucleo);
  const exclusaoDaVoz = (valor: string | null | undefined) => radarBrandVoiceExclusionOf(valor, brief.voiceExclusions || []);
  /* 2026-10-09b · a exclusão do ArticleDNA (reajuste) também tira seção, H3 e abertura, com a nota que diz qual. */
  const exclusaoDoDna = radarArticleBlueprintDnaExclusionOf(brief.dnaExclusions, nucleo);
  const tocaForaDoEscopo = (valor: string | null | undefined) => tocaForaDoPacote(valor) || Boolean(exclusaoDaVoz(valor)) || Boolean(exclusaoDoDna(valor));
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
  /* 2026-10-08 · B5 · a mesma cena (sujeito e objeto) em duas imagens: conferida depois da âncora e da cena proibida (P1), no plano que fica. */

  const daIa = ai.sections.length > L.sections ? ai.sections.slice(0, L.sections) : ai.sections;
  if (daIa.length < ai.sections.length) notes.push(`A IA propôs ${ai.sections.length} seções; ficaram as ${L.sections} primeiras (teto do artigo-modelo).`);

  /* 2026-10-08 · B1 · o número (1 = a primeira) de cada seção da IA que ficou, na ordem da planta: o mapa da página publicada aponta para elas. */
  const sobreviventes: number[] = [];
  const secoesConferidas = daIa.flatMap((secao, indiceDaIa) => {
    if (EH_FAQ.test(`${secao.h2} ${secao.readerQuestion}`)) {
      notes.push(`Seção "${secao.h2}" removida: FAQ não integra o fluxo.`);
      return [];
    }
    /* 2026-10-09 · 5 · a exclusão da voz diz de onde vem. */
    const daVoz = exclusaoDaVoz(secao.h2) ?? exclusaoDaVoz(secao.readerQuestion);
    if (daVoz) {
      notes.push(`Seção "${secao.h2}" removida: a voz da marca exclui "${daVoz.label}" (seção "${daVoz.section}" da Skill).`);
      return [];
    }
    /* 2026-10-09b · a exclusão do ArticleDNA diz qual e, quando a nota diz, de que artigo é. */
    const doDna = exclusaoDoDna(secao.h2) ?? exclusaoDoDna(secao.readerQuestion);
    if (doDna) {
      notes.push(`Seção "${secao.h2}" removida: o ArticleDNA exclui ${radarArticleBlueprintDnaExclusionText(doDna)}.`);
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
    }).filter(link => {
      /* 2026-10-09 · 8 · o rótulo de tema sem fonte não é afirmação a sustentar: sai da planta (nem link, nem afirmação delimitada). */
      if (!linkDeRotulo(link, fontes)) return true;
      notes.push(`Seção "${secao.h2}": link externo "${corte(t(link.claim), 100)}" removido — é rótulo de tema, não afirmação a sustentar.`);
      return false;
    });
    /* 2026-10-09 · 9 · a demonstração não atribui resultado a um caso sem fonte: vira exemplo ilustrativo (correção determinística). */
    const practical = secao.practical ? radarArticleBlueprintPracticalWithoutResult(secao.practical) : secao.practical;
    if (practical !== secao.practical) notes.push(`Seção "${secao.h2}": a entrega prática atribuía resultado a um caso sem fonte; virou exemplo ilustrativo, sem resultado atribuído.`);
    const naoCitavel = secao.video ? naoCitaveis.get(secao.video) : undefined;
    if (naoCitavel) notes.push(`Seção "${secao.h2}": o vídeo ${secao.video} é de ${RADAR_VIDEO_USAGE_LABEL[naoCitavel]} (não citável); saiu do campo vídeo da seção.`);
    /*
     * 2026-10-08 (correção) · F6 · antes e depois no TEXTO da seção (resposta e
     * "Explicar"), não só na imagem: sem fechar, nota que pede ação (a passada
     * de correção troca o exemplo); fechando, sai só o trecho da cena (D10).
     */
    const cenaNoTexto = [secao.answerFirst, ...secao.explain].find(frase => radarArticleBlueprintTextForbiddenScene(frase, nucleo));
    let answerFirst = secao.answerFirst;
    let explain = secao.explain;
    if (cenaNoTexto && opcoes.close) {
      answerFirst = radarArticleBlueprintTextWithoutForbiddenScene(secao.answerFirst, nucleo) ?? RESPOSTA_SEM_CENA;
      explain = secao.explain.flatMap(item => radarArticleBlueprintTextWithoutForbiddenScene(item, nucleo) ?? []);
      notes.push(`Seção "${secao.h2}": antes e depois saiu do texto da seção (a regra do artigo-modelo e a voz da marca o proíbem).`);
    } else if (cenaNoTexto) {
      notes.push(`Seção "${secao.h2}" manda escrever antes e depois ("${corte(t(cenaNoTexto), 120)}"): a regra do artigo-modelo e a voz da marca o proíbem — troque o exemplo antes de aprovar.`);
    }
    sobreviventes.push(indiceDaIa + 1);
    return [{
      ...secao,
      answerFirst,
      explain,
      from: fromFinal,
      h3,
      evidence: evidencia,
      internalLinks: links,
      externalLinks: externos,
      specialist: secao.specialist && especialistas.has(secao.specialist) ? secao.specialist : null,
      video: secao.video && videos.has(secao.video) && !naoCitavel ? secao.video : null,
      image: secao.image && slots.has(secao.image.toUpperCase()) ? secao.image.toUpperCase() : null,
      bold: secao.bold.filter(item => item.split(/\s+/).length <= 6),
      practical,
    }];
  });
  /* 2026-10-09 · 11 · o H3 que repete o H2 de outra seção sai (a seção dele já existe). */
  const semH3Repetido = radarArticleBlueprintH3WithoutRepeatedH2(secoesConferidas);
  for (const item of semH3Repetido.removed) notes.push(`Seção "${item.section}": H3 "${item.h3}" removido — repetia um H2 da planta (a seção dele já existe).`);
  /*
   * 2026-10-09 · 10 · O CTA QUE CITA A PÁGINA COMERCIAL ganha o link dela,
   * quando ela é candidata e a planta ainda não a liga: na última seção (a
   * que fecha o artigo), com a âncora que o CTA usa.
   */
  const linkDoCta = radarArticleBlueprintCtaLink(ai.closing.cta, brief.linkCandidates);
  const ctaSemLink = linkDoCta && !semH3Repetido.sections.some(secao => secao.internalLinks.some(link => link.candidate === linkDoCta.candidate.id));
  const secoes = ctaSemLink && semH3Repetido.sections.length
    ? semH3Repetido.sections.map((secao, indice, todas) => (indice === todas.length - 1
      ? { ...secao, internalLinks: [...secao.internalLinks, { candidate: linkDoCta.candidate.id, anchor: linkDoCta.anchor, reason: "o CTA do fechamento cita esta página" }] }
      : secao))
    : semH3Repetido.sections;
  if (ctaSemLink && secoes.length) notes.push(`O CTA cita a página comercial (${linkDoCta.candidate.label}): o link entrou na planta, na seção "${secoes[secoes.length - 1].h2}", com a âncora "${linkDoCta.anchor}".`);
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
      } else {
        /* 2026-10-09 · 11 · e as duas formas novas de H2 sobreposto: só o genérico muda, ou o corpo de uma já trata o título da outra. */
        const sobreposta = radarArticleBlueprintOverlappingSections([secoes[i], secoes[j]], raizesComuns)[0];
        if (sobreposta?.kind === "GENERIC_ONLY") {
          notes.push(`Seções "${secoes[i].h2}" e "${secoes[j].h2}" respondem a mesma pergunta (só muda a palavra genérica): cada H2 responde uma pergunta diferente — junte ou dê a cada uma a sua entrega antes de aprovar.`);
        } else if (sobreposta?.kind === "BODY_COVERS") {
          notes.push(`Seções "${secoes[i].h2}" e "${secoes[j].h2}" se sobrepõem (os H3 ou o "Explicar" de uma já tratam o título da outra): cada H2 responde uma pergunta diferente — junte ou dê a cada uma a sua entrega antes de aprovar.`);
        }
      }
    }
  }

  /*
   * 2026-10-09 · 12 · A PROMESSA SEM A MOLDURA E UM LEITOR SÓ. A moldura
   * "Cobrir com clareza o tema …" sai sempre (correção determinística). O
   * segundo público no leitor ou na promessa pede ação (a passada de correção
   * reescreve a planta inteira com um leitor só); fechando, sai a oração dele
   * (D10). A seção que fala com quem compra num artigo para o negócio vira
   * nota: o export a enquadra para o leitor declarado.
   */
  const negocioDoLeitor = radarArticleBlueprintReaderBusiness(brief.article.audience) ?? radarArticleBlueprintReaderBusiness(ai.reader);
  let promise = radarArticleBlueprintPromiseWithoutFrame(ai.promise);
  if (promise !== t(ai.promise)) {
    if (!promise) promise = `Ao final, o leitor tem a resposta para "${t(ai.opening.readerQuestion).replace(/[?.!\s]+$/, "")}" e sabe o próximo passo.`;
    notes.push("A promessa trazia a moldura padrão do Arquiteto (\"Cobrir com clareza o tema …\"); a moldura saiu da promessa.");
  }
  let reader = ai.reader;
  const segundoPublico = radarArticleBlueprintSecondAudience(ai.reader) ?? (negocioDoLeitor ? radarArticleBlueprintSecondAudience(promise, { business: true }) : null);
  if (segundoPublico && opcoes.close) {
    reader = radarArticleBlueprintWithoutSecondAudience(ai.reader);
    promise = radarArticleBlueprintWithoutSecondAudience(promise, { business: Boolean(negocioDoLeitor) });
    notes.push(`Um leitor só: o segundo público ("${corte(segundoPublico, 100)}") saiu do leitor e da promessa.`);
  } else if (segundoPublico) {
    notes.push(`O leitor fala com dois públicos ("${corte(segundoPublico, 100)}"): a planta tem um leitor só, o declarado; o outro público entra só como menção enquadrada para ele — reescreva antes de aprovar.`);
  }
  if (negocioDoLeitor) {
    for (const secao of secoes) {
      const marcas = radarArticleBlueprintBuyerGuideMarks(secao);
      if (marcas.length >= 2) notes.push(`Seção "${secao.h2}" fala com quem compra (${marcas.join(", ")}) num artigo para quem vende: enquadre para o leitor declarado (o que ${negocioDoLeitor} ganha e perde com isso), nunca um guia para o consumidor, antes de aprovar.`);
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

  /*
   * 2026-10-08 · P1 · O PLANO VISUAL QUE FICA. Cada imagem ganha a âncora pelo
   * TÍTULO da seção (o número da IA é lido na ordem dela, antes das seções que
   * saíram; o H2 publicado que fica como seção própria também é âncora), e a
   * seção recebe a vaga que a aponta (uma imagem por seção). A cena proibida
   * (antes e depois, resultado clínico, promessa visual) vira nota que pede
   * ação — a passada de correção a troca —; fechando, sai: o prompt vira a
   * instrução concluída a partir da seção (D10).
   */
  const mapaLido = estruturaPublicada ? radarArticleBlueprintPublishedMapReading({ blueprint: { ...ai, sections: secoes, publishedMap } }, estruturaPublicada.h2, { keywords: nucleo }) : [];
  const ancoras = radarArticleBlueprintVisualAnchors(secoes, visual, { mapa: mapaLido, comuns: raizesComuns, numero: numero => sobreviventes.indexOf(numero) });
  const visualFinal = visual.map((item, posicao) => {
    const ancora = ancoras[posicao];
    const referencia = t(item.section);
    if (ancora.by === "spread") notes.push(`Plano visual: ${rotuloDaVaga(item.slot)} ${referencia ? `apontava "${corte(referencia, 80)}", que não casa com uma seção livre da planta` : "veio sem seção"}; ligado à seção "${ancora.title}" (a primeira sem imagem).`);
    const ancorado = { ...item, section: ancora.title ?? (item.slot === "CAPA" ? null : item.section) };
    const limpo = radarArticleBlueprintVisualWithoutForbiddenScene(ancorado, { title: ancora.title, question: ancora.section !== null ? secoes[ancora.section].readerQuestion : null }, { keywords: nucleo, topic: ai.title.h1 });
    if (!limpo.scenes.length) return ancorado;
    const cenas = limpo.scenes.map(cena => RADAR_ARTICLE_BLUEPRINT_FORBIDDEN_SCENE_LABEL[cena]).join(", ");
    if (opcoes.close) {
      notes.push(`Plano visual: ${cenas} saiu de ${rotuloDaVaga(item.slot)} (a regra do plano visual proíbe antes e depois, resultado clínico e promessa visual); o que a pedia virou instrução concluída a partir ${ancora.title ? `da seção "${ancora.title}"` : "do tema do artigo"}.`);
      return limpo.item;
    }
    const trecho = [item.prompt, item.concept, item.alt, item.caption].find(campo => radarArticleBlueprintForbiddenScene(campo, nucleo)) || item.prompt;
    notes.push(`O plano visual pede ${cenas} em ${rotuloDaVaga(item.slot)} ("${corte(t(trecho), 120)}"): antes e depois, resultado clínico e promessa visual não entram em imagem nenhuma — troque a cena antes de aprovar.`);
    return ancorado;
  });
  const vagaDaSecao = new Map(ancoras.flatMap(ancora => (ancora.section !== null ? [[ancora.section, ancora.slot] as const] : [])));
  const secoesComImagem = secoes.map((secao, indice) => {
    const imagem = vagaDaSecao.get(indice) ?? null;
    return imagem === secao.image ? secao : { ...secao, image: imagem };
  });
  /* 2026-10-08 · B5 · a mesma cena (sujeito e objeto) em duas imagens. */
  for (const repetida of radarArticleBlueprintRepeatedScenes(visualFinal)) {
    notes.push(`O plano visual repete a cena (${repetida.subject} com ${repetida.object}) em ${rotuloDaVaga(repetida.slots[0])} e ${rotuloDaVaga(repetida.slots[1])}: dê a cada imagem uma cena diferente antes de aprovar.`);
  }

  /*
   * 2026-10-09 (correção · casos-reais-F4 e F5) · na planta nova também: com
   * CTA, a virada perde a frase que chama (um CTA só); H1, alternativas, SEO
   * title e meta perdem o público duplo ("para clínicas e pacientes").
   * Correção determinística, dita como feita.
   */
  const viradaSemChamada = t(ai.closing.cta) ? radarArticleBlueprintTurnWithoutCall(ai.closing.turn) : ai.closing.turn;
  if (viradaSemChamada !== ai.closing.turn) notes.push("Um CTA só: a frase do fechamento que chamava (\"O próximo passo é…\", \"considere uma consultoria…\") saiu da virada; a chamada é o CTA.");
  const tituloLido = {
    ...ai.title,
    h1: radarArticleBlueprintTitleWithoutSecondAudience(ai.title.h1),
    alternatives: ai.title.alternatives.map(radarArticleBlueprintTitleWithoutSecondAudience),
    seoTitle: radarArticleBlueprintTitleWithoutSecondAudience(ai.title.seoTitle),
    metaDescription: radarArticleBlueprintTitleWithoutSecondAudience(ai.title.metaDescription),
  };
  const tituloMudou = tituloLido.h1 !== ai.title.h1 || tituloLido.seoTitle !== ai.title.seoTitle || tituloLido.metaDescription !== ai.title.metaDescription
    || tituloLido.alternatives.some((item, indice) => item !== ai.title.alternatives[indice]);
  if (tituloMudou) notes.push("Um leitor só: o título, as alternativas, o SEO title ou a meta falavam com dois públicos (\"para clínicas e pacientes\"); o segundo saiu.");

  /* 2026-10-08 (correção) · F7 · o motivo do descarte cita a seção pelo título (o número lido na ordem da IA), nunca pelo índice. */
  const tituloNaOrdemDaIa = (numero: number) => {
    const indice = sobreviventes.indexOf(numero);
    return indice >= 0 ? secoes[indice]?.h2 ?? null : null;
  };
  const montado: RadarArticleBlueprintAi = {
    ...ai,
    /* 2026-10-09 · 12 · a promessa sem a moldura e o leitor com um público só. */
    promise,
    reader,
    /* 2026-10-09 (correção) · o título sem o público duplo. */
    title: tituloMudou ? tituloLido : ai.title,
    angle: { ...ai.angle, evidence: soIds(ai.angle.evidence, "Ângulo") },
    opening: { ...ai.opening, evidence: soIds(ai.opening.evidence, "Abertura") },
    sections: secoesComImagem,
    discarded: [...descartados.values()].map(item => (item.reason ? { ...item, reason: radarArticleBlueprintSectionRefsByTitle(item.reason, tituloNaOrdemDaIa) } : item)),
    /* 2026-10-09 (correção) · um CTA só: a virada sem a frase que chama. */
    closing: { ...ai.closing, turn: viradaSemChamada, specialist: closingSpecialist },
    visual: visualFinal,
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
export const rotuloDaEvidencia = (
  payload: RadarArticleBlueprintPayload,
  ids: readonly string[],
  lentesDoDominio: ((dominio: string) => string | null) | null = null,
  /* 2026-10-09 · Defeito 2 · aditivo: o texto da evidência pela base única do export ("(N de M páginas)" reescrito); ausente = o gravado. */
  reescrever: ((evidencia: RadarArticleBlueprintEvidence) => string) | null = null,
) =>
  ids.map(id => payload.evidence.find(item => item.id === id)).filter((item): item is RadarArticleBlueprintEvidence => Boolean(item))
    .map(item => {
      const texto = reescrever ? reescrever(item) : item.text;
      return `${item.id} (${textoDaEvidencia(texto)}${lenteDaEvidencia(texto, lentesDoDominio)})`;
    });

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
  /**
   * 2026-10-08 (correção) · F1 · Os irmãos do Silo que já estão no ar (pelo
   * caminho planejado e pelo nome) e a URL deles: o destino que a planta gravou
   * como planejado sai com a URL e "(publicado)". Ausente = o estado gravado.
   */
  publishedMembers?: ReadonlyArray<{ slug: string | null; labels: ReadonlyArray<string | null | undefined>; url: string }>;
  /**
   * 2026-10-08 (correção) · F2 · A continuação da leitura (o próximo artigo do
   * Silo ou, no último, a SiloPage). Presente (mesmo null), o "Próximo passo" da
   * planta deixa de ser uma segunda chamada: vira a linha "Continuação (não é
   * uma segunda chamada)", com o link da planta para esse destino ou citada sem
   * link. Ausente = como antes.
   */
  continuation?: RadarWritingContinuation | null;
  /** 2026-10-08 (correção) · F2 · A chamada do especialista (quando ele é CTA), inteira: é a única chamada da planta. */
  specialistCta?: string | null;
  /**
   * 2026-10-09 · Defeito 2 · UMA BASE SÓ (`sample-basis.ts`, CSV para escrever):
   * o texto de cada evidência com o "(N de M páginas)" reescrito pela base
   * única, sem IA e sem mudar o que foi gravado. Ausente = o texto gravado.
   */
  evidenceText?: (evidencia: RadarArticleBlueprintEvidence) => string;
  /** 2026-10-09 · Defeito 2 · As medidas dos concorrentes sobre a base única, com o nome dela: a linha "Concorrentes comparáveis" sai por elas. Ausente = as gravadas. */
  sampleMeasures?: RadarArticleBlueprintMeasures & { label: string };
  /**
   * 2026-10-09 · Defeito 3(b) · Linhas a mais no corpo de uma seção (o assunto de
   * outro artigo do Silo que a seção toca: "só mencione e linke"). `linkPara`
   * devolve o L do plano de links que leva ao destino com aquele nome, ou null.
   */
  sectionNotes?: (secao: RadarArticleBlueprintAi["sections"][number], indice: number, linkPara: (rotulo: string) => string | null) => string[];
  /**
   * 2026-10-09b · As exclusões dos reajustes no ArticleDNA e o núcleo do artigo:
   * a seção (ou o H3) da planta aprovada que cobre um assunto excluído sai, com a
   * nota concluída no fim da estrutura, e o H2 publicado desse assunto sai do
   * mapa da atualização. Ausente = como antes.
   */
  exclusions?: { items: readonly RadarResearchScopeExclusion[]; core: readonly string[] } | null;
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
  const m = payload.measures;
  /*
   * 2026-10-09 · A PLANTA ANTIGA TAMBÉM SAI COERENTE (o dono não vai refazê-la
   * agora). O que a conferência nova corrige é corrigido aqui na leitura, sem
   * mudar a versão gravada: o link externo que é rótulo de tema sai (8); o H3
   * que repete o H2 de outra seção sai (11); a demonstração com resultado
   * atribuído vira exemplo ilustrativo (9, abaixo); o CTA que cita a página
   * comercial candidata ganha o link dela na última seção (10). A planta nova
   * já chega assim e passa igual.
   */
  /* 10 · a chamada que vai ao CSV: a do especialista (quando ele é CTA) ou a da planta. */
  const chamada = t(opcoes.specialistCta) || payload.blueprint.closing.cta;
  /*
   * 2026-10-09 (correção) · a leitura da planta é a função pura compartilhada
   * com o Redator e o CSV de vídeo (`radarArticleBlueprintReading`): rótulo de
   * tema, demonstração, H3 repetido, promessa, leitor, título e virada. Aqui
   * ficam só o que depende do CSV: o link do CTA (dos candidatos) e o próximo
   * passo, que a continuação decide.
   */
  /* 2026-10-09b · com as exclusões do ArticleDNA, a seção que as cobre sai na leitura (a nota vai ao fim da estrutura). */
  const leitura = radarArticleBlueprintReading(payload.blueprint, { sources: new Set(payload.sources.map(item => item.id)), cta: chamada, ...(opcoes.exclusions?.items.length ? { exclusions: opcoes.exclusions } : {}) });
  const lidas = { sections: leitura.blueprint.sections };
  const secoesExcluidas = leitura.removedSections.filter(item => item.h3 === null);
  const h3Excluidos = leitura.removedSections.filter(item => item.h3 !== null);
  const h3DasSecoesExcluidas = payload.blueprint.sections.filter(secao => secoesExcluidas.some(item => item.section === secao.h2)).reduce((soma, secao) => soma + secao.h3.length, 0);
  const h3Removidos = leitura.removedH3.length + h3Excluidos.length + h3DasSecoesExcluidas;
  const linkDoCta = radarArticleBlueprintCtaLink(chamada, payload.linkCandidates);
  const ctaSemLink = Boolean(linkDoCta && lidas.sections.length && !lidas.sections.some(secao => secao.internalLinks.some(link => link.candidate === linkDoCta.candidate.id)));
  const secoesLidas = ctaSemLink
    ? lidas.sections.map((secao, indice, todas) => (indice === todas.length - 1
      ? { ...secao, internalLinks: [...secao.internalLinks, { candidate: linkDoCta!.candidate.id, anchor: linkDoCta!.anchor, reason: "o CTA do fechamento cita esta página" }] }
      : secao))
    : lidas.sections;
  const b: RadarArticleBlueprintAi = secoesLidas === leitura.blueprint.sections
    ? leitura.blueprint
    : { ...leitura.blueprint, sections: secoesLidas };
  /* A planta lida, para quem confere contra ela (as afirmações da planta e o mapa da página publicada). */
  const planta: RadarArticleBlueprintPayload = b === payload.blueprint ? payload : { ...payload, blueprint: b };
  /*
   * 2026-10-02 · D10 (decisão do dono): O ENTREGÁVEL SAI CONCLUÍDO. CSV, Redator
   * e MCP não recebem "proposta", "aguardando aprovação" nem pendência: a
   * planta vai fechada (organizar corrige e fecha antes de gravar). Versão
   * antiga ainda em rascunho sai igual, sem marca; o que a conferência
   * registrou fica no painel do Radar.
   */
  /*
   * 2026-10-08 (correção) · F1 · O ESTADO DE PUBLICAÇÃO DO DESTINO É O DE HOJE.
   * A planta guarda o destino como era quando foi organizada: todo irmão do Silo
   * saía "planejado", e o CSV do Instagram dizia "ainda não publicado" para
   * suportes no ar. O irmão publicado sai com a URL; a planta gravada não muda.
   */
  const noAr = (item: RadarArticleBlueprintLinkCandidate): string | null => {
    if (item.status === "PUBLISHED" || !opcoes.publishedMembers?.length) return null;
    const caminho = radarWritingCompareKey(t(item.destination).replace(/^\/+/, ""));
    const nome = radarWritingCompareKey(semMolduraDoTema(item.label));
    const membro = opcoes.publishedMembers.find(publicado =>
      (caminho && radarWritingCompareKey(publicado.slug) === caminho) || (nome && publicado.labels.some(rotulo => radarWritingCompareKey(rotulo) === nome)));
    return membro ? t(membro.url) || null : null;
  };
  const candidato = new Map(payload.linkCandidates.map(item => {
    const url = noAr(item);
    return [item.id, url ? { ...item, destination: url, status: "PUBLISHED" as const } : item];
  }));
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
   * 2026-10-08 (correção) · F7 · na planta antiga, o "seção N" do motivo do
   * descarte é lido na ordem da planta e só vira o título quando a seção trata
   * do assunto descartado (alguma palavra própria em comum); senão, "em outra
   * seção". A planta nova já chega com o título (a conferência resolve na
   * ordem da IA).
   */
  const raizesDoArtigo = new Set(radarSemanticStems([t(opcoes.principal ?? ""), ...(opcoes.keywords || [])].join(" ")));
  const tituloDaPlanta = (item: { id: string; reason?: string | null }) => (numero: number): string | null => {
    const secao = b.sections[numero - 1];
    if (!secao) return null;
    const doDescarte = new Set(radarSemanticStems(`${doEsqueleto.get(item.id)?.heading || ""} ${t(item.reason).replace(REFERENCIA_A_SECAO, " ")}`).filter(raiz => !raizesDoArtigo.has(raiz)));
    return radarSemanticStems([secao.h2, secao.readerQuestion, ...secao.h3].join(" ")).some(raiz => doDescarte.has(raiz)) ? secao.h2 : null;
  };
  /*
   * 2026-10-08 (correção) · F14 · o mesmo link (âncora e destino) duas vezes na
   * planta sai uma vez só: fica o primeiro, na seção em que aparece primeiro. O
   * CSV do Instagram levava "como atrair um cliente" → o mesmo Suporte em L1 e
   * em L3.
   */
  const linksUnicos = new Set<RadarArticleBlueprintAi["sections"][number]["internalLinks"][number]>();
  const chavesDosLinks = new Set<string>();
  for (const secao of b.sections) {
    for (const link of secao.internalLinks) {
      const chave = `${radarWritingCompareKey(link.anchor)}→${link.candidate}`;
      if (chavesDosLinks.has(chave)) continue;
      chavesDosLinks.add(chave);
      linksUnicos.add(link);
    }
  }
  const linksDaSecao = (secao: RadarArticleBlueprintAi["sections"][number]) => secao.internalLinks.filter(link => linksUnicos.has(link));
  const linksRepetidos = b.sections.reduce((soma, secao) => soma + secao.internalLinks.length, 0) - linksUnicos.size;
  /*
   * 2026-10-08 (correção) · F6 · antes e depois no texto da planta antiga
   * (resposta e "Explicar"): sai só o trecho da cena; a frase que era só a cena
   * sai. A planta nova já chega sem (a conferência pede a troca ou tira).
   */
  const palavrasDaCena = [t(opcoes.principal ?? ""), ...(opcoes.keywords || [])].filter(Boolean);
  const semCena = (frase: string) => radarArticleBlueprintTextWithoutForbiddenScene(frase, palavrasDaCena);
  /*
   * 2026-10-08 · B8 · os parágrafos saem da faixa de palavras (vale para a
   * planta antiga: a conta usa só as medidas gravadas); sem medida, "~N por
   * seção", sem somar. E a contagem concorda: "1 link externo".
   */
  /*
   * 2026-10-09 (correção · contrato-F6) · UMA BASE SÓ TAMBÉM NAS MEDIDAS DO
   * PLANO. Com a base única do export, a linha "Concorrentes comparáveis" sai
   * por ela; o plano de parágrafos ("~W palavras cada, como nos concorrentes")
   * saía das medidas gravadas sobre a lista cortada — na mesma célula, 38
   * palavras por parágrafo "como nos concorrentes" e, logo abaixo, uma mediana
   * de ~135. Agora o plano usa as medidas da base, com a faixa de palavras
   * gravada na planta.
   */
  const medidasDoPlano = opcoes.sampleMeasures ? { ...m, serp: opcoes.sampleMeasures } : m;
  const paragrafosDoPlano = radarArticleBlueprintParagraphPlan(medidasDoPlano, b.sections.map(secao => secao.paragraphs));
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
  /* 2026-10-09 · 8 · o rótulo de tema que a planta antiga ligou a fonte não é afirmação: não trava frase nenhuma nem entra na lista. */
  const pendentes = (opcoes.pendentes ?? radarPendingClaims(null, planta)).filter(item => !(item.origem === "PLANTA" && !item.fonte && radarArticleBlueprintPseudoClaim(item.texto)));
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
  const mapa = opcoes.currentH2 !== undefined ? radarArticleBlueprintPublishedMapReading(planta, opcoes.currentH2, { keywords: opcoes.keywords, ...(opcoes.exclusions?.items.length ? { exclusions: opcoes.exclusions } : {}) }) : [];
  const citados = (itens: readonly RadarArticleBlueprintPublishedMapReading[]) => itens.map(item => `"${corte(item.current, 80)}"`).join("; ");
  const absorvidos = (numero: number) => mapa.filter(item => item.kind === "ABSORBED" && item.section === numero);
  const ficamDepois = (numero: number) => mapa.filter(item => item.kind === "KEEP" && (item.after ?? 0) === numero);
  const fechamentoDaPagina = mapa.filter(item => item.kind === "CLOSING");
  const removidosDaPagina = mapa.filter(item => item.kind === "REMOVED");
  const mantidosDaPagina = mapa.filter(item => item.kind === "KEEP").length;
  /*
   * 2026-10-09 · 12 · A PROMESSA SEM A MOLDURA E UM LEITOR SÓ, também na planta
   * antiga: "Cobrir com clareza o tema …" sai da promessa; o segundo público
   * ("… e pacientes que procuram ofertas confiáveis") sai do leitor e da
   * promessa. A seção que fala com quem compra ganha, abaixo, o enquadramento
   * para o leitor declarado.
   */
  /* 2026-10-09 (correção) · o leitor e a promessa já chegam lidos (`radarArticleBlueprintReading`). */
  const negocioDoLeitor = radarArticleBlueprintReaderBusiness(b.reader);
  const leitorUnico = b.reader;
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
  /*
   * 2026-10-08 (correção) · F2 · UM CTA SÓ. Com a continuação dita pelo CSV
   * (`opcoes.continuation`, mesmo null), o "Próximo passo" da planta — a segunda
   * chamada comercial no caso do Instagram ("Acesse a página de SEO para
   * clínicas…") — vira a linha "Continuação (não é uma segunda chamada)" para o
   * próximo artigo do Silo, com o link da planta para ele ou citada sem link. A
   * chamada é a do especialista (quando ele é CTA) ou a da planta.
   */
  const comContinuacao = opcoes.continuation !== undefined;
  const proximoPassoMarcado = b.closing.nextStep && !comContinuacao ? comFonte(b.closing.nextStep, null) : "";
  const ultimoSegmento = (valor: string | null) => radarWritingCompareKey(t(valor).replace(/[?#].*$/, "").replace(/\/+$/, "").split("/").pop() || "");
  /*
   * 2026-10-09 · 10 · A CONTINUAÇÃO DEIXA O FECHAMENTO. "Continuação (não é uma
   * segunda chamada): no fechamento, apresente…" ainda punha duas saídas no
   * fim do texto. Agora ela é OPCIONAL e vai no corpo: na seção que já tem o
   * link aprovado para o próximo artigo do Silo (ou para a SiloPage, no
   * último) ou, sem link, na última seção que trata do assunto dele (sem par,
   * a última), citada sem link. O fechamento fica com uma chamada só.
   */
  const continuacao = (() => {
    const destino = opcoes.continuation;
    if (!destino || !b.sections.length) return null;
    const nomes = new Set([destino.label, ...destino.names].map(nome => radarWritingCompareKey(semMolduraDoTema(nome))).filter(Boolean));
    const ehODestino = (item: RadarArticleBlueprintLinkCandidate | undefined) => Boolean(item) && (destino.kind === "siloPage"
      ? item!.role === "SiloPage"
      : item!.role !== "SiloPage" && ((Boolean(destino.slug) && ultimoSegmento(item!.destination) === radarWritingCompareKey(destino.slug)) || nomes.has(radarWritingCompareKey(semMolduraDoTema(item!.label)))));
    const todos = b.sections.flatMap((secao, indice) => linksDaSecao(secao).map(link => ({ link, indice })));
    const posicao = todos.findIndex(({ link }) => ehODestino(candidato.get(link.candidate)));
    const nome = `"${semMolduraDoTema(t(destino.label)).replace(/[.\s]+$/, "").replace(/^["“]|["”]$/g, "")}"`;
    const opcional = "- Leitura seguinte (opcional, não é uma chamada):";
    /*
     * A última seção que trata do assunto do destino: a que divide com ele uma
     * palavra própria (fora as keywords do artigo).
     * 2026-10-09 (correção) · a palavra do destino que está em metade ou mais
     * das seções é cenário do Silo, não assunto ("pacientes" em "instagram não
     * traz pacientes" levava a menção a "Geração de leads qualificados: como
     * medir resultados" só porque o "Explicar" dizia "se tornam pacientes"), e
     * o verbo curto ("traz") não basta sozinho.
     */
    const doArtigo = new Set(radarSemanticStems([t(opcoes.principal ?? ""), ...(opcoes.keywords || [])].join(" ")));
    const daSecao = b.sections.map(secao => radarSemanticStems([secao.h2, secao.readerQuestion, ...secao.h3, ...secao.explain].join(" ")));
    const divide = (raiz: string, raizes: readonly string[]) => raizes.some(outra => mesmaRaizDaSecao(raiz, outra));
    const doDestino = radarSemanticStems([destino.label, ...destino.names].join(" "))
      .filter(raiz => !doArtigo.has(raiz) && !RADAR_WRITING_FUNCTION_WORDS.has(raiz) && raiz.length >= 5)
      .filter(raiz => daSecao.filter(raizes => divide(raiz, raizes)).length * 2 < b.sections.length);
    const pertinentes = daSecao.flatMap((raizes, indice) => (doDestino.some(raiz => divide(raiz, raizes)) ? [indice] : []));
    const ultimaPertinente = pertinentes.length ? pertinentes[pertinentes.length - 1] : null;
    if (posicao >= 0) {
      const para = destino.kind === "article" ? `ao próximo artigo do Silo, ${nome}` : `à SiloPage ${nome}`;
      const doLink = todos[posicao].indice;
      /* 2026-10-09 (correção) · com o link numa seção do começo, a menção vai à última seção pertinente depois dela, citando o L (sem repetir o link). */
      if (ultimaPertinente !== null && ultimaPertinente > doLink) {
        const oDestino = destino.kind === "article" ? `o próximo artigo do Silo, ${nome},` : `a SiloPage ${nome}`;
        return { secao: ultimaPertinente, linha: `${opcional} se couber, mencione aqui ${oDestino} como a leitura seguinte — o link L${posicao + 1} (seção "${b.sections[doLink].h2}") já leva a ele; não repita o link e nunca o use como uma segunda chamada no fechamento.` };
      }
      return { secao: doLink, linha: `${opcional} o link L${posicao + 1} desta seção leva ${para}; se couber, apresente-o ali como a leitura seguinte, nunca como uma segunda chamada no fechamento.` };
    }
    /* Sem link aprovado: a última seção pertinente; sem par, a última. */
    const quem = destino.kind === "article" ? `o próximo artigo do Silo, ${nome},` : `a SiloPage ${nome}`;
    return {
      secao: ultimaPertinente ?? b.sections.length - 1,
      linha: `${opcional} se couber, mencione ${quem} no corpo desta seção ${RADAR_WRITING_NO_APPROVED_LINK}; nunca como uma segunda chamada no fechamento.`,
    };
  })();
  /*
   * 2026-10-08 · P1 · O PLANO VISUAL DO CASO REAL (Instagram). A âncora de cada
   * imagem é o TÍTULO da seção, resolvido depois do mapa da página publicada (o
   * H2 publicado que fica como seção própria também é âncora) — nunca o número
   * que a IA escreveu ("seção 5" e "8" numa planta de seis H2, com os H2 da
   * página intercalados). E a imagem que pede antes e depois, resultado clínico
   * ou promessa visual sai concluída (D10): o prompt vira a instrução a partir da
   * seção, sem a cena; conceito e legenda que a pedem saem. Vale para a planta
   * antiga; a planta nova já chega assim da conferência.
   */
  const palavrasDoArtigo = [t(opcoes.principal ?? ""), ...(opcoes.keywords || [])].filter(Boolean);
  const ancoras = radarArticleBlueprintVisualAnchors(b.sections, b.visual, { mapa, comuns: new Set(radarSemanticStems(palavrasDoArtigo.slice(0, 1).join(" "))) });
  const visualLimpo = b.visual.map((item, posicao) => {
    const ancora = ancoras[posicao];
    return radarArticleBlueprintVisualWithoutForbiddenScene(item, { title: ancora.title, question: ancora.section !== null ? b.sections[ancora.section]?.readerQuestion : null }, { keywords: palavrasDoArtigo, topic: b.title.h1 }).item;
  });
  const vagasAncoradas = new Set(ancoras.filter(ancora => ancora.by).map(ancora => ancora.slot));
  const imagensDaSecao = (secao: { image?: string | null }, indice: number): string[] => {
    const vagas = ancoras.filter(ancora => ancora.section === indice).map(ancora => ancora.slot);
    if (vagas.length) return vagas;
    /* A vaga declarada que não está no plano visual continua dita, como antes; a repetida (outra seção já a tem) não. */
    return secao.image && !vagasAncoradas.has(t(secao.image).toUpperCase()) ? [secao.image] : [];
  };
  const imagensDaPagina = (atual: string) => ancoras.filter(ancora => ancora.section === null && ancora.title === atual).map(ancora => ancora.slot);
  const visualMarcado = visualLimpo.map(item => ({ ...item, alt: item.alt ? comFonte(item.alt, null) : item.alt, caption: item.caption ? comFonte(item.caption, null) : item.caption }));
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
  const cenasRepetidas = radarArticleBlueprintRepeatedScenes(visualLimpo).map(({ slots, subject, object }) =>
    `Cena repetida: ${rotuloDaVaga(slots[0])} e ${rotuloDaVaga(slots[1])} mostram ${subject} com ${object} — ao gerar ${rotuloDaVaga(slots[1])}, troque o sujeito ou o objeto da cena.`);
  const evidenciaDoAngulo = b.angle.evidence.filter(id => /^[GDO]\d/i.test(id));
  /*
   * 2026-10-09 · 12 · UM LEITOR SÓ NA SEÇÃO. A seção que fala com quem compra
   * ("onde encontrar ofertas confiáveis", "verifique … antes de comprar") num
   * artigo para o negócio sai com a instrução concluída: o mesmo assunto, do
   * ponto de vista do leitor declarado.
   */
  const enquadramento = (secao: RadarArticleBlueprintAi["sections"][number]): string | null => {
    if (!negocioDoLeitor) return null;
    const marcas = radarArticleBlueprintBuyerGuideMarks(secao);
    return marcas.length >= 2
      ? `- Enquadramento (um leitor só): escreva esta seção para o leitor declarado, o que ${negocioDoLeitor} ganha e perde com isso e como decide; não oriente quem compra (${marcas.join(", ")}).`
      : null;
  };
  /*
   * 2026-10-09 (correção) · 12 · NA SEÇÃO ENQUADRADA, AS LINHAS NÃO SE
   * CONTRADIZEM. O CSV real de promoções dizia "não oriente quem compra" e, logo
   * abaixo, "- Pergunta do leitor: Quais sites de promoções de estética são
   * confiáveis?" e "- Explicar: Verifique avaliações… antes de comprar". Na
   * seção enquadrada, a pergunta e a resposta dizem para quem respondem, e cada
   * linha que orienta a compra (marca de guia de compra ou imperativo dirigido a
   * quem compra) diz, concluída, o que ela vira para o leitor declarado.
   */
  const ORIENTA_QUEM_COMPRA = /^(?:verifique|desconfie|compare|pesquise|procure|confira|evite\s+(?:sites?|ofertas|cupo\w*|promoc\w*)|escolha|leia\s+as?\s+(?:avaliac\w*|condic\w*|regras))\b/;
  const orientaQuemCompra = (texto: string) =>
    ORIENTA_QUEM_COMPRA.test(semAcento(t(texto))) || radarArticleBlueprintBuyerGuideMarks({ h2: texto }).length > 0;
  const paraOLeitor = (secao: RadarArticleBlueprintAi["sections"][number]) => Boolean(enquadramento(secao));
  const reescritaParaOLeitor = ` — reescreva para ${negocioDoLeitor ?? "o leitor declarado"}: o que isso muda para quem anuncia, não um conselho a quem compra.`;
  /* 2026-10-09 · Defeito 3(b) · o L do plano de links que leva ao destino com aquele nome (a mesma numeração da coluna links_internos). */
  const rotuloDoLinkPara = (rotulo: string): string | null => {
    const chave = radarWritingCompareKey(semMolduraDoTema(t(rotulo)));
    const posicao = chave ? b.sections.flatMap(secao => linksDaSecao(secao)).findIndex(link => {
      const destino = candidato.get(link.candidate);
      return Boolean(destino) && radarWritingCompareKey(rotuloDoDestino(destino!)) === chave;
    }) : -1;
    return posicao >= 0 ? `L${posicao + 1}` : null;
  };
  /* 2026-10-09 · 10 · o link da chamada: o L do plano de links que leva à página comercial citada pelo CTA. */
  const linhaDoLinkDoCta = (() => {
    if (!linkDoCta) return null;
    const todos = b.sections.flatMap(secao => linksDaSecao(secao).map(link => ({ link, secao: secao.h2 })));
    const posicao = todos.findIndex(({ link }) => link.candidate === linkDoCta.candidate.id);
    if (posicao < 0) return null;
    const { link, secao } = todos[posicao];
    const naUltima = secao === b.sections[b.sections.length - 1]?.h2;
    return `Link da chamada: L${posicao + 1}, âncora "${link.anchor}" → ${rotuloDoDestino(linkDoCta.candidate)}${naUltima ? " (no fim da última seção, junto da chamada)" : ` (já posicionado na seção "${secao}")`}.`;
  })();

  const estrutura = [
    "ARTIGO-MODELO DA SERP (planta concluída do artigo; a redação é de quem escreve).",
    ...(payload.unit ? [`Tipo da unidade: ${payload.unit.label}${payload.unit.format ? ` · formato: ${payload.unit.format}` : ""}.`] : []),
    ...(payload.brandVoice ? [`Voz da marca usada no plano: Skill "${payload.brandVoice.name}" v${payload.brandVoice.version}.`] : []),
    /* 2026-10-08 · C3 · link externo é o que tem fonte do pacote; a afirmação sem fonte sai delimitada, sem link. */
    /* 2026-10-08 (correção da revisão) · os H2 da página que ficam como seção própria SOMAM ao plano: a medida diz isso, não só "5 H2". */
    /* 2026-10-09b · a seção que saiu pela exclusão do ArticleDNA sai também da conta (H2, H3 e links dela). */
    `Medidas do plano: ${Math.max(0, m.plan.sections - secoesExcluidas.length)} H2${mantidosDaPagina ? ` (+ ${contagem(mantidosDaPagina, "H2 da página publicada mantido como seção própria", "H2 da página publicada mantidos como seções próprias")})` : ""} · ${Math.max(0, m.plan.h3 - h3Removidos)} H3 · ${paragrafosNaMedida} · ${contagem(m.plan.bold, "negrito", "negritos")} · ${contagem(m.plan.images, "imagem", "imagens")} (capa + ${contagem(m.plan.respites, "respiro", "respiros")}) · ${contagem(Math.max(0, m.plan.internalLinks + (ctaSemLink ? 1 : 0) - linksRepetidos - secoesExcluidas.reduce((soma, item) => soma + item.internalLinks, 0)), "link interno", "links internos")} · ${contagem(externosComFonte, "link externo", "links externos")}${delimitadas ? ` (${contagem(delimitadas, "afirmação delimitada", "afirmações delimitadas")}, sem link)` : ""}${m.plan.wordsMin && m.plan.wordsMax ? ` · ${m.plan.wordsMin}–${m.plan.wordsMax} palavras` : ""}.`,
    /* 2026-10-09 · Defeito 2 · com a base única do export, a linha fala dela (o mesmo nome da lista impressa); sem ela, as medidas gravadas. */
    opcoes.sampleMeasures
      ? `Concorrentes comparáveis (${opcoes.sampleMeasures.label}): mediana de ${opcoes.sampleMeasures.words.median ?? "?"} palavras, ${opcoes.sampleMeasures.h2 ?? "?"} H2, ${opcoes.sampleMeasures.h3 ?? "?"} H3, ${opcoes.sampleMeasures.paragraphs ?? "?"} parágrafos, ${opcoes.sampleMeasures.images ?? "?"} imagens.`
      : `Concorrentes comparáveis (${m.serp.comparablePages}): mediana de ${m.serp.words.median ?? "?"} palavras, ${m.serp.h2 ?? "?"} H2, ${m.serp.h3 ?? "?"} H3, ${m.serp.paragraphs ?? "?"} parágrafos, ${m.serp.images ?? "?"} imagens.`,
    /* 2026-10-02 · campo que veio vazio não deixa rótulo solto ("Keywords: ", "→  ()", "— "). */
    ...(b.keywordPlan.reading ? [`Keywords: ${b.keywordPlan.reading}`] : b.keywordPlan.complementary.length ? ["Keywords:"] : []),
    ...b.keywordPlan.complementary.map(item => `- ${item.keyword}${item.placement ? ` → ${item.placement}` : ""}${item.reason ? ` (${item.reason})` : ""}`),
    ...(b.keywordPlan.slugNote ? [`Slug × principal: ${b.keywordPlan.slugNote}`] : []),
    "",
    `Abertura: responder "${b.opening.readerQuestion}" no primeiro parágrafo${b.opening.direction ? ` — ${comFonte(b.opening.direction, null)}` : ""}${b.opening.evidence.length ? ` [${rotuloDaEvidencia(payload, b.opening.evidence, null, opcoes.evidenceText ?? null).join("; ")}]` : ""}`,
    ...(ordemDaBusca ? [ordemDaBusca] : []),
    ...(ficamDepois(0).length ? [`Logo depois da abertura, a página publicada continua com ${citados(ficamDepois(0))}: seção própria, reescrita na voz.${ficamDepois(0).flatMap(item => imagensDaPagina(item.current).map(vaga => ` Imagem: ${vaga} em "${corte(item.current, 80)}".`)).join("")}`] : []),
    "",
    ...b.sections.flatMap((secao, indice) => [
      `## ${secao.h2}`,
      /* 2026-10-09 (correção) · 12 · na seção enquadrada, a pergunta diz de que lado é respondida. */
      `- Pergunta do leitor: ${secao.readerQuestion}${paraOLeitor(secao) ? ` (responda do ponto de vista de quem vende: o que ${negocioDoLeitor} ganha e perde com isso, não como quem compra escolhe)` : ""}`,
      ...origemDaSecao(payload, secao),
      `- Abre respondendo: ${comFonte(semCena(secao.answerFirst) ?? RESPOSTA_SEM_CENA, indice)}${paraOLeitor(secao) && orientaQuemCompra(secao.answerFirst) ? reescritaParaOLeitor : ""}`,
      /* 2026-10-09 · 12 · a seção que fala com quem compra, num artigo para quem vende: o enquadramento concluído. */
      ...(enquadramento(secao) ? [enquadramento(secao)!] : []),
      ...(absorvidos(indice + 1).length ? [`- Da página publicada, entra aqui (reescrito na voz): ${citados(absorvidos(indice + 1))}`] : []),
      ...secao.h3.map(h3 => `  ### ${h3}`),
      ...secao.explain.flatMap(item => semCena(item) ?? []).map(item => `- Explicar: ${comFonte(item, indice)}${paraOLeitor(secao) && orientaQuemCompra(item) ? reescritaParaOLeitor : ""}`),
      `- ~${paragrafosDoPlano?.perSection[indice] ?? secao.paragraphs} parágrafo(s)${secao.bold.length ? ` · negrito em: ${secao.bold.join(", ")}` : ""}`,
      ...(secao.terms.length ? [`- Termos a nomear: ${secao.terms.join(" · ")}`] : []),
      ...(secao.evidence.length ? [`- Evidências: ${rotuloDaEvidencia(payload, secao.evidence, lentesDoDominio, opcoes.evidenceText ?? null).join("; ")}`] : []),
      ...linksDaSecao(secao).map(link => { const destino = candidato.get(link.candidate); return `- Link interno: âncora "${link.anchor}" → ${destino ? rotuloDoDestino(destino) : link.candidate}`; }),
      ...secao.externalLinks.map(link => linhaDoLinkExterno(link, indice)),
      /* 2026-10-09 · Defeito 3(b) · o assunto de outro artigo do Silo que a seção toca: só mencione e linke (a nota vem do CSV). */
      ...(opcoes.sectionNotes?.(secao, indice, rotuloDoLinkPara) ?? []),
      ...(secao.specialist ? [`- Especialista: usar ${secao.specialist}`] : []),
      ...(secao.video ? [videoDaSecao(payload, secao.video, aoVivo)] : []),
      /* 2026-10-08 · P1 · a mesma âncora do plano visual: a vaga resolvida pelo título. */
      ...(imagensDaSecao(secao, indice).length ? [`- Imagem: ${imagensDaSecao(secao, indice).join(", ")}`] : []),
      /* 2026-10-09 · 9 · a demonstração sem resultado atribuído, e pela trava de fonte como o resto do texto. */
      ...(secao.practical ? [`- Entrega prática: ${comFonte(radarArticleBlueprintPracticalWithoutResult(secao.practical), indice)}`] : []),
      /* 2026-10-09 · 10 · a continuação, opcional, no corpo da seção dela. */
      ...(continuacao?.secao === indice ? [continuacao.linha] : []),
      ...ficamDepois(indice + 1).map(item => `- Depois desta seção, a página publicada continua com "${corte(item.current, 80)}": seção própria, reescrita na voz.${imagensDaPagina(item.current).length ? ` Imagem: ${imagensDaPagina(item.current).join(", ")}.` : ""}`),
      ...(indice < b.sections.length - 1 ? [""] : []),
    ]),
    ...(descartados.length
      ? ["", `Descartado do esqueleto da SERP: ${descartados.map(item => `${item.id}${doEsqueleto.get(item.id) ? ` "${doEsqueleto.get(item.id)!.heading}"` : ""}${item.reason ? ` (${radarArticleBlueprintSectionRefsByTitle(item.reason, tituloDaPlanta(item))})` : ""}`).join("; ")}.`]
      : []),
    ...(removidosDaPagina.length
      ? ["", `Sai da página publicada (decisão registrada no artigo-modelo): ${removidosDaPagina.map(item => `"${corte(item.current, 80)}" (${item.reason.replace(/[.;:\s]+$/, "")})`).join("; ")}.`]
      : []),
    /* 2026-10-09b · a seção (ou o H3) da planta que cobria um assunto que o reajuste tirou do artigo: a nota concluída (D10). */
    ...(leitura.removedSections.length
      ? ["", `Sai do artigo-modelo (exclusão do ArticleDNA, decidida no Arquiteto): ${leitura.removedSections.map(item => `${item.h3 === null ? `seção "${item.section}"` : `H3 "${item.h3}" (seção "${item.section}")`} — trata de "${item.exclusion.label}"${item.exclusion.owner ? `, assunto do artigo "${item.exclusion.owner}"` : ""}`).join("; ")}. Não entra no texto.`]
      : []),
    "",
    `Fechamento: ${comFonte(b.closing.turn, null)}${b.closing.specialist ? ` (voz do especialista ${b.closing.specialist})` : ""}`,
    ...(fechamentoDaPagina.length ? [`Da página publicada, entra no fechamento (reescrito na voz): ${citados(fechamentoDaPagina)}.`] : []),
    ...(opcoes.specialistCta ? [`CTA (a única chamada) — argumento do especialista, inteiro: ${t(opcoes.specialistCta).replace(/[.\s]+$/, "")}.`] : [`CTA: ${comFonte(b.closing.cta, null)}`]),
    /* 2026-10-09 · 10 · a chamada que cita a página comercial leva o link dela (o L do plano de links). */
    ...(linhaDoLinkDoCta ? [linhaDoLinkDoCta] : []),
    /* 2026-10-09 · 10 · com a continuação dita pelo CSV, o fechamento não ganha segunda saída: ela está no corpo, na seção dela. */
    ...(!comContinuacao && b.closing.nextStep ? [`Próximo passo: ${proximoPassoMarcado}`] : []),
    ...(b.eeat.length ? ["", `E-E-A-T: ${b.eeat.join(" · ")}`] : []),
    /* 2026-10-08 · C4 · a lista concluída: o que só entra com fonte do pacote ou delimitado (a regra geral 5). */
    ...(travadas.size
      ? ["", `Afirmações que só entram com fonte do pacote ou delimitadas (regra geral 5): ${[...travadas.values()].join("; ")}. Sem fonte do pacote, escreva de forma qualificada ou omita; nenhuma ganha link externo sem fonte.`]
      : []),
  ].join("\n");

  const links = b.sections.flatMap(secao => linksDaSecao(secao).map(link => ({ secao: secao.h2, link })));
  const comDestinoPlanejado = links.some(({ link }) => candidato.get(link.candidate)?.status === "PLANNED");
  const linksInternos = links.length
    ? [
      `Aplique somente estes ${links.length} link(s), com a âncora indicada (pode ajustar concordância):`,
      /* 2026-10-08 · C9 · a regra do destino planejado, uma vez: condicional e concluída. */
      ...(comDestinoPlanejado ? ["Destino planejado (ainda não publicado): o link entra com a URL final quando o destino estiver no ar junto com este artigo ou antes; se este artigo for ao ar primeiro, a âncora fica como texto simples, sem link (nunca link quebrado). O caminho planejado não é endereço publicado: não invente domínio nem URL."] : []),
      ...links.map(({ secao, link }, indice) => {
        const destino = candidato.get(link.candidate);
        /* 2026-10-09 · o candidato da SiloPage já se chama `SiloPage "X"`: com o papel na frente, sai `SiloPage "X"`, sem repetir. */
        const nomeDoDestino = destino ? (destino.role === "SiloPage" && /^SiloPage\s/.test(rotuloDoDestino(destino)) ? rotuloDoDestino(destino) : `${destino.role} "${rotuloDoDestino(destino)}"`) : "";
        return `L${indice + 1} · âncora "${link.anchor}" → ${destino ? `${nomeDoDestino}${enderecoDoDestino(destino) || ` (${status(destino)})`}` : link.candidate} · onde: seção "${secao}"${link.reason ? ` · por quê: ${link.reason}` : ""}`;
      }),
    ].join("\n")
    : "Nenhum link interno no artigo-modelo.";

  return {
    promessa_e_leitor: ([`Leitor: ${leitorUnico}`, `Promessa: ${promessaMarcada}`, `Ângulo: ${anguloMarcado}${evidenciaDoAngulo.length ? ` [${rotuloDaEvidencia(payload, evidenciaDoAngulo, null, opcoes.evidenceText ?? null).join("; ")}]` : ""}`].join("\n")),
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
      /* 2026-10-08 · P1 · a seção pelo TÍTULO resolvido (nunca o número que a IA escreveu). */
      ...visualMarcado.map((item, posicao) => [
        `${item.slot === "CAPA" ? "Capa" : `Respiro ${item.slot.slice(1)}`}${ancoras[posicao].title ? ` · seção "${ancoras[posicao].title}"` : ""}${item.concept ? ` · ${item.concept}` : ""}`,
        `  Prompt: ${item.prompt}`,
        ...(/\b\d{1,2}\s*:\s*\d{1,2}\b/.test(item.prompt) ? [] : [`  Proporção: ${item.slot === "CAPA" ? "16:9" : "4:3"} (referência; ajuste ao layout do site e à voz da marca)`]),
        ...(item.alt ? [`  ALT: ${item.alt}`] : []),
        ...(item.caption ? [`  Legenda: ${item.caption}`] : []),
      ].join("\n")),
      ...cenasRepetidas,
    ].join("\n")),
  };
}
