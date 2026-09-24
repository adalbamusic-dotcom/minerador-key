import assert from "node:assert/strict";
import test from "node:test";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import {
  buildRadarExpertBriefContext,
  buildRadarExpertBriefTelegramMessage,
  questionFromRadarSuggestion,
  radarExpertBriefSubjectLines,
  radarExpertBriefSubjectOf,
  radarExpertTopicsSubjectPromptLines,
} from "../lib/radar/expert-brief.ts";
import { buildRadarBlueprintSummary } from "../lib/radar/editorial-blueprint.ts";
import { radarR7SubjectTopic } from "../lib/radar/r7-sequential.ts";
import { RADAR_SUBJECT_NO_TOUCH_ALERT, radarSubjectDeepeningRequest } from "../lib/radar/declared-subject.ts";
import {
  RADAR_SUBJECT_TURN_SCREEN_LABEL,
  radarCandidateEvidenceLabel,
  radarObservedSectionCounts,
  radarObservedSectionNumbers,
} from "../modules/radar/radar-subject-turn-view.ts";
import { RadarBlueprintDetail, RadarBlueprintSummaryCard } from "../modules/radar/radar-r3-blueprint.tsx";
import { RadarArticleModelSection } from "../modules/radar/radar-article-model.tsx";
import {
  DESTINO_DO_ASSUNTO,
  FRASE_DO_ASSUNTO,
  ID_DA_VIRADA,
  NOTA_DO_ASSUNTO,
  articleModelFixture,
  blueprintFixture,
  expertContextFixture,
} from "./radar-assunto-telas-fixtures.mts";

/*
 * ===== SDD do Assunto · F3.1 · o especialista e as telas do Radar =====
 *
 * 1. O especialista VÊ o Assunto: o prompt das pautas cita a frase e a nota e
 *    pede o aprofundamento da virada; a mensagem do Telegram e o painel mostram,
 *    em palavras simples, "Tema a aprofundar: <frase>" e a pergunta sobre o
 *    leitor, sem jargão da casa. Sem Assunto, o texto é o de hoje.
 * 2. Nas telas do r3, a seção sintética da virada tem rótulo próprio ("Exigida
 *    pelo Assunto"), não conta como candidato observado e o alerta aparece
 *    legível (14px) onde as limitações aparecem.
 *
 * Nenhuma chamada paga: a rota é lida como fonte, e o prompt é montado pela
 * função pura que ela chama. Os hashes dourados foram medidos contra a versão
 * do HEAD de cada tela e da mensagem, com as fixtures sem Assunto.
 */

const sha = (texto: string) => createHash("sha256").update(texto).digest("hex");
const fonte = (relativo: string) => readFileSync(new URL(relativo, import.meta.url), "utf8").replace(/\r\n/g, "\n");
const semComentarios = (codigo: string) => codigo.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

/* ============================ o prompt das pautas ============================ */

test("prompt das pautas: sem Assunto, nenhuma linha a mais", () => {
  assert.deepEqual(radarExpertTopicsSubjectPromptLines(expertContextFixture(false)), []);
  /* Assunto sem frase não é Assunto. */
  assert.deepEqual(radarExpertTopicsSubjectPromptLines({ articleDna: { subject: { phrase: "   ", note: "x" } } }), []);
});

test("prompt das pautas: com Assunto, cita a frase, a nota e pede a virada", () => {
  const linhas = radarExpertTopicsSubjectPromptLines(expertContextFixture(true));
  const texto = linhas.join("\n");
  assert.ok(texto.includes(`"${FRASE_DO_ASSUNTO}"`), "a frase é citada");
  assert.ok(texto.includes(`Nota do Assunto: "${NOTA_DO_ASSUNTO}"`), "a nota é citada");
  assert.ok(texto.includes(radarSubjectDeepeningRequest(FRASE_DO_ASSUNTO)), "o pedido de aprofundar a virada vai no prompt");
  assert.match(texto, /aprofundem o Assunto e a virada/);
  assert.match(texto, /A principal continua sendo a promessa/);
  assert.match(texto, /Nao troque a principal pelo Assunto/);
  /* O destino é do CTA, não da pauta do especialista. */
  assert.equal(texto.includes(DESTINO_DO_ASSUNTO), false);

  const simples = linhas.find(linha => linha.startsWith("O campo text de cada pauta vai a um especialista externo"));
  assert.ok(simples, "o prompt pede texto de pauta em linguagem simples");
  assert.match(simples, /sem as palavras Assunto, tronco, virada ou ArticleDNA/);
  assert.ok(simples.endsWith(`Exemplo: "O que o leitor desta busca precisa entender para chegar a ${FRASE_DO_ASSUNTO}?"`));

  const semNota = radarExpertTopicsSubjectPromptLines(expertContextFixture(true, true)).join("\n");
  assert.equal(semNota.includes("Nota do Assunto"), false, "sem nota, sem linha de nota");
});

test("rota radar-topics: o prompt do sistema é SYSTEM_PROMPT + as linhas do Assunto, e o texto base não mudou", () => {
  const rota = fonte("../app/api/editorial/radar-topics/route.ts");
  const codigo = semComentarios(rota);
  /* O texto base, medido no HEAD antes da F3. */
  const base = rota.match(/const SYSTEM_PROMPT = `[\s\S]*?`;/)?.[0] || "";
  assert.equal(sha(base), "76c8e4ed4edac84d837e7f9e18b18a7b5659494301406e87b54195568fbc84d0", "o SYSTEM_PROMPT continua byte a byte igual");
  assert.match(codigo, /import \{ radarExpertTopicsSubjectPromptLines \} from "@\/lib\/radar\/expert-brief";/);
  assert.match(codigo, /return \[SYSTEM_PROMPT, \.\.\.radarExpertTopicsSubjectPromptLines\(input\.context\)\]\.join\("\\n"\);/);
  assert.match(codigo, /system: buildSystemPrompt\(parsed\.data\)/);
  assert.equal(/system: SYSTEM_PROMPT\b/.test(codigo), false, "o prompt do sistema passa pelo montador");
  /* Sem Assunto a lista é vazia, e [SYSTEM_PROMPT].join("\n") é o próprio SYSTEM_PROMPT. */
  assert.equal(["X", ...radarExpertTopicsSubjectPromptLines(expertContextFixture(false))].join("\n"), "X");
});

/* ============================ a mensagem ao especialista ============================ */

const entradaDaMensagem = (comAssunto: boolean) => ({
  title: "Pauta de marketing para clínicas",
  questions: [{ text: "Qual canal traz mais pacientes?" }, "Quanto tempo leva o SEO?"],
  radarContext: buildRadarExpertBriefContext(expertContextFixture(comAssunto)),
});

test("Telegram: sem Assunto, a mensagem é byte a byte a de antes", () => {
  const mensagem = buildRadarExpertBriefTelegramMessage(entradaDaMensagem(false));
  assert.equal(sha(mensagem), "3c214f7c5eb47e892a6930466f19a6c140744390662fbb1dc86ecf627742c0fe");
  assert.equal(mensagem.includes("Assunto"), false);
  assert.equal(sha(buildRadarExpertBriefTelegramMessage({ title: "x", questions: ["q"] })), "c4d67737b45f7b79744b704618350de9c96f05dd6cfc383629b2e32399445137");
});

const PERGUNTA_AO_ESPECIALISTA = `Pergunta: o que o leitor desta busca precisa entender para chegar a ${FRASE_DO_ASSUNTO}?`;

test("Telegram: com Assunto, o tema a aprofundar e a pergunta logo depois do tema; sem jargão", () => {
  const linhas = buildRadarExpertBriefTelegramMessage(entradaDaMensagem(true)).split("\n");
  const tema = linhas.indexOf("Tema: marketing para clínicas");
  assert.ok(tema > 0);
  assert.equal(linhas[tema + 1], `Tema a aprofundar: ${FRASE_DO_ASSUNTO}`);
  assert.equal(linhas[tema + 2], PERGUNTA_AO_ESPECIALISTA);
  const texto = linhas.join("\n");
  /* A nota e o destino são de quem opera, não do especialista. */
  assert.equal(texto.includes(NOTA_DO_ASSUNTO), false);
  assert.equal(texto.includes(DESTINO_DO_ASSUNTO), false);
  /* O jargão da casa não vai ao especialista de fora. */
  assert.equal(/tronco|virada|ArticleDNA|Pedido:/i.test(texto), false, texto);
  assert.equal(texto.includes(radarSubjectDeepeningRequest(FRASE_DO_ASSUNTO)), false, "o texto da SDD fica por dentro");
});

test("Telegram: pauta persistida leva a pergunta montada da frase, com ou sem `request`", () => {
  const radarContext = { article: { principal: "marketing para clínicas", subject: { phrase: FRASE_DO_ASSUNTO, note: null, destinationUrl: null } } };
  const texto = buildRadarExpertBriefTelegramMessage({ title: "Pauta", questions: ["q"], radarContext });
  assert.ok(texto.includes(PERGUNTA_AO_ESPECIALISTA));
  /* Um `request` persistido com o texto da SDD não muda o que vai ao especialista… */
  const article = { principal: "marketing para clínicas", subject: { phrase: FRASE_DO_ASSUNTO, request: radarSubjectDeepeningRequest(FRASE_DO_ASSUNTO) } };
  assert.equal(buildRadarExpertBriefTelegramMessage({ title: "Pauta", questions: ["q"], radarContext: { article } }), texto);
  /* …e o prompt interno continua com ele. */
  assert.equal(radarExpertBriefSubjectOf(article)?.request, radarSubjectDeepeningRequest(FRASE_DO_ASSUNTO));
  const minimo = radarExpertBriefSubjectOf({ subject: { phrase: "x" } });
  assert.ok(minimo);
  assert.deepEqual(radarExpertBriefSubjectLines(minimo), ["Tema a aprofundar: x", "Pergunta: o que o leitor desta busca precisa entender para chegar a x?"]);
  assert.equal(radarExpertBriefSubjectOf({ subject: { phrase: "" } }), null);
  assert.equal(radarExpertBriefSubjectOf(null), null);
});

test("Telegram de ponta a ponta: a pauta do domínio aprovada sem edição chega sem jargão e sem pergunta repetida", () => {
  const contexto = expertContextFixture(true);
  const doDominio = radarR7SubjectTopic(contexto);
  assert.ok(doDominio);
  const perguntas = [questionFromRadarSuggestion({ ...doDominio, text: "Qual canal traz mais pacientes?" }, 0), questionFromRadarSuggestion(doDominio, 1)];
  const texto = buildRadarExpertBriefTelegramMessage({
    title: "Pauta de marketing para clínicas",
    questions: perguntas,
    radarContext: buildRadarExpertBriefContext(contexto),
  });
  assert.equal(/Assunto|virada|tronco|ArticleDNA|Pedido:/i.test(texto), false, texto);
  const linhas = texto.split("\n");
  assert.ok(linhas.includes(`Tema a aprofundar: ${FRASE_DO_ASSUNTO}`));
  assert.ok(linhas.includes(`2. O que o leitor desta busca precisa entender para chegar a ${FRASE_DO_ASSUNTO}?`));
  assert.equal(linhas.filter(linha => /precisa entender para chegar a/.test(linha)).length, 1, "a pergunta aparece uma vez só");
  assert.equal(linhas.some(linha => linha.startsWith("Pergunta:")), false, "já numerada, não se repete no cabeçalho");

  const editada = buildRadarExpertBriefTelegramMessage({
    title: "Pauta de marketing para clínicas",
    questions: [{ ...perguntas[1], text: "Quando a clínica precisa de uma agência?" }],
    radarContext: buildRadarExpertBriefContext(contexto),
  }).split("\n");
  assert.ok(editada.includes(PERGUNTA_AO_ESPECIALISTA), "editada a pauta, a pergunta do tema volta ao cabeçalho");
  assert.equal(radarR7SubjectTopic(expertContextFixture(false)), null);
});

/* ============================ o painel do especialista ============================ */

test("painel do especialista: mostra o tema a aprofundar, a nota e a pergunta só quando há Assunto", () => {
  const painel = semComentarios(fonte("../modules/radar/radar-expert-brief-panel.tsx"));
  assert.match(painel, /const assuntoDoArtigo = radarExpertBriefSubjectOf\(context\.articleDna\);/);
  const bloco = painel.slice(painel.indexOf("{assuntoDoArtigo && <div"), painel.indexOf("</header>"));
  assert.ok(bloco.startsWith("{assuntoDoArtigo && <div"), "o bloco só existe com Assunto");
  assert.match(bloco, /data-testid="radar-specialist-subject"/);
  assert.match(bloco, /\{RADAR_EXPERT_SUBJECT_LABEL\}:<\/span> \{assuntoDoArtigo\.phrase\}/);
  assert.match(bloco, /\{assuntoDoArtigo\.note && /);
  assert.match(bloco, /\{RADAR_EXPERT_SUBJECT_QUESTION_LABEL\}:<\/span> \{assuntoDoArtigo\.question\}/);
  assert.equal(bloco.includes("assuntoDoArtigo.request"), false, "o texto da SDD não aparece no painel");
  assert.equal(/tronco|virada/i.test(bloco), false);
  /* 14px, tokens: nenhum texto do bloco abaixo de text-sm, nenhuma cor crua. */
  assert.equal(/text-xs|text-\[\d+px\]|#[0-9a-f]{3,8}\b|slate-|gray-/.test(bloco), false);
  /* O cabeçalho continua sem a palavra ArticleDNA (SPECIALIST_1.1). */
  assert.equal(bloco.includes("ArticleDNA"), false);
});

/* ============================ a virada nas telas do r3 ============================ */

test("contagem: a virada não é candidato observado", () => {
  const sem = blueprintFixture(false).sections;
  const com = blueprintFixture(true).sections;
  assert.equal(radarCandidateEvidenceLabel(sem), "Ver candidatos observados · 2", "sem Assunto, o rótulo de sempre");
  assert.equal(radarCandidateEvidenceLabel(com), "Ver candidatos observados · 2 · 1 exigida pelo Assunto");
  assert.deepEqual(radarObservedSectionCounts(com), { observed: 2, required: 1 });
  assert.deepEqual(radarObservedSectionNumbers(com), [1, 2, null]);
  assert.deepEqual(radarObservedSectionNumbers(sem), [1, 2]);
  /* O resumo do domínio concorda com a tela. */
  assert.equal(buildRadarBlueprintSummary(blueprintFixture(true)).sections, 2);
});

test("workbench: o disclosure usa a contagem de observados", () => {
  const tela = semComentarios(fonte("../modules/radar/radar-r3-workbench.tsx"));
  assert.match(tela, /import \{ radarCandidateEvidenceLabel \} from "\.\/radar-subject-turn-view";/);
  assert.match(tela, /\{radarCandidateEvidenceLabel\(model\.deepResearch\.blueprint\.sections\)\}/);
  assert.equal(tela.includes("Ver candidatos observados · {model.deepResearch.blueprint.sections.length}"), false);
});

test("blueprint: sem Assunto, markup byte a byte igual ao HEAD", () => {
  assert.equal(sha(renderToStaticMarkup(createElement(RadarBlueprintDetail, { blueprint: blueprintFixture(false) }))),
    "6d386dbcfa1de0dbcbfb3c2140f57baf233a16b63ab942e570e1eb4669eb7ed9");
  assert.equal(sha(renderToStaticMarkup(createElement(RadarBlueprintSummaryCard, { blueprint: blueprintFixture(false) }))),
    "4ade8468b01755b020bd5f9f2cee08fc57f71d4aec04ca1c14a4a1afb6bfb3b5");
});

test("blueprint: a virada tem rótulo próprio, sem número, e o alerta aparece em 14px", () => {
  const html = renderToStaticMarkup(createElement(RadarBlueprintDetail, { blueprint: blueprintFixture(true) }));
  assert.equal((html.match(/data-testid="radar-blueprint-section"/g) || []).length, 2, "só os observados contam como bloco");
  assert.equal((html.match(/data-testid="radar-blueprint-subject-turn"/g) || []).length, 1);
  const virada = html.slice(html.indexOf('data-testid="radar-blueprint-subject-turn"'));
  assert.match(virada, /<h4 class="text-sm font-semibold text-foreground">Virada para SEO para clínicas<\/h4>/, "sem número no título");
  assert.match(virada, new RegExp(`<span class="text-sm font-medium text-context-accent" data-testid="radar-blueprint-subject-turn-label">${RADAR_SUBJECT_TURN_SCREEN_LABEL}</span>`));
  assert.equal(virada.slice(0, virada.indexOf("Por que entra")).includes("Posição flexível"), false, "a virada não mostra prioridade e posição da amostra");
  /* os observados continuam numerados como antes, e a virada não ganha número */
  assert.ok(html.includes(">1. Marketing médico</h4>"));
  assert.ok(html.includes(">2. Canais de aquisição</h4>"));
  assert.equal(html.includes("3. Virada"), false);
  /* o alerta, nas limitações, em text-sm */
  const limitacoes = html.slice(html.indexOf('data-testid="radar-blueprint-limitations"'));
  assert.match(limitacoes, /<ul class="mt-1\.5 space-y-1 text-sm leading-6 text-text-muted">/);
  assert.ok(limitacoes.includes(RADAR_SUBJECT_NO_TOUCH_ALERT));
  /* e no próprio bloco da virada, em text-sm warning */
  assert.ok(virada.includes(`<p class="mt-1 text-sm leading-6 text-warning">${RADAR_SUBJECT_NO_TOUCH_ALERT}</p>`));

  const cartao = renderToStaticMarkup(createElement(RadarBlueprintSummaryCard, { blueprint: blueprintFixture(true) }));
  assert.match(cartao, /Blocos editoriais<\/dt><dd class="mt-0\.5 text-sm font-medium text-foreground">2<\/dd>/, "o número de blocos é o de observados");
});

test("artigo-modelo: sem Assunto, markup byte a byte igual ao HEAD", () => {
  assert.equal(sha(renderToStaticMarkup(createElement(RadarArticleModelSection, { model: articleModelFixture(false) }))),
    "187c7014eba41ed0e097a8d2717e3a1f86dd6433613fe51b43812bb5ae374fde");
});

test("artigo-modelo: a virada ganha o selo próprio; o Assunto, o alerta e o destino ficam visíveis", () => {
  const html = renderToStaticMarkup(createElement(RadarArticleModelSection, { model: articleModelFixture(true) }));
  const sub = html.slice(html.indexOf('data-testid="radar-article-model-subsection"'));
  assert.ok(sub.includes(`>${RADAR_SUBJECT_TURN_SCREEN_LABEL}</span>`), "a virada diz que é exigida pelo Assunto");
  const selosDaVirada = sub.slice(sub.indexOf('data-testid="radar-article-model-badges"'), sub.indexOf('data-testid="radar-article-model-evidence"'));
  assert.equal(selosDaVirada.includes("Exigido pelo ArticleDNA"), false, "e não o selo genérico");
  /* uma seção exigida pelo DNA, que não é a virada, continua com o selo de antes */
  assert.ok(html.includes("Exigido pelo ArticleDNA"));

  const bloco = html.slice(html.indexOf('data-testid="radar-article-model-subject"'), html.indexOf('data-testid="radar-article-model-opening"'));
  assert.ok(bloco.includes(`>Assunto (tronco): ${FRASE_DO_ASSUNTO}</h4>`));
  assert.ok(bloco.includes("Sem sinal na SERP: o Redator decide."));
  assert.ok(bloco.includes("O H1 é da principal."));
  assert.ok(bloco.includes(`<p class="mt-1 text-sm leading-6 text-warning" data-testid="radar-article-model-subject-alert">${RADAR_SUBJECT_NO_TOUCH_ALERT}</p>`));
  assert.ok(html.includes(`Destino da chamada</dt><dd class="mt-0.5 text-sm leading-6 text-foreground">Levar o leitor a ${DESTINO_DO_ASSUNTO}.</dd>`));
  assert.ok(html.includes(ID_DA_VIRADA) === false, "o id técnico não aparece no texto");
});

test("guard visual estrito nos arquivos desta parte", () => {
  const raiz = new URL("..", import.meta.url);
  const arquivos = [
    "modules/radar/radar-subject-turn-view.ts",
    "modules/radar/radar-r3-blueprint.tsx",
    "modules/radar/radar-r3-workbench.tsx",
    "modules/radar/radar-article-model.tsx",
    "modules/radar/radar-expert-brief-panel.tsx",
  ];
  const r = spawnSync(process.execPath, ["scripts/check-visual-system.mjs", "--strict", "--files", ...arquivos], { cwd: raiz, encoding: "utf8" });
  assert.equal(r.status, 0, `${r.stdout}\n${r.stderr}`);
});
