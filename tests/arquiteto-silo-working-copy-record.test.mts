import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { buildTerritoryRef } from "../lib/arquiteto/territory.ts";
import {
  SILO_WORKING_COPY_CONTRACT_VERSION,
  SILO_WORKING_COPY_RPC_ERRORS,
  readRpcDomainError,
  SILO_WORKING_COPY_STAGE,
  SILO_WORKING_COPY_SUBJECT_TYPE,
  SiloWorkingCopyStateSchema,
  buildSiloWorkingCopyRef,
  buildSiloWorkingCopyRow,
  isSiloWorkingCopyRef,
  territoryRefOfWorkingCopy,
  parseSiloWorkingCopyRow,
  pillarSuggestionIsNotSelection,
  refusePillarSelection,
  refuseSiloWorkingCopyWrite,
  type HumanPillarSelection,
  type SiloWorkingCopyState,
  type TerritoryGuardInput,
} from "../lib/arquiteto/silo-working-copy-record.ts";

const BRAND = "brand-1";
const NOW = "2026-09-02T12:00:00.000Z";
const TERRITORY = buildTerritoryRef("11111111-1111-4111-8111-111111111111");
const OTHER_TERRITORY = buildTerritoryRef("22222222-2222-4222-8222-222222222222");
const REF = buildSiloWorkingCopyRef(TERRITORY);
const HASH = `sha256:${"a".repeat(64)}`;

const articleRef = (articleId: string) => ({
  articleId, articleDnaVersionId: `${articleId}:v1`, articleDnaContentHash: HASH,
});

const pillarSelection = (overrides: Partial<HumanPillarSelection> = {}): HumanPillarSelection => ({
  articleId: "art-pilar",
  actorUserId: "user-1",
  decidedAt: NOW,
  reason: "Pilar escolhido após revisão da arquitetura.",
  decidedOverArticleIds: ["art-pilar", "art-s1"],
  ...overrides,
});

function workingCopy(overrides: Partial<SiloWorkingCopyState> = {}): SiloWorkingCopyState {
  return SiloWorkingCopyStateSchema.parse({
    workingCopyRef: REF,
    brandId: BRAND,
    territoryRef: TERRITORY,
    name: "Barreira cutânea",
    slug: "barreira-cutanea",
    formationStatus: "draft",
    existingSiloId: null,
    articleRefs: [articleRef("art-pilar"), articleRef("art-s1")],
    pillarSuggestionArticleId: "art-s1",
    pillarSelection: pillarSelection(),
    supportArticleIds: ["art-s1"],
    exclusions: [],
    reasons: ["Cópia de trabalho territorial."],
    conflicts: [],
    ...overrides,
  });
}

const territoryGuard = (overrides: Partial<TerritoryGuardInput> = {}): TerritoryGuardInput => ({
  found: true,
  subjectType: "territory",
  stage: "architect",
  subjectId: TERRITORY,
  sourceEntityId: TERRITORY,
  articleId: null,
  contractVersion: "territory-record-v1",
  brandId: BRAND,
  territoryRef: TERRITORY,
  lifecycleStatus: "confirmed",
  ...overrides,
});

const refuse = (overrides: Partial<Parameters<typeof refuseSiloWorkingCopyWrite>[0]> = {}) =>
  refuseSiloWorkingCopyWrite({
    brandId: BRAND,
    territoryRef: TERRITORY,
    territory: territoryGuard(),
    workingCopy: workingCopy(),
    ...overrides,
  });

// --- 1..7 - contrato da linha -----------------------------------------------

test("1 · working copy remota válida vira linha canônica", () => {
  const row = buildSiloWorkingCopyRow(workingCopy());
  assert.equal(row.subjectType, SILO_WORKING_COPY_SUBJECT_TYPE);
  assert.equal(row.stage, SILO_WORKING_COPY_STAGE);
  assert.equal(row.subjectId, REF);
  assert.equal(row.state, "draft");
  assert.equal(row.payload.contractVersion, SILO_WORKING_COPY_CONTRACT_VERSION);
  const back = parseSiloWorkingCopyRow({ ...row, payload: JSON.parse(JSON.stringify(row.payload)) }, BRAND);
  assert.equal(back.ok, true);
  assert.deepEqual(back.workingCopy, workingCopy());
});

test("2 · ref é emitido pelo servidor e DERIVADO do território", () => {
  assert.equal(buildSiloWorkingCopyRef(TERRITORY), `silo-working-copy:${TERRITORY}`);
  // Determinístico: mesma entrada, mesmo ref. É isso que faz a UNIQUE fechar a criação.
  assert.equal(buildSiloWorkingCopyRef(TERRITORY), buildSiloWorkingCopyRef(TERRITORY));
  assert.throws(() => buildSiloWorkingCopyRef("working-silo:1"));
  assert.throws(() => buildSiloWorkingCopyRef("lista-77"));
  assert.throws(() => buildSiloWorkingCopyRef("silo-1"));
  const store = readFileSync(new URL("../lib/server/arquiteto-silo-working-copy-store.ts", import.meta.url), "utf8");
  assert.match(store, /workingCopyRef: buildSiloWorkingCopyRef\(territoryRef\)/);
  assert.match(store, /brandId: context\.brandId/);
});

test("3 · o chamador não escolhe o ref", () => {
  const rota = readFileSync(new URL("../app/api/arquiteto/workspace/route.ts", import.meta.url), "utf8");
  assert.match(rota, /"workingCopyRef" in create\.workingCopy/);
  assert.match(rota, /A identidade da working copy de Silo é imutável/);
  assert.equal(/buildSiloWorkingCopyRef/.test(rota), false, "a rota não emite identidade");
  // 2C.4: o writer virou RPC. Na atualização a identidade vem do ref endereçado,
  // e o banco a rederiva do território sob lock.
  const store = readFileSync(new URL("../lib/server/arquiteto-silo-working-copy-store.ts", import.meta.url), "utf8");
  assert.match(store, /territoryRefOfWorkingCopy\(workingCopyRef\)/);
  const sql = readFileSync(new URL("../supabase/migrations/20260902150000_silo_working_copy_transactional_writers.sql", import.meta.url), "utf8");
  assert.match(sql, /IDENTITY_IS_IMMUTABLE: workingCopyRef is derived from the territory/);
});

test("4 · source_entity_id é igual ao subject_id", () => {
  const row = buildSiloWorkingCopyRow(workingCopy());
  assert.equal(row.sourceEntityId, row.subjectId);
  const divergente = parseSiloWorkingCopyRow({ ...row, sourceEntityId: "outro" }, BRAND);
  assert.equal(divergente.ok, false);
  assert.ok(divergente.issues.includes("SOURCE_ENTITY_ID_MISMATCH"));
});

test("5 · source_entity_id não é UUID cru vulnerável à purga da 0047", () => {
  const row = buildSiloWorkingCopyRow(workingCopy());
  const UUID_CRU = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  assert.equal(UUID_CRU.test(row.sourceEntityId), false);
  assert.equal(UUID_CRU.test(row.subjectId), false);
  const purga = readFileSync(new URL("../supabase/migrations/0047_global_lifecycle_delete_recovery_purge.sql", import.meta.url), "utf8");
  assert.match(purga, /workflow_item\.source_entity_id = current_keyword\.id::text/);
});

test("6 · article_id é nulo por contrato", () => {
  const row = buildSiloWorkingCopyRow(workingCopy());
  assert.equal(row.articleId, null);
  const comArtigo = parseSiloWorkingCopyRow({ ...row, articleId: "artigo-1" }, BRAND);
  assert.equal(comArtigo.ok, false);
  assert.ok(comArtigo.issues.includes("ARTICLE_ID_PRESENT"));
});

test("7 · contractVersion errado é recusado", () => {
  const row = buildSiloWorkingCopyRow(workingCopy());
  const errado = parseSiloWorkingCopyRow(
    { ...row, payload: { contractVersion: "silo-working-copy-v0", workingCopy: workingCopy() } },
    BRAND,
  );
  assert.equal(errado.ok, false);
  assert.ok(errado.issues.includes("PAYLOAD_INVALID"));
});

// --- 8..13 - guards de escrita ----------------------------------------------

test("8 · Brand divergente bloqueia", () => {
  assert.ok(refuse({ brandId: "brand-outra" }).includes("BRAND_MISMATCH"));
  const row = buildSiloWorkingCopyRow(workingCopy());
  const cruzado = parseSiloWorkingCopyRow(row, "brand-outra");
  assert.equal(cruzado.ok, false);
  assert.ok(cruzado.ok === false && cruzado.issues.includes("CROSS_BRAND_RECORD"));
});

test("9 · território divergente bloqueia", () => {
  const refusals = refuse({
    territoryRef: OTHER_TERRITORY,
    territory: territoryGuard({ subjectId: OTHER_TERRITORY, sourceEntityId: OTHER_TERRITORY, territoryRef: OTHER_TERRITORY }),
  });
  assert.ok(refusals.includes("TERRITORY_REF_MISMATCH"));
});

test("10 · território ausente bloqueia", () => {
  const refusals = refuse({ territory: territoryGuard({ found: false }) });
  assert.deepEqual(refusals, ["TERRITORY_NOT_FOUND"]);
});

test("11 · registro territorial incoerente bloqueia", () => {
  const casos: Array<Partial<TerritoryGuardInput>> = [
    { subjectType: "keyword" },
    { stage: "radar" },
    { sourceEntityId: "silo-1" },
    { articleId: "artigo-1" },
    { contractVersion: "territory-record-v0" },
    { territoryRef: OTHER_TERRITORY },
  ];
  for (const caso of casos) {
    assert.ok(
      refuse({ territory: territoryGuard(caso) }).includes("TERRITORY_RECORD_INCOHERENT"),
      JSON.stringify(caso),
    );
  }
  assert.ok(refuse({ territory: territoryGuard({ brandId: "brand-outra" }) }).includes("TERRITORY_BRAND_MISMATCH"));
});

test("12 · lock stale bloqueia a atualização", () => {
  // 2C.4: o expectedLock viaja para a RPC transacional, que o confere sob lock.
  const store = readFileSync(new URL("../lib/server/arquiteto-silo-working-copy-store.ts", import.meta.url), "utf8");
  assert.match(store, /p_working_copy_expected_lock: expectedLock/);
  const sql = readFileSync(new URL("../supabase/migrations/20260902150000_silo_working_copy_transactional_writers.sql", import.meta.url), "utf8");
  assert.match(sql, /IF existing_row\.lock_version IS DISTINCT FROM p_working_copy_expected_lock THEN/);
  assert.match(sql, /AND lock_version = p_working_copy_expected_lock/);
  // O gatilho continua sendo o único incrementador: a cláusula SET do UPDATE
  // atribui apenas state, payload e updated_by.
  const setClause = sql.slice(sql.indexOf("SET state = p_working_copy->>'formationStatus'"));
  const atribuicoes = setClause.slice(0, setClause.indexOf("WHERE"));
  assert.equal(/lock_version/.test(atribuicoes), false);
  assert.match(atribuicoes, /payload = next_payload/);
  assert.match(atribuicoes, /updated_by = p_actor_user_id/);
  const ddl = readFileSync(new URL("../supabase/migrations/0027_editorial_artifacts_workflow_serp.sql", import.meta.url), "utf8");
  assert.match(ddl, /NEW\.lock_version := OLD\.lock_version \+ 1;/);
});

test("13 · update preserva a identidade", () => {
  const store = readFileSync(new URL("../lib/server/arquiteto-silo-working-copy-store.ts", import.meta.url), "utf8");
  const update = store.slice(store.indexOf("export async function updateSiloWorkingCopy"));
  const spread = update.indexOf("...draft");
  assert.ok(spread > 0);
  // Identidade e tenant sobrescrevem o draft, depois do spread.
  assert.ok(update.indexOf("workingCopyRef,") > spread);
  assert.ok(update.indexOf("territoryRef,") > spread);
  assert.ok(update.indexOf("brandId: context.brandId") > spread);
  // E o banco reconfere: o ref precisa ser o derivado do território travado.
  const sql = readFileSync(new URL("../supabase/migrations/20260902150000_silo_working_copy_transactional_writers.sql", import.meta.url), "utf8");
  assert.match(sql, /p_working_copy->>'workingCopyRef' IS DISTINCT FROM working_copy_ref/);
});

// --- 14..18 - autoridade remota e sobrevivência ao reload -------------------

const roundTrip = (state: SiloWorkingCopyState) => {
  const row = buildSiloWorkingCopyRow(state);
  const back = parseSiloWorkingCopyRow({ ...row, payload: JSON.parse(JSON.stringify(row.payload)) }, BRAND);
  assert.equal(back.ok, true);
  return back.workingCopy!;
};

test("14 · o reload deriva a working copy do remoto", () => {
  const rota = readFileSync(new URL("../app/api/arquiteto/workspace/route.ts", import.meta.url), "utf8");
  assert.match(rota, /listSiloWorkingCopies\(context\)/);
  assert.match(rota, /siloWorkingCopies/);
  const store = readFileSync(new URL("../lib/server/arquiteto-silo-working-copy-store.ts", import.meta.url), "utf8");
  assert.match(store, /eq\("subject_type", SILO_WORKING_COPY_SUBJECT_TYPE\)/);
  assert.match(store, /eq\("marca_id", context\.brandId\)/);
});

test("15 · Pilar humano sobrevive ao round-trip", () => {
  const back = roundTrip(workingCopy());
  assert.equal(back.pillarSelection?.articleId, "art-pilar");
  assert.equal(back.pillarSelection?.actorUserId, "user-1");
  assert.equal(back.pillarSelection?.decidedAt, NOW);
  assert.ok(back.pillarSelection?.reason);
  assert.deepEqual(back.pillarSelection?.decidedOverArticleIds, ["art-pilar", "art-s1"]);
});

test("16 · Suportes sobrevivem ao round-trip", () => {
  const back = roundTrip(workingCopy({ supportArticleIds: ["art-s1", "art-s2"], articleRefs: [articleRef("art-pilar"), articleRef("art-s1"), articleRef("art-s2")] }));
  assert.deepEqual(back.supportArticleIds, ["art-s1", "art-s2"]);
});

test("17 · exclusões sobrevivem ao round-trip, com a decisão inteira", () => {
  const back = roundTrip(workingCopy({
    exclusions: [{ articleId: "art-fora", actorUserId: "user-2", decidedAt: NOW, reason: "Fora da fronteira." }],
  }));
  assert.deepEqual(back.exclusions, [{ articleId: "art-fora", actorUserId: "user-2", decidedAt: NOW, reason: "Fora da fronteira." }]);
  // Exclusão sem decisão completa nem entra no contrato.
  assert.equal(SiloWorkingCopyStateSchema.safeParse({ ...workingCopy(), exclusions: [{ articleId: "x" }] }).success, false);
});

test("18 · criação lógica duplicada não gera segunda working copy", () => {
  const ddl = readFileSync(new URL("../supabase/migrations/0027_editorial_artifacts_workflow_serp.sql", import.meta.url), "utf8");
  assert.match(ddl, /UNIQUE \(marca_id, subject_type, subject_id, stage\)/);
  // subject_id é o ref emitido pelo servidor; a UNIQUE fecha a identidade por Brand.
  const row = buildSiloWorkingCopyRow(workingCopy());
  assert.equal(row.subjectId, workingCopy().workingCopyRef);
  assert.equal(row.stage, SILO_WORKING_COPY_STAGE);
  const store = readFileSync(new URL("../lib/server/arquiteto-silo-working-copy-store.ts", import.meta.url), "utf8");
  assert.equal(/CREATE INDEX|ALTER TABLE/.test(store), false);
});

// --- 19..21 - lifecycle territorial e autoridade ----------------------------

test("19 · território consolidated bloqueia edição: working copy já consumida", () => {
  const refusals = refuse({ territory: territoryGuard({ lifecycleStatus: "consolidated" }) });
  assert.ok(refusals.includes("WORKING_COPY_ALREADY_CONSUMED"));
  assert.equal(refusals.includes("TERRITORY_NOT_EDITABLE"), false, "consumida é motivo próprio");
});

test("20 · rejected, superseded e archived bloqueiam a edição", () => {
  for (const lifecycleStatus of ["rejected", "superseded", "archived"]) {
    const refusals = refuse({ territory: territoryGuard({ lifecycleStatus }) });
    assert.ok(refusals.includes("TERRITORY_NOT_EDITABLE"), lifecycleStatus);
  }
  // candidate e confirmed continuam editáveis.
  for (const lifecycleStatus of ["candidate", "confirmed"]) {
    assert.deepEqual(refuse({ territory: territoryGuard({ lifecycleStatus }) }), [], lifecycleStatus);
  }
});

test("21 · React e recuperação local não são autoridade", () => {
  const store = readFileSync(new URL("../lib/server/arquiteto-silo-working-copy-store.ts", import.meta.url), "utf8");
  assert.doesNotMatch(store, /localStorage|indexedDB|sessionStorage/i);
  const record = readFileSync(new URL("../lib/arquiteto/silo-working-copy-record.ts", import.meta.url), "utf8");
  assert.doesNotMatch(record, /localStorage|indexedDB|sessionStorage/i);
  // A recuperação local existente continua sendo recuperação, e não é lida aqui.
  assert.equal(/architect-recovery/.test(store), false);
});

// --- 22..24 - identidades que não são identidade ----------------------------

test("22 · lista_id não é identidade de working copy", () => {
  assert.equal(isSiloWorkingCopyRef("lista-77"), false);
  assert.throws(() => buildSiloWorkingCopyRef("lista-77"));
  const record = readFileSync(new URL("../lib/arquiteto/silo-working-copy-record.ts", import.meta.url), "utf8");
  const executavel = record.split("\n").filter(line => {
    const t = line.trim();
    return !t.startsWith("*") && !t.startsWith("/*") && !t.startsWith("//");
  }).join("\n");
  assert.equal(/lista_id/.test(executavel), false);
});

test("23 · slug e nome não são identidade", () => {
  assert.equal(isSiloWorkingCopyRef("barreira-cutanea"), false);
  const state = workingCopy({ slug: "barreira-cutanea", name: "Barreira cutânea" });
  assert.notEqual(state.workingCopyRef, state.slug);
  assert.notEqual(state.workingCopyRef, state.name);
  const row = buildSiloWorkingCopyRow(state);
  assert.notEqual(row.subjectId, state.slug);
});

test("24 · working article id não é referência final", () => {
  const comWorking = SiloWorkingCopyStateSchema.safeParse({
    ...workingCopy(),
    articleRefs: [{ articleId: "art-pilar", workingArticleId: "working-article:abc" }],
  });
  assert.equal(comWorking.success, false, "referência precisa ser versionada");
  // O contrato exige os dois campos de versão; sem eles não parseia.
  assert.equal(
    SiloWorkingCopyStateSchema.safeParse({ ...workingCopy(), articleRefs: [{ articleId: "art-pilar" }] }).success,
    false,
  );
  // O termo só aparece na prosa que explica a recusa, nunca no código executável.
  const record = readFileSync(new URL("../lib/arquiteto/silo-working-copy-record.ts", import.meta.url), "utf8");
  const executavel = record.split("\n").filter(line => {
    const t = line.trim();
    return !t.startsWith("*") && !t.startsWith("/*") && !t.startsWith("//");
  }).join("\n");
  assert.equal(/workingArticleId/.test(executavel), false);
});

// --- 25..28 - Pilar automático removido -------------------------------------

test("25 · a divisão proposta pela IA não escolhe Pilar por selectedIds[0]", () => {
  const modulo = readFileSync(new URL("../lib/arquiteto/silo-consolidation.ts", import.meta.url), "utf8");
  assert.equal(/pillarCandidateArticleId: selectedIds\[0\]/.test(modulo), false);
  assert.match(modulo, /pillarCandidateArticleId: null/);
  assert.match(modulo, /a escolha do Pilar é humana/);
});

test("26 · a sugestão automática nunca vira Pilar", () => {
  const semDecisao = workingCopy({ pillarSuggestionArticleId: "art-s1", pillarSelection: null });
  assert.equal(pillarSuggestionIsNotSelection(semDecisao), null, "sugestão não é seleção");
  const comDecisao = workingCopy({ pillarSuggestionArticleId: "art-s1" });
  assert.equal(pillarSuggestionIsNotSelection(comDecisao), "art-pilar");
  // A sugestão e a seleção são campos distintos e podem discordar.
  assert.notEqual(comDecisao.pillarSuggestionArticleId, comDecisao.pillarSelection?.articleId);
});

test("27 · decisão humana de Pilar passa", () => {
  const refusals = refusePillarSelection({
    selection: pillarSelection(), actor: "human", currentArticleIds: ["art-pilar", "art-s1"],
  });
  assert.deepEqual(refusals, []);
});

test("28 · decisão não humana e decisão obsoleta são recusadas", () => {
  for (const actor of ["ai", "logic", "serp", "system"] as const) {
    const refusals = refusePillarSelection({
      selection: pillarSelection(), actor, currentArticleIds: ["art-pilar", "art-s1"],
    });
    assert.deepEqual(refusals, ["PILLAR_NOT_HUMAN_DECIDED"], actor);
  }
  // Composição mudou depois da decisão: precisa de decisão nova.
  const mudou = refusePillarSelection({
    selection: pillarSelection(), actor: "human", currentArticleIds: ["art-pilar", "art-s1", "art-s2"],
  });
  assert.deepEqual(mudou, ["PILLAR_DECISION_STALE"]);
  // Pilar que saiu da composição também invalida.
  const fora = refusePillarSelection({
    selection: pillarSelection(), actor: "human", currentArticleIds: ["art-s1"],
  });
  assert.deepEqual(fora, ["PILLAR_DECISION_STALE"]);
});

// --- 29..30 - providers e integração prematura ------------------------------

test("29 · zero providers e zero rede no contrato de domínio", () => {
  const record = readFileSync(new URL("../lib/arquiteto/silo-working-copy-record.ts", import.meta.url), "utf8");
  assert.doesNotMatch(record, /fetch\(|supabase|dataforseo|deepseek|google-ads|openai|anthropic/i);
  assert.doesNotMatch(record, /CREATE TABLE|ALTER TABLE|CREATE INDEX|migration/i);
});

test("30 · a RPC de consolidação da 2C.1 não foi integrada", () => {
  const alvos = [
    "../lib/server/arquiteto-silo-working-copy-store.ts",
    "../app/api/arquiteto/workspace/route.ts",
    "../lib/arquiteto/silo-working-copy-record.ts",
  ];
  for (const alvo of alvos) {
    const source = readFileSync(new URL(alvo, import.meta.url), "utf8");
    assert.equal(
      /persist_silo_pair_and_consolidate_territory_atomic/.test(source),
      false,
      `${alvo} não pode chamar a RPC de consolidação nesta fase`,
    );
    assert.equal(/persist_silo_pair_atomic/.test(source), false, alvo);
  }
});

// ===========================================================================
// 2C.3A — IDENTIDADE DERIVADA E IDEMPOTÊNCIA LÓGICA DA CRIAÇÃO
// ===========================================================================

test("31 · duas criações sequenciais para o mesmo território dão o MESMO ref", () => {
  const primeiro = buildSiloWorkingCopyRef(TERRITORY);
  const segundo = buildSiloWorkingCopyRef(TERRITORY);
  assert.equal(primeiro, segundo);
  // E a mesma linha lógica: mesmo subject_id, mesmo subject_type, mesmo stage.
  const rowA = buildSiloWorkingCopyRow(workingCopy());
  const rowB = buildSiloWorkingCopyRow(workingCopy({ name: "Outro nome", slug: "outro-slug" }));
  assert.equal(rowA.subjectId, rowB.subjectId);
  assert.equal(rowA.stage, rowB.stage);
  assert.equal(rowA.subjectType, rowB.subjectType);
});

test("32 · retry após resposta perdida não muda o ref", () => {
  // O retry reenvia o mesmo território; o ref não depende de relógio, aleatório
  // nem estado anterior.
  const refs = Array.from({ length: 5 }, () => buildSiloWorkingCopyRef(TERRITORY));
  assert.equal(new Set(refs).size, 1);
  const record = readFileSync(new URL("../lib/arquiteto/silo-working-copy-record.ts", import.meta.url), "utf8");
  const executavel = record.split("\n").filter(line => {
    const t = line.trim();
    return !t.startsWith("*") && !t.startsWith("/*") && !t.startsWith("//");
  }).join("\n");
  assert.equal(/randomUUID|Date\.now|Math\.random/.test(executavel), false, "identidade não pode ser aleatória nem temporal");
});

test("33 · duas criações concorrentes derivam o mesmo ref e colidem na UNIQUE", () => {
  const concorrentes = [workingCopy(), workingCopy({ formationStatus: "ready_for_review" })]
    .map(state => buildSiloWorkingCopyRow(state));
  assert.equal(concorrentes[0].subjectId, concorrentes[1].subjectId);

  // A UNIQUE que recebe a colisão é a que já existe no schema.
  const ddl = readFileSync(new URL("../supabase/migrations/0027_editorial_artifacts_workflow_serp.sql", import.meta.url), "utf8");
  assert.match(ddl, /CONSTRAINT editorial_workflow_items_subject_stage_unique\s*\n\s*UNIQUE \(marca_id, subject_type, subject_id, stage\)/);

  // 2C.4: a serialização ficou MAIS forte que a UNIQUE. As duas criações travam
  // o MESMO Território antes de tocar a working copy, então uma espera a outra
  // em vez de colidir. A UNIQUE permanece como defesa adicional.
  const sql = readFileSync(new URL("../supabase/migrations/20260902150000_silo_working_copy_transactional_writers.sql", import.meta.url), "utf8");
  assert.match(sql, /WHERE id = p_territory_workflow_item_id[\s\S]{0,120}FOR UPDATE/);
  // Sem índice novo e sem upsert que pudesse sobrescrever payload.
  const store = readFileSync(new URL("../lib/server/arquiteto-silo-working-copy-store.ts", import.meta.url), "utf8");
  assert.equal(/CREATE INDEX|CREATE UNIQUE|\.upsert\(/.test(store + sql), false);
});

test("34 · criação sobre working copy existente vira replay, sem sobrescrever", () => {
  // 2C.4: o SELECT-antes-do-INSERT mudou de lugar. Agora acontece DENTRO da
  // transação da RPC, sob o lock do Território e da própria working copy — antes
  // era uma requisição PostgREST separada, com janela entre ler e inserir.
  const sql = readFileSync(new URL("../supabase/migrations/20260902150000_silo_working_copy_transactional_writers.sql", import.meta.url), "utf8");
  const writer = sql.slice(sql.indexOf("CREATE FUNCTION public.persist_silo_working_copy_atomic"));
  const corpo = writer.slice(0, writer.indexOf("$function$;"));
  const select = corpo.indexOf("SELECT * INTO existing_row");
  const insert = corpo.indexOf("INSERT INTO public.editorial_workflow_items");
  assert.ok(select > 0 && insert > select, "o SELECT precisa vir antes do INSERT");
  assert.match(corpo, /SELECT \* INTO existing_row[\s\S]{0,280}FOR UPDATE/);
  assert.match(corpo, /'outcome', 'idempotent_replay'/);
  // Estado material diferente é conflito, não update disfarçado.
  assert.match(corpo, /WORKING_COPY_ALREADY_EXISTS/);
  const store = readFileSync(new URL("../lib/server/arquiteto-silo-working-copy-store.ts", import.meta.url), "utf8");
  assert.match(store, /idempotentReplay: data\?\.idempotentReplay === true/);
});

test("35 · erro sem código de domínio propaga, e não vira replay nem conflito", () => {
  // 2C.4: com o writer dentro da RPC, a distinção deixou de depender de SQLSTATE
  // e nome de constraint — cada recusa tem código próprio na mensagem. Erro que
  // não traz código nenhum é falha real e propaga como tal.
  const store = readFileSync(new URL("../lib/server/arquiteto-silo-working-copy-store.ts", import.meta.url), "utf8");
  assert.match(store, /function rpcFailure/);
  assert.match(store, /throw pipelineErrorFromSupabase\(error\)/);
  assert.equal(readRpcDomainError({ message: "connection reset by peer" }), null);
  assert.equal(readRpcDomainError({ message: "WORKING_COPY_ALREADY_EXISTS: outra" }), "WORKING_COPY_ALREADY_EXISTS");
  // Nenhum código colapsa em falha genérica de persistência.
  assert.equal(SILO_WORKING_COPY_RPC_ERRORS.includes("PERSISTENCE_FAILED" as never), false);
});

test("36 · o chamador não fornece o ref, nem na criação nem na atualização", () => {
  const rota = readFileSync(new URL("../app/api/arquiteto/workspace/route.ts", import.meta.url), "utf8");
  assert.match(rota, /"workingCopyRef" in create\.workingCopy/);
  const store = readFileSync(new URL("../lib/server/arquiteto-silo-working-copy-store.ts", import.meta.url), "utf8");
  const create = store.slice(store.indexOf("export async function createSiloWorkingCopy"), store.indexOf("export async function updateSiloWorkingCopy"));
  const spread = create.indexOf("...draft");
  assert.ok(spread > 0);
  assert.ok(create.indexOf("workingCopyRef: buildSiloWorkingCopyRef(territoryRef)") > spread, "o servidor sobrescreve o draft");
});

test("37 · outro território dá outro ref", () => {
  assert.notEqual(buildSiloWorkingCopyRef(TERRITORY), buildSiloWorkingCopyRef(OTHER_TERRITORY));
  assert.equal(territoryRefOfWorkingCopy(buildSiloWorkingCopyRef(OTHER_TERRITORY)), OTHER_TERRITORY);
});

test("38 · workingCopyRef do payload divergente do subject_id é incoerente", () => {
  const row = buildSiloWorkingCopyRow(workingCopy());
  const outro = buildSiloWorkingCopyRef(OTHER_TERRITORY);
  const divergente = parseSiloWorkingCopyRow(
    { ...row, payload: { ...row.payload, workingCopyRef: outro } },
    BRAND,
  );
  assert.equal(divergente.ok, false);
  assert.ok(divergente.ok === false && divergente.issues.includes("SUBJECT_ID_DOES_NOT_MATCH_PAYLOAD"));
});

test("39 · source_entity_id divergente do ref é incoerente", () => {
  const row = buildSiloWorkingCopyRow(workingCopy());
  const divergente = parseSiloWorkingCopyRow({ ...row, sourceEntityId: buildSiloWorkingCopyRef(OTHER_TERRITORY) }, BRAND);
  assert.equal(divergente.ok, false);
  assert.ok(divergente.ok === false && divergente.issues.includes("SOURCE_ENTITY_ID_MISMATCH"));
});

test("40 · SiloWorkingCopy.id legado pode diferir do ref: são conceitos distintos", () => {
  // O contrato remoto não carrega o id legado, e nada exige que coincidam.
  const state = workingCopy();
  assert.equal("id" in state, false, "o id legado não migra para o contrato remoto");
  assert.notEqual(state.workingCopyRef, state.territoryRef);
  assert.notEqual(state.workingCopyRef, "working-silo:1");
  assert.notEqual(state.workingCopyRef, state.existingSiloId);
  // Derivado não é sinônimo: o ref contém o território, mas não É o território.
  assert.equal(isSiloWorkingCopyRef(TERRITORY), false);
  assert.equal(territoryRefOfWorkingCopy(TERRITORY), null);
});

test("41 · o territoryRef determina exatamente o ref esperado", () => {
  const row = buildSiloWorkingCopyRow(workingCopy());
  assert.equal(row.subjectId, buildSiloWorkingCopyRef(workingCopy().territoryRef));
  // Payload cujo território não gera aquele subject_id é recusado.
  const incoerente = parseSiloWorkingCopyRow(
    {
      ...row,
      payload: {
        ...row.payload,
        workingCopy: { ...workingCopy(), territoryRef: OTHER_TERRITORY },
      },
    },
    BRAND,
  );
  assert.equal(incoerente.ok, false);
  assert.ok(incoerente.ok === false && incoerente.issues.includes("REF_NOT_DERIVED_FROM_TERRITORY"));
  // E buildSiloWorkingCopyRow recusa montar linha com ref que não deriva.
  assert.throws(() => buildSiloWorkingCopyRow({ ...workingCopy(), territoryRef: OTHER_TERRITORY }));
});

test("42 · o ref derivado continua namespaced contra a purga da 0047", () => {
  const row = buildSiloWorkingCopyRow(workingCopy());
  const UUID_CRU = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  assert.equal(UUID_CRU.test(row.sourceEntityId), false);
  assert.match(row.sourceEntityId, /^silo-working-copy:territory:/);
  // Comprimento cabe: as colunas são text sem máximo.
  assert.equal(row.sourceEntityId.length, 64);
  const ddl = readFileSync(new URL("../supabase/migrations/0027_editorial_artifacts_workflow_serp.sql", import.meta.url), "utf8");
  assert.match(ddl, /subject_id text NOT NULL CHECK \(char_length\(btrim\(subject_id\)\) > 0\)/);
  assert.match(ddl, /source_entity_id text NOT NULL CHECK \(char_length\(btrim\(source_entity_id\)\) > 0\)/);
});
