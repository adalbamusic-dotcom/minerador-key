import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  buildArticleFormationConfirmationPlan,
  validateFormationConclusion,
} from "../lib/arquiteto/article-formation-confirmation.ts";
import { MAX_ARTICLE_KEYWORDS, buildArticleFormationUniverse } from "../lib/arquiteto/article-formation.ts";

const workspace = readFileSync("modules/arquiteto/arquiteto-workspace.tsx", "utf8");
const workbench = readFileSync("modules/arquiteto/arquiteto-workbench.tsx", "utf8");
const review = readFileSync("modules/arquiteto/article-formation-review.tsx", "utf8");
const panel = readFileSync("modules/arquiteto/article-formation-panel.tsx", "utf8");

/* ------------- §4 os motores saem da jornada principal de Artigos -------- */

test("a aba Artigos não expõe mais Lógica, SERP e IA como botões", () => {
  // Nem Artigos nem Links: as três fases operam por painel de fase, com duas
  // ações nomeadas. Links foi a última a sair do vocabulário de motor.
  assert.match(workbench, /\{mode === "links" && links\?\.panel\}/);
  assert.doesNotMatch(workbench, /\{mode !== "silos" && <div className="mt-3 flex flex-wrap items-center gap-2"/);
  // E o seletor de quatro processos deixou de existir para Artigos.
  assert.doesNotMatch(workbench, /mode === "links" \? \(\["ai", "review"\] as const\) : \(\["logic", "serp", "ai", "review"\] as const\)/);
});

test("restam duas ações principais na fase Artigos", () => {
  assert.match(panel, /data-testid="architect-process-articles"/);
  assert.match(panel, /data-testid="architect-confirm-formation"/);
  assert.match(panel, /Reprocessar artigos/);
  assert.match(panel, /Concluir formação/);
  assert.doesNotMatch(panel, /Confirmar formação/);
});

/* --------------- §6 um painel no lugar das quatro abas ------------------- */

test("o detalhe do artigo troca as abas de processo por um painel só", () => {
  assert.match(workspace, /\{articleMode \? \(\(\) => \{/);
  assert.match(workspace, /<ArticleFormationReviewPanel/);
  // Fora da fase Artigos o fluxo por processo continua exatamente como estava.
  assert.match(workspace, /\}\)\(\) : <>/);
  assert.match(workspace, /role="tablist"/);
});

test("o painel sintetiza as quatro fontes em vez de listá-las como etapas", () => {
  assert.match(review, /data-testid="architect-formation-review"/);
  for (const secao of ["Cenário atual", "Evidências", "Conclusão"]) {
    assert.ok(review.includes(secao), `falta a seção ${secao}`);
  }
  for (const rotulo of ["Lógica", "SERP", "IA"]) {
    assert.ok(review.includes(rotulo), `a evidência ${rotulo} precisa aparecer`);
  }
  // Principal, secundárias e reforços são o cenário, não quatro abas.
  assert.match(review, /Principal/);
  assert.match(review, /Secundárias/);
  assert.match(review, /Reforços/);
});

/* ------------------------ §7 controles humanos --------------------------- */

test("as oito ações de revisão têm controle na tela", () => {
  for (const testid of [
    "architect-review-make-principal",
    "architect-review-set-role",
    "architect-review-split",
    "architect-review-remove",
    "architect-review-move",
    "architect-review-move-silo",
    "architect-review-merge-preview",
  ]) {
    assert.ok(review.includes(testid), `falta o controle ${testid}`);
  }
});

test("nenhum controle materializa: o painel só propõe", () => {
  assert.doesNotMatch(review, /persistArquitetoArtifact|createVersionEnvelope|fetch\(/);
  assert.match(review, /Nenhuma delas cria ArticleDNA/);
});

/* --------------------- §8 antes/depois antes de aplicar ------------------ */

test("aplicar só existe depois da comparação", () => {
  assert.match(review, /data-testid="architect-review-comparison"/);
  assert.match(review, /data-testid="architect-review-effects"/);
  assert.match(review, /data-testid="architect-review-verdict"/);
  // O botão de aplicar vive DENTRO do bloco de comparação.
  const bloco = review.slice(review.indexOf("architect-review-comparison"));
  assert.match(bloco, /data-testid="architect-review-apply"/);
  assert.match(bloco, /data-testid="architect-review-cancel"/);
  // Recusa não oferece aplicar.
  assert.match(review, /\{!preview\.refusal && \(\s*<button/);
});

test("o antes e o depois mostram os mesmos números com os mesmos nomes", () => {
  assert.match(review, /<Snapshot title="Antes"/);
  assert.match(review, /<Snapshot title="Depois"/);
  assert.match(review, /Coerência \{article\.coherence\.value\}/);
  // Cada efeito carrega a frase que o explica.
  assert.match(review, /\{effect\.explanation\}/);
});

test("o workspace liga a proposta ao simulador, não a um cálculo próprio", () => {
  assert.match(workspace, /const scenarioPreview = useMemo\(/);
  assert.match(workspace, /simulateScenarioChange\(\{/);
  assert.match(workspace, /comparePrincipalCandidates\(\{/);
  // Aplicar continua passando pelos writers canônicos que já existiam.
  assert.match(workspace, /await changeCandidatePrincipal\(change\.candidateRef, change\.keywordId\)/);
  assert.match(workspace, /await moveKeywordToCandidate\(change\.keywordId, change\.toCandidateRef\)/);
});

/* --------------------------- §13 painel global --------------------------- */

test("o painel lê o lote com os nomes que a operação usa", () => {
  assert.match(panel, /data-testid="architect-batch-reading"/);
  for (const rotulo of [
    "Keywords analisadas", "Articles candidatos", "Agrupamentos", "Singletons",
    "Pendências", "Conflitos", "SERP analisada", "SERP sustentada", "Aguardando decisão", "Revisões humanas",
  ]) {
    assert.ok(panel.includes(rotulo), `falta o campo ${rotulo}`);
  }
});

test("nenhum número do painel é fixo no código", () => {
  const bloco = panel.slice(panel.indexOf("architect-batch-reading"), panel.indexOf("architect-legacy-articles"));
  // Cada campo da leitura precisa vir do cenário: 21 e 7 são o que o lote de
  // hoje calhou de ter, não contrato que a tela possa afirmar sozinha.
  const pares = [...bloco.matchAll(/\["([^"]+)", ([^\]]+)\]/g)];
  assert.ok(pares.length >= 8, "a leitura do lote precisa cobrir os campos da operação");
  for (const [, rotulo, valor] of pares) {
    // Cada campo vem do cenário (batch) ou do gate SERP — nunca de constante.
    assert.ok(valor.startsWith("batch.") || valor.startsWith("serpGate."),
      `o campo ${rotulo} precisa vir do cenário, e veio de ${valor}`);
  }
});

/* ------------------------- §14 portaria da conclusão --------------------- */

const kw = (id: string, keyword: string, intent = "informacional") => ({
  keywordId: id, keyword, intent, volume: 100, kgr: null,
  entity: null, problem: null, isPublished: false,
});

const universoDe = (groups: { principalKeywordId: string; keywordIds: string[] }[], keywords: ReturnType<typeof kw>[]) =>
  buildArticleFormationUniverse({
    siloRef: "territory:11111111-1111-4111-8111-111111111111",
    siloLabel: "Skin care", siloSlug: "/skin-care", groups, keywords,
  });

/** Evidência SERP vigente para todo candidato — o gate é testado à parte. */
const serpVigente = (universes: ReturnType<typeof universoDe>[]) => new Map(
  universes.flatMap(universe => universe.candidates.map(candidate => [candidate.candidateRef, {
    state: "current",
    blocksConclusion: false,
    requiresHumanDecision: false,
    reason: "A SERP vigente sustenta esta composição.",
  }])),
);

const portariaDe = (
  universes: ReturnType<typeof universoDe>[],
  keywordSiloRef: Map<string, string | null> = new Map(),
  serpGates = serpVigente(universes),
) => validateFormationConclusion({
  universes,
  plan: buildArticleFormationConfirmationPlan({ universes }),
  keywordSiloRef,
  ceiling: MAX_ARTICLE_KEYWORDS,
  serpGates,
});

test("a portaria roda antes de escrever e responde os nove contratos", () => {
  const keywords = [kw("k1", "skin care para peles oleosas"), kw("k2", "skin care pele oleosa masculina")];
  const verdict = portariaDe([universoDe([{ principalKeywordId: "k1", keywordIds: ["k1", "k2"] }], keywords)]);
  const codigos: string[] = verdict.gates.map(gate => gate.code);
  for (const esperado of [
    "SINGLE_PARENT_PER_ARTICLE", "EXACTLY_ONE_PRINCIPAL", "NO_DUPLICATED_KEYWORD", "KEYWORD_CEILING",
    "PUBLISHED_PROTECTION", "SLUG_ARCHITECTURE", "NO_CROSS_SILO_COMPOSITION", "NO_OPEN_HUMAN_CONFLICT",
    "SERP_EVIDENCE_CURRENT",
  ]) {
    assert.ok(codigos.includes(esperado), `falta o contrato ${esperado}`);
  }
  for (const gate of verdict.gates) assert.ok(gate.detail.trim().length > 0, `${gate.code} sem explicação`);
  assert.equal(verdict.ok, true);
});

test("keyword em dois artigos barra o lote inteiro", () => {
  const keywords = [kw("k1", "skin care para peles oleosas"), kw("k2", "skin care pele oleosa masculina")];
  const universe = universoDe([{ principalKeywordId: "k1", keywordIds: ["k1", "k2"] }], keywords);
  // Duplicação forçada: o mesmo id em dois candidatos do cenário.
  const duplicado = {
    ...universe,
    candidates: [...universe.candidates, { ...universe.candidates[0], candidateRef: "outro" }],
  };
  const verdict = portariaDe([duplicado]);
  assert.equal(verdict.ok, false);
  assert.equal(verdict.gates.find(gate => gate.code === "NO_DUPLICATED_KEYWORD")?.ok, false);
});

test("composição que atravessa Silo não vira ArticleDNA", () => {
  const keywords = [kw("k1", "skin care para peles oleosas"), kw("k2", "skin care pele oleosa masculina")];
  const verdict = portariaDe(
    [universoDe([{ principalKeywordId: "k1", keywordIds: ["k1", "k2"] }], keywords)],
    new Map([["k2", "territory:99999999-9999-4999-8999-999999999999"]]),
  );
  assert.equal(verdict.ok, false);
  assert.match(verdict.gates.find(gate => gate.code === "NO_CROSS_SILO_COMPOSITION")!.detail, /Silos diferentes/);
});

test("dúvida isolada não vira impasse do lote inteiro", () => {
  // Slug recusado e conflito aberto já mantêm o candidato fora pelo plano;
  // travar a revisão inteira por causa deles seria trocar decisão por espera.
  const keywords = [kw("k1", "skin care para peles oleosas"), kw("k2", "cremes skin care")];
  const universe = universoDe([
    { principalKeywordId: "k1", keywordIds: ["k1"] },
    { principalKeywordId: "k2", keywordIds: ["k2"] },
  ], keywords);
  const comConflito = {
    ...universe,
    candidates: universe.candidates.map((candidate, index) =>
      index === 0 ? { ...candidate, conflicts: ["ambiguidade declarada"] } : candidate),
  };
  const verdict = portariaDe([comConflito]);
  assert.equal(verdict.gates.find(gate => gate.code === "NO_OPEN_HUMAN_CONFLICT")?.ok, false);
  assert.equal(verdict.ok, true, "o que estava pronto continua podendo ser concluído");
});

test("o clique de concluir passa pela portaria antes de materializar", () => {
  const trecho = workspace.slice(workspace.indexOf("const confirmArticleFormation"));
  const corpo = trecho.slice(0, trecho.indexOf("\n  }, ["));
  const portaria = corpo.indexOf("validateFormationConclusion");
  const escrita = corpo.indexOf("materializeApprovedArticleDnas");
  assert.ok(portaria > -1 && escrita > -1, "portaria e escrita precisam existir");
  assert.ok(portaria < escrita, "a portaria precisa rodar ANTES da escrita");
  assert.match(corpo, /if \(!portaria\.ok\)/);
  assert.match(panel, /data-testid="architect-conclusion-gates"/);
});
