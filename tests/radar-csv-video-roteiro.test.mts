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
import type { RadarBrandVoice, RadarBrandVoiceState } from "../lib/radar/brand-voice.ts";
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

test("1 · o gancho abre pelo próprio tema e pela promessa da pesquisa do YouTube; pergunta ampla não abre", () => {
  const instagram = linhaDe(entradaDoAssunto(INSTAGRAM), { youtube: youtubeDe(INSTAGRAM.principal, "instagram para clínicas") }).diretrizes_de_roteiro;
  const gancho = instagram.split("\n")[0];
  /*
   * 2026-10-02 · a pergunta de abertura agora prefere a que fala da PRINCIPAL
   * ("…sendo uma clínica pequena?") à mais buscada que só adere pela
   * complementar ("Como captar clientes pela internet?"). A ampla continua sem
   * abrir o vídeo; a do tema abre.
   */
  assert.match(gancho, /^Gancho \(primeiros 15 segundos\): abra pelo próprio tema, "como atrair clientes pelo instagram", no recorte "clínicas de estética", respondendo "Como atrair clientes pelo Instagram sendo uma clínica pequena\?" logo de cara, sem apresentação longa\./);
  assert.doesNotMatch(gancho, /captar clientes pela internet/, "a pergunta ampla, por mais buscada, não abre o vídeo");
  assert.match(gancho, /Promessa \(pesquisa do YouTube\): /);

  /* Outro assunto, sem pesquisa do YouTube: a promessa do artigo, e a pergunta da principal. */
  const implante = linhaDe(entradaDoAssunto(IMPLANTE)).diretrizes_de_roteiro.split("\n")[0];
  assert.match(implante, /abra pelo próprio tema, "implante dentário" \(busca relacionada: "implante dentário preço"\), respondendo "Implante dentário dói\?" logo de cara/);
  assert.match(implante, /Promessa: Entender como o implante funciona antes de agendar a avaliação\./);
  assert.doesNotMatch(implante, /gostou/i, "fecho retórico não abre");
});

/* ================================ 2 ================================ */

test("2 · capítulos: sequência numerada e escolhida (até 6), blocos do roteiro do YouTube e perguntas aderentes; o texto diz o número que lista", () => {
  const roteiro = linhaDe(entradaDoAssunto(INSTAGRAM), { youtube: youtubeDe(INSTAGRAM.principal, "instagram para clínicas") }).diretrizes_de_roteiro;
  const { declarado, itens } = capitulosDe(roteiro);
  assert.equal(itens.length, declarado, "o número dito é o número listado");
  assert.ok(declarado <= 6 && declarado > 0);
  assert.deepEqual(itens.map((linha, indice) => linha.startsWith(`${indice + 1}. `)), itens.map(() => true), "numerada em sequência");
  /* O bloco do roteiro recebe a pergunta aderente — primeiro a que fala da principal, depois a que só adere pela complementar. */
  assert.match(itens.join("\n"), /BLOCO 1 — O fundamento principal do tema\. Pergunta do público a responder aqui: "Como atrair clientes pelo Instagram sendo uma clínica pequena\?"/);
  const ampla = itens.findIndex(linha => linha.includes("Como captar clientes pela internet?"));
  const doTema = itens.findIndex(linha => linha.includes("sendo uma clínica pequena"));
  assert.ok(ampla === -1 || ampla > doTema, "a pergunta ampla nunca vem antes da que fala do tema");
  assert.doesNotMatch(itens.join("\n"), /Aprendeu/, "fecho retórico de concorrente não vira capítulo");
  assert.doesNotMatch(itens.join("\n"), /Shopping/, "pergunta que toca o \"não cobrir\" não vira capítulo");
  assert.doesNotMatch(roteiro, /Roteiro recomendado pela SERP do YouTube \(blocos/, "a lista solta de blocos virou a sequência");
  assert.doesNotMatch(roteiro, /\d+ a cobrir/, "nada de 'N a cobrir' com outra lista");

  /* Sem pesquisa do YouTube, a sequência são as perguntas aderentes — sem retórica e sem o "não cobrir". */
  const implante = capitulosDe(linhaDe(entradaDoAssunto(IMPLANTE)).diretrizes_de_roteiro);
  assert.equal(implante.itens.length, implante.declarado);
  assert.deepEqual(implante.itens, [
    "1. Pergunta do público: \"Implante dentário dói?\"",
    "2. Pergunta do público: \"Quanto tempo dura um implante dentário?\"",
    "3. Pergunta do público: \"Quem tem diabetes pode fazer implante dentário?\"",
  ]);
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

test("4 · cortes: saem dos capítulos, cada um funcionando sozinho; legenda por acessibilidade; ausência de Shorts é da amostra", () => {
  for (const [assunto, youtube] of [[INSTAGRAM, youtubeDe(INSTAGRAM.principal, "instagram para clínicas")], [IMPLANTE, null]] as const) {
    const row = linhaDe(entradaDoAssunto(assunto), { youtube });
    const cortes = row.cortes_para_redes;
    assert.match(cortes, /um por capítulo do vídeo principal; cada corte funciona sozinho/);
    const linhas = cortes.split("\n").filter(linha => /^\d+\. Do capítulo \d+ \(/.test(linha));
    assert.ok(linhas.length > 0 && linhas.length <= 3, cortes);
    const { itens } = capitulosDe(row.diretrizes_de_roteiro);
    for (const linha of linhas) {
      const numero = Number(linha.match(/Do capítulo (\d+)/)![1]);
      assert.ok(numero >= 1 && numero <= itens.length, "o corte aponta para um capítulo que existe");
    }
    assert.doesNotMatch(cortes, /sem som/i, "nada de generalização sem fonte sobre como o público assiste");
    assert.match(cortes, /Legenda na tela em todos os cortes, por acessibilidade e compreensão/);
    /* 2026-10-02 · cada corte com gancho, ideia única, o que mostrar e fechamento; o carrossel, uma mensagem por lâmina. */
    assert.match(cortes, /^ {3}Gancho: /m);
    assert.match(cortes, /^ {3}Ideia única: /m);
    assert.match(cortes, /^ {3}Mostrar: /m);
    assert.match(cortes, /^ {3}Fechamento: convite para o vídeo longo ou /m);
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

  assert.match(linhaDe(entradaDoAssunto(INSTAGRAM)).tema_e_publico, /^Público: a definir \(o artigo não define público e a marca não tem Skill de voz com o público\)\.$/m);
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
  const comVoz = lerCsv(radarPortableVideoExport({ articles: [{ entrada: entradaDoAssunto(INSTAGRAM) }], today: EXPORTADO_EM, brandVoice: COM_VOZ }).csv);
  assert.match(comVoz[2].prompt, /usando SOMENTE os dados desta linha e da linha "Voz da marca"\./);
  const semVoz = lerCsv(radarPortableVideoExport({ articles: [{ entrada: entradaDoAssunto(INSTAGRAM) }], today: EXPORTADO_EM }).csv);
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
      for (const parte of [/^Canais que dominam: /m, /^Padrões de título \(vídeos longos\): /m, /^Lacunas no YouTube \(onde entrar\):$/m, /Nenhum vídeo foi assistido ou transcrito/]) {
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
  for (const parte of [/^Padrões de título \(vídeos longos\): /m, /^Lacunas no YouTube \(onde entrar\):$/m, /Nenhum vídeo foi assistido ou transcrito/]) assert.match(extremo, parte);
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
  assert.match(linhaDe(entrada).diretrizes_de_roteiro, /^- Complementa a seção: a definir no artigo-modelo/m);

  /* A landing page fala de si; sem endereço, a descrição diz quando ele existe. */
  const landing = linhaDe(entradaDoAssunto({ ...IMPLANTE, canonical: "", slug: "" })).diretrizes_de_roteiro;
  assert.match(landing, /^Vídeo × landing page \(o vídeo faz parte da landing page\):$/m);
  assert.match(landing, /^- Onde fica: incorporado na landing page, nessa seção\.$/m);
  assert.match(landing, /^- Na descrição do vídeo: o link da landing page \(o endereço da landing page quando publicada\)\.$/m);
  /* E a regra geral do arquivo fala do vídeo dentro da página. */
  const topo = lerCsv(radarPortableVideoExport({ articles: [{ entrada: entradaDoAssunto(IMPLANTE) }], today: EXPORTADO_EM }).csv)[0];
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
  assert.match(biblioteca, /Apoio · "Implante sem medo" \(https:\/\/www\.youtube\.com\/watch\?v=apoio000001\) · canal: Odonto Explica — [^\n]*: \(01:35–01:50\) "Com a anestesia local, o paciente sente pressão, não dor\."\n {2}Começo da transcrição \(fala do vídeo, conferir antes de usar\): "Hoje eu explico/);
  assert.match(biblioteca, /Incorporar no artigo · "Tour pelo consultório" [^\n]*· canal: Clínica Sorriso — [^\n]*· seção: a que o vídeo responde \(definir no artigo-modelo\)\n {2}Começo da transcrição \(fala do vídeo, conferir antes de usar\): "Vem conhecer a sala/);
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
    const montada = { articleId: "artigo-do-silo", entrada, lentes: [] };
    const plano = planoComSilo(montada.articleId, entrada, excluidos);
    const videoSemSilo = radarPortableVideoExport({ articles: [montada], today: EXPORTADO_EM }).csv;
    const video = radarPortableVideoExport({ articles: [montada], today: EXPORTADO_EM, selectionPlan: plano }).csv;
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
  assert.match(roteiro, /^2\. Roteiro de três stories\n[\s\S]*? {3}Mostrar na tela: um roteiro de três stories para a semana\./m);
  assert.match(roteiro, /^Ritmo que a SERP do YouTube sugere \(referência, não roteiro\): HOOK → /m);
  assert.doesNotMatch(roteiro, /O fundamento principal do tema/, "o bloco genérico não é capítulo quando há planta");
  /* O gancho abre pela abertura da planta, que fala da principal. */
  assert.match(roteiro, /respondendo "Como atrair clientes pelo Instagram\?" logo de cara/);

  const cortes = linha.cortes_para_redes;
  /* Três capítulos, três cortes, na ordem do vídeo; o que tem entrega prática diz o que mostrar. */
  assert.match(cortes, /^2\. Do capítulo 2 \(Roteiro de três stories\):\n {3}Gancho: "Roteiro de três stories\?"\n {3}Ideia única: Resposta direta\.\n {3}Mostrar: um roteiro de três stories para a semana\.\n {3}Fechamento: convite para o vídeo longo ou o artigo\.$/m);
  assert.match(cortes, /^Carrossel \(Instagram e LinkedIn\), 5 lâminas, uma mensagem por lâmina e cada uma puxando a próxima:$/m);
  /* 2026-10-02 · a capa é chamada para o público: o H1 da planta, não a promessa (instrução ao redator). */
  assert.match(cortes, /^- Lâmina 1 \(capa\): Como atrair clientes pelo Instagram: o guia da clínica\.$/m);
  assert.match(cortes, /^- Lâmina 2: Por que o perfil não traz pacientes — Resposta direta\. Puxa a próxima: "Roteiro de três stories"\.$/m);
  assert.match(cortes, /^- Lâmina 5: CTA para o artigo \(https:\/\/clinica-exemplo\.com\.br\/como-atrair-clientes-pelo-instagram\), sem prometer resultado\.$/m);

  /* Proposta da IA: o capítulo avisa. Sem planta: a sequência de antes. */
  /* 2026-10-02 · D10: o rascunho antigo também sai sem aviso de aprovação. */
  assert.doesNotMatch(linhaDe(entrada, { blueprint: artigoModeloDe(entrada, "DRAFT") }).diretrizes_de_roteiro, /proposta da IA|confira antes de gravar/);
  assert.doesNotMatch(linhaDe(entrada).diretrizes_de_roteiro, /da planta do artigo-modelo/);
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
  /* 2026-10-02 · o estado do vídeo e o trecho candidato; sem duração registrada, a posição em %. */
  assert.match(biblioteca, /^ {2}Estado: selecionado pela marca · trecho candidato encontrado · falta conferir o tempo e as palavras no vídeo para virar trecho casado\.$/m);
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
        ? { ...secao, answerFirst: "O Instagram foi feito para entretenimento, não para agendar.", explain: ["Pacientes procuram no Google, não no Instagram.", "A bio diz serviço, cidade e contato."], h3: ["Perfil antes", "O ajuste", "Perfil depois"], practical: null }
        : secao),
    },
  };
  const roteiro = linhaDe(entrada, { blueprint: absoluta }).diretrizes_de_roteiro;
  assert.match(roteiro, /^Premissa do vídeo: O vídeo mostra como a clínica reconhece se o perfil alcança pessoas da região interessadas no atendimento\.$/m, "a promessa vira frase de quem fala");
  assert.doesNotMatch(roteiro, /foi feito para entretenimento|procuram no Google, não no Instagram/, "a frase absoluta não vira capítulo");
  assert.match(roteiro, /Entregar: a resposta a "Por que o perfil não traz pacientes\?" pelo que a pesquisa sustenta, sem regra universal/);
  assert.match(roteiro, /Explicar: A bio diz serviço, cidade e contato\./);
  assert.match(roteiro, /Mostrar na tela: passo a passo num exemplo identificado como ilustrativo: Perfil antes → O ajuste → Perfil depois\./, "demonstração pelos passos da seção");
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
