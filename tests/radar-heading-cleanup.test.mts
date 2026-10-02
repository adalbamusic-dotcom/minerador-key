import assert from "node:assert/strict";
import test from "node:test";
import { radarCleanCompetitorHeading } from "../lib/radar/heading-cleanup.ts";

/* Casos reais do CSV de "instagram não traz pacientes" (2026-10-02). */
test("tira a numeração de lista do cabeçalho do concorrente", () => {
  assert.equal(radarCleanCompetitorHeading("2. Aproveite os recursos do Instagram"), "Aproveite os recursos do Instagram");
  assert.equal(radarCleanCompetitorHeading("7. Ative o Instagram Shopping"), "Ative o Instagram Shopping");
  assert.equal(radarCleanCompetitorHeading("4) Crie uma bio atrativa"), "Crie uma bio atrativa");
  assert.equal(radarCleanCompetitorHeading("Passo 3: defina o público"), "Defina o público");
});

test("tira a contagem de listicle e devolve o assunto", () => {
  assert.equal(radarCleanCompetitorHeading("10 principais influencers de IA do Instagram: porque fazem sucesso?"), "Influencers de IA do Instagram: porque fazem sucesso?");
  assert.equal(radarCleanCompetitorHeading("15 ideias para atrair clientes para o seu perfil"), "Atrair clientes para o seu perfil");
  assert.equal(radarCleanCompetitorHeading("9 estratégias para sua loja"), "Sua loja");
});

test("tira a data solta no fim e preserva o resto", () => {
  assert.equal(radarCleanCompetitorHeading("Como profissionalizar o seu negócio sem depender do Instagram? 29/07/2026"), "Como profissionalizar o seu negócio sem depender do Instagram?");
});

test("não mexe no que não é moldura", () => {
  assert.equal(radarCleanCompetitorHeading("Stories para atrair clientes"), "Stories para atrair clientes");
  assert.equal(radarCleanCompetitorHeading("Quem tem 1.000 seguidores no Instagram ganha dinheiro?"), "Quem tem 1.000 seguidores no Instagram ganha dinheiro?");
  assert.equal(radarCleanCompetitorHeading("2026"), "2026", "sem assunto depois da moldura, fica o original");
});
