import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

/**
 * A IA do Minerador tem um único ponto de acionamento: o botão IA da barra de
 * processos. O painel da keyword é somente informativo.
 * REAL_AI_CALLS_IN_TESTS = 0.
 */

const workspace = readFileSync(new URL("../modules/minerador/minerador-workspace.tsx", import.meta.url), "utf8");
const panel = readFileSync(new URL("../components/editorial/dna-panels.tsx", import.meta.url), "utf8");
const route = readFileSync(new URL("../app/api/minerador/marcas/[brandId]/ia/brief-apresentacao/route.ts", import.meta.url), "utf8");

const presentationBlock = panel.slice(
  panel.indexOf("<section data-keyword-contextual-presentation"),
  panel.indexOf('<section aria-label="Fatos medidos somente leitura"'),
);
const contextualHandler = workspace.slice(
  workspace.indexOf("const runContextualPresentation"),
  workspace.indexOf("const handleOpenHumanReview"),
);

test("A — o painel não possui nenhum botão de geração e a barra mantém o único IA", () => {
  assert.ok(!presentationBlock.includes("<button"), "o painel da apresentação não pode ter botão de execução");
  for (const forbidden of ["Gerar novamente", "Gerar apresentação", "Reprocessar", "Tentar novamente"]) {
    assert.ok(!panel.includes(forbidden), `o painel não pode oferecer "${forbidden}"`);
  }
  assert.ok(!panel.includes("onGeneratePresentationBrief"), "o gatilho local foi removido do contrato do painel");
  assert.ok(!workspace.includes("onGeneratePresentationBrief"), "o workspace não passa mais gatilho ao painel");
  const triggers = workspace.match(/handleBatchContextualPresentation\(/g) || [];
  assert.equal(triggers.length, 1, "existe um único acionamento da apresentação no workspace");
});

test("B — clicar IA executa uma chamada contextual explícita", () => {
  assert.ok(workspace.includes("onClick={() => void handleBatchContextualPresentation()}"));
  assert.match(contextualHandler, /ia\/brief-apresentacao/);
  assert.match(contextualHandler, /method: "POST"/);
  const requests = contextualHandler.match(/await fetch\(/g) || [];
  assert.equal(requests.length, 1, "uma execução por keyword faz uma única requisição");
});

test("C — com apresentação existente o painel continua sem botão", () => {
  assert.match(presentationBlock, /presentationBrief && <details data-keyword-contextual-presentation-content/);
  assert.match(presentationBlock, /Gerada nesta sessão · não persistida/);
  assert.ok(!presentationBlock.includes("onClick"));
});

test("D — reexecutar é o mesmo processo, sem conceito separado", () => {
  assert.ok(!workspace.includes("handleBatchContextualPresentationFor"), "não existe handler separado de reexecução");
  assert.match(workspace, /A reexecução pelo painel usa este mesmo caminho|Ação IA do Processador/);
  assert.match(contextualHandler, /setProcessAttempt\(\[item\.id\], "ai", "running", executionRequestId\)/);
});

test("E — reexecução que falha preserva a working copy anterior", () => {
  const failureBranch = contextualHandler.slice(
    contextualHandler.indexOf("if (!response.ok"),
    contextualHandler.indexOf("setPresentationBriefs"),
  );
  assert.match(failureBranch, /return \{ ok: false/);
  assert.ok(!failureBranch.includes("setPresentationBriefs"), "a falha não pode limpar a apresentação anterior");
  // Nada é apagado antes da chamada: só o sucesso escreve a working copy.
  const beforeRequest = contextualHandler.slice(0, contextualHandler.indexOf("await fetch("));
  assert.ok(!beforeRequest.includes("setPresentationBriefs"), "a working copy não é limpa antes da tentativa");
  assert.match(contextualHandler, /setProcessAttempt\(\[item\.id\], "ai", "failed", executionRequestId\)/);
});

test("F — reexecução persistida substitui a versão canônica; sem write vira tentativa", () => {
  assert.ok(contextualHandler.includes("if (generatedBrief.persisted) {"));
  assert.ok(contextualHandler.includes("setPresentationBriefs(current => ({ ...current, [keywordId]: generatedBrief }))"));
  assert.ok(contextualHandler.includes("setPresentationAttempts(current => ({ ...current, [keywordId]: generatedBrief }))"));
  assert.ok(contextualHandler.includes("persisted: payload.persisted === true"));
});

test("G — nenhuma chamada automática em mount, GET ou F5", () => {
  assert.ok(!route.includes("export async function GET"));
  assert.match(route, /export async function POST/);
  assert.ok(!workspace.includes("useEffect(() => { void handleBatchContextualPresentation"));
  assert.ok(!workspace.includes("useEffect(() => { void runContextualPresentation"));
});

test("o InfoHint do processo IA descreve só a apresentação contextual", () => {
  const aiAction = workspace.slice(workspace.indexOf('label="IA"') - 900, workspace.indexOf('label="IA"') + 300);
  assert.match(aiAction, /Gera ou reexecuta a apresentação contextual da keyword usando o contexto aprovado da Marca e sua Voz da Marca/);
  // Reexecutar a IA é isolado: o InfoHint declara a independência ao usuário.
  assert.match(aiAction, /não altera nenhum outro processo, nem a aprovação/);
  for (const forbidden of ["revisão semântica", "Intenção", "Funil", "SERP", "R5"]) {
    assert.ok(!aiAction.includes(forbidden), `o InfoHint da IA não pode mencionar ${forbidden}`);
  }
});
