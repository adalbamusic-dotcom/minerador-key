import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  plannedSiloPageCanonical,
  resolveSiloPagePublicationIdentity,
} from "../lib/arquiteto/silo-page-publication-identity.ts";

/**
 * A EVIDÊNCIA JÁ EXISTIA — o artefato é que não a recebia.
 *
 * O gate da SiloPage cobra `canonical` e `publicationVerification`. O
 * construtor determinístico emitia `null` e `not_checked`, e por isso três
 * páginas consolidadas ficavam eternamente não aprováveis. Este módulo
 * TRANSPORTA o que o catálogo do site já observou; ele não vai à rede.
 */

const marca = "https://exemplo.com.br";

test("página publicada e confirmada no catálogo fecha a verificação", () => {
  const identidade = resolveSiloPagePublicationIdentity({
    slug: "rotina-skincare-facial",
    brandSiteUrl: marca,
    observation: {
      verificationStatus: "canonical_confirmed",
      resolvedUrl: "https://exemplo.com.br/rotina-skincare-facial",
      declaredCanonicalUrl: "https://exemplo.com.br/rotina-skincare-facial",
      normalizedCanonicalUrl: "exemplo.com.br/rotina-skincare-facial",
      lastVerifiedAt: "2026-09-01T00:00:00.000Z",
    },
  });
  assert.equal(identidade.publicationVerification.status, "canonical_confirmed");
  assert.equal(identidade.publicationStatus, "published");
  assert.equal(identidade.canonical, "https://exemplo.com.br/rotina-skincare-facial");
  assert.equal(identidade.canonicalIsPlanned, false);
});

test("página nova recebe canonical PLANEJADO, e planejado não é publicado", () => {
  const identidade = resolveSiloPagePublicationIdentity({
    slug: "skin-care-para-peles-oleosas",
    brandSiteUrl: marca,
    observation: null,
  });
  assert.equal(identidade.canonical, "https://exemplo.com.br/skin-care-para-peles-oleosas");
  assert.equal(identidade.canonicalIsPlanned, true, "a distinção precisa sobreviver ao retorno");
  assert.equal(identidade.publicationStatus, "new");
  assert.equal(identidade.publishedUrl, null);
  // `not_applicable` é terminal e correto: não há publicação a verificar.
  assert.equal(identidade.publicationVerification.status, "not_applicable");
});

test("o domínio nunca é escrito no código: sem origem declarada não há canonical", () => {
  assert.equal(plannedSiloPageCanonical({ brandSiteUrl: null, slug: "qualquer" }), null);
  assert.equal(plannedSiloPageCanonical({ brandSiteUrl: marca, slug: "/" }), null);
  // A origem vem da Brand, seja qual for.
  assert.equal(
    plannedSiloPageCanonical({ brandSiteUrl: "https://outra-marca.io", slug: "x" }),
    "https://outra-marca.io/x",
  );
});

test("status sem equivalente honesto NÃO destrava a aprovação", () => {
  for (const status of ["discovered", "unverified", "canonical_missing", "redirect", "noindex"]) {
    const identidade = resolveSiloPagePublicationIdentity({
      slug: "pagina", brandSiteUrl: marca,
      observation: { verificationStatus: status, resolvedUrl: null, declaredCanonicalUrl: null, normalizedCanonicalUrl: null },
    });
    assert.equal(identidade.publicationVerification.status, "not_checked", `"${status}" não pode virar status forte`);
    assert.ok(identidade.publicationVerification.message, `"${status}" precisa dizer por quê`);
  }
});

test("identidade publicada existente é preservada, não reescrita", () => {
  const identidade = resolveSiloPagePublicationIdentity({
    slug: "pagina-no-ar",
    brandSiteUrl: marca,
    // Catálogo sem canonical declarado: o que a página já dizia prevalece.
    observation: {
      verificationStatus: "accessible",
      resolvedUrl: "https://exemplo.com.br/pagina-no-ar",
      declaredCanonicalUrl: null,
      normalizedCanonicalUrl: null,
    },
    current: {
      publicationStatus: "published",
      publishedUrl: "https://exemplo.com.br/pagina-no-ar",
      canonical: "https://exemplo.com.br/canonical-antigo",
    },
  });
  assert.equal(identidade.canonical, "https://exemplo.com.br/canonical-antigo");
  assert.equal(identidade.publicationVerification.status, "accessible");
});

test("a consolidação usa a identidade resolvida sem reescrever o que existe", () => {
  const consolidacao = readFileSync("lib/arquiteto/silo-consolidation.ts", "utf8");
  const workspace = readFileSync("modules/arquiteto/arquiteto-workspace.tsx", "utf8");
  // Preenche o vazio; nunca sobrepõe canonical já declarado pela página.
  assert.match(consolidacao, /canonical: existing\?\.canonical \?\? publishedOrigin\?\.publishedCanonical \?\? resolvedIdentity\?\.canonical \?\? null/);
  // A verificação resolvida prevalece: a gravada é o retrato de antes da varredura.
  assert.match(consolidacao, /publicationVerification: resolvedIdentity\?\.publicationVerification \?\? existing\?\.publicationVerification/);
  assert.match(workspace, /const identidadePublicavel = resolveSiloPagePublicationIdentity\(\{/);
  assert.match(workspace, /brandSiteUrl: brands\.find\(item => item\.id === selectedBrandId\)\?\.site_url \?\? null/);
});

/* ---- auditoria §6 · divergência entre artefato e catálogo é bloqueio ----- */

test("canonical já declarado pela SiloPage não é reescrito pelo catálogo", () => {
  const resultado = resolveSiloPagePublicationIdentity({
    slug: "anti-idade-e-retinol",
    brandSiteUrl: "https://careglow.com.br",
    observation: {
      verificationStatus: "canonical_confirmed",
      resolvedUrl: "https://careglow.com.br/anti-idade-e-retinol",
      declaredCanonicalUrl: "https://careglow.com.br/outro-endereco",
      normalizedCanonicalUrl: null,
    },
    current: {
      publicationStatus: "published",
      publishedUrl: "https://careglow.com.br/anti-idade-e-retinol",
      canonical: "https://careglow.com.br/anti-idade-e-retinol",
    },
  });

  // O que a página declara sobrevive — o catálogo não sobrescreve identidade
  // publicada em silêncio.
  assert.equal(resultado.canonical, "https://careglow.com.br/anti-idade-e-retinol");
  // E a divergência não some: vira o status que o gate consulta para recusar.
  assert.equal(resultado.publicationVerification.status, "canonical_mismatch");
  assert.match(resultado.publicationVerification.message || "", /outro-endereco/);
  assert.match(resultado.reason, /divergente/i);
});

test("sem divergência, o catálogo continua preenchendo o vazio", () => {
  const semCanonical = resolveSiloPagePublicationIdentity({
    slug: "anti-idade-e-retinol",
    brandSiteUrl: "https://careglow.com.br",
    observation: {
      verificationStatus: "canonical_confirmed",
      resolvedUrl: "https://careglow.com.br/anti-idade-e-retinol",
      declaredCanonicalUrl: "https://careglow.com.br/anti-idade-e-retinol",
      normalizedCanonicalUrl: null,
    },
    current: { publicationStatus: "published", publishedUrl: null, canonical: null },
  });
  assert.equal(semCanonical.canonical, "https://careglow.com.br/anti-idade-e-retinol");
  assert.equal(semCanonical.publicationVerification.status, "canonical_confirmed");

  // Concordando, também não há bloqueio.
  const iguais = resolveSiloPagePublicationIdentity({
    slug: "anti-idade-e-retinol",
    brandSiteUrl: "https://careglow.com.br",
    observation: {
      verificationStatus: "canonical_confirmed",
      resolvedUrl: "https://careglow.com.br/anti-idade-e-retinol",
      declaredCanonicalUrl: "https://careglow.com.br/anti-idade-e-retinol",
      normalizedCanonicalUrl: null,
    },
    current: {
      publicationStatus: "published",
      publishedUrl: "https://careglow.com.br/anti-idade-e-retinol",
      canonical: "https://careglow.com.br/anti-idade-e-retinol",
    },
  });
  assert.equal(iguais.publicationVerification.status, "canonical_confirmed");
});

test("status fraco do catálogo não destrava aprovação, e diz por quê", () => {
  for (const fraco of ["discovered", "unverified", "canonical_missing", "redirect", "noindex"]) {
    const resultado = resolveSiloPagePublicationIdentity({
      slug: "anti-idade-e-retinol",
      brandSiteUrl: "https://careglow.com.br",
      observation: { verificationStatus: fraco, resolvedUrl: null, declaredCanonicalUrl: null, normalizedCanonicalUrl: null },
      current: null,
    });
    assert.equal(resultado.publicationVerification.status, "not_checked", `${fraco} não vira status forte`);
    assert.ok((resultado.publicationVerification.message || "").length > 0, `${fraco} explica o motivo`);
  }
});
