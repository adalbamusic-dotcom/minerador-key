import assert from "node:assert/strict";
import test from "node:test";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

import { ARTIGO, entradaGoogle } from "./radar-portable-writing-fixtures.mts";
import { plantaDe } from "./radar-piloto-planta-fixtures-2026-10-09.mts";
import { radarArticleBlueprintExportChoice } from "../lib/server/radar-article-blueprint-read.ts";
import { RADAR_YOUTUBE_PERTINENT_RULER } from "../lib/radar/youtube-blueprint.ts";
import { writerArticleBlueprintPick } from "../lib/redator/writer-blueprint-pick.ts";
import { RADAR_FOUNDATIONS_PERTINENT_RULER, radarFoundationsOfDossier } from "../lib/redator/radar-foundations.ts";
import { buildWriterSectionEvidencePackage, writerBlueprintForSection, writerImproveSectionLabel, type WriterSectionMaterial } from "../lib/redator/writer-section-evidence.ts";
import { writerArticleBlueprintForWriting, writerBlueprintWithCurrentNames } from "../lib/redator/writer-blueprint-for-writing.ts";
import { WRITER_BLUEPRINT_CONTINUATION_LABEL } from "../lib/redator/writer-evidence-catalog.ts";
import { IMPROVE_SYSTEM_PROMPT, SECTION_WRITING_SYSTEM_PROMPT } from "../lib/redator/prompts.ts";
import { radarWriterEditorialContextWithBlueprint } from "../lib/redator/radar-subject-turn.ts";
import { expertTopicsBlueprintLines, expertTopicsContextWithoutNoise } from "../lib/redator/expert-topics-pilot.ts";

/*
 * ===== 2026-10-09 · O QUE O REDATOR LÊ, PELO PROCESSO DO PILOTO =====
 *
 * Regra do dono (2026-10-09): o processo do piloto substitui o antigo em toda
 * operação; o legado só sobrevive como matéria-prima do gerador do
 * artigo-modelo. Esta suíte prova o lado do Redator que não é a semeadura
 * (ver `radar-piloto-redator-roteiro-2026-10-09.test.mts`):
 *
 *   1. a ESCOLHA da planta é a do CSV (`radarArticleBlueprintPick`, com o
 *      congelamento da Amazon), e a planta gravada antes da regra continua
 *      ligada — congelamento é sagrado;
 *   2. a fotografia antiga do YouTube é lida como foi congelada (régua da
 *      amostra inteira), sem o que o blueprint antigo recomendava;
 *   3. no piloto Google + YouTube e no acréscimo de review, as camadas de
 *      formato (`formatBlueprints.video` e `.review`) chegam aos fundamentos;
 *   4. a régua de ruído do CSV vale onde o Redator lê pesquisa (fundamentos,
 *      pacote da seção, pautas do especialista);
 *   5. a melhoria de trecho recebe a seção da planta do H2 dele e o mapa do
 *      publicado — também na planta antiga, pela página lida agora;
 *   6. o próximo passo que chama sai; o que aponta a leitura seguinte fica,
 *      como continuação opcional, nunca segunda chamada;
 *   7. a virada lida troca as linhas gravadas pelo envio antigo pelas da planta;
 *   8. as pautas do especialista servem às seções da planta concluída;
 *   9. o painel mostra o estado ausente com a ação de organizar no Radar.
 *
 * PROVIDER_CALLS = 0.
 */

const idasAoServidor: string[] = [];
Object.defineProperty(globalThis, "fetch", {
  value: (entrada: unknown) => {
    idasAoServidor.push(String((entrada as { url?: string })?.url || entrada));
    return Promise.reject(new Error("REDE PROIBIDA NESTE GATE"));
  },
  writable: true, configurable: true,
});

const semComentarios = (caminho: string) => readFileSync(new URL(caminho, import.meta.url), "utf8")
  .replace(/\r\n/g, "\n").replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

/* ============================ 1. a escolha ============================ */

const F1 = "2026-09-01T10:00:00.000Z";
const F2 = "2026-10-01T10:00:00.000Z";
const A1 = "2026-10-02T10:00:00.000Z";
const A2 = "2026-10-05T10:00:00.000Z";
const ref = (frozenAt: string, extra: Record<string, unknown> = {}) => ({ frozenAt, frozenBundleId: null, frozenBundleHash: null, articleDnaVersionId: "dna-1", articleDnaContentHash: null, ...extra });

/* As versões de um artigo como o banco as devolve (metadados + a referência lida do payload). */
const VERSOES = [
  { id: "v1", bundleHash: "h-antiga", versionNumber: 1, state: "APPROVED", createdAt: "2026-09-02T10:00:00.000Z", investigationRef: ref(F1) },
  /* Gravada ANTES da regra da Amazon: sem a chave `amazonFrozenAt`. */
  { id: "v2", bundleHash: "h-f2-sem-chave", versionNumber: 2, state: "APPROVED", createdAt: "2026-10-01T12:00:00.000Z", investigationRef: ref(F2) },
  { id: "v3", bundleHash: "h-f2-a1", versionNumber: 3, state: "APPROVED", createdAt: "2026-10-03T10:00:00.000Z", investigationRef: ref(F2, { amazonFrozenAt: A1 }) },
  { id: "v4", bundleHash: "h-doc", versionNumber: 4, state: "DRAFT", createdAt: "2026-10-06T10:00:00.000Z", investigationRef: ref(F2, { amazonFrozenAt: A2 }) },
  { id: "v5", bundleHash: "h-f2-nula", versionNumber: 5, state: "APPROVED", createdAt: "2026-10-07T10:00:00.000Z", investigationRef: ref(F2, { amazonFrozenAt: null }) },
];

const doCsv = (bundleHash: string | null, amazon: string | null | undefined) => {
  const investigacao = { ...ref(F2), articleDnaFrom: null, articleDnaUntil: null, ...(amazon !== undefined ? { amazonFrozenAt: amazon } : {}) };
  return radarArticleBlueprintExportChoice(VERSOES.map(item => ({ ...item, articleId: ARTIGO })), new Map([[ARTIGO, bundleHash ?? ""]]), new Map([[ARTIGO, investigacao as never]])).get(ARTIGO)?.id ?? null;
};
const doRedator = (bundleHash: string | null, amazon: string | null | undefined) => writerArticleBlueprintPick(VERSOES, {
  bundleHash,
  investigation: { frozenAt: F2, articleDnaVersionId: "dna-1", articleDnaContentHash: null, ...(amazon !== undefined ? { amazonFrozenAt: amazon } : {}) },
})?.id ?? null;

test("escolha · o Redator escolhe a planta pelo MESMO pick do CSV, em toda a matriz (hash do pacote × congelamento da Amazon)", () => {
  for (const hash of ["h-f2-a1", "h-doc", "h-antiga", "h-desconhecido", null]) {
    for (const amazon of [undefined, null, A1, A2]) {
      assert.equal(doRedator(hash, amazon), doCsv(hash, amazon), `hash ${hash} · amazon ${String(amazon)}`);
    }
  }
  /* O hash exato vence (até de outro congelamento), e rascunho nunca é escolhido. */
  assert.equal(doRedator("h-antiga", A2), "v1");
  assert.equal(doRedator("h-doc", undefined), "v5", "o hash do documento só tem rascunho: vale a concluída da investigação");
  /* A Amazon congelada de novo desliga a planta que conhecia a anterior. */
  assert.equal(doRedator("h-desconhecido", A1), "v3");
  assert.equal(doRedator("h-desconhecido", null), "v5");
});

test("congelamento sagrado · a planta gravada antes da regra da Amazon (sem a chave) continua ligada quando as novas se desligam", () => {
  /* A2: v5 (sem Amazon) e v3 (outra Amazon) se desligam; v2, gravada sem a chave, continua — como no CSV. */
  assert.equal(doRedator("h-desconhecido", A2), "v2");
  assert.equal(doCsv("h-desconhecido", A2), "v2");
  /* Quem não conhece a Amazon do pacote (dossiê antigo, sem `research.amazon.frozenAt`) não confere: a mais nova do congelamento. */
  assert.equal(doRedator("h-desconhecido", undefined), "v5");
  /* A versão antiga, sem referência gravada, só vale pelo relógio quando o congelamento do documento é o vigente — e nunca onde o CSV a recusaria. */
  const antiga = [{ id: "v0", bundleHash: "h-v0", versionNumber: 9, state: "APPROVED", createdAt: "2026-10-08T10:00:00.000Z", investigationRef: null }];
  const alvo = { bundleHash: "h-outro", investigation: { frozenAt: F2, articleDnaVersionId: "dna-1", articleDnaContentHash: null }, articleDnaFrom: "2026-09-20T10:00:00.000Z", articleDnaUntil: null };
  assert.equal(writerArticleBlueprintPick(antiga, alvo), null, "sem a guarda, a planta antiga não liga");
  assert.equal(writerArticleBlueprintPick(antiga, { ...alvo, frozenStillCurrent: true })?.id, "v0");
  const csv = radarArticleBlueprintExportChoice(antiga.map(item => ({ ...item, articleId: ARTIGO })), new Map([[ARTIGO, "h-outro"]]),
    new Map([[ARTIGO, { ...ref(F2), articleDnaFrom: "2026-09-20T10:00:00.000Z", articleDnaUntil: null } as never]]));
  assert.equal(csv.get(ARTIGO)?.id, "v0", "a guarda só tira; o que o Redator liga o CSV também liga");

  /* O servidor lê o congelamento da Amazon do pacote do documento e escolhe pela função pura. */
  const fontes = semComentarios("../lib/server/writer-evidence-sources.ts");
  assert.match(fontes, /writerArticleBlueprintPick\(/);
  assert.match(fontes, /\.\.\.\(head\.bundleAmazonFrozenAt !== undefined \? \{ amazonFrozenAt: texto\(head\.bundleAmazonFrozenAt\) \} : \{\}\)/);
  assert.match(semComentarios("../lib/server/writer-evidence-document.ts"), /b_amazonFrozenAt: `\$\{DOSSIE\}->bundle->research->amazon->frozenAt`/);
});

/* ============================ 2. a fotografia antiga ============================ */

test("congelamento sagrado · a fotografia do YouTube congelada antes de 2026-10-09 é lida como foi congelada, sem o que o blueprint antigo recomendava", () => {
  const caminho = new URL("./fixtures/radar-youtube-congelado-antes-2026-10-09.json", import.meta.url);
  const antes = createHash("sha256").update(readFileSync(caminho)).digest("hex");
  const fixture = JSON.parse(readFileSync(caminho, "utf8")) as { esperado: { canonical: Record<string, unknown> & { observed: Record<string, unknown>; recommended: Record<string, unknown>; limitations: string[] } } };
  const canonical = fixture.esperado.canonical;
  const copia = structuredClone(canonical);
  const fundamentos = radarFoundationsOfDossier({
    researchProfile: "YOUTUBE", keywordContext: { principal: "skin care noturno", secondary: [] }, writerMayNot: [],
    bundle: { competitiveBlueprint: canonical, limitations: canonical.limitations, research: { youtube: { role: "PRIMARY", frozenAt: "2026-09-14T21:00:00.000Z", counts: { queries: 1, items: 25 }, limitations: [] } } },
  })!;
  assert.deepEqual(canonical, copia, "a leitura não muda a fotografia");
  assert.equal(createHash("sha256").update(readFileSync(caminho)).digest("hex"), antes);
  const youtube = fundamentos.youtube!;
  assert.equal(youtube.role, "PRIMARY");
  assert.equal(youtube.ruler, "AMOSTRA_INTEIRA", "a régua que fez a fotografia: a amostra inteira, não a pertinente");
  assert.deepEqual([youtube.comparableVideos, youtube.longForm, youtube.shorts], [25, 11, 14]);
  assert.equal(youtube.durationRange, canonical.observed.durationRange);
  assert.deepEqual(Object.keys(youtube).sort(), ["comparableVideos", "durationRange", "frozenAt", "gaps", "longForm", "recurrentChannels", "role", "ruler", "shorts", "titlePatterns"]);
  /* Nada do que a fotografia recomendava (formato, gancho, roteiro, tom, linguagem, títulos) chega ao Redator. */
  const lido = JSON.stringify(fundamentos);
  const recomendado = canonical.recommended as { titleDirections: Array<{ statement: string }>; hookDirection: unknown; script: unknown; tone: unknown };
  assert.equal(lido.includes(recomendado.titleDirections[0].statement), false);
  for (const valor of [recomendado.hookDirection, recomendado.tone]) if (typeof valor === "string") assert.equal(lido.includes(valor), false);
  assert.equal(RADAR_FOUNDATIONS_PERTINENT_RULER, RADAR_YOUTUBE_PERTINENT_RULER, "a marca da régua nova é o mesmo texto nos dois lados");
  /* A fotografia nova (com a linha da régua pertinente) é reconhecida. */
  const nova = radarFoundationsOfDossier({
    researchProfile: "YOUTUBE", keywordContext: { principal: "skin care noturno" }, writerMayNot: [],
    bundle: { competitiveBlueprint: canonical, limitations: [`${RADAR_YOUTUBE_PERTINENT_RULER} 9 de 25 vídeos são do mesmo público.`] },
  })!;
  assert.equal(nova.youtube?.ruler, "PERTINENTE");
});

/* ============================ 3. as camadas de formato ============================ */

test("piloto Google + YouTube e review · `formatBlueprints.video` e `formatBlueprints.review` chegam aos fundamentos (apoio), com o rótulo da intenção e das faixas", () => {
  const fundamentos = radarFoundationsOfDossier({
    researchProfile: "GOOGLE", keywordContext: { principal: "sabonete para pele oleosa", secondary: [] }, writerMayNot: [],
    bundle: {
      competitiveBlueprint: { profile: "GOOGLE", observed: {}, recommended: {} },
      formatBlueprints: {
        video: { frozenAt: "2026-10-04T10:00:00.000Z", blueprint: { observed: { youtubeLongForm: 7, youtubeShorts: 3 } } },
        review: {
          frozenAt: "2026-10-04T11:00:00.000Z",
          intent: { type: "BUYING_GUIDE" },
          blueprint: {
            observed: { products: 12, sufficiency: "SUFFICIENT", priceBands: [{ band: "ECONOMICO", currency: "R$", rangeFrom: 20, rangeTo: 50, sampleSize: 4 }] },
            recommended: { recommendedOutputs: [{ output: "BUYING_GUIDE" }], comparisonAxes: [{ label: "Textura" }, { label: "Preço por ml" }], supportState: "APPLIED" },
          },
        },
      },
    },
  })!;
  assert.deepEqual(fundamentos.youtube, {
    role: "SUPPORT", frozenAt: "2026-10-04T10:00:00.000Z", comparableVideos: 10, longForm: 7, shorts: 3,
    durationRange: null, recurrentChannels: [], titlePatterns: [], gaps: [], ruler: "AMOSTRA_INTEIRA",
  });
  assert.deepEqual(fundamentos.review, {
    role: "SUPPORT", frozenAt: "2026-10-04T11:00:00.000Z", intent: "Guia de compra", output: "Guia de compra", products: 12, sufficiency: "SUFFICIENT",
    priceBands: ["Faixa econômica: de R$ 20,00 a R$ 50,00 (4 produto(s))"], comparisonAxes: ["Textura", "Preço por ml"], googleSupport: "APPLIED",
  });
  assert.equal(fundamentos.multimodal?.youtubeLongForm, 7);
});

/* ============================ 4. a régua de ruído ============================ */

const NUCLEO = { principal: "skincare para pele oleosa", secondary: ["sabonete para pele oleosa"] };
const NEWSLETTER = "Assine nossa newsletter de skincare";
const INGLES = "What is the best skincare routine for oily skin?";
const POST = "Leia também: 10 dicas de skincare";
const BOA = "Qual sabonete usar na pele oleosa?";

test("ruído · fundamentos, pacote da seção e pautas do especialista tiram da pesquisa o que não é do leitor, pela régua do CSV", () => {
  const fundamentos = radarFoundationsOfDossier({
    researchProfile: "GOOGLE", keywordContext: NUCLEO, writerMayNot: [],
    bundle: { competitiveBlueprint: { profile: "GOOGLE", recommended: { mustAnswer: [NEWSLETTER, BOA, INGLES], mustCover: [POST, "ácido salicílico"] } } },
  })!;
  assert.deepEqual(fundamentos.mustAnswer, [BOA]);
  assert.deepEqual(fundamentos.mustCover, ["ácido salicílico"]);

  const material: WriterSectionMaterial = {
    documentId: "doc-1", articleId: ARTIGO, documentHash: "sha256:doc", writerMayNot: [], keywordContext: NUCLEO,
    bundle: { bundleId: "b", bundleHash: "h", researchProfile: "GOOGLE", observedAt: null, serpAuthoritative: null },
    article: null, pendingDecisions: [], absent: [],
    sections: {
      "observed.questions": [{ id: "q1", canonicalQuestion: NEWSLETTER }, { id: "q2", canonicalQuestion: BOA }, { id: "q3", canonicalQuestion: INGLES }],
      "observed.gaps": [{ subject: POST }, { subject: "Ácido salicílico para pele oleosa" }],
    },
  };
  const pacote = buildWriterSectionEvidencePackage(material, { kind: "section", id: "s1", label: "Qual sabonete usar" })!;
  assert.deepEqual(pacote.questions.map(item => item.question), [BOA]);
  assert.deepEqual(pacote.gaps.map(item => item.subject), ["Ácido salicílico para pele oleosa"]);
  assert.deepEqual(pacote.noise, [{ field: "questions", removed: 2 }, { field: "gaps", removed: 1 }]);
  /* Sem ruído, o pacote sai sem a chave (byte a byte o de antes). */
  const limpo = buildWriterSectionEvidencePackage({ ...material, sections: { "observed.questions": [{ id: "q2", canonicalQuestion: BOA }] } }, { kind: "section", id: "s1", label: "Qual sabonete usar" })!;
  assert.equal("noise" in limpo, false);

  const contexto = {
    articleDna: { principal: NUCLEO.principal, audience: "pessoas com pele oleosa", requiredTopics: ["sabonete"], knownQuestions: [NEWSLETTER, BOA] },
    keywordDnas: [{ keyword: NUCLEO.secondary[0] }],
    serpNeeds: [INGLES, "Como escolher sabonete para pele oleosa?"], openGaps: [POST], knownQuestions: [],
  };
  const pautas = expertTopicsContextWithoutNoise(contexto);
  assert.equal(pautas.removed, 3);
  assert.deepEqual(pautas.context.articleDna.knownQuestions, [BOA]);
  assert.deepEqual(pautas.context.serpNeeds, ["Como escolher sabonete para pele oleosa?"]);
  assert.deepEqual(pautas.context.openGaps, []);
  const semRuido = { ...contexto, articleDna: { ...contexto.articleDna, knownQuestions: [BOA] }, serpNeeds: [], openGaps: [] };
  assert.equal(expertTopicsContextWithoutNoise(semRuido).context, semRuido, "sem ruído, o mesmo objeto");
});

/* ============================ 5. a melhoria de trecho ============================ */

const BLOCOS = [
  { type: "heading", level: 1, text: "Skincare facial: o guia" },
  { type: "paragraph", text: "Introdução antes de qualquer seção sobre a pele." },
  { type: "heading", level: 2, text: "Como montar a rotina de skincare facial no dia a dia?" },
  { type: "paragraph", text: "Comece pela limpeza com gel suave pela manhã." },
  { type: "heading", level: 3, text: "Rotina da noite" },
  { type: "list", items: ["Limpeza", "Hidratante em gel-creme à noite"] },
  { type: "heading", level: 2, text: "Afinal, qual a ordem dos produtos?" },
  { type: "paragraph", text: "Do mais leve ao mais denso." },
];

test("melhoria · o trecho recebe a seção da planta do H2 sob o qual está (H3 e lista incluídos); antes do primeiro H2, só a forma", () => {
  assert.equal(writerImproveSectionLabel(BLOCOS, "Introdução antes de qualquer seção"), null);
  assert.equal(writerImproveSectionLabel(BLOCOS, "Comece pela limpeza com gel suave"), "Como montar a rotina de skincare facial no dia a dia?");
  assert.equal(writerImproveSectionLabel(BLOCOS, "Hidratante em gel-creme à noite"), "Como montar a rotina de skincare facial no dia a dia?");
  assert.equal(writerImproveSectionLabel(BLOCOS, "Do mais leve ao mais denso."), "Afinal, qual a ordem dos produtos?");
  assert.equal(writerImproveSectionLabel(BLOCOS, "texto que não está no documento"), null);
  assert.equal(writerImproveSectionLabel(BLOCOS, "   "), null);
  /* Um H1 depois de um H2 (documento colado com dois títulos) fecha a seção: o trecho sob ele fica sem seção. */
  const comSegundoTitulo = [...BLOCOS, { type: "heading", level: 1, text: "Outro título colado" }, { type: "paragraph", text: "Texto sob o título colado no fim." }];
  assert.equal(writerImproveSectionLabel(comSegundoTitulo, "Texto sob o título colado no fim."), null);

  const planta = plantaDe(entradaGoogle(), { articleId: ARTIGO });
  const fundacao = writerArticleBlueprintForWriting({ id: "bp-1", versionNumber: 2, approvedAt: "2026-10-02T11:00:00Z", blueprint: planta.blueprint, plan: null, linkCandidates: planta.linkCandidates, brandVoice: null })!;
  const doH2 = writerBlueprintForSection(fundacao, { kind: "improve", id: null, label: "Comece pela limpeza com gel suave", sectionLabel: writerImproveSectionLabel(BLOCOS, "Comece pela limpeza com gel suave") });
  assert.equal(doH2.section?.h2, "Como montar a rotina de skincare facial no dia a dia?");
  assert.equal(writerBlueprintForSection(fundacao, { kind: "improve", id: null, label: "Introdução", sectionLabel: null }).section, null);
  /* O servidor passa o H2 do trecho ao foco da melhoria. */
  assert.match(semComentarios("../lib/server/writer-evidence-ai.ts"), /sectionLabel: writerImproveSectionLabel\(input\.document\.blocks, input\.selectedText\)/);
  /* O prompt da melhoria diz a seção e o mapa do publicado, e o entregável concluído. */
  assert.match(IMPROVE_SYSTEM_PROMPT, /evidence\.articleBlueprint\.section é a seção da planta para o H2 sob o qual o trecho está/);
  assert.match(IMPROVE_SYSTEM_PROMPT, /Quando evidence\.articleBlueprint\.publishedMap existir, o artigo atualiza uma página publicada/);
  for (const prompt of [IMPROVE_SYSTEM_PROMPT, SECTION_WRITING_SYSTEM_PROMPT]) assert.match(prompt, /O texto sai concluído: sem marca de trabalho por fazer/);
});

test("melhoria de publicado · o mapa da atualização vem da página lida AGORA, também na planta antiga (que não leu a página)", () => {
  const planta = plantaDe(entradaGoogle(), { articleId: ARTIGO });
  assert.equal(planta.publishedStructure ?? null, null, "a planta da bancada não leu a página publicada");
  const base = { id: "bp-1", versionNumber: 2, approvedAt: "2026-10-02T11:00:00Z", blueprint: planta.blueprint, plan: null, linkCandidates: planta.linkCandidates, brandVoice: null };
  assert.equal(writerArticleBlueprintForWriting(base)?.publishedMap, undefined, "sem página lida, sem mapa");
  const hoje = ["Como montar a rotina de skincare facial no dia a dia?", "Produtos que usamos na clínica", "Ordem dos produtos"];
  const mapa = writerArticleBlueprintForWriting({ ...base, currentStructure: { h1: "Skincare facial antigo", h2: hoje }, keywords: { principal: "skincare facial" } })!.publishedMap!;
  assert.deepEqual(mapa.map(item => item.current), hoje);
  assert.deepEqual(mapa.map(item => [item.kind, item.section]), [["ABSORBED", 1], ["KEEP", null], ["ABSORBED", 2]]);
  /* A página de hoje vale sobre a que a IA viu ao montar. */
  const comAntiga = writerArticleBlueprintForWriting({ ...base, publishedStructure: { h1: "x", h2: ["Seção que saiu da página"] }, currentStructure: { h1: "Skincare facial antigo", h2: hoje }, keywords: { principal: "skincare facial" } })!.publishedMap!;
  assert.deepEqual(comAntiga.map(item => item.current), hoje);
  /* As rotas da seção e da melhoria leem a página publicada como o CSV. */
  for (const rota of ["../app/api/redator/section/route.ts", "../app/api/redator/improve/route.ts"]) {
    assert.match(semComentarios(rota), /readPublishedStructure: radarReadPublishedStructure/, rota);
  }
});

/* ============================ 6. a continuação ============================ */

test("continuação · o próximo passo que chama sai; o que aponta a leitura seguinte fica, dito como continuação opcional", () => {
  const planta = plantaDe(entradaGoogle(), { articleId: ARTIGO });
  const com = (nextStep: string) => (writerBlueprintWithCurrentNames({ ...planta.blueprint, closing: { ...planta.blueprint.closing, nextStep } }, { principal: "skincare facial" }, { sources: planta.sources }) as typeof planta.blueprint).closing;
  assert.equal(com("Acesse a página de SEO para clínicas e agende uma conversa.").nextStep, null, "um CTA só: o próximo passo que chama não é segunda chamada");
  assert.equal(com("Ler o guia: como montar a rotina da noite").nextStep, "Ler o guia: como montar a rotina da noite");
  assert.equal(com("Ler o guia: como montar a rotina da noite").cta, planta.blueprint.closing.cta, "o CTA da planta é a única chamada");
  assert.equal(WRITER_BLUEPRINT_CONTINUATION_LABEL, "Leitura seguinte (opcional, não é uma chamada)");
  assert.ok(SECTION_WRITING_SYSTEM_PROMPT.includes(`closing.nextStep, quando existe, é a ${WRITER_BLUEPRINT_CONTINUATION_LABEL.toLocaleLowerCase("pt-BR")}`));
  assert.match(SECTION_WRITING_SYSTEM_PROMPT, /nunca como segunda chamada no fechamento/);
  assert.match(semComentarios("../modules/redator/writer-radar-foundations-panel.tsx"), /\{WRITER_BLUEPRINT_CONTINUATION_LABEL\}:/);
  assert.match(semComentarios("../lib/redator/deliverable-seed.ts"), /WRITER_BLUEPRINT_CONTINUATION_LABEL/);
});

/* ============================ 7. a virada na leitura ============================ */

test("virada na leitura · as linhas do Assunto gravadas pelo envio antigo são trocadas pelas da planta; as outras ficam, na ordem", () => {
  const planta = plantaDe(entradaGoogle(), { articleId: ARTIGO });
  const gravadas = [
    "Tronco (Assunto): Rotina de skincare facial.",
    "Virada: onde quem redige decidir (sem sinal na SERP), levar o leitor de skincare facial a Rotina de skincare facial.",
    "Seção da virada: \"Virada para Rotina de skincare facial\", como ponto a cobrir em \"x\": exigida pelo ArticleDNA sem página na amostra; o título é de trabalho do Radar, reescreva para o leitor.",
    "Assunto no H1: sem sinal na SERP, quem redige decide. O H1 é da principal.",
    "Alerta do Radar sobre o Assunto: nenhuma coincidência de termos.",
    "Diferenciação: este artigo fica com a ordem dos passos.",
  ];
  const lidas = radarWriterEditorialContextWithBlueprint(gravadas, { subject: { phrase: "Rotina de skincare facial" }, blueprint: planta.blueprint, principal: "skincare facial" });
  assert.deepEqual(lidas, [
    "Tronco (Assunto): Rotina de skincare facial.",
    `Virada: na seção "${planta.blueprint.sections[0].h2}" do artigo-modelo (seção 1), levar o leitor de skincare facial a Rotina de skincare facial.`,
    `Seção da virada: "${planta.blueprint.sections[0].h2}", seção 1 do artigo-modelo concluído.`,
    `Assunto em H2/H3 — o H1 é da principal, como o do artigo-modelo ("${planta.blueprint.title.h1}").`,
    "Diferenciação: este artigo fica com a ordem dos passos.",
  ]);
  /* Sem Assunto (do ArticleDNA fixado), as linhas voltam como estão. */
  assert.deepEqual(radarWriterEditorialContextWithBlueprint(gravadas, { subject: null, blueprint: planta.blueprint, principal: "skincare facial" }), gravadas);
  /* Fundamentos, pacote da seção, semeadura e painel leem pela mesma troca. */
  assert.match(semComentarios("../lib/server/writer-evidence-reader.ts"), /radarWriterEditorialContextWithBlueprint\(linhas, \{ subject: assunto, blueprint: planta\.blueprintRead,/);
  assert.match(semComentarios("../lib/server/writer-seed.ts"), /radarWriterEditorialContextWithBlueprint\(input\.editorialContext, \{/);
});

/* ============================ 8. as pautas do especialista ============================ */

test("pautas · com a planta concluída do mesmo ArticleDNA, o pedido diz as seções e as afirmações que só entram com fonte", () => {
  const planta = plantaDe(entradaGoogle(), { articleId: ARTIGO });
  const afirmacao = "O ácido salicílico reduz a oleosidade em duas semanas";
  const comLink = { ...planta.blueprint, sections: planta.blueprint.sections.map((secao, indice) => (indice === 1 ? { ...secao, externalLinks: [{ claim: afirmacao, sourceType: "estudo", source: null }] } : secao)) };
  const linhas = expertTopicsBlueprintLines({ version: 2, blueprint: comLink, sources: planta.sources, principal: "skincare facial" });
  assert.ok(linhas[0].startsWith("O artigo-modelo da SERP concluído deste artigo (v2) é a referência dele. Seções, na ordem: 1. Como montar a rotina"), linhas[0]);
  assert.equal(linhas[1], "As pautas servem às seções do artigo-modelo: não proponha pauta para assunto que ele não cobre.");
  assert.ok(linhas[2].includes(`"${afirmacao}"`), linhas[2]);
  assert.deepEqual(expertTopicsBlueprintLines({ version: 1, blueprint: null, sources: null, principal: "skincare facial" }), [], "sem planta concluída, nenhuma linha a mais");
  /* A rota lê só a concluída do MESMO ArticleDNA e tira o ruído antes da chamada. */
  const rota = semComentarios("../app/api/editorial/radar-topics/route.ts");
  assert.match(rota, /\.eq\("state", "APPROVED"\)/);
  assert.match(rota, /linha\.ir\?\.articleDnaVersionId === input\.articleDnaVersionId/);
  assert.ok(rota.indexOf("expertTopicsContextWithoutNoise(parsed.data.context)") < rota.indexOf("generateStructuredAI("));
});

/* ============================ 9. o painel ============================ */

test("painel · sem planta concluída, o estado ausente é explícito, com a ação de organizar no Radar e o custo dito; nunca a estrutura legada", () => {
  const painel = semComentarios("../modules/redator/writer-radar-foundations-panel.tsx");
  assert.match(painel, /data-radar-foundations-section="article-blueprint" data-radar-article-blueprint-state=\{leitura\.estado\}/);
  assert.match(painel, /Organizar o artigo-modelo no Radar/);
  assert.match(painel, /até 2 chamadas de IA por artigo/);
  assert.match(painel, /`\/\$\{doEndereco\.brandRef\}\/radar\/\$\{encodeURIComponent\(articleId\)\}`/);
  assert.match(painel, /\/api\/redator\/article-blueprint\?/);
  /* A rota do painel só lê: sessão canônica, permissão de ver o Redator e a leitura compartilhada. */
  const rota = semComentarios("../app/api/redator/article-blueprint/route.ts");
  assert.match(rota, /export async function GET\(/);
  assert.doesNotMatch(rota, /export async function (POST|PUT|PATCH|DELETE)\(/);
  assert.match(rota, /assertEditorialPermission\([^)]*"redator", "view"\)/);
  assert.match(rota, /readWriterArticleBlueprintPanel\(/);
});

test("PROVIDER_CALLS = 0", () => {
  assert.deepEqual(idasAoServidor, []);
});
