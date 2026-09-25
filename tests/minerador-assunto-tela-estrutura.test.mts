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

test("Revisão Humana: o terceiro controle do Vínculo é o Assunto, com nota e destino, e dispara a ação subject", () => {
  const control = between(panels, "function ReviewSubjectControl(", "function TechnicalDetails(");
  // 2026-09-24 (pedido do dono): o select e os campos do Assunto são o
  // componente comum com o painel do rodapé (vinculo-selects.tsx). O rótulo
  // visível nomeia cada controle (sem aria-label que o substitua), e o id vem de useId().
  assert.match(control, /const selectId = useId\(\);/);
  assert.match(control, /<VinculoSubjectSelect\s*id=\{selectId\}/);
  const subjectSelect = between(vinculoSelects, "export function VinculoSubjectSelect(", "export function VinculoSubjectFields(");
  assert.match(subjectSelect, /<label className=\{LABEL_CLASS\} htmlFor=\{id\}>Assunto<\/label>\s*<select\s*id=\{id\}/);
  assert.match(subjectSelect, /Omit<VinculoSelectProps, "aria-label">/, "o select do Assunto nem aceita aria-label");
  assert.doesNotMatch(subjectSelect, /aria-label=/);
  assert.match(subjectSelect, /VINCULO_SUBJECT_SELECT_OPTIONS\.map\(option => <option key=\{option\.value\} value=\{option\.value\}>\{option\.label\}<\/option>\)/);
  const fields = vinculoSelects.slice(vinculoSelects.indexOf("export function VinculoSubjectFields("));
  assert.doesNotMatch(fields, /aria-label="(Assunto na revisão humana|Nota do Assunto|Página de destino do Assunto)"/);
  // Mudar o select não grava: só a confirmação grava.
  assert.match(control, /id=\{selectId\}[\s\S]{0,200}onChange=\{value => setChoice\(/);
  assert.match(fields, /Nota: o que é, para quem\s*<input[\s\S]{0,200}maxLength=\{KEYWORD_SUBJECT_NOTE_MAX\}/, "nota até 280, do domínio");
  assert.match(fields, /Página de destino\s*<input/);
  assert.match(control, /\{nextDeclared && \(\s*<VinculoSubjectFields[\s\S]{0,300}onNoteChange=\{setNote\}\s*onDestinationChange=\{setDestination\}/);
  assert.match(control, /\{ type: "subject", declared: true, note: note\.trim\(\) \|\| null, destinationUrl: destination\.trim\(\) \|\| null \}/);
  assert.match(control, /\{ type: "subject", declared: false \}/);
  // F1.5: aviso de rebaixamento antes de confirmar, numa aprovada.
  assert.match(control, /subjectReviewWarning\(\{ approved, currentlyDeclared: declared, nextDeclared \}\)/);
  assert.match(control, /data-subject-demotion-warning[\s\S]{0,1500}Confirmar e gravar/);

  // O controle mora na seção Vínculo, depois do tipo de página, e recebe a
  // aprovação efetiva e o mesmo resultado do resolvedor.
  const vinculoSection = between(panels, 'aria-label="Vínculo da keyword"', "</section>");
  assert.match(vinculoSection, /<VinculoPageTypeSelect[\s\S]{0,200}ariaContext="na revisão humana"[\s\S]*<ReviewSubjectControl/);
  assert.match(vinculoSection, /subject=\{vinculo\.subject \?\? null\}/);
  assert.match(vinculoSection, /approved=\{approvedForArchitect\}/);
  assert.match(vinculoSection, /vinculo\.subjectLabel/);
  assert.match(panels, /approvedForArchitect=\{editorialStatus\.kind === "resolved" && editorialStatus\.status === "aprovado"\}/);
  // A escrita é da tela do Processador; o painel não grava nada.
  assert.doesNotMatch(control, /setKeywordSubject|withdrawKeywordSubject|supabase/);
});

test("coluna Vínculo e cabeçalho mostram o Assunto pelo resolvedor, com context-accent", () => {
  assert.equal((workspace.match(/resolveKeywordVinculo\(/g) || []).length, 1, "a coluna resolve uma vez");
  assert.equal((panels.match(/resolveKeywordVinculo\(/g) || []).length, 2, "Revisão Humana e cabeçalho do Perfil");
  assert.match(workspace, /\{vinculo\.subjectLabel \? \(\s*<span\s+data-keyword-subject-label[\s\S]{0,300}border-context-accent\/50 bg-context-accent\/10[\s\S]{0,120}text-context-accent[\s\S]{0,400}\{keywordVinculoChoiceLabels\(vinculo\)\.subject\}/);
  // Cabeçalho do Perfil: o mesmo selo da coluna, com texto de 14px (nunca o ProfilePill de 11px).
  assert.match(panels, /\{headerVinculo\.subjectLabel && \(\s*<span\s+data-profile-subject-label\s+className="[^"]*border-context-accent\/50 bg-context-accent\/10[^"]*\btext-sm\b[^"]*text-context-accent"\s*>\s*\{headerVinculo\.subjectLabel\}/);
  assert.doesNotMatch(panels, /<ProfilePill label=\{headerVinculo\.subjectLabel\}/);
  // Ninguém lê a chave crua na tela (F1.4).
  for (const [name, source] of [["workspace", workspace], ["dna-panels", panels]] as const) {
    assert.doesNotMatch(source, /keyword_subject/, `${name} lê keyword_subject direto`);
    assert.doesNotMatch(source, /resolveKeywordSubject\(/, `${name} resolve o Assunto por fora do Vínculo`);
  }
  // Nenhum rótulo escrito à mão: os textos vêm do domínio.
  assert.doesNotMatch(workspace + panels, /"Assunto · declarado"|"Assunto sem nota"/);
});

test("rodapé: um seletor Vínculo ao lado do KGR, que abre os três grupos, também em Mais ações", () => {
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
test("painel do Vínculo: os três selects da Revisão, sem Não mudar, Posto desligado com Assunto Declarado, e Aplicar", () => {
  const panel = between(workspace, "data-vinculo-batch-dialog", "<DeleteConfirmation");
  assert.doesNotMatch(panel, /Não mudar/);
  assert.doesNotMatch(panel, /type="radio"|VINCULO_BATCH_CHOICE_GROUPS\.map/);
  assert.doesNotMatch(workspace, /VINCULO_BATCH_RADIO_CLASS|VINCULO_BATCH_OPTION_CLASS/);
  for (const [component, key] of [["VinculoPostSelect", "post"], ["VinculoPageTypeSelect", "page_type"], ["VinculoSubjectSelect", "subject"]] as const) {
    const start = panel.indexOf(`<${component}`);
    assert.ok(start >= 0, component);
    const element = panel.slice(start, panel.indexOf("/>", start));
    assert.ok(element.includes(`value={vinculoBatchSelectValue("${key}", vinculoBatchDialog, vinculoBatchCommon)}`), `${component} mostra o valor comum ou a escolha`);
    assert.ok(element.includes(`onChange={value => chooseVinculoBatch("${key}", value)}`), `${component} guarda a escolha sem gravar`);
    assert.ok(panels.includes(`<${component}`), `${component} também na Revisão Humana`);
  }
  assert.match(panel, /published=\{vinculoBatchCommon\.publishedOnly\}/, "todas publicadas: só os declarados, como na Revisão");
  assert.match(panel, /disabled=\{updating \|\| vinculoBatchPostLocked\}/);
  assert.match(panel, /\{vinculoBatchPostLocked && <p id="minerador-vinculo-batch-post-disabled"[^>]*>\{VINCULO_BATCH_POST_DISABLED_BY_SUBJECT\}<\/p>\}/);
  assert.match(workspace, /const vinculoBatchPostLocked = vinculoBatchDialog && vinculoBatchCommon \? vinculoBatchPostDisabled\(vinculoBatchDialog, vinculoBatchCommon\) : false;/);
  assert.match(workspace, /commonVinculoSelectValues\(keywords\.filter\(item => selectedIds\.has\(item\.id\)\)\)/, "o valor comum sai das linhas que o plano grava");
  assert.match(workspace, /chooseVinculoBatchSelect\(current, key, value, vinculoBatchCommon\)/);
  assert.match(vinculoSelects, /<option value=\{VINCULO_MIXED_VALUE\} disabled>\{VINCULO_MIXED_LABEL\}<\/option>/, "Valores diferentes nunca é escolha");
  assert.doesNotMatch(panel, /bg-\[#|slate-|text-\[1[01]px\]/);
});

test("confirmação do lote diz quantas aprovadas vão para Em revisão, antes de gravar", () => {
  const dialog = between(workspace, "data-vinculo-batch-dialog", "<DeleteConfirmation");
  assert.match(workspace, /describeVinculoBatchChoicesConfirmation\(vinculoBatchPreview, \{ includeCatalogNotice: false \}\)/);
  assert.match(workspace, /planVinculoBatchChoices\(\{[\s\S]{0,200}actions: vinculoBatchDialogActions,[\s\S]{0,120}actorId: actorUserId,/, "a prévia é o mesmo plano que grava");
  assert.match(dialog, /data-vinculo-demotion-warning[^>]*>\{vinculoBatchPreviewText\.warning\}/);
  assert.match(dialog, /vinculoBatchPreviewText\.steps\.map\(step =>/, "o que cada escolha grava e pula");
  assert.match(dialog, /onClick=\{\(\) => void handleBatchVinculo\(vinculoBatchDialog\)\}/);
  assert.match(dialog, /disabled=\{updating \|\| bulkActionProcessing \|\| !vinculoBatchPreview\?\.ok \|\| vinculoBatchPreview\.counts\.updates === 0\}\s*className="[^"]*"\s*>\s*Aplicar/);
  // Nota e destino opcionais, iguais para o lote, só no Declarar.
  assert.match(dialog, /\{vinculoBatchDeclareOpen && \(/);
  assert.match(dialog, /<VinculoSubjectFields\s*batch/, "os mesmos campos da Revisão, com o limite da nota do domínio");
  assert.doesNotMatch(dialog, /autoFocus/, "marcar Declarar não rouba o foco do painel");

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
  for (const name of ["handleSubjectReviewAction", "handleBatchVinculo"]) {
    const body = handlerBody(workspace, name);
    assert.match(body, /const actorId = actorUserId;/, `${name} usa o id da sessão`);
    assert.match(body, /if \(!isKeywordSubjectActorId\(actorId\)\) \{[\s\S]{0,300}return;/, `${name} recusa sem ator`);
    assert.doesNotMatch(body, /session\?\.user\?\.email|\.email\b|"local-user"|"usuario"/, `${name} não usa e-mail nem ator inventado`);
  }
  // O ator da sessão é o auth.users.id do contexto Supabase.
  assert.match(workspace, /const \{ data: session, status: sessionStatus, actorUserId \} = useSession\(\);/);
});

test("escrita isolada por marca e readback estreito das três chaves", () => {
  const review = handlerBody(workspace, "handleSubjectReviewAction");
  assert.match(review, /setKeywordSubject\(item\.analise_semantica, \{[\s\S]{0,300}origin: "review",/);
  assert.match(review, /withdrawKeywordSubject\(item\.analise_semantica, \{ actorId, changedAt, origin: "review" \}\)/);
  assert.match(review, /validateSubjectDestination\(\{ rawUrl: action\.destinationUrl, brandSiteUrl: activeBrand\?\.site_url \|\| null, checkedAt: changedAt, catalog \}\)/);
  assert.match(review, /\.update\(\{ analise_semantica: semantic \}\)\s*\.eq\("id", item\.id\)\s*\.eq\("brand_id", selectedBrandId\)\s*\.is\("deleted_at", null\)/);
  assert.match(review, /\.select\(VINCULO_BATCH_READBACK_COLUMNS\)\s*\.eq\("id", item\.id\)\s*\.eq\("brand_id", selectedBrandId\)\s*\.is\("deleted_at", null\)/);
  assert.match(review, /vinculoReadbackConfirmed\(update, readback as VinculoBatchReadbackRow \| null\)/);

  const batch = handlerBody(workspace, "handleBatchVinculo");
  // 2026-09-24: o seletor Vínculo único grava as três escolhas de uma vez (planVinculoBatchChoices).
  assert.match(batch, /planVinculoBatchChoices\(\{[\s\S]{0,300}brandId: selectedBrandId,[\s\S]{0,200}actorId,/);
  assert.match(batch, /\.update\(\{ analise_semantica: update\.semantic \}\)\s*\.eq\("id", update\.id\)\s*\.eq\("brand_id", update\.brandId\)\s*\.is\("deleted_at", null\)/);
  assert.match(batch, /\.select\(VINCULO_BATCH_READBACK_COLUMNS\)\s*\.eq\("brand_id", selectedBrandId\)\s*\.is\("deleted_at", null\)\s*\.in\("id", readbackChunk\)/);
  assert.match(batch, /for \(let start = 0; start < persistedIds\.length; start \+= KEYWORD_READBACK_ID_CHUNK\)/, "readback em blocos de ids");
  assert.match(batch, /vinculoReadbackConfirmed\(update, rowById\.get\(update\.id\)\)/);
  assert.match(batch, /startBulkProgress\(/, "progresso do lote");

  for (const [name, body] of [["review", review], ["batch", batch]] as const) {
    assert.doesNotMatch(body, /select\("\*"\)|readCanonicalKeywordRows\(/, `${name}: readback estreito, nunca a linha inteira`);
  }

  // Catálogo do destino: colunas estreitas, pela marca ativa, uma linha.
  const catalog = handlerBody(workspace, "lookupSubjectDestinationCatalog");
  assert.match(catalog, /\.from\("brand_site_catalog_entries"\)\s*\.select\("normalized_url,page_type,title,h1"\)\s*\.eq\("marca_id", selectedBrandId\)\s*\.eq\("normalized_url", key\)\s*\.maybeSingle\(\)/);
  assert.match(catalog, /subjectDestinationCatalogKey\(activeBrand\?\.site_url \|\| null, rawUrl\)/);
});

test("Lógica automática usa a mesma rotina do botão Lógica, depois das três declarações, e nunca aprova", () => {
  // Um único ponto chama o motor: a rotina do botão.
  assert.equal((workspace.match(/processLogicalKeywordDna\(/g) || []).length, 1, "nenhum caminho paralelo ao motor");
  const routine = handlerBody(workspace, "runLogicalProcess");
  assert.match(routine, /await processLogicalKeywordDna\(targets, lists, \{ persist: true, showProgress: true \}\)/);
  assert.match(routine, /startBulkProgress\("logic"/, "mesmo progresso do botão");
  assert.match(handlerBody(workspace, "handleQualifySelected"), /await runLogicalProcess\(targets\);/);

  const automatic = handlerBody(workspace, "runAutomaticSubjectLogic");
  assert.match(automatic, /const targets = keywordsWithoutLogic\(declaredItems\);/, "só nas que ainda não têm Lógica");
  assert.match(automatic, /await runLogicalProcess\(targets, \{ automatic: true \}\);/);
  // Contrato do rodapé: a barra só aparece com seleção feita pelo humano; a Lógica automática não seleciona.
  assert.doesNotMatch(automatic, /setSelectedIds\(/);

  assert.match(handlerBody(workspace, "handleSubjectReviewAction"), /if \(persisted && action\.declared\) await runAutomaticSubjectLogic\(\[\{ \.\.\.item, analise_semantica: semantic \}\]\);/);
  // 2026-09-24: com as três escolhas juntas, só as keywords que o passo "Declarar" gravou recebem a Lógica automática.
  assert.match(handlerBody(workspace, "handleBatchVinculo"), /const declaredStep = plan\.steps\.find\(step => step\.action\.kind === "subject_declare"\);\s*if \(declaredStep && confirmedIds\.length > 0\) \{[\s\S]{0,600}declaredIds\.has\(update\.id\)[\s\S]{0,400}await runAutomaticSubjectLogic\(declaredItems\);/);
  assert.match(handlerBody(workspace, "handleSubjectsImported"), /await runAutomaticSubjectLogic\(rows\);/);

  for (const name of ["runLogicalProcess", "runAutomaticSubjectLogic"]) {
    assert.doesNotMatch(handlerBody(workspace, name), /applyApproval|"aprovado"|handleUpdateStatus|handleBatchStatus|\.update\(\{[^}]*\bstatus\b/, `${name} não aprova`);
  }
});

test("o import com Assunto só existe no Processador; o Descobrir não recebe as props", () => {
  assert.match(workspace, /<DiscoverySourceControls ref=\{discoverySourceControlsRef\}[^>]*\bsubjectEntry\b[^>]*onSubjectsImported=\{result => void handleSubjectsImported\(result\)\}/);
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
