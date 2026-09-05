import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  BASE_DECISION_STATES,
  BASE_OBSERVATION_STATES,
  PublishedStructureEvidenceSchema,
  StrategicDeclarationSchema,
  TERRITORY_PROCESS_ORDER,
  TerritorialBaseEntrySchema,
  buildTerritorialBase,
  classifyUrlStructuralHint,
  emptyTerritorialBase,
  nextTerritoryProcess,
  planTerritoryPromotion,
  processMayMutateScenario,
  resolveBaseBucket,
  resolveTerritorialResidue,
  strategicDeclarationAsBaseEntry,
  type KeywordTerritorialAffinity,
  type PublishedStructureEvidence,
  type TerritorialBaseEntry,
} from "../lib/arquiteto/territorial-base.ts";
import {
  TerritoryCandidateSchema,
  buildTerritoryRef,
  emptyTerritoryDiscovery,
  emptyTerritoryLineage,
  emptyTerritoryNarrative,
  suggestionUsableAsKeywordId,
} from "../lib/arquiteto/territory.ts";

const BRAND = "brand-1";
const NOW = "2026-09-02T12:00:00.000Z";
const REF_A = buildTerritoryRef("11111111-1111-4111-8111-111111111111");

function evidence(overrides: Partial<PublishedStructureEvidence> = {}): PublishedStructureEvidence {
  return PublishedStructureEvidenceSchema.parse({
    evidenceId: "ev-1",
    brandId: BRAND,
    source: "sitemap",
    url: "https://marca.com/pele/barreira-cutanea/",
    normalizedUrl: "marca.com/pele/barreira-cutanea",
    path: "/pele/barreira-cutanea/",
    slug: "barreira-cutanea",
    canonical: "https://marca.com/pele/barreira-cutanea/",
    normalizedCanonical: "marca.com/pele/barreira-cutanea",
    title: "Barreira cutânea",
    observedAt: NOW,
    sitemapRef: "sitemap-1",
    publicationRef: null,
    articleRef: null,
    siloRef: null,
    publicationState: "published",
    observationState: "matched",
    structuralHint: "editorial_candidate",
    provenance: { collectedBy: "marca_site", collectedAt: NOW, sourceRef: "sitemap-1" },
    notes: [],
    ...overrides,
  });
}

function entry(overrides: Partial<TerritorialBaseEntry> = {}): TerritorialBaseEntry {
  return TerritorialBaseEntrySchema.parse({
    entryId: "entry-1",
    brandId: BRAND,
    label: "Barreira cutânea",
    architecturalOrigin: "existing",
    ingestionOrigin: "sitemap",
    publicationState: "published",
    observationState: "matched",
    decisionState: "confirmed_existing",
    existingSiloId: null,
    existingSiloPageId: null,
    territoryRef: null,
    evidenceIds: ["ev-1"],
    reasons: ["Estrutura observada no site da Marca."],
    ...overrides,
  });
}

const codes = (input: { issues: Array<{ code: string }> }) => input.issues.map(issue => issue.code);

/* ---------------------------- A · base vazia ----------------------------- */

test("A · Brand sem site, sem Silo e sem publicação produz Base válida e vazia", () => {
  const vazia = buildTerritorialBase({ brandId: BRAND, entries: [], evidence: [] });

  assert.deepEqual(vazia, emptyTerritorialBase(BRAND));
  assert.deepEqual(vazia.issues, [], "ausência de estrutura não é erro");
});

/* ------------------- B/C · evidência não é território -------------------- */

test("B · estrutura de sitemap é evidência, não TerritoryCandidate", () => {
  const base = buildTerritorialBase({ brandId: BRAND, entries: [entry()], evidence: [evidence()] });

  assert.equal(base.publishedConfirmed.length, 1);
  assert.equal(base.publishedConfirmed[0].territoryRef, null, "nenhum territoryRef nasce da evidência");
  // A evidência não satisfaz o contrato de território: são coisas diferentes.
  assert.equal(TerritoryCandidateSchema.safeParse(base.evidence[0]).success, false);

  const semDecisao = planTerritoryPromotion({ brandId: BRAND, entry: entry(), decision: null });
  assert.ok(!semDecisao.ok && semDecisao.refusals.some(refusal => refusal.code === "PROMOTION_REQUIRES_HUMAN_DECISION"));

  const naoConfirmada = planTerritoryPromotion({
    brandId: BRAND,
    entry: entry(),
    decision: { actorUserId: "user-1", decidedAt: NOW, confirmed: false, reason: "abrir depois" },
  });
  assert.ok(!naoConfirmada.ok, "ausência de confirmação é recusa, nunca consentimento presumido");

  const confirmada = planTerritoryPromotion({
    brandId: BRAND,
    entry: entry(),
    decision: { actorUserId: "user-1", decidedAt: NOW, confirmed: true, reason: "Linha editorial reconhecida." },
  });
  assert.equal(confirmada.ok, true);
});

test("C · estrutura importada é evidência/reconciliação, nunca Silo aprovado", () => {
  const importada = entry({
    entryId: "entry-csv",
    architecturalOrigin: "existing",
    ingestionOrigin: "csv",
    decisionState: "needs_reconciliation",
    evidenceIds: ["ev-csv"],
  });

  const base = buildTerritorialBase({
    brandId: BRAND,
    entries: [importada],
    evidence: [evidence({ evidenceId: "ev-csv", source: "csv_import", provenance: { collectedBy: "csv", collectedAt: NOW, sourceRef: "lote-1" } })],
  });

  assert.deepEqual(base.importedReconciliation.map(item => item.entryId), ["entry-csv"]);
  assert.equal(base.importedReconciliation[0].territoryRef, null);
  assert.equal(base.importedReconciliation[0].existingSiloId, null, "importar não aprova Silo");
  assert.ok(codes(base).includes("LEGACY_NEEDS_RECONCILIATION"));
});

test("promoção recusa entrada ignorada, já promovida e de outra Brand", () => {
  const decision = { actorUserId: "user-1", decidedAt: NOW, confirmed: true, reason: "ok" };

  const ignorada = planTerritoryPromotion({ brandId: BRAND, entry: entry({ decisionState: "ignored" }), decision });
  assert.ok(!ignorada.ok && ignorada.refusals.some(refusal => refusal.code === "PROMOTION_OF_IGNORED_ENTRY"));

  const jaPromovida = planTerritoryPromotion({ brandId: BRAND, entry: entry({ territoryRef: REF_A }), decision });
  assert.ok(!jaPromovida.ok && jaPromovida.refusals.some(refusal => refusal.code === "PROMOTION_ALREADY_DONE"));

  const outraBrand = planTerritoryPromotion({ brandId: BRAND, entry: entry({ brandId: "brand-2" }), decision });
  assert.ok(!outraBrand.ok && outraBrand.refusals.some(refusal => refusal.code === "PROMOTION_CROSS_BRAND"));
});

/* --------------- D/E · declaração estratégica antes das keywords --------- */

test("D/E · MANUAL_STRATEGIC com zero e com uma KeywordDNA são representáveis", () => {
  const semKeyword = StrategicDeclarationSchema.parse({
    declarationId: "decl-1",
    brandId: BRAND,
    label: "Barreira cutânea",
    centralEntity: "barreira cutânea",
    macroIntent: "educar e converter sobre barreira cutânea",
    rationale: "Linha editorial estratégica declarada antes da mineração.",
    declaredBy: "user-1",
    declaredAt: NOW,
    ingestionOrigin: "ui",
    keywordDnaIds: [],
    territoryRef: null,
  });
  const comKeyword = StrategicDeclarationSchema.parse({ ...semKeyword, declarationId: "decl-2", keywordDnaIds: ["kw-1"] });

  assert.deepEqual(semKeyword.keywordDnaIds, [], "zero keyword é estado legítimo");
  assert.deepEqual(comKeyword.keywordDnaIds, ["kw-1"]);

  const base = buildTerritorialBase({
    brandId: BRAND,
    entries: [strategicDeclarationAsBaseEntry(semKeyword), strategicDeclarationAsBaseEntry(comKeyword)],
    evidence: [],
  });

  assert.equal(base.strategicDeclared.length, 2);
  // Declaração estratégica NÃO é território confirmado e não cria nada.
  assert.equal(base.strategicDeclared.every(item => item.decisionState === "pending"), true);
  assert.equal(base.strategicDeclared.every(item => item.territoryRef === null), true);
  assert.equal(base.strategicDeclared.every(item => item.existingSiloId === null), true);
  assert.equal(base.publishedConfirmed.length, 0);
});

/* --------------------- F · origens ortogonais ---------------------------- */

test("F · architecturalOrigin e ingestionOrigin são independentes", () => {
  const legadoPorCsv = entry({ architecturalOrigin: "existing", ingestionOrigin: "csv", publicationState: "published" });
  const estrategicoPorCsv = entry({ entryId: "entry-2", architecturalOrigin: "manual_strategic", ingestionOrigin: "csv", publicationState: "unpublished", decisionState: "pending", observationState: "unknown" });
  const descobertoPorUi = entry({ entryId: "entry-3", architecturalOrigin: "discovered", ingestionOrigin: "ui", publicationState: "unknown", decisionState: "pending", observationState: "unknown" });

  assert.equal(legadoPorCsv.architecturalOrigin, "existing");
  assert.equal(legadoPorCsv.ingestionOrigin, "csv");
  assert.equal(estrategicoPorCsv.architecturalOrigin, "manual_strategic");
  assert.equal(estrategicoPorCsv.ingestionOrigin, "csv");
  // CSV não decide arquitetura: mesma porta de entrada, origens diferentes.
  assert.notEqual(legadoPorCsv.architecturalOrigin, estrategicoPorCsv.architecturalOrigin);
  assert.equal(resolveBaseBucket(estrategicoPorCsv), "strategicDeclared");
  assert.equal(resolveBaseBucket(descobertoPorUi), "importedReconciliation");
});

test("os eixos de observação e decisão não compartilham vocabulário", () => {
  const observation = new Set<string>(BASE_OBSERVATION_STATES);
  const decision = new Set<string>(BASE_DECISION_STATES);
  const interseccao = [...observation].filter(value => decision.has(value));

  assert.deepEqual(interseccao, [], "observação, decisão e origem permanecem ortogonais");
});

/* ------------------ G/H/I · divergência site × banco --------------------- */

test("G · SITE_ONLY é representável sem inventar PublicationRecord", () => {
  const siteOnly = evidence({ evidenceId: "ev-site", observationState: "site_only", publicationRef: null, articleRef: null, siloRef: null });

  assert.equal(siteOnly.publicationRef, null);
  assert.equal(siteOnly.url !== null, true, "a URL observada permanece");
  // O contrato recusa fabricar o registro interno.
  assert.equal(
    PublishedStructureEvidenceSchema.safeParse({ ...siteOnly, publicationRef: "pub-inventado" }).success,
    false,
  );

  const base = buildTerritorialBase({
    brandId: BRAND,
    entries: [entry({ entryId: "site-only", observationState: "site_only", evidenceIds: ["ev-site"] })],
    evidence: [siteOnly],
  });
  assert.deepEqual(base.publishedUnresolved.map(item => item.entryId), ["site-only"]);
  assert.ok(codes(base).includes("PUBLISHED_UNRESOLVED"));
});

test("H · DATABASE_ONLY é representável sem inventar URL de sitemap", () => {
  const databaseOnly = evidence({
    evidenceId: "ev-db",
    source: "publication_record",
    observationState: "database_only",
    url: null,
    normalizedUrl: null,
    sitemapRef: null,
    publicationRef: "pub-1",
    provenance: { collectedBy: "publication", collectedAt: NOW, sourceRef: "pub-1" },
  });

  assert.equal(databaseOnly.url, null);
  assert.equal(databaseOnly.sitemapRef, null);
  assert.equal(
    PublishedStructureEvidenceSchema.safeParse({ ...databaseOnly, url: "https://marca.com/inventada/" }).success,
    false,
  );

  const base = buildTerritorialBase({
    brandId: BRAND,
    entries: [entry({ entryId: "db-only", observationState: "database_only", decisionState: "review_later", evidenceIds: ["ev-db"] })],
    evidence: [databaseOnly],
  });
  assert.ok(codes(base).includes("DATABASE_ONLY"), "registro sem URL vira issue, nunca exclusão");
  assert.deepEqual(base.importedReconciliation.map(item => item.entryId), ["db-only"]);
});

test("I · CONFLICTING é representável e não sofre autocorreção", () => {
  const conflito = evidence({
    evidenceId: "ev-conflito",
    observationState: "conflicting",
    canonical: "https://outro-dominio.com/pagina/",
    normalizedCanonical: "outro-dominio.com/pagina",
  });

  const base = buildTerritorialBase({
    brandId: BRAND,
    entries: [entry({ entryId: "conflito", observationState: "conflicting", decisionState: "needs_reconciliation", evidenceIds: ["ev-conflito"] })],
    evidence: [conflito],
  });

  assert.ok(codes(base).includes("CANONICAL_CONFLICT"));
  assert.equal(base.evidence[0].canonical, "https://outro-dominio.com/pagina/", "o canonical divergente é preservado como observado");
  assert.equal(base.evidence[0].url, conflito.url, "nada é reescrito");
});

test("URL correspondente a registro editorial fica MATCHED e não vira unresolved", () => {
  const base = buildTerritorialBase({
    brandId: BRAND,
    entries: [entry({ observationState: "matched", decisionState: "matched_existing_silo", existingSiloId: "silo-a", existingSiloPageId: "silo-page:silo-a" })],
    evidence: [evidence({ observationState: "matched", publicationRef: "pub-1", siloRef: "silo-a" })],
  });

  assert.deepEqual(base.publishedUnresolved, []);
  assert.equal(base.publishedConfirmed[0].existingSiloId, "silo-a");
  assert.equal(base.publishedConfirmed[0].existingSiloPageId, "silo-page:silo-a");
});

/* --------------------------- J/K · descoberta ---------------------------- */

test("J · centralEntity pode existir sem KeywordDNA literal", () => {
  const descoberto = TerritoryCandidateSchema.parse({
    schemaVersion: 1,
    territoryRef: REF_A,
    brandId: BRAND,
    existingSiloRef: null,
    name: "Barreira cutânea",
    centralEntity: "barreira cutânea",
    macroIntent: "sustentar autoridade sobre barreira cutânea",
    boundary: { includes: ["barreira cutânea"], excludes: ["acne"] },
    narrative: emptyTerritoryNarrative(),
    discovery: {
      discoveredBy: "serp",
      // A entidade central NÃO existe como KeywordDNA aprovada.
      centralEntityInKeywordUniverse: false,
      keywordSuggestions: [{
        suggestionId: "sug-1",
        text: "barreira cutânea",
        source: "serp",
        rationale: "Termo dominante na SERP sem KeywordDNA correspondente.",
        observedAt: NOW,
        status: "pending_minerador",
        keywordDnaId: null,
      }],
    },
    territoryKind: "new",
    architecturalOrigin: "discovered",
    ingestionOrigin: null,
    lifecycleStatus: "candidate",
    decisionState: "pending",
    publicationProtection: "unpublished",
    slugState: { proposals: [], confirmed: null, publishedSlug: null, publishedCanonical: null },
    lineage: emptyTerritoryLineage(),
    consolidation: null,
    pendingOperation: null,
    conflicts: [],
    reasons: ["Entidade central sustentada por evidência de mercado."],
    provenance: { producedBy: "serp", adoptedFromScenarioType: null, humanAdjustmentCount: 0, note: null },
  });

  assert.equal(descoberto.centralEntity, "barreira cutânea");
  assert.equal(descoberto.discovery.centralEntityInKeywordUniverse, false);
  assert.equal(descoberto.lifecycleStatus, "candidate", "descoberta não confirma território");
});

test("K · conceito de território descoberto não cria KeywordDNA", () => {
  const suggestion = {
    suggestionId: "sug-1",
    text: "barreira cutânea",
    source: "serp" as const,
    rationale: "Termo dominante na SERP sem KeywordDNA correspondente.",
    observedAt: NOW,
    status: "pending_minerador" as const,
    keywordDnaId: null,
  };

  assert.equal(suggestionUsableAsKeywordId(suggestion), null);
  assert.equal(suggestionUsableAsKeywordId({ ...suggestion, status: "sent_to_minerador" }), null);
  assert.equal(suggestionUsableAsKeywordId({ ...suggestion, status: "rejected", keywordDnaId: "kw-9" }), null);
  // Só depois que o Minerador devolve o KeywordDNA real a sugestão vira keyword.
  assert.equal(suggestionUsableAsKeywordId({ ...suggestion, status: "sent_to_minerador", keywordDnaId: "kw-9" }), "kw-9");
});

/* ----------------- L · narrativa não é similaridade lexical -------------- */

test("L · narrativa e fronteira são campos próprios, separados de similaridade", () => {
  const territory = (overrides: Record<string, unknown>) => TerritoryCandidateSchema.parse({
    schemaVersion: 1,
    territoryRef: REF_A,
    brandId: BRAND,
    existingSiloRef: null,
    name: "Barreira cutânea",
    centralEntity: "barreira cutânea",
    macroIntent: "autoridade sobre barreira cutânea",
    boundary: { includes: ["barreira cutânea"], excludes: ["acne"] },
    narrative: emptyTerritoryNarrative(),
    discovery: emptyTerritoryDiscovery(),
    territoryKind: "new",
    architecturalOrigin: "manual_strategic",
    ingestionOrigin: "ui",
    lifecycleStatus: "candidate",
    decisionState: "pending",
    publicationProtection: "unpublished",
    slugState: { proposals: [], confirmed: null, publishedSlug: null, publishedCanonical: null },
    lineage: emptyTerritoryLineage(),
    consolidation: null,
    pendingOperation: null,
    conflicts: [],
    reasons: ["motivo"],
    provenance: { producedBy: "human", adoptedFromScenarioType: null, humanAdjustmentCount: 0, note: null },
    ...overrides,
  });

  const coerente = territory({
    narrative: { statement: "Da barreira ao ritual diário de reparo.", continuity: "coherent", brandAlignment: "aligned", rationale: ["Sustenta a promessa da Marca."] },
  });
  // Mesma entidade central e mesma fronteira, narrativa oposta: são distinguíveis.
  const fragmentado = territory({
    narrative: { statement: null, continuity: "fragmented", brandAlignment: "off_strategy", rationale: ["Assuntos sem fio condutor."] },
  });

  assert.equal(coerente.centralEntity, fragmentado.centralEntity);
  assert.deepEqual(coerente.boundary, fragmentado.boundary);
  assert.notEqual(coerente.narrative.continuity, fragmentado.narrative.continuity);
  assert.notEqual(coerente.narrative.brandAlignment, fragmentado.narrative.brandAlignment);
  // Fronteira permanece separada da narrativa: excluir não é "não parecer".
  assert.deepEqual(coerente.boundary.excludes, ["acne"]);
  assert.equal(emptyTerritoryNarrative().continuity, "unknown", "sem avaliação, o padrão é desconhecido, não coerente");
});

/* ---------------------------- M · cross-brand ---------------------------- */

test("M · refs de outra Brand são recusadas e evidência duplicada é reportada", () => {
  const base = buildTerritorialBase({
    brandId: BRAND,
    entries: [entry({ evidenceIds: ["ev-1", "ev-inexistente"] }), entry({ entryId: "outra", brandId: "brand-2" })],
    evidence: [evidence({ evidenceId: "ev-1" }), evidence({ evidenceId: "ev-2" }), evidence({ evidenceId: "ev-outra", brandId: "brand-2" })],
  });

  assert.equal(base.evidence.some(item => item.brandId !== BRAND), false, "zero vazamento cross-brand");
  const todasEntradas = [...base.publishedConfirmed, ...base.strategicDeclared, ...base.importedReconciliation, ...base.publishedUnresolved];
  assert.equal(todasEntradas.some(item => item.brandId !== BRAND), false);
  assert.equal(codes(base).filter(code => code === "CROSS_BRAND_EVIDENCE").length, 2);
  assert.ok(codes(base).includes("DUPLICATE_EVIDENCE_URL"));
  assert.ok(codes(base).includes("EVIDENCE_WITHOUT_SOURCE"));
});

/* ----------------------------- pista de URL ------------------------------ */

test("URL técnica e URL editorial produzem pista, nunca decisão", () => {
  assert.equal(classifyUrlStructuralHint("/autor/fulano/"), "technical");
  assert.equal(classifyUrlStructuralHint("/tag/pele/"), "technical");
  assert.equal(classifyUrlStructuralHint("/page/2/"), "technical");
  assert.equal(classifyUrlStructuralHint("/2026/09/"), "technical");
  assert.equal(classifyUrlStructuralHint("/pele/barreira-cutanea/"), "editorial_candidate");
  assert.equal(classifyUrlStructuralHint("/barreira-da-pele/"), "editorial_candidate");
  assert.equal(classifyUrlStructuralHint(""), "unknown");

  const base = buildTerritorialBase({
    brandId: BRAND,
    entries: [
      entry({ entryId: "editorial", decisionState: "pending", evidenceIds: ["ev-editorial"] }),
      entry({ entryId: "tecnica", decisionState: "pending", evidenceIds: ["ev-tecnica"] }),
    ],
    evidence: [
      evidence({ evidenceId: "ev-editorial", path: "/barreira-da-pele/", normalizedUrl: "marca.com/barreira-da-pele", normalizedCanonical: "marca.com/barreira-da-pele", structuralHint: "editorial_candidate" }),
      evidence({ evidenceId: "ev-tecnica", path: "/autor/fulano/", normalizedUrl: "marca.com/autor/fulano", normalizedCanonical: "marca.com/autor/fulano", structuralHint: "technical" }),
    ],
  });

  // A pista não promove nem descarta: as duas continuam apenas evidência.
  const todas = [...base.publishedConfirmed, ...base.importedReconciliation];
  assert.equal(todas.length, 2);
  assert.equal(todas.every(item => item.territoryRef === null), true);
});

test("cada entrada cai em exatamente um recorte da Base", () => {
  const entries = BASE_DECISION_STATES.map((decisionState, index) =>
    entry({ entryId: `entry-${index}`, decisionState, observationState: "matched", evidenceIds: [] }));

  const base = buildTerritorialBase({ brandId: BRAND, entries, evidence: [] });

  const total = base.publishedConfirmed.length + base.strategicDeclared.length
    + base.importedReconciliation.length + base.publishedUnresolved.length;
  assert.equal(total, BASE_DECISION_STATES.length, "nenhuma entrada some, nenhuma duplica");
});

/* ---------------------------- afinidade e resíduo ------------------------ */

test("resíduo isola só o que não casou; território novo exige justificativa", () => {
  const affinity = (keywordId: string, affinity: KeywordTerritorialAffinity["affinity"], reason: string): KeywordTerritorialAffinity =>
    ({ keywordId, brandId: BRAND, affinity, territoryRef: null, existingSiloId: null, reason, source: "logic" });

  const residue = resolveTerritorialResidue([
    affinity("kw-1", "match_existing", "cabe no Silo existente"),
    affinity("kw-2", "expand_existing", "expande o existente"),
    affinity("kw-3", "match_strategic", "cabe no território estratégico"),
    affinity("kw-4", "no_match", "sem território adequado"),
    affinity("kw-5", "ambiguous", "dois territórios possíveis"),
    affinity("kw-6", "conflicting", "conflita com fronteira publicada"),
  ]);

  assert.deepEqual(residue.absorbedKeywordIds, ["kw-1", "kw-2", "kw-3"]);
  assert.deepEqual(residue.residualKeywordIds, ["kw-4", "kw-5", "kw-6"]);
  assert.deepEqual(residue.byAffinity.no_match, ["kw-4"]);
  assert.deepEqual(residue.byAffinity.ambiguous, ["kw-5"]);
  assert.deepEqual(residue.byAffinity.conflicting, ["kw-6"]);
  assert.equal(residue.newTerritoryJustificationRequired, true);
});

test("universo inteiro absorvido pelos territórios existentes não pede território novo", () => {
  const residue = resolveTerritorialResidue([
    { keywordId: "kw-1", brandId: BRAND, affinity: "match_existing", territoryRef: REF_A, existingSiloId: "silo-a", reason: "cabe", source: "logic" },
    { keywordId: "kw-2", brandId: BRAND, affinity: "expand_existing", territoryRef: REF_A, existingSiloId: "silo-a", reason: "expande", source: "logic" },
  ]);

  assert.deepEqual(residue.residualKeywordIds, []);
  assert.equal(residue.newTerritoryJustificationRequired, false, "clustering global não é objetivo");
});

/* -------------------------- ordem dos processos -------------------------- */

test("a ordem territorial é operacional e não é cadeia de sobrescrita", () => {
  assert.deepEqual([...TERRITORY_PROCESS_ORDER], ["logic", "ai", "serp", "human"]);
  assert.equal(nextTerritoryProcess("logic"), "ai");
  assert.equal(nextTerritoryProcess("ai"), "serp");
  assert.equal(nextTerritoryProcess("serp"), "human");
  assert.equal(nextTerritoryProcess("human"), null);

  assert.equal(processMayMutateScenario("ai", "logic"), false, "IA não muta o cenário da Lógica");
  assert.equal(processMayMutateScenario("serp", "ai"), false, "SERP não muta o cenário da IA");
  assert.equal(processMayMutateScenario("human", "serp"), false, "Humano não reescreve evidência histórica");
  assert.equal(processMayMutateScenario("logic", "logic"), true);
});

/* -------------------------- limites desta fase --------------------------- */

test("Base Territorial é contrato puro: sem rede, sem storage, sem DDL", () => {
  const modulo = readFileSync("lib/arquiteto/territorial-base.ts", "utf8");

  assert.doesNotMatch(modulo, /fetch\(|supabase|crawl|https?:\/\//i);
  assert.doesNotMatch(modulo, /artifact_type|brand_site_|publication_records|minerador_keyword_lists/);
  assert.doesNotMatch(modulo, /localhost|care-glow/i);
});
