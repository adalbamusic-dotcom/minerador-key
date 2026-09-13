import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  GLOBAL_WORKFLOW_LABELS,
  GLOBAL_WORKFLOW_STATUSES,
  globalWorkflowStatus,
  radarReadbackMatches,
} from "../lib/editorial/global-workflow-status.ts";
import {
  APPROVAL_STATE_LABELS,
  availableGlobalStatusTargets,
  planReadyForRadarBatch,
  resolveArticleOperationalState,
  validateReadyForRadarClaims,
  type CanonicalApprovalIndex,
} from "../lib/arquiteto/operational-status.ts";
import { buildRadarHandoffPlan } from "../lib/arquiteto/radar-handoff-gate.ts";
import { resolveCanonicalSiloForArticle } from "../lib/arquiteto/radar-handoff-context.ts";

/**
 * O STATUS GLOBAL DO ARTIGO, SEPARADO DOS ESTADOS DAS FASES.
 *
 * Três fatos diferentes convivendo na mesma linha:
 *
 *   ArticleDNA        Aprovado            — decisão sobre o artefato
 *   InternalLinkGraph Aprovado            — decisão sobre o grafo
 *   status global     Pronto para Radar   — posição no pipeline
 *
 * O status global organiza o trabalho. Ele não aprova nada, e nenhuma
 * aprovação o produz sozinha.
 */

const workspace = readFileSync("modules/arquiteto/arquiteto-workspace.tsx", "utf8");
/* Comentário é prosa: asserção sobre comentário não prova implementação. */
const codigo = workspace
  .split("\n")
  .filter(linha => !linha.trimStart().startsWith("*") && !linha.trimStart().startsWith("//") && !linha.trimStart().startsWith("/*"))
  .join("\n");
const rota = readFileSync("app/api/arquiteto/workflow-status/route.ts", "utf8");
const transicao = readFileSync("lib/server/global-workflow-transition.ts", "utf8");

/* ============ vocabulário · o global não empresta "Aprovado" ============ */

test("o status global usa Pronto para Radar, nunca Aprovado", () => {
  assert.deepEqual([...GLOBAL_WORKFLOW_STATUSES], [
    "RASCUNHO", "EM_PROCESSO", "DESCARTADO", "PRONTO_PARA_RADAR", "ENVIADO_AO_RADAR",
  ]);
  const rotulos = Object.values(GLOBAL_WORKFLOW_LABELS);
  assert.equal(rotulos.includes("Pronto para Radar"), true);
  for (const decisao of Object.values(APPROVAL_STATE_LABELS)) {
    assert.equal(rotulos.includes(decisao), false, `"${decisao}" é decisão de artefato, não status global`);
  }
});

test("valor desconhecido não vira status inventado", () => {
  assert.equal(globalWorkflowStatus("PRONTO_PARA_RADAR"), "PRONTO_PARA_RADAR");
  // Ausência lê como RASCUNHO — o default de leitura, não uma afirmação.
  assert.equal(globalWorkflowStatus(null), "RASCUNHO");
  assert.equal(globalWorkflowStatus(undefined), "RASCUNHO");
  // Vocabulário de outro tempo cai em EM_PROCESSO, não em "Aprovado".
  assert.equal(globalWorkflowStatus("CONCLUIDO"), "EM_PROCESSO");
  assert.equal(globalWorkflowStatus("approved"), "EM_PROCESSO");
});

test("a linha não afirma status global sem linha remota", () => {
  // `globalWorkflowStatus(undefined)` devolve RASCUNHO: renderizá-lo faria
  // toda linha de Links afirmar um status que o servidor nunca gravou.
  assert.equal(codigo.includes("if (!gravado) return null;"), true);
  // E o mesmo default de leitura não pode entrar como se fosse status gravado:
  // sem linha remota, `persistedStatus` é nulo.
  assert.equal(codigo.includes("persistedStatus: gravado ? globalWorkflowStatus(gravado.status) : null"), true);
  assert.equal(codigo.includes("globalWorkflowStatus(gravado?.status)"), false);
  // A sobrescrita que refazia a conta do domínio com leitura crua saiu.
  assert.equal(codigo.includes("state.workflowStatus = input.persistedStatus"), false);
});

test("PRONTO sobre base vencida lê EM_PROCESSO — a palavra que o servidor grava", () => {
  const vencido = resolveArticleOperationalState(operacional("a", {
    persistedStatus: "PRONTO_PARA_RADAR",
    persistedBaseMatches: false,
  }));
  assert.equal(vencido.workflowStatus, "EM_PROCESSO");
  const bloqueado = resolveArticleOperationalState(operacional("a", {
    persistedStatus: "PRONTO_PARA_RADAR",
    persistedBaseMatches: true,
    graphApproval: "BRUTO",
  }));
  assert.equal(bloqueado.workflowStatus, "EM_PROCESSO", "gate fechado rebaixa igual");
  // E o servidor escreve exatamente essa palavra na invalidação.
  assert.match(rota, /target: "EM_PROCESSO"/);
});

test("sem status gravado o item mostra o estado da fase, não RASCUNHO", () => {
  const semLinha = resolveArticleOperationalState(operacional("a", { persistedStatus: null }));
  assert.notEqual(semLinha.workflowStatus, "RASCUNHO", "ausência de linha não é status global");
  assert.equal(semLinha.workflowStatus, "CONCLUIDO", "com ArticleDNA aprovado, o estado é o da fase");
});

/* ========== READY_FOR_RADAR_ONLY_IN_LINKS · e a validação é do servidor === */

test("PRONTO_PARA_RADAR só é oferecido na aba Links internos", () => {
  // O seletor, o botão de aplicar e o envio nascem todos com a mesma cerca.
  for (const controle of ["globalStatusTarget", "applyGlobalStatus()", "sendSelectedToRadar()"]) {
    // Só as linhas que RENDERIZAM. A declaração do `useState` também contém
    // `<` — por causa do genérico — e não é controle na tela.
    const ocorrencias = codigo.split("\n")
      .filter(linha => linha.includes(controle) && linha.includes("workspaceMode"));
    for (const linha of ocorrencias) {
      assert.equal(
        linha.includes('workspaceMode === "links"'),
        true,
        `controle global renderizado fora de Links: ${linha.trim().slice(0, 120)}`,
      );
    }
  }
  // E os handlers recusam por conta própria — a cerca não é só de render.
  assert.equal(codigo.includes('if(workspaceMode!=="links") return;'), true);
  assert.equal(codigo.includes('if(workspaceMode !== "links") return;'), true);
});

const canonical = (overrides: Partial<CanonicalApprovalIndex> = {}): CanonicalApprovalIndex => ({
  approvedArticleVersions: new Set(["art:v1"]),
  approvedSiloVersions: new Set(["silo:v1"]),
  approvedSiloPageVersions: new Set(["page:v1"]),
  approvedGraphVersions: new Set(["graph:v1"]),
  articleIdByVersion: new Map([["art:v1", "article-1"]]),
  graphBases: new Map([["graph:v1", {
    siloDnaVersionId: "silo:v1",
    siloPageVersionId: "page:v1",
    articleVersionIds: ["art:v1"],
  }]]),
  ...overrides,
} as unknown as CanonicalApprovalIndex);

const claim = {
  articleId: "article-1",
  articleDnaVersionId: "art:v1",
  siloDnaVersionId: "silo:v1",
  siloPageVersionId: "page:v1",
  internalLinkGraphVersionId: "graph:v1",
};

test("o servidor exige os quatro artefatos aprovados e vigentes", () => {
  const ok = validateReadyForRadarClaims({ claims: [claim], canonical: canonical() });
  assert.equal(ok.accepted.length, 1);
  assert.equal(ok.refused.length, 0);

  // Sem grafo confirmado NÃO há Pronto para Radar — é a regra "só depois de Links".
  const semGrafo = validateReadyForRadarClaims({
    claims: [claim],
    canonical: canonical({ approvedGraphVersions: new Set() }),
  });
  assert.equal(semGrafo.accepted.length, 0);
  assert.match(semGrafo.refused[0].blockers.join(" "), /InternalLinkGraph/);

  for (const ausente of ["approvedArticleVersions", "approvedSiloVersions", "approvedSiloPageVersions"] as const) {
    const parcial = validateReadyForRadarClaims({
      claims: [claim],
      canonical: canonical({ [ausente]: new Set() } as Partial<CanonicalApprovalIndex>),
    });
    assert.equal(parcial.accepted.length, 0, `${ausente} ausente precisa recusar`);
  }
});

test("o grafo precisa corresponder ao artigo e ao par de Silo alegados", () => {
  const cruzado = validateReadyForRadarClaims({
    claims: [claim],
    canonical: canonical({
      graphBases: new Map([["graph:v1", {
        siloDnaVersionId: "outro-silo:v1",
        siloPageVersionId: "page:v1",
        articleVersionIds: ["art:v1"],
      }]]),
    }),
  });
  assert.equal(cruzado.accepted.length, 0);
  assert.match(cruzado.refused[0].blockers.join(" "), /não corresponde/);
});

test("a versão do ArticleDNA de outro artigo é recusada", () => {
  const roubada = validateReadyForRadarClaims({
    claims: [{ ...claim, articleId: "article-2" }],
    canonical: canonical(),
  });
  assert.equal(roubada.accepted.length, 0);
  assert.match(roubada.refused[0].blockers.join(" "), /pertence a outro artigo/);
});

/* ================== BATCH_STATUS_ACTION · lote por seleção ============== */

const operacional = (articleId: string, overrides: Record<string, unknown> = {}) => ({
  articleId,
  articleApproval: "APROVADO" as const,
  siloApproval: "APROVADO" as const,
  graphApproval: "APROVADO" as const,
  gateIssues: [],
  ...overrides,
});

test("o lote separa elegíveis, já prontos e recusados, por artigo", () => {
  const plano = planReadyForRadarBatch([
    operacional("a"),
    operacional("b", { graphApproval: "BRUTO" }),
    operacional("c", { persistedStatus: "PRONTO_PARA_RADAR" }),
  ]);
  assert.deepEqual(plano.eligible, ["a"]);
  assert.deepEqual(plano.alreadyReady, ["c"]);
  assert.equal(plano.refused.length, 1);
  assert.equal(plano.refused[0].articleId, "b");
  assert.match(plano.refused[0].blockers.join(" "), /links internos/i);
});

test("artefato rejeitado nunca avança, mesmo com os outros verdes", () => {
  const estado = resolveArticleOperationalState(operacional("a", { graphApproval: "REJEITADO" }));
  assert.equal(estado.canMarkReady, false);
  assert.match(estado.blockers.join(" "), /rejeitado/i);
});

/* ============ os dois eixos não se substituem ========================== */

test("ArticleDNA Aprovado + status global Pronto para Radar são fatos distintos", () => {
  const estado = resolveArticleOperationalState(operacional("a", {
    persistedStatus: "PRONTO_PARA_RADAR",
    persistedBaseMatches: true,
  }));
  assert.equal(estado.approvalState, "APROVADO", "a decisão continua sendo a do artefato");
  assert.equal(estado.workflowStatus, "PRONTO_PARA_RADAR", "e o pipeline responde por si");
});

test("RASCUNHO, EM_PROCESSO e DESCARTADO gravados vencem o derivado", () => {
  for (const status of ["RASCUNHO", "EM_PROCESSO", "DESCARTADO"] as const) {
    const estado = resolveArticleOperationalState(operacional("a", { persistedStatus: status }));
    assert.equal(estado.workflowStatus, status, "o status global é remoto, não derivado da aprovação");
    assert.equal(estado.approvalState, "APROVADO", "e não mexe na decisão editorial");
  }
});

test("marcar como pronto não aprova, e enviar não reaprova", () => {
  const marcado = resolveArticleOperationalState(operacional("a", {
    articleApproval: "BRUTO", graphApproval: "BRUTO", markedReady: true,
  }));
  assert.equal(marcado.approvalState, "BRUTO");
  assert.notEqual(marcado.workflowStatus, "PRONTO_PARA_RADAR", "sem os gates não há marca");

  const enviado = resolveArticleOperationalState(operacional("a", {
    articleApproval: "BRUTO", persistedStatus: "ENVIADO_AO_RADAR",
  }));
  assert.equal(enviado.approvalState, "BRUTO", "a entrega não aprova o artefato");
  assert.equal(enviado.workflowStatus, "ENVIADO_AO_RADAR");
});

/* ============ SEND_REQUIRES_READY e o readback do Radar ================ */

test("enviar ao Radar exige status gravado, não elegibilidade", () => {
  assert.equal(codigo.includes("selectedArticlesNotReadyForRadar.length > 0"), true);
  assert.equal(codigo.includes("canSendSelectedArticlesToRadarNow"), true);
  // `canSendToRadar` é a autoridade do vocabulário: só PRONTO passa.
  assert.equal(codigo.includes("canSendToRadar(item.state.workflowStatus)"), true);
});

test("ENVIADO_AO_RADAR exige a linha do Radar batendo com a versão enviada", () => {
  assert.match(rota, /\.eq\("stage","radar"\)/);
  assert.match(rota, /radar\.data\.source_version_id !== claim\.articleDnaVersionId/);
  assert.match(rota, /Entrega no Radar ainda não confirmada remotamente/);
});

test("o readback do Radar confere marca, artigo, versão e hash", () => {
  const casa = radarReadbackMatches(
    { marca_id: "b1", stage: "radar", article_id: "a1", source_version_id: "v1", source_content_hash: "h1" },
    "b1", "a1", "v1", "h1",
  );
  assert.equal(casa, true);
  assert.equal(radarReadbackMatches(null, "b1", "a1", "v1", "h1"), false, "linha ausente não é confirmação");
  for (const errado of [
    { marca_id: "outra", stage: "radar", article_id: "a1", source_version_id: "v1", source_content_hash: "h1" },
    { marca_id: "b1", stage: "planner", article_id: "a1", source_version_id: "v1", source_content_hash: "h1" },
    { marca_id: "b1", stage: "radar", article_id: "a1", source_version_id: "v2", source_content_hash: "h1" },
    { marca_id: "b1", stage: "radar", article_id: "a1", source_version_id: "v1", source_content_hash: "h2" },
  ]) {
    assert.equal(radarReadbackMatches(errado, "b1", "a1", "v1", "h1"), false);
  }
});

test("o cliente recusa o handoff sem readback confirmado", () => {
  const contexto = readFileSync("components/editorial-pipeline-context.tsx", "utf8");
  assert.match(contexto, /body\.readbackConfirmed!==true/);
  assert.match(contexto, /code:"readback_mismatch"/);
  assert.match(contexto, /const remote=escrita\.radarItems \|\| \[\];/);
});

/* ============ persistência remota, histórico e sem migration =========== */

test("GLOBAL_WORKFLOW_STATUS_REMOTE: a gravação vai ao servidor e volta lida", () => {
  assert.match(rota, /source: "CANONICAL_REMOTE"/);
  // O POST relê o que gravou antes de responder.
  assert.match(rota, /const readback = await readArchitectItems\(/);
  assert.match(rota, /A gravação não apareceu no readback remoto/);
  // A tela não guarda status em sessão nem em localStorage.
  const leitura = codigo.slice(codigo.indexOf("const applyRemoteWorkflowStatus"), codigo.indexOf("const applyRemoteWorkflowStatus") + 900);
  assert.equal(leitura.includes("localStorage"), false);
  assert.equal(codigo.includes("localStorage.setItem(\"arquiteto-workflow-status"), false);
});

test("toda transição deixa histórico, e sem histórico não há sucesso", () => {
  assert.match(transicao, /editorial_decision_events/);
  assert.match(transicao, /from_state: previous\?\.state \?\? null/);
  assert.match(transicao, /to_state: input\.target/);
  /*
   * Falhou o histórico: a mudança é revertida e o erro sobe. Nada de sucesso.
   *
   * As frases ganharam PASSO nomeado neste corte — `INSERT_DECISION_EVENT`,
   * `COMPENSATING_ROLLBACK`, `READBACK_ITEM`, `READBACK_EVENT` — porque
   * "A gravação do status falhou" não dizia onde a escrita morreu.
   */
  assert.match(transicao, /O histórico da transição não pôde ser confirmado/);
  assert.match(transicao, /readback remoto divergiu/);
  assert.match(transicao, /"COMPENSATING_ROLLBACK"/);
  assert.match(transicao, /"READBACK_ITEM"/);
  // Lock otimista: escrita sobre linha que mudou em outra sessão não passa.
  assert.match(transicao, /\.eq\("lock_version", previous\.lock_version\)/);
});

test("MIGRATION_ADDED = NO: o modelo existente já comporta o status", () => {
  const zero27 = readFileSync("supabase/migrations/0027_editorial_artifacts_workflow_serp.sql", "utf8");
  // `state` é texto livre — nenhum CHECK a ampliar para os cinco status.
  assert.match(zero27, /UNIQUE \(marca_id, subject_type, subject_id, stage\)/);
  const zero2 = readFileSync("supabase/migrations/0002_operational_editorial_flow.sql", "utf8");
  // E o histórico de transição já tem de/para.
  assert.match(zero2, /from_state text/);
  assert.match(zero2, /to_state text/);
});

test("o filtro global lê o status persistido, não os estados das fases", () => {
  assert.equal(
    codigo.includes("globalWorkflowStatus(remoteWorkflowStatus.get(articleEntityIdFor(art))?.status) !== filterStatus"),
    true,
    "o filtro pergunta ao status remoto",
  );
  assert.equal(
    codigo.includes("articleWorkflowStatus(art) !== filterStatus"),
    false,
    "o filtro não pode voltar a ler o estado derivado da fase",
  );
});

/* ============ fechamento da primeira passada · §4 a §7 ================= */

test("§5 — Pronto para Radar só é oferecido com o InternalLinkGraph aprovado", () => {
  const semGrafo = availableGlobalStatusTargets([{ graphApproval: "BRUTO" }, { graphApproval: "BRUTO" }]);
  assert.deepEqual(semGrafo, ["RASCUNHO", "EM_PROCESSO", "DESCARTADO"]);
  assert.equal(semGrafo.includes("PRONTO_PARA_RADAR" as never), false);

  const comGrafo = availableGlobalStatusTargets([{ graphApproval: "APROVADO" }]);
  assert.equal(comGrafo.includes("PRONTO_PARA_RADAR" as never), true);

  // Lote misto: a opção existe e o plano recusa por artigo, com o motivo.
  const misto = availableGlobalStatusTargets([{ graphApproval: "APROVADO" }, { graphApproval: "BRUTO" }]);
  assert.equal(misto.includes("PRONTO_PARA_RADAR" as never), true);
});

test("§6 — as três guias de trabalho existem sempre; ENVIADO_AO_RADAR nunca é escolhível", () => {
  for (const cenario of [[{ graphApproval: "BRUTO" as const }], [{ graphApproval: "APROVADO" as const }], []]) {
    const alvos = availableGlobalStatusTargets(cenario);
    for (const guia of ["RASCUNHO", "EM_PROCESSO", "DESCARTADO"]) {
      assert.equal(alvos.includes(guia as never), true, `${guia} organiza o trabalho e não depende de artefato`);
    }
    assert.equal(alvos.includes("ENVIADO_AO_RADAR" as never), false, "a entrega é consequência do handoff, não escolha");
  }
});

test("§5 — a cerca vale para o seletor E para o ato", () => {
  assert.equal(codigo.includes("const globalStatusTargets = availableGlobalStatusTargets("), true);
  assert.equal(codigo.includes("{globalStatusTargets.map(status=><option"), true);
  // O alvo é reconferido no clique: a seleção muda entre escolher e aplicar.
  assert.equal(codigo.includes("if(!globalStatusTargets.includes(globalStatusTarget))"), true);
  assert.equal(codigo.includes("O InternalLinkGraph precisa estar aprovado antes de marcar Pronto para Radar."), true);
});

test("§4 — Confirmar links aprova pelo caminho remoto, com readback do servidor", () => {
  const cliente = readFileSync("lib/arquiteto/internal-link-graph-persistence.ts", "utf8");
  assert.match(cliente, /\/api\/arquiteto\/internal-link-graph/);
  assert.match(cliente, /source: "CANONICAL_REMOTE"/);
  // O servidor relê pelo versionId e confere campo a campo antes de responder.
  const servidor = readFileSync("lib/server/internal-link-graph-persistence.ts", "utf8");
  assert.match(servidor, /const readback = await readInternalLinkGraph\(context, parsed\.graphVersionId\)/);
  assert.match(servidor, /O grafo não foi confirmado no readback canônico/);
  assert.match(servidor, /validateInternalLinkGraphReadback\(parsed, readback\)/);
  assert.match(servidor, /O readback do grafo divergiu/);
});

test("§7 — Enviar ao Radar exige status gravado e artefatos vigentes", () => {
  // A tela recusa antes de enviar…
  assert.equal(codigo.includes("selectedArticlesNotReadyForRadar.length > 0"), true);
  // …e o servidor confere a linha do Radar contra a versão alegada.
  assert.match(rota, /Entrega no Radar ainda não confirmada remotamente/);
  // Nenhum artefato vencido sustenta o envio: a validação canônica é a mesma.
  const semGrafoVigente = validateReadyForRadarClaims({
    claims: [claim],
    canonical: canonical({ approvedGraphVersions: new Set() }),
  });
  assert.equal(semGrafoVigente.accepted.length, 0);
});

/* ====== homologação · a SERP resolvida não reabre no gate final ======== */



const artigoDoRadar = (overrides: Record<string, unknown> = {}) => ({
  articleId: "art-1",
  label: "skin care noturno",
  articleDnaVersionId: "art:v1",
  articleDnaContentHash: "h1",
  territoryRef: "territory:skincare",
  siloId: null,
  canonicalSiloResolved: true,
  principalKeywordId: "k1",
  secondaryKeywordIds: [],
  narrativeReinforcementIds: [],
  suggestedSlug: "skin-care-noturno",
  keywordTerritoryRefs: ["territory:skincare"],
  serpState: "current_inconclusive",
  serpReason: null,
  internalLinkGraphApproved: true,
  belongsToCurrentScenario: true,
  readbackConfirmed: true,
  formationConcluded: true,
  humanPendingDecisions: [],
  ...overrides,
});

test("C — SERP inconclusiva com formação concluída NÃO bloqueia o gate final", () => {
  const plano = buildRadarHandoffPlan([artigoDoRadar()]);
  const bloqueios = plano.blocked.flatMap(item => item.blockers).join(" ");
  assert.doesNotMatch(bloqueios, /ainda espera decisão editorial/);
  assert.equal(plano.eligible.length, 1, `esperava elegível, bloqueios: ${bloqueios}`);
});

test("D — pendência humana explícita continua bloqueando", () => {
  const plano = buildRadarHandoffPlan([artigoDoRadar({
    humanPendingDecisions: ["Separar a keyword X do artigo atual."],
  })]);
  assert.equal(plano.eligible.length, 0);
  assert.match(plano.blocked[0].blockers.join(" "), /decisão humana pendente/);
});

test("D — sem formação concluída o inconclusivo continua barrando", () => {
  const plano = buildRadarHandoffPlan([artigoDoRadar({ formationConcluded: false })]);
  assert.equal(plano.eligible.length, 0);
  assert.match(plano.blocked[0].blockers.join(" "), /ainda espera decisão editorial/);
});

test("SERP stale continua barrando: evidência vencida não é decisão tomada", () => {
  const plano = buildRadarHandoffPlan([artigoDoRadar({ serpState: "stale" })]);
  assert.equal(plano.eligible.length, 0);
  assert.match(plano.blocked[0].blockers.join(" "), /não descreve mais este artigo/);
});

test("I — os cinco da Care Glow passam sem reabrir decisão editorial", () => {
  const lote = ["skincare para pele oleosa", "skin care noturno", "skin care nivea", "mascara facial skin care", "skincare vitamina c"]
    .map((label, indice) => artigoDoRadar({
      articleId: `art-${indice}`,
      label,
      articleDnaVersionId: `art:v${indice}`,
      suggestedSlug: `slug-${indice}`,
    }));
  const plano = buildRadarHandoffPlan(lote);
  assert.equal(plano.eligible.length, 5, `bloqueios: ${plano.blocked.flatMap(item => item.blockers).join(" · ")}`);
});

/* ====== §6 · a recusa nomeia refs e o que o índice conhece ============= */

test("§6 — a recusa carrega diagnóstico com as refs alegadas", () => {
  const semGrafo = validateReadyForRadarClaims({
    claims: [claim],
    canonical: canonical({ approvedGraphVersions: new Set() }),
  });
  const diagnostico = semGrafo.refused[0].diagnostic!;
  assert.equal(diagnostico.articleDnaVersionRef, "art:v1");
  assert.equal(diagnostico.articleDnaKnownApproved, true);
  assert.equal(diagnostico.articleIdOfVersion, "article-1");
  assert.equal(diagnostico.resolvedSiloDnaVersionRef, "silo:v1");
  assert.equal(diagnostico.resolvedSiloPageVersionRef, "page:v1");
  assert.equal(diagnostico.graphVersionRef, "graph:v1");
  assert.equal(diagnostico.graphKnownApproved, false, "e diz exatamente qual das quatro falhou");
  assert.ok(diagnostico.graphBase, "a base do grafo entra para comparar o par");
});

test("§6 — o servidor registra o diagnóstico, e ele não vai para a mesa", () => {
  assert.match(rota, /\[arquiteto\]\[ready-for-radar\] recusa/);
  assert.match(rota, /\.\.\.recusa\.diagnostic,/);
});

/* ====== E · siloId nulo resolve o par pelo território ================== */

test("E — ArticleDNA com siloId null resolve SiloDNA e SiloPage pelo territoryRef", () => {
  const resolucao = resolveCanonicalSiloForArticle({
    article: { articleId: "art-1", siloId: null, territoryRef: "territory:skincare" } as never,
    siloVersions: [{ versionId: "silo:v1", payload: { siloId: "silo-1", territoryRef: "territory:skincare" } } as never],
    siloPageVersions: [{ versionId: "page:v1", payload: { siloPageId: "page-1", siloId: "silo-1" } } as never],
  });
  assert.equal(resolucao.ok, true, resolucao.ok ? "" : resolucao.reason);
  if (!resolucao.ok) return;
  assert.equal(resolucao.context.siloDnaVersionId, "silo:v1");
  assert.equal(resolucao.context.siloPageVersionId, "page:v1");
});

test("F — território sem SiloDNA canônico continua bloqueando", () => {
  const resolucao = resolveCanonicalSiloForArticle({
    article: { articleId: "art-1", siloId: null, territoryRef: "territory:orfao" } as never,
    siloVersions: [{ versionId: "silo:v1", payload: { siloId: "silo-1", territoryRef: "territory:skincare" } } as never],
    siloPageVersions: [],
  });
  assert.equal(resolucao.ok, false);
});

test("§3 — sem par canônico resolvido o portão continua barrando", () => {
  const plano = buildRadarHandoffPlan([artigoDoRadar({ siloId: null, canonicalSiloResolved: false })]);
  assert.equal(plano.eligible.length, 0);
  assert.match(plano.blocked[0].blockers.join(" "), /nenhum Silo canônico/);
});

test("§4 — sem InternalLinkGraph aprovado o gate final continua fechado", () => {
  const plano = buildRadarHandoffPlan([artigoDoRadar({ internalLinkGraphApproved: false })]);
  assert.equal(plano.eligible.length, 0);
  assert.match(plano.blocked[0].blockers.join(" "), /InternalLinkGraph aprovado/);
});

test("§3 — a tela informa o par resolvido pelo mesmo resolvedor do envio", () => {
  assert.equal(codigo.includes("canonicalSiloResolved: Boolean(dna && (() => {"), true);
  assert.equal(codigo.includes("return resolucao.ok && resolucao.context.siloPageVersionId;"), true);
});

test("§1 — a coluna lê a chave do ArticleDNA, que é a do SiloDNA", () => {
  assert.equal(
    codigo.includes('linksHierarchy?.roleByArticleId.get(String(articleDnaVersion?.payload.articleId || ""))'),
    true,
  );
  // A chave errada não pode voltar: `articleEntityId` é outro identificador.
  assert.equal(codigo.includes('roleByArticleId.get(String(articleEntityId || ""))'), false);
});
