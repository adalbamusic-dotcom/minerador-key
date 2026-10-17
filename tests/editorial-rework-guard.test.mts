/**
 * F5 · GUARDA DE RETRABALHO — DOMÍNIO (SDD 2026-10-12 §10).
 *
 * Os cinco vereditos, a impressão digital, a linha `operation_ledger` (últimas
 * 20 tentativas), a decisão de rodar ("Refazer mesmo assim" só com motivo e
 * nunca para o plano), o histórico do grupo e a guarda na gravação do
 * ArticleDNA (contradição do plano e caminho paralelo). Fixtures, sem rede.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import {
  appendReworkLedgerAttempt,
  assessRework,
  decideRework,
  formatReworkWhen,
  operationFingerprint,
  readReworkLedgerPayload,
  readReworkView,
  reworkHistoryEntries,
  reworkLedgerSubjectId,
  reworkPreviousFromLedger,
  reworkView,
  REWORK_LEDGER_ATTEMPTS_LIMIT,
  REWORK_LEDGER_SUBJECT_TYPE,
  REWORK_REFUSAL_CODES,
  type ReworkAttempt,
  type ReworkPrevious,
} from "../lib/editorial/rework-guard.ts";
import { declaredPlanArticleContradictions, declaredPlanParallelPath } from "../lib/arquiteto/declared-plan-rework.ts";
import { improvementReworkPrevious } from "../lib/arquiteto/article-improvement-reuse.ts";

const ATOR = "0f1e2d3c-4b5a-4968-8776-655443322110";
const tentativa = (extra: Partial<ReworkAttempt> = {}): ReworkAttempt => ({ at: "2026-10-12T20:41:00.000Z", actorId: ATOR, outcome: "refused", outcomeCode: "SILO_PAGE_APPROVAL_CANONICAL_MISSING", resultRef: "territory:abc", costUsd: 0, message: "Declare o site da marca", ...extra });
const anterior = (extra: Partial<ReworkPrevious> = {}): ReworkPrevious => ({ kind: "silo_consolidation", fingerprint: "sha256:aaa", at: "2026-10-12T20:41:00.000Z", actorId: ATOR, outcome: "refused", outcomeCode: "SILO_PAGE_APPROVAL_CANONICAL_MISSING", resultRef: null, costUsd: 0, message: "Declare o site da marca", attempts: 1, source: "operation_ledger", ...extra });

test("F5-1 · impressão digital: ordem de chave e undefined não mudam; insumo diferente muda; o tipo entra", async () => {
  const a = await operationFingerprint("silo_consolidation", { b: 2, a: 1, c: undefined });
  const b = await operationFingerprint("silo_consolidation", { a: 1, b: 2 });
  assert.equal(a, b);
  assert.match(a, /^sha256:[a-f0-9]{64}$/);
  assert.notEqual(a, await operationFingerprint("silo_consolidation", { a: 1, b: 3 }));
  assert.notEqual(a, await operationFingerprint("silo_article_withdrawal", { a: 1, b: 2 }), "a mesma entrada em outra operação é outra linha");
  assert.equal(reworkLedgerSubjectId("silo_consolidation", a), `silo_consolidation:${a}`);
  assert.equal(REWORK_LEDGER_SUBJECT_TYPE, "operation_ledger");
});

test("F5-2 · vereditos: fresh, same_inputs_reuse, same_refusal, contradicts_declared, parallel_path (§10.2)", () => {
  const base = { kind: "silo_consolidation" as const, fingerprint: "sha256:aaa" };
  assert.equal(assessRework({ ...base, previous: null }).verdict, "fresh");
  const reuse = assessRework({ ...base, previous: anterior({ outcome: "succeeded", outcomeCode: "OK", message: null }) });
  assert.equal(reuse.verdict, "same_inputs_reuse");
  assert.equal(reuse.blocks, false, "o padrão devolve o resultado anterior");
  assert.equal(reuse.canOverride, true);
  const recusa = assessRework({ ...base, previous: anterior() });
  assert.equal(recusa.verdict, "same_refusal");
  assert.equal(recusa.blocks, true);
  assert.equal(recusa.code, REWORK_REFUSAL_CODES.same_refusal);
  assert.match(recusa.message, /^A mesma recusa aconteceu em 12\/10 às 17:41: Declare o site da marca\. Nada mudou desde então/);
  const plano = assessRework({ ...base, previous: anterior(), declared: { contradictions: ["a principal deixaria de ser a declarada."] } });
  assert.equal(plano.verdict, "contradicts_declared", "o plano vence a repetição");
  assert.equal(plano.canOverride, false);
  assert.equal(plano.code, "DECLARED_PLAN_CONTRADICTION");
  assert.match(plano.message, /não há “refazer mesmo assim”/);
  const paralelo = assessRework({ ...base, previous: null, declared: { parallelPaths: ["artigo solto em grupo com plano."] } });
  assert.equal(paralelo.verdict, "parallel_path");
  assert.equal(paralelo.code, "REWORK_PARALLEL_PATH");
  assert.equal(paralelo.canOverride, false);
  // Outro fingerprint ou outra operação não é "o mesmo".
  assert.equal(assessRework({ ...base, fingerprint: "sha256:bbb", previous: anterior() }).verdict, "fresh");
  assert.equal(assessRework({ kind: "silo_article_withdrawal", fingerprint: "sha256:aaa", previous: anterior() }).verdict, "fresh");
});

test("F5-3 · política por operação: same_inputs block/ignore e same_refusal inform", () => {
  const base = { kind: "silo_consolidation" as const, fingerprint: "sha256:aaa" };
  const bloqueia = assessRework({ ...base, previous: anterior({ outcome: "succeeded" }), policy: { sameInputs: "block", sameRefusal: "block" } });
  assert.equal(bloqueia.blocks, true);
  assert.equal(bloqueia.code, "REWORK_SAME_INPUTS");
  assert.equal(assessRework({ ...base, previous: anterior({ outcome: "succeeded" }), policy: { sameInputs: "ignore", sameRefusal: "block" } }).verdict, "fresh");
  const avisa = assessRework({ ...base, previous: anterior(), policy: { sameInputs: "reuse", sameRefusal: "inform" } });
  assert.equal(avisa.verdict, "same_refusal");
  assert.equal(avisa.blocks, false);
});

test("F5-4 · Refazer mesmo assim: só com motivo, nunca para plano nem caminho paralelo (D11)", () => {
  const base = { kind: "silo_consolidation" as const, fingerprint: "sha256:aaa" };
  const recusa = assessRework({ ...base, previous: anterior() });
  assert.deepEqual(decideRework(recusa), { proceed: false, code: "REWORK_SAME_REFUSAL", message: recusa.message });
  assert.equal(decideRework(recusa, { reason: "ok" }).proceed, false, "motivo curto demais não vale");
  assert.deepEqual(decideRework(recusa, { reason: "  o site mudou no provedor  " }), { proceed: true, overridden: true, overrideReason: "o site mudou no provedor" });
  const plano = assessRework({ ...base, previous: null, declared: { contradictions: ["x"] } });
  assert.equal(decideRework(plano, { reason: "quero assim mesmo" }).proceed, false);
  const paralelo = assessRework({ ...base, previous: null, declared: { parallelPaths: ["y"] } });
  assert.equal(decideRework(paralelo, { reason: "quero assim mesmo" }).proceed, false);
  assert.deepEqual(decideRework(assessRework({ ...base, previous: null }), { reason: "motivo à toa" }), { proceed: true, overridden: false, overrideReason: null }, "motivo sem nada a refazer não vira override");
  const reuse = assessRework({ ...base, previous: anterior({ outcome: "succeeded" }) });
  assert.deepEqual(decideRework(reuse, { reason: "outra leitura da IA" }), { proceed: true, overridden: true, overrideReason: "outra leitura da IA" });
});

test("F5-5 · a linha do guarda: mesma linha por insumo, últimas 20 tentativas, falha transitória não é a mesma recusa", () => {
  let payload: unknown = null;
  for (let i = 0; i < REWORK_LEDGER_ATTEMPTS_LIMIT + 5; i += 1) {
    payload = appendReworkLedgerAttempt(payload, { kind: "silo_consolidation", fingerprint: "sha256:aaa", groupId: "11111111-1111-4111-8111-111111111111", inputsSummary: "Fechamento do Silo" }, tentativa({ at: new Date(Date.UTC(2026, 9, 12, 12, i)).toISOString() }));
  }
  const lido = readReworkLedgerPayload(JSON.parse(JSON.stringify(payload)));
  assert.ok(lido);
  assert.equal(lido!.attempts.length, REWORK_LEDGER_ATTEMPTS_LIMIT);
  assert.equal(lido!.attempts[0].at, new Date(Date.UTC(2026, 9, 12, 12, 5)).toISOString(), "as mais antigas saem");
  assert.equal(lido!.groupId, "11111111-1111-4111-8111-111111111111");
  // Falha de rede depois da recusa: a anterior decisiva continua sendo a recusa.
  const comFalha = appendReworkLedgerAttempt(payload, { kind: "silo_consolidation", fingerprint: "sha256:aaa", inputsSummary: "x" }, tentativa({ at: "2026-10-12T23:00:00.000Z", outcome: "failed", outcomeCode: "INDETERMINATE" }));
  const previo = reworkPreviousFromLedger(comFalha);
  assert.equal(previo?.outcome, "refused");
  assert.equal(previo?.attempts, REWORK_LEDGER_ATTEMPTS_LIMIT - 1);
  // Só falhas = nada decisivo = fresh.
  const soFalha = appendReworkLedgerAttempt(null, { kind: "silo_consolidation", fingerprint: "sha256:bbb", inputsSummary: "x" }, tentativa({ outcome: "failed" }));
  assert.equal(reworkPreviousFromLedger(soFalha), null);
  // Outra operação no payload não contamina: a identidade é da base.
  const outra = appendReworkLedgerAttempt(payload, { kind: "silo_article_withdrawal", fingerprint: "sha256:aaa", inputsSummary: "x" }, tentativa());
  assert.equal(outra.attempts.length, 1);
  assert.equal(readReworkLedgerPayload({ kind: "inventado", fingerprint: "x", attempts: [] }), null);
});

test("F5-6 · histórico do grupo: uma linha por tentativa, mais nova primeiro, filtro por grupo", () => {
  const g1 = "11111111-1111-4111-8111-111111111111", g2 = "22222222-2222-4222-8222-222222222222";
  const a = appendReworkLedgerAttempt(null, { kind: "silo_article_withdrawal", fingerprint: "sha256:a", groupId: g1, inputsSummary: "Retirar" }, tentativa({ outcome: "succeeded", at: "2026-10-12T18:00:00.000Z", outcomeCode: "ARTICLE_WITHDRAWN" }));
  const b = appendReworkLedgerAttempt(null, { kind: "silo_declared_plan_apply", fingerprint: "sha256:b", groupId: g2, inputsSummary: "Plano" }, tentativa({ outcome: "refused", at: "2026-10-12T19:00:00.000Z", outcomeCode: "OUT_OF_PLAN", overrideReason: null }));
  const todas = reworkHistoryEntries([a, b, { lixo: true }]);
  assert.deepEqual(todas.map(item => [item.kind, item.outcome]), [["silo_declared_plan_apply", "refused"], ["silo_article_withdrawal", "succeeded"]]);
  assert.equal(todas[1].label, "Retirar artigo do Silo");
  assert.deepEqual(reworkHistoryEntries([a, b], { groupId: g1 }).map(item => item.kind), ["silo_article_withdrawal"]);
});

test("F5-7 · a projeção que prévias e o MCP devolvem (rework: { verdict, previous })", () => {
  const recusa = assessRework({ kind: "silo_consolidation", fingerprint: "sha256:aaa", previous: anterior() });
  const view = reworkView(recusa)!;
  assert.deepEqual(Object.keys(view).sort(), ["blocks", "canOverride", "code", "message", "previous", "reasons", "verdict"]);
  assert.deepEqual(readReworkView(JSON.parse(JSON.stringify(view))), view);
  assert.equal(readReworkView({ verdict: "talvez" }), null);
  assert.equal(formatReworkWhen("2026-10-12T20:30:00.000Z"), "12/10 às 17:30");
  assert.equal(formatReworkWhen("ontem"), "ontem");
});

test("F5-8 · a execução da melhoria é o registro dela: 'Já feito com os mesmos insumos em … — 8 alvos, IA leu a lista'", () => {
  const previo = improvementReworkPrevious({ version: 1, runId: "11111111-1111-4111-8111-111111111111", brandId: "b", createdAt: "2026-10-12T20:30:00.000Z", inputsHash: "h".repeat(64), keywords: [], editorialAi: { status: "answered", askedTargetIds: [], listSize: 3, picks: [], rejected: [], rejectedCount: 0 }, targets: new Array(8).fill({}), costs: { paidQueries: 0 }, state: "prepared", actorId: ATOR });
  assert.equal(previo?.source, "article_improvement_run");
  assert.equal(previo?.resultRef, "11111111-1111-4111-8111-111111111111");
  const veredito = assessRework({ kind: "article_improvement_prepare", fingerprint: "h".repeat(64), previous: previo, policy: { sameInputs: "reuse", sameRefusal: "inform" } });
  assert.equal(veredito.verdict, "same_inputs_reuse");
  assert.equal(veredito.blocks, false);
  assert.match(veredito.message, /^Já feito com os mesmos insumos em 12\/10 às 17:30 — 8 alvo\(s\), IA leu a lista, 0 consulta\(s\) paga\(s\) no plano\./);
  assert.equal(improvementReworkPrevious({ version: 1, runId: "x", brandId: "b", createdAt: "2026-10-12T20:30:00.000Z", keywords: [] }), null, "execução sem impressão digital não é registro");
});

test("F5-9 · gravação do ArticleDNA: contradição é MUDANÇA para longe do plano; artigo antigo igual passa", () => {
  const plan = { groupId: "11111111-1111-4111-8111-111111111111", planVersion: 1, order: 3, role: "Suporte" as const, scope: "Compara as três operadoras.", declaredPrincipal: { keywordId: "kw-declarada", phrase: "Claro Vivo ou TIM internet" } };
  // Novo artigo do Assunto com outra principal: contradiz.
  assert.equal(declaredPlanArticleContradictions({ plan, next: { principalKeywordId: "kw-claro-ou-vivo", hierarchy: "Suporte" }, previous: null }).length, 1);
  // Troca para a declarada (D1-bis): passa.
  assert.deepEqual(declaredPlanArticleContradictions({ plan, next: { principalKeywordId: "kw-declarada", hierarchy: "Suporte" }, previous: { principalKeywordId: "kw-claro-ou-vivo", hierarchy: "Pilar" } }), []);
  // Versão nova que só carrega o estado anterior ao plano (mesma principal, mesmo papel): passa.
  assert.deepEqual(declaredPlanArticleContradictions({ plan, next: { principalKeywordId: "kw-claro-ou-vivo", hierarchy: "Pilar" }, previous: { principalKeywordId: "kw-claro-ou-vivo", hierarchy: "Pilar" } }), []);
  // Sai da declarada ou vira Pilar contra o plano: recusa, com a frase.
  const motivos = declaredPlanArticleContradictions({ plan, next: { principalKeywordId: "kw-outra", hierarchy: "Pilar" }, previous: { principalKeywordId: "kw-declarada", hierarchy: "Suporte" }, subjectLabel: "Claro, Vivo ou TIM" });
  assert.equal(motivos.length, 2);
  assert.match(motivos[0], /principal do artigo do Assunto “Claro, Vivo ou TIM” deixaria de ser a declarada \(“Claro Vivo ou TIM internet”\)/);
  assert.match(motivos[1], /viraria “Pilar”, e o plano declara “Suporte”/);
  assert.deepEqual(declaredPlanArticleContradictions({ plan: null, next: { principalKeywordId: "x", hierarchy: "Pilar" } }), [], "sem plano, nada muda");
});

test("F5-10 · caminho paralelo: artigo NOVO, sem Assunto, não publicado, em grupo com plano", () => {
  const novo = { subject: undefined, publishedIdentityRef: undefined };
  assert.equal(declaredPlanParallelPath({ article: novo, hasPreviousVersion: false, principalGroupHasPlan: true, principalLabel: "plano vivo controle" }).length, 1);
  assert.deepEqual(declaredPlanParallelPath({ article: novo, hasPreviousVersion: true, principalGroupHasPlan: true }), [], "o artigo antigo segue (retira-se pela tela)");
  assert.deepEqual(declaredPlanParallelPath({ article: novo, hasPreviousVersion: false, principalGroupHasPlan: false }), []);
  assert.deepEqual(declaredPlanParallelPath({ article: { ...novo, subject: { keywordId: "s" } as never }, hasPreviousVersion: false, principalGroupHasPlan: true }), []);
  assert.deepEqual(declaredPlanParallelPath({ article: { ...novo, publishedIdentityRef: {} as never }, hasPreviousVersion: false, principalGroupHasPlan: true }), [], "publicado não é artigo solto");
});

test("F5-11 · estrutural: a guarda é chamada pelos núcleos (nunca só pela tela)", () => {
  const limpa = (path: string) => readFileSync(path, "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  assert.match(limpa("lib/server/arquiteto-persistence.ts"), /assertArticleDnaAgainstDeclaredPlan\(context, \{ entityId: version\.entityId/);
  assert.match(limpa("lib/server/arquiteto-persistence.ts"), /error instanceof ReworkRefusedError/);
  assert.match(limpa("lib/server/arquiteto-silo-consolidation-adapter.ts"), /return runUnderReworkGuard\(context, operation/);
  assert.match(limpa("lib/server/arquiteto-serp-http.ts"), /await serpFormationReworkGate\(pipelineContext/);
  assert.match(limpa("lib/server/arquiteto-serp-http.ts"), /recordSerpFormationOutcomes\(pipelineContext/);
  assert.match(limpa("lib/server/arquiteto-silo-article-withdrawal.ts"), /rework: reworkGuardPort\(context\)/);
  assert.match(limpa("lib/server/arquiteto-silo-declared-plan.ts"), /rework: reworkGuardPort\(context\)/);
  assert.match(limpa("lib/server/arquiteto-article-improvement.ts"), /assessRework\(\{ kind: "article_improvement_prepare"/);
  assert.match(limpa("app/api/arquiteto/article-formation-marker/route.ts"), /recordFormationConclusion\(context, parsed\.data\.marker\)/);
  // Pré-requisito do Radar (§6.3): a mesa do Radar lê só artigos.
  assert.match(limpa("lib/server/editorial-repositories.ts"), /\.eq\("subject_type", "article"\)\s*\.eq\("stage", "radar"\)/);
  // A tela usa o componente compartilhado, com o token warning.
  const aviso = readFileSync("components/editorial/rework-notice.tsx", "utf8");
  assert.match(aviso, /border-warning\/40 bg-warning\/10/);
  assert.match(aviso, /<InfoHint /);
  for (const tela of ["modules/arquiteto/silo-declared-plan-panel.tsx", "modules/arquiteto/silo-article-withdrawal-panel.tsx", "modules/arquiteto/arquiteto-workspace.tsx"]) {
    assert.match(limpa(tela), /<ReworkNotice /, tela);
  }
  /*
   * 2026-10-17 (noite) · o refazedor ("Melhorar publicados…") lê a MESMA guarda (`run.rework`, do núcleo), mas o
   * "Refazer mesmo assim" solto saiu (dono: "tem 7 botões totalmente inúteis"): o motivo é pedido DENTRO da prévia e o
   * Confirmar dela vira "Refazer com o motivo dito" (o servidor continua recusando sem motivo).
   */
  const refazedor = limpa("modules/arquiteto/article-improvement-panel.tsx");
  assert.match(refazedor, /const podeRefazer = Boolean\(run\?\.rework\?\.canOverride\)/);
  assert.match(refazedor, /motivo\.trim\(\)\.length >= REWORK_OVERRIDE_REASON_MIN/);
  assert.match(refazedor, /reworkOverride: \{ reason: options\.reworkReason \}/);
});
