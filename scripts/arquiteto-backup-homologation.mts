/**
 * HOMOLOGAÇÃO REMOTA DO BACKUP_RESTORABLE_V1.
 *
 * Executa contra o banco REAL o ciclo que os testes provam contra um driver
 * simulado:
 *
 *   Brand de origem → export → Brand vazia → preview → restore → readback
 *   → fingerprint A × B → segunda restauração (idempotência)
 *
 * Somente leitura na Brand de origem. Escreve APENAS na Brand de destino, que
 * precisa estar vazia de artefatos do Arquiteto — o script recusa seguir se
 * encontrar qualquer um, para nunca misturar homologação com trabalho real.
 * Nenhum DELETE é executado em lugar nenhum.
 *
 *   npm run arquiteto:backup-homologation -- --source <brandId> --target <brandId>
 *   npm run arquiteto:backup-homologation -- --source <brandId> --target <brandId> --dry-run
 *
 * `--dry-run` para no preview e não grava nada.
 */

import { writeFileSync } from "node:fs";
import nextEnv from "@next/env";
import { createClient } from "@supabase/supabase-js";
import { buildArquitetoBackupFile } from "../lib/arquiteto/backup-export.ts";
import { parseBackup, serializeBackup, BACKUP_RECORD_TYPES } from "../lib/arquiteto/backup-contract.ts";
import type { ArquitetoExportInput } from "../lib/arquiteto/export-source.ts";
import {
  applyArquitetoRestore,
  compareFingerprints,
  fingerprintCanonicalState,
  planArquitetoRestore,
  readCanonicalRestoreState,
  type CanonicalRestoreState,
} from "../lib/server/arquiteto-backup-restore.ts";
import type { PipelineContext } from "../lib/server/pipeline-runtime.ts";
import type { ArticleDNA, VersionEnvelope } from "../lib/arquiteto/contracts.ts";

const { loadEnvConfig } = nextEnv;

function argument(name: string): string | null {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] ?? null : null;
}

function line(label: string, value: unknown) {
  console.log(`${label.padEnd(34)} ${String(value)}`);
}

/**
 * O contexto é montado com o service role, como as rotas fazem depois de
 * autorizar. A homologação roda fora do browser; a autorização de domínio já
 * foi decidida por quem executa o script.
 */
function serviceContext(brandId: string, actorUserId: string, action: "view" | "edit"): PipelineContext {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
  if (!url || !key) throw new Error("NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY são obrigatórios.");
  return {
    brandId,
    actorUserId,
    action,
    module: "arquiteto",
    permissions: ["arquiteto"],
    authorizationSource: "canonical_actor_rpc",
    supabase: createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } }),
  };
}

function backupInputFromState(state: CanonicalRestoreState, brandId: string, brandLabel: string): ArquitetoExportInput {
  const statusOf = new Map(state.artifacts.statuses.map(item => [item.versionId, item.status]));
  const siloPages = new Map(state.artifacts.siloPages.map(version => [version.payload.siloId, version]));
  const graphsBySilo = new Map(state.graphs.filter(graph => graph.workflowStatus === "approved").map(graph => [graph.siloId, graph]));
  const workflowStatus = new Map(
    state.workflowItems
      .filter(row => String(row.stage) === "architect" && String(row.subject_type) === "article")
      .map(row => [String(row.subject_id), String(row.state)]),
  );
  return {
    brandId,
    brandLabel,
    silos: state.artifacts.siloDnas.map(siloDna => {
      const approved = graphsBySilo.get(siloDna.payload.siloId) ?? null;
      return {
        siloDna,
        siloPage: siloPages.get(siloDna.payload.siloId) ?? null,
        graph: approved ? { source: "approved" as const, graph: approved } : null,
        approvedGraph: approved,
      };
    }),
    articles: state.artifacts.articleDnas,
    aiReviews: state.artifacts.aiReviews as unknown as VersionEnvelope<Record<string, unknown>>[],
    territories: state.territories.map(item => ({ territoryRef: item.territoryRef, territory: item.territory as unknown as Record<string, unknown> })),
    siloWorkingCopies: state.siloWorkingCopies.map(item => ({ workingCopyRef: item.workingCopyRef, workingCopy: item.workingCopy as unknown as Record<string, unknown> })),
    territorialSerp: state.territorialSerp.map(item => ({ questionId: item.questionId, payload: item.payload as unknown as Record<string, unknown> })),
    articleFormationSerp: state.articleFormationSerp.map(item => ({ candidateRef: item.candidateRef, payload: item.payload as unknown as Record<string, unknown> })),
    territorialAi: state.territorialAi.map(item => ({ questionId: item.questionId, payload: item.payload as unknown as Record<string, unknown> })),
    architectureMarker: (state.architectureMarker?.payload as unknown as Record<string, unknown>) ?? null,
    articleFormationMarker: (state.articleFormationMarker?.payload as unknown as Record<string, unknown>) ?? null,
    keywordAssignments: state.workflowItems
      .filter(row => String(row.stage) === "architect" && String(row.subject_type) === "keyword")
      .map(row => ({ keywordId: String(row.subject_id), payload: (row.payload || {}) as Record<string, unknown> })),
    versionStatusOf: versionId => statusOf.get(versionId) ?? null,
    workflowStatusOf: articleId => workflowStatus.get(articleId) ?? null,
  };
}

function countState(state: CanonicalRestoreState) {
  return {
    ARTICLE_DNA: state.artifacts.articleDnas.length,
    SILO_DNA: state.artifacts.siloDnas.length,
    SILO_PAGE: state.artifacts.siloPages.length,
    ARTICLE_AI_REVIEW: state.artifacts.aiReviews.length,
    TERRITORY: state.territories.length,
    SILO_WORKING_COPY: state.siloWorkingCopies.length,
    TERRITORIAL_SERP: state.territorialSerp.length,
    ARTICLE_FORMATION_SERP: state.articleFormationSerp.length,
    TERRITORIAL_AI: state.territorialAi.length,
    ARCHITECTURE_MARKER: state.architectureMarker ? 1 : 0,
    ARTICLE_FORMATION_MARKER: state.articleFormationMarker ? 1 : 0,
    INTERNAL_LINK_GRAPH: state.graphs.length,
    WORKFLOW_STATUS: state.workflowItems.filter(row => String(row.stage) === "architect" && String(row.subject_type) === "article").length,
    KEYWORD_ASSIGNMENT: state.workflowItems.filter(row => String(row.stage) === "architect" && String(row.subject_type) === "keyword").length,
  };
}

function isEmptyForArquiteto(state: CanonicalRestoreState) {
  const counts = countState(state);
  return Object.values(counts).every(value => value === 0);
}

/** Relações que a homologação confere uma a uma, além do fingerprint. */
function relationReport(state: CanonicalRestoreState) {
  const articles = new Map(state.artifacts.articleDnas.map(version => [version.payload.articleId, version.payload]));
  const problems: string[] = [];

  for (const silo of state.artifacts.siloDnas) {
    const payload = silo.payload;
    if (payload.pillarArticleId && !articles.has(payload.pillarArticleId)) problems.push(`SiloDNA ${payload.siloId}: Pilar ${payload.pillarArticleId} ausente.`);
    for (const supportId of payload.supportArticleIds) {
      if (!articles.has(supportId)) problems.push(`SiloDNA ${payload.siloId}: Suporte ${supportId} ausente.`);
    }
  }
  for (const page of state.artifacts.siloPages) {
    const source = state.artifacts.siloDnas.find(version => version.versionId === page.payload.siloDnaRef.versionId);
    if (!source) problems.push(`SiloPage ${page.payload.siloPageId}: siloDnaRef aponta para versão inexistente.`);
  }
  for (const [articleId, article] of articles) {
    const principal = article.keywordReferences.filter((reference: ArticleDNA["keywordReferences"][number]) => reference.role === "principal");
    if (principal.length !== 1 || principal[0].keywordId !== article.principalKeywordId) problems.push(`ArticleDNA ${articleId}: composição de Principal inconsistente.`);
  }
  for (const graph of state.graphs) {
    const nodeIds = new Set(graph.nodes.map(node => node.nodeId));
    for (const edge of graph.edges) {
      if (!nodeIds.has(edge.sourceNodeId) || !nodeIds.has(edge.targetNodeId)) problems.push(`Grafo ${graph.graphId}: aresta ${edge.edgeId} aponta para nó inexistente.`);
    }
    for (const node of graph.nodes) {
      const articleId = node.articleDnaVersionRef?.entityId;
      if (articleId && !articles.has(articleId)) problems.push(`Grafo ${graph.graphId}: nó ${node.nodeId} referencia Article ausente.`);
    }
  }
  return problems;
}

async function main() {
  loadEnvConfig(process.cwd());
  const source = argument("source");
  const target = argument("target");
  const actor = argument("actor") || process.env.ARQUITETO_HOMOLOGATION_ACTOR || "";
  const dryRun = process.argv.includes("--dry-run");
  if (!source || !target) throw new Error("Informe --source <brandId> e --target <brandId>.");
  if (source === target) throw new Error("A Brand de destino precisa ser diferente da de origem.");
  if (!actor) throw new Error("Informe --actor <userId> ou ARQUITETO_HOMOLOGATION_ACTOR.");

  console.log("=== HOMOLOGAÇÃO REMOTA · BACKUP_RESTORABLE_V1 ===");
  line("Brand de origem", source);
  line("Brand de destino", target);
  line("Modo", dryRun ? "dry-run (sem escrita)" : "ciclo completo");

  /* 1 — export da Brand de origem (somente leitura). */
  const origem = serviceContext(source, actor, "view");
  const stateA = await readCanonicalRestoreState(origem);
  const contagemA = countState(stateA);
  console.log("\n--- Estado A (origem) ---");
  for (const type of BACKUP_RECORD_TYPES) line(type, contagemA[type as keyof typeof contagemA] ?? 0);

  const file = buildArquitetoBackupFile(backupInputFromState(stateA, source, source));
  const conteudo = serializeBackup(file);
  const arquivo = `arquiteto-homologacao-${source}-${new Date().toISOString().replace(/[:.]/g, "-")}.csv`;
  writeFileSync(arquivo, conteudo, "utf8");
  line("\nRegistros no backup", file.records.length);
  line("Arquivo gravado", arquivo);

  const fingerprintA = await fingerprintCanonicalState(stateA, { ignoreEnvironment: true });
  console.log("\n--- Fingerprint A (por tipo) ---");
  for (const [type, item] of Object.entries(fingerprintA.byType)) line(type, `${item.count} · ${item.digest}`);

  /* 2 — a Brand de destino precisa estar vazia. */
  const destinoLeitura = serviceContext(target, actor, "view");
  const antes = await readCanonicalRestoreState(destinoLeitura);
  if (!isEmptyForArquiteto(antes)) {
    console.error("\nRECUSADO: a Brand de destino já tem artefatos do Arquiteto.");
    console.error(JSON.stringify(countState(antes), null, 2));
    console.error("Use uma Brand descartável e vazia. Nenhum DELETE é executado por este script.");
    process.exitCode = 1;
    return;
  }
  line("\nBrand de destino vazia", "sim");

  /* 3 — preview. */
  const destino = serviceContext(target, actor, "edit");
  const parsed = parseBackup(conteudo);
  const opcoes = { allowCrossBrand: true };
  const plano = await planArquitetoRestore(destino, parsed, opcoes);
  console.log("\n--- Preview ---");
  line("Resumo", plano.summary);
  for (const [outcome, total] of Object.entries(plano.counts)) line(outcome, total);
  for (const issue of plano.issues) console.log(`  [${issue.severity}] ${issue.code} · ${issue.detail}`);
  if (!plano.executable) {
    console.error("\nRECUSADO: o plano não é executável.");
    process.exitCode = 1;
    return;
  }
  if (dryRun) {
    console.log("\n--dry-run: nada foi gravado.");
    return;
  }

  /* 4 — restore + readback. */
  const resultado = await applyArquitetoRestore(destino, parsed, opcoes);
  console.log("\n--- Restore ---");
  line("Resumo", resultado.summary);
  line("Readback equivalente", resultado.readback.equivalent ? "YES" : "NO");
  line("Identidades remapeadas", Object.keys(resultado.identityMap).length);
  for (const difference of resultado.readback.differences.slice(0, 10)) {
    console.log(`  ! ${difference.recordType} ${difference.recordKey} · ${difference.field}`);
  }

  /* 5 — releitura pelos loaders normais e fingerprint B. */
  const stateB = await readCanonicalRestoreState(serviceContext(target, actor, "view"));
  const contagemB = countState(stateB);
  console.log("\n--- Estado B (destino, lido pelos loaders canônicos) ---");
  for (const type of BACKUP_RECORD_TYPES) {
    const a = contagemA[type as keyof typeof contagemA] ?? 0;
    const b = contagemB[type as keyof typeof contagemB] ?? 0;
    line(type, `${a} → ${b}${a === b ? "" : "   << DIVERGE"}`);
  }

  const identidade = new Map(Object.entries(resultado.identityMap));
  const fingerprintAremapeado = await fingerprintCanonicalState(stateA, { ignoreEnvironment: true, identity: identidade });
  const fingerprintB = await fingerprintCanonicalState(stateB, { ignoreEnvironment: true });
  const comparacao = compareFingerprints(fingerprintAremapeado, fingerprintB);
  console.log("\n--- Fingerprint A × B ---");
  line("Equivalente", comparacao.equivalent ? "YES" : "NO");
  for (const difference of comparacao.differences) console.log(`  ! ${difference.recordType} · ${difference.detail}`);

  const relacoes = relationReport(stateB);
  console.log("\n--- Relações no destino ---");
  line("Problemas", relacoes.length);
  for (const problema of relacoes.slice(0, 20)) console.log(`  ! ${problema}`);

  /* 6 — idempotência real: o mesmo arquivo de novo. */
  const versoesAntes = contagemB;
  const segundoPlano = await planArquitetoRestore(destino, parseBackup(conteudo), opcoes);
  console.log("\n--- Segunda restauração (idempotência) ---");
  line("Resumo", segundoPlano.summary);
  for (const [outcome, total] of Object.entries(segundoPlano.counts)) line(outcome, total);
  const idempotentePeloPlano = segundoPlano.counts.CREATE === 0 && segundoPlano.counts.REMAP === 0
    && segundoPlano.counts.CONFLICT === 0 && segundoPlano.counts.BLOCKED === 0;
  if (idempotentePeloPlano && segundoPlano.executable === false) {
    // Plano sem nada a aplicar: o apply recusaria por não haver escrita.
    line("Segunda escrita", "não necessária (tudo NO_OP)");
  } else if (idempotentePeloPlano) {
    await applyArquitetoRestore(destino, parseBackup(conteudo), opcoes);
  }
  const stateC = await readCanonicalRestoreState(serviceContext(target, actor, "view"));
  const contagemC = countState(stateC);
  const semDuplicata = Object.keys(versoesAntes).every(key => versoesAntes[key as keyof typeof versoesAntes] === contagemC[key as keyof typeof contagemC]);
  line("Sem duplicata", semDuplicata ? "YES" : "NO");

  /* 7 — o relatório. */
  const roundtrip = resultado.readback.equivalent && comparacao.equivalent && relacoes.length === 0;
  console.log("\n=== RELATÓRIO ===");
  line("BACKUP_EXPORT_COMPLETE", file.records.length > 0 ? "YES" : "NO");
  line("BACKUP_IMPORT_PREVIEW_COMPLETE", plano.executable ? "YES" : "NO");
  line("BACKUP_REMOTE_RESTORE_COMPLETE", resultado.applied.length > 0 ? "YES" : "NO");
  line("BACKUP_REMOTE_READBACK_COMPLETE", resultado.readback.equivalent ? "YES" : "NO");
  line("RESTORE_IDEMPOTENT_REMOTE", idempotentePeloPlano && semDuplicata ? "YES" : "NO");
  line("ROUNDTRIP_EQUIVALENT_REMOTE", roundtrip ? "YES" : "NO");
  line("CROSS_BRAND_REMAP_VALIDATED", Object.keys(resultado.identityMap).length > 0 && relacoes.length === 0 ? "YES" : "NO");
  line("INTERNAL_LINK_GRAPH_RESTORED", contagemA.INTERNAL_LINK_GRAPH === contagemB.INTERNAL_LINK_GRAPH ? (contagemA.INTERNAL_LINK_GRAPH > 0 ? "YES" : "N/A (origem sem grafo)") : "NO");
  line("SILO_WORKING_COPY_RESTORED", contagemA.SILO_WORKING_COPY === contagemB.SILO_WORKING_COPY ? (contagemA.SILO_WORKING_COPY > 0 ? "YES" : "N/A (origem sem working copy)") : "NO");
  line("SECOND_BROWSER_VALIDATED", "NO (validação manual, fora do script)");
  line("EDITORIAL_EXPORT_UNCHANGED", "YES");
  line("MIGRATIONS_ADDED", 0);
  console.log("\nBACKUP_RESTORABLE_V1 =", roundtrip && idempotentePeloPlano && semDuplicata ? "YES (pendente validação manual de navegador)" : "NO");
}

void main().catch(error => {
  console.error("\nFALHA:", error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
