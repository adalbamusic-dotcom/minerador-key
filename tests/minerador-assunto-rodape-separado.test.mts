import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  keywordPageTypeChoices,
  keywordPageTypeStance,
  parseKeywordPageTypeChoice,
  resolveKeywordPageType,
  setKeywordPageType,
} from "../lib/minerador/keyword-page-type.ts";
import { setKeywordSubject } from "../lib/minerador/keyword-subject.ts";
import { resolveKeywordVinculo } from "../lib/minerador/keyword-vinculo.ts";
import { planVinculoBatch, vinculoBatchReadbackMatches, type VinculoBatchKeyword } from "../lib/minerador/vinculo-batch.ts";
import {
  VINCULO_BATCH_CHOICE_GROUPS,
  describeSubjectSkipped,
  describeVinculoBatchConfirmation,
  partitionSubjectKeywords,
  vinculoBatchActionFromChoice,
  vinculoBatchChoiceSections,
} from "../lib/minerador/vinculo-screen.ts";
import {
  PAGE_TYPE_HUMAN_DECLARED_REASON,
  describeEditorialUnitDeclaration,
  editorialUnitDeclarationFromVinculo,
  readArchitectKeywordVinculo,
} from "../lib/arquiteto/editorial-unit-declaration.ts";

/**
 * RODAPÉ COM QUATRO SELECTS SEPARADOS E POTENCIAL DE PÁGINA COM 8 VALORES
 * (pedido do dono, 2026-09-24). KGR, Posto de principal, Potencial de página e
 * Assunto; o Assunto anula KGR e Posto, e o Potencial vale para ele. Fixtures
 * puras, sem rede nem provider; REAL_PROVIDER_CALLS_IN_TESTS = 0.
 */

const BRAND = "09762023-d0d4-4c24-b34e-d0fdfd43f891";
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

function row(n: number, semantic: Record<string, unknown> = { nicho: "Clínicas" }): VinculoBatchKeyword {
  return {
    id: uuid(n), brand_id: BRAND, keyword: `keyword ${n}`, status: "bruto", intent: "Informativa",
    volume_search: 100, results_allintitle: 20, kgr_score: 0.2, lista_id: null, analise_semantica: semantic,
  };
}

function subjectOf(semantic: Record<string, unknown>): Record<string, unknown> {
  const declared = setKeywordSubject(semantic, { note: "Serviço para clínicas", actorId: ACTOR, changedAt: AT, origin: "review" });
  assert.ok(declared.ok);
  return declared.ok ? declared.semantic : semantic;
}

function stripComments(source: string): string {
  return source
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:"'`\\])\/\/.*$/gm, "$1");
}

test("Potencial de página: 8 escolhas na keyword nova, 4 declaradas na publicada", () => {
  const nova = keywordPageTypeChoices();
  assert.equal(nova.length, 8);
  assert.deepEqual(nova.map(choice => choice.label), [
    "Artigo · potencial", "Silo · potencial", "Landing page · potencial", "Página de serviço · potencial",
    "Artigo · declarado", "Silo · declarado", "Landing page · declarado", "Página de serviço · declarado",
  ]);
  const publicada = keywordPageTypeChoices({ published: true });
  assert.deepEqual(publicada.map(choice => choice.value), ["declared:article", "declared:silo", "declared:landing_page", "declared:service_page"]);
  for (const choice of nova) assert.deepEqual(parseKeywordPageTypeChoice(choice.value), { pageType: choice.pageType, stance: choice.stance });
  assert.equal(parseKeywordPageTypeChoice("declared:assunto"), null, "Assunto nunca é tipo de página");
  assert.equal(parseKeywordPageTypeChoice("travado:silo"), null);
  assert.equal(parseKeywordPageTypeChoice("declared:silo:x"), null);
});

test("sem o peso gravado, a resolução é byte a byte a de antes", () => {
  const antes = resolveKeywordPageType({ semantic: { keyword_page_type: "silo" } });
  assert.deepEqual(antes, { type: "silo", source: "human", determined: true, published: false, declared: false });
  assert.equal("humanDeclared" in antes, false);
  assert.equal(keywordPageTypeStance(antes), "potential");
});

test("declarado vale para qualquer keyword: nova e travada como decisão humana", () => {
  const written = setKeywordPageType({ nicho: "Clínicas" }, { pageType: "landing_page", stance: "declared", actorId: ACTOR, changedAt: AT });
  assert.equal(written.changed, true);
  assert.equal(written.semantic.keyword_page_type, "landing_page");
  assert.equal(written.semantic.keyword_page_type_stance, "declared");
  const history = written.semantic.keyword_page_type_history as Record<string, unknown>[];
  assert.deepEqual(history.at(-1), { previous: "article", next: "landing_page", actorId: ACTOR, changedAt: AT, previousStance: "potential", nextStance: "declared" });

  const resolution = resolveKeywordPageType({ semantic: written.semantic });
  assert.equal(resolution.declared, false, "não é publicação: o Arquiteto não a lê como página no ar");
  assert.equal(resolution.humanDeclared, true);
  assert.equal(keywordPageTypeStance(resolution), "declared");
  assert.equal(resolveKeywordVinculo({ status: "bruto", semantic: written.semantic }).pageTypeLabel, "Landing page · declarado");

  const same = setKeywordPageType(written.semantic, { pageType: "landing_page", stance: "declared", actorId: ACTOR, changedAt: AT });
  assert.equal(same.changed, false, "repetir não escreve");
  const onlyStance = setKeywordPageType(written.semantic, { pageType: "landing_page", stance: "potential", actorId: ACTOR, changedAt: AT });
  assert.equal(onlyStance.changed, true, "trocar só o peso é mudança real");
  assert.equal(resolveKeywordVinculo({ status: "bruto", semantic: onlyStance.semantic }).pageTypeLabel, "Landing page · potencial");

  const legacy = setKeywordPageType({}, { pageType: "silo", actorId: ACTOR, changedAt: AT });
  assert.equal("keyword_page_type_stance" in legacy.semantic, false, "sem peso, o contrato anterior");
});

test("publicada continua como hoje: o tipo é declaração pela publicação", () => {
  const vinculo = resolveKeywordVinculo({ status: "bruto", semantic: { ...PUBLISHED_ORIGIN } });
  assert.equal(vinculo.pageType.declared, true);
  assert.equal(vinculo.pageTypeLabel, "Artigo · declarado");
  assert.equal(keywordPageTypeStance(vinculo.pageType), "declared");
});

test("Vínculo: três grupos separados, cada um com seus valores (hoje dentro do seletor único do rodapé)", () => {
  const [post, pageType, subject] = VINCULO_BATCH_CHOICE_GROUPS;
  assert.equal(post.ariaLabel, "Posto de principal das selecionadas");
  assert.equal(pageType.ariaLabel, "Potencial de página das selecionadas");
  assert.equal(subject.ariaLabel, "Assunto das selecionadas");
  assert.deepEqual(vinculoBatchChoiceSections(pageType).map(section => [section.label, section.options.length]), [["Potencial", 4], ["Declarado", 4]]);
  assert.deepEqual(vinculoBatchChoiceSections(post).map(section => section.label), [null]);
  for (const option of pageType.options) assert.equal(vinculoBatchActionFromChoice(option.value)?.kind, "page_type");
  assert.deepEqual(vinculoBatchActionFromChoice("page_type:declared:silo"), { kind: "page_type", pageType: "silo", stance: "declared" });
  assert.deepEqual(vinculoBatchActionFromChoice("page_type:silo"), { kind: "page_type", pageType: "silo" }, "valor anterior segue válido");
  assert.equal(vinculoBatchActionFromChoice("page_type:declared:assunto"), null);
});

test("o Assunto anula o posto: pulado e contado na confirmação", () => {
  const publishedSubject = row(1, subjectOf({ ...PUBLISHED_ORIGIN }));
  const published = row(2, { ...PUBLISHED_ORIGIN });
  const plan = planVinculoBatch({ keywords: [publishedSubject, published], brandId: BRAND, action: { kind: "post", policy: "reviewable" }, actorId: ACTOR, changedAt: AT });
  assert.ok(plan.ok);
  if (!plan.ok) return;
  assert.deepEqual(plan.updates.map(update => update.id), [published.id]);
  assert.equal(plan.counts.subject_declared, 1);
  assert.deepEqual(plan.skipped, [{ id: publishedSubject.id, keyword: publishedSubject.keyword, reason: "subject_declared" }]);
  const text = describeVinculoBatchConfirmation(plan);
  assert.ok(text.details.includes("1 keyword é Assunto e foi pulada: o posto não se aplica a Assunto."));
});

test("o Potencial de página vale para o Assunto, com o peso e o readback", () => {
  const subject = row(1, subjectOf({ nicho: "Clínicas" }));
  const plan = planVinculoBatch({ keywords: [subject, row(2)], brandId: BRAND, action: { kind: "page_type", pageType: "landing_page", stance: "declared" }, actorId: ACTOR, changedAt: AT });
  assert.ok(plan.ok);
  if (!plan.ok) return;
  assert.deepEqual(plan.updates.map(update => update.id), [uuid(1), uuid(2)]);
  assert.equal(plan.actionLabel, "Potencial de página: Landing page · declarado");
  const update = plan.updates[0];
  assert.equal(update.semantic.keyword_page_type_stance, "declared");
  assert.equal(update.semantic.keyword_page_type_actor, ACTOR);
  const good = {
    id: update.id, brand_id: BRAND, keyword_subject: update.semantic.keyword_subject,
    keyword_page_type: "landing_page", keyword_page_type_stance: "declared", primary_keyword_policy: null,
  };
  assert.equal(vinculoBatchReadbackMatches(update, good), true);
  assert.equal(vinculoBatchReadbackMatches(update, { ...good, keyword_page_type_stance: "potential" }), false, "o peso é conferido");
  const bad = planVinculoBatch({ keywords: [row(3)], brandId: BRAND, action: { kind: "page_type", pageType: "silo", stance: "travado" as never }, actorId: ACTOR, changedAt: AT });
  assert.equal(!bad.ok && bad.code, "INVALID_ACTION");
  const noActor = planVinculoBatch({ keywords: [row(3)], brandId: BRAND, action: { kind: "page_type", pageType: "silo", stance: "declared" }, actorId: "dono@clinica.com.br", changedAt: AT });
  assert.equal(!noActor.ok && noActor.code, "ACTOR_REQUIRED", "ator é o auth.users.id, nunca e-mail");
});

test("KGR em grupo: o Assunto sai do lote e o aviso conta", () => {
  const items = [row(1, subjectOf({ nicho: "Clínicas" })), row(2), row(3, subjectOf({}))];
  const { eligible, subjects } = partitionSubjectKeywords(items);
  assert.deepEqual(eligible.map(item => item.id), [uuid(2)]);
  assert.deepEqual(subjects.map(item => item.id), [uuid(1), uuid(3)]);
  assert.equal(describeSubjectSkipped(2, "KGR"), "2 keywords são Assunto e foram puladas: o KGR não se aplica a Assunto.");
  assert.equal(describeSubjectSkipped(1, "KGR"), "1 keyword é Assunto e foi pulada: o KGR não se aplica a Assunto.");
  assert.equal(describeSubjectSkipped(0, "KGR"), null);
});

test("Arquiteto: o declarado humano é decisão que a formação respeita, enum intacto", () => {
  const declared = setKeywordPageType({}, { pageType: "silo", stance: "declared", actorId: ACTOR, changedAt: AT }).semantic;
  const vinculo = readArchitectKeywordVinculo({ status: "bruto", analise_semantica: declared });
  assert.equal(vinculo.pageTypeHumanDeclared, true);
  assert.equal(vinculo.pageTypeDeclared, false, "não vira página publicada");
  const declaration = editorialUnitDeclarationFromVinculo(vinculo);
  assert.deepEqual(declaration, { source: "potential", unit: "silo", confidence: null, reasons: [PAGE_TYPE_HUMAN_DECLARED_REASON] });
  assert.equal(describeEditorialUnitDeclaration(declaration), "Nova: declarada Silo pelo humano (tipo travado).");

  const potential = readArchitectKeywordVinculo({ status: "bruto", analise_semantica: { keyword_page_type: "silo" } });
  assert.equal("pageTypeHumanDeclared" in potential, false, "sem declaração, o objeto é o de antes");
  const potentialDeclaration = editorialUnitDeclarationFromVinculo(potential);
  assert.equal(potentialDeclaration?.source, "potential");
  assert.deepEqual(potentialDeclaration?.source === "potential" ? potentialDeclaration.reasons : null, ["Declarado pelo humano no Minerador."]);
});

test("tela: Importar CSV na barra, KGR e Vínculo no rodapé, tema escuro e Revisão", () => {
  const workspace = stripComments(readFileSync(new URL("../modules/minerador/minerador-workspace.tsx", import.meta.url), "utf8"));
  const panels = stripComments(readFileSync(new URL("../components/editorial/dna-panels.tsx", import.meta.url), "utf8"));

  const toolbar = workspace.slice(workspace.indexOf("actions: <div"), workspace.indexOf("tabs: sectionTabs"));
  assert.match(toolbar, /\{discoverySourceActions\}/, "Importar CSV e Colar na barra global do Processador");

  // Atualizado pelo corretor (2026-09-24): o tema virou o compartilhado
  // NATIVE_SELECT_THEME (lib/ui), que alcança as opções dentro de optgroup
  // (**:) e volta a scheme-light no tema claro.
  assert.match(workspace, /const BULK_SELECT_THEME = NATIVE_SELECT_THEME;/);
  const bar = workspace.slice(workspace.indexOf("<KeywordTableBulkBarShell"), workspace.indexOf("</KeywordTableBulkBarShell>"));
  const nativeSelects = bar.match(/<select[\s\S]*?<\/select>/g) || [];
  // Atualizado em 2026-09-24 (pedido do dono): os 3 selects do Vínculo viraram um seletor só
  // (botão que abre o painel); ficam KGR e Status, no rodapé e em Mais ações.
  assert.ok(nativeSelects.length >= 4);
  for (const select of nativeSelects) assert.match(select, /BULK_SELECT_THEME/, "todo select do rodapé abre escuro");

  const kgrHandler = workspace.slice(workspace.indexOf("const handleBatchKgrApplicability = async"), workspace.indexOf("const handleBatchCompleteHumanReview = async"));
  assert.match(kgrHandler, /partitionSubjectKeywords\(/);
  assert.match(kgrHandler, /planKgrApplicabilityBatch\(\s*eligible,/);
  assert.match(kgrHandler, /describeSubjectSkipped\(subjects\.length, "KGR"\)/);

  const pageTypeBranch = workspace.slice(workspace.indexOf('if (action.type === "page_type")'), workspace.indexOf('if (action.type === "primary_policy")'));
  assert.match(pageTypeBranch, /actorUserId/);
  assert.doesNotMatch(pageTypeBranch, /"usuario"|session\?\.user\?\.email/);
  assert.match(pageTypeBranch, /\.select\(VINCULO_BATCH_READBACK_COLUMNS\)/);
  assert.match(pageTypeBranch, /vinculoReadbackConfirmed\(/);
  assert.match(pageTypeBranch, /stance: action\.stance/);

  assert.match(panels, /const subjectDeclared = vinculo\.subject\?\.declared === true;/);
  assert.match(panels, /disabled=\{statusUpdating \|\| reviewLocked \|\| !onAction \|\| subjectDeclared\}/, "Posto desligado com Assunto");
  assert.match(panels, /disabled=\{statusUpdating \|\| reviewLocked \|\| subjectLocksKgr\}/, "KGR desligado com Assunto, salvo se a conclusão exigir");
  // 2026-09-24 (pedido do dono): os selects do Vínculo viraram um componente
  // comum com o rodapé (vinculo-selects.tsx), que entrega o valor já lido.
  assert.match(panels, /parseKeywordPageTypeChoice\(value\)/);
  assert.match(panels, /type: "page_type", pageType: choice\.pageType, stance: choice\.stance/);
});
