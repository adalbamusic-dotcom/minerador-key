/**
 * F4 — "RETIRAR ARTIGO DO SILO" (SDD 2026-10-12 §11 passo 6).
 *
 * Domínio puro: as recusas (Pilar, publicado, fora do Silo, Silo sem versão
 * aprovada, etapa posterior, motivo), o SiloDNA novo sem o artigo e sem
 * referência pendente, a SiloPage apontando para o SiloDNA novo e o evento
 * `rejected` da versão vigente do ArticleDNA. Estrutural: a rota usa o
 * `persistSiloPairAtomic` e grava o `rejected`. Fixtures, sem rede.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { buildProvisionalGroups } from "../lib/arquiteto/engine.ts";
import { deterministicArticleDnaPayload } from "../lib/arquiteto/adapters.ts";
import { chooseSiloWorkingCopyPillar, formSiloWorkingCopies } from "../lib/arquiteto/silo-formation.ts";
import { buildConsolidatedSiloDnaPayload, buildConsolidatedSiloPagePayload } from "../lib/arquiteto/silo-consolidation.ts";
import {
  SHALLOW_SILO_GAP,
  SILO_ARTICLE_WITHDRAWAL_ACTION_LABEL,
  SILO_ARTICLE_WITHDRAWAL_CONFIRM_LABEL,
  SILO_ARTICLE_WITHDRAWAL_ROUTE,
  buildSiloArticleWithdrawalVersions,
  planSiloArticleWithdrawal,
  type SiloArticleWithdrawalInput,
} from "../lib/arquiteto/silo-article-withdrawal.ts";
import { createVersionEnvelope } from "../lib/arquiteto/versioning.ts";
import { SiloDNASchema, SiloPageSchema, type ArticleDNA, type SiloDNA, type SiloPage, type VersionEnvelope } from "../lib/arquiteto/contracts.ts";

const BRAND = "brand-1";
const ATOR = "0f1e2d3c-4b5a-4968-8776-655443322110";

const keyword = (id: string, value: string, volume_search: number | null = 100) => ({
  id, keyword: value, intent: "Informativo", volume_search, results_allintitle: null, kgr_score: null, lista_id: null,
  siloName: null, status: "aprovado", analise_semantica: { entidade_central: "internet", publico: "clientes", problema_percebido: "duvida" },
});

async function article(id: string, value: string, volume = 100) {
  const group = buildProvisionalGroups([keyword(`${id}-kw`, value, volume)])[0];
  const payload = deterministicArticleDnaPayload(group, BRAND);
  return createVersionEnvelope({ entityId: payload.articleId, versionNumber: 1, origin: "system", changeReason: "fixture", createdBy: "test", payload });
}

/** Um Silo consolidado: Pilar a1, suportes a2 e a3 (a2 é o "plano vivo controle"). */
async function siloConsolidado(quantos = 3) {
  const artigos = [
    await article("a1", "internet residencial planos", 900),
    await article("a2", "internet residencial plano vivo controle", 300),
    await article("a3", "internet residencial fibra", 200),
    await article("a4", "internet residencial barata", 150),
  ].slice(0, quantos);
  const ids = artigos.map(version => version.payload.articleId);
  const copia = chooseSiloWorkingCopyPillar(formSiloWorkingCopies({ brandId: BRAND, articleVersions: artigos }).workingCopies[0], ids[0]);
  const entrada = { copy: { ...copia, source: "existing" as const, conflicts: [] }, articleVersions: artigos };
  const dnaPayload = buildConsolidatedSiloDnaPayload(entrada);
  // Diretriz SERP e mapa de links que citam o artigo, como numa consolidação real.
  const dnaComSerp: SiloDNA = SiloDNASchema.parse({ ...dnaPayload, serpGuidelines: ids.map(id => `${id}: diretriz`) });
  const dna = await createVersionEnvelope({ entityId: dnaComSerp.siloId, versionNumber: 2, previousVersionId: "silo-v1", origin: "human", changeReason: "fixture", createdBy: ATOR, payload: dnaComSerp });
  const pagePayload = buildConsolidatedSiloPagePayload(dna, entrada);
  const paginaComSecao: SiloPage = SiloPageSchema.parse({ ...pagePayload, sections: [{ id: "s1", heading: "Planos", objective: "Comparar", linkedArticleIds: ids }] });
  const page = await createVersionEnvelope({ entityId: paginaComSecao.siloPageId, versionNumber: 2, previousVersionId: "page-v1", origin: "human", changeReason: "fixture", createdBy: ATOR, payload: paginaComSecao });
  const statuses = [
    { versionId: dna.versionId, status: "approved" },
    { versionId: page.versionId, status: "approved" },
    ...artigos.map(version => ({ versionId: version.versionId, status: "approved" })),
  ];
  return { artigos, ids, dna, page, statuses };
}

function entrada(base: Awaited<ReturnType<typeof siloConsolidado>>, extra: Partial<SiloArticleWithdrawalInput> = {}): SiloArticleWithdrawalInput {
  return {
    brandId: BRAND,
    siloId: base.dna.payload.siloId,
    articleId: base.ids[1],
    reason: "fora do plano declarado",
    siloDnaVersions: [base.dna],
    siloPageVersions: [base.page],
    articleDnaVersions: base.artigos,
    statuses: base.statuses,
    ...extra,
  };
}

/* ----------------------------------------------------------------- recusas */

test("recusa: o Pilar não sai (troque o Pilar antes)", async () => {
  const base = await siloConsolidado();
  const plano = planSiloArticleWithdrawal(entrada(base, { articleId: base.ids[0] }));
  assert.equal(plano.ok, false);
  if (!plano.ok) { assert.equal(plano.code, "ARTICLE_IS_PILLAR"); assert.match(plano.message, /troque o Pilar antes/); }
});

test("recusa: artigo publicado não sai por aqui", async () => {
  const base = await siloConsolidado();
  const publicadoPayload: ArticleDNA = { ...base.artigos[1].payload, publishedIdentityRef: { publicationStatus: "published_protected", slug: "plano-vivo-controle" } };
  const publicado = await createVersionEnvelope({ entityId: publicadoPayload.articleId, versionNumber: 2, previousVersionId: base.artigos[1].versionId, origin: "human", changeReason: "fixture", createdBy: "test", payload: publicadoPayload });
  const plano = planSiloArticleWithdrawal(entrada(base, { articleDnaVersions: [...base.artigos, publicado] }));
  assert.equal(plano.ok, false);
  if (!plano.ok) { assert.equal(plano.code, "ARTICLE_PUBLISHED"); assert.match(plano.message, /publicado não sai por aqui/); }
});

test("recusa: artigo fora do Silo, Silo inexistente e Silo sem versão aprovada", async () => {
  const base = await siloConsolidado();
  const fora = planSiloArticleWithdrawal(entrada(base, { articleId: "article-que-nao-esta" }));
  assert.equal(fora.ok ? null : fora.code, "ARTICLE_NOT_IN_SILO");
  const semSilo = planSiloArticleWithdrawal(entrada(base, { siloId: "silo-inexistente" }));
  assert.equal(semSilo.ok ? null : semSilo.code, "SILO_NOT_FOUND");
  const naoAprovado = planSiloArticleWithdrawal(entrada(base, { statuses: base.statuses.map(item => item.versionId === base.dna.versionId ? { ...item, status: "proposed" } : item) }));
  assert.equal(naoAprovado.ok ? null : naoAprovado.code, "SILO_NOT_APPROVED");
});

test("recusa: artigo já em etapa posterior, prévia vencida, par incoerente e motivo ausente", async () => {
  const base = await siloConsolidado();
  const radar = planSiloArticleWithdrawal(entrada(base, { downstreamStages: ["radar"] }));
  assert.equal(radar.ok ? null : radar.code, "ARTICLE_IN_DOWNSTREAM");
  const vencida = planSiloArticleWithdrawal(entrada(base, { expectedSiloDnaVersionId: "versao-antiga" }));
  assert.equal(vencida.ok ? null : vencida.code, "STALE_SILO");
  const paginaSolta = await createVersionEnvelope({ entityId: base.page.entityId, versionNumber: 3, previousVersionId: base.page.versionId, origin: "human", changeReason: "fixture", createdBy: ATOR, payload: { ...base.page.payload, siloDnaRef: { ...base.page.payload.siloDnaRef, versionId: "outra" } } });
  const incoerente = planSiloArticleWithdrawal(entrada(base, { siloPageVersions: [base.page, paginaSolta] }));
  assert.equal(incoerente.ok ? null : incoerente.code, "SILO_PAIR_INCOHERENT");
  for (const motivo of ["", "  ", "ok", `linha um${String.fromCharCode(10)}linha dois`]) {
    const semMotivo = planSiloArticleWithdrawal(entrada(base, { reason: motivo }));
    assert.equal(semMotivo.ok ? null : semMotivo.code, "REASON_REQUIRED", `motivo ${JSON.stringify(motivo)}`);
  }
  // A prévia não exige motivo: ele é pedido depois de mostrar o que muda.
  assert.equal(planSiloArticleWithdrawal(entrada(base, { reason: "", previewOnly: true })).ok, true);
});

/* -------------------------------------------------------------- o plano */

test("o SiloDNA novo não referencia o artigo em lugar nenhum e passa no contrato", async () => {
  const base = await siloConsolidado();
  const sai = base.ids[1];
  const plano = planSiloArticleWithdrawal(entrada(base));
  assert.equal(plano.ok, true);
  if (!plano.ok) return;
  const novo = plano.nextSiloDna;
  assert.equal(JSON.stringify(novo).includes(sai), false, "nenhuma referência pendente ao artigo retirado");
  assert.equal(novo.pillarArticleId, base.ids[0]);
  assert.deepEqual(novo.supportArticleIds, [base.ids[2]]);
  assert.deepEqual(novo.narrativeOrder, [base.ids[0], base.ids[2]]);
  assert.deepEqual(novo.articleReferences.map(reference => reference.articleId), [base.ids[0], base.ids[2]]);
  assert.ok(novo.linkMap.every(link => link.fromArticleId !== sai && link.toArticleId !== sai));
  assert.equal(novo.hierarchySignals.find(signal => signal.articleDnaId === base.ids[2])?.supportOrder, 1);
  assert.deepEqual(SiloDNASchema.parse(novo), novo);
  // O que não referencia o artigo fica como estava.
  assert.equal(novo.name, base.dna.payload.name);
  assert.equal(novo.territoryRef, base.dna.payload.territoryRef);
  assert.equal(novo.objective, base.dna.payload.objective);
  assert.equal(JSON.stringify(plano.nextSiloPage).includes(sai), false);
  assert.equal(plano.nextSiloPage.slug, base.page.payload.slug);
  assert.equal(plano.nextSiloPage.canonical, base.page.payload.canonical);
  assert.deepEqual(plano.statuses, { siloDna: "approved", siloPage: "approved" });
  assert.match(plano.changes.join(" "), /rejeitado/);
});

test("os envelopes: SiloDNA vN+1, SiloPage vN+1 apontando para ele e o evento rejected da versão vigente", async () => {
  const base = await siloConsolidado();
  const plano = planSiloArticleWithdrawal(entrada(base));
  assert.ok(plano.ok);
  if (!plano.ok) return;
  const versoes = await buildSiloArticleWithdrawalVersions(plano, ATOR, "2026-10-12T18:00:00.000Z");
  assert.equal(versoes.siloDna.versionNumber, base.dna.versionNumber + 1);
  assert.equal(versoes.siloDna.previousVersionId, base.dna.versionId);
  assert.equal(versoes.siloDna.createdBy, ATOR);
  assert.equal(versoes.siloPage.versionNumber, base.page.versionNumber + 1);
  assert.equal(versoes.siloPage.previousVersionId, base.page.versionId);
  assert.deepEqual(versoes.siloPage.payload.siloDnaRef, { entityId: versoes.siloDna.entityId, versionId: versoes.siloDna.versionId, contentHash: versoes.siloDna.contentHash });
  assert.equal(versoes.rejection.status, "rejected");
  assert.equal(versoes.rejection.versionId, base.artigos[1].versionId);
  assert.match(versoes.rejection.reason, /fora do plano declarado/);
  assert.match(versoes.rejection.eventId, /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  // Repetir a mesma retirada grava o MESMO evento (idempotente).
  const denovo = await buildSiloArticleWithdrawalVersions(plano, ATOR, "2026-10-12T18:05:00.000Z");
  assert.equal(denovo.rejection.eventId, versoes.rejection.eventId);
});

test("a versão vigente do ArticleDNA é a mais nova, não a referenciada pelo Silo", async () => {
  const base = await siloConsolidado();
  const v2 = await createVersionEnvelope({ entityId: base.artigos[1].entityId, versionNumber: 2, previousVersionId: base.artigos[1].versionId, origin: "human", changeReason: "fixture", createdBy: "test", payload: { ...base.artigos[1].payload, promise: "outra promessa" } });
  const plano = planSiloArticleWithdrawal(entrada(base, { articleDnaVersions: [...base.artigos, v2] }));
  assert.ok(plano.ok);
  if (plano.ok) assert.equal(plano.article.versionId, v2.versionId);
});

test("Silo confirmado pode ficar raso: a rasura vira dívida escrita e aviso, não recusa", async () => {
  const base = await siloConsolidado(2);
  const plano = planSiloArticleWithdrawal(entrada(base));
  assert.equal(plano.ok, true);
  if (!plano.ok) return;
  assert.deepEqual(plano.nextSiloDna.supportArticleIds, []);
  assert.ok(plano.nextSiloDna.gaps.includes(SHALLOW_SILO_GAP));
  assert.match(plano.warnings.join(" "), /abaixo do mínimo do plano \(4 artigos\)/);
});

test("Silo com 4 artigos: o terceiro suporte sai e os outros ficam na ordem", async () => {
  const base = await siloConsolidado(4);
  const plano = planSiloArticleWithdrawal(entrada(base, { articleId: base.ids[2] }));
  assert.ok(plano.ok);
  if (!plano.ok) return;
  assert.deepEqual(plano.nextSiloDna.narrativeOrder, [base.ids[0], base.ids[1], base.ids[3]]);
  assert.deepEqual(plano.remainingArticleIds, [base.ids[0], base.ids[1], base.ids[3]]);
});

/*
 * 2026-10-14 · CASO REAL WifiConecta: o ArticleDNA `melhor-para-jogos-online`
 * aponta para o Silo "planos de internet" (`siloId`/`territoryRef` no DNA), mas o
 * SiloDNA consolidado (anterior) não o lista. Antes: "Este artigo não está no
 * Silo." e as 3 keywords do plano azul ficavam presas sem caminho.
 */
test("artigo que só aponta para o Silo: a retirada vale só com o evento rejected; o par não muda", async () => {
  const base = await siloConsolidado();
  const solto = await article("a9", "melhor internet para jogos online", 40);
  const apontando = await createVersionEnvelope({ entityId: solto.entityId, versionNumber: 1, origin: "human", changeReason: "fixture", createdBy: ATOR, payload: { ...solto.payload, siloId: base.dna.payload.siloId } });
  const plano = planSiloArticleWithdrawal(entrada(base, { articleId: apontando.payload.articleId, articleDnaVersions: [...base.artigos, apontando] }));
  assert.equal(plano.ok, true, plano.ok ? "" : plano.message);
  if (!plano.ok) return;
  assert.equal(plano.pairUnchanged, true);
  assert.deepEqual(plano.nextSiloDna, base.dna.payload, "SiloDNA igual: não há o que tirar");
  assert.deepEqual(plano.nextSiloPage, base.page.payload);
  assert.equal(plano.article.versionId, apontando.versionId);
  assert.match(plano.changes.join(" "), /rejeitado/);
  assert.match(plano.changes.join(" "), /não mudam: este artigo aponta para o Silo, mas não entrou na composição consolidada/);
  assert.match(plano.changes.join(" "), /ficam livres/);
  const versoes = await buildSiloArticleWithdrawalVersions(plano, ATOR, "2026-10-14T18:00:00.000Z");
  assert.equal(versoes.rejection.status, "rejected");
  assert.equal(versoes.rejection.versionId, apontando.versionId);
  // Ainda sem motivo, a aplicação recusa (decisão humana com motivo).
  const semMotivo = planSiloArticleWithdrawal(entrada(base, { articleId: apontando.payload.articleId, articleDnaVersions: [...base.artigos, apontando], reason: "" }));
  assert.equal(semMotivo.ok ? null : semMotivo.code, "REASON_REQUIRED");
  // O que não aponta para este Silo continua recusado como antes.
  const outroSilo = await createVersionEnvelope({ entityId: solto.entityId, versionNumber: 2, previousVersionId: apontando.versionId, origin: "human", changeReason: "fixture", createdBy: ATOR, payload: { ...solto.payload, siloId: "territory:outro" } });
  const fora = planSiloArticleWithdrawal(entrada(base, { articleId: apontando.payload.articleId, articleDnaVersions: [...base.artigos, apontando, outroSilo] }));
  assert.equal(fora.ok ? null : fora.code, "ARTICLE_NOT_IN_SILO");
});

/* -------------------------------------------------------------- estruturais */

function semComentarios(fonte: string) {
  return fonte.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}

test("estrutural: a rota grava o par pelo persistSiloPairAtomic e o evento rejected, com releitura", () => {
  const rota = semComentarios(readFileSync(new URL("../app/api/arquiteto/silo-article-withdrawal/route.ts", import.meta.url), "utf8"));
  const servidor = semComentarios(readFileSync(new URL("../lib/server/arquiteto-silo-article-withdrawal.ts", import.meta.url), "utf8"));
  const dominio = semComentarios(readFileSync(new URL("../lib/arquiteto/silo-article-withdrawal.ts", import.meta.url), "utf8"));
  assert.match(rota, /export async function POST/);
  assert.match(rota, /handleSiloArticleWithdrawal\(siloArticleWithdrawalRuntime\(context\)/);
  assert.match(rota, /action: "approve"/);
  assert.match(servidor, /persistSiloPairAtomic\(context, siloDna, siloPage, statuses\)/);
  assert.match(servidor, /new ArtifactRepository\(\)\.appendEvents\(/);
  assert.match(dominio, /status: "rejected"/);
  // Evento antes do par; releitura depois dos dois.
  const evento = servidor.indexOf("await deps.appendRejection(");
  const par = servidor.indexOf("await deps.persistPair(");
  const releitura = servidor.indexOf("const relido = await deps.listArtifacts()");
  assert.ok(evento > 0 && par > evento && releitura > par);
  assert.equal(SILO_ARTICLE_WITHDRAWAL_ROUTE, "/api/arquiteto/silo-article-withdrawal");
});

test("estrutural: a aba Silos oferece a ação com os rótulos do catálogo", () => {
  assert.equal(SILO_ARTICLE_WITHDRAWAL_ACTION_LABEL, "Retirar artigo do Silo");
  assert.equal(SILO_ARTICLE_WITHDRAWAL_CONFIRM_LABEL, "Confirmar retirada");
  const painel = readFileSync(new URL("../modules/arquiteto/silo-article-withdrawal-panel.tsx", import.meta.url), "utf8");
  assert.match(painel, /SILO_ARTICLE_WITHDRAWAL_ACTION_LABEL/);
  assert.match(painel, /Motivo da retirada \(obrigatório\)/);
  assert.match(painel, /mode: "preview"/);
  assert.match(painel, /mode: "apply"/);
  const mesa = readFileSync(new URL("../modules/arquiteto/arquiteto-workspace.tsx", import.meta.url), "utf8");
  assert.match(mesa, /<SiloArticleWithdrawalPanel/);
});
