import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { applyApproval } from "../lib/minerador/approved-package.ts";
import { setKeywordSubject } from "../lib/minerador/keyword-subject.ts";
import { planVinculoBatchChoices, vinculoBatchReadbackMatches, type VinculoBatchKeyword } from "../lib/minerador/vinculo-batch.ts";
import {
  EMPTY_VINCULO_BATCH_CHOICES,
  VINCULO_BATCH_CHOICE_GROUPS,
  VINCULO_BATCH_POST_DISABLED_BY_SUBJECT,
  applyVinculoBatchChoice,
  describeVinculoBatchChoicesConfirmation,
  describeVinculoBatchChoicesResult,
  vinculoBatchActionsFromChoices,
  vinculoBatchGroupDisabled,
} from "../lib/minerador/vinculo-screen.ts";

/**
 * RODAPÉ DO PROCESSADOR, SEGUNDA RODADA (pedido do dono, 2026-09-24):
 *
 *  1. uma rolagem vertical só — a página não rola, a planilha ocupa a sobra;
 *  2. a barra do rodapé só existe com seleção feita pelo humano;
 *  3. um seletor "Vínculo" só, com três grupos de escolha única (Posto,
 *     Potencial, Assunto), "Declarar Assunto" desliga o Posto, e "Aplicar"
 *     grava as escolhas de uma vez, com a mesma confirmação e o mesmo readback.
 *
 * Fixtures puras, sem rede, banco nem provider; REAL_PROVIDER_CALLS_IN_TESTS = 0.
 */

const BRAND = "09762023-d0d4-4c24-b34e-d0fdfd43f891";
const OTHER_BRAND = "5b1f2d3c-4e5f-4a6b-8c7d-9e0f1a2b3c4d";
const ACTOR = "3f0c9a52-8b1e-4c7d-9f2a-5e6b7c8d9e0f";
const AT = "2026-09-24T12:00:00+00:00";
const SITE = "https://clinicaexemplo.com.br";

const PUBLISHED_ORIGIN = {
  site_origin: {
    sourceUrl: `${SITE}/marketing-para-clinicas`,
    resolvedUrl: `${SITE}/marketing-para-clinicas`,
    canonicalUrl: `${SITE}/marketing-para-clinicas`,
    urlSituation: "canonical_confirmed", publicationStatus: "published",
    lastCheckedAt: "2026-09-20T23:30:00+00:00",
    publicationConfirmedBy: ACTOR, publicationConfirmedAt: "2026-09-20T23:40:00+00:00",
    siteRole: "article",
  },
};

function uuid(n: number) {
  return `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
}

function row(n: number, overrides: Partial<VinculoBatchKeyword> = {}): VinculoBatchKeyword {
  return {
    id: uuid(n), brand_id: BRAND, keyword: `keyword ${n}`, status: "bruto", intent: "Informativa",
    volume_search: 100, results_allintitle: 20, kgr_score: 0.2, lista_id: null,
    analise_semantica: { nicho: "Clínicas" }, ...overrides,
  };
}

function declared(semantic: Record<string, unknown>): Record<string, unknown> {
  const result = setKeywordSubject(semantic, { note: "Serviço para clínicas", actorId: ACTOR, changedAt: AT, origin: "review" });
  assert.ok(result.ok);
  return result.ok ? result.semantic : semantic;
}

async function approvedRow(n: number, semantic: Record<string, unknown> = { nicho: "Clínicas" }): Promise<VinculoBatchKeyword> {
  const base = row(n, { status: "aprovado" });
  const withRecord = await applyApproval({
    keywordId: base.id, brandId: BRAND, keyword: base.keyword, intent: base.intent,
    volumeSearch: base.volume_search, resultsAllintitle: base.results_allintitle, kgrScore: base.kgr_score,
    listaId: base.lista_id, semantic, approvedAt: "2026-09-24T10:00:00+00:00", approvedBy: ACTOR,
  });
  return { ...base, analise_semantica: withRecord };
}

function stripComments(source: string): string {
  return source
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:"'`\\])\/\/.*$/gm, "$1");
}

const workspace = stripComments(readFileSync(new URL("../modules/minerador/minerador-workspace.tsx", import.meta.url), "utf8"));
const tableShell = stripComments(readFileSync(new URL("../modules/minerador/keyword-table/keyword-table-shell.tsx", import.meta.url), "utf8"));
const bulkBarShell = stripComments(readFileSync(new URL("../modules/minerador/keyword-table/keyword-table-bulk-bar-shell.tsx", import.meta.url), "utf8"));

const DECLARE = "subject:declare";
const WITHDRAW = "subject:withdraw";

test("painel: três grupos de escolha única, cada um pode ficar sem escolha", () => {
  assert.deepEqual(VINCULO_BATCH_CHOICE_GROUPS.map(group => group.label), ["Posto de principal", "Potencial de página", "Assunto"]);
  assert.deepEqual(EMPTY_VINCULO_BATCH_CHOICES, { post: "", page_type: "", subject: "" });
  assert.deepEqual(vinculoBatchActionsFromChoices(EMPTY_VINCULO_BATCH_CHOICES), [], "sem escolha, nada a gravar");
  assert.deepEqual(
    vinculoBatchActionsFromChoices({ post: "post:locked", page_type: "page_type:declared:silo", subject: WITHDRAW }),
    [{ kind: "post", policy: "locked" }, { kind: "page_type", pageType: "silo", stance: "declared" }, { kind: "subject_withdraw" }],
    "uma ação por grupo",
  );
  assert.equal(vinculoBatchActionsFromChoices({ post: "", page_type: "page_type:declared:assunto", subject: "" }), null, "valor desconhecido não grava nada pela metade");
  assert.equal(vinculoBatchActionsFromChoices({ post: "subject:declare", page_type: "", subject: "" }), null, "valor de outro grupo não entra");
});

test("Declarar Assunto desliga o Posto: só duas escolhas", () => {
  assert.equal(vinculoBatchGroupDisabled("post", { subject: DECLARE }), true);
  assert.equal(vinculoBatchGroupDisabled("post", { subject: WITHDRAW }), false);
  assert.equal(vinculoBatchGroupDisabled("page_type", { subject: DECLARE }), false, "o Potencial vale para o Assunto");
  assert.equal(vinculoBatchGroupDisabled("subject", { subject: DECLARE }), false);
  assert.match(VINCULO_BATCH_POST_DISABLED_BY_SUBJECT, /Posto de principal não se aplica/);

  const withPost = applyVinculoBatchChoice({ ...EMPTY_VINCULO_BATCH_CHOICES, note: "", destination: "" }, "post", "post:reviewable");
  assert.equal(withPost.post, "post:reviewable");
  const declaring = applyVinculoBatchChoice(withPost, "subject", DECLARE);
  assert.equal(declaring.post, "", "marcar Declarar limpa o Posto");
  assert.equal(declaring.note, "", "o resto do estado fica");
  assert.equal(applyVinculoBatchChoice(withPost, "subject", WITHDRAW).post, "post:reviewable", "Retirar não mexe no Posto");

  const actions = vinculoBatchActionsFromChoices({ post: "post:locked", page_type: "", subject: DECLARE }, { note: "Serviço", destinationUrl: null });
  assert.deepEqual(actions, [{ kind: "subject_declare", note: "Serviço", destinationUrl: null }], "Posto desligado é ignorado");
});

test("Aplicar grava as escolhas de uma vez: uma gravação por keyword, com o readback das quatro chaves", () => {
  const plan = planVinculoBatchChoices({
    keywords: [row(1), row(2, { analise_semantica: declared({ nicho: "Clínicas" }) }), row(3, { brand_id: OTHER_BRAND })],
    brandId: BRAND,
    actions: [{ kind: "page_type", pageType: "landing_page", stance: "declared" }, { kind: "subject_declare", note: "Serviço para clínicas" }],
    actorId: ACTOR,
    changedAt: AT,
    brandSiteUrl: SITE,
  });
  assert.ok(plan.ok);
  if (!plan.ok) return;
  assert.deepEqual(plan.steps.map(step => step.action.kind), ["subject_declare", "page_type"], "Assunto antes do Potencial");
  assert.deepEqual(plan.updates.map(update => update.id), [uuid(1), uuid(2)], "uma gravação por keyword; outra marca nunca");
  assert.equal(plan.actionLabel, "Assunto: Declarado · Potencial de página: Landing page · declarado");
  assert.equal(plan.declaresSubject, true);

  const [first, second] = plan.updates;
  assert.equal(first.brandId, BRAND);
  assert.equal((first.semantic.keyword_subject as { declared?: boolean }).declared, true, "o Assunto e o Potencial no mesmo semantic");
  assert.equal(first.semantic.keyword_page_type, "landing_page");
  assert.equal(first.semantic.keyword_page_type_stance, "declared");
  assert.equal(first.semantic.keyword_page_type_actor, ACTOR, "ator = auth.users.id");
  assert.equal(second.semantic.keyword_page_type, "landing_page", "já era Assunto: só o Potencial muda");

  const good = {
    id: first.id, brand_id: BRAND, keyword_subject: first.semantic.keyword_subject,
    keyword_page_type: "landing_page", keyword_page_type_stance: "declared", primary_keyword_policy: first.semantic.primary_keyword_policy ?? null,
  };
  assert.equal(vinculoBatchReadbackMatches(first, good), true);
  assert.equal(vinculoBatchReadbackMatches(first, { ...good, keyword_subject: null }), false, "o readback confere o Assunto");
  assert.equal(vinculoBatchReadbackMatches(first, { ...good, keyword_page_type_stance: "potential" }), false, "e o Potencial");

  const text = describeVinculoBatchChoicesConfirmation(plan);
  assert.equal(text.summary, "2 keywords serão gravadas.");
  assert.deepEqual(text.steps.map(step => step.summary), [
    "Assunto: Declarado: 1 keyword será gravada.",
    "Potencial de página: Landing page · declarado: 2 keywords serão gravadas.",
  ]);
  assert.ok(text.steps[0].details.some(detail => detail.startsWith("1 já é Assunto e fica como está")), text.steps[0].details.join(" / "));
  assert.equal(describeVinculoBatchChoicesResult(plan, 2), "Assunto: Declarado · Potencial de página: Landing page · declarado: 2 keywords gravadas e conferidas.");
});

test("a confirmação conta as aprovadas que vão para Em revisão uma vez só", async () => {
  const plan = planVinculoBatchChoices({
    keywords: [await approvedRow(1), await approvedRow(2), row(3)],
    brandId: BRAND,
    actions: [{ kind: "subject_declare" }, { kind: "page_type", pageType: "silo", stance: "potential" }],
    actorId: ACTOR,
    changedAt: AT,
    brandSiteUrl: SITE,
  });
  assert.ok(plan.ok);
  if (!plan.ok) return;
  assert.equal(plan.counts.updates, 3);
  assert.equal(plan.counts.approvedToReview, 2, "duas escolhas na mesma aprovada contam uma vez");
  assert.equal(describeVinculoBatchChoicesConfirmation(plan).warning, "2 aprovadas desta seleção vão para Em revisão.");
});

test("Assuntos pulados no Posto; Retirar antes do Posto deixa o Posto valer", () => {
  const publishedSubject = row(1, { analise_semantica: declared({ ...PUBLISHED_ORIGIN }) });
  const published = row(2, { analise_semantica: { ...PUBLISHED_ORIGIN } });
  const onlyPost = planVinculoBatchChoices({ keywords: [publishedSubject, published, row(3)], brandId: BRAND, actions: [{ kind: "post", policy: "reviewable" }], actorId: ACTOR, changedAt: AT });
  assert.ok(onlyPost.ok);
  if (!onlyPost.ok) return;
  assert.deepEqual(onlyPost.updates.map(update => update.id), [uuid(2)]);
  const details = describeVinculoBatchChoicesConfirmation(onlyPost).steps[0].details;
  assert.ok(details.includes("1 keyword é Assunto e foi pulada: o posto não se aplica a Assunto."), details.join(" / "));
  assert.ok(details.some(detail => detail.startsWith("1 não publicada foi pulada")), details.join(" / "));

  const withdrawThenPost = planVinculoBatchChoices({
    keywords: [publishedSubject],
    brandId: BRAND,
    actions: [{ kind: "post", policy: "reviewable" }, { kind: "subject_withdraw" }],
    actorId: ACTOR,
    changedAt: AT,
  });
  assert.ok(withdrawThenPost.ok);
  if (!withdrawThenPost.ok) return;
  assert.deepEqual(withdrawThenPost.steps.map(step => step.action.kind), ["subject_withdraw", "post"]);
  assert.equal(withdrawThenPost.updates.length, 1);
  assert.equal(withdrawThenPost.updates[0].semantic.keyword_subject, null, "o Assunto saiu");
  assert.ok(withdrawThenPost.updates[0].semantic.primary_keyword_policy, "sem o Assunto, o posto se aplica");
  assert.equal(withdrawThenPost.declaresSubject, false);
});

test("o domínio recusa o que a tela desliga, sem ator e sem escolha", () => {
  const keywords = [row(1)];
  const base = { keywords, brandId: BRAND, actorId: ACTOR, changedAt: AT };
  const both = planVinculoBatchChoices({ ...base, actions: [{ kind: "subject_declare" }, { kind: "post", policy: "locked" }] });
  assert.equal(!both.ok && both.code, "POST_WITH_SUBJECT");
  const twice = planVinculoBatchChoices({ ...base, actions: [{ kind: "subject_declare" }, { kind: "subject_withdraw" }] });
  assert.equal(!twice.ok && twice.code, "DUPLICATE_GROUP");
  const none = planVinculoBatchChoices({ ...base, actions: [] });
  assert.equal(!none.ok && none.code, "NO_CHOICE");
  const noActor = planVinculoBatchChoices({ ...base, actorId: "dono@clinica.com.br", actions: [{ kind: "page_type", pageType: "silo" }] });
  assert.equal(!noActor.ok && noActor.code, "ACTOR_REQUIRED", "ator é o auth.users.id, nunca e-mail");
  const noBrand = planVinculoBatchChoices({ ...base, brandId: "", actions: [{ kind: "page_type", pageType: "silo" }] });
  assert.equal(!noBrand.ok && noBrand.code, "BRAND_REQUIRED");
  const badDestination = planVinculoBatchChoices({ ...base, brandSiteUrl: SITE, actions: [{ kind: "subject_declare", destinationUrl: "http://clinicaexemplo.com.br/x" }] });
  assert.equal(badDestination.ok, false, "destino recusado: nada é planejado");
});

test("rodapé não renderiza sem seleção, e nada seleciona pelo humano", () => {
  const renders = workspace.match(/<KeywordTableBulkBarShell\b/g) || [];
  assert.equal(renders.length, 1, "um rodapé só");
  assert.match(workspace, /\{selectedIds\.size > 0 && \(\s*<KeywordTableBulkBarShell className="font-sans">/, "só com seleção");
  assert.doesNotMatch(workspace, /setSelectedIds\(new Set\((?:targets|rows|declaredItems|ids)\b/, "nenhum processo automático vira seleção");
  const automatic = workspace.slice(workspace.indexOf("const runAutomaticSubjectLogic = async"), workspace.indexOf("await runLogicalProcess(targets, { automatic: true });"));
  assert.ok(automatic.length > 0);
  assert.doesNotMatch(automatic, /setSelectedIds/);
  assert.match(workspace, /\{vinculoBatchDialog && selectedIds\.size > 0 && \(/, "o painel do Vínculo some com a seleção");
});

test("uma rolagem vertical só: a página do Processador não rola, a planilha rola com o cabeçalho preso", () => {
  assert.match(tableShell, /scroll === "x" \? "overflow-x-auto overflow-y-visible" : "flex-1 overflow-auto"/, "o shell em scroll=both ocupa a sobra e rola");
  const root = workspace.match(/<div data-processor-page className="([^"]*)">/);
  assert.ok(root, "a página do Processador tem um contêiner próprio");
  const rootClass = root ? root[1].split(/\s+/) : [];
  for (const token of ["flex", "flex-col", "h-[calc(100dvh-2.5rem)]", "min-h-0", "overflow-hidden"]) assert.ok(rootClass.includes(token), token);
  assert.ok(!rootClass.some(token => /^overflow-(?:y-)?(?:auto|scroll)$/.test(token)), "a página não rola");
  assert.doesNotMatch(workspace, /\bmin-h-screen\b/, "nada da página passa da altura da tela");

  // Corretor, 2026-09-24: a classe deixou de depender da seleção (o padding
  // do rodapé virou um irmão) e ganhou altura mínima no lugar de min-h-0.
  const shell = workspace.match(/<KeywordTableShell ref=\{tableRef\} scroll="both" data-processor-table-viewport className="([^"]*)">/);
  assert.ok(shell, "a planilha é o contêiner de rolagem");
  const shellClass = shell ? shell[1].split(/\s+/) : [];
  assert.ok(shellClass.includes("min-h-40"), "a planilha tem altura mínima e nunca cai para 0px");
  assert.ok(!shellClass.some(token => /^max-h-/.test(token)), "sem teto próprio: com teto, a página voltava a rolar");
  assert.match(workspace, /<KeywordTableHeader className="sticky top-0 z-20/, "o cabeçalho fica preso dentro da planilha");
});

test("com seleção, o rodapé fixo não cobre as barras de rolagem da planilha", () => {
  const shell = workspace.match(/<KeywordTableShell ref=\{tableRef\} scroll="both" data-processor-table-viewport className="([^"]*)">/);
  assert.ok(shell);
  assert.doesNotMatch(shell ? shell[1] : "", /\bp[by]-/, "padding fica dentro do contêiner que rola: a barra horizontal ficaria sob o rodapé");
  assert.doesNotMatch(workspace, /data-processor-table-viewport className=\{/, "a classe da planilha não muda com a seleção");
  const after = workspace.slice(workspace.indexOf("</KeywordTableShell>"), workspace.indexOf("<KeywordTableBulkBarShell"));
  const spacer = after.match(/\{selectedIds\.size > 0 && <div aria-hidden="true" data-bulk-bar-spacer className="([^"]*)" \/>\}/);
  assert.ok(spacer, "o espaço do rodapé é um irmão depois da planilha, só com seleção");
  const spacerClass = spacer ? spacer[1].split(/\s+/) : [];
  assert.ok(spacerClass.includes("shrink-0"));
  const barHeight = bulkBarShell.match(/fixed bottom-0 [^"`]*?\b(h-\d+)\b/);
  assert.ok(barHeight, "o rodapé é fixo no pé da tela");
  assert.ok(barHeight && spacerClass.includes(barHeight[1]), "o espaço tem a altura do rodapé");
});

test("os blocos acima da planilha têm teto e rolagem própria só quando passam dele", () => {
  const start = workspace.indexOf("<div data-processor-top-blocks");
  const end = workspace.indexOf("<KeywordTableShell ref={tableRef}");
  assert.ok(start > 0 && end > start);
  const wrapper = workspace.slice(start, workspace.indexOf(">", start)).split(/\s+/);
  for (const token of ["max-h-[45dvh]", "shrink-0", "overflow-y-auto"]) assert.ok(wrapper.some(part => part.replace(/^className="|"$/g, "") === token), token);
  const blocks = workspace.slice(start, end);
  for (const label of ["Filtros de organização", "Conferir URL manualmente", "Keywords em recuperação", "Prévia da conferência Site/Sitemap"]) {
    assert.ok(blocks.includes(label), `${label} fica dentro do invólucro com teto`);
  }
  const recovery = blocks.match(/<section className="([^"]*)" aria-label="Keywords em recuperação">/);
  assert.ok(recovery);
  assert.doesNotMatch(recovery ? recovery[1] : "", /max-h-|overflow-y-auto/, "sem rolagem aninhada dentro do invólucro");
});

test("seletor Vínculo: foco, teclado e tema do sistema visual", () => {
  const bar = workspace.slice(workspace.indexOf("<KeywordTableBulkBarShell"), workspace.indexOf("</KeywordTableBulkBarShell>"));
  const attribute = bar.indexOf("data-vinculo-batch-trigger");
  assert.ok(attribute >= 0);
  const button = bar.slice(bar.lastIndexOf("<button", attribute), bar.indexOf("</button>", attribute));
  assert.match(button, /aria-haspopup="dialog"/);
  assert.match(button, /focus-visible:outline-module-accent/);
  assert.match(button, /min-h-9/);
  assert.match(button, /text-sm/);
  const panel = workspace.slice(workspace.indexOf("id=\"minerador-vinculo-batch-panel\""), workspace.indexOf("<DeleteConfirmation"));
  assert.match(panel, /role="dialog"/);
  assert.match(panel, /bg-surface-elevated/);
  assert.doesNotMatch(panel, /bg-\[#|\bslate-\d|\btext-\[(?:9|10|11|12|13)px\]|\btext-xs\b|\bbg-(?:black|white)\b/, "tokens e texto de 14px");
});

test("painel do Vínculo: Escape devolve o foco ao botão; Tab para fora e seleção vazia fecham sem gravar", () => {
  const focusEffect = workspace.slice(workspace.indexOf("if (!vinculoBatchDialogOpen) return;"), workspace.indexOf("}, [vinculoBatchDialogOpen]);"));
  assert.match(focusEffect, /vinculoBatchDialogRef\.current\?\.focus\(\)/, "o painel recebe o foco ao abrir");
  assert.match(focusEffect, /return \(\) => \{[\s\S]*const trigger = vinculoBatchTriggerRef\.current;[\s\S]*if \(trigger\?\.isConnected\) trigger\.focus\(\);/, "ao fechar, o foco volta ao botão que abriu");
  const listeners = workspace.slice(workspace.indexOf("}, [vinculoBatchDialogOpen]);"), workspace.indexOf("}, [vinculoBatchDialogOpen, updating]);"));
  assert.match(listeners, /event\.key === "Escape" && !updating\) setVinculoBatchDialog\(null\)/, "Escape fecha e mantém o botão como destino do foco");
  assert.doesNotMatch(listeners.slice(listeners.indexOf("const onKeyDown"), listeners.indexOf("const onPointerDown")), /vinculoBatchTriggerRef\.current = null/);
  const focusIn = listeners.slice(listeners.indexOf("const onFocusIn"), listeners.indexOf("document.addEventListener"));
  assert.match(focusIn, /vinculoBatchDialogRef\.current\?\.contains\(event\.target\)/);
  assert.match(focusIn, /vinculoBatchTriggerRef\.current = null;\s*setVinculoBatchDialog\(null\);/, "Tab para fora fecha, e o foco fica onde chegou");
  assert.match(listeners, /document\.addEventListener\("focusin", onFocusIn\)/);
  assert.match(listeners, /document\.removeEventListener\("focusin", onFocusIn\)/);
  assert.doesNotMatch(listeners, /handleBatchVinculo|supabase/, "fechar não grava");
  assert.match(workspace, /if \(vinculoBatchDialog && selectedIds\.size === 0\) setVinculoBatchDialog\(null\);/, "seleção vazia descarta as escolhas");

  const bar = workspace.slice(workspace.indexOf("<KeywordTableBulkBarShell"), workspace.indexOf("</KeywordTableBulkBarShell>"));
  const triggers = bar.match(/<button[^>]*?data-vinculo-batch-trigger[\s\S]*?<\/button>/g) || [];
  assert.equal(triggers.length, 2);
  assert.match(triggers[0], /aria-controls=\{vinculoBatchDialogOpen \? "minerador-vinculo-batch-panel" : undefined\}/, "aria-controls só aponta para o painel quando ele existe");
  assert.doesNotMatch(triggers[1], /aria-controls/, "o item de Mais ações some ao abrir o painel");
});

test("Potencial \"potencial\" em grupo pula e conta a publicada; o declarado vale para ela", () => {
  const published = row(1, { analise_semantica: { ...PUBLISHED_ORIGIN } });
  const potential = planVinculoBatchChoices({
    keywords: [published, row(2)],
    brandId: BRAND,
    actions: [{ kind: "page_type", pageType: "silo", stance: "potential" }],
    actorId: ACTOR,
    changedAt: AT,
  });
  assert.ok(potential.ok);
  if (!potential.ok) return;
  assert.deepEqual(potential.updates.map(update => update.id), [uuid(2)], "a publicada não recebe potencial");
  assert.equal(potential.steps[0].counts.published_potential, 1);
  const details = describeVinculoBatchChoicesConfirmation(potential).steps[0].details;
  assert.ok(details.some(detail => detail.startsWith("1 publicada foi pulada: na publicada o tipo já é declarado pela publicação")), details.join(" / "));

  const declaredChoice = planVinculoBatchChoices({
    keywords: [published],
    brandId: BRAND,
    actions: [{ kind: "page_type", pageType: "silo", stance: "declared" }],
    actorId: ACTOR,
    changedAt: AT,
  });
  assert.ok(declaredChoice.ok);
  if (!declaredChoice.ok) return;
  assert.deepEqual(declaredChoice.updates.map(update => update.id), [uuid(1)], "o declarado grava na publicada");
  assert.equal(declaredChoice.updates[0].semantic.keyword_page_type_stance, "declared");
});
