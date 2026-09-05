import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { RADAR_TAB_KEYS, resolveRadarTab } from "../lib/radar/flow-presentation.ts";

const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");

test("R2 separa a tela SERP da curadoria de referências e mantém aliases", () => {
  assert.deepEqual(RADAR_TAB_KEYS, ["resumo", "serp", "referencias", "analise-serp", "evidencias-adicionais", "relatorio", "historico"]);
  assert.equal(resolveRadarTab("serp"), "serp");
  assert.equal(resolveRadarTab("resultados-serp"), "serp");
  assert.equal(resolveRadarTab("concorrentes"), "referencias");
});

test("tela SERP só atualiza por ação explícita e oferece histórico/comparação", () => {
  const screen = read("../modules/radar/radar-serp-screen.tsx");
  assert.match(screen, /Atualizar SERP/);
  assert.match(screen, /Ver histórico/);
  assert.match(screen, /Comparar snapshots/);
  assert.match(screen, /onRefresh/);
  assert.doesNotMatch(screen, /useEffect\(/);
});

test("referências avançadas expõem busca, filtros, funções e ação coletiva", () => {
  const page = read("../modules/radar/radar-analysis-page.tsx");
  assert.match(page, /Buscar resultado/);
  assert.match(page, /Filtrar por função/);
  assert.match(page, /Somente pendentes/);
  assert.match(page, /Restaurar para decisão/);
  assert.match(page, /Analisar referências selecionadas/);
});

test("análise, evidências adicionais e atividade mantêm suas fronteiras", () => {
  const page = read("../modules/radar/radar-analysis-page.tsx");
  const signals = read("../modules/radar/radar-analysis-signals.tsx");
  const evidence = read("../modules/radar/expert-contribution-panel.tsx");
  const workbench = read("../modules/radar/radar-workbench.tsx");
  assert.match(page, /RadarAnalysisSignals/);
  assert.match(signals, /Necessidades, lacunas e oportunidades/);
  assert.match(evidence, /Fixture local para validação da experiência/);
  assert.match(evidence, /Telegram global/);
  assert.match(workbench, /RadarActivitySummary/);
});
