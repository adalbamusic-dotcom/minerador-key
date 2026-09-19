import assert from "node:assert/strict";
import test from "node:test";
import { APPROVAL_SIGNATURE_SCHEME, applyApproval, approvedPackageDiverged, readApprovalRecord, resignApprovalRecord } from "../lib/minerador/approved-package.ts";
import { applySerpEvidenceRecord } from "../lib/minerador/serp-evidence-record.ts";
import { buildLogicalOutputContract } from "../lib/minerador/logical-processor.ts";
import { canonicalJson } from "../lib/arquiteto/versioning.ts";
import type { KeywordSemanticQualification } from "../lib/minerador/keyword-semantic-qualification.ts";

/**
 * Assinatura v2 do pacote aprovado: a SERP entra pela leitura canônica, não
 * pelo registro bruto. Registros v1 continuam verificáveis e migram sem
 * mudar versão. REAL_PROVIDER_CALLS_IN_TESTS = 0.
 */

const LOGICA = "Comercial investigativa";

function semanticLogica(): Record<string, unknown> {
  const semantic: Record<string, unknown> = {
    dna_origem: "logico_deterministico",
    intencao_principal: LOGICA,
    nicho: "Estética",
    funnel: "MOFU",
    volume_measurement: { provider: "google_ads", averageMonthlySearches: 90, measuredAt: "2026-09-19T10:00:00.000Z" },
    allintitle_measurement: { provider: "dataforseo", status: "success", resultsAllintitle: 336, measuredAt: "2026-09-19T10:01:00.000Z" },
    kgr_aplicabilidade: "applicable",
  };
  semantic.logical_output_contract = buildLogicalOutputContract({ semantic, intent: LOGICA, niche: "Estética", funnel: "MOFU" });
  return semantic;
}

function qualificacao(intent: { value: string; strength: KeywordSemanticQualification["intent"]["strength"] }, funnel: { value: string; strength: KeywordSemanticQualification["funnel"]["strength"] }): KeywordSemanticQualification {
  const axis = (value: string, strength: KeywordSemanticQualification["intent"]["strength"]): KeywordSemanticQualification["intent"] => ({
    observedValue: value, strength, supporting: 6, observed: 8, classified: 8, coverage: 1, dominance: 0.75, distribution: [], structuralSignals: [],
  });
  return {
    schemaVersion: "v1",
    id: "keyword_semantic_qualification:brand-1:kw-1:v1",
    brandId: "brand-1",
    keywordId: "kw-1",
    source: { provider: "dataforseo", operationRequestId: "11111111-1111-4111-8111-111111111111", providerRequestId: "task-1", collectedAt: "2026-09-19T10:02:00.000Z" },
    query: { keyword: "sérum facial", locationCode: 2076, languageCode: "pt", device: "desktop" },
    evidence: { observedResults: 8, serpFeatures: [], sample: [], evidenceHash: "sha256:fixture" },
    intent: axis(intent.value, intent.strength),
    funnel: axis(funnel.value, funnel.strength),
    derivation: { derivationVersion: "serp-semantic-derivation-v3", thresholdsVersion: "provisional-heuristic-2026-08-28", thresholdsStatus: "provisional_heuristic" },
    lifecycle: { version: 1, contentHash: "sha256:qualificacao", createdAt: "2026-09-19T10:02:00.000Z", createdBy: "user-1", supersedesVersionId: null },
  };
}

const input = { keywordId: "kw-1", brandId: "brand-1", keyword: "sérum facial", intent: LOGICA, volumeSearch: 90, resultsAllintitle: 336, kgrScore: 3.7333, listaId: null };

/** Reproduz o esquema v1 (2026-09-18) para simular registro antigo no banco. */
function assinaturaV1(semantic: Record<string, unknown>): string {
  const semantica = { ...semantic };
  delete semantica.aprovacao;
  const serialized = canonicalJson({ keywordId: input.keywordId, keyword: input.keyword, intent: input.intent, volumeSearch: 90, resultsAllintitle: 336, kgrScore: 3.7333, analiseSemantica: semantica });
  let hash = 2166136261;
  for (let index = 0; index < serialized.length; index += 1) {
    hash ^= serialized.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `fnv1a:${(hash >>> 0).toString(36)}`;
}

function aprovadaV1(): Record<string, unknown> {
  const semantic = semanticLogica();
  return { ...semantic, aprovacao: { contentHash: "sha256:v1-legado", signature: assinaturaV1(semantic), approvedAt: "2026-09-18T12:00:00.000Z", approvedBy: "human-1", version: 1 } };
}

test("aprovação nova assina no esquema v2", async () => {
  const semantic = await applyApproval({ ...input, semantic: semanticLogica(), approvedAt: "2026-09-19T12:00:00.000Z", approvedBy: "human-1" });
  assert.match(readApprovalRecord(semantic)?.signature || "", new RegExp(`^${APPROVAL_SIGNATURE_SCHEME}:`));
});

test("SERP que não muda a leitura canônica não rebaixa a aprovação", async () => {
  const semantic = await applyApproval({ ...input, semantic: semanticLogica(), approvedAt: "2026-09-19T12:00:00.000Z", approvedBy: "human-1" });
  const mista = applySerpEvidenceRecord(semantic, qualificacao({ value: "Transacional", strength: "mixed" }, { value: "BOFU", strength: "weak" }));
  assert.equal(approvedPackageDiverged({ ...input, semantic: mista }), false, "SERP mista/fraca não conclui nada: sem ruído");

  const concorda = applySerpEvidenceRecord(semantic, qualificacao({ value: LOGICA, strength: "conclusive" }, { value: "MOFU", strength: "conclusive" }));
  assert.equal(approvedPackageDiverged({ ...input, semantic: concorda }), false, "SERP conclusiva que confirma a Lógica não muda o pacote");

  const discorda = applySerpEvidenceRecord(semantic, qualificacao({ value: "Transacional", strength: "conclusive" }, { value: "MOFU", strength: "conclusive" }));
  assert.equal(approvedPackageDiverged({ ...input, semantic: discorda }), true, "SERP conclusiva que muda a intenção exige nova aprovação");
});

test("registro v1 continua verificável e migra para v2 sem mudar versão", async () => {
  const legado = aprovadaV1();
  assert.equal(approvedPackageDiverged({ ...input, semantic: legado }), false, "v1 intacto ainda bate");

  const migrado = await resignApprovalRecord({ ...input, semantic: legado });
  assert.ok(migrado.semantic, "migra");
  const record = readApprovalRecord(migrado.semantic)!;
  assert.match(record.signature, new RegExp(`^${APPROVAL_SIGNATURE_SCHEME}:`));
  assert.equal(record.version, 1);
  assert.equal(record.approvedAt, "2026-09-18T12:00:00.000Z");
  assert.equal(record.approvedBy, "human-1");
  assert.notEqual(record.contentHash, "sha256:v1-legado", "o hash acompanha o esquema novo");
  assert.equal(approvedPackageDiverged({ ...input, semantic: migrado.semantic }), false);

  const deNovo = await resignApprovalRecord({ ...input, semantic: migrado.semantic });
  assert.equal(deNovo.semantic, null);
  assert.equal("reason" in deNovo && deNovo.reason, "already_current");
});

test("registro v1 que já diverge NÃO é re-assinado: é revisão de verdade", async () => {
  const legado = aprovadaV1();
  const mexida = { ...legado, intencao_principal: "Transacional" };
  assert.equal(approvedPackageDiverged({ ...input, semantic: mexida }), true);
  const tentativa = await resignApprovalRecord({ ...input, semantic: mexida });
  assert.equal(tentativa.semantic, null);
  assert.equal("reason" in tentativa && tentativa.reason, "diverged");
});
