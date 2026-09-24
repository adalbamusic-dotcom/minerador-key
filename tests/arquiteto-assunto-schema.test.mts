/**
 * F2 · FASE A — o schema TOLERA o Assunto (SDD
 * `docs/compartilhado/sdd-assunto-tronco-editorial-2026-09-24.md`, F2.1, F2.6 e
 * seção 6).
 *
 * Nesta fase nenhum caminho grava `subject`. O que se prova aqui:
 *   1. sem `subject`, ArticleDNA e SiloDNA fazem parse IDÊNTICO ao de antes e o
 *      hash de conteúdo não muda (hashes dourados capturados com o contrato
 *      anterior à fase A);
 *   2. com `subject` válido, o parse aceita, em qualquer unidade (artigo,
 *      landing page, página de serviço) e no SiloDNA;
 *   3. as duas regras novas do superRefine recusam: o tronco como secundária ou
 *      reforço, e a frase do tronco entre os `excludedSubjects` do mesmo artigo;
 *   4. `.strict()`: campo extra dentro de `subject` é recusado.
 *
 * Fixtures puras, sem rede, sem provider, sem banco.
 */
import assert from "node:assert/strict";
import test from "node:test";
import {
  ArticleDNASchema,
  DeclaredSubjectSchema,
  SiloDNASchema,
  VersionedArticleDNASchema,
  VersionedSiloDNASchema,
} from "../lib/arquiteto/contracts.ts";
import { canonicalJson, contentHash, createVersionEnvelope } from "../lib/arquiteto/versioning.ts";
import { normalizeKeyword } from "../lib/minerador/keyword-import-core.ts";

const MARCA = "5b0e7c1a-2d3f-4a5b-8c9d-0e1f2a3b4c5d";
const PRINCIPAL = "kw-marketing-para-clinicas";
const SECUNDARIA = "kw-captar-clientes-clinica";
const REFORCO = "kw-trafego-pago-clinica";
const ASSUNTO = "kw-seo-para-clinicas";
const ATOR = "0f1e2d3c-4b5a-4968-8776-655443322110";

/*
 * Hashes dourados: `contentHash` do payload, calculados com o contrato ANTERIOR
 * à fase A (sem `subject` no schema). Se a fase A mexesse no parse de um
 * artefato sem Assunto — chave nova, default, ordem —, o hash mudaria aqui.
 */
const HASH_ARTIGO_HOJE = "sha256:fa81d7546847e95fde4dce0b73707f811b65bf16e42fca5bcf652d727cf8c620";
const HASH_SILO_CRU_HOJE = "sha256:8f1ef1777aeebf5d848505be90ad52175f1903cccc4dd72ddcee40f0b392fc5c";
const HASH_SILO_LIDO_HOJE = "sha256:8ece6c62508e8024b1d47a286ebf9554227606d4d2836c65a6f7b14e425e143b";

function referencia(keywordId: string, role: "principal" | "secundaria" | "reforco_narrativo") {
  return {
    keywordId,
    keywordDnaVersionId: `legacy:dna-${keywordId}:v1`,
    keywordDnaContentHash: `legacy:dna-${keywordId}`,
    approvedPackageRef: { version: 2, contentHash: `pkg-${keywordId}`, approvedAt: "2026-09-20T12:00:00+00:00" },
    role,
    strategicContribution: role === "principal" ? "Âncora de busca do artigo." : "Sustenta a narrativa com demanda real.",
    coveredIntentions: ["informacional"],
    requiredTopics: [],
    excludedTopics: [],
    classificationOrigin: "human" as const,
    confidence: 0.8,
    humanConfirmed: true,
    volume: role === "principal" ? 880 : 210,
    resultCount: 40,
    kgrScore: 0.18,
  };
}

function artigoBase() {
  return {
    schemaVersion: 1 as const,
    articleId: "article-marketing-clinicas",
    brandId: MARCA,
    principalKeywordId: PRINCIPAL,
    secondaryKeywordIds: [SECUNDARIA],
    narrativeReinforcementIds: [REFORCO],
    keywordReferences: [referencia(PRINCIPAL, "principal"), referencia(SECUNDARIA, "secundaria"), referencia(REFORCO, "reforco_narrativo")],
    siloId: null,
    hierarchy: "Suporte" as const,
    suggestedSlug: "marketing-para-clinicas",
    canonical: null,
    mainIntent: "informacional",
    auxiliaryIntents: ["comercial"],
    audience: "Gestores de clínicas de estética",
    problem: "Poucos pacientes novos por mês",
    desiredResult: "Agenda previsível",
    journeyStage: "TOFU",
    brandObjective: "Levar à oferta de SEO para clínicas",
    promise: "Cobrir com clareza o tema marketing para clínicas",
    angle: "Do anúncio ao orgânico",
    cta: "Conhecer o serviço",
    coverage: ["canais de aquisição", "custo por paciente"],
    excludedSubjects: ["contabilidade de clínicas", "SEO para Clínicas de Veterinária"],
    antiCannibalizationBoundary: "Não trata de gestão financeira.",
    nearbyArticleIds: [],
    differentiation: ["exemplos de clínicas pequenas"],
    entities: ["clínica", "paciente"],
    requiredTopics: ["captação"],
    questions: [],
    objections: [],
    evidenceNeeded: [],
    sourcesNeeded: [],
    internalLinks: [],
    alerts: [],
    confidence: 0.7,
    humanPendingDecisions: [],
  };
}

function siloBase() {
  return {
    schemaVersion: 1 as const,
    formationStatus: "formed" as const,
    siloId: "silo-clinicas",
    brandId: MARCA,
    name: "Marketing para clínicas",
    centralEntity: "marketing para clínicas",
    centralEntitySource: "manual" as const,
    objective: "Organizar a aquisição de pacientes",
    audience: "Gestores de clínicas",
    macroProblem: "Agenda vazia",
    dominantIntent: "informacional",
    pillarArticleId: null,
    supportArticleIds: [],
    articleReferences: [],
    articleRoles: [],
    narrativeOrder: [],
    linkMap: [],
    boundary: "Aquisição, não gestão",
    includedTopics: ["tráfego pago", "SEO local"],
    excludedTopics: ["contabilidade"],
    nearbySiloIds: [],
    possibleConflicts: [],
    gaps: [],
    nextContents: [],
    confidence: 0.6,
    humanPendingDecisions: [],
  };
}

function assunto(extra: Record<string, unknown> = {}) {
  return {
    keywordId: ASSUNTO,
    approvedPackageRef: { version: 1, contentHash: "pkg-seo-para-clinicas", approvedAt: "2026-09-24T09:00:00+00:00" },
    phrase: "SEO para clínicas",
    note: "Nosso serviço para donas de clínicas de estética que dependem de anúncio.",
    destinationUrl: "https://exemplo.com.br/seo-para-clinicas",
    attachedBy: ATOR,
    attachedAt: "2026-09-24T10:00:00+00:00",
    ...extra,
  };
}

const mensagens = (resultado: { success: boolean; error?: { issues: { message: string; path: PropertyKey[] }[] } }) =>
  (resultado.error?.issues || []).map(issue => `${issue.path.join(".")}: ${issue.message}`);

/* ================= sem Assunto: nada muda, nem o hash ================= */

test("ArticleDNA sem subject faz parse idêntico ao de hoje e mantém o hash dourado", async () => {
  const cru = artigoBase();
  const lido = ArticleDNASchema.parse(cru);
  assert.deepEqual(lido, cru, "o parse não acrescenta nem retira nada");
  assert.equal("subject" in lido, false, "ausente continua ausente: nem null, nem undefined explícito");
  assert.equal(canonicalJson(lido), canonicalJson(cru));
  assert.equal(await contentHash(lido), HASH_ARTIGO_HOJE);
  assert.equal(await contentHash(cru), HASH_ARTIGO_HOJE);
});

test("o envelope versionado de um ArticleDNA sem subject guarda o mesmo hash e relê igual", async () => {
  const envelope = await createVersionEnvelope({
    entityId: "article-marketing-clinicas",
    versionNumber: 1,
    origin: "human",
    changeReason: "fixture",
    createdBy: ATOR,
    payload: artigoBase(),
    versionId: "11111111-2222-4333-8444-555555555555",
    // O envelope exige datetime sem deslocamento (contrato vigente, fora da fase A).
    createdAt: "2026-09-24T10:00:00.000Z",
  });
  assert.equal(envelope.contentHash, HASH_ARTIGO_HOJE);
  const relido = VersionedArticleDNASchema.parse(structuredClone(envelope));
  assert.deepEqual(relido, structuredClone(envelope));
  assert.equal(await contentHash(relido.payload), envelope.contentHash, "o readback confere o hash gravado");
});

test("SiloDNA sem subject faz parse idêntico ao de hoje e mantém os hashes dourados", async () => {
  const cru = siloBase();
  const lido = SiloDNASchema.parse(cru);
  assert.equal("subject" in lido, false);
  assert.deepEqual(lido, { ...cru, hierarchySignals: [] }, "só o default que já existia entra");
  assert.equal(await contentHash(cru), HASH_SILO_CRU_HOJE);
  assert.equal(await contentHash(lido), HASH_SILO_LIDO_HOJE);
  const envelope = await createVersionEnvelope({
    entityId: "silo-clinicas",
    versionNumber: 1,
    origin: "human",
    changeReason: "fixture",
    createdBy: ATOR,
    payload: lido,
    versionId: "66666666-7777-4888-8999-000000000000",
    // O envelope exige datetime sem deslocamento (contrato vigente, fora da fase A).
    createdAt: "2026-09-24T10:00:00.000Z",
  });
  assert.equal(envelope.contentHash, HASH_SILO_LIDO_HOJE);
  assert.deepEqual(VersionedSiloDNASchema.parse(structuredClone(envelope)), structuredClone(envelope));
});

test("subject é opcional nos dois schemas: nenhum artefato antigo passa a exigi-lo", () => {
  assert.equal(ArticleDNASchema.shape.subject.isOptional(), true);
  assert.equal(SiloDNASchema.shape.subject.isOptional(), true);
});

/* ================= com Assunto válido ================= */

test("ArticleDNA com subject válido é aceito numa unidade artigo, e o hash passa a refletir o tronco", async () => {
  const semAssunto = artigoBase();
  const comAssunto = { ...semAssunto, subject: assunto() };
  const lido = ArticleDNASchema.parse(comAssunto);
  assert.deepEqual(lido.subject, assunto());
  assert.equal(lido.keywordReferences.some(reference => reference.keywordId === ASSUNTO), false, "o tronco não é referência");
  assert.notEqual(await contentHash(lido), await contentHash(semAssunto), "trocar o tronco muda o hash do artigo");
});

test("subject vale para landing page e página de serviço, sem depender do tipo da unidade", () => {
  for (const type of ["landing_page", "service_page"] as const) {
    const unidade = {
      ...artigoBase(),
      unitClassification: { type, status: "human_confirmed" as const, source: "manual" as const, ...(type === "landing_page" ? { landingPagePurpose: "seo" as const } : {}) },
      subject: assunto(),
    };
    const resultado = ArticleDNASchema.safeParse(unidade);
    assert.equal(resultado.success, true, `${type}: ${mensagens(resultado).join(" | ")}`);
  }
});

test("subject aceita nota e destino nulos, e o tronco fora do teto de 6 keywords", () => {
  const cheio = artigoBase();
  const ids = ["kw-a", "kw-b", "kw-c"];
  const seis = {
    ...cheio,
    secondaryKeywordIds: [SECUNDARIA, ...ids],
    keywordReferences: [...cheio.keywordReferences, ...ids.map(id => referencia(id, "secundaria"))],
    subject: assunto({ note: null, destinationUrl: null }),
  };
  const resultado = ArticleDNASchema.safeParse(seis);
  assert.equal(resultado.success, true, mensagens(resultado).join(" | "));
});

test("subject.keywordId igual à principal NÃO é decidido no schema: fica para o gate de conclusão (fase B)", () => {
  const resultado = ArticleDNASchema.safeParse({ ...artigoBase(), subject: assunto({ keywordId: PRINCIPAL }) });
  assert.equal(resultado.success, true, mensagens(resultado).join(" | "));
});

test("o mesmo Assunto pode ser o tronco de vários artigos (D3): o schema não olha fora do próprio artigo", () => {
  const a = ArticleDNASchema.safeParse({ ...artigoBase(), subject: assunto() });
  const b = ArticleDNASchema.safeParse({ ...artigoBase(), articleId: "article-outro", suggestedSlug: "outro", subject: assunto() });
  assert.equal(a.success && b.success, true);
});

test("SiloDNA com subject válido é aceito, e centralEntity continua sendo o que era", () => {
  const lido = SiloDNASchema.parse({ ...siloBase(), subject: assunto() });
  assert.deepEqual(lido.subject, assunto());
  assert.equal(lido.centralEntity, "marketing para clínicas", "a frase do Assunto não vira H1/title do Silo (D1)");
});

/* ================= recusas ================= */

test("subject.keywordId como secundária é recusado", () => {
  const resultado = ArticleDNASchema.safeParse({ ...artigoBase(), subject: assunto({ keywordId: SECUNDARIA }) });
  assert.equal(resultado.success, false);
  assert.ok(mensagens(resultado).some(texto => texto.startsWith("subject.keywordId:")), mensagens(resultado).join(" | "));
});

test("subject.keywordId como reforço narrativo é recusado", () => {
  const resultado = ArticleDNASchema.safeParse({ ...artigoBase(), subject: assunto({ keywordId: REFORCO }) });
  assert.equal(resultado.success, false);
  assert.ok(mensagens(resultado).some(texto => texto.startsWith("subject.keywordId:")), mensagens(resultado).join(" | "));
});

test("subject.phrase entre os excludedSubjects do mesmo artigo é recusada, por keyword normalizada", () => {
  const exata = ArticleDNASchema.safeParse({ ...artigoBase(), excludedSubjects: ["SEO para clínicas"], subject: assunto() });
  assert.equal(exata.success, false);
  assert.ok(mensagens(exata).some(texto => texto.startsWith("subject.phrase:")), mensagens(exata).join(" | "));
  // Caixa, acento e espaços não escondem a colisão.
  const variante = ArticleDNASchema.safeParse({ ...artigoBase(), excludedSubjects: ["  seo   PARA clinicas "], subject: assunto() });
  assert.equal(variante.success, false);
  assert.ok(mensagens(variante).some(texto => texto.startsWith("subject.phrase:")));
  // Tema excluído que só CONTÉM a frase não é o mesmo tema.
  const vizinho = ArticleDNASchema.safeParse({ ...artigoBase(), subject: assunto() });
  assert.equal(vizinho.success, true, mensagens(vizinho).join(" | "));
});

test("a comparação da frase segue a normalização de keyword do Minerador", () => {
  const pares: Array<[string, string]> = [
    ["SEO para Clínicas", "seo para clinicas"],
    ["\tSeo  para  CLÍNICAS\n", "seo para clinicas"],
    ["Clínica Ágil", "clinica agil"],
  ];
  for (const [frase, excluido] of pares) {
    assert.equal(normalizeKeyword(frase), normalizeKeyword(excluido), "premissa do caso");
    const resultado = ArticleDNASchema.safeParse({ ...artigoBase(), excludedSubjects: [excluido], subject: assunto({ phrase: frase }) });
    assert.equal(resultado.success, false, `${frase} × ${excluido}`);
  }
  const distintos = ArticleDNASchema.safeParse({ ...artigoBase(), excludedSubjects: ["seo-para-clinicas"], subject: assunto() });
  assert.notEqual(normalizeKeyword("seo-para-clinicas"), normalizeKeyword("SEO para clínicas"));
  assert.equal(distintos.success, true, "o que o Minerador trata como keyword diferente não colide");
});

test("subject com campo extra é recusado (.strict()), no ArticleDNA e no SiloDNA", () => {
  const extra = assunto({ role: "principal" });
  assert.equal(DeclaredSubjectSchema.safeParse(extra).success, false);
  assert.equal(ArticleDNASchema.safeParse({ ...artigoBase(), subject: extra }).success, false);
  assert.equal(SiloDNASchema.safeParse({ ...siloBase(), subject: extra }).success, false);
  const pacoteComExtra = assunto({ approvedPackageRef: { version: 1, contentHash: "h", approvedAt: "2026-09-24T09:00:00+00:00", status: "aprovado" } });
  assert.equal(DeclaredSubjectSchema.safeParse(pacoteComExtra).success, false, "o pacote aprovado também é .strict()");
});

test("subject recusa o que a SDD não permite: nota longa, destino que não é URL, campos obrigatórios vazios", () => {
  assert.equal(DeclaredSubjectSchema.safeParse(assunto({ note: "x".repeat(281) })).success, false);
  assert.equal(DeclaredSubjectSchema.safeParse(assunto({ note: "x".repeat(280) })).success, true);
  assert.equal(DeclaredSubjectSchema.safeParse(assunto({ note: "" })).success, false, "nota vazia é null, não string vazia");
  assert.equal(DeclaredSubjectSchema.safeParse(assunto({ destinationUrl: "seo-para-clinicas" })).success, false);
  for (const campo of ["keywordId", "phrase", "attachedBy", "attachedAt"]) {
    assert.equal(DeclaredSubjectSchema.safeParse(assunto({ [campo]: "" })).success, false, campo);
    const semCampo: Record<string, unknown> = assunto();
    delete semCampo[campo];
    assert.equal(DeclaredSubjectSchema.safeParse(semCampo).success, false, `sem ${campo}`);
  }
  const semPacote: Record<string, unknown> = assunto();
  delete semPacote.approvedPackageRef;
  assert.equal(DeclaredSubjectSchema.safeParse(semPacote).success, false, "sem pacote aprovado não há Assunto");
  assert.equal(DeclaredSubjectSchema.safeParse(assunto({ note: undefined })).success, false, "note é nullable, não opcional");
});
