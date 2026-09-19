/**
 * ===== SEMEAR ROTEIRO E CARROSSEL A PARTIR DO RADAR =====
 *
 * COMPORTAMENTAL — o módulo puro: contexto, prompts, tradução para o contrato.
 * ESTRUTURAL     — a rota e a tela, com as asserções que guardam as três regras
 *                  duras do enunciado: não duplicar o dossiê, não criar versão,
 *                  e não deixar a recomendação do Radar virar portão.
 */

import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import type { ContentDocument } from "../lib/arquiteto/contracts.ts";
import { VideoScriptPayloadSchema, CarouselPayloadSchema, newWriterDeliverable } from "../lib/redator/multiformat-contracts.ts";
import type { RadarFoundations } from "../lib/redator/radar-foundations.ts";
import {
  buildCarouselSeedPrompt, buildScriptSeedPrompt, carouselPayloadFromSeed, deliverableHasWork,
  finalArticleText, ProviderCarouselSeedSchema, ProviderScriptSeedSchema, scriptPayloadFromSeed,
  seedContextLines, CAROUSEL_SEED_SYSTEM_PROMPT, SCRIPT_SEED_SYSTEM_PROMPT,
} from "../lib/redator/deliverable-seed.ts";

const fonte = (caminho: string) => readFile(new URL(caminho, import.meta.url), "utf8");
const ROTA = "../app/api/redator/seed/route.ts";
const TELA = "../modules/redator/writer-derived-environment.tsx";
const semComentarios = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

/* ============================== fixtures ============================== */

const fundamentos = (extra: Partial<RadarFoundations> = {}): RadarFoundations => ({
  profile: "YOUTUBE", profileLabel: "YouTube", observedAt: "2026-09-19T01:00:00.000Z",
  bundleId: "bundle-1", bundleHash: "sha256:abc",
  keyword: { principal: "skincare para pele oleosa", secondary: ["pele oleosa"], reinforcements: ["brilho"], resolution: null },
  recommendations: [{ output: "ARTICLE", label: "Artigo", objective: "cobrir o tema", reason: "a SERP é informacional", sourceSignals: ["10 páginas"] }],
  research: [{ source: "youtube", label: "YouTube", role: "PRIMARY", queries: 4, items: 38, frozenAt: null, limitations: ["sem transcrição de 6 vídeos"] }],
  youtube: {
    comparableVideos: 38, longForm: 26, shorts: 12, durationRange: "6–12 min",
    recurrentChannels: ["Canal A"], titlePatterns: ["rotina em N passos"], gaps: ["ninguém fala de sabonete"],
    format: "tutorial de rotina", hookDirection: { statement: "comece pelo erro mais comum", sourceSignal: null },
    titleDirections: [{ statement: "rotina para pele oleosa", sourceSignal: null }],
    script: [{ block: "Abertura", objective: "prender", direction: "mostre o brilho" }],
    tone: "direto", languageDirection: "segunda pessoa",
  },
  multimodal: { youtubeLongForm: 26, youtubeShorts: 12, crossSerp: [{ signal: "vídeo na SERP", count: 3 }], sources: ["WEB_SERP"] },
  evidence: { sources: ["WEB_SERP"], serpStanding: null, videoLibrary: null, specialist: false, observedPages: 10 },
  mustAnswer: ["O que é pele oleosa?"], mustCover: ["ácido salicílico"],
  limitations: ["amostra de 10 páginas"], writerMayNot: ["trocar a keyword principal"],
  ...extra,
});

const fonteSemente = (extra: Partial<{ finalArticle: string | null }> = {}) => ({
  title: "Skincare para pele oleosa", foundations: fundamentos(), finalArticle: null, ...extra,
});

const documento = (status: string, blocks: unknown[]): ContentDocument =>
  ({ status, blocks } as unknown as ContentDocument);

const baseRoteiro = () => newWriterDeliverable("video_script",
  { documentId: "doc-1", title: "T", sourceDocumentHash: "sha256:doc" }) as never;
const baseCarrossel = () => newWriterDeliverable("carousel",
  { documentId: "doc-1", title: "T", sourceDocumentHash: "sha256:doc" }) as never;

/** Gerador determinístico: o teste não deve depender de sorteio para provar unicidade. */
const contador = () => { let n = 0; return () => `id-${++n}`; };

/* ======================= COMPORTAMENTAL ======================= */

test("01 · o artigo só entra como fonte quando está aprovado", () => {
  const blocos = [
    { type: "heading", level: 2, text: "Como limpar" },
    { type: "paragraph", text: "Use sabonete suave." },
    { type: "list", ordered: false, items: ["manhã", "noite"] },
    { type: "quote", text: "menos é mais", sourceId: null },
    { type: "image_brief", objective: "x", format: "y", requiredElements: [] },
  ];

  const aprovado = finalArticleText(documento("aprovado", blocos));
  assert.ok(aprovado);
  assert.match(aprovado, /## Como limpar/);
  assert.match(aprovado, /Use sabonete suave\./);
  assert.match(aprovado, /- manhã/);
  assert.match(aprovado, /> menos é mais/);
  /* Bloco sem texto narrativo não vira linha vazia no prompt. */
  assert.doesNotMatch(aprovado, /image_brief/);

  /*
   * Artigo em escrita é material instável: semear com ele e refinalizá-lo depois
   * deixaria o derivado citando uma versão que não existe mais.
   */
  for (const status of ["planejado", "escrevendo", "em_revisao"]) {
    assert.equal(finalArticleText(documento(status, blocos)), null, status);
  }
  assert.equal(finalArticleText(null), null);
  assert.equal(finalArticleText(documento("aprovado", [])), null, "artigo aprovado e vazio não é fonte");
});

test("02 · o contexto carrega o que o enunciado pede", () => {
  const linhas = seedContextLines(fonteSemente()).join("\n");

  assert.match(linhas, /Skincare para pele oleosa/);
  assert.match(linhas, /Recomendação editorial do Radar/);
  assert.match(linhas, /Artigo — cobrir o tema — razão: a SERP é informacional/);
  assert.match(linhas, /YouTube \(primária\): 4 consulta\(s\), 38 item\(ns\)/);
  assert.match(linhas, /38 vídeo\(s\) comparáveis, 26 long-form e 12 shorts/);
  assert.match(linhas, /ninguém fala de sabonete/);         // lacunas
  assert.match(linhas, /Formato vencedor: tutorial de rotina/);
  assert.match(linhas, /Cruzamento de SERPs: vídeo na SERP \(3\)/);
  assert.match(linhas, /Precisa responder:/);
  assert.match(linhas, /Precisa cobrir:/);
  assert.match(linhas, /Limitações declaradas/);
  assert.match(linhas, /amostra de 10 páginas/);
  assert.match(linhas, /O Redator NÃO pode:/);
  assert.match(linhas, /trocar a keyword principal/);
});

test("03 · evidência individual não entra: a fonte é a projeção agregada", () => {
  /*
   * A regra do enunciado — não incorporar automaticamente o texto integral de
   * vídeos/transcrições não selecionados — é cumprida por CONSTRUÇÃO: o contexto
   * é montado a partir de `RadarFoundations`, que só tem conclusões agregadas.
   *
   * Este teste prova que a assinatura do construtor não abre porta para o bundle
   * bruto: um campo extra jogado no objeto não aparece no contexto.
   */
  const comLixo = fundamentos({
    transcripts: ["transcrição integral do vídeo 1"],
    bundle: { raw: "payload inteiro do Radar" },
  } as unknown as Partial<RadarFoundations>);

  const linhas = seedContextLines({ title: "T", foundations: comLixo, finalArticle: null }).join("\n");
  assert.doesNotMatch(linhas, /transcrição integral/);
  assert.doesNotMatch(linhas, /payload inteiro do Radar/);
});

test("04 · o artigo finalizado entra como fonte adicional, e só quando existe", () => {
  const sem = seedContextLines(fonteSemente()).join("\n");
  assert.doesNotMatch(sem, /fonte narrativa adicional/);

  const com = seedContextLines(fonteSemente({ finalArticle: "## Título\nCorpo do artigo." })).join("\n");
  assert.match(com, /Artigo canônico já finalizado \(fonte narrativa adicional\)/);
  assert.match(com, /Corpo do artigo\./);
});

test("05 · roteiro e carrossel são gerações independentes", () => {
  const source = fonteSemente();
  const roteiro = buildScriptSeedPrompt(source);
  const carrossel = buildCarouselSeedPrompt(source);

  assert.notEqual(roteiro, carrossel, "dois pedidos diferentes, não um derivado do outro");
  assert.match(roteiro, /cenas/);
  assert.match(carrossel, /slides/);
  assert.notEqual(SCRIPT_SEED_SYSTEM_PROMPT, CAROUSEL_SEED_SYSTEM_PROMPT);
  assert.match(CAROUSEL_SEED_SYSTEM_PROMPT, /não é roteiro fatiado/);

  /* Os dois carregam o contexto inteiro. */
  for (const prompt of [roteiro, carrossel]) {
    assert.match(prompt, /=== CONTEXTO ===/);
    assert.match(prompt, /O Redator NÃO pode:/);
  }
  /* E os dois proíbem inventar. */
  for (const system of [SCRIPT_SEED_SYSTEM_PROMPT, CAROUSEL_SEED_SYSTEM_PROMPT]) {
    assert.match(system, /Não invente/);
    assert.match(system, /Não atribua fala a nenhum vídeo, canal ou página específicos/);
  }

  /*
   * ===== O ENVELOPE PRECISA ESTAR ESCRITO NO PROMPT =====
   *
   * A camada compartilhada envia `response_format: json_object`, e a API recusa
   * com HTTP 400 quando a palavra "json" não aparece em nenhuma mensagem. A
   * primeira chamada real morreu exatamente assim, e nenhum teste pegou: o
   * schema do Zod valida a RESPOSTA e nunca é enviado ao provider.
   */
  for (const system of [SCRIPT_SEED_SYSTEM_PROMPT, CAROUSEL_SEED_SYSTEM_PROMPT]) {
    assert.match(system, /JSON/, "sem a palavra JSON o provider recusa o pedido");
  }
  /* E as chaves pedidas são as do contrato — nem a mais, nem com outro nome. */
  for (const chave of ["objective", "audience", "channel", "openingHook", "closingCta", "notes",
    "scenes", "title", "durationSeconds", "narration", "onScreenText", "visualDirection", "technicalDirection"]) {
    assert.ok(SCRIPT_SEED_SYSTEM_PROMPT.includes(chave), `o roteiro precisa pedir ${chave}`);
  }
  for (const chave of ["objective", "audience", "channel", "caption", "closingCta", "notes", "slides", "heading", "body"]) {
    assert.ok(CAROUSEL_SEED_SYSTEM_PROMPT.includes(chave), `o carrossel precisa pedir ${chave}`);
  }
});

test("06 · a recomendação ARTICLE não impede nenhum dos dois formatos", () => {
  const source = fonteSemente();
  assert.equal(source.foundations.recommendations[0]?.output, "ARTICLE");

  /* Os dois prompts são montados normalmente, e a recomendação aparece como recomendação. */
  for (const prompt of [buildScriptSeedPrompt(source), buildCarouselSeedPrompt(source)]) {
    assert.match(prompt, /recomendação, não obrigação/);
  }

  /* E o módulo não expõe nenhuma função que decida se pode gerar. */
  assert.doesNotMatch(SCRIPT_SEED_SYSTEM_PROMPT + CAROUSEL_SEED_SYSTEM_PROMPT, /somente artigo|apenas artigo/i);
});

test("07 · o que o modelo pode devolver é um subconjunto do contrato", () => {
  /* Identidade e proveniência não são do modelo. */
  for (const schema of [ProviderScriptSeedSchema, ProviderCarouselSeedSchema]) {
    const comIdentidade = schema.safeParse({
      scenes: [{ narration: "x" }], slides: [{ heading: "x" }],
      sourceDocumentHash: "sha256:forjado",
    });
    assert.equal(comIdentidade.success, false, "campo fora do contrato é recusado");
  }

  /* Campos ausentes viram vazio, não erro: um modelo econômico ainda produz rascunho. */
  const roteiro = ProviderScriptSeedSchema.parse({ scenes: [{ narration: "fala" }] });
  assert.equal(roteiro.scenes[0]?.onScreenText, "");
  assert.equal(roteiro.scenes[0]?.durationSeconds, 0);
  assert.deepEqual(roteiro.notes, []);

  const carrossel = ProviderCarouselSeedSchema.parse({ slides: [{ heading: "t" }] });
  assert.equal(carrossel.slides[0]?.body, "");

  /* Sem nenhuma parte não há rascunho. */
  assert.equal(ProviderScriptSeedSchema.safeParse({ scenes: [] }).success, false);
  assert.equal(ProviderCarouselSeedSchema.safeParse({ slides: [] }).success, false);
});

test("08 · o roteiro gerado satisfaz o contrato atual, sem campo novo", () => {
  const seed = ProviderScriptSeedSchema.parse({
    objective: "explicar a rotina", audience: "pele oleosa", channel: "YouTube",
    openingHook: "o erro mais comum", closingCta: "salve este vídeo", notes: ["revisar duração"],
    scenes: [
      { title: "Abertura", durationSeconds: 15, narration: "a", onScreenText: "b", visualDirection: "c", technicalDirection: "d" },
      { title: "Meio", durationSeconds: 45, narration: "e" },
    ],
  });
  const payload = scriptPayloadFromSeed({ base: baseRoteiro(), seed, novoId: contador() });

  /* O contrato real valida — é ele, não uma cópia, que decide. */
  const validado = VideoScriptPayloadSchema.parse(payload);
  assert.equal(validado.scenes.length, 2);
  assert.deepEqual(validado.scenes.map(cena => cena.id), ["id-1", "id-2"]);
  assert.deepEqual(validado.scenes.map(cena => cena.order), [0, 1]);
  assert.equal(validado.openingHook, "o erro mais comum");
  assert.equal(validado.closingCta, "salve este vídeo");
  assert.equal(validado.scenes[0]?.onScreenText, "b");
  assert.equal(validado.scenes[0]?.technicalDirection, "d");

  /* A duração total é a soma — dois números que discordam viram bug de leitura. */
  assert.equal(validado.durationSeconds, 60);

  /* Âncora e proveniência ficam com o servidor, não com o modelo. */
  assert.equal(validado.sourceDocumentHash, "sha256:doc");
  assert.equal(validado.scenes[0]?.storyboard, null);
  assert.deepEqual(validado.scenes[0]?.sourceRefs, []);
});

test("09 · o carrossel gerado satisfaz o contrato atual", () => {
  const seed = ProviderCarouselSeedSchema.parse({
    objective: "o", audience: "a", channel: "Instagram", caption: "legenda", closingCta: "cta",
    slides: [{ heading: "Um", body: "x" }, { heading: "Dois", body: "y" }, { heading: "Três", body: "z" }],
  });
  const payload = carouselPayloadFromSeed({ base: baseCarrossel(), seed, novoId: contador() });

  const validado = CarouselPayloadSchema.parse(payload);
  assert.equal(validado.slides.length, 3);
  assert.deepEqual(validado.slides.map(slide => slide.id), ["id-1", "id-2", "id-3"]);
  assert.deepEqual(validado.slides.map(slide => slide.order), [0, 1, 2]);
  assert.equal(validado.caption, "legenda");
  assert.equal(validado.slides[0]?.visual, null);
  assert.deepEqual(validado.slides[0]?.sourceRefs, []);
  assert.equal(validado.sourceDocumentHash, "sha256:doc");
});

test("10 · o dossiê NÃO é copiado para dentro do entregável", () => {
  const seed = ProviderScriptSeedSchema.parse({ scenes: [{ narration: "fala" }] });
  const payload = scriptPayloadFromSeed({ base: baseRoteiro(), seed, novoId: contador() });
  const serializado = JSON.stringify(payload);

  /*
   * O contrato é `.strict()`, então uma chave de dossiê nem passaria no parse.
   * Esta asserção guarda a outra metade: nenhum CONTEÚDO do dossiê viaja escondido
   * dentro de um campo de texto do entregável.
   */
  for (const marca of ["bundleId", "bundleHash", "importedContext", "dossier", "competitiveBlueprint", "writerMayNot"]) {
    assert.doesNotMatch(serializado, new RegExp(marca), `${marca} não pode viajar no payload`);
  }
});

test("11 · semear não sobrescreve trabalho existente", () => {
  const vazio = newWriterDeliverable("video_script", { documentId: "d", title: "T", sourceDocumentHash: "h" });
  assert.equal(deliverableHasWork(vazio), false);
  assert.equal(deliverableHasWork(null), false);

  const seed = ProviderScriptSeedSchema.parse({ scenes: [{ narration: "fala" }] });
  assert.equal(deliverableHasWork(scriptPayloadFromSeed({ base: baseRoteiro(), seed, novoId: contador() })), true);

  /* Texto sem cena também é trabalho. */
  assert.equal(deliverableHasWork({ ...vazio, openingHook: "escrevi isto" } as never), true);

  const carrosselVazio = newWriterDeliverable("carousel", { documentId: "d", title: "T", sourceDocumentHash: "h" });
  assert.equal(deliverableHasWork(carrosselVazio), false);
  assert.equal(deliverableHasWork({ ...carrosselVazio, caption: "legenda" } as never), true);
});

/* ======================= ESTRUTURAL ======================= */

test("12 · ESTRUTURAL · a rota reusa o caminho canônico de IA e não grava", async () => {
  const src = semComentarios(await fonte(ROTA));

  /* O mesmo par que `/api/redator/section` usa. Nada de cliente de IA novo. */
  assert.match(src, /resolveDeepSeekCanonicalConfig\(\{/);
  assert.match(src, /generateStructuredAI\(\{/);

  /*
   * ESTA é a asserção que guarda o lifecycle: a rota de semeadura não pode
   * escrever. Quem grava é o PUT que já existe, e ele grava RASCUNHO.
   */
  for (const proibido of ["saveWriterDeliverable", "finalizeWriterDeliverable", "writer_deliverable_versions", "purge_after"]) {
    assert.ok(!src.includes(proibido), `a semeadura não pode chamar ${proibido}`);
  }

  /* Permissão de EDIÇÃO, não de leitura: o resultado vira rascunho gravado. */
  assert.match(src, /assertEditorialPermission\(profile, input\.brandId, "redator", "edit"\)/);

  /* Sem Connection válida, o motivo real sobe — nada de conteúdo fictício. */
  assert.match(src, /error instanceof DeepSeekCanonicalError/);
  assert.match(src, /status: error\.status/);

  /* O contrato real valida a saída antes de devolver. */
  assert.match(src, /VideoScriptPayloadSchema\.parse\(/);
  assert.match(src, /CarouselPayloadSchema\.parse\(/);

  /* Sem dossiê não há o que semear, e isso é recusa explícita. */
  assert.match(src, /if \(!foundations\)/);
});

test("13 · ESTRUTURAL · a tela oferece as duas saídas e impede duplo clique", async () => {
  const src = semComentarios(await fonte(TELA));

  assert.match(src, /data-semear/);
  assert.match(src, /Criar \$\{ehRoteiro \? "roteiro" : "carrossel"\} a partir deste contexto/);
  assert.match(src, /Começar manualmente/);
  assert.match(src, /data-contexto-disponivel/);
  assert.match(src, /Contexto do Radar disponível/);

  /* O botão de semear só existe com dossiê. */
  assert.match(src, /\{temDossie && </);

  /* Duplo clique: o handler recusa e o botão desabilita. */
  assert.match(src, /if \(!brandId \|\| !documentId \|\| busy\) return;/);
  assert.equal(src.split("disabled={finalizado || busy}").length - 1, 2,
    "os dois botões do estado vazio desabilitam durante a ação");

  /* E o rótulo em curso vem da mesma tabela das outras ações. */
  assert.match(src, /actionButtonLabel\(\{ action: ehRoteiro \? "semear_roteiro" : "semear_carrossel"/);
});

test("14 · ESTRUTURAL · a gravação continua sendo uma só, e é rascunho", async () => {
  const src = semComentarios(await fonte(TELA));

  /* A semeadura chama a rota de proposta e depois o MESMO save das outras edições. */
  assert.match(src, /fetch\("\/api\/redator\/seed", \{ method: "POST"/);
  assert.match(src, /await save\(proposto\.data, roteiro/);

  /* Nenhuma escrita paralela: um único PUT em toda a tela. */
  assert.equal(src.split('method: "PUT"').length - 1, 1, "há um único caminho de gravação de rascunho");

  /* Falha na geração não grava nada — o retorno acontece antes do save. */
  const bloco = src.slice(src.indexOf("const semear"), src.indexOf("const acao"));
  assert.ok(bloco.indexOf("setMessage(falha.mensagem)") < bloco.indexOf("await save("),
    "a recusa precisa retornar antes de qualquer gravação");

  /*
   * A mensagem de recusa sozinha não prova nada: um mutante que remove o
   * `safeParse` mantém o texto no arquivo e passaria. O que precisa ser
   * afirmado é que a saída do modelo É VALIDADA, e contra o contrato real.
   */
  assert.match(bloco, /WriterDeliverablePayloadSchema\.safeParse\(body\?\.payload\)/);
  assert.ok(bloco.indexOf("safeParse") < bloco.indexOf("await save("),
    "a validação vem antes da gravação");
  assert.match(bloco, /O modelo devolveu um entregável fora do contrato\. Nada foi gravado\./);

  /* As mensagens de sucesso são as do enunciado. */
  assert.match(src, /Roteiro criado a partir dos Fundamentos do Radar\./);
  assert.match(src, /Carrossel criado a partir dos Fundamentos do Radar\./);
});
