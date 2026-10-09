import assert from "node:assert/strict";
import test from "node:test";
import { buildRadarYoutubeUniverse, RadarYoutubeSearchResultSchema } from "../lib/radar/youtube-search-model.ts";
import { buildRadarYoutubeRunFingerprint, buildRadarYoutubeSearchRun, RADAR_YOUTUBE_PROVIDER_ENDPOINT } from "../lib/radar/youtube-search-run.ts";
import {
  buildRadarVideoBrandVoiceRow,
  RADAR_VIDEO_EXPORT_CELL_CHARS,
  buildRadarVideoExportArticle,
  radarPortableVideoExport,
  radarVideoExportYoutubeOf,
  type RadarVideoExportYoutube,
} from "../lib/radar/portable-video-export.ts";
import { radarOutOfScopeMatcher } from "../lib/radar/out-of-scope.ts";
import { RADAR_YOUTUBE_PERTINENT_RULER } from "../lib/radar/youtube-blueprint.ts";
import { radarWritingOutOfScopeMatcher } from "../lib/radar/portable-writing-export.ts";
import { radarPortableWritingExport } from "../lib/radar/portable-writing-batch.ts";
import {
  RadarArticleBlueprintAiSchema,
  buildRadarArticleBlueprintBrief,
  radarArticleBlueprintOutOfScopeMatcher,
  radarSanitizeArticleBlueprint,
  type RadarArticleBlueprintPayload,
} from "../lib/radar/article-blueprint.ts";
import { radarPortableVideoContext, type RadarPortableSpecialistContext, type RadarPortableVideoUsageInput } from "../lib/radar/portable-annex-context.ts";
import { buildRadarVideoEvidenceLayer } from "../lib/radar/video-evidence.ts";
import { radarBrandVoiceSectionIsArticleDelivery, type RadarBrandVoice, type RadarBrandVoiceState } from "../lib/radar/brand-voice.ts";
import type { RadarPortableExportInput } from "../lib/radar/portable-export.ts";
import { ARTIGO, EXPORTADO_EM, contextoDePesquisa, entradaGoogle } from "./radar-portable-writing-fixtures.mts";

/*
 * ===== O CSV DE VÍDEO CAPRICHADO — 2026-10-02 =====
 *
 * Pedido do dono: "caprichar para criar os vídeos com o mesmo assunto dos
 * artigos, e esses vídeos podem fazer parte do artigo". A avaliação veio de um
 * CSV real (Instagram para clínicas); cada régua aqui é provada com DOIS
 * assuntos que não têm nada em comum — Instagram para clínicas de estética
 * (artigo) e implante dentário (landing page) —, para nenhuma regra ser do caso.
 *
 *   1 · o gancho abre pelo próprio tema e pela promessa da pesquisa do YouTube;
 *   2 · capítulos: sequência numerada e escolhida, até 6, pelos mesmos filtros
 *       do CSV para escrever;
 *   3 · o "não cobrir" alcança termos e entidades;
 *   4 · cortes saem dos capítulos, cada um funcionando sozinho;
 *   5 · público de preenchimento cede à Skill de voz; 6 · volume do Google;
 *   7 · especialista com nome e limitação de APOIO; 8 · prompt e bloqueio;
 *   9 · a linha "Voz da marca" só com o que serve ao vídeo;
 *  10 · por que cada vídeo do topo está ali; 11 · vídeo × artigo;
 *  12 · vídeos selecionados pela marca; 13 · a régua única do "não cobrir".
 *
 * PROVIDER_CALLS = 0 e AI_CALLS = 0: só fixtures, e a rede é recusada.
 */

const idasAoServidor: string[] = [];
Object.defineProperty(globalThis, "fetch", {
  value: (entrada: unknown) => {
    idasAoServidor.push(String((entrada as { url?: string })?.url || entrada));
    return Promise.reject(new Error("REDE PROIBIDA NESTE GATE"));
  },
  writable: true, configurable: true,
});

/* ============================== as fixtures ============================== */

const pergunta = (canonicalQuestion: string, pages: number, status = "MARKET_QUESTION_UNDERCOVERED") =>
  ({ canonicalQuestion, status, pages, sampleSize: 12, declaredByArticle: false, evidence: `${pages} de 12` });
const conceito = (canonicalLabel: string, sourceCount: number) =>
  ({ canonicalLabel, status: "RECURRENT", sourceCount, sampleSize: 12, queries: [], evidence: `${sourceCount} de 12` });
const candidatoFora = (observedLabel: string) =>
  ({ id: `cand:${observedLabel.length}`, observedLabel, pages: 4, sampleSize: 12, dnaAligned: false, dnaRequired: false, intentFit: false, verdict: "OUT_OF_SCOPE", reason: "O assunto pertence a outra página do site.", sectionId: null });

type Assunto = {
  principal: string;
  secundarias: Array<[string, number]>;
  volumePrincipal: number;
  assunto: string | null;
  audience: string;
  promise: string;
  slug: string;
  canonical: string;
  contentType: string | null;
  perguntas: Array<[string, number]>;
  conceitos: Array<[string, number]>;
  foraDoEscopo: string[];
};

/**
 * A entrada do Pilar da bancada, com o assunto trocado inteiro: keywords,
 * Assunto, perguntas, conceitos e o "não cobrir". Sem SERP observada, sem
 * descoberta e sem autoridade do skincare: só o que o assunto declara.
 */
function entradaDoAssunto(a: Assunto, extra: Partial<RadarPortableExportInput> = {}): RadarPortableExportInput {
  const base = entradaGoogle();
  const observado = structuredClone(base.googleObserved) as unknown as Record<string, unknown> & { concepts: Record<string, unknown> };
  observado.questions = a.perguntas.map(([texto, paginas]) => pergunta(texto, paginas));
  observado.concepts = { ...observado.concepts, all: a.conceitos.map(([texto, fontes]) => conceito(texto, fontes)) };
  observado.gaps = [];
  observado.differentiations = [];
  observado.aiDiscovery = null;
  observado.authorityEvidence = null;
  const modelo = structuredClone(base.articleModel) as unknown as Record<string, unknown>;
  modelo.candidates = a.foraDoEscopo.map(candidatoFora);
  const dossie = structuredClone(base.dossierGaps!) as unknown as { observed: Record<string, unknown> };
  dossie.observed = observado;
  const contexto = structuredClone(contextoDePesquisa()) as unknown as { keywords: Array<Record<string, unknown> & { identity: Record<string, unknown>; strategy: Record<string, unknown> }>; article: Record<string, unknown> };
  const molde = contexto.keywords[0];
  contexto.keywords = [[a.principal, a.volumePrincipal, "principal"] as const, ...a.secundarias.map(([texto, volume]) => [texto, volume, "secundaria"] as const)]
    .map(([texto, volume, papel], indice) => ({ ...molde, identity: { ...molde.identity, keywordId: `k-${indice}`, text: texto, role: papel }, strategy: { ...molde.strategy, volume } }));
  contexto.article = { ...contexto.article, ...(a.assunto ? { subject: { phrase: a.assunto, note: null, destinationUrl: null } } : {}) };
  return {
    ...base,
    googleObserved: observado as never,
    articleModel: modelo as never,
    dossierGaps: dossie as never,
    researchContext: contexto as never,
    serpObserved: undefined,
    article: {
      ...base.article,
      principalKeyword: a.principal,
      secondaryKeywords: a.secundarias.map(([texto]) => texto),
      narrativeReinforcements: [],
      mustCover: [],
      siloName: null,
      slug: a.slug,
      canonical: a.canonical,
      audience: a.audience,
      promise: a.promise,
      contentType: a.contentType,
    },
    ...extra,
  };
}

/* O caso real, reduzido: um artigo sobre Instagram para clínicas de estética. */
const INSTAGRAM: Assunto = {
  principal: "como atrair clientes pelo instagram",
  secundarias: [["captar clientes pela internet", 90]],
  volumePrincipal: 70,
  assunto: "clínicas de estética",
  /* O DNA chegou com o texto de preenchimento: isso não é público. */
  audience: "Pendente de enriquecimento e revisão humana",
  promise: "Cobrir com clareza o tema “como atrair clientes pelo instagram”.",
  slug: "como-atrair-clientes-pelo-instagram",
  canonical: "https://clinica-exemplo.com.br/como-atrair-clientes-pelo-instagram",
  contentType: null,
  perguntas: [
    ["Como captar clientes pela internet?", 12],
    ["Como atrair clientes pelo Instagram sendo uma clínica pequena?", 10],
    ["Aprendeu como atrair clientes no Instagram?", 9],
    ["Como prospectar clientes pelo Instagram com o Instagram Shopping?", 8],
    ["Quais dicas para atrair clientes pelo Instagram funcionam para clínicas?", 7],
    ["Quanto tempo leva para o Instagram trazer clientes?", 6],
    ["Vale a pena pagar anúncio para atrair clientes no Instagram?", 5],
  ],
  conceitos: [["Ative o Instagram Shopping", 6], ["frequência de postagem nos stories", 7], ["prova social com depoimentos de clientes", 5]],
  foraDoEscopo: ["Ative o Instagram Shopping", "Dicas de Instagram"],
};

/* Outro assunto, outro tipo: a landing page de implante dentário. */
const IMPLANTE: Assunto = {
  principal: "implante dentário",
  secundarias: [["implante dentário preço", 2400]],
  volumePrincipal: 9900,
  assunto: null,
  audience: "Adultos que perderam dentes e pesquisam reabilitação fixa.",
  promise: "Entender como o implante funciona antes de agendar a avaliação.",
  slug: "implante-dentario",
  canonical: "https://odonto-exemplo.com.br/implante-dentario",
  contentType: "landing_page",
  perguntas: [
    ["Implante dentário dói?", 11],
    ["E aí, gostou do guia de implante dentário?", 10],
    ["Quanto tempo dura um implante dentário?", 9],
    ["Clareamento caseiro com bicarbonato estraga o implante dentário?", 8],
    ["Quem tem diabetes pode fazer implante dentário?", 6],
  ],
  conceitos: [["clareamento caseiro com bicarbonato", 6], ["carga imediata no implante", 7]],
  foraDoEscopo: ["Clareamento caseiro com bicarbonato", "Guia completo de implante dentário"],
};

/* A pesquisa do YouTube do assunto: resultados sintéticos de vídeos longos, duas consultas. */
function youtubeDe(principal: string, segunda: string): RadarVideoExportYoutube {
  const resultado = (queryId: string, videoId: string, rank: number, title: string, extra: Record<string, unknown> = {}) => RadarYoutubeSearchResultSchema.parse({
    videoId, url: `https://m.youtube.com/watch?v=${videoId}&pp=rastreio`, title, channelName: `Canal ${videoId.slice(0, 3)}`, rank,
    durationSeconds: 600 + rank * 30, views: 12_000 * rank, isShorts: false, publishedAt: "2026-03-01T00:00:00.000Z", queryId, ...extra,
  });
  const results = [
    resultado("ytq:1", "aaaaaaaaaa1", 1, `${principal}: o passo a passo`),
    resultado("ytq:1", "bbbbbbbbbb2", 2, `Erros comuns em ${principal}`),
    resultado("ytq:1", "cccccccccc3", 3, `${principal} na prática`),
    resultado("ytq:2", "aaaaaaaaaa1", 2, `${principal}: o passo a passo`),
    resultado("ytq:2", "dddddddddd4", 1, `${segunda} explicado`),
  ];
  const run = buildRadarYoutubeSearchRun({
    runId: "run-1", runVersion: 1, startedAt: "2026-09-14T18:51:00.000Z", startedBy: "u",
    fingerprint: buildRadarYoutubeRunFingerprint({ articleId: "a1", articleDnaVersionId: "d1", queryIds: ["ytq:1", "ytq:2"] }),
    provenance: {
      provider: "dataforseo", endpoint: RADAR_YOUTUBE_PROVIDER_ENDPOINT, blockDepth: 20,
      queriesRequested: 2, queriesSucceeded: 2, queriesFailed: 0, failures: [], collectedAt: "2026-09-14T18:51:07.000Z",
    },
    queries: [
      { queryId: "ytq:1", text: principal, origin: "PRIMARY_KEYWORD", reason: "principal", executed: true, resultCount: 3 },
      { queryId: "ytq:2", text: segunda, origin: "SECONDARY_KEYWORD", reason: "secundária", executed: true, resultCount: 2 },
    ],
    results, universe: buildRadarYoutubeUniverse(results),
  });
  return radarVideoExportYoutubeOf({ run, frozen: null, declaredIntent: "INFORMATIONAL", editorialTopics: [], generatedAt: EXPORTADO_EM })!;
}

const SECOES_DA_VOZ: Array<[string, string]> = [
  ["1. Missão", "Conteúdo útil para negócios locais."],
  ["2. Identidade e oferta", "Oferta: site, páginas de serviço e artigos."],
  ["3. Público prioritário", "Donas de clínicas de estética e consultórios."],
  ["4. Voz: firme e humana", "Linguagem próxima e adulta."],
  ["6. Responder diretamente à keyword", "O primeiro parágrafo responde à intenção."],
  ["9. FAQ e dados estruturados", "Sem FAQ separado."],
  ["10. Recursos antigos ou inadequados", "Não recomendar Instagram Shopping."],
  ["11. Construção do artigo e transição comercial", "Resposta direta, depois a oferta."],
  ["12. Links e conteúdo já publicado", "Página comercial: https://agencia-exemplo.com.br/servicos/marketing-para-clinicas"],
  ["13. Plano visual", "Uma capa e dois ou três respiros."],
];
const VOZ: RadarBrandVoice = {
  versionId: "voz-1", version: 3, name: "Agência Exemplo", contentHash: "sha256:voz", status: "active", title: "Agência Exemplo",
  sections: SECOES_DA_VOZ.map(([heading, body]) => ({ heading, body })),
  markdown: ["Site: https://agencia-exemplo.com.br/", ...SECOES_DA_VOZ.map(([heading, body]) => `## ${heading}\n\n${body}`)].join("\n\n"),
};
const COM_VOZ: RadarBrandVoiceState = { kind: "available", voice: VOZ };

const linhaDe = (entrada: RadarPortableExportInput, contexto: Partial<Parameters<typeof buildRadarVideoExportArticle>[1]> = {}) =>
  buildRadarVideoExportArticle(entrada, { position: 1, youtube: null, ...contexto }).row;

/* 2026-10-09 · o lote de vídeo sai só com a planta APPROVED de cada artigo: o CSV vem do estado "ready". */
const csvPronto = (saida: ReturnType<typeof radarPortableVideoExport>): string => {
  assert.equal(saida.status, "ready", "cada artigo do lote leva a planta APPROVED");
  return saida.status === "ready" ? saida.csv : "";
};
const comPlanta = (entrada: RadarPortableExportInput) => ({ entrada, blueprint: artigoModeloDe(entrada, "APPROVED") });

const capitulosDe = (roteiro: string) => {
  const inicio = roteiro.split("\n").findIndex(linha => /^Capítulos do vídeo principal \(\d+,/.test(linha));
  assert.ok(inicio >= 0, roteiro);
  const declarado = Number(roteiro.split("\n")[inicio].match(/\((\d+),/)![1]);
  const itens: string[] = [];
  for (const linha of roteiro.split("\n").slice(inicio + 1)) {
    if (!/^\d+\. /.test(linha)) break;
    itens.push(linha);
  }
  return { declarado, itens };
};

/* ================================ 1 ================================ */

test("1 · o gancho abre pelo próprio tema e pela pergunta da abertura da planta (só a que fala da principal); a promessa é a premissa da planta", () => {
  /*
   * 2026-10-09 · regra do dono: o processo antigo é substituído. A "Promessa
   * (pesquisa do YouTube)" (estratégia da amostra inteira), o "A SERP do
   * YouTube pede para o gancho" (roteiro genérico) e a promessa do DNA sem
   * trava saíram do gancho: a promessa é a premissa da planta, pela trava.
   */
  const entrada = entradaDoAssunto(INSTAGRAM);
  const planta = artigoModeloDe(entrada, "APPROVED");
  const instagram = linhaDe(entrada, { youtube: youtubeDe(INSTAGRAM.principal, "instagram para clínicas"), blueprint: planta }).diretrizes_de_roteiro;
  const gancho = instagram.split("\n")[0];
  assert.match(gancho, /^Gancho \(primeiros 15 segundos\): abra pelo próprio tema, "como atrair clientes pelo instagram", no recorte "clínicas de estética", respondendo "Como atrair clientes pelo Instagram\?" logo de cara, sem apresentação longa\. A promessa é a premissa do vídeo, dita abaixo\.$/);
  assert.doesNotMatch(instagram, /Promessa \(pesquisa do YouTube\)|A SERP do YouTube pede|Promessa: Cobrir com clareza/, "nada da régua de antes no gancho");
  /* A pergunta ampla da abertura, por mais buscada, não abre o vídeo. */
  const ampla = { ...planta, blueprint: { ...planta.blueprint, opening: { ...planta.blueprint.opening, readerQuestion: "Como captar clientes pela internet?" } } };
  assert.doesNotMatch(linhaDe(entrada, { blueprint: ampla }).diretrizes_de_roteiro.split("\n")[0], /respondendo|captar clientes pela internet/);

  /* Outro assunto: a busca relacionada no recorte; a promessa do DNA não abre o gancho. */
  const doImplante = entradaDoAssunto(IMPLANTE);
  const implante = linhaDe(doImplante, { blueprint: artigoModeloDe(doImplante, "APPROVED") }).diretrizes_de_roteiro.split("\n")[0];
  assert.match(implante, /abra pelo próprio tema, "implante dentário" \(busca relacionada: "implante dentário preço"\), sem apresentação longa\./);
  assert.doesNotMatch(implante, /Entender como o implante funciona|gostou/i);
});

/* ================================ 2 ================================ */

test("2 · capítulos só pela planta (2026-10-09): as seções do artigo-modelo, numeradas; sem planta APPROVED, nenhum roteiro pela régua de antes", () => {
  const entrada = entradaDoAssunto(INSTAGRAM);
  const roteiro = linhaDe(entrada, { youtube: youtubeDe(INSTAGRAM.principal, "instagram para clínicas"), blueprint: artigoModeloDe(entrada, "APPROVED") }).diretrizes_de_roteiro;
  assert.match(roteiro, /^Capítulos do vídeo principal \(3, da planta do artigo-modelo da SERP; /m);
  for (const [numero, h2] of [[1, "Por que o perfil não traz pacientes"], [2, "Roteiro de três stories"], [3, "Prova social"]] as const) {
    assert.match(roteiro, new RegExp(`^${numero}\\. ${h2}$`, "m"));
  }
  assert.match(roteiro, /^Formato do vídeo: vídeo longo — /m, "a decisão única de formato, pela amostra pertinente");
  assert.doesNotMatch(roteiro, /BLOCO \d|HOOK|CONTEXTO|DEMONSTRAÇÃO|Pergunta do público: "Como atrair clientes pelo Instagram sendo/, "nenhum bloco do roteiro genérico nem pergunta solta como capítulo");
  assert.doesNotMatch(roteiro, /Ritmo que a SERP do YouTube sugere|Roteiro RECOMENDADO|Oportunidades de título \(coorte que lidera/, "nada da régua de antes");
  assert.doesNotMatch(roteiro, /^(Linguagem e nível técnico|Posicionamento|Urgência e recência|Foco e CTA|Formato): /m, "as estratégias da amostra inteira saíram");

  /* Sem planta, ou com a proposta (DRAFT): a linha não monta roteiro. */
  for (const semPlanta of [linhaDe(entradaDoAssunto(IMPLANTE)), linhaDe(entrada, { blueprint: artigoModeloDe(entrada, "DRAFT") })]) {
    assert.match(semPlanta.diretrizes_de_roteiro, /^Roteiro: só com o artigo-modelo aprovado deste artigo/m);
    assert.doesNotMatch(semPlanta.diretrizes_de_roteiro, /^Capítulos|Pergunta do público/m);
    assert.match(semPlanta.pode_gravar, /^Não, sem o artigo-modelo aprovado deste artigo/);
    assert.match(semPlanta.prompt, /^Não escreva o roteiro deste vídeo sem o artigo-modelo aprovado deste artigo/);
  }
});

/* ================================ 3 ================================ */

test("3 · o \"não cobrir\" alcança termos e perguntas — e a palavra genérica do rótulo não tira o que é do tema", () => {
  const instagram = linhaDe(entradaDoAssunto(INSTAGRAM));
  assert.doesNotMatch(instagram.termos_e_entidades, /Shopping/);
  assert.match(instagram.termos_e_entidades, /frequência de postagem nos stories/);
  assert.doesNotMatch(instagram.perguntas_do_publico, /Shopping|Aprendeu/);
  /* "Dicas de Instagram" está fora do escopo — e "dicas" sozinha não tira a pergunta do tema. */
  assert.match(instagram.perguntas_do_publico, /Quais dicas para atrair clientes pelo Instagram funcionam para clínicas\?/);

  const implante = linhaDe(entradaDoAssunto(IMPLANTE));
  assert.doesNotMatch(implante.termos_e_entidades + implante.perguntas_do_publico, /bicarbonato/i);
  assert.match(implante.termos_e_entidades, /carga imediata no implante/);
  assert.match(implante.perguntas_do_publico, /Quanto tempo dura um implante dentário\?/, "\"Guia completo de…\" fora do escopo não tira o que é do tema");
});

/* ================================ 4 ================================ */

test("4 · cortes: só capítulos da planta que funcionam sozinhos, pela utilidade; legenda por acessibilidade; ausência de Shorts é da amostra", () => {
  for (const [assunto, youtube] of [[INSTAGRAM, youtubeDe(INSTAGRAM.principal, "instagram para clínicas")], [IMPLANTE, null]] as const) {
    const entrada = entradaDoAssunto(assunto);
    const row = linhaDe(entrada, { youtube, blueprint: artigoModeloDe(entrada, "APPROVED") });
    const cortes = row.cortes_para_redes;
    /* 2026-10-07 · o rótulo "um por capítulo do vídeo principal" mentia com 3 cortes para 5 capítulos: agora diz quantas ideias foram escolhidas. */
    /* 2026-10-09 · só pela planta: o capítulo com uma ação é o que funciona sozinho; o corte "um por bloco" da régua de antes saiu. */
    assert.match(cortes, /^Cortes sugeridos \(Shorts, Reels e TikTok\): 1 ideia escolhida dos capítulos pela utilidade isolada /m);
    assert.match(cortes, /^1\. Do capítulo 2 \(Roteiro de três stories\):$/m);
    assert.match(cortes, /^Capítulos sem corte: 1 \(sem demonstração definida na planta\) · 3 \(sem demonstração definida na planta\)\.$/m);
    assert.doesNotMatch(cortes, /um por bloco do vídeo principal|a resposta direta à pergunta, em uma frase|o bloco não abre/, "nenhum corte pela régua de antes");
    assert.doesNotMatch(cortes, /sem som/i, "nada de generalização sem fonte sobre como o público assiste");
    assert.match(cortes, /Legenda na tela em todos os cortes, por acessibilidade e compreensão/);
    /* 2026-10-02 · cada corte com gancho, ideia única, o que mostrar e fechamento; o carrossel, uma mensagem por lâmina. */
    assert.match(cortes, /^ {3}Gancho: "Roteiro de três stories\?"$/m);
    assert.match(cortes, /^ {3}Ideia única: Resposta direta\.$/m);
    assert.match(cortes, /^ {3}Mostrar: a ação — um roteiro de três stories para a semana — num exemplo fictício identificado como ilustrativo\.$/m);
    /* 2026-10-07 · o fechamento diz o destino com endereço e UM CTA só (antes era só "convite para o vídeo longo ou o artigo"). */
    assert.match(cortes, /^ {3}Fechamento: CTA: (?:o artigo|a landing page) \(https:[^)]+\) ou o vídeo longo quando publicado — um só por corte\.$/m);
    /* 2026-10-07 · a origem vem RECOMENDADA, com o motivo, e a outra opção fica como alternativa. */
    assert.doesNotMatch(cortes, /decida na produção/, "a origem vem recomendada, não deixada em aberto");
    assert.match(cortes, /^ {3}Origem recomendada: extrair da gravação do capítulo 2 e reenquadrar na vertical — motivo: o capítulo abre respondendo a mesma pergunta e mostra uma ação só\. Alternativa: gravar à parte com fala própria\.$/m);
    assert.match(cortes, /uma mensagem por lâmina/);
  }
  assert.match(linhaDe(entradaDoAssunto(INSTAGRAM), { youtube: youtubeDe(INSTAGRAM.principal, "instagram para clínicas") }).cortes_para_redes, /^Shorts: nenhum Short do tema nesta amostra/);
  assert.match(linhaDe(entradaDoAssunto(IMPLANTE)).cortes_para_redes, /^Shorts: sem pesquisa do YouTube, não há amostra de Shorts do tema/);
});

/* ================================ 5 e 6 ================================ */

test("5 · público: o preenchimento do DNA cede ao trecho de público da Skill de voz, com a origem; sem nenhum, a definir", () => {
  const comVoz = linhaDe(entradaDoAssunto(INSTAGRAM), { brandVoice: COM_VOZ }).tema_e_publico;
  assert.doesNotMatch(comVoz, /Pendente de enriquecimento/);
  assert.match(comVoz, /^Público: Donas de clínicas de estética e consultórios\.$/m);
  assert.match(comVoz, /^Origem do público: o artigo não define; vem do trecho "Público prioritário" da Skill de voz da marca, Skill "Agência Exemplo" v3 \(ativa na Marca\)\.$/m);
  assert.doesNotMatch(comVoz, /Promessa ao público: Cobrir com clareza/, "a promessa de preenchimento também não vale");

  /* 2026-10-08 (correção da revisão) · D10: sem público dito, quem faz a busca — não "a definir". */
  assert.match(linhaDe(entradaDoAssunto(INSTAGRAM)).tema_e_publico, /^Público: quem busca "como atrair clientes pelo instagram" \(o artigo não define público e a marca não tem Skill de voz com o público\)\.$/m);
  /* O público real do artigo vence a Skill. */
  assert.match(linhaDe(entradaDoAssunto(IMPLANTE), { brandVoice: COM_VOZ }).tema_e_publico, /^Público: Adultos que perderam dentes e pesquisam reabilitação fixa\.$/m);
});

test("6 · volume: diz que é busca no Google, do Minerador — não audiência do YouTube", () => {
  const tema = linhaDe(entradaDoAssunto(INSTAGRAM)).tema_e_publico;
  assert.match(tema, /^Tema \(keyword principal\): como atrair clientes pelo instagram · 70\/mês no Google$/m);
  assert.match(tema, /^- captar clientes pela internet · 90\/mês no Google$/m);
  assert.match(tema, /^Volume: buscas mensais no Google, do Minerador \(não é audiência nem busca do YouTube\)\.$/m);
  assert.match(linhaDe(entradaDoAssunto(IMPLANTE)).tema_e_publico, /implante dentário · 9\.900\/mês no Google/);
});

/* ================================ 7 ================================ */

const APOIO: RadarPortableSpecialistContext = {
  state: "RECEIVED",
  note: "Revisadas por uma pessoa.",
  items: [{
    requirementQuestion: "O implante dentário dói?",
    questionsSent: ["O implante dentário dói?"],
    contribution: "A anestesia local controla a dor durante o procedimento; o desconforto depois costuma ser leve.",
    fullAnswer: "A anestesia local controla a dor durante o procedimento; o desconforto depois costuma ser leve.",
    classification: "Orientação clínica", status: "Apoio", approved: true, appliesTo: "a seção sobre dor",
    quote: null, kind: null,
    limitations: ["Esta contribuição foi marcada como APOIO: ela orienta o texto, e não sustenta afirmação factual sozinha."],
  }],
  pending: 0, rejected: 0,
};

test("7 · especialista: o nome da aba Especialista, a fala adaptável com o mesmo sentido, e a limitação de APOIO viaja", () => {
  const especialista = linhaDe(entradaDoAssunto(IMPLANTE, {
    specialistContext: APOIO,
    authors: [{ name: "Dr. Paulo Lima", specialty: "Implantodontia", source: "contribution" }],
  })).especialista;
  assert.match(especialista, /^Especialista: Dr\. Paulo Lima \(Implantodontia\), da aba Especialista; sem credencial além do cadastro\.$/m);
  assert.match(especialista, /pode adaptar para linguagem falada, preservando o sentido e sem acrescentar afirmação/);
  assert.match(especialista, /marcada como APOIO: ela orienta o texto, e não sustenta afirmação factual sozinha\. No vídeo, orienta a fala; não prova fato/);
  assert.doesNotMatch(especialista, /ponto de aplicação/, "o aviso de seção do artigo não é do vídeo");

  /* Sem autoria lida: a frase de antes. Com a lista vazia: não inventar nome. */
  const semLeitura = linhaDe(entradaDoAssunto(INSTAGRAM, { specialistContext: APOIO })).especialista;
  assert.match(semLeitura, /^A voz de quem pratica \(atribuir como fala do especialista, sem inventar nome nem credencial;/);
  assert.match(linhaDe(entradaDoAssunto(INSTAGRAM, { authors: [] })).especialista, /^Especialista: nenhum definido na aba Especialista do Radar; não invente nome nem credencial\.$/m);
});

/* ================================ 8 ================================ */

test("8 · prompt: desta linha e da linha \"Voz da marca\"; com bloqueio, nada de roteiro antes de resolver", () => {
  const comVoz = lerCsv(csvPronto(radarPortableVideoExport({ articles: [comPlanta(entradaDoAssunto(INSTAGRAM))], today: EXPORTADO_EM, brandVoice: COM_VOZ })));
  assert.match(comVoz[2].prompt, /usando SOMENTE os dados desta linha e da linha "Voz da marca"\./);
  const semVoz = lerCsv(csvPronto(radarPortableVideoExport({ articles: [comPlanta(entradaDoAssunto(INSTAGRAM))], today: EXPORTADO_EM })));
  assert.match(semVoz[1].prompt, /usando SOMENTE os dados desta linha\.\n/);

  const base = entradaDoAssunto(IMPLANTE);
  const bloqueado = structuredClone(base.dossierGaps!) as unknown as { status: { readiness: unknown } };
  bloqueado.status.readiness = { ready: false, headline: "Pacote bloqueado", blocks: [{ code: "SERP_NOT_CURRENT", message: "A SERP do pacote não é a vigente." }] };
  const row = linhaDe({ ...base, dossierGaps: bloqueado as never });
  assert.match(row.pode_gravar, /^Não, até resolver o bloqueio:\n- a investigação tem bloqueio: /);
  assert.match(row.prompt, /^Não escreva o roteiro deste vídeo antes de resolver o bloqueio da investigação: .+ Depois de resolvido no Radar, exporte de novo para receber o prompt do roteiro\.$/);
  assert.doesNotMatch(row.prompt, /Escreva o roteiro de um vídeo/);
});

/* ================================ 9 ================================ */

test("9 · a linha \"Voz da marca\" do vídeo: público, voz, o que a marca não faz e CTA — título, plano visual e links são do artigo", () => {
  const voz = buildRadarVideoBrandVoiceRow(COM_VOZ)!;
  assert.equal(voz.intencao_e_formato, "", "H1, título e abertura são do artigo");
  assert.equal(voz.cortes_para_redes, "", "capa e respiros são do artigo");
  assert.match(voz.pode_gravar, /Fica fora desta linha \(vale para o artigo, não para o vídeo\): Responder diretamente à keyword; FAQ e dados estruturados; Links e conteúdo já publicado; Plano visual\./);
  assert.match(voz.tema_e_publico, /Donas de clínicas de estética/);
  assert.match(voz.diretrizes_de_roteiro, /^CTA, oferta e transição comercial \(Skill de voz\):\nConstrução do artigo e transição comercial:\nResposta direta, depois a oferta\./);
  assert.match(voz.diretrizes_de_roteiro, /Página da marca citada na Skill \(pode ir no CTA e na descrição do vídeo\): https:\/\/agencia-exemplo\.com\.br\/servicos\/marketing-para-clinicas/);
  assert.match(voz.diretrizes_de_roteiro, /O que a marca não faz \(vale para o vídeo, o corte e a descrição\):\nRecursos antigos ou inadequados:\nNão recomendar Instagram Shopping\./);
  assert.match(voz.prompt, /Linguagem próxima e adulta/);
  assert.doesNotMatch(Object.values(voz).join("\n"), /Uma capa e dois ou três respiros|O primeiro parágrafo responde|Sem FAQ separado/);
});

/* ================================ 10 ================================ */

test("10 · cada vídeo do topo diz por que está ali (classe e sinal) e por qual consulta — sem afirmar o conteúdo", () => {
  const serp = linhaDe(entradaDoAssunto(INSTAGRAM), { youtube: youtubeDe(INSTAGRAM.principal, "instagram para clínicas") }).serp_youtube;
  assert.match(serp, /Vídeos no topo \(melhor posição entre as consultas; o motivo é da leitura da SERP .*não do conteúdo, que não foi assistido\):/);
  const linhas = serp.split("\n");
  const primeiro = linhas.findIndex(linha => /^1\. como atrair clientes pelo instagram: o passo a passo/.test(linha));
  assert.ok(primeiro > 0, serp);
  assert.match(linhas[primeiro], /https:\/\/www\.youtube\.com\/watch\?v=aaaaaaaaaa1/, "o endereço canônico, sem rastreio");
  /*
   * 2026-10-02 · revisão: o "por quê" ficou curto para a lista caber na célula
   * (ver 10b). O motivo da classe é dito uma vez, na legenda; as consultas, pelo
   * número da linha "Consultas:"; a recorrência, na linha do vídeo.
   */
  assert.match(serp, /^Consultas: 1\) como atrair clientes pelo instagram · 2\) instagram para clínicas$/m);
  assert.match(serp, /^Classe de cada vídeo \(motivo do universo, pela SERP\): vídeo longo comparável — Vídeo editorial com duração que sustenta comparação/m);
  assert.equal((serp.match(/Vídeo editorial com duração que sustenta comparação/g) || []).length, 1, "o motivo da classe, uma vez só");
  /* 2026-10-02 · conta perspectivas distintas (consulta que repete outra conta como a de origem). */
  assert.match(linhas[primeiro], / · aparece em 2 consultas distintas · /);
  assert.match(linhas[primeiro + 1], /^ {3}Por que está aqui: vídeo longo comparável · sinal (forte|médio): Chegou à posição 1 — topo da busca/);
  /* 2026-10-02 · a linha termina com a relevância para o público. */
  assert.match(linhas[primeiro + 1], / · consultas 1 e 2 · relevância: [^\n]+$/, "o vídeo achado pelas duas consultas diz as duas, pelo número");
  assert.doesNotMatch(linhas[primeiro + 1], /visualiza|Apareceu em/, "o que já está na linha do vídeo não se repete");
  assert.match(serp, /Nenhum vídeo foi assistido ou transcrito/);

  const implante = linhaDe(entradaDoAssunto(IMPLANTE), { youtube: youtubeDe(IMPLANTE.principal, "implante dentário preço") }).serp_youtube;
  assert.match(implante, /^Consultas: 1\) implante dentário · 2\) implante dentário preço$/m);
  assert.match(implante, /^ {3}Por que está aqui: [^\n]* · consulta 2 · relevância: [^\n]+$/m, "o vídeo achado só pela segunda consulta");
});

/*
 * 2026-10-02 · REVISÃO: A LISTA CHEIA NÃO EMPURRA O RESTO PARA FORA DA CÉLULA.
 *
 * Com dez vídeos e várias consultas, o "por que está aqui" de cada vídeo fazia
 * `serp_youtube` passar de 6.000 caracteres (teto da célula até 2026-10-02; hoje
 * `RADAR_VIDEO_EXPORT_CELL_CHARS`), e o corte da célula levava canais,
 * padrões, termos, lacunas, os vídeos da SERP do Google e o aviso "Nenhum vídeo
 * foi assistido". A régua vale para qualquer tema: dois assuntos, títulos
 * médios e longos, três e quatro consultas.
 */
function youtubeCheio(principal: string, consultas: readonly string[], tamanhoDoTitulo: number, canalLongo = false): RadarVideoExportYoutube {
  const enchimento = " — explicado com exemplos reais, erros comuns e o que ninguém conta antes de começar";
  /* O nome do canal não tem corte: o caso extremo força a lista a não caber inteira. */
  const canal = (numero: number) => (canalLongo ? `Canal de referência número ${numero}${enchimento.repeat(14)}` : `Canal de referência número ${numero % 5}`);
  const titulo = (numero: number) => `${principal} ${numero}${enchimento.repeat(3)}`.slice(0, tamanhoDoTitulo);
  const ids = consultas.map((_, indice) => `ytq:${indice + 1}`);
  /* Doze vídeos, dez por consulta, deslocados: quase todo vídeo aparece em mais de uma consulta. */
  const results = consultas.flatMap((_, q) => Array.from({ length: 10 }, (__, i) => {
    const numero = (i + q * 2) % 12;
    return RadarYoutubeSearchResultSchema.parse({
      videoId: `vid${String(numero).padStart(8, "0")}`, url: `https://m.youtube.com/watch?v=vid${String(numero).padStart(8, "0")}&pp=rastreio`,
      title: titulo(numero), channelName: canal(numero), rank: i + 1,
      durationSeconds: 540 + numero * 45, views: 4_500 * (numero + 1) * (numero + 3), isShorts: false,
      publishedAt: `2026-0${1 + (numero % 8)}-1${numero % 9}T00:00:00.000Z`, queryId: ids[q],
    });
  }));
  const run = buildRadarYoutubeSearchRun({
    runId: "run-cheio", runVersion: 1, startedAt: "2026-09-14T18:51:00.000Z", startedBy: "u",
    fingerprint: buildRadarYoutubeRunFingerprint({ articleId: "a1", articleDnaVersionId: "d1", queryIds: ids }),
    provenance: {
      provider: "dataforseo", endpoint: RADAR_YOUTUBE_PROVIDER_ENDPOINT, blockDepth: 20,
      queriesRequested: consultas.length, queriesSucceeded: consultas.length, queriesFailed: 0, failures: [], collectedAt: "2026-09-14T18:51:07.000Z",
    },
    queries: consultas.map((text, indice) => ({ queryId: ids[indice], text, origin: indice ? "SECONDARY_KEYWORD" : "PRIMARY_KEYWORD", reason: "consulta do artigo", executed: true, resultCount: 10 })),
    results, universe: buildRadarYoutubeUniverse(results),
  });
  return radarVideoExportYoutubeOf({ run, frozen: null, declaredIntent: "INFORMATIONAL", editorialTopics: [], generatedAt: EXPORTADO_EM })!;
}

test("10b · dez vídeos e várias consultas cabem na célula: canais, padrões, lacunas, a SERP do Google e o aviso final continuam lá", () => {
  const casos: Array<[RadarPortableExportInput, string, string[]]> = [
    [entradaGoogle(), "protetor solar para pele oleosa", ["protetor solar para pele oleosa", "melhor protetor solar para pele oleosa", "protetor solar oil free"]],
    [entradaDoAssunto(INSTAGRAM), INSTAGRAM.principal, [INSTAGRAM.principal, "instagram para clínicas", "marketing para clínicas de estética", "como divulgar clínica de estética no instagram"]],
    [entradaDoAssunto(IMPLANTE), IMPLANTE.principal, [IMPLANTE.principal, "implante dentário preço", "implante dentário carga imediata"]],
  ];
  for (const [entrada, principal, consultas] of casos) {
    for (const tamanho of [55, 75, 90]) {
      const youtube = youtubeCheio(principal, consultas, tamanho);
      assert.ok(youtube.blueprint?.recommended.gaps.length, "a amostra tem lacuna (sem Shorts): o teste precisa dela");
      const serp = linhaDe(entrada, { youtube }).serp_youtube;
      const quando = `${principal}, ${consultas.length} consultas, títulos de ${tamanho}`;
      assert.doesNotMatch(serp, /cortado no limite da célula/, quando);
      assert.ok(serp.length <= RADAR_VIDEO_EXPORT_CELL_CHARS, `${quando}: ${serp.length} caracteres`);
      /* 2026-10-09 · canais, padrões e lacunas pela amostra pertinente, e o rótulo diz. */
      for (const parte of [/^Canais que dominam \(pertinentes\): /m, /^Padrões de título \(vídeos longos, pertinentes\): /m, /^Lacunas no YouTube \(onde entrar; pertinentes\):$/m, /Nenhum vídeo foi assistido ou transcrito/]) {
        assert.match(serp, parte, quando);
      }
      /* Os dez vídeos do topo continuam listados, cada um com o porquê. */
      assert.equal(serp.split("\n").filter(linha => /^\d+\. /.test(linha)).length, 10, quando);
      assert.equal(serp.split("\n").filter(linha => /^ {3}Por que está aqui: /.test(linha)).length, 10, quando);
      assert.doesNotMatch(serp, /não couberam nesta célula/, `${quando}: a lista inteira cabe`);
    }
  }

  /* Caso extremo: a lista não cabe inteira. Sai o fim da lista, com a contagem dita — nunca o fim da coluna. */
  const extremo = linhaDe(entradaGoogle(), { youtube: youtubeCheio("protetor solar para pele oleosa", ["protetor solar para pele oleosa", "protetor solar oil free", "melhor protetor solar"], 90, true) }).serp_youtube;
  assert.doesNotMatch(extremo, /cortado no limite da célula/);
  assert.ok(extremo.length <= RADAR_VIDEO_EXPORT_CELL_CHARS, `${extremo.length} caracteres`);
  const listados = extremo.split("\n").filter(linha => /^\d+\. /.test(linha)).length;
  const omitidos = Number(extremo.match(/^\(\+(\d+) vídeo\(s\) do topo não couberam nesta célula; a lista inteira está na pesquisa do YouTube, no Radar\.\)$/m)?.[1] ?? 0);
  assert.ok(listados > 0 && omitidos > 0 && listados + omitidos === 10, `${listados} listados e ${omitidos} fora`);
  for (const parte of [/^Padrões de título \(vídeos longos, pertinentes\): /m, /^Lacunas no YouTube \(onde entrar; pertinentes\):$/m, /Nenhum vídeo foi assistido ou transcrito/]) assert.match(extremo, parte);
});

/* ================================ 11 ================================ */

function artigoModeloDe(entrada: RadarPortableExportInput, approval: "APPROVED" | "DRAFT"): RadarArticleBlueprintPayload {
  const brief = buildRadarArticleBlueprintBrief({ entrada, silo: null, articleId: ARTIGO, publication: null });
  const origem = brief.evidence[0]?.id || "M1";
  const secao = (h2: string, practical: string | null = null) => ({ h2, readerQuestion: `${h2}?`, answerFirst: "Resposta direta.", from: [origem], practical });
  const ai = RadarArticleBlueprintAiSchema.parse({
    keywordPlan: { reading: "A principal no H1." }, reader: "Leitor.", promise: "Promessa.", angle: { statement: "Ângulo." },
    title: { h1: "Como atrair clientes pelo Instagram: o guia da clínica", seoTitle: "SEO", metaDescription: "Meta." },
    opening: { readerQuestion: "Como atrair clientes pelo Instagram?", direction: "Responder." },
    sections: [secao("Por que o perfil não traz pacientes"), secao("Roteiro de três stories", "um roteiro de três stories para a semana"), secao("Prova social")],
    closing: { turn: "Virada.", cta: "CTA." },
    visual: [{ slot: "CAPA", prompt: "consultório" }, { slot: "R1", prompt: "celular" }, { slot: "R2", prompt: "agenda" }],
  });
  return { ...radarSanitizeArticleBlueprint(ai, brief).payload, approval };
}

test("11 · vídeo × artigo: a seção do artigo-modelo, o que o vídeo acrescenta, onde fica e o link na descrição", () => {
  const entrada = entradaDoAssunto(INSTAGRAM);
  const aprovado = linhaDe(entrada, { blueprint: artigoModeloDe(entrada, "APPROVED") }).diretrizes_de_roteiro;
  assert.match(aprovado, /^Vídeo × artigo \(o vídeo faz parte do artigo\):$/m);
  /* 2026-10-02 · D10: sem "(aprovado)" nem "(proposta…)": a planta vai concluída. */
  assert.match(aprovado, /^- Complementa a seção "Roteiro de três stories" do artigo-modelo da SERP\.$/m, "a seção com entrega prática é onde a demonstração rende");
  assert.match(aprovado, /^- O que o vídeo acrescenta: a demonstração de "um roteiro de três stories para a semana", com exemplo prático, sem repetir o texto\.$/m);
  assert.match(aprovado, /^- Onde fica: incorporado no artigo \(https:\/\/clinica-exemplo\.com\.br\/como-atrair-clientes-pelo-instagram\), nessa seção\.$/m);
  assert.match(aprovado, /^- Na descrição do vídeo: o link do artigo \(https:\/\/clinica-exemplo\.com\.br\/como-atrair-clientes-pelo-instagram\)\.$/m);
  assert.doesNotMatch(linhaDe(entrada, { blueprint: artigoModeloDe(entrada, "DRAFT") }).diretrizes_de_roteiro, /proposta da IA|aprovação/);
  /* 2026-10-09 · sem artigo-modelo APPROVED não há roteiro nem "Vídeo × artigo" pela régua de antes (a entrega pede a planta). */
  assert.doesNotMatch(linhaDe(entrada).diretrizes_de_roteiro, /^Vídeo × artigo|primeira seção prática/m);

  /* A landing page fala de si; sem endereço, a descrição diz quando ele existe. */
  const semEndereco = entradaDoAssunto({ ...IMPLANTE, canonical: "", slug: "" });
  const landing = linhaDe(semEndereco, { blueprint: artigoModeloDe(semEndereco, "APPROVED") }).diretrizes_de_roteiro;
  assert.match(landing, /^Vídeo × landing page \(o vídeo faz parte da landing page\):$/m);
  assert.match(landing, /^- Onde fica: incorporado na landing page, nessa seção\.$/m);
  assert.match(landing, /^- Na descrição do vídeo: o link da landing page \(o endereço da landing page quando publicada\)\.$/m);
  /* E a regra geral do arquivo fala do vídeo dentro da página. */
  const topo = lerCsv(csvPronto(radarPortableVideoExport({ articles: [comPlanta(entradaDoAssunto(IMPLANTE))], today: EXPORTADO_EM })))[0];
  assert.match(topo.prompt, /O vídeo pode fazer parte do artigo ou da página: incorporado na seção indicada em cada linha \(Vídeo × artigo ou página\)\./);
});

/* ================================ 12 ================================ */

const uso = (patch: Partial<RadarPortableVideoUsageInput> & { videoSourceId: string; usage: RadarPortableVideoUsageInput["usage"] }): RadarPortableVideoUsageInput => ({
  note: null, title: null, url: null, channel: null, duration: null, description: null, textPreview: null, ...patch,
});

test("12 · vídeos selecionados pela marca: canal de cada um, trecho com tempo no Apoio, seção no Incorporar e o começo da transcrição", () => {
  const camada = buildRadarVideoEvidenceLayer({
    identity: { frozenBundleId: "fb1", frozenBundleHash: "sha256:fb1", matchingRunId: "run-1", inputFingerprint: "m4:vs-apoio@v1", matcherVersion: 4, matchedAt: "2026-10-02T13:00:00.000Z" },
    briefs: [{
      briefId: "vb1", topic: "O implante dói?", narrativePurpose: "Tirar o medo da dor.", whatToLookFor: ["dor no implante"],
      relatedSectionId: "sec-1", relatedSectionTitle: "Implante dentário dói?",
      questions: [], entities: [], evidenceNeeded: "Fala de quem pratica.", priority: "HIGH",
    }],
    coverage: [{
      videoBriefId: "vb1", state: "SUPPORTED", reason: "Um trecho responde a pauta.",
      criteria: ["dor no implante"], matchedCriteria: ["dor no implante"], missingCriteria: [], usefulSourceIds: ["vs-apoio"],
      extracts: [{
        videoBriefId: "vb1", videoSourceId: "vs-apoio", segmentIndexes: [1], startMs: 95000, endMs: 110000,
        originalText: "Com a anestesia local, o paciente sente pressão, não dor.", sourceLanguage: "pt-BR",
        reasonForRelevance: "Responde a pauta.", matchedCriteria: ["dor no implante"], answersTitle: true,
        matchedQuestions: [], matchedEntities: [], supportType: "COVERS_TOPIC" as const, confidence: 0.8, limitations: [],
        provenance: { processingVersion: 1, anchoredToSegments: true as const },
      }],
    }],
    sources: [{ videoSourceId: "vs-apoio", displayName: "Implante sem medo", languageCode: "pt-BR", processingVersion: 1 }],
  });
  const contexto = radarPortableVideoContext(camada, [
    uso({ videoSourceId: "vs-apoio", usage: "SUPPORT", title: "Implante sem medo", url: "https://www.youtube.com/watch?v=apoio000001", channel: "Odonto Explica", textPreview: "Hoje eu explico o que o paciente sente na cirurgia de implante." }),
    uso({ videoSourceId: "vs-tour", usage: "EMBED", title: "Tour pelo consultório", url: "https://www.youtube.com/watch?v=embed000001", channel: "Clínica Sorriso", textPreview: "Vem conhecer a sala onde fazemos os implantes." }),
  ]);
  const biblioteca = linhaDe(entradaDoAssunto(IMPLANTE, { videoContext: contexto })).biblioteca_da_marca;
  assert.match(biblioteca, /Vídeos selecionados pela marca \(modo de uso escolhido no Radar, decisão do dono\):/);
  assert.doesNotMatch(biblioteca, /Vídeos da marca/, "o rótulo é \"selecionados pela marca\": o vídeo pode ser de outro canal");
  /* 2026-10-02 · a fala do vídeo vai em linha própria, abaixo do vídeo, com o aviso de transcrição automática. */
  assert.match(biblioteca, /Apoio · "Implante sem medo" \(https:\/\/www\.youtube\.com\/watch\?v=apoio000001\) · canal: Odonto Explica — [^\n]*: \(01:35–01:50\) "Com a anestesia local, o paciente sente pressão, não dor\."\n {2}Começo da transcrição \(fala do vídeo, transcrição automática: cite só o que o vídeo confirma\): "Hoje eu explico/);
  assert.match(biblioteca, /Incorporar no artigo · "Tour pelo consultório" [^\n]*· canal: Clínica Sorriso — [^\n]*· seção: a que o vídeo responde \(definir no artigo-modelo\)\n {2}Começo da transcrição \(fala do vídeo, transcrição automática: cite só o que o vídeo confirma\): "Vem conhecer a sala/);
  assert.match(biblioteca, /^ {2}Transcrição automática: confira as palavras no vídeo antes de citar/m);
});

/* ================================ 13 ================================ */

test("13 · a régua única do \"não cobrir\": as três portas dão a mesma resposta, e a palavra genérica de formato sozinha não decide", () => {
  const casos: Array<{ labels: string[]; core: string[]; dentro: string[]; fora: string[] }> = [
    {
      labels: ["Ative o Instagram Shopping", "Dicas de Instagram"],
      core: ["como atrair clientes pelo instagram", "captar clientes pela internet", "clínicas de estética"],
      dentro: ["Como prospectar clientes pelo Instagram com o Instagram Shopping", "Ative o Instagram Shopping", "Como ativar o Shopping no perfil?", "Dicas de Instagram"],
      fora: ["Quais dicas para atrair clientes pelo Instagram funcionam?", "Guia de stories para clínicas", "Como atrair clientes pelo Instagram", "Instagram"],
    },
    {
      labels: ["Clareamento caseiro com bicarbonato", "Guia completo de implante dentário"],
      core: ["implante dentário", "implante dentário preço"],
      dentro: ["Clareamento com bicarbonato funciona?", "Guia completo de implante dentário"],
      fora: ["Implante dentário dói?", "Guia do implante dentário: quanto tempo dura?", "Qual o melhor clareamento para quem tem implante?", "Passo a passo da cirurgia de implante"],
    },
  ];
  for (const caso of casos) {
    const portas = [
      radarOutOfScopeMatcher({ labels: caso.labels, core: caso.core }),
      radarWritingOutOfScopeMatcher({ labels: caso.labels, core: caso.core }),
      radarArticleBlueprintOutOfScopeMatcher(caso.labels, caso.core),
    ];
    for (const texto of caso.dentro) assert.deepEqual(portas.map(porta => porta(texto)), [true, true, true], `deveria tocar o "não cobrir": ${texto}`);
    for (const texto of caso.fora) assert.deepEqual(portas.map(porta => porta(texto)), [false, false, false], `não deveria tocar: ${texto}`);
  }
});

/*
 * 2026-10-02 · REVISÃO: O "NÃO COBRIR" DO SILO TAMBÉM NO VÍDEO.
 *
 * O CSV para escrever e o artigo-modelo somam ao "não cobrir" os tópicos que o
 * Silo exclui; o CSV de vídeo usava só os rótulos do pacote. Uma pergunta de
 * assunto fora da fronteira do Silo saía de um e virava capítulo no outro. O
 * plano da seleção (`selectionPlan`) é o mesmo nas duas portas.
 */
type PlanoDaSelecao = NonNullable<Parameters<typeof radarPortableWritingExport>[0]["selectionPlan"]>;
function planoComSilo(articleId: string, entrada: RadarPortableExportInput, excludedTopics: string[]): PlanoDaSelecao {
  const membro = {
    articleId, position: 1, title: entrada.article.principalKeyword, principalKeyword: entrada.article.principalKeyword,
    slug: entrada.article.slug, role: "Pilar", statusLabel: "neste arquivo", inThisFile: true, reason: null,
  };
  return {
    files: [{
      filename: "silo.csv", kind: "silo", siloLabel: "Silo do teste", siloName: "Silo do teste", partial: false,
      articleIds: [articleId], exported: 1, total: 1, pending: [], warnings: [],
      writing: {
        kind: "silo", label: "Silo do teste", partial: false, draft: false, centralEntity: null, objective: null, audience: null,
        macroProblem: null, dominantIntent: null, whyTogether: null, boundary: null, includedTopics: [], excludedTopics,
        siloPage: null, members: [membro],
      },
    }],
  };
}

test("13b · o \"não cobrir\" do Silo vale no CSV de vídeo como no CSV para escrever (dois assuntos)", () => {
  const casos: Array<[RadarPortableExportInput, string, string[]]> = [
    [entradaDoAssunto(INSTAGRAM), "Vale a pena pagar anúncio para atrair clientes no Instagram?", ["Anúncio pago"]],
    [
      entradaDoAssunto({ ...IMPLANTE, perguntas: [...IMPLANTE.perguntas, ["Dentadura ou implante dentário: qual escolher?", 7]] }),
      "Dentadura ou implante dentário: qual escolher?",
      ["Dentadura"],
    ],
  ];
  const lenses = { lookups: [], readFailed: false };
  for (const [entrada, pergunta, excluidos] of casos) {
    /* 2026-10-09 · as duas entregas saem só pela planta APPROVED: a montada leva uma. */
    const montada = { articleId: "artigo-do-silo", entrada, lentes: [], blueprint: artigoModeloDe(entrada, "APPROVED") };
    const plano = planoComSilo(montada.articleId, entrada, excluidos);
    const videoSemSilo = csvPronto(radarPortableVideoExport({ articles: [montada], today: EXPORTADO_EM }));
    const video = csvPronto(radarPortableVideoExport({ articles: [montada], today: EXPORTADO_EM, selectionPlan: plano }));
    const escritaSemSilo = radarPortableWritingExport({ articles: [montada], lenses, plan: null, today: EXPORTADO_EM }).csv || "";
    const escrita = radarPortableWritingExport({ articles: [montada], lenses, plan: null, selectionPlan: plano, today: EXPORTADO_EM }).csv || "";
    assert.ok(videoSemSilo.includes(pergunta), `sem o Silo, a pergunta é do público no vídeo: ${pergunta}`);
    assert.ok(escritaSemSilo.includes(pergunta), `sem o Silo, a pergunta é do público no CSV para escrever: ${pergunta}`);
    assert.equal(escrita.includes(pergunta), false, `o CSV para escrever tira a pergunta fora do Silo: ${pergunta}`);
    assert.equal(video.includes(pergunta), false, `o CSV de vídeo também: ${pergunta}`);
  }

  /* Direto na linha: o campo aditivo; sem ele, como antes. */
  const [entrada, pergunta, excluidos] = casos[0];
  assert.ok(linhaDe(entrada).perguntas_do_publico.includes(pergunta));
  assert.equal(linhaDe(entrada, { siloExcludedTopics: excluidos }).perguntas_do_publico.includes(pergunta), false);
});

/* ================================ 14–18 · briefing de vídeo (revisão de 2026-10-02) ================================ */

/* Uma pesquisa do YouTube com títulos e consultas escolhidos: cada vídeo diz em quais consultas apareceu. */
function youtubeCom(consultas: readonly string[], videos: ReadonlyArray<{ title: string; channel?: string; em: number[] }>): RadarVideoExportYoutube {
  const ids = consultas.map((_, indice) => `ytq:${indice + 1}`);
  const results = videos.flatMap((video, v) => video.em.map(q => RadarYoutubeSearchResultSchema.parse({
    videoId: `vid${String(v).padStart(8, "0")}`, url: `https://www.youtube.com/watch?v=vid${String(v).padStart(8, "0")}`,
    title: video.title, channelName: video.channel || `Canal ${v}`, rank: v + 1,
    durationSeconds: 600 + v * 60, views: 1_000 * (v + 1), isShorts: false, publishedAt: "2026-03-01T00:00:00.000Z", queryId: ids[q - 1],
  })));
  const run = buildRadarYoutubeSearchRun({
    runId: "run-b", runVersion: 1, startedAt: "2026-09-14T18:51:00.000Z", startedBy: "u",
    fingerprint: buildRadarYoutubeRunFingerprint({ articleId: "a1", articleDnaVersionId: "d1", queryIds: ids }),
    provenance: {
      provider: "dataforseo", endpoint: RADAR_YOUTUBE_PROVIDER_ENDPOINT, blockDepth: 20,
      queriesRequested: consultas.length, queriesSucceeded: consultas.length, queriesFailed: 0, failures: [], collectedAt: "2026-09-14T18:51:07.000Z",
    },
    queries: consultas.map((text, indice) => ({ queryId: ids[indice], text, origin: indice ? "SECONDARY_KEYWORD" : "PRIMARY_KEYWORD", reason: "consulta", executed: true, resultCount: 5 })),
    results, universe: buildRadarYoutubeUniverse(results),
  });
  return radarVideoExportYoutubeOf({ run, frozen: null, declaredIntent: "INFORMATIONAL", editorialTopics: [], generatedAt: EXPORTADO_EM })!;
}

test("14 · consultas que repetem outra (palavra duplicada, prefixo sobre busca já enquadrada) são ditas e não contam como outra perspectiva", () => {
  const principal = INSTAGRAM.principal;
  const youtube = youtubeCom([principal, `como ${principal}`, `rotina ${principal}`, "instagram não traz pacientes"], [
    { title: "Vídeo achado nas três primeiras", em: [1, 2, 3] },
    { title: "Vídeo achado na primeira e na quarta", em: [1, 4] },
  ]);
  const serp = linhaDe(entradaDoAssunto(INSTAGRAM), { youtube }).serp_youtube;
  assert.match(serp, /2\) como como atrair clientes pelo instagram \(repete a 1: palavra duplicada\)/);
  assert.match(serp, /3\) rotina como atrair clientes pelo instagram \(repete a 1: prefixo "rotina" sobre uma busca já enquadrada\)/);
  assert.match(serp, /^Consultas que repetem outra \(2, 3\): vieram do plano antigo/m);
  const linhas = serp.split("\n");
  assert.doesNotMatch(linhas.find(linha => linha.includes("Vídeo achado nas três primeiras"))!, /aparece em/, "três consultas iguais são uma perspectiva só");
  assert.match(linhas.find(linha => linha.includes("Vídeo achado na primeira e na quarta"))!, /aparece em 2 consultas distintas/);

  /* Outro assunto, consultas sem repetição: nada muda. */
  const implante = linhaDe(entradaDoAssunto(IMPLANTE), { youtube: youtubeCom([IMPLANTE.principal, "implante dentário preço"], [{ title: "Implante dentário: quanto custa", em: [1, 2] }]) }).serp_youtube;
  assert.doesNotMatch(implante, /repete a|Consultas que repetem/);
});

test("15 · cada concorrente diz a relevância para o público: mesmo, próximo, geral ou outro público", () => {
  const entrada = entradaDoAssunto({ ...INSTAGRAM, audience: "Biomédicas estetas e profissionais de estética que atendem em clínicas e consultórios. Querem agenda cheia." });
  const youtube = youtubeCom([INSTAGRAM.principal], [
    { title: "Como captar clientes na estética pelo Instagram", em: [1] },
    { title: "Como atrair clientes de advocacia pelo Instagram", em: [1] },
    { title: "Captar clientes pela internet: o guia", em: [1] },
    { title: "Seis dicas de alcance no Instagram", em: [1] },
    { title: "Como atrair clientes com conteúdo útil no Instagram", em: [1] },
    { title: "Marketing médico: pacientes pelo Instagram", channel: "Consultório em dia", em: [1] },
    { title: "A psicologia das pessoas que não usam Instagram", em: [1] },
  ]);
  const serp = linhaDe(entrada, { youtube }).serp_youtube;
  const relevancia = (titulo: string) => serp.split("\n")[serp.split("\n").findIndex(linha => linha.includes(titulo)) + 1].replace(/^.*relevância: /, "");
  assert.equal(relevancia("na estética"), "mesmo público: referência principal");
  assert.equal(relevancia("de advocacia"), "outro público: inspiração pontual, sem transportar recomendação");
  /* 2026-10-02 · mesma dor (termo da busca, clínica/consultório) não é o mesmo público: a profissão decide. */
  assert.equal(relevancia("pela internet"), "mesma dor, público vizinho: referência de abordagem (não transportar o público)");
  assert.equal(relevancia("Marketing médico"), "mesma dor, público vizinho: referência de abordagem (não transportar o público)", "pacientes e consultório: vizinho, não biomédicas estetas");
  assert.equal(relevancia("conteúdo útil"), "tema geral: referência de formato e apresentação");
  /* Só a plataforma, que todo título da amostra cita: fora do tema, por melhor posição que tenha. */
  assert.equal(relevancia("psicologia das pessoas"), "fora do tema da busca (só cita a plataforma): fica fora das recomendações");
  assert.equal(relevancia("dicas de alcance"), "fora do tema da busca (só cita a plataforma): fica fora das recomendações");
  assert.match(serp, /^Relevância para o público \(pelo título e pelo canal; posição e visualizações não medem retenção nem contatos\): 1 mesmo público[^\n]*1 outro público[^\n]*2 fora do tema/m);
});

test("16 · com a planta do artigo-modelo, cada capítulo diz o que entregar, o que mostrar e a fonte; cortes e carrossel com conteúdo próprio", () => {
  const entrada = entradaDoAssunto(INSTAGRAM);
  const linha = linhaDe(entrada, { blueprint: artigoModeloDe(entrada, "APPROVED"), youtube: youtubeDe(INSTAGRAM.principal, "instagram para clínicas") });
  const roteiro = linha.diretrizes_de_roteiro;
  assert.match(roteiro, /^Capítulos do vídeo principal \(3, da planta do artigo-modelo da SERP; viram os marcadores de tempo da descrição\)/m);
  assert.match(roteiro, /^1\. Por que o perfil não traz pacientes\n {3}Pergunta do público: "Por que o perfil não traz pacientes\?"\n {3}Entregar: Resposta direta\./m);
  /*
   * 2026-10-07 · a entrega prática sai como demonstração dita (o que o editor prepara), não como frase solta.
   * Revisão do mesmo dia (item 4 do desenho competitivo): a demonstração é a que a PLANTA define —
   * entrega prática sem "→" nem ";" é UMA ação —, com a régua da cena das regras 9 e 17 da planta.
   */
  assert.match(roteiro, /^2\. Roteiro de três stories\n[\s\S]*? {3}Mostrar na tela \(demonstração da planta\): ação: um roteiro de três stories para a semana · prepare a tela da ação num exemplo fictício identificado como ilustrativo\.$/m);
  /* A régua da cena (regras 9 e 17 da planta) vai uma vez, depois dos capítulos — repetida, ela empurrava a coluna para o teto da célula. */
  assert.match(roteiro, /^Regra das cenas \(regras 9 e 17 da planta\): exemplo fictício identificado como ilustrativo; sem métrica, ranking nem resultado fictício como prova; nunca antes e depois de paciente ou de resultado\.$/m);
  assert.equal((roteiro.match(/sem métrica, ranking/g) || []).length, 1, "a régua da cena, uma vez só");
  /* Sem entrega prática e sem 2 H3, o capítulo é explicativo: o conceito da imagem é só contexto, e ele não vira corte. */
  assert.match(roteiro, /^1\. Por que o perfil não traz pacientes\n[\s\S]*? {3}Mostrar na tela: sem demonstração na planta \(capítulo explicativo\) — contexto visual: o título do capítulo em destaque; este capítulo não vira corte\.$/m);
  /* 2026-10-09 · o "ritmo" do roteiro genérico do YouTube saiu: o roteiro é a planta. */
  assert.doesNotMatch(roteiro, /Ritmo que a SERP do YouTube sugere|HOOK →/m);
  assert.doesNotMatch(roteiro, /O fundamento principal do tema/, "o bloco genérico não é capítulo quando há planta");
  /* O gancho abre pela abertura da planta, que fala da principal. */
  assert.match(roteiro, /respondendo "Como atrair clientes pelo Instagram\?" logo de cara/);

  const cortes = linha.cortes_para_redes;
  /* 2026-10-07 · o corte ganhou a linha Origem e o fechamento com endereço e UM CTA só; o Mostrar vem como demonstração dita. */
  /*
   * 2026-10-07 · revisão do mesmo dia (item 3 do desenho competitivo): "três
   * capítulos, três cortes" completava a conta com capítulo sem nada para
   * mostrar. Agora só o capítulo que passa nos portões vira corte — aqui o 2,
   * o único com demonstração definida na planta —, com a utilidade, o
   * alinhamento e a origem recomendada com o motivo; os outros dizem por que
   * ficaram sem corte.
   */
  /* 2026-10-08 · D1: o cabeçalho diz o mínimo (1 ponto ou mais de 4) e concorda com o número. */
  assert.match(cortes, /^Cortes sugeridos \(Shorts, Reels e TikTok\): 1 ideia escolhida dos capítulos pela utilidade isolada \(pergunta com demanda, funciona sozinha, uma demonstração, oportunidade na SERP\), só com 1 ponto ou mais de 4; /m);
  assert.match(cortes, /^1\. Do capítulo 2 \(Roteiro de três stories\):\n {3}Utilidade 3 de 4: pergunta com demanda \(P1: 12 de 12 páginas\) · funciona sozinha · uma ação\.\n {3}Gancho: "Roteiro de três stories\?"\n {3}Ideia única: Resposta direta\.\n {3}Mostrar: a ação — um roteiro de três stories para a semana — num exemplo fictício identificado como ilustrativo\.\n {3}Alinhamento: [^\n]+\n {3}Origem recomendada: extrair da gravação do capítulo 2 e reenquadrar na vertical — motivo: o capítulo abre respondendo a mesma pergunta e mostra uma ação só\. Alternativa: gravar à parte com fala própria\.\n {3}Fechamento: CTA: o artigo \(https:\/\/clinica-exemplo\.com\.br\/como-atrair-clientes-pelo-instagram\) ou o vídeo longo quando publicado — um só por corte\.$/m);
  assert.match(cortes, /^Capítulos sem corte: 1 \(sem demonstração definida na planta\) · 3 \(sem demonstração definida na planta\)\.$/m);
  assert.doesNotMatch(cortes, /^\d+\. Do capítulo [13] \(/m, "capítulo explicativo não completa a conta");
  /* 2026-10-07 (passada de revisão) · o cabeçalho acompanhou a lâmina: sem o "Puxa a próxima" no corpo, prometer "cada uma puxando a próxima" mandava procurar instrução que não existe mais. */
  assert.match(cortes, /^Carrossel \(Instagram e LinkedIn\), 5 lâminas, uma mensagem por lâmina \(o título de cada lâmina já puxa a seguinte\):$/m);
  /* 2026-10-02 · a capa é chamada para o público: o H1 da planta, não a promessa (instrução ao redator). */
  assert.match(cortes, /^- Lâmina 1 \(capa\): Como atrair clientes pelo Instagram: o guia da clínica\.$/m);
  /*
   * 2026-10-07 · a lâmina ficou publicável: Título, Apoio (texto publicável) e
   * sugestão Visual; o "Puxa a próxima" saiu (o Título da lâmina seguinte já
   * diz o que vem). A entrega prática vira a sugestão Visual ("demonstração
   * de…"); sem nada, "destaque do título".
   */
  assert.match(cortes, /^- Lâmina 2: Título: Por que o perfil não traz pacientes · Apoio \(texto publicável\): Resposta direta\. · Visual: destaque do título\.$/m);
  assert.match(cortes, /^- Lâmina 3: Título: Roteiro de três stories · Apoio \(texto publicável\): Resposta direta\. · Visual: demonstração de um roteiro de três stories para a semana\.$/m);
  assert.doesNotMatch(cortes, /Puxa a próxima/, "a lâmina só leva o publicável e a sugestão visual");
  assert.match(cortes, /^- Lâmina 5: CTA para o artigo \(https:\/\/clinica-exemplo\.com\.br\/como-atrair-clientes-pelo-instagram\), sem prometer resultado\.$/m);

  /* 2026-10-02 · D10: o rascunho antigo também sai sem aviso de aprovação. */
  /* 2026-10-09 · a proposta (DRAFT) não é o artigo-modelo: sem a APPROVED, nenhum roteiro (nem a sequência de antes). */
  assert.doesNotMatch(linhaDe(entrada, { blueprint: artigoModeloDe(entrada, "DRAFT") }).diretrizes_de_roteiro, /proposta da IA|confira antes de gravar|da planta do artigo-modelo/);
  assert.doesNotMatch(linhaDe(entrada).diretrizes_de_roteiro, /da planta do artigo-modelo|^Capítulos/m);
});

test("17 · com planta, o gancho não pega pergunta da amostra: abertura que não fala da principal deixa o gancho no próprio tema", () => {
  const entrada = entradaDoAssunto(INSTAGRAM);
  const planta = artigoModeloDe(entrada, "APPROVED");
  const outraAbertura = { ...planta, blueprint: { ...planta.blueprint, opening: { ...planta.blueprint.opening, readerQuestion: "Como captar clientes pelo WhatsApp?" } } };
  const gancho = linhaDe(entrada, { blueprint: outraAbertura }).diretrizes_de_roteiro.split("\n")[0];
  assert.doesNotMatch(gancho, /respondendo/, "\"pelo\" não faz a pergunta do WhatsApp falar da principal");
  assert.doesNotMatch(gancho, /Quais dicas|sendo uma clínica pequena/, "nem cai na pergunta da amostra");
});

test("18 · a fala do vídeo: o trecho ligado ao tema (não a saudação), o capítulo que ele sustenta e o idioma", async () => {
  const { radarVideoTranscriptLanguage, radarVideoTranscriptPassage } = await import("../lib/radar/portable-video-export.ts");
  const enche = (n: number) => Array.from({ length: n }, () => "e aí a gente conversa um pouco sobre a rotina do dia").join(" ");
  const fala = `Olá pessoal sejam todos bem vindos ao canal hoje eu vou falar com vocês ${enche(12)} para atrair clientes pelo instagram a clínica precisa mostrar serviço cidade e contato no perfil ${enche(12)}`;
  const raizes = new Set(["atrair", "client", "instagram", "perfil", "clinica"]);
  const trecho = radarVideoTranscriptPassage(fala, raizes)!;
  assert.ok(trecho.position > 10, `trecho no meio da fala (${trecho.position}%)`);
  assert.match(trecho.text, /mostrar serviço cidade e contato no perfil/);
  assert.equal(radarVideoTranscriptPassage("só saudação, sem tema nenhum aqui", raizes), null);
  assert.equal(radarVideoTranscriptLanguage("You posted almost every day this month and your schedule is still empty, but it is not about the content that you post"), "en");
  assert.equal(radarVideoTranscriptLanguage("E por que que no Instagram ainda não te traz pacientes, a gente posta para não ter lugar e a agenda não enche"), "pt");

  const contexto = radarPortableVideoContext(null, [
    uso({ videoSourceId: "vs-pt", usage: "SUPPORT", title: "Perfil que traz pacientes", channel: "Canal Pt", textPreview: fala.slice(0, 300), textBody: fala }),
    uso({ videoSourceId: "vs-en", usage: "CONTEXT", title: "Posting every day", channel: "Canal En", textPreview: "You posted almost every day this month and your schedule is still empty, but it is not about the content", textBody: "You posted almost every day this month and your schedule is still empty, but it is not about the content that you post on instagram for clients" }),
  ]);
  const entrada = entradaDoAssunto(INSTAGRAM, { videoContext: contexto });
  const biblioteca = linhaDe(entrada, { blueprint: artigoModeloDe(entrada, "APPROVED") }).biblioteca_da_marca;
  /*
   * 2026-10-02 · o estado do vídeo e o trecho candidato; sem duração registrada, a posição em %.
   * 2026-10-07 (revisão) · D10: "falta conferir…" era espera aberta no arquivo;
   * o estado diz o que é (tempo estimado) e onde se confere (na edição).
   */
  assert.match(biblioteca, /^ {2}Estado: selecionado pela marca · trecho candidato encontrado \(o tempo é estimado; tempo e palavras se conferem no vídeo, na edição\)\.$/m);
  assert.doesNotMatch(biblioteca, /falta conferir/);
  assert.match(biblioteca, /^ {2}Trecho candidato \(transcrição automática, por volta de \d+% do vídeo \(sem duração registrada; achar o tempo no vídeo\)\): "[^"]*contato no perfil/m);
  assert.match(biblioteca, /^Nenhum trecho casado com as pautas ainda/m, "a coluna não diz que nada foi selecionado quando há seleção");
  assert.match(biblioteca, /^ {2}Ponto a explicar: capítulo "Por que o perfil não traz pacientes" · uso: Apoio, atribuído ao canal\.$/m);
  assert.match(biblioteca, /^ {2}Fala em inglês: traduza e revise antes de usar/m);
});

test("19 · premissa sem regra universal, demonstração em vez de cena, gancho sem conector, tempo estimado e problema → solução reconhecido", async () => {
  const { radarVideoDurationSeconds, radarVideoHookQuestion, radarVideoPremise } = await import("../lib/radar/portable-video-export.ts");
  const { radarYoutubeTitleOpportunities, radarYoutubeTitlePatterns } = await import("../lib/radar/youtube-blueprint.ts");
  const entrada = entradaDoAssunto(INSTAGRAM);
  const planta = artigoModeloDe(entrada, "APPROVED");
  const absoluta = {
    ...planta,
    blueprint: {
      ...planta.blueprint,
      promise: "Mostrar como a clínica reconhece se o perfil alcança pessoas da região interessadas no atendimento.",
      sections: planta.blueprint.sections.map((secao, indice) => indice === 0
        /* 2026-10-08 · D3: H3 só é passo quando é ação — os de antes ("Perfil antes", "O ajuste") eram tópicos e hoje fazem o capítulo explicativo. */
        ? { ...secao, answerFirst: "O Instagram foi feito para entretenimento, não para agendar.", explain: ["Pacientes procuram no Google, não no Instagram.", "A bio diz serviço, cidade e contato."], h3: ["Mostre o perfil antes", "Faça o ajuste", "Mostre o perfil depois"], practical: null }
        : secao),
    },
  };
  const roteiro = linhaDe(entrada, { blueprint: absoluta }).diretrizes_de_roteiro;
  assert.match(roteiro, /^Premissa do vídeo: O vídeo mostra como a clínica reconhece se o perfil alcança pessoas da região interessadas no atendimento\.$/m, "a promessa vira frase de quem fala");
  assert.doesNotMatch(roteiro, /foi feito para entretenimento|procuram no Google, não no Instagram/, "a frase absoluta não vira capítulo");
  /*
   * 2026-10-07 · o placeholder "a resposta a X pelo que a pesquisa sustenta,
   * sem regra universal" não dizia nada a quem grava: com answerFirst
   * absoluto, o Entregar promove a primeira frase não-absoluta de explicar —
   * e ela NÃO se repete na linha Explicar do mesmo capítulo.
   */
  assert.match(roteiro, /Entregar: o que a pesquisa sustenta: A bio diz serviço, cidade e contato; a resposta completa a "Por que o perfil não traz pacientes\?" se delimita na fala/);
  assert.doesNotMatch(roteiro, /pelo que a pesquisa sustenta, sem regra universal/, "o placeholder antigo não existe mais");
  assert.doesNotMatch(roteiro, /Explicar: A bio diz serviço, cidade e contato/, "a frase promovida não se repete no Explicar");
  /*
   * 2026-10-07 · "Mostrar na tela" diz o que o editor prepara (uma tela por passo), não só a lista de assuntos.
   * Revisão do mesmo dia (item 4 do desenho competitivo): só H3 (2 ou mais) são PASSOS da demonstração da
   * planta, uma tela por passo; o "antes e depois (com e sem) de cada um" saiu — a regra 17 da planta não
   * prescreve antes e depois como receita, e a cena segue a régua das regras 9 e 17.
   */
  assert.match(roteiro, /Mostrar na tela \(demonstração da planta\): passos: Mostre o perfil antes; Faça o ajuste; Mostre o perfil depois · prepare uma tela por passo num exemplo fictício identificado como ilustrativo\./, "demonstração pelos passos da seção, com o material a preparar");
  assert.match(roteiro, /^Regra das cenas \(regras 9 e 17 da planta\): [^\n]*nunca antes e depois de paciente ou de resultado\.$/m);
  assert.doesNotMatch(roteiro, /com e sem\) de cada um/, "antes e depois não vira receita de cada passo");
  assert.match(roteiro, /reorganize se o vídeo render mais abrindo pela demonstração/);
  assert.equal(radarVideoPremise({ ...planta, blueprint: { ...planta.blueprint, promise: "O Instagram nunca traz pacientes." } }), 'O vídeo responde "Como atrair clientes pelo Instagram?" com o que a pesquisa sustenta.', "promessa absoluta não vira premissa");

  assert.equal(radarVideoHookQuestion("Então como eu posso usar o Instagram para atrair clientes?"), "Como eu posso usar o Instagram para atrair clientes?");
  assert.equal(radarVideoHookQuestion("Mas por que não funciona?"), "Por que não funciona?");
  assert.equal(radarVideoHookQuestion("O perfil serve?"), "O perfil serve?");

  assert.equal(radarVideoDurationSeconds("PT8M45S"), 525);
  assert.equal(radarVideoDurationSeconds("8:45"), 525);
  assert.equal(radarVideoDurationSeconds("1:02:10"), 3730);
  assert.equal(radarVideoDurationSeconds("600"), 600);
  assert.equal(radarVideoDurationSeconds("sem duração"), null);

  const padroes = radarYoutubeTitlePatterns(["Por que o Instagram não traz pacientes (e o que fazer diferente)", "POR QUE meu INSTAGRAM NÃO traz CLIENTES? AJUSTES SIMPLES que FAZEM VENDER", "Como atrair clientes"]);
  assert.equal(padroes.find(item => item.id === "PROBLEMA_SOLUCAO")?.count, 2);
  assert.ok(!radarYoutubeTitleOpportunities(padroes).some(item => /^Problema → solução/.test(item)), "não é oportunidade o que a amostra já usa");
});

/* ================================ 20–24 · revisão de 2026-10-07 (o CSV real do dono) ================================ */

test("20 · Entregar nunca fica sem resposta; corte com ideia única e Origem; lâmina publicável; prompt pede os três produtos", () => {
  const entrada = entradaDoAssunto(INSTAGRAM);
  const planta = artigoModeloDe(entrada, "APPROVED");
  /*
   * 2026-10-07 · a prova por regeneração: answerFirst absoluto ("foi feito
   * para…") nas seções 1 e 3. A 1 tem uma frase não-absoluta de explicar (ela
   * é promovida); a 3 não tem nada aproveitável (vira a instrução concluída de
   * abrir pela pergunta — D10, revisão do mesmo dia).
   */
  const absoluta = {
    ...planta,
    blueprint: {
      ...planta.blueprint,
      sections: planta.blueprint.sections.map((secao, indice) => {
        if (indice === 0) return { ...secao, answerFirst: "O Instagram foi feito para entretenimento, não para agendar.", explain: ["Pacientes procuram no Google, não no Instagram.", "A atenção no feed é passageira."], h3: ["O papel do algoritmo", "Seguidores não são pacientes"] };
        if (indice === 2) return { ...secao, answerFirst: "Depoimento sempre converte.", explain: ["Nunca publique sem prova."] };
        return secao;
      }),
    },
  };
  const row = linhaDe(entrada, { blueprint: absoluta });
  const roteiro = row.diretrizes_de_roteiro;
  /* (b) a primeira frase não-absoluta de explicar é promovida ao Entregar e não se repete no Explicar. */
  assert.match(roteiro, /^ {3}Entregar: o que a pesquisa sustenta: A atenção no feed é passageira; a resposta completa a "Por que o perfil não traz pacientes\?" se delimita na fala$/m);
  assert.doesNotMatch(roteiro, /Explicar: A atenção no feed é passageira/, "a frase promovida não se repete");
  /*
   * (c) sem nada aproveitável, uma instrução acionável — não um placeholder vazio.
   * 2026-10-07 · D10 (decisão do dono: o entregável sai concluído): a linha era
   * "PENDÊNCIA: a pesquisa não fecha a resposta a … — delimite na fala ou grave
   * a resposta do especialista". Virou instrução CONCLUÍDA, sem a palavra
   * pendência; a guarda contra o placeholder antigo continua.
   */
  assert.match(roteiro, /^ {3}Entregar: abra pela pergunta "Prova social\?" e responda só com o que esta linha sustenta, em fala delimitada \(sem regra universal nem afirmação sem fonte\)$/m);
  assert.doesNotMatch(roteiro, /PENDÊNCIA|pendência/i, "D10: nenhum Entregar com pendência");
  assert.doesNotMatch(roteiro, /pelo que a pesquisa sustenta, sem regra universal/, "o placeholder antigo morreu");

  const cortes = row.cortes_para_redes;
  /*
   * 2026-10-08 · D2 e D3 (o CSV real de 08/10): "O papel do algoritmo" e
   * "Seguidores não são pacientes" são TÓPICOS, não passos. O corte do
   * capítulo 1 mostrava "só o primeiro passo — O papel do algoritmo" (o tema
   * da afirmação travada) ao lado da ideia "A atenção no feed é passageira".
   * Agora o capítulo 1 é explicativo: não vira corte e diz por quê; o
   * capítulo 3 continua sem frase publicável.
   */
  assert.doesNotMatch(cortes, /só o primeiro passo — O papel do algoritmo|^\d+\. Do capítulo 1 \(/m, "tópico não é passo de corte");
  assert.match(roteiro, /^ {3}Mostrar na tela: sem demonstração na planta \(capítulo explicativo\) — contexto visual: os pontos do capítulo na tela, um por vez: O papel do algoritmo; Seguidores não são pacientes; este capítulo não vira corte\.$/m);
  assert.match(cortes, /^Capítulos sem corte: 1 \(sem demonstração definida na planta: os subtítulos são tópicos, não ações\) · 3 \(sem frase publicável na planta: só afirmação absoluta\)\.$/m);
  /*
   * A lâmina sai publicável: Título, Apoio e Visual — e NUNCA instrução interna, nem sem frase aproveitável.
   * 2026-10-07 · revisão do mesmo dia (item 4): o Visual sai da demonstração da planta — passos dos H3
   * viram lista no carrossel (antes, só o primeiro passo, que dizia menos que o capítulo).
   */
  /* 2026-10-08 · D3: os tópicos vão em lista como PONTOS do capítulo, nunca como "os passos". */
  assert.match(cortes, /^- Lâmina 2: Título: Por que o perfil não traz pacientes · Apoio \(texto publicável\): A atenção no feed é passageira\. · Visual: os pontos do capítulo em lista: O papel do algoritmo; Seguidores não são pacientes\.$/m);
  assert.match(cortes, /^- Lâmina 4: Título: Prova social · Apoio \(texto publicável\): Prova social\? · Visual: destaque do título\.$/m, "sem frase publicável, a pergunta do público vira a provocação da lâmina");
  const laminas = cortes.split("\n").filter(linha => linha.startsWith("- Lâmina"));
  assert.ok(laminas.length >= 5, cortes);
  for (const lamina of laminas) assert.doesNotMatch(lamina, /PENDÊNCIA|pelo que a pesquisa sustenta|o que a pesquisa sustenta|a resposta a /, "lâmina sem instrução interna");

  /* O prompt pede os três produtos e libera a ordem (a diretriz já permitia reorganizar). */
  assert.match(row.prompt, /na ordem dos capítulos desta linha OU na ordem em que o vídeo render melhor \(a diretriz permite reorganizar\), mantendo assunto, evidências e premissa/);
  /*
   * 2026-10-07 · revisão do mesmo dia (itens 3 e 5): "Os 3 cortes" mentia
   * quando a utilidade deixa menos (aqui, 2); e o carrossel ganhou a regra da
   * lista "Fica fora do texto publicável". Os três produtos continuam pedidos.
   */
  /*
   * 2026-10-07 · item 9 do desenho competitivo (mesmo dia): a cena do corte e o
   * visual do carrossel saem de storyboard_visual, e a duração-alvo de
   * concorrencia_curtos_e_carrossel; o prompt proíbe descrever estilo de imagem
   * que ninguém viu. "Até 3, escolhidos por utilidade" e a regra do "Fica fora"
   * continuam, e a guarda contra "Os 3 cortes" também.
   */
  assert.match(row.prompt, /^2\) Os cortes desta linha \(até 3, escolhidos por utilidade\) para Shorts\/Reels\/TikTok, cada um com fala própria, a cena do storyboard \(storyboard_visual\), a duração-alvo de concorrencia_curtos_e_carrossel e UM CTA\.$/m);
  assert.doesNotMatch(row.prompt, /Os 3 cortes/);
  assert.match(row.prompt, /^3\) O carrossel desta linha, com o texto publicável de cada lâmina \(título e apoio curto\) e o visual de storyboard_visual, sem instrução interna no texto da lâmina; frase listada em "Fica fora do texto publicável" não entra em lâmina nem legenda, e na fala só entra delimitada\.$/m);
  assert.match(row.prompt, /^Estilo visual: só o que storyboard_visual registra como observado e o que quem abrir as referências anotar; não descreva estilo de imagem que ninguém viu\.$/m);
});

test("21 · a linha \"Voz da marca\" não leva seção de entrega de artigo: sai de todas as colunas e é nomeada no \"Fica fora\"", () => {
  /* A Skill real do dono: entrega e instrução de ESCREVER O ARTIGO junto das seções de voz. */
  const SECOES_COM_ENTREGA: Array<[string, string]> = [
    ...SECOES_DA_VOZ,
    ["14. Critérios antes de redigir", "Conferir se principal, intenção e seções tratam do mesmo problema; com bloqueio, não apresentar como aprovado."],
    ["15. Entrega e revisão final", "Entregar H1, SEO title, meta description, corpo do artigo, links resolvidos e plano visual."],
    ["16. Instrução curta para o teste", "Use este documento como contexto editorial e escreva o artigo com resposta direta à pesquisa."],
  ];
  const ENTREGA: RadarBrandVoiceState = {
    kind: "available",
    voice: { ...VOZ, sections: SECOES_COM_ENTREGA.map(([heading, body]) => ({ heading, body })) },
  };
  const voz = buildRadarVideoBrandVoiceRow(ENTREGA)!;
  const tudo = Object.values(voz).join("\n");
  assert.doesNotMatch(tudo, /corpo do artigo|SEO title|escreva o artigo/, "a entrega de artigo não entra em NENHUMA coluna da linha de voz");
  assert.match(voz.pode_gravar, /Fica fora desta linha \(vale para o artigo, não para o vídeo\): Responder diretamente à keyword; FAQ e dados estruturados; Links e conteúdo já publicado; Plano visual; Entrega e revisão final; Instrução curta para o teste\./);
  /* CUIDADO com o falso positivo: critérios, voz e vocabulário têm a regra de coerência e o tom — ficam no prompt. */
  assert.match(voz.prompt, /Critérios antes de redigir:\nConferir se principal/);
  assert.match(voz.prompt, /Linguagem próxima e adulta/);

  /* O predicado, direto: título, corpo e os que NÃO são entrega. */
  assert.equal(radarBrandVoiceSectionIsArticleDelivery({ heading: "Entrega e revisão final", body: "Conferir tudo." }), true);
  assert.equal(radarBrandVoiceSectionIsArticleDelivery({ heading: "Instrução curta para o teste", body: "qualquer" }), true);
  assert.equal(radarBrandVoiceSectionIsArticleDelivery({ heading: "Instrução para o redator", body: "qualquer" }), true);
  /* 2026-10-07 (passada de revisão) · o plural não escapava: "instrucao" não é substring de "instrucoes" sem acento. */
  assert.equal(radarBrandVoiceSectionIsArticleDelivery({ heading: "Instruções para o redator", body: "Siga o checklist antes de entregar." }), true, "o título no plural também é entrega");
  assert.equal(radarBrandVoiceSectionIsArticleDelivery({ heading: "Checklist de entrega", body: "qualquer" }), true);
  assert.equal(radarBrandVoiceSectionIsArticleDelivery({ heading: "Revisão final", body: "qualquer" }), true);
  assert.equal(radarBrandVoiceSectionIsArticleDelivery({ heading: "Fechamento", body: "Entregar o corpo do artigo com meta description e links." }), true, "reconhece pelo corpo");
  assert.equal(radarBrandVoiceSectionIsArticleDelivery({ heading: "Teste final", body: "Quando estiver coerente, escreva o artigo inteiro." }), true, "a ordem de escrever o artigo");
  assert.equal(radarBrandVoiceSectionIsArticleDelivery({ heading: "Critérios antes de redigir", body: "Nesse caso, escrever sem esses recursos. O artigo não muda de intenção." }), false, "critérios ficam");
  assert.equal(radarBrandVoiceSectionIsArticleDelivery({ heading: "Voz: firme, humana e provocadora", body: "Linguagem próxima." }), false);
  assert.equal(radarBrandVoiceSectionIsArticleDelivery({ heading: "Vocabulário e estilo", body: "Usar Internet em vez de digital." }), false);

  /* O CSV para escrever NÃO muda: a entrega de artigo é pertinente lá e continua na linha de voz. */
  /* 2026-10-09 · o CSV para escrever também sai só pela planta: a linha leva uma. */
  const escrita = radarPortableWritingExport({
    articles: [{ articleId: "a-voz", lentes: [], ...comPlanta(entradaDoAssunto(INSTAGRAM)) }],
    lenses: { lookups: [], readFailed: false }, plan: null, today: EXPORTADO_EM, brandVoice: ENTREGA,
  }).csv || "";
  assert.ok(escrita.includes("corpo do artigo"), "no CSV para escrever a seção de entrega continua");
});

test("22 · a amostra é declarada: a relevância é lida do universo inteiro, e o fora-do-tema entra na coluna de intenção", () => {
  const entrada = entradaDoAssunto({ ...INSTAGRAM, audience: "Biomédicas estetas e profissionais de estética que atendem em clínicas e consultórios. Querem agenda cheia." });
  /*
   * 2026-10-07 · dez títulos do tema (ranks 1–10) e dois que SÓ citam a
   * plataforma (ranks 11–12, fora do top 10 listado na serp_youtube): o
   * número da coluna de intenção só fecha se a relevância for lida do
   * universo inteiro, não da lista de 10.
   */
  /* Raízes do tema espalhadas (atrair 4, captar 3, internet 3): nenhuma chega a 50% da amostra, então nenhuma vira "onipresente". */
  const dentro = [
    "Como atrair clientes pelo Instagram na estética",
    "Captar clientes no Instagram: o guia da clínica",
    "Como atrair clientes pelo Instagram sem anúncio",
    "Clientes pela internet: o Instagram da clínica",
    "Como atrair clientes pelo Instagram com conteúdo",
    "Captar clientes pelo Instagram: erros comuns",
    "Clientes pela internet com o Instagram do consultório",
    "Captar clientes pelo Instagram com perfil otimizado",
    "Como atrair clientes pelo Instagram: passo a passo",
    "Clientes pela internet: Instagram que agenda",
  ];
  const fora = ["Seis dicas de alcance no Instagram", "A psicologia das pessoas que não usam Instagram"];
  const row = linhaDe(entrada, { youtube: youtubeCom([INSTAGRAM.principal], [...dentro, ...fora].map(title => ({ title, em: [1] }))) });
  assert.match(row.intencao_e_formato, /No YouTube: 12 vídeo\(s\) longos/, "a fotografia não é recalculada");
  /*
   * 2026-10-07 · revisão do mesmo dia (item 1 do desenho competitivo): a
   * frase "…mas entram nas estatísticas de duração e formato acima" saiu — as
   * estatísticas agora são SÓ dos pertinentes, e o que ficou fora da conta é
   * dito por motivo. A contagem continua lida do universo inteiro.
   */
  assert.match(row.intencao_e_formato, /^Amostra pertinente \(mesmo público, público vizinho e tema geral; pelo título e pelo canal\): 10 de 12 longos · 0 de 0 Shorts\. Fora da conta: 2 fora do tema da busca\.$/m);
  assert.doesNotMatch(row.intencao_e_formato, /entram nas estatísticas/, "fora do tema não entra mais na conta");
  assert.match(row.intencao_e_formato, /^Duração dos longos \(pertinentes\): mediana /m);
  assert.doesNotMatch(row.serp_youtube, /psicologia/i, "os dois fora-do-tema estão além do top 10 listado: a contagem veio do universo");

  /* Sem fora-do-tema, nada fica fora da conta. */
  const limpa = linhaDe(entrada, { youtube: youtubeCom([INSTAGRAM.principal], dentro.map(title => ({ title, em: [1] }))) });
  assert.match(limpa.intencao_e_formato, /: 10 de 10 longos · 0 de 0 Shorts\.$/m);
  assert.doesNotMatch(limpa.intencao_e_formato, /Fora da conta/);
});

/*
 * 2026-10-07 (passada de revisão) · planta com seções sob medida, a partir da
 * planta de artigoModeloDe: a dispersão dos cortes pede 5 seções, e a origem
 * do "mostrar" pede entrega prática E H3 juntos — combinações que as 3 seções
 * fixas não têm.
 */
type SecaoDaPlanta = RadarArticleBlueprintPayload["blueprint"]["sections"][number];
function plantaComSecoes(entrada: RadarPortableExportInput, secoes: Array<Partial<SecaoDaPlanta> & { h2: string }>): RadarArticleBlueprintPayload {
  const planta = artigoModeloDe(entrada, "APPROVED");
  const base = planta.blueprint.sections[0];
  return {
    ...planta,
    blueprint: {
      ...planta.blueprint,
      sections: secoes.map(secao => ({ ...base, readerQuestion: `${secao.h2}?`, practical: null, h3: [], ...secao })),
    },
  };
}

test("23 · dispersão dos cortes: o melhor do início, do meio e do fim da sequência — o top-3 por peso não volta", () => {
  const entrada = entradaDoAssunto(INSTAGRAM);
  const titulos = ["Fundamento do perfil", "Rotina de stories", "Erros no direct", "Prova com depoimentos", "Medição da agenda"];
  const cortesDe = (planta: RadarArticleBlueprintPayload) => linhaDe(entrada, { blueprint: planta }).cortes_para_redes
    .split("\n").map(linha => linha.match(/^\d+\. Do capítulo (\d+) \(/)).filter(Boolean).map(casado => Number(casado![1]));
  /*
   * 5 capítulos de peso igual (todos com entrega prática): as faixas são {1},
   * {2,3} e {4,5} e o empate fica com o primeiro de cada uma — cortes 1, 2 e
   * 4. A escolha antiga (top-3 por peso, ordem final pelo número) devolveria
   * 1, 2 e 3 e deixaria o fim do vídeo sem corte: este pino mata essa volta.
   */
  /*
   * 2026-10-07 · revisão do mesmo dia (item 3 do desenho competitivo): a
   * escolha passou a ser pela utilidade isolada, e a dispersão virou o
   * DESEMPATE. Com utilidades iguais (todos com uma ação e a mesma demanda), o
   * desempate mantém 1, 2 e 4 — o pino contra o top-3 posicional continua.
   */
  const iguais = plantaComSecoes(entrada, titulos.map(h2 => ({ h2, practical: `um exemplo de ${h2.toLowerCase()}` })));
  assert.deepEqual(cortesDe(iguais), [1, 2, 4], "utilidades iguais: a dispersão desempata (o primeiro de cada faixa início/meio/fim)");
  /*
   * 2026-10-07 (revisão) · "abaixo dos escolhidos" afirmava uma utilidade menor
   * que não existe: 3 e 5 empatam com os escolhidos (3 de 4) e saíram pela
   * distribuição ao longo do vídeo — e é isso que a linha diz.
   */
  assert.match(linhaDe(entrada, { blueprint: iguais }).cortes_para_redes, /^Capítulos sem corte: 3 \(utilidade 3 de 4, empatada com os escolhidos; ficou fora pela distribuição ao longo do vídeo\) · 5 \(utilidade 3 de 4, empatada com os escolhidos; ficou fora pela distribuição ao longo do vídeo\)\.$/m);
  assert.doesNotMatch(linhaDe(entrada, { blueprint: iguais }).cortes_para_redes, /abaixo dos escolhidos/, "empate não é utilidade menor");
  /*
   * Entrega prática só em 2 e 5: os outros não têm demonstração definida na
   * planta e não passam no portão. Antes saía [1, 2, 5] — o capítulo 1, sem
   * nada para mostrar, completava a faixa do início. Agora saem só os dois
   * elegíveis, e os três sem corte dizem por quê.
   */
  const desiguais = plantaComSecoes(entrada, titulos.map((h2, indice) => ({ h2, practical: indice === 1 || indice === 4 ? `um exemplo de ${h2.toLowerCase()}` : null })));
  assert.deepEqual(cortesDe(desiguais), [2, 5], "só os elegíveis: nenhum inelegível completa a conta");
  assert.match(linhaDe(entrada, { blueprint: desiguais }).cortes_para_redes, /^Capítulos sem corte: 1 \(sem demonstração definida na planta\) · 3 \(sem demonstração definida na planta\) · 4 \(sem demonstração definida na planta\)\.$/m);
});

test("24 · o Mostrar do corte vem de onde veio o mostrar do capítulo: a entrega prática vence os passos dos H3", () => {
  const entrada = entradaDoAssunto(INSTAGRAM);
  /*
   * Seção com entrega prática E 2+ H3: em capitulosDaPlanta a prática vence, e
   * o capítulo mostra a demonstração dela — o corte não pode dizer "só o
   * primeiro passo — {H3[0]}" citando passos que o Mostrar na tela do vídeo
   * longo nem nomeia.
   */
  const praticaComH3 = plantaComSecoes(entrada, [
    { h2: "Rotina de stories", practical: "um roteiro de três stories para a semana", h3: ["Escolher o tema", "Gravar os stories"] },
  ]);
  const linha = linhaDe(entrada, { blueprint: praticaComH3 });
  /* 2026-10-07 · revisão do mesmo dia (item 4): a entrega prática sem separador é UMA ação da demonstração da planta. */
  assert.match(linha.diretrizes_de_roteiro, /Mostrar na tela \(demonstração da planta\): ação: um roteiro de três stories para a semana · /);
  assert.match(linha.cortes_para_redes, /^ {3}Mostrar: a ação — um roteiro de três stories para a semana — num exemplo fictício identificado como ilustrativo\.$/m);
  assert.doesNotMatch(linha.cortes_para_redes, /só o primeiro passo — Escolher o tema/, "o corte não cita passo que o vídeo longo não prepara");
  /*
   * 2026-10-07 · revisão do mesmo dia (item 4): "A → B → C" NÃO são três passos
   * — a regra 20 da planta escreve a entrega prática como "antes → o ajuste →
   * depois". O corte mostra UMA demonstração: o ajuste entre o antes e o
   * depois (antes saía "só o primeiro passo — abra o perfil", que cortava a
   * demonstração ao meio). Os H3 continuam perdendo para a entrega prática.
   */
  const praticaEmPassos = plantaComSecoes(entrada, [
    { h2: "Perfil que agenda", practical: "abra o perfil → ajuste a bio → confira o contato", h3: ["Passo solto A", "Passo solto B"] },
  ]);
  const comSetas = linhaDe(entrada, { blueprint: praticaEmPassos });
  assert.match(comSetas.diretrizes_de_roteiro, /\(demonstração da planta\): antes: abra o perfil · ajuste: ajuste a bio · depois: confira o contato · prepare 3 telas \(uma por momento\) /);
  assert.match(comSetas.cortes_para_redes, /^ {3}Mostrar: o ajuste — ajuste a bio — entre o antes \(abra o perfil\) e o depois \(confira o contato\), num exemplo fictício identificado como ilustrativo\.$/m);
  assert.doesNotMatch(comSetas.cortes_para_redes, /Passo solto/, "os H3 perdem para a entrega prática");
});

/* ================================ 25–30 · pesquisa competitiva (desenho de 2026-10-07, Parte 1: itens 5, 1, 4 e 3) ================================ */

/*
 * 2026-10-07 · O CASO REAL DO CSV DO DONO, reduzido a três capítulos: o 1 com a
 * resposta absoluta, "O algoritmo prioriza…" no Explicar e o link externo que a
 * planta marcou "fonte a obter"; o 2 com a frase de controle ("A bio diz…"); o
 * 3 com a recomendação que só NOMEIA hashtags e as afirmações de plataforma sem
 * link ("ampliar seu alcance", "geolocalização ajudam"). Com `fonte`, o link do
 * capítulo 1 aponta para uma fonte do pacote.
 */
function plantaDoCasoReal(entrada: RadarPortableExportInput, ajustes: { fonte?: { id: string; url: string } } = {}): RadarArticleBlueprintPayload {
  const planta = plantaComSecoes(entrada, [
    {
      h2: "O que o Instagram faz bem (e o que ele não faz)", readerQuestion: "O Instagram realmente serve para atrair clientes?",
      answerFirst: "O Instagram foi feito para entretenimento, não para agendar consultas.",
      explain: ["O algoritmo prioriza conteúdo que gera interação, não necessariamente o que leva a agendamentos", "A atenção no feed é passageira; a decisão de marcar consulta envolve confiança e necessidade."],
      h3: ["O papel do algoritmo na entrega de conteúdo", "Por que seguidores não são sinônimo de pacientes"],
      externalLinks: [{ claim: "O algoritmo do Instagram prioriza conteúdo com alto engajamento", sourceType: "oficial", source: ajustes.fonte?.id ?? null }],
    },
    {
      h2: "Como usar o Instagram de forma estratégica", readerQuestion: "Então como eu posso usar o Instagram para atrair clientes?",
      answerFirst: "A bio diz serviço, cidade e contato.", explain: ["Conteúdo educativo gera confiança e posiciona você como autoridade."],
      h3: ["Otimize seu perfil para conversão", "Crie conteúdo que responda às dúvidas do paciente"],
    },
    {
      h2: "Estratégias práticas para atrair clientes pelo Instagram", readerQuestion: "Quais ações concretas posso aplicar hoje no meu Instagram?",
      answerFirst: "Aplique táticas como parcerias com influenciadores locais, uso de hashtags relevantes e interação ativa com a audiência.",
      explain: ["Influenciadores locais podem ampliar seu alcance para o público certo", "Hashtags e geolocalização ajudam a ser encontrado por quem está perto."],
      h3: ["Parcerias com influenciadores e perfis locais", "Uso inteligente de hashtags e geolocalização", "Interação e networking na plataforma"],
    },
  ]);
  return {
    ...planta,
    sources: ajustes.fonte ? [{ id: ajustes.fonte.id, url: ajustes.fonte.url, title: "Fonte oficial", claim: "O algoritmo do Instagram prioriza conteúdo com alto engajamento" }] : planta.sources,
    blueprint: {
      ...planta.blueprint,
      promise: "Mostrar por que o Instagram, sozinho, não enche a agenda e como usar a plataforma de forma estratégica.",
      title: { ...planta.blueprint.title, h1: "Como atrair clientes pelo Instagram (sem cair na ilusão de que ele enche a agenda)" },
    },
  };
}

test("25 · trava de fonte (caso real): a frase que pede fonte sai da lâmina e da ideia do corte, fica delimitada na fala e listada; com fonte, fica e leva a fonte; a tese passa", () => {
  const entrada = entradaDoAssunto(INSTAGRAM);
  const row = linhaDe(entrada, { blueprint: plantaDoCasoReal(entrada) });
  const cortes = row.cortes_para_redes;
  const laminas = cortes.split("\n").filter(linha => linha.startsWith("- Lâmina"));
  const ideias = cortes.split("\n").filter(linha => /^ {3}Ideia única: /.test(linha));
  assert.ok(laminas.length === 5 && ideias.length > 0, cortes);
  /* O problema do CSV real: a Lâmina 2 publicava a afirmação que o capítulo 1 marcava como "fonte a obter". */
  /* 2026-10-08 (correção da revisão) · "Influenciadores locais PODEM ampliar seu alcance" é efeito delimitado por modal: passa, como o desenho pedia. */
  for (const texto of [...laminas, ...ideias]) assert.doesNotMatch(texto, /algoritmo prioriza|geolocalização ajudam/i, `texto publicável sem a afirmação travada: ${texto}`);
  assert.match(cortes, /^- Lâmina 2: Título: O que o Instagram faz bem \(e o que ele não faz\) · Apoio \(texto publicável\): A atenção no feed é passageira\. · /m, "o próximo candidato livre vira o Apoio");
  /* Na produção, a frase fica delimitada e perde o rótulo "o que a pesquisa sustenta". */
  assert.match(row.diretrizes_de_roteiro, /^ {3}Entregar: o que a pesquisa sustenta: A atenção no feed é passageira; a decisão de marcar consulta envolve confiança e necessidade; a resposta completa a "O Instagram realmente serve para atrair clientes\?" se delimita na fala\n {3}Fala delimitada, sem fonte: O algoritmo prioriza conteúdo que gera interação, não necessariamente o que leva a agendamentos\.$/m);
  assert.doesNotMatch(row.diretrizes_de_roteiro, /o que a pesquisa sustenta: O algoritmo/);
  assert.match(row.diretrizes_de_roteiro, /^ {3}Explicar: Influenciadores locais podem ampliar seu alcance para o público certo\.\n {3}Fala delimitada, sem fonte: Hashtags e geolocalização ajudam a ser encontrado por quem está perto\.$/m);
  /* A lista "Fica fora" é regra concluída, com o motivo — e o pode_gravar diz a correção feita. */
  assert.match(cortes, /^Fica fora do texto publicável \(sem fonte não entra em lâmina, legenda nem ideia do corte; na fala, só delimitada\):$/m);
  /* 2026-10-08 · D10 no motivo: "(fonte a obter: oficial ou verificada)" era espera aberta no entregável; a regra sai concluída. */
  /*
   * 2026-10-08 (correção da revisão) · a resposta ABSOLUTA do capítulo 1 sumia
   * calada (o filtro de absoluta rodava antes da trava): agora ela abre a linha
   * do capítulo na lista, com o motivo dela — fora do vídeo, também da fala — e
   * entra na contagem do pode_gravar.
   */
  assert.match(cortes, /^- Capítulo 1 · lâmina 2[^:]*: "O Instagram foi feito para entretenimento, não para agendar consultas" — regra universal sem fonte: fica fora do vídeo, também da fala; "O algoritmo prioriza conteúdo que gera interação, não necessariamente o que leva a agendamentos" — a planta pede fonte oficial ou verificada: "O algoritmo do Instagram prioriza conteúdo com alto engajamento"\.$/m);
  assert.doesNotMatch(row.diretrizes_de_roteiro, /foi feito para entretenimento/, "a absoluta não volta à fala");
  assert.doesNotMatch(cortes, /fonte a obter/, "D10: a lista \"Fica fora\" não diz \"fonte a obter\"");
  /* Uma linha por capítulo (com a lâmina e o corte dele), cada frase com o seu motivo. */
  assert.match(cortes, /^- Capítulo 3 · lâmina 4[^:]*: "Hashtags e geolocalização ajudam a ser encontrado por quem está perto" — afirmação sobre plataforma sem fonte \(regra 17 da planta\)\.$/m);
  assert.match(row.pode_gravar, /^- 3 frase\(s\) que pedem fonte saíram do texto publicável \(lista em cortes_para_redes\)\.$/m);
  /* Controle negativo: a tese do dono (premissa e capa) e a frase sem afirmação de plataforma ficam. */
  assert.match(row.diretrizes_de_roteiro, /^Premissa do vídeo: O vídeo mostra por que o Instagram, sozinho, não enche a agenda e como usar a plataforma de forma estratégica\.$/m);
  assert.match(cortes, /^- Lâmina 1 \(capa\): Como atrair clientes pelo Instagram \(sem cair na ilusão de que ele enche a agenda\)\.$/m);
  assert.match(cortes, /Apoio \(texto publicável\): A bio diz serviço, cidade e contato\./);
  assert.match(cortes, /Apoio \(texto publicável\): Aplique táticas como parcerias com influenciadores locais, uso de hashtags relevantes e interação ativa com a audiência\./, "recomendação que só nomeia o recurso não afirma efeito");
  /* 2026-10-07 (revisão) · o alinhamento mandava mostrar "serve" e "usar" na cena: verbo de uso comum não é assunto do gancho. */
  assert.doesNotMatch(cortes, /Alinhamento: [^\n]*"(?:serve|usar|traz)"/, "verbo comum não é assunto");

  /* Com fonte válida do pacote, a frase fica — e leva a fonte em todo lugar onde aparece. */
  const comFonte = linhaDe(entrada, { blueprint: plantaDoCasoReal(entrada, { fonte: { id: "X1", url: "https://fonte-oficial.exemplo/algoritmo" } }) });
  assert.match(comFonte.diretrizes_de_roteiro, /^ {3}Entregar: o que a pesquisa sustenta: O algoritmo prioriza conteúdo que gera interação, não necessariamente o que leva a agendamentos \(fonte: https:\/\/fonte-oficial\.exemplo\/algoritmo\); a resposta completa/m);
  assert.match(comFonte.diretrizes_de_roteiro, /^ {3}Antes de afirmar: O algoritmo do Instagram prioriza conteúdo com alto engajamento \(fonte: https:\/\/fonte-oficial\.exemplo\/algoritmo\); /m);
  assert.match(comFonte.cortes_para_redes, /^- Lâmina 2: [^\n]*Apoio \(texto publicável\): O algoritmo prioriza conteúdo que gera interação, não necessariamente o que leva a agendamentos \(fonte: https:\/\/fonte-oficial\.exemplo\/algoritmo\)\. · /m);
  /* 2026-10-08 (correção da revisão) · com fonte, do capítulo 1 só a absoluta fica fora (a regra universal não ganha fonte pelo link do algoritmo). */
  assert.match(comFonte.cortes_para_redes, /^- Capítulo 1 · lâmina 2[^:]*: "O Instagram foi feito para entretenimento, não para agendar consultas" — regra universal sem fonte: fica fora do vídeo, também da fala\.$/m, "com fonte, a frase do algoritmo não fica fora");
});

test("25b · a mesma porta na premissa, na capa e na promessa do gancho: afirmação de plataforma sem fonte cai para a abertura e é listada", () => {
  const entrada = entradaDoAssunto({ ...INSTAGRAM, promise: "Hashtags certas aumentam o alcance da clínica no Instagram." });
  const base = plantaDoCasoReal(entrada);
  const planta = {
    ...base,
    blueprint: {
      ...base.blueprint,
      promise: "Mostrar que o algoritmo do Instagram favorece quem publica todo dia.",
      title: { ...base.blueprint.title, h1: "O algoritmo do Instagram prioriza quem posta todo dia" },
    },
  };
  const row = linhaDe(entrada, { blueprint: planta });
  assert.match(row.diretrizes_de_roteiro, /^Premissa do vídeo: O vídeo responde "Como atrair clientes pelo Instagram\?" com o que a pesquisa sustenta\.$/m, "a premissa cai para a pergunta da abertura");
  /*
   * 2026-10-07 (revisão) · a capa caía para a premissa de PRODUÇÃO ("O vídeo
   * responde … com o que a pesquisa sustenta") — texto interno publicado na
   * Lâmina 1. A reserva é a pergunta da abertura da planta, que é do público.
   */
  assert.match(row.cortes_para_redes, /^- Lâmina 1 \(capa\): Como atrair clientes pelo Instagram\?$/m, "a capa cai para a pergunta da abertura");
  assert.doesNotMatch(row.cortes_para_redes, /^- Lâmina 1 \(capa\): O vídeo /m, "a premissa de produção não vira capa");
  assert.match(row.storyboard_visual, /^- Lâmina 1 \(capa\): texto = "Como atrair clientes pelo Instagram\?"/m, "o storyboard usa a mesma capa");
  assert.doesNotMatch(row.diretrizes_de_roteiro.split("\n")[0], /Hashtags certas/, "a promessa do artigo não abre o gancho");
  assert.match(row.cortes_para_redes, /^- Premissa do vídeo: "Mostrar que o algoritmo do Instagram favorece quem publica todo dia" — afirmação sobre plataforma sem fonte \(regra 17 da planta\)\.$/m);
  assert.match(row.cortes_para_redes, /^- Capa do carrossel \(lâmina 1\): "O algoritmo do Instagram prioriza quem posta todo dia" — /m);
  /* 2026-10-09 · a promessa do DNA não entra mais no vídeo (a promessa é a premissa da planta): nem no gancho, nem na lista. */
  assert.doesNotMatch(row.cortes_para_redes + row.diretrizes_de_roteiro, /Hashtags certas aumentam/);
  /* 2026-10-08 (correção da revisão) · o modal ("podem ampliar") deixou de travar (-1) e a absoluta do capítulo 1 passou a ser contada (+1): 6. 2026-10-09 · sem a promessa do DNA: 5. */
  assert.match(row.pode_gravar, /^- 5 frase\(s\) que pedem fonte saíram do texto publicável/m);
});

test("25c · a porta (radarClaimGate): link da mesma seção, mercado sem fonte, mercado × fonte, com fonte e regra 17 — e o que ela NÃO trava", async () => {
  const { radarClaimGate, radarPlatformClaimWithoutSource } = await import("../lib/radar/pending-claims.ts");
  const pendentes = [
    { texto: "O algoritmo do Instagram prioriza conteúdo com alto engajamento", origem: "PLANTA", fonte: null, secao: 0 },
    { texto: "Clareamento com bicarbonato desgasta o esmalte do dente", origem: "MERCADO_SEM_FONTE", fonte: null, secao: null },
    { texto: "Protetor solar com FPS 30 bloqueia a radiação UVA", origem: "MERCADO_X_FONTE", fonte: null, secao: null },
    { texto: "Stories com enquete aumentam as respostas no direct", origem: "PLANTA", fonte: { id: "X1", url: "https://fonte.exemplo/stories", titulo: "Fonte" }, secao: 1 },
  ] as const;
  const comuns = new Set(["instagram"]);
  const porta = (frase: string, secao: number | null) => radarClaimGate(frase, pendentes, secao, { comuns });
  /* (a) o link da MESMA seção trava com 2 raízes distintivas em comum. */
  const a = porta("O algoritmo prioriza conteúdo que gera interação", 0);
  assert.equal(a.estado, "TRAVADA");
  assert.match(a.estado === "TRAVADA" ? a.motivo : "", /^a planta pede fonte oficial ou verificada: "O algoritmo do Instagram prioriza conteúdo com alto engajamento"$/);
  /* Em outra seção, o mesmo link precisa de 60% das raízes: uma raiz em comum não trava. */
  assert.equal(porta("Conteúdo de bastidor da clínica", 2).estado, "LIVRE");
  /* (b) e (c): cobrir 60% da afirmação do mercado trava, com o motivo de cada uma. */
  const b = porta("O bicarbonato desgasta o esmalte", null);
  assert.equal(b.estado, "TRAVADA");
  assert.match(b.estado === "TRAVADA" ? b.motivo : "", /^o mercado repete sem fonte: /);
  const c = porta("O protetor solar bloqueia a radiação", null);
  assert.equal(c.estado, "TRAVADA");
  assert.match(c.estado === "TRAVADA" ? c.motivo : "", /^a fonte contradiz ou condiciona o que o mercado repete: /);
  /* Com fonte do pacote, a frase fica e a fonte vem junto. */
  const comFonte = porta("Stories com enquete aumentam as respostas", 1);
  assert.equal(comFonte.estado, "COM_FONTE");
  assert.equal(comFonte.estado === "COM_FONTE" ? comFonte.afirmacao.fonte?.url : null, "https://fonte.exemplo/stories");
  /* (d) a regra 17: mecanismo da plataforma E efeito afirmado, sem link nenhum. */
  assert.equal(porta("Hashtags e geolocalização ajudam a ser encontrado por quem está perto.", 4).estado, "TRAVADA");
  assert.equal(radarPlatformClaimWithoutSource("Um site otimizado converte visitantes em agendamentos."), true);
  /* O que NÃO trava: a frase sem afirmação de plataforma, a recomendação que só nomeia o recurso, a pergunta. */
  for (const livre of [
    "A bio diz serviço, cidade e contato.",
    "Aplique táticas como parcerias com influenciadores locais, uso de hashtags relevantes e interação ativa com a audiência.",
    "Como atrair clientes pelo Instagram (sem cair na ilusão de que ele enche a agenda)",
  ]) assert.equal(porta(livre, 3).estado, "LIVRE", livre);
  /*
   * 2026-10-08 · a trava por SENTIDO: "canais que convertem" era livre aqui — a
   * conversão só contava com objeto depois do verbo — e saiu publicada na
   * lâmina 4 e no corte 2 do CSV real de 08/10. É afirmação de conversão do
   * público sem fonte, como "converte visitantes em agendamentos".
   */
  const canais = porta("Use o Instagram como vitrine, direcionando o público para canais que convertem, como o site e o WhatsApp.", 3);
  assert.equal(canais.estado === "TRAVADA" ? canais.motivo : canais.estado, "afirmação sobre conversão do público sem fonte (regra 17 da planta)");
  assert.equal(radarPlatformClaimWithoutSource("O algoritmo prioriza engajamento?"), false, "pergunta não afirma");
  assert.equal(radarPlatformClaimWithoutSource("Deixe o contato ao alcance da mão."), false, "\"ao alcance\" é expressão, não alcance da plataforma");
  /*
   * 2026-10-07 (revisão) · os buracos do detector: a plataforma como sujeito
   * de ordenar, entregar ou punir; "têm mais alcance"; "o alcance caiu". E o
   * que ele travava sem plataforma nenhuma: preço e recurso soltos.
   */
  for (const travada of [
    "O Instagram prioriza vídeos curtos.",
    "O Instagram penaliza links na legenda.",
    "O Instagram mostra seu conteúdo primeiro para quem já interage com você.",
    "Reels têm mais alcance que carrosséis.",
    "O alcance orgânico do Instagram caiu nos últimos anos.",
    "Os recursos do Instagram ajudam a ser encontrado.",
  ]) assert.equal(radarPlatformClaimWithoutSource(travada), true, travada);
  for (const livre of [
    "O preço da consulta aparece no site da clínica.",
    "Os recursos de agendamento ajudam a paciente a marcar sem esperar resposta.",
    "O Instagram mostra os bastidores da clínica.",
    "A atenção no feed é passageira; a decisão de marcar consulta envolve confiança e necessidade.",
  ]) assert.equal(radarPlatformClaimWithoutSource(livre), false, livre);
  /* A conversão do público tem o motivo dela — não é "afirmação sobre plataforma". */
  const conversao = porta("Um site otimizado converte visitantes em agendamentos.", 4);
  assert.equal(conversao.estado === "TRAVADA" ? conversao.motivo : "", "afirmação sobre conversão do público sem fonte (regra 17 da planta)");
});

test("25d · a trava por sentido de ponta a ponta (CSV real de 08/10): \"canais que convertem\" e o comportamento do público saem da lâmina e da ideia do corte; a tese passa", () => {
  /*
   * 2026-10-08 · o capítulo 2 do caso real abria por "Use o Instagram como
   * vitrine…, direcionando o público para canais que convertem, como o site e o
   * WhatsApp" — publicada na lâmina 4 e no corte 2 — e o Explicar trazia o
   * comportamento do público sem fonte. As duas saem do texto publicável e vão
   * para a lista "Fica fora", cada uma com o seu motivo; a frase livre do
   * Explicar ("gera confiança" não é efeito comercial) vira o Entregar.
   */
  const entrada = entradaDoAssunto(INSTAGRAM);
  const real = plantaDoCasoReal(entrada);
  const CANAIS = "Use o Instagram como vitrine para gerar autoridade e relacionamento, direcionando o público para canais que convertem, como o site e o WhatsApp.";
  const PROCURAM = "Pacientes com dor ou necessidade procuram atendimento pelo Google e chegam pelo site.";
  const planta = {
    ...real,
    blueprint: {
      ...real.blueprint,
      sections: real.blueprint.sections.map((secao, indice) => (indice === 1
        ? { ...secao, answerFirst: CANAIS, explain: [PROCURAM, "Conteúdo educativo gera confiança e posiciona você como autoridade."] }
        : secao)),
    },
  };
  const row = linhaDe(entrada, { blueprint: planta });
  const publicaveis = row.cortes_para_redes.split("\n").filter(linha => linha.startsWith("- Lâmina") || /^ {3}Ideia única: /.test(linha));
  assert.ok(publicaveis.length > 0, row.cortes_para_redes);
  for (const linha of publicaveis) assert.doesNotMatch(linha, /canais que convertem|procuram atendimento/, `texto publicável sem a afirmação travada: ${linha}`);
  /* A frase longa é citada encurtada na lista (teto da célula); o motivo vem inteiro. */
  assert.match(row.cortes_para_redes, /^- Capítulo 2 · [^:]*: "Use o Instagram como vitrine para gerar autoridade[^"]*" — afirmação sobre conversão do público sem fonte \(regra 17 da planta\); /m);
  assert.match(row.cortes_para_redes, /"Pacientes com dor ou necessidade procuram atendimento pelo Google e chegam pelo site" — afirmação sobre comportamento do público sem fonte \(regra 17 da planta\)/);
  assert.match(row.diretrizes_de_roteiro, /Entregar: o que a pesquisa sustenta: Conteúdo educativo gera confiança e posiciona você como autoridade/);
  assert.match(row.diretrizes_de_roteiro, /Fala delimitada, sem fonte: Use o Instagram como vitrine[^\n]*canais que convertem/, "na produção, a frase fica delimitada");
  /* A tese do dono continua: premissa e capa, como antes. */
  assert.match(row.diretrizes_de_roteiro, /^Premissa do vídeo: O vídeo mostra por que o Instagram, sozinho, não enche a agenda e como usar a plataforma de forma estratégica\.$/m);
  assert.match(row.cortes_para_redes, /^- Lâmina 1 \(capa\): Como atrair clientes pelo Instagram \(sem cair na ilusão de que ele enche a agenda\)\.$/m);
});

test("31 · a frase que DESMENTE o mercado passa (a tese do dono); o mercado sem fonte e o mercado × fonte travam de ponta a ponta; pergunta travada não abre corte", () => {
  /*
   * 2026-10-07 (revisão) · A porta casava só raízes: a premissa "Mostrar por que
   * o Instagram, sozinho, NÃO enche a agenda" e a capa "(sem cair na ilusão de
   * que ele enche a agenda)" — a tese do dono, do lado da fonte — saíam do
   * texto publicável como se repetissem "O Instagram enche a agenda da
   * clínica", que o mercado repete e a fonte contradiz. Frase que nega a
   * afirmação do mercado não a reproduz. E as coletas (b) e (c) da trava não
   * tinham teste de ponta a ponta: desligá-las passava verde.
   */
  const base = entradaGoogle();
  const molde = base.googleObserved!.authorityEvidence!.claims[0];
  const afirmacao = (canonicalClaim: string) => ({ ...molde, claimId: `claim:${canonicalClaim.length}`, canonicalClaim, ymyl: { ...molde.ymyl, relevance: "MATERIAL" as const } });
  const conflito = (canonicalClaim: string, factualPosition: string) => ({
    claimId: `claim:${canonicalClaim.length}`, canonicalClaim, conflictType: "MARKET_VS_FACTUAL_EVIDENCE" as const,
    marketObservation: canonicalClaim, factualPosition, resolution: null as never, impact: "A afirmação recorrente no mercado não deve ser reproduzida como fato.",
  });
  const autoridade = {
    ...base.googleObserved!.authorityEvidence!,
    /* "Postar com frequência…" está nas duas réguas: a contradição da fonte vence (o motivo certo é o de (c), não "sem fonte"). */
    claims: [afirmacao("Postar com frequência garante relevância e conversão"), afirmacao("Stories diários aumentam a confiança do paciente")],
    factualEvidence: [],
    marketVsFactConflicts: [
      conflito("O Instagram enche a agenda da clínica", "A procura por atendimento começa na busca, não no feed."),
      conflito("Postar com frequência garante relevância e conversão", "A frequência sozinha não garante relevância; o que pesa é a intenção de quem procura."),
    ],
  };
  const doAssunto = entradaDoAssunto(INSTAGRAM);
  const observado = { ...doAssunto.googleObserved!, authorityEvidence: autoridade } as never;
  const entrada = { ...doAssunto, googleObserved: observado, dossierGaps: { ...doAssunto.dossierGaps!, observed: observado } };
  const real = plantaDoCasoReal(entrada);
  const planta = {
    ...real,
    blueprint: {
      ...real.blueprint,
      sections: [
        real.blueprint.sections[0],
        { ...real.blueprint.sections[1], answerFirst: "Postar com frequência não garante relevância nem conversão.", explain: ["Postar com frequência garante relevância.", "Stories diários aumentam a confiança do paciente."] },
        real.blueprint.sections[2],
        { ...real.blueprint.sections[1], h2: "A agenda e o Instagram", readerQuestion: "O Instagram enche a agenda da clínica?", answerFirst: "Mostre o caminho da busca até o agendamento.", explain: [], practical: "um exemplo do caminho da busca até o agendamento", h3: [], evidence: [], from: [] },
      ],
    },
  };
  const row = linhaDe(entrada, { blueprint: planta });
  const cortes = row.cortes_para_redes;
  /* A tese do dono passa: premissa e capa como estão, e nada delas na lista "Fica fora". */
  assert.match(row.diretrizes_de_roteiro, /^Premissa do vídeo: O vídeo mostra por que o Instagram, sozinho, não enche a agenda e como usar a plataforma de forma estratégica\.$/m);
  assert.match(cortes, /^- Lâmina 1 \(capa\): Como atrair clientes pelo Instagram \(sem cair na ilusão de que ele enche a agenda\)\.$/m);
  assert.doesNotMatch(cortes, /^- (?:Premissa do vídeo|Capa do carrossel)/m, "a tese não é censurada");
  /* A frase que desmente o mercado (o lado da fonte) é publicável e não vira "fala delimitada, sem fonte". */
  assert.match(cortes, /^- Lâmina 3: Título: Como usar o Instagram de forma estratégica · Apoio \(texto publicável\): Postar com frequência não garante relevância nem conversão\. · /m);
  assert.doesNotMatch(row.diretrizes_de_roteiro, /Fala delimitada, sem fonte: Postar com frequência não garante/);
  /* A que REPETE o mercado trava — por (c), com o motivo da fonte que contradiz — e a afirmação que o mercado repete sem fonte trava por (b). */
  assert.match(cortes, /^- Capítulo 2 · lâmina 3[^:]*: "Postar com frequência garante relevância" — a fonte contradiz ou condiciona o que o mercado repete: "Postar com frequência garante relevância e conversão"; "Stories diários aumentam a confiança do paciente" — o mercado repete sem fonte: "Stories diários aumentam a confiança do paciente"\.$/m);
  for (const lamina of cortes.split("\n").filter(linha => linha.startsWith("- Lâmina"))) assert.doesNotMatch(lamina, /garante relevância\.|Stories diários/, lamina);
  /* A pergunta que repete o mercado não abre corte (o gancho é a pergunta) e entra na lista com o motivo. */
  assert.match(cortes, /^Capítulos sem corte: [^\n]*4 \(a pergunta do capítulo pede fonte\)/m);
  assert.doesNotMatch(cortes, /^\d+\. Do capítulo 4 \(/m);
  assert.match(cortes, /^- Capítulo 4 · lâmina 5: "O Instagram enche a agenda da clínica\?" — a fonte contradiz ou condiciona o que o mercado repete: "O Instagram enche a agenda da clínica"\.$/m);
});

/* 2026-10-07 · as palavras de espera aberta que o D10 proíbe no CSV de vídeo (revisão: "rascunho" e "falta conferir" entraram). */
/* 2026-10-08 · e "fonte a obter" e "preencher" (a lista do desenho de 08/10): o "Antes de afirmar" dizia "(fonte a obter: oficial ou verificada)". */
/* 2026-10-08 · "pendência" com fronteira: "dependência" (a Skill real: "menor dependência da exposição…") não é espera aberta. */
/* 2026-10-08 (correção da revisão) · e as esperas antigas: "a definir" (o público e a seção do vídeo) e "conferir antes" (a transcrição). */
const D10_PROIBIDAS = [/\bpend[eê]ncia/i, /pendente de/i, /aguardando/i, /confira antes de aprovar/i, /rascunho/i, /falta conferir/i, /fonte a obter/i, /preencher/i, /\ba definir\b/i, /conferir antes/i];

test("26 · D10: o CSV de vídeo inteiro sai concluído — nenhuma pendência, \"pendente de\", \"aguardando\", \"rascunho\" nem \"confira antes de aprovar\"", () => {
  /*
   * 2026-10-07 · A decisão do dono (D10): o entregável sai concluído; problema
   * detectado vira correção automática ou instrução concluída. A fixture passa
   * pelos caminhos que antes escreviam espera aberta — capítulo sem frase
   * aproveitável (o antigo "PENDÊNCIA:"), pareceres do especialista ainda não
   * aceitos (o antigo "aguardando aceite") e frases travadas — e o arquivo
   * INTEIRO é varrido, das linhas Marca e Voz da marca à última célula.
   */
  const entrada = entradaDoAssunto(INSTAGRAM, { specialistContext: { ...APOIO, pending: 2 } });
  const semContribuicao = entradaDoAssunto(IMPLANTE, { specialistContext: { ...APOIO, items: [], pending: 1 }, authors: [{ name: "Dr. Paulo Lima", specialty: null, source: "contribution" }] });
  const base = plantaDoCasoReal(entrada);
  const planta = {
    ...base,
    blueprint: {
      ...base.blueprint,
      sections: [...base.blueprint.sections, { ...base.blueprint.sections[1], h2: "Prova social", readerQuestion: "Prova social?", answerFirst: "Depoimento sempre converte.", explain: ["Nunca publique sem prova."], h3: [], practical: null }],
    },
  };
  /* 2026-10-09 · as duas linhas levam a planta APPROVED: sem ela, o lote pede o artigo-modelo antes. */
  const csv = csvPronto(radarPortableVideoExport({
    articles: [
      { entrada, blueprint: planta, youtube: youtubeDe(INSTAGRAM.principal, "instagram para clínicas") },
      { ...comPlanta(semContribuicao), youtube: null },
    ],
    today: EXPORTADO_EM,
    brandVoice: COM_VOZ,
  }));
  /* Os caminhos que antes deixavam espera aberta estão mesmo no arquivo (lido célula a célula: o CSV dobra as aspas). */
  const linhas = lerCsv(csv);
  assert.match(linhas[2].diretrizes_de_roteiro, /^ {3}Entregar: abra pela pergunta "Prova social\?" e responda só com o que esta linha sustenta, em fala delimitada/m);
  assert.match(linhas[2].especialista, /^2 parecer\(es\) ainda não aceito\(s\) no Radar ficam fora desta linha\.$/m);
  assert.match(linhas[3].especialista, /^Contribuição: nenhuma aceita no Radar; 1 parecer\(es\) ainda não aceito\(s\) ficam fora desta linha\./m);
  assert.match(linhas[2].cortes_para_redes, /^Fica fora do texto publicável/m);
  /* 2026-10-08 · o link sem fonte da planta passa pelo "Antes de afirmar" com a regra concluída (era "fonte a obter"). */
  assert.match(linhas[2].diretrizes_de_roteiro, /Antes de afirmar: O algoritmo do Instagram prioriza conteúdo com alto engajamento \(a planta pede fonte oficial ou verificada; o pacote não tem\); sem fonte, diga de forma delimitada\./);
  for (const proibida of D10_PROIBIDAS) {
    assert.doesNotMatch(csv, proibida, `D10: o CSV de vídeo não pode conter ${proibida}`);
  }
  /*
   * 2026-10-07 (revisão) · a varredura passava só com a Skill de voz ATIVA. Com
   * a Skill em rascunho ou aguardando aprovação (estado normal do fluxo da
   * Marca), o rótulo do estado ia para as linhas Marca e Voz da marca e para a
   * origem do público. O CSV de vídeo diz a versão corrente; o CSV para
   * escrever (radar-brand-voice.test) continua dizendo o estado.
   */
  for (const status of ["draft", "pending_approval"]) {
    const comVozNoEstado: RadarBrandVoiceState = { kind: "available", voice: { ...VOZ, status } };
    const noEstado = csvPronto(radarPortableVideoExport({
      articles: [{ entrada, blueprint: planta, youtube: youtubeDe(INSTAGRAM.principal, "instagram para clínicas") }],
      today: EXPORTADO_EM,
      brandVoice: comVozNoEstado,
    }));
    for (const proibida of D10_PROIBIDAS) assert.doesNotMatch(noEstado, proibida, `D10 com a Skill em ${status}: ${proibida}`);
    const [marca, voz, artigo] = lerCsv(noEstado);
    assert.match(marca.pode_gravar, /Skill "Agência Exemplo" v3 \(versão corrente na Marca\)/);
    assert.match(voz.pode_gravar, /^Vale para todos os vídeos deste arquivo: Skill "Agência Exemplo" v3 \(versão corrente na Marca\)\./m);
    assert.match(artigo.tema_e_publico, /da Skill de voz da marca, Skill "Agência Exemplo" v3 \(versão corrente na Marca\)\.$/m);
  }
});

/* 2026-10-07 · uma pesquisa do YouTube com a duração de cada vídeo escolhida: a amostra pertinente precisa de números que o filtro mude. */
function youtubeComDuracoes(principal: string, videos: ReadonlyArray<{ title: string; segundos: number }>): RadarVideoExportYoutube {
  const results = videos.map((video, v) => RadarYoutubeSearchResultSchema.parse({
    videoId: `dur${String(v).padStart(8, "0")}`, url: `https://www.youtube.com/watch?v=dur${String(v).padStart(8, "0")}`,
    title: video.title, channelName: `Canal ${v}`, rank: v + 1,
    durationSeconds: video.segundos, views: 1_000 * (v + 1), isShorts: false, publishedAt: "2026-03-01T00:00:00.000Z", queryId: "ytq:1",
  }));
  const run = buildRadarYoutubeSearchRun({
    runId: "run-dur", runVersion: 1, startedAt: "2026-09-14T18:51:00.000Z", startedBy: "u",
    fingerprint: buildRadarYoutubeRunFingerprint({ articleId: "a1", articleDnaVersionId: "d1", queryIds: ["ytq:1"] }),
    provenance: {
      provider: "dataforseo", endpoint: RADAR_YOUTUBE_PROVIDER_ENDPOINT, blockDepth: 20,
      queriesRequested: 1, queriesSucceeded: 1, queriesFailed: 0, failures: [], collectedAt: "2026-09-14T18:51:07.000Z",
    },
    queries: [{ queryId: "ytq:1", text: principal, origin: "PRIMARY_KEYWORD", reason: "consulta", executed: true, resultCount: videos.length }],
    results, universe: buildRadarYoutubeUniverse(results),
  });
  return radarVideoExportYoutubeOf({ run, frozen: null, declaredIntent: "INFORMATIONAL", editorialTopics: [], generatedAt: EXPORTADO_EM })!;
}

test("27 · estatísticas só com os pertinentes: o fora do tema sai da duração, do formato e da faixa; ressalva de amostra pequena; divergência dita; sem universo, não recalculável", () => {
  const entrada = entradaDoAssunto({ ...INSTAGRAM, audience: "Biomédicas estetas e profissionais de estética que atendem em clínicas e consultórios. Querem agenda cheia." });
  /* Os dez títulos do tema do teste 22 (raízes espalhadas) e quatro que só citam a plataforma, bem mais longos. */
  const dentro = [
    "Como atrair clientes pelo Instagram na estética", "Captar clientes no Instagram: o guia da clínica", "Como atrair clientes pelo Instagram sem anúncio",
    "Clientes pela internet: o Instagram da clínica", "Como atrair clientes pelo Instagram com conteúdo", "Captar clientes pelo Instagram: erros comuns",
    "Clientes pela internet com o Instagram do consultório", "Captar clientes pelo Instagram com perfil otimizado", "Como atrair clientes pelo Instagram: passo a passo",
    "Clientes pela internet: Instagram que agenda",
  ];
  const duracoes = [480, 540, 560, 600, 600, 600, 620, 660, 700, 720];
  const plataforma = ["Seis dicas de alcance no Instagram", "A psicologia das pessoas que não usam Instagram", "Feed bonito no Instagram: tendências do ano", "O que postar no Instagram hoje"];
  /*
   * 2026-10-07 (revisão) · e dois de OUTRO público ("clientes de advocacia",
   * "pacientes para contabilidade"), bem mais longos: a régua tirava só o fora
   * do tema da conta no teste, e incluir OUTRO entre os pertinentes passava.
   */
  const outroPublico = ["Como atrair clientes de advocacia pelo Instagram", "Como atrair pacientes para contabilidade pelo Instagram"];
  const intencao = linhaDe(entrada, { youtube: youtubeComDuracoes(INSTAGRAM.principal, [...dentro.map((title, i) => ({ title, segundos: duracoes[i] })), ...plataforma.map(title => ({ title, segundos: 3600 })), ...outroPublico.map(title => ({ title, segundos: 5400 }))]) }).intencao_e_formato;
  assert.match(intencao, /^No YouTube: 16 vídeo\(s\) longos e 0 Shorts comparáveis na amostra\.$/m, "a linha da fotografia continua a da amostra inteira");
  assert.match(intencao, /^Amostra pertinente \(mesmo público, público vizinho e tema geral; pelo título e pelo canal\): 10 de 16 longos · 0 de 0 Shorts\. Fora da conta: 4 fora do tema da busca · 2 de outro público\.$/m);
  /* Amostra inteira: mediana 10min50s e P75 60min. Pertinentes: mediana 10min, metade central 9min30s–10min50s — sem o fora do tema nem o outro público. */
  assert.match(intencao, /^Duração dos longos \(pertinentes\): mediana 10min \(metade central entre 9min30s e 10min50s\)$/m);
  /* 2026-10-09 · a faixa de cada coorte pertinente e o formato pela decisão única. */
  assert.match(intencao, /^Faixa por coorte \(pertinentes, P25–P75; referência, não meta\): longos 9min30s a 10min50s$/m);
  assert.match(intencao, /^Formato do vídeo: vídeo longo — os vídeos longos lideram a amostra pertinente \(0 Short\(s\) × 10 vídeo\(s\) longo\(s\) pertinentes\): o vídeo segue o artigo-modelo, em formato longo\.$/m);
  assert.match(intencao, /^Formato recomendado \(pertinentes\): Tutorial$/m);
  assert.doesNotMatch(intencao, /10min40s|48min|60min|90min/, "nem o fora do tema nem o outro público entram em estatística");
  assert.doesNotMatch(intencao, /entram nas estatísticas/);

  /* Três pertinentes: a ressalva de amostra pequena, sobre a amostra pertinente. */
  const pequena = linhaDe(entrada, { youtube: youtubeComDuracoes(INSTAGRAM.principal, [...dentro.slice(0, 3), ...plataforma.slice(0, 3)].map(title => ({ title, segundos: 600 }))) }).intencao_e_formato;
  assert.match(pequena, /: 3 de 6 longos · 0 de 0 Shorts\. Fora da conta: 3 fora do tema da busca\.$/m);
  assert.match(pequena, /^Ressalva: a amostra pertinente de longos tem 3 vídeo\(s\): abaixo de 4 os padrões descrevem casos, não mercado\.$/m);

  /* Divergência: a amostra inteira aponta lista (5 "dicas" fora do tema); os pertinentes, tutorial. Dita, não aplicada. */
  const dicas = ["Dicas de alcance no Instagram", "Dicas de feed no Instagram", "Dicas de reels no Instagram", "Dicas de legenda no Instagram", "Dicas de enquete no Instagram"];
  const comDicas = youtubeComDuracoes(INSTAGRAM.principal, [...dentro.filter(titulo => titulo.startsWith("Como")).slice(0, 4), ...dicas].map(title => ({ title, segundos: 600 })));
  const diverge = linhaDe(entrada, { youtube: comDicas }).intencao_e_formato;
  assert.match(diverge, /^Formato recomendado \(pertinentes\): Tutorial$/m);
  /*
   * 2026-10-07 (revisão) · a comparação de formato é com a amostra inteira pela
   * MESMA régua de hoje (não com o formato gravado na fotografia, do
   * classificador da época), e o formato sozinho não mexe na sequência.
   */
  assert.match(diverge, /^Divergência: a amostra inteira aponta o formato Ranking \/ lista e os pertinentes, o formato Tutorial\. O formato recomendado acima é o dos pertinentes; nada foi regravado\.$/m);

  /*
   * 2026-10-07 (revisão) · nenhum vídeo fora da conta e a fotografia gravada com
   * o formato de um classificador antigo ("Ranking / lista" para títulos que
   * hoje são tutorial): a diferença é do classificador, não da pertinência —
   * não há divergência a dizer.
   */
  const soDoTema = youtubeComDuracoes(INSTAGRAM.principal, dentro.map(title => ({ title, segundos: 600 })));
  const fotografiaAntiga = { ...soDoTema, blueprint: { ...soDoTema.blueprint!, recommended: { ...soDoTema.blueprint!.recommended, format: "Ranking / lista" }, observed: { ...soDoTema.blueprint!.observed, avFormats: [{ ...soDoTema.blueprint!.observed.avFormats[0], label: "Ranking / lista" }] } } };
  const semDivergencia = linhaDe(entrada, { youtube: fotografiaAntiga }).intencao_e_formato;
  assert.match(semDivergencia, /: 10 de 10 longos · 0 de 0 Shorts\.$/m);
  assert.doesNotMatch(semDivergencia, /Divergência/, "sem ninguém fora da conta, o formato não diverge pela pertinência");

  /*
   * Sem o universo (congelamento que guarda só a referência da corrida).
   * 2026-10-09 · a fotografia é dita pela régua que a fez: a ANTIGA (sem a
   * linha da régua pertinente) não é recalculável e fica só como referência —
   * sem decidir o formato; a NOVA já gravou a amostra pertinente.
   */
  const viva = youtubeDe(INSTAGRAM.principal, "instagram para clínicas");
  const antiga = { ...viva.blueprint!, limitations: viva.blueprint!.limitations.filter(item => !item.startsWith(RADAR_YOUTUBE_PERTINENT_RULER)) };
  const semUniverso = linhaDe(entrada, { youtube: { ...viva, blueprint: antiga, frozen: true, videos: [] } }).intencao_e_formato;
  assert.match(semUniverso, /^Amostra pertinente: não recalculável — o congelamento guarda só a referência da corrida, e a corrida com esse id não está nesta exportação; as estatísticas abaixo são da amostra inteira, só como referência\.$/m);
  assert.match(semUniverso, /^Formatos que dominam \(amostra inteira, régua anterior a 2026-10-09\): /m);
  assert.doesNotMatch(semUniverso, /\(pertinentes\)|^Faixa recomendada/m);
  assert.match(semUniverso, /^Formato do vídeo: vídeo longo — sem amostra pertinente do YouTube/m);
  const daNova = linhaDe(entrada, { youtube: { ...viva, frozen: true, videos: [] } }).intencao_e_formato;
  assert.match(daNova, /^Amostra pertinente \(gravada na fotografia\): \d+ longos · \d+ Shorts\.$/m);
});

test("28 · a demonstração definida pela planta: ajuste sem depois, passos por \";\", o objeto pelos termos — e capítulo explicativo não vira corte", () => {
  const entrada = entradaDoAssunto(INSTAGRAM);
  const planta = plantaComSecoes(entrada, [
    { h2: "Bio que agenda", terms: ["link de agendamento", "destaques"], practical: "bio genérica → serviço, cidade e link de agendamento" },
    { h2: "Rotina da semana", practical: "grave os stories na segunda; publique o carrossel na quarta; responda o direct na sexta" },
    { h2: "Por que o feed não converte", practical: null, h3: ["Só um subtítulo"] },
  ]);
  const linha = linhaDe(entrada, { blueprint: planta });
  const roteiro = linha.diretrizes_de_roteiro;
  /* "A → B": antes e ajuste; o depois não está na planta e a linha diz o que mostrar no lugar, sem métrica. O objeto é o termo que a entrega prática nomeia. */
  assert.match(roteiro, /^ {3}Mostrar na tela \(demonstração da planta\): objeto: link de agendamento · antes: bio genérica · ajuste: serviço, cidade e link de agendamento · depois: não descrito na planta — mostre o resultado do ajuste na própria tela, sem métrica · prepare 3 telas \(uma por momento\) /m);
  /* ";" na entrega prática: passos, uma tela por passo. */
  assert.match(roteiro, /^ {3}Mostrar na tela \(demonstração da planta\): passos: grave os stories na segunda; publique o carrossel na quarta; responda o direct na sexta · prepare uma tela por passo /m);
  /* Um H3 só não é demonstração: capítulo explicativo. */
  assert.match(roteiro, /^ {3}Mostrar na tela: sem demonstração na planta \(capítulo explicativo\) — contexto visual: o título do capítulo em destaque; este capítulo não vira corte\.$/m);
  const cortes = linha.cortes_para_redes;
  assert.match(cortes, /^ {3}Mostrar: o ajuste — serviço, cidade e link de agendamento — a partir do antes \(bio genérica\), com o resultado do ajuste na própria tela, num exemplo fictício identificado como ilustrativo\.$/m);
  /*
   * 2026-10-08 · D2: a ideia ("Resposta direta") não nomeia nenhum passo — a
   * cena do corte era "só o primeiro passo", que não casa com a ideia. Agora a
   * cena mostra a própria ideia numa situação; os passos ficam no vídeo longo.
   */
  assert.match(cortes, /^ {3}Mostrar: a ideia numa situação — Resposta direta — num exemplo fictício identificado como ilustrativo; os passos do capítulo ficam no vídeo longo\.$/m);
  assert.doesNotMatch(cortes, /só o primeiro passo — grave os stories/);
  assert.doesNotMatch(cortes, /^\d+\. Do capítulo 3 \(/m, "capítulo explicativo não vira corte");
  assert.match(cortes, /^Capítulos sem corte: 3 \(sem demonstração definida na planta\)\.$/m);
  /* O Visual da lâmina sai da mesma demonstração. */
  assert.match(cortes, /^- Lâmina 2: [^\n]* · Visual: demonstração: bio genérica → serviço, cidade e link de agendamento\.$/m);
  assert.match(cortes, /^- Lâmina 3: [^\n]* · Visual: os passos em lista: grave os stories na segunda; publique o carrossel na quarta; responda o direct na sexta\.$/m);
});

test("29 · cortes pela utilidade isolada: a pergunta de 6 páginas vence a de 1; lacuna pontua; frase só travada não vira corte; ideia com vários passos ganha o alinhamento; sem elegível, nenhum corte inventado", () => {
  const entrada = entradaDoAssunto({ ...INSTAGRAM, perguntas: [["Como atrair clientes pelo Instagram com stories?", 6], ["Como atrair clientes pelo Instagram com reels?", 1]] });
  const comAcao = (h2: string, evidence: string[]) => ({ h2, practical: `um exemplo de ${h2.toLowerCase()}`, from: [], evidence });
  const base = plantaComSecoes(entrada, [
    comAcao("Reels da semana", ["P2"]),
    comAcao("Stories que agendam", ["P1"]),
    comAcao("Destaques do perfil", ["P1"]),
    comAcao("Direct que responde", ["P1", "G1"]),
  ]);
  /* A amostra vai da maior para a menor: P1 é a pergunta de 6 páginas, P2 a de 1. */
  assert.match(base.evidence.find(item => item.id === "P1")?.text || "", /\(6 de 12 páginas\)$/);
  assert.match(base.evidence.find(item => item.id === "P2")?.text || "", /\(1 de 12 páginas\)$/);
  const planta = { ...base, evidence: [...base.evidence, { id: "G1", kind: "lacuna", text: "Direct que responde (1 de 12 páginas cobrem)" }] };
  const cortes = linhaDe(entrada, { blueprint: planta }).cortes_para_redes;
  const escolhidos = cortes.split("\n").map(linha => linha.match(/^\d+\. Do capítulo (\d+) \(/)).filter(Boolean).map(casado => Number(casado![1]));
  /* A dispersão pura (início, meio, fim) levaria o capítulo 1; a utilidade o deixa de fora. */
  assert.deepEqual(escolhidos, [2, 3, 4]);
  assert.match(cortes, /^ {3}Utilidade 4 de 4: pergunta com demanda \(P1: 6 de 12 páginas\) · funciona sozinha · uma ação · lacuna G1\.$/m);
  assert.match(cortes, /^Capítulos sem corte: 1 \(utilidade 2 de 4, abaixo dos escolhidos\)\.$/m);

  /*
   * 2026-10-07 · a pergunta de um Short do multiformato dava demanda sem id P na seção.
   * 2026-10-09 · um plano de Shorts só (os cortes da planta): sem evidência da
   * seção, não há demanda medida — a ação única dá o ponto.
   */
  const doShort = plantaComSecoes(entrada, [comAcao("Stories que agendam", [])]);
  const comShort = linhaDe(entrada, { blueprint: doShort, youtube: youtubeDe(INSTAGRAM.principal, "instagram para clínicas") }).cortes_para_redes;
  assert.match(comShort, /^ {3}Utilidade 1 de 4: pergunta sem demanda medida na SERP · funciona sozinha · uma ação\.$/m);
  assert.doesNotMatch(comShort, /pergunta de um Short que a pesquisa recomenda/);

  /* A única frase publicável está travada: o capítulo sai da escolha, com o motivo. */
  const travada = plantaComSecoes(entrada, [
    { h2: "Hashtags locais", practical: "um exemplo de hashtag local", answerFirst: "Hashtags e geolocalização ajudam a ser encontrado por quem está perto.", explain: [] },
    comAcao("Stories que agendam", ["P1"]),
  ]);
  const semTravada = linhaDe(entrada, { blueprint: travada }).cortes_para_redes;
  assert.doesNotMatch(semTravada, /^\d+\. Do capítulo 1 \(/m);
  assert.match(semTravada, /^Capítulos sem corte: 1 \(a frase publicável pede fonte\)\.$/m);

  /*
   * Ideia com três táticas e cena com uma (o corte 3 do CSV real).
   * 2026-10-07 (revisão) · D10: o alinhamento só mandava "ficar no primeiro
   * passo", e a cena do storyboard mostrava o gancho no plural sobre um passo
   * só. Agora a correção é feita: o corte MOSTRA os três passos que a ideia
   * nomeia, uma tela cada — gancho, ideia, Mostrar e storyboard dizem o mesmo.
   */
  /*
   * 2026-10-08 · D3: os H3 do caso real ("Parcerias com…", "Uso inteligente
   * de…", "Interação e…") são tópicos e hoje fazem o capítulo explicativo; a
   * fixture escreve as mesmas táticas como AÇÕES, que é o que o corte mostra.
   */
  const tatica = plantaComSecoes(entrada, [{
    h2: "Estratégias práticas", answerFirst: "Aplique táticas como parcerias com influenciadores locais, uso de hashtags relevantes e interação ativa com a audiência.",
    h3: ["Faça parcerias com influenciadores e perfis locais", "Use hashtags e geolocalização com inteligência", "Promova interação ativa na plataforma"],
  }]);
  const linhaDaTatica = linhaDe(entrada, { blueprint: tatica });
  const comTatica = linhaDaTatica.cortes_para_redes;
  assert.match(comTatica, /^ {3}Utilidade \d de 4: [^\n]* · 3 passos \(o corte mostra os 3 que a ideia nomeia\)\.$/m);
  assert.match(comTatica, /^ {3}Mostrar: os 3 passos que a ideia nomeia, uma tela rápida por passo — Faça parcerias com influenciadores e perfis locais; Use hashtags e geolocalização com inteligência; Promova interação ativa na plataforma — num exemplo fictício identificado como ilustrativo; o detalhe de cada passo fica no vídeo longo\.$/m);
  assert.match(comTatica, /^ {3}Alinhamento: a ideia única nomeia 3 passos e o corte mostra os 3, uma tela por passo: gancho, ideia e cena falam dos mesmos passos\.$/m);
  assert.doesNotMatch(comTatica, /ficam nesse passo|só o primeiro passo/, "a correção é feita, não pedida");
  assert.match(comTatica, /^ {3}Origem recomendada: gravar à parte com fala própria — motivo: a demonstração tem 3 passos e o corte mostra 3 em sequência rápida, que a gravação do capítulo detalha um a um\. /m);
  assert.match(linhaDaTatica.storyboard_visual, /^- Corte 1 \(capítulo 1\): tela 1: "Estratégias práticas\?" · telas 2 a 4: os 3 passos que a ideia nomeia, um por tela — "Faça parcerias com influenciadores e perfis locais"; "Use hashtags e geolocalização com inteligência"; "Promova interação ativa na plataforma" · tela final: o CTA do corte\.$/m);

  /* Nenhum capítulo passa nos portões: nenhum corte inventado para completar a conta. */
  const nenhum = linhaDe(entrada, { blueprint: plantaComSecoes(entrada, [{ h2: "Contexto" }, { h2: "Fundamento" }]) }).cortes_para_redes;
  assert.match(nenhum, /^Cortes \(Shorts, Reels e TikTok\): nenhum capítulo da planta funciona sozinho como corte \(pergunta própria, frase publicável e demonstração definida\); os capítulos ficam no vídeo longo\.$/m);
  assert.doesNotMatch(nenhum, /Do capítulo/);
});

test("30 · a célula aguenta a linha maior: seis capítulos com dois links, travas, cortes e a lista \"Fica fora\" sem corte no teto", () => {
  /*
   * 2026-10-07 · as linhas novas (utilidade, alinhamento, origem recomendada,
   * capítulos sem corte, "Fica fora", amostra pertinente) cabem no teto de
   * RADAR_VIDEO_EXPORT_CELL_CHARS com o caso maior que a planta produz no uso
   * real: seis capítulos (LIMITES.chapters), cada um com dois links externos
   * pendentes e duas afirmações de plataforma travadas, e a pesquisa do YouTube
   * cheia. A lista "Fica fora" fica no fim da célula: se o teto cortasse, ela
   * seria a primeira a sumir.
   */
  const entrada = entradaDoAssunto(INSTAGRAM);
  /* Seis capítulos com o tamanho dos do CSV real (h2, pergunta, resposta, três frases de explicar, três H3) e dois links pendentes cada. */
  const assuntos = ["o perfil", "os stories", "o direct", "os destaques", "os reels", "o link da bio"];
  const capitulo = (assunto: string, n: number) => ({
    h2: `Como ajustar ${assunto} para atrair clientes pelo Instagram (parte ${n})`,
    readerQuestion: `O que muda quando ${assunto} da clínica fala com quem procura atendimento perto de casa?`,
    answerFirst: `Organize ${assunto} para dizer quem você atende, em que cidade e como agendar, com uma chamada clara para o próximo passo.`,
    explain: [
      `O algoritmo prioriza publicações com interação em ${assunto}, não necessariamente as que levam a agendamentos.`,
      `Hashtags e geolocalização ajudam a ser encontrado por quem está perto, também em ${assunto}.`,
      `Quem chega por ${assunto} decide pela confiança: mostre o atendimento como ele é, sem promessa de resultado.`,
    ],
    h3: [`Diagnóstico de ${assunto}`, `O ajuste em ${assunto}`, `Como medir ${assunto} sem número inventado`],
    externalLinks: [
      { claim: `O algoritmo do Instagram prioriza publicações com interação (${assunto})`, sourceType: "oficial", source: null },
      { claim: `Hashtags e geolocalização ampliam o alcance local (${assunto})`, sourceType: "oficial", source: null },
    ],
  });
  const planta = plantaComSecoes(entrada, assuntos.map((assunto, indice) => capitulo(assunto, indice + 1)));
  const youtube = youtubeCheio(INSTAGRAM.principal, [INSTAGRAM.principal, "instagram para clínicas", "marketing para clínicas de estética", "como divulgar clínica de estética no instagram"], 90);
  const row = linhaDe(entrada, { blueprint: planta, youtube, brandVoice: COM_VOZ });
  for (const [coluna, valor] of Object.entries(row)) {
    assert.ok(valor.length <= RADAR_VIDEO_EXPORT_CELL_CHARS, `${coluna}: ${valor.length} caracteres`);
    assert.doesNotMatch(valor, /cortado no limite da célula/, `${coluna} não pode ser cortada`);
  }
  assert.match(row.cortes_para_redes, /^Fica fora do texto publicável/m);
  assert.match(row.cortes_para_redes, /^- Capítulo 6 · lâmina 7/m, "a lista chega ao último capítulo");
});

test("32 · roteiro e cortes encolhem em vez de serem cortados: com frases ~35% maiores e o pior caso da planta, o fim de cada coluna e a lista \"Fica fora\" inteira continuam", () => {
  /*
   * 2026-10-07 (revisão) · o teste 30 deixava 279 e 523 caracteres de folga:
   * com as frases só um pouco maiores (dentro da faixa do CSV real), o teto da
   * célula cortava diretrizes_de_roteiro no capítulo 6 — levando Fechamento,
   * Descrição, "Vídeo × artigo", "Não inventar" e a linha da voz — e
   * cortes_para_redes no meio da lista "Fica fora". As duas colunas agora
   * encolhem por níveis e dizem que encolheram.
   */
  const entrada = entradaDoAssunto(INSTAGRAM);
  const assuntos = ["o perfil", "os stories", "o direct", "os destaques", "os reels", "o link da bio"];
  const mais = " para a clínica de estética do bairro";
  const longo = (frase: string) => `${frase} — e isso vale também para quem atende em consultório pequeno, com agenda curta e pouco tempo para produzir conteúdo toda semana na plataforma`;
  const casos = {
    /* O teste 30 com as frases ~35% maiores. */
    maior: (assunto: string, n: number) => ({
      h2: `Como ajustar ${assunto} para atrair clientes pelo Instagram (parte ${n})`,
      readerQuestion: `O que muda quando ${assunto} da clínica fala com quem procura atendimento perto de casa${mais}?`,
      answerFirst: `Organize ${assunto} para dizer quem você atende, em que cidade e como agendar${mais}, com uma chamada clara para o próximo passo.`,
      explain: [
        `O algoritmo prioriza publicações com interação em ${assunto}${mais}, não necessariamente as que levam a agendamentos.`,
        `Hashtags e geolocalização ajudam a ser encontrado por quem está perto${mais}, também em ${assunto}.`,
        `Quem chega por ${assunto} decide pela confiança${mais}: mostre o atendimento como ele é, sem promessa de resultado.`,
      ],
      h3: [`Diagnóstico de ${assunto}`, `O ajuste em ${assunto}`, `Como medir ${assunto} sem número inventado`],
      externalLinks: [
        { claim: `O algoritmo do Instagram prioriza publicações com interação (${assunto})`, sourceType: "oficial", source: null },
        { claim: `Hashtags e geolocalização ampliam o alcance local (${assunto})`, sourceType: "oficial", source: null },
      ],
    }),
    /* O pior caso que a planta permite: resposta e as três frases de explicar longas e travadas, dois links por seção. */
    pior: (assunto: string, n: number) => ({
      h2: `Como ajustar ${assunto} para atrair clientes pelo Instagram (parte ${n})`,
      readerQuestion: `O que muda quando ${assunto} da clínica fala com quem procura atendimento perto de casa?`,
      answerFirst: longo(`O algoritmo do Instagram favorece ${assunto} com interação constante`),
      explain: [
        longo(`O algoritmo prioriza publicações com interação em ${assunto}, não necessariamente as que levam a agendamentos`),
        longo(`Hashtags e geolocalização ajudam a ser encontrado por quem está perto, também em ${assunto}`),
        longo(`Os anúncios impulsionados aumentam o alcance de ${assunto} entre quem mora perto`),
      ],
      h3: [`Diagnóstico de ${assunto}`, `O ajuste em ${assunto}`, `Como medir ${assunto} sem número inventado`],
      externalLinks: [
        { claim: `O algoritmo do Instagram prioriza publicações com interação (${assunto})`, sourceType: "oficial", source: null },
        { claim: `Hashtags e geolocalização ampliam o alcance local (${assunto})`, sourceType: "oficial", source: null },
      ],
    }),
  };
  const youtube = youtubeCheio(INSTAGRAM.principal, [INSTAGRAM.principal, "instagram para clínicas", "marketing para clínicas de estética", "como divulgar clínica de estética no instagram"], 90);
  for (const [nome, capitulo] of Object.entries(casos)) {
    const planta = plantaComSecoes(entrada, assuntos.map((assunto, indice) => capitulo(assunto, indice + 1)));
    const row = linhaDe(entrada, { blueprint: planta, youtube, brandVoice: COM_VOZ });
    for (const [coluna, valor] of Object.entries(row)) {
      assert.ok(valor.length <= RADAR_VIDEO_EXPORT_CELL_CHARS, `${nome} · ${coluna}: ${valor.length} caracteres`);
      assert.doesNotMatch(valor, /cortado no limite da célula/, `${nome} · ${coluna} não pode ser cortada`);
    }
    /* O fim do roteiro continua: o CTA, as regras e a linha da voz. */
    const roteiro = row.diretrizes_de_roteiro;
    assert.match(roteiro, /^6\. Como ajustar o link da bio/m, `${nome}: o capítulo 6`);
    assert.match(roteiro, /^Fechamento: /m, `${nome}: o Fechamento com o CTA`);
    assert.match(roteiro, /^Não inventar depoimento, número, estudo, autor nem credencial\./m, `${nome}: a regra de não inventar`);
    assert.match(roteiro, /^Voz da marca: gancho, fala, CTA e descrição seguem a linha "Voz da marca"/m, `${nome}: a linha da voz`);
    assert.match(roteiro, /^\(Roteiro encolhido para caber na célula: /m, `${nome}: a coluna diz que encolheu`);
    /* A lista "Fica fora" inteira: um item por capítulo, até o 6, e o número do pode_gravar bate com as frases listadas. */
    const cortes = row.cortes_para_redes;
    assert.match(cortes, /^Fica fora do texto publicável/m);
    for (let numero = 1; numero <= 6; numero += 1) assert.match(cortes, new RegExp(`^- Capítulo ${numero} · lâmina ${numero + 1}[^\\n]*\\.$`, "m"), `${nome}: capítulo ${numero} na lista`);
    const listadas = (cortes.slice(cortes.indexOf("Fica fora do texto publicável")).match(/" — /g) || []).length;
    assert.match(row.pode_gravar, new RegExp(`^- ${listadas} frase\\(s\\) que pedem fonte saíram do texto publicável`, "m"), `${nome}: ${listadas} frases listadas`);
  }
});

test("33 · D10 nas frases de espera que existiam antes: lacuna de formato, especialista único e a linha de topo sobre apresentador e identidade visual", () => {
  /*
   * 2026-10-07 (revisão) · fora da lista proibida, três frases deixavam
   * conferência aberta no arquivo: "confira se a coleta traz esse formato antes
   * de tratar como oportunidade" (a lacuna do blueprint, que a tela mantém),
   * "confirme antes de gravar" (o especialista único) e "Apresentador e
   * identidade visual não fazem parte deste arquivo" — que storyboard_visual
   * desmente. Saem concluídas.
   */
  const entrada = entradaDoAssunto(INSTAGRAM, { authors: [{ name: "Dra. Ana Lima", specialty: null, source: "only_active" }] });
  const youtube = youtubeDe(INSTAGRAM.principal, "instagram para clínicas");
  /* 2026-10-09 · a fotografia nova já sai em D10 (amostra pertinente, frase concluída); o CSV lê as lacunas da amostra pertinente. */
  assert.ok(youtube.blueprint!.recommended.gaps.some(lacuna => /^Nenhum Short pertinente na amostra coletada: não é oportunidade comprovada/.test(lacuna.statement)));
  assert.ok(!youtube.blueprint!.recommended.gaps.some(lacuna => /confira se a coleta traz/.test(lacuna.statement)), "nem a tela tem mais a conferência aberta");
  const csv = csvPronto(radarPortableVideoExport({ articles: [{ ...comPlanta(entrada), youtube }], today: EXPORTADO_EM }));
  const [marca, linha] = lerCsv(csv);
  assert.match(linha.serp_youtube, /^- Nenhum Short pertinente na amostra coletada: não é oportunidade comprovada — a coleta não trouxe esse formato\. \(/m);
  /* A fotografia ANTIGA (frase com conferência aberta, sem a corrida) é lida com a frase de hoje, dita pela régua dela. */
  const fraseAntiga = "Nenhum Short identificado na amostra coletada: confira se a coleta traz esse formato antes de tratar como oportunidade.";
  const antiga = { ...youtube.blueprint!, limitations: youtube.blueprint!.limitations.filter(item => !item.startsWith(RADAR_YOUTUBE_PERTINENT_RULER)), recommended: { ...youtube.blueprint!.recommended, gaps: [{ kind: "FORMATO_AUSENTE" as const, statement: fraseAntiga, evidence: "A coorte SHORTS ficou com zero vídeo na amostra coletada." }] } };
  const serpAntiga = linhaDe(entrada, { youtube: { ...youtube, blueprint: antiga, frozen: true, videos: [] } }).serp_youtube;
  assert.match(serpAntiga, /^Lacunas no YouTube \(onde entrar; amostra inteira, régua anterior a 2026-10-09\):$/m);
  assert.match(serpAntiga, /^- Nenhum Short identificado na amostra coletada: não é oportunidade comprovada; o motivo do zero está em concorrencia_curtos_e_carrossel\. \(/m);
  assert.doesNotMatch(serpAntiga, /confira se a coleta/);
  assert.match(linha.especialista, /^Especialista: Dra\. Ana Lima, único especialista ativo da marca \(aba Especialista; indicado por ser o único ativo\); sem credencial além do cadastro\.$/m);
  assert.match(marca.pode_gravar, /^- Voz da marca: não informada nesta exportação\. Apresentador e identidade visual: em storyboard_visual de cada linha \(rosto só de quem fala de fato, pela aba Especialista; a Marca não guarda paleta, tipografia nem logo\)\.$/m);
  for (const proibida of [/confira se a coleta/i, /confirme antes de gravar/i, /não fazem parte deste arquivo/i, ...D10_PROIBIDAS]) assert.doesNotMatch(csv, proibida, String(proibida));
});

test("PROVIDER_CALLS = 0 e AI_CALLS = 0", () => {
  assert.deepEqual(idasAoServidor, []);
});

/* ============================== utilidades ============================== */

function lerCsv(csv: string): Array<Record<string, string>> {
  const texto = csv.replace(/^﻿/, "");
  const linhas: string[][] = [];
  let campo = ""; let linha: string[] = []; let aspas = false;
  for (let i = 0; i < texto.length; i += 1) {
    const c = texto[i];
    if (aspas) { if (c === "\"" && texto[i + 1] === "\"") { campo += "\""; i += 1; } else if (c === "\"") aspas = false; else campo += c; }
    else if (c === "\"") aspas = true;
    else if (c === ",") { linha.push(campo); campo = ""; } else if (c === "\r") { /* CRLF */ } else if (c === "\n") { linha.push(campo); linhas.push(linha); linha = []; campo = ""; } else campo += c;
  }
  const [cabecalho, ...dados] = linhas;
  return dados.map(valores => Object.fromEntries(cabecalho.map((coluna, indice) => [coluna, valores[indice] ?? ""])));
}
