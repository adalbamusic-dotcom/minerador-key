import assert from "node:assert/strict";
import test from "node:test";
import { React, montarRadar } from "./radar-dom-harness.mts";
import { LinksMeshPreviewConfirm } from "../modules/arquiteto/links-mesh-preview-confirm.tsx";
import { linkMeshPreviewFingerprint } from "../lib/arquiteto/silo-link-mesh.ts";

test("Confirmar e processar só aciona o lote da prévia ainda vigente", async () => {
  const screen = await montarRadar();
  try {
    const original = linkMeshPreviewFingerprint({ brandId: "m1", selectedArticleIds: ["a"], selectedSiloId: "s1", basis: { graph: "v1" } });
    const changed = linkMeshPreviewFingerprint({ brandId: "m1", selectedArticleIds: ["b"], selectedSiloId: "s1", basis: { graph: "v1" } });
    const silos: Array<{ preview: { cost: { calls: number } } | null; blocker: string | null; estimate?: boolean }> = [{ preview: { cost: { calls: 1 } }, blocker: null }];
    let calls = 0;
    const render = async (currentFingerprint: string, entries = silos) => screen.render(React.createElement(LinksMeshPreviewConfirm, {
      preview: { fingerprint: original, silos: entries }, currentFingerprint, canProcess: true,
      label: "Confirmar e processar (1 chamada de IA)", className: "", onConfirm: () => { calls += 1; },
    }));
    await render(original);
    await screen.click("architect-links-mesh-preview-confirm");
    assert.equal(calls, 1);
    await render(changed);
    await screen.click("architect-links-mesh-preview-confirm");
    assert.equal(calls, 1, "mudar a seleção impede processar outro lote sob o custo anterior");
    await render(original, [...silos, { preview: null, blocker: "Silo incompleto" }]);
    await screen.click("architect-links-mesh-preview-confirm");
    assert.equal(calls, 1, "lote com custo desconhecido não é processado parcialmente");
    await render(original, [...silos, { preview: { cost: { calls: 0 } }, blocker: null, estimate: true }]);
    await screen.click("architect-links-mesh-preview-confirm");
    assert.equal(calls, 1, "estimativa de outro Silo não autoriza chamada não verificada");
  } finally { screen.destroy(); }
});
