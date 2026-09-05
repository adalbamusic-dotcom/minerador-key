import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createVersionEnvelope } from "../lib/arquiteto/versioning.ts";
import { deterministicArticleDnaPayload } from "../lib/arquiteto/adapters.ts";
import { buildProvisionalGroups } from "../lib/arquiteto/engine.ts";
import { chooseSiloWorkingCopyPillar, formSiloWorkingCopies, siloWorkingCopyIssues } from "../lib/arquiteto/silo-formation.ts";
import { SILO_WORKING_COPY_RPC_ERRORS, buildSiloWorkingCopyRef, readRpcDomainError } from "../lib/arquiteto/silo-working-copy-record.ts";
import { SiloDNASchema, SiloPageSchema } from "../lib/arquiteto/contracts.ts";

import { buildTerritoryRef } from "../lib/arquiteto/territory.ts";

const read = (relative: string) => readFileSync(new URL("../" + relative, import.meta.url), "utf8");
const STORE = "lib/server/arquiteto-silo-working-copy-store.ts";
const ADAPTER = "lib/server/arquiteto-silo-consolidation-adapter.ts";
const WORKSPACE_ROUTE = "app/api/arquiteto/workspace/route.ts";
const CONSOLIDATION_ROUTE = "app/api/arquiteto/silo-consolidation/route.ts";
const FORMATION = "lib/arquiteto/silo-formation.ts";

const executable = (source: string) =>
  source.split("\n").filter(line => {
    const trimmed = line.trim();
    return !trimmed.startsWith("*") && !trimmed.startsWith("/*") && !trimmed.startsWith("//");
  }).join("\n");

const HASH = `sha256:${"a".repeat(64)}`;
const TERRITORY = buildTerritoryRef("11111111-1111-4111-8111-111111111111");

const keywordFixture = (id: string, value: string, overrides: Record<string, unknown> = {}) => ({
  id, keyword: value, intent: "Informativo", volume_search: 100,
  results_allintitle: null, kgr_score: null, lista_id: null, siloName: null,
  status: "aprovado",
  analise_semantica: { entidade_central: "manicure", publico: "clientes", problema_percebido: "duvida" },
  ...overrides,
});

async function article(id: string, value: string, overrides: Record<string, unknown> = {}) {
  const group = buildProvisionalGroups([keywordFixture(`${id}-kw`, value, overrides)])[0];
  const payload = deterministicArticleDnaPayload(group, "brand-1");
  return createVersionEnvelope({
    entityId: payload.articleId, versionNumber: 1, origin: "system",
    changeReason: "fixture", createdBy: "test", payload,
  });
}

// --- 1..5 - writers canônicos ------------------------------------------------

test("1 · create da working copy usa a RPC transacional", () => {
  const store = read(STORE);
  const create = store.slice(store.indexOf("export async function createSiloWorkingCopy"));
  assert.match(create, /\.rpc\("persist_silo_working_copy_atomic"/);
  assert.match(create, /p_action: "create"/);
  assert.match(create, /p_working_copy_expected_lock: null/);
});

test("2 · update da working copy usa a RPC transacional", () => {
  const store = read(STORE);
  const update = store.slice(store.indexOf("export async function updateSiloWorkingCopy"));
  assert.match(update, /\.rpc\("persist_silo_working_copy_atomic"/);
  assert.match(update, /p_action: "edit"/);
  assert.match(update, /p_working_copy_expected_lock: expectedLock/);
});

test("3 · o caminho canônico não usa WorkflowRepository para a working copy", () => {
  const store = executable(read(STORE));
  assert.equal(/WorkflowRepository/.test(store), false);
  assert.equal(/\.update\(/.test(store), false, "nenhum UPDATE PostgREST direto");
});

test("4 · o create não usa INSERT direto antigo", () => {
  const store = executable(read(STORE));
  assert.equal(/\.insert\(/.test(store), false);
  assert.equal(/\.upsert\(/.test(store), false);
  // Restam apenas leituras.
  assert.match(store, /\.select\(/);
});

test("5 · o update envia o expectedLock obtido da linha remota", () => {
  const rota = read(WORKSPACE_ROUTE);
  assert.match(rota, /expectedLock: z\.number\(\)\.int\(\)\.positive\(\)/);
  assert.match(rota, /updateSiloWorkingCopy\(context, update\.workingCopyRef, update\.expectedLock, update\.workingCopy\)/);
});

// --- 6..8 - erros preservados como domínio -----------------------------------

test("6 · stale lock não vira sucesso nem erro genérico", () => {
  assert.equal(readRpcDomainError({ message: 'ERRO: STALE_WORKING_COPY: the working copy changed' }), "STALE_WORKING_COPY");
  const store = read(STORE);
  assert.match(store, /function rpcFailure/);
  assert.match(store, /throw new PipelineRuntimeError\("CONFLICT", code, status\)/);
  // Erro sem código de domínio propaga como falha real, não como conflito.
  assert.equal(readRpcDomainError({ message: "connection reset" }), null);
});

test("7 · território consolidado devolve WORKING_COPY_ALREADY_CONSUMED", () => {
  assert.equal(
    readRpcDomainError({ message: "WORKING_COPY_ALREADY_CONSUMED: territory is consolidated" }),
    "WORKING_COPY_ALREADY_CONSUMED",
  );
  const sql = read("supabase/migrations/20260902150000_silo_working_copy_transactional_writers.sql");
  assert.match(sql, /WORKING_COPY_ALREADY_CONSUMED: territory is consolidated/);
});

test("8 · lifecycle não editável tem código próprio, distinto de consumida", () => {
  assert.equal(
    readRpcDomainError({ message: "TERRITORY_NOT_EDITABLE: territory lifecycle is archived" }),
    "TERRITORY_NOT_EDITABLE",
  );
  // Os 14 códigos existem separados — nada colapsa em PERSISTENCE_FAILED.
  assert.equal(SILO_WORKING_COPY_RPC_ERRORS.length, 14);
  assert.equal(SILO_WORKING_COPY_RPC_ERRORS.includes("PERSISTENCE_FAILED" as never), false);
});

// --- 9..10 - reload usa o remoto ---------------------------------------------

test("9 · o reload lê a working copy remota", () => {
  const rota = read(WORKSPACE_ROUTE);
  assert.match(rota, /listSiloWorkingCopies\(context\)/);
  // O snapshot cresceu com o parecer de SERP já gravado; o que importa é que
  // território e working copy remotas continuam saindo do MESMO GET.
  assert.match(rota, /data: \{ \.\.\.workspace, territories, siloWorkingCopies/);
  assert.match(rota, /listTerritorialSerpAssessments\(context\)/);
});

test("10 · a working copy remota é a autoridade, não a projeção local", () => {
  const store = executable(read(STORE));
  assert.equal(/localStorage|indexedDB|sessionStorage|architect-recovery/.test(store), false);
  const adapter = executable(read(ADAPTER));
  assert.equal(/localStorage|indexedDB|sessionStorage/.test(adapter), false);
  // 2C.4.6: o adapter carrega a working copy INTEIRA e a parseia pelo contrato,
  // não só ref e lock. Estado intermediário não é fonte.
  assert.match(read(ADAPTER), /async function loadWorkingCopy/);
  assert.match(read(ADAPTER), /parseSiloWorkingCopyRow/);
  assert.match(read(ADAPTER), /\.eq\("subject_type", SILO_WORKING_COPY_SUBJECT_TYPE\)/);
});

// --- 11..16 - Pilar automático removido --------------------------------------

test("11 · buildCopy não escolhe scores[0] como Pilar", async () => {
  const first = await article("a1", "manicure profissional", { volume_search: 900 });
  const second = await article("a2", "manicure para iniciantes", { volume_search: 300 });
  const result = formSiloWorkingCopies({ brandId: "brand-1", articleVersions: [first, second] });
  const copy = result.workingCopies[0];
  assert.equal(copy.pillarCandidateArticleId, null);
  assert.notEqual(copy.pillarScores.length, 0, "a sugestão continua existindo");
  const formation = executable(read(FORMATION));
  assert.equal(/const pillar = scores\[0\]/.test(formation), false);
});

test("12 · volume não escolhe Pilar", async () => {
  const alto = await article("alto", "manicure", { volume_search: 100000 });
  const baixo = await article("baixo", "manicure para iniciantes", { volume_search: 10 });
  const copy = formSiloWorkingCopies({ brandId: "brand-1", articleVersions: [alto, baixo] }).workingCopies[0];
  assert.equal(copy.pillarCandidateArticleId, null);
  assert.deepEqual(copy.supportArticleIds, [], "suportes não são presumidos");
});

test("13 · KGR não escolhe Pilar", async () => {
  const kgr = await article("kgr", "manicure com esmaltação em gel", { volume_search: 100, kgr_score: 0.05 });
  const outro = await article("outro", "manicure profissional", { volume_search: 900 });
  const copy = formSiloWorkingCopies({ brandId: "brand-1", articleVersions: [kgr, outro] }).workingCopies[0];
  assert.equal(copy.pillarCandidateArticleId, null);
});

test("14 · centralidade não escolhe Pilar", async () => {
  const first = await article("c1", "manicure profissional", { volume_search: 500 });
  const second = await article("c2", "manicure para iniciantes", { volume_search: 500 });
  const copy = formSiloWorkingCopies({ brandId: "brand-1", articleVersions: [first, second] }).workingCopies[0];
  assert.equal(copy.pillarCandidateArticleId, null);
  assert.equal(copy.pillarScores.every(score => typeof score.total === "number"), true);
});

test("15 · ordem não escolhe Pilar", async () => {
  const first = await article("primeiro", "manicure profissional", { volume_search: 400 });
  const second = await article("segundo", "manicure para iniciantes", { volume_search: 400 });
  const direta = formSiloWorkingCopies({ brandId: "brand-1", articleVersions: [first, second] }).workingCopies[0];
  const invertida = formSiloWorkingCopies({ brandId: "brand-1", articleVersions: [second, first] }).workingCopies[0];
  assert.equal(direta.pillarCandidateArticleId, null);
  assert.equal(invertida.pillarCandidateArticleId, null);
});

test("16 · a IA não seleciona Pilar", () => {
  const consolidation = executable(read("lib/arquiteto/silo-consolidation.ts"));
  assert.equal(/pillarCandidateArticleId: selectedIds\[0\]/.test(consolidation), false);
  assert.match(consolidation, /pillarCandidateArticleId: null/);
});

// --- 17..19 - decisão humana persistida --------------------------------------

test("17 · a decisão humana de Pilar fecha a estrutura", async () => {
  const first = await article("h1", "manicure profissional", { volume_search: 900 });
  const second = await article("h2", "manicure para iniciantes", { volume_search: 300 });
  const copy = formSiloWorkingCopies({ brandId: "brand-1", articleVersions: [first, second] }).workingCopies[0];
  assert.match(siloWorkingCopyIssues(copy).join(" "), /decisão humana/i);

  const decidido = chooseSiloWorkingCopyPillar(copy, second.payload.articleId);
  assert.equal(decidido.pillarCandidateArticleId, second.payload.articleId);
  assert.deepEqual(decidido.supportArticleIds, [first.payload.articleId]);
  assert.deepEqual(siloWorkingCopyIssues(decidido), []);
});

test("18 · o contrato remoto guarda a decisão inteira e a composição decidida", () => {
  const record = read("lib/arquiteto/silo-working-copy-record.ts");
  assert.match(record, /decidedOverArticleIds: z\.array/);
  assert.match(record, /actorUserId: z\.string\(\)\.min\(1\)/);
  assert.match(record, /decidedAt: z\.string\(\)\.min\(1\)/);
  assert.match(record, /reason: z\.string\(\)\.min\(1\)/);
  assert.match(record, /PILLAR_DECISION_STALE/);
});

test("19 · exclusões humanas fazem parte do estado remoto", () => {
  const record = read("lib/arquiteto/silo-working-copy-record.ts");
  assert.match(record, /exclusions: z\.array\(SiloWorkingCopyExclusionSchema\)/);
  assert.match(record, /SiloWorkingCopyExclusionSchema = z\.object/);
});

// --- 20..23 - proveniência e SiloPage ---------------------------------------

test("20 · a readiness roda no servidor, sobre o snapshot remoto", () => {
  const adapter = read(ADAPTER);
  // Executada de fato, e sobre a composição DERIVADA da working copy remota.
  assert.match(adapter, /const readiness = resolveSiloConsolidationReadiness\(\{/);
  assert.match(adapter, /composition = deriveExpectedCompositionFromWorkingCopy\(workingCopy\)/);
  assert.match(adapter, /if \(readiness\.state !== "ready"\)/);
  // Nenhum booleano do chamador é autoridade de readiness.
  const rota = read(CONSOLIDATION_ROUTE);
  assert.equal(/clientReady|readyForConsolidation|approved: z\.boolean/.test(rota), false);
  // E a API não recalcula arquitetura: recebe os envelopes prontos.
  assert.match(rota, /siloDna: VersionedSiloDNASchema/);
  assert.equal(/buildConsolidatedSiloDnaPayload|formSiloWorkingCopies/.test(rota), false);
});

test("21 · a proveniência do SiloDNA é comparada com a working copy remota", () => {
  const binding = read("lib/arquiteto/silo-dna-binding.ts");
  assert.match(binding, /siloDna\.workingCopyRef !== workingCopy\.workingCopyRef/);
  const adapter = read(ADAPTER);
  assert.match(adapter, /assertSiloDnaMatchesConfirmedWorkingCopy\(\{/);
  assert.match(adapter, /workingCopy,\s*\n\s*workingCopyLockVersion: lockVersion,/);
});

test("22 · o lock_version remoto é a fonte, e o snapshot é o mesmo da RPC", () => {
  const binding = read("lib/arquiteto/silo-dna-binding.ts");
  assert.match(binding, /siloDna\.workingCopyLockVersion !== input\.workingCopyLockVersion/);
  const adapter = read(ADAPTER);
  // O lock lido é o que viaja para a RPC — TOCTOU fechado pelo expectedLock.
  assert.match(adapter, /if \(lockVersion !== request\.workingCopyExpectedLock\)/);
  assert.match(adapter, /"STALE_WORKING_COPY"/);
  assert.match(adapter, /p_working_copy_expected_lock: request\.workingCopyExpectedLock/);
});

test("23 · a SiloPage não duplica a proveniência", () => {
  const base = {
    schemaVersion: 1, formationStatus: "formed", siloPageId: "silo-page:silo-1", brandId: "brand-1",
    siloDnaRef: { entityId: "silo-1", versionId: "silo-1:v1", contentHash: HASH },
    siloId: "silo-1", slug: "/x", publicationStatus: "new",
    h1: "h", seoTitle: "s", metaDescription: "m", canonical: null, intro: "i",
    sections: [], cta: "c", coverImageBrief: "cb", visualBriefing: "vb", breadcrumbs: [],
    pillarArticleId: null, supportArticleIds: [], indexationStatus: "index",
    alerts: [], confidence: 1, humanPendingDecisions: [],
  };
  assert.equal(SiloPageSchema.safeParse(base).success, true);
  assert.equal(SiloPageSchema.safeParse({ ...base, workingCopyRef: buildSiloWorkingCopyRef(TERRITORY) }).success, false);
});

// --- 24..26 - entrypoint canônico e status -----------------------------------

test("24 · a consolidação usa a RPC A", () => {
  const adapter = read(ADAPTER);
  assert.match(adapter, /\.rpc\("persist_silo_from_working_copy_atomic"/);
  assert.match(adapter, /p_working_copy_expected_lock: request\.workingCopyExpectedLock/);
  assert.match(adapter, /p_territory_expected_lock: request\.territoryExpectedLock/);
});

test("25 · o caminho canônico não chama a 2C.1 nem a primitiva do par", () => {
  for (const file of [ADAPTER, CONSOLIDATION_ROUTE]) {
    const source = executable(read(file));
    assert.equal(/persist_silo_pair_and_consolidate_territory_atomic/.test(source), false, file);
    assert.equal(/persist_silo_pair_atomic/.test(source), false, file);
  }
});

test("26 · os status de SiloDNA e SiloPage continuam independentes", () => {
  const rota = read(CONSOLIDATION_ROUTE);
  assert.match(rota, /siloDnaStatus: z\.enum/);
  assert.match(rota, /siloPageStatus: z\.enum/);
  const adapter = read(ADAPTER);
  assert.match(adapter, /p_silo_dna_status: request\.statuses\.siloDna/);
  assert.match(adapter, /p_silo_page_status: request\.statuses\.siloPage/);
  // Nada iguala um ao outro por conveniência.
  assert.equal(/siloPageStatus: parsed\.siloDnaStatus|statuses\.siloPage = statuses\.siloDna/.test(rota + adapter), false);
});

// --- 27..32 - replay, erros e readback ---------------------------------------

test("27 · o replay reutiliza o mesmo envelope: o adapter não reconstrói", () => {
  const adapter = executable(read(ADAPTER));
  assert.equal(/createVersionEnvelope/.test(adapter), false, "o adapter não fabrica envelope");
  assert.match(adapter, /p_silo_dna: request\.siloDna/);
  assert.match(adapter, /p_silo_page: request\.siloPage/);
});

test("28 · o replay não regenera versionId", () => {
  const rota = executable(read(CONSOLIDATION_ROUTE));
  assert.equal(/createVersionEnvelope|crypto\.randomUUID/.test(rota), false);
  // O envelope chega validado do request, com a identidade que o cliente manda.
  assert.match(read(CONSOLIDATION_ROUTE), /siloDna: VersionedSiloDNASchema/);
});

test("29 · o replay não regenera createdAt", () => {
  const rota = executable(read(CONSOLIDATION_ROUTE));
  const adapter = executable(read(ADAPTER));
  assert.equal(/new Date\(\)/.test(rota + adapter), false);
  // A origem do risco fica documentada onde ela existe.
  assert.match(read("lib/arquiteto/versioning.ts"), /createdAt = new Date\(\)\.toISOString\(\)/);
  assert.match(read(ADAPTER), /ESTABILIDADE DO ENVELOPE/);
});

test("30 · divergência de binding não vira sucesso, e cada recusa mantém código", () => {
  const adapter = read(ADAPTER);
  // Toda recusa do binding aborta antes da RPC, com o código próprio na mensagem.
  assert.match(adapter, /function refuse\(refusals: readonly BindingRefusal\[\]\)/);
  assert.match(adapter, /`\$\{first\.code\}: \$\{first\.detail\}`/);
  const binding = read("lib/arquiteto/silo-dna-binding.ts");
  for (const code of [
    "SILO_DNA_WORKING_COPY_MISMATCH", "PILLAR_DECISION_STALE", "ARTICLE_COVERAGE_GAP",
    "ARTICLE_VERSION_MISMATCH", "ARTICLE_TERRITORY_MISMATCH", "ARTICLE_BRAND_MISMATCH",
    "SILO_PAGE_STRUCTURAL_MISMATCH", "PUBLISHED_IDENTITY_MUTATED",
    "PUBLISHED_IDENTITY_DECISION_REQUIRED", "SILO_DNA_APPROVAL_WITHOUT_HUMAN_DECISION",
    "SILO_PAGE_APPROVAL_GATE_MISSING",
  ]) {
    assert.ok(binding.includes(code), code);
  }
  assert.equal(/PERSISTENCE_FAILED/.test(adapter + binding), false);
});

test("31 · erro stale não vira sucesso", () => {
  const adapter = read(ADAPTER);
  assert.match(adapter, /const code = readRpcDomainError\(result\.error\)/);
  assert.match(adapter, /if \(code\) throw new PipelineRuntimeError\("CONFLICT", code, 409\)/);
  assert.equal(readRpcDomainError({ message: "STALE_WORKING_COPY: changed" }), "STALE_WORKING_COPY");
});

test("32 · sucesso só depois do readback remoto completo", () => {
  const adapter = read(ADAPTER);
  assert.match(adapter, /for \(const key of \["territory", "siloDna", "siloPage", "workingCopy"\]\)/);
  assert.match(adapter, /O readback da consolidação está incompleto/);
  assert.match(adapter, /persistence: "PERSISTED"/);
});

// --- 33..36 - pós-consolidação e higiene -------------------------------------

test("33 · pós-consolidação a working copy fica somente leitura", () => {
  const sql = read("supabase/migrations/20260902150000_silo_working_copy_transactional_writers.sql");
  const writer = sql.slice(sql.indexOf("CREATE FUNCTION public.persist_silo_working_copy_atomic"));
  const corpo = writer.slice(0, writer.indexOf("$function$;"));
  assert.match(corpo, /IF lifecycle = 'consolidated' THEN\s*\n\s*RAISE EXCEPTION 'WORKING_COPY_ALREADY_CONSUMED/);
});

test("34 · nenhum lifecycle `consumed` foi criado", () => {
  const record = executable(read("lib/arquiteto/silo-working-copy-record.ts"));
  assert.match(record, /SILO_WORKING_COPY_FORMATION_STATUSES = \["draft", "ready_for_review"\]/);
  assert.equal(/"consumed"/.test(record), false);
  const sql = read("supabase/migrations/20260902150000_silo_working_copy_transactional_writers.sql");
  const entrypoint = sql.slice(sql.indexOf("CREATE FUNCTION public.persist_silo_from_working_copy_atomic"));
  const corpo = entrypoint.slice(0, entrypoint.indexOf("$function$;"));
  assert.equal(/UPDATE public\.editorial_workflow_items/.test(corpo), false, "a consolidação não escreve na WC");
});

test("35 · lista_id não reaparece como Silo nem como território", () => {
  for (const file of [STORE, ADAPTER, CONSOLIDATION_ROUTE, "lib/arquiteto/silo-working-copy-record.ts"]) {
    assert.equal(/lista_id/.test(executable(read(file))), false, file);
  }
  const dna = SiloDNASchema.safeParse({ siloId: "silo-1", territoryRef: "lista-77" });
  assert.equal(dna.success, false);
});

test("36 · zero chamadas a provider em todo o caminho novo", () => {
  for (const file of [STORE, ADAPTER, CONSOLIDATION_ROUTE, FORMATION]) {
    const source = read(file);
    assert.doesNotMatch(source, /dataforseo|deepseek|google-ads|openai|anthropic|serper/i, file);
  }
});
