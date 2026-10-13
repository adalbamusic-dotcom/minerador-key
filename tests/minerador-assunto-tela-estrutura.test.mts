import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

/**
 * TELA DO PROCESSADOR · ASSUNTO (SDD 2026-09-24, F1.4, F1.5, F1.6 e F1.7b).
 *
 * Testes estruturais, sem DOM: leem o código-fonte da Revisão Humana e do
 * workspace SEM comentários (um comentário que cita a regra não pode passar
 * por implementação dela) e conferem os contratos da tela.
 * REAL_PROVIDER_CALLS_IN_TESTS = 0.
 */

function stripComments(source: string): string {
  return source
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:"'`\\])\/\/.*$/gm, "$1");
}

const panels = stripComments(readFileSync(new URL("../components/editorial/dna-panels.tsx", import.meta.url), "utf8"));
const workspace = stripComments(readFileSync(new URL("../modules/minerador/minerador-workspace.tsx", import.meta.url), "utf8"));
const vinculoSelects = stripComments(readFileSync(new URL("../components/editorial/vinculo-selects.tsx", import.meta.url), "utf8"));
const discoveryPage = stripComments(readFileSync(new URL("../modules/minerador/discovery/discovery-keywords-page.tsx", import.meta.url), "utf8"));

/** O corpo de `const <name> = async (...) => { ... };`, até a próxima declaração do mesmo nível. */
function handlerBody(source: string, name: string): string {
  const start = source.indexOf(`const ${name} = async`);
  assert.ok(start >= 0, `${name} existe`);
  const rest = source.slice(start + 1);
  const next = rest.search(/\n {2}const [A-Za-z]+ = /);
  return next >= 0 ? rest.slice(0, next) : rest;
}

function between(source: string, from: string, to: string): string {
  const start = source.indexOf(from);
  assert.ok(start >= 0, `âncora ${from}`);
  const end = source.indexOf(to, start + from.length);
  assert.ok(end > start, `âncora ${to}`);
  return source.slice(start, end);
}

test("2026-10-13: a Revisão Humana não tem mais Assunto no Vínculo — nem select, nem nota, nem destino, nem ação subject", () => {
  const vinculoSection = between(panels, 'aria-label="Vínculo da keyword"', "</section>");
  assert.match(vinculoSection, /<VinculoPostSelect[\s\S]*<VinculoPageTypeSelect/);
  assert.doesNotMatch(vinculoSection, /Subject|Assunto|subject/, "o Vínculo só tem Posto e Potencial");
  assert.match(vinculoSection, /data-review-vinculo-summary[\s\S]{0,200}\{vinculo\.postLabel\}[\s\S]{0,120}\{vinculo\.pageTypeLabel\}/, "o resumo fica 'Livre · Artigo · potencial'");
  assert.doesNotMatch(panels, /type: "subject"|function ReviewSubjectControl|subjectReviewWarning|approvedForArchitect/);
  assert.doesNotMatch(vinculoSelects, /VinculoSubjectSelect|VinculoSubjectFields|VINCULO_SUBJECT_TITLE|Nota: o que é, para quem/);
  assert.doesNotMatch(workspace, /type: "subject"|handleSubjectReviewAction|setKeywordSubject|withdrawKeywordSubject/, "a tela não grava Assunto por fora do card");
});

test("coluna Vínculo sem Assunto; o cabeçalho do Perfil continua dizendo que a keyword carrega um Assunto", () => {
  assert.equal((workspace.match(/resolveKeywordVinculo\(/g) || []).length, 1, "a coluna resolve uma vez");
  assert.equal((panels.match(/resolveKeywordVinculo\(/g) || []).length, 2, "Revisão Humana e cabeçalho do Perfil");
  assert.doesNotMatch(workspace, /data-keyword-subject-label|data-keyword-vinculo-no-subject|keywordVinculoChoiceLabels\(vinculo\)\.subject/);
  // Cabeçalho do Perfil: o mesmo selo, com texto de 14px (nunca o ProfilePill de 11px).
  assert.match(panels, /\{headerVinculo\.subjectLabel && \(\s*<span\s+data-profile-subject-label\s+className="[^"]*border-context-accent\/50 bg-context-accent\/10[^"]*\btext-sm\b[^"]*text-context-accent"\s*>\s*\{headerVinculo\.subjectLabel\}/);
  assert.doesNotMatch(panels, /<ProfilePill label=\{headerVinculo\.subjectLabel\}/);
  // Ninguém lê a chave crua na tela (F1.4): o painel lê pelo domínio (subject-article-view).
  for (const [name, source] of [["workspace", workspace], ["dna-panels", panels]] as const) {
    assert.doesNotMatch(source, /keyword_subject/, `${name} lê keyword_subject direto`);
    assert.doesNotMatch(source, /resolveKeywordSubject\(/, `${name} resolve o Assunto por fora do domínio`);
  }
  // Nenhum rótulo escrito à mão: os textos vêm do domínio.
  assert.doesNotMatch(workspace + panels, /"Assunto · declarado"|"Assunto sem nota"|Assunto: Não|Assunto: Declarado/);
});

test("rodapé: um seletor Vínculo ao lado do KGR, que abre os grupos, também em Mais ações", () => {
  // 2026-09-24 (pedido do dono, segunda rodada): os três selects separados
  // (Posto, Potencial, Assunto) poluíram o rodapé; voltou um seletor só,
  // "Vínculo", que abre um painel com um grupo de escolha única por parte.
  // A regra de gravar só na confirmação fica ("Aplicar").
  const bar = between(workspace, "<KeywordTableBulkBarShell", "</KeywordTableBulkBarShell>");
  assert.doesNotMatch(bar, /VINCULO_BATCH_CHOICE_GROUPS\.map/, "os três selects saíram do rodapé");
  assert.doesNotMatch(bar, /data-vinculo-batch-select/);
  const triggers = bar.match(/<button[^>]*?data-vinculo-batch-trigger[\s\S]*?<\/button>/g) || [];
  assert.equal(triggers.length, 2, "no rodapé e em Mais ações");
  for (const trigger of triggers) {
    assert.match(trigger, /openVinculoBatchPanel\(/);
    assert.match(trigger, /aria-haspopup="dialog"/);
    assert.doesNotMatch(trigger, /handleBatchVinculo|supabase/, "abrir o painel não grava");
  }
  // Corretor, 2026-09-24: aria-controls apontava para um painel que não
  // existe enquanto fechado; agora só o botão do rodapé o leva, e só aberto.
  assert.match(triggers[0], /aria-controls=\{vinculoBatchDialogOpen \? "minerador-vinculo-batch-panel" : undefined\}/);
  assert.doesNotMatch(triggers[1], /aria-controls/);
  assert.match(triggers[0], /aria-expanded=\{vinculoBatchDialogOpen\}/);
  assert.match(triggers[0], />\s*Vínculo\s*<ChevronDown/);
  const kgr = bar.indexOf('aria-label="Aplicabilidade do KGR das selecionadas"');
  const vinculo = bar.indexOf("data-vinculo-batch-trigger");
  const concluir = bar.indexOf('ariaLabel="Concluir revisão das selecionadas"');
  assert.ok(kgr >= 0 && kgr < vinculo && vinculo < concluir, "ordem: KGR → Vínculo → Concluir revisão");
  const menu = between(bar, 'id="minerador-more-actions-menu"', "InfoHint title=\"Enviar ao Arquiteto\"");
  assert.match(menu, /role="menuitem"\s*data-vinculo-batch-trigger/);
  assert.match(menu, /openVinculoBatchPanel\(moreActionsButtonRef\.current\)/);

  // Q5: ficam FORA do rodapé reabrir revisão, conferir por link e confirmar
  // publicada / desvincular.
  assert.doesNotMatch(bar, /type: "reopen"|Revisar novamente/);
  assert.doesNotMatch(bar, /openManualSiteCheck|onCheckByLink|Conferir por link/);
  assert.doesNotMatch(bar, /handlePublicationLinkAction|onPublicationAction|Confirmar publicada|Desvincular/);
});

// 2026-09-24 (pedido do dono, terceira rodada): os radios com "Não mudar"
// saíram. O painel usa os mesmos três selects do card REVISÃO HUMANA
// (vinculo-selects.tsx); cada um mostra o valor comum das selecionadas ou o
// marcador desabilitado "Valores diferentes", e só o que o humano muda grava.
test("painel do Vínculo: os selects da Revisão (Posto e Potencial), sem Não mudar, sem Assunto, e Aplicar", () => {
  const panel = between(workspace, "data-vinculo-batch-dialog", "<DeleteConfirmation");
  assert.doesNotMatch(panel, /Não mudar/);
  assert.doesNotMatch(panel, /type="radio"|VINCULO_BATCH_CHOICE_GROUPS\.map/);
  assert.doesNotMatch(workspace, /VINCULO_BATCH_RADIO_CLASS|VINCULO_BATCH_OPTION_CLASS/);
  for (const [component, key] of [["VinculoPostSelect", "post"], ["VinculoPageTypeSelect", "page_type"]] as const) {
    const start = panel.indexOf(`<${component}`);
    assert.ok(start >= 0, component);
    const element = panel.slice(start, panel.indexOf("/>", start));
    assert.ok(element.includes(`value={vinculoBatchSelectValue("${key}", vinculoBatchDialog, vinculoBatchCommon)}`), `${component} mostra o valor comum ou a escolha`);
    assert.ok(element.includes(`onChange={value => chooseVinculoBatch("${key}", value)}`), `${component} guarda a escolha sem gravar`);
    assert.ok(element.includes("disabled={updating}"), `${component} não se desliga por causa do Assunto`);
    assert.ok(panels.includes(`<${component}`), `${component} também na Revisão Humana`);
  }
  assert.doesNotMatch(panel, /VinculoSubject|Assunto|vinculoBatchPostLocked|vinculoBatchDeclareOpen/, "o Assunto saiu do painel em grupo");
  assert.match(panel, /published=\{vinculoBatchCommon\.publishedOnly\}/, "todas publicadas: só os declarados, como na Revisão");
  assert.match(workspace, /commonVinculoSelectValues\(keywords\.filter\(item => selectedIds\.has\(item\.id\)\)\)/, "o valor comum sai das linhas que o plano grava");
  assert.match(workspace, /chooseVinculoBatchSelect\(current, key, value, vinculoBatchCommon\)/);
  assert.match(vinculoSelects, /<option value=\{VINCULO_MIXED_VALUE\} disabled>\{VINCULO_MIXED_LABEL\}<\/option>/, "Valores diferentes nunca é escolha");
  assert.doesNotMatch(panel, /bg-\[#|slate-|text-\[1[01]px\]/);
});

test("confirmação do lote diz quantas aprovadas vão para Em revisão, antes de gravar", () => {
  const dialog = between(workspace, "data-vinculo-batch-dialog", "<DeleteConfirmation");
  assert.match(workspace, /describeVinculoBatchChoicesConfirmation\(vinculoBatchPreview\)/);
  assert.match(workspace, /planVinculoBatchChoices\(\{[\s\S]{0,200}actions: vinculoBatchDialogActions,[\s\S]{0,120}actorId: actorUserId,/, "a prévia é o mesmo plano que grava");
  assert.match(dialog, /data-vinculo-demotion-warning[^>]*>\{vinculoBatchPreviewText\.warning\}/);
  assert.match(dialog, /vinculoBatchPreviewText\.steps\.map\(step =>/, "o que cada escolha grava e pula");
  assert.match(dialog, /onClick=\{\(\) => void handleBatchVinculo\(vinculoBatchDialog\)\}/);
  assert.match(dialog, /disabled=\{updating \|\| bulkActionProcessing \|\| !vinculoBatchPreview\?\.ok \|\| vinculoBatchPreview\.counts\.updates === 0\}\s*className="[^"]*"\s*>\s*Aplicar/);
  assert.doesNotMatch(dialog, /autoFocus/);

  // Foco: o painel recebe o foco, Escape e clique fora fecham pelo document e o foco volta a quem abriu.
  assert.match(dialog, /ref=\{vinculoBatchDialogRef\}\s*tabIndex=\{-1\}/);
  assert.match(workspace, /aria-describedby="minerador-vinculo-batch-summary"\s*data-vinculo-batch-dialog/);
  assert.match(dialog, /id="minerador-vinculo-batch-summary"[\s\S]{0,900}data-vinculo-demotion-warning/, "a contagem está na descrição do painel");
  assert.match(workspace, /if \(!vinculoBatchDialogOpen\) return;\s*vinculoBatchDialogRef\.current\?\.focus\(\);/);
  assert.match(workspace, /\}, \[vinculoBatchDialogOpen\]\);/, "trocar escolhas não fecha nem refoca");
  assert.match(workspace, /if \(trigger\?\.isConnected\) trigger\.focus\(\);/);
  assert.match(workspace, /if \(event\.key === "Escape" && !updating\) setVinculoBatchDialog\(null\);/);
  assert.match(workspace, /document\.addEventListener\("keydown", onKeyDown\);\s*document\.addEventListener\("pointerdown", onPointerDown\);/);
  assert.match(workspace, /\{vinculoBatchDialog && selectedIds\.size > 0 && \(/, "o painel some junto com a seleção");
});

test("ator = auth.users.id: nunca e-mail, nunca local-user; sem ele nada é gravado", () => {
  const body = handlerBody(workspace, "handleBatchVinculo");
  assert.match(body, /const actorId = actorUserId;/, "usa o id da sessão");
  assert.match(body, /if \(!isKeywordSubjectActorId\(actorId\)\) \{[\s\S]{0,300}return;/, "recusa sem ator");
  assert.doesNotMatch(body, /session\?\.user\?\.email|\.email\b|"local-user"|"usuario"/, "não usa e-mail nem ator inventado");
  assert.match(workspace, /const \{ data: session, status: sessionStatus, actorUserId \} = useSession\(\);/);
});

test("escrita isolada por marca e readback estreito das chaves", () => {
  const batch = handlerBody(workspace, "handleBatchVinculo");
  assert.match(batch, /planVinculoBatchChoices\(\{[\s\S]{0,300}brandId: selectedBrandId,[\s\S]{0,200}actorId,/);
  assert.match(batch, /\.update\(\{ analise_semantica: update\.semantic \}\)\s*\.eq\("id", update\.id\)\s*\.eq\("brand_id", update\.brandId\)\s*\.is\("deleted_at", null\)/);
  assert.match(batch, /\.select\(VINCULO_BATCH_READBACK_COLUMNS\)\s*\.eq\("brand_id", selectedBrandId\)\s*\.is\("deleted_at", null\)\s*\.in\("id", readbackChunk\)/);
  assert.match(batch, /for \(let start = 0; start < persistedIds\.length; start \+= KEYWORD_READBACK_ID_CHUNK\)/, "readback em blocos de ids");
  assert.match(batch, /vinculoReadbackConfirmed\(update, rowById\.get\(update\.id\)\)/);
  assert.match(batch, /startBulkProgress\(/, "progresso do lote");
  assert.doesNotMatch(batch, /select\("\*"\)|readCanonicalKeywordRows\(|subject_declare|destinationUrl/, "readback estreito e nada de Assunto no lote");
});

test("Lógica automática usa a mesma rotina do botão Lógica, depois do cadastro, e nunca aprova", () => {
  assert.equal((workspace.match(/processLogicalKeywordDna\(/g) || []).length, 1, "nenhum caminho paralelo ao motor");
  const routine = handlerBody(workspace, "runLogicalProcess");
  assert.match(routine, /await processLogicalKeywordDna\(targets, lists, \{ persist: true, showProgress: true \}\)/);
  assert.match(routine, /startBulkProgress\("logic"/, "mesmo progresso do botão");
  assert.match(handlerBody(workspace, "handleQualifySelected"), /await runLogicalProcess\(targets\);/);

  const automatic = handlerBody(workspace, "runAutomaticSubjectLogic");
  assert.match(automatic, /const targets = keywordsWithoutLogic\(declaredItems\);/, "só nas que ainda não têm Lógica");
  assert.match(automatic, /await runLogicalProcess\(targets, \{ automatic: true \}\);/);
  assert.doesNotMatch(automatic, /setSelectedIds\(/);
  assert.match(handlerBody(workspace, "handleSubjectsImported"), /await runAutomaticSubjectLogic\(rows\);/);
  assert.doesNotMatch(handlerBody(workspace, "handleBatchVinculo"), /runAutomaticSubjectLogic/, "o Vínculo não declara Assunto, então não dispara a Lógica do Assunto");

  for (const name of ["runLogicalProcess", "runAutomaticSubjectLogic"]) {
    assert.doesNotMatch(handlerBody(workspace, name), /applyApproval|"aprovado"|handleUpdateStatus|handleBatchStatus|\.update\(\{[^}]*\bstatus\b/, `${name} não aprova`);
  }
});

test("cadastro único (2026-10-13): nem o Processador nem o Descobrir importam Assunto pelo colar/CSV; a releitura dos Assuntos é a do card", () => {
  // 2026-10-13 · pedido do dono: o Processador nem monta mais o colar/CSV de keyword; só o card.
  assert.doesNotMatch(workspace, /<DiscoverySourceControls\b/, "o Assunto entra só pelo card \"Cadastrar Assuntos\"");
  assert.match(workspace, /await handleSubjectsImported\(\{ createdIds: applied\.createdSubjectIds/);
  assert.match(discoveryPage, /<DiscoverySourceControls /);
  assert.doesNotMatch(discoveryPage, /subjectEntry|onSubjectsImported/);
  const imported = handlerBody(workspace, "handleSubjectsImported");
  assert.match(imported, /readCanonicalKeywordRows\(ids, \{ source: fonteDaListagem \}\)/, "relê as linhas da marca ativa pela view da listagem antes da Lógica");
  // Mais de 200 ids: a leitura é feita em blocos, e a completude é conferida sobre o total.
  const reader = workspace.slice(workspace.indexOf("const readCanonicalKeywordRows"), workspace.indexOf("const [isListModalOpen"));
  assert.match(workspace, /const KEYWORD_READBACK_ID_CHUNK = 200;/);
  assert.match(reader, /for \(let start = 0; start < uniqueIds\.length; start \+= KEYWORD_READBACK_ID_CHUNK\)/, "leitura em blocos de ids");
  assert.match(reader, /\.in\("id", chunk\)/);
  assert.match(reader, /if \(byId\.size !== uniqueIds\.length\)/, "completude sobre o total");
});
