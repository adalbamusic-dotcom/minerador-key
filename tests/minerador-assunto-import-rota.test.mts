import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

/**
 * IMPORT DE ASSUNTOS — ROTA E TELA (SDD 2026-09-24, F1.3), por leitura do fonte,
 * no padrão dos testes de rota do Minerador. Os comentários são removidos antes
 * de casar, para o teste não passar pelo próprio comentário.
 */

function stripComments(source: string) {
  return source
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:"'`\\])\/\/.*$/gm, "$1");
}

async function source(path: string) {
  return stripComments(await readFile(new URL(`../${path}`, import.meta.url), "utf8"));
}

const ROUTE = "app/api/minerador/marcas/[brandId]/subjects/import/route.ts";
const CONTROLS = "modules/minerador/discovery/discovery-source-controls.tsx";

test("rota aposentada em 2026-10-13 (cadastro único): 410 sem ler nem gravar; o Assunto entra só pelo card", async () => {
  const route = await source(ROUTE);
  assert.match(route, /export async function POST\(\)/);
  assert.match(route, /SUBJECT_ENTRY_MOVED/);
  assert.match(route, /status: 410/);
  assert.doesNotMatch(route, /importSubjectsWithCore|\.from\(|\.insert\(|\.update\(|requireCanonicalSessionProfile/, "a rota aposentada não lê nem grava nada");
  const tela = await source("modules/minerador/minerador-workspace.tsx");
  const controles = tela.slice(tela.indexOf("<DiscoverySourceControls "), tela.indexOf("/>", tela.indexOf("<DiscoverySourceControls ")));
  assert.doesNotMatch(controles, /subjectEntry/, "o Processador não oferece mais \"Esta lista é: Assunto\"");
});

test("núcleo: importKeywordsWithCore e KeywordImportSource continuam como estavam", async () => {
  const core = await source("lib/minerador/keyword-import-core.ts");
  assert.match(core, /export type KeywordImportSource = "discovery";/);
  assert.match(core, /export async function importKeywordsWithCore\(input: \{\n  brandId: string;\n  actorUserId: string;\n  items: KeywordImportCoreItem\[\];\n  supabase: SupabaseClient;\n  now\?: string;\n\}\): Promise<KeywordImportCoreResult>/);
  const discoveryImport = await source("app/api/minerador/marcas/[brandId]/discovery/import/route.ts");
  assert.match(discoveryImport, /importKeywordsWithCore\(/);
  assert.doesNotMatch(discoveryImport, /importSubjectsWithCore/);
});

/*
 * 2026-10-16 · F1 da linha única do Minerador (A8): o modo "Esta lista é:
 * Assunto" (prop `subjectEntry`), que chamava `subjects/import` (410), saiu dos
 * controles; os testes que só conferiam esse ramo saíram junto. Fica a guarda
 * de que ele não volta e de que o ramo de keyword segue como estava.
 */
test("Descobrir intacto: colar e CSV de keyword seguem para /discovery/sources; o modo Assunto não existe mais", async () => {
  const page = await source("modules/minerador/discovery/discovery-keywords-page.tsx");
  assert.match(page, /<DiscoverySourceControls\b/);
  assert.doesNotMatch(page, /subjectEntry|onSubjectsImported/);

  const controls = await source(CONTROLS);
  assert.doesNotMatch(controls, /subjectEntry|onSubjectsImported|EntryKind|subjectMode|Esta lista é|\/subjects\/import|declareExistingIds|parseManualSubjects|subjectColumns/);
  assert.match(controls, /\/discovery\/sources`, \{ method: "POST"/);
  const csvParse = controls.slice(controls.indexOf("function buildCsvPreview"), controls.indexOf("function previewFields"));
  assert.match(csvParse, /const parsed = parseDiscoveryCsvRows\(rows\);/);
  assert.match(controls, /<p className="text-text"><span className="font-semibold">Linhas com métricas:<\/span>/);
  assert.match(controls, /Ver amostra de keywords/);
});

test("tela: texto essencial sem text-xs nem cor fixa no fluxo novo", async () => {
  const controls = await source(CONTROLS);
  assert.doesNotMatch(controls, /text-xs|text-\[1[0-3]px\]/);
  assert.doesNotMatch(controls, /#[0-9a-f]{3,8}\b|rgb\(|hsl\(/i);
});
