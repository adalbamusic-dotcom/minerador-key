import assert from "node:assert/strict";
import test from "node:test";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

import { buildRadarDocument, radarDocumentId } from "../lib/redator/radar-import.ts";
import {
  RADAR_WRITER_SUBJECT_H1_NO_SIGNAL,
  radarWriterSubjectOf,
  radarWriterSubjectTurnLines,
  radarWriterSubjectTurnLinesFromBlueprint,
} from "../lib/redator/radar-subject-turn.ts";
import { RADAR_WRITER_MAY_NOT, RADAR_WRITER_MAY_NOT_SUBJECT } from "../lib/redator/writer-handoff.ts";
import { ContentDocumentV2Schema } from "../lib/arquiteto/contracts.ts";
import { RADAR_WRITING_SUBJECT_H1_NO_SIGNAL, buildRadarWritingExportArticle, type RadarWritingArticleContext } from "../lib/radar/portable-writing-export.ts";
import { type RadarEditorialArticleModel, type RadarEditorialSubjectTurn } from "../lib/radar/editorial-article-model.ts";
import type { RadarArticleResearchContext } from "../lib/radar/article-research-context.ts";
import type { RadarCanonicalAuthorities } from "../lib/server/radar-canonical-authorities.ts";
import { ARTIGO, contextoDePesquisa, entradaGoogle, vistaDoGoogleSobre } from "./radar-portable-writing-fixtures.mts";
import { comPlanta } from "./radar-piloto-planta-fixtures-2026-10-09.mts";

/*
 * ===== SDD do Assunto, F4.1 · A ENTREGA AO REDATOR COM ASSUNTO =====
 *
 * O dono pediu que o Assunto chegue ao Redator "já com o assunto definido,
 * validado, reforçado e com todo o contexto", e que o artigo faça a virada.
 *
 * O que esta suíte prova, no envio (domínio de `buildRadarDocument`):
 *   1. sem Assunto, o documento é BYTE A BYTE o de antes (snapshot medido com
 *      o `radar-import.ts` do HEAD, antes desta mudança);
 *   2. com Assunto, `writerMayNot` GRAVADO ganha a proibição, uma vez, no fim;
 *   3. com Assunto, `importedContext.editorialContext` leva as linhas de onde
 *      virar, da seção da virada, da direção do H1 e do destino — desde
 *      2026-10-09 lidas da PLANTA concluída (a mesma do CSV), não do modelo
 *      editorial antigo;
 *   4. o dossiê não muda por causa do Assunto (invariante 78): o bundle é o
 *      mesmo, e as linhas vêm do artigo-modelo, que está fora dele.
 *
 * PROVIDER_CALLS = 0: a rede é recusada abaixo.
 */

const idasAoServidor: string[] = [];
Object.defineProperty(globalThis, "fetch", {
  value: (entrada: unknown) => {
    idasAoServidor.push(String((entrada as { url?: string })?.url || entrada));
    return Promise.reject(new Error("REDE PROIBIDA NESTE GATE"));
  },
  writable: true, configurable: true,
});

const HASH = `sha256:${"a".repeat(64)}`;
const ref = (entityId: string, versionId: string) => ({ entityId, versionId, contentHash: HASH });
const sha = (valor: unknown) => createHash("sha256").update(JSON.stringify(valor)).digest("hex");

type Assunto = { phrase: string; note: string | null; destinationUrl: string | null };

/* O Assunto como o ArticleDNA o guarda (`DeclaredSubjectSchema`). */
const doDna = (assunto: Assunto) => ({
  keywordId: "kw-assunto",
  approvedPackageRef: { version: 3, contentHash: `sha256:${"p".repeat(64)}`, approvedAt: "2026-09-24T10:00:00+00:00" },
  ...assunto,
  attachedBy: "00000000-0000-4000-8000-000000000004",
  attachedAt: "2026-09-24T12:00:00+00:00",
});

/* Destino sem parâmetro de campanha: o CSV limpa `utm_*` por higiene de planilha, o Redator não. */
const CONSULTA: Assunto = { phrase: "Consulta dermatológica online", note: "A marca atende por teleconsulta.", destinationUrl: "https://careglow.com.br/consulta-online" };
const ORDEM: Assunto = { phrase: "Ordem dos ácidos no rosto", note: null, destinationUrl: null };
const ROTINA: Assunto = { phrase: "Rotina de skincare facial", note: null, destinationUrl: null };

const contextoCom = (assunto: Assunto): RadarArticleResearchContext => {
  const base = contextoDePesquisa();
  return { ...base, article: { ...base.article, subject: { ...assunto } } } as RadarArticleResearchContext;
};

/* A virada que a F3 calcula de verdade, sobre a amostra do Pilar dos fixtures. */
function autoridadesCom(assunto: Assunto | null): RadarCanonicalAuthorities {
  const contexto = assunto ? contextoCom(assunto) : contextoDePesquisa();
  return { google: vistaDoGoogleSobre(contexto), video: null, specialist: null, researchContext: contexto };
}

const dossie = (authorities: RadarCanonicalAuthorities | null, principal: string | null = "skincare facial") => ({
  analysis: { versionId: "analysis-v3", versionNumber: 3, payload: { articleId: "article-1" } },
  article: { brandId: "brand-1", articleId: "article-1", articleDnaVersionId: "art-v2", articleDnaContentHash: HASH },
  profile: "GOOGLE", blueprintView: {}, bundle: { bundleId: "bundle-id-1", bundleHash: "bundle-hash-1" },
  authorities,
  keywordContext: { principal, secondary: [], narrativeReinforcements: [], resolution: "ARTICLE_DNA_HYDRATION" },
  readiness: { ready: true, headline: "Pronto", blocks: [] },
}) as never;

const montar = (authorities: RadarCanonicalAuthorities | null, extra: Record<string, unknown> = {}, principal: string | null = "skincare facial") => buildRadarDocument({
  documentId: radarDocumentId("brand-1", "article-1"), dossier: dossie(authorities, principal), radarItemId: "radar:1",
  title: "Serum facial para principiantes", slug: "serum-facial-principiantes",
  brandDnaRef: ref("brand-dna", "brand-v1"), siloDnaRef: ref("silo-1", "silo-v1"), keywordDnaRefs: [ref("kw-1", "kw-v1")],
  actorUserId: "user-1", now: "2026-09-17T12:00:00.000Z", ...extra,
} as never);

/* ============================ sem Assunto ============================ */

/*
 * MEDIDO ANTES DA MUDANÇA: o mesmo pedido montado pelo `radar-import.ts` do
 * HEAD (cópia com imports reescritos, no scratchpad), com principal
 * "serum facial". O documento não carrega as autoridades, então o hash é o
 * mesmo com ou sem artigo-modelo.
 */
const SNAPSHOT_SEM_ASSUNTO = "8b3666888d4e7b50b817ab203e986709089e959a4af6b3de42340fd97db4c892";

test("sem Assunto · o documento do envio é byte a byte o de antes, com ou sem virada no artigo-modelo", () => {
  const casos = [
    montar(null, {}, "serum facial"),
    montar(null, { subject: null }, "serum facial"),
    montar(null, { subject: undefined }, "serum facial"),
    montar(autoridadesCom(CONSULTA), {}, "serum facial"),
  ];
  for (const documento of casos) {
    assert.equal(sha(documento), SNAPSHOT_SEM_ASSUNTO);
    assert.deepEqual(documento.importedContext.editorialContext, []);
    assert.deepEqual(documento.importedContext.dossier?.writerMayNot, [...RADAR_WRITER_MAY_NOT]);
  }
  assert.equal(sha(RADAR_WRITER_MAY_NOT), sha([...RADAR_WRITER_MAY_NOT]));
});

test("sem Assunto · as linhas ficam vazias para qualquer forma de ausência", () => {
  for (const subject of [null, undefined, {}, { phrase: "" }, { phrase: "   " }, "texto", []]) {
    assert.deepEqual(radarWriterSubjectTurnLines({ subject, turn: null, principal: "x" }), []);
    assert.equal(radarWriterSubjectOf(subject), null);
  }
});

/* ============================ com Assunto ============================ */

const CONTEXTO_DO_CSV: RadarWritingArticleContext = { topRowLabel: "Marca", filePosition: 1, silo: null, articleId: ARTIGO, publication: null };

/*
 * 2026-10-09 · regra do dono: o CSV "Para escrever" sai só com o artigo-modelo
 * concluído, e as linhas do Assunto que a coluna promessa e o título legados
 * escreviam (tronco, virada, direção do H1, destino) foram para o PEDIDO do
 * artigo-modelo; a coluna artigo diz o Assunto e o destino da virada. O Redator
 * continua com as linhas dele (`radarWriterSubjectTurnLines`); a paridade que
 * fica é a do destino e a do texto "sem sinal".
 */
function csvCom(assunto: Assunto) {
  const autoridades = autoridadesCom(assunto);
  const modelo = autoridades.google!.articleModel as RadarEditorialArticleModel;
  const entrada = entradaGoogle({ articleModel: modelo, googleObserved: autoridades.google!.observed, researchContext: autoridades.researchContext! });
  const row = buildRadarWritingExportArticle(entrada, comPlanta(entrada, CONTEXTO_DO_CSV)).row;
  return { autoridades, turn: modelo.declaredSubject as RadarEditorialSubjectTurn, row, linhas: [...row.promessa_e_leitor.split("\n"), ...row.titulo_e_seo.split("\n")] };
}

test("com Assunto · writerMayNot GRAVADO ganha a proibição uma vez, no fim; o bundle e o resto do dossiê não mudam (invariante 78)", () => {
  const sem = montar(autoridadesCom(CONSULTA));
  const com = montar(autoridadesCom(CONSULTA), { subject: doDna(CONSULTA) });
  assert.deepEqual(com.importedContext.dossier?.writerMayNot, [...RADAR_WRITER_MAY_NOT, RADAR_WRITER_MAY_NOT_SUBJECT]);
  const { writerMayNot: _a, ...dossieSem } = sem.importedContext.dossier!;
  const { writerMayNot: _b, ...dossieCom } = com.importedContext.dossier!;
  assert.deepEqual(dossieCom, dossieSem, "fora a proibição, o dossiê é o mesmo");
  assert.deepEqual(com.importedContext.dossier?.bundle, sem.importedContext.dossier?.bundle);
  /* Nada além de `writerMayNot` e `editorialContext` difere entre os dois documentos. */
  const { importedContext: contextoSem, ...restoSem } = sem;
  const { importedContext: contextoCom_, ...restoCom } = com;
  assert.deepEqual(restoCom, restoSem);
  assert.deepEqual({ ...contextoCom_, dossier: null, editorialContext: [] }, { ...contextoSem, dossier: null, editorialContext: [] });
  assert.equal(ContentDocumentV2Schema.safeParse(com).success, true, "o documento continua no contrato do dono");
});

/*
 * ===== 2026-10-09 · A VIRADA SAI DA PLANTA (regra do piloto) =====
 *
 * As linhas "Virada", "Seção da virada" e "Direção do H1" do envio saíam do
 * modelo editorial antigo (`articleModel.declaredSubject`), a mesma leitura que
 * o CSV deixou de escrever (ela foi ao pedido do artigo-modelo). Agora saem da
 * PLANTA concluída que o envio conferiu — a mesma do CSV (`plantaDe`, pela
 * conferência real): a seção dela que trata do Assunto, ou o fechamento.
 */
const plantaDoCsv = (assunto: Assunto) => {
  const { autoridades } = csvCom(assunto);
  const entrada = entradaGoogle({ articleModel: autoridades.google!.articleModel as RadarEditorialArticleModel, googleObserved: autoridades.google!.observed, researchContext: autoridades.researchContext! });
  return { autoridades, planta: comPlanta(entrada, CONTEXTO_DO_CSV).blueprint! };
};

test("com Assunto · as linhas da virada saem da PLANTA concluída (a mesma do CSV), não do modelo editorial antigo", () => {
  for (const assunto of [CONSULTA, ORDEM, ROTINA]) {
    const { autoridades, planta } = plantaDoCsv(assunto);
    const { linhas: doCsv, row } = csvCom(assunto);
    const documento = montar(autoridades, { subject: doDna(assunto), articleBlueprint: planta.blueprint });
    const linhas = documento.importedContext.editorialContext;
    assert.deepEqual(linhas, radarWriterSubjectTurnLinesFromBlueprint({ subject: doDna(assunto), blueprint: planta.blueprint, principal: "skincare facial" }));
    for (const prefixo of ["Tronco (Assunto): ", "Virada: ", "Destino da chamada: "]) {
      const nossa = linhas.find(item => item.startsWith(prefixo));
      /* Sem destino não há linha de destino; tronco e virada existem sempre. */
      assert.equal(Boolean(nossa), prefixo !== "Destino da chamada: " || Boolean(assunto.destinationUrl), `${assunto.phrase} · ${prefixo} ausente`);
      assert.equal(doCsv.some(item => item.startsWith(prefixo)), false, `${assunto.phrase} · ${prefixo} no CSV`);
    }
    /* O Assunto e o destino ditos no CSV (coluna artigo) são os mesmos do Redator. */
    assert.ok(row.artigo.split("\n").includes(`Assunto (tronco): ${assunto.phrase}${assunto.destinationUrl ? ` — destino da virada: ${assunto.destinationUrl}` : ""}`), row.artigo);
    if (assunto.destinationUrl) assert.ok(linhas.find(item => item.startsWith("Destino da chamada: "))!.includes(assunto.destinationUrl));
    /* A virada diz onde NA PLANTA: a seção dela (com o número) ou o fechamento; nunca a leitura da amostra. */
    const virada = linhas.find(item => item.startsWith("Virada: "))!;
    assert.match(virada, /do artigo-modelo/, virada);
    assert.equal(/sem sinal na SERP|a amostra já trata|título é de trabalho/.test(linhas.join("\n")), false, `${assunto.phrase}: nada da régua antiga`);
    assert.equal(linhas.some(item => item.startsWith("Alerta do Radar sobre o Assunto: ")), false, "o alerta era leitura da amostra, não da planta");
    const h1 = linhas.find(item => /^(Direção do H1: |Assunto em H2\/H3|Assunto no H1: )/.test(item));
    assert.ok(h1?.includes(planta.blueprint.title.h1), `${assunto.phrase}: a linha do H1 cita o H1 da planta`);
  }
  /* "Rotina de skincare facial" está na seção 1 da planta do CSV; "Consulta dermatológica online", em seção nenhuma. */
  const rotina = montar(plantaDoCsv(ROTINA).autoridades, { subject: doDna(ROTINA), articleBlueprint: plantaDoCsv(ROTINA).planta.blueprint }).importedContext.editorialContext;
  assert.ok(rotina.includes('Seção da virada: "Como montar a rotina de skincare facial no dia a dia?", seção 1 do artigo-modelo concluído.'), rotina.join("\n"));
  const consulta = montar(plantaDoCsv(CONSULTA).autoridades, { subject: doDna(CONSULTA), articleBlueprint: plantaDoCsv(CONSULTA).planta.blueprint }).importedContext.editorialContext;
  assert.match(consulta.find(item => item.startsWith("Virada: "))!, /^Virada: no fechamento do artigo-modelo, antes do CTA/);
  assert.equal(consulta.some(item => item.startsWith("Seção da virada: ")), false);
  assert.equal(RADAR_WRITER_SUBJECT_H1_NO_SIGNAL, RADAR_WRITING_SUBJECT_H1_NO_SIGNAL, "o texto sem sinal é o mesmo nos dois lugares (régua antiga, lida só pelas linhas já gravadas)");
});

/*
 * 2026-10-08 (correção) · A PARIDADE COM PAA. O CSV nomeia a seção pela pergunta
 * do leitor (o título da coluna estrutura) e o Redator nomeava pelo cabeçalho
 * sem molde: com a pergunta diferente do cabeçalho — o caso comum quando há
 * PAA —, as linhas "Virada" divergiam nos três Assuntos.
 */
/*
 * 2026-10-09 · O MODELO ANTIGO NÃO MANDA MAIS NA VIRADA. Antes, trocar a
 * pergunta do leitor da seção do modelo editorial mudava a "Virada" do
 * Redator. Agora o modelo antigo é só matéria-prima do gerador da planta: com
 * a MESMA planta, mexer nele (pergunta, sugestão de virada) não muda uma linha.
 */
test("com Assunto · com a mesma planta, mexer no modelo editorial antigo não muda a 'Virada' do Redator", () => {
  const PERGUNTA = "Por onde começar quando a pele reage a tudo?";
  for (const assunto of [CONSULTA, ORDEM, ROTINA]) {
    const { autoridades, planta } = plantaDoCsv(assunto);
    const modelo = structuredClone(autoridades.google!.articleModel) as RadarEditorialArticleModel;
    const turn = modelo.declaredSubject as RadarEditorialSubjectTurn;
    const alvos = new Set([turn.turnSection?.heading, turn.turnSection?.hostHeading, turn.suggestedPosition?.afterHeading].filter(Boolean));
    const visitar = (secoes: RadarEditorialArticleModel["sections"]) => {
      for (const secao of secoes) {
        if (alvos.has(secao.headingSuggestion)) secao.readerQuestion = PERGUNTA;
        visitar(secao.childSections);
      }
    };
    visitar(modelo.sections);
    const comPergunta = { ...autoridades, google: { ...autoridades.google!, articleModel: modelo } } as RadarCanonicalAuthorities;
    const semModelo = { ...autoridades, google: null } as RadarCanonicalAuthorities;
    const base = montar(autoridades, { subject: doDna(assunto), articleBlueprint: planta.blueprint }).importedContext.editorialContext;
    assert.deepEqual(montar(comPergunta, { subject: doDna(assunto), articleBlueprint: planta.blueprint }).importedContext.editorialContext, base, assunto.phrase);
    assert.deepEqual(montar(semModelo, { subject: doDna(assunto), articleBlueprint: planta.blueprint }).importedContext.editorialContext, base, `${assunto.phrase}: sem a fotografia do Google, a planta basta`);
    assert.equal(base.join("\n").includes(PERGUNTA), false);
    /* O CSV "Para escrever" (com a planta) também não escreve a "Virada": ela foi ao pedido do artigo-modelo. */
    const entrada = entradaGoogle({ articleModel: modelo, googleObserved: autoridades.google!.observed, researchContext: autoridades.researchContext! });
    assert.equal(buildRadarWritingExportArticle(entrada, comPlanta(entrada, CONTEXTO_DO_CSV)).row.promessa_e_leitor.split("\n").some(item => item.startsWith("Virada: ")), false, assunto.phrase);
  }
});

test("com Assunto · a seção da virada é a da planta (com o número); um H3 que traz o Assunto vira o lugar; sem seção, o fechamento antes do CTA", () => {
  const { autoridades, planta } = plantaDoCsv(CONSULTA);
  /* Sem seção da planta que trate da consulta: fechamento, sem "Seção da virada" e sem título de trabalho. */
  const fechamento = montar(autoridades, { subject: doDna(CONSULTA), articleBlueprint: planta.blueprint }).importedContext.editorialContext;
  assert.equal(fechamento.some(item => item.startsWith("Seção da virada: ")), false);
  assert.equal(fechamento.join("\n").includes("Virada para Consulta"), false, "o título de trabalho do Radar era da régua antiga");
  /* A mesma planta com um H3 sobre a consulta na seção 2: o lugar é o H3. */
  const comH3 = structuredClone(planta.blueprint) as typeof planta.blueprint;
  const segunda = comH3.sections[1] as { h2: string; h3?: string[] };
  segunda.h3 = [...(segunda.h3 ?? []), "Quando a consulta dermatológica online resolve"];
  const noH3 = montar(autoridades, { subject: doDna(CONSULTA), articleBlueprint: comH3 }).importedContext.editorialContext;
  assert.ok(noH3.includes(`Virada: no H3 "Quando a consulta dermatológica online resolve" da seção "${segunda.h2}" do artigo-modelo (seção 2), levar o leitor de skincare facial a Consulta dermatológica online; destino: https://careglow.com.br/consulta-online.`), noH3.join("\n"));
  assert.ok(noH3.includes(`Seção da virada: "${segunda.h2}", seção 2 do artigo-modelo concluído, no H3 "Quando a consulta dermatológica online resolve".`), noH3.join("\n"));
  assert.ok(noH3.some(item => item.startsWith("Assunto em H2/H3 — o H1 é da principal")), noH3.join("\n"));
});

test("com Assunto · sem a planta em mãos (o envio ainda não a passa), a virada aponta a seção do artigo-modelo concluído, sem lugar inventado e sem a régua da amostra", () => {
  const esperadas = (assunto: Assunto) => [
    `Tronco (Assunto): ${assunto.phrase} — A marca atende por teleconsulta.`,
    `Virada: na seção do artigo-modelo concluído que tratar do Assunto (ou no fechamento, antes do CTA, se nenhuma tratar), levar o leitor de skincare facial a ${assunto.phrase}; destino: ${assunto.destinationUrl}.`,
    "Assunto no H1: o H1 é da principal.",
    `Destino da chamada: Levar o leitor a ${assunto.destinationUrl}.`,
  ];
  assert.deepEqual(montar(null, { subject: doDna(CONSULTA) }).importedContext.editorialContext, esperadas(CONSULTA));
  /* A virada do modelo antigo (de "Ordem dos ácidos" ou de qualquer outro) não entra: as linhas são as mesmas. */
  assert.deepEqual(montar(autoridadesCom(ORDEM), { subject: doDna(CONSULTA) }).importedContext.editorialContext, esperadas(CONSULTA));
  assert.deepEqual(montar(autoridadesCom(CONSULTA), { subject: doDna(CONSULTA) }).importedContext.editorialContext, esperadas(CONSULTA));
  /* Sem principal resolvida, o texto não inventa uma. */
  const semPrincipal = montar(null, { subject: doDna(ORDEM) }, null).importedContext.editorialContext;
  assert.deepEqual(semPrincipal, [
    "Tronco (Assunto): Ordem dos ácidos no rosto.",
    "Virada: na seção do artigo-modelo concluído que tratar do Assunto (ou no fechamento, antes do CTA, se nenhuma tratar), levar o leitor da keyword principal a Ordem dos ácidos no rosto.",
    "Assunto no H1: o H1 é da principal.",
  ]);
  assert.equal(semPrincipal.some(item => item === RADAR_WRITER_SUBJECT_H1_NO_SIGNAL), false, "o texto 'sem sinal' era da régua da amostra");
  /* 2026-10-09 · o CSV "Para escrever" não escreve mais a virada (ela vai ao pedido do artigo-modelo): nenhuma "de a keyword principal" volta. */
  const fonteDoCsv = semComentarios("../lib/radar/portable-writing-export.ts");
  assert.equal(fonteDoCsv.includes("levar o leitor"), false);
  assert.equal(fonteDoCsv.includes("\"a keyword principal\";"), false);
});

test("com Assunto · linhas curtas: nota de 280 caracteres e destino longo ficam abaixo de 2 kB", () => {
  const longo: Assunto = { phrase: "Consulta dermatológica online", note: "n".repeat(280), destinationUrl: `https://careglow.com.br/${"consulta-online/".repeat(8)}agendar` };
  const { autoridades, planta } = plantaDoCsv(CONSULTA);
  const linhas = montar(autoridades, { subject: doDna(longo), articleBlueprint: planta.blueprint }).importedContext.editorialContext;
  const bytes = Buffer.byteLength(JSON.stringify(linhas));
  /* 2026-10-09 · tronco, virada, H1 e destino (o alerta da amostra saiu com a régua antiga). */
  assert.ok(linhas.length >= 4 && bytes < 2_048, `${linhas.length} linhas, ${bytes} B`);
});

/* ============================ o envio ============================ */

const semComentarios = (caminho: string) => readFileSync(new URL(caminho, import.meta.url), "utf8")
  .replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

test("ESTRUTURAL · o envio passa o Assunto da MESMA versão que a identidade fixa, e o recibo grava a mesma lista do documento", () => {
  const envio = semComentarios("../lib/server/radar-writer-send.ts");
  assert.match(envio, /subject: identidade\.article\.payload\.subject \?\? null,\s*\}\)\);/);
  assert.match(envio, /writerMayNot: \[\.\.\.radarWriterMayNotFor\(identidade\.article\.payload\.subject \?\? null\)\],/);
  assert.doesNotMatch(envio, /RADAR_WRITER_MAY_NOT\b/, "nenhuma lista fixa ao lado da derivada");
  const dominio = semComentarios("../lib/redator/radar-import.ts");
  assert.match(dominio, /writerMayNot: \[\.\.\.radarWriterMayNotFor\(radarWriterSubjectOf\(subject\)\)\],/);
  /* 2026-10-09 · a virada do envio sai da planta que o envio passa, não do modelo editorial antigo. */
  assert.match(dominio, /editorialContext: radarWriterSubjectTurnLinesFromBlueprint\(\{\s*subject: input\.subject,\s*blueprint: input\.articleBlueprint \?\? null,/);
  assert.doesNotMatch(dominio, /radarWriterSubjectTurnLines\(|declaredSubject/, "nada do modelo antigo no envio");
  assert.match(dominio, /dossier: radarWriterDossierOf\(dossier, input\.subject\),/);
});

test("PROVIDER_CALLS = 0", () => {
  assert.deepEqual(idasAoServidor, []);
});
