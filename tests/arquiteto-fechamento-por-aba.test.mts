import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  articleApprovalRevalidationIssues,
  type ArticleApprovalRevalidationIssue,
} from "../lib/arquiteto/article-approval-revalidation.ts";
import {
  articleClosingBlockers,
  closeArticleRevisions,
  serpEvidenceFromGate,
  type ArticleClosingCandidate,
} from "../lib/arquiteto/article-closing-service.ts";
import type { ArticleDNA, VersionEnvelope } from "../lib/arquiteto/contracts.ts";

const workspace = readFileSync("modules/arquiteto/arquiteto-workspace.tsx", "utf8");

/* ===================== a fronteira entre as abas ========================= */

/**
 * CADA ABA FECHA O QUE ELA DECIDE.
 *
 * Artigos fecha composição e pertencimento ao Silo; Links internos trabalha
 * relações e âncoras SOBRE essa arquitetura. As duas condições estavam
 * invertidas: dava para trocar o Silo de um artigo na aba de âncoras, e o
 * envio ao Radar aparecia no meio da formação.
 */

/**
 * §5/§6 — O RODAPÉ DA FASE 1.
 *
 * Reabrir revisão e mover entre Silos são manutenção estrutural DESTA mesa:
 * cada uma abre uma jornada que a homologação básica não precisa provar, e
 * saíram da tela. Os handlers continuam no código.
 *
 * O Excluir NÃO: ele é controle global, do ciclo de vida canônico. Controle
 * que vem do global não se mexe dentro da área — eu o havia retirado junto
 * com os outros dois, e isso estava errado.
 */
test("o rodapé de Artigos não faz manutenção estrutural manual", () => {
  // O Excluir NÃO entra nesta lista: ele é controle global do ciclo de vida
  // canônico, e controle que vem do global não se mexe dentro da área.
  for (const controle of ["Mover selecionados para Silo", "architect-apply-closing"]) {
    assert.ok(!workspace.includes(controle), `${controle} saiu do rodapé da fase 1`);
  }
  // Limpar seleção e o envio ao Radar (na aba Links) continuam.
  assert.match(workspace, /markSelectionInteraction\("clear-selection"\)/);
  assert.match(workspace, /Controle que vem do global não se mexe/);
  // E o Excluir global continua no rodapé.
  assert.match(workspace, /void requestSelectedKeywordDeletion\(\)/);
});

test("enviar ao Radar não aparece na aba Artigos", () => {
  const linha = workspace.split(/\r?\n/).find(item => item.includes("void sendSelectedToRadar()"));
  assert.ok(linha, "o botão de envio ao Radar precisa existir");
  assert.match(linha!, /workspaceMode === "links"/, "transferência fecha a passada em Links internos");
  assert.ok(!/\{articleMode[^\r\n]*sendSelectedToRadar/.test(workspace), "transferência não é status editorial da fase Artigos");
});

/* ================== o seletor de status e o serviço ====================== */

test("a fase 1 tem duas ações, e nenhuma delas é uma etapa intermediária", () => {
  /*
   * O fluxo é "Reprocessar artigos → Concluir formação". "Enviar para
   * aprovação" era um terceiro passo herdado: não gravava sucessora, só movia
   * de fila. E "Reabrir revisão" saiu do rodapé nesta rodada — é manutenção
   * estrutural, não parte do caminho básico.
   */
  assert.ok(!workspace.includes(`<option value="submit_for_approval"`), "não existe etapa de envio para aprovação");
  assert.ok(!workspace.includes(`<option value="approve"`), "o rodapé não aprova ArticleDNA");
  assert.ok(!workspace.includes("Reabrir revisão de {closingEligibility.eligible}"), "reabrir saiu do caminho básico");
  // O serviço de fechamento continua existindo para quando ela voltar.
  assert.match(workspace, /const applyClosingToSelection = async \(/);
});

test("a aprovação do ArticleDNA tem uma autoridade só", () => {
  // `Concluir formação` → `materializeApprovedArticleDnas` é o ÚNICO caminho
  // que grava `status: "approved"` para article_dna a partir da tela.
  assert.ok(!workspace.includes("const consolidateArticleArchitecture"), "a consolidação paralela não pode voltar");
  assert.ok(!workspace.includes("const handleConfirmArticleArchitecture"), "o handler duplicado não pode voltar");
  assert.ok(!workspace.includes("const confirmSelectedArchitectures"), "o lote paralelo não pode voltar");
  /*
   * As duas escritas de `approved` que restam pertencem à MESMA conclusão:
   * a materialização dos aprovados e o backfill do Silo canônico dos que já
   * estavam aprovados. As duas são chamadas por `confirmArticleFormation`.
   */
  // Só as passagens de código contam; a nota que explica a remoção cita o campo.
  assert.equal((workspace.match(/^\s+status: "approved",$/gm) || []).length, 2);
  const conclusao = workspace.slice(workspace.indexOf("const confirmArticleFormation"));
  assert.match(conclusao, /await materializeApprovedArticleDnas\(plano\.approved\)/);
  assert.match(conclusao, /await materializeLegacyArticleSiloIds\(\)/);
  // A porta de persistência recusa explicitamente qualquer reintrodução.
  assert.match(workspace, /Aprovar ArticleDNA é ato de Concluir formação, na aba Artigos\./);
  assert.match(workspace, /closeArticleRevisions\(\{/, "o lote de envio/reabertura continua pelo serviço");
});

test("o caminho legado de status foi REMOVIDO, não reconectado", () => {
  // Ele aprovava só com evento local: sem validação, sem persistência, sem readback.
  assert.ok(!workspace.includes("const changeSelectedArticleStatus"), "o caminho legado não pode voltar");
  assert.ok(!workspace.includes("setSelectedStatusAction"), "o estado do seletor antigo não pode ficar órfão");
  assert.match(workspace, /changeSelectedArticleStatus` foi REMOVIDO/, "a remoção precisa explicar por quê");
});

test("reabrir revisão cria sucessora em proposed e não rebaixa a aprovada", () => {
  const reabrir = workspace.slice(workspace.indexOf("const reopenArticleRevision"));
  const corpo = reabrir.slice(0, 2200);
  assert.match(corpo, /versionNumber: current\.versionNumber \+ 1/, "reabrir sucede, nunca reescreve");
  assert.match(corpo, /previousVersionId: current\.versionId/);
  assert.match(corpo, /status: "proposed"/, "a sucessora nasce fora da aprovação");
  assert.ok(!corpo.slice(0, corpo.indexOf("return { version: canonicalSuccessor, changed: true, readbackConfirmed: true }"))
    .includes(`status: "approved"`), "a versão aprovada anterior permanece como está");
});

/* ================= o conflito pertence à fase que o decide =============== */

/**
 * O CONFLITO DE FRONTEIRA DE SILO É DA FASE SILOS.
 *
 * `detectArchitectureConflicts` compara `suggestedSiloId` entre grupos do
 * agrupamento PROVISÓRIO do engine e emite `fronteira_de_silo`, de nível
 * "silo". Enquanto a leitura do artigo caía nesse detector fora da aba
 * Artigos, o conflito territorial aparecia na aba Links internos como decisão
 * humana pendente DO ARTIGO — sobre um agrupamento que a revisão já
 * substituiu, e com o Silo do artigo já confirmado.
 */

test("a leitura de conflito do artigo não consulta o agrupamento provisório", () => {
  const leitura = workspace.slice(
    workspace.indexOf("const articleConflictsFor"),
    workspace.indexOf("const articleParentFor"),
  );
  assert.ok(leitura.length > 0, "a leitura precisa existir");
  assert.ok(!leitura.includes("detectArchitectureConflicts"), "o fallback provisório não pode voltar");
  assert.ok(!leitura.includes("workspaceMode"), "a autoridade não muda de aba para aba");
  assert.match(leitura, /universe\.candidates\.find\(item => item\.candidateRef === input\.candidateRef\)/);
});

test("o conflito de fronteira de Silo continua declarado como nível silo", () => {
  const conflitos = readFileSync("lib/arquiteto/conflicts.ts", "utf8");
  const bloco = conflitos.slice(conflitos.indexOf(`conflictId("fronteira_de_silo"`));
  assert.match(bloco.slice(0, 400), /level: "silo"/, "quem decide fronteira é a fase Silos");
  assert.match(bloco.slice(0, 400), /Temas semanticamente proximos foram direcionados a silos diferentes\./);
});

/* ============ Links consome ArticleDNA, não o produz ==================== */

test("a fase Links nomeia a dependência de Artigos antes de qualquer estado da tela", () => {
  const leitura = workspace.slice(workspace.indexOf("const linksPhaseReading"));
  const corpo = leitura.slice(0, leitura.indexOf("const updateLinkEdge"));
  assert.match(corpo, /const dependenciaUpstream = naoConcluidos\.length/);
  assert.match(corpo, /não foram concluídos na aba Artigos/);
  assert.match(corpo, /esta aba não fecha ArticleDNA/);
  // A dependência vem ANTES de "Há uma operação em curso": o motivo precisa
  // dizer o que falta fazer, não descrever um estado interno da tela.
  assert.ok(
    corpo.indexOf("dependenciaUpstream\n        ? dependenciaUpstream") < corpo.indexOf(`: ocupado`)
      || corpo.indexOf("? dependenciaUpstream") < corpo.lastIndexOf("Há uma operação em curso"),
    "a dependência upstream precisa ser oferecida antes do estado ocupado",
  );
});

test("o salvamento preso deixa de fingir operação em curso", () => {
  assert.match(workspace, /setLinksSaveState\(atual => \(atual === "saving" \? "idle" : atual\)\)/,
    "ao sair de processarLinks nada está em voo: o latch precisa ser liberado");
});

/* ======================= a SERP lida pelo gate =========================== */

test("a evidência SERP do fechamento vem do gate, não de uma segunda conta", () => {
  assert.deepEqual(serpEvidenceFromGate(null), { serp: "NOT_COLLECTED", serpDecisionResolved: false });
  assert.deepEqual(serpEvidenceFromGate({ state: "missing", blocksConclusion: true }), { serp: "NOT_COLLECTED", serpDecisionResolved: false });
  // Falha e coleta em andamento não são evidência utilizável desta composição.
  assert.deepEqual(serpEvidenceFromGate({ state: "failed", blocksConclusion: true }), { serp: "NOT_COLLECTED", serpDecisionResolved: false });
  assert.deepEqual(serpEvidenceFromGate({ state: "processing", blocksConclusion: true }), { serp: "NOT_COLLECTED", serpDecisionResolved: false });
  assert.deepEqual(serpEvidenceFromGate({ state: "stale", blocksConclusion: true }), { serp: "STALE", serpDecisionResolved: false });
  // Sustentada não tem decisão humana registrada porque não precisa de uma.
  assert.deepEqual(serpEvidenceFromGate({ state: "current_supported", blocksConclusion: false }), { serp: "CURRENT", serpDecisionResolved: true });
  assert.deepEqual(serpEvidenceFromGate({ state: "current_divergent_resolved", blocksConclusion: false }), { serp: "CURRENT", serpDecisionResolved: true });
  assert.deepEqual(serpEvidenceFromGate({ state: "current_divergent_unresolved", blocksConclusion: true }), { serp: "CURRENT", serpDecisionResolved: false });
});

test("evidência vigente aguardando decisão bloqueia sem mandar coletar de novo", () => {
  const candidato: ArticleClosingCandidate = {
    articleId: "article:1", label: "skin care rosto", hasArticleDna: true, approved: false, formationSaved: true,
    principalKeywordIds: ["kw-a"], pendingDecisions: [], conflicts: [],
    ...serpEvidenceFromGate({ state: "current_inconclusive_unresolved", blocksConclusion: true }),
  };
  const blockers = articleClosingBlockers(candidato, "approve");
  const alvo = blockers.find(item => item.code === "SERP_AWAITS_DECISION");
  assert.ok(alvo, "SERP vigente e indecisa precisa bloquear");
  assert.ok(!blockers.some(item => item.code === "SERP_NOT_COLLECTED"), "coletar de novo não resolveria nada");
  assert.match(alvo!.resolveWith, /aba SERP/);
});

/* ==================== o verbo de cada ação no lote ======================= */

test("um lote de envio não anuncia aprovação", async () => {
  const candidato: ArticleClosingCandidate = {
    articleId: "a", label: "pronto", hasArticleDna: true, approved: false, formationSaved: true,
    principalKeywordIds: ["kw-a"], pendingDecisions: ["KGR do artigo"], conflicts: [],
    serp: "NOT_COLLECTED", serpDecisionResolved: false,
  };
  const lote = await closeArticleRevisions({
    candidates: [candidato],
    action: "submit_for_approval",
    persist: async () => ({ readbackConfirmed: true, changed: true, versionId: "v6", versionNumber: 6, contentHash: "sha256:x" }),
  });
  assert.match(lote.summary, /1 enviado\(s\)/, "enviar para aprovação não é aprovar");
  assert.ok(!lote.summary.includes("aprovado"));
});

test("reabertura em lote conta reaberturas", async () => {
  const lote = await closeArticleRevisions({
    candidates: [{
      articleId: "a", label: "aprovado", hasArticleDna: true, approved: true, formationSaved: true,
      principalKeywordIds: ["kw-a"], pendingDecisions: [], conflicts: [], serp: "CURRENT", serpDecisionResolved: true,
    }],
    action: "reopen_revision",
    persist: async () => ({ readbackConfirmed: true, changed: true, versionId: "v7", versionNumber: 7, contentHash: "sha256:y" }),
  });
  assert.match(lote.summary, /1 reaberto\(s\)/);
});

/* ================ a revalidação do lado do servidor ====================== */

const payload = (overrides: Partial<ArticleDNA> = {}) => ({
  brandId: "09762023-d0d4-4c24-b34e-d0fdfd43f891",
  articleId: "article:1",
  principalKeywordId: "kw-a",
  architectureStatus: "architecture_confirmed",
  serpAssessmentRef: { entityId: "serp:1", versionId: "serp:1:base", contentHash: "sha256:serp" },
  keywordReferences: [
    { keywordId: "kw-a", role: "principal" },
    { keywordId: "kw-b", role: "secundaria" },
  ],
  ...overrides,
}) as unknown as ArticleDNA;

const envelope = (overrides: Partial<ArticleDNA> = {}) =>
  ({ versionId: "v6", versionNumber: 6, contentHash: "sha256:x", payload: payload(overrides) }) as unknown as VersionEnvelope<ArticleDNA>;

const codigos = (issues: ArticleApprovalRevalidationIssue[]) => issues.map(issue => issue.code);

test("o servidor aceita a aprovação coerente", () => {
  assert.deepEqual(
    articleApprovalRevalidationIssues({ version: envelope(), authorizedBrandId: "09762023-d0d4-4c24-b34e-d0fdfd43f891" }),
    [],
  );
});

test("a marca vem do contexto autorizado, nunca do corpo enviado", () => {
  const issues = articleApprovalRevalidationIssues({ version: envelope(), authorizedBrandId: "outra-marca" });
  assert.deepEqual(codigos(issues), ["BRAND_MISMATCH"]);
});

test("o servidor recusa duas Principais mesmo com a tela dizendo que pode", () => {
  const issues = articleApprovalRevalidationIssues({
    version: envelope({
      keywordReferences: [
        { keywordId: "kw-a", role: "principal" },
        { keywordId: "kw-b", role: "principal" },
      ],
    } as unknown as Partial<ArticleDNA>),
    authorizedBrandId: "09762023-d0d4-4c24-b34e-d0fdfd43f891",
  });
  assert.ok(codigos(issues).includes("MULTIPLE_PRINCIPALS"));
  assert.match(issues.find(item => item.code === "MULTIPLE_PRINCIPALS")!.detail, /kw-a, kw-b/, "as buscas precisam ser nomeáveis");
});

test("Principal declarada divergente das referências é recusada", () => {
  const issues = articleApprovalRevalidationIssues({
    version: envelope({ principalKeywordId: "kw-b" }),
    authorizedBrandId: "09762023-d0d4-4c24-b34e-d0fdfd43f891",
  });
  assert.ok(codigos(issues).includes("PRINCIPAL_NOT_IN_REFERENCES"));
});

test("aprovar sem arquitetura confirmada e sem evidência SERP é recusado", () => {
  const issues = articleApprovalRevalidationIssues({
    version: envelope({ architectureStatus: "logical_grouping", serpAssessmentRef: undefined } as unknown as Partial<ArticleDNA>),
    authorizedBrandId: "09762023-d0d4-4c24-b34e-d0fdfd43f891",
  });
  assert.deepEqual(codigos(issues).sort(), ["ARCHITECTURE_NOT_CONFIRMED", "SERP_EVIDENCE_MISSING"]);
});

test("a rota revalida só o caminho de aprovação de ArticleDNA", () => {
  const rota = readFileSync("app/api/arquiteto/artifacts/route.ts", "utf8");
  assert.match(rota, /parsed\.artifactType === "article_dna" && parsed\.status === "approved"/,
    "proposta e rascunho continuam podendo ser gravados incompletos");
  assert.match(rota, /authorizedBrandId: context\.brandId/, "a marca precisa vir do contexto resolvido");
  assert.match(rota, /status: 422/);
  // A revalidação precisa acontecer ANTES da gravação.
  assert.ok(
    rota.indexOf("articleApprovalRevalidationIssues") < rota.indexOf("await appendArquitetoArtifact(context, parsed.artifactType"),
    "revalidar depois de gravar não impediria nada",
  );
});
