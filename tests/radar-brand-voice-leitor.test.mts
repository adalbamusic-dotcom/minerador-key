import assert from "node:assert/strict";
import test from "node:test";
import { importBrandSkill } from "../lib/marca/brand-skill-domain.ts";
import { readRadarBrandVoice } from "../lib/server/radar-brand-voice.ts";
import { careGlowSkillFile } from "./care-glow-skill.fixture.ts";

/*
 * O LEITOR DA VOZ DA MARCA NO RADAR (SDD diretriz editorial, Adendo C).
 *
 * Mesma regra da Marca (spec §24, `resolveBrandSkill`): vale a versão corrente
 * não arquivada. O repositório é injetado: nada de banco aqui.
 */

const MARCA = "61d2e019-f44f-4fa3-af2f-d86b95628ab3";
const OUTRA = "11111111-2222-4333-8444-555555555555";

async function versao(input: { brandId?: string; version: number; status: "draft" | "pending_approval" | "active" | "archived"; versionId: string }) {
  const base = await importBrandSkill({
    brandId: input.brandId || MARCA, definitionKey: "brand_voice", name: "Care Glow",
    filename: careGlowSkillFile.filename, markdown: careGlowSkillFile.content, byteSize: careGlowSkillFile.byteSize,
    importedBy: "d67ebbad-a590-45f8-8bb5-a19c6241ac1b", now: "2026-10-02T06:09:45.744Z",
  });
  const skill = { ...base, version: input.version, status: input.status, versionId: input.versionId };
  const tecnico = { draft: "draft", pending_approval: "proposed", active: "approved", archived: "superseded" } as const;
  return { versionId: input.versionId, previousVersionId: null, lifecycleStatus: tecnico[input.status], skill };
}

const lista = (itens: Awaited<ReturnType<typeof versao>>[]) => ({ list: async () => itens as never });

test("rascunho mais novo sobre a ativa: vale o corrente, como na Marca e no Redator", async () => {
  const estado = await readRadarBrandVoice(MARCA, lista([
    await versao({ version: 2, status: "draft", versionId: "a2a2a2a2-0000-4000-8000-000000000002" }),
    await versao({ version: 1, status: "active", versionId: "a1a1a1a1-0000-4000-8000-000000000001" }),
  ]));
  assert.equal(estado.kind, "available");
  if (estado.kind !== "available") return;
  assert.equal(estado.voice.version, 2);
  assert.equal(estado.voice.status, "draft");
  assert.ok(estado.voice.sections.length > 0 && estado.voice.sections.every(secao => typeof secao.body === "string"));
  assert.ok(estado.voice.markdown.length > 100);
});

test("só arquivada, ou de outra marca: nenhuma voz", async () => {
  assert.deepEqual(await readRadarBrandVoice(MARCA, lista([await versao({ version: 1, status: "archived", versionId: "b1b1b1b1-0000-4000-8000-000000000001" })])), { kind: "none" });
  assert.deepEqual(await readRadarBrandVoice(MARCA, lista([await versao({ brandId: OUTRA, version: 1, status: "active", versionId: "c1c1c1c1-0000-4000-8000-000000000001" })])), { kind: "none" });
  assert.deepEqual(await readRadarBrandVoice(MARCA, lista([])), { kind: "none" });
});

test("o repositório falhou: o entregável sai sem a voz e diz por quê", async () => {
  const estado = await readRadarBrandVoice(MARCA, { list: async () => { throw new Error("banco fora"); } });
  assert.equal(estado.kind, "unreadable");
});
