import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  articleRunRowsFromGates,
  buildArticleRunReadout,
  formatArticleRunBlockers,
} from "../lib/arquiteto/process-observability.ts";

const workspace = readFileSync("modules/arquiteto/arquiteto-workspace.tsx", "utf8");

/**
 * A HOMOLOGAÇÃO DE 2026-09-08, 17:30.
 *
 * A pessoa marcou UM candidato — "skincare para pele oleosa", 4 keywords — e
 * clicou em Processar artigos. A execução respondeu:
 *
 *   ARTICLES_PROCESSED = 5 · SERP_COLLECTED = 5 · BLOCKED = 5
 *   SERP concluída: 5 de 5 artigo(s) · 8 snapshot(s)
 *
 * Dois defeitos independentes:
 *
 *   1. a seleção abria a porta e nada depois dela a respeitava — os gates, o
 *      resumo e o plano de coleta liam o LOTE;
 *   2. a evidência coletada não chegava ao gate: a rota grava e relê no
 *      remoto, mas o cliente só atualizava a memória e o artefato local.
 */

const CANDIDATO = "article-candidate:territory:9da03dd0:e42cd892";

const gate = (candidateRef: string, state: string, blocksConclusion: boolean, reason: string) =>
  ({ candidateRef, state, blocksConclusion, reason });

const LOTE = [
  gate(CANDIDATO, "missing", true, "este artigo ainda não foi confrontado com a SERP."),
  gate("article-candidate:territory:9da03dd0:vitamina", "missing", true, "sem evidência."),
  gate("article-candidate:territory:9da03dd0:mascara", "missing", true, "sem evidência."),
  gate("article-candidate:territory:9da03dd0:nivea", "missing", true, "sem evidência."),
  gate("article-candidate:territory:9da03dd0:noturno", "missing", true, "sem evidência."),
];

const readout = (refs?: ReadonlySet<string>) => buildArticleRunReadout(articleRunRowsFromGates({
  gates: LOTE.filter(item => !refs || refs.has(item.candidateRef)),
  collectedInThisRun: new Set(),
  closedCandidateRefs: new Set(),
}));

/* ================= §11 · os contadores são do que foi processado ========= */

test("§11 — 1 selecionado nunca produz ARTICLES_PROCESSED = 5", () => {
  const semEscopo = readout();
  assert.equal(semEscopo.ARTICLES_PROCESSED, 5, "sem escopo, o readout descreve o lote inteiro");

  const comEscopo = readout(new Set([CANDIDATO]));
  assert.equal(comEscopo.ARTICLES_PROCESSED, 1);
  assert.equal(comEscopo.BLOCKED, 1);
  assert.equal(
    comEscopo.READY_TO_CONCLUDE + comEscopo.BLOCKED,
    1,
    "READY_TO_CONCLUDE + BLOCKED tem de fechar na seleção",
  );
});

test("§11 — candidato não selecionado não é contado como bloqueado", () => {
  const comEscopo = readout(new Set([CANDIDATO]));
  assert.equal(comEscopo.BLOCKED, 1);
  // Os outros quatro continuam sem evidência, mas não são deste run.
  assert.notEqual(comEscopo.BLOCKED, 5);
});

/* ==================== §10 · BLOCKED precisa explicar ==================== */

test("§10 — o bloqueio nomeia o artigo e o motivo, não só a contagem", () => {
  const linhas = articleRunRowsFromGates({
    gates: LOTE.filter(item => item.candidateRef === CANDIDATO),
    collectedInThisRun: new Set(),
    closedCandidateRefs: new Set(),
  });
  const detalhe = formatArticleRunBlockers(linhas, () => "skincare para pele oleosa");
  assert.match(detalhe, /skincare para pele oleosa/);
  assert.match(detalhe, /não foi confrontado com a SERP/);

  // Sem bloqueio, sem frase: nada de anunciar problema que não existe.
  assert.equal(formatArticleRunBlockers([]), "");
});

test("§10 — o identificador cru não é linguagem de tela", () => {
  const linhas = articleRunRowsFromGates({
    gates: LOTE.filter(item => item.candidateRef === CANDIDATO),
    collectedInThisRun: new Set(),
    closedCandidateRefs: new Set(),
  });
  // Sem rótulo, o fallback é o ref — mas a tela sempre passa o nome.
  assert.match(formatArticleRunBlockers(linhas), /article-candidate:/);
  assert.doesNotMatch(formatArticleRunBlockers(linhas, () => "skincare para pele oleosa"), /article-candidate:/);
});

/* ============ §1/§2 · o escopo selecionado é contrato, na fiação ========= */

test("§1/§2 — processar recorta gates, resumo e plano de coleta pela seleção", () => {
  const trecho = workspace.slice(workspace.indexOf("const processArticleFormation"));
  const corpo = trecho.slice(0, trecho.indexOf("\n  }, ["));

  // Os gates da execução saem da seleção, não do lote.
  assert.match(corpo, /\.filter\(gate => escopo\.candidateRefs\.has\(gate\.candidateRef\)\)/);
  assert.match(corpo, /const resumoSerp = summarizeArticleSerpGate\(gatesDoEscopo\)/);
  // O resumo da formação também.
  assert.match(corpo, /const resumoDaFormacao = summarizeArticleFormation\(selecionados\)/);
  // O plano de coleta vem do resumo JÁ recortado — é isso que impede a SERP
  // de pedir as 8 keywords do Silo por causa de um candidato marcado.
  assert.match(corpo, /serpGroupsForCandidates\(resumoSerp\.needsCollection\)/);
  // E os contadores anunciados são do escopo.
  assert.match(corpo, /readoutDaExecucao\(coletadosAgora, escopo\.candidateRefs\)/);
  assert.match(corpo, /anunciarBloqueios\(coletadosAgora, escopo\.candidateRefs\)/);

  // As leituras do lote inteiro não podem voltar por descuido.
  assert.doesNotMatch(corpo, /articleSerpGateSummary/);
  assert.doesNotMatch(corpo, /articleFormationSummary/);
});

/* ============== §5 · a evidência só vale depois do remoto =============== */

test("§5 — a coleta relê o remoto e só então declara a evidência disponível", () => {
  const trecho = workspace.slice(workspace.indexOf("const confirmSerpValidation"));
  const corpo = trecho.slice(0, trecho.indexOf("\n  };"));

  // A rota grava e relê no acervo; o cliente precisa buscar o que ficou lá.
  assert.match(corpo, /const canonicalPosSerp = await loadCanonicalArquitetoWorkspace\(brandContext\.id\)/);
  assert.match(corpo, /setRemoteArticleSerp\(canonicalPosSerp\.articleFormationSerp\)/);
  // Parecer que não voltou do remoto é dito, não silenciado.
  assert.match(corpo, /não voltaram do acervo/);
  // A mensagem antiga confessava não saber se tinha persistido.
  assert.doesNotMatch(workspace, /isso não comprova persistência remota/);
});

test("§9 — o gate lê a MESMA evidência que a coleta acabou de trazer", () => {
  // `articleSerpGates` lê `remoteArticleSerp`; se a coleta não o atualizasse,
  // a tela anunciaria "8 snapshots" e o gate diria "sem evidência" — que é
  // exatamente o que a homologação encontrou.
  const gates = workspace.slice(workspace.indexOf("const articleSerpGates"));
  const corpo = gates.slice(0, gates.indexOf("\n  }, ["));
  assert.match(corpo, /remoteArticleSerp\.map\(item => \[item\.candidateRef, item\.payload\]\)/);
  assert.ok(
    workspace.includes("setRemoteArticleSerp(canonicalPosSerp.articleFormationSerp)"),
    "SERP_DISPLAY_AUTHORITIES = 1: a coleta precisa alimentar a mesma fonte do gate",
  );
});

/* ============ §3 · contagem de resultados não é evidência SERP ========== */

test("§3 — RESULT_COUNT_IS_SERP_EVIDENCE = NO", () => {
  /*
   * `Resultados = 424` é métrica agregada da keyword, usada em KGR. Ela não
   * diz quais URLs estão no topo nem se duas buscas disputam a mesma página.
   * O gate da SERP não pode aceitá-la como evidência.
   */
  const gate = readFileSync("lib/arquiteto/article-serp-gate.ts", "utf8");
  assert.doesNotMatch(gate, /resultados|resultCount|numberOfResults/i);
  // A evidência do gate é o parecer com snapshots, não um número solto.
  const interpretacao = readFileSync("lib/arquiteto/article-serp-interpretation.ts", "utf8");
  assert.match(interpretacao, /organicResults|results/);
  assert.match(interpretacao, /sharedUrls/);
});
