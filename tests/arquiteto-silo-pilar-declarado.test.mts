/**
 * F4 — O PILAR DECLARADO NO SILO (SDD 2026-10-12 §6.2-6, D7, D6, D11).
 *
 * Quando todos os artigos do Silo são de Assuntos com plano do MESMO grupo e
 * exatamente um foi declarado Pilar, o Pilar é esse (decisão humana do plano),
 * a ordem de leitura é a do plano e nome/slug/objetivo vêm do Silo planejado.
 * Sem plano, a saída é idêntica à de antes. Fixtures puras, sem rede.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { buildProvisionalGroups } from "../lib/arquiteto/engine.ts";
import { deterministicArticleDnaPayload, deterministicSiloDnaPayload, deterministicSiloPagePayload } from "../lib/arquiteto/adapters.ts";
import { chooseSiloWorkingCopyPillar, formSiloWorkingCopies, orderSiloWorkingCopyByDeclaredPlan } from "../lib/arquiteto/silo-formation.ts";
import { buildCanonicalSiloClosurePlan, type ConcludedFormationInput } from "../lib/arquiteto/silo-composition-from-formations.ts";
import { buildConsolidatedSiloDnaPayload, siloConsolidationIssues } from "../lib/arquiteto/silo-consolidation.ts";
import {
  DECLARED_PILLAR_REASON_PREFIX,
  applyDeclaredSiloIdentity,
  declaredPillarForFormations,
  declaredSubjectAuthorship,
  resolveDeclaredSiloPlan,
  resolveSiloDeclaredGroup,
  type DeclaredSiloPlanEntry,
} from "../lib/arquiteto/silo-declared-plan.ts";
import { createVersionEnvelope } from "../lib/arquiteto/versioning.ts";
import type { SiloPage } from "../lib/arquiteto/contracts.ts";
import type { DeclaredSiloPlan } from "../lib/minerador/declared-plan.ts";

const BRAND = "brand-1";
const GRUPO = "6f1d2c3b-4a5e-4f60-8a7b-9c0d1e2f3a4b";
const OUTRO_GRUPO = "7a2e3d4c-5b6f-4071-9b8c-0d1e2f3a4b5c";
const ATOR = "0f1e2d3c-4b5a-4968-8776-655443322110";
const DECLARADO_EM = "2026-10-12T15:30:00+00:00";

const keyword = (id: string, value: string, volume_search: number | null = 100) => ({
  id, keyword: value, intent: "Informativo", volume_search, results_allintitle: null, kgr_score: null, lista_id: null,
  siloName: null, status: "aprovado", analise_semantica: { entidade_central: "internet", publico: "clientes", problema_percebido: "duvida" },
});

async function article(id: string, value: string, volume = 100) {
  const group = buildProvisionalGroups([keyword(`${id}-kw`, value, volume)])[0];
  const payload = deterministicArticleDnaPayload(group, BRAND);
  return createVersionEnvelope({ entityId: payload.articleId, versionNumber: 1, origin: "system", changeReason: "fixture", createdBy: "test", payload });
}

/** Quatro artigos do mesmo assunto: o de maior volume NÃO é o Pilar declarado. */
async function artigos() {
  return [
    await article("a1", "internet residencial planos", 900),
    await article("a2", "internet residencial barata", 400),
    await article("a3", "internet residencial melhor plano", 50),
    await article("a4", "internet residencial fibra", 200),
  ];
}

function entrada(subject: string, principal: string, order: number, role: "Pilar" | "Suporte", groupId = GRUPO): DeclaredSiloPlanEntry {
  return {
    subjectKeywordId: subject,
    plan: { groupId, planVersion: 1, order, role, scope: `Escopo do artigo ${order}`, declaredPrincipal: { keywordId: principal, phrase: principal } },
    declaredBy: ATOR,
    declaredAt: DECLARADO_EM,
  };
}

/** a3 é o Pilar (ordem 1); depois a4, a1, a2. */
const PLANO: DeclaredSiloPlanEntry[] = [
  entrada("s3", "a3-kw", 1, "Pilar"),
  entrada("s4", "a4-kw", 2, "Suporte"),
  entrada("s1", "a1-kw", 3, "Suporte"),
  entrada("s2", "a2-kw", 4, "Suporte"),
];

const SILO_DO_PLANO: DeclaredSiloPlan = { siloName: "Planos e contratação", siloSlug: "planos-de-internet", objective: "Ajudar a escolher e contratar o plano de internet certo.", articleCount: 4 };

const formacao = (ref: string, principal: string, membros: number): ConcludedFormationInput => ({
  candidateRef: ref,
  principalKeywordId: principal,
  members: [{ keywordId: principal, role: "principal" }, ...Array.from({ length: membros - 1 }, (_, index) => ({ keywordId: `${ref}-m${index}`, role: "secundaria" as const }))],
  formationBaseHash: `hash-${ref}`,
  materializedArticleId: null,
});

/* ------------------------------------------------------------ resolução pura */

test("plano com um Pilar do mesmo grupo: o Pilar é o declarado, com ator e data na razão", () => {
  const resolucao = resolveDeclaredSiloPlan({
    units: ["a1", "a2", "a3", "a4"].map(id => ({ ref: id, principalKeywordId: `${id}-kw`, keywordIds: [`${id}-kw`] })),
    entries: PLANO,
  });
  assert.equal(resolucao.applies, true);
  if (!resolucao.applies) return;
  assert.equal(resolucao.pillarRef, "a3");
  assert.deepEqual(resolucao.orderedRefs, ["a3", "a4", "a1", "a2"]);
  assert.equal(resolucao.reason, `${DECLARED_PILLAR_REASON_PREFIX} por ${ATOR} em 2026-10-12`);
  assert.equal(resolucao.groupId, GRUPO);
});

test("dois Pilares, grupos mistos ou artigo sem plano: não aplica e avisa; sem plano nenhum, nem aviso", () => {
  const unidades = ["a1", "a2", "a3", "a4"].map(id => ({ ref: id, principalKeywordId: `${id}-kw`, keywordIds: [`${id}-kw`] }));
  const doisPilares = resolveDeclaredSiloPlan({ units: unidades, entries: PLANO.map(item => item.subjectKeywordId === "s1" ? entrada("s1", "a1-kw", 3, "Pilar") : item) });
  assert.equal(doisPilares.applies, false);
  assert.match(doisPilares.warnings.join(" "), /2 artigos do Silo foram declarados Pilar/);

  const misto = resolveDeclaredSiloPlan({ units: unidades, entries: PLANO.map(item => item.subjectKeywordId === "s2" ? entrada("s2", "a2-kw", 4, "Suporte", OUTRO_GRUPO) : item) });
  assert.equal(misto.applies, false);
  assert.match(misto.warnings.join(" "), /2 grupos diferentes/);

  const semPlanoNumArtigo = resolveDeclaredSiloPlan({ units: unidades, entries: PLANO.filter(item => item.subjectKeywordId !== "s2") });
  assert.equal(semPlanoNumArtigo.applies, false);
  assert.match(semPlanoNumArtigo.warnings.join(" "), /sem plano declarado \(a2\)/);

  const nenhum = resolveDeclaredSiloPlan({ units: unidades, entries: [] });
  assert.deepEqual(nenhum, { applies: false, warnings: [] });
});

test("o Assunto preso ao ArticleDNA tem precedência sobre a principal na correspondência", () => {
  const resolucao = resolveDeclaredSiloPlan({
    units: [
      { ref: "x", principalKeywordId: "outra-principal", keywordIds: ["outra-principal"], subjectKeywordId: "s3" },
      { ref: "y", principalKeywordId: "a4-kw", keywordIds: ["a4-kw"] },
    ],
    entries: PLANO.filter(item => ["s3", "s4"].includes(item.subjectKeywordId)),
  });
  assert.equal(resolucao.applies, true);
  if (resolucao.applies) assert.equal(resolucao.pillarRef, "x");
});

test("autoria da declaração vem do pacote aprovado e, sem pacote, da linha viva", () => {
  const semantica = { keyword_subject: { declared: true, note: "n" }, keyword_subject_actor: ATOR, keyword_subject_at: DECLARADO_EM };
  assert.deepEqual(declaredSubjectAuthorship({ canonicalWorkflow: { payload: { approvedDna: { analiseSemantica: semantica } } } }), { declaredBy: ATOR, declaredAt: DECLARADO_EM });
  assert.deepEqual(declaredSubjectAuthorship({ analise_semantica: semantica }), { declaredBy: ATOR, declaredAt: DECLARADO_EM });
  assert.deepEqual(declaredSubjectAuthorship({}), { declaredBy: null, declaredAt: null });
});

/* ------------------------------------------------------- fechamento canônico */

test("fechamento: o Pilar declarado vence a cobertura e a ordem é a do plano", () => {
  const formacoes = [formacao("f1", "a1-kw", 5), formacao("f2", "a2-kw", 3), formacao("f3", "a3-kw", 1), formacao("f4", "a4-kw", 2)];
  const porCobertura = buildCanonicalSiloClosurePlan({ formations: formacoes, blockers: [] });
  assert.equal(porCobertura.state, "READY");
  if (porCobertura.state === "READY") assert.equal(porCobertura.pillarFormationRef, "f1");

  const declarado = declaredPillarForFormations(formacoes, PLANO);
  assert.ok(declarado);
  const plano = buildCanonicalSiloClosurePlan({ formations: formacoes, blockers: [], declaredPillar: declarado });
  assert.equal(plano.state, "READY");
  if (plano.state !== "READY") return;
  assert.equal(plano.pillarFormationRef, "f3");
  assert.deepEqual(plano.narrativeOrder, ["f3", "f4", "f1", "f2"]);
  assert.deepEqual(plano.supportFormationRefs, ["f4", "f1", "f2"]);
  assert.equal(plano.pillarSource, "declared_plan");
  assert.match(plano.pillarReason, new RegExp(`^${DECLARED_PILLAR_REASON_PREFIX} por ${ATOR} em 2026-10-12$`));
});

test("fechamento sem plano: saída idêntica à de hoje (sem pillarSource)", () => {
  const formacoes = [formacao("f1", "a1-kw", 5), formacao("f2", "a2-kw", 3)];
  const hoje = buildCanonicalSiloClosurePlan({ formations: formacoes, blockers: [] });
  assert.deepEqual(buildCanonicalSiloClosurePlan({ formations: formacoes, blockers: [], declaredPillar: declaredPillarForFormations(formacoes, []) }), hoje);
  assert.deepEqual(buildCanonicalSiloClosurePlan({ formations: formacoes, blockers: [], declaredPillar: null }), hoje);
  assert.equal("pillarSource" in hoje, false);
});

test("fechamento com dois Pilares ou grupos mistos: regra de hoje (cobertura)", () => {
  const formacoes = [formacao("f1", "a1-kw", 5), formacao("f2", "a2-kw", 3), formacao("f3", "a3-kw", 1), formacao("f4", "a4-kw", 2)];
  const hoje = buildCanonicalSiloClosurePlan({ formations: formacoes, blockers: [] });
  const doisPilares = PLANO.map(item => item.subjectKeywordId === "s1" ? entrada("s1", "a1-kw", 3, "Pilar") : item);
  assert.equal(declaredPillarForFormations(formacoes, doisPilares), null);
  assert.deepEqual(buildCanonicalSiloClosurePlan({ formations: formacoes, blockers: [], declaredPillar: declaredPillarForFormations(formacoes, doisPilares) }), hoje);
  const misto = PLANO.map(item => item.subjectKeywordId === "s2" ? entrada("s2", "a2-kw", 4, "Suporte", OUTRO_GRUPO) : item);
  assert.equal(declaredPillarForFormations(formacoes, misto), null);
});

test("fechamento ignora Pilar declarado que não é formação deste Silo", () => {
  const formacoes = [formacao("f1", "a1-kw", 5), formacao("f2", "a2-kw", 3)];
  const hoje = buildCanonicalSiloClosurePlan({ formations: formacoes, blockers: [] });
  const estranho = buildCanonicalSiloClosurePlan({ formations: formacoes, blockers: [], declaredPillar: { pillarRef: "fx", orderedRefs: ["fx", "f1", "f2"], reason: "x" } });
  assert.deepEqual(estranho, hoje);
});

/* ------------------------------------------------------- cópia de trabalho */

test("cópia sem plano: saída idêntica com e sem a entrada opcional", async () => {
  const versoes = await artigos();
  const hoje = formSiloWorkingCopies({ brandId: BRAND, articleVersions: versoes });
  assert.deepEqual(formSiloWorkingCopies({ brandId: BRAND, articleVersions: versoes, declaredPlan: null }), hoje);
  assert.deepEqual(formSiloWorkingCopies({ brandId: BRAND, articleVersions: versoes, declaredPlan: { entries: [] } }), hoje);
  assert.equal(hoje.workingCopies[0].pillarCandidateArticleId, null);
  assert.equal(hoje.workingCopies[0].declaredPlan, undefined);
});

test("cópia com plano: Pilar declarado como decisão humana, ordem do plano, nome e slug do Silo planejado", async () => {
  const versoes = await artigos();
  const [a1, a2, a3, a4] = versoes.map(version => version.payload.articleId);
  const hoje = formSiloWorkingCopies({ brandId: BRAND, articleVersions: versoes }).workingCopies[0];
  const resultado = formSiloWorkingCopies({ brandId: BRAND, articleVersions: versoes, declaredPlan: { entries: PLANO, groupPlans: new Map([[GRUPO, SILO_DO_PLANO]]) } });
  const copia = resultado.workingCopies[0];
  assert.equal(copia.pillarCandidateArticleId, a3);
  assert.deepEqual(copia.supportArticleIds, [a4, a1, a2]);
  assert.deepEqual(copia.articleReferences.map(reference => reference.articleId), [a3, a4, a1, a2]);
  assert.equal(copia.articleReferences.find(reference => reference.articleId === a3)?.role, "pillar_candidate");
  assert.equal(copia.name, "Planos e contratação");
  assert.equal(copia.slug, "planos-de-internet");
  assert.equal(copia.siloPage.slug, "planos-de-internet");
  assert.ok(copia.reasons.some(reason => reason.startsWith(`${DECLARED_PILLAR_REASON_PREFIX} por ${ATOR} em 2026-10-12`)));
  assert.equal(copia.declaredPlan?.objective, SILO_DO_PLANO.objective);
  // A cobertura/volume continuam calculados, só como informação.
  assert.deepEqual(copia.pillarScores, hoje.pillarScores);
  assert.notEqual(copia.pillarScores[0].articleId, a3);
});

test("cópia com dois Pilares: Pilar nulo como hoje, com aviso em reasons e nunca em conflicts", async () => {
  const versoes = await artigos();
  const hoje = formSiloWorkingCopies({ brandId: BRAND, articleVersions: versoes }).workingCopies[0];
  const doisPilares = PLANO.map(item => item.subjectKeywordId === "s1" ? entrada("s1", "a1-kw", 3, "Pilar") : item);
  const copia = formSiloWorkingCopies({ brandId: BRAND, articleVersions: versoes, declaredPlan: { entries: doisPilares } }).workingCopies[0];
  assert.equal(copia.pillarCandidateArticleId, null);
  assert.deepEqual(copia.conflicts, hoje.conflicts);
  assert.deepEqual(copia.name, hoje.name);
  assert.match(copia.reasons.at(-1) || "", /Plano declarado não aplicado/);
});

test("Silo com SiloPage publicada: o nome vem do plano, o slug publicado fica", async () => {
  const versoes = await artigos();
  const antigoPayload = deterministicSiloDnaPayload("silo-publicado", "Internet", [versoes[0]], { brandId: BRAND, centralEntity: "internet" });
  const antigo = await createVersionEnvelope({ entityId: antigoPayload.siloId, versionNumber: 1, origin: "system", changeReason: "fixture", createdBy: "test", payload: antigoPayload });
  const base = deterministicSiloPagePayload(antigo, BRAND, "internet-residencial");
  const paginaPayload: SiloPage = { ...base, formationStatus: "formed", publicationStatus: "published", publishedUrl: "https://exemplo.com/internet-residencial", canonical: "https://exemplo.com/internet-residencial" };
  const pagina = await createVersionEnvelope({ entityId: paginaPayload.siloPageId, versionNumber: 1, origin: "human", changeReason: "fixture", createdBy: "test", payload: paginaPayload });
  const comSilo = versoes.map(version => ({ ...version, payload: { ...version.payload, siloId: antigoPayload.siloId } }));
  const copia = formSiloWorkingCopies({
    brandId: BRAND,
    articleVersions: comSilo,
    existingSiloVersions: [antigo],
    existingSiloPageVersions: [pagina],
    declaredPlan: { entries: PLANO, groupPlans: new Map([[GRUPO, SILO_DO_PLANO]]) },
  }).workingCopies[0];
  assert.equal(copia.name, "Planos e contratação");
  assert.equal(copia.slug, "internet-residencial");
  assert.equal(copia.siloPage.slug, "internet-residencial");
});

test("identidade: slug do plano só sem página no ar nem estrutura publicada adotada", () => {
  const livre = { name: "Internet", slug: "internet", protectedIdentity: false, publishedSlug: null };
  assert.deepEqual(applyDeclaredSiloIdentity(livre, SILO_DO_PLANO, { pagePublished: false }), { ...livre, name: "Planos e contratação", slug: "planos-de-internet" });
  assert.equal(applyDeclaredSiloIdentity(livre, SILO_DO_PLANO, { pagePublished: true }).slug, "internet");
  assert.equal(applyDeclaredSiloIdentity({ ...livre, protectedIdentity: true, publishedSlug: "internet" }, SILO_DO_PLANO, { pagePublished: false }).slug, "internet");
  assert.equal(applyDeclaredSiloIdentity(livre, null, { pagePublished: false }), livre);
  assert.equal(applyDeclaredSiloIdentity(livre, { siloName: "Planos", siloSlug: null }, { pagePublished: false }).slug, "internet");
});

/* ------------------------------------------------------------- consolidação */

test("consolidação: narrativeOrder segue a ordem do plano e o objetivo vem do Silo planejado", async () => {
  const versoes = await artigos();
  const [a1, a2, a3, a4] = versoes.map(version => version.payload.articleId);
  const copia = formSiloWorkingCopies({ brandId: BRAND, articleVersions: versoes }).workingCopies[0];
  const ordenada = orderSiloWorkingCopyByDeclaredPlan(chooseSiloWorkingCopyPillar(copia, a3), [a3, a4, a1, a2]);
  const statuses = Object.fromEntries(versoes.map(version => [version.payload.articleId, "approved"]));
  const entrada = { copy: { ...ordenada, source: "existing" as const, conflicts: [] }, articleVersions: versoes, articleStatuses: statuses };
  assert.deepEqual(siloConsolidationIssues(entrada), []);
  const comPlano = buildConsolidatedSiloDnaPayload({ ...entrada, declaredObjective: SILO_DO_PLANO.objective });
  assert.deepEqual(comPlano.narrativeOrder, [a3, a4, a1, a2]);
  assert.equal(comPlano.pillarArticleId, a3);
  assert.equal(comPlano.objective, SILO_DO_PLANO.objective);
  // Sem objetivo declarado, o objetivo é o de sempre (byte a byte).
  assert.deepEqual(buildConsolidatedSiloDnaPayload({ ...entrada, declaredObjective: null }), buildConsolidatedSiloDnaPayload(entrada));
  assert.notEqual(buildConsolidatedSiloDnaPayload(entrada).objective, SILO_DO_PLANO.objective);
});

test("vínculo do grupo: todos os Assuntos no mesmo grupo; sem Assunto ou grupos mistos = sem vínculo", () => {
  const grupos = new Map<string, string | null>([["s1", GRUPO], ["s2", GRUPO], ["s3", OUTRO_GRUPO], ["s4", null]]);
  assert.deepEqual(resolveSiloDeclaredGroup({ articles: [{ articleId: "a", subjectKeywordId: "s1" }, { articleId: "b", subjectKeywordId: "s2" }], keywordGroupById: grupos }), { groupId: GRUPO, reason: null });
  assert.equal(resolveSiloDeclaredGroup({ articles: [{ articleId: "a", subjectKeywordId: "s1" }, { articleId: "b", subjectKeywordId: "s3" }], keywordGroupById: grupos }).groupId, null);
  assert.equal(resolveSiloDeclaredGroup({ articles: [{ articleId: "a", subjectKeywordId: "s1" }, { articleId: "b", subjectKeywordId: null }], keywordGroupById: grupos }).groupId, null);
  assert.equal(resolveSiloDeclaredGroup({ articles: [{ articleId: "a", subjectKeywordId: "s4" }], keywordGroupById: grupos }).groupId, null);
});

/* ------------------------------------------------------------- estruturais */

function semComentarios(fonte: string) {
  return fonte.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}

test("estrutural: a consolidação liga o grupo DEPOIS do readback, pelo linkEditorialGroupSilo, sem derrubar", () => {
  const adapter = semComentarios(readFileSync(new URL("../lib/server/arquiteto-silo-consolidation-adapter.ts", import.meta.url), "utf8"));
  const readback = adapter.indexOf("canonicalVersionFromRow(\"silo_page\"");
  const vinculo = adapter.indexOf("linkDeclaredPlanGroupToSilo(context");
  assert.ok(readback > 0 && vinculo > readback, "o vínculo vem depois do readback do par");
  assert.match(adapter, /groupLink,/);
  const link = semComentarios(readFileSync(new URL("../lib/server/arquiteto-silo-group-link.ts", import.meta.url), "utf8"));
  assert.match(link, /linkEditorialGroupSilo\(context\.supabase/);
  // Toda falha vira `failed` com a frase, dentro do try: a consolidação nunca cai por causa do grupo.
  assert.match(link, /\} catch \(error\) \{[\s\S]*return \{ state: "failed"/);
});

test("estrutural: a mesa passa o plano declarado ao fechamento, à consolidação e à formação manual", () => {
  const mesa = semComentarios(readFileSync(new URL("../modules/arquiteto/arquiteto-workspace.tsx", import.meta.url), "utf8"));
  assert.equal((mesa.match(/declaredPillar: declaredPillarForFormations\(/g) || []).length, 2);
  assert.match(mesa, /input\.plan\.pillarSource === "declared_plan"/);
  assert.match(mesa, /declaredObjective: siloDoPlano\?\.objective \?\? null/);
  assert.match(mesa, /declaredPlan: declaredSiloPlanEntries\.length \?/);
});
