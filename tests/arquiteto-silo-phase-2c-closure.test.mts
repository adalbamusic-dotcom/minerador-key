import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { buildTerritoryRef } from "../lib/arquiteto/territory.ts";
import { buildSiloWorkingCopyRef } from "../lib/arquiteto/silo-working-copy-record.ts";
import type { SiloWorkingCopyState } from "../lib/arquiteto/silo-working-copy-record.ts";
import {
  classifySiloWorkingCopyFailure,
  consolidatedTerritoryRefsOf,
  deriveSupportArticleIds,
  draftSiloWorkingCopyFromProposal,
  humanExclusion,
  humanPillarSelection,
  resolveAuthoritativeSiloWorkingCopies,
  resolveProposalTerritoryRef,
  siloWorkingCopyIsReadOnly,
} from "../lib/arquiteto/silo-working-copy-bridge.ts";
import {
  buildSiloConsolidationOperationId,
  markSiloConsolidationIndeterminate,
  openSiloConsolidationOperation,
  registerSiloConsolidationAttempt,
  retryPreservesEnvelope,
  siloConsolidationRequestBody,
} from "../lib/arquiteto/silo-consolidation-operation.ts";
import {
  resolveSiloPageApprovalReadiness,
  type SiloPageApprovalDecision,
} from "../lib/arquiteto/silo-page-approval.ts";
import { refuseStatusEscalation } from "../lib/arquiteto/silo-dna-binding.ts";
import type { SiloDNA, SiloPage, VersionEnvelope } from "../lib/arquiteto/contracts.ts";

/**
 * FECHAMENTO DA FASE 2C — aprovação própria da SiloPage, autoridade remota da
 * working copy na interface, dono do envelope de retry e caminho canônico único
 * de consolidação.
 */

const read = (relative: string) => readFileSync(new URL("../" + relative, import.meta.url), "utf8");
const UI = "modules/arquiteto/arquiteto-workspace.tsx";
const CLIENT = "lib/arquiteto/canonical-workspace.ts";
const ADAPTER = "lib/server/arquiteto-silo-consolidation-adapter.ts";
const PAIR_ROUTE = "app/api/arquiteto/silo-pair/route.ts";
const SILOS_ROUTE = "app/api/arquiteto/silos/route.ts";
const PAIR_HELPER = "lib/arquiteto/canonical-persistence.ts";

/** Só o código: comentário citando um símbolo não é uso do símbolo. */
const executable = (source: string) =>
  source.split("\n").filter(line => {
    const trimmed = line.trim();
    return !trimmed.startsWith("*") && !trimmed.startsWith("/*") && !trimmed.startsWith("//");
  }).join("\n");

const TERRITORY = buildTerritoryRef("11111111-1111-4111-8111-111111111111");
const OTHER_TERRITORY = buildTerritoryRef("22222222-2222-4222-8222-222222222222");
const BRAND = "33333333-3333-4333-8333-333333333333";
const HASH = `sha256:${"a".repeat(64)}`;
const PAGE_HASH = `sha256:${"b".repeat(64)}`;
const NOW = "2026-09-02T18:00:00.000Z";

const remoteState = (overrides: Partial<SiloWorkingCopyState> = {}): SiloWorkingCopyState => ({
  workingCopyRef: buildSiloWorkingCopyRef(TERRITORY),
  brandId: BRAND,
  territoryRef: TERRITORY,
  name: "Manicure",
  slug: "manicure",
  formationStatus: "draft",
  existingSiloId: null,
  articleRefs: [
    { articleId: "art-A", articleDnaVersionId: "art-A:v1", articleDnaContentHash: HASH },
    { articleId: "art-B", articleDnaVersionId: "art-B:v1", articleDnaContentHash: HASH },
    { articleId: "art-C", articleDnaVersionId: "art-C:v1", articleDnaContentHash: HASH },
  ],
  pillarSuggestionArticleId: "art-C",
  pillarSelection: null,
  supportArticleIds: [],
  exclusions: [],
  reasons: ["proposta inicial"],
  conflicts: [],
  ...overrides,
});

const remote = (overrides: Partial<SiloWorkingCopyState> = {}, lockVersion = 3) => ({
  workflowItemId: "wf-1",
  workingCopyRef: buildSiloWorkingCopyRef(TERRITORY),
  lockVersion,
  state: "draft",
  workingCopy: remoteState(overrides),
});

const proposal = (overrides: Record<string, unknown> = {}) => ({
  id: "working-silo:0",
  brandId: BRAND,
  name: "Manicure (local)",
  slug: "manicure-local",
  formationStatus: "draft" as const,
  source: "new_candidate" as const,
  existingSiloId: null,
  articleReferences: [
    { articleId: "art-A", articleDnaVersionId: "art-A:v1", articleDnaContentHash: HASH },
    { articleId: "art-B", articleDnaVersionId: "art-B:v1", articleDnaContentHash: HASH },
  ],
  pillarCandidateArticleId: "art-A",
  supportArticleIds: ["art-B"],
  pillarScores: [],
  reservedCandidateIds: [],
  reasons: ["grupo novo"],
  conflicts: [],
  siloPage: { siloPageId: "page-1", slug: "manicure-local", distinctFromPillar: true as const, pillarArticleId: null, supportArticleIds: [], collisionReasons: [] },
  publishedProtection: { protected: false, siloPageIds: [], articleIds: [], protectedFields: [] },
  ...overrides,
}) as never;

// ===========================================================================
// 1–7 · AUTORIDADE REMOTA DA WORKING COPY
// ===========================================================================

test("01 · working copy remota vence o estado local", () => {
  const resolved = resolveAuthoritativeSiloWorkingCopies({
    remote: [remote()],
    proposals: [{ territoryRef: TERRITORY, proposal: proposal() }],
  });
  assert.equal(resolved.length, 1, "a proposta local não aparece como entrada separada");
  assert.equal(resolved[0].authority, "REMOTE");
  assert.equal(resolved[0].expectedLock, 3);
  // A proposta continua acessível como proposta — mas não é a autoridade.
  assert.equal(resolved[0].remote?.workingCopy.name, "Manicure");
});

test("02 · sem linha remota, a proposta local sobrevive como proposta", () => {
  const resolved = resolveAuthoritativeSiloWorkingCopies({
    remote: [],
    proposals: [{ territoryRef: TERRITORY, proposal: proposal() }],
  });
  assert.equal(resolved[0].authority, "LOCAL_PROPOSAL");
  assert.equal(resolved[0].expectedLock, null, "proposta não tem lock: não há o que travar");
});

test("03 · create da working copy só é sucesso com readback remoto", () => {
  const source = executable(read(CLIENT));
  const create = source.slice(source.indexOf("export async function createRemoteSiloWorkingCopy"));
  const body = create.slice(0, create.indexOf("export async function updateRemoteSiloWorkingCopy"));
  // A função lê a lista devolvida e recusa quando ela volta vazia.
  assert.match(body, /const created = body\.data\.siloWorkingCopies\[0\]/);
  assert.match(body, /if \(!created\)/);
  assert.match(body, /throw new CanonicalWorkspaceError/);
  // A identidade não sobe do cliente.
  assert.ok(!body.includes("workingCopyRef:"), "o create não declara workingCopyRef");
});

test("04 · update sempre envia o expectedLock da cópia carregada", () => {
  const source = executable(read(CLIENT));
  const update = source.slice(source.indexOf("export async function updateRemoteSiloWorkingCopy"));
  assert.match(update, /expectedLock: input\.expectedLock/);
  const ui = executable(read(UI));
  assert.match(ui, /expectedLock: remote\.lockVersion/);
});

test("05 · STALE_WORKING_COPY não sobrescreve nem faz retry silencioso", () => {
  const classified = classifySiloWorkingCopyFailure({ code: "STALE_WORKING_COPY" });
  assert.equal(classified.outcome, "CONFLICT_RELOAD_REQUIRED");
  assert.equal(classified.reloadRemote, true, "recarrega o remoto");
  assert.match(classified.message, /mudou no servidor/);
  // A mensagem chega ao usuário: conflito não é resolvido às escondidas.
  const ui = executable(read(UI));
  assert.match(ui, /setSiloWorkingCopyConflict/);
  assert.ok(!ui.includes("retryStaleWorkingCopy"), "não existe caminho de retry automático de stale");
});

test("06 · Pilar humano persiste com ator, momento, motivo e composição vigente", () => {
  const selection = humanPillarSelection({
    articleId: "art-B",
    actorUserId: "user-1",
    decidedAt: NOW,
    reason: "Pilar escolhido manualmente.",
    currentArticleIds: ["art-C", "art-A", "art-B"],
  });
  assert.equal(selection.articleId, "art-B");
  assert.equal(selection.actorUserId, "user-1");
  assert.deepEqual(selection.decidedOverArticleIds, ["art-A", "art-B", "art-C"]);
  // Sobrevive ao reload porque vive na linha remota, não no estado de React.
  const reloaded = resolveAuthoritativeSiloWorkingCopies({
    remote: [remote({ pillarSelection: selection })],
    proposals: [{ territoryRef: TERRITORY, proposal: proposal() }],
  });
  assert.equal(reloaded[0].remote?.workingCopy.pillarSelection?.articleId, "art-B");
});

test("07 · Suportes e exclusões vivem no mesmo snapshot remoto e sobrevivem ao reload", () => {
  const exclusions = [humanExclusion({ articleId: "art-C", actorUserId: "user-1", decidedAt: NOW, reason: "fora do território" })];
  const supportArticleIds = deriveSupportArticleIds({
    articleIds: ["art-A", "art-B", "art-C"],
    pillarArticleId: "art-A",
    exclusions,
  });
  // Nem Pilar, nem excluído: sobra exatamente o Suporte.
  assert.deepEqual(supportArticleIds, ["art-B"]);
  const reloaded = resolveAuthoritativeSiloWorkingCopies({
    remote: [remote({ supportArticleIds, exclusions, pillarSelection: humanPillarSelection({ articleId: "art-A", actorUserId: "user-1", decidedAt: NOW, reason: "r", currentArticleIds: ["art-A"] }) })],
    proposals: [],
  });
  assert.deepEqual(reloaded[0].remote?.workingCopy.supportArticleIds, ["art-B"]);
  assert.deepEqual(reloaded[0].remote?.workingCopy.exclusions.map(item => item.articleId), ["art-C"]);
});

test("08 · a IA não seleciona Pilar: o draft de create nasce com pillarSelection nula", () => {
  const draft = draftSiloWorkingCopyFromProposal({ brandId: BRAND, territoryRef: TERRITORY, proposal: proposal() });
  assert.equal(draft.pillarSelection, null, "a decisão humana não é pré-preenchida");
  assert.equal(draft.pillarSuggestionArticleId, "art-A", "a sugestão vai para o campo de sugestão");
  assert.ok(!("workingCopyRef" in draft), "a identidade é emitida pelo servidor");
});

// ===========================================================================
// 9–13 · CONSOLIDAÇÃO PELO SNAPSHOT REMOTO E ENVELOPE DE RETRY
// ===========================================================================

const envelope = <T,>(versionId: string, contentHash: string, payload: T): VersionEnvelope<T> => ({
  versionId,
  entityId: "silo-1",
  versionNumber: 1,
  previousVersionId: null,
  contentHash,
  origin: "human",
  changeReason: "consolidação",
  createdAt: NOW,
  createdBy: "user-1",
  payload,
});

const operation = () => openSiloConsolidationOperation({
  brandId: BRAND,
  action: "create",
  territoryRef: TERRITORY,
  territoryExpectedLock: 2,
  workingCopyExpectedLock: 3,
  siloDna: envelope("dna:v1", HASH, { siloId: "silo-1" } as unknown as SiloDNA),
  siloPage: envelope("page:v1", PAGE_HASH, { siloPageId: "page-1" } as unknown as SiloPage),
  statuses: { siloDna: "approved", siloPage: "proposed" },
  decision: {
    actorUserId: "user-1", decidedAt: NOW, reason: "consolidar", territoryRef: TERRITORY,
    pillarArticleId: "art-A", supportArticleIds: ["art-B"], excludedArticleIds: [], publishedIdentityResolved: false,
  },
});

test("09 · a consolidação parte do snapshot remoto, não da proposta local", () => {
  const ui = executable(read(UI));
  const start = ui.indexOf("const consolidateSilos = async () => {");
  assert.ok(start > 0, "consolidateSilos existe");
  const body = ui.slice(start, ui.indexOf("\n  };", start));
  assert.match(body, /const consolidable = remoteSiloWorkingCopies/);
  assert.match(body, /remote\.workingCopy\.pillarSelection/);
  assert.match(body, /workingCopyExpectedLock: remote\.lockVersion/);
  assert.match(body, /territoryExpectedLock: territory\.lockVersion/);
  // O caminho legado do par não é usado para finalizar.
  assert.ok(!body.includes("persistArquitetoSiloPair"), "a consolidação não passa pelo caminho legado do par");
  assert.match(body, /consolidateRemoteSiloFromWorkingCopy/);
});

test("10 · o envelope carrega a proveniência remota da working copy", () => {
  const adapter = executable(read(ADAPTER));
  // O servidor confere `workingCopyRef`/`workingCopyLockVersion` contra a linha remota.
  assert.match(adapter, /assertSiloDnaMatchesConfirmedWorkingCopy\(\{/);
  assert.match(adapter, /workingCopyLockVersion: lockVersion/);
  const client = executable(read(CLIENT));
  const consolidate = client.slice(client.indexOf("export async function consolidateRemoteSiloFromWorkingCopy"));
  // O corpo chega pronto: nada é remontado no cliente.
  assert.match(consolidate, /JSON\.stringify\(body\)/);
});

test("11 · o retry reenvia exatamente o mesmo versionId", () => {
  const op = operation();
  const first = siloConsolidationRequestBody(op);
  const retry = siloConsolidationRequestBody(
    registerSiloConsolidationAttempt(markSiloConsolidationIndeterminate(op, "timeout")),
  );
  assert.equal(retry.siloDna.versionId, first.siloDna.versionId);
  assert.equal(retry.siloPage.versionId, first.siloPage.versionId);
});

test("12 · o retry reenvia exatamente o mesmo createdAt", () => {
  const op = operation();
  const first = siloConsolidationRequestBody(op);
  const retry = siloConsolidationRequestBody(registerSiloConsolidationAttempt(op));
  assert.equal(retry.siloDna.createdAt, first.siloDna.createdAt);
  assert.equal(retry.siloPage.createdAt, first.siloPage.createdAt);
  assert.equal(retry.siloDna.versionNumber, first.siloDna.versionNumber);
  assert.equal(retry.siloDna.previousVersionId, first.siloDna.previousVersionId);
});

test("13 · o retry reenvia exatamente o mesmo contentHash, statuses e locks", () => {
  const op = operation();
  const first = siloConsolidationRequestBody(op);
  const retry = siloConsolidationRequestBody(registerSiloConsolidationAttempt(op));
  assert.deepEqual(retryPreservesEnvelope(first, retry), { ok: true, divergent: [] });
  // E um envelope reconstruído do zero NÃO passa — é essa a diferença que a
  // RPC não reconheceria como replay.
  const rebuilt = { ...first, siloDna: { ...first.siloDna, versionId: "dna:v2", createdAt: "2026-09-02T19:00:00.000Z" } };
  const divergence = retryPreservesEnvelope(first, rebuilt);
  assert.equal(divergence.ok, false);
  assert.deepEqual(divergence.divergent, ["siloDna.versionId", "siloDna.createdAt"]);
});

test("14 · a operação é identificada por território e lock, não por sorteio", () => {
  const op = operation();
  assert.equal(op.operationId, buildSiloConsolidationOperationId(TERRITORY, 3));
  assert.equal(op.operationId, buildSiloConsolidationOperationId(TERRITORY, 3), "determinístico");
  assert.notEqual(op.operationId, buildSiloConsolidationOperationId(TERRITORY, 4), "outro lock é outra operação");
  // Falha indeterminada NÃO descarta a operação: o servidor pode ter commitado.
  const stuck = markSiloConsolidationIndeterminate(op, "timeout");
  assert.equal(stuck.state, "indeterminate");
  assert.equal(stuck.siloDna.versionId, op.siloDna.versionId);
});

// ===========================================================================
// 15–19 · APROVAÇÃO PRÓPRIA DA SILOPAGE
// ===========================================================================

const siloDnaFixture = (overrides: Partial<SiloDNA> = {}): SiloDNA => ({
  siloId: "silo-1",
  pillarArticleId: "art-A",
  supportArticleIds: ["art-B"],
  brandId: BRAND,
  ...overrides,
} as SiloDNA);

const siloPageFixture = (overrides: Partial<SiloPage> = {}): SiloPage => ({
  schemaVersion: 1,
  formationStatus: "formed",
  siloPageId: "page-1",
  brandId: BRAND,
  siloDnaRef: { entityId: "silo-1", versionId: "dna:v1", contentHash: HASH },
  siloId: "silo-1",
  territoryRef: TERRITORY,
  slug: "manicure",
  publicationStatus: "new",
  publishedUrl: null,
  publicationVerification: { status: "not_applicable", checkedAt: null, requestedUrl: null, resolvedUrl: null, declaredCanonical: null, httpStatus: null, sitemapUrl: null, sitemapMatch: null, message: null },
  h1: "Manicure",
  seoTitle: "Manicure",
  metaDescription: "Tudo sobre manicure",
  canonical: "https://exemplo.com/manicure",
  intro: "intro",
  sections: [{ heading: "s1", purpose: "p", targetArticleId: null }],
  cta: "cta",
  coverImageBrief: "",
  visualBriefing: "",
  breadcrumbs: [],
  pillarArticleId: "art-A",
  supportArticleIds: ["art-B"],
  indexationStatus: "index",
  alerts: [],
  confidence: 1,
  humanPendingDecisions: [],
  ...overrides,
} as unknown as SiloPage);

const approvalDecision = (overrides: Partial<SiloPageApprovalDecision> = {}): SiloPageApprovalDecision => ({
  actorUserId: "user-1",
  decidedAt: NOW,
  reason: "Página revisada e aprovada.",
  scope: "silo_page_approval",
  siloPageId: "page-1",
  siloPageVersionId: "page:v1",
  siloPageContentHash: PAGE_HASH,
  siloDnaVersionId: "dna:v1",
  territoryRef: TERRITORY,
  ...overrides,
});

const approve = (input: Partial<Parameters<typeof resolveSiloPageApprovalReadiness>[0]> = {}) =>
  resolveSiloPageApprovalReadiness({
    brandId: BRAND,
    territoryRef: TERRITORY,
    siloId: "silo-1",
    siloPage: siloPageFixture(),
    siloPageVersion: { versionId: "page:v1", contentHash: PAGE_HASH },
    siloDna: siloDnaFixture(),
    siloDnaVersion: { versionId: "dna:v1" },
    decision: approvalDecision(),
    actor: "human",
    ...input,
  });

test("15 · SiloPage aprovada exige decisão humana própria", () => {
  assert.equal(approve().state, "approved");
  const semDecisao = approve({ decision: null });
  assert.equal(semDecisao.state, "blocked");
  assert.ok(semDecisao.blockers.some(blocker => blocker.code === "SILO_PAGE_APPROVAL_NOT_HUMAN"));
  // IA não aprova.
  const porIa = approve({ actor: "ai" });
  assert.equal(porIa.state, "blocked");
  assert.ok(porIa.blockers.some(blocker => blocker.code === "SILO_PAGE_APPROVAL_NOT_HUMAN"));
});

test("16 · aprovar o SiloDNA NÃO aprova a SiloPage", () => {
  // Consolidação humana confirmada aprova o DNA; a página segue fail-closed
  // enquanto não houver readiness própria resolvida.
  const semGate = refuseStatusEscalation({
    siloDnaStatus: "approved",
    siloPageStatus: "approved",
    humanConsolidationConfirmed: true,
  });
  assert.deepEqual(semGate.map(item => item.code), ["SILO_PAGE_APPROVAL_GATE_MISSING"]);

  // Com a readiness própria resolvida, ela sobe.
  const comGate = refuseStatusEscalation({
    siloDnaStatus: "approved",
    siloPageStatus: "approved",
    humanConsolidationConfirmed: true,
    siloPageApproval: approve(),
  });
  assert.deepEqual(comGate, []);

  // Readiness bloqueada não vale como aprovação.
  const bloqueada = refuseStatusEscalation({
    siloDnaStatus: "approved",
    siloPageStatus: "approved",
    humanConsolidationConfirmed: true,
    siloPageApproval: approve({ decision: null }),
  });
  assert.deepEqual(bloqueada.map(item => item.code), ["SILO_PAGE_APPROVAL_GATE_MISSING"]);

  // E o SiloDNA continua exigindo a decisão dele.
  const semHumano = refuseStatusEscalation({
    siloDnaStatus: "approved",
    siloPageStatus: "proposed",
    humanConsolidationConfirmed: false,
  });
  assert.deepEqual(semHumano.map(item => item.code), ["SILO_DNA_APPROVAL_WITHOUT_HUMAN_DECISION"]);
});

test("17 · decisão sobre outra versão da página não aprova esta", () => {
  const outra = approve({ siloPageVersion: { versionId: "page:v2", contentHash: PAGE_HASH } });
  assert.equal(outra.state, "blocked");
  assert.ok(outra.blockers.some(blocker => blocker.code === "SILO_PAGE_APPROVAL_STALE"));
  // Hash diferente com o mesmo versionId também é outra página.
  const outroHash = approve({ siloPageVersion: { versionId: "page:v1", contentHash: `sha256:${"c".repeat(64)}` } });
  assert.ok(outroHash.blockers.some(blocker => blocker.code === "SILO_PAGE_APPROVAL_STALE"));
  // E o SiloDNA que a página materializa também precisa ser o decidido.
  const outroDna = approve({ siloDnaVersion: { versionId: "dna:v2" } });
  assert.ok(outroDna.blockers.some(blocker => blocker.code === "SILO_PAGE_APPROVAL_STALE"));
});

test("18 · o gate confere Brand, Território, Silo, siloDnaRef e composição", () => {
  assert.ok(approve({ brandId: "outra-brand" }).blockers.some(b => b.code === "SILO_PAGE_APPROVAL_BRAND_MISMATCH"));
  assert.ok(approve({ territoryRef: OTHER_TERRITORY }).blockers.some(b => b.code === "SILO_PAGE_APPROVAL_TERRITORY_MISMATCH"));
  assert.ok(approve({ siloId: "silo-9" }).blockers.some(b => b.code === "SILO_PAGE_APPROVAL_SILO_MISMATCH"));
  assert.ok(approve({ siloPage: siloPageFixture({ siloDnaRef: { entityId: "silo-1", versionId: "dna:v9", contentHash: HASH } }) })
    .blockers.some(b => b.code === "SILO_PAGE_APPROVAL_SILO_DNA_REF_MISMATCH"));
  // A página não redefine a arquitetura.
  assert.ok(approve({ siloPage: siloPageFixture({ pillarArticleId: "art-B" }) })
    .blockers.some(b => b.code === "SILO_PAGE_APPROVAL_PILLAR_MISMATCH"));
  assert.ok(approve({ siloPage: siloPageFixture({ supportArticleIds: ["art-Z"] }) })
    .blockers.some(b => b.code === "SILO_PAGE_APPROVAL_SUPPORTS_MISMATCH"));
});

test("19 · o gate exige estrutura publicável: slug, canonical e o corpo da página", () => {
  assert.ok(approve({ siloPage: siloPageFixture({ slug: " " }) }).blockers.some(b => b.code === "SILO_PAGE_APPROVAL_SLUG_MISSING"));
  assert.ok(approve({ siloPage: siloPageFixture({ canonical: null }) }).blockers.some(b => b.code === "SILO_PAGE_APPROVAL_CANONICAL_MISSING"));
  assert.ok(approve({ siloPage: siloPageFixture({ h1: "" }) }).blockers.some(b => b.code === "SILO_PAGE_APPROVAL_STRUCTURE_INCOMPLETE"));
  assert.ok(approve({ siloPage: siloPageFixture({ sections: [] }) }).blockers.some(b => b.code === "SILO_PAGE_APPROVAL_STRUCTURE_INCOMPLETE"));
  assert.ok(approve({ siloPage: siloPageFixture({ formationStatus: "draft" }) }).blockers.some(b => b.code === "SILO_PAGE_APPROVAL_STRUCTURE_INCOMPLETE"));
});

// ===========================================================================
// 20–24 · IDENTIDADE PUBLICADA, NARRATIVA, PROCEDÊNCIA E LEGADO
// ===========================================================================

const publicada = () => siloPageFixture({
  publicationStatus: "published",
  publishedUrl: "https://exemplo.com/manicure",
  publicationVerification: { status: "canonical_confirmed", checkedAt: NOW, requestedUrl: "https://exemplo.com/manicure", resolvedUrl: "https://exemplo.com/manicure", declaredCanonical: "https://exemplo.com/manicure", httpStatus: 200, sitemapUrl: null, sitemapMatch: true, message: null },
});

test("20 · slug publicado é preservado", () => {
  const bloqueada = approve({
    siloPage: publicada(),
    publishedPage: { slug: "manicure-antiga", canonical: "https://exemplo.com/manicure", publishedUrl: "https://exemplo.com/manicure", publicationStatus: "published" },
  });
  assert.ok(bloqueada.blockers.some(b => b.code === "SILO_PAGE_APPROVAL_PUBLISHED_IDENTITY_MUTATED"));
  assert.match(bloqueada.blockers.find(b => b.code === "SILO_PAGE_APPROVAL_PUBLISHED_IDENTITY_MUTATED")!.detail, /slug/);
});

test("21 · canonical e publishedUrl publicados são preservados", () => {
  const canonicalTrocado = approve({
    siloPage: publicada(),
    publishedPage: { slug: "manicure", canonical: "https://exemplo.com/outro", publishedUrl: "https://exemplo.com/manicure", publicationStatus: "published" },
  });
  assert.match(canonicalTrocado.blockers.find(b => b.code === "SILO_PAGE_APPROVAL_PUBLISHED_IDENTITY_MUTATED")!.detail, /canonical/);

  const urlTrocada = approve({
    siloPage: publicada(),
    publishedPage: { slug: "manicure", canonical: "https://exemplo.com/manicure", publishedUrl: "https://exemplo.com/outro", publicationStatus: "published" },
  });
  assert.match(urlTrocada.blockers.find(b => b.code === "SILO_PAGE_APPROVAL_PUBLISHED_IDENTITY_MUTATED")!.detail, /publishedUrl/);

  // Publicada com verificação não resolvida não é aprovável.
  const semVerificacao = approve({
    siloPage: siloPageFixture({ publicationStatus: "published", publishedUrl: "https://exemplo.com/manicure" }),
  });
  assert.ok(semVerificacao.blockers.some(b => b.code === "SILO_PAGE_APPROVAL_PUBLICATION_UNVERIFIED"));

  // Idêntica à publicada, verificada: aprova.
  assert.equal(approve({
    siloPage: publicada(),
    publishedPage: { slug: "manicure", canonical: "https://exemplo.com/manicure", publishedUrl: "https://exemplo.com/manicure", publicationStatus: "published" },
  }).state, "approved");
});

test("22 · a narrativa territorial e a versão/hash do ArticleDNA seguem amarradas no servidor", () => {
  const adapter = executable(read(ADAPTER));
  // Narrativa: o Território é a autoridade e o snapshot é conferido.
  assert.match(adapter, /narrative: territory\.narrative/);
  assert.match(adapter, /assertSiloDnaMatchesConfirmedTerritory\(\{/);
  // ArticleDNA: versão e hash remotos, não os declarados pelo chamador.
  assert.match(adapter, /refuseArticleVersionBinding\(\{ workingCopy, remoteVersions: articleVersions \}\)/);
  assert.match(adapter, /loadArticleVersions\(context, workingCopy\)/);
});

test("23 · working copy de território consolidado fica somente-leitura", () => {
  const consolidados = consolidatedTerritoryRefsOf([
    { territoryRef: TERRITORY, territory: { lifecycleStatus: "consolidated" } },
    { territoryRef: OTHER_TERRITORY, territory: { lifecycleStatus: "confirmed" } },
  ]);
  assert.deepEqual(consolidados, [TERRITORY]);
  assert.equal(siloWorkingCopyIsReadOnly(remote(), consolidados), true);
  assert.equal(siloWorkingCopyIsReadOnly(remote({ territoryRef: OTHER_TERRITORY }), consolidados), false);

  const resolved = resolveAuthoritativeSiloWorkingCopies({
    remote: [remote()],
    proposals: [],
    consolidatedTerritoryRefs: consolidados,
  });
  assert.equal(resolved[0].readOnly, true);

  // E o servidor tem a palavra final: consumo já ocorrido vira read-only na UI.
  const consumida = classifySiloWorkingCopyFailure({ code: "WORKING_COPY_ALREADY_CONSUMED" });
  assert.equal(consumida.outcome, "READ_ONLY_ALREADY_CONSOLIDATED");
  assert.equal(consumida.reloadRemote, true);

  const ui = executable(read(UI));
  assert.match(ui, /siloWorkingCopyIsReadOnly\(remote, consolidatedTerritoryRefs\)/);
});

test("24 · rotas legadas seguem sem finalizar, e nenhum provider é chamado", () => {
  const pair = executable(read(PAIR_ROUTE));
  // Guard REAL da rota: qualquer status diferente de rascunho é recusado, e o
  // helper repete a recusa para fechar o bypass por dentro.
  const draftOnly = "!== " + JSON.stringify("draft");
  assert.ok(pair.includes(draftOnly), "a rota do par recusa status acima de rascunho");
  assert.ok(pair.includes("LEGACY_" + "SILO_PAIR_FINALIZATION_DISABLED"), "com código próprio");
  assert.ok(executable(read(PAIR_HELPER)).includes(draftOnly), "o helper fecha o mesmo caso");
  assert.ok(!pair.includes("persist_silo_from_working_copy_atomic"), "o legado não chama a RPC canônica");
  const silos = executable(read(SILOS_ROUTE));
  assert.ok(!silos.includes("persist_silo_from_working_copy_atomic"), "o draft manual não finaliza consolidação");

  // PROVIDER_CALLS = 0: nada no caminho novo chama IA ou SERP.
  for (const relative of [
    "lib/arquiteto/silo-page-approval.ts",
    "lib/arquiteto/silo-consolidation-operation.ts",
    "lib/arquiteto/silo-working-copy-bridge.ts",
    ADAPTER,
  ]) {
    const source = executable(read(relative));
    for (const forbidden of ["dataforseo", "deepseek", "googleads", "openai"]) {
      assert.ok(!source.toLowerCase().includes(forbidden), `${relative} não chama ${forbidden}`);
    }
  }
});

test("25 · território de uma proposta local é lido dos ArticleDNAs, nunca inventado", () => {
  const concordam = resolveProposalTerritoryRef({
    articleIds: ["art-A", "art-B"],
    territoryRefByArticleId: new Map([["art-A", TERRITORY], ["art-B", TERRITORY]]),
  });
  assert.deepEqual(concordam, { territoryRef: TERRITORY, issue: null });

  // Dois territórios no mesmo grupo é ambiguidade, não empate a desempatar.
  const divergem = resolveProposalTerritoryRef({
    articleIds: ["art-A", "art-B"],
    territoryRefByArticleId: new Map([["art-A", TERRITORY], ["art-B", OTHER_TERRITORY]]),
  });
  assert.deepEqual(divergem, { territoryRef: null, issue: "AMBIGUOUS_TERRITORY" });

  const nenhum = resolveProposalTerritoryRef({ articleIds: ["art-A"], territoryRefByArticleId: new Map() });
  assert.deepEqual(nenhum, { territoryRef: null, issue: "NO_TERRITORY" });
});
