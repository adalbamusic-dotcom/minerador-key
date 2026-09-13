import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import type { SiloDNA, SiloPage } from "../lib/arquiteto/contracts.ts";
import { siloPageApprovalPreflight } from "../lib/arquiteto/silo-page-approval.ts";
import {
  plannedSiloPageCanonical,
  resolveSiloPagePublicationIdentity,
} from "../lib/arquiteto/silo-page-publication-identity.ts";

/**
 * A APROVAÇÃO DA SILOPAGE, ANTES DO CLIQUE.
 *
 * As três páginas da marca ficaram em `proposed` não por falta de decisão
 * humana, mas porque o artefato gravado nunca recebeu o que a varredura do
 * site já tinha observado — e a recusa só aparecia depois de confirmar.
 */

const BRAND = "09762023-d0d4-4c24-b34e-d0fdfd43f891";
const TERRITORY = "territory:83ce07d2-bf31-4d7f-bca4-3a42006194fe";
const HASH = "sha256:dna";
const PAGE_HASH = "sha256:page";

const siloDna = (): SiloDNA => ({
  siloId: "silo-1",
  pillarArticleId: "art-A",
  supportArticleIds: ["art-B"],
  brandId: BRAND,
  territoryRef: TERRITORY,
} as unknown as SiloDNA);

const siloPage = (overrides: Partial<SiloPage> = {}): SiloPage => ({
  schemaVersion: 1,
  formationStatus: "formed",
  siloPageId: "page-1",
  brandId: BRAND,
  siloDnaRef: { entityId: "silo-1", versionId: "dna:v1", contentHash: HASH },
  siloId: "silo-1",
  territoryRef: TERRITORY,
  slug: "rotina-skincare-facial",
  publicationStatus: "new",
  publishedUrl: null,
  publicationVerification: { status: "not_applicable", checkedAt: null, requestedUrl: null, resolvedUrl: null, declaredCanonical: null, httpStatus: null, sitemapUrl: null, sitemapMatch: null, message: null },
  h1: "Rotina",
  seoTitle: "Rotina",
  metaDescription: "Rotina de skincare facial",
  canonical: null,
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

const preflight = (pagina: SiloPage) => siloPageApprovalPreflight({
  brandId: BRAND,
  territoryRef: TERRITORY,
  siloId: "silo-1",
  siloPage: pagina,
  siloPageVersion: { versionId: "page:v1", contentHash: PAGE_HASH },
  siloDna: siloDna(),
  siloDnaVersion: { versionId: "dna:v1" },
});

/** Aplica a identidade resolvida à página, como a confirmação faria. */
const comIdentidade = (pagina: SiloPage, identidade: ReturnType<typeof resolveSiloPagePublicationIdentity>) =>
  siloPage({
    ...pagina,
    canonical: identidade.canonical,
    publicationStatus: identidade.publicationStatus,
    publishedUrl: identidade.publishedUrl,
    publicationVerification: identidade.publicationVerification,
  });

/* ============ A · publicada com canonical confirmado no catálogo ======== */

test("A · página publicada com canonical confirmado fica pronta para aprovar", () => {
  const identidade = resolveSiloPagePublicationIdentity({
    slug: "rotina-skincare-facial",
    brandSiteUrl: "https://careglow.com.br",
    observation: {
      verificationStatus: "canonical_confirmed",
      resolvedUrl: "https://careglow.com.br/rotina-skincare-facial",
      declaredCanonicalUrl: "https://careglow.com.br/rotina-skincare-facial",
      normalizedCanonicalUrl: "careglow.com.br/rotina-skincare-facial",
      lastVerifiedAt: "2026-09-01T00:00:00.000Z",
    },
    current: { publicationStatus: "published", publishedUrl: "https://careglow.com.br/rotina-skincare-facial", canonical: "https://careglow.com.br/rotina-skincare-facial" },
  });
  assert.equal(identidade.publicationVerification.status, "canonical_confirmed");
  assert.equal(identidade.canonicalIsPlanned, false);

  // Sem transportar a identidade, a portaria recusa por "não verificada" —
  // sobre uma página que o catálogo interno já confirmou.
  const semTransporte = preflight(siloPage({ publicationStatus: "published", publishedUrl: identidade.publishedUrl, canonical: identidade.canonical }));
  assert.equal(semTransporte.state, "blocked");
  assert.ok(semTransporte.blockers.some(item => item.code === "SILO_PAGE_APPROVAL_PUBLICATION_UNVERIFIED"));

  assert.equal(preflight(comIdentidade(siloPage(), identidade)).state, "approved");
});

/* ============== B · página nova, canonical planejado ==================== */

test("B · página nova é aprovável com canonical planejado, e continua não publicada", () => {
  const identidade = resolveSiloPagePublicationIdentity({
    slug: "skin-care-para-peles-oleosas",
    brandSiteUrl: "https://careglow.com.br",
    observation: null,
    current: { publicationStatus: "new", publishedUrl: null, canonical: null },
  });
  assert.equal(identidade.canonical, "https://careglow.com.br/skin-care-para-peles-oleosas");
  assert.equal(identidade.canonicalIsPlanned, true);
  assert.equal(identidade.publicationStatus, "new", "aprovado não é publicado");

  const pagina = comIdentidade(siloPage({ slug: "skin-care-para-peles-oleosas" }), identidade);
  assert.equal(preflight(pagina).state, "approved");
  assert.equal(pagina.publishedUrl, null);
});

test("B2 · sem origem declarada pela Brand não se inventa endereço", () => {
  assert.equal(plannedSiloPageCanonical({ brandSiteUrl: null, slug: "qualquer" }), null);
  const identidade = resolveSiloPagePublicationIdentity({ slug: "qualquer", brandSiteUrl: null, observation: null, current: null });
  assert.equal(identidade.canonical, null);
  assert.ok(preflight(comIdentidade(siloPage({ slug: "qualquer" }), identidade)).blockers
    .some(item => item.code === "SILO_PAGE_APPROVAL_CANONICAL_MISSING"));
});

/* =========== C · canonical declarado divergente do catálogo ============= */

test("C · canonical declarado divergente do catálogo bloqueia, sem escolher lado", () => {
  const identidade = resolveSiloPagePublicationIdentity({
    slug: "rotina-skincare-facial",
    brandSiteUrl: "https://careglow.com.br",
    observation: {
      verificationStatus: "canonical_confirmed",
      resolvedUrl: "https://careglow.com.br/rotina-skincare-facial",
      declaredCanonicalUrl: "https://careglow.com.br/outra-rotina",
      normalizedCanonicalUrl: "careglow.com.br/outra-rotina",
      lastVerifiedAt: "2026-09-01T00:00:00.000Z",
    },
    current: { publicationStatus: "published", publishedUrl: "https://careglow.com.br/rotina-skincare-facial", canonical: "https://careglow.com.br/rotina-skincare-facial" },
  });
  assert.equal(identidade.publicationVerification.status, "canonical_mismatch");
  // O que a página declara é PRESERVADO: catálogo não reescreve identidade.
  assert.equal(identidade.canonical, "https://careglow.com.br/rotina-skincare-facial");
  assert.equal(preflight(comIdentidade(siloPage(), identidade)).state, "blocked");
});

/* ============ D · evidência fraca não desbloqueia publicação ============ */

test("D · status fraco do catálogo não confirma identidade publicada", () => {
  for (const fraco of ["discovered", "redirect", "noindex"]) {
    const identidade = resolveSiloPagePublicationIdentity({
      slug: "rotina-skincare-facial",
      brandSiteUrl: "https://careglow.com.br",
      observation: {
        verificationStatus: fraco as never,
        resolvedUrl: "https://careglow.com.br/rotina-skincare-facial",
        declaredCanonicalUrl: null,
        normalizedCanonicalUrl: null,
        lastVerifiedAt: "2026-09-01T00:00:00.000Z",
      },
      current: { publicationStatus: "published", publishedUrl: "https://careglow.com.br/rotina-skincare-facial", canonical: "https://careglow.com.br/rotina-skincare-facial" },
    });
    const resultado = preflight(comIdentidade(siloPage(), identidade));
    assert.equal(resultado.state, "blocked", `"${fraco}" não pode aprovar identidade publicada`);
    assert.ok(resultado.blockers.some(item => item.code === "SILO_PAGE_APPROVAL_PUBLICATION_UNVERIFIED"));
  }
});

/* ============ E · o preflight aparece ANTES do clique =================== */

test("E · a aba Silos mostra o preflight antes de confirmar", () => {
  const painel = readFileSync("modules/arquiteto/architecture-panel.tsx", "utf8");
  const workspace = readFileSync("modules/arquiteto/arquiteto-workspace.tsx", "utf8");
  assert.match(painel, /data-testid="architect-silopage-preflight"/);
  assert.match(painel, /SILO_PAGE_APPROVAL_READY = NO/, "o bloqueio precisa ser nomeado, não genérico");
  for (const campo of ["SiloDNA:", "SiloPage:", "Canonical:", "Publicação:"]) {
    assert.ok(painel.includes(campo), `falta o campo ${campo} no preflight`);
  }
  // A mesa reusa as autoridades que já existem — não escreve regra nova.
  assert.match(workspace, /siloPageApprovalPreflight\(\{/);
  assert.match(workspace, /resolveSiloPagePublicationIdentity\(\{/);
  assert.match(workspace, /preflight=\{siloPagePreflight\}/);
});

/* ====== cenário planejado: publicação não é cobrada, nem apagada ======== */

/**
 * ARQUITETURA PLANEJADA NÃO PROVA PUBLICAÇÃO.
 *
 * Esta passada fecha SILOS → ARTIGOS → LINKS sobre páginas que ainda não
 * existem no site. Exigir prova de publicação bloquearia o fechamento por um
 * fato que não existe — mas a capacidade continua inteira, e o padrão da
 * portaria continua exigindo.
 */

test("o padrão continua EXIGINDO verificação: quem não declara nada não muda", () => {
  const publicadaSemVerificar = siloPage({
    publicationStatus: "published",
    publishedUrl: "https://careglow.com.br/rotina-skincare-facial",
    canonical: "https://careglow.com.br/rotina-skincare-facial",
  });
  assert.equal(preflight(publicadaSemVerificar).state, "blocked");
  assert.ok(preflight(publicadaSemVerificar).blockers.some(item => item.code === "SILO_PAGE_APPROVAL_PUBLICATION_UNVERIFIED"));
});

test("cenário planejado libera a verificação de publicação, sem tocar no resto", () => {
  const publicadaSemVerificar = siloPage({
    publicationStatus: "published",
    publishedUrl: "https://careglow.com.br/rotina-skincare-facial",
    canonical: "https://careglow.com.br/rotina-skincare-facial",
  });
  const resultado = siloPageApprovalPreflight({
    brandId: BRAND,
    territoryRef: TERRITORY,
    siloId: "silo-1",
    siloPage: publicadaSemVerificar,
    siloPageVersion: { versionId: "page:v1", contentHash: PAGE_HASH },
    siloDna: siloDna(),
    siloDnaVersion: { versionId: "dna:v1" },
    publishedVerificationRequired: false,
  });
  assert.equal(resultado.state, "approved");
});

test("nem o cenário planejado aprova canonical divergente", () => {
  const divergente = siloPage({
    publicationStatus: "published",
    publishedUrl: "https://careglow.com.br/rotina-skincare-facial",
    canonical: "https://careglow.com.br/rotina-skincare-facial",
    publicationVerification: {
      status: "canonical_mismatch", checkedAt: null, requestedUrl: null, resolvedUrl: null,
      declaredCanonical: "https://careglow.com.br/outra", httpStatus: null, sitemapUrl: null, sitemapMatch: null, message: null,
    },
  } as unknown as Partial<SiloPage>);
  const resultado = siloPageApprovalPreflight({
    brandId: BRAND,
    territoryRef: TERRITORY,
    siloId: "silo-1",
    siloPage: divergente,
    siloPageVersion: { versionId: "page:v1", contentHash: PAGE_HASH },
    siloDna: siloDna(),
    siloDnaVersion: { versionId: "dna:v1" },
    publishedVerificationRequired: false,
  });
  // Dois endereços declarados para a mesma página é contradição do artefato,
  // não "falta verificar a publicação".
  assert.equal(resultado.state, "blocked");
});

test("o cenário é declarado no código e aplicado no SERVIDOR, não pelo cliente", () => {
  const cenario = readFileSync("lib/arquiteto/publication-scenario.ts", "utf8");
  const adapter = readFileSync("lib/server/arquiteto-silo-consolidation-adapter.ts", "utf8");
  const rota = readFileSync("app/api/arquiteto/silo-consolidation/route.ts", "utf8");
  assert.match(cenario, /export const CURRENT_SCENARIO_REQUIRES_PUBLISHED_VERIFICATION = false;/);
  assert.match(adapter, /publishedVerificationRequired: CURRENT_SCENARIO_REQUIRES_PUBLISHED_VERIFICATION/);
  // Aceitar a bandeira no corpo deixaria a tela relaxar o próprio portão.
  assert.ok(!rota.includes("publishedVerificationRequired"));
});

test("a capacidade de reconciliar publicados continua inteira", () => {
  const identidade = readFileSync("lib/arquiteto/silo-page-publication-identity.ts", "utf8");
  const aprovacao = readFileSync("lib/arquiteto/silo-page-approval.ts", "utf8");
  for (const capacidade of ["canonical_mismatch", "SiteCatalogObservation", "plannedSiloPageCanonical"]) {
    assert.ok(identidade.includes(capacidade), `a capacidade ${capacidade} não pode ser apagada`);
  }
  for (const codigo of ["SILO_PAGE_APPROVAL_PUBLICATION_UNVERIFIED", "SILO_PAGE_APPROVAL_PUBLISHED_URL_MISSING",
    "SILO_PAGE_APPROVAL_PUBLISHED_IDENTITY_MUTATED"]) {
    assert.ok(aprovacao.includes(codigo), `o bloqueio ${codigo} continua existindo`);
  }
});

/* ============ Links não escreve ArticleDNA ============================== */

test("Confirmar links internos não altera ArticleDNA, SiloDNA nem SiloPage", () => {
  const workspace = readFileSync("modules/arquiteto/arquiteto-workspace.tsx", "utf8");
  const aprovacao = workspace.slice(
    workspace.indexOf("const handleApproveLinks"),
    workspace.indexOf("const linkNodeById"),
  );
  assert.ok(aprovacao.length > 0);
  for (const escrita of ["persistArquitetoArtifact", "setAcceptedArticleDnas", "setAcceptedSiloDnas", "setAcceptedSiloPages"]) {
    assert.ok(!aprovacao.includes(escrita), `Links não pode escrever ${escrita}: a saída da fase é o InternalLinkGraph`);
  }
  assert.match(aprovacao, /persistInternalLinkGraph\(\{/);
});

/* ====== F/G · uma ação fecha os dois, sem sucessora desnecessária ======= */

test("F · Confirmar arquitetura fecha SiloDNA e SiloPage juntos", () => {
  const workspace = readFileSync("modules/arquiteto/arquiteto-workspace.tsx", "utf8");
  assert.match(workspace, /statuses: \{ siloDna: "approved", siloPage: "approved" \}/);
  assert.match(workspace, /siloPageApproval: \{/, "a decisão da página viaja com a da arquitetura");
  // Não existe segundo botão: a fase tem uma ação final só.
  assert.ok(!workspace.includes("Aprovar SiloPage"));
});

test("G · a identidade observada CHEGA ao artefato persistido", () => {
  const workspace = readFileSync("modules/arquiteto/arquiteto-workspace.tsx", "utf8");
  // Computar a identidade e não gravá-la era o defeito: as páginas ficavam
  // consolidadas e não aprováveis, sem que nada humano estivesse faltando.
  for (const campo of ["canonical: identidadePublicavel.canonical", "publicationStatus: identidadePublicavel.publicationStatus",
    "publishedUrl: identidadePublicavel.publishedUrl", "publicationVerification: identidadePublicavel.publicationVerification"]) {
    assert.ok(workspace.includes(campo), `a identidade precisa chegar ao payload: ${campo}`);
  }
});
