import assert from "node:assert/strict";
import test from "node:test";
import {
  applyApproval,
  approvedPackageDiverged,
  approvedPackageSignature,
  buildApprovedPackage,
  readApprovalRecord,
  resolveApprovalReadiness,
} from "../lib/minerador/approved-package.ts";
import { isApprovedForArchitect, resolveEffectiveKeywordStatus } from "../lib/minerador/editorial-status.ts";
import { buildMineradorArquitetoHandoffPlan } from "../lib/arquiteto/minerador-handoff.ts";
import { buildLogicalOutputContract } from "../lib/minerador/logical-processor.ts";

/**
 * Aprovação versionada: o Arquiteto recebe o pacote fechado, e ele só muda
 * quando o humano aprova de novo. REAL_PROVIDER_CALLS_IN_TESTS = 0.
 */

const INTENT = "Comercial investigativa";

function semanticPronta(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  const semantic: Record<string, unknown> = {
    dna_origem: "logico_deterministico",
    intencao_principal: INTENT,
    nicho: "Estética",
    funnel: "MOFU",
    volume_measurement: { provider: "google_ads", averageMonthlySearches: 90, measuredAt: "2026-09-18T10:00:00.000Z" },
    allintitle_measurement: { provider: "dataforseo", status: "success", resultsAllintitle: 336, measuredAt: "2026-09-18T10:01:00.000Z" },
    kgr_aplicabilidade: "applicable",
    ...overrides,
  };
  semantic.logical_output_contract = buildLogicalOutputContract({ semantic, intent: INTENT, niche: "Estética", funnel: "MOFU" });
  return semantic;
}

function pacoteDe(semantic: Record<string, unknown>) {
  return {
    keywordId: "kw-1",
    brandId: "brand-1",
    keyword: "sérum facial",
    intent: INTENT,
    volumeSearch: 90,
    resultsAllintitle: 336,
    kgrScore: 3.7333,
    listaId: null,
    semantic,
  };
}

test("aprovar exige Lógica, Volume, Resultados e KGR tratado", () => {
  const pronta = resolveApprovalReadiness({ semantic: semanticPronta(), intent: INTENT, volumeSearch: 90, resultsAllintitle: 336 });
  assert.equal(pronta.ok, true);
  assert.deepEqual(pronta.missing, []);

  const semLogica = resolveApprovalReadiness({ semantic: { volume_measurement: { provider: "google_ads", averageMonthlySearches: 90, measuredAt: "x" } }, volumeSearch: 90 });
  assert.equal(semLogica.ok, false);
  assert.ok(semLogica.missing.includes("logic"));
  assert.match(semLogica.reason || "", /pacote fechado/);

  const semMedicao = resolveApprovalReadiness({ semantic: semanticPronta({ volume_measurement: undefined, allintitle_measurement: undefined }), intent: INTENT });
  assert.ok(semMedicao.missing.includes("volume"));
  assert.ok(semMedicao.missing.includes("results"));

  const kgrPendente = resolveApprovalReadiness({ semantic: semanticPronta({ kgr_aplicabilidade: "pending" }), intent: INTENT, volumeSearch: 90, resultsAllintitle: 336 });
  assert.equal(kgrPendente.ok, false);
  assert.ok(kgrPendente.missing.includes("kgr"));
});

test("SERP não conclusiva não trava a aprovação", () => {
  // O caso real: evidência mista é resultado da análise, não pendência. Se
  // travasse aqui, keyword com SERP dividida nunca poderia ser aprovada.
  const mista = semanticPronta({
    analise_serp: { intentStrength: "mixed", funnelStrength: "mixed" },
    intencao_consolidada: null,
  });
  const readiness = resolveApprovalReadiness({ semantic: mista, intent: INTENT, volumeSearch: 90, resultsAllintitle: 336 });
  assert.equal(readiness.ok, true, "SERP mista não pode impedir a decisão humana");
});

test("aprovar grava o registro e o pacote nasce sem divergência", async () => {
  const base = pacoteDe(semanticPronta());
  assert.equal(approvedPackageDiverged(base), null, "sem aprovação não existe divergência");
  assert.equal(buildApprovedPackage(base), null, "sem registro não viaja pacote");

  const aprovada = await applyApproval({ ...base, approvedAt: "2026-09-18T12:00:00.000Z", approvedBy: "human-1" });
  const registro = readApprovalRecord(aprovada);
  assert.equal(registro?.version, 1);
  assert.equal(registro?.approvedBy, "human-1");
  assert.match(registro?.contentHash || "", /^sha256:/);

  const depois = { ...base, semantic: aprovada };
  assert.equal(approvedPackageDiverged(depois), false, "aprovar não pode tornar a keyword divergente de si mesma");

  const pacote = buildApprovedPackage(depois);
  assert.equal(pacote?.keyword, "sérum facial");
  assert.equal(pacote?.volumeSearch, 90);
  assert.equal(pacote?.resultsAllintitle, 336);
  assert.equal(pacote?.version, 1);
  // O DNA inteiro viaja: o Arquiteto não pode ignorar nada.
  assert.equal((pacote?.analiseSemantica as Record<string, unknown>).nicho, "Estética");
  assert.equal((pacote?.analiseSemantica as Record<string, unknown>).aprovacao, undefined, "o registro não entra no próprio pacote");
});

test("reexecutar e obter o mesmo valor não rebaixa; mudança material rebaixa", async () => {
  const base = pacoteDe(semanticPronta());
  const aprovada = await applyApproval({ ...base, approvedAt: "2026-09-18T12:00:00.000Z", approvedBy: "human-1" });

  // Revalidação que devolve o mesmo número: a medição tem timestamp novo, mas
  // o conteúdo aprovado é o mesmo.
  const mesmaMedicao = { ...base, semantic: aprovada };
  assert.equal(approvedPackageDiverged(mesmaMedicao), false);

  // Volume diferente é mudança material.
  const volumeNovo = { ...base, semantic: aprovada, volumeSearch: 140 };
  assert.equal(approvedPackageDiverged(volumeNovo), true);

  // Mudança dentro do DNA também conta.
  const dnaNovo = { ...base, semantic: { ...aprovada, nicho: "Dermocosmético" } };
  assert.equal(approvedPackageDiverged(dnaNovo), true);
});

test("o status efetivo vira Em revisão sozinho, sem depender de writer", async () => {
  const base = pacoteDe(semanticPronta());
  const aprovada = await applyApproval({ ...base, approvedAt: "2026-09-18T12:00:00.000Z", approvedBy: "human-1" });

  const intacta = resolveEffectiveKeywordStatus({ status: "aprovado", diverged: approvedPackageDiverged({ ...base, semantic: aprovada }) });
  assert.equal(intacta.status, "aprovado");
  assert.equal(intacta.divergedFromApproval, false);

  const mexida = resolveEffectiveKeywordStatus({ status: "aprovado", diverged: approvedPackageDiverged({ ...base, semantic: aprovada, volumeSearch: 140 }) });
  assert.equal(mexida.status, "em_revisao");
  assert.equal(mexida.label, "Em revisão");
  assert.equal(mexida.divergedFromApproval, true);
  assert.equal(mexida.rawStatus, "aprovado", "a coluna continua sendo proveniência da escolha humana");

  // Só o efetivamente aprovado entrega pacote novo ao Arquiteto.
  assert.equal(isApprovedForArchitect({ status: "aprovado", diverged: false }), true);
  assert.equal(isApprovedForArchitect({ status: "aprovado", diverged: true }), false);
  assert.equal(isApprovedForArchitect({ status: "bruto", diverged: null }), false);
});

test("reaprovar produz versão 2 e volta a fechar o pacote", async () => {
  const base = pacoteDe(semanticPronta());
  const v1 = await applyApproval({ ...base, approvedAt: "2026-09-18T12:00:00.000Z", approvedBy: "human-1" });
  const mexida = { ...base, semantic: v1, volumeSearch: 140 };
  assert.equal(approvedPackageDiverged(mexida), true);

  const v2 = await applyApproval({ ...mexida, approvedAt: "2026-09-18T13:00:00.000Z", approvedBy: "human-2" });
  const registro = readApprovalRecord(v2);
  assert.equal(registro?.version, 2);
  assert.equal(registro?.approvedBy, "human-2");
  assert.notEqual(registro?.contentHash, readApprovalRecord(v1)?.contentHash);

  const depois = { ...mexida, semantic: v2 };
  assert.equal(approvedPackageDiverged(depois), false);
  assert.equal(buildApprovedPackage(depois)?.volumeSearch, 140, "o pacote novo carrega o valor novo");
});

test("a assinatura é estável para o mesmo conteúdo em ordem diferente", () => {
  const a = pacoteDe(semanticPronta({ alfa: 1, beta: 2 }));
  const b = pacoteDe(semanticPronta({ beta: 2, alfa: 1 }));
  assert.equal(approvedPackageSignature(a), approvedPackageSignature(b));
});

test("reaprovar atualiza o pacote de quem já está no Arquiteto", async () => {
  const semantic = semanticPronta();
  const aprovada = await applyApproval({ ...pacoteDe(semantic), approvedAt: "2026-09-18T12:00:00.000Z", approvedBy: "human-1" });
  const fonte = {
    id: "kw-1",
    brandId: "brand-1",
    status: "aprovado",
    approvedDna: buildApprovedPackage({ ...pacoteDe(aprovada) }),
  };

  // Keyword nova: cria linha, não atualiza nada.
  const primeiroEnvio = buildMineradorArquitetoHandoffPlan({
    brandId: "brand-1",
    keywords: [fonte],
    existingKeywordIds: new Set(),
    receivedApprovedHashById: new Map(),
  });
  assert.equal(primeiroEnvio.rows.length, 1);
  assert.equal(primeiroEnvio.updates.length, 0);
  assert.equal(primeiroEnvio.rows[0].payload.approvedDna?.contentHash, fonte.approvedDna?.contentHash);

  // Já recebida com o mesmo pacote: nada a fazer.
  const semMudanca = buildMineradorArquitetoHandoffPlan({
    brandId: "brand-1",
    keywords: [fonte],
    existingKeywordIds: new Set(["kw-1"]),
    receivedApprovedHashById: new Map([["kw-1", fonte.approvedDna?.contentHash ?? null]]),
  });
  assert.equal(semMudanca.rows.length, 0);
  assert.equal(semMudanca.updates.length, 0);
  assert.equal(semMudanca.status, "UNCHANGED");

  // Reaprovada com valor novo: sem fluxo explícito, o pacote é reescrito.
  const reaprovada = await applyApproval({ ...pacoteDe(aprovada), volumeSearch: 140, approvedAt: "2026-09-18T13:00:00.000Z", approvedBy: "human-2" });
  const fonteV2 = { ...fonte, approvedDna: buildApprovedPackage({ ...pacoteDe(reaprovada), volumeSearch: 140 }) };
  const comMudanca = buildMineradorArquitetoHandoffPlan({
    brandId: "brand-1",
    keywords: [fonteV2],
    existingKeywordIds: new Set(["kw-1"]),
    receivedApprovedHashById: new Map([["kw-1", fonte.approvedDna?.contentHash ?? null]]),
  });
  assert.equal(comMudanca.rows.length, 0, "não cria linha duplicada");
  assert.equal(comMudanca.updates.length, 1);
  assert.equal(comMudanca.updates[0].keywordId, "kw-1");
  assert.equal(comMudanca.updates[0].payload.approvedDna?.volumeSearch, 140);
  assert.equal(comMudanca.updates[0].payload.approvedDna?.version, 2);
  assert.deepEqual(comMudanca.refreshedKeywordIds, ["kw-1"]);
  assert.equal(comMudanca.status, "PERSISTED");
});

test("keyword em revisão não reabastece o Arquiteto", () => {
  // Sem pacote aprovado não há o que propagar: o Arquiteto tem que continuar
  // com o que foi aprovado antes, e não com o rascunho em revisão.
  const plan = buildMineradorArquitetoHandoffPlan({
    brandId: "brand-1",
    keywords: [{ id: "kw-1", brandId: "brand-1", status: "aprovado", approvedDna: null }],
    existingKeywordIds: new Set(["kw-1"]),
    receivedApprovedHashById: new Map([["kw-1", "sha256:antigo"]]),
  });
  assert.equal(plan.updates.length, 0);
  assert.equal(plan.status, "UNCHANGED");
});
