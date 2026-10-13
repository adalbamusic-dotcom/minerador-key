/**
 * 2026-10-12 — PENDÊNCIAS DA FASE (SDD `sdd-plano-declarado-e-grupos-2026-10-12.md`):
 *
 *   D2(a)  parecer pelas sustentações quando a principal declarada não tem SERP;
 *   §11-7  aplicar o plano declarado a um Silo já consolidado (Pilar, ordem, nome);
 *   §11-6  a mesa aplica o evento `rejected` (keywords voltam a "não agrupadas").
 *
 * Domínio puro, só fixtures: nenhuma rede, nenhum provider, nenhum banco.
 */
import assert from "node:assert/strict";
import test from "node:test";
import {
  DECLARED_PRINCIPAL_NOT_OBSERVED_REASON,
  DECLARED_PRINCIPAL_SUPPORT_BASIS_PREFIX,
  applyDeclaredPrincipalSupportBasis,
  declaredPrincipalSupportBasisReason,
  interpretArticleSerpAcrossLenses,
  selectDeclaredPrincipalSupports,
  type KeywordSerpFacts,
} from "../lib/arquiteto/article-serp-interpretation.ts";
import { serpAssessmentComposition, serpCompositionMismatch } from "../lib/arquiteto/published-formation-serp.ts";
import { applySerpSupportBasisProvenance } from "../lib/arquiteto/declared-plan-formation.ts";
import { resolveImprovementNextStep } from "../lib/arquiteto/article-improvement-next-step.ts";
import { releaseRejectedArticles, effectiveArtifactStatus } from "../lib/arquiteto/rejected-article-release.ts";
import { buildSiloDeclaredPlanVersions, planSiloDeclaredPlanApplication, SILO_DECLARED_PLAN_GRAPH_WARNING } from "../lib/arquiteto/silo-declared-plan-application.ts";
import { buildProvisionalGroups } from "../lib/arquiteto/engine.ts";
import { deterministicArticleDnaPayload } from "../lib/arquiteto/adapters.ts";
import { chooseSiloWorkingCopyPillar, formSiloWorkingCopies } from "../lib/arquiteto/silo-formation.ts";
import { buildConsolidatedSiloDnaPayload, buildConsolidatedSiloPagePayload } from "../lib/arquiteto/silo-consolidation.ts";
import { createVersionEnvelope } from "../lib/arquiteto/versioning.ts";
import type { ArticleDNA, SiloDNA, SiloPage, VersionEnvelope } from "../lib/arquiteto/contracts.ts";
import type { DeclaredSiloPlanEntry } from "../lib/arquiteto/silo-declared-plan.ts";

/* ================================ D2(a) ================================ */

const fatos = (keywordId: string, urls: string[]): KeywordSerpFacts => ({
  keywordId, keyword: keywordId, role: "secundaria",
  results: urls.map((url, index) => ({ position: index + 1, title: url, url: `https://${url}`, domain: url.split("/")[0], snippet: "", inferredType: "article" })),
});

test("D2(a) · só se aplica à principal declarada, sem volume e sem SERP; usa as sustentações com volume e as 4 lentes, maior volume primeiro", () => {
  const candidatos = [
    { keywordId: "s1", keyword: "claro ou vivo", volume: 90, lensesCached: true },
    { keywordId: "s2", keyword: "vivo ou claro internet", volume: 320, lensesCached: true },
    { keywordId: "s3", keyword: "sem lentes", volume: 500, lensesCached: false },
    { keywordId: "s4", keyword: "sem volume", volume: null, lensesCached: true },
  ];
  const base = { principalKeywordId: "p", principalDeclared: true, principalHasVolume: false, principalCached: false, candidates: candidatos };
  assert.deepEqual(selectDeclaredPrincipalSupports(base), { principalKeywordId: "p", anchorKeywordId: "s2", supportKeywordIds: ["s2", "s1"] });
  assert.equal(selectDeclaredPrincipalSupports({ ...base, principalDeclared: false }), null, "sem a marca: regra de sempre");
  assert.equal(selectDeclaredPrincipalSupports({ ...base, principalHasVolume: true }), null, "com volume a principal é consultada");
  assert.equal(selectDeclaredPrincipalSupports({ ...base, principalCached: true }), null, "com SERP no cache vale a SERP dela");
  assert.equal(selectDeclaredPrincipalSupports({ ...base, candidates: candidatos.filter(item => item.keywordId === "s3" || item.keywordId === "s4") }), null, "sem sustentação em cache: nada");
});

test("D2(a) · o parecer fala da principal declarada: nunca 'alternativa melhor', a declarada fica não observada com o motivo, e o veredito é o do grupo", () => {
  const lentes = ["desktop-windows", "desktop-macos", "mobile-android", "mobile-ios"];
  const s1 = fatos("s1", ["a.com/1", "b.com/2", "c.com/3", "d.com/4"]);
  const s2 = fatos("s2", ["a.com/1", "b.com/2", "c.com/3", "e.com/5"]);
  const calculado = interpretArticleSerpAcrossLenses({
    candidateRef: "artigo", primary: { lens: lentes[0], members: [s2, s1] },
    extras: lentes.slice(1).map(lens => ({ lens, members: [s2, s1] })),
    principalKeywordId: "s2",
    notObserved: [{ keywordId: "p", keyword: "claro vivo ou tim internet", role: "principal", reason: "Sem SERP consultada nesta validação." }],
  });
  const parecer = applyDeclaredPrincipalSupportBasis(calculado, { principalKeywordId: "p", principalLabel: "claro vivo ou tim internet", anchorLabel: "vivo ou claro internet", supportLabels: ["vivo ou claro internet", "claro ou vivo"] });
  assert.equal(parecer.principal.kind, "PRINCIPAL_SUPPORTED");
  assert.equal(parecer.principal.principalKeywordId, "p");
  assert.equal(parecer.principal.principalAlternativeKeywordId, null);
  assert.match(parecer.principal.reason, /D1-bis/);
  assert.equal(parecer.verdict, "COMPATIBLE");
  assert.equal(parecer.observedLenses.length, 4, "as 4 lentes da referência dos pares");
  assert.deepEqual(parecer.notObserved.map(item => [item.keywordId, item.reason]), [["p", DECLARED_PRINCIPAL_NOT_OBSERVED_REASON]]);
  assert.match(parecer.group.reason, /^Parecer pelas sustentações \(referência dos pares: “vivo ou claro internet”/);
  assert.doesNotMatch(parecer.group.reason, /a Principal/);
});

test("D2(a) · a composição só reconhece a principal sem recomendação quando o parecer diz que veio das sustentações", () => {
  const assessment = {
    recommendations: [{ keywordId: "s1", currentRole: "secundaria" }, { keywordId: "s2", currentRole: "secundaria" }],
    keywordDnaReferences: [{ keywordId: "p" }, { keywordId: "s1" }, { keywordId: "s2" }],
  };
  const lentes = { requested: ["a", "b", "c", "d"], observed: ["a", "b", "c", "d"], missing: [] };
  const alvo = { keywordIds: ["p", "s1", "s2"], principalKeywordId: "p" };
  assert.match(String(serpCompositionMismatch(serpAssessmentComposition(assessment, lentes), alvo)), /não diz qual era a principal/, "sem a proveniência, recusa como antes");
  const comBase = { ...assessment, supportBasis: { kind: "declared_principal_supports", principalKeywordId: "p", anchorKeywordId: "s2", supportKeywordIds: ["s2", "s1"], reason: "x" } };
  assert.equal(serpCompositionMismatch(serpAssessmentComposition(comBase, lentes), alvo), null);
  const deFora = { ...comBase, supportBasis: { ...comBase.supportBasis, principalKeywordId: "outra" } };
  assert.notEqual(serpCompositionMismatch(serpAssessmentComposition(deFora, lentes), alvo), null, "a principal da proveniência precisa estar na composição");
});

test("D2(a) · a proveniência vai para serpStrategy.rationale, trocada a cada versão e retirada quando o parecer volta a ser o da principal", () => {
  const artigo = { serpStrategy: { lifecycleMode: "formacao", competitionStrategy: "unknown", unitProfile: "generic", primaryIntent: "informational", rationale: ["base"], allowedRecommendationTypes: [], forbiddenRecommendationTypes: [], strategyVersion: "v1" } } as unknown as ArticleDNA;
  const razao = declaredPrincipalSupportBasisReason("claro vivo ou tim internet", ["vivo ou claro internet"]);
  const comBase = applySerpSupportBasisProvenance(artigo, razao);
  assert.deepEqual(comBase.serpStrategy!.rationale, ["base", razao]);
  const deNovo = applySerpSupportBasisProvenance(comBase, declaredPrincipalSupportBasisReason("claro vivo ou tim internet", ["claro ou vivo"]));
  assert.equal(deNovo.serpStrategy!.rationale.filter(line => line.startsWith(DECLARED_PRINCIPAL_SUPPORT_BASIS_PREFIX)).length, 1, "nunca acumula");
  assert.deepEqual(applySerpSupportBasisProvenance(deNovo, null).serpStrategy!.rationale, ["base"]);
  assert.equal(applySerpSupportBasisProvenance(artigo, null), artigo, "sem mudança, o mesmo objeto");
});

test("D2(a) · as consultas só da principal declarada já coberta são opcionais: o cartão vai para gravar, não para pagar", () => {
  const base = { hasRun: true, state: "prepared", leaseActive: false, accepted: false, paidQueries: 4, costMaxUsd: 0.02, selectedCount: 2, readyCount: 2 };
  assert.equal(resolveImprovementNextStep(base).kind, "validate", "sem a informação, como antes");
  assert.equal(resolveImprovementNextStep({ ...base, optionalPaidQueries: 4 }).kind, "apply");
  assert.equal(resolveImprovementNextStep({ ...base, optionalPaidQueries: 3 }).kind, "validate", "sobrou consulta que não é opcional");
});

/* ==================== a mesa aplica o evento `rejected` ==================== */

const artigoFixo = (articleId: string, keywordIds: string[], versionId: string) => ({
  versionId, entityId: articleId, versionNumber: 2,
  payload: { articleId, keywordReferences: keywordIds.map(keywordId => ({ keywordId })) },
}) as unknown as VersionEnvelope<ArticleDNA>;

test("rejeitado · a versão vigente rejeitada sai dos artigos; as keywords que só ele usava voltam a 'não agrupadas' na leitura; decisão posterior fica", () => {
  const rejeitado = artigoFixo("article-candidate:t:vivo", ["k-vivo", "k-comum"], "v-rej");
  const ativo = artigoFixo("artigo-ativo", ["k-comum", "k-ativo"], "v-ativo");
  const itens = [
    { subjectType: "keyword", subjectId: "k-vivo", payload: { clusterId: "article-candidate:t:vivo", workingArticleId: "article-candidate:t:vivo", articleFormationRef: "article-candidate:t:vivo", articleFormationDecision: { role: "principal", decidedAt: "2026-10-12T10:00:00Z" }, territoryRef: "territory:t" } },
    { subjectType: "keyword", subjectId: "k-comum", payload: { clusterId: "artigo-ativo" } },
    { subjectType: "keyword", subjectId: "k-ativo", payload: { clusterId: "artigo-ativo" } },
  ];
  const resultado = releaseRejectedArticles({
    articleDnas: [rejeitado, ativo],
    statuses: [{ versionId: "v-rej", status: "approved" }, { versionId: "v-ativo", status: "approved" }],
    events: [{ versionId: "v-rej", status: "rejected", occurredAt: "2026-10-12T15:30:00Z", reason: "Retirado do Silo: fora do plano" }],
    workflowItems: itens,
  });
  assert.deepEqual(resultado.articleDnas.map(item => item.entityId), ["artigo-ativo"]);
  assert.deepEqual(resultado.rejected.map(item => [item.articleId, item.releasedKeywordIds]), [["article-candidate:t:vivo", ["k-vivo"]]], "a keyword do artigo ativo não é liberada");
  const vivo = resultado.workflowItems.find(item => item.subjectId === "k-vivo")!.payload as Record<string, unknown>;
  assert.equal(vivo.clusterId, null);
  assert.equal(vivo.workingArticleId, null);
  assert.equal(vivo.articleFormationRef, null);
  assert.equal(vivo.territoryRef, "territory:t", "o Silo da keyword não é tocado");
  assert.equal(resultado.workflowItems.find(item => item.subjectId === "k-comum"), itens[1], "nada muda para quem continua em artigo");
  assert.equal(resultado.statuses.find(item => item.versionId === "v-rej")?.status, "rejected");
  assert.equal(itens[0].payload.clusterId, "article-candidate:t:vivo", "a entrada não é mutada: nada é apagado");

  // Decisão humana de formação POSTERIOR à rejeição continua valendo.
  const depois = releaseRejectedArticles({
    articleDnas: [rejeitado], statuses: [], events: [{ versionId: "v-rej", status: "rejected", occurredAt: "2026-10-12T15:30:00Z" }],
    workflowItems: [{ subjectType: "keyword", subjectId: "k-vivo", payload: { articleFormationRef: "formacao-nova", articleFormationDecision: { decidedAt: "2026-10-12T16:00:00Z" } } }],
  });
  assert.equal(depois.workflowItems[0].payload.articleFormationRef, "formacao-nova");
});

test("rejeitado · sem evento, vale a linha; evento posterior vence; sem rejeição, a leitura é a mesma de antes", () => {
  assert.equal(effectiveArtifactStatus("v", "approved", []), "approved");
  assert.equal(effectiveArtifactStatus("v", "approved", [{ versionId: "v", status: "rejected" }]), "rejected");
  assert.equal(effectiveArtifactStatus("v", "approved", [{ versionId: "v", status: "rejected" }, { versionId: "v", status: "approved" }]), "approved");
  const ativo = artigoFixo("a", ["k"], "v1");
  const itens = [{ subjectType: "keyword", subjectId: "k", payload: { clusterId: "a" } }];
  const igual = releaseRejectedArticles({ articleDnas: [ativo], statuses: [{ versionId: "v1", status: "approved" }], events: [], workflowItems: itens });
  assert.deepEqual(igual.articleDnas, [ativo]);
  assert.deepEqual(igual.workflowItems, itens);
  assert.deepEqual(igual.rejected, []);
});

/* ============== aplicar o plano declarado a um Silo consolidado ============== */

const MARCA = "5b0e7c1a-2d3f-4a5b-8c9d-0e1f2a3b4c5d";
const ATOR = "0f1e2d3c-4b5a-4968-8776-655443322110";
const GRUPO = "6f1d2c3b-4a5e-4f60-8a7b-9c0d1e2f3a4b";

const keyword = (id: string, value: string, volume_search = 100) => ({
  id, keyword: value, intent: "Informativo", volume_search, results_allintitle: null, kgr_score: null, lista_id: null,
  siloName: null, status: "aprovado", analise_semantica: { entidade_central: "internet", publico: "clientes", problema_percebido: "duvida" },
});

async function artigo(id: string, value: string, volume = 100, patch: Partial<ArticleDNA> = {}) {
  const payload = { ...deterministicArticleDnaPayload(buildProvisionalGroups([keyword(`${id}-kw`, value, volume)])[0], MARCA), ...patch } as ArticleDNA;
  return createVersionEnvelope({ entityId: payload.articleId, versionNumber: 1, origin: "system", changeReason: "fixture", createdBy: ATOR, payload });
}

const entrada = (artigoVersion: VersionEnvelope<ArticleDNA>, order: number, role: "Pilar" | "Suporte"): DeclaredSiloPlanEntry => ({
  subjectKeywordId: `assunto-${order}`,
  plan: { groupId: GRUPO, planVersion: 1, order, role, scope: `Escopo do artigo ${order}.`, declaredPrincipal: { keywordId: artigoVersion.payload.principalKeywordId, phrase: `principal ${order}` } },
  declaredBy: "dono", declaredAt: "2026-10-12T12:00:00Z",
});

const PLANO_DO_GRUPO = { siloName: "Planos e contratação", siloSlug: "planos-de-internet", objective: "Ajudar a escolher e contratar o melhor plano de internet residencial.", articleCount: 5 } as never;

/** WifiConecta em miniatura: Silo consolidado com o artigo 3 como Pilar; o plano diz artigo 1. */
async function acervo(opcoes: { comForaDoPlano?: boolean; pilarPublicado?: boolean; paginaPublicada?: boolean } = {}) {
  const a1 = await artigo("a1", "internet residencial melhor plano", 900);
  const a2 = await artigo("a2", "internet residencial fibra ou radio", 400);
  const a3 = await artigo("a3", "internet residencial claro ou vivo", 300, opcoes.pilarPublicado ? { publishedIdentityRef: { publicationStatus: "published_protected" } } as never : {});
  const a4 = await artigo("a4", "internet residencial plano vivo controle", 200);
  const noSilo = opcoes.comForaDoPlano ? [a1, a2, a3, a4] : [a1, a2, a3];
  const copia = chooseSiloWorkingCopyPillar(formSiloWorkingCopies({ brandId: MARCA, articleVersions: noSilo }).workingCopies[0], a3.payload.articleId);
  const base = { copy: { ...copia, source: "existing" as const, conflicts: [] }, articleVersions: noSilo };
  const dna = await createVersionEnvelope({ entityId: copia.id, versionNumber: 1, origin: "human", changeReason: "fixture", createdBy: ATOR, payload: buildConsolidatedSiloDnaPayload(base) });
  let pagePayload = buildConsolidatedSiloPagePayload(dna, base);
  if (opcoes.paginaPublicada) pagePayload = { ...pagePayload, publicationStatus: "published", publishedUrl: `https://wifi.example/${pagePayload.slug}`, canonical: `https://wifi.example/${pagePayload.slug}` };
  const page = await createVersionEnvelope({ entityId: pagePayload.siloPageId, versionNumber: 1, origin: "human", changeReason: "fixture", createdBy: ATOR, payload: pagePayload });
  // O artigo 5 nasceu depois, já deste Silo (gravado na aba Artigos).
  const a5 = await artigo("a5", "internet residencial quantos mega preciso", 150, { siloId: copia.id } as never);
  const entries = [entrada(a1, 1, "Pilar"), entrada(a2, 2, "Suporte"), entrada(a3, 3, "Suporte"), entrada(a5, 5, "Suporte"), { ...entrada(a5, 8, "Suporte"), subjectKeywordId: "assunto-8", plan: { ...entrada(a5, 8, "Suporte").plan, declaredPrincipal: { keywordId: "sem-dna", phrase: "contratar internet" } } }];
  return { a1, a2, a3, a4, a5, dna, page, entries };
}

const entradaDoPlano = (base: Awaited<ReturnType<typeof acervo>>, extra: Partial<Parameters<typeof planSiloDeclaredPlanApplication>[0]> = {}) => ({
  brandId: MARCA,
  siloId: base.dna.payload.siloId,
  siloDnaVersions: [base.dna] as VersionEnvelope<SiloDNA>[],
  siloPageVersions: [base.page] as VersionEnvelope<SiloPage>[],
  articleDnaVersions: [base.a1, base.a2, base.a3, base.a4, base.a5],
  statuses: [base.dna, base.page].map(version => ({ versionId: version.versionId, status: "approved" })),
  entries: base.entries,
  groupPlans: new Map([[GRUPO, PLANO_DO_GRUPO]]),
  ...extra,
});

test("plano no Silo · troca o Pilar para o artigo 1, segue a ordem do plano, o artigo 3 vira suporte, o 5 entra; nome, objetivo e slug do plano", async () => {
  const base = await acervo();
  const plano = planSiloDeclaredPlanApplication(entradaDoPlano(base));
  assert.equal(plano.ok, true, JSON.stringify(plano));
  if (!plano.ok) return;
  assert.equal(plano.unchanged, false);
  assert.equal(plano.nextSiloDna.pillarArticleId, base.a1.payload.articleId);
  assert.deepEqual(plano.nextSiloDna.narrativeOrder, [base.a1, base.a2, base.a3, base.a5].map(item => item.payload.articleId));
  assert.deepEqual(plano.nextSiloDna.supportArticleIds, [base.a2, base.a3, base.a5].map(item => item.payload.articleId));
  assert.equal(plano.nextSiloDna.articleReferences.find(ref => ref.role === "Pilar")?.articleId, base.a1.payload.articleId);
  assert.equal(plano.nextSiloDna.articleReferences.find(ref => ref.articleId === base.a5.payload.articleId)?.articleDnaVersionId, base.a5.versionId);
  assert.equal(plano.nextSiloDna.name, "Planos e contratação");
  assert.equal(plano.nextSiloDna.objective, "Ajudar a escolher e contratar o melhor plano de internet residencial.");
  assert.match(plano.nextSiloDna.articleRoles.find(role => role.role === "Pilar")!.reason, /^Pilar declarado no plano por dono em 2026-10-12/);
  assert.deepEqual(plano.nextSiloDna.linkMap.map(link => link.toArticleId), Array(3).fill(base.a1.payload.articleId));
  // Território, entidade central e fronteira são do Silo confirmado: não mudam.
  assert.equal(plano.nextSiloDna.centralEntity, base.dna.payload.centralEntity);
  assert.equal(plano.nextSiloDna.territoryRef, base.dna.payload.territoryRef);
  assert.equal(plano.nextSiloPage.slug, "planos-de-internet", "página nova, sem canonical: o slug do plano vale");
  assert.equal(plano.nextSiloPage.pillarArticleId, base.a1.payload.articleId);
  assert.deepEqual(plano.nextSiloPage.sections.map(section => section.linkedArticleIds[0]), plano.nextSiloDna.narrativeOrder);
  assert.ok(plano.changes.some(change => /^Pilar: “internet residencial claro ou vivo” → “internet residencial melhor plano”/.test(change)));
  assert.ok(plano.warnings.includes(SILO_DECLARED_PLAN_GRAPH_WARNING), "o grafo de links fica para ser processado de novo");
  assert.ok(plano.warnings.some(aviso => /artigo 8 do plano ainda não tem ArticleDNA/.test(aviso)));

  const versoes = await buildSiloDeclaredPlanVersions(plano, ATOR);
  assert.equal(versoes.siloDna.versionNumber, 2);
  assert.equal(versoes.siloDna.previousVersionId, base.dna.versionId);
  assert.equal(versoes.siloPage.versionNumber, 2);
  assert.equal(versoes.siloPage.payload.siloDnaRef.versionId, versoes.siloDna.versionId);
  assert.match(versoes.siloDna.changeReason, /Plano declarado aplicado ao Silo por decisão humana/);

  // Aplicado, o mesmo plano não gera outra versão (versão nova só com mudança real).
  const depois = planSiloDeclaredPlanApplication(entradaDoPlano(base, {
    siloDnaVersions: [base.dna, versoes.siloDna], siloPageVersions: [base.page, versoes.siloPage],
    statuses: [base.dna, base.page, versoes.siloDna, versoes.siloPage].map(version => ({ versionId: version.versionId, status: "approved" })),
  }));
  assert.equal(depois.ok && depois.unchanged, true, JSON.stringify(depois.ok ? depois.changes : depois));
});

test("plano no Silo · artigo fora do plano ainda no Silo: recusa e aponta 'Retirar artigo do Silo'; nada é tirado em silêncio", async () => {
  const base = await acervo({ comForaDoPlano: true });
  const plano = planSiloDeclaredPlanApplication(entradaDoPlano(base));
  assert.equal(plano.ok, false);
  if (plano.ok) return;
  assert.equal(plano.code, "NON_PLAN_ARTICLES");
  assert.match(plano.message, /“internet residencial plano vivo controle”[\s\S]*Retirar artigo do Silo/);
});

test("plano no Silo · Pilar atual publicado: conflito explícito; página publicada mantém slug, URL e canonical", async () => {
  const publicado = await acervo({ pilarPublicado: true });
  const recusa = planSiloDeclaredPlanApplication(entradaDoPlano(publicado));
  assert.equal(recusa.ok ? null : recusa.code, "PILLAR_PUBLISHED");

  const pagina = await acervo({ paginaPublicada: true });
  const plano = planSiloDeclaredPlanApplication(entradaDoPlano(pagina));
  assert.equal(plano.ok, true);
  if (!plano.ok) return;
  assert.equal(plano.nextSiloPage.slug, pagina.page.payload.slug);
  assert.equal(plano.nextSiloPage.publishedUrl, pagina.page.payload.publishedUrl);
  assert.equal(plano.nextSiloPage.canonical, pagina.page.payload.canonical);
  assert.ok(plano.warnings.some(aviso => /slug do plano .* não foi aplicado/.test(aviso)));
});

test("plano no Silo · prévia vencida, Silo sem aprovação e Silo sem plano: recusas", async () => {
  const base = await acervo();
  assert.equal((planSiloDeclaredPlanApplication(entradaDoPlano(base, { expectedSiloDnaVersionId: "outra" })) as { code?: string }).code, "STALE_SILO");
  assert.equal((planSiloDeclaredPlanApplication(entradaDoPlano(base, { statuses: [] })) as { code?: string }).code, "SILO_NOT_APPROVED");
  assert.equal((planSiloDeclaredPlanApplication(entradaDoPlano(base, { entries: [] })) as { code?: string }).code, "NO_DECLARED_PLAN");
  // Artigo do Silo rejeitado (fora dos ativos): a mesa precisa recarregar.
  assert.equal((planSiloDeclaredPlanApplication(entradaDoPlano(base, { articleDnaVersions: [base.a1, base.a2, base.a5] })) as { code?: string }).code, "SILO_ARTICLE_MISSING");
});
