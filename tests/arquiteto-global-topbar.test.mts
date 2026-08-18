import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const read = (file: string) => readFile(new URL(file, root), "utf8");

type Controls = { moduleId: string; search: { getValue: () => string } };

function createRegistrationModel() {
  let controls: Controls | null = null;
  let stateTransitions = 0;

  return {
    get controls() {
      return controls;
    },
    get stateTransitions() {
      return stateTransitions;
    },
    register(nextControls: Controls) {
      if (controls === nextControls) return;
      controls = nextControls;
      stateTransitions += 1;
    },
    unregister(moduleId: string) {
      if (controls?.moduleId !== moduleId) return;
      controls = null;
      stateTransitions += 1;
    },
  };
}

test("registro idempotente não atualiza o Provider em rerender equivalente", () => {
  const model = createRegistrationModel();
  const controls: Controls = { moduleId: "arquiteto", search: { getValue: () => "" } };

  model.register(controls);
  model.register(controls);

  assert.equal(model.controls, controls);
  assert.equal(model.stateTransitions, 1);
});

test("uma alteração real de busca substitui os controles sem duplicar estado", () => {
  const model = createRegistrationModel();
  let search = "";
  const first = { moduleId: "arquiteto", search: { getValue: () => search } };
  model.register(first);

  search = "fisioterapia";
  const changed = { moduleId: "arquiteto", search: { getValue: () => search } };
  model.register(changed);

  assert.equal(model.controls, changed);
  assert.equal(model.controls?.search.getValue(), "fisioterapia");
  assert.equal(model.stateTransitions, 2);
});

test("cleanup desmonta somente o módulo que ainda está registrado", () => {
  const model = createRegistrationModel();
  const arquiteto: Controls = { moduleId: "arquiteto", search: { getValue: () => "" } };
  const radar: Controls = { moduleId: "radar", search: { getValue: () => "" } };

  model.register(arquiteto);
  model.register(radar);
  model.unregister("arquiteto");
  assert.equal(model.controls, radar, "cleanup antigo não pode remover o módulo novo");

  model.unregister("radar");
  assert.equal(model.controls, null);
  assert.equal(model.stateTransitions, 3);
});

test("a implementação do Arquiteto usa refs estáveis para handlers e cleanup por moduleId", async () => {
  const [provider, arquiteto] = await Promise.all([
    read("components/global-topbar.tsx"),
    read("modules/arquiteto/arquiteto-workspace.tsx"),
  ]);

  assert.match(provider, /registerControls = useCallback/);
  assert.match(provider, /updateControls = useCallback/);
  assert.match(provider, /unregisterControls = useCallback/);
  assert.match(provider, /current === nextControls \? current : nextControls/);
  assert.match(provider, /current\.moduleId !== nextControls\.moduleId \|\| current === nextControls/);
  assert.match(provider, /current\?\.moduleId === moduleId \? null : current/);

  assert.match(arquiteto, /topbarHandlersRef\.current\.showNotification/);
  assert.match(arquiteto, /topbarHandlersRef\.current\.processDeterministicStructure/);
  assert.match(arquiteto, /registerControls\(globalTopbarControlsRef\.current\)/);
  assert.match(arquiteto, /unregisterControls\("arquiteto"\)/);
  assert.match(arquiteto, /updateControls\(globalTopbarControls\)/);
  assert.match(arquiteto, /\[registerControls, unregisterControls\]/);
  assert.doesNotMatch(arquiteto, /useEffect\(\(\) => \{[\s\S]{0,250}setControls\(/);
});
