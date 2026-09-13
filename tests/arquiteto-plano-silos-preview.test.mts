import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

/**
 * CONFIRMAR ARQUITETURA: UM CLIQUE.
 *
 * Este arquivo travava o contrato inverso — "o primeiro clique mostra, o
 * segundo grava". Ele fazia sentido enquanto `Processar arquitetura` não
 * produzia nada: sem prévia, confirmar aplicaria um plano que ninguém viu.
 *
 * A homologação real de 2026-09-08 cobrou o preço do arranjo: dois botões
 * viraram três operações, o segundo clique recalculava um plano diferente do
 * exibido, e a pessoa ficou sem saber o que tinha sido confirmado.
 *
 * Quem mostra agora é PROCESSAR: ele materializa a proposta e devolve os
 * contadores. CONFIRMAR aplica, uma vez. O que amarra os dois é a identidade
 * do cenário processado — não um clique a mais.
 */

const workspace = readFileSync("modules/arquiteto/arquiteto-workspace.tsx", "utf8");
const confirmar = workspace.slice(
  workspace.indexOf("const confirmArchitecture = async"),
  workspace.indexOf("const handleEditorialUnitDecision") > workspace.indexOf("const confirmArchitecture = async")
    ? workspace.indexOf("const handleEditorialUnitDecision")
    : workspace.length,
);

test("confirmar aplica em UM clique: não existe etapa intermediária", () => {
  // O preview de dois cliques saiu inteiro — estado, banner e assinatura.
  assert.equal(workspace.includes("architecturePlanPreview"), false, "o estado do preview voltou");
  assert.equal(confirmar.includes("assinaturaDoPlano"), false, "a assinatura de dois cliques voltou");
  assert.equal(workspace.includes("Confirmar de novo aplica"), false, "o banner do preview voltou");
  assert.equal(workspace.includes("Pré-visualização · nada foi gravado"), false);
});

test("a confirmação vale para o cenário PROCESSADO, não para outro", () => {
  /*
   * O que a assinatura fazia — amarrar o ato ao plano visto — passou a ser
   * feito pela identidade do cenário processado. A diferença está no
   * desfecho: em vez de pedir um segundo clique sobre um plano recalculado,
   * a recusa manda processar de novo.
   */
  assert.ok(confirmar.includes("if (!architectureMarker) {"));
  assert.ok(confirmar.includes("Processe a arquitetura antes de confirmar."));
  assert.ok(confirmar.includes("if (architectureIsStale) {"));
  assert.ok(confirmar.includes("Processe novamente antes de confirmar."));
});

test("confirmar não fecha plano parcial em silêncio", () => {
  // A homologação real viu "3 atribuições" para 9 keywords, sem explicação
  // sobre as outras seis.
  assert.ok(confirmar.includes("proposalCoversScope(architectureProposal)"));
  assert.ok(confirmar.includes("if (!cobertura.ok) {"));
});

test("quebra de estrutura aprovada continua sendo recusa, não aviso", () => {
  assert.ok(confirmar.includes("if (impactoEstrutural.blocked.length) {"));
  assert.ok(confirmar.includes('showNotification("error", impactoEstrutural.summary);'));
  // Bloqueado registra o impacto e PARA: não deixa nada pendente para "confirmar de novo".
  assert.ok(confirmar.includes("setArchitectureImpactAck(impactoEstrutural);"));
});

test("a tela mostra o estado de cada SiloPage no painel da fase", () => {
  // A cópia que vivia dentro do preview era duplicata: a leitura canônica é
  // a do painel, alimentada pelo mesmo `siloPagePreflight`.
  const painel = readFileSync("modules/arquiteto/architecture-panel.tsx", "utf8");
  assert.ok(painel.includes('data-testid="architect-silopage-preflight"'));
  assert.ok(painel.includes("{preflight.map(silo => ("));
  assert.ok(workspace.includes("preflight={siloPagePreflight}"));
});

test("o impacto sobre Article aprovado continua nomeando quem perde o quê", () => {
  assert.match(workspace, /data-testid="architect-territory-impact-preview"/);
  assert.match(workspace, /data-testid="architect-territory-plan-rows"/);
  // "1/3 → 3/3" é a leitura que o Planejador pediu para a restauração.
  assert.match(workspace, /\{item\.alignedBefore\}\/\{item\.keywordCountBefore\} → \{item\.alignedAfter\}\/\{item\.keywordCountBefore\}/);
});

/* ============ a restauração respeita a decisão humana =================== */

test("o reagrupamento parte de humanFormationRef e humanRole, não de similaridade", () => {
  // Restaurar o território não pode disparar heurística: o baseline são as
  // decisões humanas já persistidas em cada keyword.
  assert.match(workspace, /humanFormationRef: resolveArticleFormationState\(keyword\)\.formationRef/);
  assert.match(workspace, /humanRole: resolveArticleFormationState\(keyword\)\.decision\?\.role \?\? null/);
});

/* ============ a auditoria de drift lê a versão aprovada ================= */

test("audit:drift compara contra a versão APROVADA, ignorando proposta no-op", () => {
  const drift = readFileSync("scripts/arquiteto-audit-drift.mts", "utf8");
  assert.match(drift, /\.filter\(row => row\.status === "approved"\)/);
  // E entre as aprovadas, a de maior número — a canônica.
  assert.match(drift, /if \(!atual \|\| row\.version_number > atual\.version_number\) vigentes\.set\(row\.entity_id, row\)/);
});
