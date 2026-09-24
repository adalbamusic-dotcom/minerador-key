import assert from "node:assert/strict";
import test from "node:test";

import { keywordVinculoSummary, resolveKeywordVinculo } from "../lib/minerador/keyword-vinculo.ts";
import { KEYWORD_PAGE_TYPES } from "../lib/minerador/keyword-page-type.ts";
import { setKeywordSubject, withdrawKeywordSubject } from "../lib/minerador/keyword-subject.ts";
import { EditorialUnitDeclarationSchema } from "../lib/arquiteto/contracts.ts";

/**
 * VÍNCULO COM ASSUNTO (SDD 2026-09-24, F1.1 e F1.10).
 *
 * Sem Assunto, o objeto e a frase de `resolveKeywordVinculo` são byte a byte
 * os de antes. O snapshot abaixo foi capturado do código ANTERIOR à fatia,
 * rodando estas mesmas fixtures (2026-09-24), e não pode mudar.
 */

const ACTOR = "3f0c9a52-8b1e-4c7d-9f2a-5e6b7c8d9e0f";
const AT = "2026-09-24T12:00:00+00:00";

const publicada = {
  site_origin: {
    sourceUrl: "https://careglow.com.br/rotina-skincare-facial",
    resolvedUrl: "https://careglow.com.br/rotina-skincare-facial",
    canonicalUrl: "https://careglow.com.br/rotina-skincare-facial",
    urlSituation: "canonical_confirmed", publicationStatus: "published",
    lastCheckedAt: "2026-09-20T23:30:00+00:00",
    publicationConfirmedBy: "human-1", publicationConfirmedAt: "2026-09-20T23:40:00+00:00",
    siteRole: "silo", siloPath: "/rotina-skincare-facial",
  },
};

const FIXTURES = [
  { status: "bruto", semantic: {} },
  { status: "bruto", semantic: publicada },
  { status: "aprovado", semantic: { keyword_page_type: "landing_page", primary_keyword_policy: "reviewable" } },
];

/** Saída de `JSON.stringify(resolveKeywordVinculo(f))` e da frase, antes da fatia. */
const SNAPSHOT = [
  [
    '{"publicationDeclared":false,"publicationState":"free","url":null,"canonicalUrl":null,"post":"free","postLabel":"Livre","postLockedToSlug":false,"postSelectValue":"reviewable","pageType":{"type":"article","source":"default","determined":false,"published":false,"declared":false},"pageTypeLabel":"Artigo · potencial"}',
    "Livre · Artigo · potencial",
  ],
  [
    '{"publicationDeclared":true,"publicationState":"published","url":"https://careglow.com.br/rotina-skincare-facial","canonicalUrl":"https://careglow.com.br/rotina-skincare-facial","post":"locked","postLabel":"Travado ao slug","postLockedToSlug":true,"postSelectValue":"locked","pageType":{"type":"silo","source":"site","determined":true,"published":true,"declared":true},"pageTypeLabel":"Silo · declarado"}',
    "Travado ao slug · Silo · declarado",
  ],
  [
    '{"publicationDeclared":false,"publicationState":"free","url":null,"canonicalUrl":null,"post":"reviewable","postLabel":"Livre","postLockedToSlug":false,"postSelectValue":"reviewable","pageType":{"type":"landing_page","source":"human","determined":true,"published":false,"declared":false},"pageTypeLabel":"Landing page · potencial"}',
    "Livre · Landing page · potencial",
  ],
];

test("sem Assunto, o objeto e a frase do Vínculo são byte a byte os de antes", () => {
  FIXTURES.forEach((input, index) => {
    const vinculo = resolveKeywordVinculo(input);
    assert.equal(JSON.stringify(vinculo), SNAPSHOT[index][0]);
    assert.equal(keywordVinculoSummary(vinculo), SNAPSHOT[index][1]);
    assert.equal("subject" in vinculo, false);
    assert.equal("subjectLabel" in vinculo, false);
  });
});

test("Assunto retirado volta ao objeto de antes (keyword_subject: null)", () => {
  FIXTURES.forEach((input, index) => {
    const declared = setKeywordSubject(input.semantic, { note: "x", actorId: ACTOR, changedAt: AT, origin: "review" });
    assert.ok(declared.ok);
    const withdrawn = withdrawKeywordSubject(declared.semantic, { actorId: ACTOR, changedAt: AT, origin: "review" });
    assert.ok(withdrawn.ok);
    const vinculo = resolveKeywordVinculo({ status: input.status, semantic: withdrawn.semantic });
    assert.equal(JSON.stringify(vinculo), SNAPSHOT[index][0]);
    assert.equal(keywordVinculoSummary(vinculo), SNAPSHOT[index][1]);
  });
});

test("com Assunto, subject e subjectLabel entram e a frase ganha ' · Assunto · declarado'", () => {
  FIXTURES.forEach((input, index) => {
    const declared = setKeywordSubject(input.semantic, { note: "Serviço de SEO para donos de clínica", actorId: ACTOR, changedAt: AT, origin: "review" });
    assert.ok(declared.ok);
    const vinculo = resolveKeywordVinculo({ status: input.status, semantic: declared.semantic });
    assert.equal(vinculo.subjectLabel, "Assunto · declarado");
    assert.equal(vinculo.subject?.declared, true);
    assert.equal(vinculo.subject?.note, "Serviço de SEO para donos de clínica");
    assert.equal(keywordVinculoSummary(vinculo), `${SNAPSHOT[index][1]} · Assunto · declarado`);
    // Posto e tipo de página continuam exatamente como eram (P2, P5).
    const { subject: _subject, subjectLabel: _label, ...rest } = vinculo;
    assert.equal(JSON.stringify(rest), SNAPSHOT[index][0]);
  });
});

test("declarado sem nota: rótulo 'Assunto sem nota'", () => {
  const declared = setKeywordSubject({}, { note: null, actorId: ACTOR, changedAt: AT, origin: "batch" });
  assert.ok(declared.ok);
  const vinculo = resolveKeywordVinculo({ status: "bruto", semantic: declared.semantic });
  assert.equal(vinculo.subjectLabel, "Assunto sem nota");
  assert.equal(keywordVinculoSummary(vinculo), "Livre · Artigo · potencial · Assunto sem nota");
});

test("o Assunto não é tipo de página: enum do Minerador e declaração do Arquiteto intactos", () => {
  assert.deepEqual([...KEYWORD_PAGE_TYPES], ["article", "silo", "landing_page", "service_page"]);
  for (const unit of KEYWORD_PAGE_TYPES) {
    assert.equal(EditorialUnitDeclarationSchema.safeParse({ source: "potential", unit }).success, true, unit);
  }
  for (const unit of ["assunto", "subject"]) {
    assert.equal(EditorialUnitDeclarationSchema.safeParse({ source: "potential", unit }).success, false, unit);
    assert.equal(EditorialUnitDeclarationSchema.safeParse({ source: "published", unit }).success, false, unit);
  }
  // Declarar Assunto não troca o tipo gravado.
  const declared = setKeywordSubject({ keyword_page_type: "service_page" }, { note: null, actorId: ACTOR, changedAt: AT, origin: "review" });
  assert.ok(declared.ok);
  assert.equal(resolveKeywordVinculo({ status: "bruto", semantic: declared.semantic }).pageType.type, "service_page");
});
