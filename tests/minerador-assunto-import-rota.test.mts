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

test("Descobrir intacto: não passa subjectEntry, e o select só existe com a prop", async () => {
  const page = await source("modules/minerador/discovery/discovery-keywords-page.tsx");
  assert.match(page, /<DiscoverySourceControls\b/);
  assert.doesNotMatch(page, /subjectEntry|onSubjectsImported/);

  const controls = await source(CONTROLS);
  assert.match(controls, /subjectEntry\?: boolean;/);
  assert.match(controls, /onSubjectsImported\?: \(result: \{ createdIds: string\[\]; declaredIds: string\[\] \}\) => void;/);
  assert.match(controls, /const subjectMode = Boolean\(subjectEntry\) && entryKind === "subject";/);
  const selectAt = controls.indexOf("Esta lista é");
  assert.ok(selectAt > 0);
  assert.match(controls.slice(Math.max(0, selectAt - 80), selectAt), /\{subjectEntry && <label/, "o select só aparece com subjectEntry");
  assert.match(controls, /<option value="subject">Assunto<\/option>/);
  assert.match(controls, /<option value="keyword">Keyword<\/option>/);
  assert.match(controls, /useState<EntryKind>\("subject"\)/, "padrão Assunto");
});

test("tela: Keyword segue para /discovery/sources; Assunto vai para a rota nova com prévia e apply", async () => {
  const controls = await source(CONTROLS);
  assert.match(controls, /\/discovery\/sources`, \{ method: "POST"/);
  assert.match(controls, /\/subjects\/import`/);
  assert.match(controls, /mode: "preview"/);
  assert.match(controls, /mode: "apply"/);
  assert.match(controls, /declareExistingIds: chosen\.filter\(row => row\.classification !== "new"/);
  assert.match(controls, /return row\.classification === "new" && !looksLikeSubjectHeader\(row\);/, "só a nova vem marcada; o provável cabeçalho não");
  assert.match(controls, /row\.index === 0 && \(row\.normalizedKeyword === "assunto" \|\| row\.normalizedKeyword === "assuntos"\)/);
  assert.match(controls, /onSubjectsImported\?\.\(\{ createdIds, declaredIds \}\)/);
  assert.match(controls, /disabled=\{submitting \|\| !subjectPreview\.rows\.some/, "o botão fica desabilitado durante o envio");
  const csvParse = controls.slice(controls.indexOf("function buildCsvPreview"), controls.indexOf("function previewFields"));
  assert.match(csvParse, /subjectColumns \? parseDiscoveryCsvRows\(rows, \{ subjectColumns: true \}\) : parseDiscoveryCsvRows\(rows\)/);
});

test("tela: 'Esta lista é' volta a Assunto a cada abertura; a prévia do CSV no modo Assunto não fala de métricas", async () => {
  const controls = await source(CONTROLS);
  const openSource = controls.slice(controls.indexOf("const openSource = useCallback"), controls.indexOf("useImperativeHandle("));
  assert.match(openSource, /if \(subjectEntry\) \{\s*setEntryKind\("subject"\);\s*if \(csvRows\) setCsvPreview\(buildCsvPreview\(csvRows, true\)\);\s*\}/);
  assert.match(controls, /\{!subjectMode && <p className="text-text"><span className="font-semibold">Linhas com métricas:<\/span>/);
  assert.match(controls, /\{subjectMode \? "Ver amostra de Assuntos" : "Ver amostra de keywords"\}/);
  assert.match(controls, /um cabeçalho Assunto não é reconhecido/);
});

test("tela: texto essencial sem text-xs nem cor fixa no fluxo novo", async () => {
  const controls = await source(CONTROLS);
  assert.doesNotMatch(controls, /text-xs|text-\[1[0-3]px\]/);
  assert.doesNotMatch(controls, /#[0-9a-f]{3,8}\b|rgb\(|hsl\(/i);
});
