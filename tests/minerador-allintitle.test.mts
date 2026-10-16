import assert from "node:assert/strict";
import test from "node:test";
import { buildDataForSeoAllintitleRequest } from "../lib/minerador/dataforseo-serp-core.ts";
import { buildAllintitleQuery } from "../lib/minerador/allintitle.ts";

/*
 * 2026-10-16 · F1 da linha única do Minerador (S-8): `lib/minerador/allintitle.ts`
 * ficou só com `buildAllintitleQuery` (a consulta do DataForSEO). Os testes do
 * parser da página do Google, do lote e do patch da era da Extensão Chrome
 * saíram com o código que testavam.
 */

/* ===================== a consulta do KGR não leva aspas ==================== */

test("a consulta allintitle não leva aspas e preserva todas as palavras", () => {
  // Medição real de 2026-09-18: allintitle:"cnc" devolveu 1 resultado e
  // allintitle:cnc devolveu 1.720. A aspa degenerava a consulta.
  assert.equal(buildAllintitleQuery("cnc"), "allintitle:cnc");
  assert.equal(buildAllintitleQuery("skin care noturno"), "allintitle:skin care noturno");
  assert.equal(buildAllintitleQuery("  hidratante   corporal  "), "allintitle:hidratante corporal");
  // Aspas e barras no termo quebram o operador; continuam removidas.
  assert.equal(buildAllintitleQuery('serum "principia"'), "allintitle:serum principia");
  assert.equal(buildAllintitleQuery("retinol\\creamy"), "allintitle:retinol creamy");
  for (const keyword of ["cnc", "skin care noturno", 'serum "principia"']) {
    assert.equal(buildAllintitleQuery(keyword).includes('"'), false, `a consulta de ${keyword} não pode conter aspas`);
  }
});

test("o corpo enviado à DataForSEO carrega a consulta sem aspas", () => {
  const built = buildDataForSeoAllintitleRequest({
    keyword: "skin care noturno",
    locationCode: 2076,
    languageCode: "pt",
    operationRequestId: "87775d02-22eb-4357-bbe4-2f30e76151a3",
  });
  assert.equal(built.query, "allintitle:skin care noturno");
  assert.equal(built.body[0].keyword, "allintitle:skin care noturno");
  assert.equal(JSON.stringify(built.body).includes('\\"'), false);
});
