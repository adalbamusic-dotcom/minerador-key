import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

/**
 * PESQUISA POR ASSUNTO — ROTA DO IMPORT (SDD 2026-09-24, F1b.7, F1b.11
 * "Estruturais"), por leitura do fonte. Os comentários são removidos antes de
 * casar, para o teste não passar pelo próprio comentário.
 */

function stripComments(source: string) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:"'`\\])\/\/.*$/gm, "$1");
}

async function source(path: string) {
  return stripComments(await readFile(new URL(`../${path}`, import.meta.url), "utf8"));
}

const ROUTE = "app/api/minerador/marcas/[brandId]/subject-discovery/import/route.ts";
const CORE = "lib/minerador/subject-discovery-import.ts";

test("rota: só POST, marca da rota, permissão do import da Descoberta e núcleo próprio", async () => {
  const route = await source(ROUTE);
  assert.match(route, /export async function POST\(request: NextRequest, \{ params \}: \{ params: Promise<\{ brandId: string \}> \}\)/);
  assert.doesNotMatch(route, /export async function (GET|PUT|PATCH|DELETE)\(/);
  assert.match(route, /const \{ brandId \} = await params;/);
  assert.match(route, /isTenantId\(brandId\)/);
  assert.match(route, /requireCanonicalSessionProfile\(\)/);
  assert.match(route, /requireTenantPermission\(\{ brandId, actorUserId: profile\.userId, module: "minerador", action: "create", profile \}\)/);
  assert.match(route, /SubjectDiscoveryImportRequestSchema\.parse\(await request\.json\(\)\)/);
  assert.match(route, /importSubjectDiscoveryWithCore\(\{/);
  assert.match(route, /brandId: context\.brandId/);
  assert.match(route, /actorUserId: context\.actorUserId/);
  assert.match(route, /IMPORT_REQUEST_IN_PROGRESS: 409/);
  assert.match(route, /TOO_MANY_ITEMS: 400/);
  assert.match(route, /"INVALID_SUBJECT_DISCOVERY_IMPORT", 400/);
});

test("rota: não escreve por fora do núcleo, não lê analise_semantica e não chama provider", async () => {
  const route = await source(ROUTE);
  assert.doesNotMatch(route, /\.insert\(|\.update\(|\.upsert\(|\.delete\(|\.rpc\(/);
  assert.doesNotMatch(route, /select\("\*"\)/);
  assert.doesNotMatch(route, /analise_semantica/);
  assert.doesNotMatch(route, /fetch\(|dataforseo|google-ads|googleAds|serp/i);
});

test("estrutural: rota e núcleo não tocam a Descoberta (tabelas e RPCs) nem declaram Assunto", async () => {
  for (const path of [ROUTE, CORE]) {
    const text = await source(path);
    assert.doesNotMatch(text, /minerador_discovery_/, `${path}: tabela da Descoberta`);
    assert.doesNotMatch(text, /persist_minerador_discovery/, `${path}: RPC da Descoberta`);
    assert.doesNotMatch(text, /\.rpc\(/, `${path}: RPC`);
    assert.doesNotMatch(text, /setKeywordSubject|withdrawKeywordSubject/, `${path}: declaração de Assunto`);
    assert.doesNotMatch(text, /select\("\*"\)/, `${path}: select(*)`);
  }
});

test("estrutural: o núcleo não chama rede, provider nem IA", async () => {
  const core = await source(CORE);
  assert.doesNotMatch(core, /fetch\(/);
  assert.doesNotMatch(core, /from "[^"]*(dataforseo|google|serp|openai|anthropic|deepseek|ai-|llm)[^"]*"/i);
  const imports = [...core.matchAll(/from "([^"]+)"/g)].map(match => match[1]).sort();
  assert.deepEqual(imports, ["./keyword-import-core.ts", "./keyword-subject.ts", "@supabase/supabase-js", "zod"]);
});

test("estrutural: toda leitura e escrita do núcleo filtra pela marca", async () => {
  const core = await source(CORE);
  const calls = core.split(/\.from\("minerador_keywords"\)/).slice(1);
  assert.ok(calls.length >= 4);
  for (const call of calls) {
    const statement = call.slice(0, call.search(/;\s*\n/));
    if (/\.insert\(/.test(statement)) assert.match(statement, /brand_id: brandId/);
    else assert.match(statement, /\.eq\("brand_id", brandId\)/);
  }
});

test("estrutural: o corpo é .strict() e não tem campo de métrica", async () => {
  const core = await source(CORE);
  const schema = core.slice(core.indexOf("const SubjectDiscoveryImportItemSchema"), core.indexOf("export type SubjectDiscoveryImportRequest ="));
  assert.equal((schema.match(/\.strict\(\)/g) || []).length, 2);
  assert.doesNotMatch(schema, /volume|cpc|competition|results|allintitle|estimate|brandId|brand_id|actor/i);
});

test("núcleo da Descoberta: a regra da Q10 é a mesma função nos dois imports", async () => {
  const core = await source(CORE);
  const discovery = await source("lib/minerador/keyword-import-core.ts");
  assert.match(discovery, /export function hasKeywordApprovalRecord\(semantic: unknown\): boolean/);
  assert.match(core, /import \{ hasKeywordApprovalRecord, normalizeKeyword \} from "\.\/keyword-import-core\.ts";/);
  assert.match(discovery, /if \(previous && hasKeywordApprovalRecord\(previous\.analise_semantica\)\)/);
  assert.match(discovery, /if \(concurrent && hasKeywordApprovalRecord\(concurrent\.analise_semantica\)\)/);
});
