import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  applyApproval,
  approvedPackageDiverged,
  carryApprovalAcrossRemeasurement,
  readApprovalRecord,
  resolveApprovalReadiness,
  resolveHandoffApprovalGate,
  VOLUME_IMPORTED_NOT_CONFIRMED_REASON,
  VOLUME_PROCESSED_WITHOUT_AVERAGE_NOTE,
} from "../lib/minerador/approved-package.ts";
import { evaluateMineradorArquitetoHandoff } from "../lib/minerador/arquiteto-handoff-gates.ts";
import {
  buildGoogleAdsEmptyVolumePatch,
  buildGoogleAdsUnavailableVolumePatch,
  buildGoogleAdsVolumeMetricPatch,
  shouldMarkVolumeMeasurementFailed,
  withApprovalCarriedAcrossRemeasurement,
} from "../lib/minerador/google-ads-volume.ts";
import { buildLogicalOutputContract } from "../lib/minerador/logical-processor.ts";
import { resolveMineradorProcessState } from "../lib/minerador/process-state.ts";
import { processorCpcCell, processorVolumeCell, volumeProcessRecorded } from "../lib/minerador/processor-table-cells.ts";
import { deriveProcessorRevalidation, processorVolumeStateLabel, VOLUME_IMPORTED_NOT_CONFIRMED_LABEL } from "../lib/minerador/processor-revalidation.ts";
import {
  classifyVolumeReadback,
  readGoogleAdsEmptyVolumeResponse,
  readGoogleAdsLastEmptyVolumeResponse,
  readVolumeEligibility,
} from "../lib/minerador/volume-eligibility.ts";

/**
 * Volume sem média oficial é processo executado (decisão do dono, 2026-09-25).
 *
 * O Google Ads não tem custo: medir de novo é sempre permitido e atualiza.
 * Resposta sem média não é erro, não apaga número anterior e vale para a
 * aprovação (§61) — o volume continua null (ADR-020).
 * REAL_PROVIDER_CALLS_IN_TESTS = 0.
 */

const INTENT = "Comercial investigativa";
const KEYWORD = "agência de marketing para cosméticos";
const MEASURED_AT = "2026-09-25T13:02:11.000Z";

function semanticBase(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  const semantic: Record<string, unknown> = {
    dna_origem: "logico_deterministico",
    intencao_principal: INTENT,
    nicho: "Marketing",
    funnel: "BOFU",
    allintitle_measurement: { provider: "dataforseo", status: "success", resultsAllintitle: 12, measuredAt: "2026-09-22T10:01:00.000Z" },
    ...overrides,
  };
  semantic.logical_output_contract = buildLogicalOutputContract({ semantic, intent: INTENT, niche: "Marketing", funnel: "BOFU" });
  return semantic;
}

/** O registro que a rota gravou hoje, exatamente como o banco mostrou. */
const DIAGNOSTIC_ELIGIBILITY = {
  status: "unavailable",
  averageMonthlySearches: null,
  measuredAt: MEASURED_AT,
  provider: "google_ads",
  googleAdsRequestId: "gads-req-diagnostico",
  threshold: 120,
};

function diagnosticRow() {
  return {
    id: "dfd6209e-6720-4025-ab69-f5e850624257",
    keyword: KEYWORD,
    brand_id: "61d2e019-f44f-4fa3-af2f-d86b95628ab3",
    status: "bruto",
    intent: INTENT,
    volume_search: null as number | null,
    results_allintitle: 12,
    kgr_score: null as number | null,
    analise_semantica: semanticBase({ volume_eligibility: { ...DIAGNOSTIC_ELIGIBILITY } }),
  };
}

const metric = {
  keyword: KEYWORD, normalizedKeyword: KEYWORD, canonicalKeyword: KEYWORD, closeVariants: [], normalizedCloseVariants: [], matchedRequestedKeywords: [KEYWORD],
  averageMonthlySearches: 90 as number | null, monthlySearchVolumes: [{ year: 2026, month: "AUGUST", searches: 90 }], competition: "LOW", competitionIndex: 10,
  lowTopOfPageBidMicros: "1000000", highTopOfPageBidMicros: "3000000", averageCpcMicros: "1500000", currencyCode: "BRL", timeZone: "America/Sao_Paulo",
  targeting: { language: "languageConstants/1014", geoTargetConstants: ["geoTargetConstants/2076"], keywordPlanNetwork: "GOOGLE_SEARCH" as const, includeAdultKeywords: false },
  customerId: "1234567890", provider: "google_ads" as const, providerVersion: "v25" as const, measuredAt: "2026-09-20T10:00:00.000Z",
};

function measurement(overrides: Partial<typeof metric> & { googleAdsRequestId?: string | null } = {}) {
  return { ...metric, keywordId: "kw-1", operationRequestId: "00000000-0000-4000-8000-000000000001", googleAdsRequestId: "req-1", ...overrides };
}

type Row = ReturnType<typeof diagnosticRow>;

function packageInput(row: Row) {
  return {
    keywordId: row.id,
    brandId: row.brand_id,
    keyword: row.keyword,
    intent: row.intent,
    volumeSearch: row.volume_search,
    resultsAllintitle: row.results_allintitle,
    kgrScore: row.kgr_score,
    semantic: row.analise_semantica,
  };
}

function volumeKeyword(row: Row) {
  return { id: row.id, brandId: row.brand_id, keyword: row.keyword, status: row.status, intent: row.intent, volume_search: row.volume_search, results_allintitle: row.results_allintitle, kgr_score: row.kgr_score, analise_semantica: row.analise_semantica };
}

function applyPatch(row: Row, patch: { volume_search?: number; kgr_score?: number | null; analise_semantica?: Record<string, unknown> }): Row {
  return {
    ...row,
    volume_search: patch.volume_search !== undefined ? patch.volume_search : row.volume_search,
    kgr_score: patch.kgr_score !== undefined ? patch.kgr_score : row.kgr_score,
    analise_semantica: patch.analise_semantica || row.analise_semantica,
  };
}

async function approve(row: Row, approvedAt = "2026-09-25T15:00:00.000Z"): Promise<Row> {
  const semantic = await applyApproval({ ...packageInput(row), approvedAt, approvedBy: "humano-1" });
  return { ...row, status: "aprovado", analise_semantica: semantic };
}

/* ------------------------- o caso exato do diagnóstico ------------------------- */

test("diagnóstico: resposta sem média gravada vale como Volume processado e a keyword é aprovável", () => {
  const row = diagnosticRow();
  assert.deepEqual(readGoogleAdsEmptyVolumeResponse(row.analise_semantica), { measuredAt: MEASURED_AT, googleAdsRequestId: "gads-req-diagnostico" });
  const readiness = resolveApprovalReadiness({ semantic: row.analise_semantica, intent: row.intent, volumeSearch: null, resultsAllintitle: 12 });
  assert.equal(readiness.ok, true, readiness.reason || "");
  assert.deepEqual(readiness.missing, []);
  assert.deepEqual(readiness.notes, [VOLUME_PROCESSED_WITHOUT_AVERAGE_NOTE]);
  assert.equal(VOLUME_PROCESSED_WITHOUT_AVERAGE_NOTE, "Volume processado, sem média oficial");
});

test("diagnóstico: o volume segue null, o KGR não é calculável e não vira exigência", () => {
  const row = diagnosticRow();
  const processor = deriveProcessorRevalidation({ semantic: { ...row.analise_semantica, kgr_aplicabilidade: "pending" }, volumeSearch: null, resultsAllintitle: 12 });
  assert.equal(processor.volume.validated, false);
  assert.equal(processor.volume.value, null);
  assert.equal(processor.kgr.ready, false);
  assert.equal(processor.kgr.score, null);
  const readiness = resolveApprovalReadiness({ semantic: { ...row.analise_semantica, kgr_aplicabilidade: "pending" }, intent: INTENT, volumeSearch: null, resultsAllintitle: 12 });
  assert.equal(readiness.missing.includes("kgr"), false);
  assert.equal(readiness.ok, true);
});

test("diagnóstico: o processo Volume fica completo sem completar o KGR", () => {
  const states = resolveMineradorProcessState(diagnosticRow());
  assert.equal(states.volume.complete, true);
  assert.equal(states.volume.artifactState, "current_valid");
  assert.match(states.volume.reason, /sem média oficial/);
  assert.equal(states.kgr.complete, false);
});

test("diagnóstico: a célula mostra o 0 apagado a partir do registro, sem tentativa de sessão (sobrevive ao recarregar)", () => {
  const row = diagnosticRow();
  assert.equal(processorVolumeCell({ semantic: row.analise_semantica, value: null }).tone, "processed_empty");
  assert.equal(processorCpcCell({ semantic: row.analise_semantica, value: null }).tone, "processed_empty");
  assert.equal(processorVolumeCell({ semantic: row.analise_semantica, value: null }).hint, "Processado, sem dado");
});

test("diagnóstico: o painel Google Ads diz Medido · sem média oficial, não Anterior/importado", () => {
  const row = diagnosticRow();
  const processor = deriveProcessorRevalidation({
    semantic: { ...row.analise_semantica, discovery_import: { source: "manual", sourceSnapshot: { metrics: {} } } },
    volumeSearch: null,
  });
  assert.equal(processor.volume.state, "imported");
  assert.equal(processorVolumeStateLabel(processor.volume), "Medido · sem média oficial");
  assert.equal(processor.volume.emptyResponse?.measuredAt, MEASURED_AT);
});

test("diagnóstico: o readback que antes virava 'medição recebida, mas o readback não confirmou' agora é empty", () => {
  const row = diagnosticRow();
  const outcome = classifyVolumeReadback({
    projection: { volumeSearch: null, measuredAt: MEASURED_AT },
    unmatched: false,
    row,
    volumeComplete: resolveMineradorProcessState(row).volume.complete,
  });
  assert.equal(outcome, "confirmed_empty");
});

test("diagnóstico: a trava do servidor e a da tela dizem o mesmo — aprovada depois da ativação passa", async () => {
  const approved = await approve(diagnosticRow());
  const gate = resolveHandoffApprovalGate({ semantic: approved.analise_semantica, intent: INTENT, volumeSearch: null, resultsAllintitle: 12 });
  assert.equal(gate.verdict, "pass");
  const handoff = evaluateMineradorArquitetoHandoff(approved, approved.brand_id, null);
  assert.equal(handoff.ok, true, handoff.reason || "");
  assert.equal(handoff.approvalGate?.verdict, "pass");
});

/* ------------------------------- o que NÃO é "sem média" ------------------------------- */

test("sem registro, falha de medição, outro provider ou data ilegível continuam exigindo Volume", () => {
  const casos: Record<string, unknown>[] = [
    {},
    { volume_eligibility: { ...DIAGNOSTIC_ELIGIBILITY, status: "measurement_failed" } },
    { volume_eligibility: { ...DIAGNOSTIC_ELIGIBILITY, status: "pending" } },
    { volume_eligibility: { ...DIAGNOSTIC_ELIGIBILITY, provider: "dataforseo" } },
    { volume_eligibility: { ...DIAGNOSTIC_ELIGIBILITY, measuredAt: "ontem" } },
    { volume_eligibility: { ...DIAGNOSTIC_ELIGIBILITY, averageMonthlySearches: 40 } },
    { volume_eligibility: "unavailable" },
  ];
  for (const extra of casos) {
    const semantic = semanticBase(extra);
    const readiness = resolveApprovalReadiness({ semantic, intent: INTENT, volumeSearch: null, resultsAllintitle: 12 });
    assert.equal(readiness.ok, false, JSON.stringify(extra));
    assert.deepEqual(readiness.missing, ["volume"]);
    assert.equal(readiness.notes, undefined);
    assert.equal(resolveMineradorProcessState({ keyword: KEYWORD, analise_semantica: semantic }).volume.complete, false);
  }
});

test("medição com número dispensa a nota, e a prontidão de sempre não ganha campo novo", () => {
  const semantic = semanticBase({ volume_measurement: { provider: "google_ads", averageMonthlySearches: 0, measuredAt: MEASURED_AT }, kgr_aplicabilidade: "applicable" });
  assert.deepEqual(resolveApprovalReadiness({ semantic, intent: INTENT, volumeSearch: 0, resultsAllintitle: 12 }), { ok: true, missing: [], reason: null });
});

test("erro de verdade continua erro: releitura sem o registro desta resposta ou sem linha", () => {
  const row = diagnosticRow();
  assert.equal(classifyVolumeReadback({ projection: { volumeSearch: null, measuredAt: "2026-09-25T14:00:00.000Z" }, unmatched: false, row, volumeComplete: true }), "failed");
  assert.equal(classifyVolumeReadback({ projection: { volumeSearch: null, measuredAt: MEASURED_AT }, unmatched: false, row: null, volumeComplete: false }), "failed");
  assert.equal(classifyVolumeReadback({ projection: { volumeSearch: 90, measuredAt: MEASURED_AT }, unmatched: false, row, volumeComplete: true }), "failed");
  assert.equal(classifyVolumeReadback({ projection: null, unmatched: false, row, volumeComplete: true }), "failed");
  // O Google Ads não devolveu a keyword: sem média, nunca falha.
  assert.equal(classifyVolumeReadback({ projection: null, unmatched: true, row: null, volumeComplete: false }), "empty");
});

test("readback de número confirma pela data da medição gravada", () => {
  const row = diagnosticRow();
  const patch = buildGoogleAdsVolumeMetricPatch(volumeKeyword(row), measurement({ measuredAt: MEASURED_AT }), { requireCurrentResultsMeasurement: true });
  assert.ok(patch);
  const after = applyPatch(row, patch);
  assert.equal(classifyVolumeReadback({ projection: { volumeSearch: 90, measuredAt: MEASURED_AT }, unmatched: false, row: after, volumeComplete: resolveMineradorProcessState(after).volume.complete }), "confirmed");
});

/* ------------------------------- medir de novo ------------------------------- */

test("medir de novo: número novo substitui a resposta sem média", () => {
  const row = diagnosticRow();
  const patch = buildGoogleAdsVolumeMetricPatch(volumeKeyword(row), measurement({ measuredAt: "2026-09-26T10:00:00.000Z" }), { requireCurrentResultsMeasurement: true });
  assert.ok(patch);
  const after = applyPatch(row, patch);
  assert.equal(after.volume_search, 90);
  assert.equal(readVolumeEligibility(after), "below_threshold");
  assert.equal(readGoogleAdsEmptyVolumeResponse(after.analise_semantica), null);
  const readiness = resolveApprovalReadiness({ semantic: { ...after.analise_semantica, kgr_aplicabilidade: "applicable" }, intent: INTENT, volumeSearch: 90, resultsAllintitle: 12 });
  assert.equal(readiness.ok, true);
  assert.equal(readiness.notes, undefined);
});

test("medir de novo: resposta sem média não apaga o número anterior e registra a nova data", () => {
  const measured = applyPatch(diagnosticRow(), buildGoogleAdsVolumeMetricPatch(volumeKeyword(diagnosticRow()), measurement(), { requireCurrentResultsMeasurement: true })!);
  const empty = buildGoogleAdsUnavailableVolumePatch(volumeKeyword(measured), measurement({ averageMonthlySearches: null, measuredAt: "2026-09-27T10:00:00.000Z", googleAdsRequestId: "req-vazio" }));
  assert.ok(empty);
  assert.equal("volume_search" in empty, false);
  assert.equal("kgr_score" in empty, false);
  const after = applyPatch(measured, empty);
  assert.equal(after.volume_search, 90);
  assert.deepEqual(after.analise_semantica.volume_measurement, measured.analise_semantica.volume_measurement);
  assert.equal(readVolumeEligibility(after), "below_threshold", "a elegibilidade sustentada pelo número fica");
  assert.deepEqual(readGoogleAdsLastEmptyVolumeResponse(after.analise_semantica), { measuredAt: "2026-09-27T10:00:00.000Z", googleAdsRequestId: "req-vazio" });
  assert.equal(classifyVolumeReadback({ projection: { volumeSearch: null, measuredAt: "2026-09-27T10:00:00.000Z" }, unmatched: false, row: after, volumeComplete: true }), "confirmed_empty");
});

test("medir de novo: resposta sem média sobre resposta sem média atualiza a data", () => {
  const row = diagnosticRow();
  const after = applyPatch(row, buildGoogleAdsEmptyVolumePatch(volumeKeyword(row), { measuredAt: "2026-09-28T09:00:00.000Z", providerVersion: "v25", googleAdsRequestId: "req-2" }));
  assert.equal(readGoogleAdsEmptyVolumeResponse(after.analise_semantica)?.measuredAt, "2026-09-28T09:00:00.000Z");
  assert.equal(after.volume_search, null);
});

test("linha com status legado publicado também registra a resposta sem média", () => {
  const row = { ...diagnosticRow(), status: "publicado", analise_semantica: semanticBase() };
  const patch = buildGoogleAdsUnavailableVolumePatch(volumeKeyword(row), measurement({ averageMonthlySearches: null, measuredAt: MEASURED_AT }));
  assert.ok(patch);
  assert.equal(readGoogleAdsEmptyVolumeResponse(patch.analise_semantica)?.measuredAt, MEASURED_AT);
});

test("falha nova não apaga resposta anterior: a marcação compensatória só vale para quem nunca respondeu", () => {
  assert.equal(shouldMarkVolumeMeasurementFailed({ status: "bruto", analise_semantica: {} }), true);
  assert.equal(shouldMarkVolumeMeasurementFailed({ status: "bruto", analise_semantica: { volume_eligibility: { ...DIAGNOSTIC_ELIGIBILITY } } }), false);
  assert.equal(shouldMarkVolumeMeasurementFailed({ status: "bruto", analise_semantica: { volume_measurement: { provider: "google_ads", averageMonthlySearches: 90, measuredAt: MEASURED_AT } } }), false);
  assert.equal(shouldMarkVolumeMeasurementFailed({ status: "publicado", analise_semantica: {} }), false);
});

/* --------------------- assinatura: remedir sem mudança real --------------------- */

test("remedir o mesmo número mudaria a assinatura só pela data; a rota carrega a aprovação", async () => {
  const measured = applyPatch(diagnosticRow(), buildGoogleAdsVolumeMetricPatch(volumeKeyword(diagnosticRow()), measurement(), { requireCurrentResultsMeasurement: true })!);
  const approved = await approve({ ...measured, analise_semantica: { ...measured.analise_semantica, kgr_aplicabilidade: "applicable" } });
  const record = readApprovalRecord(approved.analise_semantica)!;
  const rawPatch = buildGoogleAdsVolumeMetricPatch(volumeKeyword(approved), measurement({ measuredAt: "2026-09-29T10:00:00.000Z", googleAdsRequestId: "req-novo" }), { requireCurrentResultsMeasurement: true })!;

  // Sem a regra, a data nova bastaria para mandar a aprovada para revisão.
  assert.equal(approvedPackageDiverged(packageInput(applyPatch(approved, rawPatch))), true);

  const patch = withApprovalCarriedAcrossRemeasurement(volumeKeyword(approved), rawPatch);
  const after = applyPatch(approved, patch);
  assert.equal(approvedPackageDiverged(packageInput(after)), false);
  const carried = readApprovalRecord(after.analise_semantica)!;
  assert.equal(carried.version, record.version);
  assert.equal(carried.approvedAt, record.approvedAt);
  assert.equal(carried.approvedBy, record.approvedBy);
  assert.equal(carried.contentHash, record.contentHash, "o pacote é o mesmo: a identidade que o Arquiteto guardou continua valendo");
  assert.equal((after.analise_semantica.volume_measurement as { measuredAt: string }).measuredAt, "2026-09-29T10:00:00.000Z");
});

test("número diferente é mudança real: a aprovada vai para revisão", async () => {
  const measured = applyPatch(diagnosticRow(), buildGoogleAdsVolumeMetricPatch(volumeKeyword(diagnosticRow()), measurement(), { requireCurrentResultsMeasurement: true })!);
  const approved = await approve({ ...measured, analise_semantica: { ...measured.analise_semantica, kgr_aplicabilidade: "applicable" } });
  const rawPatch = buildGoogleAdsVolumeMetricPatch(volumeKeyword(approved), measurement({ averageMonthlySearches: 140, measuredAt: "2026-09-29T10:00:00.000Z" }), { requireCurrentResultsMeasurement: true })!;
  const patch = withApprovalCarriedAcrossRemeasurement(volumeKeyword(approved), rawPatch);
  assert.equal(patch, rawPatch);
  assert.equal(approvedPackageDiverged(packageInput(applyPatch(approved, patch))), true);
});

test("aprovada sem média: nova resposta sem média não rebaixa; número novo rebaixa", async () => {
  const approved = await approve(diagnosticRow());
  const again = withApprovalCarriedAcrossRemeasurement(volumeKeyword(approved), buildGoogleAdsEmptyVolumePatch(volumeKeyword(approved), { measuredAt: "2026-09-30T10:00:00.000Z", providerVersion: "v25", googleAdsRequestId: "req-3" }));
  const afterEmpty = applyPatch(approved, again);
  assert.equal(approvedPackageDiverged(packageInput(afterEmpty)), false);
  assert.equal(readGoogleAdsEmptyVolumeResponse(afterEmpty.analise_semantica)?.measuredAt, "2026-09-30T10:00:00.000Z");

  const numberPatch = buildGoogleAdsVolumeMetricPatch(volumeKeyword(afterEmpty), measurement({ measuredAt: "2026-10-01T10:00:00.000Z" }), { requireCurrentResultsMeasurement: true })!;
  const afterNumber = applyPatch(afterEmpty, withApprovalCarriedAcrossRemeasurement(volumeKeyword(afterEmpty), numberPatch));
  assert.equal(approvedPackageDiverged(packageInput(afterNumber)), true, "sair de 'sem média' para um número é mudança real");
});

test("aprovada com número: resposta sem média registrada depois não rebaixa", async () => {
  const measured = applyPatch(diagnosticRow(), buildGoogleAdsVolumeMetricPatch(volumeKeyword(diagnosticRow()), measurement(), { requireCurrentResultsMeasurement: true })!);
  const approved = await approve({ ...measured, analise_semantica: { ...measured.analise_semantica, kgr_aplicabilidade: "applicable" } });
  const empty = buildGoogleAdsEmptyVolumePatch(volumeKeyword(approved), { measuredAt: "2026-09-30T10:00:00.000Z", providerVersion: "v25", googleAdsRequestId: "req-4" });
  const after = applyPatch(approved, withApprovalCarriedAcrossRemeasurement(volumeKeyword(approved), empty));
  assert.equal(approvedPackageDiverged(packageInput(after)), false);
});

test("aprovada que já estava em revisão continua em revisão: a remedição não esconde a divergência", async () => {
  const approved = await approve(diagnosticRow());
  const mexida = { ...approved, analise_semantica: { ...approved.analise_semantica, nicho: "Outro nicho" } };
  assert.equal(approvedPackageDiverged(packageInput(mexida)), true);
  const before = packageInput(mexida);
  const empty = buildGoogleAdsEmptyVolumePatch(volumeKeyword(mexida), { measuredAt: "2026-09-30T10:00:00.000Z", providerVersion: "v25", googleAdsRequestId: "req-5" });
  assert.equal(carryApprovalAcrossRemeasurement(before, { ...before, semantic: empty.analise_semantica }), null);
});

test("sem aprovação não há o que carregar", () => {
  const row = diagnosticRow();
  const empty = buildGoogleAdsEmptyVolumePatch(volumeKeyword(row), { measuredAt: "2026-09-30T10:00:00.000Z", providerVersion: "v25", googleAdsRequestId: "req-6" });
  assert.equal(withApprovalCarriedAcrossRemeasurement(volumeKeyword(row), empty), empty);
});

/* ------------------------------- ligação na rota e na tela ------------------------------- */

function codeOnly(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}

test("rota: grava a resposta sem média também para a keyword que o Google Ads não devolveu, e carrega a aprovação", async () => {
  const route = codeOnly(await readFile(new URL("../app/api/minerador/marcas/[brandId]/google-ads/metricas-keywords/route.ts", import.meta.url), "utf8"));
  assert.match(route, /select\("id,brand_id,keyword,status,intent,volume_search/);
  assert.match(route, /for \(const keywordId of unmatchedKeywordIds\)/);
  assert.match(route, /buildGoogleAdsEmptyVolumePatch\(keyword, \{ measuredAt: responseMeasuredAt/);
  assert.equal(route.match(/withApprovalCarriedAcrossRemeasurement\(/g)?.length, 2, "nas duas gravações: resposta devolvida e não devolvida");
  assert.match(route, /loadedKeywords\.filter\(keyword => shouldMarkVolumeMeasurementFailed\(keyword\)/);
});

test("tela: o lote classifica pelo readback, e resposta sem média nunca vira failed", async () => {
  const workspace = codeOnly(await readFile(new URL("../modules/minerador/minerador-workspace.tsx", import.meta.url), "utf8"));
  assert.match(workspace, /classifyVolumeReadback\(\{/);
  assert.match(workspace, /readback === "confirmed_empty" \|\| readback === "empty"\) return \{ id, status: "empty" as const/);
  assert.match(workspace, /setProcessAttempt\(idsWith\("confirmed", "confirmed_empty", "empty"\), "volume", "success"/);
  assert.match(workspace, /VOLUME_PROCESSED_WITHOUT_AVERAGE_NOTE/);
});

/* ------------------------- revisão do corretor (2026-09-25) ------------------------- */

/** Publicada vinda de planilha antiga: número e KGR importados, nunca medidos no Google Ads. */
function importedLegacyRow(): Row {
  const row = diagnosticRow();
  return { ...row, volume_search: 500, kgr_score: 0.024, analise_semantica: semanticBase() };
}

test("volume importado + resposta sem média: NÃO vale como processado e não leva o número ao Arquiteto", async () => {
  const legacy = importedLegacyRow();
  const after = applyPatch(legacy, buildGoogleAdsEmptyVolumePatch(volumeKeyword(legacy), { measuredAt: MEASURED_AT, providerVersion: "v25", googleAdsRequestId: "req-legado", kind: "returned_without_average" }));
  assert.equal(after.volume_search, 500, "a resposta sem média não apaga o número importado");

  const processor = deriveProcessorRevalidation({ semantic: after.analise_semantica, volumeSearch: 500, resultsAllintitle: 12 });
  assert.equal(processor.volume.emptyResponse, null, "o volume não está vazio: não é 'processado, sem dado'");
  assert.equal(processor.volume.emptyResponseOverUnconfirmedValue?.measuredAt, MEASURED_AT);
  assert.equal(processorVolumeStateLabel(processor.volume), VOLUME_IMPORTED_NOT_CONFIRMED_LABEL);

  const readiness = resolveApprovalReadiness({ semantic: after.analise_semantica, intent: INTENT, volumeSearch: 500, resultsAllintitle: 12 });
  assert.equal(readiness.ok, false);
  assert.deepEqual(readiness.missing, ["volume"]);
  assert.equal(readiness.notes, undefined);
  assert.ok(readiness.reason?.endsWith(VOLUME_IMPORTED_NOT_CONFIRMED_REASON), readiness.reason || "");

  const states = resolveMineradorProcessState(after);
  assert.equal(states.volume.complete, false);
  assert.doesNotMatch(states.volume.reason, /volume segue vazio/);

  // A célula mostra o número importado, como antes; não o 0 apagado.
  assert.equal(processorVolumeCell({ semantic: after.analise_semantica, value: 500 }).tone, "value");

  // Com registro de aprovação gravado depois da trava, o envio é recusado antes do Arquiteto.
  const forced = await approve(after);
  assert.equal(resolveHandoffApprovalGate({ semantic: forced.analise_semantica, intent: INTENT, volumeSearch: 500, resultsAllintitle: 12 }).verdict, "refuse");
});

test("resposta sem média grava o porquê: devolvida sem média ou não devolvida no lote", () => {
  const row = diagnosticRow();
  const returned = buildGoogleAdsUnavailableVolumePatch(volumeKeyword(row), measurement({ averageMonthlySearches: null, measuredAt: MEASURED_AT }));
  assert.equal((returned?.analise_semantica.volume_eligibility as Record<string, unknown>).emptyResponseKind, "returned_without_average");
  const notReturned = buildGoogleAdsEmptyVolumePatch(volumeKeyword(row), { measuredAt: MEASURED_AT, providerVersion: "v25", googleAdsRequestId: null, kind: "not_returned" });
  assert.equal((notReturned.analise_semantica.volume_eligibility as Record<string, unknown>).emptyResponseKind, "not_returned");
  // O campo é diagnóstico: a leitura e a aprovação não mudam.
  assert.deepEqual(readGoogleAdsEmptyVolumeResponse(notReturned.analise_semantica), { measuredAt: MEASURED_AT, googleAdsRequestId: null });
  // Sobre número válido, o porquê vai junto da data em lastEmptyResponse.
  const measured = applyPatch(row, buildGoogleAdsVolumeMetricPatch(volumeKeyword(row), measurement(), { requireCurrentResultsMeasurement: true })!);
  const over = buildGoogleAdsEmptyVolumePatch(volumeKeyword(measured), { measuredAt: MEASURED_AT, providerVersion: "v25", googleAdsRequestId: null, kind: "not_returned" });
  const eligibility = over.analise_semantica.volume_eligibility as Record<string, unknown>;
  assert.equal((eligibility.lastEmptyResponse as Record<string, unknown>).emptyResponseKind, "not_returned");
});

test("o porquê da resposta vazia é proveniência: trocar de 'não devolvida' para 'sem média' não rebaixa a aprovada", async () => {
  const row = diagnosticRow();
  const first = applyPatch(row, buildGoogleAdsEmptyVolumePatch(volumeKeyword(row), { measuredAt: MEASURED_AT, providerVersion: "v25", googleAdsRequestId: "a", kind: "not_returned" }));
  const approved = await approve(first);
  const next = buildGoogleAdsEmptyVolumePatch(volumeKeyword(approved), { measuredAt: "2026-09-30T10:00:00.000Z", providerVersion: "v25", googleAdsRequestId: "b", kind: "returned_without_average" });
  const after = applyPatch(approved, withApprovalCarriedAcrossRemeasurement(volumeKeyword(approved), next));
  assert.equal(approvedPackageDiverged(packageInput(after)), false);
});

test("célula e aprovação leem o 'sem média' pela mesma regra: outro provider não mostra o 0 apagado", () => {
  assert.equal(volumeProcessRecorded({ volume_eligibility: { ...DIAGNOSTIC_ELIGIBILITY } }), true);
  assert.equal(volumeProcessRecorded({ volume_eligibility: { ...DIAGNOSTIC_ELIGIBILITY, provider: "dataforseo" } }), false);
  assert.equal(processorVolumeCell({ semantic: { volume_eligibility: { ...DIAGNOSTIC_ELIGIBILITY, provider: "dataforseo" } }, value: null }).tone, "not_processed");
  // Os demais status gravados seguem como antes.
  assert.equal(volumeProcessRecorded({ volume_eligibility: { status: "below_threshold", measuredAt: MEASURED_AT } }), true);
});

test("tela: a notificação do lote conta as sem média como processadas e não as chama de inelegíveis", async () => {
  const workspace = codeOnly(await readFile(new URL("../modules/minerador/minerador-workspace.tsx", import.meta.url), "utf8"));
  assert.equal(workspace.includes("inelegíveis para produção"), false);
  assert.ok(workspace.includes("${batch.succeeded + batch.empty} de ${requestedCount} keywords processadas no Google Ads; ${batch.empty} sem média oficial"));
});

test("rota: a keyword não devolvida grava o porquê 'not_returned'", async () => {
  const route = codeOnly(await readFile(new URL("../app/api/minerador/marcas/[brandId]/google-ads/metricas-keywords/route.ts", import.meta.url), "utf8"));
  assert.ok(route.includes('kind: "not_returned" });'));
});
