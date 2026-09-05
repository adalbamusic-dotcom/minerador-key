import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { buildTerritoryRef } from "../lib/arquiteto/territory.ts";
import {
  SiloWorkingCopyStateSchema,
  buildSiloWorkingCopyRef,
  type SiloWorkingCopyState,
} from "../lib/arquiteto/silo-working-copy-record.ts";
import {
  SILO_PAGE_APPROVAL_SERVER_GATE,
  TERRITORY_STRUCTURE_UNMAPPED_FIELDS,
  TERRITORY_TO_SILO_DNA_FIELD_MAP,
  assertSiloDnaMatchesConfirmedTerritory,
  assertSiloDnaMatchesConfirmedWorkingCopy,
  assertSiloPageMatchesSiloDna,
  deriveExpectedCompositionFromWorkingCopy,
  refuseArticleVersionBinding,
  refusePillarDecisionBinding,
  refuseStatusEscalation,
  type RemoteArticleVersion,
} from "../lib/arquiteto/silo-dna-binding.ts";
import { SiloDNASchema } from "../lib/arquiteto/contracts.ts";
import type { SiloDNA, SiloPage } from "../lib/arquiteto/contracts.ts";

const BRAND = "brand-1";
const NOW = "2026-09-02T12:00:00.000Z";
const TERRITORY = buildTerritoryRef("11111111-1111-4111-8111-111111111111");
const OTHER_TERRITORY = buildTerritoryRef("22222222-2222-4222-8222-222222222222");
const WC_REF = buildSiloWorkingCopyRef(TERRITORY);
const HASH = `sha256:${"a".repeat(64)}`;
const LOCK = 4;

const ref = (articleId: string) => ({
  articleId, articleDnaVersionId: `${articleId}:v1`, articleDnaContentHash: HASH,
});

function workingCopy(overrides: Partial<SiloWorkingCopyState> = {}): SiloWorkingCopyState {
  return SiloWorkingCopyStateSchema.parse({
    workingCopyRef: WC_REF,
    brandId: BRAND,
    territoryRef: TERRITORY,
    name: "Manicure",
    slug: "manicure",
    formationStatus: "ready_for_review",
    existingSiloId: null,
    articleRefs: [ref("art-A"), ref("art-B")],
    pillarSuggestionArticleId: "art-B",
    pillarSelection: {
      articleId: "art-A", actorUserId: "user-1", decidedAt: NOW,
      reason: "Pilar escolhido pela estratégia.", decidedOverArticleIds: ["art-A", "art-B"],
    },
    supportArticleIds: ["art-B"],
    exclusions: [],
    reasons: ["Cópia territorial."],
    conflicts: [],
    ...overrides,
  });
}

const NARRATIVA = {
  statement: "Manicure como autoridade de cuidado das maos.",
  continuity: "coherent" as const,
  brandAlignment: "aligned" as const,
  rationale: ["mesma entidade central", "mesma promessa editorial"],
};

const siloDna = (overrides: Partial<SiloDNA> = {}): SiloDNA => ({
  schemaVersion: 1, formationStatus: "formed", siloId: "silo-1", brandId: BRAND,
  territoryRef: TERRITORY, workingCopyRef: WC_REF, workingCopyLockVersion: LOCK,
  territoryNarrative: { ...NARRATIVA, rationale: [...NARRATIVA.rationale] },
  centralEntity: "manicure", objective: "o", audience: "a", macroProblem: "m", dominantIntent: "d",
  pillarArticleId: "art-A", supportArticleIds: ["art-B"],
  articleReferences: [
    { articleId: "art-A", articleDnaVersionId: "art-A:v1", articleDnaContentHash: HASH, role: "Pilar" },
    { articleId: "art-B", articleDnaVersionId: "art-B:v1", articleDnaContentHash: HASH, role: "Suporte" },
  ],
  articleRoles: [], narrativeOrder: [], linkMap: [], boundary: "b",
  includedTopics: [], excludedTopics: [], nearbySiloIds: [], possibleConflicts: [],
  gaps: [], nextContents: [], confidence: 1, humanPendingDecisions: [],
  ...overrides,
} as SiloDNA);

const bind = (dna: SiloDNA, copy = workingCopy()) =>
  assertSiloDnaMatchesConfirmedWorkingCopy({ workingCopy: copy, workingCopyLockVersion: LOCK, siloDna: dna })
    .map(refusal => refusal.code);

const remote = (overrides: Partial<RemoteArticleVersion> = {}): RemoteArticleVersion => ({
  versionId: "art-A:v1", entityId: "art-A", contentHash: HASH, brandId: BRAND, territoryRef: TERRITORY,
  ...overrides,
});

const remoteBoth = () => [remote(), remote({ versionId: "art-B:v1", entityId: "art-B" })];

// --- 1..8 - binding da composição -------------------------------------------

test("1 · WC Pilar=A e SiloDNA Pilar=A passa", () => {
  assert.deepEqual(bind(siloDna()), []);
});

test("2 · WC Pilar=A e SiloDNA Pilar=B é bloqueado", () => {
  const codes = bind(siloDna({
    pillarArticleId: "art-B", supportArticleIds: ["art-A"],
    articleReferences: [
      { articleId: "art-B", articleDnaVersionId: "art-B:v1", articleDnaContentHash: HASH, role: "Pilar" },
      { articleId: "art-A", articleDnaVersionId: "art-A:v1", articleDnaContentHash: HASH, role: "Suporte" },
    ],
  }));
  assert.ok(codes.includes("SILO_DNA_WORKING_COPY_MISMATCH"));
});

test("3 · Suportes divergentes são bloqueados", () => {
  const codes = bind(siloDna({ supportArticleIds: ["art-C"] }));
  assert.ok(codes.includes("SILO_DNA_WORKING_COPY_MISMATCH"));
});

test("4 · Article excluído reaparecendo como Suporte é bloqueado", () => {
  const copy = workingCopy({
    articleRefs: [ref("art-A"), ref("art-B"), ref("art-X")],
    supportArticleIds: ["art-B"],
    exclusions: [{ articleId: "art-X", actorUserId: "user-1", decidedAt: NOW, reason: "Fora da fronteira." }],
    pillarSelection: {
      articleId: "art-A", actorUserId: "user-1", decidedAt: NOW,
      reason: "Pilar.", decidedOverArticleIds: ["art-A", "art-B", "art-X"],
    },
  });
  const codes = bind(siloDna({
    supportArticleIds: ["art-B", "art-X"],
    articleReferences: [
      { articleId: "art-A", articleDnaVersionId: "art-A:v1", articleDnaContentHash: HASH, role: "Pilar" },
      { articleId: "art-B", articleDnaVersionId: "art-B:v1", articleDnaContentHash: HASH, role: "Suporte" },
      { articleId: "art-X", articleDnaVersionId: "art-X:v1", articleDnaContentHash: HASH, role: "Suporte" },
    ],
  }), copy);
  const detalhes = assertSiloDnaMatchesConfirmedWorkingCopy({
    workingCopy: copy, workingCopyLockVersion: LOCK,
    siloDna: siloDna({ supportArticleIds: ["art-B", "art-X"] }),
  });
  assert.ok(codes.includes("SILO_DNA_WORKING_COPY_MISMATCH"));
  assert.ok(detalhes.some(item => item.detail.includes("excluído reaparece")));
});

test("5 · Article não coberto por nenhum papel é ARTICLE_COVERAGE_GAP", () => {
  const copy = workingCopy({
    articleRefs: [ref("art-A"), ref("art-B"), ref("art-orfao")],
    pillarSelection: {
      articleId: "art-A", actorUserId: "user-1", decidedAt: NOW,
      reason: "Pilar.", decidedOverArticleIds: ["art-A", "art-B", "art-orfao"],
    },
  });
  assert.ok(bind(siloDna(), copy).includes("ARTICLE_COVERAGE_GAP"));
});

test("6 · decisão humana obsoleta é bloqueada", () => {
  // A composição mudou depois da decisão.
  const mudou = workingCopy({ articleRefs: [ref("art-A"), ref("art-B"), ref("art-C")] });
  assert.deepEqual(
    refusePillarDecisionBinding(mudou).map(item => item.code),
    ["PILLAR_DECISION_STALE"],
  );
  // O Pilar decidido saiu da composição.
  const saiu = workingCopy({
    articleRefs: [ref("art-B")],
    pillarSelection: {
      articleId: "art-A", actorUserId: "user-1", decidedAt: NOW,
      reason: "Pilar.", decidedOverArticleIds: ["art-A", "art-B"],
    },
  });
  assert.deepEqual(refusePillarDecisionBinding(saiu).map(item => item.code), ["PILLAR_DECISION_STALE"]);
  // Sem decisão humana nenhuma.
  assert.deepEqual(
    refusePillarDecisionBinding(workingCopy({ pillarSelection: null })).map(item => item.code),
    ["PILLAR_NOT_HUMAN_DECIDED"],
  );
  // Decisão coerente passa.
  assert.deepEqual(refusePillarDecisionBinding(workingCopy()), []);
});

test("7 · proveniência correta com composição errada é bloqueada", () => {
  // workingCopyRef e lock corretos — o que antes bastava.
  const codes = bind(siloDna({ pillarArticleId: "art-B", supportArticleIds: ["art-A"] }));
  assert.ok(codes.includes("SILO_DNA_WORKING_COPY_MISMATCH"));
  // A proveniência em si está certa, e ainda assim é recusado.
  const dna = siloDna({ pillarArticleId: "art-B", supportArticleIds: ["art-A"] });
  assert.equal(dna.workingCopyRef, WC_REF);
  assert.equal(dna.workingCopyLockVersion, LOCK);
});

test("8 · proveniência e composição corretas passam", () => {
  assert.deepEqual(bind(siloDna()), []);
  assert.deepEqual(refuseArticleVersionBinding({ workingCopy: workingCopy(), remoteVersions: remoteBoth() }), []);
});

// --- 9..10 - autoridade e snapshot -------------------------------------------

test("9 · a readiness do chamador não é autoridade", () => {
  const rota = readFileSync(new URL("../app/api/arquiteto/silo-consolidation/route.ts", import.meta.url), "utf8");
  // Não existe campo pelo qual o cliente declare estar pronto.
  assert.equal(/clientReady|readyForConsolidation|approved: z\.boolean|readiness:/.test(rota), false);
  // A decisão humana é descritiva e conferida, não um booleano.
  assert.match(rota, /decision: z\.object\(\{/);
  assert.match(rota, /pillarArticleId: z\.string\(\)\.min\(1\)/);
  assert.match(rota, /supportArticleIds: z\.array/);
  assert.match(rota, /excludedArticleIds: z\.array/);
});

test("10 · o lock lido é o que viaja para a RPC", () => {
  const adapter = readFileSync(new URL("../lib/server/arquiteto-silo-consolidation-adapter.ts", import.meta.url), "utf8");
  assert.match(adapter, /if \(lockVersion !== request\.workingCopyExpectedLock\)/);
  assert.match(adapter, /p_working_copy_expected_lock: request\.workingCopyExpectedLock/);
});

// --- 11..14 - ArticleDNA versionado -----------------------------------------

test("11 · versão de ArticleDNA divergente é bloqueada", () => {
  const codes = refuseArticleVersionBinding({
    workingCopy: workingCopy(),
    remoteVersions: [remote(), remote({ versionId: "art-B:v2", entityId: "art-B" })],
  }).map(item => item.code);
  assert.ok(codes.includes("ARTICLE_VERSION_MISMATCH"));
});

test("12 · contentHash divergente é bloqueado", () => {
  const codes = refuseArticleVersionBinding({
    workingCopy: workingCopy(),
    remoteVersions: [remote({ contentHash: `sha256:${"b".repeat(64)}` }), remote({ versionId: "art-B:v1", entityId: "art-B" })],
  }).map(item => item.code);
  assert.ok(codes.includes("ARTICLE_VERSION_MISMATCH"));
});

test("13 · ArticleDNA de outro território é bloqueado", () => {
  const codes = refuseArticleVersionBinding({
    workingCopy: workingCopy(),
    remoteVersions: [remote({ territoryRef: OTHER_TERRITORY }), remote({ versionId: "art-B:v1", entityId: "art-B" })],
  }).map(item => item.code);
  assert.ok(codes.includes("ARTICLE_TERRITORY_MISMATCH"));
});

test("14 · ArticleDNA de outra Brand é bloqueado", () => {
  const codes = refuseArticleVersionBinding({
    workingCopy: workingCopy(),
    remoteVersions: [remote({ brandId: "brand-outra" }), remote({ versionId: "art-B:v1", entityId: "art-B" })],
  }).map(item => item.code);
  assert.ok(codes.includes("ARTICLE_BRAND_MISMATCH"));
});

// --- 15..20 - identidade estrutural e SiloPage -------------------------------

test("15 · identidade estrutural do Silo não é escolhida pelo chamador", () => {
  assert.ok(bind(siloDna({ brandId: "brand-outra" })).includes("SILO_DNA_WORKING_COPY_MISMATCH"));
  assert.ok(bind(siloDna({ territoryRef: OTHER_TERRITORY })).includes("SILO_DNA_WORKING_COPY_MISMATCH"));
  assert.ok(bind(siloDna({ workingCopyLockVersion: LOCK + 1 })).includes("SILO_DNA_WORKING_COPY_MISMATCH"));
  // Âncora de Silo existente também é decisão territorial.
  const ancorado = workingCopy({ existingSiloId: "silo-antigo" });
  assert.ok(bind(siloDna({ siloId: "silo-novo" }), ancorado).includes("SILO_DNA_WORKING_COPY_MISMATCH"));
  // Campos editoriais que a working copy NÃO decide não são comparados.
  assert.deepEqual(bind(siloDna({ centralEntity: "outra entidade", boundary: "outra fronteira" })), []);
});

const siloPage = (overrides: Partial<SiloPage> = {}): SiloPage => ({
  schemaVersion: 1, formationStatus: "formed", siloPageId: "silo-page:silo-1", brandId: BRAND,
  siloDnaRef: { entityId: "silo-1", versionId: "silo-1:v1", contentHash: HASH },
  siloId: "silo-1", territoryRef: TERRITORY, slug: "/manicure", publicationStatus: "new",
  publishedUrl: null,
  publicationVerification: {
    status: "not_applicable", checkedAt: null, requestedUrl: null, resolvedUrl: null,
    declaredCanonical: null, httpStatus: null, sitemapUrl: null, sitemapMatch: null, message: null,
  },
  h1: "h", seoTitle: "s", metaDescription: "m", canonical: null, intro: "i",
  sections: [], cta: "c", coverImageBrief: "cb", visualBriefing: "vb", breadcrumbs: [],
  pillarArticleId: "art-A", supportArticleIds: ["art-B"], indexationStatus: "index",
  alerts: [], confidence: 1, humanPendingDecisions: [],
  ...overrides,
} as SiloPage);

const bindPage = (page: SiloPage, extra: Parameters<typeof assertSiloPageMatchesSiloDna>[0] extends infer T ? Partial<T> : never = {}) =>
  assertSiloPageMatchesSiloDna({
    siloDna: siloDna(), siloPage: page, workingCopy: workingCopy(), ...extra,
  }).map(item => item.code);

test("16 · SiloPage com Pilar divergente é bloqueada", () => {
  assert.ok(bindPage(siloPage({ pillarArticleId: "art-B" })).includes("SILO_PAGE_STRUCTURAL_MISMATCH"));
  assert.deepEqual(bindPage(siloPage()), []);
});

test("17 · SiloPage com Suportes divergentes é bloqueada", () => {
  assert.ok(bindPage(siloPage({ supportArticleIds: ["art-C"] })).includes("SILO_PAGE_STRUCTURAL_MISMATCH"));
  assert.ok(bindPage(siloPage({ territoryRef: OTHER_TERRITORY })).includes("SILO_PAGE_STRUCTURAL_MISMATCH"));
  assert.ok(bindPage(siloPage({ siloId: "silo-2" })).includes("SILO_PAGE_STRUCTURAL_MISMATCH"));
});

const publicada = {
  slug: "/manicure", canonical: "https://marca.com/manicure",
  publishedUrl: "https://marca.com/manicure", publicationStatus: "published" as const,
  publicationVerification: {
    status: "canonical_confirmed" as const, checkedAt: null, requestedUrl: null, resolvedUrl: null,
    declaredCanonical: null, httpStatus: null, sitemapUrl: null, sitemapMatch: null, message: null,
  },
};

test("18 · slug publicado alterado é bloqueado", () => {
  const codes = bindPage(siloPage({ slug: "/outro" }), { publishedPage: publicada });
  assert.ok(codes.includes("PUBLISHED_IDENTITY_MUTATED"));
});

test("19 · canonical publicado alterado é bloqueado", () => {
  const codes = bindPage(
    siloPage({ slug: "/manicure", canonical: "https://marca.com/outro", publishedUrl: "https://marca.com/manicure" }),
    { publishedPage: publicada },
  );
  assert.ok(codes.includes("PUBLISHED_IDENTITY_MUTATED"));
});

test("20 · publishedUrl alterado é bloqueado, e conflito exige decisão humana", () => {
  const codes = bindPage(
    siloPage({ slug: "/manicure", canonical: "https://marca.com/manicure", publishedUrl: "https://marca.com/outro" }),
    { publishedPage: publicada },
  );
  assert.ok(codes.includes("PUBLISHED_IDENTITY_MUTATED"));

  const conflito = { ...publicada, publicationVerification: { ...publicada.publicationVerification, status: "conflict" as const } };
  const preservando = siloPage({ slug: "/manicure", canonical: "https://marca.com/manicure", publishedUrl: "https://marca.com/manicure" });
  assert.ok(bindPage(preservando, { publishedPage: conflito }).includes("PUBLISHED_IDENTITY_DECISION_REQUIRED"));
  assert.deepEqual(
    bindPage(preservando, { publishedPage: conflito, publishedIdentityDecisionResolved: true }),
    [],
  );
});

// --- 21..23 - status ---------------------------------------------------------

test("21 · SiloDNA approved sem decisão humana é bloqueado", () => {
  const codes = refuseStatusEscalation({
    siloDnaStatus: "approved", siloPageStatus: "draft", humanConsolidationConfirmed: false,
  }).map(item => item.code);
  assert.deepEqual(codes, ["SILO_DNA_APPROVAL_WITHOUT_HUMAN_DECISION"]);
});

test("22 · SiloDNA approved com decisão humana válida passa", () => {
  assert.deepEqual(
    refuseStatusEscalation({ siloDnaStatus: "approved", siloPageStatus: "draft", humanConsolidationConfirmed: true }),
    [],
  );
});

test("23 · SiloPage approved exige o gate próprio dela (a 2C.4.7 criou um)", () => {
  // O gate DEIXOU de faltar. O que continua valendo é a independência: sem
  // readiness própria resolvida, `approved` na página segue fail-closed.
  assert.equal(SILO_PAGE_APPROVAL_SERVER_GATE, "PRESENT");
  const codes = refuseStatusEscalation({
    siloDnaStatus: "approved", siloPageStatus: "approved", humanConsolidationConfirmed: true,
  }).map(item => item.code);
  assert.deepEqual(codes, ["SILO_PAGE_APPROVAL_GATE_MISSING"], "sem decisão própria, não sobe");
  // Aprovação conjunta não é inventada: os dois status seguem independentes.
  assert.deepEqual(
    refuseStatusEscalation({ siloDnaStatus: "proposed", siloPageStatus: "proposed", humanConsolidationConfirmed: false }),
    [],
  );
});

// --- 24..27 - rotas manuais --------------------------------------------------

test("24 · /silos continua caminho manual de rascunho legítimo", () => {
  const rota = readFileSync(new URL("../app/api/arquiteto/silos/route.ts", import.meta.url), "utf8");
  assert.match(rota, /\{ siloDna: "draft", siloPage: "draft" \}/);
  assert.equal(/"approved"/.test(rota), false);
});

test("25 · /silo-pair aceita draft/draft", () => {
  const rota = readFileSync(new URL("../app/api/arquiteto/silo-pair/route.ts", import.meta.url), "utf8");
  assert.match(rota, /parsed\.siloDnaStatus !== "draft" \|\| parsed\.siloPageStatus !== "draft"/);
});

test("26 · /silo-pair recusa finalização aprovada", () => {
  const rota = readFileSync(new URL("../app/api/arquiteto/silo-pair/route.ts", import.meta.url), "utf8");
  assert.match(rota, /LEGACY_SILO_PAIR_FINALIZATION_DISABLED/);
  // O guard vem ANTES de resolver contexto e de chamar a persistência.
  const guard = rota.indexOf("LEGACY_SILO_PAIR_FINALIZATION_DISABLED");
  const persist = rota.indexOf("persistSiloPairAtomic(context");
  assert.ok(guard > 0 && persist > guard, "a recusa precisa preceder a persistência");
});

test("27 · o helper legado recusa por conta própria, não só a rota", () => {
  const helper = readFileSync(new URL("../lib/arquiteto/canonical-persistence.ts", import.meta.url), "utf8");
  const fn = helper.slice(helper.indexOf("export async function persistArquitetoSiloPair"));
  const guard = fn.indexOf("LEGACY_SILO_PAIR_FINALIZATION_DISABLED");
  const fetchCall = fn.indexOf('fetch("/api/arquiteto/silo-pair"');
  assert.ok(guard > 0, "o helper precisa recusar sozinho");
  assert.ok(fetchCall > guard, "a recusa precisa preceder o fetch");
});

// --- 28..30 - higiene --------------------------------------------------------

test("28 · zero chamadas a provider no caminho de binding", () => {
  for (const file of [
    "lib/arquiteto/silo-dna-binding.ts",
    "lib/server/arquiteto-silo-consolidation-adapter.ts",
    "app/api/arquiteto/silo-consolidation/route.ts",
  ]) {
    const source = readFileSync(new URL("../" + file, import.meta.url), "utf8");
    assert.doesNotMatch(source, /dataforseo|deepseek|google-ads|openai|anthropic|serper/i, file);
  }
});

test("29 · a rota não reconstrói envelope", () => {
  for (const file of [
    "app/api/arquiteto/silo-consolidation/route.ts",
    "lib/server/arquiteto-silo-consolidation-adapter.ts",
  ]) {
    const source = readFileSync(new URL("../" + file, import.meta.url), "utf8")
      .split("\n").filter(line => !line.trim().startsWith("//") && !line.trim().startsWith("*")).join("\n");
    assert.equal(/createVersionEnvelope|crypto\.randomUUID|new Date\(\)/.test(source), false, file);
  }
});

test("30 · a RPC A só é chamada depois de todos os gates", () => {
  const adapter = readFileSync(new URL("../lib/server/arquiteto-silo-consolidation-adapter.ts", import.meta.url), "utf8");
  const rpc = adapter.indexOf('.rpc("persist_silo_from_working_copy_atomic"');
  assert.ok(rpc > 0);
  for (const gate of [
    "loadTerritory(context",
    "loadWorkingCopy(context",
    "refuseArticleVersionBinding(",
    "refusePillarDecisionBinding(",
    "resolveSiloConsolidationReadiness({",
    "confirmSiloConsolidation({",
    "assertSiloDnaMatchesConfirmedWorkingCopy({",
    "assertSiloPageMatchesSiloDna({",
    "refuseStatusEscalation({",
  ]) {
    const at = adapter.indexOf(gate);
    assert.ok(at > 0, `gate ausente: ${gate}`);
    assert.ok(at < rpc, `${gate} precisa vir antes da RPC`);
  }
  // E a composição derivada vem da working copy, não do request.
  assert.match(adapter, /deriveExpectedCompositionFromWorkingCopy\(workingCopy\)/);
  assert.equal(deriveExpectedCompositionFromWorkingCopy(workingCopy()).pillarArticleId, "art-A");
});

// ===========================================================================
// 2C.4.6A — BINDING TERRITORY -> SILODNA
// O Território confirmado é a autoridade dos campos que a working copy não
// decide. Eles não são livres, e os ArticleDNAs não os redefinem.
// ===========================================================================

const territorio = (overrides: Partial<Parameters<typeof assertSiloDnaMatchesConfirmedTerritory>[0]["territory"]> = {}) => ({
  territoryRef: TERRITORY,
  centralEntity: "manicure",
  macroIntent: "d",
  boundary: { includes: [] as string[], excludes: [] as string[] },
  narrative: { ...NARRATIVA, rationale: [...NARRATIVA.rationale] },
  ...overrides,
});

const bindTerritory = (dna: SiloDNA, territory = territorio()) =>
  assertSiloDnaMatchesConfirmedTerritory({ territory, siloDna: dna }).map(item => item.code);

test("31 · centralEntity igual ao Território passa", () => {
  assert.deepEqual(bindTerritory(siloDna()), []);
  // Espaçamento não muda identidade.
  assert.deepEqual(bindTerritory(siloDna({ centralEntity: "  manicure  " })), []);
});

test("32 · centralEntity divergente é bloqueado", () => {
  const codes = bindTerritory(siloDna({ centralEntity: "pedicure" }));
  assert.deepEqual(codes, ["TERRITORY_STRUCTURE_MISMATCH"]);
  const detalhe = assertSiloDnaMatchesConfirmedTerritory({
    territory: territorio(), siloDna: siloDna({ centralEntity: "pedicure" }),
  })[0].detail;
  assert.match(detalhe, /centralEntity/);
});

test("33 · macroIntent equivalente ao dominantIntent passa", () => {
  const territory = territorio({ macroIntent: "sustentar autoridade sobre manicure" });
  assert.deepEqual(
    bindTerritory(siloDna({ dominantIntent: "sustentar autoridade sobre manicure" }), territory),
    [],
  );
});

test("34 · macroIntent divergente é bloqueado", () => {
  const territory = territorio({ macroIntent: "sustentar autoridade sobre manicure" });
  const codes = bindTerritory(siloDna({ dominantIntent: "vender esmalte" }), territory);
  assert.deepEqual(codes, ["TERRITORY_STRUCTURE_MISMATCH"]);
});

test("35 · fronteira igual passa, comparada por conjunto", () => {
  const territory = territorio({ boundary: { includes: ["manicure", "esmaltação"], excludes: ["acne"] } });
  assert.deepEqual(
    bindTerritory(siloDna({ includedTopics: ["esmaltação", "manicure"], excludedTopics: ["acne"] }), territory),
    [],
    "a ordem das listas não carrega semântica",
  );
});

test("36 · fronteira divergente é bloqueada", () => {
  const territory = territorio({ boundary: { includes: ["manicure"], excludes: ["acne"] } });
  assert.ok(bindTerritory(siloDna({ includedTopics: ["pedicure"], excludedTopics: ["acne"] }), territory)
    .includes("TERRITORY_STRUCTURE_MISMATCH"));
  assert.ok(bindTerritory(siloDna({ includedTopics: ["manicure"], excludedTopics: [] }), territory)
    .includes("TERRITORY_STRUCTURE_MISMATCH"));
});

test("37 · ArticleDNA não redefine o território: o Território vence", () => {
  // Um SiloDNA que traz a entidade "vinda dos artigos" em vez da confirmada.
  const territory = territorio({ centralEntity: "barreira cutânea" });
  const induzido = siloDna({ centralEntity: "ácido hialurônico" });
  assert.deepEqual(bindTerritory(induzido, territory), ["TERRITORY_STRUCTURE_MISMATCH"]);
  // E o adapter roda esse gate ANTES do binding de composição.
  const adapter = readFileSync(new URL("../lib/server/arquiteto-silo-consolidation-adapter.ts", import.meta.url), "utf8");
  const territorial = adapter.indexOf("assertSiloDnaMatchesConfirmedTerritory({");
  const composicao = adapter.indexOf("assertSiloDnaMatchesConfirmedWorkingCopy({");
  const rpc = adapter.indexOf('.rpc("persist_silo_from_working_copy_atomic"');
  assert.ok(territorial > 0 && territorial < composicao && composicao < rpc);
});

test("38 · proveniência e working copy corretas, território errado → BLOCK", () => {
  // Composição impecável...
  assert.deepEqual(bind(siloDna()), []);
  // ...e ainda assim recusado, porque a estrutura territorial não confere.
  const codes = bindTerritory(siloDna(), territorio({ centralEntity: "outra coisa" }));
  assert.deepEqual(codes, ["TERRITORY_STRUCTURE_MISMATCH"]);
});

test("39 · tudo coerente alcança a RPC A", () => {
  assert.deepEqual(bindTerritory(siloDna()), []);
  assert.deepEqual(bind(siloDna()), []);
  assert.deepEqual(refuseArticleVersionBinding({ workingCopy: workingCopy(), remoteVersions: remoteBoth() }), []);
  assert.deepEqual(refusePillarDecisionBinding(workingCopy()), []);
  assert.deepEqual(bindPage(siloPage()), []);
});

test("40 · só a prosa de boundary fica sem equivalente (2C.4.6B move a narrativa)", () => {
  // A narrativa DEIXOU de ser um campo sem destino: a 2C.4.6B lhe deu um campo
  // próprio no SiloDNA. Sobra apenas `SiloDNA.boundary`, que é prosa livre
  // enquanto `Territory.boundary` é o par includes/excludes.
  assert.deepEqual([...TERRITORY_STRUCTURE_UNMAPPED_FIELDS], ["boundaryProse"]);
  assert.deepEqual(bindTerritory(siloDna({ boundary: "qualquer prosa" })), []);
  // `narrativeOrder` continua fora: é ordem de artigos, não narrativa territorial.
  assert.deepEqual(bindTerritory(siloDna({ narrativeOrder: ["art-A", "art-B"] })), []);
  // O mapa declara as cinco equivalências reais, e nenhuma a mais.
  assert.deepEqual(TERRITORY_TO_SILO_DNA_FIELD_MAP, {
    centralEntity: "centralEntity",
    macroIntent: "dominantIntent",
    "boundary.includes": "includedTopics",
    "boundary.excludes": "excludedTopics",
    narrative: "territoryNarrative",
  });
});

test("41 · territoryRef divergente interrompe o gate territorial imediatamente", () => {
  const codes = bindTerritory(siloDna({ territoryRef: OTHER_TERRITORY }));
  assert.deepEqual(codes, ["TERRITORY_STRUCTURE_MISMATCH"], "uma recusa só: não adianta comparar o resto");
});

// ===========================================================================
// 2C.4.6B — PRESERVAÇÃO DA NARRATIVA TERRITORIAL
// A narrativa responde POR QUE estes artigos pertencem juntos. A estrutura
// (papéis, ordem, links) não a reconstitui: narrativas diferentes produzem a
// mesma lista ordenada. Ela viaja para o SiloDNA como snapshot, não como texto
// redigido no Silo.
// ===========================================================================

test("42 · narrativa idêntica à do Território confirmado passa", () => {
  assert.deepEqual(bindTerritory(siloDna()), []);
});

test("43 · SiloDNA novo sem narrativa é recusado com código próprio", () => {
  const dna = siloDna();
  delete (dna as { territoryNarrative?: unknown }).territoryNarrative;
  const codes = bindTerritory(dna);
  assert.deepEqual(codes, ["TERRITORY_NARRATIVE_MISSING"]);
  // Código próprio: ausência não é divergência. Confundir os dois faria "perdi
  // a razão editorial no caminho" parecer "o humano mudou a razão".
  assert.ok(!codes.includes("TERRITORY_STRUCTURE_MISMATCH"));
});

test("44 · statement divergente é bloqueado", () => {
  const codes = bindTerritory(siloDna({
    territoryNarrative: { ...NARRATIVA, statement: "Outra tese editorial." },
  }));
  assert.deepEqual(codes, ["TERRITORY_STRUCTURE_MISMATCH"]);
});

test("45 · continuity divergente é bloqueado", () => {
  assert.deepEqual(
    bindTerritory(siloDna({ territoryNarrative: { ...NARRATIVA, continuity: "fragmented" } })),
    ["TERRITORY_STRUCTURE_MISMATCH"],
  );
});

test("46 · brandAlignment divergente é bloqueado", () => {
  assert.deepEqual(
    bindTerritory(siloDna({ territoryNarrative: { ...NARRATIVA, brandAlignment: "off_strategy" } })),
    ["TERRITORY_STRUCTURE_MISMATCH"],
  );
});

test("47 · rationale com conteúdo diferente é bloqueado", () => {
  assert.deepEqual(
    bindTerritory(siloDna({ territoryNarrative: { ...NARRATIVA, rationale: ["outra razão", "mesma promessa editorial"] } })),
    ["TERRITORY_STRUCTURE_MISMATCH"],
  );
});

test("48 · rationale REORDENADO é bloqueado — não é conjunto", () => {
  // A fronteira é comparada por conjunto porque ordem de tópicos não carrega
  // semântica. A narrativa não: `rationale` é a sequência do raciocínio, e
  // inverter a ordem muda a leitura do porquê.
  const invertido = [...NARRATIVA.rationale].reverse();
  assert.deepEqual(
    bindTerritory(siloDna({ territoryNarrative: { ...NARRATIVA, rationale: invertido } })),
    ["TERRITORY_STRUCTURE_MISMATCH"],
  );
});

test("49 · rationale truncado é bloqueado", () => {
  assert.deepEqual(
    bindTerritory(siloDna({ territoryNarrative: { ...NARRATIVA, rationale: [NARRATIVA.rationale[0]] } })),
    ["TERRITORY_STRUCTURE_MISMATCH"],
  );
});

test("50 · narrativeOrder não é a narrativa territorial", () => {
  // Ordem de leitura dos artigos é outra coisa. Mexer nela não toca no snapshot
  // narrativo, e igualar as duas seria inventar equivalência entre contratos.
  assert.deepEqual(bindTerritory(siloDna({ narrativeOrder: ["art-A", "art-B"] })), []);
  assert.equal(TERRITORY_TO_SILO_DNA_FIELD_MAP.narrative, "territoryNarrative");
  assert.ok(!Object.values(TERRITORY_TO_SILO_DNA_FIELD_MAP).includes("narrativeOrder" as never));
});

test("51 · boundary do SiloDNA segue prosa livre, não comparada", () => {
  // `SiloDNA.boundary` é texto descritivo/legado; a fronteira canônica é o par
  // includes/excludes. Ele continua fora do mapa de equivalência.
  assert.deepEqual(bindTerritory(siloDna({ boundary: "qualquer prosa" })), []);
  assert.deepEqual([...TERRITORY_STRUCTURE_UNMAPPED_FIELDS], ["boundaryProse"]);
});

test("52 · o campo é aditivo: SiloDNA legado sem narrativa ainda valida no schema", () => {
  // Retrocompatibilidade vive no SCHEMA (opcional); a obrigatoriedade vive no
  // GATE de nova consolidação, que é o teste 43.
  const legado = siloDna();
  delete (legado as { territoryNarrative?: unknown }).territoryNarrative;
  assert.equal(SiloDNASchema.safeParse(legado).success, true);
  assert.equal(SiloDNASchema.safeParse(siloDna()).success, true);
  // E a narrativa é validada quando presente: enum fora do contrato é recusado.
  assert.equal(
    SiloDNASchema.safeParse(siloDna({ territoryNarrative: { ...NARRATIVA, continuity: "talvez" } as never })).success,
    false,
  );
});
