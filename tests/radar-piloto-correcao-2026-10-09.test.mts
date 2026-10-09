import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { buildRadarSerpFeatureIntelligence } from "../lib/radar/serp-features.ts";
import { buildRadarMultimodalBlueprint, radarMultimodalUsesPertinentSample } from "../lib/radar/multimodal-blueprint.ts";
import { radarMultimodalBlueprintOfRun } from "../lib/radar/multimodal-of-run.ts";
import { buildRadarYoutubeUniverse } from "../lib/radar/youtube-search-model.ts";
import { normalizeDataForSeoYoutubeResponse } from "../lib/server/dataforseo-youtube-operation.ts";
import { freezeRadarYoutubeInvestigation } from "../lib/radar/youtube-evidence.ts";
import { RADAR_YOUTUBE_PROVIDER_ENDPOINT, buildRadarYoutubeRunFingerprint, buildRadarYoutubeSearchRun } from "../lib/radar/youtube-search-run.ts";
import { buildRadarYoutubeBlueprint, radarYoutubeRunPertinence } from "../lib/radar/youtube-blueprint.ts";
import { buildRadarEvidenceBundleFromAnalysis } from "../lib/radar/evidence-bundle-runtime.ts";
import { radarFoundationsOfDossier } from "../lib/redator/radar-foundations.ts";
import { buildRadarWritingExportArticle } from "../lib/radar/portable-writing-export.ts";
import { radarVideoPlan, buildRadarVideoExportArticle } from "../lib/radar/portable-video-export.ts";
import { radarPortableExportBlueprintOf, radarPortableExportMissingBlueprints, type RadarPortableExportAssembledArticle } from "../lib/radar/portable-export-batch.ts";
import { buildRadarPortableExportRow, radarWriterBriefMarkdown } from "../lib/radar/portable-export.ts";
import { RADAR_ARTICLE_BLUEPRINT_CONTINUATION_LABEL, radarArticleBlueprintContinuationOf } from "../lib/radar/article-blueprint.ts";
import { WRITER_BLUEPRINT_CONTINUATION_LABEL } from "../lib/redator/writer-evidence-catalog.ts";
import { RADAR_ARTICLE_BLUEPRINT_MAX_AI_CALLS, RADAR_AUTO_FINALIZE_AI_COST, radarAutoFinalizeButtonLabel, radarFinalizeWithAiLabel } from "../lib/radar/operational-actions.ts";
import { radarHandoffOutcomeOfCode } from "../lib/radar/writer-handoff-client.ts";
import { radarRefreezeDiagnosis } from "../lib/radar/refreeze-repair.ts";
import { seedContextLines } from "../lib/redator/deliverable-seed.ts";
import { radarCurrentArticleDnaVersion } from "../lib/radar/article-dna-current.ts";
import { radarArticleBlueprintPick } from "../lib/radar/article-blueprint-freeze.ts";
import { ARTIGO, entradaGoogle, contextoDePesquisa } from "./radar-portable-writing-fixtures.mts";
import { plantaDe } from "./radar-piloto-planta-fixtures-2026-10-09.mts";
import { planoDeVideo } from "./redator-piloto-plano-fixtures-2026-10-09.mts";

/*
 * ===== 2026-10-09 · A CORREÇÃO DA RODADA "REGRA DO PILOTO EM TODAS AS OPERAÇÕES" =====
 *
 * Cada teste aqui prova uma correção do corretor sobre os achados da revisão
 * (piloto, contrato e suítes): o comportamento novo, e não o texto do código.
 * Sem rede, sem IA, sem provider (PROVIDER_CALLS = 0).
 */

const idasAoServidor: string[] = [];
Object.defineProperty(globalThis, "fetch", {
  value: (entrada: unknown) => { idasAoServidor.push(String(entrada)); return Promise.reject(new Error("REDE PROIBIDA")); },
  configurable: true, writable: true,
});

const semComentarios = (fonte: string) => fonte.replace(/\r\n/g, "\n").replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:"'])\/\/.*$/gm, "$1");
const ler = async (caminho: string) => readFile(new URL(`../${caminho}`, import.meta.url), "utf8");

/* ================= F1 · o multiformato do congelamento NOVO pela amostra pertinente ================= */

const googleReal = JSON.parse(await ler("tests/fixtures/dataforseo-google-skin-care-noturno.json"));
const youtubeReal = JSON.parse(await ler("tests/fixtures/dataforseo-youtube-skin-care-noturno.json"));

function corridaReal() {
  const normalizada = normalizeDataForSeoYoutubeResponse(youtubeReal, "ytq:1");
  return buildRadarYoutubeSearchRun({
    runId: "run-1", runVersion: 1, startedAt: "2026-10-09T18:51:00.000Z", startedBy: "u",
    fingerprint: buildRadarYoutubeRunFingerprint({ articleId: "artigo-1", articleDnaVersionId: "dna-1", queryIds: ["ytq:1"] }),
    provenance: { provider: "dataforseo", endpoint: RADAR_YOUTUBE_PROVIDER_ENDPOINT, blockDepth: 20, queriesRequested: 1, queriesSucceeded: 1, queriesFailed: 0, failures: [], collectedAt: "2026-10-09T18:51:07.000Z" },
    queries: [{ queryId: "ytq:1", text: "skin care noturno", origin: "PRIMARY_KEYWORD", reason: "principal", executed: true, resultCount: normalizada.results.length }],
    results: normalizada.results, universe: buildRadarYoutubeUniverse(normalizada.results),
  } as never);
}

test("F1 · congelamento NOVO de Google + YouTube: os fundamentos do Redator leem as contagens da amostra pertinente (a régua que a fotografia diz)", () => {
  const run = corridaReal();
  const geradoEm = "2026-10-09T19:00:00.000Z";
  const blueprint = buildRadarYoutubeBlueprint({ run, declaredIntent: "INFORMATIONAL", editorialTopics: ["ordem dos produtos"], generatedAt: geradoEm });
  const multimodal = radarMultimodalBlueprintOfRun({ features: buildRadarSerpFeatureIntelligence(googleReal), run, generatedAt: geradoEm });
  const frozen = freezeRadarYoutubeInvestigation({ run, blueprint, finalizedBy: "u", finalizedAt: "2026-10-09T19:30:00.000Z", multimodal: { blueprint: multimodal, researchSources: ["WEB_SERP", "YOUTUBE_SERP"] } } as never);
  const dossie = buildRadarEvidenceBundleFromAnalysis({
    payload: { finalizedBundle: { frozenAt: "2026-10-09T13:00:00.000Z", frozenBy: "u", limitations: [] }, youtubeFrozenInvestigation: frozen, youtubeSearch: run },
    article: { brandId: "m", articleId: "artigo-1", articleDnaVersionId: "dna-1", articleDnaContentHash: `sha256:${"a".repeat(64)}` },
    competitiveBlueprint: null, observedAt: "2026-10-09T13:00:00.000Z",
  } as never) as { ok: true; bundle: unknown };
  assert.ok(dossie.ok);
  const fundamentos = radarFoundationsOfDossier({ bundle: dossie.bundle, researchProfile: "GOOGLE" } as never) as unknown as { youtube: { ruler: string; longForm: number; shorts: number } };
  const pertinente = radarYoutubeRunPertinence(run);
  assert.equal(fundamentos.youtube.ruler, "PERTINENTE");
  assert.equal(fundamentos.youtube.longForm, pertinente.longForm, "a régua dita (PERTINENTE) vale para as contagens que chegam ao Redator e ao MCP");
  assert.equal(fundamentos.youtube.shorts, pertinente.shorts);
  /* A mesma conta da fotografia, e a saída de vídeo pela decisão única. */
  assert.equal(multimodal.observed.youtubeLongForm, blueprint.observed.longForm.videoCount);
  assert.equal(multimodal.observed.youtubeShorts, blueprint.observed.shorts.videoCount);
  assert.equal(radarMultimodalUsesPertinentSample(multimodal), true);
});

test("F1 · sem vídeo na corrida, o multiformato é o de antes (nada novo grava no congelamento)", () => {
  const features = buildRadarSerpFeatureIntelligence(googleReal);
  const geradoEm = "2026-10-09T19:00:00.000Z";
  assert.deepEqual(radarMultimodalBlueprintOfRun({ features, run: null, generatedAt: geradoEm }), buildRadarMultimodalBlueprint({ features, youtubeUniverse: [], generatedAt: geradoEm }));
  /* A camada gravada antes (sem a marca da régua) é dita como régua anterior na tela. */
  const antiga = buildRadarMultimodalBlueprint({ features, youtubeUniverse: corridaReal().universe, generatedAt: geradoEm });
  assert.equal(radarMultimodalUsesPertinentSample(antiga), false);
});

test("F1 · a tela congela, repara e mostra o multiformato pela mesma montagem pertinente", async () => {
  const pagina = semComentarios(await ler("modules/radar/radar-page.tsx"));
  const leitura = pagina.slice(pagina.indexOf("const multimodalDoArtigo"), pagina.indexOf("const gravarYoutube"));
  assert.match(leitura, /radarMultimodalBlueprintOfRun\(\{\s*features,\s*run: corrida,/);
  assert.doesNotMatch(pagina, /buildRadarMultimodalBlueprint\(/, "a página voltou a montar o multiformato pela amostra inteira");
  const painel = semComentarios(await ler("modules/radar/radar-youtube-search-panel.tsx"));
  assert.match(painel, /Saída pela régua anterior \(amostra inteira\): /);
});

/* ================= F2, F5, F9 · a mesma leitura da planta em todo entregável ================= */

const EXCLUSAO = { label: "pele oleosa", source: "differentiation" as const, owner: "skincare para pele oleosa" };
const comExclusao = <T extends { researchContext?: unknown }>(entrada: T): T => ({
  ...entrada,
  researchContext: { ...((entrada.researchContext as object | null) ?? contextoDePesquisa()), articleScope: { angle: null, exclusions: [EXCLUSAO] } },
});

test("F9 · a seção que o reajuste do ArticleDNA exclui não vira capítulo no CSV de vídeo nem no plano do Redator — e a linha diz o que saiu", () => {
  const antes = entradaGoogle();
  const planta = plantaDe(antes, { articleId: ARTIGO });
  const excluida = planta.blueprint.sections.find(secao => /pele oleosa/i.test(secao.h2));
  assert.ok(excluida, "a planta da bancada tem a seção sobre o assunto excluído");
  const contexto = { youtube: null, brandVoiceActive: false, brandVoice: { kind: "none" }, blueprint: planta, lentesCongeladas: null, lensDigests: null } as never;

  const escrita = buildRadarWritingExportArticle(comExclusao(antes), { topRowLabel: "Marca", filePosition: 1, silo: null, articleId: ARTIGO, publication: null, blueprint: planta } as never).row;
  assert.equal(escrita.estrutura.includes(`## ${excluida!.h2}`), false, "o CSV 'Para escrever' tira a seção (como antes)");

  const plano = radarVideoPlan(comExclusao(antes), contexto) as { status: string; capitulos: Array<{ titulo: string }> };
  assert.equal(plano.status, "ready");
  assert.equal(plano.capitulos.some(capitulo => capitulo.titulo === excluida!.h2), false, "o plano do vídeo (CSV e semente do Redator) mantinha a seção excluída");
  /* Sem exclusão, a seção continua lá: a régua só tira o que o Arquiteto decidiu. */
  const semReajuste = radarVideoPlan(antes, contexto) as { capitulos: Array<{ titulo: string }> };
  assert.equal(semReajuste.capitulos.some(capitulo => capitulo.titulo === excluida!.h2), true);

  const linha = buildRadarVideoExportArticle(comExclusao(antes), { ...(contexto as object), position: 1 } as never).row;
  assert.match(linha.cortes_para_redes, /Fora do vídeo \(exclusão do ArticleDNA, decidida no Arquiteto\): seção "[^"]+" — trata de "pele oleosa", assunto do artigo "skincare para pele oleosa"\. Não vira capítulo, corte, cena nem lâmina\./);
  assert.doesNotMatch(linha.cortes_para_redes, /pend[eê]ncia|aguardando aprova|rascunho|fonte a obter|preencher|peça ao Arquiteto/i, "D10");
  assert.doesNotMatch(linha.storyboard_visual, new RegExp(excluida!.h2.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), "a lâmina da seção excluída saiu no storyboard");
});

test("F2 · o técnico com planta lê pelas regras do piloto: sem segunda chamada, sem a seção excluída, com a trava do pacote", () => {
  const entrada = comExclusao(entradaGoogle());
  const planta = plantaDe(entradaGoogle(), {
    articleId: ARTIGO,
    resposta: { closing: { turn: "Quem quer mais precisa de método.", specialist: null, cta: "Agende uma conversa.", nextStep: "Acesse a página de SEO para clínicas e peça um orçamento." } },
  } as never);
  const excluida = planta.blueprint.sections.find(secao => /pele oleosa/i.test(secao.h2));
  assert.ok(excluida);
  const lida = radarPortableExportBlueprintOf(planta, entrada);
  assert.ok(lida);
  const linha = buildRadarPortableExportRow({ ...entrada, articleBlueprint: lida });
  assert.equal(linha.outline_md.split("\n").some(item => item.startsWith("Próximo passo:")), false, "o próximo passo que chama virou segunda chamada no técnico");
  assert.equal(linha.outline_md.includes(`## ${excluida!.h2}`), false, "a seção excluída pelo reajuste ficou no técnico");
  assert.match(linha.outline_md, /Sai do artigo-modelo \(exclusão do ArticleDNA, decidida no Arquiteto\)/);
  assert.equal(lida!.reading.closing.nextStep, null, "a leitura do técnico (outline_json) também tira o próximo passo que chama");
  assert.equal(lida!.reading.sections.some(secao => secao.h2 === excluida!.h2), false);
  /* A chamada antiga, sem a entrada, continua a de antes (compatível). */
  const crua = radarPortableExportBlueprintOf(planta);
  assert.ok(crua!.columns.estrutura.split("\n").some(item => item.startsWith("Próximo passo:")));
});

test("F5 · o writer_brief_md com planta é só da planta: sem a estratégia antiga, SEO da planta, e a regra D10 concluída", () => {
  const entrada = entradaGoogle();
  const planta = plantaDe(entrada, { articleId: ARTIGO });
  const linha = buildRadarPortableExportRow({ ...entrada, articleBlueprint: radarPortableExportBlueprintOf(planta, entrada) });
  assert.equal(linha.writer_brief_md.includes("# ESTRATÉGIA PARA SUPERAR A SERP"), false, "a estratégia do modelo antigo voltou ao brief");
  assert.ok(linha.serp_outperformance_strategy_md.length > 0, "a estratégia continua na coluna de auditoria");
  assert.match(linha.writer_brief_md, /Formato: o do artigo-modelo da SERP concluído/);
  assert.match(linha.writer_brief_md, /# SEO\n\nH1: /);
  assert.doesNotMatch(linha.writer_brief_md, /sinalizar qualquer dependência/);
  assert.match(linha.writer_brief_md, /o que não tem fonte do pacote entra delimitado ou fica fora do texto\./);
  assert.doesNotMatch(linha.writer_context_md, /sinalizar qualquer dependência/);
  /* Sem planta (auditoria), o brief continua com a estratégia: só o contrato pela planta mudou. */
  const semPlanta = radarWriterBriefMarkdown({ dna: { principalKeyword: "x", secondaryKeywords: [], narrativeReinforcements: [], intent: null, funnel: null, silo: null, siloRole: null, mustCover: [], protectedDecisions: [] } as never, editorial: { title: "t", alternateTitles: [], readerPromise: null, openingOrHook: null, conclusion: null, cta: null, objective: null, blueprintType: "ARTIGO", editorialOutput: null } as never, radiography: "", strategy: "# E\n\n- estratégia", outline: "", seo: "", internalLinks: "", evidence: "", media: "", commercial: "", limitations: [] });
  assert.match(semPlanta, /# ESTRATÉGIA PARA SUPERAR A SERP/);
});

/* ================= contrato-F9 · um portão só para o vídeo como perfil primário ================= */

test("contrato-F9 · no modo 'writing', a investigação de vídeo como perfil primário não pede planta; no vídeo e no técnico, pede", () => {
  const montado = (articleId: string, profile: string): RadarPortableExportAssembledArticle => ({
    articleId, entrada: { ...entradaGoogle(), profile } as never, lentes: [], blueprint: null,
  } as RadarPortableExportAssembledArticle);
  const artigos = [montado("a-yt", "YOUTUBE"), montado("a-google", "GOOGLE")];
  assert.deepEqual(radarPortableExportMissingBlueprints(artigos, null, { mode: "writing" }).map(item => item.articleId), ["a-google"]);
  assert.deepEqual(radarPortableExportMissingBlueprints(artigos, null, { mode: "video" }).map(item => item.articleId), ["a-yt", "a-google"]);
  assert.deepEqual(radarPortableExportMissingBlueprints(artigos, null, { mode: "full" }).map(item => item.articleId), ["a-yt", "a-google"]);
  assert.deepEqual(radarPortableExportMissingBlueprints(artigos).map(item => item.articleId), ["a-yt", "a-google"], "sem modo, a regra de antes");
});

test("contrato-F9 · a rota e o MCP passam o modo ao portão", async () => {
  const rota = semComentarios(await ler("app/api/editorial/radar-export/route.ts"));
  assert.match(rota, /radarPortableExportMissingBlueprints\(montadas, null, \{ mode: input\.mode \}\)/);
  const mcp = semComentarios(await ler("lib/server/radar-mcp-material.ts"));
  assert.match(mcp, /radarPortableExportMissingBlueprints\(montagem\.montadas, null, \{ mode \}\)/);
  assert.match(mcp, /radarPortableExportMissingBlueprints\(montagem\.montadas, ids, \{ mode \}\)/);
});

/* ================= F10 · a parte comercial no CSV "Para escrever" com o Google como base ================= */

test("F10 · Google + Amazon como review: o CSV 'Para escrever' leva a coluna produtos e o aviso de afiliado; sem produto, ressalva sem bloquear", () => {
  const base = entradaGoogle();
  const planta = plantaDe(base, { articleId: ARTIGO });
  const comercial = {
    setup: null, comparisonCriteria: ["preço por ml", "textura"], disclosureRequired: true,
    counts: { observed: 12, eligible: 3, shortlist: 2 },
    links: [{ asin: "B0A", productName: "Gel de limpeza oil control", amazonUrl: "https://www.amazon.com.br/dp/B0A?tag=x&ref=y" }, { asin: "B0B", productName: "Sérum niacinamida", amazonUrl: "https://www.amazon.com.br/dp/B0B" }],
  };
  const linha = buildRadarWritingExportArticle({ ...base, profile: "GOOGLE", commercial: comercial } as never, { topRowLabel: "Marca", filePosition: 1, silo: null, articleId: ARTIGO, publication: null, blueprint: planta } as never).row;
  assert.match(linha.produtos, /Produtos selecionados:/);
  assert.match(linha.produtos, /https:\/\/www\.amazon\.com\.br\/dp\/B0A/);
  assert.doesNotMatch(linha.produtos, /tag=x/, "o link sai limpo");
  assert.match(linha.prompt, /Coloque o aviso de afiliado antes do primeiro link de produto/);
  const vazio = buildRadarWritingExportArticle({ ...base, profile: "GOOGLE", commercial: { ...comercial, links: [] } } as never, { topRowLabel: "Marca", filePosition: 1, silo: null, articleId: ARTIGO, publication: null, blueprint: planta } as never).row;
  assert.doesNotMatch(vazio.pode_escrever, /^Não/, "com o Google como base, a falta de produto não bloqueia o artigo inteiro (decisão do dono)");
  assert.match(vazio.pode_escrever, /nenhum produto da Amazon foi selecionado \(12 observados, 3 compatíveis com o alvo\): a parte de review fica fora do texto/);
  /* Sem Amazon congelada, nada muda. */
  const semAmazon = buildRadarWritingExportArticle({ ...base, profile: "GOOGLE", commercial: null } as never, { topRowLabel: "Marca", filePosition: 1, silo: null, articleId: ARTIGO, publication: null, blueprint: planta } as never).row;
  assert.equal(semAmazon.produtos, "");
});

/* ================= F3 · na aba Amazon, o artigo-modelo vem primeiro ================= */

test("F3 · aba '+ Amazon (review)': o artigo-modelo antes do painel da Amazon; o modelo comercial recolhido como esqueleto; 'Pronto para o Redator' só com a planta", async () => {
  const bancada = semComentarios(await ler("modules/radar/radar-r3-workbench.tsx"));
  const antes = bancada.indexOf('{searchMode === "AMAZON" && amazonSearch && articleBlueprint && <div className="mt-3">{articleBlueprint}</div>}');
  const painel = bancada.indexOf('{searchMode === "AMAZON" && amazonSearch && <RadarAmazonSearchPanel');
  assert.ok(antes > 0 && antes < painel, "na Amazon, o artigo-modelo vem antes do painel da prateleira");
  assert.match(bancada, /\{!areaGoogle && !\(searchMode === "AMAZON" && amazonSearch\) && articleBlueprint && <div className="mt-3">\{articleBlueprint\}<\/div>\}/, "no YouTube continua depois do painel, sem repetir na Amazon");
  const amazon = semComentarios(await ler("modules/radar/radar-amazon-search-panel.tsx"));
  assert.match(amazon, /\{editorialModel && <details className="rounded-md border border-divider bg-surface p-3" data-testid="radar-amazon-serp-skeleton">/);
  assert.doesNotMatch(amazon, /<details[^>]*\bopen\b[^>]*data-testid="radar-amazon-serp-skeleton"/, "o esqueleto nasce recolhido");
  const modelo = semComentarios(await ler("lib/radar/editorial-profile-model.ts"));
  assert.match(modelo, /label: "Esqueleto completo"/);
  assert.doesNotMatch(modelo, /"Pronto para o Redator"/, "o esqueleto legado diz 'Pronto para o Redator' sem a planta");
});

/* ================= F11 · o bloco comercial completo chega ao gerador ================= */

test("F11 · a montagem do export anexa o bloco comercial completo da Amazon congelada (o gerador deixa de cair no plano resumido)", async () => {
  const nucleo = semComentarios(await ler("lib/server/radar-portable-export-core.ts"));
  const push = nucleo.slice(nucleo.indexOf("montadas.push({"), nucleo.indexOf("identificacao.push({"));
  assert.match(push, /amazonCommercialBlock: radarAmazonFrozenCommercialBlock\(\{ payload, context: contexto \}\),/);
  const gerador = semComentarios(await ler("lib/server/radar-article-blueprint.ts"));
  assert.match(gerador, /amazonCommercialBlock/);
  /* R10 · o caminho sem a conferência da planta saiu do núcleo. */
  assert.doesNotMatch(nucleo, /radarWritingExportForArticle/);
});

/* ================= F14 · o custo dito no botão é o teto ================= */

test("F14 · os botões de finalizar dizem o teto real (até 2 chamadas de IA), uma constante só", () => {
  assert.equal(RADAR_ARTICLE_BLUEPRINT_MAX_AI_CALLS, 2);
  assert.equal(RADAR_AUTO_FINALIZE_AI_COST, "+ até 2 chamadas de IA para organizar o artigo-modelo");
  assert.equal(radarAutoFinalizeButtonLabel("Analisar concorrência"), "Analisar concorrência · e finaliza (+ até 2 chamadas de IA)");
  assert.equal(radarFinalizeWithAiLabel("Finalizar investigação"), "Finalizar investigação · inclui até 2 chamadas de IA");
});

/* ================= F18 · a leitura seguinte no painel do Radar ================= */

test("F18 · o painel do Radar mostra a leitura seguinte como opcional e esconde o próximo passo que chama", async () => {
  assert.equal(RADAR_ARTICLE_BLUEPRINT_CONTINUATION_LABEL, WRITER_BLUEPRINT_CONTINUATION_LABEL, "um rótulo só no Radar e no Redator");
  assert.equal(radarArticleBlueprintContinuationOf("Acesse a página de SEO para clínicas e peça um orçamento."), null);
  assert.equal(radarArticleBlueprintContinuationOf("O próximo artigo do Silo explica como medir os leads."), "O próximo artigo do Silo explica como medir os leads.");
  assert.equal(radarArticleBlueprintContinuationOf(null), null);
  const painel = semComentarios(await ler("modules/radar/radar-article-blueprint-panel.tsx"));
  assert.doesNotMatch(painel, /Próximo passo: \{b\.closing\.nextStep\}/);
  assert.match(painel, /\{RADAR_ARTICLE_BLUEPRINT_CONTINUATION_LABEL\}: \{radarArticleBlueprintContinuationOf\(b\.closing\.nextStep\)\}/);
});

/* ================= F19 · o lote conta a falta de planta como bloqueio ================= */

test("F19 · no envio em lote, a recusa por falta do artigo-modelo é 'bloqueado (não pronto)', não falha", () => {
  assert.equal(radarHandoffOutcomeOfCode("radar_handoff_article_blueprint_missing"), "BLOCKED_NOT_READY");
  assert.equal(radarHandoffOutcomeOfCode("radar_handoff_article_blueprint_unreadable"), "FAILED", "a leitura que falhou continua falha");
});

/* ================= F13 · a leitura que falha não oferece organizar ================= */

test("F13 · a leitura do artigo-modelo que falha vira 'não conferido', nunca 'falta organizar' (Radar e Redator)", async () => {
  const painel = semComentarios(await ler("modules/radar/radar-article-blueprint-panel.tsx"));
  assert.match(painel, /export type RadarArticleBlueprintDelivery = "loading" \| "approved" \| "missing" \| "unreadable";/);
  assert.match(painel, /: leituraFalhou\s*\? "unreadable"/);
  const bancada = semComentarios(await ler("modules/radar/radar-r3-workbench.tsx"));
  const envio = bancada.slice(bancada.indexOf("function WriterHandoff("), bancada.indexOf("function DeepResearch("));
  const ilegivel = envio.indexOf('tab.articleBlueprint === "unreadable"');
  assert.ok(ilegivel > 0 && ilegivel < envio.indexOf("if (semPlanta)"), "a leitura que falhou cai antes do botão que organiza");
  const leitor = semComentarios(await ler("lib/server/writer-evidence-reader.ts"));
  assert.match(leitor, /if \(planta\.blueprintUnreadable\) return \{ state: "unreadable", articleId: head\.articleId, reason: motivo \};/);
  const painelDoRedator = semComentarios(await ler("modules/redator/writer-radar-foundations-panel.tsx"));
  assert.match(painelDoRedator, /else if \(corpo\?\.state === "unreadable"\) setLida\(\{ chave, leitura: \{ estado: "erro"/);
});

/* ================= F6, F16 · a semente do Redator sem a decisão de formato duplicada ================= */

test("F6/F16 · a semente do roteiro e do carrossel não traz a recomendação antiga nem 'Precisa responder/cobrir'", () => {
  const foundations = {
    profile: "YOUTUBE", profileLabel: "YouTube", observedAt: null, bundleId: null, bundleHash: null,
    keyword: { principal: "skincare", secondary: [], reinforcements: [], resolution: null },
    recommendations: [{ output: "SHORTS", label: "Shorts", objective: "Responder rápido", reason: "Shorts lideram a amostra inteira", sourceSignals: [] }],
    research: [], youtube: null, multimodal: null, review: null,
    evidence: { sources: [], serpStanding: null, videoLibrary: null, specialist: false, observedPages: null },
    mustAnswer: ["Pele oleosa precisa de hidratante?"], mustCover: ["oleosidade"], limitations: [], writerMayNot: [],
  };
  const linhas = seedContextLines({ title: "Skincare", foundations, plan: planoDeVideo(), finalArticle: null } as never).join("\n");
  assert.doesNotMatch(linhas, /Recomendação editorial do Radar|Shorts lideram a amostra inteira/);
  assert.doesNotMatch(linhas, /Precisa responder|Precisa cobrir/);
  assert.match(linhas, /Formato do vídeo: /, "a decisão de formato é a do plano");
});

/* ================= F15 · o briefing do MCP serve a virada pela planta ================= */

test("F15 · get_writer_brief troca as linhas do Assunto pelas da planta concluída; save_writer_deliverable exige a planta", async () => {
  const rota = semComentarios(await ler("app/api/mcp/redator/route.ts"));
  const brief = rota.slice(rota.indexOf('server.registerTool("get_writer_brief"'), rota.indexOf('server.registerTool("get_writer_foundations"'));
  assert.match(brief, /estadoDaPlanta\.status === "approved" && brief\.editorialContext\.length\s*\? await readWriterArticleBlueprintPanel\(evidenceContext\(access\), documentId\)/);
  assert.match(brief, /\.\.\.\(linhasDoAssunto\.length \? \{ editorialContext: \[\.\.\.linhasDoAssunto\] \} : \{\}\)/);
  const entregavel = rota.slice(rota.indexOf('server.registerTool("save_writer_deliverable"'), rota.indexOf('server.registerTool("register_media_brief"'));
  const conferencia = entregavel.indexOf("await readMcpArticleBlueprintState(access, documentId)");
  assert.ok(conferencia > 0 && conferencia < entregavel.indexOf("saveWriterDeliverable("), "o entregável de fora é gravado sem conferir a planta");
  assert.match(entregavel, /if \(estadoDaPlanta\.status !== "approved"\) \{\s*throw new ToolFailure\(estadoDaPlanta\.status,/);
});

/* ================= contrato-F1/R1 · a versão vigente em todo leitor ================= */

test("contrato-F1 · o START do YouTube/Amazon e o apoio do Google escolhem a versão vigente do ArticleDNA, como o export e o envio", async () => {
  for (const arquivo of ["lib/server/radar-youtube-start.ts", "lib/server/radar-support-research.ts", "lib/server/radar-writer-send.ts"]) {
    const fonte = semComentarios(await ler(arquivo));
    assert.doesNotMatch(fonte, /articles\.find\(/, `${arquivo} escolhe a versão pela ordem do banco`);
    assert.match(fonte, /radarCurrentArticleDnaVersion\(\{ versions: artefatos\.articles, events: artefatos\.events/, arquivo);
  }
  const pagina = semComentarios(await ler("modules/radar/radar-page.tsx"));
  const envio = pagina.slice(pagina.indexOf("const organizarArtigoModeloEEnviar"), pagina.indexOf("const enviarAoRedator"));
  assert.match(envio, /postRadarArticleBlueprintOrganize\(\{ brandId: target\.brandId, articleId, ifMissing: true \}\)/, "organizar e enviar paga de novo a planta que já existe");
});

/* ================= contrato-F11 · a prévia do reparo diz o que custa ================= */

test("contrato-F11 · o reparo que só mudou as limitações diz isso, e na Amazon diz que a planta se desliga e o custo", () => {
  const amazon = radarRefreezeDiagnosis({ profile: "AMAZON", finalized: true, differences: ["Mudaram as limitações declaradas."], blocker: null });
  assert.equal(amazon.mode, "REFREEZE");
  assert.match(String(amazon.reason), /A diferença é só nas limitações declaradas/);
  assert.ok(amazon.consequences.some(item => /recongelar desliga essa planta, e a reorganização custa até 2 chamadas de IA/.test(item)));
  const youtube = radarRefreezeDiagnosis({ profile: "YOUTUBE", finalized: true, differences: ["Mudaram as limitações declaradas.", "Mudou a leitura multiformato (YouTube cruzado com a SERP do Google)."], blocker: null });
  assert.equal(youtube.reason, null, "com outra diferença, a leitura do material mudou");
  assert.equal(youtube.consequences.some(item => /Na Amazon/.test(item)), false);
});

/* ================= contrato-F2 · P0-A: o escopo do desligamento, sem silêncio ================= */

test("contrato-F2 · (correção) no Radar a versão é a TRANSPORTADA pelo item: a versão nova aprovada não desliga a planta da versão enviada; sem versão transportada, a regra da mesa", () => {
  const F = "2026-10-05T12:00:00.000Z";
  const versao = (versionId: string, versionNumber: number) => ({ versionId, versionNumber, contentHash: `h-${versionId}`, payload: { articleId: "a1", brandId: "m1" } });
  const planta = (articleDnaVersionId: string) => ({ id: "bp-1", bundleHash: "hash-da-organizacao", versionNumber: 1, state: "APPROVED", createdAt: "2026-10-06T09:00:00.000Z", investigationRef: { frozenAt: F, frozenBundleId: null, frozenBundleHash: null, articleDnaVersionId, articleDnaContentHash: `h-${articleDnaVersionId}` } });
  /* Sem versão transportada (item sem versão): a regra da mesa, como antes. */
  const vigenteDe = (versoes: ReturnType<typeof versao>[], eventos: Array<{ versionId: string; status: string }>) => radarCurrentArticleDnaVersion({ versions: versoes, events: eventos, brandId: "m1", articleId: "a1" })!;
  /* Com a versão que o item do Radar transporta (a que o Arquiteto enviou). */
  const doItem = (versoes: ReturnType<typeof versao>[], eventos: Array<{ versionId: string; status: string }>, transportada: string) => radarCurrentArticleDnaVersion({ versions: versoes, events: eventos, brandId: "m1", articleId: "a1", transportedVersionId: transportada })!;
  const vale = (vigente: ReturnType<typeof versao>) => radarArticleBlueprintPick([planta("dna-v1")], { bundleHash: "hash-de-hoje", investigation: { frozenAt: F, frozenBundleId: null, frozenBundleHash: null, articleDnaVersionId: vigente.versionId, articleDnaContentHash: vigente.contentHash, amazonFrozenAt: null, articleDnaFrom: null, articleDnaUntil: null } }) !== null;
  const um = [versao("dna-v1", 1)];
  const dois = [versao("dna-v1", 1), versao("dna-v2", 2)];
  /* Uma versão só (o caso de quase todo artigo): nada muda. */
  assert.equal(vale(vigenteDe(um, [{ versionId: "dna-v1", status: "approved" }])), true);
  /* Versão nova em revisão ou rejeitada não tira a autoridade da aprovada: a planta continua. */
  assert.equal(vale(vigenteDe(dois, [{ versionId: "dna-v1", status: "approved" }, { versionId: "dna-v2", status: "proposed" }])), true);
  assert.equal(vale(vigenteDe(dois, [{ versionId: "dna-v1", status: "approved" }, { versionId: "dna-v2", status: "rejected" }])), true);
  /*
   * Versão nova APROVADA (reajuste 'Gravar melhorias') num artigo que já está no
   * Radar: o item continua transportando a v1, e a planta organizada sobre ela
   * continua valendo. Antes da correção a regra da mesa escolhia a v2 e travava
   * o artigo (a coleta, o export e o envio davam ARTICLE_VERSION_MISMATCH).
   */
  const aprovadasAsDuas = [{ versionId: "dna-v1", status: "approved" }, { versionId: "dna-v2", status: "approved" }];
  assert.equal(doItem(dois, aprovadasAsDuas, "dna-v1").versionId, "dna-v1");
  assert.equal(vale(doItem(dois, aprovadasAsDuas, "dna-v1")), true);
  /* O item que transporta a v2 (o reenvio, quando existir) não reaproveita a planta da v1. */
  assert.equal(vale(doItem(dois, aprovadasAsDuas, "dna-v2")), false);
  /* Sem versão transportada, a regra da mesa continua escolhendo a aprovada mais nova (e a planta da v1 não vale para ela). */
  assert.equal(vale(vigenteDe(dois, aprovadasAsDuas)), false);
  /* Os casos de antes, com o item na v1, não mudam. */
  assert.equal(vale(doItem(dois, [{ versionId: "dna-v1", status: "approved" }, { versionId: "dna-v2", status: "proposed" }], "dna-v1")), true);
});

/* ============================== a sentinela ============================== */

test("PROVIDER_CALLS = 0 · AI_CALLS = 0", () => {
  assert.deepEqual(idasAoServidor, []);
});
