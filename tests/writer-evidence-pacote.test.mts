import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { ContentDocumentSchema } from "../lib/arquiteto/contracts.ts";
import { createMockPlanAndDocument } from "../lib/editorial/providers.ts";
import { CAROUSEL_SEED_SYSTEM_PROMPT, SCRIPT_SEED_SYSTEM_PROMPT } from "../lib/redator/deliverable-seed.ts";
import { guardianDivergenceCategory, runGuardian } from "../lib/redator/guardian.ts";
import { buildImprovePrompt, buildSectionWritingPrompt, createSectionPromptContext, IMPROVE_SYSTEM_PROMPT, SECTION_WRITING_SYSTEM_PROMPT } from "../lib/redator/prompts.ts";
import { WRITER_BUNDLE_KNOWN_PATHS, writerEvidenceJsonBytes } from "../lib/redator/writer-evidence-catalog.ts";
import {
  WriterDivergenceRequestSchema,
  resolveWriterDivergenceTarget,
  writerDivergenceDedupeKey,
  writerDivergenceRow,
  writerOpenDivergenceFromRow,
} from "../lib/redator/writer-evidence-divergence.ts";
import {
  buildWriterSectionEvidencePackage,
  WriterSectionProviderSchema,
  writerSectionScore,
  writerSectionSourceOf,
  writerAlertRegistrationNotice,
  writerSectionTokens,
  WRITER_SECTION_BUNDLE_PATHS,
  WRITER_SECTION_PACKAGE_MAX_BYTES,
  type WriterSectionMaterial,
} from "../lib/redator/writer-section-evidence.ts";

/*
 * ETAPA B2 · o que é puro: o pacote da IA interna, o contrato da divergência,
 * o Guardião com divergências e as instruções da IA. SDD do leitor de
 * evidências §4.4, §4.5, §5 e §9; adendo D1, D5 e D9.
 */

type Linha = Record<string, unknown>;
const OBSERVADO_EM = "2026-09-14T23:49:44.887Z";
const longo = (indice: number) => `texto de concorrente ${indice} ${"x".repeat(900)}`;

function materialGrande(autoritativa = true): WriterSectionMaterial {
  return {
    documentId: "writer:doc", articleId: "artigo", documentHash: "hash-doc",
    writerMayNot: ["trocar a keyword principal"],
    keywordContext: { principal: "rotina pele oleosa", secondary: [], narrativeReinforcements: [], resolution: "resolvida" },
    bundle: { bundleId: "bundle:1", bundleHash: "bundle-hash:1", researchProfile: "GOOGLE", observedAt: OBSERVADO_EM, serpAuthoritative: autoritativa },
    article: { versionId: "artigo-v1", contentHash: "sha256:a", fields: { promise: "Rotina simples", mainIntent: "informacional" } },
    pendingDecisions: [{ id: "p1", label: "Capa", blocking: false, reason: "Sem banco de imagens." }],
    sections: {
      "observed.questions": Array.from({ length: 200 }, (_, indice) => ({
        id: `q${indice}`, canonicalQuestion: indice === 150 ? "Protetor solar com niacinamida funciona?" : `Pergunta genérica ${indice} ${"p".repeat(200)}?`,
        variants: [], pages: 10 - (indice % 10), status: "RECURRENT_QUESTION", declaredByArticle: false,
      })),
      "observed.gaps": Array.from({ length: 100 }, (_, indice) => ({ subject: `lacuna ${indice}`, against: "MARKET", pagesCovering: 3, sampleSize: 10, evidence: longo(indice) })),
      "observed.entities": { article: ["niacinamida"], shared: Array.from({ length: 200 }, (_, indice) => ({ label: `entidade ${indice}`, pages: 3, evidence: longo(indice) })), related: [], marketOnly: [] },
      "observed.authorityEvidence.claims": Array.from({ length: 100 }, (_, indice) => ({
        claimId: `c${indice}`, canonicalClaim: indice === 70 ? "Niacinamida reduz a oleosidade sob o protetor solar" : `afirmação ${indice} ${"a".repeat(250)}`,
        claimType: "EFFECT", ymyl: { relevance: "MATERIAL" }, market: { recurrence: "STRONG" }, confidence: "MEDIUM",
      })),
      "observed.authorityEvidence.marketVsFactConflicts": Array.from({ length: 40 }, (_, indice) => ({ claimId: `m${indice}`, canonicalClaim: `conflito ${indice}`, marketObservation: longo(indice), factualPosition: longo(indice), impact: longo(indice) })),
      "observed.competitors": Array.from({ length: 100 }, (_, indice) => ({ url: `https://c${indice}.test`, domain: `c${indice}.test`, title: `Título ${indice} ${"t".repeat(300)}`, ranks: [{ rank: 100 - indice }] })),
      specialist: { preparedRequirements: 2, notApproved: 0, rejected: 1, items: [{ requirementId: "r1", requirementQuestion: "Protetor solar com niacinamida serve para pele oleosa?", extractedSummary: "Sim, com textura leve.", editorialUse: "citar como orientação", quote: null, humanDecision: "ACCEPTED", expert: { displayName: "Dra. Ana" } }] },
      video: { summary: { briefs: 1 }, results: [{ topic: "Protetor solar na rotina", state: "SUPPORTED", relatedSectionTitle: "Protetor", extracts: [1, 2] }] },
      conflicts: [{ descricao: "c".repeat(900) }],
      limitations: ["amostra de 10 páginas"],
    },
    absent: [],
  };
}

const foco = { kind: "section" as const, id: "h2-protetor", label: "Protetor solar com niacinamida" };

/* ================================ pacote ================================ */

test("pacote · ≤ 24 kB com dossiê enorme; o que casa com a seção vem primeiro; cortes dizem quanto ficou e onde ler", () => {
  const pacote = buildWriterSectionEvidencePackage(materialGrande(), foco)!;
  assert.ok(pacote, "o pacote coube");
  assert.ok(writerEvidenceJsonBytes(pacote) <= WRITER_SECTION_PACKAGE_MAX_BYTES, `${writerEvidenceJsonBytes(pacote)} B`);
  assert.equal(pacote.questions[0].question, "Protetor solar com niacinamida funciona?");
  assert.ok(pacote.questions[0].matchesSection);
  assert.equal(pacote.claims[0].claimId, "c70");
  assert.equal(pacote.specialist?.items.length, 1, "a especialista cede por último");
  assert.equal(pacote.video?.results[0].matchesSection, true);
  const cortes = new Map(pacote.trimmed.map(item => [item.field, item]));
  assert.equal(cortes.get("questions")?.total, 200);
  assert.equal(cortes.get("questions")?.readAt, "radar.bundle.observed.questions");
  assert.equal(cortes.get("competitors")?.total, 100);
  assert.ok((cortes.get("competitors")?.kept ?? 99) <= 5);
  assert.equal(cortes.get("entities.observed")?.readAt, "radar.bundle.observed.entities");
  assert.ok(pacote.gaps.every(item => [...(item.evidence ?? "")].length <= 301), "trecho de terceiro truncado em 300");
  assert.ok(pacote.competitors.every(item => [...(item.title ?? "")].length <= 121));
  assert.match(JSON.stringify(pacote.conflicts), /…/);
  assert.ok(pacote.guards.some(guarda => /FAQ/.test(guarda)));
  assert.ok(pacote.guards.some(guarda => /terceiros/.test(guarda)));
  assert.match(pacote.howToUse, /nunca viram seção de FAQ/);
});

test("pacote · o que casa com a seção não cede enquanto outra lista puder ceder, mesmo sendo a mais pesada", () => {
  const base = materialGrande();
  const material = {
    ...base,
    sections: {
      ...base.sections,
      "observed.questions": Array.from({ length: 30 }, (_, indice) => ({ id: `q${indice}`, canonicalQuestion: `Protetor solar com niacinamida, variação ${indice}: ${"v".repeat(220)}?`, variants: [], pages: 3, status: "RECURRENT_QUESTION", declaredByArticle: false })),
    },
  };
  const pacote = buildWriterSectionEvidencePackage(material, foco)!;
  assert.ok(writerEvidenceJsonBytes(pacote) <= WRITER_SECTION_PACKAGE_MAX_BYTES);
  const cortes = new Map(pacote.trimmed.map(item => [item.field, item]));
  assert.ok((cortes.get("marketVsFact")?.kept ?? 10) < 10, "houve corte por tamanho, além do limite inicial");
  assert.equal(pacote.questions.length, 30, "as 30 perguntas da seção ficam");
  assert.ok(pacote.questions.every(item => item.matchesSection));
  assert.equal(cortes.get("questions"), undefined, "a lista que casa com a seção não cedeu");
});

test("pacote · hierarquia pelas regras do leitor: SERP vigente só se o Radar declarou; especialista; DNA é hipótese", () => {
  const nivel = (autoritativa: boolean) => new Map(buildWriterSectionEvidencePackage(materialGrande(autoritativa), foco)!.sources.map(fonte => [fonte.sourceKey, fonte]));
  const declarada = nivel(true);
  assert.equal(declarada.get("radar.bundle.observed.questions")?.level, "CURRENT_SUFFICIENT_SERP");
  assert.equal(declarada.get("radar.bundle.observed.questions")?.frozen, true);
  assert.equal(declarada.get("radar.bundle.specialist")?.level, "QUALIFIED_SPECIALIST");
  assert.equal(declarada.get("radar.bundle.conflicts")?.level, "OTHER_RADAR_EVIDENCE");
  assert.equal(declarada.get("dna.article/artigo-v1")?.level, "ARTICLE_DNA_HYPOTHESIS");
  assert.equal(declarada.get("dna.article/artigo-v1")?.frozen, false);
  const naoDeclarada = nivel(false);
  assert.equal(naoDeclarada.get("radar.bundle.observed.questions")?.level, "OTHER_RADAR_EVIDENCE");
});

test("pacote · perfil sem fotografia e documento sem dossiê não inventam listas", () => {
  const youtube = { ...materialGrande(), bundle: { ...materialGrande().bundle!, researchProfile: "YOUTUBE" }, sections: {}, absent: [{ field: "questions", reason: "fotografia do Google ausente no perfil YOUTUBE" }] };
  const semFoto = buildWriterSectionEvidencePackage(youtube, foco)!;
  assert.deepEqual([semFoto.questions, semFoto.gaps, semFoto.claims, semFoto.competitors], [[], [], [], []]);
  assert.equal(semFoto.specialist, null);
  assert.deepEqual(semFoto.absent, youtube.absent);
  assert.deepEqual(semFoto.sources.map(fonte => fonte.sourceKey), ["dna.article/artigo-v1"]);
  const semDossie = buildWriterSectionEvidencePackage({ ...youtube, bundle: null, article: null }, foco)!;
  assert.deepEqual(semDossie.sources, []);
  assert.equal(semDossie.bundle, null);
});

test("pacote · relevância: sem acento, sem palavra vazia; números distinguem; flexão curta casa", () => {
  assert.deepEqual(writerSectionTokens("Qual é a rotina da Pele Oleosa em 10 passos?"), ["rotina", "pele", "oleosa", "10", "passos"]);
  assert.equal(writerSectionScore(writerSectionTokens("pele oleosa"), "Peles oleosas no verão"), 1, "oleosa casa com oleosas; pele é curta demais para flexão");
  assert.equal(writerSectionScore(writerSectionTokens("hidratante"), "Hidratantes em gel"), 1);
  assert.equal(writerSectionScore(writerSectionTokens("protetor solar"), "Sol e praia"), 0);
  assert.equal(writerSectionScore([], "qualquer coisa"), 0);
});

test("pacote · a IA só cita como evidência a chave que recebeu", () => {
  const pacote = buildWriterSectionEvidencePackage(materialGrande(), foco)!;
  assert.equal(writerSectionSourceOf(pacote, "radar.bundle.observed.questions#3")?.sourceKey, "radar.bundle.observed.questions");
  assert.equal(writerSectionSourceOf(pacote, "radar.bundle.observed.authorityEvidence.claims#2")?.sourceKey, "radar.bundle.observed.authorityEvidence");
  assert.equal(writerSectionSourceOf(pacote, "dna.article/artigo-v1")?.level, "ARTICLE_DNA_HYPOTHESIS");
  for (const inventada of ["radar.bundle.observed.questionsX", "dna.article/artigo-v2", "radar.bundle.observed.externalSources", "", null, undefined]) {
    assert.equal(writerSectionSourceOf(pacote, inventada), null, String(inventada));
  }
  assert.equal(writerSectionSourceOf(null, "radar.bundle.observed.questions"), null);
});

test("resposta do modelo · alerta em texto ou objeto; tipo de alvo desconhecido não derruba a proposta", () => {
  const lida = WriterSectionProviderSchema.parse({ paragraphs: ["Texto."], alerts: ["Falta fonte.", { message: "Conflito.", targetKind: "qualquer", extra: 1 }] });
  assert.equal(lida.alerts.length, 2);
  assert.deepEqual(lida.alerts[1], { message: "Conflito.", targetKind: "qualquer" });
  assert.deepEqual(WriterSectionProviderSchema.parse({ paragraphs: ["Texto."] }).alerts, []);
  assert.equal(WriterSectionProviderSchema.safeParse({ paragraphs: [], alerts: [] }).success, false);
});

/* ============================ contrato da divergência ============================ */

const pedido = () => ({
  target: { kind: "article_dna" },
  dnaClaim: { path: "mainIntent", summary: "O DNA diz informacional." },
  evidence: { sourceKey: "radar.bundle.observed.questions" },
});

test("divergência · o pedido da IA não carrega status, bloqueio, hierarquia nem id de alvo", () => {
  assert.equal(WriterDivergenceRequestSchema.parse(pedido()).severity, "alerta");
  for (const proibido of [
    { ...pedido(), status: "resolvida" },
    { ...pedido(), severity: "bloqueante" },
    { ...pedido(), evidence: { sourceKey: "radar.bundle.observed.questions", hierarchyLevel: "CURRENT_SUFFICIENT_SERP" } },
    { ...pedido(), target: { kind: "article_dna", entityId: "artigo", contentHash: "sha256:x" } },
    { ...pedido(), target: { kind: "silo_page" } },
    { ...pedido(), origin: "humano" },
  ]) {
    assert.equal(WriterDivergenceRequestSchema.safeParse(proibido).success, false, JSON.stringify(proibido));
  }
});

const alvos = () => ({
  articleDnaRef: { entityId: "artigo", versionId: "artigo-v1", contentHash: "sha256:a" },
  siloDnaRef: { entityId: "silo", versionId: "legacy:silo:v1", contentHash: "legacy:s" },
  keywordDnaRefs: [{ entityId: "kw-1", versionId: "kw-1-v2", contentHash: "sha256:k" }],
  bundle: { bundleId: "bundle:1", bundleHash: "bundle-hash:1" },
  brand: { brandDna: null, skills: [{ entityId: "skill:voz", versionId: "skill-v1", contentHash: "sha256:s" }] },
});

test("divergência · o alvo sai das referências do documento; id inventado é recusado", () => {
  const casos: Array<[Linha, string | null]> = [
    [{ kind: "article_dna" }, "artigo-v1"],
    [{ kind: "article_dna", versionId: "artigo-v1" }, "artigo-v1"],
    [{ kind: "article_dna", versionId: "artigo-v9" }, null],
    [{ kind: "silo_dna" }, "legacy:silo:v1"],
    [{ kind: "keyword_dna", keywordId: "kw-1" }, "kw-1-v2"],
    [{ kind: "keyword_dna", versionId: "kw-1-v2" }, "kw-1-v2"],
    [{ kind: "keyword_dna", keywordId: "kw-1", versionId: "kw-1-v1" }, null],
    [{ kind: "keyword_dna", keywordId: "kw-inventada" }, null],
    [{ kind: "keyword_dna" }, null],
    [{ kind: "radar_bundle" }, "bundle:1"],
    [{ kind: "radar_bundle", versionId: "bundle:0" }, null],
    [{ kind: "brand_dna", versionId: "skill-v1" }, "skill-v1"],
    [{ kind: "brand_dna" }, null],
    [{ kind: "brand_dna", versionId: "skill-de-outra-marca" }, null],
  ];
  for (const [alvo, versao] of casos) {
    const resolvido = resolveWriterDivergenceTarget(alvos(), alvo as Parameters<typeof resolveWriterDivergenceTarget>[1]);
    assert.equal(resolvido.ok ? resolvido.target.versionId : null, versao, JSON.stringify(alvo));
  }
  const pacote = resolveWriterDivergenceTarget(alvos(), { kind: "radar_bundle" });
  assert.equal(pacote.ok && pacote.target.contentHash, "bundle-hash:1", "o gatilho confere id e hash do pacote");
  assert.equal(resolveWriterDivergenceTarget({ ...alvos(), bundle: null }, { kind: "radar_bundle" }).ok, false);
  assert.equal(resolveWriterDivergenceTarget({ ...alvos(), brand: null }, { kind: "brand_dna", versionId: "skill-v1" }).ok, false);
});

const linhaBase = (extra: Partial<Parameters<typeof writerDivergenceRow>[0]> = {}) => writerDivergenceRow({
  brandId: "marca-a", documentId: "writer:doc", articleId: "artigo",
  target: { kind: "article_dna", entityId: "artigo", versionId: "artigo-v1", contentHash: "sha256:a" },
  claim: { path: "mainIntent", summary: "Resumo." },
  evidence: { sourceKey: "serp.cache/kw-1", path: null, etag: null, level: "CURRENT_SUFFICIENT_SERP", frozen: false, observedAt: "2026-09-20T10:00:00+00:00", posteriorAoPacote: true },
  severity: "alerta", origin: "ia_mcp", mcpGrantId: "grant-1", createdBy: "ator-1", ...extra,
});

test("divergência · a linha segue os CHECKs da tabela: fora do dossiê nunca SERP vigente; congelado só no dossiê", () => {
  const linha = linhaBase();
  assert.equal(linha.status, "aberta");
  assert.equal(linha.evidence_hierarchy_level, "OTHER_RADAR_EVIDENCE", "fora do dossiê não sai como SERP vigente");
  assert.equal(linha.evidence_frozen, false);
  assert.equal(linha.evidence_posterior_ao_pacote, true);
  assert.equal(linha.suggested_owner, "arquiteto");
  assert.equal(linha.mcp_grant_id, "grant-1");

  const fingindo = linhaBase({ evidence: { sourceKey: "serp.cache/kw-1", path: null, etag: null, level: "CURRENT_SUFFICIENT_SERP", frozen: true, observedAt: null, posteriorAoPacote: false } });
  assert.equal(fingindo.evidence_frozen, false, "só o dossiê é congelado");
  assert.equal(fingindo.evidence_hierarchy_level, "OTHER_RADAR_EVIDENCE");

  const congelada = linhaBase({ evidence: { sourceKey: "radar.bundle.observed.questions", path: null, etag: null, level: "CURRENT_SUFFICIENT_SERP", frozen: true, observedAt: OBSERVADO_EM, posteriorAoPacote: true } });
  assert.equal(congelada.evidence_frozen, true);
  assert.equal(congelada.evidence_hierarchy_level, "CURRENT_SUFFICIENT_SERP");
  assert.equal(congelada.evidence_posterior_ao_pacote, false, "o pacote nunca é posterior a si mesmo");

  assert.equal(linhaBase({ evidence: { sourceKey: "x", path: null, etag: null, level: "AI_INTERPRETATION", frozen: false, observedAt: "não é data", posteriorAoPacote: false } }).evidence_observed_at, null);
  assert.equal(linhaBase({ origin: "ia_interna", mcpGrantId: null }).mcp_grant_id, null);
  assert.throws(() => linhaBase({ mcpGrantId: null }), /MCP_REQUIRES_GRANT/);
  assert.throws(() => linhaBase({ origin: "ia_interna", mcpGrantId: "grant-1" }), /INTERNAL_WITHOUT_GRANT/);
  assert.throws(() => linhaBase({ severity: "bloqueante" as "alerta" }), /SEVERITY_FROM_AI/);
  assert.equal(linhaBase({ claim: { path: "p".repeat(900), summary: "s".repeat(5000) } }).dna_claim_summary.length, 2000);
  assert.equal(linhaBase({ target: { kind: "keyword_dna", entityId: "kw-1", versionId: "kw-1-v2", contentHash: null } }).suggested_owner, "minerador");
});

test("divergência · a mesma afirmação confrontada com a mesma evidência é um registro só", () => {
  const chave = (resumo: string, nota: string | null = null) => linhaBase({ claim: { path: "mainIntent", summary: resumo }, note: nota }).dedupe_key;
  assert.equal(chave("Um resumo."), chave("Outro resumo, mesma divergência."));
  assert.notEqual(chave("Um resumo.", "alerta livre A"), chave("Um resumo.", "alerta livre B"));
  assert.match(chave("x"), /^div:[0-9a-f]{16}$/);
  assert.equal(writerDivergenceDedupeKey({ targetKind: "article_dna", targetVersionId: "v", claimPath: " MainIntent ", evidenceSourceKey: "k", evidencePath: null }),
    writerDivergenceDedupeKey({ targetKind: "article_dna", targetVersionId: "v", claimPath: "mainintent", evidenceSourceKey: "k", evidencePath: null }));
});

test("divergência · a releitura só aceita linha completa", () => {
  const linha = { id: "d1", status: "aberta", severity: "alerta", target_kind: "article_dna", target_entity_id: "a", target_version_id: "v", dna_claim_path: "p", dna_claim_summary: "s", evidence_source_key: "k" };
  assert.equal(writerOpenDivergenceFromRow(linha)?.id, "d1");
  assert.equal(writerOpenDivergenceFromRow({ ...linha, severity: "urgente" }), null);
  assert.equal(writerOpenDivergenceFromRow({ ...linha, target_version_id: null }), null);
});

/* ================================= Guardião ================================= */

const divergencia = (id: string, extra: Linha = {}) => ({
  id, status: "aberta", severity: "alerta" as const, targetKind: "article_dna", dnaClaimPath: "evidenceNeeded", dnaClaimSummary: `resumo ${id}`,
  evidenceSourceKey: "radar.bundle.observed.questions", ...extra,
});

test("Guardião · sem divergência, o relatório é o de antes; com elas, intenção, evidência e canibalização", async () => {
  const { document } = await createMockPlanAndDocument("brand-1");
  const semDatas = (relatorio: Linha) => ({ ...relatorio, generatedAt: null });
  assert.deepEqual(semDatas(runGuardian(document, "h")), semDatas(runGuardian(document, "h", {})));
  assert.equal("notices" in runGuardian(document, "h", { notices: [] }), false, "aviso só quando há aviso");

  assert.equal(guardianDivergenceCategory({ dnaClaimPath: "mainIntent", evidenceSourceKey: "radar.bundle.observed.questions" }), "intent");
  assert.equal(guardianDivergenceCategory({ dnaClaimPath: "journeyStage", evidenceSourceKey: "x" }), "intent");
  assert.equal(guardianDivergenceCategory({ dnaClaimPath: "antiCannibalizationBoundary", evidenceSourceKey: "x" }), "cannibalization");
  assert.equal(guardianDivergenceCategory({ dnaClaimPath: "requiredTopics", evidenceSourceKey: "publication.brand" }), "cannibalization");
  assert.equal(guardianDivergenceCategory({ dnaClaimPath: "requiredTopics", evidenceSourceKey: "graph.article/g:v2" }), "cannibalization");
  assert.equal(guardianDivergenceCategory({ dnaClaimPath: "evidenceNeeded", evidenceSourceKey: "radar.bundle.observed.authorityEvidence" }), "evidence");

  const base = runGuardian(document, "h");
  const relatorio = runGuardian(document, "h", {
    divergences: [
      divergencia("d1", { dnaClaimPath: "mainIntent" }),
      divergencia("d1", { dnaClaimPath: "mainIntent" }),
      divergencia("d2", { status: "reconhecida", severity: "info", evidenceSourceKey: "publication.brand" }),
      divergencia("d3", { status: "resolvida" }),
      divergencia("d4", { status: "descartada" }),
      divergencia("d5", { severity: "bloqueante" }),
    ],
    notices: ["Mais de 50 divergências abertas."],
  });
  const novas = relatorio.findings.filter(item => item.message.includes("Divergência"));
  assert.deepEqual(novas.map(item => [item.category, item.severity]), [["intent", "warning"], ["cannibalization", "info"], ["evidence", "blocked"]]);
  assert.ok(novas.every(item => item.sectionId === "document" && item.humanDecisionRequired));
  assert.equal(relatorio.blockingCount, base.blockingCount + 1, "só o bloqueante marcado por pessoa bloqueia");
  assert.equal(relatorio.status, "blocked");
  assert.deepEqual(relatorio.notices, ["Mais de 50 divergências abertas."]);
  assert.equal(new Set(relatorio.findings.map(item => item.id)).size, relatorio.findings.length, "ids únicos");
});

/* ============================ instruções da IA ============================ */

test("instruções · seção e melhoria proíbem FAQ, tratam terceiros como pesquisa e pedem JSON com o alerta que vira divergência", () => {
  for (const sistema of [SECTION_WRITING_SYSTEM_PROMPT, IMPROVE_SYSTEM_PROMPT]) {
    assert.match(sistema, /Não gerar nem sugerir FAQ/);
    assert.match(sistema, /terceiros/);
    assert.match(sistema, /dos dois lados/);
    assert.match(sistema, /JSON/, "sem a palavra JSON o provider recusa");
    assert.match(sistema, /evidenceSourceKey/);
    assert.match(sistema, /Nunca invente id/);
  }
  for (const sistema of [SCRIPT_SEED_SYSTEM_PROMPT, CAROUSEL_SEED_SYSTEM_PROMPT]) assert.match(sistema, /Não gere nem sugira FAQ/);
});

test("instruções · documento do Radar (v2, sem plano) monta o pedido de seção; o pacote vai compacto e a ausência é dita", async () => {
  const { document } = await createMockPlanAndDocument("brand-1");
  const { contentPlanRef: _plano, writingBrief: _briefing, ...semPlano } = document as Linha;
  void _plano; void _briefing;
  const v2 = ContentDocumentSchema.parse({
    ...semPlano, schemaVersion: 2,
    radarOrigin: { radarItemId: "r1", articleId: "artigo", analysisVersionId: "a3", analysisVersionNumber: 3, evidenceBundleHash: "bundle-hash:1", articleDnaVersionId: "artigo-v1", articleDnaContentHash: "sha256:a", siloDnaVersionId: null, importedAt: OBSERVADO_EM, importedBy: "ator-1" },
    importedContext: { source: "radar", capturedAt: OBSERVADO_EM, dossier: null, editorialContext: [], visualGuidance: [], pendingDecisions: [] },
  });
  const secao = v2.blocks.find(block => block.type === "heading")!;
  const pacote = buildWriterSectionEvidencePackage(materialGrande(), foco)!;
  const contexto = createSectionPromptContext(v2, secao.id, "", { package: pacote, notice: null });
  assert.equal(contexto.contentPlanRef, null, "o v2 não tem plano e o pedido não inventa um");
  const prompt = buildSectionWritingPrompt(contexto);
  assert.ok(prompt.includes(JSON.stringify(pacote)), "o pacote vai compacto, como foi medido");
  assert.match(prompt, /Não crie FAQ/);

  const semPacote = buildSectionWritingPrompt(createSectionPromptContext(v2, secao.id, "", { package: null, notice: "document_incompatible: fora do contrato" }));
  assert.match(semPacote, /Evidência do artigo: indisponível \(document_incompatible: fora do contrato\)/);
  assert.match(semPacote, /Não infira evidência/);

  const melhoriaAntiga = buildImprovePrompt(document, "Trecho", "Mais claro.");
  assert.deepEqual(Object.keys(JSON.parse(melhoriaAntiga)), ["documentId", "title", "principalKeyword", "instructions", "selectedText", "humanInstruction"], "sem evidência, o pedido de antes");
  assert.match(buildImprovePrompt(document, "Trecho", "", { package: pacote, notice: null }), /writer_section_evidence/);
});

test("tela · o aviso diz quantos alertas viraram divergência e quando a migration falta", () => {
  assert.equal(writerAlertRegistrationNotice({ status: "none", recorded: [], notRecorded: [] }), "");
  assert.equal(writerAlertRegistrationNotice(undefined), "");
  assert.equal(writerAlertRegistrationNotice({ status: "registered", recorded: [], notRecorded: [] }), "");
  assert.equal(writerAlertRegistrationNotice({ status: "partial", recorded: [{}, {}], notRecorded: [{}] }), " 2 alerta(s) da IA registrado(s) como divergência para decisão humana; 1 não registrado(s).");
  assert.equal(writerAlertRegistrationNotice({ status: "migration_pendente", recorded: [], notRecorded: [{}, {}] }), " 2 alerta(s) da IA não registrado(s): migration pendente.");
  const tela = readFileSync(new URL("../components/editorial/professional-writer.tsx", import.meta.url), "utf8");
  assert.equal(tela.split("writerAlertRegistrationNotice(body.divergences)").length - 1, 2, "seção e melhoria mostram o destino dos alertas");
});

test("pacote · os caminhos que a IA interna lê estão presos às medidas: nenhum acima de 36 kB, soma abaixo de 140 kB", () => {
  const TETO_POR_CAMINHO = 36_000;
  const ORCAMENTO = 140_000;
  const medidos = new Map<string, number>();
  for (const caminho of WRITER_SECTION_BUNDLE_PATHS) {
    let medido: [string, number] | null = null;
    for (let tamanho = caminho.length; tamanho > 0 && !medido; tamanho -= 1) {
      const chave = caminho.slice(0, tamanho).join(".");
      const bytes = WRITER_BUNDLE_KNOWN_PATHS[chave];
      if (typeof bytes === "number") medido = [chave, bytes];
    }
    assert.ok(medido, `${caminho.join(".")} não tem medida, nem do pai, em WRITER_BUNDLE_KNOWN_PATHS`);
    assert.ok(medido[1] <= TETO_POR_CAMINHO, `${caminho.join(".")} mede ${medido[1]} B pela medida de ${medido[0]}`);
    medidos.set(medido[0], medido[1]);
  }
  const soma = [...medidos.values()].reduce((total, bytes) => total + bytes, 0);
  assert.ok(soma <= ORCAMENTO, `o pacote leria ${soma} B por pedido`);
  assert.ok(medidos.has("observed.authorityEvidence"), "as afirmações de autoridade contam pela medida do pai, uma vez só");
  assert.equal(medidos.size, WRITER_SECTION_BUNDLE_PATHS.length - 1);
});
