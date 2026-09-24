/**
 * ===== SDD do Assunto, F4.2 · o Assunto no painel e na semeadura do Redator =====
 *
 * COMPORTAMENTAL — a projeção única (`radarFoundationsOf`) passa a expor as
 * linhas de `importedContext.editorialContext`; sem linhas, sai idêntica ao
 * HEAD (snapshot medido com o código do HEAD). A leitura do Assunto para a
 * tela, a semeadura de roteiro e carrossel e a leitura estreita da semeadura.
 *
 * ESTRUTURAL — o painel lê o Assunto pela projeção, no topo, e a semeadura do
 * servidor passa as linhas do cabeçalho para a mesma projeção.
 *
 * Fixtures, sem rede, sem banco, sem IA.
 */

import assert from "node:assert/strict";
import test from "node:test";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { radarFoundationsOf, radarFoundationsOfDossier, radarFoundationsSubjectOf } from "../lib/redator/radar-foundations.ts";
import {
  buildCarouselSeedPrompt, buildScriptSeedPrompt, seedContextLines,
  SEED_EDITORIAL_CONTEXT_SECTION_TITLE, SEED_SUBJECT_SECTION_TITLE,
} from "../lib/redator/deliverable-seed.ts";
import {
  WRITER_SEED_BUNDLE_SELECTS, WRITER_SEED_DOCUMENT_SELECT, writerSeedDossierFromRows, writerSeedHeadFromRow,
} from "../lib/redator/writer-document-reads.ts";
import { RADAR_WRITER_SUBJECT_H1_NO_SIGNAL, radarWriterSubjectTurnLines } from "../lib/redator/radar-subject-turn.ts";
import { ContentDocumentSchema, type ContentDocument } from "../lib/arquiteto/contracts.ts";
import { toListingForm, type ListedContentDocument } from "../lib/editorial/content-document-listing.ts";
import { ASSUNTO, PRINCIPAL, documentoDoPainel, linhasDoAssunto, viradaObservada } from "./redator-assunto-painel-fixtures.mts";

let chamadasDeRede = 0;
globalThis.fetch = (() => { chamadasDeRede += 1; return Promise.reject(new Error("REDE PROIBIDA NESTE TESTE")); }) as typeof fetch;

const fonte = (caminho: string) => readFile(new URL(caminho, import.meta.url), "utf8");
const semComentarios = (texto: string) => texto
  .replace(/\{\/\*[\s\S]*?\*\/\}/g, " ")
  .replace(/\/\*[\s\S]*?\*\//g, " ")
  .replace(/^\s*\/\/[^\n]*/gm, " ");
const sha = (texto: string) => createHash("sha256").update(texto).digest("hex");
const fundamentos = (editorialContext?: string[]) => radarFoundationsOf(documentoDoPainel(editorialContext));
const fonteDaSemente = (editorialContext?: string[]) => ({ title: "rotina de skincare", foundations: fundamentos(editorialContext)!, finalArticle: null });

/*
 * Medidos em 2026-09-24 com `radar-foundations.ts` e `deliverable-seed.ts`
 * do HEAD (copiados para fora do repositório, imports reescritos) sobre esta
 * mesma fixture: projeção e prompts saíram IGUAIS aos do código novo, com
 * `editorialContext` ausente e com `[]`.
 */
const SHA_DA_PROJECAO_DO_HEAD = "104497fe9c85da5f";
const SHA_DOS_PROMPTS_DO_HEAD = "7b664c0588e00a4e";

test("P1 · sem linhas, a projeção é a do HEAD, byte a byte, e não ganha chave", () => {
  for (const [nome, linhas] of [["ausente", undefined], ["vazia", []]] as const) {
    const f = fundamentos(linhas as string[] | undefined);
    assert.ok(f, nome);
    assert.equal("editorialContext" in f, false, `${nome}: chave nova sem Assunto`);
    assert.equal(sha(JSON.stringify(f)).slice(0, 16), SHA_DA_PROJECAO_DO_HEAD, `${nome}: projeção diferente do HEAD`);
    assert.equal(radarFoundationsSubjectOf(f), null, nome);
  }
  const dossie = (documentoDoPainel() as unknown as { importedContext: { dossier: unknown } }).importedContext;
  const base = radarFoundationsOfDossier(dossie.dossier);
  for (const lixo of [undefined, null, [], ["", "   "], [1, {}, null], "linha solta", { linhas: ["x"] }]) {
    assert.deepEqual(radarFoundationsOfDossier(dossie.dossier, { editorialContext: lixo }), base, JSON.stringify(lixo));
  }
});

test("P2 · com linhas, a projeção só ganha `editorialContext`, com as linhas do envio na ordem", () => {
  const linhas = linhasDoAssunto();
  const sem = fundamentos([])!;
  const com = fundamentos(linhas)!;
  assert.deepEqual(com.editorialContext, linhas);
  const { editorialContext: _linhas, ...resto } = com;
  assert.deepEqual({ ...resto, writerMayNot: sem.writerMayNot }, sem, "fora as linhas (e a proibição gravada no dossiê), nada muda");
  assert.ok(com.writerMayNot.length === sem.writerMayNot.length + 1, "a proibição do Assunto vem do dossiê gravado, uma vez");
  assert.ok(ContentDocumentSchema.safeParse(documentoDoPainel(linhas)).success, "a fixture é um documento válido");
});

test("P3 · a cópia de listagem (sem o bundle) leva as mesmas linhas ao painel", () => {
  const linhas = linhasDoAssunto();
  const listado = toListingForm(ContentDocumentSchema.parse(documentoDoPainel(linhas)) as ListedContentDocument);
  const f = radarFoundationsOf(listado as unknown as ContentDocument);
  assert.deepEqual(f?.editorialContext, linhas);
  const semAssunto = radarFoundationsOf(toListingForm(ContentDocumentSchema.parse(documentoDoPainel([]))) as unknown as ContentDocument);
  assert.equal(semAssunto && "editorialContext" in semAssunto, false);
});

test("P4 · v1 e v2 sem dossiê seguem sem fundamentos, mesmo com linhas", () => {
  const semDossie = documentoDoPainel(linhasDoAssunto()) as unknown as { importedContext: Record<string, unknown> };
  semDossie.importedContext.dossier = null;
  assert.equal(radarFoundationsOf(semDossie as unknown as ContentDocument), null);
  assert.equal(radarFoundationsOf({ schemaVersion: 1 } as unknown as ContentDocument), null);
  assert.equal(radarFoundationsOf(null), null);
});

test("S1 · o Assunto para a tela: tronco, nota, virada, seção de trabalho, H1, destino e alerta", () => {
  const assunto = radarFoundationsSubjectOf(fundamentos(linhasDoAssunto()));
  assert.ok(assunto);
  assert.equal(assunto.phrase, ASSUNTO.phrase);
  assert.equal(assunto.note, `${ASSUNTO.note}.`);
  assert.match(assunto.turn || "", new RegExp(`levar o leitor de ${PRINCIPAL} a ${ASSUNTO.phrase}`));
  assert.match(assunto.section || "", /^"Virada para sérum de vitamina C", como H3 em "Passo a passo da rotina"/);
  assert.equal(assunto.sectionIsWorkingTitle, true, "seção sintética: título de trabalho do Radar");
  assert.match(assunto.h1 || "", /^rotina de skincare \+ complemento "com sérum de vitamina C"/);
  assert.equal(assunto.destination, `Levar o leitor a ${ASSUNTO.destinationUrl}.`);
  assert.equal(assunto.alert, "Só 2 de 8 páginas tocam o Assunto: a sustentação é fraca.");
  assert.deepEqual(assunto.others, []);
});

test("S2 · seção observada não é título de trabalho; sem sugestão, a decisão volta a quem redige", () => {
  const observada = radarFoundationsSubjectOf(fundamentos(linhasDoAssunto(viradaObservada())));
  assert.ok(observada);
  assert.equal(observada.sectionIsWorkingTitle, false);
  assert.match(observada.section || "", /já trata o Assunto \(2 de 8 página\(s\)\)/);

  const semVirada = radarFoundationsSubjectOf(fundamentos(linhasDoAssunto(null)));
  assert.ok(semVirada);
  assert.equal(semVirada.section, null);
  assert.equal(semVirada.sectionIsWorkingTitle, false);
  assert.equal(semVirada.alert, null);
  assert.equal(semVirada.h1, RADAR_WRITER_SUBJECT_H1_NO_SIGNAL);
  assert.match(semVirada.turn || "", /onde quem redige decidir/);
});

test("S3 · linha desconhecida não some; sem a linha do tronco não há Assunto na tela", () => {
  const comExtra = radarFoundationsSubjectOf({ editorialContext: [...linhasDoAssunto(), "Linha nova do envio."] });
  assert.deepEqual(comExtra?.others, ["Linha nova do envio."]);
  assert.equal(radarFoundationsSubjectOf({ editorialContext: ["Contexto editorial."] }), null);
  assert.equal(radarFoundationsSubjectOf({ editorialContext: [] }), null);
  assert.equal(radarFoundationsSubjectOf(null), null);
  const semNota = radarFoundationsSubjectOf({ editorialContext: ["Tronco (Assunto): sérum de vitamina C."] });
  assert.equal(semNota?.phrase, "sérum de vitamina C");
  assert.equal(semNota?.note, null);
});

test("S4 · travessão na frase ou na nota: a linha da virada decide onde a frase acaba", () => {
  const telaDe = (phrase: string, note: string | null, destinationUrl: string | null = null) => radarFoundationsSubjectOf({
    editorialContext: radarWriterSubjectTurnLines({ subject: { phrase, note, destinationUrl }, turn: null, principal: PRINCIPAL }),
  });
  const naFrase = telaDe("clínica estética — pele oleosa", "o leitor chega pela rotina");
  assert.equal(naFrase?.phrase, "clínica estética — pele oleosa");
  assert.equal(naFrase?.note, "o leitor chega pela rotina.");
  const naNota = telaDe("sérum de vitamina C", "a virada vem depois da rotina — sem pressa");
  assert.equal(naNota?.phrase, "sérum de vitamina C");
  assert.equal(naNota?.note, "a virada vem depois da rotina — sem pressa.");
  const comDestino = telaDe("clínica estética — pele oleosa", "nota curta", "https://exemplo.test/clinica");
  assert.equal(comDestino?.phrase, "clínica estética — pele oleosa");
  assert.equal(comDestino?.note, "nota curta.");
  const semVirada = radarFoundationsSubjectOf({ editorialContext: ["Tronco (Assunto): a — b — c."] });
  assert.equal(semVirada?.phrase, "a", "sem a linha da virada, vale o primeiro travessão");
  assert.equal(semVirada?.note, "b — c.");
});

test("R1 · semeadura sem Assunto: contexto e prompts iguais aos do HEAD", () => {
  for (const linhas of [undefined, []]) {
    const fonteSemente = fonteDaSemente(linhas);
    const prompts = `${buildScriptSeedPrompt(fonteSemente)}\n${buildCarouselSeedPrompt(fonteSemente)}`;
    assert.equal(sha(prompts).slice(0, 16), SHA_DOS_PROMPTS_DO_HEAD);
    const contexto = seedContextLines(fonteSemente).join("\n");
    assert.ok(!contexto.includes(SEED_SUBJECT_SECTION_TITLE) && !contexto.includes(SEED_EDITORIAL_CONTEXT_SECTION_TITLE));
  }
});

test("R2 · semeadura com Assunto: roteiro e carrossel recebem as MESMAS linhas, logo depois das keywords", () => {
  const linhas = linhasDoAssunto();
  const fonteSemente = fonteDaSemente(linhas);
  const contexto = seedContextLines(fonteSemente);
  const inicio = contexto.indexOf(`${SEED_SUBJECT_SECTION_TITLE}:`);
  assert.ok(inicio > 0, "o cabeçalho do Assunto está no contexto");
  assert.match(contexto[inicio - 1], /^Reforços narrativos: /, "logo depois das keywords");
  assert.deepEqual(contexto.slice(inicio + 1, inicio + 1 + linhas.length), linhas.map(linha => `- ${linha}`));
  assert.match(contexto[inicio + 1 + linhas.length], /^Recomendação editorial do Radar/);
  for (const prompt of [buildScriptSeedPrompt(fonteSemente), buildCarouselSeedPrompt(fonteSemente)]) {
    for (const linha of linhas) assert.ok(prompt.includes(`- ${linha}`), linha);
  }
  const semTronco = seedContextLines(fonteDaSemente(["Contexto editorial."]));
  assert.ok(semTronco.includes(`${SEED_EDITORIAL_CONTEXT_SECTION_TITLE}:`) && !semTronco.includes(`${SEED_SUBJECT_SECTION_TITLE}:`),
    "linha sem tronco entra, mas não se apresenta como Assunto");
});

function simularPostgrest(linha: Record<string, unknown>, select: string): Record<string, unknown> {
  return Object.fromEntries(select.split(",").map(coluna => {
    const [apelido, expressao] = coluna.includes(":") ? coluna.split(":") : [coluna, coluna];
    const [base, ...caminho] = expressao.split("->");
    let valor: unknown = linha[base];
    for (const chave of caminho) valor = valor && typeof valor === "object" && !Array.isArray(valor) ? (valor as Record<string, unknown>)[chave] : undefined;
    return [apelido, valor === undefined ? null : valor];
  }));
}

function fundamentosDaSemeadura(documento: ContentDocument) {
  const linha = { id: "doc", content_hash: "sha256:doc", payload: JSON.parse(JSON.stringify(documento)) };
  const cabeca = writerSeedHeadFromRow(simularPostgrest(linha, WRITER_SEED_DOCUMENT_SELECT));
  if (!cabeca?.dossier) return { cabeca, fundamentos: null };
  const dossie = writerSeedDossierFromRows(cabeca.dossier, WRITER_SEED_BUNDLE_SELECTS.map(select => simularPostgrest(linha, select)));
  return { cabeca, fundamentos: radarFoundationsOfDossier(dossie, { editorialContext: cabeca.editorialContext }) };
}

test("L1 · a leitura estreita da semeadura traz as linhas e projeta o mesmo que o documento inteiro", () => {
  for (const linhas of [undefined, [], linhasDoAssunto(), linhasDoAssunto(viradaObservada())]) {
    const documento = documentoDoPainel(linhas);
    const { cabeca, fundamentos: pelaSemeadura } = fundamentosDaSemeadura(documento);
    assert.deepEqual(cabeca?.editorialContext, linhas ?? []);
    assert.deepEqual(pelaSemeadura, radarFoundationsOf(JSON.parse(JSON.stringify(documento))), JSON.stringify(linhas)?.slice(0, 40));
  }
  const colunas = WRITER_SEED_DOCUMENT_SELECT.split(",");
  assert.ok(colunas.includes("d_editorialContext:payload->importedContext->editorialContext"), "um caminho estreito, na mesma consulta");
  assert.equal(colunas.filter(coluna => coluna.includes("editorialContext")).length, 1);
});

test("L2 · linhas fora do contrato tornam o documento incompatível, como a leitura inteira", () => {
  const quebrado = documentoDoPainel(linhasDoAssunto()) as unknown as { importedContext: Record<string, unknown> };
  quebrado.importedContext.editorialContext = [1, 2];
  assert.equal(ContentDocumentSchema.safeParse(quebrado).success, false, "a leitura inteira recusaria");
  const linha = { content_hash: "h", payload: quebrado };
  assert.equal(writerSeedHeadFromRow(simularPostgrest(linha, WRITER_SEED_DOCUMENT_SELECT)), null);
});

test("E1 · o painel mostra o Assunto no topo, pela projeção, em texto de 14px", async () => {
  const painel = semComentarios(await fonte("../modules/redator/writer-radar-foundations-panel.tsx"));
  assert.match(painel, /radarFoundationsSubjectOf\(fundamentos\)/, "o Assunto sai da MESMA projeção");
  assert.doesNotMatch(painel, /importedContext|editorialContext/, "o painel não lê o documento por fora da projeção");
  const topo = painel.indexOf("<AssuntoDoArtigo");
  assert.ok(topo > 0 && topo < painel.indexOf('testid="recommendation"'), "o bloco vem antes da recomendação");
  assert.match(painel, /\{assunto && <AssuntoDoArtigo assunto=\{assunto\}\/>\}/, "sem Assunto, o bloco não existe");

  const inicio = painel.indexOf("function CampoDoAssunto");
  const fim = painel.indexOf("export function WriterRadarFoundationsPanel");
  const bloco = painel.slice(inicio, fim);
  assert.ok(inicio > 0 && fim > inicio);
  for (const rotulo of ["Assunto (tronco)", "Onde fazer a virada", "Seção da virada", "Direção do H1", "Destino da chamada", "Alerta do Radar"]) {
    assert.ok(bloco.includes(rotulo), rotulo);
  }
  assert.match(bloco, /assunto\.sectionIsWorkingTitle && [^\n]*data-radar-subject-working-title/);
  assert.match(bloco, /reescreva-o para o leitor/);
  assert.doesNotMatch(bloco, /text-\[(\d+)px\]/, "sem tamanho bruto no bloco novo");
  assert.match(bloco, /text-sm/, "texto de leitura em 14px");
  assert.doesNotMatch(bloco, /#[0-9a-f]{3,6}\b|rgb\(|bg-(white|black)/i, "sem cor crua");
});

test("E2 · a semeadura do servidor passa as linhas do cabeçalho à mesma projeção; ninguém copia o dossiê", async () => {
  const servidor = semComentarios(await fonte("../lib/server/writer-seed.ts"));
  assert.match(servidor, /radarFoundationsOfDossier\(dossier, \{ editorialContext: head\.editorialContext \}\)/);
  const semente = semComentarios(await fonte("../lib/redator/deliverable-seed.ts"));
  assert.match(semente, /f\.editorialContext \?\? \[\]/, "as linhas vêm da projeção");
  assert.doesNotMatch(semente, /importedContext/, "a semeadura não lê o documento por fora da projeção");
  const projecao = semComentarios(await fonte("../lib/redator/radar-foundations.ts"));
  assert.match(projecao, /document\.importedContext\.editorialContext/, "a projeção é quem lê as linhas do documento");
});

test("Z · nenhuma chamada de rede", () => {
  assert.equal(chamadasDeRede, 0);
});
