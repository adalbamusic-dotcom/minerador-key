import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { comProductShell, montarRadar, React, type RadarDomScreen } from "./radar-dom-harness.mts";
import { ArchitecturePanel } from "../modules/arquiteto/architecture-panel.tsx";
import { buildArchitectureConfirmationPlan, withDeclaredPlanReading, type ArchitectureAnalysis, type ClusterAnalysis } from "../lib/arquiteto/architecture-analysis.ts";
import { buildArchitectureFlowProjection } from "../lib/arquiteto/architecture-flow.ts";
import { architectureConfirmBlocker } from "../lib/arquiteto/proposal-confirmability.ts";
import { AZUL_REAL } from "./arquiteto-uma-lista-so-fixtures.mts";

/*
 * 2026-10-15 (noite) · ACABAMENTOS DA ANÁLISE DA ARQUITETURA — o readback do
 * dono na WifiConecta azul depois de "Processar arquitetura" (SILOS_REUSED = 1,
 * nada novo):
 *  4. "Nada a confirmar no cenário atual." aparecia como notificação de ERRO;
 *  5. a análise dizia "7 sem profundidade para Silo", por keyword "O grupo não
 *     tem profundidade para um silo próprio neste lote; segue para a formação
 *     de artigos" e "Coerência 0 · Aderência 0 · Profundidade 0" — para as 7
 *     keywords do plano, que só seguem o plano do Silo.
 * O painel real (`ArchitecturePanel`) com a análise lida como a tela a lê.
 */
const SEM_ESCORE = { value: 0, reasons: ["o grupo não sustenta um universo próprio"] };
const cluster = (id: string, label: string): ClusterAnalysis => ({
  clusterRef: `cluster:${id}`, label, memberKeywordIds: [id], headKeywordId: id, ambiguousHeadKeywordIds: [], destination: "insufficient_depth",
  suggestedTerritoryRef: null, suggestedTerritoryLabel: null, alternativeTerritoryRefs: [],
  scores: { coherence: { value: 0, reasons: ["1 keyword no grupo"] }, siloFit: { value: 0, reasons: ["nenhum silo existente corresponde a este grupo"] }, depth: SEM_ESCORE, publishedEvidence: { value: 0, reasons: ["nenhum silo existente corresponde a este grupo"] } },
  confidence: "baixa", reason: "O grupo não tem profundidade para um silo próprio neste lote; segue para a formação de artigos.",
});
/** O lote do azul: as 7 do plano e uma keyword solta (sem plano). */
const ANALISE: ArchitectureAnalysis = {
  clusters: [...AZUL_REAL.map(([id, keyword]) => cluster(id, keyword)), cluster("solta", "como melhorar o wifi de casa")],
  summary: { keywords: 8, clusters: 8, strengthening: 0, newSilos: 0, insufficient: 8, ambiguous: 0, confidence: "baixa" },
  narrative: AZUL_REAL.slice(0, 6).map(([, keyword]) => `${keyword}: O grupo não tem profundidade para um silo próprio neste lote; segue para a formação de artigos.`),
  baseHash: "arch:0000000000000001",
};
const PLANO = new Map(AZUL_REAL.map(([id, , , ordem, papel]) => [id, { siloName: "Wi-Fi e fibra óptica", role: papel, order: ordem }]));
const planOf = (keywordId: string) => PLANO.get(keywordId) ?? null;

let screen: RadarDomScreen;
test.beforeEach(async () => { screen = await montarRadar(); });
test.afterEach(() => screen.destroy());

const painel = (analysis: ArchitectureAnalysis, extra: { selectedCluster?: ClusterAnalysis | null; confirmBlocker?: string | null; processed?: boolean } = {}) => comProductShell(React.createElement(ArchitecturePanel, {
  analysis, processed: extra.processed ?? true, stale: false, scenarioState: "Processado", busy: false, confirmed: null, canContinueToArticles: false, processChips: [],
  selectedCluster: extra.selectedCluster ?? null, consolidation: null, preflight: [], proposal: { KEYWORDS_ANALYZED: 8, RESOLVED_KEYWORDS: 8, SILOS_REUSED: 1, SILOS_PROPOSED: 0, ASSIGNED: 7, EXPLICIT_UNASSIGNED: 1, BLOCKED: 0 },
  currentAssigned: 7, pendingAssigned: 0,
  restore: { plan: { clean: true, summary: "", articlesAffected: 0, keywordsToRestore: 0, articles: [] }, previewOpen: false, busy: false, onRestore: () => undefined },
  homologation: null, onProcess: () => undefined, onConfirm: () => undefined, onContinueToArticles: () => undefined,
  ...(extra.confirmBlocker !== undefined ? { confirmBlocker: extra.confirmBlocker } : {}),
}));

test("5 · a leitura do plano: o grupo do plano 'segue o plano do Silo “Wi-Fi e fibra óptica” (Pilar, posição 9)', fora de 'sem profundidade'; destino, escores e baseHash intactos; marca sem plano sem mudança", () => {
  assert.equal(withDeclaredPlanReading(ANALISE, () => null), ANALISE, "marca sem plano: a mesma análise, intacta");
  const vista = withDeclaredPlanReading(ANALISE, planOf);
  assert.deepEqual([vista.summary.insufficient, vista.summary.declaredPlan, vista.summary.clusters], [1, 7, 8]);
  assert.equal(vista.clusters[0].reason, "Segue o plano do Silo “Wi-Fi e fibra óptica” (Pilar, posição 9).");
  assert.equal(vista.clusters[1].reason, "Segue o plano do Silo “Wi-Fi e fibra óptica” (Suporte, posição 10).");
  assert.equal(vista.clusters[7].declaredPlan, undefined, "a solta continua com a análise de sempre");
  assert.match(vista.clusters[7].reason, /não tem profundidade/);
  assert.equal(vista.narrative[0], "internet fibra óptica: Segue o plano do Silo “Wi-Fi e fibra óptica” (Pilar, posição 9).");
  assert.ok(vista.narrative.every(linha => !/não tem profundidade/.test(linha)), "nenhum ruído para as do plano");
  assert.equal(vista.baseHash, ANALISE.baseHash);
  assert.deepEqual(vista.clusters.map(item => item.destination), ANALISE.clusters.map(item => item.destination), "o destino não muda (a proposta e a confirmação não leem a leitura)");
  const candidatos = new Set<string>();
  assert.deepEqual(buildArchitectureConfirmationPlan({ analysis: vista, readiness: new Map(), candidateTerritoryRefs: candidatos }), buildArchitectureConfirmationPlan({ analysis: ANALISE, readiness: new Map(), candidateTerritoryRefs: candidatos }));
  // 2026-10-16 (noite) · SUBSTITUÍDO: "grupo misto (plano + solta) ou de dois planos: a análise de sempre". Agora cada artigo do plano é a sua leitura;
  // só a solta continua com a análise de sempre (ver o cenário-ouro C17 do amarelo).
  const misto = withDeclaredPlanReading({ ...ANALISE, clusters: [{ ...cluster("k9", "internet fibra óptica"), memberKeywordIds: ["k9", "solta"] }] }, planOf, id => id === "solta" ? "como melhorar o wifi de casa" : "internet fibra óptica");
  assert.deepEqual(misto.clusters.map(item => [item.memberKeywordIds, item.declaredPlan?.siloName ?? null]), [[["k9"], "Wi-Fi e fibra óptica"], [["solta"], null]]);
  assert.equal(misto.clusters[1].label, "como melhorar o wifi de casa", "a sobra sem plano leva o nome da própria cabeça");
  // O mapa: o centro do grupo do plano diz o plano.
  const mapa = buildArchitectureFlowProjection({ analysis: vista, keywordTexts: new Map(AZUL_REAL.map(([id, keyword]) => [id, keyword])), territoryLabels: new Map(), publishedTerritoryRefs: new Set() });
  assert.equal(mapa.nodes.find(node => node.id === "cluster:cluster:k9")?.meta, "Segue o plano do Silo “Wi-Fi e fibra óptica”");
  assert.equal(mapa.nodes.find(node => node.id === "cluster:cluster:solta")?.meta, "Sem profundidade para Silo");
});

test("5 · o painel: '1 sem profundidade para Silo · 7 segue(m) o plano do Silo'; o grupo do plano mostra só a frase do plano (sem Coerência/Aderência/Profundidade 0)", async () => {
  const vista = withDeclaredPlanReading(ANALISE, planOf);
  await screen.render(painel(vista, { selectedCluster: vista.clusters[0] }));
  const resumo = screen.get("architect-architecture-summary").parentElement!.textContent!;
  assert.match(resumo, /1 sem profundidade para Silo/);
  assert.match(resumo, /7 segue\(m\) o plano do Silo/);
  assert.doesNotMatch(resumo, /8 sem profundidade|7 sem profundidade/);
  const grupo = screen.get("architect-chart-cluster");
  assert.match(grupo.textContent!, /^Grupo: internet fibra óptica/);
  assert.equal(screen.get("architect-chart-cluster-plan").textContent, "Segue o plano do Silo “Wi-Fi e fibra óptica” (Pilar, posição 9).");
  assert.doesNotMatch(grupo.textContent!, /Coerência|Aderência|Profundidade/);
  assert.doesNotMatch(screen.get("architect-architecture-narrative").textContent!, /não tem profundidade/);
  // A solta (sem plano) continua com os escores e o porquê de sempre.
  await screen.render(painel(vista, { selectedCluster: vista.clusters[7] }));
  assert.match(screen.get("architect-chart-cluster").textContent!, /Coerência.*Aderência.*Profundidade/);
  // Marca sem plano: o painel de sempre.
  await screen.render(painel(ANALISE, { selectedCluster: ANALISE.clusters[0] }));
  assert.match(screen.text(), /8 sem profundidade para Silo/);
  assert.equal(screen.query("architect-architecture-summary-plan"), null);
});

test("4 · nada a confirmar: 'Confirmar propostas novas' fica DESABILITADO com o motivo (title e texto); o aviso, se vier, é informativo — nunca ERRO", async () => {
  const nada = architectureConfirmBlocker({ confirmTerritoryCount: 0, assignmentCount: 0, confirmableCount: 0, skipped: [], counts: {} });
  assert.deepEqual(nada, { tone: "info", message: "Nada a confirmar no cenário atual." });
  assert.equal(architectureConfirmBlocker({ confirmTerritoryCount: 0, assignmentCount: 0, confirmableCount: 0, skipped: [{ label: "Planos", blockers: ["Sem keywords."] }], counts: {} })?.tone, "warning", "Silo ainda não pronto = aviso");
  assert.equal(architectureConfirmBlocker({ confirmTerritoryCount: 1, assignmentCount: 0, confirmableCount: 0, skipped: [], counts: {} }), null);
  assert.equal(architectureConfirmBlocker({ confirmTerritoryCount: 0, assignmentCount: 0, confirmableCount: 2, skipped: [], counts: {} }), null, "confirmável na tela: o botão fica ativo");
  await screen.render(painel(ANALISE, { confirmBlocker: nada!.message }));
  const botao = screen.get("architect-confirm-architecture") as HTMLButtonElement;
  assert.equal(botao.disabled, true);
  assert.equal(botao.title, "Nada a confirmar no cenário atual.");
  assert.equal(screen.get("architect-confirm-blocker").textContent, "Nada a confirmar no cenário atual.");
  await screen.render(painel(ANALISE, { confirmBlocker: null }));
  assert.equal((screen.get("architect-confirm-architecture") as HTMLButtonElement).disabled, false);
  assert.equal(screen.query("architect-confirm-blocker"), null);
  // O clique lê a MESMA regra e nunca usa "error" para o "nada".
  const tela = readFileSync(new URL("../modules/arquiteto/arquiteto-workspace.tsx", import.meta.url), "utf8").replace(/\/\*[\s\S]*?\*\//g, " ").replace(/^\s*\/\/.*$/gm, " ");
  assert.match(tela, /if \(blocker\) \{ showNotification\(blocker\.tone, blocker\.message\); return; \}/);
  assert.match(tela, /confirmBlocker=\{architectureConfirmation\.blocker\?\.message \?\? null\}/);
  assert.doesNotMatch(tela, /showNotification\("error", plan\.skipped\.length/);
});
