import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { buildRadarYoutubeBlueprint } from "../lib/radar/youtube-blueprint.ts";
import { freezeRadarYoutubeInvestigation } from "../lib/radar/youtube-evidence.ts";
import { buildRadarYoutubeUniverse } from "../lib/radar/youtube-search-model.ts";
import { buildRadarYoutubeRunFingerprint, buildRadarYoutubeSearchRun, RADAR_YOUTUBE_PROVIDER_ENDPOINT } from "../lib/radar/youtube-search-run.ts";
import { normalizeDataForSeoYoutubeResponse } from "../lib/server/dataforseo-youtube-operation.ts";
import { RADAR_VIDEO_EXPORT_COLUMNS, radarPortableVideoExport, radarVideoExportYoutubeOf } from "../lib/radar/portable-video-export.ts";
import { planRadarSiloExport } from "../lib/radar/portable-silo-export.ts";
import { radarPortableWritingExport } from "../lib/radar/portable-writing-batch.ts";
import { ARTIGO, ARTIGO_AMAZON, EXPORTADO_EM, LEITURA_DAS_LENTES, MARCA, ITENS_DO_SILO, SILO_DNA, entradaGoogle, montadasDoSilo } from "./radar-portable-writing-fixtures.mts";
import { plantaConcluidaDaBancada } from "./radar-piloto-artigo-modelo-fixtures-2026-10-09.mts";
import type { RadarYoutubeFrozenInvestigation } from "../lib/radar/youtube-evidence.ts";

/* 2026-10-09 · o CSV de vídeo sai só pela planta APPROVED: as linhas destes testes levam uma; o estado "falta planta" tem teste próprio. */
const PLANTA = plantaConcluidaDaBancada("Skin care noturno: a rotina da noite");
const pronto = (saida: ReturnType<typeof radarPortableVideoExport>) => {
  assert.equal(saida.status, "ready", "a linha tem a planta APPROVED: o lote monta o CSV");
  return saida as Extract<ReturnType<typeof radarPortableVideoExport>, { status: "ready" }>;
};
/* 2026-10-09 · o CSV para escrever também sai só pela planta: os artigos do Silo levam uma. */
const comPlanta = <T extends object>(montadas: readonly T[]): T[] => montadas.map(montada => ({ ...montada, blueprint: PLANTA }));
/* A fotografia congelada com a régua ANTERIOR a 2026-10-09 (amostra inteira), gerada com o código de antes. */
const ANTIGA = JSON.parse(await readFile(new URL("./fixtures/radar-youtube-congelado-antes-2026-10-09.json", import.meta.url), "utf8")).frozen as RadarYoutubeFrozenInvestigation;

/*
 * ===== AS DUAS SAÍDAS DE 2026-10-02 =====
 *
 * A · o CSV para vídeo e redes sociais: dados, evidências e diretrizes de
 *     roteiro do YouTube, SEM estrutura de artigo;
 * B · "Só os selecionados" no formato para escrever leva o Silo de cada artigo.
 *
 * PROVIDER_CALLS = 0, com sentinela no fim.
 */

const idasAoServidor: string[] = [];
Object.defineProperty(globalThis, "fetch", {
  value: (entrada: unknown) => {
    idasAoServidor.push(String((entrada as { url?: string })?.url || entrada));
    return Promise.reject(new Error("REDE PROIBIDA NESTE GATE"));
  },
  writable: true, configurable: true,
});

function lerCsv(csv: string): Array<Record<string, string>> {
  const texto = csv.replace(/^﻿/, "");
  const linhas: string[][] = [];
  let campo = "";
  let linha: string[] = [];
  let aspas = false;
  for (let indice = 0; indice < texto.length; indice += 1) {
    const caractere = texto[indice];
    if (aspas) {
      if (caractere === "\"" && texto[indice + 1] === "\"") { campo += "\""; indice += 1; } else if (caractere === "\"") aspas = false; else campo += caractere;
    } else if (caractere === "\"") aspas = true;
    else if (caractere === ",") { linha.push(campo); campo = ""; } else if (caractere === "\r") { /* CRLF */ } else if (caractere === "\n") { linha.push(campo); linhas.push(linha); linha = []; campo = ""; } else campo += caractere;
  }
  const [cabecalho, ...dados] = linhas;
  return dados.map(valores => Object.fromEntries(cabecalho.map((coluna, indice) => [coluna, valores[indice] ?? ""])));
}

/* ===================== a corrida real do YouTube ===================== */

const bruto = JSON.parse(await readFile(new URL("./fixtures/dataforseo-youtube-skin-care-noturno.json", import.meta.url), "utf8"));
const normalizada = normalizeDataForSeoYoutubeResponse(bruto, "ytq:1");
const corrida = () => buildRadarYoutubeSearchRun({
  runId: "run-1", runVersion: 1, startedAt: "2026-09-14T18:51:00.000Z", startedBy: "u",
  fingerprint: buildRadarYoutubeRunFingerprint({ articleId: "a1", articleDnaVersionId: "d1", queryIds: ["ytq:1"] }),
  provenance: {
    provider: "dataforseo", endpoint: RADAR_YOUTUBE_PROVIDER_ENDPOINT, blockDepth: 20,
    queriesRequested: 1, queriesSucceeded: 1, queriesFailed: 0, failures: [],
    collectedAt: "2026-09-14T18:51:07.000Z",
  },
  queries: [{ queryId: "ytq:1", text: "skin care noturno", origin: "PRIMARY_KEYWORD", reason: "principal", executed: true, resultCount: normalizada.results.length }],
  results: normalizada.results, universe: buildRadarYoutubeUniverse(normalizada.results),
});
const congelada = () => {
  const run = corrida();
  return freezeRadarYoutubeInvestigation({
    run,
    blueprint: buildRadarYoutubeBlueprint({ run, declaredIntent: "INFORMATIONAL", editorialTopics: [], generatedAt: "2026-09-14T19:00:00.000Z" }),
    finalizedBy: "u", finalizedAt: "2026-09-14T21:00:00.000Z",
  });
};
const youtubeVivo = () => radarVideoExportYoutubeOf({ run: corrida(), frozen: null, declaredIntent: "INFORMATIONAL", editorialTopics: [], generatedAt: EXPORTADO_EM });

/* ============================== A · vídeo ============================== */

test("A · a pesquisa do YouTube: fotografia vence a corrida viva; sem nada, não há pesquisa", () => {
  const viva = youtubeVivo();
  assert.ok(viva, "a corrida coletada vira pesquisa");
  assert.equal(viva.frozen, false);
  assert.ok(viva.videos.length > 0);
  assert.ok(viva.videos.every(video => video.universeClass === "COMPARABLE_LONG_FORM" || video.universeClass === "COMPARABLE_SHORT"), "só os comparáveis");
  assert.deepEqual(viva.queries, ["skin care noturno"], "a consulta é o TEXTO, nunca o id");

  const fotografia = radarVideoExportYoutubeOf({ run: corrida(), frozen: congelada(), declaredIntent: null, editorialTopics: [], generatedAt: EXPORTADO_EM });
  assert.equal(fotografia?.frozen, true);
  assert.equal(fotografia?.blueprint?.generatedAt, "2026-09-14T19:00:00.000Z", "o blueprint é o congelado, não recalculado");
  assert.ok((fotografia?.videos.length || 0) > 0, "a corrida referenciada pela fotografia dá os vídeos");

  assert.equal(radarVideoExportYoutubeOf({ run: null, frozen: null, declaredIntent: null, editorialTopics: [], generatedAt: EXPORTADO_EM }), null);
});

test("A · o CSV de vídeo traz dados e diretrizes de roteiro, e nada da estrutura do artigo", () => {
  const saida = pronto(radarPortableVideoExport({ articles: [{ entrada: entradaGoogle(), youtube: youtubeVivo(), blueprint: PLANTA }], today: EXPORTADO_EM }));
  assert.equal(saida.exported, 1);
  assert.equal(saida.withoutYoutube, 0);
  assert.match(saida.filename, /^radar-video-.+-2026-09-23\.csv$/);
  assert.ok(saida.csv.startsWith("﻿\"ordem\",\"pode_gravar\""));

  const linhas = lerCsv(saida.csv);
  assert.deepEqual(Object.keys(linhas[0]), [...RADAR_VIDEO_EXPORT_COLUMNS]);
  assert.deepEqual(linhas.map(linha => linha.ordem), ["Marca", "1"]);
  const artigo = linhas[1];

  assert.match(artigo.serp_youtube, /Vídeos no topo/);
  assert.match(artigo.serp_youtube, /https:\/\/www\.youtube\.com\//);
  assert.match(artigo.serp_youtube, /Nenhum vídeo foi assistido ou transcrito/);
  assert.match(artigo.intencao_e_formato, /No YouTube: \d+ vídeo\(s\) longos/);
  assert.match(artigo.diretrizes_de_roteiro, /^Gancho \(primeiros 15 segundos\)/);
  assert.match(artigo.cortes_para_redes, /Shorts, Reels e TikTok/);
  /* 2026-10-09 · na corrida real de skin care noturno os Shorts pertinentes lideram: a decisão única diz formato curto, e o prompt pede a série (o recorte da planta). */
  assert.match(artigo.intencao_e_formato, /^Formato do vídeo: formato curto \(Shorts\) — os Shorts lideram a amostra pertinente/m);
  assert.match(artigo.diretrizes_de_roteiro, /^Formato do vídeo: formato curto \(Shorts\) — [^\n]*Cada capítulo que funciona sozinho é um vídeo curto da série/m);
  assert.match(artigo.prompt, /^Escreva a série de vídeos curtos e o carrossel sobre /);

  /* Sem estrutura de artigo: nem colunas, nem marcas. */
  for (const coluna of ["estrutura", "links_internos", "plano_visual", "titulo_e_seo"]) assert.equal(coluna in artigo, false, coluna);
  const tudo = Object.values(artigo).join("\n");
  assert.equal(/\bH1\b|\bH2\b|Ordem narrativa|SiloPage|imagem de capa|respiro/i.test(tudo), false, "nenhuma estrutura de artigo");
  assert.equal(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i.test(saida.csv), false, "nenhum UUID");
});

/*
 * 2026-10-07 · A AMOSTRA PERTINENTE NA CORRIDA REAL (item 1 do desenho
 * competitivo): com a corrida que a fotografia referencia, as estatísticas da
 * coluna de intenção saem só dos pertinentes; o congelamento novo, que guarda
 * só a referência da corrida, sem a corrida viva com o mesmo id, diz que não dá
 * para recalcular — e mostra as estatísticas da fotografia.
 */
test("A · amostra pertinente: com a corrida referenciada, só pertinentes; sem ela, a fotografia dita pela régua que a fez", () => {
  const comCorrida = radarVideoExportYoutubeOf({ run: corrida(), frozen: congelada(), declaredIntent: null, editorialTopics: [], generatedAt: EXPORTADO_EM });
  const [, artigo] = lerCsv(pronto(radarPortableVideoExport({ articles: [{ entrada: entradaGoogle(), youtube: comCorrida, blueprint: PLANTA }], today: EXPORTADO_EM })).csv);
  assert.match(artigo.intencao_e_formato, /^Amostra pertinente \(mesmo público, público vizinho e tema geral; pelo título e pelo canal\): \d+ de \d+ longos · \d+ de \d+ Shorts\./m);
  assert.match(artigo.intencao_e_formato, /^Formato recomendado \(pertinentes\): /m);
  /* 2026-10-09 · o formato do vídeo é a decisão única, pela amostra pertinente, com a faixa de cada coorte. */
  assert.match(artigo.intencao_e_formato, /^Formato do vídeo: (vídeo longo|formato curto \(Shorts\)) — /m);

  /* 2026-10-09 · a fotografia ANTIGA (amostra inteira), sem a corrida: não recalculável, só como referência — e ela não decide o formato. */
  const antigaSemCorrida = radarVideoExportYoutubeOf({ run: null, frozen: ANTIGA, declaredIntent: null, editorialTopics: [], generatedAt: EXPORTADO_EM });
  assert.equal(antigaSemCorrida?.videos.length, 0, "o congelamento guarda só a referência da corrida");
  const [, semUniverso] = lerCsv(pronto(radarPortableVideoExport({ articles: [{ entrada: entradaGoogle(), youtube: antigaSemCorrida, blueprint: PLANTA }], today: EXPORTADO_EM })).csv);
  assert.match(semUniverso.intencao_e_formato, /^Amostra pertinente: não recalculável — o congelamento guarda só a referência da corrida, e a corrida com esse id não está nesta exportação; as estatísticas abaixo são da amostra inteira, só como referência\.$/m);
  assert.doesNotMatch(semUniverso.intencao_e_formato, /^Faixa recomendada|^Formato recomendado: /m, "a recomendação da régua antiga não sai como recomendação");
  assert.match(semUniverso.intencao_e_formato, /^Formato do vídeo: vídeo longo — sem amostra pertinente do YouTube: o vídeo segue o artigo-modelo, em formato longo\.$/m);

  /* A fotografia NOVA já gravou a amostra pertinente: sem a corrida, ela é lida como pertinente e decide o formato. */
  const novaSemCorrida = radarVideoExportYoutubeOf({ run: null, frozen: congelada(), declaredIntent: null, editorialTopics: [], generatedAt: EXPORTADO_EM });
  const [, daNova] = lerCsv(pronto(radarPortableVideoExport({ articles: [{ entrada: entradaGoogle(), youtube: novaSemCorrida, blueprint: PLANTA }], today: EXPORTADO_EM })).csv);
  assert.match(daNova.intencao_e_formato, /^Amostra pertinente \(gravada na fotografia\): \d+ longos · \d+ Shorts\.$/m);
  assert.doesNotMatch(daNova.intencao_e_formato, /sem amostra pertinente do YouTube/);
});

/*
 * 2026-10-07 · AS PERGUNTAS DOS SHORTS DA CAMADA MULTIFORMATO viravam demanda
 * do corte. 2026-10-09 · um plano de Shorts só (o dos cortes da planta): elas
 * não chegam mais ao export.
 */
test("A · as perguntas das peças SHORT congeladas não chegam mais ao export (um plano de Shorts só: os cortes da planta)", () => {
  const base = congelada();
  const comCamada = {
    ...base,
    multimodal: {
      blueprint: { recommended: { pieces: [
        { piece: "SHORT", sourceQuestion: "Qual a ordem do skin care noturno?" },
        { piece: "ARTIGO", sourceQuestion: null },
        { piece: "SHORT", sourceQuestion: "Pode usar ácido todo dia?" },
      ] } },
    },
  } as unknown as typeof base;
  const youtube = radarVideoExportYoutubeOf({ run: corrida(), frozen: comCamada, declaredIntent: null, editorialTopics: [], generatedAt: EXPORTADO_EM });
  assert.equal("shortQuestions" in (youtube || {}), false);
});

/*
 * 2026-10-09 · O CONTRATO COMUM: sem a planta APPROVED (ausente ou DRAFT), o
 * lote não monta CSV pela régua de antes — devolve o estado explícito com os
 * artigos que faltam, e a rota responde 409.
 */
test("A · sem planta APPROVED (ausente ou proposta DRAFT), o lote devolve needs_article_blueprint com os artigos que faltam", () => {
  const semPlanta = radarPortableVideoExport({ articles: [{ articleId: "art-1", entrada: entradaGoogle(), youtube: youtubeVivo() }], today: EXPORTADO_EM });
  assert.deepEqual(semPlanta, { status: "needs_article_blueprint", articleIds: ["art-1"] });
  const proposta = radarPortableVideoExport({
    articles: [
      { articleId: "art-1", entrada: entradaGoogle(), youtube: youtubeVivo(), blueprint: PLANTA },
      { articleId: "art-2", entrada: entradaGoogle(), youtube: youtubeVivo(), blueprint: { ...PLANTA, approval: "DRAFT" } },
    ],
    today: EXPORTADO_EM,
  });
  assert.deepEqual(proposta, { status: "needs_article_blueprint", articleIds: ["art-2"] }, "a proposta da IA não é o artigo-modelo");
  assert.equal(pronto(radarPortableVideoExport({ articles: [{ articleId: "art-1", entrada: entradaGoogle(), youtube: youtubeVivo(), blueprint: { ...PLANTA, approval: "APPROVED" } }], today: EXPORTADO_EM })).exported, 1);
});

test("A · sem pesquisa do YouTube o tema sai com ressalva, e a linha de topo diz quais", () => {
  const saida = pronto(radarPortableVideoExport({ articles: [{ entrada: entradaGoogle(), youtube: null, blueprint: PLANTA }], today: EXPORTADO_EM }));
  assert.equal(saida.withoutYoutube, 1);
  const [topo, artigo] = lerCsv(saida.csv);
  assert.match(artigo.pode_gravar, /^Com ressalva:\n- sem pesquisa do YouTube/);
  assert.match(artigo.intencao_e_formato, /Rode a pesquisa do YouTube no Radar/);
  assert.match(topo.pode_gravar, /1 sem pesquisa do YouTube/);
});

/* ======================= B · o Silo nos selecionados ======================= */

test("B · o plano da seleção chama o irmão não marcado de \"fora desta seleção\"", () => {
  const plano = planRadarSiloExport({ today: EXPORTADO_EM, brandId: MARCA, items: ITENS_DO_SILO.slice(0, 1), siloVersions: [SILO_DNA], selectionOnly: true });
  const membros = plano.files[0].writing!.members;
  assert.ok(membros.filter(membro => membro.articleId !== ARTIGO).every(membro => membro.statusLabel === "fora desta seleção"));
  const semSelecao = planRadarSiloExport({ today: EXPORTADO_EM, brandId: MARCA, items: ITENS_DO_SILO.slice(0, 1), siloVersions: [SILO_DNA] });
  assert.ok(semSelecao.files[0].writing!.members.some(membro => membro.statusLabel === "não enviado ao Radar"), "sem a opção, nada muda");
});

test("B · seleção de um Silo só: o Silo vai para a linha de topo, com a ordem narrativa", () => {
  const plano = planRadarSiloExport({ today: EXPORTADO_EM, brandId: MARCA, items: ITENS_DO_SILO.slice(0, 2), siloVersions: [SILO_DNA], selectionOnly: true });
  const saida = radarPortableWritingExport({ articles: comPlanta(montadasDoSilo().slice(0, 2)), lenses: LEITURA_DAS_LENTES, plan: null, selectionPlan: plano, today: EXPORTADO_EM });
  assert.equal(saida.files, null, "continua um arquivo só");
  const [topo, pilar] = lerCsv(saida.csv || "");
  assert.equal(topo.ordem, "Silo");
  assert.match(topo.artigo, /^Silo: Cuidados com a Pele/);
  assert.match(topo.artigo, /fora do arquivo \(fora desta seleção\)/);
  assert.match(pilar.ordem, /^1 · Pilar$/);
  assert.match(pilar.artigo, /Papel no Silo: Pilar/);
});

test("B · seleção que cruza Silos: o contexto vai na linha de cada artigo", () => {
  const itens = [ITENS_DO_SILO[0], { ...ITENS_DO_SILO[1], siloId: "" }];
  const plano = planRadarSiloExport({ today: EXPORTADO_EM, brandId: MARCA, items: itens, siloVersions: [SILO_DNA], selectionOnly: true });
  const saida = radarPortableWritingExport({ articles: comPlanta(montadasDoSilo().slice(0, 2)), lenses: LEITURA_DAS_LENTES, plan: null, selectionPlan: plano, today: EXPORTADO_EM });
  const [topo, pilar, outro] = lerCsv(saida.csv || "");
  assert.equal(topo.ordem, "Marca");
  assert.match(topo.artigo, /^Artigos selecionados de mais de um Silo/);
  assert.match(pilar.artigo, /Silo: Cuidados com a Pele/);
  assert.match(pilar.artigo, /Ordem narrativa do Silo:/);
  assert.match(pilar.artigo, /ESTE ARTIGO/);
  assert.match(outro.artigo, /Silo: sem silo resolvido no Radar/);
  assert.notEqual(ARTIGO_AMAZON, ARTIGO);
});

test("B · sem plano da seleção, o avulso sai como antes", () => {
  const saida = radarPortableWritingExport({ articles: comPlanta(montadasDoSilo()), lenses: LEITURA_DAS_LENTES, plan: null, today: EXPORTADO_EM });
  const [topo] = lerCsv(saida.csv || "");
  assert.match(topo.artigo, /^Artigos avulsos, sem o contexto do Silo/);
});

test("PROVIDER_CALLS = 0", () => {
  assert.deepEqual(idasAoServidor, []);
});

test("pergunta de fecho de concorrente não abre artigo nem vídeo", async () => {
  const { radarWritingRhetoricalQuestion } = await import("../lib/radar/portable-writing-export.ts");
  assert.equal(radarWritingRhetoricalQuestion("Aprendeu como atrair clientes no Instagram?"), true);
  assert.equal(radarWritingRhetoricalQuestion("Gostou das dicas?"), true);
  assert.equal(radarWritingRhetoricalQuestion("Como captar clientes pela internet?"), false);
});
