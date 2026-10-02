import assert from "node:assert/strict";
import test from "node:test";
import { radarTextAdheresToCore, radarUbiquitousStems } from "../lib/radar/intent-adherence.ts";
import { radarSemanticStems } from "../lib/radar/semantic-concept-model.ts";

/* O caso real de 2026-10-02: "como atrair clientes pelo instagram" + "instagram não traz pacientes". */
const nucleo = new Set(["como atrair clientes pelo instagram", "instagram não traz pacientes"].flatMap(texto => radarSemanticStems(texto)));
const amostra = [
  "Aproveite os recursos do Instagram",
  "Ative o Instagram Shopping",
  "Influencers de IA do Instagram: porque fazem sucesso?",
  "Crie uma bio atrativa",
  "Stories para atrair clientes",
  "Como transformar seguidores em clientes no Instagram?",
  "Use o Instagram Ads",
];
const daPrincipal = new Set(radarSemanticStems("como atrair clientes pelo instagram"));
const onipresentes = new Set([...radarUbiquitousStems(amostra)].filter(raiz => daPrincipal.has(raiz)));

test("a raiz onipresente da principal (instagram) é cenário, não assunto", () => {
  assert.ok([...onipresentes].some(raiz => raiz.startsWith("instag")), "instagram aparece em quase toda a amostra");
});

test("listicle genérico que só toca 'instagram' não adere", () => {
  for (const candidato of ["Aproveite os recursos do Instagram", "Ative o Instagram Shopping", "Influencers de IA do Instagram: porque fazem sucesso?"]) {
    assert.equal(radarTextAdheresToCore(candidato, nucleo, onipresentes), false, candidato);
  }
});

test("o que fala de atrair clientes ou pacientes adere", () => {
  for (const candidato of ["Stories para atrair clientes", "Como transformar seguidores em clientes no Instagram?", "Por que o Instagram não traz pacientes para a clínica?"]) {
    assert.equal(radarTextAdheresToCore(candidato, nucleo, onipresentes), true, candidato);
  }
});

test("sem amostra mínima, nenhuma raiz é rebaixada", () => {
  assert.equal(radarUbiquitousStems(["Instagram", "Instagram"]).size, 0);
});
