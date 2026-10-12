/**
 * F4 — SERVIDOR DA RETIRADA E DO VÍNCULO DO GRUPO (SDD 2026-10-12 §6.2-6, §11).
 *
 * `handleSiloArticleWithdrawal` com dependências em memória: prévia sem
 * escrita, aplicação com evento ANTES do par e sucesso só depois da releitura;
 * recusa sem escrita nenhuma. `linkDeclaredPlanGroupToSilo` com um cliente em
 * memória: liga quando os Assuntos são do mesmo grupo com plano, não se aplica
 * sem plano e nunca lança.
 *
 * Roda com `--conditions=react-server` e o registro de TS. Nenhuma rede.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { handleSiloArticleWithdrawal, type SiloArticleWithdrawalDeps } from "../lib/server/arquiteto-silo-article-withdrawal.ts";
import { linkDeclaredPlanGroupToSilo } from "../lib/server/arquiteto-silo-group-link.ts";
import { buildProvisionalGroups } from "../lib/arquiteto/engine.ts";
import { deterministicArticleDnaPayload } from "../lib/arquiteto/adapters.ts";
import { chooseSiloWorkingCopyPillar, formSiloWorkingCopies } from "../lib/arquiteto/silo-formation.ts";
import { buildConsolidatedSiloDnaPayload, buildConsolidatedSiloPagePayload } from "../lib/arquiteto/silo-consolidation.ts";
import { createVersionEnvelope } from "../lib/arquiteto/versioning.ts";
import type { SiloDNA, SiloPage, VersionEnvelope, VersionStatusEvent } from "../lib/arquiteto/contracts.ts";

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

async function article(id: string, value: string, volume = 100) {
  const payload = deterministicArticleDnaPayload(buildProvisionalGroups([keyword(`${id}-kw`, value, volume)])[0], MARCA);
  return createVersionEnvelope({ entityId: payload.articleId, versionNumber: 1, origin: "system", changeReason: "fixture", createdBy: ATOR, payload });
}

async function acervo() {
  const artigos = [await article("a1", "internet residencial planos", 900), await article("a2", "internet residencial plano vivo controle", 300), await article("a3", "internet residencial fibra", 200)];
  const copia = chooseSiloWorkingCopyPillar(formSiloWorkingCopies({ brandId: MARCA, articleVersions: artigos }).workingCopies[0], artigos[0].payload.articleId);
  const entrada = { copy: { ...copia, source: "existing" as const, conflicts: [] }, articleVersions: artigos };
  const dna = await createVersionEnvelope({ entityId: copia.id, versionNumber: 1, origin: "human", changeReason: "fixture", createdBy: ATOR, payload: buildConsolidatedSiloDnaPayload(entrada) });
  const pagePayload = buildConsolidatedSiloPagePayload(dna, entrada);
  const page = await createVersionEnvelope({ entityId: pagePayload.siloPageId, versionNumber: 1, origin: "human", changeReason: "fixture", createdBy: ATOR, payload: pagePayload });
  return { artigos, dna, page };
}

/** Banco em memória do lado da retirada: o par gravado entra no acervo, o evento numa lista. */
function dependencias(base: Awaited<ReturnType<typeof acervo>>, opcoes: { ignorarPar?: boolean; estagios?: string[] } = {}) {
  const ordem: string[] = [];
  const siloDnas: VersionEnvelope<SiloDNA>[] = [base.dna];
  const siloPages: VersionEnvelope<SiloPage>[] = [base.page];
  const eventos: VersionStatusEvent[] = [];
  const statuses = [base.dna, base.page, ...base.artigos].map(version => ({ versionId: version.versionId, status: "approved" }));
  const deps: SiloArticleWithdrawalDeps = {
    brandId: MARCA,
    actorUserId: ATOR,
    listArtifacts: async () => ({ articleDnas: base.artigos, siloDnas: [...siloDnas], siloPages: [...siloPages], statuses: [...statuses] }),
    readDownstreamStages: async () => opcoes.estagios ?? [],
    persistPair: async (dna, page, status) => {
      ordem.push("par");
      if (!opcoes.ignorarPar) {
        siloDnas.push(dna);
        siloPages.push(page);
        statuses.push({ versionId: dna.versionId, status: status.siloDna }, { versionId: page.versionId, status: status.siloPage });
      }
      return { siloDna: dna, siloPage: page };
    },
    appendRejection: async event => { ordem.push("evento"); if (!eventos.some(item => item.eventId === event.eventId)) eventos.push(event); },
    readRejection: async eventId => {
      const evento = eventos.find(item => item.eventId === eventId);
      return evento ? { versionId: evento.versionId, status: evento.status } : null;
    },
    now: () => "2026-10-12T18:00:00.000Z",
  };
  return { deps, ordem, eventos, siloDnas };
}

test("prévia: lê, mostra o que muda e não grava nada", async () => {
  const base = await acervo();
  const { deps, ordem } = dependencias(base);
  const resultado = await handleSiloArticleWithdrawal(deps, { siloId: base.dna.payload.siloId, articleId: base.artigos[1].payload.articleId, reason: "", mode: "preview" });
  assert.equal(resultado.state, "READY");
  if (resultado.state !== "READY") return;
  assert.equal(resultado.siloDnaVersionId, base.dna.versionId);
  assert.ok(resultado.changes.length >= 3);
  assert.deepEqual(ordem, []);
});

test("aplicação: evento rejected ANTES do par, sucesso só depois da releitura", async () => {
  const base = await acervo();
  const { deps, ordem, eventos, siloDnas } = dependencias(base);
  const sai = base.artigos[1].payload.articleId;
  const resultado = await handleSiloArticleWithdrawal(deps, { siloId: base.dna.payload.siloId, articleId: sai, reason: "fora do plano declarado", mode: "apply", expectedSiloDnaVersionId: base.dna.versionId });
  assert.equal(resultado.state, "APPLIED");
  assert.deepEqual(ordem, ["evento", "par"]);
  assert.equal(eventos.length, 1);
  assert.equal(eventos[0].status, "rejected");
  assert.equal(eventos[0].versionId, base.artigos[1].versionId);
  const vigente = siloDnas.at(-1)!;
  assert.equal(vigente.versionNumber, 2);
  assert.equal(vigente.payload.supportArticleIds.includes(sai), false);
  if (resultado.state === "APPLIED") assert.equal(resultado.siloDna.versionId, vigente.versionId);
});

test("aplicação sem motivo ou com o artigo no Radar: recusa e nenhuma escrita", async () => {
  const base = await acervo();
  const semMotivo = dependencias(base);
  const r1 = await handleSiloArticleWithdrawal(semMotivo.deps, { siloId: base.dna.payload.siloId, articleId: base.artigos[1].payload.articleId, reason: " ", mode: "apply" });
  assert.equal(r1.state, "REFUSED");
  if (r1.state === "REFUSED") assert.equal(r1.code, "REASON_REQUIRED");
  assert.deepEqual(semMotivo.ordem, []);
  const noRadar = dependencias(base, { estagios: ["radar"] });
  const r2 = await handleSiloArticleWithdrawal(noRadar.deps, { siloId: base.dna.payload.siloId, articleId: base.artigos[1].payload.articleId, reason: "fora do plano", mode: "apply" });
  assert.equal(r2.state === "REFUSED" ? r2.code : null, "ARTICLE_IN_DOWNSTREAM");
  assert.deepEqual(noRadar.ordem, []);
});

test("releitura divergente: não declara sucesso (503)", async () => {
  const base = await acervo();
  const { deps } = dependencias(base, { ignorarPar: true });
  await assert.rejects(
    handleSiloArticleWithdrawal(deps, { siloId: base.dna.payload.siloId, articleId: base.artigos[1].payload.articleId, reason: "fora do plano", mode: "apply" }),
    (error: unknown) => (error as { status?: number }).status === 503 && /releitura/.test(String((error as Error).message)),
  );
});

/* ------------------------------------------------------- vínculo do grupo */

type Reply = { data: unknown; error: { code?: string; message?: string } | null; count?: number };
class Consulta {
  op = "select";
  filtros: Array<[string, unknown]> = [];
  readonly tabela: string;
  readonly banco: Banco;
  constructor(banco: Banco, tabela: string) { this.banco = banco; this.tabela = tabela; }
  select() { return this; }
  eq(coluna: string, valor: unknown) { this.filtros.push([coluna, valor]); return this; }
  is(coluna: string, valor: unknown) { this.filtros.push([coluna, valor]); return this; }
  in(coluna: string, valor: unknown) { this.filtros.push([coluna, valor]); return this; }
  not() { return this; }
  update(valor: unknown) { this.op = "update"; this.banco.escritas.push({ tabela: this.tabela, op: "update", valor }); return this; }
  insert(valor: unknown) { this.op = "insert"; this.banco.escritas.push({ tabela: this.tabela, op: "insert", valor }); return this; }
  maybeSingle() { return this.resolver(); }
  single() { return this.resolver(); }
  then<A = Reply, B = never>(ok?: ((value: Reply) => A | PromiseLike<A>) | null, falha?: ((reason: unknown) => B | PromiseLike<B>) | null) {
    return this.resolver().then(ok, falha);
  }
  resolver() { return Promise.resolve(this.banco.responder(this.tabela, this.op, this.filtros)); }
}
class Banco {
  escritas: Array<{ tabela: string; op: string; valor: unknown }> = [];
  readonly responder: (tabela: string, op: string, filtros: Array<[string, unknown]>) => Reply;
  constructor(responder: (tabela: string, op: string, filtros: Array<[string, unknown]>) => Reply) { this.responder = responder; }
  from(tabela: string) { return new Consulta(this, tabela); }
}

const ASSUNTO_1 = "3a2b1c0d-9e8f-4a7b-8c6d-5e4f3a2b1c0d";
const ASSUNTO_2 = "4b3c2d1e-0f9a-4b8c-9d7e-6f5a4b3c2d1e";

function bancoDoGrupo(opcoes: { grupoDoAssunto2?: string | null; comPlano?: boolean; siloAtual?: string | null; quebrarArtigos?: boolean } = {}) {
  return new Banco((tabela, op) => {
    if (tabela === "editorial_artifact_versions") {
      if (opcoes.quebrarArtigos) return { data: null, error: { code: "57014", message: "timeout" } };
      return { data: [
        { version_id: "v1", payload: { articleId: "art-1", subject: { keywordId: ASSUNTO_1 } } },
        { version_id: "v2", payload: { payload: { articleId: "art-2", subject: { keywordId: ASSUNTO_2 } } } },
      ], error: null };
    }
    if (tabela === "minerador_keywords") {
      return { data: [{ id: ASSUNTO_1, keyword: "a", group_id: GRUPO }, { id: ASSUNTO_2, keyword: "b", group_id: opcoes.grupoDoAssunto2 === undefined ? GRUPO : opcoes.grupoDoAssunto2 }], error: null };
    }
    if (tabela === "editorial_groups" && op === "select") {
      return { data: { id: GRUPO, marca_id: MARCA, name: "Planos e contratação", color: "yellow", origin: opcoes.comPlano === false ? "manual" : "declared_plan", status: "active", plan: opcoes.comPlano === false ? null : { siloName: "Planos e contratação", siloSlug: "planos-de-internet", objective: null, articleCount: 2 }, plan_version: 1, plan_hash: "h", silo_id: opcoes.siloAtual ?? null, lock_version: 3 }, error: null };
    }
    if (tabela === "editorial_groups" && op === "update") return { data: [{ id: GRUPO }], error: null };
    if (tabela === "editorial_group_events") return { data: null, error: null };
    return { data: null, error: { message: `tabela inesperada ${tabela}` } };
  });
}

const contexto = (banco: Banco) => ({ supabase: banco as never, brandId: MARCA, actorUserId: ATOR });

test("vínculo: Assuntos do mesmo grupo com plano ligam o grupo ao Silo", async () => {
  const banco = bancoDoGrupo();
  const resultado = await linkDeclaredPlanGroupToSilo(contexto(banco), { siloId: "territory:silo-1", articleVersionIds: ["v1", "v2"] });
  assert.equal(resultado.state, "linked");
  const update = banco.escritas.find(item => item.tabela === "editorial_groups" && item.op === "update");
  assert.equal((update?.valor as { silo_id?: string }).silo_id, "territory:silo-1");
});

test("vínculo: grupos mistos ou grupo sem plano não ligam; já ligado ao mesmo Silo não regrava", async () => {
  const misto = bancoDoGrupo({ grupoDoAssunto2: null });
  assert.equal((await linkDeclaredPlanGroupToSilo(contexto(misto), { siloId: "s", articleVersionIds: ["v1", "v2"] })).state, "not_applicable");
  assert.equal(misto.escritas.length, 0);
  const semPlano = bancoDoGrupo({ comPlano: false });
  assert.equal((await linkDeclaredPlanGroupToSilo(contexto(semPlano), { siloId: "s", articleVersionIds: ["v1", "v2"] })).state, "not_applicable");
  assert.equal(semPlano.escritas.length, 0);
  const jaLigado = bancoDoGrupo({ siloAtual: "s" });
  assert.equal((await linkDeclaredPlanGroupToSilo(contexto(jaLigado), { siloId: "s", articleVersionIds: ["v1", "v2"] })).state, "unchanged");
  assert.equal(jaLigado.escritas.length, 0);
});

test("vínculo: grupo ligado a outro Silo ou banco caído vira 'failed', nunca exceção", async () => {
  const outro = await linkDeclaredPlanGroupToSilo(contexto(bancoDoGrupo({ siloAtual: "outro-silo" })), { siloId: "s", articleVersionIds: ["v1", "v2"] });
  assert.equal(outro.state, "failed");
  const caido = await linkDeclaredPlanGroupToSilo(contexto(bancoDoGrupo({ quebrarArtigos: true })), { siloId: "s", articleVersionIds: ["v1", "v2"] });
  assert.equal(caido.state, "failed");
});
