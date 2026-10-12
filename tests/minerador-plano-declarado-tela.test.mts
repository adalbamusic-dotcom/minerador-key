import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

/**
 * F4 DA SDD DE 2026-10-12 (§9 item 4) — A TELA "IMPORTAR PLANO DO SILO".
 *
 * Provas estruturais, sem DOM, sem rede e sem custo: o diálogo fala só com a
 * rota do núcleo único, gera a prévia antes de declarar, manda o
 * importRequestId da prévia no envio, só anuncia o resultado depois da
 * resposta e o botão existe no Minerador. Os comentários são tirados antes de
 * cada conferência, para o teste não casar com a própria explicação.
 */

const ROOT = process.cwd();
const read = (path: string) => readFileSync(join(ROOT, path), "utf8");
const semComentarios = (texto: string) => texto
  .replace(/\r\n/g, "\n")
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/(^|[^:])\/\/.*$/gm, "$1");

const DIALOGO = semComentarios(read("modules/minerador/declared-plan-import-dialog.tsx"));
const TELA = semComentarios(read("modules/minerador/minerador-workspace.tsx"));

function trecho(fonte: string, inicio: string, fim: string): string {
  const a = fonte.indexOf(inicio);
  assert.ok(a >= 0, `não achei "${inicio}"`);
  const b = fonte.indexOf(fim, a + inicio.length);
  assert.ok(b > a, `não achei "${fim}" depois de "${inicio}"`);
  return fonte.slice(a, b);
}

const PREVIA = trecho(DIALOGO, "const handlePreview = async", "const handleApply = async");
const ENVIO = trecho(DIALOGO, "const handleApply = async", "const busy = ");

test("o diálogo chama só a rota /plans/import e não escreve direto no banco", () => {
  assert.match(DIALOGO, /\/api\/minerador\/marcas\/\$\{encodeURIComponent\(brandId\)\}\/plans\/import/);
  const fetches = DIALOGO.match(/\bfetch\s*\(/g) || [];
  assert.equal(fetches.length, 1, "um único fetch, o da rota do plano");
  assert.match(DIALOGO, /fetch\(PLAN_IMPORT_ROUTE\(brandId\)/);
  assert.match(DIALOGO, /method:\s*"POST"/);
  assert.doesNotMatch(DIALOGO, /minerador_keywords/);
  assert.doesNotMatch(DIALOGO, /\.from\s*\(/);
  assert.doesNotMatch(DIALOGO, /supabase/i);
  const rotas = DIALOGO.match(/\/api\/[^`"'\s]*/g) || [];
  assert.ok(rotas.length >= 1 && rotas.every(rota => rota.startsWith("/api/minerador/marcas/")), `rotas inesperadas: ${rotas.join(", ")}`);
  assert.doesNotMatch(TELA, /plans\/import/, "a tela não chama a rota do plano por fora do diálogo");
});

test("a prévia vem antes do envio, e o envio repete o texto e o grupo da prévia", () => {
  assert.match(PREVIA, /mode:\s*"preview"/);
  assert.doesNotMatch(PREVIA, /mode:\s*"apply"/);
  assert.match(ENVIO, /mode:\s*"apply"/);
  assert.doesNotMatch(ENVIO, /mode:\s*"preview"/);
  assert.match(ENVIO, /if \(!preview \|\| !preview\.result\.canApply/, "sem prévia (ou sem canApply) o envio não sai");
  assert.match(ENVIO, /text:\s*preview\.request\.text/);
  assert.match(ENVIO, /group:\s*preview\.request\.group/);
  assert.match(DIALOGO, /disabled=\{busy \|\| !result\?\.canApply \|\| Boolean\(applied\)\}/, "\"Declarar plano\" só habilita com canApply");
  assert.match(DIALOGO, /\bDeclarar plano\s*<\/button>/);
  assert.match(DIALOGO, /\bGerar prévia\s*<\/button>/);
  const invalida = trecho(DIALOGO, "const invalidate = () =>", "const currentRequest");
  assert.match(invalida, /setPreview\(null\)/, "mudar texto ou grupo descarta a prévia");
  assert.match(DIALOGO, /setText\(event\.target\.value\); invalidate\(\);/);
});

test("o envio manda o importRequestId gerado uma vez por prévia", () => {
  assert.match(PREVIA, /importRequestId:\s*crypto\.randomUUID\(\)/);
  assert.doesNotMatch(ENVIO, /randomUUID/, "o envio não gera id novo: repete o da prévia");
  assert.match(ENVIO, /importRequestId:\s*preview\.importRequestId/);
  assert.equal((DIALOGO.match(/randomUUID/g) || []).length, 1);
});

test("o sucesso só aparece depois da resposta do envio", () => {
  const chamada = ENVIO.indexOf("await postPlanImport(");
  const recusa = ENVIO.indexOf("if (!answer.ok)");
  const anuncio = ENVIO.indexOf("setApplied(result)");
  const releitura = ENVIO.indexOf("onApplied(");
  assert.ok(chamada >= 0 && recusa > chamada && anuncio > recusa && releitura > anuncio, "await → recusa → resultado → releitura da planilha");
  assert.match(ENVIO, /body\.mode !== "apply"/, "resposta fora do formato não vira sucesso");
  const anunciosNaoNulos = (DIALOGO.match(/setApplied\((?!null\))/g) || []).length;
  assert.equal(anunciosNaoNulos, 1, "o único resultado gravado na tela é o da resposta do envio");
  assert.match(DIALOGO, /artigo\(s\) declarado\(s\)/);
  assert.match(DIALOGO, /reciprocidade confirmada em \{applied\.reciprocityConfirmed\}; falhas: \{applied\.failed\}/);
  const postar = trecho(DIALOGO, "async function postPlanImport", "export function DeclaredPlanImportButton");
  assert.match(postar, /data\.success !== true/, "sucesso só com success: true da rota");
});

test("GROUPS_NOT_AVAILABLE esconde o recurso", () => {
  assert.match(PREVIA, /"GROUPS_NOT_AVAILABLE"\) \{ onUnavailable\(\); onClose\(\); return; \}/);
  assert.match(ENVIO, /"GROUPS_NOT_AVAILABLE"\) \{ onUnavailable\(\); onClose\(\); return; \}/);
  assert.match(TELA, /onUnavailable=\{\(\) => \{ setPlanImportOpen\(false\); keywordGroups\.markUnavailable\(\); \}\}/);
});

test("o botão \"Importar plano do Silo\" existe no Minerador, junto das entradas de import", () => {
  assert.match(DIALOGO, /export function DeclaredPlanImportButton/);
  assert.match(DIALOGO, /aria-label="Importar plano do Silo"/);
  assert.match(DIALOGO, />Importar plano do Silo</);
  const acoes = trecho(TELA, "const discoverySourceActions = useMemo(", "]);");
  assert.match(acoes, /<DiscoverySourceTopbarActions /);
  assert.match(acoes, /keywordGroups\.available \? <DeclaredPlanImportButton onClick=\{\(\) => setPlanImportOpen\(true\)\} \/> : null/);
  assert.match(TELA, /<DeclaredPlanImportDialog key=\{selectedBrandId\} brandId=\{selectedBrandId\} groups=\{keywordGroups\.activeGroups\}/);
  assert.match(TELA, /onApplied=\{applied => void handleDeclaredPlanApplied\(applied\)\}/);
  const releitura = trecho(TELA, "const handleDeclaredPlanApplied = async", "const loadRecoverableKeywords");
  assert.match(releitura, /await handleSubjectsImported\(/, "relê pelo mesmo caminho do import de Assuntos");
  assert.match(releitura, /readCanonicalKeywordRows\(principalIds, \{ source: fonteDaListagem \}\)/);
  assert.doesNotMatch(releitura, /\.update\(|\.insert\(|\.upsert\(/, "a tela não grava: só relê");
});

test("a tela do plano segue o sistema visual (tokens, keyword, sem cor crua)", () => {
  assert.doesNotMatch(DIALOGO, /#[0-9a-f]{3,8}\b|\b(?:rgb|rgba|hsl|hsla|oklch)\s*\(/i);
  assert.doesNotMatch(DIALOGO, /\btext-\[(?:[0-9]|1[01])px\]/);
  assert.doesNotMatch(DIALOGO, /\b(?:bg|text|border)-(?:slate|gray|zinc|emerald|amber|sky|white|black)\b/);
  assert.match(DIALOGO, /className="text-keyword">\{article\.subject\.phrase\}/);
  assert.match(DIALOGO, /className="text-keyword">\{article\.principal\.phrase\}/);
  assert.match(DIALOGO, /EDITORIAL_GROUP_COLOR_LABELS\[option\]/, "a cor do grupo novo sempre com o nome escrito");
});
