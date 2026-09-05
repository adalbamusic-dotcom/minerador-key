import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

/**
 * Vocabulário da UI do Arquiteto.
 *
 * Para o usuário o conceito estrutural é SILO. "Território/Territory" continua
 * existindo como nome técnico interno (territoryRef, TerritorialLandscape,
 * subject_type) e NÃO pode ser renomeado — este teste separa as duas camadas.
 */

const UI_FILES = [
  "modules/arquiteto/arquiteto-workspace.tsx",
  "modules/arquiteto/territorial-workspace-rows.tsx",
  "modules/arquiteto/arquiteto-workbench.tsx",
];

/** Fontes cujo texto funcional chega à tela (motivo, evidência, estado vazio). */
const COPY_SOURCES = [
  "lib/arquiteto/territorial-landscape.ts",
  "lib/arquiteto/territorial-surface.ts",
  "lib/arquiteto/territorial-logic.ts",
];

/**
 * Exceção declarada: `change_reason` é conteúdo de payload persistido em
 * `editorial_artifact_versions`, não copy de UI. Humanizá-lo mudaria o que fica
 * gravado, e o Planner determinou não renomear payload para humanizar a tela.
 */
const PERSISTED_PAYLOAD_TEXT = ["Consolidação humana da arquitetura territorial do Silo."];

const stringLiteral = /(['"`])((?:\\.|(?!\1)[^\\])*)\1/g;

/** Literais de string que não são import, testid, classe ou chave técnica. */
function visibleStrings(file: string) {
  const found: Array<{ line: number; text: string }> = [];
  readFileSync(file, "utf8").split("\n").forEach((line, index) => {
    const trimmed = line.trimStart();
    if (trimmed.startsWith("//") || trimmed.startsWith("*") || trimmed.startsWith("/*")) return;
    if (/^import |from "/.test(trimmed)) return;
    stringLiteral.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = stringLiteral.exec(line))) {
      // A expressão interpolada é código, não texto: só o literal vai à tela.
      const text = match[2].replace(/\$\{[^}]*\}/g, "");
      if (!text.includes(" ")) continue;
      // Identificadores técnicos: caminho, testid, lista de classes.
      if (/^[a-z0-9-]+(\s[a-z0-9:./[\]#-]+)*$/.test(text.trim())) continue;
      if (PERSISTED_PAYLOAD_TEXT.includes(text.trim())) continue;
      found.push({ line: index + 1, text });
    }
  });
  return found;
}

test("nenhum texto visível do Arquiteto diz Território/Territory", () => {
  const ofensas: string[] = [];
  for (const file of [...UI_FILES, ...COPY_SOURCES]) {
    for (const { line, text } of visibleStrings(file)) {
      if (/territ[oó]ri/i.test(text)) ofensas.push(`${file}:${line} → ${text}`);
    }
  }

  assert.deepEqual(ofensas, [], `texto visível ainda fala em Território:\n${ofensas.join("\n")}`);
});

test("os rótulos da mesa usam Silo como conceito estrutural", () => {
  const rows = readFileSync("modules/arquiteto/territorial-workspace-rows.tsx", "utf8");

  assert.match(rows, /territories: "Silos"/);
  assert.match(rows, /unassigned: "Sem silo"/);
  assert.match(rows, /new_silo_candidate: "Candidata a novo silo"/);
  // Cluster não é sinônimo genérico de Silo.
  assert.doesNotMatch(rows, /[Cc]luster/);
});

test("os nomes técnicos internos continuam intactos", () => {
  const workspace = readFileSync("modules/arquiteto/arquiteto-workspace.tsx", "utf8");
  const landscape = readFileSync("lib/arquiteto/territorial-landscape.ts", "utf8");
  const canonical = readFileSync("lib/arquiteto/canonical-workspace.ts", "utf8");

  // Renomear identidade técnica quebraria banco, contrato e payload.
  assert.match(workspace, /territoryRef/);
  assert.match(workspace, /buildTerritorialLandscape/);
  assert.match(canonical, /territoryAssignment/);
  assert.match(landscape, /LANDSCAPE_SOURCE_KINDS/);
  assert.match(landscape, /territory_record/);
});

test("Artigos e Links internos mantêm o vocabulário deles", () => {
  const workspace = readFileSync("modules/arquiteto/arquiteto-workspace.tsx", "utf8");
  const workbench = readFileSync("modules/arquiteto/arquiteto-workbench.tsx", "utf8");

  assert.match(workbench, /mode === "articles" \? "Artigos" : mode === "silos" \? "Silos" : "Links internos"/);
  for (const label of ["Keyword principal", "Definição do artigo", "Revisão IA", "Artigo"]) {
    assert.ok(workspace.includes(label), `rótulo de Artigos perdido: ${label}`);
  }
});
