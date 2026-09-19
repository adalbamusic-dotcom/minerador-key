import assert from "node:assert/strict";
import test from "node:test";
import { applyApproval, buildApprovedPackage } from "../lib/minerador/approved-package.ts";
import { packageStaleReasons, resolvePackageFreshness, summarizePackageFreshness } from "../lib/minerador/package-freshness.ts";
import { buildLogicalOutputContract } from "../lib/minerador/logical-processor.ts";

/**
 * Frescor do insumo entregue ao Arquiteto. O Minerador responde; o consumidor
 * a jusante não reimplementa a comparação. REAL_PROVIDER_CALLS_IN_TESTS = 0.
 */

const INTENT = "Comercial investigativa";

function semanticPronta(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  const semantic: Record<string, unknown> = {
    dna_origem: "logico_deterministico",
    intencao_principal: INTENT,
    nicho: "Estética",
    funnel: "MOFU",
    volume_measurement: { provider: "google_ads", averageMonthlySearches: 90, measuredAt: "2026-09-19T10:00:00.000Z" },
    allintitle_measurement: { provider: "dataforseo", status: "success", resultsAllintitle: 336, measuredAt: "2026-09-19T10:01:00.000Z" },
    kgr_aplicabilidade: "applicable",
    ...overrides,
  };
  semantic.logical_output_contract = buildLogicalOutputContract({ semantic, intent: INTENT, niche: "Estética", funnel: "MOFU" });
  return semantic;
}

function keywordState(semantic: Record<string, unknown>, overrides: Record<string, unknown> = {}) {
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
    status: "aprovado",
    ...overrides,
  };
}

async function aprovada(overrides: Record<string, unknown> = {}) {
  const base = keywordState(semanticPronta(), overrides);
  const semantic = await applyApproval({ ...base, approvedAt: "2026-09-19T12:00:00.000Z", approvedBy: "human-1" });
  return keywordState(semantic, overrides);
}

test("consumir a versão vigente é fresco e não declara motivo", async () => {
  const keyword = await aprovada();
  const pacote = buildApprovedPackage(keyword)!;
  const frescor = resolvePackageFreshness({
    keyword,
    reference: { keywordId: "kw-1", approvedVersion: pacote.version, contentHash: pacote.contentHash },
  });
  assert.equal(frescor.state, "fresh");
  assert.equal(frescor.reason, null);
  assert.equal(frescor.currentVersion, 1);
  assert.deepEqual(packageStaleReasons([frescor]), []);
});

test("keyword em revisão não invalida quem consumiu a aprovada", async () => {
  // É o ponto do contrato: o Arquiteto segue trabalhando sobre a última versão
  // aprovada enquanto o Minerador mexe na próxima.
  const keyword = await aprovada();
  const pacote = buildApprovedPackage(keyword)!;
  const mexida = { ...keyword, volumeSearch: 140 };

  const frescor = resolvePackageFreshness({
    keyword: mexida,
    reference: { keywordId: "kw-1", approvedVersion: pacote.version, contentHash: pacote.contentHash },
  });
  assert.equal(frescor.state, "in_review");
  assert.match(frescor.reason || "", /continua sendo a v1 aprovada/);
  // Declara estado, mas não impede o consumo a jusante.
  assert.equal(summarizePackageFreshness([frescor]).usableDownstream, true);
});

test("pacote aprovado mais novo deixa o consumidor defasado", async () => {
  const v1 = await aprovada();
  const pacoteV1 = buildApprovedPackage(v1)!;

  const comValorNovo = { ...v1, volumeSearch: 140 };
  const semanticV2 = await applyApproval({ ...comValorNovo, approvedAt: "2026-09-19T13:00:00.000Z", approvedBy: "human-2" });
  const v2 = { ...comValorNovo, semantic: semanticV2 };

  const frescor = resolvePackageFreshness({
    keyword: v2,
    reference: { keywordId: "kw-1", approvedVersion: pacoteV1.version, contentHash: pacoteV1.contentHash },
  });
  assert.equal(frescor.state, "stale");
  assert.equal(frescor.currentVersion, 2);
  assert.equal(frescor.consumedVersion, 1);
  assert.match(frescor.reason || "", /a aprovada agora é a v2/);

  const resumo = summarizePackageFreshness([frescor]);
  assert.equal(resumo.usableDownstream, false, "decisão aprovada que o artefato não conhece impede o consumo");
  assert.equal(resumo.staleReasons.length, 1);
});

test("artefato formado sobre keyword sem pacote é declarado, não escondido", () => {
  const frescor = resolvePackageFreshness({
    keyword: keywordState(semanticPronta(), { status: "bruto" }),
    reference: { keywordId: "kw-1", approvedVersion: null, contentHash: null },
  });
  assert.equal(frescor.state, "never_approved");
  assert.match(frescor.reason || "", /registro vivo/);
});

test("artefato que não declarou o pacote fica desconhecido, nunca fresco", async () => {
  const keyword = await aprovada();
  const frescor = resolvePackageFreshness({ keyword, reference: null });
  assert.equal(frescor.state, "unknown");
  assert.match(frescor.reason || "", /não declarou/);
  // Desconhecido entra nos motivos: silêncio não pode passar por frescor.
  assert.equal(packageStaleReasons([frescor]).length, 1);
});

test("o resumo separa defasado de em revisão para o artefato inteiro", async () => {
  const fresca = await aprovada();
  const pacote = buildApprovedPackage(fresca)!;
  const referencia = { keywordId: "kw-1", approvedVersion: pacote.version, contentHash: pacote.contentHash };

  const entradas = [
    resolvePackageFreshness({ keyword: fresca, reference: referencia }),
    resolvePackageFreshness({ keyword: { ...fresca, volumeSearch: 140 }, reference: referencia }),
    resolvePackageFreshness({ keyword: keywordState(semanticPronta(), { status: "bruto" }), reference: null }),
  ];
  const resumo = summarizePackageFreshness(entradas);
  assert.equal(resumo.stale.length, 0);
  assert.equal(resumo.inReview.length, 1);
  assert.equal(resumo.neverApproved.length, 1);
  assert.equal(resumo.usableDownstream, true, "só defasagem real impede");
  assert.equal(resumo.staleReasons.length, 2, "em revisão e sem pacote são declarados");
});
