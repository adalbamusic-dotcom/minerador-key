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
  // O rótulo visível nomeia cada controle (sem aria-label que o substitua), e o id vem de useId().
  assert.match(control, /const selectId = useId\(\);/);
  assert.match(control, /<label className="text-sm font-medium text-text-muted" htmlFor=\{selectId\}>Assunto<\/label>\s*<select\s*id=\{selectId\}/);
  assert.doesNotMatch(control, /aria-label="(Assunto na revisão humana|Nota do Assunto|Página de destino do Assunto)"/);
  assert.match(control, /<option value="none">Não<\/option>/);
  assert.match(control, /<option value="declared">Declarado<\/option>/);
  // Mudar o select não grava: só a confirmação grava.
  assert.match(control, /id=\{selectId\}[\s\S]{0,200}onChange=\{event => setChoice\(/);
  assert.match(control, /Nota: o que é, para quem\s*<input[\s\S]{0,200}maxLength=\{KEYWORD_SUBJECT_NOTE_MAX\}/, "nota até 280, do domínio");
  assert.match(control, /Página de destino\s*<input/);
  assert.match(control, /\{ type: "subject", declared: true, note: note\.trim\(\) \|\| null, destinationUrl: destination\.trim\(\) \|\| null \}/);
  assert.match(control, /\{ type: "subject", declared: false \}/);
  // F1.5: aviso de rebaixamento antes de confirmar, numa aprovada.
  assert.match(control, /subjectReviewWarning\(\{ approved, currentlyDeclared: declared, nextDeclared \}\)/);
  assert.match(control, /data-subject-demotion-warning[\s\S]{0,1500}Confirmar e gravar/);

  // O controle mora na seção Vínculo, depois do tipo de página, e recebe a
  // aprovação efetiva e o mesmo resultado do resolvedor.
  const vinculoSection = between(panels, 'aria-label="Vínculo da keyword"', "</section>");
  assert.match(vinculoSection, /aria-label="Tipo de página na revisão humana"[\s\S]*<ReviewSubjectControl/);
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
  assert.match(workspace, /\{vinculo\.subjectLabel \? \(\s*<span\s+data-keyword-subject-label[\s\S]{0,300}border-context-accent\/50 bg-context-accent\/10[\s\S]{0,120}text-context-accent[\s\S]{0,400}\{vinculo\.subjectLabel\}/);
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

test("rodapé: select Vínculo ao lado do KGR, com os três grupos, também em Mais ações", () => {
  const bar = between(workspace, "<KeywordTableBulkBarShell", "</KeywordTableBulkBarShell>");
  const selects = bar.match(/aria-label="Vínculo das selecionadas"[\s\S]{0,1400}?<\/select>/g) || [];
  assert.equal(selects.length, 2, "no rodapé e em Mais ações");
  for (const select of selects) {
    assert.match(select, /VINCULO_BATCH_CHOICE_GROUPS\.map\(group => \(\s*<optgroup key=\{group\.key\} label=\{group\.label\}>/);
    // Escolher abre a confirmação; nada é gravado no onChange.
    assert.match(select, /onChange=\{\(event\) => \{[^}]*setVinculoBatchDialog\(\{ choice, note: "", destination: "" \}\)/);
    assert.doesNotMatch(select, /handleBatchVinculo|supabase/);
  }
  const kgr = bar.indexOf('aria-label="Aplicabilidade do KGR das selecionadas"');
  const vinculo = bar.indexOf('aria-label="Vínculo das selecionadas"');
  const concluir = bar.indexOf('ariaLabel="Concluir revisão das selecionadas"');
  assert.ok(kgr >= 0 && kgr < vinculo && vinculo < concluir, "ordem: KGR → Vínculo → Concluir revisão");
  const menu = between(bar, 'id="minerador-more-actions-menu"', "</div>}");
  assert.match(menu, /aria-label="Vínculo das selecionadas"/);

  // Q5: ficam FORA do rodapé reabrir revisão, conferir por link e confirmar
  // publicada / desvincular.
  assert.doesNotMatch(bar, /type: "reopen"|Revisar novamente/);
  assert.doesNotMatch(bar, /openManualSiteCheck|onCheckByLink|Conferir por link/);
  assert.doesNotMatch(bar, /handlePublicationLinkAction|onPublicationAction|Confirmar publicada|Desvincular/);
});

test("confirmação do lote diz quantas aprovadas vão para Em revisão, antes de gravar", () => {
  const dialog = between(workspace, "data-vinculo-batch-dialog", "<DeleteConfirmation");
  assert.match(workspace, /describeVinculoBatchConfirmation\(vinculoBatchPreview, \{ includeCatalogNotice: false \}\)/);
  assert.match(dialog, /data-vinculo-demotion-warning[^>]*>\{vinculoBatchPreviewText\.warning\}/);
  assert.match(dialog, /onClick=\{\(\) => void handleBatchVinculo\(vinculoBatchDialog\)\}/);
  assert.match(dialog, /disabled=\{updating \|\| bulkActionProcessing \|\| !vinculoBatchPreview\?\.ok \|\| vinculoBatchPreview\.counts\.updates === 0\}/);
  // Nota e destino opcionais, iguais para o lote, só no Declarar.
  assert.match(dialog, /isSubjectDeclareChoice\(vinculoBatchDialog\.choice\) && \(/);
  assert.match(dialog, /maxLength=\{KEYWORD_SUBJECT_NOTE_MAX\}/);

  // Foco: o diálogo recebe o foco, Escape fecha pelo document e o foco volta a quem abriu.
  assert.match(dialog, /ref=\{vinculoBatchDialogRef\}\s*tabIndex=\{-1\}/);
  assert.match(workspace, /aria-describedby="minerador-vinculo-batch-summary"\s*data-vinculo-batch-dialog/);
  assert.match(dialog, /id="minerador-vinculo-batch-summary"[\s\S]{0,600}data-vinculo-demotion-warning/, "a contagem está na descrição do diálogo");
  assert.match(workspace, /if \(!vinculoBatchDeclareOpen\) vinculoBatchDialogRef\.current\?\.focus\(\);/);
  assert.match(workspace, /if \(trigger\?\.isConnected\) trigger\.focus\(\);/);
  assert.match(workspace, /document\.addEventListener\("keydown", onKeyDown\);[\s\S]{0,120}document\.removeEventListener\("keydown", onKeyDown\)/);
  assert.equal((workspace.match(/vinculoBatchTriggerRef\.current = /g) || []).length, 3, "os dois selects guardam quem abriu; o fechamento limpa");
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
  assert.match(batch, /planVinculoBatch\(\{[\s\S]{0,300}brandId: selectedBrandId,[\s\S]{0,200}actorId,/);
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

  assert.match(handlerBody(workspace, "handleSubjectReviewAction"), /if \(persisted && action\.declared\) await runAutomaticSubjectLogic\(\[\{ \.\.\.item, analise_semantica: semantic \}\]\);/);
  assert.match(handlerBody(workspace, "handleBatchVinculo"), /if \(action\.kind === "subject_declare" && confirmedIds\.length > 0\) \{[\s\S]{0,400}await runAutomaticSubjectLogic\(declaredItems\);/);
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
