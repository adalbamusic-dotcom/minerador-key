import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

/*
 * SDD Radar 2026-09-30 (Parte B, passo 1): o ponto de revisão escolhido pela
 * pessoa na tela vale no dossiê. A resposta de uma pauta avulsa, associada a
 * um ponto e aceita, saía do pacote porque o servidor só lia o ponto da pauta.
 * A tela já dava prioridade à associação manual; o servidor passa a fazer o mesmo.
 */
const semComentarios = (fonte: string) => fonte.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/^\s*\/\/.*$/gm, " ");

test("a camada do especialista usa o ponto associado na revisão, e só depois o da pauta", async () => {
  const servidor = semComentarios(await readFile(new URL("../lib/server/radar-canonical-authorities.ts", import.meta.url), "utf8"));
  assert.match(servidor, /requirementId: decisoes\[contribuicao\.id\]\?\.relatedRequirementId \?\? radarSpecialistRequirementIdOf\(pauta\.radarContext\)/);
  const tela = semComentarios(await readFile(new URL("../modules/radar/radar-expert-brief-panel.tsx", import.meta.url), "utf8"));
  assert.match(tela, /const requirementId = manual \|\| automatico;/, "a tela e o servidor seguem a mesma ordem");
});
