import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { FakeCanonicalDatabase, fakePipelineContext } from "./arquiteto-backup-roundtrip.fixture.ts";
import {
  applyArquitetoRestore,
  compareCanonicalStates,
  planArquitetoRestore,
  readCanonicalRestoreState,
  compareFingerprints,
  fingerprintCanonicalState,
  semanticShape,
  type CanonicalRestoreState,
} from "../lib/server/arquiteto-backup-restore.ts";
import { appendArquitetoArtifact } from "../lib/server/arquiteto-persistence.ts";
import { createTerritoryWorkflowItem } from "../lib/server/arquiteto-territory-store.ts";

import { WorkflowRepository } from "../lib/server/pipeline-repositories.ts";
import { buildArquitetoBackupFile } from "../lib/arquiteto/backup-export.ts";
import { parseBackup, serializeBackup } from "../lib/arquiteto/backup-contract.ts";
import { remapReferences } from "../lib/arquiteto/backup-restore.ts";
import { anchorDraftForExistingStructure } from "../lib/arquiteto/silo-assignment.ts";
import type { ArquitetoExportInput } from "../lib/arquiteto/export-source.ts";
import type { ArticleDNA, SiloDNA, SiloPage, VersionEnvelope, VersionReference } from "../lib/arquiteto/contracts.ts";

const BRAND = "550e8400-e29b-41d4-a716-446655440000";
const ACTOR = "550e8400-e29b-41d4-a716-446655440001";
const AT = "2026-09-13T12:00:00.000Z";
const sha = (c: string) => `sha256:${c.repeat(64)}` as VersionReference["contentHash"];

function envelope<T>(entityId: string, versionId: string, c: string, payload: T): VersionEnvelope<T> {
  return { versionId, entityId, versionNumber: 1, previousVersionId: null, contentHash: sha(c), origin: "human", changeReason: "Consolidação humana", createdAt: AT, createdBy: ACTOR, payload };
}

function keywordReference(keywordId: string, role: ArticleDNA["keywordReferences"][number]["role"], keyword: string) {
  return {
    keywordId, keywordDnaVersionId: `legacy:${keywordId}:v1`, keywordDnaContentHash: `legacy:${keywordId}`, role,
    strategicContribution: "Contribuição declarada", coveredIntentions: ["informativa"], requiredTopics: [], excludedTopics: [],
    classificationOrigin: "human" as const, confidence: 0.8, humanConfirmed: true, volume: 2400, resultCount: 373, kgrScore: 0.155,
    keywordDnaSnapshot: {
      brandId: BRAND, keywordId, capturedAt: AT,
      versionReference: { entityId: keywordId, versionId: `legacy:${keywordId}:v1`, contentHash: sha("e") },
      payload: {
        schemaVersion: 1 as const, keywordId, searchIntent: "informational" as const, likelyEditorialType: "guide" as const,
        centralEntity: "skincare", modifiers: ["pele oleosa"], audience: "Pessoas com pele oleosa", perceivedProblem: "Oleosidade",
        desiredResult: "Pele equilibrada", awarenessLevel: "consciente", journeyStage: "TOFU", objections: [], dominantEmotion: "frustração",
        commercialPotential: "medium" as const, affiliatePotential: "none" as const, reviewCandidate: false, productResearchRequired: false,
        stampOrigin: "human" as const, confidence: 0.8, humanConfirmed: true, volumeSearch: 2400, resultCount: 373, kgrScore: 0.155,
      },
      sourceKeywordSnapshot: { keyword },
    },
  } as ArticleDNA["keywordReferences"][number];
}

function articleDna(articleId: string, keyword: string, hierarchy: ArticleDNA["hierarchy"], slug: string): ArticleDNA {
  return {
    schemaVersion: 1, articleId, brandId: BRAND, principalKeywordId: `${articleId}-kw-1`,
    secondaryKeywordIds: [`${articleId}-kw-2`], narrativeReinforcementIds: [],
    keywordReferences: [keywordReference(`${articleId}-kw-1`, "principal", keyword), keywordReference(`${articleId}-kw-2`, "secundaria", `${keyword} passo a passo`)],
    siloId: "silo-1", hierarchy, suggestedSlug: slug, canonical: null, mainIntent: "Aprender o essencial", auxiliaryIntents: [],
    audience: "Pessoas com pele oleosa", problem: "Rotina inadequada", desiredResult: "Pele equilibrada", journeyStage: "TOFU",
    brandObjective: "Autoridade orgânica", promise: "Uma rotina que funciona", angle: "Rotina simples", cta: "Ver a rotina",
    coverage: ["limpeza"], excludedSubjects: [], antiCannibalizationBoundary: "Não ensinar procedimento clínico",
    nearbyArticleIds: [], differentiation: [], entities: ["skincare"], requiredTopics: ["limpeza"], questions: [], objections: [],
    evidenceNeeded: [], sourcesNeeded: [], internalLinks: [], alerts: [], confidence: 0.82, humanPendingDecisions: [],
  };
}

const siloDna: SiloDNA = {
  schemaVersion: 1, formationStatus: "formed", siloId: "silo-1", brandId: BRAND, name: "Skincare",
  centralEntity: "skincare", objective: "Autoridade orgânica", audience: "Pessoas com pele oleosa", macroProblem: "Rotina inadequada",
  dominantIntent: "Informativo", pillarArticleId: "article-a", supportArticleIds: ["article-b"],
  articleReferences: [
    { articleId: "article-a", articleDnaVersionId: "article-a-v1", articleDnaContentHash: sha("c"), role: "Pilar" },
    { articleId: "article-b", articleDnaVersionId: "article-b-v1", articleDnaContentHash: sha("d"), role: "Suporte" },
  ],
  articleRoles: [], narrativeOrder: ["article-a", "article-b"], linkMap: [], boundary: "Skincare para pele oleosa",
  includedTopics: ["limpeza"], excludedTopics: [], nearbySiloIds: [], possibleConflicts: [], gaps: [], nextContents: [],
  confidence: 0.8, humanPendingDecisions: [], hierarchySignals: [],
};

function siloPage(siloDnaVersionId: string, contentHash: VersionReference["contentHash"]): SiloPage {
  return {
    schemaVersion: 1, formationStatus: "formed", siloPageId: "silo-page:silo-1", brandId: BRAND,
    siloDnaRef: { entityId: "silo-1", versionId: siloDnaVersionId, contentHash },
    siloId: "silo-1", slug: "skincare", publicationStatus: "new", publishedUrl: null,
    publicationVerification: { status: "not_applicable", checkedAt: null, requestedUrl: null, resolvedUrl: null, declaredCanonical: null, httpStatus: null, sitemapUrl: null, sitemapMatch: null, message: null },
    h1: "Skincare", seoTitle: "Skincare: o guia", metaDescription: "Rotina de skincare.", canonical: null, intro: "Introdução",
    sections: [], cta: "Ver a rotina", coverImageBrief: "Rosto", visualBriefing: "Luz natural", breadcrumbs: [],
    pillarArticleId: "article-a", supportArticleIds: ["article-b"], indexationStatus: "index", alerts: [], confidence: 0.8, humanPendingDecisions: [],
  };
}

/**
 * O draft do território sai do MESMO construtor que a mesa usa, e sem
 * `territoryRef`: a identidade é emitida pelo servidor. É essa emissão que
 * torna o território o caso de REMAP do roundtrip.
 */
const territoryDraft = anchorDraftForExistingStructure({
  structure: {
    siloId: "silo-1",
    name: "Skincare",
    slug: "skincare",
    isPublished: false,
    sourceEntityId: "silo-1",
    versionId: "silo-dna-v1",
    contentHash: sha("b"),
  } as never,
  actorReason: "Ancorar o território no Silo existente.",
});

/** Semeia o estado A chamando os writers canônicos, um a um. */
async function seedStateA(database: FakeCanonicalDatabase) {
  const context = fakePipelineContext(database, BRAND, ACTOR, "create");
  const dna = await appendArquitetoArtifact(context, "silo_dna", envelope("silo-1", "silo-dna-v1", "b", siloDna), "approved");
  const articleA = await appendArquitetoArtifact(context, "article_dna", envelope("article-a", "article-a-v1", "c", articleDna("article-a", "skincare para pele oleosa", "Pilar", "para-pele-oleosa")), "approved");
  await appendArquitetoArtifact(context, "article_dna", envelope("article-b", "article-b-v1", "d", articleDna("article-b", "skin care noturno", "Suporte", "noturno")), "proposed");
  await appendArquitetoArtifact(context, "silo_page", envelope("silo-page:silo-1", "silo-page-v1", "a", siloPage(dna.version.versionId, dna.version.contentHash)), "approved");

  const territoryRef = (await createTerritoryWorkflowItem(context, territoryDraft)).territoryRef;

  // Status operacional pelo mesmo repositório que a rota usa.
  await new WorkflowRepository(context).create({
    subjectType: "article", subjectId: "article-a", articleId: "article-a", stage: "architect",
    state: "PRONTO_PARA_RADAR", sourceEntityId: "article-a", payload: {},
  });
  return { territoryRef, articleAVersionId: articleA.version.versionId };
}

function backupInputFromState(state: CanonicalRestoreState): ArquitetoExportInput {
  const statusOf = new Map(state.artifacts.statuses.map(item => [item.versionId, item.status]));
  const siloPages = new Map(state.artifacts.siloPages.map(version => [version.payload.siloId, version]));
  const workflowStatus = new Map(
    state.workflowItems
      .filter(row => String(row.stage) === "architect" && String(row.subject_type) === "article")
      .map(row => [String(row.subject_id), String(row.state)]),
  );
  return {
    brandId: BRAND,
    brandLabel: "Care Glow",
    silos: state.artifacts.siloDnas.map(siloDnaVersion => ({
      siloDna: siloDnaVersion,
      siloPage: siloPages.get(siloDnaVersion.payload.siloId) ?? null,
      graph: null,
    })),
    articles: state.artifacts.articleDnas,
    aiReviews: state.artifacts.aiReviews as unknown as VersionEnvelope<Record<string, unknown>>[],
    territories: state.territories.map(item => ({ territoryRef: item.territoryRef, territory: item.territory as unknown as Record<string, unknown> })),
    territorialSerp: state.territorialSerp.map(item => ({ questionId: item.questionId, payload: item.payload as unknown as Record<string, unknown> })),
    articleFormationSerp: state.articleFormationSerp.map(item => ({ candidateRef: item.candidateRef, payload: item.payload as unknown as Record<string, unknown> })),
    territorialAi: state.territorialAi.map(item => ({ questionId: item.questionId, payload: item.payload as unknown as Record<string, unknown> })),
    architectureMarker: (state.architectureMarker?.payload as unknown as Record<string, unknown>) ?? null,
    articleFormationMarker: (state.articleFormationMarker?.payload as unknown as Record<string, unknown>) ?? null,
    versionStatusOf: versionId => statusOf.get(versionId) ?? null,
    workflowStatusOf: articleId => workflowStatus.get(articleId) ?? null,
    now: new Date(AT),
  };
}

/* ============================== o roundtrip ============================= */

test("estado A → export → ambiente vazio → restore → estado B equivalente", async () => {
  const origem = new FakeCanonicalDatabase();
  await seedStateA(origem);
  const stateA = await readCanonicalRestoreState(fakePipelineContext(origem, BRAND, ACTOR, "view"));
  assert.equal(stateA.artifacts.articleDnas.length, 2);
  assert.equal(stateA.artifacts.siloDnas.length, 1);
  assert.equal(stateA.artifacts.siloPages.length, 1);

  // O arquivo atravessa serialização e parse: o roundtrip é do FORMATO também.
  const file = parseBackup(serializeBackup(buildArquitetoBackupFile(backupInputFromState(stateA))));

  const destino = new FakeCanonicalDatabase();
  const alvo = fakePipelineContext(destino, BRAND, ACTOR, "edit");
  const plano = await planArquitetoRestore(alvo, file);
  assert.equal(plano.counts.CONFLICT, 0, plano.summary);
  assert.equal(plano.counts.BLOCKED, 0, plano.summary);
  assert.equal(plano.executable, true, plano.summary);
  assert.equal(plano.entries.every(entry => entry.outcome === "CREATE" || entry.outcome === "REMAP"), true);

  const resultado = await applyArquitetoRestore(alvo, file);
  assert.equal(resultado.readback.equivalent, true, JSON.stringify(resultado.readback.differences.slice(0, 3)));
  assert.equal(resultado.readback.checked, file.records.length);

  const stateB = await readCanonicalRestoreState(fakePipelineContext(destino, BRAND, ACTOR, "view"));
  const comparacao = compareCanonicalStates(stateA, stateB, new Map(Object.entries(resultado.identityMap)));
  assert.equal(comparacao.equivalent, true, JSON.stringify(comparacao.differences.slice(0, 3)));

  // O conteúdo bate de verdade, não só a contagem.
  assert.equal(stateB.artifacts.articleDnas.length, 2);
  assert.deepEqual(
    semanticShape(stateB.artifacts.siloDnas[0].payload),
    semanticShape(stateA.artifacts.siloDnas[0].payload),
  );
  const statusB = new Map(stateB.workflowItems.filter(row => String(row.subject_type) === "article").map(row => [String(row.subject_id), String(row.state)]));
  assert.equal(statusB.get("article-a"), "PRONTO_PARA_RADAR");

  // REMAP de verdade: o território voltou com identidade NOVA, emitida pelo
  // servidor, e o mapa registra a troca em vez de despejar o id antigo.
  const territorioA = stateA.territories[0];
  const territorioB = stateB.territories[0];
  assert.ok(territorioA && territorioB);
  assert.notEqual(territorioB.territoryRef, territorioA.territoryRef);
  assert.equal(resultado.identityMap[territorioA.territoryRef], territorioB.territoryRef);
  assert.equal(destino.rows("editorial_workflow_items").some(row => row.subject_id === territorioA.territoryRef), false, "o id antigo não pode aparecer no destino");
  // E o conteúdo do território é o mesmo, tirando a própria referência.
  assert.deepEqual(
    semanticShape({ ...(territorioB.territory as unknown as Record<string, unknown>), territoryRef: null }),
    semanticShape({ ...(territorioA.territory as unknown as Record<string, unknown>), territoryRef: null }),
  );
});

test("restaurar o mesmo backup duas vezes é idempotente: nenhuma sucessora, nenhuma duplicata", async () => {
  const origem = new FakeCanonicalDatabase();
  await seedStateA(origem);
  const stateA = await readCanonicalRestoreState(fakePipelineContext(origem, BRAND, ACTOR, "view"));
  const file = parseBackup(serializeBackup(buildArquitetoBackupFile(backupInputFromState(stateA))));

  const destino = new FakeCanonicalDatabase();
  const alvo = fakePipelineContext(destino, BRAND, ACTOR, "edit");
  await applyArquitetoRestore(alvo, file);
  const depoisDaPrimeira = await readCanonicalRestoreState(fakePipelineContext(destino, BRAND, ACTOR, "view"));
  const versoesDepoisDaPrimeira = destino.rows("editorial_artifact_versions").length;

  const segundoPlano = await planArquitetoRestore(alvo, file);
  assert.equal(segundoPlano.counts.CREATE, 0, segundoPlano.summary);
  assert.equal(segundoPlano.counts.CONFLICT, 0, segundoPlano.summary);
  assert.equal(segundoPlano.entries.every(entry => entry.outcome === "NO_OP"), true, segundoPlano.summary);

  const segundaAplicacao = await applyArquitetoRestore(alvo, file);
  assert.equal(segundaAplicacao.applied.every(entry => entry.outcome === "NO_OP"), true);
  assert.equal(destino.rows("editorial_artifact_versions").length, versoesDepoisDaPrimeira, "a segunda restauração não pode criar versão sucessora");

  const depoisDaSegunda = await readCanonicalRestoreState(fakePipelineContext(destino, BRAND, ACTOR, "view"));
  assert.equal(compareCanonicalStates(depoisDaPrimeira, depoisDaSegunda).equivalent, true);
  assert.equal(compareCanonicalStates(stateA, depoisDaSegunda).equivalent, true);
});

test("identidade divergente sob o mesmo nome vira CONFLICT e nada é aplicado", async () => {
  const origem = new FakeCanonicalDatabase();
  await seedStateA(origem);
  const stateA = await readCanonicalRestoreState(fakePipelineContext(origem, BRAND, ACTOR, "view"));
  const file = parseBackup(serializeBackup(buildArquitetoBackupFile(backupInputFromState(stateA))));

  // O destino já tem um ArticleDNA com a MESMA identidade e outro conteúdo.
  const destino = new FakeCanonicalDatabase();
  const alvo = fakePipelineContext(destino, BRAND, ACTOR, "edit");
  const divergente = articleDna("article-a", "skincare para pele oleosa", "Pilar", "outro-endereco");
  await appendArquitetoArtifact(fakePipelineContext(destino, BRAND, ACTOR, "create"), "article_dna", envelope("article-a", "outra-versao", "f", divergente), "approved");

  const plano = await planArquitetoRestore(alvo, file);
  const conflito = plano.entries.find(entry => entry.recordType === "ARTICLE_DNA" && entry.recordKey === "article-a");
  assert.equal(conflito?.outcome, "CONFLICT");
  assert.match(conflito?.reason || "", /Nada é sobrescrito em silêncio/);
  assert.equal(plano.executable, false);

  const antes = destino.rows("editorial_artifact_versions").length;
  await assert.rejects(() => applyArquitetoRestore(alvo, file), /recusada/i);
  assert.equal(destino.rows("editorial_artifact_versions").length, antes, "um plano recusado não pode gravar nada");
});

test("o readback é a prova: mutation bem-sucedida com conteúdo divergente reprova", async () => {
  const origem = new FakeCanonicalDatabase();
  await seedStateA(origem);
  const stateA = await readCanonicalRestoreState(fakePipelineContext(origem, BRAND, ACTOR, "view"));
  const file = parseBackup(serializeBackup(buildArquitetoBackupFile(backupInputFromState(stateA))));

  const destino = new FakeCanonicalDatabase();
  const alvo = fakePipelineContext(destino, BRAND, ACTOR, "edit");
  const resultado = await applyArquitetoRestore(alvo, file);
  assert.equal(resultado.readback.equivalent, true);

  // Alguém adultera a linha depois da escrita: o readback tem de perceber.
  const linha = destino.rows("editorial_artifact_versions").find(row => row.entity_id === "silo-1");
  assert.ok(linha);
  (linha.payload as Record<string, unknown>).boundary = "fronteira trocada por fora";
  const segundaConferencia = await applyArquitetoRestore(alvo, file).catch(error => error as Error);
  // A divergência aparece como conflito no plano ou como diferença no readback;
  // em nenhum dos dois caminhos a restauração se declara bem-sucedida.
  const reprovou = segundaConferencia instanceof Error
    || segundaConferencia.readback.equivalent === false;
  assert.equal(reprovou, true);
});

test("o restore não faz INSERT genérico: cada tipo entra pelo writer canônico", () => {
  const codigo = readFileSync(new URL("../lib/server/arquiteto-backup-restore.ts", import.meta.url), "utf8");
  for (const writer of [
    "appendArquitetoArtifact", "createTerritoryWorkflowItem", "createSiloWorkingCopy",
    "saveTerritorialSerpAssessment", "saveArticleFormationSerpAssessment", "saveTerritorialAiProposal",
    "saveArchitectureMarker", "saveArticleFormationMarker", "persistInternalLinkGraph",
    "persistInternalLinkGraphWorkingCopy", "WorkflowRepository",
  ]) {
    assert.equal(codigo.includes(writer), true, `a restauração precisa usar o writer canônico ${writer}`);
  }
  // Nenhum INSERT direto em tabela para "fazer funcionar".
  assert.equal(/\.from\((["'`])[a-z_]+\1\)[\s\S]{0,80}\.insert\(/.test(codigo), false, "a restauração não pode inserir direto em tabela");
});

/* ======================= troca de Brand (homologação) ==================== */

const BRAND_VAZIA = "550e8400-e29b-41d4-a716-4466554400ff";

test("restaurar em outra Brand exige decisão explícita", async () => {
  const origem = new FakeCanonicalDatabase();
  await seedStateA(origem);
  const stateA = await readCanonicalRestoreState(fakePipelineContext(origem, BRAND, ACTOR, "view"));
  const file = parseBackup(serializeBackup(buildArquitetoBackupFile(backupInputFromState(stateA))));

  const destino = new FakeCanonicalDatabase();
  const alvo = fakePipelineContext(destino, BRAND_VAZIA, ACTOR, "edit");
  const semDecisao = await planArquitetoRestore(alvo, file);
  assert.equal(semDecisao.issues.some(issue => issue.code === "CROSS_BRAND_RESTORE"), true);
  assert.equal(semDecisao.executable, false);
  assert.equal(semDecisao.entries.every(entry => entry.outcome === "BLOCKED"), true);
  await assert.rejects(() => applyArquitetoRestore(alvo, file), /recusada/i);
  assert.equal(destino.rows("editorial_artifact_versions").length, 0);
});

test("com a decisão explícita, a Brand nova recebe tudo e nenhum UUID antigo é reutilizado", async () => {
  const origem = new FakeCanonicalDatabase();
  await seedStateA(origem);
  const stateA = await readCanonicalRestoreState(fakePipelineContext(origem, BRAND, ACTOR, "view"));
  const file = parseBackup(serializeBackup(buildArquitetoBackupFile(backupInputFromState(stateA))));
  const idsAntigos = new Set(origem.rows("editorial_artifact_versions").map(row => String(row.version_id)));

  const destino = new FakeCanonicalDatabase();
  const alvo = fakePipelineContext(destino, BRAND_VAZIA, ACTOR, "edit");
  const opcoes = { allowCrossBrand: true };

  const plano = await planArquitetoRestore(alvo, file, opcoes);
  assert.equal(plano.sourceBrandId, BRAND);
  assert.equal(plano.brandId, BRAND_VAZIA);
  assert.equal(plano.issues.some(issue => issue.code === "CROSS_BRAND_ACCEPTED"), true);
  assert.equal(plano.executable, true, plano.summary);

  const resultado = await applyArquitetoRestore(alvo, file, opcoes);
  assert.equal(resultado.readback.equivalent, true, JSON.stringify(resultado.readback.differences.slice(0, 3)));

  // Nenhum identificador de versão da Brand de origem sobreviveu.
  for (const row of destino.rows("editorial_artifact_versions")) {
    assert.equal(idsAntigos.has(String(row.version_id)), false, "a identidade de versão precisa ser reemitida na troca de Brand");
    assert.equal(row.marca_id, BRAND_VAZIA);
    assert.equal((row.payload as { brandId: string }).brandId, BRAND_VAZIA);
  }

  // O conteúdo continua equivalente, ignorando só o que é do ambiente.
  const stateB = await readCanonicalRestoreState(fakePipelineContext(destino, BRAND_VAZIA, ACTOR, "view"));
  // O fingerprint de A atravessa o mapa de identidade: comparar a identidade
  // antiga com a reemitida reprovaria justamente a restauração correta.
  const identidade = new Map(Object.entries(resultado.identityMap));
  const antes = await fingerprintCanonicalState(stateA, { ignoreEnvironment: true, identity: identidade });
  const depois = await fingerprintCanonicalState(stateB, { ignoreEnvironment: true });
  const comparacao = compareFingerprints(antes, depois);
  assert.equal(comparacao.equivalent, true, JSON.stringify(comparacao.differences));
  assert.equal(antes.digest, depois.digest);

  // E as relações continuam de pé: o SiloDNA restaurado aponta para os mesmos artigos.
  const siloB = stateB.artifacts.siloDnas[0];
  assert.equal(siloB.payload.pillarArticleId, "article-a");
  assert.deepEqual(siloB.payload.supportArticleIds, ["article-b"]);
  const pageB = stateB.artifacts.siloPages[0];
  assert.equal(pageB.payload.siloDnaRef.versionId, siloB.versionId, "a SiloPage precisa apontar para o SiloDNA RESTAURADO");
});

test("a segunda restauração na Brand nova é toda NO_OP", async () => {
  const origem = new FakeCanonicalDatabase();
  await seedStateA(origem);
  const stateA = await readCanonicalRestoreState(fakePipelineContext(origem, BRAND, ACTOR, "view"));
  const file = parseBackup(serializeBackup(buildArquitetoBackupFile(backupInputFromState(stateA))));

  const destino = new FakeCanonicalDatabase();
  const alvo = fakePipelineContext(destino, BRAND_VAZIA, ACTOR, "edit");
  const opcoes = { allowCrossBrand: true };
  await applyArquitetoRestore(alvo, file, opcoes);
  const versoes = destino.rows("editorial_artifact_versions").length;
  const itens = destino.rows("editorial_workflow_items").length;

  const segundo = await planArquitetoRestore(alvo, file, opcoes);
  assert.equal(segundo.counts.CREATE, 0, segundo.summary);
  assert.equal(segundo.counts.CONFLICT, 0, segundo.summary);
  assert.equal(segundo.counts.BLOCKED, 0, segundo.summary);
  assert.equal(segundo.counts.REMAP, 0, segundo.summary);
  assert.equal(segundo.counts.NO_OP, segundo.entries.length, segundo.summary);

  await applyArquitetoRestore(alvo, file, opcoes);
  assert.equal(destino.rows("editorial_artifact_versions").length, versoes);
  assert.equal(destino.rows("editorial_workflow_items").length, itens);
});
