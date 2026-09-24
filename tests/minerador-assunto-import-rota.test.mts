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

test("rota: permissão do Minerador como em /discovery/sources, marca da rota e núcleo irmão", async () => {
  const route = await source(ROUTE);
  assert.match(route, /export async function POST\(/);
  assert.doesNotMatch(route, /export async function (GET|PUT|PATCH|DELETE)\(/);
  assert.match(route, /requireCanonicalSessionProfile\(\)/);
  assert.match(route, /requireTenantPermission\(\{ brandId, actorUserId: profile\.userId, module: "minerador", action: "edit", profile \}\)/);
  assert.match(route, /isTenantId\(brandId\)/);
  assert.match(route, /importSubjectsWithCore\(/);
  assert.match(route, /brandId: context\.brandId/);
  assert.match(route, /actorUserId: context\.actorUserId/);
  assert.match(route, /mode: z\.enum\(\["preview", "apply"\]\)/);
  assert.match(route, /declareExistingIds: z\.array\(z\.string\(\)\.uuid\(\)\)/);
  assert.match(route, /IMPORT_REQUEST_IN_PROGRESS: 409/);
});

test("rota: nada de brandId no corpo, select(*), métrica aceita ou import órfão", async () => {
  const route = await source(ROUTE);
  const schema = route.slice(route.indexOf("const SubjectEntrySchema"), route.indexOf("const REFUSAL_STATUS"));
  assert.doesNotMatch(schema, /brandId|brand_id|actor/i, "marca e ator nunca vêm do corpo");
  assert.doesNotMatch(schema, /volume|results|cpc|intent|funnel/i, "o import de Assunto não aceita métrica nem intenção");
  assert.doesNotMatch(route, /select\("\*"\)/);
  assert.doesNotMatch(route, /analise_semantica/, "a rota não lê analise_semantica: quem lê, estreito, é o núcleo");
  assert.match(route, /from\("marcas"\)\.select\("id,site_url"\)\.eq\("id", context\.brandId\)/);
  assert.match(route, /from\("minerador_keyword_lists"\)\.select\("id,nome,marca_id"\)\.eq\("marca_id", context\.brandId\)/);
  assert.doesNotMatch(route, /\.insert\(|\.update\(|\.rpc\(/, "a rota não escreve por fora do núcleo");
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
