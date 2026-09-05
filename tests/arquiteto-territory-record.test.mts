import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import test from "node:test";
import {
  KEYWORD_TERRITORY_STATES,
  KeywordTerritoryDecisionSchema,
  TerritoryCandidateSchema,
  buildTerritoryRef,
  emptyTerritoryDiscovery,
  emptyTerritoryLineage,
  projectKeywordTerritoryStates,
  resolveKeywordTerritoryState,
  type TerritoryCandidate,
} from "../lib/arquiteto/territory.ts";
import {
  PARTIAL_OPERATION_CANONICAL_LOCATION,
  TERRITORY_RECORD_CONTRACT_VERSION,
  TERRITORY_SUBJECT_TYPE,
  TERRITORY_WORKFLOW_STAGE,
  buildTerritoryWorkflowRow,
  parseTerritoryWorkflowRow,
  planTerritoryPersistence,
  territoryHasPersistedPartialOperation,
  territorySourceEntityId,
  TERRITORY_REMOTE_PERSISTENCE_CLASSIFICATION,
} from "../lib/arquiteto/territory-record.ts";

const BRAND = "brand-1";
const NOW = "2026-09-02T12:00:00.000Z";
const REF = buildTerritoryRef("11111111-1111-4111-8111-111111111111");
const HASH = `sha256:${"a".repeat(64)}`;
const versionRef = (entityId: string) => ({ entityId, versionId: `${entityId}:v1`, contentHash: HASH });

function territory(overrides: Partial<TerritoryCandidate> = {}): TerritoryCandidate {
  return TerritoryCandidateSchema.parse({
    schemaVersion: 1,
    territoryRef: REF,
    brandId: BRAND,
    existingSiloRef: null,
    name: "Barreira cutânea",
    centralEntity: "barreira cutânea",
    macroIntent: "sustentar autoridade sobre barreira cutânea",
    boundary: { includes: ["barreira cutânea"], excludes: ["acne"] },
    narrative: { statement: "Da barreira ao ritual diário.", continuity: "coherent", brandAlignment: "aligned", rationale: ["Sustenta a promessa."] },
    discovery: emptyTerritoryDiscovery(),
    territoryKind: "new",
    architecturalOrigin: "manual_strategic",
    ingestionOrigin: "ui",
    lifecycleStatus: "candidate",
    decisionState: "pending",
    publicationProtection: "unpublished",
    slugState: { proposals: [], confirmed: null, publishedSlug: null, publishedCanonical: null },
    lineage: emptyTerritoryLineage(),
    consolidation: null,
    pendingOperation: null,
    conflicts: [],
    reasons: ["Território declarado pela estratégia da Marca."],
    provenance: { producedBy: "human", adoptedFromScenarioType: null, humanAdjustmentCount: 0, note: null },
    ...overrides,
  });
}

const decision = (state: string) => ({ state, reason: "Decisão humana explícita.", source: "human", decidedAt: NOW });

// --- 1..5 - invariantes de enderecamento -------------------------------------

test("1 · assigned com territoryRef é válido", () => {
  const resolution = resolveKeywordTerritoryState({ territoryRef: REF, territoryAssignment: decision("existing_silo_match") });
  assert.equal(resolution.state, "assigned");
  assert.equal(resolution.territoryRef, REF);
  assert.deepEqual(resolution.issues, []);
});

test("2 · assigned sem territoryRef é inválido", () => {
  const resolution = resolveKeywordTerritoryState({ territoryAssignment: decision("existing_silo_match") });
  assert.equal(resolution.state, "incoherent");
  assert.deepEqual(resolution.issues, ["ASSIGNED_WITHOUT_TERRITORY_REF"]);
  assert.equal(resolution.territoryRef, null);
});

test("3 · explicit_unassigned com territoryRef é inválido", () => {
  const resolution = resolveKeywordTerritoryState({ territoryRef: REF, territoryAssignment: decision("unassigned") });
  assert.equal(resolution.state, "incoherent");
  assert.deepEqual(resolution.issues, ["UNASSIGNED_WITH_TERRITORY_REF"]);
});

test("4 · explicit_unassigned com null é válido e exige motivo", () => {
  const resolution = resolveKeywordTerritoryState({ territoryRef: null, territoryAssignment: decision("unassigned") });
  assert.equal(resolution.state, "explicit_unassigned");
  assert.equal(resolution.territoryRef, null);
  assert.ok(resolution.decision?.reason);
  // Sem motivo a decisão nem existe: ausência não vira decisão por omissão.
  assert.equal(KeywordTerritoryDecisionSchema.safeParse({ ...decision("unassigned"), reason: "" }).success, false);
});

test("5 · ausência de decisão com null é unaddressed, e nunca decisão humana", () => {
  const resolution = resolveKeywordTerritoryState({ territoryRef: null });
  assert.equal(resolution.state, "unaddressed");
  assert.equal(resolution.decision, null);
  assert.notEqual(resolution.state, "explicit_unassigned");
  // territoryRef sem decisão também é incoerente: ponteiro não é decisão.
  assert.equal(resolveKeywordTerritoryState({ territoryRef: REF }).state, "incoherent");
  assert.deepEqual(KEYWORD_TERRITORY_STATES, ["assigned", "explicit_unassigned", "unaddressed"]);
});

// --- 6..8 - retrocompatibilidade e separacao de espacos de identidade --------

test("6 · payload legado sem os campos novos parseia e resolve unaddressed", () => {
  const legacy = {
    workingArticleId: "working-article:abc",
    clusterId: "cluster-9",
    provisionalGroupId: "grupo-3",
    siloId: "silo-legado-1",
    lista_id: "lista-77",
    siloName: "Silo legado",
    slug_sugerido: "silo-legado",
    hierarquia: "principal",
    role: "principal",
    principalKeywordId: "kw-1",
    manualEdit: true,
  };
  const snapshot = JSON.parse(JSON.stringify(legacy));
  const resolution = resolveKeywordTerritoryState(legacy);
  assert.equal(resolution.state, "unaddressed");
  assert.equal(resolution.territoryRef, null);
  assert.equal(resolution.decision, null);
  assert.deepEqual(resolution.issues, []);
  // Leitura é leitura: o payload legado não é reescrito nem enriquecido.
  assert.deepEqual(legacy, snapshot);
});

test("7 · lista_id nunca vira territoryRef", () => {
  assert.equal(resolveKeywordTerritoryState({ lista_id: "lista-77" }).state, "unaddressed");
  assert.equal(resolveKeywordTerritoryState({ territoryRef: "lista-77", territoryAssignment: decision("existing_silo_match") }).state, "incoherent");
  const source = readFileSync(new URL("../lib/arquiteto/territory-record.ts", import.meta.url), "utf8");
  const executable = source
    .split("\n")
    .filter(line => {
      const trimmed = line.trim();
      return !trimmed.startsWith("*") && !trimmed.startsWith("/*") && !trimmed.startsWith("//");
    })
    .join("\n");
  assert.equal(/lista_id/.test(executable), false);
});

test("8 · siloId nunca vira territoryRef", () => {
  assert.equal(resolveKeywordTerritoryState({ siloId: "silo-1" }).state, "unaddressed");
  assert.equal(resolveKeywordTerritoryState({ territoryRef: "silo-1", territoryAssignment: decision("existing_silo_match") }).state, "incoherent");
  // O Silo de origem é proveniência do território, não identidade da keyword.
  const existing = territory({
    architecturalOrigin: "existing",
    territoryKind: "existing",
    existingSiloRef: { siloId: "silo-1", siloDnaVersionRef: versionRef("silo-1"), siloPageVersionRef: null },
  });
  // 2A.2: source_entity_id NUNCA vira siloId. `siloId` pode originar-se de
  // `lista_id` (UUID cru) e as RPCs de purga 0046/0047 apagam itens de
  // workflow por `source_entity_id = keyword.id::text` — em 0047 sem filtro de
  // subject_type. O Silo de origem fica no payload, onde tem significado.
  assert.equal(territorySourceEntityId(existing), existing.territoryRef);
  assert.notEqual(territorySourceEntityId(existing), "silo-1");
  assert.equal(existing.existingSiloRef?.siloId, "silo-1");
  assert.notEqual(existing.territoryRef, "silo-1");
});

// --- 9 - territoryAssignment nao guarda segunda membership -------------------

test("9 · territoryAssignment não possui segunda referência nem lista de keywords", () => {
  const shape = Object.keys(KeywordTerritoryDecisionSchema.shape).sort();
  assert.deepEqual(shape, ["decidedAt", "reason", "source", "state"]);
  for (const forbidden of ["territoryRef", "keywordId", "keywordIds", "keywordRefs", "brandId", "members", "siloId"]) {
    assert.equal(shape.includes(forbidden), false, forbidden + " não pode viver na decisão");
    assert.equal(
      KeywordTerritoryDecisionSchema.safeParse({ ...decision("existing_silo_match"), [forbidden]: "x" }).success,
      false,
      forbidden + " precisa ser recusado pelo strict()",
    );
  }
  // A rota persiste exatamente este shape.
  const route = readFileSync(new URL("../app/api/arquiteto/workspace/route.ts", import.meta.url), "utf8");
  assert.match(route, /territoryAssignment: KeywordTerritoryDecisionSchema/);
  assert.equal(/KeywordTerritoryAssignmentSchema/.test(route), false);
});

// --- 10..11 - autoridade remota do territorio e da operacao parcial ----------

test("10 · o TerritoryCandidate tem registro canônico e sobrevive ao round-trip de serialização", () => {
  const original = territory();
  const row = buildTerritoryWorkflowRow(original);
  assert.equal(row.subjectType, TERRITORY_SUBJECT_TYPE);
  assert.equal(row.stage, TERRITORY_WORKFLOW_STAGE);
  assert.equal(row.subjectId, original.territoryRef);
  assert.equal(row.state, original.lifecycleStatus);
  assert.equal(row.articleId, null);
  assert.equal(row.payload.contractVersion, TERRITORY_RECORD_CONTRACT_VERSION);

  // Round-trip por JSON: a forma que o jsonb assume. NÃO prova o readback
  // remoto — RLS, CHECK, UNIQUE e o gatilho de lock_version não são exercidos.
  const readback = parseTerritoryWorkflowRow({ ...row, payload: JSON.parse(JSON.stringify(row.payload)) }, BRAND);
  assert.equal(readback.ok, true);
  assert.deepEqual(readback.territory, original);
  assert.equal(readback.territory?.centralEntity, original.centralEntity);
  assert.equal(readback.territory?.macroIntent, original.macroIntent);
  assert.deepEqual(readback.territory?.boundary, original.boundary);
  assert.deepEqual(readback.territory?.narrative, original.narrative);
  assert.deepEqual(readback.territory?.lineage, original.lineage);
  assert.equal(readback.territory?.decisionState, original.decisionState);

  // Recusas: tenant, espelho de estado e tipo de sujeito.
  assert.deepEqual(parseTerritoryWorkflowRow(row, "brand-outra").issues, ["CROSS_BRAND_RECORD"]);
  assert.deepEqual(parseTerritoryWorkflowRow({ ...row, state: "confirmed" }, BRAND).issues, ["STATE_DOES_NOT_MATCH_LIFECYCLE"]);
  assert.deepEqual(parseTerritoryWorkflowRow({ ...row, subjectType: "keyword" }, BRAND).issues, ["SUBJECT_TYPE_MISMATCH"]);

  // Criação x atualização: só a atualização carrega lock.
  assert.equal(planTerritoryPersistence(original, null).intent, "create");
  assert.equal(planTerritoryPersistence(original, 7).expectedLock, 7);
});

test("11 · a operação parcial mora no território, em cópia única sob um único lock", () => {
  const partial = territory({
    pendingOperation: {
      operationId: "op-1",
      kind: "move",
      actorUserId: "user-1",
      startedAt: NOW,
      participantTerritoryRefs: [REF],
      intendedKeywordIds: ["kw-1", "kw-2"],
      appliedKeywordIds: ["kw-1"],
      failedKeywordIds: ["kw-2"],
    },
  });
  assert.equal(territoryHasPersistedPartialOperation(partial), true);
  const row = buildTerritoryWorkflowRow(partial);
  const readback = parseTerritoryWorkflowRow({ ...row, payload: JSON.parse(JSON.stringify(row.payload)) }, BRAND);
  assert.equal(readback.ok, true);
  assert.equal(territoryHasPersistedPartialOperation(readback.territory!), true);
  assert.deepEqual(readback.territory?.pendingOperation?.failedKeywordIds, ["kw-2"]);
  // Uma única cópia, sob um único lock: nada é replicado nas keywords.
  assert.equal(
    PARTIAL_OPERATION_CANONICAL_LOCATION,
    "editorial_workflow_items[subject_type=territory].payload.territory.pendingOperation",
  );
  assert.equal(territoryHasPersistedPartialOperation(territory()), false);
});

// --- projecoes derivadas ----------------------------------------------------

test("12 · unassigned e unaddressed são projeções derivadas, nunca arrays persistidos", () => {
  const buckets = projectKeywordTerritoryStates(new Map<string, unknown>([
    ["kw-assigned", { territoryRef: REF, territoryAssignment: decision("existing_silo_match") }],
    ["kw-unassigned", { territoryRef: null, territoryAssignment: decision("unassigned") }],
    ["kw-legacy", { siloId: "silo-1", lista_id: "lista-9" }],
    ["kw-broken", { territoryRef: REF }],
  ]));
  assert.deepEqual(buckets.assignedKeywordIds, ["kw-assigned"]);
  assert.deepEqual(buckets.unassignedKeywordIds, ["kw-unassigned"]);
  assert.deepEqual(buckets.unaddressedKeywordIds, ["kw-legacy"]);
  assert.deepEqual(buckets.incoherentKeywordIds, ["kw-broken"]);

  // Nenhum dos dois nomes existe como campo persistido em contrato algum.
  for (const file of ["../lib/arquiteto/territory-record.ts", "../app/api/arquiteto/workspace/route.ts"]) {
    const source = readFileSync(new URL(file, import.meta.url), "utf8");
    assert.equal(/unassignedKeywordIds\s*:/.test(source), false, file + " não pode persistir a projeção");
    assert.equal(/unaddressedKeywordIds\s*:/.test(source), false, file + " não pode persistir a projeção");
  }
});

test("13 · o territoryRef é emitido pelo servidor, nunca pelo cliente", () => {
  const store = readFileSync(new URL("../lib/server/arquiteto-territory-store.ts", import.meta.url), "utf8");
  // O store impõe identidade e tenant DEPOIS do draft, sobrescrevendo o cliente.
  assert.match(store, /territoryRef: buildTerritoryRef\(\)/);
  assert.match(store, /brandId: context\.brandId/);
  assert.match(store, /territoryRef: current\.subject_id/);

  const route = readFileSync(new URL("../app/api/arquiteto/workspace/route.ts", import.meta.url), "utf8");
  assert.match(route, /"territoryRef" in create\.territory/);
  assert.equal(/buildTerritoryRef/.test(route), false, "a rota não emite identidade por conta própria");

  // O gerador é opaco e recusa qualquer coisa que não seja UUID canônico.
  assert.match(buildTerritoryRef(), /^territory:[0-9a-f-]{36}$/);
  assert.throws(() => buildTerritoryRef("silo-1"));
  assert.throws(() => buildTerritoryRef("lista-77"));
  assert.notEqual(buildTerritoryRef(), buildTerritoryRef());
});

// ===========================================================================
// 2A.2 - REMOTE TERRITORY RECORD CONTRACT GATE
// Estas asserções são ESTÁTICAS e de round-trip em memória. Nenhuma delas é um
// smoke de persistência remota: nada aqui abre conexão, escreve ou lê Postgres.
// ===========================================================================

const repoFile = (relative: string) => readFileSync(new URL("../" + relative, import.meta.url), "utf8");

test("14 · o CHECK de state no schema é de comprimento, não de vocabulário fechado", () => {
  const ddl = repoFile("supabase/migrations/0027_editorial_artifacts_workflow_serp.sql");
  const table = ddl.slice(ddl.indexOf("CREATE TABLE public.editorial_workflow_items"));
  const body = table.slice(0, table.indexOf(");"));

  // stage TEM vocabulário fechado; state e subject_type NÃO têm.
  assert.match(body, /stage text NOT NULL CHECK \(\s*stage IN \(/);
  assert.match(body, /state text NOT NULL CHECK \(char_length\(btrim\(state\)\) BETWEEN 1 AND 80\)/);
  assert.match(body, /subject_type text NOT NULL CHECK \(char_length\(btrim\(subject_type\)\) BETWEEN 1 AND 80\)/);
  assert.equal(/state IN \(/.test(body), false, "state não pode ter enum no banco");
  assert.equal(/subject_type IN \(/.test(body), false, "subject_type não pode ter enum no banco");
  assert.match(body, /architect/);

  // Os estados territoriais cabem no CHECK de comprimento.
  for (const lifecycle of ["candidate", "confirmed", "consolidated", "rejected", "superseded", "archived"]) {
    assert.ok(lifecycle.trim().length >= 1 && lifecycle.trim().length <= 80);
  }
  // E nenhuma migration posterior fechou o vocabulário de state.
  for (const later of [
    "supabase/migrations/0046_minerador_keyword_delete_lifecycle.sql",
    "supabase/migrations/0047_global_lifecycle_delete_recovery_purge.sql",
    "supabase/migrations/20260817233939_master_refresh_batch_3_editorial_contract_alignment.sql",
  ]) {
    assert.equal(/ADD CONSTRAINT[^;]*state IN \(/i.test(repoFile(later)), false, later);
  }
});

test("15 · nenhum consumer existente enxerga um item territorial", () => {
  // Toda leitura da tabela precisa estar estreitada por stage ou subject_type.
  const readers: Array<[string, string]> = [
    ["lib/server/editorial-repositories.ts", 'in("stage", ["radar", "planner"])'],
    ["lib/server/arquiteto-workspace.ts", 'eq("subject_type", "keyword")'],
    ["lib/server/arquiteto-territory-store.ts", 'eq("subject_type", TERRITORY_SUBJECT_TYPE)'],
  ];
  for (const [file, narrowing] of readers) {
    assert.ok(repoFile(file).includes(narrowing), file + " precisa estreitar por " + narrowing);
  }

  // O consumer de state com vocabulário fechado (allowed[item.state]) só recebe
  // RadarItem, e RadarItem só nasce de stage radar.
  const flow = repoFile("lib/editorial/operational-flow.ts");
  assert.match(flow, /allowed\[item\.state\]/);
  const editorial = repoFile("lib/server/editorial-repositories.ts");
  assert.match(editorial, /row\.stage === "radar"/);

  // A list() genérica de pipeline-repositories não estreita nada — e está morta.
  const pipeline = repoFile("lib/server/pipeline-repositories.ts");
  assert.match(pipeline, /async list\(\): Promise<PipelineReadResult<readonly PipelineRow\[\]>>/);
  const walk = (dir: string): string[] => {
    const entries = readdirSync(new URL("../" + dir + "/", import.meta.url), { withFileTypes: true });
    return entries.flatMap(entry => entry.isDirectory()
      ? walk(dir + "/" + entry.name)
      : /\.tsx?$/.test(entry.name) ? [dir + "/" + entry.name] : []);
  };
  const callers = ["app", "lib", "components"]
    .flatMap(dir => walk(dir))
    .filter(file => /workflow\s*\.\s*list\(\)|WorkflowRepository\([^)]*\)\.list\(\)/.test(repoFile(file)));
  assert.deepEqual(callers, [], "list() sem estreitamento não pode ganhar chamador");
});

test("16 · subject_id divergente do territoryRef do payload é RECUSADO", () => {
  const row = buildTerritoryWorkflowRow(territory());
  const outro = buildTerritoryRef("33333333-3333-4333-8333-333333333333");
  const divergente = parseTerritoryWorkflowRow({ ...row, subjectId: outro }, BRAND);
  assert.equal(divergente.ok, false);
  assert.ok(divergente.issues.includes("SUBJECT_ID_DOES_NOT_MATCH_PAYLOAD"));
  assert.equal(divergente.territory, null, "não pode escolher um dos dois lados");

  // subject_id que nem é territoryRef também é recusado.
  const naoRef = parseTerritoryWorkflowRow({ ...row, subjectId: "silo-1" }, BRAND);
  assert.equal(naoRef.ok, false);
  assert.ok(naoRef.issues.includes("SUBJECT_ID_IS_NOT_TERRITORY_REF"));
});

test("17 · marca_id divergente do brandId do payload é RECUSADO, sem fallback", () => {
  const row = buildTerritoryWorkflowRow(territory());
  const cruzado = parseTerritoryWorkflowRow(row, "brand-outra");
  assert.equal(cruzado.ok, false);
  assert.deepEqual(cruzado.issues, ["CROSS_BRAND_RECORD"]);
  assert.equal(cruzado.territory, null);
  // Nenhum caminho de leitura devolve território sob a Brand errada.
  const store = repoFile("lib/server/arquiteto-territory-store.ts");
  assert.match(store, /if \(!parsed\.ok\)/);
  assert.match(store, /eq\("marca_id", context\.brandId\)/);
});

test("18 · o update não troca territoryRef nem brandId", () => {
  const store = repoFile("lib/server/arquiteto-territory-store.ts");
  const update = store.slice(store.indexOf("export async function updateTerritoryWorkflowItem"));
  // A identidade vem da LINHA e do CONTEXTO, escritas depois do spread do draft.
  const spread = update.indexOf("...draft");
  assert.ok(spread > 0);
  assert.ok(update.indexOf("territoryRef: current.subject_id") > spread, "ref precisa sobrescrever o draft");
  assert.ok(update.indexOf("brandId: context.brandId") > spread, "brand precisa sobrescrever o draft");
  // E a rota recusa um corpo que declare ref diferente da endereçada.
  const rota = repoFile("app/api/arquiteto/workspace/route.ts");
  assert.match(rota, /declaredRef !== undefined && declaredRef !== update\.territoryRef/);
  assert.match(rota, /A identidade do território é imutável/);
});

test("19 · source_entity_id segue o contrato auditado e é imune ao predicado de purga", () => {
  const semSilo = territory();
  const comSilo = territory({
    architecturalOrigin: "existing",
    territoryKind: "existing",
    existingSiloRef: { siloId: "silo-1", siloDnaVersionRef: versionRef("silo-1"), siloPageVersionRef: null },
  });
  // Sempre o próprio ref, com ou sem Silo de origem.
  assert.equal(territorySourceEntityId(semSilo), semSilo.territoryRef);
  assert.equal(territorySourceEntityId(comSilo), comSilo.territoryRef);
  assert.equal(buildTerritoryWorkflowRow(comSilo).sourceEntityId, comSilo.territoryRef);

  // NOT NULL com CHECK de comprimento: NULL não era opção.
  const ddl = repoFile("supabase/migrations/0027_editorial_artifacts_workflow_serp.sql");
  assert.match(ddl, /source_entity_id text NOT NULL CHECK \(char_length\(btrim\(source_entity_id\)\) > 0\)/);

  // O predicado de purga compara com keyword.id::text - um UUID cru. O prefixo
  // torna a colisão estruturalmente impossível.
  const purga = repoFile("supabase/migrations/0047_global_lifecycle_delete_recovery_purge.sql");
  assert.match(purga, /workflow_item\.source_entity_id = current_keyword\.id::text/);
  const UUID_CRU = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  assert.equal(UUID_CRU.test(territorySourceEntityId(semSilo)), false);
  assert.equal(UUID_CRU.test(buildTerritoryWorkflowRow(semSilo).subjectId), false);
});

test("20 · round-trip de serialização NÃO é prova de persistência remota", () => {
  const row = buildTerritoryWorkflowRow(territory());
  const readback = parseTerritoryWorkflowRow({ ...row, payload: JSON.parse(JSON.stringify(row.payload)) }, BRAND);
  assert.equal(readback.ok, true);

  // O que este arquivo prova, e o que não prova.
  const proprio = repoFile("tests/arquiteto-territory-record.test.mts");
  // Os alvos sao montados por concatenacao: escritos literalmente, casariam
  // com a propria assercao e o teste passaria - ou falharia - por acidente.
  const tabela = ["editorial", "workflow", "items"].join("_");
  assert.equal(proprio.includes('from("' + tabela + '")'), false, "nao pode consultar a tabela");
  assert.equal(proprio.includes("create" + "Client("), false, "nao pode abrir cliente de banco");
  assert.equal(proprio.includes("@supa" + "base/supabase-js"), false, "nao pode importar driver");
  assert.equal(proprio.includes("REMOTE_" + "PERSISTENCE = PASS"), false, "nao pode se declarar smoke remoto");
  // A persistência remota permanece NÃO PROVADA até o smoke do usuário.
  assert.equal(TERRITORY_REMOTE_PERSISTENCE_CLASSIFICATION, "UNPROVEN_UNTIL_USER_SMOKE");
});
