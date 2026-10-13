/**
 * F5 · GUARDA DE RETRABALHO — SERVIDOR (SDD 2026-10-12 §10).
 *
 * A linha `operation_ledger` lida e gravada sobre um banco em memória; a
 * operação sob a guarda (o fechamento do Silo usa este caminho): a mesma
 * recusa volta 409 `REWORK_SAME_REFUSAL` sem rodar, "Refazer mesmo assim" com
 * motivo passa, falha transitória nunca barra; a retirada e o plano no Silo
 * com a porta real; a coleta paga da SERP; a gravação do ArticleDNA com o plano
 * declarado (`DECLARED_PLAN_CONTRADICTION`) e o caminho paralelo.
 *
 * Roda com `--conditions=react-server` e o registro de TS. Nenhuma rede.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { checkRework, recordOperation, readReworkLedgerRow, runUnderReworkGuard, reworkGuardPort, ReworkRefusedError, type ReworkOperation } from "../lib/server/rework-guard.ts";
import { assertArticleDnaAgainstDeclaredPlan } from "../lib/server/arquiteto-rework-guard.ts";
import { recordSerpFormationOutcomes, serpFormationReworkGate } from "../lib/server/arquiteto-serp-rework-guard.ts";
import { pipelineArtifactErrorResponse } from "../lib/server/arquiteto-persistence.ts";
import { PipelineRuntimeError } from "../lib/server/pipeline-runtime.ts";
import { handleSiloArticleWithdrawal, type SiloArticleWithdrawalDeps } from "../lib/server/arquiteto-silo-article-withdrawal.ts";
import { siloConsolidationFailureDisposition } from "../lib/arquiteto/silo-consolidation-operation.ts";
import { readReworkLedgerPayload } from "../lib/editorial/rework-guard.ts";
import { buildProvisionalGroups } from "../lib/arquiteto/engine.ts";
import { deterministicArticleDnaPayload } from "../lib/arquiteto/adapters.ts";
import { chooseSiloWorkingCopyPillar, formSiloWorkingCopies } from "../lib/arquiteto/silo-formation.ts";
import { buildConsolidatedSiloDnaPayload, buildConsolidatedSiloPagePayload } from "../lib/arquiteto/silo-consolidation.ts";
import { createVersionEnvelope } from "../lib/arquiteto/versioning.ts";
import type { ArticleDNA, SiloDNA, SiloPage, VersionEnvelope, VersionStatusEvent } from "../lib/arquiteto/contracts.ts";
import { linhaDaMesa, declarado } from "./arquiteto-assunto-fixtures.mts";

const fetchOriginal = globalThis.fetch;
globalThis.fetch = (async () => { throw new Error("rede proibida no teste"); }) as typeof fetch;
test.after(() => { globalThis.fetch = fetchOriginal; });

const MARCA = "5b0e7c1a-2d3f-4a5b-8c9d-0e1f2a3b4c5d";
const ATOR = "0f1e2d3c-4b5a-4968-8776-655443322110";
const GRUPO = "6f1d2c3b-4a5e-4f60-8a7b-9c0d1e2f3a4b";

/* ------------------------------ banco em memória ------------------------------ */

type Linha = Record<string, unknown>;
class Consulta {
  op: "select" | "insert" | "update" = "select";
  filtros: Array<(linha: Linha) => boolean> = [];
  valores: Linha | null = null;
  unica = false;
  readonly banco: Banco;
  readonly tabela: string;
  constructor(banco: Banco, tabela: string) { this.banco = banco; this.tabela = tabela; }
  select() { return this; }
  eq(coluna: string, valor: unknown) { this.filtros.push(linha => linha[coluna] === valor); return this; }
  in(coluna: string, valores: unknown[]) { this.filtros.push(linha => valores.includes(linha[coluna])); return this; }
  not(coluna: string, _op: string, _valor: unknown) { this.filtros.push(linha => linha[coluna] !== null && linha[coluna] !== undefined); return this; }
  order() { return this; }
  limit() { return this; }
  maybeSingle() { this.unica = true; return this; }
  insert(valores: Linha) { this.op = "insert"; this.valores = valores; return this; }
  update(valores: Linha) { this.op = "update"; this.valores = valores; return this; }
  then<A, B = never>(resolve: (valor: { data: unknown; error: unknown }) => A, reject?: (motivo: unknown) => B) {
    return Promise.resolve().then(() => this.banco.executar(this)).then(resolve, reject);
  }
}
class Banco {
  tabelas = new Map<string, Linha[]>();
  falhar = false;
  private proximo = 1;
  linhas(tabela: string) { if (!this.tabelas.has(tabela)) this.tabelas.set(tabela, []); return this.tabelas.get(tabela)!; }
  from(tabela: string) { if (this.falhar) throw new Error("banco fora do ar"); return new Consulta(this, tabela); }
  executar(consulta: Consulta) {
    const linhas = this.linhas(consulta.tabela);
    if (consulta.op === "insert") {
      const nova = structuredClone(consulta.valores!);
      if (consulta.tabela === "editorial_workflow_items" && linhas.some(linha => ["marca_id", "subject_type", "subject_id", "stage"].every(chave => linha[chave] === nova[chave]))) {
        return { data: null, error: { code: "23505", message: "duplicate key" } };
      }
      linhas.push({ ...nova, id: `linha-${this.proximo++}`, lock_version: 1 });
      return { data: null, error: null };
    }
    const alvo = linhas.filter(linha => consulta.filtros.every(filtro => filtro(linha)));
    if (consulta.op === "update") {
      for (const linha of alvo) Object.assign(linha, structuredClone(consulta.valores!), { lock_version: Number(linha.lock_version) + 1 });
      return { data: null, error: null };
    }
    const copia = alvo.map(linha => structuredClone(linha));
    return { data: consulta.unica ? copia[0] ?? null : copia, error: null };
  }
}
const contexto = (banco: Banco) => ({ supabase: banco as never, brandId: MARCA, actorUserId: ATOR, module: "arquiteto", action: "edit" }) as never;
const ledger = (banco: Banco) => banco.linhas("editorial_workflow_items").filter(linha => linha.subject_type === "operation_ledger");

const operacao = (extra: Partial<ReworkOperation> = {}): ReworkOperation => ({
  kind: "silo_consolidation", fingerprint: "sha256:" + "a".repeat(64), inputsSummary: "Fechamento do Silo territory:x",
  policy: { sameInputs: "ignore", sameRefusal: "block" }, ...extra,
});

/* ------------------------------ a linha do guarda ------------------------------ */

test("F5-S1 · registrar cria UMA linha operation_ledger por insumo e acrescenta tentativas; ler devolve a anterior", async () => {
  const banco = new Banco();
  assert.equal((await checkRework(contexto(banco), operacao())).verdict, "fresh");
  assert.equal(await recordOperation(contexto(banco), operacao({ groupId: GRUPO }), { outcome: "refused", outcomeCode: "SILO_NOT_READY_FOR_CONSOLIDATION", message: "SILO_NOT_READY_FOR_CONSOLIDATION: falta o Pilar" }), true);
  assert.equal(await recordOperation(contexto(banco), operacao(), { outcome: "failed", outcomeCode: "INDETERMINATE" }), true);
  const linhas = ledger(banco);
  assert.equal(linhas.length, 1, "mesmos insumos = mesma linha");
  assert.equal(linhas[0].stage, "architect");
  assert.equal(linhas[0].subject_id, `silo_consolidation:sha256:${"a".repeat(64)}`);
  assert.equal(linhas[0].source_entity_id, linhas[0].subject_id, "a origem é a própria operação, nunca uma keyword");
  assert.equal(linhas[0].article_id, null, "sem article_id: nenhum leitor por artigo a enxerga");
  const payload = readReworkLedgerPayload(linhas[0].payload);
  assert.equal(payload?.attempts.length, 2);
  assert.equal(payload?.groupId, GRUPO);
  const veredito = await checkRework(contexto(banco), operacao());
  assert.equal(veredito.verdict, "same_refusal", "a falha transitória depois da recusa não apaga a recusa");
  assert.equal(veredito.code, "REWORK_SAME_REFUSAL");
  // Idempotente pelo instante dado pelo chamador.
  await recordOperation(contexto(banco), operacao(), { outcome: "succeeded", outcomeCode: "OK", at: "2026-10-12T21:00:00.000Z" });
  await recordOperation(contexto(banco), operacao(), { outcome: "succeeded", outcomeCode: "OK", at: "2026-10-12T21:00:00.000Z" });
  assert.equal(readReworkLedgerPayload((await readReworkLedgerRow(contexto(banco), "silo_consolidation", "sha256:" + "a".repeat(64)))?.payload)?.attempts.length, 3);
});

test("F5-S2 · banco fora do ar: a guarda nunca derruba a operação (fresh) e o registro devolve false", async () => {
  const banco = new Banco();
  banco.falhar = true;
  assert.equal((await checkRework(contexto(banco), operacao())).verdict, "fresh");
  assert.equal(await recordOperation(contexto(banco), operacao(), { outcome: "succeeded" }), false);
});

test("F5-S3 · operação sob a guarda: a mesma recusa volta 409 REWORK_SAME_REFUSAL sem rodar; motivo passa; falha transitória não barra", async () => {
  const banco = new Banco();
  let rodou = 0;
  const recusar = () => { rodou += 1; throw new PipelineRuntimeError("CONFLICT", "SILO_PAGE_APPROVAL_CANONICAL_MISSING: Declare o site da marca", 409); };
  const opcoes = { classifyFailure: (error: unknown) => siloConsolidationFailureDisposition(error) === "discard" ? "refused" as const : "failed" as const, success: () => ({ outcomeCode: "SILO_CONSOLIDATED" }) };
  await assert.rejects(runUnderReworkGuard(contexto(banco), operacao(), opcoes, async () => recusar()), /SILO_PAGE_APPROVAL_CANONICAL_MISSING/);
  assert.equal(rodou, 1);
  let erro: unknown = null;
  try { await runUnderReworkGuard(contexto(banco), operacao(), opcoes, async () => recusar()); } catch (error) { erro = error; }
  assert.ok(erro instanceof ReworkRefusedError);
  assert.equal(rodou, 1, "a RPC não é chamada de novo");
  assert.equal((erro as ReworkRefusedError).status, 409);
  assert.equal(siloConsolidationFailureDisposition(erro), "discard", "a tela descarta a operação congelada");
  const resposta = pipelineArtifactErrorResponse(erro);
  assert.equal(resposta.status, 409);
  const corpo = resposta.body as { code: string; error: string; rework: { verdict: string; previous: { outcomeCode: string } | null; canOverride: boolean } };
  assert.equal(corpo.code, "REWORK_SAME_REFUSAL");
  assert.match(corpo.error, /^REWORK_SAME_REFUSAL: A mesma recusa aconteceu em \d\d\/\d\d às \d\d:\d\d: SILO_PAGE_APPROVAL_CANONICAL_MISSING: Declare o site da marca\./);
  assert.equal(corpo.rework.verdict, "same_refusal");
  assert.equal(corpo.rework.previous?.outcomeCode, "SILO_PAGE_APPROVAL_CANONICAL_MISSING");
  assert.equal(corpo.rework.canOverride, true);
  // "Refazer mesmo assim" com motivo (D11): roda, e o motivo fica no registro.
  const ok = await runUnderReworkGuard(contexto(banco), operacao(), { ...opcoes, override: { reason: "o site foi declarado em outra aba" } }, async () => "gravado");
  assert.equal(ok, "gravado");
  const tentativas = readReworkLedgerPayload(ledger(banco)[0].payload)!.attempts;
  assert.equal(tentativas.at(-1)?.overrideReason, "o site foi declarado em outra aba");
  // Insumo novo (outro fingerprint): roda sem motivo; falha transitória nunca barra a próxima.
  const outro = operacao({ fingerprint: "sha256:" + "b".repeat(64) });
  await assert.rejects(runUnderReworkGuard(contexto(banco), outro, opcoes, async () => { throw new Error("rede caiu"); }), /rede caiu/);
  assert.equal(await runUnderReworkGuard(contexto(banco), outro, opcoes, async () => "ok"), "ok");
});

/* ------------------------------ retirada com a porta real ------------------------------ */

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
function retirada(base: Awaited<ReturnType<typeof acervo>>, banco: Banco) {
  const siloDnas: VersionEnvelope<SiloDNA>[] = [base.dna];
  const siloPages: VersionEnvelope<SiloPage>[] = [base.page];
  const eventos: VersionStatusEvent[] = [];
  const statuses = [base.dna, base.page, ...base.artigos].map(version => ({ versionId: version.versionId, status: "approved" }));
  const deps: SiloArticleWithdrawalDeps = {
    brandId: MARCA,
    actorUserId: ATOR,
    listArtifacts: async () => ({ articleDnas: base.artigos, siloDnas: [...siloDnas], siloPages: [...siloPages], statuses: [...statuses] }),
    readDownstreamStages: async () => [],
    persistPair: async (dna, page) => { siloDnas.push(dna); siloPages.push(page); return { siloDna: dna, siloPage: page }; },
    appendRejection: async event => { eventos.push(event); },
    readRejection: async eventId => { const evento = eventos.find(item => item.eventId === eventId); return evento ? { versionId: evento.versionId, status: evento.status } : null; },
    now: () => "2026-10-12T18:00:00.000Z",
    rework: reworkGuardPort(contexto(banco)),
    groupOf: async () => GRUPO,
  };
  return deps;
}

test("F5-S4 · Retirar artigo do Silo: a recusa fica no histórico e a prévia seguinte diz 'a mesma recusa'; a retirada feita entra com o grupo", async () => {
  const base = await acervo();
  const banco = new Banco();
  const deps = retirada(base, banco);
  const pilar = base.artigos[0].payload.articleId;
  const recusa = await handleSiloArticleWithdrawal(deps, { siloId: base.dna.payload.siloId, articleId: pilar, reason: "fora do plano declarado", mode: "apply" });
  assert.equal(recusa.state, "REFUSED");
  assert.equal(ledger(banco).length, 1);
  const previa = await handleSiloArticleWithdrawal(deps, { siloId: base.dna.payload.siloId, articleId: pilar, reason: "fora do plano declarado", mode: "preview" });
  assert.equal(previa.state, "REFUSED");
  assert.equal((previa as { rework?: { verdict: string } }).rework?.verdict, "same_refusal");
  assert.match((previa as { message: string }).message, /A mesma recusa aconteceu em/);
  // A retirada de um suporte: sucesso registrado, com o grupo do artigo.
  const suporte = base.artigos[1].payload.articleId;
  const feita = await handleSiloArticleWithdrawal(deps, { siloId: base.dna.payload.siloId, articleId: suporte, reason: "fora do plano declarado", mode: "apply" });
  assert.equal(feita.state, "APPLIED");
  const sucesso = ledger(banco).map(linha => readReworkLedgerPayload(linha.payload)!).find(payload => payload.attempts.some(item => item.outcome === "succeeded"));
  assert.equal(sucesso?.kind, "silo_article_withdrawal");
  assert.equal(sucesso?.groupId, GRUPO);
  assert.equal(sucesso?.attempts[0].outcomeCode, "ARTICLE_WITHDRAWN");
  // Sem porta (testes antigos, caminho sem guarda): nada muda.
  const semGuarda = await handleSiloArticleWithdrawal({ ...retirada(base, new Banco()), rework: undefined }, { siloId: base.dna.payload.siloId, articleId: pilar, reason: "x".repeat(12), mode: "preview" });
  assert.equal((semGuarda as { rework?: unknown }).rework, undefined);
});

/* ------------------------------ coleta paga da SERP ------------------------------ */

test("F5-S5 · coleta paga da SERP: a mesma composição paga e inconclusiva sai do plano; com motivo passa; conclusiva nunca barra", async () => {
  const banco = new Banco();
  const grupo = { id: "artigo-1", publishedAnchorId: null, keywordIds: ["k2", "k1"], principalSuggestion: { keywordId: "k1" } };
  const pedido = { groups: [grupo], formationBaseHashes: { "artigo-1": "base-1" }, lenses: ["desktop-windows", "mobile-android"], resultLimit: 10, location: "Brasil", language: "pt-br" };
  const primeiro = await serpFormationReworkGate(contexto(banco), pedido);
  assert.deepEqual(primeiro.refused, []);
  await recordSerpFormationOutcomes(contexto(banco), primeiro, [{ articleId: "artigo-1", verdict: "INCONCLUSIVE", recommendation: "Evidência insuficiente." }]);
  const segundo = await serpFormationReworkGate(contexto(banco), { ...pedido, groups: [{ ...grupo, keywordIds: ["k1", "k2"] }] });
  assert.equal(segundo.refused.length, 1, "ordem dos membros não é insumo novo");
  assert.match(segundo.refused[0].assessment.message, /parecer inconclusivo/);
  // Composição nova (outra base): roda.
  assert.deepEqual((await serpFormationReworkGate(contexto(banco), { ...pedido, formationBaseHashes: { "artigo-1": "base-2" } })).refused, []);
  // "Refazer mesmo assim" com motivo.
  const comMotivo = await serpFormationReworkGate(contexto(banco), { ...pedido, override: { reason: "a SERP do nicho mudou nesta semana" } });
  assert.deepEqual(comMotivo.refused, []);
  assert.equal(comMotivo.overrideReason, "a SERP do nicho mudou nesta semana");
  // Coleta paga com parecer: nunca barra a próxima (o cache serve).
  const outra = await serpFormationReworkGate(contexto(banco), { ...pedido, formationBaseHashes: { "artigo-1": "base-3" } });
  await recordSerpFormationOutcomes(contexto(banco), outra, [{ articleId: "artigo-1", verdict: "COMPATIBLE" }]);
  assert.deepEqual((await serpFormationReworkGate(contexto(banco), { ...pedido, formationBaseHashes: { "artigo-1": "base-3" } })).refused, []);
});

/* ------------------------------ gravação do ArticleDNA ------------------------------ */

const ASSUNTO = "11111111-2222-4333-8444-555555555555";
const DECLARADA = "aaaaaaaa-0000-4000-8000-00000000000d";
const OUTRA = "aaaaaaaa-0000-4000-8000-00000000000e";

function bancoComPlano(previa?: { principalKeywordId: string; hierarchy: string }) {
  const banco = new Banco();
  const semantic = { ...declarado(), keyword_subject: { declared: true, note: null, destinationUrl: null, destinationCheck: null, plan: { groupId: GRUPO, planVersion: 1, order: 3, role: "Suporte", scope: "Compara as três operadoras para o CEP da pessoa.", declaredPrincipal: { keywordId: DECLARADA, phrase: "Claro Vivo ou TIM internet" } } } };
  const linha = linhaDaMesa({ id: ASSUNTO, keyword: "Claro, Vivo ou TIM", semantic });
  const workflow = linha.canonicalWorkflow as { state: string; payload: { approvedDna: unknown } };
  banco.linhas("minerador_keywords").push({ id: ASSUNTO, brand_id: MARCA, keyword: "Claro, Vivo ou TIM", deleted_at: null });
  banco.linhas("editorial_workflow_items").push({ id: "wf-assunto", marca_id: MARCA, subject_type: "keyword", stage: "architect", subject_id: ASSUNTO, state: workflow.state, approvedDna: workflow.payload.approvedDna, lock_version: 1 });
  if (previa) banco.linhas("editorial_artifact_versions").push({ marca_id: MARCA, entity_id: ASSUNTO, artifact_type: "article_dna", version_number: 1, version_id: "v1", ...previa });
  return banco;
}
async function artigoDoAssunto(principal: string, hierarchy: "Pilar" | "Suporte") {
  const base = (await article("assunto", "claro vivo ou tim internet", 300)).payload;
  return { ...base, principalKeywordId: principal, hierarchy, subject: { keywordId: ASSUNTO } } as unknown as ArticleDNA;
}

test("F5-S6 · gravar ArticleDNA que troca a principal declarada: 409 DECLARED_PLAN_CONTRADICTION, sem override, no histórico do grupo", async () => {
  const banco = bancoComPlano({ principalKeywordId: DECLARADA, hierarchy: "Suporte" });
  let erro: unknown = null;
  try { await assertArticleDnaAgainstDeclaredPlan(contexto(banco), { entityId: ASSUNTO, article: await artigoDoAssunto(OUTRA, "Suporte"), previousVersionId: "v1" }); } catch (error) { erro = error; }
  assert.ok(erro instanceof ReworkRefusedError, String(erro));
  assert.equal((erro as ReworkRefusedError).reworkCode, "DECLARED_PLAN_CONTRADICTION");
  assert.equal((erro as ReworkRefusedError).assessment.canOverride, false);
  assert.match((erro as Error).message, /deixaria de ser a declarada \(“Claro Vivo ou TIM internet”\)/);
  const corpo = pipelineArtifactErrorResponse(erro).body as { code: string };
  assert.equal(corpo.code, "DECLARED_PLAN_CONTRADICTION");
  const registro = readReworkLedgerPayload(ledger(banco)[0]?.payload);
  assert.equal(registro?.kind, "article_dna_write");
  assert.equal(registro?.groupId, GRUPO);
});

test("F5-S7 · gravar ArticleDNA que vai PARA o plano (principal declarada, papel do plano) passa; o mesmo estado de antes passa sem ler a keyword", async () => {
  const banco = bancoComPlano({ principalKeywordId: OUTRA, hierarchy: "Pilar" });
  assert.equal(await assertArticleDnaAgainstDeclaredPlan(contexto(banco), { entityId: ASSUNTO, article: await artigoDoAssunto(DECLARADA, "Suporte"), previousVersionId: "v1" }), null);
  const igual = bancoComPlano({ principalKeywordId: OUTRA, hierarchy: "Pilar" });
  igual.linhas("minerador_keywords").length = 0;
  assert.equal(await assertArticleDnaAgainstDeclaredPlan(contexto(igual), { entityId: ASSUNTO, article: await artigoDoAssunto(OUTRA, "Pilar"), previousVersionId: "v1" }), null);
  assert.equal(ledger(igual).length, 0);
});

test("F5-S8 · caminho paralelo: ArticleDNA NOVO sem Assunto com principal em grupo com plano é recusado; com versão anterior, nada é lido", async () => {
  const banco = new Banco();
  const solto = (await article("solto", "plano vivo controle", 49500)).payload;
  banco.linhas("minerador_keywords").push({ id: DECLARADA, brand_id: MARCA, keyword: "plano vivo controle", group_id: GRUPO });
  banco.linhas("editorial_groups").push({ id: GRUPO, marca_id: MARCA, name: "laranja", color: "laranja", origin: "declared_plan", status: "active", plan: { siloName: "Planos e contratação" }, plan_version: 1, plan_hash: null, silo_id: null, lock_version: 1 });
  const artigo = { ...solto, principalKeywordId: DECLARADA, subject: undefined } as unknown as ArticleDNA;
  await assert.rejects(assertArticleDnaAgainstDeclaredPlan(contexto(banco), { entityId: "article-candidate:x", article: artigo, previousVersionId: null }), (error: unknown) => error instanceof ReworkRefusedError && error.reworkCode === "REWORK_PARALLEL_PATH");
  const vazio = new Banco();
  vazio.falhar = true;
  assert.equal(await assertArticleDnaAgainstDeclaredPlan(contexto(vazio), { entityId: "article-candidate:x", article: artigo, previousVersionId: "v-anterior" }), null, "versão nova de artigo existente não lê nada");
});
