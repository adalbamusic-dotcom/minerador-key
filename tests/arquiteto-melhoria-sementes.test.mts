import test from "node:test";
import assert from "node:assert/strict";
import { shortSeedsOf, sharesTheme } from "../lib/arquiteto/article-improvement-seeds.ts";

// O Google Ads devolveu só a própria frase para o título inteiro (Descobrir, 29/09/2026).
test("títulos longos viram sementes curtas para o Google Ads", () => {
  assert.deepEqual(shortSeedsOf("checklist de plano de marketing para clínica de estética").slice(0, 3), ["plano de marketing", "checklist de plano de marketing", "clínica de estética"]);
  assert.ok(shortSeedsOf("como atrair pacientes para clínica de estética").includes("atrair pacientes"));
  assert.ok(shortSeedsOf("captação de pacientes sem tráfego pago").includes("captação de pacientes"));
  assert.ok(shortSeedsOf("plano de marketing estética: exemplos e templates").includes("plano de marketing estética"));
  assert.ok(shortSeedsOf("agência de marketing para cosméticos").includes("cosméticos"));
  for (const titulo of ["instagram não traz pacientes", "promoções para estética", "marketing harmonização facial"]) {
    const sementes = shortSeedsOf(titulo);
    assert.ok(sementes.length >= 1 && sementes.length <= 5, titulo);
    for (const semente of sementes) assert.doesNotMatch(semente, /\s{2,}|^(de|para|com) /, semente);
  }
});

test("relevância pelo tema: palavras de conteúdo em comum, não conectivos", () => {
  assert.equal(sharesTheme("checklist de plano de marketing para clínica de estética", "plano de marketing para clínica"), true);
  assert.equal(sharesTheme("instagram não traz pacientes", "como atrair pacientes"), false);
  assert.equal(sharesTheme("promoções para estética", "promoções estética"), true);
});
