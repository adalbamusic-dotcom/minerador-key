import assert from "node:assert/strict";
import test from "node:test";

import { applyApproval } from "../lib/minerador/approved-package.ts";
import { buildLogicalOutputContract } from "../lib/minerador/logical-processor.ts";
import { setKeywordSubject, withdrawKeywordSubject } from "../lib/minerador/keyword-subject.ts";
import { SUBJECT_DESTINATION_NO_BRAND_SITE_NOTICE, SUBJECT_DESTINATION_OUT_OF_CATALOG_NOTICE } from "../lib/minerador/subject-destination.ts";
import { planVinculoBatch, vinculoBatchReadbackMatches, type VinculoBatchKeyword } from "../lib/minerador/vinculo-batch.ts";
import {
  SUBJECT_DECLARE_APPROVED_WARNING,
  SUBJECT_WITHDRAW_APPROVED_BATCH_WARNING_MANY,
  SUBJECT_WITHDRAW_APPROVED_WARNING,
  VINCULO_BATCH_CHOICE_GROUPS,
  describeVinculoBatchConfirmation,
  describeVinculoBatchResult,
  isSubjectDeclareChoice,
  keywordsWithoutLogic,
  pickKeywordSubjectKeys,
  subjectReviewWarning,
  vinculoBatchActionFromChoice,
  vinculoReadbackConfirmed,
} from "../lib/minerador/vinculo-screen.ts";

/**
 * TELA DO PROCESSADOR · VÍNCULO EM GRUPO E ASSUNTO (SDD 2026-09-24, F1.4 a
 * F1.7b). O que a tela diz e confere sobre o plano puro. Fixtures puras,
 * sem rede nem provider; REAL_PROVIDER_CALLS_IN_TESTS = 0.
 */

const BRAND = "09762023-d0d4-4c24-b34e-d0fdfd43f891";
const ACTOR = "3f0c9a52-8b1e-4c7d-9f2a-5e6b7c8d9e0f";
const AT = "2026-09-24T12:00:00+00:00";
const SITE = "https://clinicaexemplo.com.br";
const INTENT = "Comercial investigativa";

function uuid(n: number) {
  return `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
}

function row(n: number, overrides: Partial<VinculoBatchKeyword> = {}): VinculoBatchKeyword {
  return {
    id: uuid(n),
    brand_id: BRAND,
    keyword: `keyword ${n}`,
    status: "bruto",
    intent: "Informativa",
    volume_search: 100,
    results_allintitle: 20,
    kgr_score: 0.2,
    lista_id: null,
    analise_semantica: { nicho: "Clínicas" },
    ...overrides,
  };
}

async function approvedRow(n: number, semantic: Record<string, unknown> = { nicho: "Clínicas" }): Promise<VinculoBatchKeyword> {
  const base = row(n, { status: "aprovado" });
  const withRecord = await applyApproval({
    keywordId: base.id,
    brandId: BRAND,
    keyword: base.keyword,
    intent: base.intent,
    volumeSearch: base.volume_search,
    resultsAllintitle: base.results_allintitle,
    kgrScore: base.kgr_score,
    listaId: base.lista_id,
    semantic,
    approvedAt: "2026-09-24T10:00:00+00:00",
    approvedBy: ACTOR,
  });
  return { ...base, analise_semantica: withRecord };
}

/** O que o JSONB devolve: chaves de objeto ordenadas por tamanho, depois por byte. */
function jsonbOrder(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(jsonbOrder);
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    const keys = Object.keys(record).sort((a, b) => a.length - b.length || (a < b ? -1 : a > b ? 1 : 0));
    return Object.fromEntries(keys.map(key => [key, jsonbOrder(record[key])]));
  }
  return value;
}

test("o select Vínculo tem os três grupos e nenhuma das escolhas que ficam fora (Q5)", () => {
  assert.deepEqual(VINCULO_BATCH_CHOICE_GROUPS.map(group => group.key), ["subject", "page_type", "post"]);
  assert.deepEqual(VINCULO_BATCH_CHOICE_GROUPS.map(group => group.label), ["Assunto", "Tipo de página", "Posto (só publicadas)"]);
  const [subject, pageType, post] = VINCULO_BATCH_CHOICE_GROUPS;
  assert.deepEqual(subject.options.map(option => option.label), ["Declarar Assunto", "Retirar Assunto"]);
  assert.equal(pageType.options.length, 4, "os 4 tipos, enum intacto");
  assert.deepEqual(post.options.map(option => option.label), ["Travado ao slug", "Livre"]);

  const everything = VINCULO_BATCH_CHOICE_GROUPS.flatMap(group => group.options.map(option => `${option.value} ${option.label}`)).join(" | ");
  assert.doesNotMatch(everything, /reabrir|revisar novamente|reopen/i, "reabrir revisão fica fora");
  assert.doesNotMatch(everything, /conferir|link|check/i, "conferir por link fica fora");
  assert.doesNotMatch(everything, /confirmar publica|desvincular|unlink|confirm/i, "confirmar publicada / desvincular fica fora");
  assert.doesNotMatch(everything, /cancel/i, "cancelar não se aplica a grupo");

  // Toda escolha vira uma ação do plano; valor desconhecido não vira nada.
  for (const option of VINCULO_BATCH_CHOICE_GROUPS.flatMap(group => group.options)) {
    assert.ok(vinculoBatchActionFromChoice(option.value), option.value);
  }
  assert.equal(vinculoBatchActionFromChoice(""), null);
  assert.equal(vinculoBatchActionFromChoice("page_type:assunto"), null, "Assunto nunca é tipo de página (P2)");
  assert.equal(vinculoBatchActionFromChoice("reopen"), null);
});

test("declarar em grupo leva nota e destino opcionais, iguais para o lote", () => {
  const declare = VINCULO_BATCH_CHOICE_GROUPS[0].options[0].value;
  assert.equal(isSubjectDeclareChoice(declare), true);
  assert.equal(isSubjectDeclareChoice(VINCULO_BATCH_CHOICE_GROUPS[0].options[1].value), false);
  assert.deepEqual(vinculoBatchActionFromChoice(declare), { kind: "subject_declare", note: null, destinationUrl: null });
  assert.deepEqual(vinculoBatchActionFromChoice(declare, { note: "  ", destinationUrl: "  " }), { kind: "subject_declare", note: null, destinationUrl: null });
  assert.deepEqual(
    vinculoBatchActionFromChoice(declare, { note: "Serviço para donos de clínica", destinationUrl: ` ${SITE}/seo-para-clinicas ` }),
    { kind: "subject_declare", note: "Serviço para donos de clínica", destinationUrl: `${SITE}/seo-para-clinicas` },
  );
  assert.deepEqual(vinculoBatchActionFromChoice("post:locked"), { kind: "post", policy: "locked" });
  assert.deepEqual(vinculoBatchActionFromChoice("post:reviewable"), { kind: "post", policy: "reviewable" });
  assert.deepEqual(vinculoBatchActionFromChoice("page_type:silo"), { kind: "page_type", pageType: "silo" });
});

test("a confirmação diz quantas aprovadas vão para Em revisão, e o que é pulado", async () => {
  const already = setKeywordSubject({ nicho: "Clínicas" }, { note: "Já declarada", actorId: ACTOR, changedAt: AT, origin: "review" });
  assert.ok(already.ok);
  const plan = planVinculoBatch({
    keywords: [await approvedRow(1), await approvedRow(2), row(3), row(4, { analise_semantica: already.semantic })],
    brandId: BRAND,
    action: { kind: "subject_declare" },
    actorId: ACTOR,
    changedAt: AT,
    brandSiteUrl: SITE,
  });
  assert.ok(plan.ok);
  if (!plan.ok) return;
  const text = describeVinculoBatchConfirmation(plan);
  assert.equal(text.summary, "Declarar Assunto: 3 keywords serão gravadas.");
  assert.equal(text.warning, "2 aprovadas desta seleção vão para Em revisão.");
  assert.ok(text.details.some(detail => detail.startsWith("1 já é Assunto e fica como está")), text.details.join(" / "));
  assert.equal(describeVinculoBatchResult(plan, 3), "Declarar Assunto: 3 keywords gravadas e conferidas. 1 foi pulada.");

  // Sem aprovadas, não há aviso.
  const fresh = planVinculoBatch({ keywords: [row(5)], brandId: BRAND, action: { kind: "page_type", pageType: "landing_page" }, actorId: ACTOR, changedAt: AT });
  assert.ok(fresh.ok);
  if (!fresh.ok) return;
  assert.equal(describeVinculoBatchConfirmation(fresh).warning, null);
  assert.equal(describeVinculoBatchConfirmation(fresh).summary, "Tipo de página: Landing page: 1 keyword será gravada.");
});

test("retirar o Assunto de aprovadas em grupo repete a consequência da F1.5 na confirmação", async () => {
  const declaredRow = async (n: number) => {
    const declared = setKeywordSubject({ nicho: "Clínicas" }, { note: "Serviço", actorId: ACTOR, changedAt: AT, origin: "review" });
    assert.ok(declared.ok);
    return approvedRow(n, declared.semantic);
  };
  const plan = planVinculoBatch({
    keywords: [await declaredRow(1), await declaredRow(2)],
    brandId: BRAND,
    action: { kind: "subject_withdraw" },
    actorId: ACTOR,
    changedAt: AT,
  });
  assert.ok(plan.ok);
  if (!plan.ok) return;
  assert.equal(plan.counts.approvedToReview, 2);
  const text = describeVinculoBatchConfirmation(plan);
  assert.equal(text.warning, "2 aprovadas desta seleção vão para Em revisão.");
  assert.ok(text.details.includes(SUBJECT_WITHDRAW_APPROVED_BATCH_WARNING_MANY), text.details.join(" / "));

  // Declarar não repete o aviso de retirada.
  const declare = planVinculoBatch({ keywords: [await approvedRow(3)], brandId: BRAND, action: { kind: "subject_declare" }, actorId: ACTOR, changedAt: AT });
  assert.ok(declare.ok);
  if (!declare.ok) return;
  assert.ok(!describeVinculoBatchConfirmation(declare).details.some(detail => detail.includes("Sem a declaração")));
});

test("posto em não publicadas: a confirmação conta as puladas e não grava nada", () => {
  const plan = planVinculoBatch({ keywords: [row(1), row(2)], brandId: BRAND, action: { kind: "post", policy: "locked" }, actorId: ACTOR, changedAt: AT });
  assert.ok(plan.ok);
  if (!plan.ok) return;
  const text = describeVinculoBatchConfirmation(plan);
  assert.equal(plan.counts.updates, 0);
  assert.equal(text.summary, "Posto: Travado ao slug: nenhuma keyword da seleção muda.");
  assert.deepEqual(text.details, ["2 não publicadas foram puladas: o posto só vale para publicadas."]);
});

test("na prévia, 'fora do catálogo' não aparece antes de consultar o catálogo; sem site cadastrado aparece", () => {
  const withSite = planVinculoBatch({
    keywords: [row(1)], brandId: BRAND, actorId: ACTOR, changedAt: AT, brandSiteUrl: SITE,
    action: { kind: "subject_declare", destinationUrl: `${SITE}/landing-seo` },
  });
  assert.ok(withSite.ok);
  if (!withSite.ok) return;
  assert.equal(withSite.destinationNotice, SUBJECT_DESTINATION_OUT_OF_CATALOG_NOTICE);
  assert.ok(!describeVinculoBatchConfirmation(withSite, { includeCatalogNotice: false }).details.includes(SUBJECT_DESTINATION_OUT_OF_CATALOG_NOTICE));
  assert.ok(describeVinculoBatchConfirmation(withSite).details.includes(SUBJECT_DESTINATION_OUT_OF_CATALOG_NOTICE));

  const noSite = planVinculoBatch({
    keywords: [row(1)], brandId: BRAND, actorId: ACTOR, changedAt: AT, brandSiteUrl: null,
    action: { kind: "subject_declare", destinationUrl: `${SITE}/landing-seo` },
  });
  assert.ok(noSite.ok);
  if (!noSite.ok) return;
  assert.ok(describeVinculoBatchConfirmation(noSite, { includeCatalogNotice: false }).details.includes(SUBJECT_DESTINATION_NO_BRAND_SITE_NOTICE));
});

test("readback estreito: confere a declaração mesmo com as chaves na ordem do JSONB", () => {
  const plan = planVinculoBatch({
    keywords: [row(1)], brandId: BRAND, actorId: ACTOR, changedAt: AT, brandSiteUrl: SITE,
    destinationCatalog: { pageType: "service", title: "SEO para clínicas" },
    action: { kind: "subject_declare", note: "Serviço para donos de clínica", destinationUrl: `${SITE}/seo-para-clinicas` },
  });
  assert.ok(plan.ok);
  if (!plan.ok) return;
  const [update] = plan.updates;
  const stored = {
    id: update.id,
    brand_id: BRAND,
    keyword_subject: jsonbOrder(update.semantic.keyword_subject),
    keyword_page_type: null,
    primary_keyword_policy: null,
  };
  assert.notEqual(JSON.stringify(stored.keyword_subject), JSON.stringify(update.semantic.keyword_subject), "o JSONB devolve outra ordem");
  // O núcleo compara sem depender da ordem das chaves; a porta da tela delega.
  assert.equal(vinculoBatchReadbackMatches(update, stored), true);
  assert.equal(vinculoReadbackConfirmed(update, stored), true);

  // Mas continua recusando o que de fato diverge.
  assert.equal(vinculoReadbackConfirmed(update, { ...stored, brand_id: "4a737e74-e35d-4a49-8284-87b3f964e495" }), false, "outra marca");
  assert.equal(vinculoReadbackConfirmed(update, { ...stored, keyword_subject: { ...(stored.keyword_subject as object), note: "outra" } }), false, "outra nota");
  assert.equal(vinculoReadbackConfirmed(update, { ...stored, id: uuid(9) }), false, "outra linha");
  assert.equal(vinculoReadbackConfirmed(update, null), false, "sem linha");

  // Retirar: keyword_subject null volta null.
  const withdrawn = withdrawKeywordSubject(update.semantic, { actorId: ACTOR, changedAt: AT, origin: "batch" });
  assert.ok(withdrawn.ok);
  const withdrawUpdate = { ...update, semantic: withdrawn.semantic };
  assert.equal(vinculoReadbackConfirmed(withdrawUpdate, { id: update.id, brand_id: BRAND, keyword_subject: null, keyword_page_type: null, primary_keyword_policy: null }), true);
});

test("Lógica automática: só as declaradas que ainda não têm a Lógica exigida pela aprovação", () => {
  const withLogic: Record<string, unknown> = { dna_origem: "logico_deterministico", intencao_principal: INTENT, nicho: "Clínicas", funnel: "BOFU" };
  withLogic.logical_output_contract = buildLogicalOutputContract({ semantic: withLogic, intent: INTENT, niche: "Clínicas", funnel: "BOFU" });
  const declaredWithLogic = setKeywordSubject(withLogic, { actorId: ACTOR, changedAt: AT, origin: "batch" });
  const declaredWithout = setKeywordSubject({ nicho: "Clínicas" }, { actorId: ACTOR, changedAt: AT, origin: "batch" });
  assert.ok(declaredWithLogic.ok && declaredWithout.ok);
  const items = [
    { id: "a", intent: INTENT, analise_semantica: declaredWithLogic.semantic },
    { id: "b", intent: null, analise_semantica: declaredWithout.semantic },
    { id: "c", intent: null, analise_semantica: null },
  ];
  assert.deepEqual(keywordsWithoutLogic(items).map(item => item.id), ["b", "c"]);
});

test("a declaração vai para a cópia de uma revisão aberta, sem levar o resto", () => {
  const declared = setKeywordSubject({ nicho: "Clínicas", human_review: { status: "draft" } }, { note: "Nota", actorId: ACTOR, changedAt: AT, origin: "review" });
  assert.ok(declared.ok);
  const keys = pickKeywordSubjectKeys(declared.semantic);
  assert.deepEqual(Object.keys(keys).sort(), ["keyword_subject", "keyword_subject_actor", "keyword_subject_at", "keyword_subject_history", "keyword_subject_origin"]);
  assert.equal("nicho" in keys, false);
  assert.deepEqual(pickKeywordSubjectKeys(null), {});
});

test("F1.5: aviso antes de confirmar, só em aprovada", () => {
  assert.equal(subjectReviewWarning({ approved: true, currentlyDeclared: true, nextDeclared: false }), SUBJECT_WITHDRAW_APPROVED_WARNING);
  assert.match(SUBJECT_WITHDRAW_APPROVED_WARNING, /^Esta keyword foi aprovada como Assunto\. Sem a declaração, aprovar exige Volume, Resultados e KGR, e o Arquiteto seguirá vendo o Assunto até lá\.$/);
  assert.equal(subjectReviewWarning({ approved: true, currentlyDeclared: false, nextDeclared: true }), SUBJECT_DECLARE_APPROVED_WARNING);
  assert.equal(subjectReviewWarning({ approved: true, currentlyDeclared: true, nextDeclared: true }), SUBJECT_DECLARE_APPROVED_WARNING, "trocar nota numa aprovada também muda o pacote");
  assert.match(SUBJECT_DECLARE_APPROVED_WARNING, /Em revisão/);
  assert.equal(subjectReviewWarning({ approved: false, currentlyDeclared: true, nextDeclared: false }), null);
  assert.equal(subjectReviewWarning({ approved: false, currentlyDeclared: false, nextDeclared: true }), null);
});
