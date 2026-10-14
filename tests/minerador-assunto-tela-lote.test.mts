import assert from "node:assert/strict";
import test from "node:test";

import { applyApproval } from "../lib/minerador/approved-package.ts";
import { buildLogicalOutputContract } from "../lib/minerador/logical-processor.ts";
import { setKeywordSubject } from "../lib/minerador/keyword-subject.ts";
import { planVinculoBatch, vinculoBatchReadbackMatches, type VinculoBatchKeyword } from "../lib/minerador/vinculo-batch.ts";
import {
  VINCULO_BATCH_CHOICE_GROUPS,
  describeVinculoBatchConfirmation,
  describeVinculoBatchResult,
  keywordsWithoutLogic,
  pickKeywordSubjectKeys,
  vinculoBatchActionFromChoice,
  vinculoReadbackConfirmed,
} from "../lib/minerador/vinculo-screen.ts";

/**
 * TELA DO PROCESSADOR · VÍNCULO EM GRUPO (SDD 2026-09-24, F1.4 a F1.7b;
 * revisto em 2026-10-13: o Assunto saiu do Vínculo). O que a tela diz e
 * confere sobre o plano puro. Fixtures puras, sem rede nem provider;
 * REAL_PROVIDER_CALLS_IN_TESTS = 0.
 */

const BRAND = "09762023-d0d4-4c24-b34e-d0fdfd43f891";
const ACTOR = "3f0c9a52-8b1e-4c7d-9f2a-5e6b7c8d9e0f";
const AT = "2026-09-24T12:00:00+00:00";
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

test("2026-10-13: o select Vínculo tem SÓ Posto e Potencial — nada de Assunto — e nenhuma das escolhas que ficam fora (Q5)", () => {
  assert.deepEqual(VINCULO_BATCH_CHOICE_GROUPS.map(group => group.key), ["post", "page_type"]);
  assert.deepEqual(VINCULO_BATCH_CHOICE_GROUPS.map(group => group.label), ["Posto de principal", "Potencial de página"]);
  const [post, pageType] = VINCULO_BATCH_CHOICE_GROUPS;
  assert.equal(pageType.options.length, 8, "os 4 tipos × potencial/declarado, enum intacto");
  // 2026-10-13 · "Automática" é a trava do cadastro voltando ao volume (só keyword do plano não publicada).
  assert.deepEqual(post.options.map(option => option.label), ["Travado ao slug", "Livre", "Automática (pelo volume)"]);

  const everything = VINCULO_BATCH_CHOICE_GROUPS.flatMap(group => [group.title, ...group.options.map(option => `${option.value} ${option.label}`)]).join(" | ");
  assert.doesNotMatch(everything, /Assunto|subject/i, "o Assunto saiu do Vínculo");
  assert.doesNotMatch(everything, /reabrir|revisar novamente|reopen/i, "reabrir revisão fica fora");
  assert.doesNotMatch(everything, /conferir|link|check/i, "conferir por link fica fora");
  assert.doesNotMatch(everything, /confirmar publica|desvincular|unlink|confirm/i, "confirmar publicada / desvincular fica fora");
  assert.doesNotMatch(everything, /cancel/i, "cancelar não se aplica a grupo");

  // Toda escolha vira uma ação do plano; valor desconhecido (inclusive o antigo do Assunto) não vira nada.
  for (const option of VINCULO_BATCH_CHOICE_GROUPS.flatMap(group => group.options)) {
    assert.ok(vinculoBatchActionFromChoice(option.value), option.value);
  }
  assert.equal(vinculoBatchActionFromChoice(""), null);
  assert.equal(vinculoBatchActionFromChoice("subject:declare"), null, "o select antigo do Assunto não vira ação");
  assert.equal(vinculoBatchActionFromChoice("subject:withdraw"), null);
  assert.equal(vinculoBatchActionFromChoice("page_type:assunto"), null, "Assunto nunca é tipo de página (P2)");
  assert.equal(vinculoBatchActionFromChoice("reopen"), null);
  assert.deepEqual(vinculoBatchActionFromChoice("post:locked"), { kind: "post", policy: "locked" });
  assert.deepEqual(vinculoBatchActionFromChoice("post:reviewable"), { kind: "post", policy: "reviewable" });
  assert.deepEqual(vinculoBatchActionFromChoice("page_type:silo"), { kind: "page_type", pageType: "silo" });
});

test("a confirmação diz quantas aprovadas vão para Em revisão, e o que é pulado", async () => {
  const plan = planVinculoBatch({
    keywords: [await approvedRow(1), await approvedRow(2), row(3), row(4, { analise_semantica: { keyword_page_type: "silo", keyword_page_type_stance: "declared" } })],
    brandId: BRAND,
    action: { kind: "page_type", pageType: "silo", stance: "declared" },
    actorId: ACTOR,
    changedAt: AT,
  });
  assert.ok(plan.ok);
  if (!plan.ok) return;
  const text = describeVinculoBatchConfirmation(plan);
  assert.equal(text.summary, "Potencial de página: Silo · declarado: 3 keywords serão gravadas.");
  assert.equal(text.warning, "2 aprovadas desta seleção vão para Em revisão.");
  assert.deepEqual(text.details, ["1 já estava assim."]);
  assert.equal(describeVinculoBatchResult(plan, 3), "Potencial de página: Silo · declarado: 3 keywords gravadas e conferidas. 1 foi pulada.");
  assert.doesNotMatch([text.summary, ...text.details].join(" "), /Assunto/, "a confirmação não fala mais de Assunto");

  // Sem aprovadas, não há aviso.
  const fresh = planVinculoBatch({ keywords: [row(5)], brandId: BRAND, action: { kind: "page_type", pageType: "landing_page" }, actorId: ACTOR, changedAt: AT });
  assert.ok(fresh.ok);
  if (!fresh.ok) return;
  assert.equal(describeVinculoBatchConfirmation(fresh).warning, null);
  assert.equal(describeVinculoBatchConfirmation(fresh).summary, "Tipo de página: Landing page: 1 keyword será gravada.");
});

test("posto em não publicadas SEM plano (2026-10-13): travar é recusado por item, com o nome e a frase do cadastro; nada é gravado", () => {
  const plan = planVinculoBatch({ keywords: [row(1), row(2)], brandId: BRAND, action: { kind: "post", policy: "locked" }, actorId: ACTOR, changedAt: AT });
  assert.ok(plan.ok);
  if (!plan.ok) return;
  const text = describeVinculoBatchConfirmation(plan);
  assert.equal(plan.counts.updates, 0);
  assert.equal(plan.counts.planLocks, 0);
  assert.equal(plan.counts.no_plan, 2);
  assert.equal(text.summary, "Posto: Travada: nenhuma keyword da seleção muda.");
  assert.deepEqual(text.details, ['2 recusadas ("keyword 1", "keyword 2"): Para travar, cadastre o artigo em Cadastrar Assuntos.']);
});

test("readback estreito: confere a gravação mesmo com as chaves do Assunto na ordem do JSONB", () => {
  const declared = setKeywordSubject({ nicho: "Clínicas" }, { note: "Serviço para donos de clínica", actorId: ACTOR, changedAt: AT, origin: "import" });
  assert.ok(declared.ok);
  const plan = planVinculoBatch({ keywords: [row(1, { analise_semantica: declared.semantic })], brandId: BRAND, actorId: ACTOR, changedAt: AT, action: { kind: "page_type", pageType: "service_page", stance: "declared" } });
  assert.ok(plan.ok);
  if (!plan.ok) return;
  const [update] = plan.updates;
  const stored = {
    id: update.id,
    brand_id: BRAND,
    keyword_subject: jsonbOrder(update.semantic.keyword_subject),
    keyword_page_type: update.semantic.keyword_page_type,
    keyword_page_type_stance: update.semantic.keyword_page_type_stance,
    primary_keyword_policy: null,
  };
  assert.notEqual(JSON.stringify(stored.keyword_subject), JSON.stringify(update.semantic.keyword_subject), "o JSONB devolve outra ordem");
  assert.equal(vinculoBatchReadbackMatches(update, stored), true);
  assert.equal(vinculoReadbackConfirmed(update, stored), true);
  assert.equal(vinculoReadbackConfirmed(update, { ...stored, brand_id: "4a737e74-e35d-4a49-8284-87b3f964e495" }), false, "outra marca");
  assert.equal(vinculoReadbackConfirmed(update, { ...stored, keyword_subject: { ...(stored.keyword_subject as object), note: "outra" } }), false, "Assunto mexido");
  assert.equal(vinculoReadbackConfirmed(update, { ...stored, id: uuid(9) }), false, "outra linha");
  assert.equal(vinculoReadbackConfirmed(update, null), false, "sem linha");
});

test("Lógica automática: só as cadastradas que ainda não têm a Lógica exigida pela aprovação", () => {
  const withLogic: Record<string, unknown> = { dna_origem: "logico_deterministico", intencao_principal: INTENT, nicho: "Clínicas", funnel: "BOFU" };
  withLogic.logical_output_contract = buildLogicalOutputContract({ semantic: withLogic, intent: INTENT, niche: "Clínicas", funnel: "BOFU" });
  const declaredWithLogic = setKeywordSubject(withLogic, { actorId: ACTOR, changedAt: AT, origin: "import" });
  const declaredWithout = setKeywordSubject({ nicho: "Clínicas" }, { actorId: ACTOR, changedAt: AT, origin: "import" });
  assert.ok(declaredWithLogic.ok && declaredWithout.ok);
  const items = [
    { id: "a", intent: INTENT, analise_semantica: declaredWithLogic.semantic },
    { id: "b", intent: null, analise_semantica: declaredWithout.semantic },
    { id: "c", intent: null, analise_semantica: null },
  ];
  assert.deepEqual(keywordsWithoutLogic(items).map(item => item.id), ["b", "c"]);
});

test("as chaves do Assunto vão para a cópia de uma revisão aberta, sem levar o resto", () => {
  const declared = setKeywordSubject({ nicho: "Clínicas", human_review: { status: "draft" } }, { note: "Nota", actorId: ACTOR, changedAt: AT, origin: "import" });
  assert.ok(declared.ok);
  const keys = pickKeywordSubjectKeys(declared.semantic);
  assert.deepEqual(Object.keys(keys).sort(), ["keyword_subject", "keyword_subject_actor", "keyword_subject_at", "keyword_subject_history", "keyword_subject_origin"]);
  assert.equal("nicho" in keys, false);
  assert.deepEqual(pickKeywordSubjectKeys(null), {});
});
