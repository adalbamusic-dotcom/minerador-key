import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { buildTerritoryRef } from "../lib/arquiteto/territory.ts";
import { SiloDNASchema, SiloPageSchema } from "../lib/arquiteto/contracts.ts";
import {
  SiloWorkingCopyStateSchema,
  buildSiloWorkingCopyRef,
  type SiloWorkingCopyState,
} from "../lib/arquiteto/silo-working-copy-record.ts";
import {
  CANONICAL_LOCK_ORDER,
  lockOrderIsCanonical,
  refuseConsolidationProvenance,
  refuseConsolidationReplayProvenance,
  resolveWorkingCopyCreateOutcome,
  workingCopyMaterialFingerprint,
  type LockedWorkingCopy,
} from "../lib/arquiteto/silo-consolidation-provenance.ts";

const BRAND = "brand-1";
const NOW = "2026-09-02T12:00:00.000Z";
const TERRITORY = buildTerritoryRef("11111111-1111-4111-8111-111111111111");
const OTHER_TERRITORY = buildTerritoryRef("22222222-2222-4222-8222-222222222222");
const WC_REF = buildSiloWorkingCopyRef(TERRITORY);
const HASH = `sha256:${"a".repeat(64)}`;

const MIGRATION = new URL(
  "../supabase/migrations/20260902150000_silo_working_copy_transactional_writers.sql",
  import.meta.url,
);

const siloDna = (overrides: Record<string, unknown> = {}) => ({
  schemaVersion: 1, formationStatus: "formed", siloId: "silo-1", brandId: BRAND,
  centralEntity: "e", objective: "o", audience: "a", macroProblem: "m", dominantIntent: "d",
  pillarArticleId: "art-pilar", supportArticleIds: ["art-s1"],
  articleReferences: [
    { articleId: "art-pilar", articleDnaVersionId: "art-pilar:v1", articleDnaContentHash: HASH, role: "Pilar" },
    { articleId: "art-s1", articleDnaVersionId: "art-s1:v1", articleDnaContentHash: HASH, role: "Suporte" },
  ],
  articleRoles: [], narrativeOrder: [], linkMap: [], boundary: "b",
  includedTopics: [], excludedTopics: [], nearbySiloIds: [], possibleConflicts: [],
  gaps: [], nextContents: [], confidence: 1, humanPendingDecisions: [],
  ...overrides,
});

const lockedWorkingCopy = (overrides: Partial<LockedWorkingCopy> = {}): LockedWorkingCopy => ({
  subjectId: WC_REF,
  lockVersion: 3,
  territoryRef: TERRITORY,
  brandId: BRAND,
  ...overrides,
});

function workingCopyState(overrides: Partial<SiloWorkingCopyState> = {}): SiloWorkingCopyState {
  return SiloWorkingCopyStateSchema.parse({
    workingCopyRef: WC_REF,
    brandId: BRAND,
    territoryRef: TERRITORY,
    name: "Barreira cutânea",
    slug: "barreira-cutanea",
    formationStatus: "draft",
    existingSiloId: null,
    articleRefs: [{ articleId: "art-pilar", articleDnaVersionId: "art-pilar:v1", articleDnaContentHash: HASH }],
    pillarSuggestionArticleId: null,
    pillarSelection: null,
    supportArticleIds: [],
    exclusions: [],
    reasons: ["Cópia de trabalho territorial."],
    conflicts: [],
    ...overrides,
  });
}

// --- 1..7 - proveniência no contrato do SiloDNA -----------------------------

test("1 · SiloDNA legado sem os dois campos de proveniência passa", () => {
  const legado = SiloDNASchema.safeParse(siloDna());
  assert.equal(legado.success, true);
  assert.equal(legado.success && legado.data.workingCopyRef, undefined);
  assert.equal(legado.success && legado.data.workingCopyLockVersion, undefined);
});

test("2 · apenas workingCopyRef é recusado", () => {
  const meio = SiloDNASchema.safeParse(siloDna({ workingCopyRef: WC_REF }));
  assert.equal(meio.success, false);
  assert.ok(
    (meio as { error: { issues: Array<{ message: string }> } }).error.issues
      .some(issue => issue.message.includes("existir juntos ou faltar juntos")),
  );
});

test("3 · apenas workingCopyLockVersion é recusado", () => {
  const meio = SiloDNASchema.safeParse(siloDna({ workingCopyLockVersion: 3 }));
  assert.equal(meio.success, false);
  assert.ok(
    (meio as { error: { issues: Array<{ message: string }> } }).error.issues
      .some(issue => issue.message.includes("existir juntos ou faltar juntos")),
  );
});

test("4 · par completo passa", () => {
  const completo = SiloDNASchema.safeParse(siloDna({ workingCopyRef: WC_REF, workingCopyLockVersion: 3 }));
  assert.equal(completo.success, true);
  assert.equal(completo.success && completo.data.workingCopyRef, WC_REF);
  assert.equal(completo.success && completo.data.workingCopyLockVersion, 3);
});

test("5 · lockVersion não positivo é recusado", () => {
  for (const value of [0, -1, 1.5]) {
    const invalido = SiloDNASchema.safeParse(siloDna({ workingCopyRef: WC_REF, workingCopyLockVersion: value }));
    assert.equal(invalido.success, false, String(value));
  }
  // E o ref precisa ser o ref canônico da working copy.
  assert.equal(
    SiloDNASchema.safeParse(siloDna({ workingCopyRef: TERRITORY, workingCopyLockVersion: 1 })).success,
    false,
    "territoryRef puro não é workingCopyRef",
  );
});

test("6 · novo Silo-first sem proveniência é bloqueado no gate", () => {
  const refusals = refuseConsolidationProvenance({
    workingCopy: lockedWorkingCopy(),
    territoryRef: TERRITORY,
    expectedLock: 3,
    declaredWorkingCopyRef: undefined,
    declaredWorkingCopyLockVersion: undefined,
  });
  assert.deepEqual(refusals, ["PROVENANCE_MISSING"]);
  // Meia proveniência também.
  assert.deepEqual(
    refuseConsolidationProvenance({
      workingCopy: lockedWorkingCopy(), territoryRef: TERRITORY, expectedLock: 3,
      declaredWorkingCopyRef: WC_REF, declaredWorkingCopyLockVersion: undefined,
    }),
    ["PROVENANCE_MISSING"],
  );
});

test("7 · SiloPage não duplica a proveniência", () => {
  const page = {
    schemaVersion: 1, formationStatus: "formed", siloPageId: "silo-page:silo-1", brandId: BRAND,
    siloDnaRef: { entityId: "silo-1", versionId: "silo-1:v1", contentHash: HASH },
    siloId: "silo-1", slug: "/barreira", publicationStatus: "new",
    h1: "h", seoTitle: "s", metaDescription: "m", canonical: null, intro: "i",
    sections: [], cta: "c", coverImageBrief: "cb", visualBriefing: "vb", breadcrumbs: [],
    pillarArticleId: "art-pilar", supportArticleIds: ["art-s1"], indexationStatus: "index",
    alerts: [], confidence: 1, humanPendingDecisions: [],
  };
  assert.equal(SiloPageSchema.safeParse(page).success, true);
  // .strict(): declarar proveniência na SiloPage é recusado.
  assert.equal(SiloPageSchema.safeParse({ ...page, workingCopyRef: WC_REF }).success, false);
  assert.equal(SiloPageSchema.safeParse({ ...page, workingCopyLockVersion: 3 }).success, false);
});

// --- 8..11 - guards de consolidação (comportamentais, no espelho de domínio) -

test("8 · working copy obsoleta bloqueia a consolidação", () => {
  const refusals = refuseConsolidationProvenance({
    workingCopy: lockedWorkingCopy({ lockVersion: 4 }),
    territoryRef: TERRITORY,
    expectedLock: 3,
    declaredWorkingCopyRef: WC_REF,
    declaredWorkingCopyLockVersion: 3,
  });
  assert.deepEqual(refusals, ["STALE_WORKING_COPY"]);
});

test("9 · proveniência com ref divergente é recusada", () => {
  const refusals = refuseConsolidationProvenance({
    workingCopy: lockedWorkingCopy(),
    territoryRef: TERRITORY,
    expectedLock: 3,
    declaredWorkingCopyRef: buildSiloWorkingCopyRef(OTHER_TERRITORY),
    declaredWorkingCopyLockVersion: 3,
  });
  assert.deepEqual(refusals, ["PROVENANCE_MISMATCH"]);
});

test("10 · proveniência com lock divergente é recusada", () => {
  const refusals = refuseConsolidationProvenance({
    workingCopy: lockedWorkingCopy(),
    territoryRef: TERRITORY,
    expectedLock: 3,
    declaredWorkingCopyRef: WC_REF,
    declaredWorkingCopyLockVersion: 2,
  });
  assert.deepEqual(refusals, ["PROVENANCE_MISMATCH"]);

  // Caminho feliz: tudo confere.
  assert.deepEqual(
    refuseConsolidationProvenance({
      workingCopy: lockedWorkingCopy(), territoryRef: TERRITORY, expectedLock: 3,
      declaredWorkingCopyRef: WC_REF, declaredWorkingCopyLockVersion: 3,
    }),
    [],
  );
});

test("11 · o replay não usa expectedLock como gate, mas exige a igualdade de três pontas", () => {
  // REQUEST = PERSISTIDO = WC TRAVADA → replay permitido.
  assert.deepEqual(
    refuseConsolidationReplayProvenance({
      workingCopy: lockedWorkingCopy({ lockVersion: 7 }),
      territoryRef: TERRITORY,
      persistedWorkingCopyRef: WC_REF,
      persistedWorkingCopyLockVersion: 7,
      declaredWorkingCopyRef: WC_REF,
      declaredWorkingCopyLockVersion: 7,
    }),
    [],
  );

  // O caso do §4: persistido 7, request 7, mas a WC histórica avançou para 8.
  // A working copy mudou depois da consolidação — não é "o mesmo".
  assert.deepEqual(
    refuseConsolidationReplayProvenance({
      workingCopy: lockedWorkingCopy({ lockVersion: 8 }),
      territoryRef: TERRITORY,
      persistedWorkingCopyRef: WC_REF,
      persistedWorkingCopyLockVersion: 7,
      declaredWorkingCopyRef: WC_REF,
      declaredWorkingCopyLockVersion: 7,
    }),
    ["PROVENANCE_MISMATCH"],
    "replay sobre working copy alterada precisa ser bloqueado",
  );

  // Request divergindo do persistido também é conflito.
  assert.deepEqual(
    refuseConsolidationReplayProvenance({
      workingCopy: lockedWorkingCopy({ lockVersion: 7 }), territoryRef: TERRITORY,
      persistedWorkingCopyRef: WC_REF, persistedWorkingCopyLockVersion: 7,
      declaredWorkingCopyRef: WC_REF, declaredWorkingCopyLockVersion: 6,
    }),
    ["PROVENANCE_MISMATCH"],
  );

  // Proveniência de outra working copy continua sendo conflito.
  assert.deepEqual(
    refuseConsolidationReplayProvenance({
      workingCopy: lockedWorkingCopy(), territoryRef: TERRITORY,
      persistedWorkingCopyRef: buildSiloWorkingCopyRef(OTHER_TERRITORY),
      persistedWorkingCopyLockVersion: 3,
    }),
    ["PROVENANCE_MISMATCH"],
  );

  // Proveniência persistida ausente ou inválida não serve de prova.
  for (const invalido of [
    { persistedWorkingCopyRef: undefined, persistedWorkingCopyLockVersion: undefined },
    { persistedWorkingCopyRef: WC_REF, persistedWorkingCopyLockVersion: 0 },
    { persistedWorkingCopyRef: WC_REF, persistedWorkingCopyLockVersion: -1 },
  ]) {
    assert.deepEqual(
      refuseConsolidationReplayProvenance({
        workingCopy: lockedWorkingCopy(), territoryRef: TERRITORY, ...invalido,
      }),
      ["PROVENANCE_MISSING"],
      JSON.stringify(invalido),
    );
  }
});

// --- 12..14 - create e update da working copy -------------------------------

test("12 · create idêntico é replay, sem escrita", () => {
  const existing = workingCopyState();
  assert.equal(resolveWorkingCopyCreateOutcome({ existing, requested: workingCopyState() }), "idempotent_replay");
  // A ordem dos arrays não muda o material.
  const reordenado = workingCopyState({ supportArticleIds: [] });
  assert.equal(workingCopyMaterialFingerprint(existing), workingCopyMaterialFingerprint(reordenado));
});

test("13 · create materialmente diferente é conflito, e nunca vira update", () => {
  const existing = workingCopyState();
  for (const diferente of [
    workingCopyState({ name: "Outro nome" }),
    workingCopyState({ slug: "outro-slug" }),
    workingCopyState({ formationStatus: "ready_for_review" }),
    workingCopyState({ supportArticleIds: ["art-s1"] }),
    workingCopyState({ pillarSuggestionArticleId: "art-pilar" }),
    workingCopyState({
      pillarSelection: {
        articleId: "art-pilar", actorUserId: "user-1", decidedAt: NOW,
        reason: "Escolha humana.", decidedOverArticleIds: ["art-pilar"],
      },
    }),
    workingCopyState({
      exclusions: [{ articleId: "art-x", actorUserId: "user-1", decidedAt: NOW, reason: "Fora." }],
    }),
  ]) {
    assert.equal(
      resolveWorkingCopyCreateOutcome({ existing, requested: diferente }),
      "create_conflict",
      JSON.stringify({ name: diferente.name, status: diferente.formationStatus }),
    );
  }
  // Sem linha existente: insere.
  assert.equal(resolveWorkingCopyCreateOutcome({ existing: null, requested: workingCopyState() }), "insert");
});

test("14 · a ordem global de locks é respeitada pelos dois writers", () => {
  assert.deepEqual(CANONICAL_LOCK_ORDER, ["territory", "silo_working_copy", "silo_advisory", "artifacts"]);
  assert.equal(lockOrderIsCanonical(["territory", "silo_working_copy"]), true);
  assert.equal(lockOrderIsCanonical(["territory", "silo_working_copy", "silo_advisory", "artifacts"]), true);
  // Inverter é o que produz deadlock.
  assert.equal(lockOrderIsCanonical(["silo_working_copy", "territory"]), false);
  assert.equal(lockOrderIsCanonical(["artifacts", "territory"]), false);
  assert.equal(lockOrderIsCanonical(["territory", "territory"]), false);
});

// --- 15..18 - espelho do SQL e limites do que foi provado -------------------

test("15 · o SQL espelha a ordem de locks do desenho", () => {
  // ATENÇÃO: esta asserção é ESTÁTICA. Ela prova que o SQL foi escrito na ordem
  // desenhada, NÃO que o PostgreSQL se comporta assim. O comportamento só é
  // provado por smoke contra o banco, ainda pendente.
  const sql = readFileSync(MIGRATION, "utf8");
  for (const fn of ["persist_silo_working_copy_atomic", "persist_silo_from_working_copy_atomic"]) {
    const body = sql.slice(sql.indexOf(`CREATE FUNCTION public.${fn}`));
    const corpo = body.slice(0, body.indexOf("$function$;"));
    const territoryLock = corpo.indexOf("WHERE id = p_territory_workflow_item_id");
    const wcLock = corpo.indexOf("AND subject_type = 'silo_working_copy'");
    assert.ok(territoryLock > 0, `${fn}: falta o lock do território`);
    assert.ok(wcLock > territoryLock, `${fn}: a WC não pode ser travada antes do território`);
  }
});

test("16 · o SQL compõe a 2C.1 e não copia o corpo dela", () => {
  const sql = readFileSync(MIGRATION, "utf8");
  const executavel = sql.split("\n").filter(line => !line.trim().startsWith("--")).join("\n");
  assert.equal(
    (executavel.match(/inner_result := public\.persist_silo_pair_and_consolidate_territory_atomic\(/g) || []).length,
    2,
    "uma chamada no replay e uma na primeira consolidação",
  );
  // Nada do corpo da primitiva foi copiado.
  assert.equal(/pg_advisory_xact_lock|INSERT INTO public\.editorial_artifact_versions/.test(executavel), false);
});

test("17 · a consolidação não fencea a working copy", () => {
  const sql = readFileSync(MIGRATION, "utf8");
  const body = sql.slice(sql.indexOf("CREATE FUNCTION public.persist_silo_from_working_copy_atomic"));
  const corpo = body.slice(0, body.indexOf("$function$;"));
  // Nenhuma escrita na tabela de workflow dentro do entrypoint de consolidação.
  assert.equal(/UPDATE public\.editorial_workflow_items|INSERT INTO public\.editorial_workflow_items/.test(corpo), false);
  assert.equal(/consumed/.test(corpo), false, "sem lifecycle paralelo");
  // E o ramo de replay vem antes da checagem do lock da WC.
  const replay = corpo.indexOf("IF lifecycle = 'consolidated' THEN");
  const lockCheck = corpo.indexOf("STALE_WORKING_COPY");
  assert.ok(replay > 0 && lockCheck > replay, "replay precisa preceder o gate de lock");

  // O SQL espelha a igualdade de três pontas do replay (asserção ESTÁTICA).
  assert.match(corpo, /persisted_lock IS DISTINCT FROM declared_lock/);
  assert.match(corpo, /persisted_lock IS DISTINCT FROM wc_row\.lock_version/);
  // E o expectedLock continua fora do gate de replay — só nas linhas EXECUTÁVEIS,
  // porque o comentário que explica a ausência cita o próprio nome.
  const replayBlock = corpo.slice(replay, corpo.indexOf("4. primeira consolidacao"));
  const replayExecutavel = replayBlock.split("\n").filter(line => !line.trim().startsWith("--")).join("\n");
  assert.equal(/p_working_copy_expected_lock/.test(replayExecutavel), false);
});

test("18 · zero provider, zero storage DDL, e nenhum smoke foi executado", () => {
  const sql = readFileSync(MIGRATION, "utf8");
  const executavel = sql.split("\n").filter(line => !line.trim().startsWith("--")).join("\n");
  assert.equal(/ALTER TABLE|CREATE TABLE|CREATE INDEX|CREATE TRIGGER/.test(executavel), false);
  assert.equal(/CREATE OR REPLACE/.test(executavel), false, "não sobrescreve função existente");
  assert.equal((executavel.match(/^CREATE FUNCTION/gm) || []).length, 2);
  assert.equal(/EXCEPTION WHEN/.test(executavel), false, "handler quebraria a atomicidade da composição");

  const dominio = readFileSync(new URL("../lib/arquiteto/silo-consolidation-provenance.ts", import.meta.url), "utf8");
  assert.doesNotMatch(dominio, /fetch\(|supabase|dataforseo|deepseek|google-ads|openai|anthropic|\.rpc\(/i);
});
