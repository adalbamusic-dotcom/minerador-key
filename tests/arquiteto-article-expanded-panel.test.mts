import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { readArticleExpandedPanelKeywordFacts, summarizeArticleExpandedPanel } from "../lib/arquiteto/article-expanded-panel.ts";

const principal = {
  id: "kw-main",
  keyword: "marketing online",
  volume_search: 33100,
  results_allintitle: 411,
  intent: "Informacional",
  kgr: 0.012,
  funnel: "TOFU",
  analise_semantica: { kgr_aplicabilidade: "applicable" },
};

test("resumo do painel preserva a Principal, nulos e conflitos sem criar nova intenção ou funil", () => {
  const summary = summarizeArticleExpandedPanel(principal, [
    { id: "kw-support", keyword: "marketing digital", volume_search: 15300, results_allintitle: 0, intent: "Informacional", kgr: null, funnel: "TOFU" },
    { id: "kw-conflict", keyword: "marketing para clínica", volume_search: null, results_allintitle: null, intent: "Comercial", funnel: "MOFU" },
  ]);

  assert.equal(summary.volume.principal, 33100);
  assert.equal(summary.volume.total, 48400);
  assert.equal(summary.volume.average, 24200);
  assert.equal(summary.results.principal, 411);
  assert.equal(summary.results.total, 411);
  assert.equal(summary.results.average, 205.5);
  assert.equal(summary.intent.principal, "Informacional");
  assert.equal(summary.funnel.principal, "TOFU");
  assert.equal(summary.intent.conflicts, 1);
  assert.equal(summary.funnel.conflicts, 1);
  assert.equal(summary.compatibility.conflicts, 1);
  assert.equal(summary.kgr.principal, 0.012);
  assert.equal(summary.kgr.label, "Aplicável");
});

test("fatos do painel leem a intenção e o funil canônicos upstream sem derivação do Arquiteto", () => {
  const facts = readArticleExpandedPanelKeywordFacts({
    id: "kw-local",
    keyword: "clínica perto de mim",
    volume_search: 120,
    results_allintitle: 0,
    intent: null,
    funnel: null,
    kgr_score: 0.4,
    analise_semantica: {
      intencao_principal: "Local",
      funnel: "BOFU",
      kgr_aplicabilidade: "not_applicable",
    },
  });

  assert.equal(facts.intent, "Local");
  assert.equal(facts.funnel, "BOFU");
  assert.equal(facts.kgr.label, "Não aplicável");
  assert.equal(facts.kgr.value, 0.4);
});

test("KGR zero e ausência real permanecem distintos, e o decimal fica preservado no perfil completo", () => {
  const zero = readArticleExpandedPanelKeywordFacts({
    id: "kw-zero",
    keyword: "zero real",
    volume_search: 0,
    results_allintitle: 0,
    kgr: 0,
    analise_semantica: { kgr_aplicabilidade: "applicable" },
  });
  const absent = readArticleExpandedPanelKeywordFacts({
    id: "kw-absent",
    keyword: "sem medição",
    volume_search: null,
    results_allintitle: null,
    kgr: null,
  });

  assert.equal(zero.kgr.value, 0);
  assert.equal(zero.kgr.label, "Aplicável");
  assert.equal(absent.kgr.value, null);
  assert.equal(absent.kgr.label, "Pendente");
});

test("painel expandido mostra fatos da Principal, aplicabilidade do KGR e compatibilidade fora dos processos", () => {
  const workspace = readFileSync("modules/arquiteto/arquiteto-workspace.tsx", "utf8");
  assert.match(workspace, /data-testid="architect-article-expanded-panel"/);
  assert.match(workspace, /lg:grid-cols-2/);
  assert.match(workspace, /Resumo do artigo/);
  assert.match(workspace, /Compatibilidade/);
  assert.match(workspace, /KeywordDnaReadonlyPanel/);
  assert.match(workspace, /role="Principal"/);
  assert.match(workspace, /art\.supportKeywords\.map\(\(keyword, index\) => <KeywordDnaReadonlyPanel/);
  assert.match(readFileSync("components/editorial/article-dna-readonly-panel.tsx", "utf8"), /Ver definição completa do artigo/);
  assert.match(readFileSync("components/editorial/keyword-dna-readonly-panel.tsx", "utf8"), /Ver perfil completo da keyword/);
  assert.match(workspace, /\["logic", "serp", "ai", "review"\]/);
  assert.match(workspace, /A SERP observa compatibilidade e conflitos; não movimenta keywords\./);
  assert.match(workspace, /Links internos/);
  assert.match(workspace, /nenhum silo é criado por este painel/i);
  assert.doesNotMatch(workspace, /expandedPanelSummary\.funnel\.distribution/);
  assert.doesNotMatch(workspace, /expandedPanelSummary\.kgr\.eligibleCount/);
});
