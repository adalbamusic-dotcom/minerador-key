import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  allintitleBlockAuthorization,
  allintitlePrincipalsOfProcessing,
  createProcessingCostDialog,
  planNeedsCostDialog,
  type ProcessingCostAsk,
} from "../lib/arquiteto/article-processing-click.ts";
import { buildArticleAllintitlePlan } from "../lib/arquiteto/article-allintitle.ts";
import { declaredPrincipalLockedMessage } from "../lib/arquiteto/declared-plan-formation.ts";
import { architectArticleNoticeLabel } from "../lib/arquiteto/article-notice-label.ts";
import type { SerpPaidPlan, SerpPaidPlanChoice } from "../lib/arquiteto/serp-lens-plan.ts";

/*
 * SDD `docs/compartilhado/sdd-acelerar-fluxo-do-plano-2026-10-13.md`, F1:
 * item 3 ("Processar artigos" num clique e num diálogo; allintitle só com
 * "Aplicar KGR: Sim") e item 12 (mensagens com o caminho inteiro). Domínio puro
 * e leitura estrutural da tela, sem comentários; nenhuma chamada paga.
 */

const semComentarios = (texto: string) => texto
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .split("\n")
  .filter(linha => !linha.trimStart().startsWith("//"))
  .join("\n");
const workspace = semComentarios(readFileSync("modules/arquiteto/arquiteto-workspace.tsx", "utf8"));

const plano = (paid: number, extra: Partial<SerpPaidPlan> = {}): SerpPaidPlan => ({
  lenses: ["desktop-windows"], perLens: [], paidQueries: paid, primaryPaidQueries: paid, extraPaidQueries: 0, conditionalPaidQueries: 0,
  recollectableQueries: 0, estimatedCostUsd: { min: 0, max: 0 }, collectedAtSpreadDays: 0, datesDiverge: false,
  payMissingExtraLenses: true, recollectStaleLenses: false, digestChecked: false, ...extra,
});
const todas = (plan: SerpPaidPlan): SerpPaidPlanChoice => ({ authorizedPaidQueries: plan.paidQueries, payMissingExtraLenses: plan.payMissingExtraLenses, recollectStaleLenses: false });

function gravador(responder: (plan: SerpPaidPlan) => SerpPaidPlanChoice | null) {
  const chamadas: Array<{ title: string; plan: SerpPaidPlan }> = [];
  const ask: ProcessingCostAsk = async (title, plan) => {
    chamadas.push({ title, plan });
    return responder(plan);
  };
  return { ask, chamadas };
}

test("item 3 · allintitle só para o artigo com 'Aplicar KGR: Sim', uma vez por principal", () => {
  const candidatos = [
    { candidateRef: "a", principalKeywordId: "k1", kgr: true },
    { candidateRef: "b", principalKeywordId: "k2", kgr: false },
    { candidateRef: "c", principalKeywordId: "k1", kgr: true },
    { candidateRef: "d", principalKeywordId: "k3", kgr: true },
  ];
  assert.deepEqual(allintitlePrincipalsOfProcessing(candidatos, candidate => candidate.kgr), ["k1", "k3"]);
  // "não aplicável" (o padrão) em todos: nada é medido nem perguntado.
  assert.deepEqual(allintitlePrincipalsOfProcessing(candidatos, () => false), []);
});

test("item 3 · um diálogo: o primeiro plano com custo leva o allintitle somado; o resto do clique não pergunta", async () => {
  const allintitle = buildArticleAllintitlePlan([{ kind: "to_pay", reason: "x" }, { kind: "to_pay", reason: "y" }]);
  const { ask, chamadas } = gravador(todas);
  const dialogo = createProcessingCostDialog({ ask, extra: { title: "allintitle de 2", plan: allintitle } });
  const lote = await dialogo.ask("SERP do lote", plano(10), false);
  assert.equal(chamadas.length, 1);
  assert.equal(chamadas[0].plan.paidQueries, 12, "SERP do lote (10) + allintitle (2) num total só");
  assert.match(chamadas[0].title, /SERP do lote \+ allintitle de 2/);
  assert.equal(lote?.authorizedPaidQueries, 12);
  // Validação com lacuna depois do diálogo: segue pelo cache, sem perguntar.
  const validacao = await dialogo.ask("Validar SERP", plano(3), true, true);
  assert.equal(chamadas.length, 1, "nenhum segundo diálogo");
  assert.equal(validacao?.cacheOnly, true);
  assert.equal(dialogo.deferredPaidQueries, 3);
  // Validação sem custo depois do diálogo: segue direto, sem pagar.
  assert.equal((await dialogo.ask("Validar SERP", plano(0), true, true))?.authorizedPaidQueries, 0);
  // O allintitle usa a escolha do diálogo somado.
  const escolha = await dialogo.extraChoice();
  assert.equal(escolha?.authorizedPaidQueries, 12);
  assert.equal(chamadas.length, 1);
});

test("item 3 · cancelar = US$ 0: o allintitle não é medido e a validação segue pelo cache", async () => {
  const allintitle = buildArticleAllintitlePlan([{ kind: "to_pay", reason: "x" }]);
  const { ask, chamadas } = gravador(() => null);
  const dialogo = createProcessingCostDialog({ ask, extra: { title: "allintitle", plan: allintitle } });
  assert.equal(await dialogo.ask("SERP do lote", plano(4), false), null);
  assert.equal((await dialogo.ask("Validar SERP", plano(2), true, true))?.cacheOnly, true);
  assert.equal(await dialogo.extraChoice(), null);
  assert.equal(chamadas.length, 1);
});

test("item 3 · SERP toda no cache: o allintitle com custo vai no primeiro passo e é o único diálogo", async () => {
  const allintitle = buildArticleAllintitlePlan([{ kind: "to_pay", reason: "x" }]);
  const { ask, chamadas } = gravador(todas);
  const dialogo = createProcessingCostDialog({ ask, extra: { title: "allintitle", plan: allintitle } });
  await dialogo.ask("SERP do lote", plano(0), false);
  await dialogo.ask("Validar SERP", plano(0), true, true);
  assert.equal(chamadas.length, 1);
  assert.equal(chamadas[0].plan.paidQueries, 1, "só o allintitle custa");
  assert.equal((await dialogo.extraChoice())?.authorizedPaidQueries, 1);
  assert.equal(chamadas.length, 1);
});

test("item 3 · sem passo de SERP no clique (nada a coletar nem validar): o allintitle pergunta sozinho, uma vez", async () => {
  const allintitle = buildArticleAllintitlePlan([{ kind: "to_pay", reason: "x" }, { kind: "to_pay", reason: "y" }]);
  const { ask, chamadas } = gravador(todas);
  const dialogo = createProcessingCostDialog({ ask, extra: { title: "allintitle", plan: allintitle } });
  assert.equal((await dialogo.extraChoice())?.authorizedPaidQueries, 2);
  assert.equal((await dialogo.extraChoice())?.authorizedPaidQueries, 2);
  assert.equal(chamadas.length, 1);
  assert.ok(planNeedsCostDialog(chamadas[0].plan));
});

test("item 3 · allintitle sem custo (reaproveitado) não pergunta; 'tentar ler de novo' não conta como decisão", async () => {
  const reaproveitado = buildArticleAllintitlePlan([{ kind: "arquiteto", resultCount: 3, measuredAt: "2026-10-01T00:00:00.000Z" }]);
  let primeira = true;
  const { ask, chamadas } = gravador(plan => {
    if (primeira) { primeira = false; return { authorizedPaidQueries: 0, payMissingExtraLenses: false, recollectStaleLenses: false, retryCacheRead: true }; }
    return todas(plan);
  });
  const dialogo = createProcessingCostDialog({ ask, extra: { title: "allintitle", plan: reaproveitado } });
  assert.equal((await dialogo.ask("Validar SERP", plano(5), true, true))?.retryCacheRead, true);
  assert.equal(dialogo.decided, false);
  assert.equal((await dialogo.ask("Validar SERP", plano(5), true, true))?.authorizedPaidQueries, 5);
  assert.equal(chamadas.length, 2);
  assert.equal((await dialogo.extraChoice())?.authorizedPaidQueries, 0);
  assert.equal(chamadas.length, 2);
});

test("item 3 · o allintitle de um bloco nunca passa do total que a pessoa viu", () => {
  assert.equal(allintitleBlockAuthorization(4, 10), 4);
  assert.equal(allintitleBlockAuthorization(4, 2), 2);
  assert.equal(allintitleBlockAuthorization(4, 0), 0);
  assert.equal(allintitleBlockAuthorization(4, -1), 0);
});

test("item 3 · a tela: um diálogo por clique, releitura no mesmo clique, allintitle só com KGR Sim", () => {
  const processar = workspace.slice(workspace.indexOf("const processArticleFormation = useCallback("), workspace.indexOf("const processArticleFormationRef = useRef("));
  assert.match(processar, /allintitlePrincipalsOfProcessing\(/);
  assert.match(processar, /readArticleKgrDecision\(\{[\s\S]*?\}\)\.applyKgr/);
  assert.match(processar, /createProcessingCostDialog\(\{ ask: askSerpPaidPlan, extra: planoDoAllintitle \}\)/);
  assert.match(processar, /collectArticleBatchSerpRef\.current\(silosDoLote, \{ ask: dialogoDoClique\.ask \}\)/);
  assert.match(processar, /confirmSerpValidation\(pendentes, \{ ask: dialogoDoClique\.ask \}\)/);
  assert.match(processar, /measureArticleAllintitleRef\.current\(principaisComKgr, false, true, \{ choice: escolha, ceiling: planoDoAllintitle\.plan\.paidQueries \}\)/);
  // Nada de medir o allintitle de toda principal do escopo.
  assert.doesNotMatch(processar, /principaisDoEscopo/);
  assert.doesNotMatch(workspace, /clique em Processar artigos de novo/);
  // A medição avulsa ("Medir allintitle (pago)") continua com o diálogo próprio.
  const medir = workspace.slice(workspace.indexOf("const measureArticleAllintitle = async"), workspace.indexOf("const measureArticleAllintitleRef = useRef"));
  assert.match(medir, /preauthorized\s*\?\s*preauthorized\.choice\s*:\s*await askSerpPaidPlan\(/);
});

test("item 12 · a principal travada diz o caminho inteiro para trocar", () => {
  const texto = declaredPrincipalLockedMessage("internet claro");
  assert.match(texto, /travada no plano \(“internet claro”\)/);
  assert.match(texto, /Minerador → Cadastrar Assuntos → trava "Livre" → aprovar e enviar a keyword ao Arquiteto/);
  const formacao = semComentarios(readFileSync("lib/arquiteto/declared-plan-formation.ts", "utf8"));
  assert.match(formacao, /reason: declaredPrincipalLockedMessage\(fixa\.phrase\)/);
});

test("item 12 · a recusa do envio ao Radar nomeia o artigo por Assunto e slug, não pela promise", () => {
  assert.equal(architectArticleNoticeLabel({ subjectPhrase: "Internet na zona rural", principal: "internet rural", slug: "/internet-rural", fallback: "a1" }), "Assunto “Internet na zona rural” · /internet-rural");
  assert.equal(architectArticleNoticeLabel({ principal: "internet rural", slug: "internet-rural", fallback: "a1" }), "internet rural · /internet-rural");
  assert.equal(architectArticleNoticeLabel({ fallback: "a1" }), "a1");
  const enviar = workspace.slice(workspace.indexOf("const sendSelectedToRadar = async"), workspace.indexOf("const sendSelectedToRadar = async") + 6000);
  assert.doesNotMatch(enviar, /semSilo\.push\(`\$\{entry\.version\.payload\.promise\}/);
  assert.match(enviar, /semSilo\.push\(`\$\{nomeDoArtigo\(item\.articleId, item\.label\)\}/);
});
