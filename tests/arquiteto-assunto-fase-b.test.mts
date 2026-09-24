/**
 * F2 · FASE B — o Arquiteto passa a GRAVAR o Assunto (SDD
 * `docs/compartilhado/sdd-assunto-tronco-editorial-2026-09-24.md`, F2.1 a F2.6).
 *
 * O que se prova aqui, com fixtures e sem rede:
 *   1. o `subject` é montado do PACOTE APROVADO, com ator humano, e grava no
 *      ArticleDNA e no SiloDNA; prender e soltar são puros;
 *   2. Q7: o Assunto só é a própria principal com Volume validado no pacote;
 *   3. conservação: cada cálculo da tabela da F2.3, com fixture própria;
 *   4. formação: Assunto sem Volume validado fica fora da automática, e a
 *      formação sem Assunto é byte a byte a de antes (hashes dourados
 *      capturados com o código anterior à fase B);
 *   5. sugestões determinísticas, com a fixture "SEO para clínicas";
 *   6. slug sempre da principal; isolamento de marca; nenhuma rede.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

import {
  anchoredSubjectKeywordIds,
  articleDnaIncorporatedKeywordIds,
  attachSubjectToArticleDna,
  attachSubjectToSiloDna,
  attachSubjectToWorkingArticle,
  countSubjectAnchors,
  detachSubjectFromArticleDna,
  detachSubjectFromSiloDna,
  detachSubjectFromWorkingArticle,
  isAnchoredSubject,
  planSubjectAttachment,
  readArchitectSubjectStanding,
  resolveAttachedSubjectStanding,
  splitUngroupedBySubjectAnchor,
  subjectConservationLabel,
  subjectFormationSets,
  subjectTrunkLabel,
  suggestSubjectFromSilo,
  suggestSubjectSupport,
  trunkAnchoredKeywordIds,
  SUBJECT_ANOTHER_ATTACHED_REASON,
  SUBJECT_AWAITING_SUPPORT_LABEL,
} from "../lib/arquiteto/declared-subject.ts";
import { ArticleDNASchema, SiloDNASchema, type DeclaredSubject } from "../lib/arquiteto/contracts.ts";
import { automaticFormationHoldouts, buildArticleFormationUniverse } from "../lib/arquiteto/article-formation.ts";
import { buildArticleFormationConfirmationPlan, validateFormationConclusion } from "../lib/arquiteto/article-formation-confirmation.ts";
import { ArticleScenarioSchema, validateArchitectureScenario, type ArchitectureScenario } from "../lib/arquiteto/architecture-scenario.ts";
import { buildDeterministicArticleArchitecture } from "../lib/arquiteto/engine.ts";
import { deriveTerritorialWorkingView, type TerritoryWorkingCopy } from "../lib/arquiteto/territory-working-copy.ts";
import { buildArchitectureWorkingProposal, proposalCoversScope, resolveKeywordDnaSignals } from "../lib/arquiteto/architecture-working-proposal.ts";
import { CANONICAL_IMPORTABILITY, resolveCanonicalMineradorArquitetoImportEligibility } from "../lib/arquiteto/minerador-handoff.ts";
import { readArchitectKeywordVinculo } from "../lib/arquiteto/editorial-unit-declaration.ts";
import {
  ASSUNTO_FRASE,
  ASSUNTO_ID,
  ASSUNTO_NOTA,
  ATOR,
  LISTA_CLINICAS,
  MARCA,
  OUTRA_MARCA,
  SILO_REF,
  VOLUME_VALIDADO,
  declarado,
  formacaoDeReferencia,
  kwFormacao,
  linhaDaMesa,
  logica,
  motorDeReferencia,
} from "./arquiteto-assunto-fixtures.mts";

/* ------------------------------ nenhuma rede ------------------------------- */

let chamadasDeRede = 0;
globalThis.fetch = (async () => {
  chamadasDeRede += 1;
  throw new Error("Rede proibida nos testes do Assunto.");
}) as typeof fetch;

/* --------------------------------- apoio ----------------------------------- */

const sha = (value: unknown) => `sha256:${createHash("sha256").update(JSON.stringify(value)).digest("hex")}`;

/*
 * Hashes dourados, capturados com as versões de HEAD (antes da fase B) de
 * `article-formation.ts`, `article-formation-confirmation.ts` e `engine.ts`,
 * sobre as fixtures de `arquiteto-assunto-fixtures.mts`. A portaria só mudou o
 * texto "mesmo assunto" para "mesmo tema"; desfeita a troca, o hash é o de antes.
 */
const DOURADO_FORMACAO = "sha256:105baf58348248601a37a5e017ddab84617e1dd4d9df0fa169bc63fc59751cd9";
const DOURADO_PLANO = "sha256:f43f46be3c78904202870600d16e6ce52e3c2f6a600e1f11567354f268975072";
const DOURADO_PORTARIA = "sha256:93f5d9f68de160bd89260c272f327281cf41cba4c48ccfc23b5b7480e850d347";
const DOURADO_MOTOR = "sha256:80b583b069efe484db3976ffe3c7a9a593c4c8f9c8deca9c626643c58af6abb8";

const serpVigente = (plan: ReturnType<typeof buildArticleFormationConfirmationPlan>) => new Map(plan.approved.map(entry => [entry.candidateRef, {
  state: "current_supported", blocksConclusion: false, requiresHumanDecision: false, reason: "",
}]));

const portaria = (
  universe: ReturnType<typeof buildArticleFormationUniverse>,
  extra: { subjectVolumeValidated?: Map<string, boolean>; subjectLabels?: Map<string, string> } = {},
) => {
  const plan = buildArticleFormationConfirmationPlan({ universes: [universe] });
  return {
    plan,
    verdict: validateFormationConclusion({
      universes: [universe],
      plan,
      keywordSiloRef: new Map(universe.keywordIds.map(id => [id, SILO_REF])),
      ceiling: 6,
      serpGates: serpVigente(plan),
      ...extra,
    }),
  };
};

/** Assunto da exceção D2: declarado, com Lógica, sem Volume. */
const assuntoD2 = (extra: Record<string, unknown> = {}) => linhaDaMesa({
  id: ASSUNTO_ID,
  keyword: ASSUNTO_FRASE,
  listaId: LISTA_CLINICAS,
  semantic: { ...logica({ entity: "marketing para clínicas", intent: "Comercial", funnel: "MOFU" }), ...declarado() },
  ...extra,
});

/** Assunto declarado COM Volume validado. */
const assuntoComVolume = () => linhaDaMesa({
  id: ASSUNTO_ID,
  keyword: ASSUNTO_FRASE,
  listaId: LISTA_CLINICAS,
  semantic: { ...logica({ entity: "marketing para clínicas", intent: "Comercial", funnel: "MOFU" }), ...declarado(), ...VOLUME_VALIDADO },
});

const PRINCIPAL = "kw-marketing-para-clinicas";
const SECUNDARIA = "kw-captar-clientes-clinica";
const REFORCO = "kw-trafego-pago-clinica";

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

function artigo(extra: Record<string, unknown> = {}) {
  return ArticleDNASchema.parse({
    schemaVersion: 1,
    articleId: "article-marketing-clinicas",
    brandId: MARCA,
    principalKeywordId: PRINCIPAL,
    secondaryKeywordIds: [SECUNDARIA],
    narrativeReinforcementIds: [REFORCO],
    keywordReferences: [referencia(PRINCIPAL, "principal"), referencia(SECUNDARIA, "secundaria"), referencia(REFORCO, "reforco_narrativo")],
    siloId: null,
    hierarchy: "Suporte",
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
    coverage: ["canais de aquisição"],
    excludedSubjects: ["contabilidade de clínicas"],
    antiCannibalizationBoundary: "Não trata de gestão financeira.",
    nearbyArticleIds: [],
    differentiation: [],
    entities: ["clínica"],
    requiredTopics: [],
    questions: [],
    objections: [],
    evidenceNeeded: [],
    sourcesNeeded: [],
    internalLinks: [],
    alerts: [],
    confidence: 0.7,
    humanPendingDecisions: [],
    ...extra,
  });
}

function silo() {
  return SiloDNASchema.parse({
    schemaVersion: 1,
    formationStatus: "formed",
    siloId: "silo-clinicas",
    brandId: MARCA,
    name: "Marketing para clínicas",
    centralEntity: "marketing para clínicas",
    centralEntitySource: "manual",
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
    includedTopics: ["tráfego pago"],
    excludedTopics: ["contabilidade"],
    nearbySiloIds: [],
    possibleConflicts: [],
    gaps: [],
    nextContents: [],
    confidence: 0.6,
    humanPendingDecisions: [],
  });
}

function assuntoPreso(): DeclaredSubject {
  const plano = planSubjectAttachment({ brandId: MARCA, keyword: assuntoD2(), actorUserId: ATOR, attachedAt: "2026-09-24T12:00:00+00:00" });
  assert.equal(plano.ok, true, plano.ok ? "" : plano.reason);
  return (plano as Extract<typeof plano, { ok: true }>).subject;
}

/* ============================ 1. gravar o Assunto ============================ */

test("o subject sai do PACOTE APROVADO, com ator humano, e grava no ArticleDNA", () => {
  const linha = assuntoD2();
  // A linha viva mudou depois da aprovação: o Arquiteto não enxerga.
  linha.analise_semantica = { ...declarado("Nota viva, editada depois da aprovação.") };
  const plano = planSubjectAttachment({ brandId: MARCA, keyword: linha, actorUserId: ATOR, attachedAt: "2026-09-24T12:00:00+00:00" });
  assert.ok(plano.ok, plano.ok ? "" : plano.reason);
  assert.deepEqual(plano.subject, {
    keywordId: ASSUNTO_ID,
    approvedPackageRef: { version: 1, contentHash: `pkg-${ASSUNTO_ID}-v1`, approvedAt: "2026-09-24T09:30:00+00:00" },
    phrase: ASSUNTO_FRASE,
    note: ASSUNTO_NOTA,
    destinationUrl: null,
    attachedBy: ATOR,
    attachedAt: "2026-09-24T12:00:00+00:00",
  });

  const gravado = attachSubjectToArticleDna(artigo(), plano.subject);
  assert.ok(gravado.ok);
  assert.equal(gravado.changed, true);
  const relido = ArticleDNASchema.parse(JSON.parse(JSON.stringify(gravado.value)));
  assert.deepEqual(relido.subject, plano.subject, "o subject gravado sobrevive ao parse .strict()");
  assert.equal(relido.keywordReferences.some(reference => reference.keywordId === ASSUNTO_ID), false, "o tronco não é referência");
  assert.equal(relido.suggestedSlug, "marketing-para-clinicas", "prender o Assunto não mexe no slug da principal");

  const denovo = attachSubjectToArticleDna(gravado.value, { ...plano.subject, attachedAt: "2026-09-25T12:00:00+00:00" });
  assert.ok(denovo.ok);
  assert.equal(denovo.changed, false, "o mesmo Assunto do mesmo pacote não gera versão nova");

  const solto = detachSubjectFromArticleDna(gravado.value);
  assert.equal(solto.changed, true);
  assert.equal("subject" in solto.value, false);
  assert.deepEqual(solto.value, artigo(), "soltar devolve o artigo de antes");
});

test("prender vale para landing page e página de serviço", () => {
  const subject = assuntoPreso();
  for (const type of ["landing_page", "service_page"] as const) {
    const unidade = artigo({ unitClassification: { type, status: "human_confirmed", source: "manual", ...(type === "landing_page" ? { landingPagePurpose: "seo" } : {}) } });
    const gravado = attachSubjectToArticleDna(unidade, subject);
    assert.ok(gravado.ok, `${type}: ${gravado.ok ? "" : gravado.reason}`);
  }
});

test("o ArticleDNA recusa o Assunto como secundária e como tema excluído", () => {
  const subject = assuntoPreso();
  const comoSecundaria = attachSubjectToArticleDna(artigo(), { ...subject, keywordId: SECUNDARIA });
  assert.equal(comoSecundaria.ok, false);
  const excluido = attachSubjectToArticleDna(artigo({ excludedSubjects: ["seo para CLINICAS"] }), subject);
  assert.equal(excluido.ok, false);
});

test("SiloDNA: prender e soltar sem tocar na entidade central", () => {
  const subject = assuntoPreso();
  const gravado = attachSubjectToSiloDna(silo(), subject);
  assert.ok(gravado.ok);
  assert.equal(gravado.value.centralEntity, "marketing para clínicas", "a SiloPage continua tirando o H1 da entidade central");
  assert.deepEqual(SiloDNASchema.parse(JSON.parse(JSON.stringify(gravado.value))).subject, subject);
  const solto = detachSubjectFromSiloDna(gravado.value);
  assert.equal(solto.changed, true);
  assert.deepEqual(solto.value, silo());
});

test("cópia de trabalho: o vínculo é subjectKeywordId do artigo, separado de clusterId", () => {
  const plano = planSubjectAttachment({ brandId: MARCA, keyword: assuntoD2(), actorUserId: ATOR, attachedAt: "2026-09-24T12:00:00+00:00" });
  assert.ok(plano.ok);
  const artigoDeTrabalho = { articleRef: "article-1", clusterId: "cluster-1", subjectKeywordId: null as string | null };
  const preso = attachSubjectToWorkingArticle(artigoDeTrabalho, plano);
  assert.equal(preso.value.subjectKeywordId, ASSUNTO_ID);
  assert.equal(preso.value.clusterId, "cluster-1", "o cluster do artigo não muda");
  assert.equal(assuntoD2().clusterId, null, "a keyword do Assunto continua sem clusterId");
  assert.equal(attachSubjectToWorkingArticle(preso.value, plano).changed, false);
  assert.equal(detachSubjectFromWorkingArticle(preso.value).value.subjectKeywordId, null);
});

test("prender recusa: IA ou ator sem id, não recebida, sem pacote, outra marca, não declarada", () => {
  const base = { brandId: MARCA, attachedAt: "2026-09-24T12:00:00+00:00" };
  const codigo = (resultado: ReturnType<typeof planSubjectAttachment>) => resultado.ok ? "OK" : resultado.code;
  assert.equal(codigo(planSubjectAttachment({ ...base, keyword: assuntoD2(), actorUserId: "deepseek" })), "ACTOR_REQUIRED");
  assert.equal(codigo(planSubjectAttachment({ ...base, keyword: assuntoD2(), actorUserId: "local-user" })), "ACTOR_REQUIRED");
  assert.equal(codigo(planSubjectAttachment({ ...base, keyword: assuntoD2({ received: false }), actorUserId: ATOR })), "NOT_RECEIVED");
  assert.equal(codigo(planSubjectAttachment({ ...base, keyword: assuntoD2({ semPacote: true }), actorUserId: ATOR })), "NO_APPROVED_PACKAGE");
  assert.equal(codigo(planSubjectAttachment({ ...base, keyword: assuntoD2({ brandId: OUTRA_MARCA }), actorUserId: ATOR })), "CROSS_BRAND");
  const semDeclaracao = linhaDaMesa({ id: "kw-comum", keyword: "marketing para clinicas", semantic: logica({ intent: "Comercial" }) });
  assert.equal(codigo(planSubjectAttachment({ ...base, keyword: semDeclaracao, actorUserId: ATOR })), "NOT_DECLARED");
});

test("prender recusa o Assunto como apoio, como tema excluído e, sem Volume, como principal (Q7)", () => {
  const base = { brandId: MARCA, keyword: assuntoD2(), actorUserId: ATOR, attachedAt: "2026-09-24T12:00:00+00:00" };
  const codigo = (resultado: ReturnType<typeof planSubjectAttachment>) => resultado.ok ? "OK" : resultado.code;
  assert.equal(codigo(planSubjectAttachment({ ...base, target: { principalKeywordId: "s1", keywords: [{ keywordId: ASSUNTO_ID, role: "reforco" }] } })), "SUPPORT_ROLE");
  assert.equal(codigo(planSubjectAttachment({ ...base, target: { principalKeywordId: ASSUNTO_ID } })), "PRINCIPAL_WITHOUT_VOLUME");
  assert.equal(codigo(planSubjectAttachment({ ...base, target: { principalKeywordId: "s1", excludedSubjects: ["SEO para clinicas"] } })), "EXCLUDED_SUBJECT");
  assert.equal(codigo(planSubjectAttachment({ ...base, keyword: assuntoComVolume(), target: { principalKeywordId: ASSUNTO_ID } })), "OK", "com Volume validado, Q7 aceita");
  assert.equal(codigo(planSubjectAttachment({ ...base, target: { principalKeywordId: "s1" } })), "OK");

  const subject = assuntoPreso();
  const comoPrincipal = artigo({ principalKeywordId: ASSUNTO_ID, keywordReferences: [referencia(ASSUNTO_ID, "principal"), referencia(SECUNDARIA, "secundaria"), referencia(REFORCO, "reforco_narrativo")] });
  const semVolume = attachSubjectToArticleDna(comoPrincipal, subject);
  assert.equal(semVolume.ok, false);
  assert.equal(semVolume.ok ? "" : semVolume.code, "PRINCIPAL_WITHOUT_VOLUME");
  assert.equal(attachSubjectToArticleDna(comoPrincipal, subject, { principalVolumeValidated: true }).ok, true);
});

test("o Assunto preso depois do Minerador: aviso, e nada troca sozinho", () => {
  const subject = assuntoPreso();
  assert.deepEqual(resolveAttachedSubjectStanding({ subject, keyword: assuntoD2() }), { state: "current", warning: null });
  const reaprovado = resolveAttachedSubjectStanding({ subject, keyword: assuntoD2({ version: 2 }) });
  assert.equal(reaprovado.state, "update_available");
  const retirado = resolveAttachedSubjectStanding({
    subject,
    keyword: linhaDaMesa({ id: ASSUNTO_ID, keyword: ASSUNTO_FRASE, version: 2, semantic: logica({ intent: "Comercial" }) }),
  });
  assert.equal(retirado.state, "withdrawn");
  assert.match(retirado.warning || "", /retirou a declaração/);
  assert.match(retirado.warning || "", /segue com o pacote aprovado v1; nada foi trocado/);
  assert.equal(resolveAttachedSubjectStanding({ subject, keyword: assuntoD2({ semPacote: true }) }).state, "in_review");
  assert.equal(resolveAttachedSubjectStanding({ subject, keyword: null }).state, "not_in_mesa");
});

test("o Silo sugere o mesmo Assunto ao artigo novo, que confirma", () => {
  const subject = assuntoPreso();
  const sugestao = suggestSubjectFromSilo({ silo: { name: "Marketing para clínicas", subject }, article: { subjectKeywordId: null } });
  assert.ok(sugestao);
  assert.equal(sugestao.keywordId, ASSUNTO_ID);
  assert.equal(sugestao.requiresConfirmation, true);
  assert.match(sugestao.reason, /Confirme para prender/);
  assert.equal(suggestSubjectFromSilo({ silo: { subject }, article: { subjectKeywordId: "outro-assunto" } }), null, "artigo com Assunto não recebe troca");
  assert.equal(suggestSubjectFromSilo({ silo: { subject: null }, article: {} }), null);

  const universo = buildArticleFormationUniverse({ ...formacaoDeReferencia(), siloSubjectKeywordId: ASSUNTO_ID });
  assert.ok(universo.candidates.every(candidate => candidate.suggestedSubjectKeywordId === ASSUNTO_ID && !candidate.subjectKeywordId),
    "a sugestão do Silo não prende nada");
});

test("a leitura do Vínculo mostra 'Assunto · declarado' e não muda sem declaração", () => {
  const comAssunto = readArchitectKeywordVinculo(assuntoD2());
  assert.equal(comAssunto.subjectLabel, "Assunto · declarado");
  assert.equal(comAssunto.subjectNote, ASSUNTO_NOTA);
  assert.match(comAssunto.summary, /Assunto · declarado/);
  const semAssunto = readArchitectKeywordVinculo(linhaDaMesa({ id: "kw-comum", keyword: "marketing para clinicas" }));
  assert.equal("subjectLabel" in semAssunto, false);
  assert.equal("subjectNote" in semAssunto, false);
});

/* ================================ 2. Q7 ================================ */

function universoComAssuntoPrincipal() {
  return buildArticleFormationUniverse({
    siloRef: SILO_REF,
    siloLabel: "Marketing para clínicas",
    siloSlug: "marketing-para-clinicas",
    keywords: [
      kwFormacao(ASSUNTO_ID, ASSUNTO_FRASE, { humanFormationRef: "formation:assunto", humanRole: "principal" }),
      kwFormacao("s1", "atrair pacientes estetica", { humanFormationRef: "formation:assunto", humanRole: "secundaria" }),
    ],
    subjectByCandidateRef: new Map([["formation:assunto", ASSUNTO_ID]]),
  });
}

test("Q7: Assunto como principal passa na conclusão só com Volume validado no pacote", () => {
  const universo = universoComAssuntoPrincipal();
  assert.equal(universo.candidates[0].principalKeywordId, ASSUNTO_ID);
  assert.equal(universo.candidates[0].subjectKeywordId, ASSUNTO_ID);

  const comVolume = portaria(universo, { subjectVolumeValidated: new Map([[ASSUNTO_ID, readArchitectSubjectStanding(assuntoComVolume()).volumeValidated]]) });
  assert.equal(readArchitectSubjectStanding(assuntoComVolume()).volumeValidated, true);
  assert.equal(comVolume.verdict.gates.find(gate => gate.code === "SUBJECT_PRINCIPAL_REQUIRES_VOLUME")?.ok, true);
  assert.equal(comVolume.verdict.ok, true);

  const semVolume = portaria(universo, {
    subjectVolumeValidated: new Map([[ASSUNTO_ID, readArchitectSubjectStanding(assuntoD2()).volumeValidated]]),
    subjectLabels: new Map([[ASSUNTO_ID, ASSUNTO_FRASE]]),
  });
  const gate = semVolume.verdict.gates.find(item => item.code === "SUBJECT_PRINCIPAL_REQUIRES_VOLUME");
  assert.equal(gate?.ok, false);
  assert.match(gate?.detail || "", /SEO para clínicas/);
  assert.equal(semVolume.verdict.ok, false, "Assunto da exceção D2 como principal barra o lote");

  assert.equal(portaria(universo).verdict.ok, false, "sem a leitura do Volume, a portaria não presume Volume");
});

test("Q7: o Assunto da exceção D2 nunca é eleito principal, nem por papel humano", () => {
  const universo = buildArticleFormationUniverse({
    siloRef: SILO_REF,
    siloLabel: "Marketing para clínicas",
    siloSlug: "marketing-para-clinicas",
    keywords: [
      kwFormacao(ASSUNTO_ID, ASSUNTO_FRASE, { humanFormationRef: "formation:x", humanRole: "principal", subjectHeldOut: true }),
      kwFormacao("s1", "atrair pacientes estetica", { humanFormationRef: "formation:x", humanRole: "secundaria" }),
    ],
  });
  assert.equal(universo.candidates.length, 1);
  assert.equal(universo.candidates[0].principalKeywordId, "s1");
  assert.equal(universo.candidates[0].suggestedSlug, "atrair-pacientes-estetica");
  assert.equal(universo.candidates[0].keywords.find(item => item.keywordId === ASSUNTO_ID)?.role, "secundaria", "fica como membro por ato humano");

  const sozinho = buildArticleFormationUniverse({
    siloRef: SILO_REF, siloLabel: "x", siloSlug: null,
    keywords: [kwFormacao(ASSUNTO_ID, ASSUNTO_FRASE, { humanFormationRef: "formation:y", humanRole: "principal", subjectHeldOut: true })],
  });
  assert.equal(sozinho.candidates.length, 0, "grupo humano só com o Assunto não vira artigo de uma frase sem busca");
  assert.deepEqual(sozinho.ungroupedKeywordIds, [ASSUNTO_ID], "e o Assunto não some");
  assert.deepEqual(sozinho.awaitingSupportSubjectKeywordIds, [ASSUNTO_ID]);
});

test("a portaria sem Assunto não ganha contrato novo", () => {
  const { verdict } = portaria(buildArticleFormationUniverse(formacaoDeReferencia()));
  assert.equal(verdict.gates.some(gate => gate.code === "SUBJECT_PRINCIPAL_REQUIRES_VOLUME"), false);
  assert.match(verdict.gates.find(gate => gate.code === "NO_UNRESOLVED_CANNIBALIZATION")!.detail, /mesmo tema/);
});

/* ============================ 3. conservação ============================ */

test("conservação · predicado único: isAnchoredSubject lê ArticleDNA e cópia de trabalho", () => {
  const artigos = [{ subject: { keywordId: ASSUNTO_ID } }, { subjectKeywordId: ASSUNTO_ID }, { subjectKeywordId: null }, {}];
  assert.equal(isAnchoredSubject(ASSUNTO_ID, artigos), true);
  assert.equal(isAnchoredSubject("outra", artigos), false);
  assert.equal(countSubjectAnchors(ASSUNTO_ID, artigos), 2);
  assert.deepEqual([...anchoredSubjectKeywordIds(artigos)], [ASSUNTO_ID]);
  assert.equal(subjectTrunkLabel(1), "Assunto · tronco de 1 artigo");
  assert.equal(subjectTrunkLabel(2), "Assunto · tronco de 2 artigos");
  assert.equal(subjectConservationLabel({ declared: true, anchoredArticleCount: 0 }), SUBJECT_AWAITING_SUPPORT_LABEL);
  assert.equal(subjectConservationLabel({ declared: false, anchoredArticleCount: 0 }), null);
});

test("conservação · não agrupadas da mesa: sem artigo leva o selo; ancorado sai com 'tronco de N'", () => {
  const semArtigo = splitUngroupedBySubjectAnchor({
    ungroupedKeywordIds: [ASSUNTO_ID, "kw-comum"],
    articles: [],
    isDeclaredSubject: id => id === ASSUNTO_ID,
  });
  assert.deepEqual(semArtigo.ungrouped, [
    { keywordId: ASSUNTO_ID, label: "Assunto · aguardando sustentação" },
    { keywordId: "kw-comum", label: null },
  ]);
  assert.deepEqual(semArtigo.anchored, []);

  const ancorado = splitUngroupedBySubjectAnchor({
    ungroupedKeywordIds: [ASSUNTO_ID, "kw-comum"],
    articles: [{ subjectKeywordId: ASSUNTO_ID }, { subject: { keywordId: ASSUNTO_ID } }],
    isDeclaredSubject: id => id === ASSUNTO_ID,
  });
  assert.deepEqual(ancorado.anchored, [{ keywordId: ASSUNTO_ID, label: "Assunto · tronco de 2 artigos", articleCount: 2 }]);
  assert.deepEqual(ancorado.ungrouped, [{ keywordId: "kw-comum", label: null }]);
});

test("conservação · servidor: o tronco conta como incorporado, e o servidor usa o predicado nos dois pontos", () => {
  const dna = { keywordReferences: [{ keywordId: "s1" }, { keywordId: "s2" }], subject: { keywordId: ASSUNTO_ID } };
  assert.deepEqual(articleDnaIncorporatedKeywordIds(dna as never), ["s1", "s2", ASSUNTO_ID]);
  assert.deepEqual(articleDnaIncorporatedKeywordIds({ keywordReferences: [{ keywordId: "s1" }] } as never), ["s1"]);

  const elegibilidade = resolveCanonicalMineradorArquitetoImportEligibility({
    brandId: MARCA,
    keywords: [ASSUNTO_ID, "s1", "livre"].map(id => ({ id, brandId: MARCA, status: "aprovado", sourceVersionId: null, contentHash: null })),
    workflowItems: [],
    articleDnaKeywordIds: new Set(articleDnaIncorporatedKeywordIds(dna as never)),
  });
  const por = new Map(elegibilidade.map(item => [item.keywordId, item.importability]));
  assert.equal(por.get(ASSUNTO_ID), CANONICAL_IMPORTABILITY.ARTICLE_DNA_INCORPORATED);
  assert.equal(por.get("livre"), CANONICAL_IMPORTABILITY.IMPORTABLE);

  const servidor = readFileSync(new URL("../lib/server/arquiteto-workspace.ts", import.meta.url), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
  assert.equal(servidor.split("articleDnaIncorporatedKeywordIds(version.payload)").length - 1, 2);
  assert.doesNotMatch(servidor, /version\.payload\.keywordReferences\.map\(reference => reference\.keywordId\)/);
});

function cenario(articles: unknown[], ungrouped: string[], universe: string[]): ArchitectureScenario {
  return {
    schemaVersion: 1, scenarioId: "cenario-1", brandId: MARCA, scenarioType: "human", capability: "complete",
    universe: { keywordIds: universe, contentHash: "sha256:" + "0".repeat(64) }, baseRef: null, sourceRefs: [],
    provenance: { producedBy: "human", adoptedFromScenarioType: null, humanAdjustmentCount: 0, note: null },
    level: "article", articles, ungroupedKeywordIds: ungrouped,
  } as unknown as ArchitectureScenario;
}

const artigoDoCenario = (articleRef: string, principal: string, extra: Record<string, unknown> = {}) => ({
  articleRef, publishedAnchorId: null, principalKeywordId: principal,
  keywords: [{ keywordId: principal, role: "principal" }], protections: { principalPolicy: null, publishedUrl: null }, ...extra,
});

test("conservação · partição do cenário: o tronco em dois artigos é coberto, sem DUPLICATE nem MISSING", () => {
  assert.equal(ArticleScenarioSchema.safeParse(artigoDoCenario("a1", "s1", { subjectKeywordId: ASSUNTO_ID })).success, true);
  const universo = ["s1", "s2", ASSUNTO_ID];
  const comTronco = validateArchitectureScenario(cenario([
    artigoDoCenario("a1", "s1", { subjectKeywordId: ASSUNTO_ID }),
    artigoDoCenario("a2", "s2", { subjectKeywordId: ASSUNTO_ID }),
  ], [], universo));
  assert.deepEqual(comTronco.issues, []);
  assert.equal(comTronco.valid, true);

  const semTronco = validateArchitectureScenario(cenario([artigoDoCenario("a1", "s1"), artigoDoCenario("a2", "s2")], [], universo));
  assert.deepEqual(semTronco.issues.map(issue => issue.code), ["KEYWORD_MISSING_FROM_COMPLETE_SCENARIO"], "controle: sem o tronco, a keyword faltaria");
});

test("conservação · sobras da formação: ancorado não volta; sem artigo volta com o selo", () => {
  const entrada = {
    siloRef: SILO_REF, siloLabel: "Marketing para clínicas", siloSlug: "marketing-para-clinicas",
    keywords: [
      kwFormacao(ASSUNTO_ID, ASSUNTO_FRASE, { subjectHeldOut: true }),
      kwFormacao("s1", "atrair pacientes estetica", { humanFormationRef: "formation:a", humanRole: "principal" }),
      kwFormacao("s2", "agendamento online consultorio", { humanFormationRef: "formation:b", humanRole: "principal" }),
    ],
  };
  const semArtigo = buildArticleFormationUniverse(entrada);
  assert.ok(semArtigo.candidates.every(candidate => candidate.keywords.every(item => item.keywordId !== ASSUNTO_ID)), "fora da formação automática");
  assert.deepEqual(semArtigo.ungroupedKeywordIds, [ASSUNTO_ID]);
  assert.deepEqual(semArtigo.awaitingSupportSubjectKeywordIds, [ASSUNTO_ID]);

  const ancorado = buildArticleFormationUniverse({
    ...entrada,
    subjectByCandidateRef: new Map([["formation:a", ASSUNTO_ID], ["formation:b", ASSUNTO_ID]]),
  });
  assert.deepEqual(ancorado.ungroupedKeywordIds, []);
  assert.deepEqual(ancorado.anchoredSubjectKeywordIds, [ASSUNTO_ID]);
  assert.equal("awaitingSupportSubjectKeywordIds" in ancorado, false);
  assert.deepEqual(ancorado.candidates.map(candidate => candidate.subjectKeywordId), [ASSUNTO_ID, ASSUNTO_ID]);

  // Nenhuma keyword some: toda keyword está num candidato, nas sobras ou ancorada.
  for (const universo of [semArtigo, ancorado]) {
    const vistas = new Set([
      ...universo.candidates.flatMap(candidate => candidate.keywords.map(item => item.keywordId)),
      ...universo.ungroupedKeywordIds,
      ...(universo.anchoredSubjectKeywordIds || []),
      ...universo.matchedToPublished.map(item => item.keywordId),
    ]);
    assert.deepEqual([...vistas].sort(), universo.keywordIds.slice().sort());
  }
});

test("conservação · conclusão: o tronco em dois artigos não dispara NO_DUPLICATED_KEYWORD nem o teto", () => {
  const seis = ["s1", "s2", "s3", "s4", "s5", "s6"];
  const universo = buildArticleFormationUniverse({
    siloRef: SILO_REF, siloLabel: "Marketing para clínicas", siloSlug: "marketing-para-clinicas",
    keywords: [
      kwFormacao(ASSUNTO_ID, ASSUNTO_FRASE, { subjectHeldOut: true }),
      ...seis.map((id, index) => kwFormacao(id, `sustentacao ${id} clinica`, { humanFormationRef: "formation:cheio", humanRole: index === 0 ? "principal" : "reforco" })),
      kwFormacao("t1", "google meu negocio consultorio", { humanFormationRef: "formation:outro", humanRole: "principal" }),
    ],
    subjectByCandidateRef: new Map([["formation:cheio", ASSUNTO_ID], ["formation:outro", ASSUNTO_ID]]),
  });
  const cheio = universo.candidates.find(candidate => candidate.candidateRef === "formation:cheio")!;
  assert.equal(cheio.keywords.length, 6, "seis membros, mais o tronco fora do teto");
  const { verdict, plan } = portaria(universo, { subjectVolumeValidated: new Map([[ASSUNTO_ID, false]]) });
  const gate = (code: string) => verdict.gates.find(item => item.code === code)?.ok;
  assert.equal(gate("NO_DUPLICATED_KEYWORD"), true);
  assert.equal(gate("KEYWORD_CEILING"), true);
  assert.equal(gate("SUBJECT_PRINCIPAL_REQUIRES_VOLUME"), true, "o tronco não é principal aqui");
  assert.equal(verdict.ok, true);
  assert.deepEqual(plan.approved.map(entry => entry.subjectKeywordId), [ASSUNTO_ID, ASSUNTO_ID]);
  assert.ok(plan.approved.every(entry => !entry.keywordIds.includes(ASSUNTO_ID)), "o tronco não vira membro na materialização");
});

test("conservação · o Assunto preso como apoio do mesmo artigo vira conflito e não é gravado", () => {
  const universo = buildArticleFormationUniverse({
    siloRef: SILO_REF, siloLabel: "x", siloSlug: "x",
    keywords: [
      kwFormacao("s1", "atrair pacientes estetica", { humanFormationRef: "formation:a", humanRole: "principal" }),
      kwFormacao(ASSUNTO_ID, ASSUNTO_FRASE, { humanFormationRef: "formation:a", humanRole: "reforco", subjectHeldOut: true }),
    ],
    subjectByCandidateRef: new Map([["formation:a", ASSUNTO_ID]]),
  });
  assert.match(universo.candidates[0].conflicts.join(" "), /não pode ser secundária nem reforço/);
  const plan = buildArticleFormationConfirmationPlan({ universes: [universo] });
  assert.equal(plan.approved.length, 0);
  assert.equal(plan.blocked[0].code, "FORMATION_CONFLICT");
});

test("conservação · motor legado: Assunto sem Volume fora dos grupos; ancorado fora das sobras", () => {
  const assunto = { id: "m9", keyword: "seo para clinicas", intent: "Comercial", volume_search: null, results_allintitle: null, kgr_score: null, lista_id: LISTA_CLINICAS, analise_semantica: { entidade_central: "clínica" } };
  const entrada = [...motorDeReferencia(), assunto];
  const retido = buildDeterministicArticleArchitecture(entrada, { heldOutKeywordIds: new Set(["m9"]) });
  assert.ok(retido.groups.every(group => !group.keywordIds.includes("m9")));
  assert.ok(retido.ungrouped.some(keyword => keyword.id === "m9"), "sem artigo, continua visível");
  assert.equal("anchoredSubjects" in retido, false);

  const ancorado = buildDeterministicArticleArchitecture(entrada, { heldOutKeywordIds: new Set(["m9"]), anchoredKeywordIds: new Set(["m9"]) });
  assert.ok(ancorado.ungrouped.every(keyword => keyword.id !== "m9"));
  assert.deepEqual(ancorado.anchoredSubjects?.map(keyword => keyword.id), ["m9"]);

  const semAssunto = buildDeterministicArticleArchitecture(motorDeReferencia(), { heldOutKeywordIds: new Set(), anchoredKeywordIds: new Set() });
  assert.equal(sha(semAssunto), DOURADO_MOTOR, "conjuntos vazios: motor idêntico");
});

test("conservação · território: o tronco ancorado não é 'sem território'", () => {
  const assignment = (keywordId: string) => ({ keywordId, brandId: MARCA, territoryRef: null, state: "unassigned" as const, reason: "sem Silo", source: "human" as const, decidedAt: "2026-09-24T10:00:00+00:00" });
  const copia: TerritoryWorkingCopy = {
    brandId: MARCA,
    territories: [],
    keywords: [
      { keywordId: ASSUNTO_ID, brandId: MARCA, workflowItemId: "wf-1", lockVersion: 1, isPublished: false, assignment: assignment(ASSUNTO_ID) },
      { keywordId: "s1", brandId: MARCA, workflowItemId: "wf-2", lockVersion: 1, isPublished: false, assignment: assignment("s1") },
      { keywordId: "s2", brandId: MARCA, workflowItemId: "wf-3", lockVersion: 1, isPublished: false, assignment: null },
    ],
  };
  const antes = deriveTerritorialWorkingView(copia);
  assert.deepEqual(antes.unassignedKeywordIds, [ASSUNTO_ID, "s1"]);
  assert.deepEqual(deriveTerritorialWorkingView(copia, { anchoredKeywordIds: new Set() }), antes, "sem tronco, a projeção é a de antes");

  const depois = deriveTerritorialWorkingView(copia, { anchoredKeywordIds: new Set([ASSUNTO_ID]) });
  assert.deepEqual(depois.unassignedKeywordIds, ["s1"]);
  assert.deepEqual(depois.unaddressedKeywordIds, ["s2"]);
  assert.deepEqual(depois.anchoredSubjectKeywordIds, [ASSUNTO_ID]);
});

test("conservação · proposta de arquitetura: o tronco não é 'sem Silo' e conta como resolvido", () => {
  const sinais = [ASSUNTO_ID, "s1"].map(keywordId => resolveKeywordDnaSignals({ keywordId, text: keywordId, semantic: {} }));
  const analise = { clusters: [], summary: { keywords: 2, clusters: 0, strengthening: 0, newSilos: 0, insufficient: 0, ambiguous: 0, confidence: "baixa" as const }, narrative: [], baseHash: "base" };
  const base = { analysis: analise, existingSilos: [], keywords: sinais, slugOf: (value: string) => value };
  const antes = buildArchitectureWorkingProposal(base);
  assert.deepEqual(antes.unassigned.map(item => item.keywordId), [ASSUNTO_ID, "s1"]);
  assert.deepEqual(buildArchitectureWorkingProposal({ ...base, anchoredSubjectKeywordIds: new Set() }), antes, "sem tronco: mesma proposta, mesmo hash");

  const depois = buildArchitectureWorkingProposal({ ...base, anchoredSubjectKeywordIds: new Set([ASSUNTO_ID]) });
  assert.deepEqual(depois.unassigned.map(item => item.keywordId), ["s1"]);
  assert.deepEqual(depois.anchoredSubjects?.map(item => item.keywordId), [ASSUNTO_ID]);
  assert.equal(depois.counters.RESOLVED_KEYWORDS, 2);
  assert.equal(depois.counters.EXPLICIT_UNASSIGNED, 1);
  assert.equal(proposalCoversScope(depois).ok, true);
  assert.notEqual(depois.proposalHash, antes.proposalHash, "a proposta mudou, o hash muda");
});

test("conservação · conjuntos da mesa: retidos pelo pacote, ancorados pelos artigos", () => {
  const sets = subjectFormationSets({
    keywords: [assuntoD2(), linhaDaMesa({ id: "s1", keyword: "atrair pacientes estetica", semantic: VOLUME_VALIDADO }), assuntoComVolume()],
    articles: [{ subjectKeywordId: "outro" }],
  });
  assert.deepEqual([...sets.heldOut], [ASSUNTO_ID], "só o Assunto sem Volume fica retido");
  assert.deepEqual([...sets.anchored], ["outro"]);
});

/* ===================== 3b. correções da revisão da fase B ===================== */

test("conservação · vínculo da sessão com ref que não existe não ancora: o Assunto volta às sobras com o selo", () => {
  const universo = buildArticleFormationUniverse({
    siloRef: SILO_REF, siloLabel: "Marketing para clínicas", siloSlug: "marketing-para-clinicas",
    keywords: [
      kwFormacao(ASSUNTO_ID, ASSUNTO_FRASE, { subjectHeldOut: true }),
      kwFormacao("s1", "atrair pacientes estetica", { humanFormationRef: "formation:f1", humanRole: "principal" }),
      kwFormacao("s2", "agendamento online consultorio", { humanFormationRef: "formation:f1", humanRole: "secundaria" }),
    ],
    subjectByCandidateRef: new Map([["formation:fantasma", ASSUNTO_ID]]),
  });
  assert.deepEqual(universo.candidates.map(candidate => candidate.subjectKeywordId), [undefined]);
  assert.deepEqual(universo.ungroupedKeywordIds, [ASSUNTO_ID]);
  assert.deepEqual(universo.awaitingSupportSubjectKeywordIds, [ASSUNTO_ID]);
  assert.equal("anchoredSubjectKeywordIds" in universo, false, "sem candidato vivo, não há tronco");
});

test("conservação · tronco solto gravado sai da formação automática: não vira reforço de ninguém", () => {
  const base = buildArticleFormationUniverse({ ...formacaoDeReferencia(), groups: [] });
  const k5 = base.candidates.find(candidate => candidate.principalKeywordId === "k5")!;
  assert.deepEqual(k5.keywords.map(item => item.keywordId), ["k5", "k6"], "controle: sem o Assunto, k6 é reforço de k5");

  const comTronco = buildArticleFormationUniverse({
    ...formacaoDeReferencia(),
    groups: [],
    keywords: formacaoDeReferencia().keywords.map(keyword => keyword.keywordId === "k6" ? { ...keyword, subjectAnchored: true } : keyword),
  });
  assert.ok(comTronco.candidates.every(candidate => candidate.keywords.every(item => item.keywordId !== "k6")), "o tronco fica com clusterId vazio");
  assert.deepEqual(comTronco.anchoredSubjectKeywordIds, ["k6"]);
  assert.ok(!comTronco.ungroupedKeywordIds.includes("k6"));

  const pelosGruposDoMotor = buildArticleFormationUniverse({
    ...formacaoDeReferencia(),
    groups: [{ principalKeywordId: "k5", keywordIds: ["k5", "k6"] }],
    keywords: formacaoDeReferencia().keywords.map(keyword => keyword.keywordId === "k6" ? { ...keyword, subjectAnchored: true } : keyword),
  });
  assert.deepEqual(pelosGruposDoMotor.candidates.find(candidate => candidate.principalKeywordId === "k5")!.keywords.map(item => item.keywordId), ["k5"]);

  const porDecisaoHumana = buildArticleFormationUniverse({
    ...formacaoDeReferencia(),
    groups: [],
    keywords: formacaoDeReferencia().keywords.map(keyword => keyword.keywordId === "k6" ? { ...keyword, subjectAnchored: true, humanFormationRef: "formation:human-1", humanRole: "secundaria" } : keyword),
  });
  assert.ok(porDecisaoHumana.candidates.find(candidate => candidate.candidateRef === "formation:human-1")!.keywords.some(item => item.keywordId === "k6"), "só a decisão humana o põe num artigo");
});

test("conservação · tronco preso na sessão também sai da automática, menos como principal do próprio candidato (Q7)", () => {
  const entrada = { ...formacaoDeReferencia(), groups: [] };
  const naSessao = buildArticleFormationUniverse({ ...entrada, subjectByCandidateRef: new Map([["formation:human-1", "k6"]]) });
  assert.ok(naSessao.candidates.every(candidate => candidate.keywords.every(item => item.keywordId !== "k6")));
  assert.equal(naSessao.candidates.find(candidate => candidate.candidateRef === "formation:human-1")!.subjectKeywordId, "k6");
  assert.deepEqual(naSessao.anchoredSubjectKeywordIds, ["k6"]);

  const refDoCandidato = `article-candidate:${SILO_REF}:k5`;
  const principal = buildArticleFormationUniverse({ ...entrada, subjectByCandidateRef: new Map([[refDoCandidato, "k5"]]) });
  const k5 = principal.candidates.find(candidate => candidate.candidateRef === refDoCandidato)!;
  assert.equal(k5.principalKeywordId, "k5");
  assert.equal(k5.subjectKeywordId, "k5");

  assert.deepEqual([...automaticFormationHoldouts({ siloRef: SILO_REF, keywords: entrada.keywords })], [], "sem Assunto, ninguém fica de fora");
  assert.deepEqual(
    [...automaticFormationHoldouts({ siloRef: SILO_REF, keywords: entrada.keywords, subjectByCandidateRef: new Map([["formation:fantasma", "k6"], [`article-candidate:${SILO_REF}:k1`, "k7"]]) })],
    [],
    "ref que não pode existir (formação sem membro, candidato cuja principal já foi decidida) não tira ninguém",
  );
});

test("conservação · motor legado: o tronco solto também fica fora dos grupos", () => {
  const controle = buildDeterministicArticleArchitecture(motorDeReferencia());
  assert.ok(controle.groups.some(group => group.keywordIds.includes("m3")), "controle: sem o Assunto, m3 forma grupo");
  const comTronco = buildDeterministicArticleArchitecture(motorDeReferencia(), { anchoredKeywordIds: new Set(["m3"]) });
  assert.ok(comTronco.groups.every(group => !group.keywordIds.includes("m3")));
  assert.deepEqual(comTronco.anchoredSubjects?.map(keyword => keyword.id), ["m3"]);
  assert.ok(comTronco.ungrouped.every(keyword => keyword.id !== "m3"));
});

test("conservação · o Assunto que é a principal de alguma unidade não é tronco solto", () => {
  const unidades = [
    { subject: { keywordId: ASSUNTO_ID }, principalKeywordId: ASSUNTO_ID },
    { subject: { keywordId: "outro" }, principalKeywordId: "p1" },
    { subjectKeywordId: "terceiro", principalKeywordId: "p2" },
  ];
  assert.deepEqual([...trunkAnchoredKeywordIds(unidades)].sort(), ["outro", "terceiro"]);
  assert.deepEqual([...subjectFormationSets({ keywords: [], articles: unidades }).anchored].sort(), ["outro", "terceiro"]);
  assert.equal(isAnchoredSubject(ASSUNTO_ID, unidades), true, "continua contando como preso para a conservação");
});

test("prender outro Assunto numa unidade que já tem um é recusado; o mesmo Assunto com pacote novo atualiza", () => {
  const subject = assuntoPreso();
  const outro: DeclaredSubject = { ...subject, keywordId: "kw-outro-assunto", phrase: "Outro assunto" };
  const comAssunto = attachSubjectToArticleDna(artigo(), subject);
  assert.ok(comAssunto.ok);
  const troca = attachSubjectToArticleDna(comAssunto.value, outro);
  assert.equal(troca.ok, false);
  assert.equal(troca.ok ? null : troca.code, "ANOTHER_SUBJECT_ATTACHED");
  assert.equal(troca.ok ? null : troca.reason, SUBJECT_ANOTHER_ATTACHED_REASON);

  const pacoteNovo: DeclaredSubject = { ...subject, approvedPackageRef: { ...subject.approvedPackageRef, version: 2, contentHash: `pkg-${ASSUNTO_ID}-v2` } };
  const atualizado = attachSubjectToArticleDna(comAssunto.value, pacoteNovo);
  assert.ok(atualizado.ok);
  assert.equal(atualizado.changed, true);

  const siloComAssunto = attachSubjectToSiloDna(silo(), subject);
  assert.ok(siloComAssunto.ok);
  const trocaNoSilo = attachSubjectToSiloDna(siloComAssunto.value, outro);
  assert.equal(trocaNoSilo.ok ? null : trocaNoSilo.code, "ANOTHER_SUBJECT_ATTACHED");
  assert.equal(attachSubjectToSiloDna(siloComAssunto.value, pacoteNovo).ok, true);
});

/* ========================= 4. formação sem Assunto ========================= */

test("formação, plano, portaria e motor sem Assunto: byte a byte os de antes", () => {
  const universo = buildArticleFormationUniverse(formacaoDeReferencia());
  assert.equal(sha(universo), DOURADO_FORMACAO);
  const { plan, verdict } = portaria(universo);
  assert.equal(sha(plan), DOURADO_PLANO);
  const antes = JSON.parse(JSON.stringify(verdict).replaceAll("mesmo tema", "mesmo assunto"));
  assert.equal(sha(antes), DOURADO_PORTARIA, "a portaria só trocou 'assunto' por 'tema'");
  assert.equal(sha(buildDeterministicArticleArchitecture(motorDeReferencia())), DOURADO_MOTOR);

  const comCamposVazios = buildArticleFormationUniverse({
    ...formacaoDeReferencia(),
    keywords: formacaoDeReferencia().keywords.map(keyword => ({ ...keyword, subjectHeldOut: false, subjectAnchored: false })),
    subjectByCandidateRef: new Map(),
  });
  assert.equal(sha(comCamposVazios), DOURADO_FORMACAO, "campos do Assunto desligados não mudam nada");
});

test("keyword comum segue a formação de hoje com um Assunto retido no lote", () => {
  const referencia = buildArticleFormationUniverse(formacaoDeReferencia());
  const comAssunto = buildArticleFormationUniverse({
    ...formacaoDeReferencia(),
    keywords: [...formacaoDeReferencia().keywords, kwFormacao(ASSUNTO_ID, "skin care oleosa", { subjectHeldOut: true })],
  });
  assert.deepEqual(comAssunto.candidates, referencia.candidates, "o Assunto sem Volume não entra em grupo nenhum, nem por afinidade");
  assert.deepEqual(comAssunto.ungroupedKeywordIds, [...referencia.ungroupedKeywordIds, ASSUNTO_ID]);
});

/* =============================== 5. sugestões =============================== */

const sustentacao = (id: string, keyword: string, semantic: Record<string, unknown>, extra: Record<string, unknown> = {}) =>
  linhaDaMesa({ id, keyword, semantic: { ...VOLUME_VALIDADO, ...semantic }, ...extra });

test("sugestões · 'SEO para clínicas' com três sustentações sem palavra em comum: entidade central, depois a nota", () => {
  const keywords = [
    sustentacao("s3", "google meu negocio consultorio", logica({ entity: "presença local" }), { listaId: "outra" }),
    sustentacao("s1", "atrair pacientes estetica", logica({ entity: "captação de pacientes" }), { listaId: "outra" }),
    sustentacao("s2", "agendamento online consultorio", logica({ entity: "Marketing para Clínicas" }), { listaId: "outra" }),
    // Fora: não recebida, outra marca, outro Assunto sem Volume, sem sinal nenhum.
    sustentacao("x1", "marketing odontologico", logica({ entity: "marketing para clínicas" }), { received: false }),
    sustentacao("x2", "marketing para veterinarios", logica({ entity: "marketing para clínicas" }), { brandId: OUTRA_MARCA }),
    linhaDaMesa({ id: "x3", keyword: "gestao de clinicas", semantic: { ...logica({ entity: "marketing para clínicas" }), ...declarado("Outro tronco.") } }),
    sustentacao("x4", "receita de bolo", logica({ entity: "confeitaria" }), { listaId: "outra" }),
    { ...sustentacao("x5", "marketing para psicologos", logica({ entity: "marketing para clínicas" })), canonicalWorkflow: { state: "blocked", payload: {} } },
  ];
  const devolvida = sustentacao("x6", "marketing para fisioterapeutas", logica({ entity: "marketing para clínicas" }));
  (devolvida.canonicalWorkflow as { state: string }).state = "returned";
  keywords.push(devolvida);
  for (const keyword of keywords.filter(item => ["s1", "s2", "s3"].includes(String(item.id)))) {
    assert.ok(!/seo|clinica/i.test(String(keyword.keyword).normalize("NFD").replace(/[̀-ͯ]/g, "")), "sem palavra em comum com a frase");
  }

  const sugestoes = suggestSubjectSupport({ brandId: MARCA, subjectKeyword: assuntoD2(), keywords, memberKeywordIds: new Set(["s3"]) });
  assert.deepEqual(sugestoes.map(item => item.keywordId), ["s2", "s1", "s3"]);
  assert.deepEqual(sugestoes[0].signals, ["central_entity"]);
  assert.match(sugestoes[0].reason, /^Mesma entidade central da Lógica\.$/);
  assert.deepEqual(sugestoes[1].sharedNoteTerms, ["atrair", "estetica", "paciente"]);
  assert.match(sugestoes[1].reason, /^Termos em comum com a nota \(atrair, estetica, paciente\)\.$/);
  assert.deepEqual(sugestoes[2].sharedNoteTerms, ["google"]);
  assert.equal(sugestoes[2].alreadyInArticle, true, "já em artigo: aparece só como informação");
  assert.equal(sugestoes[0].alreadyInArticle, false);
});

test("sugestões · a Pesquisa por Assunto vem primeiro, depois a mesma frase, depois lista e intenção", () => {
  const busca = (id: string, subjectKeywordId: string | null, subjectPhrase: string) => ({
    subject_discovery: {
      version: 1,
      subjectKeywordIds: subjectKeywordId ? [subjectKeywordId] : [],
      searches: [{ searchId: id, importRequestId: `req-${id}`, importedAt: "2026-09-24T08:00:00+00:00", actorId: ATOR, subjectKeywordId, subjectPhrase, origins: ["labs_ranked"], evidence: ["ranqueia em #3 em exemplo.com.br"], provenanceVerified: false }],
    },
  });
  const keywords = [
    sustentacao("lista", "planilha de pacientes", logica({ entity: "gestão" }), { listaId: LISTA_CLINICAS }),
    sustentacao("intencao", "consultoria de anuncios", logica({ entity: "anúncios", intent: "Comercial", funnel: "BOFU" }), { listaId: "outra" }),
    sustentacao("frase", "trafego pago dentistas", { ...logica({ entity: "anúncios" }), ...busca("b-2", null, "seo para CLINICAS") }, { listaId: "outra" }),
    sustentacao("pesquisa", "anuncios para dermatologistas", { ...logica({ entity: "anúncios" }), ...busca("b-1", ASSUNTO_ID, ASSUNTO_FRASE) }, { listaId: "outra" }),
    sustentacao("outro-assunto", "anuncios para nutricionistas", { ...logica({ entity: "anúncios" }), ...busca("b-3", "kw-outro", "outra frase") }, { listaId: "outra" }),
  ];
  const sugestoes = suggestSubjectSupport({ brandId: MARCA, subjectKeyword: assuntoD2(), keywords });
  assert.deepEqual(sugestoes.map(item => item.keywordId), ["pesquisa", "frase", "lista", "intencao"]);
  assert.deepEqual(sugestoes[0].signals, ["subject_discovery"]);
  assert.match(sugestoes[0].reason, /^Veio da Pesquisa por Assunto/);
  assert.deepEqual(sugestoes[0].discoveryEvidence, ["ranqueia em #3 em exemplo.com.br"]);
  assert.deepEqual(sugestoes[1].signals, ["subject_discovery_phrase"]);
  assert.deepEqual(sugestoes[3].signals, ["intent_funnel"], "MOFU e BOFU são vizinhos");
  assert.equal(suggestSubjectSupport({ brandId: MARCA, subjectKeyword: assuntoD2(), keywords, limit: 1 }).length, 1);
});

test("sugestões · isolamento: Assunto de outra marca não sugere nada, e keyword comum não é Assunto", () => {
  const keywords = [sustentacao("s2", "agendamento online consultorio", logica({ entity: "marketing para clínicas" }))];
  assert.deepEqual(suggestSubjectSupport({ brandId: MARCA, subjectKeyword: assuntoD2({ brandId: OUTRA_MARCA }), keywords }), []);
  assert.deepEqual(suggestSubjectSupport({ brandId: MARCA, subjectKeyword: keywords[0], keywords }), []);
  assert.deepEqual(suggestSubjectSupport({ brandId: OUTRA_MARCA, subjectKeyword: assuntoD2(), keywords }), []);
});

/* ================================= 6. slug ================================= */

test("slug: a principal eleita entre as sustentações dá o slug; o Assunto nunca", () => {
  const universo = buildArticleFormationUniverse({
    siloRef: SILO_REF,
    siloLabel: "Marketing para clínicas",
    siloSlug: "marketing",
    keywords: [
      kwFormacao(ASSUNTO_ID, ASSUNTO_FRASE, { subjectHeldOut: true, volume: null }),
      kwFormacao("s1", "atrair pacientes estetica", { humanFormationRef: "formation:clinicas", volume: 90 }),
      kwFormacao("s2", "agendamento online consultorio", { humanFormationRef: "formation:clinicas", volume: 480 }),
    ],
    subjectByCandidateRef: new Map([["formation:clinicas", ASSUNTO_ID]]),
  });
  assert.equal(universo.candidates.length, 1);
  const candidato = universo.candidates[0];
  assert.equal(candidato.principalKeywordId, "s1");
  assert.equal(candidato.suggestedSlug, "atrair-pacientes-estetica");
  assert.equal(candidato.subjectKeywordId, ASSUNTO_ID);
  const plan = buildArticleFormationConfirmationPlan({ universes: [universo] });
  assert.equal(plan.approved[0].slug, "atrair-pacientes-estetica");
  assert.equal(plan.approved[0].fullPath, "marketing/atrair-pacientes-estetica");
  assert.doesNotMatch(plan.approved[0].fullPath, /seo/);
});

/* ================================= rede ================================= */

test("nenhuma chamada de rede em todo o arquivo", () => {
  assert.equal(chamadasDeRede, 0);
});
