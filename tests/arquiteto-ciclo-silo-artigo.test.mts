import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  describeFormationConclusionOutcome,
  resolveSiloClosureReadiness,
} from "../lib/arquiteto/silo-closure-readiness.ts";
import { ArticleFormationMarkerPayloadSchema } from "../lib/arquiteto/article-formation-marker.ts";
import { ArticleDNASchema } from "../lib/arquiteto/contracts.ts";

/**
 * O CICLO QUE A HOMOLOGAÇÃO ENCONTROU.
 *
 *   Concluir formação  exigia SiloDNA canônico
 *   SiloDNA canônico   exigia formações concluídas
 *
 * Um esperava o outro para sempre, e a mesa respondia:
 * "Nenhum SiloDNA canônico declara este território: falta consolidar o Silo."
 */

const SILO = "territory:9da03dd0-cf37-45c3-8562-20e943aa37bd";

/* ================= §3 · o que o contrato REALMENTE exige =============== */

test("§3 — ArticleDNA não exige SiloDNA canônico: `siloId` é anulável", () => {
  /*
   * A auditoria que o corte pedia antes de implementar. O bloqueio não vinha
   * do schema — vinha de `materializeArticleSiloId`, que recusava quando o
   * território não tinha SiloDNA. O contrato sempre aceitou `siloId: null`.
   */
  // A prova é o schema aceitando o payload, não a forma interna do zod.
  const base = {
    schemaVersion: 1 as const,
    articleId: "article-candidate:x",
    brandId: "brand-1",
    principalKeywordId: "k3",
    secondaryKeywordIds: [],
    narrativeReinforcementIds: [],
    keywordReferences: [{ keywordId: "k3", keywordDnaVersionId: "v1", contentHash: "h1" }],
    siloId: null,
    territoryRef: SILO,
  };
  const comSiloNulo = ArticleDNASchema.safeParse(base);
  assert.notEqual(
    comSiloNulo.error?.issues.some(issue => issue.path.join(".") === "siloId"),
    true,
    "`siloId: null` não pode ser o motivo da recusa: o contrato o aceita",
  );

  const contrato = readFileSync("lib/arquiteto/contracts.ts", "utf8");
  assert.match(contrato, /siloId: z\.string\(\)\.nullable\(\),/);
});

/* ============== §4 · a formação congela sem inventar referência ========= */

test("§4 — a formação concluída é gravada com composição, sem ArticleDNA", () => {
  const payload = ArticleFormationMarkerPayloadSchema.parse({
    contractVersion: "article-formation-marker-v1",
    baseHash: "artbase:5a2426be65358552",
    processedAt: "2026-09-08T20:00:00.000Z",
    confirmation: {
      status: "partial", confirmedAt: "2026-09-08T20:00:00.000Z",
      confirmedArticleCount: 1, coveredKeywordCount: 4, pendingSiloCount: 0, failedCount: 0,
    },
    concludedFormations: [{
      candidateRef: "article-candidate:x",
      territoryRef: SILO,
      principalKeywordId: "k3",
      members: [
        { keywordId: "k3", role: "principal" },
        { keywordId: "k6", role: "reforco" },
      ],
      formationBaseHash: "artbase:5a2426be65358552",
      concludedAt: "2026-09-08T20:00:00.000Z",
      concludedBy: "u1",
      materializedArticleId: null,
    }],
  });
  assert.equal(payload.concludedFormations.length, 1);
  // `null` é o estado normal enquanto o Silo não consolidou, não uma falha.
  assert.equal(payload.concludedFormations[0].materializedArticleId, null);
  // E o marcador antigo, sem o campo, continua válido.
  assert.deepEqual(
    ArticleFormationMarkerPayloadSchema.parse({
      contractVersion: "article-formation-marker-v1",
      baseHash: "b", processedAt: "2026-09-08T20:00:00.000Z",
      confirmation: {
        status: "none", confirmedAt: null, confirmedArticleCount: 0,
        coveredKeywordCount: 0, pendingSiloCount: 0, failedCount: 0,
      },
    }).concludedFormations,
    [],
  );
});

/* ================== §5/§6 · o Silo fecha quando estabiliza ============== */

const fechamento = (over: Partial<Parameters<typeof resolveSiloClosureReadiness>[0]> = {}) =>
  resolveSiloClosureReadiness({
    siloRef: SILO,
    activeCandidateRefs: ["c1", "c2", "c3", "c4", "c5"],
    concludedCandidateRefs: ["c1", "c2", "c3", "c4", "c5"],
    pendingMaterializationRefs: ["c1", "c2", "c3", "c4", "c5"],
    ...over,
  });

test("§6 — concluir 1 de 5 deixa o Silo aberto, e isso não é erro", () => {
  const parcial = fechamento({ concludedCandidateRefs: ["c1"], pendingMaterializationRefs: ["c1"] });
  assert.equal(parcial.ready, false);
  const bloqueio = parcial.blockers.find(item => item.code === "FORMATIONS_PENDING");
  assert.ok(bloqueio);
  assert.match(bloqueio.detail, /4 formação\(ões\)/);
  // A formação concluída continua esperando, nomeada.
  assert.deepEqual(parcial.awaitingMaterialization, ["c1"]);
});

test("§5/§6 — com o lote inteiro concluído e nada aberto, o Silo fecha", () => {
  const pronto = fechamento();
  assert.equal(pronto.ready, true);
  assert.deepEqual(pronto.blockers, []);
  assert.equal(pronto.awaitingMaterialization.length, 5);
});

test("§9 — contestação de fronteira impede o fechamento e diz de quem", () => {
  const comChallenge = fechamento({
    openBoundaryChallenges: [{ scopeLabel: "pele oleosa e acne" }],
  });
  assert.equal(comChallenge.ready, false);
  const bloqueio = comChallenge.blockers.find(item => item.code === "SILO_RECONSIDERATION_REQUIRED");
  assert.match(bloqueio?.detail || "", /pele oleosa e acne/);
  assert.match(bloqueio?.detail || "", /decisão é da fase Silos/);
});

test("§5 — canibalização aberta e formação bloqueada também represam", () => {
  const comCanibalizacao = fechamento({
    unresolvedCannibalization: [{ leftLabel: "pele oleosa", rightLabel: "peles oleosas" }],
  });
  assert.ok(comCanibalizacao.blockers.some(item => item.code === "CANNIBALIZATION_UNRESOLVED"));

  const comBloqueio = fechamento({
    blockedFormations: [{ label: "skin care nivea", reason: "sem evidência SERP vigente" }],
  });
  assert.ok(comBloqueio.blockers.some(item => item.code === "FORMATION_BLOCKED"));
});

test("§5 — Silo já canônico não fecha de novo", () => {
  const consolidado = fechamento({ alreadyConsolidated: true });
  assert.equal(consolidado.ready, false);
  assert.ok(consolidado.blockers.some(item => item.code === "ALREADY_CONSOLIDATED"));
});

/* ================= §10 · zero materializado não é sucesso =============== */

test("§10 — ZERO_MATERIALIZATION_CAN_BE_SUCCESS = NO", () => {
  const nenhuma = describeFormationConclusionOutcome({
    concluded: 0, materialized: 0, awaitingCanonicalSilo: 0,
    blocked: [{ label: "skincare para pele oleosa", reason: "sem evidência SERP vigente" }],
  });
  assert.equal(nenhuma.severity, "error");
  assert.doesNotMatch(nenhuma.message, /aplicada parcialmente/);
  assert.match(nenhuma.message, /skincare para pele oleosa: sem evidência SERP vigente/);
});

test("§10 — concluir e esperar o Silo É sucesso, e é dito como tal", () => {
  const esperando = describeFormationConclusionOutcome({
    concluded: 1, materialized: 0, awaitingCanonicalSilo: 1, blocked: [],
  });
  assert.equal(esperando.severity, "success");
  assert.match(esperando.message, /1 formação\(ões\) concluída\(s\)/);
  assert.match(esperando.message, /aguardando a consolidação do Silo/);
  // Zero materializado NÃO vira "0 ArticleDNA confirmados" com cara de sucesso.
  assert.doesNotMatch(esperando.message, /0 ArticleDNA/);
});

test("§10 — houve trabalho e houve pendência: aviso, não sucesso", () => {
  const misto = describeFormationConclusionOutcome({
    concluded: 3, materialized: 3, awaitingCanonicalSilo: 0,
    blocked: [{ label: "skin care nivea", reason: "SERP inconclusiva" }],
  });
  assert.equal(misto.severity, "warning");
  assert.match(misto.message, /3 ArticleDNA materializado\(s\)/);
  assert.match(misto.message, /bloqueadas: skin care nivea/);
});

/* ========================= §8 · uma ação humana ======================== */

test("§8 — ARTICLE_FINAL_HUMAN_ACTION_COUNT = 1", () => {
  const painel = readFileSync("modules/arquiteto/article-formation-panel.tsx", "utf8");
  // Processar e Concluir. Nada de "Aprovar formação", "Consolidar Silo" ou
  // "Aprovar ArticleDNA" como terceira ação.
  assert.match(painel, /data-testid="architect-process-articles"/);
  assert.match(painel, /data-testid="architect-confirm-formation"/);
  assert.doesNotMatch(painel, /Aprovar formação|Consolidar Silo|Aprovar ArticleDNA/);
});

/* ======================= §12 · nenhuma coleta nova ===================== */

test("§12 — PROVIDER_CALLS = 0 neste corte", () => {
  /*
   * O critério é CHAMAR, não citar. `keyword-dna-projection` importa o leitor
   * do overview do DataForSEO para exibir métrica já gravada — isso é leitura
   * do acervo, não coleta nova.
   */
  for (const arquivo of [
    "lib/arquiteto/silo-closure-readiness.ts",
    "lib/arquiteto/article-formation-marker.ts",
    "lib/arquiteto/keyword-dna-projection.ts",
  ]) {
    const fonte = readFileSync(arquivo, "utf8");
    assert.doesNotMatch(fonte, /fetch\(|confirmSerpValidation|callStrategicApi|\/api\//i, `${arquivo} não chama provider`);
  }
});

/* ================== §11 · a intenção do card vem do DNA ================= */

test("§11 — KEYWORD_CARD_INTENT_SOURCE = KEYWORD_DNA", () => {
  const projecao = readFileSync("lib/arquiteto/keyword-dna-projection.ts", "utf8");
  // A qualificação canônica responde antes do read model do Minerador, que é
  // quem devolvia "Ambíguo" enquanto o DNA já dizia "Informativa".
  assert.match(projecao, /textValue\(qualification\?\.intent\) \?\? snapshot\.semantic\.intentField\.label/);
  // E ausência de qualificação não apaga o que o Minerador apurou.
  assert.match(projecao, /unresolved: !qualification\?\.intent && snapshot\.semantic\.intentField\.state === "unresolved"/);
});

/* ============================ §13 · a fiação ============================ */

test("§13 — concluir não recusa mais por falta de SiloDNA canônico", () => {
  const workspace = readFileSync("modules/arquiteto/arquiteto-workspace.tsx", "utf8");
  const trecho = workspace.slice(workspace.indexOf("const materializeApprovedArticleDnas"));
  const corpo = trecho.slice(0, trecho.indexOf("\n  }, ["));

  // A recusa virou pendência NOMEADA: a formação fecha, o ArticleDNA espera.
  // O binder agora recebe a etapa (§3: no fechamento o artigo vem primeiro),
  // mas o desfecho da ausência continua sendo fila, não erro.
  assert.match(corpo, /aguardandoSilo\.push\(\{/);
  assert.match(corpo, /reason: estagio === "CANONICAL_REQUIRED"/);
  assert.match(corpo, /aguardando o fechamento canônico do Silo/);
  assert.doesNotMatch(corpo, /Um artigo não pôde ser concluído/);
  assert.match(corpo, /return \{ criados, aguardandoSilo \};/);
});

test("§4 — a conclusão congela a composição no marcador", () => {
  const workspace = readFileSync("modules/arquiteto/arquiteto-workspace.tsx", "utf8");
  const trecho = workspace.slice(workspace.indexOf("const confirmArticleFormation"));
  const corpo = trecho.slice(0, trecho.indexOf("\n  }, ["));

  assert.match(corpo, /concludedFormations: \(\(\) => \{/);
  assert.match(corpo, /principalKeywordId: entrada\.principalKeywordId/);
  assert.match(corpo, /members: entrada\.keywords\.map\(item => \(\{ keywordId: item\.keywordId, role: item\.role \}\)\)/);
  assert.match(corpo, /formationBaseHash: articleFormationBase/);
  // Concluir 1 de 5 não apaga o que já tinha fechado antes.
  assert.match(corpo, /const anteriores = new Map\(\(articleFormationMarker\.concludedFormations \|\| \[\]\)/);
});

test("§5/§10 — o desfecho e o fechamento do Silo saem da autoridade do domínio", () => {
  const workspace = readFileSync("modules/arquiteto/arquiteto-workspace.tsx", "utf8");
  const trecho = workspace.slice(workspace.indexOf("const confirmArticleFormation"));
  const corpo = trecho.slice(0, trecho.indexOf("\n  }, ["));

  assert.match(corpo, /describeFormationConclusionOutcome\(\{/);
  assert.match(corpo, /showNotification\(desfecho\.severity/);
  /*
   * A frase que anunciava sucesso com zero saiu do CÓDIGO — ela sobrevive só
   * no comentário que explica por que saiu, e comentário não vai para a tela.
   */
  const semComentarios = corpo
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
  assert.doesNotMatch(semComentarios, /Formação aplicada parcialmente/);
  assert.doesNotMatch(semComentarios, /showNotification\("success", `\$\{completa/);
  // O fechamento do Silo é consequência do mesmo clique, sem botão novo.
  assert.match(corpo, /resolveSiloClosureReadiness\(\{/);
  assert.match(corpo, /sem novo clique/);
});

/* ============ §1–§4 · a projeção da formação concluída ================== */

import { readFormationConclusionState } from "../lib/arquiteto/formation-conclusion-state.ts";
import {
  challengesRequiringSiloReview,
  resolveSiloBoundaryChallenge,
  unresolvedBoundaries,
} from "../lib/arquiteto/silo-boundary-challenge.ts";

const CANDIDATO = "article-candidate:pele-oleosa";
const BASE = "artbase:5a2426be65358552";

const leitura = (over: Partial<Parameters<typeof readFormationConclusionState>[0]> = {}) =>
  readFormationConclusionState({
    candidateRef: CANDIDATO,
    articleDnaVersionNumber: null,
    processed: true,
    concludedFormations: [{ candidateRef: CANDIDATO, formationBaseHash: BASE }],
    currentFormationBaseHash: BASE,
    ...over,
  });

test("§1/§2 — formação concluída sem ArticleDNA não é 'Pendente · Em processo'", () => {
  const concluida = leitura();
  assert.equal(concluida.state, "CONCLUDED_AWAITING_SILO");
  assert.equal(concluida.unitDetail, "formação concluída");
  assert.equal(concluida.definitionLabel, "Formação concluída");
  assert.equal(concluida.statusLabel, "Aguardando consolidação do Silo");
  // CONCLUDED_FORMATION_VISIBLE_AS_PENDING = NO
  assert.notEqual(concluida.definitionLabel, "Pendente");
  assert.notEqual(concluida.statusLabel, "Em processo");
});

test("§3 — concluída não finge ArticleDNA aprovado", () => {
  const concluida = leitura();
  assert.equal(concluida.formationConcluded, true);
  assert.equal(concluida.articleDnaMaterialized, false, "ArticleDNA ainda é 0");
  assert.equal(concluida.unitLabel, "CANDIDATO", "não vira ARTICLE antes de existir");
  assert.doesNotMatch(concluida.definitionLabel, /v\d/);
});

test("§1 — candidato não concluído continua em processo", () => {
  const aberta = leitura({ concludedFormations: [] });
  assert.equal(aberta.state, "IN_FORMATION");
  assert.equal(aberta.definitionLabel, "Pendente");
  assert.equal(aberta.formationConcluded, false);
});

test("§4 — a leitura vem do marcador remoto, não de estado local", () => {
  /*
   * O contrato do F5: recarregado, o marcador traz `concludedFormations` e a
   * linha reencontra o mesmo estado. Nada aqui olha React, sessão ou storage.
   */
  const fonte = readFileSync("lib/arquiteto/formation-conclusion-state.ts", "utf8");
  assert.doesNotMatch(fonte, /useState|useMemo|sessionStorage|localStorage|window/);
  assert.equal(leitura({ processed: false }).state, "CONCLUDED_AWAITING_SILO",
    "a conclusão gravada vale mesmo antes de o marcador ser lido como processado");
});

test("§4 — conclusão de OUTRA composição não é apresentada como vigente", () => {
  const desatualizada = leitura({ currentFormationBaseHash: "artbase:outra" });
  assert.equal(desatualizada.stale, true);
  assert.equal(desatualizada.formationConcluded, false);
  assert.match(desatualizada.statusLabel, /desatualizada/i);
});

test("§3 — com ArticleDNA a unidade vira ARTICLE e diz a versão", () => {
  const materializada = leitura({ articleDnaVersionNumber: 1 });
  assert.equal(materializada.state, "MATERIALIZED");
  assert.equal(materializada.unitLabel, "ARTICLE");
  assert.equal(materializada.articleDnaMaterialized, true);
  assert.match(materializada.definitionLabel, /Consolidado · v1/);
});

/* ============ §5–§8 · a fronteira sem conclusão não acusa ============== */

const semAlvo = () => resolveSiloBoundaryChallenge({
  scope: { kind: "candidate", id: CANDIDATO, label: "skincare para pele oleosa" },
  currentSiloRef: SILO,
  currentSiloLabel: "skincare",
  // Um único Silo no lote: não há contra o que comparar.
  suggestedSiloRef: null,
  suggestedSiloLabel: null,
  sharedUrlsWithCurrent: 0,
  sharedUrlsWithSuggested: 0,
});

test("§5 — SERP sem conclusão NÃO contesta a fronteira", () => {
  const achado = semAlvo();
  assert.equal(achado.kind, "BOUNDARY_UNRESOLVED");
  // INCONCLUSIVE_SERP_AUTOMATICALLY_CHALLENGES_SILO = NO
  assert.deepEqual(challengesRequiringSiloReview([achado]), []);
  assert.equal(unresolvedBoundaries([achado]).length, 1);
  assert.match(achado.reason, /não é o mesmo que fronteira errada/);
});

test("§7 — challenge sem alvo ou sem número não volta para Silos", () => {
  const semNumero = resolveSiloBoundaryChallenge({
    scope: { kind: "candidate", id: "c2", label: "skin care nivea" },
    currentSiloRef: SILO,
    currentSiloLabel: "skincare",
    suggestedSiloRef: "territory:outro",
    suggestedSiloLabel: "acne",
    sharedUrlsWithCurrent: 0,
    sharedUrlsWithSuggested: 0,
  });
  assert.deepEqual(challengesRequiringSiloReview([semNumero]), [], "sem evidência não há o que examinar");
});

test("§6/§8 — contestação de verdade tem alvo, número e volta para Silos", () => {
  const real = resolveSiloBoundaryChallenge({
    scope: { kind: "candidate", id: "c9", label: "pele oleosa e acne" },
    currentSiloRef: SILO,
    currentSiloLabel: "skincare",
    suggestedSiloRef: "territory:acne",
    suggestedSiloLabel: "acne",
    sharedUrlsWithCurrent: 1,
    sharedUrlsWithSuggested: 6,
  });
  assert.equal(real.kind, "BELONGS_ELSEWHERE");
  assert.equal(real.suggestedSiloLabel, "acne");
  assert.equal(real.evidence.sharedUrlsWithSuggested, 6);
  assert.equal(challengesRequiringSiloReview([real]).length, 1);
});

test("§6 — a tela separa 'sem conclusão' de 'contestada'", () => {
  const workspace = readFileSync("modules/arquiteto/arquiteto-workspace.tsx", "utf8");
  assert.match(workspace, /data-testid="architect-silo-boundary-unresolved"/);
  assert.match(workspace, /Fronteira sem conclusão/);
  // E a contestação real nomeia o destino, como pede o §8.
  assert.match(workspace, /destino sugerido: \{challenge\.suggestedSiloLabel\}/);
});

test("§1 — a linha da mesa lê a mesma autoridade remota", () => {
  const workspace = readFileSync("modules/arquiteto/arquiteto-workspace.tsx", "utf8");
  assert.match(workspace, /const formacao = readFormationConclusionState\(\{/);
  assert.match(workspace, /concludedFormations: articleFormationMarker\?\.concludedFormations \|\| \[\]/);
  /*
   * O estado da conclusão continua chegando à linha — mas UMA vez.
   *
   * Ele ocupava uma segunda linha abaixo do badge, que dizia "Em processo":
   * dois estados concorrentes na mesma célula para descrever a mesma coisa.
   * Agora `resolveArticleRowAxes` devolve o status único, e a formação
   * concluída sem ArticleDNA É "Aguardando consolidação do Silo".
   */
  assert.match(workspace, /formationConcluded: formacao\.formationConcluded/);
  assert.match(workspace, /data-testid="architect-row-operational-status"/);
  // O rótulo antigo, derivado só de "o lote foi processado?", saiu.
  assert.doesNotMatch(workspace, /art\.isFormationCandidate \? "aguardando processamento" : "ainda não confirmado"/);
});

/* ============ §2/§3 · a arquitetura do Silo vem das formações =========== */

import {
  formationsAwaitingMaterialization,
  resolveSiloCompositionFromFormations,
  siloClosureIsComplete,
} from "../lib/arquiteto/silo-composition-from-formations.ts";
import { planTerritorialSiloComposition } from "../lib/arquiteto/silo-consolidation-territorial.ts";

const formacao = (candidateRef: string, membros: number, materializedArticleId: string | null = null) => ({
  candidateRef,
  principalKeywordId: `k-${candidateRef}`,
  members: Array.from({ length: membros }, (_, index) => ({
    keywordId: `${candidateRef}-${index}`,
    role: (index === 0 ? "principal" : "secundaria") as "principal" | "secundaria",
  })),
  formationBaseHash: BASE,
  materializedArticleId,
});

test("§3 — o Pilar é o Article que cobre mais buscas do Silo", () => {
  const composicao = resolveSiloCompositionFromFormations({
    formations: [formacao("c-vitamina", 1), formacao("c-oleosa", 4), formacao("c-noturno", 1)],
  });
  assert.equal(composicao.pillarCandidateRef, "c-oleosa");
  assert.deepEqual(composicao.supportCandidateRefs, ["c-noturno", "c-vitamina"]);
  assert.deepEqual(composicao.narrativeOrder, ["c-oleosa", "c-noturno", "c-vitamina"]);
  assert.match(composicao.pillarReason, /Cobre 4 busca\(s\)/);
  assert.equal(composicao.coveredKeywordCount, 6);
});

test("§3 — empate de cobertura cai no volume da Principal, e depois na ordem estável", () => {
  const volumes = new Map([["k-c-a", 100], ["k-c-b", 900]]);
  const comVolume = resolveSiloCompositionFromFormations({
    formations: [formacao("c-a", 2), formacao("c-b", 2)],
    principalVolumeByKeywordId: volumes,
  });
  assert.equal(comVolume.pillarCandidateRef, "c-b");
  assert.match(comVolume.pillarReason, /empate de cobertura foi desfeito pelo volume/);

  // Sem volume, a mesma entrada precisa produzir a mesma arquitetura sempre.
  const assinatura = (formations: ReturnType<typeof formacao>[]) =>
    resolveSiloCompositionFromFormations({ formations }).narrativeOrder.join("|");
  assert.equal(
    assinatura([formacao("c-a", 2), formacao("c-b", 2)]),
    assinatura([formacao("c-b", 2), formacao("c-a", 2)]),
  );
});

test("§4 — a composição LÊ o congelado; ela não recalcula formação", () => {
  const fonte = readFileSync("lib/arquiteto/silo-composition-from-formations.ts", "utf8");
  // CONCLUDED_FORMATION_RECOMPUTED_DURING_MATERIALIZATION = NO
  assert.doesNotMatch(fonte, /deriveSemanticNuclei|suggestPrincipal|sameArticleAffinity|buildArticleFormationUniverse/);
  assert.doesNotMatch(fonte, /fetch\(|supabase|\/api\//);
});

/* ========================== §5 · idempotência ========================== */

test("§5 — formação já materializada não entra de novo na fila", () => {
  const formacoes = [formacao("c-a", 2, "article:a"), formacao("c-b", 2)];
  assert.deepEqual(
    formationsAwaitingMaterialization(formacoes).map(item => item.candidateRef),
    ["c-b"],
    "NOOP_SUCCESSOR_CREATED = NO",
  );
  // Segunda passada sobre o mesmo Silo não tem o que fazer.
  assert.deepEqual(formationsAwaitingMaterialization(formacoes.map(item => ({ ...item, materializedArticleId: "x" }))), []);
});

test("§6 — o fechamento só está completo com Silo canônico E todos os ArticleDNA", () => {
  const todas = [formacao("c-a", 2, "article:a"), formacao("c-b", 2, "article:b")];
  assert.equal(siloClosureIsComplete({ formations: todas, canonicalSiloExists: true }), true);
  // Falta o Silo: não fechou.
  assert.equal(siloClosureIsComplete({ formations: todas, canonicalSiloExists: false }), false);
  // Falta um artigo: não fechou.
  assert.equal(
    siloClosureIsComplete({ formations: [...todas, formacao("c-c", 1)], canonicalSiloExists: true }),
    false,
  );
});

/* ============= §2 · o portão aceita o Silo fechando com fila =========== */

test("§3/§10 — nenhum Silo canônico vazio: a ordem sai da auditoria", () => {
  /*
   * A passada anterior abriu um caminho para consolidar o Silo com as
   * formações à espera, assumindo SiloDNA → ArticleDNA. A auditoria dos
   * contratos desfez a premissa: ArticleDNA NÃO tem campo apontando para
   * SiloDNA — `siloId` é string anulável e `territoryRef` carrega o pai.
   *
   * Sem circularidade, a ordem é ArticleDNA → SiloDNA → SiloPage, e o Silo
   * vazio deixa de ter razão de existir.
   */
  const vazia = {
    territoryRef: SILO,
    brandId: "brand-1",
    pillarArticleId: null,
    supportArticleIds: [],
    exclusions: [],
  };
  const plano = planTerritorialSiloComposition({ composition: vazia, articles: [] });
  assert.deepEqual(
    plano.issues.map(item => item.code).sort(),
    ["PILLAR_NOT_SELECTED", "ZERO_ARTICLES"],
    "CANONICAL_CLOSURE_USES_TEMPORARY_EMPTY_SILO_VERSION = NO",
  );

  // E a bandeira que abria a exceção não existe mais em lugar nenhum.
  const semComentarios = (caminho: string) => readFileSync(caminho, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
  for (const caminho of [
    "lib/arquiteto/silo-consolidation-territorial.ts",
    "lib/arquiteto/silo-dna-binding.ts",
    "app/api/arquiteto/silo-consolidation/route.ts",
    "lib/server/arquiteto-silo-consolidation-adapter.ts",
  ]) {
    assert.doesNotMatch(semComentarios(caminho), /pendingFormations/, caminho);
  }
});

test("§2 — a matriz de referências fica registrada onde a decisão foi tomada", () => {
  const fonte = readFileSync("lib/arquiteto/silo-closure-readiness.ts", "utf8");
  assert.ok(fonte.includes("ArticleDNA  →  SiloDNA  →  SiloPage"), "a ordem auditada precisa estar escrita");
  assert.ok(fonte.includes("ArticleDNA não referencia SiloDNA"), "a linha que decide a ordem precisa estar dita");
  // E a matriz nomeia as três colunas que decidem: nulo, versão e artefato.
  for (const coluna of ["NULL?", "VERSÃO?", "EXIGE ARTEFATO?"]) {
    assert.ok(fonte.includes(coluna), `a matriz precisa declarar ${coluna}`);
  }
});

/* ================ §1 · a contagem é o acumulado remoto ================= */

import { resolveFormationLedger } from "../lib/arquiteto/silo-closure-readiness.ts";
import { buildCanonicalSiloClosurePlan } from "../lib/arquiteto/silo-composition-from-formations.ts";

const ATIVOS = ["c1", "c2", "c3", "c4", "c5"];

test("§15-A — 1 remota + 1 agora = 2 concluídas, 3 restantes, sem consolidar", () => {
  const ledger = resolveFormationLedger({
    activeCandidateRefs: ATIVOS,
    remoteConcludedRefs: ["c1"],
    concludedInThisRun: ["c2"],
  });
  assert.equal(ledger.totalConcluded, 2, "CONCLUSION_COUNT_USES_REMOTE_ACCUMULATED_STATE = YES");
  assert.equal(ledger.remaining, 3);
  assert.deepEqual(ledger.remainingFormationRefs, ["c3", "c4", "c5"]);

  const fechamento = resolveSiloClosureReadiness({
    siloRef: SILO,
    activeCandidateRefs: ledger.activeFormationRefs,
    concludedCandidateRefs: ledger.concludedFormationRefs,
    pendingMaterializationRefs: ledger.concludedFormationRefs,
  });
  assert.equal(fechamento.ready, false);
  assert.ok(fechamento.blockers.some(item => item.code === "FORMATIONS_PENDING"));
});

test("§15-B — 4 remotas + a última agora = 5/5, e o Silo fecha", () => {
  const ledger = resolveFormationLedger({
    activeCandidateRefs: ATIVOS,
    remoteConcludedRefs: ["c1", "c2", "c3", "c4"],
    concludedInThisRun: ["c5"],
  });
  assert.equal(ledger.totalConcluded, 5);
  assert.equal(ledger.remaining, 0);

  const fechamento = resolveSiloClosureReadiness({
    siloRef: SILO,
    activeCandidateRefs: ledger.activeFormationRefs,
    concludedCandidateRefs: ledger.concludedFormationRefs,
    pendingMaterializationRefs: ledger.concludedFormationRefs,
  });
  assert.equal(fechamento.ready, true, "LAST_FORMATION_TRIGGERS_CANONICAL_CLOSURE = YES");
});

test("§1 — conclusão fora do cenário corrente não conta como cobertura", () => {
  // Fica no marcador como histórico; não fecha o lote de agora.
  const ledger = resolveFormationLedger({
    activeCandidateRefs: ATIVOS,
    remoteConcludedRefs: ["c1", "candidato-de-outra-composicao"],
  });
  assert.equal(ledger.totalConcluded, 1);
  assert.deepEqual(ledger.concludedFormationRefs, ["c1"]);
});

test("§1 — a fiação usa o ledger, não a contagem desta execução", () => {
  const workspace = readFileSync("modules/arquiteto/arquiteto-workspace.tsx", "utf8");
  const trecho = workspace.slice(workspace.indexOf("const confirmArticleFormation"));
  const corpo = trecho.slice(0, trecho.indexOf("\n  }, ["));
  assert.match(corpo, /const ledger = resolveFormationLedger\(\{/);
  assert.match(corpo, /remoteConcludedRefs: \(marcador\.concludedFormations \|\| \[\]\)/);
  assert.match(corpo, /concludedCandidateRefs: ledger\.concludedFormationRefs/);
  // A contagem só desta execução não pode voltar.
  assert.doesNotMatch(corpo, /concludedCandidateRefs: \[\s*\.\.\.criadosConfirmados/);
});

/* ==================== §4 · o plano, sem escrever nada ================== */

test("§4/§10 — o plano ordena ArticleDNA → SiloDNA → SiloPage", () => {
  const plano = buildCanonicalSiloClosurePlan({
    formations: [formacao("c-oleosa", 4), formacao("c-vitamina", 1)],
    blockers: [],
  });
  assert.equal(plano.state, "READY");
  if (plano.state !== "READY") return;
  assert.deepEqual(plano.materializationOrder, ["c-oleosa", "c-vitamina"]);
  assert.equal(plano.pillarFormationRef, "c-oleosa");
  assert.deepEqual(plano.narrativeOrder, ["c-oleosa", "c-vitamina"]);
  assert.equal(plano.expectedArticles, 2);
  assert.equal(plano.expectedSiloDna, 1);
  assert.equal(plano.expectedSiloPage, 1);
  // §5 — a justificativa do Pilar viaja para o SiloDNA.
  assert.match(plano.pillarReason, /Cobre 4 busca\(s\)/);
});

test("§6 — bloqueio do Silo impede o plano, com o motivo", () => {
  const plano = buildCanonicalSiloClosurePlan({
    formations: [formacao("c-a", 2)],
    blockers: [{ code: "SILO_RECONSIDERATION_REQUIRED", detail: "pele oleosa e acne → acne" }],
  });
  assert.equal(plano.state, "BLOCKED");
  if (plano.state !== "BLOCKED") return;
  assert.equal(plano.blockers[0].code, "SILO_RECONSIDERATION_REQUIRED");
});

test("§12 — reexecutar sobre a mesma base não recria o que já existe", () => {
  const plano = buildCanonicalSiloClosurePlan({
    formations: [formacao("c-a", 2, "article:a"), formacao("c-b", 1, "article:b")],
    blockers: [],
  });
  assert.equal(plano.state, "READY");
  if (plano.state !== "READY") return;
  assert.deepEqual(plano.materializationOrder, [], "NOOP_SUCCESSOR_CREATED = NO");
});

test("§4 — o plano não escreve e não chama provider", () => {
  const fonte = readFileSync("lib/arquiteto/silo-composition-from-formations.ts", "utf8");
  assert.doesNotMatch(fonte, /fetch\(|supabase|persist|\/api\/|createVersionEnvelope/);
});
