/**
 * 2026-10-12 — SERVIDOR DE "APLICAR O PLANO DECLARADO AO SILO" (SDD §11 passo 7).
 *
 * `handleSiloDeclaredPlan` com dependências em memória: a prévia não grava e
 * devolve o decisionHash; a aplicação só grava com o MESMO hash, relê o par e
 * só depois liga o grupo; sem mudança real não há versão; releitura divergente
 * não declara sucesso. Roda com `--conditions=react-server` e o registro de TS.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { handleSiloDeclaredPlan, type SiloDeclaredPlanDeps } from "../lib/server/arquiteto-silo-declared-plan.ts";
import { buildProvisionalGroups } from "../lib/arquiteto/engine.ts";
import { deterministicArticleDnaPayload } from "../lib/arquiteto/adapters.ts";
import { chooseSiloWorkingCopyPillar, formSiloWorkingCopies } from "../lib/arquiteto/silo-formation.ts";
import { buildConsolidatedSiloDnaPayload, buildConsolidatedSiloPagePayload } from "../lib/arquiteto/silo-consolidation.ts";
import { createVersionEnvelope } from "../lib/arquiteto/versioning.ts";
import type { ArticleDNA, SiloDNA, SiloPage, VersionEnvelope } from "../lib/arquiteto/contracts.ts";
import type { DeclaredSiloPlanEntry } from "../lib/arquiteto/silo-declared-plan.ts";

const fetchOriginal = globalThis.fetch;
globalThis.fetch = (async () => { throw new Error("rede proibida no teste"); }) as typeof fetch;
test.after(() => { globalThis.fetch = fetchOriginal; });

const MARCA = "5b0e7c1a-2d3f-4a5b-8c9d-0e1f2a3b4c5d";
const ATOR = "0f1e2d3c-4b5a-4968-8776-655443322110";
const GRUPO = "6f1d2c3b-4a5e-4f60-8a7b-9c0d1e2f3a4b";

const keyword = (id: string, value: string, volume_search = 100) => ({
  id, keyword: value, intent: "Informativo", volume_search, results_allintitle: null, kgr_score: null, lista_id: null,
  siloName: null, status: "aprovado", analise_semantica: { entidade_central: "internet", publico: "clientes", problema_percebido: "duvida" },
});
async function artigo(id: string, value: string, volume = 100) {
  const payload = deterministicArticleDnaPayload(buildProvisionalGroups([keyword(`${id}-kw`, value, volume)])[0], MARCA) as ArticleDNA;
  return createVersionEnvelope({ entityId: payload.articleId, versionNumber: 1, origin: "system", changeReason: "fixture", createdBy: ATOR, payload });
}
const entrada = (version: VersionEnvelope<ArticleDNA>, order: number, role: "Pilar" | "Suporte"): DeclaredSiloPlanEntry => ({
  subjectKeywordId: `assunto-${order}`,
  plan: { groupId: GRUPO, planVersion: 1, order, role, scope: `Escopo ${order}.`, declaredPrincipal: { keywordId: version.payload.principalKeywordId, phrase: `principal ${order}` } },
  declaredBy: "dono", declaredAt: "2026-10-12T12:00:00Z",
});

async function cenario(opcoes: { ignorarPar?: boolean } = {}) {
  const a1 = await artigo("a1", "internet residencial melhor plano", 900);
  const a2 = await artigo("a2", "internet residencial fibra ou radio", 400);
  const a3 = await artigo("a3", "internet residencial claro ou vivo", 300);
  const artigos = [a1, a2, a3];
  const copia = chooseSiloWorkingCopyPillar(formSiloWorkingCopies({ brandId: MARCA, articleVersions: artigos }).workingCopies[0], a3.payload.articleId);
  const base = { copy: { ...copia, source: "existing" as const, conflicts: [] }, articleVersions: artigos };
  const dna = await createVersionEnvelope({ entityId: copia.id, versionNumber: 1, origin: "human", changeReason: "fixture", createdBy: ATOR, payload: buildConsolidatedSiloDnaPayload(base) });
  const pagePayload = buildConsolidatedSiloPagePayload(dna, base);
  const page = await createVersionEnvelope({ entityId: pagePayload.siloPageId, versionNumber: 1, origin: "human", changeReason: "fixture", createdBy: ATOR, payload: pagePayload });
  const siloDnas: VersionEnvelope<SiloDNA>[] = [dna];
  const siloPages: VersionEnvelope<SiloPage>[] = [page];
  const statuses = [dna, page].map(version => ({ versionId: version.versionId, status: "approved" }));
  const ordem: string[] = [];
  const deps: SiloDeclaredPlanDeps = {
    brandId: MARCA,
    actorUserId: ATOR,
    readInputs: async () => ({
      articleDnas: artigos, siloDnas: [...siloDnas], siloPages: [...siloPages], statuses: [...statuses],
      entries: [entrada(a1, 1, "Pilar"), entrada(a2, 2, "Suporte"), entrada(a3, 3, "Suporte")],
      groupPlans: new Map([[GRUPO, { siloName: "Planos e contratação", siloSlug: "planos-de-internet", objective: "Objetivo declarado.", articleCount: 3 } as never]]),
    }),
    persistPair: async (novoDna, novaPage, status) => {
      ordem.push("par");
      if (!opcoes.ignorarPar) {
        siloDnas.push(novoDna);
        siloPages.push(novaPage);
        statuses.push({ versionId: novoDna.versionId, status: status.siloDna }, { versionId: novaPage.versionId, status: status.siloPage });
      }
      return { siloDna: novoDna, siloPage: novaPage };
    },
    linkGroup: async input => { ordem.push("grupo"); return { state: "linked", groupId: GRUPO, siloId: input.siloId, message: "O grupo “laranja” ficou ligado a este Silo." }; },
  };
  return { deps, ordem, dna, a1, siloDnas };
}

test("prévia: não grava, mostra a troca do Pilar e devolve o decisionHash", async () => {
  const { deps, ordem, dna } = await cenario();
  const previa = await handleSiloDeclaredPlan(deps, { siloId: dna.payload.siloId, mode: "preview" });
  assert.equal(previa.state, "READY");
  if (previa.state !== "READY") return;
  assert.match(previa.decisionHash, /^[a-f0-9]{64}$/);
  assert.equal(previa.siloDnaVersionId, dna.versionId);
  assert.equal(previa.pillar.from?.label, "internet residencial claro ou vivo");
  assert.equal(previa.pillar.to.label, "internet residencial melhor plano");
  assert.deepEqual(ordem, []);
});

test("aplicação: só com o mesmo hash; grava o par, relê, e SÓ DEPOIS liga o grupo; repetir não cria versão", async () => {
  const { deps, ordem, dna, a1, siloDnas } = await cenario();
  const semHash = await handleSiloDeclaredPlan(deps, { siloId: dna.payload.siloId, mode: "apply" });
  assert.equal(semHash.state === "REFUSED" ? semHash.code : null, "STALE_DECISION");
  assert.deepEqual(ordem, []);
  const previa = await handleSiloDeclaredPlan(deps, { siloId: dna.payload.siloId, mode: "preview" });
  if (previa.state !== "READY") throw new Error("prévia");
  const aplicado = await handleSiloDeclaredPlan(deps, { siloId: dna.payload.siloId, mode: "apply", expectedSiloDnaVersionId: previa.siloDnaVersionId, decisionHash: previa.decisionHash });
  assert.equal(aplicado.state, "APPLIED", JSON.stringify(aplicado));
  assert.deepEqual(ordem, ["par", "grupo"]);
  assert.equal(siloDnas.at(-1)!.versionNumber, 2);
  assert.equal(siloDnas.at(-1)!.payload.pillarArticleId, a1.payload.articleId);
  if (aplicado.state === "APPLIED") assert.equal(aplicado.groupLink.state, "linked");
  // A mesma prévia de novo: o Silo já segue o plano; a aplicação não cria versão.
  const outra = await handleSiloDeclaredPlan(deps, { siloId: dna.payload.siloId, mode: "preview" });
  assert.equal(outra.state, "UNCHANGED");
  if (outra.state !== "UNCHANGED" || outra.mode !== "preview") return;
  const repetida = await handleSiloDeclaredPlan(deps, { siloId: dna.payload.siloId, mode: "apply", decisionHash: outra.decisionHash });
  assert.equal(repetida.state, "UNCHANGED");
  assert.deepEqual(ordem, ["par", "grupo"], "nenhuma escrita a mais");
  // A prévia antiga não vale mais: o Silo mudou.
  const velha = await handleSiloDeclaredPlan(deps, { siloId: dna.payload.siloId, mode: "apply", expectedSiloDnaVersionId: previa.siloDnaVersionId, decisionHash: previa.decisionHash });
  assert.equal(velha.state === "REFUSED" ? velha.code : null, "STALE_SILO");
});

test("releitura divergente: não declara sucesso (503) e não liga o grupo", async () => {
  const { deps, ordem, dna } = await cenario({ ignorarPar: true });
  const previa = await handleSiloDeclaredPlan(deps, { siloId: dna.payload.siloId, mode: "preview" });
  if (previa.state !== "READY") throw new Error("prévia");
  await assert.rejects(
    handleSiloDeclaredPlan(deps, { siloId: dna.payload.siloId, mode: "apply", decisionHash: previa.decisionHash }),
    (error: unknown) => (error as { status?: number }).status === 503 && /releitura/.test(String((error as Error).message)),
  );
  assert.deepEqual(ordem, ["par"]);
});
