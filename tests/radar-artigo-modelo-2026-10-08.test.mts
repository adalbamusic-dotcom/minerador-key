import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  RADAR_ARTICLE_BLUEPRINT_RULES_VERSION,
  RadarArticleBlueprintAiSchema,
  buildRadarArticleBlueprintBrief,
  radarApplyArticleBlueprintEdit,
  radarArticleBlueprintColumns,
  radarArticleBlueprintParagraphPlan,
  radarArticleBlueprintPayloadToStore,
  radarArticleBlueprintPendingNotes,
  radarArticleBlueprintPrompt,
  radarArticleBlueprintPublishedMapLine,
  radarArticleBlueprintPublishedMapReading,
  radarArticleBlueprintPublishedStructureOf,
  radarArticleBlueprintRepeatedScenes,
  radarArticleBlueprintRulesOutdated,
  radarArticleBlueprintWithCurrentNames,
  radarCurrentProductNames,
  radarSanitizeArticleBlueprint,
  type RadarArticleBlueprintBrief,
  type RadarArticleBlueprintPayload,
} from "../lib/radar/article-blueprint.ts";
import { radarArticleBlueprintWithPublishedStructure } from "../lib/server/radar-article-blueprint.ts";
import { readApprovedRadarArticleBlueprints, readRadarArticleBlueprintsForExport } from "../lib/server/radar-article-blueprint-read.ts";
import { RadarArticleBlueprintRulesNotice } from "../modules/radar/radar-article-blueprint-panel.tsx";
import { writerArticleBlueprintFoundation } from "../lib/redator/writer-evidence-catalog.ts";
import type { RadarWritingPublication } from "../lib/radar/portable-writing-export.ts";
import { ARTIGO, entradaGoogle, planoDoSilo } from "./radar-portable-writing-fixtures.mts";

/*
 * ===== 2026-10-08 · O GERADOR DO ARTIGO-MODELO DEPOIS DA REVISÃO DOS ENTREGÁVEIS =====
 *
 * A revisão dos CSVs reais de 08/10 (artigo "como atrair clientes pelo
 * instagram", publicado em /instagram-nao-traz-pacientes) achou o que a planta
 * deixava passar. Prova-se aqui, sem IA, sem banco e sem rede:
 *
 *   - B1 · a IA vê a página publicada (o MESMO leitor do export; falha e tempo
 *     seguem sem ela) e devolve o mapa da atualização; a conferência fecha o
 *     mapa (nada sai sem decisão) e a leitura vale para planta antiga;
 *   - B2 · a busca "como …" pede a 1ª seção prática;
 *   - B3 · toda afirmação absoluta vira nota; a régua por sentido do Grupo A
 *     aponta conversão e comportamento sem fonte; a tese que nega passa;
 *   - B4 · "Google Meu Negócio" vira "Perfil da Empresa no Google" (na
 *     conferência e na leitura do antigo), sem tocar a keyword;
 *   - B5 · a mesma cena em duas imagens; B6 · o ângulo que costura temas;
 *   - B7 · a versão das regras e o aviso da tela; B8 · parágrafos coerentes
 *     com a faixa de palavras e a contagem que concorda.
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

const D10 = /pend[eê]ncia|pendente de|aguardando aprova|confira antes de aprovar|rascunho|fonte a obter|preencher/i;

const esqueleto = (id: string, heading: string) => ({
  id, level: 2 as const, parent: null, heading, readerQuestion: null, cover: [], mustCover: false, needsSource: false, needsSpecialist: false, outOfScope: false,
});

/* O caso real de 08/10, inventado à imagem dele: Instagram, clínicas, página publicada. */
function pacote(patch: Partial<RadarArticleBlueprintBrief> = {}): RadarArticleBlueprintBrief {
  return {
    article: {
      principal: "como atrair clientes pelo instagram",
      complementary: [{ keyword: "instagram não traz pacientes", role: "complementar", volume: 30 }],
      subject: null, intent: "Informacional", funnel: "Topo", siloRole: "Suporte",
      audience: null, promise: null,
      slug: "instagram-nao-traz-pacientes", publishedUrl: "https://exemplo.com.br/leads-sem-trafego-pago/instagram-nao-traz-pacientes",
      mustCover: [], unit: { type: "article", label: "Artigo", format: null },
    },
    silo: null,
    skeleton: [esqueleto("M1", "Bio do perfil para atrair clientes"), esqueleto("M2", "Stories para atrair clientes")],
    skeletonFrame: { workingTitle: null, promise: null, closing: null },
    evidence: [
      { id: "S1", kind: "resultado orgânico", text: "Guia de como atrair clientes no Instagram · https://www.nextar.com.br/blog/guia" },
      { id: "P1", kind: "pergunta da amostra", text: "Como atrair clientes pelo Instagram? (4 de 6 páginas)" },
      { id: "G1", kind: "lacuna", text: "localização no perfil (1 de 6 páginas cobrem)" },
    ],
    linkCandidates: [{ id: "K1", label: "captação de pacientes", role: "Pilar", destination: "/captacao", status: "PLANNED", fromGraph: true }],
    graphLinks: [], sources: [], unsupportedClaims: [], specialist: [], videos: [],
    outOfScope: [], competitorTitles: [],
    measures: { comparablePages: 0, words: { median: null, p25: null, p75: null }, h2: null, h3: null, paragraphs: null, images: null, lists: null },
    authors: [],
    brandVoice: null,
    ...patch,
  };
}

const secao = (h2: string, extra: Record<string, unknown> = {}) => ({ h2, readerQuestion: `${h2}?`, answerFirst: "Resposta direta.", from: ["M1"], ...extra });

function resposta(patch: Record<string, unknown> = {}) {
  return {
    keywordPlan: { reading: "A principal no H1." },
    reader: "Profissional de clínica.", promise: "Um perfil que leva ao contato.", angle: { statement: "Um checklist de diagnóstico do perfil, com exemplo comentado.", evidence: ["G1"] },
    title: { h1: "Como atrair clientes pelo Instagram", seoTitle: "Como atrair clientes pelo Instagram", metaDescription: "O que fazer no perfil." },
    opening: { readerQuestion: "Como atrair clientes pelo Instagram?", direction: "Responder direto.", evidence: ["P1"] },
    sections: [
      secao("Otimize a bio do perfil para atrair clientes"),
      secao("Use os Stories para atrair clientes", { from: ["M2"] }),
      secao("Leve o seguidor ao contato", { from: ["M1"] }),
    ],
    closing: { turn: "O Instagram, sozinho, não enche a agenda.", cta: "Conheça o serviço." },
    visual: [
      { slot: "CAPA", prompt: "consultório organizado com agenda de papel, 16:9" },
      { slot: "R1", section: "Otimize a bio do perfil para atrair clientes", prompt: "perfil genérico com botão de contato, sem texto legível" },
      { slot: "R2", section: "Use os Stories para atrair clientes", prompt: "bastidores de uma recepção, sem pessoas" },
    ],
    ...patch,
  };
}

const organizar = (ia: Record<string, unknown>, brief: RadarArticleBlueprintBrief = pacote(), opcoes: { close?: boolean } = {}) =>
  radarSanitizeArticleBlueprint(RadarArticleBlueprintAiSchema.parse(ia), brief, opcoes);

const publicada = (h2: string[], extra: Partial<RadarWritingPublication> = {}): RadarWritingPublication => ({
  published: true,
  publishedUrl: "https://exemplo.com.br/leads-sem-trafego-pago/instagram-nao-traz-pacientes",
  canonical: null,
  slug: "instagram-nao-traz-pacientes",
  principalPolicy: null,
  currentStructure: { h1: "Instagram não traz pacientes", h2, updatedAt: null },
  ...extra,
});

/* ============================== B1 · a página publicada ============================== */

test("B1 · a estrutura publicada vai à IA: só de artigo publicado, sem FAQ legado nem repetição; o pedido traz a página e pede o mapa", () => {
  const silo = planoDoSilo().files[0].writing!;
  const pagina = publicada(["O erro geográfico que quase ninguém fala", "Perguntas frequentes", "O erro geográfico que quase ninguém fala", "Como otimizar o perfil"]);
  const brief = buildRadarArticleBlueprintBrief({ entrada: entradaGoogle(), silo, articleId: ARTIGO, publication: pagina });
  assert.deepEqual(brief.publishedStructure, { h1: "Instagram não traz pacientes", h2: ["O erro geográfico que quase ninguém fala", "Como otimizar o perfil"] });
  const { system, user } = radarArticleBlueprintPrompt(brief);
  assert.match(user, /^# Página publicada atual \(a planta é a atualização dela; devolva publishedMap com todos os H2 atuais\)\nH1 atual: Instagram não traz pacientes\nH2 atual 1: O erro geográfico que quase ninguém fala\nH2 atual 2: Como otimizar o perfil$/m);
  assert.match(system, /21\. PÁGINA PUBLICADA \(é atualização\)[^\n]*a amostra NÃO cobre é diferencial dela: fica na planta/);
  assert.match(user, /"publishedMap":\[\{"current":"H2 atual, como está","section":1,"reason":""\}\]/);

  /* Sem página lida, nem não publicado: o pedido é o de antes. */
  for (const publicacao of [null, publicada(["X"], { published: false }), publicada(["X"], { currentStructure: null }), publicada(["X"], { publishedUrl: null })]) {
    const semPagina = buildRadarArticleBlueprintBrief({ entrada: entradaGoogle(), silo, articleId: ARTIGO, publication: publicacao });
    assert.equal("publishedStructure" in semPagina, false);
    const pedido = radarArticleBlueprintPrompt(semPagina);
    assert.doesNotMatch(pedido.user, /Página publicada atual|publishedMap/);
    assert.doesNotMatch(pedido.system, /21\. PÁGINA PUBLICADA/);
  }
  assert.equal(radarArticleBlueprintPublishedStructureOf(publicada(["Perguntas frequentes"], { currentStructure: { h1: null, h2: ["Perguntas frequentes"], updatedAt: null } })), null, "só FAQ legado: nada a mapear");
});

test("B1 · a geração lê a página com o leitor injetado: falha, tempo e página vazia seguem sem ela; não publicado e já lido não leem", async () => {
  const lidas: string[] = [];
  const leitor = async (url: string) => { lidas.push(url); return { h1: "H1 lido", h2: ["Um H2 lido"] }; };
  const base = publicada([], { currentStructure: null });
  const comPagina = await radarArticleBlueprintWithPublishedStructure(base, leitor);
  assert.deepEqual(comPagina?.currentStructure, { h1: "H1 lido", h2: ["Um H2 lido"], updatedAt: null });
  assert.deepEqual(lidas, [base.publishedUrl]);
  assert.equal(base.currentStructure, null, "a publicação de entrada não muda");

  assert.equal(await radarArticleBlueprintWithPublishedStructure(base, async () => { throw new Error("403"); }), base, "falha: segue sem ela");
  assert.equal(await radarArticleBlueprintWithPublishedStructure(base, async () => ({ h1: null, h2: [] })), base, "página sem H1 nem H2: segue sem ela");
  const lento = (url: string) => new Promise<{ h1: string; h2: string[] }>(resolve => setTimeout(() => resolve({ h1: url, h2: [] }), 300));
  const inicio = Date.now();
  assert.equal(await radarArticleBlueprintWithPublishedStructure(base, lento, 20), base, "tempo esgotado: segue sem ela");
  assert.ok(Date.now() - inicio < 250, "o tempo limite corta a espera");

  const leiturasIndevidas: string[] = [];
  const naoLe = async (url: string) => { leiturasIndevidas.push(url); return { h1: "não devia ler", h2: [] }; };
  const naoPublicada = publicada([], { published: false, currentStructure: null });
  assert.equal(await radarArticleBlueprintWithPublishedStructure(naoPublicada, naoLe), naoPublicada, "não publicado: não lê");
  const jaLida = publicada(["Já lido"]);
  assert.equal(await radarArticleBlueprintWithPublishedStructure(jaLida, naoLe), jaLida, "já lida: não lê de novo");
  assert.equal((await radarArticleBlueprintWithPublishedStructure(publicada([], { publishedUrl: null, currentStructure: null }), naoLe))?.currentStructure, null, "sem URL: não lê");
  assert.equal(await radarArticleBlueprintWithPublishedStructure(null, naoLe), null);
  assert.deepEqual(leiturasIndevidas, []);

  /* O servidor usa o MESMO leitor do export, depois do reaproveitamento (reaproveitar não lê) e antes do pedido. */
  const servidor = (await readFile(new URL("../lib/server/radar-article-blueprint.ts", import.meta.url), "utf8")).replace(/\r\n/g, "\n");
  assert.match(servidor, /import \{ assembleRadarPortableExport, radarReadPublishedStructure \} from "@\/lib\/server\/radar-portable-export-core";/);
  const corpo = servidor.slice(servidor.indexOf("export async function generateRadarArticleBlueprint"));
  const reaproveita = corpo.indexOf("if (input.ifMissing)");
  const le = corpo.indexOf("radarArticleBlueprintWithPublishedStructure(semPagina, input.readPublishedStructure ?? radarReadPublishedStructure)");
  const pede = corpo.indexOf("buildRadarArticleBlueprintBrief(");
  assert.ok(reaproveita > 0 && le > reaproveita && pede > le, "reaproveitar → ler a página → montar o pedido");
  assert.match(corpo, /publication: publicacao,/);
});

test("B1 · o esquema aceita as formas do mapa; payload sem mapa continua sem mapa", () => {
  const lido = RadarArticleBlueprintAiSchema.parse(resposta({
    publishedMap: [
      { current: "A", section: "Seção 2", reason: "vira a 2" },
      { current: "B", section: null, reason: "fora do escopo" },
      { current: "C", section: "sai" },
      { current: "D", section: "depois" },
      { current: "E", section: 2.4, origin: "inventada" },
      { current: "F", reason: "sem número nenhum" },
      { section: 1 },
    ],
  }));
  assert.deepEqual(lido.publishedMap?.map(item => [item.current, item.section]), [["A", 2], ["B", null], ["C", null], ["D", 0], ["E", 2], ["F", 0]], "sair pede null dito; o campo ausente é índice inválido");
  assert.equal(lido.publishedMap?.[4].origin, undefined, "a origem não vem da IA");
  assert.equal(RadarArticleBlueprintAiSchema.parse(resposta()).publishedMap, undefined);
});

/* A planta da IA com uma FAQ na frente (sai) e o mapa com cada forma de erro. */
function comPaginaPublicada() {
  const brief = pacote({ publishedStructure: { h1: "Instagram não traz pacientes", h2: ["O erro geográfico que quase ninguém fala", "Como otimizar o perfil do Instagram", "Stories que geram confiança", "Assunto sem par nenhum aqui", "Conclusão"] } });
  const ia = resposta({
    sections: [
      secao("Perguntas frequentes"),
      secao("Otimize seu perfil com bio clara"),
      secao("Erro geográfico: o que quase ninguém comenta", { from: ["M1"] }),
      secao("Use Stories para gerar confiança", { from: ["M2"] }),
    ],
    publishedMap: [
      { current: "O erro geográfico que quase ninguém fala", section: 3, reason: "o diferencial da página" },
      { current: "Como otimizar o perfil do Instagram", section: 9 },
      { current: "Assunto sem par nenhum aqui", section: null, reason: "" },
      { current: "Conclusão", section: null, reason: "vira o fechamento" },
      { current: "Um H2 que a página não tem", section: 1 },
    ],
  });
  return { brief, ia };
}

test("B1 · a conferência fecha o mapa: número na ordem da planta; inválido e omitido casados pelo título; sem par fica — nada sai sem decisão", () => {
  const { brief, ia } = comPaginaPublicada();
  const { payload, notes } = organizar(ia, brief);
  assert.deepEqual(payload.blueprint.sections.map(item => item.h2), ["Otimize seu perfil com bio clara", "Erro geográfico: o que quase ninguém comenta", "Use Stories para gerar confiança"], "a FAQ saiu");
  assert.deepEqual(payload.blueprint.publishedMap, [
    { current: "O erro geográfico que quase ninguém fala", section: 2, reason: "o diferencial da página", origin: "ai" },
    { current: "Como otimizar o perfil do Instagram", section: 1, reason: "", origin: "match" },
    { current: "Stories que geram confiança", section: 3, reason: "", origin: "match" },
    { current: "Assunto sem par nenhum aqui", section: null, reason: "", origin: "match" },
    { current: "Conclusão", section: null, reason: "vira o fechamento", origin: "ai" },
  ]);
  assert.ok(notes.includes("Mapa da página publicada: o H2 atual \"Como otimizar o perfil do Instagram\" veio com índice de seção inválido (9); casado pelo título com a seção 1 (\"Otimize seu perfil com bio clara\")."));
  assert.ok(notes.some(nota => /"Stories que geram confiança" ficou fora do mapa da IA; casado pelo título com a seção 3/.test(nota)));
  assert.ok(notes.some(nota => /1 item\(ns\) da IA que não são H2 da página ignorado/.test(nota)));
  const semPar = notes.find(nota => /"Assunto sem par nenhum aqui" veio para sair sem motivo e não tem par na planta/.test(nota));
  assert.ok(semPar && radarArticleBlueprintPendingNotes([semPar]).pending.length === 1, "sem par: vai à passada de correção");
  assert.equal(radarArticleBlueprintPendingNotes(notes.filter(nota => /casado pelo título|ignorado/.test(nota))).pending.length, 0, "o que a conferência já casou não pede correção");
  assert.deepEqual(payload.publishedStructure, brief.publishedStructure);

  /* Fechando (D10): o sem par fica como seção própria, e a nota não pede nada. */
  const fechada = organizar(ia, brief, { close: true });
  const fica = fechada.notes.find(nota => /"Assunto sem par nenhum aqui"/.test(nota))!;
  assert.match(fica, /fica como seção própria, reescrita na voz \(nada sai da página sem decisão\)\.$/);
  assert.equal(radarArticleBlueprintPendingNotes([fica]).pending.length, 0);

  /* Sem página lida, a planta não leva mapa — mesmo que a IA mande um. */
  const semPagina = organizar(ia, pacote());
  assert.equal("publishedMap" in semPagina.payload.blueprint, false);
  assert.equal("publishedStructure" in semPagina.payload, false);
});

test("B1 · a leitura do mapa: a planta nova pelo mapa, a antiga pelo título; FAQ legado fora; o sem par fica depois da última absorvida", () => {
  const { brief, ia } = comPaginaPublicada();
  const { payload } = organizar(ia, brief);
  const lido = radarArticleBlueprintPublishedMapReading(payload);
  assert.deepEqual(lido.map(item => [item.kind, item.section, item.after, item.origin]), [
    ["ABSORBED", 2, null, "ai"],
    ["ABSORBED", 1, null, "match"],
    ["ABSORBED", 3, null, "match"],
    ["KEEP", null, 3, "match"],
    ["REMOVED", null, null, "ai"],
  ]);
  const linhas = lido.map(radarArticleBlueprintPublishedMapLine);
  assert.equal(linhas[0], "vira a seção 2 (\"Erro geográfico: o que quase ninguém comenta\"), reescrito na voz — o diferencial da página");
  assert.equal(linhas[3], "fica como seção própria, reescrita na voz, depois da seção 3");
  assert.equal(linhas[4], "sai: vira o fechamento (decisão no artigo-modelo)");
  assert.ok(linhas.every(linha => !D10.test(linha)), "frases concluídas (D10)");

  /* Artigo-modelo ANTIGO: sem mapa e sem a página que a IA viu; os H2 vêm da leitura do export. */
  const antigo = { ...payload, blueprint: { ...payload.blueprint } } as RadarArticleBlueprintPayload;
  delete antigo.blueprint.publishedMap;
  delete antigo.publishedStructure;
  assert.deepEqual(radarArticleBlueprintPublishedMapReading(antigo), [], "sem H2 nenhum, nada a mapear");
  const doExport = radarArticleBlueprintPublishedMapReading(antigo, ["Um assunto que a planta não tem", "Perguntas frequentes", "Erro geográfico de quem atende", "Stories com enquetes e caixinhas", "Conclusão", "Outro assunto solto"], { keywords: ["como atrair clientes pelo instagram"] });
  /*
   * 2026-10-08 (correção da revisão) · o sem par ANTES de qualquer absorvida não
   * vai mais "logo depois da abertura" (antes da seção 1, que responde à busca):
   * fica antes da próxima absorvida — aqui, depois da seção 1.
   */
  assert.deepEqual(doExport.map(item => [item.current, item.kind, item.section, item.after]), [
    ["Um assunto que a planta não tem", "KEEP", null, 1],
    ["Erro geográfico de quem atende", "ABSORBED", 2, null],
    ["Stories com enquetes e caixinhas", "KEEP", null, 2],
    ["Conclusão", "CLOSING", null, null],
    ["Outro assunto solto", "KEEP", null, 2],
  ], "FAQ legado não entra no mapa (fica como está, AGENTS §13); uma palavra em comum de três (\"Stories\") não basta para casar");
  assert.equal(radarArticleBlueprintPublishedMapLine(doExport[0]), "fica como seção própria, reescrita na voz, depois da seção 1");
  assert.ok(doExport.every(item => item.origin === "match" && item.kind !== "REMOVED"), "planta antiga: nada sai sem decisão");
  /* Sem nenhuma absorvida, o que fica vai para depois da ÚLTIMA seção da planta, antes do fechamento. */
  const nadaCasa = radarArticleBlueprintPublishedMapReading(antigo, ["Um assunto que a planta não tem", "Outro assunto solto"], { keywords: ["como atrair clientes pelo instagram"] });
  assert.deepEqual(nadaCasa.map(item => [item.kind, item.after]), [["KEEP", antigo.blueprint.sections.length], ["KEEP", antigo.blueprint.sections.length]]);
  /* "Logo depois da abertura" só sobra para planta sem seção. */
  const semSecao = radarArticleBlueprintPublishedMapReading({ ...antigo, blueprint: { ...antigo.blueprint, sections: [] } }, ["Um assunto qualquer"]);
  assert.equal(radarArticleBlueprintPublishedMapLine(semSecao[0]), "fica como seção própria, reescrita na voz, logo depois da abertura");
});

/*
 * 2026-10-08 (correção da revisão) · no caso real, NENHUM H2 publicado casava
 * com a planta antiga: as raízes da complementar ("instagram não traz
 * pacientes") contavam como comuns. Dois caminhos, cada um com o seu teste:
 * só a principal não distingue títulos; e a complementar que a planta põe numa
 * seção leva para ela o H2 publicado que a contém.
 */
test("B1 · planta antiga: só a principal não distingue títulos; a complementar posta numa seção leva o H2 que a contém", () => {
  const secaoDe = (h2: string, readerQuestion: string, h3: string[] = []) => ({ h2, readerQuestion, h3 });
  const keywords = ["como atrair clientes pelo instagram", "instagram não traz pacientes"];
  const pelaRaiz = {
    blueprint: {
      keywordPlan: { complementary: [] },
      sections: [
        secaoDe("O que o Instagram faz bem", "O Instagram serve para atrair clientes?"),
        secaoDe("Instagram não traz pacientes: por que isso acontece?", "Por que meu perfil não converte?"),
        secaoDe("Rotina de stories", "Como manter os stories?"),
      ],
    },
  } as unknown as RadarArticleBlueprintPayload;
  /* A complementar divide "traz" e "pacientes" com a seção 2: casa — antes, com elas nas comuns, ficava sem par. */
  assert.deepEqual(
    radarArticleBlueprintPublishedMapReading(pelaRaiz, ["Instagram não traz pacientes quando a clínica vira refém do engajamento"], { keywords }).map(item => [item.kind, item.section]),
    [["ABSORBED", 2]],
  );
  const pelaColocacao = {
    blueprint: {
      keywordPlan: { complementary: [{ keyword: "agenda vazia", placement: "corpo da seção 2", reason: "" }] },
      sections: [secaoDe("Rotina de stories", "Como manter os stories?"), secaoDe("Por que o perfil não converte?", "O que falta no perfil?"), secaoDe("Medição", "Como medir?")],
    },
  } as unknown as RadarArticleBlueprintPayload;
  /* Nenhuma raiz em comum com a seção 2 — quem decide é a colocação da complementar no plano de keywords. */
  assert.deepEqual(
    radarArticleBlueprintPublishedMapReading(pelaColocacao, ["Agenda vazia mesmo com muitos posts", "Um assunto que não casa"], { keywords: ["como atrair clientes pelo instagram"] }).map(item => [item.kind, item.section, item.after]),
    [["ABSORBED", 2, null], ["KEEP", null, 2]],
  );
});

test("B1 · a edição do dono renumera o mapa; o H2 da seção removida volta ao casamento, nunca 'sai'", () => {
  const { brief, ia } = comPaginaPublicada();
  const { payload } = organizar(ia, brief);
  const editado = radarApplyArticleBlueprintEdit(payload, { sections: [{ index: 0, remove: true }] });
  assert.deepEqual(editado.blueprint.publishedMap?.map(item => [item.current, item.section, item.origin]), [
    ["O erro geográfico que quase ninguém fala", 1, "ai"],
    ["Como otimizar o perfil do Instagram", null, "match"],
    ["Stories que geram confiança", 2, "match"],
    ["Assunto sem par nenhum aqui", null, "match"],
    ["Conclusão", null, "ai"],
  ]);
  assert.equal(radarArticleBlueprintPublishedMapReading(editado).find(item => item.current === "Como otimizar o perfil do Instagram")?.kind, "KEEP");
  assert.equal(payload.blueprint.publishedMap?.[0].section, 2, "a versão de antes não muda");
});

/* ============================== B2 · a abertura responde à busca ============================== */

test("B2 · busca 'como …': o pedido manda a 1ª seção prática; a conferência aponta a seção de diagnóstico na frente", () => {
  const { system } = radarArticleBlueprintPrompt(pacote());
  assert.match(system, /quando ela é 'como …', a 1ª seção já é prática \(o caminho, o primeiro passo\); a tese ou o contraponto da marca vem depois, sem negar o assunto do artigo/);
  const tese = organizar(resposta({ sections: [secao("Por que o Instagram não traz pacientes"), secao("Otimize a bio do perfil"), secao("Use os Stories", { from: ["M2"] })] }));
  const nota = tese.notes.find(item => item.startsWith("A 1ª seção"));
  assert.equal(nota, "A 1ª seção (\"Por que o Instagram não traz pacientes\") abre pelo diagnóstico ou pela tese, mas a busca \"como atrair clientes pelo instagram\" pede o caminho prático: a 1ª seção responde à busca e a tese da marca vem depois — reordene antes de aprovar.");
  assert.equal(radarArticleBlueprintPendingNotes([nota!]).pending.length, 1, "vai à passada de correção");
  const negando = organizar(resposta({ sections: [secao("O Instagram não é vitrine de clínica"), secao("Otimize a bio do perfil"), secao("Use os Stories", { from: ["M2"] })] }));
  assert.ok(negando.notes.some(item => item.startsWith("A 1ª seção")), "a 1ª seção que nega o assunto também");
  const pratica = organizar(resposta({ sections: [secao("Como não errar na bio do Instagram"), secao("Otimize a bio do perfil"), secao("Use os Stories", { from: ["M2"] })] }));
  assert.equal(pratica.notes.some(item => item.startsWith("A 1ª seção")), false, "o 'não' de um H2 prático ('Como não errar…') não é tese nem paga correção");
  assert.equal(organizar(resposta()).notes.some(item => item.startsWith("A 1ª seção")), false, "prática na frente: nada a dizer");
  const outraBusca = pacote({ article: { ...pacote().article, principal: "instagram para clínicas" } });
  assert.equal(organizar(resposta({ title: { h1: "Instagram para clínicas", seoTitle: "Instagram para clínicas", metaDescription: "M." }, sections: [secao("Por que o Instagram não traz pacientes"), secao("Otimize a bio"), secao("Use os Stories", { from: ["M2"] })] }), outraBusca).notes.some(item => item.startsWith("A 1ª seção")), false, "busca que não é 'como …' não pede passo na frente");
});

/* ============================== B3 · as afirmações ============================== */

test("B3 · toda afirmação absoluta vira nota; a régua por sentido aponta conversão e comportamento; a tese que nega passa; a coberta por fonte passa", () => {
  const brief = pacote({ sources: [{ id: "X1", url: "https://fonte.example.org/estudo", title: "Estudo de conversão", claim: "Site otimizado converte visitantes em agendamentos" }] });
  const { notes } = organizar(resposta({
    promise: "Canais que convertem levam o seguidor ao agendamento.",
    sections: [
      secao("Otimize a bio do perfil", { answerFirst: "A bio nunca deve ficar vazia.", explain: ["Primeiro, diga quem você atende.", "Quem chega sempre quer saber o preço."] }),
      secao("Leve o seguidor ao contato", { explain: ["Canais que convertem, como o site e o WhatsApp, recebem o seguidor.", "Pacientes com dor buscam no Google quando precisam.", "O Instagram, sozinho, não enche a agenda."] }),
      secao("Mostre o site no perfil", {
        explain: ["Um site otimizado converte visitantes em agendamentos.", "O algoritmo prioriza vídeos curtos."],
        externalLinks: [{ claim: "Site otimizado converte visitantes em agendamentos", sourceType: "estudo", source: "X1" }, { claim: "O algoritmo prioriza vídeos curtos", sourceType: "fonte oficial", source: null }],
      }),
    ],
  }), brief);
  const absolutas = notes.filter(nota => /^Seção "Otimize a bio do perfil" afirma de forma absoluta/.test(nota));
  assert.equal(absolutas.length, 2, "as duas absolutas da mesma seção, não só a primeira");
  assert.ok(notes.includes("Seção \"Leve o seguidor ao contato\" afirma sem fonte (\"Canais que convertem, como o site e o WhatsApp, recebem o seguidor.\") — afirmação sobre conversão do público: delimite ou sustente com fonte do pacote antes de aprovar."));
  assert.ok(notes.some(nota => /^Seção "Leve o seguidor ao contato" afirma sem fonte \("Pacientes com dor buscam no Google quando precisam\."\) — afirmação sobre comportamento do público/.test(nota)));
  assert.equal(notes.some(nota => /não enche a agenda/.test(nota)), false, "a tese que NEGA o efeito passa");
  assert.equal(notes.some(nota => /Um site otimizado converte/.test(nota)), false, "a frase coberta pela fonte X passa");
  assert.equal(notes.some(nota => /O algoritmo prioriza vídeos curtos/.test(nota)), false, "a frase que a seção já liga a um link externo está declarada");
  assert.ok(notes.some(nota => /^A promessa afirma sem fonte \("Canais que convertem[^"]*"\) — afirmação sobre conversão do público: delimite antes de aprovar — ela vira a premissa/.test(nota)));
  assert.equal(notes.some(nota => /A virada do fechamento/.test(nota)), false, "a tese do dono no fechamento passa");
  const daRegua = notes.filter(nota => /afirma sem fonte|afirma de forma absoluta/.test(nota));
  assert.equal(radarArticleBlueprintPendingNotes(daRegua).pending.length, daRegua.length, "todas vão à passada de correção");

  const { system } = radarArticleBlueprintPrompt(brief);
  assert.match(system, /17\. AFIRMAÇÕES:[^\n]*'canais que convertem'[^\n]*'pacientes procuram no Google, não no Instagram'[^\n]*A tese da marca que NEGA um efeito \('o Instagram, sozinho, não enche a agenda'\) pode ser dita\./);
  assert.doesNotMatch(system.split("\n").find(linha => linha.startsWith("17."))!, /fonte a obter/, "a regra 17 não fala mais em 'fonte a obter'");
});

/* ============================== B4 · os nomes atuais ============================== */

test("B4 · nomes atuais: troca determinística; a keyword e a menção ao nome antigo ficam; o que não é texto da planta não muda", () => {
  assert.equal(radarCurrentProductNames("Cadastre no Google Meu Negócio e revise o google my business."), "Cadastre no Perfil da Empresa no Google e revise o Perfil da Empresa no Google.");
  assert.equal(radarCurrentProductNames("Use o Perfil da Empresa no Google (antigo Google Meu Negócio)."), "Use o Perfil da Empresa no Google (antigo Google Meu Negócio).");
  assert.equal(radarCurrentProductNames("Google Meu Negócio para clínicas", ["google meu negócio para clínicas"]), "Google Meu Negócio para clínicas", "a keyword que traz o nome antigo o preserva");
  assert.equal(radarCurrentProductNames("ferramentas como Google Meu Negocio"), "ferramentas como Perfil da Empresa no Google");

  const { payload, notes } = organizar(resposta({
    sections: [
      secao("Otimize a bio do perfil", { explain: ["Ligue o perfil ao Google Meu Negócio."] }),
      secao("Use os Stories para atrair clientes", { from: ["M2"] }),
      secao("Leve o seguidor ao contato", { practical: "Mostrar o Google My Business ao lado do perfil." }),
    ],
  }), pacote({ publishedStructure: { h1: null, h2: ["Cadastre-se no Google Meu Negócio"] } }));
  assert.equal(payload.blueprint.sections[0].explain[0], "Ligue o perfil ao Perfil da Empresa no Google.");
  assert.equal(payload.blueprint.sections[2].practical, "Mostrar o Perfil da Empresa no Google ao lado do perfil.");
  assert.equal(payload.blueprint.publishedMap?.[0].current, "Cadastre-se no Google Meu Negócio", "o H2 atual é identidade da página: não muda");
  assert.ok(notes.includes("Nomes atuais: o nome antigo do produto (Google Meu Negócio ou Google My Business) virou \"Perfil da Empresa no Google\" na planta."));
  assert.equal(radarArticleBlueprintPendingNotes(notes.filter(nota => nota.startsWith("Nomes atuais"))).pending.length, 0, "é correção feita, não pendência");

  /* O artigo-modelo antigo, lido para o export: a planta muda; evidência, fonte e destino não. */
  const antigo = organizar(resposta()).payload;
  const comNomeAntigo: RadarArticleBlueprintPayload = {
    ...antigo,
    evidence: [...antigo.evidence, { id: "S9", kind: "resultado orgânico", text: "Google Meu Negócio: guia · https://exemplo.org/google-meu-negocio" }],
    blueprint: { ...antigo.blueprint, title: { ...antigo.blueprint.title, h1: "Como atrair clientes pelo Instagram e pelo Google Meu Negócio" } },
  };
  const normalizado = radarArticleBlueprintWithCurrentNames(comNomeAntigo, ["como atrair clientes pelo instagram"]);
  assert.equal(normalizado.blueprint.title.h1, "Como atrair clientes pelo Instagram e pelo Perfil da Empresa no Google");
  assert.equal(normalizado.evidence.at(-1)!.text, "Google Meu Negócio: guia · https://exemplo.org/google-meu-negocio");
  assert.equal(radarArticleBlueprintWithCurrentNames(antigo), antigo, "sem nome antigo: o MESMO objeto");
  assert.equal(radarArticleBlueprintWithCurrentNames(comNomeAntigo, ["google meu negócio para clínicas"]).blueprint.title.h1, comNomeAntigo.blueprint.title.h1, "keyword com o nome antigo: a planta fica");

  assert.match(radarArticleBlueprintPrompt(pacote()).system, /22\. NOMES ATUAIS: use o nome atual de produto e recurso \('Perfil da Empresa no Google', nunca 'Google Meu Negócio' nem 'Google My Business'\), salvo quando o nome antigo faz parte da keyword\./);
});

/* Um cliente de banco falso, encadeável e sem rede: cada `await` devolve a próxima resposta da fila. */
function clienteFalso(respostas: Array<{ data: unknown; error: null | { message: string } }>) {
  const consultas: string[] = [];
  const construtor = () => {
    const passos: string[] = [];
    const alvo: Record<string, unknown> = {};
    for (const metodo of ["select", "eq", "in", "order", "limit"]) alvo[metodo] = (...args: unknown[]) => { passos.push(`${metodo}(${JSON.stringify(args)})`); return alvo; };
    alvo.then = (resolver: (valor: unknown) => unknown, rejeitar: (erro: unknown) => unknown) => {
      consultas.push(passos.join("."));
      const proxima = respostas.shift();
      return (proxima ? Promise.resolve(proxima) : Promise.reject(new Error("consulta a mais"))).then(resolver, rejeitar);
    };
    return alvo;
  };
  return { client: { from: () => construtor() } as never, consultas };
}

test("B4 · as duas leituras do artigo-modelo para o export entregam os nomes atuais, com a keyword do artigo preservada; o export passa as keywords", async () => {
  const antigo = organizar(resposta()).payload;
  const gravado = { ...antigo, blueprint: { ...antigo.blueprint, closing: { ...antigo.blueprint.closing, cta: "Atualize o Google Meu Negócio da clínica." } } };
  delete (gravado as { rulesVersion?: string }).rulesVersion;

  const paraExport = clienteFalso([
    { data: [{ id: "v1", article_id: "a1", bundle_hash: "h1", version_number: 1, state: "APPROVED" }], error: null },
    { data: [{ id: "v1", article_id: "a1", payload: gravado, validation: [], origin: "ai" }], error: null },
  ]);
  const lidos = await readRadarArticleBlueprintsForExport(paraExport.client, "marca", [{ articleId: "a1", bundleHash: "h1", keywords: ["como atrair clientes pelo instagram"] }]);
  assert.equal(lidos.get("a1")?.blueprint.closing.cta, "Atualize o Perfil da Empresa no Google da clínica.");
  assert.equal(lidos.get("a1")?.approval, "APPROVED");
  assert.equal(paraExport.consultas.length, 2);

  const comKeyword = clienteFalso([
    { data: [{ id: "v1", article_id: "a1", bundle_hash: "h1", version_number: 1, state: "APPROVED" }], error: null },
    { data: [{ id: "v1", article_id: "a1", payload: gravado, validation: [], origin: "ai" }], error: null },
  ]);
  const preservado = await readRadarArticleBlueprintsForExport(comKeyword.client, "marca", [{ articleId: "a1", bundleHash: "h1", keywords: ["google meu negócio para clínicas"] }]);
  assert.equal(preservado.get("a1")?.blueprint.closing.cta, "Atualize o Google Meu Negócio da clínica.");

  const aprovado = clienteFalso([{ data: [{ article_id: "a1", bundle_hash: "h1", version_number: 1, payload: gravado }], error: null }]);
  const lidosAprovados = await readApprovedRadarArticleBlueprints(aprovado.client, "marca", [{ articleId: "a1", bundleHash: "h1" }]);
  assert.equal(lidosAprovados.get("a1")?.blueprint.closing.cta, "Atualize o Perfil da Empresa no Google da clínica.", "sem keywords, vale a planta (as complementares dela entram)");

  const nucleo = (await readFile(new URL("../lib/server/radar-portable-export-core.ts", import.meta.url), "utf8")).replace(/\r\n/g, "\n");
  assert.match(nucleo, /keywords: \[item\.entrada\.article\.principalKeyword \|\| "", \.\.\.\(item\.entrada\.article\.secondaryKeywords \|\| \[\]\)\]\.filter\(Boolean\),/);
});

/* ============================== B5 e B6 · imagens e ângulo ============================== */

test("B5 · plano visual: o pedido manda variar a cena e seguir o 'Evitar' da voz; a conferência aponta sujeito e objeto repetidos", () => {
  const { system } = radarArticleBlueprintPrompt(pacote());
  assert.match(system, /nem o mesmo sujeito com o mesmo objeto em duas imagens \(ex\.: profissional com celular na capa e num respiro\)\. O que a voz da marca manda evitar nas imagens não entra em prompt nenhum\./);
  assert.deepEqual(radarArticleBlueprintRepeatedScenes([
    { slot: "CAPA", prompt: "profissional de saúde segurando o celular no consultório, 16:9" },
    { slot: "R1", concept: "atendimento", prompt: "Dentist holding a smartphone at the front desk" },
    { slot: "R2", prompt: "mesa com agenda de papel e café" },
  ]), [{ slots: ["CAPA", "R1"], subject: "profissional", object: "celular" }]);
  assert.deepEqual(radarArticleBlueprintRepeatedScenes([
    { slot: "CAPA", prompt: "profissional com notebook" },
    { slot: "R1", prompt: "profissional com celular" },
    { slot: "R2", prompt: "paciente com notebook" },
  ]), [], "objeto diferente ou sujeito diferente: cenas diferentes");

  const { notes } = organizar(resposta({
    visual: [
      { slot: "CAPA", prompt: "profissional de saúde olhando o celular, 16:9" },
      { slot: "R1", section: "Otimize a bio do perfil para atrair clientes", prompt: "médica com smartphone na recepção" },
      { slot: "R2", section: "Use os Stories para atrair clientes", prompt: "bastidores de uma recepção, sem pessoas" },
    ],
  }));
  const nota = notes.find(item => item.startsWith("O plano visual repete a cena"));
  assert.equal(nota, "O plano visual repete a cena (profissional com celular) em Capa e Respiro 1: dê a cada imagem uma cena diferente antes de aprovar.");
  assert.equal(radarArticleBlueprintPendingNotes([nota!]).pending.length, 1);
});

test("B6 · o ângulo é a entrega concreta que a amostra não tem; costurar temas vira nota", () => {
  const { system } = radarArticleBlueprintPrompt(pacote());
  assert.match(system, /23\. ÂNGULO E DIFERENCIAL: o ângulo diz a ENTREGA concreta que a amostra não tem \(um exemplo comentado, um checklist de diagnóstico, uma comparação lado a lado…\), nunca 'costurar dois temas que a maioria já cobre'\. Em angle\.evidence, cite só a evidência que sustenta esse diferencial/);
  for (const angulo of ["Costurar SEO local e Instagram num plano só.", "Unir os dois temas que a maioria trata separado."]) {
    const nota = organizar(resposta({ angle: { statement: angulo, evidence: ["S1"] } })).notes.find(item => item.startsWith("O ângulo"));
    assert.ok(nota && /costura temas em vez de dizer a entrega concreta[^:]*: reescreva antes de aprovar\.$/.test(nota), angulo);
  }
  assert.equal(organizar(resposta()).notes.some(item => item.startsWith("O ângulo")), false, "checklist com exemplo comentado é entrega concreta");
});

/* ============================== B7 · a versão das regras ============================== */

test("B7 · a versão das regras: gravada na planta, preservada na edição e no banco; a tela avisa a anterior e aponta o 'Organizar de novo', sem botão novo", async () => {
  assert.equal(RADAR_ARTICLE_BLUEPRINT_RULES_VERSION, "2026-10-08");
  const { payload } = organizar(resposta());
  assert.equal(payload.rulesVersion, RADAR_ARTICLE_BLUEPRINT_RULES_VERSION);
  assert.equal(radarArticleBlueprintPayloadToStore({ ...payload, approval: "APPROVED" }).rulesVersion, RADAR_ARTICLE_BLUEPRINT_RULES_VERSION, "vai ao banco");
  assert.equal(radarApplyArticleBlueprintEdit(payload, { title: { h1: "Outro H1" } }).rulesVersion, RADAR_ARTICLE_BLUEPRINT_RULES_VERSION);
  const antigo = { ...payload };
  delete antigo.rulesVersion;
  assert.equal(radarApplyArticleBlueprintEdit(antigo, { title: { h1: "Outro H1" } }).rulesVersion, undefined, "a edição de uma planta antiga continua dizendo que é antiga");

  assert.equal(radarArticleBlueprintRulesOutdated(antigo), true);
  assert.equal(radarArticleBlueprintRulesOutdated({ rulesVersion: "2026-10-02" }), true);
  assert.equal(radarArticleBlueprintRulesOutdated(payload), false);
  assert.equal(radarArticleBlueprintRulesOutdated(null), false);

  const aviso = renderToStaticMarkup(createElement(RadarArticleBlueprintRulesNotice, { payload: antigo }));
  assert.match(aviso, /data-testid="radar-article-blueprint-rules-outdated"/);
  assert.match(aviso, /class="text-sm leading-6 text-pending"/);
  assert.match(aviso, /montada com regras anteriores às atuais \(2026-10-08\)/);
  assert.match(aviso, /use &quot;Organizar de novo \(IA\)&quot; \(1 chamada de IA\)/);
  assert.doesNotMatch(aviso, /<button/, "nenhum botão novo: o Organizar de novo já existe");
  assert.equal(renderToStaticMarkup(createElement(RadarArticleBlueprintRulesNotice, { payload })), "");

  const painel = (await readFile(new URL("../modules/radar/radar-article-blueprint-panel.tsx", import.meta.url), "utf8")).replace(/\r\n/g, "\n");
  assert.match(painel, /\{!carregando && atual && !organizandoPelaPagina && <RadarArticleBlueprintRulesNotice payload=\{atual\.payload\} \/>\}/);
  assert.match(painel, /data-testid="radar-article-blueprint-published-map"/);
});

/* ============================== B8 · as medidas ============================== */

test("B8 · os parágrafos do plano saem da faixa de palavras; a contagem concorda; sem medida, ~N por seção", () => {
  const medidas = { comparablePages: 6, words: { median: 3000, p25: 2141, p75: 4228 }, h2: 6, h3: 9, paragraphs: 73, images: 5, lists: 3 };
  assert.deepEqual(radarArticleBlueprintParagraphPlan({ serp: medidas, plan: { wordsMin: 2141, wordsMax: 4228 } }, [3, 3, 3, 3, 3]), { min: 52, max: 103, wordsPerParagraph: 41, perSection: [16, 16, 16, 16, 16] });
  assert.deepEqual(radarArticleBlueprintParagraphPlan({ serp: medidas, plan: { wordsMin: 2141, wordsMax: 4228 } }, [4, 2])?.perSection, [52, 26], "cada seção pelo peso que a IA lhe deu");
  assert.equal(radarArticleBlueprintParagraphPlan({ serp: { ...medidas, paragraphs: null }, plan: { wordsMin: 2141, wordsMax: 4228 } }, [3]), null);
  assert.equal(radarArticleBlueprintParagraphPlan({ serp: { ...medidas, paragraphs: 600 }, plan: { wordsMin: 2141, wordsMax: 4228 } }, [3]), null, "razão fora do plausível (5 palavras por parágrafo): nada derivado");

  const brief = pacote({ measures: medidas });
  const { payload } = organizar(resposta({
    sections: [secao("Otimize a bio do perfil", { paragraphs: 3, internalLinks: [{ candidate: "K1", anchor: "captação de pacientes" }], externalLinks: [{ claim: "Postar com frequência aumenta o alcance.", sourceType: "fonte oficial", source: null }] }), secao("Use os Stories", { from: ["M2"], paragraphs: 3 }), secao("Leve o seguidor ao contato", { paragraphs: 3 })],
  }), brief);
  assert.equal(payload.measures.plan.paragraphs, 9, "a soma da IA continua, para quem já a lê");
  assert.deepEqual([payload.measures.plan.paragraphsMin, payload.measures.plan.paragraphsMax, payload.measures.plan.wordsPerParagraph], [52, 103, 41]);
  const colunas = radarArticleBlueprintColumns(payload);
  const medida = colunas.estrutura.split("\n").find(linha => linha.startsWith("Medidas do plano:"))!;
  /* 2026-10-08 · C3 (Grupo C) · o link externo sem fonte do pacote não é link: a afirmação sai delimitada e é contada à parte. */
  assert.equal(medida, "Medidas do plano: 3 H2 · 0 H3 · ~52–103 parágrafos (~41 palavras cada, como nos concorrentes) · 0 negritos · 3 imagens (capa + 2 respiros) · 1 link interno · 0 links externos (1 afirmação delimitada, sem link) · 2141–4228 palavras.");
  assert.doesNotMatch(medida, D10);
  assert.equal((colunas.estrutura.match(/^- ~26 parágrafo\(s\)$/gm) || []).length, 3, "cada seção com a sua parte da faixa");

  /* Sem medida da SERP: ~N por seção, sem somar; a seção diz o que a IA pôs. */
  const semMedida = radarArticleBlueprintColumns(organizar(resposta({ sections: [secao("A bio", { paragraphs: 2 }), secao("Os Stories", { from: ["M2"], paragraphs: 4 }), secao("O contato", { paragraphs: 3 })] })).payload).estrutura;
  assert.match(semMedida, /^Medidas do plano: 3 H2 · 0 H3 · ~3 parágrafos por seção · /m);
  assert.match(semMedida, /^- ~4 parágrafo\(s\)$/m);
});

/* ============================== compatibilidade ============================== */

test("compatibilidade: a planta antiga (sem os campos novos) sai nas colunas e no Redator; a nova não quebra o Redator", () => {
  const { brief, ia } = comPaginaPublicada();
  const novo = organizar(ia, pacote({ ...brief, measures: { comparablePages: 6, words: { median: 3000, p25: 2141, p75: 4228 }, h2: 6, h3: 9, paragraphs: 73, images: 5, lists: 3 } })).payload;
  const antigo = JSON.parse(JSON.stringify(novo)) as RadarArticleBlueprintPayload;
  delete antigo.rulesVersion;
  delete antigo.publishedStructure;
  delete antigo.blueprint.publishedMap;
  delete antigo.measures.plan.paragraphsMin;
  delete antigo.measures.plan.paragraphsMax;
  delete antigo.measures.plan.wordsPerParagraph;
  for (const payload of [antigo, novo]) {
    const colunas = radarArticleBlueprintColumns(payload);
    assert.match(colunas.estrutura, /^ARTIGO-MODELO DA SERP \(planta concluída do artigo/);
    assert.match(colunas.estrutura, /~52–103 parágrafos/, "a conta vem das medidas gravadas: vale para a antiga");
    const redator = writerArticleBlueprintFoundation({ id: "v1", versionNumber: 1, approvedAt: null, blueprint: payload.blueprint, plan: payload.measures.plan, linkCandidates: payload.linkCandidates, brandVoice: payload.brandVoice });
    assert.ok(redator && redator.sections.length === 3);
  }
  const redatorNovo = writerArticleBlueprintFoundation({ id: "v1", versionNumber: 1, approvedAt: null, blueprint: novo.blueprint, plan: novo.measures.plan, linkCandidates: novo.linkCandidates, brandVoice: novo.brandVoice });
  assert.equal(redatorNovo?.plan?.paragraphsMin, 52, "o Redator lê as medidas novas como números");
});

test("PROVIDER_CALLS = 0", () => {
  assert.deepEqual(idasAoServidor, []);
});
