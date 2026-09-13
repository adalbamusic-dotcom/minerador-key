import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  HOMOLOGATION_FRESH_PRESERVED,
  HOMOLOGATION_FRESH_SUBJECTS,
  homologationFreshPhrase,
  planHomologationFresh,
  type FreshWorkflowRow,
} from "../lib/arquiteto/homologation-fresh.ts";
import {
  HOMOLOGATION_ROUND_SUBJECT_TYPE,
  activeHomologationRound,
  buildHomologationRoundMarker,
  oldApprovedArtifactsVisibleAsCurrent,
  scopeArtifactsToActiveRound,
} from "../lib/arquiteto/homologation-round.ts";

/**
 * FRESH LIMPA A RODADA, NÃO O ACERVO.
 *
 * Três operações diferentes: `Reprocessar` é incremental, `Restaurar` conserta
 * em direção ao aprovado, `Reiniciar homologação` recomeça a cópia de trabalho.
 * Misturá-las num botão só seria a maneira mais rápida de perder trabalho sem
 * perceber.
 */

/** O inventário real da marca de homologação. */
const acervoReal = (): FreshWorkflowRow[] => {
  const linhas: FreshWorkflowRow[] = [];
  const empilhar = (subjectType: string, stage: string, state: string, quantidade: number) => {
    for (let i = 0; i < quantidade; i += 1) linhas.push({ id: `${subjectType}-${stage}-${i}`, subjectType, stage, state });
  };
  empilhar("architecture_analysis", "architect", "processed", 1);
  empilhar("article", "radar", "research_pending", 4);
  empilhar("article_formation_analysis", "architect", "processed", 1);
  empilhar("article_formation_serp_assessment", "architect", "resolved", 9);
  empilhar("keyword", "architect", "received", 28);
  empilhar("silo_working_copy", "architect", "draft", 3);
  empilhar("territorial_ai_review", "architect", "maintain", 1);
  empilhar("territorial_serp_assessment", "architect", "manter_silo", 6);
  empilhar("territory", "architect", "candidate", 4);
  empilhar("territory", "architect", "consolidated", 3);
  return linhas;
};

/* ================= C · limpa o estado de trabalho ===================== */

test("C · limpa o lote, os marcadores, as cópias de Silo e os territórios", () => {
  const plano = planHomologationFresh({ rows: acervoReal() });
  const porTipo = new Map(plano.clearing.map(item => [item.subjectType, item.count]));
  assert.equal(porTipo.get("keyword"), 28);
  assert.equal(porTipo.get("architecture_analysis"), 1);
  assert.equal(porTipo.get("article_formation_analysis"), 1);
  assert.equal(porTipo.get("silo_working_copy"), 3);
  assert.equal(porTipo.get("territory"), 7, "candidato e consolidado são estado de trabalho");
  assert.equal(plano.totalCleared, 40);
  assert.equal(plano.clearIds.length, 40);
  // Cada linha limpa carrega o porquê.
  for (const item of plano.clearing) assert.ok(item.reason.length > 20, `${item.subjectType} sem motivo declarado`);
});

/* ================= D e E · o que sobrevive =========================== */

test("E · SERP histórica sobrevive — é ela que testa o reaproveitamento", () => {
  const plano = planHomologationFresh({ rows: acervoReal() });
  const porTipo = new Map(plano.preserving.map(item => [item.subjectType, item.count]));
  assert.equal(porTipo.get("article_formation_serp_assessment"), 9);
  assert.equal(porTipo.get("territorial_serp_assessment"), 6);
  assert.equal(porTipo.get("territorial_ai_review"), 1);
  assert.ok(!plano.clearIds.some(id => id.startsWith("article_formation_serp_assessment")));
});

test("outro estágio do pipeline não é desta mesa", () => {
  const plano = planHomologationFresh({ rows: acervoReal() });
  const radar = plano.preserving.find(item => item.subjectType.includes("radar"));
  assert.ok(radar, "os itens do Radar precisam aparecer como preservados");
  assert.equal(radar!.count, 4);
  assert.match(radar!.reason, /outro estágio/);
});

test("D · o plano é uma lista de PERMISSÃO: tipo desconhecido é preservado", () => {
  const plano = planHomologationFresh({
    rows: [{ id: "novo-1", subjectType: "algo_que_ainda_nao_existe", stage: "architect", state: "x" }],
  });
  assert.equal(plano.totalCleared, 0);
  assert.equal(plano.totalPreserved, 1);
  assert.match(plano.preserving[0].reason, /preservado por omissão/);
});

test("D · nenhum artefato versionado entra na lista de limpeza", () => {
  const fonte = readFileSync("lib/arquiteto/homologation-fresh.ts", "utf8");
  const rota = readFileSync("app/api/arquiteto/homologation-fresh/route.ts", "utf8");
  for (const tabela of ["editorial_artifact_versions", "minerador_keywords"]) {
    assert.ok(!Object.hasOwn(HOMOLOGATION_FRESH_SUBJECTS, tabela));
    assert.ok(!rota.includes(`from("${tabela}")`), `a rota não pode tocar ${tabela}`);
  }
  assert.match(fonte, /NUNCA AUTORIZA APAGAR/);
  assert.match(rota, /approvedArtifactsDeleted: 0/);
});

/* ================= cenário limpo e frase de confirmação ============== */

test("rodada já limpa não propõe nada", () => {
  const plano = planHomologationFresh({ rows: [{ id: "s1", subjectType: "article_formation_serp_assessment", stage: "architect", state: "resolved" }] });
  assert.equal(plano.clean, true);
  assert.match(plano.summary, /Não há estado de trabalho a limpar/);
});

test("a frase de confirmação carrega o TAMANHO do plano", () => {
  assert.equal(homologationFreshPhrase(40), "REINICIAR 40");
  // Plano diferente ⇒ frase diferente ⇒ a operação recomeça em vez de apagar
  // um conjunto que ninguém leu.
  assert.notEqual(homologationFreshPhrase(40), homologationFreshPhrase(39));
});

/* ================= A e B · o modo de homologação ===================== */

test("A/B · o modo é SERVER-ONLY; a variável pública só mostra o botão", () => {
  const rota = readFileSync("app/api/arquiteto/homologation-fresh/route.ts", "utf8");
  assert.match(rota, /process\.env\.ARQUITETO_HOMOLOGATION_MODE/);
  // A variável pública NÃO pode ser a que autoriza a rota.
  assert.ok(!rota.includes("NEXT_PUBLIC_ARQUITETO_HOMOLOGATION_MODE"),
    "quem autoriza precisa ser a variável server-only");
  assert.match(rota, /status: 403/);
  // E a marca vem do contexto resolvido, nunca do corpo.
  assert.match(rota, /resolvePipelineContext\(\{ brandId: parsed\.brandId, module: "arquiteto", action: "edit" \}\)/);
  assert.match(rota, /\.eq\("marca_id", context\.brandId\)/);
});

test("a confirmação é recalculada no servidor, não aceita do cliente", () => {
  const rota = readFileSync("app/api/arquiteto/homologation-fresh/route.ts", "utf8");
  assert.match(rota, /const esperada = homologationFreshPhrase\(plan\.totalCleared\)/);
  assert.match(rota, /status: 409/);
  // O delete é escopado por marca, estágio e pelos ids do plano.
  assert.match(rota, /\.eq\("stage", HOMOLOGATION_FRESH_STAGE\)/);
  assert.match(rota, /\.in\("id", plan\.clearIds\)/);
});

test("§14 · o resumo vem do readback, não do que foi pedido", () => {
  const rota = readFileSync("app/api/arquiteto/homologation-fresh/route.ts", "utf8");
  assert.match(rota, /const restante = await planFor\(context\)/);
  assert.match(rota, /remainingWorkingItems: restante\.totalCleared/);
});

/* ================= A/B/F · a tela ==================================== */

test("A/B · o Fresh saiu da UI; a rota continua exigindo o modo server-only", () => {
  const workspace = readFileSync("modules/arquiteto/arquiteto-workspace.tsx", "utf8");
  const painel = readFileSync("modules/arquiteto/architecture-panel.tsx", "utf8");
  /*
   * §3 do corte de reset: o reinício virou operação administrativa explícita
   * (`npm run reset:arquiteto`). O controle sai da tela; a rota, o domínio e
   * as travas continuam existindo e testados.
   */
  assert.match(workspace, /homologation=\{null\}/);
  assert.match(painel, /\{homologation && \(/, "o bloco continua no componente, apenas sem receber plano");
  assert.match(painel, /data-testid="architect-homologation-fresh"/);
  assert.match(painel, /Limpa a working copy da rodada atual sem apagar o histórico aprovado\./);
});

test("§6 · preview antes de confirmar, com o que some e o que fica", () => {
  const workspace = readFileSync("modules/arquiteto/arquiteto-workspace.tsx", "utf8");
  const painel = readFileSync("modules/arquiteto/architecture-panel.tsx", "utf8");
  assert.match(workspace, /if \(!freshPlan\) \{/);
  assert.match(workspace, /Nada foi gravado: confirme novamente para reiniciar/);
  assert.match(painel, /data-testid="architect-homologation-fresh-preview"/);
  assert.match(painel, /Será limpo \(\{homologation\.plan\.totalCleared\}\)/);
  assert.match(painel, /Será preservado \(\{homologation\.plan\.totalPreserved\}\)/);
  assert.match(painel, /Artefatos versionados .* nenhum é apagado\./);
});

test("F · o fresh limpa também a seleção e os previews pendentes da tela", () => {
  const workspace = readFileSync("modules/arquiteto/arquiteto-workspace.tsx", "utf8");
  const reinicio = workspace.slice(workspace.indexOf("const restartHomologationRound"));
  const corpo = reinicio.slice(0, reinicio.indexOf("const articleDnaEntryFor"));
  for (const limpeza of ["setSelectedArticleIds(new Set())", "setSelectedSiloPageIds(new Set())",
    // `setArchitecturePlanPreview` saiu da lista com o próprio preview: o
    // confirmar de dois cliques deixou de existir, e com ele o estado pendente
    // que precisava ser limpo aqui.
    "setPendingScenarioChange(null)", "setArchitectureImpactAck(null)",
    "setRestorePreviewOpen(false)", "setLinksWorkingCopy(null)"]) {
    assert.ok(corpo.includes(limpeza), `o estado local ${limpeza} precisa ser limpo junto`);
  }
  // Senão a tela mostraria a rodada anterior sobre um remoto já limpo.
  assert.match(corpo, /setCanonicalWorkspaceReload\(current => current \+ 1\)/);
});

/* ================= I · Fresh ≠ Restore ≠ Reprocessar ================= */

test("I · as três operações são distintas e declaradas", () => {
  const fresh = readFileSync("lib/arquiteto/homologation-fresh.ts", "utf8");
  const restore = readFileSync("lib/arquiteto/working-copy-restore.ts", "utf8");
  assert.match(fresh, /`Reprocessar` é incremental por\r?\n \* desenho e reproduz o cenário; `Restaurar` conserta em direção ao aprovado/);
  assert.match(restore, /o baseline daqui é outro: o ArticleDNA aprovado\.|O baseline não é a análise: é o ARTEFATO\r?\n \* APROVADO/);
  // E o preservado do fresh inclui o que o restore usa como baseline.
  assert.ok(Object.hasOwn(HOMOLOGATION_FRESH_PRESERVED, "article_formation_serp_assessment"));
});

/* ================= a fronteira da rodada ============================== */

test("§1/§4 · artefato de rodada anterior vira histórico, não estado corrente", () => {
  const rodada = buildHomologationRoundMarker({ roundId: "r2", startedBy: "user-1", startedAt: "2026-09-06T12:00:00.000Z", previousRoundId: "r1" });
  const escopo = scopeArtifactsToActiveRound({
    artifacts: [
      { createdAt: "2026-09-05T10:00:00.000Z", id: "antigo" },
      { createdAt: "2026-09-06T12:00:00.000Z", id: "no-inicio" },
      { createdAt: "2026-09-06T13:00:00.000Z", id: "novo" },
    ],
    round: rodada,
    homologationMode: true,
  });
  assert.deepEqual(escopo.active.map(item => item.id), ["no-inicio", "novo"]);
  assert.deepEqual(escopo.historical.map(item => item.id), ["antigo"]);
  assert.equal(escopo.bounded, true);
});

test("§12 · em produção a fronteira não existe e nada é separado", () => {
  const artefatos = [{ createdAt: "2020-01-01T00:00:00.000Z", id: "velho" }];
  for (const caso of [
    { round: buildHomologationRoundMarker({ roundId: "r", startedBy: "u", startedAt: "2026-01-01T00:00:00.000Z" }), homologationMode: false },
    { round: null, homologationMode: true },
  ]) {
    const escopo = scopeArtifactsToActiveRound({ artifacts: artefatos, ...caso });
    assert.deepEqual(escopo.active.map(item => item.id), ["velho"]);
    assert.equal(escopo.bounded, false, "sem modo ou sem rodada, o universo é o acervo inteiro");
  }
});

test("§11 · a pergunta do audit: artefato antigo ainda aparece como corrente?", () => {
  const rodada = buildHomologationRoundMarker({ roundId: "r2", startedBy: "u", startedAt: "2026-09-06T12:00:00.000Z" });
  assert.equal(oldApprovedArtifactsVisibleAsCurrent({
    round: rodada, homologationMode: true,
    currentApproved: [{ createdAt: "2026-09-05T10:00:00.000Z" }],
  }), true, "artefato anterior à rodada não pode ser corrente");
  assert.equal(oldApprovedArtifactsVisibleAsCurrent({
    round: rodada, homologationMode: true,
    currentApproved: [{ createdAt: "2026-09-06T13:00:00.000Z" }],
  }), false);
  // Em produção a pergunta não se aplica.
  assert.equal(oldApprovedArtifactsVisibleAsCurrent({
    round: rodada, homologationMode: false,
    currentApproved: [{ createdAt: "2020-01-01T00:00:00.000Z" }],
  }), false);
});

test("a rodada ativa é a de início mais recente, e o marcador sobrevive ao fresh", () => {
  const r1 = buildHomologationRoundMarker({ roundId: "r1", startedBy: "u", startedAt: "2026-09-01T00:00:00.000Z" });
  const r2 = buildHomologationRoundMarker({ roundId: "r2", startedBy: "u", startedAt: "2026-09-06T00:00:00.000Z", previousRoundId: "r1" });
  assert.equal(activeHomologationRound([r2, r1])?.roundId, "r2");
  assert.equal(activeHomologationRound([])?.roundId, undefined);
  // O marcador não pode ser apagado pelo próprio fresh.
  assert.ok(Object.hasOwn(HOMOLOGATION_FRESH_PRESERVED, HOMOLOGATION_ROUND_SUBJECT_TYPE));
  assert.ok(!Object.hasOwn(HOMOLOGATION_FRESH_SUBJECTS, HOMOLOGATION_ROUND_SUBJECT_TYPE));
});

test("§3 · o marcador é gravado DEPOIS da limpeza e encadeia a rodada anterior", () => {
  const rota = readFileSync("app/api/arquiteto/homologation-fresh/route.ts", "utf8");
  // A comparação é dentro do POST: no topo do arquivo só existe o import.
  const post = rota.slice(rota.indexOf("export async function POST"));
  assert.ok(
    post.indexOf(".delete()") < post.indexOf("buildHomologationRoundMarker({"),
    "se a limpeza falhar, não existe rodada nova para declarar",
  );
  assert.match(rota, /previousRoundId: anterior\?\.roundId \?\? null/);
  assert.match(rota, /subject_type: HOMOLOGATION_ROUND_SUBJECT_TYPE/);
  assert.match(rota, /activeRoundId: round\.roundId/);
});

test("§4/§7 · a mesa aplica a fronteira na ENTRADA, não em cada read model", () => {
  const workspace = readFileSync("modules/arquiteto/arquiteto-workspace.tsx", "utf8");
  for (const lista of ["canonical.articleDnas", "canonical.siloDnas", "canonical.siloPages"]) {
    assert.ok(workspace.includes(`scopeArtifactsToActiveRound({ artifacts: ${lista}, ...escopoRodada }).active`),
      `${lista} precisa entrar pelo escopo da rodada`);
  }
  // Grafo aprovado da rodada anterior também não volta como corrente.
  assert.match(workspace, /setApprovedLinkGraphs\(scopeArtifactsToActiveRound\(\{/);
  // E a rodada é lida antes da carga, não só ao abrir o preview.
  assert.match(workspace, /if \(!homologationMode \|\| !selectedBrandId\) \{ setHomologationRound\(null\); return; \}/);
  assert.match(workspace, /homologationMode, homologationRound\]\);/);
});

test("§8/§9 · SERP e KeywordDNA atravessam a rodada; estado canônico não", () => {
  const fronteira = readFileSync("lib/arquiteto/homologation-round.ts", "utf8");
  assert.match(fronteira, /A SERP é exceção intencional e NÃO passa por aqui/);
  assert.match(fronteira, /Estado canônico não atravessa; evidência sim\./);
  // KeywordDNA e BrandDNA não são estado de trabalho desta fase.
  const fresh = readFileSync("lib/arquiteto/homologation-fresh.ts", "utf8");
  assert.match(fresh, /`minerador_keywords` — a KeywordDNA canônica não pertence a esta fase/);
});

test("§10 · logo após o fresh, a rodada nova começa com zero de tudo", () => {
  /*
   * Os números do acervo real: 10 ArticleDNA e 3 SiloDNA aprovados, todos
   * criados antes da rodada nova. Nenhum deles pode aparecer como corrente.
   */
  const antes = "2026-09-05T00:00:00.000Z";
  const rodada = buildHomologationRoundMarker({ roundId: "r-nova", startedBy: "u", startedAt: "2026-09-07T00:00:00.000Z", previousRoundId: "r-antiga" });
  const acervo = [
    ...Array.from({ length: 10 }, (_, i) => ({ createdAt: antes, id: `article-${i}` })),
    ...Array.from({ length: 3 }, (_, i) => ({ createdAt: antes, id: `silo-${i}` })),
  ];
  const escopo = scopeArtifactsToActiveRound({ artifacts: acervo, round: rodada, homologationMode: true });

  assert.equal(escopo.active.length, 0, "ACTIVE_ARTICLES = 0 e ACTIVE_SILOS = 0");
  assert.equal(escopo.historical.length, 13, "e nada foi perdido: tudo continua consultável");
  assert.equal(oldApprovedArtifactsVisibleAsCurrent({
    round: rodada, homologationMode: true, currentApproved: escopo.active,
  }), false);
});

test("§11 · o audit da rodada responde a pergunta que libera a execução", () => {
  const script = readFileSync("scripts/arquiteto-audit-round.mts", "utf8");
  assert.match(script, /OLD_APPROVED_ARTIFACTS_VISIBLE_AS_CURRENT/);
  assert.match(script, /ACTIVE_HOMOLOGATION_ROUND_ID/);
  for (const flag of ["ACTIVE_ARTICLES", "ACTIVE_SILOS", "ACTIVE_SILO_PAGES", "HISTORICAL_SERP_ASSESSMENTS"]) {
    assert.ok(script.includes(flag), `falta ${flag} no audit`);
  }
  assert.match(script, /NO_WRITES          = YES/);
});
