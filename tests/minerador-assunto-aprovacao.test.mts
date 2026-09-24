import assert from "node:assert/strict";
import test from "node:test";

import {
  SERVER_APPROVAL_GATE_SINCE,
  SUBJECT_APPROVAL_REASON,
  applyApproval,
  resolveApprovalReadiness,
  resolveHandoffApprovalGate,
} from "../lib/minerador/approved-package.ts";
import { evaluateMineradorArquitetoHandoff, evaluateMineradorArquitetoHandoffBatch } from "../lib/minerador/arquiteto-handoff-gates.ts";
import { buildLogicalOutputContract } from "../lib/minerador/logical-processor.ts";
import { setKeywordSubject } from "../lib/minerador/keyword-subject.ts";
import { keywordDnaFromRow } from "../lib/minerador/keyword-dna.ts";

/**
 * APROVAÇÃO COM ASSUNTO E TRAVA NO ENVIO (SDD 2026-09-24, D2, F1.7, P10, Q9).
 * Fixtures puras; REAL_PROVIDER_CALLS_IN_TESTS = 0.
 */

const ACTOR = "3f0c9a52-8b1e-4c7d-9f2a-5e6b7c8d9e0f";
const BRAND = "09762023-d0d4-4c24-b34e-d0fdfd43f891";
const INTENT = "Comercial investigativa";
const BEFORE = "2026-09-20T15:00:00+00:00";
const AFTER = "2026-09-24T15:00:00+00:00";

function comLogica(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  const semantic: Record<string, unknown> = {
    dna_origem: "logico_deterministico",
    intencao_principal: INTENT,
    nicho: "Marketing para clínicas",
    funnel: "BOFU",
    ...overrides,
  };
  semantic.logical_output_contract = buildLogicalOutputContract({ semantic, intent: INTENT, niche: "Marketing para clínicas", funnel: "BOFU" });
  return semantic;
}

function medida(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return comLogica({
    volume_measurement: { provider: "google_ads", averageMonthlySearches: 90, measuredAt: "2026-09-18T10:00:00+00:00" },
    allintitle_measurement: { provider: "dataforseo", status: "success", resultsAllintitle: 336, measuredAt: "2026-09-18T10:01:00+00:00" },
    kgr_aplicabilidade: "applicable",
    ...overrides,
  });
}

function declarar(semantic: Record<string, unknown>, note: string | null = "Serviço de SEO para donos de clínica"): Record<string, unknown> {
  const result = setKeywordSubject(semantic, { note, actorId: ACTOR, changedAt: AT_DECL, origin: "review" });
  assert.ok(result.ok);
  return result.semantic;
}
const AT_DECL = "2026-09-24T11:00:00+00:00";

async function aprovada(semantic: Record<string, unknown>, approvedAt: string, extra: { volume?: number | null; results?: number | null; approvedBy?: string } = {}) {
  const row = {
    id: "00000000-0000-4000-8000-000000000001",
    keyword: "seo para clínicas",
    brand_id: BRAND,
    status: "aprovado",
    intent: INTENT,
    volume_search: extra.volume ?? null,
    results_allintitle: extra.results ?? null,
    kgr_score: null,
    lista_id: null,
  };
  const withRecord = await applyApproval({
    keywordId: row.id,
    brandId: BRAND,
    keyword: row.keyword,
    intent: INTENT,
    volumeSearch: row.volume_search,
    resultsAllintitle: row.results_allintitle,
    kgrScore: null,
    listaId: null,
    semantic,
    approvedAt,
    approvedBy: extra.approvedBy ?? ACTOR,
  });
  return { ...row, analise_semantica: withRecord };
}

/* -------------------------------- D2 na tela -------------------------------- */

test("Assunto com Volume null e sem Resultados é aprovável depois da Lógica", () => {
  const readiness = resolveApprovalReadiness({ semantic: declarar(comLogica({ volume_eligibility: "unavailable" })), intent: INTENT, volumeSearch: null, resultsAllintitle: null });
  assert.deepEqual(readiness, { ok: true, missing: [], reason: null });
});

test("Assunto sem Lógica é recusado, e o missing só pode conter logic", () => {
  const readiness = resolveApprovalReadiness({ semantic: declarar({ volume_eligibility: "unavailable" }), volumeSearch: null, resultsAllintitle: null });
  assert.equal(readiness.ok, false);
  assert.deepEqual(readiness.missing, ["logic"]);
  assert.equal(readiness.reason, SUBJECT_APPROVAL_REASON);
  assert.equal(SUBJECT_APPROVAL_REASON, "Assunto declarado: dispensa Volume, Resultados e KGR; a Lógica continua exigida.");
});

test("Assunto com KGR calculável e pendente continua aprovável (D2 dispensa o KGR)", () => {
  const readiness = resolveApprovalReadiness({ semantic: declarar(medida({ kgr_aplicabilidade: "pending" })), intent: INTENT, volumeSearch: 90, resultsAllintitle: 336 });
  assert.equal(readiness.ok, true);
});

test("keyword comum continua exigindo tudo, com o motivo de sempre", () => {
  const sem = resolveApprovalReadiness({ semantic: comLogica(), intent: INTENT, volumeSearch: null, resultsAllintitle: null });
  assert.equal(sem.ok, false);
  assert.deepEqual(sem.missing, ["volume", "results"]);
  assert.match(sem.reason || "", /^Aprovar exige Volume e Resultados\. O Arquiteto recebe o pacote fechado/);
  const nada = resolveApprovalReadiness({ semantic: {}, volumeSearch: null });
  assert.deepEqual(nada.missing, ["logic", "volume", "results"]);
  assert.equal(resolveApprovalReadiness({ semantic: medida(), intent: INTENT, volumeSearch: 90, resultsAllintitle: 336 }).ok, true);
});

test("Assunto retirado volta a exigir Volume, Resultados e KGR", () => {
  const declared = declarar(comLogica());
  const withdrawn = { ...declared, keyword_subject: null };
  const readiness = resolveApprovalReadiness({ semantic: withdrawn, intent: INTENT, volumeSearch: null, resultsAllintitle: null });
  assert.deepEqual(readiness.missing, ["volume", "results"]);
});

/* ---------------------------- trava no envio (Q9) ---------------------------- */

test("a constante de ativação é um instante válido de 2026-09-24", () => {
  assert.equal(SERVER_APPROVAL_GATE_SINCE, "2026-09-24T00:00:00-03:00");
  assert.equal(new Date(SERVER_APPROVAL_GATE_SINCE).toISOString(), "2026-09-24T03:00:00.000Z");
  assert.ok(Date.parse(BEFORE) < Date.parse(SERVER_APPROVAL_GATE_SINCE));
  assert.ok(Date.parse(AFTER) >= Date.parse(SERVER_APPROVAL_GATE_SINCE));
});

test("aprovada depois da ativação, sem processo, é recusada; antes passa com alerta", async () => {
  const after = await aprovada({}, AFTER);
  const gateAfter = resolveHandoffApprovalGate({ semantic: after.analise_semantica, intent: after.intent, volumeSearch: null, resultsAllintitle: null });
  assert.equal(gateAfter.verdict, "refuse");
  assert.equal(gateAfter.scope, "gated");
  assert.match(gateAfter.reason || "", /^Aprovar exige Lógica, Volume e Resultados/);

  const before = await aprovada({}, BEFORE);
  const gateBefore = resolveHandoffApprovalGate({ semantic: before.analise_semantica, intent: before.intent });
  assert.equal(gateBefore.verdict, "alert");
  assert.equal(gateBefore.scope, "before_gate");
  assert.match(gateBefore.reason || "", /^Aprovada antes da trava de envio: passa como antes\./);

  // Exatamente no instante da ativação já vale a trava.
  const edge = await aprovada({}, "2026-09-24T03:00:00+00:00");
  assert.equal(resolveHandoffApprovalGate({ semantic: edge.analise_semantica }).verdict, "refuse");
  // Formato com Z e com +00:00 dão o mesmo veredito.
  const zulu = await aprovada({}, "2026-09-24T15:00:00.000Z");
  assert.equal(resolveHandoffApprovalGate({ semantic: zulu.analise_semantica }).verdict, "refuse");
});

test("sem registro, registro do backfill e já recebida: só alerta", async () => {
  assert.equal(resolveHandoffApprovalGate({ semantic: {} }).scope, "no_record");
  assert.equal(resolveHandoffApprovalGate({ semantic: {} }).verdict, "alert");
  const backfill = await aprovada({}, BEFORE, { approvedBy: "backfill:aprovacao-versionada-2026-09-18" });
  assert.deepEqual(
    [resolveHandoffApprovalGate({ semantic: backfill.analise_semantica }).verdict, resolveHandoffApprovalGate({ semantic: backfill.analise_semantica }).scope],
    ["alert", "backfill"],
  );
  // O prefixo não isenta registro com data igual ou posterior à ativação.
  const forged = await aprovada({}, AFTER, { approvedBy: "backfill:x" });
  assert.deepEqual(
    [resolveHandoffApprovalGate({ semantic: forged.analise_semantica }).verdict, resolveHandoffApprovalGate({ semantic: forged.analise_semantica }).scope],
    ["refuse", "gated"],
  );
  const received = await aprovada({}, AFTER);
  const gate = resolveHandoffApprovalGate({ semantic: received.analise_semantica, alreadyReceived: true });
  assert.equal(gate.verdict, "alert");
  assert.equal(gate.scope, "already_received");
});

test("Assunto com Lógica passa; Assunto sem Lógica depois da ativação é recusado com o motivo da D2", async () => {
  const ok = await aprovada(declarar(comLogica()), AFTER);
  assert.equal(resolveHandoffApprovalGate({ semantic: ok.analise_semantica, intent: INTENT }).verdict, "pass");
  const semLogica = await aprovada(declarar({}), AFTER);
  const gate = resolveHandoffApprovalGate({ semantic: semLogica.analise_semantica, intent: INTENT });
  assert.equal(gate.verdict, "refuse");
  assert.equal(gate.reason, SUBJECT_APPROVAL_REASON);
});

/* -------------------------------- gate da tela ------------------------------- */

test("gate da tela: mesmo veredito da função compartilhada, e alerta não bloqueia", async () => {
  const cases = [
    { name: "depois, sem processo", row: await aprovada({}, AFTER), ok: false, verdict: "refuse" },
    { name: "antes, sem processo", row: await aprovada({}, BEFORE), ok: true, verdict: "alert" },
    { name: "Assunto com Lógica", row: await aprovada(declarar(comLogica()), AFTER), ok: true, verdict: "pass" },
    { name: "comum completa", row: await aprovada(medida(), AFTER, { volume: 90, results: 336 }), ok: true, verdict: "pass" },
  ];
  for (const entry of cases) {
    const gate = evaluateMineradorArquitetoHandoff(entry.row, BRAND, null);
    const shared = resolveHandoffApprovalGate({
      semantic: entry.row.analise_semantica,
      intent: entry.row.intent,
      volumeSearch: entry.row.volume_search,
      resultsAllintitle: entry.row.results_allintitle,
    });
    assert.equal(gate.ok, entry.ok, entry.name);
    assert.equal(gate.approvalGate?.verdict, entry.verdict, entry.name);
    assert.deepEqual(gate.approvalGate, shared, entry.name);
    if (!entry.ok) assert.equal(gate.reason, shared.reason, entry.name);
  }

  // Status e marca continuam decidindo antes da trava.
  const wrongStatus = evaluateMineradorArquitetoHandoff({ ...(await aprovada({}, AFTER)), status: "bruto" }, BRAND, null);
  assert.equal(wrongStatus.approvalGate, null);
  assert.equal(wrongStatus.reason, "O status precisa permitir o envio ao Arquiteto.");
  const wrongBrand = evaluateMineradorArquitetoHandoff(await aprovada({}, AFTER), "outra-marca", null);
  assert.equal(wrongBrand.approvalGate, null);
  assert.equal(wrongBrand.reason, "A keyword não pertence à Brand ativa.");
});

test("gate da tela em lote: recebidas só alertam e os alertas são listados", async () => {
  const blocked = await aprovada({}, AFTER);
  const old = { ...(await aprovada({}, BEFORE)), id: "00000000-0000-4000-8000-000000000002" };
  const batch = evaluateMineradorArquitetoHandoffBatch({ keywords: [blocked, old], brandId: BRAND });
  assert.equal(batch.ok, false);
  assert.deepEqual(batch.blocked.map(entry => entry.keywordId), [blocked.id]);
  assert.deepEqual(batch.approvalAlerts?.map(entry => entry.keywordId), [old.id]);

  const received = evaluateMineradorArquitetoHandoffBatch({ keywords: [blocked, old], brandId: BRAND, alreadyReceivedKeywordIds: new Set([blocked.id]) });
  assert.equal(received.ok, true);
  assert.deepEqual(received.approvalAlerts?.map(entry => entry.approvalGate?.scope), ["already_received", "before_gate"]);

  // Sem alerta, o objeto do lote não ganha a chave nova.
  const clean = evaluateMineradorArquitetoHandoffBatch({ keywords: [await aprovada(medida(), AFTER, { volume: 90, results: 336 })], brandId: BRAND });
  assert.equal(clean.ok, true);
  assert.equal("approvalAlerts" in clean, false);
});

/* --------------------------------- KeywordDNA -------------------------------- */

test("KeywordDNA: bloco subject opcional, só com declaração", () => {
  const base = { id: "kw-1", keyword: "seo para clínicas", brand_id: BRAND, status: "bruto", intent: INTENT, volume_search: null, results_allintitle: null };
  const plain = keywordDnaFromRow({ ...base, analise_semantica: comLogica() });
  assert.equal("subject" in plain, false);

  const declared = keywordDnaFromRow({ ...base, analise_semantica: declarar(comLogica()) });
  assert.deepEqual(declared.subject, {
    declared: true,
    note: "Serviço de SEO para donos de clínica",
    destinationUrl: null,
    declaredBy: ACTOR,
    declaredAt: AT_DECL,
    origin: "review",
  });
  const { subject: _subject, ...rest } = declared;
  assert.deepEqual(rest, keywordDnaFromRow({ ...base, analise_semantica: comLogica() }), "o resto da vista não muda");
});
