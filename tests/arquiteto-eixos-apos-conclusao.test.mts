import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  APPROVAL_STATE_LABELS,
  WORKFLOW_STATUSES,
  WORKFLOW_STATUS_LABELS,
  resolveArticleRowAxes,
} from "../lib/arquiteto/operational-status.ts";

/**
 * OS DOIS EIXOS DEPOIS DA FORMAÇÃO CONCLUÍDA.
 *
 * A homologação encontrou as duas colunas dizendo "Em processo" pelo MESMO
 * motivo — não existe ArticleDNA —, e a de Status ainda repetia
 * "Aguardando consolidação do Silo" logo abaixo do badge.
 *
 * Aprovação fala do ARTEFATO. Sem artefato não há decisão a relatar: há
 * ausência, e ausência não é um estado de aprovação.
 */

const workspace = readFileSync("modules/arquiteto/arquiteto-workspace.tsx", "utf8");
/* Comentário é prosa: asserção sobre comentário não prova implementação. */
const codigo = workspace
  .split("\n")
  .filter(linha => !linha.trimStart().startsWith("*") && !linha.trimStart().startsWith("//") && !linha.trimStart().startsWith("/*"))
  .join("\n");

const concluidaSemArtigo = {
  canonicalArticleDnaStatus: null,
  hasUncanonicalVersion: false,
  formationConcluded: true,
  published: false,
  sentToRadar: false,
} as const;

/* ============== §1 · aprovação não é status de workflow ================= */

test("§1 — formação concluída sem ArticleDNA: Aprovação é traço, não estado", () => {
  const { approval } = resolveArticleRowAxes(concluidaSemArtigo);
  assert.equal(approval.state, null, "não há artefato sobre o qual decidir");
  assert.equal(approval.label, "—");
  assert.match(approval.hint, /ainda não materializado/);
});

test("§1 — a coluna Aprovação nunca diz palavra do eixo operacional", () => {
  const proibidas = [
    "Em processo",
    "Em processamento",
    "Aguardando consolidação",
    "Aguardando consolidação do Silo",
    "Formação concluída",
    "Aguardando aprovação",
  ];
  for (const cenario of [
    concluidaSemArtigo,
    { ...concluidaSemArtigo, formationConcluded: false },
    { ...concluidaSemArtigo, hasUncanonicalVersion: true },
    { ...concluidaSemArtigo, canonicalArticleDnaStatus: "approved" as const },
  ]) {
    const { approval } = resolveArticleRowAxes(cenario);
    for (const palavra of proibidas) {
      assert.notEqual(approval.label, palavra, `"${palavra}" não é estado de aprovação`);
    }
  }
});

/* ================ §2 · com ArticleDNA, o estado é o real ================ */

test("§2 — só com ArticleDNA a Aprovação mostra Bruto, Aprovado ou Rejeitado", () => {
  const bruto = resolveArticleRowAxes({ ...concluidaSemArtigo, hasUncanonicalVersion: true });
  assert.equal(bruto.approval.state, "BRUTO");
  assert.equal(bruto.approval.label, APPROVAL_STATE_LABELS.BRUTO);

  const aprovado = resolveArticleRowAxes({ ...concluidaSemArtigo, canonicalArticleDnaStatus: "approved" });
  assert.equal(aprovado.approval.state, "APROVADO");
  assert.equal(aprovado.approval.label, APPROVAL_STATE_LABELS.APROVADO);

  const rejeitado = resolveArticleRowAxes({
    ...concluidaSemArtigo,
    canonicalArticleDnaStatus: "rejected",
    hasUncanonicalVersion: true,
  });
  assert.equal(rejeitado.approval.state, "REJEITADO");
  assert.equal(rejeitado.approval.label, APPROVAL_STATE_LABELS.REJEITADO);
});

test("§2 — concluir a formação NÃO deriva Aprovado", () => {
  const { approval } = resolveArticleRowAxes(concluidaSemArtigo);
  assert.notEqual(approval.state, "APROVADO", "formação concluída não aprova artefato nenhum");
  // E a formação sem conclusão chega ao mesmo lugar: quem decide é o artefato.
  const semConclusao = resolveArticleRowAxes({ ...concluidaSemArtigo, formationConcluded: false });
  assert.equal(semConclusao.approval.state, null);
  assert.equal(semConclusao.approval.label, approval.label);
});

/* ==================== §3 · um status, não dois ========================== */

test("§3 — formação concluída sem ArticleDNA: AGUARDANDO_CONSOLIDACAO_DO_SILO", () => {
  const { workflow } = resolveArticleRowAxes(concluidaSemArtigo);
  assert.equal(workflow.status, "AGUARDANDO_CONSOLIDACAO_DO_SILO");
  assert.equal(workflow.label, "Aguardando consolidação do Silo");
  assert.equal(workflow.badge, "awaiting_silo_consolidation");
  assert.notEqual(workflow.badge, "draft", "`draft` se chama 'Em processo': era essa a colisão");
});

test("§3 — sem conclusão e sem artefato o status continua EM_PROCESSAMENTO", () => {
  const { workflow } = resolveArticleRowAxes({ ...concluidaSemArtigo, formationConcluded: false });
  assert.equal(workflow.status, "EM_PROCESSAMENTO");
  assert.equal(workflow.badge, "draft");
});

test("§3 — o contrato conhece o novo status e ele tem rótulo próprio", () => {
  assert.equal((WORKFLOW_STATUSES as readonly string[]).includes("AGUARDANDO_CONSOLIDACAO_DO_SILO"), true);
  assert.equal(WORKFLOW_STATUS_LABELS.AGUARDANDO_CONSOLIDACAO_DO_SILO, "Aguardando consolidação do Silo");
  // O rótulo é único: dois status com a mesma palavra voltariam a colidir.
  const rotulos = Object.values(WORKFLOW_STATUS_LABELS);
  assert.equal(new Set(rotulos).size, rotulos.length);
});

test("§3 — a célula de Status não mostra dois estados concorrentes", () => {
  const status = codigo.indexOf('data-testid="architect-row-operational-status"');
  assert.ok(status > 0, "a célula de Status existe");
  // A linha extra que repetia o mesmo estado abaixo do badge saiu.
  assert.equal(
    codigo.includes('data-testid="architect-formation-conclusion-status"'),
    false,
    "o estado é dito uma vez, pelo badge — não duas vezes na mesma célula",
  );
  // O que sobrou ao lado é coisa DIFERENTE: composição que mudou depois da
  // conclusão, e marca operacional gravada no servidor.
  assert.equal(codigo.includes('data-testid="architect-formation-conclusion-stale"'), true);
  assert.equal(codigo.includes('data-testid="architect-row-workflow-status"'), true);
});

/* ==================== §5/§6 · os dois retratos ========================== */

test("§5 — antes da materialização: Aprovação — · Status Aguardando consolidação do Silo", () => {
  const eixos = resolveArticleRowAxes(concluidaSemArtigo);
  assert.equal(eixos.approval.label, "—");
  assert.equal(eixos.workflow.label, "Aguardando consolidação do Silo");
});

test("§6 — depois do fechamento canônico: Aprovado · Concluído", () => {
  const eixos = resolveArticleRowAxes({
    ...concluidaSemArtigo,
    canonicalArticleDnaStatus: "approved",
    reviewBadge: "approved",
  });
  assert.equal(eixos.approval.label, "Aprovado");
  assert.equal(eixos.workflow.status, "CONCLUIDO");
  assert.equal(eixos.workflow.label, "Concluído");
});

test("§6 — publicado e enviado ao Radar continuam vencendo o derivado", () => {
  const publicado = resolveArticleRowAxes({ ...concluidaSemArtigo, published: true });
  assert.equal(publicado.workflow.badge, "published");
  const enviado = resolveArticleRowAxes({ ...concluidaSemArtigo, sentToRadar: true });
  assert.equal(enviado.workflow.status, "ENVIADO_AO_RADAR");
});

test("a checklist continua sendo a autoridade da revisão quando o artefato existe", () => {
  // Achatar isto apagaria a pendência que a pessoa precisa resolver.
  const emRevisao = resolveArticleRowAxes({
    ...concluidaSemArtigo,
    hasUncanonicalVersion: true,
    reviewBadge: "awaiting_human_review",
  });
  assert.equal(emRevisao.workflow.badge, "awaiting_human_review");
  assert.equal(emRevisao.workflow.status, "AGUARDANDO_CONCLUSAO");
});

/* ============ contrato · uma autoridade para as duas colunas ============ */

test("APPROVAL_STATE_IS_WORKFLOW_STATUS = NO: a tela não projeta mais por conta", () => {
  assert.equal(codigo.includes("const eixos = resolveArticleRowAxes({"), true);
  // A projeção antiga da coluna Aprovação — que devolvia chave operacional —
  // não pode voltar a existir.
  assert.equal(codigo.includes("const articleApprovalStatus = useCallback"), false);
  assert.equal(codigo.includes("const approvalStatus = articleApprovalStatus(art)"), false);
  assert.equal(codigo.includes("<WorkflowStatusBadge status={approvalStatus}"), false);
  // E a célula de Aprovação usa o vocabulário editorial.
  assert.equal(codigo.includes('data-testid="architect-approval-state"'), true);
  assert.equal(codigo.includes("{eixos.approval.label}"), true);
});

test("o badge compartilhado conhece o estado sem inventar rótulo", () => {
  const badge = readFileSync("components/editorial/workflow-status.tsx", "utf8");
  assert.equal(badge.includes("awaiting_silo_consolidation:"), true);
  assert.equal(badge.includes('label: "Aguardando consolidação do Silo"'), true);
});
