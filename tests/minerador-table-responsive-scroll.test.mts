import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { keywordTableMinimumWidth, resolveKeywordTableResponsiveWidths } from "../modules/minerador/keyword-table/use-keyword-table-responsive-widths.ts";

const workspace = readFileSync(new URL("../modules/minerador/minerador-workspace.tsx", import.meta.url), "utf8");
const discovery = readFileSync(new URL("../modules/minerador/discovery/discovery-table-placeholder.tsx", import.meta.url), "utf8");
const resize = readFileSync(new URL("../modules/minerador/keyword-table/keyword-table-resize.tsx", import.meta.url), "utf8");

/** Lê o bloco de constraints direto da fonte para manter o teste no contrato real. */
function readConstraints(source: string, name: string) {
  const start = source.indexOf(`const ${name} = {`);
  const block = source.slice(start, source.indexOf("\n};", start));
  const constraints: Record<string, { min: number; max: number; flexible?: boolean; priority?: "protected" }> = {};
  for (const match of block.matchAll(/(\w+):\s*\{\s*min:\s*(\d+),\s*max:\s*(\d+)([^}]*)\}/g)) {
    constraints[match[1]] = {
      min: Number(match[2]),
      max: Number(match[3]),
      ...(match[4].includes("flexible: true") ? { flexible: true } : {}),
      ...(match[4].includes('"protected"') ? { priority: "protected" as const } : {}),
    };
  }
  return constraints;
}

function readWidths(source: string, name: string) {
  const start = source.indexOf(`const ${name} = {`);
  const block = source.slice(start, source.indexOf("\n};", start));
  const widths: Record<string, number> = {};
  for (const match of block.matchAll(/(\w+):\s*(\d+)\s*[,\n]/g)) widths[match[1]] = Number(match[2]);
  return widths;
}

const processorWidths = readWidths(workspace, "processorColumnWidths");
const processorConstraints = readConstraints(workspace, "processorColumnConstraints");
const discoveryWidths = readWidths(discovery, "discoveryColumnWidths");
const discoveryConstraints = readConstraints(discovery, "discoveryColumnConstraints");

test("a largura mínima da tabela é derivada dos mínimos das colunas, não de um valor fixo", () => {
  assert.match(workspace, /minWidth: processorTableMinimumWidth/);
  assert.match(workspace, /keywordTableMinimumWidth\(processorColumnConstraints, Object\.keys\(processorColumnWidths\)\)/);
  assert.match(discovery, /minWidth: discoveryTableMinimumWidth/);
  assert.match(discovery, /keywordTableMinimumWidth\(discoveryColumnConstraints, tableColumnIds\)/);
  assert.doesNotMatch(workspace, /min-w-\[\d+px\] table-fixed/);
  assert.doesNotMatch(discovery, /min-w-\[\d+px\]/);
});

test("as duas tabelas cabem em telas pequenas de notebook sem barra horizontal", () => {
  const processorIds = Object.keys(processorWidths);
  const discoveryIds = Object.keys(discoveryWidths).filter(id => id !== "perspective");
  assert.ok(keywordTableMinimumWidth(processorConstraints, processorIds) <= 1280, "o Processador precisa caber em 1280px");
  assert.ok(keywordTableMinimumWidth(discoveryConstraints, discoveryIds) <= 1280, "a Descoberta precisa caber em 1280px");

  // 1300px de área útil é a projeção de um notebook pequeno com a navegação aberta.
  const projected = resolveKeywordTableResponsiveWidths(processorWidths, processorConstraints, 1300);
  const total = Object.values(projected).reduce((sum, value) => sum + value, 0);
  assert.ok(total <= 1300, `a tabela projetada (${total}px) não pode exceder a área disponível`);
  assert.ok(projected.keyword >= (processorConstraints.keyword?.min ?? 0));
  assert.ok(projected.keyword >= 240, "a coluna Palavra-Chave precisa continuar legível na projeção");
});

test("nenhuma largura disponível deixa a tabela 1px maior que o espaço — a barra não fica ligada por arredondamento", () => {
  const minimum = keywordTableMinimumWidth(processorConstraints, Object.keys(processorWidths));
  const preferred = Object.values(processorWidths).reduce((sum, value) => sum + value, 0);
  for (let available = minimum; available <= preferred + 40; available += 1) {
    const total = Object.values(resolveKeywordTableResponsiveWidths(processorWidths, processorConstraints, available))
      .reduce((sum, value) => sum + value, 0);
    assert.ok(total <= Math.max(available, minimum), `projeção de ${total}px excede ${available}px disponíveis`);
  }
});

test("a medição da área disponível acontece antes da pintura", () => {
  const hook = readFileSync(new URL("../modules/minerador/keyword-table/use-keyword-table-responsive-widths.ts", import.meta.url), "utf8");
  assert.match(hook, /useLayoutEffect/);
  assert.ok(hook.includes('const useMeasurementEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;'));
  assert.ok(hook.includes("useMeasurementEffect(() => {"));
});

test("acima da largura preferida nada é encolhido e nenhuma barra é forçada", () => {
  const projected = resolveKeywordTableResponsiveWidths(processorWidths, processorConstraints, 1920);
  assert.deepEqual(projected, processorWidths);
});

test("a coluna ajustada pelo humano não é encolhida de volta pela projeção", () => {
  const widened = { ...processorWidths, niche: 400 };
  const automatic = resolveKeywordTableResponsiveWidths(widened, processorConstraints, 1300);
  const respected = resolveKeywordTableResponsiveWidths(widened, processorConstraints, 1300, ["niche"]);
  assert.ok(automatic.niche < 400, "sem o registro do resize a coluna seria reduzida");
  assert.equal(respected.niche, 400);
});

test("o resize manual registra a coluna tocada e continua limitado pelos mínimos", () => {
  assert.match(resize, /setResizedColumnIds/);
  assert.match(resize, /return \{ widths, resizedColumnIds, startResize \};/);
  assert.match(resize, /constraints\.min \?\? 56/);
  assert.match(workspace, /columnResize\.resizedColumnIds/);
  assert.match(discovery, /columnResize\.resizedColumnIds/);
});

test("colunas continuam ajustáveis com folga real de largura", () => {
  for (const [id, constraint] of Object.entries(processorConstraints)) {
    assert.ok(constraint.max > constraint.min, `${id} precisa de faixa de ajuste`);
    if (!["drag", "index", "selection"].includes(id)) {
      assert.ok(constraint.max >= constraint.min * 2, `${id} precisa permitir pelo menos o dobro do mínimo`);
    }
  }
});
