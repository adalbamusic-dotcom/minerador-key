import assert from "node:assert/strict";
import test from "node:test";

import { applyApproval, approvedPackageDiverged } from "../lib/minerador/approved-package.ts";
import { setKeywordSubject, resolveKeywordSubject } from "../lib/minerador/keyword-subject.ts";
import { resolveKeywordVinculo } from "../lib/minerador/keyword-vinculo.ts";
import {
  VINCULO_BATCH_READBACK_COLUMNS,
  planVinculoBatch,
  vinculoBatchReadbackMatches,
  type VinculoBatchKeyword,
  type VinculoBatchUpdate,
} from "../lib/minerador/vinculo-batch.ts";

/**
 * VÍNCULO EM GRUPO — plano puro (SDD 2026-09-24, F1.6 e F1.10). Nada é
 * gravado aqui: o plano diz o que gravar, o que pular e quantas aprovadas vão
 * para Em revisão.
 */

const BRAND = "09762023-d0d4-4c24-b34e-d0fdfd43f891";
const OTHER_BRAND = "4a737e74-e35d-4a49-8284-87b3f964e495";
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
  const base = row(n, { status: "aprovado", analise_semantica: semantic });
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

function packageOf(keyword: VinculoBatchKeyword, semantic: Record<string, unknown>) {
  return {
    keywordId: keyword.id, brandId: BRAND, keyword: keyword.keyword, intent: keyword.intent, volumeSearch: keyword.volume_search,
    resultsAllintitle: keyword.results_allintitle, kgrScore: keyword.kgr_score, listaId: keyword.lista_id, semantic,
  };
}

test("declarar em grupo: aprovadas que vão para Em revisão são contadas e a confirmação diz o número", async () => {
  const approvedA = await approvedRow(1);
  const approvedB = await approvedRow(2);
  const fresh = row(3);
  const plan = planVinculoBatch({
    keywords: [approvedA, approvedB, fresh],
    brandId: BRAND,
    action: { kind: "subject_declare" },
    actorId: ACTOR,
    changedAt: AT,
    brandSiteUrl: SITE,
  });
  assert.equal(plan.ok, true);
  if (!plan.ok) return;
  assert.equal(plan.counts.updates, 3);
  assert.equal(plan.counts.approvedToReview, 2);
  assert.equal(plan.demotionWarning, "2 aprovadas desta seleção vão para Em revisão.");
  assert.equal(plan.actionLabel, "Assunto: Declarado", "o rótulo do select do Assunto, como Posto e Potencial");
  for (const update of plan.updates) {
    assert.equal(update.brandId, BRAND);
    const subject = resolveKeywordSubject(update.semantic);
    assert.equal(subject.declared, true);
    assert.equal(subject.note, null, "em branco, o grupo declara sem nota");
    assert.equal(subject.origin, "batch");
    assert.equal(subject.actorId, ACTOR);
    assert.equal(resolveKeywordVinculo({ status: "bruto", semantic: update.semantic }).subjectLabel, "Assunto sem nota");
  }
  // A contagem bate com a assinatura real do pacote.
  for (const keyword of [approvedA, approvedB]) {
    const update: VinculoBatchUpdate | undefined = plan.updates.find(entry => entry.id === keyword.id);
    assert.ok(update);
    assert.equal(update.demotesApproval, true);
    assert.equal(approvedPackageDiverged(packageOf(keyword, update.semantic)), true);
  }
  assert.equal(plan.updates.find(entry => entry.id === fresh.id)?.demotesApproval, false);
});

test("sem aprovadas na seleção, não há aviso de rebaixamento", () => {
  const plan = planVinculoBatch({ keywords: [row(1), row(2)], brandId: BRAND, action: { kind: "page_type", pageType: "silo" }, actorId: ACTOR, changedAt: AT });
  assert.ok(plan.ok);
  assert.equal(plan.ok && plan.demotionWarning, null);
  assert.equal(plan.ok && plan.counts.approvedToReview, 0);
  const one = planVinculoBatch({ keywords: [row(1)], brandId: BRAND, action: { kind: "page_type", pageType: "silo" }, actorId: ACTOR, changedAt: AT });
  assert.equal(one.ok && one.actionLabel, "Tipo de página: Silo");
});

test("nota e destino iguais para o lote, conferidos uma vez; destino recusado não planeja nada", () => {
  const withDestination = planVinculoBatch({
    keywords: [row(1), row(2)],
    brandId: BRAND,
    action: { kind: "subject_declare", note: "Para donos de clínica", destinationUrl: `${SITE}/seo-para-clinicas` },
    actorId: ACTOR,
    changedAt: AT,
    brandSiteUrl: SITE,
    destinationCatalog: { pageType: "service", title: "SEO para clínicas" },
  });
  assert.ok(withDestination.ok);
  if (!withDestination.ok) return;
  for (const update of withDestination.updates) {
    const subject = resolveKeywordSubject(update.semantic);
    assert.equal(subject.note, "Para donos de clínica");
    assert.equal(subject.destinationUrl, `${SITE}/seo-para-clinicas`);
    assert.deepEqual(subject.destinationCheck, { hostMatchesBrand: true, catalogPageType: "service", catalogTitle: "SEO para clínicas", checkedAt: AT });
  }

  const foreign = planVinculoBatch({
    keywords: [row(1), row(2)], brandId: BRAND, actorId: ACTOR, changedAt: AT, brandSiteUrl: SITE,
    action: { kind: "subject_declare", destinationUrl: "https://concorrente.com.br/seo" },
  });
  assert.equal(foreign.ok, false);
  assert.equal(!foreign.ok && foreign.code, "OUTSIDE_BRAND_SITE");

  const longNote = planVinculoBatch({
    keywords: [row(1)], brandId: BRAND, actorId: ACTOR, changedAt: AT,
    action: { kind: "subject_declare", note: "x".repeat(281) },
  });
  assert.equal(!longNote.ok && longNote.code, "NOTE_TOO_LONG");

  const noSite = planVinculoBatch({
    keywords: [row(1)], brandId: BRAND, actorId: ACTOR, changedAt: AT, brandSiteUrl: null,
    action: { kind: "subject_declare", destinationUrl: `${SITE}/seo` },
  });
  assert.ok(noSite.ok);
  assert.match(noSite.ok ? noSite.destinationNotice || "" : "", /não tem site cadastrado/);
  assert.equal(noSite.ok && resolveKeywordSubject(noSite.updates[0].semantic).destinationUrl, null);
});

test("declarar numa keyword que já é Assunto não troca a nota dela; retirar sem declaração é pulado", () => {
  const declared = setKeywordSubject({}, { note: "Nota escolhida na Revisão", actorId: ACTOR, changedAt: AT, origin: "review" });
  assert.ok(declared.ok);
  const already = row(1, { analise_semantica: declared.semantic });
  const plan = planVinculoBatch({ keywords: [already, row(2)], brandId: BRAND, action: { kind: "subject_declare", note: "Outra nota" }, actorId: ACTOR, changedAt: AT });
  assert.ok(plan.ok);
  if (!plan.ok) return;
  assert.deepEqual(plan.skipped, [{ id: already.id, keyword: already.keyword, reason: "already_declared" }]);
  assert.equal(plan.counts.already_declared, 1);
  assert.deepEqual(plan.updates.map(update => update.id), [uuid(2)]);

  const withdraw = planVinculoBatch({ keywords: [already, row(2)], brandId: BRAND, action: { kind: "subject_withdraw" }, actorId: ACTOR, changedAt: AT });
  assert.ok(withdraw.ok);
  if (!withdraw.ok) return;
  assert.deepEqual(withdraw.updates.map(update => update.id), [already.id]);
  assert.equal(withdraw.updates[0].semantic.keyword_subject, null);
  assert.deepEqual(withdraw.skipped.map(entry => entry.reason), ["unchanged"]);
  assert.equal(withdraw.actionLabel, "Assunto: Não");
});

test("posto só em publicadas: as demais são puladas e contadas", () => {
  const published = row(1, { analise_semantica: { ...PUBLISHED_ORIGIN } });
  const plan = planVinculoBatch({ keywords: [published, row(2), row(3)], brandId: BRAND, action: { kind: "post", policy: "reviewable" }, actorId: ACTOR, changedAt: AT });
  assert.ok(plan.ok);
  if (!plan.ok) return;
  assert.deepEqual(plan.updates.map(update => update.id), [published.id]);
  assert.equal(plan.updates[0].semantic.primary_keyword_policy, "reviewable");
  assert.equal(plan.updates[0].semantic.primary_keyword_policy_actor, ACTOR);
  assert.equal(plan.counts.not_published, 2);
  assert.equal(plan.actionLabel, "Posto: Livre");

  // Publicada já travada (padrão): travar de novo não escreve.
  const locked = planVinculoBatch({ keywords: [published], brandId: BRAND, action: { kind: "post", policy: "locked" }, actorId: ACTOR, changedAt: AT });
  assert.ok(locked.ok);
  assert.equal(locked.ok && locked.counts.updates, 0);
  assert.equal(locked.ok && locked.counts.unchanged, 1);
});

test("tipo de página: só grava o que muda, com o ator da sessão", () => {
  const silo = row(1, { analise_semantica: { keyword_page_type: "silo" } });
  const plan = planVinculoBatch({ keywords: [silo, row(2)], brandId: BRAND, action: { kind: "page_type", pageType: "silo" }, actorId: ACTOR, changedAt: AT });
  assert.ok(plan.ok);
  if (!plan.ok) return;
  assert.deepEqual(plan.updates.map(update => update.id), [uuid(2)]);
  assert.equal(plan.updates[0].semantic.keyword_page_type, "silo");
  assert.equal(plan.updates[0].semantic.keyword_page_type_actor, ACTOR);
  assert.equal(plan.counts.unchanged, 1);
});

test("isolamento: keyword de outra marca é pulada, nunca planejada", () => {
  const plan = planVinculoBatch({
    keywords: [row(1), row(2, { brand_id: OTHER_BRAND }), row(3, { brand_id: null })],
    brandId: BRAND,
    action: { kind: "subject_declare" },
    actorId: ACTOR,
    changedAt: AT,
  });
  assert.ok(plan.ok);
  if (!plan.ok) return;
  assert.deepEqual(plan.updates.map(update => update.id), [uuid(1)]);
  assert.deepEqual(plan.skipped.map(entry => [entry.id, entry.reason]), [[uuid(2), "other_brand"], [uuid(3), "other_brand"]]);
  for (const update of plan.updates) assert.equal(update.brandId, BRAND);
});

test("ator e marca obrigatórios: e-mail, local-user e marca vazia não planejam nada", () => {
  for (const actorId of ["dono@clinica.com.br", "local-user", "", null, undefined]) {
    const plan = planVinculoBatch({ keywords: [row(1)], brandId: BRAND, action: { kind: "subject_declare" }, actorId, changedAt: AT });
    assert.equal(!plan.ok && plan.code, "ACTOR_REQUIRED", String(actorId));
  }
  const noBrand = planVinculoBatch({ keywords: [row(1)], brandId: "", action: { kind: "subject_declare" }, actorId: ACTOR, changedAt: AT });
  assert.equal(!noBrand.ok && noBrand.code, "BRAND_REQUIRED");
  const badType = planVinculoBatch({ keywords: [row(1)], brandId: BRAND, action: { kind: "page_type", pageType: "assunto" as never }, actorId: ACTOR, changedAt: AT });
  assert.equal(!badType.ok && badType.code, "INVALID_ACTION");
});

test("readback estreito: colunas das três chaves e conferência por marca e valor", () => {
  // 2026-09-24 (pedido do dono): o Potencial de página ganhou o peso
  // potencial/declarado, gravado em keyword_page_type_stance; o readback
  // estreito passa a conferir essa chave também.
  assert.equal(VINCULO_BATCH_READBACK_COLUMNS, "id,brand_id,analise_semantica->keyword_subject,analise_semantica->keyword_page_type,analise_semantica->keyword_page_type_stance,analise_semantica->primary_keyword_policy");
  assert.doesNotMatch(VINCULO_BATCH_READBACK_COLUMNS, /\*/);
  const plan = planVinculoBatch({ keywords: [row(1, { analise_semantica: { keyword_page_type: "silo" } })], brandId: BRAND, action: { kind: "subject_declare", note: "n" }, actorId: ACTOR, changedAt: AT });
  assert.ok(plan.ok);
  if (!plan.ok) return;
  const update = plan.updates[0];
  const good = { id: update.id, brand_id: BRAND, keyword_subject: update.semantic.keyword_subject, keyword_page_type: "silo", primary_keyword_policy: null };
  assert.equal(vinculoBatchReadbackMatches(update, good), true);
  assert.equal(vinculoBatchReadbackMatches(update, { ...good, brand_id: OTHER_BRAND }), false);
  assert.equal(vinculoBatchReadbackMatches(update, { ...good, keyword_subject: null }), false);
  assert.equal(vinculoBatchReadbackMatches(update, { ...good, keyword_page_type: "article" }), false);
  assert.equal(vinculoBatchReadbackMatches(update, null), false);
});

test("readback estreito: a ordem das chaves que o JSONB devolve não vira divergência", () => {
  const plan = planVinculoBatch({
    keywords: [row(1)], brandId: BRAND, action: { kind: "subject_declare", note: "Serviço para donos de clínica" }, actorId: ACTOR, changedAt: AT,
  });
  assert.ok(plan.ok);
  if (!plan.ok) return;
  const update = plan.updates[0];
  const written = update.semantic.keyword_subject as Record<string, unknown>;
  // O JSONB ordena as chaves por tamanho e depois por byte: note, declared, destinationUrl, destinationCheck.
  const jsonbOrdered = Object.fromEntries(
    Object.keys(written)
      .sort((a, b) => a.length - b.length || (a < b ? -1 : a > b ? 1 : 0))
      .map(key => [key, written[key]]),
  );
  assert.notEqual(JSON.stringify(jsonbOrdered), JSON.stringify(written));
  const stored = { id: update.id, brand_id: BRAND, keyword_subject: jsonbOrdered, keyword_page_type: null, primary_keyword_policy: null };
  assert.equal(vinculoBatchReadbackMatches(update, stored), true);
  assert.equal(vinculoBatchReadbackMatches(update, { ...stored, keyword_subject: { ...jsonbOrdered, note: "outra" } }), false);
});
