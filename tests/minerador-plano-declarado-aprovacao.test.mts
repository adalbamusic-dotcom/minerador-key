import assert from "node:assert/strict";
import test from "node:test";

import {
  DECLARED_PRINCIPAL_APPROVAL_REASON,
  applyApproval,
  approvedPackageDiverged,
  buildApprovedPackage,
  resolveApprovalReadiness,
  resolveHandoffApprovalGate,
} from "../lib/minerador/approved-package.ts";
import { buildLogicalOutputContract } from "../lib/minerador/logical-processor.ts";
import { setDeclaredPrincipal, setKeywordSubject } from "../lib/minerador/keyword-subject.ts";
import { KeywordDnaSchema, keywordDnaFromPackage, keywordDnaFromRow } from "../lib/minerador/keyword-dna.ts";
import { readArchitectSubjectStanding } from "../lib/arquiteto/declared-subject.ts";

/*
 * F3 (Fase A) e D2-bis da F4 — SDD 2026-10-12 §5.3, §6.1-3; ADR-022, emenda D1-bis.
 * Fixtures puras; REAL_PROVIDER_CALLS_IN_TESTS = 0.
 */

const ACTOR = "d67ebbad-a590-45f8-8bb5-a19c6241ac1b";
const BRAND = "d4fa133a-13bd-4bf7-bfd1-d0f22253f223";
const G = "a9d5c87b-59aa-4e49-8357-3fa893d4cd2d";
const AT = "2026-10-12T20:00:00.000Z";
const INTENT = "Comercial investigativa";

function comLogica(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  const semantic: Record<string, unknown> = { dna_origem: "logico_deterministico", intencao_principal: INTENT, nicho: "Internet", funnel: "MOFU", ...overrides };
  semantic.logical_output_contract = buildLogicalOutputContract({ semantic, intent: INTENT, niche: "Internet", funnel: "MOFU" });
  return semantic;
}
const marcar = (semantic: Record<string, unknown>) => {
  const result = setDeclaredPrincipal(semantic, { mark: { subjectKeywordId: "s3", groupId: G, planVersion: 1 }, actorId: ACTOR, changedAt: AT });
  assert.ok(result.ok);
  return result.semantic;
};

test("D2-bis: a principal declarada se aprova sem Volume, como o Assunto; a Lógica continua exigida", () => {
  const sem = resolveApprovalReadiness({ semantic: comLogica(), intent: INTENT, volumeSearch: null });
  assert.equal(sem.ok, false, "sem a marca, Volume continua exigido");
  assert.ok(sem.missing.includes("volume"));
  const declarada = resolveApprovalReadiness({ semantic: marcar(comLogica()), intent: INTENT, volumeSearch: null });
  assert.deepEqual(declarada, { ok: true, missing: [], reason: null });
  const semLogica = resolveApprovalReadiness({ semantic: marcar({}), intent: null, volumeSearch: null });
  assert.equal(semLogica.ok, false);
  assert.deepEqual(semLogica.missing, ["logic"]);
  assert.equal(semLogica.reason, DECLARED_PRINCIPAL_APPROVAL_REASON);
  // A trava do envio ao Arquiteto usa a MESMA função.
  assert.equal(resolveHandoffApprovalGate({ semantic: marcar(comLogica()), intent: INTENT, volumeSearch: null }).verdict, "pass");
  // Marca malformada não vale como exceção.
  const torta = resolveApprovalReadiness({ semantic: { ...comLogica(), keyword_declared_principal: { subjectKeywordId: "s3" } }, intent: INTENT, volumeSearch: null });
  assert.equal(torta.ok, false);
});

test("D2-bis: gravar a marca muda o pacote aprovado (a aprovada volta a Em revisão; a reaprovação só pede a Lógica)", async () => {
  const semantic = comLogica();
  const input = { keywordId: "p3", brandId: BRAND, keyword: "Claro Vivo ou TIM internet", intent: INTENT, volumeSearch: null, semantic };
  const aprovado = await applyApproval({ ...input, approvedAt: AT, approvedBy: ACTOR });
  assert.equal(approvedPackageDiverged({ ...input, semantic: aprovado }), false);
  const marcado = marcar(aprovado);
  assert.equal(approvedPackageDiverged({ ...input, semantic: marcado }), true, "o plano é significado: entra no hash");
  const reaprovado = await applyApproval({ ...input, semantic: marcado, approvedAt: AT, approvedBy: ACTOR });
  assert.equal(approvedPackageDiverged({ ...input, semantic: reaprovado }), false);
});

test("Fase A: KeywordDNA .strict() aceita o pacote antigo (sem plano) e o novo (com plano e marca), e o Arquiteto lê os dois pelo resolver", async () => {
  const plan = { groupId: G, planVersion: 1, order: 3, role: "Suporte" as const, scope: "Ensinar a comparar tecnologias, cobertura e condições.", declaredPrincipal: { keywordId: "p3", phrase: "Claro Vivo ou TIM internet" } };
  const antigo = setKeywordSubject(comLogica(), { actorId: ACTOR, changedAt: AT, origin: "import" });
  const novo = setKeywordSubject(comLogica(), { actorId: ACTOR, changedAt: AT, origin: "import", plan });
  assert.ok(antigo.ok && novo.ok);
  const row = (semantic: Record<string, unknown>, id = "s3", keyword = "Claro, Vivo ou TIM: qual internet residencial escolher?") => ({ id, keyword, brand_id: BRAND, intent: INTENT, status: "aprovado", volume_search: null, results_allintitle: null, analise_semantica: semantic });
  const dnaAntigo = keywordDnaFromRow(row(antigo.semantic));
  assert.equal(dnaAntigo.subject?.plan, undefined);
  assert.equal(dnaAntigo.declaredPrincipal, undefined);
  const dnaNovo = keywordDnaFromRow(row(novo.semantic));
  assert.deepEqual(dnaNovo.subject?.plan, plan);
  assert.ok(KeywordDnaSchema.safeParse(dnaNovo).success);
  const principal = keywordDnaFromRow(row(marcar(comLogica()), "p3", "Claro Vivo ou TIM internet"));
  assert.deepEqual(principal.declaredPrincipal, { subjectKeywordId: "s3", groupId: G, planVersion: 1 });
  // Campo a mais dentro do plano é recusado pelo contrato fechado (não passa calado).
  assert.equal(KeywordDnaSchema.safeParse({ ...dnaNovo, subject: { ...dnaNovo.subject, plan: { ...plan, extra: 1 } } }).success, false);

  // O Arquiteto lê pelo PACOTE aprovado, nunca pela linha viva.
  const aprovado = await applyApproval({ keywordId: "s3", brandId: BRAND, keyword: "Claro, Vivo ou TIM: qual internet residencial escolher?", intent: INTENT, volumeSearch: null, semantic: novo.semantic, approvedAt: AT, approvedBy: ACTOR });
  const pacote = buildApprovedPackage({ keywordId: "s3", brandId: BRAND, keyword: "Claro, Vivo ou TIM: qual internet residencial escolher?", intent: INTENT, volumeSearch: null, semantic: aprovado });
  assert.ok(pacote);
  assert.deepEqual(keywordDnaFromPackage({ approvedDna: pacote! }).subject?.plan, plan);
  const mesa = { id: "s3", brand_id: BRAND, keyword: pacote!.keyword, canonicalWorkflow: { state: "received", payload: { approvedDna: pacote, approvedPackageRef: { version: pacote!.version, contentHash: pacote!.contentHash } } } };
  const standing = readArchitectSubjectStanding(mesa);
  assert.equal(standing.declared, true);
  assert.equal(standing.plan?.declaredPrincipal?.keywordId, "p3");
  // Sem pacote, a linha viva não vale como plano.
  assert.equal(readArchitectSubjectStanding({ id: "s3", brand_id: BRAND, keyword: "x", analise_semantica: novo.semantic }).plan, null);
});
