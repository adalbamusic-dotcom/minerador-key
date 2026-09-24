import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { DISCOVERY_MODES, DISCOVERY_SEARCH_KINDS } from "../modules/minerador/discovery/discovery-types.ts";

/**
 * PESQUISA POR ASSUNTO — TELA, testes estruturais (SDD 2026-09-24, F1b.1,
 * F1b.4, F1b.5, F1b.6, F1b.7 e F1b.11 "Tela").
 *
 * Sem DOM: leem o código-fonte SEM comentários (um comentário que cita a
 * regra não pode passar por implementação dela) e conferem os contratos.
 * REAL_PROVIDER_CALLS_IN_TESTS = 0.
 */

function stripComments(source: string): string {
  return source
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:"'`\\])\/\/.*$/gm, "$1");
}

function read(path: string) {
  return stripComments(readFileSync(new URL(`../${path}`, import.meta.url), "utf8"));
}

const types = read("modules/minerador/discovery/discovery-types.ts");
const searchRow = read("modules/minerador/discovery/discovery-search-row.tsx");
const page = read("modules/minerador/discovery/discovery-keywords-page.tsx");
const fields = read("modules/minerador/discovery/subject-search-fields.tsx");
const results = read("modules/minerador/discovery/subject-search-results.tsx");
const dialogs = read("modules/minerador/discovery/subject-search-dialogs.tsx");
const hook = read("modules/minerador/discovery/use-subject-search.ts");
const model = read("modules/minerador/discovery/subject-search-model.ts");
const localStore = read("modules/minerador/discovery/subject-search-local-store.ts");
const workspace = read("modules/minerador/minerador-workspace.tsx");
const googleAdsRoute = read("app/api/minerador/marcas/[brandId]/google-ads/descobrir-keywords/route.ts");

const screenFiles = { fields, results, dialogs, hook, model, localStore, page, searchRow } as const;

function between(source: string, start: string, end: string) {
  const from = source.indexOf(start);
  assert.ok(from >= 0, `trecho ${start} existe`);
  const to = source.indexOf(end, from + start.length);
  assert.ok(to > from, `fim ${end} existe`);
  return source.slice(from, to);
}

test("radiogroup: três opções, e 'subject' é só de tela (fora de DISCOVERY_MODES e do z.enum do Google Ads)", () => {
  assert.deepEqual([...DISCOVERY_MODES], ["keyword", "customer_discovery"]);
  assert.deepEqual([...DISCOVERY_SEARCH_KINDS], ["keyword", "customer_discovery", "subject"]);
  assert.match(types, /export const DISCOVERY_MODES = \["keyword", "customer_discovery"\] as const;/);
  assert.match(types, /export const DISCOVERY_SEARCH_KINDS = \[\.\.\.DISCOVERY_MODES, "subject"\] as const;/);
  assert.match(googleAdsRoute, /discoveryMode: z\.enum\(\["keyword", "customer_discovery"\]\)\.optional\(\)/);
  assert.match(searchRow, /role="radiogroup"/);
  assert.match(searchRow, /\{DISCOVERY_SEARCH_KINDS\.map\(option => \{/);
  assert.doesNotMatch(searchRow, /DISCOVERY_MODES\.map/);
  assert.match(searchRow, /subject: "Por Assunto"/);
  assert.match(searchRow, /\{subjectSearch && subjectFields\}/);
  assert.doesNotMatch(page, /discoveryMode: "subject"|setDiscoveryMode\("subject"\)/, "o modo novo nunca vira DiscoveryMode");
  assert.match(page, /const searchKind: DiscoverySearchKind = subjectSearchOpen \? "subject" : discoveryMode;/);
});

test("campos: Assunto obrigatório, nota e página opcionais, Assunto declarado preenche os três", () => {
  assert.match(fields, /id="subject-search-phrase"[\s\S]{0,600}required[\s\S]{0,60}maxLength=\{200\}/);
  assert.match(fields, /id="subject-search-note"[\s\S]{0,400}maxLength=\{KEYWORD_SUBJECT_NOTE_MAX\}/);
  assert.match(fields, /id="subject-search-destination"[\s\S]{0,120}type="url"/);
  assert.match(fields, /Usar um Assunto declarado/);
  assert.match(fields, /onChange=\{event => controller\.chooseDeclaredSubject\(event\.target\.value \|\| null\)\}/);
  assert.match(hook, /setSubjectKeywordId\(option\.id\);\s*setPhrase\(option\.keyword\);\s*setNote\(option\.note \|\| ""\);\s*setDestinationUrl\(option\.destinationUrl \|\| ""\);/);
  assert.match(fields, /\{SUBJECT_SEARCH_NOTE_HELP\}/);
  assert.match(model, /"A nota não muda a pesquisa; ela acompanha o Assunto, se você o declarar no envio\."/);
});

test("Enter ou Pesquisar só montam o plano; a ajuda diz isso; o texto da regra aparece no modo", () => {
  assert.match(fields, /onKeyDown=\{event => \{ if \(event\.key === "Enter"\) \{ event\.preventDefault\(\); if \(!busy\) submit\(\); \} \}\}/);
  assert.match(fields, /const submit = \(\) => \{ void controller\.requestPlan\(\); \};/);
  assert.match(fields, /onClick=\{submit\}[\s\S]{0,400}"Pesquisar"/);
  assert.match(fields, /\{SUBJECT_SEARCH_ENTER_HELP\}/);
  assert.match(fields, /data-subject-search-rule[^>]*>\{SUBJECT_SEARCH_RULE_TEXT\}/);
  const requestPlan = between(hook, "const requestPlan = useCallback", "const cancelPlan");
  assert.match(requestPlan, /buildSubjectSearchRequest\(\{ mode: "plan", \.\.\.config \}\)/);
  assert.doesNotMatch(requestPlan, /mode: "execute"/, "o Enter nunca executa");
});

test("diálogo de custo: plano inteiro, total, lentes em cache, sem desligar fonte; execução só no confirmar", () => {
  const planDialog = between(dialogs, "export function SubjectSearchPlanDialog", "export function SubjectSearchImportDialog");
  assert.match(planDialog, /Custo máximo: <strong>\{formatSubjectSearchUsd\(plan\.maxCostUsd\)\}<\/strong>/);
  assert.match(planDialog, /plan\.serp\.cachedLenses\.length\} de 4 lentes no cache \(0 pagas\)/);
  assert.match(planDialog, /plan\.notices\.map/);
  assert.match(planDialog, /plan\.notApplicable\.map/);
  assert.match(planDialog, /\{SUBJECT_SEARCH_PLAN_TEXT\}/);
  assert.match(planDialog, /"Confirmar e pesquisar"/);
  assert.doesNotMatch(planDialog, /type="checkbox"|<input/, "o diálogo não desliga fonte");
  assert.match(planDialog, /useDialogFocus\(Boolean\(state\), dialogRef\);/, "o foco entra no diálogo de custo");
  assert.match(planDialog, /ref=\{dialogRef\} tabIndex=\{-1\} role="dialog" aria-modal="true"/);
  assert.match(planDialog, /missingLenses\.map\(subjectSearchLensName\)/, "lente pelo nome do aparelho");
  assert.match(dialogs, /if \(trigger\?\.isConnected\) trigger\.focus\(\);/, "o foco volta ao gatilho ao fechar");
  assert.match(dialogs, /event\.key !== "Tab"/, "o Tab fica contido no diálogo");
  assert.match(fields, /const busy = controller\.planning \|\| controller\.executing \|\| Boolean\(controller\.planState\);/, "Enter atrás do diálogo não remonta o plano");
  const confirmPlan = between(hook, "const confirmPlan = useCallback", "const activeRecord");
  assert.match(confirmPlan, /mode: "execute", \.\.\.config, operationRequestId, authorizedPlan: \{ planHash: plan\.planHash, maxCostUsd: plan\.maxCostUsd \}/);
  assert.match(confirmPlan, /payload\.code === "PAID_PLAN_CHANGED"/);
  assert.match(confirmPlan, /operationRequestId: crypto\.randomUUID\(\)/, "plano novo, operação nova");
  assert.match(hook, /setPlanState\(\{ plan: body\.plan, subject: body\.subject, config, operationRequestId: crypto\.randomUUID\(\)/);
});

test("resultado: origens com rótulo próprio, evidência curta, selo de já existe e estimativa rotulada", () => {
  assert.match(results, /candidate\.origins\.map\(origin => subjectSearchOriginLabel\(origin\)\)/);
  assert.doesNotMatch(results, /: "Google Ads"|\?\? "Google Ads"|\|\| "Google Ads"/, "nenhuma origem cai em Google Ads genérico");
  assert.match(results, /candidate\.evidence\.map\(text => <li key=\{text\}>\{text\}<\/li>\)/, "evidência legível sem hover, uma por linha");
  assert.match(results, /origins\.map\(origin => <li key=\{origin\}>\{origin\}<\/li>\)/, "origens legíveis sem hover, uma por linha");
  assert.doesNotMatch(results, /truncate`\} title=\{origins|truncate text-text-muted`\} title=\{candidate\.evidence/, "origem e evidência não ficam só no title");
  assert.match(results, /aria-label="Limpar seleção"/);
  assert.match(results, /"Aprovada · origem não gravada"/);
  assert.match(results, /"Acima do limite de 50 · origem não gravada"/);
  assert.match(results, /subjectSearchLensName\(lens\.lens\)/);
  assert.match(results, /"Já existe na marca"/);
  assert.match(results, /"É o Assunto"/);
  assert.match(results, /SUBJECT_SEARCH_ESTIMATE_COLUMN/);
  assert.match(model, /SUBJECT_SEARCH_ESTIMATE_COLUMN = "Estimativa DataForSEO"/);
  assert.match(results, /Volume \(Google Ads\)/);
  assert.match(results, /const volume = subjectCandidateGoogleAdsVolume\(candidate\);/);
  assert.doesNotMatch(results, /dataForSeoEstimate[^\n]{0,80}volume ===|volume = candidate\.dataForSeoEstimate/, "a estimativa nunca vira Volume");
  assert.match(model, /const value = candidate\.googleAds\?\.averageMonthlySearches;/);
});

test("lista local: texto da tela, política e armazenamento só em IndexedDB próprio", () => {
  assert.match(results, /\{SUBJECT_SEARCH_LOCAL_LIST_TEXT\}/);
  assert.match(model, /"Lista guardada só neste navegador\. Só o envio ao Processador salva no banco\. Limpar os dados do navegador apaga a lista\. Os resultados do Google ficam guardados para a marca por 30 dias; os do DataForSEO Labs, não: repetir a pesquisa paga de novo\."/);
  assert.match(localStore, /SUBJECT_SEARCH_LOCAL_DATABASE = "minerador-pesquisa-assunto"/);
  for (const [name, source] of Object.entries(screenFiles)) {
    assert.doesNotMatch(source, /localStorage|sessionStorage|deleteDatabase|\.clear\(\)/, `${name} não limpa nem usa outro armazenamento`);
  }
  assert.match(results, /Descartar esta busca/);
});

test("envio: 'Declarar também' com padrão da Q14, F1.3 (prévia e apply) antes da rota da F1b, e o texto do volume", () => {
  const importDialog = dialogs.slice(dialogs.indexOf("export function SubjectSearchImportDialog"));
  assert.match(importDialog, /declarePhraseAsSubjectLabel\(subject\.phrase\)/);
  assert.match(importDialog, /\{SUBJECT_SEARCH_VOLUME_REMEASURE_TEXT\}/);
  assert.match(importDialog, /\{SUBJECT_SEARCH_UNDECLARED_TEXT\}/);
  const openImport = between(hook, "const openImport = useCallback", "const setDeclare");
  assert.match(openImport, /defaultDeclarePhraseAsSubject\(\{ subjectKeywordId: subject\.subjectKeywordId, phraseExistingKeywordId: subject\.phraseExistingKeywordId \}\)/);
  const confirmImport = between(hook, "const confirmImport = useCallback", "return {\n");
  const apply = confirmImport.indexOf("mode: \"apply\"");
  const f1bImport = confirmImport.indexOf("/subject-discovery/import");
  assert.ok(apply > 0 && f1bImport > apply, "a declaração pela F1.3 vem antes do import da F1b");
  assert.match(hook, /postSubjects\(\{ mode: "preview", source: "manual", entries: \[subjectEntry\(record\)\] \}\)/);
  assert.match(hook, /\/subjects\/import`/);
  assert.match(confirmImport, /if \(!subjectId\) throw new Error\(/, "declaração que falha não importa nada");
  assert.match(confirmImport, /body: JSON\.stringify\(\{ importRequestId: dialog\.importRequestId, searchId: record\.searchId, subjectKeywordId: subjectId, subjectPhrase: record\.result\.subject\.phrase, items \}\)/);
  assert.match(model, /if \(candidate\.isSubjectPhrase \|\| candidate\.normalizedKeyword === normalizedPhrase\) \{ skippedSubjectPhrase \+= 1; continue; \}/);
});

test("a tela não fabrica candidata nem declara por fora: nada de setKeywordSubject, IA, Serper ou rota antiga", () => {
  for (const [name, source] of Object.entries(screenFiles)) {
    assert.doesNotMatch(source, /setKeywordSubject|withdrawKeywordSubject/, `${name} não declara Assunto por fora da F1.3`);
    assert.doesNotMatch(source, /serper|rapidapi|openrouter|deepseek|anthropic/i, `${name} sem provider aposentado ou IA`);
    assert.doesNotMatch(source, /minerador_discovery_|persist_minerador_discovery|\.insert\(|\.update\(|\.upsert\(|\.rpc\(/, `${name} não escreve no banco`);
    assert.doesNotMatch(source, /select\("\*"\)/, `${name} sem select("*")`);
  }
  assert.doesNotMatch(hook + fields + results + dialogs, /google-ads\/descobrir-keywords/, "o modo novo nunca chega à rota antiga");
  assert.match(hook, /\.select\("id,keyword,keyword_subject:analise_semantica->keyword_subject"\)\s*\.eq\("brand_id", brandId\)\s*\.is\("deleted_at", null\)/);
});

test("Processador: 'Buscar sustentação' na linha do Assunto declarado abre o Descobrir só com o id", () => {
  assert.match(workspace, /\{vinculo\.subjectLabel && item\.id \? \(\s*<button[\s\S]{0,120}data-subject-search-link\s+onClick=\{\(\) => router\.push\(subjectSearchLinkHref\(brandRef, item\.id\)\)\}[\s\S]{0,700}Buscar sustentação/);
  assert.equal((workspace.match(/resolveKeywordVinculo\(/g) || []).length, 1, "a coluna continua resolvendo uma vez");
  assert.match(model, /return `\/\$\{brandRef\}\/minerador\/descobrir\?modo=assunto&assunto=\$\{encodeURIComponent\(keywordId\)\}`;/);
  assert.match(page, /const link = parseSubjectSearchLink\(window\.location\.search\);/);
  const linkEffect = between(hook, "declaredState !== \"ready\" && declaredState !== \"failed\"", "}, [linkedSubjectKeywordId");
  assert.match(linkEffect, /\.select\("id,keyword,keyword_subject:analise_semantica->keyword_subject"\)\s*\.eq\("brand_id", brandId\)\s*\.eq\("id", linkedSubjectKeywordId\)\s*\.is\("deleted_at", null\)\s*\.maybeSingle\(\)/, "fora da lista, lê só o id do link, na marca");
  assert.match(linkEffect, /O Assunto do link não pôde ser lido agora/);
});

test("modo Por Assunto não envia keywords adultas sem controle visível; o idioma diz que vale só para o Google Ads", () => {
  assert.match(page, /useSubjectSearch\(\{ brandRef, active: subjectSearchOpen, language, selectedStates: states, includeAdultKeywords: false, linkedSubjectKeywordId \}\)/);
  assert.match(fields, /\{SUBJECT_SEARCH_LOCALE_TEXT\} \{SUBJECT_SEARCH_LANGUAGE_TEXT\}/);
});

test("sistema visual: texto essencial com 14px e nenhuma cor crua nos arquivos novos", () => {
  for (const [name, source] of Object.entries({ fields, results, dialogs })) {
    assert.doesNotMatch(source, /text-\[(?:[0-9]|1[0-3])px\]|text-xs/, `${name} sem texto abaixo de 14px`);
    assert.doesNotMatch(source, /#[0-9a-f]{3,8}\b|\b(?:bg|text|border)-(?:slate|gray|zinc|emerald|sky|white|black)\b/i, `${name} sem cor crua`);
  }
});
