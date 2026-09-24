import assert from "node:assert/strict";
import test from "node:test";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

import { buildRadarDocument, radarDocumentId } from "../lib/redator/radar-import.ts";
import {
  RADAR_WRITER_SUBJECT_H1_NO_SIGNAL,
  radarWriterSubjectOf,
  radarWriterSubjectTurnLines,
} from "../lib/redator/radar-subject-turn.ts";
import { RADAR_WRITER_MAY_NOT, RADAR_WRITER_MAY_NOT_SUBJECT } from "../lib/redator/writer-handoff.ts";
import { ContentDocumentV2Schema } from "../lib/arquiteto/contracts.ts";
import { RADAR_WRITING_SUBJECT_H1_NO_SIGNAL, buildRadarWritingExportArticle, type RadarWritingArticleContext } from "../lib/radar/portable-writing-export.ts";
import type { RadarEditorialArticleModel, RadarEditorialSubjectTurn } from "../lib/radar/editorial-article-model.ts";
import type { RadarArticleResearchContext } from "../lib/radar/article-research-context.ts";
import type { RadarCanonicalAuthorities } from "../lib/server/radar-canonical-authorities.ts";
import { ARTIGO, contextoDePesquisa, entradaGoogle, vistaDoGoogleSobre } from "./radar-portable-writing-fixtures.mts";

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
 *      virar, da seção da virada, da direção do H1, do destino e do alerta,
 *      com o MESMO texto do CSV "Para escrever";
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

function csvCom(assunto: Assunto) {
  const autoridades = autoridadesCom(assunto);
  const modelo = autoridades.google!.articleModel as RadarEditorialArticleModel;
  const row = buildRadarWritingExportArticle(
    entradaGoogle({ articleModel: modelo, googleObserved: autoridades.google!.observed, researchContext: autoridades.researchContext! }),
    CONTEXTO_DO_CSV,
  ).row;
  return { autoridades, turn: modelo.declaredSubject as RadarEditorialSubjectTurn, linhas: [...row.promessa_e_leitor.split("\n"), ...row.titulo_e_seo.split("\n")] };
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

test("com Assunto · as linhas da virada dizem o MESMO que o CSV \"Para escrever\" (tronco, virada, H1, destino)", () => {
  for (const assunto of [CONSULTA, ORDEM, ROTINA]) {
    const { autoridades, turn, linhas: doCsv } = csvCom(assunto);
    const documento = montar(autoridades, { subject: doDna(assunto) });
    const linhas = documento.importedContext.editorialContext;
    assert.deepEqual(linhas, radarWriterSubjectTurnLines({ subject: doDna(assunto), turn, principal: "skincare facial" }));
    for (const prefixo of ["Tronco (Assunto): ", "Virada: ", "Destino da chamada: "]) {
      const nossa = linhas.find(item => item.startsWith(prefixo));
      const doExport = doCsv.find(item => item.startsWith(prefixo));
      assert.equal(nossa, doExport, `${assunto.phrase} · ${prefixo}`);
      /* Sem destino não há linha de destino, dos dois lados; tronco e virada existem sempre. */
      assert.equal(Boolean(nossa), prefixo !== "Destino da chamada: " || Boolean(assunto.destinationUrl), `${assunto.phrase} · ${prefixo} ausente`);
    }
    const h1 = linhas.find(item => /^(Direção do H1: |Assunto em H2\/H3|Assunto no H1: )/.test(item));
    assert.ok(h1, `${assunto.phrase}: sem linha do H1`);
    assert.ok(doCsv.includes(h1!), `${assunto.phrase}: a linha do H1 difere do CSV (${h1})`);
    assert.ok(linhas.some(item => item.startsWith("Seção da virada: ")), `${assunto.phrase}: a seção da virada chega ao Redator`);
  }
  assert.equal(RADAR_WRITER_SUBJECT_H1_NO_SIGNAL, RADAR_WRITING_SUBJECT_H1_NO_SIGNAL, "o texto sem sinal é o mesmo nos dois lugares");
});

test("com Assunto · a seção da virada chega: sintética diz que o título é de trabalho; a observada diz que a amostra já a trata", () => {
  const consulta = csvCom(CONSULTA);
  assert.equal(consulta.turn.turnSection.source, "SYNTHETIC");
  const sintetica = montar(consulta.autoridades, { subject: doDna(CONSULTA) }).importedContext.editorialContext
    .find(item => item.startsWith("Seção da virada: "))!;
  assert.match(sintetica, /^Seção da virada: "Virada para Consulta dermatológica online", como ponto a cobrir em "[^"]+": exigida pelo ArticleDNA sem página na amostra; o título é de trabalho do Radar, reescreva para o leitor\.$/);
  assert.ok(consulta.turn.alert, "o fixture tem alerta: nenhuma página toca o Assunto");
  assert.ok(montar(consulta.autoridades, { subject: doDna(CONSULTA) }).importedContext.editorialContext
    .includes(`Alerta do Radar sobre o Assunto: ${consulta.turn.alert}`), "o alerta chega a quem escreve");

  const rotina = csvCom(ROTINA);
  assert.equal(rotina.turn.turnSection.source, "OBSERVED_GROUP");
  const observada = montar(rotina.autoridades, { subject: doDna(ROTINA) }).importedContext.editorialContext
    .find(item => item.startsWith("Seção da virada: "))!;
  assert.ok(observada.includes(`"${rotina.turn.turnSection.heading}"`), observada);
  assert.match(observada, /é o bloco da amostra que já trata o Assunto \(\d+ de \d+ página\(s\)\)\.$/);
  assert.equal(observada.includes("sem sinal"), false);
});

test("com Assunto · sem sugestão do Radar (sem fotografia do Google, ou virada de OUTRO Assunto), as linhas devolvem a decisão e não inventam lugar", () => {
  const esperadas = (assunto: Assunto) => [
    `Tronco (Assunto): ${assunto.phrase} — A marca atende por teleconsulta.`,
    `Virada: onde quem redige decidir (sem sinal na SERP), levar o leitor de skincare facial a ${assunto.phrase}; destino: ${assunto.destinationUrl}.`,
    RADAR_WRITER_SUBJECT_H1_NO_SIGNAL,
    `Destino da chamada: Levar o leitor a ${assunto.destinationUrl}.`,
  ];
  assert.deepEqual(montar(null, { subject: doDna(CONSULTA) }).importedContext.editorialContext, esperadas(CONSULTA));
  /* A virada do modelo é de "Ordem dos ácidos": não vale para o Assunto do ArticleDNA. */
  assert.deepEqual(montar(autoridadesCom(ORDEM), { subject: doDna(CONSULTA) }).importedContext.editorialContext, esperadas(CONSULTA));
  /* Sem principal resolvida, o texto não inventa uma. */
  const semPrincipal = montar(null, { subject: doDna(ORDEM) }, null).importedContext.editorialContext;
  assert.deepEqual(semPrincipal, [
    "Tronco (Assunto): Ordem dos ácidos no rosto.",
    "Virada: onde quem redige decidir (sem sinal na SERP), levar o leitor da keyword principal a Ordem dos ácidos no rosto.",
    RADAR_WRITER_SUBJECT_H1_NO_SIGNAL,
  ]);
  /* O CSV "Para escrever" usa o MESMO recurso sem principal ("da keyword principal", nunca "de a keyword principal"). */
  const fonteDoCsv = readFileSync(new URL("../lib/radar/portable-writing-export.ts", import.meta.url), "utf8");
  assert.ok(fonteDoCsv.includes("levar o leitor ${principal ? `de ${principal}` : \"da keyword principal\"} a ${assunto.phrase}"));
  assert.equal(fonteDoCsv.includes("\"a keyword principal\";"), false);
});

test("com Assunto · linhas curtas: nota de 280 caracteres e destino longo ficam abaixo de 2 kB", () => {
  const longo: Assunto = { phrase: "Consulta dermatológica online", note: "n".repeat(280), destinationUrl: `https://careglow.com.br/${"consulta-online/".repeat(8)}agendar` };
  const { autoridades } = csvCom(CONSULTA);
  const linhas = montar(autoridades, { subject: doDna(longo) }).importedContext.editorialContext;
  const bytes = Buffer.byteLength(JSON.stringify(linhas));
  assert.ok(linhas.length >= 5 && bytes < 2_048, `${linhas.length} linhas, ${bytes} B`);
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
  assert.match(dominio, /editorialContext: radarWriterSubjectTurnLines\(\{/);
  assert.match(dominio, /dossier: radarWriterDossierOf\(dossier, input\.subject\),/);
});

test("PROVIDER_CALLS = 0", () => {
  assert.deepEqual(idasAoServidor, []);
});
