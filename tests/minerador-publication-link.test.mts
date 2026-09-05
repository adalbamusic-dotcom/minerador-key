import assert from "node:assert/strict";
import test from "node:test";
import { applyPublicationLinkAction, isPublicationProtected, readPublicationLink, type PublicationLinkEvidence } from "../lib/minerador/publication-link.ts";

const baseEvidence: PublicationLinkEvidence = {
  brandId: "00000000-0000-4000-8000-000000000001",
  catalogEntryId: "00000000-0000-4000-8000-000000000002",
  sourceUrl: "https://example.com/seo-para-clinicas",
  resolvedUrl: "https://example.com/seo-para-clinicas",
  declaredCanonicalUrl: "https://example.com/seo-para-clinicas",
  urlSituation: "canonical_confirmed",
  publicationStatus: "not_confirmed",
  keywordUrlRelation: "candidate_primary",
  suggestedRole: "possible_primary",
  lastCheckedAt: "2026-08-20T12:00:00.000Z",
};

test("vínculo distingue livre, candidata, verificada e publicação formal", () => {
  assert.equal(readPublicationLink({ status: "bruto", evidence: null }).state, "free");
  assert.equal(readPublicationLink({ status: "bruto", evidence: { sourceUrl: baseEvidence.sourceUrl } }).state, "candidate");
  assert.equal(readPublicationLink({ status: "bruto", evidence: baseEvidence }).state, "verified");

  const legacy = { ...baseEvidence, publicationStatus: "published" };
  assert.equal(readPublicationLink({ status: "publicado", evidence: legacy }).state, "legacy_unverified");
  assert.equal(readPublicationLink({ status: "bruto", evidence: {
    ...legacy,
    publicationConfirmedBy: "user-1",
    publicationConfirmedAt: "2026-08-20T12:01:00.000Z",
  } }).state, "published");
});

test("confirmação humana preserva URL, separa status editorial e promove papel primário candidato", () => {
  const semantic = { site_origin: baseEvidence, site_origins: [baseEvidence], unrelated: "preserved" };
  const result = applyPublicationLinkAction(semantic, {
    action: "confirm",
    actorId: "user-1",
    changedAt: "2026-08-20T12:01:00.000Z",
    status: "aprovado",
  });

  assert.equal(result.changed, true);
  const origin = result.semantic.site_origin as PublicationLinkEvidence;
  assert.equal(origin.declaredCanonicalUrl, baseEvidence.declaredCanonicalUrl);
  assert.equal(origin.publicationStatus, "published");
  assert.equal(origin.keywordUrlRelation, "confirmed_primary");
  assert.equal(origin.publicationConfirmedBy, "user-1");
  assert.equal(result.semantic.unrelated, "preserved");
  assert.equal(readPublicationLink({ status: "aprovado", evidence: origin }).label, "Publicada · Principal");
});

test("correção de publicação legada preserva URL e permite nova confirmação", () => {
  const legacy = { ...baseEvidence, publicationStatus: "published" };
  const result = applyPublicationLinkAction({ site_origin: legacy, site_origins: [legacy] }, {
    action: "correct_legacy",
    actorId: "user-1",
    changedAt: "2026-08-20T12:02:00.000Z",
    status: "publicado",
  });

  assert.equal(result.changed, true);
  const origin = result.semantic.site_origin as PublicationLinkEvidence;
  assert.equal(origin.sourceUrl, legacy.sourceUrl);
  assert.equal(origin.publicationStatus, "not_confirmed");
  assert.equal(origin.publicationCorrectedBy, "user-1");
  assert.equal(readPublicationLink({ status: "publicado", evidence: origin }).state, "candidate");
});

test("correção legada sem URL retorna vínculo livre", () => {
  const result = applyPublicationLinkAction({ site_origin: { brandId: baseEvidence.brandId, publicationStatus: "published" } }, {
    action: "correct_legacy",
    actorId: "user-1",
    changedAt: "2026-08-20T12:04:00.000Z",
    status: "publicado",
  });
  assert.equal(readPublicationLink({ status: "publicado", evidence: result.semantic.site_origin as PublicationLinkEvidence }).state, "free");
});

test("desvincular publicação não remove a URL nem cria novo caminho", () => {
  const published = {
    ...baseEvidence,
    publicationStatus: "published",
    keywordUrlRelation: "confirmed_primary",
    publicationConfirmedBy: "user-1",
    publicationConfirmedAt: "2026-08-20T12:01:00.000Z",
  };
  const result = applyPublicationLinkAction({ site_origin: published }, {
    action: "unlink",
    actorId: "user-1",
    changedAt: "2026-08-20T12:03:00.000Z",
    status: "aprovado",
  });

  const origin = result.semantic.site_origin as PublicationLinkEvidence;
  assert.equal(origin.sourceUrl, published.sourceUrl);
  assert.equal(origin.declaredCanonicalUrl, published.declaredCanonicalUrl);
  assert.equal(origin.publicationStatus, "not_confirmed");
  assert.equal(origin.publicationUnlinkedBy, "user-1");
  assert.equal(readPublicationLink({ status: "aprovado", evidence: origin }).state, "verified");
});

test("publicação formal continua protegida mesmo com status editorial aprovado", () => {
  const published = {
    ...baseEvidence,
    publicationStatus: "published",
    keywordUrlRelation: "confirmed_secondary",
    publicationConfirmedBy: "user-1",
    publicationConfirmedAt: "2026-08-20T12:01:00.000Z",
  };
  const view = readPublicationLink({ status: "aprovado", evidence: published });
  assert.equal(view.label, "Publicada · Secundária");
  assert.equal(isPublicationProtected({ status: "aprovado", evidence: published }), true);
});

test("não há URL reconstruída nem provider real no vínculo", async () => {
  const workspace = await import("node:fs/promises").then(fs => fs.readFile(new URL("../modules/minerador/minerador-workspace.tsx", import.meta.url), "utf8"));
  assert.match(workspace, /const getCanonicalUrl = \(item: KeywordItem\) => \{/);
  assert.match(workspace, /declaredCanonicalUrl \|\| evidence\?\.resolvedUrl \|\| evidence\?\.sourceUrl/);
  assert.doesNotMatch(workspace, /activeBrand\.site_url[\s\S]*toSlug\(item\.keyword\)/);
});

test("Publicado não é opção ativa e sinais CSV não promovem publicação", async () => {
  const workspace = await import("node:fs/promises").then(fs => fs.readFile(new URL("../modules/minerador/minerador-workspace.tsx", import.meta.url), "utf8"));
  const statusCell = workspace.slice(workspace.indexOf("{/* Status Dropdown */}"), workspace.indexOf("<KeywordTableRowResizeHandle", workspace.indexOf("{/* Status Dropdown */}")));
  assert.doesNotMatch(statusCell, /value=\"publicado\"/);
  assert.match(workspace, /allowPublishedWorkflowStatus=\{false\}/);
  assert.doesNotMatch(workspace, /handleBatchPublish/);
  assert.match(workspace, /if \(isLegacyPublishedStatus\(s\)\) publicationSignal = \"published\"/);
  assert.doesNotMatch(workspace, /statusVal = s;/);
  assert.match(workspace, /Conferir página/);
  assert.match(workspace, /handleCheckWithSite = async \(singleKeywordId\?\: string\)/);
});
